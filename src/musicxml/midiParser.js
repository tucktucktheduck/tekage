// ═══════════════════════════════════════════════════════════
//  MIDI BINARY PARSER
//  Parses Standard MIDI Format (.mid/.midi) into note arrays
//  compatible with Tekage's mxNotes format.
//
//  Returns { notes, trackParts } where:
//    notes      — all non-percussion notes merged, sorted by startSec
//    trackParts — per-MIDI-channel parts:
//                   [{id, name, notes}, ...]
//                 Channel 9 (drums) is always excluded.
//                 When 2+ channels have notes, an "All Parts"
//                 merged entry is prepended so the selector
//                 defaults to the combined arrangement.
// ═══════════════════════════════════════════════════════════

/**
 * @returns {{ notes: NoteObj[], trackParts: TrackPart[] }}
 */
export function parseMidi(buffer) {
  const data = new Uint8Array(buffer);
  let pos = 0;

  function readUint32() {
    const v = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
    pos += 4; return v >>> 0;
  }
  function readUint16() {
    const v = (data[pos] << 8) | data[pos+1]; pos += 2; return v;
  }
  function readVLQ() {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = data[pos++]; v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  }

  // ── MThd header ──
  if (readUint32() !== 0x4d546864) throw new Error('Not a MIDI file');
  readUint32(); // header length (always 6)
  readUint16(); // format (0/1/2) — not needed with channel-based separation
  const numTracks = readUint16();
  const division  = readUint16();
  if (division & 0x8000) throw new Error('SMPTE timecode MIDI not supported');

  // ── Parse all track chunks into raw event arrays ──
  const rawTracks = [];
  for (let t = 0; t < numTracks; t++) {
    if (pos + 8 > data.length) break;
    const chunkType = readUint32();
    const chunkLen  = readUint32();
    const chunkEnd  = pos + chunkLen;

    if (chunkType !== 0x4d54726b) { pos = chunkEnd; continue; }

    const events = [];
    let tick = 0, runningStatus = 0;
    while (pos < chunkEnd) {
      const delta = readVLQ(); tick += delta;
      let statusByte = data[pos];
      if (statusByte & 0x80) { runningStatus = statusByte; pos++; }
      else                   { statusByte = runningStatus; }
      const type = statusByte & 0xf0;

      if (statusByte === 0xff) {
        const metaType = data[pos++], metaLen = readVLQ();
        if (metaType === 0x51 && metaLen === 3) {
          const tempo = (data[pos] << 16) | (data[pos+1] << 8) | data[pos+2];
          events.push({ tick, type: 'tempo', tempo });
        }
        pos += metaLen; runningStatus = 0;
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        pos += readVLQ(); runningStatus = 0;
      } else if (type === 0x80 || type === 0x90) {
        const note = data[pos++], velocity = data[pos++];
        events.push({ tick, type: (type === 0x90 && velocity > 0) ? 'noteon' : 'noteoff',
                      channel: statusByte & 0x0f, note });
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) { pos += 2; }
        else if (type === 0xc0 || type === 0xd0) { pos += 1; }
        else { pos++; }
    }
    pos = chunkEnd;
    rawTracks.push(events);
  }

  // ── Tempo map (always built from first track) ──
  const tempoMap = [{ tick: 0, tempo: 500000 }];
  if (rawTracks[0]) {
    for (const ev of rawTracks[0]) {
      if (ev.type === 'tempo') tempoMap.push({ tick: ev.tick, tempo: ev.tempo });
    }
  }
  tempoMap.sort((a, b) => a.tick - b.tick);

  function tickToSec(targetTick) {
    let secs = 0, lastTick = 0, tempo = tempoMap[0].tempo;
    for (let i = 1; i < tempoMap.length; i++) {
      if (tempoMap[i].tick >= targetTick) break;
      secs    += (tempoMap[i].tick - lastTick) / division * (tempo / 1e6);
      lastTick = tempoMap[i].tick;
      tempo    = tempoMap[i].tempo;
    }
    return secs + (targetTick - lastTick) / division * (tempo / 1e6);
  }

  // ── Collect notes from all tracks, grouped by MIDI channel ──
  // Channel 9 (percussion/drums) is excluded entirely.
  const channelNotes = new Map(); // channel → NoteObj[]

  for (let ti = 0; ti < rawTracks.length; ti++) {
    const track = rawTracks[ti];
    if (!track) continue;

    const active = new Map(); // `${channel}-${note}` → { startTick, channel }
    let lastTick = 0;

    for (const ev of track) {
      if (ev.tick > lastTick) lastTick = ev.tick;

      if (ev.type === 'noteon') {
        active.set(`${ev.channel}-${ev.note}`, { startTick: ev.tick, channel: ev.channel });
      } else if (ev.type === 'noteoff') {
        const key = `${ev.channel}-${ev.note}`;
        const a   = active.get(key);
        if (a) {
          active.delete(key);
          const midi = ev.note;
          if (midi >= 21 && midi <= 108 && a.channel !== 9) {
            const startSec    = tickToSec(a.startTick);
            const durationSec = Math.max(tickToSec(ev.tick) - startSec, 0.05);
            if (!channelNotes.has(a.channel)) channelNotes.set(a.channel, []);
            channelNotes.get(a.channel).push({ midi, startSec, durationSec, partId: `ch-${a.channel}` });
          }
        }
      }
    }

    // Close unterminated notes using last tick in this track
    for (const [key, a] of active) {
      const midi = parseInt(key.split('-')[1]);
      if (midi >= 21 && midi <= 108 && a.channel !== 9) {
        const startSec    = tickToSec(a.startTick);
        const durationSec = Math.max(tickToSec(lastTick) - startSec, 0.05);
        if (!channelNotes.has(a.channel)) channelNotes.set(a.channel, []);
        channelNotes.get(a.channel).push({ midi, startSec, durationSec, partId: `ch-${a.channel}` });
      }
    }
  }

  // ── Build per-channel parts ──
  const channelParts = [];
  for (const [ch, notes] of [...channelNotes.entries()].sort((a, b) => a[0] - b[0])) {
    if (notes.length === 0) continue;
    notes.sort((a, b) => a.startSec - b.startSec);
    channelParts.push({ id: `ch-${ch}`, name: `Channel ${ch + 1}`, notes });
  }

  const originalChannelParts = [...channelParts];

  // allNotes from original channels only
  const allNotes = originalChannelParts
    .flatMap(t => t.notes)
    .sort((a, b) => a.startSec - b.startSec);

  // Multi-original-channel: prepend "All Parts"; otherwise use channelParts as-is
  const trackParts = originalChannelParts.length > 1
    ? [{ id: 'all', name: `All Parts (${allNotes.length} notes)`, notes: allNotes }, ...channelParts]
    : channelParts;

  return { notes: allNotes, trackParts };
}
