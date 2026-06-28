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
  assists: { keyNames: true },
  slices: { mapping: null },    // null = built-in standard layout (BUILTIN_MAP)
  skin: { bg:'#05060a', left:'#1a8fff', right:'#ff8a2b' },
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
      if(partial.assists && typeof partial.assists === 'object') c.assists.keyNames = !!partial.assists.keyNames;
      if(partial.slices && partial.slices.mapping && typeof partial.slices.mapping === 'object') c.slices.mapping = partial.slices.mapping;
      if(partial.skin && typeof partial.skin === 'object') Object.assign(c.skin, partial.skin);
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
    }
  } catch(e){ /* never throw from apply */ }
}

// Activate defaults at boot — a no-op versus the built-in game, but it makes the
// runtime genuinely config-driven from the first frame.
loadConfig(DEFAULT_CONFIG);
