/* PhotoSlot: the one little menu every photo slot uses (Choose from Photos / Upload new / Reposition / Remove),
   the photo picker, and the framing screen. Needs the cloud connection (Photos lives there); without it, slots keep
   their old file picker.
   PhotoSlot.open({ title, shape: "circle"|"portrait"|"wide"|"square", aspect, outW, sims:[ids], lots:[ids], current, removable,
                    removeLabel, previews:[{ label, size }] })  ->  { url } | { removed:true } | null
   Any <input type="file" data-pslot='{...}'> is picked up automatically: the menu opens instead of the file dialog and the
   input's "change" fires with a stand-in file that GFB.uploadImage hands straight back as the saved link. */
const PhotoSlot = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const clean = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").trim();
  const I = {
    photo:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>`,
    up:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`,
    frame:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
    x:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>`,
    move:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/></svg>`,
    pinch:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l6 6M20 20l-6-6M4 4v5M4 4h5M20 20v-5M20 20h-5"/></svg>`,
    search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`
  };
  const SHAPES = { circle:{ aspect:1, outW:640 }, square:{ aspect:1, outW:640 }, portrait:{ aspect:3 / 4, outW:900 }, wide:{ aspect:16 / 9, outW:1800 } };
  const SHAPE_NOUN = { circle:"circle", square:"square", portrait:"portrait frame", wide:"banner" };

  let layer = null;
  const close = () => { if (layer) { layer.remove(); layer = null; document.documentElement.classList.remove("ps-lock"); } };
  function mount(html, cls) {
    close(); layer = document.createElement("div"); layer.className = "ps-layer " + (cls || ""); layer.innerHTML = html; document.body.appendChild(layer); document.documentElement.classList.add("ps-lock"); return layer;
  }
  const ready = () => typeof GFB !== "undefined" && GFB.photos && GFB.photos.ready() && GFB.photos.isLoaded();
  const toast = msg => { const t = document.createElement("div"); t.className = "ps-toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3600); };

  async function context() { const d = await GFB.getAll(); return { d, cal:d.calendar, sims:d.sims, lots:d.lots || [] }; }
  const todayDate = cal => UI.gameToday(cal);
  const simLabel = (sims, id) => { const s = sims.find(x => x.id === id); return s ? clean(s.name) : ""; };
  const first = n => String(n || "").split(" ")[0];

  /* ---------- the little menu ---------- */
  function menu(o, ctx) {
    return new Promise(res => {
      const focus = (o.sims || [])[0] ? first(simLabel(ctx.sims, o.sims[0])) : (o.lots || [])[0] ? (ctx.lots.find(l => l.id === o.lots[0]) || {}).address : "";
      const tagged = (o.sims || []).length || (o.lots || []).length;
      const el = mount(`<div class="ps-dim" data-ps="cancel"></div>
        <div class="ps-menu" role="menu"><div class="ps-mt">${esc(o.title || "Photo")}</div>
          <button class="ps-mi hl" role="menuitem" data-ps="choose">${I.photo}<div>Choose from Photos<small>${focus ? esc(focus) + "'s photos first" : "Everything you've saved"}</small></div></button>
          <button class="ps-mi" role="menuitem" data-ps="upload">${I.up}<div>Upload new<small>${tagged ? "Saved to Photos, tagged" + (focus ? " " + esc(focus) : "") : "Saved to Photos"}</small></div></button>
          ${o.current || o.removable ? `<hr>` : ""}
          ${o.current ? `<button class="ps-mi sub" role="menuitem" data-ps="repo">${I.frame}Reposition</button>` : ""}
          ${o.removable ? `<button class="ps-mi sub danger" role="menuitem" data-ps="remove">${I.x}${esc(o.removeLabel || "Remove photo")}</button>` : ""}
          <button class="ps-mi sub quiet" data-ps="cancel">Cancel</button></div>
        <input type="file" accept="image/*" class="ps-file" hidden>`);
      const file = el.querySelector(".ps-file");
      file.addEventListener("change", () => { const f = file.files[0]; if (f) res({ act:"upload", file:f }); });
      file.addEventListener("cancel", () => {});
      el.addEventListener("click", e => {
        const a = e.target.closest("[data-ps]")?.dataset.ps; if (!a) return;
        if (a === "upload") { file.click(); return; }       /* the dialog has to open inside this tap */
        close(); res(a === "cancel" ? null : { act:a });
      });
      const key = e => { if (e.key === "Escape" && layer === el) { document.removeEventListener("keydown", key, true); e.stopImmediatePropagation(); close(); res(null); } };
      document.addEventListener("keydown", key, true);
    });
  }

  /* ---------- the picker ---------- */
  function picker(o, ctx) {
    const P = GFB.photos;
    return new Promise(res => {
      const all = P.all().slice(), sset = new Set(o.sims || []), lset = new Set(o.lots || []);
      const mine = all.filter(p => (p.sims || []).some(x => sset.has(x)) || (p.lots || []).some(x => lset.has(x)));
      const loose = all.filter(p => !(p.sims || []).length && !(p.lots || []).length);
      const focusName = (o.sims || [])[0] ? first(simLabel(ctx.sims, o.sims[0])) : (o.lots || [])[0] ? ((ctx.lots.find(l => l.id === o.lots[0]) || {}).address || "This lot") : "";
      const tabs = [...(focusName ? [["mine", `${focusName} · ${mine.length}`]] : []), ["all", `All photos · ${all.length}`], ["loose", `Not tagged · ${loose.length}`]];
      let tab = tabs[0][0], sel = null;
      const draw = () => {
        const list = tab === "mine" ? mine : tab === "loose" ? loose : all;
        el.querySelector(".ps-seg").innerHTML = tabs.map(([k, n]) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${esc(n)}</button>`).join("");
        el.querySelector(".ps-pgrid").innerHTML = list.length ? list.map(p => `<button class="ps-th ${sel === p.id ? "sel" : ""}" data-p="${p.id}" aria-label="Photo" aria-pressed="${sel === p.id}"><img loading="lazy" decoding="async" src="${esc(p.url)}" alt="">${sel === p.id ? `<span class="ps-tick">${I.check}</span>` : ""}</button>`).join("")
          : `<p class="ps-empty">${tab === "mine" ? `No photos tagged ${esc(focusName)} yet. Pick All photos, or upload a new one.` : tab === "loose" ? "Every photo is tagged." : "No photos yet. Upload one to start."}</p>`;
        el.querySelector('[data-ps="use"]').disabled = !sel;
      };
      const el = mount(`<div class="ps-dim" data-ps="cancel"></div>
        <div class="ps-picker" role="dialog" aria-label="Choose a photo"><div class="ps-ph"><h3>Choose a photo</h3><button class="ps-ib" data-ps="cancel" aria-label="Close">${I.x}</button></div>
          <div class="ps-seg"></div><div class="ps-hint">Tap one, then frame it for the ${SHAPE_NOUN[o.shape] || "slot"}.</div>
          <div class="ps-pgrid"></div>
          <div class="ps-pf"><span class="ps-muted">Can't find it? Upload new from here too.</span><button class="ps-b" data-ps="upload">Upload new</button><button class="ps-b pri" data-ps="use" disabled>Use photo</button></div>
          <input type="file" accept="image/*" class="ps-file" hidden></div>`, "wide");
      const file = el.querySelector(".ps-file");
      file.addEventListener("change", () => { const f = file.files[0]; if (f) res({ file:f }); });
      el.addEventListener("click", e => {
        const t = e.target.closest("[data-t]"); if (t) { tab = t.dataset.t; return draw(); }
        const p = e.target.closest("[data-p]"); if (p) { sel = sel === p.dataset.p ? null : p.dataset.p; return draw(); }
        const a = e.target.closest("[data-ps]")?.dataset.ps; if (!a) return;
        if (a === "upload") return file.click();
        if (a === "use") { if (sel) res({ photo:P.byId(sel) }); return; }
        close(); res(null);
      });
      const key = e => { if (e.key === "Escape" && layer === el) { document.removeEventListener("keydown", key, true); e.stopImmediatePropagation(); close(); res(null); } };
      document.addEventListener("keydown", key, true);
      draw();
    });
  }

  /* ---------- framing ---------- */
  /* Places an image inside a box so the slot's window (framing) fills the box. */
  function placeImg(img, im, aspect, boxW, f, P) {
    const r = P.cropRect(im.naturalWidth, im.naturalHeight, aspect, f), s = boxW / r.w;
    img.style.width = im.naturalWidth * s + "px"; img.style.height = im.naturalHeight * s + "px"; img.style.left = -r.x * s + "px"; img.style.top = -r.y * s + "px";
    return r;
  }
  function frameScreen(o, photo, start) {
    const P = GFB.photos, shape = o.shape || "circle", aspect = o.aspect || SHAPES[shape].aspect, outW = o.outW || SHAPES[shape].outW;
    return new Promise(async res => {
      let im; try { im = await P.loadImg(photo.url); } catch (e) { toast("Couldn't open that photo."); return res(null); }
      let f = { cx:.5, cy:.5, zoom:1, ...(start || {}) };
      const circle = shape === "circle";
      const previews = o.previews || [{ label:"As used", size:circle ? 44 : 60 }];
      const el = mount(`<div class="ps-repo"><div class="ps-rbar"><button class="ps-b ghost" data-ps="cancel">Cancel</button><h2>${esc(o.title || "Frame the photo")}</h2><button class="ps-b ghost" data-ps="reset">Reset</button></div>
        <div class="ps-rstage"><img class="ps-rimg" alt="" src="${esc(photo.url)}" draggable="false"><div class="ps-rmask ${circle ? "c" : ""}"></div>
          <div class="ps-gest"><span>${I.move}Drag to move</span><span>${I.pinch}Pinch to zoom</span></div></div>
        <div class="ps-rfoot"><label class="ps-zoom">${I.search}<span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"></label>
          <div class="ps-previews">${previews.map((v, i) => `<div class="ps-pv"><div class="ps-pvbox ${circle ? "c" : ""}" data-i="${i}" style="width:${v.size}px;height:${v.size / aspect}px"><img alt="" src="${esc(photo.url)}"></div>${esc(v.label)}</div>`).join("")}</div>
          <div class="ps-right"><button class="ps-b light" data-ps="save">Save framing</button></div></div></div>`, "dark");
      const stage = el.querySelector(".ps-rstage"), img = el.querySelector(".ps-rimg"), mask = el.querySelector(".ps-rmask"), rng = el.querySelector("input[type=range]");
      let Mw = 0, Mh = 0, busy = false;
      const layout = () => {
        const sw = stage.clientWidth, sh = stage.clientHeight, maxW = Math.min(sw - 40, 520), maxH = sh - 70;
        Mw = Math.min(maxW, maxH * aspect); Mh = Mw / aspect; mask.style.width = Mw + "px"; mask.style.height = Mh + "px"; draw();
      };
      const draw = () => {
        const r = placeImg(img, im, aspect, Mw, f, P); const sx = stage.clientWidth / 2 - Mw / 2, sy = (stage.clientHeight - 30) / 2 - Mh / 2;
        /* placeImg set left/top relative to the window; move it into stage space */
        img.style.left = parseFloat(img.style.left) + sx + "px"; img.style.top = parseFloat(img.style.top) + sy + "px";
        mask.style.left = sx + "px"; mask.style.top = sy + "px";
        f.cx = (r.x + r.w / 2) / im.naturalWidth; f.cy = (r.y + r.h / 2) / im.naturalHeight; rng.value = f.zoom;
        el.querySelectorAll(".ps-pvbox").forEach(b => { const pi = b.querySelector("img"); placeImg(pi, im, aspect, b.clientWidth, f, P); });
      };
      layout(); const onResize = () => { if (layer === el) layout(); }; window.addEventListener("resize", onResize);
      /* drag and pinch */
      const pts = new Map(); let last = null, startDist = 0, startZoom = 1;
      const move = (dx, dy) => { const r = P.cropRect(im.naturalWidth, im.naturalHeight, aspect, f), s = Mw / r.w; f.cx = Math.min(1, Math.max(0, f.cx - dx / s / im.naturalWidth)); f.cy = Math.min(1, Math.max(0, f.cy - dy / s / im.naturalHeight)); };
      stage.addEventListener("pointerdown", e => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x:e.clientX, y:e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startZoom = f.zoom; } e.preventDefault(); });
      stage.addEventListener("pointermove", e => {
        if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
        if (pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (startDist) f.zoom = Math.min(4, Math.max(1, startZoom * d / startDist)); }
        else move(dx, dy);
        draw();
      });
      const up = e => { pts.delete(e.pointerId); startDist = 0; };
      stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
      stage.addEventListener("wheel", e => { e.preventDefault(); f.zoom = Math.min(4, Math.max(1, f.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06))); draw(); }, { passive:false });
      rng.addEventListener("input", () => { f.zoom = Number(rng.value); draw(); });
      const done = v => { window.removeEventListener("resize", onResize); document.removeEventListener("keydown", key, true); close(); res(v); };
      const key = e => { if (e.key === "Escape" && layer === el) { e.stopImmediatePropagation(); done(null); } };
      document.addEventListener("keydown", key, true);
      el.addEventListener("click", async e => {
        const a = e.target.closest("[data-ps]")?.dataset.ps; if (!a || busy) return;
        if (a === "cancel") return done(null);
        if (a === "reset") { f = { cx:.5, cy:.5, zoom:1 }; return draw(); }
        if (a === "save") {
          busy = true; const b = e.target.closest("button"); b.textContent = "Saving..."; b.disabled = true;
          try { const fr = await P.frame(photo, { shape, aspect, framing:{ cx:f.cx, cy:f.cy, zoom:f.zoom }, outW }); done({ url:fr.url, photo, frame:fr }); }
          catch (err) { busy = false; b.disabled = false; b.textContent = "Save framing"; toast(err.message); }
        }
      });
    });
  }

  /* ---------- the whole flow ---------- */
  async function open(o) {
    o = { shape:"circle", sims:[], lots:[], ...o };
    if (!ready()) throw new Error("Photos needs the cloud connection first.");
    const P = GFB.photos, ctx = await context();
    let sel = await menu(o, ctx); if (!sel) return null;
    if (sel.act === "remove") return { removed:true };
    let photo = null, start = null;
    try {
      if (sel.act === "repo") {
        const hit = await P.ensure(o.current, { sims:o.sims, lots:o.lots, date:todayDate(ctx.cal) });
        photo = hit.photo; start = hit.frame && hit.frame.framing ? hit.frame.framing : null;
      } else {
        let pick = sel.act === "choose" ? await picker(o, ctx) : { file:sel.file };
        if (!pick) return null;
        if (pick.file) {
          toast("Saving to Photos...");
          photo = await P.add(pick.file, { sims:o.sims, lots:o.lots, game_date:todayDate(ctx.cal) });
        } else { photo = pick.photo; if ((o.sims || []).length || (o.lots || []).length) await P.addTags(photo.id, o.sims, o.lots); }
      }
    } catch (e) { toast(e.message || "That didn't work."); return null; }
    const out = await frameScreen(o, photo, start);
    return out;
  }

  /* ---------- plain file inputs become slots ---------- */
  document.addEventListener("click", async e => {
    const inp = e.target; if (!(inp instanceof HTMLInputElement) || inp.type !== "file" || !inp.dataset.pslot || inp.dataset.pslotBusy) return;
    if (!ready()) return;                    /* not signed in: the old file picker still works */
    e.preventDefault(); e.stopPropagation();
    let o; try { o = JSON.parse(inp.dataset.pslot); } catch { return; }
    if (typeof o.current === "string" && o.current === "@value") o.current = inp.dataset.pslotCurrent || "";
    inp.dataset.pslotBusy = "1";
    try {
      const r = await open(o); if (!r) return;
      if (r.removed) { inp.dispatchEvent(new CustomEvent("pslot-remove", { bubbles:true })); return; }
      const fake = new File([], "photos-pick"); fake.__photoUrl = r.url;
      inp.dataset.pslotUrl = r.url;
      Object.defineProperty(inp, "files", { configurable:true, get:() => [fake, ...[]] });
      inp.dispatchEvent(new Event("change", { bubbles:true }));
      const lab = inp.closest("label") || inp.parentElement; let tag = lab && lab.parentElement && lab.parentElement.querySelector(".ps-chosen");
      if (inp.dataset.pslotMark && lab) { if (!tag) { tag = document.createElement("span"); tag.className = "ps-chosen"; lab.insertAdjacentElement("afterend", tag); } tag.textContent = "✓ Photo chosen. Save to keep it."; }
    } catch (err) { toast(err.message || "That didn't work."); }
    finally { delete inp.dataset.pslotBusy; setTimeout(() => { try { delete inp.files; } catch {} }, 0); }
  }, true);

  /* data-pslot attribute for a plain file input: PhotoSlot.attr({ title, shape, sims, ... }) */
  const attr = (o, extra = "") => ` data-pslot='${esc(JSON.stringify(o)).replace(/'/g, "&#39;")}'${extra ? " " + extra : ""}`;
  return { open, ready, close, toast, attr, icons:I, SHAPES };
})();
