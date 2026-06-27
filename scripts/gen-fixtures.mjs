// Generate the deterministic test fixtures used by the golden tests.
// Each fixture is a ParsedSong-shaped object: { title, duration, parts?, notes:[{midi,startSec,durationSec,vel,channel}] }.
// Reproducible: `node scripts/gen-fixtures.mjs`. Fixtures are committed; regenerate
// intentionally and review the diff (golden outputs are derived from these).
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('tests/fixtures', { recursive: true });

const note = (midi, startSec, durationSec, vel = 80, channel = 0) => ({ midi, startSec, durationSec, vel, channel });
const dur = (notes) => Math.max(...notes.map((n) => n.startSec + n.durationSec));
// tiny deterministic PRNG (mulberry32)
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const fixtures = {};

// 1) simple-melody — one C-major scale, quarter notes
{
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const notes = scale.map((m, i) => note(m, i * 0.5, 0.45));
  fixtures['simple-melody'] = { title: 'Simple Melody', notes, duration: dur(notes) };
}

// 2) pop-song — top-line melody over a simple bass
{
  const mel = [72, 74, 76, 74, 72, 71, 72, 76];
  const bass = [48, 48, 53, 53, 55, 55, 48, 48];
  const notes = [];
  mel.forEach((m, i) => notes.push(note(m, i * 0.5, 0.45, 92)));
  bass.forEach((m, i) => notes.push(note(m, i * 0.5, 0.5, 70)));
  notes.sort((a, b) => a.startSec - b.startSec);
  fixtures['pop-song'] = { title: 'Pop Song', notes, duration: dur(notes) };
}

// 3) dense-piano — many notes, seeded
{
  const r = rng(12345); const notes = [];
  for (let i = 0; i < 96; i++) notes.push(note(48 + Math.floor(r() * 36), +(i * 0.18).toFixed(3), 0.16, 60 + Math.floor(r() * 40)));
  notes.sort((a, b) => a.startSec - b.startSec);
  fixtures['dense-piano'] = { title: 'Dense Piano', notes, duration: dur(notes) };
}

// 4) chord-heavy — block triads
{
  const roots = [60, 65, 67, 60, 62, 67, 65, 60];
  const notes = [];
  roots.forEach((root, i) => { [0, 4, 7].forEach((iv) => notes.push(note(root + iv, i * 0.75, 0.7, 85))); });
  notes.sort((a, b) => a.startSec - b.startSec);
  fixtures['chord-heavy'] = { title: 'Chord Heavy', notes, duration: dur(notes) };
}

// 5) octave-jump — a line that leaps octaves (solver must not penalize)
{
  const seq = [60, 72, 62, 74, 64, 76, 65, 77, 67, 79];
  const notes = seq.map((m, i) => note(m, i * 0.4, 0.35, 80));
  fixtures['octave-jump'] = { title: 'Octave Jump', notes, duration: dur(notes) };
}

// 6) multi-part — two channels (melody + accompaniment)
{
  const mel = [76, 77, 79, 77, 76, 74, 72, 74];
  const acc = [60, 64, 60, 64, 59, 62, 60, 64];
  const notes = [];
  mel.forEach((m, i) => notes.push(note(m, i * 0.5, 0.45, 95, 0)));
  acc.forEach((m, i) => notes.push(note(m, i * 0.5, 0.45, 65, 1)));
  notes.sort((a, b) => a.startSec - b.startSec);
  const parts = [
    { channel: 0, name: 'Channel 1 melody', notes: notes.filter((n) => n.channel === 0) },
    { channel: 1, name: 'Channel 2', notes: notes.filter((n) => n.channel === 1) },
  ];
  fixtures['multi-part'] = { title: 'Multi Part', notes, parts, duration: dur(notes) };
}

for (const [name, data] of Object.entries(fixtures)) {
  writeFileSync(`tests/fixtures/${name}.json`, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`wrote tests/fixtures/${name}.json (${data.notes.length} notes)`);
}
