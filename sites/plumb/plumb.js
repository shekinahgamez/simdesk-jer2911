/* Plumb: gameplay to-dos. Goals, storylines, drama to set up. Optionally tied to Sims. */
const Plumb = (() => {
  const st = { open:null, filing:false, editingProject:null };
  let data = null, root = null, view = "now";

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const clean = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const todos = () => data.todos.filter(t => t.app === "plumb");
  const projects = () => data.projects.filter(p => p.app === "plumb");
  const project = id => projects().find(p => p.id === id);
  const simName = id => clean((data.sims.find(s => s.id === id) || {}).name || id);

  const ICON = {
    now:`<svg viewBox="0 0 20 20" fill="#E8A317"><path d="M10 2l2.2 5 5.3.4-4 3.5 1.2 5.2L10 13.3 5.3 16.1l1.2-5.2-4-3.5 5.3-.4z"/></svg>`,
    next:`<svg viewBox="0 0 20 20" fill="none" stroke="#2E9E4F" stroke-width="1.8"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>`,
    done:`<svg viewBox="0 0 20 20" fill="none" stroke="#2E9E4F" stroke-width="1.8"><rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7.5 10l2 2 3.5-4"/></svg>`,
    sims:`<svg viewBox="0 0 20 20" fill="none" stroke="#3B82C4" stroke-width="1.8"><circle cx="10" cy="7" r="3.2"/><path d="M4 17c.8-3.3 3.1-5 6-5s5.2 1.7 6 5"/></svg>`,
    project:`<svg viewBox="0 0 20 20" fill="none" stroke="#2E9E4F" stroke-width="1.8"><circle cx="10" cy="10" r="7"/></svg>`,
    mark:`<svg viewBox="0 0 20 20" fill="#2E9E4F"><path d="M10 1.5l4.5 8.5L10 18.5 5.5 10z"/></svg>`
  };
  const VIEWS = [["now","Working on"],["next","Up next"],["done","Done"]];
  const SUBS = {
    now:"What you're playing toward right now.",
    next:"Everything else you want to happen in the save. Move one to Working on when you start on it.",
    done:"Goals reached and storylines played out."
  };

  function inView(t, v){
    if (v === "done") return t.done;
    if (t.done) return false;
    if (v === "now") return t.when === "now";
    if (v === "next") return t.when !== "now";
    if (v.startsWith("sim:")) return (t.sims || []).includes(v.slice(4));
    return t.project_id === v;
  }
  const count = v => todos().filter(t => inView(t, v)).length;

  /* ---------- rows ---------- */
  function rowHTML(t){
    if (st.open === t.id) return editHTML(t);
    const p = project(t.project_id), meta = [];
    if (!t.done && t.when === "now" && view !== "now") meta.push(`<span class="today">Working on</span>`);
    if (p && view !== p.id) meta.push(`<span>${esc(p.name)}</span>`);
    (t.sims || []).forEach(id => meta.push(`<span class="pl-sim">${esc(simName(id))}</span>`));
    if (t.checklist?.length) meta.push(`<span>${t.checklist.filter(c => c.done).length}/${t.checklist.length}</span>`);
    if (t.notes) meta.push(`<span>Notes</span>`);
    return `<div class="pl-row ${t.done ? "isdone" : ""}" data-open="${t.id}"><button class="pl-check ${t.done ? "done" : ""}" data-check="${t.id}" aria-label="${t.done ? "Mark not done" : "Mark done"}"></button>
      <div class="pl-body"><div class="pl-t">${esc(t.title)}</div>${meta.length ? `<div class="pl-meta">${meta.join("")}</div>` : ""}</div></div>`;
  }

  const statusSel = w => `<select name="when" aria-label="Status"><option value="now" ${w==="now"?"selected":""}>Working on</option><option value="next" ${w!=="now"?"selected":""}>Up next</option></select>`;
  const projSel = id => `<select name="project_id" aria-label="Project"><option value="">No project</option>${projects().map(p => `<option value="${p.id}" ${p.id===id?"selected":""}>${esc(p.name)}</option>`).join("")}</select>`;

  function editHTML(t){
    return `<form class="pl-row open pl-edit" id="pl-edit" data-id="${t.id}">
      <button type="button" class="pl-check ${t.done ? "done" : ""}" data-check="${t.id}" aria-label="Mark done"></button>
      <div class="pl-body">
        <input class="pl-et" name="title" value="${esc(t.title)}" placeholder="To-do" aria-label="Title">
        <textarea name="notes" placeholder="Notes">${esc(t.notes)}</textarea>
        <div class="pl-cl">${(t.checklist || []).map((c, i) => `<div class="pl-cli ${c.done ? "done" : ""}"><button type="button" class="pl-mini ${c.done ? "done" : ""}" data-cl="${i}" aria-label="Toggle"></button><input type="text" name="cl${i}" value="${esc(c.t)}"><button type="button" class="pl-x" data-clrm="${i}" aria-label="Remove">\u00d7</button></div>`).join("")}
          <div class="pl-cli"><span class="pl-mini" style="border-style:dashed"></span><input type="text" id="pl-cladd" placeholder="Add a checklist item"></div></div>
        <span class="pl-lbl">Sims</span>${UI.simPicker("sims", t.sims, data.sims, "Tag Sims (optional)")}
        <div class="pl-bar">${statusSel(t.when)}${projSel(t.project_id)}<span class="spacer"></span>
          <button type="button" class="pl-del" data-del="${t.id}">Delete</button><button class="pl-btn green" type="submit">Done editing</button></div>
      </div></form>`;
  }

  function fileHTML(){
    const p = project(view), sim = view.startsWith("sim:") ? [view.slice(4)] : [];
    return `<form class="pl-row open pl-edit" id="pl-new"><span class="pl-plus" style="margin-top:3px"></span><div class="pl-body">
      <input class="pl-et" name="title" placeholder="New to-do, like &quot;Save up for Shanae's salon&quot;" aria-label="Title" required>
      <span class="pl-lbl">Notes</span><textarea name="notes" placeholder="The plan, the drama, what needs to happen"></textarea>
      <span class="pl-lbl">Checklist</span><textarea name="checklist" placeholder="One step per line (optional)" style="min-height:60px"></textarea>
      <span class="pl-lbl">Sims</span>${UI.simPicker("sims", sim, data.sims, "Tag Sims, or leave it general")}
      <div class="pl-bar">${statusSel(view === "now" ? "now" : "next")}${projSel(p ? p.id : "")}<span class="spacer"></span>
        <button type="button" class="pl-btn" data-cancelnew>Cancel</button><button class="pl-btn green" type="submit">Add</button></div>
    </div></form>`;
  }

  function readEdit(form){
    const f = new FormData(form), v = k => (f.get(k) || "").trim();
    const t = todos().find(x => x.id === form.dataset.id);
    const checklist = (t.checklist || []).map((c, i) => ({ ...c, t: (f.get("cl" + i) || "").trim() || c.t }));
    return { ...t, title: v("title") || "Untitled", notes: v("notes"), checklist, project_id: v("project_id") || null, when: v("when") === "now" ? "now" : "next", sims: f.getAll("sims") };
  }

  /* ---------- views ---------- */
  function mainHTML(){
    const add = view === "done" ? "" : (st.filing ? fileHTML() : `<button class="pl-add pl-newbtn" data-new><span class="pl-plus"></span>New to-do</button>`);
    const list = items => items.length ? items.map(rowHTML).join("") : `<p class="pl-empty">Nothing here yet.</p>`;
    if (view.startsWith("sim:")){
      const id = view.slice(4), items = todos().filter(t => inView(t, view)).sort((a,b) => a.done - b.done);
      return `<div class="pl-title"><span class="ic">${ICON.sims}</span><h1>${esc(simName(id))}</h1></div><p class="pl-sub">Everything in Plumb tagged with this Sim.</p>${add}${list(items)}`;
    }
    const p = project(view);
    if (p){
      const items = todos().filter(t => t.project_id === p.id && !t.done), done = todos().filter(t => t.project_id === p.id && t.done).length;
      return `<div class="pl-title"><span class="ic">${ICON.project}</span>${st.editingProject === p.id ? `<form id="pl-projname" style="flex:1"><input class="pl-titleinput" name="name" value="${esc(p.name)}" aria-label="Project name"></form>` : `<h1 data-renameproj="${p.id}" title="Tap to rename">${esc(p.name)}</h1>`}</div>
        <p class="pl-sub"><select class="pl-areasel" data-areaof="${p.id}" aria-label="Area"><option value="">No area</option>${(data.plumb_areas || []).map(a => `<option ${a===p.area?"selected":""}>${esc(a)}</option>`).join("")}</select>${done ? ` ${done} done` : ""} <button class="pl-del" data-delproj="${p.id}" style="margin-left:8px">Delete project</button></p>${add}${list(items)}`;
    }
    const head = `<div class="pl-title"><span class="ic">${ICON[view]}</span><h1>${Object.fromEntries(VIEWS)[view]}</h1></div><p class="pl-sub">${SUBS[view]}</p>`;
    if (view === "next"){
      const items = todos().filter(t => inView(t, "next")), loose = items.filter(t => !t.project_id);
      const groups = projects().map(p => [p, items.filter(t => t.project_id === p.id)]).filter(([, l]) => l.length);
      return `${head}${add}${loose.map(rowHTML).join("")}${groups.map(([p, l]) => `<section class="pl-group"><h2>${esc(p.name)}<span>${l.length}</span></h2>${l.map(rowHTML).join("")}</section>`).join("")}${!items.length ? `<p class="pl-empty">Nothing up next.</p>` : ""}`;
    }
    if (view === "done") return `${head}${list(todos().filter(t => t.done).sort((a,b) => (b.done_at || "").localeCompare(a.done_at || "")))}`;
    return `${head}${add}${list(todos().filter(t => inView(t, "now")))}`;
  }

  function sideHTML(){
    const nav = (k, label, icon, ct) => `<button class="pl-nav" data-view="${k}" aria-current="${view===k}"><span class="ic">${icon}</span>${esc(label)}${ct ? `<span class="ct">${ct}</span>` : ""}</button>`;
    const areas = [...new Set([...(data.plumb_areas || []), ...projects().map(p => p.area).filter(Boolean)])];
    const tagged = [...new Set(todos().filter(t => !t.done).flatMap(t => t.sims || []))].sort((a,b) => simName(a).localeCompare(simName(b)));
    return `<aside class="pl-side"><div class="pl-brand">${ICON.mark}Plumb</div>
      ${VIEWS.map(([k,v]) => nav(k, v, ICON[k], k === "done" ? "" : count(k))).join("")}
      ${areas.filter(a => projects().some(p => p.area === a)).map(a => `<div class="pl-area">${esc(a)}</div>${projects().filter(p => p.area === a).map(p => nav(p.id, p.name, ICON.project, count(p.id))).join("")}`).join("")}
      ${projects().filter(p => !p.area).map(p => nav(p.id, p.name, ICON.project, count(p.id))).join("")}
      <button class="pl-newproj" data-newproj>+ New project</button>
      ${tagged.length ? `<div class="pl-area">Sims</div>${tagged.map(id => nav("sim:" + id, simName(id), ICON.sims, count("sim:" + id))).join("")}` : ""}</aside>`;
  }

  function draw(){ root.innerHTML = `<div class="site-pl">${sideHTML()}<main class="pl-main">${mainHTML()}</main></div>`; }
  async function saveOpen(){ const form = root.querySelector("#pl-edit"); if (form) await GFB.saveTodo(readEdit(form)); }

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-pl");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target, x = k => t.closest(`[data-${k}]`)?.dataset[k];
      if (t.closest("[data-check]")) { const id = x("check"); await saveOpen(); const td = todos().find(v => v.id === id); await GFB.saveTodo({ ...td, done: !td.done, done_at: !td.done ? new Date().toISOString() : null }); draw(); return; }
      if (t.closest("[data-cl]")) { const td = readEdit(root.querySelector("#pl-edit")); td.checklist[+x("cl")].done = !td.checklist[+x("cl")].done; await GFB.saveTodo(td); draw(); return; }
      if (t.closest("[data-clrm]")) { const td = readEdit(root.querySelector("#pl-edit")); td.checklist.splice(+x("clrm"), 1); await GFB.saveTodo(td); draw(); return; }
      if (t.closest("[data-del]")) { if (UI.confirmTap(t.closest("[data-del]"))) { await GFB.deleteTodo(x("del")); st.open = null; draw(); } return; }
      if (t.closest("[data-new]")) { await saveOpen(); st.open = null; st.filing = true; draw(); root.querySelector("#pl-new .pl-et")?.focus(); return; }
      if (t.closest("[data-cancelnew]")) { st.filing = false; draw(); return; }
      if (t.closest("[data-view]")) { await saveOpen(); st.open = null; st.filing = false; location.hash = "#/plumb/" + x("view"); return; }
      if (t.closest("[data-newproj]")) { const p = await GFB.saveProject({ name:"New project", area:(data.plumb_areas || [])[0] || null, app:"plumb" }); st.editingProject = p.id; location.hash = "#/plumb/" + p.id; return; }
      if (t.closest("[data-renameproj]")) { st.editingProject = x("renameproj"); draw(); root.querySelector("#pl-projname input")?.select(); return; }
      if (t.closest("[data-delproj]")) { if (UI.confirmTap(t.closest("[data-delproj]"), "Tap again: to-dos stay, project goes")) { for (const td of todos().filter(v => v.project_id === x("delproj"))) await GFB.saveTodo({ ...td, project_id:null }); await GFB.deleteProject(x("delproj")); location.hash = "#/plumb/next"; } return; }
      const row = t.closest("[data-open]");
      if (row && !t.closest("button")) { await saveOpen(); st.open = row.dataset.open; draw(); root.querySelector("#pl-edit .pl-et")?.focus(); return; }
      if (st.open && !t.closest("#pl-edit")) { await saveOpen(); st.open = null; draw(); }
    });
    document.addEventListener("change", async e => {
      if (!mine(e.target) || !e.target.matches("[data-areaof]")) return;
      const p = project(e.target.dataset.areaof); await GFB.saveProject({ ...p, area: e.target.value || null }); draw();
    });
    document.addEventListener("keydown", async e => {
      if (!mine(e.target)) return;
      if (e.key === "Enter" && e.target.id === "pl-cladd") { e.preventDefault(); const val = e.target.value.trim(); if (!val) return; const td = readEdit(root.querySelector("#pl-edit")); td.checklist = [...td.checklist, { t:val, done:false }]; await GFB.saveTodo(td); draw(); root.querySelector("#pl-cladd")?.focus(); }
      if (e.key === "Escape" && (st.open || st.filing)) { e.stopImmediatePropagation(); await saveOpen(); st.open = null; st.filing = false; draw(); }
    }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      if (e.target.id === "pl-new") {
        const f = new FormData(e.target), v = k => (f.get(k) || "").trim();
        if (!v("title")) return;
        await GFB.saveTodo({ app:"plumb", title:v("title"), notes:v("notes"), when: v("when") === "now" ? "now" : "next", project_id: v("project_id") || null, sims: f.getAll("sims"),
          checklist: v("checklist").split("\n").map(x => x.trim()).filter(Boolean).map(t => ({ t, done:false })), done:false });
        st.filing = false; draw(); return;
      }
      if (e.target.id === "pl-edit") { await saveOpen(); st.open = null; draw(); return; }
      if (e.target.id === "pl-projname") { const p = project(view); await GFB.saveProject({ ...p, name: new FormData(e.target).get("name").trim() || p.name }); st.editingProject = null; draw(); }
    });
  }

  function render(el, d, parts){
    root = el; data = d;
    const v = (parts || [])[0];
    view = v && (VIEWS.some(([k]) => k === v) || v.startsWith("sim:") || projects().some(p => p.id === v)) ? v : "now";
    if (st.editingProject && st.editingProject !== view) st.editingProject = null;
    bind(); draw();
  }
  return { render, label: () => view.startsWith("sim:") ? simName(view.slice(4)) : ((VIEWS.find(([k]) => k === view) || [])[1] || (project(view) || {}).name || "") };
})();
