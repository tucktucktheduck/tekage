/* ════════════════════════════════════════════════════════════
   8 · UI STATE + WIRING
   ════════════════════════════════════════════════════════════ */
const UI = { mode:'play', keyNames:true, autoSlow:false, autoShift:false };

const $=id=>document.getElementById(id);
function setPlayBtn(p){ $('playBtn').textContent = p?'⏸ PAUSE':'▶ PLAY'; $('playBtn').classList.toggle('on',p); }

function flash(msg, big){
  const el=$('insight'); el.innerHTML=msg; el.classList.add('show');
  clearTimeout(flash._t); flash._t=setTimeout(()=>el.classList.remove('show'), big?4200:1800);
}

/* Difficulty / version buttons — built from the extractor's density-ranked
   versions. Pick one BEFORE you play; ranked sparsest→busiest so you can play
   the Core or step up to harder. */
function buildVersionButtons(){
  const row=$('verRow'); row.innerHTML='';
  for(const v of Song.versions){
    const b=document.createElement('button');
    b.className='tk ver'+(v===Song.version?' sel':'');
    b.dataset.id=v.id;
    // absolute difficulty stars from the multi-feature descriptor when available,
    // else the within-song density ranking (back-compat)
    const stars = (typeof v.stars==='number') ? v.stars : starsForDensity(v.density, Song.versions.map(x=>x.density));
    const starStr = String.fromCharCode(0x2605).repeat(stars) + String.fromCharCode(0x2606).repeat(5-stars);
    b.innerHTML=`<span class="vname">${v.name}</span><span class="vden">${v.density.toFixed(1)} n/s · ${v.notes.length}</span><span class="vstars">${starStr}</span>`;
    b.onclick=()=>{ if (Transport.playing) { flash('Pause to change difficulty'); return; } selectVersion(v.id); document.querySelectorAll('#verRow .ver').forEach(x=>x.classList.toggle('sel', x.dataset.id===v.id));
      persistSettings();
      flash(`<b>${v.name}</b> — ${v.density.toFixed(1)} notes/sec`); };
    row.appendChild(b);
  }
}

$('playBtn').onclick=()=>Transport.toggle();
$('restartBtn').onclick=()=>Transport.restart();
$('loadBtn').onclick=()=>$('fileInput').click();
$('fileInput').onchange=e=>{ const f=e.target.files[0]; if(f) loadFile(f); };
$('mapBtn').onclick=()=>MapView.toggle();
if($('libBtn')) $('libBtn').onclick=()=>{ try{ window.location.href='library.html'; }catch(e){} };

/* Teklet — the slide-in settings/skin console. Keeps the stage clear so the
   player's eyes stay on the falling notes + keys (docs/02, DECISIONS). */
const Teklet = {
  get open(){ const t=$('teklet'); return !!(t && t.classList.contains('open')); },
  show(){ const t=$('teklet'); if(t){ t.classList.add('open'); t.setAttribute('aria-hidden','false'); } },
  hide(){ const t=$('teklet'); if(t){ t.classList.remove('open'); t.setAttribute('aria-hidden','true'); } },
  toggle(){ this.open ? this.hide() : this.show(); },
};
if($('tekletBtn')) $('tekletBtn').onclick=()=>Teklet.toggle();
if($('tekletClose')) $('tekletClose').onclick=()=>Teklet.hide();

/* Tutorial replay (anytime) + reset progress. The tutorial button relaunches the
   Blurt walkthrough even after onboarding; reset wipes settings + best scores. */
function startTutorial(){ Teklet.hide(); if(typeof Onboarding!=='undefined') Onboarding.replay(); }

/* ── Layout preset picker (docs/14 §4.1) ─────────────────────────────
   Switch the whole keyboard layout live. Selecting a preset re-charts the
   loaded song for the new slices at the current difficulty ("mix it up and
   play"), redraws, and persists. buildPresetPicker() is called from the boot
   sequence (main.js) AFTER config.js has assigned TKGConfig. */
function liveConfig(){
  const c = (typeof TKGConfig!=='undefined') ? _cfgClone(TKGConfig) : {};
  if(typeof UI!=='undefined'){ c.mode=UI.mode; c.assists={ keyNames:UI.keyNames, autoSlow:UI.autoSlow, autoShift:UI.autoShift }; }
  if(typeof Skin!=='undefined' && Skin.toConfig) c.skin=Skin.toConfig();
  return c;
}
function applyLayout(sliceConfig, label){
  if(typeof Transport!=='undefined' && Transport.playing){ flash('Pause to change your layout'); return; }
  const c=liveConfig(); c.slices=sliceConfig;
  loadConfig(c);                                                       // rebuild SLICES + every lookup
  if(typeof Song!=='undefined' && Song.notes && Song.notes.length && typeof resolvePlan==='function') resolvePlan();  // re-chart at current difficulty
  if(typeof draw==='function') draw();
  syncPresetUI();
  persistSettings(true);                                               // deliberate action — save now
  if(label) flash('Layout: '+label+' · your chart re-mapped to these keys');
}
let _basePreset='standard';   // last non-custom preset (for the map editor's RESET)
function applyPreset(id){
  _basePreset=id;
  const p=(typeof SLICE_PRESETS!=='undefined')?SLICE_PRESETS[id]:null;
  applyLayout({ preset:id, list:null, mapping:null }, (p&&p.label)||id);
}

/* ── Map editing (docs/14 §4.3) — serialize the live slices back to a config
   list, tweak one key, re-apply as a 'custom' layout (re-charts + persists). */
