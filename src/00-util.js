/* ════════════════════════════════════════════════════════════════════
   00-util.js — RNG determinista, matemáticas y utilidades compartidas
   ════════════════════════════════════════════════════════════════════ */
"use strict";

/* ─────────── Matemáticas ─────────── */
var Util = (function(){

  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t){ return a + (b - a) * t; }
  /** Interpolación exponencial independiente del framerate. */
  function damp(a, b, rate, dt){ return b + (a - b) * Math.exp(-rate * dt); }
  function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
  function easeIn(t){ return t * t * t; }
  function easeInOut(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
  /** Rebote corto y seco, para pops de UI. */
  function easeBack(t){ var c = 1.70158 + 1; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); }

  function cheb(ax, ay, bx, by){ return Math.max(Math.abs(ax-bx), Math.abs(ay-by)); }
  function manh(ax, ay, bx, by){ return Math.abs(ax-bx) + Math.abs(ay-by); }
  function sign(n){ return n < 0 ? -1 : n > 0 ? 1 : 0; }

  /** Formatea números grandes para el HUD: 12480 -> "12.5k". */
  function fmt(n){
    n = Math.round(n);
    if (Math.abs(n) < 10000) return String(n);
    if (Math.abs(n) < 1000000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
    return (n/1000000).toFixed(2).replace(/\.00$/,'') + 'M';
  }
  /** Separador de miles con espacio fino, legible en cualquier idioma. */
  function fmtFull(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009'); }

  function fmtTime(ms){
    var s = Math.floor(ms/1000);
    return Math.floor(s/60) + ':' + String(s % 60).padStart(2,'0');
  }

  /** Hash FNV-1a: mismo texto -> misma semilla en cualquier dispositivo. */
  function hash(str){
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* ─────────── Colores ─────────── */
  function hexToRgb(hex){
    var h = hex.replace('#','');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgba(hex, a){
    var c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mixHex(a, b, t){
    var A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round(lerp(A[0],B[0],t)) + ',' +
                    Math.round(lerp(A[1],B[1],t)) + ',' +
                    Math.round(lerp(A[2],B[2],t)) + ')';
  }

  /* ─────────── DOM ─────────── */
  function el(id){ return document.getElementById(id); }
  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  /** Escapa texto de usuario antes de meterlo en innerHTML. */
  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function make(tag, cls, html){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  /** Listener táctil sin retardo de 300ms y sin doble disparo con el click. */
  function tap(node, fn){
    if (!node) return;
    var fired = 0;
    node.addEventListener('pointerdown', function(ev){
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      fired = Date.now();
      fn(ev);
    });
    node.addEventListener('click', function(ev){
      if (Date.now() - fired < 700) return;   // ya lo manejó pointerdown
      ev.preventDefault();
      fn(ev);
    });
  }

  function vibrate(ms){
    try { if (navigator.vibrate && Meta.opt('haptics')) navigator.vibrate(ms); } catch(e){}
  }

  /** Fecha local en YYYY-MM-DD, base del reto diario. */
  function todayKey(d){
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  /** Número de día desde el lanzamiento, para "Diario #231". */
  function dayNumber(d){
    var start = Date.UTC(2026, 0, 1);
    d = d || new Date();
    var now = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor((now - start) / 86400000) + 1;
  }

  return {
    clamp: clamp, lerp: lerp, damp: damp,
    easeOut: easeOut, easeIn: easeIn, easeInOut: easeInOut, easeBack: easeBack,
    cheb: cheb, manh: manh, sign: sign,
    fmt: fmt, fmtFull: fmtFull, fmtTime: fmtTime, hash: hash,
    hexToRgb: hexToRgb, rgba: rgba, mixHex: mixHex,
    el: el, qs: qs, qsa: qsa, esc: esc, make: make, tap: tap, vibrate: vibrate,
    todayKey: todayKey, dayNumber: dayNumber
  };
})();

/* ════════════════════════════════════════════════════════════════════
   RNG — mulberry32. Determinista: la misma semilla da la misma mazmorra
   en cualquier dispositivo. Es la promesa central del juego, así que
   TODO lo que afecte a la partida debe pasar por aquí y nunca por
   Math.random().
   ════════════════════════════════════════════════════════════════════ */
function RNG(seedStr){
  if (!(this instanceof RNG)) return new RNG(seedStr);
  this.seedStr = String(seedStr);
  this.a = Util.hash(this.seedStr);
  this.calls = 0;
}
RNG.prototype.next = function(){
  this.calls++;
  this.a = (this.a + 0x6D2B79F5) | 0;
  var t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
RNG.prototype.int    = function(n){ return Math.floor(this.next() * n); };
RNG.prototype.range  = function(a, b){ return a + Math.floor(this.next() * (b - a + 1)); };
RNG.prototype.float  = function(a, b){ return a + this.next() * (b - a); };
RNG.prototype.chance = function(p){ return this.next() < p; };
RNG.prototype.pick   = function(arr){ return arr.length ? arr[Math.floor(this.next() * arr.length)] : null; };
RNG.prototype.shuffle = function(arr){
  for (var i = arr.length - 1; i > 0; i--){
    var j = Math.floor(this.next() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
};
/** Elección ponderada. `wf` extrae el peso de cada elemento. */
RNG.prototype.weighted = function(arr, wf){
  var total = 0, i;
  for (i = 0; i < arr.length; i++) total += Math.max(0, wf(arr[i]));
  if (total <= 0) return this.pick(arr);
  var r = this.next() * total;
  for (i = 0; i < arr.length; i++){
    r -= Math.max(0, wf(arr[i]));
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
};
/** Sub-generador derivado: aísla flujos (mapa vs combate) sin desincronizar. */
RNG.prototype.fork = function(tag){ return new RNG(this.seedStr + '|' + tag); };

/* Generador NO determinista, sólo para efectos visuales y audio.
   Nunca debe influir en la partida. */
var vfxRand = Math.random;
