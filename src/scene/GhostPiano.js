// ═══════════════════════════════════════════════════════════
//  GHOST PIANO OVERLAY
//  Replaces the solid Phaser-based piano with a transparent
//  ghost version: outlined keys, glowing perimeter, two
//  slowly-crawling colored racing dashes, and soft gradient
//  bloom when a key is pressed.
//
//  Rendered on a native Canvas 2D element overlaid on Phaser's
//  canvas. Required because Phaser Graphics objects do not
//  support shadowBlur, lineDashOffset, or linear gradients.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import { pianoData, PIANO_LEFT, PIANO_HEIGHT } from '../core/constants.js';
import { isLeftKey } from '../core/keyMapping.js';

// ── Geometry constants (must mirror piano.js exactly) ───────
const ww  = Math.round(18 * 1.5);   // 27 — white key width
const bw  = Math.round(11 * 1.5);   // 17 — black key width
const wh  = PIANO_HEIGHT;            // 140 — white key height
const bkH = Math.round(PIANO_HEIGHT * 0.64); // ≈90 — black key height

const WHITE_COUNT = pianoData.filter(d => !d.isBlack).length; // 52

const PL    = PIANO_LEFT;
const PR    = PL + WHITE_COUNT * ww;
const pCtrY = 1080 - 40 - wh / 2;   // white key center Y (mirrors piano.js pianoY)
const PY    = pCtrY - wh / 2;        // top edge of piano
const PIH   = wh;                    // piano interior height
const pBot  = PY + PIH;              // bottom edge

// Perimeter length (used for racing dashes)
const PERIM = 2 * ((PR - PL) + PIH);
const DASH  = 750;                   // each dash length in px
const GAP   = PERIM - DASH;         // gap length
const HALF  = PERIM / 2;            // orange offset from blue

const INSET = 6;    // divider / black-key inset from perimeter edges
const LW    = 1.95; // uniform stroke width

// ── Color constants ─────────────────────────────────────────
const OUTLINE_RGBA  = 'rgba(225,232,255,0.90)';
const OUTLINE_GLOW  = 'rgba(225,232,255,1.0)';
const BLUE_RGBA     = (a) => `rgba(59,158,255,${a})`;
const ORANGE_RGBA   = (a) => `rgba(255,138,43,${a})`;

// ── Precompute key left edges from pianoData ────────────────
// White key left edges (for divider drawing)
const _whiteLeftEdges = [];
let _wx = PL;
pianoData.forEach(d => {
  if (!d.isBlack) { _whiteLeftEdges.push(_wx); _wx += ww; }
});

// Black key left edges and their center X (for outline drawing)
const _blackKeys = [];
_wx = PL;
pianoData.forEach((d, i) => {
  if (!d.isBlack && i + 1 < pianoData.length && pianoData[i + 1].isBlack) {
    // Mirror piano.js: black key center = x + ww - bw/2 → left edge = x + ww - bw
    const leftEdge = _wx + ww - bw;
    _blackKeys.push({ left: leftEdge });
  }
  if (!d.isBlack) _wx += ww;
});

// ── Module state ────────────────────────────────────────────
let _canvas  = null;
let _cx      = null;
let _rafId   = null;
let _ro      = null;      // ResizeObserver for scaling sync
let _t0      = 0;         // animation start timestamp

// ── Overlay canvas creation & positioning ───────────────────

function _createOverlay() {
  if (_canvas) return; // singleton — only one overlay ever

  const phaserCanvas = document.querySelector('#game-container canvas');
  if (!phaserCanvas) {
    // Phaser hasn't mounted its canvas yet; retry shortly
    setTimeout(_createOverlay, 50);
    return;
  }

  _canvas = document.createElement('canvas');
  _canvas.id = 'ghost-piano-canvas';
  _canvas.width  = 1920;
  _canvas.height = 1080;

  // position:fixed so we can use getBoundingClientRect() viewport coords
  // directly, with no dependency on container positioning.
  _canvas.style.position      = 'fixed';
  _canvas.style.pointerEvents = 'none';
  _canvas.style.display       = 'block';
  _canvas.style.zIndex        = '1';   // above Phaser canvas, below teklet overlays

  _cx = _canvas.getContext('2d');

  document.body.appendChild(_canvas);

  // Sync the overlay's CSS position and size to exactly match Phaser's canvas.
  // getBoundingClientRect() is reliable after layout is computed.
  function _syncSize() {
    if (!phaserCanvas || !_canvas) return;
    const r = phaserCanvas.getBoundingClientRect();
    _canvas.style.left   = r.left   + 'px';
    _canvas.style.top    = r.top    + 'px';
    _canvas.style.width  = r.width  + 'px';
    _canvas.style.height = r.height + 'px';
  }

  // First sync: defer one frame so the browser has finished laying out
  // Phaser's canvas before we read its rect.
  requestAnimationFrame(() => {
    _syncSize();
    _ro = new ResizeObserver(_syncSize);
    _ro.observe(phaserCanvas);
    window.addEventListener('resize', _syncSize);
  });
}

// ── Drawing helpers ─────────────────────────────────────────

function _shadow(color, blur) {
  _cx.shadowColor = color;
  _cx.shadowBlur  = blur;
}
function _noShadow() {
  _cx.shadowColor = 'transparent';
  _cx.shadowBlur  = 0;
}

// Draw a line with glow — used for white-key dividers
function _glowLine(x1, y1, x2, y2) {
  _shadow(OUTLINE_GLOW, 5);
  _cx.strokeStyle = OUTLINE_RGBA;
  _cx.lineWidth   = LW;
  _cx.beginPath();
  _cx.moveTo(x1, y1);
  _cx.lineTo(x2, y2);
  _cx.stroke();
  _noShadow();
}

