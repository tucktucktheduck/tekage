// ═══════════════════════════════════════════════════════════
//  SKIN CONSTANTS
//  All skinnable element IDs and page names used throughout
//  the skin/theme system.
// ═══════════════════════════════════════════════════════════

export const SKIN_ELEMENTS = {
  // Background
  BACKGROUND: 'background',

  // Keyboard
  ANTENNA_LINE: 'antenna_line',
  ANTENNA_GLOW: 'antenna_glow',
  KEY_PORT_LEFT: 'key_port_left',
  KEY_PORT_RIGHT: 'key_port_right',
  KEY_PORT_DISABLED: 'key_port_disabled',
  KEY_LABEL_FONT: 'key_label_font',
  KEY_GLOW_LEFT: 'key_glow_left',
  KEY_GLOW_RIGHT: 'key_glow_right',
  GLOW_BAR_LEFT: 'glow_bar_left',
  GLOW_BAR_RIGHT: 'glow_bar_right',

  // Falling notes
  NOTE_BLOCK_LEFT: 'note_block_left',
  NOTE_BLOCK_RIGHT: 'note_block_right',
  NOTE_STRETCH_MODE: 'note_stretch_mode',   // 'repeat' | 'stretch'
  NOTE_BLOCK_PATTERN: 'note_block_pattern', // tiling pattern overlaid on note blocks
  NOTE_DISPLAY_MODE: 'note_display_mode',   // 'stretch' | 'tile' | 'mask-global' | 'mask-per-note'
  NOTE_MASK_IMAGE: 'note_mask_image',       // reveal image for mask modes

  // Piano
  PIANO_WHITE_KEY: 'piano_white_key',
  PIANO_BLACK_KEY: 'piano_black_key',
  PIANO_OUTLINE: 'piano_outline',
  PIANO_GLOW: 'piano_glow',

  // Scrubber
  SCRUBBER_TRACK: 'scrubber_track',
  SCRUBBER_FILL: 'scrubber_fill',
  SCRUBBER_HANDLE: 'scrubber_handle',

  // Portal (wall)
  PORTAL_WALL_FRAME: 'portal_wall_frame',
  PORTAL_WALL_GLOW: 'portal_wall_glow',
  PORTAL_WALL_NEON: 'portal_wall_neon',

  // Portal (ceiling)
  PORTAL_CEIL_FRAME: 'portal_ceil_frame',
  PORTAL_CEIL_GLOW: 'portal_ceil_glow',

  // Teklet
  TEKLET_BEZEL: 'teklet_bezel',
  TEKLET_SCREEN_BG: 'teklet_screen_bg',
  TEKLET_NAV_ITEM: 'teklet_nav_item',
  TEKLET_NAV_ACTIVE: 'teklet_nav_active',
  TEKLET_FOOTER: 'teklet_footer',
  TEKLET_CLOSE: 'teklet_close',

  // Hit animations (custom per timing tier)
  HIT_ANIM_PERFECT: 'hit_anim_perfect',     // spritesheet or static image
  HIT_ANIM_GREAT: 'hit_anim_great',
  HIT_ANIM_GOOD: 'hit_anim_good',
  HIT_ANIM_MISS: 'hit_anim_miss',
  HIT_GLOW_COLOR_LEFT: 'hit_glow_color_left',   // color override for left-hand hits
  HIT_GLOW_COLOR_RIGHT: 'hit_glow_color_right',  // color override for right-hand hits
  HIT_GLOW_PATTERN: 'hit_glow_pattern',          // tiling pattern overlaid on key glow

  // Colors (special — hex strings, not images)
  COLOR_PRIMARY: 'color_primary',       // default: #3b9eff (blue / left hand)
  COLOR_SECONDARY: 'color_secondary',   // default: #ff8a2b (orange / right hand)
  COLOR_ACCENT: 'color_accent',         // default: #9333ea (purple)
};

// ── Per-key visual constants ──

/** Prefix for per-computer-key note visuals: 'note_key_w', 'note_key_e', etc. */
export const NOTE_KEY_PREFIX = 'note_key_';

/** Build element ID for a specific computer key's note visual */
export function noteKeyId(computerKey) {
  return NOTE_KEY_PREFIX + computerKey.toLowerCase();
}

/** Valid note display modes */
export const NOTE_DISPLAY_MODES = ['stretch', 'tile', 'mask-global', 'mask-per-note'];

/** Accepted image formats for uploads */
export const IMAGE_FORMATS = '.png,.jpg,.jpeg,.gif,.svg,.apng,.webp';

/** Accepted video formats for background */
export const VIDEO_FORMATS = '.mp4,.webm,.mov';

export const SKIN_PAGES = [
  'main',        // MainScene — gameplay screen
  'beginner',    // BeginnerScene hub + sub-modes
  'library',     // LibraryScene
  'challenges',  // ChallengesScene (future)
  'editor',      // Skin editor
  'settings',    // Settings/options overlay
  'teklet',      // Teklet console menu
];
