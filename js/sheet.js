// Worksheet: column-oriented data model plus the editable grid.
const Sheet = (function () {
  'use strict';
  const MIN_ROWS = 60, MIN_COLS = 16, STORE = 'statbench.sheet';
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

  return { init, render, load, importText, toCsv, sample, clear: () => load([]), used, isNumeric, label, id, num, raw, esc };
})();
