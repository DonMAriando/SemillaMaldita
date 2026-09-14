/* =============================================================================
   tools/relics-check.mjs — validador del catálogo de reliquias.
   Uso:  node tools/relics-check.mjs
   Carga src/20-relics.js en un sandbox (node:vm) con un `window` falso,
   valida la forma de los datos, revisa en el fuente que sólo se usen valores
   del contrato y ejecuta TODOS los hooks contra un `C` simulado.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
// Por defecto valida src/20-relics.js; se puede pasar otra ruta para probar el propio validador.
const FILE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'src', '20-relics.js');

// Los fallos se agrupan por mensaje: un mismo error repetido 70 veces se lista una vez.
const errors = new Map();
const warnings = new Map();
const notes = [];
const bump = (mapa, m) => mapa.set(m, (mapa.get(m) || 0) + 1);
const err = (m) => bump(errors, m);
const warn = (m) => bump(warnings, m);
const render = (mapa) => [...mapa].map(([m, k]) => (k > 1 ? `${m}  (x${k})` : m));

/* --------------------------- listas del contrato -------------------------- */
const RARITIES = ['comun', 'rara', 'epica', 'maldita'];
const RARITY_COUNTS = { comun: 18, rara: 16, epica: 12, maldita: 8 };
const RARITY_RANGES = {
  comun: { weight: [8, 12], minFloor: [1, 1] },
  rara: { weight: [5, 8], minFloor: [2, 4] },
  epica: { weight: [2, 4], minFloor: [5, 9] },
  maldita: { weight: [3, 5], minFloor: [1, 9] }
};
const TAGS = ['ofensiva', 'defensiva', 'sangre', 'fuego', 'hielo', 'rayo', 'veneno', 'arcana',
  'sigilo', 'oro', 'movimiento', 'critico', 'escudo', 'curacion', 'invocacion', 'tempo',
  'escala', 'riesgo', 'utilidad'];
const HOOKS = ['stats', 'onRunStart', 'onFloorStart', 'onTurnEnd', 'onBeforeAttack', 'onAfterAttack',
  'onKill', 'onBeforeHurt', 'onAfterHurt', 'onHeal', 'onMove', 'onUsePotion', 'onDescend',
  'onLevelUp', 'onPickup', 'onDash', 'onUlt', 'onStatusApplied', 'onLowHp'];
const STATS_FIELDS = ['maxHp', 'atk', 'def', 'crit', 'critMult', 'dodge', 'lifesteal', 'speed',
  'luck', 'vision', 'potionPower', 'xpMult', 'goldMult', 'shieldMax', 'thorns', 'regen'];
const DMG_TYPES = ['fisico', 'fuego', 'hielo', 'rayo', 'veneno', 'arcano', 'puro'];
const STATUSES = ['quemado', 'congelado', 'envenenado', 'aturdido', 'marcado', 'sangrado', 'lento',
  'debil', 'electrificado'];
const BUFFS = ['furia', 'piedra', 'veloz', 'invisible', 'bendicion', 'reflejo', 'llamas'];
const FX = ['chispa', 'explosion', 'anillo', 'rayo', 'hielo', 'humo', 'sangre', 'brillo'];
const SOUNDS = ['hit', 'hitHeavy', 'crit', 'block', 'kill', 'heal', 'shieldUp', 'burn', 'freeze',
  'shock', 'poison', 'curse', 'explode', 'arrow', 'magicBolt', 'summon', 'teleport', 'coin',
  'relic', 'levelup', 'ult', 'error'];
const ALLY_KINDS = ['esqueleto_aliado', 'lobo', 'espiritu'];
const LOG_CLASSES = ['good', 'bad', 'info', 'epic'];

/* ------------------------------ 1. carga --------------------------------- */
if (!fs.existsSync(FILE)) {
  console.error(`FATAL: no existe ${FILE}`);
  process.exit(1);
}
const src = fs.readFileSync(FILE, 'utf8');

