// Job totals: what lands on the card somebody prices from.
//
// These encode the arithmetic the 4500 Diplomacy export demonstrated on
// 2026-08-28 (the first real site measured in this app):
//
//   gross areas 104,443 - cut-outs 19,317 = 85,126, against an 85,127 headline
//   Plow 84,000 + Walk 1,127 = 85,127
//   Storage 3,194 was correctly EXCLUDED
//
// The 163 real pins from that job were never saved, so these are not a replay
// of it -- they are the relationships it proved, checked against shapes small
// enough to work out on paper.

const { test, expect } = require('@playwright/test');
const { rect, loadApp, withZones, closeTo } = require('./helpers');

test.beforeEach(async ({ page }) => { await loadApp(page); });

const zone = (pins, name, mode = 'area', surface = 'plow') => ({ name, mode, surface, pins });

test('the job total is the sum of the zones, after cut-outs', async ({ page }) => {
  // 10,000 + 5,000 = 15,000 gross, less a 400 sq ft building = 14,600.
  const total = await withZones(page, [
    zone(rect(0, 0, 100, 100), 'lawn'),
    zone(rect(200, 0, 100, 50), 'side lot'),
    zone(rect(30, 30, 20, 20), 'house', 'cut'),
  ], 'jobSqft()');

  expect(closeTo(total, 14600, 0.5), `got ${total.toFixed(1)} sq ft, expected 14,600`).toBe(true);
});

test('a cut-out only comes off the zone it actually overlaps', async ({ page }) => {
  // The building sits in the lawn, not in the side lot. The side lot must
  // come through at its full 5,000.
  const sideLot = await withZones(page, [
    zone(rect(0, 0, 100, 100), 'lawn'),
    zone(rect(200, 0, 100, 50), 'side lot'),
    zone(rect(30, 30, 20, 20), 'house', 'cut'),
  ], 'zoneNetSqft(state.zones[1])');

  expect(closeTo(sideLot, 5000, 0.5), `got ${sideLot.toFixed(1)} sq ft, expected 5,000`).toBe(true);
});

test('in summer every area zone counts, whatever its surface', async ({ page }) => {
  // Surface is a snow concept. In summer a storage zone is just ground.
  const total = await withZones(page, [
    zone(rect(0, 0, 100, 100), 'lot', 'area', 'plow'),
    zone(rect(200, 0, 100, 50), 'pile here', 'area', 'storage'),
  ], 'jobSqft()', 'summer');

  expect(closeTo(total, 15000, 0.5), `got ${total.toFixed(1)} sq ft, expected 15,000`).toBe(true);
});

test('in snow, storage is excluded from the headline', async ({ page }) => {
  // Snow introduces a surface that is measured but never cleared: storage is
  // where snow gets pushed TO. Counting it as cleared ground overstates the
  // work on the number somebody prices from. At 4500 Diplomacy this was the
  // 3,194 sq ft that correctly stayed out of the 85,127 total.
  const total = await withZones(page, [
    zone(rect(0, 0, 100, 100), 'lot', 'area', 'plow'),
    zone(rect(200, 0, 100, 20), 'walks', 'area', 'walk'),
    zone(rect(400, 0, 100, 50), 'snow storage', 'area', 'storage'),
  ], 'jobSqft()', 'snow');

  expect(
    closeTo(total, 12000, 0.5),
    `got ${total.toFixed(1)} sq ft, expected 12,000 (10,000 plow + 2,000 walk). ` +
    `Snow storage is being counted as cleared ground, which overstates the job.`
  ).toBe(true);
});

test('a line zone has no area', async ({ page }) => {
  const total = await withZones(page, [
    zone(rect(0, 0, 100, 100), 'lawn'),
    zone(rect(0, 0, 200, 1), 'fence run', 'line'),
  ], 'jobSqft()');

  expect(closeTo(total, 10000, 0.5), `got ${total.toFixed(1)} sq ft, expected 10,000`).toBe(true);
});