function slicesToList(){
  if(typeof currentSlices!=='function') return [];
  return currentSlices().map(s=>{
    const o={ id:s.id, label:s.label, order:s.order, step:s.step,
      minAnchor:s.minAnchor, maxAnchor:s.maxAnchor,
      keys:Object.fromEntries(s.keys.map(k=>[k.key,k.off])) };
    if(s.initialAnchor!=null) o.initialAnchor=s.initialAnchor;
    if(s.color) o.color=s.color;
    if(s.shiftKeys && (s.shiftKeys.up||s.shiftKeys.down)) o.shiftKeys={ up:s.shiftKeys.up, down:s.shiftKeys.down };
    return o;
  });
}
function applyEditedList(list){
  // snapshot where the player has each slice positioned; a layout edit must not
  // teleport a slice they've shifted (resolvePlan re-seeds anchors from the plan).
  const saved = (typeof userAnchors!=='undefined' && userAnchors) ? Object.assign({}, userAnchors) : {};
  const c=liveConfig(); c.slices={ preset:'custom', list, mapping:null };
  loadConfig(c);
  if(typeof Song!=='undefined' && Song.notes && Song.notes.length && typeof resolvePlan==='function') resolvePlan();
  if(typeof userAnchors!=='undefined' && typeof currentSlices==='function'){
    for(const s of currentSlices()){ if(saved[s.id]!=null) userAnchors[s.id]=clamp(saved[s.id], s.minAnchor, s.maxAnchor); }
  }
  if(typeof draw==='function') draw();
  if(typeof syncPresetUI==='function') syncPresetUI();
  persistSettings(true);
  if(typeof MapView!=='undefined' && MapView.open) MapView.refresh();
}
function _anchorOfSlice(s, anchors){ const a=anchors&&anchors[s.id]; return (a!=null)?a:(s.initialAnchor!=null?s.initialAnchor:60); }
// Assign computer key `key` to sound `midi`. If `forceId` is given (a slice is
// "focused" in the manager), put it there; else the slice whose window covers the
// pitch (else its current slice / first). Offset = midi - that slice's anchor.
function remapKey(key, midi, forceId){
  if(typeof currentSlices!=='function') return;
  const anchors=(typeof currentAnchors==='function')?currentAnchors():{};
  const slices=currentSlices();
  let target = forceId ? slices.find(s=>s.id===forceId) : null;
  if(!target){
    for(const s of slices){ const offs=s.offs; if(!offs||!offs.length) continue;
      const a=_anchorOfSlice(s,anchors);
      if(midi>=a+offs[0] && midi<=a+offs[offs.length-1]){ target=s; break; } }
  }
  if(!target){ const cur=(typeof KEY_SLICE!=='undefined')?KEY_SLICE[key]:null; target=slices.find(s=>s.id===cur)||slices[0]; }
  if(!target) return;
  const off=midi - _anchorOfSlice(target,anchors);
  const list=slicesToList();
  for(const s of list){ if(s.keys && (key in s.keys)) delete s.keys[key]; }
  const tl=list.find(s=>s.id===target.id); if(!tl) return; tl.keys[key]=off;
  applyEditedList(list);
}

// Remove a computer key from the layout entirely (unmap it from every slice).
function unmapKey(key){
  const list=slicesToList(); let found=false;
  for(const s of list){ if(s.keys && (key in s.keys)){ delete s.keys[key]; found=true; } }
  if(found) applyEditedList(list);
  return found;
}

/* ── Slice manager ops (docs/14 §4.4-4.6). Each mutates the serialized list and
   re-applies it as a 'custom' layout via applyEditedList. ── */
function _uniqueSliceId(list){ let i=1, id; do{ id='s'+i++; }while(list.some(s=>s.id===id)); return id; }
function sliceSetProp(id, prop, value){
  const list=slicesToList(); const s=list.find(x=>x.id===id); if(!s) return;
  if(prop==='label') s.label=String(value).slice(0,2)||s.label;
  else if(prop==='step'){ const n=parseInt(value,10); if(Number.isFinite(n)&&n>=1) s.step=n; }
  else if(prop==='color'){ s.color=/^#[0-9a-f]{6}$/i.test(value)?value:s.color; }
  applyEditedList(list);
}
function sliceAdd(){
  const list=slicesToList(); const id=_uniqueSliceId(list);
  const maxOrder=list.reduce((m,s)=>Math.max(m, s.order||0), -1);
  list.push({ id, label:id.toUpperCase().slice(0,2), order:maxOrder+1, step:12,
    minAnchor:12, maxAnchor:96, initialAnchor:60, keys:{} });
  applyEditedList(list);
  return id;
}
function sliceDelete(id){
  const list=slicesToList();
  if(list.length<=1){ flash('A layout needs at least one slice'); return false; }
  const next=list.filter(s=>s.id!==id); applyEditedList(next); return true;
}
function sliceReorder(id, dir){
  const list=slicesToList().sort((a,b)=>(a.order||0)-(b.order||0));
  const i=list.findIndex(s=>s.id===id); const j=i+dir;
  if(i<0 || j<0 || j>=list.length) return;
  const t=list[i]; list[i]=list[j]; list[j]=t;
  list.forEach((s,k)=>{ s.order=k; });
  applyEditedList(list);
}
function sliceSetShift(id, dir, code){
  const list=slicesToList(); const s=list.find(x=>x.id===id); if(!s) return;
  s.shiftKeys=s.shiftKeys||{}; s.shiftKeys[dir]=[code];
  applyEditedList(list);
  // normalizeSlices strips a colliding/reserved shift key — warn if it didn't stick
  const applied=(typeof currentSlices==='function')?currentSlices().find(x=>x.id===id):null;
  const arr=applied && applied.shiftKeys ? applied.shiftKeys[dir] : null;
  if(!(Array.isArray(arr) && arr.includes(code)))
    flash('That key collides with a note key or is reserved — pick another');
}
// Save the current layout as a named preset (persists; appears in the picker).
function saveAsPreset(name){
  name=String(name||'').trim().slice(0,24);
  if(!name){ flash('Type a name for your layout first'); return false; }
  if(typeof TKGConfig==='undefined') return false;
  TKGConfig.presets=TKGConfig.presets||{};
  TKGConfig.presets[name]=slicesToList();
  _basePreset=name;
  // reload so this preset is the selected one, then persist + refresh the picker
  const c=liveConfig(); c.presets=TKGConfig.presets; c.slices={ preset:name, list:null, mapping:null };
  loadConfig(c);
  if(typeof Song!=='undefined' && Song.notes && Song.notes.length && typeof resolvePlan==='function') resolvePlan();
  persistSettings(true);
  if(typeof buildPresetPicker==='function') buildPresetPicker();
  if(typeof draw==='function') draw();
  flash('Saved layout: '+name);
  return true;
}
function buildPresetPicker(){
  const host=$('presetPicker'); if(!host) return;
  host.innerHTML='';
  const P=(typeof SLICE_PRESETS!=='undefined')?SLICE_PRESETS:{};
  for(const id of ['standard','keyboardgame']){
    const p=P[id]; if(!p) continue;
    const b=document.createElement('button'); b.className='tk preset'; b.dataset.preset=id;
    b.textContent=p.label||id; b.title='Switch to the '+(p.label||id)+' layout';
    b.onclick=()=>applyPreset(id); host.appendChild(b);
  }
  // user-saved named layouts (docs/14 §4.6)
  const saved=(typeof TKGConfig!=='undefined' && TKGConfig.presets) ? TKGConfig.presets : {};
  for(const name in saved){
    const b=document.createElement('button'); b.className='tk preset'; b.dataset.preset=name;
    b.textContent=name; b.title='Your saved layout: '+name;
    b.onclick=()=>applyPreset(name); host.appendChild(b);
  }
  // Legacy — reserved slot, disabled until the founder supplies the map (§3.3)
  const leg=document.createElement('button'); leg.className='tk preset'; leg.dataset.preset='legacy';
  leg.textContent='Legacy'; leg.disabled=true; leg.title='Legacy layout — upload pending'; host.appendChild(leg);
  syncPresetUI();
}
function syncPresetUI(){
  const sl=(typeof TKGConfig!=='undefined')?TKGConfig.slices:null;
  const active = sl ? (sl.list ? 'custom' : sl.preset) : 'standard';
  document.querySelectorAll('#presetPicker .preset').forEach(b=>b.classList.toggle('sel', b.dataset.preset===active));
}
if($('tutorialBtn'))  $('tutorialBtn').onclick=startTutorial;
if($('tutorialBtn2')) $('tutorialBtn2').onclick=startTutorial;
if($('resetBtn')) $('resetBtn').onclick=()=>{
  const ok = (typeof confirm==='function') ? confirm('Reset TKG? This erases your settings and best scores.') : true;
  if(!ok) return;
  if(typeof ProgressStore!=='undefined') ProgressStore.reset();
  if(typeof location!=='undefined' && location.reload) location.reload();
};
/* Fresh start (factory reset): erase EVERY TKG key on this device so nothing about
   the player survives — not just overwrite the profile — then hard-reload to the
   first-run landing (onboarded resets to false). Wrapped so blocked storage can't
   throw; if storage is unavailable the profile only lived in memory anyway and the
   reload clears it. */
if($('freshBtn')) $('freshBtn').onclick=()=>{
  const ok = (typeof confirm==='function') ? confirm('Erase ALL TKG memory on this device?\n\nThis wipes your settings, colors, best scores, and progress. The game will load as if you had never played it. This cannot be undone.') : true;
  if(!ok) return;
  try{
    if(typeof ProgressStore!=='undefined') ProgressStore.reset();
    if(typeof localStorage!=='undefined'){
      for(const k of Object.keys(localStorage)){ if(k.indexOf('tkg.')===0) localStorage.removeItem(k); }
    }
    if(typeof sessionStorage!=='undefined'){
      for(const k of Object.keys(sessionStorage)){ if(k.indexOf('tkg.')===0) sessionStorage.removeItem(k); }
    }
  }catch(e){}
  if(typeof location!=='undefined' && location.reload) location.reload();
};

/* Song library menu (T24): the built-in starter songs + the demo, so you can
   "pick a song and play" without owning a MIDI. Upload still lives on LOAD MIDI. */
function buildSongMenu(){
  const sel=$('songSel'); if(!sel) return;
  let html=`<option value="__demo">DEMO · First Light</option>`;
  if(typeof LIBRARY!=='undefined'){
    html+=`<optgroup label="Beginner">`;
    for(const s of LIBRARY) html+=`<option value="${s.id}">${s.title}</option>`;
    html+=`</optgroup>`;
  }
  const baked = (typeof bakedSongs==='function') ? bakedSongs() : [];
  if(baked.length){
    html+=`<optgroup label="Famous">`;
    for(const s of baked) html+=`<option value="baked:${s.id}">${s.title}</option>`;
    html+=`</optgroup>`;
  }
  sel.innerHTML=html;
  sel.onchange=()=>{ const v=sel.value;
    if(v==='__demo') loadDemo();
    else if(v.indexOf('baked:')===0) loadBakedSong(v.slice(6));
    else loadLibrarySong(v); };
}
function loadLibrarySong(id){
  const spec=typeof songById==='function' ? songById(id) : null;
  const parsed=typeof buildLibraryById==='function' ? buildLibraryById(id) : null;
  if(!spec || !parsed){ loadDemo(); return; }
  Transport.pause(); Transport.seek(0);
  if(typeof Score!=='undefined') Score.stop();
  if(typeof hideReport==='function') hideReport();
  analyze(parsed, spec.title);
  $('songName').textContent=spec.title + (spec.tag? '  ·  '+spec.tag : '');
  buildVersionButtons();
  draw();
  flash(`<b>${spec.title}</b> loaded · pick a difficulty · press the falling letters`, true);
}

document.querySelectorAll('#modeSeg button').forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll('#modeSeg button').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel'); UI.mode=b.dataset.mode;
    if(UI.mode==='play'){
      seedUserSlice(Transport.songTime);
      // Entering PLAY while the transport is already running (e.g. straight from
      // LISTEN) must start a scored run — otherwise Score.on stays false and the
      // Auto-Slow gate (which needs it) silently never engages.
      if(Transport.playing && typeof Score!=='undefined'){ Score.reset(); Transport.waiting=false; Transport._gatePtr=0; }
    }
    else { Score.stop(); hideReport(); Transport.seek(0); Transport.play(); }   // LISTEN: auto-play the whole song from the start (not a scored run)
    persistSettings();
    flash(UI.mode==='play'?'PLAY MODE · press the keys shown · move your slices with Tab / ⇧ (left) and ⏎ / ⇧ (right)':'LISTEN MODE · sit back — the whole song plays and the slices glide'); };
});

