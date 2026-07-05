const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('map editor: remap a key live, mark custom, persist; DOM click path works', async ({ page }) => {
  const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // functional remap: reassign 'a' to a specific pitch inside its slice
  const res = await page.evaluate(() => {
    const sid = KEY_SLICE['a'];
    const target = currentAnchors()[sid] + 3;    // 3 semitones above the slice anchor
    remapKey('a', target);
    return { preset: TKGConfig.slices.preset, hasList: Array.isArray(TKGConfig.slices.list),
             midi: midiForGameKey('a').midi, target };
  });
  expect(errors).toEqual([]);
  expect(res.preset).toBe('custom');
  expect(res.hasList).toBe(true);
  expect(res.midi).toBe(res.target);             // 'a' now sounds at the reassigned pitch

  // the custom layout survives a reload
  await page.reload();
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  const after = await page.evaluate(() => ({ preset: TKGConfig.slices.preset, hasList: Array.isArray(TKGConfig.slices.list) }));
  expect(after.preset).toBe('custom');
  expect(after.hasList).toBe(true);

  // DOM path: open the editor, arm a key, click a piano note -> it remaps
  await page.click('#mapBtn');
  await expect(page.locator('#mapOverlay')).toHaveClass(/open/);
  await page.click('#mapEditBtn');
  await expect(page.locator('#mapEditBtn')).toHaveClass(/sel/);
  await page.click('#mapKb .mapKey[data-k="w"]');
  await expect(page.locator('#mapKb .mapKey[data-k="w"]')).toHaveClass(/armed/);
  const dom = await page.evaluate(() => {
    const cell=document.querySelector('#mapPiano .mapWhite[data-m]');
    const m=parseInt(cell.dataset.m,10);
    cell.click();                                 // maps the armed 'w' to this piano note
    return { m, wMidi: midiForGameKey('w') && midiForGameKey('w').midi, preset: TKGConfig.slices.preset };
  });
  expect(dom.preset).toBe('custom');
  expect(dom.wMidi).toBe(dom.m);                  // 'w' now sounds at the clicked note
});
