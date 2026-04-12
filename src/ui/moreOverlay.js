// ═══════════════════════════════════════════════════════════
//  TEKLET — Sci-fi console overlay
//  Replaces the old "More Overlay". Opened by clicking the
//  right-wall portal. Hidden until a song is loaded.
//  Contains: Play, Settings, Instruments, Remap, Loop, Skin,
//  and Mode tabs with audio level meters + volume dial.
// ═══════════════════════════════════════════════════════════

import settings from '../core/settings.js';
import colors, { updateColors, intToHex } from '../core/colors.js';
import skinManager from '../skin/SkinManager.js';
import state from '../core/state.js';
import { setPianoVisible, updateRanges } from './piano.js';
import { setStatsPanelVisible } from './statsPanel.js';
import { ALL_COMPUTER_KEYS, leftMap, rightMap, fnKeys, setBinding, resetMappings, applyPreset, setAdvancedMode } from '../core/keyMapping.js';
import { INSTRUMENTS, setInstrument, getCurrentInstrument, getAudioLevels } from '../audio/engine.js';
import { salamanderPlayer, CustomSamplePlayer, getCustomPlayer, setCustomPlayer, filenameToMidi } from '../audio/salamander.js';
import { openSkinEditor } from './skinEditor.js';
import { mxTogglePlay, mxToggleMute, mxSetVolume, mxSetSpeed, mxShowMusicMap } from '../musicxml/controls.js';

let initialized = false;

// ── Public: show/hide ──────────────────────────────────────

export function showTeklet() {
  _init();
  _syncSettings();
  const el = document.getElementById('moreOverlay');
  if (el) el.style.display = 'flex';
}

export function hideTeklet() {
  const el = document.getElementById('moreOverlay');
  if (el) el.style.display = 'none';
}

export function openMoreOverlay() {
  _init();
  _syncSettings();
  document.getElementById('moreOverlay').classList.add('open');
  document.getElementById('moreOverlay').style.display = 'flex';
}

// ── Init ───────────────────────────────────────────────────

