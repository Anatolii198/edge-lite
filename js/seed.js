/* ==========================================================================
   Edge — first run
   An empty journal shows nothing, so the template seeds six months of demo
   trades the first time it is opened. It runs once: after that the trader's
   own trades are in storage and this file does nothing.

   To ship an empty journal, delete js/demo.js and the <script> tags that load
   it and this file. Settings also has a button to clear the demo.
   ========================================================================== */

const Seed = (() => {

  async function run() {
    /* `seeded` is what stops the demo coming back. An empty journal is not
       enough to go on: a trader who deletes the demo, or wipes everything
       from Settings, would find it all back on the next page load. */
    if (!window.DemoData || Store.count() > 0 || Store.settings().seeded) return;

    /* every demo trade points at a file in demo/; each file is fetched once
       and put in IndexedDB, exactly as a pasted screenshot would be */
    const ids = new Map();
    const files = new Set();
    DemoData.trades.forEach(t => (t.shots || []).forEach(s => files.add(s.file)));

    for (const path of files) {
      try {
        const res = await fetch(path);
        if (!res.ok) continue;
        const blob = await res.blob();
        ids.set(path, await Store.shots.put(blob, { name: path.split('/').pop() }));
      } catch (e) { /* opened from the file system with fetch blocked — skip */ }
    }

    const trades = DemoData.trades.map(t => Object.assign({}, t, {
      shots: (t.shots || [])
        .filter(s => ids.has(s.file))
        .map(s => ({ id: ids.get(s.file), label: s.label }))
    }));

    Store.addMany(trades);
    Store.saveSettings(Object.assign({}, DemoData.settings, { demo: true, seeded: true }));
  }

  /* Pages wait on this before they read storage, so none of them has to care
     whether this is the first visit. */
  const ready = run().catch(() => {});

  return { ready, run };
})();
