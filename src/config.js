'use strict';
/* ============================================================
   Empires — gameplay configuration.
   Every number here is a live default; tweak and rebuild.
   (Colors live in render.js/ui.js by design.)
   ============================================================ */
const CONFIG = {

  MAP: {
    soloSize: 96,        // map side (tiles) for 1 opponent
    ffaSize: 120,        // map side for 2-3 opponents
  },

  POP_MAX: 60,           // absolute population ceiling per player

  ECON: {
    gatherRate: 0.9,     // resources/sec from trees, berries, gold
    farmRate: 0.75,      // food/sec from farms (infinite)
    carry: 10,           // villager carry capacity before deposit
    ageBonus: 0.08,      // military hp/atk bonus per age at spawn (+8%/age)
    buildChainRadius: 10,// after finishing a build, help other sites within this range
  },

  RES: {                 // amount per resource tile
    tree: 120,
    berry: 150,
    gold: 500,
  },

  AGES: ['Dark Age','Feudal Age','Castle Age','Imperial Age'],
  AGE_COST: [null,{food:400,gold:150},{food:700,gold:350},{food:1100,gold:650}],
  AGE_TIME: [0,40,55,70],          // research seconds per age

  // hp, atk, range (tiles), rof (sec/attack), speed (tiles/s), sight,
  // cost, time (train sec), pop, age required, radius, bld (trainer),
  // proj (projectile speed), splash,
  // cls: unit class (inf/arc/cav/siege/vil) · dmgType: melee/pierce/siege
  // arm: [melee armor, pierce armor] (flat damage reduction; siege ignores armor)
  // bonus: damage multipliers vs classes ('bldg' = buildings)
  // line: upgrade tiers researched at the trainer (names + hp/atk per tier)
  UNITS: {
    villager:  {name:'Villager', hp:32, atk:3,  range:0.2, rof:1.5, speed:2.7, sight:5, cost:{food:60},          time:9,  pop:1, age:0, radius:0.27, bld:'towncenter',
                cls:'vil', dmgType:'melee', arm:[0,0]},
    swordsman: {name:'Swordsman',hp:64, atk:8,  range:0.2, rof:1.3, speed:2.8, sight:6, cost:{food:60,gold:25},  time:10, pop:1, age:0, radius:0.29, bld:'barracks',
                cls:'inf', dmgType:'melee', arm:[1,1], bonus:{bldg:1.6},
                line:{names:['Swordsman','Longswordsman','Champion'], tiers:[{hp:64,atk:8},{hp:78,atk:10},{hp:92,atk:12}]}},
    spearman:  {name:'Spearman', hp:50, atk:5,  range:0.25,rof:1.4, speed:2.8, sight:6, cost:{food:45,wood:25},  time:9,  pop:1, age:0, radius:0.28, bld:'barracks',
                cls:'inf', dmgType:'melee', arm:[0,0], bonus:{cav:3},
                line:{names:['Spearman','Pikeman'], tiers:[{hp:50,atk:5},{hp:62,atk:7}]}},
    archer:    {name:'Archer',   hp:34, atk:6,  range:5.5, rof:1.7, speed:2.9, sight:7, cost:{wood:35,gold:40},  time:10, pop:1, age:1, radius:0.27, bld:'archery',  proj:11,
                cls:'arc', dmgType:'pierce', arm:[0,0], bonus:{inf:1.35},
                line:{names:['Archer','Crossbowman'], tiers:[{hp:34,atk:6},{hp:40,atk:8}]}},
    knight:    {name:'Knight',   hp:120,atk:12, range:0.3, rof:1.4, speed:3.9, sight:6, cost:{food:70,gold:70},  time:14, pop:1, age:2, radius:0.34, bld:'stable',
                cls:'cav', dmgType:'melee', arm:[2,2], bonus:{arc:1.6,siege:2},
                line:{names:['Knight','Cavalier'], tiers:[{hp:120,atk:12},{hp:150,atk:15}]}},
    warcow:    {name:'War Cow',  hp:220,atk:26, range:0.3, rof:0.9, speed:5.2, sight:7, cost:{},                time:1,  pop:0, age:0, radius:0.36, bld:null,
                cls:'cav', dmgType:'melee', arm:[2,2]},
    catapult:  {name:'Catapult', hp:65, atk:32, range:7,   rof:4.5, speed:1.7, sight:7, cost:{wood:140,gold:120},time:20, pop:1, age:3, radius:0.42, bld:'workshop', proj:7, splash:1.3,
                cls:'siege', dmgType:'siege', arm:[0,3], bonus:{bldg:3}},
  },

  BLDG_ARMOR: [1,7],     // [melee, pierce] armor for all buildings (siege ignores it)

  // Technologies. bld: where it's researched · req: prerequisite tech id
  // effect: {stat: meleeAtk|pierceAtk|armor, add} for blacksmith lines,
  //         {line: unitType, tier} for unit upgrades
  TECHS: {
    forging:   {name:'Forging',        bld:'blacksmith', age:1, cost:{food:100,gold:50},  time:25, effect:{stat:'meleeAtk', add:1}},
    ironCast:  {name:'Iron Casting',   bld:'blacksmith', age:2, cost:{food:180,gold:110}, time:30, req:'forging',  effect:{stat:'meleeAtk', add:1}},
    blastFurn: {name:'Blast Furnace',  bld:'blacksmith', age:3, cost:{food:280,gold:180}, time:35, req:'ironCast', effect:{stat:'meleeAtk', add:2}},
    fletching: {name:'Fletching',      bld:'blacksmith', age:1, cost:{food:100,gold:50},  time:25, effect:{stat:'pierceAtk', add:1}},
    bodkin:    {name:'Bodkin Arrow',   bld:'blacksmith', age:2, cost:{food:180,gold:110}, time:30, req:'fletching', effect:{stat:'pierceAtk', add:1}},
    bracer:    {name:'Bracer',         bld:'blacksmith', age:3, cost:{food:280,gold:180}, time:35, req:'bodkin',   effect:{stat:'pierceAtk', add:2}},
    scaleArm:  {name:'Scale Armor',    bld:'blacksmith', age:1, cost:{food:100,gold:50},  time:25, effect:{stat:'armor', add:1}},
    chainArm:  {name:'Chain Mail',     bld:'blacksmith', age:2, cost:{food:180,gold:110}, time:30, req:'scaleArm', effect:{stat:'armor', add:1}},
    plateArm:  {name:'Plate Mail',     bld:'blacksmith', age:3, cost:{food:280,gold:180}, time:35, req:'chainArm', effect:{stat:'armor', add:1}},
    longsword: {name:'Longswordsman',  bld:'barracks',   age:2, cost:{food:150,gold:80},  time:30, effect:{line:'swordsman', tier:1}},
    champion:  {name:'Champion',       bld:'barracks',   age:3, cost:{food:280,gold:150}, time:40, req:'longsword', effect:{line:'swordsman', tier:2}},
    pikeman:   {name:'Pikeman',        bld:'barracks',   age:2, cost:{food:160,wood:90},  time:30, effect:{line:'spearman', tier:1}},
    crossbow:  {name:'Crossbowman',    bld:'archery',    age:2, cost:{food:150,gold:90},  time:30, effect:{line:'archer', tier:1}},
    cavalier:  {name:'Cavalier',       bld:'stable',     age:3, cost:{food:300,gold:170}, time:40, effect:{line:'knight', tier:1}},
  },

  // size (tiles square), hp, cost, work (villager-seconds to build), age,
  // sight, pop (cap contribution), atk/range/rof (defensive fire),
  // drop (accepted deposits), trains, farm (food source)
  BLDGS: {
    towncenter:{name:'Town Center',  size:3, hp:650, cost:{},                 work:0,  age:0, sight:9, pop:10, atk:6, range:6.5, rof:2, drop:['wood','food','gold'], trains:['villager']},
    house:     {name:'House',        size:2, hp:170, cost:{wood:50},          work:16, age:0, sight:3, pop:5},
    farm:      {name:'Farm',         size:2, hp:90,  cost:{wood:60},          work:12, age:0, sight:2, farm:true},
    mill:      {name:'Mill',         size:2, hp:220, cost:{wood:100},         work:18, age:0, sight:4, drop:['food']},
    lumbercamp:{name:'Lumber Camp',  size:2, hp:220, cost:{wood:100},         work:18, age:0, sight:4, drop:['wood']},
    miningcamp:{name:'Mining Camp',  size:2, hp:220, cost:{wood:100},         work:18, age:0, sight:4, drop:['gold']},
    barracks:  {name:'Barracks',     size:3, hp:380, cost:{wood:150},         work:28, age:0, sight:5, trains:['swordsman','spearman']},
    blacksmith:{name:'Blacksmith',   size:2, hp:280, cost:{wood:150},         work:24, age:1, sight:4},
    archery:   {name:'Archery Range',size:3, hp:330, cost:{wood:160},         work:28, age:1, sight:5, trains:['archer']},
    stable:    {name:'Stable',       size:3, hp:380, cost:{wood:160},         work:28, age:2, sight:5, trains:['knight']},
    workshop:  {name:'Siege Workshop',size:3,hp:330, cost:{wood:200,gold:80}, work:32, age:3, sight:5, trains:['catapult']},
    tower:     {name:'Watch Tower',  size:2, hp:300, cost:{wood:80,gold:80},  work:26, age:1, sight:9, atk:8, range:7.5, rof:2},
  },

  // AI difficulty profiles.
  // vt: villager targets per age · first: first attack time (s)
  // wave0/waveInc/waveCap: attack wave sizing · lazy: trains military half the time
  // multiProd: builds a 2nd barracks in Castle Age · bonus: starting resource bonus
  // cap: never advances to an age beyond the human player
  DIFFS: {
    easiest:{vt:[8,10,12,14],  first:480, wave0:4, waveInc:2, waveCap:10, lazy:true,  multiProd:false, bonus:0,   cap:true},
    easy:   {vt:[10,14,18,20], first:380, wave0:5, waveInc:3, waveCap:14, lazy:false, multiProd:false, bonus:0,   cap:true},
    normal: {vt:[13,18,24,28], first:300, wave0:6, waveInc:4, waveCap:24, lazy:false, multiProd:true,  bonus:0,   cap:false},
    hard:   {vt:[14,20,26,30], first:240, wave0:8, waveInc:5, waveCap:30, lazy:false, multiProd:true,  bonus:150, cap:false},
  },

  AI: {
    attackCooldown: 90,   // seconds between attack waves
    defendRadius: 16,     // rally defenders to buildings hit within this range
    musterFraction: 0.25, // military rally point: this far from TC toward map center
    farmBase: 3,          // max farms = farmBase + age * farmPerAge
    farmPerAge: 2,
    campDistance: 10,     // build a drop-off camp when gatherers work farther than this from one
    campMinWorkers: 4,    // ...and at least this many villagers are on that resource
    campMaxPerKind: 2,
    lossDecay: 0.97,      // per-second decay of the AI's memory of what killed its units
    techBankFood: 150,    // AI researches techs when banking beyond either of these
    techBankGold: 120,
    milFoodReserve: 120,  // while below villager target, military won't spend food into this reserve
  },

  CHEATS: {
    money: 10000,         // "show me the money" grants this much of each
    warpMult: 20,         // "warp speed" build/train multiplier
    mooCount: 3,          // war cows per "moo"
  },
};
if (typeof module!=='undefined') module.exports = CONFIG;
