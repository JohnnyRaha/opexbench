// Worksheet: column-oriented data model plus the editable grid.
const Sheet = (function () {
  'use strict';
  const MIN_ROWS = 60, MIN_COLS = 16, STORE = 'statslab.sheet';
  let cols = [];      // [{ name, data: [string] }]
  let nRows = MIN_ROWS;
  const grid = () => document.getElementById('grid');

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const miss = v => v == null || v.trim() === '' || v.trim() === '*';
  const isNum = v => v.trim() !== '' && isFinite(Number(v));

  function colLen(c) {
    let n = c.data.length;
    while (n > 0 && miss(c.data[n - 1])) n--;
    return n;
  }
  function isNumeric(i) {
    const c = cols[i], n = colLen(c);
    if (!n) return false;
    for (let r = 0; r < n; r++) if (!miss(c.data[r]) && !isNum(c.data[r])) return false;
    return true;
  }
  const id = i => 'C' + (i + 1);
  const label = i => cols[i].name.trim() || id(i);
  const used = () => cols.map((c, i) => i).filter(i => colLen(cols[i]) > 0);

  // Numbers with NaN for missing cells, trimmed to the column's length.
  const num = i => cols[i].data.slice(0, colLen(cols[i])).map(v => miss(v) ? NaN : Number(v));
  // Trimmed strings with '' for missing cells.
  const raw = i => cols[i].data.slice(0, colLen(cols[i])).map(v => miss(v) ? '' : v.trim());

  function ensure(rows, nCols) {
    while (cols.length < Math.max(nCols, MIN_COLS)) cols.push({ name: '', data: [] });
    nRows = Math.max(nRows, rows, MIN_ROWS);
  }

  function render() {
    ensure(Math.max(0, ...cols.map(colLen)) + 25, used().length ? Math.max(...used()) + 4 : 0);
    let h = '<thead><tr><th class="rownum"></th>';
    cols.forEach((c, i) => { h += `<th data-c="${i}"></th>`; });
    h += '</tr><tr class="names"><th class="rownum"></th>';
    cols.forEach((c, i) => { h += `<td contenteditable="plaintext-only" data-r="-1" data-c="${i}">${esc(c.name)}</td>`; });
    h += '</tr></thead><tbody>';
    for (let r = 0; r < nRows; r++) {
      h += `<tr><th class="rownum">${r + 1}</th>`;
      for (let i = 0; i < cols.length; i++) h += `<td contenteditable="plaintext-only" data-r="${r}" data-c="${i}">${esc(cols[i].data[r] || '')}</td>`;
      h += '</tr>';
    }
    grid().innerHTML = h + '</tbody>';
    refreshTypes();
  }

  // Column headers show "-T" for text columns; text cells are left-aligned.
  function refreshTypes() {
    cols.forEach((c, i) => {
      const text = colLen(c) > 0 && !isNumeric(i);
      grid().querySelector(`thead th[data-c="${i}"]`).textContent = id(i) + (text ? '-T' : '');
      grid().querySelectorAll(`tbody td[data-c="${i}"]`).forEach(td => td.classList.toggle('text', text));
    });
  }

  function save() {
    try {
      const keep = used().length ? Math.max(...used()) + 1 : 0;
      localStorage.setItem(STORE, JSON.stringify(cols.slice(0, keep).map(c => ({ name: c.name, data: c.data.slice(0, colLen(c)) }))));
    } catch (e) { /* storage unavailable */ }
  }

  function load(data) {
    cols = data.map(c => ({ name: c.name || '', data: (c.data || []).map(v => v == null ? '' : String(v)) }));
    nRows = MIN_ROWS;
    render();
    save();
  }

  function setCell(r, c, v) {
    if (r < 0) cols[c].name = v; else cols[c].data[r] = v;
  }

  // Fill a block of cells starting at (r0, c0) from a 2-D array of strings.
  function fill(r0, c0, rows) {
    ensure(r0 + rows.length + 5, c0 + Math.max(...rows.map(r => r.length)));
    rows.forEach((row, dr) => row.forEach((v, dc) => setCell(r0 + dr, c0 + dc, v)));
    render();
    save();
  }

  function parseDelimited(text) {
    const first = text.split(/\r?\n/, 1)[0];
    const d = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ''));
  }

  function importText(text) {
    const rows = parseDelimited(text);
    if (!rows.length) return;
    const header = rows[0].some(v => v.trim() !== '' && !isNum(v));
    const width = Math.max(...rows.map(r => r.length));
    const body = header ? rows.slice(1) : rows;
    load(Array.from({ length: width }, (_, j) => ({ name: header ? (rows[0][j] || '').trim() : '', data: body.map(r => r[j] || '') })));
  }

  function toCsv() {
    const u = used();
    if (!u.length) return '';
    const last = Math.max(...u), q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const lines = [cols.slice(0, last + 1).map((c, i) => q(label(i))).join(',')];
    const n = Math.max(...cols.map(colLen));
    for (let r = 0; r < n; r++) lines.push(cols.slice(0, last + 1).map(c => q(c.data[r] || '')).join(','));
    return lines.join('\n');
  }

  function focusCell(r, c) {
    const td = grid().querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    if (td) { td.focus(); document.getSelection().selectAllChildren(td); }
  }

  function init() {
    const g = grid();
    g.addEventListener('input', e => {
      const td = e.target.closest('td');
      if (td) setCell(+td.dataset.r, +td.dataset.c, td.textContent);
    });
    g.addEventListener('focusout', e => { if (e.target.closest('td')) { refreshTypes(); save(); } });
    g.addEventListener('keydown', e => {
      const td = e.target.closest('td');
      if (!td) return;
      const r = +td.dataset.r, c = +td.dataset.c;
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (r + 1 >= nRows) { nRows += 25; render(); }
        focusCell(r + 1, c);
      } else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(r - 1, c); }
    });
    g.addEventListener('paste', e => {
      const td = e.target.closest('td');
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!td || !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
      e.preventDefault();
      fill(+td.dataset.r, +td.dataset.c, text.replace(/\r?\n$/, '').split(/\r?\n/).map(l => l.split('\t')));
    });
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* ignore */ }
    if (Array.isArray(stored)) load(stored); else render();
  }

  // Synthetic bottling-line data, generated from a fixed seed so results are repeatable.
  function sample() {
    let seed = 20240917;
    const u = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const z = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
    const machines = ['A', 'B', 'C'], shift = ['Day', 'Night'], offset = { A: 0, B: 0.9, C: -0.4 };
    const out = { Machine: [], Shift: [], Temp: [], Pressure: [], Fill: [], Before: [], After: [], Result: [] };
    for (let i = 0; i < 72; i++) {
      const m = machines[i % 3], s = shift[Math.floor(i / 3) % 2];
      const temp = 68 + 4 * z(), pres = 30 + 2.5 * z();
      const fill = 500 + offset[m] + 0.18 * (temp - 68) - 0.12 * (pres - 30) + 0.9 * z();
      const before = 12 + 1.6 * z();
      out.Machine.push(m); out.Shift.push(s);
      out.Temp.push(temp.toFixed(1)); out.Pressure.push(pres.toFixed(1)); out.Fill.push(fill.toFixed(2));
      out.Before.push(before.toFixed(2)); out.After.push((before - 0.7 + 0.8 * z()).toFixed(2));
      out.Result.push(u() < (m === 'B' ? 0.3 : 0.12) ? 'Fail' : 'Pass');
    }
    load(Object.keys(out).map(k => ({ name: k, data: out[k] })));
  }

  // Synthetic coffee-lot data for the machine-learning tools: Grade is a class label and
  // Price a numeric target, both driven (non-linearly) by the measurements. A few rows have
  // no Grade or Price so they can be scored as new observations.
  function sampleML() {
    let seed = 73110;
    const u = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const z = () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
    const regions = ['Highland', 'Valley', 'Coast'], bonus = { Highland: 0.8, Valley: 0, Coast: -0.5 };
    const out = { Region: [], Altitude: [], Moisture: [], Acidity: [], Density: [], Defects: [], Grade: [], Price: [] };
    for (let i = 0; i < 186; i++) {
      const reg = regions[Math.floor(u() * 3)];
      const alt = 1400 + (reg === 'Highland' ? 350 : reg === 'Coast' ? -300 : 0) + 180 * z();
      const moist = 11 + 0.9 * z(), acid = 5 + 0.0012 * (alt - 1400) + 0.5 * z(), dens = 690 + 0.03 * (alt - 1400) + 14 * z();
      const defects = Math.max(0, Math.round(6 - 0.004 * (alt - 1400) + 2.5 * z()));
      const score = 1.6 * (acid - 5) + 0.05 * (dens - 690) - 0.35 * defects - 0.9 * Math.abs(moist - 11) + bonus[reg] + 0.6 * z();
      const price = 4.2 + 0.55 * score + 0.05 * score * score + 0.25 * z();
      const known = i < 180;
      out.Region.push(reg); out.Altitude.push(alt.toFixed(0)); out.Moisture.push(moist.toFixed(1)); out.Acidity.push(acid.toFixed(2));
      out.Density.push(dens.toFixed(0)); out.Defects.push(String(defects));
      out.Grade.push(known ? (score > -0.9 ? 'Specialty' : score > -2.6 ? 'Premium' : 'Commercial') : '');
      out.Price.push(known ? price.toFixed(2) : '');
    }
    load(Object.keys(out).map(k => ({ name: k, data: out[k] })));
  }

  const lcg = seed => {
    const u = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    return { u, z: () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()) };
  };

  // Synthetic data for the quality tools: subgrouped diameters (with a shift late on), a crossed
  // gage study, defect counts for a Pareto chart and daily inspection results for a P chart.
  function sampleQuality() {
    const { u, z } = lcg(551);
    const sub = [], dia = [], part = [], oper = [], meas = [], day = [], insp = [], bad = [];
    for (let s = 1; s <= 25; s++) for (let k = 0; k < 5; k++) { sub.push(s); dia.push((10 + (s >= 19 && s <= 22 ? 0.035 : 0) + 0.02 * z()).toFixed(3)); }
    const pv = Array.from({ length: 10 }, () => 1.1 * z()), ov = { Ana: -0.12, Bo: 0.02, Cy: 0.14 };
    for (let rep = 0; rep < 2; rep++) for (const o of Object.keys(ov)) for (let p = 0; p < 10; p++) { part.push(p + 1); oper.push(o); meas.push((25 + pv[p] + ov[o] + 0.18 * z()).toFixed(2)); }
    for (let d = 1; d <= 25; d++) { const n = 180 + Math.floor(u() * 60); let c = 0; for (let i = 0; i < n; i++) if (u() < (d === 17 ? 0.11 : 0.04)) c++; day.push(d); insp.push(n); bad.push(c); }
    load([{ name: 'Subgroup', data: sub }, { name: 'Diameter', data: dia }, { name: 'Part', data: part }, { name: 'Operator', data: oper }, { name: 'Measurement', data: meas },
      { name: 'Defect', data: ['Scratch', 'Wrong label', 'Dent', 'Missing part', 'Misaligned', 'Contamination', 'Other'] }, { name: 'Count', data: [126, 71, 38, 19, 12, 9, 6] },
      { name: 'Day', data: day }, { name: 'Inspected', data: insp }, { name: 'Defectives', data: bad }]);
  }

  // Synthetic invoice-approval event log (one row per activity) plus a small value-stream table.
  // Built in: a long approval queue, mismatch and correction rework loops, and an extra sign-off on some invoices.
  function sampleProcess() {
    const { u, z } = lcg(9042), rows = [], base = new Date(2026, 0, 5, 8, 0).getTime(), p2 = n => String(n).padStart(2, '0');
    const stamp = h => { const d = new Date(base + h * 3.6e6); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
    const pos = (m, s) => Math.max(m * 0.15, m + s * z()), pick = a => a[Math.floor(u() * a.length)];
    const clerks = ['Aoife', 'Ben', 'Chloe'], managers = ['Dara', 'Emer'];
    let arrival = 0;
    for (let i = 1; i <= 150; i++) {
      arrival += -1.1 * Math.log(1 - u());
      let t = arrival;
      const id = 'INV-' + String(i).padStart(4, '0'), clerk = pick(clerks), mgr = pick(managers);
      const step = (act, wait, dur, res) => { t += wait; rows.push([id, act, stamp(t), stamp(t + dur), res]); t += dur; };
      const enter = () => step('Enter data', pos(2.5, 1.5), pos(0.11, 0.04), clerk), match = () => step('Match to PO', pos(1, 0.6), pos(0.07, 0.015), clerk);
      const approve = () => step('Approve', pos(18, 9), pos(0.04, 0.01), mgr);
      step('Receive invoice', 0, 1 / 60, 'System'); enter(); match();
      if (u() < 0.22) { step('Resolve mismatch', pos(6, 3), pos(0.35, 0.18), pick(clerks)); match(); }
      approve();
      if (u() < 0.12) { step('Request correction', 0.05, pos(0.06, 0.02), mgr); enter(); match(); approve(); }
      if (u() < 0.15) step('Second approval', pos(26, 10), pos(0.05, 0.02), 'Finance director');
      step('Schedule payment', pos(2, 1), pos(0.05, 0.004), clerk);
      step('Pay', pos(8, 2), 1 / 60, 'System');
    }
    const colOf = j => rows.map(r => r[j]);
    load([{ name: 'Case', data: colOf(0) }, { name: 'Activity', data: colOf(1) }, { name: 'Start', data: colOf(2) }, { name: 'End', data: colOf(3) }, { name: 'Resource', data: colOf(4) },
      { name: '', data: [] },
      { name: 'Step', data: ['Receive', 'Enter data', 'Match to PO', 'Approve', 'Schedule payment', 'Pay'] }, { name: 'CycleMin', data: [1, 7, 4, 2, 3, 1] },
      { name: 'WaitMin', data: [0, 150, 60, 1080, 120, 480] }, { name: 'ValueAdd', data: ['N', 'Y', 'N', 'N', 'N', 'Y'] }, { name: 'YieldPct', data: [100, 88, 78, 95, 99, 100] }]);
  }

  // Append new columns after the last used one. Each data array is indexed by worksheet row.
  function addColumns(list) {
    const start = used().length ? Math.max(...used()) + 1 : 0;
    ensure(Math.max(...list.map(c => c.data.length)) + 5, start + list.length);
    const taken = new Set(cols.map(c => c.name.trim()));
    list.forEach((c, k) => {
      let name = c.name;
      for (let n = 2; taken.has(name); n++) name = c.name + '_' + n;
      taken.add(name);
      cols[start + k] = { name, data: Array.from(c.data, v => v == null ? '' : String(v)) };
    });
    render();
    save();
  }

  return { init, render, load, importText, toCsv, sample, sampleML, sampleQuality, sampleProcess, addColumns, clear: () => load([]), used, isNumeric, label, id, num, raw, esc };
})();
