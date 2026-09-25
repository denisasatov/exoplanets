/* ============================================================
   app.js — карта экзопланет Галактики (Three.js)
   Данные: NASA Exoplanet Archive, таблица PSCompPars
   ============================================================ */
(function () {
  'use strict';

  var KIT = window.GalaxyKit;
  var PLANETS = window.PLANETS || [];
  var GC = KIT.GC_DIST;                     // 8.2 kpc
  var RAD = Math.PI / 180, DEG = 180 / Math.PI, TAU = Math.PI * 2;
  var LY_PER_PC = 3.26156;

  /* ================= группы методов открытия ================= */
  var GROUPS = [
    { key: 'Transit',                    ru: 'Транзит',              color: '#56c8ff' },
    { key: 'Radial Velocity',            ru: 'Лучевые скорости',     color: '#ffa726' },
    { key: 'Microlensing',               ru: 'Микролинзирование',    color: '#66bb6a' },
    { key: 'Imaging',                    ru: 'Прямая визуализация',  color: '#b388ff' },
    { key: 'Transit Timing Variations',  ru: 'Вариации транзитов',   color: '#f48fb1' },
    { key: 'Eclipse Timing Variations',  ru: 'Вариации затмений',    color: '#ff8a65' },
    { key: 'Pulsar Timing',              ru: 'Пульсарный тайминг',   color: '#4dd0e1' },
    { key: 'Astrometry',                 ru: 'Астрометрия',          color: '#fff176' },
    { key: 'OTHER',                      ru: 'Прочие методы',        color: '#cfd8dc' }
  ];
  var groupByKey = {};
  GROUPS.forEach(function (g, i) { groupByKey[g.key] = { g: g, i: i }; });

  function groupOf(name) {
    return groupByKey[name] || groupByKey.OTHER;
  }

  /* ================= подготовка данных ================= */
  var N = PLANETS.length;
  var basePos = new Float32Array(N * 3);    // базовые координаты, kpc
  var colors = new Float32Array(N * 3);
  var vis = new Uint8Array(N);
  var hasDist = new Uint8Array(N);
  var distPc = new Float32Array(N);
  var galL = new Float32Array(N);           // галактическая долгота, рад
  var galB = new Float32Array(N);           // галактическая широта, рад
  var groupIdx = new Uint8Array(N);
  var sortedIdx = [];                       // индексы по возрастанию расстояния

  var RA_NGP = 192.85948 * RAD, DEC_NGP = 27.12825 * RAD, L_NCP = 122.93192 * RAD;

  function eqToGalactic(raDeg, decDeg) {
    var ra = raDeg * RAD, dec = decDeg * RAD;
    var sinB = Math.sin(dec) * Math.sin(DEC_NGP) +
               Math.cos(dec) * Math.cos(DEC_NGP) * Math.cos(ra - RA_NGP);
    var b = Math.asin(Math.max(-1, Math.min(1, sinB)));
    var y = Math.cos(dec) * Math.sin(ra - RA_NGP);
    var x = Math.sin(dec) * Math.cos(DEC_NGP) -
            Math.cos(dec) * Math.sin(DEC_NGP) * Math.cos(ra - RA_NGP);
    var l = L_NCP - Math.atan2(y, x);
    l = ((l % TAU) + TAU) % TAU;
    return [l, b];
  }

  var MIN_YEAR = 9999, MAX_YEAR = 0;
  for (var i0 = 0; i0 < N; i0++) {
    var p = PLANETS[i0], o = i0 * 3;
    var d = (typeof p.d === 'number') ? p.d : null;
    var ra = (typeof p.ra === 'number') ? p.ra : null;
    var dec = (typeof p.dec === 'number') ? p.dec : null;

    if (typeof p.y === 'number') {
      if (p.y < MIN_YEAR) MIN_YEAR = p.y;
      if (p.y > MAX_YEAR) MAX_YEAR = p.y;
    }

    if (ra !== null && dec !== null) {
      var lb = eqToGalactic(ra, dec);
      galL[i0] = lb[0]; galB[i0] = lb[1];
      if (d !== null && d > 0) {
        var kpc = d / 1000;
        var cb = Math.cos(lb[1]);
        basePos[o]     = kpc * cb * Math.cos(lb[0]);
        basePos[o + 1] = kpc * cb * Math.sin(lb[0]);
        basePos[o + 2] = kpc * Math.sin(lb[1]);
        hasDist[i0] = 1;
        distPc[i0] = d;
        sortedIdx.push(i0);
      }
    }
    var gi = groupOf(p.me).i;
    groupIdx[i0] = gi;
    var c = hexToRgb(GROUPS[gi].color);
    colors[o] = c[0]; colors[o + 1] = c[1]; colors[o + 2] = c[2];
  }
  sortedIdx.sort(function (a, b) { return distPc[a] - distPc[b]; });

  function hexToRgb(hex) {
    return [
      parseInt(hex.substr(1, 2), 16) / 255,
      parseInt(hex.substr(3, 2), 16) / 255,
      parseInt(hex.substr(5, 2), 16) / 255
    ];
  }

  /* ================= логарифмическая шкала ================= */
  var logMode = false;
  var LOG_B = 1.0;                                   // kpc
  var R_REF = 33;                                    // kpc — внешняя граница
  var LOG_A = R_REF / Math.log(1 + R_REF / LOG_B);
  function mapR(r) { return logMode ? LOG_A * Math.log(1 + r / LOG_B) : r; }

  /* ================= сцена ================= */
  var container = document.getElementById('scene');
  var W = window.innerWidth, H = window.innerHeight;

  var renderer, scene, camera, controls;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    document.getElementById('loader').innerHTML =
      '<div style="color:#ff9a9a">Не удалось запустить WebGL: ' + e.message + '</div>';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x04070e, 1);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(52, W / H, 0.01, 4000);
  camera.up.set(0, 0, 1);                            // «север» — к северному полюсу Галактики
  camera.position.set(1.0, 2.6, 4.6);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = 0.03;
  controls.maxDistance = 400;
  controls.target.set(2.2, 0, 0);
  controls.addEventListener('start', function () { fly = null; });

  var remapList = [];                                // {geom, base} — объекты, зависящие от шкалы

  /* ---------- звёзды Галактики ---------- */
  var dotTex = KIT.makeDotTexture();
  var stars = KIT.buildStars();
  var starGeom = new THREE.BufferGeometry();
  var starBase = stars.base;
  starGeom.setAttribute('position', new THREE.BufferAttribute(stars.base.slice(), 3));
  starGeom.setAttribute('color', new THREE.BufferAttribute(stars.color, 3));
  var starMat = new THREE.PointsMaterial({
    size: 1.5, sizeAttenuation: false, vertexColors: true, map: dotTex,
    transparent: true, opacity: 0.95, depthWrite: false, alphaTest: 0.02,
    blending: THREE.AdditiveBlending
  });
  var starPoints = new THREE.Points(starGeom, starMat);
  starPoints.frustumCulled = false;
  scene.add(starPoints);
  remapList.push({ geom: starGeom, base: starBase });

  /* ---------- свечение центра Галактики ---------- */
  var gcGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: KIT.makeGlowTexture('rgba(226,203,255,0.95)', 'rgba(150,110,235,0.45)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  gcGlow.position.set(GC, 0, 0);
  scene.add(gcGlow);

  /* ---------- разметка: кольца, ось, лучи ---------- */
  function addLines(baseArr, color, opacity) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(baseArr.slice(), 3));
    var m = new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opacity, depthWrite: false
    });
    var obj = new THREE.LineSegments(g, m);
    obj.frustumCulled = false;
    scene.add(obj);
    remapList.push({ geom: g, base: baseArr });
    return obj;
  }
  addLines(KIT.buildRings(5, 25), 0x27517f, 0.55);
  addLines(KIT.buildAxis(), 0x6f8ec4, 0.65);
  addLines(KIT.buildSpokes(26), 0x1b3c63, 0.4);

  /* ---------- маркеры Солнца и центра Галактики ---------- */
  function circleGeom() {
    var seg = 96, arr = [];
    for (var s = 0; s < seg; s++) {
      var a0 = s / seg * TAU, a1 = (s + 1) / seg * TAU;
      arr.push(Math.cos(a0), Math.sin(a0), 0, Math.cos(a1), Math.sin(a1), 0);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    return g;
  }
  function marker(color, pos, op) {
    var line = new THREE.LineSegments(circleGeom(), new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: op, depthTest: false, depthWrite: false
    }));
    line.position.copy(pos);
    line.frustumCulled = false;
    scene.add(line);
    return line;
  }
  var sunRing = marker(0xffd98a, new THREE.Vector3(0, 0, 0), 0.85);
  var gcRing = marker(0xc9a9ff, new THREE.Vector3(GC, 0, 0), 0.7);

  function singlePoint(color, size, pos) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([pos.x, pos.y, pos.z]), 3));
    var m = new THREE.PointsMaterial({
      size: size, sizeAttenuation: false, color: color, map: dotTex,
      transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
    });
    var p = new THREE.Points(g, m);
    p.frustumCulled = false;
    scene.add(p);
    return p;
  }
  var sunDot = singlePoint(0xffe9a8, 11, new THREE.Vector3(0, 0, 0));
  var gcDot = singlePoint(0xd7c2ff, 9, new THREE.Vector3(GC, 0, 0));

  /* ---------- планеты ---------- */
  function ringTexture() {
    var size = 96, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var ctx = cv.getContext('2d');
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, TAU);
    ctx.stroke();
    return new THREE.CanvasTexture(cv);
  }
  var ringTex = ringTexture();

  var planetGeom = new THREE.BufferGeometry();
  planetGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  planetGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  var planetMat = new THREE.PointsMaterial({
    size: 7, sizeAttenuation: false, vertexColors: true, map: dotTex,
    transparent: true, opacity: 0.96, depthWrite: false, alphaTest: 0.08
  });
  var planetPoints = new THREE.Points(planetGeom, planetMat);
  planetPoints.frustumCulled = false;
  scene.add(planetPoints);

  function markerPoint(color, size, tex) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    var m = new THREE.PointsMaterial({
      size: size, sizeAttenuation: false, color: color, map: tex || ringTex,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var p = new THREE.Points(g, m);
    p.frustumCulled = false;
    scene.add(p);
    return p;
  }
  var hoverMark = markerPoint(0xffffff, 17);
  var selMark = markerPoint(0xffe082, 30);
  hoverMark.visible = false; selMark.visible = false;

  /* ================= пересчёт позиций ================= */
  function remapArray(geom, base) {
    var arr = geom.attributes.position.array;
    for (var i = 0; i < arr.length; i += 3) {
      var x = base[i], y = base[i + 1], z = base[i + 2];
      var r = Math.sqrt(x * x + y * y + z * z);
      if (r < 1e-12) { arr[i] = x; arr[i + 1] = y; arr[i + 2] = z; continue; }
      var s = mapR(r) / r;
      arr[i] = x * s; arr[i + 1] = y * s; arr[i + 2] = z * s;
    }
    geom.attributes.position.needsUpdate = true;
  }

  function applyPositions() {
    var arr = planetGeom.attributes.position.array;
    for (var i = 0; i < N; i++) {
      var o = i * 3;
      if (!vis[i]) { arr[o] = 0; arr[o + 1] = 0; arr[o + 2] = -1e6; continue; }
      var x = basePos[o], y = basePos[o + 1], z = basePos[o + 2];
      var r = Math.sqrt(x * x + y * y + z * z);
      if (r < 1e-12) { arr[o] = x; arr[o + 1] = y; arr[o + 2] = z; continue; }
      var s = mapR(r) / r;
      arr[o] = x * s; arr[o + 1] = y * s; arr[o + 2] = z * s;
    }
    planetGeom.attributes.position.needsUpdate = true;
    for (var k = 0; k < remapList.length; k++) remapArray(remapList[k].geom, remapList[k].base);

    var gcp = new THREE.Vector3(GC, 0, 0);
    if (logMode) gcp.multiplyScalar(mapR(GC) / GC);
    gcGlow.position.copy(gcp); gcRing.position.copy(gcp);
    setPointPos(gcDot, gcp);
    if (selected >= 0 && hasDist[selected]) setPointPos(selMark, getPos(selected));
    if (hoverIdx >= 0 && hasDist[hoverIdx]) setPointPos(hoverMark, getPos(hoverIdx));
    updateStats();
  }

  function setPointPos(pt, v) {
    var a = pt.geometry.attributes.position.array;
    a[0] = v.x; a[1] = v.y; a[2] = v.z;
    pt.geometry.attributes.position.needsUpdate = true;
  }

  /* ================= фильтры ================= */
  var methodOn = GROUPS.map(function () { return true; });
  var yearFrom = MIN_YEAR;
  var showSingle = true, showMulti = true;

  function passes(i) {
    if (!hasDist[i]) return false;
    if (!methodOn[groupIdx[i]]) return false;
    var y = PLANETS[i].y;
    if (typeof y === 'number' && y < yearFrom) return false;
    var multi = (PLANETS[i].np || 1) > 1;
    if (multi && !showMulti) return false;
    if (!multi && !showSingle) return false;
    return true;
  }

  var statsEl = document.getElementById('stats');
  var visibleCount = 0;
  function updateVisibility() {
    visibleCount = 0;
    for (var i = 0; i < N; i++) { vis[i] = passes(i) ? 1 : 0; if (vis[i]) visibleCount++; }
    if (selected >= 0 && !vis[selected]) deselect();
    applyPositions();
  }
  function updateStats() {
    var totalMappable = 0;
    for (var i = 0; i < N; i++) if (hasDist[i]) totalMappable++;
    statsEl.innerHTML =
      'Показано <b>' + visibleCount + '</b> из <b>' + N + '</b> планет' +
      (N - totalMappable > 0 ? ' <span style="color:#6d82a8">· ' + (N - totalMappable) +
        ' без измеренного расстояния скрыты</span>' : '') +
      '<br><span style="color:#6d82a8">шкала: ' +
      (logMode ? 'логарифмическая (окрестность Солнца раздута)' : 'линейная, 1 единица = 1 кпк') + '</span>';
  }

  /* ================= интерфейс: легенда ================= */
  var counts = GROUPS.map(function () { return 0 });
  for (var ic = 0; ic < N; ic++) counts[groupIdx[ic]]++;

  var legendBox = document.getElementById('legendItems');
  GROUPS.forEach(function (g, idx) {
    var row = document.createElement('div');
    row.className = 'lg-item';
    row.innerHTML = '<span class="dot" style="background:' + g.color + ';color:' + g.color +
      '"></span><span class="name">' + g.ru + '</span><span class="cnt">' + counts[idx] + '</span>';
    row.addEventListener('click', function () {
      methodOn[idx] = !methodOn[idx];
      row.classList.toggle('off', !methodOn[idx]);
      updateVisibility();
    });
    legendBox.appendChild(row);
  });

  var yearRange = document.getElementById('yearRange');
  var yearValue = document.getElementById('yearValue');
  yearRange.min = MIN_YEAR; yearRange.max = MAX_YEAR; yearRange.value = MIN_YEAR;
  document.getElementById('yearMin').textContent = MIN_YEAR;
  document.getElementById('yearMax').textContent = MAX_YEAR;
  yearValue.textContent = MIN_YEAR;
  yearRange.addEventListener('input', function () {
    yearFrom = +yearRange.value;
    yearValue.textContent = yearFrom;
    updateVisibility();
  });
  document.getElementById('chSingle').addEventListener('change', function (e) {
    showSingle = e.target.checked; updateVisibility();
  });
  document.getElementById('chMulti').addEventListener('change', function (e) {
    showMulti = e.target.checked; updateVisibility();
  });

  document.getElementById('dataDate').textContent = window.PLANETS_UPDATED || '';
  document.getElementById('chLog').addEventListener('change', function (e) {
    logMode = e.target.checked;
    applyPositions();
  });

  /* ================= полёт камеры ================= */
  var fly = null;
  function startFly(target, dist, dir) {
    var d = dir ? dir.clone().normalize()
                : camera.position.clone().sub(controls.target).normalize();
    if (!isFinite(d.x) || d.lengthSq() < 1e-9) d.set(0, 0.42, 0.9);
    fly = {
      t0: performance.now(), dur: 1200,
      fromT: controls.target.clone(), toT: target.clone(),
      fromP: camera.position.clone(),
      toP: target.clone().add(d.multiplyScalar(dist))
    };
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  document.getElementById('btnGalaxyView').addEventListener('click', function () {
    startFly(new THREE.Vector3(GC * 0.9, 0, 0), 52, new THREE.Vector3(0.06, 0.34, 0.94));
  });
  document.getElementById('btnSunView').addEventListener('click', function () {
    startFly(new THREE.Vector3(0, 0, 0), logMode ? 9 : 1.6, new THREE.Vector3(0, 0.42, 0.9));
  });

  /* ================= выбор планеты ================= */
  var selected = -1;
  var popup = document.getElementById('popup');
  var popupBody = document.getElementById('popupBody');

  function num(v, d, unit) {
    if (v === undefined || v === null) return null;
    var s = (d === undefined || d === null) ? String(v) : v.toFixed(d);
    return s + (unit ? ' ' + unit : '');
  }
  function kv(k, v) {
    if (v === null || v === undefined || v === '') return '';
    return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  }
  function fmtDist(pc) {
    var ly = pc * LY_PER_PC;
    var lyTxt = ly < 10 ? ly.toFixed(2) : ly < 1000 ? ly.toFixed(1) : Math.round(ly).toLocaleString('ru-RU');
    var word = (function (n) {
      var a = n % 10, b = n % 100;
      if (a === 1 && b !== 11) return 'световой год';
      if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'световых года';
      return 'световых лет';
    })(Math.round(ly));
    return lyTxt + ' ' + word + ' <small>(' + (pc < 10 ? pc.toFixed(2) : Math.round(pc)) + ' пк)</small>';
  }
  function fmtRA(ra) {
    var h = ra / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m);
    return hh + 'ч ' + mm + 'м ' + ((m - mm) * 60).toFixed(1) + 'с';
  }
  function fmtDec(dec) {
    var sign = dec < 0 ? '−' : '+', a = Math.abs(dec);
    var dd = Math.floor(a), m = (a - dd) * 60, mm = Math.floor(m);
    return sign + dd + '° ' + mm + '′ ' + ((m - mm) * 60).toFixed(0) + '″';
  }
  function fmtMass(p) {
    if (typeof p.m === 'number') {
      var d = p.m >= 100 ? 0 : p.m >= 10 ? 1 : 2;
      var s = p.m.toFixed(d) + ' M⊕';
      if (typeof p.mj === 'number') s += ' <small>(' + (p.mj >= 10 ? p.mj.toFixed(1) : p.mj.toFixed(3)) + ' M♃)</small>';
      return s;
    }
    if (typeof p.mj === 'number') return p.mj.toFixed(3) + ' M♃';
    return null;
  }

  function buildPopup(i) {
    var p = PLANETS[i], g = GROUPS[groupIdx[i]];
    var html = '';
    html += '<h2>' + p.n + '</h2>';
    html += '<div class="host">Звезда: ' + (p.h || '—') + (p.sp ? ' · ' + p.sp : '') + '</div>';
    html += '<div class="chips">' +
      '<span class="chip" style="color:' + g.color + ';border-color:' + g.color + '">' +
      '<span class="dot"></span>' + g.ru + '</span>' +
      (typeof p.y === 'number' ? '<span class="chip" style="color:#9fb4d8;border-color:#3d5175">' + p.y + ' г.</span>' : '') +
      (p.np && p.np > 1 ? '<span class="chip" style="color:#9fb4d8;border-color:#3d5175">система: ' + p.np + ' планет</span>' : '') +
      '</div>';

    if (hasDist[i]) {
      html += '<div class="sec"><div class="sec-title">Планета</div>';
      html += kv('Расстояние', fmtDist(p.d));
      html += kv('Масса', fmtMass(p));
      html += kv('Радиус', num(p.r, 2, 'R⊕'));
      html += kv('Плотность', num(p.den, 2, 'г/см³'));
      html += kv('Температура равновесия', num(p.teq, 0, 'K'));
      html += kv('Освещённость', num(p.ins, p.ins > 100 ? 0 : 2, 'S⊕'));
      html += '</div>';

      html += '<div class="sec"><div class="sec-title">Орбита</div>';
      var per = null;
      if (typeof p.p === 'number') {
        per = (p.p >= 1000 ? Math.round(p.p).toLocaleString('ru-RU') :
               p.p >= 10 ? p.p.toFixed(1) : p.p.toFixed(3)) + ' д';
        if (p.p > 400) per += ' <small>(' + (p.p / 365.25).toFixed(1) + ' г)</small>';
      }
      html += kv('Период обращения', per);
      html += kv('Большая полуось', typeof p.a === 'number'
        ? (p.a < 0.1 ? p.a.toFixed(4) : p.a.toFixed(3)) + ' а.е.' : null);
      html += '</div>';

      html += '<div class="sec"><div class="sec-title">Координаты</div>';
      html += kv('Прямое восхождение', (p.ra !== undefined && p.dec !== undefined)
        ? fmtRA(p.ra) : null);
      html += kv('Склонение', (p.ra !== undefined && p.dec !== undefined)
        ? fmtDec(p.dec) : null);
      html += kv('Галактические', 'l = ' + (galL[i] * DEG).toFixed(1) + '°, b = ' +
        (galB[i] * DEG).toFixed(1) + '°');
      html += '</div>';
    } else {
      html += '<div class="note">Расстояние до звезды не измерено — планета не отображается на карте.</div>';
    }

    html += '<div class="sec"><div class="sec-title">Звезда</div>';
    html += kv('Спектральный тип', p.sp);
    html += kv('Температура', num(p.t, 0, 'K'));
    html += kv('Масса', num(p.sm, 2, 'M☉'));
    html += kv('Радиус', num(p.sr, 2, 'R☉'));
    html += kv('Возраст', num(p.age, 2, 'млрд лет'));
    html += kv('Видимая величина', num(p.v, 2, 'm<sub>V</sub>'));
    html += kv('Состав системы', p.ns ? p.ns + ' зв. · ' + (p.np || 1) + ' планет' : null);
    html += '</div>';

    html += '<div class="sec"><div class="sec-title">Открытие</div>';
    html += kv('Год', p.y);
    html += kv('Метод', p.me ? translateMethod(p.me) : null);
    html += kv('Обсерватория', p.f);
    html += '</div>';

    if (p.c) html += '<div class="note">⚠️ Параметры этой планеты оспариваются научным сообществом.</div>';

    if (hasDist[i]) {
      html += '<div class="actions"><button class="btn" data-act="fly">Приблизиться</button>' +
        '<a class="btn accent" target="_blank" rel="noopener" href="https://exoplanetarchive.ipac.caltech.edu/overview/' +
        encodeURIComponent(p.n) + '">Профиль в архиве</a></div>';
    }
    html += '<div class="src">Данные: <a target="_blank" rel="noopener" href="https://exoplanetarchive.ipac.caltech.edu/">' +
      'NASA Exoplanet Archive</a>, таблица PSCompPars · обновлено ' +
      (window.PLANETS_UPDATED || '—') + '</div>';
    return html;
  }

  var METHOD_RU = {
    'Transit': 'транзитный', 'Radial Velocity': 'лучевые скорости',
    'Microlensing': 'микролинзирование', 'Imaging': 'прямая визуализация',
    'Transit Timing Variations': 'вариации времени транзитов',
    'Eclipse Timing Variations': 'вариации времени затмений',
    'Pulsar Timing': 'пульсарный тайминг', 'Astrometry': 'астрометрия',
    'Orbital Brightness Modulation': 'модуляция блеска',
    'Pulsation Timing Variations': 'вариации пульсаций',
    'Disk Kinematics': 'кинематика диска'
  };
  function translateMethod(m) { return METHOD_RU[m] || m; }

  popupBody.addEventListener('click', function (e) {
    var act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (act === 'fly' && selected >= 0) flyToSelected();
  });
  document.getElementById('popupClose').addEventListener('click', deselect);

  function select(i, opts) {
    opts = opts || {};
    selected = i;
    popupBody.innerHTML = buildPopup(i);
    popup.classList.remove('hidden');
    selMark.visible = hasDist[i] === 1;
    if (selMark.visible) setPointPos(selMark, getPos(i));
    if (opts.fly && hasDist[i]) flyToSelected();
    updateStats();
  }
  function deselect() {
    selected = -1;
    popup.classList.add('hidden');
    selMark.visible = false;
  }
  function flyToSelected() {
    if (selected < 0 || !hasDist[selected]) return;
    startFly(getPos(selected), logMode ? 1.4 : 0.28, null);
  }
  function getPos(i) {
    var a = planetGeom.attributes.position.array, o = i * 3;
    return new THREE.Vector3(a[o], a[o + 1], a[o + 2]);
  }

  /* ================= поиск ================= */
  var searchIndex = {};
  for (var is = 0; is < N; is++) {
    var key = PLANETS[is].n.toLowerCase();
    if (!(key in searchIndex)) searchIndex[key] = is;
  }
  var searchInput = document.getElementById('searchInput');
  var datalistFilled = false;
  function fillDatalist() {
    if (datalistFilled) return;
    datalistFilled = true;
    var dl = document.getElementById('planetList');
    var frag = document.createDocumentFragment();
    for (var i = 0; i < N; i++) {
      var opt = document.createElement('option');
      opt.value = PLANETS[i].n;
      frag.appendChild(opt);
    }
    dl.appendChild(frag);
  }
  searchInput.addEventListener('focus', fillDatalist);

  function doSearch() {
    var q = searchInput.value.trim().toLowerCase();
    if (!q) return;
    var idx = searchIndex[q];
    if (idx === undefined) {
      for (var i = 0; i < N; i++) {
        if (PLANETS[i].n.toLowerCase().indexOf(q) === 0) { idx = i; break; }
      }
    }
    if (idx === undefined) {
      for (var j = 0; j < N; j++) {
        if (PLANETS[j].n.toLowerCase().indexOf(q) >= 0) { idx = j; break; }
      }
    }
    if (idx === undefined) {
      searchInput.style.borderColor = '#ff6b6b';
      setTimeout(function () { searchInput.style.borderColor = ''; }, 1200);
      return;
    }
    ensureVisible(idx);
    select(idx, { fly: hasDist[idx] === 1 });
  }
  function ensureVisible(i) {
    if (!hasDist[i]) return;
    if (!methodOn[groupIdx[i]]) {
      methodOn[groupIdx[i]] = true;
      legendBox.children[groupIdx[i]].classList.remove('off');
    }
    var y = PLANETS[i].y;
    if (typeof y === 'number' && y < yearFrom) {
      yearFrom = y; yearRange.value = y; yearValue.textContent = y;
    }
    var multi = (PLANETS[i].np || 1) > 1;
    if (multi && !showMulti) { showMulti = true; document.getElementById('chMulti').checked = true; }
    if (!multi && !showSingle) { showSingle = true; document.getElementById('chSingle').checked = true; }
    updateVisibility();
  }
  document.getElementById('btnSearch').addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') deselect(); });

  /* ================= указатель, наведение, клик ================= */
  var mouse = { x: -1, y: -1, dirty: false, down: null };
  renderer.domElement.addEventListener('pointermove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.dirty = true;
  });
  renderer.domElement.addEventListener('pointerdown', function (e) {
    mouse.down = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', function (e) {
    if (!mouse.down) return;
    var dx = e.clientX - mouse.down.x, dy = e.clientY - mouse.down.y;
    mouse.down = null;
    if (dx * dx + dy * dy > 36) return;            // это вращение, а не клик
    var idx = pick(e.clientX, e.clientY);
    if (idx >= 0) select(idx); else deselect();
  });
  renderer.domElement.addEventListener('dblclick', function (e) {
    var idx = pick(e.clientX, e.clientY);
    if (idx >= 0 && hasDist[idx]) { select(idx); flyToSelected(); }
  });

  var proj = new THREE.Vector3();
  function project(x, y, z, out) {
    proj.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    if (proj.z > -camera.near) { out.ok = false; return out; }
    out.depth = -proj.z;                            // расстояние до камеры, kpc
    proj.applyMatrix4(camera.projectionMatrix);
    out.z = proj.z;
    out.x = (proj.x * 0.5 + 0.5) * W;
    out.y = (-proj.y * 0.5 + 0.5) * H;
    out.ok = proj.z < 1 && out.x >= 0 && out.x <= W && out.y >= 0 && out.y <= H;
    return out;
  }
  var _p = { x: 0, y: 0, z: 0, depth: 0, ok: false };

  function pick(px, py) {
    var arr = planetGeom.attributes.position.array;
    var best = -1, bestD2 = Infinity, bestDepth = Infinity;
    var TH2 = 15 * 15;
    for (var i = 0; i < N; i++) {
      if (!vis[i]) continue;
      var o = i * 3;
      project(arr[o], arr[o + 1], arr[o + 2], _p);
      if (!_p.ok) continue;
      var dx = _p.x - px, dy = _p.y - py;
      var d2 = dx * dx + dy * dy;
      if (d2 > TH2) continue;                        // мимо курсора
      // ближайшая к курсору; при равенстве — та, что ближе к камере
      if (d2 < bestD2 - 1 || (Math.abs(d2 - bestD2) <= 1 && _p.depth < bestDepth)) {
        bestD2 = d2; bestDepth = _p.depth; best = i;
      }
    }
    return best;
  }

  var tooltip = document.getElementById('tooltip');
  var hoverIdx = -1;
  function updateHover() {
    if (mouse.x < 0) return;
    var idx = pick(mouse.x, mouse.y);
    if (idx !== hoverIdx) {
      hoverIdx = idx;
      if (idx >= 0) {
        var p = PLANETS[idx];
        tooltip.innerHTML = '<b>' + p.n + '</b>' +
          (hasDist[idx] ? '<span class="d">' + fmtDist(p.d).split(' <small>')[0] + '</span>' : '');
        tooltip.classList.remove('hidden');
        document.body.style.cursor = 'pointer';
      } else {
        tooltip.classList.add('hidden');
        document.body.style.cursor = '';
      }
    }
    if (hoverIdx >= 0) {
      tooltip.style.left = mouse.x + 'px';
      tooltip.style.top = mouse.y + 'px';
      tooltip.style.transform = (mouse.x > W - 290)
        ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)';
    }
    if (hoverIdx >= 0 && hasDist[hoverIdx]) {
      hoverMark.visible = true;
      setPointPos(hoverMark, getPos(hoverIdx));
    } else {
      hoverMark.visible = false;
    }
  }

  /* ================= подписи ================= */
  var labelLayer = document.getElementById('labelLayer');
  var sunLabel = document.getElementById('sunLabel');
  var gcLabel = document.getElementById('gcLabel');
  var labelPool = [];
  for (var il = 0; il < 26; il++) {
    var div = document.createElement('div');
    div.className = 'maplabel';
    div.style.display = 'none';
    labelLayer.appendChild(div);
    labelPool.push(div);
  }
  var chLabels = document.getElementById('chLabels');

  function placeLabel(el, x, y, show) {
    if (!show) { el.style.display = 'none'; return false; }
    el.style.display = '';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    return true;
  }

  function updateLabels() {
    var placed = [];
    // Солнце и центр Галактики
    var sunOk = project(0, 0, 0, _p) && _p.ok;
    var sunXY = { x: _p.x, y: _p.y };
    placeLabel(sunLabel, sunXY.x, sunXY.y, sunOk);
    if (sunOk) placed.push(sunXY);

    var gcp = gcGlow.position;
    var gcOk = project(gcp.x, gcp.y, gcp.z, _p) && _p.ok;
    var gcXY = { x: _p.x, y: _p.y };
    placeLabel(gcLabel, gcXY.x, gcXY.y, gcOk);
    if (gcOk) placed.push(gcXY);

    if (!chLabels.checked) {
      for (var z = 0; z < labelPool.length; z++) labelPool[z].style.display = 'none';
      return;
    }
    var limit = logMode ? 14 : 3.4;                 // предельная дистанция камеры, kpc
    var arr = planetGeom.attributes.position.array;
    var used = 0;
    var _q = { x: 0, y: 0, ok: false };
    for (var c = 0; c < sortedIdx.length && used < labelPool.length; c++) {
      var i = sortedIdx[c];
      if (!vis[i]) continue;
      var o = i * 3;
      var px = arr[o], py = arr[o + 1], pz = arr[o + 2];
      var dx = px - camera.position.x, dy = py - camera.position.y, dz = pz - camera.position.z;
      var camD = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (camD > limit) continue;                   // слишком далеко, чтобы подписать
      project(px, py, pz, _q);
      if (!_q.ok) continue;
      var clash = false;
      for (var s = 0; s < placed.length; s++) {
        var ddx = placed[s].x - _q.x, ddy = placed[s].y - _q.y;
        if (ddx * ddx + ddy * ddy < 62 * 62) { clash = true; break; }
      }
      if (clash) continue;
      var el = labelPool[used++];
      el.textContent = PLANETS[i].n;
      el.style.left = _q.x + 'px';
      el.style.top = (_q.y - 16) + 'px';
      el.style.display = '';
      placed.push({ x: _q.x, y: _q.y });
    }
    for (var u = used; u < labelPool.length; u++) labelPool[u].style.display = 'none';
  }

  /* ================= карточка: положение ================= */
  function updatePopupPos() {
    if (selected < 0) return;
    if (!hasDist[selected]) {                       // нет координат — по центру экрана
      popup.style.visibility = '';
      popup.style.left = Math.max(10, W / 2 - 165) + 'px';
      popup.style.top = '84px';
      return;
    }
    var pos = getPos(selected);
    var ok = project(pos.x, pos.y, pos.z, _p) && _p.ok;
    if (!ok) { popup.style.visibility = 'hidden'; return; }
    popup.style.visibility = '';
    var pw = popup.offsetWidth || 330, ph = popup.offsetHeight || 300;
    var x = _p.x + 22, y = _p.y - 30;
    if (x + pw > W - 12) x = _p.x - pw - 22;
    if (x < 12) x = 12;
    y = Math.max(76, Math.min(y, H - ph - 12));
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
  }

  /* ================= цикл отрисовки ================= */
  function animate(now) {
    requestAnimationFrame(animate);

    if (fly) {
      var k = Math.min(1, (now - fly.t0) / fly.dur), e = ease(k);
      controls.target.lerpVectors(fly.fromT, fly.toT, e);
      camera.position.lerpVectors(fly.fromP, fly.toP, e);
      if (k >= 1) fly = null;
    }
    controls.update();
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // динамические размеры маркеров
    var camD = camera.position.distanceTo(controls.target);
    var s = Math.max(0.02, camD * 0.035);
    sunRing.scale.set(s, s, s);
    gcRing.scale.set(s * 1.4, s * 1.4, s * 1.4);
    gcGlow.scale.set(Math.max(0.5, camD * 0.16), Math.max(0.5, camD * 0.16), 1);
    var pulse = 1 + Math.sin(now / 320) * 0.12;
    selMark.material.size = 30 * pulse;

    if (mouse.dirty) { mouse.dirty = false; updateHover(); }
    updateLabels();
    updatePopupPos();

    renderer.render(scene, camera);
  }

  /* ================= открытый API (для отладки и скриптов) ================= */
  window.ExoMap = {
    THREE: THREE, scene: scene, camera: camera, renderer: renderer, controls: controls,
    planetCount: N,
    stats: function () {
      var withDist = 0;
      for (var i = 0; i < N; i++) if (hasDist[i]) withDist++;
      return { total: N, visible: visibleCount, withDistance: withDist, logScale: logMode };
    },
    find: function (name) {
      var k = String(name).trim().toLowerCase();
      if (searchIndex[k] !== undefined) return searchIndex[k];
      for (var i = 0; i < N; i++) if (PLANETS[i].n.toLowerCase().indexOf(k) === 0) return i;
      return -1;
    },
    select: function (name) {
      var i = this.find(name);
      if (i < 0) return false;
      ensureVisible(i);
      select(i, { fly: hasDist[i] === 1 });
      return true;
    },
    deselect: deselect,
    pick: pick,
    projectIndex: function (i) {
      var arr = planetGeom.attributes.position.array, o = i * 3;
      project(arr[o], arr[o + 1], arr[o + 2], _p);
      return { ok: _p.ok, x: _p.x, y: _p.y, depth: _p.depth, vis: vis[i], w: W, h: H,
               pos: [arr[o], arr[o + 1], arr[o + 2]] };
    },
    getSelected: function () { return selected >= 0 ? PLANETS[selected].n : null; },
    setLogScale: function (v) {
      logMode = !!v;
      document.getElementById('chLog').checked = logMode;
      applyPositions();
    },
    isPopupOpen: function () { return !popup.classList.contains('hidden'); }
  };

  /* ================= старт ================= */
  window.addEventListener('resize', function () {
    W = window.innerWidth; H = window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  });

  updateVisibility();
  requestAnimationFrame(animate);
  setTimeout(function () { document.getElementById('loader').classList.add('done'); }, 350);
})();
