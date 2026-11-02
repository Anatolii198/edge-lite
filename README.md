# Edge Lite — a trading journal that runs from a folder

A free sample of **Edge**, an HTML trading journal with no dependencies. Two of the
fourteen pages are here, with the real engine and the real arithmetic behind them.

**[Live demo](https://anatolii198.github.io/edge-lite/)** · **[Get the full template — $39](https://payhip.com/b/af3Tc)**

---

## What this is

A trading journal, not a dashboard with a trading skin. You log a trade — instrument,
direction, prices, size, stop, the pieces you took off on the way, the model you entered
on, how you felt, what went wrong — paste the chart you took it from, and every figure on
every other page follows from that. Nothing is typed twice.

No account. No server. No subscription. No `npm install`, no bundler, no CDN — nothing in
here phones home, and the whole thing runs with the Wi-Fi off.

The charts are not Chart.js. They are plain SVG, written from scratch, in one file you can
read.

## What is in this repository

| Page | |
|---|---|
| `index.html` | **Overview** — balance curve, drawdown, month by month, discipline, entry models |
| `trade.html` | **The trade card** — prices, size, stop, partial closes, screenshots, review |
| `login.html`, `404.html` | the two that usually get skipped |

The other twelve — journal table, calendar, instruments, entry models, timing, risk,
accounts, psychology, CSV import, reports, settings — come with the full template. The
sidebar links to them are marked with a lock.

Everything else is identical: same engine, same stylesheet, same 219 demo trades, same
light and dark themes, same responsive layout.

## Two things worth looking at

**Taking a position off in pieces.** Hardly anyone closes in one go, so the card does not
pretend they do. Add a leg — *Take 50%* fills in the lots for you — and the Exit field
closes whatever is left. Every figure is then weighted by size, which is the only
arithmetic that stays honest: half banked at +2R and half at +0.5R is **+1.25R**. Close
half and leave the rest running, and the trade reports what it has actually paid so far.

**The rules the journal will not break.** R is `(exit − entry) ÷ |entry − stop|`, and a
trade with no stop has no R — it is left out of every R statistic rather than counted as
zero, because otherwise your average R is a fiction. Under twenty trades, any figure gets
a *Thin* badge: a setup with a 67% win rate over nine trades has proved nothing.

## Running it

Open `index.html`. That is the whole setup.

One thing does not work that way: **screenshots**. A page opened straight from a folder
gets a `file://` address, and browsers refuse to store files for such a page. The card
says so rather than failing quietly. Serve the folder once —

```bash
python -m http.server 8000
```

— and charts attach normally, including <kbd>Ctrl</kbd>+<kbd>V</kbd> straight from
TradingView.

## Where the trades live

In your browser, on your computer. Trades and settings in `localStorage` (about 600 bytes
each); chart screenshots in `IndexedDB`, because one screenshot is 300–800 KB and
`localStorage` holds about 5 MB in total. Clearing site data deletes it, and nothing syncs
anywhere. The full template writes a single backup file with every trade, setting and
image inside it.

## Licence

This sample is free to look at, run and learn from. It is not the product: the full
template, its twelve other pages and its licence for client work are sold at the link
above.

---

Built by **NovaWeb Design** · [the full journal](https://payhip.com/b/af3Tc)
