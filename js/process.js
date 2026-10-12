// Process analysis from an event log: one row per activity performed in a case.
const MProc = (function () {
  'use strict';
  const sum = a => a.reduce((s, v) => s + v, 0);
  const mean = a => a.length ? sum(a) / a.length : NaN;
  const sdev = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(sum(a.map(v => (v - m) ** 2)) / (a.length - 1)); };
  const quant = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), w = (s.length - 1) * p, i = Math.floor(w); return s[i] + (w - i) * ((s[i + 1] ?? s[i]) - s[i]); };

  // events: [{ c: case id, a: activity, t0: start, t1: end or null, r: resource or null }]
  // Times are numbers in any consistent unit.
  function mine(events) {
    const cases = new Map();
    events.forEach((e, i) => { e.i = i; if (!cases.has(e.c)) cases.set(e.c, []); cases.get(e.c).push(e); });
    const acts = new Map(), edges = new Map(), variants = new Map(), starts = new Map(), ends = new Map();
    const act = a => { if (!acts.has(a)) acts.set(a, { name: a, n: 0, cases: 0, proc: [], wait: [], repeats: 0, repCases: 0, next: new Map(), res: new Set(), pos: 0 }); return acts.get(a); };
    const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    const leads = [], reworkLead = [], cleanLead = [], hoWait = [], sameWait = [];
    let handoffs = 0, hasEnd = false, hasRes = false, totalProc = 0, totalWait = 0;

    for (const [id, list] of cases) {
      list.sort((x, y) => x.t0 - y.t0 || x.i - y.i);
      const seen = new Map();
      list.forEach((e, k) => {
        const A = act(e.a);
        A.n++; bump(seen, e.a);
        A.pos += list.length > 1 ? k / (list.length - 1) : 0;
        if (e.t1 != null) { hasEnd = true; A.proc.push(Math.max(0, e.t1 - e.t0)); totalProc += Math.max(0, e.t1 - e.t0); }
        if (e.r != null) { hasRes = true; A.res.add(e.r); }
        bump(A.next, k < list.length - 1 ? list[k + 1].a : '(end)');
        if (k === 0) return;
        const prev = list[k - 1], gap = Math.max(0, e.t0 - (prev.t1 != null ? prev.t1 : prev.t0));
        A.wait.push(gap); totalWait += gap;
        const key = prev.a + '\u0000' + e.a;
        if (!edges.has(key)) edges.set(key, { from: prev.a, to: e.a, n: 0, times: [] });
        const E = edges.get(key); E.n++; E.times.push(gap);
        if (e.r != null && prev.r != null) { if (e.r !== prev.r) { handoffs++; hoWait.push(gap); } else sameWait.push(gap); }
      });
      let rework = false;
      for (const [a, c] of seen) { const A = acts.get(a); A.cases++; if (c > 1) { A.repeats += c - 1; A.repCases++; rework = true; } }
      const lead = Math.max(...list.map(e => e.t1 != null ? e.t1 : e.t0)) - list[0].t0;
      leads.push(lead); (rework ? reworkLead : cleanLead).push(lead);
      bump(starts, list[0].a); bump(ends, list[list.length - 1].a);
      const trace = list.map(e => e.a).join(' → ');
      if (!variants.has(trace)) variants.set(trace, { trace, n: 0, leads: [], steps: list.length });
      const V = variants.get(trace); V.n++; V.leads.push(lead);
    }

    const nCases = cases.size, totalLead = sum(leads);
    const activities = [...acts.values()].map(A => {
      const nextTotal = sum([...A.next.values()]), k = A.next.size;
      // routing predictability: 1 − normalised entropy of what follows this activity
      const ent = k > 1 ? -sum([...A.next.values()].map(v => v / nextTotal * Math.log(v / nextTotal))) / Math.log(k) : 0;
      const dur = A.proc.length ? A.proc : A.wait;
      return {
        name: A.name, events: A.n, cases: A.cases, pos: A.pos / A.n, meanProc: mean(A.proc), meanWait: mean(A.wait),
        totalProc: sum(A.proc), totalWait: sum(A.wait), cv: sdev(dur) / mean(dur), predictability: 1 - ent,
        repeats: A.repeats, repCases: A.repCases, resources: A.res.size
      };
    }).sort((a, b) => a.pos - b.pos);
    return {
      nCases, nEvents: events.length, hasEnd, hasRes, activities,
      edges: [...edges.values()].map(E => ({ from: E.from, to: E.to, n: E.n, mean: mean(E.times), median: quant(E.times, 0.5), total: sum(E.times) })),
      variants: [...variants.values()].map(V => ({ trace: V.trace, n: V.n, steps: V.steps, meanLead: mean(V.leads) })).sort((a, b) => b.n - a.n),
      starts, ends, leads, totalLead, totalProc, totalWait,
      lead: { mean: mean(leads), median: quant(leads, 0.5), p90: quant(leads, 0.9), sd: sdev(leads) },
      rework: { cases: reworkLead.length, meanLead: mean(reworkLead), cleanLead: mean(cleanLead), extraEvents: sum(activities.map(a => a.repeats)) },
      handoffs: { total: handoffs, perCase: handoffs / nCases, meanWait: mean(hoWait), sameWait: mean(sameWait) }
    };
  }

  // Screening score (0–100) for how suitable each activity looks for automation.
  // High volume, consistent duration, predictable routing and a large share of the work all raise it.
  function automationScores(m) {
    const maxEvents = Math.max(...m.activities.map(a => a.events));
    const workOf = a => m.hasEnd ? a.totalProc : a.totalWait, totalWork = sum(m.activities.map(workOf)) || 1;
    return m.activities.map(a => {
      const volume = a.events / maxEvents, consistency = isFinite(a.cv) ? 1 / (1 + a.cv * a.cv) : 0.5, share = workOf(a) / totalWork;
      const score = 100 * (0.3 * volume + 0.3 * consistency + 0.25 * a.predictability + 0.15 * Math.min(1, share * m.activities.length / 2));
      const isRework = a.repCases / a.cases > 0.5 || a.cases / m.nCases < 0.35;
      let approach;
      if (isRework) approach = 'Exception step: remove the cause upstream (validation, error-proofing) rather than automate it';
      else if (consistency > 0.75 && a.predictability > 0.75) approach = 'Rule-based automation (workflow or RPA): stable duration, predictable next step';
      else if (a.predictability > 0.75) approach = 'Standardise the work first (duration varies), then automate';
      else if (consistency > 0.75) approach = 'Automate the task; keep a person or decision rules for routing';
      else approach = 'Judgement-heavy: decision support or partial automation';
      return { name: a.name, events: a.events, share, cv: a.cv, predictability: a.predictability, score: isRework ? score * 0.6 : score, approach };
    }).sort((x, y) => y.score - x.score);
  }

  // Value-stream arithmetic. steps: [{ name, ct, wait, va (bool), yield (0–1) }]
  function valueStream(steps, o) {
    const ct = sum(steps.map(s => s.ct)), wait = sum(steps.map(s => s.wait)), va = sum(steps.filter(s => s.va).map(s => s.ct));
    const takt = o.demand ? o.available / o.demand : NaN;
    return { ct, wait, lead: ct + wait, va, pce: va / (ct + wait), rty: steps.reduce((p, s) => p * s.yield, 1), takt,
      bottleneck: steps.reduce((b, s) => s.ct > b.ct ? s : b, steps[0]), overTakt: isFinite(takt) ? steps.filter(s => s.ct > takt) : [] };
  }

  return { mine, automationScores, valueStream, mean, sdev, quant };
})();
