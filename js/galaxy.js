/* ============================================================
   galaxy.js — процедурная модель Млечного Пути
   Система координат (гелиоцентрическая галактическая, kpc):
     X — к центру Галактики, Y — по направлению вращения,
     Z — к северному галактическому полюсу.
   Солнце в начале координат, центр Галактики в точке (8.2, 0, 0).
   ============================================================ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var GC_DIST = 8.2;                 // расстояние до центра Галактики, kpc

  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  // ---------- звёзды диска, бугра и гало ----------
  function buildStars(opt) {
    opt = opt || {};
    var N_DISK = opt.disk || 34000;
    var N_BULGE = opt.bulge || 10000;
    var N_HALO = opt.halo || 3000;
    var total = N_DISK + N_BULGE + N_HALO;

    var base = new Float32Array(total * 3);
    var color = new Float32Array(total * 3);
    var i = 0;

    var PITCH = Math.tan(13 * Math.PI / 180);   // угол раскрутки спирали
    var R0 = 0.9;
    function armAngle(r) { return Math.log(r / R0) / PITCH; }

    // --- диск с четырьмя рукавами ---
    for (var n = 0; n < N_DISK; n++) {
      var r = 0, th = 0, ok = false, dens = 0;
      for (var a = 0; a < 12 && !ok; a++) {
        r = -9.5 * Math.log(1 - Math.random());          // экспоненциальный диск
        if (r > 27 || r < 0.5) continue;
        th = Math.random() * TAU;
        var w = 0.30 + 0.03 * r;                          // рукав шире к краю
        var baseAng = armAngle(r);
        dens = 0.20;
        for (var k = 0; k < 4; k++) {
          var t = baseAng + k * TAU / 4;
          var d = ((th - t + Math.PI * 3) % TAU) - Math.PI;
          var e = Math.exp(-(d * d) / (2 * w * w));
          if (e > dens) dens = e;
        }
        ok = Math.random() < dens;
      }
      if (!ok) { r = 1 + Math.random() * 25; th = Math.random() * TAU; dens = 0.2; }

      var thick = Math.random() < 0.3;
      var h = thick ? (0.16 + 0.01 * r) : (0.045 + 0.004 * r);
      var x = GC_DIST + r * Math.cos(th);
      var y = r * Math.sin(th);
      var z = gauss() * h;

      var rr, g, b, br;
      if (dens > 0.55 && Math.random() < 0.45) {          // молодые голубые звёзды рукавов
        br = 0.45 + Math.random() * 0.55;
        rr = 0.60 * br; g = 0.74 * br; b = 1.0 * br;
        if (Math.random() < 0.10) { rr = 1.0 * br; g = 0.52 * br; b = 0.74 * br; } // HII-области
      } else {                                             // более старый жёлтый диск
        br = 0.25 + Math.random() * 0.45;
        var warm = r < 6 ? 1 : r / 6;
        rr = 1.0 * br;
        g = (0.88 - 0.10 * warm) * br;
        b = (0.74 - 0.22 * warm) * br;
      }
      base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
      color[i * 3] = rr; color[i * 3 + 1] = g; color[i * 3 + 2] = b;
      i++;
    }

    // --- бугр (центральная выпуклость) ---
    for (var m = 0; m < N_BULGE; m++) {
      var bx = gauss() * 1.15, by = gauss() * 1.15, bz = gauss() * 0.52;
      var rad = Math.sqrt(bx * bx + by * by + bz * bz * 2.5);
      if (rad > 3.4) { bx *= 0.6; by *= 0.6; bz *= 0.6; rad *= 0.6; }
      var glow = Math.exp(-rad * 0.75);
      var br2 = 0.20 + 0.75 * glow * (0.6 + Math.random() * 0.6);
      var mix = Math.random();
      base[i * 3] = GC_DIST + bx; base[i * 3 + 1] = by; base[i * 3 + 2] = bz;
      color[i * 3] = br2;
      color[i * 3 + 1] = br2 * (0.72 + 0.14 * mix);
      color[i * 3 + 2] = br2 * (0.45 + 0.20 * mix);
      i++;
    }

    // --- гало ---
    for (var q = 0; q < N_HALO; q++) {
      var hr = 3.5 + 26 * Math.pow(Math.random(), 0.55);
      var u = Math.random() * TAU, c = 2 * Math.random() - 1;
      var s = Math.sqrt(1 - c * c);
      var br3 = 0.10 + Math.random() * 0.22;
      base[i * 3] = GC_DIST + hr * s * Math.cos(u);
      base[i * 3 + 1] = hr * s * Math.sin(u);
      base[i * 3 + 2] = hr * c * 0.8;
      if (Math.random() < 0.25) { color[i * 3] = br3 * 1.0; color[i * 3 + 1] = br3 * 0.6; color[i * 3 + 2] = br3 * 0.42; }
      else { color[i * 3] = br3 * 0.75; color[i * 3 + 1] = br3 * 0.8; color[i * 3 + 2] = br3; }
      i++;
    }

    return { base: base, color: color, count: total };
  }

  // ---------- светящаяся текстура (для свечения центра и Солнца) ----------
  function makeGlowTexture(inner, outer) {
    var size = 128;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.25, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(cv);
    return tex;
  }

  // ---------- круглая точка для планет ----------
  function makeDotTexture() {
    var size = 64;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cv);
  }

  // ---------- кольца сетки (5, 10, 15... kpc от центра) ----------
  function buildRings(step, maxR) {
    var segs = 180, positions = [];
    for (var R = step; R <= maxR + 1e-6; R += step) {
      for (var s = 0; s < segs; s++) {
        var a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU;
        positions.push(
          GC_DIST + R * Math.cos(a0), R * Math.sin(a0), 0,
          GC_DIST + R * Math.cos(a1), R * Math.sin(a1), 0
        );
      }
    }
    return new Float32Array(positions);
  }

  // ---------- ось Солнце → центр Галактики ----------
  function buildAxis() {
    return new Float32Array([0, 0, 0, GC_DIST, 0, 0]);
  }

  // ---------- лучи (разметка плоскости) ----------
  function buildSpokes(radius) {
    var pos = [];
    for (var k = 0; k < 6; k++) {
      var a = k * TAU / 6;
      pos.push(GC_DIST, 0, 0,
               GC_DIST + radius * Math.cos(a), radius * Math.sin(a), 0);
    }
    return new Float32Array(pos);
  }

  global.GalaxyKit = {
    GC_DIST: GC_DIST,
    buildStars: buildStars,
    makeGlowTexture: makeGlowTexture,
    makeDotTexture: makeDotTexture,
    buildRings: buildRings,
    buildAxis: buildAxis,
    buildSpokes: buildSpokes
  };
})(window);
