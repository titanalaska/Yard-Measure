/* Yard Measure service worker.
 *
 * The job this does is narrow and worth stating: a crew reaches a site with no
 * signal and needs the app to open anyway. GPS, the area maths, saved jobs and
 * the snapshot all work with no network — the only thing that genuinely needs
 * one is fresh aerial imagery.
 *
 * Three caching rules, chosen per-resource rather than one blanket policy:
 *
 *   app shell   network-first  — so a deploy lands immediately when online,
 *                                but the last good copy opens when offline.
 *   libraries   cache-first    — MapLibre is ~900KB and versioned in the URL,
 *                                so it never needs revalidating.
 *   map tiles   cache-first    — with a hard cap, because imagery is unbounded
 *                                and would otherwise eat the origin's quota.
 *
 * Bump CACHE_VERSION on deploy; old caches are dropped on activate.
 */

const CACHE_VERSION = 'v4';
const SHELL_CACHE = `ym-shell-${CACHE_VERSION}`;
const LIB_CACHE = `ym-lib-${CACHE_VERSION}`;
const TILE_CACHE = `ym-tiles-${CACHE_VERSION}`;

// Keep this well under the ~50MB a browser will typically allow an origin.
const MAX_TILES = 500;

const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

const LIB_HOSTS = ['unpkg.com'];
const TILE_HOSTS = ['www.ancgis.com', 'maps.matsugov.us', 'services.arcgisonline.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is all-or-nothing; one 404 would leave the app with no offline
      // copy at all, so each entry is allowed to fail on its own.
      .then(cache => Promise.all(SHELL.map(url =>
        cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, LIB_CACHE, TILE_CACHE];
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n.startsWith('ym-') && !keep.includes(n))
        .map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Oldest-first eviction. Cache API keys come back in insertion order, so the
// front of the list is the least recently added.
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

async function cacheFirst(request, cacheName, cap) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Opaque responses (no CORS) report status 0 and can't be inspected; every
  // host here sends CORS headers, so anything opaque is a misconfiguration
  // and shouldn't be cached as if it were good.
  if (res && res.status === 200 && res.type !== 'opaque') {
    await cache.put(request, res.clone());
    if (cap) trimCache(cacheName, cap);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request) || await cache.match('./index.html');
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Geocoding is a live lookup — a cached answer for a different address would
  // be worse than an honest failure.
  if (url.hostname === 'api.tomtom.com') return;

  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, TILE_CACHE, MAX_TILES).catch(() => Response.error()));
    return;
  }

  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, LIB_CACHE).catch(() => Response.error()));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }
});
