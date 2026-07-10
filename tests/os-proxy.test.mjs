// Unit test for osFetch's Cloudflare-solving proxy wiring (no network).
// Verifies: with SCRAPER_PROXY set we hit the proxy with the OS url substituted
// and encoded into {url}; without it we hit OnlineSequencer directly with a
// browser User-Agent. Stubs global.fetch so nothing leaves the machine.
import assert from 'node:assert';

let calls = [];
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => { calls.push({ url, opts }); return { ok: true, status: 200, async text() { return ''; } }; };

async function run() {
  // --- direct mode (no proxy env) ---
  delete process.env.SCRAPER_PROXY;
  let mod = await import('../api/_os.mjs?direct=' + Date.now());
  calls = [];
  await mod.osFetch('https://onlinesequencer.net/sequences?search=fur%20elise&sort=1');
  assert.equal(calls.length, 1, 'one fetch');
  assert.match(calls[0].url, /^https:\/\/onlinesequencer\.net\//, 'direct fetch hits OS');
  assert.ok(calls[0].opts.headers && /Chrome/.test(calls[0].opts.headers['User-Agent']), 'direct fetch sends a browser UA');

  // --- proxy mode (SCRAPER_PROXY env set) ---
  process.env.SCRAPER_PROXY = 'https://api.example.com/v1/?apikey=SECRET&antibot=true&url={url}';
  mod = await import('../api/_os.mjs?proxy=' + Date.now());   // re-import: env read at module load
  calls = [];
  const osUrl = 'https://onlinesequencer.net/5510142';
  await mod.osFetch(osUrl);
  assert.equal(calls.length, 1, 'one fetch (proxied)');
  assert.match(calls[0].url, /^https:\/\/api\.example\.com\/v1\//, 'proxy mode hits the scraper API');
  assert.ok(calls[0].url.includes(encodeURIComponent(osUrl)), 'the OS url is url-encoded into {url}');
  assert.ok(!calls[0].url.includes('{url}'), 'the {url} placeholder is fully substituted');

  console.log('os-proxy.test.mjs: OK (direct + proxy modes)');
}

run().catch((e) => { console.error('os-proxy.test.mjs FAILED:', e.message); process.exit(1); })
  .finally(() => { global.fetch = realFetch; });
