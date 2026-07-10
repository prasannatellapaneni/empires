'use strict';
/* Empires 3D — renderer (THREE r128, global). */
const Render = (() => {
const TEAM = [0x2f6fd6, 0xc0392b, 0x3f9b46, 0xcfa93a];
const TEAM_DARK = [0x1d4488, 0x7c241b, 0x265c2a, 0x7c6420];
let scene, camera, renderer, sim, dom;
let terrain, fogMesh, fogTex, fogCtx, fogData;
let sunLight, hemi;
let cam = { tx:16, tz:16, yaw:Math.PI*0.75, pitch:0.9, dist:30 };
const ents = new Map();       // id -> {group, parts, hp bars...}
const dying = [];
const fx = [];
let treeIM = null, treeSlots = new Map();
let bushIM=null, bushSlots=new Map(), goldIM=null, goldSlots=new Map();
let ghost = null;
let selRings = new Map();
let raycaster = new THREE.Raycaster();
const _v3 = new THREE.Vector3();

// ---------- canvas texture helpers ----------
function ctx2d(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c.getContext('2d'); }
function tex(c,rep){ const t=new THREE.CanvasTexture(c.canvas||c); t.encoding=THREE.sRGBEncoding;
  if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);} t.anisotropy=4; return t; }
function noisyFill(g,w,h,base,vary,n){
  g.fillStyle=base; g.fillRect(0,0,w,h);
  for(let i=0;i<n;i++){
    const r=Math.random();
    g.fillStyle='rgba('+vary[0]+','+vary[1]+','+vary[2]+','+(0.04+r*0.13)+')';
    const s=1+Math.random()*4;
    g.fillRect(Math.random()*w,Math.random()*h,s,s);
  }
}
function makeMat(opts){ return new THREE.MeshStandardMaterial(Object.assign({roughness:0.92,metalness:0.02},opts)); }
let MATS = null;
function buildMats(){
  // bark
  let g=ctx2d(64,64); noisyFill(g,64,64,'#5a4630',[20,12,4],380);
  for(let i=0;i<10;i++){g.fillStyle='rgba(30,20,8,0.35)';g.fillRect(Math.random()*64,0,2,64);}
  const bark=tex(g,1);
  // leaves
  g=ctx2d(64,64); noisyFill(g,64,64,'#3d6b2a',[110,160,60],420);
  const leaf=tex(g,1);
  const leafD=ctx2d(64,64); noisyFill(leafD,64,64,'#2e5a25',[90,140,60],420);
  // stone
  g=ctx2d(128,128); noisyFill(g,128,128,'#8d8a80',[60,58,52],700);
  g.strokeStyle='rgba(55,52,46,0.55)'; g.lineWidth=2;
  for(let y=0;y<128;y+=16){ g.beginPath();g.moveTo(0,y);g.lineTo(128,y);g.stroke();
    for(let x=((y/16)%2)*16;x<128;x+=32){g.beginPath();g.moveTo(x,y);g.lineTo(x,y+16);g.stroke();} }
  const stone=tex(g,1.5);
  // planks
  g=ctx2d(128,128); noisyFill(g,128,128,'#8a6a42',[40,28,12],500);
  g.strokeStyle='rgba(52,36,16,0.6)';g.lineWidth=2;
  for(let x=0;x<128;x+=18){g.beginPath();g.moveTo(x,0);g.lineTo(x,128);g.stroke();}
  const plank=tex(g,1.5);
  // thatch
  g=ctx2d(128,128); noisyFill(g,128,128,'#a98b4a',[80,60,20],400);
  g.strokeStyle='rgba(70,52,18,0.4)';g.lineWidth=1;
  for(let y=0;y<128;y+=5){g.beginPath();g.moveTo(0,y);g.lineTo(128,y+3);g.stroke();}
  const thatch=tex(g,2);
  // gold rock
  g=ctx2d(64,64); noisyFill(g,64,64,'#7d7a72',[50,48,44],260);
  for(let i=0;i<26;i++){g.fillStyle='rgba(235,190,40,0.9)';const s=1.5+Math.random()*3;
    g.fillRect(Math.random()*64,Math.random()*64,s,s);}
  const goldT=tex(g,1);
  // berry bush
  g=ctx2d(64,64); noisyFill(g,64,64,'#356225',[100,150,60],320);
  for(let i=0;i<20;i++){g.fillStyle='#c23a3a';g.beginPath();
    g.arc(Math.random()*64,Math.random()*64,2.2,0,7);g.fill();}
  const berryT=tex(g,1);
  // soil / crops
  g=ctx2d(64,64); noisyFill(g,64,64,'#6d5230',[40,28,14],300);
  g.strokeStyle='rgba(60,110,40,0.9)';g.lineWidth=3;
  for(let y=6;y<64;y+=10){g.beginPath();g.moveTo(2,y);g.lineTo(62,y);g.stroke();}
  const crop=tex(g,1);
  MATS = {
    bark:makeMat({map:bark}), leaf:makeMat({map:leaf}), leafDark:makeMat({map:tex(leafD,1)}),
    stone:makeMat({map:stone}), plank:makeMat({map:plank}), thatch:makeMat({map:thatch}),
    gold:makeMat({map:goldT}), berry:makeMat({map:berryT}), crop:makeMat({map:crop}),
    skin:makeMat({color:0xd9a878}), dark:makeMat({color:0x3a3126}),
    metal:new THREE.MeshStandardMaterial({color:0xb9bec6,roughness:0.35,metalness:0.75}),
    cow:(()=>{const g2=ctx2d(64,64);noisyFill(g2,64,64,'#e8e2d4',[210,205,195],150);
      for(let i=0;i<7;i++){g2.fillStyle='#3a3126';g2.beginPath();
        g2.ellipse(Math.random()*64,Math.random()*64,6+Math.random()*8,5+Math.random()*6,Math.random()*3,0,7);g2.fill();}
      return makeMat({map:tex(g2,1)});})(),
    wood:makeMat({color:0x6d4f2c}),
    horseA:makeMat({color:0x6e4a2a}), horseB:makeMat({color:0x4a361f}),
    team:TEAM.map(c=>makeMat({color:c})),
    teamDark:TEAM_DARK.map(c=>makeMat({color:c})),
  };
}

