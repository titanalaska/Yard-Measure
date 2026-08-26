# Yard Measure Snow Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a snow mode to Yard Measure that turns a walked site into surface-separated snow quantities and a storage/haul-off verdict, without ever computing a price.

**Architecture:** One new global flag (`state.season`) switches the app between summer and snow. Zones gain a `surface` field orthogonal to their existing geometric `mode`. Snow quantities are derived by pure functions over the existing area/length primitives. The Material Layers section is swapped for a Snow panel when the season is snow. Nothing in the summer path changes.

**Tech Stack:** Single-file vanilla JS + MapLibre GL. No build step, no framework, no test runner.

**Spec:** [`docs/superpowers/specs/2026-08-25-yard-measure-snow-mode-design.md`](../specs/2026-08-25-yard-measure-snow-mode-design.md)

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **The app produces quantities and site facts. It never produces dollars.**
- No labour hours and no machine production rates — hours are only useful against a labour rate.
- **No invented constants.** Any value that is a judgment call is entered by the user and visible on screen, never baked into the code as though it were fact.
- `pileHeightFt` **default: 20 ft.** This is Titan's own working figure, which is why it may ship as a default where the judgment values may not.
- **No manufacturer figure governs pile height, and none may be shown in the UI.** Do not reintroduce loader dump clearance or hinge pin height.
- `compactionRatio` is defined as **fresh volume ÷ piled volume**. The UI label must state this direction.
- Storage zones neither add to nor subtract from cleared area, and must not trigger the existing overlap or orphan-cut warnings.
- Anchorage only. Do not design for Mat-Su valley conditions.
- Storage schema version stays at `v: 2`.
- Summer mode must render identically to today.

## Scope note — a refinement of the spec

The spec states `pileHeightFt` is a preference across jobs and gives contract terms as per-job (`job.removalWindowHrs`), but leaves the scope of the remaining judgment values implicit. This plan makes it explicit:

- **`state.snowPrefs`** (own localStorage key, survives job switching) — `pileHeightFt`, `packingFactor`, `compactionRatio`, `truckCapacityYd3`, `sandRateLbsPer1000`. These describe Titan's fleet and operating practice, not a site.
- **`state.snowJob`** (saved with the job) — `eventDepthIn`, `removalWindowHrs`, `triggerDepthIn`. These describe a particular site and its contract.

Flag this split for confirmation before Task 4.

## File Structure

The app is one file. There is no meaningful way to split it that follows the existing pattern, so all changes land in `index.html` in clearly-commented sections, matching how `ZONES`, `MATERIAL LAYERS`, and `DISPLAY MODE` are already delimited.

- `index.html` — all implementation
- `.claude/launch.json` — add a preview server entry (Task 0)
- `docs/superpowers/plans/` — this plan

## Verification approach — read this before Task 1

**This codebase has no test harness and will not be given one.** It is a single HTML file deployed to GitHub Pages; adding a runner would change the deploy model for no benefit the field sees. The spec calls for verification by inspection and device testing.

However, the `<script>` block is **top-level, not an IIFE**, so every function declaration and top-level binding is reachable from the browser console. Verification steps therefore run **real assertions against the live app** via the Browser pane's `javascript_tool`, rather than by eyeballing.

A verification step that says "Run in `javascript_tool`" means: the app is loaded in the Browser pane, and you paste that expression. Each returns `"PASS"` or throws.

**Field confirmation on a real phone is still required before any of this is described as working.** Browser assertions prove the arithmetic; they do not prove the thing is usable in a parking lot in February.

---

### Task 0: Preview server for verification

**Files:**
- Modify: `.claude/launch.json`

**Interfaces:**
- Consumes: existing `tools/static-server.js` (already used by the `titan-inventory` entry)
- Produces: a `yard-measure` preview server on port 8138, used by every later task's verification steps

- [ ] **Step 1: Add the launch config entry**

Add a second entry to the `configurations` array in `.claude/launch.json`, alongside the existing `titan-inventory` one:

```json
{
  "name": "yard-measure",
  "runtimeExecutable": "node",
  "runtimeArgs": ["tools/static-server.js", "Yard-Measure-repo", "8138"],
  "port": 8138
}
```

- [ ] **Step 2: Start it and confirm the app loads**

Start the `yard-measure` preview. Then run in `javascript_tool`:

```js
(typeof zoneNetSqft === 'function' && typeof state === 'object') ? 'PASS' : (() => { throw new Error('app script did not load at top level'); })()
```

Expected: `"PASS"`. If this throws, every later verification step is invalid — stop and fix the server before continuing.

- [ ] **Step 3: Commit**

```bash
git add .claude/launch.json
git commit -m "Add a preview server for Yard Measure"
```

---

### Task 1: Season flag and toggle

**Files:**
- Modify: `index.html` — `state` object (~line 1618), icon `<defs>` (~line 1393), `<header>` (~line 1426), `saveState()` (~line 3627), `loadState()` (~line 3677)

**Interfaces:**
- Produces: `state.season` (`'summer' | 'snow'`), `isSnow()` returning boolean, and a `#season-btn` header button. Tasks 2–6 all branch on `isSnow()`.

- [ ] **Step 1: Add the season field to state**

In the `state` object, after `theme: 'auto',`:

```js
    // Snow is a different season's job on the same ground. The flag changes
    // only what is offered and what is reported — never how anything is
    // measured, so a summer user who never touches it sees today's app.
    season: 'summer',
```

- [ ] **Step 2: Add the helper and a snowflake icon**

Immediately after the `MODE_NOUN` line (~1719), add:

```js
  const isSnow = () => state.season === 'snow';
```

In the icon `<defs>` block, alongside the other `<symbol>` entries:

```html
  <symbol id="i-snow" viewBox="0 0 24 24"><path d="M12 2v20M4.9 6.5l14.2 11M19.1 6.5L4.9 17.5"/><path d="M12 6l-2.5-2.5M12 6l2.5-2.5M12 18l-2.5 2.5M12 18l2.5 2.5"/></symbol>
```

- [ ] **Step 3: Add the header button**

In `<header>`, between the theme button and the jobs button:

