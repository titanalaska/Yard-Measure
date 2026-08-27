# Yard Measure Fence Takeoff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a walked fence line into the post, section and gate counts a material list is built from — using the corner geometry the app already stores.

**Architecture:** A `line` zone can be marked as fence, in summer only. Pure functions derive counts per segment from the zone's own pins. A Fence panel renders them beside the existing panels, and both exports carry them as line items. Nothing in snow, in areas, or in the existing run behaviour changes.

**Tech Stack:** Single-file vanilla JS + MapLibre GL. No build step, no framework, no test runner.

**Spec:** [`docs/superpowers/specs/2026-08-26-yard-measure-fence-takeoff-design.md`](../specs/2026-08-26-yard-measure-fence-takeoff-design.md)

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **The app produces quantities and site facts. It never produces dollars.** No labour hours, no production rates, **no cost codes** — cost codes are Titan's own and vary per job.
- **No invented constants.** Post spacing and concrete-per-post are judgment values.
- **Blank first, then remembered.** Judgment values ship empty; the panel says what it still needs rather than showing a number. The first real value entered becomes every later job's default. The app never asserts a value it made up, and never asks twice.
- **Fence is summer work**, gated on `!isSnow()`. It does not get its own season.
- **Sections are computed per segment, never on total length.** A bend forces a post. `ceil(totalFt / spacing)` under-counts posts on every fence that turns a corner.
- **The app does not decide whether a gate post doubles as a line post.** Gate posts are reported as their own line; the estimator reconciles.
- Storage schema version stays at `v: 2`.
- Snow mode, areas, cut-outs and unmarked runs must all behave **identically to today**.

## Where this lands in the existing code

Anchors verified against `main` at the time of writing. Match on text, not line number.

| What | Where |
|---|---|
| `newZone()` | ~1743 |
| `isLine`, `isSnow`, `SURFACES`, `surfacesFor` | ~1770–1788 |
| `pathLengthM(pins)` → metres; `zoneLenFt` | ~1795, ~1803 |
| Zone chip `acts` string (surface button precedent) | ~1874 |
| Chip click handler, `if (act === 'surface')` | ~1912 |
| `renderLayers()` / `renderSnow()` | ~2603 / ~2761 |
| `#snow-section` markup (structure to mirror) | ~1592 |
| `exportSnapshot()` | ~3581 |
| `renderAll()` | ~4076 |
| `SNOW_PREFS_KEY`, `saveSnowPrefs`, `loadSnowPrefs` (pattern to copy) | ~4092–4099 |
| `jobSummaryText()` | ~4335 |

## Verification approach

**No test harness, by design** — one HTML file to GitHub Pages. The `<script>` block is top-level, not an IIFE, so bindings are console-reachable and verification runs **real assertions against the live app** via the Browser pane's `javascript_tool`, using the `yard-measure` preview server on port 8138.

Three warnings earned the hard way on the snow build, which shipped from this same plan format:

1. **Three verification steps passed without testing anything.** If a check cannot fail, it is not a check.
2. **A field was added with no UI to write it.** Its verification set the value from the console, proving the arithmetic while never proving a user could enter it. **Set values through the real input element**, not by assigning `state`.
3. **Drawing code silently cropped its own output** off the exported PNG while every assertion passed. Where a step says open the image, open the image.

**Field confirmation on a real phone is required before any of this is described as working** — ideally against a fence Joe has already quoted by hand, so the post count can be checked against a known-good answer.

---

### Task 1: Mark a run as fence

**Files:**
- Modify: `index.html` — `newZone()` (~1743), zone-chip `acts` (~1874), chip click handler (~1912), `loadState()` and `openJob()` zone defaults

**Interfaces:**
- Consumes: `isSnow()`, `isLine(z)`, `isDrawn(z)`, `renderAll`, `showToast`
- Produces: `zone.fence` (boolean), `isFence(z)` returning true only for a drawn, fence-marked line zone

- [ ] **Step 1: Add the field and helper**

In `newZone()`, after the existing `widthFt: '',`:

```js
      fence: false,
      gates: [],
      nextGateId: 1,
```

Alongside `surfacesFor` (~1788):

```js
  // Fence is summer work. A run in snow is a sidewalk carrying a width so it
  // yields area to clear; a run in summer can be a fence carrying posts and
  // gates. Same geometry, different question — and the phone has no room to
  // show both.
  const isFence = z => !isSnow() && isLine(z) && isDrawn(z) && !!z.fence;
```

