/* ==========================================================================
   Edge — storage. The journal keeps everything on the trader's own machine:
   no account, no server, no subscription, and nothing leaves the browser.

   Two stores, because one will not do. Trades are small and are read on every
   page, so they live in localStorage as one JSON document. Screenshots are
   300-800 KB each and localStorage holds about 5 MB in total — three trades
   would fill it — so images go to IndexedDB, which stores the file itself and
   is limited by disk, not by a 5 MB ceiling.
   ========================================================================== */

const Store = (() => {

  const KEY_TRADES   = 'edge.trades';
  const KEY_SETTINGS = 'edge.settings';
  const DB_NAME = 'edge-journal';
  const DB_SHOTS = 'shots';

  const DEFAULTS = {
    accountCurrency: 'USD',
    startBalance: 10000,
    riskPctDefault: 1,
    dateFormat: 'YYYY-MM-DD',
    lists: null,                 // null = use the defaults from model.js
    /* Every trade carries an account id. One account is the normal case, so
       the journal ships with exactly one and never asks the question until
       the trader adds a second. */
    accounts: [{
      id: 'main', name: 'Main account', broker: '', currency: 'USD',
      startBalance: 10000, type: 'live',
      rules: { dailyLossPct: 5, maxLossPct: 10, profitTargetPct: 10 }
    }]
  };

  /* ---------- localStorage, defensively ---------------------------------
     Private windows, blocked site data and thumbnail capture all make these
     throw or come back empty, so every read has a fallback and every write
     reports whether it landed. */

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  };

  const writeJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }     // quota or private mode — caller warns
  };

  let trades = readJSON(KEY_TRADES, []);
  let settings = Object.assign({}, DEFAULTS, readJSON(KEY_SETTINGS, {}));

  const listeners = [];
  const changed = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });

  /* ---------- IndexedDB for the screenshots ----------------------------- */

  let dbPromise = null;
  const db = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(DB_SHOTS)) d.createObjectStore(DB_SHOTS, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  };

  const tx = (mode, fn) => db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(DB_SHOTS, mode);
    const req = fn(t.objectStore(DB_SHOTS));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));

  const uid = p => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  /* Object URLs are revoked when the page unloads; holding them in a map keeps
     one URL per image however many times a page asks for it. */
  const urls = new Map();
  addEventListener('pagehide', () => { urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); });

  /* Chrome refuses IndexedDB to a page opened straight from the file system,
     and some browsers refuse it in a private window. Asked once, so a page can
     say so plainly instead of silently losing a screenshot. */
  let dbOk = null;
  async function available() {
    if (dbOk !== null) return dbOk;
    try { await db(); dbOk = true; } catch (e) { dbOk = false; }
    return dbOk;
  }

  const Shots = {

    available,

    /* `file` is a File from an <input>, a Blob from a paste, or a drop. */
    async put(file, meta) {
      const id = uid('shot');
      const rec = Object.assign({
        id, blob: file, type: file.type || 'image/png',
        size: file.size || 0, name: file.name || 'screenshot.png',
        addedAt: new Date().toISOString()
      }, meta || {});
      await tx('readwrite', s => s.put(rec));
      return id;
    },

    async get(id) {
      try { return await tx('readonly', s => s.get(id)); }
      catch (e) { return null; }
    },

    /* A URL the <img> can use. Null when the image is gone — a journal copied
       to another machine keeps its trades and loses its pictures, and the card
       has to say so rather than show a broken frame. */
    async url(id) {
      if (urls.has(id)) return urls.get(id);
      const rec = await Shots.get(id);
      if (!rec || !rec.blob) return null;
      const u = URL.createObjectURL(rec.blob);
      urls.set(id, u);
      return u;
    },

    async del(id) {
      if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
      try { await tx('readwrite', s => s.delete(id)); } catch (e) {}
    },

    async all() {
      try { return (await tx('readonly', s => s.getAll())) || []; }
      catch (e) { return []; }
    }
  };

  /* ---------- trades ------------------------------------------------------ */

  const persist = () => writeJSON(KEY_TRADES, trades);

  const api = {

    settings: () => settings,

    saveSettings(patch) {
      settings = Object.assign({}, settings, patch);
      const ok = writeJSON(KEY_SETTINGS, settings);
      changed();
      return ok;
    },

    /* Accounts. A trade whose account was deleted still has to be readable,
       so lookups fall back to a stand-in rather than returning nothing. */
    accounts: () => (settings.accounts && settings.accounts.length
      ? settings.accounts : DEFAULTS.accounts).slice(),

    account(id) {
      const list = api.accounts();
      return list.find(a => a.id === id) ||
        { id: id || 'main', name: id || 'Main account', broker: '',
          currency: settings.accountCurrency, startBalance: 0, type: 'live',
          rules: DEFAULTS.accounts[0].rules, missing: !!id };
    },

    saveAccounts(list) {
      return api.saveSettings({ accounts: list });
    },

    all: () => trades.slice(),
    count: () => trades.length,
    get: id => trades.find(t => t.id === id) || null,

    /* Save returns the stored trade so the caller gets the generated id. */
    save(trade) {
      const now = new Date().toISOString();
      const t = Object.assign(Trade.blank(), trade);
      if (!t.id) { t.id = uid('t'); t.createdAt = now; }
      t.updatedAt = now;
      const i = trades.findIndex(x => x.id === t.id);
      if (i >= 0) trades[i] = t; else trades.push(t);
      persist();
      changed();
      return t;
    },

    async remove(id) {
      const t = api.get(id);
      /* a shot is { id, label }; the id alone is accepted too, so a journal
         imported from an older backup still cleans up after itself */
      if (t) for (const s of t.shots || []) await Shots.del(s && s.id ? s.id : s);
      trades = trades.filter(x => x.id !== id);
      persist();
      changed();
    },

    /* Bulk insert from the CSV import, one write instead of one per row. */
    addMany(list) {
      const now = new Date().toISOString();
      list.forEach(raw => {
        const t = Object.assign(Trade.blank(), raw);
        if (!t.id) { t.id = uid('t'); t.createdAt = now; }
        t.updatedAt = now;
        trades.push(t);
      });
      persist();
      changed();
      return list.length;
    },

    onChange(fn) { listeners.push(fn); },

    /* ---------- backup ----------------------------------------------------
       One file holds the whole journal, pictures included, so it can be moved
       to another machine or put somewhere safe. Images are base64 inside the
       JSON, which is about a third larger than the files themselves — the
       honest cost of a single-file backup. */

    async exportAll() {
      const shots = await Shots.all();
      const toB64 = blob => new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = () => res('');
        r.readAsDataURL(blob);
      });
      const images = [];
      for (const s of shots) {
        images.push({ id: s.id, type: s.type, name: s.name, data: await toB64(s.blob) });
      }
      return {
        app: 'edge-journal', version: 1,
        exportedAt: new Date().toISOString(),
        settings, trades, images
      };
    },

    async importAll(payload, { replace = true } = {}) {
      if (!payload || payload.app !== 'edge-journal') throw new Error('Not an Edge backup file');
      if (replace) {
        for (const s of await Shots.all()) await Shots.del(s.id);
        trades = [];
      }
      for (const im of payload.images || []) {
        const bin = atob(im.data || '');
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        const rec = { id: im.id, blob: new Blob([buf], { type: im.type || 'image/png' }),
                      type: im.type, name: im.name, size: buf.length,
                      addedAt: new Date().toISOString() };
        await tx('readwrite', s => s.put(rec));
      }
      trades = trades.concat(payload.trades || []);
      settings = Object.assign({}, DEFAULTS, payload.settings || {});
      persist();
      writeJSON(KEY_SETTINGS, settings);
      changed();
      return { trades: (payload.trades || []).length, images: (payload.images || []).length };
    },

    /* What the journal is taking up, for Settings. Text and images are counted
       apart because only the text side can hit a wall. */
    async usage() {
      let text = 0;
      try { text = (localStorage.getItem(KEY_TRADES) || '').length; } catch (e) {}
      const shots = await Shots.all();
      return {
        textBytes: text,
        imageBytes: shots.reduce((s, x) => s + (x.size || 0), 0),
        images: shots.length,
        trades: trades.length
      };
    },

    shots: Shots
  };

  return api;
})();
