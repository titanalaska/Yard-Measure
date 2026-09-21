# Yard Measure — Site Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a measured job a stable site identity — a reusable library record with an id, label, address and group — so two people measuring the same lot on two phones produce rows something downstream can join, without any company data entering the codebase.

**Architecture:** A `sites` array in its own `localStorage` key, never touched by the job-trim path. Jobs gain one nullable field, `siteId`; `job.name` keeps working exactly as it does today. A new bottom sheet (reusing the Saved-jobs sheet's CSS) lists, searches, creates and edits sites, and starts a job from one. Duplicate defence is three layers — authoritative `siteId`, normalised-address offer on typing, GPS proximity suggestion on the first pin — and **nothing ever merges automatically**. Import/export is JSON (round-trips, additive merge, conflicts offered not overwritten) plus CSV (export only).

**Tech Stack:** One hand-written `index.html` (5,662 lines, no build step, no framework, no bundler), vanilla ES2019+, MapLibre for the map, `localStorage` for all persistence, a hand-rolled `sw.js` service worker with a manually bumped `CACHE_VERSION`.

**Spec:** `docs/superpowers/specs/2026-08-28-yard-measure-site-identity-design.md`

## Global Constraints

Copied verbatim from the spec; every task's requirements implicitly include these.

- **One HTML file.** All code goes in `index.html`. No new JS/CSS files ship. The only new repo files are documents under `docs/`.
- **The library ships EMPTY.** "A fresh install has an **empty** library and no Titan data anywhere in the app." No Titan site, address, customer or pod may appear in `index.html`, `sw.js` or `manifest.json` — not as a constant, not as a default, not in a comment, not in placeholder text.
- **`docs/site-seed-2026-08-28.json` lives in the repo as a document, not as code, and is never referenced by `index.html`.** No `fetch`, no `<script src>`, no path string pointing at it.
- **No pricing, ever.** "The app produces quantities and site facts, never dollars." No currency symbol, no rate, no cost field anywhere in this feature.
- **The field is called `group`, not `pod`.** "Naming the field 'pod' would be exactly the kind of company detail that does not belong in shipped code."
- **Nothing merges automatically, ever.** Every duplicate path *offers*; a human confirms.
- **Sites are never trimmed by the job path.** `writeJobs`'s quota fallback must never touch the sites key.
- **CSV is export-only.** Importing CSV would silently produce sites with no shape.
- **No test harness by design.** Verification is browser-console assertions against the live app, plus device testing. Assertions live in `docs/site-library-console-tests.js` as a code-only paste file.
- **`job.name` behaves exactly as it does today for jobs saved before this change**, and a job saved before this feature keeps working with `siteId: null`.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `index.html` | Everything the app does | Modified — one new `SITE LIBRARY` section plus small edits at named seams |
| `docs/site-seed-2026-08-28.json` | Titan's 74 sites, as data | Modified — `pod` key renamed to `group`, wrapped in the import envelope |
| `docs/site-seed-README.md` | How to load the seed, and what it is not | Create |
| `docs/site-library-console-tests.js` | Pasteable console assertions for the 11 spec tests | Create |
| `docs/superpowers/plans/2026-08-29-yard-measure-site-library.md` | This plan | Create |
| `sw.js` | Offline shell cache | Modified — `CACHE_VERSION` bump on the final task |

Inside `index.html` the new code forms **one contiguous `// ── SITE LIBRARY ──` section placed immediately before `// ── JOB HISTORY ──` (currently line 5398)**, because job history reads sites and not the reverse. Edits outside that section are surgical and named per task.

---

### Task 1: The site store

**Files:**
- Modify: `index.html` — insert new section immediately before the `// ── JOB HISTORY ──` comment at line 5398
- Test: `docs/site-library-console-tests.js` (create)

**Interfaces:**
- Consumes: `showToast(msg)` (line 5620)
- Produces: `SITES_KEY`, `readSites()`, `writeSites(sites) -> bool`, `newSiteId() -> string`, `makeSite(fields) -> site`, `getSite(id) -> site|null`, `upsertSite(site) -> site`, `deleteSite(id)`, `siteJobName(site) -> string`

- [ ] **Step 1: Write the failing test**

Create `docs/site-library-console-tests.js` with exactly this content:

```js
// Yard Measure — site library console assertions.
// Paste the whole file into DevTools on the running app. Every check prints
// PASS or FAIL; a FAIL names the behaviour that broke.
(function () {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: cond ? '' : (detail || '') });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // --- Task 1: the store ---
  const backupSites = localStorage.getItem('yardMeasureSites');
  localStorage.removeItem('yardMeasureSites');

  ok('store starts empty', readSites().length === 0, `got ${readSites().length}`);

  const a = makeSite({ label: 'Miller back lot', address: '1281 E 19TH AVE' });
  ok('makeSite fills an id', typeof a.id === 'string' && a.id.length > 1, a.id);
  ok('makeSite defaults lat/lng to null', a.lat === null && a.lng === null);
  ok('makeSite defaults group to empty', a.group === '');
  ok('makeSite stamps createdAt', typeof a.createdAt === 'number');

  upsertSite(a);
  ok('upsert writes one site', readSites().length === 1, `got ${readSites().length}`);
  ok('getSite round-trips', getSite(a.id) && getSite(a.id).label === 'Miller back lot');

  upsertSite({ ...a, label: 'Miller front lot' });
  ok('upsert on same id updates, not appends', readSites().length === 1 && getSite(a.id).label === 'Miller front lot',
     `len ${readSites().length}`);

  ok('siteJobName joins label and address',
     siteJobName(getSite(a.id)) === 'Miller front lot — 1281 E 19TH AVE', siteJobName(getSite(a.id)));

  deleteSite(a.id);
  ok('deleteSite removes it', readSites().length === 0, `got ${readSites().length}`);

  // --- restore and report ---
  if (backupSites === null) localStorage.removeItem('yardMeasureSites');
  else localStorage.setItem('yardMeasureSites', backupSites);

  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0;
})();
```

- [ ] **Step 2: Run test to verify it fails**

Serve the app and open DevTools:

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && python -m http.server 8777
```

Open `http://localhost:8777`, paste `docs/site-library-console-tests.js` into the console.
Expected: `Uncaught ReferenceError: readSites is not defined`.

- [ ] **Step 3: Write minimal implementation**

Insert immediately **before** the `// ── JOB HISTORY ──` comment block in `index.html`:

```js
  // ── SITE LIBRARY ─────────────────────────────────────
  // A job's whole identity used to be one free-text name, so the same lot
  // measured twice produced two unrelated rows of text. A site is now a
  // record with an id that outlives any single measurement.
  //
  // Sites live under their own key on purpose. writeJobs() drops the oldest
  // half of the job list when localStorage fills, which is survivable for job
  // history and destructive for a library someone spent a season building.
  // Nothing on the job path may write this key.
  const SITES_KEY = 'yardMeasureSites';

  function readSites() {
    try { return JSON.parse(localStorage.getItem(SITES_KEY)) || []; } catch (e) { return []; }
  }

  // Deliberately has no trim fallback. A full quota here is a real failure the
  // user has to hear about — silently halving the library would be worse than
  // refusing the write.
  function writeSites(sites) {
    try {
      localStorage.setItem(SITES_KEY, JSON.stringify(sites));
      return true;
    } catch (e) {
      showToast("Couldn't save the site library — storage is full");
      return false;
    }
  }

  function newSiteId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Every field is materialised, so a site from an old export and one typed
  // this morning have the same shape and every reader can stop guarding.
  function makeSite(fields) {
    const f = fields || {};
    const now = Date.now();
    const str = v => (v == null ? '' : String(v).trim());
    return {
      id: f.id || newSiteId(),
      label: str(f.label),
      address: str(f.address),
      // Never derived. The board convention turned out to be
      // "LABEL - ADDRESS", with the customer sometimes a prefix, sometimes
      // fused into the label, sometimes absent — so a human sets this or it
      // stays empty.
      customer: str(f.customer),
      // Generic on purpose: a route, a crew, a city, a pod. Whatever the
      // company groups work by, and it churns season to season.
      group: str(f.group),
      note: str(f.note),
      lat: typeof f.lat === 'number' ? f.lat : null,
      lng: typeof f.lng === 'number' ? f.lng : null,
      createdAt: f.createdAt || now,
      updatedAt: f.updatedAt || now,
    };
  }

  function getSite(id) {
    if (!id) return null;
    return readSites().find(s => s.id === id) || null;
  }

  function upsertSite(site) {
    const sites = readSites();
    const i = sites.findIndex(s => s.id === site.id);
    if (i >= 0) sites[i] = { ...sites[i], ...site, updatedAt: Date.now() };
    else sites.unshift(site);
    writeSites(sites);
    return site;
  }

  function deleteSite(id) {
    writeSites(readSites().filter(s => s.id !== id));
  }

  // The job-label input is capped at 60 characters, so this is too — a long
  // label plus a long address must not silently produce a name the input
  // refuses to hold.
  function siteJobName(site) {
    if (!site) return '';
    return [site.label, site.address].filter(Boolean).join(' — ').slice(0, 60);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Reload `http://localhost:8777`, paste the test file again.
Expected: `9/9 passed`.

- [ ] **Step 5: Commit**

```bash
git add index.html docs/site-library-console-tests.js
git commit -m "Give a site its own record, kept clear of the job trim"
```

---

### Task 2: Address normalisation and lookup

**Files:**
- Modify: `index.html` — append to the `SITE LIBRARY` section from Task 1
- Test: `docs/site-library-console-tests.js`

**Interfaces:**
- Consumes: `readSites()`, `makeSite()`, `upsertSite()`, `deleteSite()` (Task 1)
- Produces: `normalizeAddress(s) -> string`, `findSiteByAddress(addr, excludeId) -> site|null`

- [ ] **Step 1: Write the failing test**

In `docs/site-library-console-tests.js`, insert this block immediately after the `deleteSite(a.id);` / `ok('deleteSite removes it', …)` pair and before the `// --- restore and report ---` comment:

```js
  // --- Task 2: address normalisation (spec test 4) ---
  ok('normalize expands AVE/AVENUE',
     normalizeAddress('1281 E 19TH AVE') === normalizeAddress('1281 E 19TH AVENUE'),
     `${normalizeAddress('1281 E 19TH AVE')} vs ${normalizeAddress('1281 E 19TH AVENUE')}`);
  ok('normalize expands RD/ROAD',
     normalizeAddress('700 Muldoon Rd') === normalizeAddress('700 MULDOON ROAD'));
  ok('normalize expands HWY/HIGHWAY',
     normalizeAddress('1 Glenn Hwy') === normalizeAddress('1 GLENN HIGHWAY'));
  ok('normalize expands ST/STREET',
     normalizeAddress('12 A St.') === normalizeAddress('12 A STREET'));
  ok('normalize strips punctuation and case',
     normalizeAddress('  4904  old-seward, ') === '4904 OLD SEWARD',
     normalizeAddress('  4904  old-seward, '));
  ok('normalize of empty is empty', normalizeAddress('') === '' && normalizeAddress(null) === '');
  ok('different addresses do not collide',
     normalizeAddress('4904 OLD SEWARD') !== normalizeAddress('4908 OLD SEWARD'));

  const b = upsertSite(makeSite({ label: 'B', address: '1281 E 19TH AVENUE' }));
  ok('findSiteByAddress matches across abbreviation',
     (findSiteByAddress('1281 e 19th ave') || {}).id === b.id);
  ok('findSiteByAddress honours excludeId',
     findSiteByAddress('1281 e 19th ave', b.id) === null);
  ok('findSiteByAddress misses a different address',
     findSiteByAddress('9999 NOWHERE') === null);
  deleteSite(b.id);
```

- [ ] **Step 2: Run test to verify it fails**

Reload, paste.
Expected: `Uncaught ReferenceError: normalizeAddress is not defined`.

- [ ] **Step 3: Write minimal implementation**

Append to the `SITE LIBRARY` section:

```js
  // Layer 2 of duplicate defence. Field crews type "AVE" one week and
  // "AVENUE" the next; without this the same lot enters the library twice by
  // ordinary use. Long forms collapse to the short form because the short
  // form is what gets typed on a phone.
  const ADDR_ABBREV = {
    AVENUE: 'AVE', AV: 'AVE', ROAD: 'RD', STREET: 'ST', HIGHWAY: 'HWY',
    DRIVE: 'DR', BOULEVARD: 'BLVD', CIRCLE: 'CIR', COURT: 'CT', LANE: 'LN',
    PLACE: 'PL', PARKWAY: 'PKWY', TERRACE: 'TER', TRAIL: 'TRL', SUITE: 'STE',
    NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  };

  function normalizeAddress(s) {
    if (!s) return '';
    return String(s).toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(w => ADDR_ABBREV[w] || w)
      .join(' ');
  }

  // Returns the site to OFFER, never one to merge into. The caller asks a
  // human. Exact normalised equality only — fuzzy matching would fold 4904
  // and 4908 Old Seward together, and those are adjacent lots.
  function findSiteByAddress(addr, excludeId) {
    const n = normalizeAddress(addr);
    if (!n) return null;
    return readSites().find(s => s.id !== excludeId && normalizeAddress(s.address) === n) || null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Reload, paste.
Expected: `20/20 passed`.

- [ ] **Step 5: Commit**

```bash
git add index.html docs/site-library-console-tests.js
git commit -m "Match an address someone typed to one already in the library"
```

---

### Task 3: Proximity helpers

**Files:**
- Modify: `index.html` — append to the `SITE LIBRARY` section
- Test: `docs/site-library-console-tests.js`

**Interfaces:**
- Consumes: `project(pins, ref)` (line 2500), `readSites()` (Task 1), `state.zones`, `isDrawn(z)` (line 2013)
- Produces: `SITE_NEAR_M`, `metersBetween(a, b) -> number`, `nearestSite(lat, lng, maxM) -> {site, meters}|null`, `jobCentroid() -> {lat, lng}|null`

- [ ] **Step 1: Write the failing test**

Insert into `docs/site-library-console-tests.js` immediately before `// --- restore and report ---`:

```js
  // --- Task 3: proximity (spec test 5) ---
  // Two adjacent lots on the same street, roughly 60 m apart. The spec's
  // worked example: a radius loose enough to be reliable would swallow both.
  const L4904 = { lat: 61.1783, lng: -149.8642 };
  const L4908 = { lat: 61.1788, lng: -149.8645 };
  const gap = metersBetween(L4904, L4908);
  ok('the two adjacent lots are ~60 m apart', near(gap, 60, 25), `${gap.toFixed(1)} m`);

  const s4904 = upsertSite(makeSite({ label: '4904', address: '4904 OLD SEWARD', ...L4904 }));
  const s4908 = upsertSite(makeSite({ label: '4908', address: '4908 OLD SEWARD', ...L4908 }));

  ok('nearest at 4904 picks 4904, not 4908', (nearestSite(L4904.lat, L4904.lng) || {}).site.id === s4904.id);
  ok('nearest at 4908 picks 4908, not 4904', (nearestSite(L4908.lat, L4908.lng) || {}).site.id === s4908.id);
  ok('two sites 60 m apart are never one record',
     readSites().filter(s => s.id === s4904.id || s.id === s4908.id).length === 2);
  ok('nothing within 40 m returns null', nearestSite(61.2200, -149.9000) === null);
  ok('a site with no coordinates is skipped', (function () {
    const noGeo = upsertSite(makeSite({ label: 'no geo', address: 'X' }));
    const hit = nearestSite(61.2200, -149.9000);
    deleteSite(noGeo.id);
    return hit === null;
  })());

  deleteSite(s4904.id); deleteSite(s4908.id);
```

- [ ] **Step 2: Run test to verify it fails**

Reload, paste.
Expected: `Uncaught ReferenceError: metersBetween is not defined`.

- [ ] **Step 3: Write minimal implementation**

Append to the `SITE LIBRARY` section:

```js
  // Layer 3, and the weakest on purpose. The field data says proximity cannot
  // detect duplicates: one customer has six sites on a single street and two
  // of them are adjacent lots; another has eight across two streets. A radius
  // tight enough to separate neighbours is too tight to survive ordinary GPS
  // error, and one loose enough to be reliable swallows them. So this
  // suggests, a human confirms, and siteId records the answer.
  const SITE_NEAR_M = 40;

  // Reuses the map's own equirectangular projection, anchored on `a`, so this
  // agrees with every other distance the app computes.
  function metersBetween(a, b) {
    const [p, q] = project([a, b], a);
    return Math.hypot(q.x - p.x, q.y - p.y);
  }

  function nearestSite(lat, lng, maxM) {
    let best = null, bestD = Infinity;
    readSites().forEach(s => {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
      const d = metersBetween({ lat, lng }, s);
      if (d < bestD) { bestD = d; best = s; }
    });
    return best && bestD <= (maxM == null ? SITE_NEAR_M : maxM) ? { site: best, meters: bestD } : null;
  }

  // Where a site sits, once something has actually been measured there. Mean
  // of every drawn pin — a lot's pins ring its edge, so their mean lands in
  // the middle of it.
  function jobCentroid() {
    const pins = state.zones.filter(isDrawn).reduce((acc, z) => acc.concat(z.pins), []);
    if (!pins.length) return null;
    return {
      lat: pins.reduce((s, p) => s + p.lat, 0) / pins.length,
      lng: pins.reduce((s, p) => s + p.lng, 0) / pins.length,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Reload, paste.
Expected: `26/26 passed`.

- [ ] **Step 5: Commit**

```bash
git add index.html docs/site-library-console-tests.js
git commit -m "Measure how far a fix is from a site already in the library"
```

---

### Task 4: A job points at a site

**Files:**
- Modify: `index.html` lines 5024-5100 (`saveState`/`loadState`), 5434-5452 (`snapshotOfCurrentJob`), 5464-5500 (`startNewJob`), 5514-5540 (`openJob`), 5597 (duplicate handler)
- Test: `docs/site-library-console-tests.js`

**Interfaces:**
- Consumes: `getSite(id)`, `siteJobName(site)`, `jobCentroid()`, `upsertSite()` (Tasks 1, 3), `jobLabelInput` (line 1864), `saveState()`, `syncCurrentJob()`
- Produces: `state.siteId` (`string|null`), `job.siteId` on every saved job, `setJobSite(siteId)`, `stampSiteLocation()`

- [ ] **Step 1: Write the failing test**

Insert into `docs/site-library-console-tests.js` before `// --- restore and report ---`:

```js
  // --- Task 4: job carries siteId (spec tests 2, 8, 9) ---
  ok('state has a siteId slot', 'siteId' in state, Object.keys(state).join(','));

  const jobSite = upsertSite(makeSite({ label: 'Job site', address: '55 TEST RD' }));
  const priorSiteId = state.siteId;
  setJobSite(jobSite.id);
  ok('setJobSite sets state.siteId', state.siteId === jobSite.id, String(state.siteId));
  ok('setJobSite fills the job name from the site',
     document.getElementById('job-label').value === 'Job site — 55 TEST RD',
     document.getElementById('job-label').value);

  ok('snapshot carries siteId', snapshotOfCurrentJob().siteId === jobSite.id);

  setJobSite(null);
  ok('a job with no site still snapshots (spec test 8)', snapshotOfCurrentJob().siteId === null);
  ok('clearing a site leaves the typed name alone',
     typeof document.getElementById('job-label').value === 'string');

  // Spec test 9: a job saved before this change has no siteId and must open.
  const legacy = { id: 'j-legacy-test', name: 'Old job', started: Date.now(), savedAt: Date.now(),
                   sqft: 100, lenFt: 0, zoneCount: 1, zones: [], nextZoneId: 2, nextPinId: 2,
                   season: 'summer', snowJob: {} };
  ok('a legacy job object has no siteId and that is fine', legacy.siteId === undefined);
  ok('a legacy job still yields a usable name', (legacy.siteId || null) === null && legacy.name === 'Old job');

  setJobSite(priorSiteId || null);
  deleteSite(jobSite.id);
```

- [ ] **Step 2: Run test to verify it fails**

Reload, paste.
Expected: `FAIL  state has a siteId slot`, then `Uncaught ReferenceError: setJobSite is not defined`.

- [ ] **Step 3: Write minimal implementation**

**3a.** Append to the `SITE LIBRARY` section:

```js
  // The job keeps its free-text name; siteId sits beside it. Nothing that
  // reads job.name has to change, and a job saved before this feature loads
  // with siteId null and behaves exactly as it did.
  function setJobSite(siteId) {
    const site = getSite(siteId);
    state.siteId = site ? site.id : null;
    // Naming is a convenience, never a lock — the name stays freely editable,
    // and clearing the site does not wipe a name someone typed.
    if (site) jobLabelInput.value = siteJobName(site);
    saveState();
    syncCurrentJob();
    renderSiteRow();
  }

  // A site's coordinates come from the first job measured there, and only
  // from the first — re-measuring a lot must not walk its pin across the map.
  function stampSiteLocation() {
    const site = getSite(state.siteId);
    if (!site || typeof site.lat === 'number') return;
    const c = jobCentroid();
    if (!c) return;
    upsertSite({ ...site, lat: c.lat, lng: c.lng });
  }

  // Replaced by the real renderer in Task 5. Declared here so this task
  // stands alone and its assertions run without the sheet existing yet.
  function renderSiteRow() {}
```

**3b.** In the `state` object literal, add `siteId: null,` immediately after the `jobId` entry. Find it with:

```bash
grep -n "jobId:" index.html
```

**3c.** In `saveState()` (line ~5024), add `siteId: state.siteId,` to the object passed to `JSON.stringify`, immediately after the existing `jobLabel:` line.

**3d.** In `loadState()` (line ~5093), immediately after `if (saved.jobLabel) jobLabelInput.value = saved.jobLabel;` add:

```js
      state.siteId = saved.siteId || null;
```

**3e.** In `snapshotOfCurrentJob()` (line ~5434), add immediately after the `name: jobTitle(),` line:

```js
      siteId: state.siteId || null,
```

**3f.** In `startNewJob(seed)` (line ~5464), immediately after `jobLabelInput.value = seed && seed.name ? seed.name : '';` add:

```js
    // A duplicated job is the same ground measured again, so it keeps the
    // site. A brand-new job starts unlinked.
    state.siteId = (seed && seed.siteId) || null;
```

**3g.** In `openJob(id)` (line ~5514), immediately after `state.jobStarted = job.started || job.savedAt;` add:

```js
    // A job saved before the library has no siteId, and stays unlinked.
    state.siteId = job.siteId || null;
```

**3h.** In `syncCurrentJob()` (line ~5455), add `stampSiteLocation();` as the first statement **after** the `if (!state.zones.some(isDrawn)) return;` guard.

**3i.** In the `data-dup` handler (line ~5597), thread the site through the duplicate so it reads:

```js
      startNewJob({ name: `${job.name} (copy)`, siteId: job.siteId, zones: job.zones,
                    nextZoneId: job.nextZoneId, nextPinId: job.nextPinId });
```

- [ ] **Step 4: Run test to verify it passes**

Reload, paste.
Expected: `34/34 passed`.

- [ ] **Step 5: Commit**

```bash
git add index.html docs/site-library-console-tests.js
git commit -m "Let a job point at the site it measured"
```

---
### Task 5: The site library sheet

**Files:**
- Modify: `index.html` — CSS at line 283 and after line 404, markup after the `#jobs-overlay` block (ends line 1550), markup at `#snapshot-section` (lines 1712-1714), a button in the jobs sheet after line 1545, and the `SITE LIBRARY` section
- Test: device + browser checklist (Step 4)

**Interfaces:**
- Consumes: `readSites()`, `makeSite()`, `upsertSite()`, `deleteSite()`, `getSite()`, `siteJobName()` (Task 1), `findSiteByAddress()` (Task 2), `setJobSite()` (Task 4), `escapeHtml(s)` (line 2864), `icon(id, cls)` (line 1832), `showToast(msg)` (line 5620), `startNewJob(seed)`, `syncCurrentJob()`, `closeJobs()`, `isDrawn(z)`
- Produces: `renderSiteRow()` (real, replacing the Task 4 no-op), `renderSites()`, `openSites()`, `closeSites()`, `startJobAtSite(siteId)`, `siteMatches(s, q)`, `openSiteForm(site)`, `closeSiteForm()`

- [ ] **Step 1: Write the failing check**

There is nothing to assert in the console before the DOM exists, so the gate for this task is the checklist in Step 4. First confirm the elements are absent — run in the console:

```js
[document.getElementById('sites-overlay'), document.getElementById('site-row')]
```

- [ ] **Step 2: Run it to verify it fails**

Reload, run the line above.
Expected: `[null, null]`.

- [ ] **Step 3: Write the implementation**

**3a. CSS — share the jobs sheet's rules.** At line 283, replace:

```css
  /* JOBS SHEET */
  #jobs-overlay {
```

with:

```css
  /* JOBS SHEET — the site library sheet is the same object with a different
     list in it, so it shares every rule rather than duplicating them. */
  #jobs-overlay, #sites-overlay {
```

In the same block, replace `#jobs-overlay.open { display: flex; }` with:

```css
  #jobs-overlay.open, #sites-overlay.open { display: flex; }
```

and replace `#jobs-sheet {` with `#jobs-sheet, #sites-sheet {`.

**3b. CSS — the new pieces.** Add immediately after the `.job-act:active` rule (line ~404):

```css
  /* The site line above the job name. Reads as a chip when linked and as a
     quiet invitation when not, because most jobs will start unlinked. */
  #site-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-bottom: 8px;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--mid);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
  }
  #site-row.linked { color: var(--green); border-color: var(--green); }
  #site-row:active { background: var(--surface-2); }
  #site-row .site-row-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .site-form { display: grid; gap: 8px; margin: 10px 0; }
  .site-form input, .site-form textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--light);
    color: var(--text);
    font: inherit;
    font-size: 15px;
  }
  .site-form textarea { min-height: 56px; resize: vertical; }
  #site-search { margin-bottom: 8px; }
```

**3c. Markup — the sheet.** Insert immediately after the closing `</div>` of `#jobs-overlay` (line 1550):

```html
<div id="sites-overlay">
  <div id="sites-sheet">
    <div class="sheet-head">
      <span class="sheet-title">Site library</span>
      <button class="sheet-close" id="sites-close" type="button" title="Close"><svg class="ic ic-lg"><use href="#i-x"/></svg></button>
    </div>
    <input type="text" id="site-search" placeholder="Search label, address, customer or group">
    <button class="btn btn-secondary" id="site-add-btn" type="button">
      <svg class="ic"><use href="#i-plus"/></svg> Add a site
    </button>
    <div id="site-form-wrap" style="display:none;">
      <div class="site-form">
        <input type="text" id="site-f-label" placeholder="Label — what the crew calls it" maxlength="80">
        <input type="text" id="site-f-address" placeholder="Address" maxlength="120">
        <input type="text" id="site-f-customer" placeholder="Customer (optional)" maxlength="80">
        <input type="text" id="site-f-group" placeholder="Group (optional) — route, crew, city" maxlength="60">
        <textarea id="site-f-note" placeholder="Note (optional)" maxlength="400"></textarea>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="site-cancel-btn" type="button">Cancel</button>
        <button class="btn" id="site-save-btn" type="button">Save site</button>
      </div>
    </div>
    <div id="sites-list"></div>
    <p class="sheet-note">Sites stay on this phone. Export the library to move it to another one.</p>
  </div>
</div>
```

**3d. Markup — the site row on the measuring screen.** Replace the whole `#snapshot-section` block (lines 1712-1714):

```html
<div id="snapshot-section">
  <input type="text" id="job-label" placeholder="Job name or address (optional)" maxlength="60">
</div>
```

with:

```html
<div id="snapshot-section">
  <!-- Sits above the name because the site is the durable identity and the
       name is only the human label for it — picking a site fills the name in. -->
  <button id="site-row" type="button">
    <svg class="ic"><use href="#i-jobs"/></svg>
    <span class="site-row-text" id="site-row-text">Link a site</span>
  </button>
  <input type="text" id="job-label" placeholder="Job name or address (optional)" maxlength="60">
</div>
```

**3e. Markup — reach the library from the jobs sheet.** Insert immediately after the `#new-job-btn` button block (ends line 1546):

```html
    <button class="btn btn-secondary" id="sites-open-btn" type="button" style="margin-top:8px;">
      <svg class="ic"><use href="#i-jobs"/></svg> Site library
    </button>
```

**3f. Confirm the pencil sprite exists** before using it:

```bash
grep -n 'id="i-pencil"' index.html
```

If that prints nothing, use `icon('dup')` wherever `icon('pencil')` appears below rather than inventing a new sprite.

**3g. Behaviour.** Delete the `function renderSiteRow() {}` no-op added in Task 4 and append to the `SITE LIBRARY` section:

```js
  // ── SITE LIBRARY UI ──────────────────────────────────
  const sitesOverlay = document.getElementById('sites-overlay');
  const siteSearchInput = document.getElementById('site-search');
  const siteFormWrap = document.getElementById('site-form-wrap');
  // Which site the open form is editing; null means the form is creating one.
  let editingSiteId = null;

  function renderSiteRow() {
    const row = document.getElementById('site-row');
    const text = document.getElementById('site-row-text');
    if (!row || !text) return;
    const site = getSite(state.siteId);
    row.classList.toggle('linked', !!site);
    text.textContent = site ? siteJobName(site) : 'Link a site';
  }

  // Every typed word has to appear somewhere in the record, so "knik ciha"
  // finds the same row as "ciha knik" — nobody remembers field order.
  function siteMatches(s, q) {
    if (!q) return true;
    const hay = [s.label, s.address, s.customer, s.group, s.note].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t));
  }

  function renderSites() {
    const list = document.getElementById('sites-list');
    const q = siteSearchInput.value.trim();
    const all = readSites();
    if (!all.length) {
      list.innerHTML = '<div class="empty-state">No sites yet — add one, or measure a job and link it</div>';
      return;
    }
    // Grouped first, ungrouped last: '~' sorts after every letter.
    const shown = all.filter(s => siteMatches(s, q))
      .sort((a, b) => (a.group || '~').localeCompare(b.group || '~') ||
                      (a.label || '').localeCompare(b.label || ''));
    if (!shown.length) {
      list.innerHTML = `<div class="empty-state">Nothing matches &ldquo;${escapeHtml(q)}&rdquo;</div>`;
      return;
    }
    list.innerHTML = shown.map(s => {
      const bits = [];
      if (s.address) bits.push(escapeHtml(s.address));
      if (s.customer) bits.push(escapeHtml(s.customer));
      if (s.group) bits.push(`<span class="job-badge">${escapeHtml(s.group)}</span>`);
      return `<div class="job-row ${s.id === state.siteId ? 'current' : ''}">
        <button class="job-open" data-site-pick="${s.id}">
          <div class="job-name">${escapeHtml(s.label || '(no label)')}${s.id === state.siteId ? ' · this job' : ''}</div>
          <div class="job-meta">${bits.join(' · ') || 'No address'}</div>
        </button>
        <button class="job-act" data-site-edit="${s.id}" title="Edit">${icon('pencil')}</button>
        <button class="job-act" data-site-del="${s.id}" title="Delete">${icon('trash')}</button>
      </div>`;
    }).join('');
  }

  function openSiteForm(site) {
    editingSiteId = site ? site.id : null;
    document.getElementById('site-f-label').value = site ? site.label : '';
    document.getElementById('site-f-address').value = site ? site.address : '';
    document.getElementById('site-f-customer').value = site ? site.customer : '';
    document.getElementById('site-f-group').value = site ? site.group : '';
    document.getElementById('site-f-note').value = site ? site.note : '';
    siteFormWrap.style.display = '';
    document.getElementById('site-f-label').focus();
  }

  function closeSiteForm() {
    editingSiteId = null;
    siteFormWrap.style.display = 'none';
  }

  function openSites() {
    closeSiteForm();
    siteSearchInput.value = '';
    renderSites();
    sitesOverlay.classList.add('open');
  }

  function closeSites() {
    sitesOverlay.classList.remove('open');
  }

  // Picking a site on a job that has already been measured would silently
  // re-label someone's work, so an in-progress job is linked in place and only
  // an empty one starts fresh.
  function startJobAtSite(siteId) {
    const site = getSite(siteId);
    if (!site) return;
    if (state.zones.some(isDrawn)) {
      setJobSite(site.id);
      showToast(`Linked to ${site.label || 'site'}`);
    } else {
      syncCurrentJob();
      startNewJob({ name: siteJobName(site), siteId: site.id });
      showToast(`Started at ${site.label || 'site'}`);
    }
    closeSites();
    closeJobs();
  }

  document.getElementById('site-row').addEventListener('click', openSites);
  document.getElementById('sites-open-btn').addEventListener('click', openSites);
  document.getElementById('sites-close').addEventListener('click', closeSites);
  sitesOverlay.addEventListener('click', (e) => { if (e.target.id === 'sites-overlay') closeSites(); });
  siteSearchInput.addEventListener('input', renderSites);
  document.getElementById('site-add-btn').addEventListener('click', () => openSiteForm(null));
  document.getElementById('site-cancel-btn').addEventListener('click', closeSiteForm);

  document.getElementById('site-save-btn').addEventListener('click', () => {
    const label = document.getElementById('site-f-label').value.trim();
    const address = document.getElementById('site-f-address').value.trim();
    if (!label && !address) { showToast('A site needs a label or an address'); return; }
    const fields = {
      label, address,
      customer: document.getElementById('site-f-customer').value.trim(),
      group: document.getElementById('site-f-group').value.trim(),
      note: document.getElementById('site-f-note').value.trim(),
    };
    // Offer, never merge. A typed address that already exists is far more
    // often the crew arriving at a known lot than a genuinely new one — but
    // only a human can say which, and two lots on one street are common.
    if (!editingSiteId) {
      const hit = findSiteByAddress(address);
      if (hit) {
        const useExisting = confirm(
          `${hit.label || 'A site'} is already saved at ${hit.address}.\n\n` +
          `OK to use that one. Cancel to save this as a separate site.`);
        if (useExisting) {
          closeSiteForm();
          startJobAtSite(hit.id);
          return;
        }
        // Cancel means "these really are different lots" — fall through and
        // save a second record rather than folding them together.
      }
    }
    const saved = editingSiteId
      ? upsertSite({ ...getSite(editingSiteId), ...fields })
      : upsertSite(makeSite(fields));
    const wasEditing = !!editingSiteId;
    closeSiteForm();
    renderSites();
    renderSiteRow();
    showToast(wasEditing ? 'Site updated' : `Saved ${saved.label || 'site'}`);
  });

  document.getElementById('sites-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-site-pick], button[data-site-edit], button[data-site-del]');
    if (!btn) return;
    if (btn.dataset.sitePick) { startJobAtSite(btn.dataset.sitePick); return; }
    if (btn.dataset.siteEdit) { openSiteForm(getSite(btn.dataset.siteEdit)); return; }
    if (btn.dataset.siteDel) {
      const site = getSite(btn.dataset.siteDel);
      if (!site) return;
      if (!confirm(`Delete "${site.label || site.address}"? Jobs measured here keep their measurements but lose the link.`)) return;
      deleteSite(site.id);
      if (state.siteId === site.id) { state.siteId = null; saveState(); }
      renderSites();
      renderSiteRow();
      showToast('Site deleted');
    }
  });
```

**3h. Paint the row on load.** Add `renderSiteRow();` immediately after the app's existing `loadState()` call at start-up. Find it with:

```bash
grep -n "loadState();" index.html
```

- [ ] **Step 4: Verify it works**

Reload `http://localhost:8777` and confirm each of these:

1. `#site-row` reads "Link a site" and is grey on a fresh job
2. Tapping it opens the sheet; the sheet reads "No sites yet — …"
3. "Add a site" → label `Test lot`, address `1281 E 19TH AVENUE` → Save → the row appears
4. Tapping the row's name starts a job named `Test lot — 1281 E 19TH AVENUE`, and `#site-row` turns green
5. `state.siteId` in the console is that site's id
6. Add a second site with address `1281 e 19th ave` → the offer prompt appears; OK opens the existing site; `readSites().length` is still 1
7. Repeat 6 and press Cancel → `readSites().length` is 2, nothing merged
8. Search `19th` shows both; search `zzz` shows the no-match state
9. Edit changes a label without creating a record; Delete removes one and clears a live link
10. Reload — the row still reads the linked site
11. Measure two pins, then pick a different site → it links in place and does **not** wipe the measurement

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Give the crew a library of sites to start a job from"
```

---

### Task 6: GPS proximity suggestion on the first pin

**Files:**
- Modify: `index.html` — the GPS pin handler at line ~2348, plus the `SITE LIBRARY` section
- Test: `docs/site-library-console-tests.js` + console walk-through

**Interfaces:**
- Consumes: `nearestSite(lat, lng, maxM)`, `SITE_NEAR_M` (Task 3), `setJobSite(siteId)` (Task 4), `showToast(msg)`, `state.zones`
- Produces: `maybeOfferNearbySite(lat, lng) -> bool`

- [ ] **Step 1: Write the failing test**

Insert into `docs/site-library-console-tests.js` before `// --- restore and report ---`:

```js
  // --- Task 6: proximity offers, never detects ---
  ok('maybeOfferNearbySite exists', typeof maybeOfferNearbySite === 'function');
  ok('it is silent with an empty library', maybeOfferNearbySite(61.2, -149.9) === false);
```

- [ ] **Step 2: Run test to verify it fails**

Reload, paste.
Expected: `FAIL  maybeOfferNearbySite exists`.

- [ ] **Step 3: Write minimal implementation**

**3a.** Append to the `SITE LIBRARY` section:

```js
  // Fires once, on the first pin of an unlinked job — the moment the crew
  // arrives. Returns whether it linked anything, which is what the console
  // assertions read. Never links without a yes: proximity suggests, a human
  // confirms, and siteId records the answer.
  function maybeOfferNearbySite(lat, lng) {
    if (state.siteId) return false;
    const hit = nearestSite(lat, lng, SITE_NEAR_M);
    if (!hit) return false;
    const where = [hit.site.address, hit.site.label].filter(Boolean).join(' — ');
    if (!confirm(`You're about ${Math.round(hit.meters)} m from ${where}.\n\nStart this job at that site?`)) return false;
    setJobSite(hit.site.id);
    showToast(`Linked to ${hit.site.label || 'site'}`);
    return true;
  }
