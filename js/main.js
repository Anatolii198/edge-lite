/* ==========================================================================
   Edge — shell behaviour: theme, mobile nav, heatmap, tables, KPI tiles
   ========================================================================== */

/* ---------- theme ------------------------------------------------------ */

/* The pages ship with data-theme="dark" on <html>, so the dashboard opens dark
   with no flash and even with JavaScript off. A visitor's own choice, stored
   here, wins over that default. Remove the attribute from the <html> tags to
   follow the operating system instead; set it to "light" to ship light. */
(function theme() {
  const KEY = 'edge-theme';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);

  addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const dark = root.getAttribute('data-theme') === 'dark' ||
        (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      const next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
      /* charts re-read their CSS variables. `typeof`, not `window.Edge`: the
         engine is declared with const at the top level of a classic script,
         and const never becomes a property of window — so the window check
         silently never fired and chart colours stayed on the old theme. */
      if (typeof Edge !== 'undefined') Edge.redrawAll();
    });
  });
})();

/* ---------- mobile nav -------------------------------------------------- */

addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('[data-nav-toggle]');
  if (burger) burger.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.querySelectorAll('.nav a').forEach(a =>
    a.addEventListener('click', () => document.body.classList.remove('nav-open')));
  addEventListener('click', e => {
    if (document.body.classList.contains('nav-open') &&
        !e.target.closest('.sidebar') && !e.target.closest('[data-nav-toggle]')) {
      document.body.classList.remove('nav-open');
    }
  });
});

/* ---------- export --------------------------------------------------------
   Turns whatever the page is showing into a CSV the visitor can open in Excel
   or Sheets. No library and no backend: a Blob and a download link. Tables are
   taken as they are rendered, so an export always matches what is on screen. */

addEventListener('DOMContentLoaded', () => {
  const cell = v => '"' + String(v).replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"';

  const buildCsv = () => {
    const lines = [];
    const tables = document.querySelectorAll('.content table');

    if (tables.length) {
      tables.forEach((table, i) => {
        const card = table.closest('.card');
        const title = card && card.querySelector('.card-title');
        if (i) lines.push('');
        if (title) lines.push(cell(title.textContent));
        table.querySelectorAll('tr').forEach(tr => {
          lines.push([...tr.children].map(td => cell(td.textContent)).join(','));
        });
      });
    } else if (document.querySelector('.stat')) {
      /* a page without a table still has its headline figures */
      lines.push([cell('Metric'), cell('Value'), cell('Change')].join(','));
      document.querySelectorAll('.stat').forEach(s => {
        const g = sel => { const e = s.querySelector(sel); return e ? e.textContent : ''; };
        lines.push([cell(g('.k')), cell(g('.v')), cell(g('.delta'))].join(','));
      });
    } else {
      /* and a settings page has its fields — every page exports something real */
      const fields = document.querySelectorAll('.content label, .content .field');
      if (!fields.length) return '';
      lines.push([cell('Setting'), cell('Value')].join(','));
      fields.forEach(f => {
        const input = f.querySelector('input, select, textarea') ||
          (f.htmlFor && document.getElementById(f.htmlFor));
        if (!input) return;
        const value = input.type === 'checkbox' ? (input.checked ? 'on' : 'off') : input.value;
        /* a <label> that wraps a <select> also contains every option's text,
           so the control is stripped out before the caption is read */
        const clone = f.cloneNode(true);
        clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
        const name = (clone.textContent || input.name || '').trim();
        if (name) lines.push([cell(name), cell(value)].join(','));
      });
      if (lines.length < 2) return '';
    }
    return lines.join('\r\n');
  };

  document.querySelectorAll('[data-export]').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.querySelector('.btn-label');
      const csv = buildCsv();
      if (!csv) {
        if (label) {
          const was = label.textContent;
          label.textContent = 'Nothing to export';
          setTimeout(() => { label.textContent = was; }, 1600);
        }
        return;
      }
      const page = (document.title.split('—')[0] || 'edge').trim()
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      /* the BOM is what makes Excel read the € sign and accented names correctly */
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edge-' + (page || 'export') + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (label) {
        const was = label.textContent;
        label.textContent = 'Saved';
        setTimeout(() => { label.textContent = was; }, 1600);
      }
    });
  });
});

/* ---------- small helpers used by the pages ----------------------------- */

