/* ════════════════════════════════════════════════════════════════════
   90-game.js — orquestación: arranque de partida, entrada, bucle,
   reto diario y resultado compartible.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var Game = (function(){

  var lastResult = null;
  var aimMode = null;          // 'dash' mientras se apunta el impulso
  var autoWalk = null;         // caminata automática del tap-to-move
  var loopLast = 0;
  var running = false;
  var pendingChallenge = null;
  var dirHeld = { up:false, down:false, left:false, right:false };
  var dirChordT = null;
  var DIR_KEYS = {
    arrowup:'up', w:'up', k:'up',
    arrowdown:'down', s:'down', j:'down',
    arrowleft:'left', a:'left', h:'left',
    arrowright:'right', d:'right', l:'right'
  };
  var DIAG_KEYS = {
    home:[-1,-1], pageup:[1,-1], end:[-1,1], pagedown:[1,1],
    y:[-1,-1], u:[1,-1], b:[-1,1], n:[1,1]
  };
  var NUMPAD_DIR = {
    Numpad7:[-1,-1], Numpad8:[0,-1], Numpad9:[1,-1],
    Numpad4:[-1,0], Numpad6:[1,0],
    Numpad1:[-1,1], Numpad2:[0,1], Numpad3:[1,1]
  };

  function rScoreBeats(score, floor, ch){
    if (!ch) return false;
    if (score > ch.score) return true;
    if (score === ch.score && floor > ch.floor) return true;
    return false;
  }

  /* ════════════════════════════════════════════════════════════════
     SEMILLAS
     ════════════════════════════════════════════════════════════════ */
  var SEED_A = ['DRAGON','SOMBRA','HUESO','FUEGO','HIELO','CUERVO','LUNA','ACERO',
                'ABISMO','TORMENTA','CENIZA','VERMIS','ORACULO','TITAN','ESPEJO',
                'RAIZ','SEMILLA','CRIPTA','VELO','ZARZA','ECLIPSE','MARFIL'];
  var SEED_B = ['ROJO','NEGRO','AZUL','GRIS','BLANCO','VERDE','VIOLETA','OXIDO',
                'HUECO','ROTO','ETERNO','PALIDO','MUDO','CIEGO'];
  function randomSeed(){
    var n = Math.floor(Math.random() * 9000) + 1000;
    return SEED_A[Math.floor(Math.random() * SEED_A.length)] + '-' +
           SEED_B[Math.floor(Math.random() * SEED_B.length)] + '-' + n;
  }

  /* ════════════════════════════════════════════════════════════════
     ARRANQUE
     ════════════════════════════════════════════════════════════════ */
  function startRun(cfg){
    SFX.init();
    cancelAutoWalk();
    aimMode = null;
    Render.setAim(null);
    FX.clear();
    UI.clearLog();
    UI.closeAllOverlays();

    var pacts = Meta.activePacts();
    var st = Engine.newRun({
      seed: cfg.seed,
      classId: cfg.classId,
      diff: cfg.diff,
      pacts: pacts,
      isDaily: !!cfg.isDaily,
      isWeekly: !!cfg.isWeekly,
      weekly: cfg.weekly || null,
      challenge: cfg.challenge || null,
      scored: cfg.scored !== false
    });
    if (cfg.challenge) pendingChallenge = cfg.challenge;
    st.floorLog = [];

    /* Reliquias de salida: la clase, el árbol de esencia y el pacto de
       condena. Empezar con algo ya construido engancha más rápido. */
    var startRelics = (st.cls.extraRelic || 0) + Meta.upLvl('eco');
    for (var i = 0; i < startRelics; i++){
      var offers = UI.rollOffers(1);
      if (offers[0]) Engine.grantRelic(offers[0]);
    }
    if (st.pactIds.condena){
      var cursed = RELICS.filter(function(r){ return r.rarity === 'maldita'; });
      st.relicRng.shuffle(cursed);
      for (var c = 0; c < 2 && c < cursed.length; c++) Engine.grantRelic(cursed[c]);
    }
    if (st.weekly && st.weekly.cursedStart){
      var cursedW = RELICS.filter(function(r){ return r.rarity === 'maldita'; });
      st.relicRng.shuffle(cursedW);
      for (var cw = 0; cw < st.weekly.cursedStart && cw < cursedW.length; cw++){
        Engine.grantRelic(cursedW[cw]);
      }
    }

    Engine.buildFloor(1);
    Engine.logMsg({ es:T('seedIs', cfg.seed), en:T('seedIs', cfg.seed) }, 'epic');
    Engine.logMsg({ es:T('wakeUp'), en:T('wakeUp') }, 'info');
    var wisp0 = Identity.whisper(st.biome.id, false, st.rng);
    if (wisp0) Engine.logMsg(wisp0, 'info');
    if (st.weekly) Engine.logMsg({ es:st.weekly.icon + ' ' + TP(st.weekly.name), en:st.weekly.icon + ' ' + TP(st.weekly.name) }, 'epic');

    UI.resetTutorial();
    UI.showScreen('game');
    UI.syncHUD();
    Render.resize();
    Render.frame(0, true);
    SFX.setLayer('dungeon');
    SFX.startMusic();
    SFX.setIntensity(st.biome.music * 0.6);
    UI.tutorialTick('start');
    start();
  }

  function startDaily(scored){
    if (scored && Meta.dailyPlayedToday()){
      UI.toast(T('dailyDone'));
      return;
    }
    var P = Meta.P;
    startRun({
      seed: Meta.dailySeed(),
      classId: Meta.classUnlocked(P.lastClass) ? P.lastClass : 'vagabundo',
      diff: P.diff || 'maldito',
      isDaily: true,
      scored: !!scored
    });
  }

  function startWeekly(scored){
    if (scored && Meta.weeklyPlayedThisWeek()){
      UI.toast(T('weeklyDone'));
      return;
    }
    var P = Meta.P;
    var w = Identity.weeklyOf();
    startRun({
      seed: Identity.weeklySeed(),
      classId: Meta.classUnlocked(P.lastClass) ? P.lastClass : 'vagabundo',
      diff: P.diff || 'maldito',
      isWeekly: true,
      weekly: w,
      scored: !!scored
    });
  }

  function retrySameSeed(){
    if (!lastResult) return;
    startRun({
      seed: lastResult.seed,
      classId: lastResult.classId,
      diff: lastResult.diff
    });
  }

  /* ════════════════════════════════════════════════════════════════
     DESCENSO — el ritmo de recompensa de la partida
     ════════════════════════════════════════════════════════════════ */
  function doDescend(){
    var st = Engine.run;
    if (!st || st.over) return;
    if (!Engine.onStairs()){
      UI.toast(T('findStairs'));
      SFX.play('error');
      return;
    }
    if (!Engine.descend()) return;

    var wasBoss = st.isBossFloor;
    st.floorLog.push({ floor:st.floor, boss:wasBoss, cleared:true });
    UI.tutorialTick('descend');

    var next = st.floor + 1;

    /* Secuencia: reliquia → (santuario si veníamos de jefe) → piso. */
    UI.openRelicChoice('piso', { onDone:function(){
      if (wasBoss){
        UI.openSanctuary(function(){ enterFloor(next); });
      } else {
        enterFloor(next);
      }
    }});
  }

  function enterFloor(n){
    var st = Engine.run;
    if (!st || st.over) return;
    Engine.buildFloor(n);
    FX.clear();
    Engine.logMsg({ es:T('descended', n), en:T('descended', n) }, 'epic');
    var wisp = Identity.whisper(st.biome.id, CFG.isBossFloor(n), st.rng);
    if (wisp) Engine.logMsg(wisp, 'info');
    if (CFG.isBossFloor(n)){
      Engine.logMsg({ es:T('bossWarn'), en:T('bossWarn') }, 'bad');
      SFX.play('bossRoar');
      SFX.setLayer('boss');
      FX.screenFlash('#ff2d55', 0.25, 0.5);
    } else {
      SFX.setLayer('dungeon');
    }
    SFX.setIntensity(st.biome.music * 0.6);
    UI.syncHUD();
    Render.frame(0, true);
  }

  /* ════════════════════════════════════════════════════════════════
     FIN DE PARTIDA
     ════════════════════════════════════════════════════════════════ */
  function previewEssence(forExtract){
    var st = Engine.run;
    if (!st) return 0;
    var base = CFG.BAL.essence({
      floor: st.floor, level: st.player.level, kills: st.kills,
      gold: st.player.gold, relicCount: Engine.relicCount()
    });
    var mul = st.diffDef.essMul * (1 + st.pactBonus) * (1 + Meta.upLvl('cos') * 0.08);
    if (forExtract) mul *= CFG.BAL.extractMul(st.floor);
    return Math.round(base * mul);
  }

  function finishRun(how){
    var st = Engine.run;
    if (!st) return;
    stop();
    cancelAutoWalk();
    UI.closeAllOverlays();
    UI.hideTut();
    st.elapsed = Date.now() - st.startedAt;

    var bossCount = 0;
    for (var b in st.bossesKilled) bossCount += st.bossesKilled[b];

    var base = CFG.BAL.essence({
      floor: st.floor, level: st.player.level, kills: st.kills,
      gold: st.player.gold, relicCount: Engine.relicCount()
    });
    var mul = st.diffDef.essMul * (1 + st.pactBonus) * (1 + Meta.upLvl('cos') * 0.08);
    if (how.extracted) mul *= CFG.BAL.extractMul(st.floor);
    if (how.won) mul *= 2;
    if (how.abandoned) mul *= 0.5;

    var score = CFG.BAL.score({
      floor: st.floor, kills: st.kills, gold: st.goldEarned,
      level: st.player.level, bossKills: bossCount,
      won: !!how.won, relicCount: Engine.relicCount()
    });
    score = Math.round(score * st.diffDef.scoreMul * (1 + st.pactBonus));

    var r = {
      seed: st.seed, isDaily: st.isDaily, scored: st.scored,
      classId: st.classId, diff: st.diff,
      floor: st.floor, level: st.player.level, kills: st.kills,
      gold: st.player.gold, maxGold: st.maxGold,
      turns: st.turn, elapsed: st.elapsed,
      relicCount: Engine.relicCount(),
      relicIds: st.relicIds.slice(),
      relicsDetail: st.player.relics.map(function(i){
        return { id:i.def.id, icon:i.def.icon, rarity:i.def.rarity, stacks:i.stacks };
      }),
      bossesKilled: st.bossesKilled, bossKills: bossCount,
      won: !!how.won, extracted: !!how.extracted, died: !!how.died,
      abandoned: !!how.abandoned,
      killedBy: st.killedBy,
      pactCount: st.pacts.length,
      pacts: st.pacts.map(function(p){ return p.id; }),
      flags: st.flags,
      floorLog: st.floorLog.slice(),
      essence: Math.round(base * mul),
      score: score,
      dayNumber: st.isDaily ? Util.dayNumber() : null,
      isWeekly: !!st.isWeekly,
      maxCombo: st.maxCombo || 0,
      beatChallenge: !!(pendingChallenge && rScoreBeats(score, st.floor, pendingChallenge) && !how.abandoned)
    };
    var arch = Identity.archetype(st.player.relics);
    r.archLabel = Identity.archLabel(arch);
    r.archTag = arch && arch.tag;
    r.epithet = Identity.titleFor(r);
    r.deathLine = how.died ? Identity.deathLine(st.rng) : null;
    r.isRecord = r.score > Meta.P.bestScore || r.floor > Meta.P.best;

    lastResult = r;

    if (r.scored){
      var got = Meta.recordRun(r);
      if (st.isDaily) Meta.recordDaily(r);
      if (st.isWeekly) Meta.recordWeekly(r);
      got.forEach(UI.achToast);
      if (r.beatChallenge) UI.toast(T('challengeBeat'));
      else if (pendingChallenge && r.scored && !how.abandoned) UI.toast(T('challengeLost'));
    }
    pendingChallenge = null;

    SFX.setIntensity(0);
    setTimeout(function(){
      UI.showResult(r);
      if (r.isRecord && r.scored) SFX.play('newBest');
    }, how.died ? 700 : 350);
  }

  /* ════════════════════════════════════════════════════════════════
     RESULTADO COMPARTIBLE
     La rejilla de emojis es lo que hace que un resultado se pueda
     pegar en cualquier chat sin captura y siga contando la historia:
     cada casilla es un piso, el amarillo un jefe, el rojo donde caíste.
     ════════════════════════════════════════════════════════════════ */
  function floorGrid(r){
    var out = '';
    var total = Math.max(1, r.floor);
    for (var f = 1; f <= total; f++){
      var isBoss = CFG.isBossFloor(f);
      var cleared = f < r.floor || r.won || r.extracted;
      if (f === r.floor && r.died) out += '🟥';
      else if (isBoss && cleared) out += '🟨';
      else if (cleared) out += '🟩';
      else out += '⬛';
      /* Un salto de línea cada 10 pisos: así no se rompe en móvil. */
      if (f % 10 === 0 && f < total) out += '\n';
    }
    return out;
  }

  function shareText(r){
    if (!r) return '';
    var cls = CFG.classById(r.classId);
    var diff = CFG.diffById(r.diff);
    var head = r.isDaily
      ? '🌱 SEMILLA MALDITA · ' + T('dailyNum', r.dayNumber || Util.dayNumber())
      : r.isWeekly
        ? '☠️ SEMILLA MALDITA · ' + T('weeklyNum', Identity.weekNumber())
        : '🌱 SEMILLA MALDITA';
    var lines = [head];
    if (r.archLabel) lines.push(r.archLabel + (r.epithet ? ' · ' + TP(r.epithet) : ''));
    lines.push(cls.icon + ' ' + TP(cls.name) + ' · ' + T(diff.nameKey) +
               (r.pactCount ? ' · 📜' + r.pactCount : '') +
               (r.maxCombo >= 3 ? ' · ⚔️x' + r.maxCombo : ''));
    lines.push(T('floor') + ' ' + r.floor + ' · ' + T('lvl') + ' ' + r.level + ' · ☠ ' + r.kills +
               (r.won ? ' · 🏆' : r.extracted ? ' · 🏃' : ''));
    lines.push(floorGrid(r));
    var tail = '🏆 ' + Util.fmtFull(r.score);
    if (r.isDaily && Meta.P.daily.streak > 1) tail += '   🔥 ' + Meta.P.daily.streak;
    lines.push(tail);
    if (!r.isDaily) lines.push('🔑 ' + r.seed);
    lines.push(shareUrl(r));
    return lines.join('\n');
  }

  function shareUrl(r){
    try {
      var base = location.origin && location.origin.indexOf('http') === 0
        ? location.origin + location.pathname : '';
      if (!base) return '';
      return base + (r.isDaily ? '?d=1' : '?s=' + encodeURIComponent(r.seed));
    } catch(e){ return ''; }
  }

  function share(r){
    var txt = shareText(r);
    if (!txt) return;
    var done = function(){ UI.toast(T('copied')); SFX.play('coin'); };
    try {
      if (navigator.share){
        navigator.share({ title:'Semilla Maldita', text:txt })
          .catch(function(){ copy(txt, done); });
        return;
      }
    } catch(e){}
    copy(txt, done);
  }

  function shareChallenge(r){
    if (!r) return;
    var q = Identity.challengeQuery(r);
    var url = '';
    try {
      var base = location.origin && location.origin.indexOf('http') === 0
        ? location.origin + location.pathname : '';
      url = base ? (base + (base.indexOf('?') >= 0 ? '&' : '?') + q) : q;
    } catch(e){ url = q; }
    var txt = (r.archLabel ? r.archLabel + '\n' : '') +
      T('challengeIntro', Util.fmt(r.score), r.floor) + '\n' + url;
    var done = function(){ UI.toast(T('copied')); SFX.play('coin'); };
    try {
      if (navigator.share){
        navigator.share({ title:'Semilla Maldita', text:txt, url:url }).catch(function(){ copy(txt, done); });
        return;
      }
    } catch(e){}
    copy(txt, done);
  }

  function acceptChallenge(){
    if (!pendingChallenge) return;
    var ch = pendingChallenge;
    startRun({
      seed: ch.seed,
      classId: Meta.classUnlocked(ch.classId) ? ch.classId : 'vagabundo',
      diff: ch.diff || 'maldito',
      challenge: ch
    });
  }
  function copy(txt, done){
    try {
      navigator.clipboard.writeText(txt).then(done, function(){ fallbackCopy(txt, done); });
    } catch(e){ fallbackCopy(txt, done); }
  }
  function fallbackCopy(txt, done){
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch(e){ UI.toast(txt.split('\n')[2] || ''); }
  }

  /* ════════════════════════════════════════════════════════════════
     ENTRADA
     ════════════════════════════════════════════════════════════════ */
  function canAct(){
    return Engine.run && !Engine.run.over && UI.screen() === 'game' && !UI.blocking();
  }

  function move(dx, dy){
    dx = Util.sign(dx); dy = Util.sign(dy);
    if (!dx && !dy) return;
    if (!canAct()) return;
    cancelAutoWalk();
    if (aimMode === 'dash'){
      setAim(null);
      Engine.dash(dx, dy);
      UI.syncHUD();
      return;
    }
    var before = Engine.run.kills;
    var target = Engine.actorAt(Engine.player.x + dx, Engine.player.y + dy, true);
    Engine.tryMove(dx, dy);
    UI.tutorialTick(target ? 'attack' : 'move');
    if (Engine.run.kills > before) UI.flushAchievements();
    UI.syncHUD();
    checkWindupHint();
  }

  /** La primera vez que un enemigo telegrafía, el tutorial lo explica. */
  function checkWindupHint(){
    var list = Engine.run.actors;
    for (var i = 0; i < list.length; i++){
      if (list[i].windup && Engine.visibleAt(list[i].x, list[i].y)){
        UI.tutorialTick('windup');
        return;
      }
    }
  }

  function setAim(kind){
    aimMode = kind;
    el('btnDash').classList.toggle('aiming', kind === 'dash');
    if (!kind){ Render.setAim(null); return; }
    var p = Engine.player, tiles = [];
    Dungeon.DIRS8.forEach(function(d){
      for (var i = 1; i <= CFG.BAL.dashRange; i++){
        var nx = p.x + d[0] * i, ny = p.y + d[1] * i;
        if (!Engine.walkable(nx, ny)) break;
        tiles.push({ x:nx, y:ny });
      }
    });
    Render.setAim({ kind:kind, tiles:tiles });
  }
  var el = Util.el;

  function toggleDashAim(){
    if (!canAct()) return;
    if (!Engine.canDash()){ SFX.play('error'); UI.toast(T('dashNotReady', Engine.player.dashCd)); return; }
    setAim(aimMode === 'dash' ? null : 'dash');
    SFX.play('uiClick');
  }

  /* ─────────── Caminata automática (tap-to-move) ─────────── */
  function cancelAutoWalk(){
    if (autoWalk){
      clearTimeout(autoWalk.timer);
      autoWalk = null;
      Render.setPathPreview(null);
    }
  }

  function threatCount(){
    var list = Engine.ctx().allEnemies(), n = 0;
    for (var i = 0; i < list.length; i++){
      if (Engine.visibleAt(list[i].x, list[i].y)) n++;
    }
    return n;
  }

  function walkTo(tx, ty){
    if (!canAct()) return;
    cancelAutoWalk();
    var p = Engine.player;

    /* Toque sobre un enemigo adyacente: atacar directamente. */
    var dx = tx - p.x, dy = ty - p.y;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy)){
      move(Util.sign(dx), Util.sign(dy));
      return;
    }
    if (tx === p.x && ty === p.y){ Engine.waitTurn(); UI.syncHUD(); return; }
    if (!Engine.walkable(tx, ty)) return;

    var path = Dungeon.findPath(p.x, p.y, tx, ty,
      function(x, y){
        if (!Engine.walkable(x, y)) return true;
        var a = Engine.actorAt(x, y);
        return !!(a && a.hostile);
      },
      function(x, y){
        var t = Engine.tileAt(x, y);
        if (t === CFG.T.LAVA) return 40;
        if (t === CFG.T.SPIKES) return 12;
        if (t === CFG.T.WATER) return 2;
        if (t === CFG.T.WEB) return 3;
        return 0;
      }, true);

    if (!path || !path.length){ SFX.play('error'); return; }
    Render.setPathPreview(path);
    autoWalk = { path:path, i:0, threats:threatCount(), hp:p.hp, timer:null };
    stepAutoWalk();
  }

  function stepAutoWalk(){
    if (!autoWalk || !canAct()){ cancelAutoWalk(); return; }
    var p = Engine.player;
    /* Interrupciones: nuevo enemigo a la vista o daño recibido.
       Sin esto, el auto-camino te mata. */
    if (threatCount() > autoWalk.threats || p.hp < autoWalk.hp){
      cancelAutoWalk();
      UI.syncHUD();
      return;
    }
    var next = autoWalk.path[autoWalk.i++];
    if (!next){ cancelAutoWalk(); UI.syncHUD(); return; }
    var ddx = Util.sign(next.x - p.x), ddy = Util.sign(next.y - p.y);
    if (!ddx && !ddy){ cancelAutoWalk(); return; }
    Engine.tryMove(ddx, ddy);
    UI.syncHUD();
    if (!autoWalk) return;
    autoWalk.hp = Math.min(autoWalk.hp, p.hp);
    Render.setPathPreview(autoWalk.path.slice(autoWalk.i));
    autoWalk.timer = setTimeout(stepAutoWalk, Meta.opt('reduceMotion') ? 40 : 85);
  }

  /* ─────────── Enlaces de entrada ─────────── */
  function bindInput(){
    /* D-pad con repetición al mantener pulsado */
    Util.qsa('.dbtn[data-dir]').forEach(function(btn){
      var parts = btn.getAttribute('data-dir').split(',');
      var dx = +parts[0], dy = +parts[1];
      var rep = null, hold = null;
      function down(ev){
        ev.preventDefault();
        move(dx, dy);
        hold = setTimeout(function(){
          rep = setInterval(function(){ if (canAct()) move(dx, dy); else up(); }, 125);
        }, 330);
      }
      function up(){
        clearTimeout(hold); clearInterval(rep);
        hold = rep = null;
      }
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });

    Util.tap(Util.el('btnWait'), function(){
      if (!canAct()) return;
      cancelAutoWalk();
      Engine.waitTurn();
      UI.syncHUD();
    });
    Util.tap(Util.el('btnPotion'), function(){
      if (!canAct()) return;
      cancelAutoWalk();
      Engine.usePotion();
      UI.syncHUD();
    });
    Util.tap(Util.el('btnDash'), toggleDashAim);
    Util.tap(Util.el('btnAbility'), function(){
      if (!canAct()) return;
      cancelAutoWalk();
      if (Engine.player.cls.ability) Engine.useAbility();
      else Engine.useBomb();
      UI.syncHUD();
    });
    Util.tap(Util.el('btnUlt'), function(){
      if (!canAct()) return;
      cancelAutoWalk();
      Engine.useUlt();
      UI.syncHUD();
    });
    Util.tap(Util.el('btnDescend'), function(){
      if (!canAct()) return;
      cancelAutoWalk();
      doDescend();
    });

    /* Gestos y toques en el lienzo */
    var wrap = Util.el('canvasWrap');
    var tsx = 0, tsy = 0, tst = 0, tracking = false, moved = false;
    wrap.addEventListener('pointerdown', function(ev){
      if (!canAct()) return;
      tracking = true; moved = false;
      tsx = ev.clientX; tsy = ev.clientY; tst = Date.now();
    });
    wrap.addEventListener('pointermove', function(ev){
      if (!tracking) return;
      if (Math.abs(ev.clientX - tsx) > 10 || Math.abs(ev.clientY - tsy) > 10) moved = true;
    });
    wrap.addEventListener('pointerup', function(ev){
      if (!tracking) return;
      tracking = false;
      if (!canAct()) return;
      var dx = ev.clientX - tsx, dy = ev.clientY - tsy;
      var adx = Math.abs(dx), ady = Math.abs(dy);
      var TH = 26;

      if (adx < TH && ady < TH && !moved){
        /* Toque: caminar hasta ahí, o esperar si está desactivado. */
        if (Meta.opt('tapMove')){
          var t = Render.tileFromScreen(ev.clientX, ev.clientY);
          walkTo(t.x, t.y);
        } else {
          Engine.waitTurn();
          UI.syncHUD();
        }
        return;
      }
      if (adx < TH && ady < TH) return;
      /* Octantes de 45°: tan(22.5°) ≈ 0.414. Igual que el melee enemigo. */
      var OCT = 0.414;
      var mx = 0, my = 0;
      if (adx >= ady * OCT) mx = dx > 0 ? 1 : -1;
      if (ady >= adx * OCT) my = dy > 0 ? 1 : -1;
      if (mx || my) move(mx, my);
    });
    wrap.addEventListener('pointercancel', function(){ tracking = false; });

    /* Teclado: el juego debe ser cómodo también con dos manos y monitor. */
    function vecFromHeld(){
      return [
        (dirHeld.right ? 1 : 0) - (dirHeld.left ? 1 : 0),
        (dirHeld.down ? 1 : 0) - (dirHeld.up ? 1 : 0)
      ];
    }
    function fireHeldDir(){
      var v = vecFromHeld();
      if (v[0] || v[1]) move(v[0], v[1]);
    }
    function clearDirChord(){
      if (dirChordT){ clearTimeout(dirChordT); dirChordT = null; }
    }
    function resetDirHeld(){
      clearDirChord();
      dirHeld.up = dirHeld.down = dirHeld.left = dirHeld.right = false;
    }

    window.addEventListener('keydown', function(ev){
      if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;

      if (ev.key === 'Escape'){
        if (UI.blocking()){ UI.closeAllOverlays(); if (Engine.run) SFX.setIntensity(Engine.run.biome.music); }
        else if (UI.screen() === 'game') UI.openPause();
        else { UI.buildMenu(); UI.showScreen('menu'); }
        ev.preventDefault();
        return;
      }
      if (UI.screen() !== 'game' || UI.blocking()) return;

      var k = ev.key.toLowerCase();
      if (NUMPAD_DIR[ev.code]){
        ev.preventDefault();
        move(NUMPAD_DIR[ev.code][0], NUMPAD_DIR[ev.code][1]);
        return;
      }
      if (ev.code === 'Numpad5'){
        ev.preventDefault();
        if (canAct()){ cancelAutoWalk(); Engine.waitTurn(); UI.syncHUD(); }
        return;
      }
      if (DIAG_KEYS[k]){ ev.preventDefault(); move(DIAG_KEYS[k][0], DIAG_KEYS[k][1]); return; }

      var slot = DIR_KEYS[k];
      if (slot){
        ev.preventDefault();
        if (ev.repeat){
          if (!dirChordT) fireHeldDir();
          return;
        }
        dirHeld[slot] = true;
        var v = vecFromHeld();
        if (v[0] && v[1]){
          clearDirChord();
          move(v[0], v[1]);
          return;
        }
        clearDirChord();
        dirChordT = setTimeout(function(){
          dirChordT = null;
          fireHeldDir();
        }, 45);
        return;
      }
      if (k === ' ' || k === '.'){ ev.preventDefault(); if (canAct()){ cancelAutoWalk(); Engine.waitTurn(); UI.syncHUD(); } return; }
      if (k === 'q' || k === '1'){ ev.preventDefault(); if (canAct()){ Engine.usePotion(); UI.syncHUD(); } return; }
      if (k === 'e' || k === '2'){ ev.preventDefault(); toggleDashAim(); return; }
      if (k === 'f' || k === '3'){ ev.preventDefault(); if (canAct()){ if (Engine.player.cls.ability) Engine.useAbility(); else Engine.useBomb(); UI.syncHUD(); } return; }
      if (k === 'r' || k === '4'){ ev.preventDefault(); if (canAct()){ Engine.useUlt(); UI.syncHUD(); } return; }
      if (k === '>' || k === 'enter' || k === 'x'){ ev.preventDefault(); if (canAct()) doDescend(); return; }
    });
    window.addEventListener('keyup', function(ev){
      if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
      var slot = DIR_KEYS[ev.key.toLowerCase()];
      if (!slot) return;
      if (dirChordT && dirHeld[slot]){
        clearDirChord();
        var v = vecFromHeld();
        dirHeld[slot] = false;
        if (v[0] || v[1]) move(v[0], v[1]);
        return;
      }
      dirHeld[slot] = false;
    });
    window.addEventListener('blur', resetDirHeld);
  }

  /* ════════════════════════════════════════════════════════════════
     BUCLE
     ════════════════════════════════════════════════════════════════ */
  function start(){
    running = true;
    loopLast = performance.now();
  }
  function stop(){ running = false; }

  function loop(t){
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - loopLast) / 1000);
    loopLast = t;
    if (!running) return;
    if (UI.screen() !== 'game') return;
    if (!Engine.run || !Engine.run.tiles) return;

    FX.update(dt);
    Render.frame(dt, false);

    /* Música adaptativa: sube con la amenaza real en pantalla. */
    musicAcc += dt;
    if (musicAcc > 0.4){
      musicAcc = 0;
      updateMusicIntensity();
    }
  }
  var musicAcc = 0;

  function updateMusicIntensity(){
    var st = Engine.run;
    if (!st || st.over) return;
    var p = st.player;
    var near = 0, boss = false;
    for (var i = 0; i < st.actors.length; i++){
      var a = st.actors[i];
      if (a.hp <= 0 || !a.hostile) continue;
      if (!st.visible[a.y * CFG.MW + a.x]) continue;
      var d = Util.cheb(a.x, a.y, p.x, p.y);
      if (d <= 7) near += a.isBoss ? 4 : 1;
      if (a.isBoss) boss = true;
    }
    var lowHp = 1 - Util.clamp(p.hp / p.s.maxHp, 0, 1);
    var x = Util.clamp(st.biome.music * 0.35 + Math.min(0.5, near * 0.11) + lowHp * 0.3, 0, 1);
    if (boss) x = Math.max(x, 0.85);
    SFX.setIntensity(x);
  }

  /* ════════════════════════════════════════════════════════════════
     INICIO
     ════════════════════════════════════════════════════════════════ */
  function boot(){
    Meta.load();
    Meta.applyBodyClasses();
    SFX.setMuted(!Meta.opt('sfx'));
    SFX.setMusicEnabled(!!Meta.opt('music'));

    Render.init();
    UI.init();
    bindInput();
    UI.buildMenu();
    UI.showScreen('menu');

    /* Semilla desde la URL: así un enlace compartido abre esa mazmorra. */
    var params = new URLSearchParams(location.search);
    var s = params.get('s') || params.get('seed');
    var daily = params.get('d');
    if (s){
      Util.el('seedInput').value = s.toUpperCase().replace(/[^A-Z0-9\-_]/g, '').slice(0, 24);
    } else {
      Util.el('seedInput').value = randomSeed();
    }
    if (daily){
      UI.buildDaily();
      UI.showScreen('daily');
    }
    var ch = Identity.parseChallenge(params);
    if (ch){
      pendingChallenge = ch;
      Util.el('seedInput').value = ch.seed;
      UI.openChallenge(ch);
    }

    /* Primera visita: invita a instalarlo como app. */
    try {
      var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      if (!standalone && !Meta.opt('seenInstall') && Meta.P.runs >= 1){
        setTimeout(function(){
          UI.toast(T('installHint'));
          Meta.setOpt('seenInstall', true);
        }, 1800);
      }
    } catch(e){}

    /* La música no puede arrancar sin un gesto: la preparamos al primero. */
    var kick = function(){
      SFX.init();
      SFX.setLayer(UI.screen() === 'game' ? 'dungeon' : 'menu');
      SFX.startMusic();
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);

    /* Al volver de segundo plano, el reloj del bucle se habría ido. */
    document.addEventListener('visibilitychange', function(){
      loopLast = performance.now();
      if (document.hidden && Engine.run && !Engine.run.over && UI.screen() === 'game'){
        UI.openPause();
      }
    });

    UI.flushAchievements();
    requestAnimationFrame(loop);
  }

  return {
    boot:boot, startRun:startRun, startDaily:startDaily, startWeekly:startWeekly,
    retrySameSeed:retrySameSeed,
    doDescend:doDescend, finishRun:finishRun, previewEssence:previewEssence,
    shareText:shareText, share:share, shareChallenge:shareChallenge,
    acceptChallenge:acceptChallenge, randomSeed:randomSeed,
    cancelAutoWalk:cancelAutoWalk,
    get lastResult(){ return lastResult; }
  };
})();
