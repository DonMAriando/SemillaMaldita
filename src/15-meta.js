/* ════════════════════════════════════════════════════════════════════
   15-meta.js — perfil persistente: esencia, mejoras, opciones, logros,
   historial del diario y rachas. Todo en localStorage, sin servidor.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var Meta = (function(){

  var KEY = 'semillaMaldita.v3';

  function fresh(){
    return {
      v:3,
      essence:0,
      up:{},                    // id de mejora -> nivel
      classes:{ vagabundo:1 },  // estirpes desbloqueadas
      pacts:{},                 // id -> 1 si está activo
      ach:{},                   // id de logro -> timestamp
      seenRelics:{},            // id -> 1 (códice)
      bossKills:{},
      lastClass:'vagabundo',
      diff:'maldito',

      /* récords */
      best:0, bestScore:0, bestByDiff:{}, wins:0, runs:0,
      totalKills:0, maxRelics:0, maxGold:0, maxPacts:0, extracts:0,
      maxCombo:0, weeklyRuns:0, challengeWins:0,
      flags:{},
      fame:[],                  // hall of fame local (mejores 8)

      /* diario / semanal */
      daily:{ history:[], streak:0, bestStreak:0, lastKey:'', lastResult:null },
      weekly:{ lastKey:'', lastResult:null },

      /* opciones */
      opts:{
        lang:null, sfx:true, music:true, haptics:true, shake:true,
        reduceMotion:false, bigText:false, highContrast:false, colorblind:false,
        lefty:false, showDamage:true, tapMove:true, relaxed:false, seenTutorial:false,
        seenInstall:false
      }
    };
  }

  var P = fresh();

  function load(){
    try {
      var raw = localStorage.getItem(KEY);
      if (raw){
        var d = JSON.parse(raw);
        P = deepMerge(fresh(), d);
      } else {
        migrateV2();
      }
    } catch(e){ P = fresh(); }
    if (P.opts.lang == null) P.opts.lang = I18N.detect();
    I18N.set(P.opts.lang);
    return P;
  }

  /** Respeta la esencia de quien ya jugaba la versión ASCII. */
  function migrateV2(){
    try {
      var old = localStorage.getItem('semillaMaldita.meta.v2');
      if (!old) return;
      var o = JSON.parse(old);
      P.essence = (o.essence || 0);
      P.best = (o.best || 0);
      P.runs = (o.runs || 0);
      if (o.up){
        P.up.vit = o.up.vit || 0; P.up.fue = o.up.fue || 0;
        P.up.pie = o.up.pie || 0; P.up.alq = o.up.alq || 0;
      }
    } catch(e){}
  }

  function deepMerge(base, over){
    if (over == null || typeof over !== 'object') return base;
    for (var k in over){
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      var v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) &&
          base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])){
        deepMerge(base[k], v);
      } else {
        base[k] = v;
      }
    }
    return base;
  }

  var saveTimer = null;
  function save(){
    /* Agrupamos escrituras: localStorage es sincrónico y bloquea el hilo. */
    if (saveTimer) return;
    saveTimer = setTimeout(function(){
      saveTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(P)); } catch(e){}
    }, 250);
  }
  function saveNow(){
    if (saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.setItem(KEY, JSON.stringify(P)); } catch(e){}
  }

  /* ─────────── Opciones ─────────── */
  function opt(k){ return P.opts[k]; }
  function setOpt(k, v){
    P.opts[k] = v;
    if (k === 'lang') I18N.set(v);
    if (k === 'sfx') SFX.setMuted(!v);
    if (k === 'music'){ SFX.setMusicEnabled(v); }
    applyBodyClasses();
    save();
  }
  function toggleOpt(k){ setOpt(k, !P.opts[k]); return P.opts[k]; }

  /** Las opciones de accesibilidad son clases en <body>: el CSS hace el resto. */
  function applyBodyClasses(){
    var b = document.body;
    if (!b) return;
    b.classList.toggle('bigText', !!P.opts.bigText);
    b.classList.toggle('hiContrast', !!P.opts.highContrast);
    b.classList.toggle('cbSafe', !!P.opts.colorblind);
    b.classList.toggle('lefty', !!P.opts.lefty);
    b.classList.toggle('noMotion', !!P.opts.reduceMotion);
  }

  /* ─────────── Mejoras ─────────── */
  function upLvl(id){ return P.up[id] || 0; }
  function coreProgress(){ return CFG.coreProgress(upLvl); }
  function canBuyUp(u){
    var lvl = upLvl(u.id);
    return lvl < u.max && P.essence >= CFG.upCost(u, lvl);
  }
  function buyUp(u){
    var lvl = upLvl(u.id);
    if (lvl >= u.max) return false;
    var c = CFG.upCost(u, lvl);
    if (P.essence < c) return false;
    P.essence -= c;
    P.up[u.id] = lvl + 1;
    saveNow();
    return true;
  }

  function classUnlocked(id){ return !!P.classes[id]; }
  function buyClass(cls){
    if (P.classes[cls.id]) return false;
    if (P.essence < cls.cost) return false;
    P.essence -= cls.cost;
    P.classes[cls.id] = 1;
    saveNow();
    return true;
  }

  function pactUnlocked(p){
    if (!p.unlock) return true;
    if (p.unlock.best && P.best < p.unlock.best) return false;
    return true;
  }
  function pactActive(id){ return !!P.pacts[id]; }
  function togglePact(id){
    if (P.pacts[id]) delete P.pacts[id]; else P.pacts[id] = 1;
    save();
    return !!P.pacts[id];
  }
  function activePacts(){
    return CFG.PACTS.filter(function(p){ return P.pacts[p.id] && pactUnlocked(p); });
  }
  function pactBonus(){
    return activePacts().reduce(function(a, p){ return a + p.bonus; }, 0);
  }

  /* ─────────── Logros ─────────── */
  /** Evalúa todos los logros y devuelve los recién desbloqueados. */
  function checkAchievements(){
    var out = [];
    for (var i = 0; i < CFG.ACHIEVEMENTS.length; i++){
      var a = CFG.ACHIEVEMENTS[i];
      if (P.ach[a.id]) continue;
      var ok = false;
      try { ok = !!a.check(P); } catch(e){ ok = false; }
      if (ok){
        P.ach[a.id] = Date.now();
        P.essence += a.ess;
        out.push(a);
      }
    }
    if (out.length) saveNow();
    return out;
  }

  /* ─────────── Registro de partida ─────────── */
  /** `r` es el resumen que produce Game.finishRun(). */
  function recordRun(r){
    P.runs++;
    P.essence += r.essence;
    P.totalKills += r.kills;
    P.best = Math.max(P.best, r.floor);
    P.bestScore = Math.max(P.bestScore, r.score);
    P.maxRelics = Math.max(P.maxRelics, r.relicCount);
    P.maxGold = Math.max(P.maxGold, r.maxGold || r.gold);
    P.maxPacts = Math.max(P.maxPacts, r.pactCount || 0);
    P.maxCombo = Math.max(P.maxCombo, r.maxCombo || 0);
    P.bestByDiff[r.diff] = Math.max(P.bestByDiff[r.diff] || 0, r.floor);
    if (r.won) P.wins++;
    if (r.extracted) P.extracts++;
    if (r.isWeekly) P.weeklyRuns++;
    if (r.beatChallenge) P.challengeWins++;
    for (var b in r.bossesKilled) P.bossKills[b] = (P.bossKills[b] || 0) + r.bossesKilled[b];
    for (var f in r.flags) if (r.flags[f]) P.flags[f] = 1;
    for (var i = 0; i < r.relicIds.length; i++) P.seenRelics[r.relicIds[i]] = 1;
    P.lastClass = r.classId;
    pushFame(r);
    saveNow();
    return checkAchievements();
  }

  /** Conserva las 8 mejores partidas para el salón de la fama. */
  function pushFame(r){
    if (!r || !r.scored) return;
    P.fame = P.fame || [];
    P.fame.push({
      score:r.score, floor:r.floor, classId:r.classId, seed:r.seed,
      arch:r.archLabel || '', won:!!r.won, at:Date.now()
    });
    P.fame.sort(function(a, b){ return b.score - a.score; });
    if (P.fame.length > 8) P.fame.length = 8;
  }

  /* ─────────── Reto diario ─────────── */
  function dailySeed(d){
    return 'DIARIO-' + Util.todayKey(d);
  }
  function dailyPlayedToday(){
    return P.daily.lastKey === Util.todayKey();
  }
  function dailyResult(){
    return dailyPlayedToday() ? P.daily.lastResult : null;
  }
  /** Guarda el resultado del diario y actualiza la racha. */
  function recordDaily(r){
    var today = Util.todayKey();
    if (P.daily.lastKey === today) return;
    var yesterday = Util.todayKey(new Date(Date.now() - 86400000));
    P.daily.streak = (P.daily.lastKey === yesterday) ? P.daily.streak + 1 : 1;
    P.daily.bestStreak = Math.max(P.daily.bestStreak, P.daily.streak);
    P.daily.lastKey = today;
    P.daily.lastResult = r;
    P.daily.history.unshift({
      key:today, n:Util.dayNumber(), floor:r.floor, score:r.score,
      kills:r.kills, classId:r.classId, won:r.won, extracted:r.extracted
    });
    if (P.daily.history.length > 60) P.daily.history.length = 60;
    P.bestStreak = P.daily.bestStreak;
    var bonus = streakEssenceBonus();
    if (bonus) P.essence += bonus;
    saveNow();
  }
  /** La racha se rompe si te salteaste un día. Se comprueba al abrir. */
  function refreshStreak(){
    if (!P.daily.lastKey) return;
    var today = Util.todayKey();
    var yesterday = Util.todayKey(new Date(Date.now() - 86400000));
    if (P.daily.lastKey !== today && P.daily.lastKey !== yesterday) P.daily.streak = 0;
    P.bestStreak = P.daily.bestStreak;
  }
  function msToMidnight(){
    var n = new Date();
    var m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1);
    return m - n;
  }

  /* ─────────── Maldición semanal ─────────── */
  function weeklyPlayedThisWeek(){
    return P.weekly.lastKey === Identity.weekKey();
  }
  function weeklyResult(){
    return weeklyPlayedThisWeek() ? P.weekly.lastResult : null;
  }
  function recordWeekly(r){
    P.weekly.lastKey = Identity.weekKey();
    P.weekly.lastResult = r;
    saveNow();
  }
  function msToNextWeek(){
    var n = new Date();
    var day = n.getDay();                 // 0 domingo
    var daysUntilMon = (8 - day) % 7;
    if (daysUntilMon === 0) daysUntilMon = 7;
    var m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + daysUntilMon, 0, 0, 1);
    return m - n;
  }

  /** Bonus de racha diaria: vuelve mañana. Es el gancho de retención barato. */
  function streakEssenceBonus(){
    var s = P.daily.streak || 0;
    if (s <= 1) return 0;
    return Math.min(80, (s - 1) * 12);
  }

  function reset(){
    P = fresh();
    P.opts.lang = I18N.get();
    saveNow();
    applyBodyClasses();
  }

  return {
    load:load, save:save, saveNow:saveNow, reset:reset,
    get P(){ return P; },
    opt:opt, setOpt:setOpt, toggleOpt:toggleOpt, applyBodyClasses:applyBodyClasses,
    upLvl:upLvl, canBuyUp:canBuyUp, buyUp:buyUp, coreProgress:coreProgress,
    classUnlocked:classUnlocked, buyClass:buyClass,
    pactUnlocked:pactUnlocked, pactActive:pactActive, togglePact:togglePact,
    activePacts:activePacts, pactBonus:pactBonus,
    checkAchievements:checkAchievements, recordRun:recordRun,
    dailySeed:dailySeed, dailyPlayedToday:dailyPlayedToday, dailyResult:dailyResult,
    recordDaily:recordDaily, refreshStreak:refreshStreak, msToMidnight:msToMidnight,
    weeklyPlayedThisWeek:weeklyPlayedThisWeek, weeklyResult:weeklyResult,
    recordWeekly:recordWeekly, msToNextWeek:msToNextWeek, streakEssenceBonus:streakEssenceBonus
  };
})();