/* ── End-of-song report (T20) ─────────────────────────────────
   Accuracy = notes hit / notes that fell, with tier + timing tips.
   The note is the star on the stage; this is the after-the-fact card. */
function hideReport(){ const el=document.getElementById('reportCard'); if(el) el.style.display='none'; }
function showReport(s){
  let el=document.getElementById('reportCard');
  if(!el){
    el=document.createElement('div'); el.id='reportCard';
    el.style.cssText='position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;'
      +'background:rgba(3,6,12,.72);backdrop-filter:blur(3px);font-family:Orbitron,sans-serif';
    document.body.appendChild(el);
  }
  const pct=Math.round((s.accuracy||0)*100);
  const ring=pct>=85?'#5af0aa':pct>=60?'#5ab8ff':'#ff8a2b';
  // persist + celebrate a personal best for this song×difficulty (T23)
  let bestBadge='';
  if(typeof ProgressStore!=='undefined'){
    const r=ProgressStore.recordResult(levelId(), s.accuracy||0, s.perfect+s.good+s.okay?undefined:undefined);
    if(r.isBest) bestBadge=`<div style="margin-top:8px;font-size:11px;letter-spacing:2px;color:#5af0aa">★ NEW BEST</div>`;
    else bestBadge=`<div style="margin-top:8px;font-size:11px;letter-spacing:1px;color:#7f93b0">BEST ${Math.round((r.best||0)*100)}%</div>`;
  }
  const tips=[];
  if(s.tooLate)       tips.push(s.tooLate+' too late');
  if(s.heldTooLong)   tips.push(s.heldTooLong+' held too long');
  if(s.releasedEarly) tips.push(s.releasedEarly+' released early');
  const tierRow=(label,val,col)=>`<div style="display:flex;justify-content:space-between;gap:18px;font-size:12px;margin:3px 0">`
    +`<span style="color:${col}">${label}</span><span style="color:#dfe8f4">${val}</span></div>`;
  el.innerHTML=
    `<div style="background:#0b1220;border:1px solid #1d2b44;border-radius:16px;padding:26px 30px;min-width:300px;box-shadow:0 18px 60px #000a;text-align:center">`
    + `<div style="font-size:12px;letter-spacing:3px;color:#7f93b0">SONG COMPLETE</div>`
    + `<div style="margin:16px auto;width:128px;height:128px;border-radius:50%;`
    +   `background:conic-gradient(${ring} ${pct*3.6}deg,#15203400 0);display:flex;align-items:center;justify-content:center">`
    +   `<div style="width:104px;height:104px;border-radius:50%;background:#0b1220;display:flex;flex-direction:column;align-items:center;justify-content:center">`
    +     `<div style="font-size:30px;color:${ring};font-weight:700">${pct}%</div>`
    +     `<div style="font-size:10px;letter-spacing:2px;color:#7f93b0">${s.hit}/${s.fell} HIT</div></div></div>`
    + bestBadge
    + tierRow('PERFECT', s.perfect, '#5af0aa')
    + tierRow('GOOD',    s.good,    '#5ab8ff')
    + tierRow('OKAY',    s.okay,    '#ffc85a')
    + tierRow('MISS',    s.miss,    '#ff6a6a')
    + (tips.length?`<div style="margin-top:12px;font-size:11px;color:#9fb0c8;line-height:1.5">${tips.join(' · ')}</div>`:'')
    + `<div style="margin-top:18px;display:flex;gap:10px;justify-content:center">`
    +   `<button id="repAgain" style="cursor:pointer;border:0;border-radius:8px;padding:9px 16px;font-weight:700;background:#ff8a2b;color:#1a0e02">PLAY AGAIN</button>`
    +   `<button id="repClose" style="cursor:pointer;border:1px solid #2a3a55;border-radius:8px;padding:9px 16px;background:#10192b;color:#cdd9ea">CLOSE</button>`
    + `</div></div>`;
  el.style.display='flex';
  el.querySelector('#repClose').onclick=hideReport;
  el.querySelector('#repAgain').onclick=()=>{ hideReport(); Transport.restart(); Transport.play(); };
}