function _init() {
  if (initialized) return;
  initialized = true;

  const $ = id => document.getElementById(id);

  // Clock update
  function _updateClock() {
    const n = new Date();
    const el = $('tekletClock');
    if (el) el.textContent = String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
  }
  _updateClock();
  setInterval(_updateClock, 10000);

  // Close button
  $('moreCloseBtn').addEventListener('click', () => {
    $('moreOverlay').classList.remove('open');
    $('moreOverlay').style.display = 'none';
  });
  $('moreOverlay').addEventListener('click', e => {
    if (e.target === $('moreOverlay')) {
      $('moreOverlay').classList.remove('open');
      $('moreOverlay').style.display = 'none';
    }
  });

  // ── Nav item tab switching ──
  document.querySelectorAll('.teklet-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      if (tab === 'play') {
        // PLAY nav item always switches to play tab, not toggle
        _activateTab('play');
        return;
      }
      document.querySelectorAll('.teklet-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.more-tab-pane').forEach(p => p.classList.remove('active'));
      const pane = $('tab-' + tab);
      if (pane) pane.classList.add('active');
    });
  });

  // ── PLAY tab ──
  $('tekletPlayBtn').addEventListener('click', () => {
    if (!state.mxLoaded) {
      window.location.href = '/library.html';
      return;
    }
    mxTogglePlay();
    _updatePlayBtn();
    // Close teklet when starting playback
    if (state.mxPlaying || state.mxWaitingForFirstPress) hideTeklet();
  });
  $('tekletUploadBtn').addEventListener('click', () => {
    document.getElementById('mxFileInput').click();
  });
  $('tekletLibraryBtn').addEventListener('click', () => {
    window.location.href = '/library.html';
  });
  $('tekletMuteBtn').addEventListener('click', () => {
    mxToggleMute();
    _updateMuteBtn();
  });

  $('tekletAutoShiftBtn').addEventListener('click', () => {
    settings.autoShiftOn = !settings.autoShiftOn;
    _updateAutoShiftBtn();
  });

  $('tekletAutoSlowBtn').addEventListener('click', () => {
    settings.autoSlowDownOn = !settings.autoSlowDownOn;
    _updateAutoSlowBtn();
  });

  // Speed slider in teklet
  const spdSliderTk = $('spdSliderTeklet');
  if (spdSliderTk) {
    spdSliderTk.addEventListener('input', function () {
      mxSetSpeed(+this.value);
      const spdValEl = $('spdValTeklet');
      if (spdValEl) spdValEl.textContent = (+this.value / 100).toFixed(2) + '×';
    });
  }

  // ── Settings tab ──
  $('togglePianoViz').addEventListener('change', function () { settings.pianoVisualizerOn = this.checked; setPianoVisible(this.checked); });
  const _pianoOpSlider = $('pianoVizOpacity');
  if (_pianoOpSlider) {
    _pianoOpSlider.addEventListener('input', function () {
      settings.pianoVisualizerOpacity = +this.value / 100;
      const valEl = $('pianoVizOpacityVal');
      if (valEl) valEl.textContent = this.value + '%';
      if (state.mxScene) updateRanges(state.mxScene, 0);
    });
  }
  $('toggleFallingBlocks').addEventListener('change', function () { settings.fallingBlocksOn = this.checked; });
  $('toggleStats').addEventListener('change', function () { settings.statsPanelOn = this.checked; setStatsPanelVisible(this.checked); });
  $('toggleEarlyLate').addEventListener('change', function () { settings.earlyLateAnimationOn = this.checked; });
  $('toggleFirstPress').addEventListener('change', function () { settings.startOnFirstPress = this.checked; });

  // Color pickers
  $('colorLeft').addEventListener('input', function () { updateColors(this.value, $('colorRight').value); });
  $('colorRight').addEventListener('input', function () { updateColors($('colorLeft').value, this.value); });

  $('btnStukage').addEventListener('click', () => { window.open(settings.stukageUrl || 'https://stukage.com', '_blank'); });

  // ── Mode tab ──
  $('toggleAdvancedMode').addEventListener('change', function () {
    settings.advancedMode = this.checked;
    setAdvancedMode(this.checked);
    // Restart scene to re-render keyboard
    if (window.__tekageGame) window.__tekageGame.scene.start('MainScene');
  });

  // ── Skin tab ──
  _wireSkinTab();

  // ── Remap tab ──
  if ($('remapResetBtn')) $('remapResetBtn').addEventListener('click', () => { resetMappings(); buildRemapGrid(); });
  document.querySelectorAll('.remap-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
      buildRemapGrid();
    });
  });
  buildRemapGrid();

  // ── Loop tab ──
  if ($('btnInOut')) {
    $('btnInOut').addEventListener('click', () => {
      $('moreOverlay').classList.remove('open');
      $('moreOverlay').style.display = 'none';
      $('inoutOverlay').classList.add('open');
    });
  }
  if ($('inoutCancelBtn')) {
    $('inoutCancelBtn').addEventListener('click', () => {
      settings.loopIn = null; settings.loopOut = null;
      $('inoutDisplay').textContent = '-- → --';
      $('inoutOverlay').classList.remove('open');
    });
  }

  // ── Instruments panel ──
  buildInstrumentPanel();
  _wireCustomSampleUpload();

  // ── Quick access footer ──
  $('tekletQaBeginner').addEventListener('click', () => {
    $('moreOverlay').classList.remove('open');
    $('moreOverlay').style.display = 'none';
    if (window.__tekageGame) window.__tekageGame.scene.start('BeginnerScene');
  });
  $('tekletQaMap').addEventListener('click', () => { if (state.mxLoaded) mxShowMusicMap(); });
  $('tekletQaLoop').addEventListener('click', () => {
    $('moreOverlay').classList.remove('open');
    $('moreOverlay').style.display = 'none';
    $('inoutOverlay').classList.add('open');
  });

  // ── Audio meters + dial ──
  _buildMeters();
  _startMeterAnimation();
  _initDial();
  _startWaveform();
}

