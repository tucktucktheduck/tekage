// TKG build: concatenate the modular src/ files (in manifest order) and inline
// them into the HTML template, producing the single self-contained tkg.html that
// players run. The bundle is an OUTPUT — develop in src/, never edit tkg.html.
// See docs/01-ARCHITECTURE.md and docs/10-CONFIG-AND-HTML-GENERATOR.md.
import { readFileSync, writeFileSync } from 'fs';

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
const bundle = manifest.order
  .map((f) => `/* ==== FILE: ${f} ==== */\n` + readFileSync(f, 'utf8'))
  .join('\n');

const template = readFileSync('src/shell/template.html', 'utf8');
const html = template.replace('/*TKG_BUNDLE*/', () => bundle);

writeFileSync('tkg.html', html, 'utf8');
console.log(`built tkg.html (${html.length} bytes, ${manifest.order.length} modules)`);