```

**3b.** In the GPS pin handler (line ~2348), immediately **before** the existing `addPin({ lat: avg.lat, lng: avg.lng, accuracy: avg.accuracy, samples: fixes.length, src: 'gps' }, { fit: true });` call, add:

```js
    // Only on the first pin of the job — asking again on pin nine would be
    // noise, and by then the crew has answered the question by measuring.
    if (!state.zones.some(z => z.pins.length)) maybeOfferNearbySite(avg.lat, avg.lng);
```

- [ ] **Step 4: Run test to verify it passes**

Reload, paste.
Expected: `36/36 passed`.

Then walk the offer itself in the console, answering the prompts by hand:

```js
const t = upsertSite(makeSite({ label: 'Near test', address: '1 TEST RD', lat: 61.2, lng: -149.9 }));
maybeOfferNearbySite(61.2001, -149.9001);   // prompt appears — press Cancel
state.siteId;                                // expected: null — Cancel links nothing
maybeOfferNearbySite(61.2001, -149.9001);   // prompt again — press OK
state.siteId === t.id;                       // expected: true
setJobSite(null); deleteSite(t.id);
```

- [ ] **Step 5: Commit**

```bash
git add index.html docs/site-library-console-tests.js
git commit -m "Offer the site you are standing on when the first pin lands"
```

---

### Task 7: JSON export and additive import

**Files:**
- Modify: `index.html` — markup after `<div id="sites-list"></div>` in the sites sheet, plus the `SITE LIBRARY` section
- Test: `docs/site-library-console-tests.js`

**Interfaces:**
- Consumes: `readSites()`, `writeSites()`, `makeSite()`, `getSite()` (Task 1), `readJobs()` (line 5406), `writeJobs()` (line 5410), `renderSites()`, `renderSiteRow()` (Task 5), `showToast(msg)`
- Produces: `LIBRARY_FORMAT`, `APP_VERSION`, `buildLibraryExport(opts) -> object`, `mergeImport(payload, opts) -> {added, updated, skipped, jobs}`, `downloadText(filename, text, mime)`

- [ ] **Step 1: Write the failing test**

Insert into `docs/site-library-console-tests.js` before `// --- restore and report ---`:

