'use strict';
/* Empires 3D — bootstrap & main loop. */
const Main = (() => {
let last=0, acc=0, started=false, intro=null;
const STEP=0.05;
function boot(){
  UI.initTitle(start);
}
function start(opts){
  const seed=(Math.random()*1e9)|0;
  Sim.newGame(seed,opts);
  const view=document.getElementById('view');
  Render.init(Sim,view);
  UI.init();
  Input.init(view);
  // grand opening: sweep from high over map center down to your Town Center
  const tc=Sim.st.bldgs.find(b=>b.owner===0&&b.bt==='towncenter');
  intro={t:0,dur:2.8,
    from:{x:Sim.S/2,z:Sim.S/2,d:58},
    to:{x:tc.x,z:tc.y+4,d:28}};
  Render.cam.tx=intro.from.x; Render.cam.tz=intro.from.z; Render.cam.dist=intro.from.d;
  Render.applyCam();
  const cancel=()=>{intro=null;window.removeEventListener('mousedown',cancel);window.removeEventListener('keydown',cancel);};
  window.addEventListener('mousedown',cancel); window.addEventListener('keydown',cancel);
  Sfx.play('age');
  started=true;
  last=performance.now();
  requestAnimationFrame(frame);
}
function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000; last=now;
  if(dt>0.25)dt=0.25;
  acc+=dt;
  let steps=0;
  while(acc>=STEP&&steps<8){ Sim.tick(STEP); acc-=STEP; steps++; }
  // fan out sim events
  for(const e of Sim.st.events){ Render.onEvent(e); UI.onEvent(e); }
  Sim.st.events.length=0;
  if(intro){
    intro.t+=dt;
    const e=Math.min(1,intro.t/intro.dur), k=1-Math.pow(1-e,3);
    Render.cam.tx=intro.from.x+(intro.to.x-intro.from.x)*k;
    Render.cam.tz=intro.from.z+(intro.to.z-intro.from.z)*k;
    Render.cam.dist=intro.from.d+(intro.to.d-intro.from.d)*k;
    Render.applyCam();
    if(e>=1){ intro=null; UI.ageBanner(0); UI.toast('Your villagers await orders. Press H for help.'); }
  } else {
    Input.tick(dt);
  }
  UI.tick(dt);
  Render.update(dt);
}
function restart(){ location.reload(); }
window.addEventListener('load',boot);
return { restart };
})();
