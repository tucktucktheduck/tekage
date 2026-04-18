// ═══════════════════════════════════════════════════════════
//  PIANO DRAWING & KEY VISUAL FEEDBACK
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';
import colors, { intToHex } from '../core/colors.js';
import { PIANO_WIDTH, PIANO_HEIGHT, PIANO_LEFT, pianoData } from '../core/constants.js';
import { leftMap, rightMap, isLeftKey } from '../core/keyMapping.js';
import { getNote } from '../audio/noteMap.js';

const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function drawPiano(s) {
  const pianoBottom = 1080 - 40;
  const pianoY = pianoBottom - PIANO_HEIGHT / 2;
  const pianoLeft = PIANO_LEFT;
  const ww = Math.round(18 * 1.5), bw = Math.round(11 * 1.5);
  const wh = PIANO_HEIGHT, bh = PIANO_HEIGHT * 0.64;
  let x = pianoLeft;
  noteNames.forEach(n => { state.pianoNoteMap[n] = []; });

  pianoData.forEach(d => {
    if (!d.isBlack) {
      const r = s.add.rectangle(x + ww / 2, pianoY, ww - 1, wh, colors.white);
      r.setStrokeStyle(1, colors.gray);
      r.setAlpha(0); // ghost piano handles visual rendering
      const pkData = { note: d.note, rect: r, isBlack: false, x: x + ww / 2, y: pianoY };
      state.pianoKeys.push(pkData);
      state.pianoNoteMap[d.note.match(/^([A-G]#?)/)[1]].push(pkData);
      x += ww;
    }
  });
  x = pianoLeft;
  pianoData.forEach((d, i) => {
    if (!d.isBlack && i + 1 < pianoData.length && pianoData[i + 1].isBlack) {
      const blackY = pianoY - wh / 2 + bh / 2;
      const r = s.add.rectangle(x + ww - bw / 2, blackY, bw, bh, colors.grayDark);
      r.setStrokeStyle(1, colors.gray); r.setDepth(1);
      r.setAlpha(0); // ghost piano handles visual rendering
      const pkData = { note: pianoData[i + 1].note, rect: r, isBlack: true, x: x + ww - bw / 2, y: blackY };
      state.pianoKeys.push(pkData);
      state.pianoNoteMap[pianoData[i + 1].note.match(/^([A-G]#?)/)[1]].push(pkData);
    }
    if (!d.isBlack) x += ww;
  });

  state.leftRangeOverlay = s.add.graphics().setDepth(2);
  state.rightRangeOverlay = s.add.graphics().setDepth(2);
  updateRanges(s, pianoY);

  state.octaveLeftText = s.add.text(pianoLeft - 80, pianoY,
    `L: OCT ${state.octaveLeft} | ST ${state.semitoneLeft >= 0 ? '+' : ''}${state.semitoneLeft}`,
    { fontFamily: 'Orbitron', fontSize: '14px', color: intToHex(colors.left), fontStyle: 'bold' }
  ).setOrigin(1, 0.5);
  state.octaveRightText = s.add.text(pianoLeft + PIANO_WIDTH + 80, pianoY,
    `R: OCT ${state.octaveRight} | ST ${state.semitoneRight >= 0 ? '+' : ''}${state.semitoneRight}`,
    { fontFamily: 'Orbitron', fontSize: '14px', color: intToHex(colors.right), fontStyle: 'bold' }
  ).setOrigin(0, 0.5);
}

export function updateRanges(s, pianoY) {
  state.leftRangeOverlay.clear();
  state.rightRangeOverlay.clear();
  if (!settings.pianoVisualizerOn) return;
  const lNotes = new Set(), rNotes = new Set();
  Object.keys(leftMap).forEach(k => { const n = getNote(k); if (n) lNotes.add(n); });
  Object.keys(rightMap).forEach(k => { const n = getNote(k); if (n) rNotes.add(n); });
  state.pianoKeys.forEach(pk => {
    const inL = lNotes.has(pk.note), inR = rNotes.has(pk.note);
    const h = pk.isBlack ? 90 : 140;
    const w = pk.isBlack ? Math.round(11 * 1.5) : Math.round(18 * 1.5);
    const op = settings.pianoVisualizerOpacity;
    if (inL && inR) {
      state.leftRangeOverlay.fillStyle(colors.left, op);
      state.leftRangeOverlay.fillRect(pk.x - w / 2, pk.y - h / 2, w / 2, h);
      state.rightRangeOverlay.fillStyle(colors.right, op);
      state.rightRangeOverlay.fillRect(pk.x, pk.y - h / 2, w / 2, h);
    } else if (inL) {
      state.leftRangeOverlay.fillStyle(colors.left, op);
      state.leftRangeOverlay.fillRect(pk.x - w / 2, pk.y - h / 2, w, h);
    } else if (inR) {
      state.rightRangeOverlay.fillStyle(colors.right, op);
      state.rightRangeOverlay.fillRect(pk.x - w / 2, pk.y - h / 2, w, h);
    }
  });
}

export function updateOct(s) {
  if (state.octaveLeftText) state.octaveLeftText.setText(`L: OCT ${state.octaveLeft} | ST ${state.semitoneLeft >= 0 ? '+' : ''}${state.semitoneLeft}`);
  if (state.octaveRightText) state.octaveRightText.setText(`R: OCT ${state.octaveRight} | ST ${state.semitoneRight >= 0 ? '+' : ''}${state.semitoneRight}`);
  updateRanges(s, 1080 - 40 - 70);
  // Note labels stay fixed — they show note NAME only (e.g., "C"), never changes with shifting
}

export function setPianoVisible(visible) {
  if (state.leftRangeOverlay) state.leftRangeOverlay.setVisible(visible);
  if (state.rightRangeOverlay) state.rightRangeOverlay.setVisible(visible);
  if (state.octaveLeftText) state.octaveLeftText.setVisible(visible);
  if (state.octaveRightText) state.octaveRightText.setVisible(visible);
  if (state.ghostPiano) state.ghostPiano.setVisible(visible);
}

export function pressKey(k, s) {
  const o = state.keyObjects[k];
  if (!o) return;
  const isLeft = isLeftKey(k);
  const glow = isLeft ? colors.leftLight : colors.rightLight;
  if (o.rect) {
    o.rect.setFillStyle(glow);
    o.rect.setStrokeStyle(6, glow);
  }
  const note = state.activeKeys.get(k);
  if (note) {
    const pk = state.pianoKeys.find(p => p.note === note);
    if (pk) pk.rect.setFillStyle(isLeft ? colors.left : colors.right);
  }
}

export function releaseKey(k, note, s) {
  const o = state.keyObjects[k];
  if (!o) return;
  if (o.rect) {
    o.rect.setFillStyle(o.fill);
    o.rect.setStrokeStyle(4, o.stroke);
  }
  if (note) {
    const pk = state.pianoKeys.find(p => p.note === note);
    if (pk) pk.rect.setFillStyle(pk.isBlack ? colors.grayDark : colors.white);
  }
}
