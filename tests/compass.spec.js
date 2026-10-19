// The compass (Matt, 10/18/26).
//
// Tracing snow maps for Girdwood sites he had never stood on, Matt had no way
// to tell which way was north. The map has always been able to turn -- a
// two-finger twist on a phone -- but the compass was switched off, so a
// turned map gave no sign of it and had no way back.
//
// So these pin down what the arrow MEANS, not how it is drawn: where its tip
// points on screen for a given map bearing, and that a tap puts north back at
// the top. The direction is read off the transform the browser actually
// applies, so it holds whatever CSS produced it.

const { test, expect } = require('@playwright/test');
const { loadApp, rect } = require('./helpers');

async function openMap(page) {
  await page.addInitScript(() => {
    // Skip the location explainer; it is not what these tests are about.
    localStorage.setItem('yardMeasureLocationConsent', 'no');
  });
  await loadApp(page);
  await page.waitForFunction(() => typeof map !== 'undefined' && map && map.getContainer());
}

const compass = (page) => page.locator('#yard-map .maplibregl-ctrl-compass');

// Where the arrow's tip points on screen, as a unit vector: x to the right,
// y DOWN, so straight up is (0, -1). Taking the difference of two transformed
// points keeps only the rotation, whatever the transform origin.
const arrowDirection = (page) => page.evaluate(() => {
  const icon = document.querySelector('#yard-map .maplibregl-ctrl-compass .maplibregl-ctrl-icon');
  const t = getComputedStyle(icon).transform;
  const m = t === 'none' ? new DOMMatrix() : new DOMMatrix(t);
  const a = m.transformPoint(new DOMPoint(0, 0));
  const b = m.transformPoint(new DOMPoint(0, -1));
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
});

async function expectArrow(page, x, y) {
  await expect.poll(async () => {
    const d = await arrowDirection(page);
    return Math.abs(d.x - x) < 0.01 && Math.abs(d.y - y) < 0.01 ? 'ok' : `(${d.x.toFixed(3)}, ${d.y.toFixed(3)})`;
  }).toBe('ok');
}

test('the map has a compass, and with north at the top it points straight up', async ({ page }) => {
  await openMap(page);
  await expect(compass(page)).toBeVisible();
  await expectArrow(page, 0, -1);
});

test('the arrow turns with the map, to wherever north now is', async ({ page }) => {
  await openMap(page);
  await expect(compass(page)).toBeVisible();

  // East at the top of the screen. Facing east, north is on your left.
  await page.evaluate(() => map.jumpTo({ bearing: 90 }));
  await expectArrow(page, -1, 0);

  // South-west at the top. North is 360 - 225 = 135 degrees clockwise from
  // straight ahead: behind and to the right, so down-right on screen,
  // (sin 135, -cos 135) = (0.707, 0.707). An arrow turned the wrong way
  // would point down-LEFT, (-0.707, 0.707).
  await page.evaluate(() => map.jumpTo({ bearing: 225 }));
  await expectArrow(page, Math.SQRT1_2, Math.SQRT1_2);
});

test('a tap on the compass puts north back at the top, and lays the map flat', async ({ page }) => {
  // A two-finger drag tilts the map as easily as a twist turns it, and a
  // tilted aerial is no better to trace on than a turned one.
  await openMap(page);
  await page.evaluate(() => map.jumpTo({ bearing: 90, pitch: 30 }));
  await compass(page).click();
  await expect.poll(() => page.evaluate(() => Math.round(map.getBearing()))).toBe(0);
  await expect.poll(() => page.evaluate(() => Math.round(map.getPitch()))).toBe(0);
  await expectArrow(page, 0, -1);
});

test('the compass still works on a locked map', async ({ page }) => {
  // Lock stops the map moving under a finger. Like + and -, the compass moves
  // it on purpose, so it has to keep working -- a PM who locked the map and
  // then found it turned would otherwise have to unlock it to fix it.
  await openMap(page);
  await page.evaluate(() => { setMapLocked(true); map.jumpTo({ bearing: 90 }); });
  await compass(page).click();
  await expect.poll(() => page.evaluate(() => Math.round(map.getBearing()))).toBe(0);
});

// ── The snapshot's arrow (Matt, 10/18/26: "Yes, add the N") ──
//
// The live compass is a page element, so it never reaches the picture a PM
// saves for BuilderTrend or the crew. The snapshot draws its own, fixed and
// pointing up -- which is only true because the capture turns the map north-up
// and flat first. Both halves are pinned here.

