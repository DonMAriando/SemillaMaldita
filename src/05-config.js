/* ════════════════════════════════════════════════════════════════════
   05-config.js — todos los números del juego en un solo sitio.
   Si algo se siente mal al jugar, se arregla aquí y no en la lógica.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var CFG = (function(){

  /* ─────────── Mapa ─────────── */
  var MW = 44, MH = 30;

  var T_ = {
    WALL:0, FLOOR:1, STAIRS:2, DOOR:3, WATER:4, LAVA:5,
    SPIKES:6, CHASM:7, RUBBLE:8, ALTAR:9, TORCH:10, WEB:11, GRASS:12
  };
  /** Casillas que no se pueden atravesar caminando. */
  var SOLID = {}; SOLID[T_.WALL] = 1; SOLID[T_.CHASM] = 1; SOLID[T_.TORCH] = 1;
  /** Casillas que bloquean la visión. */
  var OPAQUE = {}; OPAQUE[T_.WALL] = 1; OPAQUE[T_.TORCH] = 1; OPAQUE[T_.DOOR] = 1;

  /* ─────────── Biomas: cada 5 pisos cambia el mundo ───────────
     Cambiar de paleta y de amenazas cada 5 pisos es lo que evita que
     una partida de 25 pisos se sienta como el mismo pasillo. */
  var BIOMES = [
    { id:'criptas', nameKey:'biome1', from:1,  to:5,
      wall:'#2a2440', wallTop:'#3d3560', floor:'#131020', floorAlt:'#171328', fog:'#0a0812',
      light:'#ffd39b', hazards:[T_.SPIKES, T_.RUBBLE], hazardRate:0.05,
      pool:['rat','bat','goblin','skeleton','spider','archer','slime'],
      boss:'boss_rat', music:0.2 },

    { id:'cavernas', nameKey:'biome2', from:6, to:10,
      wall:'#1f3330', wallTop:'#2e4a44', floor:'#0d1816', floorAlt:'#101d1a', fog:'#060f0d',
      light:'#9bffd3', hazards:[T_.WATER, T_.WEB, T_.RUBBLE], hazardRate:0.11,
      pool:['spider','bat','slime','goblin','skeleton','archer','hound','bomber','eye'],
      boss:'boss_bones', music:0.35 },

    { id:'fundicion', nameKey:'biome3', from:11, to:15,
      wall:'#3a2118', wallTop:'#573122', floor:'#1a0f0b', floorAlt:'#1f120c', fog:'#120705',
      light:'#ff9b5a', hazards:[T_.LAVA, T_.RUBBLE, T_.SPIKES], hazardRate:0.1,
      pool:['orc','demon','hound','golem','skeleton','bomber','knight','archer','cultist'],
      boss:'boss_troll', music:0.5 },

    { id:'vacio', nameKey:'biome4', from:16, to:20,
      wall:'#251c3a', wallTop:'#382a58', floor:'#0c0a18', floorAlt:'#0f0c1e', fog:'#050410',
      light:'#c77dff', hazards:[T_.CHASM, T_.RUBBLE], hazardRate:0.13,
      pool:['wraith','eye','cultist','golem','demon','knight','shaman','mimic'],
      boss:'boss_devourer', music:0.65 },

    { id:'jardin', nameKey:'biome5', from:21, to:25,
      wall:'#1e3320', wallTop:'#2d4d2f', floor:'#0b1509', floorAlt:'#0e1a0c', fog:'#050c05',
      light:'#b7ff7c', hazards:[T_.GRASS, T_.WEB, T_.SPIKES], hazardRate:0.14,
      pool:['spider','demon','wraith','shaman','cultist','golem','knight','mimic','hound'],
      boss:'boss_seed', music:0.8 },

    /* A partir del 26 el juego no termina: escala para siempre.
       Es donde vivirán los jugadores obsesivos y las tablas de récords. */
    { id:'eterno', nameKey:'biome6', from:26, to:9999,
      wall:'#2b2b2b', wallTop:'#454545', floor:'#0b0b0d', floorAlt:'#0e0e11', fog:'#050506',
      light:'#ffffff', hazards:[T_.LAVA, T_.CHASM, T_.SPIKES, T_.WEB], hazardRate:0.16,
      pool:['demon','golem','wraith','knight','cultist','shaman','mimic','hound','eye','orc'],
      boss:'random', music:1.0 }
  ];

  function biomeFor(floor){
    for (var i = 0; i < BIOMES.length; i++)
      if (floor >= BIOMES[i].from && floor <= BIOMES[i].to) return BIOMES[i];
    return BIOMES[BIOMES.length - 1];
  }
  var FINAL_FLOOR = 25;          // aquí está La Semilla; ganar es llegar y matarla
  var BOSS_EVERY = 5;
  function isBossFloor(f){ return f % BOSS_EVERY === 0; }

  /* Piso mínimo en el que puede aparecer cada nivel de enemigo.
     Sin esto el piso 1 escupe esqueletos y mata a quien acaba de
     abrir el juego, que es la forma más rápida de perder un jugador. */
  var TIER_FLOOR = [1, 3, 6, 10, 14];

  /**
   * Elige una especie del bioma adecuada a la profundidad.
   * Reparte alrededor de un "nivel ideal" que crece con el piso, así
   * las ratas no desaparecen de golpe ni siguen apareciendo en el 20.
   */
  function pickEnemyKind(biome, floor, rng){
    var avail = [];
    for (var i = 0; i < biome.pool.length; i++){
      var k = biome.pool[i], d = ENEMIES[k];
      if (!d) continue;
      if (TIER_FLOOR[(d.tier || 1) - 1] > floor) continue;
      avail.push(k);
    }
    if (!avail.length) avail = [biome.pool[0] || 'rat'];
    var ideal = Math.min(5, 1 + (floor - 1) / 4.2);
    return rng.weighted(avail, function(k){
      var t = ENEMIES[k].tier || 1;
      return Math.exp(-Math.abs(t - ideal) * 0.95) + 0.04;
    });
  }

  /* ─────────── Enemigos ───────────
     `ai` define el comportamiento; `hp/atk/def` son en el piso 1 y
     escalan con la profundidad en Dungeon.spawn().
     `speed` son acciones por turno del jugador: 0.5 = actúa cada 2 turnos. */
  var ENEMIES = {
    rat:      { name:{es:'Rata',en:'Rat'},                    hp:8,  atk:3,  def:0, xp:5,  gold:1,  speed:1,   ai:'chaser',   tier:1 },
    bat:      { name:{es:'Murciélago',en:'Bat'},              hp:7,  atk:4,  def:0, xp:7,  gold:1,  speed:1.5, ai:'erratic',  tier:1, dodge:0.25 },
    slime:    { name:{es:'Limo',en:'Slime'},                   hp:14, atk:3,  def:1, xp:9,  gold:2,  speed:0.7, ai:'splitter', tier:1 },
    goblin:   { name:{es:'Goblin',en:'Goblin'},                hp:13, atk:5,  def:1, xp:12, gold:6,  speed:1,   ai:'thief',    tier:1 },
    spider:   { name:{es:'Araña',en:'Spider'},                 hp:11, atk:4,  def:0, xp:13, gold:2,  speed:1.2, ai:'chaser',   tier:2, onHit:{status:'envenenado', turns:4, power:2} },
    archer:   { name:{es:'Arquero Óseo',en:'Bone Archer'},     hp:12, atk:6,  def:1, xp:16, gold:4,  speed:1,   ai:'ranged',   tier:2, range:6 },
    skeleton: { name:{es:'Esqueleto',en:'Skeleton'},           hp:20, atk:7,  def:3, xp:19, gold:4,  speed:1,   ai:'chaser',   tier:2 },
    bomber:   { name:{es:'Abisal Ígneo',en:'Firespawn'},       hp:10, atk:0,  def:0, xp:22, gold:5,  speed:1.2, ai:'bomber',   tier:2, blast:{r:2, dmg:16} },
    hound:    { name:{es:'Sabueso Infernal',en:'Hellhound'},   hp:18, atk:8,  def:1, xp:26, gold:4,  speed:2,   ai:'chaser',   tier:3 },
    eye:      { name:{es:'Ojo Vigilante',en:'Watcher'},        hp:16, atk:7,  def:2, xp:24, gold:6,  speed:1,   ai:'sentry',   tier:3, range:7 },
    orc:      { name:{es:'Orco',en:'Orc'},                     hp:30, atk:10, def:4, xp:31, gold:8,  speed:1,   ai:'charger',  tier:3 },
    cultist:  { name:{es:'Cultista',en:'Cultist'},             hp:22, atk:6,  def:2, xp:34, gold:10, speed:1,   ai:'summoner', tier:3, summons:['rat','bat','skeleton'] },
    knight:   { name:{es:'Caballero Caído',en:'Fallen Knight'},hp:34, atk:11, def:6, xp:44, gold:12, speed:0.8, ai:'guard',    tier:4, frontBlock:0.7 },
    shaman:   { name:{es:'Chamán',en:'Shaman'},                hp:24, atk:8,  def:2, xp:46, gold:14, speed:1,   ai:'healer',   tier:4, range:5 },
    wraith:   { name:{es:'Espectro',en:'Wraith'},              hp:26, atk:13, def:2, xp:48, gold:8,  speed:1,   ai:'phaser',   tier:4, drain:true },
    mimic:    { name:{es:'Mímico',en:'Mimic'},                 hp:38, atk:14, def:4, xp:55, gold:25, speed:1,   ai:'ambush',   tier:4 },
    golem:    { name:{es:'Gólem',en:'Golem'},                  hp:58, atk:15, def:10,xp:62, gold:10, speed:0.5, ai:'chaser',   tier:5 },
    demon:    { name:{es:'Demonio',en:'Demon'},                hp:48, atk:19, def:7, xp:88, gold:16, speed:1,   ai:'chaser',   tier:5, aura:{status:'quemado', turns:2, power:3} }
  };

  /* Jefes con fases: al cruzar un umbral de vida cambian de patrón.
     Es lo que convierte un saco de puntos de vida en una pelea. */
  var BOSSES = {
    boss_rat: { name:{es:'Rey Rata',en:'Rat King'}, hp:90, atk:11, def:4, xp:90, gold:60, speed:1,
      ai:'boss_summoner', summons:['rat','rat','bat'], phases:[{at:0.5, act:'enrage'}] },
    boss_bones: { name:{es:'Señor de los Huesos',en:'Bone Lord'}, hp:170, atk:17, def:8, xp:200, gold:110, speed:1,
      ai:'boss_ranged', range:8, summons:['skeleton','archer'], phases:[{at:0.6, act:'summon'},{at:0.3, act:'enrage'}] },
    boss_troll: { name:{es:'Trol de Guerra',en:'War Troll'}, hp:280, atk:24, def:12, xp:360, gold:180, speed:1,
      ai:'boss_charger', regen:6, phases:[{at:0.5, act:'enrage'},{at:0.25, act:'frenzy'}] },
    boss_devourer: { name:{es:'Devorador de Almas',en:'Soul Devourer'}, hp:420, atk:31, def:15, xp:600, gold:260, speed:1,
      ai:'boss_teleport', drain:true, phases:[{at:0.66, act:'summon'},{at:0.33, act:'frenzy'}] },
    boss_seed: { name:{es:'La Semilla',en:'The Seed'}, hp:700, atk:38, def:18, xp:1200, gold:500, speed:1,
      ai:'boss_final', phases:[{at:0.75, act:'summon'},{at:0.5, act:'enrage'},{at:0.25, act:'frenzy'}] }
  };
  var BOSS_ORDER = ['boss_rat','boss_bones','boss_troll','boss_devourer','boss_seed'];

  /* ─────────── Estados alterados ─────────── */
  var STATUS = {
    quemado:        { name:{es:'Quemado',en:'Burning'},    icon:'🔥', color:'#ff8f3f', dot:true,  tick:'turn' },
    envenenado:     { name:{es:'Envenenado',en:'Poisoned'},icon:'🧪', color:'#7cff6b', dot:true,  tick:'turn' },
    sangrado:       { name:{es:'Sangrando',en:'Bleeding'},  icon:'🩸', color:'#ff4d5e', dot:true,  tick:'move' },
    congelado:      { name:{es:'Congelado',en:'Frozen'},    icon:'❄️', color:'#8ee7ff', skip:true },
    aturdido:       { name:{es:'Aturdido',en:'Stunned'},    icon:'💫', color:'#ffe066', skip:true },
    marcado:        { name:{es:'Marcado',en:'Marked'},      icon:'🎯', color:'#ff5d8f', takeMore:0.35 },
    lento:          { name:{es:'Lento',en:'Slowed'},        icon:'🐌', color:'#9ad4ff', speedMul:0.5 },
    debil:          { name:{es:'Débil',en:'Weakened'},      icon:'💧', color:'#b0b0d0', atkMul:0.55 },
    electrificado:  { name:{es:'Electrificado',en:'Shocked'},icon:'⚡', color:'#ffe066', chain:true }
  };
  var BUFFS = {
    furia:      { name:{es:'Furia',en:'Fury'},        icon:'😡', color:'#ff5d6c', atkMul:1.5 },
    piedra:     { name:{es:'Piedra',en:'Stone'},      icon:'🪨', color:'#adb5bd', defAdd:6 },
    veloz:      { name:{es:'Veloz',en:'Swift'},       icon:'💨', color:'#8ee7ff', speedMul:2 },
    invisible:  { name:{es:'Invisible',en:'Unseen'},  icon:'👁️', color:'#8b8ba7', unseen:true },
    bendicion:  { name:{es:'Bendición',en:'Blessing'},icon:'✨', color:'#ffd166', regen:3 },
    reflejo:    { name:{es:'Reflejo',en:'Reflect'},   icon:'🪞', color:'#c77dff', thorns:0.5 },
    llamas:     { name:{es:'Aura Ígnea',en:'Fire Aura'}, icon:'🔆', color:'#ff8f3f', burnAura:3 }
  };

  /* ─────────── Estirpes (clases) ───────────
     Cada una debe cambiar CÓMO juegas, no sólo los números. */
  var CLASSES = [
    { id:'vagabundo', name:{es:'Vagabundo',en:'Wanderer'}, icon:'🗡️', cost:0,
      blurb:{es:'Equilibrado. Empieza con una reliquia extra.',
             en:'Balanced. Starts with an extra relic.'},
      hp:38, atk:6, def:3, potions:2, crit:0.08, dodge:0.03, vision:8,
      dashCd:6, ult:'torbellino', extraRelic:1 },

    { id:'berserker', name:{es:'Berserker',en:'Berserker'}, icon:'🪓', cost:400,
      blurb:{es:'Más daño cuanto menos vida te queda. Poca defensa.',
             en:'More damage the less health you have. Little defence.'},
      hp:40, atk:9, def:0, potions:1, crit:0.12, dodge:0, vision:7,
      dashCd:5, ult:'sed', passive:'rabia' },

    { id:'arcanista', name:{es:'Arcanista',en:'Arcanist'}, icon:'🔮', cost:700,
      blurb:{es:'Ataca a distancia con la Saeta. Frágil de cerca.',
             en:'Attacks at range with Bolt. Fragile up close.'},
      hp:26, atk:5, def:1, potions:2, crit:0.06, dodge:0.05, vision:9,
      dashCd:7, ult:'nova', ability:{ id:'saeta', cd:3, range:5, dmg:1.6 } },

    { id:'centinela', name:{es:'Centinela',en:'Sentinel'}, icon:'🛡️', cost:1100,
      blurb:{es:'Escudo que se regenera y devuelve el golpe.',
             en:'Self-regenerating shield that strikes back.'},
      hp:44, atk:5, def:5, potions:1, crit:0.04, dodge:0, vision:7,
      dashCd:8, ult:'baluarte', shieldMax:18, shieldRegen:2, thorns:0.35 },

    { id:'ladron', name:{es:'Ladrón',en:'Thief'}, icon:'🗝️', cost:1600,
      blurb:{es:'Rápido, esquiva y roba. El oro es tu arma.',
             en:'Fast, evasive, greedy. Gold is your weapon.'},
      hp:32, atk:6, def:2, potions:2, crit:0.2, dodge:0.18, vision:9,
      dashCd:4, ult:'sombras', goldMul:1.6, dashCharges:2 },

    { id:'nigromante', name:{es:'Nigromante',en:'Necromancer'}, icon:'💀', cost:2400,
      blurb:{es:'Alza esqueletos. Frágil, pero nunca pelea solo.',
             en:'Raises skeletons. Fragile, but never fights alone.'},
      hp:24, atk:5, def:1, potions:1, crit:0.07, dodge:0.04, vision:8,
      dashCd:7, ult:'ejercito', ability:{ id:'alzar', cd:7 } }
  ];
  function classById(id){
    for (var i=0;i<CLASSES.length;i++) if (CLASSES[i].id === id) return CLASSES[i];
    return CLASSES[0];
  }

  var ULTS = {
    torbellino:{ name:{es:'Torbellino',en:'Whirlwind'}, icon:'🌀', cost:100,
      desc:{es:'Golpea a todo a 2 casillas por 2.2x.',en:'Hit everything within 2 tiles for 2.2x.'} },
    sed:{ name:{es:'Sed de Sangre',en:'Bloodthirst'}, icon:'🩸', cost:100,
      desc:{es:'6 turnos: +50% ataque y robas vida.',en:'6 turns: +50% attack and lifesteal.'} },
    nova:{ name:{es:'Nova Arcana',en:'Arcane Nova'}, icon:'💥', cost:100,
      desc:{es:'Daño arcano a 3 casillas y congela.',en:'Arcane damage within 3 tiles, freezes.'} },
    baluarte:{ name:{es:'Baluarte',en:'Bulwark'}, icon:'🏰', cost:100,
      desc:{es:'Escudo enorme y reflejas el daño 6 turnos.',en:'Huge shield, reflect damage 6 turns.'} },
    sombras:{ name:{es:'Manto de Sombras',en:'Shadow Cloak'}, icon:'🌑', cost:100,
      desc:{es:'5 turnos invisible. El primer golpe hace 4x.',en:'5 turns unseen. First strike deals 4x.'} },
    ejercito:{ name:{es:'Ejército de Huesos',en:'Bone Army'}, icon:'☠️', cost:100,
      desc:{es:'Alzas 3 espíritus y un esqueleto.',en:'Raise 3 spirits and a skeleton.'} }
  };

  /* ─────────── Dificultad ─────────── */
  var DIFFS = [
    { id:'aprendiz', nameKey:'diffEasy',  descKey:'diffEasyD',  enemyMul:0.78, essMul:0.6, scoreMul:0.6, potions:1 },
    { id:'maldito',  nameKey:'diffNormal',descKey:'diffNormalD',enemyMul:1.0,  essMul:1.0, scoreMul:1.0, potions:0 },
    { id:'pesadilla',nameKey:'diffHard',  descKey:'diffHardD',  enemyMul:1.18, essMul:1.4, scoreMul:1.5, potions:0 },
    { id:'abismo',   nameKey:'diffInsane',descKey:'diffInsaneD',enemyMul:1.42, essMul:1.9, scoreMul:2.2, potions:-99 }
  ];
  function diffById(id){
    for (var i=0;i<DIFFS.length;i++) if (DIFFS[i].id === id) return DIFFS[i];
    return DIFFS[1];
  }

  /* ─────────── Árbol de esencia ─────────── */
  var UPGRADES = [
    { id:'vit', icon:'❤️', name:{es:'Vitalidad',en:'Vitality'},       desc:{es:'+8 vida máxima',en:'+8 max health'},        max:8, base:45,  mult:1.55 },
    { id:'fue', icon:'⚔️', name:{es:'Fuerza',en:'Strength'},          desc:{es:'+1 ataque',en:'+1 attack'},                 max:8, base:65,  mult:1.6  },
    { id:'pie', icon:'🪨', name:{es:'Piel de Piedra',en:'Stoneskin'}, desc:{es:'+1 defensa',en:'+1 defence'},               max:6, base:85,  mult:1.7  },
    { id:'alq', icon:'🧪', name:{es:'Alquimia',en:'Alchemy'},         desc:{es:'+1 poción inicial',en:'+1 starting potion'}, max:4, base:70, mult:1.7 },
    { id:'cri', icon:'🎯', name:{es:'Precisión',en:'Precision'},      desc:{es:'+3% crítico',en:'+3% crit'},                max:5, base:110, mult:1.65 },
    { id:'san', icon:'🦇', name:{es:'Sanguijuela',en:'Leech'},        desc:{es:'+2% robo de vida',en:'+2% lifesteal'},      max:5, base:130, mult:1.7  },
    { id:'ojo', icon:'👁️', name:{es:'Ojo Nocturno',en:'Night Eye'},   desc:{es:'+1 de visión',en:'+1 vision'},              max:3, base:120, mult:1.9  },
    { id:'vel', icon:'💨', name:{es:'Reflejos',en:'Reflexes'},        desc:{es:'-1 turno de impulso',en:'-1 dash cooldown'},max:3, base:150, mult:1.9  },
    { id:'ira', icon:'🔆', name:{es:'Ira Contenida',en:'Pent Fury'},  desc:{es:'+12% carga del definitivo',en:'+12% ultimate charge'}, max:5, base:140, mult:1.7 },
    { id:'ava', icon:'💰', name:{es:'Avaricia',en:'Greed'},           desc:{es:'+15% oro',en:'+15% gold'},                  max:5, base:95,  mult:1.6  },
    { id:'eco', icon:'🔗', name:{es:'Eco Ancestral',en:'Ancestral Echo'}, desc:{es:'Empiezas con 1 reliquia más',en:'Start with 1 extra relic'}, max:3, base:320, mult:2.2 },
    { id:'des', icon:'🌫️', name:{es:'Escurridizo',en:'Slippery'},     desc:{es:'+3% esquiva',en:'+3% dodge'},               max:4, base:160, mult:1.8  }
  ];

  /* Segunda rama: se abre al completar el árbol. Sigue el crecimiento
     sin inflar las mismas 12 barras hasta el infinito. */
  var ROOTS = [
    { id:'vit2', icon:'💗', name:{es:'Vitalidad Eterna',en:'Eternal Vitality'}, desc:{es:'+4 vida máxima',en:'+4 max health'},                    max:12, base:280, mult:1.42 },
    { id:'fue2', icon:'🗡️', name:{es:'Filo Eterno',en:'Eternal Edge'},         desc:{es:'+1 ataque',en:'+1 attack'},                            max:10, base:360, mult:1.48 },
    { id:'pie2', icon:'🏔️', name:{es:'Granito',en:'Granite'},                  desc:{es:'+1 defensa',en:'+1 defence'},                          max:8,  base:400, mult:1.52 },
    { id:'bol',  icon:'🪙', name:{es:'Bolsa de Viaje',en:'Travel Purse'},      desc:{es:'Empiezas con +25 oro',en:'Start with +25 gold'},        max:8,  base:180, mult:1.48 },
    { id:'sue',  icon:'🍀', name:{es:'Fortuna',en:'Fortune'},                  desc:{es:'+1 suerte (mejores reliquias)',en:'+1 luck (better relics)'}, max:8, base:260, mult:1.52 },
    { id:'sab',  icon:'📖', name:{es:'Maestría',en:'Mastery'},                 desc:{es:'+8% experiencia',en:'+8% experience'},                  max:6,  base:220, mult:1.55 },
    { id:'elix', icon:'🧴', name:{es:'Elixir',en:'Elixir'},                    desc:{es:'+15% curación de pociones',en:'+15% potion healing'},   max:5,  base:240, mult:1.58 },
    { id:'cap',  icon:'🐚', name:{es:'Caparazón',en:'Carapace'},               desc:{es:'+6 escudo al empezar',en:'+6 starting shield'},         max:8,  base:250, mult:1.5  },
    { id:'pul',  icon:'💓', name:{es:'Pulso Vital',en:'Vital Pulse'},          desc:{es:'+1 vida por turno',en:'+1 health per turn'},            max:5,  base:380, mult:1.62 },
    { id:'imp',  icon:'🪽', name:{es:'Segundo Aliento',en:'Second Wind'},      desc:{es:'+1 carga de impulso',en:'+1 dash charge'},              max:2,  base:560, mult:2.05 },
    { id:'car',  icon:'🃏', name:{es:'Abanico',en:'Fan of Cards'},             desc:{es:'+1 carta al elegir reliquia',en:'+1 relic card on pick'}, max:2, base:480, mult:2.1  },
    { id:'tru',  icon:'🔄', name:{es:'Trueque',en:'Haggle'},                   desc:{es:'Rebarajar cuesta 15% menos',en:'Rerolls cost 15% less'}, max:4, base:200, mult:1.55 },
    { id:'cos',  icon:'🌾', name:{es:'Cosecha',en:'Harvest'},                  desc:{es:'+8% esencia al terminar',en:'+8% essence at the end'},  max:10, base:160, mult:1.42 },
    { id:'sem',  icon:'🌟', name:{es:'Semilla Interior',en:'Inner Seed'},      desc:{es:'Empiezas 1 nivel más alto',en:'Start 1 level higher'},  max:4,  base:420, mult:1.72 }
  ];

  function upCost(u, lvl){ return Math.floor(u.base * Math.pow(u.mult, lvl)); }
  function coreProgress(lvlFn){
    var have = 0, need = 0;
    for (var i = 0; i < UPGRADES.length; i++){
      need += UPGRADES[i].max;
      have += Math.min(UPGRADES[i].max, (lvlFn && lvlFn(UPGRADES[i].id)) || 0);
    }
    return { have:have, need:need, done: need > 0 && have >= need };
  }

  /* ─────────── Pactos: dificultad opcional a cambio de recompensa ─────────── */
  var PACTS = [
    { id:'sed',      icon:'🚱', name:{es:'Pacto de Sed',en:'Pact of Thirst'},     desc:{es:'Sin pociones en toda la partida.',en:'No potions for the whole run.'}, bonus:0.25, unlock:{best:5} },
    { id:'vidrio',   icon:'🫙', name:{es:'Pacto de Vidrio',en:'Pact of Glass'},   desc:{es:'La mitad de vida máxima.',en:'Half max health.'},                      bonus:0.40, unlock:{best:8} },
    { id:'ciego',    icon:'🕯️', name:{es:'Pacto Ciego',en:'Blind Pact'},          desc:{es:'-3 de visión.',en:'-3 vision.'},                                       bonus:0.22, unlock:{best:8} },
    { id:'elite',    icon:'👑', name:{es:'Pacto de Élite',en:'Pact of Elites'},   desc:{es:'Todos los enemigos son élite.',en:'Every enemy is elite.'},            bonus:0.55, unlock:{best:12} },
    { id:'pobreza',  icon:'🕳️', name:{es:'Pacto de Pobreza',en:'Pact of Poverty'},desc:{es:'No recibes oro.',en:'You gain no gold.'},                             bonus:0.20, unlock:{best:10} },
    { id:'ayuno',   icon:'🚫', name:{es:'Pacto de Ayuno',en:'Pact of Fasting'},  desc:{es:'Sólo reliquias en pisos pares.',en:'Relics only on even floors.'},     bonus:0.35, unlock:{best:14} },
    { id:'condena',  icon:'☠️', name:{es:'Pacto de Condena',en:'Pact of Doom'},   desc:{es:'Empiezas con 2 reliquias malditas.',en:'Start with 2 cursed relics.'}, bonus:0.45, unlock:{best:16} },
    { id:'prisa',    icon:'⏳', name:{es:'Pacto de Prisa',en:'Pact of Haste'},     desc:{es:'60 turnos por piso o mueres.',en:'60 turns per floor or you die.'},    bonus:0.5,  unlock:{best:18} }
  ];

  /* ─────────── Logros ───────────
     `check(st)` recibe el resumen de la partida y el perfil.
     Están pensados para enseñar el juego: cada uno señala una mecánica. */
  var ACHIEVEMENTS = [
    { id:'first_blood', icon:'🩸', name:{es:'Primera Sangre',en:'First Blood'},     desc:{es:'Mata a tu primer enemigo.',en:'Kill your first enemy.'},        ess:20,  check:function(p){ return p.totalKills >= 1; } },
    { id:'floor5',      icon:'🪜', name:{es:'Más Abajo',en:'Deeper'},               desc:{es:'Llega al piso 5.',en:'Reach floor 5.'},                          ess:40,  check:function(p){ return p.best >= 5; } },
    { id:'boss1',       icon:'🐀', name:{es:'Regicida',en:'Regicide'},              desc:{es:'Mata al Rey Rata.',en:'Kill the Rat King.'},                     ess:80,  check:function(p){ return p.bossKills.boss_rat > 0; } },
    { id:'boss2',       icon:'💀', name:{es:'Rompehuesos',en:'Bonebreaker'},        desc:{es:'Mata al Señor de los Huesos.',en:'Kill the Bone Lord.'},         ess:140, check:function(p){ return p.bossKills.boss_bones > 0; } },
    { id:'boss3',       icon:'🪵', name:{es:'Cazatroles',en:'Troll Slayer'},        desc:{es:'Mata al Trol de Guerra.',en:'Kill the War Troll.'},              ess:220, check:function(p){ return p.bossKills.boss_troll > 0; } },
    { id:'boss4',       icon:'🌌', name:{es:'Indigesto',en:'Indigestible'},         desc:{es:'Mata al Devorador de Almas.',en:'Kill the Soul Devourer.'},      ess:340, check:function(p){ return p.bossKills.boss_devourer > 0; } },
    { id:'win',         icon:'🌱', name:{es:'Fin del Ciclo',en:'End of the Cycle'}, desc:{es:'Destruye La Semilla.',en:'Destroy The Seed.'},                   ess:800, check:function(p){ return p.wins >= 1; } },
    { id:'floor30',     icon:'♾️', name:{es:'Sin Fondo',en:'Bottomless'},           desc:{es:'Llega al piso 30.',en:'Reach floor 30.'},                        ess:500, check:function(p){ return p.best >= 30; } },
    { id:'relics10',    icon:'🔮', name:{es:'Coleccionista',en:'Collector'},        desc:{es:'Ten 10 reliquias en una partida.',en:'Hold 10 relics in one run.'}, ess:90, check:function(p){ return p.maxRelics >= 10; } },
    { id:'relics20',    icon:'🏺', name:{es:'Museo Andante',en:'Walking Museum'},   desc:{es:'Ten 20 reliquias en una partida.',en:'Hold 20 relics in one run.'}, ess:260, check:function(p){ return p.maxRelics >= 20; } },
    { id:'seen30',      icon:'📚', name:{es:'Erudito',en:'Scholar'},                desc:{es:'Descubre 30 reliquias distintas.',en:'Discover 30 different relics.'}, ess:200, check:function(p){ return Object.keys(p.seenRelics||{}).length >= 30; } },
    { id:'seenAll',     icon:'🎓', name:{es:'Códice Completo',en:'Full Codex'},     desc:{es:'Descubre todas las reliquias.',en:'Discover every relic.'},       ess:900, check:function(p){ return Object.keys(p.seenRelics||{}).length >= (window.RELICS ? RELICS.length : 999); } },
    { id:'kills500',    icon:'⚰️', name:{es:'Exterminador',en:'Exterminator'},      desc:{es:'500 bajas en total.',en:'500 total kills.'},                     ess:150, check:function(p){ return p.totalKills >= 500; } },
    { id:'kills2000',   icon:'🔨', name:{es:'Plaga',en:'Plague'},                   desc:{es:'2000 bajas en total.',en:'2000 total kills.'},                   ess:420, check:function(p){ return p.totalKills >= 2000; } },
    { id:'noPotion',    icon:'🚱', name:{es:'Sobrio',en:'Sober'},                   desc:{es:'Llega al piso 8 sin beber pociones.',en:'Reach floor 8 without drinking.'}, ess:130, check:function(p){ return p.flags.noPotionFloor8; } },
    { id:'pacifist',    icon:'🕊️', name:{es:'Fantasma',en:'Ghost'},                 desc:{es:'Pasa un piso sin matar a nadie.',en:'Clear a floor killing nobody.'}, ess:80, check:function(p){ return p.flags.pacifistFloor; } },
    { id:'rich',        icon:'💎', name:{es:'Rico',en:'Rich'},                      desc:{es:'Acumula 500 oro en una partida.',en:'Hold 500 gold in one run.'}, ess:110, check:function(p){ return p.maxGold >= 500; } },
    { id:'extract',     icon:'🏃', name:{es:'Sabio Cobarde',en:'Wise Coward'},      desc:{es:'Huye del santuario con el botín.',en:'Escape a sanctuary with loot.'}, ess:60, check:function(p){ return p.extracts >= 1; } },
    { id:'streak3',     icon:'🔥', name:{es:'Constancia',en:'Consistency'},         desc:{es:'Racha de 3 días en el diario.',en:'3-day daily streak.'},        ess:120, check:function(p){ return p.bestStreak >= 3; } },
    { id:'streak7',     icon:'🌋', name:{es:'Obsesión',en:'Obsession'},             desc:{es:'Racha de 7 días en el diario.',en:'7-day daily streak.'},        ess:300, check:function(p){ return p.bestStreak >= 7; } },
    { id:'allClasses',  icon:'🎭', name:{es:'Seis Vidas',en:'Six Lives'},           desc:{es:'Desbloquea todas las estirpes.',en:'Unlock every bloodline.'},    ess:250, check:function(p){ return Object.keys(p.classes||{}).length >= CFG.CLASSES.length; } },
    { id:'combo8',      icon:'⚔️', name:{es:'Carnicería',en:'Carnage'},             desc:{es:'Haz una racha de 8 bajas.',en:'Get an 8-kill streak.'},          ess:140, check:function(p){ return p.maxCombo >= 8; } },
    { id:'combo18',     icon:'🌪️', name:{es:'Apocalipsis',en:'Apocalypse'},         desc:{es:'Haz una racha de 18 bajas.',en:'Get an 18-kill streak.'},        ess:420, check:function(p){ return p.maxCombo >= 18; } },
    { id:'weekly',      icon:'📅', name:{es:'Maldición Semanal',en:'Weekly Curse'}, desc:{es:'Juega una maldición semanal.',en:'Play a weekly curse.'},         ess:80,  check:function(p){ return p.weeklyRuns >= 1; } },
    { id:'challenge',   icon:'🥊', name:{es:'Duelo',en:'Duel'},                     desc:{es:'Gana un reto de un amigo.',en:'Beat a friend’s challenge.'},     ess:160, check:function(p){ return p.challengeWins >= 1; } },
    { id:'hardWin',     icon:'👑', name:{es:'Pesadilla Vencida',en:'Nightmare Tamed'}, desc:{es:'Llega al piso 15 en Pesadilla.',en:'Reach floor 15 on Nightmare.'}, ess:400, check:function(p){ return (p.bestByDiff||{}).pesadilla >= 15; } },
    { id:'abyss',       icon:'🕳️', name:{es:'Mirada al Abismo',en:'Abyss Gazer'},   desc:{es:'Llega al piso 10 en Abismo.',en:'Reach floor 10 on Abyss.'},      ess:450, check:function(p){ return (p.bestByDiff||{}).abismo >= 10; } },
    { id:'pact3',       icon:'📜', name:{es:'Tres Cadenas',en:'Three Chains'},      desc:{es:'Gana con 3 pactos activos.',en:'Finish a run with 3 pacts.'},     ess:380, check:function(p){ return p.maxPacts >= 3; } },
    { id:'oneHp',       icon:'🫀', name:{es:'Al Filo',en:'On the Edge'},            desc:{es:'Mata a un jefe con 1 de vida.',en:'Kill a boss at 1 health.'},    ess:200, check:function(p){ return p.flags.bossAt1Hp; } },
    { id:'score10k',    icon:'📈', name:{es:'Cinco Cifras',en:'Five Figures'},      desc:{es:'Haz 10 000 puntos.',en:'Score 10,000 points.'},                  ess:180, check:function(p){ return p.bestScore >= 10000; } },
    { id:'raiz',        icon:'🌳', name:{es:'Raíz Profunda',en:'Deep Root'},        desc:{es:'Completa el árbol de esencia.',en:'Complete the essence tree.'},  ess:400, check:function(p){ return CFG.coreProgress(function(id){ return (p.up && p.up[id]) || 0; }).done; } }
  ];

  /* ─────────── Economía y curvas ─────────── */
  var BAL = {
    /* Progresión del jugador */
    xpNext: function(lvl){ return Math.floor(16 * Math.pow(lvl, 1.42)); },
    lvlHp:5, lvlAtk:1.6, lvlDef:0.7,

    /* Escalado de enemigos por piso. Suave al principio para que el
       piso 1 nunca mate, agresivo después del 10. */
    eHp:  function(f){ return 1 + (f - 1) * 0.30 + Math.max(0, f - 10) * 0.10; },
    eAtk: function(f){ return 1 + (f - 1) * 0.17 + Math.max(0, f - 12) * 0.06; },
    eDef: function(f){ return 1 + (f - 1) * 0.14; },
    eXp:  function(f){ return 1 + (f - 1) * 0.16; },
    eCount: function(f){ return Math.round(Math.min(5 + f, 22)); },

    /* Suelo de daño: por muy blindado que esté un objetivo, un golpe
       hace al menos esta fracción. Evita muros imposibles sin quitarle
       sentido a la armadura. */
    minDmgPlayer:0.25,
    minDmgEnemy:0.15,
    eliteFromFloor:3,
    hazardFromFloor:3,

    /* Recompensas */
    potionHeal:0.42,            // fracción de vida máxima
    descendHeal:0.10,
    goldPerFloor: function(f){ return 8 + f * 4; },
    essence: function(r){
      return Math.round((r.floor * 18 + r.level * 12 + r.kills * 1.5 + r.gold * 0.25) *
                        (1 + r.relicCount * 0.012));
    },
    score: function(r){
      return Math.round((r.floor * 260 + r.kills * 14 + r.gold * 1.2 + r.level * 90 +
                         r.bossKills * 700 + (r.won ? 5000 : 0)) *
                        (1 + r.relicCount * 0.02));
    },
    /* Multiplicador por huir del santuario: más profundo, mejor pago,
       pero seguir bajando siempre paga más si sobrevives. */
    extractMul: function(f){ return 1 + Math.min(1.2, f * 0.05); },

    ultGainOnDamage:0.9,        // por punto de daño infligido, en %
    ultGainOnHurt:1.4,
    critMultBase:1.9,
    dashRange:3,
    shieldDecay:0,
    maxRelicOffers:3,
    comboWindow:4,              // turnos para encadenar una baja
    comboGold:1,                // oro extra por golpe de racha (desde x3)
    rerollBaseCost:25,
    turnLimitPacto:60
  };

  /* ─────────── Objetos del suelo ─────────── */
  var LOOT = [
    { kind:'potion', w:26 }, { kind:'gold', w:30 }, { kind:'heart', w:8 },
    { kind:'chest', w:9 },   { kind:'scroll', w:10 }, { kind:'bomb', w:7 },
    { kind:'gem', w:6 },     { kind:'altar', w:4 }
  ];

  return {
    MW:MW, MH:MH, T:T_, SOLID:SOLID, OPAQUE:OPAQUE,
    BIOMES:BIOMES, biomeFor:biomeFor, FINAL_FLOOR:FINAL_FLOOR,
    BOSS_EVERY:BOSS_EVERY, isBossFloor:isBossFloor,
    TIER_FLOOR:TIER_FLOOR, pickEnemyKind:pickEnemyKind,
    ENEMIES:ENEMIES, BOSSES:BOSSES, BOSS_ORDER:BOSS_ORDER,
    STATUS:STATUS, BUFFS:BUFFS,
    CLASSES:CLASSES, classById:classById, ULTS:ULTS,
    DIFFS:DIFFS, diffById:diffById,
    UPGRADES:UPGRADES, ROOTS:ROOTS, upCost:upCost, coreProgress:coreProgress,
    PACTS:PACTS, ACHIEVEMENTS:ACHIEVEMENTS,
    BAL:BAL, LOOT:LOOT
  };
})();
