/* The Registry. Reads and saves everything through GFB (assets/data.js).
   Three tabs (Profile, Connections, File). One "Edit file" mode makes the whole file editable, with one Save bar.
   Connections are one record per link in their own tables (GFB.registry); each Sim keeps their own label.
   Until the one-time move runs, connections show from the old list, read only, with a banner to check the counts and move. */
const Registry = (() => {
  const st = { q:"", filter:"All", where:"", sort:"name", tab:"profile", editing:false, draft:null, focus:null, openLink:null, sheet:null, hideSecrets:false,
    creating:false, msg:"", err:false, move:null, batch:null, oldOpen:false, lists:false, busy:false, tl:{ filter:"all", add:null, edit:null } };
  let data = null, curId = null, root = null;

  const LIFE_STAGES = ["Infant","Toddler","Child","Teen","Young Adult","Adult","Elder"];
  const KINDS = [["rom","Romance"],["fam","Family"],["ex","Ex"],["friend","Friend"],["work","Work"]];
  const GROUPS = [["rom","Romance"],["fam","Family"],["ex","Exes"],["friend","Friends"],["work","Work"]];
  const HIST_SUGGEST = ["Met","Dating","Engaged","Married","Split","Divorced","Broke up","Got back together","Matched on Slide","Moved in","Best friends","Coworkers","Adopted"];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").trim();
  const initials = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();
  const first = n => stripNick(n).split(" ")[0];
  const hue = s => { let h = 0; for (const c of String(s)) h = (h*31 + c.charCodeAt(0)) % 360; return h; };
  const avColor = name => `hsl(${215 + hue(name)%30 - 15} 22% ${32 + hue(name)%14}%)`;
  const avSq = (name, photo) => photo ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async">` : `<span style="background:${avColor(name)}">${esc(initials(name))}</span>`;
  const money = n => n == null || n === "" ? null : "$" + Number(n).toLocaleString("en-US");
  const simById = id => data.sims.find(s => s.id === id);
  const findSim = txt => { const t = String(txt || "").trim().toLowerCase(); if (!t) return null; return data.sims.find(x => x.name.toLowerCase() === t || stripNick(x.name).toLowerCase() === t); };
  const R = () => GFB.registry;
  const linksFor = id => R().linksOf(id);
  const PREF_KEYS = [["likes","Likes"],["dislikes","Dislikes"],["turn_ons","Turn ons"],["turn_offs","Turn offs"]];
  const LIST_KEYS = [...PREF_KEYS, ["traits","Traits"],["aspiration","Aspirations"]];
  const used = field => [...new Set(data.sims.flatMap(x => Array.isArray(x[field]) ? x[field] : [x[field]]).filter(Boolean))].sort();
  const menu = key => [...new Set([...(data.options[key] || []), ...used(key)])].sort((a,b) => a.localeCompare(b));
  const attrOpts = key => [...new Set(["Opposite sex", "Same sex", "Both", ...((data.tossup && data.tossup.decks) || []).filter(d => d.registry === key).flatMap(d => (d.outcomes || []).map(o => o.label))])];
  const pron = s => /^m/i.test(s.gender || "") ? "he" : /^f/i.test(s.gender || "") ? "she" : "they";
  const cal = () => data.calendar;
  const gLabel = d => d && typeof d === "object" ? (d.before ? "Before the save started" : `${d.season}, day ${d.day}, Year ${d.year}`) : "";
  const gShort = d => d && typeof d === "object" ? (d.before ? "Before save" : `${d.season} ${d.day}, Y${d.year}`) : "No date";

  /* ---------- property and status ---------- */
  const RESIDENTIAL = ["Apartment","Residential","Residential Rental"];
  const lots = () => data.lots || [];
  const homeOf = s => GFB.homeOf(s, data);
  const statusOf = s => GFB.statusOf(s, data);
  const ownedBy = s => lots().filter(l => (l.owner_sim && l.owner_sim === s.id) || (!l.owner_sim && l.owner && l.owner === stripNick(s.name)));
  const lotLabel = l => { const p = l.parent_id ? lots().find(x => x.id === l.parent_id) : null; const d = l.district || (p || {}).district; return l.address + (d ? ", " + d : ""); };
  const households = () => [...new Set([...(data.households || []).map(h => h.name), ...data.sims.map(x => x.household), ...lots().map(l => l.household)].filter(Boolean))].sort((a, b) => a.localeCompare(b));

  /* activity, read only here */
  const calEvents = s => ((data.calendar || {}).events || []).filter(e => (e.sims || []).includes(s.id));
  const calLogs = s => ((data.calendar || {}).logs || []).filter(l => (l.sims || []).includes(s.id)).sort((a,b) => b.year - a.year);
  const seasonOrder = n => ((data.calendar || {}).seasons || []).findIndex(x => x.name === n);
  const calLink = (season, day) => `#/calendar/${season}/${season}/${day}`;
  const plans = s => (data.todos || []).filter(t => t.app === "plumb" && (t.sims || []).includes(s.id)).sort((a,b) => a.done - b.done);
  const postsBy = s => (data.posts || []).filter(p => String(p.author || "").split("~")[0] === s.id);
  const orgsOf = s => (data.organizations || []).filter(o => (o.members || []).some(m => m.current !== false && ((m.sim === s.id) || (!m.sim && m.name && stripNick(m.name).toLowerCase() === stripNick(s.name).toLowerCase()))));

  /* the Incomplete filter (status is never a gap now) */
  function gaps(s){
    const g = [], open = 5 - (s.traits || []).length;
    if (open > 0) g.push("traits");
    if (!s.aspiration) g.push("aspiration");
    if (!s.love_language) g.push("love_language");
    if (!s.attachment) g.push("attachment");
    if (!s.simsta) g.push("simsta");
    if (!s.household) g.push("household");
    return g;
  }

  /* ---------- gallery ---------- */
  const places = () => [...new Set(data.sims.map(s => s.residence).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  function visible(){
    const q = st.q.toLowerCase(), batch = st.batch ? new Set(st.batch.ids) : null;
    return data.sims.filter(s => {
      if (batch && !batch.has(s.id)) return false;
      if (st.filter === "Incomplete" && !gaps(s).length) return false;
      if (["Housed","Homeless","Townie"].includes(st.filter) && statusOf(s) !== st.filter) return false;
      if (st.where && s.residence !== st.where) return false;
      if (!q) return true;
      return [s.name, s.career, s.residence, s.household, ...(s.traits||[]), s.attachment, s.love_language].join(" ").toLowerCase().includes(q);
    });
  }
  const SORTS = [["name","Name"],["file","File number"],["gaps","Most to fill in"],["status","Status"]];
  function sortedVisible(){
    const v = [...visible()], nm = (a, b) => stripNick(a.name).localeCompare(stripNick(b.name));
    if (st.sort === "file") v.sort((a, b) => (parseInt(a.file_no, 10) || 0) - (parseInt(b.file_no, 10) || 0));
    else if (st.sort === "gaps") v.sort((a, b) => gaps(b).length - gaps(a).length || nm(a, b));
    else if (st.sort === "status") v.sort((a, b) => statusOf(a).localeCompare(statusOf(b)) || nm(a, b));
    else v.sort(nm);
    return v;
  }
  const pill = s => { const t = statusOf(s); return `<span class="rg-pill ${t.toLowerCase()}">${t}</span>`; };
  function galCards(){
    const v = sortedVisible();
    if (!v.length) return `<p class="rg-none">No residents match. Clear the search or pick another filter.</p>`;
    return v.map(s => { const age = [s.age, s.life_stage].filter(x => x != null && x !== "").join(", ");
      return `<a class="rg-card" href="#/registry/${s.id}"><span class="rg-cph">${s.portrait ? `<img loading="lazy" decoding="async" src="${esc(s.portrait)}" alt="">` : `<b>${esc(initials(s.name))}</b>`}${pill(s)}</span>
        <span class="rg-cb"><b>${esc(s.name)}</b>${age ? `<small>${esc(age)}</small>` : ""}${s.career ? `<small>${esc(s.career)}</small>` : ""}</span></a>`; }).join("");
  }
  function pendingNames(){
    const filed = new Set(data.sims.map(s => s.name.toLowerCase()));
    return [...new Set([...R().all().filter(l => !l.b_sim && l.b_name && !l.secret).map(l => l.b_name), ...(data.pending || [])])].filter(n => !filed.has(String(n).toLowerCase())).sort();
  }
  function drawGallery(){
    const count = k => data.sims.filter(s => statusOf(s) === k).length;
    const chip = (k, label, n) => `<button class="rg-fchip" data-filter="${k}" aria-pressed="${st.filter === k}">${label}${n != null ? ` <small>${n}</small>` : ""}</button>`;
    const pend = pendingNames();
    root.innerHTML = `<div class="site-registry">${header(false)}
      <div class="rg-page">${moveBanner()}
        <div class="rg-gtools">
          <input class="rg-search" id="rg-q" type="search" placeholder="Search ${data.sims.length} residents" aria-label="Search residents" value="${esc(st.q)}">
          <div class="rg-fchips">${chip("All","All")}${chip("Housed","Housed",count("Housed"))}${chip("Homeless","Homeless",count("Homeless"))}${chip("Townie","Townies",count("Townie"))}${chip("Incomplete","Incomplete")}
            <label class="rg-fchip rg-sel ${st.where ? "on" : ""}"><span>${esc(st.where || "Where")}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><select id="rg-where" aria-label="Where"><option value="">Everywhere</option>${places().map(p => `<option ${p === st.where ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
            <label class="rg-fchip rg-sel"><span>Sort: ${esc((SORTS.find(x => x[0] === st.sort) || SORTS[0])[1])}</span><select id="rg-sort" aria-label="Sort">${SORTS.map(([k, n]) => `<option value="${k}" ${st.sort === k ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
          ${st.creating ? `<form class="rg-newform" data-sec="new"><input class="rg-input" name="name" placeholder="Full name" required autocomplete="off"><button type="button" class="rg-b quiet" data-act="cancel">Cancel</button><button class="rg-b pri">Create</button></form>` : `<button class="rg-b" data-act="new">+ New resident</button>`}
        </div>
        ${st.batch ? `<div class="rg-batch">Showing the ${st.batch.ids.length} Sims from your last import. <button class="rg-link" data-act="clearbatch">Show everyone</button></div>` : ""}
        ${st.msg ? `<p class="rg-msg ${st.err ? "err" : ""}" role="status">${esc(st.msg)}</p>` : ""}
        <div class="rg-gal" id="rg-gal">${galCards()}</div>
        ${pend.length ? `<div class="rg-pend"><h3>Awaiting processing</h3>${pend.map(p => `<button class="rg-pendchip" data-file="${esc(p)}">${esc(p)} <span>Open file</span></button>`).join("")}</div>` : ""}
      </div></div>`;
    st.msg = ""; st.err = false;
  }

  /* ---------- header and the move banner ---------- */
  const SEAL = `<span class="rg-seal" aria-hidden="true"><i></i></span>`;
  function header(slim, s){
    const upd = data.updated ? new Date(data.updated + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";
    return `<header class="rg-agency ${slim ? "slim" : ""}" id="rg-agency">${SEAL}<div><small>Simerican Office of Resident Affairs</small><b>Resident Registry</b></div>
      <div class="rg-meta"><span class="full">${data.sims.length} residents on file${upd ? `<br>Records current to ${upd}` : ""}</span>${s ? `<span class="slimonly">GFB-${esc(s.file_no)} · ${esc(s.name)}</span>` : ""}</div></header>`;
  }
  function moveBanner(){
    if (R().isMoved()) return st.move && st.move.done ? moveDone() : "";
    if (!R().ready()) return `<div class="rg-move"><b>Your Registry has a new home.</b> Sign in to SimDesk's cloud to move your connections into their own tables. Until then, connections show here read only.</div>`;
    if (R().problem()) return `<div class="rg-move err"><b>The new Registry tables aren't reachable.</b> ${esc(R().problem())}. Your connections show from the old list for now, read only.</div>`;
    if (!st.move) return `<div class="rg-move"><div><b>Your Registry is ready to move.</b> Connections get their own tables: one record per link, with dated history and one Secret checkbox. Check the counts first; nothing switches until they match.</div><button class="rg-b pri" data-act="moveplan">Check the counts</button></div>`;
    const p = R().plan(), c = p.counts, sims = data.sims, housed = sims.filter(s => statusOf(s) === "Housed").length;
    const row = (k, a, b) => `<tr><td>${k}</td><td class="n">${a}</td><td>${b}</td></tr>`;
    return `<div class="rg-move open"><h3>Moving your Registry</h3><p>What's in your save right now and where each piece goes. Nothing is deleted; the old list stays in your save as a backup.</p>
      <table><thead><tr><th>Thing</th><th class="n">Now</th><th>After the move</th></tr></thead><tbody>
      ${row("Connections", `${p.rows} rows`, `${c.links} links (each pair becomes one)`)}
      ${row("Romance / Family / Ex / Friend / Work", `${c.rom} / ${c.parent + c.sibling + c.otherFamily} / ${c.ex} / ${c.friend} / ${c.work}`, `same, ${c.parent} parent links start Biological and Raised them`)}
      ${row("Hidden (Classified) links", c.secret, "Secret checked")}
      ${row("Slide matches", c.slide, "first history entry dated from the label")}
      ${row("History entries", "none", `${c.history} (the rest say "date not set")`)}
      ${row("Case notes", `${p.caseNotes} Sims`, "word for word in Old case notes, File tab")}
      ${row("Restricted lines", `${p.restricted} on ${p.restrictedSims} Sims`, "word for word under Restricted in Old case notes")}
      ${row("Status", `${sims.length} Sims`, `${housed} Housed, ${sims.length - housed} Homeless (from the address)`)}
      </tbody></table>
      ${st.move.err ? `<p class="rg-msg err">${esc(st.move.err)}</p>` : ""}
      <div class="rg-moveacts"><button class="rg-b quiet" data-act="movecancel">Not now</button><button class="rg-b pri" data-act="movego" ${st.busy ? "disabled" : ""}>${st.busy ? "Moving..." : `Move ${c.links} links now`}</button></div></div>`;
  }
  function moveDone(){
    const k = st.move.done, ok = (a, b) => a === b ? `<span class="ok">✓ match</span>` : `<span class="bad">different</span>`;
    const row = (label, a, b) => `<tr><td>${label}</td><td class="n">${a}</td><td class="n">${b}</td><td>${ok(a, b)}</td></tr>`;
    return `<div class="rg-move open done"><h3>Moved. Every count matches.</h3>
      <table><thead><tr><th>Thing</th><th class="n">In</th><th class="n">Out</th><th></th></tr></thead><tbody>
      ${row("Old rows covered", k.in.rows, k.out.rows)}${row("Links", k.in.links, k.out.links)}${row("History entries", k.in.history, k.out.history)}${row("Secret links", k.in.secret, k.out.secret)}
      ${row("Sims with case notes", k.in.caseNotes, k.out.caseNotes)}${row("Restricted lines", k.in.restricted, k.out.restricted)}</tbody></table>
      <div class="rg-moveacts"><button class="rg-b pri" data-act="movedone">Done</button></div></div>`;
  }

  /* ---------- the file ---------- */
  const dv = (k, s) => st.editing ? st.draft[k] : (k === "summary" ? R().simInfo(s.id).summary : k === "townie" ? R().simInfo(s.id).townie : s[k]);
  function facts(s){
    const d = st.draft;
    if (!st.editing) {
      const t = statusOf(s), home = homeOf(s), none = `<span class="rg-dim">None yet</span>`;
      const why = t === "Housed" ? lotLabel(home) : t === "Townie" ? "never needs a home" : "no home address";
      const cells = [["Age", [s.age, s.life_stage].filter(x => x != null && x !== "").map(esc).join(", ") || none], ["Gender", s.gender ? esc(s.gender) : none],
        ["Occupation", s.career ? esc(s.career) : none], ["Household", s.household ? esc(s.household) : none],
        ["Status", `${pill(s)}<span class="rg-why">${esc(why)}</span>`], ["Residence", s.residence ? esc(s.residence) : none]];
      return `<dl class="rg-facts">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
    }
    const sel = (f, opts, val, blank) => `<select class="rg-input" data-d="${f}">${blank != null ? `<option value="">${blank}</option>` : ""}${[...new Set([...(val && !opts.includes(val) ? [val] : []), ...opts])].map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const hh = households();
    return `<dl class="rg-facts edit">
      <div><dt>Age</dt><dd class="two"><input class="rg-input" data-d="age" type="number" min="0" inputmode="numeric" value="${esc(d.age)}" aria-label="Age">${sel("life_stage", LIFE_STAGES, d.life_stage, "Life stage")}</dd></div>
      <div><dt>Gender</dt><dd>${sel("gender", [...new Set(["Female","Male", ...used("gender")])], d.gender, "Not on file")}</dd></div>
      <div id="rg-at-career"><dt>Occupation</dt><dd><input class="rg-input" data-d="career" value="${esc(d.career)}" aria-label="Occupation"></dd></div>
      <div id="rg-at-household"><dt>Household</dt><dd>${d.newHousehold ? `<input class="rg-input" data-d="household" value="${esc(d.household || "")}" placeholder="New household name" aria-label="New household name">` : `<select class="rg-input" data-d="household" aria-label="Household"><option value="">Pick a household</option>${hh.map(h => `<option ${h === d.household ? "selected" : ""}>${esc(h)}</option>`).join("")}<option value="__new">New household…</option></select>`}</dd></div>
      <div id="rg-at-townie"><dt>Status</dt><dd><label class="rg-check"><input type="checkbox" data-d="townie" ${d.townie ? "checked" : ""}> Townie (never needs a home)</label><small class="rg-help">Housed or Homeless comes from the address.</small></dd></div>
      <div id="rg-at-simsta"><dt>Simsta</dt><dd><input class="rg-input" data-d="simsta" value="${esc(d.simsta || "")}" placeholder="@handle" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Simsta handle"></dd></div>
      <div id="rg-at-residence"><dt>Residence</dt><dd><input class="rg-input" data-d="residence" list="rg-dl-res" value="${esc(d.residence || "")}" aria-label="Residence"><datalist id="rg-dl-res">${places().map(p => `<option value="${esc(p)}">`).join("")}</datalist></dd></div>
      <div><dt>Headshot</dt><dd><button type="button" class="rg-link" data-act="headshot">${d.headshot ? "Change Huddl headshot" : "+ Huddl headshot"}</button></dd></div>
    </dl>`;
  }
  function portrait(s){
    const ph = st.editing ? st.draft.portrait : s.portrait;
    return `<div class="rg-portrait">${ph ? `<img src="${esc(ph)}" alt="">` : `<b>${esc(initials(st.editing ? st.draft.name || s.name : s.name))}</b>`}${st.editing ? `<button type="button" class="rg-b sm" data-act="portrait">${ph ? "Change photo" : "Add photo"}</button>` : ""}</div>`;
  }
  function fbar(s){
    if (st.editing) return `<div class="rg-fbar editing"><span class="ed"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Editing ${esc(first(s.name))}'s file</span><span class="rg-dim">Everything below can be changed</span></div>`;
    const order = sortedVisible().map(x => x.id), at = order.indexOf(s.id), prev = at > 0 ? order[at - 1] : null, next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
    const hasSecret = linksFor(s.id).some(l => l.secret);
    return `<div class="rg-fbar"><a class="rg-back" href="#/registry">← All residents</a>
      <span class="rg-pn">${prev ? `<a href="#/registry/${prev}" aria-label="Previous resident">‹ Prev</a>` : `<span class="rg-dim">‹ Prev</span>`}<em>${at >= 0 ? `${at + 1} of ${order.length}` : ""}</em>${next ? `<a href="#/registry/${next}" aria-label="Next resident">Next ›</a>` : `<span class="rg-dim">Next ›</span>`}</span>
      <span class="rg-fno">GFB-${esc(s.file_no)}</span>
      ${(st.tab === "connections" || st.tab === "file") && hasSecret ? `<button class="rg-b quiet" data-act="hidesecrets" aria-pressed="${st.hideSecrets}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>${st.hideSecrets ? `<path d="M4 4l16 16" stroke="currentColor" stroke-width="1.8"/>` : ""}</svg>${st.hideSecrets ? "Show secrets" : "Hide secrets"}</button>` : ""}
      <button class="rg-b" data-act="edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Edit file</button></div>`;
  }

  /* ---------- Profile tab ---------- */
  const sec = (key, title, body) => `<section class="rg-sec" id="rg-at-${key}"><h4>${title}</h4>${body}</section>`;
  const tagsView = arr => `<div class="rg-chips">${arr.map(t => `<span class="rg-tg soft">${esc(t)}</span>`).join("")}</div>`;
  const kv = (k, v) => `<div class="rg-kv"><span>${k}</span><div>${v}</div></div>`;
  function tagEdit(key, label, vals){
    return `<div class="rg-tagedit" data-tagkey="${key}"><div class="rg-chips">${(vals || []).map((v, i) => `<span class="rg-tg soft x">${esc(v)}<button type="button" data-untag="${key}:${i}" aria-label="Remove ${esc(v)}">×</button></span>`).join("")}</div>
      <div class="rg-tagadd"><input class="rg-input" list="rg-dl-${key}" placeholder="Add to ${esc(label.toLowerCase())}" autocomplete="off" aria-label="Add to ${esc(label)}"><button type="button" class="rg-b sm" data-tagadd="${key}">Add</button></div><datalist id="rg-dl-${key}">${menu(key).map(v => `<option value="${esc(v)}">`).join("")}</datalist></div>`;
  }
  function profileTab(s){
    const E = st.editing, d = st.draft;
    if (!E) {
      const sum = R().simInfo(s.id).summary, out = [], adds = [];
      if (sum) out.push(sec("summary", "Summary", `<p class="rg-summary">${esc(sum).replace(/\n/g, "<br>")}</p>`)); else adds.push(["summary","Summary"]);
      const rows = [["Aspiration", s.aspiration], ["Attachment style", s.attachment], ["Love language", s.love_language], ["Romantic attraction", s.romantic_attraction], ["Sexual attraction", s.sexual_attraction]];
      const have = rows.filter(r => r[1]);
      if ((s.traits || []).length || have.length) out.push(sec("behavior", "Behavior", `${(s.traits || []).length ? `<div class="rg-chips">${s.traits.map(t => `<span class="rg-tg">${esc(t)}</span>`).join("")}</div>` : ""}${have.length ? `<div class="rg-row2">${have.map(([k, v]) => kv(k, esc(v))).join("")}</div>` : ""}`));
      if ((s.traits || []).length < 5) adds.push(["traits", (s.traits || []).length ? "Trait" : "Traits"]);
      rows.filter(r => !r[1]).forEach(([k]) => adds.push([{ "Aspiration":"aspiration", "Attachment style":"attachment", "Love language":"love_language", "Romantic attraction":"romantic_attraction", "Sexual attraction":"sexual_attraction" }[k], k]));
      PREF_KEYS.forEach(([k, n]) => { if ((s[k] || []).length) out.push(sec(k, n, tagsView(s[k]))); else adds.push([k, n]); });
      return out.join("") + (adds.length ? `<div class="rg-adds">${adds.map(([k, n]) => `<button class="rg-add" data-addat="profile:${k}">${esc(n)}</button>`).join("")}</div>` : "");
    }
    const sel = (f, opts, val) => `<select class="rg-input" data-d="${f}"><option value="">Pick one</option>${[...new Set([...(val && !opts.includes(val) ? [val] : []), ...opts])].map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const o = data.options, traits = d.traits || [];
    return sec("summary", "Summary", `<textarea class="rg-input rg-ta" data-d="summary" placeholder="Optional. 4 to 10 sentences in your own words." aria-label="Summary">${esc(d.summary || "")}</textarea>`)
      + sec("traits", "Behavior", `<div class="rg-chips">${traits.map((t, i) => `<span class="rg-tg x">${esc(t)}<button type="button" data-untrait="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join("")}${Array.from({ length:Math.max(0, 5 - traits.length) }, () => `<label class="rg-tg new">+ Trait<select data-addtrait aria-label="Add a trait"><option value="">Pick a trait</option>${menu("traits").filter(t => !traits.includes(t)).map(t => `<option>${esc(t)}</option>`).join("")}</select></label>`).join("")}</div>
        <div class="rg-row2 edit">
          <div class="rg-kv" id="rg-at-aspiration"><span>Aspiration</span><div>${sel("aspiration", menu("aspiration"), d.aspiration)}</div></div>
          <div class="rg-kv" id="rg-at-attachment"><span>Attachment style</span><div>${sel("attachment", o.attachment || [], d.attachment)}</div></div>
          <div class="rg-kv" id="rg-at-love_language"><span>Love language</span><div>${sel("love_language", o.love_language || [], d.love_language)}</div></div>
          <div class="rg-kv" id="rg-at-romantic_attraction"><span>Romantic attraction</span><div>${sel("romantic_attraction", attrOpts("romantic_attraction"), d.romantic_attraction)}</div></div>
          <div class="rg-kv" id="rg-at-sexual_attraction"><span>Sexual attraction</span><div>${sel("sexual_attraction", attrOpts("sexual_attraction"), d.sexual_attraction)}</div></div>
        </div>`)
      + PREF_KEYS.map(([k, n]) => sec(k, n, tagEdit(k, n, d[k]))).join("")
      + `<p class="rg-optlink"><button type="button" class="rg-link" data-act="lists">Manage option lists</button> for traits, aspirations, likes, dislikes, and turn ons and offs.</p>`;
  }

  /* ---------- Connections tab ---------- */
  const otherName = (sd) => sd.other ? (simById(sd.other) ? simById(sd.other).name : sd.other) : (sd.otherName || "Unknown");
  function subline(sd){
    const l = sd.link, h = (l.history || []).slice(-1)[0], lab = sd.label || "";
    let tail = "";
    if (h) { if (h.label === lab) tail = h.game_date ? gLabel(h.game_date) : ""; else tail = h.label + ", " + (h.game_date ? gLabel(h.game_date) : "date not set"); }
    if (l.family === "parent") { const rel = [l.biological && "Biological", l.adoptive && "Adoptive", l.raised && "Raised them"].filter(Boolean).join(", "); if (rel && !(l.biological && l.raised && !l.adoptive)) tail = rel; }
    return [lab, tail].filter(Boolean).join(" · ") + (sd.other ? "" : (lab || tail ? ", " : "") + "file pending");
  }
  function connectionsTab(s){
    const all = linksFor(s.id), list = all.filter(l => !(st.hideSecrets && l.secret)), canEdit = R().canEdit();
    const legend = `<div class="rg-legend">${GROUPS.map(([k]) => `<span><i style="background:var(--${k})"></i>${KINDS.find(x => x[0] === k)[1]}</span>`).join("")}<span><i class="dash"></i>Secret</span></div>`;
    const top = `<div class="rg-ctop">${legend}<button class="rg-link" data-act="${canEdit ? "addlink" : "needmove"}">+ Add connection</button></div>`;
    if (!list.length) return top + `<p class="rg-none">${all.length ? "Every connection on this file is secret, and secrets are hidden." : "No connections on file."}</p>`;
    const groups = GROUPS.map(([k, n]) => {
      const items = list.filter(l => l.kind === k).map(l => R().side(l, s.id)).sort((a, b) => stripNick(otherName(a)).localeCompare(stripNick(otherName(b))));
      if (!items.length) return "";
      return `<div class="rg-grp"><h5>${n}</h5>${items.map(sd => linkRow(s, sd)).join("")}</div>`;
    }).join("");
    return top + groups;
  }
  function linkRow(s, sd){
    const l = sd.link, o = sd.other ? simById(sd.other) : null, name = otherName(sd), open = st.openLink === l.id;
    const row = `<button class="rg-conn ${l.secret ? "secret" : ""} ${open ? "open" : ""}" data-link="${l.id}" aria-expanded="${open}" style="--k:var(--${l.secret ? "secret" : l.kind})">
      <span class="bar"></span><span class="av">${avSq(name, o && o.portrait)}</span>
      <span class="t"><b>${esc(name)}${l.secret ? `<span class="rg-stamp">Secret</span>` : ""}</b><small>${esc(subline(sd))}</small></span>
      <span class="k" style="color:var(--${l.kind})">${esc((KINDS.find(x => x[0] === l.kind) || ["", ""])[1])}</span></button>`;
    if (!open) return row;
    const hist = (l.history || []).length ? `<ul class="rg-hist ${l.secret ? "sec" : ""}" style="--k:var(--${l.kind})">${l.history.map(h => `<li>${esc(h.label)}<small>${h.game_date ? esc(gLabel(h.game_date)) : "Date not set"}${h.note ? " · " + esc(h.note) : ""}</small></li>`).join("")}</ul>` : `<p class="rg-none">No history yet.</p>`;
    const thread = o && GFB.messages && GFB.messages.isLoaded() ? GFB.messages.find([s.id, o.id]) : null;
    const msgHref = thread ? `#/messages/t/${thread.id}/${s.id}` : `#/messages/sim/${s.id}`;
    return row + `<div class="rg-open"><div><h6>History</h6>${hist}<button class="rg-link" data-act="${R().canEdit() ? "addhist" : "needmove"}" data-l="${l.id}">+ Add to history</button></div>
      <div class="rg-short">${o ? `<a href="${msgHref}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Messages with ${esc(first(o.name))}</a><a href="#/registry/${o.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>${esc(first(o.name))}'s file</a>` : `<button class="rg-shortb" data-file="${esc(name)}">Open a file for ${esc(name)}</button>`}
      <button class="rg-shortb" data-act="${R().canEdit() ? "editlink" : "needmove"}" data-l="${l.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Edit this connection</button></div></div>`;
  }

  /* ---------- the connection sheet ---------- */
  function openSheet(s, link, focus){
    if (link) {
      const sd = R().side(link, s.id);
      st.sheet = { id:link.id, me:s.id, other:sd.other, otherName:sd.otherName, who:"", kind:link.kind,
        fam: link.family === "parent" ? (sd.isParent ? "me" : "them") : (link.family || "sibling"),
        myLabel:sd.label || "", theirLabel:sd.theirLabel || "", biological:!!link.biological, adoptive:!!link.adoptive, raised:!!link.raised, secret:!!link.secret,
        history:(link.history || []).map(h => ({ ...h })), entry:{ date:UI.gameToday(cal()), nodate:false, label:"" }, editEntry:null, focus };
    } else st.sheet = { id:null, me:s.id, other:null, otherName:null, who:"", kind:"friend", fam:"sibling", myLabel:"", theirLabel:"", biological:true, adoptive:false, raised:true, secret:false, history:[], entry:{ date:UI.gameToday(cal()), nodate:false, label:"" }, editEntry:null, focus };
  }
  function sheetHTML(s){
    const h = st.sheet, other = h.other ? simById(h.other) : null, oName = other ? other.name : (h.otherName || h.who || "them");
    const A = first(s.name), B = first(oName) || "Them";
    const chips = (name, opts, val) => `<div class="rg-kinds">${opts.map(([v, label, color]) => `<button type="button" class="${v === val ? "on" : ""}" data-sk="${name}:${v}">${color ? `<i style="background:var(--${color})"></i>` : ""}${esc(label)}</button>`).join("")}</div>`;
    const dateFields = (prefix, d) => `<span class="rg-gd"><select data-se="${prefix}season" aria-label="Season">${cal().seasons.map(x => `<option ${d && x.name === d.season ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><input type="number" min="1" max="21" inputmode="numeric" data-se="${prefix}day" value="${d ? d.day : 1}" aria-label="Day"><span>Y</span><input type="number" min="1" inputmode="numeric" data-se="${prefix}year" value="${d ? d.year : cal().year}" aria-label="Year"></span>`;
    const entries = h.history.map((e, i) => h.editEntry === i
      ? `<div class="rg-entry editing"><div class="rg-entryedit">${dateFields("e", e.game_date || UI.gameToday(cal()))}<label class="rg-check"><input type="checkbox" data-se="enodate" ${e.game_date ? "" : "checked"}> No date</label><input class="rg-input" data-se="elabel" value="${esc(e.label)}" list="rg-dl-hist" aria-label="What happened"><button type="button" class="rg-b sm pri" data-sa="entrydone">Done</button></div></div>`
      : `<div class="rg-entry"><button type="button" class="rg-entrydate" data-sa="entryedit:${i}" aria-label="Change this entry">${esc(gShort(e.game_date))}</button><span>${esc(e.label)}${e.note ? `<small>${esc(e.note)}</small>` : ""}</span><button type="button" class="rg-x" data-sa="entrydel:${i}" aria-label="Remove this entry">×</button></div>`).join("");
    const title = h.id ? `${A} and ${B}` : `New connection for ${A}`;
    return `<div class="rg-sheetwrap" data-sheetbg><div class="rg-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="rg-sh"><b>${esc(title)}</b><button type="button" class="rg-x" data-sa="close" aria-label="Close">×</button></div>
      <div class="rg-sb">
        ${h.id ? "" : `<div><div class="rg-flab">Who</div><input class="rg-input" data-se="who" list="rg-dl-sims" value="${esc(h.who)}" placeholder="Start typing a name" autocomplete="off" aria-label="Who"><datalist id="rg-dl-sims">${data.sims.filter(x => x.id !== s.id).map(x => `<option value="${esc(x.name)}">`).join("")}</datalist><div class="rg-help">Pick a resident on file, or type a new name to mark them file pending.</div></div>`}
        <div><div class="rg-flab">Kind</div>${chips("kind", KINDS.map(([k, n]) => [k, n, k]), h.kind)}</div>
        ${h.kind === "fam" ? `<div><div class="rg-flab">Family link</div>${chips("fam", [["them", `${B} is ${A}'s parent`], ["me", `${A} is ${B}'s parent`], ["sibling", "Siblings"], ["other", "Other family"]], h.fam)}</div>
          ${h.fam === "me" || h.fam === "them" ? `<div class="rg-checks"><label class="rg-check"><input type="checkbox" data-se="biological" ${h.biological ? "checked" : ""}> Biological</label><label class="rg-check"><input type="checkbox" data-se="adoptive" ${h.adoptive ? "checked" : ""}> Adoptive</label><label class="rg-check"><input type="checkbox" data-se="raised" ${h.raised ? "checked" : ""}> Raised them</label></div>` : ""}` : ""}
        <div class="rg-two"><div><div class="rg-flab">${esc(A)} calls it</div><input class="rg-input" data-se="myLabel" value="${esc(h.myLabel)}" aria-label="${esc(A)} calls it"></div><div><div class="rg-flab">${esc(B)} calls it</div><input class="rg-input" data-se="theirLabel" value="${esc(h.theirLabel)}" aria-label="${esc(B)} calls it"></div></div>
        <div id="rg-sheet-hist"><div class="rg-flab">History</div>${entries || `<p class="rg-help" style="margin:0 0 4px">Nothing yet.</p>`}
          <div class="rg-newentry">${dateFields("n", h.entry.date)}<input class="rg-input" data-se="nlabel" list="rg-dl-hist" value="${esc(h.entry.label)}" placeholder="Dating" aria-label="What happened"><button type="button" class="rg-b sm" data-sa="entryadd">Add</button></div>
          <datalist id="rg-dl-hist">${HIST_SUGGEST.map(x => `<option value="${esc(x)}">`).join("")}</datalist>
          <div class="rg-help">Pick met, dating, engaged, married, split, or type your own. The date starts on today's game date; change it if it happened earlier. Tap a date to change it.</div></div>
        <label class="rg-secretrow"><span class="rg-check"><input type="checkbox" data-se="secret" ${h.secret ? "checked" : ""}> Secret</span><span class="rg-help">${h.kind === "fam" && (h.fam === "me" || h.fam === "them") ? "For a secret father, a secret adoption, and so on. Heirloom hides it behind the eye button." : "Shows with a red dashed border. Spill keeps it out of the public layer."}</span></label>
        ${h.kind === "fam" && (h.fam === "me" || h.fam === "them") ? `<p class="rg-help" style="margin:0">Examples: a husband raising a child who isn't his: Raised them yes, Biological no, Secret yes. The real father: Biological yes, Raised them no, Secret yes.</p>` : ""}
        ${h.err ? `<p class="rg-msg err" style="margin:0">${esc(h.err)}</p>` : ""}
      </div>
      <div class="rg-sfoot">${h.id ? `<button type="button" class="rg-b del" data-sa="delete">Delete connection</button>` : ""}<button type="button" class="rg-b quiet" data-sa="close">Cancel</button><button type="button" class="rg-b pri" data-sa="save" ${st.busy ? "disabled" : ""}>${st.busy ? "Saving..." : "Save"}</button></div>
    </div></div>`;
  }
  function readSheetFields(){
    const h = st.sheet; if (!h || !root) return;
    const g = k => root.querySelector(`[data-se="${k}"]`);
    if (g("who")) h.who = g("who").value;
    ["myLabel","theirLabel"].forEach(k => { if (g(k)) h[k] = g(k).value; });
    ["biological","adoptive","raised","secret"].forEach(k => { if (g(k)) h[k] = g(k).checked; });
    if (g("nseason")) h.entry = { ...h.entry, date:{ season:g("nseason").value, day:clampDay(g("nday").value), year:Math.max(1, parseInt(g("nyear").value, 10) || cal().year) }, label:g("nlabel").value };
    if (h.editEntry != null && g("eseason")) { const e = h.history[h.editEntry]; e.label = g("elabel").value.trim() || e.label; e.game_date = g("enodate").checked ? null : { season:g("eseason").value, day:clampDay(g("eday").value), year:Math.max(1, parseInt(g("eyear").value, 10) || cal().year) }; }
  }
  const clampDay = v => Math.min(21, Math.max(1, parseInt(v, 10) || 1));
  const DEFAULT_LABEL = { me:["Child","Parent"], them:["Parent","Child"], sibling:["Sibling","Sibling"] };
  async function saveSheet(s){
    readSheetFields();
    const h = st.sheet; h.err = null;
    let other = h.other, otherName = h.otherName;
    if (!h.id) {
      const t = findSim(h.who);
      if (!h.who.trim()) { h.err = "Pick who this connection is with."; return draw(); }
      if (t && t.id === s.id) { h.err = "A Sim can't be connected to themselves."; return draw(); }
      other = t ? t.id : null; otherName = t ? null : h.who.trim();
      if (other && linksFor(s.id).some(l => l.a_sim === other || l.b_sim === other)) { h.err = `${first(s.name)} and ${first(t.name)} already have a connection. Open it from the list to change it.`; return draw(); }
    }
    if (h.entry.label.trim()) h.history.push({ id:null, label:h.entry.label.trim(), game_date:h.entry.nodate ? null : h.entry.date, note:null });
    const parent = h.kind === "fam" && (h.fam === "me" || h.fam === "them");
    let myL = h.myLabel.trim() || null, thL = h.theirLabel.trim() || null;
    if (h.kind === "fam" && DEFAULT_LABEL[h.fam]) { if (!myL) myL = DEFAULT_LABEL[h.fam][0]; if (!thL) thL = DEFAULT_LABEL[h.fam][1]; }
    /* the parent is always a_sim; otherwise the Sim whose file it's opened from goes first on a new link, and an existing link keeps its order */
    const old = h.id ? R().linkById(h.id) : null;
    let meIsA = old ? old.a_sim === s.id : true;
    if (parent) meIsA = h.fam === "me";
    if (!other && !meIsA) meIsA = true;   /* a file-pending Sim can't be a_sim */
    const link = { id:h.id || R().newId(), a_sim:meIsA ? s.id : other, b_sim:meIsA ? other : s.id, b_name:meIsA && !other ? otherName : null, kind:h.kind,
      family:h.kind === "fam" ? (parent ? "parent" : h.fam === "sibling" ? "sibling" : "other") : null,
      a_label:meIsA ? myL : thL, b_label:meIsA ? thL : myL, biological:parent ? h.biological : null, adoptive:parent ? h.adoptive : null, raised:parent ? h.raised : null, secret:h.secret };
    if (!parent && h.kind === "fam" && !other && h.fam !== "sibling") link.family = "other";
    st.busy = true; draw();
    try { await R().saveLink(link, h.history.map(e => ({ id:e.id || undefined, label:e.label, game_date:e.game_date || null, note:e.note || null })));
      st.sheet = null; st.openLink = link.id; st.msg = "Connection saved."; st.err = false; }
    catch (e) { h.err = e.message; }
    st.busy = false; data = await GFB.getAll(); draw();
  }


  /* ---------- Timeline (top of the File tab) ----------
     Every dated history entry on this Sim's connections, plus their home changes (Housed, Homeless, Townie).
     Entries with no date sit in their own group, "Before the save started" counts as dated and sits at the very bottom. */
  const BEFORE = { season:"Before the save started", day:0, year:0, before:true };
  const KIND_NAME = Object.fromEntries(KINDS);
  function relTitle(label, name){
    const L = String(label || "").trim(), l = L.toLowerCase();
    if (/^matched on slide/.test(l)) return `Matched with ${name} on Slide`;
    if (/^(married|met|adopted|divorced)$/.test(l)) return `${L} ${name}`;
    if (l === "engaged") return `Engaged to ${name}`;
    if (l === "dating") return `Started dating ${name}`;
    if (l === "parent and child") return `Parent and child: ${name}`;
    return `${L || "Connected"} with ${name}`;
  }
  function homeAddress(s){ const h = homeOf(s); return h ? lotLabel(h) : null; }
  /* the Sim's timeline entries, newest data first is decided later; hidden counts the secrets left out */
  function tlItems(s){
    const out = []; let hidden = 0;
    linksFor(s.id).forEach(l => {
      if (st.hideSecrets && l.secret) { hidden += (l.history || []).length; return; }
      const sd = R().side(l, s.id), name = otherName(sd), kn = KIND_NAME[l.kind] || "";
      (l.history || []).forEach((h, idx) => {
        const slide = /^matched on slide/i.test(h.label || "");
        out.push({ key:`h:${l.id}:${idx}`, type:"rel", link:l, hist:h, idx, date:h.game_date || null, tone:l.secret ? "sec" : "rom", secret:!!l.secret, kind:l.kind,
          title:relTitle(h.label, name), sub:[slide ? "From Slide" : "", kn, l.secret ? "Secret" : (slide ? "" : sd.label)].filter(Boolean).join(" · ") });
      });
    });
    const evs = R().homeEventsOf(s.id);
    evs.forEach(e => out.push({ key:"e:" + e.id, type:"home", ev:e, date:e.game_date || null, tone:"home", kind:"home", title:{ housed:"Housed", homeless:"Homeless", townie:"Townie" }[e.kind],
      sub:"Home · " + (e.address || (e.kind === "housed" ? "address on file" : "no home address yet")), lot:e.address ? lots().find(x => lotLabel(x) === e.address) : null }));
    if (!evs.length) { const k = statusOf(s).toLowerCase(), a = homeAddress(s);
      out.push({ key:"v:" + k, type:"home", virtual:true, ev:{ sim_id:s.id, kind:k, address:a }, date:null, tone:"home", kind:"home", title:statusOf(s), sub:"Home · " + (a || "no home address yet"), lot:homeOf(s) }); }
    return { out, hidden };
  }
  const dayWord = d => d && d.day ? "Day " + d.day : "";
  function tlRow(it, s){
    const E = st.tl.edit && st.tl.edit.key === it.key;
    if (E) return tlEditRow(it);
    const d = it.date, dated = !!d;
    const dayCell = dated ? `<button type="button" class="rg-evday" data-tl="date:${esc(it.key)}" aria-label="Change this date">${d.before ? "Before" : dayWord(d)}</button>` : `<button type="button" class="rg-adddate" data-tl="date:${esc(it.key)}">Add date</button>`;
    return `<div class="rg-ev ${it.secret ? "secret" : ""} ${dated ? "" : "nd"}" data-tlopen="${esc(it.key)}" role="button" tabindex="0" style="--k:var(--${it.tone === "sec" ? "secret" : it.tone === "home" ? "navy" : "rom"})">
      <span class="rg-evd">${dayCell}</span><span class="rg-dot ${it.tone}"></span>
      <div><b>${esc(it.title)}${it.secret ? `<span class="rg-stamp">Secret</span>` : ""}</b><small>${esc(it.sub)}</small></div>
      <span class="rg-go">${it.type === "home" && !it.lot ? "" : "›"}</span></div>`;
  }
  const tlDateFields = (d, before, pre) => before
    ? `<span class="rg-gdfixed">Before the save started</span>`
    : `<span class="rg-gd"><select data-tlf="${pre}season" aria-label="Season">${cal().seasons.map(x => `<option ${d && x.name === d.season ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><input type="number" min="1" max="21" inputmode="numeric" data-tlf="${pre}day" value="${d ? d.day : 1}" aria-label="Day"><span>Y</span><input type="number" min="1" inputmode="numeric" data-tlf="${pre}year" value="${d ? d.year : cal().year}" aria-label="Year"></span>`;
  function tlEditRow(it){
    const e = st.tl.edit, today = UI.gameToday(cal());
    return `<div class="rg-ev nd editing"><span class="rg-evd"></span><span class="rg-dot ${it.tone}"></span><div><b>${esc(it.title)}</b>
      <div class="rg-gdrow">${tlDateFields(e.date, e.before, "e")}</div>
      <div class="rg-gdq"><button type="button" class="rg-q ${e.before ? "on" : ""}" data-tl="q:before">Before the save started</button><button type="button" class="rg-q" data-tl="q:today">Today (${esc(today.season)}, day ${today.day})</button></div>
      ${e.err ? `<p class="rg-msg err" style="margin:6px 0 0">${esc(e.err)}</p>` : ""}
      <div class="rg-gdact">${it.type === "home" && !it.virtual ? `<button type="button" class="rg-b del" data-tl="remove">Remove</button>` : ""}<button type="button" class="rg-b quiet sm" data-tl="cancel">Cancel</button><button type="button" class="rg-b pri sm" data-tl="savedate" ${st.busy ? "disabled" : ""}>Save date</button></div></div><span></span></div>`;
  }
  function tlAddForm(s){
    const a = st.tl.add, links = linksFor(s.id).filter(l => !(st.hideSecrets && l.secret)), today = UI.gameToday(cal());
    const opts = [`<option value="home" ${a.what === "home" ? "selected" : ""}>A home change</option>`, ...links.map(l => `<option value="${l.id}" ${a.what === l.id ? "selected" : ""}>${esc(otherName(R().side(l, s.id)))} (${esc(KIND_NAME[l.kind] || "")}${l.secret ? ", secret" : ""})</option>`)];
    return `<div class="rg-tladd"><div class="rg-flab">What happened</div>
      <select class="rg-input" data-tlf="what" aria-label="What happened with">${opts.join("")}</select>
      ${a.what === "home" ? `<div class="rg-kinds" style="margin-top:8px">${[["housed","Housed"],["homeless","Homeless"],["townie","Townie"]].map(([k, n]) => `<button type="button" class="${a.hkind === k ? "on" : ""}" data-tl="hk:${k}">${n}</button>`).join("")}</div>`
        : `<input class="rg-input" data-tlf="label" list="rg-dl-hist" value="${esc(a.label)}" placeholder="Married, Engaged, Split..." aria-label="What happened" style="margin-top:8px"><datalist id="rg-dl-hist">${HIST_SUGGEST.map(x => `<option value="${esc(x)}">`).join("")}</datalist>`}
      <div class="rg-flab" style="margin-top:10px">When</div>
      <div class="rg-gdrow">${tlDateFields(a.date, a.before, "n")}</div>
      <div class="rg-gdq"><button type="button" class="rg-q ${a.before ? "on" : ""}" data-tl="aq:before">Before the save started</button><button type="button" class="rg-q" data-tl="aq:today">Today (${esc(today.season)}, day ${today.day})</button></div>
      ${a.err ? `<p class="rg-msg err" style="margin:6px 0 0">${esc(a.err)}</p>` : ""}
      <div class="rg-gdact"><button type="button" class="rg-b quiet sm" data-tl="addcancel">Cancel</button><button type="button" class="rg-b pri sm" data-tl="addsave" ${st.busy ? "disabled" : ""}>Add to timeline</button></div></div>`;
  }
  function timelineHTML(s){
    const { out, hidden } = tlItems(s), f = st.tl.filter;
    const rel = out.filter(x => x.type === "rel"), home = out.filter(x => x.type === "home");
    const shown = f === "rel" ? rel : f === "home" ? home : out;
    const ord = d => UI.gameOrd(d, cal());
    const dated = shown.filter(x => x.date && !x.date.before).sort((a, b) => ord(b.date) - ord(a.date));
    const undated = shown.filter(x => !x.date), before = shown.filter(x => x.date && x.date.before);
    let body = ""; let yr = null, se = null;
    dated.forEach(x => { if (x.date.year !== yr) { yr = x.date.year; se = null; body += `<div class="rg-yr">Year ${yr}</div>`; } if (x.date.season !== se) { se = x.date.season; body += `<div class="rg-season">${esc(se)}</div>`; } body += tlRow(x, s); });
    if (undated.length) body += `<div class="rg-undated"><span>Date not set</span><small>${undated.length}${undated.some(x => x.type === "rel" && (x.hist.note || "").includes("old file")) ? " · moved over from Notion" : ""}</small></div>` + undated.map(x => tlRow(x, s)).join("");
    if (before.length) body += `<div class="rg-undated"><span>Before the save started</span><small>${before.length}</small></div>` + before.map(x => tlRow(x, s)).join("");
    if (!shown.length) body = `<p class="rg-none">Nothing on the timeline for this filter.</p>`;
    const chip = (k, n, c) => `<button type="button" class="rg-tf ${f === k ? "on" : ""}" data-tl="f:${k}">${n} <small>${c}</small></button>`;
    return `<section class="rg-sec rg-tl" id="rg-at-timeline"><div class="rg-tlhead"><h4>Timeline</h4>${chip("all", "All", out.length)}${chip("rel", "Relationships", rel.length)}${chip("home", "Home", home.length)}<button type="button" class="rg-link" style="margin-left:auto" data-tl="add">Add to timeline</button></div>
      ${st.tl.msg ? `<p class="rg-msg ${st.tl.err ? "err" : ""}" role="status">${esc(st.tl.msg)}</p>` : ""}
      ${st.tl.add ? tlAddForm(s) : ""}${body}${hidden ? `<p class="rg-hiddennote">${hidden} secret ${hidden === 1 ? "entry" : "entries"} hidden</p>` : ""}</section>`;
  }
  /* read the date fields that are on screen */
  function tlRead(){
    const g = k => root.querySelector(`[data-tlf="${k}"]`);
    const rd = (pre, o) => { if (g(pre + "season")) o.date = { season:g(pre + "season").value, day:clampDay(g(pre + "day").value), year:Math.max(1, parseInt(g(pre + "year").value, 10) || cal().year) }; };
    if (st.tl.edit) rd("e", st.tl.edit);
    if (st.tl.add) { rd("n", st.tl.add); if (g("label")) st.tl.add.label = g("label").value; }
  }
  const tlFind = (key, s) => tlItems(s).out.find(x => x.key === key);
  async function tlAction(act, s){
    const T = st.tl; T.msg = ""; tlRead();
    const done = async (msg) => { st.busy = false; T.edit = null; T.add = null; T.msg = msg; T.err = false; data = await GFB.getAll(); draw(); setTimeout(() => { T.msg = ""; }, 0); };
    const fail = (e) => { st.busy = false; T.msg = e.message; T.err = true; draw(); };
    if (act.startsWith("f:")) { T.filter = act.slice(2); return draw(); }
    if (act === "add") { T.edit = null; T.add = T.add ? null : { what:"home", hkind:statusOf(s).toLowerCase(), label:"", date:UI.gameToday(cal()), before:false }; return draw(); }
    if (act === "addcancel") { T.add = null; return draw(); }
    if (act.startsWith("hk:")) { T.add.hkind = act.slice(3); return draw(); }
    if (act === "aq:before") { T.add.before = true; return draw(); }
    if (act === "aq:today") { T.add.before = false; T.add.date = UI.gameToday(cal()); return draw(); }
    if (act.startsWith("date:")) { const it = tlFind(act.slice(5), s); if (!it) return;
      if (it.type === "rel" && !R().canEdit()) { st.tab = "file"; T.msg = "Connections are read only until your Registry moves to its new tables. Use the banner at the top to check the counts and move."; T.err = true; return draw(); }
      T.add = null; T.edit = { key:it.key, date:it.date && !it.date.before ? { ...it.date } : UI.gameToday(cal()), before:!!(it.date && it.date.before) }; return draw(); }
    if (act === "cancel") { T.edit = null; return draw(); }
    if (act === "q:before") { T.edit.before = true; return draw(); }
    if (act === "q:today") { T.edit.before = false; T.edit.date = UI.gameToday(cal()); return draw(); }
    if (act === "savedate") {
      const it = tlFind(T.edit.key, s); if (!it) return; const nd = T.edit.before ? { ...BEFORE } : T.edit.date;
      st.busy = true; draw();
      try {
        if (it.type === "rel") { const l = it.link; await R().saveLink({ ...l }, l.history.map((e, i) => ({ id:e.id, label:e.label, game_date:i === it.idx ? nd : (e.game_date || null), note:e.note || null }))); }
        else await R().saveHomeEvent({ ...it.ev, game_date:nd });
        return done("Date saved.");
      } catch (e) { return fail(e); }
    }
    if (act === "remove") { const it = tlFind(T.edit.key, s); if (!it || it.type !== "home" || it.virtual) return; st.busy = true; try { await R().deleteHomeEvent(it.ev.id); return done("Entry removed."); } catch (e) { return fail(e); } }
    if (act === "addsave") {
      const a = T.add, nd = a.before ? { ...BEFORE } : a.date; st.busy = true; draw();
      try {
        if (a.what === "home") await R().saveHomeEvent({ sim_id:s.id, kind:a.hkind, address:a.hkind === "housed" ? homeAddress(s) : null, game_date:nd });
        else {
          if (!R().canEdit()) throw new Error("Connections are read only until your Registry moves to its new tables.");
          if (!String(a.label || "").trim()) throw new Error("Type what happened, like Married or Engaged.");
          const l = R().linkById(a.what); await R().saveLink({ ...l }, [...l.history.map(e => ({ id:e.id, label:e.label, game_date:e.game_date || null, note:e.note || null })), { label:a.label.trim(), game_date:nd, note:null }]);
        }
        return done("Added to the timeline.");
      } catch (e) { return fail(e); }
    }
  }
  /* tapping an entry: a connection opens its sheet, a home entry opens the address */
  function tlOpen(key, s){
    const it = tlFind(key, s); if (!it) return;
    if (it.type === "home") { if (it.lot) location.hash = "#/lotline/" + it.lot.id; return; }
    if (R().canEdit()) { openSheet(s, it.link); return draw(); }
    st.tab = "connections"; st.openLink = it.link.id; draw();
  }
  /* a home change adds an entry on its own: compare each household member's status before and after a file save */
  const statusSnap = ids => Object.fromEntries(ids.map(id => { const x = simById(id); return [id, x ? { st:statusOf(x), addr:homeAddress(x) } : null]; }));
  async function logHomeChanges(before){
    for (const [id, b] of Object.entries(before)) {
      const x = simById(id); if (!x || !b) continue; const a = { st:statusOf(x), addr:homeAddress(x) };
      if (a.st === b.st && a.addr === b.addr) continue;
      try { await R().saveHomeEvent({ sim_id:id, kind:a.st.toLowerCase(), address:a.addr, game_date:UI.gameToday(cal()) }); } catch {}
    }
  }

  /* ---------- File tab ---------- */
  function fileTab(s){
    const E = st.editing, d = st.draft, out = [], adds = [];
    const orgs = orgsOf(s), jobs = orgs.filter(o => String(o.type).toLowerCase() !== "club"), clubs = orgs.filter(o => String(o.type).toLowerCase() === "club");
    const role = o => { const m = (o.members || []).find(x => x.sim === s.id || stripNick(x.name || "").toLowerCase() === stripNick(s.name).toLowerCase()); return m && m.role ? `<small> · ${esc(m.role)}</small>` : ""; };
    if (jobs.length || clubs.length) out.push(sec("work", "Work and clubs", `${jobs.length ? kv(jobs.length > 1 ? "Companies" : "Company", jobs.map(o => `<a class="rg-a" href="#/huddl/org/${o.id}">${esc(o.name)} ›</a>${role(o)}`).join("<br>")) : ""}${clubs.length ? kv("Clubs", clubs.map(o => `<a class="rg-a" href="#/cliq/club/${o.id}">${esc(o.name)} ›</a>${role(o)}`).join("<br>")) : ""}`));
    const home = homeOf(s), owned = ownedBy(s);
    if (E) {
      const homes = lots().filter(l => RESIDENTIAL.includes(l.lot_type) && !lots().some(u => u.parent_id === l.id));
      const ownSet = new Set(d.owns);
      out.push(sec("home", "Home and property", `<div class="rg-kv"><span>Home address</span><div><select class="rg-input" data-d="home" aria-label="Home address"><option value="">No home on file</option>${homes.map(l => `<option value="${l.id}" ${d.home === l.id ? "selected" : ""}>${esc(lotLabel(l))}${l.household && l.household !== s.household ? " (" + esc(l.household) + ")" : (!l.household ? " (vacant)" : "")}</option>`).join("")}</select><small class="rg-help">Moves ${esc(first(s.name))}'s whole household into that lot. If another household lives there, ${pron(s)} joins it.</small></div></div>
        <div class="rg-kv" id="rg-at-owns"><span>Owns</span><div class="rg-owns">${lots().filter(l => !l.parent_id || ownSet.has(l.id)).map(l => `<label class="rg-check"><input type="checkbox" data-own="${l.id}" ${ownSet.has(l.id) ? "checked" : ""}>${esc(lotLabel(l))}${l.owner && !ownSet.has(l.id) && l.owner_sim !== s.id ? ` <em>owned by ${esc(l.owner)}</em>` : ""}</label>`).join("")}</div></div>`));
    } else {
      if (home || owned.length) out.push(sec("home", "Home and property", `${home ? kv("Home address", `<a class="rg-a" href="#/lotline/${home.id}">${esc(lotLabel(home))} ›</a>`) : ""}${owned.length ? kv("Owns", owned.map(l => `<a class="rg-a" href="#/lotline/${l.id}">${esc(lotLabel(l))} ›</a>`).join("<br>")) : ""}`));
      if (!home) adds.push(["home", "Home address"]);
    }
    const money = moneyHTML(s);
    if (money) out.push(sec("money", "Money", money)); else if (!E) adds.push(["bank", "Bank account"]);
    if (!E && !owned.length) adds.push(["owns", `Property ${pron(s)} own${pron(s) === "they" ? "" : "s"}`]);
    const act = activityHTML(s); if (act) out.push(sec("activity", "Activity", act));
    let html = (E ? "" : timelineHTML(s)) + out.join("") + (adds.length ? `<div class="rg-adds">${adds.map(([k, n]) => k === "bank" ? `<a class="rg-add" href="#/trust/staff">${esc(n)}</a>` : `<button class="rg-add" data-addat="file:${k}">${esc(n)}</button>`).join("")}</div>` : "");
    const notes = s.notes || [], secrets = s.secrets || [];
    if (notes.length || secrets.length) {
      const firstLine = String(notes[0] || secrets[0] || "").replace(/^#+\s*/, "").replace(/[*_]/g, "");
      html += `<section class="rg-sec rg-old"><div class="rg-oldh"><h4>Old case notes <small>From Notion · kept as they were</small></h4><button class="rg-link" data-act="oldtoggle" aria-expanded="${st.oldOpen}">${st.oldOpen ? "Hide" : "Show ›"}</button></div>
        ${st.oldOpen ? `<div class="rg-notes">${notes.map(fmtNote).join("")}</div>${secrets.length ? `<h4 class="rg-resth">Restricted</h4><ul class="rg-rest">${secrets.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${E ? `<button type="button" class="rg-b sm" data-act="copysummary">Copy case notes into the Summary</button>` : ""}`
          : `<p class="rg-oldprev">${esc(firstLine.length > 150 ? firstLine.slice(0, 148) + "…" : firstLine)}</p>`}</section>`;
    }
    return html;
  }
  function moneyHTML(s){
    const BANKS = { harbor:["Harbor Trust","trust"], porchlight:["Porchlight","porchlight"] };
    const nm = id => stripNick((simById(id) || {}).name || id);
    const mine = (data.accounts || []).filter(a => a.status !== "Closed" && (a.holder_sim === s.id || a.co_holder === s.id || (a.custodians || []).includes(s.id)));
    const rows = mine.map(a => {
      const [bank, route] = BANKS[a.bank || "harbor"];
      const who = [a.co_holder ? "Joint with " + nm(a.co_holder === s.id ? a.holder_sim : a.co_holder) : "", a.minor ? ((a.custodians || []).includes(s.id) ? "Custodian of " + nm(a.holder_sim) + "'s minor account" : "Minor account") : ""].filter(Boolean).join(", ");
      const line = a.card ? `Credit card ••${esc(a.number)}: ${money(a.balance) || "$0"} owed of ${money(a.limit) || "$0"}${a.status !== "Active" ? ", " + esc(a.status) : ""}` : `${esc(a.type)} ••${esc(a.number)}: ${money(a.balance) || "$0"}${a.status !== "Active" ? ", " + esc(a.status) : ""}`;
      return `<a class="rg-act" href="#/${route}/staff/a/${a.id}"><small>${bank}${who ? ", " + esc(who) : ""}</small>${line}</a>`;
    });
    const loans = (data.loans || []).filter(l => l.status !== "Paid off" && (l.borrower === stripNick(s.name) || (s.household && l.borrower === s.household)))
      .map(l => `<a class="rg-act" href="#/${BANKS[l.bank || "harbor"][1]}/staff"><small>${BANKS[l.bank || "harbor"][0]} loan, ${esc(l.status)}</small>${esc(l.type)}: ${money(l.balance) || "$0"} remaining</a>`);
    if (!rows.length && !loans.length && !s.credit_score) return "";
    return `<div class="rg-acts">${rows.join("")}${loans.join("")}</div>${s.credit_score ? kv("Credit score", esc(s.credit_score)) : ""}`;
  }
  function activityHTML(s){
    const ev = calEvents(s).sort((a,b) => seasonOrder(a.season) - seasonOrder(b.season) || a.day - b.day), lg = calLogs(s), pl = plans(s), ps = postsBy(s);
    const nm = typeof Notes !== "undefined" && Notes.mentionsOf ? Notes.mentionsOf(data, s) : [];
    const items = [
      ...ev.map(e => `<a class="rg-act" href="${calLink(e.season, e.day)}"><small>Calendar · ${esc(e.season)}, day ${e.day}</small>${esc(e.title)}</a>`),
      ...lg.map(l => `<a class="rg-act" href="${calLink(l.season, l.day)}"><small>Logged · Year ${l.year}, ${esc(l.season)}, day ${l.day}</small>${esc(l.title || (String(l.text || "").length > 90 ? String(l.text).slice(0, 88) + "…" : l.text || ""))}</a>`),
      ...pl.map(t => `<a class="rg-act" href="#/plumb/sim:${s.id}"><small>Plumb · ${t.done ? "Completed" : t.when === "now" ? "In progress" : "Planned"}</small>${esc(t.title)}</a>`),
      ...nm.map(n => `<a class="rg-act" href="#/notes/n/${n.id}"><small>${n.story ? "Storyline · " + esc(n.story) : "Note"} · ${esc(n.when)}</small>${esc(n.title)}</a>`),
      ...ps.slice(0, 6).map(p => `<a class="rg-act" href="#/simsta/u/${encodeURIComponent(p.author)}"><small>Simsta${p.date && p.date.season ? " · " + esc(p.date.season) + " " + p.date.day : ""}</small>${esc(p.caption ? String(p.caption).slice(0, 80) : "Post")}</a>`)];
    return items.length ? `<div class="rg-acts">${items.join("")}</div>` : "";
  }
  /* case-note formatting: ## heading, **bold**, *italic*, "- " bullets. Text is escaped first. */
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>");
  function fmtNote(block){
    const out = []; let list = [], para = [];
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    const flushList = () => { if (list.length) out.push(`<ul>${list.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`); list = []; };
    esc(block).split("\n").forEach(line => {
      const h = line.match(/^\s*#{1,3}\s+(.*)$/), b = line.match(/^\s*[-•*]\s+(.*)$/);
      if (h) { flushPara(); flushList(); out.push(`<h5>${inline(h[1])}</h5>`); }
      else if (b) { flushPara(); list.push(b[1]); }
      else if (line.trim()) { flushList(); para.push(line); }
    });
    flushPara(); flushList(); return out.join("");
  }

  /* ---------- option lists (a sheet) ---------- */
  function listsSheet(){
    return `<div class="rg-sheetwrap" data-sheetbg><form class="rg-sheet wide" data-sec="lists" role="dialog" aria-modal="true" aria-label="Option lists">
      <div class="rg-sh"><b>Option lists</b><button type="button" class="rg-x" data-act="listsclose" aria-label="Close">×</button></div>
      <div class="rg-sb"><p class="rg-help" style="margin:0">One option per line. Paste in a whole list when you add a mod. Options a Sim already has stay on the list until they're removed from that Sim.</p>
      <div class="rg-two">${LIST_KEYS.map(([k,n]) => `<label><span class="rg-flab">${n} <em>${menu(k).length}</em></span><textarea name="${k}" class="rg-input rg-listbox">${esc(menu(k).join("\n"))}</textarea></label>`).join("")}</div></div>
      <div class="rg-sfoot"><button type="button" class="rg-b quiet" data-act="listsclose">Cancel</button><button class="rg-b pri">Save lists</button></div></form></div>`;
  }

  /* ---------- full render ---------- */
  const TABS = [["profile","Profile"],["connections","Connections"],["file","File"]];
  function draw(){
    if (!curId || !simById(curId)) return drawGallery();
    const s = simById(curId), body = { profile:profileTab, connections:connectionsTab, file:fileTab }[st.tab](s);
    const nConn = linksFor(s.id).filter(l => !(st.hideSecrets && l.secret)).length;
    const keepY = root.scrollTop;
    root.innerHTML = `<div class="site-registry ${st.editing ? "is-editing" : ""}">${header(st.editing, s)}
      <div class="rg-page">${moveBanner()}
        <article class="rg-folder ${st.editing ? "editing" : ""}">
          ${fbar(s)}
          <div class="rg-fbody">
            <div class="rg-who">${portrait(s)}<div class="rg-whom">
              ${st.editing ? `<input class="rg-input rg-name" data-d="name" value="${esc(st.draft.name)}" aria-label="Full name">` : `<h2>${esc(s.name)}</h2><p class="rg-handle">${s.simsta ? esc(s.simsta) : "No Simsta handle"}</p>`}
              ${facts(s)}</div></div>
            ${st.msg ? `<p class="rg-msg ${st.err ? "err" : ""}" role="status">${esc(st.msg)}</p>` : ""}
            <div class="rg-tabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" aria-selected="${st.tab === k}">${n}${k === "connections" ? ` <em>${nConn}</em>` : ""}</button>`).join("")}</div>
            <div class="rg-tabbody">${body}</div>
          </div>
        </article>
        <p class="rg-foot">File GFB-${esc(s.file_no)}</p>
      </div>
      ${st.editing ? `<div class="rg-savebar"><span>Tabs work while editing: Connections and File are editable too.</span><button class="rg-b quiet" data-act="canceledit">Cancel</button><button class="rg-b pri" data-act="savefile" ${st.busy ? "disabled" : ""}>${st.busy ? "Saving..." : "Save file"}</button></div>` : ""}
      ${st.sheet ? sheetHTML(s) : ""}${st.lists ? listsSheet() : ""}
    </div>`;
    st.msg = ""; st.err = false;
    root.scrollTop = keepY; slimOnScroll();
    if (st.focus) { const el = root.querySelector("#rg-at-" + st.focus); st.focus = null; if (el) { el.scrollIntoView({ block:"center" }); el.querySelector("input,select,textarea")?.focus({ preventScroll:true }); } }
    if (st.sheet && st.sheet.focus === "hist") { st.sheet.focus = null; root.querySelector("#rg-sheet-hist")?.scrollIntoView({ block:"center" }); root.querySelector('[data-se="nlabel"]')?.focus({ preventScroll:true }); }
  }
  function slimOnScroll(){ const h = root && root.querySelector("#rg-agency"); if (h && curId) h.classList.toggle("slim", st.editing || root.scrollTop > 40); }

  /* ---------- Edit file ---------- */
  function startEdit(s, focus){
    const info = R().simInfo(s.id), home = homeOf(s);
    st.draft = { name:s.name, simsta:s.simsta || "", age:s.age ?? "", life_stage:s.life_stage || "", gender:s.gender || "", career:s.career || "", residence:s.residence || "", household:s.household || "", newHousehold:false,
      townie:!!info.townie, summary:info.summary || "", traits:[...(s.traits || [])], aspiration:s.aspiration || "", attachment:s.attachment || "", love_language:s.love_language || "",
      romantic_attraction:s.romantic_attraction || "", sexual_attraction:s.sexual_attraction || "", likes:[...(s.likes || [])], dislikes:[...(s.dislikes || [])], turn_ons:[...(s.turn_ons || [])], turn_offs:[...(s.turn_offs || [])],
      portrait:s.portrait || null, headshot:s.headshot || null, home:home ? home.id : "", owns:ownedBy(s).map(l => l.id) };
    st.editing = true; st.focus = focus || null; st.sheet = null;
  }
  async function saveProperty(s, homeId, owns){
    let household = s.household;
    const oldHome = homeOf(s);
    if (homeId && (!oldHome || oldHome.id !== homeId)) {
      const lot = lots().find(l => l.id === homeId);
      if (lot.household && lot.household !== household) household = lot.household;
      else if (!lot.household) {
        if (!household) household = stripNick(s.name).split(" ").slice(-1)[0] + " Household";
        for (const l of lots().filter(l => l.household === household && RESIDENTIAL.includes(l.lot_type))) await GFB.saveLot({ ...l, household:null });
        await GFB.saveLot({ ...lot, household, market_status: lot.market_status === "For lease" ? "Leased" : lot.market_status === "For sale" ? "Owner-occupied" : lot.market_status });
      }
    } else if (!homeId && oldHome && data.sims.filter(x => x.household === household).length <= 1) {
      await GFB.saveLot({ ...oldHome, household:null, market_status: oldHome.market_status === "Leased" ? "For lease" : oldHome.market_status });
    }
    const me = stripNick(s.name), want = new Set(owns);
    for (const l of lots()) {
      const mine = l.owner_sim === s.id || (!l.owner_sim && l.owner === me);
      if (want.has(l.id) && !mine) await GFB.saveLot({ ...l, owner:me });
      if (!want.has(l.id) && mine) await GFB.saveLot({ ...l, owner:null });
    }
    if (household !== s.household) await GFB.saveSim(s.id, { household });
  }
  async function saveFile(){
    const s = simById(curId), d = st.draft;
    st.busy = true; draw();
    const snap = statusSnap(data.sims.filter(x => x.id === s.id || (s.household && x.household === s.household)).map(x => x.id));
    try {
      const keys = ["name","simsta","life_stage","gender","career","residence","household","traits","aspiration","attachment","love_language","romantic_attraction","sexual_attraction","likes","dislikes","turn_ons","turn_offs","portrait","headshot"];
      const norm = (k, v) => Array.isArray(v) ? v : (v === "" ? null : v);
      const patch = {};
      keys.forEach(k => { const nv = k === "name" ? (String(d.name || "").trim() || s.name) : (["career","residence"].includes(k) ? String(d[k] || "").trim() : norm(k, typeof d[k] === "string" ? d[k].trim() : d[k])); const ov = k === "career" || k === "residence" ? (s[k] || "") : (s[k] ?? (Array.isArray(nv) ? [] : null)); if (JSON.stringify(nv) !== JSON.stringify(ov)) patch[k] = nv; });
      const age = d.age === "" || d.age == null ? null : Number(d.age); if (age !== (s.age ?? null)) patch.age = age;
      for (const [k] of [...PREF_KEYS, ["traits"]]) if (patch[k]) { const list = data.options[k] || [], add = patch[k].filter(x => !list.some(y => y.toLowerCase() === x.toLowerCase())); if (add.length) await GFB.saveOptions(k, [...list, ...add].sort((a, b) => a.localeCompare(b))); }
      if (Object.keys(patch).length) await GFB.saveSim(s.id, patch);
      data = await GFB.getAll();
      const fresh = simById(s.id), home = homeOf(fresh), owned = ownedBy(fresh).map(l => l.id).sort().join();
      if ((home ? home.id : "") !== d.home || owned !== [...d.owns].sort().join()) { await saveProperty(fresh, d.home, d.owns); data = await GFB.getAll(); }
      const info = R().simInfo(s.id), sum = String(d.summary || "").trim() || null;
      if ((info.summary || null) !== sum || !!info.townie !== !!d.townie) {
        try { await R().saveSimInfo(s.id, { summary:sum, townie:!!d.townie }); }
        catch (e) { st.busy = false; st.editing = false; st.draft = null; st.msg = "The file saved, but the Summary and Townie need the cloud: " + e.message; st.err = true; data = await GFB.getAll(); return draw(); }
      }
      data = await GFB.getAll();
      const ids = new Set([...Object.keys(snap), ...data.sims.filter(x => x.id === s.id || (simById(s.id).household && x.household === simById(s.id).household)).map(x => x.id)]);
      await logHomeChanges({ ...Object.fromEntries([...ids].map(id => [id, snap[id] || null])) });
      st.editing = false; st.draft = null; st.msg = "File saved."; st.err = false;
    } catch (e) { st.msg = e.message; st.err = true; }
    st.busy = false; data = await GFB.getAll(); draw();
  }

  /* ---------- new residents ---------- */
  async function createSim(name){
    name = String(name || "").trim(); if (!name) return;
    const existing = findSim(name);
    if (existing) { st.creating = false; location.hash = "#/registry/" + existing.id; return; }
    const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let id = slug(first(name)) || "resident";
    if (simById(id)) { id = slug(stripNick(name)); let n = 2; while (simById(id)) id = slug(stripNick(name)) + "-" + n++; }
    const file_no = String(Math.max(0, ...data.sims.map(x => parseInt(x.file_no, 10) || 0)) + 1).padStart(3, "0");
    await GFB.addSim({ id, file_no, name, simsta:null, age:null, life_stage:null, gender:null, career:"", residence:"", household:null, status:null,
      traits:[], aspiration:null, attachment:null, love_language:null, likes:[], dislikes:[], turn_ons:[], turn_offs:[], notes:[], secrets:[] });
    /* "file pending" links to this name now point at the new file, so nothing has to be relinked */
    if (R().canEdit()) for (const l of R().all().filter(l => !l.b_sim && l.b_name && l.b_name.toLowerCase() === name.toLowerCase())) { try { await R().saveLink({ ...l, b_sim:id, b_name:null }); } catch {} }
    st.creating = false; st.tab = "profile";
    data = await GFB.getAll();
    st.nextEdit = true;
    location.hash = "#/registry/" + id;
  }

  /* ---------- photos ---------- */
  async function pickPhoto(kind){
    const s = simById(curId), d = st.draft;
    if (typeof PhotoSlot === "undefined" || !PhotoSlot.ready()) {      /* not signed in to the cloud: the plain file picker still works */
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = async () => { if (!inp.files[0]) return; try { d[kind] = (await GFB.uploadImage(inp.files[0], 800)).url; } catch (err) { st.msg = err.message; st.err = true; } draw(); };
      inp.click(); return;
    }
    const head = kind === "headshot";
    const r = await PhotoSlot.open({ shape:head ? "circle" : "portrait", aspect:head ? 1 : 4 / 5, outW:800, title:head ? `Huddl headshot · ${first(s.name)}` : `File photo · ${first(s.name)}`,
      sims:[s.id], current:d[kind] || "", removable:!!d[kind], removeLabel:head ? "Remove headshot" : "Remove file photo",
      previews:head ? [{ label:"Huddl", size:44 }] : [{ label:"File", size:60 }, { label:"Card", size:44 }] });
    if (!r) return;
    d[kind] = r.removed ? null : r.url; draw();
  }

  /* ---------- events (bound once) ---------- */
  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-registry");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target, s = curId ? simById(curId) : null;
      const tla = t.closest("[data-tl]")?.dataset.tl; if (tla && s) { tlAction(tla, s); return; }
      const tlo = t.closest("[data-tlopen]"); if (tlo && s && !st.sheet) { tlOpen(tlo.dataset.tlopen, s); return; }
      const sa = t.closest("[data-sa]")?.dataset.sa;
      if (sa && st.sheet) {
        readSheetFields(); const h = st.sheet;
        if (sa === "close") { st.sheet = null; return draw(); }
        if (sa === "entryadd") { if (!h.entry.label.trim()) { h.err = "Type what happened, then Add."; return draw(); } h.history.push({ id:null, label:h.entry.label.trim(), game_date:h.entry.date, note:null }); h.entry = { ...h.entry, label:"" }; h.err = null; return draw(); }
        if (sa.startsWith("entryedit:")) { h.editEntry = Number(sa.split(":")[1]); return draw(); }
        if (sa === "entrydone") { h.editEntry = null; return draw(); }
        if (sa.startsWith("entrydel:")) { h.history.splice(Number(sa.split(":")[1]), 1); h.editEntry = null; return draw(); }
        if (sa === "delete") { const b = t.closest("[data-sa]"); if (!UI.confirmTap(b, "Tap again to delete")) return; try { await R().deleteLink(h.id); st.sheet = null; st.openLink = null; st.msg = "Connection removed from both files."; } catch (err) { h.err = err.message; } data = await GFB.getAll(); return draw(); }
        if (sa === "save") return saveSheet(s);
        return;
      }
      const sk = t.closest("[data-sk]")?.dataset.sk;
      if (sk && st.sheet) { readSheetFields(); const [k, v] = sk.split(":"); const h = st.sheet;
        if (k === "kind") { h.kind = v; }
        if (k === "fam") { const was = h.fam; h.fam = v; if (DEFAULT_LABEL[v]) { const [a, b] = DEFAULT_LABEL[v], defs = Object.values(DEFAULT_LABEL).flat(); if (!h.myLabel || defs.includes(h.myLabel)) h.myLabel = a; if (!h.theirLabel || defs.includes(h.theirLabel)) h.theirLabel = b; } if ((v === "me" || v === "them") && !(was === "me" || was === "them") && !h.id) { h.biological = true; h.raised = true; h.adoptive = false; } }
        return draw(); }
      if (t.closest("[data-sheetbg]") && !t.closest(".rg-sheet")) { st.sheet = null; st.lists = false; return draw(); }
      const ln = t.closest("[data-link]"); if (ln) { st.openLink = st.openLink === ln.dataset.link ? null : ln.dataset.link; return draw(); }
      const fl = t.closest("[data-filter]"); if (fl) { st.filter = fl.dataset.filter; return draw(); }
      const tb = t.closest("[data-tab]"); if (tb) { st.tab = tb.dataset.tab; st.openLink = null; return draw(); }
      const ad = t.closest("[data-addat]"); if (ad && s) { const [tab, key] = ad.dataset.addat.split(":"); st.tab = tab; startEdit(s, key === "owns" ? "owns" : key === "home" ? "home" : key); return draw(); }
      const ut = t.closest("[data-untrait]"); if (ut && st.draft) { st.draft.traits.splice(Number(ut.dataset.untrait), 1); return draw(); }
      const ug = t.closest("[data-untag]"); if (ug && st.draft) { const [k, i] = ug.dataset.untag.split(":"); st.draft[k].splice(Number(i), 1); return draw(); }
      const ta = t.closest("[data-tagadd]"); if (ta && st.draft) { addTag(ta.dataset.tagadd); return; }
      const pf = t.closest("[data-file]"); if (pf) { if (UI.confirmTap(pf, "Tap again to open a file")) createSim(pf.dataset.file); return; }
      const act = t.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "new") { st.creating = true; draw(); root.querySelector(".rg-newform input")?.focus(); }
      if (act === "cancel") { st.creating = false; draw(); }
      if (act === "clearbatch") { st.batch = null; draw(); }
      if (act === "moveplan") { st.move = {}; draw(); }
      if (act === "movecancel") { st.move = null; draw(); }
      if (act === "movedone") { st.move = null; draw(); }
      if (act === "movego") { st.busy = true; draw(); try { const r = await R().move(); st.move = r.already ? null : { done:r }; data = await GFB.getAll(); } catch (err) { st.move = { err:err.message }; } st.busy = false; draw(); }
      if (act === "edit" && s) { startEdit(s); draw(); }
      if (act === "canceledit") { st.editing = false; st.draft = null; draw(); }
      if (act === "savefile") saveFile();
      if (act === "hidesecrets") { st.hideSecrets = !st.hideSecrets; st.openLink = null; draw(); }
      if (act === "needmove") { st.msg = "Connections are read only until your Registry moves to its new tables. Use the banner at the top to check the counts and move."; st.err = true; draw(); root.scrollTop = 0; }
      if (act === "addlink" && s) { openSheet(s, null); draw(); }
      if (act === "editlink" && s) { const l = R().linkById(t.closest("[data-l]").dataset.l); if (l) { openSheet(s, l); draw(); } }
      if (act === "addhist" && s) { const l = R().linkById(t.closest("[data-l]").dataset.l); if (l) { openSheet(s, l, "hist"); draw(); } }
      if (act === "oldtoggle") { st.oldOpen = !st.oldOpen; draw(); }
      if (act === "copysummary" && s && st.draft) { const plain = (s.notes || []).join("\n\n").replace(/^#+\s*/gm, "").replace(/\*\*|__/g, ""); st.draft.summary = [st.draft.summary, plain].filter(x => String(x || "").trim()).join("\n\n"); st.tab = "profile"; st.focus = "summary"; draw(); }
      if (act === "lists") { st.lists = true; draw(); }
      if (act === "listsclose") { st.lists = false; draw(); }
      if (act === "portrait" && st.draft) pickPhoto("portrait");
      if (act === "headshot" && st.draft) pickPhoto("headshot");
    });
    document.addEventListener("input", e => {
      if (!mine(e.target)) return;
      if (e.target.id === "rg-q") { st.q = e.target.value; const g = root.querySelector("#rg-gal"); if (g) g.innerHTML = galCards(); return; }
      const k = e.target.dataset.d; if (k && st.draft && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") st.draft[k] = e.target.value;
    });
    document.addEventListener("change", e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.id === "rg-sort") { st.sort = t.value; return draw(); }
      if (t.id === "rg-where") { st.where = t.value; return draw(); }
      if (t.matches("[data-addtrait]") && st.draft) { if (t.value && !st.draft.traits.includes(t.value)) st.draft.traits.push(t.value); return draw(); }
      if (t.dataset.own && st.draft) { const set = new Set(st.draft.owns); t.checked ? set.add(t.dataset.own) : set.delete(t.dataset.own); st.draft.owns = [...set]; return; }
      if (t.dataset.tlf === "what" && st.tl.add) { tlRead(); st.tl.add.what = t.value; return draw(); }
      const k = t.dataset.d;
      if (k && st.draft) {
        if (t.type === "checkbox") st.draft[k] = t.checked;
        else if (k === "household" && t.value === "__new") { st.draft.newHousehold = true; st.draft.household = ""; draw(); root.querySelector('[data-d="household"]')?.focus(); }
        else st.draft[k] = t.value;
      }
      if (t.dataset.se === "enodate" && st.sheet) { readSheetFields(); draw(); }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && (st.sheet || st.lists) && root && root.querySelector(".site-registry") && !e.target.closest?.("input,textarea,select")) { e.stopImmediatePropagation(); st.sheet = null; st.lists = false; draw(); return; }
      if (!mine(e.target)) return;
      if (e.key === "Enter" && e.target.closest?.(".rg-tagadd")) { e.preventDefault(); addTag(e.target.closest(".rg-tagedit").dataset.tagkey); }
      if (e.key === "Enter" && e.target.dataset?.se === "nlabel") { e.preventDefault(); root.querySelector('[data-sa="entryadd"]')?.click(); }
      if (e.key === "Escape" && (st.sheet || st.lists)) { e.stopImmediatePropagation(); st.sheet = null; st.lists = false; draw(); }
    }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      const f = new FormData(e.target), key = e.target.dataset.sec;
      if (key === "new") return createSim(String(f.get("name") || ""));
      if (key === "lists") {
        try { for (const [k] of LIST_KEYS) await GFB.saveOptions(k, [...new Set(String(f.get(k) || "").split("\n").map(x => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))); st.msg = "Option lists saved."; }
        catch (err) { st.msg = err.message; st.err = true; }
        st.lists = false; data = await GFB.getAll(); draw();
      }
    });
  }
  function addTag(key){
    const box = root.querySelector(`.rg-tagedit[data-tagkey="${key}"]`), input = box && box.querySelector("input");
    if (!input || !st.draft) return;
    const have = new Set(st.draft[key].map(x => x.toLowerCase()));
    input.value.split(",").map(x => x.trim()).filter(Boolean).forEach(v => { if (!have.has(v.toLowerCase())) { st.draft[key].push(v); have.add(v.toLowerCase()); } });
    draw(); root.querySelector(`.rg-tagedit[data-tagkey="${key}"] input`)?.focus();
  }

  let scrollBound = null;
  function render(el, d, id, arg){
    root = el; data = d;
    if (id !== curId) { st.editing = !!st.nextEdit && !!id; st.draft = null; st.sheet = null; st.openLink = null; st.oldOpen = false; st.lists = false; st.creating = false; }
    curId = id;
    if (!id && arg && String(arg).startsWith("batch:")) { const b = String(arg).slice(6), ids = GFB.registry.batchSims ? GFB.registry.batchSims(b) : []; st.batch = { id:b, ids:ids.length ? ids : ((window.SimDeskLastImport && window.SimDeskLastImport.batch === b) ? window.SimDeskLastImport.ids : []) }; }
    if (st.editing && !st.draft && id) { startEdit(simById(id)); }
    st.nextEdit = false;
    bind();
    if (scrollBound !== el) { el.addEventListener("scroll", slimOnScroll, { passive:true }); scrollBound = el; }
    draw();
  }
  return { render };
})();