// ── Activate a specific tab ────────────────────────────────

function _activateTab(tabName) {
  document.querySelectorAll('.teklet-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.more-tab-pane').forEach(p => p.classList.remove('active'));
  const navItem = document.querySelector(`.teklet-nav-item[data-tab="${tabName}"]`);
  if (navItem) navItem.classList.add('active');
  const pane = document.getElementById('tab-' + tabName);
  if (pane) pane.classList.add('active');
}

// ── Sync settings to checkboxes ───────────────────────────

function _syncSettings() {
  const $ = id => document.getElementById(id);
  $('togglePianoViz').checked    = settings.pianoVisualizerOn;
  const _pivPct = Math.round(settings.pianoVisualizerOpacity * 100);
  const _pivSlider = $('pianoVizOpacity');
  if (_pivSlider) { _pivSlider.value = _pivPct; }
  const _pivVal = $('pianoVizOpacityVal');
  if (_pivVal) _pivVal.textContent = _pivPct + '%';
  $('toggleFallingBlocks').checked = settings.fallingBlocksOn;
  $('toggleStats').checked       = settings.statsPanelOn;
  $('toggleEarlyLate').checked   = settings.earlyLateAnimationOn;
  $('toggleFirstPress').checked  = settings.startOnFirstPress;
  $('toggleAdvancedMode').checked = settings.advancedMode;
  $('colorLeft').value  = intToHex(colors.left);
  $('colorRight').value = intToHex(colors.right);
  _updatePlayBtn();
  _updateMuteBtn();
  _updateAutoShiftBtn();
  _updateAutoSlowBtn();
  _updateSongName();
  refreshInstrumentPanel();
}

function _updatePlayBtn() {
  const btn = document.getElementById('tekletPlayBtn');
  const nav = document.getElementById('tekletNavPlay');
  if (btn) {
    if (!state.mxLoaded) {
      btn.textContent = '▶ PLAY';
      btn.classList.remove('teklet-play-flash');
    } else if (state.mxPlaying) {
      btn.textContent = '⏸ PAUSE';
      btn.classList.remove('teklet-play-flash');
    } else {
      btn.textContent = 'PRESS PLAY TO START';
      btn.classList.add('teklet-play-flash');
    }
  }
  if (nav) nav.textContent = state.mxPlaying ? '⏸ PAUSE' : '▶ PLAY';
}

function _updateMuteBtn() {
  const btn = document.getElementById('tekletMuteBtn');
  if (btn) btn.textContent = state.mxMuted ? 'UNMUTE' : 'MUTE';
}

function _updateAutoShiftBtn() {
  const btn = document.getElementById('tekletAutoShiftBtn');
  if (!btn) return;
  if (settings.autoShiftOn) {
    btn.style.background   = 'var(--tl-blue)';
    btn.style.color        = '#050810';
    btn.style.borderColor  = 'var(--tl-blue)';
  } else {
    btn.style.background   = '#0a0a14';
    btn.style.color        = 'var(--tl-blue)';
    btn.style.borderColor  = 'var(--tl-blue)';
  }
}

function _updateAutoSlowBtn() {
  const btn = document.getElementById('tekletAutoSlowBtn');
  if (!btn) return;
  if (settings.autoSlowDownOn) {
    btn.style.background   = 'var(--tl-blue)';
    btn.style.color        = '#050810';
    btn.style.borderColor  = 'var(--tl-blue)';
  } else {
    btn.style.background   = '#0a0a14';
    btn.style.color        = 'var(--tl-blue)';
    btn.style.borderColor  = 'var(--tl-blue)';
  }
}