const fakeWindow = {};
const sandbox = { window: fakeWindow, console, Math, Intl, isFinite, parseInt, parseFloat };
sandbox.globalThis = sandbox;
sandbox.self = fakeWindow;
try {
  vm.createContext(sandbox);
  new vm.Script(src, { filename: '20-relics.js' }).runInContext(sandbox, { timeout: 5000 });
} catch (e) {
  console.error('FATAL: el archivo no se pudo evaluar:', e && e.stack ? e.stack : e);
  process.exit(1);
}

const RELICS = fakeWindow.RELICS;
const BY_ID = fakeWindow.RELIC_BY_ID;
if (!Array.isArray(RELICS)) {
  console.error('FATAL: window.RELICS no es un array.');
  process.exit(1);
}
if (!BY_ID || typeof BY_ID !== 'object') {
  console.error('FATAL: window.RELIC_BY_ID no es un objeto.');
  process.exit(1);
}

/* --------------------- 2. estructura y datos básicos ---------------------- */
if (RELICS.length !== 54) err(`se esperaban 54 reliquias, hay ${RELICS.length}`);

const ids = new Set();
const icons = new Map();
const namesEs = new Map();
const namesEn = new Map();
const counts = { comun: 0, rara: 0, epica: 0, maldita: 0 };
const graphemes = (s) => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(s)].length;
  }
  return [...s].length;
};

for (const r of RELICS) {
  const tag = r && r.id ? r.id : '(sin id)';
  if (!r || typeof r !== 'object') { err('entrada del catálogo que no es objeto'); continue; }

  if (typeof r.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(r.id)) {
    err(`${tag}: id inválido (snake_case ASCII obligatorio)`);
  }
  if (ids.has(r.id)) err(`${tag}: id duplicado`);
  ids.add(r.id);

  for (const [campo, obj] of [['name', r.name], ['desc', r.desc]]) {
    if (!obj || typeof obj !== 'object') { err(`${tag}: ${campo} debe ser {es,en}`); continue; }
    for (const lang of ['es', 'en']) {
      if (typeof obj[lang] !== 'string' || !obj[lang].trim()) {
        err(`${tag}: ${campo}.${lang} vacío o no es string`);
      }
    }
  }
  if (r.desc && typeof r.desc.es === 'string' && r.desc.es.length > 70) {
    err(`${tag}: desc.es tiene ${r.desc.es.length} caracteres (máx 70)`);
  }
  if (r.desc && typeof r.desc.en === 'string' && r.desc.en.length > 70) {
    err(`${tag}: desc.en tiene ${r.desc.en.length} caracteres (máx 70)`);
  }
  if (r.desc && typeof r.desc.es === 'string' && !/\d/.test(r.desc.es)) {
    warn(`${tag}: desc.es no contiene ningún número`);
  }

  if (typeof r.icon !== 'string' || !r.icon.trim()) err(`${tag}: icon vacío`);
  else {
    if (graphemes(r.icon) !== 1) err(`${tag}: icon debe ser UN solo emoji (es "${r.icon}")`);
    if (/^[\x00-\x7F]+$/.test(r.icon)) err(`${tag}: icon debe ser un emoji, no ASCII`);
    if (icons.has(r.icon)) err(`${tag}: icon repetido con ${icons.get(r.icon)}`);
    icons.set(r.icon, r.id);
  }

  if (r.name && typeof r.name.es === 'string') {
    if (namesEs.has(r.name.es)) err(`${tag}: name.es repetido con ${namesEs.get(r.name.es)}`);
    namesEs.set(r.name.es, r.id);
  }
  if (r.name && typeof r.name.en === 'string') {
    if (namesEn.has(r.name.en)) err(`${tag}: name.en repetido con ${namesEn.get(r.name.en)}`);
    namesEn.set(r.name.en, r.id);
  }

  if (!RARITIES.includes(r.rarity)) err(`${tag}: rarity inválida (${r.rarity})`);
  else counts[r.rarity]++;

  if (!Array.isArray(r.tags) || r.tags.length === 0) err(`${tag}: tags debe ser array no vacío`);
  else {
    const vistos = new Set();
    for (const t of r.tags) {
      if (!TAGS.includes(t)) err(`${tag}: tag no permitido (${t})`);
      if (vistos.has(t)) err(`${tag}: tag duplicado (${t})`);
      vistos.add(t);
    }
  }

  const int = (v) => Number.isInteger(v);
  if (!int(r.maxStacks) || r.maxStacks < 1) err(`${tag}: maxStacks debe ser entero >= 1`);
  if (!int(r.weight) || r.weight < 1 || r.weight > 12) err(`${tag}: weight debe ser entero 1..12`);
  if (!int(r.minFloor) || r.minFloor < 1) err(`${tag}: minFloor debe ser entero >= 1`);

  const rango = RARITY_RANGES[r.rarity];
  if (rango) {
    if (int(r.weight) && (r.weight < rango.weight[0] || r.weight > rango.weight[1])) {
      err(`${tag}: weight ${r.weight} fuera de ${rango.weight.join('-')} para ${r.rarity}`);
    }
    if (int(r.minFloor) && (r.minFloor < rango.minFloor[0] || r.minFloor > rango.minFloor[1])) {
      err(`${tag}: minFloor ${r.minFloor} fuera de ${rango.minFloor.join('-')} para ${r.rarity}`);
    }
  }

  if (!r.hooks || typeof r.hooks !== 'object') err(`${tag}: hooks debe ser un objeto`);
  else {
    const claves = Object.keys(r.hooks);
    if (!claves.length) err(`${tag}: no declara ningún hook`);
    for (const k of claves) {
      if (!HOOKS.includes(k)) err(`${tag}: hook no permitido (${k})`);
      if (typeof r.hooks[k] !== 'function') err(`${tag}: hook ${k} no es función`);
    }
  }

  const extra = Object.keys(r).filter((k) =>
    !['id', 'name', 'desc', 'icon', 'rarity', 'tags', 'maxStacks', 'weight', 'minFloor', 'hooks'].includes(k));
  if (extra.length) warn(`${tag}: campos fuera del contrato (${extra.join(', ')})`);
}

