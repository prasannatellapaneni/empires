'use strict';
/* Empires 3D — input: mouse, keyboard, touch. */
const Input = (() => {
let dom, selection=[], placing=null, boxEl;
let mouse={x:0,y:0,nx:0,ny:0,down:false,downX:0,downY:0,boxing:false,mmb:false};
const keys={};
let edgePan=true;

function nrm(e){
  const r=dom.getBoundingClientRect();
  const x=(e.clientX!==undefined?e.clientX:e.pageX)-r.left;
  const y=(e.clientY!==undefined?e.clientY:e.pageY)-r.top;
  return {px:x,py:y,nx:(x/r.width)*2-1,ny:-(y/r.height)*2+1};
}
function setSelection(ids){
  selection=ids.filter(id=>{const e=Sim.ent(id);return e&&!e.dead;});
  Render.setSelection(selection);
  UI.onSelection(selection);
  if(selection.length) Sfx.play('select');
}
function mySelectedUnits(){ return selection.filter(id=>{const e=Sim.ent(id);return e&&e.kind==='unit'&&e.owner===0;}); }
function myVillagers(){ return selection.filter(id=>{const e=Sim.ent(id);return e&&e.ut==='villager'&&e.owner===0;}); }

// ---------- placement ----------
function startPlace(bt){
  if(!myVillagers().length) return;
  placing=bt;
  UI.setHint('Click to place '+Sim.BLDGS[bt].name+' — right-click or Esc to cancel');
}
function cancelPlace(){ placing=null; Render.hideGhost(); UI.setHint(''); }
function updateGhost(){
  if(!placing) return;
  const g=Render.screenToGround(mouse.nx,mouse.ny);
  if(!g) return;
  const d=Sim.BLDGS[placing];
  const gx=Math.round(g.x-d.size/2), gy=Math.round(g.y-d.size/2);
  const ok=Sim.canPlace(placing,gx,gy)&&Sim.canAfford(0,d.cost);
  Render.showGhost(placing,gx,gy,ok);
  mouse.pgx=gx; mouse.pgy=gy; mouse.pok=ok;
}

// ---------- orders ----------
function smartOrder(nx,ny){
  const ids=mySelectedUnits();
  if(!ids.length) return;
  const eid=Render.pickEntity(nx,ny);
  if(eid){
    const e=Sim.ent(eid);
    if(e&&e.owner!==0){ Sim.cmdAttack(ids,eid); Sfx.play('order'); return; }
    if(e&&e.owner===0&&e.kind==='bldg'){
      const vills=myVillagers();
      if(vills.length){
        if(!e.done){ Sim.cmdBuildTarget(vills,eid); Sfx.play('order'); return; }
        if(Sim.BLDGS[e.bt].farm){ Sim.cmdGatherFarm(vills,eid); Sfx.play('order'); return; }
      }
    }
  }
  const g=Render.screenToGround(nx,ny);
  if(!g) return;
  const gx=g.x|0, gy=g.y|0, S=Sim.S, st=Sim.st;
  const t=st.tiles[gy*S+gx];
  const vills=myVillagers();
  if(t!==Sim.GRASS&&st.res[gy*S+gx]>0&&vills.length){
    Sim.cmdGatherTile(vills,gx,gy);
    const others=ids.filter(id=>!vills.includes(id));
    if(others.length) Sim.cmdMove(others,g.x,g.y);
  } else {
    Sim.cmdMove(ids,g.x,g.y);
  }
  Sfx.play('order');
}
function selectAt(nx,ny,additive){
  const eid=Render.pickEntity(nx,ny);
  if(eid){
    const e=Sim.ent(eid);
    if(e&&e.owner===0){ setSelection(additive?[...new Set([...selection,eid])]:[eid]); return; }
    if(e){ setSelection([eid]); return; } // allow inspecting enemy
  }
  if(!additive) setSelection([]);
}
function boxSelect(x0,y0,x1,y1,additive){
  const r=dom.getBoundingClientRect();
  const ids=[];
  for(const u of Sim.st.units){
    if(u.dead||u.owner!==0) continue;
    const s=Render.worldToScreen(u.x,u.y);
    const sx=s.x*r.width, sy=s.y*r.height;
    if(sx>=Math.min(x0,x1)&&sx<=Math.max(x0,x1)&&sy>=Math.min(y0,y1)&&sy<=Math.max(y0,y1)) ids.push(u.id);
  }
  if(ids.length){
    const mil=ids.filter(id=>Sim.ent(id).ut!=='villager');
    setSelection(additive?[...new Set([...selection,...ids])]:ids);
  } else if(!additive) setSelection([]);
}

// ---------- events ----------
function init(container){
  dom=container;
  boxEl=document.getElementById('selbox');
  dom.addEventListener('contextmenu',e=>e.preventDefault());
  dom.addEventListener('mousedown',e=>{
    const p=nrm(e);
    if(e.button===1){ mouse.mmb=true; e.preventDefault(); return; }
    if(e.button===0){
      if(placing){ 
        if(mouse.pok){
          const b=Sim.cmdBuildPlace(myVillagers(),placing,mouse.pgx,mouse.pgy);
          if(b){ Sfx.play('place'); if(!e.shiftKey) cancelPlace(); else updateGhost(); }
        } else Sfx.play('deny');
        return;
      }
      mouse.down=true; mouse.downX=p.px; mouse.downY=p.py; mouse.boxing=false;
    }
    if(e.button===2){
      if(placing){ cancelPlace(); return; }
      smartOrder(p.nx,p.ny);
    }
  });
  dom.addEventListener('mousemove',e=>{
    const p=nrm(e);
    mouse.x=p.px; mouse.y=p.py; mouse.nx=p.nx; mouse.ny=p.ny;
    if(mouse.mmb){ Render.pan(-e.movementX*0.045*(Render.cam.dist/30),-e.movementY*0.045*(Render.cam.dist/30)); return; }
    if(placing){ updateGhost(); return; }
    if(mouse.down){
      if(Math.abs(p.px-mouse.downX)+Math.abs(p.py-mouse.downY)>7) mouse.boxing=true;
      if(mouse.boxing){
        boxEl.style.display='block';
        boxEl.style.left=Math.min(p.px,mouse.downX)+'px';
        boxEl.style.top=Math.min(p.py,mouse.downY)+'px';
        boxEl.style.width=Math.abs(p.px-mouse.downX)+'px';
        boxEl.style.height=Math.abs(p.py-mouse.downY)+'px';
      }
    }
  });
  window.addEventListener('mouseup',e=>{
    if(e.button===1){ mouse.mmb=false; return; }
    if(e.button!==0) return;
    if(placing) return;
    const p=nrm(e);
    if(mouse.boxing){ boxSelect(mouse.downX,mouse.downY,p.px,p.py,e.shiftKey); }
    else if(mouse.down){ selectAt(p.nx,p.ny,e.shiftKey); }
    mouse.down=false; mouse.boxing=false;
    boxEl.style.display='none';
  });
  dom.addEventListener('wheel',e=>{
    e.preventDefault();
    Render.zoom(e.deltaY>0?1.11:0.9);
  },{passive:false});
  window.addEventListener('keydown',e=>{
    keys[e.key.toLowerCase()]=true;
    if(e.key==='Escape'){ if(placing)cancelPlace(); else setSelection([]); }
    if(e.key.toLowerCase()==='h') UI.toggleHelp();
    if(e.key.toLowerCase()==='m') Sfx.toggleMute();
    if(e.key.toLowerCase()==='s'&&e.shiftKey===false&&selection.length){ Sim.cmdStop(mySelectedUnits()); }
    if(e.key==='F2'){ // select all military on screen? select all military
      const ids=Sim.st.units.filter(u=>!u.dead&&u.owner===0&&u.ut!=='villager').map(u=>u.id);
      if(ids.length) setSelection(ids);
    }
  });
  window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
  // touch
  let touches=new Map(), lastPinch=0, touchMoved=false, longT=null;
  dom.addEventListener('touchstart',e=>{
    e.preventDefault();
    for(const t of e.changedTouches) touches.set(t.identifier,{x:t.clientX,y:t.clientY});
    touchMoved=false;
    if(e.touches.length===1){
      const t=e.touches[0];
      longT=setTimeout(()=>{ const p=nrm(t); smartOrder(p.nx,p.ny); longT=null; },480);
    } else if(longT){clearTimeout(longT);longT=null;}
    if(e.touches.length===2){
      lastPinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    }
  },{passive:false});
  dom.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===1){
      const t=e.touches[0], prev=touches.get(t.identifier);
      if(prev){
        const dx=t.clientX-prev.x, dy=t.clientY-prev.y;
        if(Math.abs(dx)+Math.abs(dy)>6){ touchMoved=true; if(longT){clearTimeout(longT);longT=null;} }
        Render.pan(-dx*0.03*(Render.cam.dist/30),-dy*0.03*(Render.cam.dist/30));
        touches.set(t.identifier,{x:t.clientX,y:t.clientY});
      }
    } else if(e.touches.length===2){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      if(lastPinch>0) Render.zoom(lastPinch/d);
      lastPinch=d;
      if(longT){clearTimeout(longT);longT=null;}
    }
  },{passive:false});
  dom.addEventListener('touchend',e=>{
    e.preventDefault();
    if(longT){clearTimeout(longT);longT=null;
      if(!touchMoved&&e.changedTouches.length===1){
        const p=nrm(e.changedTouches[0]);
        if(placing){ updateGhostAt(p); if(mouse.pok){const b=Sim.cmdBuildPlace(myVillagers(),placing,mouse.pgx,mouse.pgy); if(b){Sfx.play('place');cancelPlace();}} }
        else selectAt(p.nx,p.ny,false);
      }
    }
    for(const t of e.changedTouches) touches.delete(t.identifier);
    lastPinch=0;
  },{passive:false});
  function updateGhostAt(p){ mouse.nx=p.nx;mouse.ny=p.ny;updateGhost(); }
}
function tick(dt){
  const sp=dt*22*(Render.cam.dist/30);
  if(keys['w']||keys['arrowup']) Render.pan(0,-sp);
  if(keys['arrowdown']||(keys['s']&&!selection.length)) Render.pan(0,sp);
  if(keys['a']||keys['arrowleft']) Render.pan(-sp,0);
  if(keys['d']||keys['arrowright']) Render.pan(sp,0);
  if(keys['q']) Render.rotate(dt*1.6);
  if(keys['e']) Render.rotate(-dt*1.6);
  if(keys['-']||keys['_']) Render.zoom(1+dt*1.2);
  if(keys['=']||keys['+']) Render.zoom(1-dt*1.2);
  // edge pan
  if(edgePan&&!mouse.mmb&&document.hasFocus()){
    const r=dom.getBoundingClientRect(), m=14;
    if(mouse.x>0&&mouse.y>0){
      if(mouse.x<m) Render.pan(-sp,0);
      else if(mouse.x>r.width-m) Render.pan(sp,0);
      if(mouse.y<m) Render.pan(0,-sp);
      else if(mouse.y>r.height-m&&mouse.y<r.height) Render.pan(0,sp);
    }
  }
  // prune dead from selection
  const alive=selection.filter(id=>{const e=Sim.ent(id);return e&&!e.dead;});
  if(alive.length!==selection.length) setSelection(alive);
}
return { init, tick, startPlace, cancelPlace, setSelection,
         get selection(){return selection;}, mySelectedUnits, myVillagers };
})();