const UI = {

  money(v, d = 0) {
    return DATA.currency + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },

  /* KPI tile: value, delta chip and sparkline */
  /* invert:true for a figure where falling is the good news — items below par,
     waste, cancellations. The arrow still follows the number; only the colour
     follows the meaning. A delta of zero is neither, so it stays neutral. */
  kpi(sel, { label, value, delta, spark, color = '--s1', note = 'vs last week', invert = false }) {
    const host = document.querySelector(sel);
    if (!host) return;
    const flat = Math.abs(delta) < 0.05;
    const rising = delta > 0;
    const good = invert ? !rising : rising;
    const arrow = rising
      ? '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
    host.classList.add('stat');
    host.innerHTML =
      `<div class="k">${label}</div>
       <div class="v">${value}</div>
       <div class="foot">
         <span class="delta ${flat ? '' : (good ? 'up' : 'down')}">${
           flat ? 'no change' : arrow + (rising ? '+' : '') + delta.toFixed(1) + '%'
         }</span>
         <span class="delta-note">${note}</span>
       </div>
       <div class="spark" id="${sel.replace('#', '')}-spark"></div>`;
    if (spark) Edge.spark(`#${sel.replace('#', '')}-spark`, { values: spark, color });
  },

  /* Hours × weekday heatmap. Sequential ramp, one hue, light → dark. */
  heatmap(sel, { hours, days, values, unit = 'orders' }) {
    const host = document.querySelector(sel);
    if (!host) return;
    const flat = values.flat();
    const max = Math.max(...flat);
    const steps = ['--q1', '--q2', '--q3', '--q4', '--q5', '--q6', '--q7', '--q8'];
    const stepOf = v => steps[Math.min(steps.length - 1, Math.floor((v / max) * steps.length))];

    let html = '<div class="heat-grid">';
    html += '<span></span>' + hours.map(h => `<span class="heat-lab" style="text-align:center">${h}</span>`).join('');
    days.forEach((d, r) => {
      html += `<span class="heat-lab">${d}</span>`;
      hours.forEach((h, c) => {
        const v = values[r][c];
        html += `<span class="heat-cell" style="background:var(${stepOf(v)})" data-v="${v}" data-d="${d}" data-h="${h}"></span>`;
      });
    });
    html += '</div>';
    html += `<div class="heat-scale"><span>Quiet</span><span class="steps">` +
            steps.map(s => `<i style="background:var(${s})"></i>`).join('') +
            `</span><span>Busy · up to ${max} ${unit}</span></div>`;
    host.innerHTML = html;

    host.querySelectorAll('.heat-cell').forEach(cell => {
      cell.addEventListener('mousemove', ev => Edge.tip.show(
        `<div class="t-head">${cell.dataset.d}, ${cell.dataset.h}:00</div>` +
        `<div class="t-row"><span class="t-name">Orders</span><span class="t-val">${cell.dataset.v}</span></div>`, ev));
      cell.addEventListener('mouseleave', () => Edge.tip.hide());
    });
  },

  /* Legend for charts with two or more series */
  legend(sel, series) {
    const host = document.querySelector(sel);
    if (!host) return;
    host.className = 'legend';
    host.innerHTML = series.map(s =>
      `<span class="legend-item"><span class="legend-swatch" style="background:var(${s.color})"></span>${s.name}</span>`).join('');
  },

  /* Trend rows — one line per series, each sparkline on its OWN scale.
     Two series at different levels (a €49 check and a €33 one) squash each other
     on a shared axis; split into small multiples and both trends read at a glance.
     Pass derived:true for a computed row (e.g. the gap) to set it apart. */
  trendRows(sel, { rows, currency = '', decimals = 2 }) {
    const host = document.querySelector(sel);
    if (!host) return;
    host.className = 'trend';
    host.innerHTML = rows.map((r, i) => {
      const now = r.values[r.values.length - 1];
      const was = r.values[0];
      const pct = was ? ((now - was) / was) * 100 : 0;
      const up = pct >= 0;
      const arrow = up
        ? '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
      return `<div class="trend-row${r.derived ? ' is-derived' : ''}">
          <span class="t-key">${r.color ? `<i style="background:var(${r.color})"></i>` : ''}${r.name}</span>
          <span class="t-now">${currency}${now.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>
          <span class="t-spark" id="${sel.replace('#', '')}-s${i}"></span>
          <span class="delta ${up ? 'up' : 'down'}">${arrow}${up ? '+' : ''}${pct.toFixed(1)}%</span>
        </div>`;
    }).join('');
    rows.forEach((r, i) => {
      Edge.spark(`#${sel.replace('#', '')}-s${i}`, {
        values: r.values, color: r.color || '--muted', height: 34
      });
    });
  },

  /* Orders table */
  ordersTable(sel, rows) {
    const host = document.querySelector(sel);
    if (!host) return;
    host.innerHTML = rows.map(o => `
      <tr>
        <td><strong>${o.id}</strong></td>
        <td>${o.time}</td>
        <td>${o.channel}</td>
        <td>${o.table}</td>
        <td class="num">${o.guests}</td>
        <td class="num">${o.items}</td>
        <td class="num">${UI.money(o.total, 2)}</td>
        <td><span class="pill ${o.status}"><i></i>${o.statusText}</span></td>
      </tr>`).join('');
  }
};
