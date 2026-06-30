const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T26 skins — the color pickers drive the live palette and persist across reload.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('T26: changing the primary color recolors the live palette + persists', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // default brand orange
  expect(await page.evaluate(() => Skin.HAND.right.rgb)).toBe('255,138,43');

  // set primary to pure red through the real color input
  await page.evaluate(() => {
    const el = document.getElementById('skinPrimary');
    el.value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => Skin.HAND.right.rgb)).toBe('255,0,0');

  // it survives a reload (persisted through ProgressStore)
  await page.waitForTimeout(400);
  await page.reload();
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => Skin.HAND.right.rgb)).toBe('255,0,0');
  expect(await page.evaluate(() => document.getElementById('skinPrimary').value)).toBe('#ff0000');
});