for (const rar of RARITIES) {
  if (counts[rar] !== RARITY_COUNTS[rar]) {
    err(`rareza ${rar}: hay ${counts[rar]}, se esperaban ${RARITY_COUNTS[rar]}`);
  }
}

// Índice coherente con el array.
if (Object.keys(BY_ID).length !== RELICS.length) {
  err(`RELIC_BY_ID tiene ${Object.keys(BY_ID).length} entradas y RELICS ${RELICS.length}`);
}
for (const r of RELICS) {
  if (BY_ID[r.id] !== r) err(`${r.id}: RELIC_BY_ID no apunta a la misma reliquia`);
}

/* ------------- 3. análisis del fuente: literales del contrato ------------- */
// Extrae los argumentos de nivel superior de cada llamada `nombre(...)`.
function findCalls(source, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(name + '(', from);
    if (at === -1) break;
    const antes = at > 0 ? source[at - 1] : '';
    if (/[A-Za-z0-9_$.]/.test(antes)) { from = at + 1; continue; }
    let i = at + name.length + 1;
    let depth = 1, str = null, args = [], buf = '';
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (str) {
        buf += ch;
        if (ch === '\\') { buf += source[i + 1] || ''; i += 2; continue; }
        if (ch === str) str = null;
        i++;
        continue;
      }
      if (ch === '\'' || ch === '"' || ch === '`') { str = ch; buf += ch; i++; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; buf += ch; i++; continue; }
      if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) { i++; break; }
        buf += ch; i++; continue;
      }
      if (ch === ',' && depth === 1) { args.push(buf.trim()); buf = ''; i++; continue; }
      buf += ch;
      i++;
    }
    if (buf.trim()) args.push(buf.trim());
    out.push({ args, index: at });
    from = i;
  }
  return out;
}
const literal = (arg) => {
  const m = /^'([^'\\]*)'$/.exec(arg || '');
  return m ? m[1] : null;
};
const linea = (idx) => src.slice(0, idx).split('\n').length;

