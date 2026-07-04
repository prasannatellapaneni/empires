'use strict';
/* Empires 3D — HUD, minimap, sound. */
const Sfx = (() => {
  let ac=null, muted=false;
  function ctx(){ if(!ac){ try{ac=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } return ac; }
  function tone(f,dur,type,vol,slide){
    const a=ctx(); if(!a||muted) return;
    if(a.state==='suspended')a.resume();
    const o=a.createOscillator(), g=a.createGain();
    o.type=type||'triangle'; o.frequency.value=f;
    if(slide)o.frequency.exponentialRampToValueAtTime(slide,a.currentTime+dur);
    g.gain.value=vol||0.06;
    g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+dur);
    o.connect(g).connect(a.destination);
    o.start(); o.stop(a.currentTime+dur);
  }
  let lastHit=0;
  const lib={
    select:()=>tone(660,0.06,'square',0.025),
    order:()=>tone(440,0.07,'triangle',0.04,520),
    place:()=>tone(300,0.12,'triangle',0.05,240),
    deny:()=>tone(160,0.15,'sawtooth',0.045,120),
    hit:()=>{const n=performance.now();if(n-lastHit<90)return;lastHit=n;tone(180+Math.random()*60,0.05,'square',0.03,90);},
    boom:()=>tone(90,0.35,'sawtooth',0.08,40),
    built:()=>{tone(392,0.1,'triangle',0.05);setTimeout(()=>tone(523,0.14,'triangle',0.05),90);},
    train:()=>tone(523,0.08,'triangle',0.04),
    age:()=>{[392,494,587,784].forEach((f,i)=>setTimeout(()=>tone(f,0.28,'triangle',0.07),i*140));},
    attack:()=>{[330,330,262].forEach((f,i)=>setTimeout(()=>tone(f,0.22,'square',0.06),i*160));},
    win:()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,0.3,'triangle',0.08),i*150));},
    lose:()=>{[330,262,196].forEach((f,i)=>setTimeout(()=>tone(f,0.4,'sawtooth',0.05),i*220));},
  };
  return { play(k){ if(lib[k])lib[k](); }, toggleMute(){muted=!muted;UI.toast(muted?'Sound off':'Sound on');}, get muted(){return muted;} };
})();

