// Analysis and graph definitions. Each entry declares its dialog fields and a run(values)
// function that returns output blocks for the session window.
const Analyses = (function () {
  'use strict';
  const M = MStats, S = Sheet;

  // ---------- formatting ----------
  const g = x => {
    if (!isFinite(x)) return isNaN(x) ? '*' : x > 0 ? '∞' : '−∞';
    const a = Math.abs(x);
    if (a === 0) return '0';
    if (a >= 1e7 || a < 1e-4) return x.toExponential(3);
    return x.toFixed(a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 5);
  };
  const f2 = x => isFinite(x) ? x.toFixed(2) : '*';
  const pf = p => isNaN(p) ? '*' : p < 0.001 ? '<0.001' : p.toFixed(3);
  const pct = x => isFinite(x) ? (100 * x).toFixed(2) + '%' : '*';
  const ALT = { ne: '≠', lt: '<', gt: '>' };
  const ciHead = v => v.conf + '% ' + (v.alt === 'lt' ? 'upper bound' : v.alt === 'gt' ? 'lower bound' : 'CI');
  const ciCell = (ci, alt) => alt === 'lt' ? g(ci[1]) : alt === 'gt' ? g(ci[0]) : `(${g(ci[0])}, ${g(ci[1])})`;
  const hyp = (param, v0, alt) => P(`H₀: ${param} = ${v0}    H₁: ${param} ${ALT[alt]} ${v0}`);

  // ---------- output blocks ----------
  const H = text => ({ h: text });
  const P = text => ({ p: text });
  const Note = text => ({ note: text });
  const T = (head, rows, left) => ({ table: { head, rows, left: left || 1 } });
  const Plot = (data, layout) => ({ plot: { data, layout } });

  // ---------- data access ----------
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  const vals = i => S.num(i).filter(isFinite);
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

  // Rows where every listed column has a number.
  function complete(idx) {
    const data = idx.map(S.num), n = Math.min(...data.map(d => d.length)), out = idx.map(() => []);
    for (let r = 0; r < n; r++) if (data.every(d => isFinite(d[r]))) data.forEach((d, j) => out[j].push(d[r]));
    return out;
  }

  function splitBy(yi, gi) {
    const y = S.num(yi), grp = S.raw(gi), map = new Map();
    for (let r = 0; r < Math.min(y.length, grp.length); r++) {
      if (!isFinite(y[r]) || grp[r] === '') continue;
      if (!map.has(grp[r])) map.set(grp[r], []);
      map.get(grp[r]).push(y[r]);
    }
    return [...map.keys()].sort(natural).map(k => ({ name: k, values: map.get(k) }));
  }

  function groupsOf(v, minN) {
    const gs = v.layout === 'stacked' ? splitBy(v.y, v.g) : v.ys.map(i => ({ name: S.label(i), values: vals(i) }));
    need(gs.length >= 2, 'At least two groups are needed.');
    gs.forEach(x => need(x.values.length >= (minN || 2), `Group "${x.name}" has too few observations.`));
    return gs;
  }
  function twoOf(v) {
    const gs = v.layout === 'stacked' ? splitBy(v.y, v.g)
      : [v.a, v.b].map(i => ({ name: S.label(i), values: vals(i) }));
    need(gs.length === 2, `Exactly two groups are needed; the group column has ${gs.length}.`);
    gs.forEach(x => need(x.values.length >= 2, `Sample "${x.name}" has too few observations.`));
    return gs;
  }
  const responseName = v => v.layout === 'stacked' ? S.label(v.y) : 'Response';

  // ---------- reusable dialog fields ----------
  const STACKED = v => v.layout === 'stacked', UNSTACKED = v => v.layout === 'cols';
  const layoutField = def => ({
    key: 'layout', type: 'select', label: 'Data arrangement', def,
    options: [['stacked', 'Values in one column, group labels in another'], ['cols', 'Each group in its own column']]
  });
  const layoutK = () => [layoutField('stacked'),
    { key: 'y', type: 'col', numeric: true, label: 'Response', showIf: STACKED },
    { key: 'g', type: 'col', label: 'Group labels', showIf: STACKED },
    { key: 'ys', type: 'cols', numeric: true, min: 2, label: 'Group columns', showIf: UNSTACKED }];
  const layout2 = () => [layoutField('cols'),
    { key: 'a', type: 'col', numeric: true, label: 'Sample 1', showIf: UNSTACKED },
    { key: 'b', type: 'col', numeric: true, label: 'Sample 2', showIf: UNSTACKED },
    { key: 'y', type: 'col', numeric: true, label: 'Values', showIf: STACKED },
    { key: 'g', type: 'col', label: 'Group labels (two groups)', showIf: STACKED }];
  const conf = () => ({ key: 'conf', type: 'num', label: 'Confidence level (%)', def: 95, min: 50, max: 99.99 });
  const alt = () => ({
    key: 'alt', type: 'select', label: 'Alternative hypothesis', def: 'ne',
    options: [['ne', 'Not equal (two-sided)'], ['lt', 'Less than'], ['gt', 'Greater than']]
  });
  const numCols = (label, min) => ({ key: 'ys', type: 'cols', numeric: true, min: min || 1, label });
  const byField = () => ({ key: 'by', type: 'col', optional: true, label: 'Group by (optional)' });

  // ---------- plotting helpers ----------
  const COLORS = ['#1f6fb2', '#d1495b', '#2e8b57', '#e8a33d', '#7b5ea7', '#3aa6b9', '#8c6d4f', '#6b7280'];
  const axis = (title, extra) => Object.assign({
    title: { text: title, standoff: 8 }, showline: true, linecolor: '#9aa3af', mirror: true,
    gridcolor: '#eceff3', zeroline: false, automargin: true
  }, extra);
  const layout = (title, xt, yt, extra) => Object.assign({
    title: { text: title, font: { size: 15 } }, xaxis: axis(xt), yaxis: axis(yt),
    margin: { l: 60, r: 24, t: 48, b: 52 }, height: 380, showlegend: false,
    font: { family: 'Segoe UI, system-ui, sans-serif', size: 12, color: '#1d2430' },
    plot_bgcolor: '#fff', paper_bgcolor: '#fff'
  }, extra);

  function binning(x) {
    const lo = Math.min(...x), hi = Math.max(...x);
    const k = Math.max(5, Math.min(30, Math.ceil(Math.sqrt(x.length)) + 2));
    const rawStep = (hi - lo) / k || 1, pw = 10 ** Math.floor(Math.log10(rawStep)), fr = rawStep / pw;
    const step = (fr <= 1 ? 1 : fr <= 2 ? 2 : fr <= 5 ? 5 : 10) * pw;
    const start = Math.floor(lo / step) * step, nb = Math.max(1, Math.ceil((hi - start) / step + 1e-9));
    return {
      step, start, nb, centers: Array.from({ length: nb }, (_, i) => start + (i + 0.5) * step),
      count: a => { const c = new Array(nb).fill(0); a.forEach(v => c[Math.min(nb - 1, Math.floor((v - start) / step))]++); return c; }
    };
  }

  function histogram(name, groups, fit) {
    const all = [].concat(...groups.map(x => x.values)), b = binning(all), data = [];
    groups.forEach((gr, i) => {
      data.push({
        type: 'bar', x: b.centers, y: b.count(gr.values), width: b.step, name: gr.name,
        marker: { color: COLORS[i % 8], opacity: groups.length > 1 ? 0.55 : 0.85, line: { color: '#fff', width: 1 } }
      });
      if (fit && gr.values.length > 1) {
        const m = M.mean(gr.values), s = M.sd(gr.values), xs = [];
        for (let j = 0; j <= 80; j++) xs.push(m - 3.5 * s + j * 7 * s / 80);
        data.push({
          type: 'scatter', mode: 'lines', x: xs, y: xs.map(v => gr.values.length * b.step * M.normPdf(v, m, s)),
          line: { color: COLORS[i % 8], width: 2 }, name: gr.name + ' fit', hoverinfo: 'skip', showlegend: false
        });
      }
    });
    return Plot(data, layout('Histogram of ' + name, name, 'Frequency', { barmode: 'overlay', bargap: 0, showlegend: groups.length > 1 }));
  }

  function probabilityPlot(name, x) {
    const pp = M.probPlot(x), ad = M.andersonDarling(x);
    const ticks = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99];
    const zr = Math.max(2.5, Math.abs(pp.z[0]) + 0.3);
    return Plot([
      { type: 'scatter', mode: 'lines', x: [ad.mean - zr * ad.sd, ad.mean + zr * ad.sd], y: [-zr, zr], line: { color: '#d1495b', width: 1.5 }, hoverinfo: 'skip' },
      { type: 'scatter', mode: 'markers', x: pp.x, y: pp.z, marker: { color: COLORS[0], size: 6 } }
    ], layout('Probability Plot of ' + name + ' (Normal)', name, 'Percent', {
      yaxis: axis('Percent', { tickvals: ticks.map(t => M.normInv(t / 100)), ticktext: ticks.map(String), range: [-zr, zr] }),
      annotations: [{
        xref: 'paper', yref: 'paper', x: 0.02, y: 0.98, xanchor: 'left', yanchor: 'top', align: 'left', showarrow: false,
        bgcolor: '#fff', bordercolor: '#d5d9e0', borderpad: 5,
        text: `Mean ${g(ad.mean)}<br>StDev ${g(ad.sd)}<br>N ${ad.n}<br>AD ${ad.ad.toFixed(3)}<br>P-Value ${pf(ad.p)}`
      }]
    }));
  }

  // Deterministic horizontal jitter so repeated runs draw the same picture.
  const jitter = (i, n) => n < 2 ? 0 : (((i * 7919) % 97) / 96 - 0.5) * 0.3;

  function categoryPlot(kind, title, yTitle, groups, confLevel) {
    const data = [], names = groups.map(x => x.name);
    if (kind === 'box') {
      groups.forEach((gr, i) => data.push({
        type: 'box', y: gr.values, name: gr.name, quartilemethod: 'exclusive', boxmean: false,
        marker: { color: COLORS[i % 8] }, line: { width: 1.5 }
      }));
      return Plot(data, layout(title, '', yTitle));
    }
    if (kind === 'points') {
      groups.forEach((gr, i) => data.push({
        type: 'scatter', mode: 'markers', x: gr.values.map((_, j) => i + jitter(j, gr.values.length)), y: gr.values,
        marker: { color: COLORS[i % 8], size: 6, opacity: 0.75 }, name: gr.name
      }));
      data.push({
        type: 'scatter', mode: 'markers', x: groups.map((_, i) => i), y: groups.map(x => M.mean(x.values)), name: 'Mean',
        marker: { color: '#111', symbol: 'line-ew', size: 26, line: { width: 2.5, color: '#111' } }
      });
    } else {
      const means = groups.map(x => M.mean(x.values));
      const half = groups.map(x => M.tInv(1 - (1 - confLevel) / 2, x.values.length - 1) * M.sd(x.values) / Math.sqrt(x.values.length));
      data.push({
        type: 'scatter', mode: 'markers', x: groups.map((_, i) => i), y: means,
        error_y: { type: 'data', array: half, color: COLORS[0], thickness: 1.8, width: 9 }, marker: { color: COLORS[0], size: 9 }
      });
    }
    return Plot(data, layout(title, '', yTitle, {
      xaxis: axis('', { tickvals: names.map((_, i) => i), ticktext: names, range: [-0.6, names.length - 0.4] })
    }));
  }

  // One plot per response when grouped; otherwise all chosen columns side by side.
  function categoryPlots(kind, label, v) {
    const confLevel = (v.conf || 95) / 100, minN = kind === 'interval' ? 2 : 1;
    const ok = gs => gs.filter(x => x.values.length >= minN);
    if (v.by != null) return v.ys.map(i => {
      const gs = ok(splitBy(i, v.by));
      need(gs.length, 'No usable data for ' + S.label(i) + '.');
      return categoryPlot(kind, `${label} of ${S.label(i)} by ${S.label(v.by)}`, S.label(i), gs, confLevel);
    });
    const gs = ok(v.ys.map(i => ({ name: S.label(i), values: vals(i) })));
    need(gs.length, 'The selected columns have too few values.');
    return [categoryPlot(kind, `${label} of ${gs.map(x => x.name).join(', ')}`, 'Data', gs, confLevel)];
  }

  function residualPlots(name, fit) {
    const pp = M.probPlot(fit.stdResid), b = binning(fit.resid), zr = Math.max(2.5, Math.abs(pp.z[0]) + 0.3);
    const ticks = [1, 10, 50, 90, 99], mk = { color: COLORS[0], size: 5 };
    const sub = (t, i) => ({ text: '<b>' + t + '</b>', xref: 'paper', yref: 'paper', x: i % 2 ? 0.79 : 0.21, y: i < 2 ? 1.06 : 0.47, showarrow: false, xanchor: 'center' });
    return Plot([
      { type: 'scatter', mode: 'markers', x: pp.x, y: pp.z, marker: mk },
      { type: 'scatter', mode: 'lines', x: [-zr, zr], y: [-zr, zr], line: { color: '#d1495b', width: 1.2 }, hoverinfo: 'skip' },
      { type: 'scatter', mode: 'markers', x: fit.fits, y: fit.resid, marker: mk, xaxis: 'x2', yaxis: 'y2' },
      { type: 'bar', x: b.centers, y: b.count(fit.resid), width: b.step, marker: { color: COLORS[0], opacity: 0.85, line: { color: '#fff', width: 1 } }, xaxis: 'x3', yaxis: 'y3' },
      { type: 'scatter', mode: 'lines+markers', x: fit.resid.map((_, i) => i + 1), y: fit.resid, marker: mk, line: { color: COLORS[0], width: 1 }, xaxis: 'x4', yaxis: 'y4' }
    ], layout('Residual Plots for ' + name, 'Standardized residual', 'Percent', {
      height: 600, grid: { rows: 2, columns: 2, pattern: 'independent', ygap: 0.28, xgap: 0.16 }, margin: { l: 60, r: 24, t: 80, b: 52 },
      yaxis: axis('Percent', { tickvals: ticks.map(t => M.normInv(t / 100)), ticktext: ticks.map(String), range: [-zr, zr] }),
      xaxis2: axis('Fitted value'), yaxis2: axis('Residual', { zeroline: true, zerolinecolor: '#9aa3af' }),
      xaxis3: axis('Residual'), yaxis3: axis('Frequency'),
      xaxis4: axis('Observation order'), yaxis4: axis('Residual', { zeroline: true, zerolinecolor: '#9aa3af' }),
      annotations: ['Normal probability plot', 'Versus fits', 'Histogram', 'Versus order'].map(sub)
    }));
  }

  function tally(i) {
    const map = new Map();
    S.raw(i).forEach(v => { if (v !== '') map.set(v, (map.get(v) || 0) + 1); });
    const keys = [...map.keys()].sort(natural);
    return { keys, counts: keys.map(k => map.get(k)) };
  }

  // ---------- definitions ----------
  const A = {};

  A.desc = {
    title: 'Descriptive Statistics',
    fields: [numCols('Variables'), byField()],
    run(v) {
      const main = [], more = [];
      v.ys.forEach(i => {
        const sets = v.by != null ? splitBy(i, v.by) : [{ name: '', values: vals(i) }];
        sets.forEach(s => {
          need(s.values.length, S.label(i) + ' has no numeric data.');
          const d = M.describe(s.values), id = [S.label(i)].concat(v.by != null ? [s.name] : []);
          const nMiss = v.by != null ? '' : String(S.num(i).length - d.n);
          main.push(id.concat([String(d.n), nMiss, g(d.mean), g(d.seMean), g(d.sd), g(d.min), g(d.q1), g(d.median), g(d.q3), g(d.max)]));
          more.push(id.concat([g(d.variance), g(d.sum), g(d.range), g(d.iqr), f2(d.skewness), f2(d.kurtosis)]));
        });
      });
      const id = ['Variable'].concat(v.by != null ? [S.label(v.by)] : []);
      return [
        T(id.concat(['N', 'N*', 'Mean', 'SE Mean', 'StDev', 'Minimum', 'Q1', 'Median', 'Q3', 'Maximum']), main, id.length),
        T(id.concat(['Variance', 'Sum', 'Range', 'IQR', 'Skewness', 'Kurtosis']), more, id.length),
        Note('N* is the number of missing values.')
      ];
    }
  };

  A.t1 = {
    title: 'One-Sample t',
    fields: [numCols('Samples'), { key: 'mu0', type: 'num', optional: true, label: 'Hypothesized mean (blank for interval only)' }, conf(), alt()],
    run(v) {
      const test = v.mu0 != null;
      const rows = v.ys.map(i => {
        const x = vals(i);
        need(x.length >= 2, S.label(i) + ' needs at least two values.');
        const r = M.oneSampleT(x, test ? v.mu0 : 0, v.conf / 100, v.alt);
        return [S.label(i), String(r.n), g(r.mean), g(r.sd), g(r.se), ciCell(r.ci, v.alt)].concat(test ? [f2(r.t), pf(r.p)] : []);
      });
      return (test ? [hyp('μ', v.mu0, v.alt)] : []).concat(
        [T(['Variable', 'N', 'Mean', 'StDev', 'SE Mean', ciHead(v)].concat(test ? ['T', 'P'] : []), rows)]);
    }
  };

  A.z1 = {
    title: 'One-Sample Z',
    fields: [numCols('Samples'), { key: 'sigma', type: 'num', label: 'Known standard deviation', min: 1e-12 },
      { key: 'mu0', type: 'num', optional: true, label: 'Hypothesized mean (blank for interval only)' }, conf(), alt()],
    run(v) {
      const test = v.mu0 != null;
      const rows = v.ys.map(i => {
        const x = vals(i);
        need(x.length >= 1, S.label(i) + ' has no numeric data.');
        const r = M.oneSampleZ(x, v.sigma, test ? v.mu0 : 0, v.conf / 100, v.alt);
        return [S.label(i), String(r.n), g(r.mean), g(r.sd), g(r.se), ciCell(r.ci, v.alt)].concat(test ? [f2(r.z), pf(r.p)] : []);
      });
      return (test ? [hyp('μ', v.mu0, v.alt)] : []).concat([P('The assumed standard deviation = ' + v.sigma),
        T(['Variable', 'N', 'Mean', 'StDev', 'SE Mean', ciHead(v)].concat(test ? ['Z', 'P'] : []), rows)]);
    }
  };

  A.t2 = {
    title: 'Two-Sample t',
    fields: layout2().concat([{ key: 'diff0', type: 'num', label: 'Hypothesized difference', def: 0 }, conf(), alt(),
      { key: 'pooled', type: 'check', label: 'Assume equal variances' }]),
    run(v) {
      const [a, b] = twoOf(v), r = M.twoSampleT(a.values, b.values, { pooled: v.pooled, conf: v.conf / 100, alt: v.alt, diff0: v.diff0 });
      const row = (s, d) => [s.name, String(d.n), g(d.mean), g(d.sd), g(d.se)];
      return [
        hyp(`μ(${a.name}) − μ(${b.name})`, v.diff0, v.alt),
        T(['Sample', 'N', 'Mean', 'StDev', 'SE Mean'], [row(a, r.s1), row(b, r.s2)]),
        H('Estimate for difference'),
        T(['Difference', ciHead(v), 'T', 'DF', 'P'], [[g(r.diff), ciCell(r.ci, v.alt), f2(r.t), String(r.df), pf(r.p)]]),
        Note(v.pooled ? 'Both use pooled StDev = ' + g(r.sp) : 'Equal variances are not assumed (Welch).')
      ];
    }
  };

  A.paired = {
    title: 'Paired t',
    fields: [{ key: 'a', type: 'col', numeric: true, label: 'Sample 1' }, { key: 'b', type: 'col', numeric: true, label: 'Sample 2' },
      { key: 'diff0', type: 'num', label: 'Hypothesized mean difference', def: 0 }, conf(), alt()],
    run(v) {
      const [x, y] = complete([v.a, v.b]);
      need(x.length >= 2, 'At least two complete pairs are needed.');
      const d = x.map((a, i) => a - y[i]), r = M.oneSampleT(d, v.diff0, v.conf / 100, v.alt);
      const row = (name, a) => [name, String(a.length), g(M.mean(a)), g(M.sd(a)), g(M.sd(a) / Math.sqrt(a.length))];
      return [
        hyp('μ(difference)', v.diff0, v.alt),
        T(['', 'N', 'Mean', 'StDev', 'SE Mean'], [row(S.label(v.a), x), row(S.label(v.b), y), row('Difference', d)]),
        T([ciHead(v) + ' for mean difference', 'T', 'P'], [[ciCell(r.ci, v.alt), f2(r.t), pf(r.p)]], 0)
      ];
    }
  };

  const countField = (key, label) => ({ key, type: 'num', label, min: 0, integer: true });

  A.p1 = {
    title: 'One Proportion',
    fields: [countField('x', 'Number of events'), countField('n', 'Number of trials'),
      { key: 'p0', type: 'num', label: 'Hypothesized proportion', def: 0.5, min: 0.0001, max: 0.9999 }, conf(), alt()],
    run(v) {
      need(v.n >= 1 && v.x <= v.n, 'Events cannot exceed trials.');
      const r = M.oneProportion(v.x, v.n, v.p0, v.conf / 100, v.alt);
      return [
        hyp('p', v.p0, v.alt),
        T(['X', 'N', 'Sample p', ciHead(v), 'Exact P'], [[String(v.x), String(v.n), g(r.phat), ciCell(r.ci, v.alt), pf(r.p)]], 0),
        Note(`Exact (binomial) method. Normal approximation: Z = ${f2(r.z)}, P = ${pf(r.pNormal)}.`)
      ];
    }
  };

  A.p2 = {
    title: 'Two Proportions',
    fields: [countField('x1', 'Sample 1: events'), countField('n1', 'Sample 1: trials'), countField('x2', 'Sample 2: events'), countField('n2', 'Sample 2: trials'),
      conf(), alt(), { key: 'pooled', type: 'check', label: 'Use pooled estimate of p for the test' }],
    run(v) {
      need(v.n1 >= 1 && v.n2 >= 1 && v.x1 <= v.n1 && v.x2 <= v.n2, 'Events cannot exceed trials.');
      const r = M.twoProportions(v.x1, v.n1, v.x2, v.n2, { pooled: v.pooled, conf: v.conf / 100, alt: v.alt });
      return [
        hyp('p₁ − p₂', 0, v.alt),
        T(['Sample', 'X', 'N', 'Sample p'], [['1', String(v.x1), String(v.n1), g(r.p1)], ['2', String(v.x2), String(v.n2), g(r.p2)]]),
        H('Estimate for difference'),
        T(['Difference', ciHead(v), 'Z', 'P'], [[g(r.diff), ciCell(r.ci, v.alt), f2(r.z), pf(r.p)]], 0),
        P("Fisher's exact test (two-sided): P = " + pf(r.fisher))
      ];
    }
  };

  A.var2 = {
    title: 'Two Variances',
    fields: layout2().concat([conf()]),
    run(v) {
      const [a, b] = twoOf(v), r = M.twoVariances(a.values, b.values, v.conf / 100);
      return [
        P(`H₀: σ(${a.name}) / σ(${b.name}) = 1    H₁: σ(${a.name}) / σ(${b.name}) ≠ 1`),
        T(['Sample', 'N', 'StDev', 'Variance'], [[a.name, String(a.values.length), g(r.sd1), g(r.v1)], [b.name, String(b.values.length), g(r.sd2), g(r.v2)]]),
        P(`Ratio of standard deviations = ${g(Math.sqrt(r.F))}    ${v.conf}% CI for ratio of variances: (${g(r.ciRatio[0])}, ${g(r.ciRatio[1])})`),
        T(['Method', 'DF1', 'DF2', 'Statistic', 'P'], [
          ['F test (normal data)', String(r.d1), String(r.d2), f2(r.F), pf(r.p)],
          ["Levene's test (any continuous)", String(r.levene.df1), String(r.levene.df2), f2(r.levene.stat), pf(r.levene.p)]])
      ];
    }
  };

  A.normality = {
    title: 'Normality Test',
    fields: [numCols('Variables')],
    run(v) {
      const rows = [], plots = [];
      v.ys.forEach(i => {
        const x = vals(i);
        need(x.length >= 3 && M.sd(x) > 0, S.label(i) + ' needs at least three values that are not all equal.');
        const r = M.andersonDarling(x);
        rows.push([S.label(i), String(r.n), g(r.mean), g(r.sd), r.ad.toFixed(3), pf(r.p)]);
        plots.push(probabilityPlot(S.label(i), x));
      });
      return [P('H₀: the data follow a normal distribution (Anderson–Darling test)'),
        T(['Variable', 'N', 'Mean', 'StDev', 'AD', 'P'], rows)].concat(plots);
    }
  };

  A.corr = {
    title: 'Correlation',
    fields: [numCols('Variables (two or more)', 2), { key: 'method', type: 'select', label: 'Method', def: 'pearson', options: [['pearson', 'Pearson'], ['spearman', 'Spearman rank']] }],
    run(v) {
      const rows = [];
      for (let a = 0; a < v.ys.length; a++) for (let b = a + 1; b < v.ys.length; b++) {
        const [x, y] = complete([v.ys[a], v.ys[b]]);
        need(x.length >= 3, 'At least three complete pairs are needed.');
        const r = M[v.method](x, y);
        rows.push([S.label(v.ys[a]), S.label(v.ys[b]), String(r.n), r.r.toFixed(3), pf(r.p)]);
      }
      return [T(['Variable 1', 'Variable 2', 'N', v.method === 'pearson' ? 'Pearson r' : 'Spearman ρ', 'P'], rows, 2)];
    }
  };

  A.anova = {
    title: 'One-Way ANOVA',
    fields: layoutK().concat([conf(), { key: 'tukey', type: 'check', label: 'Tukey pairwise comparisons', def: true },
      { key: 'plots', type: 'check', label: 'Interval plot and boxplot', def: true }]),
    run(v) {
      const gs = groupsOf(v), an = M.oneWayAnova(gs), ci = M.groupIntervals(an, v.conf / 100), name = responseName(v);
      const out = [
        P('H₀: all means are equal    H₁: at least one mean is different'),
        H('Analysis of Variance'),
        T(['Source', 'DF', 'SS', 'MS', 'F', 'P'], [
          ['Factor', String(an.dfB), g(an.ssB), g(an.msB), f2(an.F), pf(an.p)],
          ['Error', String(an.dfW), g(an.ssW), g(an.msW), '', ''],
          ['Total', String(an.N - 1), g(an.ssT), '', '', '']]),
        H('Model Summary'),
        T(['S', 'R-sq', 'R-sq(adj)'], [[g(an.s), pct(an.r2), pct(an.r2adj)]], 0),
        H('Means'),
        T(['Level', 'N', 'Mean', 'StDev', v.conf + '% CI'], an.groups.map((x, i) => [x.name, String(x.n), g(x.mean), g(x.sd), `(${g(ci[i][0])}, ${g(ci[i][1])})`])),
        Note('Pooled StDev = ' + g(an.s))
      ];
      if (v.tukey) out.push(H(`Tukey Simultaneous ${v.conf}% CIs`),
        T(['Difference of levels', 'Difference', 'SE', v.conf + '% CI', 'T', 'Adjusted P'],
          M.tukey(an, v.conf / 100).map(t => [t.pair, g(t.diff), g(t.se), `(${g(t.ci[0])}, ${g(t.ci[1])})`, f2(t.t), pf(t.p)])));
      if (v.plots) out.push(categoryPlot('interval', `Interval Plot of ${name} (${v.conf}% CI for the mean)`, name, gs, v.conf / 100),
        categoryPlot('box', 'Boxplot of ' + name, name, gs));
      return out;
    }
  };

  A.eqvar = {
    title: 'Test for Equal Variances',
    fields: layoutK(),
    run(v) {
      const gs = groupsOf(v), r = M.levene(gs);
      return [
        P('H₀: all variances are equal    H₁: at least one variance is different'),
        T(['Level', 'N', 'StDev'], gs.map(x => [x.name, String(x.values.length), g(M.sd(x.values))])),
        T(['Method', 'DF1', 'DF2', 'Statistic', 'P'], [["Levene's test (medians)", String(r.df1), String(r.df2), f2(r.stat), pf(r.p)]])
      ];
    }
  };

  A.regression = {
    title: 'Regression',
    fields: [{ key: 'y', type: 'col', numeric: true, label: 'Response' }, { key: 'xs', type: 'cols', numeric: true, label: 'Predictors' },
      { key: 'plots', type: 'check', label: 'Fitted line and residual plots', def: true }],
    run(v) {
      need(!v.xs.includes(v.y), 'The response cannot also be a predictor.');
      const [y, ...xs] = complete([v.y].concat(v.xs)), fit = M.regression(y, xs);
      const yn = S.label(v.y), xn = v.xs.map(S.label);
      const eq = yn + ' = ' + g(fit.coef[0]) + fit.coef.slice(1).map((b, j) => (b < 0 ? ' − ' : ' + ') + g(Math.abs(b)) + ' ' + xn[j]).join('');
      const out = [
        H('Regression Equation'), P(eq),
        H('Coefficients'),
        T(['Term', 'Coef', 'SE Coef', 'T', 'P'].concat(fit.vif ? ['VIF'] : []),
          ['Constant'].concat(xn).map((n, j) => [n, g(fit.coef[j]), g(fit.se[j]), f2(fit.t[j]), pf(fit.pv[j])].concat(fit.vif ? [j ? f2(fit.vif[j - 1]) : ''] : []))),
        H('Model Summary'),
        T(['S', 'R-sq', 'R-sq(adj)', 'R-sq(pred)'], [[g(fit.s), pct(fit.r2), pct(fit.r2adj), pct(fit.r2pred)]], 0),
        H('Analysis of Variance'),
        T(['Source', 'DF', 'SS', 'MS', 'F', 'P'], [
          ['Regression', String(fit.dfR), g(fit.ssr), g(fit.msr), f2(fit.F), pf(fit.p)],
          ['Error', String(fit.dfE), g(fit.sse), g(fit.mse), '', ''],
          ['Total', String(fit.n - 1), g(fit.sst), '', '', '']])
      ];
      const odd = fit.stdResid.map((r, i) => [i, r]).filter(a => Math.abs(a[1]) > 2);
      if (odd.length) out.push(H('Unusual Observations (|standardized residual| > 2)'),
        T(['Obs', yn, 'Fit', 'Resid', 'Std Resid'], odd.map(([i, r]) => [String(i + 1), g(y[i]), g(fit.fits[i]), g(fit.resid[i]), f2(r)])),
        Note('Obs counts rows with complete data.'));
      if (v.plots) {
        if (xs.length === 1) {
          const lo = Math.min(...xs[0]), hi = Math.max(...xs[0]);
          out.push(Plot([
            { type: 'scatter', mode: 'markers', x: xs[0], y, marker: { color: COLORS[0], size: 6 } },
            { type: 'scatter', mode: 'lines', x: [lo, hi], y: [lo, hi].map(x => fit.coef[0] + fit.coef[1] * x), line: { color: '#d1495b', width: 2 }, hoverinfo: 'skip' }
          ], layout(`Fitted Line Plot<br><sup>${eq}   ·   S = ${g(fit.s)}   R-sq = ${pct(fit.r2)}</sup>`, xn[0], yn, { margin: { l: 60, r: 24, t: 66, b: 52 } })));
        }
        out.push(residualPlots(yn, fit));
      }
      return out;
    }
  };

  A.chisq = {
    title: 'Chi-Square Test for Association',
    fields: [
      { key: 'mode', type: 'select', label: 'Data', def: 'raw', options: [['raw', 'Raw data (one row per observation)'], ['summary', 'Summarized table of counts']] },
      { key: 'r', type: 'col', label: 'Row variable', showIf: v => v.mode === 'raw' },
      { key: 'c', type: 'col', label: 'Column variable', showIf: v => v.mode === 'raw' },
      { key: 'ys', type: 'cols', numeric: true, min: 2, label: 'Columns containing the table', showIf: v => v.mode === 'summary' },
      { key: 'labels', type: 'col', optional: true, label: 'Row labels (optional)', showIf: v => v.mode === 'summary' }],
    run(v) {
      let rowN, colN, obs;
      if (v.mode === 'raw') {
        const a = S.raw(v.r), b = S.raw(v.c), pairs = [];
        for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== '' && b[i] !== '') pairs.push([a[i], b[i]]);
        rowN = [...new Set(pairs.map(p => p[0]))].sort(natural);
        colN = [...new Set(pairs.map(p => p[1]))].sort(natural);
        obs = rowN.map(() => colN.map(() => 0));
        pairs.forEach(p => obs[rowN.indexOf(p[0])][colN.indexOf(p[1])]++);
      } else {
        const data = complete(v.ys);
        obs = data[0].map((_, i) => data.map(d => d[i]));
        colN = v.ys.map(S.label);
        const lab = v.labels != null ? S.raw(v.labels) : [];
        rowN = obs.map((_, i) => lab[i] || String(i + 1));
        need(obs.every(r => r.every(x => x >= 0)), 'Counts cannot be negative.');
      }
      need(rowN.length >= 2 && colN.length >= 2, 'The table needs at least two rows and two columns.');
      const r = M.chiSquare(obs), rows = [];
      need(r.rowT.every(t => t > 0) && r.colT.every(t => t > 0), 'A row or column of the table is entirely zero.');
      obs.forEach((row, i) => {
        rows.push([rowN[i]].concat(row.map(String), [String(r.rowT[i])]));
        rows.push(['   expected'].concat(r.expected[i].map(f2), ['']));
      });
      rows.push(['All'].concat(r.colT.map(String), [String(r.N)]));
      const out = [
        P('H₀: the variables are independent    H₁: the variables are associated'),
        H('Observed and expected counts'), T([''].concat(colN, ['All']), rows),
        H('Chi-Square Test'),
        T(['', 'Chi-Square', 'DF', 'P'], [['Pearson', g(r.chi), String(r.df), pf(r.p)], ['Likelihood ratio', g(r.g), String(r.df), pf(r.pG)]])
      ];
      if (r.small) out.push(Note(`${r.small} cell(s) with expected counts less than 5; the chi-square approximation may be poor.`));
      return out;
    }
  };

  A.tally = {
    title: 'Tally',
    fields: [{ key: 'ys', type: 'cols', label: 'Variables' }],
    run(v) {
      return [].concat(...v.ys.map(i => {
        const t = tally(i), n = M.sum(t.counts);
        need(n, S.label(i) + ' is empty.');
        let cum = 0;
        return [T([S.label(i), 'Count', 'Percent', 'Cum %'], t.keys.map((k, j) => { cum += t.counts[j]; return [k, String(t.counts[j]), f2(100 * t.counts[j] / n), f2(100 * cum / n)]; })
          .concat([['N =', String(n), '', '']]))];
      }));
    }
  };

  A.mw = {
    title: 'Mann-Whitney',
    fields: layout2().concat([alt()]),
    run(v) {
      const [a, b] = twoOf(v), r = M.mannWhitney(a.values, b.values, v.alt);
      return [
        hyp(`η(${a.name}) − η(${b.name})`, 0, v.alt),
        T(['Sample', 'N', 'Median'], [[a.name, String(r.n1), g(r.med1)], [b.name, String(r.n2), g(r.med2)]]),
        P('Point estimate for difference (Hodges–Lehmann) = ' + g(r.estimate)),
        T(['W', 'U', 'Z', 'P'], [[g(r.W), g(r.U), f2(r.z), pf(r.p)]], 0),
        Note('W is the rank sum of the first sample. Normal approximation with continuity correction, adjusted for ties.')
      ];
    }
  };

  A.wilcoxon = {
    title: 'One-Sample Wilcoxon',
    fields: [numCols('Samples'), { key: 'm0', type: 'num', label: 'Hypothesized median', def: 0 }, alt()],
    run(v) {
      const rows = v.ys.map(i => {
        const x = vals(i), r = M.wilcoxon(x, v.m0, v.alt);
        need(r.nTest >= 2, S.label(i) + ' has too few values different from the hypothesized median.');
        return [S.label(i), String(r.n), String(r.nTest), g(r.W), f2(r.z), pf(r.p), g(r.estimate)];
      });
      return [hyp('η', v.m0, v.alt), T(['Variable', 'N', 'N for test', 'Wilcoxon statistic', 'Z', 'P', 'Estimated median'], rows),
        Note('Normal approximation with continuity correction, adjusted for ties.')];
    }
  };

  A.kw = {
    title: 'Kruskal-Wallis',
    fields: layoutK(),
    run(v) {
      const gs = groupsOf(v, 1), r = M.kruskalWallis(gs);
      return [
        P('H₀: all medians are equal    H₁: at least one median is different'),
        T(['Level', 'N', 'Median', 'Mean rank', 'Z'], r.rows.map(x => [x.name, String(x.n), g(x.median), x.rbar.toFixed(1), f2(x.z)])
          .concat([['Overall', String(r.N), '', ((r.N + 1) / 2).toFixed(1), '']])),
        T(['Method', 'DF', 'H', 'P'], [['Not adjusted for ties', String(r.df), f2(r.H), pf(r.p)]]
          .concat(r.hasTies ? [['Adjusted for ties', String(r.df), f2(r.Hadj), pf(r.pAdj)]] : []))
      ];
    }
  };

  // ---------- graphs ----------
  A.hist = {
    title: 'Histogram', graph: true,
    fields: [numCols('Variables'), byField(), { key: 'fit', type: 'check', label: 'Overlay normal curve' }],
    run(v) {
      return v.ys.map(i => {
        const gs = v.by != null ? splitBy(i, v.by) : [{ name: S.label(i), values: vals(i) }];
        need(gs.length && gs[0].values.length, S.label(i) + ' has no numeric data.');
        return histogram(S.label(i), gs, v.fit);
      });
    }
  };
  A.box = { title: 'Boxplot', graph: true, fields: [numCols('Variables'), byField()], run: v => categoryPlots('box', 'Boxplot', v) };
  A.indiv = { title: 'Individual Value Plot', graph: true, fields: [numCols('Variables'), byField()], run: v => categoryPlots('points', 'Individual Value Plot', v) };
  A.interval = { title: 'Interval Plot', graph: true, fields: [numCols('Variables'), byField(), conf()], run: v => categoryPlots('interval', `Interval Plot (${v.conf}% CI for the mean)`, v) };

  A.scatter = {
    title: 'Scatterplot', graph: true,
    fields: [{ key: 'y', type: 'col', numeric: true, label: 'Y variable' }, { key: 'x', type: 'col', numeric: true, label: 'X variable' },
      byField(), { key: 'line', type: 'check', label: 'Add regression line' }],
    run(v) {
      const y = S.num(v.y), x = S.num(v.x), grp = v.by != null ? S.raw(v.by) : null, map = new Map();
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (!isFinite(x[i]) || !isFinite(y[i])) continue;
        const k = grp ? grp[i] || '' : '';
        if (grp && k === '') continue;
        if (!map.has(k)) map.set(k, { x: [], y: [] });
        map.get(k).x.push(x[i]); map.get(k).y.push(y[i]);
      }
      need(map.size, 'No rows have both X and Y values.');
      const data = [];
      [...map.keys()].sort(natural).forEach((k, i) => {
        const d = map.get(k), c = COLORS[i % 8];
        data.push({ type: 'scatter', mode: 'markers', x: d.x, y: d.y, name: k, marker: { color: c, size: 7, opacity: 0.85 } });
        if (v.line && d.x.length > 2 && M.sd(d.x) > 0) {
          const fit = M.regression(d.y, [d.x]), lo = Math.min(...d.x), hi = Math.max(...d.x);
          data.push({ type: 'scatter', mode: 'lines', x: [lo, hi], y: [lo, hi].map(t => fit.coef[0] + fit.coef[1] * t), line: { color: c, width: 2 }, showlegend: false, hoverinfo: 'skip' });
        }
      });
      return [Plot(data, layout(`Scatterplot of ${S.label(v.y)} vs ${S.label(v.x)}`, S.label(v.x), S.label(v.y), { showlegend: !!grp }))];
    }
  };

  A.matrix = {
    title: 'Matrix Plot', graph: true,
    fields: [numCols('Variables (two or more)', 2)],
    run(v) {
      const data = complete(v.ys);
      need(data[0].length, 'No rows have values in every selected column.');
      return [Plot([{
        type: 'splom', dimensions: v.ys.map((i, j) => ({ label: S.label(i), values: data[j] })),
        marker: { color: COLORS[0], size: 5, opacity: 0.8 }, diagonal: { visible: false }, showupperhalf: false
      }], layout('Matrix Plot of ' + v.ys.map(S.label).join(', '), '', '', { height: 180 + 120 * v.ys.length, xaxis: {}, yaxis: {} }))];
    }
  };

  A.prob = {
    title: 'Probability Plot', graph: true,
    fields: [numCols('Variables')],
    run: v => v.ys.map(i => {
      const x = vals(i);
      need(x.length >= 3 && M.sd(x) > 0, S.label(i) + ' needs at least three values that are not all equal.');
      return probabilityPlot(S.label(i), x);
    })
  };

  A.ts = {
    title: 'Time Series Plot', graph: true,
    fields: [numCols('Series')],
    run(v) {
      const data = v.ys.map((i, j) => {
        const y = S.num(i);
        return { type: 'scatter', mode: 'lines+markers', x: y.map((_, k) => k + 1), y: y.map(t => isFinite(t) ? t : null), name: S.label(i), line: { color: COLORS[j % 8], width: 1.5 }, marker: { size: 5 } };
      });
      return [Plot(data, layout('Time Series Plot of ' + v.ys.map(S.label).join(', '), 'Index', v.ys.length === 1 ? S.label(v.ys[0]) : 'Data', { showlegend: v.ys.length > 1 }))];
    }
  };

  A.bar = {
    title: 'Bar Chart', graph: true,
    fields: [
      { key: 'mode', type: 'select', label: 'Bars represent', def: 'counts', options: [['counts', 'Counts of unique values'], ['mean', 'Mean of a variable per category'], ['values', 'Values from a table']] },
      { key: 'cat', type: 'col', label: 'Categorical variable' },
      { key: 'y', type: 'col', numeric: true, label: 'Value variable', showIf: v => v.mode !== 'counts' }],
    run(v) {
      let x, y, yt = 'Count';
      if (v.mode === 'counts') { const t = tally(v.cat); x = t.keys; y = t.counts; }
      else if (v.mode === 'mean') { const gs = splitBy(v.y, v.cat); x = gs.map(s => s.name); y = gs.map(s => M.mean(s.values)); yt = 'Mean of ' + S.label(v.y); }
      else {
        const c = S.raw(v.cat), n = S.num(v.y), keep = c.map((_, i) => i).filter(i => c[i] !== '' && isFinite(n[i]));
        x = keep.map(i => c[i]); y = keep.map(i => n[i]); yt = S.label(v.y);
      }
      need(x.length, 'There is nothing to chart.');
      return [Plot([{ type: 'bar', x, y, marker: { color: COLORS[0] } }],
        layout('Chart of ' + (v.mode === 'counts' ? S.label(v.cat) : yt + ' by ' + S.label(v.cat)), S.label(v.cat), yt, { xaxis: axis(S.label(v.cat), { type: 'category' }), bargap: 0.35 }))];
    }
  };

  A.pie = {
    title: 'Pie Chart', graph: true,
    fields: [{ key: 'cat', type: 'col', label: 'Categorical variable' }],
    run(v) {
      const t = tally(v.cat);
      need(t.keys.length, 'The column is empty.');
      return [Plot([{ type: 'pie', labels: t.keys, values: t.counts, sort: false, textinfo: 'label+percent', marker: { colors: COLORS, line: { color: '#fff', width: 2 } } }],
        layout('Pie Chart of ' + S.label(v.cat), '', '', { xaxis: {}, yaxis: {}, showlegend: true }))];
    }
  };

  const MENU = {
    Stat: [
      ['Basic Statistics', ['desc', 'tally', 't1', 'z1', 't2', 'paired', 'p1', 'p2', 'var2', 'corr', 'normality']],
      ['ANOVA', ['anova', 'eqvar']],
      ['Regression', ['regression']],
      ['Tables', ['chisq']],
      ['Nonparametrics', ['wilcoxon', 'mw', 'kw']]
    ],
    Graph: [['', ['scatter', 'matrix', 'hist', 'prob', 'box', 'indiv', 'interval', 'bar', 'pie', 'ts']]]
  };

  return { all: A, MENU };
})();