function checkArg(fn, argIndex, permitidos, etiqueta, { obligatorio = true } = {}) {
  let dinamicos = 0, revisados = 0;
  for (const call of findCalls(src, fn)) {
    const arg = call.args[argIndex];
    if (arg === undefined) {
      if (obligatorio) err(`línea ${linea(call.index)}: ${fn} sin el argumento ${etiqueta}`);
      continue;
    }
    const val = literal(arg);
    if (val === null) { dinamicos++; continue; }
    revisados++;
    if (!permitidos.includes(val)) {
      err(`línea ${linea(call.index)}: ${fn} usa ${etiqueta} no permitido ('${val}')`);
    }
  }
  notes.push(`${fn}: ${revisados} literales de ${etiqueta} verificados` +
    (dinamicos ? `, ${dinamicos} dinámicos (no comprobables)` : ''));
}

checkArg('C.damage', 2, DMG_TYPES, 'tipo de daño');
checkArg('C.damageAll', 2, DMG_TYPES, 'tipo de daño');
checkArg('C.addStatus', 1, STATUSES, 'estado');
checkArg('C.addSelfBuff', 0, BUFFS, 'buff');
checkArg('C.fx', 0, FX, 'efecto');
checkArg('C.sound', 0, SOUNDS, 'sonido');
checkArg('C.summonAlly', 0, ALLY_KINDS, 'aliado');
checkArg('C.log', 2, LOG_CLASSES, 'clase de log', { obligatorio: false });

// C.has('x') debe apuntar a una reliquia que exista.
let hasChecks = 0;
for (const call of findCalls(src, 'C.has')) {
  const val = literal(call.args[0]);
  if (val === null) { err(`línea ${linea(call.index)}: C.has con argumento no literal`); continue; }
  hasChecks++;
  if (!ids.has(val)) err(`línea ${linea(call.index)}: C.has('${val}') no existe en el catálogo`);
}
notes.push(`C.has: ${hasChecks} referencias cruzadas verificadas`);

// Nada de aleatoriedad fuera del rng del motor, ni globales ajenas.
if (/Math\.random/.test(src)) err('usa Math.random: debe usarse siempre C.rng');
const globalesProhibidas = ['document', 'localStorage', 'requestAnimationFrame', 'alert', 'fetch',
  'GAME', 'PLAYER', 'STATE', 'canvas'];
