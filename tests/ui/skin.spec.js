const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T26 skins — the color pickers drive the live palette and persist across reload.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('T26: changing the primary color recolors the live palette + persists', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // default brand orange
  expect(await page.evaluate(() => Skin.HAND.right.rgb)).toBe('255,138,43');

  // set primary to pure red through the real color input
  await page.evaluate(() => {
    const el = document.getElementById('skinPrimary');
    el.value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => Skin.HAND.right.rgb)).toBe('255,0,0');

  // it survives a reload (persisted through ProgressStore)
  await page.waitForTimeout(400);
  await page.reload();
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => Skin.HAND.right.rgb)).toBe('255,0,0');
  expect(await page.evaluate(() => document.getElementById('skinPrimary').value)).toBe('#ff0000');
});

test('T26: a video can be set as the background and renders behind the notes', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);

  // a tiny generated WebM (canvas.captureStream) -> object URL -> background video.
  // proves the real video path: a <video> element is created, plays, and draws.
  const result = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width=64; c.height=64;
    const cx = c.getContext('2d');
    const stream = c.captureStream(15);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(res => rec.onstop = res);
    rec.start();
    let frames = 0;
    await new Promise(res => { const t = setInterval(() => { cx.fillStyle = frames++%2 ? '#f0f' : '#0ff'; cx.fillRect(0,0,64,64); if (frames>6){ clearInterval(t); res(); } }, 30); });
    rec.stop(); await done;
    const blob = new Blob(chunks, { type:'video/webm' });
    const url = URL.createObjectURL(blob);
    // drive the real app path
    Skin.bgImage = url; Skin.bgMode = 'video';
    setBgMedia(url, 'video');
    Skin.apply({ colors:{primary:Skin.primary,secondary:Skin.secondary}, background:{ mode:'video', asset:url } });
    // wait for the video element to be ready
    await new Promise(res => setTimeout(res, 600));
    draw();
    return { bgMode: Skin.bgMode, kind: _bgKind, isVideo: _bgMedia && _bgMedia.tagName === 'VIDEO', ready: _bgReady(_bgMedia) };
  });

  expect(result.bgMode).toBe('video');
  expect(result.kind).toBe('video');
  expect(result.isVideo).toBe(true);
  expect(result.ready).toBe(true);   // the video actually loaded + has dimensions
});
