// ═══════════════════════════════════════════════════════════
//  CONSTANTS & LAYOUT DATA
//  Pure numeric/structural constants. Colors live in colors.js,
//  key mappings live in keyMapping.js.
// ═══════════════════════════════════════════════════════════

export const noteNamesArr = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// ── Layout dimensions ──
export const PORT_HEIGHT = 90;
export const ANTENNA_HEIGHT = 100;
export const ANTENNA_WIDTH = 3;
export const ANTENNA_BLOCK_WIDTH = 30;
export const PIANO_WIDTH = Math.round(970 * 1.5);
export const PIANO_HEIGHT = 140;
export const PIANO_BOTTOM = 1080 - 40;
export const PIANO_TOP = PIANO_BOTTOM - PIANO_HEIGHT;
export const PIANO_LEFT = (1920 - PIANO_WIDTH) / 2;
export const MX_SPAWN_BOUNDARY = 765;

// ── UNIFIED falling speed (fixes alignment bug) ──
// Both keyboard lane and piano lane use this single speed.
export const FALL_SPEED = 200; // px/sec

export const MAX_CONCURRENT_NOTES = 10;
export const DEBUG = false;

export const MIDI_A0 = 21;
export const MIDI_C8 = 108;
export const BLACK_PC = new Set([1, 3, 6, 8, 10]);

// ── Keyboard geometry ──
export const rowYPositions = [
  1080 - 810, // Top = 270
  1080 - 580, // Middle = 500
  1080 - 365, // Bottom = 715
];

export const keyWidth = 67;
export const keyGap = 5;
export const tabWidth = 104;
export const enterWidth = 120;
export const shiftWidth = 145;
export const shiftRightWidth = 236;
export const row1StartX = 421;
export const row2StartX = 571;
export const row3StartX = 452;

export const keyboardLayout = [
  { y: rowYPositions[0], startX: row1StartX, keys: [
    { key: 'Tab', w: tabWidth },
    { key: 'Q', w: keyWidth }, { key: 'W', w: keyWidth }, { key: 'E', w: keyWidth },
    { key: 'R', w: keyWidth }, { key: 'T', w: keyWidth }, { key: 'Y', w: keyWidth },
    { key: 'U', w: keyWidth }, { key: 'I', w: keyWidth }, { key: 'O', w: keyWidth },
    { key: 'P', w: keyWidth },
  ]},
  { y: rowYPositions[1], startX: row2StartX, keys: [
    { key: 'A', w: keyWidth }, { key: 'S', w: keyWidth }, { key: 'D', w: keyWidth },
    { key: 'F', w: keyWidth }, { key: 'G', w: keyWidth }, { key: 'H', w: keyWidth },
    { key: 'J', w: keyWidth }, { key: 'K', w: keyWidth }, { key: 'L', w: keyWidth },
    { key: ';', w: keyWidth }, { key: 'Enter', w: enterWidth },
  ]},
  { y: rowYPositions[2], startX: row3StartX, keys: [
    { key: 'ShiftL', w: shiftWidth },
    { key: 'Z', w: keyWidth }, { key: 'X', w: keyWidth }, { key: 'C', w: keyWidth },
    { key: 'V', w: keyWidth }, { key: 'B', w: keyWidth }, { key: 'N', w: keyWidth },
    { key: 'M', w: keyWidth }, { key: ',', w: keyWidth }, { key: '.', w: keyWidth },
    { key: '/', w: keyWidth },
    { key: 'ShiftR', w: shiftRightWidth },
  ]},
];

// ── Piano data (all 88 keys A0–C8) ──
export const pianoData = [];
const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
for (let o = 0; o <= 8; o++) {
  for (const n of noteNames) {
    const note = n + o;
    if (note === 'A0' || note === 'A#0' || note === 'B0' || (o >= 1 && o <= 7) || note === 'C8') {
      pianoData.push({ note, isBlack: n.includes('#') });
    }
  }
}