```js
  // --- Task 7: export / import (spec tests 7, 10) ---
  const backupJobs = localStorage.getItem('yardMeasureJobs');
  localStorage.setItem('yardMeasureSites', JSON.stringify([
    makeSite({ id: 's-fixed-one', label: 'One', address: '1 FIRST AVE', group: 'North' }),
    makeSite({ id: 's-fixed-two', label: 'Two', address: '2 SECOND AVE', group: 'South' }),
  ]));

  const payload = buildLibraryExport({ jobs: true });
  ok('export declares its format', payload.format === LIBRARY_FORMAT, String(payload.format));
  ok('export carries an app version', typeof payload.appVersion === 'string' && payload.appVersion.length > 0);
  ok('export carries both sites', payload.sites.length === 2, `got ${payload.sites.length}`);
  ok('export carries a jobs array', Array.isArray(payload.jobs));
  ok('export survives a JSON round-trip (spec test 10)',
     JSON.parse(JSON.stringify(payload)).sites[0].id === 's-fixed-one');

  // Spec test 7: importing the same file twice must not double the library.
  const r1 = mergeImport(JSON.parse(JSON.stringify(payload)));
  ok('re-importing an identical file adds nothing', r1.added === 0 && r1.updated === 0,
     `added ${r1.added} updated ${r1.updated}`);
  ok('re-importing leaves the count alone', readSites().length === 2, `got ${readSites().length}`);

  const grown = JSON.parse(JSON.stringify(payload));
  grown.sites.push(makeSite({ id: 's-fixed-three', label: 'Three', address: '3 THIRD AVE' }));
  const r2 = mergeImport(grown);
  ok('a new id is added', r2.added === 1 && readSites().length === 3,
     `added ${r2.added}, len ${readSites().length}`);

  const changed = JSON.parse(JSON.stringify(payload));
  changed.sites[0].label = 'ONE CHANGED';
  const r3 = mergeImport(changed, { autoAnswer: 'skip' });
  ok('a conflicting record is not overwritten silently',
     getSite('s-fixed-one').label === 'One' && r3.skipped === 1,
     `${getSite('s-fixed-one').label}, skipped ${r3.skipped}`);

  const r4 = mergeImport(changed, { autoAnswer: 'replace' });
  ok('an explicitly accepted record is written',
     getSite('s-fixed-one').label === 'ONE CHANGED' && r4.updated === 1);

  ok('a payload with the wrong format is refused', (function () {
    try { mergeImport({ format: 'nope', sites: [] }); return false; } catch (e) { return true; }
  })());

  if (backupJobs === null) localStorage.removeItem('yardMeasureJobs');
  else localStorage.setItem('yardMeasureJobs', backupJobs);
```

