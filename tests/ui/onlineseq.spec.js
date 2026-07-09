const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

// OnlineSequencer second-source (mocked /api) + library MIDI upload.
// These exercise fetch()-based loading, so they run over http:// (a file:// page
// cannot fetch — the same limitation baked songs avoid). A tiny static server
// serves the built pages from the repo root; /api/* is mocked per-test.
const ROOT = path.resolve(__dirname, '..', '..');
let server, base;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'tkg.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('nope'); return; }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(r => server.close(r)); });

async function sampleMidi() {
  const { buildMidi } = await import('../../api/_os.mjs');
  const notes = [];
  for (let i = 0; i < 24; i++) notes.push({ type: 48 - i, time: i * 2, length: 2, inst: 0, vol: 1 });
  return buildMidi({ bpm: 120, notes });   // Buffer
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { const k='tkg.profile.v1';
    const c=JSON.parse(localStorage.getItem(k)||'{}'); c.onboarded=true; localStorage.setItem(k,JSON.stringify(c)); } catch(e){} });
});

test('library ONLINE SEQ toggle searches, escapes titles, links to os:', async ({ page }) => {
  await page.route('**/api/search**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ results: [
      { id: '111', title: 'Megalovania <img src=x onerror=window.__xss=1>', notes: 1234, midi: '/api/midi?id=111' },
      { id: '222', title: 'Clean Song', notes: 42, midi: '/api/midi?id=222' },
    ] }),
  }));
  await page.goto(base + '/library.html');
  await page.click('#src button[data-src="os"]');
  await expect(page.locator('#fil')).toBeHidden();                 // star filters hidden in OS mode
  await page.fill('#q', 'megalovania');
  await expect.poll(() => page.locator('.card').count()).toBe(2);

  // XSS-y title is escaped: rendered as text, no injected <img>, handler never fires
  await expect(page.locator('.card .ctitle').first()).toContainText('Megalovania');
  expect(await page.locator('.card .ctitle img').count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  const href = await page.locator('.card .play').first().getAttribute('href');
  expect(href).toBe('tkg.html?song=os:111');
});

test('game charts an OnlineSequencer sequence from ?song=os:<id> via the proxy', async ({ page }) => {
  const midi = await sampleMidi();
  await page.route('**/api/midi**', route => route.fulfill({
    contentType: 'audio/midi',
    headers: { 'X-Sequence-Title': encodeURIComponent('My OS Tune') },
    body: midi,
  }));
  await page.goto(base + '/tkg.html?song=os:5555');
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 8000 }).toBeGreaterThan(0);
  const loaded = await page.evaluate(() => ({ title: Song.title, notes: Song.notes.length }));
  expect(loaded.title).toContain('My OS Tune');       // title came from the proxy header
  expect(loaded.notes).toBeGreaterThan(10);
  await expect(page.locator('#obLanding')).toHaveCount(0);
});

test('uploaded MIDI from the library loads in the game (?upload=1)', async ({ page }) => {
  const midi = await sampleMidi();
  const b64 = midi.toString('base64');
  await page.goto(base + '/tkg.html');                 // establish origin for sessionStorage
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 5000 }).toBeGreaterThan(0);
  await page.evaluate((data) => sessionStorage.setItem('tkg_upload', JSON.stringify({ name: 'my-song.mid', data })), b64);
  await page.goto(base + '/tkg.html?upload=1');
  await expect.poll(() => page.locator('#verRow > *').count(), { timeout: 8000 }).toBeGreaterThan(0);
  const t = await page.evaluate(() => Song.title);
  expect(t.toLowerCase()).toContain('my song');
});
