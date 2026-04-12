// ═══════════════════════════════════════════════════════════
//  MUSICXML PLAYBACK CONTROLS
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';
import { initAudio, connectAnalyserToGain } from '../audio/engine.js';

export function mxEnsureAudio() {
  initAudio();
  if (!state.mxMasterGain && state.audioContext) {
    state.mxMasterGain = state.audioContext.createGain();
    state.mxMasterGain.gain.value = state.mxMuted ? 0 : state.mxVolume;
    state.mxMasterGain.connect(state.audioContext.destination);
    connectAnalyserToGain(state.mxMasterGain);
  }
  if (state.audioContext && state.audioContext.state === 'suspended') state.audioContext.resume();
}

export function mxTogglePlay() {
  if (!state.mxLoaded) return;
  mxEnsureAudio();

  if (!state.mxPlaying && settings.startOnFirstPress && state.mxCurTime <= 0) {
    // First-press start mode: don't start yet, wait for actual key press
    state.mxWaitingForFirstPress = true;
    state.mxPlaying = false;
  } else {
    state.mxPlaying = !state.mxPlaying;
    if (!state.mxPlaying) state.mxLastTs = null;
  }
  mxUpdateButtons();
}

export function mxToggleMute() {
  state.mxMuted = !state.mxMuted;
  if (state.mxMasterGain) state.mxMasterGain.gain.value = state.mxMuted ? 0 : state.mxVolume;
  mxUpdateButtons();
}

export function mxSetVolume(val) {
  state.mxVolume = val / 100;
  document.getElementById('volVal').textContent = val + '%';
  if (state.mxMasterGain && !state.mxMuted) state.mxMasterGain.gain.value = state.mxVolume;
}

export function mxSetSpeed(val) {
  state.mxSpeed = val / 100;
  document.getElementById('spdVal').textContent = state.mxSpeed.toFixed(2) + '×';
}

export function mxShowMusicMap() {
  if (!state.mxNotes.length) return;
  const header = 'startSeconds,durationSeconds,midiNumber';
  const rows = state.mxNotes.map(n => n.startSec.toFixed(6) + ',' + n.durationSec.toFixed(6) + ',' + n.midi);
  document.getElementById('mapTextarea').value = header + '\n' + rows.join('\n');
  document.getElementById('mapModalBg').classList.add('open');
}

export function mxDownloadMap() {
  const header = 'startSeconds,durationSeconds,midiNumber';
  const rows = state.mxNotes.map(n => n.startSec.toFixed(6) + ',' + n.durationSec.toFixed(6) + ',' + n.midi);
  const csv = header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'music-map.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function mxUpdateButtons() {
  // Update teklet play button label if it exists
  const playNavItem = document.getElementById('tekletNavPlay');
  if (playNavItem) playNavItem.textContent = state.mxPlaying ? '⏸ PAUSE' : '▶ PLAY';
  // Update canvas PLAY button if it exists
  if (state._btnPlay) state._btnPlay.setText(state.mxPlaying ? '⏸ PAUSE' : '▶ PLAY');
}

export function mxToggleVolSlider() {
  if (!state.mxLoaded) return;
  const el = document.getElementById('volSliderOverlay');
  const spdEl = document.getElementById('spdSliderOverlay');
  spdEl.classList.remove('open');
  el.classList.toggle('open');
  if (el.classList.contains('open')) {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 1920;
    const scaleY = rect.height / 1080;
    el.style.left = Math.max(10, rect.left + 1770 * scaleX - 180) + 'px';
    el.style.top = (rect.top + (500 + 95) * scaleY) + 'px';
  }
}

export function mxToggleSpdSlider() {
  if (!state.mxLoaded) return;
  const el = document.getElementById('spdSliderOverlay');
  const volEl = document.getElementById('volSliderOverlay');
  volEl.classList.remove('open');
  el.classList.toggle('open');
  if (el.classList.contains('open')) {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 1920;
    const scaleY = rect.height / 1080;
    el.style.left = Math.max(10, rect.left + 1770 * scaleX - 180) + 'px';
    el.style.top = (rect.top + (500 + 95 * 2) * scaleY) + 'px';
  }
}
