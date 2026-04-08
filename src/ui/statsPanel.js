// ═══════════════════════════════════════════════════════════
//  STATS PANEL — Right side real-time stats display
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';
import { getStats } from '../scoring/scoreTracker.js';

let panelGroup = null;

export function createStatsPanel(scene) {
  const x = 1920 - 60;
  const startY = 200;
  const lineH = 32;
  const style = { fontFamily: 'Rajdhani', fontSize: '18px', color: '#94a3b8', fontStyle: 'bold' };
  const valStyle = { fontFamily: 'Rajdhani', fontSize: '18px', color: '#fff', fontStyle: 'bold' };

  panelGroup = scene.add.group();

  // Grey outline border
  const panelBorder = scene.add.rectangle(x - 80, startY + 120, 200, 320, 0x000000, 0);
  panelBorder.setStrokeStyle(2, 0x333333);
  panelBorder.setDepth(29);
  panelGroup.add(panelBorder);

  const labels = ['ACCURACY', 'NOTES HIT', 'STREAK', 'BEST STREAK', 'PERFECT', 'GREAT', 'GOOD', 'MISSED'];
  const keys = ['accuracy', 'notesHit', 'streak', 'longestStreak', 'perfect', 'great', 'good', 'misses'];

  labels.forEach((label, i) => {
    const y = startY + i * lineH;
    const lbl = scene.add.text(x, y, label, style).setOrigin(1, 0).setDepth(30);
    const val = scene.add.text(x, y + 16, '—', valStyle).setOrigin(1, 0).setDepth(30);
    state.statsTexts[keys[i]] = val;
    panelGroup.add(lbl);
    panelGroup.add(val);
  });

  setStatsPanelVisible(settings.statsPanelOn);
}

export function setStatsPanelVisible(visible) {
  if (!panelGroup) return;
  panelGroup.getChildren().forEach(c => c.setVisible(visible));
}

export function updateStatsPanel() {
  if (!settings.statsPanelOn) return;
  const stats = getStats();
  if (state.statsTexts.accuracy) state.statsTexts.accuracy.setText(`${stats.accuracy}%`);
  if (state.statsTexts.notesHit) state.statsTexts.notesHit.setText(`${stats.notesHit} / ${stats.totalNotes}`);
  if (state.statsTexts.streak) state.statsTexts.streak.setText(`${stats.streak}`);
  if (state.statsTexts.longestStreak) state.statsTexts.longestStreak.setText(`${stats.longestStreak}`);
  if (state.statsTexts.perfect) state.statsTexts.perfect.setText(`${stats.perfect}`);
  if (state.statsTexts.great) state.statsTexts.great.setText(`${stats.great}`);
  if (state.statsTexts.good) state.statsTexts.good.setText(`${stats.good}`);
  if (state.statsTexts.misses) state.statsTexts.misses.setText(`${stats.misses}`);
}
