/* ════════════════════════════════════════════════════════════════════
   75-render.js — dibujado del mundo.

   Decisiones que importan para que se vea bien:
   · Las paredes se dibujan con una "cara superior" más clara sólo
     cuando dan a suelo, lo que da relieve falso muy barato.
   · La luz viene del campo de visión (0..1 por casilla) y se pinta
     como oscuridad encima, no como aclarado: mantiene el negro negro.
   · Las posiciones de dibujo son amortiguadas, no la casilla real, así
     que un juego por turnos se mueve como si fuera continuo.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var Render = (function(){

  var MW = CFG.MW, MH = CFG.MH, TL = CFG.T;
  var cv = null, ctx = null, wrap = null;
  var cw = 0, ch = 0, dpr = 1;
  var tile = 24;
  var cam = { x:0, y:0, tx:0, ty:0 };
  var time = 0;
  var lastW = 0, lastH = 0;
  var aim = null;            // { kind:'dash', tiles:[...] }
  var pathPreview = null;

  function init(){
    cv = Util.el('cv');
    ctx = cv.getContext('2d', { alpha:false });
    wrap = Util.el('canvasWrap');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function(){ setTimeout(resize, 160); });
  }

  function resize(){
    if (!wrap) return;
    var r = wrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = Math.max(1, Math.floor(r.width));
    ch = Math.max(1, Math.floor(r.height));
    cv.width = Math.floor(cw * dpr);
    cv.height = Math.floor(ch * dpr);
    cv.style.width = cw + 'px';
    cv.style.height = ch + 'px';
    lastW = r.width; lastH = r.height;
    /* Casillas grandes en móvil: menos mapa visible pero se ve qué es
       cada cosa. Legibilidad por encima de información. */
    var minTiles = cw < 460 ? 15 : 19;
    tile = Math.max(18, Math.floor(Math.min(cw / minTiles, ch / (minTiles * 0.72))));
  }
  function resizeIfNeeded(){
    if (!wrap) return;
    var r = wrap.getBoundingClientRect();
    if (Math.abs(r.width - lastW) > 1 || Math.abs(r.height - lastH) > 1) resize();
  }

  /* ─────────── Cámara ─────────── */
  function viewTiles(){ return { w:cw / tile, h:ch / tile }; }
  function updateCamera(dt, snap){
    var p = Engine.player;
    if (!p) return;
    var v = viewTiles();
    var tx = p.rx != null ? p.rx : p.x;
    var ty = p.ry != null ? p.ry : p.y;
    cam.tx = Util.clamp(tx - v.w / 2 + 0.5, 0, Math.max(0, MW - v.w));
    cam.ty = Util.clamp(ty - v.h / 2 + 0.5, 0, Math.max(0, MH - v.h));
    if (MW < v.w) cam.tx = (MW - v.w) / 2;
    if (MH < v.h) cam.ty = (MH - v.h) / 2;
    if (snap){ cam.x = cam.tx; cam.y = cam.ty; }
    else {
      cam.x = Util.damp(cam.x, cam.tx, 13, dt);
      cam.y = Util.damp(cam.y, cam.ty, 13, dt);
    }
  }
  function sx(wx){ return (wx - cam.x) * tile; }
  function sy(wy){ return (wy - cam.y) * tile; }

  /** Convierte un punto de pantalla en casilla del mapa. */
  function tileFromScreen(clientX, clientY){
    var r = cv.getBoundingClientRect();
    var x = Math.floor((clientX - r.left) / tile + cam.x);
    var y = Math.floor((clientY - r.top) / tile + cam.y);
    return { x:x, y:y };
  }

  /* ─────────── Posiciones amortiguadas ─────────── */
  function smoothEntities(dt){
    var p = Engine.player;
    if (!p) return;
    if (p.rx == null){ p.rx = p.x; p.ry = p.y; }
    var rate = Meta.opt('reduceMotion') ? 60 : 20;
    p.rx = Util.damp(p.rx, p.x, rate, dt);
    p.ry = Util.damp(p.ry, p.y, rate, dt);
    if (p.attackAnim > 0) p.attackAnim = Math.max(0, p.attackAnim - dt * 5.5);
    if (p.dashing > 0) p.dashing = Math.max(0, p.dashing - dt);
    if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt * 2.4);

    var list = Engine.run.actors;
    for (var i = 0; i < list.length; i++){
      var a = list[i];
      if (a.rx == null){ a.rx = a.x; a.ry = a.y; }
      a.rx = Util.damp(a.rx, a.x, rate, dt);
      a.ry = Util.damp(a.ry, a.y, rate, dt);
      a.animT = (a.animT || 0) + dt;
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 4);
      if (a.hurtT > 0) a.hurtT = Math.max(0, a.hurtT - dt * 3.2);
      if (a.attackT > 0) a.attackT = Math.max(0, a.attackT - dt * 5);
      if (a.moveT > 0) a.moveT = Math.max(0, a.moveT - dt * 5);
    }
  }

  /* ─────────── Paleta accesible ─────────── */
  function pal(){
    var b = Engine.run.biome;
    if (!Meta.opt('colorblind')) return b;
    /* Variante de alto contraste azul/amarillo, segura para
       deuteranopía y protanopía, que son las mayoritarias. */
    return {
      wall:'#2b2f45', wallTop:'#485070', floor:'#101219', floorAlt:'#141722',
      fog:'#08090d', light:'#ffe9a8'
    };
  }

  /* ─────────── Mundo ─────────── */
  function drawTiles(){
    var st = Engine.run, P = pal();
    var tiles = st.tiles, vis = st.visible, seen = st.seen, light = st.light;
    var x0 = Math.max(0, Math.floor(cam.x) - 1), y0 = Math.max(0, Math.floor(cam.y) - 1);
    var x1 = Math.min(MW - 1, Math.ceil(cam.x + cw / tile) + 1);
    var y1 = Math.min(MH - 1, Math.ceil(cam.y + ch / tile) + 1);
    var hi = Meta.opt('highContrast');

    for (var y = y0; y <= y1; y++){
      for (var x = x0; x <= x1; x++){
        var i = y * MW + x;
        var v = vis[i], s = seen[i];
        if (!v && !s) continue;
        var px = sx(x), py = sy(y);
        var t = tiles[i];
        var lt = v ? Math.max(0.12, light[i]) : 0.0;

        if (t === TL.WALL || t === TL.TORCH){
          ctx.fillStyle = v ? P.wall : P.fog;
          ctx.fillRect(px, py, tile + 1, tile + 1);
          /* cara superior sólo si debajo hay algo caminable */
          var below = (y + 1 < MH) ? tiles[i + MW] : TL.WALL;
          if (!CFG.SOLID[below]){
            ctx.fillStyle = v ? P.wallTop : Util.mixHex(P.fog, P.wallTop, 0.25);
            ctx.fillRect(px, py + tile * 0.72, tile + 1, tile * 0.3);
          }
          if (t === TL.TORCH && v) drawTorch(px, py, x, y);
        } else {
          /* variación por casilla con un hash: rompe el patrón sin coste */
          var alt = ((x * 31 + y * 17) % 7) < 2;
          var base = alt ? P.floorAlt : P.floor;
          ctx.fillStyle = v ? base : P.fog;
          ctx.fillRect(px, py, tile + 1, tile + 1);
          if (v && lt > 0.05) drawTileDeco(t, px, py, x, y, lt);
        }

        /* oscuridad encima: mantiene el negro negro */
        if (v){
          var dark = Util.clamp(1 - lt, 0, 1) * (hi ? 0.5 : 0.82);
          if (dark > 0.02){
            ctx.fillStyle = 'rgba(2,2,6,' + dark.toFixed(3) + ')';
            ctx.fillRect(px, py, tile + 1, tile + 1);
          }
        } else {
          ctx.fillStyle = 'rgba(2,2,6,' + (hi ? 0.45 : 0.62) + ')';
          ctx.fillRect(px, py, tile + 1, tile + 1);
        }
      }
    }
  }

  function drawTileDeco(t, px, py, x, y, lt){
    var P = pal();
    switch (t){
      case TL.STAIRS:
        Sprites.drawItem(ctx, 'stairs', px + tile/2, py + tile/2, tile, { t:time });
        break;
      case TL.WATER: {
        ctx.fillStyle = 'rgba(60,130,190,0.42)';
        ctx.fillRect(px, py, tile + 1, tile + 1);
        var wob = Math.sin(time * 1.8 + x * 0.7 + y * 1.1) * 0.5 + 0.5;
        ctx.fillStyle = 'rgba(150,220,255,' + (0.06 + wob * 0.1).toFixed(3) + ')';
        ctx.fillRect(px, py + tile * 0.35, tile + 1, tile * 0.22);
        break;
      }
      case TL.LAVA: {
        var pulse = Math.sin(time * 2.4 + x * 1.3 + y * 0.9) * 0.5 + 0.5;
        ctx.fillStyle = 'rgb(' + Math.round(180 + pulse * 70) + ',' + Math.round(50 + pulse * 40) + ',20)';
        ctx.fillRect(px, py, tile + 1, tile + 1);
        ctx.fillStyle = 'rgba(255,220,140,' + (0.1 + pulse * 0.22).toFixed(3) + ')';
        ctx.fillRect(px + tile * 0.2, py + tile * 0.3, tile * 0.6, tile * 0.3);
        break;
      }
      case TL.CHASM: {
        ctx.fillStyle = '#000';
        ctx.fillRect(px, py, tile + 1, tile + 1);
        ctx.strokeStyle = 'rgba(80,60,120,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, tile - 1, tile - 1);
        break;
      }
      case TL.SPIKES:
        Sprites.drawItem(ctx, 'spikes', px + tile/2, py + tile/2, tile, { t:time });
        break;
      case TL.WEB:
        Sprites.drawItem(ctx, 'web', px + tile/2, py + tile/2, tile, { t:time });
        break;
      case TL.ALTAR:
        Sprites.drawItem(ctx, 'altar', px + tile/2, py + tile/2, tile, { t:time });
        break;
      case TL.RUBBLE:
        ctx.fillStyle = 'rgba(120,110,100,0.35)';
        ctx.beginPath();
        ctx.arc(px + tile * 0.42, py + tile * 0.6, tile * 0.16, 0, 6.28);
        ctx.arc(px + tile * 0.66, py + tile * 0.5, tile * 0.11, 0, 6.28);
        ctx.fill();
        break;
      case TL.GRASS: {
        ctx.strokeStyle = 'rgba(120,200,110,0.45)';
        ctx.lineWidth = Math.max(1, tile * 0.05);
        var sw = Math.sin(time * 1.3 + x) * tile * 0.06;
        for (var g = 0; g < 3; g++){
          var gx = px + tile * (0.25 + g * 0.25);
          ctx.beginPath();
          ctx.moveTo(gx, py + tile * 0.85);
          ctx.lineTo(gx + sw, py + tile * 0.45);
          ctx.stroke();
        }
        break;
      }
    }
  }

  function drawTorch(px, py, x, y){
    var f = Math.sin(time * 9 + x * 2.3 + y * 1.7) * 0.5 + 0.5;
    Sprites.drawItem(ctx, 'torch', px + tile/2, py + tile * 0.45, tile, { t:time });
    var g = ctx.createRadialGradient(px + tile/2, py + tile/2, 0, px + tile/2, py + tile/2, tile * (2.6 + f * 0.5));
    g.addColorStop(0, 'rgba(255,190,110,' + (0.16 + f * 0.07).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - tile * 3, py - tile * 3, tile * 7, tile * 7);
  }

  /* ─────────── Objetos ─────────── */
  function drawItems(){
    var st = Engine.run;
    for (var i = 0; i < st.items.length; i++){
      var it = st.items[i];
      if (!st.visible[it.y * MW + it.x]) continue;
      var bob = Math.sin(time * 2.6 + it.t) * tile * 0.07;
      Sprites.drawItem(ctx, it.kind, sx(it.x) + tile/2, sy(it.y) + tile/2 + bob, tile, { t:time + it.t });
    }
  }

  /* ─────────── Actores ─────────── */
  function statusOpts(a){
    return {
      t:a.animT || 0,
      facing:a.facing || 1,
      hurt:a.hurtT || 0,
      frozen:!!a.status.congelado,
      burning:!!a.status.quemado,
      poisoned:!!a.status.envenenado,
      charging:!!a.windup,
      enraged:!!a.enraged,
      elite:!!a.elite,
      alpha:a.kind === 'wraith' ? 0.82 : 1
    };
  }

  function drawActors(){
    var st = Engine.run;
    var list = st.actors.slice().sort(function(a, b){ return a.ry - b.ry; });
    for (var i = 0; i < list.length; i++){
      var a = list[i];
      if (a.hp <= 0) continue;
      if (!st.visible[a.y * MW + a.x]) continue;
      var px = sx(a.rx) + tile/2, py = sy(a.ry) + tile/2;
      if (px < -tile * 2 || py < -tile * 2 || px > cw + tile * 2 || py > ch + tile * 2) continue;

      /* sombra: ancla la criatura al suelo */
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(px, py + tile * 0.4, tile * 0.3, tile * 0.11, 0, 0, 6.28);
      ctx.fill();

      /* el mímico se disfraza de cofre */
      if (a.hidden){
        Sprites.drawItem(ctx, 'chest', px, py, tile, { t:time });
        continue;
      }

      var lunge = a.attackT > 0 ? a.attackT * tile * 0.35 : 0;
      var sizeMul = a.isBoss ? 1.55 : (a.elite ? 1.15 : 1);
      Sprites.drawCreature(ctx, a.kind, px + lunge * (a.facing || 1), py, tile * sizeMul, statusOpts(a));

      if (!a.hostile){
        /* marca de aliado: un halo verde para no confundirlo */
        ctx.strokeStyle = 'rgba(124,255,178,0.5)';
        ctx.lineWidth = Math.max(1, tile * 0.05);
        ctx.beginPath();
        ctx.ellipse(px, py + tile * 0.4, tile * 0.3, tile * 0.12, 0, 0, 6.28);
        ctx.stroke();
      }

      if (a.hostile) drawEnemyBadges(a, px, py);
    }
  }

  /** Barra de vida, estados e intención sobre el enemigo. */
  function drawEnemyBadges(a, px, py){
    var top = py - tile * (a.isBoss ? 0.85 : 0.52);

    if (a.hp < a.maxHp){
      var w = tile * (a.isBoss ? 1.2 : 0.78), h = Math.max(2.5, tile * 0.09);
      ctx.fillStyle = 'rgba(20,6,10,0.85)';
      ctx.fillRect(px - w/2, top, w, h);
      var pct = Util.clamp(a.hp / a.maxHp, 0, 1);
      ctx.fillStyle = a.isBoss ? '#c77dff' : (pct < 0.3 ? '#ff2d55' : '#ff5d6c');
      ctx.fillRect(px - w/2, top, w * pct, h);
    }

    /* Aviso de intención: el corazón de la legibilidad táctica. */
    if (a.intent && a.intent !== 'esperar' && a.intent !== 'mover'){
      var icon = INTENT_ICON[a.intent] || '!';
      var big = !!a.windup;
      var iy = top - tile * 0.26;
      var pulse = big ? (Math.sin(time * 9) * 0.5 + 0.5) : 0;
      ctx.save();
      ctx.font = 'bold ' + Math.round(tile * (big ? 0.5 + pulse * 0.08 : 0.38)) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (big){
        ctx.fillStyle = 'rgba(255,90,60,' + (0.5 + pulse * 0.35).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(px, iy, tile * 0.28, 0, 6.28);
        ctx.fill();
      }
      ctx.fillStyle = big ? '#fff' : '#ffd166';
      ctx.fillText(icon, px, iy);
      ctx.restore();
    }

    /* Previsualización de la carga: la línea de peligro. */
    if (a.windup && a.windup.type === 'cargar'){
      var d = a.windup.data;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,80,60,0.5)';
      ctx.lineWidth = Math.max(2, tile * 0.12);
      ctx.setLineDash([tile * 0.22, tile * 0.16]);
      ctx.beginPath();
      ctx.moveTo(sx(a.rx) + tile/2, sy(a.ry) + tile/2);
      ctx.lineTo(sx(a.rx + d.dx * d.len) + tile/2, sy(a.ry + d.dy * d.len) + tile/2);
      ctx.stroke();
      ctx.restore();
    }
    /* Radio de explosión inminente. */
    if (a.windup && a.windup.type === 'explotar'){
      var r = (a.blast && a.blast.r || 2);
      var pz = Math.sin(time * 10) * 0.5 + 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,140,60,' + (0.35 + pz * 0.35).toFixed(2) + ')';
      ctx.lineWidth = Math.max(2, tile * 0.09);
      ctx.beginPath();
      ctx.arc(sx(a.rx) + tile/2, sy(a.ry) + tile/2, (r + 0.4) * tile, 0, 6.28);
      ctx.stroke();
      ctx.restore();
    }
    /* Iconos de estado, en fila bajo la barra. */
    var sts = Object.keys(a.status);
    if (sts.length){
      ctx.save();
      ctx.font = Math.round(tile * 0.3) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < Math.min(4, sts.length); i++){
        var d2 = CFG.STATUS[sts[i]];
        if (!d2) continue;
        ctx.fillText(d2.icon, px - tile * 0.3 + i * tile * 0.25, py + tile * 0.58);
      }
      ctx.restore();
    }
  }

  var INTENT_ICON = {
    atacar:'❗', disparar:'🎯', cargar:'💢', explotar:'💥',
    invocar:'🔺', curar:'➕', hechizo:'✴️', pulso:'⭕', volea:'🏹',
    teleport:'🌀', despertar:'❓'
  };

  /* ─────────── Jugador ─────────── */
  function drawPlayer(){
    var p = Engine.player;
    var px = sx(p.rx) + tile/2, py = sy(p.ry) + tile/2;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + tile * 0.4, tile * 0.3, tile * 0.11, 0, 0, 6.28);
    ctx.fill();

    /* halo del héroe: siempre sabes dónde estás, incluso en el caos */
    var g = ctx.createRadialGradient(px, py, 0, px, py, tile * 1.9);
    g.addColorStop(0, 'rgba(255,240,200,0.14)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - tile * 2, py - tile * 2, tile * 4, tile * 4);

    var lowHp = p.hp / p.s.maxHp < 0.3;
    Sprites.drawHero(ctx, p.classId, px, py, tile, {
      t:time, facing:p.facing, hurt:p.hurtT,
      attacking:p.attackAnim, dashing:p.dashing > 0,
      shield:p.s.shieldMax > 0 ? Util.clamp(p.shield / Math.max(1, p.s.shieldMax), 0, 1) : (p.shield > 0 ? 1 : 0),
      lowHp:lowHp,
      alpha:p.buffs.invisible ? 0.45 : 1,
      burning:!!p.status.quemado, frozen:!!p.status.congelado, poisoned:!!p.status.envenenado
    });

    /* buffs activos sobre la cabeza */
    var bs = Object.keys(p.buffs);
    if (bs.length){
      ctx.save();
      ctx.font = Math.round(tile * 0.3) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      for (var i = 0; i < Math.min(5, bs.length); i++){
        var d = CFG.BUFFS[bs[i]];
        if (d) ctx.fillText(d.icon, px - tile * 0.35 + i * tile * 0.22, py - tile * 0.6);
      }
      ctx.restore();
    }
    var ss = Object.keys(p.status);
    if (ss.length){
      ctx.save();
      ctx.font = Math.round(tile * 0.3) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      for (var j = 0; j < Math.min(5, ss.length); j++){
        var d3 = CFG.STATUS[ss[j]];
        if (d3) ctx.fillText(d3.icon, px - tile * 0.35 + j * tile * 0.22, py + tile * 0.66);
      }
      ctx.restore();
    }
  }

  /* ─────────── Superposiciones de ayuda ─────────── */
  function setAim(a){ aim = a; }
  function setPathPreview(p){ pathPreview = p; }

  function drawOverlays(){
    if (aim && aim.tiles){
      var pz = Math.sin(time * 7) * 0.5 + 0.5;
      ctx.save();
      ctx.fillStyle = 'rgba(142,231,255,' + (0.14 + pz * 0.12).toFixed(3) + ')';
      ctx.strokeStyle = 'rgba(142,231,255,0.55)';
      ctx.lineWidth = Math.max(1, tile * 0.05);
      for (var i = 0; i < aim.tiles.length; i++){
        var t = aim.tiles[i];
        ctx.fillRect(sx(t.x) + 1, sy(t.y) + 1, tile - 2, tile - 2);
        ctx.strokeRect(sx(t.x) + 1.5, sy(t.y) + 1.5, tile - 3, tile - 3);
      }
      ctx.restore();
    }
    if (pathPreview && pathPreview.length){
      ctx.save();
      ctx.fillStyle = 'rgba(255,209,102,0.3)';
      for (var k = 0; k < pathPreview.length; k++){
        var s = pathPreview[k];
        ctx.beginPath();
        ctx.arc(sx(s.x) + tile/2, sy(s.y) + tile/2, tile * 0.11, 0, 6.28);
        ctx.fill();
      }
      ctx.restore();
    }
    /* Flecha al borde de pantalla apuntando a la escalera cuando no se
       ve: quita el "no sé a dónde ir", que es la queja número uno. */
    var st = Engine.run;
    if (st.stairs && !st.visible[st.stairs.y * MW + st.stairs.x] && st.seen[st.stairs.y * MW + st.stairs.x]){
      drawOffscreenArrow(st.stairs.x, st.stairs.y, '#ffd166', '🪜');
    }
    if (st.bossRef && st.bossRef.hp > 0 && !st.visible[st.bossRef.y * MW + st.bossRef.x]){
      drawOffscreenArrow(st.bossRef.x, st.bossRef.y, '#c77dff', '💀');
    }
  }

  function drawOffscreenArrow(wx, wy, color, glyph){
    var px = sx(wx) + tile/2, py = sy(wy) + tile/2;
    if (px > 0 && py > 0 && px < cw && py < ch) return;
    var m = tile * 0.9;
    var cx = Util.clamp(px, m, cw - m), cy = Util.clamp(py, m, ch - m);
    var a = Math.atan2(py - ch/2, px - cw/2);
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = color;
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(tile * 0.34, 0);
    ctx.lineTo(-tile * 0.16, tile * 0.2);
    ctx.lineTo(-tile * 0.16, -tile * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = Math.round(tile * 0.4) + 'px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cx - Math.cos(a) * tile * 0.5, cy - Math.sin(a) * tile * 0.5);
    ctx.restore();
  }

  /* ─────────── Efectos ─────────── */
  function drawFX(){
    var i, n;
    /* proyectiles */
    var bolts = FX.bolts;
    for (i = 0; i < bolts.length; i++){
      var b = bolts[i];
      var k = 1 - b.t / b.max;
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.t / b.max * 1.8);
      ctx.strokeStyle = b.c;
      ctx.lineWidth = Math.max(1.5, tile * (b.style === 'beam' ? 0.13 : 0.08));
      ctx.lineCap = 'round';
      var x0 = sx(b.x0) + tile/2, y0 = sy(b.y0) + tile/2;
      var x1 = sx(b.x1) + tile/2, y1 = sy(b.y1) + tile/2;
      if (b.style === 'arrow'){
        var hx = Util.lerp(x0, x1, Util.clamp(k * 1.4, 0, 1));
        var hy = Util.lerp(y0, y1, Util.clamp(k * 1.4, 0, 1));
        ctx.beginPath();
        ctx.moveTo(Util.lerp(x0, x1, Util.clamp(k * 1.4 - 0.22, 0, 1)),
                   Util.lerp(y0, y1, Util.clamp(k * 1.4 - 0.22, 0, 1)));
        ctx.lineTo(hx, hy);
        ctx.stroke();
      } else if (b.style === 'bolt'){
        /* rayo quebrado */
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        var seg = 4;
        for (n = 1; n < seg; n++){
          var t2 = n / seg;
          var mx = Util.lerp(x0, x1, t2) + (vfxRand() - 0.5) * tile * 0.5;
          var my = Util.lerp(y0, y1, t2) + (vfxRand() - 0.5) * tile * 0.5;
          ctx.lineTo(mx, my);
        }
        ctx.lineTo(x1, y1);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ondas */
    var rings = FX.rings;
    for (i = 0; i < rings.length; i++){
      var r = rings[i];
      var kk = 1 - r.t / r.max;
      ctx.save();
      ctx.globalAlpha = (1 - kk) * 0.8;
      ctx.strokeStyle = r.c;
      ctx.lineWidth = Math.max(1.5, tile * r.w * (1 - kk * 0.6));
      ctx.beginPath();
      ctx.arc(sx(r.x) + tile/2, sy(r.y) + tile/2, r.r * tile * Util.easeOut(kk), 0, 6.28);
      ctx.stroke();
      ctx.restore();
    }

    /* partículas */
    var parts = FX.parts;
    for (i = 0; i < parts.length; i++){
      var pp = parts[i];
      var a = Util.clamp(pp.t / pp.max, 0, 1);
      var s = pp.s * tile;
      var X = sx(pp.x) + tile/2, Y = sy(pp.y) + tile/2;
      ctx.globalAlpha = a;
      ctx.fillStyle = pp.c;
      if (pp.shape === 'spark'){
        ctx.fillRect(X - s * 0.18, Y - s * 0.7, s * 0.36, s * 1.4);
      } else if (pp.shape === 'shard'){
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(pp.rot);
        ctx.fillRect(-s * 0.5, -s * 0.28, s, s * 0.56);
        ctx.restore();
      } else if (pp.shape === 'smoke'){
        ctx.globalAlpha = a * 0.4;
        ctx.beginPath();
        ctx.arc(X, Y, s * (1.6 - a * 0.6), 0, 6.28);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(X, Y, s * 0.6, 0, 6.28);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    /* textos flotantes */
    var fl = FX.floats;
    for (i = 0; i < fl.length; i++){
      var f = fl[i];
      var prog = 1 - f.t / f.max;
      var alpha = f.t / f.max;
      var size = tile * (f.big ? 0.55 : 0.42) * (1 + (1 - Util.clamp(prog * 4, 0, 1)) * 0.5) * f.scale;
      ctx.save();
      ctx.globalAlpha = Util.clamp(alpha * 1.6, 0, 1);
      ctx.font = '900 ' + Math.round(size) + 'px system-ui,-apple-system,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      var X2 = sx(f.x) + tile/2, Y2 = sy(f.y) + tile/2;
      ctx.strokeText(f.txt, X2, Y2);
      ctx.fillStyle = f.c;
      ctx.fillText(f.txt, X2, Y2);
      ctx.restore();
    }
  }

  /* ─────────── Minimapa ─────────── */
  function drawMinimap(){
    if (Meta.opt('noMinimap')) return;
    var st = Engine.run;
    var mw = Math.min(110, cw * 0.28);
    var scale = mw / MW;
    var mh = MH * scale;
    var ox = cw - mw - 8, oy = 8;

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(6,6,12,0.8)';
    ctx.fillRect(ox - 3, oy - 3, mw + 6, mh + 6);
    ctx.strokeStyle = 'rgba(80,80,120,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 3.5, oy - 3.5, mw + 7, mh + 7);

    for (var y = 0; y < MH; y++){
      for (var x = 0; x < MW; x++){
        var i = y * MW + x;
        if (!st.seen[i]) continue;
        var t = st.tiles[i];
        if (CFG.SOLID[t]) ctx.fillStyle = '#34345a';
        else if (t === TL.STAIRS) ctx.fillStyle = '#ffd166';
        else if (t === TL.LAVA) ctx.fillStyle = '#c94f22';
        else if (t === TL.WATER) ctx.fillStyle = '#2c6f9e';
        else ctx.fillStyle = st.visible[i] ? '#1d1d33' : '#131322';
        ctx.fillRect(ox + x * scale, oy + y * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
    /* enemigos visibles */
    for (var k = 0; k < st.actors.length; k++){
      var a = st.actors[k];
      if (a.hp <= 0 || !st.visible[a.y * MW + a.x] || a.hidden) continue;
      ctx.fillStyle = a.isBoss ? '#c77dff' : (a.hostile ? '#ff5d6c' : '#7cffb2');
      ctx.fillRect(ox + a.x * scale - 0.5, oy + a.y * scale - 0.5, scale + 1, scale + 1);
    }
    var p = Engine.player;
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox + p.x * scale - 1, oy + p.y * scale - 1, scale + 2, scale + 2);
    ctx.restore();
  }

  /* ─────────── Post proceso ─────────── */
  function drawVignette(){
    var g = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch) * 0.3,
                                     cw/2, ch/2, Math.max(cw,ch) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (Meta.opt('highContrast') ? 0.25 : 0.52) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    /* pulso rojo cuando estás a punto de morir: el aviso que salva partidas */
    var p = Engine.player;
    if (p && p.hp > 0 && p.hp / p.s.maxHp < 0.25 && !Meta.opt('reduceMotion')){
      var pulse = (Math.sin(time * 4.5) * 0.5 + 0.5) * 0.3 + 0.12;
      var g2 = ctx.createRadialGradient(cw/2, ch/2, Math.min(cw,ch) * 0.18,
                                        cw/2, ch/2, Math.max(cw,ch) * 0.7);
      g2.addColorStop(0, 'rgba(255,45,85,0)');
      g2.addColorStop(1, 'rgba(255,45,85,' + pulse.toFixed(3) + ')');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, cw, ch);
    }
    var fl = FX.flash;
    if (fl.t > 0){
      ctx.fillStyle = Util.rgba(fl.color, (fl.t / fl.max) * fl.power);
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  /* ─────────── Frame ─────────── */
  function frame(dt, snapCam){
    if (!ctx || !Engine.run || !Engine.run.tiles) return;
    time += dt;
    resizeIfNeeded();
    smoothEntities(dt);
    updateCamera(dt, snapCam);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04040a';
    ctx.fillRect(0, 0, cw, ch);

    var sh = FX.shakeOffset();
    ctx.save();
    ctx.translate(Math.round(sh.x * tile * 0.35), Math.round(sh.y * tile * 0.35));

    drawTiles();
    drawOverlays();
    drawItems();
    drawActors();
    drawPlayer();
    drawFX();

    ctx.restore();
    drawMinimap();
    drawVignette();
  }

  return {
    init:init, resize:resize, frame:frame,
    tileFromScreen:tileFromScreen, setAim:setAim, setPathPreview:setPathPreview,
    get tileSize(){ return tile; },
    get time(){ return time; }
  };
})();
