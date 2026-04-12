// ═══════════════════════════════════════════════════════════
//  MAIN ENTRY POINT — Tekage v2
//  Boots Phaser with MainScene, LibraryScene, BeginnerScene.
//  Wires DOM event listeners.
// ═══════════════════════════════════════════════════════════

import Phaser from 'phaser';
import skinManager from './skin/SkinManager.js';
import { initSkinEditor } from './ui/skinEditor.js';
skinManager.loadDefaultSkin();
import { create, update } from './scene/MainScene.js';
import { initBeginnerOverlay } from './ui/beginnerOverlay.js';

import BeginnerScene from './scene/BeginnerScene.js';
import { mxHandleFile, mxConfirmPart } from './musicxml/fileHandler.js';
import { mxSetVolume, mxSetSpeed, mxDownloadMap } from './musicxml/controls.js';
import { formatTime } from './ui/scrubber.js';
import { mxSeekTo, getMxDuration } from './ui/scrubber.js';
import settings from './core/settings.js';
import state from './core/state.js';

// ── MainScene as a class wrapping the create/update functions ──
class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }
  create() { create.call(this); }
  update(time, delta) { update.call(this, time, delta); }
}

// ── Phaser config ──
const config = {
  type: Phaser.WEBGL,
  width: 1920,
  height: 1080,
  parent: 'game-container',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: true, pixelArt: false },
  scene: [MainScene, BeginnerScene],
};

// Wait for web fonts (Orbitron, Rajdhani) before Phaser renders any text
document.fonts.ready.then(() => {
  const game = new Phaser.Game(config);
  window.__tekageGame = game; // exposed for skinEditor scene restart

  // Init skin editor and beginner overlay DOM after a tick
  setTimeout(() => { initSkinEditor(); initBeginnerOverlay(); }, 0);

  // Restart current scene when a .tkp is loaded to apply new visuals
  skinManager.on('skinLoaded', () => {
    const activeScenes = game.scene.getScenes(true);
    if (activeScenes.length > 0) activeScenes[0].scene.restart();
  });
});

// ── Auto-load local file uploaded from library page (via sessionStorage) ──
(function checkPendingUpload() {
  const name = sessionStorage.getItem('pendingUploadName');
  const data = sessionStorage.getItem('pendingUploadData');
  if (!name || !data) return;
  sessionStorage.removeItem('pendingUploadName');
  sessionStorage.removeItem('pendingUploadData');
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], name);
    mxHandleFile({ files: [file] });
  } catch (e) {
    console.error('[Upload] Failed to load pending file', e);
  }
})();

// ── Auto-load file from library (reads ?file= query param on boot) ──
(function checkUrlFile() {
  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get("file");
  const title   = params.get("title") || "";
  if (!fileUrl) return;
  // Clean the URL immediately so refreshing does not re-load
  window.history.replaceState({}, "", "/");
  fetch(fileUrl)
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
    .then(blob => {
      const fileName = fileUrl.split("/").pop();
      const file = new File([blob], fileName, { type: "application/octet-stream" });
      mxHandleFile({ files: [file] });
    })
    .catch(err => console.error("[Library] Failed to load file from URL", err));
})();

// ── DOM event wiring ──
document.getElementById('mxFileInput').addEventListener('change', function () {
  mxHandleFile(this);
});

document.getElementById('partConfirmBtn').addEventListener('click', () => mxConfirmPart());
document.getElementById('mapExportBtn').addEventListener('click', () => mxDownloadMap());
document.getElementById('volSlider').addEventListener('input', function () { mxSetVolume(+this.value); });
document.getElementById('spdSlider').addEventListener('input', function () { mxSetSpeed(+this.value); });

// Close sliders when clicking outside
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.slider-overlay')) {
    document.getElementById('volSliderOverlay').classList.remove('open');
    document.getElementById('spdSliderOverlay').classList.remove('open');
  }
});

// ── In/Out loop controls ──
document.getElementById('inoutInBtn').addEventListener('click', () => {
  settings.loopIn = Math.max(0, state.mxCurTime);
  updateInOutDisplay();
});
document.getElementById('inoutOutBtn').addEventListener('click', () => {
  settings.loopOut = Math.max(0, state.mxCurTime);
  updateInOutDisplay();
});
document.getElementById('inoutGoBtn').addEventListener('click', () => {
  if (settings.loopIn !== null && settings.loopOut !== null && settings.loopIn < settings.loopOut) {
    mxSeekTo(settings.loopIn);
    document.getElementById('inoutOverlay').classList.remove('open');
  }
});

// I/O hotkeys (only active when inout overlay is open)
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('inoutOverlay');
  if (!overlay.classList.contains('open')) return;
  if (e.key === 'i' || e.key === 'I') {
    settings.loopIn = Math.max(0, state.mxCurTime);
    updateInOutDisplay();
  }
  if (e.key === 'o' || e.key === 'O') {
    settings.loopOut = Math.max(0, state.mxCurTime);
    updateInOutDisplay();
  }
});

function updateInOutDisplay() {
  const inStr = settings.loopIn !== null ? formatTime(settings.loopIn) : '--';
  const outStr = settings.loopOut !== null ? formatTime(settings.loopOut) : '--';
  document.getElementById('inoutDisplay').textContent = `${inStr} → ${outStr}`;
}
