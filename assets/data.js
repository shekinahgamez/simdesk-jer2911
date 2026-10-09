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
    if (edits.tossup && typeof edits.tossup === "object") seed.tossup = edits.tossup;
    if (edits.slide && typeof edits.slide === "object") seed.slide = edits.slide;
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
    normIds(seed, edits);
    db = seed;
    mirrorRels();
    return db;
  }
  /* after the Registry move, the apps that read data.relationships (Slide, Cliq, Huddl) get one row per direction made from the links */
  function mirrorRels() { try { if (db && registry.isMoved()) db.relationships = registry.asRels(); } catch {} }

  /* IDs, not names: households and lot owners point at IDs, and the names shown are read from them, so a rename carries everywhere.
     The name fields stay filled in (from the ID) so every app that reads them keeps working. Runs on every load; saves only when something changed. */
  const cleanName = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const slugOf = t => String(t || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "household";
  function hhIndex(seed) {
    seed.households = Array.isArray(seed.households) ? seed.households : [];
    const byId = new Map(seed.households.map(h => [h.id, h])), byName = new Map(seed.households.map(h => [String(h.name || "").trim().toLowerCase(), h]));
    let added = false;
    const idFor = name => {
      const k = String(name).trim().toLowerCase(); let h = byName.get(k);
      if (!h) { const base = "hh-" + slugOf(name); let id = base, n = 2; while (byId.has(id)) id = base + "-" + n++; h = { id, name:String(name).trim() }; seed.households.push(h); byId.set(id, h); byName.set(k, h); added = true; }
      return h.id;
    };
    return { byId, idFor, added:() => added };
  }
  function normIds(seed, edits) {
    const H = hhIndex(seed); let simsChanged = false, lotsChanged = false;
    edits.sims = edits.sims || {};
    for (const s of seed.sims) {
      const rec = s.household_id && H.byId.get(s.household_id);
      if (s.household && (!rec || rec.name !== s.household)) {          /* a name with no ID yet, or a name changed by an older copy of the app */
        const id = H.idFor(s.household); s.household_id = id; edits.sims[s.id] = { ...(edits.sims[s.id] || {}), household_id:id }; simsChanged = true;
      } else if (!s.household && s.household_id && rec) { s.household = rec.name; }
      else if (!s.household && s.household_id && !rec) { s.household_id = null; edits.sims[s.id] = { ...(edits.sims[s.id] || {}), household_id:null }; simsChanged = true; }
      if (s.household_id) s.household = H.byId.get(s.household_id).name;
    }
    const simByName = new Map(seed.sims.map(x => [cleanName(x.name).toLowerCase(), x]));
    for (const l of seed.lots || []) {
      const rec = l.household_id && H.byId.get(l.household_id);
      if (l.household && (!rec || rec.name !== l.household)) { l.household_id = H.idFor(l.household); lotsChanged = true; }
      else if (!l.household && l.household_id) { l.household_id = null; lotsChanged = true; }
      if (l.household_id) l.household = H.byId.get(l.household_id).name;
      const owner = l.owner_sim && seed.sims.find(x => x.id === l.owner_sim), named = l.owner ? simByName.get(cleanName(l.owner).toLowerCase()) : null;
      if (named && (!owner || named.id !== owner.id)) { l.owner_sim = named.id; lotsChanged = true; }               /* owner set by name (or changed by an older copy of the app) */
      else if (owner && !l.owner) { l.owner_sim = null; lotsChanged = true; }                                     /* owner cleared */
      else if (!owner && l.owner_sim) { l.owner_sim = null; lotsChanged = true; }
      if (l.owner_sim) { const nm = cleanName(seed.sims.find(x => x.id === l.owner_sim).name); if (l.owner !== nm) { l.owner = nm; lotsChanged = true; } }
    }
    if (H.added()) edits.households = seed.households;
    if (lotsChanged) edits.lots = seed.lots;
    if (simsChanged || lotsChanged || H.added()) writeEdits(edits);
  }
  /* saving a household or owner by name records the ID too */
  function idsForSim(patch) {
    if (!("household" in patch)) return patch;
    const H = hhIndex(db), name = patch.household ? String(patch.household).trim() : null;
    const out = { ...patch, household:name, household_id:name ? H.idFor(name) : null };
    if (H.added()) { const e = readEdits(); e.households = db.households; writeEdits(e); }
    return out;
  }
  function idsForLot(row) {
    const out = { ...row };
    if ("household" in row) { const H = hhIndex(db); out.household = row.household ? String(row.household).trim() : null; out.household_id = out.household ? H.idFor(out.household) : null; if (H.added()) { const e = readEdits(); e.households = db.households; writeEdits(e); } }
    if ("owner" in row) { const s = row.owner ? db.sims.find(x => cleanName(x.name).toLowerCase() === cleanName(row.owner).toLowerCase()) : null; out.owner_sim = s ? s.id : null; if (s) out.owner = cleanName(s.name); }
    return out;
  }

  /* the Registry and Photos tables load once after sign-in (and again if the first try happened before the cloud was on) */
  let side = null;
  async function getAll() {
    if (typeof Cloud !== "undefined") await Cloud.ready;
    if (!db) load();
    if (!side || (!registry.isLoaded() && registry.ready() && !registry.problem())) side = Promise.all([registry.refresh(), photos.refresh()]);
    await side;
    mirrorRels();
    return db;
  }

  /* Sims */
  async function saveSim(id, patch) {
    if (!db) load();
    const s = db.sims.find(x => x.id === id);
    if (!s) throw new Error("No record found for " + id);
    if ("simsta" in patch) patch = { ...patch, simsta: normHandle(patch.simsta) };
    patch = idsForSim(patch);
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
    sim = idsForSim(sim);
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
    if (p.relationships) e.relationships = p.relationships;   /* after the Registry move, connections live in their own tables and the old list stays as it was */
    e.lots = p.lots; e.households = p.households; e.organizations = p.organizations; e.lots_pending = [];
    e.options = { ...(e.options || {}), ...(p.options || {}) };
    if (p.lot_options) e.lot_options = p.lot_options;
    try { localStorage.setItem(UNDO, JSON.stringify(before)); } catch {}
    if (!writeEdits(e)) throw new Error("That import is too big for this browser's storage. Nothing was changed.");
    db = null; load();
    return db;
  }
  /* "Add these Sims": new Sims join the cast; nobody is removed. Sims chosen for "Update from file" get the file's fields.
     The edits from just before are kept so the whole batch can be undone. */
  async function importAdd(p) {
    if (!db) load();
    const before = readEditsCopy(), e = JSON.parse(JSON.stringify(before));
    e.added_sims = [...(e.added_sims || []), ...p.add.map(x => idsForSim(x))];
    e.sims = e.sims || {};
    for (const [id, patch] of Object.entries(p.update || {})) e.sims[id] = { ...(e.sims[id] || {}), ...idsForSim(patch) };
    e.options = { ...(e.options || {}), ...(p.options || {}) };
    e.households = db.households;
    if (p.relationshipsAdd && p.relationshipsAdd.length) e.relationships = [...(e.relationships || db.relationships || []), ...p.relationshipsAdd];   /* before the Registry move only */
    try { localStorage.setItem(UNDO, JSON.stringify(before)); } catch {}
    if (!writeEdits(e)) throw new Error("That import is too big for this browser's storage. Nothing was changed.");
    db = null; load();
    return db;
  }
  async function undoImport() {
    const raw = localStorage.getItem(UNDO);
    if (!raw) throw new Error("There's no import to undo.");
    if (registry.canUndoLinks()) await registry.undoImportLinks();
    writeEdits(JSON.parse(raw)); localStorage.removeItem(UNDO);
    db = null; load();
  }
  const canUndoImport = () => !!localStorage.getItem(UNDO);
  const exportEdits = () => readEdits();

  /* Toss Up: its decks, where each deck is, and the game night chat, kept as one object. */
  async function saveTossUp(t) {
    if (!db) load();
    db.tossup = t;
    const edits = readEdits();
    edits.tossup = t;
    if (!writeEdits(edits)) throw new Error("This browser's storage is full.");
    return t;
  }

  /* Slide: whose phone is open, each Sim's distance and burner setting, every swipe (by swiping Sim), and the match list, as one object.
     Swipes are stored as { swiperId: { otherId: "p" | "l" | "s" } } (pass, slide, shot) to stay small as the save grows. */
  async function saveSlide(t) {
    if (!db) load();
    db.slide = t;
    const edits = readEdits();
    edits.slide = t;
    if (!writeEdits(edits)) throw new Error("This browser's storage is full.");
    return t;
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
  const saveLot = l => saveRow("lots", idsForLot(l), "lot-");
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
  /* draws any image source (a file's bitmap, a canvas, or part of one) at W x H with the halving-step resize */
  function drawSharp(srcImg, sx, sy, sw, sh, W, H) {
    let src = srcImg, x = sx, y = sy, w = sw, h = sh;
    while (w / 2 >= W && h / 2 >= H) {
      const step = document.createElement("canvas"), nw = Math.round(w / 2), nh = Math.round(h / 2);
      step.width = nw; step.height = nh; const g = step.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(src, x, y, w, h, 0, 0, nw, nh); src = step; x = 0; y = 0; w = nw; h = nh;
    }
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(src, x, y, w, h, 0, 0, W, H);
    return c;
  }
  function canvasURL(c) { let url = c.toDataURL("image/webp", 0.88); if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/jpeg", 0.9); return url; }
  async function shrinkFile(file, max) {
    if (!file || !String(file.type || "").startsWith("image/")) throw new Error("That file isn't an image.");
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const W = Math.max(1, Math.round(bmp.width * scale)), H = Math.max(1, Math.round(bmp.height * scale));
    return { url: canvasURL(drawSharp(bmp, 0, 0, bmp.width, bmp.height, W, H)), width: W, height: H };
  }
  async function uploadImage(file, max = 1400) {
    if (file && file.__photoUrl) return { url:file.__photoUrl, width:null, height:null };   /* picked or framed in Photos: already saved */
    let { url, width:W, height:H } = await shrinkFile(file, max);
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

  /* Messages: every Sim conversation lives in its own Supabase tables (message_threads, messages), never in the edits bundle.
     Rows are private to the signed-in user (row level security). Claude adds most of them straight to Supabase;
     the app reads them, and Slide and Simsta start threads. Field guide: MESSAGES-SCHEMA.md in the SimDesk folder.
     Loads everything once, then only rows created since the last load. */
  const messages = (() => {
    let threads = [], byThread = new Map(), loaded = false, since = null, busy = null;
    const sb = () => cloudClient();
    const ready = () => !!sb();
    const sameSims = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    async function pageAll(build) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await build().range(from, from + 999);
        if (error) throw new Error(error.message || "Couldn't reach Messages.");
        out.push(...(data || [])); if (!data || data.length < 1000) return out;
      }
    }
    function addRows(rows) {
      for (const m of rows) {
        const list = byThread.get(m.thread_id) || [];
        const i = list.findIndex(x => x.id === m.id);
        if (i >= 0) list[i] = m; else list.push(m);
        list.sort((a, b) => a.seq - b.seq);
        byThread.set(m.thread_id, list);
        if (!since || m.created_at > since) since = m.created_at;
      }
    }
    const sortThreads = () => threads.sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
    async function refresh() {
      if (!ready()) throw new Error("Messages needs the cloud connection. Sign in to SimDesk's cloud, then open Messages again.");
      if (busy) return busy;
      busy = (async () => {
        const c = sb();
        const t = await pageAll(() => c.from("message_threads").select("*").order("last_message_at", { ascending:false }).order("id"));
        const rows = await pageAll(() => { let q = c.from("messages").select("*"); if (loaded && since) q = q.gte("created_at", since); return q.order("created_at", { ascending:true }).order("id"); });
        if (!loaded) byThread = new Map();
        threads = t; addRows(rows); loaded = true; sortThreads();
        return true;
      })();
      try { return await busy; } finally { busy = null; }
    }
    /* a thread with exactly these Sims (any order); origin optional */
    const find = (simIds, origin) => threads.find(t => sameSims(t.sim_ids, simIds) && (!origin || t.origin === origin)) || null;
    async function createThread({ sim_ids, origin, title = null }) {
      const { data, error } = await sb().from("message_threads").insert({ user_id:Cloud.userId(), sim_ids, origin, title }).select().single();
      if (error) throw new Error(error.message || "Couldn't start that thread.");
      threads.unshift(data); sortThreads(); return data;
    }
    /* list: [{ sender, kind:"text"|"system", body, game_date }]; the order number is filled in by the database */
    async function add(threadId, list) {
      const rows = list.map(m => ({ thread_id:threadId, user_id:Cloud.userId(), sender_sim_id:m.kind === "system" ? null : m.sender, kind:m.kind || "text", body:m.body, game_date:m.game_date || null }));
      const { data, error } = await sb().from("messages").insert(rows).select();
      if (error) throw new Error(error.message || "Couldn't add that message.");
      addRows(data || []);
      const t = threads.find(x => x.id === threadId), last = (data || []).map(m => m.created_at).sort().pop();
      if (t && last && last > t.last_message_at) { t.last_message_at = last; sortThreads(); }
      return data;
    }
    /* find the thread, or start it (with an optional opening system line) */
    async function ensure(simIds, origin, { anyOrigin = false, system = null, game_date = null } = {}) {
      if (!loaded) await refresh();
      const t = find(simIds, anyOrigin ? null : origin);
      if (t) return { thread:t, created:false };
      const made = await createThread({ sim_ids:simIds, origin });
      if (system) await add(made.id, [{ kind:"system", body:system, game_date }]);
      return { thread:made, created:true };
    }
    return { ready, refresh, ensure, add, find, isLoaded:() => loaded, threads:() => threads, list:id => byThread.get(id) || [] };
  })();

  /* Simsta comments and likes added outside the app (by Claude) or typed while the cloud is on live in their own Supabase tables,
     simsta_comments and simsta_likes, never in the edits bundle. Comments typed before Oct 8 stay in each post's bundle "comments".
     Simsta shows both together. Field guide: SIMSTA-SCHEMA.md in the SimDesk folder. */
  const simsta = (() => {
    let comments = new Map(), likes = new Map(), loaded = false, since = null, busy = null;
    const sb = () => cloudClient();
    const ready = () => !!sb();
    async function pageAll(build) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await build().range(from, from + 999);
        if (error) throw new Error(error.message || "Couldn't reach Simsta comments.");
        out.push(...(data || [])); if (!data || data.length < 1000) return out;
      }
    }
    function add(map, rows) {
      for (const r of rows) {
        const list = map.get(r.post_id) || [], i = list.findIndex(x => x.id === r.id);
        if (i >= 0) list[i] = r; else list.push(r);
        list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
        map.set(r.post_id, list);
        if (!since || r.created_at > since) since = r.created_at;
      }
    }
    async function refresh() {
      if (!ready()) return false;
      if (busy) return busy;
      busy = (async () => {
        const c = sb(), from = loaded ? since : null;
        const q = t => () => { let x = c.from(t).select("*"); if (from) x = x.gte("created_at", from); return x.order("created_at", { ascending:true }).order("id"); };
        const [cm, lk] = await Promise.all([pageAll(q("simsta_comments")), pageAll(q("simsta_likes"))]);
        if (!loaded) { comments = new Map(); likes = new Map(); }
        add(comments, cm); add(likes, lk); loaded = true;
        return true;
      })();
      try { return await busy; } finally { busy = null; }
    }
    async function addComment(post_id, author, body, game_date = null) {
      const { data, error } = await sb().from("simsta_comments").insert({ user_id:Cloud.userId(), post_id, author, body, game_date }).select().single();
      if (error) throw new Error(error.message || "Couldn't post that comment.");
      add(comments, [data]); return data;
    }
    const commentsOf = id => comments.get(id) || [];
    const likersOf = id => (likes.get(id) || []).map(l => l.account).filter(Boolean);
    const addedOf = id => (likes.get(id) || []).reduce((n, l) => n + (Number(l.added) || 0), 0);
    return { ready, refresh, addComment, commentsOf, likersOf, addedOf, isLoaded:() => loaded };
  })();

  /* ================= Registry connections =================
     One row per connection in its own Supabase tables (registry_links, registry_history), never in the edits bundle.
     a_sim and b_sim are the two Sims; a_label is how a_sim's file words it, b_label how b_sim's does. For a parent link
     (kind "fam", family "parent") a_sim is the parent. Secret is the only secret mechanism. Field guide: REGISTRY-PHOTOS-SCHEMA.md.
     Until the one-time move runs (registry_moves has her row), the Registry reads the old two-rows-per-link list
     converted on the fly, read only, so nothing changes until the counts check out. */
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const PARENT_RE = /^(parent|mother|father|mom|mum|dad|step ?(mother|father|parent|mom|dad))\b/i, CHILD_RE = /^(child|son|daughter|kid|step ?(son|daughter|child))\b/i, SIB_RE = /\b(sibling|brother|sister|twin)s?\b/i;
  const SLIDE_RE = /^matched on slide,\s*([A-Za-z]+),\s*day\s*(\d+),\s*year\s*(\d+)/i;
  /* the history entry an old label starts with */
  function firstEntry(kind, family, label) {
    const l = String(label || "").trim();
    if (kind === "rom") { if (/^(spouse|husband|wife|married)/i.test(l)) return "Married"; if (/^(engaged|fianc)/i.test(l)) return "Engaged"; if (/^(dating|boyfriend|girlfriend|partner)/i.test(l)) return "Dating"; }
    if (kind === "ex") return "Split";
    if (family === "parent") return "Parent and child";
    if (family === "sibling") return "Siblings";
    return l || ({ rom:"Romance", fam:"Family", ex:"Split", friend:"Friends", work:"Work" })[kind] || "Connected";
  }
  /* old rows (one per direction, tied by pair) to one link each. Pure: used by the move, the importer, and the read-only view. */
  function linksFromRels(rels) {
    rels = (rels || []).filter(Boolean);
    const byId = new Map(rels.map(r => [String(r.id), r])), used = new Set(), out = [];
    for (const r of rels) {
      if (used.has(String(r.id))) continue;
      used.add(String(r.id));
      let m = r.pair != null ? byId.get(String(r.pair)) : null;
      if (m && (used.has(String(m.id)) || m.from_sim !== r.to_sim || m.to_sim !== r.from_sim)) m = null;
      if (!m && r.to_sim) m = rels.find(x => !used.has(String(x.id)) && x.from_sim === r.to_sim && x.to_sim === r.from_sim && x.kind === r.kind) || null;
      if (m) used.add(String(m.id));
      const kind = ["fam","rom","ex","friend","work"].includes(r.kind) ? r.kind : "friend";
      let A = r, B = m, family = null;
      if (kind === "fam") {
        const la = String(r.label || ""), lb = String(m ? m.label : "");
        if (CHILD_RE.test(la) || PARENT_RE.test(lb)) family = "parent";
        else if (PARENT_RE.test(la) || CHILD_RE.test(lb)) { if (m) { family = "parent"; A = m; B = r; } else if (r.to_sim) { family = "parent"; A = { ...r, from_sim:r.to_sim, to_sim:r.from_sim, label:null, flipped:true }; B = { label:r.label }; } else family = "other"; }
        else if (SIB_RE.test(la) || SIB_RE.test(lb)) family = "sibling";
        else family = "other";
      }
      const slide = [A.label, B && B.label].map(x => String(x || "").match(SLIDE_RE)).find(Boolean);
      const cleanLabel = l => l == null ? null : (SLIDE_RE.test(l) ? "Matched on Slide" : String(l));
      const link = { id:uuid(), a_sim:A.flipped ? A.from_sim : A.from_sim, b_sim:A.to_sim || null, b_name:A.to_sim ? null : (A.to_name || null), kind, family,
        a_label:cleanLabel(A.label), b_label:cleanLabel(B ? B.label : null), biological:family === "parent" ? true : null, adoptive:family === "parent" ? false : null, raised:family === "parent" ? true : null,
        secret:!!(r.hidden || (m && m.hidden) || r.secret || (m && m.secret)), legacy_ids:[r.id, m && m.id].filter(x => x != null).map(String), batch:null, history:[] };
      if (slide) link.history.push({ id:uuid(), label:"Matched on Slide", game_date:{ season:slide[1][0].toUpperCase() + slide[1].slice(1).toLowerCase(), day:Number(slide[2]), year:Number(slide[3]) }, note:null, sort:0 });
      else link.history.push({ id:uuid(), label:firstEntry(kind, family, link.a_label || link.b_label), game_date:null, note:"from the old file", sort:0 });
      /* an old secret line is kept word for word as a history entry, so nothing is lost */
      [r, m].filter(Boolean).forEach(x => { if (x.secret) link.history.push({ id:uuid(), label:String(x.secret), game_date:null, note:"secret line from the old file", sort:link.history.length }); });
      out.push(link);
    }
    return out;
  }
  function linkCounts(links) {
    const c = { links:links.length, history:0, secret:0, parent:0, sibling:0, otherFamily:0, rom:0, ex:0, friend:0, work:0, slide:0, pending:0 };
    links.forEach(l => { c.history += (l.history || []).length; if (l.secret) c.secret++; if (!l.b_sim) c.pending++;
      if (l.kind === "fam") c[l.family === "parent" ? "parent" : l.family === "sibling" ? "sibling" : "otherFamily"]++; else c[l.kind]++;
      if ((l.history || []).some(h => h.label === "Matched on Slide")) c.slide++; });
    return c;
  }

  const registry = (() => {
    const LINK_COLS = ["id","a_sim","b_sim","b_name","kind","family","a_label","b_label","biological","adoptive","raised","secret","unconfirmed","legacy_ids","batch"];
    const HIST_COLS = ["id","link_id","label","game_date","note","sort"];
    let links = [], homeEv = [], simx = new Map(), moved = null, loaded = false, busy = null, problem = null, view = { src:null, out:[] };
    const sb = () => cloudClient();
    const ready = () => !!sb();
    const pick = (o, cols) => Object.fromEntries(cols.filter(k => k in o).map(k => [k, o[k]]));
    async function pageAll(build) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await build().range(from, from + 999);
        if (error) throw new Error(error.message || "Couldn't reach the Registry tables.");
        out.push(...(data || [])); if (!data || data.length < 1000) return out;
      }
    }
    function attach(L, H) {
      const by = new Map(); H.forEach(h => { const a = by.get(h.link_id) || []; a.push(h); by.set(h.link_id, a); });
      return L.map(l => ({ ...l, history:(by.get(l.id) || []).sort((a, b) => (a.sort - b.sort) || String(a.created_at).localeCompare(String(b.created_at))) }));
    }
    async function refresh() {
      if (!ready()) { loaded = false; return false; }
      if (busy) return busy;
      busy = (async () => {
        try {
          const c = sb();
          const mv = await c.from("registry_moves").select("*").limit(1);
          if (mv.error) throw new Error(mv.error.message);
          const [L, H, S] = await Promise.all([
            pageAll(() => c.from("registry_links").select("*").order("created_at", { ascending:true }).order("id")),
            pageAll(() => c.from("registry_history").select("*").order("created_at", { ascending:true }).order("id")),
            pageAll(() => c.from("registry_sims").select("*").order("sim_id"))]);
          let HE = []; try { const he = await c.from("registry_home_events").select("*").order("created_at", { ascending:true }); if (!he.error) HE = he.data || []; } catch {}
          homeEv = HE;
          moved = (mv.data || [])[0] || false; links = attach(L, H); simx = new Map(S.map(r => [r.sim_id, r])); loaded = true; problem = null;
          return true;
        } catch (e) { problem = e.message; loaded = false; return false; }
      })();
      try { return await busy; } finally { busy = null; }
    }
    /* what the Registry shows: the tables after the move, else the old list converted (read only) */
    function all() {
      if (loaded && moved) return links;
      const src = db ? db.relationships : null;
      if (view.src !== src) view = { src, out:linksFromRels(src || []) };
      return view.out;
    }
    const isMoved = () => !!(loaded && moved);
    /* the old shape, one row per direction, built from the links (read only; apps that still read data.relationships use it) */
    function asRels(list) {
      const def = { rom:"Dating", ex:"Ex", friend:"Friend", work:"Colleague", fam:"Family" }, out = [];
      (list || links).forEach(l => {
        let la = l.a_label, lb = l.b_label;
        if (l.kind === "fam" && l.family === "parent") { la = la || "Child"; lb = lb || "Parent"; }
        else if (l.kind === "fam" && l.family === "sibling") { la = la || "Sibling"; lb = lb || "Sibling"; }
        else { la = la || def[l.kind]; lb = lb || la; }
        const ida = l.id + ":a", idb = l.id + ":b", hid = !!l.secret;
        out.push({ id:ida, from_sim:l.a_sim, to_sim:l.b_sim || null, to_name:l.b_sim ? null : (l.b_name || null), kind:l.kind, label:la, hidden:hid, secret:null, pair:l.b_sim ? idb : null });
        if (l.b_sim) out.push({ id:idb, from_sim:l.b_sim, to_sim:l.a_sim, to_name:null, kind:l.kind, label:lb, hidden:hid, secret:null, pair:ida });
      });
      return out;
    }
    const canEdit = () => isMoved();
    const linksOf = simId => all().filter(l => l.a_sim === simId || l.b_sim === simId);
    const linkById = id => all().find(l => l.id === id) || null;
    /* the link as seen from one Sim's file */
    function side(l, simId) {
      const mineA = l.a_sim === simId;
      return { link:l, other:mineA ? l.b_sim : l.a_sim, otherName:mineA ? l.b_name : null, label:mineA ? l.a_label : l.b_label, theirLabel:mineA ? l.b_label : l.a_label, isParent:l.family === "parent" && mineA, isChild:l.family === "parent" && !mineA };
    }
    const simInfo = id => simx.get(id) || { sim_id:id, summary:null, townie:false };
    const needCloud = () => { if (!ready()) throw new Error("The Registry needs the cloud connection to save. Sign in to SimDesk's cloud, then try again."); };
    const needMoved = () => { needCloud(); if (!isMoved()) throw new Error("Move your Registry to its new tables first (the banner at the top of the Registry)."); };

    async function saveSimInfo(simId, patch) {
      needCloud();
      const row = { user_id:Cloud.userId(), sim_id:simId, ...pick(patch, ["summary","townie","batch"]), updated_at:new Date().toISOString() };
      const { data, error } = await sb().from("registry_sims").upsert(row, { onConflict:"user_id,sim_id" }).select().single();
      if (error) throw new Error(error.message || "Couldn't save that.");
      simx.set(simId, data); return data;
    }
    /* saves the link and replaces its history with the list given (entries without an id are added) */
    async function saveLink(link, history) {
      needMoved();
      const c = sb(), isNew = !links.some(x => x.id === link.id);
      const row = { ...pick(link, LINK_COLS), updated_at:new Date().toISOString() };
      if (!row.id) row.id = uuid();
      const res = isNew ? await c.from("registry_links").insert({ ...row, user_id:Cloud.userId() }).select().single() : await c.from("registry_links").update(row).eq("id", row.id).select().single();
      if (res.error) throw new Error(res.error.message || "Couldn't save that connection.");
      const old = isNew ? [] : (links.find(x => x.id === row.id).history || []);
      let hist = old;
      if (history) {
        const keep = new Set(history.filter(h => h.id).map(h => h.id));
        const gone = old.filter(h => !keep.has(h.id)).map(h => h.id);
        if (gone.length) { const d = await c.from("registry_history").delete().in("id", gone); if (d.error) throw new Error(d.error.message); }
        const rows = history.map((h, i) => ({ ...pick(h, HIST_COLS), id:h.id || uuid(), link_id:row.id, sort:i, user_id:Cloud.userId() }));
        const changed = rows.filter(h => { const o = old.find(x => x.id === h.id); return !o || o.label !== h.label || JSON.stringify(o.game_date || null) !== JSON.stringify(h.game_date || null) || o.sort !== h.sort || (o.note || null) !== (h.note || null); });
        if (changed.length) { const u = await c.from("registry_history").upsert(changed).select(); if (u.error) throw new Error(u.error.message); }
        hist = rows;
      }
      const saved = { ...res.data, history:hist };
      const i = links.findIndex(x => x.id === saved.id); if (i >= 0) links[i] = saved; else links.push(saved);
      return saved;
    }
    async function deleteLink(id) {
      needMoved();
      const { error } = await sb().from("registry_links").delete().eq("id", id);
      if (error) throw new Error(error.message || "Couldn't delete that connection.");
      links = links.filter(x => x.id !== id);
    }
    /* a batch of new links with their history (importer, Slide) */
    async function insertLinks(list) {
      needMoved();
      const c = sb(), uid = Cloud.userId();
      for (let i = 0; i < list.length; i += 200) {
        const part = list.slice(i, i + 200);
        const a = await c.from("registry_links").insert(part.map(l => ({ ...pick(l, LINK_COLS), user_id:uid }))).select();
        if (a.error) throw new Error(a.error.message || "Couldn't add those connections.");
        const hs = part.flatMap(l => (l.history || []).map((h, k) => ({ ...pick(h, HIST_COLS), id:h.id || uuid(), link_id:l.id, sort:k, user_id:uid })));
        if (hs.length) { const b = await c.from("registry_history").insert(hs).select(); if (b.error) throw new Error(b.error.message); }
      }
      await refresh();
    }
    async function deleteWhere(col, val) { needMoved(); const { error } = await sb().from("registry_links").delete().eq(col, val); if (error) throw new Error(error.message); await refresh(); }
    async function deleteSimRows(col, val) { needCloud(); const { error } = await sb().from("registry_sims").delete().eq(col, val); if (error) throw new Error(error.message); await refresh(); }
    async function deleteAllLinks() { needMoved(); const { error } = await sb().from("registry_links").delete().eq("user_id", Cloud.userId()); if (error) throw new Error(error.message); await refresh(); }

    /* ---------- the one-time move ---------- */
    /* what's there now, from the old save */
    function plan() {
      const rels = (db && db.relationships) || [], sims = (db && db.sims) || [];
      const conv = linksFromRels(rels), c = linkCounts(conv);
      const notes = sims.filter(s => Array.isArray(s.notes) && s.notes.length), secrets = sims.filter(s => Array.isArray(s.secrets) && s.secrets.length);
      return { rows:rels.length, rowIds:rels.map(r => String(r.id)), links:conv, counts:c,
        caseNotes:notes.length, caseBlocks:notes.reduce((n, s) => n + s.notes.length, 0), restricted:secrets.reduce((n, s) => n + s.secrets.length, 0), restrictedSims:secrets.length };
    }
    async function move() {
      needCloud();
      await refresh();
      if (moved) return { already:true };
      if (problem) throw new Error("The Registry tables aren't reachable: " + problem);
      if (links.length) throw new Error("The new tables already have connections in them, so the move stopped to keep anything from doubling. Nothing was changed.");
      const p = plan();
      await (async () => {
        const c = sb(), uid = Cloud.userId();
        for (let i = 0; i < p.links.length; i += 200) {
          const part = p.links.slice(i, i + 200);
          const a = await c.from("registry_links").insert(part.map(l => ({ ...pick(l, LINK_COLS), user_id:uid })));
          if (a.error) throw new Error(a.error.message);
          const hs = part.flatMap(l => l.history.map((h, k) => ({ ...pick(h, HIST_COLS), link_id:l.id, sort:k, user_id:uid })));
          if (hs.length) { const b = await c.from("registry_history").insert(hs); if (b.error) throw new Error(b.error.message); }
        }
      })().catch(async e => { await sb().from("registry_links").delete().eq("user_id", Cloud.userId()); throw new Error("The move didn't finish, so it was rolled back. Nothing changed. (" + e.message + ")"); });
      /* read it all back and check every old row landed in exactly one link */
      const c = sb();
      const L = await pageAll(() => c.from("registry_links").select("*").order("id"));
      const H = await pageAll(() => c.from("registry_history").select("*").order("id"));
      const seen = new Map(); L.forEach(l => (l.legacy_ids || []).forEach(id => seen.set(id, (seen.get(id) || 0) + 1)));
      const rowsOut = p.rowIds.filter(id => seen.get(id) === 1).length;
      const out = linkCounts(attach(L, H)), ok = L.length === p.links.length && H.length === p.counts.history && rowsOut === p.rows && [...seen.values()].every(n => n === 1) && out.secret === p.counts.secret;
      const counts = { in:{ rows:p.rows, links:p.links.length, history:p.counts.history, secret:p.counts.secret, caseNotes:p.caseNotes, caseBlocks:p.caseBlocks, restricted:p.restricted, restrictedSims:p.restrictedSims },
        out:{ rows:rowsOut, links:L.length, history:H.length, secret:out.secret, caseNotes:p.caseNotes, caseBlocks:p.caseBlocks, restricted:p.restricted, restrictedSims:p.restrictedSims }, kinds:out };
      if (!ok) { await c.from("registry_links").delete().eq("user_id", Cloud.userId()); throw new Error(`The counts didn't match (in: ${p.links.length} links, ${p.rows} rows; out: ${L.length} links, ${rowsOut} rows), so the move was rolled back. Nothing changed.`); }
      const mk = await c.from("registry_moves").insert({ user_id:Cloud.userId(), counts }).select().single();
      if (mk.error) { await c.from("registry_links").delete().eq("user_id", Cloud.userId()); throw new Error("Couldn't finish the move, so it was rolled back: " + mk.error.message); }
      await refresh();
      return counts;
    }
    /* ---------- the importer's writes (one batch, with a record so it can be undone) ---------- */
    const UNDO_LINKS = "gfb-import-undo-links";
    const chunks = (a, n = 150) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
    const simRow = (id, o) => ({ user_id:Cloud.userId(), sim_id:id, summary:o.summary ?? null, townie:!!o.townie, batch:o.batch ?? null, updated_at:new Date().toISOString() });
    async function applyImport({ insert = [], remove = [], repoint = [], simInfo = {}, batch = null }) {
      if (insert.length || remove.length || repoint.length) needMoved(); else needCloud();
      await refresh();
      const c = sb(), rec = { batch, at:Date.now(), inserted:[], removed:[], repointed:[], simBefore:{} };
      rec.removed = links.filter(l => remove.includes(l.id)).map(l => JSON.parse(JSON.stringify(l)));
      rec.repointed = repoint.map(r => { const l = links.find(x => x.id === r.id); return l ? { id:l.id, b_sim:l.b_sim, b_name:l.b_name } : null; }).filter(Boolean);
      Object.keys(simInfo).forEach(id => { const o = simx.get(id); rec.simBefore[id] = o ? { summary:o.summary ?? null, townie:!!o.townie, batch:o.batch ?? null } : null; });
      rec.inserted = insert.map(l => l.id);
      try { localStorage.setItem(UNDO_LINKS, JSON.stringify(rec)); } catch {}
      try {
        for (const part of chunks(rec.removed.map(l => l.id))) { const d = await c.from("registry_links").delete().in("id", part); if (d.error) throw new Error(d.error.message); }
        for (const r of repoint) { const u = await c.from("registry_links").update({ b_sim:r.b_sim, b_name:null, updated_at:new Date().toISOString() }).eq("id", r.id); if (u.error) throw new Error(u.error.message); }
        if (insert.length) await insertLinks(insert);
        const rows = Object.entries(simInfo).map(([id, o]) => { const prev = simx.get(id) || {}; return simRow(id, { summary:o.summary !== undefined ? o.summary : prev.summary, townie:o.townie !== undefined ? o.townie : prev.townie, batch:o.batch !== undefined ? o.batch : prev.batch }); });
        for (const part of chunks(rows)) { const u = await c.from("registry_sims").upsert(part, { onConflict:"user_id,sim_id" }); if (u.error) throw new Error(u.error.message); }
      } catch (e) { try { await undoImportLinks(); } catch {} throw new Error("The connections didn't save, so that part was rolled back. (" + e.message + ")"); }
      await refresh();
      return { links:insert.length, removed:rec.removed.length, repointed:rec.repointed.length };
    }
    const canUndoLinks = () => !!localStorage.getItem(UNDO_LINKS);
    async function undoImportLinks() {
      const raw = localStorage.getItem(UNDO_LINKS); if (!raw) return false;
      const rec = JSON.parse(raw), c = sb();
      if (rec.inserted.length || rec.removed.length || rec.repointed.length) needMoved(); else needCloud();
      for (const part of chunks(rec.inserted)) { const d = await c.from("registry_links").delete().in("id", part); if (d.error) throw new Error(d.error.message); }
      for (const r of rec.repointed) { const u = await c.from("registry_links").update({ b_sim:r.b_sim, b_name:r.b_name }).eq("id", r.id); if (u.error) throw new Error(u.error.message); }
      if (rec.removed.length) { const have = new Set((await pageAll(() => c.from("registry_links").select("id").order("id"))).map(x => x.id)); const back = rec.removed.filter(l => !have.has(l.id)); if (back.length) await insertLinks(back); }
      const gone = Object.entries(rec.simBefore).filter(([, v]) => !v).map(([id]) => id), keep = Object.entries(rec.simBefore).filter(([, v]) => v).map(([id, v]) => simRow(id, v));
      for (const part of chunks(gone)) { const d = await c.from("registry_sims").delete().in("sim_id", part); if (d.error) throw new Error(d.error.message); }
      for (const part of chunks(keep)) { const u = await c.from("registry_sims").upsert(part, { onConflict:"user_id,sim_id" }); if (u.error) throw new Error(u.error.message); }
      localStorage.removeItem(UNDO_LINKS); await refresh(); return true;
    }
    /* home changes on a Sim's timeline (Housed, Homeless, Townie). Own table, so the Registry move and its undo never touch it. */
    const homeEventsOf = simId => homeEv.filter(e => e.sim_id === simId);
    async function saveHomeEvent(ev) {
      needCloud();
      const row = { sim_id:ev.sim_id, kind:ev.kind, address:ev.address || null, game_date:ev.game_date || null, note:ev.note || null };
      const q = ev.id ? sb().from("registry_home_events").update(row).eq("id", ev.id) : sb().from("registry_home_events").insert({ ...row, user_id:Cloud.userId() });
      const { data, error } = await q.select().single();
      if (error) throw new Error(error.message || "Couldn't save that home entry.");
      homeEv = ev.id ? homeEv.map(x => x.id === ev.id ? data : x) : [...homeEv, data]; return data;
    }
    async function deleteHomeEvent(id) {
      needCloud();
      const { error } = await sb().from("registry_home_events").delete().eq("id", id);
      if (error) throw new Error(error.message || "Couldn't remove that entry.");
      homeEv = homeEv.filter(x => x.id !== id);
    }
    const batchSims = b => [...simx.values()].filter(r => r.batch === b).map(r => r.sim_id);
    return { ready, refresh, all, linksOf, batchSims, homeEventsOf, saveHomeEvent, deleteHomeEvent, linkById, side, simInfo, saveSimInfo, saveLink, deleteLink, insertLinks, deleteWhere, deleteSimRows, deleteAllLinks, plan, move, applyImport, undoImportLinks, canUndoLinks,
      isMoved, asRels, canEdit, problem:() => problem, isLoaded:() => loaded, moveInfo:() => moved || null, newId:uuid, fromRels:linksFromRels, counts:linkCounts, firstEntry };
  })();

  /* Housed if the household has a home address, else Homeless; a Townie with no address shows as Townie. The old status stays hidden on the Sim. */
  const RESIDENTIAL = ["Apartment","Residential","Residential Rental"];
  function homeOf(s, d) {
    d = d || db; if (!s || !s.household || !d) return null;
    return (d.lots || []).find(l => l.household === s.household && (RESIDENTIAL.includes(l.lot_type) || !l.lot_type) && !(d.lots || []).some(u => u.parent_id === l.id)) || null;
  }
  function statusOf(s, d) { if (homeOf(s, d)) return "Housed"; return registry.simInfo(s.id).townie ? "Townie" : "Homeless"; }

  /* ================= Photos =================
     Every photo lives once in Photos (photos table plus the simdesk-photos Storage bucket). A slot that frames a photo
     (circle, portrait, wide) gets its own cropped copy, recorded in photo_frames with the framing, so the original never changes
     and the slot can be reframed later. Apps keep storing a plain link, so nothing that shows photos had to change. */
  const PHOTO_BUCKET = "simdesk-photos";
  const photos = (() => {
    let list = [], frames = [], loaded = false, busy = null, problem = null;
    const sb = () => cloudClient();
    const ready = () => !!sb();
    async function pageAll(build) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await build().range(from, from + 999);
        if (error) throw new Error(error.message || "Couldn't reach Photos.");
        out.push(...(data || [])); if (!data || data.length < 1000) return out;
      }
    }
    async function refresh() {
      if (!ready()) { loaded = false; return false; }
      if (busy) return busy;
      busy = (async () => {
        try {
          const c = sb();
          const [P, F] = await Promise.all([pageAll(() => c.from("photos").select("*").order("created_at", { ascending:false }).order("id")), pageAll(() => c.from("photo_frames").select("*").order("created_at").order("id"))]);
          list = P; frames = F; loaded = true; problem = null; return true;
        } catch (e) { problem = e.message; loaded = false; return false; }
      })();
      try { return await busy; } finally { busy = null; }
    }
    const need = () => { if (!ready()) throw new Error("Photos needs the cloud connection. Sign in to SimDesk's cloud, then try again."); };
    const byId = id => list.find(p => p.id === id) || null;
    /* a link used anywhere: the photo it came from, and the framed copy if it is one */
    function byUrl(url) {
      if (!url) return null;
      const p = list.find(x => x.url === url); if (p) return { photo:p, frame:null };
      const f = frames.find(x => x.url === url); if (f) return { photo:byId(f.photo_id), frame:f };
      return null;
    }
    const framesOf = id => frames.filter(f => f.photo_id === id);
    async function put(blob, ext) {
      const path = `${Cloud.userId()}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb().storage.from(PHOTO_BUCKET).upload(path, blob, { contentType:blob.type, cacheControl:"31536000", upsert:false });
      if (error) throw new Error("The photo didn't upload: " + (error.message || "try again."));
      return { path, url:sb().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl };
    }
    const extOf = b => b.type.includes("webp") ? "webp" : b.type.includes("png") ? "png" : "jpg";
    /* parse a Supabase public link into bucket and path, so moved photos can be found again */
    function where(url) { const m = String(url || "").match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/); return m ? { bucket:m[1], path:decodeURIComponent(m[2]) } : { bucket:null, path:null }; }
    async function insertRow(row) {
      const { data, error } = await sb().from("photos").insert({ ...row, user_id:Cloud.userId() }).select().single();
      if (error) throw new Error(error.message || "Couldn't save that photo.");
      list.unshift(data); return data;
    }
    /* a new photo: shrunk, uploaded, saved with its tags and game date */
    async function add(file, { sims = [], lots = [], game_date = null, title = null, max = 2400 } = {}) {
      need();
      const s = await shrinkFile(file, max), blob = await (await fetch(s.url)).blob(), up = await put(blob, extOf(blob));
      return insertRow({ url:up.url, bucket:PHOTO_BUCKET, path:up.path, width:s.width, height:s.height, title, game_date, sims:[...new Set(sims)], lots:[...new Set(lots)], source:"upload" });
    }
    async function update(id, patch) {
      need();
      const row = Object.fromEntries(Object.entries(patch).filter(([k]) => ["title","game_date","sims","lots"].includes(k)));
      const { data, error } = await sb().from("photos").update({ ...row, updated_at:new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw new Error(error.message || "Couldn't save that.");
      const i = list.findIndex(p => p.id === id); if (i >= 0) list[i] = data; return data;
    }
    /* adds tags without removing any (auto-tagging from where a photo was used) */
    async function addTags(id, sims = [], lots = []) {
      const p = byId(id); if (!p) return null;
      const ns = [...new Set([...(p.sims || []), ...sims.filter(Boolean)])], nl = [...new Set([...(p.lots || []), ...lots.filter(Boolean)])];
      if (ns.length === (p.sims || []).length && nl.length === (p.lots || []).length) return p;
      return update(id, { sims:ns, lots:nl });
    }
    async function remove(id) {
      need();
      const p = byId(id); if (!p) return;
      const files = [p, ...framesOf(id)].filter(x => x.bucket && x.path && x.path.startsWith(Cloud.userId() + "/"));
      const { error } = await sb().from("photos").delete().eq("id", id);
      if (error) throw new Error(error.message || "Couldn't delete that photo.");
      for (const b of [...new Set(files.map(f => f.bucket))]) { try { await sb().storage.from(b).remove(files.filter(f => f.bucket === b).map(f => f.path)); } catch {} }
      list = list.filter(x => x.id !== id); frames = frames.filter(f => f.photo_id !== id);
    }
    function loadImg(url) {
      return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => rej(new Error("Couldn't open that photo.")); im.src = url + (url.startsWith("data:") ? "" : (url.includes("?") ? "&" : "?") + "cors=1"); });
    }
    /* framing: { cx, cy, zoom } where cx, cy are the center of the slot's window as fractions of the photo, and zoom 1 just covers the slot */
    function cropRect(W, H, aspect, f) {
      const z = Math.max(1, Number(f.zoom) || 1);
      let bw = Math.min(W, H * aspect), bh = bw / aspect;
      const w = bw / z, h = bh / z;
      const x = Math.min(W - w, Math.max(0, (Number(f.cx ?? .5)) * W - w / 2)), y = Math.min(H - h, Math.max(0, (Number(f.cy ?? .5)) * H - h / 2));
      return { x, y, w, h };
    }
    async function frame(photo, { shape, aspect, framing, outW }) {
      need();
      const im = await loadImg(photo.url), r = cropRect(im.naturalWidth, im.naturalHeight, aspect, framing);
      const W = Math.round(Math.min(outW, r.w * 1.0) || outW) || outW, H = Math.round(W / aspect);
      const c = drawSharp(im, r.x, r.y, r.w, r.h, Math.max(1, W), Math.max(1, H));
      const blob = await (await fetch(canvasURL(c))).blob(), up = await put(blob, extOf(blob));
      const { data, error } = await sb().from("photo_frames").insert({ user_id:Cloud.userId(), photo_id:photo.id, url:up.url, bucket:PHOTO_BUCKET, path:up.path, shape, framing:{ ...framing, aspect } }).select().single();
      if (error) throw new Error(error.message || "Couldn't save the framing.");
      frames.push(data); return data;
    }
    /* Crop and rotate edits the photo itself. Every place that used the old link gets the new one. */
    async function crop(photo, { x, y, w, h, rotate = 0 }) {
      need();
      const im = await loadImg(photo.url), rot = ((rotate % 360) + 360) % 360;
      const src = document.createElement("canvas"), sw = rot % 180 ? im.naturalHeight : im.naturalWidth, sh = rot % 180 ? im.naturalWidth : im.naturalHeight;
      src.width = sw; src.height = sh; const g = src.getContext("2d");
      g.translate(sw / 2, sh / 2); g.rotate(rot * Math.PI / 180); g.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
      const rx = Math.round(x * sw), ry = Math.round(y * sh), rw = Math.max(1, Math.round(w * sw)), rh = Math.max(1, Math.round(h * sh));
      const out = drawSharp(src, rx, ry, rw, rh, rw, rh), blob = await (await fetch(canvasURL(out))).blob(), up = await put(blob, extOf(blob));
      const oldUrl = photo.url;
      const { data, error } = await sb().from("photos").update({ url:up.url, bucket:PHOTO_BUCKET, path:up.path, width:rw, height:rh, updated_at:new Date().toISOString() }).eq("id", photo.id).select().single();
      if (error) throw new Error(error.message || "Couldn't save the crop.");
      const i = list.findIndex(p => p.id === photo.id); if (i >= 0) list[i] = data;
      swapUrl(oldUrl, up.url);
      return data;
    }
    /* ---------- where each photo is used ---------- */
    const clean = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").trim();
    /* every photo link in SimDesk with where it sits: { url, label, sub, shape, href, sims, lots } */
    function places() {
      const d = db || load(), out = [];
      const add = (url, o) => { if (typeof url === "string" && url && !url.startsWith("blob:")) out.push({ url, sims:[], lots:[], ...o }); };
      const simName = id => { const s = d.sims.find(x => x.id === String(id).split("~")[0]); return s ? clean(s.name) : id; };
      d.sims.forEach(s => {
        add(s.portrait, { label:"Registry file photo", sub:clean(s.name), shape:"portrait", href:"#/registry/" + s.id, sims:[s.id] });
        add(s.headshot, { label:"Huddl headshot", sub:clean(s.name), shape:"portrait", href:"#/registry/" + s.id, sims:[s.id] });
        add(s.simsta_avatar, { label:"Simsta profile pic", sub:s.simsta || clean(s.name), shape:"circle", href:"#/simsta/u/" + s.id, sims:[s.id] });
        (s.simsta_alts || []).forEach(a => add(a.avatar, { label:"Simsta profile pic", sub:(a.handle || "alt") + " (alt)", shape:"circle", href:"#/simsta/u/" + s.id + "~" + a.id, sims:[s.id] }));
      });
      (d.posts || []).forEach(p => add(p.photo, { label:"Simsta post", sub:[p.caption ? "“" + String(p.caption).slice(0, 40) + "”" : simName(p.author), p.date && p.date.season ? `${p.date.season} ${p.date.day}` : ""].filter(Boolean).join(" · "), shape:"portrait", href:"#/simsta/p/" + p.id, sims:[String(p.author || "").split("~")[0], ...(p.tags || []).map(t => String(t).split("~")[0])].filter(Boolean), lots:p.lot_id ? [p.lot_id] : [], date:p.date }));
      (d.lots || []).forEach(l => add(l.photo, { label:"Lotline listing", sub:l.address, shape:"wide", href:"#/lotline/" + l.id, lots:[l.id] }));
      (d.organizations || []).forEach(o => {
        const club = String(o.type || "").toLowerCase() === "club", app = club ? "Cliq" : "Huddl", href = club ? "#/cliq/club/" + o.id : "#/huddl/org/" + o.id;
        add(o.banner, { label:app + " banner", sub:o.name, shape:"wide", href, lots:o.lot ? [o.lot] : [] });
        add(o.emblem_img, { label:app + " circle picture", sub:o.name, shape:"circle", href });
        add(o.logo, { label:"Huddl logo", sub:o.name, shape:"square", href });
      });
      (d.stories || []).forEach(s => add(s.photo, { label:"Black Tea story", sub:s.headline || "Story", shape:"wide", href:"#/blacktea/story/" + s.id, sims:s.sims || [] }));
      add(d.settings && d.settings.wallpaper, { label:"Wallpaper", sub:"SimDesk desktop", shape:"wide", href:"#/settings" });
      /* anything else holding a photo link (a field added later) still counts */
      const known = new Set(out.map(x => x.url));
      const walk = (o, path) => { if (typeof o === "string") { if (!known.has(o) && /^(data:image\/|https?:\/\/[^"]+\/storage\/v1\/object\/public\/)/.test(o)) { known.add(o); out.push({ url:o, label:"Elsewhere in SimDesk", sub:path, shape:"square", href:null, sims:[], lots:[] }); } return; }
        if (Array.isArray(o)) o.forEach((v, i) => walk(v, path)); else if (o && typeof o === "object") Object.entries(o).forEach(([k, v]) => walk(v, path ? path : k)); };
      ["sims","posts","lots","organizations","stories","settings","notes","calendar","huddl_posts","tossup","slide","accounts"].forEach(k => walk(d[k], k));
      return out;
    }
    function usesOf(photo) {
      if (!photo) return [];
      const urls = new Set([photo.url, ...framesOf(photo.id).map(f => f.url)]);
      return places().filter(x => urls.has(x.url));
    }
    /* swaps a link everywhere in your save (used by Crop and rotate). The app itself writes it, so it syncs like any edit. */
    function swapUrl(from, to) {
      if (!from || from === to) return 0;
      const wasWall = ((db || load()).settings || {}).wallpaper === from;
      const edits = readEdits(); let n = 0;
      const swap = o => { if (Array.isArray(o)) o.forEach((v, i) => { if (v === from) { o[i] = to; n++; } else if (v && typeof v === "object") swap(v); });
        else if (o && typeof o === "object") Object.keys(o).forEach(k => { if (o[k] === from) { o[k] = to; n++; } else if (o[k] && typeof o[k] === "object") swap(o[k]); }); };
      swap(edits);
      if (n) { writeEdits(edits); db = null; load(); if (wasWall) window.dispatchEvent(new Event("gfb:wallpaper")); }
      return n;
    }
    /* ---------- moving what you already have into Photos ---------- */
    function pending() {
      const have = new Set([...list.map(p => p.url), ...frames.map(f => f.url)]), by = new Map();
      places().forEach(x => { const o = by.get(x.url) || { url:x.url, sims:new Set(), lots:new Set(), places:[], date:null }; x.sims.forEach(s => o.sims.add(s)); x.lots.forEach(l => o.lots.add(l)); o.places.push(x); if (!o.date && x.date && typeof x.date === "object") o.date = x.date; by.set(x.url, o); });
      const all = [...by.values()];
      return { found:all.length, todo:all.filter(x => !have.has(x.url)) };
    }
    /* a photo the slot already shows: found in Photos, or added to it now so it can be reframed */
    async function ensure(url, { sims = [], lots = [], date = null } = {}) {
      need(); const hit = byUrl(url); if (hit && hit.photo) return hit;
      let u = url, loc = where(url);
      if (url.startsWith("data:")) { const blob = await (await fetch(url)).blob(), up = await put(blob, extOf(blob)); u = up.url; loc = { bucket:PHOTO_BUCKET, path:up.path }; }
      let w = null, h = null; try { const im = await loadImg(u); w = im.naturalWidth; h = im.naturalHeight; } catch {}
      const row = await insertRow({ url:u, bucket:loc.bucket, path:loc.path, width:w, height:h, title:null, game_date:date, sims:[...new Set(sims)], lots:[...new Set(lots)], source:"moved" });
      return { photo:row, frame:null };
    }
    async function moveIn(today, progress) {
      need(); await refresh();
      const { found, todo } = pending(); let moved = 0, failed = 0, n = 0;
      for (const x of todo) {
        try {
          let url = x.url, w = null, h = null, loc = where(url);
          if (url.startsWith("data:")) {   /* still only on this device: upload it first, then point every use at the new link */
            const blob = await (await fetch(url)).blob(), up = await put(blob, extOf(blob)); swapUrl(url, up.url); url = up.url; loc = { bucket:PHOTO_BUCKET, path:up.path };
          }
          try { const im = await loadImg(url); w = im.naturalWidth; h = im.naturalHeight; } catch {}
          await insertRow({ url, bucket:loc.bucket, path:loc.path, width:w, height:h, title:null, game_date:x.date || today || null, sims:[...x.sims], lots:[...x.lots], source:"moved" });
          moved++;
        } catch (e) { console.warn("Photo move failed", x.url, e); failed++; }
        n++; if (progress) progress(n, todo.length);
      }
      const after = pending();
      return { found, already:found - todo.length, moved, failed, left:after.todo.length };
    }
    return { ready, refresh, all:() => list, byId, byUrl, framesOf, add, update, addTags, remove, frame, crop, usesOf, places, pending, moveIn, ensure, swapUrl, cropRect, loadImg, isLoaded:() => loaded, problem:() => problem };
  })();

  function resetLocal() { try { localStorage.removeItem(KEY); } catch {} if (typeof Cloud !== "undefined") Cloud.queuePush(); db = null; load(); }
  function hasLocalEdits() { const e = readEdits(); return Object.keys(e.sims || {}).length > 0 || ["stories","lots","accounts","transactions","loans","todos","projects","posts"].some(t => Array.isArray(e[t])) || !!e.calendar; }

  return { messages, simsta, registry, photos, statusOf, homeOf, importAdd, saveTossUp, saveSlide, saveNote, deleteNote, cloudPhotos, photoStats, movePhotosToCloud, normHandle, saveOrg, deleteOrg, saveHuddlPost, deleteHuddlPost, importReplace, undoImport, canUndoImport, exportEdits, getAll, saveSim, addSim, saveOptions, saveSetting, saveRel, deleteRel, saveStory, deleteStory, saveLot, deleteLot, saveAccount, saveLoan, savePost, deletePost, saveTodo, deleteTodo, saveProject, deleteProject, deleteLoan, postTransaction, saveEvent, deleteEvent, saveLog, deleteLog, setToday, uploadImage, resetLocal, hasLocalEdits };
})();
