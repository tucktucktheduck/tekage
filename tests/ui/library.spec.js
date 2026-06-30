const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T24 starter library — the menu is populated and selecting a song loads it.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

// returning player: boot already-onboarded so the landing doesn't intercept clicks
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('T24: song menu lists the library and loads a chosen song', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // menu has the demo + several library songs
  const optionCount = await page.locator('#songSel option').count();
  expect(optionCount).toBeGreaterThanOrEqual(5);
  await expect(page.locator('#songSel')).toContainText('Baa Baa Black Sheep');

  // selecting a library song swaps the active song + rebuilds the version picker
  await page.selectOption('#songSel', 'ode-to-joy');
  await expect(page.locator('#songName')).toContainText('Ode to Joy');
  const loaded = await page.evaluate(() => ({ title: Song.title, versions: Song.versions.length, notes: Song.notes.length }));
  expect(loaded.title).toBe('Ode to Joy');
  expect(loaded.versions).toBeGreaterThanOrEqual(2);
  expect(loaded.notes).toBeGreaterThan(8);
});
