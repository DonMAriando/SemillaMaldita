/* ════════════════════════════════════════════════════════════════════
   tools/sim.mjs — simulador sin navegador.

   Carga los módulos del juego en un `window` falso y juega partidas
   completas con un bot, concediendo reliquias al azar y bajando pisos.
   Sirve para dos cosas:

   1) Cazar errores de integración (una reliquia que llama a algo que
      no existe, una IA que se sale del mapa) sin abrir el navegador.
   2) Ver el balance: a qué piso llega un jugador que no piensa, cuánto
      dura una partida, qué mata más.

   Uso:  node tools/sim.mjs              (50 partidas)
         node tools/sim.mjs 300          (300 partidas)
         node tools/sim.mjs 300 --trace  (muestra cada error con pila)
   ════════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const RUNS = parseInt(process.argv[2], 10) || 50;
const TRACE = process.argv.includes('--trace');

/* ─────────── DOM falso ─────────── */
function fakeCtx(){
  const grad = { addColorStop(){} };
  const noop = () => {};
  return new Proxy({
    canvas:{ width:800, height:600 },
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    measureText: () => ({ width:10 }),
    getImageData: () => ({ data:new Uint8ClampedArray(4) })
  }, {
    get(t, k){
      if (k in t) return t[k];
      return noop;
    },
    set(){ return true; }
  });
}

function fakeEl(tag){
  const cls = new Set();
  const attrs = {};
  const e = {
    tagName:(tag || 'div').toUpperCase(),
    children:[], style:{}, dataset:{}, textContent:'', value:'', disabled:false,
    _html:'',
    classList:{
      add:c => cls.add(c), remove:c => cls.delete(c),
      contains:c => cls.has(c),
      toggle:(c, v) => { const on = v === undefined ? !cls.has(c) : !!v; on ? cls.add(c) : cls.delete(c); return on; }
    },
    get innerHTML(){ return e._html; },
    set innerHTML(v){ e._html = String(v); e.children = []; },
    get childElementCount(){ return e.children.length; },
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
    appendChild(c){ e.children.push(c); return c; },
    removeChild(c){ const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); return c; },
    remove(){}, focus(){}, blur(){}, select(){},
    querySelector(){ return fakeEl('div'); },
    querySelectorAll(){ return []; },
    getAttribute(n){ return attrs[n] === undefined ? null : attrs[n]; },
    setAttribute(n, v){ attrs[n] = String(v); },
    getBoundingClientRect(){ return { left:0, top:0, width:420, height:520, right:420, bottom:520 }; },
    getContext(){ return fakeCtx(); }
  };
  return e;
}

const elCache = new Map();
const store = new Map();

const win = {
  DEBUG:TRACE,
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Error,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  Uint8Array, Uint8ClampedArray, Int16Array, Int32Array, Float32Array, Set, Map,
  URLSearchParams,
  setTimeout:(fn) => { return 0; },          // el simulador no espera a nada
  clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
  requestAnimationFrame(){ return 0; },
  performance:{ now: () => Date.now() },
  navigator:{ language:'es', vibrate(){}, share:null, clipboard:{ writeText: async () => {} } },
  location:{ search:'', origin:'', pathname:'/', href:'' },
  localStorage:{
    getItem:k => (store.has(k) ? store.get(k) : null),
    setItem:(k, v) => store.set(k, String(v)),
    removeItem:k => store.delete(k),
    clear: () => store.clear()
  },
  addEventListener(){}, removeEventListener(){}
};
win.window = win;
win.globalThis = win;
win.document = {
  readyState:'complete',
  body:fakeEl('body'),
  documentElement:fakeEl('html'),
  getElementById(id){
    if (!elCache.has(id)) elCache.set(id, fakeEl('div'));
    return elCache.get(id);
  },
  createElement:fakeEl,
  querySelector(){ return fakeEl('div'); },
  querySelectorAll(){ return []; },
  addEventListener(){}, removeEventListener(){},
  execCommand(){ return true; }
};