const UI = (() => {
let el={}, mmCtx, mmBase, curSel=[], toastT=null, curRes=null, chatOpen=false;
const RES_ICONS={
  wood:'<svg viewBox="0 0 20 20"><rect x="3" y="8" width="14" height="5" rx="2.5" fill="#8a6136"/><circle cx="17" cy="10.5" r="2.5" fill="#c89a62"/><circle cx="17" cy="10.5" r="1.2" fill="#8a6136"/></svg>',
  food:'<svg viewBox="0 0 20 20"><ellipse cx="10" cy="12" rx="6" ry="5" fill="#b8452f"/><rect x="9" y="4" width="2" height="4" rx="1" fill="#6d8a3a"/></svg>',
  gold:'<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="#d9a520"/><circle cx="10" cy="10" r="4.5" fill="#f0c94a"/></svg>',
  pop:'<svg viewBox="0 0 20 20"><circle cx="10" cy="6.5" r="3.4" fill="#cfd6dd"/><path d="M3 17 q7 -8 14 0 z" fill="#cfd6dd"/></svg>',
};
const BUILD_MENU=['house','farm','mill','lumbercamp','miningcamp','barracks','archery','stable','workshop','tower'];
const PNAMES=['You','Red','Green','Yellow'];
const PCOLORS=['#4d8bf0','#e05242','#4fb75a','#e0b84d'];
const PCOLORS_U=['#8fc1ff','#ff8d7a','#8fe09a','#ffe08f'];

function q(id){ return document.getElementById(id); }
function costStr(c){ return Object.entries(c).map(([k,v])=>v+' '+k).join(', '); }
function initTitle(startCb){
  const t=q('title');
  let diff='normal', opp=1;
  const wire=(cls,cb)=>{ for(const b of t.querySelectorAll(cls)) b.onclick=()=>{
    for(const x of t.querySelectorAll(cls)) x.classList.remove('sel');
    b.classList.add('sel'); cb(b.dataset.v); }; };
  wire('.tdiff',v=>diff=v);
  wire('.topp',v=>opp=+v);
  q('btn-start').onclick=()=>{ t.style.display='none'; startCb({difficulty:diff,opponents:opp}); };
}
function init(){
  el.wood=q('r-wood'); el.food=q('r-food'); el.gold=q('r-gold'); el.pop=q('r-pop');
  el.age=q('agename'); el.panel=q('selpanel'); el.card=q('cmdcard');
  el.hint=q('hint'); el.toast=q('toast'); el.banner=q('agebanner');
  el.over=q('overlay'); el.help=q('help');
  q('btn-help').onclick=()=>toggleHelp();
  el.idle=q('btn-idle');
  el.idle.onclick=()=>Input.cycleIdle();
  el.chat=q('chatwrap'); el.chatIn=q('chatinput');
  el.chatIn.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Escape'){ closeChat(); }
    if(e.key==='Enter'){ const v=el.chatIn.value.trim(); closeChat(); if(v) command(v); }
  });
  q('btn-mute').onclick=()=>Sfx.toggleMute();
  q('btn-restart').onclick=()=>Main.restart();
  q('help-close').onclick=()=>toggleHelp();
  for(const k in RES_ICONS) { const n=q('ic-'+k); if(n) n.innerHTML=RES_ICONS[k]; }
  // minimap
  const mm=q('minimap');
  mmCtx=mm.getContext('2d');
  buildMinimapBase();
  const mmClick=e=>{
    const r=mm.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width*Sim.S, y=(e.clientY-r.top)/r.height*Sim.S;
    Render.center(x,y);
  };
  mm.addEventListener('mousedown',e=>{e.preventDefault();mmClick(e);
    const mv=ev=>mmClick(ev), up=()=>{window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);});
  mm.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];mmClick(t);},{passive:false});
}
function buildMinimapBase(){
  const S=Sim.S, st=Sim.st, c=document.createElement('canvas');
  c.width=S;c.height=S;
  const g=c.getContext('2d'), img=g.createImageData(S,S), d=img.data;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const i=y*S+x, t=st.tiles[i];
    const h=st.height[y*(S+1)+x];
    let col=t===Sim.TREE?[38,74,34]:t===Sim.BERRY?[120,60,50]:t===Sim.GOLD?[190,150,40]:
      [92+h*8|0,120+h*6|0,58];
    d[i*4]=col[0];d[i*4+1]=col[1];d[i*4+2]=col[2];d[i*4+3]=255;
  }
  g.putImageData(img,0,0);
  mmBase=c;
}
function drawMinimap(){
  const S=Sim.S, st=Sim.st, W=mmCtx.canvas.width, sc=W/S;
  mmCtx.drawImage(mmBase,0,0,W,W);
  // fog
  const vis=st.vis[0];
  mmCtx.fillStyle='rgba(4,6,8,0.9)';
  for(let y=0;y<S;y+=2)for(let x=0;x<S;x+=2){
    if(vis[y*S+x]===0) mmCtx.fillRect(x*sc,y*sc,sc*2,sc*2);
  }
  mmCtx.fillStyle='rgba(4,6,8,0.45)';
  for(let y=0;y<S;y+=2)for(let x=0;x<S;x+=2){
    if(vis[y*S+x]===1) mmCtx.fillRect(x*sc,y*sc,sc*2,sc*2);
  }
  // entities
  for(const b of st.bldgs){
    if(b.dead) continue;
    const v=vis[(b.y|0)*S+(b.x|0)];
    if(b.owner!==0&&v===0) continue;
    mmCtx.fillStyle=PCOLORS[b.owner]||'#e05242';
    mmCtx.fillRect((b.gx)*sc,(b.gy)*sc,b.size*sc,b.size*sc);
  }
  for(const u of st.units){
    if(u.dead) continue;
    if(u.owner!==0&&vis[(u.y|0)*S+(u.x|0)]!==2) continue;
    mmCtx.fillStyle=PCOLORS_U[u.owner]||'#ff8d7a';
    mmCtx.fillRect(u.x*sc-1,u.y*sc-1,2.4,2.4);
  }
  // camera frustum
  mmCtx.strokeStyle='rgba(240,235,220,0.85)';
  mmCtx.lineWidth=1;
  mmCtx.beginPath();
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  let started=false;
  for(const [cx,cy] of corners){
    const g=Render.screenToGround(cx,cy);
    if(!g) continue;
    const px=Math.min(Math.max(g.x,0),S)*sc, py=Math.min(Math.max(g.y,0),S)*sc;
    if(!started){mmCtx.moveTo(px,py);started=true;} else mmCtx.lineTo(px,py);
  }
  mmCtx.closePath(); mmCtx.stroke();
}
// ---------- selection / command card ----------
function onSelection(ids){
  curSel=ids;
  if(ids.length) curRes=null;
  refreshPanel();
}
function showResource(gx,gy){
  curRes=gx===null?null:{x:gx,y:gy};
  refreshResource();
}
function refreshResource(){
  if(!curRes) { if(!curSel.length){el.panel.innerHTML='<div class="dim">Nothing selected</div>';el.card.innerHTML='';} return; }
  const r=Sim.resAt(curRes.x,curRes.y);
  if(!r){ curRes=null; refreshPanel(); return; }
  el.panel.innerHTML='<div class="selname">'+r.name+'</div>'+
    '<div class="hpline">'+Math.ceil(r.amount)+' '+r.kind+' remaining</div>'+
    '<div class="dim">Right-click with villagers selected to gather</div>';
  el.card.innerHTML='';
}
function refreshPanel(){
  const ids=curSel.filter(id=>{const e=Sim.ent(id);return e&&!e.dead;});
  const p=Sim.st.players[0];
  if(!ids.length){ if(curRes){refreshResource();return;} el.panel.innerHTML='<div class="dim">Nothing selected</div>'; el.card.innerHTML=''; return; }
  const first=Sim.ent(ids[0]);
  if(ids.length===1){
    const e=first;
    const name=e.kind==='unit'?Sim.UNITS[e.ut].name:Sim.BLDGS[e.bt].name;
    let html='<div class="selname">'+name+(e.owner!==0?' <span class="foe">(enemy)</span>':'')+'</div>';
    html+='<div class="hpline">'+Math.ceil(e.hp)+' / '+e.maxhp+' HP</div>';
    if(e.kind==='unit'&&e.ut==='villager'&&e.carry>0.5)
      html+='<div class="dim">Carrying '+(e.carry|0)+' '+e.carryType+'</div>';
    if(e.kind==='bldg'&&!e.done)
      html+='<div class="dim">Under construction — '+((e.workDone/e.workNeed*100)|0)+'%</div>';
    if(e.kind==='bldg'&&e.queue&&e.queue.length){
      const it=e.queue[0];
      const nm=it.age?('Advancing to '+Sim.AGES[p.age+1]):Sim.UNITS[it.ut].name;
      html+='<div class="qline">'+nm+' <span class="qbar"><span style="width:'+(100-it.tLeft/it.tFull*100)+'%"></span></span>'+(e.queue.length>1?' +'+(e.queue.length-1):'')+'</div>';
    }
    el.panel.innerHTML=html;
  } else {
    const counts={};
    for(const id of ids){ const e=Sim.ent(id); const n=e.kind==='unit'?Sim.UNITS[e.ut].name:Sim.BLDGS[e.bt].name; counts[n]=(counts[n]||0)+1; }
    el.panel.innerHTML='<div class="selname">'+ids.length+' selected</div><div class="dim">'+
      Object.entries(counts).map(([n,c])=>c+'× '+n).join(' · ')+'</div>';
  }
  buildCard(ids,first);
}
function btn(label,sub,cb,disabled,title){
  const b=document.createElement('button');
  b.className='cbtn'+(disabled?' off':'');
  b.innerHTML='<span>'+label+'</span>'+(sub?'<small>'+sub+'</small>':'');
  if(title)b.title=title;
  b.onclick=()=>{ if(!disabled){cb();refreshPanel();} else Sfx.play('deny'); };
  el.card.appendChild(b);
  return b;
}
function buildCard(ids,first){
  el.card.innerHTML='';
  const p=Sim.st.players[0];
  if(first.owner!==0) return;
  const vills=ids.filter(id=>{const e=Sim.ent(id);return e&&e.ut==='villager';});
  const units=ids.filter(id=>{const e=Sim.ent(id);return e&&e.kind==='unit';});
  if(vills.length){
    for(const bt of BUILD_MENU){
      const d=Sim.BLDGS[bt];
      const locked=p.age<d.age;
      const afford=Sim.canAfford(0,d.cost);
      btn(d.name, locked?Sim.AGES[d.age]:costStr(d.cost),
        ()=>Input.startPlace(bt), locked||!afford,
        locked?'Requires '+Sim.AGES[d.age]:'');
    }
  }
  if(vills.length){
    for(const k of ['wood','food','gold'])
      btn('Gather '+k[0].toUpperCase()+k.slice(1),'auto-assign',
        ()=>{ Sim.cmdAutoGather(vills,k); Sfx.play('order'); },false);
  }
  if(units.length){ btn('Stop','S',()=>Sim.cmdStop(units),false); }
  if(ids.length===1&&first.kind==='bldg'&&first.done){
    const d=Sim.BLDGS[first.bt];
    for(const ut of (d.trains||[])){
      const ud=Sim.UNITS[ut];
      const locked=p.age<ud.age;
      btn('Train '+ud.name, locked?Sim.AGES[ud.age]:costStr(ud.cost),
        ()=>{ if(Sim.cmdTrain(first.id,ut)) Sfx.play('train'); else Sfx.play('deny'); },
        locked, locked?'Requires '+Sim.AGES[ud.age]:'');
    }
    if(first.bt==='towncenter'&&p.age<3){
      const c=Sim.AGE_COST[p.age+1];
      btn('Advance to '+Sim.AGES[p.age+1], costStr(c),
        ()=>{ if(Sim.cmdAge(first.id)) Sfx.play('train'); else Sfx.play('deny'); },
        !Sim.canAfford(0,c));
    }
  }
}
// ---------- top bar / toasts ----------
function refreshTop(){
  const p=Sim.st.players[0];
  el.wood.textContent=p.wood|0;
  el.food.textContent=p.food|0;
  el.gold.textContent=p.gold|0;
  el.pop.textContent=Sim.countPop(0)+' / '+p.popCap;
  el.age.textContent=Sim.AGES[p.age];
}
function toast(msg){
  el.toast.textContent=msg;
  el.toast.classList.add('show');
  clearTimeout(toastT);
  toastT=setTimeout(()=>el.toast.classList.remove('show'),2600);
}
function setHint(h){ el.hint.textContent=h; el.hint.style.display=h?'block':'none'; }
function ageBanner(age){
  el.banner.textContent=Sim.AGES[age];
  el.banner.classList.remove('show');
  void el.banner.offsetWidth;
  el.banner.classList.add('show');
}
function toggleHelp(){ el.help.classList.toggle('open'); }
function gameOver(winner){
  el.over.style.display='flex';
  q('over-title').textContent=winner===0?'Victory':'Defeat';
  q('over-sub').innerHTML=(winner===0
    ? 'Every rival Town Center has fallen. Your empire endures.'
    : 'Your Town Center lies in ruins.')+'<div id="finalscore">'+scoreHTML()+'</div>';
  el.over.className=winner===0?'win':'lose';
  Sfx.play(winner===0?'win':'lose');
}
// ---------- sim event fanout ----------
let lastWarn=0;
function onEvent(e){
  switch(e.t){
    case 'hit': Sfx.play('hit');
      { const t=Sim.ent(e.id);
        if(t&&t.owner===0&&t.kind==='bldg'&&performance.now()-lastWarn>9000){
          lastWarn=performance.now(); toast('Your base is under attack!'); Sfx.play('attack'); } }
      break;
    case 'boom': Sfx.play('boom'); break;
    case 'built': if(e.pi===0){Sfx.play('built');} refreshPanel(); break;
    case 'age': if(e.pi===0){Sfx.play('age');ageBanner(e.age);toast('You have advanced to the '+Sim.AGES[e.age]+'!');}
      else toast(PNAMES[e.pi]+' has advanced to the '+Sim.AGES[e.age]+'.');
      refreshPanel(); break;
    case 'eliminated': if(e.pi!==0){ toast(PNAMES[e.pi]+' has been eliminated!'); Sfx.play('boom'); } break;
    case 'msg': if(e.pi===0&&e.msg==='needhouse') toast('Build more houses to raise your population cap.'); break;
    case 'gameover': gameOver(e.winner); break;
    case 'spawn': refreshPanel(); break;
  }
}
// ---------- scorecard ----------
function scoreHTML(){
  const st=Sim.st;
  let rows='';
  for(let pi=0;pi<st.players.length;pi++){
    const p=st.players[pi], sc=st.scores[pi];
    const mil=sc.kills*20+sc.razings*60;
    const eco=Math.round(sc.res/10);
    const tech=p.age*500+sc.built*20;
    rows+='<tr'+(p.eliminated?' class="elim"':'')+'>'+
      '<td><span class="dot" style="background:'+PCOLORS[pi]+'"></span>'+PNAMES[pi]+(p.eliminated?' †':'')+'</td>'+
      '<td>'+Sim.AGES[p.age].split(' ')[0]+'</td><td>'+mil+'</td><td>'+eco+'</td><td>'+tech+'</td>'+
      '<td><b>'+(mil+eco+tech)+'</b></td></tr>';
  }
  return '<table><tr><th>Player</th><th>Age</th><th>Military</th><th>Economy</th><th>Tech</th><th>Total</th></tr>'+rows+'</table>'+
    (st.cheated?'<div class="cheatnote">Cheats were used — scores are unofficial.</div>':'');
}
function showScore(on){
  const w=q('scorewrap');
  if(on){ w.innerHTML='<div id="scorebox"><h2>Score</h2>'+scoreHTML()+'</div>'; w.style.display='flex'; }
  else w.style.display='none';
}
// ---------- chat console / cheats ----------
function openChat(){ chatOpen=true; el.chat.style.display='block'; el.chatIn.value=''; setTimeout(()=>el.chatIn.focus(),0); }
function closeChat(){ chatOpen=false; el.chat.style.display='none'; el.chatIn.blur(); }
function command(v){
  const c=v.toLowerCase();
  if(c==='show me the money'){ Sim.cheatMoney(0); toast('+10,000 of each resource'); Sfx.play('built'); }
  else if(c==='reveal'||c==='marco polo'){ Sim.cheatReveal(); UI2mm(); toast('Map revealed'); }
  else if(c==='warp speed'){ toast(Sim.cheatWarp()?'Warp speed: builds and training 20× faster':'Warp speed off'); }
  else if(c==='iddqd'){ const ids=Input.selection; if(!ids.length){toast('Select units first');return;}
    toast(Sim.cheatGod(ids)?'God mode ON for selected units':'God mode off'); }
  else if(c==='moo'){ Sim.cheatMoo(0); toast('The herd answers the call.'); Sfx.play('train'); }
  else toast('“'+v+'” — no one hears you. (Try a cheat code.)');
}
function UI2mm(){ mmT=0; }
let mmT=0, topT=0;
function tick(dt){
  if(curRes){ (tick._r=(tick._r||0)+dt)>0.5&&(tick._r=0,refreshResource()); }
  el.idle.textContent='Idle: '+Sim.idleVillagers(0).length;
  topT-=dt; if(topT<=0){topT=0.25;refreshTop();}
  mmT-=dt; if(mmT<=0){mmT=0.34;drawMinimap();}
  // live queue progress refresh when a building is selected
  if(curSel.length===1){ const e=Sim.ent(curSel[0]); if(e&&e.kind==='bldg'&&(e.queue.length||!e.done)){ if((tick._q=(tick._q||0)+dt)>0.5){tick._q=0;refreshPanel();} } }
}
return { init, initTitle, tick, onEvent, onSelection, toast, setHint, toggleHelp, refreshPanel, buildMinimapBase,
         showResource, showScore, ageBanner, openChat, closeChat, get chatOpen(){return chatOpen;} };
})();
