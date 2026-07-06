/* ════════════════════════════════════════════════════════════
   8.5 · TKGConfig  +  loadConfig  (the single config object)
   One serializable object drives mapping / mode / assists / skin.
   loadConfig() validates a partial config, fills SAFE DEFAULTS, never
   throws on bad input, and applies the result to the runtime. The
   defaults reproduce the built-in game exactly. See docs/10 + docs/14.

   Slices v2 (docs/14): `slices.list` is the authoritative slice array
   (any number, any shape). `slices.mapping` is the legacy two-hand
   shape, kept working forever (exported HTML in the wild uses it).
   normalizeSlices() is the ONE validator that turns any config — v2
   list, a named preset, a legacy mapping, or nothing — into validated
   runtime slices. Everything downstream consumes only its output.
   ════════════════════════════════════════════════════════════ */
const DEFAULT_CONFIG = {
  mode: 'play',                 // 'play' | 'listen'
  hands: 'both',                // 'both' | 'left' | 'right'  (legacy two-slice option)
  assists: { keyNames: true, autoSlow: false, autoShift: false },
  slices: {
    preset: 'standard',         // id of the active preset, or 'custom'
    mapping: null,              // LEGACY two-hand shape — honored when list is absent
    list: null,                 // v2 authoritative slice array (see docs/14 §1)
  },
  presets: {},                  // user-saved custom presets: { name: sliceListArray }
  // skin colors drive ALL in-game color (docs/10). primary->right hand, secondary->left.
  skin: { colors:{ primary:'#ff8a2b', secondary:'#1a8fff' }, background:{ mode:'color', asset:'#05060a' } },
};

function _cfgClone(o){ try { return JSON.parse(JSON.stringify(o)); } catch(e){ return {}; } }

let TKGConfig = _cfgClone(DEFAULT_CONFIG);

// Standard KeyboardEvent.code -> printed legend. Lets us (a) match note keys by
// physical code (robust to shifted punctuation / non-US layouts, docs/14 §2.2)
// and (b) detect a shift-key code that collides with a note key legend.
const STD_CODE_LEGEND = (()=>{
  const m = { Backquote:'`', Minus:'-', Equal:'=', BracketLeft:'[', BracketRight:']',
              Backslash:'\\', Semicolon:';', Quote:"'", Comma:',', Period:'.', Slash:'/' };
  for(let i=0;i<10;i++) m['Digit'+i] = String(i);
  for(let i=0;i<26;i++) m['Key'+String.fromCharCode(65+i)] = String.fromCharCode(97+i);
  return m;
})();
// Human labels for shift-key / cue codes (extends KEY_LABEL in solvePlan.js).
const CODE_LABEL = { Tab:'TAB', Enter:'⏎', ShiftLeft:'⇧L', ShiftRight:'⇧R',
  CapsLock:'CAPS', Space:'SPACE', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→',
  Backslash:'\\', Slash:'/', Semicolon:';', Quote:"'", Comma:',', Period:'.' };
function codeLabel(code){
  if(!code) return '';
  if(CODE_LABEL[code]) return CODE_LABEL[code];
  if(STD_CODE_LEGEND[code]) return STD_CODE_LEGEND[code].toUpperCase();
  return String(code).replace(/^Key|^Digit/,'').toUpperCase();
}

// Runtime slice state (v2). Rebuilt by applyConfig; consumed by input/render/ui.
let SLICES = [];                     // validated slice objects (makeSlice + metadata)
let KEY_SLICE = {};                  // computer-key legend -> sliceId
let SHIFT_BY_CODE = {};              // KeyboardEvent.code -> { sliceId, dir }
let CODE_TO_GAMEKEY = {};            // KeyboardEvent.code -> note-key legend (for e.code matching)

