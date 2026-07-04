'use strict';
/* Empires 3D — simulation core. Pure logic, no DOM/THREE. */
const Sim = (() => {

// ---------- RNG / noise ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise(seed){
  const r = mulberry32(seed);
  const g = new Float32Array(256*256);
  for (let i=0;i<g.length;i++) g[i]=r();
  const v=(x,y)=>{x=((x%256)+256)%256;y=((y%256)+256)%256;return g[y*256+x];};
  const sm=t=>t*t*(3-2*t);
  return (x,y)=>{
    const x0=Math.floor(x),y0=Math.floor(y);
    const fx=sm(x-x0),fy=sm(y-y0);
    const a=v(x0,y0),b=v(x0+1,y0),c=v(x0,y0+1),d=v(x0+1,y0+1);
    return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
  };
}
function fbm(n,x,y,oct){let s=0,a=1,f=1,t=0;for(let i=0;i<oct;i++){s+=n(x*f,y*f)*a;t+=a;a*=0.5;f*=2;}return s/t;}

// ---------- constants ----------
const S = 96;                       // map size in tiles
const GRASS=0, TREE=1, BERRY=2, GOLD=3;
const AGES = ['Dark Age','Feudal Age','Castle Age','Imperial Age'];
const AGE_COST = [null,{food:400,gold:150},{food:700,gold:350},{food:1100,gold:650}];
const AGE_TIME = [0,40,55,70];
const POP_MAX = 60;

const UNITS = {
  villager:  {name:'Villager', hp:32, atk:3,  range:0.2, rof:1.5, speed:2.7, sight:5, cost:{food:60},          time:9,  pop:1, age:0, radius:0.27, bld:'towncenter'},
  swordsman: {name:'Swordsman',hp:64, atk:8,  range:0.2, rof:1.3, speed:2.8, sight:6, cost:{food:60,gold:25},  time:10, pop:1, age:0, radius:0.29, bld:'barracks', bonusBld:1.6},
  archer:    {name:'Archer',   hp:34, atk:6,  range:5.5, rof:1.7, speed:2.9, sight:7, cost:{wood:35,gold:40},  time:10, pop:1, age:1, radius:0.27, bld:'archery',  proj:11},
  knight:    {name:'Knight',   hp:120,atk:12, range:0.3, rof:1.4, speed:3.9, sight:6, cost:{food:70,gold:70},  time:14, pop:1, age:2, radius:0.34, bld:'stable'},
  catapult:  {name:'Catapult', hp:65, atk:32, range:7,   rof:4.5, speed:1.7, sight:7, cost:{wood:140,gold:120},time:20, pop:1, age:3, radius:0.42, bld:'workshop', proj:7, splash:1.3, bonusBld:3},
};
const BLDGS = {
  towncenter:{name:'Town Center', size:3, hp:650, cost:{},                 work:0,  age:0, sight:9, pop:10, atk:6, range:6.5, rof:2, drop:true, trains:['villager']},
  house:     {name:'House',       size:2, hp:170, cost:{wood:50},          work:16, age:0, sight:3, pop:5},
  farm:      {name:'Farm',        size:2, hp:90,  cost:{wood:60},          work:12, age:0, sight:2, farm:true},
  barracks:  {name:'Barracks',    size:3, hp:380, cost:{wood:150},         work:28, age:0, sight:5, trains:['swordsman']},
  archery:   {name:'Archery Range',size:3,hp:330, cost:{wood:160},         work:28, age:1, sight:5, trains:['archer']},
  stable:    {name:'Stable',      size:3, hp:380, cost:{wood:160},         work:28, age:2, sight:5, trains:['knight']},
  workshop:  {name:'Siege Workshop',size:3,hp:330,cost:{wood:200,gold:80}, work:32, age:3, sight:5, trains:['catapult']},
  tower:     {name:'Watch Tower', size:2, hp:300, cost:{wood:80,gold:80},  work:26, age:1, sight:9, atk:8, range:7.5, rof:2},
};
const RES_AMT = {[TREE]:120,[BERRY]:150,[GOLD]:500};
const RES_KIND = {[TREE]:'wood',[BERRY]:'food',[GOLD]:'gold'};
const GATHER_RATE = 0.9, FARM_RATE = 0.75, CARRY = 10;

// ---------- state ----------
let st = null;
const idx=(x,y)=>y*S+x;
const inB=(x,y)=>x>=0&&y>=0&&x<S&&y<S;

function newGame(seed, opts){
  opts = opts||{};
  const rand = mulberry32(seed|0);
  st = {
    seed:seed|0, size:S, time:0, over:false, winner:-1,
    tiles:new Uint8Array(S*S), res:new Float32Array(S*S), occ:new Int32Array(S*S),
    height:new Float32Array((S+1)*(S+1)),
    units:[], bldgs:[], proj:[], byId:new Map(), nextId:1,
    players:[mkPlayer(false),mkPlayer(true)],
    vis:[new Uint8Array(S*S), new Uint8Array(S*S)],
    claims:new Map(), events:[], visT:0, aiT:0, sepT:0,
    rand,
  };
  if (opts.p0ai) st.players[0].isAI = true;
  genMap(rand);
  return st;
}
function mkPlayer(isAI){
  return {wood:200, food:200, gold:100, age:0, popUsed:0, popCap:0, isAI,
          ai:{saving:false, wave:6, nextAtk:300, atkCool:0, lastReassign:0}};
}

// ---------- map generation ----------
function genMap(rand){
  const nH = makeNoise((st.seed^0x9e37)|1), nF = makeNoise((st.seed^0x51ab)|1);
  // heights (render-only)
  for (let y=0;y<=S;y++) for (let x=0;x<=S;x++)
    st.height[y*(S+1)+x] = (fbm(nH,x*0.045,y*0.045,4)-0.5)*3.4;
  const starts = [{x:15,y:15},{x:S-16,y:S-16}];
  // flatten around starts
  for (const s of starts) for (let y=0;y<=S;y++) for (let x=0;x<=S;x++){
    const d=Math.hypot(x-s.x,y-s.y);
    if (d<12){const k=Math.min(1,d/12);st.height[y*(S+1)+x]*=k*k;}
  }
  // forests
  for (let y=1;y<S-1;y++) for (let x=1;x<S-1;x++){
    const f = fbm(nF,x*0.07,y*0.07,3);
    const dMin = Math.min(...starts.map(s=>Math.hypot(x-s.x,y-s.y)));
    if (f>0.62 && dMin>7) setRes(x,y,TREE);
  }
  // scattered berry patches + gold mid-map
  scatterCluster(rand, S/2|0, S/2|0, 18, GOLD, 6);
  scatterCluster(rand, S/2|0, S/2|0, 22, BERRY, 8);
  // guarantee resources near each start (verification pass)
  for (const s of starts){
    ensureNear(rand, s, TREE, 34, 16);
    ensureNear(rand, s, BERRY, 7, 10);
    ensureNear(rand, s, GOLD, 10, 15);
  }
  // town centers + villagers
  for (let p=0;p<2;p++){
    const s = starts[p];
    clearRect(s.x-1,s.y-1,5);
    const tc = addBldg(p, 'towncenter', s.x-1, s.y-1, true);
    for (let i=0;i<4;i++) spawnUnit(p, 'villager', s.x+0.5+((i%2)*2-1)*1.9, s.y+0.5+(i<2?2.4:-2.4));
    tc.rally = {x:s.x+0.5, y:s.y+3.2};
  }
}
function setRes(x,y,t){ st.tiles[idx(x,y)]=t; st.res[idx(x,y)]=RES_AMT[t]; }
function clearRect(gx,gy,sz){
  for(let y=gy-1;y<gy+sz+1;y++)for(let x=gx-1;x<gx+sz+1;x++)
    if(inB(x,y)&&st.tiles[idx(x,y)]!==GRASS){st.tiles[idx(x,y)]=GRASS;st.res[idx(x,y)]=0;}
}
function scatterCluster(rand,cx,cy,spread,type,n){
  for(let i=0;i<n;i++){
    const x=cx+((rand()*2-1)*spread)|0, y=cy+((rand()*2-1)*spread)|0;
    growCluster(rand,x,y,type,type===GOLD?5:4);
  }
}
function growCluster(rand,x,y,type,n){
  let cx=x,cy=y;
  for(let i=0;i<n;i++){
    if(inB(cx,cy)&&st.tiles[idx(cx,cy)]===GRASS&&st.occ[idx(cx,cy)]===0) setRes(cx,cy,type);
    cx+=(rand()*3|0)-1; cy+=(rand()*3|0)-1;
    if(!inB(cx,cy)){cx=x;cy=y;}
  }
}
function ensureNear(rand,s,type,want,r){
  let have=0;
  for(let y=Math.max(1,s.y-r);y<Math.min(S-1,s.y+r);y++)
    for(let x=Math.max(1,s.x-r);x<Math.min(S-1,s.x+r);x++)
      if(st.tiles[idx(x,y)]===type && Math.hypot(x-s.x,y-s.y)<=r) have++;
  let guard=0;
  while(have<want && guard++<200){
    const a=rand()*Math.PI*2, d=6+rand()*(r-6);
    const x=(s.x+Math.cos(a)*d)|0, y=(s.y+Math.sin(a)*d)|0;
    if(inB(x,y)&&st.tiles[idx(x,y)]===GRASS&&st.occ[idx(x,y)]===0){
      growCluster(rand,x,y,type,type===TREE?7:4);
      have += type===TREE?5:3;
    }
  }
}

// ---------- helpers ----------
function ent(id){ return st.byId.get(id); }
function isBlocked(x,y){
  if(!inB(x,y)) return true;
  const i=idx(x,y);
  return st.tiles[i]!==GRASS || st.occ[i]!==0;
}
function canAfford(pi,cost){const p=st.players[pi];for(const k in cost)if(p[k]<cost[k])return false;return true;}
function pay(pi,cost,sign){const p=st.players[pi];for(const k in cost)p[k]-=cost[k]*(sign||1);}
function popOf(pi){return st.players[pi];}
function distRect(px,py,b){ // distance from point to building footprint rect
  const x0=b.gx,y0=b.gy,x1=b.gx+b.size,y1=b.gy+b.size;
  const dx=Math.max(x0-px,0,px-x1), dy=Math.max(y0-py,0,py-y1);
  return Math.hypot(dx,dy);
}
function closestOnRect(px,py,b){
  const x0=b.gx,y0=b.gy,x1=b.gx+b.size,y1=b.gy+b.size;
  return {x:Math.min(Math.max(px,x0),x1), y:Math.min(Math.max(py,y0),y1)};
}

// ---------- A* pathfinding ----------
const _g=new Float32Array(S*S), _ver=new Int32Array(S*S), _par=new Int32Array(S*S);
let _curVer=0;
const _heap=[]; // [f, idx]
function hPush(f,i){_heap.push([f,i]);let c=_heap.length-1;while(c>0){const p=(c-1)>>1;if(_heap[p][0]<=_heap[c][0])break;const t=_heap[p];_heap[p]=_heap[c];_heap[c]=t;c=p;}}
function hPop(){const top=_heap[0];const last=_heap.pop();if(_heap.length){_heap[0]=last;let c=0;for(;;){let l=c*2+1,r=l+1,m=c;if(l<_heap.length&&_heap[l][0]<_heap[m][0])m=l;if(r<_heap.length&&_heap[r][0]<_heap[m][0])m=r;if(m===c)break;const t=_heap[m];_heap[m]=_heap[c];_heap[c]=t;c=m;}}return top;}
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
function findPath(sx,sy,goalTest,hx,hy){
  sx|=0;sy|=0;
  if(!inB(sx,sy)) return null;
  _curVer++; _heap.length=0;
  const si=idx(sx,sy);
  _g[si]=0;_ver[si]=_curVer;_par[si]=-1;
  const oct=(ax,ay)=>{const dx=Math.abs(hx-ax),dy=Math.abs(hy-ay);return (dx+dy-0.586*Math.min(dx,dy))*1.1;};
  hPush(oct(sx,sy),si);
  let found=-1, expanded=0;
  while(_heap.length){
    const [,ci]=hPop();
    const cx=ci%S, cy=(ci/S)|0;
    if(goalTest(cx,cy)){found=ci;break;}
    if(++expanded>8000) break;
    for(const [dx,dy] of DIRS){
      const nx=cx+dx, ny=cy+dy;
      if(!inB(nx,ny)) continue;
      if(isBlocked(nx,ny) && !goalTest(nx,ny)) continue;
      if(dx&&dy&&(isBlocked(cx+dx,cy)||isBlocked(cx,cy+dy))) continue; // no corner cutting
      const ni=idx(nx,ny);
      const ng=_g[ci]+((dx&&dy)?1.414:1);
      if(_ver[ni]!==_curVer||ng<_g[ni]){
        _ver[ni]=_curVer;_g[ni]=ng;_par[ni]=ci;
        hPush(ng+oct(nx,ny),ni);
      }
    }
  }
  if(found<0) return null;
  const path=[];
  let c=found;
  while(c>=0){path.push({x:(c%S)+0.5,y:((c/S)|0)+0.5});c=_par[c];}
  path.reverse();
  if(path.length>1)path.shift();
  return path;
}
function goalAdjTile(tx,ty){return (x,y)=>Math.abs(x-tx)<=1&&Math.abs(y-ty)<=1&&!(x===tx&&y===ty);}
function goalAdjRect(b){return (x,y)=>{
  if(x>=b.gx&&x<b.gx+b.size&&y>=b.gy&&y<b.gy+b.size) return false;
  return x>=b.gx-1&&x<b.gx+b.size+1&&y>=b.gy-1&&y<b.gy+b.size+1;
};}
function goalPoint(tx,ty){const gx=tx|0,gy=ty|0;return (x,y)=>x===gx&&y===gy;}
function goalNear(tx,ty,r){return (x,y)=>Math.hypot(x+0.5-tx,y+0.5-ty)<=r;}

// ---------- entities ----------
function spawnUnit(owner,ut,x,y){
  const d=UNITS[ut], p=st.players[owner];
  const mul = ut==='villager'?1:(1+0.08*p.age);
  const u={id:st.nextId++, kind:'unit', owner, ut, x, y, dir:0,
    hp:Math.round(d.hp*mul), maxhp:Math.round(d.hp*mul), atk:d.atk*mul,
    state:'idle', path:null, pi:0, tgtId:0, resTile:null, farmId:0, buildId:0,
    carry:0, carryType:'', cool:0, scanT:Math.random()*0.4, repathT:0,
    gatherKind:'', fleeT:0, anim:0, dead:false};
  st.units.push(u); st.byId.set(u.id,u);
  st.events.push({t:'spawn',id:u.id});
  return u;
}
function addBldg(owner,bt,gx,gy,finished){
  const d=BLDGS[bt];
  const b={id:st.nextId++, kind:'bldg', owner, bt, gx, gy, size:d.size,
    x:gx+d.size/2, y:gy+d.size/2, hp:finished?d.hp:1, maxhp:d.hp,
    done:!!finished, workDone:finished?d.work:0, workNeed:d.work||1,
    builders:0, queue:[], cool:0, rally:{x:gx+d.size/2, y:gy+d.size+0.7},
    farmClaims:0, lastHit:-999, dead:false};
  st.bldgs.push(b); st.byId.set(b.id,b);
  for(let y=gy;y<gy+d.size;y++)for(let x=gx;x<gx+d.size;x++) st.occ[idx(x,y)]=b.id;
  if(finished) recalcPop(owner);
  // nudge any unit standing inside the footprint out to the perimeter
  for(const u of st.units){
    if(u.dead) continue;
    if(u.x>=gx-0.2&&u.x<=gx+d.size+0.2&&u.y>=gy-0.2&&u.y<=gy+d.size+0.2){
      const c=closestOnRect(u.x,u.y,b);
      let ox=u.x-c.x, oy=u.y-c.y;
      if(Math.abs(ox)<1e-4&&Math.abs(oy)<1e-4){ // dead center: push toward nearest edge
        const midx=gx+d.size/2, midy=gy+d.size/2;
        ox=u.x-midx||0.01; oy=u.y-midy||0.01;
      }
      const L=Math.hypot(ox,oy)||1;
      u.x=c.x+ox/L*0.55; u.y=c.y+oy/L*0.55;
      u.x=Math.min(Math.max(u.x,0.5),S-0.5); u.y=Math.min(Math.max(u.y,0.5),S-0.5);
      // if still inside (we were fully interior), place at rect edge outward
      if(u.x>gx&&u.x<gx+d.size&&u.y>gy&&u.y<gy+d.size){ u.y=gy+d.size+0.6; }
    }
  }
  st.events.push({t:'placed',id:b.id});
  return b;
}
function recalcPop(pi){
  const p=st.players[pi];
  let cap=0;
  for(const b of st.bldgs) if(!b.dead&&b.owner===pi&&b.done&&BLDGS[b.bt].pop) cap+=BLDGS[b.bt].pop;
  p.popCap=Math.min(cap,POP_MAX);
}
function countPop(pi){
  let n=0;
  for(const u of st.units) if(!u.dead&&u.owner===pi) n+=UNITS[u.ut].pop;
  for(const b of st.bldgs) if(!b.dead&&b.owner===pi) for(const q of b.queue) if(q.ut) n+=UNITS[q.ut].pop;
  return n;
}
function canPlace(bt,gx,gy){
  const d=BLDGS[bt]; if(!d) return false;
  if(gx<1||gy<1||gx+d.size>S-1||gy+d.size>S-1) return false;
  for(let y=gy;y<gy+d.size;y++)for(let x=gx;x<gx+d.size;x++){
    const i=idx(x,y);
    if(st.tiles[i]!==GRASS||st.occ[i]!==0) return false;
  }
  return true;
}

// ---------- claims (crowd-aware resource distribution) ----------
function claim(i,n){ st.claims.set(i,(st.claims.get(i)||0)+n); if((st.claims.get(i)||0)<=0) st.claims.delete(i); }
function claimsAt(i){ return st.claims.get(i)||0; }
function releaseRes(u){
  if(u.resTile){ claim(idx(u.resTile.x,u.resTile.y),-1); u.resTile=null; }
  if(u.farmId){ const f=ent(u.farmId); if(f) f.farmClaims=Math.max(0,f.farmClaims-1); u.farmId=0; }
}
function findRes(u,kind){
  // returns {tile:{x,y}} or {farm:b} or null; crowd-aware scoring
  const ux=u.x, uy=u.y;
  let best=null, bestS=1e9;
  const type = kind==='wood'?TREE:kind==='food'?BERRY:GOLD;
  const R=34;
  const x0=Math.max(1,(ux-R)|0), x1=Math.min(S-1,(ux+R)|0);
  const y0=Math.max(1,(uy-R)|0), y1=Math.min(S-1,(uy+R)|0);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const i=idx(x,y);
    if(st.tiles[i]!==type||st.res[i]<=0) continue;
    const s=Math.hypot(x+0.5-ux,y+0.5-uy)+4*claimsAt(i);
    if(s<bestS){bestS=s;best={tile:{x,y}};}
  }
  if(kind==='food'){
    for(const b of st.bldgs){
      if(b.dead||!b.done||b.owner!==u.owner||!BLDGS[b.bt].farm) continue;
      const s=Math.hypot(b.x-ux,b.y-uy)+7*b.farmClaims;
      if(s<bestS){bestS=s;best={farm:b};}
    }
  }
  return best;
}

