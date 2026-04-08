// ═══════════════════════════════════════════════════════════
//  SKIN MANAGER  (singleton)
//  Loads .tkg/.tkp texture packs, holds the active skin state,
//  and propagates color/image changes to all subscribers.
//
//  Usage:
//    import skinManager from '../skin/SkinManager.js';
//    skinManager.getColor('primary')  // → '#3b9eff'
//    skinManager.setColor('primary', '#ff0000')
//    skinManager.on('colorChange', () => refreshVisuals())
//    await skinManager.loadSkin(file)  // load a .tkg/.tkp File
// ═══════════════════════════════════════════════════════════

import JSZip from 'jszip';
import { SkinCache } from './SkinCache.js';
import { validateManifest, getFileExtension, isVideoFormat } from './SkinManifest.js';
import { defaultSkin } from './defaultSkin.js';
import { NOTE_KEY_PREFIX, noteKeyId, NOTE_DISPLAY_MODES } from './skinConstants.js';
import { decodeAnimatedImage, isAnimatedFormat } from './AnimatedImageDecoder.js';

class SkinManager {
  constructor() {
    this._colors = { ...defaultSkin.colors };
    this._cache = new SkinCache();
    this._manifest = null;
    this._listeners = { colorChange: [], skinLoaded: [] };
    /** @type {Map<string, { blob: Blob, filename: string, mode: string, frames: number, frameDuration: number, assetType?: string }>} */
    this._fileBlobs = new Map();
    this._skinName = 'Tekage Default';
    this._noteDisplayMode = 'stretch';
    this._glowIntensities = {};
    this._effects = {};
  }

  // ─────────────────────────────────────────────────────────
  //  Event emitter (minimal)
  // ─────────────────────────────────────────────────────────

