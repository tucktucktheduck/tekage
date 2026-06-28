// TKG build / export. Concatenates the modular src/ files (in manifest order) and
// inlines them into the HTML template, producing the single self-contained tkg.html.
// exportHTML(config) additionally BAKES a frozen config into the file so the export
// opens offline already configured (the founder's "HTML-generator" model, docs/10).
import { readFileSync, writeFileSync } from 'fs';

export function buildHTML(opts = {}) {
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
  const bundle = manifest.order
    .map((f) => `/* ==== FILE: ${f} ==== */\n` + readFileSync(f, 'utf8'))
    .join('\n');
  const template = readFileSync('src/shell/template.html', 'utf8');
  let injected = bundle;
  if (opts.config) {
    // freeze the chosen config in front of the bundle; config.js reads it at boot
    injected = `window.__TKG_CONFIG__=Object.freeze(${JSON.stringify(opts.config)});\n` + bundle;
  }
  return template.replace('/*TKG_BUNDLE*/', () => injected);
}

// T10: bake engine + frozen config into a standalone, OFFLINE HTML string.
// Strips external <link>s (web fonts) so the export makes zero network calls and
// opens fully offline (falling back to the CSS font stack). The dev build keeps them.
export function exportHTML(config) {
  let html = buildHTML({ config });
  html = html.replace(/[ \t]*<link\b[^>]*>\s*\n?/gi, '');
  return html;
}

// CLI: `node scripts/build.mjs` writes the default (un-baked) tkg.html.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/build.mjs')) {
  const html = buildHTML();
  writeFileSync('tkg.html', html, 'utf8');
  const n = JSON.parse(readFileSync('src/manifest.json', 'utf8')).order.length;
  console.log(`built tkg.html (${html.length} bytes, ${n} modules)`);
}
