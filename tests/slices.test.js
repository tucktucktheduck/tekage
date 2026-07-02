// tests/slices.test.js — the generalized N-slice solver, headless.
// Proves the founder's customization targets solve TODAY (pure engine):
//   1. legacy parity: the standard 2×12 game still solves through the new core
//   2. asymmetric: 2 keys left / 18 keys right ("two on the left, 18 on the right")
//   3. one mega slice (24 keys, one hand does everything)
//   4. three slices spread across the keyboard
// Exit non-zero on any failure so verify.sh can gate on it.

const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
const files = manifest.order.filter(f => /^src\/engine\//.test(f));
let src = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
src += ';module.exports={makeSlice,solvePlanSlices,solvePlan,parseMidi,deriveVersions,MAP,applyMapping};';
const m = { exports: {} }; new Function('module', 'exports', src)(m, m.exports);
const E = m.exports;

let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + msg); if (!c) fails++; };
const noteCount = r => r.plan.filter(e => e.type === 'note').length;
const skipCount = r => r.plan.filter(e => e.type === 'skip').length;

// a simple two-octave melody with a few dyads — every note reachable somewhere
const mel = [];
const seq = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 76, 72, 67, 60];
seq.forEach((p, i) => mel.push({ midi: p, startSec: i * 0.5, durationSec: 0.4, salience: 0.5 }));
mel.push({ midi: 48, startSec: 2.0, durationSec: 0.4, salience: 0.4 });   // bass dyad partners
mel.push({ midi: 62, startSec: 6.0, durationSec: 0.4, salience: 0.4 });   // reachable by every tested shape
mel.sort((a, b) => a.startSec - b.startSec);

console.log('— 1 · LEGACY PARITY (standard 2×12 through the new core) —');
{
  const r = E.solvePlan(mel);
  ok(noteCount(r) === mel.length, 'standard layout plays every note (' + noteCount(r) + '/' + mel.length + ')');
  ok(skipCount(r) === 0, 'no skips on a playable melody');
  ok(r.initialState && Number.isInteger(r.initialState.leftOctave) && Number.isInteger(r.initialState.rightOctave),
     'legacy initialState shape preserved (L' + r.initialState.leftOctave + ' R' + r.initialState.rightOctave + ')');
  ok(r.plan.every(e => e.type !== 'note' || e.hand === 'left' || e.hand === 'right'), 'legacy hand labels preserved');
  ok(r.stateTimeline.every(s => 'leftOctave' in s && 'rightOctave' in s), 'legacy timeline shape preserved');
}

console.log('— 2 · ASYMMETRIC: 2 keys left / 18 keys right —');
{
  // left hand: two keys, a root + fifth; right hand: 18 chromatic keys (1.5 octaves)
  const left  = E.makeSlice('left',  { a: 0, s: 7 }, { order: 0, step: 12, minAnchor: 12, maxAnchor: 96 });
  const rkeys = {}; 'qwertyuiopasdfghjk'.split('').forEach((k, i) => rkeys['R' + k] = i);
  const right = E.makeSlice('right', rkeys, { order: 1, step: 12, minAnchor: 12, maxAnchor: 96 });
  ok(right.span === 17, '18-key slice spans 17 semitones');
  const r = E.solvePlanSlices(mel, [left, right]);
  ok(noteCount(r) === mel.length, '2+18 config plays every note (' + noteCount(r) + '/' + mel.length + ')');
  const rightNotes = r.plan.filter(e => e.type === 'note' && e.slice === 'right').length;
  ok(rightNotes >= mel.length - 4, 'the wide hand carries the melody (' + rightNotes + ' notes)');
  // the wide slice needs FEWER shifts than a 12-key slice would for the same line
  const shifts = r.plan.filter(e => e.type === 'shift' && e.slice === 'right').length;
  const std = E.solvePlan(mel);
  const stdShifts = std.plan.filter(e => e.type === 'shift').length;
  ok(shifts <= stdShifts, 'wider slice shifts less or equal (' + shifts + ' vs standard ' + stdShifts + ')');
}

console.log('— 3 · ONE MEGA SLICE (24 keys, single hand) —');
{
  const keys = {}; for (let i = 0; i < 24; i++) keys['K' + i] = i;
  const mega = E.makeSlice('mega', keys, { order: 0, step: 12, minAnchor: 12, maxAnchor: 84 });
  const r = E.solvePlanSlices(mel, [mega]);
  ok(noteCount(r) === mel.length, 'mega slice plays every note (' + noteCount(r) + '/' + mel.length + ')');
  ok([...r.slicesUsed].join() === 'mega', 'all notes on the one slice');
}

console.log('— 4 · THREE SLICES —');
{
  const s1 = E.makeSlice('low',  { z: 0, x: 4, c: 7 },             { order: 0, step: 12, minAnchor: 12, maxAnchor: 96 });
  const s2 = E.makeSlice('mid',  { a: 0, s: 2, d: 4, f: 5, g: 7, h: 9, j: 11 }, { order: 1, step: 12, minAnchor: 12, maxAnchor: 96 });
  const s3 = E.makeSlice('high', { q: 0, w: 2, e: 4, r: 5, t: 7 }, { order: 2, step: 12, minAnchor: 12, maxAnchor: 96 });
  // C-major material only (the slices above are diatonic shapes)
  const tune = [48, 52, 55, 60, 64, 67, 72, 76, 79, 72, 67, 60].map((p, i) =>
    ({ midi: p, startSec: i * 0.6, durationSec: 0.5, salience: 0.5 }));
  const r = E.solvePlanSlices(tune, [s1, s2, s3]);
  ok(noteCount(r) === tune.length, 'three slices play every note (' + noteCount(r) + '/' + tune.length + ')');
  ok(r.slicesUsed.size >= 2, 'work is spread across slices (' + [...r.slicesUsed].join('+') + ')');
  ok(r.stateTimeline.every(s => 'low' in s.anchors && 'mid' in s.anchors && 'high' in s.anchors),
     'timeline carries an anchor per slice');
}

console.log('— 5 · CUSTOM MAPPING through the legacy path (numeric offsets in MAP) —');
{
  const saved = JSON.parse(JSON.stringify(E.MAP));
  E.MAP.left = { a: 0, s: 7 };                                     // 2-key left hand
  E.MAP.right = {}; 'qwertyuiopasdfghjk'.split('').forEach((k, i) => E.MAP.right['R' + k] = i);
  E.applyMapping();
  const r = E.solvePlan(mel);
  ok(noteCount(r) === mel.length, 'solvePlan() honors a custom asymmetric MAP (' + noteCount(r) + '/' + mel.length + ')');
  E.MAP.left = saved.left; E.MAP.right = saved.right; E.applyMapping();
}

console.log('\n' + (fails ? ('x ' + fails + ' SLICE CHECK(S) FAILED') : 'ALL SLICE CHECKS PASSED'));
process.exit(fails ? 1 : 0);