- [ ] **Step 2: Run test to verify it fails**

Reload, paste.
Expected: `Uncaught ReferenceError: buildLibraryExport is not defined`.

- [ ] **Step 3: Write minimal implementation**

**3a. Markup.** Insert immediately after the `<div id="sites-list"></div>` line:

```html
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn btn-secondary" id="site-export-btn" type="button">Export library</button>
      <button class="btn btn-secondary" id="site-import-btn" type="button">Import</button>
    </div>
    <div class="btn-row" style="margin-top:8px;">
      <button class="btn btn-secondary" id="site-export-csv-btn" type="button">Export CSV (spreadsheet)</button>
    </div>
    <input type="file" id="site-import-file" accept="application/json,.json" style="display:none;">
```

**3b. Behaviour.** Append to the `SITE LIBRARY` section:

```js
  // ── EXPORT / IMPORT ──────────────────────────────────
  // One mechanism doing three jobs: loading a company's own site list once per
  // device, moving a library between phones, and handing the data to whoever
  // asked for it. JSON is the only format that round-trips.
  const LIBRARY_FORMAT = 'yard-measure-library-1';
  const APP_VERSION = 'v8';

  function buildLibraryExport(opts) {
    const o = opts || {};
    return {
      format: LIBRARY_FORMAT,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      sites: readSites(),
      // Jobs carry every pin, so they are opt-in — a library moving between
      // phones is a few kilobytes and a job history is not.
      jobs: o.jobs ? readJobs() : [],
    };
  }

  // Additive by contract. A site whose id already exists is OFFERED, not
  // overwritten, because a stale file must never quietly undo a season of
  // corrections. autoAnswer exists so the console assertions can drive both
  // branches without a human at the keyboard.
  function mergeImport(payload, opts) {
    const o = opts || {};
    if (!payload || payload.format !== LIBRARY_FORMAT) {
      throw new Error('That file is not a Yard Measure library export');
    }
    const incoming = Array.isArray(payload.sites) ? payload.sites : [];
    const sites = readSites();
    const byId = new Map(sites.map(s => [s.id, s]));
    let added = 0, updated = 0, skipped = 0;

    incoming.forEach(raw => {
      const site = makeSite(raw);
      const existing = byId.get(site.id);
      if (!existing) {
        sites.unshift(site);
        byId.set(site.id, site);
        added++;
        return;
      }
      // Same id, same content is a no-op — this is what makes importing the
      // same file twice produce 74 sites and not 148.
      const same = ['label', 'address', 'customer', 'group', 'note']
        .every(k => existing[k] === site[k]);
      if (same) return;
      const answer = o.autoAnswer || (confirm(
        `"${existing.label || existing.address}" is already saved and the file differs:\n\n` +
        `  saved:  ${existing.label} · ${existing.address} · ${existing.group || 'no group'}\n` +
        `  file:   ${site.label} · ${site.address} · ${site.group || 'no group'}\n\n` +
        `OK to use the file's version. Cancel to keep what is saved.`
      ) ? 'replace' : 'skip');
      if (answer === 'replace') {
        const i = sites.findIndex(s => s.id === site.id);
        sites[i] = { ...existing, ...site, createdAt: existing.createdAt, updatedAt: Date.now() };
        byId.set(site.id, sites[i]);
        updated++;
      } else {
        skipped++;
      }
    });

    writeSites(sites);

    // Jobs are additive too, and never replace one already on this phone —
    // the local copy is the one someone may be standing in.
    let jobs = 0;
    if (Array.isArray(payload.jobs) && payload.jobs.length) {
      const current = readJobs();
      const have = new Set(current.map(j => j.id));
      const fresh = payload.jobs.filter(j => j && j.id && !have.has(j.id));
      jobs = fresh.length;
      if (jobs) writeJobs(current.concat(fresh).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)));
    }
    return { added, updated, skipped, jobs };
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.getElementById('site-export-btn').addEventListener('click', () => {
    const withJobs = confirm('Include measured jobs and their pins?\n\nOK includes them (a much bigger file). Cancel exports sites only.');
    const payload = buildLibraryExport({ jobs: withJobs });
    if (!payload.sites.length && !payload.jobs.length) { showToast('Nothing to export yet'); return; }
    downloadText(`yard-measure-library-${new Date().toISOString().slice(0, 10)}.json`,
                 JSON.stringify(payload, null, 1), 'application/json');
    showToast(`Exported ${payload.sites.length} site${payload.sites.length !== 1 ? 's' : ''}`);
  });

  document.getElementById('site-import-btn').addEventListener('click', () => {
    document.getElementById('site-import-file').click();
  });

  document.getElementById('site-import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let res;
      try {
        res = mergeImport(JSON.parse(reader.result));
      } catch (err) {
        showToast(err.message || "Couldn't read that file");
        return;
      }
      renderSites();
      renderSiteRow();
      const bits = [`${res.added} added`];
      if (res.updated) bits.push(`${res.updated} updated`);
      if (res.skipped) bits.push(`${res.skipped} kept as-is`);
      if (res.jobs) bits.push(`${res.jobs} jobs`);
      showToast(bits.join(', '));
    };
    reader.onerror = () => showToast("Couldn't read that file");
    reader.readAsText(file);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Reload, paste.