  on(event, callback) {
    if (this._listeners[event]) this._listeners[event].push(callback);
  }

  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }
  }

  _emit(event, data) {
    for (const cb of (this._listeners[event] ?? [])) cb(data);
  }

  // ─────────────────────────────────────────────────────────
  //  Color API
  // ─────────────────────────────────────────────────────────

  /** @returns {string} hex color */
  getColor(which) {
    return this._colors[which] ?? '#ffffff';
  }

  /** Set a color and notify all subscribers */
  setColor(which, hex) {
    this._colors[which] = hex;
    this._emit('colorChange', { which, hex });
  }

  /**
   * Derived colors — computed from primary/secondary on demand.
   */
  getDerivedColor(which) {
    const base = which.startsWith('secondary') ? this._colors.secondary : this._colors.primary;
    if (which.endsWith('Dim')) return this._adjustBrightness(base, 0.3);
    if (which.endsWith('Glow')) return this._adjustBrightness(base, 1.3);
    if (which.endsWith('Light')) return this._desaturate(base, 0.5);
    return base;
  }

  // ─────────────────────────────────────────────────────────
  //  Image / visual API
  // ─────────────────────────────────────────────────────────

  /** Returns visual descriptor or null */
  getVisual(elementId) {
    const cached = this._cache.get(elementId);
    if (cached) {
      if (cached.type === 'video') return { type: 'video', element: cached.element, blobUrl: cached.blobUrl };
      return { type: 'image', ...cached };
    }
    // Fall back to color for color-type elements
    if (elementId === 'color_primary') return { type: 'color', data: this._colors.primary };
    if (elementId === 'color_secondary') return { type: 'color', data: this._colors.secondary };
    if (elementId === 'color_accent') return { type: 'color', data: this._colors.accent };
    return null;
  }

  getImage(elementId) {
    return this._cache.get(elementId)?.bitmap ?? null;
  }

  // ─────────────────────────────────────────────────────────
  //  Note display mode
  // ─────────────────────────────────────────────────────────

  getNoteDisplayMode() { return this._noteDisplayMode; }

  setNoteDisplayMode(mode) {
    if (NOTE_DISPLAY_MODES.includes(mode)) {
      this._noteDisplayMode = mode;
      this._emit('colorChange', { which: 'noteDisplayMode', value: mode });
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Per-key visual API
  // ─────────────────────────────────────────────────────────

  /**
   * Get the visual for a specific computer key's notes.
   * Fallback: per-key → per-hand → null (use default color rect).
   */
  getPerKeyVisual(computerKey, hand) {
    const keyId = noteKeyId(computerKey);
    const handId = hand === 'left' ? 'note_block_left' : 'note_block_right';
    const cached = this._cache.getWithFallback(keyId, handId);
    if (cached) {
      if (cached.type === 'video') return { type: 'video', element: cached.element };
      return { type: 'image', ...cached };
    }
    return null;
  }

  /** Check if a per-key visual exists (not falling back to hand default) */
  hasPerKeyVisual(computerKey) {
    return this._cache.has(noteKeyId(computerKey));
  }

  /** Get all per-key visual element IDs currently set */
  getPerKeyVisualKeys() {
    return this._cache.getAllByPrefix(NOTE_KEY_PREFIX).map(e => e.key.slice(NOTE_KEY_PREFIX.length));
  }

  // ─────────────────────────────────────────────────────────
  //  Effects API
  // ─────────────────────────────────────────────────────────

  getEffects() { return { ...this._effects }; }
  setEffect(key, value) { this._effects[key] = value; this._emit('colorChange', {}); }

  // ─────────────────────────────────────────────────────────
  //  Load default skin (no ZIP needed)
  // ─────────────────────────────────────────────────────────

  getSkinName() { return this._skinName; }
  setSkinName(name) { this._skinName = name; }

  loadDefaultSkin() {
    this._cache.clear();
    this._fileBlobs.clear();
    this._colors = { ...defaultSkin.colors };
    this._manifest = defaultSkin;
    this._skinName = defaultSkin.name;
    this._noteDisplayMode = 'stretch';
    this._glowIntensities = {};
    this._effects = {};
    this._emit('colorChange', this._colors);
    this._emit('skinLoaded', defaultSkin);
  }

  /**
   * Set a pattern/animation element from a File object.
   * Stores the original blob for re-export and decodes to ImageBitmap.
   */
  async setVisualFromFile(elementId, file, { mode = 'stretch', frames = 1, frameDuration = 100 } = {}) {
    const blob = file.slice();

    // Route animated formats through the decoder
    if (isAnimatedFormat(file.name)) {
      const decoded = await decodeAnimatedImage(blob, file.name);
      this._cache.set(elementId, {
        bitmap: decoded.bitmap,
        mode,
        frames: decoded.frames,
        frameDuration: decoded.frameDuration || frameDuration,
      });
      this._fileBlobs.set(elementId, {
        blob, filename: file.name, mode,
        frames: decoded.frames,
        frameDuration: decoded.frameDuration || frameDuration,
        assetType: 'image',
      });
    } else {
      const bitmap = await createImageBitmap(blob);
      this._cache.set(elementId, { bitmap, mode, frames, frameDuration });
      this._fileBlobs.set(elementId, { blob, filename: file.name, mode, frames, frameDuration, assetType: 'image' });
    }

    this._emit('colorChange', {}); // trigger visual refresh
  }

  /**
   * Set a video element from a File object (backgrounds only).
   */
  async setVideoFromFile(elementId, file) {
    const blob = file.slice();
    const blobUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = blobUrl;

    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error(`Failed to load video: ${file.name}`)), { once: true });
      video.load();
    });

    this._cache.set(elementId, { type: 'video', element: video, blobUrl });
    this._fileBlobs.set(elementId, { blob, filename: file.name, mode: 'cover', frames: 1, frameDuration: 0, assetType: 'video' });
    this._emit('colorChange', {});
  }

  /** Remove a visual override and revert to default */
  clearVisual(elementId) {
    this._cache.delete(elementId);
    this._fileBlobs.delete(elementId);
    this._emit('colorChange', {});
  }

  // ─────────────────────────────────────────────────────────
  //  Load a .tkg or .tkp file
  // ─────────────────────────────────────────────────────────

  async loadSkin(file) {
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch (e) {
      throw new Error(`Failed to unzip skin file: ${e.message}`);
    }

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('Skin file is missing manifest.json');

    const manifest = JSON.parse(await manifestFile.async('string'));
    const validation = validateManifest(manifest);
    if (!validation.valid) throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);

    // Clear old state
    this._cache.clear();
    this._fileBlobs.clear();
    this._skinName = manifest.name || 'Unnamed Skin';
    this._noteDisplayMode = manifest.noteDisplayMode || 'stretch';
    this._effects = manifest.effects || {};

    // Decode images from pages → elements (v1 + v2)
    if (manifest.pages) {
      for (const [, pageData] of Object.entries(manifest.pages)) {
        if (!pageData.elements) continue;
        for (const [elementId, config] of Object.entries(pageData.elements)) {
          if (config.image) {
            await this._loadAssetFromZip(zip, elementId, config);
          }
        }
      }
    }

    // v2: Per-key visuals
    if (manifest.perKeyVisuals) {
      for (const [computerKey, config] of Object.entries(manifest.perKeyVisuals)) {
        const elementId = noteKeyId(computerKey);
        if (config.image) {
          await this._loadAssetFromZip(zip, elementId, config);
        }
      }
    }

    // v2: Mask image
    if (manifest.noteMaskImage) {
      const entry = zip.file(manifest.noteMaskImage);
      if (entry) {
        const blob = await entry.async('blob');
        const bitmap = await createImageBitmap(blob);
        this._cache.set('note_mask_image', { bitmap, mode: 'cover' });
        this._fileBlobs.set('note_mask_image', { blob, filename: manifest.noteMaskImage.split('/').pop(), mode: 'cover', frames: 1, frameDuration: 0, assetType: 'image' });
      }
    }

    // Apply colors
    if (manifest.colors) {
      for (const [key, val] of Object.entries(manifest.colors)) {
        this._colors[key] = val;
      }
      this._emit('colorChange', this._colors);
    }

    this._manifest = manifest;
    this._emit('skinLoaded', manifest);
  }

  /** Helper: load a single asset from ZIP into cache */
  async _loadAssetFromZip(zip, elementId, config) {
    const entry = zip.file(config.image);
    if (!entry) { console.warn(`[SkinManager] Missing asset: ${config.image}`); return; }

    const ext = getFileExtension(config.image);
    const blob = await entry.async('blob');

    if (isVideoFormat(ext)) {
      // Video asset
      const blobUrl = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.loop = true; video.muted = true; video.playsInline = true;
      video.src = blobUrl;
      try {
        await new Promise((resolve, reject) => {
          video.addEventListener('loadeddata', resolve, { once: true });
          video.addEventListener('error', reject, { once: true });
          video.load();
        });
        this._cache.set(elementId, { type: 'video', element: video, blobUrl });
      } catch {
        console.warn(`[SkinManager] Failed to load video: ${config.image}`);
        URL.revokeObjectURL(blobUrl);
      }
      this._fileBlobs.set(elementId, { blob, filename: config.image.split('/').pop(), mode: 'cover', frames: 1, frameDuration: 0, assetType: 'video' });
    } else {
      // Image asset — route animated formats through decoder
      const filename = config.image.split('/').pop();
      let bitmap, frames, frameDuration;

      if (isAnimatedFormat(filename)) {
        const decoded = await decodeAnimatedImage(blob, filename);
        bitmap = decoded.bitmap;
        frames = decoded.frames;
        frameDuration = decoded.frameDuration;
      } else {
        bitmap = await createImageBitmap(blob);
        frames = config.frames ?? 1;
        frameDuration = config.frameDuration ?? 100;
      }

      const cacheEntry = {
        bitmap,
        mode: config.mode ?? 'stretch',
        frames,
        frameDuration,
      };
      this._cache.set(elementId, cacheEntry);
      this._fileBlobs.set(elementId, { blob, filename, ...cacheEntry, assetType: 'image' });
    }
  }

  // ─────────────────────────────────────────────────────────
  //  Export current skin state as a .tkg ZIP blob (v2 format)
  // ─────────────────────────────────────────────────────────

  async exportSkin(skinName = this._skinName) {
    const zip = new JSZip();
    const assets = zip.folder('assets');
    const elements = {};
    const perKeyVisuals = {};
    let noteMaskImage = null;

    for (const [elementId, entry] of this._fileBlobs.entries()) {
      const ext = entry.filename.split('.').pop() || 'png';
      const assetName = `${elementId}.${ext}`;
      assets.file(assetName, entry.blob);

      if (elementId.startsWith(NOTE_KEY_PREFIX)) {
        // Per-key visual → goes in perKeyVisuals
        const computerKey = elementId.slice(NOTE_KEY_PREFIX.length);
        perKeyVisuals[computerKey] = {
          image: `assets/${assetName}`,
          mode: entry.mode,
        };
      } else if (elementId === 'note_mask_image') {
        noteMaskImage = `assets/${assetName}`;
      } else {
        // Standard element
        elements[elementId] = {
          image: `assets/${assetName}`,
          mode: entry.mode,
          frames: entry.frames,
          frameDuration: entry.frameDuration,
        };
      }
    }

    const manifest = {
      formatVersion: '2.0',
      name: skinName,
      author: 'Tekage User',
      version: '1.0',
      colors: { ...this._colors },
      noteDisplayMode: this._noteDisplayMode,
      pages: { main: { elements } },
    };

    // Only include optional fields if they have content
    if (Object.keys(perKeyVisuals).length > 0) manifest.perKeyVisuals = perKeyVisuals;
    if (noteMaskImage) manifest.noteMaskImage = noteMaskImage;
    if (Object.keys(this._effects).length > 0) manifest.effects = this._effects;

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({ type: 'blob' });
  }

  // ─────────────────────────────────────────────────────────
  //  Color helpers
  // ─────────────────────────────────────────────────────────

  _adjustBrightness(hex, factor) {
    const [r, g, b] = this._hexToRgb(hex);
    return this._rgbToHex(Math.round(r * factor), Math.round(g * factor), Math.round(b * factor));
  }

  _desaturate(hex, amount) {
    const [r, g, b] = this._hexToRgb(hex);
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    return this._rgbToHex(
      Math.round(r + (gray - r) * amount),
      Math.round(g + (gray - g) * amount),
      Math.round(b + (gray - b) * amount),
    );
  }

  _hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  _rgbToHex(r, g, b) {
    const clamp = v => Math.max(0, Math.min(255, v));
    return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
}

export default new SkinManager();