const speedEl=$('speed');
speedEl.oninput=()=>{ const r=speedEl.value/100; Transport.targetRate=r;   // SPEED sets the TARGET; _tick drives the effective rate (Auto-Slow composes on top)
  if(Transport.playing && !Transport.autoSlow){ Transport.anchorSong=Transport.songTime; Transport.anchorCtx=Audio.now(); Transport.rate=r; }
  $('speedVal').textContent=r.toFixed(2)+'×'; persistSettings(); };
$('vol').oninput=()=>{ Audio.setVolume($('vol').value/100); persistSettings(); };
$('namesChk').onchange=()=>{ UI.keyNames=$('namesChk').checked; persistSettings(); };

/* Assist toggles (T21 Auto-Slow, T22 Auto-Shift). Config flags too, so they bake
   into an exported HTML. syncAssistUI reflects current flags onto the checkboxes
   (used when a baked config loads). */
function syncAssistUI(){
  const sc=$('slowChk'), sh=$('shiftChk');
  if(sc) sc.checked=!!UI.autoSlow;
  if(sh) sh.checked=!!UI.autoShift;
}

/* Persist player settings through ProgressStore (T23). Debounced so dragging a
   slider doesn't hammer storage. Never persists for a baked export (its config
   defines the intended experience). */
let _persistT=null;
function _settingsSnapshot(){
  return {
    speed: Transport.targetRate,
    vol: (parseFloat($('vol').value)||75)/100,
    mode: UI.mode,
    versionId: Song.version ? Song.version.id : null,
    assists: { keyNames:UI.keyNames, autoSlow:UI.autoSlow, autoShift:UI.autoShift },
    voice: (typeof Audio!=='undefined' && Audio.currentVoice) ? Audio.currentVoice() : undefined,
    skin: (typeof Skin!=='undefined') ? { primary:_hex6(Skin.primary,'#ff8a2b'), secondary:_hex6(Skin.secondary,'#1a8fff'), bg:_hex6(Skin.bg,'#05060a') } : undefined,
    slices: (typeof TKGConfig!=='undefined' && TKGConfig.slices) ? { preset:TKGConfig.slices.preset||'standard', list:TKGConfig.slices.list||null } : undefined,
    presets: (typeof TKGConfig!=='undefined' && TKGConfig.presets) ? TKGConfig.presets : undefined,
  };
}
// Debounced by default (slider drags). Pass true to flush NOW — deliberate,
// infrequent actions (like switching layout) must survive an immediate reload.
function persistSettings(immediate){
  if(typeof ProgressStore==='undefined') return;
  if(typeof window!=='undefined' && window.__TKG_CONFIG__) return;
  clearTimeout(_persistT);
  if(immediate){ ProgressStore.saveSettings(_settingsSnapshot()); return; }
  _persistT=setTimeout(()=>ProgressStore.saveSettings(_settingsSnapshot()), 250);
}
/* Restore persisted settings onto the live controls at boot (standard game only). */
function applyPersistedSettings(){
  if(typeof ProgressStore==='undefined') return;
  if(typeof window!=='undefined' && window.__TKG_CONFIG__) return;
  const s=ProgressStore.getSettings();
  Transport.targetRate=s.speed; const sp=$('speed'); if(sp){ sp.value=Math.round(s.speed*100); }
  const sv=$('speedVal'); if(sv) sv.textContent=s.speed.toFixed(2)+'×';
  const vl=$('vol'); if(vl) vl.value=Math.round(s.vol*100); Audio.setVolume(s.vol);
  UI.keyNames=s.assists.keyNames; UI.autoSlow=s.assists.autoSlow; UI.autoShift=s.assists.autoShift;
  Transport.autoSlow=UI.autoSlow;
  const nc=$('namesChk'); if(nc) nc.checked=UI.keyNames;
  if(s.voice && typeof Audio!=='undefined' && Audio.setVoice && Audio.setVoice(s.voice)) setActiveVoice(s.voice);
  syncAssistUI();
  if(typeof Skin!=='undefined' && s.skin){
    Skin.apply({ colors:{ primary:s.skin.primary, secondary:s.skin.secondary }, background:{ mode:'color', asset:s.skin.bg } });
    if(typeof TKGConfig!=='undefined') TKGConfig.skin=Skin.toConfig();
    syncSkinUI();
  }
  // restore saved presets + a non-default keyboard layout BEFORE the version re-chart
  const hasSavedPresets = s.presets && typeof s.presets==='object' && Object.keys(s.presets).length;
  const hasCustomLayout = s.slices && (Array.isArray(s.slices.list) || (s.slices.preset && s.slices.preset!=='standard'));
  if(hasSavedPresets || hasCustomLayout){
    const c=liveConfig();
    if(hasSavedPresets) c.presets=s.presets;
    if(hasCustomLayout) c.slices={ preset:s.slices.preset||'custom', list:s.slices.list||null, mapping:null };
    loadConfig(c);
    if(Song.notes && Song.notes.length && typeof resolvePlan==='function') resolvePlan();
  }
  if(typeof buildPresetPicker==='function') buildPresetPicker();   // include restored saved presets
  if(typeof syncPresetUI==='function') syncPresetUI();
  if(s.versionId && Song.versions.some(v=>v.id===s.versionId)){
    selectVersion(s.versionId);
    document.querySelectorAll('#verRow .ver').forEach(x=>x.classList.toggle('sel', x.dataset.id===s.versionId));
  }
  // NB: mode is intentionally left at PLAY on boot (restoring LISTEN would auto-play).
}
/* Stable identity for "this song at this difficulty" = the score's level key. */
function levelId(){
  const t=(Song.title||'demo');
  const v=Song.version ? Song.version.id : 'full';
  return t+'#'+Song.notes.length+'x'+Math.round(Song.duration||0)+'#'+v;
}
if($('slowChk')) $('slowChk').onchange=()=>{ UI.autoSlow=$('slowChk').checked; Transport.autoSlow=UI.autoSlow;
  if(!UI.autoSlow){ Transport.waiting=false; }
  persistSettings();
  flash(UI.autoSlow?'AUTO-SLOW on · plays full speed — waits at a note only if you’re late':'Auto-Slow off'); };
