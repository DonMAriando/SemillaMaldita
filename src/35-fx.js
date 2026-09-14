/* ════════════════════════════════════════════════════════════════════
   35-fx.js — el "game feel": partículas, sacudida, hit-stop y textos
   flotantes.

   Nada de esto cambia una sola regla del juego, y sin embargo es la
   diferencia entre "una hoja de cálculo con mazmorras" y algo que
   apetece tocar. Todo en coordenadas de casilla (float), el render
   las convierte a píxeles.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var FX = (function(){

  var parts = [];        // partículas
  var floats = [];       // números y textos flotantes
  var rings = [];        // ondas de choque
  var bolts = [];        // rayos / flechas / proyectiles
  var shake = { t:0, power:0 };
  var hitStop = 0;       // segundos de congelación dramática
  var flash = { t:0, color:'#fff', power:0 };
  var MAXP = 420;

  function reduced(){ return Meta.opt('reduceMotion'); }

  function clear(){
    parts.length = 0; floats.length = 0; rings.length = 0; bolts.length = 0;
    shake.t = 0; shake.power = 0; hitStop = 0; flash.t = 0;
  }

  /* ─────────── Partículas ─────────── */
  function spawn(x, y, n, opts){
    if (reduced()) n = Math.ceil(n * 0.35);
    opts = opts || {};
    var color = opts.color || '#ffd166';
    var spd   = opts.speed  != null ? opts.speed  : 4;
    var life  = opts.life   != null ? opts.life   : 0.45;
    var size  = opts.size   != null ? opts.size   : 0.13;
    var grav  = opts.gravity!= null ? opts.gravity: 6;
    var dirA  = opts.dir;                 // radianes; si falta, 360º
    var spread= opts.spread != null ? opts.spread : Math.PI * 2;
    var shape = opts.shape || 'dot';      // dot | spark | shard | smoke
    for (var i = 0; i < n; i++){
      if (parts.length >= MAXP) parts.shift();
      var a = dirA != null ? dirA + (vfxRand() - 0.5) * spread : vfxRand() * Math.PI * 2;
      var v = spd * (0.45 + vfxRand() * 0.85);
      parts.push({
        x:x, y:y,
        vx:Math.cos(a) * v, vy:Math.sin(a) * v,
        t:life * (0.6 + vfxRand() * 0.8), max:life,
        c:color, s:size * (0.6 + vfxRand() * 0.9),
        g:grav, shape:shape, rot:vfxRand() * 6.28, vr:(vfxRand()-0.5) * 12
      });
    }
  }

  function blood(x, y, amount, color){
    spawn(x, y, Math.min(16, 3 + amount), {
      color: color || '#c92a3b', speed:5, life:0.5, size:0.12, gravity:11, shape:'shard'
    });
  }
  function sparks(x, y, color){
    spawn(x, y, 10, { color:color || '#ffd166', speed:7, life:0.3, size:0.08, gravity:2, shape:'spark' });
  }
  function smoke(x, y, color){
    spawn(x, y, 7, { color:color || '#5a5a72', speed:1.6, life:0.9, size:0.24, gravity:-2.2, shape:'smoke' });
  }
  function explosion(x, y, color){
    spawn(x, y, 26, { color:color || '#ff8f3f', speed:9, life:0.5, size:0.18, gravity:1.5, shape:'spark' });
    spawn(x, y, 12, { color:'#5a4a44', speed:3.5, life:1.0, size:0.3, gravity:-1.5, shape:'smoke' });
    ring(x, y, 3.2, color || '#ff8f3f', 0.45);
    kick(0.7); stop(0.07);
  }
  function frost(x, y){
    spawn(x, y, 14, { color:'#8ee7ff', speed:4, life:0.6, size:0.1, gravity:0.5, shape:'shard' });
  }
  function lightning(x, y){
    spawn(x, y, 12, { color:'#ffe066', speed:10, life:0.22, size:0.07, gravity:0, shape:'spark' });
  }
  function heal(x, y){
    spawn(x, y, 14, { color:'#7cffb2', speed:2.2, life:0.9, size:0.11, gravity:-4, shape:'dot' });
  }
  function glow(x, y, color){
    spawn(x, y, 12, { color:color || '#c77dff', speed:2, life:0.8, size:0.12, gravity:-3, shape:'dot' });
  }

  /* ─────────── Ondas ─────────── */
  function ring(x, y, radius, color, life, width){
    if (reduced()) return;
    rings.push({ x:x, y:y, r:radius, c:color || '#fff', t:life || 0.4, max:life || 0.4, w:width || 0.14 });
  }

  /* ─────────── Proyectiles / rayos ─────────── */
  function bolt(x0, y0, x1, y1, color, life, style){
    bolts.push({ x0:x0, y0:y0, x1:x1, y1:y1, c:color || '#ffe066',
                 t:life || 0.2, max:life || 0.2, style:style || 'beam' });
  }

  /* ─────────── Texto flotante ─────────── */
  function text(x, y, txt, color, opts){
    if (!Meta.opt('showDamage') && (opts && opts.isDamage)) return;
    opts = opts || {};
    floats.push({
      x:x, y:y, txt:String(txt), c:color || '#fff',
      t:opts.life || 0.85, max:opts.life || 0.85,
      scale:opts.scale || 1, big:!!opts.big,
      vx:(vfxRand() - 0.5) * 0.5, crit:!!opts.crit
    });
    /* Muchos números en el mismo sitio se apilan e ilegible: desplazamos. */
    if (floats.length > 40) floats.shift();
  }

  /* ─────────── Cámara ─────────── */
  function kick(power){
    if (!Meta.opt('shake') || reduced()) return;
    shake.power = Math.min(1.4, Math.max(shake.power, power));
    shake.t = Math.max(shake.t, 0.12 + power * 0.18);
  }
  /** Micro-pausa al conectar un golpe fuerte. Lo que hace que "pegue". */
  function stop(sec){
    if (reduced()) return;
    hitStop = Math.max(hitStop, sec);
  }
  function screenFlash(color, power, life){
    if (reduced()) return;
    flash.color = color; flash.power = power || 0.3;
    flash.t = life || 0.18; flash.max = flash.t;
  }

  function shakeOffset(){
    if (shake.t <= 0) return { x:0, y:0 };
    var p = shake.t * shake.power;
    return { x:(vfxRand() - 0.5) * p * 2.6, y:(vfxRand() - 0.5) * p * 2.6 };
  }

  /* ─────────── Actualización ─────────── */
  function update(dt){
    if (hitStop > 0){
      hitStop -= dt;
      dt *= 0.08;          // el mundo casi se detiene, pero no del todo
    }
    var i;
    for (i = parts.length - 1; i >= 0; i--){
      var p = parts[i];
      p.t -= dt;
      if (p.t <= 0){ parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.vx *= (1 - 2.4 * dt); p.vy *= (1 - 1.1 * dt);
      p.rot += p.vr * dt;
    }
    for (i = floats.length - 1; i >= 0; i--){
      var f = floats[i];
      f.t -= dt;
      if (f.t <= 0){ floats.splice(i, 1); continue; }
      f.y -= dt * 1.5;
      f.x += f.vx * dt;
    }
    for (i = rings.length - 1; i >= 0; i--){
      rings[i].t -= dt;
      if (rings[i].t <= 0) rings.splice(i, 1);
    }
    for (i = bolts.length - 1; i >= 0; i--){
      bolts[i].t -= dt;
      if (bolts[i].t <= 0) bolts.splice(i, 1);
    }
    if (shake.t > 0){
      shake.t -= dt * 3.2;
      if (shake.t <= 0){ shake.t = 0; shake.power = 0; }
    }
    if (flash.t > 0) flash.t -= dt;
  }

  return {
    clear:clear, update:update,
    spawn:spawn, blood:blood, sparks:sparks, smoke:smoke, explosion:explosion,
    frost:frost, lightning:lightning, heal:heal, glow:glow,
    ring:ring, bolt:bolt, text:text,
    kick:kick, stop:stop, screenFlash:screenFlash, shakeOffset:shakeOffset,
    get parts(){ return parts; },
    get floats(){ return floats; },
    get rings(){ return rings; },
    get bolts(){ return bolts; },
    get flash(){ return flash; },
    get frozen(){ return hitStop > 0; }
  };
})();
