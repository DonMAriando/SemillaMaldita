/* ════════════════════════════════════════════════════════════════════
   01-i18n.js — textos en español e inglés
   El juego nació en español; el inglés existe para que se pueda
   compartir fuera sin fricción.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var I18N = (function(){

  var ES = {
    /* menú */
    tagline:'Baja. Elige. Muere. Comparte.',
    descend:'DESCENDER', daily:'RETO DIARIO', shop:'SANTUARIO', settings:'AJUSTES',
    seedPlaceholder:'SEMILLA', randomSeed:'Semilla aleatoria',
    chooseClass:'ELIGE TU ESTIRPE', chooseDiff:'DIFICULTAD',
    locked:'BLOQUEADO', unlockAt:'Se abre con {0} esencia',
    essence:'Esencia', runs:'Partidas', best:'Mejor piso', bestScore:'Mejor puntaje',
    streak:'Racha', totalKills:'Bajas totales',
    play:'JUGAR', back:'VOLVER', close:'CERRAR', confirm:'CONFIRMAR', cancel:'CANCELAR',

    /* diario */
    dailyTitle:'RETO DIARIO', dailyNum:'Diario #{0}',
    dailyDone:'Ya jugaste el diario de hoy',
    dailyIntro:'Una mazmorra. La misma para todo el mundo. Un intento.',
    dailyPlay:'JUGAR EL DIARIO', dailyPractice:'PRACTICAR (no puntúa)',
    dailyResult:'Tu resultado de hoy', nextDaily:'Siguiente en {0}',
    history:'HISTORIAL', noHistory:'Aún no hay partidas.',
    streakBonus:'Racha {0}: +{1} esencia extra',

    /* semanal */
    weekly:'MALDICIÓN', weeklyTitle:'MALDICIÓN SEMANAL',
    weeklyNum:'Semana #{0}', weeklyPlay:'JUGAR LA MALDICIÓN',
    weeklyDone:'Ya jugaste la maldición de esta semana',
    weeklyIntro:'Una regla extra. La misma para todo el mundo. Hasta el lunes.',
    weeklyResult:'Tu maldición de esta semana', nextWeekly:'Nueva maldición en {0}',

    /* duelo / identidad */
    challenge:'TE RETAN', challengeIntro:'Alguien hizo {0} pts en el piso {1}.',
    challengeAccept:'ACEPTO EL DUELO', challengeSkip:'OTRA VEZ SERÁ',
    challengeBeat:'Le ganaste el duelo.',
    challengeLost:'No llegaste. Reintenta la misma semilla.',
    archUnlock:'Arquetipo: {0}',
    yourBuild:'Tu arquetipo',
    hall:'SALÓN', hallTitle:'SALÓN DE LA FAMA', hallEmpty:'Aún no hay leyendas.',
    installHint:'Añádelo a tu pantalla de inicio. Se juega sin internet.',
    deathQuote:'La Semilla siempre gana. Hasta que no.',

    /* HUD */
    floor:'Piso', lvl:'Nv', gold:'Oro', score:'Puntos', turn:'Turno',
    potions:'Pociones', dash:'Impulso', ult:'Definitivo', relics:'Reliquias',
    stairsHere:'Estás en la escalera', findStairs:'Encuentra la escalera',

    /* acciones */
    wait:'Esperar', godown:'BAJAR', usePotion:'Poción', noPotions:'Sin pociones.',
    hpFull:'Ya tienes la vida al máximo.',
    dashNotReady:'Impulso en enfriamiento ({0}).',
    ultNotReady:'Definitivo al {0}%.',
    ultIsReady:'¡DEFINITIVO LISTO!',

    /* combate / log */
    youHit:'Golpeas a {0}: {1}.', youCrit:'¡CRÍTICO en {0}: {1}!',
    enemyHit:'{0} te golpea: {1}.', enemyMiss:'Esquivas a {0}.',
    blocked:'Tu escudo aguanta {0}.',
    died:'{0} cae. +{1} XP',
    levelUp:'¡Nivel {0}!', pickedPotion:'Recoges una poción.',
    pickedGold:'+{0} oro', pickedHeart:'+{0} vida máxima',
    pickedRelic:'Reliquia: {0}', trapHit:'¡Trampa! {0} de daño.',
    lavaHurt:'La lava te quema: {0}.', waterSlow:'El agua te frena.',
    descended:'Piso {0}. La presión aumenta.',
    bossWarn:'Algo enorme respira en la oscuridad...',
    bossDown:'¡{0} ha caído!',
    wakeUp:'Despiertas en la mazmorra. Busca la escalera.',
    seedIs:'Semilla: {0}',
    revived:'Modo relajado: vuelves con media vida.',

    /* cartas */
    pickRelic:'ELIGE UNA RELIQUIA', reroll:'REBARAJAR', rerollCost:'{0} oro',
    skipForGold:'SALTAR (+{0} oro)', owned:'x{0}',
    rarityCommon:'Común', rarityRare:'Rara', rarityEpic:'Épica', rarityCursed:'Maldita',
    synergy:'¡Sinergia!',

    /* santuario */
    sanctuary:'SANTUARIO', sancIntro:'Un momento de paz. Gasta o huye.',
    buyPotion:'Poción', buyHeal:'Curación completa', buyMaxHp:'+15 vida máxima',
    buyRelic:'Reliquia al azar', buyReroll:'Cambiar una reliquia',
    extract:'HUIR CON EL BOTÍN', extractDesc:'Terminas la partida y conservas {0} esencia (x{1}).',
    extractConfirm:'¿Huir ahora? La partida termina aquí.',
    continueDown:'SEGUIR BAJANDO', sold:'Vendido', tooPoor:'No te alcanza el oro.',

    /* muerte */
    youDied:'HAS MUERTO', youEscaped:'HAS ESCAPADO', youWon:'LA SEMILLA HA CAÍDO',
    killedBy:'Te mató: {0}', escapedAt:'Huiste en el piso {0}',
    kills:'Bajas', deepest:'Piso', gained:'Esencia', finalScore:'PUNTAJE',
    newRecord:'¡NUEVO RÉCORD!', seedOfRun:'Semilla de esta partida',
    retry:'REINTENTAR MISMA SEMILLA', newRun:'NUEVA PARTIDA',
    share:'COMPARTIR', copied:'Copiado al portapapeles', toMenu:'MENÚ',
    runRelics:'Tu construcción',
    challengeShare:'RETA A UN AMIGO',

    /* tienda de esencia */
    essenceShop:'ÁRBOL DE ESENCIA', permanent:'Mejoras permanentes',
    essenceNote:'La esencia sobrevive a la muerte. Cada intento te deja más fuerte.',
    rootTitle:'RAÍZ PROFUNDA',
    rootOpen:'El árbol sigue creciendo. Sigue comprando.',
    rootLock:'Completa el árbol ({0}/{1}) para seguir creciendo.',
    rootHint:'Cuando todas las estadísticas estén al máximo, aquí podrás seguir comprando poder.',
    rootMenu:'La Raíz Profunda está abierta en el Santuario.',
    max:'MÁX', upgraded:'{0} mejorada',
    tabUpgrades:'MEJORAS', tabClasses:'ESTIRPES', tabPacts:'PACTOS', tabAchievements:'LOGROS',

    /* pactos */
    pactsIntro:'Reglas que te castigan y te pagan mejor.',
    pactBonus:'+{0}% esencia y puntos', pactActive:'ACTIVO',

    /* logros */
    achUnlocked:'Logro: {0}', achProgress:'{0} / {1}',

    /* ajustes */
    language:'Idioma', sound:'Efectos de sonido', music:'Música',
    haptics:'Vibración', shake:'Sacudida de pantalla', reduceMotion:'Reducir animaciones',
    bigText:'Texto grande', highContrast:'Alto contraste', colorblind:'Paleta accesible',
    lefty:'Controles a la izquierda', showDamage:'Números de daño',
    tapMove:'Tocar para caminar', relaxed:'Modo relajado (una revivida)',
    resetData:'BORRAR TODO MI PROGRESO', resetConfirm:'Esto borra esencia, récords y rachas. ¿Seguro?',
    resetDone:'Progreso borrado.',

    /* dificultad */
    diffEasy:'Aprendiz', diffNormal:'Maldito', diffHard:'Pesadilla', diffInsane:'Abismo',
    diffEasyD:'Para aprender. Menos esencia.',
    diffNormalD:'Como debe jugarse.',
    diffHardD:'Enemigos más duros. +40% esencia.',
    diffInsaneD:'Sin pociones iniciales. +90% esencia.',

    /* tutorial */
    tut1:'Desliza o usa las flechas — también en diagonal — para caminar.',
    tut2:'Camina contra un enemigo para atacarlo.',
    tut3:'Encuentra la escalera 🪜 y pulsa BAJAR.',
    tut4:'Cada piso te da una reliquia. Ahí está el juego real.',
    tut5:'Mira el aviso sobre los enemigos: te dicen qué harán.',
    tutSkip:'Saltar guía',

    /* varios */
    biome1:'Criptas', biome2:'Cavernas', biome3:'Fundición', biome4:'El Vacío',
    biome5:'Jardín de la Semilla', biome6:'Descenso Eterno',
    paused:'PAUSA', resume:'CONTINUAR', abandon:'ABANDONAR PARTIDA',
    abandonConfirm:'¿Abandonar? Conservas la esencia ganada.',
    intent:{ mover:'se acerca', atacar:'te va a golpear', disparar:'te apunta',
             cargar:'va a cargar', explotar:'va a estallar', invocar:'invoca',
             curar:'cura a los suyos', hechizo:'lanza un hechizo', esperar:'espera',
             teleport:'se desvanece', despertar:'despierta' }
  };

  var EN = {
    tagline:'Descend. Choose. Die. Share.',
    descend:'DESCEND', daily:'DAILY RUN', shop:'SANCTUARY', settings:'SETTINGS',
    seedPlaceholder:'SEED', randomSeed:'Random seed',
    chooseClass:'CHOOSE YOUR BLOODLINE', chooseDiff:'DIFFICULTY',
    locked:'LOCKED', unlockAt:'Opens with {0} essence',
    essence:'Essence', runs:'Runs', best:'Best floor', bestScore:'Best score',
    streak:'Streak', totalKills:'Total kills',
    play:'PLAY', back:'BACK', close:'CLOSE', confirm:'CONFIRM', cancel:'CANCEL',

    dailyTitle:'DAILY RUN', dailyNum:'Daily #{0}',
    dailyDone:"You already played today's run",
    dailyIntro:'One dungeon. The same for everyone. One attempt.',
    dailyPlay:'PLAY THE DAILY', dailyPractice:'PRACTICE (unscored)',
    dailyResult:"Today's result", nextDaily:'Next in {0}',
    history:'HISTORY', noHistory:'No runs yet.',
    streakBonus:'Streak {0}: +{1} extra essence',

    weekly:'CURSE', weeklyTitle:'WEEKLY CURSE',
    weeklyNum:'Week #{0}', weeklyPlay:'PLAY THE CURSE',
    weeklyDone:'You already played this week’s curse',
    weeklyIntro:'One extra rule. The same for everyone. Until Monday.',
    weeklyResult:'This week’s curse', nextWeekly:'New curse in {0}',

    challenge:'YOU ARE CHALLENGED', challengeIntro:'Someone scored {0} on floor {1}.',
    challengeAccept:'ACCEPT THE DUEL', challengeSkip:'NOT NOW',
    challengeBeat:'You won the duel.',
    challengeLost:'You fell short. Retry the same seed.',
    archUnlock:'Archetype: {0}',
    yourBuild:'Your archetype',
    hall:'HALL', hallTitle:'HALL OF FAME', hallEmpty:'No legends yet.',
    installHint:'Add it to your home screen. It plays offline.',
    deathQuote:'The Seed always wins. Until it doesn’t.',

    floor:'Floor', lvl:'Lv', gold:'Gold', score:'Score', turn:'Turn',
    potions:'Potions', dash:'Dash', ult:'Ultimate', relics:'Relics',
    stairsHere:'You are on the stairs', findStairs:'Find the stairs',

    wait:'Wait', godown:'DESCEND', usePotion:'Potion', noPotions:'No potions left.',
    hpFull:'Your health is already full.',
    dashNotReady:'Dash cooling down ({0}).',
    ultNotReady:'Ultimate at {0}%.',
    ultIsReady:'ULTIMATE READY!',

    youHit:'You hit {0}: {1}.', youCrit:'CRIT on {0}: {1}!',
    enemyHit:'{0} hits you: {1}.', enemyMiss:'You dodge {0}.',
    blocked:'Your shield holds {0}.',
    died:'{0} falls. +{1} XP',
    levelUp:'Level {0}!', pickedPotion:'You pick up a potion.',
    pickedGold:'+{0} gold', pickedHeart:'+{0} max health',
    pickedRelic:'Relic: {0}', trapHit:'Trap! {0} damage.',
    lavaHurt:'Lava burns you: {0}.', waterSlow:'The water slows you.',
    descended:'Floor {0}. The pressure rises.',
    bossWarn:'Something huge breathes in the dark...',
    bossDown:'{0} has fallen!',
    wakeUp:'You wake in the dungeon. Find the stairs.',
    seedIs:'Seed: {0}',
    revived:'Relaxed mode: you return with half health.',

    pickRelic:'CHOOSE A RELIC', reroll:'REROLL', rerollCost:'{0} gold',
    skipForGold:'SKIP (+{0} gold)', owned:'x{0}',
    rarityCommon:'Common', rarityRare:'Rare', rarityEpic:'Epic', rarityCursed:'Cursed',
    synergy:'Synergy!',

    sanctuary:'SANCTUARY', sancIntro:'A moment of peace. Spend, or run.',
    buyPotion:'Potion', buyHeal:'Full heal', buyMaxHp:'+15 max health',
    buyRelic:'Random relic', buyReroll:'Swap a relic',
    extract:'ESCAPE WITH THE LOOT', extractDesc:'End the run and keep {0} essence (x{1}).',
    extractConfirm:'Escape now? The run ends here.',
    continueDown:'KEEP DESCENDING', sold:'Sold out', tooPoor:'Not enough gold.',

    youDied:'YOU DIED', youEscaped:'YOU ESCAPED', youWon:'THE SEED HAS FALLEN',
    killedBy:'Killed by: {0}', escapedAt:'Escaped on floor {0}',
    kills:'Kills', deepest:'Floor', gained:'Essence', finalScore:'SCORE',
    newRecord:'NEW RECORD!', seedOfRun:'Seed of this run',
    retry:'RETRY SAME SEED', newRun:'NEW RUN',
    share:'SHARE', copied:'Copied to clipboard', toMenu:'MENU',
    runRelics:'Your build',
    challengeShare:'CHALLENGE A FRIEND',

    essenceShop:'ESSENCE TREE', permanent:'Permanent upgrades',
    essenceNote:'Essence outlives you. Every attempt leaves you stronger.',
    rootTitle:'DEEP ROOT',
    rootOpen:'The tree still grows. Keep buying.',
    rootLock:'Finish the tree ({0}/{1}) to keep growing.',
    rootHint:'When every stat is maxed, you can keep buying power here.',
    rootMenu:'The Deep Root is open in the Sanctuary.',
    max:'MAX', upgraded:'{0} upgraded',
    tabUpgrades:'UPGRADES', tabClasses:'BLOODLINES', tabPacts:'PACTS', tabAchievements:'FEATS',

    pactsIntro:'Rules that punish you and pay better.',
    pactBonus:'+{0}% essence and score', pactActive:'ACTIVE',

    achUnlocked:'Feat: {0}', achProgress:'{0} / {1}',

    language:'Language', sound:'Sound effects', music:'Music',
    haptics:'Vibration', shake:'Screen shake', reduceMotion:'Reduce animation',
    bigText:'Large text', highContrast:'High contrast', colorblind:'Accessible palette',
    lefty:'Controls on the left', showDamage:'Damage numbers',
    tapMove:'Tap to walk', relaxed:'Relaxed mode (one revive)',
    resetData:'ERASE ALL MY PROGRESS', resetConfirm:'This erases essence, records and streaks. Sure?',
    resetDone:'Progress erased.',

    diffEasy:'Apprentice', diffNormal:'Cursed', diffHard:'Nightmare', diffInsane:'Abyss',
    diffEasyD:'To learn. Less essence.',
    diffNormalD:'The way it should be played.',
    diffHardD:'Tougher enemies. +40% essence.',
    diffInsaneD:'No starting potions. +90% essence.',

    tut1:'Swipe or use the arrows — diagonals too — to walk.',
    tut2:'Walk into an enemy to attack it.',
    tut3:'Find the stairs 🪜 and press DESCEND.',
    tut4:'Every floor grants a relic. That is the real game.',
    tut5:'Watch the marker above enemies: it tells you their next move.',
    tutSkip:'Skip guide',

    biome1:'Crypts', biome2:'Caverns', biome3:'The Foundry', biome4:'The Void',
    biome5:"Garden of the Seed", biome6:'Endless Descent',
    paused:'PAUSED', resume:'RESUME', abandon:'ABANDON RUN',
    abandonConfirm:'Abandon? You keep the essence you earned.',
    intent:{ mover:'closing in', atacar:'will strike you', disparar:'is aiming at you',
             cargar:'will charge', explotar:'will explode', invocar:'summoning',
             curar:'healing its kin', hechizo:'casting', esperar:'waiting',
             teleport:'vanishing', despertar:'waking up' }
  };

  var lang = 'es';
  var dicts = { es: ES, en: EN };

  /** Traduce `key` sustituyendo {0}, {1}... por los argumentos extra. */
  function t(key){
    var d = dicts[lang] || ES;
    var v = d[key];
    if (v === undefined) v = ES[key];
    if (v === undefined) return key;
    if (arguments.length > 1){
      var args = arguments;
      v = String(v).replace(/\{(\d+)\}/g, function(_, i){
        var a = args[+i + 1];
        return a === undefined ? '' : String(a);
      });
    }
    return v;
  }

  /** Para campos {es,en} embebidos en datos (reliquias, enemigos, logros). */
  function pick(obj){
    if (obj == null) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.es || obj.en || '';
  }

  function set(l){ if (dicts[l]) lang = l; }
  function get(){ return lang; }
  /** Adivina el idioma del navegador la primera vez. */
  function detect(){
    try {
      var n = (navigator.language || 'es').toLowerCase();
      return n.indexOf('es') === 0 ? 'es' : 'en';
    } catch(e){ return 'es'; }
  }

  return { t:t, pick:pick, set:set, get:get, detect:detect };
})();

var T = I18N.t;
var TP = I18N.pick;
