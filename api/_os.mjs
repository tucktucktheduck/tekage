// api/_os.mjs — shared OnlineSequencer helpers (underscore-prefixed, so Vercel
// does NOT expose it as an endpoint). No third-party deps.
//
// OnlineSequencer stopped serving MIDI from /app/midi.php (dead, 404s). Instead
// every sequence page embeds its notes as a base64 protobuf in `var data=...`.
// We decode that and synthesize a Standard MIDI File ourselves — the exact same
// bytes their client-side Download button would produce. The game's existing
// parseMidi pipeline then charts it like any other MIDI.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Fetch a sequence page and pull out the base64 protobuf blob.
export async function fetchSequenceData(id) {
  const res = await fetch(`https://onlinesequencer.net/${id}`, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
  });
  if (!res.ok) throw new Error(`sequence ${id}: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/var data = (['"])([A-Za-z0-9+/=]+)\1/);
  if (!m) throw new Error(`sequence ${id}: no note data on page`);
  const title = (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1]
             || (html.match(/<title>([^<]*)<\/title>/) || [])[1] || `Sequence ${id}`;
  return { data: m[2], title: decodeEntities(title).replace(/\s*[-|·]\s*Online Sequencer.*$/i, '').trim() };
}

// Decode the OnlineSequencer protobuf. Schema (proto3, default-valued fields omitted):
//   top-level: field1 = settings submessage (field1 = bpm), field2 = repeated note
//   note:      field1 = type (row index), field2 = time, field3 = length,
//              field4 = instrument, field5 = volume   (times/lengths in 1/16-note units)
export function decodeData(b64) {
  const buf = Buffer.from(b64, 'base64');
  let p = 0;
  const varint = () => { let x = 0, s = 0; while (p < buf.length) { const b = buf[p++]; x |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; } return x >>> 0; };
  const f32 = () => { const v = buf.readFloatLE(p); p += 4; return v; };
  let bpm = 110; const notes = [];
  while (p < buf.length) {
    const key = varint(), field = key >> 3, wt = key & 7;
    if (field === 1 && wt === 2) {                       // settings submessage
      const len = varint(), end = p + len;   // read length FIRST (JS would eval p before varint())
      // bpm is field1 (varint) at the front; the rest holds nested instrument
      // submessages we don't need. ALWAYS resume at `end` so unknown nested fields
      // can never desync the top-level walk (some sequences carry big settings).
      const k = varint(), f = k >> 3, w = k & 7;
      if (f === 1 && w === 0) bpm = varint();
      p = end;
    } else if (field === 2 && wt === 2) {                // note submessage
      const len = varint(), end = p + len;
      const n = { type: 0, time: 0, length: 1, inst: 0, vol: 1 };
      while (p < end) { const k = varint(), f = k >> 3, w = k & 7;
        if (w === 0) { const v = varint(); if (f === 1) n.type = v; else if (f === 4) n.inst = v; }
        else if (w === 5) { const v = f32(); if (f === 2) n.time = v; else if (f === 3) n.length = v; else if (f === 5) n.vol = v; }
        else if (w === 2) p += varint(); else break; }
      p = end;                                            // sync-safe resume
      notes.push(n);
    } else if (wt === 0) varint(); else if (wt === 5) p += 4; else if (wt === 2) p += varint(); else break;
  }
  return { bpm, notes };
}

// Build a Standard MIDI File (format 0) from decoded notes. Mirrors their
// exportMidi(): 96 ticks per 1/16 unit at PPQ 384, pitch = 95 - type.
export function buildMidi({ bpm, notes }) {
  const PPQ = 384;
  const vlq = (n) => { const out = [n & 0x7f]; n >>>= 7; while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>>= 7; } return out; };
  const evs = [];
  for (const n of notes) {
    const pitch = Math.max(0, Math.min(127, 95 - n.type));
    const vel = Math.max(1, Math.min(127, Math.round((n.vol || 1) * 64)));
    const on = Math.round(n.time * 96);
    const off = Math.round((n.time + Math.max(n.length, 0.25)) * 96);
    evs.push({ tick: on, order: 1, bytes: [0x90, pitch, vel] });
    evs.push({ tick: off, order: 0, bytes: [0x80, pitch, 0] });
  }
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);   // offs before ons at a shared tick
  const trk = [];
  const mpqn = Math.round(60000000 / (bpm || 110));
  trk.push(...vlq(0), 0xFF, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff);
  let last = 0;
  for (const e of evs) { trk.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  trk.push(...vlq(0), 0xFF, 0x2F, 0x00);
  const L = trk.length;
  const head = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const th = [0x4D, 0x54, 0x72, 0x6B, (L >>> 24) & 0xff, (L >>> 16) & 0xff, (L >>> 8) & 0xff, L & 0xff];
  return Buffer.from([...head, ...th, ...trk]);
}

export function decodeEntities(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

export { UA };
