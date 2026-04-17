// ═══════════════════════════════════════════════════════════
//  SHARED MUTABLE STATE
//  All game-wide mutable state centralized here.
//  Resets every page load (no persistence).
//
//  FIX: Added resetBeginnerState() to clean Phaser refs
//       between beginner mode switches.
// ═══════════════════════════════════════════════════════════

const state = {
  // ── Keyboard / piano visual objects ──
  keyObjects: {},
  pianoKeys: [],
  pianoNoteMap: {},
  activeKeys: new Map(),
  activeAudio: new Map(),
  physicallyPressedKeys: new Set(),

  // ── Octave / semitone state (L=3, R=5 per spec) ──
  octaveLeft: 3,
  octaveRight: 5,
  semitoneLeft: 0,
  semitoneRight: 0,

  // ── Piano overlay references ──
  leftRangeOverlay: null,
  rightRangeOverlay: null,
  octaveLeftText: null,
  octaveRightText: null,

  // ── Audio ──
  audioContext: null,

  // ── Random note spawner (lives in Beginner scene now) ──
  fallingNotes: [],
  isPlaying: false,
  noteSpawnTimer: 0,

  // ── MusicXML state ──
  mxNotes: [],
  mxAllParts: [],
  mxRawXmlDoc: null,
  mxPlaying: false,
  mxMuted: true,
  mxCurTime: 0,
  mxLastTs: null,
  mxSpeed: 1.0,
  mxVolume: 0.6,
  mxPlayed: new Set(),
  mxFallingNotes: [],
  mxLoaded: false,
  mxMasterGain: null,
  mxEventCounter: 0,
  mxFileName: '',
  mxScene: null,

  // ── First-press start ──
  mxWaitingForFirstPress: false,

  // ── Rest Of Song mode — plays notes from the full part that aren't in the current part ──
  mxRosMode: false,
  mxRosNotes: [],      // {midi, startSec, durationSec} — diff between full part and current part
  mxRosPlayed: new Set(),  // indices into mxRosNotes already triggered

  // (canvas buttons moved into teklet overlay)

  // ── DAG Solver globals ──
  solverPlan: [],
  solverNoteMap: new Map(),
  solverShifts: [],
  solverInitialState: null,
  solverStateTimeline: [],
  solverStats: {},
  solverReady: false,
  mxShiftBlocks: [],
  mxShiftPlayed: new Set(),
  mxKeyboardNotes: [],
  mxKeyboardPlayed: new Set(),
  _autoShiftIdx: 0,   // next stateTimeline index to apply for auto-shift

  // ── Scrubber ──
  scrubberTrack: null,
  scrubberFill: null,
  scrubberHandle: null,
  scrubberTimeCur: null,
  scrubberTimeTotal: null,
  scrubberDragging: false,
  scrubberHitArea: null,

  // ── Scoring ──
  score: {
    notesHit: 0,
    totalNotes: 0,
    perfectHits: 0,
    greatHits: 0,
    goodHits: 0,
    misses: 0,
    streak: 0,
    longestStreak: 0,
    /** Map<noteIndex, {timingOffset, quality}> for post-game summary */
    hitDetails: new Map(),
  },

  // ── Stats panel Phaser references ──
  statsTexts: {},

  // ── Glow effects pool ──
  glowEffects: [],

  // ── Beginner mode ──
  beginnerMode: null,  // 'autoSlowDown' | 'singleRowMode' | 'playRandomNotes' | 'practiceShifting' | 'oneHandMode' | null
};

/**
 * Normalize a semitone offset so it stays in (-12, 12).
 * Overflows carry into the octave. Octave is clamped to [0, 7].
 */
export function normalizeSemitone(semitone, octave) {
  while (semitone >= 12) { semitone -= 12; octave += 1; }
  while (semitone <= -12) { semitone += 12; octave -= 1; }
  octave = Math.max(0, Math.min(7, octave));
  return { semitone, octave };
}

/** Reset score for a new song */
export function resetScore() {
  state.score.notesHit = 0;
  state.score.totalNotes = 0;
  state.score.perfectHits = 0;
  state.score.greatHits = 0;
  state.score.goodHits = 0;
  state.score.misses = 0;
  state.score.streak = 0;
  state.score.longestStreak = 0;
  state.score.hitDetails.clear();
}

/**
 * Reset state that holds Phaser object references.
 * Call this when switching between beginner modes or
 * transitioning back to MainScene.
 *
 * Does NOT touch mxNotes/mxLoaded/mxFileName — those are
 * song data that should persist across mode switches.
 */
export function resetBeginnerState() {
  // Kill references to destroyed Phaser game objects
  state.keyObjects = {};
  state.pianoKeys = [];
  state.pianoNoteMap = {};

  // Clear active note/key state
  state.activeKeys.clear();
  state.physicallyPressedKeys.clear();

  // Clear falling notes (Phaser objects are already destroyed by removeAll)
  state.fallingNotes = [];
  state.mxFallingNotes = [];
  state.mxPlayed.clear();

  // Clear shift blocks (Phaser objects destroyed)
  state.mxShiftBlocks = [];
  state.mxShiftPlayed.clear();
  state.mxKeyboardNotes = [];
  state.mxKeyboardPlayed.clear();

  // Clear piano overlay refs (destroyed by removeAll)
  state.leftRangeOverlay = null;
  state.rightRangeOverlay = null;
  state.octaveLeftText = null;
  state.octaveRightText = null;

  // Clear scrubber refs (destroyed by removeAll)
  state.scrubberTrack = null;
  state.scrubberFill = null;
  state.scrubberHandle = null;
  state.scrubberTimeCur = null;
  state.scrubberTimeTotal = null;
  state.scrubberDragging = false;
  state.scrubberHitArea = null;

  // Clear glow effects
  state.glowEffects = [];

  // Clear stats panel refs
  state.statsTexts = {};

  // Reset playback timing (but keep mxCurTime for resume)
  state.mxLastTs = null;
  state.mxPlaying = false;
  state.isPlaying = false;

  // (canvas buttons no longer exist — moved into teklet overlay)
}

export default state;