- [ ] **Step 2: Default it on both load paths**

Next to the existing `surface` defaults in `loadState()` AND in `openJob()` — both, they are separate code paths and one was missed during the snow build:

```js
      if (typeof z.fence !== 'boolean') z.fence = false;
      if (!Array.isArray(z.gates)) z.gates = [];
      if (!z.nextGateId) z.nextGateId = 1;
```

- [ ] **Step 3: Add the chip button, summer only**

In `renderZoneTabs()`, extend the `acts` expression. The surface button is snow-only; this is its summer counterpart, and only on runs:

```js
      const acts = active
        ? (isSnow() && !isCut(z)
            ? `<button class="chip-act" data-act="surface" title="Change surface">${SURFACE_LABEL[surfaceOf(z)]}</button>`
            : '') +
          (!isSnow() && isLine(z)
            ? `<button class="chip-act" data-act="fence" title="Mark this run as fence">${z.fence ? 'Fence' : 'Run'}</button>`
            : '') +
          `<button class="chip-act" data-act="mode" title="Switch between area, cut-out and run">${icon(MODE_ICON[z.mode] || MODE_ICON.area, 'ic-sm')}</button>` +
          `<button class="chip-act" data-act="rename" title="Rename">${icon('edit','ic-sm')}</button>` +
          (n > 1 ? `<button class="chip-act" data-act="delete" title="Delete zone">${icon('x','ic-sm')}</button>` : '')
        : '';
```

- [ ] **Step 4: Handle the tap**

In the chip click handler, immediately before `if (act === 'surface') {`:

```js
    if (act === 'fence') {
      zone.fence = !zone.fence;
      renderAll();
      saveState();
      showToast(zone.fence
        ? `"${zone.name}" is a fence line — posts and gates`
        : `"${zone.name}" is a plain run — measured by the foot`);
      return;
    }
```

- [ ] **Step 5: Verify the flag is summer-only and round-trips**

Draw a two-pin run in the UI. Then run in `javascript_tool`:

```js
(() => {
  const z = state.zones.find(x => isLine(x) && isDrawn(x));
  if (!z) throw new Error('draw a two-pin run first — this check is vacuous without one');

  state.season = 'summer'; renderAll();
  const summerHtml = document.getElementById('zone-tabs').innerHTML;
  if (!/data-act="fence"/.test(summerHtml)) throw new Error('no fence button on a run in summer');

  state.season = 'snow'; renderAll();
  if (/data-act="fence"/.test(document.getElementById('zone-tabs').innerHTML))
    throw new Error('fence button leaked into snow');

  state.season = 'summer'; renderAll();
  z.fence = true;
  if (!isFence(z)) throw new Error('isFence false for a marked, drawn run in summer');
  state.season = 'snow';
  if (isFence(z)) throw new Error('isFence must be false in snow');
  state.season = 'summer';

  saveState();
  const back = JSON.parse(localStorage.getItem('yardMeasureState'));
  if (!back.zones.find(x => x.id === z.id).fence) throw new Error('fence flag not persisted');
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Let a summer run be marked as a fence line"
```

---

### Task 2: Shop settings, blank then remembered

**Files:**
- Modify: `index.html` — `state` object, persistence section near `SNOW_PREFS_KEY` (~4092), startup sequence

**Interfaces:**
- Consumes: nothing new
- Produces: `state.fencePrefs` = `{ spacingFt, bagsPerPost }`, `saveFencePrefs()`, `loadFencePrefs()`

- [ ] **Step 1: Add the settings to state**

In the `state` object, after the `snowJob` block:

```js
    // How Titan builds fence, not a fact about any one site — so it outlives
    // the job. Both ship EMPTY and are retained once entered: the app must
    // never assert a spacing it made up, and must never ask twice. Post
    // spacing is genuinely unsettled (panel widths constrain it; chainlink
    // runs further), and hole depth here is driven by frost.
    fencePrefs: {
      spacingFt: '',
      bagsPerPost: '',
    },
```

- [ ] **Step 2: Persist to their own key**

Beside `SNOW_PREFS_KEY`, copying that pattern exactly:

```js
  const FENCE_PREFS_KEY = 'yardMeasureFencePrefs';

  function saveFencePrefs() {
    try { localStorage.setItem(FENCE_PREFS_KEY, JSON.stringify(state.fencePrefs)); }
    catch (e) { /* storage unavailable or full — not fatal */ }
  }

  function loadFencePrefs() {
    try {
      const raw = localStorage.getItem(FENCE_PREFS_KEY);
      if (raw) Object.assign(state.fencePrefs, JSON.parse(raw));
    } catch (e) { /* keep the defaults */ }
  }
```

Call `loadFencePrefs()` at startup immediately after the existing `loadSnowPrefs()` call, and confirm it lands **before** the first `renderAll()` — otherwise a remembered spacing will not appear in the inputs until something else forces a re-render.

- [ ] **Step 3: Verify retention survives a reload**

Run in `javascript_tool`:

```js
(() => {
  localStorage.removeItem('yardMeasureFencePrefs');
  state.fencePrefs.spacingFt = '';
  if (state.fencePrefs.spacingFt !== '') throw new Error('should start blank');
  state.fencePrefs.spacingFt = '8';
  saveFencePrefs();
  return 'PASS — 8 stored; now reload and run the second check';
})()
```

Reload, then:

```js
(() => {
  if (state.fencePrefs.spacingFt !== '8')
    throw new Error('spacing not remembered across reload, got ' + JSON.stringify(state.fencePrefs.spacingFt));
  if (state.fencePrefs.bagsPerPost !== '')
    throw new Error('bagsPerPost should still be blank — nothing entered it');
  return 'PASS';
})()
```

Expected: `"PASS"` for both. The second assertion is the point: retention must not invent the value nobody typed.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add fence shop settings that ship blank and are then remembered"
```

---

### Task 3: The arithmetic

**Files:**
- Modify: `index.html` — new `// ── FENCE ──` section after the `SNOW` section

**Interfaces:**
- Consumes: `project(pins)` (returns metres), `M_TO_FT`, `zoneLenFt(z)`, `isFence(z)`, `state.fencePrefs`
- Produces: `segmentLengthsFt(z)` returning an array of per-segment feet; `fenceCounts(z)` returning `{ runFt, sections, posts, terminal, corner, line, gateCount, gateWidthFt, netFenceFt, gatePosts, bags }` or `null`

- [ ] **Step 1: Add the section and per-segment lengths**

```js
  // ── FENCE ────────────────────────────────────────────
  // A fence is bought as posts and sections, not by the foot — and the app
  // already knows where the corner posts go, because every pin on a run IS a
  // vertex. First and last are terminals, interior pins are corners, line posts
  // fall between at the shop's spacing. A tape measure cannot hand you that.
  function segmentLengthsFt(z) {
    const pts = project(z.pins);
    const out = [];
    for (let i = 1; i < pts.length; i++)
      out.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * M_TO_FT);
    return out;
  }
```

- [ ] **Step 2: Add the counts**

```js
  function fenceCounts(z) {
    if (!isFence(z)) return null;
    const spacing = parseFloat(state.fencePrefs.spacingFt);
    if (!(spacing > 0)) return null;   // blank spacing: say what is needed, never guess

    // Per segment, NOT on the total. A bend forces a post onto the corner, so
    // each straight run rounds up on its own. ceil(total / spacing) would
    // under-count posts on every fence that turns — and most fences turn.
    // max(1, …) covers a segment shorter than one bay, which still needs a bay.
    const segs = segmentLengthsFt(z);
    const sections = segs.reduce((s, len) => s + Math.max(1, Math.ceil(len / spacing)), 0);

    const posts = sections + 1;        // an open path with S bays has S+1 posts
    const n = z.pins.length;
    const terminal = 2;                // the two ends
    const corner = Math.max(0, n - 2); // every interior vertex
    const line = Math.max(0, posts - terminal - corner);

    const gates = z.gates || [];
    const gateCount = gates.length;
    const gateWidthFt = gates.reduce((s, g) => s + (parseFloat(g.widthFt) || 0), 0);
    const runFt = zoneLenFt(z);
    const netFenceFt = Math.max(0, runFt - gateWidthFt);
    // Two per opening. Whether one doubles as a line post depends on where the
    // gate falls and how the crew frames it — that is the estimator's call, so
    // gate posts are reported on their own line rather than netted off.
    const gatePosts = gateCount * 2;

    const bagsPer = parseFloat(state.fencePrefs.bagsPerPost);
    const bags = bagsPer > 0 ? Math.ceil((posts + gatePosts) * bagsPer) : null;

    return { runFt, sections, posts, terminal, corner, line,
             gateCount, gateWidthFt, netFenceFt, gatePosts, bags };
  }

  const fenceRuns = () => state.zones.filter(isFence);
```