if($('shiftChk')) $('shiftChk').onchange=()=>{ UI.autoShift=$('shiftChk').checked;
  persistSettings();
  flash(UI.autoShift?'AUTO-SHIFT on · the engine moves your hands — just press the keys':'Auto-Shift off · you move your slices with Tab / ⏎'); };

/* Skin controls (T26) — primary/secondary colors + background drive every in-game
   color through Skin; changes apply live, persist, and bake into an export. */
function applySkinFromControls(){
  if(typeof Skin==='undefined') return;
  Skin.primary   = $('skinPrimary')   ? $('skinPrimary').value   : Skin.primary;
  Skin.secondary = $('skinSecondary') ? $('skinSecondary').value : Skin.secondary;
  Skin.bg        = $('skinBg')        ? $('skinBg').value        : Skin.bg;
  Skin.apply({ colors:{ primary:Skin.primary, secondary:Skin.secondary },
               background: Skin.bgImage ? { mode:'image', asset:Skin.bgImage } : { mode:'color', asset:Skin.bg } });
  if(typeof TKGConfig!=='undefined') TKGConfig.skin = Skin.toConfig();
  draw(); persistSettings();
}
['skinPrimary','skinSecondary','skinBg'].forEach(id=>{ if($(id)) $(id).oninput=applySkinFromControls; });
if($('bgImgBtn')) $('bgImgBtn').onclick=()=>$('bgImgInput') && $('bgImgInput').click();
if($('bgImgInput')) $('bgImgInput').onchange=e=>{
  const f=e.target.files && e.target.files[0]; if(!f) return;
  const kind = (f.type && f.type.indexOf('video/')===0) ? 'video' : 'image';
  // object URL = instant + cheap (a video data-URL would be huge). Session-only.
  const src = (typeof URL!=='undefined' && URL.createObjectURL) ? URL.createObjectURL(f) : null;
  if(!src) return;
  Skin.bgImage=src; Skin.bgMode=kind;
  if(typeof setBgMedia==='function') setBgMedia(src, kind);
  Skin.apply({ colors:{primary:Skin.primary,secondary:Skin.secondary}, background:{mode:kind,asset:src} });
  draw();
  flash(kind==='video' ? 'Background video set · loops behind your notes · skins never affect gameplay'
                        : 'Background image set · skins never affect gameplay');
};
/* Instrument (SF2 SoundFont) — load a sampled piano as the voice. Session-only
   (soundfonts are far too big for storage); reverts to the synth on reload. */
function setSf2UI(name){
  const hint=$('sf2Hint'), reset=$('synthBtn');
  if(name){ if(hint) hint.textContent='Instrument: '+name+' (sampled · session only)'; if(reset) reset.style.display=''; }
  else { if(hint) hint.textContent='Built-in synth. Load an .sf2 soundfont for a sampled piano (session only).'; if(reset) reset.style.display='none'; }
}
if($('sf2Btn'))  $('sf2Btn').onclick=()=>$('sf2Input') && $('sf2Input').click();
if($('synthBtn'))$('synthBtn').onclick=()=>{ if(typeof Audio!=='undefined') Audio.useSynth(); setSf2UI(null); flash('Back to the built-in synth'); };

/* Core piano voice picker — swaps the built-in synth timbre (Grand/Bright/Mellow).
   Choosing a voice also drops any loaded SF2 back to the synth (the picker only
   drives the built-in piano). Persisted so it survives a reload. */
function setActiveVoice(key){
  document.querySelectorAll('.voiceBtn').forEach(b=>b.classList.toggle('on', b.dataset.voice===key));
}
document.querySelectorAll('.voiceBtn').forEach(b=> b.onclick=()=>{
  const key=b.dataset.voice; if(typeof Audio==='undefined') return;
  if(Audio.instrumentName && Audio.instrumentName()){ Audio.useSynth(); setSf2UI(null); }
  const name=Audio.setVoice(key); if(!name) return;
  setActiveVoice(key); persistSettings(true); flash('Piano voice: '+name);
});
if($('sf2Input')) $('sf2Input').onchange=e=>{
  const f=e.target.files && e.target.files[0]; if(!f) return;
  flash('Reading '+f.name+' …');
  const rd=new FileReader();
  rd.onload=()=>{ let name=null; try{ name=Audio.loadSoundfont(rd.result); }catch(err){ name=null; }
    if(name){ setSf2UI(name); flash('Piano loaded: '+name+' · sampled instrument (session only)'); }
    else flash('Could not read that .sf2 · keeping the built-in synth'); };
  rd.onerror=()=>flash('Could not read that file');
  rd.readAsArrayBuffer(f);
  e.target.value='';
};

function syncSkinUI(){
  if(typeof Skin==='undefined') return;
  if($('skinPrimary'))   $('skinPrimary').value   = _hex6(Skin.primary,   '#ff8a2b');
  if($('skinSecondary')) $('skinSecondary').value = _hex6(Skin.secondary, '#1a8fff');
  if($('skinBg'))        $('skinBg').value        = _hex6(Skin.bg,        '#05060a');
}
// <input type=color> requires a #rrggbb value
function _hex6(v, fallback){
  const rgb = (Skin && Skin._hexToRgb) ? Skin._hexToRgb(v) : null;
  if(!rgb) return fallback;
  const h=n=>n.toString(16).padStart(2,'0');
  return '#'+h(rgb.r)+h(rgb.g)+h(rgb.b);
}
syncAssistUI();

/* Slice being "focused" in the manager (new key clicks land here) + a pending
   shift-key capture. The capture listener runs in the CAPTURE phase so it beats
   the game's own keydown, and swallows the next key as that slice's shift key. */
let _focusedSlice=null, _shiftCapture=null;
function captureShift(sliceId, dir, btn){ _shiftCapture={sliceId,dir}; if(btn) btn.classList.add('capturing');
  flash('Press a key to shift "'+sliceId+'" '+dir+' · Esc to cancel'); }
window.addEventListener('keydown', e=>{
  if(!_shiftCapture) return;
  e.preventDefault(); e.stopPropagation();
  const cap=_shiftCapture; _shiftCapture=null;
  if(e.code!=='Escape') sliceSetShift(cap.sliceId, cap.dir, e.code);
  if(typeof MapView!=='undefined' && MapView.open) MapView.refresh();
}, true);

/* Slice manager rows (docs/14 §4.4): focus · info · step · color · shift-up/down
   capture · reorder · delete. Rebuilt with the map on every edit. */
