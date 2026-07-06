const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T0 acceptance: the built tkg.html loads with ZERO console errors, the stage
// canvas renders, and the version picker populates from the demo song.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

// these specs model a RETURNING player — boot already-onboarded so the first-visit
// landing (T25) doesn't intercept their clicks. (read-modify-write: keep other fields)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('tkg.html loads with no console errors and renders', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(tkgUrl);

  // stage canvas is present and visible
  await expect(page.locator('#stage')).toBeVisible();

  // the demo song loads on boot -> version buttons appear in #verRow
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 })
    .toBeGreaterThan(0);

  expect(errors, 'console/page errors: ' + errors.join(' | ')).toHaveLength(0);
});

test('keyboard-map overlay can open', async ({ page }) => {
  await page.goto(tkgUrl);
  // #mapOverlay exists; opening it should not throw (viewer is built in T7).
  await expect(page.locator('#mapOverlay')).toHaveCount(1);
});

// LISTEN mode must auto-play the whole song (selecting it starts playback).
test('LISTEN mode auto-plays the song', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  await expect(page.locator('#playBtn')).not.toHaveClass(/on/); // not playing yet
  await page.click('#modeSeg button[data-mode="listen"]');
  await expect(page.locator('#playBtn')).toHaveClass(/on/);      // now playing
});

// T7 acceptance: keyboard-map viewer — mapped keys opaque / unmapped dim, press
// lights both, lines toggle off by default. Mapped state comes from the (config-
// driven) KEY_HAND, so the map reflects TKGConfig.
test('keyboard-map viewer: states, press-to-light, lines toggle', async ({ page }) => {
  await page.goto(tkgUrl);
  await page.click('#mapBtn');
  await expect(page.locator('#mapOverlay')).toHaveClass(/open/);

  // opacity states: both mapped and unmapped (dim) keys are present
  await expect.poll(() => page.locator('.mapKey.mapped').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.mapKey.dim').count()).toBeGreaterThan(0);

  // every piano key is labelled with its note name (C4, D, E, F, G, A, B, sharps…)
  await expect.poll(() => page.locator('#mapPiano .mapNote').count()).toBeGreaterThan(10);

  // lines are OFF by default (no <line> drawn yet)
  expect(await page.locator('#mapSvg line').count()).toBe(0);

  // press a mapped key -> it lights up in the viewer
  await page.keyboard.down('a');
  await expect.poll(() => page.locator('.mapKey.lit').count()).toBeGreaterThan(0);
  await page.keyboard.up('a');

  // lines toggle turns on
  await page.click('#mapLinesBtn');
  await expect(page.locator('#mapLinesBtn')).toHaveClass(/sel/);
});

// T8 acceptance: dead-center stays clear of interactive controls (Wispr-Flow gap).
// No visible button/input/select/slider may intersect the center 24% x 24% box.
test('no interactive control occupies the center zone', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect(page.locator('#stage')).toBeVisible();

  const vp = page.viewportSize();
  const cx = vp.width / 2, cy = vp.height / 2;
  const halfW = vp.width * 0.12, halfH = vp.height * 0.12;
  const zone = { left: cx - halfW, right: cx + halfW, top: cy - halfH, bottom: cy + halfH };

  const controls = page.locator('button, input, select, [role="slider"], a[href]');
  const n = await controls.count();
  const offenders = [];
  for (let i = 0; i < n; i++) {
    const el = controls.nth(i);
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox();
    if (!b) continue;
    const intersects = b.x < zone.right && b.x + b.width > zone.left &&
                       b.y < zone.bottom && b.y + b.height > zone.top;
    if (intersects) offenders.push(await el.evaluate(e => e.id || e.className || e.tagName));
  }
  expect(offenders, 'controls intruding on the center zone: ' + offenders.join(', ')).toHaveLength(0);
});
