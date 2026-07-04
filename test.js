'use strict';
const Sim = require('./src/sim.js');
let fails = 0;
function ok(cond, msg){ console.log((cond?'PASS':'FAIL')+' - '+msg); if(!cond) fails++; }
function run(sec){ const dt=0.05; for(let t=0;t<sec;t+=dt) Sim.tick(dt); }

// ---------- Test 1: villager gather cycle ----------
{
  const st = Sim.newGame(42);
  const v = st.units.find(u=>u.owner===0&&u.ut==='villager');
  // find a tree near player 0 TC
  let tree=null;
  const tc = st.bldgs.find(b=>b.owner===0&&b.bt==='towncenter');
  let bd=1e9;
  for(let y=0;y<Sim.S;y++)for(let x=0;x<Sim.S;x++){
    if(st.tiles[y*Sim.S+x]===Sim.TREE){
      const d=Math.hypot(x-tc.x,y-tc.y);
      if(d<bd){bd=d;tree={x,y};}
    }
  }
  ok(!!tree,'tree exists near player TC (dist '+bd.toFixed(1)+')');
  const w0 = st.players[0].wood;
  Sim.cmdGatherTile([v.id],tree.x,tree.y);
  run(60);
  ok(st.players[0].wood>w0+5, 'villager gathered+deposited wood ('+(st.players[0].wood-w0).toFixed(1)+' in 60s)');
}

// ---------- Test 2: melee closes to range and damages a building (orbit regression) ----------
{
  const st = Sim.newGame(7);
  const etc = st.bldgs.find(b=>b.owner===1&&b.bt==='towncenter');
  // spawn a swordsman near enemy TC via direct state access
  const u = (function(){ Sim.cmdMove([],0,0); // noop to touch API
    return null; })();
  // use train path: cheat by pushing resources + spawn through sim internals is not exposed;
  // instead: order an existing villager across map to attack the TC (slow) — too slow.
  // Better: temporarily test melee with villager attack on a CLOSE target: player TC vs enemy villager? Not close.
  // Practical approach: give player0 a barracks next to enemy base is complex; instead directly craft unit:
  st.units.push(null); st.units.pop();
  // fabricate a swordsman using same shape as spawnUnit output:
  const s={id:99991,kind:'unit',owner:0,ut:'swordsman',x:etc.x+6.5,y:etc.y+0.5,dir:0,
    hp:64,maxhp:64,atk:8,state:'idle',path:null,pi:0,tgtId:0,resTile:null,farmId:0,buildId:0,
    carry:0,carryType:'',cool:0,scanT:0,repathT:0,gatherKind:'',fleeT:0,anim:0,dead:false};
  st.units.push(s); st.byId.set(s.id,s);
  const hp0=etc.hp;
  Sim.cmdAttack([s.id],etc.id);
  let reached=false, tMax=40, dt=0.05;
  for(let t=0;t<tMax;t+=dt){
    Sim.tick(dt);
    if(etc.hp<hp0-20){reached=true;break;}
    if(s.dead) break;
  }
  ok(reached, 'melee unit closed to range and damaged building (hp '+hp0+' -> '+etc.hp.toFixed(0)+')'+(s.dead?' [unit died to TC fire — still counts if dmg dealt]':''));
}

// ---------- Test 3: full AI vs AI match ----------
{
  const st = Sim.newGame(1234,{p0ai:true});
  st.players[0].isAI=true;
  const log=[];
  const dt=0.05;
  let firstFight=0, maxAge=[0,0], maxVill=[0,0], maxArmy=[0,0];
  for(let t=0;t<1500;t+=dt){
    Sim.tick(dt);
    for(const e of st.events){
      if(e.t==='hit'&&!firstFight) firstFight=st.time;
      if(e.t==='age') log.push(('t='+st.time.toFixed(0)+' P'+e.pi+' -> age '+e.age));
      if(e.t==='aiattack') log.push('t='+st.time.toFixed(0)+' P'+e.pi+' launches attack wave');
      if(e.t==='gameover') log.push('t='+st.time.toFixed(0)+' GAME OVER, winner P'+e.winner);
    }
    st.events.length=0;
    if((Math.round(t*20)%1200)===0){ // every 60s
      for(let p=0;p<2;p++){
        const vills=st.units.filter(u=>!u.dead&&u.owner===p&&u.ut==='villager').length;
        const army=st.units.filter(u=>!u.dead&&u.owner===p&&u.ut!=='villager').length;
        maxAge[p]=Math.max(maxAge[p],st.players[p].age);
        maxVill[p]=Math.max(maxVill[p],vills);
        maxArmy[p]=Math.max(maxArmy[p],army);
      }
      const P=st.players;
      log.push('t='+t.toFixed(0)+' | P0 v'+maxVill[0]+' a'+st.units.filter(u=>!u.dead&&u.owner===0&&u.ut!=='villager').length+' age'+P[0].age+' w'+(P[0].wood|0)+' f'+(P[0].food|0)+' g'+(P[0].gold|0)+
               ' | P1 v'+maxVill[1]+' a'+st.units.filter(u=>!u.dead&&u.owner===1&&u.ut!=='villager').length+' age'+P[1].age+' w'+(P[1].wood|0)+' f'+(P[1].food|0)+' g'+(P[1].gold|0));
    }
    if(st.over) break;
  }
  console.log(log.join('\n'));
  ok(maxVill[0]>=12&&maxVill[1]>=12, 'both AIs grew economies (villagers '+maxVill[0]+'/'+maxVill[1]+')');
  ok(maxAge[0]>=1&&maxAge[1]>=1, 'both AIs advanced at least one age ('+maxAge[0]+'/'+maxAge[1]+')');
  ok(maxArmy[0]>=6&&maxArmy[1]>=6, 'both AIs built armies ('+maxArmy[0]+'/'+maxArmy[1]+')');
  ok(firstFight>0, 'combat occurred (first hit at t='+firstFight.toFixed(0)+'s)');
  ok(st.over || st.time>=1400, 'match ran to completion or full duration; over='+st.over+' winner='+st.winner+' t='+st.time.toFixed(0));
  const fps = st.units.length;
  console.log('entities at end: '+st.units.length+' units, '+st.bldgs.length+' buildings');
}

console.log(fails===0 ? '\nALL TESTS PASSED' : '\n'+fails+' TEST(S) FAILED');
process.exit(fails===0?0:1);