// ---------- terrain ----------
function hAt(x,y){ // bilinear height sample in sim coords
  const S=sim.S, H=Sim.st.height;
  x=Math.min(Math.max(x,0),S-0.001); y=Math.min(Math.max(y,0),S-0.001);
  const x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,W=S+1;
  const a=H[y0*W+x0],b=H[y0*W+x0+1],c=H[(y0+1)*W+x0],d=H[(y0+1)*W+x0+1];
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
}
function buildTerrain(){
  const S=sim.S, W=S+1, H=Sim.st.height;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(W*W*3), uv=new Float32Array(W*W*2);
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){
    const i=y*W+x;
    pos[i*3]=x; pos[i*3+1]=H[i]; pos[i*3+2]=y;
    uv[i*2]=x/S; uv[i*2+1]=1-y/S;
  }
  const idxA=new Uint32Array(S*S*6); let k=0;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const a=y*W+x,b=a+1,c=a+W,d=c+1;
    idxA[k++]=a;idxA[k++]=c;idxA[k++]=b; idxA[k++]=b;idxA[k++]=c;idxA[k++]=d;
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setIndex(new THREE.BufferAttribute(idxA,1));
  geo.computeVertexNormals();
  // painted ground texture
  const px=12, C=ctx2d(S*px,S*px), n=(x,y)=>Math.sin(x*12.9898+y*78.233)*43758.5453%1;
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const h=(H[y*(S+1)+x]+H[y*(S+1)+x+1]+H[(y+1)*(S+1)+x]+H[(y+1)*(S+1)+x+1])/4;
    const slope=Math.abs(H[y*(S+1)+x]-H[(y+1)*(S+1)+x+1]);
    const r0=Math.abs(n(x*0.7,y*0.7));
    let col;
    if(slope>0.55) col=[122,114,96];                    // rocky slope
    else if(h>1.15) col=[126,132,88];                    // dry highland
    else if(r0>0.82) col=[133,111,72];                   // dirt patch
    else { const g2=98+((r0*40)|0); col=[86+((r0*22)|0), g2+((h*8)|0), 52]; } // grass variety
    C.fillStyle='rgb('+col[0]+','+col[1]+','+col[2]+')';
    C.fillRect(x*px,y*px,px,px);
  }
  // speckle
  for(let i=0;i<S*S*3;i++){
    C.fillStyle='rgba(30,40,15,'+(0.05+Math.random()*0.1)+')';
    C.fillRect(Math.random()*S*px,Math.random()*S*px,2,2);
  }
  const t=tex(C); t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  terrain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:t,roughness:0.95,metalness:0}));
  terrain.receiveShadow=true;
  scene.add(terrain);
  // fog overlay (same geometry, offset)
  fogCtx=ctx2d(S,S);
  fogData=fogCtx.createImageData(S,S);
  fogTex=new THREE.CanvasTexture(fogCtx.canvas);
  fogTex.magFilter=THREE.LinearFilter; fogTex.minFilter=THREE.LinearFilter;
  const fmat=new THREE.MeshBasicMaterial({map:fogTex,transparent:true,depthWrite:false});
  fogMesh=new THREE.Mesh(geo.clone(),fmat);
  fogMesh.position.y=0.14; fogMesh.renderOrder=5;
  scene.add(fogMesh);
}
function updateFog(){
  const S=sim.S, vis=Sim.st.vis[0], d=fogData.data;
  for(let i=0;i<S*S;i++){
    const v=vis[i];
    d[i*4]=6; d[i*4+1]=8; d[i*4+2]=10;
    d[i*4+3]=v===2?0:(v===1?115:236);
  }
  fogCtx.putImageData(fogData,0,0);
  fogTex.needsUpdate=true;
}