// ---------- orders ----------
function stopUnit(u){ releaseRes(u); u.state='idle'; u.path=null; u.tgtId=0; u.buildId=0; }
function cmdMove(ids,x,y){
  const n=ids.length; let k=0;
  for(const id of ids){
    const u=ent(id); if(!u||u.dead||u.kind!=='unit') continue;
    stopUnit(u);
    const spread=Math.min(2.5,Math.sqrt(n)*0.45);
    const a=(k/Math.max(1,n))*Math.PI*2, r=n>1?spread*Math.sqrt(k/n):0;
    const tx=Math.min(Math.max(x+Math.cos(a)*r,0.5),S-0.5);
    const ty=Math.min(Math.max(y+Math.sin(a)*r,0.5),S-0.5);
    u.state='move';
    u.goal={x:tx,y:ty};
    u.path=findPath(u.x,u.y, isBlocked(tx|0,ty|0)?goalNear(tx,ty,1.6):goalPoint(tx,ty), tx,ty);
    u.pi=0; k++;
  }
  st.events.push({t:'order',x,y});
}
function cmdAttack(ids,tid){
  const t=ent(tid); if(!t||t.dead) return;
  for(const id of ids){
    const u=ent(id); if(!u||u.dead||u.kind!=='unit') continue;
    stopUnit(u);
    u.state='attack'; u.tgtId=tid; u.repathT=0;
  }
  st.events.push({t:'order',x:t.x,y:t.y,atk:true});
}
function cmdGatherTile(ids,gx,gy){
  const i=idx(gx,gy);
  if(st.tiles[i]===GRASS||st.res[i]<=0) return;
  const kind=RES_KIND[st.tiles[i]];
  for(const id of ids){
    const u=ent(id); if(!u||u.dead||u.ut!=='villager') continue;
    stopUnit(u);
    u.state='toRes'; u.resTile={x:gx,y:gy}; u.gatherKind=kind;
    claim(i,1);
    u.path=findPath(u.x,u.y,goalAdjTile(gx,gy),gx+0.5,gy+0.5); u.pi=0;
  }
  st.events.push({t:'order',x:gx+0.5,y:gy+0.5});
}
function cmdGatherFarm(ids,fid){
  const f=ent(fid); if(!f||f.dead||!BLDGS[f.bt].farm||!f.done) return;
  for(const id of ids){
    const u=ent(id); if(!u||u.dead||u.ut!=='villager') continue;
    stopUnit(u);
    u.state='toRes'; u.farmId=fid; u.gatherKind='food'; f.farmClaims++;
    u.path=findPath(u.x,u.y,goalAdjRect(f),f.x,f.y); u.pi=0;
  }
}
function cmdBuildPlace(ids,bt,gx,gy){
  const u0=ent(ids[0]); if(!u0) return null;
  const pi=u0.owner, d=BLDGS[bt];
  if(!canPlace(bt,gx,gy)||!canAfford(pi,d.cost)) return null;
  if(st.players[pi].age<d.age) return null;
  pay(pi,d.cost);
  const b=addBldg(pi,bt,gx,gy,false);
  cmdBuildTarget(ids,b.id);
  return b;
}
function cmdBuildTarget(ids,bid){
  const b=ent(bid); if(!b||b.dead||b.done) return;
  for(const id of ids){
    const u=ent(id); if(!u||u.dead||u.ut!=='villager') continue;
    stopUnit(u);
    u.state='toBuild'; u.buildId=bid;
    u.path=findPath(u.x,u.y,goalAdjRect(b),b.x,b.y); u.pi=0;
  }
}
function cmdTrain(bid,ut){
  const b=ent(bid); if(!b||b.dead||!b.done) return false;
  const d=UNITS[ut], p=st.players[b.owner];
  if(!d||!(BLDGS[b.bt].trains||[]).includes(ut)) return false;
  if(p.age<d.age) return false;
  if(b.queue.length>=5) return false;
  if(countPop(b.owner)+d.pop>p.popCap) { st.events.push({t:'msg',pi:b.owner,msg:'needhouse'}); return false; }
  if(!canAfford(b.owner,d.cost)) return false;
  pay(b.owner,d.cost);
  b.queue.push({ut,tLeft:d.time,tFull:d.time});
  return true;
}
function cmdAge(bid){
  const b=ent(bid); if(!b||b.dead||b.bt!=='towncenter'||!b.done) return false;
  const p=st.players[b.owner];
  if(p.age>=3) return false;
  const cost=AGE_COST[p.age+1];
  for(const q of b.queue) if(q.age) return false;
  if(!canAfford(b.owner,cost)) return false;
  pay(b.owner,cost);
  b.queue.unshift({age:true,tLeft:AGE_TIME[p.age+1],tFull:AGE_TIME[p.age+1]});
  return true;
}
function cmdStop(ids){ for(const id of ids){const u=ent(id); if(u&&!u.dead&&u.kind==='unit') stopUnit(u);} }

