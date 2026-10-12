// Lean Six Sigma definitions: quality tools and process analysis.
// Registers into Analyses.all and adds the Quality and Process menus.
(function () {
  'use strict';
  const { M, S, g, f2, pf, pct, H, P, Note, T, Plot, need, vals, natural, COLORS, axis, layout, alt, binning, tally, Html } = Analyses.kit;
  const A = Analyses.all, Q = MQual, PR = MProc;
  const RED = '#d1495b', GREEN = '#2e8b57';
  const whole = x => Number.isInteger(x) ? String(x) : g(x);
  const numField = (key, label, extra) => Object.assign({ key, type: 'num', label }, extra);

  // ---------- subgroups ----------
  const SG_FIELDS = individualsLabel => [
    { key: 'sg', type: 'select', label: 'Subgroups', def: individualsLabel ? 'none' : 'size',
      options: (individualsLabel ? [['none', individualsLabel]] : []).concat([['size', 'Consecutive rows, constant size'], ['col', 'Identified by a column']]) },
    numField('sgSize', 'Subgroup size', { def: 5, min: 2, max: 500, integer: true, showIf: v => v.sg === 'size' }),
    { key: 'sgCol', type: 'col', label: 'Subgroup ID column', showIf: v => v.sg === 'col' }
  ];
  function subgroups(v) {
    const y = S.num(v.y);
    if (v.sg === 'none') return y.filter(isFinite).map(x => [x]);
    const out = [];
    if (v.sg === 'size') {
      const x = y.filter(isFinite);
      for (let i = 0; i + v.sgSize <= x.length; i += v.sgSize) out.push(x.slice(i, i + v.sgSize));
    } else {
      const id = S.raw(v.sgCol), map = new Map();
      y.forEach((x, i) => { if (isFinite(x) && id[i]) { if (!map.has(id[i])) { map.set(id[i], []); out.push(map.get(id[i])); } map.get(id[i]).push(x); } });
    }
    need(out.length >= 2, 'At least two subgroups are needed.');
    return out;
  }

  // ---------- control charts ----------
  const TESTS = { 1: 'a point more than 3σ from the centre line', 2: '9 points in a row on one side of the centre line', 3: '6 points in a row all rising or all falling',
    5: '2 of 3 points more than 2σ from the centre line (same side)', 6: '4 of 5 points more than 1σ from the centre line (same side)' };

  function controlChartBlocks(title, charts, xTitle) {
    const data = [], lay = { height: 280 * charts.length + 70, grid: { rows: charts.length, columns: 1, pattern: 'independent', ygap: 0.22 } };
    const rows = [], issues = [];
    const same = a => a.every(v => Math.abs(v - a[0]) < 1e-9) ? g(a[0]) : 'varies';
    charts.forEach((c, k) => {
      const ax = k ? { xaxis: 'x' + (k + 1), yaxis: 'y' + (k + 1) } : {}, x = c.pts.map((_, i) => i + 1 + (c.offset || 0));
      const line = (y, color) => data.push(Object.assign({ type: 'scatter', mode: 'lines', x, y, line: { color, width: 1.3, shape: 'hvh' }, hoverinfo: 'skip' }, ax));
      line(c.ucl, RED); line(c.lcl, RED); line(c.cl, GREEN);
      data.push(Object.assign({
        type: 'scatter', mode: 'lines+markers', x, y: c.pts, line: { color: COLORS[0], width: 1.2 },
        marker: { size: 6, color: c.flags.map(f => f.length ? RED : COLORS[0]) },
        text: c.flags.map(f => f.length ? 'Test ' + f.join(', ') : ''), hovertemplate: '%{x}: %{y}<br>%{text}<extra></extra>'
      }, ax));
      lay['xaxis' + (k ? k + 1 : '')] = axis(k === charts.length - 1 ? xTitle : '');
      lay['yaxis' + (k ? k + 1 : '')] = axis(c.name);
      const out = c.flags.filter(f => f.length).length;
      rows.push([c.name, same(c.cl), same(c.lcl), same(c.ucl), String(out)]);
      Object.keys(TESTS).forEach(t => {
        const pts = x.filter((_, i) => c.flags[i].includes(+t));
        if (pts.length) issues.push([c.name, `Test ${t}: ${TESTS[t]}`, pts.join(', ')]);
      });
    });
    const out = [T(['Chart', 'Centre line', 'LCL', 'UCL', 'Points flagged'], rows), Plot(data, layout(title, '', '', lay))];
    if (issues.length) out.push(H('Signals of special-cause variation'), T(['Chart', 'Test failed', 'At points'], issues, 3));
    else out.push(Note('No special-cause signals: the process looks stable (in statistical control).'));
    return out;
  }

  A.cc_var = {
    title: 'Control Chart (Variables)',
    fields: [{ key: 'y', type: 'col', numeric: true, label: 'Measurement' },
      { key: 'chart', type: 'select', label: 'Chart', def: 'imr', options: [['imr', 'I-MR (individual values)'], ['R', 'Xbar-R (subgroups up to about 8)'], ['S', 'Xbar-S (larger subgroups)']] }]
      .concat(SG_FIELDS().map(f => Object.assign({}, f, { showIf: v => v.chart !== 'imr' && (!f.showIf || f.showIf(v)) }))),
    run(v) {
      const name = S.label(v.y);
      if (v.chart === 'imr') {
        const x = vals(v.y);
        need(x.length >= 3, 'At least three values are needed.');
        const r = Q.imr(x);
        return controlChartBlocks('I-MR Chart of ' + name, r.charts, 'Observation').concat([Note('Estimated within StDev (MR-bar / 1.128) = ' + g(r.sigma))]);
      }
      const gs = subgroups(v).filter(s => s.length >= 2);
      need(gs.length >= 2, 'At least two subgroups with two or more values are needed.');
      const r = Q.xbar(gs, v.chart);
      return controlChartBlocks(`Xbar-${v.chart} Chart of ${name}`, r.charts, 'Subgroup').concat([Note(`${gs.length} subgroups. Estimated within StDev = ${g(r.sigma)}`)]);
    }
  };

  A.cc_attr = {
    title: 'Control Chart (Attributes)',
    fields: [
      { key: 'chart', type: 'select', label: 'Chart', def: 'p', options: [['p', 'P (proportion defective)'], ['np', 'NP (number defective, constant sample size)'], ['c', 'C (defects per sample, constant size)'], ['u', 'U (defects per unit)']] },
      { key: 'count', type: 'col', numeric: true, label: 'Counts (defectives or defects)' },
      { key: 'sizeCol', type: 'col', numeric: true, optional: true, label: 'Sample sizes column', showIf: v => v.chart !== 'c' },
      numField('sizeConst', 'or a constant sample size', { optional: true, min: 1, showIf: v => v.chart !== 'c' })],
    run(v) {
      const c = S.num(v.count), keep = [];
      let size = null;
      if (v.chart !== 'c') {
        need(v.sizeCol != null || v.sizeConst != null, 'Give a sample-size column or a constant sample size.');
        const sz = v.sizeCol != null ? S.num(v.sizeCol) : c.map(() => v.sizeConst);
        c.forEach((x, i) => { if (isFinite(x) && sz[i] > 0) keep.push(i); });
        size = keep.map(i => sz[i]);
        need(v.chart === 'u' || keep.every((i, k) => c[i] <= size[k]), 'A count is larger than its sample size.');
      } else c.forEach((x, i) => { if (isFinite(x)) keep.push(i); });
      const count = keep.map(i => c[i]);
      need(count.length >= 3 && count.every(x => x >= 0), 'At least three non-negative counts are needed.');
      const r = Q.attribute(v.chart, count, size);
      return controlChartBlocks(`${v.chart.toUpperCase()} Chart of ${S.label(v.count)}`, r.charts, 'Sample');
    }
  };

  // ---------- capability ----------
  A.capability = {
    title: 'Process Capability',
    fields: [{ key: 'y', type: 'col', numeric: true, label: 'Measurement' },
      numField('lsl', 'Lower spec limit (blank if none)', { optional: true }), numField('usl', 'Upper spec limit (blank if none)', { optional: true }),
      numField('target', 'Target (optional)', { optional: true })].concat(SG_FIELDS('Individual values (no subgroups)')),
    run(v) {
      need(v.lsl != null || v.usl != null, 'Enter at least one spec limit.');
      need(v.lsl == null || v.usl == null || v.usl > v.lsl, 'The upper spec limit must be above the lower one.');
      const gs = subgroups(v), x = [].concat(...gs), name = S.label(v.y);
      need(x.length >= 10, 'At least 10 values are needed.');
      const r = Q.capability(x, { lsl: v.lsl, usl: v.usl, target: v.target, sigmaWithin: Q.withinSigma(gs) }), ad = M.andersonDarling(x);
      const b = binning(x), shapes = [], notes = [];
      const mark = (val, text, color) => {
        if (val == null) return;
        shapes.push({ type: 'line', x0: val, x1: val, yref: 'paper', y0: 0, y1: 1, line: { color, width: 1.5, dash: 'dash' } });
        notes.push({ x: val, yref: 'paper', y: 1.02, text, showarrow: false, font: { color, size: 11 }, yanchor: 'bottom' });
      };
      mark(v.lsl, 'LSL', RED); mark(v.usl, 'USL', RED); mark(v.target, 'Target', GREEN);
      const lo = Math.min(r.mean - 4 * r.sdOverall, v.lsl ?? Infinity), hi = Math.max(r.mean + 4 * r.sdOverall, v.usl ?? -Infinity), xs = [];
      for (let i = 0; i <= 120; i++) xs.push(lo + i * (hi - lo) / 120);
      const curve = (s, color, dash, nm) => ({ type: 'scatter', mode: 'lines', x: xs, y: xs.map(t => r.n * b.step * M.normPdf(t, r.mean, s)), line: { color, width: 2, dash }, name: nm, hoverinfo: 'skip' });
      const k = r.within.k, verdict = k >= 1.67 ? 'excellent (Cpk ≥ 1.67)' : k >= 1.33 ? 'capable (Cpk ≥ 1.33)' : k >= 1 ? 'marginal (1 ≤ Cpk < 1.33)' : 'not capable (Cpk < 1)';
      const row = (name2, o) => [name2, g(o.lo), g(o.hi), g(o.total)];
      return [
        T(['N', 'Mean', 'StDev (within)', 'StDev (overall)', 'LSL', 'Target', 'USL'],
          [[String(r.n), g(r.mean), g(r.sdWithin), g(r.sdOverall), v.lsl ?? '*', v.target ?? '*', v.usl ?? '*'].map(String)], 0),
        H('Capability indices'),
        T(['', 'Cp / Pp', 'Lower', 'Upper', 'Cpk / Ppk', 'Z.bench'], [
          ['Potential (within)', f2(r.within.p), f2(r.within.l), f2(r.within.u), f2(r.within.k), f2(r.ppmWithin.z)],
          ['Overall', f2(r.overall.p), f2(r.overall.l), f2(r.overall.u), f2(r.overall.k), f2(r.ppmOverall.z)]]
          .concat(isFinite(r.cpm) ? [['Cpm (about target)', f2(r.cpm), '', '', '', '']] : [])),
        H('Defects per million (PPM)'),
        T(['', 'Below LSL', 'Above USL', 'Total'], [row('Observed', r.observed), row('Expected (within)', r.ppmWithin), row('Expected (overall)', r.ppmOverall)]),
        Plot([{ type: 'bar', x: b.centers, y: b.count(x), width: b.step, marker: { color: COLORS[0], opacity: 0.8, line: { color: '#fff', width: 1 } }, name: 'Data' },
          curve(r.sdWithin, RED, 'solid', 'Within'), curve(r.sdOverall, '#333', 'dash', 'Overall')],
        layout('Process Capability of ' + name, name, 'Frequency', { shapes, annotations: notes, bargap: 0, showlegend: true, margin: { l: 60, r: 24, t: 66, b: 52 } })),
        P(`The process is ${verdict}. Cpk uses short-term (within) variation and shows what the process could do; Ppk uses all variation and shows what the customer actually gets.`),
        Note(`Normality (Anderson–Darling): AD = ${ad.ad.toFixed(3)}, P = ${pf(ad.p)}.` + (ad.p < 0.05 ? ' The data do not look normal, so the indices and expected PPM may be misleading.' : ' The normal model is reasonable.')
          + ' Capability is only meaningful when the process is stable; check a control chart first.')
      ];
    }
  };

  // ---------- gage R&R ----------
  A.gage = {
    title: 'Gage R&R (Crossed)',
    fields: [{ key: 'part', type: 'col', label: 'Part numbers' }, { key: 'oper', type: 'col', label: 'Operators' }, { key: 'y', type: 'col', numeric: true, label: 'Measurement' },
      numField('tol', 'Process tolerance (USL − LSL), optional', { optional: true, min: 1e-12 })],
    run(v) {
      const p = S.raw(v.part), o = S.raw(v.oper), y = S.num(v.y), keep = y.map((_, i) => i).filter(i => isFinite(y[i]) && p[i] && o[i]);
      need(keep.length >= 8, 'Not enough complete rows.');
      const r = Q.gageRR(keep.map(i => p[i]), keep.map(i => o[i]), keep.map(i => y[i]), v.tol);
      const grr = r.rows[0], sv = grr.pctStudy, verdict = sv < 10 ? 'acceptable (under 10%)' : sv <= 30 ? 'marginal (10% to 30%): may be acceptable depending on the application' : 'unacceptable (over 30%): improve the measurement system before using the data';
      const comp = r.rows.filter(x => ['Total Gage R&R', '  Repeatability', '  Reproducibility', 'Part-to-Part'].includes(x.name));
      const order = r.parts.map((_, i) => i).sort((a, b) => natural(r.parts[a], r.parts[b]));
      return [
        P(`${r.parts.length} parts × ${r.operators.length} operators × ${r.replicates} replicates`),
        H('Two-way ANOVA' + (r.pooled ? ' (interaction not significant, pooled into repeatability)' : ' with interaction')),
        T(['Source', 'DF', 'SS', 'MS', 'F', 'P'], r.anova.map(a => [a[0], String(a[1]), g(a[2]), g(a[3]), isNaN(a[4]) ? '' : f2(a[4]), isNaN(a[5]) ? '' : pf(a[5])])),
        H('Variance components'),
        T(['Source', 'VarComp', '% Contribution', 'StdDev', 'Study Var (6 × SD)', '% Study Var'].concat(v.tol ? ['% Tolerance'] : []),
          r.rows.map(x => [x.name.replace(/ /g, ' '), g(x.v), f2(x.pctContribution), g(x.sd), g(x.studyVar), f2(x.pctStudy)].concat(v.tol ? [f2(x.pctTol)] : []))),
        P(`Number of distinct categories = ${r.ndc}` + (r.ndc < 5 ? ' (fewer than 5: the gage cannot distinguish parts well enough).' : ' (5 or more is adequate).')),
        P(`The measurement system is ${verdict}. Gage R&R is ${f2(sv)}% of study variation.`),
        Plot([{ type: 'bar', name: '% Contribution', x: comp.map(x => x.name.trim()), y: comp.map(x => x.pctContribution), marker: { color: COLORS[0] } },
          { type: 'bar', name: '% Study Var', x: comp.map(x => x.name.trim()), y: comp.map(x => x.pctStudy), marker: { color: COLORS[3] } }],
        layout('Components of Variation', '', 'Percent', { barmode: 'group', showlegend: true })),
        Plot(r.operators.map((op, j) => ({ type: 'scatter', mode: 'lines+markers', name: op, x: order.map(i => r.parts[i]), y: order.map(i => r.cellMeans[i][j]), line: { color: COLORS[j % 8], width: 1.5 } })),
          layout('Operator × Part Interaction (cell means)', S.label(v.part), 'Average ' + S.label(v.y), { showlegend: true, xaxis: axis(S.label(v.part), { type: 'category' }) }))
      ];
    }
  };

  // ---------- Pareto ----------
  function paretoBlocks(title, keys, counts, yTitle) {
    const order = keys.map((_, i) => i).sort((a, b) => counts[b] - counts[a]), total = M.sum(counts);
    let cum = 0;
    const rows = order.map(i => { cum += counts[i]; return [keys[i], whole(counts[i]), f2(100 * counts[i] / total), f2(100 * cum / total)]; });
    const vital = rows.findIndex(r => +r[3] >= 80) + 1;
    return [T(['Category', yTitle, 'Percent', 'Cum %'], rows),
      Plot([{ type: 'bar', x: rows.map(r => r[0]), y: order.map(i => counts[i]), marker: { color: COLORS[0] } },
        { type: 'scatter', mode: 'lines+markers', x: rows.map(r => r[0]), y: rows.map(r => +r[3]), yaxis: 'y2', line: { color: RED, width: 2 }, marker: { size: 6 } }],
      layout(title, '', yTitle, { xaxis: axis('', { type: 'category' }), margin: { l: 60, r: 60, t: 48, b: 80 },
        yaxis2: { overlaying: 'y', side: 'right', range: [0, 105], title: { text: 'Cumulative %' }, showgrid: false } })),
      Note(`${vital} of ${rows.length} categories account for 80% of the total.`)];
  }

  A.pareto = {
    title: 'Pareto Chart',
    fields: [{ key: 'mode', type: 'select', label: 'Data', def: 'raw', options: [['raw', 'One row per defect (category column)'], ['counts', 'Categories with a counts column']] },
      { key: 'cat', type: 'col', label: 'Categories' }, { key: 'n', type: 'col', numeric: true, label: 'Counts', showIf: v => v.mode === 'counts' }],
    run(v) {
      let keys, counts;
      if (v.mode === 'raw') ({ keys, counts } = tally(v.cat));
      else {
        const c = S.raw(v.cat), n = S.num(v.n), map = new Map();
        c.forEach((k, i) => { if (k && isFinite(n[i])) map.set(k, (map.get(k) || 0) + n[i]); });
        keys = [...map.keys()]; counts = keys.map(k => map.get(k));
      }
      need(keys.length, 'There is nothing to chart.');
      return paretoBlocks('Pareto Chart of ' + S.label(v.cat), keys, counts, 'Count');
    }
  };

  // ---------- calculators ----------
  A.dpmo = {
    title: 'DPMO and Sigma Level',
    fields: [numField('defects', 'Number of defects', { min: 0 }), numField('units', 'Number of units', { min: 1 }), numField('opps', 'Defect opportunities per unit', { def: 1, min: 1 })],
    run(v) {
      const dpu = v.defects / v.units, dpo = dpu / v.opps;
      need(dpo < 1, 'There are more defects than opportunities.');
      return [T(['DPU', 'DPO', 'DPMO', 'Yield', 'First-pass yield (e^−DPU)', 'Sigma level'],
        [[g(dpu), g(dpo), g(1e6 * dpo), pct(1 - dpo), pct(Math.exp(-dpu)), dpo > 0 ? f2(M.normInv(1 - dpo) + 1.5) : '> 6']], 0),
      Note('Sigma level uses the conventional 1.5σ long-term shift.')];
    }
  };

  A.power = {
    title: 'Power and Sample Size (t tests)',
    fields: [{ key: 'type', type: 'select', label: 'Test', def: 'two', options: [['two', 'Two-sample t'], ['one', 'One-sample t'], ['paired', 'Paired t']] },
      { key: 'solve', type: 'select', label: 'Calculate', def: 'n', options: [['n', 'Sample size'], ['power', 'Power']] },
      numField('diff', 'Difference to detect', { min: 1e-12 }), numField('sd', 'Standard deviation (of differences, for paired)', { min: 1e-12 }),
      numField('power', 'Target power', { def: 0.9, min: 0.01, max: 0.999, showIf: v => v.solve === 'n' }),
      numField('n', 'Sample size (per group)', { min: 2, integer: true, showIf: v => v.solve === 'power' }),
      numField('alpha', 'Significance level (α)', { def: 0.05, min: 0.0001, max: 0.5 }), alt()],
    run(v) {
      const type = v.type === 'two' ? 'two' : 'one', pw = n => Q.tPower(n, v.diff, v.sd, v.alpha, type, v.alt);
      const n = v.solve === 'n' ? Q.tSampleSize(v.power, v.diff, v.sd, v.alpha, type, v.alt) : v.n;
      const xs = [], top = Math.max(10, Math.ceil(n * 2));
      for (let k = 2; k <= top; k += Math.max(1, Math.floor(top / 80))) xs.push(k);
      return [T(['Difference', 'StDev', 'α', v.type === 'two' ? 'Sample size per group' : v.type === 'paired' ? 'Number of pairs' : 'Sample size', 'Power'],
        [[g(v.diff), g(v.sd), String(v.alpha), String(n), pw(n).toFixed(4)]], 0),
      Plot([{ type: 'scatter', mode: 'lines', x: xs, y: xs.map(pw), line: { color: COLORS[0], width: 2 } },
        { type: 'scatter', mode: 'markers', x: [n], y: [pw(n)], marker: { color: RED, size: 10 } }],
      layout('Power Curve', v.type === 'two' ? 'Sample size per group' : 'Sample size', 'Power', { yaxis: axis('Power', { range: [0, 1.02] }) }))];
    }
  };

  // ---------- design of experiments ----------
  A.doe_create = {
    title: 'Create Factorial Design',
    fields: [{ key: 'names', type: 'text', label: 'Factor names, separated by commas (2 to 6)', def: 'A, B, C' },
      numField('reps', 'Replicates', { def: 2, min: 1, max: 10, integer: true }), { key: 'random', type: 'check', label: 'Randomize run order', def: true },
      numField('seed', 'Random seed', { def: 1, min: 0, integer: true })],
    run(v) {
      const names = v.names.split(',').map(s => s.trim()).filter(Boolean), k = names.length;
      need(k >= 2 && k <= 6 && new Set(names).size === k, 'Enter 2 to 6 different factor names.');
      const runs = [];
      for (let r = 0; r < v.reps; r++) for (let i = 0; i < 2 ** k; i++) runs.push(names.map((_, j) => (i >> j) & 1 ? 1 : -1));
      const std = runs.map((_, i) => i + 1), rnd = MML.rng(v.seed);
      const order = std.map((_, i) => i);
      if (v.random) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      S.addColumns([{ name: 'StdOrder', data: order.map(i => std[i]) }, { name: 'RunOrder', data: order.map((_, i) => i + 1) }]
        .concat(names.map((nm, j) => ({ name: nm, data: order.map(i => runs[i][j]) })), [{ name: 'Response', data: [''] }]));
      return [T(['Factors', 'Runs', 'Replicates', 'Design'], [[String(k), String(runs.length), String(v.reps), `2^${k} full factorial`]], 0),
        P('The design was added to the worksheet. Run the experiment in RunOrder, type the results into the Response column, then use Analyze Factorial Design.'),
        Note('−1 is the low setting of a factor and 1 the high setting.' + (v.reps === 1 ? ' With one replicate there is no direct estimate of error; significance is judged with Lenth\'s method.' : ''))];
    }
  };

  A.doe_analyze = {
    title: 'Analyze Factorial Design',
    fields: [{ key: 'y', type: 'col', numeric: true, label: 'Response' }, { key: 'xs', type: 'cols', min: 2, label: 'Factors (two levels each)' },
      { key: 'order', type: 'select', label: 'Include terms up to', def: '2', options: [['1', 'Main effects only'], ['2', 'Two-way interactions'], ['3', 'Three-way interactions']] }],
    run(v) {
      need(v.xs.length <= 6 && !v.xs.includes(v.y), 'Choose 2 to 6 factor columns that do not include the response.');
      const yAll = S.num(v.y), raw = v.xs.map(S.raw), names = v.xs.map(S.label), yn = S.label(v.y);
      const keep = yAll.map((_, i) => i).filter(i => isFinite(yAll[i]) && raw.every(c => c[i]));
      const y = keep.map(i => yAll[i]), n = y.length;
      const levels = raw.map((c, j) => { const l = [...new Set(keep.map(i => c[i]))].sort(natural); need(l.length === 2, `Factor "${names[j]}" must have exactly two levels; it has ${l.length}.`); return l; });
      const X = raw.map((c, j) => keep.map(i => c[i] === levels[j][1] ? 1 : -1));
      const terms = [];
      const add = (start, cur) => { if (cur.length) terms.push(cur); if (cur.length < +v.order) for (let j = start; j < names.length; j++) add(j + 1, cur.concat(j)); };
      add(0, []);
      terms.sort((a, b) => a.length - b.length);
      const tn = terms.map(t => t.map(j => names[j]).join('*')), cols = terms.map(t => y.map((_, i) => t.reduce((p, j) => p * X[j][i], 1)));
      const dfE = n - terms.length - 1;
      need(dfE >= 0, 'There are more terms than runs; choose a lower interaction order.');
      const out = [];
      let effects, stat, crit, statName;
      if (dfE >= 1) {
        const fit = M.regression(y, cols, true);
        effects = fit.coef.slice(1).map(c => 2 * c); stat = fit.t.slice(1).map(Math.abs); crit = M.tInv(0.975, dfE); statName = 'Standardized effect (|t|)';
        out.push(H('Coded coefficients'), T(['Term', 'Effect', 'Coef', 'SE Coef', 'T', 'P'],
          [['Constant', '', g(fit.coef[0]), g(fit.se[0]), f2(fit.t[0]), pf(fit.pv[0])]].concat(tn.map((nm, j) => [nm, g(effects[j]), g(fit.coef[j + 1]), g(fit.se[j + 1]), f2(fit.t[j + 1]), pf(fit.pv[j + 1])]))),
        T(['S', 'R-sq', 'R-sq(adj)', 'Error DF'], [[g(fit.s), pct(fit.r2), pct(fit.r2adj), String(dfE)]], 0));
      } else {
        const avg = (c, s) => M.mean(y.filter((_, i) => c[i] === s));
        effects = cols.map(c => avg(c, 1) - avg(c, -1)); stat = effects.map(Math.abs);
        const s0 = 1.5 * M.median(stat), pse = 1.5 * M.median(stat.filter(e => e < 2.5 * s0));
        crit = M.tInv(0.975, terms.length / 3) * pse; statName = 'Effect (absolute)';
        out.push(H('Effects (no replicates: Lenth\'s method)'), T(['Term', 'Effect', 'Likely active'], tn.map((nm, j) => [nm, g(effects[j]), stat[j] > crit ? 'yes' : ''])),
          Note(`Lenth's pseudo standard error = ${g(pse)}; margin of error = ${g(crit)}.`));
      }
      const ord = tn.map((_, j) => j).sort((a, b) => stat[a] - stat[b]);
      out.push(Plot([{ type: 'bar', orientation: 'h', y: ord.map(j => tn[j]), x: ord.map(j => stat[j]), marker: { color: ord.map(j => stat[j] > crit ? RED : COLORS[0]) } }],
        layout(`Pareto Chart of Effects on ${yn}`, statName, '', { height: 160 + 26 * tn.length, margin: { l: 120, r: 24, t: 48, b: 48 }, yaxis: axis('', { type: 'category' }),
          shapes: [{ type: 'line', x0: crit, x1: crit, yref: 'paper', y0: 0, y1: 1, line: { color: RED, dash: 'dash', width: 1.5 } }] })),
      Note('Bars past the dashed line are statistically significant at α = 0.05.'));
      const lv = (j, s) => M.mean(y.filter((_, i) => X[j][i] === s));
      out.push(Plot(names.map((nm, j) => ({ type: 'scatter', mode: 'lines+markers', x: [`${nm}: ${levels[j][0]}`, `${nm}: ${levels[j][1]}`], y: [lv(j, -1), lv(j, 1)], line: { color: COLORS[0], width: 2 }, marker: { size: 8 } }))
        .concat([{ type: 'scatter', mode: 'lines', x: [`${names[0]}: ${levels[0][0]}`, `${names[names.length - 1]}: ${levels[names.length - 1][1]}`], y: [M.mean(y), M.mean(y)], line: { color: '#9aa3af', dash: 'dot', width: 1 }, hoverinfo: 'skip' }]),
      layout('Main Effects Plot for ' + yn, '', 'Mean of ' + yn, { xaxis: axis('', { type: 'category' }) })));
      terms.map((t, j) => [t, j]).filter(a => a[0].length === 2).sort((a, b) => stat[b[1]] - stat[a[1]]).slice(0, 3).forEach(([t]) => {
        const [a, b] = t, cell = (sa, sb) => M.mean(y.filter((_, i) => X[a][i] === sa && X[b][i] === sb));
        out.push(Plot([-1, 1].map((sb, k) => ({ type: 'scatter', mode: 'lines+markers', name: `${names[b]} = ${levels[b][k]}`, x: levels[a], y: [cell(-1, sb), cell(1, sb)], line: { color: COLORS[k], width: 2, dash: k ? 'dash' : 'solid' } })),
          layout(`Interaction Plot: ${names[a]} × ${names[b]}`, names[a], 'Mean of ' + yn, { height: 320, showlegend: true, xaxis: axis(names[a], { type: 'category' }) })));
      });
      return out;
    }
  };

  // ---------- process mining ----------
  const HOURS = { minutes: 1 / 60, hours: 1, days: 24 };
  function timeColumn(i, unit, what) {
    if (S.isNumeric(i)) return S.num(i).map(x => x * HOURS[unit]);
    return S.raw(i).map(s => {
      if (!s) return NaN;
      const t = Date.parse(/^\d{4}-\d\d-\d\d \d/.test(s) ? s.replace(' ', 'T') : s);
      need(isFinite(t), `Could not read "${s}" in ${what} as a date/time. Use a format like 2026-03-14 09:30.`);
      return t / 3.6e6;
    });
  }
  // Pick a display unit from a typical duration (hours) and return a formatter.
  function durationFormat(typical) {
    const pick = h => h < 1.5 ? [60, 'min'] : h < 72 ? [1, 'h'] : [1 / 24, 'days'];
    // each value is shown in the unit that suits its own size; charts use one unit throughout
    const fmt = h => { if (!isFinite(h)) return '*'; const [f, u] = pick(Math.abs(h)), x = h * f; return (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) + ' ' + u; };
    const [f, u] = pick(typical);
    return Object.assign(fmt, { factor: f, unit: u });
  }

  // Top-to-bottom process map: straight arrows for the next step, left curves for skips, right (red) curves for loops back.
  function processMap(m, minShare, fmt) {
    const acts = m.activities, n = acts.length, W = 820, bw = 200, bh = 40, gap = 38, cx = W / 2, top = 60, esc = S.esc;
    const y = i => top + i * (bh + gap), idx = new Map(acts.map((a, i) => [a.name, i]));
    const minN = Math.max(1, minShare / 100 * m.nCases), maxN = Math.max(m.nCases, ...m.edges.map(e => e.n));
    const sw = c => (1 + 7 * c / maxN).toFixed(1), parts = [], labels = [];
    const arrow = (d, c, color, label, lx, ly, anchor) => {
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw(c)}" stroke-opacity="0.75" marker-end="url(#arr-${color.slice(1)})"/>`);
      labels.push(`<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="pm-edge" fill="${color}">${esc(label)}</text>`);
    };
    const curve = (i, j, c, label) => {
      const back = j <= i, side = back ? 1 : -1, color = back ? RED : '#64748b', x0 = cx + side * bw / 2;
      if (i === j) return arrow(`M${x0},${y(i) + 8} C${x0 + 46},${y(i) - 6} ${x0 + 46},${y(i) + bh + 6} ${x0 + 4},${y(i) + bh - 8}`, c, color, label, x0 + 40, y(i) + bh / 2 + 4, 'start');
      const bulge = Math.min(250, 46 + 30 * (Math.abs(j - i) - 1)), y0 = y(i) + bh / 2 + (back ? -6 : 6), y1 = y(j) + bh / 2 + (back ? 6 : -6);
      arrow(`M${x0},${y0} C${x0 + side * bulge},${y0} ${x0 + side * bulge},${y1} ${x0 + side * 4},${y1}`, c, color, label, x0 + side * (bulge * 0.75 + 4), (y0 + y1) / 2 + 4 + Math.min(40, 14 * (Math.abs(j - i) - 1)), back ? 'start' : 'end');
    };
    m.edges.filter(e => e.n >= minN).sort((a, b) => a.n - b.n).forEach(e => {
      const i = idx.get(e.from), j = idx.get(e.to), label = e.n + (e.mean > 0 ? ' · ' + fmt(e.mean) : '');
      if (j === i + 1) arrow(`M${cx},${y(i) + bh} L${cx},${y(j) - 4}`, e.n, COLORS[0], label, cx + 8, y(i) + bh + gap / 2 + 4, 'start');
      else curve(i, j, e.n, label);
    });
    for (const [a, c] of m.starts) if (c >= minN) {
      const j = idx.get(a);
      if (j === 0) arrow(`M${cx},34 L${cx},${y(0) - 4}`, c, COLORS[0], String(c), cx + 8, 50, 'start');
      else arrow(`M${cx - 12},22 C${cx - bw / 2 - 60 - 20 * j},22 ${cx - bw / 2 - 60 - 20 * j},${y(j) + 10} ${cx - bw / 2 - 4},${y(j) + 10}`, c, '#64748b', String(c), cx - bw / 2 - 50 - 15 * j, (22 + y(j)) / 2, 'end');
    }
    const endY = y(n) - gap + 30;
    for (const [a, c] of m.ends) if (c >= minN) {
      const i = idx.get(a);
      if (i === n - 1) arrow(`M${cx},${y(i) + bh} L${cx},${endY - 16}`, c, COLORS[0], String(c), cx + 8, y(i) + bh + 16, 'start');
      else { const b = 70 + 22 * (n - 1 - i); arrow(`M${cx - bw / 2},${y(i) + bh - 8} C${cx - bw / 2 - b},${y(i) + bh - 8} ${cx - bw / 2 - b},${endY} ${cx - 16},${endY}`, c, '#64748b', String(c), cx - bw / 2 - b * 0.75, (y(i) + endY) / 2 + bh / 2, 'end'); }
    }
    const maxEv = Math.max(...acts.map(a => a.events));
    const nodes = acts.map((a, i) => {
      const nm = a.name.length > 28 ? a.name.slice(0, 27) + '…' : a.name, shade = (0.08 + 0.32 * a.events / maxEv).toFixed(2);
      return `<rect x="${cx - bw / 2}" y="${y(i)}" width="${bw}" height="${bh}" rx="6" fill="#fff"/><rect x="${cx - bw / 2}" y="${y(i)}" width="${bw}" height="${bh}" rx="6" fill="rgba(31,111,178,${shade})" stroke="${COLORS[0]}"/>`
        + `<text x="${cx}" y="${y(i) + 17}" text-anchor="middle" class="pm-name">${esc(nm)}</text><text x="${cx}" y="${y(i) + 32}" text-anchor="middle" class="pm-sub">${a.events} events</text>`;
    }).join('');
    const defs = [COLORS[0], RED, '#64748b'].map(c => `<marker id="arr-${c.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('');
    return `<svg class="pm" viewBox="0 0 ${W} ${endY + 22}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${parts.join('')}`
      + `<circle cx="${cx}" cy="22" r="12" fill="${GREEN}"/><circle cx="${cx}" cy="${endY}" r="12" fill="#333"/><circle cx="${cx}" cy="${endY}" r="6" fill="#fff"/>${nodes}${labels.join('')}</svg>`
      + `<p class="note">Arrow labels: number of times the path was taken · mean time between the two steps. Blue goes to the next step, grey skips ahead, red loops back. Paths used by fewer than ${minShare}% of cases are hidden.</p>`;
  }

  A.mining = {
    title: 'Process Mining (Event Log)',
    fields: [{ key: 'c', type: 'col', label: 'Case ID (order, ticket, invoice…)' }, { key: 'a', type: 'col', label: 'Activity' },
      { key: 't0', type: 'col', label: 'Timestamp (start, or completion if only one)' }, { key: 't1', type: 'col', optional: true, label: 'End timestamp (optional)' },
      { key: 'r', type: 'col', optional: true, label: 'Resource: person, team or system (optional)' },
      { key: 'unit', type: 'select', label: 'If timestamps are plain numbers, they are in', def: 'hours', options: [['minutes', 'Minutes'], ['hours', 'Hours'], ['days', 'Days']] },
      numField('minPct', 'Hide paths used by fewer than this % of cases', { def: 3, min: 0, max: 50 })],
    run(v) {
      const c = S.raw(v.c), a = S.raw(v.a), t0 = timeColumn(v.t0, v.unit, S.label(v.t0)), t1 = v.t1 != null ? timeColumn(v.t1, v.unit, S.label(v.t1)) : null, r = v.r != null ? S.raw(v.r) : null;
      const ev = [];
      for (let i = 0; i < Math.min(c.length, a.length, t0.length); i++) if (c[i] && a[i] && isFinite(t0[i]))
        ev.push({ c: c[i], a: a[i], t0: t0[i], t1: t1 && isFinite(t1[i]) ? t1[i] : null, r: r && r[i] ? r[i] : null });
      need(ev.length >= 5, 'No usable rows: each needs a case ID, an activity and a timestamp.');
      const m = PR.mine(ev);
      need(m.activities.length <= 40, `There are ${m.activities.length} different activities; this view handles up to 40.`);
      const fmt = durationFormat(m.lead.median), share = x => pct(x / m.totalLead), top = m.variants[0];
      const out = [T(['Cases', 'Events', 'Activities', 'Paths (variants)', 'Mean lead time', 'Median', '90th percentile'],
        [[String(m.nCases), String(m.nEvents), String(m.activities.length), String(m.variants.length), fmt(m.lead.mean), fmt(m.lead.median), fmt(m.lead.p90)]], 0)];
      if (m.hasEnd) out.push(P(`Touch time is ${share(m.totalProc)} of total lead time; the other ${share(m.totalWait)} is waiting between steps.`));
      out.push(H('Process map'), Html(processMap(m, v.minPct, fmt)));

      out.push(H('Activities'), T(['Activity', 'Events', '% of cases', m.hasEnd ? 'Mean work time' : 'Mean time since previous step'].concat(m.hasEnd ? ['Mean wait before'] : [], ['Repeats', 'Resources']),
        m.activities.map(x => [x.name, String(x.events), pct(x.cases / m.nCases), m.hasEnd ? fmt(x.meanProc) : fmt(x.meanWait)].concat(m.hasEnd ? [fmt(x.meanWait)] : [], [String(x.repeats), m.hasRes ? String(x.resources) : '*']))));
      const byTime = m.edges.slice().sort((x, y) => y.total - x.total);
      out.push(H('Where the time goes: longest hand-overs'), T(['From → To', 'Times taken', 'Mean', 'Median', 'Share of all lead time'],
        byTime.slice(0, 8).map(e => [`${e.from} → ${e.to}`, String(e.n), fmt(e.mean), fmt(e.median), share(e.total)])));
      const names = m.activities.map(x => x.name).reverse();
      out.push(Plot((m.hasEnd ? [{ type: 'bar', orientation: 'h', name: 'Work', y: names, x: m.activities.map(x => x.totalProc * fmt.factor).reverse(), marker: { color: GREEN } }] : [])
        .concat([{ type: 'bar', orientation: 'h', name: m.hasEnd ? 'Waiting before the step' : 'Time since previous step', y: names, x: m.activities.map(x => x.totalWait * fmt.factor).reverse(), marker: { color: RED } }]),
      layout('Total Time by Activity (all cases)', `Total time (${fmt.unit})`, '', { barmode: 'stack', showlegend: true, height: 170 + 28 * names.length, margin: { l: 170, r: 24, t: 48, b: 48 }, yaxis: axis('', { type: 'category' }) })));
      out.push(H('Most common paths'), T(['Path', 'Cases', '% of cases', 'Mean lead time'], m.variants.slice(0, 8).map(x => [x.trace, String(x.n), pct(x.n / m.nCases), fmt(x.meanLead)])));
      const lt = m.leads.map(x => x * fmt.factor), b = binning(lt);
      out.push(Plot([{ type: 'bar', x: b.centers, y: b.count(lt), width: b.step, marker: { color: COLORS[0], opacity: 0.85, line: { color: '#fff', width: 1 } } }],
        layout('Lead Time per Case', `Lead time (${fmt.unit})`, 'Cases', { bargap: 0 })));

      // --- improvement opportunities ---
      const opp = [], e0 = byTime[0];
      if (e0) opp.push([m.hasEnd ? 'Queue before a step' : 'Slowest hand-over', `${e0.from} → ${e0.to} takes ${fmt(e0.mean)} on average and accounts for ${share(e0.total)} of all lead time`
        + (m.hasEnd ? `; overall ${share(m.totalWait)} of lead time is waiting.` : '.'), 'Waiting', 'Value stream analysis, capacity and batching review at that step, WIP limits']);
      if (m.rework.cases) {
        const worst = m.activities.slice().sort((x, y) => y.repeats - x.repeats)[0];
        opp.push(['Rework loops', `${pct(m.rework.cases / m.nCases)} of cases repeat at least one step (${m.rework.extraEvents} repeated activities, most often "${worst.name}"). Those cases take ${fmt(m.rework.meanLead)} against ${fmt(m.rework.cleanLead)} for the rest.`,
          'Defects', 'Pareto of rework reasons, fishbone, 5 Whys, mistake-proofing at the source']);
      }
      if (m.variants.length > 1) opp.push(['Non-standard paths', `${m.variants.length} different paths; the most common covers ${pct(top.n / m.nCases)} of cases and takes ${fmt(top.meanLead)}, against ${fmt(m.lead.mean)} overall.`,
        'Over-processing / variation', 'Standard work, review of exception routes']);
      if (m.hasRes && m.handoffs.total) opp.push(['Hand-offs', `${m.handoffs.perCase.toFixed(1)} hand-offs between resources per case. A step waits ${fmt(m.handoffs.meanWait)} after a hand-off, against ${fmt(m.handoffs.sameWait)} when the same resource continues.`,
        'Transport / motion', 'Swim-lane map, combine or re-sequence steps, cross-training']);
      if (m.lead.p90 > 2 * m.lead.median) opp.push(['Long tail of slow cases', `One case in ten takes longer than ${fmt(m.lead.p90)}, ${(m.lead.p90 / m.lead.median).toFixed(1)} times the median.`,
        'Variation', 'Control chart of lead time, compare slow and fast cases']);
      out.push(H('Improvement opportunities'), T(['Opportunity', 'Evidence from the data', 'Lean waste', 'Tools to use next'], opp, 4));

      // --- automation candidates ---
      const auto = PR.automationScores(m);
      out.push(H('Automation candidates'), T(['Activity', 'Events', m.hasEnd ? 'Share of work time' : 'Share of elapsed time', 'Duration variability (CV)', 'Routing predictability', 'Score', 'Suggested approach'],
        auto.map(x => [x.name, String(x.events), pct(x.share), isFinite(x.cv) ? f2(x.cv) : '*', pct(x.predictability), x.score.toFixed(0), x.approach])),
      Note('The score (0 to 100) is a screening heuristic, not a verdict: it rewards high volume, consistent duration, a predictable next step and a large share of the work. Steps that mostly appear in rework are marked down. '
        + (m.hasEnd ? '' : 'Without end timestamps, an activity\'s duration is taken as the time since the previous step, which includes waiting. ') + 'Confirm candidates with the people who do the work before investing.'));
      return out;
    }
  };

  // ---------- value stream ----------
  A.vsm = {
    title: 'Value Stream Analysis',
    fields: [{ key: 'step', type: 'col', label: 'Process step names' }, { key: 'ct', type: 'col', numeric: true, label: 'Cycle (work) time per step' },
      { key: 'wait', type: 'col', numeric: true, optional: true, label: 'Wait time before each step (optional)' },
      { key: 'va', type: 'col', optional: true, label: 'Value-adding? column of Y / N (optional)' },
      { key: 'yld', type: 'col', numeric: true, optional: true, label: 'First-pass yield per step, % or fraction (optional)' },
      { key: 'unit', type: 'text', label: 'Time unit', def: 'min' },
      numField('available', 'Available working time per day, same unit (optional)', { optional: true, min: 0 }), numField('demand', 'Customer demand per day (optional)', { optional: true, min: 0 })],
    run(v) {
      const nm = S.raw(v.step), ct = S.num(v.ct), w = v.wait != null ? S.num(v.wait) : [], va = v.va != null ? S.raw(v.va) : null, yl = v.yld != null ? S.num(v.yld) : [];
      const steps = [];
      nm.forEach((s, i) => { if (s && isFinite(ct[i])) steps.push({ name: s, ct: ct[i], wait: isFinite(w[i]) ? w[i] : 0, va: va ? /^(y|v|t|1)/i.test(va[i] || '') : true, yield: isFinite(yl[i]) ? (yl[i] > 1 ? yl[i] / 100 : yl[i]) : 1 }); });
      need(steps.length >= 2, 'At least two steps with a cycle time are needed.');
      const r = PR.valueStream(steps, { available: v.available, demand: v.demand }), u = ' ' + v.unit, names = steps.map(s => s.name);
      const out = [T(['Step', 'Cycle time', 'Wait before', 'Value-adding', 'First-pass yield'], steps.map(s => [s.name, whole(s.ct), whole(s.wait), s.va ? 'Yes' : 'No', pct(s.yield)])),
        H('Summary'), T(['Lead time', 'Total cycle time', 'Total waiting', 'Value-adding time', 'Process cycle efficiency', 'Rolled throughput yield'].concat(isFinite(r.takt) ? ['Takt time'] : []),
          [[whole(r.lead) + u, whole(r.ct) + u, whole(r.wait) + u, whole(r.va) + u, pct(r.pce), pct(r.rty)].concat(isFinite(r.takt) ? [whole(r.takt) + u] : [])], 0),
        Plot([{ type: 'bar', name: 'Waiting', x: names, y: steps.map(s => s.wait), marker: { color: RED } },
          { type: 'bar', name: 'Value-adding work', x: names, y: steps.map(s => s.va ? s.ct : 0), marker: { color: GREEN } },
          { type: 'bar', name: 'Non-value-adding work', x: names, y: steps.map(s => s.va ? 0 : s.ct), marker: { color: COLORS[3] } }],
        layout('Time per Step', '', `Time (${v.unit})`, { barmode: 'stack', showlegend: true, xaxis: axis('', { type: 'category' }) }))];
      if (isFinite(r.takt)) out.push(Plot([{ type: 'bar', x: names, y: steps.map(s => s.ct), marker: { color: steps.map(s => s.ct > r.takt ? RED : COLORS[0]) } }],
        layout('Cycle Time against Takt Time', '', `Cycle time (${v.unit})`, { xaxis: axis('', { type: 'category' }),
          shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: r.takt, y1: r.takt, line: { color: RED, dash: 'dash', width: 1.5 } }],
          annotations: [{ xref: 'paper', x: 1, y: r.takt, text: 'Takt ' + g(r.takt), showarrow: false, yanchor: 'bottom', xanchor: 'right', font: { color: RED } }] })));
      const opp = [], longWait = steps.slice().sort((a, b) => b.wait - a.wait)[0], nva = steps.filter(s => !s.va), low = steps.slice().sort((a, b) => a.yield - b.yield)[0];
      if (longWait.wait > 0) opp.push(['Largest queue', `Work waits ${whole(longWait.wait)}${u} before "${longWait.name}" (${pct(longWait.wait / r.lead)} of lead time).`]);
      if (nva.length) opp.push(['Non-value-adding steps', `${nva.map(s => s.name).join(', ')}: ${whole(M.sum(nva.map(s => s.ct)))}${u} of work the customer would not pay for. Eliminate, simplify or automate.`]);
      if (low.yield < 1) opp.push(['Lowest yield', `"${low.name}" passes ${pct(low.yield)} first time; rolled throughput yield is ${pct(r.rty)}.`]);
      if (r.overTakt.length) opp.push(['Cannot meet demand', `${r.overTakt.map(s => s.name).join(', ')} exceed${r.overTakt.length === 1 ? 's' : ''} the takt time of ${g(r.takt)}${u}: add capacity, split the work or reduce the cycle time.`]);
      else opp.push(['Bottleneck', `"${r.bottleneck.name}" has the longest cycle time (${whole(r.bottleneck.ct)}${u}) and sets the pace of the line.`]);
      out.push(H('Opportunities'), T(['Opportunity', 'Evidence'], opp, 2),
        Note('Process cycle efficiency is value-adding time divided by lead time. Rolled throughput yield is the chance a unit passes every step first time.'));
      return out;
    }
  };

  A.oee = {
    title: 'OEE (Overall Equipment Effectiveness)',
    fields: [numField('planned', 'Planned production time', { min: 1e-9 }), numField('down', 'Downtime (same unit)', { def: 0, min: 0 }),
      numField('ideal', 'Ideal cycle time per unit (same unit)', { min: 1e-12 }), numField('total', 'Total units produced', { min: 0 }), numField('good', 'Good units', { min: 0 })],
    run(v) {
      need(v.down < v.planned && v.good <= v.total && v.total > 0, 'Check the inputs: downtime must be below planned time and good units cannot exceed total units.');
      const run = v.planned - v.down, a = run / v.planned, p = Math.min(1, v.ideal * v.total / run), q = v.good / v.total, oee = a * p * q;
      const worst = [['Availability', a], ['Performance', p], ['Quality', q]].sort((x, y) => x[1] - y[1])[0];
      return [T(['Availability', 'Performance', 'Quality', 'OEE'], [[pct(a), pct(p), pct(q), pct(oee)]], 0),
        Plot([{ type: 'bar', x: ['Availability', 'Performance', 'Quality', 'OEE'], y: [a, p, q, oee].map(x => 100 * x), marker: { color: [COLORS[0], COLORS[0], COLORS[0], GREEN] } }],
          layout('OEE Breakdown', '', 'Percent', { yaxis: axis('Percent', { range: [0, 105] }), height: 320 })),
        P(`The biggest loss is ${worst[0].toLowerCase()} (${pct(worst[1])}). ` + { Availability: 'Look at breakdowns, changeovers and waiting for material.', Performance: 'Look at minor stops and reduced speed.', Quality: 'Look at scrap, rework and start-up losses.' }[worst[0]]),
        Note('World-class OEE is often quoted as about 85%.')];
    }
  };

  Analyses.MENU.Quality = [
    ['Control charts', ['cc_var', 'cc_attr']],
    ['Capability and measurement', ['capability', 'gage', 'dpmo']],
    ['Prioritise', ['pareto']],
    ['Design of experiments', ['doe_create', 'doe_analyze']],
    ['Planning', ['power']]
  ];
  Analyses.MENU.Process = [['', ['mining', 'vsm', 'oee']]];
})();
