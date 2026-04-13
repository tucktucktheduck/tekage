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
// Piano fall distance must match keyboard fall distance:
// keyboard antennaTop = keyY - PORT_HEIGHT/2 - ANTENNA_HEIGHT = keyY - 45 - 100 = keyY - 145
// So keyboard fall = 145px. Set piano fall = 145px: MX_SPAWN_BOUNDARY = PIANO_TOP - 145 = 755
export const MX_SPAWN_BOUNDARY = 755;

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
export const keyWidthAdvanced = 52;
export const keyGap = 5;
export const tabWidth = 104;
export const enterWidth = 120;
export const shiftWidth = 145;
export const shiftRightWidth = 236;
export const row1StartX = 421;
export const row2StartX = 571;
export const row3StartX = 452;

// Standard keyboard layout (default mode — Q/A/P/; present but greyed as non-functional)
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

/**
 * Returns the keyboard layout to use. In advanced mode, use smaller key widths
 * and recompute startX so the keyboard stays centered.
 */
export function getKeyboardLayout(advanced = false) {
  if (!advanced) return keyboardLayout;
  const kw = keyWidthAdvanced;
  const tabW = 80, entW = 90, shL = 110, shR = 170;
  // Compute total width of each row to center at x=960
  const row1Keys = [
    { key: 'Tab', w: tabW },
    { key: 'Q', w: kw }, { key: 'W', w: kw }, { key: 'E', w: kw },
    { key: 'R', w: kw }, { key: 'T', w: kw }, { key: 'Y', w: kw },
    { key: 'U', w: kw }, { key: 'I', w: kw }, { key: 'O', w: kw },
    { key: 'P', w: kw },
  ];
  const row2Keys = [
    { key: 'A', w: kw }, { key: 'S', w: kw }, { key: 'D', w: kw },
    { key: 'F', w: kw }, { key: 'G', w: kw }, { key: 'H', w: kw },
    { key: 'J', w: kw }, { key: 'K', w: kw }, { key: 'L', w: kw },
    { key: ';', w: kw }, { key: 'Enter', w: entW },
  ];
  const row3Keys = [
    { key: 'ShiftL', w: shL },
    { key: 'Z', w: kw }, { key: 'X', w: kw }, { key: 'C', w: kw },
    { key: 'V', w: kw }, { key: 'B', w: kw }, { key: 'N', w: kw },
    { key: 'M', w: kw }, { key: ',', w: kw }, { key: '.', w: kw },
    { key: '/', w: kw },
    { key: 'ShiftR', w: shR },
  ];
  function rowWidth(keys) {
    return keys.reduce((s, k) => s + k.w + keyGap, 0) - keyGap;
  }
  function startX(keys) { return 960 - rowWidth(keys) / 2; }
  return [
    { y: rowYPositions[0], startX: startX(row1Keys), keys: row1Keys },
    { y: rowYPositions[1], startX: startX(row2Keys), keys: row2Keys },
    { y: rowYPositions[2], startX: startX(row3Keys), keys: row3Keys },
  ];
}

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
