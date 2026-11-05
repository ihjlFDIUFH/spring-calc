/* =========================================================
   弹簧计算核心 —— spring-math.js
   这里只有公式，不碰页面。
   好处：可以在 Node 里单独跑测试，改公式时不会把界面改坏。

   单位约定（整个文件统一）：
     长度 mm      力 N      应力 MPa (= N/mm²)      刚度 N/mm
   ========================================================= */
(function (root) {
  'use strict';

  /* 常见材料的切变模量 G（MPa）。
     G 越大，弹簧越"硬"。数值随牌号/热处理变化，这里给常用参考值。
     allow 是这个材料常见的许用切应力参考值（静载、常温、有良好热处理），
     实际要按 σb 和你的安全系数算，只能当起点。 */
  const MATERIALS = {
    carbon:    { name: '碳素弹簧钢 / 琴钢丝', G: 79000, allow: 700 },
    si2mn:     { name: '60Si2Mn（60硅2锰）', G: 78500, allow: 750 },
    crsi:      { name: '55CrSi（55铬硅）',   G: 78500, allow: 800 },
    stainless: { name: '不锈钢丝 0Cr17Ni7',  G: 73000, allow: 450 },
    brass:     { name: '黄铜 / 磷青铜',      G: 40000, allow: 200 }
  };

  /* 曲度系数（Wahl 系数）：钢丝内侧应力比平均值高，用 K 修正。
     K = (4C-1)/(4C-4) + 0.615/C ，C = 中径/线径 */
  function wahlFactor(C) {
    return (4 * C - 1) / (4 * C - 4) + 0.615 / C;
  }

  /* 刚度 k = G·d⁴ / (8·Dm³·n)
     直觉理解：线径 d 变成 4 次方（越细越软，而且软得飞快），
               中径 Dm 是 3 次方（越大越软），圈数 n 一次方。 */
  function stiffness(G, d, Dm, n) {
    return (G * Math.pow(d, 4)) / (8 * Math.pow(Dm, 3) * n);
  }

  /* 切应力 τ = K · 8·F·Dm / (π·d³) */
  function shearStress(F, Dm, d, C) {
    return (wahlFactor(C) * 8 * F * Dm) / (Math.PI * Math.pow(d, 3));
  }

  /* 弹簧的实际圈数通常是 0.5 的整数倍，结果取整到 0.5 */
  function roundHalf(x) { return Math.round(x * 2) / 2; }

  /* ---------------- 压簧 ---------------- */
  function compression(o) {
    const errors = [];
    const d = o.d, D = o.D, L0 = o.L0, G = o.G;

    if (!(d > 0)) errors.push('线径 d 要填一个大于 0 的数');
    if (!(D > 0)) errors.push('外径 D 要填一个大于 0 的数');
    if (!(L0 > 0)) errors.push('自由长度 L0 要填一个大于 0 的数');
    if (errors.length) return { ok: false, errors };

    const Dm = D - d;            // 中径
    if (Dm <= 0) return { ok: false, errors: ['外径必须大于线径（外径 = 中径 + 线径）'] };

    const C = Dm / d;            // 弹簧指数
    let n, k;

    if (o.mode === 'k') {
      /* 已知"想要的刚度"，反推圈数：
         n = G·d⁴ / (8·Dm³·k) */
      if (!(o.kTarget > 0)) return { ok: false, errors: ['请填写目标刚度 k（N/mm）'] };
      const nRaw = (G * Math.pow(d, 4)) / (8 * Math.pow(Dm, 3) * o.kTarget);
      n = Math.max(0.5, roundHalf(nRaw));
      k = stiffness(G, d, Dm, n);
    } else {
      if (!(o.n > 0)) return { ok: false, errors: ['请填写有效圈数 n'] };
      n = o.n;
      k = stiffness(G, d, Dm, n);
    }

    /* 两端并紧磨平：自由高度 L0 = n·t + 2d，压并高度 Ls = (n+2)·d
       → 螺距 t = (L0 - 2d) / n */
    const t = (L0 - 2 * d) / n;
    const Ls = (n + 2) * d;
    const fMax = L0 - Ls;               // 压到并死前还能走多少行程
    const travel = Math.min(Math.max(o.travel || 0, 0), Math.max(fMax, 0));
    const F = k * travel;
    const tau = shearStress(F, Dm, d, C);
    const tauMax = shearStress(k * Math.max(fMax, 0), Dm, d, C);

    const checks = [];
    checks.push(indexCheck(C));

    if (t <= d) {
      checks.push({ level: 'err', text: '螺距 t ≤ 线径 d：圈与圈已经压死，自由长度不够或圈数太多' });
    } else if (t < 1.2 * d) {
      checks.push({ level: 'warn', text: '螺距只有线径的 ' + (t / d).toFixed(2) + ' 倍，间隙偏小，容易并圈' });
    } else {
      checks.push({ level: 'ok', text: '螺距 ' + t.toFixed(2) + ' mm，圈间间隙 ' + (t - d).toFixed(2) + ' mm，正常' });
    }

    if (fMax > 0) {
      checks.push({ level: 'ok', text: '可用行程 ' + fMax.toFixed(1) + ' mm（自由长度 − 压并高度）' });
    } else {
      checks.push({ level: 'err', text: '自由长度比压并高度还小，这根弹簧装不起来' });
    }

    const b = L0 / Dm;                  // 细长比，判断会不会失稳
    if (b > 5.3) checks.push({ level: 'warn', text: '细长比 L0/Dm = ' + b.toFixed(1) + ' > 5.3，两端固定也可能失稳，建议加导杆' });
    else checks.push({ level: 'ok', text: '细长比 L0/Dm = ' + b.toFixed(1) + '，失稳风险低' });

    if (o.tauAllow > 0) {
      const u = tau / o.tauAllow;
      checks.push({
        level: u > 1 ? 'err' : (u > 0.85 ? 'warn' : 'ok'),
        text: '工作应力 ' + tau.toFixed(0) + ' / 许用 ' + o.tauAllow + ' MPa（' + (u * 100).toFixed(0) + '%）'
      });
    }

    return {
      ok: true, errors: [], checks,
      out: {
        type: 'comp', d, D, Dm, L0, G, C, K: wahlFactor(C),
        n, nRaw: o.mode === 'k' ? (G * Math.pow(d, 4)) / (8 * Math.pow(Dm, 3) * o.kTarget) : n,
        t, Ls, L0, fMax, travel, k,
        forceAtTravel: F, tau, tauMax,
        table: buildTable(fMax, k, 0),
        fMax
      }
    };
  }

  /* ---------------- 拉簧 ---------------- */
  function extension(o) {
    const errors = [];
    const d = o.d, D = o.D, Lb = o.Lb, G = o.G;

    if (!(d > 0)) errors.push('线径 d 要填一个大于 0 的数');
    if (!(D > 0)) errors.push('外径 D 要填一个大于 0 的数');
    if (!(Lb > 0)) errors.push('本体长度 Lb 要填一个大于 0 的数');
    if (errors.length) return { ok: false, errors };

    const Dm = D - d;
    if (Dm <= 0) return { ok: false, errors: ['外径必须大于线径'] };

    const C = Dm / d;
    /* 拉簧本体是并紧的：每圈占一个线径，所以圈数 ≈ 本体长度 ÷ 线径
       （这是"量一量就能算出圈数"的原理） */
    const nRaw = Lb / d;
    const n = Math.max(0.5, roundHalf(nRaw));
    const k = stiffness(G, d, Dm, n);
    const F0 = Math.max(o.F0 || 0, 0);
    const travel = Math.max(o.travel || 0, 0);
    const F = F0 + k * travel;
    const tau = shearStress(F, Dm, d, C);
    const tau0 = shearStress(F0, Dm, d, C);

    const checks = [];
    checks.push(indexCheck(C));
    checks.push({
      level: 'ok',
      text: '本体长度 ' + Lb + ' mm ÷ 线径 ' + d + ' mm ≈ ' + n + ' 圈（并紧卷绕）'
    });
    if (Math.abs(nRaw - n) > 0.4) {
      checks.push({ level: 'warn', text: '圈数取整后本体长度会有偏差，如需精确请手动核对' });
    }
    if (F0 > 0) {
      checks.push({ level: 'ok', text: '初拉力 ' + F0 + ' N 对应初始切应力 τ₀ ≈ ' + tau0.toFixed(0) + ' MPa' });
    } else {
      checks.push({ level: 'warn', text: '初拉力填了 0：算出来的是"纯弹簧力"。实际冷卷拉簧通常有初拉力，建议实测或问供应商' });
    }
    if (o.tauAllow > 0) {
      const u = tau / o.tauAllow;
      checks.push({
        level: u > 1 ? 'err' : (u > 0.85 ? 'warn' : 'ok'),
        text: '行程 ' + travel + ' mm 时应力 ' + tau.toFixed(0) + ' / 许用 ' + o.tauAllow + ' MPa（' + (u * 100).toFixed(0) + '%）'
      });
    }

    /* 拉到许用应力为止能走多远 —— 比"最大行程"更有意义的参考值 */
    let fAllow = Infinity;
    if (o.tauAllow > 0 && k > 0) {
      const Fallow = (o.tauAllow * Math.PI * Math.pow(d, 3)) / (wahlFactor(C) * 8 * Dm);
      fAllow = Math.max(0, (Fallow - F0) / k);
    }

    return {
      ok: true, errors: [], checks,
      out: {
        type: 'ext', d, D, Dm, Lb, G, C, K: wahlFactor(C),
        n, nRaw, t: d, k, F0, travel, forceAtTravel: F, tau, tau0, fAllow,
        table: buildTable(travel > 0 ? travel : 10, k, F0),
        fMax: travel > 0 ? travel : 10
      }
    };
  }

  /* 弹簧指数 C 的通用判断：4~16 可做，5~10 最舒服 */
  function indexCheck(C) {
    if (C < 4) return { level: 'err', text: '弹簧指数 C = ' + C.toFixed(2) + ' < 4：太"胖"，卷制困难和应力集中都很大' };
    if (C > 16) return { level: 'err', text: '弹簧指数 C = ' + C.toFixed(2) + ' > 16：太"细"，容易颤动、尺寸不稳' };
    if (C >= 5 && C <= 10) return { level: 'ok', text: '弹簧指数 C = ' + C.toFixed(2) + '，在推荐区间 5–10 内' };
    return { level: 'warn', text: '弹簧指数 C = ' + C.toFixed(2) + '，能用，但推荐区间是 5–10' };
  }

  /* 生成"行程 → 力"的对照表：0 / 25% / 50% / 75% / 100% 行程 */
  function buildTable(fMax, k, F0) {
    const rows = [];
    for (let i = 0; i <= 4; i++) {
      const f = fMax * i / 4;
      rows.push({ f: f, F: F0 + k * f });
    }
    return rows;
  }

  /* ---------------- 反向求解：给空间和目标刚度，倒推出一批能用的方案 ----------------
     机器能做的就是"穷举 + 筛选"，这也是人手算不出来的部分：
       线径 d 从小到大扫一遍；
       中径 Dm 从 4d 扫到 16d（也就是弹簧指数 C 在 4~16 之间）；
       每对 (d, Dm) 都能直接反解出需要的圈数 n = G·d⁴ / (8·Dm³·k)；
       再把 n 取整到 0.5、回算真实刚度、算螺距/自由长度/应力，逐条过关才留下。
     这样出来的是"能用的一批"，不是唯一答案 —— 弹簧本来就没有唯一解。 */
  function reverseCompression(o) {
    const errors = [];
    const Dmax = o.Dmax, L0max = o.L0max, kTarget = o.k;
    const travel = Math.max(o.travel || 0, 0);
    if (!(Dmax > 0)) errors.push('请填写安装空间内径（弹簧外径上限）');
    if (!(L0max > 0)) errors.push('请填写安装空间高度（自由长度上限）');
    if (!(kTarget > 0)) errors.push('请填写目标刚度 k（也可以填"行程力"让工具换算）');
    if (!(travel > 0)) errors.push('请填写工作行程 f（要压缩多少毫米）');
    if (errors.length) return { ok: false, errors, results: [], total: 0, checks: [] };

    const G = o.G;
    const tauAllow = o.tauAllow > 0 ? o.tauAllow : 0;
    const hits = [];
    const reject = { fit: 0, round: 0, length: 0, pitch: 0, stress: 0 };
    const dMax = Math.min(Dmax / 4.4, 12);

    for (let i = 0; ; i++) {
      const d = Math.round((0.2 + i * 0.05) * 1000) / 1000;
      if (d > dMax + 1e-9) break;
      const dmLo = 4 * d;
      const dmHi = Math.min(16 * d, Dmax - d);
      if (dmHi < dmLo - 1e-9) { reject.fit++; continue; }
      const step = Math.max(0.1, Math.round(d * 5) / 100);
      for (let Dm = dmLo; Dm <= dmHi + 1e-9; Dm += step) {
        const Dmr = Math.round(Dm * 100) / 100;
        const C = Dmr / d;
        if (C < 3.999 || C > 16.001) continue;

        const nRaw = (G * Math.pow(d, 4)) / (8 * Math.pow(Dmr, 3) * kTarget);
        if (!(nRaw >= 0.5)) { reject.round++; continue; }
        const n = roundHalf(nRaw);
        if (n < 0.5 || n > 40 || Math.abs(nRaw - n) / n > 0.12) { reject.round++; continue; }

        const k = stiffness(G, d, Dmr, n);
        if (Math.abs(k - kTarget) / kTarget > 0.12) { reject.round++; continue; }

        const Ls = (n + 2) * d;
        /* 自由长度取"刚好够用"的最小值：既要能压到行程，又要让螺距 ≥ 1.2d */
        const L0 = Math.max(Ls + travel, n * 1.2 * d + 2 * d);
        if (L0 > L0max + 1e-9) { reject.length++; continue; }

        const t = (L0 - 2 * d) / n;
        if (!(t > d)) { reject.pitch++; continue; }

        const F = k * travel;
        const tau = shearStress(F, Dmr, d, C);
        if (tauAllow > 0 && tau > tauAllow) { reject.stress++; continue; }

        hits.push({
          d: d, D: Dmr + d, Dm: Dmr, C: C, K: wahlFactor(C),
          n: n, t: t, L0: L0, Ls: Ls, fMax: L0 - Ls,
          k: k, F: F, tau: tau,
          util: tauAllow > 0 ? tau / tauAllow : 0
        });
      }
    }

    /* 推荐度打分：越小越好。
       ① 弹簧指数落在 5~10 的加分（可用性）
       ② 应力利用率往 85% 靠 —— 太满没有余量，太空就浪费材料
       ③ 圈数越少越短越紧凑 */
    const score = (r) =>
      (r.C >= 5 && r.C <= 10 ? 0 : 5) +
      Math.abs(Math.min(r.util, 1) - 0.85) * 5 +
      (r.L0 / L0max) * 2 +
      (r.n / 40) * 1.5;
    hits.sort(function (a, b) { return score(a) - score(b); });

    /* 同一种线径只留最优的一组，让表里每行都是不同的线径，方便挑 */
    const seen = {};
    const picked = [];
    for (let i = 0; i < hits.length && picked.length < 40; i++) {
      const key = hits[i].d.toFixed(2);
      if (seen[key]) continue;
      seen[key] = 1;
      picked.push(hits[i]);
    }

    const checks = [];
    if (!picked.length) {
      checks.push({ level: 'err', text: '这个空间和刚度下没有找到能做的方案。' });
      const worst = Object.keys(reject).sort(function (a, b) { return reject[b] - reject[a]; })[0];
      if (worst === 'stress') checks.push({ level: 'warn', text: '主要卡在应力：目标刚度偏大，或许用切应力填得太低。' });
      else if (worst === 'length') checks.push({ level: 'warn', text: '主要卡在装不进高度：把自由长度上限放宽，或把目标刚度调小。' });
      else if (worst === 'round') checks.push({ level: 'warn', text: '主要卡在圈数取整：刚度要求太"刁"，调成整圈附近更容易做。' });
      else checks.push({ level: 'warn', text: '主要卡在空间：内径太小，装不下合适的线径和圈数。' });
      checks.push({ level: 'warn', text: '可以试着把空间内径或高度放宽 20%，看看方案会不会出现。' });
    } else {
      checks.push({ level: 'ok', text: '共筛出 ' + picked.length + ' 组可行方案（每种线径留最优一组），下表按推荐度排序。' });
      if (tauAllow <= 0) checks.push({ level: 'warn', text: '没填许用切应力，表里的应力只算出来没筛选，自己对照材料看。' });
    }

    return {
      ok: true, errors: [], checks: checks,
      total: picked.length,
      results: picked.slice(0, 8)
    };
  }

  /* ------------- 反向求解（拉簧）：给空间、刚度和行程，倒推能做的方案 -------------
     拉簧比压簧简单一点：本体是并紧的，所以圈数一改，本体长度就跟着变 ——
       本体长度 Lb = n · d　（相邻两圈贴在一起，所以螺距 = 线径）
     于是"空间够不够"这件事就变成了 Lb ≤ Lbmax。
     扫法跟压簧一样：线径 × 中径，反解圈数，再验算长度和应力。 */
  function reverseExtension(o) {
    const errors = [];
    const Dmax = o.Dmax, Lbmax = o.Lbmax, kTarget = o.k;
    const travel = Math.max(o.travel || 0, 0);
    const F0 = Math.max(o.F0 || 0, 0);
    if (!(Dmax > 0)) errors.push('请填写安装空间内径（弹簧外径上限）');
    if (!(Lbmax > 0)) errors.push('请填写本体长度上限（不含两头的钩）');
    if (!(kTarget > 0)) errors.push('请填写目标刚度 k（也可以填"行程力"让工具换算）');
    if (!(travel > 0)) errors.push('请填写工作行程 f（要拉开多少毫米）');
    if (errors.length) return { ok: false, errors, results: [], total: 0, checks: [] };

    const G = o.G;
    const tauAllow = o.tauAllow > 0 ? o.tauAllow : 0;
    const hits = [];
    const reject = { fit: 0, round: 0, length: 0, stress: 0 };
    const dMax = Math.min(Dmax / 4.4, 12);

    for (let i = 0; ; i++) {
      const d = Math.round((0.2 + i * 0.05) * 1000) / 1000;
      if (d > dMax + 1e-9) break;
      const dmLo = 4 * d;
      const dmHi = Math.min(16 * d, Dmax - d);
      if (dmHi < dmLo - 1e-9) { reject.fit++; continue; }
      const step = Math.max(0.1, Math.round(d * 5) / 100);
      for (let Dm = dmLo; Dm <= dmHi + 1e-9; Dm += step) {
        const Dmr = Math.round(Dm * 100) / 100;
        const C = Dmr / d;
        if (C < 3.999 || C > 16.001) continue;

        const nRaw = (G * Math.pow(d, 4)) / (8 * Math.pow(Dmr, 3) * kTarget);
        if (!(nRaw >= 1)) { reject.round++; continue; }
        const n = roundHalf(nRaw);
        if (n < 3 || n > 100 || Math.abs(nRaw - n) / n > 0.12) { reject.round++; continue; }

        const k = stiffness(G, d, Dmr, n);
        if (Math.abs(k - kTarget) / kTarget > 0.12) { reject.round++; continue; }

        const Lb = n * d;
        if (Lb > Lbmax + 1e-9) { reject.length++; continue; }

        const F = F0 + k * travel;
        const K = wahlFactor(C);
        const tau = (K * 8 * F * Dmr) / (Math.PI * Math.pow(d, 3));
        if (tauAllow > 0 && tau > tauAllow) { reject.stress++; continue; }

        /* 拉到许用应力的力，再折成还能拉多长 */
        const Fallow = tauAllow > 0 ? (tauAllow * Math.PI * Math.pow(d, 3)) / (K * 8 * Dmr) : Infinity;
        const fAllow = tauAllow > 0 ? Math.max((Fallow - F0) / k, 0) : Infinity;
        if (tauAllow > 0 && fAllow < travel - 1e-9) { reject.stress++; continue; }

        hits.push({
          d: d, D: Dmr + d, Dm: Dmr, C: C, K: K,
          n: n, t: d, L0: Lb, Lb: Lb, k: k, F: F, F0: F0,
          tau: tau, fAllow: fAllow,
          util: tauAllow > 0 ? tau / tauAllow : 0
        });
      }
    }

    const score = (r) =>
      (r.C >= 5 && r.C <= 10 ? 0 : 5) +
      Math.abs(Math.min(r.util, 1) - 0.85) * 5 +
      (r.Lb / Lbmax) * 2 +
      (r.n / 40) * 1.5;
    hits.sort(function (a, b) { return score(a) - score(b); });

    const seen = {};
    const picked = [];
    for (let i = 0; i < hits.length && picked.length < 40; i++) {
      const key = hits[i].d.toFixed(2);
      if (seen[key]) continue;
      seen[key] = 1;
      picked.push(hits[i]);
    }

    const checks = [];
    if (!picked.length) {
      checks.push({ level: 'err', text: '这个空间和刚度下没有找到能做的拉簧。' });
      const worst = Object.keys(reject).sort(function (a, b) { return reject[b] - reject[a]; })[0];
      if (worst === 'stress') checks.push({ level: 'warn', text: '主要卡在应力：刚度或行程要求偏大，或许用切应力填得太低。' });
      else if (worst === 'length') checks.push({ level: 'warn', text: '主要卡在本体长度：圈数放不下，把长度上限放宽或把刚度调小。' });
      else if (worst === 'round') checks.push({ level: 'warn', text: '主要卡在圈数取整：刚度要求太"刁"，调成整圈附近更容易做。' });
      else checks.push({ level: 'warn', text: '主要卡在空间：内径太小，装不下合适的线径。' });
      checks.push({ level: 'warn', text: '可以试着把空间内径或本体长度放宽 20%，看看方案会不会出现。' });
    } else {
      checks.push({ level: 'ok', text: '共筛出 ' + picked.length + ' 组可行方案（每种线径留最优一组），下表按推荐度排序。' });
      checks.push({ level: 'warn', text: '表里的长度是本体长度，不含两头的钩；钩形（半圆钩/侧钩/英式钩）还要另加 1~2 倍外径，别算漏了。' });
      if (tauAllow <= 0) checks.push({ level: 'warn', text: '没填许用切应力，表里的应力只算出来没筛选，自己对照材料看。' });
      if (F0 <= 0) checks.push({ level: 'warn', text: '初拉力按 0 算的。实际买来的拉簧都有初拉力，会把整条力线抬高，必须实测后重新算。' });
    }

    return {
      ok: true, errors: [], checks: checks,
      total: picked.length,
      results: picked.slice(0, 8)
    };
  }

  const api = { MATERIALS, wahlFactor, stiffness, shearStress, roundHalf, compression, extension, reverseCompression, reverseExtension };
  root.SpringMath = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
