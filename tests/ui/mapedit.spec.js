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

test('unmap removes a key; both Tab and CapsLock shift the left slice up', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  const r = await page.evaluate(() => {
    const before = KEY_SLICE['a'];               // 'a' is mapped (left) on the standard layout
    unmapKey('a');
    return { before, after: KEY_SLICE['a'] || null,
             tab: SHIFT_BY_CODE['Tab'], caps: SHIFT_BY_CODE['CapsLock'] };
  });
  expect(r.before).toBe('left');
  expect(r.after).toBeNull();                     // unmapped
  expect(r.tab).toEqual({ sliceId:'left', dir:1 });
  expect(r.caps).toEqual({ sliceId:'left', dir:1 });   // both keys shift left up
});

test('changing a slice step keeps each key on its exact note (no drift, no teleport)', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  const r = await page.evaluate(() => {
    UI.mode='play';
    const before = midiForGameKey('a').midi;          // 'a' is in the left slice
    sliceSetProp('left','step',24);                   // 2-octave step
    return { before, after: midiForGameKey('a').midi, step: currentSlices().find(s=>s.id==='left').step };
  });
  expect(r.step).toBe(24);
  expect(r.after).toBe(r.before);                     // key 'a' did not move off its note
});