// ---------- resources (instanced) ----------
const _m4=new THREE.Matrix4(), _q=new THREE.Quaternion(), _s=new THREE.Vector3(), _p=new THREE.Vector3();
function setInst(im,i,x,y,z,ry,sc){
  _p.set(x,y,z); _q.setFromEuler(new THREE.Euler(0,ry,0)); _s.set(sc,sc,sc);
  _m4.compose(_p,_q,_s); im.setMatrixAt(i,_m4); im.instanceMatrix.needsUpdate=true;
}
function buildResources(){
  const st=Sim.st, S=sim.S;
  const trees=[],bushes=[],golds=[];
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const t=st.tiles[y*S+x];
    if(t===Sim.TREE)trees.push([x,y]); else if(t===Sim.BERRY)bushes.push([x,y]); else if(t===Sim.GOLD)golds.push([x,y]);
  }
  // tree: merged trunk+canopy look via two IMs
  const trunkG=new THREE.CylinderGeometry(0.08,0.17,1.15,6);
  const pineG=new THREE.ConeGeometry(0.62,1.9,7);
  treeIM={
    trunk:new THREE.InstancedMesh(trunkG,MATS.bark,trees.length),
    pine:new THREE.InstancedMesh(pineG,MATS.leaf,trees.length),
    pine2:new THREE.InstancedMesh(new THREE.ConeGeometry(0.45,1.3,7),MATS.leafDark,trees.length),
  };
  for(const k in treeIM){treeIM[k].castShadow=true;treeIM[k].receiveShadow=true;scene.add(treeIM[k]);}
  trees.forEach(([x,y],i)=>{
    const wx=x+0.5+(Math.sin(x*7+y)*0.18), wz=y+0.5+(Math.cos(y*5+x)*0.18);
    const h=hAt(wx,wz), sc=0.85+((x*13+y*7)%40)/100, ry=(x*31+y*17)%6.28;
    setInst(treeIM.trunk,i,wx,h+0.55*sc,wz,ry,sc);
    setInst(treeIM.pine,i,wx,h+(1.05+0.75)*sc,wz,ry,sc);
    setInst(treeIM.pine2,i,wx,h+(1.05+1.5)*sc,wz,ry,sc);
    treeSlots.set(y*S+x,i);
  });
  const bushG=new THREE.IcosahedronGeometry(0.42,1);
  bushIM=new THREE.InstancedMesh(bushG,MATS.berry,bushes.length);
  bushIM.castShadow=true; scene.add(bushIM);
  bushes.forEach(([x,y],i)=>{ setInst(bushIM,i,x+0.5,hAt(x+0.5,y+0.5)+0.22,y+0.5,(x*3+y)%6.28,0.9+((x+y*3)%30)/100); bushSlots.set(y*S+x,i); });
  const goldG=new THREE.DodecahedronGeometry(0.46,0);
  goldIM=new THREE.InstancedMesh(goldG,MATS.gold,golds.length);
  goldIM.castShadow=true; goldIM.receiveShadow=true; scene.add(goldIM);
  golds.forEach(([x,y],i)=>{ setInst(goldIM,i,x+0.5,hAt(x+0.5,y+0.5)+0.25,y+0.5,(x*5+y*2)%6.28,0.95+((x*2+y)%25)/100); goldSlots.set(y*S+x,i); });
}
function onDepleted(x,y){
  const S=sim.S, i=y*S+x;
  if(treeSlots.has(i)){const s=treeSlots.get(i);for(const k in treeIM)setInst(treeIM[k],s,0,-99,0,0,0.001);}
  if(bushSlots.has(i)){setInst(bushIM,bushSlots.get(i),0,-99,0,0,0.001);}
  if(goldSlots.has(i)){setInst(goldIM,goldSlots.get(i),0,-99,0,0,0.001);}
}

// ---------- unit meshes ----------
function limb(mat,w,l){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,l,w),mat);
  m.geometry.translate(0,-l/2,0); m.castShadow=true; return m; }
