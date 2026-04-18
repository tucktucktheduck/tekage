// ═══════════════════════════════════════════════════════════
//  SFZ PARSER
//  Converts SFZ text → flat array of region objects.
//
//  Design: parser is opcode-complete — every opcode found is
//  stored on the region, whether v1 acts on it or not. The
//  player's job is "act on opcodes I understand"; the parser's
//  job is "read everything accurately". This means v2 feature
//  support is purely additive on the player side.
// ═══════════════════════════════════════════════════════════

// ── Known opcodes & their defaults ─────────────────────────
// Values used when an opcode is absent from a region.
// v2-only opcodes default to null so the player can skip them cheaply.
const OPCODE_DEFAULTS = {
  // Sample mapping
  sample: null,
  lokey: 0, hikey: 127, key: null,
  pitch_keycenter: 60,
  lovel: 0, hivel: 127,

  // Tuning
  tune: 0,           // cents
  transpose: 0,      // semitones
  pitch_keytrack: 100,

  // Level / pan
  volume: 0,         // dB
  pan: 0,            // -100..100
  amp_veltrack: 100, // 0..100 (%)

  // Amp envelope (DAHDSR)
  ampeg_delay:   0,
  ampeg_attack:  0.001,
  ampeg_hold:    0,
  ampeg_decay:   0.1,
  ampeg_sustain: 100,  // 0..100 (%)
  ampeg_release: 0.3,

  // Looping
  loop_mode:  'no_loop',
  loop_start: 0,
  loop_end:   0,

  // Offset / end
  offset: 0,
  end: -1,

  // Trigger
  trigger: 'attack',

  // Keyswitching
  sw_lokey: null, sw_hikey: null,
  sw_last: null, sw_default: null,
  sw_down: null, sw_up: null,

  // Random / round-robin
  lorand: 0, hirand: 1,
  seq_length: 1, seq_position: 1,

  // ── v2: parse but don't act on ────────────────────────────
  // Filters
  fil_type: 'lpf_2p', cutoff: null, resonance: null,
  fil_keytrack: null, fil_veltrack: null, fil_random: null,
  fil2_type: null, cutoff2: null, resonance2: null,

  // EQ
  eq1_freq: null, eq1_bw: null, eq1_gain: null,
  eq2_freq: null, eq2_bw: null, eq2_gain: null,
  eq3_freq: null, eq3_bw: null, eq3_gain: null,

  // Pitch EG
  pitcheg_attack: null, pitcheg_decay: null,
  pitcheg_sustain: null, pitcheg_release: null,
  pitcheg_depth: null, pitcheg_vel2depth: null,

  // Filter EG (fileg_*)
  fileg_attack: null, fileg_decay: null, fileg_sustain: null,
  fileg_release: null, fileg_depth: null,

  // LFOs
  amplfo_freq: null, amplfo_depth: null, amplfo_delay: null, amplfo_fade: null,
  pitchlfo_freq: null, pitchlfo_depth: null, pitchlfo_delay: null, pitchlfo_fade: null,
  fillfo_freq: null, fillfo_depth: null, filllo_delay: null, fillfo_fade: null,

  // Effects send
  effect1: null, effect2: null,
};

// Opcodes whose string value should be parsed as a number
const NUMERIC_OPCODES = new Set([
  'lokey','hikey','pitch_keycenter','lovel','hivel',
  'tune','transpose','pitch_keytrack',
  'volume','pan','amp_veltrack',
  'ampeg_delay','ampeg_attack','ampeg_hold','ampeg_decay','ampeg_sustain','ampeg_release',
  'loop_start','loop_end','offset','end',
  'sw_lokey','sw_hikey','sw_last','sw_default','sw_down','sw_up',
  'lorand','hirand','seq_length','seq_position',
  'cutoff','resonance','fil_keytrack','fil_veltrack','fil_random',
  'cutoff2','resonance2',
  'eq1_freq','eq1_bw','eq1_gain','eq2_freq','eq2_bw','eq2_gain','eq3_freq','eq3_bw','eq3_gain',
  'pitcheg_attack','pitcheg_decay','pitcheg_sustain','pitcheg_release','pitcheg_depth','pitcheg_vel2depth',
  'fileg_attack','fileg_decay','fileg_sustain','fileg_release','fileg_depth',
  'amplfo_freq','amplfo_depth','amplfo_delay','amplfo_fade',
  'pitchlfo_freq','pitchlfo_depth','pitchlfo_delay','pitchlfo_fade',
  'fillfo_freq','fillfo_depth','fillfo_delay','fillfo_fade',
  'effect1','effect2',
]);

