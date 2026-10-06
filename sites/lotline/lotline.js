/* Lotline: listings, lot pages, and editing. Reads and saves through GFB (assets/data.js). */
const Lotline = (() => {
  const st = { q:"", world:"All", build:"All", markets:null, types:null, pmin:null, pmax:null, beds:0, baths:0, exact:false, open:null, draft:null,
    tab:"all", page:null, editing:null, err:null, uploading:false };
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

  /* beds and baths are two fields now; older lots with a combined "2 / 1" value are read from that until they're saved again */
  const num = v => v === "" || v == null || isNaN(+v) ? null : +v;
  function bb(l){
    if (l.beds != null || l.baths != null) return { beds:num(l.beds), baths:num(l.baths) };
    const m = String(l.bed_bath || "").match(/\d+(?:\.\d+)?/g) || [];
    return { beds:num(m[0]), baths:num(m[1]) };
  }
  const bbText = l => { const { beds, baths } = bb(l); return [beds != null ? `${beds} bd` : "", baths != null ? `${baths} ba` : ""].filter(Boolean); };
  const fmtK = n => n >= 1e6 ? "$" + (+(n / 1e6).toFixed(2)) + "M" : "$" + Math.round(n / 1e3) + "K";
  const parseMoney = v => { const m = String(v || "").toLowerCase().replace(/[$,\s]/g, "").match(/^(\d*\.?\d+)([km]?)$/); if (!m) return null; return Math.round(+m[1] * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1)); };
  function niceCeil(x){ if (!x) return 1000000; const mag = 10 ** Math.floor(Math.log10(x)); for (const k of [1, 2, 2.5, 5, 10]) if (k * mag >= x) return k * mag; return 10 * mag; }
  const priceMax = () => niceCeil(Math.max(0, ...data.lots.map(l => +l.price || 0)));
  const BEDS = [0, 1, 2, 3, 4, 5], BATHS = [0, 1, 1.5, 2, 3, 4];

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
      if (st.types && !st.types.includes(l.lot_type)) return false;
      if (st.build !== "All" && l.build_status !== st.build) return false;
      if (st.markets && !family.some(x => st.markets.includes(x.market_status))) return false;
      if (st.pmin != null || st.pmax != null){
        if (!family.some(x => x.price != null && x.price !== "" && (st.pmin == null || +x.price >= st.pmin) && (st.pmax == null || +x.price <= st.pmax))) return false;
      }
      if (st.beds || st.baths){
        if (!family.some(x => { const b = bb(x); return (!st.beds || (b.beds != null && (st.exact ? b.beds === st.beds : b.beds >= st.beds))) && (!st.baths || (b.baths != null && b.baths >= st.baths)); })) return false;
      }
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
    const specs = [...bbText(l), l.lot_type, l.lot_size, units.length ? `${units.length} units` : ""].filter(Boolean);
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
    const heads = { all:"Lots across Simerica", buy:"For sale", rent:"For rent", commercial:"Commercial properties" };
    const hero = st.tab === "all" ? `<section class="ll-home"><div class="ll-herotext"><h1>Every property.<br>Every detail.</h1><p>Homes, apartments, and commercial properties across Simerica, all in one place.</p>
        <div class="ll-search big"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/></svg><input id="ll-q" type="search" placeholder="Search an address, district, owner, or Sim" value="${esc(st.q)}" aria-label="Search lots"></div></div>
        <div class="ll-heroimg" role="img" aria-label="City skyline"></div></section>` : "";
    return `${hero}
      ${filtersHTML()}
      <main class="ll-main">
        <div class="ll-count"><h2>${heads[st.tab]}</h2><span>${v.length} result${v.length===1?"":"s"}</span></div>
        ${st.tab === "all" ? (() => { const all = data.lots, homes = all.filter(l => !unitsOf(l.id).length), occ = homes.filter(occupied).length, open = all.filter(l => l.market_status === "For lease" || l.market_status === "For sale").length, built = all.filter(l => l.build_status === "Built").length;
          return `<div class="ll-stats"><div><b>${all.length}</b><span>Lots and units</span></div><div><b>${occ}</b><span>Occupied</span></div><div><b>${open}</b><span>On the market</span></div><div><b>${built}</b><span>Built</span></div></div>`; })() : ""}
        ${v.length ? `<div class="ll-grid">${v.map(cardHTML).join("")}</div>` : `<p class="ll-empty">No lots match. Try clearing a filter.</p>`}
        ${data.lots_pending?.length ? `<section class="ll-pending"><h2>Coming with the import</h2><p>These lots haven't been brought into Lotline yet.</p><div>${data.lots_pending.map(n => `<span>${esc(n)}</span>`).join("")}</div></section>` : ""}
      </main>`;
  }


  /* ---------- Zillow-style filter row ---------- */
  function filtersHTML(){
    const mktLbl = !st.markets ? "Market status" : st.markets.length === 1 ? st.markets[0] : `${st.markets.length} statuses`;
    const priceLbl = st.pmin != null && st.pmax != null ? `${fmtK(st.pmin)} to ${fmtK(st.pmax)}` : st.pmin != null ? `${fmtK(st.pmin)}+` : st.pmax != null ? `Up to ${fmtK(st.pmax)}` : "Price";
    const bbLbl = st.beds || st.baths ? [st.beds ? `${st.beds}${st.exact ? "" : "+"} bd` : "", st.baths ? `${st.baths}+ ba` : ""].filter(Boolean).join(", ") : "Beds & baths";
    const typeLbl = !st.types ? "Property type" : st.types.length === 1 ? st.types[0] : `${st.types.length} types`;
    const btn = (key, label, on) => `<div class="ll-fb"><button class="ll-fbtn ${on ? "on" : ""}" data-pop="${key}" aria-expanded="${st.open === key}">${esc(label)}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>${st.open === key ? popHTML(key) : ""}</div>`;
    const any = st.world !== "All" || st.build !== "All" || st.markets || st.types || st.pmin != null || st.pmax != null || st.beds || st.baths;
    return `<div class="ll-filterwrap"><div class="ll-filters ll-zf" role="group" aria-label="Filters">
      <div class="ll-fbs">
        ${btn("market", mktLbl, !!st.markets)}
        ${btn("world", st.world === "All" ? "All worlds" : st.world, st.world !== "All")}
        ${btn("price", priceLbl, st.pmin != null || st.pmax != null)}
        ${btn("bb", bbLbl, st.beds || st.baths)}
        ${btn("type", typeLbl, !!st.types)}
        ${btn("build", st.build === "All" ? "Build status" : st.build, st.build !== "All")}
        ${any ? `<button class="ll-clear" data-act="clear">Clear filters</button>` : ""}
      </div></div></div>`;
  }

  function popHTML(key){
    const o = data.lot_options, d = st.draft || {};
    const head = t => `<div class="ll-pophead">${t}</div>`;
    const apply = `<button class="ll-btn ll-apply" data-act="apply">Apply</button>`;
    if (key === "world" || key === "build"){
      const list = key === "world" ? worlds() : (o.build_status || []);
      return `<div class="ll-pop small" role="dialog" aria-label="${key === "world" ? "World" : "Build status"}">${head(key === "world" ? "World" : "Build status")}<div class="ll-popbody ll-picks">
        ${["All", ...list].map(v => `<button class="ll-pick" data-pick="${key}" data-v="${esc(v)}" aria-pressed="${st[key] === v}"><span class="ll-radio"></span>${esc(v === "All" ? (key === "world" ? "All worlds" : "Any build status") : v)}</button>`).join("")}</div></div>`;
    }
    if (key === "price"){
      const max = priceMax(), step = Math.max(1, Math.round(max / 200)), lo = d.pmin ?? 0, hi = d.pmax ?? max;
      return `<div class="ll-pop" role="dialog" aria-label="Price range">${head("Price range")}<div class="ll-popbody">
        <div class="ll-hist" id="ll-hist">${histBars(max, lo, hi)}</div>
        <div class="ll-range" style="--lo:${lo / max * 100}%;--hi:${hi / max * 100}%"><span class="ll-track"></span>
          <input type="range" id="ll-rlo" min="0" max="${max}" step="${step}" value="${lo}" aria-label="Minimum price">
          <input type="range" id="ll-rhi" min="0" max="${max}" step="${step}" value="${hi}" aria-label="Maximum price"></div>
        <div class="ll-rangeends"><span>$0</span><span>${fmtK(max)}+</span></div>
        <div class="ll-minmax"><label>Min<input id="ll-pmin" inputmode="numeric" placeholder="No min" value="${d.pmin != null ? "$" + d.pmin.toLocaleString("en-US") : ""}"></label><span>to</span>
          <label>Max<input id="ll-pmax" inputmode="numeric" placeholder="No max" value="${d.pmax != null ? "$" + d.pmax.toLocaleString("en-US") : ""}"></label></div>
        ${apply}</div></div>`;
    }
    if (key === "bb"){
      const row = (k, list) => `<div class="ll-btnrow" data-group="${k}">${list.map(n => `<button data-pb="${k}" data-pv="${n}" aria-pressed="${(d[k] || 0) === n}">${n ? n + (k === "beds" && d.exact ? "" : "+") : "Any"}</button>`).join("")}</div>`;
      return `<div class="ll-pop" role="dialog" aria-label="Beds and baths">${head("Number of bedrooms")}<div class="ll-popbody"><span class="ll-poplbl">Bedrooms</span>${row("beds", BEDS)}
        <label class="ll-check"><input type="checkbox" id="ll-exact" ${d.exact ? "checked" : ""}>Use exact match</label></div>
        ${head("Number of bathrooms")}<div class="ll-popbody"><span class="ll-poplbl">Bathrooms</span>${row("baths", BATHS)}${apply}</div></div>`;
    }
    if (key === "type" || key === "market"){
      const all = (key === "type" ? o.lot_type : o.market_status) || [], on = (key === "type" ? d.types : d.markets) || all;
      return `<div class="ll-pop small" role="dialog" aria-label="${key === "type" ? "Property type" : "Market status"}">${head(`<button class="ll-selall" data-act="selall">${on.length === all.length ? "Deselect all" : "Select all"}</button>`)}<div class="ll-popbody">
        ${all.map(t => `<label class="ll-check"><input type="checkbox" name="llcheck" value="${esc(t)}" ${on.includes(t) ? "checked" : ""}>${esc(t)}</label>`).join("")}${apply}</div></div>`;
    }
    return "";
  }

  function histBars(max, lo, hi){
    const N = 36, bins = Array(N).fill(0);
    data.lots.forEach(l => { const p = +l.price; if (p > 0) bins[Math.min(N - 1, Math.floor(p / max * N))]++; });
    const top = Math.max(1, ...bins);
    return bins.map((c, k) => { const mid = (k + .5) / N * max; return `<i class="${mid >= lo && mid <= hi ? "in" : ""}" style="height:${c ? Math.max(8, c / top * 100) : 2}%"></i>`; }).join("");
  }

  /* live updates inside the price popover, without redrawing the page mid-drag */
  function syncPrice(from){
    const pop = root.querySelector(".ll-pop"); if (!pop) return;
    const max = priceMax(), rlo = pop.querySelector("#ll-rlo"), rhi = pop.querySelector("#ll-rhi"), imin = pop.querySelector("#ll-pmin"), imax = pop.querySelector("#ll-pmax");
    let lo, hi;
    if (from === "range"){
      lo = +rlo.value; hi = +rhi.value; if (lo > hi) [lo, hi] = [hi, lo];
      st.draft.pmin = lo > 0 ? lo : null; st.draft.pmax = hi < max ? hi : null;
      imin.value = st.draft.pmin != null ? "$" + st.draft.pmin.toLocaleString("en-US") : "";
      imax.value = st.draft.pmax != null ? "$" + st.draft.pmax.toLocaleString("en-US") : "";
    } else {
      st.draft.pmin = parseMoney(imin.value); st.draft.pmax = parseMoney(imax.value);
      lo = st.draft.pmin ?? 0; hi = Math.min(max, st.draft.pmax ?? max); rlo.value = lo; rhi.value = hi;
    }
    pop.querySelector(".ll-range").style.cssText = `--lo:${Math.min(lo, hi) / max * 100}%;--hi:${Math.max(lo, hi) / max * 100}%`;
    pop.querySelector("#ll-hist").innerHTML = histBars(max, Math.min(lo, hi), Math.max(lo, hi));
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
    const facts = [["Owner", l.owner], ["Market status", l.market_status], ["Lot type", l.lot_type], ["Lot size", l.lot_size], ["Price", money(l.price)], ["Bedrooms", bb(l).beds], ["Bathrooms", bb(l).baths], ["Gallery name", l.gallery_name], ["Creator", l.creator]]
      .map(([k,v]) => `<div><dt>${k}</dt><dd>${v || v === 0 ? esc(v) : '<span style="color:var(--muted);font-weight:500">Not set</span>'}</dd></div>`).join("");
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
        <label>Bedrooms<input name="beds" type="number" min="0" step="1" inputmode="numeric" value="${esc(bb(l).beds ?? "")}"></label>
        <label>Bathrooms<input name="baths" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(bb(l).baths ?? "")}"></label>
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
      price: price === "" ? null : Number(price), beds:num(v("beds")), baths:num(v("baths")), bed_bath:[num(v("beds")), num(v("baths"))].some(x => x != null) ? `${num(v("beds")) ?? "?"} / ${num(v("baths")) ?? "?"}` : null, household:v("household") || null, parent_id:v("parent_id") || null,
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
      const pop = t.closest("[data-pop]");
      if (pop){ const k = pop.dataset.pop; if (st.open === k){ st.open = null; } else { st.open = k; st.draft = { pmin:st.pmin, pmax:st.pmax, beds:st.beds, baths:st.baths, exact:st.exact, types:st.types ? [...st.types] : null, markets:st.markets ? [...st.markets] : null }; } draw(); return; }
      const pick = t.closest("[data-pick]");
      if (pick){ st[pick.dataset.pick] = pick.dataset.v; st.open = null; draw(); return; }
      const pb = t.closest("[data-pb]");
      if (pb){ st.draft[pb.dataset.pb] = +pb.dataset.pv; pb.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === pb)); return; }
      if (st.open && !t.closest(".ll-pop")){ st.open = null; draw(); if (!t.closest("[data-lot],[data-tab],[data-act]")) return; }
      const tb = t.closest("[data-tab]");
      if (tb){ const k = tb.dataset.tab; if (k === "owners") location.hash = "#/lotline/owners"; else { st.tab = k; if (curId || st.page) location.hash = "#/lotline"; else draw(); } return; }
      const f = t.closest("[data-f]");
      if (f){ st[f.dataset.f] = f.dataset.v; draw(); return; }
      const row = t.closest("[data-lot]");
      if (row && !st.editing){ location.hash = "#/lotline/" + row.dataset.lot; return; }
      const act = t.closest("[data-act]")?.dataset.act;
      if (act === "clear"){ st.world = st.build = "All"; st.markets = st.types = st.pmin = st.pmax = null; st.beds = st.baths = 0; st.exact = false; st.open = null; draw(); }
      if (act === "apply"){
        const d = st.draft || {};
        if (st.open === "price"){ let a = d.pmin, b = d.pmax; if (a != null && b != null && a > b) [a, b] = [b, a]; st.pmin = a; st.pmax = b; }
        if (st.open === "bb"){ st.beds = d.beds || 0; st.baths = d.baths || 0; st.exact = !!d.exact; }
        if (st.open === "type" || st.open === "market"){ const k = st.open, all = (k === "type" ? data.lot_options.lot_type : data.lot_options.market_status) || [], on = [...root.querySelectorAll("input[name=llcheck]:checked")].map(x => x.value), v = on.length === all.length ? null : on; if (k === "type") st.types = v; else st.markets = v; }
        st.open = null; draw();
      }
      if (act === "selall"){ const boxes = [...root.querySelectorAll("input[name=llcheck]")], allOn = boxes.every(b => b.checked); boxes.forEach(b => b.checked = !allOn); t.textContent = allOn ? "Select all" : "Deselect all"; }
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
      else if (e.key === "Escape" && st.open && root?.querySelector(".ll-pop")){ e.stopImmediatePropagation(); st.open = null; draw(); }
    }, true);
    document.addEventListener("input", e => {
      if (e.target.id === "ll-rlo" || e.target.id === "ll-rhi"){ syncPrice("range"); return; }
      if (e.target.id === "ll-pmin" || e.target.id === "ll-pmax"){ syncPrice("box"); return; }
      if (e.target.id === "ll-q"){ st.q = e.target.value; const pos = e.target.selectionStart; draw(); const q = root.querySelector("#ll-q"); q.focus(); q.setSelectionRange(pos, pos); }
    });
    document.addEventListener("change", async e => {
      if (e.target.id === "ll-exact" && st.draft){ st.draft.exact = e.target.checked; root.querySelectorAll('[data-pb="beds"]').forEach(b => { const n = +b.dataset.pv; b.textContent = n ? n + (e.target.checked ? "" : "+") : "Any"; }); }
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
