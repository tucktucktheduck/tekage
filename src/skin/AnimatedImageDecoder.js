// ═══════════════════════════════════════════════════════════
//  ANIMATED IMAGE DECODER
//  Decodes GIF and APNG files into horizontal spritesheets
//  that Phaser can use for note animations.
//
//  GIF:    Uses gifuct-js to extract frames
//  APNG:   Falls back to static (browser-native decode)
//  Static: Returns single-frame result
//
//  Usage:
//    import { decodeAnimatedImage } from '../skin/AnimatedImageDecoder.js';
//    const result = await decodeAnimatedImage(blob, 'note.gif');
//    // → { bitmap: ImageBitmap, frames: 8, frameDuration: 100 }
//    // → or { bitmap: ImageBitmap, frames: 1, frameDuration: 0 } for static
// ═══════════════════════════════════════════════════════════

import { parseGIF, decompressFrames } from 'gifuct-js';

/**
 * Decode an image blob, handling animated GIFs specially.
 *
 * @param {Blob} blob - The image file data
 * @param {string} filename - Original filename (for format detection)
 * @returns {Promise<{ bitmap: ImageBitmap, frames: number, frameDuration: number }>}
 */
export async function decodeAnimatedImage(blob, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();

  // GIF → decode frames and composite into horizontal spritesheet
  if (ext === 'gif' || blob.type === 'image/gif') {
    return _decodeGif(blob);
  }

  // APNG → for now treat as static (full APNG decoding is complex)
  // All other formats → static single-frame
  const bitmap = await createImageBitmap(blob);
  return { bitmap, frames: 1, frameDuration: 0 };
}

/**
 * Decode a GIF into a horizontal spritesheet.
 * Each frame is placed side-by-side in a single canvas.
 */
async function _decodeGif(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const gif = parseGIF(arrayBuffer);
    const frames = decompressFrames(gif, true); // true = build patch list

    if (!frames || frames.length === 0) {
      // Fallback to static
      const bitmap = await createImageBitmap(blob);
      return { bitmap, frames: 1, frameDuration: 0 };
    }

    const { width, height } = gif.lsd; // logical screen descriptor
    const frameCount = frames.length;

    // Calculate average frame duration (GIF stores per-frame delay in centiseconds)
    let totalDelay = 0;
    for (const f of frames) {
      totalDelay += (f.delay || 10); // default 10cs = 100ms
    }
    const avgDelayCs = totalDelay / frameCount;
    const frameDuration = Math.round(avgDelayCs * 10); // centiseconds → milliseconds

    // Create horizontal spritesheet canvas
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = width * frameCount;
    sheetCanvas.height = height;
    const sheetCtx = sheetCanvas.getContext('2d');

    // Composite canvas (accumulates frames for dispose mode handling)
    const compCanvas = document.createElement('canvas');
    compCanvas.width = width;
    compCanvas.height = height;
    const compCtx = compCanvas.getContext('2d');

    for (let i = 0; i < frameCount; i++) {
      const frame = frames[i];
      const { dims, patch, disposalType } = frame;

      // Create ImageData from the decoded patch
      const imageData = new ImageData(
        new Uint8ClampedArray(patch),
        dims.width,
        dims.height
      );

      // Draw frame patch onto composite canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = dims.width;
      tempCanvas.height = dims.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      compCtx.drawImage(tempCanvas, dims.left, dims.top);

      // Copy composite to spritesheet at frame position
      sheetCtx.drawImage(compCanvas, i * width, 0);

      // Handle disposal
      if (disposalType === 2) {
        // Restore to background (clear the frame area)
        compCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
      } else if (disposalType === 3) {
        // Restore to previous — for simplicity, treat as background clear
        compCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
      }
      // disposalType 0 or 1 = leave in place (do nothing)
    }

    const bitmap = await createImageBitmap(sheetCanvas);
    return { bitmap, frames: frameCount, frameDuration };

  } catch (e) {
    console.warn('[AnimatedImageDecoder] GIF decode failed, falling back to static:', e);
    const bitmap = await createImageBitmap(blob);
    return { bitmap, frames: 1, frameDuration: 0 };
  }
}

/**
 * Check if a file is likely an animated image based on extension.
 * @param {string} filename
 * @returns {boolean}
 */
export function isAnimatedFormat(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return ext === 'gif' || ext === 'apng';
}
