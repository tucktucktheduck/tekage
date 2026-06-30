/* ════════════════════════════════════════════════════════════
   9 · ProgressStore  (the Profile + swappable storage) — T23
   One interface, two adapters: an in-memory adapter (sandbox / when
   browser storage is unavailable) and a durable web-storage adapter
   (localStorage; survives reloads and works offline in an exported
   file). Nothing else in the app touches storage directly — settings
   and scores go through here (docs/01, 05). An IndexedDB adapter can
   drop in later behind the same {get,set} contract.
   ════════════════════════════════════════════════════════════ */

// --- adapters: a tiny synchronous string-keyed blob store ----------
function MemoryAdapter(){
  const m = new Map();
  return { name:'memory',
    get(k){ return m.has(k) ? m.get(k) : null; },
    set(k,v){ m.set(k,v); } };
}
function WebStorageAdapter(store){
  return { name:'web',
    get(k){ try { return store.getItem(k); } catch(e){ return null; } },
    set(k,v){ try { store.setItem(k,v); } catch(e){ /* quota/again: ignore */ } } };
}
// Pick durable storage when it actually works (a private-mode probe can throw),
// otherwise fall back to memory so the game never breaks on storage (docs/01).
function pickAdapter(){
  try {
    if(typeof window !== 'undefined' && window.localStorage){
      const t='__tkg_probe__'; window.localStorage.setItem(t,'1'); window.localStorage.removeItem(t);
      return WebStorageAdapter(window.localStorage);
    }
  } catch(e){ /* storage blocked */ }
  return MemoryAdapter();
}

const PROFILE_KEY = 'tkg.profile.v1';
function defaultProfile(){
  return {
    settings: { speed:1.0, vol:0.75, mode:'play', versionId:null,
                assists:{ keyNames:true, autoSlow:false, autoShift:false },
                skin:{ primary:'#ff8a2b', secondary:'#1a8fff', bg:'#05060a' },
                hideParseWarning:false },
    stars:  {},   // levelId -> best stars (0..5)
    best:   {},   // levelId -> best accuracy (0..1)
    onboarded: false,   // has the player seen the landing/walkthrough? (docs/08)
  };
}
function mergeProfile(loaded){
  const p = defaultProfile();
  if(loaded && typeof loaded==='object'){
    if(loaded.settings && typeof loaded.settings==='object'){
      const s=loaded.settings;
      if(typeof s.speed==='number') p.settings.speed=clamp(s.speed,0.25,1.25);
      if(typeof s.vol==='number')   p.settings.vol=clamp(s.vol,0,1);
      if(s.mode==='play'||s.mode==='listen') p.settings.mode=s.mode;
      if(typeof s.versionId==='string') p.settings.versionId=s.versionId;
      if(s.assists && typeof s.assists==='object'){
        p.settings.assists.keyNames=!!s.assists.keyNames;
        p.settings.assists.autoSlow=!!s.assists.autoSlow;
        p.settings.assists.autoShift=!!s.assists.autoShift;
      }
      if(s.skin && typeof s.skin==='object'){
        const hex=/^#[0-9a-fA-F]{6}$/;
        if(hex.test(s.skin.primary))   p.settings.skin.primary=s.skin.primary;
        if(hex.test(s.skin.secondary)) p.settings.skin.secondary=s.skin.secondary;
        if(hex.test(s.skin.bg))        p.settings.skin.bg=s.skin.bg;
      }
      p.settings.hideParseWarning = !!s.hideParseWarning;
    }
    if(loaded.stars && typeof loaded.stars==='object') p.stars=Object.assign({}, loaded.stars);
    if(loaded.best  && typeof loaded.best ==='object') p.best =Object.assign({}, loaded.best);
    p.onboarded = !!loaded.onboarded;
  }
  return p;
}

const ProgressStore = {
  adapter: null,
  profile: defaultProfile(),

  // (re)bind the adapter and read the stored Profile (validated). Never throws.
  load(adapter){
    this.adapter = adapter || this.adapter || pickAdapter();
    let raw=null; try { raw=this.adapter.get(PROFILE_KEY); } catch(e){}
    let parsed=null; try { parsed = raw ? JSON.parse(raw) : null; } catch(e){ parsed=null; }
    this.profile = mergeProfile(parsed);
    return this.profile;
  },
  save(){
    if(!this.adapter) this.adapter = pickAdapter();
    try { this.adapter.set(PROFILE_KEY, JSON.stringify(this.profile)); } catch(e){}
    return this.profile;
  },

  getSettings(){ return this.profile.settings; },
  saveSettings(partial){
    Object.assign(this.profile.settings, partial||{});
    return this.save();
  },

  // Record a song-end result; keeps only the player's BEST per level. Returns
  // {best, isBest} so the report can celebrate a new personal best.
  recordResult(levelId, accuracy, stars){
    if(!levelId) return { best:accuracy, isBest:false };
    const prev = this.profile.best[levelId];
    const isBest = (prev===undefined) || (accuracy > prev);
    if(isBest){
      this.profile.best[levelId] = accuracy;
      if(typeof stars==='number') this.profile.stars[levelId] = Math.max(stars, this.profile.stars[levelId]||0);
      this.save();
    }
    return { best: this.profile.best[levelId], isBest };
  },
  bestFor(levelId){ return levelId!=null ? this.profile.best[levelId] : undefined; },

  isOnboarded(){ return !!this.profile.onboarded; },
  markOnboarded(){ this.profile.onboarded = true; return this.save(); },

  // wipe the profile back to defaults (settings + best scores + onboarded flag)
  reset(){ this.profile = defaultProfile(); return this.save(); },
};
