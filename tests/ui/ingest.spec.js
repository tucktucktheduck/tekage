const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// Mutopia/MIDI ingest — the in-game low-confidence parse warning (DECISIONS exact
// copy), its Play Anyway / Go Back actions, and the "don't show again" memory.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('low-confidence parse shows the warning with the exact copy + Play Anyway proceeds', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  const proceeded = await page.evaluate(async () => {
    return await new Promise(res => {
      let did = false;
      showLowConfidenceDialog({ notes:[{midi:60,startSec:0,durationSec:0.2,vel:90,channel:0}], duration:0.2 },
        'Sketchy File', () => { did = true; res(true); });
      // if it didn't proceed automatically, the dialog must be up
      setTimeout(() => { if (!did) res(false); }, 300);
    });
  });
  expect(proceeded).toBe(false);   // dialog gates the load

  // exact founder copy + the two buttons
  await expect(page.locator('#parseWarn')).toBeVisible();
  await expect(page.locator('#parseWarn')).toContainText('Our note loader is not that complicated (yet). There might be some bugs from your MIDI file.');
  await expect(page.locator('#pwPlay')).toContainText('Play Anyway');
  await expect(page.locator('#pwBack')).toContainText('Go Back to Library');

  // Play Anyway runs the proceed callback
  const ran = await page.evaluate(() => new Promise(res => {
    showLowConfidenceDialog({ notes:[{midi:60,startSec:0,durationSec:0.2}], duration:0.2 }, 'X', () => res(true));
    document.getElementById('pwPlay').click();
  }));
  expect(ran).toBe(true);
});

test('"don\'t show again" is remembered and skips the warning next time', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // tick "don't show again", then Play Anyway
  await page.evaluate(() => new Promise(res => {
    showLowConfidenceDialog({ notes:[{midi:60,startSec:0,durationSec:0.2}], duration:0.2 }, 'X', () => res(true));
    document.getElementById('pwDontShow').checked = true;
    document.getElementById('pwPlay').click();
  }));
  expect(await page.evaluate(() => ProgressStore.getSettings().hideParseWarning)).toBe(true);

  // now a low-confidence load should proceed immediately (no dialog)
  const immediate = await page.evaluate(() => new Promise(res => {
    let did = false;
    showLowConfidenceDialog({ notes:[{midi:60,startSec:0,durationSec:0.2}], duration:0.2 }, 'X', () => { did = true; res(true); });
    setTimeout(() => res(did), 200);
  }));
  expect(immediate).toBe(true);
});
