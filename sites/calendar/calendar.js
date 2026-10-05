/* Calendar: 84-day year of four 21-day seasons. Reads and saves through GFB. */
const Calendar = (() => {
  const RANGES = ["1\u20134","5\u20138","9\u201313","14\u201317","18\u201321","22\u201326","27\u201331"];
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const st = { view:null, sel:null, active:{holiday:true,sports:true,industry:true,gameplay:true,school:true}, modal:null, err:null, writing:null };
  let data = null, root = null;

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
      rows += `<div class="cal-row"><div class="cal-month" title="${esc(S.months[w])}">${esc(S.months[w].slice(0,3))}</div>`;
      for (let i = 1; i <= 7; i++){
        const d = w*7 + i, evs = evOn(s, d).filter(shown);
        const cls = ["cal-day"];
        if (st.active.school && inSchool(s,d)) cls.push("school");
        if (st.active.school && isEnroll(s,d)) cls.push("enroll");
        if (isToday(s,d)) cls.push("today");
        if (st.sel && st.sel.season === s && st.sel.day === d) cls.push("sel");
        rows += `<button class="${cls.join(" ")}" data-day="${s}/${d}" aria-label="${esc(s)} day ${d}${evs.map(e => ", " + esc(e.title)).join("")}${isToday(s,d) ? ", today" : ""}"><span class="n"><span>${d}</span>${hasLog(s,d) ? `<i class="cal-logdot" title="Logged"></i>` : ""}</span>${evs.map(e => `<span class="cal-ev c-${e.cat}">${esc(e.title)}</span>`).join("")}</button>`;
      }
      rows += `</div>`;
    }
    return `<div class="cal-grid"><div class="cal-head"><div></div>${DOW.map(x => `<div>${x}</div>`).join("")}</div>${rows}</div>`;
  }

  function yearHTML(){
    return `<div class="cal-year">${cal().seasons.map(S => `<section class="cal-mini"><h2>${esc(S.name)}</h2><p>${esc(S.months[0])} through ${esc(S.months[2])}</p>
      <div class="cal-mgrid">${Array.from({length:21}, (_, k) => { const d = k + 1, e = evOn(S.name, d).filter(shown)[0];
        return `<button class="cal-mday ${e ? "has c-" + e.cat : ""} ${isToday(S.name,d) ? "today" : ""} ${hasLog(S.name,d) ? "logged" : ""}" data-day="${S.name}/${d}" title="${e ? esc(e.title) : ""}">${d}</button>`; }).join("")}</div></section>`).join("")}</div>`;
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
        <div class="acts"><button class="cal-btn" data-edit="${e.id}">Edit</button></div>`;
    });
    const logs = logsOn(s, d);
    h += `<div class="cal-log"><div class="cal-loghead"><span>What happened</span>${st.writing ? "" : `<button class="cal-link" data-write="${s}/${d}">Log this day</button>`}</div>
      ${st.writing ? `<form id="cal-logform"><input name="title" class="cal-loginput" placeholder="Title, like &quot;Dom didn't come home&quot;" value="${esc(st.writing.title || "")}"><textarea name="text" class="cal-big" placeholder="What went down today?" required>${esc(st.writing.text || "")}</textarea>
        <div class="cal-k">Tag Sims</div>${UI.simPicker("sims", st.writing.sims, data.sims)}
        <div class="acts">${st.writing.id ? `<button type="button" class="cal-del" data-dellog="${st.writing.id}">Delete</button>` : ""}<span style="flex:1"></span><button type="button" class="cal-btn" data-cancelwrite>Cancel</button><button class="cal-btn primary" type="submit">Save</button></div></form>` : ""}
      ${logs.length ? logs.map(l => `<article class="cal-entry"><div class="meta">Year ${l.year}</div>${l.title ? `<h4>${esc(l.title)}</h4>` : ""}${paras(l.text)}${l.sims?.length ? `<div class="cal-tags">${l.sims.map(id => `<span class="cal-tag">${esc(simName(id))}</span>`).join("")}</div>` : ""}<button class="cal-link" data-editlog="${l.id}">Edit</button></article>`).join("")
        : (st.writing ? "" : `<p class="cal-empty">Nothing logged yet.</p>`)}
    </div>`;
    h += `<div class="acts"><button class="cal-btn primary" data-add="${s}/${d}">Add event</button>${isToday(s,d) ? "" : `<button class="cal-btn" data-settoday="${s}/${d}">Make this today</button>`}</div></div>`;
    return h;
  }

  function upcomingHTML(){
    const t = cal().today, start = ord(t.season, t.day), items = [];
    for (let k = 0; k < 21 && items.length < 7; k++){
      const { season, day } = fromOrd(start + k);
      evOn(season, day).filter(shown).forEach(e => items.push({ e, season, day, k }));
    }
    return `<div class="cal-card"><div class="meta">Next three weeks</div><h2 style="font-size:24px">Coming up</h2>
      ${items.length ? `<ul class="cal-up">${items.slice(0,7).map(({e, season, day, k}) => `<li><button data-day="${season}/${day}"><span class="when">${k === 0 ? "Today" : k === 1 ? "Tomorrow" : "In " + k + " days"}</span><i class="sw-${e.cat}"></i>${esc(e.title)}</button></li>`).join("")}</ul>` : `<p style="color:var(--muted)">Nothing on the books for the next three weeks.</p>`}</div>`;
  }

  function modalHTML(){
    if (!st.modal) return "";
    if (st.modal.kind === "today"){
      const t = cal().today;
      return `<div class="cal-modal" data-closebg><form class="cal-form" id="cal-today"><h2>Where's the save?</h2>
        <div class="row"><label>Year<input name="year" type="number" min="1" value="${cal().year}"></label>
        <label>Season<select name="season">${names().map(n => `<option ${n===t.season?"selected":""}>${n}</option>`).join("")}</select></label>
        <label>Day<input name="day" type="number" min="1" max="21" value="${t.day}"></label></div>
        <div class="acts"><span class="spacer"></span><button type="button" class="cal-btn" data-close>Cancel</button><button class="cal-btn primary" type="submit">Set date</button></div></form></div>`;
    }
    const e = st.modal.event;
    const sims = [...data.sims].sort((a,b) => simName(a.id).localeCompare(simName(b.id)));
    return `<div class="cal-modal" data-closebg><form class="cal-form" id="cal-ev"><h2>${e.id ? "Edit event" : "New event"}</h2>
      <label>Title<input name="title" required value="${esc(e.title)}"></label>
      <div class="row"><label>Category<select name="cat">${Object.entries(cal().categories).map(([k,v]) => `<option value="${k}" ${k===e.cat?"selected":""}>${esc(v)}</option>`).join("")}</select></label>
      <label>Season<select name="season">${names().map(n => `<option ${n===e.season?"selected":""}>${n}</option>`).join("")}</select></label>
      <label>Day<input name="day" type="number" min="1" max="21" value="${e.day}"></label></div>
      <label>Details<textarea name="details" class="cal-big" placeholder="What's happening, who's going to be there, anything to set up in game...">${esc(e.details)}</textarea></label>
      <div class="cal-k" style="margin-bottom:0">Who's involved</div>${UI.simPicker("sims", e.sims, data.sims)}
      ${st.err ? `<p style="color:#B3261E;font-weight:600">${esc(st.err)}</p>` : ""}
      <div class="acts">${e.id ? `<button type="button" class="cal-del" data-delete="${e.id}">Delete event</button>` : ""}<span class="spacer"></span><button type="button" class="cal-btn" data-close>Cancel</button><button class="cal-btn primary" type="submit">Save</button></div></form></div>`;
  }

  function draw(){
    const t = cal().today, view = st.view;
    root.innerHTML = `<div class="site-cal">
      <div class="cal-top"><div class="cal-badge" aria-hidden="true"><span>${esc(t.season.slice(0,3).toUpperCase())}</span><b>${t.day}</b></div><h1>${view === "year" ? "The year" : esc(view)}<small>${view === "year" ? "Year " + cal().year + ", 84 days" : esc(cal().seasons[sIdx(view)].months[0]) + " through " + esc(cal().seasons[sIdx(view)].months[2]) + ", Year " + cal().year}</small></h1><span class="spacer"></span>
        <div class="cal-today"><span><span class="lbl">Today in the save</span><br><b>${esc(t.season)}, day ${t.day}</b></span>
          <button class="cal-btn" data-act="next" aria-label="Advance one day">Next day</button><button class="cal-btn" data-act="setdate">Set date</button></div></div>
      <div class="cal-bar"><div class="cal-tabs" role="group" aria-label="View">${[...names(), "year"].map(n => `<button data-view="${n}" aria-pressed="${view===n}">${n === "year" ? "Year" : n}</button>`).join("")}</div>
        <button class="cal-btn" data-act="gotoday">Jump to today</button><span class="spacer"></span>
        ${Object.entries(cal().categories).map(([k,v]) => `<button class="cal-chip" data-cat="${k}" aria-pressed="${st.active[k]}"><i class="sw-${k}"></i>${esc(v)}</button>`).join("")}</div>
      <div class="cal-main"><div>${view === "year" ? yearHTML() : seasonHTML(view)}</div><aside class="cal-side">${detailHTML()}${upcomingHTML()}</aside></div>
      ${modalHTML()}</div>`;
  }

  const parseDay = v => { const [season, day] = v.split("/"); return { season, day:+day }; };
  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-cal");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.matches("[data-closebg]") || t.closest("[data-close]")) { st.modal = null; st.err = null; draw(); return; }
      const x = k => t.closest(`[data-${k}]`)?.dataset[k];
      if (x("write")) { st.writing = { text:"", sims:[] }; draw(); root.querySelector("#cal-logform textarea")?.focus(); return; }
      if (t.closest("[data-cancelwrite]")) { st.writing = null; draw(); return; }
      if (x("editlog")) { st.writing = JSON.parse(JSON.stringify(cal().logs.find(l => l.id === x("editlog")))); draw(); return; }
      if (x("dellog")) { if (UI.confirmTap(t.closest("[data-dellog]"))) { await GFB.deleteLog(x("dellog")); st.writing = null; draw(); } return; }
      if (x("delete")) { if (UI.confirmTap(t.closest("[data-delete]"), "Tap again: deletes it every year")) { await GFB.deleteEvent(x("delete")); st.modal = null; draw(); } return; }
      if (x("edit")) { st.modal = { kind:"event", event: JSON.parse(JSON.stringify(cal().events.find(v => v.id === x("edit")))) }; draw(); return; }
      if (x("add")) { const p = parseDay(x("add")); st.modal = { kind:"event", event:{ title:"", cat:"gameplay", season:p.season, day:p.day, details:"", sims:[] } }; draw(); return; }
      if (x("settoday")) { await GFB.setToday(parseDay(x("settoday"))); draw(); return; }
      if (x("day")) { const p = parseDay(x("day")); st.sel = p; st.writing = null; go(st.view === "year" ? p.season : st.view === p.season ? p.season : p.season, p.season + "/" + p.day); return; }
      if (x("view")) { go(x("view")); return; }
      if (x("cat")) { const c = x("cat"); st.active[c] = !st.active[c]; draw(); return; }
      const act = x("act");
      if (act === "next") { const tt = cal().today, n = fromOrd(ord(tt.season, tt.day) + 1); await GFB.setToday(n, n.season === names()[0] && n.day === 1 ? cal().year + 1 : null); st.sel = n; go(n.season, n.season + "/" + n.day); }
      if (act === "gotoday") { const tt = cal().today; st.sel = { ...tt }; go(tt.season, tt.season + "/" + tt.day); }
      if (act === "setdate") { st.modal = { kind:"today" }; draw(); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && st.modal && root?.querySelector(".cal-modal")) { e.stopImmediatePropagation(); st.modal = null; draw(); } }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      const f = new FormData(e.target), v = k => (f.get(k) || "").trim();
      const clampDay = n => Math.min(21, Math.max(1, parseInt(n, 10) || 1));
      try {
        if (e.target.id === "cal-today") {
          const n = { season:v("season"), day:clampDay(v("day")) };
          await GFB.setToday(n, Math.max(1, parseInt(v("year"), 10) || 1)); st.modal = null; st.sel = n; go(n.season, n.season + "/" + n.day); return;
        }
        if (e.target.id === "cal-logform") {
          const sel = st.sel || cal().today;
          await GFB.saveLog({ ...st.writing, season: st.writing.season || sel.season, day: st.writing.day || sel.day, year: st.writing.year || cal().year, title: v("title"), text: v("text"), sims: f.getAll("sims") });
          st.writing = null; draw(); return;
        }
        if (e.target.id === "cal-ev") {
          const ev = { ...st.modal.event, title:v("title"), cat:v("cat"), season:v("season"), day:clampDay(v("day")), details:v("details"), sims:f.getAll("sims") };
          await GFB.saveEvent(ev); st.modal = null; st.err = null; st.sel = { season:ev.season, day:ev.day }; go(ev.season, ev.season + "/" + ev.day); draw(); return;
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
  }
  return { render };
})();
