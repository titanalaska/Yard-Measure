// Laptop keyboard shortcuts (Matt, 10/4/26).
//
// Tracing a snow site on the laptop meant leaving the map for every new zone,
// shape type and surface. Each key presses the button a finger would, so these
// tests check what changed in the job, not which function ran. The guards
// matter as much as the keys: a letter typed into the search or a zone name
// must stay a letter, and holding N down must not stack up empty zones.

const { test, expect } = require('@playwright/test');
const { loadApp, rect } = require('./helpers');

// Three drawn zones in snow season, zone 1 selected. Zone 2 is a line so W
// has a width box to land in.
async function threeZones(page) {
  await page.addInitScript(() => {
    localStorage.setItem('yardMeasureLocationConsent', 'no');
  });
  await loadApp(page);
  await page.evaluate((pins) => {
    state.season = 'snow';
    const zone = (id, name, mode, surface, ps) => ({
      id, name, mode, surface, pins: ps.map((p, i) => ({ ...p, id: id * 100 + i, src: 'map' })),
      layers: [], nextLayerId: 1, widthFt: '', fence: false, gates: [], nextGateId: 1,
    });
    state.zones = [
      zone(1, 'Front walk', 'area', 'walk', pins.a),
      zone(2, 'Curb', 'line', 'hand', pins.b),
      zone(3, 'Back walk', 'area', 'walk', pins.c),
    ];
    state.nextZoneId = 4;
    state.activeZoneId = 1;
    renderAll();
    document.activeElement && document.activeElement.blur();
  }, { a: rect(0, 0, 40, 10), b: rect(100, 0, 60, 4).slice(0, 2), c: rect(0, 100, 40, 10) });
}

const zones = (page) => page.evaluate(() =>
  state.zones.map(z => ({ id: z.id, mode: z.mode, surface: z.surface, name: z.name })));
const active = (page) => page.evaluate(() => state.activeZoneId);

test('N starts a new zone, selected, with the type and surface of the one before', async ({ page }) => {
  await threeZones(page);
  await page.keyboard.press('n');
  const z = await zones(page);
  expect(z.length).toBe(4);
  // Zone 1 (area, walk) was selected, so the new zone copies it.
  expect(z[3]).toMatchObject({ id: 4, mode: 'area', surface: 'walk' });
  expect(await active(page)).toBe(4);
});

test('holding N down makes one zone, not one per key repeat', async ({ page }) => {
  await threeZones(page);
  await page.keyboard.press('n');
  // What the browser sends while the key stays down.
  await page.evaluate(() => document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'n', repeat: true, bubbles: true })));
  expect((await zones(page)).length).toBe(4);
});

test('a letter typed into the address search stays a letter', async ({ page }) => {
  await threeZones(page);
  await page.click('#map-search-input');
  await page.keyboard.type('nat');
  await expect(page.locator('#map-search-input')).toHaveValue('nat');
  expect((await zones(page)).length).toBe(3);
  expect(await page.evaluate(() => state.tapMode)).toBeFalsy();
});

test('Ctrl and Alt combinations are left to the browser', async ({ page }) => {
  await threeZones(page);
  await page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', altKey: true, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }));
  });
  expect((await zones(page)).length).toBe(3);
});

test('no shortcut reaches past an open dialog', async ({ page }) => {
  await threeZones(page);
  await page.evaluate(() => document.getElementById('jobs-overlay').classList.add('open'));
  await page.keyboard.press('n');
  await page.keyboard.press('t');
  const z = await zones(page);
  expect(z.length).toBe(3);
  expect(z[0].mode).toBe('area');
});

test('T steps the selected zone through area, cut-out, line and back', async ({ page }) => {
  await threeZones(page);
  const modes = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('t');
    modes.push((await zones(page))[0].mode);
  }
  expect(modes).toEqual(['cut', 'line', 'area']);
  // Only the selected zone changed.
  expect((await zones(page))[2].mode).toBe('area');
});

test('S steps the surface of the selected zone', async ({ page }) => {
  await threeZones(page);
  await page.keyboard.press('s');
  // Snow surfaces for an area run plow, walk, hand, storage: walk -> hand.
  expect((await zones(page))[0].surface).toBe('hand');
});

test('] and [ walk the selection through the zones, wrapping at the ends', async ({ page }) => {
  await threeZones(page);
  const seen = [];
  for (const k of [']', ']', ']', '[']) {
    await page.keyboard.press(k);
    seen.push(await active(page));
  }
  // 1 -> 2 -> 3 -> wraps to 1 -> back to 3.
  expect(seen).toEqual([2, 3, 1, 3]);
});

test('A switches between adding corners and moving the map', async ({ page }) => {
  await threeZones(page);
  await page.keyboard.press('a');
  expect(await page.evaluate(() => state.tapMode)).toBe(true);
  await page.keyboard.press('a');
  expect(await page.evaluate(() => state.tapMode)).toBe(false);
});

test('M opens the full-screen map and Esc still closes it', async ({ page }) => {
  await threeZones(page);
  await page.keyboard.press('m');
  await expect(page.locator('body')).toHaveClass(/map-full/);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/map-full/);
});

test('W puts the cursor in the width box of the selected line', async ({ page }) => {
  await threeZones(page);
  await page.keyboard.press(']'); // zone 2, the line
  await page.keyboard.press('w');
  await expect(page.locator('.snow-width-input[data-zone-id="2"]')).toBeFocused();
  // And a number typed there is the width, not a shortcut.
  await page.keyboard.type('4');
  expect(await page.evaluate(() => state.zones[1].widthFt)).toBe('4');
});

test('W on an area points at what it needs instead of doing nothing', async ({ page }) => {
  await threeZones(page);
  await page.keyboard.press('w');
  await expect(page.locator('#toast')).toHaveText('Select a line to set its width');
});

test('R renames the selected zone', async ({ page }) => {
  await threeZones(page);
  page.once('dialog', d => d.accept('Diplomacy frontage'));
  await page.keyboard.press('r');
  expect((await zones(page))[0].name).toBe('Diplomacy frontage');
});

test('F fits the selected zone on screen', async ({ page }) => {
  await threeZones(page);
  const fitted = await page.evaluate(() => new Promise((resolve) => {
    // fitBtn's own handler calls fitTo; listen on the button, not the map.
    document.getElementById('fit-btn').addEventListener('click', () => resolve(true), { once: true });
    setTimeout(() => resolve(false), 1000);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  }));
  expect(fitted).toBe(true);
});

test('? shows the list of keys, and Esc or ? hides it', async ({ page }) => {
  await threeZones(page);
  const help = page.locator('#shortcut-help');
  await expect(help).toBeHidden();
  await page.keyboard.press('?');
  await expect(help).toBeVisible();
  await expect(help).toContainText('New zone');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('?');
  await page.keyboard.press('?');
  await expect(help).toBeHidden();
});
