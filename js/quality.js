// Quality-engineering routines: control charts, capability, gage R&R, power.
const MQual = (function () {
  'use strict';
  const M = MStats, J = jStat;
  const sum = M.sum, mean = M.mean;

  // Control-chart constants for subgroup sizes 2..25.
  const D2 = [0, 0, 1.128, 1.693, 2.059, 2.326, 2.534, 2.704, 2.847, 2.970, 3.078, 3.173, 3.258, 3.336, 3.407, 3.472, 3.532, 3.588, 3.640, 3.689, 3.735, 3.778, 3.819, 3.858, 3.895, 3.931];
  const D3 = [0, 0, 0.8525, 0.8884, 0.8798, 0.8641, 0.8480, 0.8332, 0.8198, 0.8078, 0.7971, 0.7873, 0.7785, 0.7704, 0.7630, 0.7562, 0.7499, 0.7441, 0.7386, 0.7335, 0.7287, 0.7242, 0.7199, 0.7159, 0.7121, 0.7084];
  const c4 = n => Math.sqrt(2 / (n - 1)) * Math.exp(J.gammaln(n / 2) - J.gammaln((n - 1) / 2));
  const d2 = n => { if (n > 25) throw new Error('Subgroups larger than 25 need the Xbar-S chart.'); return D2[n]; };

  // Tests for special causes. Returns, per point, the list of failed test numbers.
  //  1: beyond 3 sigma   2: 9 in a row on one side   3: 6 in a row rising or falling
  //  5: 2 of 3 beyond 2 sigma (same side)   6: 4 of 5 beyond 1 sigma (same side)
  function runTests(pts, cl, ucl, lcl, full) {
    const n = pts.length, flags = pts.map(() => []);
    const z = pts.map((v, i) => { const s = (ucl[i] - cl[i]) / 3; return s > 0 ? (v - cl[i]) / s : 0; });
    let run = 0, side = 0, up = 0, dn = 0;
    for (let i = 0; i < n; i++) {
      if (pts[i] > ucl[i] + 1e-12 || pts[i] < lcl[i] - 1e-12) flags[i].push(1);
      const s = Math.sign(pts[i] - cl[i]);
      if (s !== 0 && s === side) run++; else { side = s; run = s ? 1 : 0; }
      if (run >= 9) flags[i].push(2);
      if (i > 0) {
        if (pts[i] > pts[i - 1]) { up++; dn = 0; } else if (pts[i] < pts[i - 1]) { dn++; up = 0; } else { up = dn = 0; }
        if (up >= 5 || dn >= 5) flags[i].push(3);
      }
      if (!full) continue;
      for (const sg of [1, -1]) {
        const count = (w, lim) => { let c = 0; for (let j = Math.max(0, i - w + 1); j <= i; j++) if (sg * z[j] > lim) c++; return c; };
        if (i >= 2 && sg * z[i] > 2 && count(3, 2) >= 2) flags[i].push(5);
        if (i >= 4 && sg * z[i] > 1 && count(5, 1) >= 4) flags[i].push(6);
      }
    }
    return flags;
  }

  function chart(name, pts, cl, ucl, lcl, full) {
    const arr = v => Array.isArray(v) ? v : pts.map(() => v);
    const c = { name, pts, cl: arr(cl), ucl: arr(ucl), lcl: arr(lcl) };
    c.flags = runTests(pts, c.cl, c.ucl, c.lcl, full);
    return c;
  }

  // ---------- variables charts ----------
  function imr(x) {
    const mr = x.slice(1).map((v, i) => Math.abs(v - x[i])), mrBar = mean(mr), sigma = mrBar / 1.128, m = mean(x);
    return { sigma, charts: [chart('Individual value', x, m, m + 3 * sigma, m - 3 * sigma, true),
      Object.assign(chart('Moving range', mr, mrBar, 3.267 * mrBar, 0, false), { offset: 1 })] };
  }

  // groups: array of subgroups (arrays). kind: 'R' or 'S'.
  function xbar(groups, kind) {
    const n = groups.map(g => g.length), means = groups.map(mean), grand = sum(groups.map(sum)) / sum(n);
    let sigma, second;
    if (kind === 'R') {
      const r = groups.map(g => Math.max(...g) - Math.min(...g));
      // unbiased estimate weighted by d2²/d3² so unequal subgroup sizes are handled
      const w = n.map(k => (d2(k) / D3[k]) ** 2);
      sigma = sum(r.map((v, i) => w[i] * v / d2(n[i]))) / sum(w);
      second = chart('Sample range', r, n.map(k => d2(k) * sigma), n.map(k => (d2(k) + 3 * D3[k]) * sigma), n.map(k => Math.max(0, (d2(k) - 3 * D3[k]) * sigma)), false);
    } else {
      const df = sum(n.map(k => k - 1));
      sigma = Math.sqrt(sum(groups.map(g => { const m = mean(g); return sum(g.map(v => (v - m) ** 2)); })) / df) / c4(df + 1);
      const s = groups.map(g => M.sd(g));
      second = chart('Sample StDev', s, n.map(k => c4(k) * sigma), n.map(k => (c4(k) + 3 * Math.sqrt(1 - c4(k) ** 2)) * sigma),
        n.map(k => Math.max(0, (c4(k) - 3 * Math.sqrt(1 - c4(k) ** 2)) * sigma)), false);
    }
    return { sigma, charts: [chart('Sample mean', means, grand, n.map(k => grand + 3 * sigma / Math.sqrt(k)), n.map(k => grand - 3 * sigma / Math.sqrt(k)), true), second] };
  }

  // ---------- attribute charts ----------
  function attribute(kind, count, size) {
    if (kind === 'c') { const c = mean(count); return { charts: [chart('Count', count, c, c + 3 * Math.sqrt(c), Math.max(0, c - 3 * Math.sqrt(c)), false)], center: c }; }
    const tot = sum(count) / sum(size);
    if (kind === 'u') return { center: tot, charts: [chart('Count per unit', count.map((v, i) => v / size[i]), tot,
      size.map(k => tot + 3 * Math.sqrt(tot / k)), size.map(k => Math.max(0, tot - 3 * Math.sqrt(tot / k))), false)] };
    const se = k => Math.sqrt(tot * (1 - tot) / k);
    if (kind === 'np') {
      const k = size[0];
      if (size.some(v => v !== k)) throw new Error('The NP chart needs a constant sample size; use the P chart.');
      return { center: tot, charts: [chart('Number defective', count, k * tot, Math.min(k, k * (tot + 3 * se(k))), Math.max(0, k * (tot - 3 * se(k))), false)] };
    }
    return { center: tot, charts: [chart('Proportion', count.map((v, i) => v / size[i]), tot, size.map(k => Math.min(1, tot + 3 * se(k))), size.map(k => Math.max(0, tot - 3 * se(k))), false)] };
  }

  // ---------- capability ----------
  // Within-subgroup sigma: moving range for individuals, pooled SD for subgroups.
  function withinSigma(groups) {
    if (groups.every(g => g.length === 1)) { const x = groups.map(g => g[0]); return mean(x.slice(1).map((v, i) => Math.abs(v - x[i]))) / 1.128; }
    const df = sum(groups.map(g => g.length - 1));
    return Math.sqrt(sum(groups.map(g => { const m = mean(g); return sum(g.map(v => (v - m) ** 2)); })) / df) / c4(df + 1);
  }

  function capability(x, o) {
    const m = mean(x), so = M.sd(x), sw = o.sigmaWithin, { lsl, usl, target } = o, both = lsl != null && usl != null, n = x.length;
    const idx = s => {
      const l = lsl != null ? (m - lsl) / (3 * s) : NaN, u = usl != null ? (usl - m) / (3 * s) : NaN;
      return { p: both ? (usl - lsl) / (6 * s) : NaN, l, u, k: Math.min(...[l, u].filter(isFinite)) };
    };
    const ppm = s => {
      const lo = lsl != null ? 1e6 * M.normCdf((lsl - m) / s) : 0, hi = usl != null ? 1e6 * (1 - M.normCdf((usl - m) / s)) : 0;
      return { lo, hi, total: lo + hi, z: M.normInv(1 - (lo + hi) / 1e6) };
    };
    const obsLo = lsl != null ? x.filter(v => v < lsl).length : 0, obsHi = usl != null ? x.filter(v => v > usl).length : 0;
    return {
      n, mean: m, sdOverall: so, sdWithin: sw, within: idx(sw), overall: idx(so), ppmWithin: ppm(sw), ppmOverall: ppm(so),
      observed: { lo: 1e6 * obsLo / n, hi: 1e6 * obsHi / n, total: 1e6 * (obsLo + obsHi) / n },
      cpm: both && target != null ? (usl - lsl) / (6 * Math.sqrt(so * so + (m - target) ** 2)) : NaN
    };
  }

  // ---------- gage R&R (crossed, ANOVA method) ----------
  function gageRR(part, oper, y, tol) {
    const P = [...new Set(part)], O = [...new Set(oper)], p = P.length, o = O.length;
    if (p < 2 || o < 2) throw new Error('Gage R&R needs at least two parts and two operators.');
    const cell = P.map(() => O.map(() => []));
    y.forEach((v, i) => cell[P.indexOf(part[i])][O.indexOf(oper[i])].push(v));
    const r = cell[0][0].length;
    if (r < 2 || cell.some(row => row.some(c => c.length !== r))) throw new Error('Every operator must measure every part the same number of times (at least twice).');
    const g = mean(y), pm = cell.map(row => mean([].concat(...row))), om = O.map((_, j) => mean([].concat(...cell.map(row => row[j]))));
    const cm = cell.map(row => row.map(mean));
    const ssP = o * r * sum(pm.map(v => (v - g) ** 2)), ssO = p * r * sum(om.map(v => (v - g) ** 2));
    const ssPO = r * sum(cm.map((row, i) => sum(row.map((v, j) => (v - pm[i] - om[j] + g) ** 2))));
    const ssE = sum(cell.map((row, i) => sum(row.map((c, j) => sum(c.map(v => (v - cm[i][j]) ** 2))))));
    const dfP = p - 1, dfO = o - 1, dfPO = dfP * dfO, dfE = p * o * (r - 1);
    const msP = ssP / dfP, msO = ssO / dfO, msPO = ssPO / dfPO, msE = ssE / dfE;
    const sf = (f, a, b) => 1 - J.centralF.cdf(f, a, b);
    const pPO = sf(msPO / msE, dfPO, dfE), pooled = pPO > 0.05;
    const den = pooled ? (ssPO + ssE) / (dfPO + dfE) : msPO, dfDen = pooled ? dfPO + dfE : dfPO;
    const anova = [
      ['Part', dfP, ssP, msP, msP / den, sf(msP / den, dfP, dfDen)], ['Operator', dfO, ssO, msO, msO / den, sf(msO / den, dfO, dfDen)]
    ].concat(pooled ? [['Repeatability', dfDen, ssPO + ssE, den, NaN, NaN]]
      : [['Part × Operator', dfPO, ssPO, msPO, msPO / msE, pPO], ['Repeatability', dfE, ssE, msE, NaN, NaN]]);
    const pos = v => Math.max(0, v);
    const repeat = pooled ? den : msE, vO = pos((msO - den) / (p * r)), vPO = pooled ? 0 : pos((msPO - msE) / r), vP = pos((msP - den) / (o * r));
    const grr = repeat + vO + vPO, total = grr + vP;
    const rows = [['Total Gage R&R', grr], ['  Repeatability', repeat], ['  Reproducibility', vO + vPO], ['    Operator', vO]]
      .concat(pooled ? [] : [['    Operator × Part', vPO]], [['Part-to-Part', vP], ['Total Variation', total]])
      .map(([name, v]) => ({ name, v, pctContribution: 100 * v / total, sd: Math.sqrt(v), studyVar: 6 * Math.sqrt(v),
        pctStudy: 100 * Math.sqrt(v / total), pctTol: tol ? 100 * 6 * Math.sqrt(v) / tol : NaN }));
    return { anova, rows, pooled, ndc: Math.max(1, Math.floor(1.41 * Math.sqrt(vP / grr))), parts: P, operators: O, cellMeans: cm, replicates: r };
  }

  // ---------- power and sample size for t tests ----------
  // type: 'one' (also paired differences) or 'two' (n is per group).
  function tPower(n, delta, sd, alpha, type, alt) {
    const df = type === 'two' ? 2 * n - 2 : n - 1, ncp = Math.abs(delta) / sd * Math.sqrt(type === 'two' ? n / 2 : n);
    if (df < 1) return 0;
    const cdf = t => J.noncentralt.cdf(t, df, ncp);
    if (alt !== 'ne') return 1 - cdf(M.tInv(1 - alpha, df));
    const tc = M.tInv(1 - alpha / 2, df);
    return 1 - cdf(tc) + cdf(-tc);
  }
  function tSampleSize(power, delta, sd, alpha, type, alt) {
    let hi = 2;
    while (tPower(hi, delta, sd, alpha, type, alt) < power) { hi *= 2; if (hi > 1e7) throw new Error('The required sample size is impractically large.'); }
    let lo = Math.max(2, hi / 2);
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (tPower(mid, delta, sd, alpha, type, alt) >= power) hi = mid; else lo = mid + 1; }
    return hi;
  }

  return { imr, xbar, attribute, withinSigma, capability, gageRR, tPower, tSampleSize, c4 };
})();
