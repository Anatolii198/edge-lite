/* ==========================================================================
   Edge — the trade card
   One trade on screen: typed in on the left, worked out on the right, with
   the charts the trader saw underneath. Nothing is sent anywhere; the save
   button writes to this browser and that is the whole round trip.
   ========================================================================== */

/* waits for the first-run demo seed, so opening a demo trade by its id works
   even on the very first page view */
Seed.ready.then(() => {

  const $ = sel => document.querySelector(sel);
  const settings = Store.settings();
  const lists = Object.assign({}, Trade.LISTS, settings.lists || {});

  const { money, signed } = J;

  /* ---------- the trade being edited ------------------------------------ */

  const params = new URLSearchParams(location.search);
  let trade = (params.get('id') && Store.get(params.get('id'))) || Trade.blank();
  const isNew = () => !trade.id;
  let dirty = false;

  /* ---------- fill the pick lists --------------------------------------- */

  const fillList = (sel, values) => {
    const host = $(sel);
    if (host) host.innerHTML = values.map(v => `<option value="${v}">`).join('');
  };

  $('#symbol-list').innerHTML = Instruments.all
    .map(i => `<option value="${i.sym}">${i.name}</option>`).join('');
  fillList('#setup-list', lists.setup);
  fillList('#model-list', lists.entryModel);

  const fillSelect = (sel, values, blank) => {
    const host = $(sel);
    if (!host) return;
    host.innerHTML = `<option value="">${blank}</option>` +
      values.map(v => `<option value="${v}">${v}</option>`).join('');
  };
  fillSelect('#f-session', Trade.SESSIONS.map(s => s.name), 'Auto, from the open time');
  fillSelect('#f-exitReason', lists.exitReason, '—');
  fillSelect('#f-emotion', lists.emotion, '—');

  /* mistakes as chips: several can be true at once, and a chip reads faster
     than ten checkboxes down the card */
  $('#mistakes').innerHTML = lists.mistake.map(m =>
    `<button type="button" class="chip" data-mistake="${m}" aria-pressed="false">${m}</button>`).join('');

  $('#rating').innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="star" data-rating="${n}" aria-label="${n} out of 5">
       <svg viewBox="0 0 24 24"><path d="M12 3l2.9 5.9 6.1.9-4.5 4.3 1.1 6.1L12 17.3 6.4 20.2l1.1-6.1L3 9.8l6.1-.9z"/></svg>
     </button>`).join('');

  /* ---------- form <-> model -------------------------------------------- */

  const TEXT_FIELDS = ['symbol', 'openedAt', 'closedAt', 'setup', 'entryModel',
                       'session', 'exitReason', 'emotion', 'note'];
  const NUM_FIELDS  = ['entry', 'exit', 'stop', 'target', 'lots', 'fees',
                       'pnlBroker', 'convRate'];

  const val = v => (v === null || v === undefined || v === '' ? '' : v);
  const num = v => (v === '' || v === null || isNaN(+v) ? null : +v);

  function toForm() {
    TEXT_FIELDS.forEach(k => { const el = $('#f-' + k); if (el) el.value = trade[k] || ''; });
    NUM_FIELDS.forEach(k => {
      const el = $('#f-' + k);
      if (el) el.value = (trade[k] === null || trade[k] === undefined) ? '' : trade[k];
    });
    setDirection(trade.direction);
    setPlan(trade.followedPlan);
    setRating(trade.rating || 0);
    $('#f-beStop').setAttribute('aria-pressed', !!trade.beStop);
    document.querySelectorAll('[data-mistake]').forEach(b =>
      b.setAttribute('aria-pressed', (trade.mistakes || []).includes(b.dataset.mistake)));
    $('#btn-delete').hidden = isNew();
    $('#page-title').textContent = isNew() ? 'New trade' : 'Edit trade';
    renderParts();
    renderShots();
  }

  function fromForm() {
    TEXT_FIELDS.forEach(k => { const el = $('#f-' + k); if (el) trade[k] = el.value.trim(); });
    NUM_FIELDS.forEach(k => {
      const el = $('#f-' + k);
      if (el) trade[k] = el.value === '' ? null : parseFloat(el.value);
    });
    trade.mistakes = [...document.querySelectorAll('[data-mistake][aria-pressed="true"]')]
      .map(b => b.dataset.mistake);
    trade.beStop = $('#f-beStop').getAttribute('aria-pressed') === 'true';
    partsFromForm();
  }

  /* --- segmented controls --- */

  function setDirection(dir) {
    trade.direction = dir === 'short' ? 'short' : 'long';
    $('#dir-long').setAttribute('aria-pressed', trade.direction === 'long');
    $('#dir-short').setAttribute('aria-pressed', trade.direction === 'short');
  }
  $('#dir-long').addEventListener('click', () => { setDirection('long'); touch(); });
  $('#dir-short').addEventListener('click', () => { setDirection('short'); touch(); });

  function setPlan(v) {
    trade.followedPlan = v === true ? true : v === false ? false : null;
    $('#plan-yes').setAttribute('aria-pressed', trade.followedPlan === true);
    $('#plan-no').setAttribute('aria-pressed', trade.followedPlan === false);
    $('#plan-na').setAttribute('aria-pressed', trade.followedPlan === null);
  }
  $('#plan-yes').addEventListener('click', () => { setPlan(true); touch(); });
  $('#plan-no').addEventListener('click', () => { setPlan(false); touch(); });
  $('#plan-na').addEventListener('click', () => { setPlan(null); touch(); });

  function setRating(n) {
    trade.rating = n;
    document.querySelectorAll('[data-rating]').forEach(b =>
      b.classList.toggle('on', +b.dataset.rating <= n));
  }
  $('#rating').addEventListener('click', e => {
    const b = e.target.closest('[data-rating]');
    if (!b) return;
    /* clicking the mark you already gave clears it — otherwise a stray click
       leaves a rating you cannot take back */
    setRating(+b.dataset.rating === trade.rating ? 0 : +b.dataset.rating);
    touch();
  });

  $('#mistakes').addEventListener('click', e => {
    const b = e.target.closest('[data-mistake]');
    if (!b) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
    touch();
  });

  $('#f-beStop').addEventListener('click', e => {
    e.currentTarget.setAttribute('aria-pressed',
      e.currentTarget.getAttribute('aria-pressed') !== 'true');
    touch();
  });

  /* ---------- partial closes ---------------------------------------------
     A leg is drawn once and then left alone: redrawing the list on every
     keystroke would take the caret out of the field being typed into. Only
     adding and removing a leg rebuilds it; the grey line under each row is
     refreshed in place by render(). */

  function renderParts() {
    const rows = trade.exits || [];
    $('#parts').hidden = !rows.length;
    $('#parts').innerHTML = rows.map(e => `
      <div class="part">
        <input class="p-lots" type="number" step="any" inputmode="decimal"
               placeholder="lots" aria-label="Lots closed" value="${val(e.lots)}">
        <input class="p-price" type="number" step="any" inputmode="decimal"
               placeholder="price" aria-label="Price" value="${val(e.price)}">
        <input class="p-at" type="datetime-local" aria-label="Time" value="${val(e.at)}">
        <button type="button" class="btn btn-icon p-del" aria-label="Remove this leg">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <small class="p-info"></small>
      </div>`).join('');
  }

  function partsFromForm() {
    trade.exits = [...document.querySelectorAll('#parts .part')].map(row => ({
      lots:  num(row.querySelector('.p-lots').value),
      price: num(row.querySelector('.p-price').value),
      at:    row.querySelector('.p-at').value
    }));
  }

  /* What is still in the market, in lots. The quick buttons work off this, so
     "take 50%" after a first half means half of what is left, not half of the
     original — which is what the words mean at the screen. */
  function openLots() {
    const total = num(trade.lots);
    if (total === null) return null;
    const taken = (trade.exits || []).reduce((s, e) => s + (num(e.lots) || 0), 0);
    return Math.round((total - taken) * 1e6) / 1e6;
  }

  document.querySelector('.parts-add').addEventListener('click', e => {
    const b = e.target.closest('[data-part-pct]');
    if (!b) return;
    fromForm();
    const pct = b.dataset.partPct;
    const left = openLots();
    /* lots to two decimals — no broker fills 0.16666 */
    const lots = (pct && left !== null && left > 0)
      ? Math.round(left * (+pct) / 100 * 100) / 100 : null;
    trade.exits = (trade.exits || []).concat({ lots, price: null, at: '' });
    renderParts();
    touch();
    const last = $('#parts .part:last-child');
    if (last) last.querySelector(lots === null ? '.p-lots' : '.p-price').focus();
  });

  $('#parts').addEventListener('click', e => {
    const del = e.target.closest('.p-del');
    if (!del) return;
    const i = [...document.querySelectorAll('#parts .part')].indexOf(del.closest('.part'));
    fromForm();
    trade.exits.splice(i, 1);
    renderParts();
    touch();
  });

  /* the rows are built after the one-off binding below, so they need their own */
  $('#parts').addEventListener('input', touch);

  function refreshParts(d) {
    const total = num(trade.lots);
    const dir = trade.direction === 'short' ? -1 : 1;
    document.querySelectorAll('#parts .part').forEach((row, i) => {
      const e = (trade.exits || [])[i] || {};
      const bits = [];
      if (e.lots !== null && total) bits.push(Math.round(e.lots / total * 100) + '% of the position');
      if (e.price !== null && trade.entry !== null) {
        const p = dir * (e.price - trade.entry) / d.spec.pip;
        bits.push((p > 0 ? '+' : '') + p.toFixed(1) + ' pips');
      }
      row.querySelector('.p-info').textContent = bits.join('  ·  ');
    });

    const left = openLots();
    const note = $('#parts-note');
    if (!(trade.exits || []).length) {
      note.innerHTML = 'Took part of it off and let the rest run? Add the piece here — the ' +
        '<b>Exit</b> field above closes whatever is left, and every figure is weighted by size.';
    } else if (left === null) {
      note.innerHTML = '<b class="warn">Fill in the position size</b> — without it there is nothing to take a piece of.';
    } else if (left > 1e-9) {
      note.textContent = `${left} lots still running — the Exit price above closes them.`;
    } else if (left < -1e-9) {
      note.innerHTML = '<b class="warn">These legs add up to more than the position.</b>';
    } else {
      note.textContent = 'The whole position is accounted for here.';
    }
  }

  /* ---------- live figures ---------------------------------------------- */

  function render() {
    fromForm();
    const d = Trade.derive(trade, settings);
    const spec = d.spec;

    $('#fig-pnl').textContent = d.pnl === null ? '—' : signed(d.pnl);
    $('#fig-pnl').className = 'fig-value' + (d.pnl === null ? '' : d.pnl > 0 ? ' up' : d.pnl < 0 ? ' down' : '');

    $('#fig-r').textContent = d.r === null ? '—' : (d.r > 0 ? '+' : '') + d.r.toFixed(2) + 'R';
    $('#fig-pips').textContent = d.pips === null ? '—' :
      (d.pips > 0 ? '+' : '') + d.pips.toFixed(1);
    /* the scaling rows only appear once there is something to say */
    const scaleRow = $('#row-scale'), scale = $('#fig-scale');
    scaleRow.hidden = d.scaleDelta === null;
    if (d.scaleDelta !== null) {
      scale.textContent = (d.scaleDelta > 0 ? '+' : '') + d.scaleDelta.toFixed(2) +
        'R vs holding it all';
      scale.className = d.scaleDelta > 0.005 ? 'up' : d.scaleDelta < -0.005 ? 'down' : '';
    }

    $('#row-avgexit').hidden = !d.scaled || d.avgExit === null;
    if (d.avgExit !== null) $('#fig-avgexit').textContent = d.avgExit.toFixed(spec.digits || 5);

    /* only worth a row while something is still in the market — "1 of 1 lots"
       under a closed trade is a line that tells the trader nothing */
    const running = d.openLots !== null && d.openLots > 1e-9;
    $('#row-closed').hidden = !(d.scaled && running && d.closedLots !== null);
    if (running && d.closedLots !== null && trade.lots) $('#fig-closed').textContent =
      `${(+d.closedLots).toFixed(2)} of ${(+trade.lots).toFixed(2)} lots`;

    $('#fig-risk').textContent = d.riskMoney === null ? '—' : money(d.riskMoney);
    $('#fig-plannedr').textContent = d.plannedR === null ? '—' : '1 : ' + d.plannedR.toFixed(2);
    $('#fig-duration').textContent = d.durationMin === null ? '—' : duration(d.durationMin);
    $('#fig-session').textContent = d.session || '—';

    const pill = $('#res-pill');
    const label = d.result === 'open' ? 'Open'
      : d.result === 'unpriced' ? 'Rate needed'
      : d.result[0].toUpperCase() + d.result.slice(1);
    pill.className = 'pill res-' + d.result;
    pill.innerHTML = `<i></i><span>${label}</span>`;

    /* the instrument line: what a pip is worth here, so the number above is
       never a mystery */
    const note = $('#symbol-note');
    if (!trade.symbol) note.textContent = '';
    else if (spec.unknown) note.innerHTML =
      '<b class="warn">Unknown symbol</b> — treated as 1 unit per lot. Set its contract size on Settings.';
    else note.textContent = `${spec.name} · 1 lot = ${spec.contract.toLocaleString('en-US')} ` +
      `· 1 pip = ${spec.pip} (${(spec.pip * spec.contract).toLocaleString('en-US')} ${spec.quote})`;

    /* the conversion rate is asked for only when it is genuinely needed */
    $('#rate-field').hidden = !d.needsRate;
    if (d.needsRate) $('#rate-note').textContent =
      `Profit lands in ${spec.quote}; your account is in ${settings.accountCurrency}.`;

    const warn = [];
    if (d.needsRate && !trade.convRate) warn.push(
      `P&L cannot be converted from ${spec.quote} to ${settings.accountCurrency} without a rate — enter one, or paste the broker's own P&L.`);
    if (trade.entry !== null && trade.stop === null) warn.push(
      'No stop loss, so this trade has no R and will be left out of every R statistic.');
    if (trade.stop !== null && trade.entry !== null && isWrongSide()) warn.push(
      `The stop is on the profit side of the entry for a ${trade.direction} trade. Check it.`);
    if ((trade.exits || []).length && trade.lots === null) warn.push(
      'Partial closes need the position size — without it there is no way to weight them.');
    if (d.overSized) warn.push(
      'The partial closes add up to more than the position size, so the figures above are overstated.');
    if (!d.open && !trade.closedAt) warn.push(
      'This trade is closed but has no close time, so the calendar and the balance curve have nowhere to file it.');
    $('#fig-warnings').innerHTML = warn.map(w => `<div class="note-warn">${w}</div>`).join('');

    refreshParts(d);
  }

  function isWrongSide() {
    return trade.direction === 'long' ? trade.stop > trade.entry : trade.stop < trade.entry;
  }

  function duration(min) {
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    if (h < 24) return h + 'h' + (m ? ' ' + m + 'm' : '');
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }

  function touch() { dirty = true; $('#save-state').textContent = 'Unsaved changes'; render(); }

  document.querySelectorAll('.content input, .content select, .content textarea')
    .forEach(el => el.addEventListener('input', touch));

  /* ---------- screenshots ------------------------------------------------ */

  const SLOTS = ['Before', 'After'];

  async function renderShots() {
    const host = $('#shots');
    const shots = trade.shots || [];
    const cards = [];

    for (const s of shots) {
      const url = await Store.shots.url(s.id);
      cards.push(`
        <figure class="shot" data-shot="${s.id}">
          ${url ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${s.label || 'Chart'}"></a>`
                : `<div class="shot-missing">Image not in this browser</div>`}
          <figcaption>
            <select data-shot-label="${s.id}">
              ${SLOTS.concat('Other').map(l =>
                `<option${l === s.label ? ' selected' : ''}>${l}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-icon" data-shot-del="${s.id}" aria-label="Remove">
              <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </figcaption>
        </figure>`);
    }

    if (await Store.shots.available()) {
      cards.push(`
        <button type="button" class="shot-drop" id="shot-drop">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          <b>Add a chart</b>
          <small>Drop an image, paste with Ctrl+V, or click to browse</small>
        </button>`);
    } else {
      /* Opened by double-clicking the file, most likely. Say what to do about
         it rather than offering a button that cannot work. */
      cards.push(`
        <div class="shot-drop is-off">
          <b>Charts need a local server</b>
          <small>This browser will not store images for a page opened straight from
          a folder. Run <code>python -m http.server 8000</code> in the template's folder
          and open <code>localhost:8000</code> — everything else works either way.</small>
        </div>`);
    }

    host.innerHTML = cards.join('');
  }

  async function addImage(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const label = SLOTS[(trade.shots || []).length] || 'Other';
    try {
      const id = await Store.shots.put(file, { label });
      trade.shots = (trade.shots || []).concat({ id, label });
      dirty = true;
      $('#save-state').textContent = 'Unsaved changes';
      await renderShots();
    } catch (e) {
      /* storage refused it — out of space, or a browser that will not keep
         files for this page. Never fail silently on something the trader
         just dropped in. */
      flash('That image could not be stored', true);
    }
  }

  $('#shots').addEventListener('click', async e => {
    if (e.target.closest('#shot-drop')) { $('#shot-input').click(); return; }
    const del = e.target.closest('[data-shot-del]');
    if (del) {
      const id = del.dataset.shotDel;
      await Store.shots.del(id);
      trade.shots = (trade.shots || []).filter(s => s.id !== id);
      touch();
      await renderShots();
    }
  });

  $('#shots').addEventListener('change', e => {
    const sel = e.target.closest('[data-shot-label]');
    if (!sel) return;
    const s = (trade.shots || []).find(x => x.id === sel.dataset.shotLabel);
    if (s) { s.label = sel.value; touch(); }
  });

  $('#shot-input').addEventListener('change', async e => {
    for (const f of e.target.files) await addImage(f);
    e.target.value = '';
  });

  /* Paste straight from TradingView: the trader copies the chart, lands here
     and presses Ctrl+V. No file, no download folder, no renaming. */
  addEventListener('paste', async e => {
    const items = (e.clipboardData || {}).items || [];
    for (const it of items) {
      if (it.kind === 'file' && /^image\//.test(it.type)) {
        e.preventDefault();
        await addImage(it.getAsFile());
      }
    }
  });

  ['dragenter', 'dragover'].forEach(ev => $('#shots').addEventListener(ev, e => {
    e.preventDefault();
    $('#shots').classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(ev => $('#shots').addEventListener(ev, e => {
    e.preventDefault();
    if (ev === 'dragleave' && $('#shots').contains(e.relatedTarget)) return;
    $('#shots').classList.remove('drag');
  }));
  $('#shots').addEventListener('drop', async e => {
    for (const f of (e.dataTransfer || {}).files || []) await addImage(f);
  });

  /* ---------- save & delete ---------------------------------------------- */

  function save() {
    fromForm();
    if (!trade.symbol) { flash('Pick an instrument first', true); $('#f-symbol').focus(); return; }
    const saved = Store.save(trade);
    const wasNew = isNew();
    trade = saved;
    dirty = false;
    if (wasNew) history.replaceState(null, '', 'trade.html?id=' + saved.id);
    $('#btn-delete').hidden = false;
    $('#page-title').textContent = 'Edit trade';
    flash('Saved');
  }

  function flash(text, bad) {
    const el = $('#save-state');
    el.textContent = text;
    el.className = 'save-state' + (bad ? ' bad' : ' ok');
    setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.className = 'save-state'; } }, 2600);
  }

  $('#btn-save').addEventListener('click', save);

  $('#btn-delete').addEventListener('click', async () => {
    const btn = $('#btn-delete');
    /* the viewer blocks confirm(), so the button asks for itself: one click
       arms it, the second deletes, and anything else disarms it */
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.classList.add('danger');
      btn.querySelector('.btn-label').textContent = 'Click again to delete';
      setTimeout(() => {
        btn.dataset.armed = '0';
        btn.classList.remove('danger');
        btn.querySelector('.btn-label').textContent = 'Delete';
      }, 4000);
      return;
    }
    await Store.remove(trade.id);
    dirty = false;
    location.href = 'trades.html';
  });

  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  });

  addEventListener('beforeunload', e => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ---------- go ---------------------------------------------------------- */

  if (isNew() && !trade.openedAt) {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    trade.openedAt = now.toISOString().slice(0, 16);
  }
  toForm();
  render();
  $('#page-sub').textContent = isNew()
    ? 'Everything below is kept on this computer only'
    : 'Last saved ' + new Date(trade.updatedAt).toLocaleString();
});
