// ═══════════════════════════════════════════════════════════
//  MIDI BINARY PARSER
//  Parses Standard MIDI Format (.mid/.midi) into note arrays
//  compatible with Tekage's mxNotes format.
// ═══════════════════════════════════════════════════════════

/**
 * Parse a MIDI ArrayBuffer into an array of note objects:
 * [{ midi, startSec, durationSec, partId }, ...]
 */
export function parseMidi(buffer) {
  const data = new Uint8Array(buffer);
  let pos = 0;

  function readUint32() {
    const v = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
    pos += 4;
    return v >>> 0;
  }
  function readUint16() {
    const v = (data[pos] << 8) | data[pos+1];
    pos += 2;
    return v;
  }
  function readVLQ() {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = data[pos++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  }

  // Read MThd header
  const magic = readUint32();
  if (magic !== 0x4d546864) throw new Error('Not a MIDI file');
  const headerLen = readUint32();
  const format = readUint16();
  const numTracks = readUint16();
  const division = readUint16();

  if (division & 0x8000) throw new Error('SMPTE timecode MIDI not supported');

  // Parse all tracks
  const tracks = [];
  for (let t = 0; t < numTracks; t++) {
    if (pos + 8 > data.length) break;
    const chunkType = readUint32();
    const chunkLen = readUint32();
    const chunkEnd = pos + chunkLen;

    if (chunkType !== 0x4d54726b) { pos = chunkEnd; continue; }

    const events = [];
    let tick = 0;
    let runningStatus = 0;

    while (pos < chunkEnd) {
      const delta = readVLQ();
      tick += delta;

      let statusByte = data[pos];
      if (statusByte & 0x80) {
        runningStatus = statusByte;
        pos++;
      } else {
        statusByte = runningStatus;
      }

      const type = statusByte & 0xf0;

      if (statusByte === 0xff) {
        const metaType = data[pos++];
        const metaLen = readVLQ();
        if (metaType === 0x51 && metaLen === 3) {
          const tempo = (data[pos] << 16) | (data[pos+1] << 8) | data[pos+2];
          events.push({ tick, type: 'tempo', tempo });
        }
        pos += metaLen;
        runningStatus = 0;
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        const sysexLen = readVLQ();
        pos += sysexLen;
        runningStatus = 0;
      } else if (type === 0x80 || type === 0x90) {
        const note = data[pos++];
        const velocity = data[pos++];
        const isNoteOn = (type === 0x90 && velocity > 0);
        events.push({ tick, type: isNoteOn ? 'noteon' : 'noteoff', channel: statusByte & 0x0f, note, velocity });
      } else if (type === 0xa0) { pos += 2; }
        else if (type === 0xb0) { pos += 2; }
        else if (type === 0xc0) { pos += 1; }
        else if (type === 0xd0) { pos += 1; }
        else if (type === 0xe0) { pos += 2; }
        else { pos++; }
    }

    pos = chunkEnd;
    tracks.push(events);
  }

  // Build tempo map
  const tempoMap = [{ tick: 0, tempo: 500000 }];
  const tempoTrack = tracks[0];
  if (tempoTrack) {
    for (const ev of tempoTrack) {
      if (ev.type === 'tempo') tempoMap.push({ tick: ev.tick, tempo: ev.tempo });
    }
  }
  tempoMap.sort((a, b) => a.tick - b.tick);

  function tickToSeconds(targetTick) {
    let seconds = 0, lastTick = 0, tempo = tempoMap[0].tempo;
    for (let i = 1; i < tempoMap.length; i++) {
      if (tempoMap[i].tick >= targetTick) break;
      seconds += (tempoMap[i].tick - lastTick) / division * (tempo / 1e6);
      lastTick = tempoMap[i].tick;
      tempo = tempoMap[i].tempo;
    }
    seconds += (targetTick - lastTick) / division * (tempo / 1e6);
    return seconds;
  }

  const allNotes = [];
  const tracksToProcess = format === 0 ? [tracks[0]] : tracks;

  for (let ti = 0; ti < tracksToProcess.length; ti++) {
    const track = tracksToProcess[ti];
    if (!track) continue;

    const activeNotes = new Map();
    for (const ev of track) {
      if (ev.type === 'noteon') {
        activeNotes.set(`${ev.channel}-${ev.note}`, { startTick: ev.tick });
      } else if (ev.type === 'noteoff') {
        const key = `${ev.channel}-${ev.note}`;
        const active = activeNotes.get(key);
        if (active) {
          activeNotes.delete(key);
          const midi = ev.note;
          if (midi >= 21 && midi <= 108) {
            const startSec = tickToSeconds(active.startTick);
            const endSec = tickToSeconds(ev.tick);
            allNotes.push({ midi, startSec, durationSec: Math.max(endSec - startSec, 0.05), partId: `track-${ti}` });
          }
        }
      }
    }
    // Close unterminated notes
    const lastTick = track.length > 0 ? track[track.length - 1].tick : 0;
    for (const [key, active] of activeNotes) {
      const midi = parseInt(key.split('-')[1]);
      if (midi >= 21 && midi <= 108) {
        const startSec = tickToSeconds(active.startTick);
        allNotes.push({ midi, startSec, durationSec: Math.max(tickToSeconds(lastTick) - startSec, 0.05), partId: `track-${ti}` });
      }
    }
  }

  allNotes.sort((a, b) => a.startSec - b.startSec);
  return allNotes;
}
