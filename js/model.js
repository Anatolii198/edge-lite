/* ==========================================================================
   Edge — what a trade is, and every number derived from it
   Nothing here touches the DOM or storage. One trade in, its figures out, so
   the same rules serve the card, the tables, the charts and the CSV import.
   ========================================================================== */

/* ---------- the pick lists -------------------------------------------------
   Shipped as defaults only. Settings writes the trader's own lists over these
   — a journal that cannot hold "my London high break" is returned on day one. */

const LISTS = {
  setup: ['Trend continuation', 'Trend reversal', 'Range', 'Breakout',
          'News', 'Session open', 'Swing', 'Scalp'],

  /* Setup says WHY the pair was worth watching; the entry model says HOW the
     position was taken. One setup traded three ways is three different edges,
     and keeping them in one field hides that. */
  entryModel: ['Order Block', 'Fair Value Gap', 'Breaker Block',
               'Liquidity Sweep + CHoCH', 'BOS retest', 'Optimal Trade Entry',
               'Unicorn (OB + FVG)', 'Silver Bullet', 'Judas Swing',
               'Turtle Soup', 'Breakout + retest', 'Pullback to EMA',
               'Range reversal', 'News reaction'],

  emotion: ['Calm', 'Confident', 'Impatient', 'Fear', 'Greed', 'FOMO',
            'Frustration', 'Boredom', 'Tilt'],

  exitReason: ['Target hit', 'Stop hit', 'Trailing stop', 'Breakeven stop',
               'Closed manually', 'Time exit', 'Partial close'],

  mistake: ['Chased the entry', 'No stop', 'Moved the stop', 'Oversized',
            'Revenge trade', 'Cut a winner early', 'Held a loser',
            'Traded the news', 'Off-plan setup', 'Overtrading']
};

/* Trading sessions, in the journal's own timezone (Settings). Deliberately
   not overlapping: a trade belongs to one session or the statistics double
   count. Ends are exclusive. */
const SESSIONS = [
  { name: 'Asia',     from: 0,  to: 8 },
  { name: 'London',   from: 8,  to: 13 },
  { name: 'New York', from: 13, to: 22 },
  { name: 'Off-hours', from: 22, to: 24 }
];

/* Below this many trades a statistic is noise, and the pages say so out loud
   instead of printing "100% win rate" under two lucky trades. */
const MIN_SAMPLE = 20;

