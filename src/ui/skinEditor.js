// ═══════════════════════════════════════════════════════════
//  SKIN EDITOR
//  Full in-game editor for colors, patterns, glows, and hit
//  animations. Stores everything in SkinManager; visual
//  changes are applied when the editor is closed (scene
//  restarts to rebuild Phaser objects with new skin data).
// ═══════════════════════════════════════════════════════════

import skinManager from '../skin/SkinManager.js';
import { SKIN_ELEMENTS, NOTE_KEY_PREFIX, noteKeyId, IMAGE_FORMATS, VIDEO_FORMATS, NOTE_DISPLAY_MODES } from '../skin/skinConstants.js';
import { isLeftKey } from '../core/keyMapping.js';
import { keyboardLayout } from '../core/constants.js';

const $ = id => document.getElementById(id);
let _dirty = false;
let _pendingPatternElementId = null;
let _pendingAnimElementId = null;
let _pendingNoteElementId = null;  // for per-key/hand note uploads

/** Call once from main.js after DOM is ready */
export function initSkinEditor() {
  _buildPatternGrid();
  _buildGlowGrid();
  _buildAnimGrid();
  _wireColorsTab();
  _wireBackgroundTab();
  _wireNotesTab();
  _wireTabs();
  _wireHeaderActions();
  _wirePatternFileInput();
  _wireAnimFileInput();
  _wireNoteFileInput();
  _syncColorInputs();
}

export function openSkinEditor() {
  _syncColorInputs();
  _updateDerivedSwatches();
  $('skinEditorOverlay').classList.add('open');
}

// ─────────────────────────────────────────────────────────
//  Tab switching
// ─────────────────────────────────────────────────────────

function _wireTabs() {
  document.querySelectorAll('.se-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.se-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.se-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = $(`se-tab-${btn.dataset.seTab}`);
      if (pane) pane.classList.add('active');
    });
  });
}

// ─────────────────────────────────────────────────────────
//  Header actions: export, import, reset, close
// ─────────────────────────────────────────────────────────

function _wireHeaderActions() {
  $('seCloseBtn').addEventListener('click', () => {
    $('skinEditorOverlay').classList.remove('open');
    if (_dirty) {
      _dirty = false;
      // Restart current Phaser scene to apply skin changes
      _restartScene();
    }
  });

  $('seExportBtn').addEventListener('click', async () => {
    const name = $('seNameInput').value.trim() || 'my-skin';
    skinManager.setSkinName(name);
    try {
      const blob = await skinManager.exportSkin(name);
      _downloadBlob(blob, `${name.replace(/\s+/g, '-').toLowerCase()}.tkg`);
    } catch (e) {
      console.error('[SkinEditor] Export failed:', e);
      alert('Export failed: ' + e.message);
    }
  });

  $('seImportBtn').addEventListener('click', () => {
    $('tkpFileInput').click();
  });

  $('seResetBtn').addEventListener('click', () => {
    if (!confirm('Reset all skin customizations to default?')) return;
    skinManager.loadDefaultSkin();
    _dirty = true;
    _syncColorInputs();
    _updateDerivedSwatches();
    _refreshPatternPreviews();
    _refreshAnimPreviews();
    $('seNameInput').value = 'Tekage Default';
  });
}

// ─────────────────────────────────────────────────────────
//  Colors tab
// ─────────────────────────────────────────────────────────

function _wireColorsTab() {
  _bindColorPair('seColorLeft', 'seColorLeftHex', 'primary');
  _bindColorPair('seColorRight', 'seColorRightHex', 'secondary');
  _bindColorPair('seColorAccent', 'seColorAccentHex', 'accent');
}

function _bindColorPair(pickerId, hexId, colorKey) {
  const picker = $(pickerId);
  const hexInput = $(hexId);

  picker.addEventListener('input', () => {
    const val = picker.value;
    hexInput.value = val;
    skinManager.setColor(colorKey, val);
    _dirty = true;
    _updateDerivedSwatches();
    // Update the More overlay color pickers if they exist
    if (colorKey === 'primary' && $('colorLeft')) $('colorLeft').value = val;
    if (colorKey === 'secondary' && $('colorRight')) $('colorRight').value = val;
  });

  hexInput.addEventListener('input', () => {
    const val = hexInput.value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      picker.value = val;
      skinManager.setColor(colorKey, val);
      _dirty = true;
      _updateDerivedSwatches();
    }
  });
}

