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

// ---------- Test 4: sprint 1 — age cap + cheats ----------
{
  const st = Sim.newGame(99,{difficulty:'easy'}); // cap active on easy
  st.players[1].wood=99999; st.players[1].food=99999; st.players[1].gold=99999;
  // give AI plenty of villagers virtually by running economy long enough is slow;
  // instead assert the cap gate directly: run 8 min, AI should never exceed player age 0
  run(480);
  ok(st.players[1].age<=st.players[0].age, 'AI never out-ages human with cap on (AI age '+st.players[1].age+', human '+st.players[0].age+')');
  const w0=st.players[0].wood;
  Sim.cheatMoney(0);
  ok(st.players[0].wood===w0+10000 && st.cheated, 'cheatMoney adds resources and marks match cheated');
  Sim.cheatReveal();
  ok(st.vis[0].every(v=>v>=1), 'cheatReveal marks whole map explored');
  Sim.cheatMoo(0);
  ok(st.units.some(u=>u.ut==='warcow'&&u.owner===0), 'moo spawns war cows');
  const cow=st.units.find(u=>u.ut==='warcow');
  Sim.cheatGod([cow.id]);
  cow.hp=cow.maxhp;
  const hpBefore=cow.hp;
  // direct damage attempt
  (function(){ const foe=st.units.find(u=>u.owner===1);
    // simulate a hit via a projectile landing: easiest is checking god flag honored by damage path
  })();
  ok(cow.god===true, 'god mode toggles on unit');
}

// ---------- Test 5: sprint 2 — 3-opponent FFA on 120 map ----------
{
  const st = Sim.newGame(555,{p0ai:true,opponents:3,difficulty:'normal'});
  ok(st.players.length===4, '4 players created');
  ok(Sim.S===120, 'map scaled to 120 for multi-opponent');
  ok(st.bldgs.filter(b=>b.bt==='towncenter').length===4, '4 town centers placed');
  const dt=0.05; let attacks=0, elims=0; const peaks=[0,0,0,0];
  for(let t=0;t<800;t+=dt){
    Sim.tick(dt);
    for(const e of st.events){ if(e.t==='aiattack')attacks++; if(e.t==='eliminated')elims++; }
    st.events.length=0;
    if(Math.round(t*20)%600===0)
      for(let pi=0;pi<4;pi++) peaks[pi]=Math.max(peaks[pi],st.units.filter(u=>!u.dead&&u.owner===pi&&u.ut==='villager').length);
    if(st.over) break;
  }
  ok(peaks.every(n=>n>=8), 'all four economies grew during the FFA (peak villagers: '+peaks.join('/')+')');
  ok(attacks>=1, 'FFA attack waves launched ('+attacks+')');
  console.log('FFA: eliminations='+elims+' over='+st.over+' winner='+st.winner+' t='+st.time.toFixed(0));
  ok(st.scores.some(sc=>sc.res>500), 'score tracking accumulates gathered resources');
}