const Trade = {

  LISTS, SESSIONS, MIN_SAMPLE,

  /* A blank trade. Every field the journal knows exists here, so nothing is
     invented later by a typo. */
  blank() {
    return {
      id: '',
      account: 'main',
      symbol: '',
      direction: 'long',        // long | short
      openedAt: '',             // 'YYYY-MM-DDTHH:MM'
      closedAt: '',
      entry: null,
      exit: null,
      stop: null,
      target: null,
      lots: null,
      /* Scaling out. Each leg is { lots, price, at }; the `exit` above closes
         whatever is left. Empty for a position taken off in one go, which is
         why every figure below still works untouched when it is. */
      exits: [],
      beStop: false,            // the stop was moved to the entry at some point
      fees: 0,                  // commission + swap, in account currency, negative
      pnlBroker: null,          // the broker's own figure, when imported
      convRate: null,           // quote currency -> account currency, when needed
      setup: '',
      entryModel: '',
      session: '',              // '' = derive from openedAt
      emotion: '',
      followedPlan: null,       // true | false | null
      mistakes: [],
      exitReason: '',
      rating: 0,                // 0-5, the trader's own mark on execution
      note: '',
      shots: [],                // ids of images in IndexedDB
      createdAt: '',
      updatedAt: ''
    };
  },

  /* ---------- derived figures ------------------------------------------- */

  /* Everything the journal shows that is not typed in. Returns nulls rather
     than zeros for what cannot be known: a missing stop means "no R", not
     "R = 0", and an average must skip it, not average it in. */
  derive(t, opts) {
    const o = opts || {};
    const accountCcy = o.accountCurrency || 'USD';
    const spec = Instruments.spec(t.symbol);
    const dir = t.direction === 'short' ? -1 : 1;
    const n = v => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v);

    const entry = n(t.entry), exit = n(t.exit), stop = n(t.stop);
    const target = n(t.target), lots = n(t.lots);
    const fees = n(t.fees) || 0;

    const out = {
      spec,
      open: exit === null,
      pips: null, pnl: null, pnlGross: null, r: null,
      riskMoney: null, riskPips: null, plannedR: null,
      durationMin: null, closedAtEff: '', session: t.session || '', result: 'open',
      needsRate: false, unknownSymbol: !!spec.unknown,
      /* scaling out */
      legs: [], scaled: false, closedLots: null, openLots: null,
      avgExit: null, rIfHeld: null, scaleDelta: null, overSized: false,
      beStop: !!t.beStop
    };

    /* ---- the position may have come off in pieces ------------------------
       One trade, several exits. Every figure below is weighted by size, which
       is the only way the arithmetic stays honest: half a position closed at
       +2R and half at +0.5R is +1.25R of the risk taken, and averaging the
       two leg figures only happens to agree when the pieces are equal.

       `closedFrac` carries that weighting — the share of the original size
       that is out of the market. With no partial closes it is 1 and every
       line below is exactly what it was before. */
    const parts = [];
    if (lots !== null) {
      (t.exits || []).forEach(e => {
        const l = n(e.lots), p = n(e.price);
        if (l !== null && p !== null && l > 0) parts.push({ lots: l, price: p, at: e.at || '', partial: true });
      });
    }
    const partLots = parts.reduce((s, x) => s + x.lots, 0);
    /* floating point: 0.3 + 0.3 + 0.4 is not 1, and a trade must not be left
       0.00000000000000004 lots open because of it */
    const rest = lots === null ? null : Math.round((lots - partLots) * 1e6) / 1e6;
    out.scaled = parts.length > 0;
    out.overSized = rest !== null && rest < 0;

    const legs = parts.slice();
    if (exit !== null) legs.push({ lots: rest === null ? null : Math.max(rest, 0),
                                   price: exit, at: t.closedAt || '', partial: false });
    out.legs = legs;

    /* Closed once the whole size is accounted for — by the Exit field, or by
       partial closes that already covered it. */
    out.open = exit === null && !(parts.length > 0 && rest !== null && rest <= 1e-9);

    /* The average exit, weighted by size, and how much of the position it
       covers. Without a size there is nothing to weight, so a lots-less trade
       falls back to its single exit — pips and R never needed the size. */
    let avgMove = null, closedFrac = 1;
    if (lots !== null && parts.length) {
      const sized = legs.filter(l => l.lots > 0);
      const closed = sized.reduce((s, x) => s + x.lots, 0);
      if (entry !== null && closed > 0) {
        avgMove = sized.reduce((s, x) => s + (x.price - entry) * x.lots, 0) / closed;
        out.avgExit = entry + avgMove;
        out.closedLots = closed;
        out.openLots = Math.max(0, Math.round((lots - closed) * 1e6) / 1e6);
        closedFrac = lots ? closed / lots : 1;
      }
    } else if (entry !== null && exit !== null) {
      avgMove = exit - entry;
      out.avgExit = exit;
      out.closedLots = lots;
      out.openLots = 0;
    }

    /* price distance, signed by direction */
    if (avgMove !== null) out.pips = (dir * avgMove) / spec.pip;
    if (entry !== null && stop !== null) out.riskPips = Math.abs(entry - stop) / spec.pip;

    /* quote currency -> account currency.
       Derivable only when the symbol itself is that exchange rate: profit on
       USD/JPY lands in yen, and USD/JPY is the yen price of a dollar. For
       EUR/JPY on a dollar account nothing on the trade gives the rate, so the
       card asks for it rather than quietly reporting yen as dollars. */
    let factor = 1;
    if (spec.quote !== accountCcy) {
      const base = String(t.symbol || '').split('/')[0].toUpperCase();
      if (n(t.convRate)) factor = n(t.convRate);
      else if (base === accountCcy && exit) factor = 1 / exit;
      else if (base === accountCcy && entry) factor = 1 / entry;
      else { out.needsRate = true; }
    }

    const money = move => move * spec.contract * lots * factor;

    /* With no rate the profit is known in yen and unknown in dollars. Showing
       the yen figure under a dollar sign is worse than showing nothing, so
       every money figure stays null until the rate arrives. Pips and R are
       price ratios and survive untouched. */
    const canMoney = !out.needsRate;

    if (canMoney && entry !== null && stop !== null && lots !== null) {
      out.riskMoney = Math.abs(money(entry - stop));
    }
    if (entry !== null && target !== null && stop !== null && stop !== entry) {
      out.plannedR = Math.abs(target - entry) / Math.abs(entry - stop);
    }

    /* Realised money: the average move over the whole position, cut down to
       the share actually closed. A half-closed runner reports half a result,
       which is what the trader has in the account. */
    if (canMoney && entry !== null && avgMove !== null && lots !== null) {
      out.pnlGross = money(dir * avgMove) * closedFrac;
      out.pnl = out.pnlGross + fees;
    }
    /* The broker's figure wins when there is one: it already carries partial
       fills, slippage and the real conversion rate. */
    if (n(t.pnlBroker) !== null) out.pnl = n(t.pnlBroker);

    /* R — the textbook definition, on price, so it survives a broker P&L that
       already includes fees. No stop, or a stop at the entry, means no R at
       all, and this trade must drop out of every R statistic.

       The risk in the denominator is always the whole position against the
       stop set at entry — that is what was on the table when the trade was
       taken. Moving the stop to breakeven later is recorded as a decision,
       not backdated into the risk. */
    if (entry !== null && avgMove !== null && stop !== null && stop !== entry) {
      out.r = (dir * avgMove * closedFrac) / Math.abs(entry - stop);

      /* Was scaling out worth it? Compare what the trade actually produced
         with holding the whole size to the last exit. Positive means taking
         pieces off beat sitting through it. */
      if (out.scaled && !out.open && legs.length) {
        const last = legs[legs.length - 1].price;
        out.rIfHeld = (dir * (last - entry)) / Math.abs(entry - stop);
        out.scaleDelta = out.r - out.rIfHeld;
      }
    }

    /* Held until the last piece came off. Normally that is the Closed field;
       a position taken off entirely in partials falls back to the last leg,
       so the holding time is not lost with it. */
    out.closedAtEff = t.closedAt || (legs.length ? legs[legs.length - 1].at : '') || '';
    if (t.openedAt && out.closedAtEff) {
      const ms = new Date(out.closedAtEff) - new Date(t.openedAt);
      if (!isNaN(ms) && ms >= 0) out.durationMin = Math.round(ms / 60000);
    }

    if (!out.session && t.openedAt) out.session = Trade.sessionOf(t.openedAt);

    /* A trade taken off at the price it was taken on is a breakeven, not the
       small loss its commission makes of it. Measured on the price, within
       half a pip, so a stop pulled to the entry is read the same way whoever
       filled the card. The commission still counts in the money. */
    const atEntry = !out.open && avgMove !== null && Math.abs(avgMove) < spec.pip / 2;

    if (out.open) out.result = 'open';
    else if (atEntry) out.result = 'breakeven';
    else if (out.pnl !== null) out.result = out.pnl > 0 ? 'win' : out.pnl < 0 ? 'loss' : 'breakeven';
    /* closed, but the money cannot be worked out yet — neither open nor a result */
    else out.result = 'unpriced';

    return out;
  },

  sessionOf(stamp) {
    const d = new Date(stamp);
    if (isNaN(d)) return '';
    const h = d.getHours();
    const s = SESSIONS.find(x => h >= x.from && h < x.to);
    return s ? s.name : '';
  },

  /* ---------- aggregates ------------------------------------------------- */

  /* The summary every page needs, over any set of trades. Open trades are
     excluded from results; trades without a stop are excluded from R only. */
  stats(trades, opts) {
    const d = trades.map(t => Trade.derive(t, opts)).filter(x => !x.open && x.pnl !== null);
    /* Classified by where the trade came out, not by the sign of the money.
       A position closed at the price it was opened at is a scratch even
       though its commission leaves the account a few dollars lighter, and
       calling that a loss understates every win rate in the journal. */
    const wins = d.filter(x => x.result === 'win');
    const losses = d.filter(x => x.result === 'loss');
    const flats = d.filter(x => x.result === 'breakeven');
    const grossWin = wins.reduce((s, x) => s + x.pnl, 0);
    const lossMoney = Math.abs(losses.reduce((s, x) => s + x.pnl, 0));
    /* The commission on a scratch is money that left the account, so it
       belongs in the gross loss — but not in the average loss, where a run
       of $7 scratches would make the real losers look half their size. */
    const grossLoss = lossMoney +
      Math.abs(flats.reduce((s, x) => s + Math.min(x.pnl, 0), 0));
    const rs = d.map(x => x.r).filter(r => r !== null);

    /* Scaling out, answered with a number instead of an opinion: every trade
       taken off in pieces, against what holding the whole size to the last
       exit would have paid. A negative average says the runners were worth
       more than the comfort of banking early. */
    const scaled = d.filter(x => x.scaled && x.scaleDelta !== null);
    const beMoved = d.filter(x => x.beStop);

    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? lossMoney / losses.length : 0;
    /* Decided trades only: a breakeven trade is neither a win nor a loss, and
       counting it as a loss understates every win rate on the page. */
    const decided = wins.length + losses.length;
    const winRate = decided ? wins.length / decided : 0;

    return {
      count: d.length,
      decided,
      wins: wins.length,
      losses: losses.length,
      breakeven: flats.length,
      winRate,
      pnl: d.reduce((s, x) => s + x.pnl, 0),
      grossWin,
      grossLoss,
      avgWin,
      avgLoss,
      /* an infinite profit factor is not a result, it is a sample of one side */
      profitFactor: grossLoss ? grossWin / grossLoss : null,
      expectancy: decided ? winRate * avgWin - (1 - winRate) * avgLoss : 0,
      rCount: rs.length,
      avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
      expectancyR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
      best: d.length ? Math.max(...d.map(x => x.pnl)) : 0,
      worst: d.length ? Math.min(...d.map(x => x.pnl)) : 0,

      scaledCount: scaled.length,
      scaledShare: d.length ? scaled.length / d.length : 0,
      scaleDeltaR: scaled.length
        ? scaled.reduce((s, x) => s + x.scaleDelta, 0) / scaled.length : null,
      scaledPnl: scaled.reduce((s, x) => s + x.pnl, 0),

      beCount: beMoved.length,
      beShare: d.length ? beMoved.length / d.length : 0,
      /* of the trades whose stop was pulled to the entry, how many finished
         there — the cost of taking risk off, in trades that went nowhere */
      beFlat: beMoved.filter(x => x.result === 'breakeven').length,
      beWins: beMoved.filter(x => x.result === 'win').length,

      thin: d.length < MIN_SAMPLE
    };
  },

  /* Running balance and the drawdown from its own peak, trade by trade. */
  equity(trades, startBalance, opts) {
    const rows = trades
      .map(t => ({ t, d: Trade.derive(t, opts) }))
      .filter(x => !x.d.open && x.d.pnl !== null)
      .sort((a, b) => String(a.t.closedAt).localeCompare(String(b.t.closedAt)));

    let bal = startBalance || 0, peak = bal, maxDd = 0;
    const points = rows.map(x => {
      bal += x.d.pnl;
      peak = Math.max(peak, bal);
      const dd = peak ? (peak - bal) / peak : 0;
      maxDd = Math.max(maxDd, dd);
      return { at: x.t.closedAt, balance: bal, drawdown: dd, pnl: x.d.pnl, id: x.t.id };
    });
    return { points, final: bal, maxDrawdown: maxDd };
  },

  /* Position size from the one rule that matters: risk a fixed slice of the
     account, let the stop decide the size. Returns lots, not a lecture. */
  positionSize({ balance, riskPct, symbol, entry, stop, convRate }) {
    const spec = Instruments.spec(symbol);
    const dist = Math.abs((+entry) - (+stop));
    if (!balance || !riskPct || !dist || !spec.contract) return null;
    const perLot = dist * spec.contract * (convRate || 1);
    if (!perLot) return null;
    return { lots: (balance * riskPct / 100) / perLot, riskMoney: balance * riskPct / 100, pips: dist / spec.pip };
  }
};
