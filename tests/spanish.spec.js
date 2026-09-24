// Spanish on screen, English in the bid (9/23).
//
// The translation is a pass over text nodes, which is only safe while it never
// reaches data. So the things pinned here are: what a PM copies into a bid
// stays English whatever the screen says, a zone keeps the name it was given,
// and the measured numbers are the same in both languages. The rest guards the
// ways a translation fails quietly -- a dialog that stays English, a phrase
// that bites into a longer one, a language that is not remembered.

const { test, expect } = require('@playwright/test');
const { loadApp, rect } = require('./helpers');

async function spanishFirst(page) {
  await page.addInitScript(() => {
    localStorage.setItem('yardMeasureLang', 'es');
    // Skip the location explainer; it is not what these tests are about.
    localStorage.setItem('yardMeasureLocationConsent', 'no');
  });
}

// A 100 x 50 ft lot, placed through the app so every panel renders.
async function measureALot(page) {
  await page.evaluate((pins) => {
    pins.forEach((p) => addPin({ lat: p.lat, lng: p.lng, accuracy: 2, src: 'map' }));
  }, rect(0, 0, 100, 50));
}

test('Spanish is remembered, and the button names the language it switches to', async ({ page }) => {
  await spanishFirst(page);
  await loadApp(page);
  await expect(page.locator('#result-unit')).toHaveText('pies cuadrados');
  await expect(page.locator('#lang-btn span')).toHaveText('EN');
});

test('switching back restores the English the page was built with', async ({ page }) => {
  await spanishFirst(page);
  await loadApp(page);
  await page.click('#lang-btn');
  await expect(page.locator('#result-unit')).toHaveText('square feet');
  await expect(page.locator('#lang-btn span')).toHaveText('ES');
  expect(await page.evaluate(() => localStorage.getItem('yardMeasureLang'))).toBe('en');
  // The static markup, which no render rebuilds.
  await expect(page.locator('#new-job-btn')).toContainText('Start a new job');
});

test('the bid text stays English on a Spanish screen', async ({ page }) => {
  // Copy goes straight into a bid an estimator reads. It must not change
  // language with whoever happened to measure the lot.
  await spanishFirst(page);
  await loadApp(page);
  await measureALot(page);
  const text = await page.evaluate(() => jobSummaryText());
  // 100 x 50 = 5,000 sq ft.
  expect(text).toContain('Zone 1: 5,000 sq ft');
  expect(text).not.toMatch(/pies|Zona/);
});

test('a zone keeps the name it was given; only the screen reads Spanish', async ({ page }) => {
  await spanishFirst(page);
  await loadApp(page);
  const r = await page.evaluate(() => ({
    stored: state.zones[0].name,
    shown: document.querySelector('.zone-pick span').textContent,
  }));
  expect(r.stored).toBe('Zone 1');
  expect(r.shown).toBe('Zona 1');
});

test('the measured number is the same in both languages', async ({ page }) => {
  await spanishFirst(page);
  await loadApp(page);
  await measureALot(page);
  const es = await page.locator('#result-sqft').textContent();
  await page.click('#lang-btn');
  const en = await page.locator('#result-sqft').textContent();
  expect(es).toBe('5,000');
  expect(en).toBe(es);
});

test('a confirm dialog arrives in Spanish', async ({ page }) => {
  // confirm() takes a string, not a node, so the page pass cannot reach it.
  await spanishFirst(page);
  await loadApp(page);
  await measureALot(page);
  let said = '';
  page.once('dialog', async (d) => { said = d.message(); await d.dismiss(); });
  await page.click('#clear-btn');
  expect(said).toBe('¿Borrar todos los pines y capas de "Zona 1"?');
});

test('a textarea placeholder translates, though its text never does', async ({ page }) => {
  await spanishFirst(page);
  await loadApp(page);
  await expect(page.locator('#site-f-note')).toHaveAttribute('placeholder', 'Nota (opcional)');
});

test('longest phrase wins, and a short one never bites into a word', async ({ page }) => {
  await loadApp(page);
  const out = await page.evaluate(() => [
    translateString('Walk a corner and tap "Drop Pin", or turn on "Tap to add" and tap corners on the map'),
    translateString('Zones'),
    translateString('Runs'),
    translateString('Runway'),
    translateString('3 zones'),
    translateString('1 pin'),
    translateString('Storage holds 12.3 yd³'),
  ]);
  expect(out).toEqual([
    'Camina a una esquina y toca "Poner pin aquí", o prende "Tocar para agregar" y toca las esquinas en el mapa',
    'Zonas',
    'Tramos',
    'Runway',          // "Run" is a key; it must not reach inside another word
    '3 zonas',
    '1 pin',
    // Sentence rules run before single words. The other way round, "Storage"
    // is already "Depósito" and the sentence is never recognised.
    'El depósito aguanta 12.3 yd³',
  ]);
});