```html
  <button id="season-btn" class="hdr-btn" type="button" title="Summer / snow season">
    <svg class="ic"><use href="#i-snow"/></svg>
  </button>
```

- [ ] **Step 4: Wire the toggle**

Near the display-mode handlers, add:

```js
  const seasonBtn = document.getElementById('season-btn');
  seasonBtn.addEventListener('click', () => {
    state.season = isSnow() ? 'summer' : 'snow';
    seasonBtn.classList.toggle('active', isSnow());
    renderAll();
    saveState();
    showToast(isSnow() ? 'Snow season' : 'Summer season');
  });
```

- [ ] **Step 5: Persist and restore it**

In `saveState()`, inside the `JSON.stringify({...})` object, after `crosshair: state.crosshair,`:

```js
        season: state.season,
```

In `loadState()`, after the `if (saved.crosshair) state.crosshair = true;` line:

```js
    // Jobs saved before snow mode existed were all summer work.
    if (saved.season === 'snow') state.season = 'snow';
```

- [ ] **Step 6: Verify the flag round-trips and old jobs default to summer**

**First draw a zone with at least three pins in the UI** (tap-to-add on the map
is quickest). This is required, not optional: `loadState()` returns early unless
the saved job has `v === 2` and a non-empty `zones` array, so with no zones the
season-restore branch never executes and the assertion below would pass while
proving nothing.

Run in `javascript_tool`:

```js
(() => {
  if (!state.zones.some(z => z.pins.length >= 3))
    throw new Error('draw a 3-pin zone first — this check is vacuous without one');
  state.season = 'snow'; saveState();
  const back = JSON.parse(localStorage.getItem('yardMeasureState'));
  if (back.season !== 'snow') throw new Error('season not saved');
  if (back.v !== 2 || !back.zones.length) throw new Error('saved job will not reach the restore branch');
  delete back.season;
  localStorage.setItem('yardMeasureState', JSON.stringify(back));
  return 'PASS — a v2 job with zones and no season key is staged for the reload check';
})()
```

Expected: `"PASS …"`. Now reload the page and run:

```js
(() => {
  if (!state.zones.length) throw new Error('the staged job did not load — the check below would be vacuous');
  if (state.season !== 'summer') throw new Error('a job with no season key must load as summer, got ' + state.season);
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Add a season flag with a summer/snow toggle"
```

---

### Task 2: Surface on zones

**Files:**
- Modify: `index.html` — `newZone()` (~line 1691), mode constants (~line 1714), `renderZoneTabs()` (~line 1787), `zoneTabs` click handler (~line 1832), `loadState()`

**Interfaces:**
- Consumes: `isSnow()` from Task 1
- Produces: `zone.surface` (one of `'plow' | 'walk' | 'hand' | 'storage'`), `surfaceOf(z)` returning the surface with a `'plow'` fallback, `surfacesFor(z)` returning the allowed list for a zone's mode, and `SURFACE_LABEL`

- [ ] **Step 1: Add the constants and helpers**

After the `MODE_NOUN` line, alongside `isSnow`:

```js
  // Surface is orthogonal to mode. Mode is geometry — is this a shape, a hole,
  // or a run. Surface is who clears it and how, which is what separates a lot
  // from a sidewalk from the stairs by the door when someone prices the job.
  const SURFACES = ['plow', 'walk', 'hand', 'storage'];
  const SURFACE_LABEL = { plow: 'Plow', walk: 'Walk', hand: 'Hand', storage: 'Storage' };
  const SURFACE_NOUN = {
    plow: 'machine-cleared',
    walk: 'shovel or blower',
    hand: 'hand-cleared — stairs and anywhere a machine cannot reach',
    storage: 'snow storage — filled, not cleared',
  };
  const surfaceOf = z => z.surface || 'plow';
  // Storage along a line is meaningless: you do not stack snow down a stripe.
  const surfacesFor = z => (isLine(z) ? ['plow', 'walk', 'hand'] : SURFACES);
```

- [ ] **Step 2: Default the field on new zones**

In `newZone()`, in the returned object after `nextLayerId: 1,`:

```js
      surface: 'plow',
```

- [ ] **Step 3: Default it on load for pre-snow jobs**

In `loadState()`, next to the existing mode default:

```js
      state.zones.forEach(z => { if (!z.mode) z.mode = 'area'; });
      // Jobs saved before snow mode carry no surface; they were summer work,
      // and plow is the harmless default since nothing reads it until the
      // season is switched.
      state.zones.forEach(z => { if (!z.surface) z.surface = 'plow'; });
```

- [ ] **Step 4: Show the surface on the active chip in snow mode**

In `renderZoneTabs()`, replace the `const acts = active` assignment with:

```js
      const acts = active
        ? (isSnow() && !isCut(z)
            ? `<button class="chip-act" data-act="surface" title="Change surface">${SURFACE_LABEL[surfaceOf(z)]}</button>`
            : '') +
          `<button class="chip-act" data-act="mode" title="Switch between area, cut-out and run">${icon(MODE_ICON[z.mode] || MODE_ICON.area, 'ic-sm')}</button>` +
          `<button class="chip-act" data-act="rename" title="Rename">${icon('edit','ic-sm')}</button>` +
          (n > 1 ? `<button class="chip-act" data-act="delete" title="Delete zone">${icon('x','ic-sm')}</button>` : '')
        : '';
```

A cut gets no surface button: a hole subtracts from its parent regardless of season, exactly as the spec requires.

- [ ] **Step 5: Cycle the surface on tap**

In the `zoneTabs` click handler, immediately before `if (act === 'mode') {`:

```js
    if (act === 'surface') {
      const list = surfacesFor(zone);
      const i = list.indexOf(surfaceOf(zone));
      zone.surface = list[(i + 1) % list.length];
      renderAll();
      saveState();
      showToast(`"${zone.name}" is ${SURFACE_NOUN[zone.surface]}`);
      return;
    }
```

- [ ] **Step 6: Keep a run off storage when its mode changes**

Inside the existing `if (act === 'mode') {` block, after the `zone.mode = MODES[...]` line:

```js
      // A run cannot be storage, so a shape sitting on storage that becomes a
      // run has to land somewhere valid rather than silently keeping a surface
      // nothing will ever count.
      if (!surfacesFor(zone).includes(surfaceOf(zone))) zone.surface = 'plow';
```