- [ ] **Step 3: Verify the counts by hand**

Run in `javascript_tool`:

```js
(() => {
  state.season = 'summer';
  state.fencePrefs.spacingFt = '8';
  state.fencePrefs.bagsPerPost = '1';

  const z = state.zones.find(x => isLine(x) && isDrawn(x));
  if (!z) throw new Error('draw a run first — vacuous without one');
  z.fence = true; z.gates = [];

  const segs = segmentLengthsFt(z);
  if (segs.length !== z.pins.length - 1) throw new Error('one length per segment expected');
  const byHand = segs.reduce((s, len) => s + Math.max(1, Math.ceil(len / 8)), 0);
  const c = fenceCounts(z);
  if (c.sections !== byHand) throw new Error(`sections ${c.sections} != hand ${byHand}`);
  if (c.posts !== c.sections + 1) throw new Error('posts must be sections + 1');
  if (c.terminal + c.corner + c.line !== c.posts) throw new Error('post types must sum to total');
  if (c.corner !== z.pins.length - 2) throw new Error('corner posts must equal interior vertices');

  // The defect this guards: total-length rounding under-counts a bent fence.
  const naive = Math.ceil(segs.reduce((a, b) => a + b, 0) / 8);
  if (segs.length > 1 && c.sections < naive)
    throw new Error('per-segment must never be fewer than total-length rounding');

  // Blank spacing must yield null, never a number.
  state.fencePrefs.spacingFt = '';
  if (fenceCounts(z) !== null) throw new Error('blank spacing must return null');
  state.fencePrefs.spacingFt = '8';

  // Blank bags must omit, not zero.
  state.fencePrefs.bagsPerPost = '';
  if (fenceCounts(z).bags !== null) throw new Error('blank bagsPerPost must be null, not 0');
  state.fencePrefs.bagsPerPost = '1';
  return `PASS — ${c.sections} sections, ${c.posts} posts (${c.terminal}T/${c.corner}C/${c.line}L)`;
})()
```

Expected: `"PASS — …"`.

- [ ] **Step 4: Verify a deliberately bent fence**

This is the case the per-segment rule exists for. Construct three collinear-ish
points where total-length rounding and per-segment rounding disagree:

```js
(() => {
  const spacing = 8;
  // Two 12 ft segments: per-segment = 2+2 = 4 bays. Total-length = ceil(24/8) = 3.
  const segs = [12, 12];
  const perSeg = segs.reduce((s, l) => s + Math.max(1, Math.ceil(l / spacing)), 0);
  const naive = Math.ceil(segs.reduce((a, b) => a + b, 0) / spacing);
  if (perSeg !== 4) throw new Error('expected 4 bays per segment');
  if (naive !== 3) throw new Error('expected 3 bays by total length');
  return `PASS — a single bend is worth ${perSeg - naive} extra bay and post here`;
})()
```

Expected: `"PASS — a single bend is worth 1 extra bay and post here"`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Derive fence posts and sections from the walked corner geometry"
```

---

### Task 4: Gates

**Files:**
- Modify: `index.html` — `FENCE` section, and the panel from Task 5 once it exists

**Interfaces:**
- Consumes: `isFence(z)`, `saveState()`
- Produces: `addGate(z)`, `removeGate(z, id)` — mutators only; `fenceCounts` already reads `z.gates`

- [ ] **Step 1: Add the mutators**

```js
  // A gate belongs to a run, not a job: a driveway gate on the street line and
  // a walk gate on the side line are different openings on different fences.
  function addGate(z) {
    z.gates = z.gates || [];
    z.gates.push({ id: z.nextGateId++, widthFt: '' });
    saveState();
  }

  function removeGate(z, id) {
    z.gates = (z.gates || []).filter(g => g.id !== id);
    saveState();
  }