// A blank, transparent 1 x 1 PNG for every aerial tile, so no test waits on
// the network. Not an aborted request: MapLibre logs a failed tile as a
// console error, which loadApp() rightly treats as a broken page. The CORS
// header keeps the capture readable, as real imagery is.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// A measured 100 x 50 ft lot, with blank tiles. No cut-outs: they are the
// only other red on the card.
async function snapshotReady(page) {
  await page.route(/^https?:/, (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: BLANK_PNG,
    headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  await openMap(page);
  await page.waitForFunction(() => mapReady, null, { timeout: 15000 });
  await page.evaluate((pins) => {
    pins.forEach((p) => addPin({ lat: p.lat, lng: p.lng, accuracy: 2, src: 'map' }));
  }, rect(0, 0, 100, 50));
}

// Runs the Snapshot button's own work and keeps the picture it would have
// saved: toBlob is where the finished image leaves the page.
async function takeSnapshot(page) {
  await page.evaluate(async () => {
    navigator.canShare = () => false; // no share sheet in a test browser
    const real = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      window.__snapshot = this;
      return real.apply(this, args);
    };
    await exportSnapshot();
  });
}

// Exact-colour pixels in the top-right corner of the snapshot's map card, and
// the average height of each colour. Only the inside of a filled shape comes
// out exact, so nothing anti-aliased can pass for the arrow.
//
// Where the card is, from exportSnapshot(): the picture is 1080 wide and the
// card runs x 40 to 1040; its top is 150 (header) + 340 (result) + 50 + 20
// = 560. The corner checked is its top-right 120 x 120: x 920-1040, y 560-680.
const cardCorner = (page) => page.evaluate(() => {
  const c = window.__snapshot;
  const d = c.getContext('2d').getImageData(920, 560, 120, 120).data;
  const t = { red: 0, redY: 0, grey: 0, greyY: 0 };
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.floor(i / 4 / 120);
    if (d[i] === 0xc0 && d[i + 1] === 0x39 && d[i + 2] === 0x2b) { t.red++; t.redY += y; }   // #c0392b
    if (d[i] === 0x55 && d[i + 1] === 0x55 && d[i + 2] === 0x55) { t.grey++; t.greyY += y; } // #555
  }
  return { width: c.width, red: t.red, grey: t.grey, redY: t.redY / (t.red || 1), greyY: t.greyY / (t.grey || 1) };
});

// The arrow in that corner, pointing up. On paper, at its scale of
// 34 x 1.3 / 19 = 2.33 px per unit of the 29-unit glyph (5.4 px per unit
// squared): the red N (about 22.7 units) and north half (7.2 x 6 / 2 = 21.6)
// fill about 240 px, the grey south half about 117 -- fewer counting only
// exact pixels, so the floors below sit well under both. The red's centre is
// at y 8.4 of the glyph and the grey's at 16.5, so north-up puts red ABOVE
// grey; an arrow drawn upside down would swap them.
async function expectNorthArrow(page) {
  const k = await cardCorner(page);
  expect(k.width).toBe(1080);
  expect(k.red).toBeGreaterThan(100);
  expect(k.grey).toBeGreaterThan(40);
  expect(k.redY).toBeLessThan(k.greyY);
}

test('the snapshot is taken with north at the top and the map flat, then the view is put back', async ({ page }) => {
  await snapshotReady(page);
  const seen = await page.evaluate(async () => {
    map.jumpTo({ bearing: 90, pitch: 30 });
    // captureMap() reads the canvas once the map has settled: note how the
    // map stood at that moment.
    let at = null;
    map.getCanvas = function () {
      at = at || { bearing: Math.round(map.getBearing()), pitch: Math.round(map.getPitch()) };
      return maplibregl.Map.prototype.getCanvas.call(this);
    };
    const cap = await captureMap();
    delete map.getCanvas;
    return { captured: !!cap, at, after: { bearing: Math.round(map.getBearing()), pitch: Math.round(map.getPitch()) } };
  });
  expect(seen.captured).toBe(true);
  expect(seen.at).toEqual({ bearing: 0, pitch: 0 });
  // The PM's own view comes back: the snapshot never leaves the map turned.
  expect(seen.after).toEqual({ bearing: 90, pitch: 30 });
});

test('the snapshot carries a north arrow in the map card\'s top-right corner', async ({ page }) => {
  await snapshotReady(page);
  await takeSnapshot(page);
  await expectNorthArrow(page);
});

test('the offline snapshot, with no map picture, carries the north arrow too', async ({ page }) => {
  // No photo to capture (offline, imagery blocked) draws the outline on its
  // own -- still north-up, since project() puts north at the top.
  await snapshotReady(page);
  await page.evaluate(() => { mapReady = false; });
  await takeSnapshot(page);
  await expectNorthArrow(page);
});

// MapLibre titles its own buttons in English, inside the map, which the
// Spanish pass skips -- so a test of the pass alone would never see these.
async function spanishMap(page) {
  await page.addInitScript(() => localStorage.setItem('yardMeasureLang', 'es'));
  await openMap(page);
}

test('the compass and zoom buttons say what they do in Spanish', async ({ page }) => {
  await spanishMap(page);
  await expect(compass(page)).toHaveAttribute('title', 'Brújula — toca para poner el norte arriba');
  await expect(compass(page)).toHaveAttribute('aria-label', 'Brújula — toca para poner el norte arriba');
  await expect(page.locator('#yard-map .maplibregl-ctrl-zoom-in')).toHaveAttribute('title', 'Acercar');
  await expect(page.locator('#yard-map .maplibregl-ctrl-zoom-out')).toHaveAttribute('title', 'Alejar');
});

test('switching to English puts the map buttons back in English', async ({ page }) => {
  await spanishMap(page);
  await expect(compass(page)).toHaveAttribute('title', 'Brújula — toca para poner el norte arriba');
  await page.click('#lang-btn');
  await expect(compass(page)).toHaveAttribute('title', 'Compass — tap to put north at the top');
  await expect(compass(page)).toHaveAttribute('aria-label', 'Compass — tap to put north at the top');
  await expect(page.locator('#yard-map .maplibregl-ctrl-zoom-in')).toHaveAttribute('title', 'Zoom in');
});