// ── Key press glow ──────────────────────────────────────────

function _drawKeyGlow(keyLeft, keyTop, keyWidth, keyHeight, isLeft) {
  const blue   = isLeft;
  const colorFn = blue ? BLUE_RGBA : ORANGE_RGBA;

  // Vertical gradient bloom: bottom → transparent at top
  const grad = _cx.createLinearGradient(keyLeft, keyTop + keyHeight, keyLeft, keyTop);
  grad.addColorStop(0,    colorFn(0.55));
  grad.addColorStop(0.50, colorFn(0.20));
  grad.addColorStop(1,    colorFn(0));
  _cx.fillStyle = grad;
  _cx.fillRect(keyLeft, keyTop, keyWidth, keyHeight);

  // Hot edge strip at the bottom (3% of key height, max 5px)
  const stripH = Math.min(5, keyHeight * 0.03);
  const eGrad = _cx.createLinearGradient(keyLeft, keyTop + keyHeight - stripH, keyLeft, keyTop + keyHeight);
  eGrad.addColorStop(0, colorFn(0));
  eGrad.addColorStop(1, colorFn(0.85));
  _cx.fillStyle = eGrad;
  _cx.fillRect(keyLeft, keyTop + keyHeight - stripH, keyWidth, stripH);
}

// ── Main draw loop ──────────────────────────────────────────

function _draw(now) {
  _rafId = requestAnimationFrame(_draw);
  if (!_cx) return;

  const elapsed = (now - _t0) / 1000;  // seconds since init
  const dashOff = (elapsed * 5) % PERIM; // 5 px/sec

  const divTop = PY + INSET;
  const divBot = pBot - INSET;

  // Clear the piano region plus a small buffer for glow bleed
  _cx.clearRect(PL - 15, PY - 15, (PR - PL) + 30, PIH + 30);

  // ── 1. Key press glows (drawn first, under outlines) ───────
  if (state.activeKeys && state.pianoKeys && state.pianoKeys.length > 0) {
    state.activeKeys.forEach((noteName, keyStr) => {
      const pk = state.pianoKeys.find(p => p.note === noteName);
      if (!pk) return;
      const kLeft = pk.isBlack ? pk.x - bw / 2 : pk.x - (ww - 1) / 2;
      const top   = pk.isBlack ? pk.y - bkH / 2 : pk.y - wh / 2;
      const kw    = pk.isBlack ? bw : ww;
      const kh    = pk.isBlack ? bkH : wh;

      _drawKeyGlow(kLeft, top, kw, kh, isLeftKey(keyStr));
    });
  }

  // ── 2. White key dividers (inset from both ends) ───────────
  _cx.setLineDash([]);
  _whiteLeftEdges.forEach((lx, i) => {
    if (i === 0) return; // skip left perimeter edge (covered by perimeter stroke)
    _glowLine(lx, divTop, lx, divBot);
  });

  // ── 3. Black key outlines ──────────────────────────────────
  _cx.setLineDash([]);
  _cx.strokeStyle = OUTLINE_RGBA;
  _cx.lineWidth   = LW;
  _blackKeys.forEach(bk => {
    _shadow(OUTLINE_GLOW, 5);
    // Rect: starts at divTop, height = bkH - INSET (natural black-key bottom minus inset at top only)
    _cx.strokeRect(bk.left + 0.5, divTop, bw - 1, bkH - INSET);
    _noShadow();
  });

  // ── 4. Outer perimeter (drawn after dividers so it sits clean on top) ──
  _cx.setLineDash([]);
  _cx.strokeStyle = OUTLINE_RGBA;
  _cx.lineWidth   = LW;
  _shadow(OUTLINE_GLOW, 5);
  _cx.strokeRect(PL + 0.5, PY + 0.5, (PR - PL) - 1, PIH - 1);
  _noShadow();

  // ── 5. Racing dashes ──────────────────────────────────────
  // Two dashes, always equidistant: orange offset by PERIM/2 from blue
  _cx.save();
  _cx.setLineDash([DASH, GAP]);
  _cx.lineWidth = LW;

  // Blue dash
  _shadow(BLUE_RGBA(1.0), 7);
  _cx.strokeStyle     = BLUE_RGBA(0.85);
  _cx.lineDashOffset  = -dashOff;
  _cx.strokeRect(PL + 0.5, PY + 0.5, (PR - PL) - 1, PIH - 1);

  // Orange dash (offset by half the perimeter)
  _shadow(ORANGE_RGBA(1.0), 7);
  _cx.strokeStyle     = ORANGE_RGBA(0.85);
  _cx.lineDashOffset  = -dashOff + HALF;
  _cx.strokeRect(PL + 0.5, PY + 0.5, (PR - PL) - 1, PIH - 1);

  _noShadow();
  _cx.restore();
}

// ── Public API ───────────────────────────────────────────────

/**
 * Initialize the ghost piano overlay.
 * Call from MainScene.create() and BeginnerScene.create()
 * instead of drawNeonPianoOverlay().
 */
export function initGhostPiano(scene) {
  _createOverlay();

  // Store reference in state so setPianoVisible() can reach it
  state.ghostPiano = { setVisible: setGhostPianoVisible };

  // Start animation loop if not already running
  if (!_rafId) {
    _t0 = performance.now();
    _rafId = requestAnimationFrame(_draw);
  }
}

export function setGhostPianoVisible(visible) {
  if (_canvas) _canvas.style.display = visible ? 'block' : 'none';
}

export function destroyGhostPiano() {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_ro)    { _ro.disconnect(); _ro = null; }
  if (_canvas && _canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
  _canvas = null;
  _cx     = null;
  if (state.ghostPiano) state.ghostPiano = null;
}
