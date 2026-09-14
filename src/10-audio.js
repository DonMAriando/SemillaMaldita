/* ════════════════════════════════════════════════════════════════════
   10-audio.js — sonido sintético. Cero archivos.

   Un hit se oye antes de entenderse. El motor es Web Audio: cada
   golpe, cada carta y cada racha tiene un "clic" propio, y la música
   sube con la amenaza real (intensity 0..1). Si el contexto no existe
   (simulador, navegador viejo), todo es un no-op silencioso.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var SFX = (function(){

  var ac = null;
  var master = null;
  var sfxG = null;
  var musG = null;
  var muted = false;
  var musicOn = true;
  var inited = false;
  var layer = 'menu';
  var intensity = 0.25;
  var targetInt = 0.25;
  var voices = [];
  var lastAt = {};
  var musTimer = 0;
  var musStep = 0;
  var musNodes = [];
  var drone = null;

  function now(){ return ac ? ac.currentTime : 0; }

  function init(){
    if (inited) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = ac || new AC();
      if (ac.state === 'suspended' && ac.resume) ac.resume();
      master = ac.createGain();
      master.gain.value = 0.85;
      master.connect(ac.destination);
      sfxG = ac.createGain();
      sfxG.gain.value = muted ? 0 : 0.9;
      sfxG.connect(master);
      musG = ac.createGain();
      musG.gain.value = 0;
      musG.connect(master);
      inited = true;
      startDrone();
      return true;
    } catch(e){
      ac = null; inited = false;
      return false;
    }
  }

  function env(g, t, a, d, s, r, peak){
    peak = peak == null ? 1 : peak;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * s), t + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  }

  function osc(type, freq, t, dur, vol, dest){
    if (!ac) return null;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(dest || sfxG);
    o.start(t);
    o.stop(t + dur);
    g.gain.setValueAtTime(Math.max(0.0001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return o;
  }

  function noise(t, dur, vol, type){
    if (!ac) return;
    var n = Math.max(1, Math.floor(ac.sampleRate * dur));
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < n; i++){
      var w = Math.random() * 2 - 1;
      if (type === 'brown'){ last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    var src = ac.createBufferSource();
    src.buffer = buf;
    var g = ac.createGain();
    var f = ac.createBiquadFilter();
    f.type = type === 'hi' ? 'highpass' : 'lowpass';
    f.frequency.value = type === 'hi' ? 1800 : (type === 'brown' ? 400 : 1200);
    src.connect(f); f.connect(g); g.connect(sfxG);
    g.gain.setValueAtTime(Math.max(0.0001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur);
  }

  function beep(freq, t, dur, vol, type, slide, dest){
    if (!ac) return;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxG);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function chord(freqs, t, dur, vol, type){
    for (var i = 0; i < freqs.length; i++) beep(freqs[i], t, dur, vol / freqs.length, type || 'triangle');
  }

  /* ─────────── Catálogo ─────────── */
  var PATCH = {
    uiClick:    function(t, v){ beep(880, t, 0.05, 0.12 * v, 'square'); beep(1320, t + 0.02, 0.04, 0.08 * v, 'square'); },
    uiBack:     function(t, v){ beep(440, t, 0.07, 0.1 * v, 'square', 220); },
    toggle:     function(t, v){ beep(520, t, 0.05, 0.1 * v, 'triangle'); beep(780, t + 0.04, 0.06, 0.1 * v, 'triangle'); },
    error:      function(t, v){ beep(180, t, 0.12, 0.16 * v, 'sawtooth', 90); noise(t, 0.08, 0.04 * v, 'hi'); },
    unlock:     function(t, v){ chord([523, 659, 784], t, 0.22, 0.22 * v, 'triangle'); beep(1046, t + 0.12, 0.18, 0.12 * v, 'sine'); },
    forge:      function(t, v){ noise(t, 0.18, 0.12 * v, 'brown'); beep(140, t, 0.2, 0.1 * v, 'sawtooth', 80); },
    coin:       function(t, v){ beep(980, t, 0.06, 0.14 * v, 'square'); beep(1480, t + 0.05, 0.1, 0.12 * v, 'square'); },
    pickup:     function(t, v){ beep(660, t, 0.07, 0.1 * v, 'triangle'); beep(990, t + 0.04, 0.08, 0.08 * v, 'triangle'); },
    cardDeal:   function(t, v){ noise(t, 0.08, 0.07 * v, 'hi'); beep(420, t, 0.06, 0.06 * v, 'triangle'); },
    cardPick:   function(t, v){ chord([392, 523, 659, 784], t, 0.28, 0.24 * v, 'triangle'); },
    relic:      function(t, v){ chord([330, 415, 554], t, 0.32, 0.2 * v, 'sine'); beep(880, t + 0.1, 0.2, 0.1 * v, 'triangle'); },
    move:       function(t, v){ noise(t, 0.04, 0.03 * v, 'brown'); },
    bump:       function(t, v){ beep(90, t, 0.06, 0.12 * v, 'sine'); },
    swing:      function(t, v){ noise(t, 0.07, 0.06 * v, 'hi'); beep(240, t, 0.05, 0.05 * v, 'sawtooth', 80); },
    hit:        function(t, v){ noise(t, 0.06, 0.1 * v, 'brown'); beep(180, t, 0.08, 0.14 * v, 'square', 70); },
    hitHeavy:   function(t, v){ noise(t, 0.1, 0.16 * v, 'brown'); beep(110, t, 0.14, 0.2 * v, 'sawtooth', 50); },
    crit:       function(t, v){ noise(t, 0.08, 0.14 * v, 'hi'); chord([523, 784, 1046], t, 0.16, 0.22 * v, 'square'); },
    kill:       function(t, v){ beep(220, t, 0.1, 0.12 * v, 'square', 90); noise(t, 0.1, 0.08 * v, 'brown'); },
    killBig:    function(t, v){ beep(160, t, 0.18, 0.18 * v, 'sawtooth', 60); chord([196, 247, 330], t + 0.04, 0.2, 0.14 * v, 'triangle'); },
    dodge:      function(t, v){ beep(1400, t, 0.05, 0.08 * v, 'sine', 2200); },
    block:      function(t, v){ beep(300, t, 0.08, 0.12 * v, 'square'); noise(t, 0.06, 0.06 * v, 'hi'); },
    shieldUp:   function(t, v){ beep(440, t, 0.12, 0.1 * v, 'triangle', 880); },
    shieldBreak:function(t, v){ noise(t, 0.16, 0.16 * v, 'hi'); beep(200, t, 0.14, 0.14 * v, 'sawtooth', 60); },
    playerHurt: function(t, v){ beep(140, t, 0.12, 0.16 * v, 'sawtooth', 70); noise(t, 0.1, 0.08 * v, 'brown'); },
    playerHurtBig:function(t, v){ beep(90, t, 0.22, 0.22 * v, 'sawtooth', 40); noise(t, 0.18, 0.14 * v, 'brown'); },
    heal:       function(t, v){ beep(523, t, 0.12, 0.1 * v, 'sine'); beep(784, t + 0.06, 0.14, 0.1 * v, 'sine'); },
    potion:     function(t, v){ noise(t, 0.12, 0.06 * v, 'hi'); beep(392, t, 0.1, 0.08 * v, 'triangle', 660); },
    dash:       function(t, v){ noise(t, 0.1, 0.1 * v, 'hi'); beep(280, t, 0.12, 0.1 * v, 'sine', 90); },
    magicBolt:  function(t, v){ beep(740, t, 0.12, 0.12 * v, 'sine', 220); noise(t, 0.08, 0.05 * v, 'hi'); },
    explode:    function(t, v){ noise(t, 0.28, 0.22 * v, 'brown'); beep(70, t, 0.25, 0.2 * v, 'sawtooth', 30); },
    burn:       function(t, v){ noise(t, 0.14, 0.08 * v, 'brown'); beep(180, t, 0.1, 0.06 * v, 'sawtooth'); },
    freeze:     function(t, v){ beep(1200, t, 0.1, 0.08 * v, 'sine', 1800); beep(1600, t + 0.04, 0.12, 0.07 * v, 'triangle'); },
    shock:      function(t, v){ noise(t, 0.06, 0.12 * v, 'hi'); beep(1800, t, 0.05, 0.1 * v, 'square'); },
    poison:     function(t, v){ beep(310, t, 0.14, 0.08 * v, 'triangle', 180); },
    curse:      function(t, v){ beep(110, t, 0.22, 0.14 * v, 'sawtooth', 55); chord([155, 185], t, 0.2, 0.08 * v, 'sine'); },
    summon:     function(t, v){ chord([196, 247, 311], t, 0.24, 0.16 * v, 'sine'); beep(98, t, 0.2, 0.08 * v, 'triangle'); },
    teleport:   function(t, v){ beep(200, t, 0.16, 0.1 * v, 'sine', 80); noise(t, 0.12, 0.08 * v, 'hi'); },
    arrow:      function(t, v){ beep(900, t, 0.07, 0.08 * v, 'square', 400); noise(t, 0.05, 0.04 * v, 'hi'); },
    tick:       function(t, v){ beep(880, t, 0.03, 0.05 * v, 'square'); },
    lavaStep:   function(t, v){ noise(t, 0.1, 0.08 * v, 'brown'); beep(90, t, 0.08, 0.06 * v, 'sawtooth'); },
    trapSpikes: function(t, v){ beep(1400, t, 0.05, 0.1 * v, 'square', 400); noise(t, 0.06, 0.08 * v, 'hi'); },
    waterStep:  function(t, v){ noise(t, 0.08, 0.05 * v, 'brown'); },
    altar:      function(t, v){ chord([261, 329, 392, 523], t, 0.4, 0.2 * v, 'sine'); },
    chestOpen:  function(t, v){ noise(t, 0.1, 0.08 * v, 'hi'); beep(330, t + 0.04, 0.12, 0.1 * v, 'triangle', 660); },
    descend:    function(t, v){ beep(220, t, 0.18, 0.12 * v, 'sine', 110); beep(165, t + 0.1, 0.2, 0.1 * v, 'sine', 82); },
    ult:        function(t, v){ chord([130, 196, 261, 392], t, 0.45, 0.28 * v, 'sawtooth'); noise(t, 0.2, 0.1 * v, 'hi'); },
    ultReady:   function(t, v){ chord([392, 523, 659], t, 0.28, 0.22 * v, 'triangle'); beep(784, t + 0.14, 0.2, 0.12 * v, 'sine'); },
    levelup:    function(t, v){ chord([523, 659, 784, 1046], t, 0.4, 0.24 * v, 'triangle'); },
    bossRoar:   function(t, v){ noise(t, 0.4, 0.18 * v, 'brown'); beep(70, t, 0.45, 0.22 * v, 'sawtooth', 40); },
    bossKill:   function(t, v){ chord([196, 247, 311, 392], t, 0.5, 0.28 * v, 'triangle'); noise(t, 0.3, 0.12 * v, 'brown'); },
    death:      function(t, v){ beep(220, t, 0.4, 0.18 * v, 'sine', 55); noise(t, 0.35, 0.1 * v, 'brown'); },
    victory:    function(t, v){ chord([261, 329, 392], t, 0.25, 0.2 * v); chord([329, 392, 523], t + 0.18, 0.3, 0.22 * v); chord([392, 523, 659, 784], t + 0.4, 0.5, 0.24 * v); },
    newBest:    function(t, v){ chord([523, 659, 784, 1046], t, 0.35, 0.24 * v); beep(1318, t + 0.2, 0.25, 0.14 * v, 'sine'); },
    combo:      function(t, v){ beep(660, t, 0.06, 0.12 * v, 'square'); beep(880, t + 0.04, 0.08, 0.12 * v, 'square'); }
  };

  function throttled(name, min){
    var t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (lastAt[name] && t - lastAt[name] < min) return true;
    lastAt[name] = t;
    return false;
  }

  function play(name, opts){
    if (muted || !inited && !init()) return;
    if (!ac) return;
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    opts = opts || {};
    var v = opts.vol != null ? opts.vol : 1;
    if (name === 'move' && throttled('move', 70)) return;
    if (name === 'tick' && throttled('tick', 40)) return;
    var fn = PATCH[name];
    if (!fn) fn = PATCH.uiClick;
    try { fn(now(), v); } catch(e){}
  }

  /* ─────────── Música ─────────── */
  var SCALES = {
    menu:    [110, 130.81, 146.83, 164.81, 196, 220],
    dungeon: [98, 116.54, 130.81, 146.83, 174.61, 196],
    boss:    [82.41, 98, 103.83, 123.47, 146.83, 164.81],
    death:   [73.42, 82.41, 98, 110],
    victory: [130.81, 164.81, 196, 246.94, 261.63]
  };

  function startDrone(){
    if (!ac || drone) return;
    var o1 = ac.createOscillator();
    var o2 = ac.createOscillator();
    var g = ac.createGain();
    o1.type = 'sine'; o2.type = 'sine';
    o1.frequency.value = 55;
    o2.frequency.value = 82.4;
    g.gain.value = 0.04;
    o1.connect(g); o2.connect(g); g.connect(musG);
    o1.start(); o2.start();
    drone = { o1:o1, o2:o2, g:g };
  }

  function pulseMusic(){
    if (!ac || !musicOn) return;
    var scale = SCALES[layer] || SCALES.dungeon;
    var t = now();
    var beat = layer === 'boss' ? 0.22 : (layer === 'menu' ? 0.55 : 0.38);
    var n = scale[musStep % scale.length];
    var oct = (musStep % 7 === 0) ? 2 : 1;
    beep(n * oct, t, 0.18 + intensity * 0.12, 0.035 + intensity * 0.05, 'triangle', 0, musG);
    if (intensity > 0.55 && musStep % 2 === 0){
      beep(n * 2, t + 0.08, 0.1, 0.03 * intensity, 'sine', 0, musG);
    }
    if (layer === 'boss' && musStep % 4 === 0){
      noise(t, 0.05, 0.025 + intensity * 0.03, 'brown');
    }
    musStep++;
    musTimer = setTimeout(pulseMusic, beat * 1000);
  }

  function startMusic(){
    if (!inited && !init()) return;
    if (!musicOn || muted) return;
    if (musTimer) return;
    if (musG){
      var t = now();
      musG.gain.cancelScheduledValues(t);
      musG.gain.setValueAtTime(musG.gain.value, t);
      musG.gain.linearRampToValueAtTime(0.55, t + 0.6);
    }
    pulseMusic();
  }

  function stopMusic(){
    if (musTimer){ clearTimeout(musTimer); musTimer = 0; }
    if (musG && ac){
      var t = now();
      musG.gain.cancelScheduledValues(t);
      musG.gain.linearRampToValueAtTime(0, t + 0.4);
    }
  }

  function setLayer(id){
    layer = id || 'dungeon';
    if (drone && ac){
      var t = now();
      var root = layer === 'boss' ? 41 : (layer === 'menu' ? 55 : (layer === 'victory' ? 65 : 49));
      drone.o1.frequency.linearRampToValueAtTime(root, t + 0.4);
      drone.o2.frequency.linearRampToValueAtTime(root * 1.5, t + 0.4);
    }
  }

  function setIntensity(x){
    targetInt = Util.clamp(x, 0, 1);
    intensity = intensity * 0.6 + targetInt * 0.4;
    if (drone && ac){
      drone.g.gain.setTargetAtTime(0.025 + intensity * 0.06, now(), 0.25);
    }
  }

  function setMuted(v){
    muted = !!v;
    if (!sfxG) return;
    sfxG.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.05);
  }

  function setMusicEnabled(v){
    musicOn = !!v;
    if (!musicOn) stopMusic();
    else if (!muted) startMusic();
  }

  return {
    init:init, play:play,
    setLayer:setLayer, setIntensity:setIntensity,
    startMusic:startMusic, stopMusic:stopMusic,
    setMuted:setMuted, setMusicEnabled:setMusicEnabled
  };
})();