const ctxVm = vm.createContext(win);

/* ─────────── Cargar los módulos ─────────── */
const files = readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
for (const f of files){
  const code = readFileSync(join(SRC, f), 'utf8');
  try {
    vm.runInContext(code, ctxVm, { filename:f });
  } catch(e){
    console.error(`✗ Error cargando ${f}:`, e.message);
    process.exit(1);
  }
}

/* Si el motor de audio no está, se sustituye por un mudo. */
if (!win.SFX){
  win.SFX = new Proxy({}, { get: () => () => {} });
  console.log('· (sin 10-audio.js: audio simulado)');
}
if (!win.Sprites){
  win.Sprites = new Proxy({ hasKind: () => true, palette: () => ({ main:'#fff' }) },
                          { get:(t, k) => (k in t ? t[k] : () => {}) });
  console.log('· (sin 70-sprites.js: sprites simulados)');
}
if (!win.RELICS){
  console.error('✗ Falta src/20-relics.js');
  process.exit(1);
}

const { Engine, Dungeon, CFG, Util, Meta, UI, RELICS, RNG, Game } = win;

/* ─────────── Bot ─────────── */
const errors = new Map();
function note(where, e){
  const key = where + ' :: ' + (e && e.message || e);
  errors.set(key, (errors.get(key) || 0) + 1);
  if (TRACE && errors.get(key) === 1) console.error('\n' + key + '\n' + (e && e.stack || ''));
}

function guard(where, fn){
  try { return fn(); } catch(e){ note(where, e); return null; }
}

/** Camina hacia la escalera peleando con lo que se cruce. */
function botStep(rng){
  const st = Engine.run;
  const p = st.player;

  /* curarse si está muy mal */
  if (p.hp / p.s.maxHp < 0.35 && p.potions > 0 && rng.chance(0.7)){
    return guard('usePotion', () => Engine.usePotion());
  }
  /* soltar el definitivo cuando esté listo */
  if (p.ultCharge >= 100 && rng.chance(0.5)){
    return guard('useUlt', () => Engine.useUlt());
  }
  /* habilidad de clase */
  if (p.cls.ability && p.abilityCd <= 0 && rng.chance(0.5)){
    const r = guard('useAbility', () => Engine.useAbility());
    if (r) return r;
  }
  /* atacar lo adyacente */
  const adj = guard('adjacentEnemies', () => Engine.ctx().adjacentEnemies()) || [];
  if (adj.length){
    const t = adj[0];
    return guard('move->attack', () => Engine.tryMove(Util.sign(t.x - p.x), Util.sign(t.y - p.y)));
  }
  /* impulso de vez en cuando */
  if (Engine.canDash() && rng.chance(0.12)){
    const d = rng.pick(Dungeon.DIRS8);
    const r = guard('dash', () => Engine.dash(d[0], d[1]));
    if (r) return r;
  }
  /* ir a la escalera */
  const path = guard('findPath', () => Dungeon.findPath(
    p.x, p.y, st.stairs.x, st.stairs.y,
    (x, y) => {
      if (!Engine.walkable(x, y)) return true;
      const a = Engine.actorAt(x, y);
      return !!(a && a.hostile);
    },
    (x, y) => {
      const t = Engine.tileAt(x, y);
      if (t === CFG.T.LAVA) return 40;
      if (t === CFG.T.SPIKES) return 12;
      return 0;
    }, true));

  if (path && path.length){
    const n = path[0];
    return guard('move->path', () => Engine.tryMove(Util.sign(n.x - p.x), Util.sign(n.y - p.y)));
  }
  const d = rng.pick(Dungeon.DIRS8);
  return guard('move->wander', () => Engine.tryMove(d[0], d[1]));
}