// ---------- Test 6: economy sprint — camps, chaining, auto-gather ----------
{
  const st = Sim.newGame(31337);
  const vills = st.units.filter(u=>u.owner===0&&u.ut==='villager').map(u=>u.id);
  // auto-gather: one command, everyone works wood
  Sim.cmdAutoGather(vills,'wood');
  run(3);
  const busy = vills.filter(id=>{const u=Sim.ent(id);return u&&(u.state==='toRes'||u.state==='gather');}).length;
  ok(busy>=3, 'cmdAutoGather put villagers to work ('+busy+'/4)');
  // builder chain: queue two adjacent houses with ONE villager, no follow-up order
  st.players[0].wood=500;
  const v=vills[0];
  const u=Sim.ent(v);
  let spot=null;
  outer: for(let r=3;r<15;r++) for(let a=0;a<24;a++){
    const x=(u.x+Math.cos(a/24*6.28)*r)|0, y=(u.y+Math.sin(a/24*6.28)*r)|0;
    if(Sim.canPlace('house',x,y)&&Sim.canPlace('house',x+3,y)){spot={x,y};break outer;}
  }
  ok(!!spot,'found spot for chained houses');
  const b1=Sim.cmdBuildPlace([v],'house',spot.x,spot.y);
  const b2=Sim.cmdBuildPlace([v],'house',spot.x+3,spot.y); // second order overrides; chain must bring him back to b1
  run(90);
  ok(b1&&b2&&b1.done&&b2.done, 'one villager chained both constructions without re-orders (b1 '+(b1&&b1.done)+', b2 '+(b2&&b2.done)+')');
  // camp drop-off: place a lumber camp near his trees, verify deposits use it
  const st2 = Sim.newGame(777);
  const p0=st2.players[0]; p0.wood=500;
  const tc=st2.bldgs.find(b=>b.owner===0&&b.bt==='towncenter');
  let tree=null,bd=1e9;
  for(let y=0;y<Sim.S;y++)for(let x=0;x<Sim.S;x++)
    if(st2.tiles[y*Sim.S+x]===Sim.TREE){const d=Math.hypot(x-tc.x,y-tc.y);if(d<bd){bd=d;tree={x,y};}}
  let cspot=null;
  outer2: for(let r=2;r<8;r++) for(let a=0;a<24;a++){
    const x=(tree.x+Math.cos(a/24*6.28)*r)|0, y=(tree.y+Math.sin(a/24*6.28)*r)|0;
    if(Sim.canPlace('lumbercamp',x,y)){cspot={x,y};break outer2;}
  }
  const ids2=st2.units.filter(u2=>u2.owner===0&&u2.ut==='villager').map(u2=>u2.id);
  const camp=Sim.cmdBuildPlace(ids2,'lumbercamp',cspot.x,cspot.y);
  run(40);
  ok(camp&&camp.done,'lumber camp constructed');
  Sim.cmdAutoGather(ids2,'wood');
  const w0=p0.wood;
  run(45);
  ok(p0.wood-w0>40, 'camp-based gathering income healthy (+'+((p0.wood-w0)|0)+' wood in 45s with 4 villagers)');
  const CFGx=require('./src/config.js');
  ok(CFGx.UNITS.villager.hp===32&&CFGx.BLDGS.lumbercamp.drop[0]==='wood', 'config file loads with expected defaults');
}

// ---------- Test 6b: map connectivity between all starts ----------
{
  for(const [seed,opp] of [[88,1],[1234,1],[555,3],[42,3]]){
    const st=Sim.newGame(seed,{opponents:opp});
    const tcs=st.bldgs.filter(b=>b.bt==='towncenter');
    const seen=new Uint8Array(Sim.S*Sim.S);
    const s0=tcs[0];
    const q=[((s0.gy+s0.size)*Sim.S)+(s0.gx+1)]; seen[q[0]]=1;
    while(q.length){
      const c=q.pop(), cx=c%Sim.S, cy=(c/Sim.S)|0;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=cx+dx, ny=cy+dy;
        if(nx<0||ny<0||nx>=Sim.S||ny>=Sim.S) continue;
        const i=ny*Sim.S+nx;
        if(seen[i]||st.tiles[i]!==Sim.GRASS||st.occ[i]!==0) continue;
        seen[i]=1; q.push(i);
      }
    }
    const reached=tcs.slice(1).every(tc=>seen[((tc.gy+tc.size)*Sim.S)+(tc.gx+1)]);
    ok(reached, 'seed '+seed+' ('+(opp+1)+' players): all bases land-connected');
  }
}