// ---------- damage / death ----------
function dmgMul(att,target){
  const d=UNITS[att.ut];
  if(target.kind==='bldg'&&d&&d.bonusBld) return d.bonusBld;
  return 1;
}
function applyDamage(target,dmg,attacker){
  if(target.dead) return;
  target.hp-=dmg;
  st.events.push({t:'hit',id:target.id,x:target.x,y:target.y});
  if(target.kind==='bldg') target.lastHit=st.time;
  // retaliation / flee
  if(attacker&&target.kind==='unit'&&!target.dead){
    if(target.ut!=='villager'){
      if(target.state==='idle'||(target.state==='move'&&!target.aMove)){
        target.state='attack'; target.tgtId=attacker.id; target.path=null; target.repathT=0;
      }
    } else if(st.players[target.owner].isAI && target.fleeT<=0){
      const tc=st.bldgs.find(b=>!b.dead&&b.owner===target.owner&&b.bt==='towncenter');
      if(tc){ releaseRes(target); target.state='move'; target.goal={x:tc.x,y:tc.y+2.5};
        target.path=findPath(target.x,target.y,goalNear(tc.x,tc.y+2.5,2),tc.x,tc.y+2.5); target.pi=0; target.fleeT=8; }
    }
  }
  if(target.hp<=0) kill(target);
}
function kill(e){
  e.dead=true; e.hp=0;
  st.events.push({t:'death',id:e.id,x:e.x,y:e.y,kind:e.kind});
  if(e.kind==='unit'){ releaseRes(e); }
  else {
    for(let y=e.gy;y<e.gy+e.size;y++)for(let x=e.gx;x<e.gx+e.size;x++)
      if(st.occ[idx(x,y)]===e.id) st.occ[idx(x,y)]=0;
    recalcPop(e.owner);
    if(e.bt==='towncenter'&&!st.over){
      st.over=true; st.winner=1-e.owner;
      st.events.push({t:'gameover',winner:st.winner});
    }
  }
}

