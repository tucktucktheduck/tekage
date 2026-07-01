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
if($('tutorialBtn'))  $('tutorialBtn').onclick=startTutorial;
if($('tutorialBtn2')) $('tutorialBtn2').onclick=startTutorial;
if($('resetBtn')) $('resetBtn').onclick=()=>{
  const ok = (typeof confirm==='function') ? confirm('Reset TKG? This erases your settings and best scores.') : true;
  if(!ok) return;
  if(typeof ProgressStore!=='undefined') ProgressStore.reset();
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
    if(UI.mode==='play'){ seedUserSlice(Transport.songTime); }
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
function persistSettings(){
  if(typeof ProgressStore==='undefined') return;
  if(typeof window!=='undefined' && window.__TKG_CONFIG__) return;
  clearTimeout(_persistT);
  _persistT=setTimeout(()=>{
    ProgressStore.saveSettings({
      speed: Transport.targetRate,
      vol: (parseFloat($('vol').value)||75)/100,
      mode: UI.mode,
      versionId: Song.version ? Song.version.id : null,
      assists: { keyNames:UI.keyNames, autoSlow:UI.autoSlow, autoShift:UI.autoShift },
      skin: (typeof Skin!=='undefined') ? { primary:_hex6(Skin.primary,'#ff8a2b'), secondary:_hex6(Skin.secondary,'#1a8fff'), bg:_hex6(Skin.bg,'#05060a') } : undefined,
    });
  }, 250);
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
  syncAssistUI();
  if(typeof Skin!=='undefined' && s.skin){
    Skin.apply({ colors:{ primary:s.skin.primary, secondary:s.skin.secondary }, background:{ mode:'color', asset:s.skin.bg } });
    if(typeof TKGConfig!=='undefined') TKGConfig.skin=Skin.toConfig();
    syncSkinUI();
  }
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
  if(!UI.autoSlow){ Transport.slowFactor=1; Transport.slowTarget=1; }
  persistSettings();
  flash(UI.autoSlow?'AUTO-SLOW on · the song eases down when you miss, recovers as you hit':'Auto-Slow off'); };
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

/* ── Keyboard-map viewer ──────────────────────────────────────
   Computer keyboard on top, piano beneath. Mapped keys are fully
   opaque & hand-coloured; unmapped keys are dimmed. Press a letter
   and it lights BOTH the letter and its piano key. A separate toggle
   draws simple straight lines for the whole mapping. */
const MapView = (()=>{
  const KB_ROWS = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l',';'],
    ['z','x','c','v','b','n','m',',','.','/'],
  ];
  let built=false, linesOn=false;
  const keyCell=new Map();   // letter -> element
  const pianoCell=new Map(); // midi -> element

  function build(){
    const kb=$('mapKb'); kb.innerHTML='';
    for(const row of KB_ROWS){
      const r=document.createElement('div'); r.className='mapRow';
      for(const k of row){
        const c=document.createElement('div');
        const hand=KEY_HAND[k];
        c.className='mapKey'+(hand?(' mapped '+hand):' dim');
        c.textContent = (k===';'?';':k.toUpperCase());
        c.dataset.k=k; keyCell.set(k,c); r.appendChild(c);
      }
      kb.appendChild(r);
    }
  }
  function buildPiano(){
    const s=currentSlice();
    const loOct=Math.min(s.L,s.R), hiOct=Math.max(s.L,s.R);
    const lo=(loOct+1)*12, hi=(hiOct+1)*12+11;
    const pno=$('mapPiano'); pno.innerHTML=''; pianoCell.clear();
    const whites=[]; for(let m=lo;m<=hi;m++){ if(![1,3,6,8,10].includes(m%12)) whites.push(m); }
    const wW=100/whites.length;
    // white keys
    whites.forEach((m,idx)=>{
      const el=document.createElement('div'); el.className='mapWhite';
      const hand = (m>=(s.L+1)*12&&m<=(s.L+1)*12+11)?'left':((m>=(s.R+1)*12&&m<=(s.R+1)*12+11)?'right':null);
      if(hand) el.classList.add('in-'+hand); else el.classList.add('dim');
      el.style.left=(idx*wW)+'%'; el.style.width=wW+'%';
      if(m%12===0){ const lab=document.createElement('span'); lab.className='mapClab'; lab.textContent='C'+(Math.floor(m/12)-1); el.appendChild(lab); }
      pno.appendChild(el); pianoCell.set(m,el);
    });
    // black keys
    for(let m=lo;m<=hi;m++){ if(![1,3,6,8,10].includes(m%12)) continue;
      const leftWhite=m-1; const wi=whites.indexOf(leftWhite); if(wi<0) continue;
      const el=document.createElement('div'); el.className='mapBlack';
      const hand = (m>=(s.L+1)*12&&m<=(s.L+1)*12+11)?'left':((m>=(s.R+1)*12&&m<=(s.R+1)*12+11)?'right':null);
      if(hand) el.classList.add('in-'+hand); else el.classList.add('dim');
      el.style.left=((wi+1)*wW - wW*0.3)+'%'; el.style.width=(wW*0.6)+'%';
      pno.appendChild(el); pianoCell.set(m,el);
    }
    drawLines();
  }
  function drawLines(){
    const svg=$('mapSvg'); svg.innerHTML=''; if(!linesOn) return;
    const host=$('mapBody').getBoundingClientRect();
    svg.setAttribute('viewBox',`0 0 ${host.width} ${host.height}`);
    for(const [k,cell] of keyCell){
      const hand=KEY_HAND[k]; if(!hand) continue;
      const r=midiForGameKey(k); if(!r) continue;
      const pc=pianoCell.get(r.midi); if(!pc) continue;
      const a=cell.getBoundingClientRect(), b=pc.getBoundingClientRect();
      const x1=a.left+a.width/2-host.left, y1=a.bottom-host.top;
      const x2=b.left+b.width/2-host.left, y2=b.top-host.top;
      const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
      ln.setAttribute('x1',x1);ln.setAttribute('y1',y1);ln.setAttribute('x2',x2);ln.setAttribute('y2',y2);
      ln.setAttribute('stroke', hand==='left'?'rgba(26,143,255,.5)':'rgba(255,138,43,.5)');
      ln.setAttribute('stroke-width','1.5'); svg.appendChild(ln);
    }
  }
  function light(k,midi,on){
    const c=keyCell.get(k); if(c) c.classList.toggle('lit',on);
    const p=pianoCell.get(midi); if(p) p.classList.toggle('lit',on);
  }
  return {
    open:false,
    toggle(){ this.open?this.hide():this.show(); },
    show(){ if(!built){build();built=true;} buildPiano(); $('mapOverlay').classList.add('open'); this.open=true; },
    hide(){ $('mapOverlay').classList.remove('open'); this.open=false; },
    light,
    toggleLines(){ linesOn=!linesOn; $('mapLinesBtn').classList.toggle('sel',linesOn); drawLines(); },
  };
})();
$('mapClose').onclick=()=>MapView.hide();
$('mapLinesBtn').onclick=()=>MapView.toggleLines();
$('mapOverlay').addEventListener('click',e=>{ if(e.target.id==='mapOverlay') MapView.hide(); });

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
  fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
    .then(buf=>{
      const parsed=parseMidi(buf);
      if(!parsed.notes.length){ flash('No playable notes in that file'); return; }
      const t=title || decodeURIComponent(url.split('/').pop().replace(/\.midi?$/i,'')).replace(/[-_]/g,' ');
      const conf=(typeof parseConfidence==='function') ? parseConfidence(parsed) : {score:1};
      if(conf.score < 0.55) showLowConfidenceDialog(parsed, t, ()=>_commitLoadedSong(parsed, t));
      else _commitLoadedSong(parsed, t);
    })
    .catch(e=>flash('Could not load that song: '+e.message));
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