function humanoid(owner,tunicMat,opts){
  opts=opts||{};
  const g=new THREE.Group(); const sc=opts.scale||1;
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.42,7),tunicMat);
  body.position.y=0.52; body.castShadow=true; g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,7),MATS.skin);
  head.position.y=0.85; head.castShadow=true; g.add(head);
  if(opts.helmet){ const h=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.16,8),MATS.metal); h.position.y=0.97; g.add(h); }
  if(opts.hat){ const h=new THREE.Mesh(new THREE.ConeGeometry(0.19,0.12,8),MATS.thatch); h.position.y=0.94; g.add(h); }
  if(opts.hood){ const h=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.2,8),MATS.teamDark[owner]); h.position.y=0.93; g.add(h); }
  const lA=limb(MATS.skin,0.07,0.34), rA=limb(MATS.skin,0.07,0.34);
  lA.position.set(-0.2,0.7,0); rA.position.set(0.2,0.7,0); g.add(lA); g.add(rA);
  const lL=limb(MATS.dark,0.09,0.34), rL=limb(MATS.dark,0.09,0.34);
  lL.position.set(-0.09,0.34,0); rL.position.set(0.09,0.34,0); g.add(lL); g.add(rL);
  g.scale.setScalar(sc);
  return {g,parts:{lA,rA,lL,rL,body,head}};
}
function makeUnitMesh(u){
  const o=u.owner;
  let h, extra={};
  if(u.ut==='villager'){
    h=humanoid(o,MATS.team[o],{hat:true});
    const sack=new THREE.Mesh(new THREE.SphereGeometry(0.11,6,5),MATS.thatch);
    sack.position.set(0,0.55,-0.2); sack.visible=false; h.g.add(sack); h.parts.sack=sack;
  } else if(u.ut==='swordsman'){
    h=humanoid(o,MATS.team[o],{helmet:true});
    const sw=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.5,0.05),MATS.metal);
    sw.position.set(0,-0.32,0.06); h.parts.rA.add(sw);
    const sh=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.04,10),MATS.teamDark[o]);
    sh.rotation.z=Math.PI/2; sh.position.set(-0.05,-0.2,0); h.parts.lA.add(sh);
  } else if(u.ut==='spearman'){
    h=humanoid(o,MATS.teamDark[o],{helmet:false,hat:false});
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.135,8,6),MATS.wood);
    cap.scale.y=0.7; cap.position.y=0.9; h.g.add(cap);
    const spear=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,1.5,5),MATS.wood);
    spear.position.set(0,-0.25,0.1); spear.rotation.x=0.25; h.parts.rA.add(spear);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.16,5),MATS.metal);
    tip.position.set(0,0.55,0.29); tip.rotation.x=0.25; h.parts.rA.add(tip);
  } else if(u.ut==='archer'){
    h=humanoid(o,MATS.team[o],{hood:true});
    const bow=new THREE.Mesh(new THREE.TorusGeometry(0.24,0.02,5,10,Math.PI),MATS.wood);
    bow.rotation.y=Math.PI/2; bow.position.set(0,-0.28,0); h.parts.lA.add(bow);
  } else if(u.ut==='knight'){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.26,0.85,8),MATS.horseA);
    body.rotation.z=Math.PI/2; body.rotation.y=Math.PI/2; body.position.y=0.55; body.castShadow=true; g.add(body);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.14,0.4,6),MATS.horseA);
    neck.position.set(0,0.8,0.42); neck.rotation.x=-0.7; g.add(neck);
    const hd=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.14,0.3),MATS.horseA);
    hd.position.set(0,0.95,0.6); g.add(hd);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.34,0.9),MATS.team[o]);
    cap.position.y=0.52; g.add(cap);
    const legs=[];
    for(let i=0;i<4;i++){ const L=limb(MATS.horseB||MATS.horseA,0.07,0.42);
      L.position.set(i<2?-0.15:0.15,0.42,i%2?0.3:-0.3); g.add(L); legs.push(L); }
    const rider=humanoid(o,MATS.team[o],{helmet:true,scale:0.85});
    rider.g.position.y=0.72; g.add(rider.g);
    const lance=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.03,1.1,5),MATS.wood);
    lance.position.set(0,-0.4,0.2); lance.rotation.x=1.2; rider.parts.rA.add(lance);
    h={g,parts:{lA:rider.parts.lA,rA:rider.parts.rA,lL:legs[0],rL:legs[1],l3:legs[2],l4:legs[3]}};
  } else if(u.ut==='warcow'){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.3,0.9,8),MATS.cow);
    body.rotation.z=Math.PI/2; body.rotation.y=Math.PI/2; body.position.y=0.55; body.castShadow=true; g.add(body);
    const hd=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.22,0.3),MATS.cow);
    hd.position.set(0,0.72,0.55); g.add(hd);
    for(const sx of [-1,1]){ const horn=new THREE.Mesh(new THREE.ConeGeometry(0.045,0.22,5),MATS.metal);
      horn.position.set(sx*0.15,0.88,0.55); horn.rotation.z=sx*-0.7; g.add(horn); }
    const legs=[];
    for(let i=0;i<4;i++){ const L=limb(MATS.cow,0.08,0.4);
      L.position.set(i<2?-0.16:0.16,0.42,i%2?0.28:-0.28); g.add(L); legs.push(L); }
    const cape=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.6),MATS.team[o]);
    cape.position.y=0.74; g.add(cape);
    h={g,parts:{lL:legs[0],rL:legs[1],l3:legs[2],l4:legs[3]}};
  } else { // catapult
    const g=new THREE.Group();
    const base=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.16,1.1),MATS.plank);
    base.position.y=0.3; base.castShadow=true; g.add(base);
    for(let i=0;i<4;i++){ const w=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.07,10),MATS.wood);
      w.rotation.z=Math.PI/2; w.position.set(i<2?-0.46:0.46,0.18,i%2?0.4:-0.4); g.add(w); }
    const arm=new THREE.Group(); arm.position.set(0,0.4,-0.35);
    const beam=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,1.15),MATS.wood);
    beam.geometry.translate(0,0,0.5); beam.castShadow=true; arm.add(beam);
    const cup=new THREE.Mesh(new THREE.SphereGeometry(0.11,6,5),MATS.dark);
    cup.position.set(0,0.05,1.05); arm.add(cup);
    arm.rotation.x=-0.9;
    g.add(arm);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(0.2,0.14),MATS.team[o]);
    flag.material=MATS.team[o]; flag.position.set(0,0.75,0.45); g.add(flag);
    h={g,parts:{arm}};
  }
  h.g.traverse(m=>{if(m.isMesh)m.castShadow=true;});
  return h;
}
// health bar sprites
function makeBar(){
  const bg=new THREE.Sprite(new THREE.SpriteMaterial({color:0x1a1512,depthTest:false}));
  const fg=new THREE.Sprite(new THREE.SpriteMaterial({color:0x53c234,depthTest:false}));
  bg.scale.set(0.9,0.09,1); fg.scale.set(0.86,0.055,1);
  bg.renderOrder=20; fg.renderOrder=21;
  return {bg,fg};
}

// ---------- building meshes ----------
function gable(w,d,mat){ const g=new THREE.Mesh(new THREE.CylinderGeometry(d*0.62,d*0.62,w,3),mat);
  g.rotation.z=Math.PI/2; g.rotation.y=Math.PI/2; g.rotation.x=Math.PI; g.scale.y=0.72; return g; }
