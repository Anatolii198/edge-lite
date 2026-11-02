/* ==========================================================================
   Edge — the small shared pieces every page needs: money, dates, R, tiles.
   Kept here so a change of currency or date format happens once.
   ========================================================================== */

const J = (() => {

  const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', CHF: 'CHF ', JPY: '¥', AUD: 'A$', CAD: 'C$' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* read on every call: Settings can change the currency without a reload */
  const ccy = () => {
    const c = Store.settings().accountCurrency || 'USD';
    return SYMBOLS[c] || c + ' ';
  };

  const money = (v, d = 2) => (v < 0 ? '-' : '') + ccy() +
    Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const signed = (v, d = 2) => (v > 0 ? '+' : '') + money(v, d);

  const r = v => v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + 'R';
  const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';

  /* up / down / nothing — the class, never the only signal */
  const tone = v => v > 0 ? 'up' : v < 0 ? 'down' : '';

  const when = s => {
    const d = new Date(s);
    if (isNaN(d)) return '—';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  const day = s => {
    const d = new Date(s);
    return isNaN(d) ? '—' : d.getDate() + ' ' + MONTHS[d.getMonth()];
  };

  const monthKey = s => String(s).slice(0, 7);                 // 2026-07
  const monthName = k => MONTHS[+k.slice(5, 7) - 1] + " '" + k.slice(2, 4);

  /* A KPI tile. `spark` draws a sparkline under it when values are given. */
  const tile = (sel, { label, value, note, cls = '', spark = null, sparkColor = '--s1' }) => {
    const host = document.querySelector(sel);
    if (!host) return;
    const id = sel.replace('#', '') + '-spark';
    host.innerHTML =
      `<div class="k">${label}</div>
       <div class="v${cls ? ' ' + cls : ''}">${value}</div>
       <div class="foot"><span class="delta-note">${note}</span></div>
       ${spark ? `<div class="spark" id="${id}"></div>` : ''}`;
    if (spark && spark.length > 1 && typeof Edge !== 'undefined') {
      Edge.spark('#' + id, { values: spark, color: sparkColor });
    }
  };

  /* the long/short badge used in every table */
  const side = dir => `<span class="side ${dir}">${dir === 'long' ? 'Long' : 'Short'}</span>`;

  /* "Thin sample" wherever a figure rests on too few trades */
  const thin = n => n < Trade.MIN_SAMPLE
    ? `<span class="thin-badge" title="Fewer than ${Trade.MIN_SAMPLE} trades">Thin</span>` : '';

  return { ccy, money, signed, r, pct, tone, when, day, monthKey, monthName, tile, side, thin, MONTHS };
})();
