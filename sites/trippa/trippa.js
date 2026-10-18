/* Trippa: anything with a stay. Fly, train or drive there, plus a hotel and a rental car, in any combo. Modeled on Expedia,
   Hopper and Apple Wallet. Brand "Golden hour": coral for tappable things, sun colors only in the logo and art, Nunito.
   Routes: #/trippa (Book), /flight, /train, /stay, /car, /review, /booked, /trips, /trips/<id>, /wallet.
   Only travel modes SimNation allows for the pair are offered (GFB.travel). Trips save to their own table (GFB.trippa),
   to Calendar when the switch is on, and show on each traveler's Registry timeline. No reminders or deadlines: the game does those. */
const Trippa = (() => {
  const T = () => GFB.travel;
  let data = null, root = null, path = [];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const H = p => "#/trippa" + (p ? "/" + p : "");
  const money = n => "§" + (Math.round(n * 100) % 100 ? Number(n).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }) : Math.round(n).toLocaleString());
  const EST = `<span class="tp-est">est.</span>`;
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => stripNick(n).split(" ")[0];
  const sim = id => data.sims.find(s => s.id === id);
  const cal = () => data.calendar;
  const SHEET_THEME = { "--ui-sheet-bg":"#fff6ec", "--ui-sheet-fg":"#2b2a33", "--ui-sheet-accent":"#f25c3b" };
  const names = ids => { const n = ids.map(id => first((sim(id) || {}).name || "")); return n.length <= 2 ? n.join(" and ") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };

  /* ---------- game dates ---------- */
  const DAYS = () => cal().seasons.length * 21;
  const ordOf = d => (d.year - 1) * DAYS() + cal().seasons.findIndex(x => x.name === d.season) * 21 + d.day;
  const fromOrd = n => { const y = Math.floor((n - 1) / DAYS()) + 1, r = (n - 1) % DAYS(); return { season:cal().seasons[Math.floor(r / 21)].name, day:r % 21 + 1, year:y }; };
  const today = () => ({ season:cal().today.season, day:cal().today.day, year:cal().year });
  const short = d => `${d.season} ${d.day}`;
  const span = (a, b) => a.season === b.season ? `${a.season} ${a.day} to ${b.day}` : `${short(a)} to ${short(b)}`;
  const spanFull = (a, b) => `${short(a)} to ${short(b)}`;
  const clock = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60, h12 = h % 12 || 12; return `${h12}:${String(mm).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
  const dur = m => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} hr${r ? " " + r + " min" : ""}` : `${r} min`; };

  /* ---------- airports (lore) and flights ---------- */
  const AIRPORTS = { 134252:"Baymore International", 195493:"Aurora Hills International", 302872:"Redwood Bay International", 228200:"Port Hollis Regional", 104065:"Palm Mesa Regional" };
  const airport = id => AIRPORTS[id] || `${(T().world(id) || {}).name || ""} airport`;
  const code = id => { const w = T().world(id); return (w && w.ticket_code) || (w ? w.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() : "---"); };
  const FLIGHT_MIN = { local:45, regional:95, long_distance:205, overseas:580 };
  const SLOTS = [[495, "Earliest"], [810, ""], [1080, ""]];
  function flights(a, b) { const p = T().pair(a, b), m = FLIGHT_MIN[p ? p.band : "regional"] || 120; return SLOTS.map(([t, tag]) => ({ dep:t, arr:t + m, min:m, tag })); }
  const seed = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------- the draft booking ---------- */
  const st = { d:null, booked:null, open:null, err:null };
  function draft() {
    if (st.d) return st.d;
    const t = today(), home = (T().worldsIn(T().settings().home_region)[0] || T().worlds()[0]).id;
    return (st.d = { need:{ travel:true, stay:true, car:false }, mode:"plane", from:home, to:null, start:t, end:fromOrd(ordOf(t) + 3), travelers:[], cls:"economy", out:0, back:3, hotel:null, room:0, driver:null, addCal:true });
  }
  const nights = d => Math.max(0, ordOf(d.end) - ordOf(d.start));
  const MODES = [["plane","Fly"],["train","Train"],["car","Drive"]];
  const allowed = (d, m) => !d.to ? true : d.to === d.from ? m === "car" : !!(T().pair(d.from, d.to) || { modes:[] }).modes.includes(m);
  function steps(d) { const s = []; if (d.need.travel && d.mode === "plane") s.push(["flight", "Flight"]); if (d.need.travel && d.mode === "train") s.push(["train", "Train"]); if (d.need.stay) s.push(["stay", "Stay"]); if (d.need.car) s.push(["car", "Car"]); return s; }
  const nextOf = (d, cur) => { const s = steps(d).map(x => x[0]), i = s.indexOf(cur); return i < 0 ? (s[0] || "review") : (s[i + 1] || "review"); };
  const prevOf = (d, cur) => { const s = steps(d).map(x => x[0]); if (cur === "review") return s[s.length - 1] || ""; const i = s.indexOf(cur); return i > 0 ? s[i - 1] : ""; };

  /* stays from Lotline: lots with lot type Hotel (or Vacation rental) in the destination world */
  const isStay = l => /^(hotel|vacation rental)$/i.test(String(l.lot_type || "").trim());
  function stays(worldId) { const w = T().world(worldId); if (!w) return []; const nm = [w.name, w.ea_name, ...(w.aliases || [])].map(x => x.toLowerCase()); return (data.lots || []).filter(l => isStay(l) && !l.parent_id && nm.includes(String(l.world || "").toLowerCase())); }
  const LEVELS = { budget:"Budget", affordable:"Affordable", standard:"Standard", premium:"Premium", luxury:"Luxury" };
  /* room types come from Lotline later (units under the hotel); until then, one standard room at the hotel's own level (Standard if it has none) */
  function rooms(l) {
    const level = (l.price_level || l.simnation_level || "standard").toLowerCase();
    const list = Array.isArray(l.rooms) && l.rooms.length ? l.rooms : (data.lots || []).filter(u => u.parent_id === l.id && u.lot_type && /room|suite/i.test(u.lot_type)).map(u => ({ name:u.address || u.gallery_name, beds:parseInt(u.bed_bath) || 1, baths:parseInt(String(u.bed_bath || "").split("/")[1]) || 1, photo:u.photo }));
    const base = list.length ? list : [{ name:"Standard room", beds:1, baths:1, sleeps:2 }];
    return base.map(r => ({ ...r, sleeps:r.sleeps || r.beds * 2, level, nightly:T().nightly(r.level || level, r.beds || 1, r.baths || 1) }));
  }
  const stayName = l => l.gallery_name || l.address;

  /* ---------- prices ---------- */
  function lines(d) {
    const n = Math.max(1, d.travelers.length), out = [], F = k => T().fare(k);
    if (d.need.travel && d.mode === "plane") { const f = F(d.cls === "first" ? "plane_first_each" : "plane_economy_each"), fl = flights(d.from, d.to); out.push({ k:"flight", icon:"plane", c:"#1d4f91", t:`Flight, ${d.cls === "first" ? "first class" : "economy"}`, s:`Pan Simerica · round trip`, sub2:`${short(d.start)}, ${clock(fl[d.out].dep)} · home ${short(d.end)}, ${clock(fl[d.back - 3 >= 0 ? d.back - 3 : 0].dep)}`, amt:f.value * n, how:`${n} × ${money(f.value)}`, est:f.est }); }
    if (d.need.travel && d.mode === "train") { const f = F(d.cls === "first" ? "train_first_each_estimate" : "train_each_estimate"); out.push({ k:"train", icon:"train", c:"#1e40af", t:`Train, ${d.cls === "first" ? "first class" : "economy"}`, s:"Round trip", amt:f.value * n, how:`${n} × ${money(f.value)}`, est:f.est }); }
    if (d.need.travel && d.mode === "car") { const f = F("own_car_gas_per_car"); out.push({ k:"drive", icon:"car", c:"#6d4c41", t:"Drive, gas", s:"Your own car · one price per car", amt:f.value, how:"per car", est:f.est }); }
    if (d.need.stay && d.hotel) { const l = (data.lots || []).find(x => x.id === d.hotel); if (l) { const r = rooms(l)[d.room] || rooms(l)[0], nn = nights(d); out.push({ k:"stay", icon:"bed", c:"#f2994a", t:stayName(l), s:`${r.name} · ${nn} night${nn === 1 ? "" : "s"}`, sub2:`${r.name} · ${nn} nights at ${money(r.nightly)}`, amt:r.nightly * nn, est:true }); } }
    if (d.need.car) { const f = F("rental_car_per_car"); out.push({ k:"car", icon:"car", c:"#8d6e63", t:"Rental car", s:`${span(d.start, d.end)} · ${d.mode === "plane" && d.need.travel ? (T().world(d.to) || {}).name + " airport" : (T().world(d.to) || {}).name || ""}`, amt:f.value, est:f.est }); }
    return out;
  }
  const totalOf = L => ({ amt:L.reduce((a, x) => a + x.amt, 0), est:L.some(x => x.est) });

  /* ---------- art and icons ---------- */
  const ico = (p, f) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="${f ? "currentColor" : "none"}" stroke="${f ? "none" : "currentColor"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    plane:ico('<path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z"/>', 1),
    train:ico('<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l-2 2M15 20l2 2"/>'),
    bed:ico('<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.5"/>'),
    car:ico('<path d="M4 16v-3l2-5h12l2 5v3z"/><circle cx="8" cy="16.5" r="1.5"/><circle cx="16" cy="16.5" r="1.5"/>'),
    bag:ico('<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16"/>'),
    trips:ico('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M14 9h4M14 12h4M6 9h5v6H6z"/>'),
    wallet:ico('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>')
  };
  const LOGO = `<svg viewBox="0 0 56 56" aria-hidden="true"><rect width="56" height="56" rx="14" fill="#f25c3b"/><circle cx="28" cy="32" r="12" fill="#ffd27a"/><rect x="6" y="32" width="44" height="18" fill="#f25c3b"/><path d="M10 38h36M14 43h28" stroke="#ffd27a" stroke-width="3" stroke-linecap="round"/></svg>`;
  const logo = `<span class="tp-logo">${LOGO}trippa</span>`;
  const sunset = `<svg viewBox="0 0 400 140" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="300" cy="96" r="42" fill="#ffe2a0" opacity=".95"/><path d="M0 100 C80 86 140 108 220 96 S360 88 400 98 V140 H0z" fill="#c95a3e" opacity=".55"/><path d="M0 114 C90 104 170 124 260 112 S370 106 400 112 V140 H0z" fill="#9c4430" opacity=".6"/><path d="M60 92 l10-16 10 16z M84 94 l8-12 8 12z" fill="#7a3426" opacity=".5"/></svg>`;
  const stamp = (place, d) => `<svg class="tp-stamp" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="27" fill="#fff" stroke="#f25c3b" stroke-width="2.5" stroke-dasharray="4 3"/><text x="30" y="27" text-anchor="middle" font-family="Nunito,sans-serif" font-size="${place.length > 10 ? 6 : 7.5}" font-weight="900" fill="#f25c3b">${esc(place.toUpperCase().slice(0, 14))}</text><text x="30" y="39" text-anchor="middle" font-family="Nunito,sans-serif" font-size="8" font-weight="800" fill="#f25c3b">${esc(short(d).toUpperCase())}</text></svg>`;
  const PANLOGO = `<svg class="tp-lg" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#fff"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="#1d4f91" stroke-width="2"/><ellipse cx="16" cy="16" rx="4.5" ry="10.5" fill="none" stroke="#1d4f91" stroke-width="1.6"/><path d="M5.8 12.5h20.4M5.8 19.5h20.4" stroke="#1d4f91" stroke-width="1.6"/></svg>`;
  const markOf = (k, c) => `<svg class="tp-lg" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#fff"/><g transform="translate(6 6)" color="${c}">${IC[k]}</g></svg>`;
  const face = s => s ? (s.portrait ? `<img src="${esc(s.portrait)}" alt="">` : `<span class="tp-ini" aria-hidden="true">${esc(stripNick(s.name).split(" ").map(w => w[0]).slice(0, 2).join(""))}</span>`) : "";
  const faces = ids => `<span class="tp-faces">${ids.slice(0, 4).map(id => face(sim(id))).join("")}</span>`;
  function qr(seedStr) {
    let h = seed(seedStr) || 1; const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const f = (x, y, ox, oy) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7 && (x === ox || x === ox + 6 || y === oy || y === oy + 6 || (x >= ox + 2 && x <= ox + 4 && y >= oy + 2 && y <= oy + 4));
    let r = ""; for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) { const fin = f(x, y, 0, 0) || f(x, y, 18, 0) || f(x, y, 0, 18), zone = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16); if (fin || (!zone && rnd() > .52)) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }
    return `<svg viewBox="0 0 25 25" width="120" height="120" shape-rendering="crispEdges" fill="#000" aria-hidden="true">${r}</svg>`;
  }

  /* ---------- pieces ---------- */
  function row({ icon, c, t, s, v, href, act, cls = "", aria, right = "" }) {
    const inner = `${icon ? `<span class="tp-ic" style="background:${c || "#f25c3b"}">${IC[icon]}</span>` : ""}<span class="tp-tx"><span class="tp-t">${t}</span>${s ? `<span class="tp-s">${s}</span>` : ""}</span>${v ? `<span class="tp-v">${v}</span>` : ""}${right}${href || (act && !/danger/.test(cls)) ? `<span class="tp-chev" aria-hidden="true">›</span>` : ""}`;
    const k = `tp-r${icon ? " i" : ""} ${cls}`;
    if (href) return `<a class="${k}" href="${href}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${inner}</a>`;
    if (act) return `<button type="button" class="${k}" data-tp="${esc(act)}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${inner}</button>`;
    return `<div class="${k}">${inner}</div>`;
  }
  const field = (lab, val, act, right = "") => `<button type="button" class="tp-r tp-field" data-tp="${act}"><span class="tp-tx"><span class="tp-lab">${lab}</span><span class="tp-t">${val}</span></span>${right}<span class="tp-chev" aria-hidden="true">›</span></button>`;
  const postcard = (tr, big) => { const w = T().world(tr.world_id), place = w ? w.name : tr.title;
    return `<div class="tp-post ${big ? "big" : ""}"><div class="tp-ph">${sunset}${stamp(place, tr.start_date)}</div><div class="tp-ptx"><b>${esc(place)}</b><small>${esc(span(tr.start_date, tr.end_date))}${tr.stay ? " · " + esc(tr.stay.name) : ""}</small>${tr.travelers && tr.travelers.length ? faces(tr.travelers) : ""}</div></div>`; };
  const tabbar = on => `<nav class="tp-tabs" aria-label="Trippa">${[["", "Book", "bag"], ["trips", "Trips", "trips"], ["wallet", "Wallet", "wallet"]].map(([p, n, k]) => `<a href="${H(p)}" class="${on === n ? "on" : ""}" ${on === n ? 'aria-current="page"' : ""}>${IC[k]}<span>${n}</span></a>`).join("")}</nav>`;
  const stepper = (d, cur) => { const s = steps(d); if (!s.length) return ""; const ci = s.findIndex(x => x[0] === cur);
    return `<div class="tp-steps">${s.map(([k, n], i) => `<span class="${i === ci ? "on" : i < ci || cur === "review" ? "done" : ""}"><i>${i < ci || cur === "review" ? "✓" : i + 1}</i>${n}</span>`).join('<b aria-hidden="true">·</b>')}</div>`; };
  const upcoming = () => GFB.trippa.all().filter(t => t.end_date && ordOf(t.end_date) >= ordOf(today())).sort((a, b) => ordOf(a.start_date) - ordOf(b.start_date));
  const past = () => GFB.trippa.all().filter(t => t.end_date && ordOf(t.end_date) < ordOf(today())).sort((a, b) => ordOf(b.start_date) - ordOf(a.start_date));

  /* ---------- screens ---------- */
  function book() {
    const d = draft(), nx = upcoming()[0], to = d.to && T().world(d.to), from = T().world(d.from);
    const pill = (k, n) => `<button type="button" class="tp-pill ${d.need[k] ? "on" : ""}" data-tp="need:${k}" aria-pressed="${d.need[k]}">${n}</button>`;
    const seg = MODES.map(([m, n]) => { const ok = allowed(d, m); return `<button type="button" class="${d.mode === m && ok ? "on" : ""} ${ok ? "" : "off"}" data-tp="mode:${m}" ${ok ? "" : 'aria-disabled="true"'} aria-pressed="${d.mode === m && ok}">${n}${ok ? "" : "<small>Not on this route</small>"}</button>`; }).join("");
    const nn = nights(d);
    return `<div class="tp-hd">${logo}</div>
      ${nx ? `<div class="tp-group">${row({ icon:"plane", c:"#f25c3b", t:`Next trip: ${esc((T().world(nx.world_id) || {}).name || nx.title)}`, s:`${esc(span(nx.start_date, nx.end_date))} · ${esc(names(nx.travelers || []))}`, href:H("trips/" + nx.id) })}</div>` : ""}
      <h1 class="tp-big">What do you need?</h1>
      <div class="tp-pills" role="group" aria-label="What do you need">${pill("travel", "Travel")}${pill("stay", "Stay")}${pill("car", "Car")}</div>
      ${d.need.travel ? `<div class="tp-seg" role="group" aria-label="How to get there">${seg}</div>` : ""}
      <div class="tp-group">
        ${d.need.travel ? field("From", esc(d.mode === "plane" ? airport(d.from) : from ? from.name : "Choose"), "pick:from") : ""}
        ${field("To", to ? esc(to.name) : `<span class="tp-ph-t">Where to?</span>`, "pick:to", to ? `<span class="tp-v sm">${esc(to.ea_name)} in EA</span>` : "")}
        ${field("Dates", `${esc(spanFull(d.start, d.end))}`, "dates", `<span class="tp-v">${nn} night${nn === 1 ? "" : "s"}</span>`)}
        ${field("Who's going", d.travelers.length ? esc(names(d.travelers)) : `<span class="tp-ph-t">Choose Sims</span>`, "who", d.travelers.length ? faces(d.travelers) : "")}
      </div>
      ${st.err ? `<p class="tp-foot tp-err" role="alert">${esc(st.err)}</p>` : ""}
      <button type="button" class="tp-btn" data-tp="find">Find trips</button>
      <p class="tp-foot">Go somewhere good.</p>`;
  }
  function flightStep() {
    const d = draft(), w = T().world(d.to), fl = flights(d.from, d.to), F = k => T().fare(k);
    const opt = (f, i, which, sel) => `<button type="button" class="tp-r tp-fl ${sel ? "sel" : ""}" data-tp="${which}:${i}" aria-pressed="${sel}"><span class="tp-radio ${sel ? "on" : ""}" aria-hidden="true"></span><span class="tp-tx"><span class="tp-t">${clock(f.dep)} to ${clock(f.arr)}</span><span class="tp-s">Nonstop · ${dur(f.min)}</span></span>${f.tag ? `<span class="tp-tag best">${f.tag}</span>` : ""}</button>`;
    return { title:`Flights to ${w.name}`, back:"", body:`${stepper(d, "flight")}
      <div class="tp-seg tall" role="group" aria-label="Class"><button type="button" class="${d.cls === "economy" ? "on" : ""}" data-tp="cls:economy" aria-pressed="${d.cls === "economy"}">Economy<small>${money(F("plane_economy_each").value)} each</small></button><button type="button" class="${d.cls === "first" ? "on" : ""}" data-tp="cls:first" aria-pressed="${d.cls === "first"}">First class<small>${money(F("plane_first_each").value)} each</small></button></div>
      <h3 class="tp-sec">Going · ${esc(short(d.start))} · Pan Simerica</h3><div class="tp-group">${fl.map((f, i) => opt(f, i, "out", d.out === i)).join("")}</div>
      <h3 class="tp-sec">Coming home · ${esc(short(d.end))}</h3><div class="tp-group">${flights(d.to, d.from).map((f, i) => opt(f, i, "back", d.back === i + 3)).join("")}</div>
      <p class="tp-foot">From ${esc(airport(d.from))}. Flight times are made up; SimNation only sets the fare.</p>` };
  }
  function trainStep() {
    const d = draft(), w = T().world(d.to), F = k => T().fare(k);
    const p = typeof Roam !== "undefined" ? Roam.plan("w-" + d.from, "w-" + d.to, d.travelers, data) : null, o = p && p.opts && p.opts.find(x => x.mode === "train");
    return { title:`Train to ${w.name}`, body:`${stepper(d, "train")}
      <div class="tp-seg tall" role="group" aria-label="Class"><button type="button" class="${d.cls === "economy" ? "on" : ""}" data-tp="cls:economy">Economy<small>${money(F("train_each_estimate").value)} each est.</small></button><button type="button" class="${d.cls === "first" ? "on" : ""}" data-tp="cls:first">First class<small>${money(F("train_first_each_estimate").value)} each est.</small></button></div>
      <div class="tp-group">${row({ icon:"train", c:"#1e40af", t:`Going · ${esc(short(d.start))}`, s:o ? esc(`${o.legs.map(l => l.name).join(" to ")} · about ${dur(Math.round(o.minutes / 5) * 5)}`) : "Train" })}${row({ icon:"train", c:"#1e40af", t:`Coming home · ${esc(short(d.end))}`, s:"Same line home" })}</div>
      <p class="tp-foot">Train fares are estimates. Roam has the line by line route.</p>` };
  }
  function stayStep() {
    const d = draft(), w = T().world(d.to), list = stays(d.to), nn = nights(d);
    if (!list.length) return { title:`Stays in ${w.name}`, body:`${stepper(d, "stay")}<div class="tp-empty"><b>No stays in ${esc(w.name)} yet</b>Hotels come from Lotline. Add a lot with the lot type Hotel in ${esc(w.name)}, and it shows up here.</div>`, noNext:true };
    if (!d.hotel || !list.some(l => l.id === d.hotel)) { d.hotel = list[0].id; d.room = 0; }
    const sel = list.find(l => l.id === d.hotel), rs = rooms(sel), cheapest = rs.reduce((a, r, i) => r.nightly < rs[a].nightly ? i : a, 0);
    const photo = (src, lab, cls) => src ? `<img class="${cls}" src="${esc(src)}" alt="">` : `<span class="tp-phl ${cls}"><span>${lab}</span></span>`;
    return { title:`Stays in ${w.name}`, body:`${stepper(d, "stay")}
      ${list.length > 1 ? `<div class="tp-group">${list.map(l => row({ t:esc(stayName(l)), s:esc([l.district, LEVELS[(l.price_level || "standard").toLowerCase()]].filter(Boolean).join(" · ")), act:"hotel:" + l.id, cls:l.id === d.hotel ? "sel" : "" })).join("")}</div>` : ""}
      <div class="tp-hotel">${photo(sel.photo, "Hotel photo from Lotline", "tp-hph")}<div class="tp-htx"><b>${esc(stayName(sel))}</b><small>${esc([w.name, LEVELS[rs[0].level] || "Standard", `${nn} night${nn === 1 ? "" : "s"}`].join(" · "))}</small></div></div>
      <h3 class="tp-sec">Room types</h3>
      <div class="tp-group">${rs.map((r, i) => `<button type="button" class="tp-r tp-room ${d.room === i ? "sel" : ""}" data-tp="room:${i}" aria-pressed="${d.room === i}">${photo(r.photo, "Room photo", "tp-thumb")}<span class="tp-tx"><span class="tp-t">${esc(r.name)}</span><span class="tp-s">${r.beds} bed${r.beds === 1 ? "" : "s"} · Sleeps ${r.sleeps}</span>${i === cheapest && rs.length > 1 ? `<span class="tp-tag best">Best price</span>` : ""}</span><span class="tp-v"><b>${money(r.nightly)}</b><small>a night ${EST}</small></span></button>`).join("")}</div>
      <p class="tp-foot">Hotels, room types and photos come from Lotline. Nightly prices use the hotel's SimNation level.</p>` };
  }
  function carStep() {
    const d = draft(), w = T().world(d.to), at = d.need.travel && d.mode === "plane" ? "Airport" : w.name, drv = d.driver && d.travelers.includes(d.driver) ? d.driver : d.travelers[0];
    return { title:"Rental car", body:`${stepper(d, "car")}
      <div class="tp-group">${row({ icon:"car", c:"#8d6e63", t:"Rental car", s:"SimNation rental", v:`<b>${money(T().fare("rental_car_per_car").value)}</b>`, cls:"sel" })}</div>
      <div class="tp-group">${row({ t:"Pick up", v:esc(`${short(d.start)} · ${at}`) })}${row({ t:"Drop off", v:esc(`${short(d.end)} · ${at}`) })}${row({ t:"Driver", v:drv ? `${face(sim(drv))}<span>${esc(first(sim(drv).name))}</span>` : "Choose", act:"driver" })}</div>
      <p class="tp-foot">SimNation charges one rental price for the whole trip.</p>` };
  }
  function review() {
    const d = draft(), L = lines(d), tot = totalOf(L), p = d.need.travel && d.to !== d.from ? T().pair(d.from, d.to) : null;
    return { title:"Review trip", body:`${stepper(d, "review")}
      <div class="tp-group">${L.map(x => row({ icon:x.icon, c:x.c, t:esc(x.t), s:esc(isWide() && x.sub2 ? x.sub2 : x.s), v:`<b>${money(x.amt)}</b>${x.how ? `<small>${esc(x.how)}</small>` : x.est ? `<small>${EST}</small>` : ""}` })).join("")}
        ${isWide() ? `<div class="tp-r tp-total"><span class="tp-tx"><span class="tp-t">Total</span></span><span class="tp-v"><b>${money(tot.amt)}</b>${tot.est ? " " + EST : ""}</span></div>` : ""}</div>
      <div class="tp-group">${row({ t:"Who's going", right:faces(d.travelers), act:"who" })}${d.need.travel && d.mode === "plane" ? row({ t:"Flights", v:esc(`${short(d.start)} and ${short(d.end)}`), href:H("flight") }) : ""}
        <div class="tp-r"><span class="tp-tx"><span class="tp-t">Add to Calendar</span></span><button type="button" class="tp-tog ${d.addCal ? "on" : ""}" role="switch" aria-checked="${d.addCal}" aria-label="Add to Calendar" data-tp="cal"><i></i></button></div></div>
      ${p ? `<p class="tp-foot"><span class="tp-tag ${p.passport ? "warn" : "ok"}">${p.passport ? "Passport needed" : "No passport needed"}</span> ${p.passport ? "International trip." : "Domestic trip."}${d.mode === "plane" ? " Flight home is included in the fare." : ""}</p>` : ""}
      ${st.err ? `<p class="tp-foot tp-err" role="alert">${esc(st.err)}</p>` : ""}` , total:tot };
  }
  function booked() {
    const b = st.booked; if (!b) return { body:`<div class="tp-empty"><b>Nothing booked right now</b>Plan a trip from Book.</div>` };
    const w = T().world(b.world_id);
    return { hero:true, body:`<div class="tp-herotx"><small>You're booked</small><h2>Off to ${esc(w ? w.name : b.title)}!</h2></div>${postcard(b, true)}
      <div class="tp-group">${[["Saved to Trips", true], [`Added to Calendar for ${short(b.start_date)}`, !!b.calendar_event], ["Added to their Registry timelines", true]].filter(x => x[1]).map(([t]) => `<div class="tp-r tp-okline"><i aria-hidden="true">✓</i><span class="tp-t">${esc(t)}</span></div>`).join("")}</div>
      <div class="tp-endbtns"><a class="tp-btn" href="${H("trips")}">Done</a><a class="tp-btn plain" href="${H("wallet")}">Open Wallet</a></div>` };
  }
  function trips() {
    const up = upcoming(), ps = past();
    const card = t => `<a class="tp-postlink" href="${H("trips/" + t.id)}" aria-label="${esc((T().world(t.world_id) || {}).name || t.title)}, ${esc(span(t.start_date, t.end_date))}">${postcardLine(t)}</a>`;
    return `<h1 class="tp-big lg">Trips</h1>
      <h3 class="tp-sec">Upcoming</h3>${up.length ? up.map(card).join("") : `<div class="tp-empty"><b>No trips planned</b>Book one and it shows up here.</div>`}
      <h3 class="tp-sec">Past trips</h3>${ps.length ? ps.map(card).join("") : `<div class="tp-empty"><b>No past trips yet</b>When a trip ends, it moves here as a postcard.</div>`}`;
  }
  const postcardLine = t => { const w = T().world(t.world_id), place = w ? w.name : t.title, kinds = [t.legs && t.legs.length ? ({ plane:"Fly", train:"Train", car:"Drive" })[t.legs[0].mode] : null, t.stay ? "hotel" : null, t.car ? "car" : null].filter(Boolean);
    return `<div class="tp-post"><div class="tp-ph">${sunset}${stamp(place, t.start_date)}</div><div class="tp-ptx"><b>${esc(place)}</b><small>${esc(span(t.start_date, t.end_date))}${kinds.length ? " · " + esc(kinds.join(", ").replace(/^./, c => c.toUpperCase())) : ""}</small><span class="tp-prow">${faces(t.travelers || [])}<span class="tp-amt">${money(t.total || 0)}${t.est ? " " + EST : ""}</span></span></div></div>`; };
  function tripDetail(id) {
    const t = GFB.trippa.get(id); if (!t) return { title:"Trip", back:H("trips"), body:`<div class="tp-empty"><b>That trip isn't here anymore</b></div>` };
    return { title:(T().world(t.world_id) || {}).name || t.title, back:H("trips"), body:`${postcard(t, true)}
      <div class="tp-group">${(t.lines || []).map(x => row({ icon:x.icon, c:x.c, t:esc(x.t), s:esc(x.s), v:`<b>${money(x.amt)}</b>${x.est ? `<small>${EST}</small>` : ""}` })).join("")}<div class="tp-r tp-total"><span class="tp-tx"><span class="tp-t">Total</span></span><span class="tp-v"><b>${money(t.total || 0)}</b>${t.est ? " " + EST : ""}</span></div></div>
      <div class="tp-group">${row({ t:"Who's going", s:esc(names(t.travelers || [])), right:faces(t.travelers || []) })}</div>
      <div class="tp-group">${row({ t:"Remove trip", act:"rmtrip:" + t.id, cls:"danger" })}</div>
      <p class="tp-foot">Removing it takes it off Trips, Wallet and the Registry timelines. A Calendar event stays until you delete it there.</p>` };
  }
  function wallet() {
    const items = [];
    upcoming().forEach(t => {
      const w = T().world(t.world_id), from = t.from_id;
      (t.legs || []).filter(l => l.mode === "plane").forEach(l => (t.travelers || []).forEach(sid => items.push({ id:`${t.id}:${l.dir}:${sid}`, kind:"bp", t, l, sid, c:"#1d4f91", order:ordOf(l.date) + l.dep / 1440 })));
      if (t.stay) items.push({ id:`${t.id}:stay`, kind:"stay", t, c:"#f2994a", order:ordOf(t.start_date) + .6 });
      if (t.car) items.push({ id:`${t.id}:car`, kind:"car", t, c:"#8d6e63", order:ordOf(t.start_date) + .5 });
    });
    items.sort((a, b) => b.order - a.order);
    const open = items.find(x => x.id === st.open) || items[items.length - 1];
    const head = x => { const s = sim(x.sid);
      if (x.kind === "bp") return `<div class="tp-wh">${PANLOGO}<span class="tp-wn">Pan Simerica<small>BOARDING PASS · ${esc(first(s ? s.name : "").toUpperCase())}</small></span><span class="tp-hf"><small>${x.l.dir === "out" ? "GOING" : "HOME"}</small>${esc(short(x.l.date))}</span></div>`;
      if (x.kind === "stay") return `<div class="tp-wh">${markOf("bed", x.c)}<span class="tp-wn">${esc(x.t.stay.name)}<small>${esc(x.t.stay.room.toUpperCase())}</small></span><span class="tp-hf"><small>CHECK IN</small>${esc(short(x.t.start_date))}</span></div>`;
      return `<div class="tp-wh">${markOf("car", x.c)}<span class="tp-wn">Rental car<small>${esc((x.t.car.at || "").toUpperCase())}</small></span><span class="tp-hf"><small>PICK UP</small>${esc(short(x.t.start_date))}</span></div>`; };
    const body = x => { const s = sim(x.sid), h = seed(x.id);
      if (x.kind === "bp") { const a = x.l.dir === "out" ? x.t.from_id : x.t.world_id, b = x.l.dir === "out" ? x.t.world_id : x.t.from_id;
        return `<div class="tp-bp"><div><div class="tp-code">${esc(code(a))}</div><div class="tp-city">${esc((T().world(a) || {}).name || "")}</div></div><span class="tp-planeic" aria-hidden="true">${IC.plane}</span><div style="text-align:right"><div class="tp-code">${esc(code(b))}</div><div class="tp-city">${esc((T().world(b) || {}).name || "")}</div></div></div>
          <div class="tp-grid4"><div><small>BOARDS</small>${clock(x.l.dep - 30).replace(/ (am|pm)/, "")}</div><div><small>DEPARTS</small>${clock(x.l.dep).replace(/ (am|pm)/, "")}</div><div><small>SEAT</small>${(h % 28) + 3}${"ABCDEF"[h % 6]}</div><div><small>DATE</small>${esc(short(x.l.date))}</div></div>
          <div class="tp-qr">${qr(x.id)}<span>${esc(stripNick(s ? s.name : ""))} · ${x.t.cls === "first" ? "First class" : "Economy"}</span></div><p class="tp-booked">Booked with trippa</p>`; }
      if (x.kind === "stay") return `<div class="tp-wbody"><div><small>CHECK IN</small>${esc(short(x.t.start_date))}</div><div><small>CHECK OUT</small>${esc(short(x.t.end_date))}</div><div><small>GUESTS</small>${esc(names(x.t.travelers || []))}</div></div><div class="tp-qr">${qr(x.id)}<span>Room key</span></div>`;
      return `<div class="tp-wbody"><div><small>PICK UP</small>${esc(short(x.t.start_date))}</div><div><small>DROP OFF</small>${esc(short(x.t.end_date))}</div><div><small>DRIVER</small>${esc(x.t.car.driver ? first((sim(x.t.car.driver) || {}).name || "") : "")}</div></div>`; };
    return `<h1 class="tp-big lg">Wallet</h1>${items.length ? `<div class="tp-stack">${items.map(x => x === open ? `<div class="tp-wp full" style="--c:${x.c}">${head(x)}${body(x)}</div>` : `<button type="button" class="tp-wp strip" style="--c:${x.c}" data-tp="open:${esc(x.id)}">${head(x)}</button>`).join("")}</div><p class="tp-foot">Boarding passes, room keys and rental cars stay here until the trip ends.</p>`
      : `<div class="tp-empty"><b>Nothing in Wallet</b>Boarding passes, room keys and rental cars from your trips show up here until the trip ends.</div>`}`;
  }

  /* ---------- draw ---------- */
  const isWide = () => root && root.clientWidth > 700;
  function draw() {
    const [a, b] = path, d = draft(), wide = isWide();
    const tab = a === "trips" ? "Trips" : a === "wallet" ? "Wallet" : "Book";
    let main = "", pg = null;
    if (a === "flight" && d.to) pg = flightStep(); else if (a === "train" && d.to) pg = trainStep(); else if (a === "stay" && d.to) pg = stayStep(); else if (a === "car" && d.to) pg = carStep(); else if (a === "review" && d.to) pg = review();
    else if (a === "booked") pg = booked(); else if (a === "trips" && b) pg = tripDetail(b);
    const stepKey = ["flight","train","stay","car","review"].includes(a) ? a : null;
    let bar = "";
    if (stepKey && pg) {
      if (stepKey === "review") { const t = pg.total; bar = `<div class="tp-bar"><div><div class="tp-a">${money(t.amt)}${t.est ? " " + EST : ""}</div><div class="tp-bs">${d.travelers.length} traveler${d.travelers.length === 1 ? "" : "s"}${d.need.stay ? ` · ${nights(d)} nights` : ""}</div></div><button type="button" class="tp-btn" data-tp="book">Book trip</button></div>`; }
      else { const L = lines(d).filter(x => x.k === (stepKey === "flight" ? "flight" : stepKey === "train" ? "train" : stepKey)), t = totalOf(L), nx = nextOf(d, stepKey);
        const sub = stepKey === "stay" ? `${nights(d)} nights${L[0] ? " · " + L[0].s.split(" · ")[0] : ""}` : stepKey === "car" ? span(d.start, d.end) : `${Math.max(1, d.travelers.length)} traveler${d.travelers.length === 1 ? "" : "s"} · round trip`;
        bar = `<div class="tp-bar"><div><div class="tp-a">${money(t.amt)}${t.est ? " " + EST : ""}</div><div class="tp-bs">${esc(sub)}</div></div><a class="tp-btn ${pg.noNext ? "dis" : ""}" ${pg.noNext ? 'aria-disabled="true"' : `href="${H(nx)}"`}>${nx === "review" ? "Review trip" : "Next: " + nx.replace(/^./, c => c.toUpperCase())}</a></div>`; }
    }
    if (stepKey && pg) { const pv = prevOf(d, stepKey); pg.back = pv ? H(pv) : H(""); pg.backLabel = pv ? pv.replace(/^./, c => c.toUpperCase()) : "Search"; }
    if (pg && pg.back && !pg.backLabel) pg.backLabel = "Trips";
    const nav = pg && !pg.hero ? `<div class="tp-nav">${pg.back ? `<a class="tp-back" href="${pg.back}"><span aria-hidden="true">‹</span> ${esc(pg.backLabel)}</a>` : "<span></span>"}<b class="tp-ttl">${esc(pg.title || "")}</b><span></span></div>` : "";
    if (wide && tab === "Book" && !pg?.hero) {
      /* iPad: search on the left, the step or review on the right */
      const right = pg ? `${nav}<div class="tp-body">${pg.body}</div>${bar}` : `<div class="tp-body tp-idle">${upcoming()[0] ? postcard(upcoming()[0], true) : ""}<div class="tp-empty"><b>Where to?</b>Pick what you need on the left, then Find trips.</div></div>`;
      root.innerHTML = `<div class="site-tp wide"><div class="tp-split"><section class="tp-lp"><div class="tp-body">${book()}</div></section><section class="tp-rp">${right}</section></div>${tabbar(tab)}</div>`;
    } else if (pg) {
      root.innerHTML = `<div class="site-tp ${pg.hero ? "hero" : ""}">${pg.hero ? `<div class="tp-heroart">${sunset}</div>` : nav}<div class="tp-body ${wide ? "narrow" : ""}">${pg.body}</div>${bar}${stepKey || pg.hero ? "" : tabbar(tab)}</div>`;
    } else {
      main = tab === "Trips" ? trips() : tab === "Wallet" ? wallet() : book();
      root.innerHTML = `<div class="site-tp"><div class="tp-body ${wide ? "narrow" : ""}">${main}</div>${tabbar(tab)}</div>`;
    }
    st.err = null;
  }

  /* ---------- sheets ---------- */
  function sheet(o) { const s = UI.sheet({ theme:SHEET_THEME, ...o }); s.el.classList.add("tp-sheet"); return s; }
  function pickWorld(which) {
    const d = draft();
    const list = q => { const hits = q ? T().find(q).filter(h => h.type === "world").map(h => h.world) : T().worlds();
      return T().regions().map(r => { const ws = hits.filter(w => w.region === r.name); return ws.length ? `<h3 class="tp-sec">${esc(r.name)}</h3><div class="tp-group">${ws.map(w => `<button type="button" class="tp-r" data-w="${w.id}"><span class="tp-tx"><span class="tp-t">${esc(w.name)}</span><span class="tp-s">${esc(w.ea_name)} in EA${which === "from" && AIRPORTS[w.id] ? " · " + esc(AIRPORTS[w.id]) : ""}</span></span>${(which === "to" ? d.to : d.from) === w.id ? '<span class="tp-check" aria-hidden="true">✓</span>' : ""}</button>`).join("")}</div>` : ""; }).join("") || `<p class="tp-foot">No worlds match.</p>`; };
    const s = sheet({ title:which === "to" ? "Where to?" : "Leaving from", left:"Cancel", body:`<label class="tp-search"><input type="search" placeholder="A GFB or EA world name" autocomplete="off" aria-label="Search worlds"></label><div class="tp-wl">${list("")}</div>` });
    s.body.addEventListener("input", e => { s.body.querySelector(".tp-wl").innerHTML = list(e.target.value); });
    s.body.addEventListener("click", e => { const b = e.target.closest("[data-w]"); if (!b) return; d[which] = +b.dataset.w; if (!allowed(d, d.mode)) { const m = MODES.find(([k]) => allowed(d, k)); if (m) d.mode = m[0]; } d.hotel = null; s.close("pick"); draw(); });
  }
  function datesSheet() {
    const d = draft(), seasons = cal().seasons.map(x => x.name);
    const block = (n, v) => `<div class="tp-group"><div class="tp-r"><span class="tp-tx"><span class="tp-t">${n === "start" ? "Leave" : "Come home"}</span></span><select name="${n}_season" aria-label="Season">${seasons.map(x => `<option ${x === v.season ? "selected" : ""}>${esc(x)}</option>`).join("")}</select><input name="${n}_day" type="number" min="1" max="21" inputmode="numeric" value="${v.day}" aria-label="Day"><input name="${n}_year" type="number" min="1" inputmode="numeric" value="${v.year}" aria-label="Year"></div></div>`;
    const s = sheet({ title:"Dates", left:"Cancel", right:"Done", body:`${block("start", d.start)}<div style="height:12px"></div>${block("end", d.end)}<p class="tp-foot">Today is ${esc(short(today()))}, Year ${cal().year}.</p><p class="tp-foot tp-err" hidden></p>`,
      onRight:close => { const g = (n, f) => s.body.querySelector(`[name=${n}_${f}]`).value, rd = n => ({ season:g(n, "season"), day:Math.min(21, Math.max(1, +g(n, "day") || 1)), year:Math.max(1, +g(n, "year") || cal().year) });
        const a = rd("start"), b = rd("end"); if (ordOf(b) <= ordOf(a)) { const e = s.body.querySelector(".tp-err"); e.hidden = false; e.textContent = "Coming home has to be after leaving."; return; }
        d.start = a; d.end = b; close("done"); draw(); } });
  }
  function whoSheet(onlyTravelers) {
    const d = draft(), sel = new Set(d.travelers);
    const pool = onlyTravelers ? d.travelers.map(sim).filter(Boolean) : data.sims.slice().sort((x, y) => stripNick(x.name).localeCompare(stripNick(y.name)));
    const list = q => pool.filter(s => !q || stripNick(s.name).toLowerCase().includes(q.toLowerCase())).slice(0, 80).map(s => `<button type="button" class="tp-r" data-s="${esc(s.id)}" aria-pressed="${onlyTravelers ? d.driver === s.id : sel.has(s.id)}"><span class="tp-pav">${face(s)}</span><span class="tp-tx"><span class="tp-t">${esc(stripNick(s.name))}</span>${s.residence ? `<span class="tp-s">${esc(s.residence)}</span>` : ""}</span>${(onlyTravelers ? d.driver === s.id : sel.has(s.id)) ? '<span class="tp-check" aria-hidden="true">✓</span>' : ""}</button>`).join("");
    const s = sheet({ title:onlyTravelers ? "Driver" : "Who's going", left:"Cancel", right:onlyTravelers ? "" : "Done", body:`${onlyTravelers ? "" : `<label class="tp-search"><input type="search" placeholder="Search a name" autocomplete="off" aria-label="Search Sims"></label>`}<div class="tp-group tp-wl">${list("")}</div>`,
      onRight:close => { d.travelers = [...sel]; close("done"); draw(); } });
    s.body.addEventListener("input", e => { s.body.querySelector(".tp-wl").innerHTML = list(e.target.value); });
    s.body.addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; if (onlyTravelers) { d.driver = b.dataset.s; s.close("pick"); draw(); return; } const id = b.dataset.s; sel.has(id) ? sel.delete(id) : sel.add(id); const q = s.body.querySelector("input"); s.body.querySelector(".tp-wl").innerHTML = list(q ? q.value : ""); });
  }

  /* ---------- booking ---------- */
  async function doBook(btn) {
    const d = draft(), L = lines(d), tot = totalOf(L), w = T().world(d.to);
    if (!d.travelers.length) { st.err = "Pick who's going first."; return draw(); }
    btn.disabled = true;
    const legs = [];
    if (d.need.travel && d.mode === "plane") { const go = flights(d.from, d.to)[d.out], home = flights(d.to, d.from)[d.back - 3 >= 0 ? d.back - 3 : 0]; legs.push({ mode:"plane", dir:"out", date:d.start, dep:go.dep, arr:go.arr, airline:"Pan Simerica" }, { mode:"plane", dir:"home", date:d.end, dep:home.dep, arr:home.arr, airline:"Pan Simerica" }); }
    else if (d.need.travel) legs.push({ mode:d.mode, dir:"out", date:d.start }, { mode:d.mode, dir:"home", date:d.end });
    const lot = d.need.stay && d.hotel ? (data.lots || []).find(x => x.id === d.hotel) : null, room = lot ? (rooms(lot)[d.room] || rooms(lot)[0]) : null;
    const row0 = { title:`Vacation in ${w.name}`, world_id:w.id, from_id:d.need.travel ? d.from : null, start_date:d.start, end_date:d.end, travelers:[...d.travelers], cls:d.cls, legs,
      stay:lot ? { lot_id:lot.id, name:stayName(lot), room:room.name, nightly:room.nightly, nights:nights(d) } : null,
      car:d.need.car ? { driver:d.driver && d.travelers.includes(d.driver) ? d.driver : d.travelers[0], at:d.need.travel && d.mode === "plane" ? `${w.name} airport` : w.name } : null,
      lines:L.map(x => ({ k:x.k, icon:x.icon, c:x.c, t:x.t, s:x.s, amt:x.amt, est:x.est })), total:tot.amt, est:tot.est, calendar_event:null };
    try {
      if (d.addCal) { const ev = await GFB.saveEvent({ season:d.start.season, day:d.start.day, year:d.start.year, title:`${names(d.travelers)}: vacation in ${w.name}`, cat:"gameplay", sims:[...d.travelers],
        details:`Trippa: ${span(d.start, d.end)}. ${L.map(x => `${x.t} (${x.s}) ${money(x.amt)}${x.est ? " est." : ""}`).join("; ")}. Total ${money(tot.amt)}${tot.est ? " est." : ""}.` }); row0.calendar_event = ev.id; }
      const saved = await GFB.trippa.save(row0);
      st.booked = saved; st.d = null; location.hash = H("booked");
    } catch (err) { st.err = "Couldn't book that: " + err.message; btn.disabled = false; draw(); }
  }

  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-tp");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const b = e.target.closest("[data-tp]"); if (!b || b.disabled) return;
      const d = draft(), [k, x] = b.dataset.tp.split(":");
      if (k === "need") { d.need[x] = !d.need[x]; return draw(); }
      if (k === "mode") { if (b.getAttribute("aria-disabled") === "true") return; d.mode = x; return draw(); }
      if (k === "pick") return pickWorld(x);
      if (k === "dates") return datesSheet();
      if (k === "who") return whoSheet(false);
      if (k === "driver") return whoSheet(true);
      if (k === "find") {
        if (!d.need.travel && !d.need.stay && !d.need.car) { st.err = "Pick at least one: Travel, Stay or Car."; return draw(); }
        if (!d.to) { st.err = "Choose where they're going."; return draw(); }
        if (d.need.travel && d.to === d.from) { st.err = "They're already in that world. Turn off Travel, or pick another place."; return draw(); }
        if (d.need.travel && !allowed(d, d.mode)) { st.err = "That way isn't on this route. Pick another."; return draw(); }
        if (!d.travelers.length) { st.err = "Choose who's going."; return draw(); }
        location.hash = H(nextOf(d, null)); return;
      }
      if (k === "cls") { d.cls = x; return draw(); }
      if (k === "out") { d.out = +x; return draw(); }
      if (k === "back") { d.back = +x + 3; return draw(); }
      if (k === "hotel") { d.hotel = x; d.room = 0; return draw(); }
      if (k === "room") { d.room = +x; return draw(); }
      if (k === "cal") { d.addCal = !d.addCal; return draw(); }
      if (k === "book") return doBook(b);
      if (k === "open") { st.open = b.dataset.tp.slice(5); return draw(); }
      if (k === "rmtrip") { if (!UI.confirmTap(b.querySelector(".tp-t"), "Tap again to remove")) return; await GFB.trippa.remove(x); location.hash = H("trips"); }
    });
    try { new ResizeObserver(() => { if (root && root.querySelector(".site-tp")) { const w = root.clientWidth > 700; if (w !== bind.wide) { bind.wide = w; draw(); } } }).observe(root); } catch {}
  }

  function render(el, dd, parts) { root = el; data = dd; path = (parts || []).map(decodeURIComponent); bind(); bind.wide = isWide(); draw(); }
  function address(parts) { const [a, b] = parts || []; return a ? "/" + a + (b && a !== "trips" ? "/" + b : "") : "/"; }
  /* Registry timeline lines: { sim, title, sub, date, href } for each trip a Sim is on */
  function timelineFor(simId) {
    return GFB.trippa.all().filter(t => (t.travelers || []).includes(simId) && t.start_date).map(t => { const w = T().world(t.world_id), sameSeason = t.start_date.season === t.end_date.season;
      return { id:t.id, title:`Vacation in ${w ? w.name : t.title}`, sub:`Trippa · ${t.start_date.season} ${t.start_date.day} to ${sameSeason ? t.end_date.day : short(t.end_date)}`, date:t.start_date, href:H("trips/" + t.id) }; });
  }
  return { render, address, timelineFor };
})();
