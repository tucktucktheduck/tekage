// T10: exportHTML(config) bakes engine + frozen config into a single, offline-
// capable HTML file. Run: node tests/export.test.mjs
import { exportHTML, buildHTML } from '../scripts/build.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) fails++; };

console.log('— EXPORT (T10) —');
const html = exportHTML({ mode: 'listen', skin: { bg: '#000000' } });

ok(typeof html === 'string' && html.length > 50000, 'exportHTML returns a full HTML document');
ok(html.includes('<canvas'), 'has the stage canvas markup');
ok(/loadConfig/.test(html), 'engine bundle is inlined (loadConfig present)');
ok(html.includes('__TKG_CONFIG__=Object.freeze('), 'a frozen config is baked in');
ok(html.includes('"mode":"listen"'), 'the baked config carries the chosen mode');
// offline / self-contained: no external scripts, stylesheets, or network calls
ok(!/<script\s+src=/i.test(html), 'no external <script src> (self-contained)');
ok(!/<link\s/i.test(html), 'no external <link> (web fonts stripped -> offline)');
ok(!/\bfetch\s*\(|XMLHttpRequest/.test(html), 'no network calls (fetch/XHR) in the bundle');
// the default (un-baked) dev build must NOT carry a baked config
ok(!buildHTML().includes('__TKG_CONFIG__=Object.freeze('), 'default build has no baked config');

console.log('\n' + (fails ? ('x ' + fails + ' EXPORT CHECK(S) FAILED') : 'EXPORT OK'));
process.exit(fails ? 1 : 0);
