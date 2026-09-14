/* ════════════════════════════════════════════════════════════════════
   30-dungeon.js — generación de pisos, campo de visión y pathfinding.

   Todo el azar viene del RNG sembrado: la misma semilla produce el
   mismo piso, con los mismos enemigos y el mismo botín, siempre.
   ════════════════════════════════════════════════════════════════════ */
"use strict";

var Dungeon = (function(){

  var MW = CFG.MW, MH = CFG.MH, TL = CFG.T;
  function idx(x, y){ return y * MW + x; }
  function inBounds(x, y){ return x >= 0 && y >= 0 && x < MW && y < MH; }

  /* ─────────── Salas ─────────── */
  function carveRect(tiles, r, tile){
    for (var y = r.y; y < r.y + r.h; y++)
      for (var x = r.x; x < r.x + r.w; x++)
        tiles[idx(x,y)] = tile;
  }
  /** Sala en cruz: rompe la monotonía de los rectángulos. */
  function carveCross(tiles, r){
    var cw = Math.max(3, r.w >> 1), chh = Math.max(3, r.h >> 1);
    carveRect(tiles, { x:r.x + ((r.w - cw) >> 1), y:r.y, w:cw, h:r.h }, TL.FLOOR);
    carveRect(tiles, { x:r.x, y:r.y + ((r.h - chh) >> 1), w:r.w, h:chh }, TL.FLOOR);
  }
  /** Sala redonda: se usa para arenas y tesoros, se lee como "especial". */
  function carveOval(tiles, r){
    var cx = r.x + r.w/2 - 0.5, cy = r.y + r.h/2 - 0.5;
    var rx = r.w/2, ry = r.h/2;
    for (var y = r.y; y < r.y + r.h; y++)
      for (var x = r.x; x < r.x + r.w; x++){
        var dx = (x - cx)/rx, dy = (y - cy)/ry;
        if (dx*dx + dy*dy <= 1.02) tiles[idx(x,y)] = TL.FLOOR;
      }
  }
  function center(r){ return { x:(r.x + (r.w >> 1)), y:(r.y + (r.h >> 1)) }; }

  function hCorr(tiles, x1, x2, y){
    for (var x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
      if (tiles[idx(x,y)] === TL.WALL) tiles[idx(x,y)] = TL.FLOOR;
  }
  function vCorr(tiles, y1, y2, x){
    for (var y = Math.min(y1,y2); y <= Math.max(y1,y2); y++)
      if (tiles[idx(x,y)] === TL.WALL) tiles[idx(x,y)] = TL.FLOOR;
  }

  /* ─────────── Conectividad ───────────
     Un piso con la escalera inalcanzable arruina la partida y rompe la
     promesa de la semilla, así que se verifica y se repara siempre. */
  function floodFill(tiles, sx, sy){
    var seen = new Uint8Array(MW*MH);
    var stack = [idx(sx,sy)];
    seen[stack[0]] = 1;
    var count = 1;
    while (stack.length){
      var i = stack.pop();
      var x = i % MW, y = (i - x) / MW;
      var n = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
      for (var k = 0; k < 4; k++){
        var nx = n[k][0], ny = n[k][1];
        if (!inBounds(nx, ny)) continue;
        var j = idx(nx, ny);
        if (seen[j]) continue;
        if (CFG.SOLID[tiles[j]]) continue;
        seen[j] = 1; count++;
        stack.push(j);
      }
    }
    return { seen:seen, count:count };
  }

  /** Une a la fuerza cualquier isla que haya quedado suelta. */
  function ensureConnected(tiles, rooms, start){
    for (var pass = 0; pass < 6; pass++){
      var ff = floodFill(tiles, start.x, start.y);
      var orphan = null;
      for (var r = 0; r < rooms.length && !orphan; r++){
        var c = center(rooms[r]);
        if (!ff.seen[idx(c.x, c.y)] && !CFG.SOLID[tiles[idx(c.x,c.y)]]) orphan = c;
      }
      if (!orphan) return;
      hCorr(tiles, start.x, orphan.x, start.y);
      vCorr(tiles, start.y, orphan.y, orphan.x);
    }
  }

  /* ─────────── Peligros del bioma ─────────── */
  function sprinkleHazards(tiles, rooms, biome, rng, start, stairs){
    if (!biome.hazards.length) return;
    for (var r = 1; r < rooms.length; r++){
      if (!rng.chance(0.62)) continue;
      var room = rooms[r];
      var haz = rng.pick(biome.hazards);
      /* Manchas orgánicas en vez de ruido disperso: se leen mejor. */
      var blobs = rng.range(1, 3);
      for (var b = 0; b < blobs; b++){
        var bx = rng.range(room.x, room.x + room.w - 1);
        var by = rng.range(room.y, room.y + room.h - 1);
        var rad = rng.range(1, 2);
        for (var y = by - rad; y <= by + rad; y++)
          for (var x = bx - rad; x <= bx + rad; x++){
            if (!inBounds(x, y)) continue;
            if (Util.cheb(x, y, bx, by) > rad) continue;
            if (tiles[idx(x,y)] !== TL.FLOOR) continue;
            if (Util.cheb(x, y, start.x, start.y) < 4) continue;
            if (Util.cheb(x, y, stairs.x, stairs.y) < 2) continue;
            if (rng.chance(biome.hazardRate * 6)) tiles[idx(x,y)] = haz;
          }
      }
    }
    /* Los abismos no deben aislar la escalera. */
    ensureConnected(tiles, rooms, start);
  }

  /** Antorchas en muros que dan a suelo: la iluminación del render las usa. */
  function placeTorches(tiles, rng){
    var out = [];
    for (var y = 1; y < MH - 1; y++){
      for (var x = 1; x < MW - 1; x++){
        if (tiles[idx(x,y)] !== TL.WALL) continue;
        if (tiles[idx(x, y+1)] !== TL.FLOOR) continue;
        if (!rng.chance(0.055)) continue;
        tiles[idx(x,y)] = TL.TORCH;
        out.push({ x:x, y:y });
      }
    }
    return out;
  }

  /* ─────────── Generación de un piso ─────────── */
  function generate(seed, floor, opts){
    opts = opts || {};
    var rng = new RNG(seed + '|piso|' + floor);
    var biome = CFG.biomeFor(floor);
    var boss = CFG.isBossFloor(floor);
    var tiles = new Uint8Array(MW * MH).fill(TL.WALL);

    /* --- colocar salas sin solaparse --- */
    var rooms = [], tries = 0;
    var target = boss ? 7 : rng.range(9, 13);
    while (rooms.length < target && tries++ < 260){
      var w = rng.range(6, 12), h = rng.range(5, 9);
      var x = rng.range(1, MW - w - 2), y = rng.range(1, MH - h - 2);
      var ok = true;
      for (var i = 0; i < rooms.length; i++){
        var o = rooms[i];
        if (x - 2 < o.x + o.w && o.x - 2 < x + w && y - 2 < o.y + o.h && o.y - 2 < y + h){ ok = false; break; }
      }
      if (ok) rooms.push({ x:x, y:y, w:w, h:h, kind:'normal' });
    }
    if (!rooms.length) rooms.push({ x:2, y:2, w:12, h:9, kind:'normal' });

    /* --- excavar con formas variadas --- */
    for (var r = 0; r < rooms.length; r++){
      var room = rooms[r];
      var shape = rng.next();
      if (shape < 0.14 && room.w >= 8 && room.h >= 7){ carveOval(tiles, room); room.shape = 'oval'; }
      else if (shape < 0.26 && room.w >= 8 && room.h >= 7){ carveCross(tiles, room); room.shape = 'cross'; }
      else { carveRect(tiles, room, TL.FLOOR); room.shape = 'rect'; }
    }

    /* --- pasillos: cadena + atajos, para que no sea un árbol lineal --- */
    for (var c = 1; c < rooms.length; c++){
      var a = center(rooms[c-1]), b = center(rooms[c]);
      if (rng.chance(0.5)){ hCorr(tiles, a.x, b.x, a.y); vCorr(tiles, a.y, b.y, b.x); }
      else               { vCorr(tiles, a.y, b.y, a.x); hCorr(tiles, a.x, b.x, b.y); }
    }
    var extra = rng.range(2, 4);
    for (var e = 0; e < extra && rooms.length > 3; e++){
      var ra = center(rng.pick(rooms)), rb = center(rng.pick(rooms));
      hCorr(tiles, ra.x, rb.x, ra.y); vCorr(tiles, ra.y, rb.y, rb.x);
    }

    /* --- entrada y escalera: lo más lejos posible una de otra --- */
    var startRoom = rooms[0];
    var start = center(startRoom);
    startRoom.kind = 'entrada';
    if (CFG.SOLID[tiles[idx(start.x, start.y)]]) tiles[idx(start.x, start.y)] = TL.FLOOR;

    var far = null, farD = -1;
    for (var s = 1; s < rooms.length; s++){
      var cc = center(rooms[s]);
      var d = Util.manh(cc.x, cc.y, start.x, start.y);
      if (d > farD){ farD = d; far = rooms[s]; }
    }
    if (!far) far = startRoom;
    far.kind = boss ? 'arena' : 'escalera';
    var stairs = center(far);
    ensureConnected(tiles, rooms, start);
    tiles[idx(stairs.x, stairs.y)] = TL.STAIRS;

    /* --- salas especiales --- */
    var specials = [];
    var candidates = rooms.filter(function(rr){ return rr.kind === 'normal'; });
    rng.shuffle(candidates);
    if (candidates.length && floor >= 2){
      var tesoro = candidates.pop();
      if (tesoro){ tesoro.kind = 'tesoro'; specials.push(tesoro); }
    }
    if (candidates.length && rng.chance(0.45)){
      var altar = candidates.pop();
      if (altar){
        altar.kind = 'altar'; specials.push(altar);
        var ac = center(altar);
        tiles[idx(ac.x, ac.y)] = TL.ALTAR;
      }
    }

    /* Los dos primeros pisos son el tutorial de facto: sin trampas. */
    if (floor >= CFG.BAL.hazardFromFloor) sprinkleHazards(tiles, rooms, biome, rng, start, stairs);

    /* La escalera y la entrada siempre pisables tras los peligros. */
    tiles[idx(stairs.x, stairs.y)] = TL.STAIRS;
    if (CFG.SOLID[tiles[idx(start.x, start.y)]] || tiles[idx(start.x, start.y)] === TL.LAVA)
      tiles[idx(start.x, start.y)] = TL.FLOOR;

    /* Garantía dura: la escalera SIEMPRE se puede alcanzar a pie.
       La promesa del juego es "la misma semilla, la misma mazmorra";
       una semilla imposible rompe esa promesa para todo el mundo. */
    var reach = guaranteePath(tiles, rooms, start, stairs);

    var torches = placeTorches(tiles, rng);

    return {
      tiles:tiles, rooms:rooms, start:start, stairs:stairs,
      biome:biome, isBoss:boss, torches:torches, specials:specials,
      reach:reach, rng:rng
    };
  }

  /** Abre un pasillo limpio si los peligros aislaron la escalera. */
  function guaranteePath(tiles, rooms, start, stairs){
    for (var pass = 0; pass < 4; pass++){
      var ff = floodFill(tiles, start.x, start.y);
      if (ff.seen[idx(stairs.x, stairs.y)]) return ff.seen;
      /* Pasillo en L, borrando cualquier peligro que estorbe. */
      var x, y;
      for (x = Math.min(start.x, stairs.x); x <= Math.max(start.x, stairs.x); x++){
        var i = idx(x, start.y);
        if (CFG.SOLID[tiles[i]] || tiles[i] === TL.LAVA) tiles[i] = TL.FLOOR;
      }
      for (y = Math.min(start.y, stairs.y); y <= Math.max(start.y, stairs.y); y++){
        var j = idx(stairs.x, y);
        if (CFG.SOLID[tiles[j]] || tiles[j] === TL.LAVA) tiles[j] = TL.FLOOR;
      }
      tiles[idx(stairs.x, stairs.y)] = TL.STAIRS;
    }
    return floodFill(tiles, start.x, start.y).seen;
  }

  /* ─────────── Casillas libres para colocar cosas ─────────── */
  function freeSpots(tiles, rooms, rng, occupied, avoid, minDist, reach){
    var out = [];
    for (var r = 0; r < rooms.length; r++){
      var room = rooms[r];
      for (var y = room.y; y < room.y + room.h; y++)
        for (var x = room.x; x < room.x + room.w; x++){
          var i = idx(x,y);
          if (tiles[i] !== TL.FLOOR && tiles[i] !== TL.GRASS) continue;
          if (occupied[i]) continue;
          /* Nada de botín ni enemigos en una isla inalcanzable. */
          if (reach && !reach[i]) continue;
          if (avoid && Util.cheb(x, y, avoid.x, avoid.y) < minDist) continue;
          out.push({ x:x, y:y, room:room });
        }
    }
    rng.shuffle(out);
    return out;
  }

  /* ════════════════════════════════════════════════════════════════
     Campo de visión: shadowcasting recursivo por octantes.
     Elegido sobre el trazado de rayos ingenuo porque no deja huecos
     ni "esquinas fantasma", que en un juego por turnos se nota mucho.
     ════════════════════════════════════════════════════════════════ */
  var OCT = [
    [ 1, 0, 0, 1], [ 0, 1, 1, 0], [ 0,-1, 1, 0], [-1, 0, 0, 1],
    [-1, 0, 0,-1], [ 0,-1,-1, 0], [ 0, 1,-1, 0], [ 1, 0, 0,-1]
  ];

  function castLight(tiles, vis, seen, light, ox, oy, row, startSlope, endSlope, radius, xx, xy, yx, yy){
    if (startSlope < endSlope) return;
    var nextStart = startSlope;
    for (var i = row; i <= radius; i++){
      var blocked = false;
      for (var dx = -i, dy = -i; dx <= 0; dx++){
        var l = (dx - 0.5) / (dy + 0.5);
        var rr = (dx + 0.5) / (dy - 0.5);
        if (rr > nextStart) continue;
        if (l < endSlope) break;

        var sax = dx * xx + dy * xy;
        var say = dx * yx + dy * yy;
        var ax = ox + sax, ay = oy + say;
        if (!inBounds(ax, ay)) continue;

        var d2 = sax*sax + say*say;
        var j = idx(ax, ay);
        if (d2 <= radius * radius){
          vis[j] = 1; seen[j] = 1;
          /* Caída de luz suave: da profundidad sin coste extra. */
          var f = 1 - Math.sqrt(d2) / (radius + 0.6);
          if (f > light[j]) light[j] = f;
        }

        var isWall = !!CFG.OPAQUE[tiles[j]];
        if (blocked){
          if (isWall){ nextStart = rr; }
          else { blocked = false; startSlope = nextStart; }
        } else if (isWall && i < radius){
          blocked = true;
          castLight(tiles, vis, seen, light, ox, oy, i + 1, startSlope, l, radius, xx, xy, yx, yy);
          nextStart = rr;
        }
      }
      if (blocked) break;
    }
  }

  function computeFOV(tiles, vis, seen, light, px, py, radius){
    vis.fill(0);
    light.fill(0);
    var i = idx(px, py);
    vis[i] = 1; seen[i] = 1; light[i] = 1;
    for (var o = 0; o < 8; o++){
      castLight(tiles, vis, seen, light, px, py, 1, 1.0, 0.0, radius,
                OCT[o][0], OCT[o][1], OCT[o][2], OCT[o][3]);
    }
  }

  /** Línea de visión entre dos puntos (para IA y disparos). */
  function los(tiles, x0, y0, x1, y1){
    var dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0, guard = 0;
    while (guard++ < 400){
      if (x === x1 && y === y1) return true;
      var e2 = 2 * err;
      if (e2 > -dy){ err -= dy; x += sx; }
      if (e2 <  dx){ err += dx; y += sy; }
      if (x === x1 && y === y1) return true;
      if (!inBounds(x, y)) return false;
      if (CFG.OPAQUE[tiles[idx(x,y)]]) return false;
    }
    return false;
  }

  /** Casillas de la línea, sin incluir el origen. Para flechas y cargas. */
  function lineTiles(x0, y0, x1, y1){
    var pts = [];
    var dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0, guard = 0;
    while (guard++ < 400){
      var e2 = 2 * err;
      if (e2 > -dy){ err -= dy; x += sx; }
      if (e2 <  dx){ err += dx; y += sy; }
      pts.push({ x:x, y:y });
      if (x === x1 && y === y1) break;
    }
    return pts;
  }

  /* ════════════════════════════════════════════════════════════════
     A* — para "tocar una casilla y caminar hasta ahí".
     Sin esto, moverse por un mapa de 44x30 con un D-pad es agotador,
     y la fricción de moverse es lo que hace abandonar el género.
     ════════════════════════════════════════════════════════════════ */
  var DIRS8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  var DIRS4 = [[1,0],[-1,0],[0,1],[0,-1]];

  /**
   * @param blockedFn (x,y) -> true si no se puede pasar
   * @param costFn    (x,y) -> coste extra (lava cara, agua lenta)
   */
  function findPath(sx, sy, tx, ty, blockedFn, costFn, diagonals){
    if (sx === tx && sy === ty) return [];
    var dirs = diagonals ? DIRS8 : DIRS4;
    var N = MW * MH;
    var g = new Float32Array(N).fill(Infinity);
    var came = new Int32Array(N).fill(-1);
    var closed = new Uint8Array(N);
    var start = idx(sx, sy), goal = idx(tx, ty);
    g[start] = 0;

    /* Montículo binario mínimo: una lista ordenada se vuelve O(n²). */
    var heap = [{ i:start, f:0 }];
    function push(node){
      heap.push(node);
      var c = heap.length - 1;
      while (c > 0){
        var p = (c - 1) >> 1;
        if (heap[p].f <= heap[c].f) break;
        var t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p;
      }
    }
    function pop(){
      var top = heap[0], last = heap.pop();
      if (heap.length){
        heap[0] = last;
        var p = 0;
        for(;;){
          var l = p*2+1, r = l+1, m = p;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === p) break;
          var t = heap[p]; heap[p] = heap[m]; heap[m] = t; p = m;
        }
      }
      return top;
    }

    var guard = 0;
    while (heap.length && guard++ < 6000){
      var cur = pop();
      if (closed[cur.i]) continue;
      closed[cur.i] = 1;
      if (cur.i === goal) break;
      var cx = cur.i % MW, cy = (cur.i - cx) / MW;
      for (var d = 0; d < dirs.length; d++){
        var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (!inBounds(nx, ny)) continue;
        var ni = idx(nx, ny);
        if (closed[ni]) continue;
        if (ni !== goal && blockedFn(nx, ny)) continue;
        var step = (dirs[d][0] && dirs[d][1]) ? 1.45 : 1;
        step += costFn ? costFn(nx, ny) : 0;
        var ng = g[cur.i] + step;
        if (ng < g[ni]){
          g[ni] = ng;
          came[ni] = cur.i;
          push({ i:ni, f:ng + Util.cheb(nx, ny, tx, ty) });
        }
      }
    }

    if (came[goal] < 0 && goal !== start) return null;
    var path = [], node = goal;
    while (node !== start && node >= 0){
      var px = node % MW;
      path.push({ x:px, y:(node - px) / MW });
      node = came[node];
      if (path.length > 2000) return null;
    }
    path.reverse();
    return path;
  }

  /** Mapa de distancias desde el jugador: la IA lo usa para perseguir
      sin quedarse atascada en esquinas, y es una sola pasada por turno. */
  function distanceField(px, py, blockedFn){
    var dist = new Int16Array(MW * MH).fill(-1);
    var q = [idx(px, py)];
    dist[q[0]] = 0;
    var head = 0;
    while (head < q.length){
      var i = q[head++];
      var x = i % MW, y = (i - x) / MW;
      var d = dist[i];
      if (d > 40) continue;
      for (var k = 0; k < 8; k++){
        var nx = x + DIRS8[k][0], ny = y + DIRS8[k][1];
        if (!inBounds(nx, ny)) continue;
        var j = idx(nx, ny);
        if (dist[j] >= 0) continue;
        if (blockedFn(nx, ny)) continue;
        dist[j] = d + 1;
        q.push(j);
      }
    }
    return dist;
  }

  return {
    idx:idx, inBounds:inBounds, center:center,
    generate:generate, freeSpots:freeSpots,
    computeFOV:computeFOV, los:los, lineTiles:lineTiles,
    findPath:findPath, distanceField:distanceField,
    DIRS8:DIRS8, DIRS4:DIRS4
  };
})();
