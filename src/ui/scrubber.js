// ═══════════════════════════════════════════════════════════
//  SCRUBBER / SEEK BAR — FIXED drag + in/out loop support
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';
import { PIANO_WIDTH, PIANO_LEFT, PIANO_BOTTOM } from '../core/constants.js';
import { mxClearFallingNotes } from '../musicxml/playback.js';
import { mxClearSolverBlocks, solverPrepareBlocks } from '../solver/solverVisuals.js';

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function getMxDuration() {
  if (!state.mxNotes || state.mxNotes.length === 0) return 0;
  let maxEnd = 0;
  for (const n of state.mxNotes) {
    const end = n.startSec + n.durationSec;
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd;
}

export function createScrubber(scene) {
  const y = PIANO_BOTTOM + 15;

  state.scrubberTrack = scene.add.rectangle(PIANO_LEFT + PIANO_WIDTH / 2, y, PIANO_WIDTH, 2, 0x333333).setDepth(20);
  state.scrubberFill = scene.add.rectangle(PIANO_LEFT, y, 0, 2, 0x3b82f6).setOrigin(0, 0.5).setDepth(21);
  state.scrubberHandle = scene.add.rectangle(PIANO_LEFT, y, 10, 14, 0xffffff).setDepth(22);
  state.scrubberHandle.setStrokeStyle(2, 0x3b82f6);

  state.scrubberTimeCur = scene.add.text(PIANO_LEFT - 5, y, '0:00', {
    fontFamily: 'Rajdhani', fontSize: '13px', color: '#94a3b8', fontStyle: 'bold',
  }).setOrigin(1, 0.5).setDepth(20);
  state.scrubberTimeTotal = scene.add.text(PIANO_LEFT + PIANO_WIDTH + 5, y, '0:00', {
    fontFamily: 'Rajdhani', fontSize: '13px', color: '#94a3b8', fontStyle: 'bold',
  }).setOrigin(0, 0.5).setDepth(20);

  // FIX: Use a wider, taller hit area and make it truly interactive
  state.scrubberHitArea = scene.add.rectangle(
    PIANO_LEFT + PIANO_WIDTH / 2, y, PIANO_WIDTH + 20, 30, 0x000000, 0.001
  ).setDepth(25).setInteractive({ useHandCursor: true, draggable: false });

  // FIX: Pointer down on scrubber → start dragging + seek
  state.scrubberHitArea.on('pointerdown', (pointer) => {
    if (!state.mxLoaded) return;
    state.scrubberDragging = true;
    seekToPointer(pointer.x, scene);
  });

  // FIX: Global pointer move/up for drag tracking
  scene.input.on('pointermove', (pointer) => {
    if (state.scrubberDragging && state.mxLoaded) {
      seekToPointer(pointer.x, scene);
    }
  });

  scene.input.on('pointerup', () => {
    state.scrubberDragging = false;
  });

  setScrubberVisible(false);
}

function seekToPointer(px, scene) {
  const dur = getMxDuration();
  if (dur <= 0) return;
  // Convert the Phaser world x to a ratio on the scrubber track
  const ratio = Math.max(0, Math.min(1, (px - PIANO_LEFT) / PIANO_WIDTH));
  mxSeekTo(ratio * dur);
}

export function mxSeekTo(newTime) {
  state.mxCurTime = newTime;
  state.mxLastTs = null;
  mxClearFallingNotes();
  mxClearSolverBlocks();

  state.mxPlayed.clear();
  for (let i = 0; i < state.mxNotes.length; i++) {
    if (state.mxNotes[i].startSec + state.mxNotes[i].durationSec < newTime) state.mxPlayed.add(i);
  }

  if (state.solverReady && state.mxScene) {
    solverPrepareBlocks(state.mxScene);
    for (const kn of state.mxKeyboardNotes) {
      if (kn.startSec + kn.durationSec < newTime) kn.deleted = true;
    }
    for (const sb of state.mxShiftBlocks) {
      if (sb.timeSec < newTime) sb.deleted = true;
    }
    state.mxKeyboardNotes = state.mxKeyboardNotes.filter(kn => !kn.deleted);
    state.mxShiftBlocks = state.mxShiftBlocks.filter(sb => !sb.deleted);
  }
}

export function setScrubberVisible(vis) {
  const alpha = vis ? 1 : 0;
  [state.scrubberTrack, state.scrubberFill, state.scrubberHandle,
   state.scrubberTimeCur, state.scrubberTimeTotal].forEach(el => { if (el) el.setAlpha(alpha); });
  if (state.scrubberHitArea) {
    state.scrubberHitArea.setAlpha(0.001); // Always near-invisible but interactive
    if (vis) state.scrubberHitArea.setInteractive({ useHandCursor: true });
    else state.scrubberHitArea.disableInteractive();
  }
}

export function updateScrubber() {
  if (!state.mxLoaded) { setScrubberVisible(false); return; }
  setScrubberVisible(true);
  const dur = getMxDuration();
  const cur = Math.max(0, state.mxCurTime);
  const ratio = dur > 0 ? Math.min(1, cur / dur) : 0;
  state.scrubberFill.setSize(PIANO_WIDTH * ratio, 2);
  state.scrubberHandle.setX(PIANO_LEFT + PIANO_WIDTH * ratio);
  state.scrubberTimeCur.setText(formatTime(cur));
  state.scrubberTimeTotal.setText(formatTime(dur));
}
