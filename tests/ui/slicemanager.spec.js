const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('slice manager: add / edit / delete + last-slice guard', async ({ page }) => {
  const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  const r = await page.evaluate(() => {
    const out={};
    out.n0 = currentSlices().length;
    const id = sliceAdd();                    out.n1 = currentSlices().length;
    out.added = !!currentSlices().find(s=>s.id===id);
    sliceSetProp(id,'step',7);                out.step  = currentSlices().find(s=>s.id===id).step;
    sliceSetProp(id,'label','Zz');            out.label = currentSlices().find(s=>s.id===id).label;
    out.delOk = sliceDelete(id);              out.n2 = currentSlices().length;
    // reduce to one, then deletion must be refused
    sliceDelete(currentSlices()[0].id);       out.n3 = currentSlices().length;
    out.guard = sliceDelete(currentSlices()[0].id); out.n4 = currentSlices().length;
    return out;
  });
  expect(errors).toEqual([]);
  expect(r.n0).toBe(2);
  expect(r.n1).toBe(3);
  expect(r.added).toBe(true);
  expect(r.step).toBe(7);
  expect(r.label).toBe('Zz');
  expect(r.delOk).toBe(true);
  expect(r.n2).toBe(2);
  expect(r.n3).toBe(1);
  expect(r.guard).toBe(false);   // a layout needs at least one slice
  expect(r.n4).toBe(1);
});

test('save-as-preset: names a layout, shows in the picker, persists + selectable', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  const s = await page.evaluate(() => {
    sliceSetShift('left','up','Backslash');          // a non-colliding shift key
    const shift = currentSlices().find(x=>x.id==='left').shiftKeys.up;
    const ok = saveAsPreset('MyLayout');
    return { ok, hasPreset: !!(TKGConfig.presets && TKGConfig.presets['MyLayout']),
             preset: TKGConfig.slices.preset, shift };
  });
  expect(s.ok).toBe(true);
  expect(s.hasPreset).toBe(true);
  expect(s.preset).toBe('MyLayout');
  expect(s.shift).toContain('Backslash');   // shift keys are arrays (multi-key support)
  await expect(page.locator('#presetPicker button[data-preset="MyLayout"]')).toHaveCount(1);

  // survives a reload and can be re-selected
  await page.reload();
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  await expect(page.locator('#presetPicker button[data-preset="MyLayout"]')).toHaveCount(1);
  const after = await page.evaluate(() => {
    const has = !!(TKGConfig.presets && TKGConfig.presets['MyLayout']);
    document.querySelector('#presetPicker button[data-preset="MyLayout"]').click();
    return { has, preset: TKGConfig.slices.preset };
  });
  expect(after.has).toBe(true);
  expect(after.preset).toBe('MyLayout');
});
