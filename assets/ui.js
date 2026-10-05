/* Small shared UI pieces every site can use. They take on each site's own colors. */
const UI = (() => {
  let ALL = [];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const clean = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();

  /* Two-tap delete. Browsers inside some viewers block pop-up confirms, so the button asks instead. */
  function confirmTap(btn, label = "Tap again to delete") {
    if (!btn) return false;
    if (btn.dataset.armed === "1") return true;
    btn.dataset.armed = "1"; btn.dataset.orig = btn.textContent; btn.textContent = label; btn.classList.add("ui-armed");
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.dataset.armed = ""; btn.textContent = btn.dataset.orig; btn.classList.remove("ui-armed"); }, 3500);
    return false;
  }

  /* Searchable Sim picker. Submits as repeated hidden inputs, same as checkboxes did. */
  function simPicker(name, selected, sims, placeholder = "Search Sims to tag") {
    ALL = [...sims].sort((a,b) => clean(a.name).localeCompare(clean(b.name)));
    const chip = id => { const s = ALL.find(x => x.id === id); return s ? `<span class="sp-chip">${esc(clean(s.name))}<button type="button" class="sp-x" data-spx="${id}" aria-label="Remove ${esc(clean(s.name))}">\u00d7</button><input type="hidden" name="${name}" value="${id}"></span>` : ""; };
    return `<div class="simpick" data-name="${name}"><div class="sp-chips">${(selected || []).map(chip).join("")}</div>
      <input class="sp-search" type="search" placeholder="${esc(placeholder)}" autocomplete="off" aria-label="${esc(placeholder)}">
      <div class="sp-results" hidden></div></div>`;
  }
  function results(box) {
    const q = box.querySelector(".sp-search").value.trim().toLowerCase();
    const taken = new Set([...box.querySelectorAll('input[type=hidden]')].map(i => i.value));
    const list = ALL.filter(s => !taken.has(s.id) && (!q || clean(s.name).toLowerCase().includes(q))).slice(0, 8);
    const r = box.querySelector(".sp-results");
    r.innerHTML = list.length ? list.map(s => `<button type="button" class="sp-opt" data-spadd="${s.id}">${esc(clean(s.name))}${s.career ? `<small>${esc(s.career)}</small>` : ""}</button>`).join("") : `<div class="sp-none">No Sims match "${esc(q)}"</div>`;
    r.hidden = false;
  }
  function add(box, id) {
    const s = ALL.find(x => x.id === id); if (!s) return;
    const name = box.dataset.name;
    box.querySelector(".sp-chips").insertAdjacentHTML("beforeend", `<span class="sp-chip">${esc(clean(s.name))}<button type="button" class="sp-x" data-spx="${id}" aria-label="Remove">\u00d7</button><input type="hidden" name="${name}" value="${id}"></span>`);
    const q = box.querySelector(".sp-search"); q.value = ""; q.focus(); results(box);
  }
  document.addEventListener("focusin", e => { if (e.target.matches?.(".sp-search")) results(e.target.closest(".simpick")); });
  document.addEventListener("input", e => { if (e.target.matches?.(".sp-search")) results(e.target.closest(".simpick")); });
  document.addEventListener("focusout", e => { if (e.target.matches?.(".sp-search")) { const box = e.target.closest(".simpick"); setTimeout(() => { if (!box.contains(document.activeElement)) box.querySelector(".sp-results").hidden = true; }, 150); } });
  document.addEventListener("keydown", e => {
    if (!e.target.matches?.(".sp-search")) return;
    if (e.key === "Enter") { e.preventDefault(); const first = e.target.closest(".simpick").querySelector(".sp-opt"); if (first) add(e.target.closest(".simpick"), first.dataset.spadd); }
    if (e.key === "Escape") { e.stopImmediatePropagation(); e.target.closest(".simpick").querySelector(".sp-results").hidden = true; }
  }, true);
  document.addEventListener("mousedown", e => { if (e.target.closest(".sp-opt")) e.preventDefault(); }, true);
  document.addEventListener("click", e => {
    const o = e.target.closest(".sp-opt"); if (o) { e.stopPropagation(); add(o.closest(".simpick"), o.dataset.spadd); return; }
    const x = e.target.closest(".sp-x"); if (x) { e.stopPropagation(); x.closest(".sp-chip").remove(); }
  }, true);

  /* In-game dates: { season, day, year } on the save's calendar (four 21-day seasons). Old real-world date strings still display. */
  function gameDate(name, d, cal) {
    d = d && typeof d === "object" ? d : { ...cal.today, year: cal.year };
    return `<div class="ui-gdate"><select name="${name}_season" aria-label="Season">${cal.seasons.map(s => `<option ${s.name === d.season ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
      <label><span>Day</span><input name="${name}_day" type="number" min="1" max="21" inputmode="numeric" value="${d.day}"></label>
      <label><span>Year</span><input name="${name}_year" type="number" min="1" inputmode="numeric" value="${d.year}"></label></div>`;
  }
  const readGameDate = (f, name, cal) => ({ season: f.get(name + "_season") || cal.today.season, day: Math.min(21, Math.max(1, parseInt(f.get(name + "_day"), 10) || 1)), year: Math.max(1, parseInt(f.get(name + "_year"), 10) || cal.year) });
  const gameOrd = (d, cal) => d && typeof d === "object" ? (d.year - 1) * 84 + cal.seasons.findIndex(x => x.name === d.season) * 21 + d.day : 0;
  const gameLabel = d => !d ? "" : typeof d === "object" ? `${d.season}, day ${d.day}, Year ${d.year}` : new Date(d + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
  const gameToday = cal => ({ ...cal.today, year: cal.year });

  /* Searchable picker: replaces long <select>s (like "Signed in as"). A hidden input carries the id and value,
     and choosing an option fires a bubbling "change" on it, so code that listened to the old <select> keeps working. */
  function picker({ id = "", name = "", value = "", options = [], placeholder = "Search", align = "left", label = "", cls = "" }) {
    const cur = options.find(o => String(o.v) === String(value)) || options[0] || { v:"", t:"" };
    return `<div class="ui-pick ${align === "right" ? "right" : ""} ${cls}"><button type="button" class="ui-pick-btn" aria-haspopup="listbox" aria-expanded="false"${label ? ` aria-label="${esc(label)}"` : ""}><span class="ui-pick-cur">${esc(cur.t)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
      <div class="ui-pick-pop" hidden><input class="ui-pick-q" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off"><ul class="ui-pick-list" role="listbox">${options.map(o => `<li role="option" tabindex="-1" data-v="${esc(o.v)}" data-t="${esc(String(o.t + " " + (o.s || "")).toLowerCase())}" aria-selected="${String(o.v) === String(cur.v)}">${esc(o.t)}${o.s ? `<small>${esc(o.s)}</small>` : ""}</li>`).join("")}</ul><p class="ui-pick-none" hidden>No matches</p></div>
      <input type="hidden"${id ? ` id="${id}"` : ""}${name ? ` name="${name}"` : ""} value="${esc(cur.v)}"></div>`;
  }
  const closePicks = except => document.querySelectorAll(".ui-pick-pop:not([hidden])").forEach(p => { if (p !== except) { p.hidden = true; p.previousElementSibling.setAttribute("aria-expanded", "false"); } });
  function choose(li) {
    const box = li.closest(".ui-pick"), hid = box.querySelector('input[type="hidden"]');
    hid.value = li.dataset.v; box.querySelector(".ui-pick-cur").textContent = li.firstChild.textContent;
    box.querySelectorAll("li").forEach(x => x.setAttribute("aria-selected", x === li)); closePicks();
    hid.dispatchEvent(new Event("change", { bubbles:true }));
  }
  document.addEventListener("click", e => {
    const btn = e.target.closest(".ui-pick-btn");
    if (btn) { const pop = btn.nextElementSibling, open = pop.hidden; closePicks(pop); pop.hidden = !open; btn.setAttribute("aria-expanded", open); if (open) { const q = pop.querySelector(".ui-pick-q"); q.value = ""; q.dispatchEvent(new Event("input", { bubbles:true })); q.focus(); } return; }
    const li = e.target.closest(".ui-pick-list li"); if (li) { choose(li); return; }
    if (!e.target.closest(".ui-pick-pop")) closePicks();
  });
  document.addEventListener("input", e => {
    if (!e.target.classList.contains("ui-pick-q")) return;
    const q = e.target.value.trim().toLowerCase(), pop = e.target.closest(".ui-pick-pop"); let n = 0;
    pop.querySelectorAll("li").forEach(li => { const show = !q || li.dataset.t.includes(q); li.hidden = !show; if (show) n++; });
    pop.querySelector(".ui-pick-none").hidden = n > 0;
  });
  document.addEventListener("keydown", e => {
    const pop = e.target.closest && e.target.closest(".ui-pick-pop"); if (!pop) return;
    if (e.key === "Escape") { closePicks(); pop.previousElementSibling.focus(); }
    if (e.key === "Enter") { e.preventDefault(); const li = [...pop.querySelectorAll("li")].find(x => !x.hidden); if (li) choose(li); }
  });

  return { confirmTap, simPicker, gameDate, readGameDate, gameOrd, gameLabel, gameToday, picker };
})();
