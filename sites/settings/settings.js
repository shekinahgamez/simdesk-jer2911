/* Settings: system app, always light, built like iOS Settings.
   Phone: the main list, and each row opens its own page (#/settings/<page>/...). iPad: the list on the left, the page on the right.
   Wallpaper, Home screen and dock, Import Sims and Photos keep their old behavior; Worlds, Regions and Travel prices read and save
   through GFB.travel (its own table, never the edits bundle). Renames go through the Update mentions sheet. */
const Settings = (() => {
  const st = { msg:null, err:null, busy:false };
  let data = null, root = null, path = [], query = "", flash = null;
  const T = () => GFB.travel;
  const DEFAULT_BG = "radial-gradient(120% 90% at 78% 18%, #3a2d46 0%, transparent 60%), radial-gradient(90% 80% at 10% 90%, #1f2a3a 0%, transparent 60%), linear-gradient(160deg,#231d2b,#141218)";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const H = p => "#/settings" + (p ? "/" + p : "");
  const money = n => "§" + (Math.round(n * 100) % 100 ? Number(n).toFixed(2) : Math.round(n));
  const SHEET_THEME = { "--ui-sheet-bg":"#F2F2F7", "--ui-sheet-fg":"#1D1D1F", "--ui-sheet-accent":"#0A66D8" };

  /* ---------- icons and the main list ---------- */
  const g = p => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    wallpaper:["#0A84FF", g('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/>')],
    home:["#5E5CE6", g('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>')],
    worlds:["#30A46C", g('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>')],
    regions:["#32ADE6", g('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>')],
    travel:["#0e7a6c", g('<circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="6" r="2.5"/><path d="M7 16.5c5-2 3-7 9.5-9"/>')],
    import:["#FF9500", g('<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>')],
    backup:["#8E8E93", g('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>')],
    photos:["#FF2D55", g('<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>')],
    about:["#8E8E93", g('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>')]
  };
  const PAGES = {
    wallpaper:{ t:"Wallpaper", words:"background desktop picture" },
    home:{ t:"Home screen and dock", words:"dock desktop apps order hide grid rows columns fill" },
    worlds:{ t:"Worlds", words:"towns cities neighborhoods ticket code ea", v:() => T().worlds().length },
    regions:{ t:"Regions", words:"routes ways to travel passport simnation" , v:() => T().regions().length },
    travel:{ t:"Travel prices", words:"fares cost train bus plane ferry taxi rideshare rental stays hotel rush hour" },
    import:{ t:"Import Sims", words:"notion csv template" },
    backup:{ t:"Backup and restore", words:"download restore file" },
    photos:{ t:"Photos and storage", words:"cloud storage size" },
    about:{ t:"About", words:"build version", v:() => window.SIMDESK_BUILD || "dev" }
  };
  const GROUPS = [["wallpaper", "home"], ["worlds", "regions", "travel"], ["import", "backup", "photos"], ["about"]];
  const ic = k => `<span class="st-ic" style="background:${IC[k][0]}">${IC[k][1]}</span>`;
  const CHEV = `<span class="st-chev" aria-hidden="true">›</span>`;

  /* one grouped-list row. href makes it a link (with a chevron); act makes it a button; otherwise plain */
  function row({ t, s, v, href, act, icon, cls = "", right = "", aria }) {
    const inner = `${icon || ""}<span class="st-tx"><span class="st-t">${t}</span>${s ? `<span class="st-s">${s}</span>` : ""}</span>${v != null && v !== "" ? `<span class="st-v">${v}</span>` : ""}${right}${href ? CHEV : ""}`;
    const c = `st-r${icon ? " i" : ""}${s ? " two" : ""} ${cls}`;
    if (href) return `<a class="${c}" href="${href}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${inner}</a>`;
    if (act) return `<button type="button" class="${c}" data-act="${esc(act)}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${inner}</button>`;
    return `<div class="${c}">${inner}</div>`;
  }
  const group = (rows, head, foot) => `${head ? `<h3 class="st-sec">${head}</h3>` : ""}<div class="st-group">${rows.join("")}</div>${foot ? `<p class="st-foot">${foot}</p>` : ""}`;
  const sw = (on, attrs, label) => `<button type="button" class="st-sw ${on ? "on" : ""}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${attrs}><i></i></button>`;

  function mainList(sel) {
    const res = query.trim() ? searchResults(query) : null;
    return `<h1 class="st-big">Settings</h1>
      <label class="st-search"><svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/></svg><input type="search" id="st-q" placeholder="Search" value="${esc(query)}" autocomplete="off" aria-label="Search settings"></label>
      <div id="st-list">${res || GROUPS.map(gr => group(gr.map(k => row({ t:PAGES[k].t, v:PAGES[k].v ? PAGES[k].v() : null, href:H(k), icon:ic(k), cls:sel === k ? "on" : "" })))).join("")}</div>`;
  }
  function listOnly() { return query.trim() ? searchResults(query) : GROUPS.map(gr => group(gr.map(k => row({ t:PAGES[k].t, v:PAGES[k].v ? PAGES[k].v() : null, href:H(k), icon:ic(k), cls:path[0] === k ? "on" : "" })))).join(""); }

  /* ---------- search: settings pages, worlds and neighborhoods by any name (EA names too), regions, prices ---------- */
  function searchResults(q) {
    const n = q.trim().toLowerCase(), out = [];
    const pages = Object.entries(PAGES).filter(([, p]) => (p.t + " " + p.words).toLowerCase().includes(n));
    if (pages.length) out.push(group(pages.map(([k, p]) => row({ t:esc(p.t), href:H(k), icon:ic(k) })), "Settings"));
    const hits = T().find(q), ws = hits.filter(h => h.type === "world"), nbs = hits.filter(h => h.type === "neighborhood");
    if (ws.length) out.push(group(ws.map(h => row({ t:esc(h.world.name), s:esc(h.match !== h.world.name && h.match !== h.world.ea_name ? `Also called ${h.match} · ${h.world.ea_name} in EA` : `${h.world.ea_name} in EA · ${h.world.region}`), href:H("worlds/" + h.world.id) })), "Worlds"));
    if (nbs.length) out.push(group(nbs.map(h => row({ t:esc(h.nb.name), s:esc(`${h.world.name}${h.nb.ea_name ? ` · ${h.nb.ea_name} in EA` : ""}${h.match !== h.nb.name && h.match !== h.nb.ea_name ? ` · also called ${h.match}` : ""}`), href:H(`worlds/${h.world.id}/n/${h.nb.id}`) })), "Neighborhoods"));
    const regs = T().regions().filter(r => r.name.toLowerCase().includes(n));
    if (regs.length) out.push(group(regs.map(r => row({ t:esc(r.name), s:`${T().worldsIn(r.name).length} worlds`, href:H("regions/" + r.id) })), "Regions"));
    const prices = [...ROAM_FARES, ...TRIPPA_FARES, ...STAY_FARES].filter(([, t]) => t.toLowerCase().includes(n));
    if (prices.length) out.push(group(prices.map(f => fareRow(f, true)), "Travel prices"));
    return out.join("") || `<p class="st-empty">No results for “${esc(q.trim())}”</p>`;
  }

  /* ---------- names of things ---------- */
  const MODE_LABEL = m => m === "plane" ? "Plane" : T().modeName(m);
  const PRIORITY = ["plane","train","ferry_boat","car","transit","subway","rental_car","car_service_private","taxi","rideshare","car_service_limousine","airport_hotel_shuttle","walking","bike"];
  function modesLine(modes) {
    const list = PRIORITY.filter(m => modes.includes(m)).map(MODE_LABEL);
    if (!list.length) return "No ways to travel";
    const shown = list.length > 4 ? list.slice(0, 3) : list, more = list.length - shown.length;
    return shown.map((x, i) => i ? x.toLowerCase() : x).join(", ") + (more ? ` and ${more} more` : "");
  }
  const bandLine = (band, passport) => (T().BANDS[band] || band) + (passport ? ", passport" : "");
  const LEVELS = [["low","Low"],["standard","Standard"],["high","High"]];
  const levelName = v => (LEVELS.find(x => x[0] === v) || [v, v])[1];

  /* fares: [key, label, unit] */
  const ROAM_FARES = [["train_each_estimate","Train","each"],["train_first_each_estimate","Train, first class","each"],["bus_each","Bus","each"],["subway_rush_each","Subway, rush hour","each"],["ferry_economy_each","Ferry","each"],["ferry_first_each","Ferry, first class","each"],["taxi_per_ride_about","Taxi","per ride"],["rideshare_per_ride_about","Rideshare","per ride"],["rental_car_per_car","Rental car","per car"],["own_car_gas_per_car","Drive, gas","per car"]];
  const TRIPPA_FARES = [["plane_economy_each","Plane, economy","each"],["plane_first_each","Plane, first class","each"]];
  const STAY_FARES = [["lodging_budget_night","Budget stay","per night"],["lodging_affordable_night","Affordable stay","per night"],["lodging_standard_night","Standard stay","per night"],["lodging_premium_night","Premium stay","per night"],["lodging_luxury_night","Luxury stay","per night"],["lodging_bedroom_add","Each bedroom","per night"],["lodging_bathroom_add","Each bathroom after the first","per night"]];
  const fareText = ([key, , unit]) => { const f = T().fare(key); if (!f) return ""; const plus = /_add$/.test(key) ? "+" : ""; return `${plus}${money(f.value)} ${unit}${f.est ? ` <span class="st-est">est.</span>` : ""}`; };
  const fareRow = (f, link) => row({ t:esc(f[1]), v:fareText(f), act:link ? null : "fare:" + f[0], href:link ? H("travel") : null, aria:`${f[1]}, change price` });

  /* ---------- page router ---------- */
  function worldOf(id) { return T().world(id); }
  const isWorldPair = s => /^\d{5,}-\d{5,}$/.test(s || ""), isRegionPair = s => /^\d{1,2}-\d{1,2}$/.test(s || "");
  function page(p) {
    const [a, b, c, d] = p;
    if (!a) return null;
    if (a === "wallpaper") return { title:"Wallpaper", body:wallpaperPage() };
    if (a === "home") return { title:"Home screen and dock", body:homePage() };
    if (a === "import") return { title:"Import Sims", body:`<section class="st-card" id="st-import"></section>`, mount:"import" };
    if (a === "backup") return { title:"Backup and restore", body:backupPage() };
    if (a === "photos") return { title:"Photos and storage", body:photosPage() };
    if (a === "about") return { title:"About", body:aboutPage() };
    if (a === "travel") return { title:"Travel prices", body:pricesPage() };
    if (a === "worlds") {
      if (!b) return { title:"Worlds", body:worldsPage() };
      const w = worldOf(b); if (!w) return { title:"Worlds", body:`<p class="st-empty">That world isn't in Settings.</p>`, back:["worlds", "Worlds"] };
      if (c === "routes" && isWorldPair(d)) return pairPage(d, `worlds/${b}/routes`, "Routes", +b);
      if (c === "routes") return { title:"Routes", body:routesPage(w), back:[`worlds/${b}`, w.name] };
      if (c === "n" && d) { const nb = (w.neighborhoods || []).find(x => x.id === d); return nb ? { title:nb.name, body:nbPage(w, nb), back:[`worlds/${b}`, w.name] } : { title:w.name, body:`<p class="st-empty">That neighborhood was removed.</p>`, back:[`worlds/${b}`, w.name] }; }
      return { title:w.name, body:worldPage(w), back:["worlds", "Worlds"] };
    }
    if (a === "regions") {
      if (!b) return { title:"Regions", body:regionsPage() };
      if (b === "overseas") return { title:"Overseas", body:overseasPage(), back:["regions", "Regions"] };
      if (isRegionPair(b)) {
        const [x, y] = b.split("-").map(n => T().region(+n));
        if (!x || !y) return { title:"Regions", body:"", back:["regions", "Regions"] };
        const title = x === y ? `Within ${x.name}` : `${x.name} and ${y.name}`;
        if (isWorldPair(c)) return pairPage(c, `regions/${b}`, x === y ? x.name : "Back", null);
        const ov = x !== y && (T().relationship(x.name, y.name) || [])[1] === "overseas";
        return { title, body:regionPairPage(x, y), back:x === y ? [`regions/${x.id}`, x.name] : ov ? ["regions/overseas", "Overseas"] : ["regions", "Regions"] };
      }
      const r = T().region(+b); if (!r) return { title:"Regions", body:"", back:["regions", "Regions"] };
      return { title:r.name, body:regionPage(r), back:["regions", "Regions"] };
    }
    return { title:"Settings", body:`<p class="st-empty">That page isn't here.</p>` };
  }
  function label() { const pg = page(path); return pg ? pg.title : ""; }

  /* ---------- drawing ---------- */
  function draw() {
    const wide = root.clientWidth > 700, sel = path[0] || (wide ? "wallpaper" : null);
    const pg = page(sel && !path[0] ? [sel] : path);
    const oldSide = root.querySelector(".st-side"), sideTop = oldSide ? oldSide.scrollTop : 0;
    const back = pg && pg.back ? `<a class="st-back" href="${H(pg.back[0])}"><span aria-hidden="true">‹</span> ${esc(pg.back[1])}</a>` : `<a class="st-back st-phone" href="${H("")}"><span aria-hidden="true">‹</span> Settings</a>`;
    root.innerHTML = `<div class="site-st ${path[0] ? "has-page" : ""}"><div class="st-split">
      <aside class="st-side" aria-label="Settings">${mainList(sel)}</aside>
      <section class="st-main">${pg ? `<div class="st-nav">${back}<b class="st-ttl">${esc(pg.title)}</b><span class="st-navr"></span></div><div class="st-body">${flash ? `<p class="st-flash" role="status">${esc(flash)}</p>` : ""}${pg.body}</div>` : ""}</section>
    </div></div>`;
    flash = null;
    const side = root.querySelector(".st-side"); if (side) side.scrollTop = sideTop;
    if (pg && pg.mount === "import") NotionImport.mount(root.querySelector("#st-import"), data);
    st.msg = st.err = null;
  }
  function redrawMain() { const m = root && root.querySelector(".st-main"), top = m ? m.scrollTop : 0; draw(); const m2 = root.querySelector(".st-main"); if (m2) m2.scrollTop = top; }

  /* ---------- Wallpaper (unchanged behavior) ---------- */
  function wallpaperPage() {
    const w = (data.settings || {}).wallpaper;
    return `<div class="st-card"><div class="st-preview" style="background:${w ? `url('${w}') center / cover no-repeat` : DEFAULT_BG}"><span class="st-dock"></span></div>
        <label class="st-drop" id="st-drop">${st.busy ? "Saving..." : `<b>Drop an image here</b><span>or tap to choose one from your photos</span>`}<input type="file" accept="image/*" id="st-file"${PhotoSlot.attr({ title:"Desktop background", shape:"wide", aspect:16 / 10, outW:2400, current:w || "" })}></label>
        ${st.err ? `<p class="st-err">${esc(st.err)}</p>` : ""}${st.msg ? `<p class="st-ok">${esc(st.msg)}</p>` : ""}</div>
      ${w ? group([row({ t:"Use the default background", act:"default", cls:"accent" })]) : ""}
      <p class="st-foot">Big photos are shrunk to fit. Saved to this browser.</p>`;
  }

  /* ---------- Home screen and dock (unchanged behavior) ---------- */
  function homePage() {
    return `<p class="st-foot st-lead">Use the switch to hide an app. Drag the handle to change the order, or drag an app between the dock and the desktop. "To dock" and "To desktop" still work too.</p>
      <div id="st-lay">${layoutHTML()}</div>
      <div class="st-card" id="st-grid">${gridHTML()}</div>`;
  }
  /* Home screen grid: settings.grid = { rows, cols (0 = Auto), fill: "down" | "across" }, read by desktop/desktop.js */
  function gridHTML(){
    if (!window.SimDeskLayout) return "";
    const L = SimDeskLayout.layout(), apps = Object.fromEntries(SimDeskLayout.apps().map(a => [a.key, a])), list = L.desktop.map(k => apps[k]).filter(Boolean);
    const f = SimDeskLayout.gridFit(list.length), gr = SimDeskLayout.grid(), across = f.fill === "across";
    const step = (key, lab, sub, val, lo, hi) => `<div class="st-set"><div><b>${lab}</b><small>${sub}</small></div><span class="st-step"><button type="button" data-grid="${key}:-1" aria-label="Fewer ${lab.toLowerCase()}" ${val <= lo && key !== "cols" ? "disabled" : ""}>−</button><em>${val || "Auto"}</em><button type="button" data-grid="${key}:1" aria-label="More ${lab.toLowerCase()}" ${val >= hi ? "disabled" : ""}>+</button></span></div>`;
    const prev = list.length ? `<div class="st-gprev"><div class="st-gbar"></div><div class="st-ggrid ${across ? "across" : ""}" style="--r:${f.rows};--c:${f.cols}">${list.map(a => `<div class="st-gic"><span>${a.icon}</span><s>${a.name}</s></div>`).join("")}</div><div class="st-gdock"></div></div>` : "";
    const fit = f.added ? `<p class="st-fit warn"><b>${f.count} apps, ${f.rows * f.cols} spots.</b> Adding a column so nothing's hidden.</p>` : `<p class="st-fit"><b>${f.count} apps, ${f.spots} spots.</b> Everything fits.</p>`;
    return `<h2>Home screen</h2><p class="st-note" style="margin:0 0 6px">How apps line up on the desktop. iPad and computer only; your phone keeps 4 across.</p>
      ${step("rows", "Rows", "Apps stacked in each column", gr.rows, 2, 8)}
      ${step("cols", "Columns", "Auto adds columns as you add apps", gr.cols, 2, 10)}
      <div class="st-set"><div><b>Fill</b><small>Which way your app order runs</small></div><span class="st-seg" role="group" aria-label="Fill"><button type="button" class="${across ? "" : "on"}" data-grid="fill:down">Down</button><button type="button" class="${across ? "on" : ""}" data-grid="fill:across">Across</button></span></div>
      ${prev}${fit}<button class="st-btn" data-grid="reset">Back to default</button>`;
  }
  async function gridChange(cmd){
    if (cmd === "reset") await GFB.saveSetting("grid", null);
    else {
      const [k, v] = cmd.split(":"), gr = SimDeskLayout.grid();
      if (k === "fill") gr.fill = v;
      else { const d = +v; if (k === "rows") gr.rows = Math.min(8, Math.max(2, gr.rows + d)); else gr.cols = d > 0 ? (gr.cols ? Math.min(10, gr.cols + 1) : 2) : (gr.cols > 2 ? gr.cols - 1 : 0); }
      const isDef = gr.rows === 4 && !gr.cols && gr.fill === "down";
      await GFB.saveSetting("grid", isDef ? null : gr);
    }
    data = await GFB.getAll(); SimDeskLayout.setGrid((data.settings || {}).grid);
    const box = root && root.querySelector("#st-grid"); if (box) box.innerHTML = gridHTML();
  }

  /* app order: saved as settings.app_layout = { dock:[keys], desktop:[keys] } and read by desktop/desktop.js */
  function layoutHTML(){
    if (!window.SimDeskLayout) return "";
    const hid = SimDeskLayout.hidden(), L = SimDeskLayout.layout(true), apps = Object.fromEntries(SimDeskLayout.apps().map(a => [a.key, a]));
    const GRIP = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><g fill="currentColor"><circle cx="7" cy="5" r="1.6"/><circle cx="13" cy="5" r="1.6"/><circle cx="7" cy="10" r="1.6"/><circle cx="13" cy="10" r="1.6"/><circle cx="7" cy="15" r="1.6"/><circle cx="13" cy="15" r="1.6"/></g></svg>`;
    const r = (k, where) => `<li class="st-app${hid.includes(k) ? " off" : ""}" data-key="${k}"><button type="button" class="st-grip" data-grip="${where}:${k}" aria-label="Reorder ${apps[k].name}. Drag, or use the up and down arrow keys.">${GRIP}</button><span class="st-aic">${apps[k].icon}</span><b>${apps[k].name}</b>
      <span class="st-appbtns">${k === "settings" ? "" : `<button type="button" class="st-sw ${hid.includes(k) ? "" : "on"}" role="switch" aria-checked="${!hid.includes(k)}" aria-label="Show ${apps[k].name}" data-hide="${k}"><i></i></button>`}${k === "settings" && where === "dock" ? "" : `<button class="st-sm wide" data-lay="move:${where}:${k}">${where === "dock" ? "To desktop" : "To dock"}</button>`}</span></li>`;
    const list = (where, title) => `<h3 class="st-sec">${title}</h3><ol class="st-apps" data-where="${where}">${L[where].map(k => r(k, where)).join("") || '<li class="st-note st-empty-li">Empty</li>'}</ol>`;
    return list("dock", "Dock") + list("desktop", "Desktop") + `<div class="st-group" style="margin-top:20px"><button type="button" class="st-r accent" data-lay="reset"><span class="st-tx"><span class="st-t">Back to the original order</span></span></button></div>`;
  }
  async function moveApp(cmd){
    const [act, where, k] = cmd.split(":");
    if (act === "reset") { await GFB.saveSetting("app_layout", null); }
    else {
      const L = SimDeskLayout.layout(true), list = L[where], i = list.indexOf(k);
      if (act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      if (act === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      if (act === "move") { list.splice(i, 1); L[where === "dock" ? "desktop" : "dock"].push(k); }
      await GFB.saveSetting("app_layout", L);
    }
    await layoutSaved();
  }
  /* redraw only the app lists, so the rest of the page (scroll position) stays put */
  async function layoutSaved(focusKey){
    data = await GFB.getAll();
    SimDeskLayout.setSaved?.((data.settings || {}).app_layout);
    window.dispatchEvent(new Event("gfb:layout"));
    const box = root && root.querySelector("#st-lay"); if (!box) return draw();
    box.innerHTML = layoutHTML();
    if (focusKey) box.querySelector(`[data-grip$=":${focusKey}"]`)?.focus();
  }

  /* drag to reorder: press the handle, drag, let go. Works with a finger, pen, or mouse.
     Settings can be reordered inside the dock but never leaves it. */
  let drag = null;
  function scrollerOf() {
    const m = root.querySelector(".st-main");
    if (m && getComputedStyle(m).overflowY === "auto" && m.scrollHeight > m.clientHeight) return m;
    return root.closest(".viewport") || root;
  }
  function dragStart(e, grip){
    const li = grip.closest(".st-app"), r = li.getBoundingClientRect(), key = li.dataset.key;
    e.preventDefault();
    const gap = document.createElement("li"); gap.className = "st-gap"; gap.style.height = r.height + "px";
    li.after(gap);
    Object.assign(li.style, { position:"fixed", left:r.left + "px", top:r.top + "px", width:r.width + "px", zIndex:50, pointerEvents:"none" });
    li.classList.add("lift");
    drag = { li, gap, key, dy:e.clientY - r.top, id:e.pointerId, scroller:scrollerOf(), y:e.clientY, raf:0 };
    try { grip.setPointerCapture(e.pointerId); } catch {}
    tick();
  }
  function place(y){
    const d = drag; d.li.style.top = (y - d.dy) + "px";
    const lists = [...root.querySelectorAll(".st-apps")].filter(l => d.key !== "settings" || l.dataset.where === "dock");
    let target = lists[0], best = Infinity;
    for (const l of lists) { const r = l.getBoundingClientRect(); const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (dist < best) { best = dist; target = l; } }
    const rows = [...target.querySelectorAll(".st-app")].filter(x => x !== d.li);
    const before = rows.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
    target.querySelector(".st-empty-li")?.setAttribute("hidden", "");
    if (before) { if (d.gap.nextElementSibling !== before) target.insertBefore(d.gap, before); }
    else if (d.gap.parentElement !== target || d.gap.nextElementSibling) target.appendChild(d.gap);
  }
  /* keeps the list scrolling while the finger rests near the top or bottom edge */
  function tick(){
    const d = drag; if (!d) return;
    const r = d.scroller.getBoundingClientRect(), edge = 60;
    const v = d.y < r.top + edge ? -Math.ceil((r.top + edge - d.y) / 6) : d.y > r.bottom - edge ? Math.ceil((d.y - (r.bottom - edge)) / 6) : 0;
    if (v) { d.scroller.scrollTop += v; place(d.y); }
    d.raf = requestAnimationFrame(tick);
  }
  async function dragEnd(cancel){
    const d = drag; if (!d) return; drag = null; cancelAnimationFrame(d.raf);
    if (cancel) { d.gap.remove(); return layoutSaved(); }
    d.gap.replaceWith(d.li);
    const L = { dock:[], desktop:[] };
    root.querySelectorAll(".st-apps").forEach(l => l.querySelectorAll(".st-app").forEach(x => L[l.dataset.where].push(x.dataset.key)));
    if (!L.dock.includes("settings")) return layoutSaved();
    const before = JSON.stringify(SimDeskLayout.layout(true));
    if (JSON.stringify(L) !== before) await GFB.saveSetting("app_layout", L);
    await layoutSaved();
  }
  async function keyMove(grip, dir){
    const [where, k] = grip.dataset.grip.split(":"), L = SimDeskLayout.layout(true), list = L[where], i = list.indexOf(k), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await GFB.saveSetting("app_layout", L); await layoutSaved(k);
  }

  /* ---------- Photos and storage (unchanged behavior) ---------- */
  let photoMsg = "";
  function photosPage(){
    const p = GFB.photoStats(), on = GFB.cloudPhotos(), kb = n => n >= 1024 ? (n / 1024).toFixed(1) + " MB" : n + " KB";
    return group([row({ t:"Your data", v:kb(p.totalKB) }), row({ t:"Photos stored inside it", v:p.count ? `${p.count} (${kb(p.photoKB)})` : "None" }), row({ t:"Cloud photos", v:on ? "On" : "Not on yet" })],
        null, p.count ? "Photos stored inside your data slow down saving and syncing." : "No photos are stored inside your data.")
      + (on ? (p.count ? group([row({ t:"Move my photos to the cloud", act:"movephotos", cls:"accent" })], null, "New uploads already go straight to the cloud.") : `<p class="st-foot">Cloud photos are on. New uploads go straight to the cloud.</p>`)
            : `<p class="st-foot"><b>Cloud photos aren't on yet.</b> New photos are still saved inside your data. Finish the two setup steps (in Supabase and in <code>assets/cloud.js</code>), then reload.</p>`)
      + (photoMsg ? `<p class="st-foot" role="status">${esc(photoMsg)}</p>` : "");
  }

  /* ---------- Backup and restore ---------- */
  const bk = { file:null, err:null, done:null };
  function backupPage() {
    const b = bk.file, c = b && b.counts, when = b && b.saved_at ? new Date(b.saved_at).toLocaleString([], { dateStyle:"medium", timeStyle:"short" }) : null;
    return group([row({ t:"Download a backup", act:"backup", cls:"accent" })], null, "Saves a file with everything in your SimDesk save plus your travel settings. Keep one before a big import.")
      + `<h3 class="st-sec">Restore</h3><div class="st-group"><label class="st-r accent st-filerow"><span class="st-tx"><span class="st-t">${b ? "Choose a different backup" : "Restore from a backup"}</span></span><input type="file" accept=".json,application/json" id="st-restore"></label></div>`
      + (bk.err ? `<p class="st-foot st-errfoot">${esc(bk.err)}</p>` : "")
      + (b ? group([row({ t:"File", v:esc(bk.name) }), when ? row({ t:"Saved", v:esc(when) }) : "", c.sims != null ? row({ t:"Sims", v:c.sims }) : c.addedSims ? row({ t:"Sims added", v:c.addedSims }) : "", c.lots != null ? row({ t:"Lots", v:c.lots }) : "", c.stories != null ? row({ t:"Black Tea stories", v:c.stories }) : "", c.notes != null ? row({ t:"Notes", v:c.notes }) : "", c.events != null ? row({ t:"Calendar events", v:c.events }) : "", row({ t:"Travel settings", v:b.travel ? "Included" : "Not in this file" })].filter(Boolean), "This backup")
        + group([row({ t:"Replace my data with this backup", act:"restore", cls:"danger" })], null, "Everything in your SimDesk save is swapped for this file. You can undo it right after.") : "")
      + (bk.done ? `<p class="st-foot st-okfoot" role="status">${esc(bk.done)}</p>` : "")
      + (GFB.canUndoRestore() ? group([row({ t:"Undo the last restore", act:"undorestore", cls:"accent" })]) : "")
      + `<p class="st-foot">Registry connections, Messages, Photos, Roam passes and Trippa trips live in their own tables, so they aren't in the file and a restore leaves them as they are.</p>`;
  }

  /* ---------- About ---------- */
  function aboutPage() {
    const t = T(), cloud = t.ready(), state = !cloud ? "On this device" : t.problem() ? "On this device for now" : t.pending() ? "Saving..." : "Saved to the cloud";
    return group([row({ t:"SimDesk build", v:esc(window.SIMDESK_BUILD || "dev") }), row({ t:"Travel settings", v:state })], null,
      cloud && t.problem() ? `Travel settings couldn't reach the cloud (${esc(t.problem())}). They're kept on this device and sent when it works.` : !cloud ? "Sign in to SimDesk's cloud to keep travel settings on every device." : "");
  }

  /* ---------- Worlds ---------- */
  function worldsPage() {
    return T().regions().map(r => { const ws = T().worldsIn(r.name); return ws.length ? group(ws.map(w => row({ t:esc(w.name), s:esc(w.ea_name === w.name ? "Same name in EA" : `${w.ea_name} in EA`), href:H("worlds/" + w.id) })), esc(r.name)) : ""; }).join("")
      + `<p class="st-foot">Search finds a world by its SimDesk name, its EA name or any other name.</p>`;
  }
  function worldPage(w) {
    const routes = T().routesFrom(w.id).length;
    return group([
        `<label class="st-r"><span class="st-tx"><span class="st-t">Name</span></span><input class="st-field" data-edit="world-name" data-id="${w.id}" value="${esc(w.name)}" autocomplete="off" enterkeyhint="done" aria-label="World name"></label>`,
        row({ t:"EA world", v:esc(w.ea_name) }),
        row({ t:"Region", v:esc(w.region), act:"region:" + w.id, right:CHEV, aria:`Region, ${w.region}` }),
        `<label class="st-r"><span class="st-tx"><span class="st-t">Ticket code</span></span><input class="st-field code" data-edit="ticket" data-id="${w.id}" value="${esc(w.ticket_code || "")}" placeholder="None" maxlength="3" autocomplete="off" autocapitalize="characters" enterkeyhint="done" aria-label="Ticket code"></label>`])
      + group([row({ t:`Routes from ${esc(w.name)}`, v:routes, href:H(`worlds/${w.id}/routes`) })])
      + group([...(w.neighborhoods || []).map(nb => row({ t:esc(nb.name), s:nb.ea_name ? esc(nb.ea_name) + " in EA" : "Added in SimDesk", href:H(`worlds/${w.id}/n/${nb.id}`) })), row({ t:"Add neighborhood", act:"addnb:" + w.id, cls:"accent" })], "Neighborhoods")
      + group([...(w.aliases || []).map((a, i) => row({ t:esc(a), act:`alias:${w.id}:${i}`, right:CHEV })), row({ t:"Add a name", act:"addalias:" + w.id, cls:"accent" })], "Other names",
        `Search finds ${esc(w.name)} by any of these names. Renaming here changes SimDesk only; in game, names come from your rename package.`);
  }
  function nbPage(w, nb) {
    return group([
        `<label class="st-r"><span class="st-tx"><span class="st-t">Name</span></span><input class="st-field" data-edit="nb-name" data-id="${w.id}" data-nb="${nb.id}" value="${esc(nb.name)}" autocomplete="off" enterkeyhint="done" aria-label="Neighborhood name"></label>`,
        nb.ea_name && !nb.added ? row({ t:"EA neighborhood", v:esc(nb.ea_name) })
          : `<label class="st-r"><span class="st-tx"><span class="st-t">EA neighborhood</span></span><input class="st-field" data-edit="nb-ea" data-id="${w.id}" data-nb="${nb.id}" value="${esc(nb.ea_name || "")}" placeholder="Optional" autocomplete="off" enterkeyhint="done" aria-label="EA neighborhood name"></label>`,
        row({ t:"World", v:esc(w.name) })])
      + group([...(nb.aliases || []).map((a, i) => row({ t:esc(a), act:`nbalias:${w.id}:${nb.id}:${i}`, right:CHEV })), row({ t:"Add a name", act:`addnbalias:${w.id}:${nb.id}`, cls:"accent" })], "Other names",
        `Search finds ${esc(nb.name)} by any of these names. Renaming here changes SimDesk only; in game, names come from your rename package.`)
      + group([row({ t:"Remove neighborhood", act:`rmnb:${w.id}:${nb.id}`, cls:"danger" })], null, "Lots keep whatever neighborhood they already say.");
  }
  function routesPage(w) {
    const list = T().routesFrom(w.id).map(p => ({ p, o:T().world(p.a === w.id ? p.b : p.a) }));
    return Object.keys(T().BANDS).map(band => { const L = list.filter(x => x.p.band === band).sort((x, y) => x.o.name.localeCompare(y.o.name)); return L.length ? group(L.map(({ p, o }) => row({ t:esc(o.name), s:esc((p.passport ? "Passport · " : "") + modesLine(p.modes)), href:H(`worlds/${w.id}/routes/${p.a}-${p.b}`) })), T().BANDS[band]) : ""; }).join("")
      + `<p class="st-foot">Matches your SimNation file. Roam and Trippa only offer what's on here.</p>`;
  }
  const PAIR_MODES = ["train","car","rental_car","transit","car_service_private","car_service_limousine","taxi","rideshare","subway","walking","bike","ferry_boat","plane","airport_hotel_shuttle"];
  function pairPage(seg, backPath, backLabel, fromId) {
    const [a, b] = seg.split("-").map(Number), p = T().pair(a, b);
    if (!p) return { title:"Route", body:`<p class="st-empty">That route isn't in your SimNation file.</p>`, back:[backPath, backLabel] };
    const first = fromId && fromId === b ? b : a, second = first === a ? b : a, A = T().world(first), B = T().world(second);
    if (backLabel === "Back") backLabel = A.region;
    return { title:`${A.name} to ${B.name}`, back:[backPath, backLabel], body:
      group([row({ t:"Distance", v:esc(T().BANDS[p.band] || p.band) }), row({ t:"Passport", v:p.passport ? "Needed" : "Not needed" })])
      + group(PAIR_MODES.map(m => row({ t:esc(MODE_LABEL(m)), right:sw(p.modes.includes(m), `data-pmode="${m}" data-pair="${p.key}"`, MODE_LABEL(m)) })), "Ways to travel")
      + `<p class="st-foot">Matches your SimNation file. If you change this route in game, change it here too.${p.changed ? ` <button type="button" class="st-link" data-act="pairreset:${p.key}">Use the SimNation file's ways</button>` : ""}</p>` };
  }

  /* ---------- Regions ---------- */
  function regionSummary(rA, rB) {
    const ps = T().between(rA, rB), rel = T().relationship(rA, rB) || [], band = rel[1] || (ps[0] && ps[0].band), passport = rel[0] === "international";
    const modes = [...new Set(ps.flatMap(p => p.modes))];
    return { band, passport, modes, line:bandLine(band, passport) + " · " + modesLine(modes), count:ps.length };
  }
  function regionsPage() {
    const R = T().regions(), home = T().settings().home_region, pairs = [], over = [];
    R.forEach((x, i) => R.slice(i + 1).forEach(y => { const s = regionSummary(x.name, y.name); (s.band === "overseas" ? over : pairs).push([x, y, s]); }));
    const os = over.length ? { line:bandLine("overseas", true) + " · " + modesLine([...new Set(over.flatMap(o => o[2].modes))]) } : null;
    return group(R.map(r => row({ t:esc(r.name), s:`${r.name === home ? "Home region · " : ""}${T().worldsIn(r.name).length} worlds`, href:H("regions/" + r.id) })))
      + group([...pairs.map(([x, y, s]) => row({ t:`${esc(x.name)} and ${esc(y.name)}`, s:esc(s.line), href:H(`regions/${x.id}-${y.id}`) })), os ? row({ t:"To Eurosimia or Simasia", s:esc(os.line), href:H("regions/overseas") }) : ""], "Between regions",
        "Copied from your SimNation Travel file. Roam and Trippa only offer what's on here.");
  }
  function overseasPage() {
    const R = T().regions(), out = [];
    R.forEach((x, i) => R.slice(i + 1).forEach(y => { const s = regionSummary(x.name, y.name); if (s.band === "overseas") out.push(row({ t:`${esc(x.name)} and ${esc(y.name)}`, s:esc(s.line), href:H(`regions/${x.id}-${y.id}`) })); }));
    return group(out, null, "No ferries cross the ocean. Every one of these needs a passport.");
  }
  function regionPage(r) {
    const ws = T().worldsIn(r.name), within = T().between(r.name, r.name);
    return group(ws.map(w => row({ t:esc(w.name), s:esc(`${w.ea_name} in EA`), href:H("worlds/" + w.id) })), "Worlds")
      + (within.length ? group([row({ t:`Travel within ${esc(r.name)}`, s:esc(modesLine([...new Set(within.flatMap(p => p.modes))])), href:H(`regions/${r.id}-${r.id}`) })]) : "");
  }
  function regionPairPage(x, y) {
    const ps = T().between(x.name, y.name), s = regionSummary(x.name, y.name);
    const state = m => { const n = ps.filter(p => p.modes.includes(m)).length; return n === 0 ? "off" : n === ps.length ? "on" : "some"; };
    const key = `${x.id}-${y.id}`;
    return group([row({ t:"Distance", v:esc(T().BANDS[s.band] || s.band || "") }), row({ t:"Passport", v:s.passport ? "Needed" : "Not needed" }), row({ t:"Routes", v:ps.length })])
      + group(PAIR_MODES.map(m => { const v = state(m); return row({ t:esc(MODE_LABEL(m)), v:v === "some" ? `${ps.filter(p => p.modes.includes(m)).length} of ${ps.length}` : "", right:sw(v === "on", `data-rmode="${m}" data-rpair="${key}"`, `${MODE_LABEL(m)} on every route`) }); }), "Ways to travel",
        "A switch here changes every route listed below. Some routes can differ; open one to set it on its own.")
      + group(ps.map(p => { const A = T().world(p.a), B = T().world(p.b), [f, t] = A.region === x.name ? [A, B] : [B, A]; return row({ t:`${esc(f.name)} to ${esc(t.name)}`, s:esc(modesLine(p.modes)), href:H(`regions/${key}/${p.a}-${p.b}`) }); }), "Routes");
  }

  /* ---------- Travel prices ---------- */
  function pricesPage() {
    const s = T().settings();
    return group([row({ t:"Travel cost level", v:levelName(s.travel_cost_level), act:"level:travel_cost_level", right:CHEV }),
        row({ t:"Rush-hour pricing", right:sw(s.rush_hour_pricing, `data-setting="rush_hour_pricing"`, "Rush-hour pricing") })], "SimNation settings", "Set these to match SimNation Travel in game.")
      + group(ROAM_FARES.map(f => fareRow(f)), "Roam")
      + group(TRIPPA_FARES.map(f => fareRow(f)), "Trippa")
      + group(STAY_FARES.map(f => fareRow(f)), "Trippa stays", "A room's nightly price is its hotel's level plus each bedroom and each bathroom after the first. Trippa shows those as est.")
      + `<p class="st-foot">Saw a different price in game? Tap it and type the new one. Prices you set stop showing est.</p>`;
  }

  /* ---------- sheets ---------- */
  function sheet(o) { const s = UI.sheet({ theme:SHEET_THEME, ...o }); s.el.classList.add("st-sheet"); return s; }
  function pickSheet(title, items, cur, onPick) {
    const s = sheet({ title, left:"Cancel", body:`<div class="st-group">${items.map(([v, t, sub]) => `<button type="button" class="st-r${sub ? " two" : ""}" data-pick="${esc(v)}"><span class="st-tx"><span class="st-t">${esc(t)}</span>${sub ? `<span class="st-s">${esc(sub)}</span>` : ""}</span>${String(v) === String(cur) ? `<span class="st-check" aria-label="Selected">✓</span>` : ""}</button>`).join("")}</div>` });
    s.body.addEventListener("click", async e => { const b = e.target.closest("[data-pick]"); if (!b) return; s.close("pick"); await onPick(b.dataset.pick); });
  }
  function fieldSheet({ title, fields, right = "Save", foot = "", extra = "", onSave, onExtra }) {
    const s = sheet({ title, left:"Cancel", right,
      body:`<div class="st-group">${fields.map(f => `<label class="st-r"><span class="st-tx"><span class="st-t">${esc(f.label)}</span></span><input class="st-field" name="${f.name}" value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}" ${f.type ? `type="${f.type}" inputmode="decimal" step="0.01" min="0"` : ""} autocomplete="off"></label>`).join("")}</div>
        <p class="st-foot st-sheet-err" hidden></p>${foot ? `<p class="st-foot">${foot}</p>` : ""}${extra}`,
      onRight:async close => { const vals = Object.fromEntries(fields.map(f => [f.name, s.body.querySelector(`[name="${f.name}"]`).value.trim()])); try { const ok = await onSave(vals); if (ok !== false) close("save"); } catch (err) { const p = s.body.querySelector(".st-sheet-err"); p.hidden = false; p.textContent = err.message; } } });
    s.body.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input")) { e.preventDefault(); s.el.querySelector("[data-sr]").click(); } });
    if (onExtra) s.body.addEventListener("click", async e => { const b = e.target.closest("[data-extra]"); if (b) await onExtra(b, s.close); });
    setTimeout(() => s.body.querySelector("input")?.focus(), 60);
    return s;
  }

  /* ---------- renames: the Update mentions sheet ---------- */
  function renameSheet(plan, onDone, onCancel) {
    const ch = { groups:{}, compounds:{}, registry:true };
    plan.groups.forEach(gp => { ch.groups[gp.key] = true; });
    plan.compounds.forEach(c => { ch.compounds[c.name] = false; });
    const body = () => `<p class="st-intro">You renamed <b>${esc(plan.from)}</b> to <b>${esc(plan.to)}</b>.</p>
      ${group(plan.structured.map(x => row({ t:esc(x.label), v:x.count ? `${x.count} <span class="st-okmark" aria-hidden="true">✓</span>` : `<span class="st-okmark" aria-hidden="true">✓</span>` })), "Updates on its own")}
      ${plan.groups.length || plan.registry ? group([...plan.groups.map(gp => row({ t:esc(gp.label), v:gp.count, right:sw(ch.groups[gp.key], `data-rg="${gp.key}"`, gp.label) })), plan.registry ? row({ t:"Registry summaries and history", v:plan.registry, right:sw(ch.registry, `data-rreg="1"`, "Registry summaries and history") }) : ""], "Written text") : `<p class="st-foot">No written text mentions ${esc(plan.from)}.</p>`}
      ${plan.compounds.length ? group(plan.compounds.map(c => row({ t:esc(c.name), s:`Becomes ${esc(c.to)}`, right:sw(ch.compounds[c.name], `data-rc="${esc(c.name)}"`, c.name) })), "Names that include it") : ""}
      <p class="st-foot">Messages stay as they were. ${esc(plan.from)} is kept as another name, so searching it still works.</p>`;
    let saved = false;
    const s = sheet({ title:"Update mentions", left:"Cancel", right:"Update", body:body(),
      onClose:() => { if (!saved) onCancel(); },
      onRight:async close => { const btn = s.el.querySelector("[data-sr]"); btn.disabled = true; btn.textContent = "Updating..."; try { const r = await onDone(ch); saved = true; close("done"); flash = r; redrawMain(); } catch (err) { btn.disabled = false; btn.textContent = "Update"; s.body.insertAdjacentHTML("afterbegin", `<p class="st-foot st-errfoot">${esc(err.message)}</p>`); } } });
    s.body.addEventListener("click", e => {
      const b = e.target.closest(".st-sw"); if (!b) return;
      if (b.dataset.rg) ch.groups[b.dataset.rg] = !ch.groups[b.dataset.rg];
      else if (b.dataset.rc) ch.compounds[b.dataset.rc] = !ch.compounds[b.dataset.rc];
      else if (b.dataset.rreg) ch.registry = !ch.registry;
      const top = s.body.scrollTop; s.body.innerHTML = body(); s.body.scrollTop = top;
    });
  }
  const nameTaken = (name, exceptId) => T().worlds().some(w => String(w.id) !== String(exceptId) && w.name.toLowerCase() === name.toLowerCase());
  const withAlias = (list, oldName, newName) => [...new Set([...(list || []).filter(a => a.toLowerCase() !== newName.toLowerCase()), oldName])];
  async function renameWorld(id, to, input) {
    const w = T().world(id), from = w.name;
    if (!to || to === from) { input.value = from; return; }
    if (nameTaken(to, id)) { input.value = from; flash = `Another world is already called ${to}.`; return redrawMain(); }
    data = await GFB.getAll();
    renameSheet(GFB.renameScan("world", from, to), async ch => {
      const r = await GFB.renameApply(GFB.renameScan("world", from, to), ch);
      await T().saveWorld(id, { name:to, aliases:withAlias(w.aliases, from, to) });
      data = await GFB.getAll();
      return `Renamed to ${to}.${r.regWarn ? " " + r.regWarn : ""}`;
    }, () => { input.value = from; });
  }
  async function renameNb(id, nbId, to, input) {
    const w = T().world(id), nb = (w.neighborhoods || []).find(x => x.id === nbId), from = nb.name;
    if (!to || to === from) { input.value = from; return; }
    if ((w.neighborhoods || []).some(x => x.id !== nbId && x.name.toLowerCase() === to.toLowerCase())) { input.value = from; flash = `${w.name} already has a neighborhood called ${to}.`; return redrawMain(); }
    data = await GFB.getAll();
    renameSheet(GFB.renameScan("nb", from, to, w.name), async ch => {
      const r = await GFB.renameApply(GFB.renameScan("nb", from, to, w.name), ch);
      await T().saveWorld(id, { neighborhoods:w.neighborhoods.map(x => x.id === nbId ? { ...x, name:to, aliases:withAlias(x.aliases, from, to) } : x) });
      data = await GFB.getAll();
      return `Renamed to ${to}.${r.regWarn ? " " + r.regWarn : ""}`;
    }, () => { input.value = from; });
  }

  /* ---------- actions ---------- */
  async function act(a, el) {
    const [k, x, y, z] = a.split(":");
    if (k === "default") { await GFB.saveSetting("wallpaper", null); data = await GFB.getAll(); st.msg = "Back to the default."; draw(); window.dispatchEvent(new Event("gfb:wallpaper")); return; }
    if (k === "movephotos") {
      el.disabled = true;
      try { const r = await GFB.movePhotosToCloud((n, t) => { el.querySelector(".st-t").textContent = `Moving ${n} of ${t}...`; });
        photoMsg = `Done. ${r.moved} photo${r.moved === 1 ? "" : "s"} moved to the cloud${r.failed ? `, ${r.failed} couldn't upload (they stay on this device; try again later)` : ""}.`; }
      catch (err) { photoMsg = "Couldn't move the photos: " + err.message; }
      data = await GFB.getAll(); return draw();
    }
    if (k === "backup") {
      const blob = new Blob([JSON.stringify(GFB.backupFile())], { type:"application/json" }), aa = document.createElement("a");
      aa.href = URL.createObjectURL(blob); aa.download = `simdesk-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(aa); aa.click(); aa.remove(); setTimeout(() => URL.revokeObjectURL(aa.href), 4000);
      return;
    }
    if (k === "restore") {
      if (!UI.confirmTap(el.querySelector(".st-t"), "Tap again to replace my data")) return;
      try { await GFB.restoreBackup(bk.file); bk.done = "Restored. Your SimDesk save now matches the backup."; bk.file = null; data = await GFB.getAll(); window.dispatchEvent(new Event("gfb:wallpaper")); window.dispatchEvent(new Event("gfb:layout")); }
      catch (err) { bk.err = err.message; }
      return redrawMain();
    }
    if (k === "undorestore") { try { await GFB.undoRestore(); bk.done = "The restore was undone."; data = await GFB.getAll(); window.dispatchEvent(new Event("gfb:wallpaper")); window.dispatchEvent(new Event("gfb:layout")); } catch (err) { bk.err = err.message; } return redrawMain(); }
    if (k === "fare") {
      const f = [...ROAM_FARES, ...TRIPPA_FARES, ...STAY_FARES].find(r => r[0] === x), cur = T().fare(x);
      return fieldSheet({ title:f[1], fields:[{ name:"v", label:`Price (§, ${f[2]})`, value:String(cur.value), type:"number" }],
        foot:"Type what you saw in game. A price you set stops showing est.",
        extra:cur.set ? `<div class="st-group"><button type="button" class="st-r accent" data-extra="reset"><span class="st-tx"><span class="st-t">Use SimNation's price (${money(cur.seed)})</span></span></button></div>` : "",
        onSave:async v => { const n = Number(String(v.v).replace(/[§,\s]/g, "")); if (!(n >= 0) || v.v === "") throw new Error("Type a price, like 60 or 18.75."); await T().setFare(x, n); redrawMain(); },
        onExtra:async (b, close) => { await T().setFare(x, null); close("reset"); redrawMain(); } });
    }
    if (k === "level") return pickSheet("Travel cost level", LEVELS, T().settings()[x], async v => { await T().setSetting(x, v); redrawMain(); });
    if (k === "region") { const w = T().world(x); return pickSheet("Region", T().regions().map(r => [r.name, r.name]), w.region, async v => { await T().saveWorld(x, { region:v }); flash = v !== w.region ? `${w.name} is now in ${v}. Its routes stay as your SimNation file has them.` : null; redrawMain(); }); }
    if (k === "addnb") {
      const w = T().world(x);
      return fieldSheet({ title:"Add neighborhood", right:"Add", fields:[{ name:"name", label:"Name", placeholder:"Required" }, { name:"ea", label:"EA name", placeholder:"Optional" }], foot:"It also joins Lotline's neighborhood list.",
        onSave:async v => { if (!v.name) throw new Error("Give the neighborhood a name."); if ((w.neighborhoods || []).some(n => n.name.toLowerCase() === v.name.toLowerCase())) throw new Error(`${w.name} already has ${v.name}.`);
          await T().saveWorld(x, { neighborhoods:[...(w.neighborhoods || []), { id:T().newId(), name:v.name, ea_name:v.ea || null, aliases:[], added:true }] }); await GFB.addLotOption("district", v.name); data = await GFB.getAll(); redrawMain(); } });
    }
    if (k === "addalias" || k === "alias") {
      const w = T().world(x), i = y != null ? +y : -1, cur = i >= 0 ? w.aliases[i] : "";
      return fieldSheet({ title:i >= 0 ? "Other name" : "Add a name", right:i >= 0 ? "Save" : "Add", fields:[{ name:"a", label:"Name", value:cur, placeholder:"The Fen" }],
        extra:i >= 0 ? `<div class="st-group"><button type="button" class="st-r danger" data-extra="rm"><span class="st-tx"><span class="st-t">Remove this name</span></span></button></div>` : "",
        onSave:async v => { if (!v.a) throw new Error("Type a name."); const list = [...(w.aliases || [])]; if (i >= 0) list[i] = v.a; else list.push(v.a); await T().saveWorld(x, { aliases:[...new Set(list)] }); redrawMain(); },
        onExtra:async (b, close) => { if (!UI.confirmTap(b.querySelector(".st-t"), "Tap again to remove")) return; await T().saveWorld(x, { aliases:w.aliases.filter((_, j) => j !== i) }); close("rm"); redrawMain(); } });
    }
    if (k === "addnbalias" || k === "nbalias") {
      const w = T().world(x), nb = w.neighborhoods.find(n => n.id === y), i = z != null ? +z : -1, cur = i >= 0 ? nb.aliases[i] : "";
      const saveNb = patch => T().saveWorld(x, { neighborhoods:w.neighborhoods.map(n => n.id === y ? { ...n, ...patch } : n) });
      return fieldSheet({ title:i >= 0 ? "Other name" : "Add a name", right:i >= 0 ? "Save" : "Add", fields:[{ name:"a", label:"Name", value:cur }],
        extra:i >= 0 ? `<div class="st-group"><button type="button" class="st-r danger" data-extra="rm"><span class="st-tx"><span class="st-t">Remove this name</span></span></button></div>` : "",
        onSave:async v => { if (!v.a) throw new Error("Type a name."); const list = [...(nb.aliases || [])]; if (i >= 0) list[i] = v.a; else list.push(v.a); await saveNb({ aliases:[...new Set(list)] }); redrawMain(); },
        onExtra:async (b, close) => { if (!UI.confirmTap(b.querySelector(".st-t"), "Tap again to remove")) return; await saveNb({ aliases:nb.aliases.filter((_, j) => j !== i) }); close("rm"); redrawMain(); } });
    }
    if (k === "rmnb") {
      if (!UI.confirmTap(el.querySelector(".st-t"), "Tap again to remove")) return;
      const w = T().world(x); await T().saveWorld(x, { neighborhoods:w.neighborhoods.filter(n => n.id !== y) }); location.hash = H("worlds/" + x); return;
    }
    if (k === "pairreset") { const [pa, pb] = x.split("-").length > 1 ? x.split("-") : [x, y]; const S = window.GFB_SIMNATION.pairs[`${pa}:${pb}`]; await T().setModes(pa, pb, S[2]); return redrawMain(); }
  }

  async function useFile(file){
    if (!file) return;
    st.busy = true; draw();
    try {
      const up = await GFB.uploadImage(file, 2400);
      await GFB.saveSetting("wallpaper", up.url);
      st.msg = "Background updated.";
    } catch (err) { st.err = err.message; }
    st.busy = false; data = await GFB.getAll(); draw();
    window.dispatchEvent(new Event("gfb:wallpaper"));
  }
  async function readRestore(file) {
    bk.err = bk.done = null; bk.file = null;
    try { bk.file = GFB.readBackup(JSON.parse(await file.text())); bk.name = file.name; }
    catch (err) { bk.err = err instanceof SyntaxError ? "That file isn't a SimDesk backup (it couldn't be read)." : err.message; }
    redrawMain();
  }

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-st");
    /* rotating the iPad or resizing a window across the phone width redraws the right layout */
    let wasWide = null;
    try { new ResizeObserver(() => { if (!root || !root.querySelector(".site-st")) return; const w = root.clientWidth > 700; if (wasWide !== null && w !== wasWide) draw(); wasWide = w; }).observe(root); } catch {}
    document.addEventListener("change", e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.id === "st-file") return useFile(t.files[0]);
      if (t.id === "st-restore") return readRestore(t.files[0]);
      const ed = t.dataset.edit; if (!ed) return;
      const v = t.value.trim().replace(/\s+/g, " ");
      if (ed === "world-name") return renameWorld(t.dataset.id, v, t);
      if (ed === "nb-name") return renameNb(t.dataset.id, t.dataset.nb, v, t);
      if (ed === "ticket") { const code = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3); t.value = code; return T().saveWorld(t.dataset.id, { ticket_code:code || null }); }
      if (ed === "nb-ea") { const w = T().world(t.dataset.id); return T().saveWorld(t.dataset.id, { neighborhoods:w.neighborhoods.map(n => n.id === t.dataset.nb ? { ...n, ea_name:v || null } : n) }); }
    });
    document.addEventListener("keydown", e => {
      if (!mine(e.target)) return;
      if (e.key === "Enter" && e.target.matches("[data-edit]")) { e.preventDefault(); e.target.blur(); }
      const gr = e.target.closest("[data-grip]");
      if (gr && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); keyMove(gr, e.key === "ArrowUp" ? -1 : 1); }
    });
    document.addEventListener("input", e => {
      if (!mine(e.target) || e.target.id !== "st-q") return;
      query = e.target.value; const box = root.querySelector("#st-list"); if (box) box.innerHTML = listOnly();
    });
    document.addEventListener("dragover", e => { const d = mine(e.target) && e.target.closest("#st-drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
    document.addEventListener("dragleave", e => { const d = mine(e.target) && e.target.closest("#st-drop"); if (d) d.classList.remove("over"); });
    document.addEventListener("drop", e => { const d = mine(e.target) && e.target.closest("#st-drop"); if (d) { e.preventDefault(); useFile(e.dataTransfer.files[0]); } });
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const gd = e.target.closest("[data-grid]"); if (gd && !gd.disabled) return gridChange(gd.dataset.grid);
      const h = e.target.closest("[data-hide]");
      if (h) { const k = h.dataset.hide, cur = SimDeskLayout.hidden(), next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
        await GFB.saveSetting("hidden_apps", next.length ? next : null); SimDeskLayout.setHidden(next); data = await GFB.getAll(); return layoutSaved(); }
      const ly = e.target.closest("[data-lay]"); if (ly && !ly.disabled) return moveApp(ly.dataset.lay);
      const pm = e.target.closest("[data-pmode]");
      if (pm) { const [a, b] = pm.dataset.pair.split(":"), p = T().pair(a, b), m = pm.dataset.pmode; await T().setModes(a, b, p.modes.includes(m) ? p.modes.filter(x => x !== m) : [...p.modes, m]); return redrawMain(); }
      const rm = e.target.closest("[data-rmode]");
      if (rm) { const [ra, rb] = rm.dataset.rpair.split("-").map(n => T().region(+n).name), m = rm.dataset.rmode, ps = T().between(ra, rb), allOn = ps.every(p => p.modes.includes(m));
        for (const p of ps) await T().setModes(p.a, p.b, allOn ? p.modes.filter(x => x !== m) : [...new Set([...p.modes, m])]); return redrawMain(); }
      const se = e.target.closest("[data-setting]"); if (se) { const k = se.dataset.setting; await T().setSetting(k, !T().settings()[k]); return redrawMain(); }
      const ac = e.target.closest("[data-act]"); if (ac && !ac.disabled) { e.preventDefault(); return act(ac.dataset.act, ac); }
    });
    document.addEventListener("pointerdown", e => { const gr = mine(e.target) && e.target.closest("[data-grip]"); if (gr && !drag && e.button <= 0) dragStart(e, gr); });
    document.addEventListener("pointermove", e => { if (drag && e.pointerId === drag.id) { e.preventDefault(); drag.y = e.clientY; place(e.clientY); } }, { passive:false });
    document.addEventListener("pointerup", e => { if (drag && e.pointerId === drag.id) dragEnd(false); });
    document.addEventListener("pointercancel", e => { if (drag && e.pointerId === drag.id) dragEnd(true); });
  }

  function render(el, d, parts){
    const next = (parts || []).map(decodeURIComponent);
    if (next.join("/") !== path.join("/")) { bk.err = null; if (next[0] !== "backup") bk.done = null; }
    const pageChanged = next.join("/") !== path.join("/");
    root = el; data = d; path = next; bind(); draw();
    if (pageChanged) { const m = root.querySelector(".st-main"); if (m) m.scrollTop = 0; }
  }
  return { render, label };
})();
