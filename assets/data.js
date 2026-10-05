/* The one place the site gets and saves data.
   Right now: reads data/seed.js and keeps your edits in this browser (localStorage).
   Later: swap these functions for Supabase calls. Nothing else in the site changes. */
const GFB = (() => {
  const KEY = "gfb-local-edits-v1";
  let db = null;

  /* edits are parsed once and kept in memory; they're re-read only if something else (cloud sync) replaced them */
  let editsCache = null, editsRaw = null;
  const readEdits = () => { try { const raw = localStorage.getItem(KEY) || "{}"; if (editsCache && raw === editsRaw) return editsCache; editsRaw = raw; editsCache = JSON.parse(raw); return editsCache; } catch { return {}; } };
  const readEditsCopy = () => { readEdits(); try { return JSON.parse(editsRaw || "{}"); } catch { return {}; } };   /* startup works on its own copy */
  const writeEdits = e => { try { const raw = JSON.stringify(e); localStorage.setItem(KEY, raw); editsCache = e; editsRaw = raw; if (typeof Cloud !== "undefined") Cloud.queuePush(); return true; } catch { return false; } };

  /* Simsta handles are always "@" plus lowercase, no spaces */
  const normHandle = h => { h = String(h || "").trim().replace(/\s+/g, "").replace(/^@+/, "").toLowerCase(); return h ? "@" + h : null; };

  function load() {
    const seed = JSON.parse(JSON.stringify(window.GFB_SEED));
    let edits = readEditsCopy();
    /* a new seed "epoch" starts everyone from the clean seed (old edits and photos are dropped); the wallpaper is kept */
    if (seed.epoch && edits.epoch !== seed.epoch) {
      edits = { epoch: seed.epoch, ...(edits.settings ? { settings: edits.settings } : {}) };
      writeEdits(edits);
    }
    if (Array.isArray(edits.all_sims)) seed.sims = edits.all_sims;
    if (Array.isArray(edits.added_sims)) seed.sims.push(...edits.added_sims);
    for (const [id, patch] of Object.entries(edits.sims || {})) {
      const s = seed.sims.find(x => x.id === id);
      if (s) Object.assign(s, patch);
    }
    for (const t of ["relationships","stories","lots","accounts","transactions","loans","todos","projects","posts","organizations","households","lots_pending","huddl_posts","notes"]) if (Array.isArray(edits[t])) seed[t] = edits[t];
    if (edits.options) Object.assign(seed.options, edits.options);
    if (edits.lot_options) seed.lot_options = { ...seed.lot_options, ...edits.lot_options };
    seed.settings = { ...(seed.settings || {}), ...(edits.settings || {}) };
    if (edits.calendar) seed.calendar = { ...seed.calendar, ...edits.calendar };
    /* events and logs are a title plus one free-text details field */
    seed.calendar.events = seed.calendar.events.map(e => { if (e.details !== undefined) return e; const { story, game, ...rest } = e; return { ...rest, details: [story, game].filter(Boolean).join("\n\n") }; });
    seed.sims.forEach(x => { x.simsta = normHandle(x.simsta); });
    seed.organizations = seed.organizations || []; seed.households = seed.households || []; seed.huddl_posts = seed.huddl_posts || []; seed.notes = seed.notes || [];
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

  /* Organizations: institutions (Huddl) and clubs (Cliq) share one table. */
  const saveOrg = o => saveRow("organizations", o, "org-");
  const deleteOrg = id => deleteRow("organizations", id);
  /* Huddl feed posts: { id, author_type "org"|"sim", author_id, text, date {season,day,year}, auto } */
  const saveHuddlPost = p => saveRow("huddl_posts", p, "hp-");
  const deleteHuddlPost = id => deleteRow("huddl_posts", id);
  /* Notes: { id, title, body, folder, pinned, tags[], story {status, sims[], next} | null, created, updated, trashed } */
  const saveNote = n => saveRow("notes", { ...n, updated: Date.now() }, "n-");
  const deleteNote = id => deleteRow("notes", id);

  /* Notion import: replaces the Sims, connections, lots, households, and organizations tables in one save.
     The edits from just before are kept in a separate key so the import can be undone. */
  const UNDO = "gfb-import-undo";
  async function importReplace(p) {
    if (!db) load();
    const before = readEdits();
    const e = JSON.parse(JSON.stringify(before));
    e.all_sims = p.sims; delete e.sims; delete e.added_sims;
    e.relationships = p.relationships; e.lots = p.lots; e.households = p.households; e.organizations = p.organizations; e.lots_pending = [];
    e.options = { ...(e.options || {}), ...(p.options || {}) };
    if (p.lot_options) e.lot_options = p.lot_options;
    try { localStorage.setItem(UNDO, JSON.stringify(before)); } catch {}
    if (!writeEdits(e)) throw new Error("That import is too big for this browser's storage. Nothing was changed.");
    db = null; load();
    return db;
  }
  async function undoImport() {
    const raw = localStorage.getItem(UNDO);
    if (!raw) throw new Error("There's no import to undo.");
    writeEdits(JSON.parse(raw)); localStorage.removeItem(UNDO);
    db = null; load();
  }
  const canUndoImport = () => !!localStorage.getItem(UNDO);
  const exportEdits = () => readEdits();

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
  /* Photos: resized in halving steps with high-quality smoothing (one big jump looks soft and jagged),
     then saved as WebP where the browser supports it (sharper at the same size), otherwise as a high-quality JPEG. */
  /* Photos: resized in halving steps with high-quality smoothing, saved as WebP where supported (else high-quality JPEG).
     With the cloud connected they upload to Supabase Storage and only a short link is kept in your data;
     otherwise the photo is kept inside your data like before. */
  const BUCKET = "simdesk-images";
  const cloudClient = () => (typeof Cloud !== "undefined" && Cloud.client && Cloud.client() && Cloud.userId && Cloud.userId()) ? Cloud.client() : null;
  const cloudPhotos = () => !!cloudClient();
  async function putCloud(blob, ext) {
    const sb = cloudClient(); if (!sb) return null;
    const path = `${Cloud.userId()}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType:blob.type, cacheControl:"31536000", upsert:false });
    if (error) { console.warn("Photo upload to the cloud failed, keeping it on this device.", error); return null; }
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function uploadImage(file, max = 1400) {
    if (!file || !file.type.startsWith("image/")) throw new Error("That file isn't an image.");
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const W = Math.round(bmp.width * scale), H = Math.round(bmp.height * scale);
    let src = bmp, w = bmp.width, h = bmp.height;
    while (w / 2 >= W && h / 2 >= H) {
      const step = document.createElement("canvas"); w = Math.round(w / 2); h = Math.round(h / 2);
      step.width = w; step.height = h; const sx = step.getContext("2d"); sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = "high"; sx.drawImage(src, 0, 0, w, h); src = step;
    }
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const cx = c.getContext("2d"); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high"; cx.drawImage(src, 0, 0, W, H);
    let url = c.toDataURL("image/webp", 0.88);
    if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/jpeg", 0.9);
    if (cloudPhotos()) { const blob = await (await fetch(url)).blob(); const link = await putCloud(blob, blob.type === "image/webp" ? "webp" : "jpg"); if (link) url = link; }
    return { url, width: W, height: H };
  }
  /* One-time move: every photo still stored inside your data goes to Supabase Storage and is replaced by its link. */
  function photoStats() {
    const raw = localStorage.getItem(KEY) || "", m = raw.match(/"data:image\/[^"]+"/g) || [];
    return { count: new Set(m).size, photoKB: Math.round(m.reduce((a, x) => a + x.length, 0) / 1024), totalKB: Math.round(raw.length / 1024) };
  }
  async function movePhotosToCloud(progress) {
    if (!cloudPhotos()) throw new Error("The cloud photo connection isn't on yet.");
    const edits = readEdits(), done = new Map(), found = [];
    const walk = (o, fn) => { if (Array.isArray(o)) o.forEach((v, i) => fn(o, i, v)); else if (o && typeof o === "object") Object.keys(o).forEach(k => fn(o, k, o[k])); };
    const collect = o => walk(o, (p, k, v) => { if (typeof v === "string" && v.startsWith("data:image/")) found.push(v); else if (v && typeof v === "object") collect(v); });
    collect(edits);
    const unique = [...new Set(found)]; let n = 0, failed = 0;
    for (const d of unique) {
      const blob = await (await fetch(d)).blob(), ext = blob.type.includes("webp") ? "webp" : blob.type.includes("png") ? "png" : "jpg";
      const link = await putCloud(blob, ext); if (link) done.set(d, link); else failed++;
      n++; if (progress) progress(n, unique.length);
    }
    const swap = o => walk(o, (p, k, v) => { if (typeof v === "string" && done.has(v)) p[k] = done.get(v); else if (v && typeof v === "object") swap(v); });
    swap(edits);
    if (!writeEdits(edits)) throw new Error("Couldn't save after moving the photos.");
    if (done.size) { try { localStorage.removeItem("gfb-import-undo"); } catch {} }
    db = null; load();
    return { moved: done.size, failed };
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

  return { saveNote, deleteNote, cloudPhotos, photoStats, movePhotosToCloud, normHandle, saveOrg, deleteOrg, saveHuddlPost, deleteHuddlPost, importReplace, undoImport, canUndoImport, exportEdits, getAll, saveSim, addSim, saveOptions, saveSetting, saveRel, deleteRel, saveStory, deleteStory, saveLot, deleteLot, saveAccount, saveLoan, savePost, deletePost, saveTodo, deleteTodo, saveProject, deleteProject, deleteLoan, postTransaction, saveEvent, deleteEvent, saveLog, deleteLog, setToday, uploadImage, resetLocal, hasLocalEdits };
})();
