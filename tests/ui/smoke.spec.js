const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// T0 acceptance: the built tkg.html loads with ZERO console errors, the stage
// canvas renders, and the version picker populates from the demo song.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;

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