// Note names (SFZ uses C4=60 by default; octave_offset shifts this)
const NOTE_NAMES = { c:0, d:2, e:4, f:5, g:7, a:9, b:11 };

/** Convert SFZ note string to MIDI number. Returns null on failure.
 *  Supports: "c4", "c#4", "cb4", "60" (raw MIDI), "c-1"
 */
export function sfzNoteToMidi(s, octaveOffset = 0) {
  if (!s) return null;
  s = s.trim().toLowerCase();
  // Raw MIDI number
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  // Note name: letter [# or b] octave
  const m = s.match(/^([a-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const pc = NOTE_NAMES[m[1]];
  if (pc === undefined) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const oct = parseInt(m[3], 10) + octaveOffset;
  return (oct + 1) * 12 + pc + acc;
}

// ── Preprocessor ───────────────────────────────────────────

/** Strip block and line comments */
function _stripComments(text) {
  // Block comments first (non-greedy, don't cross #include lines)
  text = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Line comments
  text = text.replace(/\/\/[^\n]*/g, '');
  return text;
}

/** Resolve #define macros. Returns text with $VAR occurrences replaced. */
function _resolveDefines(text) {
  const defines = {};
  // Collect all #define directives
  text = text.replace(/^[ \t]*#define\s+(\$\S+)\s+(.+)$/gm, (_, varName, value) => {
    defines[varName] = value.trim();
    return '';
  });
  // Substitute longest-match first (prevents partial substitution)
  const keys = Object.keys(defines).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    // Escape $ for regex
    const escaped = k.replace(/\$/g, '\\$');
    text = text.replace(new RegExp(escaped, 'g'), defines[k]);
  }
  return text;
}

/** Resolve #include directives recursively.
 *  fileMap: Map<normalizedPath, string>
 *  currentDir: directory of the current file (e.g. '' or 'Patches/')
 */
function _resolveIncludes(text, fileMap, currentDir) {
  return text.replace(/^[ \t]*#include\s+"([^"]+)"/gm, (_, includePath) => {
    const normalized = _resolvePath(currentDir, includePath);
    const content = fileMap.get(normalized);
    if (!content) return `// [SFZ include not found: ${normalized}]`;
    const includeDir = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/') + 1) : '';
    return _resolveIncludes(content, fileMap, includeDir);
  });
}

