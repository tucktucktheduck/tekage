/* ════════════════════════════════════════════════════════════
   9.7 · BAKED SONGS  (the famous library — loads offline) — fix
   Mutopia sends no CORS header, so a file:// game can't fetch its
   MIDIs live. Instead build.mjs BAKES the curated famous songs (base64
   MIDI) into window.__TKG_SONGS__. Here we decode + parse + play them
   with zero network — the same engine path as an upload. The library
   page links to tkg.html?song=<id>.
   ════════════════════════════════════════════════════════════ */
function bakedSongs(){ return (typeof window!=='undefined' && Array.isArray(window.__TKG_SONGS__)) ? window.__TKG_SONGS__ : []; }

function _b64ToBytes(b64){
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i);
  return u;
}

// load a baked famous song by id (offline; decodes the inlined MIDI)
function loadBakedSong(id){
  const s = bakedSongs().find(x=>x.id===id);
  if(!s){ if(typeof flash==='function') flash('That song is not in this build'); return false; }
  try{
    const parsed = parseMidi(_b64ToBytes(s.midi).buffer);
    if(!parsed.notes.length){ flash('No playable notes in '+s.title); return false; }
    _commitLoadedSong(parsed, s.title + (s.composer ? ' · '+s.composer : ''));
    return true;
  }catch(e){ if(typeof flash==='function') flash('Could not load '+s.title); return false; }
}
