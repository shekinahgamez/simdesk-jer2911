/* Office of Planning & Permits: the same to-do engine as Plumb, dressed as a state planning office. */
const Permits = (() => {
  const st = { open:null, editingProject:null };
  let data = null, root = null, view = "today";

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const clean = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const cal = () => data.calendar;
  const seasons = () => cal().seasons.map(s => s.name);
  const ord = w => (w.year - 1) * 84 + seasons().indexOf(w.season) * 21 + w.day;
  const todayOrd = () => ord({ ...cal().today, year: cal().year });
  const isDate = w => w && typeof w === "object";
  const dateLabel = w => `${w.season}, day ${w.day}${w.year !== cal().year ? ", Year " + w.year : ""}`;
  /* shared tables; Plumb's gameplay to-dos are tagged app:"plumb" and stay out of here */
  const todos = () => data.todos.filter(t => t.app !== "plumb");
  const projects = () => data.projects.filter(p => p.app !== "plumb");
  const project = id => projects().find(p => p.id === id);

  const ICON = {
    inbox:`<svg viewBox="0 0 20 20" fill="none" stroke="#3B82C4" stroke-width="1.8"><path d="M3 11l2-7h10l2 7v5H3z"/><path d="M3 11h4l1 2h4l1-2h4"/></svg>`,
    today:`<svg viewBox="0 0 20 20" fill="#E8A317"><path d="M10 2l2.2 5 5.3.4-4 3.5 1.2 5.2L10 13.3 5.3 16.1l1.2-5.2-4-3.5 5.3-.4z"/></svg>`,
    upcoming:`<svg viewBox="0 0 20 20" fill="none" stroke="#C2410C" stroke-width="1.8"><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/></svg>`,
    anytime:`<svg viewBox="0 0 20 20" fill="none" stroke="#2E9E4F" stroke-width="1.8"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>`,
    someday:`<svg viewBox="0 0 20 20" fill="none" stroke="#B3A57D" stroke-width="1.8"><rect x="3" y="5" width="14" height="11" rx="2"/><path d="M3 9h14M8 12h4"/></svg>`,
    logbook:`<svg viewBox="0 0 20 20" fill="none" stroke="#2E9E4F" stroke-width="1.8"><rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7.5 10l2 2 3.5-4"/></svg>`,
    save:`<svg viewBox="0 0 20 20" fill="#2E9E4F"><path d="M10 1.5l4.5 8.5L10 18.5 5.5 10z"/></svg>`,
    project:`<svg viewBox="0 0 20 20" fill="none" stroke="#2E9E4F" stroke-width="1.8"><circle cx="10" cy="10" r="7"/></svg>`
  };
  const VIEWS = [["today","On the docket"],["anytime","Open matters"],["logbook","Closed"]];

  /* case numbers: stable, derived from position */
  const pad = n => String(n).padStart(4, "0");
  const caseNo = t => { const i = todos().findIndex(x => x.id === t.id); return (t.source ? ({ "lot-build":"PRM", "lot-fill":"VAC", "sim-file":"RES" })[t.source.split(":")[0]] : "WO") + "-" + cal().year + "-" + pad(i + 1); };
  const TYPE = { PRM:"Building permit", VAC:"Vacancy", RES:"Residency file", WO:"Work order" };

  /* ---------- what the save already knows is unfinished ---------- */
  function autoItems(){
    const items = [];
    for (const l of data.lots || []){
      if (["Proposed","Permits approved","Under construction"].includes(l.build_status))
        items.push({ key:"lot-build:" + l.id, kind:"PRM", title:`${l.address}`, meta:`Construction status: ${l.build_status}`, link:"#/lotline/" + l.id });
      if (["For lease","For sale"].includes(l.market_status) && !l.household)
        items.push({ key:"lot-fill:" + l.id, kind:"VAC", title:`${l.address}`, meta:`Unoccupied, ${l.market_status.toLowerCase()}`, link:"#/lotline/" + l.id });
    }
    for (const s of data.sims){
      const g = [];
      const open = 5 - (s.traits || []).length; if (open > 0) g.push(`${open} trait${open > 1 ? "s" : ""}`);
      if (!s.aspiration) g.push("aspiration"); if (!s.love_language) g.push("love language");
      if (!s.attachment) g.push("attachment style"); if (!s.household) g.push("household");
      if (g.length) items.push({ key:"sim-file:" + s.id, kind:"RES", title:`${clean(s.name)}`, meta:"Incomplete: " + g.join(", "), link:"#/registry/" + s.id });
    }
    return items;
  }
  const autoKeys = () => new Set(autoItems().map(a => a.key));
  /* a to-do pulled from the save is done the moment the save says so */
  const isDone = t => t.done || (t.source && !autoKeys().has(t.source));

  function inView(t, v){
    if (v === "logbook") return isDone(t);
    if (isDone(t)) return false;
    if (v === "today") return t.when === "today";
    if (v === "anytime") return t.when !== "today";
    return t.project_id === v;
  }
  const count = v => todos().filter(t => inView(t, v)).length;

  /* ---------- rows ---------- */
  function rowHTML(t){
    const done = isDone(t), p = project(t.project_id);
    if (st.open === t.id) return editHTML(t);
    const meta = [];
    if (!done && t.when === "today" && view !== "today") meta.push(`<span class="today">On the docket</span>`);
    if (p && view !== p.id) meta.push(esc(p.name));
    if (t.checklist?.length) meta.push(`${t.checklist.filter(c => c.done).length}/${t.checklist.length}`);
    if (t.notes) meta.push("Findings on file");
    const cn = caseNo(t), kind = cn.split("-")[0];
    return `<div class="pl-row ${done ? "isdone" : ""}" data-open="${t.id}"><button class="pl-check ${done ? "done" : ""}" data-check="${t.id}" aria-label="${done ? "Reopen" : "Mark resolved"}" ${t.source && !t.done && done ? "disabled" : ""}></button>
      <div class="pl-body"><div class="op-case"><b>${cn}</b><span class="op-type t-${kind}">${TYPE[kind]}</span>${done ? `<img class="op-stampimg" src="sites/permits/img/stamp.png" alt="Resolved">` : ""}</div><div class="pl-t">${esc(t.title)}</div>${meta.length ? `<div class="pl-meta">${meta.map(m => m.startsWith("<span") ? m : `<span>${m}</span>`).join("")}</div>` : ""}</div></div>`;
  }

  function whenValue(w){ return isDate(w) ? "date" : (w || "inbox"); }
  function editHTML(t){
    const w = whenValue(t.when), d = isDate(t.when) ? t.when : { ...cal().today, year: cal().year };
    return `<form class="pl-row open pl-edit" id="pl-edit" data-id="${t.id}">
      <button type="button" class="pl-check ${isDone(t) ? "done" : ""}" data-check="${t.id}" aria-label="Mark done"></button>
      <div class="pl-body">
        <input class="pl-et" name="title" value="${esc(t.title)}" placeholder="Matter" aria-label="Matter">
        <textarea name="notes" placeholder="Findings">${esc(t.notes)}</textarea>
        ${t.source ? `<p class="pl-meta"><span class="src">Filed automatically.</span>&nbsp;Resolves itself when the record is complete.</p>` : ""}
        <div class="pl-cl">${(t.checklist || []).map((c, i) => `<div class="pl-cli ${c.done ? "done" : ""}"><button type="button" class="pl-mini ${c.done ? "done" : ""}" data-cl="${i}" aria-label="Toggle"></button><input type="text" name="cl${i}" value="${esc(c.t)}"><button type="button" class="pl-x" data-clrm="${i}" aria-label="Remove">\u00d7</button></div>`).join("")}
          <div class="pl-cli"><span class="pl-mini" style="border-style:dashed"></span><input type="text" id="pl-cladd" placeholder="Add a condition"></div></div>
        <div class="pl-bar">
          <select name="when" aria-label="Status"><option value="today" ${t.when==="today"?"selected":""}>On the docket</option><option value="anytime" ${t.when!=="today"?"selected":""}>Open matter</option></select>
          <select name="project_id" aria-label="Project"><option value="">No case file</option>${projects().map(p => `<option value="${p.id}" ${p.id===t.project_id?"selected":""}>${esc(p.name)}</option>`).join("")}</select>
          <span class="spacer"></span>
          <button type="button" class="pl-del" data-del="${t.id}">Withdraw</button>
          <button class="pl-btn green" type="submit">Save</button>
        </div>
      </div></form>`;
  }

  /* full filing form: every field up front */
  function fileHTML(){
    const p = project(view);
    return `<form class="pl-row open pl-edit op-file" id="op-file">
      <div class="pl-body"><div class="op-case"><b>New work order</b><span class="op-type t-WO">Work order</span></div>
        <input class="pl-et" name="title" placeholder="Matter, like &quot;Recolor the Fillies jackets&quot;" aria-label="Matter" required>
        <span class="op-lbl">Findings</span><textarea name="notes" placeholder="Details, links, anything you'll need later"></textarea>
        <span class="op-lbl">Conditions</span><textarea name="conditions" class="op-conds" placeholder="One per line. Each becomes a checklist item."></textarea>
        <div class="pl-bar">
          <select name="when" aria-label="Status"><option value="today" ${view==="today"?"selected":""}>On the docket</option><option value="anytime" ${view!=="today"?"selected":""}>Open matter</option></select>
          <select name="project_id" aria-label="Case file"><option value="">No case file</option>${projects().map(x => `<option value="${x.id}" ${p && x.id===p.id?"selected":""}>${esc(x.name)}</option>`).join("")}</select>
          <span class="spacer"></span>
          <button type="button" class="pl-btn" data-cancelfile>Cancel</button>
          <button class="pl-btn green" type="submit">File it</button>
        </div></div></form>`;
  }

  function readEdit(form){
    const f = new FormData(form), v = k => (f.get(k) || "").trim();
    const t = todos().find(x => x.id === form.dataset.id);
    const w = v("when");
    const checklist = (t.checklist || []).map((c, i) => ({ ...c, t: (f.get("cl" + i) || "").trim() || c.t }));
    return { ...t, title: v("title") || "Untitled", notes: v("notes"), checklist, project_id: v("project_id") || null,
      when: w === "today" ? "today" : "anytime" };
  }

  /* ---------- views ---------- */
  function listHTML(list, emptyMsg){ return list.length ? list.map(rowHTML).join("") : `<p class="pl-empty">${emptyMsg}</p>`; }

  function mainHTML(){
    const p = project(view);
    const addBar = view === "logbook" || view === "save" ? "" : (st.filing ? fileHTML() : `<button class="pl-add op-filebtn" data-file><span class="pl-plus"></span>File a work order</button>`);
    if (view === "save"){
      const pulled = new Set(todos().filter(t => t.source && !isDone(t)).map(t => t.source));
      const items = autoItems();
      const groups = [["PRM","Building permits","Lots approved or proposed but not yet built."],["RES","Residency files","Residents whose state records are incomplete."],["VAC","Vacancies","Units on the market with no household."]];
      return `<div class="pl-title"><h1>Pending applications</h1></div>
        <p class="pl-sub">Unfinished business the state already knows about: lots that haven't been built, residents with incomplete files, and empty units. Docket one to work it today. Each closes on its own once the record is complete.</p>
        ${groups.map(([k, label, sub]) => { const list = items.filter(a => a.kind === k); return list.length ? `<section class="pl-group"><h2>${label}<span>${list.length}</span></h2><p class="op-gsub">${sub}</p>${list.map((a, i) => `<div class="pl-auto"><div class="pl-body"><div class="op-case"><b>${k}-${cal().year}-${pad(i + 1)}</b><span class="op-type t-${k}">${TYPE[k]}</span></div><div class="pl-t">${esc(a.title)}</div><div class="pl-meta">${esc(a.meta)}</div></div>
          <div class="acts">${pulled.has(a.key) ? `<span class="pl-meta" style="align-self:center">On the docket</span>` : `<button class="pl-btn" data-pull="${esc(a.key)}">Docket it</button>`}</div></div>`).join("")}</section>` : ""; }).join("") || `<p class="pl-empty">No pending applications.</p>`}`;
    }
    if (p){
      const items = todos().filter(t => t.project_id === p.id && !isDone(t));
      const done = todos().filter(t => t.project_id === p.id && isDone(t)).length;
      return `<div class="pl-title"><span class="op-cf">Case file</span>${st.editingProject === p.id ? `<form id="pl-projname" style="flex:1"><input class="pl-titleinput" name="name" value="${esc(p.name)}" aria-label="Project name"></form>` : `<h1 data-renameproj="${p.id}" title="Tap to rename">${esc(p.name)}</h1>`}</div>
        <p class="pl-sub">A case file keeps related matters together under one name.${p.area ? " Filed under " + esc(p.area) + "." : ""}${done ? ` ${done} resolved.` : ""} <button class="pl-del" data-delproj="${p.id}" style="margin-left:8px">Close case file</button></p>
        ${addBar}${listHTML(items, "No open matters in this case file.")}`;
    }
    const titles = Object.fromEntries(VIEWS);
    const head = `<div class="pl-title"><h1>${titles[view]}</h1></div>`;
    if (view === "today"){
      const items = todos().filter(t => inView(t, "today"));
      const t = cal().today;
      return `${head}<p class="pl-sub">Matters the office is actively working right now. When one's finished, mark it resolved; when it stalls, move it back to open matters.</p>${addBar}${listHTML(items, "The docket is clear. Pull something from open matters or pending applications.")}`;
    }
    if (view === "upcoming"){
      const items = todos().filter(t => inView(t, "upcoming")).sort((a,b) => ord(a.when) - ord(b.when));
      const groups = {};
      items.forEach(t => (groups[dateLabel(t.when)] = groups[dateLabel(t.when)] || []).push(t));
      return `${head}<p class="pl-sub">Matters set for a specific day in the save. When that day arrives, they move onto the docket on their own. To schedule one, open any matter and choose "Schedule a hearing."</p>${Object.keys(groups).length ? Object.entries(groups).map(([k, list]) => `<section class="pl-group"><h2>${esc(k)}<span>${list.length}</span></h2>${list.map(rowHTML).join("")}</section>`).join("") : `<p class="pl-empty">No hearings scheduled.</p>`}`;
    }
    if (view === "logbook"){
      const items = todos().filter(t => inView(t, "logbook")).sort((a,b) => (b.done_at || "").localeCompare(a.done_at || ""));
      return `${head}<p class="pl-sub">Resolved matters, kept for the record.</p>${listHTML(items, "No closed matters yet.")}`;
    }
    if (view === "anytime"){
      const items = todos().filter(t => inView(t, "anytime"));
      const loose = items.filter(t => !t.project_id);
      const byProj = projects().map(p => [p, items.filter(t => t.project_id === p.id)]).filter(([, l]) => l.length);
      return `${head}<p class="pl-sub">Everything filed with the office that isn't being worked yet, grouped by case file. Open one and set it to "On the docket" when you start on it.</p>${addBar}${loose.map(rowHTML).join("")}
        ${byProj.map(([p, l]) => `<section class="pl-group"><h2>${esc(p.name)}<span>${l.length}</span></h2>${l.map(rowHTML).join("")}</section>`).join("")}${!items.length ? `<p class="pl-empty">Nothing here.</p>` : ""}`;
    }
    const items = todos().filter(t => inView(t, view));
    const sub = { inbox:"Anything just submitted lands here first. File it now; put it on the docket or in a case file later.", someday:"Matters tabled for a later session. Out of the way until the office is ready to look at them again." }[view] || "";
    return `${head}<p class="pl-sub">${sub}</p>${addBar}${listHTML(items, view === "inbox" ? "No new filings." : "Nothing under review.")}`;
  }

  function sideHTML(){
    const nav = (k, label, icon, ct) => `<button class="pl-nav" data-view="${k}" aria-current="${view===k}"><span class="ic">${icon}</span>${esc(label)}${ct ? `<span class="ct">${ct}</span>` : ""}</button>`;
    const areas = [...new Set([...(data.permits_areas || []), ...projects().map(p => p.area).filter(Boolean)])];
    return `<aside class="pl-side"><div class="op-agency"><img src="sites/permits/img/seal.png" alt="Seal of the Simerican Office of Planning &amp; Permits"><div><small>Simerican Government</small><b>Office of Planning &amp; Permits</b></div></div>
      ${nav("save", "Pending applications", "", autoItems().length)}<div class="pl-gap"></div>
      ${VIEWS.map(([k,v]) => nav(k, v, "", ["today","anytime"].includes(k) ? count(k) : "")).join("")}<div class="pl-gap"></div><div class="pl-area" style="padding-top:0">Case files</div>
      ${areas.map(a => `<div class="pl-area">${esc(a)}</div>${projects().filter(p => p.area === a).map(p => nav(p.id, p.name, ICON.project, count(p.id))).join("")}`).join("")}
      ${projects().filter(p => !p.area).map(p => nav(p.id, p.name, ICON.project, count(p.id))).join("")}
      <button class="pl-newproj" data-newproj>+ Open a case file</button></aside>`;
  }

  function draw(){ root.innerHTML = `<div class="site-op">${sideHTML()}<main class="pl-main">${mainHTML()}</main></div>`; }

  /* ---------- events ---------- */
  async function saveOpen(){ const form = root.querySelector("#pl-edit"); if (form) await GFB.saveTodo(readEdit(form)); }

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-op");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target, x = k => t.closest(`[data-${k}]`)?.dataset[k];
      if (x("check") !== undefined && t.closest("[data-check]")) {
        const id = x("check"); await saveOpen(); const td = todos().find(v => v.id === id);
        if (td.source && !td.done && isDone(td)) return;
        await GFB.saveTodo({ ...td, done: !td.done, done_at: !td.done ? new Date().toISOString() : null }); draw(); return;
      }
      if (x("cl") !== undefined && t.closest("[data-cl]")) { const form = root.querySelector("#pl-edit"); const td = readEdit(form); td.checklist[+x("cl")].done = !td.checklist[+x("cl")].done; await GFB.saveTodo(td); draw(); return; }
      if (x("clrm") !== undefined && t.closest("[data-clrm]")) { const form = root.querySelector("#pl-edit"); const td = readEdit(form); td.checklist.splice(+x("clrm"), 1); await GFB.saveTodo(td); draw(); return; }
      if (t.closest("[data-file]")) { await saveOpen(); st.open = null; st.filing = true; draw(); root.querySelector("#op-file .pl-et")?.focus(); return; }
      if (t.closest("[data-cancelfile]")) { st.filing = false; draw(); return; }
      if (x("del")) { if (UI.confirmTap(t.closest("[data-del]"), "Tap again to withdraw")) { await GFB.deleteTodo(x("del")); st.open = null; draw(); } return; }
      if (x("pull")) { const a = autoItems().find(v => v.key === x("pull")); await GFB.saveTodo({ title:({PRM:"Build ", VAC:"Fill ", RES:"Complete residency file: "})[a.kind] + a.title, notes:a.meta, when:"today", project_id:null, checklist:[], done:false, source:a.key, link:a.link }); draw(); return; }
      if (x("view")) { await saveOpen(); st.open = null; st.filing = false; location.hash = "#/permits/" + x("view"); return; }
      if (t.closest("[data-newproj]")) { const p = await GFB.saveProject({ name:"New case file", area:(data.permits_areas || [])[0] || null }); st.editingProject = p.id; location.hash = "#/permits/" + p.id; return; }
      if (x("renameproj")) { st.editingProject = x("renameproj"); draw(); root.querySelector("#pl-projname input")?.select(); return; }
      if (x("delproj")) { if (UI.confirmTap(t.closest("[data-delproj]"), "Tap again: matters stay open")) { for (const td of todos().filter(v => v.project_id === x("delproj"))) await GFB.saveTodo({ ...td, project_id:null }); await GFB.deleteProject(x("delproj")); location.hash = "#/permits/anytime"; } return; }
      const row = t.closest("[data-open]");
      if (row && !t.closest("button")) { await saveOpen(); st.open = row.dataset.open; draw(); root.querySelector("#pl-edit .pl-et")?.focus(); return; }
      if (st.open && !t.closest("#pl-edit")) { await saveOpen(); st.open = null; draw(); }
    });
    document.addEventListener("change", e => {
      if (e.target.name === "when" && e.target.closest("#pl-edit")) { const on = e.target.value === "date"; e.target.closest("#pl-edit").querySelectorAll('select[name=season],select[name=day],select[name=year]').forEach(s => s.hidden = !on); }
    });
    document.addEventListener("keydown", async e => {
      if (!mine(e.target)) return;
      if (e.key === "Enter" && e.target.id === "pl-cladd") { e.preventDefault(); const val = e.target.value.trim(); if (!val) return; const td = readEdit(root.querySelector("#pl-edit")); td.checklist = [...td.checklist, { t:val, done:false }]; await GFB.saveTodo(td); draw(); root.querySelector("#pl-cladd")?.focus(); }
      if (e.key === "Escape" && st.open) { e.stopImmediatePropagation(); await saveOpen(); st.open = null; draw(); }
    }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      if (e.target.id === "op-file") {
        const f = new FormData(e.target), v = k => (f.get(k) || "").trim();
        if (!v("title")) return;
        await GFB.saveTodo({ title:v("title"), notes:v("notes"), when:v("when") === "today" ? "today" : "anytime", project_id:v("project_id") || null,
          checklist: v("conditions").split("\n").map(x => x.trim()).filter(Boolean).map(t => ({ t, done:false })), done:false });
        st.filing = false; draw(); return;
      }
      if (e.target.id === "pl-edit") { await saveOpen(); st.open = null; draw(); return; }
      if (e.target.id === "pl-projname") { const p = project(view); await GFB.saveProject({ ...p, name: new FormData(e.target).get("name").trim() || p.name }); st.editingProject = null; draw(); }
    });
  }

  function render(el, d, parts){
    root = el; data = d;
    const v = (parts || [])[0];
    view = v && (VIEWS.some(([k]) => k === v) || v === "save" || d.projects.some(p => p.id === v)) ? v : "today";
    if (st.editingProject && st.editingProject !== view) st.editingProject = null;
    bind(); draw();
  }
  return { render, label: () => ({ save:"Pending applications" })[view] || (VIEWS.find(([k]) => k === view) || [, (projects().find(p => p.id === view) || {}).name])[1] };
})();
