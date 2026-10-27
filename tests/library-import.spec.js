// Import library (10/26/26).
//
// The saved-jobs library lives only in the browser that measured, and
// export.html was the one road off a device. On 10/26/26 a browser profile
// was wiped and five snow lots went with it -- the export from that evening
// had every one, and there was no way to load it back. The same gap bites a
// PM who changes phones.
//
// So export.html now takes a file back. These pin the contract, not the
// markup: the count is shown BEFORE anything is written, a job with the same
// id takes the file's copy in its place, every other stored job is kept
// (stored first, then the file's new ones), a file that is not a Bootprint
// export is refused and writes nothing, and the job open in the app is never
// touched. Every expected count is worked out in the comments.

const path = require('path');
const { test, expect } = require('@playwright/test');
const { loadApp } = require('./helpers');

// Normally the page next door. BOOTPRINT_EXPORT points these tests at a
// deliberately broken copy, which is how `npm run verify-tests` proves they
// can fail -- see tests/mutation-check.js.
const EXPORT_PAGE = 'file://' +
  path.resolve(__dirname, '..', process.env.BOOTPRINT_EXPORT || 'export.html').replace(/\\/g, '/');

const JOBS_KEY = 'yardMeasureJobs';
const STATE_KEY = 'yardMeasureState';

// A saved job as index.html files it (snapshotOfCurrentJob), with the fields
// the Jobs list and the export page read. Nothing here measures, so zones
// stay empty: the merge is by id and never looks inside a job.
function job(id, name, extra) {
  return Object.assign({
    id, name, siteId: null, started: 1700000000000, savedAt: 1700000000000,
    sqft: 1000, lenFt: 0, zoneCount: 0, zones: [], nextZoneId: 1, nextPinId: 1,
    season: 'snow', snowJob: {},
  }, extra || {});
}

// The file export.html writes, with the keys it writes.
function exportFile(jobs, extra) {
  return Object.assign({
    schema: 'bootprint-library-export',
    version: 1,
    exportedAt: '2026-10-26T18:56:00.000Z',
    jobCount: jobs.length,
    jobs,
    current: null,
    prefs: { snow: null, fence: null, snowTerms: null },
  }, extra || {});
}

// Open export.html over what a browser already holds. The seed is written
// AFTER the first load and the page reloaded, rather than through
// addInitScript: an init script runs again on every later navigation, and
// the end-to-end test below goes on to index.html, which would re-seed the
// old library over the import it is there to check.
async function openExport(page, seed) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(EXPORT_PAGE);
  if (seed) {
    await page.evaluate((s) => {
      Object.keys(s).forEach((k) => {
        localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k]));
      });
    }, seed);
    await page.reload();
  }
  await page.waitForSelector('#import-btn', { timeout: 5000 });
  if (errors.length) {
    throw new Error('export.html did not load cleanly:\n  ' + errors.join('\n  '));
  }
  return page;
}

