// Cut-outs: the arithmetic that takes a building, driveway or pond back out of
// the ground it sits on.
//
// This is where the money is. A cut-out bug does not throw, does not look
// wrong on the card, and lands straight in a bid. The overlapping-cuts case
// below is the one that was actually broken until the 30 August fix.
//
// Every expected number here is worked out on paper from the rectangles in the
// test. The zone is always 100 x 100 ft = 10,000 sq ft.

const { test, expect } = require('@playwright/test');
const { rect, lShape, loadApp, withZones, closeTo } = require('./helpers');

const ZONE = rect(0, 0, 100, 100); // 10,000 sq ft of lawn
const area = (pins, name) => ({ name, mode: 'area', pins });
const cut = (pins, name) => ({ name, mode: 'cut', pins });

test.beforeEach(async ({ page }) => { await loadApp(page); });

const netOfFirstZone = (page, zones) =>
  withZones(page, zones, 'zoneNetSqft(state.zones[0])');

test('a building inside the lawn comes off once', async ({ page }) => {
  // 20 x 20 = 400 sq ft, wholly inside. 10,000 - 400 = 9,600.
  const net = await netOfFirstZone(page, [
    area(ZONE, 'lawn'),
    cut(rect(30, 30, 20, 20), 'house'),
  ]);
  expect(closeTo(net, 9600, 0.5), `got ${net.toFixed(1)} sq ft, expected 9,600`).toBe(true);
});

test('two cut-outs on the SAME ground come off once, not twice', async ({ page }) => {
  // The 30 August bug. Both cuts cover the identical 400 sq ft. If they are
  // summed instead of unioned, 800 comes off and the bid understates the lawn
  // by 400 sq ft of ground that is really there.
  const sameGround = rect(30, 30, 20, 20);
  const net = await netOfFirstZone(page, [
    area(ZONE, 'lawn'),
    cut(sameGround, 'driveway'),
    cut(sameGround, 'apron'),
  ]);
  expect(
    closeTo(net, 9600, 0.5),
    `got ${net.toFixed(1)} sq ft, expected 9,600. Two cut-outs covering the ` +
    `same ground were subtracted twice -- a bid off this number understates ` +
    `billable area.`
  ).toBe(true);
});

test('three overlapping cut-outs resolve to their true union', async ({ page }) => {
  // A = 0-40, B = 20-60, C = 40-80 east, all 0-40 north. Worked out by hand:
  //   areas      1600 + 1600 + 1600 = 4800
  //   pairs      A&B 800, B&C 800, A&C 0      -> -1600
  //   triple     0                            ->     0
  //   union      3200  (which is just 80 x 40, as it should be)
  // 10,000 - 3,200 = 6,800.
  const net = await netOfFirstZone(page, [
    area(ZONE, 'lawn'),
    cut(rect(0, 0, 40, 40), 'A'),
    cut(rect(20, 0, 40, 40), 'B'),
    cut(rect(40, 0, 40, 40), 'C'),
  ]);
  expect(
    closeTo(net, 6800, 0.5),
    `got ${net.toFixed(1)} sq ft, expected 6,800. Inclusion-exclusion over ` +
    `overlapping cut-outs is not resolving to the true union.`
  ).toBe(true);
});

test('a driveway half off the lot removes only the half that is on it', async ({ page }) => {
  // Cut spans east 90-110; the lawn ends at 100. Overlap is 10 x 20 = 200.
  // Subtracting all 400 would under-order material; subtracting none would
  // over-order. 10,000 - 200 = 9,800.
  const net = await netOfFirstZone(page, [
    area(ZONE, 'lawn'),
    cut(rect(90, 0, 20, 20), 'driveway off the edge'),
  ]);
  expect(
    closeTo(net, 9800, 0.5),
    `got ${net.toFixed(1)} sq ft, expected 9,800. A cut straddling the ` +
    `boundary is not being clipped to the overlap.`
  ).toBe(true);
});

test('a cut-out nowhere near the lawn removes nothing', async ({ page }) => {
  const net = await netOfFirstZone(page, [
    area(ZONE, 'lawn'),
    cut(rect(500, 500, 20, 20), 'across the street'),
  ]);
  expect(closeTo(net, 10000, 0.5), `got ${net.toFixed(1)} sq ft, expected 10,000`).toBe(true);
});