// ---------- unit tick ----------
function moveAlong(u,dt,speedMul){
  if(!u.path||u.pi>=u.path.length) return true;
  const wp=u.path[u.pi];
  const dx=wp.x-u.x, dy=wp.y-u.y, d=Math.hypot(dx,dy);
  const step=UNITS[u.ut].speed*(speedMul||1)*dt;
  if(d<=Math.max(0.32,step)){ u.x=wp.x; u.y=wp.y; u.pi++; return u.pi>=u.path.length; }
  u.x+=dx/d*step; u.y+=dy/d*step; u.dir=Math.atan2(dy,dx); u.anim+=step;
  return false;
}
function steerTo(u,tx,ty,dt){
  const dx=tx-u.x, dy=ty-u.y, d=Math.hypot(dx,dy);
  if(d<1e-3) return;
  const step=Math.min(d,UNITS[u.ut].speed*dt);
  const nx=u.x+dx/d*step, ny=u.y+dy/d*step;
  if(!isBlocked(nx|0,ny|0)){ u.x=nx; u.y=ny; u.dir=Math.atan2(dy,dx); u.anim+=step; }
  else { u.repathT=0; } // force a repath
}
function inReach(u,t){
  const d=UNITS[u.ut];
  if(t.kind==='bldg'){
    return distRect(u.x,u.y,t)<=d.range+UNITS[u.ut].radius+0.35;
  }
  return Math.hypot(t.x-u.x,t.y-u.y)<=d.range+UNITS[u.ut].radius+UNITS[t.ut].radius+0.22;
}
function fireAt(u,t){
  const d=UNITS[u.ut];
  const dmg=u.atk*dmgMul(u,t);
  if(d.proj){
    const aim=t.kind==='bldg'?closestOnRect(u.x,u.y,t):{x:t.x,y:t.y};
    st.proj.push({x:u.x,y:u.y,sx:u.x,sy:u.y,tid:t.id,tx:aim.x,ty:aim.y,sp:d.proj,dmg,
      splash:d.splash||0,owner:u.owner,arc:u.ut==='catapult',age:0});
    st.events.push({t:'shoot',id:u.id,cat:u.ut==='catapult'});
  } else {
    applyDamage(t,dmg,u);
    st.events.push({t:'swing',id:u.id});
  }
  u.cool=d.rof;
  const aim=t.kind==='bldg'?closestOnRect(u.x,u.y,t):t;
  u.dir=Math.atan2(aim.y-u.y,aim.x-u.x);
}
function tickAttack(u,dt){
  const t=ent(u.tgtId);
  if(!t||t.dead){ u.state=u.aMove?'move':'idle'; u.tgtId=0; u.path=null; if(u.aMove&&u.goal){u.path=findPath(u.x,u.y,goalNear(u.goal.x,u.goal.y,1.5),u.goal.x,u.goal.y);u.pi=0;} return; }
  if(inReach(u,t)){
    u.path=null;
    if(u.cool<=0) fireAt(u,t);
    return;
  }
  // chase: straight steer when close (anti-orbit), path when far
  const aim=t.kind==='bldg'?closestOnRect(u.x,u.y,t):t;
  const d=Math.hypot(aim.x-u.x,aim.y-u.y);
  if(d<3.2){ steerTo(u,aim.x,aim.y,dt); return; }
  if(!u.path||u.pi>=u.path.length){
    if(u.repathT>0){ steerTo(u,aim.x,aim.y,dt); return; } // keep advancing during backoff
  } else if(u.repathT>0){ moveAlong(u,dt); return; }
  {
    u.repathT=1.1;
    const gt=t.kind==='bldg'?goalAdjRect(t):goalNear(t.x,t.y,Math.max(1.2,UNITS[u.ut].range));
    u.path=findPath(u.x,u.y,gt,aim.x,aim.y); u.pi=0;
    if(!u.path){ u.repathT=2.2; steerTo(u,aim.x,aim.y,dt); return; } // backoff + straight fallback
  }
  moveAlong(u,dt);
}
function nearestDrop(u){
  let best=null,bd=1e9;
  for(const b of st.bldgs){
    if(b.dead||!b.done||b.owner!==u.owner||!BLDGS[b.bt].drop) continue;
    const d=distRect(u.x,u.y,b);
    if(d<bd){bd=d;best=b;}
  }
  return best;
}
function tickVillager(u,dt){
  switch(u.state){
    case 'toRes':{
      let ax,ay,reach=false;
      if(u.farmId){
        const f=ent(u.farmId);
        if(!f||f.dead){ releaseRes(u); u.state='idle'; return; }
        reach=distRect(u.x,u.y,f)<=1.15; ax=f.x;ay=f.y;
      } else if(u.resTile){
        const i=idx(u.resTile.x,u.resTile.y);
        if(st.res[i]<=0){ retarget(u); return; }
        ax=u.resTile.x+0.5; ay=u.resTile.y+0.5;
        reach=Math.max(Math.abs(u.x-ax),Math.abs(u.y-ay))<=1.55;
      } else { u.state='idle'; return; }
      if(reach){ u.state='gather'; u.dir=Math.atan2(ay-u.y,ax-u.x); return; }
      if(moveAlong(u,dt)){
        // path exhausted but not in reach: nudge straight
        if(Math.hypot(ax-u.x,ay-u.y)<3) steerTo(u,ax,ay,dt);
        else if(u.repathT<=0 && !tryPath(u,u.farmId?goalAdjRect(ent(u.farmId)):goalAdjTile(u.resTile.x,u.resTile.y),ax,ay)) retarget(u);
      }
      return;
    }
    case 'gather':{
      let rate=GATHER_RATE, ok=false;
      if(u.farmId){ const f=ent(u.farmId); ok=f&&!f.dead; rate=FARM_RATE; }
      else if(u.resTile){ const i=idx(u.resTile.x,u.resTile.y); ok=st.res[i]>0;
        if(ok){ const take=Math.min(rate*dt, st.res[i], CARRY-u.carry); st.res[i]-=take; u.carry+=take;
          if(st.res[i]<=0){ st.tiles[i]=GRASS; st.events.push({t:'depleted',x:u.resTile.x,y:u.resTile.y}); } } }
      if(u.farmId&&ok) u.carry=Math.min(CARRY,u.carry+rate*dt);
      u.carryType=u.gatherKind;
      if(!ok&&u.carry<CARRY){ retarget(u); return; }
      if(u.carry>=CARRY-1e-4){
        const d=nearestDrop(u);
        if(!d){ u.state='idle'; return; }
        u.state='toDrop'; u.dropId=d.id;
        u.path=findPath(u.x,u.y,goalAdjRect(d),d.x,d.y); u.pi=0;
      }
      return;
    }
    case 'toDrop':{
      const b=ent(u.dropId);
      if(!b||b.dead){ const d2=nearestDrop(u); if(!d2){u.state='idle';return;} u.dropId=d2.id;
        u.path=findPath(u.x,u.y,goalAdjRect(d2),d2.x,d2.y); u.pi=0; return; }
      if(distRect(u.x,u.y,b)<=1.2){
        st.players[u.owner][u.carryType]+=u.carry; u.carry=0;
        st.events.push({t:'deposit',id:u.id});
        // go back
        if(u.farmId){ const f=ent(u.farmId); if(f&&!f.dead){ u.state='toRes'; u.path=findPath(u.x,u.y,goalAdjRect(f),f.x,f.y); u.pi=0; return; } u.farmId=0; }
        if(u.resTile){ const i=idx(u.resTile.x,u.resTile.y);
          if(st.res[i]>0){ u.state='toRes'; u.path=findPath(u.x,u.y,goalAdjTile(u.resTile.x,u.resTile.y),u.resTile.x+0.5,u.resTile.y+0.5); u.pi=0; return; } }
        retarget(u); return;
      }
      if(moveAlong(u,dt)){ if(distRect(u.x,u.y,b)<3) steerTo(u,b.x,b.y,dt); else tryPath(u,goalAdjRect(b),b.x,b.y); }
      return;
    }
    case 'toBuild':{
      const b=ent(u.buildId);
      if(!b||b.dead||b.done){ afterBuild(u,b); return; }
      if(distRect(u.x,u.y,b)<=1.15){ u.state='build'; u.dir=Math.atan2(b.y-u.y,b.x-u.x); return; }
      if(moveAlong(u,dt)){ if(distRect(u.x,u.y,b)<3) steerTo(u,b.x,b.y,dt); else tryPath(u,goalAdjRect(b),b.x,b.y); }
      return;
    }
    case 'build':{
      const b=ent(u.buildId);
      if(!b||b.dead||b.done){ afterBuild(u,b); return; }
      if(distRect(u.x,u.y,b)>1.4){ u.state='toBuild'; return; }
      b.builders++;
      return;
    }
  }
}
function tryPath(u,goalTest,hx,hy){
  if(u.repathT>0) return false;
  u.path=findPath(u.x,u.y,goalTest,hx,hy); u.pi=0;
  u.repathT = u.path? 0.6 : 2.0;
  return !!u.path;
}
function retarget(u){
  // find next resource of same kind
  const kind=u.gatherKind||u.carryType;
  releaseRes(u);
  if(!kind){ u.state='idle'; return; }
  const r=findRes(u,kind);
  if(!r){ if(u.carry>0.5){ const d=nearestDrop(u); if(d){u.state='toDrop';u.dropId=d.id;u.path=findPath(u.x,u.y,goalAdjRect(d),d.x,d.y);u.pi=0;return;} } u.state='idle'; return; }
  if(r.farm){ u.farmId=r.farm.id; r.farm.farmClaims++; u.state='toRes';
    u.path=findPath(u.x,u.y,goalAdjRect(r.farm),r.farm.x,r.farm.y); u.pi=0; }
  else { u.resTile=r.tile; claim(idx(r.tile.x,r.tile.y),1); u.state='toRes';
    u.path=findPath(u.x,u.y,goalAdjTile(r.tile.x,r.tile.y),r.tile.x+0.5,r.tile.y+0.5); u.pi=0; }
  if(!u.path) u.repathT=2.0;
}
function afterBuild(u,b){
  u.buildId=0;
  // if we just finished a farm, work it
  if(b&&!b.dead&&b.done&&BLDGS[b.bt].farm&&b.farmClaims<1){
    u.farmId=b.id; b.farmClaims++; u.gatherKind='food'; u.state='toRes';
    u.path=findPath(u.x,u.y,goalAdjRect(b),b.x,b.y); u.pi=0; return;
  }
  if(u.gatherKind){ retarget(u); return; }
  u.state='idle';
}
function tickUnit(u,dt){
  if(u.cool>0) u.cool-=dt;
  if(u.repathT>0) u.repathT-=dt;
  if(u.fleeT>0) u.fleeT-=dt;
  const d=UNITS[u.ut];
  switch(u.state){
    case 'idle':{
      if(u.ut!=='villager'){
        u.scanT-=dt;
        if(u.scanT<=0){ u.scanT=0.45;
          const e=nearestEnemy(u, d.sight+1.5);
          if(e){ u.state='attack'; u.tgtId=e.id; u.repathT=0; } }
      }
      return;
    }
    case 'move':{
      if(u.aMove){
        u.scanT-=dt;
        if(u.scanT<=0){ u.scanT=0.4;
          const e=nearestEnemy(u,d.sight+1);
          if(e){ u.state='attack'; u.tgtId=e.id; u.repathT=0; return; } }
      }
      if(moveAlong(u,dt)){
        if(u.goal&&Math.hypot(u.goal.x-u.x,u.goal.y-u.y)>1.8&&!u.retried){
          u.retried=true;
          u.path=findPath(u.x,u.y,goalNear(u.goal.x,u.goal.y,1.4),u.goal.x,u.goal.y);u.pi=0;
          if(u.path) return;
        }
        u.state='idle'; u.retried=false; u.aMove=false;
      }
      return;
    }
    case 'attack': tickAttack(u,dt); return;
    default:
      if(u.ut==='villager') tickVillager(u,dt);
      else u.state='idle';
  }
}
function nearestEnemy(u,r){
  let best=null,bd=r;
  for(const v of st.units){
    if(v.dead||v.owner===u.owner) continue;
    const d=Math.hypot(v.x-u.x,v.y-u.y);
    if(d<bd){bd=d;best=v;}
  }
  if(!best){
    for(const b of st.bldgs){
      if(b.dead||b.owner===u.owner) continue;
      const d=distRect(u.x,u.y,b);
      if(d<bd){bd=d;best=b;}
    }
  }
  return best;
}

