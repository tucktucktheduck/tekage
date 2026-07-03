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

test('T21: Auto-Slow parks the clock at an unpressed note and resumes on the press', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  await page.evaluate(() => {
    UI.mode = 'play';
    UI.autoSlow = true; Transport.autoSlow = true;
    UI.autoShift = false;
    Transport.targetRate = 1.0;
    Transport.play();               // Score.reset() runs inside play(); press nothing
  });

  // the clock must brake and PARK at the first yours-note's hit line
  await expect.poll(() => page.evaluate(() => Transport.waiting), { timeout: 8000 }).toBe(true);
  const parked = await page.evaluate(() => ({
    t: Transport.songTime, rate: Transport.rate,
    gate: Song.notes.find(n => isYours(n) && !Score.byNote.has(n))?.startSec ?? -1,
  }));
  expect(parked.rate).toBe(0);
  expect(parked.t).toBeLessThanOrEqual(parked.gate + 0.01);   // ON the line, not past it

  // it waits — no matter what (real time passes, songTime doesn't)
  await page.waitForTimeout(700);
  const held = await page.evaluate(() => Transport.songTime);
  expect(Math.abs(held - parked.t)).toBeLessThan(1e-6);

  // press the gated note (through the real input path) -> instant resume
  await page.evaluate(() => {
    const g = Song.notes.find(n => isYours(n) && !Score.byNote.has(n));
    userOn(g.midi, g.hand, g.key); userOff(g.midi, g.key);
  });
  await expect.poll(() => page.evaluate(() => Transport.songTime), { timeout: 4000 })
    .toBeGreaterThan(parked.t + 0.2);
  await page.evaluate(() => Transport.pause());
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
