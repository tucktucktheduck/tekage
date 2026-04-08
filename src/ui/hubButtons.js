// ═══════════════════════════════════════════════════════════
//  HUB BUTTONS — Play / Beginner / More
//  Play: hover reveals Upload + Library sub-buttons
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import colors from '../core/colors.js';
import { rowYPositions } from '../core/constants.js';

export function createHubButtons(scene, callbacks) {
  const buttonX = 50 + 100;
  const middleRowY = rowYPositions[1];
  const spacing = 95;
  const btnW = 200, btnH = 65;
  const style = { fontFamily: 'Rajdhani', fontSize: '28px', color: '#fff', fontStyle: 'bold' };
  const subStyle = { fontFamily: 'Rajdhani', fontSize: '20px', color: '#fff', fontStyle: 'bold' };

  // ── PLAY button ──
  const playBtn = scene.add.rectangle(buttonX, middleRowY - spacing, btnW, btnH, colors.black).setInteractive();
  playBtn.setStrokeStyle(3, colors.left);
  const playTxt = scene.add.text(buttonX, middleRowY - spacing, 'PLAY', style).setOrigin(0.5);
  state.hubPlay = playBtn; state.hubPlayText = playTxt;

  // Sub-buttons (hidden by default, slide out on hover)
  const subX = buttonX + btnW / 2 + 10;
  const subW = 130, subH = 50;
  const subY1 = middleRowY - spacing - 28;
  const subY2 = middleRowY - spacing + 28;

  const uploadBtn = scene.add.rectangle(subX + subW / 2, subY1, subW, subH, colors.black).setInteractive();
  uploadBtn.setStrokeStyle(2, colors.left);
  const uploadTxt = scene.add.text(subX + subW / 2, subY1, 'UPLOAD', subStyle).setOrigin(0.5);

  const libraryBtn = scene.add.rectangle(subX + subW / 2, subY2, subW, subH, colors.black).setInteractive();
  libraryBtn.setStrokeStyle(2, colors.left);
  const libraryTxt = scene.add.text(subX + subW / 2, subY2, 'LIBRARY', subStyle).setOrigin(0.5);

  state.hubSubUpload = uploadBtn; state.hubSubUploadText = uploadTxt;
  state.hubSubLibrary = libraryBtn; state.hubSubLibraryText = libraryTxt;

  // Hide sub-buttons initially
  setSubsVisible(false);

  // Hover behavior
  playBtn.on('pointerover', () => setSubsVisible(true));

  // Hide when pointer leaves the entire zone
  const checkHide = (pointer) => {
    const zone = {
      left: buttonX - btnW / 2 - 10,
      right: subX + subW + 10,
      top: middleRowY - spacing - btnH / 2 - 10,
      bottom: middleRowY - spacing + btnH / 2 + 10,
    };
    if (pointer.x < zone.left || pointer.x > zone.right || pointer.y < zone.top || pointer.y > zone.bottom) {
      setSubsVisible(false);
    }
  };
  scene.input.on('pointermove', checkHide);

  uploadBtn.on('pointerdown', () => { callbacks.onUpload(); });

  // Library button → open library in new tab
  libraryBtn.on('pointerdown', () => { callbacks.onLibrary(); });

  // ── BEGINNER button ──
  const begBtn = scene.add.rectangle(buttonX, middleRowY, btnW, btnH, colors.black).setInteractive();
  begBtn.setStrokeStyle(3, colors.right);
  const begTxt = scene.add.text(buttonX, middleRowY, 'BEGINNER', style).setOrigin(0.5);
  state.hubBeginner = begBtn; state.hubBeginnerText = begTxt;
  begBtn.on('pointerdown', () => { callbacks.onBeginner(); });

  // ── MORE button ──
  const moreBtn = scene.add.rectangle(buttonX, middleRowY + spacing, btnW, btnH, colors.black).setInteractive();
  moreBtn.setStrokeStyle(3, colors.gray);
  const moreTxt = scene.add.text(buttonX, middleRowY + spacing, 'MORE', style).setOrigin(0.5);
  state.hubMore = moreBtn; state.hubMoreText = moreTxt;
  moreBtn.on('pointerdown', () => { callbacks.onMore(); });
}

function setSubsVisible(vis) {
  state.hubSubsVisible = vis;
  const alpha = vis ? 1 : 0;
  [state.hubSubUpload, state.hubSubUploadText, state.hubSubLibrary, state.hubSubLibraryText]
    .forEach(el => { if (el) el.setAlpha(alpha); });
  if (state.hubSubUpload) {
    if (vis) state.hubSubUpload.setInteractive();
    else state.hubSubUpload.disableInteractive();
  }
  if (state.hubSubLibrary) {
    if (vis) state.hubSubLibrary.setInteractive();
    else state.hubSubLibrary.disableInteractive();
  }
}