for (const g of globalesProhibidas) {
  if (new RegExp(`(^|[^\\w.'"])${g}\\s*[.(\\[]`).test(src)) err(`referencia a global ajena: ${g}`);
}
if (/\b(import|export)\b\s*[{*a-zA-Z(]/.test(src)) err('el archivo usa import/export (debe ser script clásico)');
const asignacionesWindow = src.match(/window\.\w+\s*=/g) || [];
if (asignacionesWindow.length !== 2) {
  err(`se esperan exactamente 2 asignaciones a window (RELICS y RELIC_BY_ID), hay ${asignacionesWindow.length}`);
}

// Todo hook usado debe estar en la lista (comprobado ya por claves; se reporta el uso).
const hooksUsados = new Set();
for (const r of RELICS) for (const k of Object.keys(r.hooks || {})) hooksUsados.add(k);
const sinUsar = HOOKS.filter((h) => !hooksUsados.has(h));
notes.push(`hooks usados: ${hooksUsados.size}/${HOOKS.length}` +
  (sinUsar.length ? ` (sin usar: ${sinUsar.join(', ')})` : ''));

/* ---------------------------- 4. smoke test ------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeEnemies(cuantos) {
  const out = [];
  for (let i = 0; i < cuantos; i++) {
    out.push({ __enemy: true, id: 'e' + i, name: 'enemigo' + i, hp: 10 + i * 5, maxHp: 30, dist: i + 1 });
  }
  return out;
}

const finito = (v) => typeof v === 'number' && Number.isFinite(v);

function makeC(escenario, mem, rng) {
  const enemigos = escenario.enemies;
  const conocidos = new Set(enemigos);
  const registro = [];
  const enemigoValido = (e, quien) => {
    if (!e || typeof e !== 'object') throw new Error(`${quien}: enemigo nulo/no objeto`);
    if (!conocidos.has(e)) throw new Error(`${quien}: enemigo desconocido (¿objeto inventado?)`);
    return true;
  };
  const cantidadValida = (v, quien) => {
    if (!finito(v)) throw new Error(`${quien}: cantidad no finita (${v})`);
    if (v < 0) throw new Error(`${quien}: cantidad negativa (${v})`);
    return true;
  };
  const enLista = (v, lista, quien) => {
    if (!lista.includes(v)) throw new Error(`${quien}: valor fuera del contrato ('${v}')`);
    return true;
  };

  const C = {
    stacks: escenario.stacks,
    floor: escenario.floor,
    turn: escenario.turn,
    mem,
    p: Object.assign({}, escenario.p),
    rng: {
      next: () => rng(),
      int: (k) => Math.floor(rng() * Math.max(1, k | 0)),
      range: (a, b) => a + Math.floor(rng() * Math.max(1, b - a + 1)),
      chance: (p) => rng() < p,
      pick: (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(rng() * arr.length)] : undefined)
    },
    has: (id) => { registro.push(['has', id]); return escenario.has; },
    damage: (e, n, t) => { enemigoValido(e, 'damage'); cantidadValida(n, 'damage'); enLista(t, DMG_TYPES, 'damage'); registro.push(['damage', n, t]); },
    damageAll: (arr, n, t) => {
      if (!Array.isArray(arr)) throw new Error('damageAll: no recibió array');
      arr.forEach((e) => enemigoValido(e, 'damageAll'));
      cantidadValida(n, 'damageAll'); enLista(t, DMG_TYPES, 'damageAll');
      registro.push(['damageAll', arr.length, n, t]);
    },
    heal: (n) => { cantidadValida(n, 'heal'); registro.push(['heal', n]); },
    hurtSelf: (n) => { cantidadValida(n, 'hurtSelf'); registro.push(['hurtSelf', n]); },
    addShield: (n) => { cantidadValida(n, 'addShield'); registro.push(['addShield', n]); },
    addStatus: (e, s, t, p) => {
      enemigoValido(e, 'addStatus'); enLista(s, STATUSES, 'addStatus');
      cantidadValida(t, 'addStatus.turns');
      if (t < 1) throw new Error('addStatus: turnos < 1');
      if (p !== undefined) cantidadValida(p, 'addStatus.power');
      registro.push(['addStatus', s, t]);
    },
    addSelfBuff: (b, t, p) => {
      enLista(b, BUFFS, 'addSelfBuff'); cantidadValida(t, 'addSelfBuff.turns');
      if (p !== undefined) cantidadValida(p, 'addSelfBuff.power');
      registro.push(['addSelfBuff', b, t]);
    },
    addPotions: (n) => { cantidadValida(n, 'addPotions'); registro.push(['addPotions', n]); },
    addGold: (n) => { cantidadValida(n, 'addGold'); registro.push(['addGold', n]); },
    addXp: (n) => { cantidadValida(n, 'addXp'); registro.push(['addXp', n]); },
    knockback: (e, t) => { enemigoValido(e, 'knockback'); cantidadValida(t, 'knockback'); registro.push(['knockback', t]); },
    teleportSelf: () => { registro.push(['teleportSelf']); },
    summonAlly: (k, n) => { enLista(k, ALLY_KINDS, 'summonAlly'); cantidadValida(n, 'summonAlly'); registro.push(['summonAlly', k, n]); },
    enemiesInRadius: (r) => { cantidadValida(r, 'enemiesInRadius'); return enemigos.filter((e) => e.dist <= r); },
    adjacentEnemies: () => enemigos.filter((e) => e.dist <= 1),
    allEnemies: () => enemigos.slice(),
    enemyAt: (dx, dy) => {
      if (!finito(dx) || !finito(dy)) throw new Error('enemyAt: offsets no finitos');
      return enemigos[0] || null;
    },
    dist: (e) => { enemigoValido(e, 'dist'); return e.dist; },
    lowestHpEnemy: () => (enemigos.length ? enemigos.slice().sort((a, b) => a.hp - b.hp)[0] : null),
    fx: (k, e, color) => {
      enLista(k, FX, 'fx');
      if (e !== null && e !== undefined) enemigoValido(e, 'fx');
      if (color !== undefined && typeof color !== 'string') throw new Error('fx: color no es string');
      registro.push(['fx', k]);
    },
    shake: (p) => {
      if (!finito(p) || p < 0 || p > 1) throw new Error(`shake: fuerza fuera de 0..1 (${p})`);
      registro.push(['shake', p]);
    },
    sound: (nm) => { enLista(nm, SOUNDS, 'sound'); registro.push(['sound', nm]); },
    log: (es, en, cls) => {
      if (typeof es !== 'string' || !es) throw new Error('log: texto es vacío');
      if (typeof en !== 'string' || !en) throw new Error('log: texto en vacío');
      if (cls !== undefined) enLista(cls, LOG_CLASSES, 'log');
      registro.push(['log', cls]);
    },
    floatText: (t, color) => {
      if (typeof t !== 'string' || !t) throw new Error('floatText: texto vacío');
      if (color !== undefined && typeof color !== 'string') throw new Error('floatText: color no es string');
      registro.push(['floatText', t]);
    }
  };
  C.__registro = registro;
  return C;
}

// Contextos concretos por hook (con casos límite dentro de cada iteración).
function contextos(hook, escenario, iter) {
  const es = escenario.enemies;
  const objetivo = es.length ? es[iter % es.length] : null;
  const base = {};
  switch (hook) {
    case 'stats': {
      const s = {};
      for (const f of STATS_FIELDS) s[f] = 0;
      s.maxHp = 60; s.atk = 8; s.def = 3; s.critMult = 1.5; s.speed = 1;
      return [{ s }];
    }
    case 'onBeforeAttack':
      return [
        { target: objetivo, dmg: 0, isCrit: false },
        { target: objetivo, dmg: 12, isCrit: false },
        { target: null, dmg: 7, isCrit: true }
      ];
    case 'onAfterAttack':
      return [
        { target: objetivo, dmgDealt: 0, isCrit: false, killed: false },
        { target: objetivo, dmgDealt: 14, isCrit: true, killed: true },
        { target: null, dmgDealt: 5, isCrit: false, killed: false }
      ];
    case 'onKill':
      return [{ target: objetivo, isBoss: false }, { target: objetivo, isBoss: true }, { target: null, isBoss: false }];
    case 'onBeforeHurt':
      return [
        { source: objetivo, dmg: 0, canceled: false },
        { source: objetivo, dmg: 5, canceled: false },
        { source: null, dmg: 9999, canceled: false }
      ];
    case 'onAfterHurt':
      return [{ source: objetivo, dmgTaken: 0 }, { source: null, dmgTaken: 12 }];
    case 'onHeal':
      return [{ amount: 0 }, { amount: 7 }];
    case 'onMove':
      return [{ dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: -1, dy: 1 }];
    case 'onLevelUp':
      return [{ level: 1 }, { level: 12 }];
    case 'onPickup':
      return [{ item: { kind: 'pocion' } }, { item: { kind: 'oro' } }, { item: null }];
    case 'onStatusApplied': {
      const ctx = [];
      for (const s of STATUSES) ctx.push({ target: objetivo, status: s, turns: 3 });
      ctx.push({ target: null, status: 'quemado', turns: 1 });
      ctx.push({ target: objetivo, status: 'quemado', turns: 0 });
      return ctx;
    }
    default:
      return [base];
  }
}

const escenarios = [
  {
    nombre: 'normal (3 enemigos, 1 copia)',
    enemies: makeEnemies(3), stacks: 1, floor: 5, turn: 7, has: true, seed: 1,
    p: { hp: 40, maxHp: 60, atk: 9, def: 4, level: 5, potions: 2, gold: 250, shield: 12, hpPct: 0.66 }
  },
  {
    nombre: 'sin enemigos',
    enemies: [], stacks: 1, floor: 3, turn: 2, has: false, seed: 2,
    p: { hp: 55, maxHp: 60, atk: 9, def: 4, level: 3, potions: 0, gold: 0, shield: 0, hpPct: 0.91 }
  },
  {
    nombre: 'agonía (hp 1, 3 copias, sin sinergias)',
    enemies: makeEnemies(3), stacks: 3, floor: 1, turn: 1, has: false, seed: 3,
    p: { hp: 1, maxHp: 60, atk: 9, def: 4, level: 1, potions: 0, gold: 0, shield: 0, hpPct: 1 / 60 }
  },
  {
    nombre: 'partida larga (3 copias, todas las sinergias, mucho oro)',
    enemies: makeEnemies(3), stacks: 3, floor: 9, turn: 120, has: true, seed: 4,
    p: { hp: 90, maxHp: 120, atk: 22, def: 12, level: 14, potions: 3, gold: 1800, shield: 40, hpPct: 0.75 }
  },
  {
    nombre: 'un solo enemigo pegado',
    enemies: [{ __enemy: true, id: 'solo', name: 'solo', hp: 1, maxHp: 30, dist: 1 }],
    stacks: 2, floor: 6, turn: 33, has: true, seed: 5,
    p: { hp: 20, maxHp: 60, atk: 9, def: 4, level: 6, potions: 1, gold: 90, shield: 5, hpPct: 0.33 }
  }
];

const ITERACIONES = 14;
let ejecuciones = 0;

for (const r of RELICS) {
  const hooks = r.hooks || {};
  for (const nombre of Object.keys(hooks)) {
    const fn = hooks[nombre];
    if (typeof fn !== 'function') continue;
    for (const escenario of escenarios) {
      const mem = {};
      const rng = mulberry32(escenario.seed);
      for (let iter = 0; iter < ITERACIONES; iter++) {
        for (const extra of contextos(nombre, escenario, iter)) {
          const C = makeC(escenario, mem, rng);
          // El turno avanza para ejercitar contadores y cupos por turno.
          C.turn = escenario.turn + iter;
          Object.assign(C, extra);
          try {
            fn(C);
            ejecuciones++;
          } catch (e) {
            err(`${r.id}.${nombre} lanzó excepción [${escenario.nombre}]: ${e && e.message ? e.message : e}`);
            iter = ITERACIONES; // no repetir el mismo fallo 14 veces
            break;
          }
          // Post-condiciones: el motor debe recibir números usables.
          if (nombre === 'stats') {
            for (const f of STATS_FIELDS) {
              if (!finito(C.s[f])) err(`${r.id}.stats dejó ${f} no finito (${C.s[f]})`);
            }
            const nuevos = Object.keys(C.s).filter((k) => !STATS_FIELDS.includes(k));
            if (nuevos.length) err(`${r.id}.stats inventó campos en C.s (${nuevos.join(', ')})`);
          }
          if (nombre === 'onBeforeAttack' && !finito(C.dmg)) err(`${r.id}.onBeforeAttack dejó C.dmg no finito (${C.dmg})`);
          if (nombre === 'onBeforeAttack' && finito(C.dmg) && C.dmg < 0) err(`${r.id}.onBeforeAttack dejó C.dmg negativo`);
          if (nombre === 'onBeforeHurt' && !finito(C.dmg)) err(`${r.id}.onBeforeHurt dejó C.dmg no finito (${C.dmg})`);
          if (nombre === 'onHeal' && (!finito(C.amount) || C.amount < 0)) err(`${r.id}.onHeal dejó C.amount inválido (${C.amount})`);
          if (nombre === 'onBeforeHurt' && typeof C.canceled !== 'boolean') err(`${r.id}.onBeforeHurt dejó C.canceled no booleano`);
        }
      }
      // La memoria no debe crecer sin límite (fugas de estado por partida).
      for (const k of Object.keys(mem)) {
        const v = mem[k];
        if (Array.isArray(v) && v.length > 64) err(`${r.id}.${nombre}: mem.${k} crece sin tope (${v.length})`);
        if (typeof v === 'number' && !finito(v)) err(`${r.id}.${nombre}: mem.${k} no finito`);
      }
    }
  }
}
notes.push(`smoke test: ${ejecuciones} ejecuciones de hooks sin excepciones`);

/* -------------------- 5. sinergias declaradas (informe) ------------------- */
const sinergias = new Map();
for (const call of findCalls(src, 'C.has')) {
  const val = literal(call.args[0]);
  if (!val) continue;
  const antes = src.slice(0, call.index);
  const m = [...antes.matchAll(/id: '([a-z0-9_]+)'/g)].pop();
  const origen = m ? m[1] : '?';
  if (!sinergias.has(origen)) sinergias.set(origen, new Set());
  sinergias.get(origen).add(val);
}
if (sinergias.size < 6) err(`sólo ${sinergias.size} reliquias declaran sinergias con C.has (mínimo 6)`);

/* ------------------------------- informe --------------------------------- */
console.log('== SEMILLA MALDITA · validador de reliquias ==');
console.log(`archivo: ${path.relative(ROOT, FILE).replace(/\\/g, '/')} (${src.length} bytes, ${src.split('\n').length} líneas)`);
console.log(`reliquias: ${RELICS.length}  |  ` +
  RARITIES.map((r) => `${r} ${counts[r]}/${RARITY_COUNTS[r]}`).join('  ·  '));
console.log(`ids únicos: ${ids.size}  |  iconos únicos: ${icons.size}  |  nombres es/en únicos: ${namesEs.size}/${namesEn.size}`);
const maxEs = Math.max(...RELICS.map((r) => (r.desc && r.desc.es ? r.desc.es.length : 0)));
const maxEn = Math.max(...RELICS.map((r) => (r.desc && r.desc.en ? r.desc.en.length : 0)));
console.log(`desc más larga: es ${maxEs} · en ${maxEn} (límite 70)`);
console.log('');
for (const nt of notes) console.log(`  · ${nt}`);
console.log('');
console.log('sinergias declaradas con C.has():');
for (const [origen, destinos] of [...sinergias].sort()) {
  console.log(`  ${origen} -> ${[...destinos].join(', ')}`);
}
console.log('');
if (warnings.size) {
  console.log(`AVISOS (${warnings.size}):`);
  for (const w of render(warnings)) console.log(`  ! ${w}`);
  console.log('');
}
if (errors.size) {
  console.log(`ERRORES (${errors.size} distintos):`);
  for (const e of render(errors)) console.log(`  x ${e}`);
  process.exit(1);
}
console.log('RESULTADO: OK — 0 errores.');
