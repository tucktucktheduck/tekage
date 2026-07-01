const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const path = require('path');

// The library page + the game's baked-song loading (?song=<id>, fully offline).
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;
const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'library.html')).href;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('library page renders the catalog, search + difficulty filters work, links target the game', async ({ page }) => {
  await page.goto(libUrl);
  const cards = page.locator('.card');
  await expect.poll(() => cards.count()).toBeGreaterThan(8);      // the famous catalog

  // every PLAY link points at the game with a baked song id
  const href = await page.locator('.card .play').first().getAttribute('href');
  expect(href).toMatch(/tkg\.html\?song=/);

  // each card shows the three difficulty tiers
  await expect(page.locator('.card').first().locator('.tier')).toHaveCount(3);

  // search narrows the list
  const total = await cards.count();
  await page.fill('#q', 'zzz-no-such-song');
  await expect.poll(() => cards.count()).toBe(0);
  await page.fill('#q', '');
  await expect.poll(() => cards.count()).toBe(total);

  // difficulty filter shows fewer (or equal) items
  await page.click('#fil button[data-min="4"]');
  await expect.poll(() => cards.count()).toBeLessThanOrEqual(total);
});

test('game loads a baked famous song from ?song=<id> — fully offline, no network', async ({ page }) => {
  // block ALL network to prove it needs none (baked MIDI is inlined)
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:')) return route.continue();
    return route.abort();   // no https/fonts/mutopia — must still load
  });

  await page.goto(tkgUrl + '?song=entertainer');
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 8000 }).toBeGreaterThan(0);
  const loaded = await page.evaluate(() => ({ title: Song.title, notes: Song.notes.length, versions: Song.versions.length }));
  expect(loaded.title.toLowerCase()).toContain('entertainer');
  expect(loaded.notes).toBeGreaterThan(100);
  expect(loaded.versions).toBeGreaterThanOrEqual(2);

  // no first-visit landing when a specific song was requested
  await expect(page.locator('#obLanding')).toHaveCount(0);
});

test('the in-game song menu lists the famous songs and loads one', async ({ page }) => {
  await page.goto(tkgUrl);
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  // the menu has a Famous optgroup with baked songs
  const famous = await page.locator('#songSel optgroup[label="Famous"] option').count();
  expect(famous).toBeGreaterThan(8);
  await page.selectOption('#songSel', 'baked:fur-elise');
  await expect(page.locator('#songName')).toContainText('Elise');
  expect(await page.evaluate(() => Song.notes.length)).toBeGreaterThan(50);
});
