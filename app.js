/* 交互式世界地图 —— 无第三方依赖，纯 SVG + 原生 JS */
(function () {
  'use strict';

  var D = window.MAP_DATA;
  if (!D) { console.error('MAP_DATA 未加载'); return; }

  var W = 1000, H = 520, RAD = Math.PI / 180;
  var language = window.MAP_I18N.initialLanguage();
  var t = function (key, values) { return window.MAP_I18N.t(language, key, values); };
  var nf = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN');
  var englishCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

  var svg = document.getElementById('map');
  var stage = document.getElementById('stage');
  var tipEl = document.getElementById('tooltip');
  var panelEl = document.getElementById('panel');
  var legendEl = document.getElementById('legend');
  var searchEl = document.getElementById('search');
  var suggestEl = document.getElementById('suggest');
  var modesEl = document.getElementById('modes');
  var projEl = document.getElementById('projbtns');
  var mapModesEl = document.getElementById('mapmodes');

  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ============================================================ 投影 */
  var EE = { A1: 1.340264, A2: -0.081106, A3: 0.000893, A4: 0.003796 };
  var PROJECTIONS = {
    ee: {
      label: '等地球',
      title: 'Equal Earth 等地球投影',
      fn: function (lon, lat) {
        var t = Math.asin(Math.sqrt(3) / 2 * Math.sin(lat * RAD));
        var t2 = t * t, t6 = t2 * t2 * t2, t8 = t6 * t2;
        var x = (2 * Math.sqrt(3) * lon * RAD * Math.cos(t)) /
                (3 * (EE.A1 + 3 * EE.A2 * t2 + 7 * EE.A3 * t6 + 9 * EE.A4 * t8));
        var y = t * (EE.A1 + EE.A2 * t2 + EE.A3 * t6 + EE.A4 * t8);
        return [x, y];
      }
    },
    mercator: {
      label: '墨卡托',
      title: 'Web Mercator 墨卡托投影',
      fn: function (lon, lat) {
        var la = Math.max(-85, Math.min(85, lat)) * RAD;
        return [lon * RAD, Math.log(Math.tan(Math.PI / 4 + la / 2))];
      }
    },
    plate: {
      label: '等距圆柱',
      title: 'Equirectangular 等距圆柱投影',
      fn: function (lon, lat) { return [lon * RAD, lat * RAD]; }
    }
  };

  /* ============================================================ 几何数据 */
  var shapes = D.geo.map(function (g) {
    var info = D.countries[g.id] || {};
    return {
      key: String(g.id),
      name: g.name,
      info: info,
      rings: g.rings,
      path: '',
      cx: 0, cy: 0, bw: 0, bh: 0, size: 0
    };
  });
  var byKey = {};
  shapes.forEach(function (s) { byKey[s.key] = s; });

  var byCca3 = {};
  shapes.forEach(function (s) { if (s.info.cca3) byCca3[s.info.cca3] = s; });

  var shapesG = el('g', { id: 'shapes' });
  var gridG = el('g', { id: 'grid' });
  var labelsG = el('g', { class: 'labels' });
  var worldG = el('g', { id: 'world' });
  worldG.appendChild(gridG);
  worldG.appendChild(shapesG);
  var subG = el('g', { id: 'sublayer' });
  worldG.appendChild(subG);
  var subLabelsG = el('g', { class: 'labels' });
  worldG.appendChild(labelsG);
  worldG.appendChild(subLabelsG);
  svg.appendChild(worldG);

  var pathEls = {}, labelEls = {}, hitEls = {}, hitBaseR = {};

  shapes.forEach(function (s) {
    var p = el('path', { class: 'country', 'data-key': s.key });
    pathEls[s.key] = p;
    shapesG.appendChild(p);

    var t = el('text', { 'data-key': s.key });
    labelEls[s.key] = t;
    labelsG.appendChild(t);
  });

  /* ============ 三种地图模式：世界 / 中国 / 美国 ============ */
  var SUB = window.MAP_SUB || {};
  var MODES = {
    world: { key: 'world', label: '世界', title: '世界地图', icon: '🌍', level: '国家' },
    cn: { key: 'cn', label: '中国', title: '中国地图', icon: '🇨🇳', level: '省', pack: SUB.CHN },
    us: { key: 'us', label: '美国', title: '美国地图', icon: '🇺🇸', level: '州', pack: SUB.USA }
  };
  var mapMode = 'world';
  var subShapes = [];              // 省 / 州 图层
  var subByKey = {};
  var subPathEls = {}, subLabelEls = {};
  var selectedSubKey = null;

  function modePack() { return MODES[mapMode] ? MODES[mapMode].pack : null; }
  function isProvinceMode() { return mapMode !== 'world' && !!modePack(); }
  function modeBox() { var p = modePack(); return p && p.view ? p.view : null; }
  function provincePacks() {
    var out = [];
    ['cn', 'us'].forEach(function (m) {
      if (MODES[m].pack) out.push({ mode: m, pack: MODES[m].pack });
    });
    return out;
  }

  // 参与取景的经纬环：省 / 州模式下只取“本土”（center 落在 view 框内），
  // 阿拉斯加、夏威夷、南海诸岛不参与，避免画面被离岛撑大
  function provinceFitRings() {
    var pack = modePack();
    if (!pack) return null;
    var box = pack.view, rings = [];
    pack.divisions.forEach(function (d) {
      if (box) {
        var c = d.center || [0, 0];
        if (c[0] < box[0] - 0.6 || c[0] > box[2] + 0.6 ||
            c[1] < box[1] - 0.6 || c[1] > box[3] + 0.6) return;
      }
      for (var i = 0; i < d.rings.length; i++) rings.push(d.rings[i]);
    });
    return rings.length ? rings : null;
  }

  /* ============================================================ 布局计算 */
  var layout = { s: 1, ox: 0, oy: 0 };
  var projKey = 'ee';

  function computeLayout(key) {
    var fn = PROJECTIONS[key].fn;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    var i, j, k, ring, pt, L = shapes.length;

    // 中国 / 美国模式：只按取景框内的省 / 州取景（阿拉斯加、夏威夷、南海诸岛不参与），
    // 这样本土永远铺满画布，不会因为个别离岛把画面撑大
    var fit = provinceFitRings();
    if (fit) {
      for (i = 0; i < fit.length; i++) {
        ring = fit[i];
        for (k = 0; k < ring.length; k += 2) {
          pt = fn(ring[k], ring[k + 1]);
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        }
      }
    } else {
      for (i = 0; i < L; i++) {
        var rings = shapes[i].rings;
        for (j = 0; j < rings.length; j++) {
          ring = rings[j];
          for (k = 0; k < ring.length; k += 2) {
            pt = fn(ring[k], ring[k + 1]);
            if (pt[0] < minX) minX = pt[0];
            if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1];
            if (pt[1] > maxY) maxY = pt[1];
          }
        }
      }
    }
    var bw = maxX - minX || 1, bh = maxY - minY || 1;
    // 省 / 州模式：把画布宽度调成内容的宽高比（中国接近方形），避免左右大片留白
    if (fit) {
      W = Math.max(420, Math.min(1500, Math.round(H * bw / bh)));
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    } else if (W !== 1000) {
      W = 1000;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    }
    var s = Math.min(W / bw, H / bh) * (fit ? 0.97 : 0.96);
    // SVG 的 y 轴向下 → 纬度必须翻转：screenY = oy - py * s
    var ox = (W - bw * s) / 2 - minX * s;
    var oy = (H - bh * s) / 2 + maxY * s;
    layout = { s: s, ox: ox, oy: oy, minX: minX, minY: minY, bw: bw, bh: bh };

    // 生成路径 & 每国包围盒
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    for (i = 0; i < L; i++) {
      var sh = shapes[i];
      var d = '';
      var cMinX = 1e9, cMaxX = -1e9, cMinY = 1e9, cMaxY = -1e9;
      var bigArea = -1, bigCx = 0, bigCy = 0;
      for (j = 0; j < sh.rings.length; j++) {
        ring = sh.rings[j];
        var rMinX = 1e9, rMaxX = -1e9, rMinY = 1e9, rMaxY = -1e9;
        var first = true;
        for (k = 0; k < ring.length; k += 2) {
          pt = fn(ring[k], ring[k + 1]);
          var x = r2(pt[0] * s + ox);
          var y = r2(oy - pt[1] * s);
          d += (first ? 'M' : 'L') + x + ' ' + y;
          first = false;
          if (x < rMinX) rMinX = x; if (x > rMaxX) rMaxX = x;
          if (y < rMinY) rMinY = y; if (y > rMaxY) rMaxY = y;
          if (x < cMinX) cMinX = x; if (x > cMaxX) cMaxX = x;
          if (y < cMinY) cMinY = y; if (y > cMaxY) cMaxY = y;
        }
        d += 'Z';
        var area = (rMaxX - rMinX) * (rMaxY - rMinY);
        if (area > bigArea) { bigArea = area; bigCx = (rMinX + rMaxX) / 2; bigCy = (rMinY + rMaxY) / 2; }
      }
      sh.path = d;
      sh.cx = bigCx; sh.cy = bigCy;
      sh.bw = cMaxX - cMinX; sh.bh = cMaxY - cMinY;
      sh.size = Math.max(sh.bw, sh.bh);
    }

    for (i = 0; i < L; i++) {
      pathEls[shapes[i].key].setAttribute('d', shapes[i].path);
    }
    buildGraticule(key);
    buildHits();
  }

  // 经纬网
  function buildGraticule(key) {
    var fn = PROJECTIONS[key].fn, s = layout.s, ox = layout.ox, oy = layout.oy;
    var d = '';
    var lon, lat, i, p, first;
    for (lon = -180; lon <= 180; lon += 30) {
      first = true;
      for (lat = -90; lat <= 90; lat += 3) {
        p = fn(lon, lat);
        d += (first ? 'M' : 'L') + (p[0] * s + ox).toFixed(1) + ' ' + (oy - p[1] * s).toFixed(1);
        first = false;
      }
    }
    for (lat = -60; lat <= 60; lat += 30) {
      first = true;
      for (lon = -180; lon <= 180; lon += 3) {
        p = fn(lon, lat);
        d += (first ? 'M' : 'L') + (p[0] * s + ox).toFixed(1) + ' ' + (oy - p[1] * s).toFixed(1);
        first = false;
      }
    }
    gridG.innerHTML = '';
    gridG.appendChild(el('path', { class: 'ocean-line', d: d, 'vector-effect': 'non-scaling-stroke' }));
  }

  // 微小国家补一个可点击圆点（半径随缩放归一，屏幕上始终约 4px）
  function buildHits() {
    Object.keys(hitEls).forEach(function (k) {
      hitEls[k].remove();
      delete hitEls[k];
    });
    shapes.forEach(function (s) {
      if (s.size < 9) {
        var baseR = Math.max(3.2, s.size / 2 + 1.6);
        var c = el('circle', {
          class: 'hit', cx: s.cx, cy: s.cy, r: baseR.toFixed(2),
          'data-key': s.key
        });
        hitBaseR[s.key] = baseR;
        hitEls[s.key] = c;
        shapesG.appendChild(c);
      }
    });
    syncHitRadius();
  }

  function syncHitRadius() {
    var inv = 1 / view.k;
    for (var k in hitEls) {
      var base = hitBaseR[k];
      if (base) hitEls[k].setAttribute('r', (base * inv).toFixed(2));
    }
  }

  /* ============================================================ 下钻：省 / 州 */
  // 用当前投影把一组经纬环转成路径 + 包围盒
  function shapeGeometry(rings) {
    var fn = PROJECTIONS[projKey].fn, s = layout.s, ox = layout.ox, oy = layout.oy;
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    var d = '', cMinX = 1e9, cMaxX = -1e9, cMinY = 1e9, cMaxY = -1e9;
    var bigArea = -1, bcx = 0, bcy = 0;
    for (var j = 0; j < rings.length; j++) {
      var ring = rings[j];
      var rMinX = 1e9, rMaxX = -1e9, rMinY = 1e9, rMaxY = -1e9, first = true;
      for (var k = 0; k < ring.length; k += 2) {
        var pt = fn(ring[k], ring[k + 1]);
        var x = r2(pt[0] * s + ox);
        var y = r2(oy - pt[1] * s);
        d += (first ? 'M' : 'L') + x + ' ' + y;
        first = false;
        if (x < rMinX) rMinX = x; if (x > rMaxX) rMaxX = x;
        if (y < rMinY) rMinY = y; if (y > rMaxY) rMaxY = y;
        if (x < cMinX) cMinX = x; if (x > cMaxX) cMaxX = x;
        if (y < cMinY) cMinY = y; if (y > cMaxY) cMaxY = y;
      }
      d += 'Z';
      var area = (rMaxX - rMinX) * (rMaxY - rMinY);
      if (area > bigArea) { bigArea = area; bcx = (rMinX + rMaxX) / 2; bcy = (rMinY + rMaxY) / 2; }
    }
    return {
      d: d, cx: bcx, cy: bcy,
      bw: cMaxX - cMinX, bh: cMaxY - cMinY,
      size: Math.max(cMaxX - cMinX, cMaxY - cMinY)
    };
  }

  function buildSubLayer() {
    subG.innerHTML = '';
    subLabelsG.innerHTML = '';
    subPathEls = {}; subLabelEls = {}; subShapes = []; subByKey = {};
    var pack = modePack();
    if (!pack) return;
    pack.divisions.forEach(function (dv) {
      var g = shapeGeometry(dv.rings);
      dv.path = g.d;
      subShapes.push({
        key: String(dv.id), name: dv.name, info: dv, path: g.d,
        cx: g.cx, cy: g.cy, bw: g.bw, bh: g.bh, size: g.size,
        label: dv.short || dv.name
      });
      subByKey[String(dv.id)] = subShapes[subShapes.length - 1];

      var p = el('path', { class: 'sub', 'data-key': String(dv.id), 'data-sub': '1', d: g.d });
      subPathEls[String(dv.id)] = p;
      subG.appendChild(p);

      var t = el('text', { 'data-key': String(dv.id) });
      subLabelEls[String(dv.id)] = t;
      subLabelsG.appendChild(t);
    });
  }

  // 切换地图模式：world / cn / us
  function setMode(mode, opts) {
    opts = opts || {};
    if (!MODES[mode] || (mode !== 'world' && !MODES[mode].pack)) mode = 'world';
    mapMode = mode;
    selectedKey = null;
    selectedSubKey = null;
    hoverShape(null);
    if (pathEls[selectedKey]) pathEls[selectedKey].classList.remove('sel');
    computeLayout(projKey);        // 按模式重新取景并重建国界层
    buildSubLayer();               // 省 / 州 层（世界模式为空）
    syncModeButtons();
    resetView();
    paint();
    renderPanel();
    renderLabels();
    if (!opts.keepHash) setHash(null);
  }

  function resetView() {
    if (flying) { cancelAnimationFrame(flying.raf); flying = null; }
    svg.classList.remove('flying');
    view.x = 0; view.y = 0; view.k = 1;
    clampView();
    applyView();
  }

  // 当前着色/榜单作用的对象集合
  function metricItems() { return isProvinceMode() ? subShapes : shapes; }

  /* ============================================================ 数值格式 */
  function fmtInt(v) { return nf.format(Math.round(v)); }
  function fmtCompact(v) {
    if (v == null || !isFinite(v)) return '—';
    if (language === 'en') return englishCompact.format(v);
    if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
    if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
    return nf.format(Math.round(v));
  }
  function fmtArea(v) {
    if (v == null || !isFinite(v)) return '—';
    if (language === 'en') return englishCompact.format(v);
    if (v >= 1e6) return (v / 1e4).toFixed(0) + '万';
    return nf.format(Math.round(v));
  }
  function density(info) {
    if (!info.pop || !info.area) return null;
    return info.pop / info.area;
  }
  // 大额金额：万亿 / 亿
  function fmtMoney(v) {
    if (v == null || !isFinite(v)) return '—';
    if (language === 'en') return englishCompact.format(v);
    if (v >= 1e12) return (v / 1e12).toFixed(2) + '万亿';
    if (v >= 1e8) return (v / 1e8).toFixed(1) + '亿';
    return nf.format(Math.round(v));
  }

  // 全球合计（用于占比）
  var WORLD = { pop: 0, gdp: 0, area: 0 };
  shapes.forEach(function (s) {
    if (s.info.pop) WORLD.pop += s.info.pop;
    if (s.info.gdpTotal) WORLD.gdp += s.info.gdpTotal;
    if (s.info.area) WORLD.area += s.info.area;
  });

  /* ============================================================ 指标与配色 */
  var METRICS = {
    none: { label: '默认', unit: '', get: function () { return null; }, fmt: function () { return ''; } },
    pop: { label: '人口', unit: '人', get: function (c) { return c.pop; }, fmt: fmtCompact },
    area: { label: '面积', unit: 'km²', get: function (c) { return c.area; }, fmt: fmtArea },
    density: { label: '密度', unit: '人/km²', get: density, fmt: function (v) { return nf.format(Math.round(v)); } },
    gdpTotal: { label: 'GDP', unit: '美元', get: function (c) { return c.gdpTotal; }, fmt: fmtMoney },
    gdp: { label: '人均GDP', unit: '美元', get: function (c) { return c.gdp; }, fmt: function (v) { return nf.format(Math.round(v)); } }
  };
  var PALETTE = ['#13264a', '#1c3970', '#285199', '#3870bf', '#5c93e7', '#85b5f4', '#bddcff'];
  var scale = null;
  var metricKey = 'none';

  function buildScale(key) {
    var m = METRICS[key];
    if (!m || key === 'none') { scale = null; return; }
    var vals = [];
    metricItems().forEach(function (s) {
      var v = m.get(s.info);
      if (v != null && isFinite(v) && v > 0) vals.push(v);
    });
    vals.sort(function (a, b) { return a - b; });
    if (!vals.length) { scale = null; return; }
    var n = PALETTE.length;
    var breaks = [];
    for (var i = 1; i < n; i++) {
      var q = vals[Math.min(vals.length - 1, Math.floor(vals.length * i / n))];
      breaks.push(q);
    }
    scale = { breaks: breaks, min: vals[0], max: vals[vals.length - 1] };
  }

  function colorOf(info) {
    if (!scale) return null;
    var m = METRICS[metricKey];
    var v = m.get(info);
    if (v == null || !isFinite(v) || v <= 0) return null;
    var i = 0;
    while (i < scale.breaks.length && v >= scale.breaks[i]) i++;
    return PALETTE[i];
  }

  function paint() {
    var provinceMode = isProvinceMode();
    // 国家层：省/州模式下作为暗色地理底衬，不参与交互
    shapes.forEach(function (s) {
      var p = pathEls[s.key];
      p.classList.toggle('context', provinceMode);
      if (provinceMode) { p.style.fill = ''; p.classList.remove('nodata'); return; }
      var c = colorOf(s.info);
      if (metricKey === 'none') {
        p.style.fill = '';
        p.classList.remove('nodata');
      } else if (c) {
        p.style.fill = c;
        p.classList.remove('nodata');
      } else {
        p.style.fill = '#0b162c';
        p.classList.add('nodata');
      }
      if (p.classList.contains('sel')) p.style.fill = '';
    });
    if (selectedKey && pathEls[selectedKey]) pathEls[selectedKey].style.fill = '';

    // 省 / 州 层
    subShapes.forEach(function (d) {
      var p = subPathEls[d.key];
      if (!p) return;
      var c = colorOf(d.info);
      if (metricKey === 'none') {
        p.style.fill = '';
        p.classList.remove('nodata');
      } else if (c) {
        p.style.fill = c;
        p.classList.remove('nodata');
      } else {
        p.style.fill = '#0b162c';
        p.classList.add('nodata');
      }
      if (p.classList.contains('sel')) p.style.fill = '';
    });
    if (selectedSubKey && subPathEls[selectedSubKey]) {
      subPathEls[selectedSubKey].style.fill = '';
    }

    renderLegend();
    renderRank();
  }

  /* ============================================================ 视图变换 */
  var view = { x: 0, y: 0, k: 1 };
  function applyView() {
    worldG.setAttribute('transform',
      'translate(' + view.x.toFixed(2) + ' ' + view.y.toFixed(2) + ') scale(' + view.k.toFixed(4) + ')');
    updateLabels();
  }
  function clampView() {
    var minX = W - W * view.k, minY = H - H * view.k;
    if (view.k <= 1) { view.x = 0; view.y = 0; view.k = 1; return; }
    view.x = Math.max(minX, Math.min(0, view.x));
    view.y = Math.max(minY, Math.min(0, view.y));
  }
  function toView(clientX, clientY) {
    var m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var inv = m.inverse();
    var p = new DOMPoint(clientX, clientY).matrixTransform(inv);
    return { x: p.x, y: p.y };
  }
  function zoomAt(px, py, factor) {
    if (!isFinite(px) || !isFinite(py) || !isFinite(factor) || factor <= 0) return;
    var k2 = Math.max(1, Math.min(90, view.k * factor));
    if (!isFinite(k2) || Math.abs(k2 - view.k) < 1e-6) return;
    view.x = px - (px - view.x) * (k2 / view.k);
    view.y = py - (py - view.y) * (k2 / view.k);
    view.k = k2;
    clampView();
    applyView();
  }

  var flying = null;
  function flyTo(target, ms) {
    ms = ms || 460;
    if (flying) cancelAnimationFrame(flying.raf);
    var start = { x: view.x, y: view.y, k: view.k }, t0 = performance.now();
    svg.classList.add('flying');
    flying = { raf: 0 };
    (function step(now) {
      var t = Math.min(1, (now - t0) / ms);
      var e = 1 - Math.pow(1 - t, 3);
      view.k = start.k + (target.k - start.k) * e;
      view.x = start.x + (target.x - start.x) * e;
      view.y = start.y + (target.y - start.y) * e;
      clampView();
      applyView();
      if (t < 1) { flying.raf = requestAnimationFrame(step); }
      else { flying = null; svg.classList.remove('flying'); }
    })(t0);
  }

  function zoomToShape(s, pad) {
    if (!s) return;
    pad = pad == null ? 0.55 : pad;
    var bw = Math.max(s.bw, 3), bh = Math.max(s.bh, 3);
    var k = Math.min(W / bw, H / bh) * (1 - pad);
    k = Math.max(1.35, Math.min(60, k));
    var cx = s.cx, cy = s.cy;
    flyTo({ k: k, x: W / 2 - k * cx, y: H / 2 - k * cy });
  }

  /* ============================================================ 标签 */
  var labelRaf = 0;
  var LABEL_PX = 10;      // 标签在屏幕上的字号（px）
  var HALO_PX = 3;        // 文字描边在屏幕上的宽度（px）

  function updateLabels() {
    if (labelRaf) return;
    labelRaf = requestAnimationFrame(function () {
      labelRaf = 0;
      renderLabels();
    });
  }

  // 返回本次实际画出的标签框（供测试/调试）
  function renderLabels() {
    var k = view.k;
    var px = LABEL_PX + Math.min(5, Math.max(0, Math.log(k / 3) * 3.6));  // 屏幕字号
    var fs = px / k;                // 换算成 viewBox 单位
    syncHitRadius();

    // 下钻时给省/州打标签（门槛更低，字号更大）
    var sub = isProvinceMode();
    var items = sub ? subShapes : shapes;
    var els = sub ? subLabelEls : labelEls;
    var minSize = sub ? 22 : 42;
    if (sub) { px += 1.5; fs = px / k; }

    // 可视区域（viewBox 坐标）：只给窗口内的对象挂标签，避免离屏对象占用配额
    var vx0 = -view.x / k - 24, vx1 = (W - view.x) / k + 24;
    var vy0 = -view.y / k - 24, vy1 = (H - view.y) / k + 24;

    // 候选：在视口内、够大、有名字；按面积从大到小，优先保住大对象
    var cands = [];
    if (k >= 2.2 || sub) {
      for (var i = 0; i < items.length; i++) {
        var s = items[i];
        var txt0 = placeName(s, true);
        if (!txt0 || s.size * k <= minSize) continue;
        if (s.cx < vx0 || s.cx > vx1 || s.cy < vy0 || s.cy > vy1) continue;
        cands.push(s);
      }
      cands.sort(function (a, b) { return b.size - a.size; });
    }

    var placed = [], shown = {}, MAX_LABELS = 60;
    for (var j = 0; j < cands.length && placed.length < MAX_LABELS; j++) {
      var c = cands[j], txt = placeName(c, true);
      // 中文按 1em、西文按 0.6em 估算宽度
      var chars = 0;
      for (var q = 0; q < txt.length; q++) chars += txt.charCodeAt(q) > 255 ? 1 : 0.6;
      var bw = chars * fs + fs * 0.5, bh = fs * 1.25;
      var box = { x: c.cx - bw / 2, y: c.cy - bh / 2, w: bw, h: bh };
      var clash = false;
      for (var m = 0; m < placed.length; m++) {
        var p = placed[m];
        if (box.x < p.x + p.w && box.x + box.w > p.x &&
            box.y < p.y + p.h && box.y + box.h > p.y) { clash = true; break; }
      }
      if (clash) continue;
      placed.push(box);
      shown[c.key] = 1;

      var t = els[c.key] || subLabelEls[c.key] || labelEls[c.key];
      if (!t) continue;
      if (t.textContent !== txt) t.textContent = txt;
      t.setAttribute('x', c.cx);
      t.setAttribute('y', c.cy);
      // 必须用内联样式：SVG 呈现属性会被 CSS 规则覆盖（否则描边随缩放放大成黑块）
      t.style.fontSize = fs + 'px';
      t.style.strokeWidth = (HALO_PX / k) + 'px';
      t.classList.add('show');
    }

    // 未入选的标签隐藏（两层都清，切换层时不会残留）
    var n;
    for (n = 0; n < shapes.length; n++) {
      var k1 = shapes[n].key;
      if (!shown[k1] && labelEls[k1]) labelEls[k1].classList.remove('show');
    }
    for (n = 0; n < subShapes.length; n++) {
      var k2 = subShapes[n].key;
      if (!shown[k2] && subLabelEls[k2]) subLabelEls[k2].classList.remove('show');
    }
    return placed;
  }

  /* ============================================================ 悬停卡片 */
  var hoverKey = null;

  // 省 / 州卡片
  function subTooltipHTML(item) {
    var d = item.info, den = density(d);
    var pack = modePack() || {};
    var h = '';
    h += '<div class="tt-head">';
    h += '<div class="tt-flag">' + (pack.key === '156' ? '🇨🇳' : '🇺🇸') + '</div>';
    h += '<div class="tt-names"><div class="tt-zh">' + esc(placeName({ info: d })) + '</div>';
    h += '</div>';
    h += '<div class="tt-iso">' + esc(t(pack.level || '')) + '</div>';
    h += '</div>';
    h += '<div class="tt-stats">';
    h += stat(d.pop != null ? fmtCompact(d.pop) : '—', d.pop != null ? t("人") : '',
      t("人口") + (d.popYear ? ' ' + d.popYear : ''));
    h += stat(d.area != null ? fmtArea(d.area) : '—', d.area != null ? 'km²' : '', t("面积"));
    h += stat(den != null ? nf.format(Math.round(den)) : '—', den != null ? t("人/km²") : '', t("人口密度"));
    h += stat(d.pop != null && pack.key === '156' && byKey['156'].info.pop
      ? (d.pop / byKey['156'].info.pop * 100).toFixed(1) : '—', '%', t("占全国人口"));
    h += '</div>';
    h += '<div class="tt-grid" style="margin-top:10px">';
    h += kv(pack.key === '156' ? t("省会") : t("首府"), t(d.capital || '—'));
    h += kv(t("所属"), t(pack.name || ''));
    h += kv(t("人口"), d.pop != null ? fmtInt(d.pop) + t(" 人") : t("无数据"));
    h += kv(t("面积"), d.area != null ? fmtInt(d.area) + ' km²' : t("无数据"));
    h += kv(t("中心坐标"), d.center ? d.center[0].toFixed(2) + '°, ' + d.center[1].toFixed(2) + '°' : '—');
    h += '</div>';
    h += ('<div class="tt-foot"><span class="dot">●</span>' + t("点击固定信息 · Esc 清除选中") + '</div>');
    return h;
  }

  function tooltipHTML(s) {
    if (isProvinceMode() && subByKey[s.key]) return subTooltipHTML(s);
    var i = s.info;
    var den = density(i);
    var h = '';
    h += '<div class="tt-head">';
    h += '<div class="tt-flag">' + (i.flag || '🏳️') + '</div>';
    h += '<div class="tt-names"><div class="tt-zh">' + esc(placeName(s)) + '</div>';
    h += '</div>';
    if (i.cca3) h += '<div class="tt-iso">' + esc(i.cca3) + '</div>';
    h += '</div>';
    h += '<div class="tt-stats">';
    h += stat(i.pop != null ? fmtCompact(i.pop) : '—', i.pop != null ? t("人") : '', t("人口 ") + D.meta.popYear);
    h += stat(i.area != null ? fmtArea(i.area) : '—', i.area != null ? 'km²' : '', t("面积"));
    h += stat(den != null ? nf.format(Math.round(den)) : '—', den != null ? t("人/km²") : '', t("人口密度"));
    h += stat(i.gdpTotal != null ? fmtMoney(i.gdpTotal) : '—', i.gdpTotal != null ? t("美元") : '',
      t("GDP 总量 ") + D.meta.gdpYear);
    h += '</div>';
    h += '<div class="tt-grid" style="margin-top:10px">';
    h += kv(t("首都"), i.capital || '—');
    h += kv(t("地区"), [t(i.region), t(i.subregion)].filter(Boolean).join(' · ') || '—');
    h += kv(t("人口"), i.pop != null ? fmtInt(i.pop) + t(" 人") : t("无数据"));
    h += kv(t("面积"), i.area != null ? fmtInt(i.area) + ' km²' : t("无数据"));
    h += kv(t("GDP 总量"), i.gdpTotal != null ? fmtInt(i.gdpTotal) + t(" 美元") : t("无数据"));
    h += kv(t("人均GDP"), i.gdp != null ? fmtInt(i.gdp) + t(" 美元") : t("无数据"));
    h += kv(t("占全球 GDP"), i.gdpTotal != null && WORLD.gdp ? (i.gdpTotal / WORLD.gdp * 100).toFixed(2) + ' %' : '—');
    h += kv(t("语言"), localizedLanguages(i.languages) || '—');
    h += kv(t("货币"), localizedCurrency(i.currency) || '—');
    h += '</div>';
    h += '<div class="tt-foot"><span class="dot">●</span>' +
      (t("点击固定信息 · 滚轮继续缩放") + '</div>');
    return h;
  }

  function stat(n, unit, label) {
    return '<div class="tt-stat"><div class="n">' + n + (unit ? '<small>' + unit + '</small>' : '') +
      '</div><div class="l">' + label + '</div></div>';
  }
  function kv(k, v) {
    return '<div class="k">' + k + '</div><div class="v">' + esc(String(v)) + '</div>';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function placeTooltip(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = clientX - r.left + 16, y = clientY - r.top + 16;
    if (x + w > r.width - 8) x = clientX - r.left - w - 16;
    if (y + h > r.height - 8) y = Math.max(8, r.height - h - 8);
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }

  // 卡片定位到对象中心（用于键盘/侧栏/演示等无指针场景）
  function anchorTip(key) {
    var s = subByKey[key] || byKey[key];
    if (!s) return;
    var ctm = worldG.getScreenCTM();
    if (!ctm) return;
    var p = new DOMPoint(s.cx, s.cy).matrixTransform(ctm);
    placeTooltip(p.x, p.y);
  }

  function hoverShape(key, clientX, clientY) {
    if (hoverKey === key) {
      if (!key) return;
      if (clientX != null) placeTooltip(clientX, clientY);
      else anchorTip(key);
      return;
    }
    if (hoverKey) {
      var oldEl = subPathEls[hoverKey] || pathEls[hoverKey];
      if (oldEl) oldEl.classList.remove('hot');
    }
    hoverKey = key;
    if (!key) { tipEl.classList.remove('show'); return; }
    var s = subByKey[key] || byKey[key];
    if (!s) return;
    var pe = subByKey[key] ? subPathEls[key] : pathEls[key];
    if (pe) pe.classList.add('hot');
    tipEl.innerHTML = tooltipHTML(s);
    tipEl.classList.add('show');
    if (clientX != null) placeTooltip(clientX, clientY);
    else anchorTip(key);
    // 同步榜单高亮
    Array.prototype.forEach.call(panelEl.querySelectorAll('.rank .row'), function (r) {
      r.classList.toggle('on', r.dataset.key === key);
    });
  }

  /* ============================================================ 选中 */
  var selectedKey = null;
  function select(key, opts) {
    opts = opts || {};
    if (selectedKey && pathEls[selectedKey]) pathEls[selectedKey].classList.remove('sel');
    selectedKey = key;
    if (key && pathEls[key]) pathEls[key].classList.add('sel');
    paint();
    renderPanel();
    if (key && opts.fly) zoomToShape(byKey[key]);
    setHash(key);
  }

  // 选中某个省 / 州
  function selectSub(key, opts) {
    opts = opts || {};
    if (selectedSubKey && subPathEls[selectedSubKey]) {
      subPathEls[selectedSubKey].classList.remove('sel');
    }
    selectedSubKey = key;
    if (key && subPathEls[key]) subPathEls[key].classList.add('sel');
    paint();
    renderPanel();
    if (key && opts.fly) {
      var sh = subByKey[key];
      if (sh) {
        var k = Math.min(W / Math.max(sh.bw, 4), H / Math.max(sh.bh, 4)) * 0.6;
        k = Math.max(2, Math.min(90, k));
        flyTo({ k: k, x: W / 2 - k * sh.cx, y: H / 2 - k * sh.cy });
      }
    }
  }

  // file:// 或沙箱 iframe 下 replaceState 可能抛 SecurityError，静默降级
  function setHash(key) {
    try {
      if (!history.replaceState) return;
      var url = key ? '#' + encodeURIComponent(key) : location.pathname + location.search;
      history.replaceState(null, '', url);
    } catch (e) { /* 忽略：仅影响地址栏同步 */ }
  }

  /* ============================================================ 侧栏 */
  function renderPanel() {
    var s = selectedKey ? byKey[selectedKey] : null;
    var html = '';
    var pack = modePack();

    if (pack && isProvinceMode()) {
      // ---------------- 中国 / 美国 地图模式
      var sel = selectedSubKey ? subByKey[selectedSubKey] : null;
      html += '<div class="card drill-card">';
      html += '<h3>' + esc(t('{country}地图 · {level}级', { country: t(pack.name), level: t(pack.level) })) +
        ('<span class="clear" data-clear="1">' + t("清除 ✕") + '</span></h3>');
      if (sel) {
        var d = sel.info, dden = density(d);
        html += '<div class="sel-head"><div class="sel-flag">📍</div><div>' +
          '<div class="sel-zh">' + esc(placeName({ info: d })) + '</div>' +
          '</div></div>';
        html += '<div class="sel-tags">' +
          '<span class="tag hi">' + esc(t('{country}{level}', { country: t(pack.name), level: t(pack.level) })) + '</span>' +
          (d.capital ? '<span class="tag">' + (pack.key === '156' ? t("省会 ") : t("首府 ")) + esc(t(d.capital)) + '</span>' : '') +
          ('<span class="tag">' + t("人口 ")) + (d.popYear || '—') + '</span></div>';
        html += '<div class="stats3" style="margin-top:11px">' +
          '<div class="box"><div class="n">' + (d.pop != null ? fmtCompact(d.pop) : '—') + ('</div><div class="l">' + t("人口") + '</div></div>') +
          '<div class="box"><div class="n">' + (d.area != null ? fmtArea(d.area) : '—') + ('<small> km²</small></div><div class="l">' + t("面积") + '</div></div>') +
          '<div class="box"><div class="n">' + (dden != null ? nf.format(Math.round(dden)) : '—') + ('</div><div class="l">' + t("人 / km²") + '</div></div>') +
          '</div>';
        html += '<div style="margin-top:6px">';
        html += row(t("人口（") + (d.popYear || '—') + t('）'), d.pop != null ? fmtInt(d.pop) + (' <small>' + t("人") + '</small>') : t("无数据"));
        html += row(t("占全国人口"), d.pop && byKey[pack.key] && byKey[pack.key].info.pop
          ? (d.pop / byKey[pack.key].info.pop * 100).toFixed(2) + ' <small>%</small>' : '—');
        html += row(t("面积"), d.area != null ? fmtInt(d.area) + ' <small>km²</small>' : t("无数据"));
        html += row(t("占全国面积"), d.area && byKey[pack.key] && byKey[pack.key].info.area
          ? (d.area / byKey[pack.key].info.area * 100).toFixed(2) + ' <small>%</small>' : '—');
        html += row(pack.key === '156' ? t("省会") : t("首府"), esc(t(d.capital || '—')));
        html += row(t("中心坐标"), d.center ? d.center[0].toFixed(2) + '°, ' + d.center[1].toFixed(2) + '°' : '—');
        html += '</div>';
      } else {
        var pi = packInfo(pack);
        html += '<div class="sel-head"><div class="sel-flag">' + (pi.flag || '🏳️') + '</div><div>' +
          '<div class="sel-zh">' + esc(t(pack.name)) + '</div>' +
          '<div class="sel-en">' + pack.divisions.length + ' ' + esc(t(pack.unit)) + (t(" · 点击地图查看明细") + '</div></div></div>');
        html += '<div class="stats3" style="margin-top:11px">' +
          '<div class="box"><div class="n">' + (pi.pop != null ? fmtCompact(pi.pop) : '—') + ('</div><div class="l">' + t("总人口") + '</div></div>') +
          '<div class="box"><div class="n">' + (pi.area != null ? fmtArea(pi.area) : '—') + ('<small> km²</small></div><div class="l">' + t("总面积") + '</div></div>') +
          '<div class="box"><div class="n">' + pack.divisions.length + '</div><div class="l">' + esc(t(pack.level)) + (t("级单位") + '</div></div>') +
          '</div>';
        html += '<div class="tips" style="margin-top:9px">' +
          esc(t('悬停查看每个{level}的人口、面积、密度与首府；点击固定；', { level: t(pack.level) })) +
          '<kbd>Esc</kbd> ' + t('清除选中。') + '</div>';
      }
      html += '</div>';
    } else if (s) {
      var i = s.info, den = density(i);
      html += '<div class="card">';
      html += ('<h3>' + t("已选中") + '<span class="clear" data-clear="1">' + t("清除 ✕") + '</span></h3>');
      html += '<div class="sel-head"><div class="sel-flag">' + (i.flag || '🏳️') + '</div><div>' +
        '<div class="sel-zh">' + esc(placeName(s)) + '</div>' +
        '<div class="sel-en">' + esc(i.cca3 || '') + '</div></div></div>';
      html += '<div class="sel-tags">' +
        '<span class="tag hi">' + esc(t(i.region || '—')) + '</span>' +
        (i.subregion ? '<span class="tag">' + esc(t(i.subregion)) + '</span>' : '') +
        ('<span class="tag">' + t("首都 ")) + esc(i.capital || '—') + '</span></div>';
      html += '<div class="stats3" style="margin-top:11px">' +
        '<div class="box"><div class="n">' + (i.pop != null ? fmtCompact(i.pop) : '—') + ('</div><div class="l">' + t("人口") + '</div></div>') +
        '<div class="box"><div class="n">' + (i.area != null ? fmtArea(i.area) : '—') + ('<small> km²</small></div><div class="l">' + t("面积") + '</div></div>') +
        '<div class="box"><div class="n">' + (den != null ? nf.format(Math.round(den)) : '—') + ('</div><div class="l">' + t("人 / km²") + '</div></div>') +
        '<div class="box"><div class="n">' + (i.gdpTotal != null ? fmtMoney(i.gdpTotal) : '—') + ('</div><div class="l">' + t("GDP 总量") + '</div></div>') +
        '<div class="box"><div class="n">' + (i.gdp != null ? fmtCompact(i.gdp) : '—') + ('</div><div class="l">' + t("人均 GDP") + '</div></div>') +
        '<div class="box"><div class="n">' + (i.gdpTotal && WORLD.gdp ? (i.gdpTotal / WORLD.gdp * 100).toFixed(1) : '—') + ('<small> %</small></div><div class="l">' + t("占全球 GDP") + '</div></div>') +
        '</div>';
      html += '<div style="margin-top:6px">';
      html += row(t("人口（") + D.meta.popYear + t('）'), i.pop != null ? fmtInt(i.pop) + (' <small>' + t("人") + '</small>') : t("无数据"));
      html += row(t("面积"), i.area != null ? fmtInt(i.area) + ' <small>km²</small>' : t("无数据"));
      html += row(t("占全球人口"), i.pop && WORLD.pop ? (i.pop / WORLD.pop * 100).toFixed(2) + ' <small>%</small>' : '—');
      html += row(t('GDP（') + D.meta.gdpYear + t('）'), i.gdpTotal != null ? fmtInt(i.gdpTotal) + (' <small>' + t("美元") + '</small>') : t("无数据"));
      html += row(t("人均GDP（") + D.meta.gdpYear + t('）'), i.gdp != null ? nf.format(Math.round(i.gdp)) + (' <small>' + t("美元") + '</small>') : t("无数据"));
      html += row(t("语言"), esc(localizedLanguages(i.languages) || '—'));
      html += row(t("货币"), esc(localizedCurrency(i.currency) || '—'));
      if (i.latlng && i.latlng.length) {
        html += row(t("中心坐标"), i.latlng[0].toFixed(1) + '°, ' + i.latlng[1].toFixed(1) + '°');
      }
      html += '</div>';
      var nb = (i.borders || []).filter(function (b) { return byCca3[b]; });
      if (nb.length) {
        html += ('<div style="margin-top:10px"><div class="l" style="font-size:11px;color:var(--text-faint);margin-bottom:6px">' + t("陆上邻国 · 点击切换") + '</div><div class="sel-tags">');
        nb.slice(0, 24).forEach(function (b) {
          html += '<span class="tag" data-neighbor="' + esc(byCca3[b].key) + '" style="cursor:pointer">' +
            esc(placeName(byCca3[b])) + '</span>';
        });
        html += '</div></div>';
      }
      html += '</div>';
    }

    if (pack && isProvinceMode()) {
      html += '<div class="card"><h3>' + esc(t('{country}{level}', { country: t(pack.name), level: t(pack.level) })) + ' · ' +
        (metricKey === 'none' ? t("人口") : t(METRICS[metricKey].label)) + (t("前十") + '</h3><div class="rank" id="rank"></div></div>');
    } else {
      html += '<div class="card"><h3>' + (metricKey === 'none' ? t("人口") : t(METRICS[metricKey].label)) +
        (t(" · 全球前十") + '</h3><div class="rank" id="rank"></div></div>');
    }
    html += ('<div class="card"><h3>' + t("数据来源") + '</h3><div class="src">') +
      (pack && isProvinceMode()
        ? (pack.key === '156' ? (t("省界：阿里云 DataV 全国省级边界") + '<br>') : (t("州界：us-atlas states-10m") + '<br>')) +
          (t("统计：Wikidata（人口年份随各省/州实际数据）") + '<br>')
        : t("国界：") + D.meta.geoSource + ('<br>' + t("属性：")) + D.meta.metaSource + '<br>' +
          t("统计：") + D.meta.statSource + t("（人口/人均GDP ") + D.meta.popYear + t('）') + '<br>') +
      esc(t('共 {count} 个{level}，中位数密度 {density} 人/km²', {
        count: metricItems().length, level: t(isProvinceMode() ? '省 / 州' : '国家 / 地区'), density: medianDensity()
      })) +
      '</div></div>';

    panelEl.innerHTML = html;
    renderRank();
  }
  function row(k, v) { return '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }
  function packInfo(pack) {
    var c = pack && byKey[pack.key];
    return c ? c.info : {};
  }
  function medianDensity() {
    var a = metricItems().map(function (s) { return density(s.info); })
      .filter(function (v) { return v != null && isFinite(v) && v > 0; })
      .sort(function (x, y) { return x - y; });
    if (!a.length) return '—';
    return a[Math.floor(a.length / 2)].toFixed(1);
  }

  function renderRank() {
    var box = panelEl.querySelector('#rank');
    if (!box) return;
    var sub = isProvinceMode();
    var key = metricKey === 'none' ? 'pop' : metricKey;
    var m = METRICS[key];
    var list = metricItems().map(function (s) { return { s: s, v: m.get(s.info) }; })
      .filter(function (o) { return o.v != null && isFinite(o.v) && o.v > 0; })
      .sort(function (a, b) { return b.v - a.v; })
      .slice(0, 10);
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + esc(t('该指标在{level}暂无数据', {
        level: t(sub ? MODES[mapMode].level : '国家')
      })) + '</div>';
      return;
    }
    var max = list[0].v;
    var h = '';
    list.forEach(function (o, idx) {
      var pct = Math.max(3, Math.round(o.v / max * 100));
      var on = sub ? (o.s.key === selectedSubKey) : (o.s.key === selectedKey);
      h += '<div class="row' + (on ? ' on' : '') + '" data-key="' + o.s.key + '"' +
        (sub ? ' data-sub="1"' : '') + '>' +
        '<div class="bg" style="width:' + pct + '%"></div>' +
        '<div class="idx">' + (idx + 1) + '</div>' +
        '<div class="nm">' + (sub ? '' : '<span class="flag">' + (o.s.info.flag || '') + '</span>') +
        esc(placeName(o.s, true)) + '</div>' +
        '<div class="val">' + m.fmt(o.v) + '</div></div>';
    });
    box.innerHTML = h;
  }

  function renderLegend() {
    if (!scale || metricKey === 'none') { legendEl.classList.remove('open'); return; }
    var m = METRICS[metricKey];
    var h = '<div class="title">' + t(m.label) + t(" · 分位数分级（") + t(m.unit) + t('）') + '</div><div class="bar">';
    PALETTE.forEach(function (c) { h += '<i style="background:' + c + '"></i>'; });
    h += '</div><div class="ticks"><span>' + m.fmt(scale.min) + '</span><span>' + m.fmt(scale.max) + '</span></div>';
    h += ('<div class="nodata"><i></i>' + t("无数据 / 无统计") + '</div>');
    legendEl.innerHTML = h;
    legendEl.classList.add('open');
  }

  /* ============================================================ 交互事件 */
  var pointers = new Map();
  var drag = null, moved = false, pinch = null;

  svg.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      moved = false;
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      svg.classList.add('dragging');
    } else if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinch = {
        d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        k: view.k, x: view.x, y: view.y,
        mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2
      };
      drag = null;
    }
  });

  svg.addEventListener('pointermove', function (e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinch) {
      var pts = Array.from(pointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      var center = toView(pinch.mx, pinch.my);
      var k2 = Math.max(1, Math.min(90, pinch.k * (d / pinch.d)));
      view.k = k2;
      view.x = center.x - (center.x - pinch.x) * (k2 / pinch.k) + (mid.x - pinch.mx) * 0;
      view.y = center.y - (center.y - pinch.y) * (k2 / pinch.k);
      view.x += (mid.x - pinch.mx) * 0;
      clampView();
      applyView();
      moved = true;
      return;
    }

    if (drag && pointers.has(e.pointerId)) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      var ctm = svg.getScreenCTM();
      var sc = ctm ? ctm.a : 1; // 屏幕像素 → viewBox 单位
      view.x = drag.vx + dx / sc;
      view.y = drag.vy + dy / sc;
      clampView();
      applyView();
      tipEl.classList.remove('show');
      return;
    }

    var key = e.target && e.target.dataset ? e.target.dataset.key : null;
    if (key) hoverShape(key, e.clientX, e.clientY);
    else if (hoverKey) hoverShape(null);
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { drag = null; svg.classList.remove('dragging'); }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('click', function (e) {
    if (moved) return;
    var ds = (e.target && e.target.dataset) || {};
    var key = ds.key;
    var isTouch = e.pointerType === 'touch';
    if (key && ds.sub) {
      selectSub(key, { fly: !isTouch && subByKey[key] && subByKey[key].size < 22 });
    } else if (key) {
      select(key, { fly: !isTouch && byKey[key].size < 26 });
    } else if (isProvinceMode()) {
      selectSub(null);                           // 点空白 → 取消省/州选中
    } else {
      select(null);
    }
  });

  svg.addEventListener('dblclick', function (e) {
    e.preventDefault();
    var p = toView(e.clientX, e.clientY);
    zoomAt(p.x, p.y, 2);
  });

  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = toView(e.clientX, e.clientY);
    var dy = typeof e.deltaY === 'number' ? e.deltaY : 0;
    if (e.deltaMode === 1) dy *= 16;          // 行模式
    else if (e.deltaMode === 2) dy *= 400;    // 页模式
    var f = Math.exp(-Math.max(-120, Math.min(120, dy)) * 0.0016);
    zoomAt(p.x, p.y, f);
  }, { passive: false });

  document.querySelector('.zoombar').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var a = b.dataset.zoom;
    if (a === 'in') zoomAt(W / 2, H / 2, 1.6);
    else if (a === 'out') zoomAt(W / 2, H / 2, 1 / 1.6);
    else if (a === 'full') toggleFullscreen();
    else {
      flyTo({ x: 0, y: 0, k: 1 }, 380);
      setTimeout(function () { select(null); selectSub(null); }, 10);
    }
  });


  /* ============================================================ 全屏 */
  var fsBtn = document.getElementById('fsbtn');
  var rootEl = document.getElementById('app') || document.documentElement;
  var fsSupported = !!(rootEl.requestFullscreen || rootEl.webkitRequestFullscreen ||
                       rootEl.msRequestFullscreen);

  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement ||
           document.msFullscreenElement || null;
  }
  function toggleFullscreen() {
    if (!fsSupported) return;
    try {
      if (fsElement()) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen ||
                   document.msExitFullscreen;
        if (exit) {
          var r = exit.call(document);
          if (r && r.catch) r.catch(function () {});
        }
      } else {
        var req = rootEl.requestFullscreen || rootEl.webkitRequestFullscreen ||
                  rootEl.msRequestFullscreen;
        var p = req.call(rootEl);
        if (p && p.catch) p.catch(function () {});
      }
    } catch (err) { /* 忽略：部分环境禁止脚本触发全屏 */ }
  }
  function syncFsBtn() {
    if (!fsBtn) return;
    var on = !!fsElement();
    fsBtn.textContent = on ? '⤡' : '⛶';
    fsBtn.title = on ? t("退出全屏 (F)") : t("全屏 (F)");
    fsBtn.setAttribute('aria-label', fsBtn.title);
    fsBtn.classList.toggle('on', on);
    fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (fsBtn && !fsSupported) fsBtn.style.display = 'none';
  ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
    document.addEventListener(ev, syncFsBtn);
  });
  syncFsBtn();

  panelEl.addEventListener('click', function (e) {
    var clear = e.target.closest('[data-clear]');
    if (clear) { select(null); return; }
    var nb = e.target.closest('[data-neighbor]');
    if (nb) { select(nb.dataset.neighbor, { fly: true }); return; }
    var r = e.target.closest('.rank .row');
    if (r) {
      if (r.dataset.sub) selectSub(r.dataset.key, { fly: true });
      else select(r.dataset.key, { fly: true });
    }
  });
  panelEl.addEventListener('mouseover', function (e) {
    var r = e.target.closest('.rank .row');
    if (r) hoverShape(r.dataset.key, null);
  });
  panelEl.addEventListener('mouseout', function (e) {
    if (e.target.closest('.rank .row')) hoverShape(null);
  });

  /* ============================================================ 搜索 */
  var sIdx = -1;
  function matches(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    var out = [];
    shapes.forEach(function (s) {
      var i = s.info;
      var hay = [i.zh, i.en, i.cca2, i.cca3, i.capital, s.name].filter(Boolean).join(' ').toLowerCase();
      var pos = hay.indexOf(q);
      if (pos >= 0) out.push({ s: s, sub: false, score: pos + (i.cca2 && i.cca2.toLowerCase() === q ? -5 : 0) });
    });
    // 省 / 州 也能搜到（只有中国、美国有数据）
    provincePacks().forEach(function (pk) {
      pk.pack.divisions.forEach(function (d) {
        var hay = [d.name, d.en, d.zh, d.short, d.capital, t(d.capital)].filter(Boolean).join(' ').toLowerCase();
        var pos = hay.indexOf(q);
        if (pos >= 0) out.push({
          s: { key: String(d.id), name: d.name, info: d, label: d.short || d.name },
          sub: true, mode: pk.mode, pack: pk.pack, score: pos + 2
        });
      });
    });
    out.sort(function (a, b) { return a.score - b.score; });
    return out.slice(0, 9);
  }
  function renderSuggest(list, q) {
    if (!q) { suggestEl.classList.remove('open'); return; }
    sIdx = -1;
    if (!list.length) {
      suggestEl.innerHTML = ('<div class="empty">' + t("没有找到匹配的国家 / 省份 / 州") + '</div>');
    } else {
      suggestEl.innerHTML = list.map(function (o) {
        var s = o.s;
        var title = placeName(s);
        var sub = o.sub ? t(o.pack.name) : (s.info.cca3 || '');
        return '<div class="item" data-key="' + s.key + '"' + (o.sub ? ' data-sub="1" data-mode="' + o.mode + '"' : '') + '>' +
          '<span class="flag">' + (o.sub ? o.pack.key === '156' ? '🇨🇳' : '🇺🇸' : (s.info.flag || '🏳️')) + '</span>' +
          '<span>' + esc(title) + '</span>' +
          (o.sub ? '<span class="pill">' + esc(t(o.pack.level)) + '</span>' : '') +
          '<span class="en">' + esc(sub) + '</span></div>';
      }).join('');
    }
    suggestEl.classList.add('open');
  }
  searchEl.addEventListener('input', function () {
    var q = searchEl.value;
    renderSuggest(matches(q), q);
  });
  searchEl.addEventListener('keydown', function (e) {
    var items = suggestEl.querySelectorAll('.item');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      sIdx += (e.key === 'ArrowDown' ? 1 : -1);
      if (sIdx < 0) sIdx = items.length - 1;
      if (sIdx >= items.length) sIdx = 0;
      items.forEach(function (n, i) { n.classList.toggle('active', i === sIdx); });
      items[sIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      var pick = sIdx >= 0 ? items[sIdx] : items[0];
      if (pick) {
        pickSelection(pick);
        suggestEl.classList.remove('open');
        searchEl.blur();
      }
    } else if (e.key === 'Escape') {
      suggestEl.classList.remove('open'); searchEl.blur();
    }
  });

  // 搜索结果：国家 → 选中；省/州 → 自动下钻并选中
  function pickSelection(item) {
    var key = item.dataset.key;
    if (item.dataset.sub) {
      var mode = item.dataset.mode;
      if (mapMode !== mode) setMode(mode, { keepHash: true });
      selectSub(key, { fly: true });
    } else {
      if (isProvinceMode()) setMode('world', { keepHash: true });
      select(key, { fly: true });
    }
  }

  suggestEl.addEventListener('click', function (e) {
    var it = e.target.closest('.item');
    if (it) { pickSelection(it); suggestEl.classList.remove('open'); }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search')) suggestEl.classList.remove('open');
  });
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (e.key === 'Escape') {
      if (hoverKey) hoverShape(null);
      suggestEl.classList.remove('open');
      selectSub(null);
      select(null);
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
    } else if ((e.key === 'f' || e.key === 'F') && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      toggleFullscreen();
    } else if ((e.key === 'r' || e.key === 'R') && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      resetView();
    } else if (!typing && (e.key === '1' || e.key === '2' || e.key === '3')) {
      var m = { '1': 'world', '2': 'cn', '3': 'us' }[e.key];
      if (MODES[m] && (m === 'world' || MODES[m].pack) && m !== mapMode) {
        e.preventDefault();
        setMode(m);
      }
    }
  });

  /* ============================================================ 地图模式 / 指标 / 投影 */
  function buildModeButtons() {
    if (!mapModesEl) return;
    var h = '';
    ['world', 'cn', 'us'].forEach(function (m) {
      var cfg = MODES[m];
      if (m !== 'world' && !cfg.pack) return;
      h += '<button data-mode="' + m + '"' + (m === mapMode ? ' class="on"' : '') + ' title="' +
        t(cfg.title || cfg.label) + t('（') + (m === 'world' ? '1' : m === 'cn' ? '2' : '3') + t('）') + '">' +
        t(cfg.label) + '</button>';
    });
    mapModesEl.innerHTML = h;
  }
  function syncModeButtons() {
    if (!mapModesEl) return;
    Array.prototype.forEach.call(mapModesEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.mode === mapMode);
    });
  }
  if (mapModesEl) {
    mapModesEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (b && b.dataset.mode !== mapMode) setMode(b.dataset.mode);
    });
  }

  function buildSegments() {
    var h = ('<span class="lab">' + t("着色") + '</span>');
    Object.keys(METRICS).forEach(function (k) {
      h += '<button data-metric="' + k + '"' + (k === metricKey ? ' class="on"' : '') + '>' + t(METRICS[k].label) + '</button>';
    });
    modesEl.innerHTML = h;

    var p = ('<span class="lab">' + t("投影") + '</span>');
    Object.keys(PROJECTIONS).forEach(function (k) {
      p += '<button data-proj="' + k + '"' + (k === projKey ? ' class="on"' : '') + ' title="' +
        t(PROJECTIONS[k].title) + '">' + t(PROJECTIONS[k].label) + '</button>';
    });
    projEl.innerHTML = p;
  }
  modesEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-metric]');
    if (!b) return;
    metricKey = b.dataset.metric;
    Array.prototype.forEach.call(modesEl.querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x === b);
    });
    buildScale(metricKey);
    paint();
    renderPanel();
  });
  projEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-proj]');
    if (!b) return;
    projKey = b.dataset.proj;
    Array.prototype.forEach.call(projEl.querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x === b);
    });
    hoverShape(null);
    computeLayout(projKey);
    buildSubLayer();
    paint();
    // 就地复位（保持 view 引用稳定）
    view.x = 0; view.y = 0; view.k = 1;
    applyView();
  });

  function placeName(shape, short) {
    var info = shape.info || {};
    if (language === 'en') return info.en || shape.name || info.name || '';
    return info.zh || (short ? info.short : '') || info.name || shape.name || '';
  }
  function localizedLanguages(value) {
    return language === 'en' ? window.MAP_I18N.languages(value) : value;
  }
  function localizedCurrency(value) {
    return language === 'en' ? window.MAP_I18N.currency(value) : value;
  }
  function syncLanguageUI() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = 'UniEarth · ' + t('交互式世界地图');
    var homeLink = document.getElementById('home-link');
    if (homeLink) {
      homeLink.href = 'index.html?lang=' + language;
      homeLink.setAttribute('aria-label', language === 'en' ? 'UniEarth home' : 'UniEarth 首页');
    }
    searchEl.placeholder = t('搜索国家、省份或州');
    searchEl.setAttribute('aria-label', searchEl.placeholder);
    document.getElementById('language-switch').setAttribute('aria-label', t('界面语言'));
    document.querySelectorAll('[data-lang]').forEach(function (button) {
      var active = button.dataset.lang === language;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = language === 'en' ? (button.dataset.lang === 'en' ? 'EN' : 'ZH') : (button.dataset.lang === 'en' ? '英语' : '中文');
      button.setAttribute('aria-label', language === 'en' ? (button.dataset.lang === 'en' ? 'English' : 'Chinese') : (button.dataset.lang === 'en' ? '英语' : '中文'));
      button.lang = language === 'en' ? 'en' : 'zh-CN';
    });
    ['in', 'out', 'reset'].forEach(function (action, index) {
      var button = document.querySelector('[data-zoom="' + action + '"]');
      button.title = t(['放大', '缩小', '重置视图'][index]);
      button.setAttribute('aria-label', button.title);
      if (action === 'reset') button.textContent = t('重置');
    });
    document.getElementById('hint').innerHTML = '<b>' + t('悬停') + '</b> ' + t('查看信息') +
      ' · <b>' + t('点击') + '</b> ' + t('固定') + ' · <b>1/2/3</b> ' + t('切换地图') +
      ' · <b>R</b> ' + t('重置') + ' · <b>/</b> ' + t('搜索') + ' · <b>F</b> ' + t('全屏');
    syncFsBtn();
  }
  function setLanguage(next) {
    if ((next !== 'zh' && next !== 'en') || next === language) return;
    language = next;
    nf = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN');
    try { localStorage.setItem('uniearth.language', language); } catch (e) {}
    try {
      var url = new URL(location.href);
      url.searchParams.set('lang', language);
      history.replaceState(null, '', url);
    } catch (e) { /* file:// remains usable even when history/storage are unavailable. */ }
    syncLanguageUI();
    buildModeButtons();
    buildSegments();
    renderPanel();
    renderLegend();
    renderLabels();
    if (hoverKey) {
      tipEl.innerHTML = tooltipHTML(subByKey[hoverKey] || byKey[hoverKey]);
      anchorTip(hoverKey);
    }
    if (suggestEl.classList.contains('open')) renderSuggest(matches(searchEl.value), searchEl.value);
  }
  document.getElementById('language-switch').addEventListener('click', function (event) {
    var button = event.target.closest('[data-lang]');
    if (button) setLanguage(button.dataset.lang);
  });

  /* ============================================================ 启动 */
  var params = new URLSearchParams(location.search);
  var initialMetric = params.get('metric');
  if (initialMetric && METRICS[initialMetric]) metricKey = initialMetric;

  // ?mode=cn|us|world 或 #440000（省/州）直接进入对应地图模式
  var hash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  var hashPack = null, hashDiv = null;
  provincePacks().forEach(function (pk) {
    if (hashDiv) return;
    pk.pack.divisions.forEach(function (d) { if (String(d.id) === hash) hashDiv = d; });
    if (hashDiv) hashPack = pk;
  });
  var urlMode = (params.get('mode') || '').toLowerCase();
  if (hashPack) mapMode = hashPack.mode;
  else if (urlMode === 'cn' || urlMode === 'us') mapMode = urlMode;
  else if (urlMode === 'world') mapMode = 'world';

  syncLanguageUI();
  buildModeButtons();
  buildSegments();
  computeLayout(projKey);
  buildSubLayer();
  applyView();
  buildScale(metricKey);
  paint();
  renderPanel();

  var selKey = params.get('sel');
  if (hashDiv) {
    selectSub(String(hashDiv.id), { fly: true });
    setHash(String(hashDiv.id));
  } else if (hash && byKey[hash]) {
    select(hash, { fly: true });
  } else if (selKey && byKey[selKey]) {
    select(selKey, { fly: true });
  }

  // 便于截图/演示：?hover=CHN 直接展示某国悬停卡片
  var hoverParam = params.get('hover');
  if (hoverParam && byKey[hoverParam]) {
    setTimeout(function () { hoverShape(hoverParam, null); }, 60);
  }

  window.addEventListener('resize', function () { if (hoverKey) hoverShape(hoverKey, null); });
  window.__worldMap = {
    setLanguage: setLanguage, language: function () { return language; },
    select: select, selectSub: selectSub, hoverShape: hoverShape, shapes: shapes, byKey: byKey,
    view: view, syncHitRadius: syncHitRadius, computeLayout: computeLayout,
    renderLabels: renderLabels, metrics: METRICS, world: WORLD, applyView: applyView,
    setMode: setMode, modePack: modePack, modes: MODES,
    subShapes: function () { return subShapes; }, subByKey: function () { return subByKey; },
    mapMode: function () { return mapMode; }, isProvinceMode: isProvinceMode
  };
})();