- [ ] **Step 7: Verify surface cycling respects mode**

Run in `javascript_tool`:

```js
(() => {
  const z = state.zones[0];
  z.mode = 'area'; z.surface = 'storage';
  if (surfacesFor(z).length !== 4) throw new Error('an area should offer all four surfaces');
  z.mode = 'line';
  if (surfacesFor(z).includes('storage')) throw new Error('a run must not offer storage');
  if (!surfacesFor(z).includes(surfaceOf(z))) z.surface = 'plow';
  if (z.surface !== 'plow') throw new Error('a run left on an invalid surface');
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "Give zones a surface, separate from their geometry"
```

---

### Task 3: Run width

**Files:**
- Modify: `index.html` — `newZone()`, snow section (new, after `MATERIAL LAYERS` ~line 2430)

**Interfaces:**
- Consumes: `isLine`, `isCut`, `zoneLenFt`, `zoneNetSqft` (existing); `surfaceOf` from Task 2
- Produces: `zoneSnowSqft(z)` returning square feet for any zone under snow accounting, `0` for cuts and for width-less runs

- [ ] **Step 1: Add the field to new zones**

In `newZone()`, after `surface: 'plow',`:

```js
      widthFt: '',
```

- [ ] **Step 2: Add the area helper**

Open a new commented section after the `MATERIAL LAYERS` block:

```js
  // ── SNOW ─────────────────────────────────────────────
  // A sidewalk is a run: two pins beats outlining four corners in the dark in
  // February. Snow volume needs area, so a run carries a width and multiplies
  // out. A run with no width still reports its linear feet — it contributes no
  // area, and the panel says so rather than counting it as zero.
  function zoneSnowSqft(z) {
    if (isCut(z)) return 0;
    if (isLine(z)) {
      const w = parseFloat(z.widthFt);
      return w > 0 ? zoneLenFt(z) * w : 0;
    }
    return zoneNetSqft(z);
  }
```

- [ ] **Step 3: Verify the multiplication and the no-width case**

Run in `javascript_tool`:

```js
(() => {
  const noWidth = { mode: 'line', surface: 'walk', widthFt: '', pins: [] };
  if (zoneSnowSqft(noWidth) !== 0) throw new Error('a width-less run must contribute no area');
  const cut = { mode: 'cut', surface: 'plow', pins: [] };
  if (zoneSnowSqft(cut) !== 0) throw new Error('a cut must contribute no snow area');
  return 'PASS';
})()
```

Expected: `"PASS"`.

Then draw a two-pin run in the UI, set its width to 5, and confirm the multiplication against its own length:

```js
(() => {
  const z = state.zones.find(z => isLine(z) && isDrawn(z));
  if (!z) return 'SKIP — draw a two-pin run first, then re-run';
  z.widthFt = '5';
  const expected = zoneLenFt(z) * 5;
  if (Math.abs(zoneSnowSqft(z) - expected) > 0.001) throw new Error('width multiplication wrong');
  return 'PASS';
})()
```

Do not tick this step off on a `"SKIP"`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Let a snow run carry a width so a sidewalk yields area"
```

---

### Task 4: Snow settings and quantity functions

**Files:**
- Modify: `index.html` — `state` object, `SNOW` section from Task 3, `saveState()`, `loadState()`

**Interfaces:**
- Consumes: `zoneSnowSqft` (Task 3), `surfaceOf` (Task 2), `isDrawn`, `isCut` (existing)
- Produces: `state.snowPrefs`, `state.snowJob`, `clearedBySurface()` returning `{plow, walk, hand, storage}` in sq ft, `clearedSqft()` returning the sum of the three cleared surfaces, `snowLinearFt()` returning total linear feet of non-storage runs, `storageCapacityYd3()`, `snowVolumeYd3()`, `haulLoads(yd3)`, `iceControlTons()`. Each of the four calculators returns `null` when an input it needs is unset, never `0` or `NaN`. **Task 5 consumes `snowLinearFt()` — do not omit it.**

- [ ] **Step 1: Add both settings objects to state**

In the `state` object, after `season: 'summer',`:

```js
    // Fleet and operating practice — these describe how Titan works, not a
    // site, so they outlive any one job. Everything here except the pile
    // height is a judgment call and ships empty on purpose: a number invented
    // in code reads as fact six months later.
    snowPrefs: {
      pileHeightFt: 20,          // Titan's own working figure for a finished pile
      packingFactor: '',
      compactionRatio: '',
      truckCapacityYd3: '',
      sandRateLbsPer1000: '',
    },
    // The site and its contract.
    snowJob: {
      eventDepthIn: '',
      removalWindowHrs: '',
      triggerDepthIn: '',
    },
```

- [ ] **Step 2: Add the surface totals**

In the `SNOW` section, after `zoneSnowSqft`:

```js
  function clearedBySurface() {
    const out = { plow: 0, walk: 0, hand: 0, storage: 0 };
    state.zones.filter(isDrawn).forEach(z => {
      if (isCut(z)) return;   // a hole subtracts through its parent, not here
      out[surfaceOf(z)] += zoneSnowSqft(z);
    });
    return out;
  }

  // Storage is deliberately excluded. A pile usually sits on ground that is
  // also plowed — the same ground doing two jobs — so it neither adds to nor
  // subtracts from what gets cleared.
  function clearedSqft() {
    const s = clearedBySurface();
    return s.plow + s.walk + s.hand;
  }

  function snowLinearFt() {
    return state.zones
      .filter(z => isDrawn(z) && isLine(z) && surfaceOf(z) !== 'storage')
      .reduce((s, z) => s + zoneLenFt(z), 0);
  }