function flagPole(owner,h){
  const g=new THREE.Group();
  const p=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,h,5),MATS.wood);
  p.position.y=h/2; g.add(p);
  const f=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.3),new THREE.MeshBasicMaterial({color:TEAM[owner],side:THREE.DoubleSide}));
  f.position.set(0.27,h-0.18,0); g.add(f);
  return g;
}
function makeBldgMesh(b){
  const o=b.owner, sz=b.size, g=new THREE.Group();
  const add=m=>{m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  if(b.bt==='towncenter'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(sz*0.95,0.9,sz*0.95),MATS.stone)); base.position.y=0.45;
    const up=add(new THREE.Mesh(new THREE.BoxGeometry(sz*0.7,0.85,sz*0.7),MATS.plank)); up.position.y=1.3;
    const roof=add(new THREE.Mesh(new THREE.ConeGeometry(sz*0.62,1.0,4),MATS.thatch)); roof.position.y=2.2; roof.rotation.y=Math.PI/4;
    g.add(flagPole(o,3.4));
  } else if(b.bt==='house'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(1.7,0.85,1.5),MATS.plank)); base.position.y=0.42;
    const roof=add(gable(1.85,1.7,MATS.thatch)); roof.position.y=1.15;
  } else if(b.bt==='farm'){
    const soil=add(new THREE.Mesh(new THREE.BoxGeometry(sz*0.98,0.12,sz*0.98),MATS.crop)); soil.position.y=0.06;
    for(let i=0;i<4;i++){ const post=add(new THREE.Mesh(new THREE.BoxGeometry(0.07,0.4,0.07),MATS.wood));
      post.position.set(i<2?-0.9:0.9,0.2,i%2?-0.9:0.9); }
  } else if(b.bt==='barracks'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(2.7,1.1,2.3),MATS.stone)); base.position.y=0.55;
    const roof=add(gable(2.85,2.4,MATS.plank)); roof.position.y=1.55;
    g.add(flagPole(o,2.6));
  } else if(b.bt==='archery'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(2.6,1,2.2),MATS.plank)); base.position.y=0.5;
    const roof=add(gable(2.75,2.3,MATS.thatch)); roof.position.y=1.4;
    const tgt=add(new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,0.08,10),MATS.berry));
    tgt.rotation.x=Math.PI/2; tgt.position.set(1.1,0.6,1.25);
    g.add(flagPole(o,2.5));
  } else if(b.bt==='stable'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(2.8,1.05,2.3),MATS.plank)); base.position.y=0.52;
    const roof=add(gable(2.95,2.45,MATS.thatch)); roof.position.y=1.5;
    const fence=add(new THREE.Mesh(new THREE.BoxGeometry(1.3,0.3,0.06),MATS.wood)); fence.position.set(-0.9,0.35,1.3);
    g.add(flagPole(o,2.6));
  } else if(b.bt==='workshop'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(2.7,1.15,2.4),MATS.stone)); base.position.y=0.57;
    const roof=add(gable(2.85,2.5,MATS.plank)); roof.position.y=1.65;
    const wheel=add(new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.08,12),MATS.wood));
    wheel.rotation.z=Math.PI/2; wheel.position.set(1.4,0.5,0.6);
    g.add(flagPole(o,2.8));
  } else if(b.bt==='mill'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(1.7,0.9,1.5),MATS.plank)); base.position.y=0.45;
    const roof=add(gable(1.85,1.6,MATS.thatch)); roof.position.y=1.2;
    const wheel=add(new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,0.07,10),MATS.wood));
    wheel.rotation.x=Math.PI/2; wheel.position.set(0,1.15,0.85);
    for(let i=0;i<4;i++){ const sail=add(new THREE.Mesh(new THREE.BoxGeometry(0.1,0.42,0.02),MATS.thatch));
      const a=i*Math.PI/2; sail.position.set(Math.cos(a)*0.34,1.15+Math.sin(a)*0.34,0.9); sail.rotation.z=a; }
  } else if(b.bt==='lumbercamp'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(1.6,0.8,1.3),MATS.plank)); base.position.y=0.4; base.position.x=-0.25;
    const roof=add(gable(1.75,1.4,MATS.plank)); roof.position.y=1.05; roof.position.x=-0.25;
    for(let i=0;i<3;i++){ const log=add(new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,1.1,7),MATS.bark));
      log.rotation.z=Math.PI/2; log.position.set(0.75,0.12+i*0.2,i%2?0.25:-0.05); }
  } else if(b.bt==='miningcamp'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(1.6,0.85,1.3),MATS.stone)); base.position.y=0.42; base.position.x=-0.2;
    const roof=add(gable(1.75,1.4,MATS.plank)); roof.position.y=1.1; roof.position.x=-0.2;
    const pile=add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.32,0),MATS.gold)); pile.position.set(0.75,0.25,0.3);
    const pile2=add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.24,0),MATS.gold)); pile2.position.set(0.7,0.2,-0.35);
  } else if(b.bt==='blacksmith'){
    const base=add(new THREE.Mesh(new THREE.BoxGeometry(1.7,0.95,1.5),MATS.stone)); base.position.y=0.47;
    const roof=add(gable(1.85,1.6,MATS.plank)); roof.position.y=1.25;
    const chim=add(new THREE.Mesh(new THREE.BoxGeometry(0.28,0.9,0.28),MATS.stone)); chim.position.set(0.55,1.45,-0.4);
    const anvil=add(new THREE.Mesh(new THREE.BoxGeometry(0.3,0.22,0.16),MATS.metal)); anvil.position.set(0.8,0.35,0.55);
    const block=add(new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,0.26,7),MATS.bark)); block.position.set(0.8,0.13,0.55);
  } else if(b.bt==='tower'){
    const base=add(new THREE.Mesh(new THREE.CylinderGeometry(0.72,0.86,2.7,9),MATS.stone)); base.position.y=1.35;
    const top=add(new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,0.4,9),MATS.stone)); top.position.y=2.9;
    for(let i=0;i<6;i++){ const c=add(new THREE.Mesh(new THREE.BoxGeometry(0.2,0.25,0.2),MATS.stone));
      const a=i/6*Math.PI*2; c.position.set(Math.cos(a)*0.78,3.2,Math.sin(a)*0.78); }
    g.add(flagPole(o,3.9));
  }
  return g;
}

