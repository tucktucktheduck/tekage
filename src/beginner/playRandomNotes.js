// ═══════════════════════════════════════════════════════════
//  BEGINNER MODE 3 — PLAY RANDOM NOTES
//  The existing random note spawner, with full keyboard+piano.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import colors from '../core/colors.js';
import { FALL_SPEED, MAX_CONCURRENT_NOTES, ANTENNA_BLOCK_WIDTH } from '../core/constants.js';
import { drawFullKeyboard, wireKeyboardInput } from '../ui/sharedKeyboard.js';
import { initAudio, playNote, stopNote } from '../audio/engine.js';
import { pressKey, releaseKey } from '../ui/piano.js';
import { spawnRandomNote } from '../ui/randomNotes.js';

export function startPlayRandomNotes(scene) {
  scene.children.removeAll();
  scene.cameras.main.setBackgroundColor('#000');

  drawFullKeyboard(scene);

  wireKeyboardInput(scene, {
    audio: { initAudio, playNote, stopNote },
    piano: { pressKey, releaseKey },
  });

  // Start / Stop buttons
  const startBtn = scene.add.rectangle(860, 30, 160, 30, 0x000000).setInteractive().setDepth(30);
  startBtn.setStrokeStyle(2, colors.left);
  scene.add.text(860, 30, 'START', { fontFamily: 'Rajdhani', fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  startBtn.on('pointerdown', () => { state.isPlaying = true; });

  const stopBtn = scene.add.rectangle(1060, 30, 160, 30, 0x000000).setInteractive().setDepth(30);
  stopBtn.setStrokeStyle(2, colors.right);
  scene.add.text(1060, 30, 'STOP', { fontFamily: 'Rajdhani', fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  stopBtn.on('pointerdown', () => {
    state.isPlaying = false;
    state.fallingNotes.forEach(fn => {
      if (fn.antennaBlock) fn.antennaBlock.destroy();
      if (fn.portBlock) fn.portBlock.destroy();
      if (fn.pianoBlock) fn.pianoBlock.destroy();
      if (fn.pianoHighlight) fn.pianoHighlight.setAlpha(0);
    });
    state.fallingNotes = [];
  });

  let spawnTimer = 0;

  scene.events.on('update', (time, delta) => {
    const dt = delta / 1000;

    // Spawn
    if (state.isPlaying && state.fallingNotes.length < MAX_CONCURRENT_NOTES) {
      spawnTimer += delta;
      if (spawnTimer > 1000) { spawnTimer = 0; spawnRandomNote(scene); }
    }

    // Update falling notes
    for (let i = state.fallingNotes.length - 1; i >= 0; i--) {
      const fn = state.fallingNotes[i];
      fn.currentY += FALL_SPEED * dt;
      const keyObj = state.keyObjects[fn.key];
      if (!keyObj) { state.fallingNotes.splice(i, 1); continue; }
      const nBot = fn.currentY + fn.height / 2, nTop = fn.currentY - fn.height / 2;

      // Antenna
      if (!fn.antennaDeleted) {
        if (nTop >= keyObj.antennaBottom) { if (fn.antennaBlock) fn.antennaBlock.destroy(); fn.antennaDeleted = true; }
        else {
          const vT = Math.max(nTop, keyObj.antennaTop), vB = Math.min(nBot, keyObj.antennaBottom), vH = vB - vT;
          if (vH > 0) {
            if (!fn.antennaBlock) { fn.antennaBlock = scene.add.rectangle(keyObj.centerX, (vT+vB)/2, ANTENNA_BLOCK_WIDTH, vH, fn.color, 0.9); fn.antennaBlock.setStrokeStyle(5, fn.color).setDepth(5); }
            else { fn.antennaBlock.setPosition(keyObj.centerX, (vT+vB)/2); fn.antennaBlock.setSize(ANTENNA_BLOCK_WIDTH, vH); }
          }
        }
      }
      // Port
      if (nBot >= keyObj.portTop) {
        const vT = Math.max(nTop, keyObj.portTop), vB = Math.min(nBot, keyObj.portBottom), vH = vB - vT;
        if (vH > 0 && vT < keyObj.portBottom) {
          if (!fn.portBlock) { fn.portBlock = scene.add.rectangle(keyObj.centerX, (vT+vB)/2, keyObj.width - 10, vH, fn.color, 0.7); fn.portBlock.setStrokeStyle(5, fn.color).setDepth(3); }
          else { fn.portBlock.setPosition(keyObj.centerX, (vT+vB)/2); fn.portBlock.setSize(keyObj.width - 10, vH); }
        }
      }
      // Piano
      if (fn.pianoData) {
        fn.pianoY += FALL_SPEED * dt;
        const pT = fn.pianoY - fn.pianoHeight/2, pB = fn.pianoY + fn.pianoHeight/2;
        const vT = Math.max(pT, fn.pianoData.spawnBoundary), vB = Math.min(pB, fn.pianoData.pianoTop), vH = vB - vT;
        if (pT >= fn.pianoData.pianoTop) { if (fn.pianoBlock) fn.pianoBlock.destroy(); if (fn.pianoHighlight) fn.pianoHighlight.setAlpha(0); fn.pianoDeleted = true; }
        else if (vH > 0 && fn.pianoBlock) { fn.pianoBlock.setVisible(true); fn.pianoBlock.setPosition(fn.pianoData.x, vT + vH/2); fn.pianoBlock.setSize(fn.pianoData.blockWidth, vH); }
        else if (fn.pianoBlock) fn.pianoBlock.setVisible(false);
        if (fn.pianoHighlight) fn.pianoHighlight.setAlpha(pB >= fn.pianoData.pianoTop - 100 && pT < fn.pianoData.pianoTop ? 0.5 : 0);
      }
      // Cleanup
      if (nTop > keyObj.portBottom && (!fn.pianoData || fn.pianoDeleted)) {
        if (fn.antennaBlock) fn.antennaBlock.destroy();
        if (fn.portBlock) fn.portBlock.destroy();
        if (fn.pianoBlock) fn.pianoBlock.destroy();
        if (fn.pianoHighlight) fn.pianoHighlight.setAlpha(0);
        state.fallingNotes.splice(i, 1);
      }
    }
  });

  const backBtn = scene.add.rectangle(100, 1050, 120, 30, 0x000000).setInteractive().setDepth(30);
  backBtn.setStrokeStyle(2, 0x9333ea);
  scene.add.text(100, 1050, '← BACK', { fontFamily: 'Rajdhani', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  backBtn.on('pointerdown', () => { state.isPlaying = false; scene.scene.start('BeginnerScene'); });
}