function _syncColorInputs() {
  const left = skinManager.getColor('primary');
  const right = skinManager.getColor('secondary');
  const accent = skinManager.getColor('accent');
  if ($('seColorLeft')) { $('seColorLeft').value = left; $('seColorLeftHex').value = left; }
  if ($('seColorRight')) { $('seColorRight').value = right; $('seColorRightHex').value = right; }
  if ($('seColorAccent')) { $('seColorAccent').value = accent; $('seColorAccentHex').value = accent; }
}

function _updateDerivedSwatches() {
  _setSwatches('seLeftSwatches', skinManager.getColor('primary'));
  _setSwatches('seRightSwatches', skinManager.getColor('secondary'));
  _setSwatches('seAccentSwatches', skinManager.getColor('accent'));
}

function _setSwatches(containerId, baseHex) {
  const el = $(containerId);
  if (!el) return;
  const variants = [
    { label: 'base', hex: baseHex },
    { label: 'glow', hex: skinManager.getDerivedColor(containerId.includes('Left') || containerId.includes('Accent') ? 'primaryGlow' : 'secondaryGlow') },
    { label: 'dim',  hex: skinManager.getDerivedColor(containerId.includes('Left') || containerId.includes('Accent') ? 'primaryDim' : 'secondaryDim') },
    { label: 'lite', hex: skinManager.getDerivedColor(containerId.includes('Left') || containerId.includes('Accent') ? 'primaryLight' : 'secondaryLight') },
  ];
  el.innerHTML = variants.map(v =>
    `<div class="se-swatch" style="background:${v.hex}" data-label="${v.label}" title="${v.label}: ${v.hex}"></div>`
  ).join('');
}

// ─────────────────────────────────────────────────────────
//  Patterns tab
// ─────────────────────────────────────────────────────────

const PATTERN_ELEMENTS = [
  { id: SKIN_ELEMENTS.NOTE_BLOCK_LEFT,    label: 'NOTE BLOCK — LEFT',    modes: true },
  { id: SKIN_ELEMENTS.NOTE_BLOCK_RIGHT,   label: 'NOTE BLOCK — RIGHT',   modes: true },
  { id: SKIN_ELEMENTS.NOTE_BLOCK_PATTERN, label: 'NOTE PATTERN OVERLAY', modes: true },
  { id: SKIN_ELEMENTS.HIT_GLOW_PATTERN,   label: 'KEY GLOW OVERLAY',     modes: true },
  { id: SKIN_ELEMENTS.BACKGROUND,         label: 'BACKGROUND',           modes: false },
  { id: SKIN_ELEMENTS.ANTENNA_LINE,       label: 'ANTENNA LINE',         modes: false },
];

