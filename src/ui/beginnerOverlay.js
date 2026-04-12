// ═══════════════════════════════════════════════════════════
//  BEGINNER OVERLAY — DOM overlay for mode selection
//  3 modes: Single Row, One Hand, Random Notes.
//  Auto Slow Down is now a global Teklet setting, not a mode.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';

const MODES = {
  singleRowMode:   { label: 'SINGLE ROW',  hasAutoShift: false },
  oneHandMode:     { label: 'ONE HAND',    hasAutoShift: false },
  playRandomNotes: { label: 'RANDOM NOTES', hasAutoShift: false },
};

// ── Internal refs ──
let _overlay = null;
let _hud = null;
let _hudTitle = null;
let _hudSong = null;
let _hudAutoShift = null;

function _getSceneManager() {
  return window.__tekageGame && window.__tekageGame.scene;
}

/** Show the beginner overlay (mode selection hub) */
export function showBeginnerOverlay() {
  if (_overlay) _overlay.style.display = 'flex';
}

/** Hide the beginner overlay */
export function hideBeginnerOverlay() {
  if (_overlay) _overlay.style.display = 'none';
}

/** Show the in-mode HUD */
export function showBegHud(modeKey) {
  if (!_hud) return;
  const mode = MODES[modeKey] || { label: modeKey.toUpperCase(), hasAutoShift: false };
  _hudTitle.textContent = mode.label;
  _hudSong.textContent = state.mxFileName || 'No song loaded';
  if (_hudAutoShift) _hudAutoShift.style.display = mode.hasAutoShift ? '' : 'none';
  _hud.style.display = 'flex';
}

/** Hide the in-mode HUD */
export function hideBegHud() {
  if (_hud) _hud.style.display = 'none';
}

function _launchMode(modeKey) {
  hideBeginnerOverlay();
  state.beginnerMode = modeKey;
  const sm = _getSceneManager();
  if (sm) {
    if (!sm.isActive('BeginnerScene')) {
      sm.start('BeginnerScene');
    } else {
      // Scene already active — trigger mode launch directly
      const scene = sm.getScene('BeginnerScene');
      if (scene && scene.launchMode) scene.launchMode(modeKey);
    }
  }
  showBegHud(modeKey);
}

/** Initialize — call once at boot */
export function initBeginnerOverlay() {
  _overlay      = document.getElementById('beginnerOverlay');
  _hud          = document.getElementById('beginnerHud');
  _hudTitle     = document.getElementById('begHudTitle');
  _hudSong      = document.getElementById('begHudSong');
  _hudAutoShift = document.getElementById('begHudAutoShift');

  if (!_overlay) { console.warn('[BeginnerOverlay] #beginnerOverlay not found'); return; }

  // ── Close button ──
  document.getElementById('beginnerCloseBtn').addEventListener('click', () => {
    hideBeginnerOverlay();
    const sm = _getSceneManager();
    if (sm && !sm.isActive('MainScene')) sm.start('MainScene');
  });

  // ── Tab switching ──
  const tabMap = {
    singleRow:   'beg-tab-singleRow',
    oneHand:     'beg-tab-oneHand',
    randomNotes: 'beg-tab-randomNotes',
  };
  document.querySelectorAll('[data-beg-tab]').forEach(navItem => {
    navItem.addEventListener('click', () => {
      document.querySelectorAll('[data-beg-tab]').forEach(n => n.classList.remove('active'));
      navItem.classList.add('active');
      Object.values(tabMap).forEach(id => {
        const pane = document.getElementById(id);
        if (pane) pane.classList.remove('active');
      });
      const paneId = tabMap[navItem.dataset.begTab];
      if (paneId) document.getElementById(paneId)?.classList.add('active');
    });
  });

  // ── Upload buttons ──
  ['begUploadSr', 'begUploadOh'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      document.getElementById('mxFileInput').click();
    });
  });

  // ── Play buttons ──
  document.getElementById('begPlaySr')?.addEventListener('click',     () => _launchMode('singleRowMode'));
  document.getElementById('begPlayOh')?.addEventListener('click',     () => _launchMode('oneHandMode'));
  document.getElementById('begPlayRandom')?.addEventListener('click', () => _launchMode('playRandomNotes'));

  // ── HUD back button ──
  document.getElementById('begHudBack')?.addEventListener('click', () => {
    hideBegHud();
    showBeginnerOverlay();
    state.beginnerMode = null;
  });
}
