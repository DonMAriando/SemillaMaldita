/* =============================================================================
   SEMILLA MALDITA — 20-relics.js
   Catálogo de reliquias (CONTENIDO puro). Script clásico, sin import/export.
   El motor inyecta el objeto `C` en cada hook; aquí NO se toca nada más.

   Reparto: 18 comunes / 16 raras / 12 épicas / 8 malditas = 54 reliquias.

   Racimos de sinergia (ver tabla al final del archivo):
     fuego   : chispa_eterna -> brasa_persistente -> detonador_de_cenizas
     hielo   : escarcha_mordiente + aliento_glacial -> martillo_de_permafrost
     rayo    : chispa_saltarina -> conductor_de_tormentas
     veneno  : colmillo_ponzonoso + bruma_letargica -> caldero_de_plagas
     critico : ojo_del_verdugo + filo_carnicero -> metronomo_carmesi
     sangre  : garras_desgarradoras + sandalias_de_liebre + impetu_del_lobo
               + danza_de_cuchillas
     invocar : pacto_del_lobo + estandarte_de_marfil -> corte_de_espiritus
     oro     : moneda_de_sangre + codicia_del_usurero -> avaricia_dorada
     escudo  : caparazon_de_quitina + muralla_portatil -> baluarte_perpetuo
     riesgo  : corazon_desesperado + furia_agonica -> ultimo_aliento
     estados : tomo_de_ecos alarga TODOS los estados que apliques
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     Ayudantes locales (viven en este closure, no ensucian el ámbito global).
     Todo aquí es defensivo: si el motor pasa algo raro, la reliquia no revienta.
     ------------------------------------------------------------------------ */

  // Número seguro: nunca NaN, nunca Infinity.
  function n(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  // Copias de esta reliquia (mínimo 1).
  function st(C) { var s = Math.floor(n(C && C.stacks)); return s > 0 ? s : 1; }

  // Convierte lo que devuelva el motor en un array limpio, sin huecos.
  function list(a) {
    var out = [];
    if (!a || typeof a.length !== 'number') return out;
    for (var i = 0; i < a.length; i++) { if (a[i]) out.push(a[i]); }
    return out;
  }

  // Igual que list() pero quitando un enemigo concreto.
  function without(a, skip) {
    var l = list(a), out = [];
    for (var i = 0; i < l.length; i++) { if (l[i] !== skip) out.push(l[i]); }
    return out;
  }

  // Elige un enemigo al azar con el rng determinista del motor (o null).
  function pickOne(C, a) {
    var l = list(a);
    if (!l.length) return null;
    if (C && C.rng && typeof C.rng.pick === 'function') { return C.rng.pick(l) || l[0]; }
    return l[0];
  }

  // Probabilidad 0..1 usando SIEMPRE el rng del motor.
  function chance(C, p) {
    var q = n(p);
    if (q <= 0) return false;
    if (q >= 1) return true;
    if (!C || !C.rng) return false;
    if (typeof C.rng.chance === 'function') return !!C.rng.chance(q);
    if (typeof C.rng.next === 'function') return n(C.rng.next()) < q;
    return false;
  }

  // Enemigo más cercano dentro de un radio, o null si no hay nadie.
  function nearest(C, r) {
    var l = list(C.enemiesInRadius(r)), best = null, bd = 1e9;
    for (var i = 0; i < l.length; i++) {
      var d = n(C.dist(l[i]));
      if (d < bd) { bd = d; best = l[i]; }
    }
    return best;
  }

  // Candado anti-recursión: para hooks que vuelven a aplicar estados.
  function lockOn(C, k) {
    if (!C || !C.mem) return false;
    if (C.mem[k]) return false;
    C.mem[k] = 1;
    return true;
  }
  function lockOff(C, k) { if (C && C.mem) C.mem[k] = 0; }

  // Cupo de usos por turno (blindaje contra bucles infinitos).
  function quotaTurn(C, k, max) {
    if (!C || !C.mem) return false;
    var t = Math.floor(n(C.turn));
    if (C.mem[k + '_t'] !== t) { C.mem[k + '_t'] = t; C.mem[k + '_n'] = 0; }
    var used = n(C.mem[k + '_n']);
    if (used >= n(max)) return false;
    C.mem[k + '_n'] = used + 1;
    return true;
  }

  // Cupo de usos por piso.
  function quotaFloor(C, k, max) {
    if (!C || !C.mem) return false;
    var f = Math.floor(n(C.floor));
    if (C.mem[k + '_f'] !== f) { C.mem[k + '_f'] = f; C.mem[k + '_c'] = 0; }
    var used = n(C.mem[k + '_c']);
    if (used >= n(max)) return false;
    C.mem[k + '_c'] = used + 1;
    return true;
  }

  // Suma acotada, para topes de escalado permanente.
  function grow(cur, add, cap) { return Math.min(n(cur) + n(add), n(cap)); }

  /* ---------------------------------------------------------------------------
     EL CATÁLOGO
     ------------------------------------------------------------------------ */
  var RELICS = [

    /* =========================== 18 COMUNES ============================== */

    {
      id: 'colmillo_vampirico',
      name: { es: 'Colmillo Vampírico', en: 'Vampiric Fang' },
      desc: { es: 'Robas 6% del daño como vida. +6% por copia.', en: 'Steal 6% of damage as life. +6% per copy.' },
      icon: '🦷',
      rarity: 'comun',
      tags: ['sangre', 'ofensiva'],
      maxStacks: 3,
      weight: 11,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.lifesteal += 0.06 * st(C);
        }
      }
    },

    {
      id: 'piedra_de_afilar',
      name: { es: 'Piedra de Afilar', en: 'Whetstone' },
      desc: { es: '+2 de ataque por copia.', en: '+2 attack per copy.' },
      icon: '🪨',
      rarity: 'comun',
      tags: ['ofensiva'],
      maxStacks: 5,
      weight: 12,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.atk += 2 * st(C);
        }
      }
    },

    {
      id: 'caparazon_de_quitina',
      name: { es: 'Caparazón de Quitina', en: 'Chitin Carapace' },
      desc: { es: '+2 defensa, +6 escudo máx. Al bajar: +4 escudo.', en: '+2 defense, +6 max shield. On descend: +4 shield.' },
      icon: '🐞',
      rarity: 'comun',
      tags: ['defensiva', 'escudo'],
      maxStacks: 3,
      weight: 10,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          var s = st(C);
          C.s.def += 2 * s;
          C.s.shieldMax += 6 * s;
        },
        onDescend: function (C) {
          if (!C) return;
          C.addShield(4 * st(C));
          C.sound('shieldUp');
        }
      }
    },

    {
      id: 'musgo_curativo',
      name: { es: 'Musgo Curativo', en: 'Healing Moss' },
      desc: { es: 'Curas 1 por turno. Al subir de nivel: +5 vida.', en: 'Heal 1 per turn. On level up: +5 life.' },
      icon: '🌿',
      rarity: 'comun',
      tags: ['curacion'],
      maxStacks: 3,
      weight: 10,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.regen += 1 * st(C);
        },
        onLevelUp: function (C) {
          if (!C) return;
          C.heal(5 * st(C));
          C.sound('heal');
        }
      }
    },

    {
      id: 'ojo_del_verdugo',
      name: { es: 'Ojo del Verdugo', en: 'Headsman Eye' },
      desc: { es: '+6% de crítico por copia.', en: '+6% crit chance per copy.' },
      icon: '👁️',
      rarity: 'comun',
      tags: ['critico'],
      maxStacks: 4,
      weight: 10,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.crit += 0.06 * st(C);
        }
      }
    },

    {
      id: 'filo_carnicero',
      name: { es: 'Filo Carnicero', en: 'Butcher Edge' },
      desc: { es: 'Tus críticos hacen +25% de daño por copia.', en: 'Your crits deal +25% damage per copy.' },
      icon: '🔪',
      rarity: 'comun',
      tags: ['critico', 'ofensiva'],
      maxStacks: 3,
      weight: 9,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.critMult += 0.25 * st(C);
        }
      }
    },

    {
      id: 'capa_polvorienta',
      name: { es: 'Capa Polvorienta', en: 'Dusty Cloak' },
      desc: { es: '+5% esquiva por copia. Dash: invisible 1 turno.', en: '+5% dodge per copy. Dash: invisible 1 turn.' },
      icon: '🧥',
      rarity: 'comun',
      tags: ['sigilo', 'defensiva'],
      maxStacks: 3,
      weight: 10,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.dodge += 0.05 * st(C);
        },
        onDash: function (C) {
          if (!C) return;
          C.addSelfBuff('invisible', 1, 1);
          C.fx('humo', null, '#9aa3b2');
        }
      }
    },

    {
      id: 'piel_de_espinas',
      name: { es: 'Piel de Espinas', en: 'Thornhide' },
      desc: { es: '+3 espinas por copia: dañas a quien te pega.', en: '+3 thorns per copy: hurt whoever hits you.' },
      icon: '🌵',
      rarity: 'comun',
      tags: ['defensiva'],
      maxStacks: 3,
      weight: 9,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.thorns += 3 * st(C);
        }
      }
    },

    {
      id: 'chispa_eterna',
      name: { es: 'Chispa Eterna', en: 'Everspark' },
      desc: { es: '25% de Quemado 3 turnos al golpear (+15/copia).', en: '25% Burn for 3 turns on hit (+15% per copy).' },
      icon: '🔥',
      rarity: 'comun',
      tags: ['fuego', 'ofensiva'],
      maxStacks: 3,
      weight: 10,
      minFloor: 1,
      hooks: {
        onAfterAttack: function (C) {
          if (!C || !C.target) return;
          var s = st(C);
          if (!chance(C, 0.25 + 0.15 * (s - 1))) return;
          C.addStatus(C.target, 'quemado', 3, 2);
          C.fx('chispa', C.target, '#ff8a3d');
          C.sound('burn');
        }
      }
    },

    {
      id: 'escarcha_mordiente',
      name: { es: 'Escarcha Mordiente', en: 'Biting Frost' },
      desc: { es: '22% de Lento 2 turnos al golpear (+12/copia).', en: '22% Slow for 2 turns on hit (+12% per copy).' },
      icon: '❄️',
      rarity: 'comun',
      tags: ['hielo', 'ofensiva'],
      maxStacks: 3,
      weight: 9,
      minFloor: 1,
      hooks: {
        onAfterAttack: function (C) {
          if (!C || !C.target) return;
          var s = st(C);
          if (!chance(C, 0.22 + 0.12 * (s - 1))) return;
          C.addStatus(C.target, 'lento', 2, 1);
          C.fx('hielo', C.target, '#9fe4ff');
          C.sound('freeze');
        }
      }
    },

    {
      id: 'chispa_saltarina',
      name: { es: 'Chispa Saltarina', en: 'Leaping Spark' },
      desc: { es: '20% de Electrificado al golpear (+10/copia).', en: '20% Shocked on hit (+10% per copy).' },
      icon: '⚡',
      rarity: 'comun',
      tags: ['rayo', 'ofensiva'],
      maxStacks: 3,
      weight: 9,
      minFloor: 1,
      hooks: {
        onAfterAttack: function (C) {
          if (!C || !C.target) return;
          var s = st(C);
          if (!chance(C, 0.20 + 0.10 * (s - 1))) return;
          C.addStatus(C.target, 'electrificado', 3, 2);
          C.fx('rayo', C.target, '#ffe066');
          C.sound('shock');
        }
      }
    },

    {
      id: 'colmillo_ponzonoso',
      name: { es: 'Colmillo Ponzoñoso', en: 'Venom Tooth' },
      desc: { es: '25% de Veneno 4 turnos al golpear (+15/copia).', en: '25% Poison for 4 turns on hit (+15% per copy).' },
      icon: '🐍',
      rarity: 'comun',
      tags: ['veneno', 'ofensiva'],
      maxStacks: 3,
      weight: 10,
      minFloor: 1,
      hooks: {
        onAfterAttack: function (C) {
          if (!C || !C.target) return;
          var s = st(C);
          if (!chance(C, 0.25 + 0.15 * (s - 1))) return;
          C.addStatus(C.target, 'envenenado', 4, 2);
          C.fx('humo', C.target, '#8ddc6a');
          C.sound('poison');
        }
      }
    },

    {
      id: 'garras_desgarradoras',
      name: { es: 'Garras Desgarradoras', en: 'Rending Claws' },
      desc: { es: '25% de Sangrado 3 turnos al golpear (+15/copia).', en: '25% Bleed for 3 turns on hit (+15% per copy).' },
      icon: '🐾',
      rarity: 'comun',
      tags: ['sangre', 'ofensiva'],
      maxStacks: 3,
      weight: 10,
      minFloor: 1,
      hooks: {
        onAfterAttack: function (C) {
          if (!C || !C.target) return;
          var s = st(C);
          if (!chance(C, 0.25 + 0.15 * (s - 1))) return;
          C.addStatus(C.target, 'sangrado', 3, 2);
          C.fx('sangre', C.target, '#c62828');
        }
      }
    },

    {
      id: 'sandalias_de_liebre',
      name: { es: 'Sandalias de Liebre', en: 'Hare Sandals' },
      desc: { es: '+10% de acciones por turno y +2% esquiva.', en: '+10% actions per turn and +2% dodge.' },
      icon: '🐇',
      rarity: 'comun',
      tags: ['movimiento', 'tempo'],
      maxStacks: 2,
      weight: 8,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          var s = st(C);
          C.s.speed += 0.10 * s;
          C.s.dodge += 0.02 * s;
        }
      }
    },

    {
      id: 'ojo_de_bruja',
      name: { es: 'Ojo de Bruja', en: 'Witch Eye' },
      desc: { es: '+1 visión. Tu Ulti hace 6 de daño arcano cerca.', en: '+1 vision. Your Ult deals 6 arcane damage nearby.' },
      icon: '🔮',
      rarity: 'comun',
      tags: ['arcana', 'utilidad'],
      maxStacks: 2,
      weight: 9,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          var s = st(C);
          C.s.vision += 1 * s;
          C.s.luck += 2 * s;
        },
        onUlt: function (C) {
          if (!C) return;
          var l = list(C.enemiesInRadius(3));
          if (!l.length) return;
          C.damageAll(l, 6 * st(C), 'arcano');
          C.fx('anillo', null, '#c58cff');
          C.sound('magicBolt');
        }
      }
    },

    {
      id: 'moneda_de_sangre',
      name: { es: 'Moneda de Sangre', en: 'Blood Coin' },
      desc: { es: '+2 oro por muerte y +1 al recoger algo.', en: '+2 gold per kill and +1 on each pickup.' },
      icon: '🪙',
      rarity: 'comun',
      tags: ['oro', 'utilidad'],
      maxStacks: 3,
      weight: 10,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.goldMult += 0.10 * st(C);
        },
        onKill: function (C) {
          if (!C) return;
          C.addGold(2 * st(C));
        },
        onPickup: function (C) {
          if (!C || !C.item) return;
          C.addGold(1 * st(C));
          C.sound('coin');
        }
      }
    },

    {
      id: 'frasco_espumoso',
      name: { es: 'Frasco Espumoso', en: 'Fizzing Flask' },
      desc: { es: 'Pociones +30% y dan 4 escudo. 15%/piso: poción.', en: 'Potions +30% and give 4 shield. 15%/floor: a potion.' },
      icon: '🧪',
      rarity: 'comun',
      tags: ['curacion', 'utilidad'],
      maxStacks: 3,
      weight: 9,
      minFloor: 1,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.potionPower += 0.30 * st(C);
        },
        onUsePotion: function (C) {
          if (!C) return;
          C.addShield(4 * st(C));
        },
        onFloorStart: function (C) {
          if (!C) return;
          if (!chance(C, 0.15 * st(C))) return;
          C.addPotions(1);
          C.log('Encuentras una poción olvidada.', 'You find a forgotten potion.', 'good');
        }
      }
    },

    {
      id: 'corazon_desesperado',
      name: { es: 'Corazón Desesperado', en: 'Desperate Heart' },
      desc: { es: 'Bajo 30% de vida: curas 8 y ganas 6 escudo.', en: 'Below 30% life: heal 8 and gain 6 shield.' },
      icon: '💔',
      rarity: 'comun',
      tags: ['riesgo', 'curacion'],
      maxStacks: 2,
      weight: 8,
      minFloor: 1,
      hooks: {
        onLowHp: function (C) {
          if (!C) return;
          var s = st(C);
          C.heal(8 * s);
          C.addShield(6 * s);
          C.floatText('¡Aguanta!', '#ff6b81');
          C.sound('heal');
        }
      }
    },

    /* ============================ 16 RARAS =============================== */

    {
      id: 'brasa_persistente',
      name: { es: 'Brasa Persistente', en: 'Clinging Ember' },
      desc: { es: 'El Quemado salta a otro enemigo y hace 2 más.', en: 'Burn jumps to another enemy and deals 2 more.' },
      icon: '🕯️',
      rarity: 'rara',
      tags: ['fuego', 'escala'],
      maxStacks: 2,
      weight: 7,
      minFloor: 2,
      hooks: {
        onStatusApplied: function (C) {
          if (!C || !C.target || C.status !== 'quemado') return;
          if (!lockOn(C, 'salto')) return;
          try {
            var s = st(C);
            var otro = pickOne(C, without(C.enemiesInRadius(3), C.target));
            if (otro) {
              C.addStatus(otro, 'quemado', 2, 2);
              C.fx('chispa', otro, '#ff8a3d');
            }
            C.damage(C.target, 2 * s + (C.has('chispa_eterna') ? 2 : 0), 'fuego');
          } finally {
            lockOff(C, 'salto');
          }
        }
      }
    },

    {
      id: 'aliento_glacial',
      name: { es: 'Aliento Glacial', en: 'Glacial Breath' },
      desc: { es: 'Cada 3 turnos congelas al enemigo más cercano.', en: 'Every 3 turns you freeze the closest enemy.' },
      icon: '🧊',
      rarity: 'rara',
      tags: ['hielo', 'tempo'],
      maxStacks: 2,
      weight: 6,
      minFloor: 3,
      hooks: {
        onTurnEnd: function (C) {
          if (!C || !C.mem) return;
          C.mem.t = n(C.mem.t) + 1;
          if (C.mem.t % 3 !== 0) return;
          var e = nearest(C, 3);
          if (!e) return;
          C.addStatus(e, 'congelado', st(C), 1);
          C.damage(e, 3 * st(C), 'hielo');
          C.fx('hielo', e, '#9fe4ff');
          C.sound('freeze');
        }
      }
    },

    {
      id: 'conductor_de_tormentas',
      name: { es: 'Conductor de Tormentas', en: 'Storm Conductor' },
      desc: { es: 'Electrificar hace 4 de rayo a todos los cercanos.', en: 'Shocking deals 4 lightning to all nearby foes.' },
      icon: '🌩️',
      rarity: 'rara',
      tags: ['rayo', 'ofensiva'],
      maxStacks: 2,
      weight: 6,
      minFloor: 3,
      hooks: {
        onStatusApplied: function (C) {
          if (!C || !C.target || C.status !== 'electrificado') return;
          if (!lockOn(C, 'arco')) return;
          try {
            var l = list(C.enemiesInRadius(3));
            if (!l.length) return;
            C.damageAll(l, 4 * st(C), 'rayo');
            C.fx('rayo', C.target, '#ffe066');
            C.sound('shock');
          } finally {
            lockOff(C, 'arco');
          }
        }
      }
    },

    {
      id: 'bruma_letargica',
      name: { es: 'Bruma Letárgica', en: 'Lethargic Mist' },
      desc: { es: '30% Lento al golpear. Con Veneno, también envenena.', en: '30% Slow on hit. With Venom, it also poisons.' },
      icon: '🌫️',
      rarity: 'rara',
      tags: ['veneno', 'tempo'],
      maxStacks: 2,
      weight: 7,
      minFloor: 2,
      hooks: {
        onAfterAttack: function (C) {
          if (!C || !C.target) return;
          var s = st(C);
          if (!chance(C, 0.30 + 0.15 * (s - 1))) return;
          C.addStatus(C.target, 'lento', 2 + s, 1);
          C.fx('humo', C.target, '#a3b1c6');
          if (C.has('colmillo_ponzonoso')) {
            C.addStatus(C.target, 'envenenado', 3, 2);
          }
        }
      }
    },

    {
      id: 'impetu_del_lobo',
      name: { es: 'Ímpetu del Lobo', en: 'Wolf Momentum' },
      desc: { es: 'Cada paso da +2 al próximo golpe (máx 4 pasos).', en: 'Each step adds +2 to your next hit (max 4 steps).' },
      icon: '🌀',
      rarity: 'rara',
      tags: ['movimiento', 'ofensiva'],
      maxStacks: 3,
      weight: 7,
      minFloor: 2,
      hooks: {
        onMove: function (C) {
          if (!C || !C.mem) return;
          C.mem.pasos = Math.min(n(C.mem.pasos) + 1, 4);
        },
        onBeforeAttack: function (C) {
          if (!C || !C.mem) return;
          var pasos = Math.min(n(C.mem.pasos), 4);
          C.mem.pasos = 0;
          if (pasos <= 0) return;
          C.dmg = n(C.dmg) + pasos * 2 * st(C);
          C.fx('chispa', C.target || null, '#ffd166');
        }
      }
    },

    {
      id: 'danza_de_cuchillas',
      name: { es: 'Danza de Cuchillas', en: 'Bladedance' },
      desc: { es: 'Al moverte, 2 de daño a los enemigos pegados.', en: 'When you move, 2 damage to adjacent enemies.' },
      icon: '🌪️',
      rarity: 'rara',
      tags: ['sangre', 'movimiento'],
      maxStacks: 2,
      weight: 6,
      minFloor: 3,
      hooks: {
        onMove: function (C) {
          if (!C) return;
          var l = list(C.adjacentEnemies());
          if (!l.length) return;
          C.damageAll(l, 2 * st(C), 'fisico');
          C.fx('anillo', null, '#e57373');
          if (C.has('garras_desgarradoras')) {
            var e = pickOne(C, l);
            if (e) C.addStatus(e, 'sangrado', 2, 2);
          }
        }
      }
    },

    {
      id: 'estandarte_de_marfil',
      name: { es: 'Estandarte de Marfil', en: 'Ivory Banner' },
      desc: { es: 'Cada piso: 1 esqueleto y Bendición 3 turnos.', en: 'Each floor: 1 skeleton and Blessing for 3 turns.' },
      icon: '🏴',
      rarity: 'rara',
      tags: ['invocacion', 'defensiva'],
      maxStacks: 1,
      weight: 6,
      minFloor: 3,
      hooks: {
        onFloorStart: function (C) {
          if (!C) return;
          C.summonAlly('esqueleto_aliado', 1);
          C.addSelfBuff('bendicion', 3, 1);
          if (C.has('pacto_del_lobo')) C.summonAlly('lobo', 1);
          C.sound('summon');
        }
      }
    },

    {
      id: 'pacto_del_lobo',
      name: { es: 'Pacto del Lobo', en: 'Wolf Pact' },
      desc: { es: '15% de invocar un lobo al matar (máx 3/piso).', en: '15% to summon a wolf on kill (max 3 per floor).' },
      icon: '🐺',
      rarity: 'rara',
      tags: ['invocacion', 'riesgo'],
      maxStacks: 2,
      weight: 6,
      minFloor: 2,
      hooks: {
        onKill: function (C) {
          if (!C) return;
          if (!chance(C, 0.15 * st(C))) return;
          if (!quotaFloor(C, 'lobos', 3)) return;
          C.summonAlly('lobo', 1);
          C.log('Un lobo responde a tu pacto.', 'A wolf answers your pact.', 'info');
          C.sound('summon');
        }
      }
    },

    {
      id: 'codicia_del_usurero',
      name: { es: 'Codicia del Usurero', en: 'Usurer Greed' },
      desc: { es: '+1 ataque por 80 de oro (máx +8) y +25% oro.', en: '+1 attack per 80 gold (max +8) and +25% gold.' },
      icon: '💰',
      rarity: 'rara',
      tags: ['oro', 'escala'],
      maxStacks: 2,
      weight: 6,
      minFloor: 2,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          var p = C.p || {};
          var s = st(C);
          C.s.atk += Math.min(8, Math.floor(n(p.gold) / 80)) * s;
          C.s.goldMult += 0.25 * s;
        }
      }
    },

    {
      id: 'muralla_portatil',
      name: { es: 'Muralla Portátil', en: 'Portable Wall' },
      desc: { es: 'Sin enemigos a 2 casillas: +4 escudo por turno.', en: 'No enemy within 2 tiles: +4 shield per turn.' },
      icon: '🧱',
      rarity: 'rara',
      tags: ['escudo', 'defensiva'],
      maxStacks: 2,
      weight: 7,
      minFloor: 2,
      hooks: {
        onTurnEnd: function (C) {
          if (!C) return;
          if (list(C.enemiesInRadius(2)).length > 0) return;
          C.addShield(4 * st(C));
        }
      }
    },

    {
      id: 'coraza_de_erizo',
      name: { es: 'Coraza de Erizo', en: 'Hedgehog Plating' },
      desc: { es: 'Quien te hiere recibe 4 de daño (8 con 2 copias).', en: 'Whoever wounds you takes 4 damage (8 at 2 copies).' },
      icon: '🦔',
      rarity: 'rara',
      tags: ['defensiva', 'ofensiva'],
      maxStacks: 2,
      weight: 7,
      minFloor: 2,
      hooks: {
        onAfterHurt: function (C) {
          if (!C || !C.source) return;
          C.damage(C.source, 4 * st(C), 'fisico');
          C.fx('chispa', C.source, '#cfd8dc');
        }
      }
    },

    {
      id: 'manto_de_sombras',
      name: { es: 'Manto de Sombras', en: 'Shadow Mantle' },
      desc: { es: '+5% esquiva. Invisible 2 turnos al llegar al piso.', en: '+5% dodge. Invisible 2 turns when a floor starts.' },
      icon: '🌑',
      rarity: 'rara',
      tags: ['sigilo', 'defensiva'],
      maxStacks: 1,
      weight: 6,
      minFloor: 3,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.dodge += 0.05;
        },
        onFloorStart: function (C) {
          if (!C) return;
          C.addSelfBuff('invisible', 2, 1);
        },
        onLowHp: function (C) {
          if (!C) return;
          C.addSelfBuff('invisible', 2, 1);
          C.fx('humo', null, '#5c6bc0');
        }
      }
    },

    {
      id: 'vial_de_metralla',
      name: { es: 'Vial de Metralla', en: 'Shrapnel Vial' },
      desc: { es: 'Beber poción hace 8 de daño a enemigos cercanos.', en: 'Drinking a potion deals 8 damage to nearby foes.' },
      icon: '💥',
      rarity: 'rara',
      tags: ['utilidad', 'ofensiva'],
      maxStacks: 2,
      weight: 6,
      minFloor: 3,
      hooks: {
        onUsePotion: function (C) {
          if (!C) return;
          var l = list(C.enemiesInRadius(2));
          if (!l.length) return;
          C.damageAll(l, 8 * st(C), 'fuego');
          C.fx('explosion', null, '#ff7043');
          C.shake(0.2);
          C.sound('explode');
        }
      }
    },

    {
      id: 'caliz_agrietado',
      name: { es: 'Cáliz Agrietado', en: 'Cracked Chalice' },
      desc: { es: 'Curas 2 al matar y +1 en cada curación.', en: 'Heal 2 on kill and +1 on every heal.' },
      icon: '🏺',
      rarity: 'rara',
      tags: ['curacion'],
      maxStacks: 2,
      weight: 7,
      minFloor: 2,
      hooks: {
        onRunStart: function (C) {
          if (!C) return;
          C.addPotions(1);
        },
        onKill: function (C) {
          if (!C) return;
          C.heal(2 * st(C));
        },
        onHeal: function (C) {
          if (!C) return;
          C.amount = n(C.amount) + 1 * st(C);
        }
      }
    },

    {
      id: 'furia_agonica',
      name: { es: 'Furia Agónica', en: 'Agony Fury' },
      desc: { es: 'Hasta +10 de ataque según la vida que te falte.', en: 'Up to +10 attack based on your missing life.' },
      icon: '😡',
      rarity: 'rara',
      tags: ['riesgo', 'ofensiva', 'escala'],
      maxStacks: 2,
      weight: 7,
      minFloor: 2,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          var p = C.p || {};
          var pct = n(p.hpPct);
          if (pct < 0) pct = 0;
          if (pct > 1) pct = 1;
          var falta = 1 - pct;
          C.s.atk += Math.min(10, Math.round(falta * 10)) * st(C);
        }
      }
    },

    {
      id: 'tomo_de_ecos',
      name: { es: 'Tomo de Ecos', en: 'Tome of Echoes' },
      desc: { es: 'Los estados que aplicas duran 2 turnos más.', en: 'Statuses you apply last 2 turns longer.' },
      icon: '📖',
      rarity: 'rara',
      tags: ['arcana', 'escala'],
      maxStacks: 1,
      weight: 5,
      minFloor: 4,
      hooks: {
        onStatusApplied: function (C) {
          if (!C || !C.target || !C.status) return;
          if (!lockOn(C, 'eco')) return;
          try {
            C.addStatus(C.target, C.status, Math.max(1, n(C.turns)) + 2, 1);
            C.fx('brillo', C.target, '#b39ddb');
          } finally {
            lockOff(C, 'eco');
          }
        }
      }
    },

    /* ============================ 12 ÉPICAS ============================== */

    {
      id: 'detonador_de_cenizas',
      name: { es: 'Detonador de Cenizas', en: 'Ash Detonator' },
      desc: { es: 'Al quemar, explota: 8 de fuego y 4 en el área.', en: 'On burn it explodes: 8 fire damage and 4 in area.' },
      icon: '🎆',
      rarity: 'epica',
      tags: ['fuego', 'ofensiva'],
      maxStacks: 1,
      weight: 3,
      minFloor: 5,
      hooks: {
        onStatusApplied: function (C) {
          if (!C || !C.target || C.status !== 'quemado') return;
          if (!lockOn(C, 'boom')) return;
          try {
            var d = 8;
            if (C.has('chispa_eterna')) d += 4;
            if (C.has('brasa_persistente')) d += 4;
            C.damage(C.target, d, 'fuego');
            var l = without(C.enemiesInRadius(2), C.target);
            if (l.length) C.damageAll(l, Math.floor(d / 2), 'fuego');
            C.fx('explosion', C.target, '#ff5722');
            C.shake(0.25);
            C.sound('explode');
          } finally {
            lockOff(C, 'boom');
          }
        }
      }
    },

    {
      id: 'martillo_de_permafrost',
      name: { es: 'Martillo de Permafrost', en: 'Permafrost Hammer' },
      desc: { es: 'Golpear a un enemigo helado hace x2 de daño.', en: 'Hitting a chilled enemy deals x2 damage.' },
      icon: '🔨',
      rarity: 'epica',
      tags: ['hielo', 'ofensiva'],
      maxStacks: 1,
      weight: 3,
      minFloor: 5,
      hooks: {
        onFloorStart: function (C) {
          if (!C || !C.mem) return;
          C.mem.helados = [];
        },
        onStatusApplied: function (C) {
          if (!C || !C.mem || !C.target) return;
          if (C.status !== 'congelado' && C.status !== 'lento') return;
          if (!C.mem.helados || typeof C.mem.helados.length !== 'number') C.mem.helados = [];
          if (C.mem.helados.indexOf(C.target) === -1) C.mem.helados.push(C.target);
          if (C.mem.helados.length > 16) C.mem.helados.shift();
        },
        onBeforeAttack: function (C) {
          if (!C || !C.mem || !C.target) return;
          var h = C.mem.helados;
          if (!h || typeof h.length !== 'number') return;
          if (h.indexOf(C.target) === -1) return;
          C.dmg = n(C.dmg) * 2;
          C.fx('hielo', C.target, '#81d4fa');
          C.sound('hitHeavy');
        }
      }
    },

    {
      id: 'filo_ciclon',
      name: { es: 'Filo Ciclón', en: 'Cyclone Edge' },
      desc: { es: 'Tus golpes hacen 50% del daño a los otros pegados.', en: 'Your hits deal 50% damage to other adjacent foes.' },
      icon: '⚔️',
      rarity: 'epica',
      tags: ['ofensiva'],
      maxStacks: 1,
      weight: 3,
      minFloor: 6,
      hooks: {
        onAfterAttack: function (C) {
          if (!C) return;
          if (!lockOn(C, 'ciclon')) return;
          try {
            var l = without(C.adjacentEnemies(), C.target);
            if (!l.length) return;
            var d = Math.max(1, Math.floor(n(C.dmgDealt) / 2));
            C.damageAll(l, d, 'fisico');
            C.fx('anillo', null, '#ffcc80');
            C.sound('hit');
          } finally {
            lockOff(C, 'ciclon');
          }
        }
      }
    },

    {
      id: 'sed_de_carniceria',
      name: { es: 'Sed de Carnicería', en: 'Butchery Thirst' },
      desc: { es: 'Al matar ganas un turno extra (máx 2 por turno).', en: 'Kills grant an extra turn (max 2 per turn).' },
      icon: '🥩',
      rarity: 'epica',
      tags: ['tempo', 'ofensiva'],
      maxStacks: 1,
      weight: 3,
      minFloor: 6,
      hooks: {
        onKill: function (C) {
          if (!C) return;
          if (!quotaTurn(C, 'extra', 2)) return;
          C.addSelfBuff('veloz', 1, 1);
          C.floatText('¡Otra vez!', '#ffd54f');
          C.sound('crit');
        }
      }
    },

    {
      id: 'baluarte_perpetuo',
      name: { es: 'Baluarte Perpetuo', en: 'Perpetual Bulwark' },
      desc: { es: 'Conservas tu escudo al bajar y ganas +5 más.', en: 'You keep your shield on descend and gain +5 more.' },
      icon: '🛡️',
      rarity: 'epica',
      tags: ['escudo', 'defensiva'],
      maxStacks: 1,
      weight: 3,
      minFloor: 5,
      hooks: {
        onDescend: function (C) {
          if (!C || !C.mem) return;
          var p = C.p || {};
          C.mem.guardado = Math.min(40, Math.max(0, n(p.shield)));
        },
        onFloorStart: function (C) {
          if (!C || !C.mem) return;
          var g = Math.min(40, Math.max(0, n(C.mem.guardado)));
          C.mem.guardado = 0;
          C.addShield(g + 5);
          C.sound('shieldUp');
        }
      }
    },

    {
      id: 'metronomo_carmesi',
      name: { es: 'Metrónomo Carmesí', en: 'Crimson Metronome' },
      desc: { es: 'Cada 3er golpe es crítico garantizado.', en: 'Every 3rd hit is a guaranteed critical.' },
      icon: '⏲️',
      rarity: 'epica',
      tags: ['critico', 'ofensiva'],
      maxStacks: 1,
      weight: 3,
      minFloor: 5,
      hooks: {
        onBeforeAttack: function (C) {
          if (!C || !C.mem) return;
          C.mem.golpes = n(C.mem.golpes) + 1;
          if (C.mem.golpes < 3) return;
          C.mem.golpes = 0;
          C.isCrit = true;
          if (C.has('filo_carnicero')) C.dmg = n(C.dmg) + 3;
          C.fx('brillo', C.target || null, '#ff5252');
        },
        onAfterAttack: function (C) {
          if (!C || !C.target || !C.isCrit) return;
          if (!C.has('garras_desgarradoras')) return;
          C.addStatus(C.target, 'sangrado', 3, 3);
        }
      }
    },

    {
      id: 'corazon_de_titan',
      name: { es: 'Corazón de Titán', en: 'Titan Heart' },
      desc: { es: 'Cada piso: +6 vida máxima para siempre (máx +60).', en: 'Each floor: +6 max life forever (up to +60).' },
      icon: '💗',
      rarity: 'epica',
      tags: ['escala', 'defensiva'],
      maxStacks: 1,
      weight: 3,
      minFloor: 6,
      hooks: {
        onRunStart: function (C) {
          if (!C || !C.mem) return;
          C.mem.bonus = n(C.mem.bonus);
        },
        onFloorStart: function (C) {
          if (!C || !C.mem) return;
          C.mem.bonus = grow(C.mem.bonus, 6, 60);
          C.heal(6);
          C.floatText('+6 vida máx.', '#ff8a80');
        },
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.maxHp += n(C.mem && C.mem.bonus);
        }
      }
    },

    {
      id: 'avaricia_dorada',
      name: { es: 'Avaricia Dorada', en: 'Golden Avarice' },
      desc: { es: '+1 ataque por 40 de oro (máx +12) y +50% de oro.', en: '+1 attack per 40 gold (max +12) and +50% gold.' },
      icon: '👑',
      rarity: 'epica',
      tags: ['oro', 'escala'],
      maxStacks: 1,
      weight: 2,
      minFloor: 7,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          var p = C.p || {};
          var oro = Math.max(0, n(p.gold));
          C.s.atk += Math.min(12, Math.floor(oro / 40));
          C.s.crit += Math.min(0.15, Math.floor(oro / 200) * 0.05);
          C.s.goldMult += 0.5;
        },
        onKill: function (C) {
          if (!C) return;
          C.addGold(3 + (C.has('moneda_de_sangre') ? 2 : 0));
        }
      }
    },

    {
      id: 'corte_de_espiritus',
      name: { es: 'Corte de Espíritus', en: 'Spirit Court' },
      desc: { es: '2 espíritus por piso y 1 más cada 4 muertes.', en: '2 spirits per floor and 1 more every 4 kills.' },
      icon: '👻',
      rarity: 'epica',
      tags: ['invocacion'],
      maxStacks: 1,
      weight: 3,
      minFloor: 6,
      hooks: {
        onFloorStart: function (C) {
          if (!C) return;
          C.summonAlly('espiritu', 2);
          C.addSelfBuff('bendicion', 4, 1);
          if (C.has('estandarte_de_marfil')) C.summonAlly('esqueleto_aliado', 1);
          C.sound('summon');
        },
        onKill: function (C) {
          if (!C || !C.mem) return;
          C.mem.muertes = n(C.mem.muertes) + 1;
          if (C.mem.muertes % 4 !== 0) return;
          if (!quotaFloor(C, 'espiritus', 4)) return;
          C.summonAlly('espiritu', 1);
          C.sound('summon');
        }
      }
    },

    {
      id: 'ultimo_aliento',
      name: { es: 'Último Aliento', en: 'Last Breath' },
      desc: { es: 'El golpe mortal te deja en 1 vida (1 vez/piso).', en: 'A lethal hit leaves you at 1 life (once per floor).' },
      icon: '🕊️',
      rarity: 'epica',
      tags: ['defensiva', 'riesgo'],
      maxStacks: 1,
      weight: 2,
      minFloor: 7,
      hooks: {
        onBeforeHurt: function (C) {
          if (!C) return;
          var p = C.p || {};
          var vida = n(p.hp);
          if (vida <= 0) return;
          if (n(C.dmg) < vida) return;
          if (!quotaFloor(C, 'milagro', 1)) return;
          C.canceled = true;
          if (vida > 1) C.hurtSelf(vida - 1);
          C.addShield(10);
          C.log('¡Te niegas a morir!', 'You refuse to die!', 'epic');
          C.sound('block');
          C.shake(0.4);
        }
      }
    },

    {
      id: 'caldero_de_plagas',
      name: { es: 'Caldero de Plagas', en: 'Plague Cauldron' },
      desc: { es: 'Veneno aplica Lento 2 y Lento aplica Veneno 3.', en: 'Poison applies Slow 2 and Slow applies Poison 3.' },
      icon: '🥣',
      rarity: 'epica',
      tags: ['veneno', 'tempo'],
      maxStacks: 1,
      weight: 3,
      minFloor: 5,
      hooks: {
        onStatusApplied: function (C) {
          if (!C || !C.target) return;
          if (C.status !== 'envenenado' && C.status !== 'lento') return;
          if (!lockOn(C, 'plaga')) return;
          try {
            if (C.status === 'envenenado') {
              C.addStatus(C.target, 'lento', 2, 1);
              C.damage(C.target, 3, 'veneno');
            } else {
              C.addStatus(C.target, 'envenenado', 3, 3);
            }
            C.fx('humo', C.target, '#7cb342');
            C.sound('poison');
          } finally {
            lockOff(C, 'plaga');
          }
        }
      }
    },

    {
      id: 'grimorio_del_tiempo',
      name: { es: 'Grimorio del Tiempo', en: 'Grimoire of Time' },
      desc: { es: 'Cada 12 turnos ganas +1 de ataque (máx +12).', en: 'Every 12 turns you gain +1 attack (up to +12).' },
      icon: '⌛',
      rarity: 'epica',
      tags: ['arcana', 'escala'],
      maxStacks: 1,
      weight: 3,
      minFloor: 6,
      hooks: {
        onTurnEnd: function (C) {
          if (!C || !C.mem) return;
          C.mem.tics = n(C.mem.tics) + 1;
          if (C.mem.tics % 12 !== 0) return;
          C.mem.atk = grow(C.mem.atk, 1, 12);
          C.floatText('+1 ataque', '#ce93d8');
          C.sound('relic');
        },
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.atk += n(C.mem && C.mem.atk);
        }
      }
    },

    /* =========================== 8 MALDITAS ============================== */

    {
      id: 'pacto_de_sangre',
      name: { es: 'Pacto de Sangre', en: 'Blood Pact' },
      desc: { es: '+10 ataque y robas vida, pero -30 de vida máxima.', en: '+10 attack and lifesteal, but -30 max life.' },
      icon: '🩸',
      rarity: 'maldita',
      tags: ['sangre', 'ofensiva', 'riesgo'],
      maxStacks: 1,
      weight: 4,
      minFloor: 3,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.atk += 10;
          C.s.lifesteal += 0.05;
          C.s.maxHp -= 30;
        },
        onRunStart: function (C) {
          if (!C) return;
          C.log('El pacto bebe de tu carne.', 'The pact drinks from your flesh.', 'bad');
          C.sound('curse');
        }
      }
    },

    {
      id: 'corona_de_espinas',
      name: { es: 'Corona de Espinas', en: 'Crown of Thorns' },
      desc: { es: '+14 espinas, pero recibes 25% más de daño.', en: '+14 thorns, but you take 25% more damage.' },
      icon: '🥀',
      rarity: 'maldita',
      tags: ['defensiva', 'riesgo'],
      maxStacks: 1,
      weight: 4,
      minFloor: 3,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.thorns += 14;
          C.s.def += 4;
        },
        onBeforeHurt: function (C) {
          if (!C) return;
          C.dmg = Math.ceil(n(C.dmg) * 1.25);
        }
      }
    },

    {
      id: 'ojo_cegado',
      name: { es: 'Ojo Cegado', en: 'Blinded Eye' },
      desc: { es: '+25% crítico, pero no esquivas y ves 2 menos.', en: '+25% crit, but you never dodge and see 2 less.' },
      icon: '🕶️',
      rarity: 'maldita',
      tags: ['critico', 'riesgo'],
      maxStacks: 1,
      weight: 4,
      minFloor: 4,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.crit += 0.25;
          C.s.critMult += 0.25;
          C.s.dodge -= 1;
          C.s.vision -= 2;
        }
      }
    },

    {
      id: 'reloj_descompuesto',
      name: { es: 'Reloj Descompuesto', en: 'Broken Clock' },
      desc: { es: '+35% de acciones, pero pierdes 2 vida por turno.', en: '+35% actions, but you lose 2 life every turn.' },
      icon: '⏳',
      rarity: 'maldita',
      tags: ['tempo', 'riesgo'],
      maxStacks: 1,
      weight: 4,
      minFloor: 4,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.speed += 0.35;
        },
        onTurnEnd: function (C) {
          if (!C) return;
          var p = C.p || {};
          if (n(p.hp) <= 2) return;
          C.hurtSelf(2);
        }
      }
    },

    {
      id: 'boca_del_abismo',
      name: { es: 'Boca del Abismo', en: 'Maw of the Abyss' },
      desc: { es: 'Robas 22% del daño, pero curas la mitad.', en: 'Steal 22% of damage, but all healing is halved.' },
      icon: '🕳️',
      rarity: 'maldita',
      tags: ['sangre', 'curacion', 'riesgo'],
      maxStacks: 1,
      weight: 4,
      minFloor: 4,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.lifesteal += 0.22;
          C.s.atk += 5;
        },
        onHeal: function (C) {
          if (!C) return;
          C.amount = Math.floor(n(C.amount) / 2);
        }
      }
    },

    {
      id: 'grillete_del_condenado',
      name: { es: 'Grillete del Condenado', en: 'Damned Shackle' },
      desc: { es: '+12 defensa y +15 escudo, pero actúas 25% menos.', en: '+12 defense and +15 shield, but 25% fewer actions.' },
      icon: '⛓️',
      rarity: 'maldita',
      tags: ['defensiva', 'escudo', 'riesgo'],
      maxStacks: 1,
      weight: 4,
      minFloor: 3,
      hooks: {
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.def += 12;
          C.s.shieldMax += 25;
          C.s.speed -= 0.25;
        },
        onFloorStart: function (C) {
          if (!C) return;
          C.addShield(15);
          C.sound('shieldUp');
        }
      }
    },

    {
      id: 'ofrenda_de_cuna',
      name: { es: 'Ofrenda de Cuna', en: 'Cradle Offering' },
      desc: { es: 'Bajar de piso: -6 vida y +1 ataque para siempre.', en: 'On descend: -6 life and +1 attack forever.' },
      icon: '🪦',
      rarity: 'maldita',
      tags: ['escala', 'riesgo'],
      maxStacks: 1,
      weight: 3,
      minFloor: 5,
      hooks: {
        onDescend: function (C) {
          if (!C || !C.mem) return;
          var p = C.p || {};
          if (n(p.hp) > 6) C.hurtSelf(6);
          C.mem.atk = grow(C.mem.atk, 1, 15);
          C.log('La ofrenda cobra su precio.', 'The offering takes its price.', 'bad');
          C.sound('curse');
        },
        stats: function (C) {
          if (!C || !C.s) return;
          C.s.atk += n(C.mem && C.mem.atk);
        }
      }
    },

    {
      id: 'mascara_de_la_locura',
      name: { es: 'Máscara de la Locura', en: 'Mask of Madness' },
      desc: { es: 'Golpeas 50% más fuerte, pero te haces 2 de daño.', en: 'You hit 50% harder, but you take 2 damage.' },
      icon: '🎭',
      rarity: 'maldita',
      tags: ['ofensiva', 'riesgo'],
      maxStacks: 1,
      weight: 5,
      minFloor: 2,
      hooks: {
        onBeforeAttack: function (C) {
          if (!C) return;
          C.dmg = Math.floor(n(C.dmg) * 1.5);
        },
        onAfterAttack: function (C) {
          if (!C) return;
          var p = C.p || {};
          if (n(p.hp) <= 2) return;
          C.hurtSelf(2);
          C.fx('sangre', null, '#b71c1c');
        }
      }
    }
  ];

  // Índice por id para que el motor busque en O(1).
  var BY_ID = {};
  for (var i = 0; i < RELICS.length; i++) {
    BY_ID[RELICS[i].id] = RELICS[i];
  }

  window.RELICS = RELICS;
  window.RELIC_BY_ID = BY_ID;
})();
