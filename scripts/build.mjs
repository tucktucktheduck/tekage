// TKG build / export. Concatenates the modular src/ files (in manifest order) and
// inlines them into the HTML template, producing the single self-contained tkg.html.
// exportHTML(config) additionally BAKES a frozen config into the file so the export
// opens offline already configured (the founder's "HTML-generator" model, docs/10).
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

export function buildHTML(opts = {}) {
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
  const bundle = manifest.order
    .map((f) => `/* ==== FILE: ${f} ==== */\n` + readFileSync(f, 'utf8'))
    .join('\n');
  const template = readFileSync('src/shell/template.html', 'utf8');
  let injected = bundle;
  // bake the famous songs (base64 MIDI) into the game so they load offline, no
  // fetch/CORS. window.__TKG_SONGS__ is read by src/content/mutopiaSongs.js.
  if (opts.songsData) injected = `window.__TKG_SONGS__=${JSON.stringify(opts.songsData)};\n` + injected;
  if (opts.config) {
    // freeze the chosen config in front of the bundle; config.js reads it at boot
    injected = `window.__TKG_CONFIG__=Object.freeze(${JSON.stringify(opts.config)});\n` + injected;
  }
  return template.replace('/*TKG_BUNDLE*/', () => injected);
}

// load the pure engine + the authored library (for computing tiers at build time)
function loadEngine() {
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
  const files = manifest.order.filter((f) => /^src\/engine\//.test(f) || f === 'src/content/library.js');
  let src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  src += '\n;module.exports={parseMidi,deriveVersions,detectSourceHands,LIBRARY,buildLibrarySong};';
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  return m.exports;
}

// catalog entries for the authored beginner/traditional songs (already in the
// bundle as note data; the library page links to them via ?song=lib:<id>)
function authoredCatalog(E) {
  const out = [];
  for (const spec of (E.LIBRARY || [])) {
    try {
      const parsed = E.buildLibrarySong(spec);
      const dv = E.deriveVersions(parsed);
      const full = dv.versions.find((v) => v.kind === 'full') || dv.versions[dv.versions.length - 1];
      const tag = (spec.tag || 'trad').split('·')[0].trim().toLowerCase().replace(/\.$/, '');
      out.push({
        id: 'lib:' + spec.id, title: spec.title, composer: 'Traditional', tag,
        duration: Math.round(dv.durationSec || 0), notes: parsed.notes.length,
        stars: full ? full.stars : 2, handsFromSource: false,
        tiers: dv.versions.filter((v) => v.kind !== 'baked-melody').map((v) => ({
          id: v.id, name: v.name, notes: v.notes.length, stars: v.stars, difficulty: +(v.difficulty || 0).toFixed(2) })),
      });
    } catch (e) { /* skip */ }
  }
  return out;
}

// read songs/manifest.json + songs/*.mid -> { songs (with base64+tiers), catalog (metadata only) }
export function buildSongsData() {
  const mfPath = 'songs/manifest.json';
  if (!existsSync(mfPath)) return { songs: [], catalog: [] };
  const manifest = JSON.parse(readFileSync(mfPath, 'utf8'));
  const E = loadEngine();
  const songs = [], catalog = [];
  for (const m of manifest) {
    const p = path.join('songs', m.file);
    if (!existsSync(p)) continue;
    const buf = readFileSync(p);
    let meta;
    try {
      const parsed = E.parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const dv = E.deriveVersions(parsed);
      const full = dv.versions.find((v) => v.kind === 'full') || dv.versions[dv.versions.length - 1];
      const hands = E.detectSourceHands(parsed.notes.map((n) => ({ ...n })));
      meta = {
        id: m.id, title: m.title, composer: m.composer, tag: m.tag || 'classical',
        duration: Math.round(dv.durationSec || 0), notes: parsed.notes.length,
        stars: full ? full.stars : 3, handsFromSource: hands,
        tiers: dv.versions.filter((v) => v.kind !== 'baked-melody').map((v) => ({
          id: v.id, name: v.name, notes: v.notes.length, stars: v.stars, difficulty: +(v.difficulty || 0).toFixed(2) })),
      };
    } catch (e) { continue; }
    songs.push({ ...meta, midi: buf.toString('base64') });
    catalog.push(meta);
  }
  // add the authored beginner/traditional songs to the library catalog
  for (const c of authoredCatalog(E)) catalog.push(c);
  return { songs, catalog };
}

// T10: bake engine + frozen config into a standalone, OFFLINE HTML string.
// Strips external <link>s (web fonts) so the export makes zero network calls and
// opens fully offline (falling back to the CSS font stack). The dev build keeps them.
export function exportHTML(config) {
  let html = buildHTML({ config });
  html = html.replace(/[ \t]*<link\b[^>]*>\s*\n?/gi, '');
  return html;
}

// Generate library.html from the template + the baked song catalog (metadata).
// The game's LIBRARY button links here; like tkg.html it's a build artifact.
export function buildLibrary(catalog) {
  const tpl = readFileSync('src/shell/library.template.html', 'utf8');
  return tpl.replace('/*__CATALOG__*/', () => JSON.stringify(catalog || []));
}

// CLI: `node scripts/build.mjs` writes tkg.html (songs baked) + library.html.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/build.mjs')) {
  const { songs, catalog } = buildSongsData();
  const html = buildHTML({ songsData: songs });
  writeFileSync('tkg.html', html, 'utf8');
  const n = JSON.parse(readFileSync('src/manifest.json', 'utf8')).order.length;
  console.log(`built tkg.html (${html.length} bytes, ${n} modules, ${songs.length} songs baked)`);
  const lib = buildLibrary(catalog);
  writeFileSync('library.html', lib, 'utf8');
  console.log(`built library.html (${lib.length} bytes, ${catalog.length} songs)`);
  // Stage the static-hosting output (Vercel/Netlify/GitHub Pages serve public/).
  // Done here in Node (not shell cp) so it works on Windows dev machines too.
  // index.html = the game (it has its own landing page); tkg.html kept under its
  // own name because library.html links to it relatively.
  const { mkdirSync, copyFileSync } = await import('fs');
  mkdirSync('public', { recursive: true });
  copyFileSync('tkg.html', 'public/index.html');
  copyFileSync('tkg.html', 'public/tkg.html');
  copyFileSync('library.html', 'public/library.html');
  console.log('staged public/ (index.html, tkg.html, library.html)');
}
