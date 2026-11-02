/* ==========================================================================
   Edge — the overview
   Four numbers, the curve they came from, and the two tables that explain it.
   Everything is recomputed from the journal; nothing here is stored.
   ========================================================================== */

Seed.ready.then(() => {

  const $ = sel => document.querySelector(sel);
  const settings = Store.settings();
  let days = 0;                        // 0 = the whole journal

  const closed = () => Store.all()
    .map(t => ({ t, d: Trade.derive(t, settings) }))
    .filter(x => !x.d.open && x.d.pnl !== null)
    .sort((a, b) => String(a.t.closedAt).localeCompare(String(b.t.closedAt)));

  function cutoff(all) {
    if (!days || !all.length) return null;
    const last = new Date(all[all.length - 1].t.closedAt);
    const from = new Date(last);
    from.setDate(from.getDate() - days);
    return from;
  }

  function render() {
    const all = closed();
    const from = cutoff(all);
    const rows = from ? all.filter(x => new Date(x.t.closedAt) >= from) : all;
    const trades = rows.map(x => x.t);
    const s = Trade.stats(trades, settings);

    /* the balance line is always walked from the very first trade, then cut —
       a 30-day view must still start from the balance the account really had */
    const full = Trade.equity(all.map(x => x.t), settings.startBalance || 0, settings);
    const shown = from ? full.points.filter(p => new Date(p.at) >= from) : full.points;

    $('#sub').textContent = all.length
      ? `${Store.count()} trades · ${J.day(all[0].t.closedAt)} to ${J.day(all[all.length - 1].t.closedAt)}`
      : 'Nothing logged yet';

    /* ---------- tiles ---------- */

    J.tile('#s-pnl', {
      label: 'Net P&L', value: s.count ? J.signed(s.pnl) : '—',
      note: `${s.count} closed trades`, cls: J.tone(s.pnl),
      spark: shown.map(p => p.balance), sparkColor: s.pnl >= 0 ? '--s3' : '--s8'
    });

    J.tile('#s-winrate', {
      label: 'Win rate', value: s.decided ? J.pct(s.winRate) : '—',
      note: s.decided ? `${s.wins} won · ${s.losses} lost${s.breakeven ? ` · ${s.breakeven} flat` : ''}`
                      : 'no decided trades'
    });

    J.tile('#s-pf', {
      label: 'Profit factor', value: s.profitFactor === null ? '—' : s.profitFactor.toFixed(2),
      note: s.count ? `${J.money(s.grossWin, 0)} won against ${J.money(s.grossLoss, 0)}` : '—',
      cls: s.profitFactor > 1 ? 'up' : s.profitFactor < 1 ? 'down' : ''
    });

    J.tile('#s-expectancy', {
      label: 'Expectancy', value: s.avgR === null ? '—' : J.r(s.avgR),
      note: s.rCount ? `per trade, over ${s.rCount} with a stop` : 'needs a stop loss to compute',
      cls: J.tone(s.avgR)
    });

    /* ---------- balance ---------- */

    const pill = $('#equity-pill');
    if (shown.length) {
      const first = shown[0].balance - shown[0].pnl;
      const change = first ? (shown[shown.length - 1].balance - first) / first : 0;
      pill.className = 'pill ' + (change >= 0 ? 'res-win' : 'res-loss');
      pill.innerHTML = `<i></i><span>${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}% on the period</span>`;
    } else pill.innerHTML = '';

    if (shown.length > 1) {
      Edge.line('#equity', {
        labels: shown.map(p => J.day(p.at)),
        series: [{ name: 'Balance', values: shown.map(p => Math.round(p.balance)), color: '--s3' }],
        height: 280, currency: J.ccy(), zeroBased: false, endLabels: true, area: true
      });
      $('#equity-sub').textContent =
        `${shown.length} closed trades · peak ${J.money(Math.max(...shown.map(p => p.balance)), 0)}`;
    } else {
      $('#equity').innerHTML = '<div class="empty"><b>Not enough closed trades yet</b>' +
        '<span>The curve appears from the second one.</span></div>';
    }

    /* ---------- month by month ---------- */

    const byMonth = new Map();
    rows.forEach(({ t, d }) => {
      const k = J.monthKey(t.closedAt);
      byMonth.set(k, (byMonth.get(k) || 0) + d.pnl);
    });
    const months = [...byMonth.keys()].sort();
    if (months.length) {
      Edge.barsPN('#monthly', {
        labels: months.map(J.monthName),
        values: months.map(k => Math.round(byMonth.get(k))),
        height: 240, currency: J.ccy(), compact: true
      });
    } else $('#monthly').innerHTML = '';

    /* ---------- drawdown ---------- */

    if (shown.length > 1) {
      Edge.line('#drawdown', {
        labels: shown.map(p => J.day(p.at)),
        series: [{ name: 'Drawdown', values: shown.map(p => -+(p.drawdown * 100).toFixed(2)), color: '--s8' }],
        height: 240, zeroBased: false, suffix: '%', decimals: 1, area: true
      });
      const deepest = Math.max(...shown.map(p => p.drawdown));
      $('#dd-sub').innerHTML =
        `Deepest on this period: <b class="down">-${(deepest * 100).toFixed(1)}%</b> from the running peak`;
    } else $('#drawdown').innerHTML = '';

    /* ---------- discipline ----------
       The comparison that pays for the journal. Shown only when there is
       something on both sides; one group alone proves nothing. */

    const on = trades.filter(t => t.followedPlan === true);
    const off = trades.filter(t => t.followedPlan === false);
    if (on.length && off.length) {
      const a = Trade.stats(on, settings), b = Trade.stats(off, settings);
      const worst = Math.max(Math.abs(a.pnl), Math.abs(b.pnl)) || 1;
      const bar = (v, cls) => `<span class="meter"><span style="width:${Math.abs(v) / worst * 100}%" class="${cls}"></span></span>`;
      $('#discipline').innerHTML = `
        <div class="compare">
          <div class="cmp-row">
            <span class="cmp-name">Followed the plan ${J.thin(a.count)}</span>
            <span class="cmp-val up">${J.signed(a.pnl, 0)}</span>
            ${bar(a.pnl, 'good')}
            <span class="cmp-note">${a.count} trades · ${J.pct(a.winRate)} win · ${J.r(a.avgR)}</span>
          </div>
          <div class="cmp-row">
            <span class="cmp-name">Off plan ${J.thin(b.count)}</span>
            <span class="cmp-val ${J.tone(b.pnl)}">${J.signed(b.pnl, 0)}</span>
            ${bar(b.pnl, b.pnl < 0 ? 'bad' : 'good')}
            <span class="cmp-note">${b.count} trades · ${J.pct(b.winRate)} win · ${J.r(b.avgR)}</span>
          </div>
        </div>
        ${b.pnl < 0 ? `<div class="note-warn">Those ${b.count} off-plan trades cost
          <b>${J.money(Math.abs(b.pnl), 0)}</b>. Without them the account would be at
          <b>${J.money((settings.startBalance || 0) + a.pnl, 0)}</b>.</div>` : ''}`;
    } else {
      $('#discipline').innerHTML = `<div class="empty"><b>Nothing to compare yet</b>
        <span>Mark trades as on- or off-plan in the card and this fills in.</span></div>`;
    }

    /* ---------- entry models ---------- */

    const byModel = new Map();
    rows.forEach(({ t }) => {
      const k = t.entryModel || '—';
      if (!byModel.has(k)) byModel.set(k, []);
      byModel.get(k).push(t);
    });
    const models = [...byModel.entries()]
      .map(([name, list]) => ({ name, s: Trade.stats(list, settings) }))
      .sort((x, y) => y.s.pnl - x.s.pnl);

    $('#models').innerHTML = models.map(m => `
      <tr>
        <td class="wrap-cell">${m.name} ${J.thin(m.s.count)}</td>
        <td class="num">${m.s.count}</td>
        <td class="num">${m.s.decided ? J.pct(m.s.winRate, 0) : '—'}</td>
        <td class="num ${J.tone(m.s.avgR)}">${J.r(m.s.avgR)}</td>
        <td class="num ${J.tone(m.s.pnl)}"><strong>${J.signed(m.s.pnl, 0)}</strong></td>
      </tr>`).join('') ||
      '<tr><td colspan="5" class="muted-cell">No entry models recorded yet</td></tr>';

    /* ---------- latest ---------- */

    $('#latest').innerHTML = rows.slice(-8).reverse().map(({ t, d }) => `
      <tr data-id="${t.id}" tabindex="0">
        <td>${J.when(t.closedAt)}</td>
        <td><strong>${t.symbol}</strong></td>
        <td>${J.side(t.direction)}</td>
        <td class="wrap-cell">${t.entryModel || '<span class="muted-cell">—</span>'}</td>
        <td class="num ${J.tone(d.r)}">${d.r === null ? '—' : d.r.toFixed(2)}</td>
        <td class="num ${J.tone(d.pnl)}"><strong>${J.signed(d.pnl)}</strong></td>
      </tr>`).join('') ||
      '<tr><td colspan="6" class="muted-cell">Nothing closed yet</td></tr>';
  }

  $('#latest').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.href = 'trade.html?id=' + encodeURIComponent(tr.dataset.id);
  });

  $('#range').addEventListener('click', e => {
    const b = e.target.closest('button[data-days]');
    if (!b) return;
    days = +b.dataset.days;
    [...$('#range').children].forEach(x => x.setAttribute('aria-pressed', x === b));
    render();
  });

  render();
});