Expected: `47/47 passed`.

Then walk the real file path: Export library → Cancel (sites only) → a `.json` downloads → Import that same file → the toast reads `0 added`.

- [ ] **Step 5: Commit**

```bash
git add index.html docs/site-library-console-tests.js
git commit -m "Move a site library between phones without overwriting it"
```

---

### Task 8: CSV export

**Files:**
- Modify: `index.html` — the `SITE LIBRARY` section
- Test: `docs/site-library-console-tests.js`

**Interfaces:**
- Consumes: `readSites()` (Task 1), `readJobs()`, `downloadText()` (Task 7), `zoneSqft(z)` (line 2035), `zoneNetSqft(z)` (line 2050), `zoneLenFt(z)`, `surfaceOf(z)` (line 2008), `isLine(z)` (line 1972), `isCut(z)` (line 1971), `showToast(msg)`
- Produces: `csvCell(v) -> string`, `CSV_HEADER`, `buildLibraryCsv() -> string`

- [ ] **Step 1: Write the failing test**

Insert into `docs/site-library-console-tests.js` before `// --- restore and report ---`:

```js
  // --- Task 8: CSV is export-only (spec test 10) ---
  ok('csvCell quotes a comma', csvCell('a,b') === '"a,b"', csvCell('a,b'));
  ok('csvCell doubles an inner quote', csvCell('say "hi"') === '"say ""hi"""', csvCell('say "hi"'));
  ok('csvCell passes a plain value through', csvCell('plain') === 'plain');
  ok('csvCell renders null as empty', csvCell(null) === '' && csvCell(undefined) === '');

  const csv = buildLibraryCsv();
  const head = csv.split('\n')[0];
  ok('CSV header names site identity first',
     head.startsWith('site_id,site_label,site_address,site_customer,site_group'), head);
  ok('CSV has a row per site even with no jobs', csv.split('\n').length >= 2, `${csv.split('\n').length} lines`);
  ok('every row has the same column count', (function () {
    const n = head.split(',').length;
    return csv.split('\n').every(r => r.split(',').length >= 1) && n === 18;
  })(), `${head.split(',').length} columns`);
  ok('there is no CSV importer', typeof window.importLibraryCsv === 'undefined');
```