function renderSliceList(){
  const host=$('sliceList'); if(!host) return; host.innerHTML='';
  const slices=(typeof currentSlices==='function')?currentSlices().slice().sort((a,b)=>(a.order||0)-(b.order||0)):[];
  const anchors=(typeof currentAnchors==='function')?currentAnchors():{};
  slices.forEach((s,idx)=>{
    const p=(typeof Skin!=='undefined'&&Skin.sliceColor)?Skin.sliceColor(s):null;
    const row=document.createElement('div'); row.className='sliceRow'+(_focusedSlice===s.id?' focus':'');
    if(p) row.style.setProperty('--sc', p.fill);
    const tag=document.createElement('button'); tag.className='sliceTag'; tag.textContent=s.label||s.id;
    tag.title='Focus — new key clicks go to this slice'; tag.onclick=()=>{ _focusedSlice=(_focusedSlice===s.id?null:s.id); renderSliceList(); };
    row.appendChild(tag);
    const a=_anchorOfSlice(s,anchors);
    const span = (s.offs&&s.offs.length) ? (noteName(a+s.offs[0])+octaveOf(a+s.offs[0])+'-'+noteName(a+s.offs[s.offs.length-1])+octaveOf(a+s.offs[s.offs.length-1])) : 'empty';
    const info=document.createElement('span'); info.className='sliceInfo'; info.textContent=s.keys.length+' keys · '+span; row.appendChild(info);
    const step=document.createElement('input'); step.type='number'; step.min='1'; step.max='24'; step.value=s.step; step.className='sliceStep';
    step.title='Shift step in SEMITONES — how far each shift moves this slice (1 = one semitone, 12 = an octave). The whole slice moves together; every key keeps its assignment.';
    step.onchange=()=>sliceSetProp(s.id,'step',parseInt(step.value,10)||1); row.appendChild(step);
    const unit=document.createElement('span'); unit.className='sliceUnit'; unit.textContent='st'; row.appendChild(unit);
    const col=document.createElement('input'); col.type='color'; col.className='sliceColor'; col.value=(p?_hex6(p.hex,'#1a8fff'):'#1a8fff'); col.title='Slice color';
    col.oninput=()=>sliceSetProp(s.id,'color',col.value); row.appendChild(col);
    const shLbl=arr=> Array.isArray(arr)&&arr.length ? arr.map(codeLabel).join('/') : (arr?codeLabel(arr):'—');
    const su=document.createElement('button'); su.className='tk sliceShift'; su.textContent='↑'+shLbl(s.shiftKeys&&s.shiftKeys.up); su.title='Set the shift-UP key';
    su.onclick=()=>captureShift(s.id,'up',su); row.appendChild(su);
    const sd=document.createElement('button'); sd.className='tk sliceShift'; sd.textContent='↓'+shLbl(s.shiftKeys&&s.shiftKeys.down); sd.title='Set the shift-DOWN key';
    sd.onclick=()=>captureShift(s.id,'down',sd); row.appendChild(sd);
    const up=document.createElement('button'); up.className='tk sliceMini'; up.textContent='▲'; up.disabled=idx===0; up.onclick=()=>sliceReorder(s.id,-1); row.appendChild(up);
    const dn=document.createElement('button'); dn.className='tk sliceMini'; dn.textContent='▼'; dn.disabled=idx===slices.length-1; dn.onclick=()=>sliceReorder(s.id,1); row.appendChild(dn);
    const del=document.createElement('button'); del.className='tk sliceMini'; del.textContent='✕'; del.title='Delete slice'; del.onclick=()=>{ if(sliceDelete(s.id) && _focusedSlice===s.id) _focusedSlice=null; }; row.appendChild(del);
    host.appendChild(row);
  });
}

/* ── Keyboard-map viewer ──────────────────────────────────────
   Computer keyboard on top, piano beneath. Mapped keys are fully
   opaque & slice-coloured; unmapped keys are dimmed. Press a letter
   and it lights BOTH the letter and its piano key. EDIT mode remaps;
   the slice manager below adds/edits/saves layouts. */
