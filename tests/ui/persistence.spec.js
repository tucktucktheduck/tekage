const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T23 ProgressStore — settings + best score survive a real page reload (localStorage).
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

// returning player: boot already-onboarded so the landing doesn't intercept clicks
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('T23: settings persist across a reload', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // settings live in the Teklet console now — open it, then change them
  await page.click('#tekletBtn');
  await page.fill('#speed', '50');
  await page.dispatchEvent('#speed', 'input');
  await page.check('#slowChk');
  await page.check('#shiftChk');

  // give the debounced persist time to flush, then reload fresh
  await page.waitForTimeout(400);
  await page.reload();
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  const restored = await page.evaluate(() => ({
    speed: Transport.targetRate,
    autoSlow: UI.autoSlow,
    autoShift: UI.autoShift,
    slowChecked: document.getElementById('slowChk').checked,
  }));
  expect(restored.speed).toBeCloseTo(0.5, 2);
  expect(restored.autoSlow).toBe(true);
  expect(restored.autoShift).toBe(true);
  expect(restored.slowChecked).toBe(true);
});

test('T23: a song-end best score is stored and shown on replay', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // seed a known best directly through the store, then trigger a (worse) real run
  const lvl = await page.evaluate(() => {
    const id = levelId();
    ProgressStore.recordResult(id, 0.99, 5);   // a strong prior best
    return id;
  });

  // play a full run with no presses -> all misses (0%) -> report should show BEST 99%
  await page.evaluate(() => { UI.mode='play'; Transport.targetRate=4; Transport.play(); });
  await expect(page.locator('#reportCard')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#reportCard')).toContainText('BEST 99%');

  // and the stored best is unchanged by the worse run
  const best = await page.evaluate((id) => ProgressStore.bestFor(id), lvl);
  expect(best).toBeCloseTo(0.99, 2);
});