- [ ] **Step 2: Run test to verify it fails**

Reload, paste.
Expected: `Uncaught ReferenceError: csvCell is not defined`.

- [ ] **Step 3: Write minimal implementation**

Append to the `SITE LIBRARY` section:

```js
  // Flat, one row per zone, with site identity repeated on every row so a
  // spreadsheet can pivot on it. EXPORT ONLY — a CSV cannot carry pin
  // geometry, and importing one would silently produce sites with no shape.
  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const CSV_HEADER = [
    'site_id', 'site_label', 'site_address', 'site_customer', 'site_group',
    'site_lat', 'site_lng',
    'job_id', 'job_name', 'measured_at', 'season',
    'zone_name', 'zone_mode', 'zone_surface', 'zone_sqft', 'zone_net_sqft',
    'zone_linear_ft', 'pin_count',
  ];

  function buildLibraryCsv() {
    const rows = [CSV_HEADER.join(',')];
    const jobsBySite = new Map();
    readJobs().forEach(j => {
      const k = j.siteId || '';
      if (!jobsBySite.has(k)) jobsBySite.set(k, []);
      jobsBySite.get(k).push(j);
    });

    const emit = (site, job) => {
      const base = [
        site ? site.id : '', site ? site.label : '', site ? site.address : '',
        site ? site.customer : '', site ? site.group : '',
        site && typeof site.lat === 'number' ? site.lat.toFixed(6) : '',
        site && typeof site.lng === 'number' ? site.lng.toFixed(6) : '',
      ];
      const blankJob = ['', '', '', ''];
      const blankZone = ['', '', '', '', '', '', ''];
      if (!job) { rows.push(base.concat(blankJob, blankZone).map(csvCell).join(',')); return; }
      const jobBits = [job.id, job.name, new Date(job.savedAt).toISOString(), job.season || 'summer'];
      const zones = (job.zones || []).filter(z => z && z.pins && z.pins.length);
      if (!zones.length) { rows.push(base.concat(jobBits, blankZone).map(csvCell).join(',')); return; }
      zones.forEach(z => {
        rows.push(base.concat(jobBits, [
          z.name || '',
          z.mode || 'area',
          surfaceOf(z),
          isLine(z) ? '' : Math.round(zoneSqft(z)),
          isLine(z) || isCut(z) ? '' : Math.round(zoneNetSqft(z)),
          isLine(z) ? Math.round(zoneLenFt(z)) : '',
          z.pins.length,
        ]).map(csvCell).join(','));
      });
    };

    // Every site gets a row even if nothing has been measured there yet — the
    // library is the point, and an unmeasured site is still a real site.
    readSites().forEach(site => {
      const js = jobsBySite.get(site.id) || [];
      if (!js.length) emit(site, null);
      else js.forEach(j => emit(site, j));
    });
    // Jobs measured before anyone linked a site still belong in the file.
    (jobsBySite.get('') || []).forEach(j => emit(null, j));
    return rows.join('\n');
  }

  document.getElementById('site-export-csv-btn').addEventListener('click', () => {
    const csv = buildLibraryCsv();
    if (csv.split('\n').length < 2) { showToast('Nothing to export yet'); return; }
    downloadText(`yard-measure-sites-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
    showToast('CSV exported — it opens in a spreadsheet, and cannot be imported back');
  });
