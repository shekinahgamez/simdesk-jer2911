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
      <section class="st-card" id="st-import" style="margin-top:16px"></section></div></div>`;
    st.msg = st.err = null;
    NotionImport.mount(root.querySelector("#st-import"), data);
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
      if (!mine(e.target) || !e.target.closest("[data-st=default]")) return;
      await GFB.saveSetting("wallpaper", null); data = await GFB.getAll(); st.msg = "Back to the default."; draw();
      window.dispatchEvent(new Event("gfb:wallpaper"));
    });
  }

  function render(el, d){ root = el; data = d; bind(); draw(); }
  return { render };
})();
