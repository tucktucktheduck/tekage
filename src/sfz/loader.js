// ═══════════════════════════════════════════════════════════
//  SFZ LOADER
//  Accepts a ZIP file (or a pre-selected SFZ entry name),
//  parses the SFZ text, decodes audio samples, and returns
//  an SfzInstrument ready for SfzPlayer.
// ═══════════════════════════════════════════════════════════

import JSZip from 'jszip';
import { parseSfz } from './parser.js';

// Warn when decoded audio exceeds this threshold (bytes)
const MEMORY_WARN_BYTES = 500 * 1024 * 1024;

/** Normalize a file path: backslashes → forward slashes, leading ./ stripped */
function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Resolve a sample path against the SFZ file's directory and the default_path prefix. */
function resolveSamplePath(sfzDir, defaultPath, samplePath) {
  const p = normalizePath(samplePath);
  // If it looks absolute (starts with /) keep as-is
  if (p.startsWith('/')) return p.slice(1);
  // Prepend default_path then sfzDir
  const base = normalizePath((sfzDir || '') + (defaultPath || ''));
  const combined = base ? base.replace(/\/?$/, '/') + p : p;
  // Collapse ../ segments
  const parts = [];
  for (const seg of combined.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Load an SFZ instrument from a ZIP file.
 *
 * @param {File}     file          - ZIP File object from <input type="file">
 * @param {AudioContext} ctx       - Web Audio context for decodeAudioData
 * @param {Function} onProgress    - (message: string) => void
 * @param {string}   [chosenSfz]  - If ZIP has multiple SFZ files, caller supplies choice
 * @returns {Promise<SfzInstrument | { needsChoice, sfzFiles } | null>}
 *
 *   SfzInstrument = {
 *     name:           string,
 *     regions:        Region[],
 *     audioBuffers:   Map<path, AudioBuffer>,
 *     unknownOpcodes: Set<string>,
 *     warnings:       string[],
 *   }
 */
export async function loadSfzFromZip(file, ctx, onProgress, chosenSfz = null) {
  const progress = (msg) => { if (onProgress) onProgress(msg); };

  let zip;
  try {
    const ab = await file.arrayBuffer();
    zip = await JSZip.loadAsync(ab);
  } catch (e) {
    progress('Failed to read ZIP: ' + e.message);
    return null;
  }

  // ── Find SFZ files ────────────────────────────────────────
  const allFiles = Object.keys(zip.files);
  const sfzFiles = allFiles.filter(f => !zip.files[f].dir && f.toLowerCase().endsWith('.sfz'));

  if (sfzFiles.length === 0) {
    progress('No .sfz file found in ZIP.');
    return null;
  }

  let sfzPath;
  if (chosenSfz) {
    sfzPath = chosenSfz;
  } else if (sfzFiles.length === 1) {
    sfzPath = sfzFiles[0];
  } else {
    // Multiple SFZ files — let the UI pick
    return { needsChoice: true, sfzFiles };
  }

  progress('Parsing SFZ…');

  // ── Build fileMap for #include resolution ─────────────────
  // Load all .sfz text files in the archive
  const fileMap = new Map();
  await Promise.all(
    allFiles
      .filter(f => !zip.files[f].dir && f.toLowerCase().endsWith('.sfz'))
      .map(async f => {
        const text = await zip.files[f].async('text');
        fileMap.set(normalizePath(f), text);
      })
  );

  const sfzText = fileMap.get(normalizePath(sfzPath));
  if (!sfzText) {
    progress('Could not read SFZ file from ZIP.');
    return null;
  }

  // ── Parse ─────────────────────────────────────────────────
  const { regions, control, warnings } = parseSfz(sfzText, fileMap, normalizePath(sfzPath));

  if (regions.length === 0) {
    progress('SFZ parsed but no regions found.');
    return null;
  }

  // ── Collect unique sample paths ───────────────────────────
  const sfzDir = sfzPath.includes('/')
    ? sfzPath.slice(0, sfzPath.lastIndexOf('/') + 1) : '';

  const samplePaths = new Map(); // resolvedPath → true  (deduplicated)
  for (const region of regions) {
    const raw = region._parsed.sample || region.sample;
    if (!raw) continue;
    const resolved = resolveSamplePath(sfzDir, control.default_path, raw);
    region._resolved_sample = resolved;
    samplePaths.set(resolved, true);
  }

  // ── Decode audio in batches of 6 ─────────────────────────
  const audioBuffers = new Map(); // resolvedPath → AudioBuffer
  const unknownOpcodes = new Set();
  for (const region of regions) {
    for (const k of Object.keys(region._unknown || {})) unknownOpcodes.add(k);
  }

  const paths = [...samplePaths.keys()];
  let decoded = 0;
  let totalEstimatedBytes = 0;
  let memoryWarned = false;

  for (let i = 0; i < paths.length; i += 6) {
    const batch = paths.slice(i, i + 6);
    await Promise.all(batch.map(async resolvedPath => {
      // Case-insensitive zip lookup (some instruments use mismatched case)
      const zipKey = allFiles.find(f =>
        normalizePath(f).toLowerCase() === resolvedPath.toLowerCase()
      );

      if (!zipKey) {
        warnings.push(`Sample not found in ZIP: ${resolvedPath}`);
        decoded++;
        return;
      }

      try {
        const ab = await zip.files[zipKey].async('arraybuffer');
        const audioBuf = await ctx.decodeAudioData(ab.slice(0));
        audioBuffers.set(resolvedPath, audioBuf);

        // Track memory (samples × channels × 4 bytes per float32)
        const bytes = audioBuf.length * audioBuf.numberOfChannels * 4;
        totalEstimatedBytes += bytes;
        if (!memoryWarned && totalEstimatedBytes > MEMORY_WARN_BYTES) {
          warnings.push(
            `Decoded audio exceeds 500 MB (≈${Math.round(totalEstimatedBytes / 1024 / 1024)} MB). ` +
            'Consider using a smaller instrument.'
          );
          memoryWarned = true;
        }
      } catch (e) {
        warnings.push(`Failed to decode ${resolvedPath}: ${e.message}`);
      }

      decoded++;
      progress(`Decoding samples… ${decoded}/${paths.length}`);
    }));
  }

  const name = sfzPath
    .split('/').pop()
    .replace(/\.sfz$/i, '');

  progress(`${name} loaded — ${regions.length} regions, ${audioBuffers.size} samples`);

  return { name, regions, audioBuffers, unknownOpcodes, warnings };
}
