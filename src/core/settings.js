// ═══════════════════════════════════════════════════════════
//  SETTINGS
//  All toggleable settings. Resets every page load (no persistence).
//  Every module reads from this; the More overlay writes to it.
// ═══════════════════════════════════════════════════════════

const settings = {
  /** Show the 88-key piano at the bottom */
  pianoVisualizerOn: true,

  /** Show falling note blocks (off = blind mode) */
  fallingBlocksOn: true,

  /** Show the right-side stats panel during gameplay */
  statsPanelOn: false,

  /** Show early/late trapezoid glow animation */
  earlyLateAnimationOn: true,

  /** Extended keyboard mode (future — always false for now) */
  extendedKeyboardOn: false,

  /** Start playback on first key press rather than after 2s delay */
  startOnFirstPress: false,

  /** Auto-shift: when ON, shift blocks apply automatically */
  autoShiftOn: false,

  /** In/out loop range (null = no loop) */
  loopIn: null,  // seconds
  loopOut: null,  // seconds

  /** Stukage URL (new-tab link) */
  stukageUrl: 'about:blank',
};

export default settings;
