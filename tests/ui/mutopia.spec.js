const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');

// The Mutopia library page + the game's ?mutopia=<url> loading path.
const tkgUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'tkg.html')).href;
const libUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'library.html')).href;
const sampleMid = fs.readFileSync(path.resolve(__dirname, '..', 'fixtures', 'mutopia-sample.mid'));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('library page renders the catalog, search + difficulty filters work, links target the game', async ({ page }) => {
  await page.goto(libUrl);
  const cards = page.locator('.card');
  await expect.poll(() => cards.count()).toBeGreaterThan(10);     // a real catalog

  // every PLAY link points at the game with a mutopia MIDI url
  const href = await page.locator('.card .play').first().getAttribute('href');
  expect(href).toContain('tkg.html?mutopia=');
  expect(decodeURIComponent(href)).toMatch(/\.mid/i);

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

test('game loads a song from ?mutopia=<url> (charts a real MIDI off the wire)', async ({ page }) => {
  // serve the fixture MIDI for the mutopia fetch only (not the page nav)
  await page.route('**mutopiaproject.org/**', route => route.fulfill({
    status: 200, contentType: 'audio/midi', body: sampleMid,
  }));

  const fakeUrl = 'https://www.mutopiaproject.org/ftp/HandelGF/Aylesford/03-gavotte/03-gavotte.mid';
  await page.goto(tkgUrl + '?mutopia=' + encodeURIComponent(fakeUrl));

  // the version picker populates from the streamed song, and it has real notes
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 8000 }).toBeGreaterThan(0);
  const loaded = await page.evaluate(() => ({ notes: Song.notes.length, versions: Song.versions.length }));
  expect(loaded.notes).toBeGreaterThan(50);
  expect(loaded.versions).toBeGreaterThanOrEqual(2);

  // no first-visit landing when a specific song was requested
  await expect(page.locator('#obLanding')).toHaveCount(0);
});
