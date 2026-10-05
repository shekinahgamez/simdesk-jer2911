/* Huddl: company pages for Simerica's institutions (organizations with type "Institution").
   Reads and saves through GFB (assets/data.js). Placeholder brand until the real branding lands. */
const Huddl = (() => {
  const st = { q:"", cat:"All", modal:null, err:null };
  let data = null, root = null, route = [];

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const norm = n => stripNick(n).toLowerCase();
  const initials = n => stripNick(n).split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const tint = s => `hsl(${230 + hue(s) % 60} 45% 42%)`;
  const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="currentColor"/><g fill="#fff"><rect x="16" y="14" width="10" height="36" rx="3"/><rect x="38" y="14" width="10" height="36" rx="3"/><rect x="22" y="27" width="20" height="10" rx="3"/></g></svg>`;
  const orgs = () => data.organizations.filter(o => o.type === "Institution");
  const byId = id => data.organizations.find(o => o.id === id);
  const simById = id => data.sims.find(s => s.id === id);
  const simFor = m => (m.sim && simById(m.sim)) || data.sims.find(s => norm(s.name) === norm(m.name));
  const lotById = id => data.lots.find(l => l.id === id);
  const go = h => { location.hash = "#/huddl" + (h ? "/" + h : ""); };
  const cats = () => [...new Set(orgs().map(o => o.category).filter(Boolean))].sort();
  const tile = (o, cls = "") => `<span class="hd-tile ${cls}" style="background:${tint(o.name)}">${esc(initials(o.name))}</span>`;
  const person = (m, big) => { const s = simFor(m); return `<span class="hd-av${big ? " big" : ""}" style="background:${tint(m.name)}">${esc(initials(m.name))}</span>`; };
  const nameLink = m => { const s = simFor(m); return s ? `<a class="hd-link" href="#/registry/${s.id}">${esc(m.name)}</a>` : esc(m.name); };

  /* ---------- pages ---------- */
  function homePage() {
    const q = st.q.toLowerCase();
    const list = orgs().filter(o => (st.cat === "All" || o.category === st.cat) && (!q || [o.name, o.category, o.about].join(" ").toLowerCase().includes(q)));
    const hiring = orgs().flatMap(o => (o.positions || []).map(p => ({ o, p })));
    return `<div class="hd-wrap"><div class="hd-main">
        <div class="hd-head"><div><h1>Companies</h1><p class="hd-sub">${orgs().length} on Huddl</p></div><button class="hd-btn" data-hd="new">Add a company</button></div>
        <div class="hd-filters"><input class="hd-search" id="hd-q" type="search" placeholder="Search companies" aria-label="Search companies" value="${esc(st.q)}">
          <div class="hd-chips">${["All", ...cats()].map(c => `<button class="hd-chip" data-cat="${esc(c)}" aria-pressed="${st.cat === c}">${esc(c)}</button>`).join("")}</div></div>
        <div id="hd-list" class="hd-grid">${cardsHTML(list)}</div></div>
      <aside class="hd-side"><div class="hd-card"><h3>Open positions</h3>${hiring.length ? hiring.map(({ o, p }) => `<a class="hd-job" href="#/huddl/org/${o.id}">${tile(o, "sm")}<span><b>${esc(p.title)}</b><br><small>${esc(o.name)}${p.dept ? ", " + esc(p.dept) : ""}</small></span></a>`).join("") : `<p class="hd-none">Nothing open right now. Add a position on a company page.</p>`}</div></aside></div>`;
  }
  function cardsHTML(list) {
    if (!list.length) return `<p class="hd-none">No companies match.</p>`;
    return list.map(o => `<a class="hd-co" href="#/huddl/org/${o.id}">${tile(o)}<span class="hd-co-t"><b>${esc(o.name)}</b>${o.category ? `<small>${esc(o.category)}</small>` : ""}<span class="hd-co-a">${esc(o.about)}</span><small>${(o.members || []).filter(m => m.current !== false).length} people</small></span></a>`).join("");
  }

  function orgPage(o) {
    const cur = (o.members || []).map((m, i) => ({ m, i })).filter(x => x.m.current !== false), former = (o.members || []).map((m, i) => ({ m, i })).filter(x => x.m.current === false);
    const lot = o.lot && lotById(o.lot), related = (o.related || []).map(r => ({ o2:byId(r.org), kind:r.kind })).filter(r => r.o2);
    const leaderM = { name:o.leader }, ls = o.leader && simFor(leaderM);
    const row = ({ m, i }) => `<div class="hd-person">${person(m, true)}<span class="hd-pt"><b>${nameLink(m)}</b><br><span>${esc([m.role, m.dept].filter(Boolean).join(", ") || " ")}${m.since ? ` <i>since ${esc(m.since)}</i>` : ""}</span></span><button class="hd-mini" data-hd="person:${o.id}:${i}" aria-label="Edit ${esc(m.name)}">Edit</button></div>`;
    return `<div class="hd-wrap one"><div class="hd-main">
      <a class="hd-back" href="#/huddl">All companies</a>
      <div class="hd-banner"><div class="hd-pattern"></div>${tile(o, "xl")}</div>
      <div class="hd-card hd-title"><div class="hd-row"><div><h1>${esc(o.name)}</h1><p class="hd-sub">${esc([o.category, o.district, o.status !== "Active" ? o.status : ""].filter(Boolean).join(" \u00b7 "))}</p></div>
        <div class="hd-acts">${o.app ? `<a class="hd-btn ghost" href="#/${o.app}">Open ${esc(o.name)}</a>` : ""}<button class="hd-btn ghost" data-hd="org:${o.id}">Edit page</button></div></div>
        ${o.tagline ? `<p class="hd-tag">${esc(o.tagline)}</p>` : ""}<p class="hd-about">${esc(o.about) || '<span class="hd-none">No description yet.</span>'}</p></div>
      <div class="hd-two"><div class="hd-card"><h3>People <small>${cur.length}</small><button class="hd-mini" data-hd="person:${o.id}:new">Add person</button></h3>
          ${cur.length ? cur.map(row).join("") : `<p class="hd-none">No one listed yet.</p>`}
          ${former.length ? `<h4>Former</h4>${former.map(row).join("")}` : ""}</div>
        <div class="hd-stack"><div class="hd-card"><h3>Details</h3><dl class="hd-dl">
            ${o.founded_text ? `<div><dt>Founded</dt><dd>${esc(o.founded_text)}</dd></div>` : ""}
            <div><dt>Led by</dt><dd>${o.leader ? (ls ? `<a class="hd-link" href="#/registry/${ls.id}">${esc(o.leader)}</a>` : esc(o.leader)) : '<span class="hd-none">Not set</span>'}</dd></div>
            <div><dt>Based at</dt><dd>${lot ? `<a class="hd-link" href="#/lotline/${lot.id}">${esc(lot.address)}</a>` : '<span class="hd-none">No lot yet</span>'}</dd></div>
            ${related.length ? `<div><dt>Related</dt><dd>${related.map(r => `<a class="hd-link" href="#/huddl/org/${r.o2.id}">${esc(r.o2.name)}</a> <small>${esc(r.kind)}</small>`).join("<br>")}</dd></div>` : ""}</dl></div>
          <div class="hd-card"><h3>Open positions <button class="hd-mini" data-hd="pos:${o.id}:new">Add</button></h3>
            ${(o.positions || []).length ? o.positions.map(p => `<div class="hd-pos"><span><b>${esc(p.title)}</b>${p.dept ? `<br><small>${esc(p.dept)}</small>` : ""}${p.notes ? `<br><small>${esc(p.notes)}</small>` : ""}</span><button class="hd-mini" data-hd="pos:${o.id}:${p.id}">Edit</button></div>`).join("") : `<p class="hd-none">None open.</p>`}</div>
          ${o.notes ? `<div class="hd-card"><h3>Staff notes <small>Private</small></h3><p class="hd-notes">${esc(o.notes)}</p></div>` : ""}</div></div></div></div>`;
  }

  /* ---------- forms ---------- */
  const simList = () => `<datalist id="hd-sims">${data.sims.map(s => `<option value="${esc(stripNick(s.name))}">`).join("")}</datalist>`;
  const field = (label, inner) => `<label class="hd-f"><span>${label}</span>${inner}</label>`;
  const acts = extra => `<div class="hd-fa">${extra || ""}<button type="button" class="hd-btn ghost" data-hd="close">Cancel</button><button class="hd-btn" type="submit">Save</button></div>`;
  function modal() {
    const [kind, a, b] = (st.modal || "").split(":"), err = st.err ? `<p class="hd-err">${esc(st.err)}</p>` : "";
    if (kind === "org") {
      const o = a === "new" ? { status:"Active", members:[], positions:[] } : byId(a);
      return `<form class="hd-form" data-f="org"><h2>${a === "new" ? "Add a company" : "Edit page"}</h2>
        ${field("Name", `<input name="name" value="${esc(o.name)}" required>`)}
        <div class="hd-f2">${field("Category", `<input name="category" list="hd-cats" value="${esc(o.category)}"><datalist id="hd-cats">${cats().map(c => `<option value="${esc(c)}">`).join("")}</datalist>`)}${field("Status", `<select name="status">${["Active","Forming","Closed"].map(x => `<option ${o.status === x ? "selected" : ""}>${x}</option>`).join("")}</select>`)}</div>
        ${field("Tagline", `<input name="tagline" value="${esc(o.tagline)}">`)}
        ${field("About", `<textarea name="about">${esc(o.about)}</textarea>`)}
        <div class="hd-f2">${field("Founded", `<input name="founded_text" value="${esc(o.founded_text)}" placeholder="Year or in-game date">`)}${field("District", `<input name="district" value="${esc(o.district)}">`)}</div>
        <div class="hd-f2">${field("Led by", `<input name="leader" list="hd-sims" value="${esc(o.leader)}" autocomplete="off">`)}${field("Based at", `<select name="lot"><option value="">No lot yet</option>${data.lots.filter(l => !l.parent_id || l.id === o.lot).map(l => `<option value="${l.id}" ${o.lot === l.id ? "selected" : ""}>${esc(l.address)}</option>`).join("")}</select>`)}</div>
        ${field("Staff notes (private)", `<textarea name="notes">${esc(o.notes)}</textarea>`)}${simList()}${err}
        ${acts(a === "new" ? "" : `<button type="button" class="hd-btn danger" data-hd="del:${o.id}">Delete</button><span class="hd-grow"></span>`)}</form>`;
    }
    if (kind === "person") {
      const o = byId(a), m = b === "new" ? { current:true } : o.members[+b];
      return `<form class="hd-form" data-f="person"><h2>${b === "new" ? "Add a person" : "Edit person"}</h2>
        ${field("Name", `<input name="name" list="hd-sims" value="${esc(m.name)}" required autocomplete="off">`)}
        <div class="hd-f2">${field("Title", `<input name="role" value="${esc(m.role)}">`)}${field("Department", `<input name="dept" value="${esc(m.dept)}">`)}</div>
        ${field("Since", `<input name="since" value="${esc(m.since)}" placeholder="Optional">`)}
        <label class="hd-ck"><input type="checkbox" name="current" ${m.current !== false ? "checked" : ""}> Currently works here</label>${simList()}${err}
        ${acts(b === "new" ? "" : `<button type="button" class="hd-btn danger" data-hd="delp:${o.id}:${b}">Remove</button><span class="hd-grow"></span>`)}</form>`;
    }
    if (kind === "pos") {
      const o = byId(a), p = b === "new" ? {} : o.positions.find(x => x.id === b);
      return `<form class="hd-form" data-f="pos"><h2>${b === "new" ? "Add a position" : "Edit position"}</h2>
        ${field("Title", `<input name="title" value="${esc(p.title)}" required>`)}${field("Department", `<input name="dept" value="${esc(p.dept)}">`)}${field("Notes", `<textarea name="notes">${esc(p.notes)}</textarea>`)}${err}
        ${acts(b === "new" ? "" : `<button type="button" class="hd-btn danger" data-hd="delpos:${o.id}:${b}">Remove</button><span class="hd-grow"></span>`)}</form>`;
    }
    return "";
  }

  /* ---------- draw ---------- */
  function draw() {
    const o = route[0] === "org" ? byId(route[1]) : null;
    const body = route[0] === "org" ? (o ? orgPage(o) : `<div class="hd-wrap one"><p class="hd-none">That company isn't on Huddl.</p><a class="hd-link" href="#/huddl">All companies</a></div>`) : homePage();
    root.innerHTML = `<div class="site-hd"><header class="hd-bar"><a class="hd-logo" href="#/huddl">${MARK}<span>Huddl</span></a></header>${body}${st.modal ? `<div class="hd-modal" data-close>${modal()}</div>` : ""}</div>`;
  }
  async function refresh() { data = await GFB.getAll(); draw(); }

  async function submit(form) {
    const f = new FormData(form), v = k => String(f.get(k) || "").trim(), [, a, b] = (st.modal || "").split(":");
    try {
      if (form.dataset.f === "org") {
        const old = a === "new" ? null : byId(a);
        const row = { ...(old || { type:"Institution", members:[], positions:[], related:[], tagline:"", app:"" }), name:v("name"), category:v("category"), status:v("status"), tagline:v("tagline"), about:v("about"), founded_text:v("founded_text"), district:v("district"), leader:v("leader"), lot:v("lot") || null, notes:v("notes") };
        if (!old) row.id = "org-" + slug(row.name) + "-" + Math.random().toString(36).slice(2, 5);
        if (row.leader && !(row.members || []).some(m => norm(m.name) === norm(row.leader))) row.members = [...(row.members || []), { name:row.leader, sim:null, role:"Leader", dept:"", since:"", current:true }];
        const saved = await GFB.saveOrg(row); st.modal = null; await refresh(); if (!old) go("org/" + saved.id); return;
      }
      const o = byId(a);
      if (form.dataset.f === "person") {
        const s = data.sims.find(x => norm(x.name) === norm(v("name")));
        const m = { name:s ? s.name : v("name"), sim:s ? s.id : null, role:v("role"), dept:v("dept"), since:v("since"), current:!!f.get("current") };
        const members = [...(o.members || [])]; if (b === "new") members.push(m); else members[+b] = m;
        await GFB.saveOrg({ id:o.id, members });
      }
      if (form.dataset.f === "pos") {
        const p = { id:b === "new" ? rid("pos-") : b, title:v("title"), dept:v("dept"), notes:v("notes") };
        const positions = [...(o.positions || [])]; const i = positions.findIndex(x => x.id === p.id); if (i >= 0) positions[i] = p; else positions.push(p);
        await GFB.saveOrg({ id:o.id, positions });
      }
      st.modal = null; st.err = null; await refresh();
    } catch (err) { st.err = err.message; draw(); }
  }

  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-hd");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.matches("[data-close]") && t === e.target && t.classList.contains("hd-modal")) { st.modal = null; st.err = null; draw(); return; }
      const cat = t.closest("[data-cat]"); if (cat) { st.cat = cat.dataset.cat; draw(); return; }
      const b = t.closest("[data-hd]"); if (!b) return;
      const [act, a, c] = b.dataset.hd.split(":");
      if (act === "new") st.modal = "org:new";
      else if (act === "close") { st.modal = null; st.err = null; }
      else if (["org", "person", "pos"].includes(act)) st.modal = b.dataset.hd;
      else if (act === "del") { if (!UI.confirmTap(b, "Tap again to delete")) return; await GFB.deleteOrg(a); st.modal = null; await refresh(); go(""); return; }
      else if (act === "delp") { if (!UI.confirmTap(b, "Tap again to remove")) return; const o = byId(a); await GFB.saveOrg({ id:o.id, members:o.members.filter((_, i) => i !== +c) }); st.modal = null; await refresh(); return; }
      else if (act === "delpos") { if (!UI.confirmTap(b, "Tap again to remove")) return; const o = byId(a); await GFB.saveOrg({ id:o.id, positions:o.positions.filter(p => p.id !== c) }); st.modal = null; await refresh(); return; }
      st.err = null; draw();
    });
    document.addEventListener("input", e => { if (mine(e.target) && e.target.id === "hd-q") { st.q = e.target.value; const l = root.querySelector("#hd-list"); const q = st.q.toLowerCase(); if (l) l.innerHTML = cardsHTML(orgs().filter(o => (st.cat === "All" || o.category === st.cat) && (!q || [o.name, o.category, o.about].join(" ").toLowerCase().includes(q)))); } });
    document.addEventListener("submit", e => { if (mine(e.target) && e.target.dataset.f) { e.preventDefault(); submit(e.target); } });
  }
  let lastKey = null;
  function render(el, d, parts) { root = el; data = d; route = parts || []; const key = route.join("/"); if (key !== lastKey) { st.modal = null; st.err = null; lastKey = key; } bind(); draw(); }
  function address(parts) { const [v, id] = parts || []; if (v === "org") return "/company/" + (byId(id) ? slug(byId(id).name) : id); return "/companies"; }
  return { render, address };
})();