// ---------- entity sync ----------
function syncEntities(){
  const st=Sim.st;
  const seen=new Set();
  for(const u of st.units){ if(!u.dead){ seen.add(u.id); ensureEnt(u); } }
  for(const b of st.bldgs){ if(!b.dead){ seen.add(b.id); ensureEnt(b); } }
  for(const [id,e] of ents){
    if(!seen.has(id)){
      // start death anim
      dying.push({g:e.group,t:0,kind:e.kind});
      if(e.bar){scene.remove(e.bar.bg);scene.remove(e.bar.fg);}
      removeRing(id);
      ents.delete(id);
    }
  }
}
function ensureEnt(e){
  let r=ents.get(e.id);
  if(!r){
    if(e.kind==='unit'){
      const m=makeUnitMesh(e);
      r={group:m.g,parts:m.parts,kind:'unit',bar:makeBar(),swing:0,ent:e};
    } else {
      const g=makeBldgMesh(e);
      const frame=new THREE.Mesh(new THREE.BoxGeometry(e.size*0.9,1,e.size*0.9),
        new THREE.MeshBasicMaterial({color:0xd9b36a,wireframe:true}));
      frame.position.y=0.5; g.add(frame);
      r={group:g,kind:'bldg',bar:makeBar(),frame,ent:e};
      g.position.set(e.x,hAt(e.x,e.y),e.y);
    }
    r.group.userData.eid=e.id;
    scene.add(r.group); scene.add(r.bar.bg); scene.add(r.bar.fg);
    ents.set(e.id,r);
  }
  r.ent=e;
  return r;
}
function updateEntities(dt){
  const st=Sim.st, vis=st.vis[0];
  for(const [id,r] of ents){
    const e=r.ent;
    const tileI=(e.y|0)*sim.S+(e.x|0);
    const visible = e.owner===0 || (e.kind==='bldg' ? vis[tileI]>=1 : vis[tileI]===2);
    r.group.visible=visible;
    r.bar.bg.visible=r.bar.fg.visible=false;
    if(!visible) continue;
    const h=hAt(e.x,e.y);
    if(e.kind==='unit'){
      r.group.position.set(e.x,h,e.y);
      // smooth facing: sim dir (atan2 in ground plane) -> yaw about Y
      const target=-e.dir+Math.PI/2;
      let cur=r.group.rotation.y;
      let diff=((target-cur+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
      r.group.rotation.y=cur+diff*Math.min(1,dt*10);
      // walk anim
      const moving=(e.state==='move'||e.state==='toRes'||e.state==='toDrop'||e.state==='toBuild'||(e.state==='attack'&&e.path));
      const ph=e.anim*3.1;
      const sw=moving?Math.sin(ph)*0.7:0;
      if(r.parts.lA){r.parts.lA.rotation.x=sw;r.parts.rA.rotation.x=-sw;}
      if(r.parts.lL){r.parts.lL.rotation.x=-sw;r.parts.rL.rotation.x=sw;}
      if(r.parts.l3){r.parts.l3.rotation.x=sw;r.parts.l4.rotation.x=-sw;}
      // working anim (gather/build): chop with right arm
      if(e.state==='gather'||e.state==='build'){
        r.workT=(r.workT||0)+dt*4.5;
        if(r.parts.rA)r.parts.rA.rotation.x=-1.2+Math.abs(Math.sin(r.workT))*1.4;
      }
      if(r.swing>0){ r.swing-=dt*4;
        if(r.parts.rA)r.parts.rA.rotation.x=-1.6+ (1-r.swing)*1.9; }
      if(r.parts.arm){ // catapult arm
        if(r.fireT>0){ r.fireT-=dt; r.parts.arm.rotation.x=-0.9+Math.max(0,Math.sin((0.5-r.fireT)*6))*1.1; }
        else r.parts.arm.rotation.x=-0.9;
      }
      if(r.parts.sack) r.parts.sack.visible=e.carry>0.5;
    } else {
      // building: construction scale
      const prog=e.done?1:Math.max(0.12,e.workDone/e.workNeed);
      r.group.scale.y=prog;
      if(r.frame){ r.frame.visible=!e.done; if(e.done){r.group.remove(r.frame);r.frame=null;} }
    }
    // health bar
    if(e.hp<e.maxhp-0.5){
      const ratio=Math.max(0,e.hp/e.maxhp);
      const y=h+(e.kind==='bldg'?(e.size+0.6):1.25);
      r.bar.bg.position.set(e.x,y,e.y);
      r.bar.fg.position.set(e.x-(1-ratio)*0.43,y,e.y);
      r.bar.fg.scale.x=0.86*ratio;
      r.bar.fg.material.color.setHex(ratio>0.5?0x53c234:ratio>0.25?0xd9a520:0xc0392b);
      const w=e.kind==='bldg'?1.6:0.9;
      r.bar.bg.scale.x=w; r.bar.fg.scale.x=(w-0.06)*ratio;
      r.bar.fg.position.x=e.x-(1-ratio)*(w-0.06)/2;
      r.bar.bg.visible=r.bar.fg.visible=true;
    }
  }
  // deaths
  for(let i=dying.length-1;i>=0;i--){
    const d=dying[i]; d.t+=dt;
    if(d.kind==='unit'){ d.g.rotation.x=Math.min(Math.PI/2,d.t*3); d.g.position.y-=dt*(d.t>0.6?0.8:0); }
    else { d.g.position.y-=dt*1.4; d.g.rotation.z=d.t*0.12; }
    if(d.t>1.4){ scene.remove(d.g); dying.splice(i,1); }
  }
}

// ---------- projectiles + fx ----------
const projMeshes=new Map();
function updateProjectiles(){
  const st=Sim.st, seen=new Set();
  for(const p of st.proj){
    if(p.hit) continue;
    let m=projMeshes.get(p);
    if(!m){
      if(p.arc){ m=new THREE.Mesh(new THREE.SphereGeometry(0.14,6,5),MATS.dark); }
      else { m=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.03,0.5),MATS.wood); }
      scene.add(m); projMeshes.set(p,m);
    }
    seen.add(p);
    const total=Math.hypot(p.tx-p.sx,p.ty-p.sy)||1;
    const done=1-Math.hypot(p.tx-p.x,p.ty-p.y)/total;
    const arcH=p.arc?Math.sin(done*Math.PI)*2.6:Math.sin(done*Math.PI)*(p.tower?1.6:0.9);
    m.position.set(p.x,hAt(p.x,p.y)+0.9+arcH,p.y);
    if(!p.arc) m.lookAt(p.tx,hAt(p.tx,p.ty)+0.9,p.ty);
    m.visible = Sim.st.vis[0][(p.y|0)*sim.S+(p.x|0)]===2;
  }
  for(const [p,m] of projMeshes) if(!seen.has(p)){ scene.remove(m); projMeshes.delete(p); }
}
function addFx(x,y,kind){
  if(kind==='boom'){
    const m=new THREE.Mesh(new THREE.RingGeometry(0.1,0.35,16),
      new THREE.MeshBasicMaterial({color:0xd9903a,transparent:true,opacity:0.9,side:THREE.DoubleSide}));
    m.rotation.x=-Math.PI/2; m.position.set(x,hAt(x,y)+0.15,y);
    scene.add(m); fx.push({m,t:0,kind});
  } else if(kind==='hit'){
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.09,5,4),
      new THREE.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:0.95}));
    m.position.set(x,hAt(x,y)+0.8,y); scene.add(m); fx.push({m,t:0,kind});
  } else if(kind==='order'||kind==='orderAtk'){
    const m=new THREE.Mesh(new THREE.RingGeometry(0.3,0.42,20),
      new THREE.MeshBasicMaterial({color:kind==='orderAtk'?0xd94b3a:0x7fd45b,transparent:true,opacity:0.95,side:THREE.DoubleSide}));
    m.rotation.x=-Math.PI/2; m.position.set(x,hAt(x,y)+0.1,y);
    scene.add(m); fx.push({m,t:0,kind});
  }
}
function updateFx(dt){
  for(let i=fx.length-1;i>=0;i--){
    const f=fx[i]; f.t+=dt;
    if(f.kind==='boom'){ f.m.scale.setScalar(1+f.t*6); f.m.material.opacity=0.9-f.t*1.6; }
    else if(f.kind==='hit'){ f.m.scale.setScalar(1+f.t*3); f.m.material.opacity=0.95-f.t*3; f.m.position.y+=dt*1.2; }
    else { f.m.scale.setScalar(Math.max(0.05,1-f.t*1.4)); f.m.material.opacity=0.95-f.t*1.5; }
    if(f.t>0.7){ scene.remove(f.m); f.m.material.dispose(); fx.splice(i,1); }
  }
}