```

- [ ] **Step 2: Verify gates subtract without disturbing posts**

Run in `javascript_tool`:

```js
(() => {
  state.season = 'summer';
  state.fencePrefs.spacingFt = '8';
  const z = state.zones.find(isFence);
  if (!z) throw new Error('mark a run as fence first — vacuous without one');

  z.gates = [];
  const before = fenceCounts(z);
  addGate(z);
  z.gates[0].widthFt = '4';
  const after = fenceCounts(z);

  if (Math.abs(after.netFenceFt - (before.runFt - 4)) > 0.001)
    throw new Error('gate width must come off net fence length');
  if (after.gatePosts !== 2) throw new Error('one gate is two gate posts');
  if (after.line !== before.line || after.corner !== before.corner || after.posts !== before.posts)
    throw new Error('a gate must not silently change the line/corner/total post counts');
  if (after.runFt !== before.runFt) throw new Error('run length is the walked length and does not change');

  removeGate(z, z.gates[0].id);
  if (fenceCounts(z).gateCount !== 0) throw new Error('gate not removed');
  return 'PASS';
})()
```

Expected: `"PASS"`. The third assertion is the important one — it pins the spec's rule that the app does not decide whether a gate post doubles as a line post.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add per-run gate openings"
```

---

### Task 5: The Fence panel

**Files:**
- Modify: `index.html` — markup after `#snow-section` (~1601), `renderAll()` (~4076), new render functions in the `FENCE` section

**Interfaces:**
- Consumes: everything from Tasks 1–4, plus `escapeHtml`, `escapeAttr`, existing classes `.layer-item`, `.layer-row1`, `.empty-state`, `.layers-total`, `.section-header`, `.section-title`, `.pin-count`
- Produces: `renderFence()`, owning `#fence-section` visibility the way `renderSnow()` owns its own

- [ ] **Step 1: Add the markup**

After the closing `</div>` of `#snow-section`:

```html
<div id="fence-section" style="display:none;">
  <div class="section-header">
    <span class="section-title">Fence</span>
    <span class="pin-count" id="fence-count">0 runs</span>
  </div>
  <div id="fence-runs"></div>
  <div id="fence-total" class="layers-total"></div>
  <div id="fence-settings"></div>
</div>
```

Give it the same padding rule `#snow-section` has, or it sits flush to the screen edge on a phone.

- [ ] **Step 2: Own its own visibility and wire it in**

Add one line to `renderAll()` after `renderSnow();`:

```js
    renderFence();
```

`renderFence()` owns `#fence-section` display and returns early when it should not show — do **not** also set it from `renderAll()`, or the two fight:

```js
  function renderFence() {
    const runs = fenceRuns();
    if (isSnow() || !runs.length) { fenceSection.style.display = 'none'; return; }
    fenceSection.style.display = 'block';
    fenceCountEl.textContent = `${runs.length} run${runs.length !== 1 ? 's' : ''}`;
    renderFenceRuns(runs);
    renderFenceTotal(runs);
    renderFenceSettings();
  }
```

Declare `fenceSection`, `fenceRunsEl`, `fenceTotalEl`, `fenceSettingsEl`, `fenceCountEl` alongside the existing snow element lookups.

- [ ] **Step 3: Render each run**

```js
  function renderFenceRuns(runs) {
    const spacing = parseFloat(state.fencePrefs.spacingFt);
    if (!(spacing > 0)) {
      fenceRunsEl.innerHTML = `<div class="empty-state">Set the post spacing below to get post and section counts</div>`;
      return;
    }
    fenceRunsEl.innerHTML = runs.map(z => {
      const c = fenceCounts(z);
      const gates = (z.gates || []).map(g => `
        <div class="layer-row1">
          <span>Gate</span>
          <input type="number" class="fence-gate-width" data-zone="${z.id}" data-gate="${g.id}"
                 value="${escapeAttr(g.widthFt ?? '')}" placeholder="ft" min="0" step="0.5" inputmode="decimal">
          <button class="chip-act fence-gate-remove" data-zone="${z.id}" data-gate="${g.id}" title="Remove gate">${icon('x','ic-sm')}</button>
        </div>`).join('');
      return `
        <div class="layer-item" data-zone="${z.id}">
          <div class="layer-row1"><strong>${escapeHtml(z.name)}</strong><span>${Math.round(c.runFt).toLocaleString()} ft</span></div>
          <div class="layer-row1"><span>Sections</span><strong>${c.sections}</strong></div>
          <div class="layer-row1"><span>Posts — ${c.terminal} end, ${c.corner} corner, ${c.line} line</span><strong>${c.posts}</strong></div>
          ${gates}
          ${c.gateCount ? `<div class="layer-row1"><span>Gate posts</span><strong>${c.gatePosts}</strong></div>
          <div class="layer-row1"><span>Net fence</span><strong>${Math.round(c.netFenceFt).toLocaleString()} ft</strong></div>` : ''}
          <button class="btn btn-secondary fence-add-gate" data-zone="${z.id}">+ Gate</button>
        </div>`;
    }).join('');
  }
```

