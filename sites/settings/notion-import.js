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
    const statusMap = { ...DEFAULT_LOT_STATUS, ...(ch.statusMap || {}) };
    const keepConn = ch.keepConnections !== false;
    const rep = { counts:{}, renames:[], removedSims:[], skipped:{}, flags:{ unknown:[], near:[], collisions:[], conflicts:[], tooManyTraits:[], badStatus:[] }, notes:[] };
    const renameOf = n => LOCKED[norm(n)] || n;

    /* --- Sims --- */
    const simRows = (T.sims || []).filter(r => r.Name);
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
    E.forEach(e => { idByNorm.set(norm(e.name), e.id); idByQ.set(normQ(e.name), e.id); });
    const findId = n => { n = renameOf(n); return idByNorm.get(norm(n)) || idByQ.get(normQ(n)) || null; };
    const simKnown = n => !!findId(n);
    const target = n => { const id = findId(n); return id ? { id } : { name: renameOf(n) }; };

    const optVals = { traits:[], aspiration:[], likes:[], dislikes:[], turn_ons:[], turn_offs:[] };
    const sims = E.map(e => {
      const r = e.r, traits = list(r.Traits);
      if (traits.length > 5) rep.flags.tooManyTraits.push(`${e.name} has ${traits.length} traits`);
      if (r.Status && ex.options.status && !ex.options.status.includes(r.Status)) rep.flags.badStatus.push(`${e.name}: status "${r.Status}"`);
      const s = { id:e.id, file_no:e.file_no, name:e.name, simsta:r["Simsta Handle"] || null, age:num(r["Age (#)"]), life_stage:r.Age || null, gender:r.Gender || null,
        career:r.Career || "", residence:dropState(r.Location), household:cleanRel(r.Household) || null, status:r.Status || null,
        traits, aspiration:r.Aspiration || null, attachment:r["Attachment Style"] || null, love_language:r["Love Language"] || null, balance:null,
        likes:list(r.Likes), dislikes:list(r.Dislikes), turn_ons:list(r["Turn Ons"]), turn_offs:list(r["Turn Offs"]),
        notes:paras(r["Backstory/Notes"]), secrets:e.old ? (e.old.secrets || []) : [] };
      optVals.traits.push(...s.traits); if (s.aspiration) optVals.aspiration.push(s.aspiration);
      for (const k of Object.keys(PREF)) optVals[k].push(...s[k]);
      for (const col of ["Portrait","Screenshots","Checking Balance","Fave","Phase","Tags"]) if (r[col] && !/^(no|0)$/i.test(r[col])) rep.skipped[col] = (rep.skipped[col] || 0) + 1;
      return s;
    });
    rep.removedSims = ex.sims.filter(s => !idByNorm.has(norm(s.name))).map(s => s.name);

    /* name rule: no duplicate first or last names */
    const group = (arr, fn) => { const m = new Map(); arr.forEach(s => { const k = fn(s.name).toLowerCase(); if (k) m.set(k, [...(m.get(k) || []), s.name]); }); return [...m.values()].filter(g => g.length > 1); };
    group(sims, first).forEach(g => rep.flags.collisions.push("Same first name: " + g.join(", ")));
    group(sims, last).forEach(g => rep.flags.collisions.push("Same last name: " + g.join(", ")));

    /* --- Connections from Spouse / Dating / Ex / Parents / Children / Siblings --- */
    const SPEC = [["Spouse","rom","Spouse","Spouse"],["Dating","rom","Dating","Dating"],["Ex","ex","Ex","Ex"],["Parents","fam","Parent","Child"],["Children","fam","Child","Parent"],["Siblings","fam","Sibling","Sibling"]];
    const rows = []; const byKey = new Map(); let rn = 0;
    const keptIds = new Set(sims.map(s => s.id));
    if (keepConn) ex.relationships.forEach(r => { if (keptIds.has(r.from_sim) && (!r.to_sim || keptIds.has(r.to_sim))) { rows.push(r); if (r.to_sim) byKey.set(r.from_sim + ">" + r.to_sim, r); } });
    /* connections to someone who used to be "file pending" now point at the filed Sim, and get a mirror if they lack one */
    rows.slice().forEach(r => {
      if (!r.to_sim && r.to_name) { const id = findId(r.to_name); if (id) { r.to_sim = id; r.to_name = null; byKey.set(r.from_sim + ">" + id, r);
        if (!byKey.has(id + ">" + r.from_sim)) { const mb = { id:"rel-i" + (++rn), from_sim:id, to_sim:r.from_sim, to_name:null, kind:r.kind, label:r.label, secret:null, hidden:!!r.hidden, pair:r.id }; r.pair = mb.id; rows.push(mb); byKey.set(id + ">" + r.from_sim, mb); } } }
    });
    const keptCount = rows.length;
    const mk = (from, t, kind, label) => ({ id:"rel-i" + (++rn), from_sim:from, to_sim:t.id || null, to_name:t.id ? null : t.name, kind, label, secret:null, hidden:false, pair:null });
    for (const e of E) for (const [col, kind, labAB, labBA] of SPEC) {
      for (const nm of splitKnown(e.r[col], simKnown)) {
        const t = target(nm);
        if (!t.id) { if (!rows.some(x => x.from_sim === e.id && x.to_name === t.name && x.label === labAB)) rows.push(mk(e.id, t, kind, labAB)); continue; }
        if (t.id === e.id) continue;
        const kAB = e.id + ">" + t.id, kBA = t.id + ">" + e.id, a = byKey.get(kAB), b = byKey.get(kBA);
        if (a) { if (a.label !== labAB && String(a.id).startsWith("rel-i")) rep.flags.conflicts.push(`${e.name} and ${nm}: "${a.label}" and "${labAB}"`); continue; }  /* already there: kept, or added from the other Sim's row */
        const ra = mk(e.id, t, kind, labAB); rows.push(ra); byKey.set(kAB, ra);
        if (!b) { const rb = mk(t.id, { id:e.id }, kind, labBA); rb.pair = ra.id; ra.pair = rb.id; rows.push(rb); byKey.set(kBA, rb); }
      }
    }
    rep.counts.connectionsKept = keptCount; rep.counts.connectionsAdded = rows.length - keptCount;

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
    return { payload:{ sims, relationships:rows, lots, households, organizations:orgs, options, lot_options:lotOptions }, report:rep, notionStatuses, statusMap };
  }

  /* ---------- the card inside Settings ---------- */
  const st = { files:{}, notes:[], ch:{ keepConnections:true, statusMap:{ ...DEFAULT_LOT_STATUS }, addOpts:{} }, result:null, done:null, err:null, busy:false };
  let box = null, data = null;
  const LABEL = { sims:"Sims", households:"Households", lots:"Lots", clubs:"Clubs" };

  function compute() {
    st.result = null; if (!Object.keys(st.files).length) return;
    try { st.result = build(Object.fromEntries(Object.entries(st.files).map(([k, v]) => [k, v.rows])), { sims:data.sims, relationships:data.relationships, lots:data.lots, organizations:data.organizations, options:data.options, lot_options:data.lot_options }, st.ch); }
    catch (err) { st.err = "Couldn't read those files: " + err.message; }
  }

  function draw() {
    if (!box) return;
    const r = st.result, rep = r && r.report, c = rep && rep.counts, f = rep && rep.flags;
    const fileList = Object.entries(st.files).map(([k, v]) => `<li>${LABEL[k]}: ${v.rows.length} rows <span>${esc(v.name)}</span></li>`).join("");
    const flagBlock = (title, items) => items.length ? `<details class="ni-flag"><summary>${esc(title)} <b>${items.length}</b></summary><ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>` : "";
    box.innerHTML = `<h2>Import from Notion</h2>
      <p class="st-note" style="margin:0 0 12px">Export your Sims, Households, Lots, and Clubs from Notion (Export, then Markdown &amp; CSV), unzip, and drop the CSV files here. You'll see a preview first. Nothing changes until you confirm.</p>
      <label class="st-drop" id="ni-drop">${st.busy ? "Reading..." : `<b>Drop the CSV files here</b><span>or tap to choose them (you can pick several at once)</span>`}<input type="file" accept=".csv,text/csv" multiple id="ni-file"></label>
      ${st.err ? `<p class="st-err">${esc(st.err)}</p>` : ""}${st.notes.map(n => `<p class="st-note">${esc(n)}</p>`).join("")}
      ${fileList ? `<ul class="ni-files">${fileList}</ul>` : ""}
      ${r ? `<div class="ni-preview"><h3>Preview</h3>
        <table class="ni-table"><tbody>
          ${c.sims !== undefined && st.files.sims ? `<tr><td>Sims</td><td>${c.simsNew} new, ${c.simsMatched} already in SimDesk (updated from Notion)</td></tr>` : ""}
          ${rep.removedSims.length && st.files.sims ? `<tr><td>Removed</td><td>${rep.removedSims.length} current Sims aren't in your export: ${esc(rep.removedSims.join(", "))}</td></tr>` : ""}
          ${st.files.sims ? `<tr><td>Connections</td><td>${c.connectionsAdded} added from Spouse, Dating, Ex, and family columns${st.ch.keepConnections ? `, ${c.connectionsKept} kept` : ""}</td></tr>` : ""}
          ${st.files.lots ? `<tr><td>Lots</td><td>${c.lots}</td></tr>` : ""}${st.files.households ? `<tr><td>Households</td><td>${c.households}</td></tr>` : ""}
          ${st.files.clubs ? `<tr><td>Clubs</td><td>${c.clubsNew} new, ${c.clubsUpdated} updated</td></tr><tr><td>Institutions</td><td>${c.instNew} new, ${c.instUpdated} updated</td></tr>` : ""}
          ${rep.droppedOrgs.length && st.files.clubs ? `<tr><td>Removed</td><td>Not in your Notion Clubs database: ${esc(rep.droppedOrgs.join(", "))}</td></tr>` : ""}
          ${!st.files.lots ? `<tr><td>Lots</td><td>No Lots file, so your current lots stay as they are${rep.relinked ? `. ${rep.relinked} re-linked to renamed households.` : ""}</td></tr>` : ""}
        </tbody></table>
        <label class="ni-check"><input type="checkbox" id="ni-keep" ${st.ch.keepConnections ? "checked" : ""}> Keep the connections I've already written in SimDesk (recommended; their secrets and wording only exist here)</label>
        ${r.notionStatuses.length ? `<div class="ni-map"><b>Lot status in SimDesk</b>${r.notionStatuses.map(s => `<label>${esc(s)} becomes <select data-lotstatus="${esc(s)}">${["Proposed","Permits approved","Under construction","Built"].map(o => `<option ${r.statusMap[s] === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>`).join("")}</div>` : ""}
        ${f.unknown.length ? `<div class="ni-map"><b>New traits and aspirations</b><span class="st-note">These aren't in SimDesk's lists yet. Untick any you don't want added.</span>${f.unknown.map(u => `<label class="ni-check"><input type="checkbox" data-opt="${esc(u.key + "|" + u.value)}" ${u.add ? "checked" : ""}> ${esc(u.value)} <em>${u.key === "traits" ? "trait" : "aspiration"}</em></label>`).join("")}</div>` : ""}
        ${flagBlock("Possible duplicates in your lists (imported as written)", f.near)}${flagBlock("Shared first or last names (families are fine; check the rest)", f.collisions)}${flagBlock("More than five traits", f.tooManyTraits)}${flagBlock("Status SimDesk doesn't have", f.badStatus)}${flagBlock("Connections that disagree (skipped)", f.conflicts)}
        ${rep.renames.length ? `<p class="st-note">Locked renames applied: ${esc(rep.renames.join("; "))}</p>` : ""}
        ${Object.keys(rep.skipped).length ? `<p class="st-note">Not imported (no place for them yet): ${Object.entries(rep.skipped).map(([k, v]) => `${k} (${v})`).join(", ")}</p>` : ""}
        <p class="st-note"><b>This replaces</b> the Sims, connections, clubs and institutions${st.files.lots ? ", lots" : ""}${st.files.households ? ", households" : ""} in SimDesk with what's above. Photos and the placeholder content are gone.</p>
        <div class="ni-actions"><button class="st-btn" data-ni="backup">Download a backup first</button><button class="st-btn ni-go" data-ni="go">Replace my data</button></div></div>` : ""}
      ${st.done ? `<div class="ni-done"><b>Done.</b> ${esc(st.done)}<div class="ni-actions"><button class="st-btn" data-ni="undo">Undo this import</button></div></div>` : (GFB.canUndoImport() && !r ? `<div class="ni-actions"><button class="st-btn" data-ni="undo">Undo the last import</button></div>` : "")}`;
    st.err = null;
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
    st.busy = false; data = await GFB.getAll(); compute(); draw();
  }

  async function go(btn) {
    if (!UI.confirmTap(btn, "Tap again to replace my data")) return;
    try {
      const r = st.result;
      await GFB.importReplace(r.payload);
      const c = r.report.counts;
      st.done = `${c.sims || 0} Sims, ${c.connectionsAdded + c.connectionsKept} connections, ${(c.clubsNew || 0) + (c.clubsUpdated || 0)} clubs, ${(c.instNew || 0) + (c.instUpdated || 0)} institutions.`;
      st.files = {}; st.result = null; data = await GFB.getAll();
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
      const b = e.target.closest("[data-ni]"); if (!b) return;
      if (b.dataset.ni === "go") go(b);
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