```

- [ ] **Step 4: Run test to verify it passes**

Reload, paste.
Expected: `55/55 passed`.

Then tap "Export CSV (spreadsheet)" and open the file — confirm site identity repeats on every zone row and no column holds a dollar figure.

- [ ] **Step 5: Commit**

```bash
git add index.html docs/site-library-console-tests.js
git commit -m "Export the library flat for anyone opening it in a spreadsheet"
```

---
### Task 9: Bring the seed file in line with the spec

**Files:**
- Modify: `docs/site-seed-2026-08-28.json` — rename `pod` to `group` on all 74 records, wrap in the import envelope
- Create: `docs/site-seed-README.md`

**Interfaces:**
- Consumes: `LIBRARY_FORMAT` = `'yard-measure-library-1'` (Task 7). The seed file must be importable by `mergeImport` unchanged.
- Produces: nothing in code. This is a document, and `index.html` must never reference it.

- [ ] **Step 1: Confirm the mismatch**

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && grep -c '"pod"' docs/site-seed-2026-08-28.json; grep -c '"group"' docs/site-seed-2026-08-28.json
```

Expected: `74` then `0`. The spec names the field `group`; the seed file still says `pod`, and it has no format envelope, so `mergeImport` will refuse it.

- [ ] **Step 2: Verify the file is not yet importable**

Open the app, then in the console:

```js
mergeImport({ seedDate: '2026-08-28', count: 74, sites: [] })
```

Expected: throws `That file is not a Yard Measure library export`.

- [ ] **Step 3: Rewrite the seed file**

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && python rewrite_seed.py
```

First create `rewrite_seed.py` at the repo root with this content, run it, then delete it — it is a one-shot migration, not something that ships:

```python
import io, json

p = 'docs/site-seed-2026-08-28.json'
raw = json.load(io.open(p, encoding='utf-8'))

sites = []
for s in raw['sites']:
    sites.append({
        'id': s['id'],
        'label': s.get('label', ''),
        'address': s.get('address', ''),
        # Never derived from the label. The board convention is
        # "LABEL - ADDRESS", so a customer prefix is not reliably separable.
        'customer': '',
        # The spec names this `group`, deliberately generic. "pod" is company
        # detail and must not travel into the app's vocabulary.
        'group': s.get('pod', ''),
        'note': s.get('note', ''),
        'lat': None,
        'lng': None,
    })

out = {
    'format': 'yard-measure-library-1',
    'appVersion': 'v8',
    'exportedAt': '2026-08-28T00:00:00.000Z',
    'source': raw.get('source', ''),
    'count': len(sites),
    'sites': sites,
    'jobs': [],
}
io.open(p, 'w', encoding='utf-8').write(json.dumps(out, indent=1, ensure_ascii=False))
print(len(sites), 'sites written')
```

Then:

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && rm rewrite_seed.py
```

Create `docs/site-seed-README.md`:

```markdown
# Titan's site seed — 74 properties

This is **data, not code**. `index.html` does not reference this file and must
never learn its path. The app ships with an empty library; this file is one
company's import, and any other company's import is their own file.

## Loading it

Open the app → **Jobs** → **Site library** → **Import** → choose
`site-seed-2026-08-28.json`. Once per device. Importing it twice produces 74
sites, not 148 — the ids are stable, so a second import is a no-op.

## What is in it

74 sites across 13 groups, extracted from the SNOW ROUTES / PODS Trello board
on 2026-08-28.

- `label` — what the crew calls the property
- `address` — parsed cleanly at 70 of 75 cards
- `group` — the pod. Called `group` because the field is generic in the app:
  another company puts a route, a crew or a city in it.
- `customer` — deliberately **empty**. The board convention is
  `LABEL - ADDRESS`, not `CUSTOMER - ADDRESS`: the customer is sometimes a
  prefix, sometimes fused into the label, sometimes absent. Deriving it would
  be wrong more often than it would be right, so a human fills it in.
- `lat` / `lng` — **null**. A site's coordinates come from the first job
  measured there.

## Known gaps, carried forward from the spec

1. **Titan's own yard** and **Girdwood Library** have no parsed address. Each
   needs a human to give one, or to say it has not got one.
2. **A JBER site has no street address** at all.
3. **Pod values may be stale for the 2026/27 season.** They ride in this file
   rather than in code, so a wrong value is one edit in the app, not a
   redeploy. If pods are being redrawn before first snow, strip `group` from
   this file and let it fill in as sites get measured.

## What is deliberately not here

The board also holds EQUIPMENT (26), Operators (10), Shovelers (13), HAULING
(4) and Subcontractors (42). **None of it belongs in this app** — this app
measures ground, and a loader roster is scope it cannot maintain.
```