// Legacy two-hand mapping -> a v2 slice list (exactly the two slices the old
// currentSlices() built, so goldens stay byte-identical).
function legacyMappingToList(mapping){
  const conv = obj => { const o = {}; for(const k in (obj||{})){
    const off = (typeof obj[k]==='number') ? obj[k] : NOTE_IDX[obj[k]];
    if(Number.isFinite(off)) o[k]=off; } return o; };
  const list = [];
  if(mapping && mapping.left && typeof mapping.left==='object')
    list.push({ id:'left', label:'L', order:0, step:12, minAnchor:12, maxAnchor:96, initialAnchor:60,
                shiftKeys:{ up:'Tab', down:'ShiftLeft' }, keys:conv(mapping.left) });
  if(mapping && mapping.right && typeof mapping.right==='object')
    list.push({ id:'right', label:'R', order:1, step:12, minAnchor:12, maxAnchor:96, initialAnchor:72,
                shiftKeys:{ up:'Enter', down:'ShiftRight' }, keys:conv(mapping.right) });
  return list;
}

// Resolve which raw slice list a config wants (list > named preset > legacy mapping > BUILTIN).
function _resolveSliceList(config){
  const sl = (config && config.slices) || {};
  if(Array.isArray(sl.list) && sl.list.length) return sl.list;
  if(sl.preset && sl.preset !== 'custom'){
    const p = (typeof SLICE_PRESETS!=='undefined' && SLICE_PRESETS[sl.preset])
           || (config && config.presets && config.presets[sl.preset]);
    if(p && Array.isArray(p.list) && p.list.length) return p.list;
    if(Array.isArray(p) && p.length) return p;             // saved presets store a bare list
  }
  if(sl.mapping && typeof sl.mapping==='object'){
    const l = legacyMappingToList(sl.mapping);
    if(l.length) return l;
  }
  return null;
}

