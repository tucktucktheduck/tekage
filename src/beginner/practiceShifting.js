// ═══════════════════════════════════════════════════════════
//  BEGINNER MODE 2 — PRACTICE SHIFTING
//  Sub-mode A: Get to the Dot (timed target practice)
//  Sub-mode B: Random Shift Blocks (falling blocks on fn keys)
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import colors from '../core/colors.js';
import { PIANO_TOP, PIANO_LEFT, PIANO_WIDTH, FALL_SPEED, ANTENNA_BLOCK_WIDTH } from '../core/constants.js';
import { drawFullKeyboard, wireKeyboardInput } from '../ui/sharedKeyboard.js';
import { initAudio, playNote, stopNote } from '../audio/engine.js';
import { pressKey, releaseKey, updateOct, updateRanges } from '../ui/piano.js';
import { getNote } from '../audio/noteMap.js';

export function startPracticeShifting(scene) {
  scene.children.removeAll();
  scene.cameras.main.setBackgroundColor('#000');

  scene.add.text(960, 60, 'PRACTICE SHIFTING', { fontFamily: 'Orbitron', fontSize: '36px', color: '#fff' }).setOrigin(0.5);

  const modes = [
    { label: '🎯 Get to the Dot', desc: 'A dot appears — shift to cover it ASAP', key: 'dot' },
    { label: '⬇️ Random Shift Blocks', desc: 'Falling blocks on shift keys only', key: 'blocks' },
  ];

  modes.forEach((mode, i) => {
    const y = 200 + i * 100;
    const btn = scene.add.rectangle(960, y, 500, 70, 0x0f0f1e).setInteractive();
    btn.setStrokeStyle(2, 0xec4899);
    scene.add.text(960, y - 10, mode.label, { fontFamily: 'Rajdhani', fontSize: '24px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    scene.add.text(960, y + 16, mode.desc, { fontFamily: 'Rajdhani', fontSize: '14px', color: '#94a3b8' }).setOrigin(0.5);
    btn.on('pointerdown', () => { if (mode.key === 'dot') launchGetToDot(scene); else launchRandomShiftBlocks(scene); });
  });

  const backBtn = scene.add.rectangle(960, 440, 150, 40, 0x000000).setInteractive();
  backBtn.setStrokeStyle(2, 0x9333ea);
  scene.add.text(960, 440, '← BACK', { fontFamily: 'Rajdhani', fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
  backBtn.on('pointerdown', () => scene.scene.start('BeginnerScene'));
}

function launchGetToDot(scene) {
  scene.children.removeAll();
  drawFullKeyboard(scene);

  wireKeyboardInput(scene, {
    audio: { initAudio, playNote, stopNote },
    piano: { pressKey, releaseKey },
  });

  // Stats
  let dotsHit = 0, leftTimes = [], rightTimes = [], dotStartTime = 0;
  let currentDot = null, dotGraphic = null, isLeftDot = true;

  const statsStyle = { fontFamily: 'Rajdhani', fontSize: '16px', color: '#94a3b8', fontStyle: 'bold' };
  const statsText = scene.add.text(960, 30, '', statsStyle).setOrigin(0.5).setDepth(30);

  function updateStats() {
    const lAvg = leftTimes.length ? (leftTimes.reduce((a,b)=>a+b,0)/leftTimes.length/1000).toFixed(2) : '—';
    const rAvg = rightTimes.length ? (rightTimes.reduce((a,b)=>a+b,0)/rightTimes.length/1000).toFixed(2) : '—';
    statsText.setText(`Dots: ${dotsHit} | L avg: ${lAvg}s | R avg: ${rAvg}s`);
  }

  function spawnDot() {
    if (dotGraphic) dotGraphic.destroy();
    // Pick random piano key position
    const pk = state.pianoKeys[Math.floor(Math.random() * state.pianoKeys.length)];
    currentDot = pk;
    isLeftDot = Math.random() < 0.5;
    const dotColor = isLeftDot ? colors.left : colors.right;
    const dotY = PIANO_TOP - 30;
    dotGraphic = scene.add.circle(pk.x, dotY, 12, dotColor, 0.9).setDepth(20);
    dotGraphic.setStrokeStyle(3, 0xffffff);
    dotStartTime = performance.now();
  }

  spawnDot();
  updateStats();

  scene.events.on('update', () => {
    if (!currentDot) return;
    // Check if current range covers the dot
    const targetNote = currentDot.note;
    const noteKeys = isLeftDot ? Object.keys(state.keyObjects).filter(k => {
      const n = getNote(k);
      return n === targetNote;
    }) : Object.keys(state.keyObjects).filter(k => {
      const n = getNote(k);
      return n === targetNote;
    });

    if (noteKeys.length > 0) {
      const elapsed = performance.now() - dotStartTime;
      dotsHit++;
      if (isLeftDot) leftTimes.push(elapsed); else rightTimes.push(elapsed);
      updateStats();
      spawnDot();
    }
  });

  const backBtn = scene.add.rectangle(100, 1050, 120, 30, 0x000000).setInteractive().setDepth(30);
  backBtn.setStrokeStyle(2, 0x9333ea);
  scene.add.text(100, 1050, '← BACK', { fontFamily: 'Rajdhani', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  backBtn.on('pointerdown', () => scene.scene.start('BeginnerScene'));
}

function launchRandomShiftBlocks(scene) {
  scene.children.removeAll();
  drawFullKeyboard(scene);

  wireKeyboardInput(scene, {
    audio: { initAudio, playNote, stopNote },
    piano: { pressKey, releaseKey },
  });

  const fnKeysList = ['tab', 'q', 'a', 'shift_l', 'shift_r', 'enter', 'p', ';'];
  let fallingBlocks = [];
  let spawnTimer = 0;

  scene.events.on('update', (time, delta) => {
    spawnTimer += delta;
    if (spawnTimer > 800) {
      spawnTimer = 0;
      const rk = fnKeysList[Math.floor(Math.random() * fnKeysList.length)];
      const keyObj = state.keyObjects[rk];
      if (keyObj) {
        const isLeft = (rk === 'tab' || rk === 'q' || rk === 'a' || rk === 'shift_l');
        const color = isLeft ? colors.left : colors.right;
        fallingBlocks.push({
          key: rk, y: keyObj.antennaTop - 10, height: 20,
          color, antennaBlock: null, portBlock: null, antennaDeleted: false, deleted: false,
        });
      }
    }

    // Update falling blocks
    for (let i = fallingBlocks.length - 1; i >= 0; i--) {
      const fb = fallingBlocks[i];
      if (fb.deleted) continue;
      fb.y += FALL_SPEED * delta / 1000;
      const keyObj = state.keyObjects[fb.key];
      if (!keyObj) { fb.deleted = true; continue; }
      const nTop = fb.y - fb.height / 2, nBot = fb.y + fb.height / 2;
      if (nTop > keyObj.portBottom + 20) {
        if (fb.antennaBlock) fb.antennaBlock.destroy();
        if (fb.portBlock) fb.portBlock.destroy();
        fb.deleted = true; continue;
      }
      // Antenna
      if (!fb.antennaDeleted) {
        if (nTop >= keyObj.antennaBottom) { if (fb.antennaBlock) fb.antennaBlock.destroy(); fb.antennaDeleted = true; }
        else {
          const vT = Math.max(nTop, keyObj.antennaTop), vB = Math.min(nBot, keyObj.antennaBottom), vH = vB - vT;
          if (vH > 0) {
            if (!fb.antennaBlock) { fb.antennaBlock = scene.add.rectangle(keyObj.centerX, (vT+vB)/2, ANTENNA_BLOCK_WIDTH, vH, fb.color, 0.9); fb.antennaBlock.setStrokeStyle(3, fb.color).setDepth(5); }
            else { fb.antennaBlock.setPosition(keyObj.centerX, (vT+vB)/2); fb.antennaBlock.setSize(ANTENNA_BLOCK_WIDTH, vH); }
          }
        }
      }
      // Port
      if (nBot >= keyObj.portTop) {
        const vT = Math.max(nTop, keyObj.portTop), vB = Math.min(nBot, keyObj.portBottom), vH = vB - vT;
        if (vH > 0 && vT < keyObj.portBottom) {
          if (!fb.portBlock) { fb.portBlock = scene.add.rectangle(keyObj.centerX, (vT+vB)/2, keyObj.width - 10, vH, fb.color, 0.7); fb.portBlock.setStrokeStyle(3, fb.color).setDepth(3); }
          else { fb.portBlock.setPosition(keyObj.centerX, (vT+vB)/2); fb.portBlock.setSize(keyObj.width - 10, vH); }
        }
      }
    }
    fallingBlocks = fallingBlocks.filter(fb => !fb.deleted);
  });

  const backBtn = scene.add.rectangle(100, 1050, 120, 30, 0x000000).setInteractive().setDepth(30);
  backBtn.setStrokeStyle(2, 0x9333ea);
  scene.add.text(100, 1050, '← BACK', { fontFamily: 'Rajdhani', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  backBtn.on('pointerdown', () => scene.scene.start('BeginnerScene'));
}
