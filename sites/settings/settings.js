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
        <label class="st-drop" id="st-drop">${st.busy ? "Saving..." : `<b>Drop an image here</b><span>or tap to choose one from your photos</span>`}<input type="file" accept="image/*" id="st-file"></label>
        ${st.err ? `<p class="st-err">${st.err}</p>` : ""}${st.msg ? `<p class="st-ok">${st.msg}</p>` : ""}
        ${w ? `<button class="st-btn" data-st="default">Use the default background</button>` : ""}
        <p class="st-note">Big photos are shrunk to fit. Saved to this browser.</p>
      </section>
      <section class="st-card" style="margin-top:16px"><h2>Desktop and dock</h2><p class="st-note" style="margin:0 0 10px">Use the arrows to change the order. "To dock" and "To desktop" move an app between the two.</p>${layoutHTML()}</section>
      <section class="st-card" style="margin-top:16px">${photosHTML()}</section>
      <section class="st-card" id="st-import" style="margin-top:16px"></section></div></div>`;
    st.msg = st.err = null;
    NotionImport.mount(root.querySelector("#st-import"), data);
  }

  /* app order: saved as settings.app_layout = { dock:[keys], desktop:[keys] } and read by desktop/desktop.js */
  function layoutHTML(){
    if (!window.SimDeskLayout) return "";
    const L = SimDeskLayout.layout(), apps = Object.fromEntries(SimDeskLayout.apps().map(a => [a.key, a]));
    const row = (k, where, i, n) => `<li class="st-app"><span class="st-ic">${apps[k].icon}</span><b>${apps[k].name}</b>
      <span class="st-appbtns"><button class="st-sm" data-lay="up:${where}:${k}" ${i === 0 ? "disabled" : ""} aria-label="Move ${apps[k].name} up">↑</button><button class="st-sm" data-lay="down:${where}:${k}" ${i === n - 1 ? "disabled" : ""} aria-label="Move ${apps[k].name} down">↓</button>
      ${k === "settings" && where === "dock" ? "" : `<button class="st-sm wide" data-lay="move:${where}:${k}">${where === "dock" ? "To desktop" : "To dock"}</button>`}</span></li>`;
    const list = (where, title) => `<h3 class="st-h3">${title}</h3><ol class="st-apps">${L[where].map((k, i) => row(k, where, i, L[where].length)).join("") || '<li class="st-note">Empty</li>'}</ol>`;
    return list("dock", "Dock") + list("desktop", "Desktop") + `<button class="st-btn" data-lay="reset">Back to the original order</button>`;
  }
  async function moveApp(cmd){
    const [act, where, k] = cmd.split(":");
    if (act === "reset") { await GFB.saveSetting("app_layout", null); }
    else {
      const L = SimDeskLayout.layout(), list = L[where], i = list.indexOf(k);
      if (act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      if (act === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      if (act === "move") { list.splice(i, 1); L[where === "dock" ? "desktop" : "dock"].push(k); }
      await GFB.saveSetting("app_layout", L);
    }
    data = await GFB.getAll(); window.dispatchEvent(new Event("gfb:layout")); draw();
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
    document.addEventListener("click", e => { const b = mine(e.target) && e.target.closest("[data-lay]"); if (b && !b.disabled) moveApp(b.dataset.lay); });
    document.addEventListener("click", async e => {
      if (!mine(e.target) || !e.target.closest("[data-st=default]")) return;
      await GFB.saveSetting("wallpaper", null); data = await GFB.getAll(); st.msg = "Back to the default."; draw();
      window.dispatchEvent(new Event("gfb:wallpaper"));
    });
  }

  function render(el, d){ root = el; data = d; bind(); draw(); }
  return { render };
})();
