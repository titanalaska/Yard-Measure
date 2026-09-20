// Bootprint measurement tests.
//
// These load index.html over file:// and call its geometry functions directly.
// The script block has no IIFE wrapper, so everything is in global scope, and
// MapLibre is vendored under ./vendor/ -- so nothing here needs the network or
// a dev server.
//
// Run with: npm test

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // The math is deterministic. A retry would only hide a real failure.
  retries: 0,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
  },
});