const MapView = (()=>{
  // full keyboard so every layout (incl. the versell number-row + punctuation keys) renders
  const KB_ROWS = [
    ['`','1','2','3','4','5','6','7','8','9','0','-','='],
    ['q','w','e','r','t','y','u','i','o','p','[',']','\\'],
    ['a','s','d','f','g','h','j','k','l',';',"'"],
    ['z','x','c','v','b','n','m',',','.','/'],
  ];
  const LABELS={ '`':'`','-':'-','=':'=','[':'[',']':']','\\':'\\',';':';',"'":"'",',':',','.':'.','/':'/'};
  let linesOn=false, editMode=false, armed=null;
  const keyCell=new Map();   // legend -> element
  const pianoCell=new Map(); // midi -> element
  const palOf = id => { const s=(typeof currentSlices==='function')?currentSlices().find(x=>x.id===id):null;
    return (s && typeof Skin!=='undefined' && Skin.sliceColor)?Skin.sliceColor(s):null; };

  function build(){
    const kb=$('mapKb'); if(!kb) return; kb.innerHTML=''; keyCell.clear();
    for(const row of KB_ROWS){
      const r=document.createElement('div'); r.className='mapRow';
      for(const k of row){
        const c=document.createElement('div');
        const sid=(typeof KEY_SLICE!=='undefined')?KEY_SLICE[k]:null;
        c.className='mapKey'+(sid?' mapped':' dim');
        if(sid){ const p=palOf(sid); if(p) c.style.setProperty('--sc', p.fill); }
        c.textContent = LABELS[k]||k.toUpperCase();
        c.dataset.k=k; c.onclick=()=>onKey(k);
        keyCell.set(k,c); r.appendChild(c);
      }
      kb.appendChild(r);
    }
  }
  function windowAndSlices(){
    const slices=(typeof currentSlices==='function')?currentSlices():[];
    const anchors=(typeof currentAnchors==='function')?currentAnchors():{};
    // Show the WHOLE 88-key piano (A0..C8) so any computer key can be remapped to
    // ANY note. The slices are tinted in place so you still see their ranges.
    return { lo:21, hi:108, slices, anchors };
  }
  function sliceAtMidi(m, slices, anchors){
    for(const s of slices){ if(!s.offs||!s.offs.length) continue; const a=_anchorOfSlice(s,anchors);
      if(m>=a+s.offs[0] && m<=a+s.offs[s.offs.length-1]) return s; }
    return null;
  }
  // which computer key(s) play each midi note, at the current anchors — so we can
  // print the key legend right on the piano note it maps to (clarity, founder ask).
  function legendMap(slices, anchors){
    const map={};
    for(const s of slices){ const a=_anchorOfSlice(s,anchors);
      for(const e of s.keys){ const m=a+e.off; if(m<21||m>108) continue;
        (map[m]=map[m]||[]).push(LABELS[e.key]||e.key.toUpperCase()); } }
    return map;
  }
  function buildPiano(){
    const pno=$('mapPiano'); if(!pno) return; pno.innerHTML=''; pianoCell.clear();
    const {lo,hi,slices,anchors}=windowAndSlices();
    const legend=legendMap(slices,anchors);
    const addLegend=(el,m)=>{ if(legend[m]){ const lg=document.createElement('span'); lg.className='mapKeyLegend'; lg.textContent=legend[m].join(' '); el.appendChild(lg); } };
    const whites=[]; for(let m=lo;m<=hi;m++){ if(![1,3,6,8,10].includes(m%12)) whites.push(m); }
    const wW=100/Math.max(1,whites.length);
    whites.forEach((m,idx)=>{
      const el=document.createElement('div'); el.className='mapWhite';
      const s=sliceAtMidi(m,slices,anchors), p=s?palOf(s.id):null;
      if(p) el.style.background='linear-gradient(180deg,'+p.keyTop+','+p.fill+')'; else el.classList.add('dim');
      el.style.left=(idx*wW)+'%'; el.style.width=wW+'%';
      const nn=document.createElement('span'); nn.className='mapNote'; nn.textContent=noteName(m)+(noteName(m)==='C'?octaveOf(m):''); el.appendChild(nn);
      addLegend(el,m);
      el.dataset.m=m; el.onclick=()=>onPiano(m);
      pno.appendChild(el); pianoCell.set(m,el);
    });
    for(let m=lo;m<=hi;m++){ if(![1,3,6,8,10].includes(m%12)) continue;
      const wi=whites.indexOf(m-1); if(wi<0) continue;
      const el=document.createElement('div'); el.className='mapBlack';
      const s=sliceAtMidi(m,slices,anchors), p=s?palOf(s.id):null;
      if(p) el.style.background='linear-gradient(180deg,'+p.fillBright+','+p.fill+')'; else el.classList.add('dim');
      el.style.left=((wi+1)*wW - wW*0.3)+'%'; el.style.width=(wW*0.6)+'%';
      const nn=document.createElement('span'); nn.className='mapNote'; nn.textContent=noteName(m); el.appendChild(nn);
      addLegend(el,m);
      el.dataset.m=m; el.onclick=()=>onPiano(m);
      pno.appendChild(el); pianoCell.set(m,el);
    }
    drawLines();
  }
  function drawLines(){
    const svg=$('mapSvg'); if(!svg) return; svg.innerHTML=''; if(!linesOn) return;
    const host=$('mapBody').getBoundingClientRect();
    svg.setAttribute('viewBox',`0 0 ${host.width} ${host.height}`);
    for(const [k,cell] of keyCell){
      const sid=(typeof KEY_SLICE!=='undefined')?KEY_SLICE[k]:null; if(!sid) continue;
      const r=(typeof midiForGameKey==='function')?midiForGameKey(k):null; if(!r) continue;
      const pc=pianoCell.get(r.midi); if(!pc) continue;
      const a=cell.getBoundingClientRect(), b=pc.getBoundingClientRect();
      const p=palOf(sid);
      const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
      ln.setAttribute('x1',a.left+a.width/2-host.left);ln.setAttribute('y1',a.bottom-host.top);
      ln.setAttribute('x2',b.left+b.width/2-host.left);ln.setAttribute('y2',b.top-host.top);
      ln.setAttribute('stroke', p?p.glow:'rgba(180,190,210,.5)'); ln.setAttribute('stroke-width','1.5'); svg.appendChild(ln);
    }
  }
  function light(k,midi,on){ const c=keyCell.get(k); if(c) c.classList.toggle('lit',on);
    const p=pianoCell.get(midi); if(p) p.classList.toggle('lit',on); }

  function disarm(){ if(armed){ const c=keyCell.get(armed); if(c) c.classList.remove('armed'); } armed=null; }
  function onKey(k){ if(!editMode) return; if(armed===k){ disarm(); setHint(); return; }
    disarm(); armed=k; const c=keyCell.get(k); if(c) c.classList.add('armed'); setHint(); }
  function onPiano(m){ if(!editMode || !armed) return; const k=armed; disarm();
    remapKey(k,m,_focusedSlice); setHint(); flash('Mapped '+(LABELS[k]||k.toUpperCase())+' -> '+noteName(m)+octaveOf(m)); }
  function unmapArmed(){ if(!armed){ flash('Arm a key first (click it), then UNMAP'); return; }
    const k=armed; disarm(); if(unmapKey(k)) flash('Unmapped '+(LABELS[k]||k.toUpperCase())); setHint(); }
  function setHint(){ const h=$('mapHint'); if(!h) return;
    h.textContent = editMode
      ? (armed ? 'Click a piano note to map "'+(LABELS[armed]||armed.toUpperCase())+'" to it — or UNMAP to remove it. (Click the key again to cancel.)'
               : 'EDIT is ON — click a key, then a piano note to remap it (or UNMAP to remove). Letters on the piano show which key plays each note.')
      : 'Press any key to light it. Tap EDIT to remap keys; RESET restores the preset.'; }
  function setEdit(on){ editMode=on; const b=$('mapEditBtn'); if(b) b.classList.toggle('sel',on);
    const pnl=$('mapPanel'); if(pnl) pnl.classList.toggle('editing',on); if(!on){ disarm(); _focusedSlice=null; } setHint(); }
  function rebuild(){ build(); buildPiano(); renderSliceList(); }

  return {
    open:false,
    get editing(){ return editMode; },
    focus(id){ _focusedSlice=id; renderSliceList(); },
    refresh(){ rebuild(); setHint(); },
    toggle(){ this.open?this.hide():this.show(); },
    show(){ rebuild(); setHint(); $('mapOverlay').classList.add('open'); this.open=true; },
    hide(){ setEdit(false); $('mapOverlay').classList.remove('open'); this.open=false; },
    light,
    unmapArmed,
    toggleLines(){ linesOn=!linesOn; $('mapLinesBtn').classList.toggle('sel',linesOn); drawLines(); },
    edit(on){ setEdit(on===undefined?!editMode:on); },
  };
})();
$('mapClose').onclick=()=>MapView.hide();
$('mapLinesBtn').onclick=()=>MapView.toggleLines();
if($('mapEditBtn'))  $('mapEditBtn').onclick=()=>MapView.edit();
if($('mapUnmapBtn')) $('mapUnmapBtn').onclick=()=>MapView.unmapArmed();
if($('mapResetBtn')) $('mapResetBtn').onclick=()=>{ if(typeof applyPreset==='function') applyPreset(_basePreset||'standard'); MapView.show(); flash('Layout reset to '+_basePreset); };
$('mapOverlay').addEventListener('click',e=>{ if(e.target.id==='mapOverlay') MapView.hide(); });
if($('editMapBtn')) $('editMapBtn').onclick=()=>{ if(typeof Teklet!=='undefined') Teklet.hide(); MapView.show(); MapView.edit(true); };
if($('addSliceBtn')) $('addSliceBtn').onclick=()=>{ const id=sliceAdd(); MapView.focus(id); flash('Added slice "'+id+'" · focus it and click keys+notes to fill it'); };
if($('savePresetBtn')) $('savePresetBtn').onclick=()=>{ const el=$('presetName'); if(saveAsPreset(el?el.value:'')){ if(el) el.value=''; } };

