'use strict';
/* Empires 3D — bootstrap & main loop. */
const Main = (() => {
let last=0, acc=0, started=false;
const STEP=0.05;
function boot(){
  const seed=(Math.random()*1e9)|0;
  Sim.newGame(seed);
  const view=document.getElementById('view');
  Render.init(Sim,view);
  UI.init();
  Input.init(view);
  UI.toast('Your villagers await orders. Press H for help.');
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
  Input.tick(dt);
  UI.tick(dt);
  Render.update(dt);
}
function restart(){ location.reload(); }
window.addEventListener('load',boot);
return { restart };
})();