test('a cut-out bigger than the lawn floors at zero, never negative', async ({ page }) => {
  // Nine overlapping cuts of 3,600 sq ft each. Past the 8-cut cap the code
  // plain-sums them to 32,400 against a 10,000 sq ft lawn, so without the
  // floor this reports MINUS 22,400 sq ft on the card.
  //
  // One cut that merely covers the whole lawn does NOT test this: the exact
  // path clips it to the lawn, removal lands on exactly 10,000, and the answer
  // is 0 with or without the floor.
  const stacked = [];
  for (let i = 0; i < 9; i++) stacked.push(cut(rect(0, 0, 60, 60), `mis-set ${i}`));

  const net = await netOfFirstZone(page, [area(ZONE, 'lawn'), ...stacked]);
  expect(
    net === 0,
    `got ${net.toFixed(1)} sq ft. Net area must never go negative -- a ` +
    `negative square footage on the card is worse than a wrong one.`
  ).toBe(true);
});

test('past the cap it still counts only the overlap, not whole cut-outs', async ({ page }) => {
  // Eight 10x10 cuts wholly inside (800 sq ft) plus one 20x10 driveway
  // straddling the east edge, half on and half off. Nine cuts, so the plain-sum
  // fallback runs -- and it must still clip that ninth to the 100 sq ft that is
  // actually on the lawn, not subtract all 200.
  //   10,000 - (800 + 100) = 9,100   correct
  //   10,000 - (800 + 200) = 9,000   if whole cut-outs are subtracted
  const cuts = [];
  for (let i = 0; i < 8; i++) cuts.push(cut(rect(5 + i * 11, 50, 10, 10), `island ${i}`));
  cuts.push(cut(rect(90, 0, 20, 10), 'driveway off the edge'));

  const net = await netOfFirstZone(page, [area(ZONE, 'lawn'), ...cuts]);
  expect(
    closeTo(net, 9100, 0.5),
    `got ${net.toFixed(1)} sq ft, expected 9,100. A cut-out straddling the ` +
    `boundary is being subtracted whole instead of clipped to its overlap, ` +
    `which under-orders material.`
  ).toBe(true);
});

test('a concave lawn clips cut-outs correctly', async ({ page }) => {
  // calcAreaSqm is plain shoelace and never triangulates, so no area test can
  // reach the ear clipper. Overlap is the only path that does -- and the lawn
  // is walked CLOCKWISE here on purpose, because that is what forces the
  // clipper to normalise winding before it starts.
  //
  // Lawn: 100x100 with a 40x30 bite out of the north-east = 8,800 sq ft.
  // Cut:  east 50-90, north 60-90. Overlap with the L:
  //   north 60-70  full width   40 x 10 = 400
  //   north 70-90  only to 60   10 x 20 = 200
  //                                       600
  // 8,800 - 600 = 8,200.
  const lawnClockwise = lShape(0, 0, 100, 100, 40, 30).reverse();

  const net = await netOfFirstZone(page, [
    area(lawnClockwise, 'L-shaped lawn'),
    cut(rect(50, 60, 40, 30), 'patio'),
  ]);
  expect(
    closeTo(net, 8200, 0.5),
    `got ${net.toFixed(1)} sq ft, expected 8,200. A cut-out is not being ` +
    `clipped correctly against a concave lot.`
  ).toBe(true);
});

test('past the exact cap it over-subtracts, which is the safe direction', async ({ page }) => {
  // MAX_EXACT_CUTS is 8. At 9 the code abandons inclusion-exclusion for a
  // plain sum. That double-counts shared ground and so UNDERSTATES the area
  // billed for. Understating is the honest way to fail here; a change that
  // made it over-report would be a real regression, and this is what catches it.
  const overlapping = [];
  for (let i = 0; i < 9; i++) overlapping.push(cut(rect(10 + i * 2, 10, 20, 20), `cut ${i}`));

  const [exactish, capped] = await Promise.all([
    netOfFirstZone(page, [area(ZONE, 'lawn'), ...overlapping.slice(0, 8)]),
    netOfFirstZone(page, [area(ZONE, 'lawn'), ...overlapping]),
  ]);

  expect(
    capped <= exactish,
    `9 cut-outs reported ${capped.toFixed(1)} sq ft, MORE than the ${exactish.toFixed(1)} ` +
    `from 8. Past the cap the fallback must under-report, never over-report ` +
    `billable ground.`
  ).toBe(true);
});

test('a cut-out contributes no area of its own', async ({ page }) => {
  const net = await withZones(
    page,
    [area(ZONE, 'lawn'), cut(rect(30, 30, 20, 20), 'house')],
    'zoneNetSqft(state.zones[1])'
  );
  expect(net).toBe(0);
});
