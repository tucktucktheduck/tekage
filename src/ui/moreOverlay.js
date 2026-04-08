// ═══════════════════════════════════════════════════════════
//  MORE OVERLAY — Settings, Instruments, Remap, Loop tabs
// ═══════════════════════════════════════════════════════════

import settings from '../core/settings.js';
import colors, { updateColors, intToHex } from '../core/colors.js';
import skinManager from '../skin/SkinManager.js';
import { setPianoVisible } from './piano.js';
import { setStatsPanelVisible } from './statsPanel.js';
import { ALL_COMPUTER_KEYS, leftMap, rightMap, fnKeys, setBinding, resetMappings } from '../core/keyMapping.js';
import { INSTRUMENTS, setInstrument, getCurrentInstrument } from '../audio/engine.js';
import { openSkinEditor } from './skinEditor.js';

let initialized = false;

export function initMoreOverlay() {
  if (initialized) return;
  initialized = true;

  const $ = id => document.getElementById(id);

  // Close button
  $('moreCloseBtn').addEventListener('click', () => {
    $('moreOverlay').classList.remove('open');
  });

  // ── Tab switching ──
  document.querySelectorAll('.more-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.more-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.more-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById('tab-' + btn.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });

  // ── Settings tab ──
  $('togglePianoViz').addEventListener('change', function () {
    settings.pianoVisualizerOn = this.checked;
    setPianoVisible(this.checked);
  });
  $('toggleFallingBlocks').addEventListener('change', function () {
    settings.fallingBlocksOn = this.checked;
  });
  $('toggleStats').addEventListener('change', function () {
    settings.statsPanelOn = this.checked;
    setStatsPanelVisible(this.checked);
  });
  $('toggleEarlyLate').addEventListener('change', function () {
    settings.earlyLateAnimationOn = this.checked;
  });
  $('toggleFirstPress').addEventListener('change', function () {
    settings.startOnFirstPress = this.checked;
  });
  $('toggleAutoShift').addEventListener('change', function () {
    settings.autoShiftOn = this.checked;
  });

  // Color pickers
  $('colorLeft').addEventListener('input', function () {
    updateColors(this.value, $('colorRight').value);
  });
  $('colorRight').addEventListener('input', function () {
    updateColors($('colorLeft').value, this.value);
  });

  // Stukage link (fixed from esteka)
  $('btnStukage').addEventListener('click', () => {
    window.open(settings.stukageUrl || 'https://stukage.com', '_blank');
  });

  // ── Skin tab ──
  _wireSkinTab();

  // Remap button — now just switches to the Remap tab
  if ($('btnRemapKeys')) {
    $('btnRemapKeys').addEventListener('click', () => {
      document.querySelectorAll('.more-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.more-tab-pane').forEach(p => p.classList.remove('active'));
      const remapBtn = document.querySelector('[data-tab="remap"]');
      if (remapBtn) remapBtn.classList.add('active');
      const remapPane = document.getElementById('tab-remap');
      if (remapPane) remapPane.classList.add('active');
    });
  }

  // In/Out loop
  if ($('btnInOut')) {
    $('btnInOut').addEventListener('click', () => {
      $('moreOverlay').classList.remove('open');
      $('inoutOverlay').classList.add('open');
    });
  }

  // Remap overlay close (legacy overlay if still present)
  if ($('remapDoneBtn')) $('remapDoneBtn').addEventListener('click', () => { $('remapOverlay').classList.remove('open'); });
  if ($('remapResetBtn')) $('remapResetBtn').addEventListener('click', () => { resetMappings(); buildRemapGrid(); });

  buildRemapGrid();

  // In/Out overlay
  if ($('inoutCancelBtn')) {
    $('inoutCancelBtn').addEventListener('click', () => {
      settings.loopIn = null;
      settings.loopOut = null;
      $('inoutDisplay').textContent = '-- → --';
      $('inoutOverlay').classList.remove('open');
    });
  }

  // ── Build instruments panel ──
  buildInstrumentPanel();
}

// ── Instrument Panel ────────────────────────────────────────

function buildInstrumentPanel() {
  const container = document.getElementById('instrumentGrid');
  if (!container) return;
  container.innerHTML = '';

  const keys = Object.keys(INSTRUMENTS);
  for (const key of keys) {
    const preset = INSTRUMENTS[key];
    const card = document.createElement('div');
    card.className = 'instrument-card';
    card.dataset.instrument = key;

    card.innerHTML = `
      <div class="inst-icon">${preset.icon}</div>
      <div class="inst-label">${preset.label}</div>
      <div class="inst-desc">${preset.description}</div>
    `;

    card.addEventListener('click', () => {
      setInstrument(key);
      document.querySelectorAll('.instrument-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });

    container.appendChild(card);
  }
}

function refreshInstrumentPanel() {
  const current = getCurrentInstrument();
  document.querySelectorAll('.instrument-card').forEach(card => {
    card.classList.toggle('active', card.dataset.instrument === current);
  });
}

// ── Remap Grid ──────────────────────────────────────────────

let selectedRemapKey = null;

function buildRemapGrid() {
  const grid = document.getElementById('remapGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  ALL_COMPUTER_KEYS.forEach(k => {
    const isFn = fnKeys.has(k);
    const noteName = leftMap[k] || rightMap[k] || '';
    const div = document.createElement('div');
    div.className = 'remap-key' + (isFn ? ' fn-key' : '');
    const displayKey = k === 'shift_l' ? 'ShL' : k === 'shift_r' ? 'ShR' : k === 'enter' ? 'Ent' : k === 'tab' ? 'Tab' : k.toUpperCase();
    div.innerHTML = `<div class="key-label">${displayKey}</div><div class="note-label">${isFn ? 'FN' : noteName || '—'}</div>`;
    if (isFn) {
      div.style.opacity = '0.4';
      div.style.cursor = 'default';
    } else {
      div.addEventListener('click', () => {
        document.querySelectorAll('.remap-key.selected').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        selectedRemapKey = k;
      });
    }
    grid.appendChild(div);
  });

  let noteRow = document.getElementById('remapNoteSelector');
  if (!noteRow) {
    noteRow = document.createElement('div');
    noteRow.id = 'remapNoteSelector';
    noteRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;justify-content:center;';
    grid.parentNode.insertBefore(noteRow, grid.nextSibling);
  }
  noteRow.innerHTML = '';
  noteNames.forEach(n => {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.style.cssText = `padding:8px 14px;border:2px solid ${n.includes('#') ? '#ec4899' : '#3b82f6'};border-radius:6px;background:${n.includes('#') ? '#1a1a2e' : 'transparent'};color:#fff;font-family:Rajdhani,sans-serif;font-size:14px;font-weight:bold;cursor:pointer;`;
    btn.addEventListener('click', () => {
      if (!selectedRemapKey) return;
      const hand = leftMap[selectedRemapKey] ? 'left' : 'right';
      setBinding(selectedRemapKey, n, hand);
      selectedRemapKey = null;
      buildRemapGrid();
    });
    noteRow.appendChild(btn);
  });
}

// ── Skin Tab ────────────────────────────────────────────────

function _wireSkinTab() {
  const $ = id => document.getElementById(id);

  // Upload .tkp
  $('btnUploadTkp')?.addEventListener('click', () => $('tkpFileInput').click());

  $('tkpFileInput')?.addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    const status = $('skinStatusMsg');
    if (status) status.textContent = 'Loading skin...';
    try {
      await skinManager.loadSkin(file);
      if (status) status.textContent = `Loaded: ${skinManager.getSkinName()}`;
    } catch (e) {
      if (status) status.textContent = `Error: ${e.message}`;
      console.error('[Skin] load failed', e);
    }
    this.value = '';
  });

  // Export .tkp
  $('btnExportTkp')?.addEventListener('click', async () => {
    const status = $('skinStatusMsg');
    if (status) status.textContent = 'Exporting...';
    try {
      const name = skinManager.getSkinName();
      const blob = await skinManager.exportSkin(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.tkg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (status) status.textContent = 'Exported!';
    } catch (e) {
      if (status) status.textContent = `Export failed: ${e.message}`;
    }
  });

  // Open editor
  $('btnOpenSkinEditor')?.addEventListener('click', () => {
    $('moreOverlay').classList.remove('open');
    openSkinEditor();
  });

  // Reset
  $('btnResetSkin')?.addEventListener('click', () => {
    if (!confirm('Reset skin to Tekage Default?')) return;
    skinManager.loadDefaultSkin();
  });

  // Keep display in sync
  skinManager.on('skinLoaded', () => {
    const display = $('skinNameDisplay');
    if (display) display.textContent = skinManager.getSkinName();
    const status = $('skinStatusMsg');
    if (status) status.textContent = '';
  });
}

// ── Public API ──────────────────────────────────────────────

export function openMoreOverlay() {
  initMoreOverlay();
  const $ = id => document.getElementById(id);
  $('togglePianoViz').checked = settings.pianoVisualizerOn;
  $('toggleFallingBlocks').checked = settings.fallingBlocksOn;
  $('toggleStats').checked = settings.statsPanelOn;
  $('toggleEarlyLate').checked = settings.earlyLateAnimationOn;
  $('toggleFirstPress').checked = settings.startOnFirstPress;
  $('toggleAutoShift').checked = settings.autoShiftOn;
  $('colorLeft').value = intToHex(colors.left);
  $('colorRight').value = intToHex(colors.right);
  refreshInstrumentPanel();

  // Default to Settings tab
  document.querySelectorAll('.more-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.more-tab-pane').forEach(p => p.classList.remove('active'));
  const firstTab = document.querySelector('.more-tab-btn');
  if (firstTab) {
    firstTab.classList.add('active');
    const firstPane = document.getElementById('tab-' + firstTab.dataset.tab);
    if (firstPane) firstPane.classList.add('active');
  }

  $('moreOverlay').classList.add('open');
}