function _buildPatternGrid() {
  const grid = $('sePatternGrid');
  if (!grid) return;
  grid.innerHTML = PATTERN_ELEMENTS.map(el => `
    <div class="se-pattern-card" data-element="${el.id}">
      <div class="se-card-label">${el.label}</div>
      <div class="se-pattern-preview" id="prev-${el.id}">
        <span style="color:#334155;font-size:12px">No image</span>
      </div>
      <div class="se-pattern-actions">
        ${el.modes ? `<select class="se-mode-select" id="mode-${el.id}">
          <option value="stretch">Stretch</option>
          <option value="repeat">Repeat/Tile</option>
          <option value="cover">Cover</option>
        </select>` : ''}
        <button class="se-upload-btn" data-element="${el.id}">Upload</button>
        <button class="se-clear-btn" data-element="${el.id}" data-action="clear">✕</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.se-upload-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingPatternElementId = btn.dataset.element;
      $('sePatternFileInput').click();
    });
  });

  grid.querySelectorAll('[data-action="clear"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const elId = btn.dataset.element;
      skinManager.clearVisual(elId);
      _dirty = true;
      _refreshPatternPreview(elId);
    });
  });
}

function _wirePatternFileInput() {
  $('sePatternFileInput').addEventListener('change', async function () {
    const file = this.files[0];
    if (!file || !_pendingPatternElementId) return;
    const elId = _pendingPatternElementId;
    const modeEl = $(`mode-${elId}`);
    const mode = modeEl ? modeEl.value : 'stretch';
    await skinManager.setVisualFromFile(elId, file, { mode });
    _dirty = true;
    _refreshPatternPreview(elId);
    this.value = '';
  });
}

function _refreshPatternPreview(elId) {
  const preview = $(`prev-${elId}`);
  if (!preview) return;
  const cached = skinManager.getImage(elId);
  if (cached) {
    const canvas = document.createElement('canvas');
    canvas.width = cached.width;
    canvas.height = cached.height;
    canvas.getContext('2d').drawImage(cached, 0, 0);
    canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    preview.innerHTML = '';
    preview.appendChild(canvas);
  } else {
    preview.innerHTML = '<span style="color:#334155;font-size:12px">No image</span>';
  }
}

function _refreshPatternPreviews() {
  PATTERN_ELEMENTS.forEach(el => _refreshPatternPreview(el.id));
}

// ─────────────────────────────────────────────────────────
//  Glows tab
// ─────────────────────────────────────────────────────────

const GLOW_ELEMENTS = [
  { id: SKIN_ELEMENTS.HIT_GLOW_COLOR_LEFT,  label: 'HIT GLOW — LEFT HAND',  colorKey: 'primary' },
  { id: SKIN_ELEMENTS.HIT_GLOW_COLOR_RIGHT, label: 'HIT GLOW — RIGHT HAND', colorKey: 'secondary' },
  { id: SKIN_ELEMENTS.KEY_GLOW_LEFT,        label: 'KEY GLOW — LEFT',        colorKey: 'primary' },
  { id: SKIN_ELEMENTS.KEY_GLOW_RIGHT,       label: 'KEY GLOW — RIGHT',       colorKey: 'secondary' },
  { id: SKIN_ELEMENTS.ANTENNA_GLOW,         label: 'ANTENNA GLOW',           colorKey: 'accent' },
  { id: SKIN_ELEMENTS.GLOW_BAR_LEFT,        label: 'GLOW BAR — LEFT',        colorKey: 'primary' },
  { id: SKIN_ELEMENTS.GLOW_BAR_RIGHT,       label: 'GLOW BAR — RIGHT',       colorKey: 'secondary' },
];

function _buildGlowGrid() {
  const grid = $('seGlowGrid');
  if (!grid) return;
  grid.innerHTML = GLOW_ELEMENTS.map(el => {
    const base = skinManager.getColor(el.colorKey);
    return `
      <div class="se-glow-row">
        <span class="se-glow-label">${el.label}</span>
        <input type="color" id="glowColor-${el.id}" value="${base}" title="Glow color">
        <div class="se-slider-wrap">
          <span style="font-size:12px;color:#64748b">INTENSITY</span>
          <input type="range" id="glowIntensity-${el.id}" min="0" max="100" value="100">
          <span class="se-slider-val" id="glowIntVal-${el.id}">100%</span>
        </div>
      </div>`;
  }).join('');

  GLOW_ELEMENTS.forEach(el => {
    const colorInput = $(`glowColor-${el.id}`);
    const intensitySlider = $(`glowIntensity-${el.id}`);
    const intensityVal = $(`glowIntVal-${el.id}`);

    colorInput.addEventListener('input', () => {
      skinManager.setColor(el.id, colorInput.value);
      _dirty = true;
    });

    intensitySlider.addEventListener('input', () => {
      intensityVal.textContent = `${intensitySlider.value}%`;
      // Store intensity as a derived color property on skinManager
      skinManager._glowIntensities = skinManager._glowIntensities || {};
      skinManager._glowIntensities[el.id] = intensitySlider.value / 100;
      _dirty = true;
    });
  });
}

// ─────────────────────────────────────────────────────────
//  Hit Animations tab
// ─────────────────────────────────────────────────────────

const ANIM_TIERS = [
  { id: SKIN_ELEMENTS.HIT_ANIM_PERFECT, tier: 'perfect', label: 'PERFECT', color: '#fbbf24' },
  { id: SKIN_ELEMENTS.HIT_ANIM_GREAT,   tier: 'great',   label: 'GREAT',   color: '#34d399' },
  { id: SKIN_ELEMENTS.HIT_ANIM_GOOD,    tier: 'good',    label: 'GOOD',    color: '#60a5fa' },
  { id: SKIN_ELEMENTS.HIT_ANIM_MISS,    tier: 'miss',    label: 'MISS',    color: '#f87171' },
];

function _buildAnimGrid() {
  const grid = $('seAnimGrid');
  if (!grid) return;
  grid.innerHTML = ANIM_TIERS.map(t => `
    <div class="se-anim-card">
      <div class="se-anim-tier ${t.tier}" style="color:${t.color}">${t.label}</div>
      <div class="se-anim-preview" id="animPrev-${t.id}">
        <span class="se-preview-placeholder">No image</span>
      </div>
      <div class="se-anim-config">
        <label>Frames <input type="number" id="animFrames-${t.id}" value="1" min="1" max="64" style="width:56px"></label>
        <label>ms/frame <input type="number" id="animFps-${t.id}" value="100" min="16" max="2000" style="width:64px"></label>
      </div>
      <div class="se-anim-actions">
        <button class="se-upload-btn" data-anim-element="${t.id}">Upload</button>
        <button class="se-clear-btn" data-anim-element="${t.id}" data-action="clear-anim">✕</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.se-upload-btn[data-anim-element]').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingAnimElementId = btn.dataset.animElement;
      $('seAnimFileInput').click();
    });
  });

  grid.querySelectorAll('[data-action="clear-anim"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const elId = btn.dataset.animElement;
      skinManager.clearVisual(elId);
      _dirty = true;
      _refreshAnimPreview(elId);
    });
  });
}