// ---------- Test 7: combat depth — counters, techs, line upgrades ----------
{
  // equal-cost brawls in an open corner of the map
  function brawl(aType,aN,bType,bN){
    const st=Sim.newGame(4242);
    const cx=Sim.S/2, cy=Sim.S/2;
    const A=[],B=[];
    for(let i=0;i<aN;i++) A.push(Sim.debugSpawn(0,aType,cx-3+(i%3),cy-4+((i/3)|0)));
    for(let i=0;i<bN;i++) B.push(Sim.debugSpawn(1,bType,cx+3+(i%3),cy+4+((i/3)|0)));
    Sim.cmdAttack(A.map(u=>u.id),B[0].id);
    Sim.cmdAttack(B.map(u=>u.id),A[0].id);
    for(let t=0;t<90;t+=0.05){
      Sim.tick(0.05); st.events.length=0;
      const a=A.filter(u=>!u.dead).length, b=B.filter(u=>!u.dead).length;
      if(a===0||b===0) return {a,b};
    }
    return {a:A.filter(u=>!u.dead).length, b:B.filter(u=>!u.dead).length};
  }
  // ~420 resources each side
  let r=brawl('spearman',6,'knight',3);
  ok(r.a>0&&r.b===0, 'equal-cost: spearmen beat knights ('+r.a+' spears survive)');
  r=brawl('archer',6,'spearman',6);
  ok(r.b===0||r.a>r.b, 'equal-cost: archers beat spearmen (archers '+r.a+' vs spears '+r.b+')');
  r=brawl('knight',3,'archer',6);
  ok(r.a>0&&r.b===0, 'equal-cost: knights beat archers ('+r.a+' knights survive)');

  // blacksmith tech retrofits existing units
  const st=Sim.newGame(88);
  const sw=Sim.debugSpawn(0,'swordsman',20,20);
  const atk0=sw.atk;
  const p=st.players[0]; p.food=5000; p.gold=5000; p.wood=5000; p.age=2;
  const vills=st.units.filter(u=>u.owner===0&&u.ut==='villager').map(u=>u.id);
  let spot=null;
  const tc7=st.bldgs.find(b=>b.owner===0&&b.bt==='towncenter');
  outer3: for(let r2=4;r2<15;r2++) for(let a=0;a<24;a++){
    const x=(tc7.x+Math.cos(a/24*6.28)*r2)|0, y=(tc7.y+Math.sin(a/24*6.28)*r2)|0;
    if(Sim.canPlace('blacksmith',x,y)){spot={x,y};break outer3;}
  }
  const bs=Sim.cmdBuildPlace(vills,'blacksmith',spot.x,spot.y);
  run(30);
  ok(bs&&bs.done, 'blacksmith constructed');
  ok(Sim.availTechs(bs.id).includes('forging'), 'forging available at blacksmith');
  ok(Sim.cmdResearch(bs.id,'forging'), 'forging research queued');
  run(30);
  ok(sw.atk===atk0+1&&p.done.forging, 'forging retrofitted existing swordsman (+1 atk: '+atk0+' -> '+sw.atk+')');
  // line upgrade via barracks
  let bspot=null;
  outer4: for(let r2=4;r2<16;r2++) for(let a=0;a<24;a++){
    const x=(tc7.x+Math.cos(a/24*6.28)*r2)|0, y=(tc7.y+Math.sin(a/24*6.28)*r2)|0;
    if(Sim.canPlace('barracks',x,y)){bspot={x,y};break outer4;}
  }
  const bar=Sim.cmdBuildPlace(vills,'barracks',bspot.x,bspot.y);
  run(40);
  ok(bar&&bar.done,'barracks constructed');
  ok(Sim.cmdResearch(bar.id,'longsword'),'longswordsman upgrade queued');
  run(35);
  ok(sw.dispName==='Longswordsman'&&sw.maxhp>70, 'line upgrade retrofits: '+sw.dispName+' hp '+sw.maxhp);
}

console.log(fails===0 ? '\nALL TESTS PASSED' : '\n'+fails+' TEST(S) FAILED');
process.exit(fails===0?0:1);
