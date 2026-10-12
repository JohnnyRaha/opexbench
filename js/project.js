// DMAIC project workspace: the documents of a Lean Six Sigma project, phase by phase.
// Each tool is declared as a schema (form fields and/or table columns) and rendered generically.
const Project = (function () {
  'use strict';
  const esc = Sheet.esc, $ = id => document.getElementById(id), STORE = 'statslab.project';
  const num = v => v === '' || v == null || !isFinite(+v) ? NaN : +v;
  const C = { blue: '#1f6fb2', red: '#d1495b', green: '#2e8b57', amber: '#e8a33d' };

  // ---------- tool definitions ----------
  // fields: [key, label, 'text' | 'area', hint]   cols: { key, label, type?: 'num' | 'select', options?, calc?: row => text, w?: width }
  const col = (key, label, extra) => Object.assign({ key, label }, extra);
  const n10 = (key, label) => col(key, label, { type: 'num', w: 70 });
  const TOOLS = {
    charter: { name: 'Project charter', help: 'One page that says what problem you are solving, how you will know it is solved, and who is involved.', fields: [
      ['problem', 'Problem statement', 'area', 'What is wrong, where, since when, how big, and what it costs. No causes, no solutions.'],
      ['goal', 'Goal statement', 'area', 'Specific and measurable: improve [metric] from [baseline] to [target] by [date].'],
      ['business', 'Business case', 'area', 'Why this matters now: cost, customers, risk.'],
      ['scopeIn', 'In scope', 'area', 'First and last step of the process, products, sites.'], ['scopeOut', 'Out of scope', 'area', ''],
      ['metric', 'Primary metric (Y) and baseline', 'text', ''], ['target', 'Target', 'text', ''],
      ['sponsor', 'Sponsor', 'text', ''], ['lead', 'Project lead', 'text', ''], ['team', 'Team', 'text', ''], ['timeline', 'Milestones', 'area', 'Planned date for each DMAIC tollgate.']] },
    sipoc: { name: 'SIPOC', help: 'A high-level map: who supplies what to the process, the 5 to 7 main steps, and what goes to which customer.', cols: [
      col('supplier', 'Suppliers'), col('input', 'Inputs'), col('process', 'Process steps'), col('output', 'Outputs'), col('customer', 'Customers')] },
    voc: { name: 'Voice of the customer → CTQ', help: 'Turn what customers say into measurable critical-to-quality requirements.', cols: [
      col('customer', 'Customer or segment'), col('voice', 'What they said'), col('need', 'Underlying need'), col('ctq', 'Critical-to-quality requirement'), col('spec', 'Measure and spec limit')] },
    stakeholders: { name: 'Stakeholder analysis', help: 'Who is affected, how much influence they have, and how supportive they are today.', cols: [
      col('who', 'Stakeholder'), col('role', 'Role'), n10('influence', 'Influence (1–5)'), n10('support', 'Support (−2 to 2)'), col('action', 'Engagement action')],
      summary: d => bubble(d.rows.filter(r => isFinite(num(r.influence)) && isFinite(num(r.support))), 'support', 'influence', 'who', 'Support (−2 against … +2 champion)', 'Influence', [-2.5, 2.5], [0, 5.5], 'Stakeholder Map') },
    dataplan: { name: 'Data collection plan', help: 'What you will measure, exactly how, and who collects it. Agree operational definitions before collecting anything.', cols: [
      col('measure', 'Measure'), col('definition', 'Operational definition'), col('type', 'Data type', { type: 'select', options: ['Continuous', 'Count', 'Pass / fail', 'Category'] }),
      col('source', 'Source'), col('sample', 'Sample size and frequency'), col('who', 'Who collects'), col('strat', 'Stratify by')] },
    fishbone: { name: 'Fishbone (cause and effect)', help: 'Brainstorm possible causes of the problem by category. Then test the likely ones with data.', fields: [['effect', 'Effect (the problem)', 'text', '']], cols: [
      col('cat', 'Category', { type: 'select', options: ['People', 'Method', 'Machine', 'Material', 'Measurement', 'Environment'] }), col('cause', 'Possible cause'), col('why', 'Why does it happen?')],
      summary: d => ({ html: fishbone(d) }) },
    whys: { name: '5 Whys', help: 'Ask why until you reach a cause you can act on. One row per problem.', cols: [
      col('problem', 'Problem'), col('w1', 'Why? (1)'), col('w2', 'Why? (2)'), col('w3', 'Why? (3)'), col('w4', 'Why? (4)'), col('w5', 'Why? (5)'), col('root', 'Root cause')] },
    hypotheses: { name: 'Root-cause verification log', help: 'List each suspected cause, how you tested it, and what the data said.', cols: [
      col('x', 'Suspected cause (X)'), col('test', 'How it was tested'), col('result', 'Result (p-value, effect size, evidence)'),
      col('verdict', 'Verdict', { type: 'select', options: ['Confirmed', 'Rejected', 'Unclear'] })] },
    solutions: { name: 'Solution selection (impact / effort)', help: 'Score each idea. Quick wins are high impact and low effort.', cols: [
      col('solution', 'Solution'), col('cause', 'Root cause addressed'), n10('impact', 'Impact (1–10)'), n10('effort', 'Effort (1–10)'),
      col('quad', 'Quadrant', { calc: r => !isFinite(num(r.impact)) || !isFinite(num(r.effort)) ? '' : num(r.impact) > 5 ? (num(r.effort) <= 5 ? 'Quick win' : 'Major project') : (num(r.effort) <= 5 ? 'Fill-in' : 'Avoid') })],
      summary: d => bubble(d.rows.filter(r => isFinite(num(r.impact)) && isFinite(num(r.effort))), 'effort', 'impact', 'solution', 'Effort', 'Impact', [0, 10.5], [0, 10.5], 'Impact / Effort Matrix', 5.5) },
    fmea: { name: 'FMEA', help: 'For each way the process can fail, rate severity, occurrence and detection from 1 to 10. RPN = S × O × D; act on the highest first.', cols: [
      col('step', 'Process step'), col('mode', 'Failure mode'), col('effect', 'Effect'), n10('sev', 'Sev'), col('cause', 'Cause'), n10('occ', 'Occ'),
      col('controls', 'Current controls'), n10('det', 'Det'), col('rpn', 'RPN', { calc: r => { const v = num(r.sev) * num(r.occ) * num(r.det); return isFinite(v) ? String(v) : ''; } }),
      col('action', 'Recommended action'), col('owner', 'Owner', { w: 100 })],
      summary: d => {
        const rows = d.rows.map(r => ({ name: (r.mode || r.step || '').trim(), v: num(r.sev) * num(r.occ) * num(r.det) })).filter(r => isFinite(r.v) && r.name).sort((a, b) => b.v - a.v);
        return rows.length < 2 ? null : { plot: { data: [{ type: 'bar', x: rows.map(r => r.name), y: rows.map(r => r.v), marker: { color: rows.map(r => r.v >= 100 ? C.red : C.blue) } }],
          layout: baseLayout('Risk Priority Numbers', '', 'RPN', { xaxis: { type: 'category', automargin: true } }) } };
      } },
    automation: { name: 'Automation opportunities', help: 'Log candidate steps (the Process Mining report suggests some) and size the benefit before choosing an approach.', cols: [
      col('activity', 'Activity'), col('volume', 'Volume per month', { type: 'num', w: 90 }), col('minutes', 'Minutes each', { type: 'num', w: 90 }),
      col('rules', 'Decision type', { type: 'select', options: ['Fully rule-based', 'Mostly rules', 'Needs judgement'] }),
      col('approach', 'Approach', { type: 'select', options: ['Workflow / RPA', 'System integration (API)', 'Validation at data entry', 'AI-assisted', 'Eliminate the step'] }),
      col('hours', 'Hours per month', { calc: r => { const v = num(r.volume) * num(r.minutes) / 60; return isFinite(v) ? v.toFixed(1) : ''; } }), col('status', 'Status')],
      summary: d => { const t = d.rows.reduce((s, r) => s + (num(r.volume) * num(r.minutes) / 60 || 0), 0); return t ? { html: `<p><b>Total manual effort in scope: ${t.toFixed(1)} hours per month</b> (about ${(t / 140).toFixed(2)} full-time equivalents at 140 working hours a month).</p>` } : null; } },
    pilot: { name: 'Pilot plan and results', help: 'Test the solution on a small scale before rolling it out.', fields: [
      ['what', 'What is being piloted', 'area', ''], ['where', 'Where and when', 'text', ''], ['success', 'Success criteria', 'area', 'The metric and the result that would count as proof.'],
      ['risks', 'Risks and mitigations', 'area', ''], ['results', 'Results', 'area', 'Before and after, with the statistical test used.']] },
    controlplan: { name: 'Control plan', help: 'How the gains will be held: what is monitored, how often, and what to do when it drifts.', cols: [
      col('step', 'Process step'), col('what', 'Characteristic (X or Y)'), col('spec', 'Spec or target'), col('method', 'Measurement method'), col('freq', 'Sample size and frequency'),
      col('control', 'Control method', { type: 'select', options: ['Control chart', 'Checklist', 'Mistake-proofing', 'Audit', 'Automated alert', 'Standard work'] }), col('reaction', 'Reaction plan'), col('owner', 'Owner', { w: 100 })] },
    benefits: { name: 'Benefits tracking', help: 'Baseline, target and actual for each metric.', cols: [
      col('metric', 'Metric'), col('baseline', 'Baseline', { type: 'num', w: 90 }), col('target', 'Target', { type: 'num', w: 90 }), col('actual', 'Actual', { type: 'num', w: 90 }),
      col('change', 'Change vs baseline', { calc: r => { const v = (num(r.actual) - num(r.baseline)) / num(r.baseline); return isFinite(v) ? (v > 0 ? '+' : '') + (100 * v).toFixed(1) + '%' : ''; } }),
      col('gap', 'Of target achieved', { calc: r => { const v = (num(r.actual) - num(r.baseline)) / (num(r.target) - num(r.baseline)); return isFinite(v) ? (100 * v).toFixed(0) + '%' : ''; } }), col('value', 'Annual value')] },
    lessons: { name: 'Lessons learned and handover', help: 'Close the project: what to repeat, what to change, and who owns the process now.', fields: [
      ['well', 'What went well', 'area', ''], ['change', 'What we would do differently', 'area', ''], ['owner', 'Process owner taking over', 'text', ''], ['next', 'Further opportunities', 'area', '']] }
  };

  const PHASES = [
    { id: 'define', name: 'Define', goal: 'Agree what the problem is, why it matters, and who the customer is.', tools: ['charter', 'sipoc', 'voc', 'stakeholders'], analyses: ['pareto', 'mining', 'ts'],
      gate: ['Problem and goal statements are measurable and agreed with the sponsor', 'Scope has a clear first and last process step', 'Customers and their critical-to-quality requirements are identified', 'Team and timeline are confirmed'] },
    { id: 'measure', name: 'Measure', goal: 'Establish a trustworthy baseline of how the process performs today.', tools: ['dataplan'], analyses: ['gage', 'cc_var', 'cc_attr', 'capability', 'dpmo', 'mining', 'vsm', 'desc', 'hist', 'normality'],
      gate: ['Operational definitions and a data collection plan exist', 'The measurement system has been checked (gage R&R or equivalent)', 'Baseline performance is quantified (capability, DPMO or lead time)', 'The process is mapped as it really runs'] },
    { id: 'analyze', name: 'Analyze', goal: 'Find the few causes that drive most of the problem, and prove them with data.', tools: ['fishbone', 'whys', 'hypotheses'], analyses: ['pareto', 'mining', 'box', 'scatter', 't2', 'anova', 'chisq', 'corr', 'regression', 'classify', 'mlreg'],
      gate: ['Possible causes were brainstormed and prioritised', 'Root causes are verified with data, not opinion', 'The size of each cause\'s effect is known'] },
    { id: 'improve', name: 'Improve', goal: 'Choose, test and implement solutions that remove the verified causes.', tools: ['solutions', 'fmea', 'automation', 'pilot'], analyses: ['doe_create', 'doe_analyze', 'power', 't2', 'paired', 'p2', 'capability'],
      gate: ['Solutions address verified root causes', 'Risks of the new process were assessed (FMEA)', 'A pilot showed a statistically significant improvement', 'An implementation plan is agreed'] },
    { id: 'control', name: 'Control', goal: 'Hold the gains and hand the process back to its owner.', tools: ['controlplan', 'benefits', 'lessons'], analyses: ['cc_var', 'cc_attr', 'capability', 'oee'],
      gate: ['A control plan is in place with owners and reaction plans', 'Control charts show the improved process is stable', 'Benefits are measured against baseline', 'The process owner has accepted the handover'] }
  ];

  // A small worked example that matches the invoice event-log sample data.
  const EXAMPLE = { name: 'Invoice approval lead time (example)', gate: { define0: true, define1: true, define2: true }, tools: {
    charter: { f: { problem: 'Supplier invoices take a median of 37 hours from receipt to payment, and one in ten takes more than 60 hours. Late payments cost early-payment discounts and strain supplier relationships.',
      goal: 'Reduce median invoice lead time from 37 hours to 20 hours by 30 June 2026, without increasing payment errors.', business: 'About 150 invoices a week. Missed discounts and chasing calls are a recurring cost.',
      scopeIn: 'From invoice received to payment made, for purchase-order invoices.', scopeOut: 'Non-PO invoices, supplier onboarding.', metric: 'Lead time per invoice (median 37 h)', target: 'Median 20 h', sponsor: 'Finance director', lead: 'Process improvement lead' } },
    sipoc: { rows: [{ supplier: 'Suppliers', input: 'Invoice', process: 'Receive invoice', output: 'Logged invoice', customer: 'Accounts payable' }, { supplier: 'Purchasing', input: 'Purchase order', process: 'Enter data and match to PO', output: 'Matched invoice', customer: 'Approver' },
      { supplier: 'Budget holders', input: 'Approval', process: 'Approve', output: 'Approved invoice', customer: 'Treasury' }, { supplier: 'Bank', input: 'Payment run', process: 'Schedule payment and pay', output: 'Payment', customer: 'Supplier' }] },
    fishbone: { f: { effect: 'Invoices take too long to approve' }, rows: [{ cat: 'People', cause: 'Approvers batch once a day', why: 'No reminder or queue visibility' }, { cat: 'People', cause: 'Two managers cover all approvals' },
      { cat: 'Method', cause: 'No auto-approval under a threshold' }, { cat: 'Method', cause: 'Mismatches resolved by email' }, { cat: 'Machine', cause: 'PO system not integrated' },
      { cat: 'Material', cause: 'Invoices arrive without a PO number' }, { cat: 'Measurement', cause: 'Lead time is not tracked' }, { cat: 'Environment', cause: 'Month-end peaks' }] },
    hypotheses: { rows: [{ x: 'Waiting for approval drives lead time', test: 'Process mining of the event log', result: 'Match to PO → Approve is about half of all lead time', verdict: 'Confirmed' },
      { x: 'Rework lengthens lead time', test: 'Two-sample t on cases with and without repeats', result: 'About 12 h longer with rework', verdict: 'Confirmed' }] },
    solutions: { rows: [{ solution: 'Auto-approve matched invoices under a threshold', cause: 'Approval queue', impact: '8', effort: '3' }, { solution: 'Capture invoice data automatically', cause: 'Keying errors', impact: '6', effort: '7' },
      { solution: 'Daily approval reminder', cause: 'Approval queue', impact: '4', effort: '1' }] },
    fmea: { rows: [{ step: 'Enter data', mode: 'Wrong amount keyed', effect: 'Mismatch and rework', sev: '6', cause: 'Manual typing', occ: '5', controls: 'PO match', det: '3', action: 'Validate at entry' },
      { step: 'Approve', mode: 'Approval delayed', effect: 'Late payment', sev: '7', cause: 'Batching', occ: '8', controls: 'None', det: '4', action: 'Auto-approve low-value invoices' },
      { step: 'Match to PO', mode: 'False mismatch', effect: 'Delay', sev: '4', cause: 'Tolerance too tight', occ: '4', controls: 'None', det: '5', action: 'Review tolerance' }] },
    automation: { rows: [{ activity: 'Enter data', volume: '650', minutes: '7', rules: 'Fully rule-based', approach: 'Workflow / RPA' }, { activity: 'Schedule payment', volume: '600', minutes: '3', rules: 'Fully rule-based', approach: 'System integration (API)' }] }
  } };

  // ---------- state ----------
  let state = { name: '', tools: {}, gate: {} }, current = 'phase:define', timer = null;
  const blankRows = () => [{}, {}, {}];
  const data = id => { const d = state.tools[id] || (state.tools[id] = {}); d.f = d.f || {}; if (TOOLS[id].cols && !d.rows) d.rows = blankRows(); return d; };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };
  const filled = id => { const d = state.tools[id]; return !!d && (Object.values(d.f || {}).some(v => v && v.trim()) || (d.rows || []).some(r => Object.values(r).some(v => v && String(v).trim()))); };

  // ---------- small charts ----------
  const baseLayout = (title, xt, yt, extra) => Object.assign({ title: { text: title, font: { size: 15 } }, height: 360, margin: { l: 60, r: 24, t: 48, b: 60 }, showlegend: false,
    font: { family: 'Segoe UI, system-ui, sans-serif', size: 12 }, xaxis: { title: { text: xt } }, yaxis: { title: { text: yt } }, plot_bgcolor: '#fff', paper_bgcolor: '#fff' }, extra);
  function bubble(rows, xk, yk, label, xt, yt, xr, yr, title, split) {
    if (!rows.length) return null;
    const line = (a, b, c, d) => ({ type: 'line', x0: a, y0: b, x1: c, y1: d, line: { color: '#9aa3af', dash: 'dot', width: 1 } }), mid = split || 0;
    return { plot: { data: [{ type: 'scatter', mode: 'markers+text', x: rows.map(r => num(r[xk])), y: rows.map(r => num(r[yk])), text: rows.map(r => r[label] || ''), textposition: 'top center', marker: { size: 13, color: C.blue } }],
      layout: baseLayout(title, xt, yt, { xaxis: { title: { text: xt }, range: xr, zeroline: false }, yaxis: { title: { text: yt }, range: yr, zeroline: false },
        shapes: [line(mid, yr[0], mid, yr[1]), line(xr[0], (yr[0] + yr[1]) / 2, xr[1], (yr[0] + yr[1]) / 2)] }) } };
  }
  function fishbone(d) {
    const cats = TOOLS.fishbone.cols[0].options, W = 960, H = 440, y0 = H / 2, cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
    let s = `<line x1="30" y1="${y0}" x2="800" y2="${y0}" stroke="#333" stroke-width="3"/><path d="M800,${y0 - 9} L818,${y0} L800,${y0 + 9} z" fill="#333"/>`
      + `<rect x="820" y="${y0 - 34}" width="132" height="68" rx="6" fill="#eef4fa" stroke="${C.blue}"/><foreignObject x="824" y="${y0 - 30}" width="124" height="60"><div xmlns="http://www.w3.org/1999/xhtml" class="fb-effect">${esc(d.f.effect || 'Effect')}</div></foreignObject>`;
    cats.forEach((cat, k) => {
      const up = k % 2 === 0, x = 250 + 250 * Math.floor(k / 2), xe = x - 120, ye = up ? 40 : H - 40;
      const causes = d.rows.filter(r => r.cat === cat && (r.cause || '').trim()).slice(0, 5);
      s += `<line x1="${xe}" y1="${ye}" x2="${x}" y2="${y0}" stroke="${C.blue}" stroke-width="2"/><text x="${xe}" y="${up ? ye - 8 : ye + 18}" text-anchor="middle" class="fb-cat">${cat}</text>`;
      causes.forEach((r, i) => {
        const t = (i + 1) / (causes.length + 1), px = xe + (x - xe) * t, py = ye + (y0 - ye) * t;
        s += `<line x1="${px - 16}" y1="${py}" x2="${px}" y2="${py}" stroke="#64748b"/><text x="${px - 20}" y="${py + 4}" text-anchor="end" class="fb-cause">${esc(cut(r.cause.trim(), 30))}</text>`;
      });
    });
    return `<svg class="fishbone" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  // ---------- rendering ----------
  const phaseOf = id => PHASES.find(p => p.tools.includes(id));
  const gateDone = p => p.gate.filter((_, i) => state.gate[p.id + i]).length;

  function renderSide() {
    $('project-side').innerHTML = `<input id="project-name" placeholder="Project name" value="${esc(state.name)}">`
      + PHASES.map(p => `<div class="phase"><button class="phase-btn${current === 'phase:' + p.id ? ' on' : ''}" data-go="phase:${p.id}">${p.name}<span>${gateDone(p)}/${p.gate.length}</span></button>`
        + p.tools.map(t => `<button class="tool-btn${current === 'tool:' + t ? ' on' : ''}" data-go="tool:${t}"><i class="${filled(t) ? 'dot on' : 'dot'}"></i>${TOOLS[t].name}</button>`).join('') + '</div>').join('')
      + `<div class="side-actions"><button data-go="report">Project report</button><button data-act="export">Export project</button><button data-act="import">Import project</button><button data-act="new">New project</button><button data-act="example">Load example project</button></div>`;
  }

  function cell(c, r, i) {
    if (c.calc) return `<td class="calc" data-calc="${c.key}">${esc(c.calc(r))}</td>`;
    const v = esc(r[c.key] || ''), at = `data-k="${c.key}" data-i="${i}"`;
    if (c.type === 'select') return `<td><select ${at}><option></option>${c.options.map(o => `<option${o === r[c.key] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></td>`;
    if (c.type === 'num') return `<td style="width:${c.w}px"><input type="number" step="any" ${at} value="${v}"></td>`;
    return `<td${c.w ? ` style="width:${c.w}px"` : ''}><textarea rows="2" ${at}>${v}</textarea></td>`;
  }

  function toolHtml(id, readOnly) {
    const t = TOOLS[id], d = data(id);
    let h = '';
    if (t.fields) h += readOnly
      ? '<dl>' + t.fields.filter(f => (d.f[f[0]] || '').trim()).map(f => `<dt>${f[1]}</dt><dd>${esc(d.f[f[0]])}</dd>`).join('') + '</dl>'
      : t.fields.map(([k, label, type, hint]) => `<label class="pf"><span>${label}</span>` + (type === 'area'
        ? `<textarea rows="3" data-f="${k}" placeholder="${esc(hint)}">${esc(d.f[k] || '')}</textarea>` : `<input data-f="${k}" value="${esc(d.f[k] || '')}">`) + '</label>').join('');
    if (t.cols) {
      const rows = readOnly ? d.rows.filter(r => Object.values(r).some(v => v && String(v).trim())) : d.rows;
      h += `<div class="ptable-wrap"><table class="ptable${readOnly ? ' ro' : ''}"><thead><tr>${t.cols.map(c => `<th>${c.label}</th>`).join('')}${readOnly ? '' : '<th></th>'}</tr></thead><tbody>`
        + rows.map((r, i) => '<tr>' + (readOnly ? t.cols.map(c => `<td>${esc(c.calc ? c.calc(r) : r[c.key] || '')}</td>`).join('')
          : t.cols.map(c => cell(c, r, i)).join('') + `<td class="del"><button data-act="del" data-i="${i}" title="Delete row">×</button></td>`) + '</tr>').join('')
        + '</tbody></table></div>' + (readOnly ? '' : '<button class="add" data-act="add">+ Add row</button>');
    }
    return h;
  }

  function renderSummary() {
    const box = $('psummary'), id = current.slice(5), t = TOOLS[id];
    if (!box || !t || !t.summary) return;
    const s = t.summary(data(id));
    if (!s) { box.innerHTML = ''; return; }
    if (s.html) box.innerHTML = s.html;
    else { box.innerHTML = '<div class="plot"></div>'; Plotly.newPlot(box.firstChild, s.plot.data, s.plot.layout, { responsive: true, displaylogo: false }); }
  }

  function renderMain() {
    const main = $('project-main'), [kind, id] = current.split(':');
    if (kind === 'tool') {
      const t = TOOLS[id], p = phaseOf(id);
      main.innerHTML = `<p class="crumb">${p.name}</p><h2>${t.name}</h2><p class="lead">${t.help}</p>${toolHtml(id)}<div id="psummary"></div>`;
      renderSummary();
    } else if (kind === 'phase') {
      const p = PHASES.find(x => x.id === id);
      main.innerHTML = `<p class="crumb">DMAIC phase ${PHASES.indexOf(p) + 1} of 5</p><h2>${p.name}</h2><p class="lead">${p.goal}</p>`
        + '<h3>Project documents</h3><div class="chips">' + p.tools.map(t => `<button data-go="tool:${t}">${TOOLS[t].name}${filled(t) ? ' ✓' : ''}</button>`).join('') + '</div>'
        + '<h3>Data analysis for this phase</h3><p class="note">These open on the worksheet in the Analysis view.</p><div class="chips">'
        + p.analyses.map(a => `<button class="an" data-an="${a}">${Analyses.all[a].title}</button>`).join('') + '</div>'
        + `<h3>Tollgate checklist</h3>` + p.gate.map((g, i) => `<label class="gate"><input type="checkbox" data-gate="${p.id + i}"${state.gate[p.id + i] ? ' checked' : ''}> ${g}</label>`).join('');
    } else {
      main.innerHTML = `<div class="report-head"><h2>${esc(state.name || 'Untitled project')}</h2><button data-act="print">Print or save as PDF</button></div>`
        + PHASES.map(p => `<h3 class="report-phase">${p.name} <small>${gateDone(p)} of ${p.gate.length} tollgate items complete</small></h3>`
          + (p.tools.filter(filled).map(t => `<h4>${TOOLS[t].name}</h4>${toolHtml(t, true)}` + (t === 'fishbone' ? fishbone(data(t)) : '')).join('') || '<p class="note">Nothing recorded yet.</p>')).join('');
    }
    main.scrollTop = 0;
  }

  const render = () => { renderSide(); renderMain(); };

  // ---------- events ----------
  function init() {
    try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.tools) state = Object.assign({ name: '', tools: {}, gate: {} }, s); } catch (e) { /* ignore */ }
    const view = $('project-view');
    view.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.go) { current = b.dataset.go; render(); }
      else if (b.dataset.an) { StatsLab.setView('analysis'); StatsLab.openDialog(Analyses.all[b.dataset.an]); }
      else if (b.dataset.act === 'add') { data(current.slice(5)).rows.push({}); render(); }
      else if (b.dataset.act === 'del') { const d = data(current.slice(5)); d.rows.splice(+b.dataset.i, 1); if (!d.rows.length) d.rows.push({}); save(); render(); }
      else if (b.dataset.act === 'print') window.print();
      else if (b.dataset.act === 'export') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }));
        a.download = (state.name || 'project').replace(/[^\w-]+/g, '_') + '.json';
        a.click(); URL.revokeObjectURL(a.href);
      } else if (b.dataset.act === 'import') $('project-file').click();
      else if (b.dataset.act === 'example' && (!Object.keys(state.tools).some(filled) || confirm('Replace the current project with the example?'))) { state = JSON.parse(JSON.stringify(EXAMPLE)); current = 'phase:define'; save(); render(); }
      else if (b.dataset.act === 'new' && confirm('Start a new project? Export the current one first if you want to keep it.')) { state = { name: '', tools: {}, gate: {} }; current = 'phase:define'; save(); render(); }
    });
    view.addEventListener('input', e => {
      const el = e.target;
      if (el.id === 'project-name') state.name = el.value;
      else if (el.dataset.gate) { state.gate[el.dataset.gate] = el.checked; save(); renderSide(); return; }
      else if (el.dataset.f) data(current.slice(5)).f[el.dataset.f] = el.value;
      else if (el.dataset.k) {
        const id = current.slice(5), row = data(id).rows[+el.dataset.i];
        row[el.dataset.k] = el.value;
        el.closest('tr').querySelectorAll('td.calc').forEach(td => { td.textContent = TOOLS[id].cols.find(c => c.key === td.dataset.calc).calc(row); });
      } else return;
      save();
      clearTimeout(timer);
      timer = setTimeout(() => { renderSummary(); document.querySelectorAll('#project-side .tool-btn').forEach(b => b.querySelector('i').className = filled(b.dataset.go.slice(5)) ? 'dot on' : 'dot'); }, 400);
    });
    $('project-file').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then(t => {
        try { const s = JSON.parse(t); if (!s || typeof s.tools !== 'object') throw 0; state = Object.assign({ name: '', tools: {}, gate: {} }, s); save(); current = 'phase:define'; render(); }
        catch (err) { alert('That file is not a StatsLab project.'); }
      });
      e.target.value = '';
    });
  }

  return { init, render, TOOLS, PHASES, getState: () => state };
})();
