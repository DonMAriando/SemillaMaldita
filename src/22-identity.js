/* ════════════════════════════════════════════════════════════════════
   22-identity.js — lo que la gente comparte.

   Un juego popular no se recuerda por sus números. Se recuerda por
   un nombre de build, un apodo, un reto a un amigo y un "otra vez"
   a las 23:40. Aquí vive esa capa: arquetipos, títulos, la maldición
   semanal, susurros de La Semilla y el texto de un duelo.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var Identity = (function(){

  /* ─────────── Arquetipos ───────────
     Si juntas tres reliquias del mismo racimo, tu partida deja de ser
     "una build rara" y pasa a tener nombre. Ese nombre es lo que se
     pega en el chat. */
  var ARCHETYPES = [
    { tag:'fuego',       min:3, icon:'🔥', name:{ es:'PIROMANTE',      en:'PYROMANCER' } },
    { tag:'hielo',       min:3, icon:'❄️', name:{ es:'GLACIAR',        en:'GLACIER' } },
    { tag:'rayo',        min:3, icon:'⚡', name:{ es:'TORMENTA',       en:'STORMCALLER' } },
    { tag:'veneno',      min:3, icon:'🧪', name:{ es:'PLAGA',          en:'PLAGUE' } },
    { tag:'sangre',      min:3, icon:'🩸', name:{ es:'CARNICERO',      en:'BUTCHER' } },
    { tag:'critico',     min:3, icon:'🎯', name:{ es:'VERDUGO',        en:'HEADSMAN' } },
    { tag:'escudo',      min:3, icon:'🛡️', name:{ es:'BALUARTE',       en:'BULWARK' } },
    { tag:'invocacion',  min:2, icon:'👻', name:{ es:'NECROMANTE',     en:'NECROMANCER' } },
    { tag:'oro',         min:3, icon:'💰', name:{ es:'AVARO',          en:'MISER' } },
    { tag:'sigilo',      min:2, icon:'🌑', name:{ es:'SOMBRA',         en:'SHADE' } },
    { tag:'riesgo',      min:2, icon:'💀', name:{ es:'SUICIDA',        en:'DEATHWISH' } },
    { tag:'arcana',      min:2, icon:'🔮', name:{ es:'ARCANO',         en:'ARCANIST' } },
    { tag:'movimiento',  min:2, icon:'💨', name:{ es:'DANZARÍN',       en:'DANCER' } },
    { tag:'tempo',       min:2, icon:'⏳', name:{ es:'CRONÓMETRO',     en:'CLOCKWORK' } }
  ];

  function tagCounts(relics){
    var c = {};
    (relics || []).forEach(function(r){
      var def = r.def || r;
      var tags = def.tags || [];
      var stacks = r.stacks || 1;
      for (var i = 0; i < tags.length; i++){
        c[tags[i]] = (c[tags[i]] || 0) + stacks;
      }
    });
    return c;
  }

  function cursedCount(relics){
    var n = 0;
    (relics || []).forEach(function(r){
      var def = r.def || r;
      if (def.rarity === 'maldita') n += (r.stacks || 1);
    });
    return n;
  }

  /** El arquetipo dominante, o un híbrido si hay dos a la vez. */
  function archetype(relics){
    var counts = tagCounts(relics);
    var hits = [];
    for (var i = 0; i < ARCHETYPES.length; i++){
      var a = ARCHETYPES[i];
      if ((counts[a.tag] || 0) >= a.min) hits.push({ a:a, n:counts[a.tag] });
    }
    hits.sort(function(x, y){ return y.n - x.n; });
    if (cursedCount(relics) >= 2){
      return { icon:'☠️', name:{ es:'MALDITO', en:'CURSED' }, tag:'maldita', dual:false };
    }
    if (!hits.length){
      return { icon:'🌱', name:{ es:'ERRANTE', en:'WANDERER' }, tag:null, dual:false };
    }
    if (hits.length >= 2 && hits[1].n >= hits[0].a.min){
      return {
        icon: hits[0].a.icon + hits[1].a.icon,
        name:{
          es: hits[0].a.name.es + '-' + hits[1].a.name.es,
          en: hits[0].a.name.en + '-' + hits[1].a.name.en
        },
        tag: hits[0].a.tag,
        dual:true,
        a: hits[0].a, b: hits[1].a
      };
    }
    return { icon:hits[0].a.icon, name:hits[0].a.name, tag:hits[0].a.tag, dual:false, a:hits[0].a };
  }

  function archLabel(arch){
    if (!arch) return '';
    return (arch.icon ? arch.icon + ' ' : '') + TP(arch.name);
  }

  /* ─────────── Títulos ───────────
     El apodo que aparece bajo el puntaje. Cuenta una historia en
     cinco palabras: cómo jugaste, no cuánto. */
  function titleFor(r){
    if (!r) return { es:'Sin nombre', en:'Unnamed' };
    if (r.won) return { es:'Quien cerró el ciclo', en:'Cycle Breaker' };
    if (r.maxCombo >= 12) return { es:'Apocalipsis andante', en:'Walking Apocalypse' };
    if (r.maxCombo >= 8)  return { es:'La masacre', en:'The Massacre' };
    if (r.flags && r.flags.bossAt1Hp) return { es:'Al filo', en:'On the Edge' };
    if (r.pactCount >= 3) return { es:'Tres cadenas', en:'Triple Bound' };
    if ((r.maxGold || r.gold) >= 500) return { es:'Rico de cripta', en:'Crypt Rich' };
    if (r.extracted) return { es:'Cobarde sabio', en:'Wise Coward' };
    if (r.flags && r.flags.pacifistFloor) return { es:'Fantasma', en:'Ghost' };
    if (r.relicCount >= 16) return { es:'Museo andante', en:'Walking Museum' };
    if (r.kills >= 80) return { es:'Exterminador', en:'Exterminator' };
    if (r.floor >= 20) return { es:'Casi dios', en:'Almost a God' };
    if (r.floor >= 15) return { es:'Hijo del vacío', en:'Void-born' };
    if (r.floor >= 10) return { es:'Superviviente', en:'Survivor' };
    if (r.floor <= 2 && r.died) return { es:'Recién despertado', en:'Just Awake' };
    if (r.died) return { es:'Otra ofrenda', en:'Another Offering' };
    return { es:'Errante', en:'Wanderer' };
  }

  /* ─────────── Combos ─────────── */
  var COMBO_RANKS = [
    { at:3,  es:'RACHA',       en:'STREAK',     color:'#ffd166' },
    { at:5,  es:'CARNICERÍA',  en:'CARNAGE',    color:'#ff8f3f' },
    { at:8,  es:'MASACRE',     en:'MASSACRE',   color:'#ff5d6c' },
    { at:12, es:'APOCALIPSIS', en:'APOCALYPSE', color:'#c77dff' },
    { at:18, es:'SEMILLA',     en:'SEEDBORN',   color:'#7cffb2' }
  ];
  function comboRank(n){
    var best = null;
    for (var i = 0; i < COMBO_RANKS.length; i++)
      if (n >= COMBO_RANKS[i].at) best = COMBO_RANKS[i];
    return best;
  }

  /* ─────────── Maldición semanal ───────────
     Un modificador distinto cada lunes, igual para todo el mundo,
     derivado de la semana. Es el "evento de temporada" sin servidor. */
  var WEEKLY = [
    { id:'lluvia',  icon:'💰', name:{es:'Lluvia de Oro',en:'Gold Rain'},
      desc:{es:'El doble de oro. Gasta o muere rico.',en:'Double gold. Spend it or die rich.'},
      goldMul:2 },
    { id:'enjambre',icon:'🐀', name:{es:'Enjambre',en:'Swarm'},
      desc:{es:'Muchos más enemigos, un poco más frágiles.',en:'Many more enemies, a little frailer.'},
      enemyMul:1.5, hpMul:0.82 },
    { id:'cartas',  icon:'🃏', name:{es:'Mano Cargada',en:'Stacked Hand'},
      desc:{es:'Una carta extra en cada elección.',en:'One extra card in every choice.'},
      extraCards:1 },
    { id:'niebla',  icon:'🌫️', name:{es:'Niebla Viva',en:'Living Fog'},
      desc:{es:'Ves 2 casillas menos. Confía en el oído.',en:'See 2 tiles less. Trust your ears.'},
      vision:-2 },
    { id:'elite',   icon:'👑', name:{es:'Corte de Élite',en:'Elite Court'},
      desc:{es:'Los élites aparecen el triple.',en:'Elites spawn three times as often.'},
      eliteMul:3 },
    { id:'prisa',   icon:'💨', name:{es:'Sangre Caliente',en:'Hot Blood'},
      desc:{es:'Los enemigos actúan un 30% más rápido.',en:'Enemies act 30% faster.'},
      speedMul:1.3 },
    { id:'infierno',icon:'🔥', name:{es:'Aliento Ígneo',en:'Fire Breath'},
      desc:{es:'Todo enemigo quema al pegar.',en:'Every enemy burns on hit.'},
      burnHit:true },
    { id:'ofrenda', icon:'☠️', name:{es:'Ofrenda Forzada',en:'Forced Offering'},
      desc:{es:'Empiezas con una reliquia maldita.',en:'You start with a cursed relic.'},
      cursedStart:1 }
  ];

  function weekKey(d){
    d = d || new Date();
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }
  function weekNumber(d){
    var key = weekKey(d);
    var parts = key.split('-W');
    return (parseInt(parts[0], 10) - 2026) * 52 + parseInt(parts[1], 10);
  }
  function weeklyOf(d){
    var key = weekKey(d);
    var i = Util.hash(key) % WEEKLY.length;
    var w = WEEKLY[i];
    return {
      key:key, n:weekNumber(d), id:w.id, icon:w.icon,
      name:w.name, desc:w.desc,
      goldMul:w.goldMul || 1, enemyMul:w.enemyMul || 1, hpMul:w.hpMul || 1,
      extraCards:w.extraCards || 0, vision:w.vision || 0,
      eliteMul:w.eliteMul || 1, speedMul:w.speedMul || 1,
      burnHit:!!w.burnHit, cursedStart:w.cursedStart || 0
    };
  }
  function weeklySeed(d){
    return 'SEMANA-' + weekKey(d);
  }

  /* ─────────── Susurros ───────────
     Una línea al bajar de piso. No explica reglas: da personalidad. */
  var WHISPERS = {
    criptas:[
      { es:'Algo te observa entre las lápidas.', en:'Something watches from the graves.' },
      { es:'La piedra recuerda cada nombre.', en:'The stone remembers every name.' },
      { es:'No eres el primero que despierta aquí.', en:'You are not the first to wake here.' }
    ],
    cavernas:[
      { es:'El eco no es tuyo.', en:'The echo is not yours.' },
      { es:'Gotea. Siempre gotea.', en:'It drips. It always drips.' },
      { es:'Hay telarañas más viejas que tú.', en:'There are webs older than you.' }
    ],
    fundicion:[
      { es:'El calor te quiere.', en:'The heat wants you.' },
      { es:'El metal canta cuando sangras.', en:'Metal sings when you bleed.' },
      { es:'Aquí se forjó lo que te persigue.', en:'What hunts you was forged here.' }
    ],
    vacio:[
      { es:'No mires abajo demasiado.', en:'Do not look down too long.' },
      { es:'Las estrellas de aquí están mal.', en:'The stars down here are wrong.' },
      { es:'Alguien dice tu nombre. Nadie está.', en:'Someone says your name. No one is here.' }
    ],
    jardin:[
      { es:'La Semilla ya te conoce.', en:'The Seed already knows you.' },
      { es:'Cada flor es un fracaso anterior.', en:'Every flower is a previous failure.' },
      { es:'Huele a tierra y a final.', en:'It smells like soil and like an ending.' }
    ],
    eterno:[
      { es:'No hay suelo. Sólo más abajo.', en:'There is no bottom. Only further down.' },
      { es:'Has visto esto. Lo vas a volver a ver.', en:'You have seen this. You will see it again.' },
      { es:'La Semilla ríe con tu cara.', en:'The Seed laughs with your face.' }
    ]
  };
  var BOSS_WHISPER = [
    { es:'Respira hondo. Esto no es un pasillo.', en:'Breathe. This is not a hallway.' },
    { es:'Lo que viene tiene nombre. Tú, todavía no.', en:'What comes has a name. You, not yet.' },
    { es:'Si caes ahora, al menos cae mirándolo.', en:'If you fall now, at least look at it.' }
  ];

  function whisper(biomeId, isBoss, rng){
    if (isBoss) return rng.pick(BOSS_WHISPER);
    var pool = WHISPERS[biomeId] || WHISPERS.criptas;
    return rng.pick(pool);
  }

  var DEATH_LINES = [
    { es:'La Semilla gana otra vez. Siempre gana.', en:'The Seed wins again. It always does.' },
    { es:'Otra raíz. Otro cuerpo. Siguiente.', en:'Another root. Another body. Next.' },
    { es:'Descansa. El descenso no se acaba.', en:'Rest. The descent does not end.' },
    { es:'Te va a faltar una reliquia. Siempre falta una.', en:'You will miss one relic. You always do.' },
    { es:'Bien. Ahora sabes cómo no morir.', en:'Good. Now you know how not to die.' }
  ];
  function deathLine(rng){
    rng = rng || { pick:function(a){ return a[Math.floor(Math.random() * a.length)]; } };
    return rng.pick(DEATH_LINES);
  }

  /* ─────────── Duelo (reto a un amigo) ─────────── */
  function challengePayload(r){
    if (!r) return null;
    return {
      s: r.seed, cls: r.classId, df: r.diff,
      sc: r.score, fl: r.floor, arch: r.archTag || '',
      n: r.dayNumber || 0, w: r.won ? 1 : 0
    };
  }
  function challengeQuery(r){
    var p = challengePayload(r);
    if (!p) return '';
    return 'vs=1&s=' + encodeURIComponent(p.s) +
           '&cls=' + encodeURIComponent(p.cls) +
           '&df=' + encodeURIComponent(p.df) +
           '&sc=' + p.sc + '&fl=' + p.fl;
  }
  function parseChallenge(params){
    if (!params) return null;
    var vs = params.get('vs');
    if (!vs) return null;
    var s = params.get('s') || params.get('seed');
    if (!s) return null;
    return {
      seed: s,
      classId: params.get('cls') || 'vagabundo',
      diff: params.get('df') || 'maldito',
      score: parseInt(params.get('sc'), 10) || 0,
      floor: parseInt(params.get('fl'), 10) || 1
    };
  }

  return {
    ARCHETYPES:ARCHETYPES, WEEKLY:WEEKLY,
    archetype:archetype, archLabel:archLabel, titleFor:titleFor,
    comboRank:comboRank, tagCounts:tagCounts,
    weekKey:weekKey, weekNumber:weekNumber, weeklyOf:weeklyOf, weeklySeed:weeklySeed,
    whisper:whisper, deathLine:deathLine,
    challengeQuery:challengeQuery, parseChallenge:parseChallenge
  };
})();
