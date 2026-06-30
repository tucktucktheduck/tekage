const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T25 onboarding — landing on first visit, "pro" skips + remembers, "first time"
// runs Blurt with a one-note practice gate. localStorage is per-test isolated.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test('T25: first visit shows the landing with both choices', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect(page.locator('#obLanding')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#obFirst')).toContainText('First time');
  await expect(page.locator('#obPro')).toContainText('pro');
});

test('T25: "I\'m a pro" skips onboarding and is remembered across reload', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect(page.locator('#obLanding')).toBeVisible({ timeout: 5000 });
  await page.click('#obPro');
  await expect(page.locator('#obLanding')).toHaveCount(0);
  expect(await page.evaluate(() => ProgressStore.isOnboarded())).toBe(true);

  await page.reload();
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  await expect(page.locator('#obLanding')).toHaveCount(0);   // not shown again
});

test('T25: the TUTORIAL button replays Blurt even after onboarding', async ({ page }) => {
  // arrive already onboarded -> no landing
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    localStorage.setItem(k, JSON.stringify({ onboarded:true })); } catch(e){} });
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  await expect(page.locator('#obLanding')).toHaveCount(0);

  // clicking TUTORIAL relaunches the walkthrough
  await page.click('#tutorialBtn');
  await expect(page.locator('#obBlurt')).toBeVisible();
  await expect(page.locator('#obBlurt')).toContainText('Welcome to TKG');
});

test('T25: "first time" runs Blurt and the one-note gate advances on a keypress', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect(page.locator('#obLanding')).toBeVisible({ timeout: 5000 });
  await page.click('#obFirst');

  // Blurt appears with the welcome line
  await expect(page.locator('#obBlurt')).toBeVisible();
  await expect(page.locator('#obBlurt')).toContainText('Welcome to TKG');

  // advance to the practice gate (loads Baa Baa Black Sheep, Auto-Shift on)
  await page.click('#obNext');
  await expect(page.locator('#obBlurt')).toContainText('press');
  expect(await page.evaluate(() => Song.title)).toBe('Baa Baa Black Sheep');
  expect(await page.evaluate(() => UI.autoShift)).toBe(true);

  // pressing a mapped key satisfies the gate and advances Blurt
  await page.keyboard.press('f');
  await expect(page.locator('#obBlurt')).toContainText('Perfect');
});
