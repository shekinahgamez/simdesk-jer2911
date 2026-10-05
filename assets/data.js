/* The one place the site gets and saves data.
   Right now: reads data/seed.js and keeps your edits in this browser (localStorage).
   Later: swap these functions for Supabase calls. Nothing else in the site changes. */
const GFB = (() => {
  const KEY = "gfb-local-edits-v1";
  let db = null;

  const readEdits = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
  const writeEdits = e => { try { localStorage.setItem(KEY, JSON.stringify(e)); if (typeof Cloud !== "undefined") Cloud.queuePush(); return true; } catch { return false; } };

  /* Simsta handles are always "@" plus lowercase, no spaces */
  const normHandle = h => { h = String(h || "").trim().replace(/\s+/g, "").replace(/^@+/, "").toLowerCase(); return h ? "@" + h : null; };

  function load() {
    const seed = JSON.parse(JSON.stringify(window.GFB_SEED));
    const edits = readEdits();
    if (Array.isArray(edits.added_sims)) seed.sims.push(...edits.added_sims);
    for (const [id, patch] of Object.entries(edits.sims || {})) {
      const s = seed.sims.find(x => x.id === id);
      if (s) Object.assign(s, patch);
    }
    for (const t of ["relationships","stories","lots","accounts","transactions","loans","todos","projects","posts"]) if (Array.isArray(edits[t])) seed[t] = edits[t];
    if (edits.options) Object.assign(seed.options, edits.options);
    seed.settings = { ...(seed.settings || {}), ...(edits.settings || {}) };
    if (edits.calendar) seed.calendar = { ...seed.calendar, ...edits.calendar };
    /* events and logs are a title plus one free-text details field */
    seed.calendar.events = seed.calendar.events.map(e => { if (e.details !== undefined) return e; const { story, game, ...rest } = e; return { ...rest, details: [story, game].filter(Boolean).join("\n\n") }; });
    seed.sims.forEach(x => { x.simsta = normHandle(x.simsta); });
    /* two banks share accounts and loans; anything older belongs to Harbor Trust */
    seed.accounts.forEach(a => { a.bank = a.bank || "harbor"; });
    seed.loans.forEach(l => { l.bank = l.bank || "harbor"; });
    db = seed;
    return db;
  }

  async function getAll() { if (typeof Cloud !== "undefined") await Cloud.ready; return db || load(); }

  /* Sims */
  async function saveSim(id, patch) {
    if (!db) load();
    const s = db.sims.find(x => x.id === id);
    if (!s) throw new Error("No record found for " + id);
    if ("simsta" in patch) patch = { ...patch, simsta: normHandle(patch.simsta) };
    Object.assign(s, patch);
    const edits = readEdits();
    edits.sims = edits.sims || {};
    edits.sims[id] = { ...(edits.sims[id] || {}), ...patch };
    writeEdits(edits);
    return s;
  }

  /* New resident records. Later: an insert into the sims table. */
  async function addSim(sim) {
    if (!db) load();
    db.sims.push(sim);
    const edits = readEdits();
    edits.added_sims = [...(edits.added_sims || []), sim];
    if (!writeEdits(edits)) throw new Error("This browser's storage is full.");
    return sim;
  }

  /* Desktop settings (wallpaper). Later: a settings row in Supabase. */
  async function saveSetting(key, value) {
    if (!db) load();
    db.settings[key] = value;
    const edits = readEdits();
    edits.settings = { ...(edits.settings || {}), [key]: value };
    if (!writeEdits(edits)) { delete db.settings[key]; throw new Error("That image is too big for this browser's storage. Try a smaller one."); }
    return value;
  }

  /* Option lists (traits, likes, turn ons...). Grow as mods get added. Later: an options table. */
  async function saveOptions(key, list) {
    if (!db) load();
    db.options[key] = list;
    const edits = readEdits();
    edits.options = { ...(edits.options || {}), [key]: list };
    if (!writeEdits(edits)) throw new Error("This browser's storage is full.");
    return list;
  }

  /* Row tables: stories (Black Tea), lots (Lotline). Each maps to a Supabase table later. */
  function persist(table) {
    const e = readEdits(); e[table] = db[table];
    if (!writeEdits(e)) throw new Error("This browser's storage is full. Remove a photo or two, or wait until Supabase is connected.");
  }
  async function saveRow(table, row, prefix="r") {
    if (!db) load();
    if (!row.id) row.id = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); /* random tail: two rows saved in the same millisecond get different ids */
    const i = db[table].findIndex(x => x.id === row.id);
    if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else db[table].unshift(row);
    persist(table);
    return row;
  }
  async function deleteRow(table, id) {
    if (!db) load();
    db[table] = db[table].filter(x => x.id !== id);
    persist(table);
  }
  /* Registry connections. One row per direction (from_sim to to_sim). */
  const saveRel = r => saveRow("relationships", r, "rel-");
  const deleteRel = id => deleteRow("relationships", id);
  const saveStory = s => saveRow("stories", s, "s");
  const deleteStory = id => deleteRow("stories", id);
  const saveLot = l => saveRow("lots", l, "lot-");
  /* Simsta */
  const savePost = p => saveRow("posts", p, "post-");
  const deletePost = id => deleteRow("posts", id);
  /* Plumb */
  const saveTodo = t => saveRow("todos", t, "t-");
  const deleteTodo = id => deleteRow("todos", id);
  const saveProject = p => saveRow("projects", p, "p-");
  const deleteProject = id => deleteRow("projects", id);
  /* Harbor Trust. A transaction moves money and updates balances in one step (one database call later). */
  const saveAccount = a => saveRow("accounts", a, "a-");
  const saveLoan = l => saveRow("loans", l, "ln-");
  const deleteLoan = id => deleteRow("loans", id);
  /* Credit cards are accounts with card:true. Their balance is what's owed: spending adds to it, payments lower it.
     Harbor Trust (SNB) caps every account at $9,999,999. */
  const HARBOR_CAP = 9999999;
  async function postTransaction(t) {
    if (!db) load();
    const amt = Number(t.amount);
    if (!(amt > 0)) throw new Error("Enter an amount above zero.");
    const from = t.from_account && db.accounts.find(a => a.id === t.from_account);
    const to = t.to_account && db.accounts.find(a => a.id === t.to_account);
    if (from && from.card) {
      if (from.status !== "Active") throw new Error("Declined. That card is " + from.status.toLowerCase() + ".");
      if (Number(from.balance) + amt > Number(from.limit || 0)) throw new Error("Declined. That would go over the credit limit.");
    } else if (from && from.status !== "Active") throw new Error("That account is " + from.status.toLowerCase() + ".");
    if (to && to.card) { if (to.status === "Closed") throw new Error("That card is closed."); }
    else if (to && to.status !== "Active") throw new Error("The receiving account is " + to.status.toLowerCase() + ".");
    if (to && !to.card && (to.bank || "harbor") === "harbor" && Number(to.balance) + amt > HARBOR_CAP) throw new Error("Harbor Trust accounts top out at $9,999,999. Open another account for the rest.");
    if (from) {
      if (from.card) { from.balance = Number(from.balance) + amt; if (from.balance >= Number(from.limit || 0)) from.status = "Maxed out"; }
      else from.balance = Number(from.balance) - amt;
    }
    if (to) {
      if (to.card) { to.balance = Number(to.balance) - amt; if (to.status === "Maxed out" && to.balance < Number(to.limit || 0)) to.status = "Active"; }
      else to.balance = Number(to.balance) + amt;
    }
    const row = { id:"t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: t.date || new Date().toISOString().slice(0,10), from_account: t.from_account || null, to_account: t.to_account || null, counterparty: t.counterparty || null, amount: amt, memo: t.memo || "", kind: t.kind || "transfer", loan_id: t.loan_id || null };
    db.transactions.unshift(row);
    if (row.loan_id) { const ln = db.loans.find(l => l.id === row.loan_id); if (ln) { ln.balance = Math.max(0, Number(ln.balance) - amt); if (ln.balance === 0) ln.status = "Paid off"; } }
    persist("accounts"); persist("transactions"); persist("loans");
    return row;
  }
  const deleteLot = id => deleteRow("lots", id);

  /* Photos. Today: shrinks the image and keeps it as a data link in the browser.
     Later: uploads to Supabase Storage and returns the public link instead. Same return shape. */
  async function uploadImage(file, max = 1400) {
    if (!file || !file.type.startsWith("image/")) throw new Error("That file isn't an image.");
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return { url: c.toDataURL("image/jpeg", 0.8), width: c.width, height: c.height };
  }

  /* Calendar: events are rows; today is a single setting. */
  function persistCal() { const e = readEdits(); e.calendar = { events: db.calendar.events, logs: db.calendar.logs, today: db.calendar.today, year: db.calendar.year }; if (!writeEdits(e)) throw new Error("This browser's storage is full."); }
  async function saveEvent(ev) {
    if (!db) load();
    if (!ev.id) ev.id = "e" + Date.now().toString(36);
    const list = db.calendar.events, i = list.findIndex(x => x.id === ev.id);
    if (i >= 0) list[i] = { ...list[i], ...ev }; else list.push(ev);
    persistCal(); return ev;
  }
  async function deleteEvent(id) { if (!db) load(); db.calendar.events = db.calendar.events.filter(x => x.id !== id); persistCal(); }
  /* Day logs: what actually happened on a given day of a given year. */
  async function saveLog(lg) {
    if (!db) load();
    db.calendar.logs = db.calendar.logs || [];
    if (!lg.id) { lg.id = "l" + Date.now().toString(36); lg.created = new Date().toISOString(); }
    const i = db.calendar.logs.findIndex(x => x.id === lg.id);
    if (i >= 0) db.calendar.logs[i] = { ...db.calendar.logs[i], ...lg }; else db.calendar.logs.push(lg);
    persistCal(); return lg;
  }
  async function deleteLog(id) { if (!db) load(); db.calendar.logs = (db.calendar.logs || []).filter(x => x.id !== id); persistCal(); }
  async function setToday(today, year) { if (!db) load(); db.calendar.today = today; if (year) db.calendar.year = year; persistCal(); }

  function resetLocal() { try { localStorage.removeItem(KEY); } catch {} if (typeof Cloud !== "undefined") Cloud.queuePush(); db = null; load(); }
  function hasLocalEdits() { const e = readEdits(); return Object.keys(e.sims || {}).length > 0 || ["stories","lots","accounts","transactions","loans","todos","projects","posts"].some(t => Array.isArray(e[t])) || !!e.calendar; }

  return { normHandle, getAll, saveSim, addSim, saveOptions, saveSetting, saveRel, deleteRel, saveStory, deleteStory, saveLot, deleteLot, saveAccount, saveLoan, savePost, deletePost, saveTodo, deleteTodo, saveProject, deleteProject, deleteLoan, postTransaction, saveEvent, deleteEvent, saveLog, deleteLog, setToday, uploadImage, resetLocal, hasLocalEdits };
})();
