/* ════════════════════════════════════════════════════════════════════
   45-ai.js — comportamiento de los enemigos.

   Dos ideas gobiernan este archivo:

   1) TELEGRAFIADO. Los golpes grandes (flechas, cargas, explosiones,
      invocaciones, hechizos de jefe) se anuncian un turno antes con un
      aviso sobre la cabeza del enemigo. En un juego por turnos, morir
      sin haber podido verlo venir no es dificultad, es mala
      información. Avisar permite subir mucho el daño sin ser injusto,
      y convierte cada turno en una decisión legible.

   2) INTENCIÓN VISIBLE. Además del telegrafiado, cada enemigo publica
      en `e.intent` lo que hará si nada cambia, para que el HUD lo
      muestre. Es lo que permite a alguien que no juega roguelikes
      entender la pelea a la primera.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var AI = (function(){

  var TL = CFG.T;

  function run(){ return Engine.run; }
  function player(){ return Engine.run.player; }

  /* ─────────── Ataque efectivo (con estados) ─────────── */
  function effAtk(e){
    var a = e.atk;
    for (var s in e.status){
      var d = CFG.STATUS[s];
      if (d && d.atkMul) a *= d.atkMul;
    }
    if (e.enraged) a *= 1.15;
    return a;
  }

  /** ¿El jugador es un blanco válido? La invisibilidad lo oculta. */
  function canSeePlayer(e){
    var p = player();
    if (p.buffs.invisible) return false;
    if (Engine.tileAt(p.x, p.y) === TL.GRASS && Util.cheb(e.x, e.y, p.x, p.y) > 1) return false;
    var reach = e.ai === 'sentry' ? (e.range || 7) : 10;
    if (Util.cheb(e.x, e.y, p.x, p.y) > reach) return false;
    if (e.ai === 'phaser') return true;         // el espectro te siente a través del muro
    return Dungeon.los(run().tiles, e.x, e.y, p.x, p.y);
  }

  /* ─────────── Movimiento ─────────── */
  function tileCostFor(e, x, y){
    var t = Engine.tileAt(x, y);
    if (t === TL.LAVA) return e.kind === 'demon' || e.kind === 'hound' || e.isBoss ? 0 : 99;
    if (t === TL.WATER) return 1.5;
    if (t === TL.WEB) return e.kind === 'spider' ? 0 : 2.5;
    if (t === TL.RUBBLE) return 0.6;
    return 0;
  }
  function canStand(e, x, y){
    if (!Dungeon.inBounds(x, y)) return false;
    var t = Engine.tileAt(x, y);
    if (e.ai === 'phaser'){
      /* atraviesa muros pero no abismos */
      if (t === TL.CHASM) return false;
    } else if (CFG.SOLID[t]) return false;
    if (tileCostFor(e, x, y) > 50) return false;
    var p = player();
    if (p.x === x && p.y === y) return false;
    if (Engine.actorAt(x, y)) return false;
    return true;
  }

  /** Un paso hacia el jugador usando el mapa de distancias. */
  function stepToward(e){
    var p = player();
    if (e.ai === 'phaser') return stepGreedy(e, p.x, p.y);
    var field = Engine.distField();
    var here = field[Dungeon.idx(e.x, e.y)];
    var best = null, bestV = here < 0 ? 9999 : here;
    for (var k = 0; k < 8; k++){
      var nx = e.x + Dungeon.DIRS8[k][0], ny = e.y + Dungeon.DIRS8[k][1];
      if (!canStand(e, nx, ny)) continue;
      var v = field[Dungeon.idx(nx, ny)];
      if (v < 0) continue;
      v += tileCostFor(e, nx, ny);
      if (v < bestV){ bestV = v; best = { x:nx, y:ny }; }
    }
    if (!best) return stepGreedy(e, p.x, p.y);
    moveTo(e, best.x, best.y);
    return true;
  }

  /** Paso codicioso: cuando no hay mapa de distancias válido. */
  function stepGreedy(e, tx, ty){
    var dx = Util.sign(tx - e.x), dy = Util.sign(ty - e.y);
    var opts = [];
    if (Math.abs(tx - e.x) >= Math.abs(ty - e.y)) opts.push([dx,0],[0,dy],[dx,dy]);
    else opts.push([0,dy],[dx,0],[dx,dy]);
    for (var i = 0; i < opts.length; i++){
      var nx = e.x + opts[i][0], ny = e.y + opts[i][1];
      if (!opts[i][0] && !opts[i][1]) continue;
      if (canStand(e, nx, ny)){ moveTo(e, nx, ny); return true; }
    }
    return false;
  }

  function stepAway(e){
    var p = player();
    var dx = Util.sign(e.x - p.x), dy = Util.sign(e.y - p.y);
    var opts = [[dx,dy],[dx,0],[0,dy],[dy,dx],[-dy,-dx]];
    for (var i = 0; i < opts.length; i++){
      if (!opts[i][0] && !opts[i][1]) continue;
      var nx = e.x + opts[i][0], ny = e.y + opts[i][1];
      if (canStand(e, nx, ny)){ moveTo(e, nx, ny); return true; }
    }
    return false;
  }

  function wander(e){
    if (!run().rng.chance(0.35)) return false;
    var d = run().rng.pick(Dungeon.DIRS8);
    var nx = e.x + d[0], ny = e.y + d[1];
    if (canStand(e, nx, ny)){ moveTo(e, nx, ny); return true; }
    return false;
  }

  function moveTo(e, x, y){
    e.px = e.x; e.py = e.y;
    if (x !== e.x) e.facing = x > e.x ? 1 : -1;
    e.x = x; e.y = y;
    e.moveT = 0.16;
    /* sangrado: los enemigos también pagan por moverse */
    if (e.status.sangrado){
      Engine.dealDamage(e, Math.max(1, e.status.sangrado.power || 1), 'puro', { color:'#ff4d5e' });
    }
    var t = Engine.tileAt(x, y);
    if (t === TL.SPIKES){
      run().tiles[Dungeon.idx(x,y)] = TL.FLOOR;
      Engine.dealDamage(e, Math.max(2, Math.round(e.maxHp * 0.1)), 'fisico', {});
    }
  }

  /* ─────────── Ataques ─────────── */
  function melee(e){
    var p = player();
    e.facing = p.x >= e.x ? 1 : -1;
    e.facingTo = { x:Util.sign(p.x - e.x), y:Util.sign(p.y - e.y) };
    e.attackT = 0.2;
    var raw = effAtk(e) * run().rng.float(0.9, 1.12);
    var dmg = Math.max(1, Math.round(raw - p.s.def));
    var dealt = Engine.hurtPlayer(dmg, e, {});
    SFX.play('swing');
    FX.sparks((e.x + p.x)/2, (e.y + p.y)/2, '#ff8f6b');
    /* efectos al golpear (araña envenena, etc.) */
    if (dealt > 0 && e.onHit) Engine.applyStatus(p, e.onHit.status, e.onHit.turns, e.onHit.power);
    /* el espectro se alimenta */
    if (dealt > 0 && e.drain){
      e.hp = Math.min(e.maxHp, e.hp + Math.round(dealt * 0.5));
      FX.text(e.x, e.y, '+' + Math.round(dealt * 0.5), '#c77dff', {});
    }
    /* el goblin roba y huye */
    if (dealt > 0 && e.ai === 'thief' && p.gold > 0){
      var steal = Math.min(p.gold, 5 + run().floor * 2);
      p.gold -= steal;
      e.stolen = (e.stolen || 0) + steal;
      e.fleeing = 5;
      FX.text(p.x, p.y, '-' + steal + ' ◈', '#ffd166', {});
      Engine.logMsg({ es:e.name + ' te roba ' + steal + ' de oro.', en:e.name + ' steals ' + steal + ' gold.' }, 'bad');
    }
  }

  function shoot(e, tx, ty){
    var p = player();
    FX.bolt(e.x, e.y, tx, ty, e.kind === 'eye' ? '#c77dff' : '#ffd8a8', 0.18, 'arrow');
    SFX.play('arrow');
    if (tx !== p.x || ty !== p.y) return;       // te movistes: la flecha falla
    var raw = effAtk(e) * 0.9 * run().rng.float(0.9, 1.1);
    var dmg = Math.max(1, Math.round(raw - p.s.def * 0.6));
    Engine.hurtPlayer(dmg, e, {});
  }

  /* ─────────── Telegrafiado ─────────── */
  function windup(e, type, data, label){
    e.windup = { type:type, data:data || null, ready:true };
    e.intent = label || type;
    FX.ring(e.x, e.y, 1.1, '#ffd166', 0.45, 0.1);
    SFX.play('tick', { vol:0.25 });
  }
  function clearWindup(e){ e.windup = null; }

  /** Ejecuta un telegrafiado pendiente. Devuelve true si consumió el turno. */
  function resolveWindup(e){
    var w = e.windup;
    if (!w) return false;
    clearWindup(e);
    var p = player();

    switch (w.type){
      case 'disparar':
        shoot(e, w.data.x, w.data.y);
        return true;

      case 'cargar': {
        var d = w.data;
        var path = [];
        for (var i = 1; i <= d.len; i++){
          var nx = e.x + d.dx * i, ny = e.y + d.dy * i;
          if (!Dungeon.inBounds(nx, ny) || CFG.SOLID[Engine.tileAt(nx, ny)]) break;
          path.push({ x:nx, y:ny });
          if (nx === p.x && ny === p.y) break;
        }
        var hit = false, land = null;
        for (var k = 0; k < path.length; k++){
          if (path[k].x === p.x && path[k].y === p.y){ hit = true; break; }
          if (!Engine.actorAt(path[k].x, path[k].y)) land = path[k];
        }
        if (land){ e.px = e.x; e.py = e.y; e.x = land.x; e.y = land.y; e.moveT = 0.2; }
        FX.kick(0.5);
        SFX.play('dash');
        FX.smoke(e.x, e.y, '#8b8ba7');
        if (hit){
          var raw = effAtk(e) * 1.7;
          Engine.hurtPlayer(Math.max(2, Math.round(raw - p.s.def)), e, {});
          Engine.applyStatus(p, 'aturdido', 1, 0);
          FX.kick(0.9); FX.stop(0.08);
        }
        return true;
      }

      case 'explotar':
        Engine.detonate(e);
        e.hp = 0;
        e.blast = null;                      // ya estalló, no repetir en la muerte
        Engine.dealDamage(e, 9999, 'puro', { silent:true });
        return true;

      case 'invocar': {
        var kinds = e.summons || ['rat'];
        var n = e.isBoss ? 3 : 2;
        for (var s = 0; s < n; s++) Engine.spawnNear(e, run().rng.pick(kinds));
        SFX.play('summon');
        FX.ring(e.x, e.y, 2.4, '#c77dff', 0.5);
        return true;
      }

      case 'curar': {
        var tgt = w.data;
        if (tgt && tgt.hp > 0){
          var amount = Math.round(tgt.maxHp * 0.28);
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount);
          FX.text(tgt.x, tgt.y, '+' + amount, '#7cffb2', {});
          FX.bolt(e.x, e.y, tgt.x, tgt.y, '#7cffb2', 0.3, 'beam');
          SFX.play('heal');
        }
        return true;
      }

      case 'hechizo': {
        /* Maldición a distancia: debilita o ralentiza. */
        var st = run().rng.pick(['debil','lento','marcado']);
        FX.bolt(e.x, e.y, p.x, p.y, '#c77dff', 0.3, 'beam');
        SFX.play('curse');
        Engine.applyStatus(p, st, 4, 0);
        return true;
      }

      case 'pulso': {
        /* Ataque de área de jefe centrado en él. */
        var r = w.data && w.data.r || 2;
        FX.ring(e.x, e.y, r + 0.6, '#ff5d6c', 0.6, 0.24);
        FX.kick(1.0); FX.stop(0.1);
        SFX.play('explode');
        if (Util.cheb(e.x, e.y, p.x, p.y) <= r){
          Engine.hurtPlayer(Math.max(3, Math.round(effAtk(e) * 1.4 - p.s.def)), e, {});
        }
        return true;
      }

      case 'volea': {
        /* Tres proyectiles: al jugador y a sus lados. */
        var base = { x:p.x, y:p.y };
        var spots = [base, { x:base.x + 1, y:base.y }, { x:base.x - 1, y:base.y }];
        for (var v = 0; v < spots.length; v++){
          FX.bolt(e.x, e.y, spots[v].x, spots[v].y, '#ffe066', 0.22, 'arrow');
          if (spots[v].x === p.x && spots[v].y === p.y){
            Engine.hurtPlayer(Math.max(2, Math.round(effAtk(e) * 0.8 - p.s.def * 0.5)), e, {});
          }
        }
        SFX.play('arrow');
        return true;
      }
    }
    return false;
  }

  /* ─────────── Predicción para el HUD ─────────── */
  function setIntent(e){
    if (e.windup) return;                        // el telegrafiado ya manda
    var p = player();
    if (!canSeePlayer(e) && e.alert <= 0){ e.intent = e.hidden ? null : 'esperar'; return; }
    var d = Util.cheb(e.x, e.y, p.x, p.y);
    if (e.status.congelado || e.status.aturdido){ e.intent = 'esperar'; return; }
    if (d <= 1 && e.ai !== 'bomber' && e.atk > 0){ e.intent = 'atacar'; return; }
    if ((e.ai === 'ranged' || e.ai === 'sentry' || e.ai === 'boss_ranged') && d <= (e.range || 6)){ e.intent = 'disparar'; return; }
    e.intent = 'mover';
  }

  /* ════════════════════════════════════════════════════════════════
     PUNTO DE ENTRADA — un actor consume su acción
     ════════════════════════════════════════════════════════════════ */
  function act(e){
    if (!e || e.hp <= 0) return;
    var st = run();
    if (st.over) return;
    var p = player();
    var d = Util.cheb(e.x, e.y, p.x, p.y);

    /* aliados invocados */
    if (!e.hostile){ actAlly(e); return; }

    /* el mímico duerme hasta que te acercas */
    if (e.hidden){
      if (d <= 1){ Engine.revealAmbush(e); } else { e.intent = null; }
      return;
    }

    /* telegrafiado pendiente: se resuelve ahora, pase lo que pase */
    if (e.windup){
      resolveWindup(e);
      setIntent(e);
      return;
    }

    /* memoria de alerta */
    if (canSeePlayer(e)) e.alert = e.isBoss ? 99 : 12;
    else if (e.alert > 0) e.alert--;

    if (e.fleeing > 0){
      e.fleeing--;
      if (!stepAway(e)) wander(e);
      e.intent = 'mover';
      return;
    }

    if (e.alert <= 0){
      wander(e);
      e.intent = 'esperar';
      return;
    }

    var handler = HANDLERS[e.ai] || HANDLERS.chaser;
    handler(e, d, p);
    setIntent(e);
  }

  /* ─────────── Comportamientos ─────────── */
  var HANDLERS = {

    chaser: function(e, d){
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    },

    erratic: function(e, d){
      if (d <= 1){ melee(e); return; }
      /* El murciélago no va en línea recta: molesta, y es su identidad. */
      if (run().rng.chance(0.4)){ if (wander(e)) return; }
      stepToward(e);
    },

    thief: function(e, d){
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    },

    splitter: function(e, d){
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    },

    ranged: function(e, d, p){
      if (d <= 1){
        /* demasiado cerca: retrocede en vez de pelear mal */
        if (stepAway(e)) return;
        melee(e);
        return;
      }
      if (d <= (e.range || 6) && Dungeon.los(run().tiles, e.x, e.y, p.x, p.y)){
        windup(e, 'disparar', { x:p.x, y:p.y }, 'disparar');
        return;
      }
      stepToward(e);
    },

    sentry: function(e, d, p){
      /* No se mueve nunca. A cambio ve lejos y avisa a los demás. */
      if (d <= (e.range || 7) && Dungeon.los(run().tiles, e.x, e.y, p.x, p.y)){
        windup(e, 'disparar', { x:p.x, y:p.y }, 'disparar');
        var list = Engine.ctx().allEnemies();
        for (var i = 0; i < list.length; i++){
          if (Util.cheb(list[i].x, list[i].y, e.x, e.y) <= 8) list[i].alert = Math.max(list[i].alert, 8);
        }
        return;
      }
      e.intent = 'esperar';
    },

    charger: function(e, d, p){
      var dx = Util.sign(p.x - e.x), dy = Util.sign(p.y - e.y);
      var aligned = (p.x === e.x || p.y === e.y || Math.abs(p.x - e.x) === Math.abs(p.y - e.y));
      if (d >= 2 && d <= 5 && aligned && Dungeon.los(run().tiles, e.x, e.y, p.x, p.y)){
        windup(e, 'cargar', { dx:dx, dy:dy, len:d + 1 }, 'cargar');
        return;
      }
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    },

    bomber: function(e, d){
      if (d <= 1){
        windup(e, 'explotar', null, 'explotar');
        FX.spawn(e.x, e.y, 8, { color:'#ff8f3f', speed:3, life:0.4, shape:'spark' });
        return;
      }
      stepToward(e);
    },

    summoner: function(e, d, p){
      e.cool = (e.cool || 0) - 1;
      if (e.cool <= 0 && d <= 7 && Dungeon.los(run().tiles, e.x, e.y, p.x, p.y)){
        e.cool = 5;
        windup(e, 'invocar', null, 'invocar');
        return;
      }
      if (d <= 2){ if (stepAway(e)) return; }
      if (d <= 1){ melee(e); return; }
      if (d <= 6 && run().rng.chance(0.3)){ windup(e, 'hechizo', null, 'hechizo'); return; }
      stepToward(e);
    },

    healer: function(e, d, p){
      /* Prioriza curar: obliga al jugador a decidir a quién mata primero. */
      var list = Engine.ctx().allEnemies();
      var best = null, worst = 1;
      for (var i = 0; i < list.length; i++){
        var o = list[i];
        if (o === e || o.hp <= 0) continue;
        var pct = o.hp / o.maxHp;
        if (pct < 0.75 && pct < worst && Util.cheb(o.x, o.y, e.x, e.y) <= (e.range || 5)){
          worst = pct; best = o;
        }
      }
      if (best){ windup(e, 'curar', best, 'curar'); return; }
      if (d <= 2){ if (stepAway(e)) return; }
      if (d <= 1){ melee(e); return; }
      if (d <= (e.range || 5) && Dungeon.los(run().tiles, e.x, e.y, p.x, p.y) && run().rng.chance(0.45)){
        windup(e, 'hechizo', null, 'hechizo');
        return;
      }
      stepToward(e);
    },

    guard: function(e, d, p){
      e.facingTo = { x:Util.sign(p.x - e.x), y:Util.sign(p.y - e.y) };
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    },

    phaser: function(e, d){
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    },

    ambush: function(e, d){
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    },

    /* ─────────── Jefes ─────────── */
    boss_summoner: function(e, d, p){
      e.cool = (e.cool || 0) - 1;
      if (e.cool <= 0 && d <= 8){
        e.cool = 6;
        windup(e, 'invocar', null, 'invocar');
        return;
      }
      if (d <= 1){
        if (run().rng.chance(0.3)){ windup(e, 'pulso', { r:2 }, 'pulso'); return; }
        melee(e); return;
      }
      stepToward(e);
    },

    boss_ranged: function(e, d, p){
      e.cool = (e.cool || 0) - 1;
      if (d <= 1 && run().rng.chance(0.5)){ melee(e); return; }
      if (e.cool <= 0 && d <= 9 && Dungeon.los(run().tiles, e.x, e.y, p.x, p.y)){
        e.cool = 3;
        windup(e, run().rng.chance(0.35) ? 'invocar' : 'volea', null, null);
        return;
      }
      if (d > 5) stepToward(e);
      else if (d < 3) stepAway(e);
      else e.intent = 'esperar';
    },

    boss_charger: function(e, d, p){
      var dx = Util.sign(p.x - e.x), dy = Util.sign(p.y - e.y);
      var aligned = (p.x === e.x || p.y === e.y || Math.abs(p.x - e.x) === Math.abs(p.y - e.y));
      if (d >= 2 && d <= 7 && aligned){
        windup(e, 'cargar', { dx:dx, dy:dy, len:d + 2 }, 'cargar');
        return;
      }
      if (d <= 1){
        if (run().rng.chance(0.35)){ windup(e, 'pulso', { r:2 }, 'pulso'); return; }
        melee(e); return;
      }
      stepToward(e);
    },

    boss_teleport: function(e, d, p){
      e.cool = (e.cool || 0) - 1;
      if (d > 2 && e.cool <= 0){
        /* Aparece pegado a ti: no hay huida, sólo gestión. */
        e.cool = 4;
        for (var k = 0; k < 8; k++){
          var nx = p.x + Dungeon.DIRS8[k][0], ny = p.y + Dungeon.DIRS8[k][1];
          if (canStand(e, nx, ny)){
            FX.smoke(e.x, e.y, '#c77dff');
            e.px = e.x; e.py = e.y;
            e.x = nx; e.y = ny;
            FX.glow(nx, ny, '#c77dff');
            SFX.play('teleport');
            e.intent = 'atacar';
            return;
          }
        }
      }
      if (d <= 1){
        if (run().rng.chance(0.3)){ windup(e, 'pulso', { r:3 }, 'pulso'); return; }
        melee(e); return;
      }
      stepToward(e);
    },

    boss_final: function(e, d, p){
      e.cool = (e.cool || 0) - 1;
      if (e.cool <= 0){
        e.cool = 3;
        var roll = run().rng.next();
        if (roll < 0.3){ windup(e, 'invocar', null, 'invocar'); return; }
        if (roll < 0.62){ windup(e, 'pulso', { r:3 }, 'pulso'); return; }
        if (roll < 0.85 && Dungeon.los(run().tiles, e.x, e.y, p.x, p.y)){ windup(e, 'volea', null, 'volea'); return; }
      }
      if (d <= 1){ melee(e); return; }
      stepToward(e);
    }
  };

  /* ─────────── Aliados ─────────── */
  function actAlly(a){
    var list = Engine.ctx().allEnemies();
    if (!list.length){ wander(a); return; }
    var best = null, bd = 99;
    for (var i = 0; i < list.length; i++){
      var dd = Util.cheb(list[i].x, list[i].y, a.x, a.y);
      if (dd < bd){ bd = dd; best = list[i]; }
    }
    if (!best) return;
    if (bd <= 1){
      a.attackT = 0.2;
      a.facing = best.x >= a.x ? 1 : -1;
      Engine.dealDamage(best, Math.max(1, Math.round(a.atk - best.def * 0.5)), 'fisico', {});
      SFX.play('hit', { vol:0.5 });
      return;
    }
    stepGreedy(a, best.x, best.y);
  }

  return { act:act, canSeePlayer:canSeePlayer, effAtk:effAtk, setIntent:setIntent };
})();
