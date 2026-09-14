/* =============================================================================
   70-sprites.js  —  Sprites vectoriales (Canvas 2D puro) para Semilla Maldita
   -----------------------------------------------------------------------------
   Script clasico (NO module). Autocontenido: no usa ninguna global del proyecto.
   Todo se dibuja con paths: nada de imagenes, emoji, SVG ni fuentes.

   Espacio de trabajo: cada sprite se dibuja en un cuadrado de 100x100 unidades
   centrado en (0,0)  ->  x,y en [-50, 50].  El suelo esta en y = +44.
   El motor solo pasa (cx, cy, size) y nosotros escalamos size/100.

   API:
     Sprites.drawCreature(ctx, kind, cx, cy, size, opts)
     Sprites.drawHero(ctx, classId, cx, cy, size, opts)
     Sprites.drawItem(ctx, kind, cx, cy, size, opts)
     Sprites.palette(kind) -> {main, dark, light, accent}
     Sprites.hasKind(kind) -> bool
   ========================================================================== */
window.Sprites = (function () {
  "use strict";

  var TAU = Math.PI * 2, PI = Math.PI;
  var sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, abs = Math.abs;
  var EMPTY = {};

  /* ===========================================================================
     1. COLOR  (todo memoizado: se llama miles de veces por frame)
     ======================================================================== */

  var _hex = {};
  function parseHex(c) {
    var v = _hex[c];
    if (v) return v;
    var s = c.charAt(0) === "#" ? c.substring(1) : c;
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16) || 0;
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _hex[c] = v;
    return v;
  }
  function toHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).substring(1);
  }
  function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

  var _mixC = {}, _mixN = 0;
  // mezcla lineal entre dos hex
  function mix(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    var k = a + ">" + b + ">" + t.toFixed(3);
    var v = _mixC[k];
    if (v) return v;
    var A = parseHex(a), B = parseHex(b);
    v = toHex(cl(A[0] + (B[0] - A[0]) * t + 0.5), cl(A[1] + (B[1] - A[1]) * t + 0.5), cl(A[2] + (B[2] - A[2]) * t + 0.5));
    if (_mixN > 6000) { _mixC = {}; _mixN = 0; }
    _mixC[k] = v; _mixN++;
    return v;
  }
  function lite(c, t) { return mix(c, "#ffffff", t); }
  function dark(c, t) { return mix(c, "#04040a", t); }

  var _aC = {}, _aN = 0;
  // hex -> rgba() con alpha
  function A(c, a) {
    var k = c + "@" + a.toFixed(3);
    var v = _aC[k];
    if (v) return v;
    var C = parseHex(c);
    v = "rgba(" + C[0] + "," + C[1] + "," + C[2] + "," + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ")";
    if (_aN > 6000) { _aC = {}; _aN = 0; }
    _aC[k] = v; _aN++;
    return v;
  }

  /* ===========================================================================
     2. RUIDO DETERMINISTA  (nunca Math.random dentro del dibujo)
     ======================================================================== */

  var _phC = {};
  // desfase por especie, para que no respiren todas al unisono
  function phase(kind) {
    var v = _phC[kind];
    if (v !== undefined) return v;
    var h = 2166136261, i;
    for (i = 0; i < kind.length; i++) { h ^= kind.charCodeAt(i); h = (h * 16777619) >>> 0; }
    v = (h % 997) / 997 * 24;
    _phC[kind] = v;
    return v;
  }
  // pseudo-aleatorio estable por indice (para colocar detalles)
  function nz(i) { var x = sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }

  /* ===========================================================================
     3. PATHS + TRAZO
     ======================================================================== */

  var _k = 1; // unidades por pixel de pantalla (se fija en render)
  // grosor de linea con minimo de ~1px real, para que no se desvanezca a 22px
  function lw(u) { var m = _k * 0.95; return u > m ? u : m; }

  function P(ctx) { ctx.beginPath(); }
  function cir(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r < 0 ? 0 : r, 0, TAU); }
  function ell(ctx, x, y, rx, ry, rot) {
    rot = rot || 0;
    ctx.moveTo(x + abs(rx) * cos(rot), y + abs(rx) * sin(rot));
    ctx.ellipse(x, y, abs(rx), abs(ry), rot, 0, TAU);
  }
  // rect redondeado CENTRADO
  function rrc(ctx, x, y, w, h, r) {
    var hw = w / 2, hh = h / 2;
    r = min(r, hw, hh);
    ctx.moveTo(x - hw + r, y - hh);
    ctx.lineTo(x + hw - r, y - hh); ctx.quadraticCurveTo(x + hw, y - hh, x + hw, y - hh + r);
    ctx.lineTo(x + hw, y + hh - r); ctx.quadraticCurveTo(x + hw, y + hh, x + hw - r, y + hh);
    ctx.lineTo(x - hw + r, y + hh); ctx.quadraticCurveTo(x - hw, y + hh, x - hw, y + hh - r);
    ctx.lineTo(x - hw, y - hh + r); ctx.quadraticCurveTo(x - hw, y - hh, x - hw + r, y - hh);
    ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }
  function tri(ctx, ax, ay, bx, by, cx, cy) {
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
  }

  function fl(ctx, c) { ctx.fillStyle = c; ctx.fill(); }
  function st(ctx, c, w) { ctx.strokeStyle = c; ctx.lineWidth = lw(w || 3); ctx.stroke(); }
  // relleno + contorno oscuro (el "chunky" del estilo)
  function sh(ctx, S, c, w) { ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = S.ink; ctx.lineWidth = lw(w || 3.2); ctx.stroke(); }
  function line(ctx, ax, ay, bx, by, c, w) {
    P(ctx); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); st(ctx, c, w);
  }

  /* ===========================================================================
     4. GRADIENTES CACHEADOS  (por contexto + radio + paradas)
     Los gradientes se resuelven en el espacio de usuario del MOMENTO DE PINTAR,
     asi que al estar siempre en el espacio-unidad podemos reutilizarlos.
     ======================================================================== */

  var _cid = 0;
  function ctxId(ctx) { if (!ctx.__sprId) ctx.__sprId = ++_cid; return ctx.__sprId; }

  var _grad = {}, _gradN = 0;
  // radial centrado en (0,0) -> hay que translate() antes de usarlo
  function rad(ctx, r, stops) {
    var key = ctxId(ctx) + "r" + r + "|" + stops.join(";");
    var g = _grad[key];
    if (g) return g;
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    if (_gradN > 700) { _grad = {}; _gradN = 0; }
    _grad[key] = g; _gradN++;
    return g;
  }
  // lineal vertical entre y0 e y1
  function vg(ctx, y0, y1, stops) {
    var key = ctxId(ctx) + "v" + y0 + "_" + y1 + "|" + stops.join(";");
    var g = _grad[key];
    if (g) return g;
    g = ctx.createLinearGradient(0, y0, 0, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    if (_gradN > 700) { _grad = {}; _gradN = 0; }
    _grad[key] = g; _gradN++;
    return g;
  }

  // resplandor suave. El radio se cuantiza para no inflar la cache cada frame.
  function glow(ctx, x, y, r, c, a) {
    r = Math.round(r * 0.5) * 2;
    if (r < 2) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= (a === undefined ? 1 : a);
    ctx.fillStyle = rad(ctx, r, [[0, A(c, 0.85)], [0.42, A(c, 0.34)], [1, A(c, 0)]]);
    P(ctx); cir(ctx, 0, 0, r); ctx.fill();
    ctx.restore();
  }

  /* ===========================================================================
     5. PIEZAS REUTILIZABLES
     ======================================================================== */

  // sombra de contacto en el suelo
  function shadow(ctx, w, y, a) {
    ctx.save();
    ctx.globalAlpha *= (a === undefined ? 0.36 : a);
    P(ctx); ell(ctx, 0, y === undefined ? 44 : y, w, w * 0.25);
    fl(ctx, "#000006");
    ctx.restore();
  }

  // brillo superior para dar volumen
  function hi(ctx, x, y, rx, ry, c, a, rot) {
    ctx.save();
    ctx.globalAlpha *= (a === undefined ? 0.5 : a);
    P(ctx); ell(ctx, x, y, rx, ry, rot || 0);
    fl(ctx, c);
    ctx.restore();
  }

  // par de ojos con esclerotica + pupila + destello
  function eyes(ctx, x, y, dx, r, look, inkc, whi) {
    whi = whi || "#f2f6ff";
    inkc = inkc || "#0e0e18";
    look = look || 0;
    for (var i = -1; i <= 1; i += 2) {
      var ex = x + i * dx;
      P(ctx); cir(ctx, ex, y, r); fl(ctx, whi); st(ctx, A(inkc, 0.6), 1.5);
      var px = ex + look * r * 0.34, py = y + r * 0.06;
      P(ctx); cir(ctx, px, py, r * 0.55); fl(ctx, inkc);
      P(ctx); cir(ctx, px - r * 0.2, py - r * 0.22, r * 0.2); fl(ctx, "#ffffff");
    }
  }

  // ojos brillantes (no-muertos, demonios, golems)
  function eyesGlow(ctx, x, y, dx, r, c) {
    for (var i = -1; i <= 1; i += 2) {
      var ex = x + i * dx;
      glow(ctx, ex, y, r * 3.4, c, 0.7);
      P(ctx); cir(ctx, ex, y, r); fl(ctx, lite(c, 0.5));
      P(ctx); cir(ctx, ex, y, r * 0.45); fl(ctx, "#ffffff");
    }
  }

  // cejas enfadadas
  function brows(ctx, x, y, dx, len, c) {
    for (var i = -1; i <= 1; i += 2) {
      P(ctx);
      ctx.moveTo(x + i * (dx - len * 0.5), y - len * 0.35);
      ctx.lineTo(x + i * (dx + len * 0.5), y + len * 0.25);
      st(ctx, c, 3.4);
    }
  }

  // llama de 3 capas, oscila con t
  function flame(ctx, x, y, w, h, t, sp) {
    sp = sp || 9;
    var layers = [[1, "#ff6a12"], [0.64, "#ffb52a"], [0.33, "#fff4bd"]];
    for (var i = 0; i < layers.length; i++) {
      var s = layers[i][0];
      var wob = sin(t * sp + i * 1.7) * 0.34;
      var ww = w * s, hh = h * s * (1 + sin(t * sp * 0.7 + i) * 0.08);
      P(ctx);
      ctx.moveTo(x - ww * 0.5, y);
      ctx.quadraticCurveTo(x - ww * 0.62, y - hh * 0.55, x + wob * ww * 0.5, y - hh);
      ctx.quadraticCurveTo(x + ww * 0.62, y - hh * 0.5, x + ww * 0.5, y);
      ctx.quadraticCurveTo(x, y + hh * 0.14, x - ww * 0.5, y);
      ctx.closePath();
      fl(ctx, layers[i][1]);
    }
  }

  // hoja de espada/daga genérica (apuntando hacia arriba desde 0,0)
  function blade(ctx, S, len, wid, metal) {
    metal = metal || "#c9d2e0";
    P(ctx);
    ctx.moveTo(0, 0);
    ctx.lineTo(-wid * 0.5, -len * 0.12);
    ctx.lineTo(-wid * 0.42, -len * 0.86);
    ctx.lineTo(0, -len);
    ctx.lineTo(wid * 0.42, -len * 0.86);
    ctx.lineTo(wid * 0.5, -len * 0.12);
    ctx.closePath();
    sh(ctx, S, metal, 2.6);
    line(ctx, -wid * 0.1, -len * 0.16, -wid * 0.1, -len * 0.8, A("#ffffff", 0.55), 1.8);
  }

  /* ===========================================================================
     6. PALETAS
     ======================================================================== */

  var PAL = {
    /* --- criaturas --- */
    rat:      { main: "#9a7250", dark: "#5c4029", light: "#c9a781", accent: "#e59aa0" },
    bat:      { main: "#6d4b86", dark: "#37224a", light: "#a983c4", accent: "#ffd34d" },
    slime:    { main: "#57c94a", dark: "#1f6b27", light: "#b6f58f", accent: "#e9fff0" },
    goblin:   { main: "#7fae3c", dark: "#3f6120", light: "#bede77", accent: "#ffe15c" },
    archer:   { main: "#cfc7ae", dark: "#4a4432", light: "#efe9d6", accent: "#7ef2c8" },
    spider:   { main: "#332e42", dark: "#110f19", light: "#6f6887", accent: "#ff3a3a" },
    skeleton: { main: "#e2dcc6", dark: "#5c5744", light: "#fbf7e8", accent: "#96a7bd" },
    bomber:   { main: "#3a3547", dark: "#15121d", light: "#6d6683", accent: "#ff8a1e" },
    cultist:  { main: "#6b3fa8", dark: "#301a4d", light: "#a075d6", accent: "#ffd36e" },
    orc:      { main: "#68883c", dark: "#31451b", light: "#9dbb6a", accent: "#f2ead0" },
    wraith:   { main: "#6f9ada", dark: "#28406e", light: "#bcdcff", accent: "#7ef7ff" },
    shaman:   { main: "#2f7b6e", dark: "#12382f", light: "#6fc0ad", accent: "#ffcf5c" },
    golem:    { main: "#7a766c", dark: "#3a382f", light: "#aba69a", accent: "#ff8e21" },
    mimic:    { main: "#8a5a2c", dark: "#452a13", light: "#c08b4d", accent: "#ff6f8d" },
    knight:   { main: "#69738a", dark: "#2c3244", light: "#a8b2c6", accent: "#b7352f" },
    demon:    { main: "#c93a2c", dark: "#651511", light: "#f57a52", accent: "#ffd23d" },
    hound:    { main: "#4b3a56", dark: "#1e1528", light: "#7a6389", accent: "#ff8a24" },
    eye:      { main: "#efecf6", dark: "#5a3f72", light: "#ffffff", accent: "#ffb02e" },
    /* --- jefes --- */
    boss_rat:      { main: "#8b6242", dark: "#4a3120", light: "#c6a17a", accent: "#ffcf3d" },
    boss_bones:    { main: "#e6e0c8", dark: "#514c3b", light: "#fffdf1", accent: "#6cff9e" },
    boss_troll:    { main: "#7f9152", dark: "#3b4522", light: "#b3c483", accent: "#d9c9a5" },
    boss_devourer: { main: "#5c2489", dark: "#250d3c", light: "#a04fd6", accent: "#ffe14d" },
    boss_seed:     { main: "#8c2340", dark: "#3d0d1d", light: "#d6577a", accent: "#ffd14a" },
    /* --- heroes --- */
    vagabundo: { main: "#8d93a3", dark: "#3c4050", light: "#ccd2e2", accent: "#c8a35e" },
    berserker: { main: "#d79a6e", dark: "#6e442a", light: "#f3c79e", accent: "#d63a2c" },
    arcanista: { main: "#3f6bd4", dark: "#1a2c63", light: "#8fb2ff", accent: "#73f2ff" },
    centinela: { main: "#8b93a6", dark: "#3a4055", light: "#d3dbea", accent: "#e8c45c" },
    ladron:    { main: "#4c566d", dark: "#212634", light: "#8c96ae", accent: "#d94455" },
    nigromante:{ main: "#3d2a52", dark: "#160e22", light: "#8a6aad", accent: "#9cffb0" },
    /* --- objetos --- */
    potion:    { main: "#e03a4a", dark: "#6d1220", light: "#ff8f8f", accent: "#bfeaff" },
    potionBig: { main: "#e03a4a", dark: "#6d1220", light: "#ff8f8f", accent: "#ffd76a" },
    gold:      { main: "#ffc32e", dark: "#8a5c06", light: "#fff2a8", accent: "#ffffff" },
    gem:       { main: "#39d8e8", dark: "#0d5c72", light: "#c3fbff", accent: "#ffffff" },
    chest:     { main: "#9a6631", dark: "#4a2d12", light: "#cfa062", accent: "#ffc32e" },
    chestOpen: { main: "#9a6631", dark: "#4a2d12", light: "#cfa062", accent: "#ffd84a" },
    heart:     { main: "#ee3a55", dark: "#77132a", light: "#ff9aa8", accent: "#ffffff" },
    sword:     { main: "#c3ccdb", dark: "#3d4556", light: "#ffffff", accent: "#a5712f" },
    shield:    { main: "#8d97ad", dark: "#343a4c", light: "#d8e0f0", accent: "#c0362f" },
    scroll:    { main: "#e8d9a8", dark: "#6b5b32", light: "#fff6d8", accent: "#c0362f" },
    key:       { main: "#f0c03a", dark: "#7a5a08", light: "#fff0a8", accent: "#ffffff" },
    bomb:      { main: "#35313f", dark: "#131119", light: "#68627a", accent: "#ff8a1e" },
    relic:     { main: "#a45ce0", dark: "#3e1a5e", light: "#e2b6ff", accent: "#ffe14d" },
    stairs:    { main: "#5e5c6b", dark: "#1a1922", light: "#8f8da0", accent: "#2aa7c8" },
    altar:     { main: "#6b6878", dark: "#2a2833", light: "#9e9bad", accent: "#63e6ff" },
    forge:     { main: "#55596b", dark: "#232636", light: "#8e94a8", accent: "#ff8a1e" },
    skull:     { main: "#ece6d2", dark: "#5e5847", light: "#fffdf3", accent: "#8a8574" },
    torch:     { main: "#8a5f34", dark: "#432c15", light: "#c39159", accent: "#ffb52a" },
    spikes:    { main: "#9aa3b5", dark: "#353b4c", light: "#e0e7f5", accent: "#b03a3a" },
    web:       { main: "#d6dced", dark: "#5a6070", light: "#ffffff", accent: "#9aa3b5" },
    rune:      { main: "#5a6480", dark: "#232a3c", light: "#8e99b8", accent: "#7be0ff" }
  };

  var FALLBACK_PAL = { main: "#ff3df0", dark: "#5c0a55", light: "#ffb3f6", accent: "#ffffff" };

  function pal(kind) { return PAL[kind] || FALLBACK_PAL; }

  /* ===========================================================================
     7. TINTES DE ESTADO
     Todos los colores pasan por st.C(), que es la identidad si no hay estados.
     ======================================================================== */

  function ID(c) { return c; }

  var _tint = {};
  function tinter(key, ops) {
    var T = _tint[key];
    if (T) return T;
    var m = {};
    T = function (c) {
      var v = m[c];
      if (v === undefined) {
        v = c;
        for (var i = 0; i < ops.length; i++) v = mix(v, ops[i][0], ops[i][1]);
        m[c] = v;
      }
      return v;
    };
    _tint[key] = T;
    return T;
  }

  function buildTinter(o) {
    var ops = [], key = "";
    if (o.frozen) { ops.push(["#a6e8ff", 0.46]); key += "F"; }
    if (o.poisoned) { ops.push(["#7ee055", 0.40]); key += "P"; }
    if (o.burning) { ops.push(["#ff8a2e", 0.24]); key += "B"; }
    if (o.enraged) { ops.push(["#ff2f1e", 0.28]); key += "E"; }
    if (o.dead) { ops.push(["#3a3546", 0.52]); key += "D"; }
    var h = o.hurt ? (o.hurt > 1 ? 1 : o.hurt) : 0;
    if (h > 0.02) {
      var q = Math.round(h * 8) / 8;
      ops.push(["#fff0ee", q * 0.88]);
      key += "H" + q;
    }
    if (o.lowHp) { ops.push(["#ff5544", 0.16]); key += "L"; }
    if (!key) return ID;
    return tinter(key, ops);
  }

  /* ===========================================================================
     8. EFECTOS (encima / debajo del sprite)
     ======================================================================== */

  // aura dorada de elite (detras)
  function fxElite(ctx, S) {
    var t = S.t, r = 45 + sin(t * 2.1) * 2;
    ctx.save();
    ctx.translate(0, 4);
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = rad(ctx, 54, [[0, A("#ffd34a", 0)], [0.58, A("#ffd34a", 0.06)], [0.86, A("#ffe89a", 0.26)], [1, A("#ffd34a", 0)]]);
    P(ctx); cir(ctx, 0, 0, 54); ctx.fill();
    ctx.globalAlpha *= 0.9;
    P(ctx); cir(ctx, 0, 0, r); st(ctx, A("#ffdf7a", 0.75), 2.6);
    for (var i = 0; i < 3; i++) {
      var a = t * 1.3 + i * TAU / 3;
      P(ctx); cir(ctx, cos(a) * r, sin(a) * r * 0.9, 3.2);
      fl(ctx, "#fff3b0");
    }
    ctx.restore();
  }

  // burbuja de escudo (encima)
  function fxShield(ctx, S, k) {
    k = k === undefined ? 1 : k;
    if (k <= 0) return;
    var r = 46 + sin(S.t * 3) * 1.4;
    ctx.save();
    ctx.globalAlpha *= 0.5 * k;
    ctx.translate(0, 2);
    ctx.fillStyle = rad(ctx, r, [[0, A("#8ff0ff", 0.04)], [0.72, A("#8ff0ff", 0.1)], [1, A("#d8fbff", 0.38)]]);
    P(ctx); cir(ctx, 0, 0, r); ctx.fill();
    P(ctx); cir(ctx, 0, 0, r); st(ctx, A("#b9f4ff", 0.85), 2.4);
    P(ctx); ctx.arc(0, 0, r * 0.82, -2.5, -1.5); st(ctx, A("#ffffff", 0.7), 2.6);
    ctx.restore();
  }

  // telegrafiado de ataque: tension + destellos
  function fxCharge(ctx, S) {
    var k = 0.5 + 0.5 * sin(S.t * 15);
    ctx.save();
    ctx.globalAlpha *= 0.3 + 0.55 * k;
    for (var i = 0; i < 2; i++) {
      var a0 = -0.95 + i * PI;
      P(ctx); ctx.arc(0, 2, 44 + k * 5, a0, a0 + 1.15);
      st(ctx, "#fff2b8", 3.6);
    }
    ctx.restore();
    // tension: halo calido muy tenue por detras
    glow(ctx, 0, 4, 40, "#ffd98a", 0.16 + k * 0.14);
  }

  // escarcha
  function fxFrost(ctx, S) {
    ctx.save();
    P(ctx); ell(ctx, 0, 6, 40, 41);
    st(ctx, A("#9fe8ff", 0.42), 2.4);
    for (var i = 0; i < 6; i++) {
      var a = i * TAU / 6 + 0.4, rr = 30 + nz(i) * 12;
      var x = cos(a) * rr, y = 6 + sin(a) * rr * 0.9;
      var s = 4 + (i % 3) * 1.7;
      P(ctx);
      ctx.moveTo(x, y - s * 1.7); ctx.lineTo(x + s * 0.8, y);
      ctx.lineTo(x, y + s * 1.7); ctx.lineTo(x - s * 0.8, y);
      ctx.closePath();
      fl(ctx, A("#e6f9ff", 0.72));
    }
    ctx.restore();
  }

  // lenguas de fuego
  function fxBurn(ctx, S) {
    var t = S.t;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha *= 0.72;
    // lenguas en el contorno, no encima de la cara: el bicho sigue leyendose
    var pos = [[-27, 26], [-16, -12], [3, -24], [20, -14], [28, 22]];
    for (var i = 0; i < pos.length; i++) {
      var pu = sin(t * 7 + i * 2.1) * 0.5 + 0.5;
      flame(ctx, pos[i][0], pos[i][1], 10 + pu * 3, 18 + pu * 9, t + i * 0.7, 11);
    }
    ctx.restore();
  }

  // veneno: burbujas que suben
  function fxPoison(ctx, S) {
    var t = S.t;
    ctx.save();
    for (var i = 0; i < 4; i++) {
      var ph = (t * 0.55 + nz(i * 3.1)) % 1;
      var x = -26 + nz(i) * 52 + sin(t * 2 + i) * 3;
      var y = 34 - ph * 62;
      var r = 3 + nz(i + 7) * 3.4;
      ctx.globalAlpha = 0.75 * (1 - ph);
      P(ctx); cir(ctx, x, y, r);
      fl(ctx, A("#9bf06a", 0.8)); st(ctx, A("#3f7a22", 0.8), 1.6);
    }
    ctx.restore();
  }

  // furia: vapor rojo en los hombros
  function fxEnraged(ctx, S) {
    var t = S.t;
    ctx.save();
    ctx.globalAlpha *= 0.55;
    for (var i = 0; i < 4; i++) {
      var ph = (t * 0.9 + i * 0.25) % 1;
      var x = (i < 2 ? -1 : 1) * (22 + (i % 2) * 7);
      P(ctx); cir(ctx, x + sin(t * 3 + i) * 4, -14 - ph * 26, 5 - ph * 3.2);
      fl(ctx, A("#ff6a4a", 0.7 * (1 - ph)));
    }
    ctx.restore();
  }

  /* ===========================================================================
     9. CRIATURAS
     ======================================================================== */

  var CREATURES = {};

  /* --- RATA: cuadrupedo bajo, hocico puntiagudo, cola larga ---------------- */
  CREATURES.rat = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 2.6) * 1.4;
    shadow(ctx, 30, 44);
    // cola: curva larga hacia atras que ondula
    P(ctx);
    ctx.moveTo(-22, 20 + bob);
    ctx.quadraticCurveTo(-42, 18 + sin(t * 3.4) * 6, -46, -4 + sin(t * 3.4) * 8);
    st(ctx, C(p.dark), 4.4);
    P(ctx);
    ctx.moveTo(-22, 20 + bob);
    ctx.quadraticCurveTo(-42, 18 + sin(t * 3.4) * 6, -46, -4 + sin(t * 3.4) * 8);
    st(ctx, C(p.accent), 2.4);
    // patas
    for (var i = 0; i < 4; i++) {
      var lx = -18 + i * 12;
      P(ctx); rrc(ctx, lx, 34 + bob * 0.3, 8, 14, 4); sh(ctx, S, C(p.dark), 2.4);
    }
    // cuerpo
    P(ctx); ell(ctx, -4, 16 + bob, 27, 18, -0.1);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -10, 5 + bob, 16, 7, C(p.light), 0.45, -0.25);
    // orejas
    for (var e = 0; e < 2; e++) {
      var ex = 14 + e * 12, ey = -8 - e * 2 + bob;
      P(ctx); cir(ctx, ex, ey, 9); sh(ctx, S, C(p.main), 2.8);
      P(ctx); cir(ctx, ex, ey, 4.6); fl(ctx, C(p.accent));
    }
    // cabeza + hocico
    P(ctx);
    ctx.moveTo(8, 0 + bob);
    ctx.quadraticCurveTo(24, -11 + bob, 38, 2 + bob);
    ctx.lineTo(45, 10 + bob);
    ctx.quadraticCurveTo(30, 20 + bob, 10, 15 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, 22, -2 + bob, 11, 4, C(p.light), 0.4, -0.3);
    // nariz + bigotes
    P(ctx); cir(ctx, 44, 9 + bob, 3.2); fl(ctx, C(p.accent));
    line(ctx, 40, 8 + bob, 52, 2 + bob, A(C(p.light), 0.6), 1.4);
    line(ctx, 40, 11 + bob, 52, 14 + bob, A(C(p.light), 0.6), 1.4);
    // dientecillo
    P(ctx); tri(ctx, 38, 14 + bob, 42, 14 + bob, 40, 19 + bob); fl(ctx, "#fffbe8");
    // ojo
    eyes(ctx, 24, 4 + bob, 0, 4.6, 0.6, "#14101a");
  };

  /* --- MURCIELAGO: alas que aletean rapido ------------------------------- */
  CREATURES.bat = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var fp = sin(t * 8.5);
    var fy = fp * 14, bob = -sin(t * 8.5 + 1) * 2.5 - 2;
    shadow(ctx, 18, 46, 0.24);
    // alas (se dibujan detras del cuerpo)
    for (var s = -1; s <= 1; s += 2) {
      P(ctx);
      ctx.moveTo(s * 9, 2 + bob);
      ctx.quadraticCurveTo(s * 28, -16 + fy, s * 52, -6 + fy * 1.2);
      ctx.quadraticCurveTo(s * 40, 4 + fy * 0.8, s * 38, 14 + fy * 0.7);
      ctx.quadraticCurveTo(s * 30, 6 + fy * 0.6, s * 24, 16 + fy * 0.5);
      ctx.quadraticCurveTo(s * 18, 8 + fy * 0.4, s * 10, 16 + bob);
      ctx.closePath();
      sh(ctx, S, C(p.main), 3);
      // nervaduras
      line(ctx, s * 11, 3 + bob, s * 37, 8 + fy * 0.8, A(C(p.dark), 0.7), 1.8);
      line(ctx, s * 11, 3 + bob, s * 23, 11 + fy * 0.5, A(C(p.dark), 0.7), 1.8);
    }
    // orejas
    for (var e = -1; e <= 1; e += 2) {
      P(ctx); tri(ctx, e * 4, -14 + bob, e * 15, -34 + bob, e * 15, -12 + bob);
      sh(ctx, S, C(p.light), 2.6);
    }
    // cuerpo
    P(ctx); ell(ctx, 0, 4 + bob, 16, 18);
    sh(ctx, S, C(p.light), 3.2);
    hi(ctx, -5, -6 + bob, 8, 6, "#ffffff", 0.3);
    // colmillos
    P(ctx); tri(ctx, -5, 14 + bob, -1, 14 + bob, -3, 21 + bob); fl(ctx, "#fffbe8");
    P(ctx); tri(ctx, 1, 14 + bob, 5, 14 + bob, 3, 21 + bob); fl(ctx, "#fffbe8");
    // ojos grandes
    eyes(ctx, 0, 0 + bob, 7, 5.4, S.look, "#1a1024", "#fff3c4");
    // patitas
    P(ctx); rrc(ctx, -5, 22 + bob, 4, 7, 2); fl(ctx, C(p.dark));
    P(ctx); rrc(ctx, 5, 22 + bob, 4, 7, 2); fl(ctx, C(p.dark));
  };

  /* --- LIMO: se aplasta y rebota, gelatinoso ------------------------------ */
  CREATURES.slime = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var q = sin(t * 3.1);
    var w = 34 + q * 4, h = 33 - q * 6;
    var base = 42;
    shadow(ctx, w * 0.95, base + 2, 0.3);
    // cuerpo: domo con base plana
    ctx.save();
    ctx.globalAlpha *= 0.9;
    P(ctx);
    ctx.moveTo(-w, base);
    ctx.bezierCurveTo(-w - 2, base - h * 1.1, -w * 0.55, base - h * 2, 0, base - h * 2);
    ctx.bezierCurveTo(w * 0.55, base - h * 2, w + 2, base - h * 1.1, w, base);
    ctx.quadraticCurveTo(0, base + 7, -w, base);
    ctx.closePath();
    fl(ctx, C(p.main));
    st(ctx, A(C(p.dark), 0.85), 3.2);
    ctx.restore();
    // nucleo interior
    hi(ctx, 2, base - h * 0.8, w * 0.42, h * 0.5, C(p.dark), 0.3);
    // brillo especular grande (lo que lo hace "gelatina")
    hi(ctx, -w * 0.4, base - h * 1.35, w * 0.3, h * 0.42, "#ffffff", 0.5, -0.4);
    hi(ctx, w * 0.42, base - h * 0.55, w * 0.14, h * 0.2, "#ffffff", 0.28);
    // goteo
    P(ctx); ell(ctx, w * 0.72, base - 2 + q, 5, 7); fl(ctx, A(C(p.light), 0.7));
    // cara
    eyes(ctx, 0, base - h * 1.15, 11, 6.2, S.look, "#0d2b12");
    P(ctx);
    ctx.arc(0, base - h * 0.85, 9, 0.35, PI - 0.35);
    st(ctx, A("#0d2b12", 0.8), 2.8);
  };

  /* --- GOBLIN: orejas enormes, barrigon, daga ---------------------------- */
  CREATURES.goblin = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 2.4) * 1.2;
    shadow(ctx, 24, 44);
    // piernas
    P(ctx); rrc(ctx, -9, 32, 10, 20, 5); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, 9, 32, 10, 20, 5); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, -10, 41, 14, 8, 4); sh(ctx, S, C(p.dark), 2.4);
    P(ctx); rrc(ctx, 10, 41, 14, 8, 4); sh(ctx, S, C(p.dark), 2.4);
    // brazos
    P(ctx); rrc(ctx, -20, 12 + bob, 9, 24, 4.5); sh(ctx, S, C(p.main), 2.6);
    P(ctx); rrc(ctx, 20, 10 + bob, 9, 24, 4.5); sh(ctx, S, C(p.main), 2.6);
    // torso barrigon
    P(ctx); ell(ctx, 0, 10 + bob, 19, 17);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -7, 2 + bob, 9, 7, C(p.light), 0.4);
    // taparrabos
    P(ctx); poly(ctx, [-16, 20 + bob, 16, 20 + bob, 12, 32, -12, 32]);
    sh(ctx, S, C("#7a5a30"), 2.6);
    // orejas puntiagudas enormes
    for (var e = -1; e <= 1; e += 2) {
      P(ctx);
      ctx.moveTo(e * 11, -20 + bob);
      ctx.quadraticCurveTo(e * 26, -33 + bob, e * 34, -27 + bob);
      ctx.quadraticCurveTo(e * 24, -19 + bob, e * 12, -12 + bob);
      ctx.closePath();
      sh(ctx, S, C(p.main), 2.6);
      line(ctx, e * 14, -20 + bob, e * 27, -26 + bob, A(C(p.dark), 0.6), 1.6);
    }
    // cabeza
    P(ctx); ell(ctx, 0, -17 + bob, 16, 15);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -6, -25 + bob, 8, 5, C(p.light), 0.45);
    // nariz gancho
    P(ctx);
    ctx.moveTo(2, -16 + bob); ctx.quadraticCurveTo(13, -13 + bob, 5, -7 + bob);
    ctx.closePath();
    sh(ctx, S, C(mix(p.main, "#ffd28a", 0.25)), 2.2);
    // ojos + cejas
    eyes(ctx, -1, -20 + bob, 7, 5.2, S.look, "#101a08", "#ffe96b");
    brows(ctx, -1, -27 + bob, 7, 8, C(p.dark));
    // boca con dientes
    P(ctx); ctx.arc(-1, -8 + bob, 7, 0.15, PI - 0.15); st(ctx, "#1a2208", 2.4);
    P(ctx); tri(ctx, -5, -8 + bob, -1, -8 + bob, -3, -3 + bob); fl(ctx, "#fffbe8");
    P(ctx); tri(ctx, 1, -8 + bob, 5, -8 + bob, 3, -3 + bob); fl(ctx, "#fffbe8");
    // daga
    ctx.save();
    ctx.translate(24, 14 + bob);
    ctx.rotate(-0.35);
    P(ctx); rrc(ctx, 0, 4, 5, 10, 2); sh(ctx, S, "#6b4a24", 2);
    P(ctx); rrc(ctx, 0, -2, 12, 3.4, 1.6); sh(ctx, S, "#8a6a34", 1.8);
    blade(ctx, S, 26, 9, "#d6dfee");
    ctx.restore();
  };

  /* --- ARQUERO: esqueleto encapuchado con arco --------------------------- */
  CREATURES.archer = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 2.2) * 1.3;
    shadow(ctx, 24, 44);
    // arco (detras, a la espalda del tiro)
    ctx.save();
    ctx.translate(20, 4 + bob);
    P(ctx); ctx.arc(-6, 0, 31, -1.15, 1.15);
    st(ctx, C("#6f4a22"), 5);
    P(ctx); ctx.arc(-6, 0, 31, -1.15, 1.15);
    st(ctx, C("#a97a3c"), 2.4);
    line(ctx, -6 + 31 * cos(-1.15), 31 * sin(-1.15), -6 + 31 * cos(1.15), 31 * sin(1.15), A("#efe9d6", 0.8), 1.6);
    ctx.restore();
    // piernas / tunica
    P(ctx); poly(ctx, [-15, 6 + bob, 15, 6 + bob, 19, 40, -19, 40]);
    sh(ctx, S, C("#4a5a48"), 3);
    hi(ctx, -7, 20, 6, 12, C("#6f8268"), 0.35);
    // jirones del bajo
    for (var i = -2; i <= 2; i++) {
      P(ctx); tri(ctx, i * 7 - 3, 38, i * 7 + 3, 38, i * 7, 44 + sin(t * 3 + i) * 2);
      fl(ctx, C("#39472f"));
    }
    // brazos huesudos
    line(ctx, -8, 6 + bob, 16, -2 + bob, C(p.main), 5);
    line(ctx, -8, 6 + bob, 2, 16 + bob, C(p.main), 5);
    // huesos de la mano
    P(ctx); cir(ctx, 17, -3 + bob, 4); sh(ctx, S, C(p.light), 2);
    // capucha
    P(ctx);
    ctx.moveTo(-17, -6 + bob);
    ctx.quadraticCurveTo(-16, -34 + bob, 0, -34 + bob);
    ctx.quadraticCurveTo(16, -34 + bob, 17, -6 + bob);
    ctx.quadraticCurveTo(0, 1 + bob, -17, -6 + bob);
    ctx.closePath();
    sh(ctx, S, C("#54634f"), 3.2);
    hi(ctx, -6, -24 + bob, 7, 9, C("#78896c"), 0.35, -0.3);
    // hueco de la capucha
    P(ctx); ell(ctx, 0, -14 + bob, 11, 11);
    fl(ctx, "#070a09");
    // ojos brillantes dentro
    eyesGlow(ctx, 0, -15 + bob, 5, 2.6, C(p.accent));
    // mandibula asomando
    P(ctx); rrc(ctx, 0, -5 + bob, 12, 5, 2); fl(ctx, C(p.main));
    for (var d = -2; d <= 2; d++) line(ctx, d * 3, -7 + bob, d * 3, -3 + bob, A("#5c5744", 0.7), 1.2);
    // flecha
    line(ctx, -2, 0 + bob, 26, 0 + bob, C("#8a6a34"), 2.2);
    P(ctx); tri(ctx, 26, -3 + bob, 34, 0 + bob, 26, 3 + bob); fl(ctx, "#d6dfee");
  };

  /* --- ARANA: 8 patas arqueadas, ojos rojos ------------------------------ */
  CREATURES.spider = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    shadow(ctx, 32, 45);
    // 8 patas: cadera unica por lado, rodilla MUY alta y pie en el suelo.
    // Es lo que da la silueta inconfundible de arana.
    for (var s = -1; s <= 1; s += 2) {
      var hipx = s > 0 ? 10 : -4;
      for (var i = 0; i < 4; i++) {
        var wig = sin(t * 3.6 + i * 1.1 + (s > 0 ? 0 : 1.7)) * 2.4;
        var kx = hipx + s * (16 + i * 6), ky = -6 - i * 7 + wig;
        var fx2 = hipx + s * (24 + i * 7), fy2 = 42 - i * 2;
        P(ctx);
        ctx.moveTo(hipx, 8);
        ctx.quadraticCurveTo(kx, ky + 3, kx, ky);
        ctx.quadraticCurveTo(fx2 - s * 2, ky + 14, fx2, fy2);
        // contorno oscuro + patа clara encima: asi se ven sobre fondo negro
        ctx.strokeStyle = dark(C(p.dark), 0.3);
        ctx.lineWidth = lw(6.4 - i * 0.5);
        ctx.stroke();
        ctx.strokeStyle = C(i % 2 ? p.light : mix(p.light, p.main, 0.45));
        ctx.lineWidth = lw(3.2 - i * 0.3);
        ctx.stroke();
        // articulacion marcada
        P(ctx); cir(ctx, kx, ky, 2.6); fl(ctx, C(p.light));
      }
    }
    // abdomen bulboso
    P(ctx); ell(ctx, -16, 16, 21, 18, -0.12);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -22, 6, 9, 6, C(p.light), 0.45, -0.3);
    // marca de reloj de arena
    P(ctx); poly(ctx, [-21, 10, -11, 10, -18, 17, -11, 24, -21, 24, -14, 17]);
    fl(ctx, A(C(p.accent), 0.8));
    // cefalotorax
    P(ctx); ell(ctx, 12, 11, 14, 12);
    sh(ctx, S, C(p.light), 3);
    hi(ctx, 8, 5, 7, 4, lite(C(p.light), 0.35), 0.45);
    // quelíceros
    P(ctx); tri(ctx, 20, 17, 27, 26, 21, 24); fl(ctx, C(p.dark));
    P(ctx); tri(ctx, 13, 19, 17, 27, 9, 24); fl(ctx, C(p.dark));
    // ojos: 2 grandes delante + 4 pequeños detras
    for (var m = 0; m < 4; m++) {
      P(ctx); cir(ctx, 7 + (m % 2) * 5, 3 + Math.floor(m / 2) * 4.5, 1.7);
      fl(ctx, A(C(p.accent), 0.85));
    }
    glow(ctx, 18, 7, 14, C(p.accent), 0.5);
    for (var e = -1; e <= 1; e += 2) {
      P(ctx); cir(ctx, 18, 7 + e * 5, 3.8); fl(ctx, C(p.accent));
      P(ctx); cir(ctx, 17, 6 + e * 5, 1.4); fl(ctx, "#fff0f0");
    }
  };

  /* --- ESQUELETO: casco, costillas, espada ------------------------------- */
  CREATURES.skeleton = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 2.1) * 1.4;
    shadow(ctx, 22, 44);
    // piernas
    for (var s = -1; s <= 1; s += 2) {
      line(ctx, s * 6, 20, s * 8, 40, C(p.main), 5.5);
      P(ctx); rrc(ctx, s * 8, 42, 12, 6, 3); sh(ctx, S, C(p.light), 2);
    }
    // pelvis
    P(ctx); rrc(ctx, 0, 18, 20, 9, 4); sh(ctx, S, C(p.main), 2.6);
    // columna
    line(ctx, 0, -2 + bob, 0, 16, C(p.main), 4.5);
    // caja toracica
    P(ctx); ell(ctx, 0, 4 + bob, 17, 15);
    sh(ctx, S, C(p.main), 3.2);
    for (var r = 0; r < 3; r++) {
      P(ctx); ctx.arc(0, -3 + r * 7 + bob, 13 - r * 1.2, 0.25, PI - 0.25);
      st(ctx, A(C(p.dark), 0.85), 2.6);
    }
    hi(ctx, -8, -2 + bob, 5, 8, C(p.light), 0.4);
    // brazo izquierdo colgando
    line(ctx, -14, 0 + bob, -22, 22, C(p.main), 4.6);
    P(ctx); cir(ctx, -23, 24, 4); sh(ctx, S, C(p.light), 2);
    // brazo derecho levantado con espada
    line(ctx, 14, 0 + bob, 24, -12 + bob, C(p.main), 4.6);
    ctx.save();
    ctx.translate(26, -14 + bob);
    ctx.rotate(0.28 + sin(t * 1.7) * 0.06);
    P(ctx); rrc(ctx, 0, 4, 4.6, 11, 2); sh(ctx, S, "#5c4326", 2);
    P(ctx); rrc(ctx, 0, -2, 15, 3.6, 1.8); sh(ctx, S, C(p.accent), 1.8);
    blade(ctx, S, 33, 11, "#cfd8e8");
    ctx.restore();
    // craneo
    P(ctx); ell(ctx, 0, -18 + bob, 14, 13);
    sh(ctx, S, C(p.light), 3.2);
    // mandibula
    P(ctx); rrc(ctx, 0, -7 + bob, 15, 6, 2.4); sh(ctx, S, C(p.main), 2.2);
    for (var d = -2; d <= 2; d++) line(ctx, d * 3.4, -10 + bob, d * 3.4, -4 + bob, A(C(p.dark), 0.65), 1.2);
    // cuencas
    for (var o = -1; o <= 1; o += 2) {
      P(ctx); ell(ctx, o * 6, -20 + bob, 4.6, 5.2); fl(ctx, "#0a0a10");
    }
    eyesGlow(ctx, 0, -20 + bob, 6, 2.2, "#9fd6ff");
    // nariz
    P(ctx); tri(ctx, -1.8, -13 + bob, 1.8, -13 + bob, 0, -16 + bob); fl(ctx, "#0a0a10");
    // casco
    P(ctx);
    ctx.moveTo(-16, -20 + bob);
    ctx.quadraticCurveTo(-16, -38 + bob, 0, -38 + bob);
    ctx.quadraticCurveTo(16, -38 + bob, 16, -20 + bob);
    ctx.lineTo(13, -20 + bob);
    ctx.quadraticCurveTo(0, -26 + bob, -13, -20 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.accent), 3);
    hi(ctx, -6, -31 + bob, 7, 4, lite(C(p.accent), 0.5), 0.5, -0.3);
    // guarda nasal
    P(ctx); rrc(ctx, 0, -18 + bob, 4.4, 14, 2); sh(ctx, S, C(p.accent), 2);
  };

  /* --- BOMBARDERO: esfera con mecha, cara nerviosa ----------------------- */
  CREATURES.bomber = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var jitter = sin(t * 17) * 0.8;
    var bob = sin(t * 3) * 1.2;
    shadow(ctx, 26, 44);
    // patitas
    P(ctx); rrc(ctx, -11, 38, 13, 8, 4); sh(ctx, S, C(p.dark), 2.4);
    P(ctx); rrc(ctx, 11, 38, 13, 8, 4); sh(ctx, S, C(p.dark), 2.4);
    // esfera
    P(ctx); cir(ctx, jitter, 8 + bob, 27);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -9 + jitter, -2 + bob, 10, 7, C(p.light), 0.5, -0.4);
    // anillo del tapon
    P(ctx); ell(ctx, 6 + jitter, -16 + bob, 8, 4, -0.5); sh(ctx, S, C("#6b6478"), 2.4);
    // mecha + chispa
    P(ctx);
    ctx.moveTo(7 + jitter, -19 + bob);
    ctx.quadraticCurveTo(16, -28 + bob, 13, -36 + bob);
    st(ctx, "#8a7a55", 3);
    var sp = 3.4 + sin(t * 19) * 1.4;
    glow(ctx, 13, -37 + bob, 13 + sp, C(p.accent), 0.85);
    P(ctx); cir(ctx, 13, -37 + bob, sp); fl(ctx, "#fff6c8");
    for (var k = 0; k < 3; k++) {
      var a = t * 9 + k * 2.1;
      P(ctx); cir(ctx, 13 + cos(a) * 9, -37 + bob + sin(a) * 7, 1.5);
      fl(ctx, A("#ffcf5c", 0.9));
    }
    // cara nerviosa: ojos grandes con pupilas temblorosas
    eyes(ctx, jitter, 4 + bob, 9, 7.4, sin(t * 11) * 0.8, "#120f1a");
    // sudor
    P(ctx); ell(ctx, -19 + jitter, -4 + bob, 2.6, 4); fl(ctx, A("#9fe8ff", 0.85));
    // boca ondulada de susto
    P(ctx);
    ctx.moveTo(-8 + jitter, 20 + bob);
    ctx.quadraticCurveTo(-4 + jitter, 16 + bob, 0 + jitter, 20 + bob);
    ctx.quadraticCurveTo(4 + jitter, 24 + bob, 8 + jitter, 20 + bob);
    st(ctx, "#120f1a", 2.6);
  };

  /* --- CULTISTA: tunica morada, capucha sin cara, vela ------------------- */
  CREATURES.cultist = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.8) * 1.6;
    shadow(ctx, 26, 44);
    // tunica
    P(ctx);
    ctx.moveTo(-14, -14 + bob);
    ctx.quadraticCurveTo(-24, 8, -27, 42);
    ctx.lineTo(27, 42);
    ctx.quadraticCurveTo(24, 8, 14, -14 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -10, 10, 6, 20, C(p.light), 0.3);
    // pliegues
    line(ctx, -8, 4, -12, 40, A(C(p.dark), 0.55), 2);
    line(ctx, 8, 4, 12, 40, A(C(p.dark), 0.55), 2);
    // dobladillo dorado
    P(ctx); ctx.moveTo(-27, 38); ctx.quadraticCurveTo(0, 44, 27, 38);
    st(ctx, C(p.accent), 2.4);
    // manga izquierda
    P(ctx); rrc(ctx, -20, 6 + bob, 12, 22, 6); sh(ctx, S, C(p.main), 2.6);
    // brazo derecho levantado con vela
    P(ctx);
    ctx.moveTo(12, -8 + bob); ctx.quadraticCurveTo(26, -10 + bob, 25, -24 + bob);
    st(ctx, C(p.main), 9);
    P(ctx);
    ctx.moveTo(12, -8 + bob); ctx.quadraticCurveTo(26, -10 + bob, 25, -24 + bob);
    st(ctx, A(C(p.dark), 0.6), 2);
    // vela
    P(ctx); rrc(ctx, 25, -32 + bob, 6.5, 13, 2); sh(ctx, S, "#efe6cf", 2);
    flame(ctx, 25, -39 + bob, 9, 17, t, 7);
    glow(ctx, 25, -44 + bob, 20, "#ffc75c", 0.5);
    // capucha
    P(ctx);
    ctx.moveTo(-17, -10 + bob);
    ctx.quadraticCurveTo(-19, -32 + bob, 0, -38 + bob);
    ctx.quadraticCurveTo(19, -32 + bob, 17, -10 + bob);
    ctx.quadraticCurveTo(0, -3 + bob, -17, -10 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -7, -27 + bob, 6, 9, C(p.light), 0.4, -0.3);
    // vacio interior
    P(ctx); ell(ctx, 0, -18 + bob, 12, 12);
    fl(ctx, "#08060e");
    // dos brillos tenues en lugar de cara
    P(ctx); cir(ctx, -4.5, -19 + bob, 2.1); fl(ctx, A(C(p.light), 0.8));
    P(ctx); cir(ctx, 4.5, -19 + bob, 2.1); fl(ctx, A(C(p.light), 0.8));
  };

  /* --- ORCO: ancho, colmillos, hacha ------------------------------------- */
  CREATURES.orc = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.9) * 1.3;
    shadow(ctx, 34, 45);
    // piernas gruesas
    P(ctx); rrc(ctx, -13, 32, 16, 22, 7); sh(ctx, S, C(p.dark), 3);
    P(ctx); rrc(ctx, 13, 32, 16, 22, 7); sh(ctx, S, C(p.dark), 3);
    P(ctx); rrc(ctx, -14, 42, 20, 8, 4); sh(ctx, S, C("#4a3a20"), 2.4);
    P(ctx); rrc(ctx, 14, 42, 20, 8, 4); sh(ctx, S, C("#4a3a20"), 2.4);
    // hacha (detras)
    ctx.save();
    ctx.translate(24, 4 + bob);
    ctx.rotate(0.22 + sin(t * 1.6) * 0.05);
    line(ctx, 0, 26, 0, -30, C("#6b4a24"), 5.5);
    P(ctx);
    ctx.moveTo(-1, -30);
    ctx.quadraticCurveTo(20, -30, 22, -12);
    ctx.quadraticCurveTo(10, -10, -1, -14);
    ctx.closePath();
    sh(ctx, S, "#aeb8c8", 2.8);
    hi(ctx, 9, -24, 7, 3, "#e8eefa", 0.5, 0.3);
    ctx.restore();
    // torso trapezoidal enorme
    P(ctx); poly(ctx, [-30, -8 + bob, 30, -8 + bob, 22, 30, -22, 30]);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -14, 0 + bob, 9, 12, C(p.light), 0.4);
    // vientre
    P(ctx); ell(ctx, 0, 20, 17, 11); fl(ctx, A(C(p.light), 0.35));
    // correa
    line(ctx, -24, 0 + bob, 20, 18, C("#4a3a20"), 5);
    // hombreras
    P(ctx); ell(ctx, -27, -8 + bob, 11, 9); sh(ctx, S, C(p.light), 2.6);
    P(ctx); ell(ctx, 27, -8 + bob, 11, 9); sh(ctx, S, C(p.light), 2.6);
    // brazos
    P(ctx); rrc(ctx, -30, 8 + bob, 12, 28, 6); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, 28, 8 + bob, 12, 28, 6); sh(ctx, S, C(p.main), 2.8);
    // cabeza hundida entre hombros
    P(ctx); ell(ctx, 0, -18 + bob, 17, 14);
    sh(ctx, S, C(p.main), 3.2);
    // orejas pequeñas
    P(ctx); tri(ctx, -16, -22 + bob, -25, -24 + bob, -16, -14 + bob); sh(ctx, S, C(p.main), 2);
    P(ctx); tri(ctx, 16, -22 + bob, 25, -24 + bob, 16, -14 + bob); sh(ctx, S, C(p.main), 2);
    // ceja pesada
    P(ctx); rrc(ctx, 0, -24 + bob, 28, 7, 3); sh(ctx, S, C(p.dark), 2.2);
    // ojos pequeños y furiosos
    eyesGlow(ctx, 0, -17 + bob, 7, 2.6, "#ffd24a");
    // mandibula + colmillos (cortos: no deben tocar la ceja)
    P(ctx); rrc(ctx, 0, -8 + bob, 22, 9, 4); sh(ctx, S, C(p.dark), 2.4);
    P(ctx); tri(ctx, -11, -7 + bob, -5, -7 + bob, -8, -16 + bob); sh(ctx, S, C(p.accent), 1.8);
    P(ctx); tri(ctx, 5, -7 + bob, 11, -7 + bob, 8, -16 + bob); sh(ctx, S, C(p.accent), 1.8);
  };

  /* --- ESPECTRO: flota, sin piernas, jirones ----------------------------- */
  CREATURES.wraith = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.6) * 3.4;
    shadow(ctx, 20, 46, 0.2);
    ctx.save();
    ctx.globalAlpha *= 0.78;
    // cuerpo que se deshace hacia abajo
    P(ctx);
    ctx.moveTo(-22, -6 + bob);
    ctx.quadraticCurveTo(-24, -34 + bob, 0, -38 + bob);
    ctx.quadraticCurveTo(24, -34 + bob, 22, -6 + bob);
    ctx.lineTo(20, 14 + bob);
    for (var i = 3; i >= -3; i--) {
      var xx = i * 6.6;
      var d = 34 + sin(t * 2.6 + i * 1.1) * 8;
      ctx.quadraticCurveTo(xx + 3.3, 18 + bob + d * 0.5, xx, bob + d);
      ctx.quadraticCurveTo(xx - 3.3, 18 + bob + d * 0.4, xx - 6.6, 14 + bob);
    }
    ctx.closePath();
    ctx.fillStyle = vg(ctx, -38, 46, [[0, C(p.light)], [0.5, C(p.main)], [1, A(C(p.dark), 0.15)]]);
    ctx.fill();
    st(ctx, A(C(p.dark), 0.75), 2.8);
    ctx.restore();
    // brazos garra
    for (var s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.globalAlpha *= 0.85;
      P(ctx);
      ctx.moveTo(s * 18, -8 + bob);
      ctx.quadraticCurveTo(s * 32, 2 + bob, s * 28, 16 + bob);
      st(ctx, C(p.main), 6);
      for (var f = -1; f <= 1; f++) {
        line(ctx, s * 28, 16 + bob, s * (28 + f * 5), 26 + bob, C(p.light), 2.4);
      }
      ctx.restore();
    }
    // hueco de capucha
    P(ctx); ell(ctx, 0, -20 + bob, 13, 13);
    fl(ctx, "#05070f");
    eyesGlow(ctx, 0, -21 + bob, 5.5, 3, C(p.accent));
    // boca abierta de grito
    P(ctx); ell(ctx, 0, -11 + bob, 4, 5); fl(ctx, A("#05070f", 0.9));
  };

  /* --- CHAMAN: totem, calavera flotante ---------------------------------- */
  CREATURES.shaman = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.7) * 1.4;
    shadow(ctx, 26, 44);
    // totem a la derecha: la calavera tallada va BAJA para no competir con la cara
    ctx.save();
    ctx.translate(30, 0);
    line(ctx, 0, 44, 0, -14, C("#5e4426"), 6);
    P(ctx); ell(ctx, 0, -19, 7.5, 7.5); sh(ctx, S, "#d8d0b6", 2.4);
    P(ctx); cir(ctx, -2.6, -20, 2); fl(ctx, "#12100e");
    P(ctx); cir(ctx, 2.6, -20, 2); fl(ctx, "#12100e");
    P(ctx); rrc(ctx, 0, -13, 7.5, 3.4, 1.4); fl(ctx, "#bdb49a");
    // plumas
    P(ctx); tri(ctx, 0, -6, 11, 0, 1, 4); fl(ctx, C(p.accent));
    P(ctx); tri(ctx, 0, -4, -10, 3, -1, 6); fl(ctx, C(p.main));
    ctx.restore();
    // tunica
    P(ctx);
    ctx.moveTo(-15, -12 + bob);
    ctx.quadraticCurveTo(-23, 10, -24, 42);
    ctx.lineTo(20, 42);
    ctx.quadraticCurveTo(20, 10, 15, -12 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -9, 8, 6, 18, C(p.light), 0.3);
    // franjas rituales
    line(ctx, -22, 26, 18, 26, A(C(p.accent), 0.7), 2.2);
    line(ctx, -23, 34, 19, 34, A(C(p.dark), 0.7), 2.2);
    // brazo al totem
    line(ctx, 10, -4 + bob, 28, 4, C(p.main), 7);
    // collar de huesos
    for (var b = -2; b <= 2; b++) {
      P(ctx); ell(ctx, b * 6, -9 + bob + abs(b) * 1.4, 2.4, 4); fl(ctx, "#e6dfc6");
    }
    // cabeza: la mascara de madera es la cara dominante
    P(ctx); ell(ctx, -1, -24 + bob, 16, 16);
    sh(ctx, S, C(p.dark), 3.2);
    // tocado de paja
    for (var h = -2; h <= 2; h++) {
      P(ctx); tri(ctx, -1 + h * 6 - 3, -36 + bob, -1 + h * 6 + 3, -36 + bob, -1 + h * 7, -46 + bob);
      fl(ctx, C("#8a6a34"));
    }
    P(ctx); ell(ctx, -1, -24 + bob, 12.5, 13.5);
    sh(ctx, S, C("#c9a05e"), 2.6);
    hi(ctx, -6, -31 + bob, 6, 3.4, "#e8c890", 0.5);
    // ojos rasgados de la mascara, grandes y encendidos
    glow(ctx, -7, -27 + bob, 9, C(p.accent), 0.7);
    glow(ctx, 6, -27 + bob, 9, C(p.accent), 0.7);
    P(ctx); poly(ctx, [-12, -29 + bob, -3, -31 + bob, -3, -24 + bob, -12, -23 + bob]);
    fl(ctx, "#0a0a10");
    P(ctx); poly(ctx, [3, -31 + bob, 12, -29 + bob, 12, -23 + bob, 3, -24 + bob]);
    fl(ctx, "#0a0a10");
    P(ctx); cir(ctx, -7, -27 + bob, 2.2); fl(ctx, lite(C(p.accent), 0.4));
    P(ctx); cir(ctx, 6, -27 + bob, 2.2); fl(ctx, lite(C(p.accent), 0.4));
    // boca tallada con colmillos
    P(ctx); rrc(ctx, -1, -16 + bob, 13, 5.5, 2); fl(ctx, "#0a0a10");
    for (var m = -1; m <= 1; m++) {
      P(ctx); tri(ctx, -1 + m * 4 - 1.8, -18 + bob, -1 + m * 4 + 1.8, -18 + bob, -1 + m * 4, -13 + bob);
      fl(ctx, "#f2ead0");
    }
    // calavera flotante: mas pequeña y bien arriba, no compite con la mascara
    var fx = -28 + sin(t * 1.2) * 3, fy = -40 + cos(t * 1.5) * 4;
    glow(ctx, fx, fy, 14, C(p.accent), 0.55);
    P(ctx); ell(ctx, fx, fy, 7, 6.6); sh(ctx, S, "#eee7ce", 2.2);
    P(ctx); rrc(ctx, fx, fy + 6.5, 7.4, 3.6, 1.4); fl(ctx, "#d6cfb6");
    eyesGlow(ctx, fx, fy - 1, 2.6, 1.5, C(p.accent));
  };

  /* --- GOLEM: bloques de piedra con grietas brillantes ------------------- */
  CREATURES.golem = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var pu = 0.5 + 0.5 * sin(t * 2.2);
    var bob = sin(t * 1.4) * 1;
    shadow(ctx, 34, 45);
    // piernas bloque
    P(ctx); rrc(ctx, -13, 34, 18, 20, 4); sh(ctx, S, C(p.dark), 3);
    P(ctx); rrc(ctx, 13, 34, 18, 20, 4); sh(ctx, S, C(p.dark), 3);
    // brazos enormes
    P(ctx); rrc(ctx, -31, 8 + bob, 15, 34, 5); sh(ctx, S, C(p.main), 3);
    P(ctx); rrc(ctx, 31, 8 + bob, 15, 34, 5); sh(ctx, S, C(p.main), 3);
    P(ctx); rrc(ctx, -31, 28 + bob, 18, 14, 5); sh(ctx, S, C(p.light), 2.6);
    P(ctx); rrc(ctx, 31, 28 + bob, 18, 14, 5); sh(ctx, S, C(p.light), 2.6);
    // torso
    P(ctx); rrc(ctx, 0, 6 + bob, 46, 38, 6);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -12, -4 + bob, 12, 8, C(p.light), 0.45);
    // facetas
    line(ctx, -22, -6 + bob, -8, 2 + bob, A(C(p.dark), 0.5), 2);
    line(ctx, 22, 12 + bob, 6, 20 + bob, A(C(p.dark), 0.5), 2);
    // grietas brillantes
    ctx.save();
    ctx.globalAlpha *= 0.55 + pu * 0.45;
    P(ctx);
    ctx.moveTo(-18, -12 + bob); ctx.lineTo(-6, 0 + bob); ctx.lineTo(-10, 10 + bob);
    ctx.lineTo(2, 22 + bob);
    st(ctx, C(p.accent), 3.2);
    P(ctx);
    ctx.moveTo(14, -10 + bob); ctx.lineTo(8, 2 + bob); ctx.lineTo(18, 12 + bob);
    st(ctx, C(p.accent), 2.6);
    ctx.restore();
    // nucleo: brillo contenido, si no se come las grietas
    glow(ctx, 0, 6 + bob, 13 + pu * 4, C(p.accent), 0.38 + pu * 0.2);
    P(ctx); cir(ctx, 0, 6 + bob, 6); fl(ctx, lite(C(p.accent), 0.4));
    // cabeza
    P(ctx); rrc(ctx, 0, -24 + bob, 28, 20, 5);
    sh(ctx, S, C(p.light), 3.2);
    hi(ctx, -7, -30 + bob, 7, 3.4, lite(C(p.light), 0.4), 0.5);
    // ojos ranura
    for (var e = -1; e <= 1; e += 2) {
      glow(ctx, e * 7, -24 + bob, 11, C(p.accent), 0.75);
      P(ctx); rrc(ctx, e * 7, -24 + bob, 9, 4.4, 2); fl(ctx, lite(C(p.accent), 0.45));
    }
    // boca tallada
    line(ctx, -8, -16 + bob, 8, -16 + bob, A(C(p.dark), 0.8), 2.4);
  };

  /* --- MIMICO: cofre con dientes y lengua -------------------------------- */
  CREATURES.mimic = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var open = 16 + sin(t * 2.4) * 6;
    shadow(ctx, 30, 45);
    // patitas
    P(ctx); rrc(ctx, -18, 40, 11, 9, 4); sh(ctx, S, C(p.dark), 2.4);
    P(ctx); rrc(ctx, 18, 40, 11, 9, 4); sh(ctx, S, C(p.dark), 2.4);
    // base
    P(ctx); rrc(ctx, 0, 24, 54, 28, 5);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -16, 16, 9, 7, C(p.light), 0.35);
    // herrajes
    P(ctx); rrc(ctx, -20, 24, 6, 28, 2); fl(ctx, A("#4a4450", 0.9));
    P(ctx); rrc(ctx, 20, 24, 6, 28, 2); fl(ctx, A("#4a4450", 0.9));
    // lengua
    P(ctx);
    ctx.moveTo(-8, 12);
    ctx.quadraticCurveTo(0, 30 + sin(t * 3.3) * 4, 16, 34 + sin(t * 3.3) * 5);
    ctx.quadraticCurveTo(4, 36 + sin(t * 3.3) * 5, 8, 12);
    ctx.closePath();
    sh(ctx, S, C(p.accent), 2.4);
    // dientes inferiores: grandes, son lo que delata al mimico
    for (var i = -3; i <= 3; i++) {
      P(ctx); tri(ctx, i * 8 - 4.4, 10, i * 8 + 4.4, 10, i * 8, -1); fl(ctx, "#fff8e4");
    }
    // tapa abierta
    ctx.save();
    ctx.translate(0, 8);
    ctx.rotate(-open * 0.02);
    P(ctx);
    ctx.moveTo(-27, 0);
    ctx.quadraticCurveTo(-27, -22, 0, -22);
    ctx.quadraticCurveTo(27, -22, 27, 0);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -12, -14, 9, 5, C(p.light), 0.4, -0.3);
    line(ctx, -20, -3, -20, -16, A("#4a4450", 0.9), 5);
    line(ctx, 20, -3, 20, -16, A("#4a4450", 0.9), 5);
    // dientes superiores
    for (var j = -3; j <= 3; j++) {
      P(ctx); tri(ctx, j * 8 - 4.4, -1, j * 8 + 4.4, -1, j * 8, 8); fl(ctx, "#fff8e4");
    }
    // ojos en la tapa: grandes y amarillos, se leen a 24px
    eyes(ctx, 0, -12, 11, 7.6, S.look, "#241005", "#ffe36b");
    ctx.restore();
    // interior oscuro
    P(ctx); rrc(ctx, 0, 8, 46, 8, 3); fl(ctx, A("#0b0508", 0.85));
  };

  /* --- CABALLERO CAIDO: escudo de torre, yelmo --------------------------- */
  CREATURES.knight = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.6) * 1.1;
    shadow(ctx, 30, 45);
    // espada al costado opuesto
    ctx.save();
    ctx.translate(-24, 10 + bob);
    ctx.rotate(-0.3);
    blade(ctx, S, 34, 10, C("#9aa4b6"));
    P(ctx); rrc(ctx, 0, 4, 14, 3.4, 1.6); sh(ctx, S, C(p.dark), 1.8);
    ctx.restore();
    // piernas
    P(ctx); rrc(ctx, -10, 32, 14, 22, 5); sh(ctx, S, C(p.dark), 2.8);
    P(ctx); rrc(ctx, 10, 32, 14, 22, 5); sh(ctx, S, C(p.dark), 2.8);
    P(ctx); rrc(ctx, -11, 43, 17, 7, 3); sh(ctx, S, C(p.main), 2.2);
    P(ctx); rrc(ctx, 11, 43, 17, 7, 3); sh(ctx, S, C(p.main), 2.2);
    // torso acorazado
    P(ctx); poly(ctx, [-20, -8 + bob, 20, -8 + bob, 16, 26, -16, 26]);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -9, -2 + bob, 6, 10, C(p.light), 0.45);
    // tabardo rojo
    P(ctx); poly(ctx, [-8, -6 + bob, 8, -6 + bob, 6, 30, -6, 30]);
    sh(ctx, S, C(p.accent), 2.2);
    // hombreras
    P(ctx); ell(ctx, -21, -9 + bob, 11, 8); sh(ctx, S, C(p.light), 2.6);
    P(ctx); ell(ctx, 21, -9 + bob, 11, 8); sh(ctx, S, C(p.light), 2.6);
    // yelmo cerrado
    P(ctx); rrc(ctx, 0, -22 + bob, 26, 26, 9);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -7, -30 + bob, 7, 5, C(p.light), 0.5, -0.3);
    // ranura del visor + ojos
    P(ctx); rrc(ctx, 0, -21 + bob, 22, 7, 2.4); fl(ctx, "#07070d");
    eyesGlow(ctx, 0, -21 + bob, 6, 2.2, "#ff7a4a");
    // respiradero
    for (var v = -1; v <= 1; v++) line(ctx, v * 5, -15 + bob, v * 5, -11 + bob, A(C(p.dark), 0.9), 2);
    // penacho
    P(ctx);
    ctx.moveTo(0, -35 + bob);
    ctx.quadraticCurveTo(10, -46 + bob, 2 + sin(t * 2) * 3, -48 + bob);
    ctx.quadraticCurveTo(-4, -42 + bob, -4, -34 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.accent), 2.4);
    // escudo de torre (delante)
    ctx.save();
    ctx.translate(25, 8 + bob * 0.6);
    P(ctx);
    ctx.moveTo(-13, -26); ctx.lineTo(13, -26);
    ctx.quadraticCurveTo(15, 6, 0, 28);
    ctx.quadraticCurveTo(-15, 6, -13, -26);
    ctx.closePath();
    sh(ctx, S, C(p.light), 3.4);
    line(ctx, 0, -22, 0, 20, A(C(p.accent), 0.9), 4.4);
    line(ctx, -10, -8, 10, -8, A(C(p.accent), 0.9), 4.4);
    P(ctx); cir(ctx, 0, -8, 4.4); sh(ctx, S, C("#e8c45c"), 2);
    hi(ctx, -7, -18, 4, 7, "#ffffff", 0.35);
    ctx.restore();
  };

  /* --- DEMONIO: cuernos, alas pequeñas, aura de fuego -------------------- */
  CREATURES.demon = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 2.3) * 1.5;
    shadow(ctx, 28, 45);
    glow(ctx, 0, 14, 44, "#ff5a1e", 0.28);
    // alas pequeñas detras
    var fp = sin(t * 5.5) * 7;
    for (var s = -1; s <= 1; s += 2) {
      P(ctx);
      ctx.moveTo(s * 12, -6 + bob);
      ctx.quadraticCurveTo(s * 34, -24 + fp, s * 43, -6 + fp);
      ctx.quadraticCurveTo(s * 32, -2 + fp, s * 30, 8 + fp * 0.6);
      ctx.quadraticCurveTo(s * 24, 0 + fp * 0.5, s * 13, 6 + bob);
      ctx.closePath();
      sh(ctx, S, C(p.dark), 2.8);
      line(ctx, s * 14, -4 + bob, s * 33, -2 + fp, A(C(p.main), 0.8), 1.8);
    }
    // cola
    P(ctx);
    ctx.moveTo(-14, 26);
    ctx.quadraticCurveTo(-34, 30 + sin(t * 3) * 5, -30, 10 + sin(t * 3) * 6);
    st(ctx, C(p.main), 4.4);
    P(ctx); tri(ctx, -30, 10 + sin(t * 3) * 6, -37, 2 + sin(t * 3) * 6, -24, 4 + sin(t * 3) * 6);
    fl(ctx, C(p.dark));
    // piernas con pezuñas
    P(ctx); rrc(ctx, -10, 30, 13, 22, 6); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, 10, 30, 13, 22, 6); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, -10, 43, 14, 8, 3); sh(ctx, S, C(p.dark), 2.2);
    P(ctx); rrc(ctx, 10, 43, 14, 8, 3); sh(ctx, S, C(p.dark), 2.2);
    // torso musculoso
    P(ctx); poly(ctx, [-22, -10 + bob, 22, -10 + bob, 13, 24, -13, 24]);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -10, -3 + bob, 7, 9, C(p.light), 0.45);
    line(ctx, 0, -6 + bob, 0, 14, A(C(p.dark), 0.6), 2.2);
    P(ctx); ctx.arc(-8, -4 + bob, 7, -0.2, 1.6); st(ctx, A(C(p.dark), 0.5), 2);
    P(ctx); ctx.arc(8, -4 + bob, 7, 1.55, 3.3); st(ctx, A(C(p.dark), 0.5), 2);
    // brazos
    P(ctx); rrc(ctx, -25, 6 + bob, 11, 26, 5.5); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, 25, 6 + bob, 11, 26, 5.5); sh(ctx, S, C(p.main), 2.8);
    // garras
    for (var g = -1; g <= 1; g += 2) {
      for (var f = -1; f <= 1; f++) {
        line(ctx, g * 25, 18 + bob, g * 25 + f * 5, 27 + bob, C(p.light), 2.2);
      }
    }
    // cabeza
    P(ctx); ell(ctx, 0, -21 + bob, 15, 14);
    sh(ctx, S, C(p.main), 3.2);
    // cuernos grandes
    for (var h = -1; h <= 1; h += 2) {
      P(ctx);
      ctx.moveTo(h * 9, -30 + bob);
      ctx.quadraticCurveTo(h * 24, -38 + bob, h * 23, -47 + bob);
      ctx.quadraticCurveTo(h * 16, -40 + bob, h * 4, -32 + bob);
      ctx.closePath();
      sh(ctx, S, C("#f0e0c0"), 2.6);
    }
    // ojos brillantes + cejas
    eyesGlow(ctx, 0, -22 + bob, 6.5, 3.2, C(p.accent));
    brows(ctx, 0, -29 + bob, 7, 9, C(p.dark));
    // boca con colmillos
    P(ctx); ctx.arc(0, -13 + bob, 7, 0.2, PI - 0.2); st(ctx, "#2a0806", 2.4);
    P(ctx); tri(ctx, -5, -12 + bob, -1, -12 + bob, -3, -6 + bob); fl(ctx, "#fff8e4");
    P(ctx); tri(ctx, 1, -12 + bob, 5, -12 + bob, 3, -6 + bob); fl(ctx, "#fff8e4");
    // llamitas al pie
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    flame(ctx, -20, 46, 12, 18, t, 10);
    flame(ctx, 20, 46, 12, 16, t + 1.3, 10);
    ctx.restore();
  };

  /* --- SABUESO INFERNAL: cuadrupedo con melena de llamas ----------------- */
  CREATURES.hound = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 3.4) * 1.1;
    shadow(ctx, 34, 45);
    glow(ctx, 6, 8, 40, "#ff6a1e", 0.22);
    // cola en llamas
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    flame(ctx, -32, 14 + bob, 13, 22, t + 2, 9);
    ctx.restore();
    // melena de llamas: SOLO en el lomo/cuello, detras de la cabeza
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var f = 0; f < 4; f++) {
      flame(ctx, -24 + f * 9, 4 + bob - f * 2.5, 16 - f * 1.2, 30 - f * 3, t + f * 0.6, 9.5);
    }
    ctx.restore();
    // patas traseras
    P(ctx); rrc(ctx, -22, 32, 11, 22, 5); sh(ctx, S, C(p.dark), 2.6);
    P(ctx); rrc(ctx, -10, 34, 10, 19, 4.5); sh(ctx, S, C(p.dark), 2.4);
    // cuerpo
    P(ctx); ell(ctx, -8, 18 + bob, 25, 14, -0.08);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -14, 9 + bob, 12, 4.4, C(p.light), 0.5, -0.2);
    // patas delanteras
    P(ctx); rrc(ctx, 12, 32, 11, 22, 5); sh(ctx, S, C(p.main), 2.6);
    P(ctx); rrc(ctx, 23, 34, 10, 19, 4.5); sh(ctx, S, C(p.main), 2.4);
    for (var i = 0; i < 4; i++) {
      var px = [-22, -10, 12, 23][i];
      P(ctx); rrc(ctx, px, 44, 12, 6, 2.5); sh(ctx, S, C(p.light), 2);
    }
    // orejas puntiagudas hacia atras
    P(ctx); tri(ctx, 16, -4 + bob, 4, -22 + bob, 22, -10 + bob); sh(ctx, S, C(p.dark), 2.4);
    P(ctx); tri(ctx, 26, -6 + bob, 24, -24 + bob, 33, -6 + bob); sh(ctx, S, C(p.dark), 2.4);
    // craneo: mas grande y en tono claro para separarse de la melena
    P(ctx); ell(ctx, 24, 6 + bob, 17, 14, -0.14);
    sh(ctx, S, C(p.light), 3.4);
    hi(ctx, 20, -1 + bob, 8, 4, lite(C(p.light), 0.35), 0.5, -0.2);
    // morro alargado
    P(ctx);
    ctx.moveTo(30, -1 + bob);
    ctx.quadraticCurveTo(48, 2 + bob, 47, 11 + bob);
    ctx.quadraticCurveTo(42, 17 + bob, 28, 15 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 2.8);
    P(ctx); cir(ctx, 45, 4 + bob, 3.2); fl(ctx, "#0d0a12");
    // dentadura visible
    for (var d = 0; d < 4; d++) {
      P(ctx); tri(ctx, 30 + d * 4.6, 12 + bob, 34 + d * 4.6, 12 + bob, 32 + d * 4.6, 19 + bob);
      fl(ctx, "#fff8e4");
    }
    line(ctx, 28, 12 + bob, 46, 10 + bob, A("#0d0a12", 0.55), 2);
    // ojos incandescentes, lo ultimo: nunca los tapa el fuego
    eyesGlow(ctx, 25, 2 + bob, 6, 3.4, C(p.accent));
    brows(ctx, 25, -4 + bob, 6, 7, C(p.dark));
  };

  /* --- OJO FLOTANTE: pupila que sigue el facing -------------------------- */
  CREATURES.eye = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.9) * 3;
    shadow(ctx, 20, 46, 0.22);
    // tentaculos gruesos y rizados que se afinan hacia la punta
    for (var i = -2; i <= 2; i++) {
      var w = sin(t * 3 + i * 1.2) * 5;
      var x0 = i * 9, x1 = i * 13 + w, x2 = i * 11 + w * 1.6;
      for (var pass = 0; pass < 2; pass++) {
        P(ctx);
        ctx.moveTo(x0, 14 + bob);
        ctx.bezierCurveTo(x1, 26 + bob, x2 - w, 34 + bob, x2, 44 + bob);
        st(ctx, pass ? C(mix(p.dark, "#ffffff", 0.22)) : dark(C(p.dark), 0.35),
          pass ? 3.6 - abs(i) * 0.5 : 7 - abs(i) * 0.8);
      }
      P(ctx); cir(ctx, x2, 44 + bob, 2.6); fl(ctx, C(p.accent));
    }
    // globo: degradado radial cacheado, centrado tras el translate
    ctx.save();
    ctx.translate(0, -4 + bob);
    ctx.fillStyle = rad(ctx, 27, [[0, C(p.light)], [0.72, C(p.main)], [1, C(mix(p.main, p.dark, 0.45))]]);
    P(ctx); cir(ctx, 0, 0, 27); ctx.fill();
    st(ctx, S.ink, 3.4);
    ctx.restore();
    // venas: finas y tenues, solo insinuadas
    for (var v = 0; v < 4; v++) {
      var a = 2.2 + v * 0.5;
      P(ctx);
      ctx.moveTo(cos(a) * 25, -4 + bob + sin(a) * 25);
      ctx.quadraticCurveTo(cos(a) * 16, -4 + bob + sin(a) * 15, cos(a) * 9 + 3, -4 + bob + sin(a) * 6);
      st(ctx, A("#c8505c", 0.3), 1.3);
    }
    // iris que mira hacia facing
    var ix = 9, iy = -3 + bob;
    P(ctx); cir(ctx, ix, iy, 13.5); sh(ctx, S, C(p.accent), 2.6);
    P(ctx); cir(ctx, ix, iy, 9); fl(ctx, A(dark(C(p.accent), 0.4), 0.55));
    P(ctx); cir(ctx, ix, iy, 6.2); fl(ctx, "#0a0610");
    // parpado superior carnoso: cierra la silueta por arriba
    P(ctx);
    ctx.moveTo(-26, -12 + bob);
    ctx.quadraticCurveTo(0, -36 + bob, 26, -12 + bob);
    ctx.quadraticCurveTo(0, -22 + bob, -26, -12 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.dark), 2.4);
    // pestañas / pliegues
    for (var l = -1; l <= 1; l++) {
      line(ctx, l * 11, -24 + bob - abs(l) * 3, l * 13, -32 + bob - abs(l) * 2, C(p.dark), 2.6);
    }
    // destellos
    P(ctx); cir(ctx, ix - 5, iy - 5, 3.2); fl(ctx, "#ffffff");
    P(ctx); cir(ctx, -11, -13 + bob, 4.4); fl(ctx, A("#ffffff", 0.5));
  };

  /* ===========================================================================
     10. JEFES
     ======================================================================== */

  /* --- REY RATA ---------------------------------------------------------- */
  CREATURES.boss_rat = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 2) * 1.6;
    shadow(ctx, 42, 46, 0.42);
    // cola gruesa
    P(ctx);
    ctx.moveTo(-26, 24);
    ctx.quadraticCurveTo(-50, 22 + sin(t * 2.4) * 6, -50, -8 + sin(t * 2.4) * 9);
    st(ctx, C(p.dark), 7);
    P(ctx);
    ctx.moveTo(-26, 24);
    ctx.quadraticCurveTo(-50, 22 + sin(t * 2.4) * 6, -50, -8 + sin(t * 2.4) * 9);
    st(ctx, C("#d49a8e"), 3.4);
    // patas
    for (var i = 0; i < 4; i++) {
      P(ctx); rrc(ctx, -24 + i * 16, 36 + bob * 0.2, 12, 18, 5); sh(ctx, S, C(p.dark), 2.8);
      for (var c = -1; c <= 1; c++) {
        line(ctx, -24 + i * 16 + c * 3.5, 44, -24 + i * 16 + c * 4.5, 48, C("#efe3cf"), 1.8);
      }
    }
    // cuerpo enorme
    P(ctx); ell(ctx, -6, 14 + bob, 34, 23, -0.08);
    sh(ctx, S, C(p.main), 3.6);
    hi(ctx, -14, 0 + bob, 18, 9, C(p.light), 0.4, -0.25);
    P(ctx); ell(ctx, -4, 26, 20, 11); fl(ctx, A(C(p.light), 0.3));
    // orejas rasgadas
    for (var e = 0; e < 2; e++) {
      var ex = 16 + e * 15, ey = -16 - e * 3 + bob;
      P(ctx); cir(ctx, ex, ey, 12); sh(ctx, S, C(p.main), 3);
      P(ctx); cir(ctx, ex, ey, 6.4); fl(ctx, C("#d49a8e"));
      if (e === 1) { P(ctx); tri(ctx, ex + 4, ey - 12, ex + 11, ey - 3, ex + 2, ey - 2); fl(ctx, C(p.dark)); }
    }
    // cabeza + hocico
    P(ctx);
    ctx.moveTo(6, -8 + bob);
    ctx.quadraticCurveTo(28, -22 + bob, 44, -2 + bob);
    ctx.lineTo(51, 10 + bob);
    ctx.quadraticCurveTo(32, 24 + bob, 8, 16 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.6);
    hi(ctx, 24, -10 + bob, 13, 5, C(p.light), 0.4, -0.3);
    P(ctx); cir(ctx, 50, 9 + bob, 4); fl(ctx, C("#d49a8e"));
    // dientes de roedor
    P(ctx); poly(ctx, [38, 15 + bob, 46, 15 + bob, 44, 27 + bob, 40, 27 + bob]);
    sh(ctx, S, "#fff3d4", 2.2);
    // cicatriz sobre el ojo
    line(ctx, 22, -12 + bob, 34, 4 + bob, A("#e0a0a0", 0.85), 2.4);
    // ojo rojo brillante
    eyesGlow(ctx, 28, -2 + bob, 0, 4.6, "#ff3a2a");
    // bigotes
    line(ctx, 44, 6 + bob, 58, -2 + bob, A(C(p.light), 0.55), 1.6);
    line(ctx, 44, 12 + bob, 58, 18 + bob, A(C(p.light), 0.55), 1.6);
    // CORONA
    ctx.save();
    ctx.translate(26, -30 + bob);
    ctx.rotate(-0.12);
    glow(ctx, 0, 0, 26, C(p.accent), 0.45);
    P(ctx);
    ctx.moveTo(-17, 6); ctx.lineTo(-17, -6); ctx.lineTo(-10, 1); ctx.lineTo(-4, -12);
    ctx.lineTo(2, 1); ctx.lineTo(9, -8); ctx.lineTo(15, 1); ctx.lineTo(19, -5);
    ctx.lineTo(19, 6);
    ctx.closePath();
    sh(ctx, S, C(p.accent), 2.8);
    hi(ctx, -6, 3, 9, 2, "#fff6c0", 0.6);
    P(ctx); cir(ctx, -4, -13, 3); fl(ctx, "#ff4a6a");
    P(ctx); cir(ctx, 9, -9, 2.4); fl(ctx, "#6affa0");
    ctx.restore();
  };

  /* --- SEÑOR DE LOS HUESOS ---------------------------------------------- */
  CREATURES.boss_bones = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.5) * 2.2;
    shadow(ctx, 40, 46, 0.4);
    // capa detras, con dobladillo ondulado dentro de la casilla
    P(ctx);
    ctx.moveTo(-24, -20 + bob);
    ctx.quadraticCurveTo(-46, 6, -40, 44);
    for (var i = 0; i < 5; i++) {
      ctx.quadraticCurveTo(-40 + i * 16 + 8, 37 + sin(t * 2 + i) * 4, -40 + (i + 1) * 16, 44);
    }
    ctx.quadraticCurveTo(46, 6, 24, -20 + bob);
    ctx.closePath();
    sh(ctx, S, C("#40204f"), 3.2);
    hi(ctx, -24, 10, 8, 20, C("#6a3a80"), 0.4);
    // pelvis / base
    P(ctx); rrc(ctx, 0, 30, 30, 14, 6); sh(ctx, S, C(p.main), 3);
    line(ctx, -10, 30, -14, 44, C(p.main), 6);
    line(ctx, 10, 30, 14, 44, C(p.main), 6);
    // columna
    for (var v = 0; v < 4; v++) {
      P(ctx); cir(ctx, 0, 8 + v * 6, 4 - v * 0.3); sh(ctx, S, C(p.light), 2);
    }
    // caja toracica gigante: es la masa dominante del jefe
    P(ctx);
    ctx.moveTo(-31, -16 + bob);
    ctx.quadraticCurveTo(-35, 16, 0, 23);
    ctx.quadraticCurveTo(35, 16, 31, -16 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.6);
    for (var r = 0; r < 4; r++) {
      P(ctx); ctx.arc(0, -13 + r * 9 + bob * 0.5, 29 - r * 3.4, 0.18, PI - 0.18);
      st(ctx, A(C(p.dark), 0.9), 3.8);
    }
    // nucleo de alma
    glow(ctx, 0, 2 + bob, 20, C(p.accent), 0.65);
    P(ctx); cir(ctx, 0, 2 + bob, 5.5); fl(ctx, lite(C(p.accent), 0.5));
    // clavicula + brazos abiertos
    for (var s = -1; s <= 1; s += 2) {
      P(ctx); cir(ctx, s * 27, -18 + bob, 8); sh(ctx, S, C(p.light), 2.6);
      P(ctx);
      ctx.moveTo(s * 27, -18 + bob);
      ctx.quadraticCurveTo(s * 45, -12 + bob, s * 44, 6 + bob);
      st(ctx, C(p.main), 6);
      for (var f = -1; f <= 1; f++) {
        line(ctx, s * 44, 6 + bob, s * (44 + f * 5), 20 + bob, C(p.light), 2.6);
      }
    }
    // cuernos gruesos que barren hacia fuera (van detras del craneo)
    for (var h = -1; h <= 1; h += 2) {
      P(ctx);
      ctx.moveTo(h * 8, -26 + bob);
      ctx.quadraticCurveTo(h * 30, -34 + bob, h * 36, -56 + bob);
      ctx.quadraticCurveTo(h * 26, -40 + bob, h * 6, -38 + bob);
      ctx.closePath();
      sh(ctx, S, C(p.main), 3);
      hi(ctx, h * 21, -38 + bob, 7, 3.4, C(p.light), 0.5, h * 0.9);
    }
    // craneo
    P(ctx); ell(ctx, 0, -32 + bob, 18, 16);
    sh(ctx, S, C(p.light), 3.6);
    P(ctx); rrc(ctx, 0, -18 + bob, 18, 7.5, 3); sh(ctx, S, C(p.main), 2.6);
    for (var d = -3; d <= 3; d++) line(ctx, d * 4.6, -22 + bob, d * 4.6, -14 + bob, A(C(p.dark), 0.7), 1.5);
    for (var o = -1; o <= 1; o += 2) {
      P(ctx); ell(ctx, o * 7, -35 + bob, 5.8, 6.6); fl(ctx, "#06070a");
    }
    eyesGlow(ctx, 0, -35 + bob, 7, 3.2, C(p.accent));
    P(ctx); tri(ctx, -2.4, -26 + bob, 2.4, -26 + bob, 0, -30 + bob); fl(ctx, "#06070a");
  };

  /* --- TROL DE GUERRA --------------------------------------------------- */
  CREATURES.boss_troll = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.5) * 1.8;
    shadow(ctx, 44, 46, 0.42);
    // maza enorme levantada
    ctx.save();
    ctx.translate(29, -8 + bob);
    ctx.rotate(0.3 + sin(t * 1.4) * 0.07);
    line(ctx, 0, 34, 0, -18, C("#6b4a24"), 7);
    P(ctx); rrc(ctx, 0, -28, 23, 23, 6); sh(ctx, S, C("#6e6a5e"), 3.2);
    hi(ctx, -6, -35, 6, 3.4, "#a8a494", 0.5);
    for (var k = 0; k < 4; k++) {
      var a = k * TAU / 4 + 0.6;
      P(ctx); tri(ctx, cos(a) * 11, -28 + sin(a) * 11, cos(a) * 18, -28 + sin(a) * 18, cos(a + 0.5) * 11, -28 + sin(a + 0.5) * 11);
      fl(ctx, C("#c8c2ae"));
    }
    ctx.restore();
    // piernas cortas
    P(ctx); rrc(ctx, -16, 36, 20, 20, 7); sh(ctx, S, C(p.dark), 3);
    P(ctx); rrc(ctx, 16, 36, 20, 20, 7); sh(ctx, S, C(p.dark), 3);
    // torso masivo
    P(ctx); poly(ctx, [-37, -14 + bob, 37, -14 + bob, 25, 34, -25, 34]);
    sh(ctx, S, C(p.main), 3.6);
    hi(ctx, -19, -4 + bob, 12, 14, C(p.light), 0.4);
    // barriga
    P(ctx); ell(ctx, 0, 20, 23, 16); fl(ctx, A(C(p.light), 0.35));
    line(ctx, -21, 22, 21, 22, A(C(p.dark), 0.35), 2);
    // hombreras
    P(ctx); ell(ctx, -35, -14 + bob, 13, 11); sh(ctx, S, C(p.light), 3);
    P(ctx); ell(ctx, 35, -14 + bob, 13, 11); sh(ctx, S, C(p.light), 3);
    // brazos gruesos
    P(ctx); rrc(ctx, -38, 8 + bob, 15, 36, 8); sh(ctx, S, C(p.main), 3);
    P(ctx); rrc(ctx, 36, 6 + bob, 15, 30, 8); sh(ctx, S, C(p.main), 3);
    P(ctx); cir(ctx, -38, 28 + bob, 9.5); sh(ctx, S, C(p.main), 2.8);
    // verrugas
    for (var w = 0; w < 4; w++) {
      P(ctx); cir(ctx, -18 + w * 12, 4 + (w % 2) * 9 + bob, 3);
      fl(ctx, A(C(p.dark), 0.5));
    }
    // cabeza hundida
    P(ctx); ell(ctx, 0, -22 + bob, 18, 15);
    sh(ctx, S, C(p.main), 3.4);
    // ceja saliente
    P(ctx); rrc(ctx, 0, -28 + bob, 32, 8, 4); sh(ctx, S, C(p.dark), 2.6);
    eyesGlow(ctx, 0, -21 + bob, 8, 2.8, "#ffcf3d");
    // mandibula + colmillos
    P(ctx); rrc(ctx, 0, -10 + bob, 26, 11, 5); sh(ctx, S, C(p.dark), 2.8);
    P(ctx); tri(ctx, -13, -10 + bob, -5, -10 + bob, -9, -26 + bob); sh(ctx, S, C(p.accent), 2.2);
    P(ctx); tri(ctx, 5, -10 + bob, 13, -10 + bob, 9, -26 + bob); sh(ctx, S, C(p.accent), 2.2);
    // nariz chata
    P(ctx); ell(ctx, 0, -15 + bob, 6, 4); fl(ctx, A(C(p.dark), 0.7));
  };

  /* --- DEVORADOR DE ALMAS ----------------------------------------------- */
  CREATURES.boss_devourer = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var bob = sin(t * 1.3) * 2.6;
    shadow(ctx, 38, 47, 0.35);
    glow(ctx, 0, 2 + bob, 50, C(p.light), 0.3);
    // tentaculos exteriores
    for (var i = -3; i <= 3; i++) {
      if (!i) continue;
      var w = sin(t * 2.2 + i) * 7;
      P(ctx);
      ctx.moveTo(i * 8, 16 + bob);
      ctx.quadraticCurveTo(i * 13 + w, 32 + bob, i * 12 + w, 46 + bob);
      st(ctx, C(p.dark), 6 - abs(i) * 0.8);
    }
    // masa amorfa
    P(ctx);
    ctx.moveTo(-34, 4 + bob);
    ctx.bezierCurveTo(-38, -26 + bob, -14, -42 + bob, 2, -40 + bob);
    ctx.bezierCurveTo(24, -42 + bob, 40, -22 + bob, 34, 4 + bob);
    ctx.bezierCurveTo(30, 26 + bob, 14, 32 + bob, 0, 30 + bob);
    ctx.bezierCurveTo(-16, 32 + bob, -30, 24 + bob, -34, 4 + bob);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.6);
    hi(ctx, -14, -22 + bob, 13, 9, C(p.light), 0.4, -0.3);
    // vortice central (espirales que giran con t)
    ctx.save();
    ctx.translate(0, 2 + bob);
    ctx.rotate(t * 1.2);
    for (var v = 0; v < 3; v++) {
      P(ctx);
      for (var a = 0; a < 8; a++) {
        var ang = v * TAU / 3 + a * 0.32;
        var rr = 4 + a * 2.4;
        if (a === 0) ctx.moveTo(cos(ang) * rr, sin(ang) * rr);
        else ctx.lineTo(cos(ang) * rr, sin(ang) * rr);
      }
      st(ctx, A(C(p.accent), 0.7), 2.6);
    }
    glow(ctx, 0, 0, 20, C(p.accent), 0.7);
    P(ctx); cir(ctx, 0, 0, 5); fl(ctx, "#fffbe0");
    ctx.restore();
    // bocas con dientes
    var mouths = [[-18, -14, 13, 0.4], [20, -6, 11, -0.5], [-8, 20, 12, 2.9]];
    for (var m = 0; m < mouths.length; m++) {
      var M = mouths[m];
      ctx.save();
      ctx.translate(M[0], M[1] + bob);
      ctx.rotate(M[3]);
      var op = 0.55 + 0.45 * sin(t * 2.4 + m * 2);
      P(ctx); ell(ctx, 0, 0, M[2], M[2] * 0.5 * op + 2);
      fl(ctx, "#150420"); st(ctx, A(C(p.dark), 0.9), 2.2);
      for (var d = -2; d <= 2; d++) {
        P(ctx); tri(ctx, d * M[2] * 0.36 - 2.4, -M[2] * 0.5 * op, d * M[2] * 0.36 + 2.4, -M[2] * 0.5 * op, d * M[2] * 0.36, 0);
        fl(ctx, "#fff2d8");
        P(ctx); tri(ctx, d * M[2] * 0.36 - 2.4, M[2] * 0.5 * op, d * M[2] * 0.36 + 2.4, M[2] * 0.5 * op, d * M[2] * 0.36, 0);
        fl(ctx, "#e8dcc0");
      }
      ctx.restore();
    }
    // muchos ojos de distintos tamaños
    var es = [[-24, -24, 5.4], [-2, -30, 7], [22, -26, 5], [30, 8, 4.4], [-30, 2, 4], [8, -12, 4.6], [-16, 6, 3.6]];
    for (var e = 0; e < es.length; e++) {
      var E = es[e];
      var bl = sin(t * 2 + e * 1.7) > -0.85 ? 1 : 0.15; // parpadeo desfasado
      P(ctx); ell(ctx, E[0], E[1] + bob, E[2], E[2] * bl);
      fl(ctx, "#fff4cf"); st(ctx, A(C(p.dark), 0.8), 1.6);
      if (bl > 0.5) {
        P(ctx); cir(ctx, E[0] + 1, E[1] + bob, E[2] * 0.48); fl(ctx, "#1a0a22");
        P(ctx); cir(ctx, E[0] - 0.6, E[1] + bob - E[2] * 0.3, E[2] * 0.2); fl(ctx, "#ffffff");
      }
    }
  };

  /* --- LA SEMILLA (jefe final) ------------------------------------------ */
  CREATURES.boss_seed = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var beat = Math.pow(0.5 + 0.5 * sin(t * 2.4), 3);
    var k = 1 + beat * 0.07;
    shadow(ctx, 42, 47, 0.45);
    glow(ctx, 0, 0, 52 + beat * 8, C(p.main), 0.35 + beat * 0.25);
    // raices
    for (var i = -3; i <= 3; i++) {
      if (!i) continue;
      var sgn = i < 0 ? -1 : 1;
      P(ctx);
      ctx.moveTo(i * 5, 22);
      ctx.quadraticCurveTo(i * 12, 34, sgn * (14 + abs(i) * 9), 46);
      st(ctx, C(p.dark), 7 - abs(i));
      P(ctx);
      ctx.moveTo(i * 6, 28);
      ctx.quadraticCurveTo(i * 9, 36, sgn * (8 + abs(i) * 6), 44);
      st(ctx, C(mix(p.dark, p.main, 0.5)), 2.6);
    }
    // espinas superiores
    for (var s = -2; s <= 2; s++) {
      var ang = s * 0.42 - PI / 2;
      var bx = cos(ang) * 26, by = -6 + sin(ang) * 30;
      P(ctx);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + cos(ang) * 16 - 3, by + sin(ang) * 18);
      ctx.lineTo(bx + 4, by + 3);
      ctx.closePath();
      sh(ctx, S, C(p.dark), 2.2);
    }
    ctx.save();
    ctx.scale(k, k);
    // cuerpo: semilla/corazon
    P(ctx);
    ctx.moveTo(0, -36);
    ctx.bezierCurveTo(-22, -40, -34, -18, -30, 2);
    ctx.bezierCurveTo(-27, 22, -12, 30, 0, 34);
    ctx.bezierCurveTo(12, 30, 27, 22, 30, 2);
    ctx.bezierCurveTo(34, -18, 22, -40, 0, -36);
    ctx.closePath();
    ctx.fillStyle = vg(ctx, -36, 34, [[0, C(p.light)], [0.45, C(p.main)], [1, C(p.dark)]]);
    ctx.fill();
    st(ctx, S.ink, 3.6);
    hi(ctx, -13, -22, 10, 7, C(p.light), 0.45, -0.35);
    // venas palpitantes
    ctx.save();
    ctx.globalAlpha *= 0.5 + beat * 0.5;
    for (var v = -2; v <= 2; v++) {
      P(ctx);
      ctx.moveTo(v * 5, 30);
      ctx.quadraticCurveTo(v * 13, 8, v * 11, -24);
      st(ctx, C(p.accent), 2.4);
    }
    P(ctx);
    ctx.moveTo(-26, -6); ctx.quadraticCurveTo(-8, -2, 0, -10);
    ctx.quadraticCurveTo(10, -2, 26, -8);
    st(ctx, A(C(p.accent), 0.8), 2);
    ctx.restore();
    // surco de la semilla
    P(ctx);
    ctx.moveTo(0, -34); ctx.quadraticCurveTo(-4, 0, 0, 32);
    st(ctx, A(C(p.dark), 0.75), 2.6);
    // OJO central
    glow(ctx, 0, -4, 22 + beat * 6, C(p.accent), 0.6);
    P(ctx); ell(ctx, 0, -4, 16, 13);
    fl(ctx, "#fff3d6"); st(ctx, S.ink, 2.8);
    P(ctx); ell(ctx, 3, -4, 9, 11); sh(ctx, S, C("#d8452e"), 2.2);
    P(ctx); ell(ctx, 3, -4, 3, 10); fl(ctx, "#0a0308"); // pupila vertical
    P(ctx); cir(ctx, -2, -9, 3); fl(ctx, "#ffffff");
    // bocas pequeñas a los lados
    for (var m = -1; m <= 1; m += 2) {
      var op2 = 2 + beat * 4;
      P(ctx); ell(ctx, m * 19, 14, 7, op2);
      fl(ctx, "#180409"); st(ctx, A(C(p.dark), 0.9), 1.8);
      for (var d = -1; d <= 1; d++) {
        P(ctx); tri(ctx, m * 19 + d * 4 - 1.8, -op2 + 14, m * 19 + d * 4 + 1.8, -op2 + 14, m * 19 + d * 4, 14);
        fl(ctx, "#fff2d8");
      }
    }
    ctx.restore();
    // motas de esporas flotando
    for (var q = 0; q < 5; q++) {
      var ph = (t * 0.35 + nz(q * 5.7)) % 1;
      var x = -34 + nz(q) * 68;
      P(ctx); cir(ctx, x + sin(t + q) * 4, 30 - ph * 62, 2 + nz(q + 3) * 1.6);
      fl(ctx, A(C(p.accent), 0.7 * (1 - ph)));
    }
  };

  /* ===========================================================================
     11. HEROES
     ======================================================================== */

  var HEROES = {};

  // piernas + botas estandar
  function heroLegs(ctx, S, cLeg, cBoot, dash) {
    var sp = dash ? 7 : 0;
    P(ctx); rrc(ctx, -9 - sp * 0.4, 30, 11, 22, 5); sh(ctx, S, cLeg, 2.8);
    P(ctx); rrc(ctx, 9 + sp * 0.4, 30, 11, 22, 5); sh(ctx, S, cLeg, 2.8);
    P(ctx); rrc(ctx, -11 - sp * 0.5, 42, 16, 9, 4); sh(ctx, S, cBoot, 2.4);
    P(ctx); rrc(ctx, 11 + sp * 0.5, 42, 16, 9, 4); sh(ctx, S, cBoot, 2.4);
  }

  // rostro humano generico
  function heroFace(ctx, S, x, y, skin, look) {
    P(ctx); ell(ctx, x, y, 14, 13);
    sh(ctx, S, skin, 3);
    hi(ctx, x - 5, y - 6, 7, 4.4, lite(skin, 0.45), 0.5);
    eyes(ctx, x, y - 1, 6.2, 4.6, look, "#141018");
    P(ctx); ctx.arc(x, y + 5, 5, 0.25, PI - 0.25); st(ctx, A("#3a1f1f", 0.7), 2);
  }

  // estelas de dash
  function fxDash(ctx, S) {
    ctx.save();
    ctx.globalAlpha *= 0.5;
    for (var i = 0; i < 3; i++) {
      P(ctx);
      ctx.moveTo(-26 - i * 9, -6 + i * 13);
      ctx.lineTo(-44 - i * 9, -6 + i * 13);
      st(ctx, A("#dfe8ff", 0.8 - i * 0.2), 3.4);
    }
    ctx.restore();
  }

  // arco blanco del golpe
  function fxSwing(ctx, S, k, r, c) {
    if (k <= 0) return;
    var a0 = -1.9 + k * 2.6;
    ctx.save();
    ctx.globalAlpha *= 0.75 * (1 - Math.abs(k - 0.5) * 0.8);
    P(ctx);
    ctx.arc(6, 4, r, a0 - 0.75, a0 + 0.75);
    st(ctx, c || "#ffffff", 5.5);
    P(ctx);
    ctx.arc(6, 4, r - 6, a0 - 0.5, a0 + 0.5);
    st(ctx, A("#ffffff", 0.6), 2.6);
    ctx.restore();
  }

  /* --- VAGABUNDO: capa gris, espada corta -------------------------------- */
  HEROES.vagabundo = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p, o = S.o;
    var br = sin(t * (S.lowHp ? 6 : 2.3)) * 1.4;
    shadow(ctx, 26, 45);
    if (S.dashing) fxDash(ctx, S);
    // capa
    P(ctx);
    ctx.moveTo(-16, -14 + br);
    ctx.quadraticCurveTo(-30, 8, -26, 40);
    for (var i = 0; i < 4; i++) {
      ctx.quadraticCurveTo(-26 + i * 13 + 6, 34 + sin(t * 2.4 + i) * 4, -26 + (i + 1) * 13, 40);
    }
    ctx.quadraticCurveTo(28, 8, 16, -14 + br);
    ctx.closePath();
    sh(ctx, S, C(mix(p.main, p.dark, 0.55)), 3.2);
    hi(ctx, -16, 6, 7, 18, C(p.main), 0.45);
    heroLegs(ctx, S, C("#5b4a38"), C("#3a2c1e"), S.dashing);
    // torso
    P(ctx); poly(ctx, [-16, -10 + br, 16, -10 + br, 13, 26, -13, 26]);
    sh(ctx, S, C("#7a5c3c"), 3.2);
    hi(ctx, -7, -2 + br, 6, 10, C("#a8825a"), 0.4);
    // cinturon
    P(ctx); rrc(ctx, 0, 20, 30, 7, 2); sh(ctx, S, C("#3a2c1e"), 2.2);
    P(ctx); rrc(ctx, 0, 20, 7, 7, 2); sh(ctx, S, C(p.accent), 1.8);
    // hombreras de cuero
    P(ctx); ell(ctx, -18, -11 + br, 10, 7); sh(ctx, S, C("#5b4a38"), 2.4);
    P(ctx); ell(ctx, 18, -11 + br, 10, 7); sh(ctx, S, C("#5b4a38"), 2.4);
    // brazo izquierdo
    P(ctx); rrc(ctx, -20, 6 + br, 9, 24, 4.5); sh(ctx, S, C("#7a5c3c"), 2.6);
    // brazo derecho con espada (barre si attacking)
    ctx.save();
    ctx.translate(18, 2 + br);
    ctx.rotate(-0.5 + S.atk * 1.9);
    P(ctx); rrc(ctx, 0, 10, 9, 24, 4.5); sh(ctx, S, C("#7a5c3c"), 2.6);
    ctx.translate(0, 18);
    P(ctx); rrc(ctx, 0, 4, 5, 11, 2); sh(ctx, S, C("#3a2c1e"), 2);
    P(ctx); rrc(ctx, 0, -2, 16, 3.6, 1.8); sh(ctx, S, C(p.accent), 1.8);
    blade(ctx, S, 30, 11, C("#dce4f2"));
    ctx.restore();
    // capucha bajada: collar ancho DEBAJO de la cabeza
    P(ctx); ell(ctx, 0, -7 + br, 18, 6.5); sh(ctx, S, C(p.main), 2.6);
    heroFace(ctx, S, 0, -23 + br, C("#d9a878"), S.look);
    // flequillo: solo la coronilla, no invade la cara
    P(ctx);
    ctx.moveTo(-14, -26 + br);
    ctx.quadraticCurveTo(-11, -38 + br, 1, -36 + br);
    ctx.quadraticCurveTo(13, -38 + br, 14, -26 + br);
    ctx.quadraticCurveTo(7, -31 + br, 0, -29 + br);
    ctx.quadraticCurveTo(-7, -30 + br, -14, -26 + br);
    ctx.closePath();
    sh(ctx, S, C("#4a3826"), 2.4);
    fxSwing(ctx, S, S.atk, 38);
  };

  /* --- BERSERKER: torso desnudo, hacha doble, pintura de guerra ---------- */
  HEROES.berserker = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var br = sin(t * (S.lowHp ? 6.5 : 2.6)) * 1.8;
    shadow(ctx, 30, 45);
    if (S.dashing) fxDash(ctx, S);
    heroLegs(ctx, S, C("#6b5434"), C("#4a3a22"), S.dashing);
    // falda de piel
    P(ctx); poly(ctx, [-17, 18, 17, 18, 20, 34, -20, 34]);
    sh(ctx, S, C("#8a6a3e"), 2.8);
    for (var f = -2; f <= 2; f++) {
      P(ctx); tri(ctx, f * 7 - 3.5, 32, f * 7 + 3.5, 32, f * 7, 40); fl(ctx, C("#6b5434"));
    }
    // torso musculoso desnudo
    P(ctx); poly(ctx, [-23, -10 + br, 23, -10 + br, 15, 22, -15, 22]);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -10, -2 + br, 7, 9, C(p.light), 0.45);
    // pectorales + abdominales
    P(ctx); ctx.arc(-8, -2 + br, 8, -0.1, 1.7); st(ctx, A(C(p.dark), 0.55), 2.2);
    P(ctx); ctx.arc(8, -2 + br, 8, 1.45, 3.25); st(ctx, A(C(p.dark), 0.55), 2.2);
    line(ctx, 0, 4 + br, 0, 18, A(C(p.dark), 0.45), 2);
    line(ctx, -7, 10, 7, 10, A(C(p.dark), 0.4), 1.8);
    // pintura de guerra en el pecho
    P(ctx);
    ctx.moveTo(-12, -6 + br); ctx.lineTo(0, 6 + br); ctx.lineTo(12, -6 + br);
    st(ctx, C(p.accent), 3.4);
    // hombros y brazos gruesos
    P(ctx); ell(ctx, -24, -10 + br, 11, 9); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, -27, 8 + br, 12, 28, 6); sh(ctx, S, C(p.main), 2.8);
    // brazo del hacha
    ctx.save();
    ctx.translate(22, -4 + br);
    ctx.rotate(-0.65 + S.atk * 2.2);
    P(ctx); ell(ctx, 0, -2, 11, 9); sh(ctx, S, C(p.main), 2.8);
    P(ctx); rrc(ctx, 2, 14, 12, 28, 6); sh(ctx, S, C(p.main), 2.8);
    // hacha doble
    ctx.translate(4, 26);
    line(ctx, 0, 12, 0, -30, C("#5e4426"), 6);
    for (var s = -1; s <= 1; s += 2) {
      P(ctx);
      ctx.moveTo(s * 1, -30);
      ctx.quadraticCurveTo(s * 22, -30, s * 23, -12);
      ctx.quadraticCurveTo(s * 11, -9, s * 1, -14);
      ctx.closePath();
      sh(ctx, S, C("#b8c2d2"), 2.8);
      hi(ctx, s * 10, -24, 6, 3, "#eef3ff", 0.5, s * 0.3);
    }
    P(ctx); cir(ctx, 0, -22, 5); sh(ctx, S, C("#8a6a34"), 2);
    ctx.restore();
    // cabeza
    heroFace(ctx, S, 0, -22 + br, C(p.main), S.look);
    // pintura roja en la cara
    line(ctx, -13, -26 + br, 13, -26 + br, A(C(p.accent), 0.9), 4);
    line(ctx, 0, -32 + br, 0, -14 + br, A(C(p.accent), 0.55), 3);
    // melena salvaje
    P(ctx);
    ctx.moveTo(-15, -22 + br);
    ctx.quadraticCurveTo(-24, -42 + br, -6, -38 + br);
    ctx.quadraticCurveTo(0, -46 + br, 8, -37 + br);
    ctx.quadraticCurveTo(24, -42 + br, 15, -21 + br);
    ctx.quadraticCurveTo(0, -30 + br, -15, -22 + br);
    ctx.closePath();
    sh(ctx, S, C("#8a3a20"), 2.6);
    fxSwing(ctx, S, S.atk, 42, "#ffd9c0");
  };

  /* --- ARCANISTA: tunica azul, baston con orbe --------------------------- */
  HEROES.arcanista = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var br = sin(t * (S.lowHp ? 6 : 2)) * 1.5;
    var pu = 0.5 + 0.5 * sin(t * 3.2);
    shadow(ctx, 26, 45);
    if (S.dashing) fxDash(ctx, S);
    // baston con orbe
    ctx.save();
    ctx.translate(-24, 4);
    ctx.rotate(0.06 + S.atk * -0.5);
    line(ctx, 0, 40, 0, -26, C("#6b4a24"), 5.5);
    line(ctx, -1, 34, -1, -22, A("#a97a3c", 0.7), 2);
    // soporte del orbe
    P(ctx); ctx.arc(0, -30, 9, 0.5, PI - 0.5); st(ctx, C("#c9a05e"), 3);
    glow(ctx, 0, -33, 22 + pu * 8, C(p.accent), 0.7);
    P(ctx); cir(ctx, 0, -33, 8);
    ctx.save(); ctx.translate(0, -33);
    ctx.fillStyle = rad(ctx, 8, [[0, "#ffffff"], [0.5, C(p.accent)], [1, C(p.main)]]);
    P(ctx); cir(ctx, 0, 0, 8); ctx.fill();
    ctx.restore();
    st(ctx, A("#ffffff", 0.7), 1.8);
    // chispas orbitando
    for (var k = 0; k < 3; k++) {
      var a = t * 2 + k * TAU / 3;
      P(ctx); cir(ctx, cos(a) * 14, -33 + sin(a) * 6, 2.2);
      fl(ctx, A(C(p.accent), 0.9));
    }
    ctx.restore();
    // tunica larga
    P(ctx);
    ctx.moveTo(-15, -12 + br);
    ctx.quadraticCurveTo(-24, 12, -25, 44);
    ctx.lineTo(25, 44);
    ctx.quadraticCurveTo(24, 12, 15, -12 + br);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -9, 6, 6, 20, C(p.light), 0.35);
    // estola dorada
    P(ctx); poly(ctx, [-6, -10 + br, 6, -10 + br, 4, 38, -4, 38]);
    fl(ctx, A(C("#e8c45c"), 0.85));
    // runas del dobladillo
    for (var r = -2; r <= 2; r++) {
      P(ctx); cir(ctx, r * 9, 38, 2.4); fl(ctx, A(C(p.accent), 0.8));
    }
    // mangas
    P(ctx); rrc(ctx, -20, 6 + br, 13, 24, 6); sh(ctx, S, C(p.main), 2.6);
    P(ctx); rrc(ctx, 20, 6 + br, 13, 24, 6); sh(ctx, S, C(p.main), 2.6);
    // capucha + cara en sombra
    P(ctx);
    ctx.moveTo(-17, -10 + br);
    ctx.quadraticCurveTo(-18, -34 + br, 0, -37 + br);
    ctx.quadraticCurveTo(18, -34 + br, 17, -10 + br);
    ctx.quadraticCurveTo(0, -4 + br, -17, -10 + br);
    ctx.closePath();
    sh(ctx, S, C(p.dark), 3.2);
    hi(ctx, -7, -26 + br, 6, 8, C(p.main), 0.45, -0.3);
    P(ctx); ell(ctx, 0, -17 + br, 11.5, 11);
    fl(ctx, C("#2a2f52"));
    // barbilla / boca visible
    P(ctx); ell(ctx, 0, -11 + br, 7, 4.4); fl(ctx, C("#c99a72"));
    eyesGlow(ctx, 0, -18 + br, 5, 2.8, C(p.accent));
    // estrella en la capucha
    P(ctx); cir(ctx, 0, -33 + br, 2.6); fl(ctx, C("#e8c45c"));
    fxSwing(ctx, S, S.atk, 40, C(p.accent));
  };

  /* --- CENTINELA: armadura pesada, escudo grande ------------------------- */
  HEROES.centinela = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var br = sin(t * (S.lowHp ? 5.5 : 1.8)) * 1.1;
    shadow(ctx, 30, 45);
    if (S.dashing) fxDash(ctx, S);
    heroLegs(ctx, S, C(p.main), C(p.dark), S.dashing);
    P(ctx); rrc(ctx, -10, 34, 14, 10, 3); sh(ctx, S, C(p.light), 2.2);
    P(ctx); rrc(ctx, 10, 34, 14, 10, 3); sh(ctx, S, C(p.light), 2.2);
    // faldon
    P(ctx); poly(ctx, [-18, 16, 18, 16, 21, 30, -21, 30]);
    sh(ctx, S, C(p.main), 2.8);
    // lanza corta a la espalda
    ctx.save();
    ctx.translate(-20, 4 + br);
    ctx.rotate(-0.22 + S.atk * 1.5);
    line(ctx, 0, 34, 0, -24, C("#6b4a24"), 4.6);
    P(ctx); tri(ctx, 0, -38, -5, -22, 5, -22); sh(ctx, S, C(p.light), 2.2);
    ctx.restore();
    // coraza
    P(ctx); poly(ctx, [-20, -10 + br, 20, -10 + br, 16, 20, -16, 20]);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -9, -3 + br, 6, 9, C(p.light), 0.5);
    line(ctx, 0, -8 + br, 0, 18, A(C(p.dark), 0.6), 2.2);
    P(ctx); ctx.arc(0, -6 + br, 12, 0.35, PI - 0.35); st(ctx, A(C(p.dark), 0.5), 2.2);
    // hombreras grandes
    P(ctx); ell(ctx, -22, -12 + br, 12, 9); sh(ctx, S, C(p.light), 2.8);
    P(ctx); ell(ctx, 22, -12 + br, 12, 9); sh(ctx, S, C(p.light), 2.8);
    // brazos
    P(ctx); rrc(ctx, -25, 6 + br, 11, 24, 5); sh(ctx, S, C(p.main), 2.6);
    P(ctx); rrc(ctx, 25, 6 + br, 11, 24, 5); sh(ctx, S, C(p.main), 2.6);
    // yelmo
    P(ctx); rrc(ctx, 0, -23 + br, 26, 25, 9);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -7, -31 + br, 7, 5, C(p.light), 0.55, -0.3);
    P(ctx); rrc(ctx, 0, -22 + br, 22, 7, 2.4); fl(ctx, "#07070d");
    eyes(ctx, 0, -22 + br, 6, 3, S.look, "#0b0b12", "#cfe4ff");
    P(ctx); rrc(ctx, 0, -14 + br, 5, 12, 2); sh(ctx, S, C(p.light), 2);
    // cresta
    P(ctx); poly(ctx, [-3, -36 + br, 3, -36 + br, 6, -46 + br, -6, -46 + br]);
    sh(ctx, S, C(p.accent), 2.2);
    // escudo grande al frente
    ctx.save();
    ctx.translate(24, 8 + br * 0.5);
    P(ctx);
    ctx.moveTo(-15, -24); ctx.lineTo(15, -24);
    ctx.quadraticCurveTo(18, 8, 0, 30);
    ctx.quadraticCurveTo(-18, 8, -15, -24);
    ctx.closePath();
    sh(ctx, S, C(p.light), 3.6);
    line(ctx, 0, -20, 0, 22, A(C(p.accent), 0.95), 5);
    line(ctx, -12, -6, 12, -6, A(C(p.accent), 0.95), 5);
    P(ctx); cir(ctx, 0, -6, 5.5); sh(ctx, S, C(p.accent), 2.2);
    hi(ctx, -8, -16, 4.4, 8, "#ffffff", 0.4);
    for (var rv = 0; rv < 3; rv++) {
      P(ctx); cir(ctx, -11 + rv * 11, -21, 1.8); fl(ctx, A(C(p.dark), 0.8));
    }
    ctx.restore();
  };

  /* --- LADRON: esbelto, dos dagas, bufanda que flota -------------------- */
  HEROES.ladron = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var br = sin(t * (S.lowHp ? 6.5 : 2.8)) * 1.4;
    shadow(ctx, 22, 45);
    if (S.dashing) fxDash(ctx, S);
    // bufanda larga ondeando hacia atras
    P(ctx);
    ctx.moveTo(-8, -10 + br);
    ctx.quadraticCurveTo(-26, -16 + sin(t * 3.4) * 7, -44, -6 + sin(t * 3.4 + 1) * 10);
    ctx.quadraticCurveTo(-28, -2 + sin(t * 3.4 + 1) * 8, -6, -2 + br);
    ctx.closePath();
    sh(ctx, S, C(p.accent), 2.6);
    hi(ctx, -26, -10, 10, 2.6, lite(C(p.accent), 0.5), 0.45);
    heroLegs(ctx, S, C(p.main), C(p.dark), S.dashing);
    // torso esbelto
    P(ctx); poly(ctx, [-14, -10 + br, 14, -10 + br, 11, 24, -11, 24]);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -6, -2 + br, 5, 9, C(p.light), 0.45);
    // correas cruzadas
    line(ctx, -12, -6 + br, 12, 16, C("#4a3a26"), 3.4);
    line(ctx, 12, -6 + br, -12, 16, C("#4a3a26"), 3.4);
    P(ctx); rrc(ctx, 0, 18, 26, 6, 2); sh(ctx, S, C("#4a3a26"), 2);
    // brazo izquierdo con daga hacia atras
    ctx.save();
    ctx.translate(-17, 6 + br);
    ctx.rotate(0.5 - S.atk * 0.8);
    P(ctx); rrc(ctx, 0, 8, 8, 22, 4); sh(ctx, S, C(p.main), 2.4);
    ctx.translate(0, 18);
    ctx.rotate(PI * 0.85);
    P(ctx); rrc(ctx, 0, 3, 4.4, 9, 2); sh(ctx, S, C(p.dark), 1.8);
    blade(ctx, S, 20, 8, C("#cdd6e6"));
    ctx.restore();
    // brazo derecho con daga (barre)
    ctx.save();
    ctx.translate(17, 4 + br);
    ctx.rotate(-0.6 + S.atk * 2.3);
    P(ctx); rrc(ctx, 0, 8, 8, 22, 4); sh(ctx, S, C(p.main), 2.4);
    ctx.translate(0, 17);
    P(ctx); rrc(ctx, 0, 3, 4.4, 9, 2); sh(ctx, S, C(p.dark), 1.8);
    P(ctx); rrc(ctx, 0, -2, 11, 3, 1.5); sh(ctx, S, C("#8a6a34"), 1.6);
    blade(ctx, S, 22, 8.5, C("#e2eaf8"));
    ctx.restore();
    // capucha estrecha
    P(ctx);
    ctx.moveTo(-15, -10 + br);
    ctx.quadraticCurveTo(-16, -32 + br, 0, -35 + br);
    ctx.quadraticCurveTo(16, -32 + br, 15, -10 + br);
    ctx.quadraticCurveTo(0, -5 + br, -15, -10 + br);
    ctx.closePath();
    sh(ctx, S, C(p.dark), 3.2);
    hi(ctx, -6, -25 + br, 6, 8, C(p.main), 0.45, -0.3);
    // pico de la capucha
    P(ctx); tri(ctx, 4, -34 + br, 20, -30 + br, 6, -24 + br); sh(ctx, S, C(p.dark), 2.2);
    // cara en sombra + ojos agudos
    P(ctx); ell(ctx, 1, -17 + br, 11, 10.5); fl(ctx, C("#101420"));
    P(ctx); ell(ctx, 1, -12 + br, 8, 4.4); fl(ctx, C("#c89a72"));
    for (var e = -1; e <= 1; e += 2) {
      P(ctx); ell(ctx, 1 + e * 5, -18 + br, 3.6, 2.4, e * 0.3);
      fl(ctx, "#f0f6ff");
      P(ctx); cir(ctx, 1 + e * 5 + S.look * 1.2, -18 + br, 1.5); fl(ctx, "#12141c");
    }
    fxSwing(ctx, S, S.atk, 34, "#dff2ff");
  };

  /* --- NIGROMANTE: tunica rota, calavera en el baston, ojos huecos ----- */
  HEROES.nigromante = function (ctx, S) {
    var t = S.t, C = S.C, p = S.p;
    var br = sin(t * (S.lowHp ? 6.2 : 1.7)) * 1.3;
    var pu = 0.5 + 0.5 * sin(t * 2.6);
    shadow(ctx, 26, 45);
    if (S.dashing) fxDash(ctx, S);
    ctx.save();
    ctx.translate(-22, 6);
    ctx.rotate(0.08 + S.atk * -0.4);
    line(ctx, 0, 38, 0, -18, C("#3a2a18"), 5);
    glow(ctx, 0, -28, 16 + pu * 8, C(p.accent), 0.55);
    P(ctx); ell(ctx, 0, -28, 9, 11);
    sh(ctx, S, C("#efe6c8"), 2.4);
    P(ctx); ell(ctx, -3, -31, 2.2, 2.6); fl(ctx, "#151018");
    P(ctx); ell(ctx, 3.2, -31, 2.2, 2.6); fl(ctx, "#151018");
    P(ctx); ell(ctx, 0, -24, 3.4, 2); fl(ctx, "#151018");
    ctx.restore();
    P(ctx);
    ctx.moveTo(-16, -10 + br);
    ctx.quadraticCurveTo(-26, 16, -22, 44);
    ctx.lineTo(22, 44);
    ctx.quadraticCurveTo(24, 16, 16, -10 + br);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -8, 8, 5, 16, C(p.light), 0.28);
    for (var r = -2; r <= 2; r++) {
      P(ctx); cir(ctx, r * 8, 36, 2); fl(ctx, A(C(p.accent), 0.55 + pu * 0.3));
    }
    P(ctx); rrc(ctx, -18, 8 + br, 11, 22, 5); sh(ctx, S, C(p.dark), 2.4);
    P(ctx); rrc(ctx, 18, 8 + br, 11, 22, 5); sh(ctx, S, C(p.dark), 2.4);
    P(ctx);
    ctx.moveTo(-16, -8 + br);
    ctx.quadraticCurveTo(-17, -34 + br, 0, -38 + br);
    ctx.quadraticCurveTo(17, -34 + br, 16, -8 + br);
    ctx.quadraticCurveTo(0, -2 + br, -16, -8 + br);
    ctx.closePath();
    sh(ctx, S, C(p.dark), 3.2);
    P(ctx); ell(ctx, 0, -16 + br, 11, 10); fl(ctx, C("#1a1224"));
    eyesGlow(ctx, 0, -18 + br, 5, 2.6, C(p.accent));
    P(ctx); ell(ctx, 0, -10 + br, 6, 3.2); fl(ctx, C("#c9b48a"));
    fxSwing(ctx, S, S.atk, 36, C(p.accent));
  };

  /* ===========================================================================
     12. OBJETOS
     ======================================================================== */

  var ITEMS = {};

  // frasco generico
  function flask(ctx, S, w, h, liq, cork) {
    var p = S.p, C = S.C;
    // cuello
    P(ctx); rrc(ctx, 0, -h * 0.5 - 6, w * 0.32, 14, 2);
    sh(ctx, S, A("#cfe4f2", 0.9), 2.4);
    // cuerpo
    P(ctx);
    ctx.moveTo(-w * 0.34, -h * 0.5);
    ctx.bezierCurveTo(-w * 0.55, -h * 0.2, -w * 0.5, h * 0.5, 0, h * 0.5);
    ctx.bezierCurveTo(w * 0.5, h * 0.5, w * 0.55, -h * 0.2, w * 0.34, -h * 0.5);
    ctx.closePath();
    sh(ctx, S, A("#dceaf6", 0.55), 2.8);
    // liquido
    ctx.save();
    P(ctx);
    ctx.moveTo(-w * 0.34, -h * 0.5);
    ctx.bezierCurveTo(-w * 0.55, -h * 0.2, -w * 0.5, h * 0.5, 0, h * 0.5);
    ctx.bezierCurveTo(w * 0.5, h * 0.5, w * 0.55, -h * 0.2, w * 0.34, -h * 0.5);
    ctx.closePath();
    ctx.clip();
    var lv = -h * 0.16 + sin(S.t * 2.2) * 1.6;
    P(ctx);
    ctx.moveTo(-w * 0.6, lv);
    ctx.quadraticCurveTo(0, lv - 3, w * 0.6, lv);
    ctx.lineTo(w * 0.6, h * 0.6); ctx.lineTo(-w * 0.6, h * 0.6);
    ctx.closePath();
    fl(ctx, C(liq));
    hi(ctx, -w * 0.2, h * 0.2, w * 0.2, h * 0.12, C(p.light), 0.5);
    // burbujas
    for (var i = 0; i < 3; i++) {
      var ph = (S.t * 0.6 + nz(i * 4.2)) % 1;
      P(ctx); cir(ctx, -w * 0.2 + nz(i) * w * 0.4, h * 0.5 - ph * h * 0.6, 1.8);
      fl(ctx, A("#ffffff", 0.5 * (1 - ph)));
    }
    ctx.restore();
    // brillo del cristal
    hi(ctx, -w * 0.28, -h * 0.05, w * 0.08, h * 0.25, "#ffffff", 0.6, -0.12);
    // corcho
    P(ctx); rrc(ctx, 0, -h * 0.5 - 13, w * 0.42, 10, 2.4);
    sh(ctx, S, C(cork || "#a8763c"), 2.4);
  }

  ITEMS.potion = function (ctx, S) {
    shadow(ctx, 18, 40, 0.3);
    ctx.save(); ctx.translate(0, 6);
    flask(ctx, S, 42, 44, S.p.main, "#a8763c");
    ctx.restore();
    glow(ctx, 0, 6, 26, S.C(S.p.main), 0.22);
    // destello
    var k = 0.5 + 0.5 * sin(S.t * 3);
    spark(ctx, -14, -18, 6 + k * 3, S.C(S.p.accent));
  };

  ITEMS.potionBig = function (ctx, S) {
    shadow(ctx, 22, 42, 0.32);
    ctx.save(); ctx.translate(0, 4);
    flask(ctx, S, 56, 56, S.p.main, "#8a5a28");
    // banda dorada
    P(ctx); rrc(ctx, 0, -16, 26, 6, 2); sh(ctx, S, S.C(S.p.accent), 2.2);
    ctx.restore();
    glow(ctx, 0, 6, 34, S.C(S.p.main), 0.3);
    var k = 0.5 + 0.5 * sin(S.t * 3);
    spark(ctx, -18, -22, 8 + k * 4, S.C(S.p.accent));
    spark(ctx, 18, 4, 5 + (1 - k) * 3, "#ffffff");
  };

  // estrella de 4 puntas
  function spark(ctx, x, y, r, c) {
    ctx.save();
    ctx.globalAlpha *= 0.95;
    P(ctx);
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
    ctx.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
    ctx.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
    ctx.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
    ctx.closePath();
    fl(ctx, c || "#ffffff");
    ctx.restore();
  }

  ITEMS.gold = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    shadow(ctx, 26, 40, 0.32);
    glow(ctx, 0, 16, 30, C(p.main), 0.28);
    // monedas sueltas
    P(ctx); ell(ctx, -22, 32, 10, 5); sh(ctx, S, C(p.main), 2.2);
    P(ctx); ell(ctx, 24, 34, 9, 4.5); sh(ctx, S, C(p.main), 2.2);
    // pila
    for (var i = 0; i < 5; i++) {
      var y = 30 - i * 8, w = 20 - i * 1.6;
      P(ctx); ell(ctx, (i % 2 ? 1.5 : -1.5), y, w, w * 0.42);
      sh(ctx, S, C(i % 2 ? p.main : lite(p.main, 0.12)), 2.2);
      hi(ctx, (i % 2 ? 1.5 : -1.5) - w * 0.3, y - w * 0.14, w * 0.35, w * 0.12, C(p.light), 0.6);
    }
    // moneda frontal con marca
    P(ctx); cir(ctx, 8, 4, 13); sh(ctx, S, C(p.main), 2.6);
    P(ctx); cir(ctx, 8, 4, 8); st(ctx, A(C(p.dark), 0.6), 2);
    hi(ctx, 3, -2, 5, 3.4, C(p.light), 0.7, -0.4);
    var k = (t * 0.7) % 1;
    spark(ctx, -10, -12, 7 + sin(t * 4) * 3, "#ffffff");
    spark(ctx, 20, -6, 4 + (1 - k) * 3, C(p.light));
  };

  ITEMS.gem = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    var bob = sin(t * 2) * 2.5;
    shadow(ctx, 18, 42, 0.28);
    glow(ctx, 0, bob, 32, C(p.main), 0.4);
    ctx.save();
    ctx.translate(0, bob);
    // faceta principal
    P(ctx); poly(ctx, [0, -30, 22, -10, 12, 26, -12, 26, -22, -10]);
    sh(ctx, S, C(p.main), 3);
    // facetas internas
    P(ctx); poly(ctx, [0, -30, 8, -8, -8, -8]); fl(ctx, A(C(p.light), 0.85));
    P(ctx); poly(ctx, [8, -8, 22, -10, 12, 26]); fl(ctx, A(C(p.dark), 0.35));
    P(ctx); poly(ctx, [-8, -8, -22, -10, -12, 26]); fl(ctx, A(C(p.light), 0.35));
    P(ctx); poly(ctx, [-8, -8, 8, -8, 12, 26, -12, 26]); fl(ctx, A(C(p.main), 0.6));
    line(ctx, -8, -8, 8, -8, A(C(p.dark), 0.5), 1.8);
    hi(ctx, -12, -14, 4, 7, "#ffffff", 0.75, 0.5);
    ctx.restore();
    spark(ctx, 18, -22 + bob, 6 + sin(t * 5) * 2.5, "#ffffff");
  };

  // caja del cofre
  function chestBase(ctx, S) {
    var C = S.C, p = S.p;
    P(ctx); rrc(ctx, 0, 24, 58, 30, 4);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -18, 16, 10, 6, C(p.light), 0.4);
    // tablones
    line(ctx, -10, 11, -10, 38, A(C(p.dark), 0.45), 2);
    line(ctx, 10, 11, 10, 38, A(C(p.dark), 0.45), 2);
    // herrajes
    P(ctx); rrc(ctx, -22, 24, 7, 30, 2); fl(ctx, C("#4d4657"));
    P(ctx); rrc(ctx, 22, 24, 7, 30, 2); fl(ctx, C("#4d4657"));
    P(ctx); rrc(ctx, 0, 38, 58, 7, 2); fl(ctx, A(C(p.dark), 0.7));
  }

  ITEMS.chest = function (ctx, S) {
    var C = S.C, p = S.p;
    shadow(ctx, 32, 45, 0.35);
    chestBase(ctx, S);
    // tapa abombada
    P(ctx);
    ctx.moveTo(-29, 9);
    ctx.quadraticCurveTo(-29, -18, 0, -18);
    ctx.quadraticCurveTo(29, -18, 29, 9);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -13, -10, 10, 5, C(p.light), 0.45, -0.25);
    line(ctx, -20, 4, -20, -13, A(C("#4d4657"), 0.95), 5.5);
    line(ctx, 20, 4, 20, -13, A(C("#4d4657"), 0.95), 5.5);
    // cerradura
    P(ctx); rrc(ctx, 0, 10, 16, 18, 3); sh(ctx, S, C(p.accent), 2.6);
    hi(ctx, -3, 5, 4, 3, "#fff3c0", 0.7);
    P(ctx); cir(ctx, 0, 9, 3.4); fl(ctx, "#2a1c08");
    P(ctx); rrc(ctx, 0, 15, 3, 7, 1.4); fl(ctx, "#2a1c08");
  };

  ITEMS.chestOpen = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    shadow(ctx, 32, 45, 0.35);
    // tapa volcada atras
    ctx.save();
    ctx.translate(0, 8);
    ctx.rotate(-0.95);
    P(ctx);
    ctx.moveTo(-27, 2);
    ctx.quadraticCurveTo(-27, -20, 0, -20);
    ctx.quadraticCurveTo(27, -20, 27, 2);
    ctx.closePath();
    sh(ctx, S, C(p.dark), 3);
    ctx.restore();
    chestBase(ctx, S);
    // interior + luz
    P(ctx); rrc(ctx, 0, 11, 48, 12, 3); fl(ctx, "#150c06");
    glow(ctx, 0, 6, 34, C(p.accent), 0.65);
    // monedas asomando
    for (var i = -2; i <= 2; i++) {
      P(ctx); ell(ctx, i * 11, 6 - abs(i) * 1.5, 8, 4);
      sh(ctx, S, C(p.accent), 2);
      hi(ctx, i * 11 - 2, 5 - abs(i) * 1.5, 3, 1.4, "#fff6cf", 0.7);
    }
    spark(ctx, 0, -8, 9 + sin(t * 4) * 3, "#fff6cf");
    spark(ctx, -20, -2, 5 + sin(t * 3 + 1) * 2, "#ffffff");
  };

  ITEMS.heart = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    var beat = Math.pow(0.5 + 0.5 * sin(t * 3.4), 3);
    var k = 1 + beat * 0.13;
    shadow(ctx, 20, 42, 0.28);
    glow(ctx, 0, 0, 30 + beat * 8, C(p.main), 0.3 + beat * 0.2);
    ctx.save();
    ctx.scale(k, k);
    P(ctx);
    ctx.moveTo(0, 30);
    ctx.bezierCurveTo(-30, 8, -32, -18, -15, -24);
    ctx.bezierCurveTo(-5, -28, 0, -18, 0, -13);
    ctx.bezierCurveTo(0, -18, 5, -28, 15, -24);
    ctx.bezierCurveTo(32, -18, 30, 8, 0, 30);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -11, -11, 7, 5, C(p.light), 0.7, -0.4);
    hi(ctx, 12, -8, 3.4, 5, C(p.light), 0.4, 0.3);
    ctx.restore();
    spark(ctx, -14, -18, 5 + beat * 4, "#ffffff");
  };

  ITEMS.sword = function (ctx, S) {
    var C = S.C, p = S.p;
    shadow(ctx, 22, 44, 0.28);
    ctx.save();
    ctx.translate(-4, 10);
    ctx.rotate(-0.5);
    // pomo + empuñadura
    P(ctx); cir(ctx, 0, 10, 4.4); sh(ctx, S, C(p.accent), 2.2);
    P(ctx); rrc(ctx, 0, 1, 6, 16, 2.4); sh(ctx, S, C("#5c3f1e"), 2.4);
    P(ctx); rrc(ctx, 0, -8, 30, 5, 2.4); sh(ctx, S, C(p.accent), 2.4);
    hi(ctx, -8, -9, 7, 1.4, "#fff3c0", 0.7);
    blade(ctx, S, 52, 16, C(p.main));
    ctx.restore();
    spark(ctx, 16, -22, 6, "#ffffff");
  };

  ITEMS.shield = function (ctx, S) {
    var C = S.C, p = S.p;
    shadow(ctx, 26, 44, 0.3);
    ctx.save();
    ctx.translate(0, 2);
    P(ctx);
    ctx.moveTo(-26, -30); ctx.lineTo(26, -30);
    ctx.quadraticCurveTo(30, 6, 0, 34);
    ctx.quadraticCurveTo(-30, 6, -26, -30);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -14, -20, 7, 11, C(p.light), 0.45, 0.15);
    // borde
    P(ctx);
    ctx.moveTo(-21, -25); ctx.lineTo(21, -25);
    ctx.quadraticCurveTo(24, 4, 0, 27);
    ctx.quadraticCurveTo(-24, 4, -21, -25);
    ctx.closePath();
    st(ctx, A(C(p.light), 0.8), 2.2);
    // cruz
    line(ctx, 0, -22, 0, 24, C(p.accent), 7);
    line(ctx, -17, -6, 17, -6, C(p.accent), 7);
    P(ctx); cir(ctx, 0, -6, 6.5); sh(ctx, S, C(p.light), 2.4);
    for (var i = 0; i < 3; i++) { P(ctx); cir(ctx, -17 + i * 17, -26, 2.2); fl(ctx, A(C(p.dark), 0.85)); }
    ctx.restore();
  };

  ITEMS.scroll = function (ctx, S) {
    var C = S.C, p = S.p;
    shadow(ctx, 24, 44, 0.3);
    ctx.save();
    ctx.translate(0, 2);
    // hoja
    P(ctx); rrc(ctx, 0, 0, 40, 48, 3);
    sh(ctx, S, C(p.main), 3);
    hi(ctx, -12, -12, 6, 14, C(p.light), 0.5);
    // texto
    for (var i = 0; i < 5; i++) {
      line(ctx, -13, -16 + i * 8, 13 - (i % 2) * 8, -16 + i * 8, A(C(p.dark), 0.55), 2);
    }
    // rodillos
    P(ctx); rrc(ctx, 0, -25, 48, 10, 5); sh(ctx, S, C(p.light), 2.6);
    P(ctx); rrc(ctx, 0, 25, 48, 10, 5); sh(ctx, S, C(p.light), 2.6);
    hi(ctx, -12, -26, 12, 2, "#ffffff", 0.6);
    // sello de cera
    P(ctx); cir(ctx, 13, 12, 9); sh(ctx, S, C(p.accent), 2.4);
    P(ctx); cir(ctx, 13, 12, 4.6); st(ctx, A("#ffffff", 0.5), 1.8);
    P(ctx); tri(ctx, 8, 20, 18, 20, 13, 30); fl(ctx, A(C(p.accent), 0.85));
    ctx.restore();
  };

  ITEMS.key = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    var bob = sin(t * 2.2) * 2;
    shadow(ctx, 18, 43, 0.26);
    glow(ctx, 0, bob, 26, C(p.main), 0.3);
    ctx.save();
    ctx.translate(0, bob);
    ctx.rotate(-0.55);
    // anilla
    P(ctx); cir(ctx, 0, -20, 13); sh(ctx, S, C(p.main), 4.4);
    P(ctx); cir(ctx, 0, -20, 6.4); fl(ctx, "#08070c");
    // vastago
    P(ctx); rrc(ctx, 0, 6, 8, 40, 3); sh(ctx, S, C(p.main), 2.6);
    hi(ctx, -2, 0, 1.6, 14, C(p.light), 0.7);
    // dientes
    P(ctx); rrc(ctx, 9, 18, 14, 7, 2); sh(ctx, S, C(p.main), 2.2);
    P(ctx); rrc(ctx, 7, 28, 10, 7, 2); sh(ctx, S, C(p.main), 2.2);
    ctx.restore();
    spark(ctx, 14, -18 + bob, 6 + sin(t * 4.5) * 2.5, "#ffffff");
  };

  ITEMS.bomb = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    shadow(ctx, 26, 45, 0.34);
    // cuerpo
    P(ctx); cir(ctx, 0, 12, 27);
    sh(ctx, S, C(p.main), 3.4);
    hi(ctx, -10, 2, 10, 7, C(p.light), 0.5, -0.4);
    P(ctx); cir(ctx, -9, 3, 3.4); fl(ctx, A("#ffffff", 0.75));
    // cuello
    P(ctx); rrc(ctx, 4, -13, 13, 10, 3); sh(ctx, S, C("#6b6478"), 2.6);
    // mecha
    P(ctx);
    ctx.moveTo(5, -18);
    ctx.quadraticCurveTo(18, -26, 15, -35);
    st(ctx, C("#8a7a55"), 3.2);
    var sp = 4 + sin(t * 18) * 1.6;
    glow(ctx, 15, -37, 15 + sp, C(p.accent), 0.85);
    P(ctx); cir(ctx, 15, -37, sp); fl(ctx, "#fff6c8");
    for (var k = 0; k < 4; k++) {
      var a = t * 8 + k * 1.6;
      P(ctx); cir(ctx, 15 + cos(a) * 11, -37 + sin(a) * 8, 1.6);
      fl(ctx, A("#ffcf5c", 0.9));
    }
  };

  ITEMS.relic = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    var bob = sin(t * 1.6) * 3.4;
    var ry = 8 + sin(t * 1.1) * 7; // el anillo gira
    shadow(ctx, 16, 45, 0.22);
    glow(ctx, 0, bob, 40, C(p.main), 0.45);
    // anillo detras
    ctx.save();
    P(ctx); ctx.ellipse(0, bob, 30, abs(ry) + 2, 0.25, PI, TAU);
    st(ctx, C(p.accent), 3.6);
    ctx.restore();
    // orbe
    ctx.save();
    ctx.translate(0, bob);
    ctx.fillStyle = rad(ctx, 21, [[0, "#ffffff"], [0.35, C(p.light)], [0.8, C(p.main)], [1, C(p.dark)]]);
    P(ctx); cir(ctx, 0, 0, 21); ctx.fill();
    st(ctx, A(C(p.dark), 0.7), 2.4);
    ctx.restore();
    hi(ctx, -7, -8 + bob, 5.5, 4, "#ffffff", 0.8, -0.4);
    // anillo delante
    ctx.save();
    P(ctx); ctx.ellipse(0, bob, 30, abs(ry) + 2, 0.25, 0, PI);
    st(ctx, C(p.accent), 3.6);
    ctx.restore();
    // chispas orbitando
    for (var k = 0; k < 3; k++) {
      var a = t * 1.7 + k * TAU / 3;
      P(ctx); cir(ctx, cos(a) * 30, bob + sin(a) * (abs(ry) + 2), 2.4);
      fl(ctx, A("#fff6cf", 0.9));
    }
  };

  ITEMS.stairs = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    // marco de piedra
    P(ctx); rrc(ctx, 0, 6, 88, 80, 5);
    sh(ctx, S, C(p.dark), 3);
    // escalones que descienden hacia el fondo
    for (var i = 0; i < 5; i++) {
      var w = 84 - i * 14, y = 40 - i * 15;
      P(ctx); rrc(ctx, 0, y, w, 13, 2);
      fl(ctx, C(mix(p.main, p.dark, i * 0.18)));
      st(ctx, A(C(p.dark), 0.9), 2.2);
      // canto iluminado
      line(ctx, -w / 2 + 3, y - 6, w / 2 - 3, y - 6, A(C(p.light), 0.55 - i * 0.08), 2);
    }
    // hueco negro al fondo
    P(ctx); rrc(ctx, 0, -28, 22, 16, 3); fl(ctx, "#04040a");
    // flecha de bajada
    ctx.save();
    var pu = 0.5 + 0.5 * sin(t * 2.6);
    ctx.globalAlpha *= 0.55 + pu * 0.45;
    for (var c = 0; c < 2; c++) {
      P(ctx);
      ctx.moveTo(-11, -6 + c * 11); ctx.lineTo(0, 3 + c * 11); ctx.lineTo(11, -6 + c * 11);
      st(ctx, C(p.accent), 4);
    }
    ctx.restore();
  };

  ITEMS.altar = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    var pu = 0.5 + 0.5 * sin(t * 2.2);
    shadow(ctx, 32, 46, 0.36);
    // base
    P(ctx); poly(ctx, [-30, 44, 30, 44, 24, 26, -24, 26]);
    sh(ctx, S, C(p.dark), 3);
    // columna
    P(ctx); rrc(ctx, 0, 14, 34, 28, 3);
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -10, 6, 6, 9, C(p.light), 0.4);
    line(ctx, -14, 4, -14, 26, A(C(p.dark), 0.5), 2);
    // tapa
    P(ctx); rrc(ctx, 0, -4, 48, 12, 3);
    sh(ctx, S, C(p.light), 3);
    hi(ctx, -14, -7, 10, 2.4, "#ffffff", 0.35);
    // runa flotante
    glow(ctx, 0, -24, 26 + pu * 8, C(p.accent), 0.5 + pu * 0.3);
    ctx.save();
    ctx.globalAlpha *= 0.7 + pu * 0.3;
    P(ctx);
    ctx.moveTo(0, -38); ctx.lineTo(0, -14);
    ctx.moveTo(-10, -30); ctx.lineTo(10, -22);
    ctx.moveTo(10, -30); ctx.lineTo(-10, -22);
    st(ctx, lite(C(p.accent), 0.3), 3.6);
    P(ctx); cir(ctx, 0, -26, 13); st(ctx, A(C(p.accent), 0.7), 2.4);
    ctx.restore();
    // velas a los lados
    for (var s = -1; s <= 1; s += 2) {
      P(ctx); rrc(ctx, s * 18, -12, 5, 8, 2); fl(ctx, "#efe6cf");
      flame(ctx, s * 18, -16, 7, 12, t + s, 8);
    }
  };

  ITEMS.forge = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    shadow(ctx, 32, 46, 0.36);
    // tocon
    P(ctx); rrc(ctx, 0, 34, 34, 20, 3); sh(ctx, S, C("#5e4426"), 2.8);
    // yunque: cuello estrecho entre mesa y base
    P(ctx); rrc(ctx, 0, 16, 16, 16, 2); sh(ctx, S, C(p.dark), 2.6);
    P(ctx); rrc(ctx, 0, 25, 42, 9, 2); sh(ctx, S, C(p.main), 2.8);
    P(ctx);
    ctx.moveTo(-24, 2);
    ctx.lineTo(18, 2);
    ctx.quadraticCurveTo(36, 5, 18, 11);   // cuerno
    ctx.lineTo(-22, 11);
    ctx.quadraticCurveTo(-28, 8, -24, 2);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -12, 3, 10, 2.2, C(p.light), 0.55);
    // martillo apoyado
    ctx.save();
    ctx.translate(-22, -4);
    ctx.rotate(-0.5);
    line(ctx, 0, 26, 0, -8, C("#6b4a24"), 5);
    P(ctx); rrc(ctx, 0, -14, 20, 12, 3); sh(ctx, S, C(p.light), 2.6);
    ctx.restore();
    // chispas
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < 7; i++) {
      var ph = (t * 1.3 + nz(i * 3.3)) % 1;
      var x = 4 + (nz(i) - 0.5) * 34 * ph;
      var y = 0 - ph * 30 + ph * ph * 22;
      P(ctx); cir(ctx, x, y, 2.4 * (1 - ph) + 0.6);
      fl(ctx, A(i % 2 ? "#ffd06a" : C(p.accent), 0.95 * (1 - ph)));
    }
    ctx.restore();
    glow(ctx, 4, 2, 24, C(p.accent), 0.35);
  };

  ITEMS.skull = function (ctx, S) {
    var C = S.C, p = S.p;
    shadow(ctx, 22, 44, 0.3);
    ctx.save();
    ctx.translate(0, 2);
    // craneo
    P(ctx);
    ctx.moveTo(-24, 4);
    ctx.quadraticCurveTo(-26, -28, 0, -30);
    ctx.quadraticCurveTo(26, -28, 24, 4);
    ctx.quadraticCurveTo(18, 14, 10, 14);
    ctx.lineTo(-10, 14);
    ctx.quadraticCurveTo(-18, 14, -24, 4);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -10, -18, 8, 5, C(p.light), 0.6, -0.3);
    // cuencas
    for (var e = -1; e <= 1; e += 2) {
      P(ctx); ell(ctx, e * 10, -8, 7.4, 8); fl(ctx, "#08080e");
      P(ctx); cir(ctx, e * 10 - 1.5, -10, 1.8); fl(ctx, A(C(p.accent), 0.5));
    }
    // nariz
    P(ctx); tri(ctx, -3.4, 5, 3.4, 5, 0, -2); fl(ctx, "#08080e");
    // mandibula
    P(ctx); rrc(ctx, 0, 20, 28, 12, 4); sh(ctx, S, C(p.main), 2.6);
    for (var d = -3; d <= 3; d++) line(ctx, d * 4.6, 15, d * 4.6, 25, A(C(p.dark), 0.7), 1.6);
    line(ctx, -14, 15, 14, 15, A(C(p.dark), 0.5), 2);
    // grieta
    P(ctx);
    ctx.moveTo(8, -28); ctx.lineTo(12, -20); ctx.lineTo(7, -16);
    st(ctx, A(C(p.dark), 0.8), 2);
    ctx.restore();
  };

  ITEMS.torch = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    glow(ctx, 0, -18, 40 + sin(t * 6) * 5, "#ffa02e", 0.4);
    // mango
    P(ctx); rrc(ctx, 0, 22, 12, 46, 4);
    sh(ctx, S, C(p.main), 3);
    hi(ctx, -3, 20, 2, 16, C(p.light), 0.5);
    // abrazadera
    P(ctx); rrc(ctx, 0, -2, 20, 10, 3); sh(ctx, S, C("#4d4657"), 2.6);
    // cazoleta / trapos
    P(ctx); rrc(ctx, 0, -10, 24, 14, 5); sh(ctx, S, C(p.dark), 2.8);
    // llama
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    flame(ctx, 0, -16, 26, 40, t, 7);
    ctx.restore();
    // pavesas
    for (var i = 0; i < 4; i++) {
      var ph = (t * 0.8 + nz(i * 2.7)) % 1;
      P(ctx); cir(ctx, (nz(i) - 0.5) * 20 + sin(t * 3 + i) * 3, -34 - ph * 16, 1.8 * (1 - ph) + 0.5);
      fl(ctx, A("#ffcf5c", 0.9 * (1 - ph)));
    }
  };

  ITEMS.spikes = function (ctx, S) {
    var C = S.C, p = S.p;
    shadow(ctx, 34, 46, 0.3);
    // placa base
    P(ctx); rrc(ctx, 0, 36, 82, 14, 3);
    sh(ctx, S, C(p.dark), 2.8);
    for (var b = -1; b <= 1; b += 2) {
      P(ctx); cir(ctx, b * 33, 36, 2.6); fl(ctx, A(C(p.main), 0.8));
    }
    // pinchos
    var xs = [-30, -15, 0, 15, 30], hs = [24, 38, 46, 36, 22];
    for (var i = 0; i < xs.length; i++) {
      P(ctx);
      ctx.moveTo(xs[i] - 8, 30);
      ctx.lineTo(xs[i], 30 - hs[i]);
      ctx.lineTo(xs[i] + 8, 30);
      ctx.closePath();
      sh(ctx, S, C(p.main), 2.6);
      // filo iluminado
      P(ctx);
      ctx.moveTo(xs[i] - 2.6, 28);
      ctx.lineTo(xs[i], 30 - hs[i]);
      ctx.lineTo(xs[i] + 1.4, 28);
      ctx.closePath();
      fl(ctx, A(C(p.light), 0.85));
      // mancha de sangre
      if (i % 2 === 0) {
        P(ctx); cir(ctx, xs[i] + 2, 30 - hs[i] * 0.72, 2.4); fl(ctx, A(C(p.accent), 0.8));
      }
    }
  };

  ITEMS.web = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    var cxp = -4, cyp = -6;
    ctx.save();
    ctx.globalAlpha *= 0.85;
    // radios
    for (var i = 0; i < 8; i++) {
      var a = i * TAU / 8 - 0.2;
      P(ctx);
      ctx.moveTo(cxp, cyp);
      ctx.lineTo(cxp + cos(a) * 48, cyp + sin(a) * 48);
      st(ctx, A(C(p.main), 0.75), 1.8);
    }
    // arcos concentricos con comba
    for (var r = 1; r <= 4; r++) {
      var rr = r * 11.5;
      P(ctx);
      for (var j = 0; j <= 8; j++) {
        var a1 = (j - 1) * TAU / 8 - 0.2, a2 = j * TAU / 8 - 0.2;
        var mx = cxp + cos((a1 + a2) / 2) * rr * 0.82, my = cyp + sin((a1 + a2) / 2) * rr * 0.82;
        if (j === 0) ctx.moveTo(cxp + cos(a2) * rr, cyp + sin(a2) * rr);
        else ctx.quadraticCurveTo(mx, my, cxp + cos(a2) * rr, cyp + sin(a2) * rr);
      }
      st(ctx, A(C(p.light), 0.55), 1.6);
    }
    // gotas de rocio
    for (var d = 0; d < 4; d++) {
      var ang = d * 1.7 + 0.4, rr2 = 16 + nz(d) * 26;
      P(ctx); cir(ctx, cxp + cos(ang) * rr2, cyp + sin(ang) * rr2, 2 + sin(t * 2 + d) * 0.4);
      fl(ctx, A("#ffffff", 0.7));
    }
    ctx.restore();
  };

  ITEMS.rune = function (ctx, S) {
    var C = S.C, p = S.p, t = S.t;
    var pu = 0.5 + 0.5 * sin(t * 2.4);
    shadow(ctx, 24, 45, 0.3);
    // losa
    P(ctx);
    ctx.moveTo(0, -36); ctx.lineTo(28, -14); ctx.lineTo(22, 26);
    ctx.lineTo(-22, 26); ctx.lineTo(-28, -14);
    ctx.closePath();
    sh(ctx, S, C(p.main), 3.2);
    hi(ctx, -12, -16, 7, 9, C(p.light), 0.4, 0.2);
    // borde tallado
    P(ctx);
    ctx.moveTo(0, -29); ctx.lineTo(21, -11); ctx.lineTo(16, 19);
    ctx.lineTo(-16, 19); ctx.lineTo(-21, -11);
    ctx.closePath();
    st(ctx, A(C(p.dark), 0.8), 2.2);
    // glifo brillante
    glow(ctx, 0, -2, 24 + pu * 7, C(p.accent), 0.4 + pu * 0.3);
    ctx.save();
    ctx.globalAlpha *= 0.75 + pu * 0.25;
    P(ctx);
    ctx.moveTo(-9, -16); ctx.lineTo(9, -16);
    ctx.moveTo(0, -16); ctx.lineTo(0, 14);
    ctx.moveTo(-10, 2); ctx.lineTo(0, -6);
    ctx.moveTo(10, 2); ctx.lineTo(0, -6);
    ctx.moveTo(-7, 14); ctx.lineTo(7, 14);
    st(ctx, lite(C(p.accent), 0.35), 3.6);
    ctx.restore();
  };

  /* ===========================================================================
     13. PIPELINE DE RENDER
     ======================================================================== */

  var FLOATERS = { bat: 1, wraith: 1, eye: 1, boss_devourer: 1, relic: 1, gem: 1, key: 1 };

  // fallback visible: nadie deberia ver esto, pero es mejor que un hueco
  function drawUnknown(ctx, S) {
    P(ctx); rrc(ctx, 0, 0, 62, 62, 8);
    sh(ctx, S, S.C(S.p.main), 3.4);
    P(ctx);
    ctx.moveTo(-10, -16); ctx.quadraticCurveTo(12, -24, 10, -6);
    ctx.quadraticCurveTo(8, 2, 0, 8);
    st(ctx, "#ffffff", 6);
    P(ctx); cir(ctx, 0, 22, 4.4); fl(ctx, "#ffffff");
  }

  function render(ctx, table, kind, cx, cy, size, opts, isHero) {
    ctx.save();
    try {
      var o = opts || EMPTY;
      var alpha = o.alpha === undefined ? 1 : o.alpha;
      if (!(size > 0) || alpha <= 0.004) return;

      var fn = table[kind];
      var elite = !!o.elite;
      var sc = (o.scale === undefined ? 1 : o.scale) * (elite ? 1.1 : 1);
      var squash = o.squash === undefined ? 1 : o.squash;
      if (!(sc > 0)) return;

      var unit = size / 100 * sc;
      _k = 1 / unit;

      var p = pal(kind);
      var S = {
        t: (o.t === undefined ? 0 : o.t) + phase(kind),
        o: o,
        p: fn ? p : FALLBACK_PAL,
        C: buildTinter(o),
        f: o.facing === -1 ? -1 : 1,
        size: size,
        look: 0.55,
        atk: isHero ? min(1, max(0, o.attacking || 0)) : 0,
        dashing: isHero ? !!o.dashing : false,
        lowHp: isHero ? !!o.lowHp : false,
        dead: !!o.dead,
        ink: "#000000"
      };
      // contorno: mas duro en el heroe para que lea como protagonista
      S.ink = dark(S.C(S.p.dark), isHero ? 0.66 : 0.5);

      ctx.globalAlpha *= alpha * (o.dead ? 0.6 : 1);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.translate(cx, cy);
      ctx.scale(unit, unit * squash);

      // muerto: se desploma y se aplasta (no rota fuera de la casilla)
      if (o.dead) {
        ctx.translate(0, 20);
        ctx.scale(0.94, 0.5);
        ctx.rotate(0.22 * S.f);
      }

      if (elite) fxElite(ctx, S);
      if (o.charging) fxCharge(ctx, S);
      if (o.enraged) fxEnraged(ctx, S);
      // el heroe lleva un halo frio por detras: lo separa del fondo casi negro
      if (isHero && !o.dead) glow(ctx, 0, 8, 48, S.lowHp ? "#ff6a5a" : "#b9d2ff", 0.2);

      // el facing solo espeja el cuerpo, no las auras
      ctx.save();
      ctx.scale(S.f, 1);
      (fn || drawUnknown)(ctx, S);
      ctx.restore();

      if (o.frozen) fxFrost(ctx, S);
      if (o.poisoned) fxPoison(ctx, S);
      if (o.burning) fxBurn(ctx, S);
      if (o.shielded) fxShield(ctx, S, 1);
      if (isHero && o.shield > 0) fxShield(ctx, S, min(1, o.shield));
    } finally {
      ctx.restore();
    }
  }

  /* ===========================================================================
     14. API
     ======================================================================== */

  function drawCreature(ctx, kind, cx, cy, size, opts) {
    render(ctx, CREATURES, kind, cx, cy, size, opts, false);
  }
  function drawHero(ctx, classId, cx, cy, size, opts) {
    render(ctx, HEROES, classId, cx, cy, size, opts, true);
  }
  function drawItem(ctx, kind, cx, cy, size, opts) {
    render(ctx, ITEMS, kind, cx, cy, size, opts, false);
  }

  // copia estable por clave: sin asignaciones en el bucle caliente
  var _palOut = {};
  function paletteOf(kind) {
    var v = _palOut[kind];
    if (v) return v;
    var p = pal(kind);
    v = { main: p.main, dark: p.dark, light: p.light, accent: p.accent };
    _palOut[kind] = v;
    return v;
  }

  function hasKind(kind) {
    return !!(CREATURES[kind] || HEROES[kind] || ITEMS[kind]);
  }

  function listOf(tbl) { var a = [], k; for (k in tbl) if (tbl.hasOwnProperty(k)) a.push(k); return a; }

  return {
    drawCreature: drawCreature,
    drawHero: drawHero,
    drawItem: drawItem,
    palette: paletteOf,
    hasKind: hasKind,
    // extras utiles para el motor y el banco de pruebas
    creatures: listOf(CREATURES),
    heroes: listOf(HEROES),
    items: listOf(ITEMS),
    isFloater: function (k) { return !!FLOATERS[k]; }
  };
})();
