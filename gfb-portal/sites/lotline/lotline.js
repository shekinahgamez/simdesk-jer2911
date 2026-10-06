/* Lotline: listings, lot pages, and editing. Reads and saves through GFB (assets/data.js). */
const Lotline = (() => {
  const st = { q:"", world:"All", type:"All", build:"All", market:"All", tab:"all", page:null, editing:null, err:null, uploading:false };
  let data = null, root = null, curId = null;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const money = n => n == null || n === "" ? null : "$" + Number(n).toLocaleString("en-US");
  const lotById = id => data.lots.find(l => l.id === id);
  const unitsOf = id => data.lots.filter(l => l.parent_id === id).sort((a,b) => a.address.localeCompare(b.address, undefined, {numeric:true}));
  const residents = hh => hh ? data.sims.filter(s => s.household === hh) : [];
  const occupied = l => !!l.household;
  const slug = v => String(v || "").replace(/[^a-z]+/gi, "-");
  const buildBadge = l => l.build_status ? `<span class="ll-dot b-${slug(l.build_status)}"></span>${esc(l.build_status)}` : "Build status not set";
  const marketTag = l => l.market_status ? `<span class="ll-mkt m-${slug(l.market_status)}">${esc(l.market_status)}</span>` : "";
  const stripNick = n => n.replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const ini = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0,2).join("");

  const PIN = `<svg viewBox="40 25 320 435" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M125 35H300L350 95V265L205 452L50 265V95ZM140 125H285V215H215V305L140 215Z"/></svg>`;
  const RESIDENTIAL = ["Apartment","Residential","Residential Rental"];
  const TABS = [["all","Browse"],["buy","Buy"],["rent","Rent"],["commercial","Commercial"],["owners","Owners"]];
  const GLYPH = {
    building:`<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="11" y="6" width="26" height="36"/><path d="M17 13h4M27 13h4M17 20h4M27 20h4M17 27h4M27 27h4M21 42v-7h6v7"/></svg>`,
    house:`<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M7 22 24 8l17 14v18H7z"/><path d="M20 40V29h8v11"/></svg>`,
    venue:`<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M6 18h36v22H6z"/><path d="M4 18 10 8h28l6 10M16 40V28h16v12"/></svg>`
  };
  const glyphFor = l => (l.lot_type === "Apartment" || unitsOf(l.id).length) ? GLYPH.building : /Residential/.test(l.lot_type || "") ? GLYPH.house : GLYPH.venue;

  const searchText = l => [l.address, l.district, l.world, l.lot_type, l.household, l.owner, l.market_status, l.notes, l.creator, ...residents(l.household).map(s => s.name)].join(" ").toLowerCase();

  function visible(){
    const q = st.q.toLowerCase();
    return data.lots.filter(l => !l.parent_id).filter(l => {
      const family = [l, ...unitsOf(l.id)];
      if (st.world !== "All" && (l.world || "") !== st.world) return false;
      if (st.type !== "All" && l.lot_type !== st.type) return false;
      if (st.build !== "All" && l.build_status !== st.build) return false;
      if (st.market !== "All" && !family.some(x => x.market_status === st.market)) return false;
      if (st.tab === "buy" && !family.some(x => x.market_status === "For sale")) return false;
      if (st.tab === "rent" && !family.some(x => x.market_status === "For lease")) return false;
      if (st.tab === "commercial" && RESIDENTIAL.includes(l.lot_type)) return false;
      return !q || family.some(x => searchText(x).includes(q));
    });
  }

  /* ---------- listing grid ---------- */
  function cardHTML(l){
    const units = unitsOf(l.id);
    const district = l.district || (units[0] || {}).district;
    const price = money(l.price);
    const specs = [l.lot_type, l.lot_size, l.bed_bath, units.length ? `${units.length} units` : ""].filter(Boolean);
    let own;
    if (units.length){ const occ = units.filter(occupied).length, avail = units.filter(u => u.market_status === "For lease" || u.market_status === "For sale").length; own = `<b>${occ} of ${units.length}</b> occupied${avail ? `, <b>${avail}</b> available` : ""}`; }
    else own = l.household ? `Household: <b>${esc(l.household)}</b>` : "No household";
    if (l.owner) own = `Owner: <b>${esc(l.owner)}</b><br>` + own;
    return `<button class="ll-card" data-lot="${l.id}">
      <div class="ll-ph">${l.photo ? `<img loading="lazy" decoding="async" src="${esc(l.photo)}" alt="">` : glyphFor(l)}<span class="ll-badge">${buildBadge(l)}</span>${l.market_status ? `<span class="ll-badge right">${esc(l.market_status)}</span>` : ""}</div>
      <div class="ll-body">
        <div class="ll-price ${price ? "" : "addr"}">${price || esc(l.address)}</div>
        <div class="ll-specs">${specs.map(s => `<span>${esc(s)}</span>`).join("")}</div>
        <div class="ll-addr">${price ? esc(l.address) + ", " : ""}${[district, l.world].filter(Boolean).map(esc).join(", ")}</div>
        <div class="ll-own">${own}</div>
      </div></button>`;
  }

  /* worlds come from the lots themselves (plus a lot_options.world list if one gets added); type a new one on any lot */
  const worlds = () => [...new Set([...(data.lot_options.world || []), ...data.lots.map(l => l.world)].filter(Boolean))].sort();
  function listHTML(){
    const o = data.lot_options, v = visible();
    const sel = (id, label, any, opts, val) => `<label class="ll-fsel"><span>${label}</span><select id="${id}"><option value="All">${any}</option>${opts.map(t => `<option ${t===val?"selected":""}>${esc(t)}</option>`).join("")}</select></label>`;
    const pill = (key, val) => `<button class="ll-pill" data-f="${key}" data-v="${esc(val)}" aria-pressed="${st[key]===val}">${esc(val === "All" ? (key === "world" ? "All worlds" : "Any build status") : val)}</button>`;
    const heads = { all:"Lots across Simerica", buy:"For sale", rent:"For rent", commercial:"Commercial properties" };
    const hero = st.tab === "all" ? `<section class="ll-home"><div class="ll-herotext"><h1>Every property.<br>Every detail.</h1><p>Homes, apartments, and commercial properties across Simerica, all in one place.</p>
        <div class="ll-search big"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/></svg><input id="ll-q" type="search" placeholder="Search an address, district, owner, or Sim" value="${esc(st.q)}" aria-label="Search lots"></div></div>
        <div class="ll-heroimg" role="img" aria-label="City skyline"></div></section>` : "";
    return `${hero}
      <div class="ll-filterwrap"><div class="ll-filters" role="group" aria-label="Filters">
        ${sel("ll-world","World","All worlds",worlds(),st.world)}
        ${sel("ll-type","Lot type","Any type",o.lot_type,st.type)}
        ${sel("ll-market","Market","Any market status",o.market_status,st.market)}
        ${sel("ll-build","Build status","Any build status",o.build_status,st.build)}
        ${[st.world,st.type,st.market,st.build].some(x => x !== "All") ? `<button class="ll-clear" data-act="clear">Clear filters</button>` : ""}
      </div></div>
      <main class="ll-main">
        <div class="ll-count"><h2>${heads[st.tab]}</h2><span>${v.length} result${v.length===1?"":"s"}</span></div>
        ${st.tab === "all" ? (() => { const all = data.lots, homes = all.filter(l => !unitsOf(l.id).length), occ = homes.filter(occupied).length, open = all.filter(l => l.market_status === "For lease" || l.market_status === "For sale").length, built = all.filter(l => l.build_status === "Built").length;
          return `<div class="ll-stats"><div><b>${all.length}</b><span>Lots and units</span></div><div><b>${occ}</b><span>Occupied</span></div><div><b>${open}</b><span>On the market</span></div><div><b>${built}</b><span>Built</span></div></div>`; })() : ""}
        ${v.length ? `<div class="ll-grid">${v.map(cardHTML).join("")}</div>` : `<p class="ll-empty">No lots match. Try clearing a filter.</p>`}
        ${data.lots_pending?.length ? `<section class="ll-pending"><h2>Coming with the import</h2><p>These lots haven't been brought into Lotline yet.</p><div>${data.lots_pending.map(n => `<span>${esc(n)}</span>`).join("")}</div></section>` : ""}
      </main>`;
  }

  /* ---------- owners ---------- */
  function ownersHTML(){
    const owners = {};
    data.lots.forEach(l => { if (l.owner) (owners[l.owner] = owners[l.owner] || []).push(l); });
    const names = Object.keys(owners).sort();
    return `<main class="ll-main"><div class="ll-count"><h2>Owners</h2><span>${names.length} owner${names.length===1?"":"s"}</span></div>
      ${names.length ? `<div class="ll-owners">${names.map(n => `<section class="ll-ownercard"><div class="ll-ownerhead"><i>${esc(ini(n))}</i><div><b>${esc(n)}</b><span>${owners[n].length} propert${owners[n].length===1?"y":"ies"}</span></div></div>
        ${owners[n].map(l => `<button class="ll-ownerlot" data-lot="${l.id}"><span>${esc(l.address)}</span><span class="ll-mkt">${esc(l.market_status || l.build_status || "")}</span></button>`).join("")}</section>`).join("")}</div>`
        : `<p class="ll-empty">No owners on record yet. Open any lot and set its owner, or assign property from a Sim's Registry record.</p>`}
      ${(() => { const homes = data.lots.filter(l => l.household).sort((a, b) => a.household.localeCompare(b.household));
        return `<div class="ll-count" style="margin-top:30px"><h2>Who lives where</h2><span>${homes.length} household${homes.length === 1 ? "" : "s"} placed</span></div>
        ${homes.length ? `<div class="ll-owners">${homes.map(l => { const res = data.sims.filter(x => x.household === l.household); return `<section class="ll-ownercard"><div class="ll-ownerhead"><i>${esc(ini(l.household))}</i><div><b>${esc(l.household)}</b><span>${res.length} resident${res.length === 1 ? "" : "s"}</span></div></div>
          <button class="ll-ownerlot" data-lot="${l.id}"><span>${esc(l.address)}</span><span class="ll-mkt">${esc(l.market_status || l.build_status || "")}</span></button>${res.length ? `<p class="ll-res">${res.map(x => `<a href="#/registry/${x.id}">${esc(x.name.replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " "))}</a>`).join(", ")}</p>` : ""}</section>`; }).join("")}</div>` : `<p class="ll-empty">No households placed in a lot yet. Set a household on any lot, or pick a home address from a Sim's Registry record.</p>`}`; })()}</main>`;
  }

  /* ---------- lot page ---------- */
  function detailHTML(l){
    const units = unitsOf(l.id), parent = l.parent_id ? lotById(l.parent_id) : null;
    const district = l.district || (units[0] || {}).district || (parent || {}).district;
    const facts = [["Owner", l.owner], ["Market status", l.market_status], ["Lot type", l.lot_type], ["Lot size", l.lot_size], ["Price", money(l.price)], ["Bed / bath", l.bed_bath], ["Gallery name", l.gallery_name], ["Creator", l.creator]]
      .map(([k,v]) => `<div><dt>${k}</dt><dd>${v ? esc(v) : '<span style="color:var(--muted);font-weight:500">Not set</span>'}</dd></div>`).join("");
    const res = residents(l.household);
    const side = units.length
      ? `${l.owner ? `<h3>OWNER</h3><p class="hh">${esc(l.owner)}</p>` : ""}<h3>BUILDING</h3><p class="hh">${units.filter(occupied).length} of ${units.length} occupied</p>${units.filter(occupied).map(u => `<div class="ll-res"><i>${esc(u.address.split("#")[1] || "")}</i>${esc(u.household)}</div>`).join("")}<button class="ll-btn ghost" data-act="addunit">Add a unit</button>`
      : `${l.owner ? `<h3>OWNER</h3><p class="hh">${esc(l.owner)}</p>` : ""}<h3>HOUSEHOLD</h3>${l.household ? `<p class="hh">${esc(l.household)}</p>${res.map(s => `<div class="ll-res"><i>${esc(ini(s.name))}</i>${esc(s.name)}</div>`).join("") || `<p class="muted">No residents on file for this household yet.</p>`}` : `<p class="muted">Nobody lives or works here yet.</p>`}`;
    return `<div class="ll-detail">
      <button class="ll-crumb" data-act="back">${parent ? `Back to ${esc(parent.address)}` : "Back to listings"}</button>
      <div class="ll-hero">${l.photo ? `<img loading="lazy" decoding="async" src="${esc(l.photo)}" alt="${esc(l.address)}">` : glyphFor(l)}</div>
      <div class="ll-top">
        <div>
          <h1>${esc(l.address)}</h1>
          <p class="ll-where">${[district, l.world].filter(Boolean).map(esc).join(", ")}</p>
          <span class="ll-status">${buildBadge(l)}</span> ${marketTag(l)}
          <dl class="ll-facts">${facts}</dl>
          ${l.notes ? `<section class="ll-sec"><h2>About this lot</h2><p class="ll-notes">${esc(l.notes)}</p></section>` : ""}
          ${units.length ? `<section class="ll-sec"><h2>Units</h2><div class="ll-tablewrap"><table class="ll-units"><thead><tr><th>Unit</th><th>Build</th><th>Market</th><th>Household</th><th>Notes</th></tr></thead><tbody>
            ${units.map(u => `<tr data-lot="${u.id}" tabindex="0"><td><b>${esc(u.address)}</b></td><td><span class="ll-status">${buildBadge(u)}</span></td><td>${marketTag(u) || '<span class="vac">Not set</span>'}</td><td class="${u.household?"":"vac"}">${esc(u.household || "Vacant")}</td><td>${esc(u.notes)}</td></tr>`).join("")}
          </tbody></table></div></section>` : ""}
        </div>
        <aside class="ll-side">${side}<button class="ll-btn" data-act="edit">Edit this lot</button></aside>
      </div>
    </div>`;
  }

  /* ---------- edit ---------- */
  const opt = (list, val, blank) => `${blank ? `<option value="">${blank}</option>` : ""}${list.map(o => `<option ${o===val?"selected":""}>${esc(o)}</option>`).join("")}`;
  function formHTML(l){
    const o = data.lot_options;
    const households = [...new Set([...data.sims.map(s => s.household), ...data.lots.map(x => x.household)].filter(Boolean))].sort();
    const buildings = data.lots.filter(x => !x.parent_id && x.id !== l.id);
    const owners = [...new Set([...data.sims.map(s => stripNick(s.name)), ...households, ...data.lots.map(x => x.owner)].filter(Boolean))].sort();
    return `<div class="ll-modal" data-act="closebg"><form class="ll-form" id="ll-form" role="dialog" aria-label="Edit lot">
      <h2>${l.id ? "Edit lot" : "New lot"}</h2>
      <div class="ll-up">${l.photo ? `<img loading="lazy" decoding="async" src="${esc(l.photo)}" alt="Lot photo"><div class="ll-upacts"><label class="ll-btn ghost">Replace photo<input type="file" accept="image/*" id="ll-file"></label><button type="button" class="ll-del" data-act="rmphoto">Remove photo</button></div>`
        : `<label class="ll-drop">Add a screenshot of this lot<input type="file" accept="image/*" id="ll-file"></label>`}
        ${st.uploading ? `<p class="ll-note">Adding photo…</p>` : ""}${st.err ? `<p class="ll-err">${esc(st.err)}</p>` : ""}</div>
      <label>Address or lot name<input name="address" required value="${esc(l.address)}"></label>
      <div class="row">
        <label>Build status<select name="build_status">${opt(o.build_status, l.build_status)}</select></label>
        <label>Market status<select name="market_status">${opt(o.market_status, l.market_status, "Not set")}</select></label>
        <label>Owner<input name="owner" list="ll-owners" value="${esc(l.owner)}" placeholder="A Sim, household, or company"><datalist id="ll-owners">${owners.map(h => `<option value="${esc(h)}">`).join("")}</datalist></label>
        <label>World<input name="world" list="ll-worlds" value="${esc(l.world || "Lennox Park")}" required><datalist id="ll-worlds">${worlds().map(w => `<option value="${esc(w)}">`).join("")}</datalist></label>
        <label>District<select name="district">${opt(o.district, l.district, "None")}</select></label>
        <label>Lot type<select name="lot_type">${opt(o.lot_type, l.lot_type, "None")}</select></label>
        <label>Lot size<select name="lot_size">${opt(o.lot_size, l.lot_size, "None")}</select></label>
        <label>Price<input name="price" inputmode="numeric" value="${esc(l.price)}"></label>
        <label>Bed / bath<input name="bed_bath" value="${esc(l.bed_bath)}" placeholder="2 / 1"></label>
        <label>Household<input name="household" list="ll-hh" value="${esc(l.household)}"><datalist id="ll-hh">${households.map(h => `<option value="${esc(h)}">`).join("")}</datalist></label>
        <label>Part of building<select name="parent_id"><option value="">Standalone lot</option>${buildings.map(b => `<option value="${b.id}" ${b.id===l.parent_id?"selected":""}>${esc(b.address)}</option>`).join("")}</select></label>
        <label>Creator<input name="creator" value="${esc(l.creator)}"></label>
        <label>Gallery name<input name="gallery_name" value="${esc(l.gallery_name)}"></label>
      </div>
      <label>Notes<textarea name="notes">${esc(l.notes)}</textarea></label>
      <div class="ll-acts">${l.id ? `<button type="button" class="ll-del" data-act="delete">Delete lot</button>` : ""}<span class="spacer"></span>
        <button type="button" class="ll-btn ghost" data-act="cancel">Cancel</button><button type="submit" class="ll-btn">Save</button></div>
    </form></div>`;
  }

  function readForm(form){
    const f = new FormData(form), v = k => (f.get(k) || "").trim();
    const price = v("price").replace(/[^0-9.]/g, "");
    return { ...st.editing, address:v("address"), build_status:v("build_status"), market_status:v("market_status") || null, owner:v("owner") || null, district:v("district") || null, lot_type:v("lot_type") || null, lot_size:v("lot_size") || null,
      price: price === "" ? null : Number(price), bed_bath:v("bed_bath") || null, household:v("household") || null, parent_id:v("parent_id") || null,
      creator:v("creator") || null, gallery_name:v("gallery_name") || null, notes:v("notes"), world: v("world") || st.editing.world || "Lennox Park" };
  }

  /* ---------- render ---------- */
  function draw(){
    const l = curId ? lotById(curId) : null;
    root.innerHTML = `<div class="site-ll">
      <header class="ll-head">
        <button class="ll-logo" data-act="home" aria-label="Lotline home">${PIN}<span>lotline</span></button>
        <nav class="ll-tabs" aria-label="Sections">${TABS.map(([k,v]) => `<button data-tab="${k}" aria-current="${!l && (st.page === "owners" ? k === "owners" : st.tab === k)}">${v}</button>`).join("")}</nav>
        <span class="spacer"></span>
        <button class="ll-btn" data-act="new">Add a lot</button>
      </header>
      ${l ? detailHTML(l) : st.page === "owners" ? ownersHTML() : listHTML()}
      ${st.editing ? formHTML(st.editing) : ""}
    </div>`;
  }

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const inSite = t => root && root.contains(t) && root.querySelector(".site-ll");
    document.addEventListener("click", async e => {
      if (!inSite(e.target)) return;
      const t = e.target;
      const tb = t.closest("[data-tab]");
      if (tb){ const k = tb.dataset.tab; if (k === "owners") location.hash = "#/lotline/owners"; else { st.tab = k; if (curId || st.page) location.hash = "#/lotline"; else draw(); } return; }
      const f = t.closest("[data-f]");
      if (f){ st[f.dataset.f] = f.dataset.v; draw(); return; }
      const row = t.closest("[data-lot]");
      if (row && !st.editing){ location.hash = "#/lotline/" + row.dataset.lot; return; }
      const act = t.closest("[data-act]")?.dataset.act;
      if (act === "clear"){ st.world = st.type = st.market = st.build = "All"; draw(); }
      if (act === "home"){ st.tab = "all"; if (curId || st.page) location.hash = "#/lotline"; else draw(); }
      if (act === "back"){ const l = lotById(curId); location.hash = "#/lotline" + (l?.parent_id ? "/" + l.parent_id : ""); }
      if (act === "new"){ st.editing = { build_status:"Proposed", market_status:"Off market", world:"Lennox Park", notes:"" }; st.err = null; draw(); }
      if (act === "addunit"){ const b = lotById(curId); st.editing = { build_status:b.build_status === "Proposed" ? "Proposed" : "Built", market_status:"For lease", owner:b.owner || null, world:b.world, parent_id:b.id, district:(unitsOf(b.id)[0] || {}).district || b.district || null, lot_type:"Apartment", address:b.address.replace(/ St$/, "") + " #", notes:"" }; st.err = null; draw(); }
      if (act === "edit"){ st.editing = JSON.parse(JSON.stringify(lotById(curId))); st.err = null; draw(); }
      if (act === "cancel" || (act === "closebg" && t.classList.contains("ll-modal"))){ st.editing = null; st.err = null; draw(); }
      if (act === "rmphoto"){ st.editing = { ...readForm(root.querySelector("#ll-form")), photo:null }; draw(); }
      if (act === "delete"){
        const kids = unitsOf(st.editing.id).length;
        if (UI.confirmTap(t.closest("[data-act=delete]"), kids ? `Tap again: ${kids} units become standalone` : "Tap again to delete")){
          for (const u of unitsOf(st.editing.id)) await GFB.saveLot({ ...u, parent_id:null });
          const parent = st.editing.parent_id;
          await GFB.deleteLot(st.editing.id); st.editing = null;
          location.hash = "#/lotline" + (parent ? "/" + parent : ""); draw();
        }
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches?.(".site-ll tr[data-lot]")) location.hash = "#/lotline/" + e.target.dataset.lot;
      if (e.key === "Escape" && st.editing && root?.querySelector(".ll-modal")){ e.stopImmediatePropagation(); st.editing = null; draw(); }
    }, true);
    document.addEventListener("input", e => {
      if (e.target.id === "ll-q"){ st.q = e.target.value; const pos = e.target.selectionStart; draw(); const q = root.querySelector("#ll-q"); q.focus(); q.setSelectionRange(pos, pos); }
    });
    document.addEventListener("change", async e => {
      if (e.target.id === "ll-type"){ st.type = e.target.value; draw(); }
      if (e.target.id === "ll-market"){ st.market = e.target.value; draw(); }
      if (e.target.id === "ll-world"){ st.world = e.target.value; draw(); }
      if (e.target.id === "ll-build"){ st.build = e.target.value; draw(); }
      if (e.target.id === "ll-file" && e.target.files[0]){
        st.editing = readForm(root.querySelector("#ll-form")); st.uploading = true; st.err = null; draw();
        try { st.editing.photo = (await GFB.uploadImage(e.target.files[0], 1800)).url; } catch (err) { st.err = err.message; }
        st.uploading = false; draw();
      }
    });
    document.addEventListener("submit", async e => {
      if (e.target.id !== "ll-form") return;
      e.preventDefault();
      const lot = readForm(e.target);
      try { const saved = await GFB.saveLot(lot); st.editing = null; st.err = null; if (!curId || curId !== saved.id) location.hash = "#/lotline/" + saved.id; }
      catch (err) { st.editing = lot; st.err = err.message; }
      draw();
    });
  }

  function render(el, d, id){
    root = el; data = d;
    if (id !== curId) st.editing = null;
    st.page = id === "owners" ? "owners" : null;
    curId = id && d.lots.some(l => l.id === id) ? id : null;
    bind(); draw();
  }
  return { render, label: id => { if (id === "owners") return "/owners"; const l = data?.lots.find(x => x.id === id); return l ? "/homedetails/" + l.address.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "/"; } };
})();
