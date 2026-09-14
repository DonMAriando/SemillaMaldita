/* ════════════════════════════════════════════════════════════════════
   40-engine.js — reglas del juego.

   Contiene el estado de la partida, la tubería de daño, los estados
   alterados, el reloj de turnos por energía y el despachador de hooks
   de reliquias. La IA vive en 45-ai.js y sólo llama aquí.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var Engine = (function(){

  var MW = CFG.MW, MH = CFG.MH, TL = CFG.T;
  var idx = Dungeon.idx;

  /* run = null cuando no hay partida en curso */
  var run = null;
  var uid = 1;

  /* ════════════════════════════════════════════════════════════════
     ESTADO
     ════════════════════════════════════════════════════════════════ */
  function newRun(cfg){
    var cls = CFG.classById(cfg.classId);
    var diff = CFG.diffById(cfg.diff);
    var pacts = cfg.pacts || [];
    var pactIds = {};
    pacts.forEach(function(p){ pactIds[p.id] = 1; });

    run = {
      seed: cfg.seed,
      isDaily: !!cfg.isDaily,
      isWeekly: !!cfg.isWeekly,
      scored: cfg.scored !== false,
      classId: cls.id, cls: cls,
      diff: diff.id, diffDef: diff,
      pacts: pacts, pactIds: pactIds,
      pactBonus: pacts.reduce(function(a,p){ return a + p.bonus; }, 0),
      weekly: cfg.weekly || null,
      challenge: cfg.challenge || null,

      floor: 0, time: 0, turn: 0, startedAt: Date.now(), elapsed: 0,
      kills: 0, goldEarned: 0, maxGold: 0,
      combo: 0, comboAt: -99, maxCombo: 0, lastArchTag: null,
      bossesKilled: {}, relicIds: [], flags: {},
      over: false, won: false, extracted: false, killedBy: null,
      revivesLeft: Meta.opt('relaxed') ? 1 : 0,
      floorKills: 0, potionsDrunk: 0, lowHpFired: false,

      rng: new RNG(cfg.seed + '|combate'),
      relicRng: new RNG(cfg.seed + '|reliquias'),

      tiles: null, rooms: [], visible: null, seen: null, light: null,
      actors: [], items: [], torches: [], biome: CFG.BIOMES[0],
      stairs: { x:0, y:0 }, isBossFloor: false, bossRef: null,
      distField: null, distDirty: true,
      player: null, log: []
    };

    run.player = makePlayer(cls, diff, pactIds);
    run.maxGold = run.player.gold;
    return run;
  }

  function makePlayer(cls, diff, pactIds){
    var up = Meta.upLvl;
    var p = {
      x:0, y:0, px:0, py:0, facing:1, animT:0,
      classId: cls.id, cls: cls,
      level:1, xp:0, xpNext: CFG.BAL.xpNext(1),
      gold:0, shield:0,
      relics:[], buffs:{}, status:{},
      dashCd:0, dashCharges:cls.dashCharges || 1, dashMax:cls.dashCharges || 1,
      abilityCd:0, ultCharge:0, ultUsed:0,
      attackAnim:0, dashing:0, hurtT:0,
      pendingExtraTurn:false,
      /* Base = clase + árbol de esencia. Las reliquias se suman encima
         en recalc(), nunca aquí, para poder recalcular sin acumular. */
      base:{
        maxHp: cls.hp + up('vit') * 8 + up('vit2') * 4,
        atk:   cls.atk + up('fue') + up('fue2'),
        def:   cls.def + up('pie') + up('pie2'),
        crit:  cls.crit + up('cri') * 0.03,
        critMult: CFG.BAL.critMultBase,
        dodge: (cls.dodge || 0) + up('des') * 0.03,
        lifesteal: up('san') * 0.02,
        speed: 1,
        luck: up('sue'),
        vision: cls.vision + up('ojo'),
        potionPower: 1 + up('elix') * 0.15,
        xpMult: 1 + up('sab') * 0.08,
        goldMul: (cls.goldMul || 1) * (1 + up('ava') * 0.15),
        shieldMax: (cls.shieldMax || 0) + up('cap') * 6,
        shieldRegen: cls.shieldRegen || 0,
        thorns: cls.thorns || 0,
        regen: up('pul')
      }
    };
    if (pactIds.vidrio) p.base.maxHp = Math.max(8, Math.round(p.base.maxHp * 0.5));
    if (pactIds.ciego)  p.base.vision = Math.max(3, p.base.vision - 3);

    p.potions = Math.max(0, cls.potions + Meta.upLvl('alq') + diff.potions);
    if (pactIds.sed) p.potions = 0;
    if (diff.potions === -99) p.potions = 0;

    p.dashCharges = (cls.dashCharges || 1) + up('imp');
    p.dashMax = p.dashCharges;
    p.dashCdMax = Math.max(2, cls.dashCd - Meta.upLvl('vel'));
    if (!pactIds.pobreza) p.gold = up('bol') * 25;

    var extraLv = up('sem');
    if (extraLv){
      p.level += extraLv;
      p.xpNext = CFG.BAL.xpNext(p.level);
    }
    recalc(p);
    p.hp = p.s.maxHp;
    p.shield = p.s.shieldMax;
    applyWeeklyToPlayer(p);
    return p;
  }

  function applyWeeklyToPlayer(p){
    var w = run && run.weekly;
    if (!w) return;
    if (w.vision) p.base.vision = Math.max(3, p.base.vision + w.vision);
    if (w.goldMul && w.goldMul !== 1) p.base.goldMul *= w.goldMul;
    recalc(p);
    p.hp = p.s.maxHp;
    p.shield = p.s.shieldMax;
  }

  /* ════════════════════════════════════════════════════════════════
     STATS — se recalculan desde cero cada vez.
     Nunca mutar p.s fuera de aquí: así una reliquia que se quita no
     deja residuos.
     ════════════════════════════════════════════════════════════════ */
  function recalc(p){
    p = p || run.player;
    var b = p.base;
    var s = {
      maxHp:b.maxHp, atk:b.atk, def:b.def, crit:b.crit, critMult:b.critMult,
      dodge:b.dodge, lifesteal:b.lifesteal, speed:b.speed, luck:b.luck,
      vision:b.vision, potionPower:b.potionPower, xpMult:b.xpMult,
      goldMult:b.goldMul, shieldMax:b.shieldMax, thorns:b.thorns, regen:b.regen
    };
    /* nivel */
    var L = p.level - 1;
    s.maxHp += Math.round(L * CFG.BAL.lvlHp);
    s.atk   += Math.round(L * CFG.BAL.lvlAtk * 10) / 10;
    s.def   += Math.round(L * CFG.BAL.lvlDef * 10) / 10;

    /* reliquias */
    if (p.relics.length){
      var C_ = ctxFor();
      C_.s = s;
      for (var i = 0; i < p.relics.length; i++){
        var inst = p.relics[i];
        var fn = inst.def.hooks && inst.def.hooks.stats;
        if (typeof fn !== 'function') continue;
        C_.stacks = inst.stacks;
        C_.mem = inst.mem;
        try { fn(C_); } catch(e){ warnRelic(inst, e); }
      }
      s = C_.s;
    }

    /* pasiva de clase: el berserker crece al desangrarse */
    if (p.cls.passive === 'rabia' && p.hp != null){
      var miss = 1 - Util.clamp(p.hp / Math.max(1, s.maxHp), 0, 1);
      s.atk *= (1 + miss * 0.85);
      s.crit += miss * 0.15;
    }

    /* modificadores temporales (definitivos, altares, efectos puntuales) */
    if (p.tempMods){
      for (var tm = 0; tm < p.tempMods.length; tm++){
        var mod = p.tempMods[tm];
        if (s[mod.key] != null) s[mod.key] += mod.add;
      }
    }

    /* buffs temporales */
    for (var bn in p.buffs){
      var bd = CFG.BUFFS[bn]; if (!bd) continue;
      if (bd.atkMul)  s.atk *= bd.atkMul;
      if (bd.defAdd)  s.def += bd.defAdd;
      if (bd.speedMul)s.speed *= bd.speedMul;
      if (bd.thorns)  s.thorns += bd.thorns;
      if (bd.regen)   s.regen += bd.regen;
    }
    /* estados negativos sobre el jugador */
    for (var sn in p.status){
      var sd = CFG.STATUS[sn]; if (!sd) continue;
      if (sd.atkMul) s.atk *= sd.atkMul;
      if (sd.speedMul) s.speed *= sd.speedMul;
    }

    s.maxHp = Math.max(1, Math.round(s.maxHp));
    s.atk = Math.max(1, Math.round(s.atk * 10) / 10);
    s.def = Math.max(0, Math.round(s.def * 10) / 10);
    s.crit = Util.clamp(s.crit, 0, 0.85);
    s.dodge = Util.clamp(s.dodge, 0, 0.7);
    s.lifesteal = Util.clamp(s.lifesteal, 0, 1);
    s.speed = Util.clamp(s.speed, 0.25, 4);
    s.vision = Util.clamp(Math.round(s.vision), 3, 16);
    s.shieldMax = Math.max(0, Math.round(s.shieldMax));

    p.s = s;
    if (p.hp != null && p.hp > s.maxHp) p.hp = s.maxHp;
    return s;
  }

  function warnRelic(inst, e){
    if (window.DEBUG) console.warn('[reliquia]', inst.def && inst.def.id, e);
  }

  /* ════════════════════════════════════════════════════════════════
     CONTEXTO DE RELIQUIAS
     La superficie que ven las reliquias. Es deliberadamente estrecha:
     una reliquia no puede tocar el estado interno, sólo pedir efectos.
     ════════════════════════════════════════════════════════════════ */
  var C = null;
  function ctxFor(){
    if (C) return C;
    C = {
      stacks:1, mem:null, floor:1, turn:0, s:null,
      rng:null,
      has:function(id){
        var rl = run.player.relics;
        for (var i=0;i<rl.length;i++) if (rl[i].def.id === id) return true;
        return false;
      },
      damage:function(en, amount, type){ if (en && en.hp > 0) dealDamage(en, amount, type || 'fisico', { fromRelic:true }); },
      damageAll:function(list, amount, type){
        if (!list || !list.length) return;
        for (var i=0;i<list.length;i++) if (list[i] && list[i].hp > 0) dealDamage(list[i], amount, type || 'fisico', { fromRelic:true });
      },
      heal:function(n){ healPlayer(n, 'reliquia'); },
      hurtSelf:function(n){
        var p = run.player;
        p.hp -= Math.max(0, Math.round(n));
        FX.text(p.x, p.y, '-' + Math.round(n), '#ff4d5e', { isDamage:true });
        if (p.hp <= 0) killPlayer(null);
      },
      addShield:function(n){ addShield(n); },
      addStatus:function(en, st, turns, power){ applyStatus(en, st, turns, power); },
      addSelfBuff:function(bf, turns, power){ applyBuff(bf, turns, power); },
      addPotions:function(n){ run.player.potions = Math.max(0, run.player.potions + (n|0)); },
      addGold:function(n){ addGold(n); },
      addXp:function(n){ gainXp(n); },
      knockback:function(en, tiles){ knockback(en, tiles); },
      teleportSelf:function(){ teleportPlayer(); },
      summonAlly:function(kind, n){ summonAlly(kind, n); },
      enemiesInRadius:function(r){
        var p = run.player, out = [];
        for (var i=0;i<run.actors.length;i++){
          var a = run.actors[i];
          if (!a.hostile || a.hp <= 0 || a.hidden) continue;
          if (Util.cheb(a.x, a.y, p.x, p.y) <= r) out.push(a);
        }
        return out;
      },
      adjacentEnemies:function(){ return C.enemiesInRadius(1); },
      allEnemies:function(){
        var out = [];
        for (var i=0;i<run.actors.length;i++){
          var a = run.actors[i];
          if (a.hostile && a.hp > 0 && !a.hidden) out.push(a);
        }
        return out;
      },
      enemyAt:function(dx, dy){
        var p = run.player;
        return actorAt(p.x + dx, p.y + dy, true);
      },
      dist:function(en){ return en ? Util.cheb(en.x, en.y, run.player.x, run.player.y) : 99; },
      lowestHpEnemy:function(){
        var list = C.allEnemies(), best = null;
        for (var i=0;i<list.length;i++) if (!best || list[i].hp < best.hp) best = list[i];
        return best;
      },
      fx:function(kind, en, color){
        var x = en ? en.x : run.player.x, y = en ? en.y : run.player.y;
        switch(kind){
          case 'chispa':    FX.sparks(x, y, color); break;
          case 'explosion': FX.explosion(x, y, color); break;
          case 'anillo':    FX.ring(x, y, 2.4, color || '#ffd166', 0.4); break;
          case 'rayo':      FX.bolt(run.player.x, run.player.y, x, y, color || '#ffe066', 0.18, 'bolt'); FX.lightning(x, y); break;
          case 'hielo':     FX.frost(x, y); break;
          case 'humo':      FX.smoke(x, y, color); break;
          case 'sangre':    FX.blood(x, y, 6, color); break;
          case 'brillo':    FX.glow(x, y, color); break;
        }
      },
      shake:function(pw){ FX.kick(pw); },
      sound:function(n){ SFX.play(n); },
      log:function(es, en, cls){ logMsg({ es:es, en:en }, cls || 'info'); },
      floatText:function(txt, color){ FX.text(run.player.x, run.player.y, txt, color || '#ffd166', { big:true }); }
    };
    Object.defineProperty(C, 'p', { get:function(){
      var p = run.player;
      return {
        hp:p.hp, maxHp:p.s.maxHp, atk:p.s.atk, def:p.s.def, level:p.level,
        potions:p.potions, gold:p.gold, shield:p.shield,
        hpPct: Util.clamp(p.hp / Math.max(1, p.s.maxHp), 0, 1)
      };
    }});
    return C;
  }

  /** Lanza un hook en todas las reliquias del jugador. `ctx` es de ida y vuelta. */
  function hook(name, ctx){
    ctx = ctx || {};
    if (!run || !run.player) return ctx;
    var rl = run.player.relics;
    if (!rl.length) return ctx;
    var c = ctxFor();
    c.floor = run.floor; c.turn = run.turn; c.rng = run.rng;
    for (var i = 0; i < rl.length; i++){
      var inst = rl[i];
      var fn = inst.def.hooks && inst.def.hooks[name];
      if (typeof fn !== 'function') continue;
      c.stacks = inst.stacks;
      c.mem = inst.mem;
      for (var k in ctx) c[k] = ctx[k];
      try { fn(c); } catch(e){ warnRelic(inst, e); }
      for (var k2 in ctx) ctx[k2] = c[k2];
    }
    return ctx;
  }

  /* ════════════════════════════════════════════════════════════════
     LOG
     ════════════════════════════════════════════════════════════════ */
  function logMsg(msg, cls){
    var text = (typeof msg === 'string') ? msg : TP(msg);
    run.log.push({ text:text, cls:cls || 'info', t:Date.now() });
    if (run.log.length > 60) run.log.shift();
    if (UI && UI.pushLog) UI.pushLog(text, cls || 'info');
  }

  /* ════════════════════════════════════════════════════════════════
     CONSTRUIR UN PISO
     ════════════════════════════════════════════════════════════════ */
  function buildFloor(floor){
    var gen = Dungeon.generate(run.seed, floor, {});
    var p = run.player;

    run.floor = floor;
    run.tiles = gen.tiles;
    run.rooms = gen.rooms;
    run.biome = gen.biome;
    run.torches = gen.torches;
    run.stairs = gen.stairs;
    run.isBossFloor = gen.isBoss;
    run.visible = new Uint8Array(MW * MH);
    run.seen = new Uint8Array(MW * MH);
    run.light = new Float32Array(MW * MH);
    run.actors = [];
    run.items = [];
    run.turn = 0;
    run.floorKills = 0;
    run.lowHpFired = false;
    run.bossRef = null;
    run.distDirty = true;

    p.x = gen.start.x; p.y = gen.start.y;
    p.px = p.x; p.py = p.y;

    var rng = gen.rng;
    var occupied = new Uint8Array(MW * MH);
    occupied[idx(p.x, p.y)] = 1;

    spawnEnemies(gen, rng, occupied);
    spawnLoot(gen, rng, occupied);

    hook('onFloorStart', {});
    recalc(p);
    computeFOV();
    return gen;
  }

  function spawnEnemies(gen, rng, occupied){
    var floor = run.floor;
    var spots = Dungeon.freeSpots(gen.tiles, gen.rooms, rng, occupied, gen.start, 7, gen.reach);
    var biome = run.biome;

    if (gen.isBoss){
      var bossId = run.biome.boss;
      if (bossId === 'random'){
        var i = Math.floor(floor / CFG.BOSS_EVERY) % CFG.BOSS_ORDER.length;
        bossId = CFG.BOSS_ORDER[i];
      }
      var bc = gen.stairs;
      var b = makeBoss(bossId, bc.x, bc.y, floor);
      /* El jefe se coloca junto a la escalera para que la arena
         obligue a pelear, no a esquivar. */
      placeActor(b, bc.x, bc.y, occupied, gen.tiles);
      run.bossRef = b;
      /* Séquito reducido: el jefe debe ser el protagonista. */
      var minions = Math.min(6, 2 + Math.floor(floor / 6));
      for (var m = 0; m < minions && spots.length; m++){
        var sp = spots.pop();
        var e = makeEnemy(CFG.pickEnemyKind(biome, floor, rng), floor, rng);
        placeActor(e, sp.x, sp.y, occupied, gen.tiles);
      }
      return;
    }

    var n = Math.round(CFG.BAL.eCount(floor) * (run.diffDef.enemyMul * 0.55 + 0.45));
    if (run.weekly && run.weekly.enemyMul) n = Math.round(n * run.weekly.enemyMul);
    var elitePact = !!run.pactIds.elite;
    var eliteChance = floor < CFG.BAL.eliteFromFloor ? 0 : Math.min(0.2, 0.02 + floor * 0.012);
    if (run.weekly && run.weekly.eliteMul) eliteChance = Math.min(0.85, eliteChance * run.weekly.eliteMul);
    for (var j = 0; j < n && spots.length; j++){
      var spot = spots.pop();
      var en = makeEnemy(CFG.pickEnemyKind(biome, floor, rng), floor, rng);
      /* Élites: enemigos normales con un 60% más de vida y daño.
         Dan un pico de tensión sin necesitar arte nuevo. */
      if (elitePact || rng.chance(eliteChance)) makeElite(en);
      placeActor(en, spot.x, spot.y, occupied, gen.tiles);
    }

    /* Sala de tesoro: guardada. El botín gratis no sabe a nada. */
    for (var s = 0; s < gen.specials.length; s++){
      var room = gen.specials[s];
      if (room.kind !== 'tesoro') continue;
      var c = Dungeon.center(room);
      var gk = floor >= 8 ? 'mimic' : CFG.pickEnemyKind(biome, floor, rng);
      var guard = makeEnemy(gk, floor, rng);
      makeElite(guard);
      placeActor(guard, c.x + 1, c.y, occupied, gen.tiles);
    }
  }

  function placeActor(a, x, y, occupied, tiles){
    /* Busca la casilla libre más cercana si la pedida está ocupada. */
    for (var r = 0; r < 6; r++){
      for (var dy = -r; dy <= r; dy++){
        for (var dx = -r; dx <= r; dx++){
          var nx = x + dx, ny = y + dy;
          if (!Dungeon.inBounds(nx, ny)) continue;
          var i = idx(nx, ny);
          if (occupied[i]) continue;
          if (CFG.SOLID[tiles[i]] || tiles[i] === TL.LAVA) continue;
          a.x = nx; a.y = ny; a.px = nx; a.py = ny;
          occupied[i] = 1;
          run.actors.push(a);
          return true;
        }
      }
    }
    return false;
  }

  function spawnLoot(gen, rng, occupied){
    var floor = run.floor;
    var spots = Dungeon.freeSpots(gen.tiles, gen.rooms, rng, occupied, gen.start, 3, gen.reach);
    var n = 3 + Math.floor(floor / 2);
    if (run.pactIds.pobreza) n = Math.max(2, n - 2);

    for (var i = 0; i < n && spots.length; i++){
      var sp = spots.pop();
      var kind = rng.weighted(CFG.LOOT, function(l){ return l.w; }).kind;
      if (kind === 'gold' && run.pactIds.pobreza) kind = 'potion';
      run.items.push(makeItem(kind, sp.x, sp.y, floor, rng));
      occupied[idx(sp.x, sp.y)] = 1;
    }
    /* Sala de tesoro: cofre garantizado. */
    for (var s = 0; s < gen.specials.length; s++){
      var room = gen.specials[s];
      var c = Dungeon.center(room);
      if (room.kind === 'tesoro'){
        run.items.push(makeItem('chest', c.x, c.y, floor, rng));
        run.items.push(makeItem('gold', c.x - 1, c.y, floor, rng));
      }
    }
    /* Red de seguridad: si vas justo de vida, el piso te da una poción. */
    if (run.player.hp / run.player.s.maxHp < 0.33 && spots.length){
      var sp2 = spots.pop();
      run.items.push(makeItem('potion', sp2.x, sp2.y, floor, rng));
    }
  }

  function makeItem(kind, x, y, floor, rng){
    var it = { kind:kind, x:x, y:y, t:rng.float(0, 6.28) };
    if (kind === 'gold') it.amount = Math.round(CFG.BAL.goldPerFloor(floor) * rng.float(0.5, 1.4));
    if (kind === 'gem')  it.amount = Math.round(CFG.BAL.goldPerFloor(floor) * rng.float(2.2, 3.6));
    if (kind === 'heart')it.amount = 6 + Math.floor(floor * 0.8);
    return it;
  }

  /* ─────────── Fábrica de enemigos ─────────── */
  function makeEnemy(kind, floor, rng){
    var d = CFG.ENEMIES[kind];
    if (!d){ kind = 'rat'; d = CFG.ENEMIES.rat; }
    var mul = run.diffDef.enemyMul;
    var hp = Math.max(1, Math.round(d.hp * CFG.BAL.eHp(floor) * mul));
    var e = {
      id: uid++, kind:kind, name:TP(d.name), def_:d, hostile:true,
      x:0, y:0, px:0, py:0, facing:-1, animT: rng ? rng.float(0,6) : 0,
      hp:hp, maxHp:hp,
      atk: Math.max(1, Math.round(d.atk * CFG.BAL.eAtk(floor) * mul * 10) / 10),
      def: Math.round(d.def * CFG.BAL.eDef(floor) * 10) / 10,
      xp:  Math.round(d.xp * CFG.BAL.eXp(floor)),
      gold: Math.round(d.gold * (1 + floor * 0.22)),
      baseSpeed: d.speed, speed: d.speed,
      energy: rng ? rng.float(0, 0.9) : 0,
      ai: d.ai, range: d.range || 1, dodgeC: d.dodge || 0,
      onHit: d.onHit, aura: d.aura, blast: d.blast, summons: d.summons,
      frontBlock: d.frontBlock, drain: d.drain, regen: d.regen,
      status:{}, alert:0, intent:null, intentData:null,
      flash:0, hurtT:0, elite:false, phasesDone:0,
      hidden: d.ai === 'ambush'     // el mímico finge ser un cofre
    };
    if (run.weekly){
      if (run.weekly.hpMul && run.weekly.hpMul !== 1){
        e.maxHp = Math.max(1, Math.round(e.maxHp * run.weekly.hpMul));
        e.hp = e.maxHp;
      }
      if (run.weekly.speedMul && run.weekly.speedMul !== 1){
        e.speed = e.baseSpeed * run.weekly.speedMul;
      }
      if (run.weekly.burnHit && !e.onHit){
        e.onHit = { status:'quemado', turns:3, power:2 };
      }
    }
    return e;
  }
  function makeElite(e){
    e.elite = true;
    e.maxHp = Math.round(e.maxHp * 1.6); e.hp = e.maxHp;
    e.atk = Math.round(e.atk * 1.35 * 10) / 10;
    e.xp = Math.round(e.xp * 1.8);
    e.gold = Math.round(e.gold * 2.2);
    e.name = e.name + ' ' + (I18N.get() === 'es' ? 'de élite' : 'Elite');
    return e;
  }
  function makeBoss(bossId, x, y, floor){
    var d = CFG.BOSSES[bossId] || CFG.BOSSES.boss_rat;
    /* En el Descenso Eterno los jefes se reciclan, así que escalan
       con la profundidad por encima de su piso "natural". */
    var over = Math.max(0, floor - CFG.FINAL_FLOOR) * 0.28;
    var mul = run.diffDef.enemyMul * (1 + over);
    var hp = Math.round(d.hp * mul);
    return {
      id: uid++, kind:bossId, name:TP(d.name), def_:d, hostile:true, isBoss:true,
      x:x, y:y, px:x, py:y, facing:-1, animT:0,
      hp:hp, maxHp:hp,
      atk: Math.round(d.atk * mul * (1 + over * 0.5) * 10) / 10,
      def: Math.round(d.def * (1 + over * 0.4)),
      xp: Math.round(d.xp * (1 + over)),
      gold: Math.round(d.gold * (1 + over)),
      baseSpeed: d.speed, speed: d.speed, energy:0,
      ai: d.ai, range: d.range || 1,
      summons: d.summons, drain: d.drain, regen: d.regen,
      phases: d.phases || [], phasesDone:0,
      status:{}, alert:99, intent:null, intentData:null,
      flash:0, hurtT:0, elite:false, hidden:false
    };
  }

  /* ─────────── Aliados invocados ─────────── */
  var ALLY_DEFS = {
    esqueleto_aliado:{ kind:'skeleton', hp:16, atk:6, speed:1,   life:24 },
    lobo:            { kind:'hound',    hp:14, atk:8, speed:1.5, life:20 },
    espiritu:        { kind:'wraith',   hp:10, atk:7, speed:1,   life:16 }
  };
  function summonAlly(id, n){
    var d = ALLY_DEFS[id] || ALLY_DEFS.esqueleto_aliado;
    n = Math.max(1, n | 0);
    var p = run.player, placed = 0;
    for (var r = 1; r <= 3 && placed < n; r++){
      for (var dy = -r; dy <= r && placed < n; dy++){
        for (var dx = -r; dx <= r && placed < n; dx++){
          if (Util.cheb(0,0,dx,dy) !== r) continue;
          var nx = p.x + dx, ny = p.y + dy;
          if (!walkable(nx, ny) || actorAt(nx, ny)) continue;
          var f = run.floor;
          var a = {
            id: uid++, kind:d.kind, name:TP({es:'Aliado',en:'Ally'}), hostile:false,
            x:nx, y:ny, px:nx, py:ny, facing:1, animT:0,
            hp: Math.round(d.hp * (1 + f * 0.25)), maxHp: Math.round(d.hp * (1 + f * 0.25)),
            atk: Math.round(d.atk * (1 + f * 0.3)), def:0, xp:0, gold:0,
            baseSpeed:d.speed, speed:d.speed, energy:0,
            ai:'ally', range:1, status:{}, alert:99, intent:null,
            flash:0, hurtT:0, life:d.life, ally:true
          };
          run.actors.push(a);
          placed++;
          FX.glow(nx, ny, '#c77dff');
        }
      }
    }
    if (placed) SFX.play('summon');
  }

  /* ════════════════════════════════════════════════════════════════
     CONSULTAS DEL MAPA
     ════════════════════════════════════════════════════════════════ */
  function tileAt(x, y){
    if (!Dungeon.inBounds(x, y)) return TL.WALL;
    return run.tiles[idx(x, y)];
  }
  function walkable(x, y){
    if (!Dungeon.inBounds(x, y)) return false;
    return !CFG.SOLID[run.tiles[idx(x, y)]];
  }
  function actorAt(x, y, hostileOnly){
    for (var i = 0; i < run.actors.length; i++){
      var a = run.actors[i];
      if (a.hp <= 0) continue;
      if (hostileOnly && !a.hostile) continue;
      if (a.x === x && a.y === y) return a;
    }
    return null;
  }
  function itemAt(x, y){
    for (var i = 0; i < run.items.length; i++)
      if (run.items[i].x === x && run.items[i].y === y) return run.items[i];
    return null;
  }
  function visibleAt(x, y){
    return Dungeon.inBounds(x, y) && run.visible[idx(x, y)] === 1;
  }
  function computeFOV(){
    var p = run.player;
    Dungeon.computeFOV(run.tiles, run.visible, run.seen, run.light, p.x, p.y, p.s.vision);
  }
  /** Mapa de distancias al jugador; se recalcula como máximo una vez por turno. */
  function distField(){
    if (run.distDirty || !run.distField){
      var p = run.player;
      run.distField = Dungeon.distanceField(p.x, p.y, function(x, y){
        return !walkable(x, y);
      });
      run.distDirty = false;
    }
    return run.distField;
  }

  /* ════════════════════════════════════════════════════════════════
     ESTADOS ALTERADOS
     ════════════════════════════════════════════════════════════════ */
  function applyStatus(target, name, turns, power){
    if (!target || target.hp <= 0) return;
    var d = CFG.STATUS[name];
    if (!d) return;
    /* Los jefes resisten los bloqueos de turno: congelar a un jefe
       cinco turnos convierte la pelea en nada. */
    if (target.isBoss && d.skip) turns = Math.max(1, Math.round(turns * 0.4));
    var cur = target.status[name];
    if (cur){
      cur.turns = Math.max(cur.turns, turns);
      cur.power = Math.max(cur.power || 0, power || 0);
    } else {
      target.status[name] = { turns:turns, power:power || 0 };
    }
    if (target === run.player) recalc(run.player);
    else hook('onStatusApplied', { target:target, status:name, turns:turns });

    if (name === 'congelado'){ FX.frost(target.x, target.y); SFX.play('freeze'); }
    else if (name === 'quemado'){ FX.spawn(target.x, target.y, 6, { color:'#ff8f3f', speed:2, life:0.5, gravity:-3, shape:'spark' }); }
    else if (name === 'envenenado'){ FX.spawn(target.x, target.y, 6, { color:'#7cff6b', speed:1.6, life:0.7, gravity:-2, shape:'dot' }); }
    else if (name === 'electrificado'){ FX.lightning(target.x, target.y); }
  }

  /** Bonus temporal a un stat concreto, en turnos. */
  function addTempMod(key, add, turns){
    var p = run.player;
    if (!p.tempMods) p.tempMods = [];
    p.tempMods.push({ key:key, add:add, turns:turns });
    recalc(p);
  }

  function applyBuff(name, turns, power){
    var d = CFG.BUFFS[name];
    if (!d) return;
    var p = run.player;
    var cur = p.buffs[name];
    if (cur){ cur.turns = Math.max(cur.turns, turns); cur.power = Math.max(cur.power || 0, power || 0); }
    else p.buffs[name] = { turns:turns, power:power || 0 };
    recalc(p);
    FX.glow(p.x, p.y, d.color);
  }

  /** Daño por veneno/fuego al final de cada turno del jugador. */
  function tickStatuses(){
    var i, a, sn, st, sd;
    for (i = 0; i < run.actors.length; i++){
      a = run.actors[i];
      if (a.hp <= 0) continue;
      var totalDot = 0, dotColor = '#ff8f3f';
      for (sn in a.status){
        st = a.status[sn]; sd = CFG.STATUS[sn];
        if (!sd){ delete a.status[sn]; continue; }
        if (sd.dot && sd.tick === 'turn'){
          totalDot += Math.max(1, st.power || 1);
          dotColor = sd.color;
        }
        st.turns--;
        if (st.turns <= 0) delete a.status[sn];
      }
      if (totalDot > 0){
        dealDamage(a, totalDot, 'puro', { silent:true, noHooks:true, color:dotColor });
      }
      /* velocidad efectiva tras los estados */
      a.speed = a.baseSpeed;
      for (sn in a.status){
        sd = CFG.STATUS[sn];
        if (sd && sd.speedMul) a.speed *= sd.speedMul;
      }
      if (a.regen && a.hp > 0 && a.hp < a.maxHp){
        a.hp = Math.min(a.maxHp, a.hp + a.regen);
      }
      if (a.life != null){
        a.life--;
        if (a.life <= 0){ a.hp = 0; FX.smoke(a.x, a.y, '#c77dff'); }
      }
    }

    /* jugador */
    var p = run.player, dot = 0, col = '#ff8f3f';
    for (sn in p.status){
      st = p.status[sn]; sd = CFG.STATUS[sn];
      if (!sd){ delete p.status[sn]; continue; }
      if (sd.dot && sd.tick === 'turn'){ dot += Math.max(1, st.power || 1); col = sd.color; }
      st.turns--;
      if (st.turns <= 0) delete p.status[sn];
    }
    for (var bn in p.buffs){
      p.buffs[bn].turns--;
      if (p.buffs[bn].turns <= 0) delete p.buffs[bn];
    }
    if (p.tempMods && p.tempMods.length){
      for (var tm = p.tempMods.length - 1; tm >= 0; tm--){
        if (--p.tempMods[tm].turns <= 0) p.tempMods.splice(tm, 1);
      }
    }
    if (dot > 0) hurtPlayer(dot, null, { ignoreShield:true, color:col });
    if (p.s.regen > 0 && p.hp < p.s.maxHp) healPlayer(p.s.regen, 'regen', true);
    if (p.s.shieldMax > 0 && p.base.shieldRegen > 0 && p.shield < p.s.shieldMax){
      p.shield = Math.min(p.s.shieldMax, p.shield + p.base.shieldRegen);
    }
    /* aura ígnea: quema lo que te rodea */
    if (p.buffs.llamas){
      var adj = ctxFor().adjacentEnemies();
      for (var k = 0; k < adj.length; k++) applyStatus(adj[k], 'quemado', 2, CFG.BUFFS.llamas.burnAura);
    }
    recalc(p);
  }

  /* ════════════════════════════════════════════════════════════════
     DAÑO
     ════════════════════════════════════════════════════════════════ */
  /** Daño a un actor (enemigo o aliado). Punto único de entrada. */
  function dealDamage(target, amount, type, o){
    o = o || {};
    if (!target || target.hp <= 0) return 0;
    amount = Math.max(0, amount);

    /* marcado: recibe más */
    if (target.status.marcado) amount *= (1 + CFG.STATUS.marcado.takeMore);
    /* congelado: es un blanco fácil (y habilita la sinergia hielo+daño) */
    if (target.status.congelado && !o.fromDot) amount *= 1.25;

    var dmg = Math.max(1, Math.round(amount));
    target.hp -= dmg;
    target.flash = 0.22;
    target.hurtT = 0.28;

    if (!o.silent){
      FX.text(target.x, target.y, dmg, o.color || (o.isCrit ? '#ffe066' : '#ffd166'),
              { isDamage:true, big:!!o.isCrit, crit:!!o.isCrit });
      FX.blood(target.x, target.y, Math.min(9, dmg / 3), o.color);
    }
    /* electrificado: el daño salta al enemigo más cercano */
    if (target.status.electrificado && !o.chained){
      var near = null, bd = 99;
      var list = ctxFor().allEnemies();
      for (var i = 0; i < list.length; i++){
        if (list[i] === target) continue;
        var d = Util.cheb(list[i].x, list[i].y, target.x, target.y);
        if (d < bd){ bd = d; near = list[i]; }
      }
      if (near && bd <= 4){
        FX.bolt(target.x, target.y, near.x, near.y, '#ffe066', 0.16, 'bolt');
        SFX.play('shock');
        dealDamage(near, Math.round(dmg * 0.5), 'rayo', { chained:true });
      }
    }
    /* el hielo se rompe al golpear */
    if (target.status.congelado){
      target.status.congelado.turns--;
      if (target.status.congelado.turns <= 0) delete target.status.congelado;
    }

    if (target.hp <= 0) onActorDeath(target, o);
    else if (target.isBoss) checkBossPhases(target);
    return dmg;
  }

  function onActorDeath(a, o){
    a.hp = 0;
    if (!a.hostile){
      FX.smoke(a.x, a.y, '#c77dff');
      return;
    }
    run.kills++;
    run.floorKills++;

    /* los bombarderos estallan al morir: convierte matarlos en decisión */
    if (a.blast){
      detonate(a);
    }
    /* el limo se divide */
    if (a.ai === 'splitter' && !a.wasSplit && a.maxHp > 6){
      for (var s = 0; s < 2; s++){
        var nx = a.x + (s ? 1 : -1), ny = a.y;
        if (!walkable(nx, ny) || actorAt(nx, ny)) continue;
        var child = makeEnemy('slime', run.floor, run.rng);
        child.maxHp = Math.max(3, Math.round(a.maxHp * 0.42));
        child.hp = child.maxHp;
        child.atk = Math.round(a.atk * 0.7 * 10) / 10;
        child.xp = Math.round(a.xp * 0.3);
        child.gold = 0;
        child.wasSplit = true;
        child.x = nx; child.y = ny; child.px = nx; child.py = ny;
        run.actors.push(child);
      }
      FX.spawn(a.x, a.y, 10, { color:'#7cb518', speed:4, life:0.5, shape:'shard' });
    }

    var isBoss = !!a.isBoss;
    noteCombo(a, isBoss);
    gainXp(a.xp);
    addGold(a.gold);

    if (isBoss){
      run.bossesKilled[a.kind] = (run.bossesKilled[a.kind] || 0) + 1;
      if (run.player.hp === 1) run.flags.bossAt1Hp = 1;
      logMsg({ es:T('bossDown', a.name), en:T('bossDown', a.name) }, 'epic');
      FX.explosion(a.x, a.y, '#ffd166');
      FX.kick(1.2); FX.stop(0.16);
      FX.screenFlash('#ffd166', 0.45, 0.35);
      SFX.play('bossKill');
      Util.vibrate([30, 40, 80]);
      if (a.kind === 'boss_seed') winRun();
    } else {
      logMsg({ es:T('died', a.name, a.xp), en:T('died', a.name, a.xp) }, 'good');
      SFX.play(a.elite ? 'killBig' : 'kill');
      FX.kick(a.elite ? 0.5 : 0.25);
      FX.spawn(a.x, a.y, 12, { color:'#c92a3b', speed:6, life:0.5, shape:'shard' });
    }

    hook('onKill', { target:a, isBoss:isBoss });
    ganaUlt(a.maxHp * 0.25);
  }

  /** Encadena bajas cercanas en el tiempo. El nombre de la racha es
      lo que un joven manda por captura; el oro extra es la razón
      mecánica para no parar. */
  function noteCombo(a, isBoss){
    var windowT = (CFG.BAL.comboWindow || 4);
    if (run.time - run.comboAt <= windowT) run.combo++;
    else run.combo = 1;
    run.comboAt = run.time;
    if (isBoss) run.combo += 2;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
    if (run.combo >= 3){
      addGold((CFG.BAL.comboGold || 1) * Math.min(8, run.combo - 2));
      if (UI && UI.showCombo) UI.showCombo(run.combo);
      if (run.combo === 3 || run.combo === 5 || run.combo === 8 || run.combo === 12 || run.combo === 18){
        SFX.play('combo');
        FX.text(a.x, a.y, 'x' + run.combo, '#ffd166', { big:true, life:1.1 });
      }
    }
  }

  function detonate(a){
    var d = a.blast || { r:2, dmg:14 };
    var dmg = Math.round(d.dmg * CFG.BAL.eAtk(run.floor) * run.diffDef.enemyMul);
    FX.explosion(a.x, a.y, '#ff8f3f');
    SFX.play('explode');
    var p = run.player;
    if (Util.cheb(p.x, p.y, a.x, a.y) <= d.r) hurtPlayer(dmg, a, {});
    var list = run.actors;
    for (var i = 0; i < list.length; i++){
      var o = list[i];
      if (o === a || o.hp <= 0) continue;
      if (Util.cheb(o.x, o.y, a.x, a.y) <= d.r) dealDamage(o, Math.round(dmg * 0.8), 'fuego', {});
    }
  }

  function checkBossPhases(b){
    if (!b.phases) return;
    var pct = b.hp / b.maxHp;
    while (b.phasesDone < b.phases.length && pct <= b.phases[b.phasesDone].at){
      var ph = b.phases[b.phasesDone++];
      if (ph.act === 'enrage'){
        b.atk = Math.round(b.atk * 1.3 * 10) / 10;
        b.enraged = true;
        FX.ring(b.x, b.y, 3, '#ff5d6c', 0.6);
        logMsg({ es:'¡' + b.name + ' se enfurece!', en:b.name + ' is enraged!' }, 'bad');
      } else if (ph.act === 'frenzy'){
        b.baseSpeed = b.speed = b.baseSpeed * 1.6;
        b.enraged = true;
        FX.ring(b.x, b.y, 3.6, '#ffd166', 0.6);
        logMsg({ es:'¡' + b.name + ' se acelera!', en:b.name + ' speeds up!' }, 'bad');
      } else if (ph.act === 'summon'){
        var kinds = b.summons || ['skeleton'];
        for (var i = 0; i < 3; i++) spawnNear(b, run.rng.pick(kinds));
        logMsg({ es:b.name + ' llama a los suyos.', en:b.name + ' calls its kin.' }, 'bad');
      }
      SFX.play('bossRoar');
      FX.kick(0.8);
    }
  }

  function spawnNear(a, kind){
    for (var r = 1; r <= 3; r++){
      for (var dy = -r; dy <= r; dy++){
        for (var dx = -r; dx <= r; dx++){
          if (Util.cheb(0,0,dx,dy) !== r) continue;
          var nx = a.x + dx, ny = a.y + dy;
          if (!walkable(nx, ny) || actorAt(nx, ny)) continue;
          if (run.player.x === nx && run.player.y === ny) continue;
          var e = makeEnemy(kind, run.floor, run.rng);
          e.x = nx; e.y = ny; e.px = nx; e.py = ny;
          e.alert = 12;
          run.actors.push(e);
          FX.glow(nx, ny, '#c77dff');
          return e;
        }
      }
    }
    return null;
  }

  /* ─────────── Daño al jugador ─────────── */
  function hurtPlayer(amount, source, o){
    o = o || {};
    var p = run.player;
    if (run.over) return 0;

    if (!o.unavoidable){
      var ctx = hook('onBeforeHurt', { source:source || null, dmg:amount, canceled:false });
      if (ctx.canceled){
        FX.text(p.x, p.y, I18N.get() === 'es' ? 'ANULADO' : 'NEGATED', '#8ee7ff', { big:true });
        SFX.play('block');
        return 0;
      }
      amount = ctx.dmg;
    }
    /* esquiva */
    if (!o.ignoreDodge && p.s.dodge > 0 && run.rng.chance(p.s.dodge)){
      FX.text(p.x, p.y, I18N.get() === 'es' ? 'ESQUIVA' : 'DODGE', '#8ee7ff', {});
      SFX.play('dodge');
      if (source) logMsg({ es:T('enemyMiss', source.name), en:T('enemyMiss', source.name) }, 'good');
      return 0;
    }

    var dmg = Math.max(0, Math.round(amount));
    if (dmg <= 0) return 0;

    /* escudo primero */
    if (!o.ignoreShield && p.shield > 0){
      var absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      FX.ring(p.x, p.y, 1.5, '#8ee7ff', 0.3);
      SFX.play(p.shield <= 0 ? 'shieldBreak' : 'block');
      if (absorbed > 0) FX.text(p.x, p.y, '-' + absorbed, '#8ee7ff', { isDamage:true });
      if (dmg <= 0) return absorbed;
    }

    p.hp -= dmg;
    p.hurtT = 0.4;
    FX.text(p.x, p.y, '-' + dmg, o.color || '#ff4d5e', { isDamage:true, big:dmg > p.s.maxHp * 0.2 });
    FX.blood(p.x, p.y, Math.min(10, dmg / 2), '#c92a3b');
    FX.kick(Util.clamp(0.3 + dmg / Math.max(1, p.s.maxHp) * 2.2, 0.3, 1.2));
    FX.screenFlash('#ff2d55', Util.clamp(dmg / Math.max(1, p.s.maxHp) * 0.8, 0.08, 0.4), 0.2);
    SFX.play(dmg > p.s.maxHp * 0.18 ? 'playerHurtBig' : 'playerHurt');
    Util.vibrate(dmg > p.s.maxHp * 0.18 ? 60 : 22);
    ganaUlt(dmg * CFG.BAL.ultGainOnHurt);

    if (source) logMsg({ es:T('enemyHit', source.name, dmg), en:T('enemyHit', source.name, dmg) }, 'bad');

    /* púas: devuelve parte del daño al que te toca */
    if (p.s.thorns > 0 && source && source.hp > 0 && Util.cheb(source.x, source.y, p.x, p.y) <= 1){
      var back = Math.max(1, Math.round(dmg * p.s.thorns));
      FX.sparks(source.x, source.y, '#c77dff');
      dealDamage(source, back, 'puro', { noHooks:true });
    }

    hook('onAfterHurt', { dmgTaken:dmg, source:source || null });
    recalc(p);

    if (!run.lowHpFired && p.hp > 0 && p.hp / p.s.maxHp < 0.3){
      run.lowHpFired = true;
      hook('onLowHp', {});
    }
    if (p.hp <= 0) killPlayer(source);
    return dmg;
  }

  function healPlayer(n, why, silent){
    var p = run.player;
    if (n <= 0) return 0;
    var ctx = hook('onHeal', { amount:n });
    n = Math.max(0, Math.round(ctx.amount));
    var before = p.hp;
    p.hp = Math.min(p.s.maxHp, p.hp + n);
    var got = p.hp - before;
    if (got > 0 && !silent){
      FX.text(p.x, p.y, '+' + got, '#7cffb2', {});
      FX.heal(p.x, p.y);
      SFX.play('heal');
    }
    recalc(p);
    return got;
  }

  function addShield(n){
    var p = run.player;
    n = Math.max(0, Math.round(n));
    if (!n) return;
    p.shield += n;
    FX.ring(p.x, p.y, 1.6, '#8ee7ff', 0.4);
    FX.text(p.x, p.y, '+' + n + ' ⛨', '#8ee7ff', {});
    SFX.play('shieldUp');
  }

  function addGold(n){
    if (run.pactIds.pobreza) return;
    n = Math.round(n * run.player.s.goldMult);
    if (n <= 0) return;
    run.player.gold += n;
    run.goldEarned += n;
    run.maxGold = Math.max(run.maxGold, run.player.gold);
  }

  function gainXp(n){
    var p = run.player;
    p.xp += Math.round(n * p.s.xpMult);
    var ups = 0;
    while (p.xp >= p.xpNext && ups < 12){
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = CFG.BAL.xpNext(p.level);
      recalc(p);
      p.hp = Math.min(p.s.maxHp, p.hp + Math.round(CFG.BAL.lvlHp * 1.6));
      ups++;
      hook('onLevelUp', { level:p.level });
      logMsg({ es:T('levelUp', p.level), en:T('levelUp', p.level) }, 'epic');
      FX.text(p.x, p.y, I18N.get() === 'es' ? '¡NIVEL ' + p.level + '!' : 'LEVEL ' + p.level + '!', '#7cffb2', { big:true, life:1.4 });
      FX.ring(p.x, p.y, 3, '#7cffb2', 0.7);
      FX.glow(p.x, p.y, '#7cffb2');
      SFX.play('levelup');
    }
  }

  function ganaUlt(n){
    var p = run.player;
    if (p.ultCharge >= 100) return;
    var mul = 1 + Meta.upLvl('ira') * 0.12;
    p.ultCharge = Util.clamp(p.ultCharge + n * mul * 0.1, 0, 100);
    if (p.ultCharge >= 100){
      SFX.play('ultReady');
      FX.text(p.x, p.y, T('ultIsReady'), '#ffd166', { big:true, life:1.4 });
    }
  }

  function knockback(e, tiles){
    if (!e || e.hp <= 0) return;
    var p = run.player;
    var dx = Util.sign(e.x - p.x), dy = Util.sign(e.y - p.y);
    if (!dx && !dy) dx = 1;
    for (var i = 0; i < tiles; i++){
      var nx = e.x + dx, ny = e.y + dy;
      if (!walkable(nx, ny) || actorAt(nx, ny)){
        /* Estamparse contra un muro duele: premia el posicionamiento. */
        dealDamage(e, Math.max(1, Math.round(e.maxHp * 0.06)), 'fisico', {});
        break;
      }
      e.x = nx; e.y = ny;
    }
    run.distDirty = true;
  }

  function teleportPlayer(){
    var p = run.player;
    for (var t = 0; t < 200; t++){
      var x = run.rng.int(MW), y = run.rng.int(MH);
      if (!walkable(x, y) || actorAt(x, y)) continue;
      if (run.tiles[idx(x,y)] === TL.LAVA) continue;
      FX.smoke(p.x, p.y, '#c77dff');
      p.x = x; p.y = y; p.px = x; p.py = y;
      FX.glow(x, y, '#c77dff');
      SFX.play('teleport');
      run.distDirty = true;
      computeFOV();
      return true;
    }
    return false;
  }

  /* ════════════════════════════════════════════════════════════════
     ATAQUE DEL JUGADOR
     ════════════════════════════════════════════════════════════════ */
  function playerAttack(target, opts){
    opts = opts || {};
    var p = run.player;
    if (!target || target.hp <= 0) return;

    p.attackAnim = 1;
    p.facing = target.x >= p.x ? 1 : -1;

    var variance = run.rng.float(0.92, 1.1);
    var raw = p.s.atk * variance * (opts.mul || 1);
    if (run.combo >= 5) raw *= 1 + Math.min(0.45, (run.combo - 4) * 0.04);
    var isCrit = !opts.noCrit && run.rng.chance(p.s.crit);

    /* Golpe desde las sombras: salir de la invisibilidad multiplica. */
    if (p.shadowStrike && p.buffs.invisible){
      raw *= p.shadowStrike;
      p.shadowStrike = 0;
      delete p.buffs.invisible;
      recalc(p);
      FX.text(target.x, target.y, I18N.get() === 'es' ? '¡EMBOSCADA!' : 'AMBUSH!', '#c77dff', { big:true });
      FX.screenFlash('#c77dff', 0.3, 0.2);
    }

    var ctx = hook('onBeforeAttack', { target:target, dmg:raw, isCrit:isCrit });
    raw = ctx.dmg; isCrit = ctx.isCrit;

    /* El caballero bloquea de frente: hay que flanquearlo. */
    var blockedFront = false;
    if (target.frontBlock && target.facingTo && Util.cheb(target.x, target.y, p.x, p.y) <= 1){
      var fx = Util.sign(p.x - target.x), fy = Util.sign(p.y - target.y);
      if (fx === target.facingTo.x && fy === target.facingTo.y){
        raw *= (1 - target.frontBlock);
        blockedFront = true;
      }
    }

    var afterDef = Math.max(1, raw - target.def);
    if (isCrit) afterDef *= p.s.critMult;

    if (target.dodgeC && run.rng.chance(target.dodgeC)){
      FX.text(target.x, target.y, I18N.get() === 'es' ? 'FALLAS' : 'MISS', '#8b8ba7', {});
      SFX.play('swing');
      return;
    }

    var dealt = dealDamage(target, afterDef, 'fisico', { isCrit:isCrit });

    if (isCrit){
      SFX.play('crit');
      FX.kick(0.7); FX.stop(0.06);
      FX.ring(target.x, target.y, 1.6, '#ffe066', 0.3);
      FX.screenFlash('#ffe066', 0.16, 0.12);
      Util.vibrate(40);
      logMsg({ es:T('youCrit', target.name, dealt), en:T('youCrit', target.name, dealt) }, 'epic');
    } else {
      SFX.play(dealt > p.s.atk * 1.4 ? 'hitHeavy' : 'hit');
      FX.kick(0.22); FX.stop(0.025);
      Util.vibrate(12);
      if (blockedFront){
        SFX.play('block');
        FX.text(target.x, target.y, I18N.get() === 'es' ? 'BLOQUEA' : 'BLOCKED', '#adb5bd', {});
      }
    }
    FX.sparks((target.x + p.x)/2, (target.y + p.y)/2, isCrit ? '#ffe066' : '#ffd8a8');

    /* robo de vida */
    if (p.s.lifesteal > 0 && dealt > 0){
      var steal = Math.max(1, Math.round(dealt * p.s.lifesteal));
      healPlayer(steal, 'robo', true);
      FX.text(p.x, p.y, '+' + steal, '#ff8fa3', {});
    }
    ganaUlt(dealt * CFG.BAL.ultGainOnDamage);

    hook('onAfterAttack', { target:target, dmgDealt:dealt, isCrit:isCrit, killed:target.hp <= 0 });
  }

  /* ════════════════════════════════════════════════════════════════
     RELOJ DE TURNOS
     Modelo de energía: cada acción del jugador consume tiempo, y los
     actores acumulan energía proporcional a su velocidad. Así un
     gólem lento y un sabueso rápido conviven sin casos especiales.
     ════════════════════════════════════════════════════════════════ */
  function advanceTime(cost){
    var p = run.player;
    if (run.over) return;

    run.turn++;
    var elapsed = cost / Math.max(0.25, p.s.speed);
    run.time += elapsed;

    /* IA */
    for (var i = 0; i < run.actors.length; i++){
      var a = run.actors[i];
      if (a.hp <= 0) continue;
      if (run.over) break;
      a.energy += elapsed * Math.max(0.1, a.speed);
      var acts = 0;
      while (a.energy >= 1 && a.hp > 0 && !run.over && acts < 4){
        a.energy -= 1;
        acts++;
        if (a.status.congelado || a.status.aturdido) continue;
        AI.act(a);
      }
    }

    /* aura de los demonios */
    for (var j = 0; j < run.actors.length; j++){
      var d = run.actors[j];
      if (d.hp <= 0 || !d.aura || !d.hostile) continue;
      if (Util.cheb(d.x, d.y, p.x, p.y) <= 1) applyStatus(p, d.aura.status, d.aura.turns, d.aura.power);
    }

    tickStatuses();
    hook('onTurnEnd', {});

    /* enfriamientos */
    if (p.dashCd > 0) p.dashCd--;
    if (p.abilityCd > 0) p.abilityCd--;
    if (p.dashCharges < p.dashMax && p.dashCd <= 0) p.dashCharges = p.dashMax;

    /* limpiar cadáveres */
    run.actors = run.actors.filter(function(a){ return a.hp > 0; });
    run.distDirty = true;

    /* pacto de prisa */
    if (run.pactIds.prisa && run.turn > CFG.BAL.turnLimitPacto){
      hurtPlayer(Math.ceil(p.s.maxHp * 0.12), null, { unavoidable:true, ignoreShield:true });
      if (run.turn % 3 === 0) logMsg({ es:'El tiempo te consume.', en:'Time devours you.' }, 'bad');
    }

    computeFOV();
    if (p.hp <= 0 && !run.over) killPlayer(run.killedBy);

    /* Una reliquia puede conceder un turno extra: se consume aquí. */
    if (p.pendingExtraTurn){ p.pendingExtraTurn = false; }
    UI.syncHUD();
  }

  /* ════════════════════════════════════════════════════════════════
     ACCIONES DEL JUGADOR
     ════════════════════════════════════════════════════════════════ */
  function tryMove(dx, dy){
    if (run.over) return false;
    var p = run.player;
    if (p.status.congelado || p.status.aturdido){
      logMsg({ es:'No puedes moverte.', en:'You cannot move.' }, 'bad');
      advanceTime(1);
      return true;
    }
    var nx = p.x + dx, ny = p.y + dy;
    if (!Dungeon.inBounds(nx, ny)) return false;
    if (dx) p.facing = dx > 0 ? 1 : -1;

    var target = actorAt(nx, ny);
    if (target && target.hostile){
      if (target.hidden) revealAmbush(target);
      playerAttack(target);
      advanceTime(1);
      return true;
    }
    if (target && !target.hostile){
      /* intercambiar sitio con un aliado en vez de quedar bloqueado */
      target.x = p.x; target.y = p.y;
      target.px = p.x; target.py = p.y;
    }
    if (!walkable(nx, ny)){
      SFX.play('bump');
      return false;
    }

    var tile = run.tiles[idx(nx, ny)];
    p.px = p.x; p.py = p.y;
    p.x = nx; p.y = ny;
    run.distDirty = true;

    /* sangrado: perder vida al moverse (para el jugador y para la IA) */
    if (p.status.sangrado) hurtPlayer(Math.max(1, p.status.sangrado.power || 1), null, { ignoreShield:true, ignoreDodge:true, color:'#ff4d5e' });

    var cost = 1;
    cost += stepOnTile(nx, ny, tile);
    pickupAt(nx, ny);
    hook('onMove', { dx:dx, dy:dy });
    SFX.play('move');
    advanceTime(cost);
    return true;
  }

  /** Efecto de pisar una casilla. Devuelve coste EXTRA de tiempo. */
  function stepOnTile(x, y, tile){
    var p = run.player;
    switch (tile){
      case TL.LAVA: {
        var d = Math.max(3, Math.round(p.s.maxHp * 0.09));
        hurtPlayer(d, null, { color:'#ff8f3f' });
        applyStatus(p, 'quemado', 3, Math.max(2, Math.round(p.s.maxHp * 0.02)));
        logMsg({ es:T('lavaHurt', d), en:T('lavaHurt', d) }, 'bad');
        SFX.play('lavaStep');
        return 0;
      }
      case TL.SPIKES: {
        var sd = Math.max(2, Math.round(p.s.maxHp * 0.07));
        hurtPlayer(sd, null, {});
        run.tiles[idx(x,y)] = TL.FLOOR;      // la trampa se gasta
        logMsg({ es:T('trapHit', sd), en:T('trapHit', sd) }, 'bad');
        SFX.play('trapSpikes');
        return 0;
      }
      case TL.WATER:
        SFX.play('waterStep');
        return 0.6;                          // el agua frena
      case TL.WEB:
        run.tiles[idx(x,y)] = TL.FLOOR;       // la rompes al pasar
        FX.spawn(x, y, 6, { color:'#d8d8e8', speed:2, life:0.4 });
        return 0.8;
      case TL.RUBBLE:
        return 0.35;
      case TL.ALTAR:
        run.tiles[idx(x,y)] = TL.FLOOR;
        SFX.play('altar');
        UI.openAltar();
        return 0;
      default:
        return 0;
    }
  }

  function revealAmbush(e){
    e.hidden = false;
    e.alert = 20;
    FX.explosion(e.x, e.y, '#ffd166');
    FX.kick(0.8); FX.stop(0.1);
    SFX.play('chestOpen');
    logMsg({ es:'¡Era un mímico!', en:'It was a mimic!' }, 'bad');
  }

  function waitTurn(){
    if (run.over) return;
    /* Esperar cura un poco: evita el "ratoneo" infinito y es una
       decisión (los enemigos se acercan) en vez de un botón muerto. */
    var p = run.player;
    if (p.hp < p.s.maxHp) healPlayer(Math.max(1, Math.round(p.s.maxHp * 0.01)), 'espera', true);
    advanceTime(1);
  }

  function pickupAt(x, y){
    var it = itemAt(x, y);
    if (!it) return;
    var p = run.player;
    var remove = true;
    switch (it.kind){
      case 'potion':
        p.potions++;
        logMsg({ es:T('pickedPotion'), en:T('pickedPotion') }, 'good');
        SFX.play('pickup');
        break;
      case 'gold': case 'gem':
        addGold(it.amount);
        FX.text(x, y, '+' + it.amount + ' ◈', '#ffd166', {});
        SFX.play('coin');
        break;
      case 'heart':
        p.base.maxHp += it.amount;
        recalc(p);
        p.hp += it.amount;
        logMsg({ es:T('pickedHeart', it.amount), en:T('pickedHeart', it.amount) }, 'good');
        FX.heal(x, y);
        SFX.play('heal');
        break;
      case 'scroll':
        castScroll();
        SFX.play('magicBolt');
        break;
      case 'bomb':
        p.bombs = (p.bombs || 0) + 1;
        logMsg({ es:'Recoges una bomba.', en:'You pick up a bomb.' }, 'good');
        SFX.play('pickup');
        break;
      case 'chest':
        SFX.play('chestOpen');
        FX.sparks(x, y, '#ffd166');
        UI.openRelicChoice('cofre');
        break;
      case 'altar':
        UI.openAltar();
        break;
    }
    if (remove){
      var i = run.items.indexOf(it);
      if (i >= 0) run.items.splice(i, 1);
    }
    hook('onPickup', { item:{ kind:it.kind } });
  }

  /** Pergamino: daño a todo lo visible. Sirve de botón de pánico. */
  function castScroll(){
    var list = ctxFor().allEnemies().filter(function(e){ return visibleAt(e.x, e.y); });
    var dmg = Math.round(10 + run.floor * 3.2 + run.player.s.atk * 0.8);
    FX.screenFlash('#c77dff', 0.35, 0.25);
    FX.kick(0.9);
    for (var i = 0; i < list.length; i++){
      FX.bolt(run.player.x, run.player.y, list[i].x, list[i].y, '#c77dff', 0.25, 'beam');
      dealDamage(list[i], dmg, 'arcano', { color:'#c77dff' });
    }
    logMsg({ es:'El pergamino estalla: ' + list.length + ' alcanzados.',
             en:'The scroll bursts: ' + list.length + ' hit.' }, 'epic');
  }

  function usePotion(){
    if (run.over) return;
    var p = run.player;
    if (p.potions <= 0){ logMsg({ es:T('noPotions'), en:T('noPotions') }, 'bad'); SFX.play('error'); return; }
    if (p.hp >= p.s.maxHp){ logMsg({ es:T('hpFull'), en:T('hpFull') }, 'info'); SFX.play('error'); return; }
    p.potions--;
    run.potionsDrunk++;
    var heal = Math.round(p.s.maxHp * CFG.BAL.potionHeal * p.s.potionPower);
    healPlayer(heal, 'pocion');
    SFX.play('potion');
    hook('onUsePotion', {});
    advanceTime(1);
  }

  function useBomb(){
    var p = run.player;
    if (!p.bombs){ SFX.play('error'); return; }
    p.bombs--;
    var dmg = Math.round(18 + run.floor * 4);
    FX.explosion(p.x, p.y, '#ff8f3f');
    SFX.play('explode');
    var list = ctxFor().enemiesInRadius(2);
    for (var i = 0; i < list.length; i++){
      dealDamage(list[i], dmg, 'fuego', { color:'#ff8f3f' });
      applyStatus(list[i], 'quemado', 3, 3);
    }
    advanceTime(1);
  }

  /* ─────────── Impulso ─────────── */
  function canDash(){
    var p = run.player;
    return !run.over && p.dashCharges > 0 && p.dashCd <= 0;
  }
  function dash(dx, dy){
    var p = run.player;
    if (!canDash()){
      logMsg({ es:T('dashNotReady', p.dashCd), en:T('dashNotReady', p.dashCd) }, 'info');
      SFX.play('error');
      return false;
    }
    if (!dx && !dy) return false;
    var range = CFG.BAL.dashRange;
    var lastOk = null, passed = [];
    for (var i = 1; i <= range; i++){
      var nx = p.x + dx * i, ny = p.y + dy * i;
      if (!walkable(nx, ny)) break;
      if (run.tiles[idx(nx,ny)] === TL.LAVA) break;
      var a = actorAt(nx, ny);
      if (a && a.hostile){ passed.push(a); continue; }   // lo saltas
      lastOk = { x:nx, y:ny };
    }
    if (!lastOk){ SFX.play('error'); return false; }

    p.dashCharges--;
    if (p.dashCharges <= 0) p.dashCd = p.dashCdMax;
    p.dashing = 0.22;
    p.px = p.x; p.py = p.y;
    FX.smoke(p.x, p.y, '#8ee7ff');
    p.x = lastOk.x; p.y = lastOk.y;
    FX.ring(p.x, p.y, 1.8, '#8ee7ff', 0.3);
    SFX.play('dash');
    Util.vibrate(18);
    run.distDirty = true;

    /* Atravesar enemigos los corta: el impulso es ofensivo y defensivo. */
    for (var k = 0; k < passed.length; k++){
      dealDamage(passed[k], Math.max(1, Math.round(p.s.atk * 0.7)), 'fisico', { color:'#8ee7ff' });
      applyStatus(passed[k], 'sangrado', 3, Math.max(1, Math.round(p.s.atk * 0.15)));
    }
    hook('onDash', {});
    pickupAt(p.x, p.y);
    advanceTime(1);
    return true;
  }

  /* ─────────── Habilidad de clase ─────────── */
  function useAbility(){
    var p = run.player;
    var ab = p.cls.ability;
    if (!ab){ SFX.play('error'); return false; }
    if (p.abilityCd > 0){ SFX.play('error'); return false; }

    if (ab.id === 'alzar'){
      summonAlly('esqueleto_aliado', 1);
      p.abilityCd = ab.cd;
      FX.screenFlash('#c77dff', 0.18, 0.18);
      logMsg({ es:'Un esqueleto responde.', en:'A skeleton answers.' }, 'epic');
      advanceTime(1);
      return true;
    }

    /* Saeta arcana: apunta sola al enemigo visible más cercano.
       Apuntar a mano en un móvil es fricción pura. */
    var list = ctxFor().allEnemies().filter(function(e){
      return visibleAt(e.x, e.y) && Util.cheb(e.x, e.y, p.x, p.y) <= ab.range &&
             Dungeon.los(run.tiles, p.x, p.y, e.x, e.y);
    });
    if (!list.length){
      logMsg({ es:'No hay blanco a la vista.', en:'No target in sight.' }, 'info');
      SFX.play('error');
      return false;
    }
    list.sort(function(a, b){ return Util.cheb(a.x,a.y,p.x,p.y) - Util.cheb(b.x,b.y,p.x,p.y); });
    var tgt = list[0];
    p.abilityCd = ab.cd;
    p.facing = tgt.x >= p.x ? 1 : -1;
    FX.bolt(p.x, p.y, tgt.x, tgt.y, '#9ad4ff', 0.2, 'beam');
    SFX.play('magicBolt');
    FX.kick(0.3);
    playerAttack(tgt, { mul:ab.dmg, noCrit:false });
    advanceTime(1);
    return true;
  }

  /* ─────────── Definitivo ─────────── */
  function useUlt(){
    var p = run.player;
    if (p.ultCharge < 100){
      logMsg({ es:T('ultNotReady', Math.floor(p.ultCharge)), en:T('ultNotReady', Math.floor(p.ultCharge)) }, 'info');
      SFX.play('error');
      return false;
    }
    p.ultCharge = 0;
    p.ultUsed++;
    SFX.play('ult');
    FX.kick(1.1); FX.stop(0.12);
    Util.vibrate([20, 30, 60]);

    var id = p.cls.ult;
    var list, i;
    if (id === 'torbellino'){
      FX.ring(p.x, p.y, 2.6, '#ffd166', 0.5, 0.2);
      FX.screenFlash('#ffd166', 0.3, 0.2);
      list = ctxFor().enemiesInRadius(2);
      for (i = 0; i < list.length; i++) playerAttack(list[i], { mul:2.2, noCrit:false });
    } else if (id === 'sed'){
      applyBuff('furia', 6, 0);
      addTempMod('lifesteal', 0.35, 6);
      FX.screenFlash('#ff2d55', 0.3, 0.3);
    } else if (id === 'nova'){
      FX.ring(p.x, p.y, 3.6, '#c77dff', 0.6, 0.22);
      FX.screenFlash('#c77dff', 0.35, 0.25);
      list = ctxFor().enemiesInRadius(3);
      for (i = 0; i < list.length; i++){
        dealDamage(list[i], Math.round(p.s.atk * 2.6), 'arcano', { color:'#c77dff' });
        applyStatus(list[i], 'congelado', 2, 0);
      }
    } else if (id === 'baluarte'){
      addShield(Math.round(p.s.maxHp * 0.6));
      applyBuff('reflejo', 6, 0);
      applyBuff('piedra', 6, 0);
      /* provocar: todos vienen a por ti, y a por tus púas */
      list = ctxFor().allEnemies();
      for (i = 0; i < list.length; i++) list[i].alert = 14;
    } else if (id === 'sombras'){
      applyBuff('invisible', 5, 0);
      p.shadowStrike = 4;
      FX.smoke(p.x, p.y, '#3a2a5a');
    } else if (id === 'ejercito'){
      summonAlly('espiritu', 3);
      summonAlly('esqueleto_aliado', 1);
      applyBuff('bendicion', 4, 0);
      FX.screenFlash('#9b8cff', 0.35, 0.3);
      FX.ring(p.x, p.y, 3.2, '#c77dff', 0.55, 0.2);
    }
    hook('onUlt', {});
    advanceTime(1);
    return true;
  }

  /* ─────────── Descenso ─────────── */
  function onStairs(){
    var p = run.player;
    return run.tiles[idx(p.x, p.y)] === TL.STAIRS;
  }
  function descend(){
    if (run.over || !onStairs()) return false;
    /* Logro: pasar un piso sin matar a nadie. */
    if (run.floorKills === 0 && run.floor > 0) run.flags.pacifistFloor = 1;
    if (run.floor >= 8 && run.potionsDrunk === 0) run.flags.noPotionFloor8 = 1;

    var p = run.player;
    hook('onDescend', {});
    healPlayer(Math.round(p.s.maxHp * CFG.BAL.descendHeal), 'descenso', true);
    SFX.play('descend');
    return true;
  }

  /* ─────────── Reliquias ─────────── */
  function grantRelic(def){
    if (!def) return null;
    var p = run.player;
    for (var i = 0; i < p.relics.length; i++){
      if (p.relics[i].def.id === def.id){
        if (p.relics[i].stacks < (def.maxStacks || 1)){
          p.relics[i].stacks++;
          recalc(p);
          hook('onRunStart', {});   // deja que se re-inicialice si lo necesita
          return p.relics[i];
        }
        return p.relics[i];
      }
    }
    var inst = { def:def, stacks:1, mem:{} };
    p.relics.push(inst);
    if (run.relicIds.indexOf(def.id) < 0) run.relicIds.push(def.id);
    recalc(p);
    /* onRunStart también se dispara al obtenerla, para que las
       reliquias que dan algo al empezar funcionen si llegan tarde. */
    var fn = def.hooks && def.hooks.onRunStart;
    if (typeof fn === 'function'){
      var c = ctxFor();
      c.stacks = inst.stacks; c.mem = inst.mem; c.floor = run.floor; c.turn = run.turn; c.rng = run.rng;
      try { fn(c); } catch(e){ warnRelic(inst, e); }
    }
    SFX.play('relic');
    FX.glow(p.x, p.y, '#c77dff');
    FX.ring(p.x, p.y, 2.2, '#c77dff', 0.5);
    logMsg({ es:T('pickedRelic', TP(def.name)), en:T('pickedRelic', TP(def.name)) }, 'epic');
    Meta.P.seenRelics[def.id] = 1;
    announceArchetype();
    return inst;
  }
  function announceArchetype(){
    if (typeof Identity === 'undefined') return;
    var arch = Identity.archetype(run.player.relics);
    if (!arch || !arch.tag) return;
    if (arch.tag === run.lastArchTag) return;
    run.lastArchTag = arch.tag;
    var label = Identity.archLabel(arch);
    logMsg({ es:T('archUnlock', label), en:T('archUnlock', label) }, 'epic');
    FX.text(run.player.x, run.player.y, label, '#ffd166', { big:true, life:1.6 });
    if (UI && UI.toast) UI.toast(label);
    SFX.play('unlock');
  }
  function relicCount(){
    return run.player.relics.reduce(function(a, r){ return a + r.stacks; }, 0);
  }
  function hasRelic(id){
    return run.player.relics.some(function(r){ return r.def.id === id; });
  }

  /* ─────────── Fin de partida ─────────── */
  function killPlayer(source){
    if (run.over) return;
    if (run.revivesLeft > 0){
      run.revivesLeft--;
      run.player.hp = Math.max(1, Math.round(run.player.s.maxHp * 0.5));
      run.player.status = {};
      recalc(run.player);
      FX.screenFlash('#7cffb2', 0.5, 0.5);
      FX.ring(run.player.x, run.player.y, 4, '#7cffb2', 0.8);
      SFX.play('levelup');
      logMsg({ es:T('revived'), en:T('revived') }, 'epic');
      return;
    }
    run.over = true;
    run.killedBy = source ? source.name : null;
    run.player.hp = 0;
    SFX.play('death');
    SFX.setLayer('death');
    FX.screenFlash('#ff2d55', 0.6, 0.6);
    FX.kick(1.3);
    Util.vibrate([60, 60, 160]);
    Game.finishRun({ died:true });
  }
  function winRun(){
    if (run.over) return;
    run.over = true;
    run.won = true;
    SFX.play('victory');
    SFX.setLayer('victory');
    FX.screenFlash('#ffd166', 0.6, 0.8);
    Game.finishRun({ won:true });
  }
  function extract(){
    if (run.over) return;
    run.over = true;
    run.extracted = true;
    SFX.play('coin');
    Game.finishRun({ extracted:true });
  }
  function abandon(){
    if (run.over) return;
    run.over = true;
    Game.finishRun({ abandoned:true });
  }

  return {
    get run(){ return run; },
    get player(){ return run && run.player; },
    newRun:newRun, buildFloor:buildFloor, recalc:recalc,
    hook:hook, ctx:ctxFor, logMsg:logMsg,
    tileAt:tileAt, walkable:walkable, actorAt:actorAt, itemAt:itemAt,
    visibleAt:visibleAt, computeFOV:computeFOV, distField:distField,
    applyStatus:applyStatus, applyBuff:applyBuff, addTempMod:addTempMod,
    dealDamage:dealDamage, hurtPlayer:hurtPlayer, healPlayer:healPlayer,
    addShield:addShield, addGold:addGold, gainXp:gainXp, ganaUlt:ganaUlt,
    knockback:knockback, spawnNear:spawnNear, detonate:detonate,
    playerAttack:playerAttack, advanceTime:advanceTime,
    tryMove:tryMove, waitTurn:waitTurn, usePotion:usePotion, useBomb:useBomb,
    canDash:canDash, dash:dash, useAbility:useAbility, useUlt:useUlt,
    onStairs:onStairs, descend:descend,
    grantRelic:grantRelic, relicCount:relicCount, hasRelic:hasRelic,
    killPlayer:killPlayer, winRun:winRun, extract:extract, abandon:abandon,
    revealAmbush:revealAmbush, makeEnemy:makeEnemy
  };
})();