/* ─────────── Bucle de partidas ─────────── */
const stats = {
  floors:[], turns:[], kills:[], relics:[], scores:[], wins:0, deaths:0, stuck:0,
  killers:new Map(), floorDeaths:new Map(), relicUse:new Map(),
  byDiff:{}, byClass:{}
};

/* UI en modo silencioso: el bot elige por su cuenta. */
UI.openRelicChoice = function(source, opts){ if (opts && opts.onDone) opts.onDone(); };
UI.openSanctuary = function(cb){ if (cb) cb(); };
UI.openAltar = function(){};
UI.syncHUD = function(){};
UI.pushLog = function(){};
UI.tutorialTick = function(){};
UI.toast = function(){};
UI.achToast = function(){};
UI.flushAchievements = function(){};
UI.showCombo = function(){};
UI.openChallenge = function(){};
UI.showResult = function(){};
UI.closeAllOverlays = function(){};
UI.hideTut = function(){};
UI.resetTutorial = function(){};
UI.clearLog = function(){};
UI.showScreen = function(){};
UI.screen = function(){ return 'game'; };
UI.blocking = function(){ return false; };
UI.rollOffers = function(n){
  const pool = RELICS.filter(r => (r.minFloor || 1) <= Math.max(1, Engine.run ? Engine.run.floor : 1));
  const rng = Engine.run ? Engine.run.relicRng : new RNG('x');
  const out = [];
  for (let i = 0; i < n; i++){
    const p = rng.pick(pool.length ? pool : RELICS);
    if (p) out.push(p);
  }
  return out;
};

Meta.load();
const classes = CFG.CLASSES.map(c => c.id);
const diffs = CFG.DIFFS.map(d => d.id);
let finished = null;
Game.finishRun = function(how){
  finished = how;
  Engine.run.over = true;
};

console.log(`Simulando ${RUNS} partidas…\n`);
const t0 = Date.now();

for (let n = 0; n < RUNS; n++){
  const seed = 'SIM-' + n;
  const rng = new RNG(seed + '|bot');
  const classId = classes[n % classes.length];
  const diff = diffs[n % diffs.length];
  finished = null;

  guard('newRun', () => Engine.newRun({ seed, classId, diff, pacts:[], scored:false }));
  Engine.run.floorLog = [];

  /* Reliquias de salida, para ejercitar los hooks desde el turno 1.
     Sin malditas: el jugador real no empieza con desventajas salvo
     que las elija, y falsearían la lectura del balance. */
  const startPool = RELICS.filter(r => r.rarity !== 'maldita');
  const nStart = 1 + rng.int(3);
  for (let i = 0; i < nStart; i++){
    const r = rng.pick(startPool);
    if (r){
      guard('grantRelic:' + r.id, () => Engine.grantRelic(r));
      stats.relicUse.set(r.id, (stats.relicUse.get(r.id) || 0) + 1);
    }
  }

  guard('buildFloor', () => Engine.buildFloor(1));

  let turns = 0, sameFloorTurns = 0, lastFloor = 1;
  while (!Engine.run.over && turns < 4000){
    turns++;
    /* bajar si está en la escalera */
    if (guard('onStairs', () => Engine.onStairs())){
      const f = Engine.run.floor;
      guard('descend', () => Engine.descend());
      if (!Engine.run.over){
        /* una reliquia por piso, como en el juego real */
        const offer = UI.rollOffers(1)[0];
        if (offer){
          guard('grantRelic:' + offer.id, () => Engine.grantRelic(offer));
          stats.relicUse.set(offer.id, (stats.relicUse.get(offer.id) || 0) + 1);
        }
        guard('buildFloor', () => Engine.buildFloor(f + 1));
      }
      sameFloorTurns = 0;
      continue;
    }
    botStep(rng);
    if (Engine.run.floor === lastFloor) sameFloorTurns++;
    else { sameFloorTurns = 0; lastFloor = Engine.run.floor; }

    /* Si el bot no encuentra la salida en 400 turnos, es un piso
       potencialmente inalcanzable: hay que saberlo. */
    if (sameFloorTurns > 400){
      stats.stuck++;
      const key = 'piso ' + Engine.run.floor + ' inalcanzable (semilla ' + seed + ')';
      errors.set(key, (errors.get(key) || 0) + 1);
      break;
    }
  }

  const st = Engine.run;
  stats.floors.push(st.floor);
  stats.turns.push(st.turn);
  stats.kills.push(st.kills);
  stats.relics.push(guard('relicCount', () => Engine.relicCount()) || 0);
  if (!stats.byDiff[diff]) stats.byDiff[diff] = [];
  stats.byDiff[diff].push(st.floor);
  if (!stats.byClass[classId]) stats.byClass[classId] = [];
  stats.byClass[classId].push(st.floor);
  if (finished && finished.won) stats.wins++;
  if (finished && finished.died){
    stats.deaths++;
    const k = st.killedBy || '(entorno)';
    stats.killers.set(k, (stats.killers.get(k) || 0) + 1);
    stats.floorDeaths.set(st.floor, (stats.floorDeaths.get(st.floor) || 0) + 1);
  }
  if ((n + 1) % Math.max(1, Math.floor(RUNS / 10)) === 0){
    process.stdout.write('.');
  }
}

