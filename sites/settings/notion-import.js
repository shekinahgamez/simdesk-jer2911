/* Import from Notion (lives in Settings). Reads CSV exports of the Sims, Households, Lots, and Clubs databases,
   shows a dry-run preview, and only saves when you confirm. Saves go through GFB.importReplace, so they sync like any edit. */
const NotionImport = (() => {
  const LOCKED = { "zaevion carter":"Zaevion Monroe", "renata cruz":"Paloma Cruz", "marcus deveraux":"Julian Deveraux", "kiana lowe":"Kiana Carter" };
  const DEFAULT_LOT_STATUS = { Wishlist:"Proposed", Downloaded:"Permits approved", Placed:"Built" };
  const PREF = { likes:"Likes", dislikes:"Dislikes", turn_ons:"Turn Ons", turn_offs:"Turn Offs" };

  /* ---------- small helpers ---------- */
  const stripNick = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const norm = n => stripNick(n).toLowerCase();
  const normQ = n => String(n || "").replace(/[\u201c\u201d"]/g, "").replace(/\s+/g, " ").trim().toLowerCase();   /* Notion drops the quote marks in relation cells: Dominic Dom Porter */
  const dropState = c => cleanRel(c).replace(/,\s*[A-Za-z]{2,4}$/, "");                                         /* "Lennox Park, SD" -> "Lennox Park" */
  const slug = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const first = n => stripNick(n).split(" ")[0];
  const last = n => stripNick(n).split(" ").slice(-1)[0];
  const num = v => { const n = parseFloat(String(v || "").replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };
  const yes = v => /^(yes|true|checked|__yes__)$/i.test(String(v || "").trim());
  const cleanRel = c => String(c || "").replace(/\s*\([^)]*(?:https?:\/\/|%20|\.csv|\.md)[^)]*\)/g, "").trim();   /* Notion adds a link or file path in parentheses after each related name */
  const list = c => String(c || "").split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);
  const paras = t => String(t || "").split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const sortAZ = a => [...a].sort((x, y) => x.localeCompare(y));
  const uniq = a => [...new Set(a)];
  const uniqCI = a => { const m = new Map(); a.forEach(x => { if (!m.has(x.toLowerCase())) m.set(x.toLowerCase(), x); }); return [...m.values()]; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  /* relation cells arrive as comma-separated names; some names contain commas, so match against names we know */
  function splitKnown(cell, isKnown) {
    const tokens = cleanRel(cell).split(/,\s*/).filter(x => x !== ""), out = [];
    for (let i = 0; i < tokens.length;) {
      let hit = false;
      for (let j = tokens.length; j > i; j--) { const cand = tokens.slice(i, j).join(", "); if (isKnown(cand)) { out.push(cand); i = j; hit = true; break; } }
      if (!hit) { out.push(tokens[i]); i++; }
    }
    return out;
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, "");
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim());
    const out = rows.filter(r => r.some(x => x.trim() !== "")).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
    return { head, rows: out };
  }
  function detect(head) {
    const has = h => head.includes(h);
    if (has("Club Name")) return "clubs";
    if (has("Lot Type") || has("Lot Size") || has("Bed/Bath")) return "lots";
    if (has("Attachment Style") || has("Backstory/Notes") || has("Love Language")) return "sims";
    if (has("Household Members") || has("Rotation Order") || (has("Household") && has("Neighborhood"))) return "households";
    return null;
  }

  /* ---------- the dry run (pure: nothing is saved here) ---------- */
  function build(T, ex, ch) {
    ch = ch || {};
    const mode = ch.mode === "replace" ? "replace" : "add";           /* "Add these Sims" is the default, every time */
    if (mode === "add") T = { sims:T.sims };                           /* Add mode only reads the Sims file */
    const upd = ch.update || {};
    const statusMap = { ...DEFAULT_LOT_STATUS, ...(ch.statusMap || {}) };
    const keepConn = mode === "add" || ch.keepConnections !== false;
    const rep = { counts:{}, renames:[], removedSims:[], skipped:{}, flags:{ unknown:[], near:[], collisions:[], conflicts:[], tooManyTraits:[], badStatus:[] }, notes:[] };
    const renameOf = n => LOCKED[norm(n)] || n;

    /* --- Sims --- */
    const simRows = T.sims ? T.sims.filter(r => r.Name) : (mode === "add" ? [] : ex.sims.map(s => ({ Name:s.name, __keep:s })));
    const exByName = new Map(ex.sims.map(s => [norm(s.name), s]));
    const E = simRows.map(r => { const name = renameOf(r.Name); if (name !== r.Name) rep.renames.push(r.Name + " to " + name); return { r, name }; });
    const used = new Set();
    E.forEach(e => { const m = exByName.get(norm(e.name)); if (m) { e.id = m.id; e.old = m; used.add(m.id); } });
    let fileNo = Math.max(0, ...ex.sims.map(s => parseInt(s.file_no, 10) || 0));
    E.forEach(e => {
      if (!e.id) { let id = slug(first(e.name)) || "sim"; if (used.has(id)) id = slug(stripNick(e.name)); let n = 2; while (used.has(id)) id = slug(stripNick(e.name)) + "-" + n++; e.id = id; used.add(id); }
      e.file_no = e.old ? e.old.file_no : String(++fileNo).padStart(3, "0");
    });
    const idByNorm = new Map(), idByQ = new Map();
    if (mode === "add") ex.sims.forEach(x => { idByNorm.set(norm(x.name), x.id); idByQ.set(normQ(x.name), x.id); });   /* connections can point at anyone already in SimDesk */
    E.forEach(e => { idByNorm.set(norm(e.name), e.id); idByQ.set(normQ(e.name), e.id); });
    const findId = n => { n = renameOf(n); return idByNorm.get(norm(n)) || idByQ.get(normQ(n)) || null; };
    const simKnown = n => !!findId(n);
    const target = n => { const id = findId(n); return id ? { id } : { name: renameOf(n) }; };

    const optVals = { traits:[], aspiration:[], likes:[], dislikes:[], turn_ons:[], turn_offs:[] };
    const sims = E.map(e => {
      if (e.r.__keep) return e.r.__keep;
      const r = e.r, traits = list(r.Traits), act = mode === "replace" || !e.old || !!upd[e.id];
      if (act && traits.length > 5) rep.flags.tooManyTraits.push(`${e.name} has ${traits.length} traits`);
      const s = { id:e.id, file_no:e.file_no, name:e.name, simsta:r["Simsta Handle"] || null, age:num(r["Age (#)"]), life_stage:r.Age || null, gender:r.Gender || null,
        career:r.Career || "", residence:dropState(r.Location), household:cleanRel(r.Household) || null, status:r.Placement || null,
        traits, aspiration:r.Aspiration || null, attachment:r["Attachment Style"] || null, love_language:r["Love Language"] || null, romantic_attraction:r["Romantic Attraction"] || null, sexual_attraction:r["Sexual Attraction"] || null, balance:null,
        likes:list(r.Likes), dislikes:list(r.Dislikes), turn_ons:list(r["Turn Ons"]), turn_offs:list(r["Turn Offs"]),
        notes:paras(r["Backstory/Notes"]), secrets:e.old ? (e.old.secrets || []) : [] };
      e.s = s; e.info = { townie:r.Townie !== undefined ? yes(r.Townie) : undefined, summary:r.Summary !== undefined ? (r.Summary || null) : undefined };
      e.active = act;
      if (act) { optVals.traits.push(...s.traits); if (s.aspiration) optVals.aspiration.push(s.aspiration);
        for (const k of Object.keys(PREF)) optVals[k].push(...s[k]); }
      if (act) for (const col of ["Portrait","Screenshots","Checking Balance","Fave","Phase","Tags"]) if (r[col] && !/^(no|0)$/i.test(r[col])) rep.skipped[col] = (rep.skipped[col] || 0) + 1;
      return s;
    });
    rep.removedSims = ex.sims.filter(s => !idByNorm.has(norm(s.name))).map(s => s.name);

    /* name rule: no duplicate first or last names (in Add mode, new Sims are checked against everyone already in SimDesk) */
    const group = (arr, fn, isNew) => { const m = new Map(); arr.forEach(s => { const k = fn(s.name).toLowerCase(); if (k) m.set(k, [...(m.get(k) || []), s]); }); return [...m.values()].filter(g => g.length > 1 && (!isNew || g.some(isNew))).map(g => g.map(x => x.name)); };
    const pool = mode === "add" ? [...ex.sims.filter(x => !E.some(e => e.id === x.id)), ...E.filter(e => !e.old).map(e => ({ name:e.name, id:e.id }))] : sims;
    const isNewSim = mode === "add" ? (x => E.some(e => !e.old && e.id === x.id)) : null;
    group(pool, first, isNewSim).forEach(g => rep.flags.collisions.push("Same first name: " + g.join(", ")));
    group(pool, last, isNewSim).forEach(g => rep.flags.collisions.push("Same last name: " + g.join(", ")));

    /* --- Connections: ONE link per pair, from the Spouse / Dating / Ex / Parents / Children / Siblings columns.
           Parent links come in Biological + Raised them (Adoptive off); Secret starts off; each gets one undated history entry. --- */
    const REG = GFB.registry, batchId = ch.batch || null;
    const exLinks = ex.links || [];
    const simIds = mode === "add" ? new Set([...ex.sims.map(x => x.id), ...sims.map(x => x.id)]) : new Set(sims.map(x => x.id));
    let keep = [], remove = [], repoint = [];
    if (mode === "replace") {
      exLinks.forEach(l => { const ok = keepConn && simIds.has(l.a_sim) && (!l.b_sim || simIds.has(l.b_sim)); (ok ? keep : remove).push(l); });
      /* someone who used to be "file pending" and is now filed: the connection points at them */
      keep.forEach(l => { if (!l.b_sim && l.b_name) { const id = findId(l.b_name); if (id) repoint.push({ id:l.id, b_sim:id, link:l }); } });
    } else keep = exLinks.slice();
    const pairKey = (x, y) => [x, y].sort().join("|");
    const pairs = new Map(), fresh = new Set(), pend = new Set();
    keep.forEach(l => { const b = (repoint.find(r => r.id === l.id) || {}).b_sim || l.b_sim; if (b) pairs.set(pairKey(l.a_sim, b), l); else if (l.b_name) pend.add(l.a_sim + ">" + normQ(l.b_name)); });
    const insert = [];
    const mkLink = o => ({ id:REG.newId(), a_sim:o.a, b_sim:o.b || null, b_name:o.b ? null : o.name, kind:o.kind, family:o.family || null, a_label:o.al, b_label:o.bl,
      biological:o.family === "parent" ? true : null, adoptive:o.family === "parent" ? false : null, raised:o.family === "parent" ? true : null, secret:false, legacy_ids:[], batch:batchId,
      history:[{ id:REG.newId(), label:REG.firstEntry(o.kind, o.family, o.al), game_date:null, note:null, sort:0 }] });
    const SPEC = [["Spouse","rom",null,"pair","Spouse","Spouse"],["Dating","rom",null,"pair","Dating","Dating"],["Ex","ex",null,"pair","Ex","Ex"],
      ["Parents","fam","parent","up","Child","Parent"],["Children","fam","parent","down","Child","Parent"],["Siblings","fam","sibling","pair","Sibling","Sibling"]];
    const nameOf = id => { const x = sims.find(q => q.id === id) || ex.sims.find(q => q.id === id); return x ? x.name : id; };
    let already = 0;
    for (const e of E) { if (!e.active) continue;
      for (const [col, kind, family, dir, al, bl] of SPEC) for (const nm of splitKnown(e.r[col], simKnown)) {
        const t = target(nm);
        if (t.id === e.id) continue;
        if (!t.id) {                                   /* not in SimDesk yet: a "file pending" connection */
          if (pend.has(e.id + ">" + normQ(t.name))) continue; pend.add(e.id + ">" + normQ(t.name));
          const fam = family === "parent" ? "other" : family;
          insert.push(mkLink({ a:e.id, name:t.name, kind, family:fam, al:dir === "up" ? "Parent" : dir === "down" ? "Child" : al, bl:dir === "up" ? "Child" : dir === "down" ? "Parent" : bl })); continue;
        }
        const k = pairKey(e.id, t.id), old = pairs.get(k);
        if (old) { if (fresh.has(old.id)) { if (old.kind !== kind) rep.flags.conflicts.push(`${e.name} and ${nameOf(t.id)}: two different connections in the file`); } else already++; continue; }
        const a = dir === "up" ? t.id : e.id, b = dir === "up" ? e.id : t.id;
        const l = mkLink({ a, b, kind, family, al, bl }); insert.push(l); pairs.set(k, l); fresh.add(l.id);
      }
    }
    rep.counts.connectionsKept = keep.length; rep.counts.connectionsAdded = insert.length; rep.counts.connectionsRemoved = remove.length; rep.counts.alreadyConnected = already;
    const links = { keep, remove, repoint, insert };
    /* before the Registry move, connections still live in the old list: same plan, written as old rows */
    let relationships = null, relationshipsAdd = null;
    if (!ex.moved) {
      if (mode === "add") relationshipsAdd = REG.asRels(insert);
      else {
        const ids = new Set(keep.flatMap(l => l.legacy_ids || []).map(String)), rows = (ex.relationships || []).filter(r => ids.has(String(r.id))).map(r => ({ ...r }));
        let rn = 0;
        repoint.forEach(rp => { const row = rows.find(x => (rp.link.legacy_ids || []).map(String).includes(String(x.id)) && !x.to_sim); if (!row) return;
          row.to_sim = rp.b_sim; row.to_name = null; const mid = "rel-r" + (++rn) + "-" + row.id; rows.push({ id:mid, from_sim:rp.b_sim, to_sim:row.from_sim, to_name:null, kind:row.kind, label:rp.link.b_label || row.label, secret:null, hidden:!!row.hidden, pair:row.id }); row.pair = mid; });
        relationships = [...rows, ...REG.asRels(insert)];
      }
    }

    /* --- Lots --- */
    const lotRows = (T.lots || []).filter(r => r.Address);
    const exLot = new Map(ex.lots.map(l => [l.address.toLowerCase(), l]));
    const lotIdByAddr = new Map(); const lotUsed = new Set();
    lotRows.forEach(r => { const m = exLot.get(r.Address.toLowerCase()); let id = m ? m.id : slug(r.Address) || "lot"; let n = 2; const base = id; while (lotUsed.has(id)) id = base + "-" + n++; lotUsed.add(id); lotIdByAddr.set(r.Address.toLowerCase(), id); });
    const lotKnown = a => lotIdByAddr.has(a.toLowerCase());
    /* lots already in SimDesk keep pointing at the right home when a household got renamed in Notion (same Sims, new household name) */
    const hhKey = h => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const newHH = new Map(sims.filter(x => x.household).map(x => [hhKey(x.household), x.household]));
    const hhRename = new Map();
    sims.forEach(x => { const old = (exByName.get(norm(x.name)) || {}).household; if (old && x.household && old !== x.household) hhRename.set(old, x.household); });
    let relinked = 0;
    const relink = h => { if (!h) return h; const n = hhRename.get(h) || newHH.get(hhKey(h)); if (n && n !== h) { relinked++; return n; } return h; };
    const lots = !T.lots ? ex.lots.map(l => ({ ...l, household:relink(l.household) })) : lotRows.map(r => {
      const old = exLot.get(r.Address.toLowerCase()) || {};
      const parent = splitKnown(r["Parent item"], lotKnown)[0];
      return { id:lotIdByAddr.get(r.Address.toLowerCase()), address:r.Address, parent_id:parent && lotKnown(parent) ? lotIdByAddr.get(parent.toLowerCase()) : null,
        world:dropState(r.World) || old.world || "", district:r.District || null, lot_type:r["Lot Type"] || null, lot_size:r["Lot Size"] || null, price:num(r["Lot Price"]),
        bed_bath:r["Bed/Bath"] || null, build_status:statusMap[r.Status] || "Proposed", market_status:old.market_status || null, owner:old.owner || null,
        household:cleanRel(r.Household) || null, creator:r["Creator ID"] || null, gallery_name:r["Gallery Name"] || null, notes:r.Notes || "", photo:null, notion_id:null };
    });
    const lotOptions = !T.lots ? ex.lot_options : { ...ex.lot_options, district:uniq([...(ex.lot_options.district || []), ...lots.map(l => l.district).filter(Boolean)]), lot_type:sortAZ(uniq([...(ex.lot_options.lot_type || []), ...lots.map(l => l.lot_type).filter(Boolean)])), lot_size:sortAZ(uniq([...(ex.lot_options.lot_size || []), ...lots.map(l => l.lot_size).filter(Boolean)])) };
    const notionStatuses = uniq(lotRows.map(r => r.Status).filter(Boolean));

    /* --- Households --- */
    const households = !T.households ? (ex.households || []) : (T.households || []).filter(r => r.Household).map(r => ({
      id:slug(r.Household), name:r.Household, address:r.Address || "", neighborhood:r.Neighborhood || "", status:r.Status || "", currently_playing:yes(r["Currently Playing"]),
      rotation:num(r["Rotation Order"]), residence:dropState(r.Location), backstory:r.Backstory || "",
      members:splitKnown(r["Household Members"], simKnown).map(n => findId(n)).filter(Boolean),
      lots:splitKnown(r["Owned/Rented Lots"], lotKnown).map(a => lotIdByAddr.get(a.toLowerCase())).filter(Boolean) }));
    if (T.households) households.forEach(h => h.members.forEach(id => { const s = sims.find(x => x.id === id); if (s && !s.household) s.household = h.name; }));

    /* --- Notion's Clubs database holds clubs AND institutions. Rows with activities or requirements are clubs; the rest are institutions.
           Details already written in SimDesk (about text, roles, vibe) are kept when the name matches. Organizations not in the export are dropped. --- */
    let orgs = ex.organizations.map(o => ({ ...o })), clubsNew = 0, clubsUpdated = 0, instNew = 0, instUpdated = 0; const droppedOrgs = [];
    if (T.clubs) {
      const old = orgs; orgs = [];
      (T.clubs).filter(r => r["Club Name"]).forEach(r => {
        const name = r["Club Name"], isClub = !!(r["Club Activities"] || r["Club Requirements"]), type = isClub ? "Club" : "Institution";
        const prev = old.find(x => x.name.toLowerCase() === name.toLowerCase());
        const members = splitKnown(r["Club Members"], simKnown).map(n => {
          const t = target(n), nm = t.id ? sims.find(s => s.id === t.id).name : t.name;
          const was = prev && (prev.members || []).find(m => norm(m.name) === norm(nm));
          return { name:nm, sim:t.id || null, role:was ? was.role : (isClub ? "Member" : ""), dept:was ? was.dept : "", since:was ? was.since : "", current:was ? was.current !== false : true };
        });
        const base = prev && prev.type === type ? prev : { id:(isClub ? "club-" : "org-") + slug(name), name, type, category:"", tagline:"", about:"", founded_text:"", vibe:"", join:"", join_notes:"", meets:"", rules:[], lot:null, district:"", leader:"", status:"Active", positions:[], related:[], notes:"", app:"" };
        orgs.push({ ...base, name, type, members, activities:list(r["Club Activities"]), requirements:list(r["Club Requirements"]) });
        if (prev && prev.type === type) (isClub ? clubsUpdated++ : instUpdated++); else (isClub ? clubsNew++ : instNew++);
      });
      old.forEach(o => { if (!orgs.some(x => x.name.toLowerCase() === o.name.toLowerCase())) droppedOrgs.push(o.name); });
    }
    rep.droppedOrgs = droppedOrgs;

    /* --- Option lists: traits and aspirations need approval; the four preference lists come straight from your Notion --- */
    const have = k => (ex.options[k] || []).map(x => x.toLowerCase());
    for (const k of ["traits", "aspiration"]) {
      uniqCI(optVals[k]).filter(v => !have(k).includes(v.toLowerCase())).forEach(v => rep.flags.unknown.push({ key:k, value:v, add:!(ch.addOpts && ch.addOpts[k + "|" + v] === false) }));
    }
    const options = {};
    for (const k of ["traits", "aspiration"]) options[k] = sortAZ(uniqCI([...(ex.options[k] || []), ...rep.flags.unknown.filter(u => u.key === k && u.add).map(u => u.value)]));
    for (const k of Object.keys(PREF)) options[k] = sortAZ(uniqCI([...(ex.options[k] || []), ...optVals[k]]));
    const keyOf = v => v.toLowerCase().replace(/[^a-z]/g, "").replace(/(sims|sim|s)$/, "");
    for (const k of Object.keys(PREF)) { const g = new Map(); options[k].forEach(v => g.set(keyOf(v), [...(g.get(keyOf(v)) || []), v])); [...g.values()].filter(a => a.length > 1).forEach(a => rep.flags.near.push(`${PREF[k]}: ${a.join(" / ")}`)); }

    rep.relinked = relinked;
    Object.assign(rep.counts, { sims:sims.length, simsNew:sims.filter(s => !exByName.has(norm(s.name))).length, simsMatched:sims.filter(s => exByName.has(norm(s.name))).length, lots:T.lots ? lots.length : null, households:T.households ? households.length : null, clubsNew, clubsUpdated, instNew, instUpdated });
    /* the registry-side details (Townie, Summary, and which import a Sim came in with) */
    const simInfo = {};
    E.forEach(e => { if (!e.active) return; const o = {}; if (e.info.townie !== undefined) o.townie = e.info.townie; if (e.info.summary !== undefined) o.summary = e.info.summary;
      if (!e.old && batchId) o.batch = batchId; if (Object.keys(o).length) simInfo[e.id] = o; });
    /* Add mode: the new Sims, and (only where you chose Update from file) the file's values for existing ones */
    const skipKeys = new Set(["id", "file_no", "secrets"]);
    const add = E.filter(e => !e.old).map(e => ({ ...e.s, batch:batchId || undefined }));
    const update = {};
    E.filter(e => e.old && upd[e.id]).forEach(e => { const patch = {}; Object.entries(e.s).forEach(([k, v]) => { if (skipKeys.has(k) || v == null || v === "" || (Array.isArray(v) && !v.length)) return; patch[k] = v; }); update[e.id] = patch; });
    rep.addList = E.filter(e => !e.old).map(e => ({ id:e.id, name:e.name, file_no:e.file_no, age:e.s.life_stage || "", career:e.s.career || "", parents:splitKnown(e.r.Parents, simKnown), dating:splitKnown(e.r.Dating, simKnown), spouse:splitKnown(e.r.Spouse, simKnown), ex:splitKnown(e.r.Ex, simKnown), children:splitKnown(e.r.Children, simKnown) }));
    rep.existing = E.filter(e => e.old).map(e => ({ id:e.id, name:e.name, file_no:e.old.file_no }));
    rep.linkText = insert.map(l => ({ id:l.id, kind:l.kind, family:l.family, a:l.a_sim, b:l.b_sim, name:l.b_name, bio:l.biological, raised:l.raised, adoptive:l.adoptive, al:l.a_label }));
    return { mode, payload:mode === "add" ? { add, update, options, relationshipsAdd } : { sims, relationships, lots, households, organizations:orgs, options, lot_options:lotOptions },
      links, simInfo, batch:batchId, nameOf, report:rep, notionStatuses, statusMap };
  }

  /* ---------- the card inside Settings ---------- */
  const fresh = () => ({ files:{}, notes:[], mode:"add", update:{}, ch:{ keepConnections:true, statusMap:{ ...DEFAULT_LOT_STATUS }, addOpts:{} }, result:null, done:null, err:null, busy:false, batch:null });
  const st = fresh();
  let box = null, data = null;
  const LABEL = { sims:"Sims", households:"Households", lots:"Lots", clubs:"Clubs" };
  const KIND_COLOR = { rom:"#B4366E", fam:"#3F6B4A", ex:"#9A6B1F", friend:"#6B4EA0", work:"#1F5AA8" };
  const AV = ["#7E6A9E", "#5C8A7A", "#A0715A", "#5A6E9E", "#43536B", "#9E5A6E", "#6B7E4E", "#8A6B3F"];
  const avBg = id => AV[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
  const ini = n => stripNick(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const newBatch = () => "imp-" + Date.now().toString(36);

  function compute() {
    st.result = null; if (!Object.keys(st.files).length) return;
    try {
      const T = Object.fromEntries(Object.entries(st.files).map(([k, v]) => [k, v.rows]));
      st.result = build(T, { sims:data.sims, relationships:data.relationships, links:GFB.registry.all(), moved:GFB.registry.isMoved(), lots:data.lots, organizations:data.organizations, options:data.options, lot_options:data.lot_options },
        { ...st.ch, mode:st.mode, update:st.update, batch:st.batch });
    } catch (err) { st.err = "Couldn't read those files: " + err.message; }
  }
  const plural = (n, a, b) => n === 1 ? a : (b || a + "s");

  /* a link written out in plain words */
  function linkText(r, l) {
    const nm = id => id ? stripNick(r.nameOf(id)) : "", fn = id => first(r.nameOf(id));
    const A = nm(l.a), B = l.b ? nm(l.b) : `${l.name} (file pending)`;
    if (l.kind === "fam" && l.family === "parent" && l.b) return [`${A} is ${fn(l.b)}'s parent`, [l.bio && "Biological", l.raised && "Raised them", l.adoptive && "Adoptive"].filter(Boolean).join(", ")];
    if (l.kind === "fam" && l.family === "sibling") return [`${A} and ${B}`, "Siblings"];
    if (l.kind === "fam") return [`${A} and ${B}`, l.al || "Family"];
    return [`${A} and ${B}`, `${l.al || (l.kind === "ex" ? "Ex" : "Connected")}, date not set`];
  }
  function simLine(a) {
    const bits = [a.age];
    if (a.parents.length) bits.push("Parents: " + a.parents.map(x => stripNick(x)).join(", "));
    else if (a.spouse.length) bits.push("Spouse: " + a.spouse.map(stripNick).join(", "));
    else if (a.dating.length) bits.push("Dating: " + a.dating.map(stripNick).join(", "));
    else if (a.career) bits.push(a.career);
    return bits.filter(Boolean).join(" · ");
  }

  function flagBlock(title, items) { return items.length ? `<details class="ni-flag"><summary>${esc(title)} <b>${items.length}</b></summary><ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""; }
  function unknownBlock(f) {
    return f.unknown.length ? `<details class="ni-flag" ${f.unknown.length < 6 ? "open" : ""}><summary>New traits and aspirations to add to your lists <b>${f.unknown.length}</b></summary><div class="ni-map"><span class="st-note" style="margin:0">These aren't in SimDesk's lists yet. Untick any you don't want added.</span>${f.unknown.map(u => `<label class="ni-check"><input type="checkbox" data-opt="${esc(u.key + "|" + u.value)}" ${u.add ? "checked" : ""}> ${esc(u.value)} <em>${u.key === "traits" ? "trait" : "aspiration"}</em></label>`).join("")}</div></details>` : "";
  }

  function addPreview(r) {
    const rep = r.report, c = rep.counts, f = rep.flags, n = rep.addList.length, upN = Object.keys(r.payload.update).length;
    const total = n + upN;
    return `<div class="card ni-card"><h3>Preview</h3>
      <div class="ni-sum"><div><b>${n}</b><small>new ${plural(n, "Sim")}</small></div><div><b>${c.connectionsAdded}</b><small>new ${plural(c.connectionsAdded, "connection")}</small></div><div class="zero"><b>0</b><small>removed</small></div></div>
      ${n ? `<div class="ni-grp"><h4>New Sims</h4>${rep.addList.map(a => `<div class="ni-sim"><span class="ni-av" style="background:${avBg(a.id)}">${esc(ini(a.name))}</span><div><b>${esc(stripNick(a.name))}</b><small>${esc(simLine(a))}</small></div><span class="ni-fno">GFB-${esc(a.file_no)}</span></div>`).join("")}</div>` : `<p class="st-note">No new Sims in this file. Everyone in it is already in SimDesk.</p>`}
      ${rep.existing.length ? `<div class="ni-grp"><h4>Already in SimDesk</h4>${rep.existing.map(x => `<div class="ni-sim"><span class="ni-av" style="background:${avBg(x.id)}">${esc(ini(x.name))}</span><div><b>${esc(stripNick(x.name))}</b><small>${st.update[x.id] ? "The file's version fills in anything it has" : "Your SimDesk file stays as it is"}</small></div><span class="ni-seg" role="group" aria-label="${esc(x.name)}"><button type="button" class="${st.update[x.id] ? "" : "on"}" data-upd="${x.id}:0">Skip</button><button type="button" class="${st.update[x.id] ? "on" : ""}" data-upd="${x.id}:1">Update from file</button></span></div>`).join("")}</div>` : ""}
      ${rep.linkText.length ? `<div class="ni-grp"><h4>New connections</h4>${rep.linkText.map(l => { const [a, b] = linkText(r, l); return `<div class="ni-link"><i style="background:${KIND_COLOR[l.kind] || "#888"}"></i>${esc(a)}<small>${b ? " · " + esc(b) : ""}</small></div>`; }).join("")}${c.alreadyConnected ? `<p class="st-note" style="margin:6px 0 0">${c.alreadyConnected} ${plural(c.alreadyConnected, "connection was", "connections were")} already in SimDesk, so nothing was added for ${plural(c.alreadyConnected, "it", "them")}.</p>` : ""}</div>` : ""}
      ${!GFB.registry.isMoved() && rep.linkText.length ? `<div class="ni-info">Your Registry hasn't moved to its new tables yet, so these connections are saved in the old list for now. They come across with the move.</div>` : ""}
      <div class="ni-info"><b>Status:</b> Housed or Homeless comes from the address now, so none of these need a status. Placement is saved in the background, and the pipeline Status column is ignored.</div>
      ${flagBlock("Shared last names (families are fine; check the rest)", f.collisions)}${unknownBlock(f)}${flagBlock("More than five traits", f.tooManyTraits)}${flagBlock("Connections that disagree (skipped)", f.conflicts)}${flagBlock("Possible duplicates in your lists (imported as written)", f.near)}
      ${rep.renames.length ? `<p class="st-note">Locked renames applied: ${esc(rep.renames.join("; "))}</p>` : ""}
      ${Object.keys(rep.skipped).length ? `<p class="st-note">Not imported (no place for them yet): ${Object.entries(rep.skipped).map(([k, v]) => `${k} (${v})`).join(", ")}</p>` : ""}
      ${Object.keys(st.files).some(k => k !== "sims") ? `<p class="st-note">Add mode only reads the Sims file. Lots, households and clubs files are left alone. Pick Replace everything to use them.</p>` : ""}
      <div class="ni-actions"><button class="st-btn" data-ni="backup">Download a backup first</button><button class="st-btn ni-add" data-ni="go" ${total ? "" : "disabled"}>${total ? `Add ${n} ${plural(n, "Sim")}${upN ? ` and update ${upN}` : ""}` : "Nothing to add"}</button></div></div>`;
  }

  function replacePreview(r) {
    const rep = r.report, c = rep.counts, f = rep.flags;
    return `<div class="card ni-card"><h3>Preview</h3>
        <table class="ni-table"><tbody>
          ${st.files.sims ? `<tr><td>Sims</td><td>${c.simsNew} new, ${c.simsMatched} already in SimDesk (updated from the file)</td></tr>` : ""}
          ${rep.removedSims.length && st.files.sims ? `<tr><td>Removed</td><td>${rep.removedSims.length} current Sims aren't in your file: ${esc(rep.removedSims.join(", "))}</td></tr>` : ""}
          ${st.files.sims ? `<tr><td>Connections</td><td>${c.connectionsAdded} added from the Spouse, Dating, Ex, and family columns${st.ch.keepConnections ? `, ${c.connectionsKept} kept` : ""}${c.connectionsRemoved ? `, ${c.connectionsRemoved} ${st.ch.keepConnections ? "removed because a Sim isn't in the file" : "removed"}` : ""}</td></tr>` : ""}
          ${st.files.lots ? `<tr><td>Lots</td><td>${c.lots}</td></tr>` : ""}${st.files.households ? `<tr><td>Households</td><td>${c.households}</td></tr>` : ""}
          ${st.files.clubs ? `<tr><td>Clubs</td><td>${c.clubsNew} new, ${c.clubsUpdated} updated</td></tr><tr><td>Institutions</td><td>${c.instNew} new, ${c.instUpdated} updated</td></tr>` : ""}
          ${rep.droppedOrgs.length && st.files.clubs ? `<tr><td>Removed</td><td>Not in your Clubs database: ${esc(rep.droppedOrgs.join(", "))}</td></tr>` : ""}
          ${!st.files.lots ? `<tr><td>Lots</td><td>No Lots file, so your current lots stay as they are${rep.relinked ? `. ${rep.relinked} re-linked to renamed households.` : ""}</td></tr>` : ""}
        </tbody></table>
        <label class="ni-check"><input type="checkbox" id="ni-keep" ${st.ch.keepConnections ? "checked" : ""}> Keep the connections I've already written in SimDesk (recommended; their secrets and history only exist here)</label>
        ${r.notionStatuses.length ? `<div class="ni-map"><b>Lot status in SimDesk</b>${r.notionStatuses.map(s => `<label>${esc(s)} becomes <select data-lotstatus="${esc(s)}">${["Proposed","Permits approved","Under construction","Built"].map(o => `<option ${r.statusMap[s] === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>`).join("")}</div>` : ""}
        <div class="ni-info"><b>Status:</b> Housed or Homeless comes from the address now. Placement is saved in the background, and the pipeline Status column is ignored.</div>
        ${unknownBlock(f)}${flagBlock("Possible duplicates in your lists (imported as written)", f.near)}${flagBlock("Shared first or last names (families are fine; check the rest)", f.collisions)}${flagBlock("More than five traits", f.tooManyTraits)}${flagBlock("Connections that disagree (skipped)", f.conflicts)}
        ${rep.renames.length ? `<p class="st-note">Locked renames applied: ${esc(rep.renames.join("; "))}</p>` : ""}
        ${Object.keys(rep.skipped).length ? `<p class="st-note">Not imported (no place for them yet): ${Object.entries(rep.skipped).map(([k, v]) => `${k} (${v})`).join(", ")}</p>` : ""}
        <p class="st-note"><b>This replaces</b> ${[st.files.sims && "the Sims and connections", st.files.clubs && "the clubs and institutions", st.files.lots && "the lots", st.files.households && "the households"].filter(Boolean).join(", ")} in SimDesk with what's above. Everything else stays as it is. A backup you can undo from is kept automatically.</p>
        <div class="ni-actions"><button class="st-btn" data-ni="backup">Download a backup first</button><button class="st-btn ni-go" data-ni="go">Replace my data</button></div></div>`;
  }

  function draw() {
    if (!box) return;
    const r = st.result, files = Object.entries(st.files);
    const fileRows = files.map(([k, v]) => `<div class="ni-file"><span class="ic">CSV</span><div><b>${esc(v.name)}</b><small>${v.rows.length} ${plural(v.rows.length, "row")} · ${LABEL[k]}${k === "sims" ? " · SimDesk template" : ""}</small></div></div>`).join("");
    const modes = `<div class="ni-modes" role="radiogroup" aria-label="How to import">
      <button type="button" class="ni-mode ${st.mode === "add" ? "on" : ""}" role="radio" aria-checked="${st.mode === "add"}" data-mode="add"><span class="tag">Default</span><b><span class="rad"></span>Add these Sims</b><small>Adds the new Sims to your cast. Nobody is removed and nothing you've written changes.</small></button>
      <button type="button" class="ni-mode ${st.mode === "replace" ? "on" : ""}" role="radio" aria-checked="${st.mode === "replace"}" data-mode="replace"><b><span class="rad"></span>Replace everything</b><small>Your full export replaces the Sims in SimDesk. Sims not in the file are removed.</small></button></div>`;
    box.innerHTML = `<h2>Import Sims</h2>
      <p class="st-note" style="margin:0 0 12px">Drop a Sims CSV here (the SimDesk template, or an export from Notion). You'll see a preview first. Nothing changes until you confirm.</p>
      <label class="st-drop" id="ni-drop">${st.busy ? "Reading..." : files.length ? `<b>Change file</b><span>or drop other CSV files here</span>` : `<b>Drop the CSV files here</b><span>or tap to choose them (you can pick several at once)</span>`}<input type="file" accept=".csv,text/csv" multiple id="ni-file"></label>
      ${st.err ? `<p class="st-err">${esc(st.err)}</p>` : ""}${st.notes.map(n => `<p class="st-note">${esc(n)}</p>`).join("")}
      ${fileRows}${files.length ? modes : ""}
      ${r ? (st.mode === "add" ? addPreview(r) : replacePreview(r)) : ""}
      ${st.done ? doneBlock() : (GFB.canUndoImport() && !r ? `<div class="ni-actions"><button class="st-btn" data-ni="undo">Undo the last import</button></div>` : "")}`;
    st.err = null;
  }
  function doneBlock() {
    const d = st.done;
    return `<div class="ni-done"><b>${esc(d.title)}</b> ${esc(d.line)}${d.list.length ? `<ul>${d.list.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${d.warn ? `<p class="st-note" style="margin:8px 0 0">${esc(d.warn)}</p>` : ""}
      <div class="ni-actions" style="justify-content:flex-start">${d.ids && d.ids.length ? `<button class="st-btn ni-add" data-ni="open">Open them in the Registry</button>` : ""}<button class="st-btn" data-ni="undo">Undo this import</button></div></div>`;
  }

  async function readFiles(files) {
    st.busy = true; st.notes = []; draw();
    for (const f of files) {
      try {
        const { head, rows } = parseCSV(await f.text()), kind = detect(head);
        if (!kind) { st.notes.push(`Skipped ${f.name}: I couldn't tell which database it is.`); continue; }
        if (!st.files[kind] || rows.length >= st.files[kind].rows.length) st.files[kind] = { name:f.name, rows };
      } catch (err) { st.notes.push(`Couldn't read ${f.name}: ${err.message}`); }
    }
    st.busy = false; st.batch = newBatch(); st.update = {}; data = await GFB.getAll(); compute(); draw();
  }

  async function go(btn) {
    const r = st.result; if (!r) return;
    const add = r.mode === "add", n = r.report.addList.length;
    if (!UI.confirmTap(btn, add ? `Tap again to add ${n} ${plural(n, "Sim")}` : "Tap again to replace my data")) return;
    btn.disabled = true;
    let warn = "";
    try {
      const reg = GFB.registry, moved = reg.isMoved(), cloud = reg.ready();
      if (add) await GFB.importAdd(r.payload); else await GFB.importReplace(r.payload);
      try {
        if (moved) await reg.applyImport({ insert:r.links.insert, remove:r.links.remove.map(l => l.id), repoint:r.links.repoint.map(x => ({ id:x.id, b_sim:x.b_sim })), simInfo:r.simInfo, batch:st.batch });
        else if (cloud && Object.keys(r.simInfo).length) await reg.applyImport({ simInfo:r.simInfo, batch:st.batch });
        else if (Object.keys(r.simInfo).length) warn = "Townie and Summary need the cloud connection, so they weren't saved this time.";
      } catch (err) { try { await GFB.undoImport(); } catch {} throw err; }
      const c = r.report.counts, ids = r.report.addList.map(a => a.id);
      window.SimDeskLastImport = { batch:st.batch, ids };
      data = await GFB.getAll();
      if (add) {
        const upN = Object.keys(r.payload.update).length, skipped = r.report.existing.filter(x => !st.update[x.id]).map(x => stripNick(x.name));
        st.done = { title:`Added ${n} ${plural(n, "Sim")} and ${c.connectionsAdded} ${plural(c.connectionsAdded, "connection")}.`, line:`Nobody was removed. You now have ${data.sims.length} residents.`, ids, batch:st.batch,
          list:[r.report.addList.length ? r.report.addList.map(a => `${stripNick(a.name)} (GFB-${a.file_no})`).join(", ") : null, upN ? `Updated ${upN} from the file: ${r.report.existing.filter(x => st.update[x.id]).map(x => stripNick(x.name)).join(", ")}` : null, skipped.length ? `Skipped ${skipped.join(", ")} (already in SimDesk)` : null].filter(Boolean), warn };
      } else {
        st.done = { title:"Done.", line:[st.files.sims && `${c.sims} Sims and ${c.connectionsAdded + c.connectionsKept} connections`, st.files.clubs && `${(c.clubsNew || 0) + (c.clubsUpdated || 0)} clubs and ${(c.instNew || 0) + (c.instUpdated || 0)} institutions`, st.files.lots && `${c.lots} lots`, st.files.households && `${c.households} households`].filter(Boolean).join(", ") + " imported.", ids:[], list:[], warn };
      }
      st.files = {}; st.result = null; st.update = {};
    } catch (err) { st.err = err.message; }
    draw();
  }

  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => box && box.contains(t);
    document.addEventListener("change", e => {
      if (!mine(e.target)) return;
      if (e.target.id === "ni-file") readFiles([...e.target.files]);
      else if (e.target.id === "ni-keep") { st.ch.keepConnections = e.target.checked; compute(); draw(); }
      else if (e.target.dataset.lotstatus) { st.ch.statusMap[e.target.dataset.lotstatus] = e.target.value; compute(); draw(); }
      else if (e.target.dataset.opt) { st.ch.addOpts[e.target.dataset.opt] = e.target.checked; compute(); draw(); }
    });
    document.addEventListener("dragover", e => { const d = mine(e.target) && e.target.closest("#ni-drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
    document.addEventListener("dragleave", e => { const d = mine(e.target) && e.target.closest("#ni-drop"); if (d) d.classList.remove("over"); });
    document.addEventListener("drop", e => { const d = mine(e.target) && e.target.closest("#ni-drop"); if (d) { e.preventDefault(); readFiles([...e.dataTransfer.files]); } });
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const m = e.target.closest("[data-mode]"); if (m) { st.mode = m.dataset.mode; compute(); draw(); return; }
      const u = e.target.closest("[data-upd]"); if (u) { const [id, v] = u.dataset.upd.split(":"); if (v === "1") st.update[id] = true; else delete st.update[id]; compute(); draw(); return; }
      const b = e.target.closest("[data-ni]"); if (!b) return;
      if (b.dataset.ni === "go") go(b);
      if (b.dataset.ni === "open") { location.hash = "#/registry/batch:" + st.done.batch; }
      if (b.dataset.ni === "backup") {
        const blob = new Blob([JSON.stringify(GFB.exportEdits())], { type:"application/json" }), a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "simdesk-backup.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      if (b.dataset.ni === "undo") { try { await GFB.undoImport(); data = await GFB.getAll(); st.done = null; st.notes = ["The import was undone."]; } catch (err) { st.err = err.message; } draw(); }
    });
  }

  function mount(el, d) { box = el; data = d; bind(); draw(); }
  return { mount, build, parseCSV, detect };
})();
