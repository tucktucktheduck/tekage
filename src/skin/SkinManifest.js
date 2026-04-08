// ═══════════════════════════════════════════════════════════
//  SKIN MANIFEST VALIDATOR
//  Validates .tkg/.tkp manifest.json structure before loading.
//  Supports both v1.0 (legacy .tkp) and v2.0 (.tkg) schemas.
// ═══════════════════════════════════════════════════════════

import { NOTE_DISPLAY_MODES } from './skinConstants.js';

const VALID_HEX = /^#[0-9a-fA-F]{6}$/;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'apng', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);

/**
 * Validate a parsed manifest.json object.
 * Returns { valid: true, formatVersion: string } or { valid: false, errors: string[] }.
 */
export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest is not an object'] };
  }

  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    errors.push('manifest.name must be a non-empty string');
  }

  // Determine format version (missing = 1.0 legacy)
  const formatVersion = manifest.formatVersion ?? '1.0';

  // Colors validation (shared between v1 and v2)
  if (manifest.colors) {
    for (const [key, val] of Object.entries(manifest.colors)) {
      if (!VALID_HEX.test(val)) {
        errors.push(`manifest.colors.${key} is not a valid hex color: "${val}"`);
      }
    }
  }

  // Pages validation (shared)
  if (manifest.pages && typeof manifest.pages !== 'object') {
    errors.push('manifest.pages must be an object');
  }

  // ── v2.0 specific fields ──
  if (formatVersion === '2.0') {
    // noteDisplayMode
    if (manifest.noteDisplayMode !== undefined) {
      if (!NOTE_DISPLAY_MODES.includes(manifest.noteDisplayMode)) {
        errors.push(`manifest.noteDisplayMode must be one of: ${NOTE_DISPLAY_MODES.join(', ')}`);
      }
    }

    // perKeyVisuals
    if (manifest.perKeyVisuals) {
      if (typeof manifest.perKeyVisuals !== 'object') {
        errors.push('manifest.perKeyVisuals must be an object');
      } else {
        for (const [key, config] of Object.entries(manifest.perKeyVisuals)) {
          if (!config.image || typeof config.image !== 'string') {
            errors.push(`manifest.perKeyVisuals.${key}.image must be a string path`);
          }
        }
      }
    }

    // effects
    if (manifest.effects && typeof manifest.effects !== 'object') {
      errors.push('manifest.effects must be an object');
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, formatVersion };
}

/**
 * Get the file extension from a filename/path.
 */
export function getFileExtension(filename) {
  return (filename.split('.').pop() || '').toLowerCase();
}

/**
 * Check if a file extension is a supported image format.
 */
export function isImageFormat(ext) {
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Check if a file extension is a supported video format.
 */
export function isVideoFormat(ext) {
  return VIDEO_EXTENSIONS.has(ext);
}