function _wireAnimFileInput() {
  $('seAnimFileInput').addEventListener('change', async function () {
    const file = this.files[0];
    if (!file || !_pendingAnimElementId) return;
    const elId = _pendingAnimElementId;
    const frames = parseInt($(`animFrames-${elId}`)?.value || 1, 10);
    const frameDuration = parseInt($(`animFps-${elId}`)?.value || 100, 10);
    await skinManager.setVisualFromFile(elId, file, { frames, frameDuration });
    _dirty = true;
    _refreshAnimPreview(elId);
    this.value = '';
  });
}

function _refreshAnimPreview(elId) {
  const preview = $(`animPrev-${elId}`);
  if (!preview) return;
  const cached = skinManager.getImage(elId);
  if (cached) {
    const canvas = document.createElement('canvas');
    // Show just the first frame if it's a spritesheet
    const entry = skinManager._cache.get(elId);
    const frameW = entry?.frames > 1 ? Math.floor(cached.width / entry.frames) : cached.width;
    canvas.width = frameW;
    canvas.height = cached.height;
    canvas.getContext('2d').drawImage(cached, 0, 0, frameW, cached.height, 0, 0, frameW, cached.height);
    canvas.style.cssText = 'max-height:76px;max-width:100%;object-fit:contain;';
    preview.innerHTML = '';
    preview.appendChild(canvas);
  } else {
    preview.innerHTML = '<span class="se-preview-placeholder">No image</span>';
  }
}

function _refreshAnimPreviews() {
  ANIM_TIERS.forEach(t => _refreshAnimPreview(t.id));
}

// ─────────────────────────────────────────────────────────
//  Background tab
// ─────────────────────────────────────────────────────────

function _wireBackgroundTab() {
  // Image upload
  $('seBgUploadImgBtn')?.addEventListener('click', () => {
    $('seBgImageInput').click();
  });
  $('seBgImageInput')?.addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    await skinManager.setVisualFromFile(SKIN_ELEMENTS.BACKGROUND, file, { mode: 'cover' });
    _dirty = true;
    _refreshBgPreview();
    this.value = '';
  });

  // Video upload
  $('seBgUploadVidBtn')?.addEventListener('click', () => {
    $('seBgVideoInput').click();
  });
  $('seBgVideoInput')?.addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    try {
      await skinManager.setVideoFromFile(SKIN_ELEMENTS.BACKGROUND, file);
      _dirty = true;
      _refreshBgPreview();
    } catch (e) {
      alert('Failed to load video: ' + e.message);
    }
    this.value = '';
  });

  // Clear
  $('seBgClearBtn')?.addEventListener('click', () => {
    skinManager.clearVisual(SKIN_ELEMENTS.BACKGROUND);
    _dirty = true;
    _refreshBgPreview();
  });
}