// ---------- building tick ----------
function tickBldg(b,dt){
  const d=BLDGS[b.bt];
  if(!b.done){
    if(b.builders>0){
      const n=Math.min(3,b.builders);
      b.workDone+=dt*n*(n===1?1:(n===2?0.85:0.75));
      b.hp=Math.min(b.maxhp,Math.max(1,b.workDone/b.workNeed*b.maxhp));
      if(b.workDone>=b.workNeed){
        b.done=true; b.hp=b.maxhp;
        recalcPop(b.owner);
        st.events.push({t:'built',id:b.id,pi:b.owner,bt:b.bt});
      }
    }
    b.builders=0;
    return;
  }
  // training / research
  if(b.queue.length){
    const q=b.queue[0];
    q.tLeft-=dt;
    if(q.tLeft<=0){
      b.queue.shift();
      if(q.age){
        const p=st.players[b.owner]; p.age++;
        st.events.push({t:'age',pi:b.owner,age:p.age});
      } else {
        const sp=spawnPoint(b);
        const u=spawnUnit(b.owner,q.ut,sp.x,sp.y);
        if(b.rally){ if(q.ut==='villager'){ const gx=b.rally.x|0, gy=b.rally.y|0;
            if(inB(gx,gy)&&st.tiles[idx(gx,gy)]!==GRASS&&st.res[idx(gx,gy)]>0) cmdGatherTile([u.id],gx,gy);
            else cmdMove([u.id],b.rally.x,b.rally.y); }
          else cmdMove([u.id],b.rally.x,b.rally.y); }
      }
    }
  }
  // tower / TC attack
  if(d.atk){
    if(b.cool>0) b.cool-=dt;
    else {
      let best=null,bd=d.range;
      for(const v of st.units){
        if(v.dead||v.owner===b.owner) continue;
        const dist=distRect(v.x,v.y,b);
        if(dist<bd){bd=dist;best=v;}
      }
      if(best){
        st.proj.push({x:b.x,y:b.y,sx:b.x,sy:b.y,tid:best.id,tx:best.x,ty:best.y,sp:11,dmg:d.atk,splash:0,owner:b.owner,arc:false,age:0,tower:true});
        st.events.push({t:'shoot',id:b.id});
        b.cool=d.rof;
      }
    }
  }
}
function spawnPoint(b){
  const r=b.rally||{x:b.x,y:b.y+b.size};
  let best=null,bd=1e9;
  for(let y=b.gy-1;y<=b.gy+b.size;y++)for(let x=b.gx-1;x<=b.gx+b.size;x++){
    if(x>=b.gx&&x<b.gx+b.size&&y>=b.gy&&y<b.gy+b.size) continue;
    if(isBlocked(x,y)) continue;
    const d=Math.hypot(x+0.5-r.x,y+0.5-r.y);
    if(d<bd){bd=d;best={x:x+0.5,y:y+0.5};}
  }
  return best||{x:b.x,y:b.gy+b.size+0.6};
}

