// Application shell: menus, dialogs, session output and file handling.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, attrs, html) => { const e = document.createElement(tag); Object.assign(e, attrs || {}); if (html != null) e.innerHTML = html; return e; };
  const esc = Sheet.esc;

  // ---------- session output ----------
  function addOutput(title, blocks) {
    const w = $('welcome');
    if (w) w.remove();
    const card = el('article', { className: 'result' });
    const head = el('header', null, `<h3>${esc(title)}</h3><time>${new Date().toLocaleTimeString()}</time>`);
    const close = el('button', { className: 'close', type: 'button', title: 'Remove', textContent: '×' });
    close.onclick = () => card.remove();
    head.append(close);
    card.append(head);
    const plots = [];
    blocks.forEach(b => {
      if (b.h) card.append(el('h4', { textContent: b.h }));
      else if (b.p) card.append(el('p', { textContent: b.p, style: 'white-space:pre-wrap' }));
      else if (b.note) card.append(el('p', { className: 'note', textContent: b.note }));
      else if (b.table) {
        const t = b.table, cls = j => j < t.left ? ' class="l"' : '';
        const html = '<table><thead><tr>' + t.head.map((h, j) => `<th${cls(j)}>${esc(h)}</th>`).join('') + '</tr></thead><tbody>'
          + t.rows.map(r => '<tr>' + r.map((c, j) => `<td${cls(j)}>${esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
        card.append(el('div', { className: 'tbl-wrap' }, html));
      } else if (b.plot) {
        const div = el('div', { className: 'plot' });
        card.append(div);
        plots.push([div, b.plot]);
      }
    });
    $('session').append(card);
    plots.forEach(([div, p]) => Plotly.newPlot(div, p.data, p.layout, { responsive: true, displaylogo: false }));
    $('session').scrollTo({ top: card.offsetTop - 10, behavior: 'smooth' });
  }

  // ---------- dialogs ----------
  function columnChoices(f) {
    return Sheet.used().filter(i => !f.numeric || Sheet.isNumeric(i))
      .map(i => [i, Sheet.id(i) + (Sheet.label(i) !== Sheet.id(i) ? '  ' + Sheet.label(i) : '')]);
  }

  function openDialog(spec) {
    const dlg = $('dialog'), fields = spec.fields, rows = [];
    dlg.innerHTML = '';
    const form = el('form', { method: 'dialog' }), body = el('div', { className: 'dlg-body' });
    form.append(el('h3', { textContent: spec.title }), body);

    fields.forEach((f, n) => {
      const row = el('div', { className: 'field' + (f.type === 'check' ? ' check' : '') }), id = 'f' + n;
      if (f.type === 'check') row.innerHTML = `<label><input type="checkbox" id="${id}"${f.def ? ' checked' : ''}> ${esc(f.label)}</label>`;
      else if (f.type === 'select') row.innerHTML = `<label for="${id}">${esc(f.label)}</label><select id="${id}">`
        + f.options.map(o => `<option value="${o[0]}"${o[0] === f.def ? ' selected' : ''}>${esc(o[1])}</option>`).join('') + '</select>';
      else if (f.type === 'num') row.innerHTML = `<label for="${id}">${esc(f.label)}</label><input type="number" step="any" id="${id}" value="${f.def != null ? f.def : ''}">`;
      else {
        const ch = columnChoices(f), none = `<i>No ${f.numeric ? 'numeric ' : ''}columns with data</i>`;
        if (f.type === 'col') row.innerHTML = `<label for="${id}">${esc(f.label)}</label><select id="${id}"><option value="">${f.optional ? '(none)' : '— select a column —'}</option>`
          + ch.map(c => `<option value="${c[0]}">${esc(c[1])}</option>`).join('') + '</select>';
        else row.innerHTML = `<label>${esc(f.label)}</label><div class="checklist" id="${id}">`
          + (ch.map(c => `<label><input type="checkbox" value="${c[0]}"> ${esc(c[1])}</label>`).join('') || none) + '</div>';
      }
      body.append(row);
      rows.push(row);
    });

    const ctl = n => form.querySelector('#f' + n);
    const read = () => {
      const v = {};
      fields.forEach((f, n) => {
        const c = ctl(n);
        if (f.type === 'check') v[f.key] = c.checked;
        else if (f.type === 'select') v[f.key] = c.value;
        else if (f.type === 'num') v[f.key] = c.value.trim() === '' ? null : Number(c.value);
        else if (f.type === 'col') v[f.key] = c.value === '' ? null : +c.value;
        else v[f.key] = [...c.querySelectorAll('input:checked')].map(i => +i.value);
      });
      return v;
    };
    const visible = (f, v) => !f.showIf || f.showIf(v);
    const refresh = () => { const v = read(); fields.forEach((f, n) => { rows[n].hidden = !visible(f, v); }); };
    form.addEventListener('change', refresh);

    function validate(v) {
      for (const f of fields) {
        if (!visible(f, v)) continue;
        const x = v[f.key];
        if (f.type === 'col' && x == null && !f.optional) return `Choose a column for "${f.label}".`;
        if (f.type === 'cols' && x.length < (f.min || 1)) return `Choose at least ${f.min || 1} column(s) for "${f.label}".`;
        if (f.type === 'num') {
          if (x == null) { if (!f.optional) return `Enter a value for "${f.label}".`; continue; }
          if (!isFinite(x) || (f.min != null && x < f.min) || (f.max != null && x > f.max) || (f.integer && !Number.isInteger(x)))
            return `"${f.label}" is not a valid value.`;
        }
      }
      return '';
    }

    const error = el('div', { className: 'dlg-error' });
    const actions = el('div', { className: 'dlg-actions' });
    const cancel = el('button', { type: 'button', textContent: 'Cancel' });
    const ok = el('button', { type: 'submit', className: 'primary', textContent: 'OK' });
    cancel.onclick = () => dlg.close();
    actions.append(cancel, ok);
    form.append(error, actions);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = read();
      let msg = validate(v), blocks;
      if (!msg) try { blocks = spec.run(v); } catch (err) { msg = err.message; console.error(err); }
      if (msg) { error.textContent = msg; return; }
      dlg.close();
      addOutput(spec.title, blocks);
    });
    dlg.append(form);
    refresh();
    dlg.showModal();
  }

  // ---------- file actions ----------
  const FILE = [
    ['Open CSV file…', () => $('file-input').click()],
    ['Save worksheet as CSV', () => {
      const csv = Sheet.toCsv();
      if (!csv) return alert('The worksheet is empty.');
      const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'worksheet.csv' });
      a.click();
      URL.revokeObjectURL(a.href);
    }],
    ['Load sample data', () => { if (confirmReplace()) Sheet.sample(); }],
    ['Clear worksheet', () => { if (confirmReplace()) Sheet.clear(); }]
  ];
  const confirmReplace = () => !Sheet.used().length || confirm('Replace the current worksheet?');

  // ---------- menus ----------
  function buildMenus() {
    const nav = $('menus');
    const menu = (name, fill) => {
      const m = el('div', { className: 'menu' }), list = el('div', { className: 'menu-list' });
      const btn = el('button', { type: 'button', textContent: name });
      btn.onclick = e => { e.stopPropagation(); const open = m.classList.contains('open'); closeMenus(); m.classList.toggle('open', !open); };
      btn.onmouseenter = () => { if (document.querySelector('.menu.open')) { closeMenus(); m.classList.add('open'); } };
      fill(list);
      m.append(btn, list);
      nav.append(m);
    };
    const item = (label, fn) => { const b = el('button', { type: 'button', textContent: label }); b.onclick = () => { closeMenus(); fn(); }; return b; };
    menu('File', list => FILE.forEach(([label, fn]) => list.append(item(label, fn))));
    Object.keys(Analyses.MENU).forEach(name => menu(name, list => Analyses.MENU[name].forEach(([group, ids]) => {
      if (group) list.append(el('h4', { textContent: group }));
      ids.forEach(id => list.append(item(Analyses.all[id].title + '…', () => openDialog(Analyses.all[id]))));
    })));
    document.addEventListener('click', closeMenus);
  }
  const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));

  // ---------- pane divider ----------
  function initDivider() {
    const pane = $('sheet-pane');
    $('divider').addEventListener('pointerdown', e => {
      e.preventDefault();
      const move = ev => { pane.style.height = Math.max(80, Math.min(window.innerHeight - 160, window.innerHeight - ev.clientY - 3)) + 'px'; };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); window.dispatchEvent(new Event('resize')); };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    Sheet.init();
    buildMenus();
    initDivider();
    $('welcome-sample').onclick = () => { if (confirmReplace()) Sheet.sample(); };
    $('clear-session').onclick = () => { $('session').innerHTML = ''; };
    $('file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then(Sheet.importText);
      e.target.value = '';
    });
  });

  window.StatBench = { addOutput, openDialog };
})();