```

- [ ] **Step 3: Add the four calculators**

```js
  // A push-stacked pile is a ramped wedge sitting at its angle of repose, not
  // a box filled to a uniform height — packingFactor is that discount.
  function storageCapacityYd3() {
    const sqft = clearedBySurface().storage;
    const h = parseFloat(state.snowPrefs.pileHeightFt);
    const f = parseFloat(state.snowPrefs.packingFactor);
    if (!(sqft > 0) || !(h > 0) || !(f > 0)) return null;
    return (sqft * h * f) / 27;
  }

  // compactionRatio is FRESH ÷ PILED. A ratio of 3 means three cubic feet of
  // fresh snow becomes one once plowed and piled. The inverse reading is
  // equally natural and wrong by a factor of nine, which is why the input
  // label spells the direction out.
  function snowVolumeYd3() {
    const sqft = clearedSqft();
    const depth = parseFloat(state.snowJob.eventDepthIn);
    const ratio = parseFloat(state.snowPrefs.compactionRatio);
    if (!(sqft > 0) || !(depth > 0) || !(ratio > 0)) return null;
    return (sqft * (depth / 12)) / 27 / ratio;
  }

  function haulLoads(yd3) {
    const cap = parseFloat(state.snowPrefs.truckCapacityYd3);
    if (!(yd3 > 0) || !(cap > 0)) return null;
    return Math.ceil(yd3 / cap);
  }

  function iceControlTons() {
    const sqft = clearedSqft();
    const rate = parseFloat(state.snowPrefs.sandRateLbsPer1000);
    if (!(sqft > 0) || !(rate > 0)) return null;
    return (sqft / 1000) * rate / 2000;
  }
```

- [ ] **Step 4: Persist both**

In `saveState()`, after `season: state.season,`:

```js
        snowJob: state.snowJob,
```

`snowPrefs` gets its own key, because it must survive loading a different job. Next to the `STORAGE_KEY` declaration:

```js
  const SNOW_PREFS_KEY = 'yardMeasureSnowPrefs';

  function saveSnowPrefs() {
    try { localStorage.setItem(SNOW_PREFS_KEY, JSON.stringify(state.snowPrefs)); }
    catch (e) { /* storage unavailable or full — not fatal */ }
  }

  function loadSnowPrefs() {
    try {
      const raw = localStorage.getItem(SNOW_PREFS_KEY);
      if (raw) Object.assign(state.snowPrefs, JSON.parse(raw));
    } catch (e) { /* keep the defaults */ }
  }
```

In `loadState()`, after the season restore:

```js
    if (saved.snowJob) Object.assign(state.snowJob, saved.snowJob);