// ---------- projectiles ----------
function tickProj(p,dt){
  const t=ent(p.tid);
  if(t&&!t.dead){ const aim=t.kind==='bldg'?closestOnRect(p.sx,p.sy,t):t; p.tx=aim.x; p.ty=aim.y; }
  const dx=p.tx-p.x, dy=p.ty-p.y, d=Math.hypot(dx,dy);
  const step=p.sp*dt;
  p.age+=dt;
  if(d<=step||p.age>6){
    p.hit=true;
    if(p.splash>0){
      for(const v of st.units) if(!v.dead&&v.owner!==p.owner&&Math.hypot(v.x-p.tx,v.y-p.ty)<=p.splash) applyDamage(v,p.dmg,null);
      for(const b of st.bldgs) if(!b.dead&&b.owner!==p.owner&&distRect(p.tx,p.ty,b)<=p.splash) applyDamage(b,p.dmg,null);
      st.events.push({t:'boom',x:p.tx,y:p.ty});
    } else if(t&&!t.dead){
      applyDamage(t,p.dmg,null);
    }
    return;
  }
  p.x+=dx/d*step; p.y+=dy/d*step;
}

// ---------- separation (soft collision) ----------
function separate(){
  const cell=new Map();
  for(const u of st.units){
    if(u.dead) continue;
    const k=((u.x|0))+((u.y|0))*S;
    let a=cell.get(k); if(!a){a=[];cell.set(k,a);} a.push(u);
  }
  for(const u of st.units){
    if(u.dead) continue;
    const cx=u.x|0, cy=u.y|0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
      const a=cell.get((cx+ox)+(cy+oy)*S); if(!a) continue;
      for(const v of a){
        if(v===u||v.id<=u.id) continue;
        const dx=v.x-u.x, dy=v.y-u.y;
        const d=Math.hypot(dx,dy), min=UNITS[u.ut].radius+UNITS[v.ut].radius;
        if(d<min&&d>1e-5){
          const push=(min-d)*0.32, nx=dx/d, ny=dy/d;
          if(!isBlocked((u.x-nx*push)|0,(u.y-ny*push)|0)){u.x-=nx*push;u.y-=ny*push;}
          if(!isBlocked((v.x+nx*push)|0,(v.y+ny*push)|0)){v.x+=nx*push;v.y+=ny*push;}
        }
      }
    }
  }
}

