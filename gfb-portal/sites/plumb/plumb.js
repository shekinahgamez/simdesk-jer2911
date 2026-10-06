/* Plumb: gameplay to-dos, organized like Things 3 but by household and Sim.
   Households are the areas, each Sim is a project with their own list.
   Two kinds of items: plain to-dos, and goals that track progress. No story beats; those live in Notes. */
const Plumb = (() => {
  const st = { open:null, q:"", showDone:false, last:null };
  let data = null, root = null, view = "inbox";

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const clean = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const enc = s => encodeURIComponent(s);
  const dec = s => { try { return decodeURIComponent(s); } catch { return s; } };

  const todos = () => data.todos.filter(t => t.app === "plumb");
  const sim = id => data.sims.find(s => s.id === id) || {};
  const simName = id => clean(sim(id).name || id);
  const first = id => simName(id).split(" ")[0];
  const hhOf = id => String(sim(id).household || "").trim();
  const forSim = id => todos().filter(t => (t.sims || []).includes(id));
  const forHH = name => todos().filter(t => t.household === name);
  const isInbox = t => !(t.sims || []).length && !t.household;
  const isGoal = t => t.goal && t.goal.unit && +t.goal.target > 0;
  const households = () => [...new Set(data.sims.map(s => String(s.household || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const simsIn = name => data.sims.filter(s => String(s.household || "").trim() === name).sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
  const pct = list => list.length ? Math.round(list.filter(t => t.done).length / list.length * 100) : 0;
  const byDone = (a, b) => a.done - b.done || isGoal(a) - isGoal(b);

  const ICON = {
    inbox:`<svg viewBox="0 0 20 20" fill="none" stroke="#3B82C4" stroke-width="1.8"><path d="M3 11l2-7h10l2 7v5H3z"/><path d="M3 11h4l1 2h4l1-2h4"/></svg>`,
    log:`<svg viewBox="0 0 20 20" fill="none" stroke="#2E9E4F" stroke-width="1.8"><rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M7.5 10l2 2 3.5-4"/></svg>`,
    home:`<svg viewBox="0 0 20 20" fill="none" stroke="#79817C" stroke-width="1.8"><path d="M3 9.5L10 3l7 6.5"/><path d="M5 8v9h10V8"/></svg>`,
    sims:`<svg viewBox="0 0 20 20" fill="none" stroke="#3B82C4" stroke-width="1.8"><circle cx="10" cy="7" r="3.2"/><path d="M4 17c.8-3.3 3.1-5 6-5s5.2 1.7 6 5"/></svg>`,
    mark:`<svg viewBox="0 0 20 20" fill="#2E9E4F"><path d="M10 1.5l4.5 8.5L10 18.5 5.5 10z"/></svg>`
  };
  const pie = (p, big) => `<span class="pl-pie${big ? " big" : ""}" style="--p:${p}%" aria-hidden="true"></span>`;

  /* ---------- goals ---------- */
  const UNITS = [["none","Just a to-do"],["$","Money"],["level","Skill or career level"],["count","Count"]];
  function goalText(g){
    const n = v => Math.round(+v || 0).toLocaleString();
    if (g.unit === "$") return `$${n(g.cur)} of $${n(g.target)}`;
    if (g.unit === "level") return `Level ${n(g.cur)} of ${n(g.target)}`;
    return `${n(g.cur)} of ${n(g.target)}`;
  }
  const goalPct = g => Math.max(0, Math.min(100, Math.round((+g.cur || 0) / (+g.target || 1) * 100)));

  /* ---------- rows ---------- */
  function rowHTML(t, ctx = {}){
    if (st.open === t.id) return editHTML(t);
    const meta = [];
    if (isGoal(t)) meta.push(`<span class="pl-prog">${esc(goalText(t.goal))}<span class="pl-minibar"><i style="width:${goalPct(t.goal)}%"></i></span></span>`);
    (t.sims || []).filter(id => id !== ctx.sim).forEach(id => meta.push(`<span class="pl-tag">${esc(simName(id))}</span>`));
    if (t.household && t.household !== ctx.hh) meta.push(`<span class="pl-tag hh">${esc(t.household)}</span>`);
    if (t.checklist?.length) meta.push(`<span>${t.checklist.filter(c => c.done).length}/${t.checklist.length}</span>`);
    if (t.notes) meta.push(`<span>Notes</span>`);
    return `<div class="pl-row ${t.done ? "isdone" : ""}" data-open="${t.id}"><button class="pl-check ${t.done ? "done" : ""}" data-check="${t.id}" aria-label="${t.done ? "Mark not done" : "Mark done"}"></button>
      <div class="pl-body"><div class="pl-t">${esc(t.title)}</div>${meta.length ? `<div class="pl-meta">${meta.join("")}</div>` : ""}</div></div>`;
  }

  function editHTML(t){
    const g = t.goal || {}, unit = isGoal(t) ? g.unit : "none";
    return `<form class="pl-row open pl-edit" id="pl-edit" data-id="${t.id}">
      <button type="button" class="pl-check ${t.done ? "done" : ""}" data-check="${t.id}" aria-label="Mark done"></button>
      <div class="pl-body">
        <input class="pl-et" name="title" value="${esc(t.title)}" placeholder="To-do" aria-label="Title">
        <textarea name="notes" placeholder="Notes">${esc(t.notes)}</textarea>
        <div class="pl-cl">${(t.checklist || []).map((c, i) => `<div class="pl-cli ${c.done ? "done" : ""}"><button type="button" class="pl-mini ${c.done ? "done" : ""}" data-cl="${i}" aria-label="Toggle"></button><input type="text" name="cl${i}" value="${esc(c.t)}"><button type="button" class="pl-x" data-clrm="${i}" aria-label="Remove">\u00d7</button></div>`).join("")}
          <div class="pl-cli"><span class="pl-mini" style="border-style:dashed"></span><input type="text" id="pl-cladd" placeholder="Add a checklist item"></div></div>
        <span class="pl-lbl">Progress</span>
        <div class="pl-goalrow">
          <select name="unit" aria-label="Progress type">${UNITS.map(([v, l]) => `<option value="${v}" ${v === unit ? "selected" : ""}>${l}</option>`).join("")}</select>
          <label class="pl-num ${unit === "none" ? "off" : ""}">Now<input type="number" name="cur" inputmode="decimal" value="${esc(g.cur ?? "")}"></label>
          <label class="pl-num ${unit === "none" ? "off" : ""}">Goal<input type="number" name="target" inputmode="decimal" value="${esc(g.target ?? "")}"></label>
        </div>
        <span class="pl-lbl">Sims</span>${UI.simPicker("sims", t.sims, data.sims, "Tag Sims (optional)")}
        <span class="pl-lbl">Whole household</span>
        <select name="household" class="pl-hhsel" aria-label="Household"><option value="">Not a household to-do</option>${households().map(h => `<option ${h === t.household ? "selected" : ""}>${esc(h)}</option>`).join("")}</select>
        <div class="pl-bar"><span class="spacer"></span>
          <button type="button" class="pl-del" data-del="${t.id}">Delete</button><button class="pl-btn green" type="submit">Done editing</button></div>
      </div></form>`;
  }

  function readEdit(form){
    const f = new FormData(form), v = k => (f.get(k) || "").trim();
    const t = todos().find(x => x.id === form.dataset.id);
    const checklist = (t.checklist || []).map((c, i) => ({ ...c, t: (f.get("cl" + i) || "").trim() || c.t }));
    const unit = v("unit");
    const goal = unit && unit !== "none" ? { unit, cur: +v("cur") || 0, target: +v("target") || 0 } : null;
    return { ...t, title: v("title") || "Untitled", notes: v("notes"), checklist, goal, sims: f.getAll("sims"), household: v("household") || null };
  }

  const quick = ph => `<form class="pl-add" id="pl-quick"><span class="pl-plus"></span><input name="title" placeholder="${esc(ph)}" aria-label="New to-do" autocomplete="off"></form>`;

  function listHTML(items, ctx){
    const open = items.filter(t => !t.done), plain = open.filter(t => !isGoal(t)), goals = open.filter(isGoal), done = items.filter(t => t.done);
    let h = plain.map(t => rowHTML(t, ctx)).join("");
    if (goals.length) h += `<section class="pl-group"><h2>Goals<span>${goals.length}</span></h2>${goals.map(t => rowHTML(t, ctx)).join("")}</section>`;
    if (done.length) h += `<button class="pl-showdone" data-showdone>${st.showDone ? "Hide" : "Show"} ${done.length} completed</button>${st.showDone ? done.map(t => rowHTML(t, ctx)).join("") : ""}`;
    return h;
  }

  /* ---------- views ---------- */
  function mainHTML(){
    return `<div class="pl-search"><input id="pl-q" type="search" placeholder="Search all to-dos" aria-label="Search all to-dos" value="${esc(st.q)}"></div><div id="pl-body">${bodyHTML()}</div>`;
  }
  function bodyHTML(){
    const q = st.q.trim().toLowerCase();
    if (q){
      const hits = todos().filter(t => [t.title, t.notes, t.household, ...(t.sims || []).map(simName)].join(" ").toLowerCase().includes(q)).sort(byDone);
      return `<div class="pl-title"><h1>Search</h1></div><p class="pl-sub">${hits.length} to-do${hits.length === 1 ? "" : "s"} matching "${esc(st.q)}"</p>${hits.length ? hits.map(t => rowHTML(t)).join("") : `<p class="pl-empty">No matches.</p>`}`;
    }

    if (view.startsWith("sim:")){
      const id = view.slice(4), sm = sim(id), items = forSim(id), hh = hhOf(id);
      const sub = [sm.career, hh ? `<a class="pl-link" href="#/plumb/hh:${enc(hh)}">${esc(hh)}</a>` : ""].filter(Boolean);
      return `<div class="pl-title">${pie(pct(items), true)}<h1>${esc(simName(id))}</h1></div>
        <p class="pl-sub">${sub.map(x => x.startsWith("<a") ? x : esc(x)).join(" \u00b7 ")}${sub.length ? " \u00b7 " : ""}<a class="pl-link" href="#/registry/${id}">Registry file</a></p>
        ${quick(`New to-do for ${first(id)}`)}${items.length ? listHTML(items, { sim:id }) : `<p class="pl-empty">Nothing on ${esc(first(id))}'s list.</p>`}`;
    }

    if (view.startsWith("hh:")){
      const name = view.slice(3), members = simsIn(name), own = forHH(name);
      const withItems = members.filter(s => forSim(s.id).some(t => !t.done)), idle = members.filter(s => !withItems.includes(s));
      const all = [...own, ...members.flatMap(s => forSim(s.id))];
      return `<div class="pl-title">${pie(pct([...new Set(all)]), true)}<h1>${esc(name)}</h1></div>
        <p class="pl-sub">${members.length} Sim${members.length === 1 ? "" : "s"}</p>
        ${quick("New to-do for the whole household")}
        ${own.length ? listHTML(own, { hh:name }) : ""}
        ${withItems.map(s => `<section class="pl-group"><h2><button class="pl-h2link" data-view="sim:${s.id}">${esc(clean(s.name))}</button><span>${forSim(s.id).filter(t => !t.done).length}</span></h2>${forSim(s.id).filter(t => !t.done).sort(byDone).map(t => rowHTML(t, { sim:s.id, hh:name })).join("")}</section>`).join("")}
        ${idle.length ? `<p class="pl-idle">Nothing for ${idle.map(s => `<button class="pl-idlelink" data-view="sim:${s.id}">${esc(first(s.id))}</button>`).join(", ")}</p>` : ""}
        ${!own.length && !withItems.length && !idle.length ? `<p class="pl-empty">No Sims in this household yet.</p>` : ""}`;
    }

    if (view === "logbook"){
      const done = todos().filter(t => t.done).sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));
      return `<div class="pl-title"><span class="ic">${ICON.log}</span><h1>Logbook</h1></div><p class="pl-sub">Everything checked off, newest first.</p>${done.length ? done.map(t => rowHTML(t)).join("") : `<p class="pl-empty">Nothing checked off yet.</p>`}`;
    }

    const items = todos().filter(isInbox);
    return `<div class="pl-title"><span class="ic">${ICON.inbox}</span><h1>No Sim yet</h1></div><p class="pl-sub">To-dos that aren't tied to anyone. Tag a Sim or household and they move to that list.</p>
      ${quick("New to-do")}${items.length ? listHTML(items, {}) : `<p class="pl-empty">All filed.</p>`}`;
  }

  function sideHTML(){
    const nav = (k, label, icon, ct, cls = "") => `<button class="pl-nav ${cls}" data-view="${k}" aria-current="${view === k}"><span class="ic">${icon}</span><span class="nm">${esc(label)}</span>${ct ? `<span class="ct">${ct}</span>` : ""}</button>`;
    const active = todos().filter(t => !t.done);
    const sims = [...data.sims].sort((a, b) => clean(a.name).localeCompare(clean(b.name)));
    const busySims = [...new Set(active.flatMap(t => t.sims || []))];
    const busyHH = households().filter(h => active.some(t => t.household === h) || busySims.some(id => hhOf(id) === h));
    const loose = busySims.filter(id => !hhOf(id)).sort((a, b) => simName(a).localeCompare(simName(b)));
    const simNav = id => nav("sim:" + id, simName(id), pie(pct(forSim(id))), forSim(id).filter(t => !t.done).length, "pl-simnav");
    return `<aside class="pl-side"><div class="pl-brand">${ICON.mark}Plumb</div>
      <div class="pl-findsim"><span class="ic">${ICON.sims}</span>${UI.picker({ id:"pl-findsim", value:view.startsWith("sim:") ? view.slice(4) : "", options:[{ v:"", t:"Find a Sim" }, ...sims.map(x => ({ v:x.id, t:clean(x.name), s:x.household || x.career || "" }))], placeholder:"Search Sims", label:"Find a Sim" })}</div>
      ${nav("inbox", "No Sim yet", ICON.inbox, active.filter(isInbox).length)}
      ${nav("logbook", "Logbook", ICON.log, "")}
      <div class="pl-gap"></div>
      ${busyHH.map(h => `${nav("hh:" + enc(h), h, ICON.home, "", "pl-hhnav")}${simsIn(h).filter(s => busySims.includes(s.id)).map(s => simNav(s.id)).join("")}`).join("")}
      ${loose.length ? `<div class="pl-area">No household</div>${loose.map(simNav).join("")}` : ""}
      ${!busyHH.length && !loose.length ? `<p class="pl-sidehint">Find a Sim above to start their list.</p>` : ""}</aside>`;
  }

  function draw(){ root.innerHTML = `<div class="site-pl">${sideHTML()}<main class="pl-main">${mainHTML()}</main></div>`; }
  async function saveOpen(){ const form = root.querySelector("#pl-edit"); if (form) await GFB.saveTodo(readEdit(form)); }
  const go = v => { location.hash = "#/plumb/" + v; };

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-pl");
    document.addEventListener("input", e => {
      if (!mine(e.target)) return;
      if (e.target.id === "pl-q"){ st.q = e.target.value; const b = root.querySelector("#pl-body"); if (b) b.innerHTML = bodyHTML(); }
      if (e.target.name === "unit"){ root.querySelectorAll("#pl-edit .pl-num").forEach(l => l.classList.toggle("off", e.target.value === "none")); }
    });
    document.addEventListener("change", e => {
      if (!mine(e.target)) return;
      if (e.target.id === "pl-findsim" && e.target.value) go("sim:" + e.target.value);
      if (e.target.name === "unit"){ root.querySelectorAll("#pl-edit .pl-num").forEach(l => l.classList.toggle("off", e.target.value === "none")); }
    });
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target, x = k => t.closest(`[data-${k}]`)?.dataset[k];
      if (t.closest("[data-check]")) { const id = x("check"); await saveOpen(); const td = todos().find(v => v.id === id); await GFB.saveTodo({ ...td, done: !td.done, done_at: !td.done ? new Date().toISOString() : null }); draw(); return; }
      if (t.closest("[data-cl]")) { const td = readEdit(root.querySelector("#pl-edit")); td.checklist[+x("cl")].done = !td.checklist[+x("cl")].done; await GFB.saveTodo(td); draw(); return; }
      if (t.closest("[data-clrm]")) { const td = readEdit(root.querySelector("#pl-edit")); td.checklist.splice(+x("clrm"), 1); await GFB.saveTodo(td); draw(); return; }
      if (t.closest("[data-del]")) { if (UI.confirmTap(t.closest("[data-del]"))) { await GFB.deleteTodo(x("del")); st.open = null; draw(); } return; }
      if (t.closest("[data-showdone]")) { st.showDone = !st.showDone; draw(); return; }
      if (t.closest("[data-view]")) { await saveOpen(); st.open = null; st.q = ""; go(x("view")); return; }
      const row = t.closest("[data-open]");
      if (row && !t.closest("button")) { await saveOpen(); st.open = row.dataset.open; draw(); root.querySelector("#pl-edit .pl-et")?.focus(); return; }
      if (st.open && !t.closest("#pl-edit")) { await saveOpen(); st.open = null; draw(); }
    });
    document.addEventListener("keydown", async e => {
      if (!mine(e.target)) return;
      if (e.key === "Enter" && e.target.id === "pl-cladd") { e.preventDefault(); const val = e.target.value.trim(); if (!val) return; const td = readEdit(root.querySelector("#pl-edit")); td.checklist = [...td.checklist, { t:val, done:false }]; await GFB.saveTodo(td); draw(); root.querySelector("#pl-cladd")?.focus(); }
      if (e.key === "Escape" && st.open) { e.stopImmediatePropagation(); await saveOpen(); st.open = null; draw(); }
    }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      if (e.target.id === "pl-quick") {
        const title = (new FormData(e.target).get("title") || "").trim();
        if (!title) return;
        const item = { app:"plumb", title, notes:"", checklist:[], goal:null, sims:[], household:null, done:false };
        if (view.startsWith("sim:")) item.sims = [view.slice(4)];
        if (view.startsWith("hh:")) item.household = view.slice(3);
        await GFB.saveTodo(item); draw(); root.querySelector("#pl-quick input")?.focus(); return;
      }
      if (e.target.id === "pl-edit") { await saveOpen(); st.open = null; draw(); }
    });
  }

  function render(el, d, parts){
    root = el; data = d;
    const v = dec((parts || [])[0] || "");
    const ok = v === "inbox" || v === "logbook" || (v.startsWith("sim:") && data.sims.some(s => s.id === v.slice(4))) || (v.startsWith("hh:") && households().includes(v.slice(3)));
    if (ok) view = v;
    else {
      const busy = households().find(h => todos().some(t => !t.done && (t.household === h || (t.sims || []).some(id => hhOf(id) === h))));
      view = st.last || (busy ? "hh:" + busy : "inbox");
    }
    if (view !== st.last) st.showDone = false;
    st.last = view;
    bind(); draw();
  }
  return { render, label: () => st.q ? "Search" : view.startsWith("sim:") ? simName(view.slice(4)) : view.startsWith("hh:") ? view.slice(3) : view === "logbook" ? "Logbook" : "No Sim yet" };
})();
