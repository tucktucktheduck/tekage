const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T21 Auto-Slow + T22 Auto-Shift — integrated behavior in the real transport clock.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

// returning player: boot already-onboarded so the landing doesn't intercept clicks
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('T21: a miss smoothly slows the transport, hits recover it', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  await page.evaluate(() => {
    UI.mode = 'play';
    UI.autoSlow = true; Transport.autoSlow = true;
    Transport.targetRate = 1.0;
    Transport.play();
    Score.stop();                   // isolate the assist easing from continuous auto-misses
    Transport.noteMissed();         // trigger the slow
  });

  // rate eases DOWN toward the floor (clock-driven, over a few ticks)
  await expect.poll(() => page.evaluate(() => Transport.rate), { timeout: 3000 }).toBeLessThan(0.95);
  const floored = await page.evaluate(() => Transport.rate);
  expect(floored).toBeGreaterThanOrEqual(0.39);   // never below the floor

  // now feed hits -> the target recovers, rate eases back UP. Keep feeding hits
  // while we poll, so the recovery target stays high under CPU contention.
  await expect.poll(async () => {
    await page.evaluate(() => { for (let i=0;i<6;i++) Transport.noteHit(); });
    return page.evaluate(() => Transport.rate);
  }, { timeout: 5000 }).toBeGreaterThan(floored + 0.04);
});

test('T22: Auto-Shift drives the PLAY slice along the solved plan', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  const res = await page.evaluate(() => {
    UI.mode = 'play';
    const t = Song.duration * 0.6;
    Transport.songTime = t;
    const plan = sliceAt(t);
    UI.autoShift = false; userSlice.L = 0; userSlice.R = 0;
    const manual = {...currentSlice()};            // clone: currentSlice returns the live userSlice
    UI.autoShift = true;
    const driven = {...currentSlice()};            // should follow the plan
    return { plan, manual, driven };
  });
  expect(res.manual).toEqual({ L: 0, R: 0 });
  expect(res.driven).toEqual(res.plan);
});
