// Shared setup for the measurement tests.
//
// Shapes are built in FEET on a flat local grid and converted to lat/lng, so
// every expected value in a test is a number you can work out on paper. All
// shapes in one test share a single origin latitude for the conversion, so
// they sit on a common grid.

const path = require('path');

// Normally the app next door. BOOTPRINT_APP points the suite at a deliberately
// broken copy instead, which is how `npm run verify-tests` proves these tests
// can actually fail -- see tests/mutation-check.js.
const APP = 'file://' +
  path.resolve(__dirname, '..', process.env.BOOTPRINT_APP || 'index.html').replace(/\\/g, '/');

// Anchorage. The latitude matters: cos(61.2) is about 0.48, so a degree of
// longitude here is barely half a degree of latitude. A projection that
// dropped the cos term would pass at the equator and fail badly here.
const ORIGIN = { lat: 61.2181, lng: -149.9003 };

const R = 6371000;          // mean Earth radius in metres, as index.html uses
const DEG = Math.PI / 180;
const FT_TO_M = 0.3048;

const dLat = (ft) => (ft * FT_TO_M) / R / DEG;
const dLng = (ft, atLat) => (ft * FT_TO_M) / (R * Math.cos(atLat * DEG)) / DEG;

// A pin as the app stores it. Accuracy only matters to areaSigmaSqm.
function pin(eastFt, northFt, accuracy = 3) {
  return {
    lat: ORIGIN.lat + dLat(northFt),
    lng: ORIGIN.lng + dLng(eastFt, ORIGIN.lat),
    accuracy,
  };
}

// Axis-aligned rectangle, counter-clockwise from its south-west corner.
// (east, north) is that corner; w and h are its size in feet.
function rect(east, north, w, h) {
  return [
    pin(east, north),
    pin(east + w, north),
    pin(east + w, north + h),
    pin(east, north + h),
  ];
}

// An L: a w x h rectangle with a bite taken out of its north-east corner,
// leaving a notch of biteW x biteH. Concave, so it forces real triangulation.
function lShape(east, north, w, h, biteW, biteH) {
  return [
    pin(east, north),
    pin(east + w, north),
    pin(east + w, north + h - biteH),
    pin(east + w - biteW, north + h - biteH),
    pin(east + w - biteW, north + h),
    pin(east, north + h),
  ];
}

// Load the app and fail loudly if it did not come up clean. A test that runs
// against a half-initialised page reports nonsense.
async function loadApp(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console error: ' + m.text());
  });

  await page.goto(APP);
  await page.waitForFunction(() => typeof calcAreaSqm === 'function', null, { timeout: 15000 });

  if (errors.length) {
    throw new Error(
      'index.html did not load cleanly, so no measurement below can be trusted:\n  ' +
      errors.join('\n  ')
    );
  }
  return page;
}

// Replace the app's zones with the ones a test describes, then read a number
// back out. `zones` is [{ name, mode, surface, pins }].
async function withZones(page, zones, expression, season = 'summer') {
  return page.evaluate(
    ({ zones, expression, season }) => {
      state.season = season;
      state.zones = zones.map((z, i) => ({
        id: i + 1,
        name: z.name || `Zone ${i + 1}`,
        mode: z.mode || 'area',
        pins: z.pins,
        layers: [],
        nextLayerId: 1,
        surface: z.surface || 'plow',
        widthFt: '',
        fence: false,
        gates: [],
        nextGateId: 1,
      }));
      // eslint-disable-next-line no-eval
      return eval(expression);
    },
    { zones, expression, season }
  );
}

// Relative comparison. Absolute tolerances are useless across values that span
// from 200 sq ft to 100,000.
function closeTo(actual, expected, tolerancePct) {
  if (expected === 0) return Math.abs(actual) < 1e-6;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerancePct / 100;
}

module.exports = { APP, ORIGIN, R, DEG, FT_TO_M, pin, rect, lShape, loadApp, withZones, closeTo };