// Hand the hidden file input a file, as picking one from the phone's files
// would. Playwright sets it straight on the input, hidden or not.
async function pick(page, contents, name) {
  const text = typeof contents === 'string' ? contents : JSON.stringify(contents);
  await page.locator('#import-file').setInputFiles({
    name: name || 'bootprint-library-2026-10-26.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

const rawJobs = (page) => page.evaluate((k) => localStorage.getItem(k), JOBS_KEY);
const storedJobs = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), JOBS_KEY);
const status = (page) => page.locator('#import-status');
const go = (page) => page.locator('#import-go');

test('the count is shown before anything is written, and the tap writes it', async ({ page }) => {
  // Stored: a, b. In the file: a, b (again), c, d, e.
  //   in the file     = 5
  //   already here    = a, b          = 2
  //   new             = c, d, e       = 3
  // After the tap the library holds a, b, c, d, e = 5.
  const here = [job('ja', 'Lot A, as measured here'), job('jb', 'Lot B')];
  await openExport(page, { [JOBS_KEY]: here });
  const before = await rawJobs(page);

  await pick(page, exportFile([
    job('ja', 'Lot A, from the file'), job('jb', 'Lot B'),
    job('jc', 'Lot C'), job('jd', 'Lot D'), job('je', 'Lot E'),
  ]));
  await expect(status(page)).toHaveText('5 jobs in the file, 2 already here, 3 new');
  await expect(go(page)).toBeVisible();
  // Counted, not written: the library is byte for byte what it was.
  expect(await rawJobs(page)).toBe(before);

  await go(page).click();
  await expect(status(page)).toHaveText('Done — 5 jobs in the library (3 new, 2 replaced)');
  const after = await storedJobs(page);
  expect(after.map((j) => j.id)).toEqual(['ja', 'jb', 'jc', 'jd', 'je']);
  expect(after[0].name).toBe('Lot A, from the file');
  // The page is the export page too, and its headline now counts five.
  await expect(page.locator('.headline').first()).toContainText('5');
});

test('merging by id keeps the stored jobs the file does not have, stored first then new', async ({ page }) => {
  // Stored: a, b. File: c only.
  //   in the file = 1, already here = 0, new = 1.
  // After: a, b, c -- the stored two untouched and first, c after them.
  const here = [job('ja', 'Lot A', { sqft: 100 }), job('jb', 'Lot B', { sqft: 200 })];
  await openExport(page, { [JOBS_KEY]: here });

  await pick(page, exportFile([job('jc', 'Lot C', { sqft: 300 })]));
  await expect(status(page)).toHaveText('1 job in the file, 0 already here, 1 new');
  await go(page).click();
  await expect(status(page)).toHaveText('Done — 3 jobs in the library (1 new, 0 replaced)');

  const after = await storedJobs(page);
  expect(after.map((j) => [j.id, j.name, j.sqft])).toEqual([
    ['ja', 'Lot A', 100],
    ['jb', 'Lot B', 200],
    ['jc', 'Lot C', 300],
  ]);
});

test("a job with the same id takes the file's copy, in its place", async ({ page }) => {
  // Stored: a (100 sq ft, named here), b (200). File: a again at 250 sq ft.
  //   in the file = 1, already here = 1, new = 0.
  // After: a is the file's (250, the file's name) and still first; b is
  // untouched; still 2 jobs, not 3.
  const here = [
    job('ja', 'Lot A, measured here', { sqft: 100 }),
    job('jb', 'Lot B', { sqft: 200 }),
  ];
  await openExport(page, { [JOBS_KEY]: here });

  await pick(page, exportFile([job('ja', 'Lot A, from the file', { sqft: 250 })]));
  await expect(status(page)).toHaveText('1 job in the file, 1 already here, 0 new');
  await go(page).click();
  await expect(status(page)).toHaveText('Done — 2 jobs in the library (0 new, 1 replaced)');

  const after = await storedJobs(page);
  expect(after).toHaveLength(2);
  expect(after[0].id).toBe('ja');
  expect(after[0].name).toBe('Lot A, from the file');
  expect(after[0].sqft).toBe(250);
  expect(after[1].id).toBe('jb');
  expect(after[1].sqft).toBe(200);
});

test('a file that is not a Bootprint library export is refused and writes nothing', async ({ page }) => {
  // The likeliest wrong file: the app's own SITE library export, which also
  // carries a jobs array. Its jobs must not land.
  const here = [job('ja', 'Lot A')];
  await openExport(page, { [JOBS_KEY]: here });
  const before = await rawJobs(page);

  await pick(page, {
    format: 'yard-measure-library-1',
    sites: [],
    jobs: [job('jx', 'From the wrong file')],
  }, 'yard-measure-library-2026-10-26.json');
  await expect(status(page)).toHaveText('That is not a Bootprint library export.');
  await expect(go(page)).toBeHidden();
  expect(await rawJobs(page)).toBe(before);
});

test('a file that is not JSON at all is refused and writes nothing', async ({ page }) => {
  const here = [job('ja', 'Lot A')];
  await openExport(page, { [JOBS_KEY]: here });
  const before = await rawJobs(page);

  await pick(page, 'Lot A, 12,000 sq ft\n', 'notes.json');
  await expect(status(page)).toHaveText("Couldn't read that file.");
  await expect(go(page)).toBeHidden();
  expect(await rawJobs(page)).toBe(before);
});

test('the job open in the app is never touched by an import', async ({ page }) => {
  // The file carries the exporting phone's open job under `current`. The
  // state blob here belongs to THIS phone and stays byte for byte.
  const openHere = JSON.stringify({ v: 3, jobId: 'jhere', jobLabel: 'open on this phone', zones: [] });
  await openExport(page, { [JOBS_KEY]: [job('ja', 'Lot A')], [STATE_KEY]: openHere });

  await pick(page, exportFile([job('jc', 'Lot C')], {
    current: { v: 3, jobId: 'jfile', jobLabel: 'open on the other phone', zones: [] },
  }));
  await go(page).click();
  await expect(status(page)).toHaveText('Done — 2 jobs in the library (1 new, 0 replaced)');
  expect(await page.evaluate((k) => localStorage.getItem(k), STATE_KEY)).toBe(openHere);
});

test('a stored preference is kept; only an empty one is filled from the file', async ({ page }) => {
  // Stored: snow prefs set, no fence prefs, no snow terms.
  // File:   snow {depthIn: 6}, fence {postFt: 8}, snowTerms null.
  //   snow      -> kept as stored ({depthIn: 2}), the file's 6 ignored
  //   fence     -> empty here, so the file's {postFt: 8} is written
  //   snowTerms -> empty here AND null in the file, so still empty
  const snowHere = JSON.stringify({ depthIn: 2 });
  await openExport(page, { [JOBS_KEY]: [], yardMeasureSnowPrefs: snowHere });

  await pick(page, exportFile([job('jc', 'Lot C')], {
    prefs: { snow: { depthIn: 6 }, fence: { postFt: 8 }, snowTerms: null },
  }));
  await go(page).click();
  await expect(status(page)).toHaveText('Done — 1 job in the library (1 new, 0 replaced)');

  const prefs = await page.evaluate(() => ({
    snow: localStorage.getItem('yardMeasureSnowPrefs'),
    fence: localStorage.getItem('yardMeasureFencePrefs'),
    terms: localStorage.getItem('yardMeasureSnowTerms'),
  }));
  expect(prefs.snow).toBe(snowHere);
  expect(JSON.parse(prefs.fence)).toEqual({ postFt: 8 });
  expect(prefs.terms).toBeNull();
});

test("an empty library gets the file's jobs back, and the app's Jobs list shows them", async ({ page }) => {
  // The 10/26 case: nothing stored, a five-job export in hand.
  //   in the file = 5, already here = 0, new = 5.
  // Picking the same file again afterwards finds all five already here, so
  // a second tap could never make ten.
  await openExport(page);
  await expect(page.locator('.headline')).toHaveText('Nothing stored here');
  await expect(page.locator('#import-btn')).toBeVisible();

  const names = ['North lot', 'South lot', 'East lot', 'West lot', 'Back lot'];
  const file = exportFile(names.map((n, i) => job('j' + i, n, { sqft: (i + 1) * 1000 })));
  await pick(page, file);
  await expect(status(page)).toHaveText('5 jobs in the file, 0 already here, 5 new');
  await go(page).click();
  await expect(status(page)).toHaveText('Done — 5 jobs in the library (5 new, 0 replaced)');
  await expect(page.locator('.headline').first()).toContainText('5');

  await pick(page, file);
  await expect(status(page)).toHaveText('5 jobs in the file, 5 already here, 0 new');

  // Same origin, same localStorage: the app next door reads the library back.
  // (The location explainer is skipped; it is not what this test is about.)
  await page.evaluate(() => localStorage.setItem('yardMeasureLocationConsent', 'no'));
  await loadApp(page);
  await page.click('#jobs-btn');
  await expect(page.locator('#jobs-list .job-name')).toHaveText(names);
  await expect(page.locator('#jobs-list .empty-state')).toHaveCount(0);
});