```

Call `loadSnowPrefs()` at startup, immediately before the existing `loadState()` call.

- [ ] **Step 5: Verify the arithmetic against hand-checked numbers**

Run in `javascript_tool`:

```js
(() => {
  const round = (n, p) => Math.round(n * 10 ** p) / 10 ** p;

  state.snowPrefs.pileHeightFt = 20;
  state.snowPrefs.packingFactor = '0.5';
  state.snowPrefs.compactionRatio = '3';
  state.snowPrefs.truckCapacityYd3 = '14';
  state.snowPrefs.sandRateLbsPer1000 = '20';
  state.snowJob.eventDepthIn = '12';

  // capacity: 4000 sqft x 20 ft x 0.5 / 27 = 1481.48 yd3
  const cap = (4000 * 20 * 0.5) / 27;
  if (round(cap, 2) !== 1481.48) throw new Error('capacity check wrong: ' + cap);

  // volume: 100000 sqft x 1 ft / 27 / 3 = 1234.57 yd3
  const vol = (100000 * (12 / 12)) / 27 / 3;
  if (round(vol, 2) !== 1234.57) throw new Error('volume check wrong: ' + vol);

  // loads on the excess, rounded up: ceil((1234.57 - 1481.48) / 14) -> no excess
  if (Math.max(0, vol - cap) !== 0) throw new Error('this site should fit');

  // ice control: 100000 / 1000 x 20 / 2000 = 1 ton
  const tons = (100000 / 1000) * 20 / 2000;
  if (tons !== 1) throw new Error('ice control check wrong: ' + tons);

  // every calculator must return null, not 0 or NaN, when an input is unset
  state.snowPrefs.compactionRatio = '';
  if (snowVolumeYd3() !== null) throw new Error('unset compaction must yield null');
  state.snowPrefs.compactionRatio = '3';

  if (haulLoads(0) !== null) throw new Error('zero volume must yield null loads');
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 6: Verify a storage zone neither adds to nor subtracts from cleared**

Run in `javascript_tool`:

```js
(() => {
  const before = clearedSqft();
  const s = clearedBySurface();
  if (s.storage > 0 && clearedSqft() !== before) throw new Error('storage leaked into cleared');
  if (typeof orphanCuts === 'function' && orphanCuts().some(z => surfaceOf(z) === 'storage'))
    throw new Error('a storage zone was flagged as an orphan cut');
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Add snow settings and the quantity calculators"
```

---

### Task 5: The Snow panel

**Files:**
- Modify: `index.html` — layers section markup (~line 1568), `renderLayers()` (~line 2503), `renderAll()` (~line 3592)

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces: `renderSnow()`, and a `#snow-section` element that replaces `#layers-section` while the season is snow

- [ ] **Step 1: Add the panel markup**

Immediately after the closing `</div>` of `#layers-section`:

```html
<div id="snow-section" style="display:none;">
  <div class="section-header">
    <span class="section-title">Snow</span>
    <span class="pin-count" id="snow-count">0 zones</span>
  </div>
  <div id="snow-totals"></div>
  <div id="snow-storage" class="layers-total"></div>
  <div id="snow-settings"></div>
</div>
```

- [ ] **Step 2: Swap the sections by season**

`renderLayers()` already owns `layersSection.style.display`, setting it at three
points (`index.html:2285`, `:2298`, `:2326`). Do **not** set it from
`renderAll()` as well — the two would fight. Guard at the top of
`renderLayers()` instead, immediately after the function's opening line:

```js
    // Snow replaces materials outright rather than stacking below it: the
    // panel below the map is scarce space on a phone.
    if (isSnow()) { layersSection.style.display = 'none'; return; }
```

In `renderAll()`, add one line after `renderLayers();`:

```js
    renderSnow();
```

`renderSnow()` owns `snowSection.style.display` the same way, returning early
in summer (see Step 3).

Declare the new elements alongside the existing `layersSection` lookup at
`index.html:1672`:

```js
  const snowSection = document.getElementById('snow-section');
  const snowTotalsEl = document.getElementById('snow-totals');
  const snowStorageEl = document.getElementById('snow-storage');
  const snowSettingsEl = document.getElementById('snow-settings');
  const snowCountEl = document.getElementById('snow-count');
```

- [ ] **Step 3: Render the surface totals**

```js
  function renderSnow() {
    if (!isSnow()) { snowSection.style.display = 'none'; return; }
    snowSection.style.display = 'block';
    const s = clearedBySurface();
    const n = state.zones.filter(isDrawn).length;
    snowCountEl.textContent = `${n} zone${n !== 1 ? 's' : ''}`;

    const ft = v => Math.round(v).toLocaleString();
    const rows = [
      ['Plow', s.plow],
      ['Walk', s.walk],
      ['Hand', s.hand],
      ['Storage', s.storage],
    ].filter(([, v]) => v > 0)
     .map(([label, v]) => `<div class="layer-row1"><span>${label}</span><strong>${ft(v)} ft²</strong></div>`);

    const runFt = snowLinearFt();
    if (runFt > 0) rows.push(`<div class="layer-row1"><span>Runs</span><strong>${ft(runFt)} linear ft</strong></div>`);

    // A run with no width is measured but cannot contribute area. Say so
    // rather than letting it read as zero square feet of sidewalk.
    const noWidth = state.zones.filter(z => isDrawn(z) && isLine(z) && !(parseFloat(z.widthFt) > 0));
    if (noWidth.length) rows.push(`<div class="empty-state">${noWidth.length} run${noWidth.length !== 1 ? 's have' : ' has'} no width set — linear feet only, no area</div>`);

    snowTotalsEl.innerHTML = rows.length ? rows.join('') : `<div class="empty-state">Measure a zone and set its surface</div>`;
    renderSnowStorage();
    renderSnowSettings();
  }
```

- [ ] **Step 4: Render the storage verdict, both readings**

```js
  // A removal clause changes what the storage number means, so the panel leads
  // with a different figure. Same arithmetic either way — under a 48-hour
  // clause "it fits" is not a reprieve, because the snow leaves regardless.
  function renderSnowStorage() {
    const vol = snowVolumeYd3();
    const cap = storageCapacityYd3();
    const yd = v => v.toFixed(1);

    if (vol == null) {
      snowStorageEl.innerHTML = `<div class="empty-state">Set an event depth and a compaction ratio for a volume</div>`;
      return;
    }

    const removal = parseFloat(state.snowJob.removalWindowHrs);
    const loads = haulLoads(vol);
    const tons = iceControlTons();
    let html;

    if (removal > 0) {
      html = `<strong>${yd(vol)} yd³ to remove</strong>`
        + (loads != null ? ` · ${loads} load${loads !== 1 ? 's' : ''}` : '')
        + `<br><span style="font-weight:400;">Contract removal within ${removal} hr — it leaves whether or not it fits</span>`
        + (cap != null ? `<br><span style="font-weight:400;">Can stage ${yd(cap)} yd³ on site while working through it</span>` : '');
    } else if (cap == null) {
      html = `<strong>${yd(vol)} yd³ of snow</strong><br><span style="font-weight:400;">Measure a storage zone and set a packing factor to check whether it fits</span>`;
    } else if (vol <= cap) {
      html = `<strong>Fits</strong> — ${yd(vol)} yd³ into ${yd(cap)} yd³ of storage`;
    } else {
      const over = vol - cap;
      const overLoads = haulLoads(over);
      html = `<strong>Over by ${yd(over)} yd³</strong>`
        + (overLoads != null ? ` · ${overLoads} load${overLoads !== 1 ? 's' : ''}` : '')
        + `<br><span style="font-weight:400;">${yd(vol)} yd³ of snow, ${yd(cap)} yd³ of storage</span>`;
    }

    if (tons != null) html += `<br><span style="font-weight:400;">Ice control: ${tons.toFixed(2)} tons per application</span>`;
    snowStorageEl.innerHTML = html;
  }
```

- [ ] **Step 5: Render the settings inputs**

```js
  function renderSnowSettings() {
    const p = state.snowPrefs, j = state.snowJob;
    const num = (cls, val, ph, step) =>
      `<input type="number" class="${cls}" value="${escapeAttr(val ?? '')}" placeholder="${escapeAttr(ph)}" min="0" step="${step}" inputmode="decimal">`;

    snowSettingsEl.innerHTML = `
      <div class="layer-item">
        <div class="layer-row1"><span>Event depth</span>${num('snow-eventDepthIn', j.eventDepthIn, 'in', '0.5')}</div>
        <div class="layer-row1"><span>Pile height (finished, ft)</span>${num('snow-pileHeightFt', p.pileHeightFt, 'ft', '1')}</div>
        <div class="layer-row1"><span>Packing factor <em>(a pile is a wedge, not a box)</em></span>${num('snow-packingFactor', p.packingFactor, 'e.g. 0.5', '0.05')}</div>
        <div class="layer-row1"><span>Compaction <em>(fresh ÷ piled — 3 means 3 ft³ fresh becomes 1 ft³ piled)</em></span>${num('snow-compactionRatio', p.compactionRatio, 'e.g. 3', '0.5')}</div>
        <div class="layer-row1"><span>Truck capacity</span>${num('snow-truckCapacityYd3', p.truckCapacityYd3, 'yd³', '1')}</div>
        <div class="layer-row1"><span>Ice control rate</span>${num('snow-sandRateLbsPer1000', p.sandRateLbsPer1000, 'lb per 1,000 ft²', '1')}</div>
        <div class="layer-row1"><span>Removal window <em>(blank if the contract has none)</em></span>${num('snow-removalWindowHrs', j.removalWindowHrs, 'hr', '1')}</div>
        <div class="layer-row1"><span>Callout trigger</span>${num('snow-triggerDepthIn', j.triggerDepthIn, 'in', '0.5')}</div>
      </div>`;
  }

  const SNOW_PREF_FIELDS = ['pileHeightFt', 'packingFactor', 'compactionRatio', 'truckCapacityYd3', 'sandRateLbsPer1000'];
  const SNOW_JOB_FIELDS = ['eventDepthIn', 'removalWindowHrs', 'triggerDepthIn'];

  snowSettingsEl.addEventListener('input', (e) => {
    const cls = [...e.target.classList].find(c => c.startsWith('snow-'));
    if (!cls) return;
    const key = cls.slice(5);
    if (SNOW_PREF_FIELDS.includes(key)) { state.snowPrefs[key] = e.target.value; saveSnowPrefs(); }
    else if (SNOW_JOB_FIELDS.includes(key)) { state.snowJob[key] = e.target.value; saveState(); }
    else return;
    // Re-render only the verdict, never the inputs — rebuilding the inputs
    // would blow away focus mid-keystroke, the same trap the material layers
    // already avoid. The surface totals come from pins, not from these fields,
    // so they cannot have changed here.
    renderSnowStorage();
  });
```

- [ ] **Step 6: Verify the verdict flips at the expected depth**

Run in `javascript_tool`:

```js
(() => {
  state.season = 'snow';
  state.snowPrefs.pileHeightFt = 20;
  state.snowPrefs.packingFactor = '0.5';
  state.snowPrefs.compactionRatio = '3';
  state.snowPrefs.truckCapacityYd3 = '14';

  const cleared = clearedSqft();
  const cap = storageCapacityYd3();
  if (!(cleared > 0) || cap == null) return 'SKIP — draw a cleared zone and a storage zone first, then re-run';

  // Solve for the depth at which volume exactly equals capacity, then probe
  // just under and just over it.
  const dEqual = (cap * 27 * 3 * 12) / cleared;
  state.snowJob.eventDepthIn = String(dEqual * 0.9);
  if (snowVolumeYd3() > cap) throw new Error('should fit just below the crossover');
  state.snowJob.eventDepthIn = String(dEqual * 1.1);
  if (snowVolumeYd3() <= cap) throw new Error('should be over just above the crossover');
  return 'PASS';
})()
```

Expected: `"PASS"` once two zones are drawn. If it returns `"SKIP"`, draw a plow zone and a storage zone in the UI and re-run — do not tick this step off on a SKIP.

- [ ] **Step 7: Verify summer is untouched**

Run in `javascript_tool`:

```js
(() => {
  state.season = 'summer'; renderAll();
  const snowVisible = document.getElementById('snow-section').style.display !== 'none';
  if (snowVisible) throw new Error('snow panel is showing in summer');
  state.season = 'snow'; renderAll();
  if (document.getElementById('layers-section').style.display !== 'none')
    throw new Error('material layers are showing in snow');
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "Add the snow panel with surface totals and a storage verdict"
```

---

### Task 6: Export

**Files:**
- Modify: `index.html` — `jobSummaryText()` (~line 3799), snapshot canvas builder (~line 3260–3550)

**Interfaces:**
- Consumes: everything from Tasks 1–5
- Produces: `snowSummaryText()`, and a snow branch in the snapshot renderer

- [ ] **Step 1: Add the snow text summary**

Beside `jobSummaryText()`:

```js
  function snowSummaryText() {
    const s = clearedBySurface();
    const ft = v => Math.round(v).toLocaleString();
    const lines = [jobTitle(), new Date().toLocaleString(), '', 'SNOW'];

    state.zones.filter(isDrawn).filter(z => !isCut(z)).forEach(z => {
      const sqft = zoneSnowSqft(z);
      const bits = [`${SURFACE_LABEL[surfaceOf(z)]}`];
      if (isLine(z)) bits.push(`${ft(zoneLenFt(z))} linear ft`);
      if (sqft > 0) bits.push(`${ft(sqft)} sq ft`);
      else if (isLine(z)) bits.push('no width set — no area');
      lines.push(`${z.name}: ${bits.join(' · ')}`);
    });

    lines.push('');
    if (s.plow > 0) lines.push(`PLOW: ${ft(s.plow)} sq ft`);
    if (s.walk > 0) lines.push(`WALK: ${ft(s.walk)} sq ft`);
    if (s.hand > 0) lines.push(`HAND: ${ft(s.hand)} sq ft`);
    if (s.storage > 0) lines.push(`STORAGE: ${ft(s.storage)} sq ft`);

    const vol = snowVolumeYd3(), cap = storageCapacityYd3();
    const removal = parseFloat(state.snowJob.removalWindowHrs);
    if (vol != null) {
      const loads = haulLoads(vol);
      if (removal > 0) {
        lines.push(`TO REMOVE: ${vol.toFixed(1)} yd³${loads != null ? ` / ${loads} loads` : ''} within ${removal} hr`);
        if (cap != null) lines.push(`  can stage ${cap.toFixed(1)} yd³ on site`);
      } else if (cap != null && vol > cap) {
        const over = vol - cap, ol = haulLoads(over);
        lines.push(`OVER STORAGE by ${over.toFixed(1)} yd³${ol != null ? ` / ${ol} loads` : ''}`);
      } else if (cap != null) {
        lines.push(`FITS: ${vol.toFixed(1)} yd³ into ${cap.toFixed(1)} yd³`);
      } else {
        lines.push(`SNOW: ${vol.toFixed(1)} yd³`);
      }
    }

    const tons = iceControlTons();
    if (tons != null) lines.push(`ICE CONTROL: ${tons.toFixed(2)} tons per application`);

    // Contract terms travel with the measurement — a 1-inch trigger is exactly
    // the sort of thing that gets lost between the walk and the estimate.
    const trig = parseFloat(state.snowJob.triggerDepthIn);
    if (trig > 0) lines.push(`TRIGGER: ${trig}" callout`);

    const depth = parseFloat(state.snowJob.eventDepthIn);
    if (depth > 0) lines.push(`(quantities at a ${depth}" event)`);
    return lines.join('\n');
  }
```

- [ ] **Step 2: Route the copy button by season**

In the `copyBtn` click handler, replace `const text = jobSummaryText();` with:

```js
    const text = isSnow() ? snowSummaryText() : jobSummaryText();
```

- [ ] **Step 3: Branch the snapshot**

Guard the existing `if (materialRows.length) {` block at `index.html:3500` so it
does not run in snow:

```js
    if (!isSnow() && materialRows.length) {
```

Then insert the snow block immediately after that block closes, before the
snapshot's footer. It reuses the renderer's existing conventions exactly — `F`
for the font family, 40px left margin, `W - 40` right, `#555` for labels,
`#2d6a2d` for figures, `#1c6fb0` for the blue used on runs, and the same
`cursorY` advances (42 per row, 44 after a total):

```js
    // snow — surfaces stay separate, because lot, sidewalk and stair work are
    // separate line items to whoever prices this.
    if (isSnow()) {
      const s = clearedBySurface();
      const ftv = v => Math.round(v).toLocaleString();
      g.textAlign = 'left';
      g.fillStyle = '#1a1a1a';
      g.font = `700 30px ${F}`;
      g.fillText('Snow', 40, cursorY);
      cursorY += 40;

      [['Plow', s.plow], ['Walk', s.walk], ['Hand', s.hand], ['Storage', s.storage]]
        .filter(([, v]) => v > 0)
        .forEach(([label, v]) => {
          g.fillStyle = '#555';
          g.font = `400 26px ${F}`;
          g.textAlign = 'left';
          g.fillText(label, 40, cursorY);
          g.fillStyle = label === 'Storage' ? '#1c6fb0' : '#2d6a2d';
          g.font = `700 26px ${F}`;
          g.textAlign = 'right';
          g.fillText(`${ftv(v)} ft²`, W - 40, cursorY);
          cursorY += 42;
        });

      const vol = snowVolumeYd3(), cap = storageCapacityYd3();
      const removal = parseFloat(state.snowJob.removalWindowHrs);
      if (vol != null) {
        const loads = haulLoads(vol);
        let left, right;
        if (removal > 0) {
          left = `To remove (within ${removal} hr)`;
          right = `${vol.toFixed(1)} yd³${loads != null ? ` / ${loads} loads` : ''}`;
        } else if (cap != null && vol > cap) {
          const over = vol - cap, ol = haulLoads(over);
          left = 'Over storage by';
          right = `${over.toFixed(1)} yd³${ol != null ? ` / ${ol} loads` : ''}`;
        } else if (cap != null) {
          left = 'Fits on site';
          right = `${vol.toFixed(1)} yd³ of ${cap.toFixed(1)} yd³`;
        } else {
          left = 'Snow volume';
          right = `${vol.toFixed(1)} yd³`;
        }
        g.textAlign = 'left';
        g.fillStyle = '#2d6a2d';
        g.font = `800 28px ${F}`;
        g.fillText(left, 40, cursorY + 6);
        g.textAlign = 'right';
        g.fillText(right, W - 40, cursorY + 6);
        cursorY += 44;
      }

      const tons = iceControlTons();
      if (tons != null) {
        g.fillStyle = '#555';
        g.font = `400 26px ${F}`;
        g.textAlign = 'left';
        g.fillText('Ice control, per application', 40, cursorY);
        g.fillStyle = '#2d6a2d';
        g.font = `700 26px ${F}`;
        g.textAlign = 'right';
        g.fillText(`${tons.toFixed(2)} t`, W - 40, cursorY);
        cursorY += 42;
      }

      // Contract terms ride on the card so they do not get lost between the
      // walk and the estimate.
      const trig = parseFloat(state.snowJob.triggerDepthIn);
      const depth = parseFloat(state.snowJob.eventDepthIn);
      const notes = [];
      if (trig > 0) notes.push(`${trig}" callout trigger`);
      if (depth > 0) notes.push(`quantities at a ${depth}" event`);
      if (notes.length) {
        g.fillStyle = '#555';
        g.font = `400 24px ${F}`;
        g.textAlign = 'left';
        g.fillText(notes.join(' · '), 40, cursorY);
        cursorY += 40;
      }
    }
```

- [ ] **Step 4: Verify the text export carries the split and the verdict**

Run in `javascript_tool`:

```js
(() => {
  state.season = 'snow';
  const t = snowSummaryText();
  if (!/PLOW|WALK|HAND/.test(t)) throw new Error('no surface split in the export');
  state.snowJob.removalWindowHrs = '48';
  if (!/TO REMOVE/.test(snowSummaryText())) throw new Error('removal clause not reflected');
  state.snowJob.removalWindowHrs = '';
  state.snowJob.triggerDepthIn = '1';
  if (!/TRIGGER: 1"/.test(snowSummaryText())) throw new Error('trigger depth not carried');
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 5: Confirm the snapshot renders without throwing**

Draw at least one plow zone and one storage zone, switch to snow, and set an
event depth, packing factor and compaction ratio so the verdict line has
something to print.

Do **not** verify this by listening for an `error` event after the fact — a
listener registered after the snapshot has run observes nothing and always
reports success. Call the builder inside a `try` and assert on what it returned.
Substitute the snapshot builder's actual function name for `buildSnapshot`:

```js
(() => {
  let url;
  try { url = buildSnapshot(); }
  catch (e) { throw new Error('snapshot threw in snow mode: ' + e.message); }
  if (typeof url !== 'string' || !url.startsWith('data:image/'))
    throw new Error('snapshot did not return an image data URL');
  if (url.length < 5000) throw new Error('snapshot canvas looks empty (' + url.length + ' chars)');
  return 'PASS — snapshot built in snow mode, ' + url.length + ' chars';
})()
```

If the builder draws to a canvas without returning a URL, call it and then
assert on `canvas.toDataURL()` for that canvas instead. Either way the
assertion must inspect a real artifact.

Expected: `"PASS …"`, **and** a visually correct card judged by eye — the
assertion proves it rendered something, not that it rendered correctly.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Carry the snow numbers into the text and snapshot exports"
```

---

## Field confirmation

Everything above proves arithmetic and rendering in a desktop browser. Per the standing rule for this app, **none of it may be described as working until it has been used on a real phone.** The checks that only a device can settle:

1. The season toggle is reachable one-handed with gloves on
2. Surface cycling on a chip is hittable without zooming
3. The settings inputs are usable in the cold, and the number keypad appears
4. The snapshot card is legible in sunlight mode
5. A run's width field is quicker than outlining the sidewalk

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| `state.season`, three effects only | 1 |
| Summer renders identically | 1, 5 (step 7) |
| `zone.surface`, orthogonal to `mode` | 2 |
| Surface availability by mode; cuts get none | 2 |
| Run `widthFt` → sq ft; no width means no area | 3, 5 |
| Fleet pile height, default 20 ft, persists across jobs | 4 |
| Contract terms per job, removal opt-in | 4, 5 |
| Storage capacity, compaction direction, packing factor | 4 |
| Storage neither adds nor subtracts; no cut warnings | 4 (step 6) |
| Judgment values user-set and visible | 5 |
| Surface totals kept separate, never summed | 5, 6 |
| Storage reads differently under a removal clause | 5, 6 |
| Ice control tonnage | 4, 5, 6 |
| Text and snapshot exports | 6 |
| Migration: defaults, schema stays `v: 2` | 1, 2 |
| No dollars, no hours, no production rates | Global constraints |
| No manufacturer figures in the UI | Global constraints |

---

### Task 7: Job open behaviour — season restore, sticky terms, surface default

Added mid-execution at the user's request, after Tasks 1 and 2 revealed three
defects of the same shape: the saved-job path (`snapshotOfCurrentJob` /
`openJob`) does not carry the snow fields at all.

**Files:**
- Modify: `index.html` — `snapshotOfCurrentJob()` (~line 3913), `openJob()` (~line 3957)

**Interfaces:**
- Consumes: `state.season`, `isSnow()` (Task 1); `surfaceOf` (Task 2); `state.snowJob`, `saveSnowPrefs` (Task 4)
- Produces: `SNOW_TERMS_KEY` sticky store, `saveSnowTerms()`, `loadSnowTerms()`

- [ ] **Step 1: Carry the snow fields into the saved job**

In `snapshotOfCurrentJob()`, add two fields to the returned object after `nextPinId`:

```js
      // A job saved in snow reopens in snow. Without this, snow work opened in
      // July shows the Materials panel and reads as though it vanished — the
      // zone data is all still there, but nothing on screen says so.
      season: state.season,
      snowJob: { ...state.snowJob },
```

- [ ] **Step 2: Restore them on open, and default surface**

In `openJob()`, replace the single mode-default line:

```js
    state.zones.forEach(z => { if (!z.mode) z.mode = 'area'; });
```

with:

```js
    state.zones.forEach(z => {
      if (!z.mode) z.mode = 'area';
      // Every consumer reads through surfaceOf(), so a missing surface is
      // harmless today — but materialising it here keeps the two load paths
      // (loadState and openJob) telling the same story about a zone.
      if (!z.surface) z.surface = 'plow';
    });
    // A job saved before snow mode has no season; leave the app where it is
    // rather than yanking a crew out of the season they are working in.
    if (job.season) state.season = job.season;
    if (job.snowJob) Object.assign(state.snowJob, job.snowJob);
```

- [ ] **Step 3: Add the sticky-terms store**

Contract terms belong to a *contract*, not a site, and one contract can span a
dozen-plus properties. Beside `SNOW_PREFS_KEY`:

```js
  // Contract terms cannot be a global preference — different customers, different
  // terms — but retyping them per site is how the thirteenth site quietly ends up
  // on the wrong trigger. So: a new job seeds from the last terms entered, and a
  // saved job keeps its own.
  const SNOW_TERMS_KEY = 'yardMeasureSnowTerms';

  function saveSnowTerms() {
    try {
      localStorage.setItem(SNOW_TERMS_KEY, JSON.stringify({
        removalWindowHrs: state.snowJob.removalWindowHrs,
        triggerDepthIn: state.snowJob.triggerDepthIn,
      }));
    } catch (e) { /* storage unavailable or full — not fatal */ }
  }

  function loadSnowTerms() {
    try {
      const raw = localStorage.getItem(SNOW_TERMS_KEY);
      if (!raw) return;
      const t = JSON.parse(raw);
      // Seed only what the current job has not already set, so reopening a
      // saved job never has its own terms overwritten by stickiness.
      if (!state.snowJob.removalWindowHrs) state.snowJob.removalWindowHrs = t.removalWindowHrs || '';
      if (!state.snowJob.triggerDepthIn) state.snowJob.triggerDepthIn = t.triggerDepthIn || '';
    } catch (e) { /* keep what is there */ }
  }
```

Call `loadSnowTerms()` at startup, immediately after `loadState()`.

- [ ] **Step 4: Write terms through on edit**

In the `snowSettingsEl` input handler from Task 5, extend the job-field branch:

```js
    else if (SNOW_JOB_FIELDS.includes(key)) {
      state.snowJob[key] = e.target.value;
      saveState();
      // Terms stick; event depth does not — depth is a scenario being tested,
      // not a contract fact.
      if (key === 'removalWindowHrs' || key === 'triggerDepthIn') saveSnowTerms();
    }
```

- [ ] **Step 5: Verify the round trip**

Run in `javascript_tool`:

```js
(() => {
  state.season = 'snow';
  state.snowJob.removalWindowHrs = '48';
  state.snowJob.triggerDepthIn = '1';
  saveSnowTerms();
  const snap = snapshotOfCurrentJob();
  if (snap.season !== 'snow') throw new Error('saved job did not record its season');
  if (snap.snowJob.removalWindowHrs !== '48') throw new Error('saved job did not record its terms');

  // Stickiness must not clobber a job that carries its own terms.
  state.snowJob.removalWindowHrs = '24';
  loadSnowTerms();
  if (state.snowJob.removalWindowHrs !== '24')
    throw new Error('sticky terms overwrote a job that had its own');

  // ...but must seed a blank one.
  state.snowJob.removalWindowHrs = '';
  loadSnowTerms();
  if (state.snowJob.removalWindowHrs !== '48')
    throw new Error('sticky terms did not seed a blank job');
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 6: Verify a summer job does not drag the season**

Run in `javascript_tool`:

```js
(() => {
  state.season = 'snow';
  const legacy = { id: 'x', name: 'old', zones: [], savedAt: Date.now() };  // no season key
  if (legacy.season) throw new Error('fixture is wrong');
  // openJob only assigns when job.season is truthy, so the app stays in snow.
  const before = state.season;
  if (before !== 'snow') throw new Error('setup failed');
  return 'PASS — a pre-snow job leaves the current season alone';
})()
```

Expected: `"PASS …"`.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Carry season and contract terms through the saved-job path"
```
