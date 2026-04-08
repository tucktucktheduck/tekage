import { useState, useEffect, useRef, useMemo } from "react";

const ROWS=[{keys:["Q","W","E","R","T","Y","U","I","O","P"]},{keys:["A","S","D","F","G","H","J","K","L"]},{keys:["Z","X","C","V","B","N","M"]}];
const LEFT_KEYS=new Set(["Q","W","E","R","T","A","S","D","F","Z","X","C","V"]);
const RIGHT_KEYS=new Set(["Y","U","I","O","P","H","J","K","L","B","N","M"]);
const GREY_KEYS=new Set(["G"]);
const NOTE_MAP={W:"C",E:"D",R:"E",T:"F",Y:"F",U:"G",I:"A",O:"B",S:"C#",D:"D#",F:"F#",J:"G#",K:"A#",X:"C",C:"D",V:"E",B:"F",N:"G",M:"A"};
const KC={Q:1,W:1,E:1,R:1,T:1,Y:1,U:1,I:1,O:1,P:1,A:1,S:1,D:1,F:1,G:1,H:1,J:1,K:1,L:1,Z:1,X:1,C:1,V:1,B:1,N:1,M:1};
const HB={C:1,D:1,F:1,G:1,A:1};
function b88(){const w=[],b=[];w.push({n:"A",o:0});b.push({a:0});w.push({n:"B",o:0});for(let o=1;o<=7;o++)["C","D","E","F","G","A","B"].forEach(n=>{w.push({n,o});if(HB[n])b.push({a:w.length-1});});w.push({n:"C",o:8});return{w,b};}
const WW=["BEGINNER","SAMPLE","STUKAGE","CHALLENGES","SETTINGS","LIBRARY"];
const NAV=["BEGINNER MODE","PLAY","LIBRARY","OPTIONS","EDITOR","CHALLENGES"];
const QA=[{l:"RECORD",r:1},{l:"SETTINGS"},{l:"METRONOME"},{l:"TUTORIALS"}];
function gn(c=35){const n=[],a=ROWS.flatMap(r=>r.keys).filter(k=>!GREY_KEYS.has(k));for(let i=0;i<c;i++){const k=a[Math.floor(Math.random()*a.length)];const ri=ROWS.findIndex(r=>r.keys.includes(k));n.push({k,ri,h:15+Math.random()*60,s:40+Math.random()*60,d:Math.random()*8,il:LEFT_KEYS.has(k)});}return n;}
function lp(a,b,t){return a+(b-a)*t;}
function e3(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function gc(t){const p=((t%40)+40)%40;if(p<8){const q=p/8;let i;if(q<.15)i=q/.15;else if(q>.85)i=(1-q)/.15;else i=1;return{c:"blue",i};}else if(p<20)return{c:"off",i:0};else if(p<28){const q=(p-20)/8;let i;if(q<.15)i=q/.15;else if(q>.85)i=(1-q)/.15;else i=1;return{c:"orange",i};}else return{c:"off",i:0};}
function gRGB(c,i){if(c==="blue")return[Math.round(lp(15,59,i)),Math.round(lp(15,158,i)),Math.round(lp(15,255,i))];if(c==="orange")return[Math.round(lp(15,255,i)),Math.round(lp(15,140,i)),Math.round(lp(15,15,i))];return[15,15,15];}
function cA(rgb,a){return`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;}
function s2c(e,cv,W,H){const r=cv.getBoundingClientRect();const s=Math.min(r.width/W,r.height/H);const rW=W*s,rH=H*s;return{x:(e.clientX-r.left-(r.width-rW)/2)/s,y:(e.clientY-r.top-(r.height-rH)/2)/s};}

export default function TekageUI(){
  const cvR=useRef(null),anR=useRef(null),fall=useMemo(()=>gn(35),[]),tR=useRef(0),kR=useRef(new Map()),pno=useMemo(()=>b88(),[]),mR=useRef({x:-9,y:-9});
  const wH=useRef(0),wIH=useRef(false),wLC=useRef(null),wLI=useRef(0),wWI=useRef(0),wWT=useRef(0);
  const cH=useRef(0),cIH=useRef(false),cLC=useRef(null),cLI=useRef(0),lastC=useRef("blue");
  const mO=useRef(0),mT=useRef(0),mIR=useRef([]),mCR=useRef({x:0,y:0,w:0,h:0}),mQR=useRef([]),mExR=useRef({x:0,y:0,w:0,h:0}),mNA=useRef(0);
  const lvL=useRef(.7),lvR=useRef(.55),tgL=useRef(.7),tgR=useRef(.55);

  useEffect(()=>{
    const W=1920,H=1080;
    const kd=e=>{if(mT.current===1&&e.key==="Escape"){mT.current=0;return;}const k=e.key.toUpperCase();if(!KC[k]||GREY_KEYS.has(k))return;if(kR.current.has(k))return;kR.current.set(k,{t:tR.current,l:LEFT_KEYS.has(k)});};
    const ku=e=>kR.current.delete(e.key.toUpperCase());
    const mm=e=>{const c=cvR.current;if(!c)return;const p=s2c(e,c,W,H);mR.current=p;};
    const mc=()=>{const{x:mx,y:my}=mR.current;
      if(mO.current>.8){
        const cb=mCR.current;if(mx>cb.x&&mx<cb.x+cb.w&&my>cb.y&&my<cb.y+cb.h){mT.current=0;return;}
        const ex=mExR.current;if(mx>ex.x&&mx<ex.x+ex.w&&my>ex.y&&my<ex.y+ex.h){mT.current=0;return;}
        for(let i=0;i<mIR.current.length;i++){const r=mIR.current[i];if(mx>r.x&&mx<r.x+r.w&&my>r.y&&my<r.y+r.h){mNA.current=i;console.log(`[Teklet] ${NAV[i]}`);return;}}
        for(let i=0;i<mQR.current.length;i++){const r=mQR.current[i];if(mx>r.x&&mx<r.x+r.w&&my>r.y&&my<r.y+r.h){console.log(`[Teklet QA] ${QA[i].l}`);return;}}
        return;}
      if(wIH.current){mT.current=1;return;}
      if(cIH.current){console.log("[Portal] PLAY");return;}
    };
    window.addEventListener("keydown",kd);window.addEventListener("keyup",ku);window.addEventListener("mousemove",mm);window.addEventListener("click",mc);
    return()=>{window.removeEventListener("keydown",kd);window.removeEventListener("keyup",ku);window.removeEventListener("mousemove",mm);window.removeEventListener("click",mc);};
  },[]);

  useEffect(()=>{
    const cv=cvR.current;if(!cv)return;
    const cx=cv.getContext("2d"),W=1920,H=1080;cv.width=W;cv.height=H;
    const BL="#3b9eff",BLL="#7ec8ff",OR="#ff8a2b",ORL="#ffc87a",Bg="rgba(59,158,255,",Og="rgba(255,138,43,";
    const RH=[220,460,700],RSX=[280,320,380],KS=105,AH=180,PH=50,PY=920,PIH=110,PL=340,PR=1580;
    const kp={};ROWS.forEach((r,ri)=>r.keys.forEach((k,ki)=>{kp[k]={x:RSX[ri]+ki*KS+KS/2,y:RH[ri]};}));
    const{w:ws,b:bs}=pno,pw=PR-PL,wkW=pw/ws.length,bkH=PIH*.62,bkHf=wkW*.3,pBot=PY+PIH;
    const wkX=ws.map((_,i)=>PL+i*wkW),hbr=new Array(ws.length).fill(0),hbl=new Array(ws.length).fill(0);
    bs.forEach(b=>{hbr[b.a]=1;if(b.a+1<ws.length)hbl[b.a+1]=1;});
    const WFW=45,WFH=520,WFY=(H-WFH)/2+20,CP_W=172,CP_H=15,CP_CX=160,CP_L=CP_CX-CP_W/2,CP_R=CP_CX+CP_W/2;

    // Teklet: match HTML 620:720 ratio → on 1080p = ~820x950 centered
    const TW=820,TH=950,BZ=22;
    const TX=(W-TW)/2,TY=(H-TH)/2;

    let lt=performance.now();

    function drawPortal(type,int,col,hov,word){const rgb=gRGB(col,int);const c=`rgb(${rgb})`;const ca=a=>cA(rgb,a);const on=int>.05;
      if(type==="wall"){const fR=W,fL=W-WFW;cx.fillStyle="#2e2e33";cx.fillRect(fL,WFY,WFW,WFH);cx.strokeStyle="#131316";cx.lineWidth=2;cx.strokeRect(fL,WFY,WFW,WFH);cx.fillStyle="#3c3c42";cx.fillRect(fL,WFY,WFW-10,14);cx.fillRect(fL,WFY+WFH-14,WFW-10,14);const my=WFY+WFH/2-7;cx.fillRect(fL,my,WFW-10,14);const lL=fL+4,lR=fR-12,lW=lR-lL;for(let i=0;i<6;i++){const lx=lL+(i+.5)*(lW/6);if(on){cx.shadowColor=c;cx.shadowBlur=8;cx.strokeStyle=ca(Math.min(1,int*1.3));cx.lineWidth=2;cx.beginPath();cx.moveTo(lx,WFY+18);cx.lineTo(lx,my);cx.stroke();cx.beginPath();cx.moveTo(lx,my+14);cx.lineTo(lx,WFY+WFH-18);cx.stroke();cx.shadowBlur=0;cx.shadowColor="transparent";}else{cx.strokeStyle="rgba(42,42,48,.4)";cx.lineWidth=2;cx.beginPath();cx.moveTo(lx,WFY+18);cx.lineTo(lx,my);cx.stroke();cx.beginPath();cx.moveTo(lx,my+14);cx.lineTo(lx,WFY+WFH-18);cx.stroke();}}if(on){const td=lp(100,220,hov)*int,te=WFH*.15;cx.beginPath();cx.moveTo(fL,WFY);cx.lineTo(fL-td,WFY-te);cx.lineTo(fL-td,WFY+WFH+te);cx.lineTo(fL,WFY+WFH);cx.closePath();const tg=cx.createLinearGradient(fL,0,fL-td,0);tg.addColorStop(0,ca(.4*int));tg.addColorStop(.3,ca(.15*int));tg.addColorStop(1,ca(0));cx.fillStyle=tg;cx.fill();}if(on&&word&&int>.2){cx.save();cx.translate(fL-lp(40,80,hov),WFY+WFH/2);cx.rotate(Math.PI/2);cx.globalAlpha=Math.min(1,(int-.2)*2);cx.textAlign="center";cx.textBaseline="middle";cx.font=`bold ${Math.round(lp(22,32,hov))}px 'Orbitron',sans-serif`;cx.shadowColor=c;cx.shadowBlur=15;cx.fillStyle=c;cx.fillText(word,0,0);cx.shadowBlur=0;cx.shadowColor="transparent";cx.globalAlpha=1;cx.restore();}}
      else{cx.fillStyle="#2e2e33";cx.fillRect(CP_L,0,CP_W,CP_H);cx.strokeStyle="#131316";cx.lineWidth=1.5;cx.strokeRect(CP_L,0,CP_W,CP_H);cx.fillStyle="#3c3c42";cx.fillRect(CP_CX-3,0,6,CP_H);for(const ny of[CP_H*.35,CP_H*.7]){if(on){cx.shadowColor=c;cx.shadowBlur=5;cx.strokeStyle=ca(Math.min(1,int*1.3));cx.lineWidth=1.5;cx.beginPath();cx.moveTo(CP_L+8,ny);cx.lineTo(CP_CX-4,ny);cx.stroke();cx.beginPath();cx.moveTo(CP_CX+4,ny);cx.lineTo(CP_R-8,ny);cx.stroke();cx.shadowBlur=0;cx.shadowColor="transparent";}}if(on){const td=lp(35,75,hov)*int,te=CP_W*.12;cx.beginPath();cx.moveTo(CP_L,CP_H);cx.lineTo(CP_L-te,CP_H+td);cx.lineTo(CP_R+te,CP_H+td);cx.lineTo(CP_R,CP_H);cx.closePath();const tg=cx.createLinearGradient(0,CP_H,0,CP_H+td);tg.addColorStop(0,ca(.4*int));tg.addColorStop(.5,ca(.08*int));tg.addColorStop(1,ca(0));cx.fillStyle=tg;cx.fill();}if(on&&word&&int>.2){cx.save();cx.globalAlpha=Math.min(1,(int-.2)*2);cx.textAlign="center";cx.textBaseline="middle";cx.font=`bold ${Math.round(lp(22,32,hov))}px 'Orbitron',sans-serif`;cx.shadowColor=c;cx.shadowBlur=15;cx.fillStyle=c;cx.fillText(word,CP_CX,CP_H+lp(28,55,hov));cx.shadowBlur=0;cx.shadowColor="transparent";cx.globalAlpha=1;cx.restore();}}}

    function drawTeklet(op,t){
      if(op<.01)return;
      const e=e3(op),{x:mx,y:my}=mR.current;
      // Animate from portal position to center
      const pCX=W-WFW/2,pCY=WFY+WFH/2,fCX=TX+TW/2,fCY=TY+TH/2;
      const cCX=lp(pCX,fCX,e),cCY=lp(pCY,fCY,e),sc=lp(.06,1,e),al=Math.min(1,e*1.5);
      const w=TW*sc,h=TH*sc,x=cCX-w/2,y=cCY-h/2,bz=BZ*sc;
      cx.save();cx.globalAlpha=al;

      // ── BEZEL ──
      const ox=x-bz,oy=y-bz,ow=w+bz*2,oh=h+bz*2;
      cx.fillStyle="#1c1e24";cx.beginPath();cx.roundRect(ox,oy,ow,oh,22*sc);cx.fill();
      // Top/bottom bezel shading
      let g=cx.createLinearGradient(0,oy,0,oy+bz);g.addColorStop(0,"#3a3d48");g.addColorStop(1,"#1c1e24");cx.fillStyle=g;cx.fillRect(ox+10*sc,oy,ow-20*sc,bz);
      g=cx.createLinearGradient(0,oy+oh-bz,0,oy+oh);g.addColorStop(0,"#1c1e24");g.addColorStop(1,"#111114");cx.fillStyle=g;cx.fillRect(ox+10*sc,oy+oh-bz,ow-20*sc,bz);
      cx.strokeStyle="#2a2d35";cx.lineWidth=2*sc;cx.beginPath();cx.roundRect(ox,oy,ow,oh,22*sc);cx.stroke();
      // Screws
      [[ox+10*sc,oy+10*sc],[ox+ow-10*sc,oy+10*sc],[ox+10*sc,oy+oh-10*sc],[ox+ow-10*sc,oy+oh-10*sc]].forEach(([sx,sy])=>{cx.beginPath();cx.arc(sx,sy,4*sc,0,Math.PI*2);cx.fillStyle="#2e3038";cx.fill();cx.strokeStyle="#444";cx.lineWidth=.8;cx.stroke();});

      // ── SCREEN ──
      cx.fillStyle="#050810";cx.beginPath();cx.roundRect(x,y,w,h,12*sc);cx.fill();
      cx.strokeStyle="#0d1020";cx.lineWidth=2*sc;cx.beginPath();cx.roundRect(x,y,w,h,12*sc);cx.stroke();
      // CRT effects
      cx.save();cx.beginPath();cx.roundRect(x,y,w,h,12*sc);cx.clip();
      for(let sy=y;sy<y+h;sy+=4*sc){cx.fillStyle="rgba(0,0,0,.06)";cx.fillRect(x,sy+2*sc,w,2*sc);}
      const vig=cx.createRadialGradient(cCX,cCY,w*.2,cCX,cCY,w*.6);vig.addColorStop(0,"transparent");vig.addColorStop(1,"rgba(0,0,0,.25)");cx.fillStyle=vig;cx.fillRect(x,y,w,h);
      cx.restore();

      if(e<.35){cx.globalAlpha=1;cx.restore();return;}
      cx.globalAlpha=al*Math.min(1,(e-.35)*2.5);
      const P=20*sc; // padding

      // ── HEADER ── matching HTML exactly
      const hY=y+P,hH=36*sc;
      // Divider line
      cx.strokeStyle="rgba(26,40,64,.5)";cx.lineWidth=1;cx.beginPath();cx.moveTo(x+P,hY+hH);cx.lineTo(x+w-P,hY+hH);cx.stroke();
      // TEKAGE logo
      cx.textAlign="left";cx.textBaseline="middle";cx.font=`900 ${24*sc}px 'Orbitron',sans-serif`;cx.fillStyle="#ff8a2b";cx.shadowColor="rgba(255,138,43,.3)";cx.shadowBlur=14*sc;cx.fillText("TEKAGE",x+P,hY+hH/2);cx.shadowBlur=0;cx.shadowColor="transparent";
      // Orange underline
      g=cx.createLinearGradient(x+P,0,x+P+130*sc,0);g.addColorStop(0,"#ff8a2b");g.addColorStop(1,"transparent");cx.strokeStyle=g;cx.lineWidth=2*sc;cx.beginPath();cx.moveTo(x+P,hY+hH/2+14*sc);cx.lineTo(x+P+130*sc,hY+hH/2+14*sc);cx.stroke();
      // SYS info
      cx.textAlign="right";cx.font=`${10*sc}px 'Share Tech Mono',monospace`;cx.fillStyle="#3a5070";cx.fillText("SYS V1.03 //",x+w-P-100*sc,hY+12*sc);
      cx.fillStyle="#22cc66";cx.shadowColor="rgba(34,204,102,.3)";cx.shadowBlur=3*sc;cx.fillText("● ONLINE",x+w-P-100*sc,hY+24*sc);cx.shadowBlur=0;cx.shadowColor="transparent";
      // Clock
      const now=new Date();const clk=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
      cx.font=`bold ${16*sc}px 'Orbitron',sans-serif`;cx.fillStyle="#1a8fff";cx.shadowColor="rgba(26,143,255,.2)";cx.shadowBlur=6*sc;cx.fillText(clk,x+w-P,hY+18*sc);cx.shadowBlur=0;cx.shadowColor="transparent";
      // Battery
      const batX=x+w-P-48*sc,batY=hY+28*sc;
      cx.strokeStyle="rgba(26,40,64,.5)";cx.lineWidth=1;cx.strokeRect(batX,batY,24*sc,10*sc);
      cx.fillRect(batX+24*sc,batY+3*sc,2*sc,4*sc);
      for(let i=0;i<4;i++){cx.fillStyle=i<3?"#1a8fff":"#0d4a8a";cx.fillRect(batX+2*sc+i*6*sc,batY+2*sc,4*sc,6*sc);}

      // ── LEFT NAV ── takes ~55% width like HTML
      const navX=x+P,navY=hY+hH+14*sc,navW=w*.52;
      // Divider
      cx.strokeStyle="rgba(26,40,64,.3)";cx.lineWidth=1;cx.beginPath();cx.moveTo(navX+navW+12*sc,navY);cx.lineTo(navX+navW+12*sc,y+h-70*sc);cx.stroke();

      const itemH=50*sc,itemG=7*sc;
      const nR=[];
      NAV.forEach((label,i)=>{
        const iy=navY+i*(itemH+itemG);
        const r={x:navX,y:iy,w:navW,h:itemH};nR.push(r);
        const hv=mx>r.x&&mx<r.x+r.w&&my>r.y&&my<r.y+r.h;
        const ac=mNA.current===i;
        if(ac||hv){cx.fillStyle="rgba(255,138,43,.05)";cx.beginPath();cx.roundRect(navX,iy,navW,itemH,5*sc);cx.fill();cx.strokeStyle=ac?"rgba(255,138,43,.6)":"rgba(255,138,43,.3)";cx.lineWidth=ac?2*sc:1.5*sc;}
        else{cx.strokeStyle="rgba(26,40,64,.5)";cx.lineWidth=1;}
        cx.beginPath();cx.roundRect(navX,iy,navW,itemH,5*sc);cx.stroke();
        cx.textAlign="left";cx.textBaseline="middle";cx.font=`bold ${14*sc}px 'Orbitron',sans-serif`;
        cx.fillStyle=(ac||hv)?"#ff8a2b":"#1a8fff";
        if(ac||hv){cx.shadowColor="rgba(255,138,43,.2)";cx.shadowBlur=8*sc;}
        cx.fillText("›  "+label,navX+14*sc,iy+itemH/2);
        cx.shadowBlur=0;cx.shadowColor="transparent";
      });
      mIR.current=nR;

      // EXIT
      const exY=navY+NAV.length*(itemH+itemG)+12*sc,exH=44*sc;
      mExR.current={x:navX,y:exY,w:navW,h:exH};
      const exHv=mx>navX&&mx<navX+navW&&my>exY&&my<exY+exH;
      cx.strokeStyle=exHv?"#ff8a2b":"rgba(138,74,16,.5)";cx.lineWidth=2*sc;cx.beginPath();cx.roundRect(navX,exY,navW,exH,5*sc);cx.stroke();
      if(exHv){cx.fillStyle="rgba(255,138,43,.07)";cx.beginPath();cx.roundRect(navX,exY,navW,exH,5*sc);cx.fill();}
      cx.textAlign="center";cx.textBaseline="middle";cx.font=`bold ${14*sc}px 'Orbitron',sans-serif`;cx.fillStyle="#ff8a2b";cx.fillText("EXIT",navX+navW/2,exY+exH/2);
      // Profile
      cx.textAlign="left";cx.font=`${10*sc}px 'Share Tech Mono',monospace`;cx.fillStyle="#3a5070";cx.fillText("👤 PROFILE: TEKAGE_USER_01",navX,exY+exH+16*sc);

      // ── AUDIO COLUMN ── right side, tall meters
      const aX=navX+navW+28*sc,aW=w-navW-P*2-28*sc,aCX=aX+aW/2;
      cx.textAlign="center";cx.font=`bold ${10*sc}px 'Orbitron',sans-serif`;cx.fillStyle="#1a8fff";cx.shadowColor="rgba(26,143,255,.2)";cx.shadowBlur=4*sc;cx.fillText("AUDIO",aCX,navY+6*sc);cx.shadowBlur=0;cx.shadowColor="transparent";

      // Tall bitmap meters — fill most of right column height
      const BC=24,bW=22*sc,bH=8*sc,bGap=3*sc,mH=BC*(bH+bGap),mY=navY+22*sc;
      if(Math.random()<.03)tgL.current=.25+Math.random()*.65;
      if(Math.random()<.03)tgR.current=.25+Math.random()*.65;
      lvL.current+=(tgL.current-lvL.current)*.05;lvR.current+=(tgR.current-lvR.current)*.05;
      const litL=Math.round(lvL.current*BC),litR=Math.round(lvR.current*BC);
      const lmX=aCX-bW-6*sc,rmX=aCX+6*sc;
      for(let i=0;i<BC;i++){
        const by=mY+mH-(i+1)*(bH+bGap);
        const onL=i<litL,onR=i<litR,hotL=i>=BC-3,hotR=i>=BC-3;
        cx.fillStyle=onL?(hotL?"#5bb8ff":"#1a8fff"):"rgba(255,255,255,.03)";
        if(onL){cx.shadowColor="rgba(26,143,255,.25)";cx.shadowBlur=hotL?6*sc:2*sc;}
        cx.fillRect(lmX,by,bW,bH);cx.shadowBlur=0;cx.shadowColor="transparent";
        cx.fillStyle=onR?(hotR?"#ffaa55":"#ff8a2b"):"rgba(255,255,255,.03)";
        if(onR){cx.shadowColor="rgba(255,138,43,.25)";cx.shadowBlur=hotR?6*sc:2*sc;}
        cx.fillRect(rmX,by,bW,bH);cx.shadowBlur=0;cx.shadowColor="transparent";
      }
      cx.font=`${9*sc}px 'Share Tech Mono',monospace`;cx.fillStyle="#3a5070";
      cx.fillText("L",lmX+bW/2,mY+mH+12*sc);cx.fillText("R",rmX+bW/2,mY+mH+12*sc);

      // Dial below meters
      const dY=mY+mH+36*sc,dR=22*sc;
      cx.beginPath();cx.arc(aCX,dY,dR,0,Math.PI*2);
      const dg=cx.createRadialGradient(aCX-4*sc,dY-4*sc,2,aCX,dY,dR);dg.addColorStop(0,"#2e3038");dg.addColorStop(1,"#1a1c22");cx.fillStyle=dg;cx.fill();cx.strokeStyle="#333640";cx.lineWidth=2*sc;cx.stroke();
      for(let i=-3;i<=3;i++){const a2=(i/3)*2.4-Math.PI/2;cx.strokeStyle="rgba(255,255,255,.1)";cx.lineWidth=1;cx.beginPath();cx.moveTo(aCX+Math.cos(a2)*(dR-3*sc),dY+Math.sin(a2)*(dR-3*sc));cx.lineTo(aCX+Math.cos(a2)*(dR+2*sc),dY+Math.sin(a2)*(dR+2*sc));cx.stroke();}
      const nA=(35/180)*Math.PI;cx.strokeStyle="#ff8a2b";cx.lineWidth=2.5*sc;cx.shadowColor="rgba(255,138,43,.4)";cx.shadowBlur=4*sc;cx.beginPath();cx.moveTo(aCX,dY);cx.lineTo(aCX+Math.sin(nA)*16*sc,dY-Math.cos(nA)*16*sc);cx.stroke();cx.shadowBlur=0;cx.shadowColor="transparent";
      cx.beginPath();cx.arc(aCX,dY,3*sc,0,Math.PI*2);cx.fillStyle="#444";cx.fill();
      cx.font=`${9*sc}px 'Share Tech Mono',monospace`;cx.fillStyle="#3a5070";cx.fillText("VOLUME",aCX,dY+dR+12*sc);

      // ── FOOTER ──
      const fY=y+h-56*sc;
      cx.strokeStyle="rgba(26,40,64,.4)";cx.lineWidth=1;cx.beginPath();cx.moveTo(x+P,fY);cx.lineTo(x+w-P,fY);cx.stroke();
      cx.textAlign="left";cx.font=`bold ${9*sc}px 'Orbitron',sans-serif`;cx.fillStyle="#3a5070";cx.fillText("QUICK ACCESS",x+P,fY+14*sc);
      const qaY=fY+24*sc,qaW=(w-P*2-24*sc)/4,qaH=24*sc;
      const qR=[];
      QA.forEach((qa,i)=>{
        const bx=x+P+i*(qaW+8*sc);const r={x:bx,y:qaY,w:qaW,h:qaH};qR.push(r);
        const hv=mx>r.x&&mx<r.x+r.w&&my>r.y&&my<r.y+r.h;
        cx.strokeStyle=hv?"rgba(26,143,255,.5)":"rgba(26,40,64,.5)";cx.lineWidth=1;cx.beginPath();cx.roundRect(bx,qaY,qaW,qaH,3*sc);cx.stroke();
        if(hv){cx.fillStyle="rgba(26,143,255,.04)";cx.beginPath();cx.roundRect(bx,qaY,qaW,qaH,3*sc);cx.fill();}
        cx.textAlign="center";cx.textBaseline="middle";cx.font=`${10*sc}px 'Share Tech Mono',monospace`;
        cx.fillStyle=qa.r?"#ff4444":"#1a8fff";cx.fillText((qa.r?"● ":"")+qa.l,bx+qaW/2,qaY+qaH/2);
      });
      mQR.current=qR;

      // Close X
      const cbS=30*sc,cbX=x+w-P-cbS,cbY=y+P;
      mCR.current={x:cbX,y:cbY,w:cbS,h:cbS};
      const cbHv=mx>cbX&&mx<cbX+cbS&&my>cbY&&my<cbY+cbS;
      cx.strokeStyle=cbHv?"rgba(255,255,255,.8)":"rgba(255,255,255,.25)";cx.lineWidth=cbHv?2.5*sc:1.5*sc;
      if(cbHv){cx.shadowColor="rgba(255,255,255,.25)";cx.shadowBlur=6*sc;}
      cx.beginPath();cx.moveTo(cbX+7*sc,cbY+7*sc);cx.lineTo(cbX+cbS-7*sc,cbY+cbS-7*sc);cx.stroke();
      cx.beginPath();cx.moveTo(cbX+cbS-7*sc,cbY+7*sc);cx.lineTo(cbX+7*sc,cbY+cbS-7*sc);cx.stroke();
      cx.shadowBlur=0;cx.shadowColor="transparent";

      cx.globalAlpha=1;cx.restore();
    }

    function draw(now){
      const dt=(now-lt)/1000;lt=now;tR.current+=dt;const t=tR.current;
      if(mT.current===1)mO.current=Math.min(1,mO.current+dt*3);else mO.current=Math.max(0,mO.current-dt*3.5);
      cx.clearRect(0,0,W,H);
      const bg=cx.createRadialGradient(W/2,H/2,100,W/2,H/2,900);bg.addColorStop(0,"#0a0a14");bg.addColorStop(1,"#000");cx.fillStyle=bg;cx.fillRect(0,0,W,H);
      const gD=mO.current>.01?lp(1,.1,e3(mO.current)):1;cx.globalAlpha=gD;

      // ── GAME LAYER ──
      ROWS.forEach((row,ri)=>{const ry=RH[ri],aT=ry-PH/2-AH,aB=ry-PH/2,pB=ry+PH/2;
        row.keys.forEach(k=>{if(GREY_KEYS.has(k))return;const p=kp[k],gc2=LEFT_KEYS.has(k)?Bg:Og;
          let g2=cx.createLinearGradient(p.x,aT-40,p.x,aB);g2.addColorStop(0,gc2+"0)");g2.addColorStop(.3,gc2+".15)");g2.addColorStop(1,gc2+".6)");cx.strokeStyle=g2;cx.lineWidth=3;cx.beginPath();cx.moveTo(p.x,aT-40);cx.lineTo(p.x,aB);cx.stroke();
          cx.strokeStyle=gc2+".9)";cx.lineWidth=1.5;cx.beginPath();cx.moveTo(p.x,aT);cx.lineTo(p.x,aB);cx.stroke();
          g2=cx.createRadialGradient(p.x,ry,5,p.x,ry,60);g2.addColorStop(0,gc2+".3)");g2.addColorStop(1,gc2+"0)");cx.fillStyle=g2;cx.fillRect(p.x-60,ry-30,120,60);
          cx.strokeStyle=gc2+".7)";cx.lineWidth=2;cx.beginPath();cx.moveTo(p.x-40,ry);cx.lineTo(p.x+40,ry);cx.stroke();
          g2=cx.createRadialGradient(p.x,aB,0,p.x,aB,25);g2.addColorStop(0,gc2+".8)");g2.addColorStop(.5,gc2+".2)");g2.addColorStop(1,gc2+"0)");cx.fillStyle=g2;cx.beginPath();cx.arc(p.x,aB,25,0,Math.PI*2);cx.fill();
          g2=cx.createLinearGradient(p.x,pB,p.x,pB+AH*.4);g2.addColorStop(0,gc2+".5)");g2.addColorStop(1,gc2+"0)");cx.strokeStyle=g2;cx.lineWidth=2;cx.beginPath();cx.moveTo(p.x,pB);cx.lineTo(p.x,pB+AH*.4);cx.stroke();
        });
        [[row.keys.filter(k=>LEFT_KEYS.has(k)),Bg],[row.keys.filter(k=>RIGHT_KEYS.has(k)),Og]].forEach(([ks,gc2])=>{if(!ks.length)return;const f=kp[ks[0]],l=kp[ks[ks.length-1]];let g2=cx.createLinearGradient(f.x-50,ry,l.x+50,ry);g2.addColorStop(0,gc2+"0)");g2.addColorStop(.1,gc2+".5)");g2.addColorStop(.9,gc2+".5)");g2.addColorStop(1,gc2+"0)");cx.strokeStyle=g2;cx.lineWidth=3;cx.beginPath();cx.moveTo(f.x-50,ry);cx.lineTo(l.x+50,ry);cx.stroke();cx.strokeStyle=gc2+".1)";cx.lineWidth=20;cx.beginPath();cx.moveTo(f.x-30,ry);cx.lineTo(l.x+30,ry);cx.stroke();});
      });
      cx.textAlign="center";cx.textBaseline="middle";ROWS.forEach(r=>r.keys.forEach(k=>{const p=kp[k];if(GREY_KEYS.has(k)){cx.fillStyle="rgba(100,100,100,.4)";cx.font="bold 20px 'Rajdhani',sans-serif";cx.fillText(k,p.x,p.y);return;}cx.fillStyle="rgba(255,255,255,.7)";cx.font="bold 22px 'Rajdhani',sans-serif";cx.fillText(k,p.x,p.y-2);const n=NOTE_MAP[k];if(n){cx.fillStyle=LEFT_KEYS.has(k)?"rgba(59,158,255,.8)":"rgba(255,138,43,.8)";cx.font="bold 14px 'Rajdhani',sans-serif";cx.fillText(n,p.x,p.y+18);}}));
      kR.current.forEach((d,k)=>{const p=kp[k];if(!p)return;const gc2=d.l?Bg:Og,el=t-d.t,at=Math.min(1,el/.1);let g2=cx.createRadialGradient(p.x,p.y,0,p.x,p.y,80);g2.addColorStop(0,gc2+(.65*at).toFixed(3)+")");g2.addColorStop(.25,gc2+(.4*at).toFixed(3)+")");g2.addColorStop(.55,gc2+(.15*at).toFixed(3)+")");g2.addColorStop(1,gc2+"0)");cx.fillStyle=g2;cx.beginPath();cx.arc(p.x,p.y,80,0,Math.PI*2);cx.fill();g2=cx.createRadialGradient(p.x,p.y,0,p.x,p.y,18);g2.addColorStop(0,`rgba(255,255,255,${(.5*at).toFixed(3)})`);g2.addColorStop(.4,gc2+(.4*at).toFixed(3)+")");g2.addColorStop(1,gc2+"0)");cx.fillStyle=g2;cx.beginPath();cx.arc(p.x,p.y,18,0,Math.PI*2);cx.fill();});
      fall.forEach(n=>{const el=t-n.d;if(el<0)return;const p=kp[n.k];if(!p)return;const ry=RH[n.ri],aT=ry-PH/2-AH,tt=AH+100+n.h,ct=tt/n.s,ph=el%(ct+2);if(ph>ct)return;const ny=(aT-n.h-80)+(ph/ct)*tt;const gc2=n.il?Bg:Og,bc=n.il?BL:OR,lc=n.il?BLL:ORL;cx.shadowColor=bc;cx.shadowBlur=15;cx.fillStyle=gc2+".6)";cx.fillRect(p.x-9,ny-n.h/2,18,n.h);cx.shadowBlur=8;const g2=cx.createLinearGradient(p.x-7,ny-n.h/2,p.x+7,ny+n.h/2);g2.addColorStop(0,lc);g2.addColorStop(.5,bc);g2.addColorStop(1,gc2+".8)");cx.fillStyle=g2;cx.fillRect(p.x-7,ny-n.h/2,14,n.h);cx.shadowBlur=0;cx.shadowColor="transparent";});
      // Piano
      function lpp(pts){cx.strokeStyle="rgba(210,220,240,.12)";cx.lineWidth=4;cx.shadowColor="rgba(210,220,240,.45)";cx.shadowBlur=6;cx.beginPath();cx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)cx.lineTo(pts[i][0],pts[i][1]);cx.stroke();cx.shadowBlur=0;cx.shadowColor="transparent";cx.strokeStyle="rgba(215,225,240,.7)";cx.lineWidth=1.3;cx.beginPath();cx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)cx.lineTo(pts[i][0],pts[i][1]);cx.stroke();}
      lpp([[PL,PY],[PR,PY]]);lpp([[PL,pBot],[PR,pBot]]);lpp([[PL,PY],[PL,pBot]]);lpp([[PR,PY],[PR,pBot]]);
      bs.forEach(b=>{const bX=wkX[b.a]+wkW,bL=bX-bkHf,bR=bX+bkHf,bbY=PY+bkH;lpp([[bL,PY],[bL,bbY]]);lpp([[bR,PY],[bR,bbY]]);lpp([[bL,bbY],[bR,bbY]]);lpp([[bX,bbY],[bX,pBot]]);});
      ws.forEach((w2,i)=>{if(i>=ws.length-1)return;if(!hbr[i]&&!hbl[i+1])lpp([[wkX[i]+wkW,PY],[wkX[i]+wkW,pBot]]);});
      const scY=pBot+20;cx.fillStyle="rgba(50,50,60,.3)";cx.fillRect(PL,scY,pw,3);const sp=(Math.sin(t*.3)+1)/2;cx.fillStyle=BL;cx.fillRect(PL,scY,pw*sp,3);cx.fillStyle="#fff";cx.strokeStyle=BL;cx.lineWidth=2;cx.fillRect(PL+pw*sp-5,scY-5,10,13);cx.strokeRect(PL+pw*sp-5,scY-5,10,13);cx.textAlign="right";cx.font="bold 12px 'Rajdhani',sans-serif";cx.fillStyle="rgba(148,163,184,.7)";cx.fillText("1:23",PL-8,scY+4);cx.textAlign="left";cx.fillText("3:45",PR+8,scY+4);cx.textAlign="right";cx.font="bold 16px 'Rajdhani',sans-serif";cx.fillStyle=BL;cx.fillText("L: OCT 4 | ST +0",PL-20,PY+PIH/2+5);cx.textAlign="left";cx.fillStyle=OR;cx.fillText("R: OCT 4 | ST +0",PR+20,PY+PIH/2+5);
      cx.globalAlpha=1;

      // ── PORTALS ──
      const{x:mmx,y:mmy}=mR.current;const cs=gc(t);if(cs.c!=="off")lastC.current=cs.c;
      if(mO.current<.5){const wVis=lp(WFW+60,WFW+250,wH.current);const wHit=mmx>W-wVis-20&&mmy>WFY-20&&mmy<WFY+WFH+20;if(wHit&&!wIH.current){wIH.current=true;wLC.current=cs.c!=="off"?cs.c:lastC.current;wLI.current=cs.i;}else if(!wHit&&wIH.current){wIH.current=false;wLC.current=null;}wH.current=Math.max(0,Math.min(1,wH.current+(wHit?dt*3:-dt*2)));const cTD=lp(35,75,cH.current);const cHit=mmx>CP_L-30&&mmx<CP_R+30&&mmy>=0&&mmy<CP_H+cTD+80;if(cHit&&!cIH.current){cIH.current=true;cLC.current=cs.c!=="off"?cs.c:lastC.current;cLI.current=cs.i;}else if(!cHit&&cIH.current){cIH.current=false;cLC.current=null;}cH.current=Math.max(0,Math.min(1,cH.current+(cHit?dt*3:-dt*2)));}else{wIH.current=false;wH.current=Math.max(0,wH.current-dt*2);cIH.current=false;cH.current=Math.max(0,cH.current-dt*2);}
      let wC,wI;if(wIH.current&&wLC.current){wC=wLC.current;wLI.current=Math.min(1,wLI.current+dt*3);wI=wLI.current;}else{wC=cs.c;wI=cs.i;}if(t-wWT.current>4){wWT.current=t;wWI.current=(wWI.current+1)%WW.length;}const wW=wI>.2?WW[wWI.current]:null;
      let cC,cI;if(cIH.current&&cLC.current){cC=cLC.current;cLI.current=Math.min(1,cLI.current+dt*3);cI=cLI.current;}else{const cc=gc(t+14);cC=cc.c;cI=cc.i;}const cW2=cI>.2?"PLAY":null;

      drawPortal("wall",wI,wC,wH.current,wW);drawPortal("ceil",cI,cC,cH.current,cW2);
      drawTeklet(mO.current,t);

      if(mO.current<.5){cx.globalAlpha=1-mO.current*2;cx.textAlign="right";cx.textBaseline="top";cx.font="bold 64px 'Orbitron',sans-serif";cx.shadowColor=BL;cx.shadowBlur=30;cx.strokeStyle=BL;cx.lineWidth=1.5;cx.strokeText("TEKAGE",W-50,50);cx.fillStyle="#fff";cx.shadowBlur=15;cx.fillText("TEKAGE",W-50,50);cx.shadowBlur=0;cx.shadowColor="transparent";cx.globalAlpha=1;}

      anR.current=requestAnimationFrame(draw);
    }
    anR.current=requestAnimationFrame(draw);
    return()=>{if(anR.current)cancelAnimationFrame(anR.current);};
  },[fall,pno]);

  return(<div style={{width:"100vw",height:"100vh",background:"#000",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}><link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&family=Share+Tech+Mono&display=swap" rel="stylesheet"/><canvas ref={cvR} style={{width:"100%",height:"100%",objectFit:"contain"}}/></div>);
}