// ---------- visibility ----------
function updateVis(){
  for(let pi=0;pi<2;pi++){
    const vis=st.vis[pi];
    for(let i=0;i<vis.length;i++) if(vis[i]===2) vis[i]=1;
    const mark=(x,y,r)=>{
      const r2=r*r;
      const x0=Math.max(0,(x-r)|0),x1=Math.min(S-1,(x+r)|0);
      const y0=Math.max(0,(y-r)|0),y1=Math.min(S-1,(y+r)|0);
      for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
        const dx=xx+0.5-x,dy=yy+0.5-y;
        if(dx*dx+dy*dy<=r2) vis[idx(xx,yy)]=2;
      }
    };
    for(const u of st.units) if(!u.dead&&u.owner===pi) mark(u.x,u.y,UNITS[u.ut].sight);
    for(const b of st.bldgs) if(!b.dead&&b.owner===pi) mark(b.x,b.y,BLDGS[b.bt].sight+b.size/2);
  }
}

// ---------- AI ----------
function aiTick(pi){
  const p=st.players[pi];
  const my=st.bldgs.filter(b=>!b.dead&&b.owner===pi);
  const tc=my.find(b=>b.bt==='towncenter');
  if(!tc) return;
  const myUnits=st.units.filter(u=>!u.dead&&u.owner===pi);
  const vills=myUnits.filter(u=>u.ut==='villager');
  const army=myUnits.filter(u=>u.ut!=='villager');
  const has=bt=>my.some(b=>b.bt===bt&&b.done);
  const building=bt=>my.some(b=>b.bt===bt&&!b.done);
  const count=bt=>my.filter(b=>b.bt===bt).length;
  const vTarget=[13,18,24,28][p.age];

  // --- age up intent + savings mode ---
  const wantAge = p.age<3 && vills.length>=[12,17,22,99][p.age];
  const ageCost = p.age<3?AGE_COST[p.age+1]:null;
  p.ai.saving = wantAge && ageCost && !(p.food>=ageCost.food&&p.gold>=ageCost.gold);
  if(wantAge && ageCost && canAfford(pi,ageCost) && tc.done && !tc.queue.some(q=>q.age)){
    cmdAge(tc.id); p.ai.saving=false;
  }

  // --- villagers ---
  if(vills.length<vTarget && tc.done && tc.queue.length<2 && canAfford(pi,UNITS.villager.cost)
     && countPop(pi)+1<=p.popCap && !(p.ai.saving&&vills.length>=15)) cmdTrain(tc.id,'villager');

  // --- houses ---
  if(p.popCap<POP_MAX && countPop(pi)+4>=p.popCap && !building('house')){
    aiBuild(pi,'house',tc,vills);
  }
  // --- military buildings ---
  if(!p.ai.saving){
    if(vills.length>=8 && !has('barracks') && !building('barracks')) aiBuild(pi,'barracks',tc,vills);
    if(p.age>=1 && !has('archery') && !building('archery')) aiBuild(pi,'archery',tc,vills);
    if(p.age>=2 && !has('stable') && !building('stable')) aiBuild(pi,'stable',tc,vills);
    if(p.age>=2 && count('barracks')<2 && !building('barracks')) aiBuild(pi,'barracks',tc,vills);
    if(p.age>=3 && !has('workshop') && !building('workshop')) aiBuild(pi,'workshop',tc,vills);
  }
  // --- farms ---
  const berriesLeft=countResNear(tc,BERRY,15);
  const farmMax=3+p.age*2;
  if(berriesLeft<3 && count('farm')<farmMax && !building('farm') && p.wood>=80) aiBuild(pi,'farm',tc,vills);

  // --- gatherer rebalancing (truthful labels + mismatch healing) ---
  const need = p.ai.saving ? {food:0.5,gold:0.34,wood:0.16}
             : p.age===0 ? {wood:0.42,food:0.44,gold:0.14}
             : {wood:0.36,food:0.4,gold:0.24};
  const workers={wood:[],food:[],gold:[]};
  const idle=[];
  for(const v of vills){
    if(v.state==='toBuild'||v.state==='build') continue;
    const k=v.gatherKind;
    if((v.state==='toRes'||v.state==='gather'||v.state==='toDrop')&&workers[k]) workers[k].push(v);
    else if(v.state==='idle') idle.push(v);
  }
  const totalW=workers.wood.length+workers.food.length+workers.gold.length+idle.length||1;
  const deficit=k=>need[k]*totalW-workers[k].length;
  const order=['food','wood','gold'].sort((a,b)=>deficit(b)-deficit(a));
  for(const v of idle){ assignGather(v,order[0],tc); workers[order[0]].push(v); }
  // heal one mismatch per tick
  if(st.time-p.ai.lastReassign>4){
    const over=['wood','food','gold'].sort((a,b)=>deficit(a)-deficit(b))[0];
    const under=order[0];
    if(over!==under && deficit(under)>1.2 && workers[over].length>1){
      const v=workers[over].find(w=>w.state==='gather'||w.state==='toRes');
      if(v){ assignGather(v,under,tc); p.ai.lastReassign=st.time; }
    }
  }

  // --- military training ---
  if(!p.ai.saving){
    for(const b of my){
      if(!b.done||!BLDGS[b.bt].trains||b.bt==='towncenter'||b.queue.length>=1) continue;
      const ut=BLDGS[b.bt].trains[0];
      if(countPop(pi)+1<=p.popCap && canAfford(pi,UNITS[ut].cost)) cmdTrain(b.id,ut);
    }
  }
  // rally military buildings to a muster point between tc and map center
  const mx=tc.x+(S/2-tc.x)*0.25, my2=tc.y+(S/2-tc.y)*0.25;
  for(const b of my) if(BLDGS[b.bt].trains&&b.bt!=='towncenter') b.rally={x:mx,y:my2};

  // --- defense ---
  const hurt=my.find(b=>st.time-b.lastHit<12);
  if(hurt){
    let foe=null,bd=16;
    for(const u of st.units){ if(u.dead||u.owner===pi) continue;
      const dd=Math.hypot(u.x-hurt.x,u.y-hurt.y); if(dd<bd){bd=dd;foe=u;} }
    if(foe){ const def=army.filter(a=>a.state==='idle'||(a.state==='move'&&!a.aMove));
      if(def.length) cmdAttack(def.map(a=>a.id),foe.id); }
  }
  // --- attack waves ---
  p.ai.atkCool-=1;
  if(st.time>p.ai.nextAtk && army.length>=p.ai.wave && p.ai.atkCool<=0){
    const foeB=st.bldgs.filter(b=>!b.dead&&b.owner!==pi);
    if(foeB.length){
      foeB.sort((a,b2)=>Math.hypot(a.x-tc.x,a.y-tc.y)-Math.hypot(b2.x-tc.x,b2.y-tc.y));
      const tgt=foeB[0];
      cmdAttack(army.map(a=>a.id),tgt.id);
      p.ai.wave=Math.min(24,p.ai.wave+4);
      p.ai.atkCool=90;
      st.events.push({t:'aiattack',pi});
    }
  }
}
function countResNear(b,type,r){
  let n=0;
  const x0=Math.max(0,(b.x-r)|0),x1=Math.min(S-1,(b.x+r)|0);
  const y0=Math.max(0,(b.y-r)|0),y1=Math.min(S-1,(b.y+r)|0);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
    if(st.tiles[idx(x,y)]===type&&st.res[idx(x,y)]>0) n++;
  return n;
}
function assignGather(v,kind,tc){
  const r=findRes(v,kind);
  if(!r) return false;
  v.gatherKind=kind;
  if(r.farm) cmdGatherFarm([v.id],r.farm.id);
  else cmdGatherTile([v.id],r.tile.x,r.tile.y);
  return true;
}
function aiBuild(pi,bt,tc,vills){
  const p=st.players[pi], d=BLDGS[bt];
  if(p.age<d.age||!canAfford(pi,d.cost)) return false;
  const spot=findSpot(bt,tc.x|0,tc.y|0);
  if(!spot) return false;
  // pick a close villager, prefer idle
  let v=null,bd=1e9;
  for(const w of vills){
    if(w.state==='build'||w.state==='toBuild') continue;
    let dd=Math.hypot(w.x-spot.x,w.y-spot.y);
    if(w.state==='idle') dd-=6;
    if(dd<bd){bd=dd;v=w;}
  }
  if(!v) return false;
  return !!cmdBuildPlace([v.id],bt,spot.x,spot.y);
}
function findSpot(bt,cx,cy){
  const sz=BLDGS[bt].size;
  for(let r=3;r<24;r++){
    for(let t=0;t<r*8;t++){
      const a=t/(r*8)*Math.PI*2;
      const x=(cx+Math.cos(a)*r)|0, y=(cy+Math.sin(a)*r)|0;
      if(canPlace(bt,x,y)&&clearAround(x,y,sz)) return {x,y};
    }
  }
  return null;
}
function clearAround(gx,gy,sz){
  // leave a 1-tile walkable margin so buildings don't wall each other in
  for(let y=gy-1;y<gy+sz+1;y++)for(let x=gx-1;x<gx+sz+1;x++){
    if(!inB(x,y)) return false;
    if(x>=gx&&x<gx+sz&&y>=gy&&y<gy+sz) continue;
    if(st.occ[idx(x,y)]!==0) return false;
  }
  return true;
}

