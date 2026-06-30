/* ════════════════════════════════════════════════════════════
   2.5 · SKIN  (config-driven colors — "skins are core") — T26
   Every in-game color reads from here, derived from the skin's
   primary/secondary colors + background (docs/00, DECISIONS, docs/10).
   The renderer never hard-codes a hand color, glow, hit-line, or
   backdrop — it reads Skin.HAND / Skin.bg, recomputed once whenever the
   skin changes (not per frame). Defaults reproduce the retro identity
   exactly, so the look is unchanged until the player customizes.
   primary -> right hand (the brand accent); secondary -> left hand.
   ════════════════════════════════════════════════════════════ */
const Skin = (()=>{
  const DEF = { primary:'#ff8a2b', secondary:'#1a8fff', bg:'#05060a' };

  function hexToRgb(h){
    let s=String(h||'').replace('#','').trim();
    if(s.length===3) s=s.split('').map(c=>c+c).join('');
    if(!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return { r:parseInt(s.slice(0,2),16), g:parseInt(s.slice(2,4),16), b:parseInt(s.slice(4,6),16) };
  }
  const _cl=v=>v<0?0:v>255?255:Math.round(v);
  function mix(c, t, amt){ return { r:_cl(c.r+(t.r-c.r)*amt), g:_cl(c.g+(t.g-c.g)*amt), b:_cl(c.b+(t.b-c.b)*amt) }; }
  const WHITE={r:255,g:255,b:255}, BLACK={r:0,g:0,b:0};
  const str=c=>`rgb(${c.r},${c.g},${c.b})`;
  const rgba=(c,a)=>`rgba(${c.r},${c.g},${c.b},${a})`;
  const lum=c=>(0.299*c.r+0.587*c.g+0.114*c.b)/255;

  // a full hand palette derived from one base color (everything the renderer needs)
  function palette(hex, fallback){
    const c = hexToRgb(hex) || hexToRgb(fallback);
    const bright = mix(c, WHITE, 0.32);
    return {
      hex: str(c), rgb: `${c.r},${c.g},${c.b}`,
      fill: str(c), fillBright: str(bright),
      glow: rgba(c,.55), glowBright: rgba(mix(c,WHITE,.3),.85),
      edge: str(mix(c, WHITE, 0.7)),
      ink:  lum(c) > 0.62 ? '#10131c' : '#fff',
      keyTop: str(mix(c, WHITE, 0.62)), keyBot: str(c),     // lit piano key gradient
      tint: rgba(c,.13),                                    // faint slice tint on a key
    };
  }

  const S = {
    primary: DEF.primary, secondary: DEF.secondary, bg: DEF.bg, bgImage: null, bgMode: 'color',
    HAND: { left: palette(DEF.secondary, DEF.secondary), right: palette(DEF.primary, DEF.primary) },

    // (re)derive the palette from a skin config fragment. Never throws.
    apply(skin){
      try {
        skin = skin || {};
        const colors = skin.colors || {};
        // accept docs/10 {colors:{primary,secondary},background:{...}} AND legacy {left,right,bg}
        this.primary   = colors.primary   || skin.right || DEF.primary;
        this.secondary = colors.secondary || skin.left  || DEF.secondary;
        const bgc = (skin.background && skin.background.mode==='color' && skin.background.asset)
                  || skin.bg || (colors.bg) || DEF.bg;
        this.bg = hexToRgb(bgc) ? bgc : DEF.bg;
        const bgm = skin.background && skin.background.mode;
        this.bgImage = (bgm && (bgm==='image'||bgm==='video') && skin.background.asset) || skin.bgImage || null;
        this.bgMode = this.bgImage ? ((bgm==='video') ? 'video' : 'image') : 'color';
        this.HAND.left  = palette(this.secondary, DEF.secondary);
        this.HAND.right = palette(this.primary,   DEF.primary);
      } catch(e){ /* keep last good palette */ }
      return this;
    },
    // current state as a config fragment (for persistence / export)
    toConfig(){ return { colors:{ primary:this.primary, secondary:this.secondary },
                         background: this.bgImage ? { mode:(this.bgMode==='video'?'video':'image'), asset:this.bgImage } : { mode:'color', asset:this.bg } }; },
    _hexToRgb: hexToRgb,
  };
  return S;
})();
