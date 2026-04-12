// ═══════════════════════════════════════════════════════════
//  KEY MAPPING SYSTEM
//  Remappable key→note bindings. The DAG solver, note mapper,
//  and all visual systems read from here.
//
//  KEY BEHAVIOR (per bug fix):
//  Keys bind to note NAMES. When octave shifts, W still plays
//  "C" — just in a different octave. The binding doesn't move.
// ═══════════════════════════════════════════════════════════

/** Named presets — order determines display order in the UI */
export const PRESETS = {
  'Default': {
    left:  { q:'C#', w:'D#', e:'F#', r:'G#', t:'A#', a:'C', s:'D', d:'E', f:'F', x:'G', c:'A', v:'B' },
    right: { y:'C#', u:'D#', i:'F#', o:'G#', p:'A#', j:'C', k:'D', l:'E', ';':'F', n:'G', m:'A', ',':'B' },
  },
  'Classic': {
    left:  { w:'C', e:'D', r:'E', t:'F', s:'G', d:'A', f:'B', z:'C#', x:'D#', c:'F#', v:'G#', b:'A#' },
    right: { y:'C', u:'D', i:'E', o:'F', j:'G', k:'A', l:'B', n:'C#', m:'D#', ',':'F#', '.':'G#', '/':'A#' },
  },
};

/** Default left-hand key→note mapping (matches "Default" preset) */
const DEFAULT_LEFT  = { ...PRESETS['Default'].left  };
/** Default right-hand key→note mapping (matches "Default" preset) */
const DEFAULT_RIGHT = { ...PRESETS['Default'].right };

/** The live mapping — modules import and read these */
export const leftMap = { ...DEFAULT_LEFT };
export const rightMap = { ...DEFAULT_RIGHT };

/** All available computer keys (for the remap UI) */
export const ALL_COMPUTER_KEYS = [
  'tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
  'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', 'enter',
  'shift_l', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'shift_r',
];

/** Function keys that perform shifts, not notes */
export const fnKeys = new Set(['tab', 'shift_l', 'shift_r', 'enter']);

/** Check if a key is in the left-hand map */
export function isLeftKey(k) {
  return leftMap[k] !== undefined;
}

/** Check if a key is in the right-hand map */
export function isRightKey(k) {
  return rightMap[k] !== undefined;
}

/** Get the note name for a key (without octave) */
export function getNoteNameForKey(k) {
  return leftMap[k] || rightMap[k] || null;
}

/**
 * Set a custom key→note binding.
 * @param {string} key - computer key id
 * @param {string} noteName - e.g. 'C', 'F#'
 * @param {'left'|'right'} hand
 */
export function setBinding(key, noteName, hand) {
  // Remove key from both maps first
  delete leftMap[key];
  delete rightMap[key];
  // Assign to chosen hand
  if (hand === 'left') leftMap[key] = noteName;
  else rightMap[key] = noteName;
}

/** Extra note mappings added in Advanced Mode */
const ADVANCED_EXTRA_LEFT  = { q: 'B', a: 'C#' };
const ADVANCED_EXTRA_RIGHT = { p: 'G#', ';': 'D' };

/** Enable or disable advanced keyboard mode (adds q/a/p/; as note keys) */
export function setAdvancedMode(on) {
  if (on) {
    Object.assign(leftMap, ADVANCED_EXTRA_LEFT);
    Object.assign(rightMap, ADVANCED_EXTRA_RIGHT);
  } else {
    for (const k of ['q', 'a', 'p', ';']) {
      delete leftMap[k];
      delete rightMap[k];
    }
  }
}

/** Reset all bindings to defaults */
export function resetMappings() {
  applyPreset('Default');
}

/** Apply a named preset by name */
export function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  for (const k of Object.keys(leftMap))  delete leftMap[k];
  for (const k of Object.keys(rightMap)) delete rightMap[k];
  Object.assign(leftMap,  preset.left);
  Object.assign(rightMap, preset.right);
}

/**
 * Build arrays used by the DAG solver.
 * Returns { leftKeys, rightKeys } where each entry is { key, noteIndex }.
 */
export function getSolverKeyArrays() {
  const noteIdx = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const leftKeys = Object.entries(leftMap).map(([k, n]) => ({ key: k, ni: noteIdx.indexOf(n) }));
  const rightKeys = Object.entries(rightMap).map(([k, n]) => ({ key: k, ni: noteIdx.indexOf(n) }));
  return { leftKeys, rightKeys };
}