// ---------- main tick ----------
function tick(dt){
  if(!st||st.over) return;
  st.time+=dt;
  for(const u of st.units) if(!u.dead) tickUnit(u,dt);
  for(const b of st.bldgs) if(!b.dead) tickBldg(b,dt);
  for(const p of st.proj) if(!p.hit) tickProj(p,dt);
  st.sepT-=dt;
  if(st.sepT<=0){ st.sepT=0.09; separate(); }
  st.visT-=dt;
  if(st.visT<=0){ st.visT=0.25; updateVis(); }
  st.aiT-=dt;
  if(st.aiT<=0){ st.aiT=1;
    for(let pi=0;pi<2;pi++) if(st.players[pi].isAI&&!st.over) aiTick(pi);
    for(let pi=0;pi<2;pi++) st.players[pi].popUsed=countPop(pi);
  }
  // compact dead
  if((st.time|0)%5===0){
    st.units=st.units.filter(u=>{if(u.dead)st.byId.delete(u.id);return !u.dead;});
    st.bldgs=st.bldgs.filter(b=>{if(b.dead)st.byId.delete(b.id);return !b.dead;});
    st.proj=st.proj.filter(p=>!p.hit);
  }
}

return {
  newGame, tick,
  get st(){return st;},
  cmdMove, cmdAttack, cmdGatherTile, cmdGatherFarm, cmdBuildPlace, cmdBuildTarget,
  cmdTrain, cmdAge, cmdStop, canPlace, canAfford, countPop, ent,
  UNITS, BLDGS, AGES, AGE_COST, S, GRASS, TREE, BERRY, GOLD,
  distRect,
};
})();
if (typeof module!=='undefined') module.exports = Sim;
