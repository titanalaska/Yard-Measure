// Geometry: the projection, then the shoelace on top of it.
//
// The shapes in most of these tests are built from feet using the same R and
// cos(lat) that index.html uses, so they cannot prove the projection is right
// on their own -- that would be circular. The first two tests exist to close
// that gap: they check the projection against published figures and against a
// ratio that holds no matter what R is. Once those pass, everything after them
// is a real test of the area arithmetic.

const { test, expect } = require('@playwright/test');
const { ORIGIN, DEG, pin, rect, lShape, loadApp, closeTo } = require('./helpers');

test.beforeEach(async ({ page }) => { await loadApp(page); });

// calcPerimeterM closes the loop, so two pins give twice the distance.
const distanceM = (page, a, b) =>
  page.evaluate(([a, b]) => calcPerimeterM([a, b]) / 2, [a, b]);

test('a thousandth of a degree of latitude is 111.19 m', async ({ page }) => {
  // Published figure for a sphere of radius 6371 km. This catches a typo in R
  // or a degrees/radians slip -- errors that would scale every bid on the app.
  const d = await distanceM(
    page,
    { lat: ORIGIN.lat, lng: ORIGIN.lng, accuracy: 1 },
    { lat: ORIGIN.lat + 0.001, lng: ORIGIN.lng, accuracy: 1 }
  );
  expect(
    closeTo(d, 111.1949, 0.5),
    `0.001 deg of latitude came back as ${d.toFixed(2)} m, not ~111.19 m. ` +
    `Every area the app reports is scaled by this.`
  ).toBe(true);
});

test('longitude shrinks by cos(latitude) this far north', async ({ page }) => {
  // Independent of R entirely -- it is a ratio. At 61.2 deg N the answer is
  // about 0.48, so a projection missing the cos term fails by more than 2x.
  // At the equator that same bug would pass unnoticed.
  const north = await distanceM(
    page,
    { lat: ORIGIN.lat, lng: ORIGIN.lng, accuracy: 1 },
    { lat: ORIGIN.lat + 0.001, lng: ORIGIN.lng, accuracy: 1 }
  );
  const east = await distanceM(
    page,
    { lat: ORIGIN.lat, lng: ORIGIN.lng, accuracy: 1 },
    { lat: ORIGIN.lat, lng: ORIGIN.lng + 0.001, accuracy: 1 }
  );
  const expected = Math.cos(ORIGIN.lat * DEG);
  expect(
    closeTo(east / north, expected, 0.1),
    `east/north came back as ${(east / north).toFixed(4)}, expected ` +
    `cos(${ORIGIN.lat}) = ${expected.toFixed(4)}. Longitude is not being ` +
    `scaled for latitude, so every width in Alaska is wrong.`
  ).toBe(true);
});

test('a 100 x 50 ft rectangle is 5,000 sq ft', async ({ page }) => {
  const sqft = await page.evaluate((pins) => calcAreaSqm(pins) * 10.7639, rect(0, 0, 100, 50));
  expect(closeTo(sqft, 5000, 0.5), `got ${sqft.toFixed(1)} sq ft, expected 5,000`).toBe(true);
});

test('walking a shape backwards measures the same ground', async ({ page }) => {
  const pins = rect(0, 0, 120, 80);
  const [forward, backward] = await page.evaluate(
    (p) => [calcAreaSqm(p), calcAreaSqm(p.slice().reverse())],
    pins
  );
  expect(
    closeTo(backward, forward, 0.001),
    `clockwise gave ${backward.toFixed(2)} sqm, counter-clockwise ${forward.toFixed(2)}. ` +
    `Which way somebody walks a lot must not change its area.`
  ).toBe(true);
});

test('starting from a different corner measures the same ground', async ({ page }) => {
  const pins = rect(0, 0, 120, 80);
  const rotated = [...pins.slice(2), ...pins.slice(0, 2)];
  const [a, b] = await page.evaluate(
    ([p, q]) => [calcAreaSqm(p), calcAreaSqm(q)],
    [pins, rotated]
  );
  expect(closeTo(b, a, 0.001), 'the first pin dropped should not change the area').toBe(true);
});

test('doubling both sides quadruples the area', async ({ page }) => {
  const [small, big] = await page.evaluate(
    ([s, b]) => [calcAreaSqm(s), calcAreaSqm(b)],
    [rect(0, 0, 50, 30), rect(0, 0, 100, 60)]
  );
  expect(closeTo(big / small, 4, 0.01), `ratio was ${(big / small).toFixed(4)}, expected 4`).toBe(true);
});

test('an L-shape equals the two rectangles it is made of', async ({ page }) => {
  // 100 x 100 with a 40 x 30 bite out of the north-east corner.
  // 10,000 - 1,200 = 8,800 sq ft. Concave, so ear clipping has to be right.
  const sqft = await page.evaluate(
    (pins) => calcAreaSqm(pins) * 10.7639,
    lShape(0, 0, 100, 100, 40, 30)
  );
  expect(
    closeTo(sqft, 8800, 0.5),
    `got ${sqft.toFixed(1)} sq ft, expected 8,800. A concave lot is being ` +
    `measured as if it were convex.`
  ).toBe(true);
});

test('fewer than three pins has no area', async ({ page }) => {
  const results = await page.evaluate(
    (p) => [calcAreaSqm([]), calcAreaSqm([p[0]]), calcAreaSqm([p[0], p[1]])],
    rect(0, 0, 10, 10)
  );
  expect(results).toEqual([0, 0, 0]);
});

test('the error band grows with the shape, not with the pin count', async ({ page }) => {
  // A tight loop of many pins must not report a wider band than a big square
  // with four. The old estimate scaled with perimeter and got this backwards.
  const manyPins = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    manyPins.push(pin(20 + 15 * Math.cos(a), 20 + 15 * Math.sin(a)));
  }
  const [smallBand, bigBand] = await page.evaluate(
    ([m, b]) => [areaSigmaSqm(m), areaSigmaSqm(b)],
    [manyPins, rect(0, 0, 300, 300)]
  );
  expect(
    bigBand > smallBand,
    `a 300x300 square reported +/-${bigBand.toFixed(1)} sqm while a 30 ft circle ` +
    `of 24 pins reported +/-${smallBand.toFixed(1)}. The band is tracking pin ` +
    `count rather than the size of the shape.`
  ).toBe(true);
});