function _updateSongName() {
  const el = document.getElementById('tekletSongName');
  if (el) el.textContent = state.mxLoaded ? (state.mxFileName || 'Song loaded') : 'No song loaded';
}

// ── Instrument Panel ───────────────────────────────────────

function buildInstrumentPanel() {
  const container = document.getElementById('instrumentGrid');
  if (!container) return;
  container.innerHTML = '';
  for (const key of Object.keys(INSTRUMENTS)) {
    const preset = INSTRUMENTS[key];
    const card = document.createElement('div');
    card.className = 'instrument-card';
    card.dataset.instrument = key;
    card.innerHTML = `<div class="inst-icon">${preset.icon}</div><div class="inst-label">${preset.label}</div><div class="inst-desc">${preset.description}</div>`;
    card.addEventListener('click', () => {
      setInstrument(key);
      document.querySelectorAll('.instrument-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      // Kick off Salamander preload when selected (no-op if already loading/loaded)
      if (key === 'salamander') _startSalamanderLoad();
    });
    container.appendChild(card);
  }
  // Trigger Salamander load if it's the active instrument
  if (getCurrentInstrument() === 'salamander') _startSalamanderLoad();
}

function _startSalamanderLoad() {
  if (salamanderPlayer.isLoaded() || salamanderPlayer.isLoading()) return;
  const statusEl = document.getElementById('salamanderStatus');
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Loading samples… 0%'; }
  salamanderPlayer.preload((progress, done, total) => {
    if (statusEl) {
      if (progress >= 1) {
        statusEl.textContent = salamanderPlayer.isLoaded()
          ? 'Salamander Grand loaded — real piano samples active'
          : 'Warning: some samples failed to load (offline?)';
        setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
      } else {
        statusEl.textContent = `Loading samples… ${done}/${total}`;
      }
    }
  });
}

function refreshInstrumentPanel() {
  const current = getCurrentInstrument();
  document.querySelectorAll('.instrument-card').forEach(card => {
    card.classList.toggle('active', card.dataset.instrument === current);
  });
}

// ── Custom Sample Upload ────────────────────────────────────

function _wireCustomSampleUpload() {
  const btn   = document.getElementById('instUploadBtn');
  const input = document.getElementById('instSampleInput');
  const status = document.getElementById('instUploadStatus');
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', async function () {
    const files = Array.from(this.files || []);
    if (!files.length) return;

    // Ensure AudioContext exists for decoding
    const ctx = state.audioContext || (() => {
      const c = new (window.AudioContext || window.webkitAudioContext)();
      state.audioContext = c;
      return c;
    })();

    if (status) status.textContent = `Decoding ${files.length} file(s)…`;

    const player = new CustomSamplePlayer();
    let ok = 0, fail = 0;

    await Promise.all(files.map(async file => {
      const midi = filenameToMidi(file.name);
      if (midi === null) { fail++; return; }
      try {
        const ab  = await file.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab);
        player.addBuffer(midi, buf);
        ok++;
      } catch (_) { fail++; }
    }));

    if (ok === 0) {
      if (status) status.textContent = 'No valid samples found. Name files like C4.mp3, A#3.wav.';
      this.value = '';
      return;
    }

    setCustomPlayer(player);
    // Register / update the custom instrument entry
    INSTRUMENTS.customUpload = {
      label: 'Custom Piano',
      icon: '📁',
      description: `${ok} sample(s) loaded${fail ? ', ' + fail + ' skipped' : ''}`,
      releaseTime: 0.3,
      sampleBased: true,
    };

    // Rebuild grid so the new card appears
    buildInstrumentPanel();

    // Auto-select custom upload
    setInstrument('customUpload');
    refreshInstrumentPanel();

    if (status) status.textContent = `Loaded ${ok} sample(s)${fail ? ' (' + fail + ' skipped)' : ''}.`;
    this.value = '';
  });
}

