/* Roam: ground travel and ferries, today or on a planned game date. Modeled on Apple Maps plus Citymapper. Hop Line look (plum, mint, pink pin; Bricolage and Inter).
   Routes: #/roam (explore), /search, /from (pick a start), /to/<place>, /to/<place>/<mode> (trip details), /booked, /passes.
   A place is w-<world id>, lot-<lot id> or st-<station>. Only the ways SimNation allows for that pair of worlds are offered
   (GFB.travel). Roam saves passes and tickets only (GFB.roam, table roam_passes); trips are kept only if Add to Calendar is on. */
const Roam = (() => {
  const T = () => GFB.travel, M = () => RoamMap;
  let data = null, root = null, path = [];
  const st = { q:"", sort:"best", travelers:[], cls:"economy", leave:null, addCal:true, booked:null, err:null, passOpen:null, view:null, viewKey:null, driven:null };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const H = p => "#/roam" + (p ? "/" + p : "");
  const money = n => "§" + (Math.round(n * 100) % 100 ? Number(n).toFixed(2) : Math.round(n).toLocaleString());
  const EST = `<span class="ro-est">est.</span>`;
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => stripNick(n).split(" ")[0];
  const sim = id => data.sims.find(s => s.id === id);
  const cal = () => data.calendar;
  const LS = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const SHEET_THEME = { "--ui-sheet-bg":"#fff", "--ui-sheet-fg":"#2a1745", "--ui-sheet-accent":"#2a1745" };

  /* ---------- game dates ---------- */
  const DAYS = () => cal().seasons.length * 21;
  const ordOf = d => (d.year - 1) * DAYS() + cal().seasons.findIndex(x => x.name === d.season) * 21 + d.day;
  const fromOrd = n => { const y = Math.floor((n - 1) / DAYS()) + 1, r = (n - 1) % DAYS(); return { season:cal().seasons[Math.floor(r / 21)].name, day:r % 21 + 1, year:y }; };
  const today = () => ({ season:cal().today.season, day:cal().today.day, year:cal().year });
  const dayLabel = d => `${d.season}, day ${d.day}`;
  const clock = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60, h12 = h % 12 || 12; return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ":00"} ${h < 12 ? "am" : "pm"}`; };
  const clockShort = m => clock(m).replace(":00 ", " ");
  const dur = m => { m = Math.max(5, Math.round(m / 5) * 5); if (m < 60) return m + " min"; if (m >= 1440) { const d = Math.floor(m / 1440), h = Math.round((m % 1440) / 60); return `${d} day${d > 1 ? "s" : ""}${h ? " " + h + " hr" : ""}`; } const h = Math.floor(m / 60), r = m % 60; return r ? `${h} hr ${r} min` : `${h} hr`; };
  const durRound = m => m < 60 ? dur(m) : m >= 1440 ? dur(m) : `${Math.round(m / 60)} hr`;

  /* ---------- places ---------- */
  const worldTok = id => "w-" + id;
  const lotName = l => l.gallery_name || l.address || "Lot";
  function place(tok) {
    if (!tok) return null;
    if (tok.startsWith("w-")) { const w = T().world(tok.slice(2)); return w ? { tok, kind:"world", name:w.name, sub:`${w.ea_name} in EA · ${w.region}`, world:w.id } : null; }
    if (tok.startsWith("lot-")) { const l = (data.lots || []).find(x => x.id === tok.slice(4)); if (!l) return null; const w = l.world ? T().worldByName(l.world) : null;
      return { tok, kind:"lot", name:lotName(l), sub:[l.gallery_name ? l.address : null, l.district, w ? w.name : l.world].filter(Boolean).join(", "), world:w ? w.id : null, lot:l }; }
    if (tok.startsWith("st-")) { const s = M().stations().find(x => x.id === tok); return s ? { tok, kind:"station", name:s.name, sub:M().lineName(s.line), world:s.world, line:s.line } : null; }
    return null;
  }
  const homeWorld = () => { const ws = T().worldsIn(T().settings().home_region); return (ws[0] || T().worlds()[0]).id; };
  const fromTok = () => { const t = LS.get("roam-from", null); return place(t) ? t : worldTok(homeWorld()); };
  const setFrom = t => LS.set("roam-from", t);

  /* ---------- the ways to go ---------- */
  const LOCAL_SAME_WORLD = ["walking","bike","car","rental_car","taxi","rideshare","transit","car_service_private"];
  const BASE = {
    local:{ walking:60, bike:30, car:15, rental_car:15, taxi:20, rideshare:20, car_service_private:20, car_service_limousine:20, airport_hotel_shuttle:30, transit:45, subway:35, train:40, ferry_boat:40 },
    regional:{ walking:1800, bike:720, car:240, rental_car:240, taxi:240, rideshare:240, car_service_private:240, car_service_limousine:240, airport_hotel_shuttle:240, transit:300, subway:150, train:180, ferry_boat:180 },
    long_distance:{ walking:5000, bike:2400, car:2400, rental_car:2400, taxi:2400, rideshare:2400, car_service_private:2400, car_service_limousine:2400, airport_hotel_shuttle:2400, transit:2880, subway:1800, train:2160, ferry_boat:1440 } };
  const REF = { local:40, regional:95, long_distance:230 };
  const MODE = {
    train:{ t:"Train", c:"#1e40af", i:"train" }, subway:{ t:"Subway", c:"#c2185b", i:"subway" }, transit:{ t:"Bus", c:"#c2185b", i:"bus" }, ferry_boat:{ t:"Ferry", c:"#2d8fd0", i:"ferry" },
    car:{ t:"Drive", c:"#6d4c41", i:"car" }, rental_car:{ t:"Rental car", c:"#8d6e63", i:"car" }, taxi:{ t:"Taxi", c:"#c8a200", i:"ride" }, rideshare:{ t:"Rideshare", c:"#111", i:"ride" },
    car_service_private:{ t:"Private car", c:"#37474f", i:"ride" }, car_service_limousine:{ t:"Limo", c:"#212121", i:"ride" }, airport_hotel_shuttle:{ t:"Airport shuttle", c:"#455a64", i:"bus" },
    walking:{ t:"Walk", c:"#607d8b", i:"walk" }, bike:{ t:"Bike", c:"#2e7d32", i:"bike" } };
  /* one icon per kind of line, used everywhere: BayLink and other commuter rail, Metro subway, intercity trains */
  const LINE_KIND = { baylink:["commuter", "Commuter train"], euro:["commuter", "Rail"], metro:["subway", "Subway"], bullet:["train", "Bullet train"], llama:["train", "Train"], rail:["train", "Train"], ferry:["ferry", "Ferry"] };
  const ORDER = ["subway","train","transit","ferry_boat","car","rental_car","rideshare","taxi","car_service_private","car_service_limousine","airport_hotel_shuttle","bike","walking"];
  const activeOn = (p, d) => { const o = d ? ordOf(d) : ordOf(today()); if (p.valid_until && ordOf(p.valid_until) < o) return false; if (p.kind === "rides") return (p.rides_left || 0) > 0; return p.kind !== "ticket"; };
  /* SimNation charges one subway or bus fare per ride, so a pass for any line on the route covers it */
  const passFor = (simId, brands, mode, d) => GFB.roam.all().find(p => p.sim_id === simId && activeOn(p, d) && brands.includes(p.brand) && (p.covers || ["subway"]).includes(mode));

  function plan(fromP, toP, travelers, cls, leaveDate) {
    const n = Math.max(1, travelers.length), a = fromP.world, b = toP.world;
    if (!a || !b) return { error:!b ? `${toP.name} has no world set in Lotline, so Roam can't route there.` : `${fromP.name} has no world set in Lotline.` };
    const same = a === b, pr = same ? null : T().pair(a, b);
    const band = same ? "local" : pr ? pr.band : null;
    if (!same && !pr) return { error:"That route isn't in your SimNation settings." };
    const modes = (same ? LOCAL_SAME_WORLD : pr.modes).filter(m => m !== "plane" && MODE[m]);
    if (!modes.length) return { error:"There's no way to get there on the ground. Flights and stays are in Trippa.", trippa:true, band, passport:pr && pr.passport };
    const d = same ? 12 : M().dist(a, b), f = Math.min(1.6, Math.max(.6, d / (REF[band] || 100)));
    const F = k => T().fare(k);
    const opts = modes.map(m => {
      let minutes = Math.round((BASE[band] || BASE.regional)[m] * (same ? .6 : f)), legs = [], sub = "", tags = [], hi = [], extra = [], price, kindLabel = null, kindIcon = null;
      const fromName = fromP.kind === "world" ? (M().linesAt(a).length && ["train","subway","ferry_boat"].includes(m) ? null : fromP.name) : fromP.name;
      /* rail and ferry follow the lore lines when they can */
      let route = null;
      if (m === "train" && !same) route = M().railPath(a, b, L => !L.ferry);
      if (m === "subway" && !same) route = M().railPath(a, b, L => L.mode === "subway");
      if (m === "ferry_boat" && !same) route = M().railPath(a, b, L => L.ferry);
      if (route) {
        const changes = route.length - 1, travel = minutes - changes * 15, ds = route.map(r => Math.max(1, M().dist(r.from, r.to))), tot = ds.reduce((x, y) => x + y, 0);
        let t = 0;
        route.forEach((r, i) => { const L = M().LINES[r.line];
          legs.push({ name:M().stationName(r.line, r.from), sub:i === 0 ? L.name : `Change to the ${L.name} · 15 min`, at:t, color:L.color });
          t += Math.round(travel * ds[i] / tot) + (i < route.length - 1 ? 15 : 0); hi.push(r.line); });
        legs.push({ name:M().stationName(route[route.length - 1].line, b), sub:"Arrive", at:minutes, color:M().LINES[route[route.length - 1].line].color });
        if (toP.kind !== "world" && toP.kind !== "station") legs[legs.length - 1].sub = `Arrive, then ${toP.name} is a short walk`;
        sub = changes ? `Via ${M().stationName(route[0].line, route[0].to)}` : M().LINES[route[0].line].name;
        const lk = LINE_KIND[M().LINES[route[0].line].brand]; if (lk) { kindIcon = lk[0]; kindLabel = lk[1]; }
      } else {
        const label = { train:"Train", subway:"Subway", ferry_boat:"Ferry", transit:band === "local" ? "City bus" : "Coach line", car:"Drive", rental_car:"Pick up the rental car", taxi:"Taxi pickup", rideshare:"Rideshare pickup", car_service_private:"Private car pickup", car_service_limousine:"Limo pickup", airport_hotel_shuttle:"Shuttle pickup", walking:"Walk", bike:"Bike" }[m];
        legs = [{ name:fromName || fromP.name, sub:label, at:0, color:MODE[m].c }, { name:toP.name, sub:"Arrive", at:minutes, color:MODE[m].c }];
        sub = { transit:band === "local" ? "City bus" : "Coach line", rental_car:"SimNation rental", taxi:"Door to door", rideshare:"Door to door", car_service_private:"Private car service", car_service_limousine:"Limousine service", airport_hotel_shuttle:"Airport and hotel shuttle", bike:same ? "Around town" : "", walking:same ? "Around town" : "", train:"Train", subway:"Subway", ferry_boat:"Ferry" }[m] || "";
        if (!same) { if (["car","rental_car","taxi","rideshare","car_service_private","car_service_limousine","airport_hotel_shuttle","transit"].includes(m)) { const rp = M().roadPath(a, b); (rp || [M().curve(a, b)]).forEach(dd => extra.push({ d:dd, kind:"road" })); }
          else if (m === "walking" || m === "bike") extra.push({ d:M().curve(a, b), kind:"walk", color:MODE[m].c });
          else extra.push({ d:M().curve(a, b), kind:m === "ferry_boat" ? "ferry" : "rail", color:MODE[m].c }); }
      }
      if (m === "car") tags.push("Car needed");
      /* price: every price says its unit; estimates say est. */
      const each = (k, label) => { const fr = F(k); return { total:fr.value * n, text:`${money(fr.value)} each`, est:fr.est, each:fr.value, label }; };
      if (m === "train") price = each(cls === "first" ? "train_first_each_estimate" : "train_each_estimate");
      else if (m === "ferry_boat") price = each(cls === "first" ? "ferry_first_each" : "ferry_economy_each");
      else if (m === "transit") price = each("bus_each");
      else if (m === "subway") price = each("subway_rush_each");
      else if (m === "taxi") price = { total:F("taxi_per_ride_about").value, text:`${money(F("taxi_per_ride_about").value)} per ride`, est:F("taxi_per_ride_about").est };
      else if (m === "rideshare") price = { total:F("rideshare_per_ride_about").value, text:`${money(F("rideshare_per_ride_about").value)} per ride`, est:F("rideshare_per_ride_about").est };
      else if (m === "car") price = { total:F("own_car_gas_per_car").value, text:`${money(F("own_car_gas_per_car").value)} per car`, est:F("own_car_gas_per_car").est, gas:true };
      else if (m === "rental_car") price = { total:F("rental_car_per_car").value, text:`${money(F("rental_car_per_car").value)} per car`, est:F("rental_car_per_car").est };
      else if (m === "walking" || m === "bike") price = { total:0, text:"Free" };
      else price = { total:0, text:"Price in game", unknown:true };
      /* passes cover subway and bus rides on their own line */
      if ((m === "subway" || m === "transit") && travelers.length) {
        const brands = route ? [...new Set(route.map(r => M().LINES[r.line].brand))] : (m === "transit" ? ["metro"] : []);
        const covered = brands.length ? travelers.filter(id => passFor(id, brands, m, leaveDate)) : [];
        if (covered.length) {
          const left = n - covered.length, one = covered.length === 1 ? sim(covered[0]) : null, p = passFor(covered[0], brands, m, leaveDate);
          price = { ...price, total:price.each * left, text:left ? `${money(price.each)} each · ${covered.length} on a pass` : "Pass", est:left ? price.est : false, covered, pass:p };
          sub = one ? `${first(one.name)}'s ${p.kind === "rides" ? "ride pass" : p.trip && p.trip.days ? p.trip.days + " day pass" : "pass"}` : `${covered.length} on passes`;
        }
      }
      return { mode:m, ...MODE[m], ...(kindLabel ? { t:kindLabel, i:kindIcon } : {}), minutes, legs, sub, tags, hi, extra, price, classes:m === "train" || m === "ferry_boat", ticket:m === "train" || m === "ferry_boat" };
    });
    return { opts, band, passport:pr ? pr.passport : false, same, a, b };
  }
  function sorted(opts) {
    const k = st.sort, pv = o => o.price.unknown ? 9e9 : o.price.total;
    if (k === "fastest") return [...opts].sort((x, y) => x.minutes - y.minutes);
    if (k === "cheapest") return [...opts].sort((x, y) => pv(x) - pv(y) || x.minutes - y.minutes);
    /* Best: time plus cost, with a nudge against needing your own car and against prices only the game knows */
    const score = o => o.minutes + (o.price.unknown ? 120 : o.price.total * 2) + (o.mode === "car" || o.mode === "rental_car" ? 60 : 0) + (o.mode === "bike" || o.mode === "walking" ? 45 : 0);
    return [...opts].sort((x, y) => score(x) - score(y) || ORDER.indexOf(x.mode) - ORDER.indexOf(y.mode));
  }

  /* ---------- icons and brand marks ---------- */
  const I = {
    commuter:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2h8M12 2v2"/><rect x="5" y="4" width="14" height="13" rx="3"/><path d="M5 11h14"/><circle cx="9" cy="14" r=".6" fill="#fff"/><circle cx="15" cy="14" r=".6" fill="#fff"/><path d="M8 20l-2 2M16 20l2 2"/></svg>',
    subway:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V11a9 9 0 0 1 18 0v10"/><rect x="7" y="8" width="10" height="9" rx="2"/><path d="M7 13h10M9 20l-1 1M15 20l1 1"/></svg>',
    ride:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19v-3l2-4h12l2 4v3z"/><circle cx="8" cy="19" r="1.2"/><circle cx="16" cy="19" r="1.2"/><path d="M12 2a3 3 0 0 0-3 3c0 2 3 5 3 5s3-3 3-5a3 3 0 0 0-3-3z"/></svg>',
    train:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l-2 2M15 20l2 2"/><circle cx="9" cy="13" r=".8" fill="#fff"/><circle cx="15" cy="13" r=".8" fill="#fff"/></svg>',
    car:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16v-3l2-5h12l2 5v3z"/><circle cx="8" cy="16.5" r="1.5"/><circle cx="16" cy="16.5" r="1.5"/></svg>',
    bus:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 11h14M8 21v-3M16 21v-3"/><circle cx="8.5" cy="14.5" r=".6" fill="#fff"/><circle cx="15.5" cy="14.5" r=".6" fill="#fff"/></svg>',
    ferry:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15l2 4h14l2-4zM7 15V9h10v6M12 9V5"/></svg>',
    pin:'<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
    walk:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="M10 21l2-6-2-3 1-4 4 3 3 1M12 15l3 6M10 8l-3 3"/></svg>',
    bike:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8l3 8"/></svg>',
    cal:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    wallet:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/></svg>',
    swap:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4v15M4 8l4-4 4 4M16 20V5M12 16l4 4 4-4"/></svg>',
    mag:'<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/></svg>',
    locate:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
  };
  const BR = {
    metro:'<svg class="ro-lg" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#fff"/><path d="M8.5 22V10h3l4.5 7 4.5-7h3v12h-3v-7l-4.5 6.6L11.5 15v7z" fill="#c2185b"/></svg>',
    baylink:'<svg class="ro-lg" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="#fff"/><path d="M6 20c4-6 8-6 10 0s6 6 10 0" fill="none" stroke="#00897b" stroke-width="3" stroke-linecap="round"/><path d="M6 12h20" stroke="#00897b" stroke-width="3" stroke-linecap="round"/></svg>',
    llama:'<svg class="ro-lg" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="ro-llc"><circle cx="16" cy="16" r="15"/></clipPath></defs><circle cx="16" cy="16" r="15" fill="#fff"/><g clip-path="url(#ro-llc)" fill="#1e40af"><path d="M14.6 3.6c.7-.3 1.4.3 1.4 1.1V8l.8-3.4c.2-.8 1.1-1.1 1.6-.5.4.4.5 1 .4 1.5L18.2 9.4c1.4.8 2.3 2.3 2.3 4V20c0 2.4 1.8 4.4 4.2 5l3 .8V34H9.4l1.7-6.4c.6-2.4.9-4.8.9-7.3v-3.8l-2.6-.2c-1.2-.1-2.1-1-2.1-2.2v-.9c0-.9.6-1.7 1.4-2l3.9-1.7.8-.4V5.6c0-.9.5-1.7 1.2-2z"/></g><circle cx="14.6" cy="12.4" r="1" fill="#fff"/></svg>',
    other:c => `<svg class="ro-lg" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#fff"/><g transform="translate(7 7) scale(.75)" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l-2 2M15 20l2 2"/></g></svg>`
  };
  const BRANDS = { metro:{ name:"Baymore Metro", c:"#c2185b", gate:"Tap in at any Metro gate" }, baylink:{ name:"BayLink", sub:"BART · Route 12", c:"#00897b", gate:"Tap in at any BayLink gate" }, llama:{ name:"Llama Line", c:"#1e40af", gate:"Show this when you board" },
    rail:{ name:"Train", c:"#b26a00", gate:"Show this when you board" }, euro:{ name:"Eurosimia rail", c:"#2e7d32", gate:"Show this when you board" }, bullet:{ name:"Bullet train", c:"#c62828", gate:"Show this when you board" }, ferry:{ name:"Ferry", c:"#0277bd", gate:"Show this at the pier" } };
  const mark = b => BR[b] || BR.other((BRANDS[b] || {}).c || "#1e40af");
  const ic = (bg, k) => `<span class="ro-ic" style="background:${bg}">${I[k]}</span>`;
  const logo = `<span class="ro-logo"><svg width="28" height="28" viewBox="0 0 56 56" aria-hidden="true"><rect x="2" y="2" width="52" height="52" rx="16" fill="#1fd1a5"/><path d="M28 12a11 11 0 0 0-11 11c0 8 11 21 11 21s11-13 11-21a11 11 0 0 0-11-11z" fill="#2a1745"/><circle cx="28" cy="23" r="4.5" fill="#ff5c8a"/></svg>roam</span>`;
  const avatar = (s, cls = "") => s ? (s.portrait ? `<img class="${cls}" src="${esc(s.portrait)}" alt="">` : `<span class="ro-ini ${cls}" aria-hidden="true">${esc(stripNick(s.name).split(" ").map(w => w[0]).slice(0, 2).join(""))}</span>`) : "";
  const names = ids => { const n = ids.map(id => first((sim(id) || {}).name || "")); return n.length <= 2 ? n.join(" and ") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };

  /* ---------- the map ---------- */
  const AMERICAS = [228200,302872,195493,104065,311185,285909,104096,272365,166547,134252,119917,104064,108704,362425,173593];
  function mapFor(kind, o) {
    const el = root.querySelector(".ro-bigmap"); if (!el) return;
    const w = el.clientWidth || 390, h = el.clientHeight || 400, wide = isWide(), side = wide ? 400 : 0, sheetH = wide ? 0 : Math.round(h * .46);
    const fitIn = (ids, pad, minW) => { const ww = w - side, hh = h - sheetH, f = M().fit(ids, ww, hh, pad, minW), k = ww / f[2]; return [f[0] - side / k, f[1], w / k, h / k]; };
    const fromP = place(fromTok());
    let vb, opt;
    if (kind === "explore") { vb = fitIn(AMERICAS, wide ? 56 : 16, 60); opt = { pins:fromP && fromP.world ? [fromP.world] : [] }; }
    else if (o && o.a && o.b) { const ids = [o.a, o.b]; vb = fitIn(ids, wide ? 90 : 56, wide ? 170 : 90); opt = { hi:o.hi, extra:o.extra, pins:[o.a], dests:[o.b], labels:[...new Set([...ids, ...AMERICAS])], smallAt:9 }; }
    else { vb = fitIn(AMERICAS, 16, 60); opt = {}; }
    const key = kind + "|" + (o ? o.key : "") + "|" + w + "x" + h;
    if (st.viewKey !== key) { st.view = vb; st.viewKey = key; }
    st.mapOpt = opt; paintMap();
  }
  function paintMap() {
    const el = root && root.querySelector(".ro-bigmap"); if (!el || !st.view) return;
    const k = (el.clientWidth || 390) / st.view[2];
    el.innerHTML = M().svg(st.view, k, st.mapOpt || {});
  }

  /* ---------- screens ---------- */
  const isWide = () => root && root.clientWidth > 700;
  function row({ icon, t, s, v, href, act, cls = "", aria }) {
    const inner = `${icon || ""}<span class="ro-tx"><span class="ro-t">${t}</span>${s ? `<span class="ro-s">${s}</span>` : ""}</span>${v || ""}${href || (act && !/danger|accent/.test(cls)) ? `<span class="ro-chev" aria-hidden="true">›</span>` : ""}`;
    if (href) return `<a class="ro-row ${cls}" href="${href}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${inner}</a>`;
    if (act) return `<button type="button" class="ro-row ${cls}" data-ro="${esc(act)}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${inner}</button>`;
    return `<div class="ro-row ${cls}">${inner}</div>`;
  }
  const val = (t, p, e) => `<span class="ro-v"><b>${t}</b><span>${p}${e ? " " + EST : ""}</span></span>`;

  /* lines that serve the start: icon, name, kind and where they go, so you can tell a commuter train from a subway at a glance */
  function lineRows(fp) {
    if (!fp.world) return [];
    return M().linesAt(fp.world).slice(0, 3).map(k => { const L = M().LINES[k], lk = LINE_KIND[L.brand] || ["train", "Train"], ends = L.stations.map(s => s[0]).filter(w => w !== fp.world), far = ends[ends.length - 1], w = far && T().world(far), route = L.name.replace(L.short, "").trim();
      return w ? row({ icon:ic(L.color, lk[0]), t:esc(L.short), s:esc(`${lk[1]}${route ? " · " + route : ""} · to ${w.name}`), href:H("to/" + worldTok(far)) }) : ""; }).filter(Boolean);
  }
  function explore() {
    const fp = place(fromTok()), recent = LS.get("roam-recent-v1", []).map(r => ({ ...r, p:place(r.tok) })).filter(r => r.p && r.tok !== fp.tok).slice(0, 5);
    const rec = recent.map(r => { const pl = plan(fp, r.p, [], "economy"); const o = pl.opts && (pl.opts.find(x => x.mode === r.mode) || pl.opts[0]);
      return row({ icon:ic(o ? (o.hi[0] ? M().LINES[o.hi[0]].color : o.c) : "#2a1745", o ? o.i : "pin"), t:esc(r.p.name), s:esc(o ? `${r.p.kind === "world" ? "" : r.p.sub + " · "}${o.t}, about ${durRound(o.minutes)}` : r.p.sub), href:H("to/" + r.tok) }); });
    const lines = rec.length ? [] : lineRows(fp);
    return `<div class="ro-hd">${logo}<a class="ro-wbtn" href="${H("passes")}">${I.wallet}<span>Passes</span></a></div>
      <h1 class="ro-q">Where to?</h1>
      <a class="ro-search" href="${H("search")}">${I.mag}<span>A city, place or lot</span></a>
      <div class="ro-from"><span>Starting from <b>${esc(fp.name)}</b></span><a href="${H("from")}">Change</a></div>
      ${rec.length ? `<h3 class="ro-sec">Recent</h3><div class="ro-group">${rec.join("")}</div>` : lines.length ? `<h3 class="ro-sec">Lines from ${esc(fp.name)}</h3><div class="ro-group">${lines.join("")}</div>` : `<p class="ro-foot">Search a city, a station or a lot from Lotline to see every way your SimNation rules allow.</p>`}`;
  }
  function searchHits(q) {
    const n = q.trim().toLowerCase(); if (!n) return null;
    const hit = s => String(s || "").toLowerCase().includes(n), mk = (s, m) => { const i = String(s).toLowerCase().indexOf(n); return i < 0 ? esc(s) : esc(s.slice(0, i)) + "<mark>" + esc(s.slice(i, i + n.length)) + "</mark>" + esc(s.slice(i + n.length)); };
    const cities = T().find(q).filter(h => h.type === "world");
    const nbs = T().find(q).filter(h => h.type === "neighborhood");
    const sts = M().stations().filter(s => hit(s.name));
    const lots = (data.lots || []).filter(l => !l.parent_id && (hit(l.gallery_name) || hit(l.address) || hit(l.district))).slice(0, 12);
    return { cities, nbs, sts, lots, mk };
  }
  function search(pickFrom) {
    const r = searchHits(st.q), target = pickFrom ? "from:" : "to:";
    let list = "";
    if (r) {
      const { cities, nbs, sts, lots, mk } = r;
      if (cities.length) list += `<h3 class="ro-sec">Cities</h3><div class="ro-group">${cities.map(h => row({ icon:ic("#2a1745", "pin"), t:mk(h.world.name), s:`${mk(h.world.ea_name)} in EA · ${esc(h.world.region)}${h.match !== h.world.name && h.match !== h.world.ea_name ? ` · also ${mk(h.match)}` : ""}`, act:target + worldTok(h.world.id) })).join("")}</div>`;
      if (sts.length || lots.length || nbs.length) list += `<h3 class="ro-sec">Places and lots</h3><div class="ro-group">${[
        ...sts.map(s => row({ icon:ic(M().LINES[s.line].color, M().LINES[s.line].ferry ? "ferry" : "train"), t:mk(s.name), s:esc(M().lineName(s.line)), act:target + s.id })),
        ...nbs.map(h => row({ icon:ic("#5d6764", "pin"), t:mk(h.nb.name), s:`Neighborhood · ${esc(h.world.name)}${h.nb.ea_name ? ` · ${mk(h.nb.ea_name)} in EA` : ""}`, act:target + worldTok(h.world.id) })),
        ...lots.map(l => row({ icon:ic("#8a6a3c", "pin"), t:mk(lotName(l)), s:`Lot from Lotline · ${[l.gallery_name ? l.address : null, l.district, l.world].filter(Boolean).map(x => mk(x)).join(", ")}`, act:target + "lot-" + l.id }))].join("")}</div>`;
      if (!list) list = `<p class="ro-empty">No places match “${esc(st.q.trim())}”.</p>`;
    }
    return `<div class="ro-sbar"><label class="ro-search on">${I.mag}<input id="ro-q" type="search" value="${esc(st.q)}" placeholder="${pickFrom ? "Start from a city, place or lot" : "Where to? A city, place or lot"}" autocomplete="off" enterkeyhint="search" aria-label="Search places"></label><a class="ro-plain" href="${H("")}">Cancel</a></div>
      <div id="ro-res">${list || `<p class="ro-foot">Type a GFB name, an EA world name, a station or a lot from Lotline.</p>`}</div>`;
  }
  function odBox(fp, tp) {
    return `<div class="ro-odw"><div class="ro-od"><a class="ro-f" href="${H("from")}"><span class="ro-dot"></span><span><span>${esc(fp.name)}</span>${fp.kind !== "world" ? `<small>${esc(fp.sub)}</small>` : ""}</span></a><a class="ro-f" href="${H("search")}"><span class="ro-dot to"></span><span><span>${esc(tp.name)}</span>${tp.kind !== "world" ? `<small>${esc(tp.sub)}</small>` : ""}</span></a></div><button type="button" class="ro-swap" data-ro="swap:${esc(tp.tok)}" aria-label="Swap start and end">${I.swap}</button></div>`;
  }
  function directions(tok) {
    const fp = place(fromTok()), tp = place(tok);
    if (!tp) return { body:`<p class="ro-empty">That place isn't in SimDesk anymore.</p>` };
    const pl = plan(fp, tp, st.travelers, st.cls, st.leave);
    st.lastPlan = { pl, key:fp.tok + ">" + tok };
    const seg = `<div class="ro-seg" role="group" aria-label="Sort routes">${[["best","Best"],["fastest","Fastest"],["cheapest","Cheapest"]].map(([k, t]) => `<button type="button" class="${st.sort === k ? "on" : ""}" data-ro="sort:${k}" aria-pressed="${st.sort === k}">${t}</button>`).join("")}</div>`;
    if (pl.error) return { body:`${odBox(fp, tp)}<p class="ro-empty">${esc(pl.error)}</p>${pl.trippa ? `<div class="ro-group">${row({ t:"Open Trippa", href:"#/trippa", cls:"accent" })}</div>` : ""}`, map:{ a:fp.world, b:tp.world, key:fp.tok + ">" + tok } };
    const opts = sorted(pl.opts);
    const list = opts.map(o => row({ icon:ic(o.hi[0] ? M().LINES[o.hi[0]].color : o.c, o.i), t:esc(o.t), s:`${o.tags.map(t => `<span class="ro-tag warn">${esc(t)}</span>`).join(" ")}${o.tags.length && o.price.gas ? " Gas" : esc(o.sub)}`, v:val(dur(o.minutes), o.price.text, o.price.est), href:H(`to/${tok}/${o.mode}`), aria:`${o.t}, ${dur(o.minutes)}, ${o.price.text}` })).join("");
    const best = opts[0];
    return { body:`${odBox(fp, tp)}${seg}${isWide() ? "" : `<div class="ro-strip ro-map" aria-hidden="true"></div>`}<div class="ro-group ro-routes">${list}</div>
      <p class="ro-foot"><span class="ro-tag ${pl.passport ? "warn" : "ok"}">${pl.passport ? "Passport needed" : "No passport needed"}</span> Only ways your SimNation settings allow are shown.${opts.some(o => o.price.est) ? " Prices marked est. are estimates." : ""}</p>`,
      map:{ a:fp.world, b:tp.world, hi:best.hi, extra:best.extra, key:fp.tok + ">" + tok } };
  }
  function trip(tok, mode) {
    const fp = place(fromTok()), tp = place(tok), pl = tp && plan(fp, tp, st.travelers, st.cls, st.leave), o = pl && pl.opts && pl.opts.find(x => x.mode === mode);
    if (!o) return { title:"Trip", back:[H("to/" + tok), "Routes"], body:`<p class="ro-empty">That way isn't offered on this route anymore.</p>` };
    const leave = st.leave, start = leave ? leave.time : null;
    const tm = at => start == null ? (at === 0 ? "Now" : "+" + dur(at)) : clock(start + at);
    const legs = o.legs.map((l, i) => `<div class="ro-leg" style="color:${l.color}"><div class="ro-rail"><i></i>${i < o.legs.length - 1 ? "<u></u>" : ""}</div><div><div class="ro-st">${esc(l.name)}</div><div class="ro-sb">${esc(l.sub)}</div></div><div class="ro-tm">${tm(l.at)}</div></div>`).join("");
    const drive = mode === "car", dkey = [tok, mode, ...st.travelers, leave ? ordOf(leave) + ":" + leave.time : "now"].join("|");
    const av = (id, on) => { const s = sim(id); return `<button type="button" class="ro-av ${on ? "on" : ""}" data-ro="who:${esc(id)}" aria-pressed="${on}" aria-label="${esc(first(s.name))}${on ? ", going" : ""}"><span class="ro-c">${avatar(s)}</span>${esc(first(s.name))}</button>`; };
    const n = st.travelers.length, p = o.price;
    const totalTxt = p.unknown ? "In game" : money(p.total);
    const leaveTxt = leave ? `${dayLabel(leave)} · ${clockShort(leave.time)}` : "Now";
    return { title:`${o.t} to ${tp.name}`, back:[H("to/" + tok), "Routes"], map:{ a:fp.world, b:tp.world, hi:o.hi, extra:o.extra, key:fp.tok + ">" + tok + ">" + mode }, body:`<div class="ro-legs">${legs}</div>
      <h3 class="ro-sec">Who's going</h3>
      <div class="ro-whow"><button type="button" class="ro-arrow ro-prev" data-scroll="-1" aria-label="Scroll left" hidden>‹</button><div class="ro-who">${st.travelers.map(id => av(id, true)).join("")}<button type="button" class="ro-av add" data-ro="addwho" aria-label="Add Sims"><span class="ro-c">+</span>Add</button></div><button type="button" class="ro-arrow ro-next" data-scroll="1" aria-label="Scroll right" hidden>›</button></div>
      ${o.classes ? `<div class="ro-seg" role="group" aria-label="Class"><button type="button" class="${st.cls === "economy" ? "on" : ""}" data-ro="cls:economy" aria-pressed="${st.cls === "economy"}">Economy</button><button type="button" class="${st.cls === "first" ? "on" : ""}" data-ro="cls:first" aria-pressed="${st.cls === "first"}">First class</button></div>` : ""}
      <div class="ro-group">${row({ t:"Leave", v:`<span class="ro-v1">${esc(leaveTxt)}</span>`, act:"leave" })}${drive ? "" : `<div class="ro-row"><span class="ro-tx"><span class="ro-t">Add to Calendar</span></span><button type="button" class="ro-tog ${st.addCal ? "on" : ""}" role="switch" aria-checked="${st.addCal}" aria-label="Add to Calendar" data-ro="cal"><i></i></button></div>`}</div>
      ${st.err ? `<p class="ro-foot ro-err" role="alert">${esc(st.err)}</p>` : ""}
      ${p.unknown ? `<p class="ro-foot">SimNation sets this price in game.</p>` : drive ? `<p class="ro-foot">Roam compares what it costs. You drive in game, so there is nothing to book.</p>` : ""}`,
      bar:`<div class="ro-bar"><div><div class="ro-a">${totalTxt}${p.est && !p.unknown ? " " + EST : ""}</div><div class="ro-bs">${n ? `${n} traveler${n === 1 ? "" : "s"}` : "Pick who's going"}${o.classes ? " · " + (st.cls === "first" ? "First class" : "Economy") : ""}${drive ? " · Gas" : ""}</div></div>${drive
        ? `<button type="button" class="ro-btn" data-ro="drive:${esc(tok)}" ${n && st.driven !== dkey ? "" : "disabled"}>${st.driven === dkey ? "Added" : "Add to Calendar"}</button>`
        : `<button type="button" class="ro-btn" data-ro="book:${esc(tok)}:${mode}" ${n ? "" : "disabled"}>Book trip</button>`}</div>` };
  }
  function booked() {
    const b = st.booked; if (!b) return { body:`<p class="ro-empty">Nothing booked right now.</p><div class="ro-group">${row({ t:"Plan a trip", href:H("search"), cls:"accent" })}</div>` };
    const code = w => { const x = T().world(w); return (x && x.ticket_code) || (x ? x.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() : "---"); };
    return { body:`<div class="ro-done"><span class="ro-ck" aria-hidden="true">✓</span><h2>You're booked</h2><p>${esc(names(b.travelers))} ${b.travelers.length === 1 ? "leaves" : "leave"} for ${esc(b.toName)} ${b.leave ? "on " + esc(dayLabel(b.leave)) : "now"}.</p></div>
      <div class="ro-ticket"><div class="ro-ttop" style="background:${b.color}"><b>${esc(b.line)}${b.classes ? " · " + (b.cls === "first" ? "First class" : "Economy") : ""}</b><span>${esc(b.leave ? dayLabel(b.leave) : dayLabel(today()))}</span></div>
        <div class="ro-trt"><div><div class="ro-tc">${esc(code(b.a))}</div><div class="ro-tn">${esc(b.fromName)}</div></div><div class="ro-arr" aria-hidden="true">→</div><div style="text-align:right"><div class="ro-tc">${esc(code(b.b))}</div><div class="ro-tn">${esc(b.toName)}</div></div></div>
        <div class="ro-tgrid"><div>Leaves<b>${esc(b.leaveTime)}</b></div><div>Arrives<b>${esc(b.arriveTime)}</b></div><div>Travelers<b>${esc(names(b.travelers))}</b></div><div>Total<b>${b.total}${b.est ? " " + EST : ""}</b></div></div>
        <div class="ro-perf"></div><div class="ro-code"><span>Confirmation</span><b>${esc(b.code)}</b></div></div>
      ${b.calendar ? `<p class="ro-incal">${I.cal}<span>Added to Calendar for ${esc(dayLabel(b.leave || today()))}</span></p>` : ""}
      ${b.ticket ? `<p class="ro-foot" style="text-align:center">The ticket is in Passes until the trip.</p>` : ""}
      <div class="ro-endbtns"><a class="ro-btn" href="${H("")}">Done</a><a class="ro-btn plain" href="${H("search")}">Plan another trip</a></div>` };
  }
  /* fake but steady QR pattern for a pass (decoration only) */
  function qr(seed) {
    let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    const N = 25, on = (x, y) => { const f = (ox, oy) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7 && (x === ox || x === ox + 6 || y === oy || y === oy + 6 || (x >= ox + 2 && x <= ox + 4 && y >= oy + 2 && y <= oy + 4)); if (f(0, 0) || f(18, 0) || f(0, 18)) return true; if ((x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16)) return false; return rnd() > .52; };
    let r = ""; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (on(x, y)) r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    return `<svg viewBox="0 0 25 25" width="132" height="132" shape-rendering="crispEdges" fill="#000" aria-hidden="true">${r}</svg>`;
  }
  function passes() {
    const list = GFB.roam.all().filter(p => (p.kind === "ticket" ? p.valid_until && ordOf(p.valid_until) >= ordOf(today()) : activeOn(p)));
    list.sort((a, b) => (a.kind === "ticket" ? 0 : 1) - (b.kind === "ticket" ? 0 : 1) || String(a.created_at).localeCompare(String(b.created_at)));
    const open = list.find(p => p.id === st.passOpen) || list[list.length - 1];
    const days = p => p.trip && p.trip.days, short = d => `${d.season} ${d.day}`;
    const hf = p => p.kind === "ticket" ? `<small>${esc(dayLabel(p.valid_until).toUpperCase())}</small>To ${esc(p.trip && p.trip.toName || "")}` : p.kind === "rides" ? `<small>RIDES LEFT</small>${p.rides_left}` : days(p) && p.valid_until ? `<small>RUNS OUT</small>${esc(short(p.valid_until))}` : `<small>RIDES</small>Unlimited`;
    const sub = p => p.kind === "ticket" ? (p.trip && p.trip.mode === "ferry_boat" ? "Ferry ticket" : "Train ticket") : BRANDS[p.brand] && BRANDS[p.brand].sub || "";
    const card = p => { const B = BRANDS[p.brand] || BRANDS.llama, s = sim(p.sim_id), isOpen = p === open;
      const head = `<div class="ro-wh">${mark(p.brand)}<span class="ro-wn">${esc(B.name)}${sub(p) ? `<small class="ro-ag">${esc(sub(p))}</small>` : ""}</span><span class="ro-hf">${hf(p)}</span></div>`;
      if (!isOpen) return `<button type="button" class="ro-wp strip" style="--c:${B.c}" data-ro="pass:${esc(p.id)}" aria-label="${esc(B.name)} ${esc(p.title || "")}">${head}</button>`;
      const riders = p.kind === "ticket" ? (p.trip.travelers || []).map(id => sim(id)).filter(Boolean) : [s].filter(Boolean);
      return `<div class="ro-wp full" style="--c:${B.c}">${head}
        <div class="ro-pf1"><small>${esc(p.kind === "ticket" ? (p.trip.cls === "first" ? "FIRST CLASS" : "ECONOMY") : p.kind === "rides" ? "RIDE PASS" : days(p) ? p.trip.days + " DAY PASS · " + String(p.trip.age || "adult").toUpperCase() : "MONTHLY PASS")}</small>${esc(p.title || "")}</div>
        <div class="ro-sf"><div><small>${riders.length > 1 ? "RIDERS" : "RIDER"}</small>${riders.map(r => `<span class="ro-rid">${avatar(r)}${esc(stripNick(r.name))}</span>`).join("")}</div><div style="text-align:right"><small>${p.kind === "ticket" ? "LEAVES" : "VALID UNTIL"}</small>${p.kind === "ticket" ? esc(p.trip.leaveTime || "") : p.valid_until ? esc(dayLabel(p.valid_until)) : "No end date"}</div></div>
        <div class="ro-qr">${qr(p.id)}<span>${p.kind === "ticket" ? "Confirmation " + esc(p.trip.code || "") : esc(B.gate)}</span></div></div>`; };
    return { title:"", back:[H(""), "Roam"], right:`<button type="button" class="ro-navbtn" data-ro="buy">Buy a pass</button>`, body:`<h1 class="ro-wlt">Passes</h1>
      ${list.length ? `<div class="ro-stack">${list.map(card).join("")}</div>
        <div class="ro-group" style="margin-top:20px">${open && open.kind === "rides" ? row({ t:"Use a ride", act:"ride:" + open.id, cls:"accent" }) : ""}${open ? row({ t:open.kind === "ticket" ? "Remove ticket" : "Remove pass", act:"rmpass:" + open.id, cls:"danger" }) : ""}</div>
        <p class="ro-foot">Passes stay until they run out. Tickets stay until the trip.</p>`
        : `<p class="ro-empty">No passes yet. Add one when a Sim buys it in game.</p><button type="button" class="ro-btn" data-ro="buy">Buy a pass</button>`}` };
  }

  /* ---------- draw ---------- */
  function draw() {
    const [a, b, c] = path, wide = isWide();
    let screen = "explore", pg = null;
    if (a === "search") screen = "search";
    else if (a === "from") screen = "from";
    else if (a === "to" && b && c) { screen = "trip"; pg = trip(b, c); }
    else if (a === "to" && b) { screen = "directions"; pg = { title:"Directions", back:[H(""), "Back"], ...directions(b) }; }
    else if (a === "booked") { screen = "booked"; pg = booked(); }
    else if (a === "passes") { screen = "passes"; pg = passes(); }
    const sheetBody = screen === "explore" ? explore() : screen === "search" ? search(false) : screen === "from" ? search(true) : null;
    const full = !!pg;
    const nav = pg && (pg.back || pg.right || pg.title) ? `<div class="ro-nav">${pg.back ? `<a class="ro-back" href="${pg.back[0]}"><span aria-hidden="true">‹</span> ${esc(pg.back[1])}</a>` : "<span></span>"}<b class="ro-ttl">${esc(pg.title || "")}</b>${pg.right || "<span></span>"}</div>` : "";
    const panel = full ? `${nav}<div class="ro-body">${pg.body}</div>${pg.bar || ""}` : `<div class="ro-grab" aria-hidden="true"></div><div class="ro-body">${sheetBody}</div>`;
    root.innerHTML = `<div class="site-ro ro-${screen} ${full ? "is-full" : "is-sheet"}">
      ${!full || wide ? `<div class="ro-map ro-bigmap" role="img" aria-label="Map"></div>` : ""}
      <section class="ro-panel" aria-label="Roam">${panel}</section></div>`;
    const mapO = pg && pg.map;
    const bm = root.querySelector(".ro-bigmap"); if (bm) mapEvents(bm);
    if (!full || wide) mapFor(screen === "explore" || screen === "search" || screen === "from" || screen === "passes" ? "explore" : "route", mapO);
    else if (mapO) { const el = root.querySelector(".ro-strip"); if (el) { const w = el.clientWidth || 340, h = el.clientHeight || 150, vb = M().fit([mapO.a, mapO.b], w, h, 28, 60); el.innerHTML = M().svg(vb, w / vb[2], { hi:mapO.hi, extra:mapO.extra, pins:[mapO.a], dests:[mapO.b], labels:[mapO.a, mapO.b], smallAt:99 }); } }
    if (screen === "search" || screen === "from") { const q = root.querySelector("#ro-q"); if (q && matchMedia("(pointer:fine)").matches) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
    wireArrows();
    st.err = null;
  }
  /* wide screens with a mouse get arrows on horizontal rows (SOP: no row that can't be scrolled with a mouse) */
  function wireArrows() {
    root.querySelectorAll(".ro-whow").forEach(w => { const row = w.querySelector(".ro-who"), p = w.querySelector(".ro-prev"), n = w.querySelector(".ro-next");
      const upd = () => { p.hidden = row.scrollLeft < 4; n.hidden = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4; };
      row.addEventListener("scroll", upd, { passive:true }); upd(); setTimeout(upd, 120);
      w.querySelectorAll("[data-scroll]").forEach(b => b.addEventListener("click", () => row.scrollBy({ left:+b.dataset.scroll * 220, behavior:"smooth" }))); });
  }

  /* ---------- actions ---------- */
  /* type to search the Sims; before typing it shows Sims you picked lately. multi: tick several and press Done; single: one tap picks. */
  function pickSims({ title, multi, sel = [], done }) {
    const picked = new Set(sel), byName = (x, y) => stripNick(x.name).localeCompare(stripNick(y.name));
    const line = s => `<button type="button" class="ro-row" data-pick="${esc(s.id)}" aria-pressed="${picked.has(s.id)}"><span class="ro-pav">${avatar(s)}</span><span class="ro-tx"><span class="ro-t">${esc(stripNick(s.name))}</span>${s.residence ? `<span class="ro-s">${esc(s.residence)}</span>` : ""}</span>${picked.has(s.id) ? `<span class="ro-check" aria-hidden="true">✓</span>` : ""}</button>`;
    const list = q => { q = q.trim().toLowerCase();
      if (!q) { const rc = LS.get("roam-travelers-v1", []).map(sim).filter(Boolean); return rc.length ? `<h3 class="ro-sec">Recent</h3><div class="ro-group">${rc.map(line).join("")}</div>` : `<p class="ro-empty">Type a name to find a Sim.</p>`; }
      const hits = data.sims.filter(s => stripNick(s.name).toLowerCase().includes(q)).sort(byName).slice(0, 30);
      return hits.length ? `<div class="ro-group">${hits.map(line).join("")}</div>` : `<p class="ro-empty">No Sims match “${esc(q)}”.</p>`; };
    const s = UI.sheet({ title, left:"Cancel", right:multi ? "Done" : "", theme:SHEET_THEME,
      body:`<label class="ro-search on" style="margin-bottom:12px">${I.mag}<input type="search" id="ro-whoq" placeholder="Type a name" autocomplete="off" aria-label="Search Sims"></label><div id="ro-wholist">${list("")}</div>`,
      onRight:close => { close("done"); done([...picked]); } });
    s.el.classList.add("ro-sheet");
    const q = s.body.querySelector("#ro-whoq"), box = s.body.querySelector("#ro-wholist");
    s.body.addEventListener("input", e => { if (e.target === q) box.innerHTML = list(q.value); });
    s.body.addEventListener("click", e => { const b = e.target.closest("[data-pick]"); if (!b) return; const id = b.dataset.pick;
      if (!multi) { s.close("pick"); return done([id]); }
      picked.has(id) ? picked.delete(id) : picked.add(id); box.innerHTML = list(q.value); });
    if (!matchMedia("(pointer:fine)").matches) setTimeout(() => q.focus(), 60);
  }
  function whoSheet() {
    pickSims({ title:"Who's going", multi:true, sel:st.travelers, done:ids => { st.travelers = ids; LS.set("roam-travelers-v1", [...new Set([...ids, ...LS.get("roam-travelers-v1", [])])].slice(0, 12)); draw(); } });
  }
  function leaveSheet() {
    const cur = st.leave || { ...today(), time:9 * 60 }, seasons = cal().seasons.map(x => x.name);
    const times = []; for (let m = 5 * 60; m <= 23 * 60 + 30; m += 30) times.push(m);
    const s = UI.sheet({ title:"Leave", left:"Cancel", right:"Done", theme:SHEET_THEME, body:`
      <div class="ro-seg" role="group" aria-label="When"><button type="button" data-when="now" class="${st.leave ? "" : "on"}">Now</button><button type="button" data-when="later" class="${st.leave ? "on" : ""}">A game date</button></div>
      <div class="ro-when" ${st.leave ? "" : "hidden"}><div class="ro-group">
        <label class="ro-row"><span class="ro-tx"><span class="ro-t">Date</span></span><select name="season" aria-label="Season">${seasons.map(x => `<option ${x === cur.season ? "selected" : ""}>${esc(x)}</option>`).join("")}</select><input name="day" type="number" min="1" max="21" inputmode="numeric" value="${cur.day}" aria-label="Day" style="width:64px"></label>
        <label class="ro-row"><span class="ro-tx"><span class="ro-t">Time</span></span><select name="time">${times.map(m => `<option value="${m}" ${m === cur.time ? "selected" : ""}>${clock(m)}</option>`).join("")}</select></label></div>
        <p class="ro-foot">Today is ${esc(dayLabel(today()))}.</p></div>`,
      onRight:close => { const later = s.body.querySelector("[data-when=later]").classList.contains("on"), g = n => s.body.querySelector(`[name=${n}]`).value;
        let lv = null; if (later) { lv = { season:g("season"), day:Math.min(21, Math.max(1, +g("day") || 1)), year:today().year, time:+g("time") }; if (ordOf(lv) < ordOf(today())) lv.year++; } st.leave = lv; close("done"); draw(); } });
    s.el.classList.add("ro-sheet");
    s.body.addEventListener("click", e => { const b = e.target.closest("[data-when]"); if (!b) return; s.body.querySelectorAll("[data-when]").forEach(x => x.classList.toggle("on", x === b)); s.body.querySelector(".ro-when").hidden = b.dataset.when === "now"; });
  }
  /* SimNation sells 7, 14 and 28 day passes by age group, and they start the day you buy. Prices are paid in game. */
  function buySheet() {
    let brand = "metro", days = 7, age = "adult", rider = st.travelers[0] || null;
    const t = today(), end = n => fromOrd(ordOf(t) + n);
    const seg = (k, items, cur, label, top) => `<div class="ro-seg" role="group" aria-label="${label}"${top ? ' style="margin-top:12px"' : ""}>${items.map(([v, l]) => `<button type="button" data-${k}="${v}" class="${String(cur) === String(v) ? "on" : ""}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</div>`;
    const body = () => `${seg("b", [["metro", "Baymore Metro"], ["baylink", "BayLink"]], brand, "Line")}${seg("d", [[7, "7 days"], [14, "14 days"], [28, "28 days"]], days, "Length", 1)}${seg("a", [["youth", "Youth"], ["adult", "Adult"]], age, "Age group", 1)}
      <div class="ro-group" style="margin-top:12px">
        <button type="button" class="ro-row" data-rider="1"><span class="ro-tx"><span class="ro-t">Rider</span></span><span class="ro-v1">${rider && sim(rider) ? esc(stripNick(sim(rider).name)) : "Choose"}</span><span class="ro-chev" aria-hidden="true">›</span></button>
        ${row({ t:"Starts", s:"Today in your game", v:`<span class="ro-v1">${esc(dayLabel(t))}</span>` })}
        ${row({ t:"Runs out", v:`<span class="ro-v1">${esc(dayLabel(end(days)))}</span>` })}</div>
      <p class="ro-foot">${brand === "metro" ? "Covers the subway and buses." : "Covers BayLink trains."} Prices are paid in game.</p><p class="ro-foot ro-err" hidden></p>`;
    const s = UI.sheet({ title:"Buy a pass", left:"Cancel", right:"Add", theme:SHEET_THEME, body:body(),
      onRight:async close => { const err = s.body.querySelector(".ro-err"); if (!rider) { err.hidden = false; err.textContent = "Choose who the pass is for."; return; }
        await GFB.roam.save({ sim_id:rider, brand, kind:"monthly", title:`${days} day pass`, covers:brand === "metro" ? ["subway", "transit"] : ["subway", "train"], valid_until:end(days), rides_left:null, trip:{ days, age } });
        close("add"); draw(); } });
    s.el.classList.add("ro-sheet");
    s.body.addEventListener("click", e => {
      const b = e.target.closest("[data-b],[data-d],[data-a],[data-rider]"); if (!b) return;
      if (b.dataset.b) brand = b.dataset.b; else if (b.dataset.d) days = +b.dataset.d; else if (b.dataset.a) age = b.dataset.a;
      else { pickSims({ title:"Rider", multi:false, sel:rider ? [rider] : [], done:ids => { rider = ids[0]; s.body.innerHTML = body(); } }); return; }
      s.body.innerHTML = body();
    });
  }
  /* driving your own car has nothing to book: it only goes on the Calendar */
  async function driveAdd(tok, btn) {
    const fp = place(fromTok()), tp = place(tok), pl = plan(fp, tp, st.travelers, st.cls, st.leave), o = pl.opts && pl.opts.find(x => x.mode === "car");
    if (!o || !st.travelers.length) return; btn.disabled = true;
    const lv = st.leave, d = lv || today(), leaveTime = lv ? clock(lv.time) : "Now", arrive = lv ? clock(lv.time + o.minutes) : "in " + dur(o.minutes);
    try { await GFB.saveEvent({ season:d.season, day:d.day, year:d.year, title:`${names(st.travelers)} drive to ${tp.name}`, cat:"gameplay", sims:st.travelers,
        details:`Roam: Drive, ${fp.name} ${leaveTime} to ${tp.name} ${arrive}. Gas ${o.price.unknown ? "in game" : money(o.price.total)}${o.price.est ? " est." : ""}.` });
      st.driven = [tok, "car", ...st.travelers, lv ? ordOf(lv) + ":" + lv.time : "now"].join("|"); draw();
    } catch (err) { st.err = "Couldn't add that: " + err.message; draw(); }
  }
  const CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  async function book(tok, mode, btn) {
    const fp = place(fromTok()), tp = place(tok), pl = plan(fp, tp, st.travelers, st.cls, st.leave), o = pl.opts && pl.opts.find(x => x.mode === mode);
    if (!o || !st.travelers.length) return;
    btn.disabled = true;
    const code = Array.from({ length:6 }, () => CODE[Math.floor(Math.random() * CODE.length)]).join("");
    const lv = st.leave, line = o.hi.length ? M().LINES[o.hi[o.hi.length - 1]] : null;
    const leaveTime = lv ? clock(lv.time) : "Now", arriveTime = lv ? (lv.time + o.minutes >= 1440 ? dayLabel(fromOrd(ordOf(lv) + Math.floor((lv.time + o.minutes) / 1440))) + " · " : "") + clock(lv.time + o.minutes) : "In " + dur(o.minutes);
    const total = o.price.unknown ? "In game" : money(o.price.total);
    const b = { travelers:[...st.travelers], a:pl.a, b:pl.b, fromName:o.legs[0].name, toName:tp.name, leave:lv, leaveTime, arriveTime, total, est:o.price.est && !o.price.unknown, code,
      line:line ? line.name : o.t, color:line ? line.color : "#2a1745", classes:o.classes, cls:st.cls, mode, ticket:false, calendar:false };
    try {
      /* train and ferry tickets wait in Passes until the trip */
      if (o.ticket) { await GFB.roam.save({ sim_id:b.travelers[0], brand:line ? line.brand : (mode === "ferry_boat" ? "ferry" : "rail"), kind:"ticket", title:`${o.t} to ${tp.name}`, valid_until:lv ? { season:lv.season, day:lv.day, year:lv.year } : today(), rides_left:null, covers:[],
        trip:{ from:fp.tok, to:tok, toName:tp.name, fromName:b.fromName, mode, cls:st.cls, code, leaveTime, arriveTime, travelers:b.travelers } }); b.ticket = true; }
      /* ride passes lose a ride for each Sim riding on one */
      for (const id of o.price.covered || []) { const p = GFB.roam.all().find(x => x.id === (passFor(id, [o.price.pass.brand], mode, lv) || {}).id); if (p && p.kind === "rides") await GFB.roam.save({ id:p.id, rides_left:Math.max(0, (p.rides_left || 0) - 1) }); }
      if (st.addCal) { const d = lv || today();
        await GFB.saveEvent({ season:d.season, day:d.day, year:d.year, title:`${names(b.travelers)} to ${tp.name}`, cat:"gameplay", sims:b.travelers,
          details:`Roam: ${o.t}${line ? " (" + line.name + ")" : ""}, ${b.fromName} ${leaveTime} to ${tp.name} ${arriveTime}. ${total}${b.est ? " est." : ""}. Confirmation ${code}.` }); b.calendar = true; }
      const rec = LS.get("roam-recent-v1", []).filter(r => r.tok !== tok); rec.unshift({ tok, mode }); LS.set("roam-recent-v1", rec.slice(0, 8));
      st.booked = b; location.hash = H("booked");
    } catch (err) { st.err = "Couldn't book that: " + err.message; btn.disabled = false; draw(); }
  }

  /* map: drag to move, pinch or scroll to zoom, tap a city to go there */
  let drag = null, wheelT = null;
  function mapEvents(el) {
    const pts = new Map();
    el.addEventListener("pointerdown", e => { if (!st.view) return; pts.set(e.pointerId, [e.clientX, e.clientY]); el.setPointerCapture(e.pointerId); drag = { x:e.clientX, y:e.clientY, moved:false, vb:[...st.view], d0:null }; });
    el.addEventListener("pointermove", e => {
      if (!drag || !pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      const k = el.clientWidth / st.view[2], svg = el.querySelector("svg"); if (!svg) return;
      if (pts.size === 2) { const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (!drag.d0) { drag.d0 = d; drag.vb = [...st.view]; } zoomTo(el, drag.vb, drag.d0 / d, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); drag.moved = true; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      st.view = [drag.vb[0] - dx / k, drag.vb[1] - dy / k, drag.vb[2], drag.vb[3]]; svg.setAttribute("viewBox", st.view.join(" "));
    });
    const end = e => { pts.delete(e.pointerId); if (!drag) return; const was = drag; if (!pts.size) { drag = null; if (was.moved) paintMap(); else tapCity(el, e); } };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", e => { if (!st.view) return; e.preventDefault(); zoomTo(el, st.view, Math.exp(e.deltaY * .002), e.clientX, e.clientY); clearTimeout(wheelT); wheelT = setTimeout(paintMap, 140); }, { passive:false });
  }
  function zoomTo(el, vb, f, cx, cy) {
    const r = el.getBoundingClientRect(), k = r.width / vb[2], mx = vb[0] + (cx - r.left) / k, my = vb[1] + (cy - r.top) / k;
    const w = Math.min(900, Math.max(30, vb[2] * f)), s = w / vb[2];
    st.view = [mx - (mx - vb[0]) * s, my - (my - vb[1]) * s, w, vb[3] * s];
    const svg = el.querySelector("svg"); if (svg) svg.setAttribute("viewBox", st.view.join(" "));
  }
  function tapCity(el, e) {
    const r = el.getBoundingClientRect(), k = r.width / st.view[2], x = st.view[0] + (e.clientX - r.left) / k, y = st.view[1] + (e.clientY - r.top) / k;
    let best = null, bd = 22 / k; Object.entries(M().AT).forEach(([id, [cx, cy]]) => { const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = +id; } });
    if (best == null) return;
    if (path[0] === "from") { setFrom(worldTok(best)); location.hash = H(""); return; }
    if (worldTok(best) === fromTok()) return;
    location.hash = H("to/" + worldTok(best));
  }

  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-ro");
    document.addEventListener("input", e => { if (!mine(e.target) || e.target.id !== "ro-q") return; st.q = e.target.value; const box = root.querySelector("#ro-res"), tmp = document.createElement("div"); tmp.innerHTML = search(path[0] === "from"); if (box) box.innerHTML = tmp.querySelector("#ro-res").innerHTML; });
    document.addEventListener("keydown", e => { if (!mine(e.target) || e.target.id !== "ro-q" || e.key !== "Enter") return; const f = root.querySelector("#ro-res [data-ro]"); if (f) f.click(); });
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const b = e.target.closest("[data-ro]"); if (!b || b.disabled) return;
      const [k, x, y] = b.dataset.ro.split(":");
      if (k === "to") { st.q = ""; location.hash = H("to/" + x); return; }
      if (k === "from") { st.q = ""; setFrom(x); const last = LS.get("roam-last-to", null); location.hash = last && last !== x ? H("to/" + last) : H(""); return; }
      if (k === "swap") { const f = fromTok(); setFrom(x); location.hash = H("to/" + f); return; }
      if (k === "sort") { st.sort = x; return draw(); }
      if (k === "cls") { st.cls = x; return draw(); }
      if (k === "cal") { st.addCal = !st.addCal; return draw(); }
      if (k === "who") { st.travelers = st.travelers.includes(x) ? st.travelers.filter(i => i !== x) : [...st.travelers, x]; if (st.travelers.includes(x)) LS.set("roam-travelers-v1", [...new Set([x, ...LS.get("roam-travelers-v1", [])])].slice(0, 12)); return draw(); }
      if (k === "addwho") return whoSheet();
      if (k === "leave") return leaveSheet();
      if (k === "book") return book(x, y, b);
      if (k === "drive") return driveAdd(x, b);
      if (k === "pass") { st.passOpen = x; return draw(); }
      if (k === "buy") return buySheet();
      if (k === "ride") { const p = GFB.roam.get(x); if (p) await GFB.roam.save({ id:p.id, rides_left:Math.max(0, (p.rides_left || 0) - 1) }); return draw(); }
      if (k === "rmpass") { if (!UI.confirmTap(b.querySelector(".ro-t"), "Tap again to remove")) return; await GFB.roam.remove(x); st.passOpen = null; return draw(); }
    });
    try { new ResizeObserver(() => { if (root && root.querySelector(".site-ro")) { const w = root.clientWidth > 700; if (w !== bind.wide) { bind.wide = w; draw(); } } }).observe(root); } catch {}
  }

  /* expired tickets and used-up passes leave on their own */
  async function tidy() {
    const t = ordOf(today());
    for (const p of GFB.roam.all().slice()) { const gone = p.kind === "ticket" ? (p.valid_until && ordOf(p.valid_until) < t) : !activeOn(p); if (gone) await GFB.roam.remove(p.id); }
  }

  function render(el, d, parts) {
    root = el; data = d; path = (parts || []).map(decodeURIComponent);
    if (path[0] === "to" && path[1]) LS.set("roam-last-to", path[1]);
    if (path[0] !== "search" && path[0] !== "from") st.q = "";
    bind(); bind.wide = isWide(); draw();
    if (path[0] === "passes") tidy().then(() => { if (path[0] === "passes") draw(); });
  }
  function address(parts) { const [a, b, c] = parts || []; if (a === "to" && b) { const p = place(b); return "/directions/" + (p ? p.name : b).toLowerCase().replace(/[^a-z0-9]+/g, "-") + (c ? "/" + c : ""); } return a ? "/" + a : "/"; }
  return { render, address, /* for Trippa: the ground route between two places (pass SimDesk data in case Roam hasn't opened yet) */
    plan:(f, t, n, d) => { if (d) data = d; if (!data) return null; const a = place(f), b = place(t); return a && b ? plan(a, b, n || [], "economy") : null; } };
})();
