const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// Teklet — the slide-in console: closed by default (stage stays clear), opens on
// the TEKLET button, and holds the settings/skin controls.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('Teklet opens, holds the settings, and closes', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  const vw = page.viewportSize().width;
  // closed by default -> the console sits off the right edge (slides via transform)
  await expect(page.locator('#teklet')).not.toHaveClass(/open/);
  expect((await page.locator('#teklet').boundingBox()).x).toBeGreaterThanOrEqual(vw - 5);

  // open it -> the console is on-screen and its controls are usable
  await page.click('#tekletBtn');
  await expect(page.locator('#teklet')).toHaveClass(/open/);
  expect((await page.locator('#teklet').boundingBox()).x).toBeLessThan(vw);
  await page.check('#slowChk');                 // actionable now
  expect(await page.evaluate(() => UI.autoSlow)).toBe(true);

  // close it again -> back off-screen
  await page.click('#tekletClose');
  await expect(page.locator('#teklet')).not.toHaveClass(/open/);
  await expect.poll(async () => (await page.locator('#teklet').boundingBox()).x).toBeGreaterThanOrEqual(vw - 5);
});
