/* Photos: your library. Every photo you've saved, tagged with Sims and lots, grouped by game date, with where each one is used.
   Routes: #/photos  #/photos/untagged  #/photos/recent  #/photos/sim/<id>  #/photos/lot/<id>  #/photos/p/<photoId> */
const Photos = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const clean = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").trim();
  const P = () => GFB.photos;
  const ic = (d, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    photo:ic(`<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>`),
    up:ic(`<path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>`),
    house:ic(`<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>`),
    person:ic(`<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>`),
    link:ic(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
    chev:ic(`<path d="m9 6 6 6-6 6"/>`, 2), chevl:ic(`<path d="m15 6-6 6 6 6"/>`, 2),
    crop:ic(`<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>`),
    trash:ic(`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`),
    check:ic(`<path d="m5 12 5 5 9-10"/>`, 3), search:ic(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`),
    x:ic(`<path d="M6 6l12 12M18 6 6 18"/>`, 2), menu:ic(`<path d="M4 7h16M4 12h16M4 17h16"/>`),
    rot:ic(`<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>`)
  };
  const GRAD = ["#C0587E,#7A2E4A", "#4C7DD9,#2B3F86", "#E2925A,#9B4D21", "#43B58E,#16664C", "#9A7BE0,#5134A3", "#E06A6A,#962B2B"];
  const hue = id => GRAD[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % GRAD.length];
  const ini = n => clean(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const av = (s, cls = "") => `<span class="ph-av ${cls}" style="background:linear-gradient(140deg,${hue(s.id)})">${esc(ini(s.name))}</span>`;
  const SHAPE_CLS = { circle:"c", portrait:"p", wide:"w", square:"s" };

  let root = null, data = null, st = null, bound = false, parts = [];
  const fresh = () => ({ filter:"everything", q:"", simsOpen:false, lotsOpen:false, nav:false, tagpop:false, tagq:"", dateEdit:false, move:null, delArm:false, busy:null, err:null, sel:null, tagger:null, crop:null, sheet:false });

  /* ---------- data helpers ---------- */
  const sims = () => data.sims || [], lots = () => data.lots || [];
  const simBy = id => sims().find(s => s.id === id), lotBy = id => lots().find(l => l.id === id);
  const lotName = l => l ? (l.address || "Lot") : "";
  const cal = () => data.calendar;
  const useMap = () => { const m = new Map(); P().places().forEach(x => m.set(x.url, (m.get(x.url) || 0) + 1)); return m; };
  const usesCount = (p, m) => (m.get(p.url) || 0) + P().framesOf(p.id).reduce((a, f) => a + (m.get(f.url) || 0), 0);
  const isLoose = p => !(p.sims || []).length && !(p.lots || []).length;
  const recentCut = () => Date.now() - 7 * 864e5;
  const isRecent = p => new Date(p.created_at).getTime() >= recentCut();
  const gl = d => d && typeof d === "object" ? `${d.season} ${d.day}` : "";
  const glFull = d => d && typeof d === "object" ? `${d.season} ${d.day}, Year ${d.year}` : "";
  const sameDay = (a, b) => a && b && a.season === b.season && a.day === b.day && a.year === b.year;
  const recentSims = () => { try { return JSON.parse(localStorage.getItem("sd-photos-recent") || "[]"); } catch { return []; } };
  const noteRecent = ids => { try { const r = [...ids, ...recentSims().filter(x => !ids.includes(x))].slice(0, 12); localStorage.setItem("sd-photos-recent", JSON.stringify(r)); } catch {} };

  function route() {
    const [a, b] = parts;
    if (a === "untagged") return { v:"untagged", title:"Not tagged yet" };
    if (a === "recent") return { v:"recent", title:"Recently added" };
    if (a === "sim" && simBy(b)) return { v:"sim", id:b, title:clean(simBy(b).name) };
    if (a === "lot" && lotBy(b)) return { v:"lot", id:b, title:lotName(lotBy(b)) };
    return { v:"all", title:"All photos" };
  }
  function listFor(r) {
    let list = P().all().slice();
    if (r.v === "untagged") list = list.filter(isLoose);
    else if (r.v === "recent") list = list.filter(isRecent);
    else if (r.v === "sim") list = list.filter(p => (p.sims || []).includes(r.id));
    else if (r.v === "lot") list = list.filter(p => (p.lots || []).includes(r.id));
    const q = st.q.trim().toLowerCase();
    if (q) list = list.filter(p => (p.title || "").toLowerCase().includes(q) || (p.sims || []).some(id => clean((simBy(id) || {}).name).toLowerCase().includes(q)) || (p.lots || []).some(id => lotName(lotBy(id)).toLowerCase().includes(q)));
    return list;
  }
  function groups(list) {
    const by = new Map();
    list.forEach(p => { const k = p.game_date && typeof p.game_date === "object" ? JSON.stringify([p.game_date.year, p.game_date.season, p.game_date.day]) : "none"; if (!by.has(k)) by.set(k, { date:p.game_date && typeof p.game_date === "object" ? p.game_date : null, items:[] }); by.get(k).items.push(p); });
    return [...by.values()].sort((a, b) => !a.date ? 1 : !b.date ? -1 : UI.gameOrd(b.date, cal()) - UI.gameOrd(a.date, cal()));
  }

  /* ---------- sidebar ---------- */
  function sidebar(r) {
    const all = P().all(), count = {}, lotc = {};
    all.forEach(p => { (p.sims || []).forEach(id => count[id] = (count[id] || 0) + 1); (p.lots || []).forEach(id => lotc[id] = (lotc[id] || 0) + 1); });
    const withPhotos = sims().filter(s => count[s.id]).sort((a, b) => count[b.id] - count[a.id] || clean(a.name).localeCompare(clean(b.name)));
    const lotsWith = lots().filter(l => lotc[l.id]).sort((a, b) => lotc[b.id] - lotc[a.id]);
    const simsShown = st.simsOpen ? sims().slice().sort((a, b) => (count[b.id] || 0) - (count[a.id] || 0) || clean(a.name).localeCompare(clean(b.name))) : withPhotos.slice(0, 5);
    const lotsShown = st.lotsOpen ? lots().slice().sort((a, b) => (lotc[b.id] || 0) - (lotc[a.id] || 0) || lotName(a).localeCompare(lotName(b))) : lotsWith.slice(0, 3);
    const si = (href, inner, cur) => `<a class="si ${cur ? "cur" : ""}" href="${href}">${inner}</a>`;
    const loose = all.filter(isLoose).length, rec = all.filter(isRecent).length;
    return `<aside class="ph-side ${st.nav ? "open" : ""}"><div class="ph-brand"><div class="ph-logo">${I.photo}</div>Photos<button class="ph-ib navx" data-act="nav" aria-label="Close">${I.x}</button></div>
      ${si("#/photos", `${I.photo}<span>All photos</span><small>${all.length}</small>`, r.v === "all")}
      ${si("#/photos/untagged", `<i class="dot"></i><span>Not tagged yet</span><small>${loose}</small>`, r.v === "untagged")}
      ${si("#/photos/recent", `${I.up}<span>Recently added</span><small>${rec}</small>`, r.v === "recent")}
      <h4>Sims</h4>
      ${simsShown.map(s => si("#/photos/sim/" + s.id, `${av(s)}<span>${esc(clean(s.name))}</span><small>${count[s.id] || 0}</small>`, r.v === "sim" && r.id === s.id)).join("") || `<p class="ph-sidenote">Tag a Sim and they show up here.</p>`}
      <button class="si muted" data-act="simsmore">${I.person}<span>${st.simsOpen ? "Fewer Sims" : `All ${sims().length} Sims`}</span><span class="chv ${st.simsOpen ? "up" : ""}">${I.chev}</span></button>
      <h4>Lots</h4>
      ${lotsShown.map(l => si("#/photos/lot/" + l.id, `<span class="ic">${I.house}</span><span>${esc(lotName(l))}</span><small>${lotc[l.id] || 0}</small>`, r.v === "lot" && r.id === l.id)).join("") || `<p class="ph-sidenote">Tag a lot and it shows up here.</p>`}
      <button class="si muted" data-act="lotsmore">${I.house}<span>${st.lotsOpen ? "Fewer lots" : "All lots"}</span><span class="chv ${st.lotsOpen ? "up" : ""}">${I.chev}</span></button></aside>`;
  }

  /* ---------- the library ---------- */
  function moveCard() {
    if (!P().ready()) return "";
    const m = st.move;
    if (m && m.done) { const d = m.done; return `<div class="ph-move done"><h3>Found ${d.found} photo${d.found === 1 ? "" : "s"}, moved ${d.found - d.left}${d.failed ? `. ${d.failed} didn't move; Move again tries them once more.` : ". Every photo is in Photos."}</h3><p>Everything is where it was, too: your apps still show each photo, and nothing was deleted.</p><div class="acts">${d.left ? `<button class="ph-b pri" data-act="movego">Move the rest</button>` : ""}<button class="ph-b" data-act="movedone">Done</button></div></div>`; }
    const pd = P().pending();
    if (!pd.todo.length) return "";
    const dev = pd.todo.filter(x => x.url.startsWith("data:")).length;
    return `<div class="ph-move"><div><h3>Move your photos into Photos</h3><p>Found <b>${pd.found}</b> photo${pd.found === 1 ? "" : "s"} across SimDesk (Simsta, Registry, Lotline, Black Tea, Cliq, Huddl, wallpaper). <b>${pd.found - pd.todo.length}</b> already in Photos, <b>${pd.todo.length}</b> to move. Each keeps its tags from where it's used, and nothing is deleted.${dev ? ` ${dev} saved only on this device get uploaded first.` : ""}</p>
      ${m && m.run ? `<div class="ph-prog"><div class="t"><span>Moving ${m.run.n} of ${m.run.of}</span></div><div class="track"><i style="width:${Math.round(100 * m.run.n / Math.max(1, m.run.of))}%"></i></div></div>` : ""}${m && m.err ? `<p class="err">${esc(m.err)}</p>` : ""}</div>
      <button class="ph-b pri" data-act="movego" ${m && m.run ? "disabled" : ""}>${m && m.run ? "Moving..." : `Move ${pd.todo.length} photo${pd.todo.length === 1 ? "" : "s"}`}</button></div>`;
  }
  function thumb(p, um) {
    const n = usesCount(p, um);
    return `<button class="ph-th ${st.sel === p.id ? "sel" : ""}" data-p="${p.id}" aria-label="${esc(p.title || "Photo")}"><img loading="lazy" decoding="async" src="${esc(p.url)}" alt="">${isLoose(p) ? `<span class="untag">Not tagged</span>` : ""}${n ? `<span class="used">${I.link}${n}</span>` : ""}</button>`;
  }
  function library(r) {
    const um = useMap(); let list = listFor(r); const total = list.length;
    if (st.filter === "used") list = list.filter(p => usesCount(p, um) > 0); else if (st.filter === "unused") list = list.filter(p => usesCount(p, um) === 0);
    const g = groups(list), today = UI.gameToday(cal());
    const body = !P().ready() ? `<div class="ph-empty"><h3>Photos needs the cloud connection</h3><p>${esc(P().problem() || "Sign in to SimDesk's cloud, then open Photos again.")}</p></div>`
      : !P().all().length ? `<div class="ph-empty"><h3>No photos yet</h3><p>Upload some screenshots and tag who's in them. They'll be waiting in every photo slot.</p><button class="ph-b pri" data-act="upload">${I.up}Upload photos</button></div>`
      : !list.length ? `<div class="ph-empty"><h3>Nothing here</h3><p>${st.q ? "No photos match that search." : r.v === "untagged" ? "Every photo is tagged." : "No photos in this view yet."}</p></div>`
      : g.map(x => `<h5>${x.date ? `${esc(glFull(x.date))}${sameDay(x.date, today) ? " · today" : ""}` : "No game date"}<small>${x.items.length} photo${x.items.length === 1 ? "" : "s"}</small></h5><div class="ph-grid">${x.items.map(p => thumb(p, um)).join("")}</div>`).join("");
    return `<div class="ph-main"><div class="ph-top"><button class="ph-ib navb" data-act="nav" aria-label="Albums">${I.menu}</button><h2>${esc(r.title)}</h2><span class="count">${total}</span><span class="sp"></span>
        <label class="ph-search">${I.search}<input type="search" placeholder="Search Sims or lots" value="${esc(st.q)}" data-q aria-label="Search Sims or lots"></label>
        <button class="ph-b pri" data-act="upload">${I.up}<span>Upload</span></button></div>
      <div class="ph-filters">${[["everything", "Everything"], ["used", "Used somewhere"], ["unused", "Not used yet"]].map(([k, n]) => `<button class="chip ${st.filter === k ? "on" : ""}" data-filter="${k}">${n}</button>`).join("")}</div>
      <div class="ph-scroll">${moveCard()}${body}</div></div>`;
  }

  /* ---------- the detail panel ---------- */
  function tagChips(p) {
    return [...(p.sims || []).map(id => { const s = simBy(id); return s ? `<span class="chip">${av(s, "sm")}${esc(clean(s.name).split(" ")[0])}<button class="cx" data-untag="s:${id}" aria-label="Remove tag">${I.x}</button></span>` : ""; }),
      ...(p.lots || []).map(id => { const l = lotBy(id); return l ? `<span class="chip lot">${I.house}${esc(lotName(l))}<button class="cx" data-untag="l:${id}" aria-label="Remove tag">${I.x}</button></span>` : ""; })].join("");
  }
  function tagPop(p) {
    const q = st.tagq.trim().toLowerCase(), have = new Set([...(p.sims || []), ...(p.lots || [])]);
    const rs = (q ? sims().filter(s => clean(s.name).toLowerCase().includes(q)) : recentSims().map(simBy).filter(Boolean)).filter(s => !have.has(s.id)).slice(0, 6);
    const rl = (q ? lots().filter(l => lotName(l).toLowerCase().includes(q)) : []).filter(l => !have.has(l.id)).slice(0, 4);
    return `<div class="ph-pop"><input type="search" placeholder="Find a Sim or lot" value="${esc(st.tagq)}" data-tagq autocomplete="off" aria-label="Find a Sim or lot">
      <div class="res">${rs.map(s => `<button data-addtag="s:${s.id}">${av(s, "sm")}${esc(clean(s.name))}</button>`).join("")}${rl.map(l => `<button data-addtag="l:${l.id}"><span class="ic">${I.house}</span>${esc(lotName(l))}</button>`).join("")}${!rs.length && !rl.length ? `<p>${q ? "Nobody matches." : "Type a name to find a Sim or lot."}</p>` : ""}</div></div>`;
  }
  function detail(p) {
    if (!p) return `<aside class="ph-detail empty"><p>Tap a photo to see who's in it and where it's used.</p></aside>`;
    const uses = P().usesOf(p), today = UI.gameToday(cal());
    const dateBlock = st.dateEdit ? `<div class="ph-dedit">${UI.gameDate("pd", p.game_date && typeof p.game_date === "object" ? p.game_date : today, cal())}<div class="r"><button class="ph-b sm" data-act="datecancel">Cancel</button><button class="ph-b sm pri" data-act="datesave">Save date</button></div></div>` : "";
    const dims = p.width && p.height ? ` · ${p.width} × ${p.height}` : "";
    return `<aside class="ph-detail ${st.sheet ? "open" : ""}"><button class="ph-ib sheetx" data-act="closesheet" aria-label="Close">${I.x}</button>
      <div class="big"><img src="${esc(p.url)}" alt="${esc(p.title || "Photo")}"></div>
      <div><input class="ph-title" value="${esc(p.title || "")}" placeholder="Add a title" data-title aria-label="Title" maxlength="120">
        <div class="meta">${p.game_date && typeof p.game_date === "object" ? `Game date ${esc(gl(p.game_date))}` : "No game date"} <button class="lnk" data-act="datechange">Change</button>${dims}</div>${dateBlock}</div>
      <div class="sec"><h6>Tagged</h6><div class="tags">${tagChips(p)}<button class="chip add" data-act="tagpop">+ Tag</button></div>${st.tagpop ? tagPop(p) : ""}</div>
      <div class="sec"><h6>${uses.length ? `Used in ${uses.length} place${uses.length === 1 ? "" : "s"}` : "Not used anywhere yet"}</h6>
        ${uses.length ? `<ul class="uses">${uses.map(u => `<li><a ${u.href ? `href="${esc(u.href)}"` : ""}><span class="shape ${SHAPE_CLS[u.shape] || "s"}" style="background-image:url('${esc(u.url)}')"></span><span class="t">${esc(u.label)}<small>${esc(u.sub || "")}</small></span>${u.href ? I.chev : ""}</a></li>`).join("")}</ul>` : `<p class="ph-none">Pick it in any photo slot: a Simsta post, a Registry file photo, a Lotline listing.</p>`}</div>
      ${st.delArm ? `<div class="ph-warn"><b>Delete this photo?</b> ${uses.length ? `It's used in ${uses.length} place${uses.length === 1 ? "" : "s"}: ${esc([...new Set(uses.map(u => u.label + (u.sub ? ` (${u.sub})` : "")))].slice(0, 5).join(", "))}${uses.length > 5 ? " and more" : ""}. Those spots go back to empty.` : "Nothing uses it."} This can't be undone.</div>` : ""}
      ${st.err ? `<p class="ph-err">${esc(st.err)}</p>` : ""}
      <div class="dactions">${st.delArm ? `<button class="ph-b" data-act="delcancel">Keep it</button><button class="ph-b danger" data-act="delete">Delete it</button>` : `<button class="ph-b" data-act="crop">${I.crop}Crop and rotate</button><button class="ph-b dx" data-act="delete" aria-label="Delete photo">${I.trash}</button>`}</div></aside>`;
  }

  /* ---------- crop and rotate ---------- */
  async function openCrop(p) {
    let im; try { im = await P().loadImg(p.url); } catch (e) { st.err = e.message; return draw(); }
    const c = st.crop = { p, im, rot:0, rect:{ x:0, y:0, w:1, h:1 }, busy:false };
    const lay = document.createElement("div"); lay.className = "ps-layer dark ph-croplayer"; document.body.appendChild(lay); c.lay = lay;
    const paint = () => {
      const rot = c.rot % 180 !== 0, W = rot ? im.naturalHeight : im.naturalWidth, H = rot ? im.naturalWidth : im.naturalHeight;
      lay.innerHTML = `<div class="ps-repo"><div class="ps-rbar"><button class="ps-b ghost" data-c="cancel">Cancel</button><h2>Crop and rotate</h2><button class="ps-b ghost" data-c="reset">Reset</button></div>
        <div class="cr-stage"><div class="cr-box"><canvas></canvas><div class="cr-rect" style="left:${c.rect.x * 100}%;top:${c.rect.y * 100}%;width:${c.rect.w * 100}%;height:${c.rect.h * 100}%"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div></div>
        <div class="ps-rfoot cr"><div class="cr-tools"><button class="ps-b ps-dk" data-c="rotl"><span class="fl">${I.rot}</span><span>Rotate left</span></button><button class="ps-b ps-dk" data-c="rotr">${I.rot}<span>Rotate right</span></button></div><p class="cr-note">This changes the photo itself. Places that use it unframed get the new version.</p><div class="ps-right"><button class="ps-b light" data-c="save">${c.busy ? "Saving..." : "Save changes"}</button></div></div></div>`;
      const cv = lay.querySelector("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d");
      g.translate(W / 2, H / 2); g.rotate(c.rot * Math.PI / 180); g.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
      fit();
    };
    const fit = () => {
      const stage = lay.querySelector(".cr-stage"), box = lay.querySelector(".cr-box"), cv = lay.querySelector("canvas"); if (!stage || !box || !cv) return;
      const k = Math.min((stage.clientWidth - 40) / cv.width, (stage.clientHeight - 40) / cv.height); box.style.width = Math.max(40, cv.width * k) + "px"; box.style.height = Math.max(40, cv.height * k) + "px";
    };
    window.addEventListener("resize", fit);
    const maxW = () => lay.querySelector(".cr-box");
    paint();
    let drag = null;
    lay.addEventListener("pointerdown", e => {
      const h = e.target.closest("[data-h]"); const rect = e.target.closest(".cr-rect"); if (!rect) return;
      const box = lay.querySelector(".cr-box").getBoundingClientRect(); lay.setPointerCapture?.(e.pointerId);
      drag = { h:h ? h.dataset.h : "move", sx:e.clientX, sy:e.clientY, r:{ ...c.rect }, bw:box.width, bh:box.height }; e.preventDefault();
    });
    lay.addEventListener("pointermove", e => {
      if (!drag) return; const dx = (e.clientX - drag.sx) / drag.bw, dy = (e.clientY - drag.sy) / drag.bh, r = { ...drag.r }, min = .05;
      if (drag.h === "move") { r.x = Math.min(1 - r.w, Math.max(0, r.x + dx)); r.y = Math.min(1 - r.h, Math.max(0, r.y + dy)); }
      else {
        if (drag.h.includes("w")) { const nx = Math.min(r.x + r.w - min, Math.max(0, r.x + dx)); r.w += r.x - nx; r.x = nx; } else { r.w = Math.min(1 - r.x, Math.max(min, r.w + dx)); }
        if (drag.h.includes("n")) { const ny = Math.min(r.y + r.h - min, Math.max(0, r.y + dy)); r.h += r.y - ny; r.y = ny; } else { r.h = Math.min(1 - r.y, Math.max(min, r.h + dy)); }
      }
      c.rect = r; const el = lay.querySelector(".cr-rect"); if (el) { el.style.left = r.x * 100 + "%"; el.style.top = r.y * 100 + "%"; el.style.width = r.w * 100 + "%"; el.style.height = r.h * 100 + "%"; }
    });
    const end = () => { drag = null; }; lay.addEventListener("pointerup", end); lay.addEventListener("pointercancel", end);
    const done = () => { document.removeEventListener("keydown", key, true); window.removeEventListener("resize", fit); lay.remove(); st.crop = null; };
    const key = e => { if (e.key === "Escape" && st.crop) { e.stopImmediatePropagation(); done(); } };
    document.addEventListener("keydown", key, true);
    lay.addEventListener("click", async e => {
      const a = e.target.closest("[data-c]")?.dataset.c; if (!a || c.busy) return;
      if (a === "cancel") return done();
      if (a === "reset") { c.rot = 0; c.rect = { x:0, y:0, w:1, h:1 }; return paint(); }
      if (a === "rotr" || a === "rotl") { c.rot = (c.rot + (a === "rotr" ? 90 : 270)) % 360; c.rect = { x:0, y:0, w:1, h:1 }; return paint(); }
      if (a === "save") {
        c.busy = true; paint();
        try { await P().crop(p, { ...c.rect, rotate:c.rot }); data = await GFB.getAll(); done(); draw(); }
        catch (err) { c.busy = false; paint(); PhotoSlot.toast(err.message || "Couldn't save the crop."); }
      }
    });
  }

  /* ---------- bulk upload and tagging ---------- */
  function startTagger(files) {
    const list = [...files].filter(f => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name));
    if (!list.length) { st.err = "Pick some pictures to upload."; return draw(); }
    const today = UI.gameToday(cal());
    const t = st.tagger = { items:list.map((f, i) => ({ i, file:f, prev:URL.createObjectURL(f), status:"queued", photo:null, tags:{ sims:[], lots:[] }, tagged:false, skipped:false, err:null })), cur:0, apply:false, q:"", lotq:"", lotOpen:false, finished:false, last:{ sims:[], lots:[] } };
    let next = 0; const total = list.length;
    const worker = async () => {
      while (next < total && st.tagger === t) {
        const it = t.items[next++]; it.status = "up"; paintTagger();
        try {
          it.photo = await P().add(it.file, { sims:it.tagged ? it.tags.sims : [], lots:it.tagged ? it.tags.lots : [], game_date:today });
          it.status = "done";
          if (it.tagged && !(JSON.stringify(it.tags.sims) === JSON.stringify(it.photo.sims) && JSON.stringify(it.tags.lots) === JSON.stringify(it.photo.lots))) { try { it.photo = await P().update(it.photo.id, { sims:it.tags.sims, lots:it.tags.lots }); } catch {} }
        } catch (e) { it.status = "err"; it.err = e.message; }
        paintTagger();
      }
    };
    t.workers = Promise.all([worker(), worker()]);
    draw();
  }
  const upCount = t => t.items.filter(x => x.status === "done" || x.status === "err").length;
  const taggedCount = t => t.items.filter(x => x.tagged).length;
  function simChip(s, on, act) { return `<button class="chip ${on ? "on" : ""}" data-tg="${act}:${s.id}">${av(s, "sm")}${esc(clean(s.name).split(" ").slice(0, on ? 2 : 1).join(" "))}</button>`; }
  function taggerHTML() {
    const t = st.tagger, it = t.items[t.cur], q = t.q.trim().toLowerCase();
    const sel = new Set(it.tags.sims), selL = new Set(it.tags.lots);
    const recent = recentSims().map(simBy).filter(s => s && !sel.has(s.id)).slice(0, 8);
    const found = q ? sims().filter(s => clean(s.name).toLowerCase().includes(q) && !sel.has(s.id)).slice(0, 8) : [];
    const lq = t.lotq.trim().toLowerCase(), lotFound = t.lotOpen ? lots().filter(l => !selL.has(l.id) && (!lq || lotName(l).toLowerCase().includes(lq))).slice(0, 8) : [];
    const lastLots = [...new Set([...t.last.lots])].map(lotBy).filter(l => l && !selL.has(l.id)).slice(0, 4);
    const doneAll = upCount(t) === t.items.length;
    return `<div class="tg"><div class="tg-bar"><h2>Tag your photos</h2><div class="ph-prog"><div class="t"><span>${doneAll ? `Uploaded ${t.items.length}` : `Uploading ${upCount(t) + 1 > t.items.length ? t.items.length : upCount(t) + 1} of ${t.items.length}`}</span><span>Tagged ${taggedCount(t)}</span></div><div class="track"><i style="width:${Math.round(100 * upCount(t) / t.items.length)}%"></i></div></div><span class="sp"></span>
        <button class="ph-b ghost" data-tg="later">Tag the rest later</button><button class="ph-b pri" data-tg="done">${t.finished ? "Finishing..." : "Done"}</button></div>
      <div class="tg-body"><div class="tg-stage"><span class="num">${t.cur + 1} of ${t.items.length}</span><img src="${esc(it.prev)}" alt="Photo ${t.cur + 1}">
          <button class="arrow l" data-tg="prev" aria-label="Previous" ${t.cur ? "" : "disabled"}>${I.chevl}</button><button class="arrow r" data-tg="nxt" aria-label="Next photo" ${t.cur < t.items.length - 1 ? "" : "disabled"}>${I.chev}</button>
          ${it.status === "err" ? `<p class="tg-err">${esc(it.err)} <button class="lnk" data-tg="retry">Try again</button></p>` : ""}</div>
        <div class="tg-panel"><h3>Who's in this?</h3><p class="q">Tap everyone in the shot. Skip it if you're not sure.</p>
          <label class="ph-search wide">${I.search}<input type="search" placeholder="Find a Sim" value="${esc(t.q)}" data-tgq autocomplete="off" aria-label="Find a Sim"></label>
          ${found.length ? `<div class="sugg"><h6>Matches</h6><div class="tags">${found.map(s => simChip(s, false, "add")).join("")}</div></div>` : ""}
          <div class="sugg"><h6>Tagged</h6><div class="tags">${it.tags.sims.map(simBy).filter(Boolean).map(s => simChip(s, true, "rm")).join("") || `<span class="ph-none">Nobody yet</span>`}</div></div>
          ${recent.length ? `<div class="sugg"><h6>Recent</h6><div class="tags">${recent.map(s => simChip(s, false, "add")).join("")}</div></div>` : ""}
          <div class="sugg"><h6>Where</h6><div class="tags">${it.tags.lots.map(lotBy).filter(Boolean).map(l => `<button class="chip lot on" data-tg="lrm:${l.id}">${I.house}${esc(lotName(l))}</button>`).join("")}${lastLots.map(l => `<button class="chip lot" data-tg="ladd:${l.id}">${I.house}${esc(lotName(l))}</button>`).join("")}<button class="chip add" data-tg="lotopen">+ Lot</button></div>
            ${t.lotOpen ? `<div class="ph-pop inline"><input type="search" placeholder="Find a lot" value="${esc(t.lotq)}" data-tglq autocomplete="off" aria-label="Find a lot"><div class="res">${lotFound.map(l => `<button data-tg="ladd:${l.id}"><span class="ic">${I.house}</span>${esc(lotName(l))}</button>`).join("") || `<p>No lots match.</p>`}</div></div>` : ""}</div>
          <label class="applyall"><input type="checkbox" data-tg="apply" ${t.apply ? "checked" : ""}><span class="cb">${I.check}</span>Use these tags for the next photos too</label>
          <div class="pbtns"><button class="ph-b" data-tg="skip">Skip</button><button class="ph-b pri" data-tg="next">${t.cur === t.items.length - 1 ? "Finish" : "Next"}</button></div></div></div>
      <div class="tg-strip"><span class="lab">${t.items.length} photo${t.items.length === 1 ? "" : "s"}</span>${t.items.map(x => `<button class="s ${x.i === t.cur ? "cur" : ""} ${x.status === "queued" || x.status === "up" ? "up" : ""}" data-tg="go:${x.i}" aria-label="Photo ${x.i + 1}"><img src="${esc(x.prev)}" alt="">${x.tagged ? `<span class="ok">${I.check}</span>` : ""}${x.status === "queued" || x.status === "up" ? `<span class="spin">…</span>` : x.status === "err" ? `<span class="spin bad">!</span>` : ""}</button>`).join("")}</div></div>`;
  }
  let tgPaintTimer = null;
  function paintTagger() {
    if (!st || !st.tagger || !root) return;
    clearTimeout(tgPaintTimer); tgPaintTimer = setTimeout(() => {
      const el = root.querySelector(".tg"); if (!el) return;
      const active = document.activeElement, keep = active && active.matches && active.matches("[data-tgq],[data-tglq]") ? { sel:active.hasAttribute("data-tgq") ? "[data-tgq]" : "[data-tglq]", pos:active.selectionStart } : null;
      const strip = root.querySelector(".tg-strip"), sx = strip ? strip.scrollLeft : 0;
      el.outerHTML = taggerHTML();
      const s2 = root.querySelector(".tg-strip"); if (s2) s2.scrollLeft = sx;
      if (keep) { const n = root.querySelector(keep.sel); if (n) { n.focus(); try { n.setSelectionRange(keep.pos, keep.pos); } catch {} } }
    }, 30);
  }
  async function saveTags(it) {
    it.tagged = true; it.skipped = false;
    const t = st.tagger; t.last = { sims:[...it.tags.sims], lots:[...it.tags.lots] }; if (it.tags.sims.length) noteRecent(it.tags.sims);
    if (it.photo) { try { it.photo = await P().update(it.photo.id, { sims:it.tags.sims, lots:it.tags.lots }); } catch (e) { PhotoSlot.toast(e.message); } }
  }
  function goTo(i) {
    const t = st.tagger; i = Math.max(0, Math.min(t.items.length - 1, i)); t.cur = i; t.q = ""; t.lotq = ""; t.lotOpen = false;
    const it = t.items[i]; if (t.apply && !it.tagged && !it.skipped && !it.tags.sims.length && !it.tags.lots.length) it.tags = { sims:[...t.last.sims], lots:[...t.last.lots] };
    paintTagger();
  }
  async function finishTagger(go) {
    const t = st.tagger; if (!t || t.finished) return; t.finished = true; paintTagger();
    await t.workers; t.items.forEach(x => { try { URL.revokeObjectURL(x.prev); } catch {} });
    const failed = t.items.filter(x => x.status === "err").length;
    st.tagger = null; data = await GFB.getAll(); st.err = failed ? `${failed} photo${failed === 1 ? "" : "s"} didn't upload. Try those again.` : null;
    location.hash = go || "#/photos/recent"; draw();
  }
  async function taggerClick(e) {
    const el = e.target.closest("[data-tg]"); if (!el) return; const t = st.tagger, it = t.items[t.cur]; const [a, arg] = el.dataset.tg.split(/:(.*)/);
    if (a === "apply") { t.apply = el.checked; return; }
    if (a === "add") { if (!it.tags.sims.includes(arg)) it.tags.sims.push(arg); t.q = ""; return paintTagger(); }
    if (a === "rm") { it.tags.sims = it.tags.sims.filter(x => x !== arg); return paintTagger(); }
    if (a === "ladd") { if (!it.tags.lots.includes(arg)) it.tags.lots.push(arg); t.lotq = ""; t.lotOpen = false; return paintTagger(); }
    if (a === "lrm") { it.tags.lots = it.tags.lots.filter(x => x !== arg); return paintTagger(); }
    if (a === "lotopen") { t.lotOpen = !t.lotOpen; return paintTagger(); }
    if (a === "go") return goTo(Number(arg));
    if (a === "prev") return goTo(t.cur - 1);
    if (a === "nxt") return goTo(t.cur + 1);
    if (a === "retry") { it.status = "queued"; try { it.status = "up"; paintTagger(); it.photo = await P().add(it.file, { sims:it.tags.sims, lots:it.tags.lots, game_date:UI.gameToday(cal()) }); it.status = "done"; } catch (er) { it.status = "err"; it.err = er.message; } return paintTagger(); }
    if (a === "skip") { it.skipped = true; it.tagged = false; return t.cur < t.items.length - 1 ? goTo(t.cur + 1) : finishTagger(); }
    if (a === "next") { if (it.tags.sims.length || it.tags.lots.length) await saveTags(it); else it.skipped = true; return t.cur < t.items.length - 1 ? goTo(t.cur + 1) : finishTagger(); }
    if (a === "later") return finishTagger("#/photos/untagged");
    if (a === "done") { if (it.tags.sims.length || it.tags.lots.length) if (!it.tagged) await saveTags(it); return finishTagger(); }
  }

  /* ---------- drawing ---------- */
  function draw() {
    if (!root) return;
    if (st.tagger) { root.innerHTML = `<div class="site-photos">${taggerHTML()}</div>`; return; }
    const r = route(), sc = root.querySelector(".ph-scroll"), top = sc ? sc.scrollTop : 0, fs = document.activeElement && document.activeElement.matches?.("[data-q]");
    const p = st.sel ? P().byId(st.sel) : null; if (st.sel && !p) st.sel = null;
    root.innerHTML = `<div class="site-photos ${p ? "has-sel" : ""}">${sidebar(r)}${library(r)}${detail(p)}${st.nav || st.sheet ? `<div class="ph-scrim" data-act="scrim"></div>` : ""}<input type="file" accept="image/*" multiple id="ph-files" hidden></div>`;
    const sc2 = root.querySelector(".ph-scroll"); if (sc2) sc2.scrollTop = top;
    if (fs) { const q = root.querySelector("[data-q]"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  }
  async function reload() { await P().refresh(); data = await GFB.getAll(); }

  function bind() {
    if (bound) return; bound = true;
    document.addEventListener("click", async e => {
      if (!root || !root.querySelector(".site-photos") || !root.contains(e.target)) return;
      if (st.tagger) return taggerClick(e);
      const t = e.target;
      const pb = t.closest("[data-p]"); if (pb) { st.sel = st.sel === pb.dataset.p && !st.sheet ? null : pb.dataset.p; st.dateEdit = false; st.tagpop = false; st.delArm = false; st.err = null; st.sheet = true; return draw(); }
      const f = t.closest("[data-filter]"); if (f) { st.filter = f.dataset.filter; return draw(); }
      const ut = t.closest("[data-untag]"); if (ut && st.sel) { const [k, id] = ut.dataset.untag.split(":"), p = P().byId(st.sel); try { await P().update(p.id, { sims:(p.sims || []).filter(x => k !== "s" || x !== id), lots:(p.lots || []).filter(x => k !== "l" || x !== id) }); } catch (er) { st.err = er.message; } return draw(); }
      const at = t.closest("[data-addtag]"); if (at && st.sel) { const [k, id] = at.dataset.addtag.split(":"), p = P().byId(st.sel); try { await P().addTags(p.id, k === "s" ? [id] : [], k === "l" ? [id] : []); if (k === "s") noteRecent([id]); } catch (er) { st.err = er.message; } st.tagq = ""; return draw(); }
      const act = t.closest("[data-act]")?.dataset.act; if (!act) return;
      const p = st.sel ? P().byId(st.sel) : null;
      if (act === "nav") { st.nav = !st.nav; return draw(); }
      if (act === "scrim") { st.nav = false; st.sheet = false; return draw(); }
      if (act === "closesheet") { st.sheet = false; st.sel = null; return draw(); }
      if (act === "simsmore") { st.simsOpen = !st.simsOpen; return draw(); }
      if (act === "lotsmore") { st.lotsOpen = !st.lotsOpen; return draw(); }
      if (act === "upload") { root.querySelector("#ph-files").click(); return; }
      if (act === "tagpop") { st.tagpop = !st.tagpop; st.tagq = ""; draw(); const q = root.querySelector("[data-tagq]"); if (q) q.focus(); return; }
      if (act === "datechange") { st.dateEdit = true; return draw(); }
      if (act === "datecancel") { st.dateEdit = false; return draw(); }
      if (act === "datesave" && p) { const fd = new FormData(); root.querySelectorAll(".ph-dedit [name]").forEach(n => fd.set(n.name, n.value)); try { await P().update(p.id, { game_date:UI.readGameDate(fd, "pd", cal()) }); st.dateEdit = false; } catch (er) { st.err = er.message; } return draw(); }
      if (act === "crop" && p) return openCrop(p);
      if (act === "delete" && p) {
        if (!st.delArm) { st.delArm = true; return draw(); }
        const uses = P().usesOf(p), urls = [p.url, ...P().framesOf(p.id).map(x => x.url)];
        try { await P().remove(p.id); urls.forEach(u => P().swapUrl(u, null)); st.sel = null; st.delArm = false; st.sheet = false; data = await GFB.getAll(); } catch (er) { st.err = er.message; }
        return draw();
      }
      if (act === "delcancel") { st.delArm = false; return draw(); }
      if (act === "movedone") { st.move = null; return draw(); }
      if (act === "movego") {
        st.move = { run:{ n:0, of:P().pending().todo.length } }; draw();
        try { const res = await P().moveIn(UI.gameToday(cal()), (n, of) => { st.move.run = { n, of }; const i = root.querySelector(".ph-prog .track i"), s = root.querySelector(".ph-prog .t span"); if (i) i.style.width = Math.round(100 * n / Math.max(1, of)) + "%"; if (s) s.textContent = `Moving ${n} of ${of}`; });
          st.move = { done:res }; data = await GFB.getAll();
        } catch (er) { st.move = { err:er.message }; }
        return draw();
      }
    });
    document.addEventListener("input", e => {
      if (!root || !root.contains(e.target)) return;
      if (e.target.matches("[data-q]")) { st.q = e.target.value; const sc = root.querySelector(".ph-scroll"); const r = route(); const um = useMap(); let list = listFor(r); if (st.filter === "used") list = list.filter(p => usesCount(p, um) > 0); else if (st.filter === "unused") list = list.filter(p => !usesCount(p, um)); const h = root.querySelector(".ph-main"); clearTimeout(bind._t); bind._t = setTimeout(draw, 180); return; }
      if (e.target.matches("[data-tagq]")) { st.tagq = e.target.value; const pop = root.querySelector(".sec .ph-pop"); if (pop) { const p = P().byId(st.sel); pop.outerHTML = tagPop(p); const q = root.querySelector("[data-tagq]"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } return; }
      if (st.tagger && e.target.matches("[data-tgq]")) { st.tagger.q = e.target.value; paintTagger(); }
      if (st.tagger && e.target.matches("[data-tglq]")) { st.tagger.lotq = e.target.value; paintTagger(); }
    });
    document.addEventListener("change", async e => {
      if (!root || !root.contains(e.target)) return;
      if (e.target.id === "ph-files") { const files = e.target.files; if (files && files.length) startTagger(files); e.target.value = ""; return; }
      if (e.target.matches("[data-title]") && st.sel) { try { await P().update(st.sel, { title:e.target.value.trim() || null }); } catch (er) { st.err = er.message; draw(); } }
    });
    document.addEventListener("dragover", e => { if (root && root.querySelector(".site-photos") && !st.tagger && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
    document.addEventListener("drop", e => { if (!root || !root.querySelector(".site-photos") || st.tagger || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); startTagger(e.dataTransfer.files); });
  }

  async function render(el, d, p) {
    root = el; data = d; parts = p || [];
    if (!st) st = fresh();
    bind();
    if (parts[0] === "p" && parts[1]) { st.sel = parts[1]; st.sheet = true; }
    if (!P().isLoaded() && P().ready()) { await P().refresh(); data = await GFB.getAll(); }
    st.nav = false; draw();
  }
  const label = () => route().title;
  return { render, label };
})();