// ---------- selection rings + ghost ----------
function setSelection(ids){
  const want=new Set(ids);
  for(const id of [...selRings.keys()]) if(!want.has(id)) removeRing(id);
  for(const id of ids){
    if(selRings.has(id)) continue;
    const e=Sim.ent(id); if(!e) continue;
    const rad=e.kind==='bldg'?e.size*0.72:0.42;
    const m=new THREE.Mesh(new THREE.RingGeometry(rad,rad+0.09,24),
      new THREE.MeshBasicMaterial({color:0x8ee06a,side:THREE.DoubleSide,transparent:true,opacity:0.95,depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.renderOrder=4;
    scene.add(m); selRings.set(id,m);
  }
}
function removeRing(id){ const m=selRings.get(id); if(m){scene.remove(m);selRings.delete(id);} }
function updateRings(){
  for(const [id,m] of selRings){
    const e=Sim.ent(id);
    if(!e||e.dead){ removeRing(id); continue; }
    m.position.set(e.x,hAt(e.x,e.y)+0.08,e.y);
  }
}
let rallyMarker=null;
function showRally(x,y){
  if(!rallyMarker){
    rallyMarker=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.1,5),MATS.wood);
    pole.position.y=0.55; rallyMarker.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.3),
      new THREE.MeshBasicMaterial({color:TEAM[0],side:THREE.DoubleSide}));
    flag.position.set(0.26,0.92,0); rallyMarker.add(flag);
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.3,0.4,18),
      new THREE.MeshBasicMaterial({color:TEAM[0],side:THREE.DoubleSide,transparent:true,opacity:0.8,depthWrite:false}));
    ring.rotation.x=-Math.PI/2; ring.position.y=0.06; rallyMarker.add(ring);
    scene.add(rallyMarker);
  }
  rallyMarker.visible=true;
  rallyMarker.position.set(x,hAt(x,y),y);
}
function hideRally(){ if(rallyMarker) rallyMarker.visible=false; }
let tileRing=null;
function ringTile(gx,gy){
  if(tileRing){scene.remove(tileRing);tileRing=null;}
  if(gx===null) return;
  tileRing=new THREE.Mesh(new THREE.RingGeometry(0.55,0.68,20),
    new THREE.MeshBasicMaterial({color:0xd9a520,side:THREE.DoubleSide,transparent:true,opacity:0.95,depthWrite:false}));
  tileRing.rotation.x=-Math.PI/2; tileRing.renderOrder=4;
  tileRing.position.set(gx+0.5,hAt(gx+0.5,gy+0.5)+0.09,gy+0.5);
  scene.add(tileRing);
}
let ghostMat;
function showGhost(bt,gx,gy,ok){
  hideGhost();
  const d=Sim.BLDGS[bt];
  ghostMat=new THREE.MeshBasicMaterial({color:ok?0x6fd457:0xd45a48,transparent:true,opacity:0.5,depthWrite:false});
  ghost=new THREE.Mesh(new THREE.BoxGeometry(d.size,0.9,d.size),ghostMat);
  ghost.position.set(gx+d.size/2,hAt(gx+d.size/2,gy+d.size/2)+0.45,gy+d.size/2);
  scene.add(ghost);
}
function hideGhost(){ if(ghost){scene.remove(ghost);ghost=null;} }