- [ ] **Step 4: Render the job total**

```js
  function renderFenceTotal(runs) {
    const cs = runs.map(fenceCounts).filter(Boolean);
    if (!cs.length) { fenceTotalEl.innerHTML = ''; return; }
    const sum = k => cs.reduce((s, c) => s + c[k], 0);
    const bags = cs.every(c => c.bags != null) ? sum('bags') : null;
    fenceTotalEl.innerHTML =
      `<strong>${sum('posts') + sum('gatePosts')} posts</strong> · ${sum('sections')} sections`
      + `<br><span style="font-weight:400;">${sum('terminal')} end · ${sum('corner')} corner · ${sum('line')} line · ${sum('gatePosts')} gate</span>`
      + `<br><span style="font-weight:400;">${Math.round(sum('netFenceFt')).toLocaleString()} ft of fence`
      + (sum('gateCount') ? `, ${sum('gateCount')} gate${sum('gateCount') !== 1 ? 's' : ''} (${Math.round(sum('gateWidthFt')).toLocaleString()} ft)` : '')
      + `</span>`
      + (bags != null ? `<br><span style="font-weight:400;">Concrete: ${bags} bags</span>` : '');
  }
```

- [ ] **Step 5: Render the settings**

```js
  function renderFenceSettings() {
    const p = state.fencePrefs;
    const num = (cls, val, ph, step) =>
      `<input type="number" class="${cls}" value="${escapeAttr(val ?? '')}" placeholder="${escapeAttr(ph)}" min="0" step="${step}" inputmode="decimal">`;
    fenceSettingsEl.innerHTML = `
      <div class="layer-item">
        <div class="layer-row1"><span>Post spacing (on centre)</span>${num('fence-spacingFt', p.spacingFt, 'ft', '0.5')}</div>
        <div class="layer-row1"><span>Concrete per post</span>${num('fence-bagsPerPost', p.bagsPerPost, 'bags', '0.5')}</div>
      </div>
      <div class="empty-state">These are remembered for the next job once you set them.</div>`;
  }
```

- [ ] **Step 6: Wire the handlers**

Gate widths and settings both re-render the counts but must **not** rebuild the inputs they are typed into — that destroys focus mid-keystroke. Gate width changes the numbers shown beside it, so re-render the total and leave the run list alone until blur:

```js
  fenceSettingsEl.addEventListener('input', (e) => {
    const cls = [...e.target.classList].find(c => c.startsWith('fence-'));
    if (!cls) return;
    const key = cls.slice(6);
    if (!['spacingFt', 'bagsPerPost'].includes(key)) return;
    state.fencePrefs[key] = e.target.value;
    saveFencePrefs();
    // Rebuild the run list — spacing changes every count — but never the
    // settings inputs, which is where the caret is.
    renderFenceRuns(fenceRuns());
    renderFenceTotal(fenceRuns());
  });

  fenceRunsEl.addEventListener('input', (e) => {
    if (!e.target.classList.contains('fence-gate-width')) return;
    const z = state.zones.find(x => x.id === Number(e.target.dataset.zone));
    const g = z && (z.gates || []).find(x => x.id === Number(e.target.dataset.gate));
    if (!g) return;
    g.widthFt = e.target.value;
    saveState();
    renderFenceTotal(fenceRuns());   // totals only — the caret is in the run list
  });

  fenceRunsEl.addEventListener('click', (e) => {
    const add = e.target.closest('.fence-add-gate');
    const rm = e.target.closest('.fence-gate-remove');
    const z = state.zones.find(x => x.id === Number((add || rm || {}).dataset?.zone));
    if (!z) return;
    if (add) addGate(z);
    else if (rm) removeGate(z, Number(rm.dataset.gate));
    renderFence();
  });
```

- [ ] **Step 7: Verify through the real UI**

**Set the spacing by typing into the actual input**, not by assigning state — the snow build shipped a field with no writer because its check took the shortcut. Use the Browser pane's `form_input` on `.fence-spacingFt`, then:

```js
(() => {
  state.season = 'summer';
  const z = state.zones.find(x => isLine(x) && isDrawn(x));
  if (!z) throw new Error('draw a run first');
  z.fence = true; renderAll();

  const input = document.querySelector('.fence-spacingFt');
  if (!input) throw new Error('no spacing input rendered');
  if (input.value !== '8') throw new Error('set spacing to 8 through the input first, got ' + JSON.stringify(input.value));
  if (state.fencePrefs.spacingFt !== '8') throw new Error('typing did not reach state');

  const sec = document.getElementById('fence-section');
  if (sec.style.display === 'none') throw new Error('fence panel hidden with a fence run present');
  if (!/Sections/.test(document.getElementById('fence-runs').innerHTML)) throw new Error('no counts rendered');

  state.season = 'snow'; renderAll();
  if (document.getElementById('fence-section').style.display !== 'none')
    throw new Error('fence panel visible in snow');
  state.season = 'summer'; renderAll();
  return 'PASS';
})()
```

Expected: `"PASS"`.

- [ ] **Step 8: Look at it**

Open the panel in the browser with (a) no fence runs, (b) a fence run and blank spacing, (c) everything filled in with two gates. Confirm it reads sensibly and nothing overflows. Report what you saw.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "Add the fence panel with per-run posts, sections and gates"
```

---

### Task 6: Exports

**Files:**
- Modify: `index.html` — `jobSummaryText()` (~4335), the copy handler, `exportSnapshot()` (~3581)

**Interfaces:**
- Consumes: everything above
- Produces: `fenceSummaryLines()` returning an array of strings appended to the summer text export

- [ ] **Step 1: Add the line-item text**

Per Buildertrend's help documentation, estimate line items carry a Title, Cost Code, Cost Type, Group and Description, and takeoffs import as line-item rows. So this is **one quantity-plus-unit per line**, so it maps onto line items without retyping. **No cost codes** — those are Titan's.

```js
  // One quantity + unit per line, so this maps onto estimate line items
  // without retyping. Deliberately no cost codes and no prices.
  function fenceSummaryLines() {
    const runs = fenceRuns();
    const cs = runs.map(fenceCounts).filter(Boolean);
    if (!cs.length) return [];
    const lines = ['', 'FENCE'];
    const ft = v => Math.round(v).toLocaleString();

    runs.forEach((z, i) => {
      const c = cs[i];
      if (!c) return;
      lines.push(`${z.name}`);
      lines.push(`   Run length          ${ft(c.runFt)} ft`);
      if (c.gateCount) {
        lines.push(`   Gates               ${c.gateCount} (${ft(c.gateWidthFt)} ft)`);
        lines.push(`   Net fence           ${ft(c.netFenceFt)} ft`);
      }
      lines.push(`   Sections            ${c.sections} ea`);
      lines.push(`   Terminal posts      ${c.terminal} ea`);
      if (c.corner) lines.push(`   Corner posts        ${c.corner} ea`);
      lines.push(`   Line posts          ${c.line} ea`);
      if (c.gatePosts) lines.push(`   Gate posts          ${c.gatePosts} ea`);
      lines.push(`   Total posts         ${c.posts + c.gatePosts} ea`);
      if (c.bags != null) lines.push(`   Concrete            ${c.bags} bags`);
    });

    if (cs.length > 1) {
      const sum = k => cs.reduce((s, c) => s + c[k], 0);
      lines.push('');
      lines.push(`FENCE TOTAL           ${sum('posts') + sum('gatePosts')} posts, ${sum('sections')} sections`);
      lines.push(`   Net fence           ${ft(sum('netFenceFt'))} ft`);
      if (cs.every(c => c.bags != null)) lines.push(`   Concrete            ${sum('bags')} bags`);
    }
    return lines;
  }
```

- [ ] **Step 2: Append it to the summer summary**

In `jobSummaryText()`, immediately before the final `return lines.join('\n');`:

```js
    lines.push(...fenceSummaryLines());
```

`jobSummaryText()` is only reached in summer (the copy handler branches on `isSnow()`), and `fenceSummaryLines()` returns `[]` when there is no fence, so an ordinary summer job is unchanged.

- [ ] **Step 3: Add the snapshot block**

In `exportSnapshot()`, after the existing materials block and gated the same way, using the card's established conventions — 40px left margin, `W - 40` right, `#1a1a1a` headings at `700 30px`, `#555` labels at `400 26px`, `#2d6a2d` figures at `700 26px`, `cursorY += 42` per row and `+= 44` after a total:

