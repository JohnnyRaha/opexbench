// Statistical routines. Pure functions over plain number arrays; distributions come from jStat.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('jstat'));
  else root.MStats = factory(root.jStat);
})(this, function (jStatLib) {
  'use strict';
  const J = jStatLib.jStat || jStatLib;

  // ---------- basics ----------
  const sum = a => a.reduce((s, v) => s + v, 0);
  const mean = a => sum(a) / a.length;
  const variance = a => { const m = mean(a); return sum(a.map(v => (v - m) ** 2)) / (a.length - 1); };
  const sd = a => Math.sqrt(variance(a));
  const sorted = a => a.slice().sort((x, y) => x - y);

  // Quantile at position (n+1)p with linear interpolation.
  function quantile(a, p) {
    const s = sorted(a), n = s.length, w = (n + 1) * p;
    if (w <= 1) return s[0];
    if (w >= n) return s[n - 1];
    const i = Math.floor(w);
    return s[i - 1] + (w - i) * (s[i] - s[i - 1]);
  }
  const median = a => quantile(a, 0.5);

  const normCdf = z => J.normal.cdf(z, 0, 1);
  const normInv = p => J.normal.inv(p, 0, 1);
  const tCdf = (t, df) => J.studentt.cdf(t, df);
  const tInv = (p, df) => J.studentt.inv(p, df);
  const chiSf = (x, df) => 1 - J.chisquare.cdf(x, df);
  const fSf = (x, d1, d2) => 1 - J.centralF.cdf(x, d1, d2);

  // p-value from the lower-tail probability of the statistic.
  const pval = (c, alt) => alt === 'lt' ? c : alt === 'gt' ? 1 - c : 2 * Math.min(c, 1 - c);

  // Interval est ± crit·se; one-sided alternatives give a single bound.
  function interval(est, se, inv, conf, alt) {
    if (alt === 'lt') return [-Infinity, est + inv(conf) * se];
    if (alt === 'gt') return [est - inv(conf) * se, Infinity];
    const c = inv(1 - (1 - conf) / 2);
    return [est - c * se, est + c * se];
  }

  // Average ranks; also returns Σ(t³ − t) over tie groups.
  function rank(a) {
    const idx = a.map((v, i) => i).sort((i, j) => a[i] - a[j]);
    const r = new Array(a.length);
    let ties = 0;
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && a[idx[j + 1]] === a[idx[i]]) j++;
      const t = j - i + 1;
      for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      ties += t ** 3 - t;
      i = j + 1;
    }
    return { ranks: r, ties };
  }

  function describe(a) {
    const n = a.length, m = mean(a), s = n > 1 ? sd(a) : NaN, srt = sorted(a);
    const z = a.map(v => (v - m) / s);
    const q1 = quantile(a, 0.25), q3 = quantile(a, 0.75);
    return {
      n, mean: m, seMean: s / Math.sqrt(n), sd: s, variance: s * s,
      min: srt[0], q1, median: median(a), q3, max: srt[n - 1],
      range: srt[n - 1] - srt[0], iqr: q3 - q1, sum: sum(a),
      skewness: n > 2 ? n / ((n - 1) * (n - 2)) * sum(z.map(v => v ** 3)) : NaN,
      kurtosis: n > 3 ? n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * sum(z.map(v => v ** 4))
        - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)) : NaN
    };
  }

  // ---------- means ----------
  function oneSampleT(x, mu0, conf, alt) {
    const n = x.length, m = mean(x), s = sd(x), se = s / Math.sqrt(n), df = n - 1;
    const t = (m - mu0) / se;
    return { n, mean: m, sd: s, se, df, t, p: pval(tCdf(t, df), alt), ci: interval(m, se, p => tInv(p, df), conf, alt) };
  }

  function oneSampleZ(x, sigma, mu0, conf, alt) {
    const n = x.length, m = mean(x), se = sigma / Math.sqrt(n), z = (m - mu0) / se;
    return { n, mean: m, sd: n > 1 ? sd(x) : NaN, se, z, p: pval(normCdf(z), alt), ci: interval(m, se, normInv, conf, alt) };
  }

  function twoSampleT(x, y, opt) {
    const n1 = x.length, n2 = y.length, m1 = mean(x), m2 = mean(y), v1 = variance(x), v2 = variance(y);
    let se, df, sp = NaN;
    if (opt.pooled) {
      df = n1 + n2 - 2;
      sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / df);
      se = sp * Math.sqrt(1 / n1 + 1 / n2);
    } else {
      se = Math.sqrt(v1 / n1 + v2 / n2);
      // Welch–Satterthwaite, truncated to an integer
      df = Math.floor((v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)));
    }
    const diff = m1 - m2, t = (diff - opt.diff0) / se;
    return {
      s1: { n: n1, mean: m1, sd: Math.sqrt(v1), se: Math.sqrt(v1 / n1) },
      s2: { n: n2, mean: m2, sd: Math.sqrt(v2), se: Math.sqrt(v2 / n2) },
      diff, se, df, t, sp, p: pval(tCdf(t, df), opt.alt), ci: interval(diff, se, p => tInv(p, df), opt.conf, opt.alt)
    };
  }

  // ---------- proportions ----------
  function oneProportion(x, n, p0, conf, alt) {
    const a = alt === 'ne' ? (1 - conf) / 2 : 1 - conf;
    const lo = alt === 'lt' || x === 0 ? 0 : J.beta.inv(a, x, n - x + 1);
    const hi = alt === 'gt' || x === n ? 1 : J.beta.inv(1 - a, x + 1, n - x);
    const pmf = k => J.binomial.pdf(k, n, p0);
    let p = 0;
    if (alt === 'lt') for (let k = 0; k <= x; k++) p += pmf(k);
    else if (alt === 'gt') for (let k = x; k <= n; k++) p += pmf(k);
    else { const px = pmf(x) * (1 + 1e-7); for (let k = 0; k <= n; k++) if (pmf(k) <= px) p += pmf(k); }
    const ph = x / n, z = (ph - p0) / Math.sqrt(p0 * (1 - p0) / n);
    return { x, n, phat: ph, ci: [lo, hi], p: Math.min(1, p), z, pNormal: pval(normCdf(z), alt) };
  }

  function twoProportions(x1, n1, x2, n2, opt) {
    const p1 = x1 / n1, p2 = x2 / n2, diff = p1 - p2;
    const seU = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
    const pp = (x1 + x2) / (n1 + n2);
    const seT = opt.pooled ? Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2)) : seU;
    const z = diff / seT;
    // Fisher's exact test, two-sided: tables no more probable than the observed one
    const N = n1 + n2, m = x1 + x2, h = k => J.hypgeom.pdf(k, N, m, n1);
    const obs = h(x1) * (1 + 1e-7);
    let fisher = 0;
    for (let k = Math.max(0, m - n2); k <= Math.min(m, n1); k++) if (h(k) <= obs) fisher += h(k);
    return { p1, p2, diff, z, p: pval(normCdf(z), opt.alt), ci: interval(diff, seU, normInv, opt.conf, opt.alt), fisher: Math.min(1, fisher) };
  }

  // ---------- variances ----------
  function oneWayAnova(groups) {
    const all = [].concat(...groups.map(g => g.values));
    const N = all.length, k = groups.length, grand = mean(all);
    const ssB = sum(groups.map(g => g.values.length * (mean(g.values) - grand) ** 2));
    const ssW = sum(groups.map(g => { const m = mean(g.values); return sum(g.values.map(v => (v - m) ** 2)); }));
    const dfB = k - 1, dfW = N - k, msB = ssB / dfB, msW = ssW / dfW, F = msB / msW, s = Math.sqrt(msW), ssT = ssB + ssW;
    return {
      N, k, dfB, dfW, ssB, ssW, ssT, msB, msW, F, p: fSf(F, dfB, dfW), s,
      r2: ssB / ssT, r2adj: 1 - msW / (ssT / (N - 1)),
      groups: groups.map(g => ({ name: g.name, n: g.values.length, mean: mean(g.values), sd: g.values.length > 1 ? sd(g.values) : NaN }))
    };
  }

  function groupIntervals(an, conf) {
    const c = tInv(1 - (1 - conf) / 2, an.dfW);
    return an.groups.map(g => [g.mean - c * an.s / Math.sqrt(g.n), g.mean + c * an.s / Math.sqrt(g.n)]);
  }

  // Tukey–Kramer pairwise comparisons.
  function tukey(an, conf) {
    const q = J.tukey.inv(conf, an.k, an.dfW), out = [];
    for (let i = 0; i < an.k; i++) for (let j = i + 1; j < an.k; j++) {
      const a = an.groups[i], b = an.groups[j], diff = b.mean - a.mean;
      const se = an.s * Math.sqrt(1 / a.n + 1 / b.n);
      const half = q / Math.SQRT2 * se;
      out.push({
        pair: b.name + ' − ' + a.name, diff, se, t: diff / se, ci: [diff - half, diff + half],
        p: Math.max(0, 1 - J.tukey.cdf(Math.abs(diff) / se * Math.SQRT2, an.k, an.dfW))
      });
    }
    return out;
  }

  function twoVariances(x, y, conf) {
    const v1 = variance(x), v2 = variance(y), d1 = x.length - 1, d2 = y.length - 1, F = v1 / v2;
    const c = J.centralF.cdf(F, d1, d2), a = (1 - conf) / 2;
    const lev = levene([{ name: '1', values: x }, { name: '2', values: y }]);
    return {
      v1, v2, sd1: Math.sqrt(v1), sd2: Math.sqrt(v2), F, d1, d2, p: 2 * Math.min(c, 1 - c),
      ciRatio: [F / J.centralF.inv(1 - a, d1, d2), F / J.centralF.inv(a, d1, d2)], levene: lev
    };
  }

  // Levene's test using deviations from group medians (Brown–Forsythe).
  function levene(groups) {
    const an = oneWayAnova(groups.map(g => { const m = median(g.values); return { name: g.name, values: g.values.map(v => Math.abs(v - m)) }; }));
    return { stat: an.F, df1: an.dfB, df2: an.dfW, p: an.p };
  }

  // ---------- association ----------
  function pearson(x, y) {
    const n = x.length, mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy), t = r * Math.sqrt((n - 2) / (1 - r * r));
    return { n, r, p: Math.abs(r) >= 1 ? 0 : pval(tCdf(t, n - 2), 'ne') };
  }
  const spearman = (x, y) => pearson(rank(x).ranks, rank(y).ranks);

  function chiSquare(obs) {
    const R = obs.length, C = obs[0].length;
    const rowT = obs.map(sum), colT = obs[0].map((_, j) => sum(obs.map(r => r[j]))), N = sum(rowT);
    let chi = 0, g = 0, small = 0;
    const exp = obs.map((row, i) => row.map((o, j) => {
      const e = rowT[i] * colT[j] / N;
      chi += (o - e) ** 2 / e;
      if (o > 0) g += 2 * o * Math.log(o / e);
      if (e < 5) small++;
      return e;
    }));
    const df = (R - 1) * (C - 1);
    return { expected: exp, rowT, colT, N, chi, g, df, p: chiSf(chi, df), pG: chiSf(g, df), small };
  }

  // ---------- regression ----------
  function invert(A) {
    const n = A.length, M = A.map((r, i) => r.concat(r.map((_, j) => i === j ? 1 : 0)));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-10) throw new Error('The predictors are linearly dependent, so the model cannot be fit.');
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(r => r.slice(n));
  }

  // Ordinary least squares with an intercept. xs is an array of predictor arrays.
  function regression(y, xs, noVif) {
    const n = y.length, k = xs.length, p = k + 1;
    if (n <= p) throw new Error('Not enough rows to fit this model.');
    const X = y.map((_, i) => [1].concat(xs.map(x => x[i])));
    // center predictors before inverting to keep X'X well conditioned
    const mx = xs.map(mean), Xc = X.map(r => r.map((v, j) => j ? v - mx[j - 1] : 1));
    const XtX = Xc[0].map((_, a) => Xc[0].map((_, b) => sum(Xc.map(r => r[a] * r[b]))));
    const inv = invert(XtX);
    const Xty = Xc[0].map((_, a) => sum(Xc.map((r, i) => r[a] * y[i])));
    const bc = inv.map(r => sum(r.map((v, j) => v * Xty[j])));
    const fits = Xc.map(r => sum(r.map((v, j) => v * bc[j])));
    const resid = y.map((v, i) => v - fits[i]);
    const my = mean(y), sse = sum(resid.map(e => e * e)), sst = sum(y.map(v => (v - my) ** 2)), ssr = sst - sse;
    const dfE = n - p, mse = sse / dfE, s = Math.sqrt(mse);
    const lev = Xc.map(r => sum(r.map((v, a) => v * sum(inv[a].map((w, b) => w * r[b])))));
    // back-transform the intercept and its variance to the uncentred scale
    const b0 = bc[0] - sum(mx.map((m, j) => m * bc[j + 1]));
    const c = [1].concat(mx.map(m => -m));
    const var0 = sum(c.map((ca, a) => ca * sum(c.map((cb, b) => cb * inv[a][b]))));
    const coef = [b0].concat(bc.slice(1));
    const se = [Math.sqrt(mse * var0)].concat(bc.slice(1).map((_, j) => Math.sqrt(mse * inv[j + 1][j + 1])));
    const t = coef.map((b, j) => b / se[j]);
    const F = (ssr / k) / mse;
    const press = sum(resid.map((e, i) => (e / (1 - lev[i])) ** 2));
    let vif = null;
    if (k > 1 && !noVif) vif = xs.map((x, j) => {
      try { return 1 / (1 - regression(x, xs.filter((_, m) => m !== j), true).r2); } catch (e) { return Infinity; }
    });
    return {
      n, k, coef, se, t, pv: t.map(v => pval(tCdf(v, dfE), 'ne')), vif,
      fits, resid, stdResid: resid.map((e, i) => e / (s * Math.sqrt(1 - lev[i]))),
      ssr, sse, sst, dfR: k, dfE, msr: ssr / k, mse, F, p: fSf(F, k, dfE), s,
      r2: ssr / sst, r2adj: 1 - mse / (sst / (n - 1)), r2pred: Math.max(0, 1 - press / sst)
    };
  }

  // ---------- normality ----------
  function andersonDarling(x) {
    const s = sorted(x), n = s.length, m = mean(x), d = sd(x);
    const F = s.map(v => Math.min(1 - 1e-15, Math.max(1e-15, normCdf((v - m) / d))));
    let a = 0;
    for (let i = 0; i < n; i++) a += (2 * i + 1) * (Math.log(F[i]) + Math.log(1 - F[n - 1 - i]));
    const ad = -n - a / n, z = ad * (1 + 0.75 / n + 2.25 / (n * n));
    let p;
    if (z >= 0.6) p = Math.exp(1.2937 - 5.709 * z + 0.0186 * z * z);
    else if (z > 0.34) p = Math.exp(0.9177 - 4.279 * z - 1.38 * z * z);
    else if (z > 0.2) p = 1 - Math.exp(-8.318 + 42.796 * z - 59.938 * z * z);
    else p = 1 - Math.exp(-13.436 + 101.14 * z - 223.73 * z * z);
    return { n, mean: m, sd: d, ad, p: Math.min(1, Math.max(0, p)) };
  }

  // Normal scores for a probability plot (median ranks).
  function probPlot(x) {
    const s = sorted(x), n = s.length;
    return { x: s, z: s.map((_, i) => normInv((i + 1 - 0.3) / (n + 0.4))) };
  }

  // ---------- nonparametric ----------
  function mannWhitney(x, y, alt) {
    const n1 = x.length, n2 = y.length, N = n1 + n2, rk = rank(x.concat(y));
    const W = sum(rk.ranks.slice(0, n1)), E = n1 * (N + 1) / 2;
    const v = n1 * n2 / 12 * ((N + 1) - rk.ties / (N * (N - 1)));
    const cc = alt === 'lt' ? 0.5 : alt === 'gt' ? -0.5 : W > E ? -0.5 : W < E ? 0.5 : 0;
    const z = (W - E + cc) / Math.sqrt(v);
    const diffs = [];
    for (const a of x) for (const b of y) diffs.push(a - b);
    return { n1, n2, med1: median(x), med2: median(y), W, U: W - n1 * (n1 + 1) / 2, z, p: Math.min(1, pval(normCdf(z), alt)), estimate: median(diffs) };
  }

  function wilcoxon(x, m0, alt) {
    const d = x.map(v => v - m0).filter(v => v !== 0), n = d.length;
    const rk = rank(d.map(Math.abs));
    const W = sum(rk.ranks.filter((_, i) => d[i] > 0)), E = n * (n + 1) / 4;
    const v = n * (n + 1) * (2 * n + 1) / 24 - rk.ties / 48;
    const cc = alt === 'lt' ? 0.5 : alt === 'gt' ? -0.5 : W > E ? -0.5 : W < E ? 0.5 : 0;
    const z = (W - E + cc) / Math.sqrt(v);
    const walsh = [];
    for (let i = 0; i < x.length; i++) for (let j = i; j < x.length; j++) walsh.push((x[i] + x[j]) / 2);
    return { n: x.length, nTest: n, W, z, p: Math.min(1, pval(normCdf(z), alt)), estimate: median(walsh) };
  }

  function kruskalWallis(groups) {
    const all = [].concat(...groups.map(g => g.values)), N = all.length, rk = rank(all);
    let pos = 0, H = 0;
    const rows = groups.map(g => {
      const n = g.values.length, rbar = mean(rk.ranks.slice(pos, pos + n));
      pos += n;
      H += n * (rbar - (N + 1) / 2) ** 2;
      return { name: g.name, n, median: median(g.values), rbar, z: (rbar - (N + 1) / 2) / Math.sqrt((N + 1) * (N / n - 1) / 12) };
    });
    H *= 12 / (N * (N + 1));
    const Hadj = H / (1 - rk.ties / (N ** 3 - N)), df = groups.length - 1;
    return { N, rows, H, Hadj, df, p: chiSf(H, df), pAdj: chiSf(Hadj, df), hasTies: rk.ties > 0 };
  }

  return {
    sum, mean, variance, sd, sorted, quantile, median, rank, describe, normCdf, normInv, tInv,
    normPdf: (x, m, s) => J.normal.pdf(x, m, s),
    oneSampleT, oneSampleZ, twoSampleT, oneProportion, twoProportions,
    oneWayAnova, groupIntervals, tukey, twoVariances, levene,
    pearson, spearman, chiSquare, regression, andersonDarling, probPlot,
    mannWhitney, wilcoxon, kruskalWallis
  };
});
