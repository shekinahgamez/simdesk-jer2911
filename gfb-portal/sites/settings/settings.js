/* Settings: system app. For now it only sets the desktop background. Saves through GFB. */
const Settings = (() => {
  const st = { msg:null, err:null, busy:false };
  let data = null, root = null;
  const DEFAULT_BG = "radial-gradient(120% 90% at 78% 18%, #3a2d46 0%, transparent 60%), radial-gradient(90% 80% at 10% 90%, #1f2a3a 0%, transparent 60%), linear-gradient(160deg,#231d2b,#141218)";

  function draw(){
    const w = (data.settings || {}).wallpaper;
    root.innerHTML = `<div class="site-st"><div class="st-wrap">
      <h1>Settings</h1>
      <section class="st-card"><h2>Desktop background</h2>
        <div class="st-preview" style="background:${w ? `url('${w}') center / cover no-repeat` : DEFAULT_BG}"><span class="st-dock"></span></div>
        <label class="st-drop" id="st-drop">${st.busy ? "Saving..." : `<b>Drop an image here</b><span>or tap to choose one from your photos</span>`}<input type="file" accept="image/*" id="st-file"${PhotoSlot.attr({ title:"Desktop background", shape:"wide", aspect:16 / 10, outW:2400, current:w || "" })}></label>
        ${st.err ? `<p class="st-err">${st.err}</p>` : ""}${st.msg ? `<p class="st-ok">${st.msg}</p>` : ""}
        ${w ? `<button class="st-btn" data-st="default">Use the default background</button>` : ""}
        <p class="st-note">Big photos are shrunk to fit. Saved to this browser.</p>
      </section>
      <section class="st-card" style="margin-top:16px"><h2>Desktop and dock</h2><p class="st-note" style="margin:0 0 10px">Use the switch to hide an app. Drag the handle to change the order, or drag an app between the dock and the desktop. "To dock" and "To desktop" still work too.</p><div id="st-lay">${layoutHTML()}</div></section>
      <section class="st-card" id="st-grid" style="margin-top:16px">${gridHTML()}</section>
      <section class="st-card" style="margin-top:16px">${photosHTML()}</section>
      <section class="st-card" id="st-import" style="margin-top:16px"></section>
      <p class="st-note" style="text-align:center;margin:18px 0 6px">SimDesk build <b>${window.SIMDESK_BUILD || "dev"}</b></p></div></div>`;
    st.msg = st.err = null;
    NotionImport.mount(root.querySelector("#st-import"), data);
  }

  /* Home screen grid: settings.grid = { rows, cols (0 = Auto), fill: "down" | "across" }, read by desktop/desktop.js */
  function gridHTML(){
    if (!window.SimDeskLayout) return "";
    const L = SimDeskLayout.layout(), apps = Object.fromEntries(SimDeskLayout.apps().map(a => [a.key, a])), list = L.desktop.map(k => apps[k]).filter(Boolean);
    const f = SimDeskLayout.gridFit(list.length), g = SimDeskLayout.grid(), across = f.fill === "across";
    const step = (key, label, sub, val, lo, hi) => `<div class="st-set"><div><b>${label}</b><small>${sub}</small></div><span class="st-step"><button type="button" data-grid="${key}:-1" aria-label="Fewer ${label.toLowerCase()}" ${val <= lo && key !== "cols" ? "disabled" : ""}>−</button><em>${val || "Auto"}</em><button type="button" data-grid="${key}:1" aria-label="More ${label.toLowerCase()}" ${val >= hi ? "disabled" : ""}>+</button></span></div>`;
    const prev = list.length ? `<div class="st-gprev"><div class="st-gbar"></div><div class="st-ggrid ${across ? "across" : ""}" style="--r:${f.rows};--c:${f.cols}">${list.map(a => `<div class="st-gic"><span>${a.icon}</span><s>${a.name}</s></div>`).join("")}</div><div class="st-gdock"></div></div>` : "";
    const fit = f.added ? `<p class="st-fit warn"><b>${f.count} apps, ${f.rows * f.cols} spots.</b> Adding a column so nothing's hidden.</p>` : `<p class="st-fit"><b>${f.count} apps, ${f.spots} spots.</b> Everything fits.</p>`;
    return `<h2>Home screen</h2><p class="st-note" style="margin:0 0 6px">How apps line up on the desktop. iPad and computer only; your phone keeps 4 across.</p>
      ${step("rows", "Rows", "Apps stacked in each column", g.rows, 2, 8)}
      ${step("cols", "Columns", "Auto adds columns as you add apps", g.cols, 2, 10)}
      <div class="st-set"><div><b>Fill</b><small>Which way your app order runs</small></div><span class="st-seg" role="group" aria-label="Fill"><button type="button" class="${across ? "" : "on"}" data-grid="fill:down">Down</button><button type="button" class="${across ? "on" : ""}" data-grid="fill:across">Across</button></span></div>
      ${prev}${fit}<button class="st-btn" data-grid="reset">Back to default</button>`;
  }
  async function gridChange(cmd){
    if (cmd === "reset") await GFB.saveSetting("grid", null);
    else {
      const [k, v] = cmd.split(":"), g = SimDeskLayout.grid();
      if (k === "fill") g.fill = v;
      else { const d = +v; if (k === "rows") g.rows = Math.min(8, Math.max(2, g.rows + d)); else g.cols = d > 0 ? (g.cols ? Math.min(10, g.cols + 1) : 2) : (g.cols > 2 ? g.cols - 1 : 0); }
      const isDef = g.rows === 4 && !g.cols && g.fill === "down";
      await GFB.saveSetting("grid", isDef ? null : g);
    }
    data = await GFB.getAll(); SimDeskLayout.setGrid((data.settings || {}).grid);
    const box = root && root.querySelector("#st-grid"); if (box) box.innerHTML = gridHTML();
  }

  /* app order: saved as settings.app_layout = { dock:[keys], desktop:[keys] } and read by desktop/desktop.js */
  function layoutHTML(){
    if (!window.SimDeskLayout) return "";
    const hid = SimDeskLayout.hidden(), L = SimDeskLayout.layout(true), apps = Object.fromEntries(SimDeskLayout.apps().map(a => [a.key, a]));
    const GRIP = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><g fill="currentColor"><circle cx="7" cy="5" r="1.6"/><circle cx="13" cy="5" r="1.6"/><circle cx="7" cy="10" r="1.6"/><circle cx="13" cy="10" r="1.6"/><circle cx="7" cy="15" r="1.6"/><circle cx="13" cy="15" r="1.6"/></g></svg>`;
    const row = (k, where) => `<li class="st-app${hid.includes(k) ? " off" : ""}" data-key="${k}"><button type="button" class="st-grip" data-grip="${where}:${k}" aria-label="Reorder ${apps[k].name}. Drag, or use the up and down arrow keys.">${GRIP}</button><span class="st-ic">${apps[k].icon}</span><b>${apps[k].name}</b>
      <span class="st-appbtns">${k === "settings" ? "" : `<button type="button" class="st-sw ${hid.includes(k) ? "" : "on"}" role="switch" aria-checked="${!hid.includes(k)}" aria-label="Show ${apps[k].name}" data-hide="${k}"><i></i></button>`}${k === "settings" && where === "dock" ? "" : `<button class="st-sm wide" data-lay="move:${where}:${k}">${where === "dock" ? "To desktop" : "To dock"}</button>`}</span></li>`;
    const list = (where, title) => `<h3 class="st-h3">${title}</h3><ol class="st-apps" data-where="${where}">${L[where].map(k => row(k, where)).join("") || '<li class="st-note st-empty">Empty</li>'}</ol>`;
    return list("dock", "Dock") + list("desktop", "Desktop") + `<button class="st-btn" data-lay="reset">Back to the original order</button>`;
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
  /* redraw only the app lists, so the rest of Settings (scroll position, the Notion import) stays put */
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
  function dragStart(e, grip){
    const li = grip.closest(".st-app"), r = li.getBoundingClientRect(), key = li.dataset.key;
    e.preventDefault();
    const gap = document.createElement("li"); gap.className = "st-gap"; gap.style.height = r.height + "px";
    li.after(gap);
    Object.assign(li.style, { position:"fixed", left:r.left + "px", top:r.top + "px", width:r.width + "px", zIndex:50, pointerEvents:"none" });
    li.classList.add("lift");
    drag = { li, gap, key, dy:e.clientY - r.top, id:e.pointerId, scroller:root.closest(".viewport") || root, y:e.clientY, raf:0 };
    try { grip.setPointerCapture(e.pointerId); } catch {}
    tick();
  }
  function place(y){
    const d = drag; d.li.style.top = (y - d.dy) + "px";
    const lists = [...root.querySelectorAll(".st-apps")].filter(l => d.key !== "settings" || l.dataset.where === "dock");
    /* the list under the finger, else the nearest one */
    let target = lists[0], best = Infinity;
    for (const l of lists) { const r = l.getBoundingClientRect(); const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (dist < best) { best = dist; target = l; } }
    const rows = [...target.querySelectorAll(".st-app")].filter(x => x !== d.li);
    const before = rows.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
    target.querySelector(".st-empty")?.setAttribute("hidden", "");
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
  /* keyboard: arrow keys on a handle move the app one spot */
  async function keyMove(grip, dir){
    const [where, k] = grip.dataset.grip.split(":"), L = SimDeskLayout.layout(true), list = L[where], i = list.indexOf(k), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await GFB.saveSetting("app_layout", L); await layoutSaved(k);
  }

  /* Photos: show how much of your data is photos, and move them to Supabase Storage */
  let photoMsg = "";
  function photosHTML(){
    const p = GFB.photoStats(), on = GFB.cloudPhotos();
    return `<h2>Photos</h2>
      <p class="st-note" style="margin:0 0 10px">Your data is <b>${p.totalKB >= 1024 ? (p.totalKB / 1024).toFixed(1) + " MB" : p.totalKB + " KB"}</b>. ${p.count ? `<b>${p.count} photo${p.count === 1 ? "" : "s"}</b> (${p.photoKB >= 1024 ? (p.photoKB / 1024).toFixed(1) + " MB" : p.photoKB + " KB"}) ${p.count === 1 ? "is" : "are"} stored inside it, which slows down saving and syncing.` : "No photos are stored inside it."}</p>
      ${on ? `<p class="st-note" style="margin:0 0 10px">Cloud photos are on. New uploads go straight to the cloud.</p>${p.count ? `<button class="st-btn" data-st="movephotos">Move my photos to the cloud</button>` : ""}`
           : `<p class="st-note" style="margin:0 0 10px"><b>Cloud photos aren't on yet.</b> New photos are still saved inside your data. Finish the two setup steps (in Supabase and in <code>assets/cloud.js</code>), then reload.</p>`}
      ${photoMsg ? `<p class="st-note" style="margin:10px 0 0" role="status">${photoMsg}</p>` : ""}`;
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

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-st");
    document.addEventListener("change", e => { if (mine(e.target) && e.target.id === "st-file") useFile(e.target.files[0]); });
    document.addEventListener("dragover", e => { const d = mine(e.target) && e.target.closest("#st-drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
    document.addEventListener("dragleave", e => { const d = mine(e.target) && e.target.closest("#st-drop"); if (d) d.classList.remove("over"); });
    document.addEventListener("drop", e => { const d = mine(e.target) && e.target.closest("#st-drop"); if (d) { e.preventDefault(); useFile(e.dataTransfer.files[0]); } });
    document.addEventListener("click", async e => {
      const b = mine(e.target) && e.target.closest("[data-st=movephotos]"); if (!b) return;
      b.disabled = true;
      try { const r = await GFB.movePhotosToCloud((n, t) => { b.textContent = `Moving ${n} of ${t}...`; });
        photoMsg = `Done. ${r.moved} photo${r.moved === 1 ? "" : "s"} moved to the cloud${r.failed ? `, ${r.failed} couldn't upload (they stay on this device; try again later)` : ""}.`; }
      catch (err) { photoMsg = "Couldn't move the photos: " + err.message; }
      data = await GFB.getAll(); draw();
    });
    document.addEventListener("click", async e => {
      const gd = mine(e.target) && e.target.closest("[data-grid]");
      if (gd && !gd.disabled) return gridChange(gd.dataset.grid);
      const h = mine(e.target) && e.target.closest("[data-hide]");
      if (h) { const k = h.dataset.hide, cur = SimDeskLayout.hidden(), next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
        await GFB.saveSetting("hidden_apps", next.length ? next : null); SimDeskLayout.setHidden(next); data = await GFB.getAll(); return layoutSaved(); }
    });
    document.addEventListener("click", e => { const b = mine(e.target) && e.target.closest("[data-lay]"); if (b && !b.disabled) moveApp(b.dataset.lay); });
    document.addEventListener("pointerdown", e => { const g = mine(e.target) && e.target.closest("[data-grip]"); if (g && !drag && e.button <= 0) dragStart(e, g); });
    document.addEventListener("pointermove", e => { if (drag && e.pointerId === drag.id) { e.preventDefault(); drag.y = e.clientY; place(e.clientY); } }, { passive:false });
    document.addEventListener("pointerup", e => { if (drag && e.pointerId === drag.id) dragEnd(false); });
    document.addEventListener("pointercancel", e => { if (drag && e.pointerId === drag.id) dragEnd(true); });
    document.addEventListener("keydown", e => {
      const g = mine(e.target) && e.target.closest("[data-grip]"); if (!g) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); keyMove(g, e.key === "ArrowUp" ? -1 : 1); }
    });
    document.addEventListener("click", async e => {
      if (!mine(e.target) || !e.target.closest("[data-st=default]")) return;
      await GFB.saveSetting("wallpaper", null); data = await GFB.getAll(); st.msg = "Back to the default."; draw();
      window.dispatchEvent(new Event("gfb:wallpaper"));
    });
  }

  function render(el, d){ root = el; data = d; bind(); draw(); }
  return { render };
})();
