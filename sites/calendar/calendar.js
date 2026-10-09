/* Calendar: 84-day year of four 21-day seasons. Reads and saves through GFB. */
const Calendar = (() => {
  const RANGES = ["1\u20134","5\u20138","9\u201313","14\u201317","18\u201321","22\u201326","27\u201331"];
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const st = { view:null, sel:null, active:{holiday:true,sports:true,industry:true,gameplay:true,school:true}, modal:null, err:null, writing:null, reveal:false };
  let data = null, root = null, sheetH = null;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const cal = () => data.calendar;
  const names = () => cal().seasons.map(s => s.name);
  const sIdx = n => names().indexOf(n);
  const evOn = (s, d) => cal().events.filter(e => e.season === s && e.day === d).sort((a,b) => a.title.localeCompare(b.title));
  const shown = e => st.active[e.cat];
  const realDate = (s, d) => "About " + cal().seasons[sIdx(s)].months[Math.ceil(d/7)-1] + " " + RANGES[(d-1)%7];
  const ord = (s, d) => sIdx(s) * 21 + d;           // 1..84
  const fromOrd = o => { o = ((o - 1) % 84 + 84) % 84 + 1; return { season: names()[Math.floor((o-1)/21)], day: (o-1) % 21 + 1 }; };
  const isToday = (s, d) => cal().today.season === s && cal().today.day === d;
  const between = (s, d, a, b) => { const x = ord(s,d), lo = ord(a.season,a.day), hi = ord(b.season,b.day); return lo <= hi ? x >= lo && x <= hi : x >= lo || x <= hi; };
  const inSchool = (s, d) => { const k = cal().school; return between(s,d,k.fall_enroll,k.fall_end) || between(s,d,k.spring_enroll,k.spring_end); };
  const isEnroll = (s, d) => { const k = cal().school; return (k.fall_enroll.season === s && k.fall_enroll.day === d) || (k.spring_enroll.season === s && k.spring_enroll.day === d); };
  const paras = t => String(t || "").split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const logsOn = (s, d) => (cal().logs || []).filter(l => l.season === s && l.day === d).sort((a,b) => b.year - a.year || (a.created || "").localeCompare(b.created || ""));
  const hasLog = (s, d) => (cal().logs || []).some(l => l.season === s && l.day === d && l.year === cal().year);
  const simName = id => ((data.sims.find(x => x.id === id) || {}).name || id).replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const go = (view, day) => { location.hash = "#/calendar/" + view + (day ? "/" + day : ""); };

  /* ---------- views ---------- */
  function seasonHTML(s){
    const S = cal().seasons[sIdx(s)];
    let rows = "";
    for (let w = 0; w < 3; w++){
      rows += `<div class="cal-row"><div class="cal-month"><span class="short">${esc(S.months[w].slice(0,3))}</span><span class="long">${esc(S.months[w])}</span></div>`;
      for (let i = 1; i <= 7; i++){
        const d = w*7 + i, evs = evOn(s, d).filter(shown);
        const cls = ["cal-day"];
        if (st.active.school && inSchool(s,d)) cls.push("school");
        if (st.active.school && isEnroll(s,d)) cls.push("enroll");
        if (isToday(s,d)) cls.push("today");
        if (st.sel && st.sel.season === s && st.sel.day === d) cls.push("sel");
        rows += `<button class="${cls.join(" ")}" data-day="${s}/${d}" aria-label="${esc(s)} day ${d}${evs.map(e => ", " + esc(e.title)).join("")}${isToday(s,d) ? ", today" : ""}${hasLog(s,d) ? ", logged" : ""}"><span class="n"><span>${d}</span>${hasLog(s,d) ? `<i class="cal-logdot" title="Logged"></i>` : ""}</span>${evs.length ? `<span class="cal-dots" aria-hidden="true">${evs.map(e => `<i class="sw-${e.cat}"></i>`).join("")}</span>` : ""}${evs.map(e => `<span class="cal-ev c-${e.cat}">${esc(e.title)}</span>`).join("")}</button>`;
      }
      rows += `</div>`;
    }
    return `<div class="cal-grid"><div class="cal-head"><div class="gap"></div>${DOW.map(x => `<div>${x}</div>`).join("")}</div>${rows}</div>`;
  }

  function yearHTML(){
    return `<div class="cal-year">${cal().seasons.map(S => `<section class="cal-mini"><h2>${esc(S.name)}</h2><p>${esc(S.months[0])} through ${esc(S.months[2])}</p>
      <div class="cal-mgrid">${Array.from({length:21}, (_, k) => { const d = k + 1, e = evOn(S.name, d).filter(shown)[0];
        return `<button class="cal-mday ${e ? "has c-" + e.cat : ""} ${isToday(S.name,d) ? "today" : ""} ${hasLog(S.name,d) ? "logged" : ""}" data-day="${S.name}/${d}" aria-label="${esc(S.name)} day ${d}${e ? ", " + esc(e.title) : ""}${hasLog(S.name,d) ? ", logged" : ""}" title="${e ? esc(e.title) : ""}"><span>${d}</span><i class="${e ? "sw-" + e.cat : "none"}"></i></button>`; }).join("")}</div></section>`).join("")}</div>`;
  }

  function detailHTML(){
    const sel = st.sel || cal().today, s = sel.season, d = sel.day, evs = evOn(s, d);
    const school = inSchool(s, d);
    let h = `<div class="cal-card"><div class="meta">${esc(s)}, day ${d}${isToday(s,d) ? ", today in the save" : ""}</div>
      <h2>${evs.length ? esc(evs.map(e => e.title).join(" & ")) : "Open day"}</h2><div class="meta">${realDate(s, d)}</div>
      <div class="cal-tags"><span class="cal-tag">${school ? "Classes in session" : "University on break"}</span>${isEnroll(s,d) ? `<span class="cal-tag">Enroll in university</span>` : ""}</div>`;
    if (!evs.length) h += `<p style="margin-top:10px;color:var(--muted)">Nothing scheduled. Free for whatever the story needs.</p>`;
    evs.forEach(e => {
      h += `<h3><span class="cal-tag c-${e.cat}">${esc(cal().categories[e.cat])}</span>${evs.length > 1 ? esc(e.title) : ""}</h3>
        ${e.details ? `<div class="cal-details">${paras(e.details)}</div>` : ""}
        ${e.sims?.length ? `<div class="cal-k">Who's involved</div><div class="cal-tags">${e.sims.map(id => `<span class="cal-tag">${esc(simName(id))}</span>`).join("")}</div>` : ""}
        <div class="acts"><button class="cal-btn" data-edit="${e.id}" aria-label="Edit ${esc(e.title)}">Edit event</button></div>`;
    });
    const logs = logsOn(s, d);
    h += `<div class="cal-log"><div class="cal-loghead"><span>What happened</span>${st.writing ? "" : `<button class="cal-btn plain" data-write="${s}/${d}">Log this day</button>`}</div>
      ${st.writing ? `<form id="cal-logform"><input name="title" class="cal-loginput" placeholder="Title, like &quot;Dom didn't come home&quot;" value="${esc(st.writing.title || "")}"><textarea name="text" class="cal-big" placeholder="What went down today?" required>${esc(st.writing.text || "")}</textarea>
        <div class="cal-k">Tag Sims</div>${UI.simPicker("sims", st.writing.sims, data.sims)}
        <div class="acts">${st.writing.id ? `<button type="button" class="cal-del" data-dellog="${st.writing.id}">Delete</button>` : ""}<span style="flex:1"></span><button type="button" class="cal-btn" data-cancelwrite>Cancel</button><button class="cal-btn" type="submit">Save</button></div></form>` : ""}
      ${logs.length ? logs.map(l => `<article class="cal-entry"><div class="meta">Year ${l.year}</div>${l.title ? `<h4>${esc(l.title)}</h4>` : ""}${paras(l.text)}${l.sims?.length ? `<div class="cal-tags">${l.sims.map(id => `<span class="cal-tag">${esc(simName(id))}</span>`).join("")}</div>` : ""}<button class="cal-btn plain" data-editlog="${l.id}" aria-label="Edit this entry">Edit</button></article>`).join("")
        : (st.writing ? "" : `<p class="cal-empty">Nothing logged yet.</p>`)}
    </div>`;
    h += isToday(s,d) ? `</div>` : `<div class="acts"><button class="cal-btn" data-settoday="${s}/${d}">Make this today</button></div></div>`;
    return h;
  }

  function upcomingHTML(){
    const t = cal().today, start = ord(t.season, t.day), items = [];
    for (let k = 0; k < 21 && items.length < 7; k++){
      const { season, day } = fromOrd(start + k);
      evOn(season, day).filter(shown).forEach(e => items.push({ e, season, day, k }));
    }
    return `<div class="cal-card"><div class="meta">Today in the save: ${esc(t.season)}, day ${t.day}</div><h2 class="sm">Coming up</h2>
      ${items.length ? `<ul class="cal-up">${items.slice(0,7).map(({e, season, day, k}) => `<li><button data-day="${season}/${day}"><span class="when">${k === 0 ? "Today" : k === 1 ? "Tomorrow" : "In " + k + " days"}</span><i class="sw-${e.cat}"></i>${esc(e.title)}</button></li>`).join("")}</ul>` : `<p style="color:var(--muted)">Nothing on the books for the next three weeks.</p>`}</div>`;
  }

  /* New event, Edit event and Set date use the shared sheet (bottom sheet on phone, centered card on iPad). */
  const SHEET_THEME = { "--ui-sheet-bg":"#FFFFFF", "--ui-sheet-fg":"#101828", "--ui-sheet-accent":"#7A2E4A" };
  const closeSheet = () => { st.modal = null; st.err = null; sheetH = null; };

  function todayForm(){
    const t = cal().today;
    return `<form class="cal-sf" id="cal-today" novalidate>
      <label>Year<input name="year" type="number" inputmode="numeric" min="1" value="${cal().year}"></label>
      <label>Season<select name="season">${names().map(n => `<option ${n===t.season?"selected":""}>${n}</option>`).join("")}</select></label>
      <label>Day<input name="day" type="number" inputmode="numeric" min="1" max="21" value="${t.day}"></label>
      <p class="cal-err" role="alert" hidden></p><button type="submit" hidden>Save</button></form>`;
  }

  function eventForm(e){
    return `<form class="cal-sf" id="cal-ev">
      <label>Title<input name="title" required placeholder="What is happening" value="${esc(e.title)}"></label>
      <label>Category<select name="cat">${Object.entries(cal().categories).map(([k,v]) => `<option value="${k}" ${k===e.cat?"selected":""}>${esc(v)}</option>`).join("")}</select></label>
      <div class="two"><label>Season<select name="season">${names().map(n => `<option ${n===e.season?"selected":""}>${n}</option>`).join("")}</select></label>
      <label>Day<input name="day" type="number" inputmode="numeric" min="1" max="21" value="${e.day}"></label></div>
      <label>Details<textarea name="details" placeholder="Who is going to be there, anything to set up in game">${esc(e.details)}</textarea></label>
      <div class="lab">Who is involved</div>${UI.simPicker("sims", e.sims, data.sims)}
      <p class="cal-err" role="alert" hidden></p><button type="submit" hidden>Save</button>
      ${e.id ? `<button type="button" class="cal-del" data-delete="${e.id}">Delete event</button>` : ""}</form>`;
  }

  const clampDay = n => Math.min(21, Math.max(1, parseInt(n, 10) || 1));
  async function submitSheet(form){
    const f = new FormData(form), v = k => (f.get(k) || "").trim();
    try {
      if (form.id === "cal-today") {
        const n = { season:v("season"), day:clampDay(v("day")) };
        await GFB.setToday(n, Math.max(1, parseInt(v("year"), 10) || 1));
        sheetH.close("saved"); st.sel = n; go(n.season, n.season + "/" + n.day); return;
      }
      if (!v("title")) { form.reportValidity(); return; }
      const ev = { ...st.modal.event, title:v("title"), cat:v("cat"), season:v("season"), day:clampDay(v("day")), details:v("details"), sims:f.getAll("sims") };
      await GFB.saveEvent(ev);
      sheetH.close("saved"); st.sel = { season:ev.season, day:ev.day }; go(ev.season, ev.season + "/" + ev.day); draw();
    } catch (err) {
      const p = form.querySelector(".cal-err"); p.textContent = err.message; p.hidden = false;
    }
  }

  function openSheet(){
    if (!st.modal || sheetH) return;
    const isToday_ = st.modal.kind === "today", e = st.modal.event;
    sheetH = UI.sheet({
      title: isToday_ ? "Set date" : e.id ? "Edit event" : "New event",
      body: isToday_ ? todayForm() : eventForm(e),
      left: "Cancel", right: "Save", theme: SHEET_THEME,
      onRight: () => submitSheet(sheetH.body.querySelector("form")),
      onClose: closeSheet
    });
    sheetH.el.classList.add("cal-sheet");
    const form = sheetH.body.querySelector("form");
    form.addEventListener("submit", ev => { ev.preventDefault(); submitSheet(form); });
    form.querySelector("[data-delete]")?.addEventListener("click", async ev => {
      const btn = ev.currentTarget;
      if (UI.confirmTap(btn, "Tap again: deletes it every year")) { await GFB.deleteEvent(btn.dataset.delete); sheetH.close("deleted"); draw(); }
    });
  }

  function draw(){
    const t = cal().today, view = st.view, sel = st.sel || t;
    const sub = view === "year" ? "Year " + cal().year + ", 84 days" : cal().seasons[sIdx(view)].months[0] + " through " + cal().seasons[sIdx(view)].months[2] + ", Year " + cal().year;
    const step = `<button class="cal-btn" data-act="next" aria-label="Advance one day">Next day</button><button class="cal-btn" data-act="setdate">Set date</button>`;
    root.innerHTML = `<div class="site-cal"><div class="cal-wrap"><div class="cal-left">
      <div class="cal-top"><h1>${view === "year" ? "The year" : esc(view)}<small>${esc(sub)}</small></h1>
        <div class="cal-hacts"><span class="wide">${step}</span><button class="cal-btn primary" data-add="${sel.season}/${sel.day}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add event</button></div></div>
      <div class="cal-bar"><div class="ui-seg cal-tabs" role="group" aria-label="View">${[...names(), "year"].map(n => `<button data-view="${n}" aria-pressed="${view===n}">${n === "year" ? "Year" : n}</button>`).join("")}</div>
        <button class="cal-btn wide" data-act="gotoday">Jump to today</button>
        <div class="ui-chips wrap cal-cats" role="group" aria-label="Show categories">${Object.entries(cal().categories).map(([k,v]) => `<button class="ui-chip" data-cat="${k}" aria-pressed="${st.active[k]}"><span><i class="ui-dot sw-${k}"></i>${esc(v)}</span></button>`).join("")}</div></div>
      ${view === "year" ? yearHTML() : seasonHTML(view)}
      <div class="cal-steps narrow">${step}<button class="cal-btn" data-act="gotoday">Jump to today</button></div></div>
      <aside class="cal-side">${detailHTML()}${upcomingHTML()}</aside></div></div>`;
    openSheet();
  }

  const parseDay = v => { const [season, day] = v.split("/"); return { season, day:+day }; };
  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-cal");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      const x = k => t.closest(`[data-${k}]`)?.dataset[k];
      if (x("write")) { st.writing = { text:"", sims:[] }; draw(); root.querySelector("#cal-logform textarea")?.focus(); return; }
      if (t.closest("[data-cancelwrite]")) { st.writing = null; draw(); return; }
      if (x("editlog")) { st.writing = JSON.parse(JSON.stringify(cal().logs.find(l => l.id === x("editlog")))); draw(); return; }
      if (x("dellog")) { if (UI.confirmTap(t.closest("[data-dellog]"))) { await GFB.deleteLog(x("dellog")); st.writing = null; draw(); } return; }
      if (x("edit")) { st.modal = { kind:"event", event: JSON.parse(JSON.stringify(cal().events.find(v => v.id === x("edit")))) }; draw(); return; }
      if (x("add")) { const p = parseDay(x("add")); st.modal = { kind:"event", event:{ title:"", cat:"gameplay", season:p.season, day:p.day, details:"", sims:[] } }; draw(); return; }
      if (x("settoday")) { await GFB.setToday(parseDay(x("settoday"))); draw(); return; }
      if (x("day")) { const p = parseDay(x("day")); st.sel = p; st.writing = null; st.reveal = true; go(st.view === "year" ? p.season : st.view === p.season ? p.season : p.season, p.season + "/" + p.day); return; }
      if (x("view")) { go(x("view")); return; }
      if (x("cat")) { const c = x("cat"); st.active[c] = !st.active[c]; draw(); return; }
      const act = x("act");
      if (act === "next") { const tt = cal().today, n = fromOrd(ord(tt.season, tt.day) + 1); await GFB.setToday(n, n.season === names()[0] && n.day === 1 ? cal().year + 1 : null); st.sel = n; go(n.season, n.season + "/" + n.day); }
      if (act === "gotoday") { const tt = cal().today; st.sel = { ...tt }; go(tt.season, tt.season + "/" + tt.day); }
      if (act === "setdate") { st.modal = { kind:"today" }; draw(); }
    });
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      const f = new FormData(e.target), v = k => (f.get(k) || "").trim();
      try {
        if (e.target.id === "cal-logform") {
          const sel = st.sel || cal().today;
          await GFB.saveLog({ ...st.writing, season: st.writing.season || sel.season, day: st.writing.day || sel.day, year: st.writing.year || cal().year, title: v("title"), text: v("text"), sims: f.getAll("sims") });
          st.writing = null; draw(); return;
        }
      } catch (err) { st.err = err.message; draw(); }
    });
  }

  function render(el, d, parts){
    root = el; data = d;
    const [view, s, day] = parts || [];
    st.view = view === "year" || names().includes(view) ? view : cal().today.season;
    if (s && day && names().includes(s)) st.sel = { season:s, day:+day };
    else if (!st.sel || (st.view !== "year" && st.sel.season !== st.view)) st.sel = st.view === cal().today.season || st.view === "year" ? { ...cal().today } : { season:st.view, day:1 };
    bind(); draw();
    if (st.reveal) { st.reveal = false; if (root.clientWidth <= 700) root.querySelector(".cal-side")?.scrollIntoView({ block:"start" }); }
  }
  return { render };
})();
