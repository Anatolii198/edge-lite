/* ==========================================================================
   Edge — instrument catalogue
   The one place that knows what a price move is worth. Every figure in the
   journal — money, pips, R — is derived from these three numbers, so a broker
   whose contract differs is fixed here (or on Settings) and nowhere else.
   ========================================================================== */

/* contract — units bought by one standard lot (1.00)
   pip      — the price step counted as one pip
   quote    — the currency the profit arrives in

   Money per lot for a whole-price move of 1.00 IS the contract size, so:
       profit = (exit - entry) x contract x lots          [in `quote`]
   and one pip is worth (pip x contract) per lot. On EUR/USD that is
   0.0001 x 100 000 = $10, the number every FX trader knows — which is the
   check that the table below is right. */

const INSTRUMENTS = [
  /* --- FX majors ------------------------------------------------------- */
  { sym: 'EUR/USD', name: 'Euro / US Dollar',        group: 'FX majors', contract: 100000, pip: 0.0001, digits: 5, quote: 'USD' },
  { sym: 'GBP/USD', name: 'Pound / US Dollar',       group: 'FX majors', contract: 100000, pip: 0.0001, digits: 5, quote: 'USD' },
  { sym: 'AUD/USD', name: 'Aussie / US Dollar',      group: 'FX majors', contract: 100000, pip: 0.0001, digits: 5, quote: 'USD' },
  { sym: 'NZD/USD', name: 'Kiwi / US Dollar',        group: 'FX majors', contract: 100000, pip: 0.0001, digits: 5, quote: 'USD' },
  { sym: 'USD/CAD', name: 'US Dollar / Loonie',      group: 'FX majors', contract: 100000, pip: 0.0001, digits: 5, quote: 'CAD' },
  { sym: 'USD/CHF', name: 'US Dollar / Swissie',     group: 'FX majors', contract: 100000, pip: 0.0001, digits: 5, quote: 'CHF' },
  { sym: 'USD/JPY', name: 'US Dollar / Yen',         group: 'FX majors', contract: 100000, pip: 0.01,   digits: 3, quote: 'JPY' },

  /* --- FX crosses ------------------------------------------------------ */
  { sym: 'EUR/GBP', name: 'Euro / Pound',            group: 'FX crosses', contract: 100000, pip: 0.0001, digits: 5, quote: 'GBP' },
  { sym: 'EUR/JPY', name: 'Euro / Yen',              group: 'FX crosses', contract: 100000, pip: 0.01,   digits: 3, quote: 'JPY' },
  { sym: 'GBP/JPY', name: 'Pound / Yen',             group: 'FX crosses', contract: 100000, pip: 0.01,   digits: 3, quote: 'JPY' },
  { sym: 'EUR/AUD', name: 'Euro / Aussie',           group: 'FX crosses', contract: 100000, pip: 0.0001, digits: 5, quote: 'AUD' },

  /* --- metals ----------------------------------------------------------
     Gold is quoted in dollars, and one lot is 100 ounces, so a $1 move is
     $100. Counting 0.10 as a pip makes a pip worth $10 a lot — the same
     number as EUR/USD, which is why most desks count it that way. */
  { sym: 'XAU/USD', name: 'Gold / US Dollar',        group: 'Metals', contract: 100,  pip: 0.1,  digits: 2, quote: 'USD' },
  { sym: 'XAG/USD', name: 'Silver / US Dollar',      group: 'Metals', contract: 5000, pip: 0.01, digits: 3, quote: 'USD' },

  /* --- indices (CFD, one contract per index point) --------------------- */
  { sym: 'US30',    name: 'Dow Jones 30',            group: 'Indices', contract: 1, pip: 1, digits: 2, quote: 'USD' },
  { sym: 'NAS100',  name: 'Nasdaq 100',              group: 'Indices', contract: 1, pip: 1, digits: 2, quote: 'USD' },
  { sym: 'SPX500',  name: 'S&P 500',                 group: 'Indices', contract: 1, pip: 1, digits: 2, quote: 'USD' },
  { sym: 'GER40',   name: 'DAX 40',                  group: 'Indices', contract: 1, pip: 1, digits: 2, quote: 'EUR' },

  /* --- energy & crypto -------------------------------------------------- */
  { sym: 'USOIL',   name: 'WTI Crude Oil',           group: 'Energy', contract: 1000, pip: 0.01, digits: 2, quote: 'USD' },
  { sym: 'BTC/USD', name: 'Bitcoin / US Dollar',     group: 'Crypto', contract: 1, pip: 1,   digits: 2, quote: 'USD' },
  { sym: 'ETH/USD', name: 'Ethereum / US Dollar',    group: 'Crypto', contract: 1, pip: 0.1, digits: 2, quote: 'USD' }
];

/* A symbol the catalogue has never seen — a broker's own name, an exotic, a
   stock from a CSV import — still has to produce numbers. It gets contract 1
   and pip 0.01, which makes profit come out as a plain price difference, and
   the page marks it so the trader knows to set the real contract size. */
const UNKNOWN_SPEC = { contract: 1, pip: 0.01, digits: 2, quote: 'USD', unknown: true };

const Instruments = {
  all: INSTRUMENTS,

  spec(sym) {
    if (!sym) return { sym: '', name: '', group: '', ...UNKNOWN_SPEC };
    const hit = INSTRUMENTS.find(i => i.sym.toUpperCase() === String(sym).toUpperCase());
    return hit || { sym, name: sym, group: 'Other', ...UNKNOWN_SPEC };
  },

  /* Groups, in catalogue order, for the <optgroup>s of a symbol picker. */
  groups() {
    const out = [];
    INSTRUMENTS.forEach(i => {
      let g = out.find(x => x.name === i.group);
      if (!g) out.push(g = { name: i.group, items: [] });
      g.items.push(i);
    });
    return out;
  }
};