function _refreshBgPreview() {
  const preview = $('seBgPreview');
  if (!preview) return;

  const visual = skinManager.getVisual(SKIN_ELEMENTS.BACKGROUND);
  if (!visual) {
    preview.innerHTML = '<span style="color:#334155;font-size:13px;">Default starfield</span>';
    return;
  }

  if (visual.type === 'video' && visual.element) {
    // Show video thumbnail
    const vid = visual.element;
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth || 320;
    canvas.height = vid.videoHeight || 180;
    try {
      canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height);
    } catch (e) {}
    canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    preview.innerHTML = '';
    preview.appendChild(canvas);
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;bottom:4px;right:8px;background:rgba(0,0,0,0.7);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;font-family:Rajdhani,sans-serif;';
    label.textContent = 'VIDEO';
    preview.style.position = 'relative';
    preview.appendChild(label);
  } else if (visual.type === 'image' && visual.bitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = visual.bitmap.width;
    canvas.height = visual.bitmap.height;
    canvas.getContext('2d').drawImage(visual.bitmap, 0, 0);
    canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    preview.innerHTML = '';
    preview.appendChild(canvas);
  }
}

// ─────────────────────────────────────────────────────────
//  Notes tab
// ─────────────────────────────────────────────────────────

function _wireNotesTab() {
  // Display mode radios
  const modeRadios = document.querySelectorAll('input[name="noteDisplayMode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      skinManager.setNoteDisplayMode(radio.value);
      _dirty = true;
      // Show/hide mask image section
      const maskSection = $('seMaskImageSection');
      if (maskSection) {
        maskSection.style.display = (radio.value === 'mask-global' || radio.value === 'mask-per-note') ? '' : 'none';
      }
    });
  });

  // Set initial mode
  const currentMode = skinManager.getNoteDisplayMode();
  const modeRadio = document.querySelector(`input[name="noteDisplayMode"][value="${currentMode}"]`);
  if (modeRadio) modeRadio.checked = true;
  const maskSection = $('seMaskImageSection');
  if (maskSection) {
    maskSection.style.display = (currentMode === 'mask-global' || currentMode === 'mask-per-note') ? '' : 'none';
  }

  // Hand default uploads
  $('seHandLeftUpload')?.addEventListener('click', () => {
    _pendingNoteElementId = 'note_block_left';
    $('seNoteFileInput').click();
  });
  $('seHandRightUpload')?.addEventListener('click', () => {
    _pendingNoteElementId = 'note_block_right';
    $('seNoteFileInput').click();
  });
  $('seHandLeftClear')?.addEventListener('click', () => {
    skinManager.clearVisual('note_block_left');
    _dirty = true;
    _refreshHandPreview('left');
  });
  $('seHandRightClear')?.addEventListener('click', () => {
    skinManager.clearVisual('note_block_right');
    _dirty = true;
    _refreshHandPreview('right');
  });

  // Mask image upload
  $('seMaskImageUpload')?.addEventListener('click', () => {
    _pendingNoteElementId = 'note_mask_image';
    $('seNoteFileInput').click();
  });
  $('seMaskImageClear')?.addEventListener('click', () => {
    skinManager.clearVisual('note_mask_image');
    _dirty = true;
    _refreshNotePreview('seMaskImagePreview', 'note_mask_image');
  });

  // Build per-key grid
  _buildPerKeyGrid();
}

function _wireNoteFileInput() {
  $('seNoteFileInput')?.addEventListener('change', async function () {
    const file = this.files[0];
    if (!file || !_pendingNoteElementId) return;
    const elId = _pendingNoteElementId;
    const mode = skinManager.getNoteDisplayMode() === 'tile' ? 'tile' : 'stretch';
    await skinManager.setVisualFromFile(elId, file, { mode });
    _dirty = true;

    // Refresh the appropriate preview
    if (elId === 'note_block_left') _refreshHandPreview('left');
    else if (elId === 'note_block_right') _refreshHandPreview('right');
    else if (elId === 'note_mask_image') _refreshNotePreview('seMaskImagePreview', elId);
    else if (elId.startsWith(NOTE_KEY_PREFIX)) _refreshPerKeyPreview(elId.slice(NOTE_KEY_PREFIX.length));

    this.value = '';
  });
}

