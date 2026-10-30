/* =========================================================
   界面逻辑 —— app.js
   只做三件事：读输入 → 调 spring-math.js 算 → 写回页面。
   这里不写任何公式，公式全在 spring-math.js 里。
   ========================================================= */
(function () {
  'use strict';

  var M = window.SpringMath;
  var state = { type: 'comp', mode: 'n', revType: 'comp', last: null };

  function $(id) { return document.getElementById(id); }

  function readNum(id) {
    var el = $(id);
    if (!el) return NaN;
    var v = parseFloat(el.value);
    return isFinite(v) ? v : NaN;
  }
  function num(id, dft) { var v = readNum(id); return isFinite(v) ? v : dft; }

  function set(id, text) { var el = $(id); if (el) el.textContent = text; }
  function html(id, s) { var el = $(id); if (el) el.innerHTML = s; }

  /* 有效数字格式化：8.000 → 8，2.032 → 2.03 */
  function sig(x, digits) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    if (x === 0) return '0';
    var d = digits === undefined ? 3 : digits;
    var a = Math.abs(x);
    if (a >= 100000 || a < 0.001) return x.toExponential(2);
    var dec = Math.max(0, d - 1 - Math.floor(Math.log10(a)));
    var s = x.toFixed(Math.min(dec, 6));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  var MAT_BY_G = {};
  (function () {
    var m = M.MATERIALS || {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) MAT_BY_G[m[k].G] = m[k].name;
  })();

  /* ---------- 切换 ---------- */
  function setType(t) {
    state.type = t;
    var b = document.body.classList;
    b.remove('t-comp'); b.remove('t-ext'); b.remove('t-rev');
    b.add('t-' + t);
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-type') === t);
    }
    render();
  }

  function setMode(m) {
    state.mode = m;
    var b = document.body.classList;
    if (m === 'k') b.add('mode-k'); else b.remove('mode-k');
    var btns = document.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', btns[i].getAttribute('data-mode') === m);
    }
    render();
  }

  function setRevType(t) {
    state.revType = t;
    var b = document.body.classList;
    if (t === 'ext') b.add('rv-ext'); else b.remove('rv-ext');
    var btns = document.querySelectorAll('.rev-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', btns[i].getAttribute('data-rev') === t);
    }
    render();
  }

  /* ---------- 读输入 → 调公式 ---------- */
  function compute() {
    var G = num('G', 79000);
    var tauAllow = num('tauAllow', 0);

    if (state.type === 'rev') {
      var travelR = num('travelR', 0);
      var k = num('kTar', 0);
      var Fwant = num('Fwant', 0);
      if (Fwant > 0 && travelR > 0) k = Fwant / travelR;   /* 填了目标力就用它反算刚度 */

      if (state.revType === 'ext') {
        return M.reverseExtension({
          Dmax: readNum('Dmax'), Lbmax: readNum('Lbmax'),
          k: k, travel: travelR, F0: num('F0r', 0), G: G, tauAllow: tauAllow
        });
      }
      return M.reverseCompression({
        Dmax: readNum('Dmax'), L0max: readNum('L0max'),
        k: k, travel: travelR, G: G, tauAllow: tauAllow
      });
    }

    var travel = num('travel', 0);

    if (state.type === 'comp') {
      return M.compression({
        d: readNum('d'), D: readNum('D'), L0: readNum('L0'), G: G,
        mode: state.mode, n: readNum('nIn'), kTarget: readNum('kIn'),
        travel: travel, tauAllow: tauAllow
      });
    }

    return M.extension({
      d: readNum('d'), D: readNum('D'), Lb: readNum('Lb'), G: G,
      F0: num('F0', 0), travel: travel, tauAllow: tauAllow
    });
  }

  function render() {
    var res = compute();
    state.last = res;
    if (state.type === 'rev') paintRev(res); else paintSingle(res);
    set('modeNote', state.type === 'comp'
      ? (state.mode === 'k'
          ? '按目标刚度反推圈数，结果取 0.5 的倍数，所以实际刚度会有一点偏差。'
          : '圈数按你填的来，刚度、螺距、应力都是算出来的。')
      : '');
  }

  /* ---------- 压簧 / 拉簧 ---------- */
  function paintSingle(res) {
    var o = res && res.ok ? res.out : null;

    if (!o) {
      ['rK', 'rN', 'rT', 'rC', 'rDm', 'rLs', 'rFmax', 'rForce', 'rTau', 'rUtil', 'rTravel', 'rNote']
        .forEach(function (id) { set(id, id === 'rNote' ? '' : '—'); });
      set('lN', '圈数 n'); set('lT', '螺距 t'); set('lC', '弹簧指数 C');
      set('lDm', '中径 Dm'); set('lLs', '压并高度 Ls'); set('lFmax', '可用行程');
      html('tbody', '');
      html('chart', '');
      html('checks', ((res && res.errors) || ['输入有误']).map(function (e) {
        return '<li class="err">' + e + '</li>';
      }).join(''));
      return;
    }

    var isExt = o.type === 'ext';

    set('rK', sig(o.k, 4));
    set('rNote', (MAT_BY_G[o.G] || '自定义材料') + ' · G=' + o.G);
    set('rN', sig(o.n, 3));
    set('rC', o.C.toFixed(2));
    set('rDm', o.Dm.toFixed(2));

    if (isExt) {
      set('lT', '钢丝总长(估)');
      set('rT', sig(o.n * o.Dm * Math.PI + 2 * Math.max(o.Lb * 0.15, 10), 4));
      set('lLs', '允许伸长');
      set('rLs', sig(o.fAllow, 3));
      set('lFmax', '初拉力 F0');
      set('rFmax', sig(o.F0, 3));
    } else {
      set('lT', '螺距 t');
      set('rT', sig(o.t, 3));
      set('lLs', '压并高度 Ls');
      set('rLs', sig((o.n + 2) * o.d, 3));
      set('lFmax', '可用行程');
      set('rFmax', sig(o.fMax, 3));
    }
    set('lN', '有效圈数 n');

    set('rTravel', sig(o.travel, 3));
    set('rForce', sig(o.forceAtTravel, 4));
    set('rTau', o.tau.toFixed(0));

    var tauAllow = num('tauAllow', 0);
    set('rUtil', tauAllow > 0 ? (o.tau / tauAllow * 100).toFixed(0) : '—');

    /* 表格 */
    var rows = o.table || [];
    html('tbody', rows.map(function (r) {
      return '<tr><td>' + sig(r.f, 3) + '</td><td>' + sig(r.F, 4) + '</td></tr>';
    }).join(''));

    /* 图 */
    html('chart', chartSVG(rows, o.travel));

    /* 校核 */
    html('checks', (res.checks || []).map(function (c) {
      return '<li class="' + c.level + '">' + c.text + '</li>';
    }).join(''));
  }

  /* ---------- 力—行程图（直接拼 SVG 字符串，省得跟 DOM 较劲） ---------- */
  function chartSVG(rows, markerF) {
    var W = 340, H = 190, padL = 44, padR = 14, padT = 16, padB = 30;
    if (!rows || !rows.length) return '';
    var fMax = rows[rows.length - 1].f || 1;
    var FMax = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].F > FMax) FMax = rows[i].F;
    if (!(FMax > 0)) FMax = 1;
    var iw = W - padL - padR, ih = H - padT - padB;
    var X = function (f) { return padL + (f / fMax) * iw; };
    var Y = function (F) { return H - padB - (F / FMax) * ih; };

    var s = '';
    for (var g = 0; g <= 4; g++) {
      var gy = (padT + ih * g / 4).toFixed(1);
      s += '<line class="grid" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/>';
    }
    s += '<line class="axis" x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '"/>';
    s += '<line class="axis" x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '"/>';

    var pts = rows.map(function (r) { return X(r.f).toFixed(1) + ',' + Y(r.F).toFixed(1); });
    s += '<polygon class="area" points="' + padL + ',' + (H - padB) + ' ' + pts.join(' ') + ' ' + (W - padR) + ',' + (H - padB) + '"/>';
    s += '<polyline class="line" points="' + pts.join(' ') + '"/>';

    /* 坐标轴数字 */
    s += '<text class="lbl" x="' + (padL - 6) + '" y="' + (H - padB + 3) + '" text-anchor="end">0</text>';
    s += '<text class="lbl" x="' + (padL - 6) + '" y="' + (padT + 4) + '" text-anchor="end">' + sig(FMax, 3) + '</text>';
    s += '<text class="lbl" x="' + (W - padR) + '" y="' + (H - padB + 16) + '" text-anchor="end">' + sig(fMax, 3) + ' mm</text>';
    s += '<text class="lbl" x="' + padL + '" y="' + (H - padB + 16) + '">0</text>';
    s += '<text class="lbl" x="' + padL + '" y="' + (padT - 5) + '">N</text>';

    /* 工作点 */
    if (markerF > 0 && markerF <= fMax) {
      var Fm = rows[0].F + (rows[rows.length - 1].F - rows[0].F) * (markerF / fMax);
      var mx = X(markerF), my = Y(Fm);
      s += '<line class="grid" x1="' + mx.toFixed(1) + '" y1="' + my.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y2="' + (H - padB) + '" style="stroke-dasharray:3 3"/>';
      s += '<circle class="dot" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="4"/>';
      s += '<text class="lbl-hi" x="' + (mx - 6).toFixed(1) + '" y="' + (my - 9).toFixed(1) + '" text-anchor="middle">' + sig(Fm, 4) + ' N</text>';
    }
    return s;
  }

  /* ---------- 反推 ---------- */
  function paintRev(res) {
    var isExt = state.revType === 'ext';
    set('thT', isExt ? '间距 = d' : '螺距 t');
    set('thLen', isExt ? '本体长 Lb' : '自由长 L0');

    if (!res || !res.ok) {
      set('revInfo', '还差一点信息');
      html('revBody', '');
      html('revChecks', ((res && res.errors) || []).map(function (e) {
        return '<li class="err">' + e + '</li>';
      }).join(''));
      return;
    }
    var list = res.results || [];
    var kind = isExt ? '拉簧' : '压簧';
    set('revInfo', list.length
      ? '共找到 ' + res.total + ' 组能做的' + kind + '，按推荐度排序，前 ' + list.length + ' 组如下（每行一种线径，点"用这组"填进' + kind + '页）'
      : '');

    html('revBody', list.map(function (r, i) {
      return '<tr>'
        + '<td>' + r.d.toFixed(2) + '</td>'
        + '<td>' + r.D.toFixed(2) + '</td>'
        + '<td>' + sig(r.n, 3) + '</td>'
        + '<td>' + r.t.toFixed(2) + '</td>'
        + '<td>' + r.L0.toFixed(1) + '</td>'
        + '<td>' + r.k.toFixed(3) + '</td>'
        + '<td>' + r.F.toFixed(2) + '</td>'
        + '<td>' + r.tau.toFixed(0) + '</td>'
        + '<td>' + (r.util * 100).toFixed(0) + '%</td>'
        + '<td><button class="pick" type="button" data-i="' + i + '">用这组</button></td>'
        + '</tr>';
    }).join(''));

    html('revChecks', (res.checks || []).map(function (c) {
      return '<li class="' + c.level + '">' + c.text + '</li>';
    }).join(''));
  }

  function useRow(i) {
    var res = state.last;
    if (!res || !res.results || !res.results[i]) return;
    var r = res.results[i];
    var isExt = state.revType === 'ext';

    if ($('d')) $('d').value = r.d.toFixed(2);
    if ($('D')) $('D').value = r.D.toFixed(2);
    if ($('travel')) $('travel').value = String(num('travelR', 10));

    if (isExt) {
      if ($('Lb')) $('Lb').value = r.Lb.toFixed(1);
      if ($('F0')) $('F0').value = String(r.F0 || 0);
      setType('ext');
    } else {
      if ($('L0')) $('L0').value = r.L0.toFixed(1);
      if ($('nIn')) $('nIn').value = String(r.n);
      setMode('n');
      setType('comp');
    }
    toast('已填入' + (isExt ? '拉簧' : '压簧') + '页');
  }

  /* ---------- 导出 ---------- */
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function download(name, text) {
    var blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* 把当前结果整理成 [行][列] 的表格 */
  function buildRows() {
    var res = state.last;
    if (!res || !res.ok) return null;
    var rows = [];
    var tauAllow = num('tauAllow', 0);

    if (state.type === 'rev') {
      if (!res.results || !res.results.length) return null;
      var isExtRev = state.revType === 'ext';
      rows.push(['线径 d (mm)', '外径 D (mm)', '有效圈数 n',
                 isExtRev ? '间距=d (mm)' : '螺距 t (mm)',
                 isExtRev ? '本体长 Lb (mm)' : '自由长 L0 (mm)',
                 '刚度 k (N/mm)', '行程 (mm)', '力 F (N)', '切应力 τ (MPa)', '利用率 (%)']);
      res.results.forEach(function (r) {
        rows.push([r.d.toFixed(2), r.D.toFixed(2), r.n, r.t.toFixed(2), r.L0.toFixed(1),
                   r.k.toFixed(3), num('travelR', 0), r.F.toFixed(2), r.tau.toFixed(0),
                   (r.util * 100).toFixed(0)]);
      });
      rows.push([]);
      rows.push([isExtRev ? '反推类型' : '反推类型', isExtRev ? '拉簧' : '压簧', '']);
      rows.push(['空间内径', num('Dmax', 0), 'mm']);
      rows.push([isExtRev ? '本体长度上限' : '空间高度', num(isExtRev ? 'Lbmax' : 'L0max', 0), 'mm']);
      if (isExtRev) rows.push(['初拉力 F0', num('F0r', 0), 'N']);
      rows.push(['许用切应力', tauAllow || '未填', 'MPa']);
      return rows;
    }

    var o = res.out;
    var isExt = o.type === 'ext';
    rows.push(['参数', '数值', '单位']);
    rows.push(['类型', isExt ? '拉簧' : '压簧', '']);
    rows.push(['材料', MAT_BY_G[o.G] || '自定义', '']);
    rows.push(['切变模量 G', o.G, 'MPa']);
    rows.push(['线径 d', o.d, 'mm']);
    rows.push(['外径 D', o.D, 'mm']);
    rows.push([isExt ? '本体长度 Lb' : '自由长度 L0', isExt ? o.Lb : o.L0, 'mm']);
    rows.push(['中径 Dm', o.Dm.toFixed(2), 'mm']);
    rows.push(['有效圈数 n', o.n, '圈']);
    if (!isExt) {
      rows.push(['螺距 t', o.t.toFixed(2), 'mm']);
      rows.push(['压并高度 Ls', ((o.n + 2) * o.d).toFixed(2), 'mm']);
      rows.push(['可用行程', o.fMax.toFixed(2), 'mm']);
    } else {
      rows.push(['允许伸长', o.fAllow.toFixed(2), 'mm']);
      rows.push(['初拉力 F0', o.F0, 'N']);
    }
    rows.push(['弹簧指数 C', o.C.toFixed(2), '']);
    rows.push(['曲度系数 K', o.K.toFixed(3), '']);
    rows.push(['刚度 k', o.k.toFixed(4), 'N/mm']);
    rows.push(['工作行程', o.travel, 'mm']);
    rows.push(['该行程的力 F', o.forceAtTravel.toFixed(3), 'N']);
    rows.push(['工作切应力 τ', o.tau.toFixed(0), 'MPa']);
    rows.push(['许用切应力', tauAllow || '未填', 'MPa']);
    if (tauAllow > 0) rows.push(['应力利用率', (o.tau / tauAllow * 100).toFixed(0), '%']);
    rows.push([]);
    rows.push(['校核', '', '']);
    (res.checks || []).forEach(function (c) { rows.push([c.text, '', '']); });
    return rows;
  }

  function exportCsv() {
    var rows = buildRows();
    if (!rows) { toast('先把参数填完整'); return; }
    var text = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    download('弹簧参数-' + stamp() + '.csv', text);
    toast('CSV 已导出');
  }

  function copyText() {
    var rows = buildRows();
    if (!rows) { toast('先把参数填完整'); return; }
    var text = rows.map(function (r) {
      return r.length >= 3 ? (r[0] + ': ' + r[1] + (r[2] ? ' ' + r[2] : '')) : r.join(' ');
    }).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制'); },
        function () { toast('复制失败，长按手动选'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败'); }
      document.body.removeChild(ta);
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  /* ---------- 事件 ---------- */
  function bind() {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (el) {
        el.addEventListener('click', function () { setType(el.getAttribute('data-type')); });
      })(tabs[i]);
    }

    var segs = document.querySelectorAll('.seg-btn');
    for (var j = 0; j < segs.length; j++) {
      (function (el) {
        el.addEventListener('click', function () { setMode(el.getAttribute('data-mode')); });
      })(segs[j]);
    }

    var revs = document.querySelectorAll('.rev-btn');
    for (var r = 0; r < revs.length; r++) {
      (function (el) {
        el.addEventListener('click', function () { setRevType(el.getAttribute('data-rev')); });
      })(revs[r]);
    }

    var inputs = document.querySelectorAll('input, select');
    for (var k = 0; k < inputs.length; k++) {
      inputs[k].addEventListener('input', render);
      inputs[k].addEventListener('change', render);
    }

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('pick')) return;
      useRow(parseInt(t.getAttribute('data-i'), 10));
    });

    if ($('btnCsv')) $('btnCsv').addEventListener('click', exportCsv);
    if ($('btnCopy')) $('btnCopy').addEventListener('click', copyText);
    if ($('btnPrint')) $('btnPrint').addEventListener('click', function () { window.print(); });
  }

  bind();
  render();

  /* 注册 Service Worker：装到手机桌面后断网也能打开。
     浏览器只允许在 https 或本机地址下注册，普通局域网 http 下会被忽略。 */
  try {
    var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || isLocal)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { });
      });
    }
  } catch (e) { /* 老浏览器没有这一套，不影响计算 */ }

  /* 给 test-ui.js 看的出口（浏览器里不影响任何东西） */
  window.SpringCalcApp = { render: render, setType: setType, setMode: setMode, setRevType: setRevType, state: state };
})();
