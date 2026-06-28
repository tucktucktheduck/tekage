const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T0 acceptance: the built tkg.html loads with ZERO console errors, the stage
// canvas renders, and the version picker populates from the demo song.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test('tkg.html loads with no console errors and renders', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(tkgUrl);

  // stage canvas is present and visible
  await expect(page.locator('#stage')).toBeVisible();

  // the demo song loads on boot -> version buttons appear in #verRow
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 })
    .toBeGreaterThan(0);

  expect(errors, 'console/page errors: ' + errors.join(' | ')).toHaveLength(0);
});

test('keyboard-map overlay can open', async ({ page }) => {
  await page.goto(tkgUrl);
  // #mapOverlay exists; opening it should not throw (viewer is built in T7).
  await expect(page.locator('#mapOverlay')).toHaveCount(1);
});
// tests/ui/smoke.spec.js — Playwright smoke test for TKG

const { test, expect } = require('@playwright/test');

test('TKG loads and runs', async ({ page }) => {
  // Build the HTML first
  const { execSync } = require('child_process');
  try {
    execSync('node scripts/build.mjs', { stdio: 'inherit' });
  } catch (error) {
    console.error('Build failed:', error);
    throw error;
  }

  await page.goto('file://./dist/tkg.html');
  
  // Check that the canvas exists
  await expect(page.locator('#gameCanvas')).toBeVisible();
  
  // Check that UI elements are present
  await expect(page.locator('#ui')).toBeVisible();
});
