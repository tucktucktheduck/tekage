const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('N-slice render: versell preset + a 3-slice custom config draw without error', async ({ page }) => {
  const errors=[];
  page.on('pageerror', e=>errors.push(String(e)));
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  const res = await page.evaluate(() => {
    const out = {};
    // 1) versell preset (2 slices, wide offsets)
    loadConfig({ slices:{ preset:'keyboardgame' } });
    out.versell = SLICES.map(s=>({ id:s.id, keys:s.keys.length, lo:s.offs[0], hi:s.offs[s.offs.length-1] }));
    UI.mode='play'; resolvePlan(); draw();

    // 2) a genuine 3-slice custom config
    loadConfig({ slices:{ list:[
      { id:'lo', label:'LO', order:0, step:12, minAnchor:24, maxAnchor:72, initialAnchor:48, keys:{z:0,x:2,c:4,v:5}, shiftKeys:{up:'Tab',down:'ShiftLeft'} },
      { id:'mid',label:'MI', order:1, step:12, minAnchor:36, maxAnchor:84, initialAnchor:60, keys:{a:0,s:2,d:4,f:5}, shiftKeys:{up:'CapsLock',down:'ShiftRight'} },
      { id:'hi', label:'HI', order:2, step:12, minAnchor:48, maxAnchor:96, initialAnchor:72, keys:{q:0,w:2,e:4,r:5}, shiftKeys:{up:'Enter',down:'Backslash'} },
    ] } });
    out.customIds = SLICES.map(s=>s.id);
    UI.mode='play'; resolvePlan(); draw();
    out.slicesUsed = [...(Song.slicesUsed||[])];
    out.colors = SLICES.map(s=>Skin.sliceColor(s).hex);
    out.cssVar = (typeof document!=='undefined') ? getComputedStyle(document.documentElement).getPropertyValue('--slice-mid').trim() : '';
    return out;
  });

  expect(errors).toEqual([]);                                   // draw() threw nothing on either config
  const vr = res.versell.find(s=>s.id==='right');
  expect([vr.lo, vr.hi]).toEqual([0,23]);                       // versell right hand = two chromatic octaves
  expect(res.customIds).toEqual(['lo','mid','hi']);             // 3 slices survive normalizeSlices
  expect(new Set(res.colors).size).toBe(3);                     // distinct per-slice colors
  expect(res.cssVar).not.toBe('');                              // --slice-<id> CSS vars published
});