// ── Remap Grid ─────────────────────────────────────────────

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
    noteRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;justify-content:center;';
    grid.parentNode.insertBefore(noteRow, grid.nextSibling);
  }
  noteRow.innerHTML = '';
  noteNames.forEach(n => {
    const btn = document.createElement('button');
    btn.textContent = n;
    btn.style.cssText = `padding:6px 12px;border:2px solid ${n.includes('#') ? '#ec4899' : '#3b82f6'};border-radius:6px;background:${n.includes('#') ? '#1a1a2e' : 'transparent'};color:#fff;font-family:Rajdhani,sans-serif;font-size:13px;font-weight:bold;cursor:pointer;`;
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

// ── Skin Tab ───────────────────────────────────────────────

function _wireSkinTab() {
  const $ = id => document.getElementById(id);
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
    }
    this.value = '';
  });
  $('btnExportTkp')?.addEventListener('click', async () => {
    const status = $('skinStatusMsg');
    if (status) status.textContent = 'Exporting...';
    try {
      const name = skinManager.getSkinName();
      const blob = await skinManager.exportSkin(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${name.replace(/\s+/g,'-').toLowerCase()}.tkg`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (status) status.textContent = 'Exported!';
    } catch (e) {
      if (status) status.textContent = `Export failed: ${e.message}`;
    }
  });
  $('btnOpenSkinEditor')?.addEventListener('click', () => {
    $('moreOverlay').classList.remove('open');
    $('moreOverlay').style.display = 'none';
    openSkinEditor();
  });
  $('btnResetSkin')?.addEventListener('click', () => {
    if (!confirm('Reset skin to Tekage Default?')) return;
    skinManager.loadDefaultSkin();
  });
  skinManager.on('skinLoaded', () => {
    document.documentElement.style.setProperty('--tl-blue', skinManager.getColor('primary'));
    document.documentElement.style.setProperty('--tl-orange', skinManager.getColor('secondary'));
    const display = $('skinNameDisplay');
    if (display) display.textContent = skinManager.getSkinName();
    const status = $('skinStatusMsg');
    if (status) status.textContent = '';
  });
}

// ── Audio Meters ───────────────────────────────────────────

const BLOCK_COUNT = 14;

function _buildMeters() {
  ['tekletMeterL','tekletMeterR'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    for (let i = 0; i < BLOCK_COUNT; i++) {
      const b = document.createElement('div');
      b.className = 'teklet-block';
      b.dataset.idx = i;
      el.appendChild(b);
    }
  });
}

let _meterAnimRunning = false;
let _levelL = 0.3, _levelR = 0.25, _targetL = 0.3, _targetR = 0.25;

function _startMeterAnimation() {
  if (_meterAnimRunning) return;
  _meterAnimRunning = true;

  function tick() {
    if (!document.getElementById('moreOverlay')) return;

    const lvl = getAudioLevels();
    if (lvl.left > 0.01 || lvl.right > 0.01) {
      // Real audio driving
      _targetL = lvl.left;
      _targetR = lvl.right;
    } else {
      // Idle drift animation
      if (Math.random() < 0.06) _targetL = 0.15 + Math.random() * 0.45;
      if (Math.random() < 0.06) _targetR = 0.15 + Math.random() * 0.45;
    }
    _levelL += (_targetL - _levelL) * 0.1;
    _levelR += (_targetR - _levelR) * 0.1;

    // Dial needle reflects volume
    _updateDialFromVolume();

    const blocksL = document.getElementById('tekletMeterL')?.children;
    const blocksR = document.getElementById('tekletMeterR')?.children;
    if (blocksL && blocksR) {
      const litL = Math.round(_levelL * BLOCK_COUNT);
      const litR = Math.round(_levelR * BLOCK_COUNT);
      for (let i = 0; i < BLOCK_COUNT; i++) {
        const bL = blocksL[i], bR = blocksR[i];
        if (i < litL) { bL.className = 'teklet-block on-blue' + (i >= BLOCK_COUNT - 3 ? ' hot' : ''); }
        else { bL.className = 'teklet-block'; }
        if (i < litR) { bR.className = 'teklet-block on-orange' + (i >= BLOCK_COUNT - 3 ? ' hot' : ''); }
        else { bR.className = 'teklet-block'; }
      }
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// ── Volume Dial ────────────────────────────────────────────

let _dialAngle = 0; // maps -135..+135 to volume 0..100
let _dialDragging = false;

function _initDial() {
  const dial = document.getElementById('tekletDial');
  const needle = document.getElementById('tekletDialNeedle');
  if (!dial || !needle) return;

  // Set initial position from current volume
  _dialAngle = ((state.mxVolume * 100) / 100) * 270 - 135;

  dial.addEventListener('mousedown', e => { _dialDragging = true; e.preventDefault(); });
  dial.addEventListener('touchstart', e => { _dialDragging = true; e.preventDefault(); }, { passive: false });
  window.addEventListener('mouseup',  () => { _dialDragging = false; });
  window.addEventListener('touchend', () => { _dialDragging = false; });

  window.addEventListener('mousemove', e => {
    if (!_dialDragging) return;
    const r = dial.getBoundingClientRect();
    const a = Math.atan2(e.clientX - r.left - r.width / 2, -(e.clientY - r.top - r.height / 2)) * (180 / Math.PI);
    _dialAngle = Math.max(-135, Math.min(135, a));
    needle.style.transform = `translate(-50%,-100%) rotate(${_dialAngle}deg)`;
    const vol = Math.round((((_dialAngle + 135) / 270) * 100));
    mxSetVolume(vol);
    // Scale meter targets with volume
    _targetL = Math.max(_targetL, vol / 100 * 0.5);
    _targetR = Math.max(_targetR, vol / 100 * 0.45);
  });
  window.addEventListener('touchmove', e => {
    if (!_dialDragging || !e.touches[0]) return;
    const r = dial.getBoundingClientRect();
    const touch = e.touches[0];
    const a = Math.atan2(touch.clientX - r.left - r.width / 2, -(touch.clientY - r.top - r.height / 2)) * (180 / Math.PI);
    _dialAngle = Math.max(-135, Math.min(135, a));
    needle.style.transform = `translate(-50%,-100%) rotate(${_dialAngle}deg)`;
    const vol = Math.round((((_dialAngle + 135) / 270) * 100));
    mxSetVolume(vol);
  }, { passive: true });
}

function _updateDialFromVolume() {
  const needle = document.getElementById('tekletDialNeedle');
  if (!needle || _dialDragging) return;
  const vol = state.mxVolume * 100;
  _dialAngle = (vol / 100) * 270 - 135;
  needle.style.transform = `translate(-50%,-100%) rotate(${_dialAngle}deg)`;
}

// ── Mini Waveform ──────────────────────────────────────────

function _startWaveform() {
  const canvas = document.getElementById('tekletWave');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let wt = 0;
  function draw() {
    wt += 0.016;
    ctx.clearRect(0, 0, 144, 88);
    ctx.strokeStyle = 'rgba(26,143,255,.06)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(0, i * 13); ctx.lineTo(144, i * 13); ctx.stroke(); }
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 18, 0); ctx.lineTo(i * 18, 88); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(26,143,255,.22)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const x = i * 2, y = 44 + Math.sin(i * 0.12 + wt * 1.8) * 16 + Math.sin(i * 0.04 + wt * 0.6) * 10;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,138,43,.12)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const x = i * 2, y = 44 + Math.sin(i * 0.10 + wt * 1.2 + 1) * 13 + Math.cos(i * 0.06 + wt * 0.4) * 9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    requestAnimationFrame(draw);
  }
  draw();
}

// ── Public API (legacy compat) ─────────────────────────────

export function initMoreOverlay() { _init(); }
