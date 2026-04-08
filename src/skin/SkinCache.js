// ═══════════════════════════════════════════════════════════
//  SKIN CACHE
//  In-memory store for decoded ImageBitmaps and video elements
//  loaded from .tkg/.tkp files. Keyed by element ID.
// ═══════════════════════════════════════════════════════════

export class SkinCache {
  constructor() {
    /** @type {Map<string, { bitmap?: ImageBitmap, mode: string, frames?: number, frameDuration?: number, type?: string, element?: HTMLVideoElement, blobUrl?: string }>} */
    this._map = new Map();
  }

  set(elementId, entry) {
    // Clean up existing entry first
    this._cleanupEntry(this._map.get(elementId));
    this._map.set(elementId, entry);
  }

  get(elementId) {
    return this._map.get(elementId) ?? null;
  }

  has(elementId) {
    return this._map.has(elementId);
  }

  /** Try elementId first, then fallbackId */
  getWithFallback(elementId, fallbackId) {
    return this._map.get(elementId) ?? this._map.get(fallbackId) ?? null;
  }

  /** Return all entries whose key starts with the given prefix */
  getAllByPrefix(prefix) {
    const results = [];
    for (const [key, entry] of this._map) {
      if (key.startsWith(prefix)) results.push({ key, ...entry });
    }
    return results;
  }

  delete(elementId) {
    this._cleanupEntry(this._map.get(elementId));
    this._map.delete(elementId);
  }

  clear() {
    for (const entry of this._map.values()) {
      this._cleanupEntry(entry);
    }
    this._map.clear();
  }

  /** Properly dispose of bitmap or video resources */
  _cleanupEntry(entry) {
    if (!entry) return;
    // ImageBitmap cleanup
    if (entry.bitmap?.close) entry.bitmap.close();
    // Video cleanup
    if (entry.type === 'video' && entry.element) {
      entry.element.pause();
      entry.element.src = '';
      entry.element.load();
    }
    if (entry.blobUrl) {
      URL.revokeObjectURL(entry.blobUrl);
    }
  }
}