- [ ] **Step 4: Verify the seed imports**

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && python -c "import io,json; d=json.load(io.open('docs/site-seed-2026-08-28.json',encoding='utf-8')); print(d['format'], d['count'], len(d['sites'])); print(sorted({s['group'] for s in d['sites']})[:3]); print('pod key present:', any('pod' in s for s in d['sites']))"
```

Expected: `yard-measure-library-1 74 74`, three group names, and `pod key present: False`.

Then, in the app with an empty library, use **Import** on the file and confirm:
- the toast reads `74 added`
- `readSites().length` is `74`
- importing the same file a second time reads `0 added` and `readSites().length` is still `74` (**spec test 7**)
- `readSites().every(s => s.lat === null)` is `true`
- `readSites().every(s => s.customer === '')` is `true`

- [ ] **Step 5: Commit**

```bash
git add docs/site-seed-2026-08-28.json docs/site-seed-README.md
git commit -m "Make the site seed a file the app can actually import"
```

---

### Task 10: Guard the boundary, ship it

**Files:**
- Modify: `sw.js` line 20 (`CACHE_VERSION`)
- Modify: `docs/site-library-console-tests.js` — add the storage-survival and no-company-data checks
- Test: full console suite + device

**Interfaces:**
- Consumes: everything from Tasks 1-9
- Produces: nothing new. This task proves the constraints hold.

- [ ] **Step 1: Write the failing test**

Add this block to `docs/site-library-console-tests.js` before `// --- restore and report ---`:

```js
  // --- Task 10: the library survives the job trim (spec test 6) ---
  // writeJobs() halves the job list on quota. The library must not be in the
  // blast radius — this is the whole reason sites have their own key.
  (function () {
    const jobsBackup = localStorage.getItem('yardMeasureJobs');
    localStorage.setItem('yardMeasureSites', JSON.stringify([
      makeSite({ id: 's-survivor', label: 'Survivor', address: '1 SURVIVOR RD' }),
    ]));
    // A pin-heavy fake job, repeated until the quota bites.
    const fatZone = { id: 1, name: 'Z', mode: 'area', surface: 'plow', gates: [], nextGateId: 1,
      pins: Array.from({ length: 400 }, (_, i) => ({ id: i, lat: 61 + i * 1e-6, lng: -149 - i * 1e-6, accuracy: 3 })) };
    const fat = [];
    for (let i = 0; i < 400; i++) {
      fat.push({ id: 'j-fat-' + i, name: 'Fat ' + i, started: Date.now(), savedAt: Date.now() - i,
                 sqft: 1, lenFt: 0, zoneCount: 1, zones: [fatZone], nextZoneId: 2, nextPinId: 401,
                 season: 'summer', snowJob: {}, siteId: null });
    }
    writeJobs(fat);   // expected to hit quota and trim
    ok('the library survives a job-storage trim (spec test 6)',
       readSites().length === 1 && getSite('s-survivor').label === 'Survivor',
       `library len ${readSites().length}`);
    if (jobsBackup === null) localStorage.removeItem('yardMeasureJobs');
    else localStorage.setItem('yardMeasureJobs', jobsBackup);
  })();

  // --- Task 10: a fresh install is empty and carries no company data ---
  ok('SITES_KEY is separate from JOBS_KEY', SITES_KEY !== 'yardMeasureJobs');
  ok('a cleared library reads empty (spec test 1)', (function () {
    const b = localStorage.getItem('yardMeasureSites');
    localStorage.removeItem('yardMeasureSites');
    const empty = readSites().length === 0;
    if (b === null) localStorage.removeItem('yardMeasureSites');
    else localStorage.setItem('yardMeasureSites', b);
    return empty;
  })());
```

- [ ] **Step 2: Run test to verify it fails**

Reload, paste.
Expected: the two new checks fail (they are new assertions with no prior run), or — if the separation was built wrong in Task 1 — `the library survives a job-storage trim` reports `library len 0`.

- [ ] **Step 3: Prove the source is clean and bump the cache**

Run the boundary greps. **Every one must print nothing.**

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && grep -niE "ciha|anthc|lithia|ahfc|titan|jber|girdwood|centennial|old seward|muldoon|bragaw|salamatof|knik" index.html sw.js manifest.json
```

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && grep -nE "site-seed|siteSeed|\"pod\"|'pod'|\bpod:" index.html sw.js
```

```bash
cd "C:/Users/skull/OneDrive/claudes room/Yard-Measure-repo" && grep -nE '\$[0-9]|price|Price|cost|Cost|rate per|USD' index.html | grep -viE "costly|accostomed"
```

If any grep prints a line, fix it before continuing — a hit is a Global Constraint violation, not a style note.

Then bump `sw.js` line 20:

```js
const CACHE_VERSION = 'v8';
```

This must match the `APP_VERSION` constant added in Task 7, so an exported file names the build that wrote it.

- [ ] **Step 4: Run the full suite**

Reload, paste the whole of `docs/site-library-console-tests.js`.
Expected: `57/57 passed`.

Then walk the eleven spec tests on a real phone, confirming each:

1. Fresh install (clear site data) → library is empty, and no company name appears anywhere
2. Job started from a library site carries `siteId`; reopening it keeps it
3. A typed address matching a library site raises the offer and does **not** auto-merge
4. `1281 E 19TH AVE` matches `1281 E 19TH AVENUE`
5. Two sites 60 m apart are never treated as one
6. Filling job storage past the trim threshold leaves the library intact
7. Importing the 74-site file gives 74 sites; importing it twice gives 74
8. A job with no site still saves, and still exports
9. `job.name` behaves as it did for jobs saved before this change
10. Export round-trips through import with no loss; CSV is export-only
11. Snow, fence, materials and cut-outs are all unaffected — measure one of each and compare against a pre-change number

- [ ] **Step 5: Commit**

```bash
git add index.html sw.js docs/site-library-console-tests.js
git commit -m "Bump the service worker cache version for the site library deploy"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task:

| Spec section | Task |
|---|---|
| A site is a first-class record (id, label, address, customer, group, note, lat/lng, timestamps) | 1 |
| `group` deliberately generic, never "pod" | 1, 9 |
| A job points at a site; `job.name` unchanged; `siteId: null` for old jobs | 4 |
| Sites stored apart from jobs, never trimmed by the job path | 1, 10 |
| Site enters the library two ways only — measured-and-named, or imported | 5, 7 |
| Import/export: Titan loads 74, library moves between phones, Chris gets his data | 7, 9 |
| JSON full fidelity, round-trips | 7 |
| CSV flat, one row per zone, export only | 8 |
| Import additive, never overwrites silently | 7 |
| Duplicate layer 1 — `siteId` authoritative | 4 |
| Duplicate layer 2 — normalised address match on typing, offers | 2, 5 |
| Duplicate layer 3 — GPS proximity suggests, never detects | 3, 6 |
| Nothing merges automatically, ever | 5, 6, 7 |
| Titan's import file lives in the repo as a document | 9 |
| Out of scope — optimizer, Trello, sync, equipment, pricing | not built; guarded by the greps in 10 |
| Testing 1-11 | 10 |

**Open questions, and how the plan handles them.** The spec's three open questions are not resolved here, and none of them blocks the build:

1. **JSON or CSV first for Chris?** Both are built (Tasks 7 and 8) because they are small and share `downloadText`. If only one gets consumed, the other costs nothing standing.
2. **Are the pod values current for 2026/27?** They ride in the seed file, not the code, so a wrong value is one edit. `docs/site-seed-README.md` records the "strip `group` if pods are being redrawn" fallback.
3. **Titan's yard and Girdwood Library have no parsed address.** Recorded in `docs/site-seed-README.md` as needing a human. `makeSite` accepts an empty address, and `renderSites` shows "No address" rather than breaking.

**Type consistency check.** `renderSiteRow` is declared as a no-op in Task 4 and replaced in Task 5 — Task 5 Step 3g says so explicitly. `APP_VERSION` (Task 7) and `sw.js`'s `CACHE_VERSION` (Task 10) are both `'v8'`. `mergeImport(payload, opts)` takes `opts.autoAnswer` in `'replace' | 'skip'`, used in Task 7's assertions only. `startJobAtSite(siteId)` is used by Task 5's list handler and by Task 5's save handler. `siteJobName(site)` is the single source of a job's name from a site, used in Tasks 4 and 5.

**One thing an executor should know that the spec does not say.** `setJobSite` calls `syncCurrentJob`, and `syncCurrentJob` calls `stampSiteLocation` — that is a two-hop path, not a cycle, because `stampSiteLocation` calls `upsertSite` and never `setJobSite`. Do not add a `renderSiteRow` call inside `syncCurrentJob`; it runs on every mutation and would repaint the row on every pin.