```js
    // fence — posts and sections, the numbers a material list is built from
    const fenceCs = !isSnow() ? fenceRuns().map(fenceCounts).filter(Boolean) : [];
    if (fenceCs.length) {
      const sum = k => fenceCs.reduce((s, c) => s + c[k], 0);
      g.textAlign = 'left';
      g.fillStyle = '#1a1a1a';
      g.font = `700 30px ${F}`;
      g.fillText('Fence', 40, cursorY);
      cursorY += 40;

      const rows = [
        ['Sections', `${sum('sections')}`],
        ['Posts — end / corner / line', `${sum('terminal')} / ${sum('corner')} / ${sum('line')}`],
      ];
      if (sum('gateCount')) {
        rows.push(['Gates', `${sum('gateCount')} (${Math.round(sum('gateWidthFt')).toLocaleString()} ft)`]);
        rows.push(['Gate posts', `${sum('gatePosts')}`]);
      }
      rows.push(['Net fence', `${Math.round(sum('netFenceFt')).toLocaleString()} ft`]);
      if (fenceCs.every(c => c.bags != null)) rows.push(['Concrete', `${sum('bags')} bags`]);

      rows.forEach(([label, val]) => {
        g.fillStyle = '#555';
        g.font = `400 26px ${F}`;
        g.textAlign = 'left';
        g.fillText(label, 40, cursorY);
        g.fillStyle = '#2d6a2d';
        g.font = `700 26px ${F}`;
        g.textAlign = 'right';
        g.fillText(val, W - 40, cursorY);
        cursorY += 42;
      });

      g.textAlign = 'left';
      g.fillStyle = '#2d6a2d';
      g.font = `800 28px ${F}`;
      g.fillText('Total posts', 40, cursorY + 6);
      g.textAlign = 'right';
      g.fillText(`${sum('posts') + sum('gatePosts')}`, W - 40, cursorY + 6);
      cursorY += 44;
    }
```

- [ ] **Step 4: Reserve the canvas height**

**This is the step the snow build got wrong**, and every assertion still passed — the drawing code ran, the card rendered, and the new block was silently cropped off the bottom along with the footer. Find the `H` calculation near the top of `exportSnapshot()` and add room for the fence block using the same row-counting convention the sibling blocks use: 40 for the heading, 42 per row, 44 for the total. Gate it on the same condition as the drawing.

- [ ] **Step 5: Verify the text and then look at the card**

```js
(() => {
  state.season = 'summer';
  state.fencePrefs.spacingFt = '8';
  const t = jobSummaryText();
  if (!/FENCE/.test(t)) throw new Error('no fence section in the summer export');
  if (!/Terminal posts/.test(t) || !/Sections/.test(t)) throw new Error('missing post or section lines');
  if (/\$/.test(t)) throw new Error('a dollar sign reached the export');

  // An ordinary summer job with no fence must be byte-identical to before.
  fenceRuns().forEach(z => { z.fence = false; });
  const plain = jobSummaryText();
  if (/FENCE/.test(plain)) throw new Error('fence section leaked into a job with no fence runs');
  fenceRuns();
  return 'PASS';
})()
```

Then export a snapshot **with** fence and **without**, and **open both PNGs**. Confirm the fence block is fully visible with nothing cropped, the no-fence card is unchanged, and report what each showed.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Carry the fence counts into the text and snapshot exports"
```

---

## Field confirmation

Browser assertions prove arithmetic; they do not prove usability. Before any of this is described as working:

1. Walk a real fence line and confirm the corner count matches the corners that are actually there
2. **Check the post count against a fence Joe has already quoted by hand** — this is the one test that validates the whole idea
3. Confirm the spacing and gate fields are usable one-handed outdoors
4. Confirm the snapshot card is legible in sunlight mode
5. Confirm a remembered spacing survives closing and reopening the installed app

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| `zone.fence`, summer only, gated on `!isSnow()` | 1 |
| Defaults on both load paths | 1 |
| `fencePrefs` persist across jobs, own key | 2 |
| Blank first, then remembered | 2, 5 |
| Sections per segment, never total length | 3 |
| Terminal / corner / line post split from vertices | 3 |
| Gates per run, subtract from net fence | 4 |
| App does not decide if a gate post doubles as a line post | 3, 4 |
| Concrete per post, omitted when unset | 3, 5 |
| Panel, summer only, per run and job total | 5 |
| Line-item export format, no cost codes | 6 |
| Snapshot block **with height reserved** | 6 |
| No dollars, no hours, no invented constants | Global Constraints |
| Snow, areas, cut-outs, unmarked runs unchanged | 1, 5, 6 |