// ---------- camera ----------
function applyCam(){
  const S=sim.S;
  cam.tx=Math.min(Math.max(cam.tx,4),S-4);
  cam.tz=Math.min(Math.max(cam.tz,4),S-4);
  cam.dist=Math.min(Math.max(cam.dist,13),58);
  const r=cam.dist*Math.cos(cam.pitch);
  const ty=hAt(cam.tx,cam.tz);
  camera.position.set(cam.tx+r*Math.sin(cam.yaw), ty+cam.dist*Math.sin(cam.pitch), cam.tz+r*Math.cos(cam.yaw));
  camera.lookAt(cam.tx,ty,cam.tz);
  // shadow frustum follows target
  sunLight.position.set(cam.tx+42,58,cam.tz+18);
  sunLight.target.position.set(cam.tx,0,cam.tz);
  sunLight.target.updateMatrixWorld();
}
function pan(dx,dz){ // in camera-relative ground space
  const sy=Math.sin(cam.yaw), cy=Math.cos(cam.yaw);
  cam.tx+=dx*cy+dz*sy; cam.tz+=-dx*sy+dz*cy;
  applyCam();
}
function screenToGround(nx,ny){
  raycaster.setFromCamera({x:nx,y:ny},camera);
  const hit=raycaster.intersectObject(terrain);
  if(hit.length) return {x:hit[0].point.x,y:hit[0].point.z};
  return null;
}
function pickEntity(nx,ny){
  raycaster.setFromCamera({x:nx,y:ny},camera);
  const roots=[];
  for(const [,r] of ents) if(r.group.visible) roots.push(r.group);
  const hits=raycaster.intersectObjects(roots,true);
  for(const h of hits){
    let o=h.object;
    while(o&&o.userData.eid===undefined) o=o.parent;
    if(o) return o.userData.eid;
  }
  return 0;
}
function worldToScreen(x,y){
  _v3.set(x,hAt(x,y),y).project(camera);
  return {x:(_v3.x+1)/2, y:(1-_v3.y)/2, z:_v3.z};
}

// ---------- events from sim ----------
function onEvent(e){
  switch(e.t){
    case 'hit': addFx(e.x,e.y,'hit'); break;
    case 'boom': addFx(e.x,e.y,'boom'); break;
    case 'order': addFx(e.x,e.y,e.atk?'orderAtk':'order'); break;
    case 'depleted': onDepleted(e.x,e.y); break;
    case 'swing': { const r=ents.get(e.id); if(r) r.swing=1; break; }
    case 'shoot': { const r=ents.get(e.id); if(r&&e.cat) r.fireT=0.5; break; }
  }
}

// ---------- init / frame ----------
function init(simRef, container){
  sim=simRef; dom=container;
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(container.clientWidth,container.clientHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputEncoding=THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x9ec3d8);
  scene.fog=new THREE.Fog(0x9ec3d8,80,190);
  camera=new THREE.PerspectiveCamera(46,container.clientWidth/container.clientHeight,0.5,400);
  hemi=new THREE.HemisphereLight(0xcfe3f2,0x5b543c,0.6); scene.add(hemi);
  sunLight=new THREE.DirectionalLight(0xfff0d6,1.25);
  sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(2048,2048);
  const sc=sunLight.shadow.camera;
  sc.left=-42;sc.right=42;sc.top=42;sc.bottom=-42;sc.near=5;sc.far=160;
  sunLight.shadow.bias=-0.0006;
  scene.add(sunLight); scene.add(sunLight.target);
  buildMats();
  buildTerrain();
  buildResources();
  updateFog();
  // start camera at player TC
  const tc=Sim.st.bldgs.find(b=>b.owner===0&&b.bt==='towncenter');
  if(tc){cam.tx=tc.x;cam.tz=tc.y+4;}
  applyCam();
  window.addEventListener('resize',()=>{
    camera.aspect=container.clientWidth/container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth,container.clientHeight);
  });
}
let fogT=0;
function update(dt){
  syncEntities();
  updateEntities(dt);
  updateProjectiles();
  updateFx(dt);
  updateRings();
  fogT-=dt;
  if(fogT<=0){fogT=0.3;updateFog();}
  renderer.render(scene,camera);
}

return { init, update, onEvent, pan, applyCam, cam, screenToGround, pickEntity, worldToScreen,
         setSelection, showGhost, hideGhost, ringTile, showRally, hideRally, hAt, TEAM,
         zoom(d){cam.dist*=d;applyCam();}, rotate(d){cam.yaw+=d;applyCam();},
         center(x,y){cam.tx=x;cam.tz=y;applyCam();} };
})();