// THE validator: any config -> validated runtime slices. NEVER throws; drops bad
// entries, always yields at least one playable slice (docs/14 §1 rules).
function normalizeSlices(config, _depth){
  let rawList = null;
  try { rawList = _resolveSliceList(config); } catch(e){ rawList = null; }
  if(!rawList) rawList = legacyMappingToList(BUILTIN_MAP);

  const usedKeys = new Set();
  const out = [];
  for(let i=0;i<rawList.length;i++){
    const raw = rawList[i] || {};
    try {
      const id = (typeof raw.id==='string' && raw.id) ? raw.id : ('s'+i);
      // keys: dedupe across ALL slices (first occurrence wins); drop non-finite offsets
      const keys = {};
      const src = (raw.keys && typeof raw.keys==='object') ? raw.keys : {};
      for(const k in src){
        const off = (typeof src[k]==='number') ? src[k] : NOTE_IDX[src[k]];
        if(!Number.isFinite(off)) continue;
        if(usedKeys.has(k)){ try{ console.warn('TKG: duplicate key "'+k+'" dropped from slice '+id); }catch(_){}
          continue; }
        usedKeys.add(k); keys[k] = off;
      }
      const step = (Number.isFinite(raw.step) && raw.step>=1) ? Math.floor(raw.step) : 12;
      const cA = v => clamp(Math.round(v), 0, 108);
      let minA = Number.isFinite(raw.minAnchor) ? cA(raw.minAnchor) : 12;
      let maxA = Number.isFinite(raw.maxAnchor) ? cA(raw.maxAnchor) : 96;
      if(minA > maxA){ const t=minA; minA=maxA; maxA=t; }
      const order = Number.isFinite(raw.order) ? raw.order : i;
      const slice = makeSlice(id, keys, { step, minAnchor:minA, maxAnchor:maxA, order });
      // runtime metadata. The anchor is the slice's BASE; the shift grid is relative
      // to it (slices.js anchorsFor), so we DON'T re-snap it onto the step grid —
      // that snap is what slid every key onto a new note when step changed.
      let ia = Number.isFinite(raw.initialAnchor) ? raw.initialAnchor : (minA+maxA)/2;
      slice.initialAnchor = clamp(Math.round(ia), minA, maxA);
      slice.label = (typeof raw.label==='string' && raw.label) ? raw.label.slice(0,2)
                  : id.slice(0,2).toUpperCase();
      slice.color = (typeof raw.color==='string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.color)) ? raw.color : null;
      slice._rawShift = (raw.shiftKeys && typeof raw.shiftKeys==='object') ? raw.shiftKeys : {};
      out.push(slice);
    } catch(e){ /* drop this slice */ }
  }
  if(!out.length){
    if(_depth) return [];                                  // guard against runaway recursion
    return normalizeSlices({ slices:{ mapping: BUILTIN_MAP } }, 1);
  }

  // validate shift keys: no collision with any note-key legend, no reserved code,
  // no duplicate shift code across slices. Strip offenders (and warn).
  const noteLegends = new Set(usedKeys);
  const RESERVED = new Set(['Space','Escape']);
  const takenShift = new Set();
  const validShift = code => {
    if(typeof code!=='string' || !code) return false;
    if(RESERVED.has(code)) return false;
    const legend = STD_CODE_LEGEND[code];
    if(legend && noteLegends.has(legend)) return false;    // shift key == a note key
    if(takenShift.has(code)) return false;                 // already claimed by another slice
    return true;
  };
  for(const slice of out){
    const rs = slice._rawShift || {};
    const sk = {};   // { up:[codes], down:[codes] } — a direction may have several keys
    for(const dir of ['up','down']){
      const raw = rs[dir];
      const codes = Array.isArray(raw) ? raw : (raw!=null ? [raw] : []);
      const valid = [];
      for(const code of codes){
        if(validShift(code)){ valid.push(code); takenShift.add(code); }
        else if(code){ try{ console.warn('TKG: shift key "'+code+'" for slice '+slice.id+' ('+dir+') dropped (collision/reserved)'); }catch(_){ } }
      }
      if(valid.length) sk[dir] = valid;
    }
    slice.shiftKeys = sk;
    delete slice._rawShift;
  }
  return out;
}

// Validate a (possibly garbage) partial config into a complete, safe one.
// NEVER throws — a bad config must not be able to crash the game.
function loadConfig(partial){
  const c = _cfgClone(DEFAULT_CONFIG);
  try {
    if(partial && typeof partial === 'object'){
      if(partial.mode === 'play' || partial.mode === 'listen') c.mode = partial.mode;
      if(['both','left','right'].indexOf(partial.hands) >= 0) c.hands = partial.hands;
      if(partial.assists && typeof partial.assists === 'object'){
        c.assists.keyNames = !!partial.assists.keyNames;
        c.assists.autoSlow = !!partial.assists.autoSlow;
        c.assists.autoShift = !!partial.assists.autoShift;
      }
      // saved custom presets: { name: [sliceList] }
      if(partial.presets && typeof partial.presets === 'object'){
        for(const name in partial.presets){
          const p = partial.presets[name];
          if(Array.isArray(p)) c.presets[name] = p;
          else if(p && Array.isArray(p.list)) c.presets[name] = p.list;
        }
      }
      // slices v2: an explicit list OR a legacy mapping marks the config 'custom'
      // (so preset resolution doesn't override it); a bare preset id selects a preset.
      const sl = (partial.slices && typeof partial.slices==='object') ? partial.slices : {};
      if(Array.isArray(sl.list) && sl.list.length){
        c.slices.list = sl.list;
        c.slices.preset = (typeof sl.preset==='string') ? sl.preset : 'custom';
      } else if(sl.mapping && typeof sl.mapping==='object'){
        c.slices.mapping = sl.mapping;
        c.slices.preset = (typeof sl.preset==='string') ? sl.preset : 'custom';
      } else if(typeof sl.preset==='string'){
        c.slices.preset = sl.preset;
      }
      // Auto-Shift may also come from slices.autoShift (docs/10), independent of assists
      if(sl.autoShift) c.assists.autoShift = true;
      if(partial.skin && typeof partial.skin === 'object'){
        if(partial.skin.colors && typeof partial.skin.colors === 'object') Object.assign(c.skin.colors, partial.skin.colors);
        if(partial.skin.background && typeof partial.skin.background === 'object') Object.assign(c.skin.background, partial.skin.background);
        // legacy {bg,left,right}
        if(partial.skin.right) c.skin.colors.primary = partial.skin.right;
        if(partial.skin.left)  c.skin.colors.secondary = partial.skin.left;
        if(partial.skin.bg)    c.skin.background = { mode:'color', asset:partial.skin.bg };
      }
    }
  } catch(e){ /* swallow */ }
  TKGConfig = c;
  applyConfig(c);
  return c;
}

// Push a validated config into the live runtime: slice tables, mode, assists, skin.
function applyConfig(c){
  try {
    // v2: build the authoritative slice list, then derive every runtime table from it.
    let slices = normalizeSlices(c);
    // legacy hands option: keep only the matching id when the shape is the two
    // legacy slices; ignore (with a warn) for genuinely custom lists.
    if(c.hands === 'left' || c.hands === 'right'){
      const isLegacyShape = slices.every(s => s.id==='left' || s.id==='right');
      if(isLegacyShape) slices = slices.filter(s => s.id === c.hands);
      else { try{ console.warn('TKG: hands="'+c.hands+'" ignored for a custom slice list'); }catch(_){ } }
    }
    if(!slices.length) slices = normalizeSlices({});        // never leave the runtime slice-less
    SLICES = slices;

    // KEY_SLICE / SHIFT_BY_CODE / CODE_TO_GAMEKEY — the v2 lookups (consumed in commit 2+).
    KEY_SLICE = {}; SHIFT_BY_CODE = {}; CODE_TO_GAMEKEY = {};
    for(const s of SLICES){
      for(const e of s.keys) KEY_SLICE[e.key] = s.id;
      const sk = s.shiftKeys || {};
      for(const code of (sk.up   || [])) SHIFT_BY_CODE[code] = { sliceId:s.id, dir:+1 };
      for(const code of (sk.down || [])) SHIFT_BY_CODE[code] = { sliceId:s.id, dir:-1 };
    }
    // physical-code -> note key legend (for robust e.code matching in input.js)
    for(const code in STD_CODE_LEGEND){
      const legend = STD_CODE_LEGEND[code];
      if(KEY_SLICE[legend] != null) CODE_TO_GAMEKEY[code] = legend;
    }

    // Legacy MAP/KEY_HAND kept in lock-step so untouched runtime/tests keep working
    // during the migration (commit 2 ports the readers to SLICES directly). Derive
    // the two-hand MAP from the left/right slices (or the two extremes by order).
    let lId = null, rId = null;
    if(SLICES.some(s=>s.id==='left'))  lId='left';
    if(SLICES.some(s=>s.id==='right')) rId='right';
    if(!lId && !rId && SLICES.length){
      const byOrder = [...SLICES].sort((a,b)=>a.order-b.order);
      lId = byOrder[0].id; rId = byOrder[byOrder.length-1].id;
    }
    const legacyOf = id => { const s = SLICES.find(x=>x.id===id); const o={};
      if(s) for(const e of s.keys) o[e.key]=e.off; return o; };
    let left  = lId ? legacyOf(lId) : {};
    let right = (rId && rId!==lId) ? legacyOf(rId) : {};
    MAP = { left, right };
    applyMapping();                       // rederive KEY_HAND / LKEYS / RKEYS

    if(typeof UI !== 'undefined'){
      UI.mode = c.mode;
      UI.keyNames = c.assists.keyNames;
      UI.autoSlow = c.assists.autoSlow;
      UI.autoShift = c.assists.autoShift;
    }
    if(typeof Transport !== 'undefined') Transport.autoSlow = c.assists.autoSlow;
    if(typeof Skin !== 'undefined'){ Skin.apply(c.skin); if(typeof Skin.applySliceVars==='function') Skin.applySliceVars(SLICES); if(typeof setBgMedia==='function') setBgMedia(Skin.bgImage, Skin.bgMode); }
    if(typeof syncAssistUI === 'function') syncAssistUI();   // reflect flags on the checkboxes
  } catch(e){ /* never throw from apply */ }
}

// Activate at boot. An exported file (see exportHTML in scripts/build.mjs) bakes a
// frozen config onto window.__TKG_CONFIG__; otherwise we use the built-in defaults
// (a no-op versus the standard game). This makes the runtime config-driven from frame 1.
loadConfig((typeof window !== 'undefined' && window.__TKG_CONFIG__) ? window.__TKG_CONFIG__ : DEFAULT_CONFIG);