// drag-drop
const wrap=document.getElementById('stageWrap');
['dragenter','dragover'].forEach(ev=>wrap.addEventListener(ev,e=>{e.preventDefault();$('dropHint').classList.add('show');}));
['dragleave','drop'].forEach(ev=>wrap.addEventListener(ev,e=>{e.preventDefault();$('dropHint').classList.remove('show');}));
wrap.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) loadFile(f); });

function versionSummary(){
  return Song.versions.map(v=>v.name.split('·').pop().trim()+' '+v.density.toFixed(1)).join(' · ');
}
function _commitLoadedSong(parsed, title){
  Transport.pause(); Transport.seek(0);
  if(typeof Score!=='undefined') Score.stop();
  if(typeof hideReport==='function') hideReport();
  analyze(parsed, title);
  $('songName').textContent = Song.title;
  buildVersionButtons();
  flash(`Loaded <b>${Song.title}</b> · ${Song.versions.length} difficulties · now playing <b>${Song.version?.name||'—'}</b>`, true);
  draw();
}
/* Low-confidence parse warning (DECISIONS, exact copy). Triggered when the loader
   isn't confident it got a clean melody out of the file. "Don't show again" is
   remembered through ProgressStore. */
function showLowConfidenceDialog(parsed, title, onProceed){
  const dontShow = (typeof ProgressStore!=='undefined') && ProgressStore.getSettings && ProgressStore.getSettings().hideParseWarning;
  if(dontShow){ onProceed(); return; }
  let el=document.getElementById('parseWarn');
  if(!el){ el=document.createElement('div'); el.id='parseWarn';
    el.style.cssText='position:fixed;inset:0;z-index:9200;display:flex;align-items:center;justify-content:center;background:rgba(3,6,12,.72);backdrop-filter:blur(3px);font-family:Orbitron,sans-serif';
    document.body.appendChild(el);
  }
  el.innerHTML=
    `<div style="background:#0b1220;border:1px solid #1d2b44;border-radius:14px;padding:24px 26px;max-width:420px;box-shadow:0 18px 60px #000a">`
    + `<div style="font-size:12px;letter-spacing:2px;color:#ffc85a">HEADS UP</div>`
    + `<div style="margin-top:10px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:15px;color:#dfe8f4;line-height:1.5">`
    +   `Our note loader is not that complicated (yet). There might be some bugs from your MIDI file.</div>`
    + `<label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-family:'Rajdhani';font-size:13px;color:#9fb6d4;cursor:pointer">`
    +   `<input type="checkbox" id="pwDontShow"> Don't show this again</label>`
    + `<div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">`
    +   `<button id="pwBack" style="cursor:pointer;border:1px solid #2a3a55;border-radius:8px;padding:9px 16px;background:#10192b;color:#cdd9ea;font-weight:700">Go Back to Library</button>`
    +   `<button id="pwPlay" style="cursor:pointer;border:0;border-radius:8px;padding:9px 16px;background:#ff8a2b;color:#1a0e02;font-weight:700">Play Anyway</button>`
    + `</div></div>`;
  el.style.display='flex';
  const close=()=>{ el.style.display='none'; };
  el.querySelector('#pwPlay').onclick=()=>{
    if(el.querySelector('#pwDontShow').checked && typeof ProgressStore!=='undefined') ProgressStore.saveSettings({ hideParseWarning:true });
    close(); onProceed();
  };
  el.querySelector('#pwBack').onclick=close;
}
/* Load a song straight from a URL (the Mutopia library page links here via
   tkg.html?mutopia=<midi-url>). Streams the MIDI, charts it, honoring the same
   low-confidence warning as an upload. */
function loadFromUrl(url, title){
  if(typeof flash==='function') flash('Loading from the library…');
  let hdrTitle=null;
  fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status);
      // our OnlineSequencer proxy returns the sequence name in a header
      try{ const h=r.headers.get('X-Sequence-Title'); if(h) hdrTitle=decodeURIComponent(h); }catch(e){}
      return r.arrayBuffer(); })
    .then(buf=>{
      const parsed=parseMidi(buf);
      if(!parsed.notes.length){ flash('No playable notes in that file'); return; }
      const t=title || hdrTitle || decodeURIComponent(url.split('/').pop().replace(/\.midi?$/i,'')).replace(/[-_]/g,' ');
      const conf=(typeof parseConfidence==='function') ? parseConfidence(parsed) : {score:1};
      if(conf.score < 0.55) showLowConfidenceDialog(parsed, t, ()=>_commitLoadedSong(parsed, t));
      else _commitLoadedSong(parsed, t);
    })
    .catch(e=>flash('Could not load that song: '+e.message));
}
/* Load an OnlineSequencer sequence by id via our same-origin proxy (which turns
   the sequence's embedded note data into a real MIDI). Charts it exactly like any
   other MIDI. Reached from the library page as tkg.html?song=os:<id>. */
function loadFromOnlineSequencer(id, title){
  loadFromUrl('/api/midi?id='+encodeURIComponent(id), title);
}
/* Chart an already-in-memory MIDI (ArrayBuffer). Shared by upload paths. */
function loadArrayBuffer(buf, title){
  try{
    const parsed=parseMidi(buf);
    if(!parsed.notes.length){ flash('No playable notes found in that file'); return; }
    const t=title||'Your MIDI';
    const conf=(typeof parseConfidence==='function') ? parseConfidence(parsed) : {score:1};
    if(conf.score < 0.55) showLowConfidenceDialog(parsed, t, ()=>_commitLoadedSong(parsed, t));
    else _commitLoadedSong(parsed, t);
  }catch(err){ flash('Could not read MIDI: '+err.message); }
}
/* A MIDI uploaded on the library page is stashed in sessionStorage, then the game
   opens with ?upload=1 and reads it back here (same-origin, survives the nav). */
function loadUploadFromSession(){
  let raw=null; try{ raw=sessionStorage.getItem('tkg_upload'); }catch(e){}
  if(!raw){ if(typeof Onboarding!=='undefined') Onboarding.maybeStart(); return; }
  try{ sessionStorage.removeItem('tkg_upload'); }catch(e){}
  try{
    const {name,data}=JSON.parse(raw);
    const bin=atob(data), arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    loadArrayBuffer(arr.buffer, (name||'Your MIDI').replace(/\.midi?$/i,'').replace(/[-_]/g,' '));
  }catch(e){ flash('Could not load the uploaded file'); }
}
function loadFile(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=parseMidi(reader.result);
      if(!parsed.notes.length){ flash('No playable notes found in that file'); return; }
      const title=file.name.replace(/\.midi?$/i,'');
      const conf=(typeof parseConfidence==='function') ? parseConfidence(parsed) : {score:1};
      if(conf.score < 0.55) showLowConfidenceDialog(parsed, title, ()=>_commitLoadedSong(parsed, title));
      else _commitLoadedSong(parsed, title);
    }catch(err){ flash('Could not read MIDI: '+err.message); }
  };
  reader.readAsArrayBuffer(file);
}
