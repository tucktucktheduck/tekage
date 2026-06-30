/* ════════════════════════════════════════════════════════════
   8.5 · TKGConfig  +  loadConfig  (the single config object)
   One serializable object drives mapping / mode / assists / skin.
   loadConfig() validates a partial config, fills SAFE DEFAULTS, never
   throws on bad input, and applies the result to the runtime. The
   defaults reproduce the built-in game exactly. See docs/10.
   ════════════════════════════════════════════════════════════ */
const DEFAULT_CONFIG = {
  mode: 'play',                 // 'play' | 'listen'
  hands: 'both',                // 'both' | 'left' | 'right'
  assists: { keyNames: true, autoSlow: false, autoShift: false },
  slices: { mapping: null },    // null = built-in standard layout (BUILTIN_MAP)
  // skin colors drive ALL in-game color (docs/10). primary->right hand, secondary->left.
  skin: { colors:{ primary:'#ff8a2b', secondary:'#1a8fff' }, background:{ mode:'color', asset:'#05060a' } },
};

function _cfgClone(o){ try { return JSON.parse(JSON.stringify(o)); } catch(e){ return {}; } }

let TKGConfig = _cfgClone(DEFAULT_CONFIG);

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
      // Auto-Shift may also come from slices.autoShift (docs/10), independent of assists
      if(partial.slices && partial.slices.autoShift) c.assists.autoShift = true;
      if(partial.slices && partial.slices.mapping && typeof partial.slices.mapping === 'object') c.slices.mapping = partial.slices.mapping;
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

// Push a validated config into the live runtime: mapping tables, mode, assists.
function applyConfig(c){
  try {
    const m = (c.slices && c.slices.mapping) ? c.slices.mapping : BUILTIN_MAP;
    let left  = (m && typeof m.left  === 'object') ? m.left  : {};
    let right = (m && typeof m.right === 'object') ? m.right : {};
    if(c.hands === 'left')  right = {};
    if(c.hands === 'right') left  = {};
    MAP = { left: Object.assign({}, left), right: Object.assign({}, right) };
    applyMapping();                       // rederive KEY_HAND / LKEYS / RKEYS
    if(typeof UI !== 'undefined'){
      UI.mode = c.mode;
      UI.keyNames = c.assists.keyNames;
      UI.autoSlow = c.assists.autoSlow;
      UI.autoShift = c.assists.autoShift;
    }
    if(typeof Transport !== 'undefined') Transport.autoSlow = c.assists.autoSlow;
    if(typeof Skin !== 'undefined'){ Skin.apply(c.skin); if(typeof setBgMedia==='function') setBgMedia(Skin.bgImage, Skin.bgMode); }
    if(typeof syncAssistUI === 'function') syncAssistUI();   // reflect flags on the checkboxes
  } catch(e){ /* never throw from apply */ }
}

// Activate at boot. An exported file (see exportHTML in scripts/build.mjs) bakes a
// frozen config onto window.__TKG_CONFIG__; otherwise we use the built-in defaults
// (a no-op versus the standard game). This makes the runtime config-driven from frame 1.
loadConfig((typeof window !== 'undefined' && window.__TKG_CONFIG__) ? window.__TKG_CONFIG__ : DEFAULT_CONFIG);