function _refreshHandPreview(hand) {
  const previewId = hand === 'left' ? 'seHandLeftPreview' : 'seHandRightPreview';
  const elId = hand === 'left' ? 'note_block_left' : 'note_block_right';
  _refreshNotePreview(previewId, elId);
}

function _refreshNotePreview(previewId, elementId) {
  const preview = $(previewId);
  if (!preview) return;
  const bitmap = skinManager.getImage(elementId);
  if (bitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    preview.innerHTML = '';
    preview.appendChild(canvas);
  } else {
    preview.innerHTML = '<span style="color:#334155;font-size:12px">No image</span>';
  }
}

/**
 * Build the per-key grid matching the 3-row keyboard layout.
 */
function _buildPerKeyGrid() {
  const grid = $('sePerKeyGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Skip fn keys: Tab, Enter, ShiftL, ShiftR, Q, A, P, ;
  const fnSet = new Set(['tab', 'enter', 'shift_l', 'shift_r', 'q', 'a', 'p', ';']);

  for (const row of keyboardLayout) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'se-perkey-row';

    for (const keyData of row.keys) {
      let lk;
      if (keyData.key === 'ShiftL') lk = 'shift_l';
      else if (keyData.key === 'ShiftR') lk = 'shift_r';
      else lk = keyData.key.toLowerCase();

      if (fnSet.has(lk)) continue; // skip fn keys

      const isLeft = isLeftKey(lk);
      const borderColor = isLeft ? '#3b9eff' : '#ff8a2b';
      const displayKey = lk === ',' ? ',' : lk === '.' ? '.' : lk === '/' ? '/' : lk.toUpperCase();

      const cell = document.createElement('div');
      cell.className = 'se-perkey-cell';
      cell.style.borderColor = borderColor;
      cell.dataset.key = lk;

      const label = document.createElement('div');
      label.className = 'se-perkey-label';
      label.textContent = displayKey;

      const thumb = document.createElement('div');
      thumb.className = 'se-perkey-thumb';
      thumb.id = `sePerKey-${lk}`;

      // Check if custom image exists
      if (skinManager.hasPerKeyVisual(lk)) {
        const bitmap = skinManager.getImage(noteKeyId(lk));
        if (bitmap) {
          const c = document.createElement('canvas');
          c.width = bitmap.width; c.height = bitmap.height;
          c.getContext('2d').drawImage(bitmap, 0, 0);
          c.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
          thumb.appendChild(c);
        }
      }

      const actions = document.createElement('div');
      actions.className = 'se-perkey-actions';

      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'se-perkey-upload';
      uploadBtn.textContent = '+';
      uploadBtn.title = `Upload image for ${displayKey}`;
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _pendingNoteElementId = noteKeyId(lk);
        $('seNoteFileInput').click();
      });

      const clearBtn = document.createElement('button');
      clearBtn.className = 'se-perkey-clear';
      clearBtn.textContent = '✕';
      clearBtn.title = `Clear override for ${displayKey}`;
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        skinManager.clearVisual(noteKeyId(lk));
        _dirty = true;
        _refreshPerKeyPreview(lk);
      });

      actions.appendChild(uploadBtn);
      actions.appendChild(clearBtn);

      cell.appendChild(label);
      cell.appendChild(thumb);
      cell.appendChild(actions);
      rowDiv.appendChild(cell);
    }
    grid.appendChild(rowDiv);
  }
}

function _refreshPerKeyPreview(computerKey) {
  const thumb = $(`sePerKey-${computerKey}`);
  if (!thumb) return;
  const bitmap = skinManager.getImage(noteKeyId(computerKey));
  if (bitmap) {
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    c.getContext('2d').drawImage(bitmap, 0, 0);
    c.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
    thumb.innerHTML = '';
    thumb.appendChild(c);
  } else {
    thumb.innerHTML = '';
  }
}

// ─────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function _restartScene() {
  // Access Phaser game via global ref set in main.js
  const game = window.__tekageGame;
  if (!game) return;
  const sceneManager = game.scene;
  const activeScenes = sceneManager.getScenes(true);
  if (activeScenes.length > 0) {
    activeScenes[0].scene.restart();
  }
}