/** Resolve a relative path against a base directory. */
function _resolvePath(baseDir, relativePath) {
  // Normalize separators
  const p = (baseDir + relativePath).replace(/\\/g, '/');
  // Collapse ./ and simple ../ segments
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

// ── Tokenizer ──────────────────────────────────────────────

/**
 * Split pre-processed SFZ text into a token stream.
 * Tokens: { type: 'header', name } | { type: 'opcode', key, raw }
 *
 * Strategy: find all header and opcode start positions, then
 * slice the text between consecutive starts to get each value.
 */
function _tokenize(text) {
  const tokens = [];
  // Match <header> or word= patterns
  // For opcodes, we capture the key; value is everything until next match
  const RE = /<([a-z_][a-z0-9_]*)>|([a-zA-Z_][a-zA-Z0-9_]*)=/g;
  const positions = [];
  let m;
  while ((m = RE.exec(text)) !== null) {
    if (m[1]) {
      positions.push({ type: 'header', name: m[1].toLowerCase(), pos: m.index, end: RE.lastIndex });
    } else {
      positions.push({ type: 'opcode', key: m[2].toLowerCase(), pos: m.index, end: RE.lastIndex });
    }
  }

  for (let i = 0; i < positions.length; i++) {
    const cur = positions[i];
    if (cur.type === 'header') {
      tokens.push({ type: 'header', name: cur.name });
    } else {
      // Value spans from end of 'key=' to start of next token (trimmed)
      const valueEnd = i + 1 < positions.length ? positions[i + 1].pos : text.length;
      const raw = text.slice(cur.end, valueEnd).trim();
      tokens.push({ type: 'opcode', key: cur.key, raw });
    }
  }
  return tokens;
}

// ── Cascade flattener ──────────────────────────────────────

function _parseOpcodeValue(key, raw, octaveOffset, noteOffset) {
  if (!raw) return undefined;
  const str = raw.trim();

  // Note-valued opcodes
  if (['lokey','hikey','key','pitch_keycenter','sw_lokey','sw_hikey',
       'sw_last','sw_default','sw_down','sw_up'].includes(key)) {
    const midi = sfzNoteToMidi(str, octaveOffset);
    if (midi !== null) return midi + noteOffset;
    return undefined;
  }

  // Numeric opcodes — strip trailing units (hz, dB, %, s, ms)
  if (NUMERIC_OPCODES.has(key)) {
    const num = parseFloat(str);
    return isNaN(num) ? undefined : num;
  }

  return str;
}

function _mergeOpcodes(base, overrides, octaveOffset, noteOffset) {
  const out = { ...base };
  for (const [key, raw] of Object.entries(overrides)) {
    const parsed = _parseOpcodeValue(key, raw, octaveOffset, noteOffset);
    if (parsed !== undefined) out[key] = parsed;
    else out[key] = raw; // keep raw if we couldn't parse
  }
  return out;
}

/** Build a _parsed object from flat opcodes using defaults. */
function _buildParsed(flatOpcodes) {
  const parsed = {};
  for (const [k, def] of Object.entries(OPCODE_DEFAULTS)) {
    const v = flatOpcodes[k];
    parsed[k] = v !== undefined ? v : def;
  }
  // Expand key= shorthand
  if (flatOpcodes.key !== undefined && flatOpcodes.key !== null) {
    const midi = flatOpcodes.key;
    parsed.lokey = midi;
    parsed.hikey = midi;
    parsed.pitch_keycenter = midi;
  }
  return parsed;
}

// ── Main export ────────────────────────────────────────────

/**
 * Parse SFZ text into a flat region array.
 *
 * @param {string}           sfzText     - Raw SFZ file contents
 * @param {Map<string,string>} fileMap   - All files in the archive (path → text)
 * @param {string}           sfzPath     - Path of the root SFZ file (for #include resolution)
 * @returns {{ regions, control, warnings }}
 */
export function parseSfz(sfzText, fileMap, sfzPath) {
  const warnings = [];
  const control = { default_path: '', octave_offset: 0, note_offset: 0 };

  // Preprocessing pipeline
  const sfzDir = sfzPath.includes('/')
    ? sfzPath.slice(0, sfzPath.lastIndexOf('/') + 1) : '';
  let text = _stripComments(sfzText);
  text = _resolveDefines(text);
  text = _resolveIncludes(text, fileMap, sfzDir);

  const tokens = _tokenize(text);

  const regions = [];
  // Scope accumulators: raw string opcodes at each level
  let globalOps = {};
  let masterOps = {};
  let groupOps  = {};
  let curHeader = null;
  // Pending opcodes for the current section (accumulated before next header)
  let pendingOps = {};

  function _flushPending() {
    if (!curHeader) return;
    if (curHeader === 'global') {
      globalOps = { ...globalOps, ...pendingOps };
    } else if (curHeader === 'master') {
      masterOps = { ...masterOps, ...pendingOps };
    } else if (curHeader === 'group') {
      groupOps  = { ...groupOps, ...pendingOps };
    } else if (curHeader === 'control') {
      // Extract control-block variables
      if (pendingOps.default_path !== undefined)
        control.default_path = pendingOps.default_path.replace(/\\/g, '/');
      if (pendingOps.octave_offset !== undefined)
        control.octave_offset = parseInt(pendingOps.octave_offset, 10) || 0;
      if (pendingOps.note_offset !== undefined)
        control.note_offset = parseInt(pendingOps.note_offset, 10) || 0;
    } else if (curHeader === 'region') {
      // Flatten: global → master → group → region opcodes
      const flat = { ...globalOps, ...masterOps, ...groupOps, ...pendingOps };
      const _parsed = _buildParsed(flat);
      // Apply octave/note offsets to already-parsed MIDI note values
      _parsed.octave_offset = control.octave_offset;
      _parsed.note_offset   = control.note_offset;

      // Collect unknown opcodes
      const _unknown = {};
      for (const [k, v] of Object.entries(flat)) {
        if (!(k in OPCODE_DEFAULTS)) _unknown[k] = v;
      }

      regions.push({
        ...flat,      // all raw string opcodes
        _parsed,
        _unknown,
      });
    }
    pendingOps = {};
  }

  for (const tok of tokens) {
    if (tok.type === 'header') {
      _flushPending();
      const h = tok.name;
      // Reset scope on new sections
      if (h === 'global')  { globalOps = {}; masterOps = {}; groupOps = {}; }
      if (h === 'master')  { masterOps = {}; groupOps = {}; }
      if (h === 'group')   { groupOps = {}; }
      curHeader = h;
    } else {
      // Accumulate opcode with raw value
      pendingOps[tok.key] = tok.raw;
    }
  }
  _flushPending(); // flush last section

  if (regions.length === 0) {
    warnings.push('No <region> sections found.');
  }

  return { regions, control, warnings };
}
