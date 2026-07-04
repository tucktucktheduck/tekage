const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('preset picker switches the layout live, re-charts, and persists', async ({ page }) => {
  const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // load a real famous song so there's a rich chart to re-map
  await page.evaluate(() => {
    const songs = window.__TKG_SONGS__||[];
    const s = songs.find(x=>/elise/i.test(x.id)) || songs[0];
    loadBakedSong(s.id);
  });

  // the picker renders both presets + a disabled Legacy slot
  await expect(page.locator('#presetPicker button[data-preset="keyboardgame"]')).toHaveCount(1);
  await expect(page.locator('#presetPicker button[data-preset="legacy"]')).toBeDisabled();

  // switch to Keyboard Game through the real button handler
  const after = await page.evaluate(() => {
    document.querySelector('#presetPicker button[data-preset="keyboardgame"]').click();
    const right = SLICES.find(s=>s.id==='right');
    return {
      preset: TKGConfig.slices.preset,
      rightSpan: [right.offs[0], right.offs[right.offs.length-1]],
      allKeyed: (Song.activeNotes||[]).every(n=>n.key),
      sel: document.querySelector('#presetPicker button[data-preset="keyboardgame"]').classList.contains('sel'),
    };
  });
  expect(errors).toEqual([]);
  expect(after.preset).toBe('keyboardgame');
  expect(after.rightSpan).toEqual([0,23]);     // versell right hand is now active
  expect(after.allKeyed).toBe(true);           // every played note has a key to press (playable)
  expect(after.sel).toBe(true);                // the pill shows selected

  // the chosen layout survives a reload
  await page.reload();
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  const restored = await page.evaluate(() => ({
    preset: TKGConfig.slices.preset,
    sel: document.querySelector('#presetPicker button[data-preset="keyboardgame"]').classList.contains('sel'),
  }));
  expect(restored.preset).toBe('keyboardgame');
  expect(restored.sel).toBe(true);

  // and back to Standard
  const back = await page.evaluate(() => {
    document.querySelector('#presetPicker button[data-preset="standard"]').click();
    return { preset: TKGConfig.slices.preset, allKeyed: (Song.activeNotes||[]).every(n=>n.key) };
  });
  expect(back.preset).toBe('standard');
  expect(back.allKeyed).toBe(true);
});