/* ─────────── Informe ─────────── */
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length/2)] || 0; };
const max = a => a.reduce((x, y) => Math.max(x, y), 0);

console.log(`\n\n── Balance (${RUNS} partidas, ${((Date.now()-t0)/1000).toFixed(1)}s) ──`);
console.log(`Piso alcanzado   media ${avg(stats.floors).toFixed(1)}  ·  mediana ${med(stats.floors)}  ·  máx ${max(stats.floors)}`);
console.log(`Turnos           media ${avg(stats.turns).toFixed(0)}  ·  máx ${max(stats.turns)}`);
console.log(`Bajas            media ${avg(stats.kills).toFixed(1)}`);
console.log(`Reliquias        media ${avg(stats.relics).toFixed(1)}  ·  máx ${max(stats.relics)}`);
console.log(`Muertes ${stats.deaths}  ·  victorias ${stats.wins}  ·  pisos atascados ${stats.stuck}`);

console.log('\nPor dificultad (piso medio · mediana · n):');
for (const d of diffs){
  const a = stats.byDiff[d] || [];
  if (a.length) console.log(`  ${d.padEnd(10)} ${avg(a).toFixed(1).padStart(5)} · ${String(med(a)).padStart(3)} · ${a.length}`);
}
console.log('\nPor estirpe (piso medio · mediana · n):');
for (const c of classes){
  const a = stats.byClass[c] || [];
  if (a.length) console.log(`  ${c.padEnd(10)} ${avg(a).toFixed(1).padStart(5)} · ${String(med(a)).padStart(3)} · ${a.length}`);
}

const topKillers = [...stats.killers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
if (topKillers.length){
  console.log('\nQuién mata más:');
  for (const [k, v] of topKillers) console.log(`  ${String(v).padStart(4)}×  ${k}`);
}
const fd = [...stats.floorDeaths.entries()].sort((a, b) => a[0] - b[0]);
if (fd.length){
  console.log('\nMuertes por piso:');
  console.log('  ' + fd.map(([f, c]) => `${f}:${c}`).join('  '));
}

if (errors.size){
  console.log(`\n── ${errors.size} problema(s) distinto(s) ──`);
  const sorted = [...errors.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted.slice(0, 40)) console.log(`  ${String(v).padStart(5)}×  ${k}`);
  if (sorted.length > 40) console.log(`  … y ${sorted.length - 40} más`);
  if (!TRACE) console.log('\n  (usa --trace para ver las pilas)');
  process.exitCode = 1;
} else {
  console.log('\n✓ Ningún error en toda la simulación.');
}
