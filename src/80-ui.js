/* ════════════════════════════════════════════════════════════════════
   80-ui.js — pantallas, HUD y superposiciones.

   La regla que gobierna este archivo: cada decisión del jugador se
   toma en una pantalla dedicada, con letras grandes y sin prisa. El
   juego es por turnos; la interfaz también debe serlo.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var UI = (function(){

  var el = Util.el, make = Util.make, tap = Util.tap, esc = Util.esc;
  var current = 'menu';
  var openOverlays = {};
  var selClass = 'vagabundo';
  var selDiff = 'maldito';
  var pendingConfirm = null;
  var logLines = [];
  var sancState = null;
  var treeTab = 'up';

  /* ════════════════════════════════════════════════════════════════
     NAVEGACIÓN
     ════════════════════════════════════════════════════════════════ */
  function showScreen(id){
    Util.qsa('.screen').forEach(function(s){ s.classList.remove('active'); });
    var node = el('screen-' + id);
    if (node) node.classList.add('active');
    current = id;
    if (id === 'game') setTimeout(function(){ Render.resize(); }, 30);
  }
  function screen(){ return current; }

  function overlay(id, on){
    var node = el('ov-' + id);
    if (!node) return;
    node.classList.toggle('on', !!on);
    if (on) openOverlays[id] = 1; else delete openOverlays[id];
  }
  function blocking(){
    for (var k in openOverlays) return true;
    return false;
  }
  function closeAllOverlays(){
    for (var k in openOverlays) overlay(k, false);
  }

  /* ─────────── Avisos ─────────── */
  var toastT = null;
  function toast(txt){
    var t = el('toast');
    t.textContent = txt;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function(){ t.classList.remove('on'); }, 1900);
  }
  var achQueue = [], achBusy = false;
  function achToast(a){
    achQueue.push(a);
    if (!achBusy) nextAch();
  }
  function nextAch(){
    if (!achQueue.length){ achBusy = false; return; }
    achBusy = true;
    var a = achQueue.shift();
    var n = el('achToast');
    n.innerHTML = '<span class="ai">' + a.icon + '</span><span><b>' + esc(TP(a.name)) + '</b>' +
                  '<small>+' + a.ess + ' ✦</small></span>';
    n.classList.add('on');
    SFX.play('unlock');
    setTimeout(function(){
      n.classList.remove('on');
      setTimeout(nextAch, 340);
    }, 2400);
  }

  function confirm(msg, onYes){
    el('confirmMsg').textContent = msg;
    pendingConfirm = onYes;
    overlay('confirm', true);
  }

  /* ════════════════════════════════════════════════════════════════
     MENÚ
     ════════════════════════════════════════════════════════════════ */
  function buildMenu(){
    var P = Meta.P;
    Meta.refreshStreak();
    el('menuTagline').textContent = T('tagline');
    el('essTagMenu').textContent = Util.fmt(P.essence);
    el('menuStats').innerHTML =
      T('runs') + ': <b>' + P.runs + '</b> · ' +
      T('best') + ': <b>' + P.best + '</b> · ' +
      T('bestScore') + ': <b>' + Util.fmt(P.bestScore) + '</b><br>' +
      T('totalKills') + ': <b>' + Util.fmt(P.totalKills) + '</b>' +
      (P.wins ? ' · 🌱 <b>' + P.wins + '</b>' : '') +
      (Meta.coreProgress().done ? '<br>' + T('rootMenu') : '');

    var done = Meta.dailyPlayedToday();
    el('dailyBadge').textContent = done ? T('dailyDone') : T('dailyNum', Util.dayNumber());
    var sp = P.daily.streak > 0 ? '🔥 ' + P.daily.streak : '';
    el('streakPill').textContent = sp;
    el('streakPill2').textContent = sp;
    var w = Identity.weeklyOf();
    var wEl = el('weeklyBadge');
    if (wEl) wEl.textContent = Meta.weeklyPlayedThisWeek() ? T('weeklyDone') : (w.icon + ' ' + TP(w.name));
    applyI18nAttrs();
  }

  /** Rellena todos los nodos con data-i18n. Evita duplicar textos. */
  function applyI18nAttrs(){
    Util.qsa('[data-i18n]').forEach(function(n){
      n.textContent = T(n.getAttribute('data-i18n'));
    });
    el('seedInput').placeholder = T('seedPlaceholder');
  }

  /* ════════════════════════════════════════════════════════════════
     ELEGIR ESTIRPE Y DIFICULTAD
     ════════════════════════════════════════════════════════════════ */
  function buildClassScreen(){
    var P = Meta.P;
    selClass = Meta.classUnlocked(P.lastClass) ? P.lastClass : 'vagabundo';
    selDiff = P.diff || 'maldito';
    el('essTagClass').textContent = Util.fmt(P.essence);

    var list = el('classList');
    list.innerHTML = '';
    CFG.CLASSES.forEach(function(c){
      var unlocked = Meta.classUnlocked(c.id);
      var card = make('div', 'listCard' + (unlocked ? '' : ' locked') + (selClass === c.id ? ' sel' : ''));
      card.innerHTML =
        '<div class="lcIcon">' + c.icon + '</div>' +
        '<div class="lcBody">' +
          '<div class="lcName">' + esc(TP(c.name)) +
            (unlocked ? '' : ' <em>' + T('locked') + '</em>') + '</div>' +
          '<div class="lcDesc">' + esc(TP(c.blurb)) + '</div>' +
          '<div class="lcDesc" style="color:#6a6a88">❤ ' + c.hp + ' · ⚔ ' + c.atk +
            ' · 🛡 ' + c.def + ' · 🧪 ' + c.potions + ' · 🎯 ' + Math.round(c.crit * 100) + '%</div>' +
        '</div>' +
        '<div class="lcRight">' + (unlocked
          ? (selClass === c.id ? '<span class="essTag">✓</span>' : '')
          : '<button class="buyBtn' + (P.essence >= c.cost ? ' can' : '') + '">' + Util.fmt(c.cost) + '</button>') +
        '</div>';
      if (unlocked){
        tap(card, function(){
          selClass = c.id;
          SFX.play('uiClick');
          buildClassScreen();
        });
      } else {
        var b = Util.qs('button', card);
        if (b) tap(b, function(){
          if (Meta.buyClass(c)){
            SFX.play('unlock');
            toast(T('upgraded', TP(c.name)));
            selClass = c.id;
            flushAchievements();
            buildClassScreen();
          } else {
            SFX.play('error');
            toast(T('unlockAt', Util.fmt(c.cost)));
          }
        });
      }
      list.appendChild(card);
    });

    var dl = el('diffList');
    dl.innerHTML = '';
    CFG.DIFFS.forEach(function(d){
      var c = make('button', 'diffCard' + (selDiff === d.id ? ' sel' : ''));
      c.innerHTML = '<b>' + T(d.nameKey) + '</b><small>' + T(d.descKey) + '</small>';
      tap(c, function(){
        selDiff = d.id;
        Meta.P.diff = d.id;
        Meta.save();
        SFX.play('uiClick');
        buildClassScreen();
      });
      dl.appendChild(c);
    });

    var pacts = Meta.activePacts();
    el('pactSummary').innerHTML = pacts.length
      ? pacts.map(function(p){ return p.icon + ' ' + esc(TP(p.name)); }).join(' · ') +
        ' → ' + T('pactBonus', Math.round(Meta.pactBonus() * 100))
      : '';
    applyI18nAttrs();
  }

  /* ════════════════════════════════════════════════════════════════
     RETO DIARIO
     ════════════════════════════════════════════════════════════════ */
  function buildDaily(){
    Meta.refreshStreak();
    var P = Meta.P;
    var body = el('dailyBody');
    body.innerHTML = '';

    var hero = make('div', 'dailyHero');
    hero.innerHTML =
      '<div class="dn">' + T('dailyNum', Util.dayNumber()) + '</div>' +
      '<div class="dseed">' + esc(Meta.dailySeed()) + '</div>' +
      '<p>' + T('dailyIntro') + '</p>';
    body.appendChild(hero);
    var bonus = Meta.streakEssenceBonus();
    if (P.daily.streak > 1){
      body.appendChild(make('div', 'menuStats', T('streakBonus', P.daily.streak, bonus)));
    }

    var res = Meta.dailyResult();
    if (res){
      var box = make('div', 'shareBlock');
      box.textContent = Game.shareText(res);
      body.appendChild(make('h3', 'secTitle', T('dailyResult')));
      body.appendChild(box);
      var sb = make('button', 'btn primary', '<span class="bIcon">📤</span><span class="bTxt">' + T('share') + '</span>');
      tap(sb, function(){ Game.share(res); });
      body.appendChild(sb);
      body.appendChild(make('div', 'countdown', T('nextDaily', Util.fmtTime(Meta.msToMidnight()))));
    } else {
      var pb = make('button', 'btn primary big', '<span class="bIcon">▶</span><span class="bTxt">' + T('dailyPlay') + '</span>');
      tap(pb, function(){ Game.startDaily(true); });
      body.appendChild(pb);
    }

    var prac = make('button', 'btn ghost', T('dailyPractice'));
    tap(prac, function(){ Game.startDaily(false); });
    body.appendChild(prac);

    body.appendChild(make('h3', 'secTitle', T('history')));
    if (!P.daily.history.length){
      body.appendChild(make('div', 'menuStats', T('noHistory')));
    } else {
      P.daily.history.slice(0, 20).forEach(function(h){
        var cls = CFG.classById(h.classId);
        var row = make('div', 'histRow');
        row.innerHTML =
          '<span class="hn">#' + h.n + '</span>' +
          '<span>' + cls.icon + '</span>' +
          '<span class="hf">' + T('floor') + ' ' + h.floor + '</span>' +
          (h.won ? '<span>🌱</span>' : h.extracted ? '<span>🏃</span>' : '') +
          '<span class="hs">' + Util.fmt(h.score) + '</span>';
        body.appendChild(row);
      });
    }
    applyI18nAttrs();
  }

  /* ════════════════════════════════════════════════════════════════
     MALDICIÓN SEMANAL
     ════════════════════════════════════════════════════════════════ */
  function buildWeekly(){
    var body = el('weeklyBody');
    body.innerHTML = '';
    var w = Identity.weeklyOf();
    var hero = make('div', 'weeklyHero');
    hero.innerHTML =
      '<div class="dn">' + T('weeklyNum', w.n) + '</div>' +
      '<div class="dseed">' + w.icon + ' ' + esc(TP(w.name)) + '</div>' +
      '<p>' + esc(TP(w.desc)) + '</p>' +
      '<p>' + T('weeklyIntro') + '</p>';
    body.appendChild(hero);

    var res = Meta.weeklyResult();
    if (res){
      var box = make('div', 'shareBlock');
      box.textContent = Game.shareText(res);
      body.appendChild(make('h3', 'secTitle', T('weeklyResult')));
      body.appendChild(box);
      var sb = make('button', 'btn primary', '<span class="bIcon">📤</span><span class="bTxt">' + T('share') + '</span>');
      tap(sb, function(){ Game.share(res); });
      body.appendChild(sb);
      body.appendChild(make('div', 'countdown', T('nextWeekly', Util.fmtTime(Meta.msToNextWeek()))));
    } else {
      var pb = make('button', 'btn primary big', '<span class="bIcon">▶</span><span class="bTxt">' + T('weeklyPlay') + '</span>');
      tap(pb, function(){ Game.startWeekly(true); });
      body.appendChild(pb);
    }
    applyI18nAttrs();
  }

  /* ════════════════════════════════════════════════════════════════
     SALÓN DE LA FAMA
     ════════════════════════════════════════════════════════════════ */
  function buildHall(){
    var body = el('hallBody');
    body.innerHTML = '';
    var fame = Meta.P.fame || [];
    if (!fame.length){
      body.appendChild(make('div', 'menuStats', T('hallEmpty')));
      applyI18nAttrs();
      return;
    }
    fame.forEach(function(h, i){
      var cls = CFG.classById(h.classId);
      var row = make('div', 'fameRow');
      row.innerHTML =
        '<span class="frN">' + (i + 1) + '</span>' +
        '<span>' + cls.icon + '</span>' +
        '<div><div class="lcName">' + esc(h.arch || TP(cls.name)) + (h.won ? ' 🌱' : '') + '</div>' +
        '<div class="frA">' + T('floor') + ' ' + h.floor + ' · ' + esc(h.seed) + '</div></div>' +
        '<span class="frS">' + Util.fmt(h.score) + '</span>';
      body.appendChild(row);
    });
    applyI18nAttrs();
  }

  /* ════════════════════════════════════════════════════════════════
     ÁRBOL DE ESENCIA
     ════════════════════════════════════════════════════════════════ */
  function buildTree(tab){
    treeTab = tab || treeTab;
    Util.qsa('#treeTabs .tab').forEach(function(t){
      t.classList.toggle('active', t.getAttribute('data-tab') === treeTab);
    });
    el('essTagTree').textContent = Util.fmt(Meta.P.essence);
    var body = el('treeBody');
    body.innerHTML = '';

    if (treeTab === 'up') buildUpgrades(body);
    else if (treeTab === 'cls') buildClassTab(body);
    else if (treeTab === 'pact') buildPacts(body);
    else buildAchievements(body);
    applyI18nAttrs();
  }

  function upCard(u){
    var lvl = Meta.upLvl(u.id);
    var maxed = lvl >= u.max;
    var cost = CFG.upCost(u, lvl);
    var can = !maxed && Meta.P.essence >= cost;
    var card = make('div', 'listCard' + (maxed ? ' done' : ''));
    card.innerHTML =
      '<div class="lcIcon">' + u.icon + '</div>' +
      '<div class="lcBody">' +
        '<div class="lcName">' + esc(TP(u.name)) + ' <em>' + lvl + '/' + u.max + '</em></div>' +
        '<div class="lcDesc">' + esc(TP(u.desc)) + '</div>' +
        '<div class="pips">' + Array.from({ length:u.max }, function(_, i){
            return '<div class="pip' + (i < lvl ? ' on' : '') + '"></div>';
          }).join('') + '</div>' +
      '</div>' +
      '<div class="lcRight"><button class="buyBtn' + (can ? ' can' : '') + '"' +
        (can ? '' : ' disabled') + '>' + (maxed ? T('max') : '✦ ' + Util.fmt(cost)) + '</button></div>';
    var b = Util.qs('button', card);
    if (can) tap(b, function(){
      if (Meta.buyUp(u)){
        SFX.play('forge');
        toast(T('upgraded', TP(u.name)));
        flushAchievements();
        buildTree('up');
        buildMenu();
      }
    });
    return card;
  }

  function buildUpgrades(body){
    body.appendChild(make('div', 'menuStats', T('essenceNote')));
    CFG.UPGRADES.forEach(function(u){ body.appendChild(upCard(u)); });

    var prog = Meta.coreProgress();
    var head = make('div', 'rootHead' + (prog.done ? ' on' : ''));
    head.innerHTML = '<b>' + T('rootTitle') + '</b><span>' +
      (prog.done ? T('rootOpen') : T('rootLock', prog.have, prog.need)) + '</span>';
    body.appendChild(head);
    if (!prog.done){
      body.appendChild(make('div', 'menuStats', T('rootHint')));
      return;
    }
    CFG.ROOTS.forEach(function(u){ body.appendChild(upCard(u)); });
  }

  function buildClassTab(body){
    CFG.CLASSES.forEach(function(c){
      var un = Meta.classUnlocked(c.id);
      var can = !un && Meta.P.essence >= c.cost;
      var card = make('div', 'listCard' + (un ? ' done' : ''));
      var ult = CFG.ULTS[c.ult];
      card.innerHTML =
        '<div class="lcIcon">' + c.icon + '</div>' +
        '<div class="lcBody">' +
          '<div class="lcName">' + esc(TP(c.name)) + '</div>' +
          '<div class="lcDesc">' + esc(TP(c.blurb)) + '</div>' +
          (ult ? '<div class="lcDesc" style="color:#c77dff">' + ult.icon + ' ' +
                 esc(TP(ult.name)) + ' — ' + esc(TP(ult.desc)) + '</div>' : '') +
        '</div>' +
        '<div class="lcRight">' + (un ? '<span class="essTag">✓</span>' :
          '<button class="buyBtn' + (can ? ' can' : '') + '"' + (can ? '' : ' disabled') + '>✦ ' +
          Util.fmt(c.cost) + '</button>') + '</div>';
      if (can) tap(Util.qs('button', card), function(){
        if (Meta.buyClass(c)){
          SFX.play('unlock');
          toast(T('upgraded', TP(c.name)));
          flushAchievements();
          buildTree('cls');
          buildMenu();
        }
      });
      body.appendChild(card);
    });
  }

  function buildPacts(body){
    body.appendChild(make('div', 'menuStats', T('pactsIntro')));
    CFG.PACTS.forEach(function(p){
      var un = Meta.pactUnlocked(p);
      var on = Meta.pactActive(p.id);
      var card = make('div', 'listCard' + (un ? '' : ' locked') + (on ? ' sel' : ''));
      card.innerHTML =
        '<div class="lcIcon">' + p.icon + '</div>' +
        '<div class="lcBody">' +
          '<div class="lcName">' + esc(TP(p.name)) +
            (un ? '' : ' <em>' + T('best') + ' ' + p.unlock.best + '</em>') + '</div>' +
          '<div class="lcDesc">' + esc(TP(p.desc)) + '</div>' +
          '<div class="lcDesc" style="color:#ffd166">' + T('pactBonus', Math.round(p.bonus * 100)) + '</div>' +
        '</div>' +
        '<div class="lcRight"><div class="switch' + (on ? ' on' : '') + '"></div></div>';
      if (un) tap(card, function(){
        Meta.togglePact(p.id);
        SFX.play('toggle');
        buildTree('pact');
      });
      body.appendChild(card);
    });
  }

  function buildAchievements(body){
    var P = Meta.P;
    var got = CFG.ACHIEVEMENTS.filter(function(a){ return P.ach[a.id]; }).length;
    body.appendChild(make('div', 'menuStats', T('achProgress', got, CFG.ACHIEVEMENTS.length)));
    CFG.ACHIEVEMENTS.forEach(function(a){
      var done = !!P.ach[a.id];
      var card = make('div', 'listCard' + (done ? ' done' : ' locked'));
      card.innerHTML =
        '<div class="lcIcon">' + (done ? a.icon : '🔒') + '</div>' +
        '<div class="lcBody">' +
          '<div class="lcName">' + esc(TP(a.name)) + '</div>' +
          '<div class="lcDesc">' + esc(TP(a.desc)) + '</div>' +
        '</div>' +
        '<div class="lcRight"><span class="essTag">' + a.ess + '</span></div>';
      body.appendChild(card);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CÓDICE — todas las reliquias descubiertas
     ════════════════════════════════════════════════════════════════ */
  function buildCodex(){
    var P = Meta.P;
    var seen = Object.keys(P.seenRelics).length;
    el('codexCount').textContent = seen + ' / ' + RELICS.length;
    var body = el('codexBody');
    body.innerHTML = '';
    var order = ['comun','rara','epica','maldita'];
    order.forEach(function(rar){
      var group = RELICS.filter(function(r){ return r.rarity === rar; });
      if (!group.length) return;
      body.appendChild(make('h3', 'secTitle', T('rarity' +
        { comun:'Common', rara:'Rare', epica:'Epic', maldita:'Cursed' }[rar])));
      var grid = make('div', 'codexGrid');
      group.forEach(function(r){
        var known = !!P.seenRelics[r.id];
        var cell = make('div', 'codexCell' + (known ? '' : ' unk'), known ? r.icon : '?');
        if (known) tap(cell, function(){ showRelicDetail(r); });
        grid.appendChild(cell);
      });
      body.appendChild(grid);
    });
  }

  function showRelicDetail(def, stacks){
    el('relicDetailTitle').innerHTML = def.icon + ' ' + esc(TP(def.name));
    el('relicDetailBody').innerHTML =
      '<p style="font-size:.9rem;line-height:1.5;color:#c9c9e6;margin:0 0 8px">' +
        esc(TP(def.desc)) + '</p>' +
      '<div class="rcTags">' + def.tags.map(function(t){
        return '<span class="rTag">' + esc(t) + '</span>';
      }).join('') + '</div>' +
      (stacks > 1 ? '<p style="color:#ffd166;font-weight:800;margin:8px 0 0">' + T('owned', stacks) + '</p>' : '');
    overlay('relic', true);
  }

  /* ════════════════════════════════════════════════════════════════
     AJUSTES
     ════════════════════════════════════════════════════════════════ */
  function buildSettings(){
    var body = el('setBody');
    body.innerHTML = '';

    var lang = make('div', 'setRow');
    lang.innerHTML = '<div class="srName">' + T('language') + '</div>';
    var lr = make('div', 'langRow');
    [['es','Español'], ['en','English']].forEach(function(L){
      var b = make('button', 'langBtn' + (I18N.get() === L[0] ? ' sel' : ''), L[1]);
      tap(b, function(){
        Meta.setOpt('lang', L[0]);
        SFX.play('uiClick');
        buildSettings(); buildMenu(); syncHUD();
      });
      lr.appendChild(b);
    });
    lang.appendChild(lr);
    body.appendChild(lang);

    var rows = [
      ['sfx', T('sound')], ['music', T('music')], ['haptics', T('haptics')],
      ['shake', T('shake')], ['showDamage', T('showDamage')], ['tapMove', T('tapMove')],
      ['bigText', T('bigText')], ['highContrast', T('highContrast')],
      ['colorblind', T('colorblind')], ['reduceMotion', T('reduceMotion')],
      ['lefty', T('lefty')], ['relaxed', T('relaxed')]
    ];
    rows.forEach(function(r){
      var row = make('div', 'setRow');
      row.innerHTML = '<div class="srName">' + r[1] + '</div>';
      var sw = make('div', 'switch' + (Meta.opt(r[0]) ? ' on' : ''));
      row.appendChild(sw);
      tap(row, function(){
        var v = Meta.toggleOpt(r[0]);
        sw.classList.toggle('on', v);
        SFX.play('toggle');
        if (r[0] === 'bigText' || r[0] === 'lefty') setTimeout(Render.resize, 60);
      });
      body.appendChild(row);
    });

    var rst = make('button', 'btn danger', T('resetData'));
    tap(rst, function(){
      confirm(T('resetConfirm'), function(){
        Meta.reset();
        toast(T('resetDone'));
        buildMenu(); buildSettings();
      });
    });
    body.appendChild(rst);
    body.appendChild(make('div', 'menuStats',
      'Semilla Maldita · v3.0<br><small style="color:#4a4a66">' +
      (I18N.get() === 'es'
        ? 'Hecho para jugarse con una mano y mandarse por un chat.'
        : 'Made to play one-handed and send over chat.') + '</small>'));
  }

  /* ════════════════════════════════════════════════════════════════
     HUD
     ════════════════════════════════════════════════════════════════ */
  function syncHUD(){
    var st = Engine.run;
    if (!st || !st.player) return;
    var p = st.player, s = p.s;

    el('hFloor').textContent = st.floor;
    el('hBiome').textContent = T(st.biome.nameKey);
    el('hLvl').textContent = p.level;

    var pct = Util.clamp(p.hp / s.maxHp, 0, 1);
    var fill = el('hHpFill');
    fill.style.width = (pct * 100) + '%';
    fill.classList.toggle('low', pct < 0.3);
    var shPct = Util.clamp(p.shield / s.maxHp, 0, 1);
    el('hShFill').style.width = (shPct * 100) + '%';
    el('hHpTxt').textContent = Math.max(0, Math.ceil(p.hp)) + ' / ' + s.maxHp +
      (p.shield > 0 ? '  ⛨' + Math.round(p.shield) : '');
    el('hXpFill').style.width = Util.clamp(p.xp / p.xpNext, 0, 1) * 100 + '%';

    Util.qs('b', el('chipAtk')).textContent = Math.round(s.atk);
    Util.qs('b', el('chipDef')).textContent = Math.round(s.def);
    Util.qs('b', el('chipGold')).textContent = Util.fmt(p.gold);

    /* pociones */
    var pb = el('potBadge');
    pb.textContent = p.potions;
    pb.style.display = p.potions > 0 ? 'flex' : 'none';
    el('btnPotion').disabled = p.potions <= 0;

    /* impulso */
    var dashBtn = el('btnDash');
    var ready = Engine.canDash();
    dashBtn.disabled = !ready;
    dashBtn.classList.toggle('ready', ready);
    el('dashCd').style.height = ready ? '0%' :
      Util.clamp(p.dashCd / Math.max(1, p.dashCdMax), 0, 1) * 100 + '%';

    /* habilidad de clase */
    var abBtn = el('btnAbility');
    if (p.cls.ability){
      abBtn.style.display = '';
      abBtn.disabled = p.abilityCd > 0;
      abBtn.classList.toggle('ready', p.abilityCd <= 0);
      el('abIcon').textContent = p.cls.ability.id === 'alzar' ? '💀' : '✴️';
      el('abCd').style.height = Util.clamp(p.abilityCd / Math.max(1, p.cls.ability.cd), 0, 1) * 100 + '%';
    } else if (p.bombs){
      abBtn.style.display = '';
      abBtn.disabled = false;
      el('abIcon').textContent = '💣';
      el('abCd').style.height = '0%';
    } else {
      abBtn.style.display = 'none';
    }

    /* definitivo */
    var ult = CFG.ULTS[p.cls.ult];
    el('ultIcon').textContent = ult ? ult.icon : '🌀';
    var uFull = p.ultCharge >= 100;
    el('ultFill').style.height = Util.clamp(p.ultCharge / 100, 0, 1) * 100 + '%';
    el('btnUlt').classList.toggle('full', uFull);
    el('btnUlt').classList.toggle('ready', uFull);

    /* escalera */
    var dn = el('btnDescend');
    dn.classList.toggle('ready', Engine.onStairs());

    /* jefe */
    var bb = el('bossBar');
    if (st.bossRef && st.bossRef.hp > 0 && st.seen[st.bossRef.y * CFG.MW + st.bossRef.x]){
      bb.classList.add('on');
      el('bossName').textContent = st.bossRef.name;
      el('bossFill').style.width = Util.clamp(st.bossRef.hp / st.bossRef.maxHp, 0, 1) * 100 + '%';
    } else bb.classList.remove('on');

    syncRelicStrip();
  }

  function syncRelicStrip(){
    var strip = el('relicStrip');
    var rl = Engine.run.player.relics;
    if (strip.childElementCount === rl.length && strip.dataset.n === String(rl.length)){
      /* sólo refrescamos los contadores */
      for (var i = 0; i < rl.length; i++){
        var badge = strip.children[i].querySelector('i');
        if (rl[i].stacks > 1){
          if (badge) badge.textContent = rl[i].stacks;
        }
      }
      return;
    }
    strip.innerHTML = '';
    strip.dataset.n = String(rl.length);
    rl.forEach(function(inst){
      var n = make('div', 'rIcon ' + inst.def.rarity, inst.def.icon +
        (inst.stacks > 1 ? '<i>' + inst.stacks + '</i>' : ''));
      tap(n, function(){ showRelicDetail(inst.def, inst.stacks); });
      strip.appendChild(n);
    });
  }

  function pushLog(text, cls){
    logLines.push('<div class="m-' + cls + '">' + esc(text) + '</div>');
    if (logLines.length > 4) logLines.shift();
    el('log').innerHTML = logLines.join('');
  }
  function clearLog(){ logLines = []; el('log').innerHTML = ''; }

  /* ════════════════════════════════════════════════════════════════
     ELECCIÓN DE RELIQUIA — el centro del juego
     ════════════════════════════════════════════════════════════════ */
  var RARITY_BASE = { comun:0.60, rara:0.26, epica:0.09, maldita:0.05 };

  /** Probabilidad de rareza: sube con la profundidad y con la suerte. */
  function rarityWeights(floor, luck){
    var deep = Math.min(1, (floor - 1) / 18);
    return {
      comun:   Math.max(0.16, RARITY_BASE.comun - deep * 0.34),
      rara:    RARITY_BASE.rara + deep * 0.1,
      epica:   RARITY_BASE.epica + deep * 0.2 + luck * 0.02,
      maldita: RARITY_BASE.maldita + deep * 0.04
    };
  }

  function eligible(floor){
    var p = Engine.run.player;
    return RELICS.filter(function(r){
      if ((r.minFloor || 1) > floor) return false;
      for (var i = 0; i < p.relics.length; i++){
        if (p.relics[i].def.id === r.id && p.relics[i].stacks >= (r.maxStacks || 1)) return false;
      }
      return true;
    });
  }

  /** Genera n ofertas distintas, con el sesgo de rareza del piso. */
  function rollOffers(n, forceRarity){
    var st = Engine.run;
    var rng = st.relicRng;
    var pool = eligible(Math.max(1, st.floor));
    var w = rarityWeights(st.floor, st.player.s.luck);
    var out = [], used = {};
    var guard = 0;
    while (out.length < n && guard++ < 400){
      var rar = forceRarity;
      if (!rar){
        var r = rng.next(), acc = 0;
        var keys = ['comun','rara','epica','maldita'];
        var total = keys.reduce(function(a, k){ return a + w[k]; }, 0);
        r *= total;
        for (var i = 0; i < keys.length; i++){
          acc += w[keys[i]];
          if (r <= acc){ rar = keys[i]; break; }
        }
        rar = rar || 'comun';
      }
      var sub = pool.filter(function(x){ return x.rarity === rar && !used[x.id]; });
      if (!sub.length){
        sub = pool.filter(function(x){ return !used[x.id]; });
        if (!sub.length) break;
      }
      var pickd = rng.weighted(sub, function(x){ return x.weight || 5; });
      if (!pickd) break;
      used[pickd.id] = 1;
      out.push(pickd);
    }
    return out;
  }

  /** Etiquetas mecánicas que hacen que dos reliquias "hablen" entre sí. */
  var SYN_TAGS = ['fuego','hielo','rayo','veneno','sangre','critico','escudo','invocacion','oro','movimiento','arcana','sigilo'];
  function synergyFor(def){
    var owned = Engine.run.player.relics;
    if (!owned.length) return null;
    for (var i = 0; i < def.tags.length; i++){
      var t = def.tags[i];
      if (SYN_TAGS.indexOf(t) < 0) continue;
      for (var j = 0; j < owned.length; j++){
        if (owned[j].def.id === def.id) continue;
        if (owned[j].def.tags.indexOf(t) >= 0) return t;
      }
    }
    return null;
  }

  var cardCtx = null;
  /**
   * @param source 'piso' | 'cofre' | 'santuario' | 'altar'
   */
  function openRelicChoice(source, opts){
    opts = opts || {};
    var st = Engine.run;
    if (!st || st.over){ if (opts.onDone) opts.onDone(); return; }
    /* Pacto de ayuno: sin reliquia en pisos impares. */
    if (source === 'piso' && st.pactIds.ayuno && st.floor % 2 === 1){
      if (opts.onDone) opts.onDone();
      return;
    }
    var n = CFG.BAL.maxRelicOffers + (opts.extra || 0) + Meta.upLvl('car');
    if (st.weekly && st.weekly.extraCards) n += st.weekly.extraCards;
    var offers = rollOffers(n, opts.forceRarity);
    if (!offers.length){ if (opts.onDone) opts.onDone(); return; }
    cardCtx = { source:source, offers:offers, onDone:opts.onDone || null, rerolls:0, opts:opts };
    renderCards();
    overlay('cards', true);
    SFX.play('cardDeal');
  }

  function renderCards(){
    var st = Engine.run;
    var c = cardCtx;
    el('cardsTitle').textContent = c.opts.title || T('pickRelic');
    var row = el('cardRow');
    row.innerHTML = '';

    c.offers.forEach(function(def){
      var owned = 0;
      st.player.relics.forEach(function(r){ if (r.def.id === def.id) owned = r.stacks; });
      var syn = synergyFor(def);
      var card = make('button', 'relicCard ' + def.rarity);
      card.innerHTML =
        '<span class="rcRarity">' + rarityLabel(def.rarity) + '</span>' +
        '<div class="rcIcon">' + def.icon + '</div>' +
        '<div class="rcBody">' +
          '<div class="rcName">' + esc(TP(def.name)) +
            (owned ? '<span class="ownTag">' + T('owned', owned) + '</span>' : '') + '</div>' +
          '<div class="rcDesc">' + esc(TP(def.desc)) + '</div>' +
          (syn ? '<span class="synTag">✦ ' + T('synergy') + ' ' + esc(syn) + '</span>' : '') +
          '<div class="rcTags">' + def.tags.slice(0, 3).map(function(t){
            return '<span class="rTag">' + esc(t) + '</span>';
          }).join('') + '</div>' +
        '</div>';
      tap(card, function(){ chooseRelic(def); });
      row.appendChild(card);
    });

    /* Rebarajar y saltar: dan agencia cuando las tres cartas no sirven. */
    var foot = el('cardsFoot');
    foot.innerHTML = '';
    var cost = CFG.BAL.rerollBaseCost * Math.pow(2, c.rerolls);
    cost = Math.max(0, Math.round(cost * (1 - Meta.upLvl('tru') * 0.15)));
    if (st.player.gold >= cost){
      var rb = make('button', 'btn ghost', '🔄 ' + T('reroll') + ' — ' + T('rerollCost', Util.fmt(cost)));
      tap(rb, function(){
        st.player.gold -= cost;
        c.rerolls++;
        c.offers = rollOffers(c.offers.length, c.opts.forceRarity);
        SFX.play('cardDeal');
        renderCards();
        syncHUD();
      });
      foot.appendChild(rb);
    }
    if (c.source !== 'altar'){
      var skipGold = 20 + st.floor * 6;
      var sk = make('button', 'btn flat', T('skipForGold', skipGold));
      tap(sk, function(){
        Engine.addGold(skipGold);
        SFX.play('coin');
        closeCards();
      });
      foot.appendChild(sk);
    }
  }

  function rarityLabel(r){
    return T('rarity' + { comun:'Common', rara:'Rare', epica:'Epic', maldita:'Cursed' }[r]);
  }

  function chooseRelic(def){
    SFX.play('cardPick');
    Engine.grantRelic(def);
    Util.vibrate(25);
    flushAchievements();
    closeCards();
  }

  function closeCards(){
    overlay('cards', false);
    var done = cardCtx && cardCtx.onDone;
    cardCtx = null;
    syncHUD();
    if (done) done();
  }

  /* ════════════════════════════════════════════════════════════════
     ALTAR — bendición pequeña, decisión inmediata
     ════════════════════════════════════════════════════════════════ */
  var ALTAR_BOONS = [
    { icon:'❤️', name:{es:'Savia',en:'Sap'}, desc:{es:'Cúrate por completo.',en:'Heal completely.'},
      run:function(){ Engine.healPlayer(Engine.player.s.maxHp, 'altar'); } },
    { icon:'⚔️', name:{es:'Filo',en:'Edge'}, desc:{es:'+2 de ataque permanente.',en:'+2 permanent attack.'},
      run:function(){ Engine.player.base.atk += 2; Engine.recalc(); } },
    { icon:'🛡️', name:{es:'Costra',en:'Crust'}, desc:{es:'+2 de defensa permanente.',en:'+2 permanent defence.'},
      run:function(){ Engine.player.base.def += 2; Engine.recalc(); } },
    { icon:'🫀', name:{es:'Corazón',en:'Heart'}, desc:{es:'+14 de vida máxima.',en:'+14 max health.'},
      run:function(){ Engine.player.base.maxHp += 14; Engine.recalc(); Engine.healPlayer(14, 'altar', true); } },
    { icon:'🧪', name:{es:'Reserva',en:'Reserve'}, desc:{es:'+2 pociones.',en:'+2 potions.'},
      run:function(){ Engine.player.potions += 2; } },
    { icon:'💰', name:{es:'Ofrenda',en:'Offering'}, desc:{es:'Oro generoso.',en:'Generous gold.'},
      run:function(){ Engine.addGold(40 + Engine.run.floor * 14); } },
    { icon:'🎯', name:{es:'Ojo Certero',en:'True Eye'}, desc:{es:'+6% de crítico permanente.',en:'+6% permanent crit.'},
      run:function(){ Engine.player.base.crit += 0.06; Engine.recalc(); } },
    { icon:'🩸', name:{es:'Sed',en:'Thirst'}, desc:{es:'+5% de robo de vida.',en:'+5% lifesteal.'},
      run:function(){ Engine.player.base.lifesteal += 0.05; Engine.recalc(); } }
  ];

  function openAltar(){
    var st = Engine.run;
    if (!st || st.over) return;
    var rng = st.relicRng;
    var pool = ALTAR_BOONS.slice();
    rng.shuffle(pool);
    var picks = pool.slice(0, 3);
    el('altarTitle').textContent = I18N.get() === 'es' ? 'ALTAR OLVIDADO' : 'FORGOTTEN ALTAR';
    el('altarSub').textContent = I18N.get() === 'es'
      ? 'Toca la piedra. Sólo una.'
      : 'Touch the stone. Only one.';
    var row = el('altarRow');
    row.innerHTML = '';
    picks.forEach(function(b){
      var card = make('button', 'relicCard comun');
      card.innerHTML =
        '<div class="rcIcon">' + b.icon + '</div>' +
        '<div class="rcBody"><div class="rcName">' + esc(TP(b.name)) + '</div>' +
        '<div class="rcDesc">' + esc(TP(b.desc)) + '</div></div>';
      tap(card, function(){
        b.run();
        SFX.play('altar');
        FX.glow(Engine.player.x, Engine.player.y, '#ffd166');
        overlay('altar', false);
        syncHUD();
      });
      row.appendChild(card);
    });
    overlay('altar', true);
  }

  /* ════════════════════════════════════════════════════════════════
     SANTUARIO — tras cada jefe: gastar, o huir con el botín
     ════════════════════════════════════════════════════════════════ */
  function openSanctuary(onContinue){
    var st = Engine.run;
    var p = st.player;
    sancState = { sold:{}, onContinue:onContinue };
    SFX.setIntensity(0.1);
    renderSanctuary();
    overlay('sanctuary', true);
  }

  function renderSanctuary(){
    var st = Engine.run, p = st.player;
    var grid = el('sancGrid');
    grid.innerHTML = '';

    var items = [
      { id:'pot',  icon:'🧪', name:T('buyPotion'),  cost:26 + st.floor * 3,
        run:function(){ p.potions += 1; } },
      { id:'heal', icon:'❤️', name:T('buyHeal'),    cost:40 + st.floor * 6,
        run:function(){ Engine.healPlayer(p.s.maxHp, 'santuario'); } },
      { id:'hp',   icon:'🫀', name:T('buyMaxHp'),   cost:70 + st.floor * 8,
        run:function(){ p.base.maxHp += 15; Engine.recalc(); Engine.healPlayer(15, 'santuario', true); } },
      { id:'rel',  icon:'🔮', name:T('buyRelic'),   cost:95 + st.floor * 10,
        run:function(){ openRelicChoice('santuario', { extra:0 }); } },
      { id:'shield',icon:'⛨', name:'+' + (10 + st.floor * 2) + ' ⛨', cost:34 + st.floor * 4,
        run:function(){ Engine.addShield(10 + st.floor * 2); } },
      { id:'ult',  icon:'⚡', name:I18N.get() === 'es' ? 'Cargar definitivo' : 'Charge ultimate', cost:60 + st.floor * 6,
        run:function(){ p.ultCharge = 100; SFX.play('ultReady'); } }
    ];

    items.forEach(function(it){
      var sold = sancState.sold[it.id];
      var can = !sold && p.gold >= it.cost;
      var node = make('div', 'shopItem' + (sold ? ' sold' : (can ? '' : ' cant')));
      node.innerHTML =
        '<div class="siIcon">' + it.icon + '</div>' +
        '<div class="siName">' + esc(it.name) + '</div>' +
        '<div class="siCost">' + (sold ? T('sold') : '◈ ' + it.cost) + '</div>';
      if (can) tap(node, function(){
        p.gold -= it.cost;
        sancState.sold[it.id] = 1;
        it.run();
        SFX.play('coin');
        renderSanctuary();
        syncHUD();
      });
      else if (!sold) tap(node, function(){ SFX.play('error'); toast(T('tooPoor')); });
      grid.appendChild(node);
    });

    /* Huir: convierte el oro y la profundidad en esencia asegurada.
       Es la tensión que hace que cada santuario sea una decisión y no
       un botón de "continuar". */
    var mul = CFG.BAL.extractMul(st.floor);
    var ess = Game.previewEssence(true);
    var box = el('extractBox');
    box.innerHTML = '<p>' + T('extractDesc', Util.fmt(ess), mul.toFixed(2)) + '</p>';
    var btn = make('button', 'btn ghost', '🏃 ' + T('extract'));
    tap(btn, function(){
      confirm(T('extractConfirm'), function(){
        overlay('sanctuary', false);
        Engine.extract();
      });
    });
    box.appendChild(btn);
  }

  /* ════════════════════════════════════════════════════════════════
     PAUSA
     ════════════════════════════════════════════════════════════════ */
  function openPause(){
    var st = Engine.run;
    if (!st || st.over) return;
    var p = st.player;
    el('pauseStats').innerHTML =
      '<div>' + T('floor') + ' <b>' + st.floor + '</b></div>' +
      '<div>' + T('lvl') + ' <b>' + p.level + '</b></div>' +
      '<div>' + T('kills') + ' <b>' + st.kills + '</b></div>' +
      '<div>' + T('gold') + ' <b>' + Util.fmt(p.gold) + '</b></div>' +
      '<div>' + T('turn') + ' <b>' + st.turn + '</b></div>' +
      '<div>' + T('relics') + ' <b>' + Engine.relicCount() + '</b></div>';
    var wrap = el('pauseRelics');
    wrap.innerHTML = '';
    p.relics.forEach(function(inst){
      var n = make('div', 'rIcon ' + inst.def.rarity, inst.def.icon +
        (inst.stacks > 1 ? '<i>' + inst.stacks + '</i>' : ''));
      tap(n, function(){ showRelicDetail(inst.def, inst.stacks); });
      wrap.appendChild(n);
    });
    overlay('pause', true);
    SFX.setIntensity(0.05);
  }

  /* ════════════════════════════════════════════════════════════════
     RESULTADO
     ════════════════════════════════════════════════════════════════ */
  function showResult(r){
    var win = r.won, esc_ = r.extracted;
    el('resIcon').textContent = win ? '🌱' : esc_ ? '🏃' : r.abandoned ? '🏳️' : '💀';
    var title = el('resTitle');
    title.textContent = win ? T('youWon') : esc_ ? T('youEscaped') : r.abandoned ? T('abandon') : T('youDied');
    title.className = 'resTitle' + (win ? ' win' : esc_ ? ' escape' : '');
    el('resSub').textContent = win ? '' :
      esc_ ? T('escapedAt', r.floor) : (r.killedBy ? T('killedBy', r.killedBy) : '');
    el('recordFlag').classList.toggle('on', !!r.isRecord);
    el('resScore').textContent = Util.fmtFull(r.score);
    el('resArch').textContent = r.archLabel || '';
    el('resEpithet').textContent = r.epithet ? TP(r.epithet) : (r.died && r.deathLine ? TP(r.deathLine) : '');

    el('resGrid').innerHTML = [
      [T('deepest'), r.floor], [T('lvl'), r.level],
      [T('kills'), r.kills], [T('gold'), Util.fmt(r.gold)],
      [T('relics'), r.relicCount], [T('gained'), '+' + Util.fmt(r.essence)]
    ].map(function(kv){
      return '<div class="resStat"><div class="k">' + kv[0] + '</div><div class="v">' + kv[1] + '</div></div>';
    }).join('');

    el('shareBlock').textContent = Game.shareText(r);

    var rw = el('resRelics');
    rw.innerHTML = '';
    (r.relicsDetail || []).forEach(function(d){
      var n = make('div', 'rIcon ' + d.rarity, d.icon + (d.stacks > 1 ? '<i>' + d.stacks + '</i>' : ''));
      tap(n, function(){ showRelicDetail(RELIC_BY_ID[d.id], d.stacks); });
      rw.appendChild(n);
    });
    el('resSeed').textContent = r.seed;
    el('btnAgain').style.display = r.isDaily ? 'none' : '';
    showScreen('result');
    applyI18nAttrs();
  }

  /* ════════════════════════════════════════════════════════════════
     TUTORIAL CONTEXTUAL
     ════════════════════════════════════════════════════════════════ */
  var tutStep = 0, tutDone = false;
  function resetTutorial(){
    tutDone = Meta.opt('seenTutorial');
    tutStep = 0;
    hideTut();
  }
  function hideTut(){ el('tutorial').classList.remove('on'); }
  function showTut(key){
    if (tutDone) return;
    var n = el('tutorial');
    n.innerHTML = T(key) + '<button class="tutSkip">' + T('tutSkip') + '</button>';
    n.classList.add('on');
    tap(Util.qs('.tutSkip', n), function(){
      tutDone = true;
      Meta.setOpt('seenTutorial', true);
      hideTut();
    });
  }
  /** Se llama en cada acción: el tutorial avanza con lo que hace el jugador. */
  function tutorialTick(ev){
    if (tutDone) return;
    var st = Engine.run;
    if (!st) return;
    if (tutStep === 0){ showTut('tut1'); tutStep = 1; return; }
    if (tutStep === 1 && ev === 'move'){
      if (Engine.ctx().enemiesInRadius(6).length){ showTut('tut2'); tutStep = 2; }
      return;
    }
    if (tutStep === 2 && ev === 'attack'){ showTut('tut3'); tutStep = 3; return; }
    if (tutStep === 3 && ev === 'descend'){ showTut('tut4'); tutStep = 4; return; }
    if (tutStep === 4 && ev === 'windup'){ showTut('tut5'); tutStep = 5; return; }
    if (tutStep === 5 && ev === 'move'){
      tutDone = true;
      Meta.setOpt('seenTutorial', true);
      hideTut();
    }
  }

  function flushAchievements(){
    var got = Meta.checkAchievements();
    got.forEach(achToast);
    if (got.length) buildMenu();
  }

  var comboT = null;
  function showCombo(n){
    var node = el('comboBanner');
    if (!node) return;
    var rank = Identity.comboRank(n);
    var label = 'x' + n;
    if (rank) label += '  ' + (I18N.get() === 'es' ? rank.es : rank.en);
    node.textContent = label;
    node.style.color = rank ? rank.color : '#ffd166';
    node.classList.toggle('mega', n >= 8);
    node.classList.add('on');
    clearTimeout(comboT);
    comboT = setTimeout(function(){ node.classList.remove('on'); }, n >= 8 ? 1400 : 900);
  }

  function openChallenge(ch){
    if (!ch) return;
    el('challengeMsg').textContent = T('challengeIntro', Util.fmt(ch.score), ch.floor) +
      '  ·  ' + ch.seed;
    overlay('challenge', true);
    SFX.play('unlock');
  }

  /* ════════════════════════════════════════════════════════════════
     ENLACES DE BOTONES
     ════════════════════════════════════════════════════════════════ */
  function init(){
    applyI18nAttrs();

    /* menú */
    tap(el('btnPlay'), function(){ SFX.play('uiClick'); buildClassScreen(); showScreen('class'); });
    tap(el('btnDaily'), function(){ SFX.play('uiClick'); buildDaily(); showScreen('daily'); });
    tap(el('btnWeekly'), function(){ SFX.play('uiClick'); buildWeekly(); showScreen('weekly'); });
    tap(el('btnHall'), function(){ SFX.play('uiClick'); buildHall(); showScreen('hall'); });
    tap(el('btnTree'), function(){ SFX.play('uiClick'); buildTree('up'); showScreen('tree'); });
    tap(el('btnSettings'), function(){ SFX.play('uiClick'); buildSettings(); showScreen('settings'); });
    tap(el('btnCodex'), function(){ SFX.play('uiClick'); buildCodex(); showScreen('codex'); });
    tap(el('btnRandSeed'), function(){
      el('seedInput').value = Game.randomSeed();
      SFX.play('uiClick');
    });

    /* volver */
    tap(el('classBack'), function(){ SFX.play('uiBack'); buildMenu(); showScreen('menu'); });
    tap(el('dailyBack'), function(){ SFX.play('uiBack'); buildMenu(); showScreen('menu'); });
    tap(el('weeklyBack'), function(){ SFX.play('uiBack'); buildMenu(); showScreen('menu'); });
    tap(el('hallBack'), function(){ SFX.play('uiBack'); buildMenu(); showScreen('menu'); });
    tap(el('treeBack'), function(){ SFX.play('uiBack'); buildMenu(); showScreen('menu'); });
    tap(el('setBack'), function(){ SFX.play('uiBack'); buildMenu(); showScreen('menu'); });
    tap(el('codexBack'), function(){ SFX.play('uiBack'); buildMenu(); showScreen('menu'); });

    Util.qsa('#treeTabs .tab').forEach(function(t){
      tap(t, function(){ SFX.play('uiClick'); buildTree(t.getAttribute('data-tab')); });
    });

    tap(el('btnStartRun'), function(){
      var seed = (el('seedInput').value || '').trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
      if (!seed){ seed = Game.randomSeed(); el('seedInput').value = seed; }
      Game.startRun({ seed:seed, classId:selClass, diff:selDiff });
    });

    /* juego */
    tap(el('btnPause'), function(){ openPause(); });
    tap(el('btnResume'), function(){ overlay('pause', false); SFX.setIntensity(Engine.run ? Engine.run.biome.music : 0.3); });
    tap(el('btnPauseSettings'), function(){ overlay('pause', false); buildSettings(); showScreen('settings'); });
    tap(el('btnAbandon'), function(){
      confirm(T('abandonConfirm'), function(){
        overlay('pause', false);
        Engine.abandon();
      });
    });

    /* resultado */
    tap(el('btnShare'), function(){ Game.share(Game.lastResult); });
    tap(el('btnChallenge'), function(){ Game.shareChallenge(Game.lastResult); });
    tap(el('btnAgain'), function(){ Game.retrySameSeed(); });
    tap(el('btnNewRun'), function(){ buildClassScreen(); showScreen('class'); });
    tap(el('btnResultMenu'), function(){ buildMenu(); showScreen('menu'); SFX.setLayer('menu'); });

    /* santuario */
    tap(el('btnSancGo'), function(){
      overlay('sanctuary', false);
      var cb = sancState && sancState.onContinue;
      sancState = null;
      if (cb) cb();
    });

    /* superposiciones */
    tap(el('relicDetailClose'), function(){ overlay('relic', false); });
    tap(el('confirmYes'), function(){
      overlay('confirm', false);
      var fn = pendingConfirm; pendingConfirm = null;
      if (fn) fn();
    });
    tap(el('confirmNo'), function(){ overlay('confirm', false); pendingConfirm = null; SFX.play('uiBack'); });
    tap(el('btnChallengeGo'), function(){
      overlay('challenge', false);
      if (Game.acceptChallenge) Game.acceptChallenge();
    });
    tap(el('btnChallengeSkip'), function(){
      overlay('challenge', false);
      SFX.play('uiBack');
    });

    /* Cerrar superposición informativa tocando el fondo. */
    ['relic','pause'].forEach(function(id){
      var node = el('ov-' + id);
      node.addEventListener('pointerdown', function(ev){
        if (ev.target === node){
          overlay(id, false);
          if (id === 'pause' && Engine.run) SFX.setIntensity(Engine.run.biome.music);
        }
      });
    });
  }

  return {
    init:init, showScreen:showScreen, screen:screen, overlay:overlay,
    blocking:blocking, closeAllOverlays:closeAllOverlays,
    toast:toast, achToast:achToast, confirm:confirm,
    buildMenu:buildMenu, buildClassScreen:buildClassScreen, buildDaily:buildDaily,
    buildWeekly:buildWeekly, buildHall:buildHall,
    buildTree:buildTree, buildSettings:buildSettings, buildCodex:buildCodex,
    applyI18nAttrs:applyI18nAttrs,
    syncHUD:syncHUD, pushLog:pushLog, clearLog:clearLog,
    openRelicChoice:openRelicChoice, closeCards:closeCards, rollOffers:rollOffers,
    openAltar:openAltar, openSanctuary:openSanctuary, openPause:openPause,
    showResult:showResult, showRelicDetail:showRelicDetail,
    resetTutorial:resetTutorial, tutorialTick:tutorialTick, hideTut:hideTut,
    flushAchievements:flushAchievements, showCombo:showCombo, openChallenge:openChallenge,
    get selClass(){ return selClass; },
    get selDiff(){ return selDiff; }
  };
})();
