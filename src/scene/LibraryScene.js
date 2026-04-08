// ═══════════════════════════════════════════════════════════
//  LibraryScene.js
//  Opens library in the same tab — works for web, Electron,
//  and Capacitor (mobile) without any special tab handling.
// ═══════════════════════════════════════════════════════════

export function openLibrary() {
  window.location.href = '/library.html';
}
