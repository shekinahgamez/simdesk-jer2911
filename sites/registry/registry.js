/* The Registry. Reads and saves everything through GFB (assets/data.js).
   Three tabs (Profile, Connections, File). One "Edit file" mode makes the whole file editable, with one Save bar.
   Connections are one record per link in their own tables (GFB.registry); each Sim keeps their own label.
   Until the one-time move runs, connections show from the old list, read only, with a banner to check the counts and move. */
const Registry = (() => {
  const st = { view:"residents", cscope:"", q:"", filter:"All", where:"", sort:"name", tab:"profile", editing:false, draft:null, focus:null, openLink:null, sheet:null, hideSecrets:false,
    msg:"", err:false, move:null, batch:null, oldOpen:false, lists:false, busy:false, tl:{ filter:"all", add:null, edit:null } };
  let data = null, curId = null, root = null;

  const LIFE_STAGES = ["Infant","Toddler","Child","Teen","Young Adult","Adult","Elder"];
  const KINDS = [["rom","Romance"],["fam","Family"],["ex","Ex"],["friend","Friend"],["work","Work"]];
  const GROUPS = [["rom","Romance"],["fam","Family"],["ex","Exes"],["friend","Friends"],["work","Work"]];
  const HIST_SUGGEST = ["Met","Dating","Engaged","Married","Split","Divorced","Broke up","Got back together","Matched on Slide","Moved in","Best friends","Coworkers","Adopted"];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").trim();
  const initials = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0,2).join("").toUpperCase();
  const first = n => stripNick(n).split(" ")[0];
  /* imported careers use em dashes; show a comma instead (the same helper Share uses) */
  const NONE = "__none";
  const sentence = t => { t = String(t || ""); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ""; };
  const ageOf = s => s.age != null && s.age !== "" ? String(s.age) : sentence(s.life_stage);
  const dash = s => String(s || "").replace(/\s*[\u2014\u2013]\s*/g, ", ");
  const hue = s => { let h = 0; for (const c of String(s)) h = (h*31 + c.charCodeAt(0)) % 360; return h; };
  const avColor = name => `hsl(${215 + hue(name)%30 - 15} 22% ${32 + hue(name)%14}%)`;
  const avSq = (name, photo) => photo ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async">` : `<span style="background:${avColor(name)}">${esc(initials(name))}</span>`;
  const money = n => n == null || n === "" ? null : "$" + Number(n).toLocaleString("en-US");
  const simById = id => data.sims.find(s => s.id === id);
  const findSim = txt => { const t = String(txt || "").trim().toLowerCase(); if (!t) return null; return data.sims.find(x => x.name.toLowerCase() === t || stripNick(x.name).toLowerCase() === t); };
  const R = () => GFB.registry;
  const linksFor = id => R().linksOf(id);
  const PREF_KEYS = [["likes","Likes"],["dislikes","Dislikes"],["turn_ons","Turn ons"],["turn_offs","Turn offs"]];
  const LIST_KEYS = [...PREF_KEYS, ["traits","Traits"],["aspiration","Aspirations"]];
  const used = field => [...new Set(data.sims.flatMap(x => Array.isArray(x[field]) ? x[field] : [x[field]]).filter(Boolean))].sort();
  const menu = key => [...new Set([...(data.options[key] || []), ...used(key)])].sort((a,b) => a.localeCompare(b));
  const attrOpts = key => [...new Set(["Opposite sex", "Same sex", "Both", ...((data.tossup && data.tossup.decks) || []).filter(d => d.registry === key).flatMap(d => (d.outcomes || []).map(o => o.label))])];
  const pron = s => /^m/i.test(s.gender || "") ? "he" : /^f/i.test(s.gender || "") ? "she" : "they";
  const cal = () => data.calendar;
  const gLabel = d => d && typeof d === "object" ? (d.before ? "Before the save started" : `${d.season}, day ${d.day}, Year ${d.year}`) : "";
  const gShort = d => d && typeof d === "object" ? (d.before ? "Before save" : `${d.season} ${d.day}, Y${d.year}`) : "No date";

  /* ---------- property and status ---------- */
  const RESIDENTIAL = ["Apartment","Residential","Residential Rental"];
  const lots = () => data.lots || [];
  const homeOf = s => GFB.homeOf(s, data);
  const statusOf = s => GFB.statusOf(s, data);
  const ownedBy = s => lots().filter(l => (l.owner_sim && l.owner_sim === s.id) || (!l.owner_sim && l.owner && l.owner === stripNick(s.name)));
  const lotLabel = l => { const p = l.parent_id ? lots().find(x => x.id === l.parent_id) : null; const d = l.district || (p || {}).district; return l.address + (d ? ", " + d : ""); };
  const households = () => [...new Set([...(data.households || []).map(h => h.name), ...data.sims.map(x => x.household), ...lots().map(l => l.household)].filter(Boolean))].sort((a, b) => a.localeCompare(b));

  /* activity, read only here */
  const calEvents = s => ((data.calendar || {}).events || []).filter(e => (e.sims || []).includes(s.id));
  const calLogs = s => ((data.calendar || {}).logs || []).filter(l => (l.sims || []).includes(s.id)).sort((a,b) => b.year - a.year);
  const seasonOrder = n => ((data.calendar || {}).seasons || []).findIndex(x => x.name === n);
  const calLink = (season, day) => `#/calendar/${season}/${season}/${day}`;
  const plans = s => (data.todos || []).filter(t => t.app === "plumb" && (t.sims || []).includes(s.id)).sort((a,b) => a.done - b.done);
  const postsBy = s => (data.posts || []).filter(p => String(p.author || "").split("~")[0] === s.id);
  const orgsOf = s => (data.organizations || []).filter(o => (o.members || []).some(m => m.current !== false && ((m.sim === s.id) || (!m.sim && m.name && stripNick(m.name).toLowerCase() === stripNick(s.name).toLowerCase()))));

  /* the Incomplete filter (status is never a gap now) */
  function gaps(s){
    const g = [], open = 5 - (s.traits || []).length;
    if (open > 0) g.push("traits");
    if (!s.aspiration) g.push("aspiration");
    if (!s.love_language) g.push("love_language");
    if (!s.attachment) g.push("attachment");
    if (!s.simsta) g.push("simsta");
    if (!s.household) g.push("household");
    return g;
  }

  /* ---------- gallery ---------- */
  const places = () => [...new Set(data.sims.map(s => s.residence).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  function visible(){
    const q = st.q.toLowerCase(), batch = st.batch ? new Set(st.batch.ids) : null;
    return data.sims.filter(s => {
      if (batch && !batch.has(s.id)) return false;
      if (st.filter === "Incomplete" && !gaps(s).length) return false;
      if (["Housed","Homeless","Townie"].includes(st.filter) && statusOf(s) !== st.filter) return false;
      if (st.where === NONE ? !!s.residence : (st.where && s.residence !== st.where)) return false;
      if (!q) return true;
      return [s.name, s.career, s.residence, s.household, ...(s.traits||[]), s.attachment, s.love_language].join(" ").toLowerCase().includes(q);
    });
  }
  const SORTS = [["name","Name"],["file","File number"],["gaps","Most to fill in"],["status","Status"]];
  function sortedVisible(){
    const v = [...visible()], nm = (a, b) => stripNick(a.name).localeCompare(stripNick(b.name));
    if (st.sort === "file") v.sort((a, b) => (parseInt(a.file_no, 10) || 0) - (parseInt(b.file_no, 10) || 0));
    else if (st.sort === "gaps") v.sort((a, b) => gaps(b).length - gaps(a).length || nm(a, b));
    else if (st.sort === "status") v.sort((a, b) => statusOf(a).localeCompare(statusOf(b)) || nm(a, b));
    else v.sort(nm);
    return v;
  }
  const pill = s => { const t = statusOf(s); return `<span class="rg-st ${ {Housed:"h",Homeless:"x",Townie:"t"}[t] }"><i></i>${t}</span>`; };
  const photoOf = s => s.portrait ? `<img loading="lazy" decoding="async" src="${esc(s.portrait)}" alt="">` : esc(initials(s.name));
  const meta = (s, town) => [ageOf(s), dash(s.career), town ? s.residence : ""].filter(Boolean).join(" · ");
  const personRow = s => `<a class="rg-li rg-person" href="#/registry/${s.id}"><span class="rg-idp">${photoOf(s)}</span><span class="t"><b>${esc(s.name)}</b><small>${esc(meta(s, true))}</small></span>${pill(s)}</a>`;
  const personCard = s => `<a class="rg-card" href="#/registry/${s.id}"><span class="rg-cph">${photoOf(s)}<span class="rg-fno">GFB-${esc(s.file_no)}</span>${pill(s)}</span><span class="rg-cb"><b>${esc(s.name)}</b><small>${esc(meta(s, false))}</small></span></a>`;
  /* phone list (letter sections when sorted by name) and iPad grid; CSS shows the one that fits the width */
  function resultsHTML(){
    const v = sortedVisible();
    if (!v.length) return `<p class="rg-none">No residents match. Clear the search or pick another filter.</p>`;
    let list;
    if (st.sort !== "name") list = `<div class="rg-group">${v.map(personRow).join("")}</div>`;
    else {
      const by = new Map();
      v.forEach(x => { const c = (stripNick(x.name)[0] || "#").toUpperCase(), k = /[A-Z]/.test(c) ? c : "#"; if (!by.has(k)) by.set(k, []); by.get(k).push(x); });
      list = [...by].map(([k, a]) => `<p class="rg-letter">${k}</p><div class="rg-group">${a.map(personRow).join("")}</div>`).join("");
    }
    return `<div class="rg-listview">${list}</div><div class="rg-grid">${v.map(personCard).join("")}</div>`;
  }
  function pendingNames(){
    const filed = new Set(data.sims.map(s => s.name.toLowerCase()));
    return [...new Set([...R().all().filter(l => !l.b_sim && l.b_name && !l.secret).map(l => l.b_name), ...(data.pending || [])])].filter(n => !filed.has(String(n).toLowerCase())).sort();
  }
  /* towns with head counts, biggest first; people with no town sit last */
  function townCounts(){
    const c = new Map(); data.sims.forEach(x => { const k = x.residence || NONE; c.set(k, (c.get(k) || 0) + 1); });
    return [...c].filter(([k]) => k !== NONE).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).concat(c.has(NONE) ? [[NONE, c.get(NONE)]] : []);
  }
  const townName = k => k === NONE ? "No town yet" : k;
  const whereOptions = () => `<option value="">Everywhere (${data.sims.length})</option>${townCounts().map(([k, n]) => `<option value="${esc(k)}" ${k === st.where ? "selected" : ""}>${esc(townName(k))} (${n})</option>`).join("")}`;
  const sortOptions = () => SORTS.map(([k, n]) => `<option value="${k}" ${st.sort === k ? "selected" : ""}>${n}</option>`).join("");
  const sortName = () => (SORTS.find(x => x[0] === st.sort) || SORTS[0])[1];
  const viewSwitch = () => `<div class="rg-seg rg-viewseg" role="group" aria-label="View">${[["residents","Residents"],["census","Census"]].map(([k, n]) => `<button type="button" data-view="${k}" aria-pressed="${st.view === k}"><span>${n}</span></button>`).join("")}</div>`;
  const ICON_SEARCH = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const ICON_PLUS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

  /* The shared sheet lives on <body>, outside the Registry's palette, so hand it the colors it needs. */
  function sheetTheme(){
    const cs = getComputedStyle(root.querySelector(".site-registry") || root), t = {};
    ["--paper","--panel","--panel2","--ink","--muted","--faint","--rule","--rule2","--accent","--accentSoft","--onAccent","--stamp","--stampSoft","--sans","--mono","--r-box","--r-ctl","--r-photo"].forEach(k => { t[k] = cs.getPropertyValue(k); });
    return { ...t, "--ui-sheet-bg":t["--paper"], "--ui-sheet-fg":t["--ink"], "--ui-sheet-accent":t["--accent"], "--ui-accent":t["--accent"], "--ui-on-accent":t["--onAccent"], "--link":t["--accent"], "--navy":t["--accent"], "--secret":t["--stamp"], "--ui-edge":"16px" };
  }
  /* Phone: Where and Sort live behind the Filters button. */
  function openFilters(){
    const sh = UI.sheet({ title:"Filters", left:"", right:"Done", theme:sheetTheme(),
      body:`<div class="rg-sheetui"><label class="rg-flab" for="rg-fwhere">Where</label><select class="rg-input" id="rg-fwhere">${whereOptions()}</select>
        <label class="rg-flab" for="rg-fsort">Sort</label><select class="rg-input" id="rg-fsort">${sortOptions()}</select></div>` });
    const apply = () => { st.where = sh.el.querySelector("#rg-fwhere").value; st.sort = sh.el.querySelector("#rg-fsort").value; if (!curId) draw(); };
    sh.el.querySelector("#rg-fwhere").addEventListener("change", apply);
    sh.el.querySelector("#rg-fsort").addEventListener("change", apply);
  }
  /* New resident: the shared sheet, one full-width field and one filled button. */
  function openNew(){
    const sh = UI.sheet({ title:"New resident", left:"", right:"", theme:sheetTheme(),
      body:`<form class="rg-newform rg-sheetui" autocomplete="off"><label class="rg-flab" for="rg-newname">Full name</label>
        <input class="rg-input" id="rg-newname" name="name" placeholder="First and last name" required autocomplete="off" autocapitalize="words">
        <button class="rg-b pri big">Create resident</button><button type="button" class="rg-b big quiet" data-cancel style="min-height:44px;border-color:transparent">Cancel</button></form>` });
    const form = sh.el.querySelector("form");
    form.addEventListener("submit", e => { e.preventDefault(); const n = form.elements.name.value.trim(); if (!n) return; sh.close(); createSim(n); });
    form.querySelector("[data-cancel]").addEventListener("click", () => sh.close());
    if (matchMedia("(pointer:coarse)").matches) setTimeout(() => form.elements.name.focus(), 50);
  }
  function drawGallery(){
    if (st.view === "census") return drawCensus();
    const chip = (k, label, n) => `<button type="button" class="ui-chip ${st.filter === k ? "on" : ""}" data-filter="${k}" aria-pressed="${st.filter === k}"><span>${label}${n != null ? ` <small>${n}</small>` : ""}</span></button>`;
    const chev = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const filtered = !!st.where || st.sort !== "name";
    const pend = pendingNames(), towns = townCounts();
    const whereRows = [["", "Everywhere", data.sims.length], ...towns.map(([k, n]) => [k, townName(k), n])];
    root.innerHTML = `<div class="site-registry">${header()}
      <div class="rg-page">${moveBanner()}
        <div class="rg-bar">${viewSwitch()}
          <div class="rg-searchrow"><label class="rg-searchbox">${ICON_SEARCH}<input class="rg-search" id="rg-q" type="search" placeholder="Search a name" aria-label="Search residents" value="${esc(st.q)}" autocomplete="off"></label>
            <button type="button" class="rg-b rg-filterbtn" data-act="filters" aria-label="Filters" aria-pressed="${filtered}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
          <button type="button" class="rg-b pri rg-newbtn" data-act="new">${ICON_PLUS}New resident</button>
        </div>
        ${st.batch ? `<div class="rg-batch">Showing the ${st.batch.ids.length} Sims from your last import. <button class="rg-link" data-act="clearbatch">Show everyone</button></div>` : ""}
        ${st.msg ? `<p class="rg-msg ${st.err ? "err" : ""}" role="status">${esc(st.msg)}</p>` : ""}
        <div class="rg-cols">
          <div class="rg-main">
            <div class="rg-titlerow"><h2 class="rg-title">Residents</h2><label class="rg-sortlab">Sorted by <b>${esc(sortName().toLowerCase())}</b>${chev}<select id="rg-sort" aria-label="Sort">${sortOptions()}</select></label></div>
            <div class="ui-chips" role="group" aria-label="Show">${chip("All", "All", data.sims.length)}${chip("Housed", "Housed")}${chip("Homeless", "Homeless")}${chip("Townie", "Townies")}${chip("Incomplete", "Incomplete")}</div>
            <div class="ui-chips rg-wherechips" role="group" aria-label="Where">${whereRows.map(([k, n, c]) => `<button type="button" class="ui-chip ${st.where === k ? "on" : ""}" data-where="${esc(k)}" aria-pressed="${st.where === k}"><span>${esc(n)} <small>${c}</small></span></button>`).join("")}</div>
            <div id="rg-results">${resultsHTML()}</div>
          </div>
          <aside class="rg-side">
            <section class="rg-wheresec"><p class="rg-shd">Where</p><div class="rg-group">${whereRows.map(([k, n, c]) => `<button type="button" class="rg-li" data-where="${esc(k)}" aria-pressed="${st.where === k}"><span class="t">${esc(n)}</span><span class="v">${c}</span><span class="rg-tick" aria-hidden="true">${st.where === k ? "✓" : ""}</span></button>`).join("")}</div></section>
            ${pend.length ? `<section><p class="rg-shd">Awaiting a file</p><div class="rg-group">${pend.map(n => `<button type="button" class="rg-li" data-file="${esc(n)}"><span class="t">${esc(n)}</span><span class="rg-ofile" data-confirm>Open file</span></button>`).join("")}</div><p class="rg-foot">Named in someone's connections but not on file yet.</p></section>` : ""}
          </aside>
        </div></div></div>`;
    st.msg = ""; st.err = false;
  }
  /* ---------- census ----------
     Whole save or one town. A checking balance is the open checking accounts a Sim holds (alone or joint) in Harbor Trust and Porchlight. No balance means "not on file", never $0. */
  const checkingOf = s => {
    const acc = (data.accounts || []).filter(a => !a.card && a.status !== "Closed" && /checking/i.test(a.type || "") && (a.holder_sim === s.id || a.co_holder === s.id));
    return acc.length ? acc.reduce((t, a) => t + Number(a.balance || 0), 0) : null;
  };
  const BANDS = [["Under $1,000", 0, 1000], ["$1,000 to $9,999", 1000, 10000], ["$10,000 to $99,999", 10000, 100000], ["$100,000 to $999,999", 100000, 1000000], ["$1 million and up", 1000000, Infinity]];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const pct = (n, t) => t ? Math.round(n / t * 100) + "%" : "0%";
  function censusOf(list){
    const women = list.filter(x => /^f/i.test(x.gender || "")).length, men = list.filter(x => /^m/i.test(x.gender || "")).length, noGender = list.filter(x => !x.gender).length;
    const stages = new Map(); list.forEach(x => { if (x.life_stage) stages.set(x.life_stage, (stages.get(x.life_stage) || 0) + 1); });
    const stageRows = [...stages].sort((a, b) => b[1] - a[1] || LIFE_STAGES.indexOf(a[0]) - LIFE_STAGES.indexOf(b[0]));
    const bal = list.map(checkingOf).filter(v => v != null).sort((a, b) => a - b);
    const median = bal.length ? (bal.length % 2 ? bal[(bal.length - 1) / 2] : (bal[bal.length / 2 - 1] + bal[bal.length / 2]) / 2) : null;
    return { n:list.length, women, men, noGender, stageRows, noStage:list.filter(x => !x.life_stage).length, bal, median, noBal:list.length - bal.length, bands:BANDS.map(([l, lo, hi]) => [l, bal.filter(v => v >= lo && v < hi).length]) };
  }
  function ratioLine(w, m){
    if (!w && !m) return "No gender on file yet";
    if (!m) return "No men on file";
    if (!w) return "No women on file";
    const r = Math.max(w, m) / Math.min(w, m);
    if (Math.abs(r - 1) < .05) return "About as many women as men";
    return `${r.toFixed(1)} ${w > m ? "women for every man" : "men for every woman"}`;
  }
  function drawCensus(){
    const scope = st.cscope && (st.cscope === NONE || data.sims.some(x => x.residence === st.cscope)) ? st.cscope : "";
    const list = data.sims.filter(x => !scope ? true : scope === NONE ? !x.residence : x.residence === scope), c = censusOf(list), gt = c.women + c.men;
    const rows = [["", "Whole save", data.sims.length], ...townCounts().map(([k, n]) => [k, townName(k), n])];
    const where = scope ? (scope === NONE ? "with no town yet" : "in " + scope) : "in the save";
    const maxStage = Math.max(1, ...c.stageRows.map(r => r[1])), maxBand = Math.max(1, ...c.bands.map(r => r[1]));
    const bars = (items, max) => `<div class="rg-group rg-bars">${items.map(([l, n]) => `<div class="rg-li static"><span class="t">${esc(l)}</span><span class="rg-track" aria-hidden="true"><i style="width:${Math.round(n / max * 100)}%"></i></span><span class="n">${n}</span></div>`).join("")}</div>`;
    const money0 = v => "$" + Math.round(v).toLocaleString("en-US");
    root.innerHTML = `<div class="site-registry">${header()}
      <div class="rg-page">${moveBanner()}
        <div class="rg-bar">${viewSwitch()}</div>
        <div class="rg-cols">
          <div class="rg-main">
            <div class="rg-titlerow"><h2 class="rg-title">Census</h2></div>
            <div class="ui-chips rg-cchips" role="group" aria-label="Where">${rows.map(([k, n, ct]) => `<button type="button" class="ui-chip ${scope === k ? "on" : ""}" data-cscope="${esc(k)}" aria-pressed="${scope === k}"><span>${esc(n)} <small>${ct}</small></span></button>`).join("")}</div>
            <div class="rg-pop"><b>${c.n}</b><span>${c.n === 1 ? "resident" : "residents"} ${esc(where)}</span></div>
            <div class="rg-cgrid">
              <section><p class="rg-shd">Gender</p><div class="rg-group rg-pad">
                <b class="rg-big">${esc(ratioLine(c.women, c.men))}</b>
                ${gt ? `<div class="rg-split" role="img" aria-label="${plural(c.women, "woman", "women")}, ${plural(c.men, "man", "men")}">${c.women ? `<i style="flex:${c.women}"></i>` : ""}${c.men ? `<i style="flex:${c.men}"></i>` : ""}</div>` : ""}
                <div class="rg-gl"><div><span class="k"><i style="background:var(--women)"></i>Women</span><b>${c.women}</b><small>${pct(c.women, gt)} of ${gt}</small></div><div><span class="k"><i style="background:var(--men)"></i>Men</span><b>${c.men}</b><small>${pct(c.men, gt)} of ${gt}</small></div></div>
                ${c.noGender ? `<p class="rg-note">${plural(c.noGender, "resident has", "residents have")} no gender set.</p>` : ""}</div></section>
              <section><p class="rg-shd">Life stage</p>${c.stageRows.length ? bars(c.stageRows, maxStage) : `<div class="rg-group rg-pad rg-empty">No life stages on file yet.</div>`}${c.noStage ? `<p class="rg-foot">${plural(c.noStage, "resident has", "residents have")} no life stage set.</p>` : ""}</section>
              <section><p class="rg-shd">Checking balance</p>${c.bal.length ? `<div class="rg-group rg-pad rg-medrow"><span>Median</span><b>${money0(c.median)}</b><small>of ${c.bal.length} with a balance</small></div>${bars(c.bands, maxBand)}` : `<div class="rg-group rg-pad rg-empty">No balances on file yet.</div>`}
                <p class="rg-foot">${c.noBal} of ${c.n} not on file. Balances come from Harbor Trust and Porchlight, and are made up.</p></section>
            </div>
          </div>
          <aside class="rg-side"><section class="rg-csec"><p class="rg-shd">Where</p><div class="rg-group">${rows.map(([k, n, ct]) => `<button type="button" class="rg-li" data-cscope="${esc(k)}" aria-pressed="${scope === k}"><span class="t">${esc(n)}</span><span class="v">${ct}</span><span class="rg-tick" aria-hidden="true">${scope === k ? "✓" : ""}</span></button>`).join("")}</div></section></aside>
        </div></div></div>`;
    st.msg = ""; st.err = false;
  }

  /* ---------- header and the move banner ---------- */
  const SEAL = `<svg class="rg-seal" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 3"/><path d="M32 14l10 18-10 18-10-18z" fill="currentColor"/><path d="M32 14l10 18H22z" fill="currentColor" opacity=".55"/></svg>`;
  function header(){
    const upd = data.updated ? new Date(data.updated + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";
    return `<header class="rg-agency" id="rg-agency">${SEAL}<div><small>Simerican Office of Resident Affairs</small><b>Resident Registry</b></div>
      <div class="rg-meta">${data.sims.length} residents on file${upd ? `<br>Records current to ${upd}` : ""}</div>
      <button type="button" class="rg-hdrnew" data-act="new" aria-label="New resident"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></header>`;
  }
  function moveBanner(){
    if (R().isMoved()) return st.move && st.move.done ? moveDone() : "";
    if (!R().ready()) return `<div class="rg-move"><b>Your Registry has a new home.</b> Sign in to SimDesk's cloud to move your connections into their own tables. Until then, connections show here read only.</div>`;
    if (R().problem()) return `<div class="rg-move err"><b>The new Registry tables aren't reachable.</b> ${esc(R().problem())}. Your connections show from the old list for now, read only.</div>`;
    if (!st.move) return `<div class="rg-move"><div><b>Your Registry is ready to move.</b> Connections get their own tables: one record per link, with dated history and one Secret checkbox. Check the counts first; nothing switches until they match.</div><button class="rg-b pri" data-act="moveplan">Check the counts</button></div>`;
    const p = R().plan(), c = p.counts, sims = data.sims, housed = sims.filter(s => statusOf(s) === "Housed").length;
    const row = (k, a, b) => `<tr><td>${k}</td><td class="n">${a}</td><td>${b}</td></tr>`;
    return `<div class="rg-move open"><h3>Moving your Registry</h3><p>What's in your save right now and where each piece goes. Nothing is deleted; the old list stays in your save as a backup.</p>
      <table><thead><tr><th>Thing</th><th class="n">Now</th><th>After the move</th></tr></thead><tbody>
      ${row("Connections", `${p.rows} rows`, `${c.links} links (each pair becomes one)`)}
      ${row("Romance / Family / Ex / Friend / Work", `${c.rom} / ${c.parent + c.sibling + c.otherFamily} / ${c.ex} / ${c.friend} / ${c.work}`, `same, ${c.parent} parent links start Biological and Raised them`)}
      ${row("Hidden (Classified) links", c.secret, "Secret checked")}
      ${row("Slide matches", c.slide, "first history entry dated from the label")}
      ${row("History entries", "none", `${c.history} (the rest say "date not set")`)}
      ${row("Case notes", `${p.caseNotes} Sims`, "word for word in Old case notes, File tab")}
      ${row("Restricted lines", `${p.restricted} on ${p.restrictedSims} Sims`, "word for word under Restricted in Old case notes")}
      ${row("Status", `${sims.length} Sims`, `${housed} Housed, ${sims.length - housed} Homeless (from the address)`)}
      </tbody></table>
      ${st.move.err ? `<p class="rg-msg err">${esc(st.move.err)}</p>` : ""}
      <div class="rg-moveacts"><button class="rg-b quiet" data-act="movecancel">Not now</button><button class="rg-b pri" data-act="movego" ${st.busy ? "disabled" : ""}>${st.busy ? "Moving..." : `Move ${c.links} links now`}</button></div></div>`;
  }
  function moveDone(){
    const k = st.move.done, ok = (a, b) => a === b ? `<span class="ok">✓ match</span>` : `<span class="bad">different</span>`;
    const row = (label, a, b) => `<tr><td>${label}</td><td class="n">${a}</td><td class="n">${b}</td><td>${ok(a, b)}</td></tr>`;
    return `<div class="rg-move open done"><h3>Moved. Every count matches.</h3>
      <table><thead><tr><th>Thing</th><th class="n">In</th><th class="n">Out</th><th></th></tr></thead><tbody>
      ${row("Old rows covered", k.in.rows, k.out.rows)}${row("Links", k.in.links, k.out.links)}${row("History entries", k.in.history, k.out.history)}${row("Secret links", k.in.secret, k.out.secret)}
      ${row("Sims with case notes", k.in.caseNotes, k.out.caseNotes)}${row("Restricted lines", k.in.restricted, k.out.restricted)}</tbody></table>
      <div class="rg-moveacts"><button class="rg-b pri" data-act="movedone">Done</button></div></div>`;
  }

  /* ---------- the file ---------- */
  const LS_SHORT = { "Young Adult":"YA" };
  const ageTrio = s => [s.age != null && s.age !== "" ? String(s.age) : "", s.life_stage ? (LS_SHORT[s.life_stage] || sentence(s.life_stage)) : ""].filter(Boolean).join(" · ");
  const ageSide = s => [s.age, sentence(s.life_stage)].filter(x => x != null && x !== "").map(String).join(", ");
  const NOFILE = `<span class="rg-nf">Not on file</span>`;
  const ICON_UP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_DOWN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const iconEye = off => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>${off ? `<path d="M4 4l16 16" stroke="currentColor" stroke-width="1.8"/>` : ""}</svg>`;
  const CHEV = `<span class="chev" aria-hidden="true">›</span>`;
  const order = () => sortedVisible().map(x => x.id);
  const neighbors = id => { const o = order(), at = o.indexOf(id); return { at, total:o.length, prev:at > 0 ? o[at - 1] : null, next:at >= 0 && at < o.length - 1 ? o[at + 1] : null }; };

  /* the bar under the header: back, file number, up and down arrows (iPad), Edit */
  function navbar(s){
    if (st.editing) return `<nav class="rg-nav editing" aria-label="Editing"><button type="button" class="rg-nb" data-act="canceledit">Cancel</button><span class="c">Editing</span><button type="button" class="rg-nb strong" data-act="savefile" ${st.busy ? "disabled" : ""}>${st.busy ? "Saving..." : "Save"}</button></nav>`;
    const nb = neighbors(s.id), hasSecret = linksFor(s.id).some(l => l.secret);
    const arrow = (id, icon, label) => id ? `<a class="rg-nb ic rg-pn" href="#/registry/${id}" aria-label="${label}">${icon}</a>` : `<span class="rg-nb ic rg-pn off" aria-hidden="true">${icon}</span>`;
    const eye = (st.tab === "connections" || st.tab === "file") && hasSecret ? `<button type="button" class="rg-nb ic" data-act="hidesecrets" aria-label="${st.hideSecrets ? "Show secrets" : "Hide secrets"}" aria-pressed="${st.hideSecrets}">${iconEye(st.hideSecrets)}</button>` : "";
    return `<nav class="rg-nav" aria-label="Resident file"><a class="rg-nb back" href="#/registry"><span aria-hidden="true">‹</span> Residents</a>
      <span class="c">GFB-${esc(s.file_no)}${nb.at >= 0 ? `<span class="rg-of"> · ${nb.at + 1} of ${nb.total}</span>` : ""}</span>
      <span class="r">${arrow(nb.prev, ICON_UP, "Previous resident")}${arrow(nb.next, ICON_DOWN, "Next resident")}${eye}<button type="button" class="rg-nb strong" data-act="edit">Edit</button></span></nav>`;
  }

  /* the record card: photo, file number, name, handle, status */
  function recCard(s){
    const E = st.editing, d = st.draft, ph = E ? d.portrait : s.portrait, nm = E ? (d.name || s.name) : s.name;
    return `<div class="rg-rec"><div class="rg-phwrap"><div class="rg-photo">${ph ? `<img src="${esc(ph)}" alt="">` : esc(initials(nm))}</div>${E ? `<button type="button" class="rg-b sm" data-act="portrait">${ph ? "Change photo" : "Add photo"}</button>` : ""}</div>
      <div class="rg-recb"><p class="rg-fn">File GFB-${esc(s.file_no)}</p>${E ? `<input class="rg-input rg-name" data-d="name" value="${esc(d.name)}" aria-label="Full name">` : `<h2>${esc(s.name)}</h2>`}<p class="rg-hd">${s.simsta ? esc(s.simsta) : "No Simsta handle"}</p>${pill(s)}</div></div>`;
  }
  const trio = s => `<div class="rg-trio">${[["Age", ageTrio(s)], ["Job", dash(s.career)], ["Home", s.household]].map(([k, v]) => `<div><small>${k}</small><b>${v ? esc(v) : NOFILE}</b></div>`).join("")}</div>`;
  const compactRow = s => `<div class="rg-group"><div class="rg-li rg-person static"><span class="rg-idp">${photoOf(s)}</span><span class="t"><b>${esc(s.name)}</b><small>${esc(meta(s, true))}</small></span>${pill(s)}</div></div>`;
  const sideFacts = s => `<div class="rg-group rg-facts">${[["Age", ageSide(s)], ["Gender", s.gender], ["Job", dash(s.career)], ["Household", s.household], ["Town", s.residence]].map(([k, v]) => `<div class="rg-li static"><span class="t">${k}</span><span class="v">${v ? esc(v) : NOFILE}</span></div>`).join("")}</div>`;

  /* edit mode: the facts form, once, above the tabs */
  function facts(s){
    const d = st.draft;
    const sel = (f, opts, val, blank) => `<select class="rg-input" data-d="${f}">${blank != null ? `<option value="">${blank}</option>` : ""}${[...new Set([...(val && !opts.includes(val) ? [val] : []), ...opts])].map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const hh = households();
    return `<section><p class="rg-shd">Basics</p><div class="rg-group rg-pad"><dl class="rg-editf">
      <div><dt>Age</dt><dd class="two"><input class="rg-input" data-d="age" type="number" min="0" inputmode="numeric" value="${esc(d.age)}" aria-label="Age">${sel("life_stage", LIFE_STAGES, d.life_stage, "Life stage")}</dd></div>
      <div><dt>Gender</dt><dd>${sel("gender", [...new Set(["Female","Male", ...used("gender")])], d.gender, "Not on file")}</dd></div>
      <div id="rg-at-career"><dt>Job</dt><dd><input class="rg-input" data-d="career" value="${esc(d.career)}" aria-label="Job"></dd></div>
      <div id="rg-at-household"><dt>Household</dt><dd>${d.newHousehold ? `<input class="rg-input" data-d="household" value="${esc(d.household || "")}" placeholder="New household name" aria-label="New household name">` : `<select class="rg-input" data-d="household" aria-label="Household"><option value="">Pick a household</option>${hh.map(h => `<option ${h === d.household ? "selected" : ""}>${esc(h)}</option>`).join("")}<option value="__new">New household…</option></select>`}</dd></div>
      <div id="rg-at-townie"><dt>Status</dt><dd><label class="rg-check"><input type="checkbox" data-d="townie" ${d.townie ? "checked" : ""}> Townie (never needs a home)</label><small class="rg-help">Housed or Homeless comes from the address.</small></dd></div>
      <div id="rg-at-simsta"><dt>Simsta</dt><dd><input class="rg-input" data-d="simsta" value="${esc(d.simsta || "")}" placeholder="@handle" autocapitalize="none" autocorrect="off" spellcheck="false" aria-label="Simsta handle"></dd></div>
      <div id="rg-at-residence"><dt>Town</dt><dd><input class="rg-input" data-d="residence" list="rg-dl-res" value="${esc(d.residence || "")}" aria-label="Town"><datalist id="rg-dl-res">${places().map(p => `<option value="${esc(p)}">`).join("")}</datalist></dd></div>
      <div><dt>Headshot</dt><dd><button type="button" class="rg-link" data-act="headshot">${d.headshot ? "Change Huddl headshot" : "Add Huddl headshot"}</button></dd></div>
    </dl></div></section>`;
  }

  /* ---------- Profile tab ---------- */
  const sec = (key, title, body) => `<section class="rg-sec" id="rg-at-${key}"><p class="rg-shd">${title}</p><div class="rg-group rg-pad">${body}</div></section>`;
  const tagsView = arr => `<div class="rg-chips">${arr.map(t => `<span class="rg-tg">${esc(t)}</span>`).join("")}</div>`;
  const kv = (k, v) => `<div class="rg-kv"><span>${k}</span><div>${v}</div></div>`;
  const rowv = (k, v) => `<div class="rg-li static"><span class="t">${k}</span><span class="v">${esc(v)}</span></div>`;
  const rowadd = (k, key, tab) => `<button type="button" class="rg-li" data-addat="${tab}:${key}"><span class="t">${k}</span><span class="v acc">Add</span></button>`;
  function tagEdit(key, label, vals){
    return `<div class="rg-tagedit" data-tagkey="${key}"><div class="rg-chips">${(vals || []).map((v, i) => `<span class="rg-tg x">${esc(v)}<button type="button" data-untag="${key}:${i}" aria-label="Remove ${esc(v)}">×</button></span>`).join("")}</div>
      <div class="rg-tagadd"><input class="rg-input" list="rg-dl-${key}" placeholder="Add to ${esc(label.toLowerCase())}" autocomplete="off" aria-label="Add to ${esc(label)}"><button type="button" class="rg-b sm" data-tagadd="${key}">Add</button></div><datalist id="rg-dl-${key}">${menu(key).map(v => `<option value="${esc(v)}">`).join("")}</datalist></div>`;
  }
  /* the "still to fill in" meter counts the same six things as the Incomplete filter */
  function meter(s){
    const g = gaps(s), n = 6 - g.length, pct = Math.round(n / 6 * 100);
    return `<div class="rg-group"><div class="rg-meter"><div class="top"><b>File ${n} of 6 filled</b><span>${pct}%</span></div><div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div></div>
      ${g.length ? `<button type="button" class="rg-li" data-act="fillgaps"><span class="t acc">${g.length === 1 ? "Fill in the last one" : "Fill in the other " + g.length}</span>${CHEV}</button>` : ""}</div>`;
  }
  function profileTab(s){
    const E = st.editing, d = st.draft;
    if (!E) {
      const sum = R().simInfo(s.id).summary, out = [], r = [], traits = s.traits || [];
      if (traits.length) out.push(`<div><p class="rg-shd">Personality</p><div class="rg-group rg-pad">${tagsView(traits)}</div></div>`);
      if (!traits.length) r.push(rowadd("Personality", "traits", "profile"));
      [["Attachment style", "attachment"], ["Love language", "love_language"], ["Aspiration", "aspiration"]].forEach(([k, f]) => r.push(s[f] ? rowv(k, s[f]) : rowadd(k, f, "profile")));
      [["Romantic attraction", "romantic_attraction"], ["Sexual attraction", "sexual_attraction"]].forEach(([k, f]) => { if (s[f]) r.push(rowv(k, s[f])); });
      if (!sum) r.push(rowadd("Summary", "summary", "profile"));
      if (!PREF_KEYS.some(([k]) => (s[k] || []).length)) r.push(rowadd("Likes and dislikes", "likes", "profile"));
      out.push(`<div class="rg-group">${r.join("")}</div>`);
      if (sum) out.push(`<div><p class="rg-shd">Summary</p><div class="rg-group rg-pad"><p class="rg-summary">${esc(sum).replace(/\n/g, "<br>")}</p></div></div>`);
      PREF_KEYS.forEach(([k, n]) => { if ((s[k] || []).length) out.push(`<div><p class="rg-shd">${n}</p><div class="rg-group rg-pad">${tagsView(s[k])}</div></div>`); });
      out.push(meter(s));
      return out.join("");
    }
    const sel = (f, opts, val) => `<select class="rg-input" data-d="${f}"><option value="">Pick one</option>${[...new Set([...(val && !opts.includes(val) ? [val] : []), ...opts])].map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const o = data.options, traits = d.traits || [];
    return sec("traits", "Personality", `<div class="rg-chips">${traits.map((t, i) => `<span class="rg-tg x">${esc(t)}<button type="button" data-untrait="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join("")}${Array.from({ length:Math.max(0, 5 - traits.length) }, () => `<label class="rg-tg new">+ Trait<select data-addtrait aria-label="Add a trait"><option value="">Pick a trait</option>${menu("traits").filter(t => !traits.includes(t)).map(t => `<option>${esc(t)}</option>`).join("")}</select></label>`).join("")}</div>`)
      + `<section><p class="rg-shd">Details</p><div class="rg-group rg-pad"><div class="rg-row2 edit">
          <div class="rg-kv" id="rg-at-aspiration"><span>Aspiration</span><div>${sel("aspiration", menu("aspiration"), d.aspiration)}</div></div>
          <div class="rg-kv" id="rg-at-attachment"><span>Attachment style</span><div>${sel("attachment", o.attachment || [], d.attachment)}</div></div>
          <div class="rg-kv" id="rg-at-love_language"><span>Love language</span><div>${sel("love_language", o.love_language || [], d.love_language)}</div></div>
          <div class="rg-kv" id="rg-at-romantic_attraction"><span>Romantic attraction</span><div>${sel("romantic_attraction", attrOpts("romantic_attraction"), d.romantic_attraction)}</div></div>
          <div class="rg-kv" id="rg-at-sexual_attraction"><span>Sexual attraction</span><div>${sel("sexual_attraction", attrOpts("sexual_attraction"), d.sexual_attraction)}</div></div>
        </div></div></section>`
      + sec("summary", "Summary", `<textarea class="rg-input rg-ta" data-d="summary" placeholder="Optional. 4 to 10 sentences in your own words." aria-label="Summary">${esc(d.summary || "")}</textarea>`)
      + PREF_KEYS.map(([k, n]) => sec(k, n, tagEdit(k, n, d[k]))).join("")
      + `<p class="rg-optlink"><button type="button" class="rg-link" data-act="lists">Manage option lists</button> for traits, aspirations, likes, dislikes, and turn ons and offs.</p>`;
  }

  /* ---------- Connections tab ---------- */
  const otherName = (sd) => sd.other ? (simById(sd.other) ? simById(sd.other).name : sd.other) : (sd.otherName || "Unknown");
  function subline(sd){
    const l = sd.link, h = (l.history || []).slice(-1)[0], lab = sd.label || "";
    let tail = "";
    if (h) { if (h.label === lab) tail = h.game_date ? gLabel(h.game_date) : ""; else tail = h.label + ", " + (h.game_date ? gLabel(h.game_date) : "date not set"); }
    if (l.family === "parent") { const rel = [l.biological && "Biological", l.adoptive && "Adoptive", l.raised && "Raised them"].filter(Boolean).join(", "); if (rel && !(l.biological && l.raised && !l.adoptive)) tail = rel; if (l.unconfirmed) tail = (tail ? tail + ", " : "") + "Unconfirmed"; }
    return [lab, tail].filter(Boolean).join(" · ") + (sd.other ? "" : (lab || tail ? ", " : "") + "file pending");
  }
  function connectionsTab(s){
    const all = linksFor(s.id), list = all.filter(l => !(st.hideSecrets && l.secret)), canEdit = R().canEdit(), hid = all.length - list.length;
    const groups = GROUPS.map(([k, n]) => {
      const items = list.filter(l => l.kind === k).map(l => R().side(l, s.id)).sort((a, b) => stripNick(otherName(a)).localeCompare(stripNick(otherName(b))));
      if (!items.length && k !== "rom" && k !== "fam") return "";
      return `<section><p class="rg-shd rg-kind"><i class="rg-kd" style="background:var(--${k})"></i>${n}</p>${items.length ? `<div class="rg-group">${items.map(sd => linkRow(s, sd)).join("")}</div>` : `<div class="rg-group rg-pad rg-empty">None on file yet.</div>`}</section>`;
    }).join("");
    return `${hid ? `<p class="rg-hiddennote">${hid} secret ${hid === 1 ? "connection" : "connections"} hidden</p>` : ""}${groups}
      <button type="button" class="rg-b full" data-act="${canEdit ? "addlink" : "needmove"}">${ICON_PLUS}Add connection</button>`;
  }
  function linkRow(s, sd){
    const l = sd.link, o = sd.other ? simById(sd.other) : null, name = otherName(sd);
    return `<button type="button" class="rg-li rg-person ${l.secret ? "secret" : ""}" data-link="${l.id}" aria-haspopup="dialog">
      <span class="rg-av">${avSq(name, o && o.portrait)}</span>
      <span class="t"><b>${esc(name)}</b><small>${esc(subline(sd))}</small></span>${l.secret ? `<span class="rg-st sec">Secret</span>` : ""}${CHEV}</button>`;
  }

  /* ---------- the connection sheet (UI.sheet: bottom sheet on phone, card on iPad) ---------- */
  let SH = null;
  function openSheet(s, link, focus){
    const ro = !R().canEdit();
    if (link) {
      const sd = R().side(link, s.id);
      st.sheet = { id:link.id, me:s.id, other:sd.other, otherName:sd.otherName, who:"", kind:link.kind, readonly:ro,
        fam: link.family === "parent" ? (sd.isParent ? "me" : "them") : (link.family || "sibling"),
        myLabel:sd.label || "", theirLabel:sd.theirLabel || "", biological:!!link.biological, adoptive:!!link.adoptive, raised:!!link.raised, secret:!!link.secret, unconfirmed:!!link.unconfirmed, editCalls:false, adding:focus === "hist",
        history:(link.history || []).map(h => ({ ...h })), entry:{ date:UI.gameToday(cal()), nodate:false, label:"" }, editEntry:null, focus };
    } else st.sheet = { id:null, me:s.id, other:null, otherName:null, who:"", kind:"friend", readonly:false, fam:"sibling", myLabel:"", theirLabel:"", biological:true, adoptive:false, raised:true, secret:false, unconfirmed:false, editCalls:false, adding:focus === "hist", history:[], entry:{ date:UI.gameToday(cal()), nodate:false, label:"" }, editEntry:null, focus };
    mountSheet(s);
  }
  const noRelOf = h => h.kind === "fam" && (h.fam === "me" || h.fam === "them") && !h.biological && !h.adoptive && !h.raised;
  function mountSheet(s){
    const h = st.sheet;
    SH = UI.sheet({ title:h.readonly ? "Connection" : h.id ? "Edit connection" : "New connection", left:h.readonly ? "" : "Cancel", right:h.readonly ? "Done" : "Save", theme:sheetTheme(), body:sheetBody(s),
      onRight: close => { if (!st.sheet || st.sheet.readonly) close("done"); else saveSheet(s); },
      onClose: () => { SH = null; st.sheet = null; } });
    SH.body.classList.add("rg-sheetui");
    SH.el.addEventListener("click", e => sheetClick(e.target, s));
    SH.el.addEventListener("change", e => { if (e.target.dataset.se === "enodate") { readSheetFields(); refreshSheet(s); } });
    SH.el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset && e.target.dataset.se === "nlabel") { e.preventDefault(); sheetAct("entryadd", null, s); } });
    refreshSheet(s);
  }
  function refreshSheet(s){
    if (!SH || !st.sheet) return;
    const h = st.sheet, bd = SH.body, y = bd.scrollTop;
    bd.innerHTML = sheetBody(s); bd.scrollTop = y;
    const r = SH.el.querySelector("[data-sr]");
    if (!h.readonly) { r.textContent = st.busy ? "Saving..." : "Save"; r.disabled = !!st.busy || noRelOf(h); r.style.opacity = r.disabled ? ".5" : ""; }
    if (h.focus === "hist") { h.focus = null; const f = bd.querySelector('[data-se="nlabel"]'); if (f) { f.scrollIntoView({ block:"center" }); f.focus({ preventScroll:true }); } }
  }
  function sheetBody(s){
    const h = st.sheet, other = h.other ? simById(h.other) : null, oName = other ? other.name : (h.otherName || h.who || "them");
    const A = first(s.name), B = first(oName) || "Them", ro = h.readonly;
    const grp = rows => `<div class="rg-group">${rows}</div>`;
    const shd = t => `<p class="rg-shd">${t}</p>`;
    const dl = DEFAULT_LABEL[h.fam] || [], ml = h.myLabel || dl[0] || "", tl = h.theirLabel || dl[1] || "";
    const dateFields = (prefix, d) => `<span class="rg-gd"><select data-se="${prefix}season" aria-label="Season">${cal().seasons.map(x => `<option ${d && x.name === d.season ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><input type="number" min="1" max="21" inputmode="numeric" data-se="${prefix}day" value="${d ? d.day : 1}" aria-label="Day"><span>Y</span><input type="number" min="0" inputmode="numeric" data-se="${prefix}year" value="${d ? d.year : cal().year}" aria-label="Year"></span>`;
    const links = other ? (() => { const thread = GFB.messages && GFB.messages.isLoaded() ? GFB.messages.find([s.id, other.id]) : null; const href = thread ? `#/messages/t/${thread.id}/${s.id}` : `#/messages/sim/${s.id}`;
      return grp(`<a class="rg-li" href="${href}"><span class="t">Messages with ${esc(B)}</span>${CHEV}</a><a class="rg-li" href="#/registry/${other.id}"><span class="t">${esc(B)}'s file</span>${CHEV}</a>`); })() : "";
    const person = h.id ? grp(`<div class="rg-li rg-person static"><span class="rg-av">${avSq(oName, other && other.portrait)}</span><span class="t"><b>${esc(A)} and ${esc(B)}</b><small>${esc(KIND_NAME[h.kind] || "")}${ml && tl && ml !== tl ? ` · ${esc(A)} is ${esc(ml)}, ${esc(B)} is ${esc(tl)}` : ml || tl ? ` · ${esc(ml || tl)}` : ""}</small></span>${h.secret ? `<span class="rg-st sec">Secret</span>` : ""}</div>`) : "";
    const histRO = h.history.length ? grp(h.history.map(e => `<div class="rg-li rg-entryrow static"><span class="rg-entrydate">${esc(gShort(e.game_date))}</span><span class="t">${esc(e.label)}${e.note ? `<small>${esc(e.note)}</small>` : ""}</span></div>`).join("")) : grp(`<div class="rg-pad rg-empty">No history yet.</div>`);
    if (ro) return `${person}${shd("History")}${histRO}${links}<p class="rg-help rg-pad">Connections are read only until your Registry moves to its new tables.</p>`;
    const isParent = h.kind === "fam" && (h.fam === "me" || h.fam === "them"), noRel = noRelOf(h);
    const sw = (key, label, help) => `<button type="button" class="rg-li rg-swrow" role="switch" aria-checked="${!!h[key]}" data-sp="${key}"><span class="t">${label}${help ? `<small>${help}</small>` : ""}</span><span class="rg-sw" aria-hidden="true"></span></button>`;
    const radio = (name, v, label, val) => `<button type="button" class="rg-li" role="radio" aria-checked="${v === val}" data-sk="${name}:${v}"><span class="t">${esc(label)}</span><span class="rg-tick" aria-hidden="true">${v === val ? "✓" : ""}</span></button>`;
    const secretHelp = h.secret ? (h.kind === "fam" ? "Heirloom hides it behind the eye button, and Spill keeps it out of the public layer." : "Shows with a red Secret chip, and Spill keeps it out of the public layer.") : "Hidden from public screens.";
    const entries = h.history.map((e, i) => h.editEntry === i
      ? `<div class="rg-pad rg-entryedit">${dateFields("e", e.game_date || UI.gameToday(cal()))}<button type="button" class="ui-chip ${e.game_date && e.game_date.year === 0 ? "on" : ""}" data-sa="y0:e" aria-pressed="${!!e.game_date && e.game_date.year === 0}"><span>Year 0</span></button><label class="rg-check"><input type="checkbox" data-se="enodate" ${e.game_date ? "" : "checked"}> No date</label><input class="rg-input" data-se="elabel" value="${esc(e.label)}" list="rg-dl-hist" aria-label="What happened"><button type="button" class="rg-b sm pri" data-sa="entrydone">Done</button></div>`
      : `<div class="rg-li rg-entryrow"><button type="button" class="rg-entrydate" data-sa="entryedit:${i}" aria-label="Change this entry">${esc(gShort(e.game_date))}</button><span class="t">${esc(e.label)}${e.note ? `<small>${esc(e.note)}</small>` : ""}</span><button type="button" class="rg-rm" data-sa="entrydel:${i}">Remove</button></div>`).join("");
    const calls = h.editCalls || (!ml && !tl && h.kind !== "fam" && !h.id)
      ? `<div class="rg-pad rg-two"><div><div class="rg-flab">${esc(A)} calls it</div><input class="rg-input" data-se="myLabel" value="${esc(h.myLabel)}" aria-label="${esc(A)} calls it"></div><div><div class="rg-flab">${esc(B)} calls it</div><input class="rg-input" data-se="theirLabel" value="${esc(h.theirLabel)}" aria-label="${esc(B)} calls it"></div></div>`
      : `<div class="rg-li static"><span class="t">${ml && tl && ml !== tl ? `${esc(A)} is ${esc(ml)}, ${esc(B)} is ${esc(tl)}` : ml || tl ? `They call it ${esc(ml || tl)}` : "No label yet"}</span><button type="button" class="rg-link" data-sa="calls">${ml || tl ? "Change" : "Add"}</button></div>`;
    return `${h.id ? person : `${shd("Who")}${grp(`<div class="rg-pad"><input class="rg-input" data-se="who" list="rg-dl-sims" value="${esc(h.who)}" placeholder="Start typing a name" autocomplete="off" aria-label="Who"><datalist id="rg-dl-sims">${data.sims.filter(x => x.id !== s.id).map(x => `<option value="${esc(x.name)}">`).join("")}</datalist><p class="rg-help">Pick a resident on file, or type a new name to mark them file pending.</p></div>`)}`}
      ${shd("Kind")}<div class="rg-seg rg-kindseg" role="group" aria-label="Kind">${KINDS.map(([k, n]) => `<button type="button" data-sk="kind:${k}" aria-pressed="${h.kind === k}"><span>${n}</span></button>`).join("")}</div>
      ${h.kind === "fam" ? `${shd("Family link")}${grp([["them", `${B} is ${A}'s parent`], ["me", `${A} is ${B}'s parent`], ["sibling", "Siblings"], ["other", "Other family"]].map(([v, l]) => radio("fam", v, l, h.fam)).join(""))}` : ""}
      ${isParent ? `${shd("This link is")}${grp(sw("biological", "Biological") + sw("adoptive", "Adoptive") + sw("raised", "Raised them") + sw("unconfirmed", "Unconfirmed", h.unconfirmed ? "Heirloom shows it dashed with a ? until a DNA kit confirms it." : ""))}${noRel ? `<p class="rg-help rg-warn">Pick at least one: Biological, Adoptive or Raised them.</p>` : ""}` : ""}
      ${grp(sw("secret", "Secret", secretHelp))}
      ${shd("What they call it")}${grp(calls)}
      <div id="rg-sheet-hist">${shd("History")}${grp(entries + (h.adding ? `<div class="rg-pad rg-newentry">${dateFields("n", h.entry.date)}<button type="button" class="ui-chip ${h.entry.date && h.entry.date.year === 0 ? "on" : ""}" data-sa="y0:n" aria-pressed="${!!h.entry.date && h.entry.date.year === 0}"><span>Year 0</span></button><input class="rg-input" data-se="nlabel" list="rg-dl-hist" value="${esc(h.entry.label)}" placeholder="Dating" aria-label="What happened"><button type="button" class="rg-link" data-sa="entrycancel">Cancel</button></div>` : "") + `<button type="button" class="rg-li" data-sa="newentry"><span class="t acc">Add to history</span></button>`)}<datalist id="rg-dl-hist">${HIST_SUGGEST.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      ${h.err ? `<p class="rg-msg err">${esc(h.err)}</p>` : ""}
      ${links}
      ${h.id ? grp(`<button type="button" class="rg-li rg-delrow" data-sa="delete">Delete connection</button>`) : ""}`;
  }
  function readSheetFields(){
    const h = st.sheet; if (!h || !SH) return;
    const g = k => SH.el.querySelector(`[data-se="${k}"]`);
    if (g("who")) h.who = g("who").value;
    ["myLabel","theirLabel"].forEach(k => { if (g(k)) h[k] = g(k).value; });
    if (g("nseason")) h.entry = { ...h.entry, date:{ season:g("nseason").value, day:clampDay(g("nday").value), year:yearOf(g("nyear").value) }, label:g("nlabel").value };
    if (h.editEntry != null && g("eseason")) { const e = h.history[h.editEntry]; e.label = g("elabel").value.trim() || e.label; e.game_date = g("enodate").checked ? null : { season:g("eseason").value, day:clampDay(g("eday").value), year:yearOf(g("eyear").value) }; }
  }
  /* Year 0 is allowed so past lore can be dated before the save's first year */
  const yearOf = v => { const n = parseInt(v, 10); return isNaN(n) ? cal().year : Math.max(0, n); };
  const clampDay = v => Math.min(21, Math.max(1, parseInt(v, 10) || 1));
  const DEFAULT_LABEL = { me:["Child","Parent"], them:["Parent","Child"], sibling:["Sibling","Sibling"] };
  function sheetClick(t, s){
    const h = st.sheet; if (!h) return;
    if (t.closest("a[href]")) { SH && SH.close("nav"); return; }
    const b = t.closest("[data-sa]"); if (b) return sheetAct(b.dataset.sa, b, s);
    const sp = t.closest("[data-sp]")?.dataset.sp;
    if (sp) { readSheetFields(); h[sp] = !h[sp]; return refreshSheet(s); }
    const sk = t.closest("[data-sk]")?.dataset.sk;
    if (sk) { readSheetFields(); const [k, v] = sk.split(":");
      if (k === "kind") h.kind = v;
      if (k === "fam") { const was = h.fam; h.fam = v; if (DEFAULT_LABEL[v]) { const [a, b2] = DEFAULT_LABEL[v], defs = Object.values(DEFAULT_LABEL).flat(); if (!h.myLabel || defs.includes(h.myLabel)) h.myLabel = a; if (!h.theirLabel || defs.includes(h.theirLabel)) h.theirLabel = b2; } if ((v === "me" || v === "them") && !(was === "me" || was === "them") && !h.id) { h.biological = true; h.raised = true; h.adoptive = false; } }
      refreshSheet(s);
    }
  }
  async function sheetAct(sa, btn, s){
    const h = st.sheet; if (!h) return;
    readSheetFields();
    if (sa === "y0:n") { h.entry = { ...h.entry, nodate:false, date:{ ...(h.entry.date || UI.gameToday(cal())), year:0 } }; return refreshSheet(s); }
    if (sa === "y0:e" && h.editEntry != null) { const e = h.history[h.editEntry]; e.game_date = { ...(e.game_date || UI.gameToday(cal())), year:0 }; return refreshSheet(s); }
    if (sa === "calls") { h.editCalls = true; return refreshSheet(s); }
    if (sa === "newentry") { if (h.adding && h.entry.label.trim()) { h.history.push({ id:null, label:h.entry.label.trim(), game_date:h.entry.nodate ? null : h.entry.date, note:null }); } h.adding = true; h.entry = { ...h.entry, label:"" }; h.err = null; h.focus = "hist"; return refreshSheet(s); }
    if (sa === "entrycancel") { h.adding = false; h.entry = { ...h.entry, label:"" }; return refreshSheet(s); }
    if (sa === "entryadd") { if (!h.entry.label.trim()) { h.err = "Type what happened, then tap Add to history."; return refreshSheet(s); } h.history.push({ id:null, label:h.entry.label.trim(), game_date:h.entry.date, note:null }); h.entry = { ...h.entry, label:"" }; h.err = null; h.focus = "hist"; return refreshSheet(s); }
    if (sa.startsWith("entryedit:")) { h.editEntry = Number(sa.split(":")[1]); return refreshSheet(s); }
    if (sa === "entrydone") { h.editEntry = null; return refreshSheet(s); }
    if (sa.startsWith("entrydel:")) { if (!UI.confirmTap(btn, "Tap again to remove")) return; h.history.splice(Number(sa.split(":")[1]), 1); h.editEntry = null; return refreshSheet(s); }
    if (sa === "delete") {
      if (!UI.confirmTap(btn, "Tap again to delete")) return;
      try { await R().deleteLink(h.id); } catch (err) { h.err = err.message; return refreshSheet(s); }
      if (SH) SH.close("deleted"); st.openLink = null; st.msg = "Connection removed from both files."; st.err = false; data = await GFB.getAll(); return draw();
    }
  }
  async function saveSheet(s){
    readSheetFields();
    const h = st.sheet; h.err = null;
    let other = h.other, otherName = h.otherName;
    if (!h.id) {
      const t = findSim(h.who);
      if (!h.who.trim()) { h.err = "Pick who this connection is with."; return refreshSheet(s); }
      if (t && t.id === s.id) { h.err = "A Sim can't be connected to themselves."; return refreshSheet(s); }
      other = t ? t.id : null; otherName = t ? null : h.who.trim();
      if (other && linksFor(s.id).some(l => l.a_sim === other || l.b_sim === other)) { h.err = `${first(s.name)} and ${first(t.name)} already have a connection. Open it from the list to change it.`; return refreshSheet(s); }
    }
    if (h.entry.label.trim()) h.history.push({ id:null, label:h.entry.label.trim(), game_date:h.entry.nodate ? null : h.entry.date, note:null });
    const parent = h.kind === "fam" && (h.fam === "me" || h.fam === "them");
    let myL = h.myLabel.trim() || null, thL = h.theirLabel.trim() || null;
    if (h.kind === "fam" && DEFAULT_LABEL[h.fam]) { if (!myL) myL = DEFAULT_LABEL[h.fam][0]; if (!thL) thL = DEFAULT_LABEL[h.fam][1]; }
    /* the parent is always a_sim; otherwise the Sim whose file it's opened from goes first on a new link, and an existing link keeps its order */
    const old = h.id ? R().linkById(h.id) : null;
    let meIsA = old ? old.a_sim === s.id : true;
    if (parent) meIsA = h.fam === "me";
    if (!other && !meIsA) meIsA = true;   /* a file-pending Sim can't be a_sim */
    const link = { id:h.id || R().newId(), a_sim:meIsA ? s.id : other, b_sim:meIsA ? other : s.id, b_name:meIsA && !other ? otherName : null, kind:h.kind,
      family:h.kind === "fam" ? (parent ? "parent" : h.fam === "sibling" ? "sibling" : "other") : null,
      a_label:meIsA ? myL : thL, b_label:meIsA ? thL : myL, biological:parent ? h.biological : null, adoptive:parent ? h.adoptive : null, raised:parent ? h.raised : null, secret:h.secret, unconfirmed:parent ? !!h.unconfirmed : false };
    if (!parent && h.kind === "fam" && !other && h.fam !== "sibling") link.family = "other";
    st.busy = true; refreshSheet(s);
    let saved = false;
    try { await R().saveLink(link, h.history.map(e => ({ id:e.id || undefined, label:e.label, game_date:e.game_date || null, note:e.note || null }))); saved = true; }
    catch (e) { h.err = e.message; }
    st.busy = false;
    if (!saved) return refreshSheet(s);
    if (SH) SH.close("saved");
    st.openLink = null; st.msg = "Connection saved."; st.err = false; data = await GFB.getAll(); draw();
  }


  /* ---------- Timeline (top of the File tab) ----------
     Every dated history entry on this Sim's connections, plus their home changes (Housed, Homeless, Townie).
     Entries with no date sit in their own group, "Before the save started" counts as dated and sits at the very bottom. */
  const BEFORE = { season:"Before the save started", day:0, year:0, before:true };
  const KIND_NAME = Object.fromEntries(KINDS);
  function relTitle(label, name){
    const L = String(label || "").trim(), l = L.toLowerCase();
    if (/^matched on slide/.test(l)) return `Matched with ${name} on Slide`;
    if (/^(married|met|adopted|divorced)$/.test(l)) return `${L} ${name}`;
    if (l === "engaged") return `Engaged to ${name}`;
    if (l === "dating") return `Started dating ${name}`;
    if (l === "parent and child") return `Parent and child: ${name}`;
    return `${L || "Connected"} with ${name}`;
  }
  function homeAddress(s){ const h = homeOf(s); return h ? lotLabel(h) : null; }
  /* the Sim's timeline entries, newest data first is decided later; hidden counts the secrets left out */
  function tlItems(s){
    const out = []; let hidden = 0;
    linksFor(s.id).forEach(l => {
      if (st.hideSecrets && l.secret) { hidden += (l.history || []).length; return; }
      const sd = R().side(l, s.id), name = otherName(sd), kn = KIND_NAME[l.kind] || "";
      (l.history || []).forEach((h, idx) => {
        const slide = /^matched on slide/i.test(h.label || "");
        out.push({ key:`h:${l.id}:${idx}`, type:"rel", link:l, hist:h, idx, date:h.game_date || null, tone:l.secret ? "sec" : "rom", secret:!!l.secret, kind:l.kind,
          title:relTitle(h.label, name), sub:[slide ? "From Slide" : "", kn, l.secret ? "Secret" : (slide ? "" : sd.label)].filter(Boolean).join(" · ") });
      });
    });
    const evs = R().homeEventsOf(s.id);
    evs.forEach(e => out.push({ key:"e:" + e.id, type:"home", ev:e, date:e.game_date || null, tone:"home", kind:"home", title:{ housed:"Housed", homeless:"Homeless", townie:"Townie" }[e.kind],
      sub:"Home · " + (e.address || (e.kind === "housed" ? "address on file" : "no home address yet")), lot:e.address ? lots().find(x => lotLabel(x) === e.address) : null }));
    if (!evs.length) { const k = statusOf(s).toLowerCase(), a = homeAddress(s);
      out.push({ key:"v:" + k, type:"home", virtual:true, ev:{ sim_id:s.id, kind:k, address:a }, date:null, tone:"home", kind:"home", title:statusOf(s), sub:"Home · " + (a || "no home address yet"), lot:homeOf(s) }); }
    return { out, hidden };
  }
  const dayWord = d => d && d.day ? "Day " + d.day : "";
  function tlRow(it, s){
    if (st.tl.edit && st.tl.edit.key === it.key) return tlEditRow(it);
    const d = it.date, dated = !!d, tone = it.tone === "sec" ? "secret" : it.tone === "home" ? "bar" : it.kind, go = !(it.type === "home" && !it.lot);
    const dayBtn = dated ? `<button type="button" class="rg-evday" data-tl="date:${esc(it.key)}" aria-label="Change this date">${d.before ? "Before" : esc(dayWord(d))}</button>` : `<button type="button" class="rg-evday add" data-tl="date:${esc(it.key)}">Add date</button>`;
    const inner = `<i class="rg-dot ${it.tone}" style="--c:var(--${tone})"></i><span class="t"><b>${esc(it.title)}${it.secret ? `<span class="rg-st sec">Secret</span>` : ""}</b><small>${esc(it.sub)}</small></span>${go ? CHEV : ""}`;
    return `<div class="rg-ev ${it.secret ? "secret" : ""}">${dayBtn}${go ? `<button type="button" class="rg-evmain" data-tlopen="${esc(it.key)}">${inner}</button>` : `<div class="rg-evmain">${inner}</div>`}</div>`;
  }
  const tlDateFields = (d, before, pre) => before
    ? `<span class="rg-gdfixed">Before the save started</span>`
    : `<span class="rg-gd"><select data-tlf="${pre}season" aria-label="Season">${cal().seasons.map(x => `<option ${d && x.name === d.season ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><input type="number" min="1" max="21" inputmode="numeric" data-tlf="${pre}day" value="${d ? d.day : 1}" aria-label="Day"><span>Y</span><input type="number" min="0" inputmode="numeric" data-tlf="${pre}year" value="${d ? d.year : cal().year}" aria-label="Year"></span>`;
  function tlEditRow(it){
    const e = st.tl.edit, today = UI.gameToday(cal());
    return `<div class="rg-ev editing"><div class="rg-evedit"><b>${esc(it.title)}</b>
      <div class="rg-gdrow">${tlDateFields(e.date, e.before, "e")}</div>
      <div class="ui-chips wrap"><button type="button" class="ui-chip ${e.before ? "on" : ""}" data-tl="q:before" aria-pressed="${!!e.before}"><span>Before the save started</span></button><button type="button" class="ui-chip ${!e.before && e.date && e.date.year === 0 ? "on" : ""}" data-tl="q:y0" aria-pressed="${!e.before && !!e.date && e.date.year === 0}"><span>Year 0</span></button><button type="button" class="ui-chip" data-tl="q:today"><span>Today (${esc(today.season)}, day ${today.day})</span></button></div>
      ${e.err ? `<p class="rg-msg err" style="margin:8px 0 0">${esc(e.err)}</p>` : ""}
      <div class="rg-gdact">${it.type === "home" && !it.virtual ? `<button type="button" class="rg-b del" data-tl="remove">Remove</button>` : ""}<button type="button" class="rg-b quiet sm" data-tl="cancel">Cancel</button><button type="button" class="rg-b pri sm" data-tl="savedate" ${st.busy ? "disabled" : ""}>Save date</button></div></div></div>`;
  }
  function tlAddForm(s){
    const a = st.tl.add, links = linksFor(s.id).filter(l => !(st.hideSecrets && l.secret)), today = UI.gameToday(cal());
    const opts = [`<option value="home" ${a.what === "home" ? "selected" : ""}>A home change</option>`, ...links.map(l => `<option value="${l.id}" ${a.what === l.id ? "selected" : ""}>${esc(otherName(R().side(l, s.id)))} (${esc(KIND_NAME[l.kind] || "")}${l.secret ? ", secret" : ""})</option>`)];
    return `<div class="rg-tladd"><div class="rg-flab">What happened</div>
      <select class="rg-input" data-tlf="what" aria-label="What happened with">${opts.join("")}</select>
      ${a.what === "home" ? `<div class="ui-chips wrap" role="group" aria-label="Home change">${[["housed","Housed"],["homeless","Homeless"],["townie","Townie"]].map(([k, n]) => `<button type="button" class="ui-chip ${a.hkind === k ? "on" : ""}" data-tl="hk:${k}" aria-pressed="${a.hkind === k}"><span>${n}</span></button>`).join("")}</div>`
        : `<input class="rg-input" data-tlf="label" list="rg-dl-hist" value="${esc(a.label)}" placeholder="Married, Engaged, Split..." aria-label="What happened" style="margin-top:8px"><datalist id="rg-dl-hist">${HIST_SUGGEST.map(x => `<option value="${esc(x)}">`).join("")}</datalist>`}
      <div class="rg-flab" style="margin-top:10px">When</div>
      <div class="rg-gdrow">${tlDateFields(a.date, a.before, "n")}</div>
      <div class="ui-chips wrap"><button type="button" class="ui-chip ${a.before ? "on" : ""}" data-tl="aq:before" aria-pressed="${!!a.before}"><span>Before the save started</span></button><button type="button" class="ui-chip ${!a.before && a.date && a.date.year === 0 ? "on" : ""}" data-tl="aq:y0" aria-pressed="${!a.before && !!a.date && a.date.year === 0}"><span>Year 0</span></button><button type="button" class="ui-chip" data-tl="aq:today"><span>Today (${esc(today.season)}, day ${today.day})</span></button></div>
      ${a.err ? `<p class="rg-msg err" style="margin:6px 0 0">${esc(a.err)}</p>` : ""}
      <div class="rg-gdact"><button type="button" class="rg-b quiet sm" data-tl="addcancel">Cancel</button><button type="button" class="rg-b pri sm" data-tl="addsave" ${st.busy ? "disabled" : ""}>Add to timeline</button></div></div>`;
  }
  function timelineHTML(s){
    const { out, hidden } = tlItems(s), f = st.tl.filter;
    const rel = out.filter(x => x.type === "rel"), home = out.filter(x => x.type === "home");
    const shown = f === "rel" ? rel : f === "home" ? home : out;
    const ord = d => UI.gameOrd(d, cal());
    const dated = shown.filter(x => x.date && !x.date.before).sort((a, b) => ord(b.date) - ord(a.date));
    const undated = shown.filter(x => !x.date), before = shown.filter(x => x.date && x.date.before);
    const years = [];
    dated.forEach(x => { let y = years[years.length - 1]; if (!y || y.year !== x.date.year) years.push(y = { year:x.date.year, seasons:[] }); let se = y.seasons[y.seasons.length - 1]; if (!se || se.name !== x.date.season) y.seasons.push(se = { name:x.date.season, items:[] }); se.items.push(x); });
    let body = years.map(y => `<p class="rg-yr">Year ${y.year}</p>${y.seasons.map(se => `<p class="rg-shd">${esc(se.name)}</p><div class="rg-group">${se.items.map(x => tlRow(x, s)).join("")}</div>`).join("")}`).join("");
    if (undated.length) body += `<p class="rg-shd rg-undated">Date not set · ${undated.length}${undated.some(x => x.type === "rel" && (x.hist.note || "").includes("old file")) ? " · moved over from Notion" : ""}</p><div class="rg-group">${undated.map(x => tlRow(x, s)).join("")}</div>`;
    if (before.length) body += `<p class="rg-shd rg-undated">Before the save started · ${before.length}</p><div class="rg-group">${before.map(x => tlRow(x, s)).join("")}</div>`;
    if (!shown.length) body = `<div class="rg-group rg-pad rg-empty">Nothing on the timeline for this filter.</div>`;
    const chip = (k, n, c) => `<button type="button" class="ui-chip rg-tf ${f === k ? "on" : ""}" data-tl="f:${k}" aria-pressed="${f === k}"><span>${n} <small>${c}</small></span></button>`;
    return `<section class="rg-tl" id="rg-at-timeline"><div class="rg-tlhead"><p class="rg-shd">Timeline</p><button type="button" class="rg-link" data-tl="add">Add to timeline</button></div>
      <div class="ui-chips wrap" role="group" aria-label="Timeline filter">${chip("all", "All", out.length)}${chip("rel", "Relationships", rel.length)}${chip("home", "Home", home.length)}</div>
      ${st.tl.msg ? `<p class="rg-msg ${st.tl.err ? "err" : ""}" role="status">${esc(st.tl.msg)}</p>` : ""}
      ${st.tl.add ? tlAddForm(s) : ""}${body}${hidden ? `<p class="rg-hiddennote">${hidden} secret ${hidden === 1 ? "entry" : "entries"} hidden</p>` : ""}</section>`;
  }
  /* read the date fields that are on screen */
  function tlRead(){
    const g = k => root.querySelector(`[data-tlf="${k}"]`);
    const rd = (pre, o) => { if (g(pre + "season")) o.date = { season:g(pre + "season").value, day:clampDay(g(pre + "day").value), year:yearOf(g(pre + "year").value) }; };
    if (st.tl.edit) rd("e", st.tl.edit);
    if (st.tl.add) { rd("n", st.tl.add); if (g("label")) st.tl.add.label = g("label").value; }
  }
  const tlFind = (key, s) => tlItems(s).out.find(x => x.key === key);
  async function tlAction(act, s){
    const T = st.tl; T.msg = ""; tlRead();
    const done = async (msg) => { st.busy = false; T.edit = null; T.add = null; T.msg = msg; T.err = false; data = await GFB.getAll(); draw(); setTimeout(() => { T.msg = ""; }, 0); };
    const fail = (e) => { st.busy = false; T.msg = e.message; T.err = true; draw(); };
    if (act.startsWith("f:")) { T.filter = act.slice(2); return draw(); }
    if (act === "add") { T.edit = null; T.add = T.add ? null : { what:"home", hkind:statusOf(s).toLowerCase(), label:"", date:UI.gameToday(cal()), before:false }; return draw(); }
    if (act === "addcancel") { T.add = null; return draw(); }
    if (act.startsWith("hk:")) { T.add.hkind = act.slice(3); return draw(); }
    if (act === "aq:before") { T.add.before = true; return draw(); }
    if (act === "aq:y0") { T.add.before = false; T.add.date = { ...(T.add.date || UI.gameToday(cal())), year:0 }; return draw(); }
    if (act === "q:y0") { T.edit.before = false; T.edit.date = { ...(T.edit.date || UI.gameToday(cal())), year:0 }; return draw(); }
    if (act === "aq:today") { T.add.before = false; T.add.date = UI.gameToday(cal()); return draw(); }
    if (act.startsWith("date:")) { const it = tlFind(act.slice(5), s); if (!it) return;
      if (it.type === "rel" && !R().canEdit()) { st.tab = "file"; T.msg = "Connections are read only until your Registry moves to its new tables. Use the banner at the top to check the counts and move."; T.err = true; return draw(); }
      T.add = null; T.edit = { key:it.key, date:it.date && !it.date.before ? { ...it.date } : UI.gameToday(cal()), before:!!(it.date && it.date.before) }; return draw(); }
    if (act === "cancel") { T.edit = null; return draw(); }
    if (act === "q:before") { T.edit.before = true; return draw(); }
    if (act === "q:today") { T.edit.before = false; T.edit.date = UI.gameToday(cal()); return draw(); }
    if (act === "savedate") {
      const it = tlFind(T.edit.key, s); if (!it) return; const nd = T.edit.before ? { ...BEFORE } : T.edit.date;
      st.busy = true; draw();
      try {
        if (it.type === "rel") { const l = it.link; await R().saveLink({ ...l }, l.history.map((e, i) => ({ id:e.id, label:e.label, game_date:i === it.idx ? nd : (e.game_date || null), note:e.note || null }))); }
        else await R().saveHomeEvent({ ...it.ev, game_date:nd });
        return done("Date saved.");
      } catch (e) { return fail(e); }
    }
    if (act === "remove") { const it = tlFind(T.edit.key, s); if (!it || it.type !== "home" || it.virtual) return; st.busy = true; try { await R().deleteHomeEvent(it.ev.id); return done("Entry removed."); } catch (e) { return fail(e); } }
    if (act === "addsave") {
      const a = T.add, nd = a.before ? { ...BEFORE } : a.date; st.busy = true; draw();
      try {
        if (a.what === "home") await R().saveHomeEvent({ sim_id:s.id, kind:a.hkind, address:a.hkind === "housed" ? homeAddress(s) : null, game_date:nd });
        else {
          if (!R().canEdit()) throw new Error("Connections are read only until your Registry moves to its new tables.");
          if (!String(a.label || "").trim()) throw new Error("Type what happened, like Married or Engaged.");
          const l = R().linkById(a.what); await R().saveLink({ ...l }, [...l.history.map(e => ({ id:e.id, label:e.label, game_date:e.game_date || null, note:e.note || null })), { label:a.label.trim(), game_date:nd, note:null }]);
        }
        return done("Added to the timeline.");
      } catch (e) { return fail(e); }
    }
  }
  /* tapping an entry: a connection opens its sheet, a home entry opens the address */
  function tlOpen(key, s){
    const it = tlFind(key, s); if (!it) return;
    if (it.type === "home") { if (it.lot) location.hash = "#/lotline/" + it.lot.id; return; }
    openSheet(s, it.link);
  }
  /* a home change adds an entry on its own: compare each household member's status before and after a file save */
  const statusSnap = ids => Object.fromEntries(ids.map(id => { const x = simById(id); return [id, x ? { st:statusOf(x), addr:homeAddress(x) } : null]; }));
  async function logHomeChanges(before){
    for (const [id, b] of Object.entries(before)) {
      const x = simById(id); if (!x || !b) continue; const a = { st:statusOf(x), addr:homeAddress(x) };
      if (a.st === b.st && a.addr === b.addr) continue;
      try { await R().saveHomeEvent({ sim_id:id, kind:a.st.toLowerCase(), address:a.addr, game_date:UI.gameToday(cal()) }); } catch {}
    }
  }

  /* ---------- File tab ---------- */
  function fileTab(s){
    const E = st.editing, d = st.draft, out = [];
    const orgs = orgsOf(s), jobs = orgs.filter(o => String(o.type).toLowerCase() !== "club"), clubs = orgs.filter(o => String(o.type).toLowerCase() === "club");
    const role = o => { const m = (o.members || []).find(x => x.sim === s.id || stripNick(x.name || "").toLowerCase() === stripNick(s.name).toLowerCase()); return m && m.role ? m.role : ""; };
    const lrow = (href, title, small) => `<a class="rg-li wrap" href="${href}"><span class="t"><b>${esc(title)}</b>${small ? `<small>${esc(small)}</small>` : ""}</span>${CHEV}</a>`;
    const secRows = (key, title, rows) => `<section class="rg-sec" id="rg-at-${key}"><p class="rg-shd">${title}</p><div class="rg-group">${rows}</div></section>`;
    if (jobs.length || clubs.length) out.push(secRows("work", "Work and clubs", jobs.map(o => lrow("#/huddl/org/" + o.id, o.name, ["Company", role(o)].filter(Boolean).join(" · "))).join("") + clubs.map(o => lrow("#/cliq/club/" + o.id, o.name, ["Club", role(o)].filter(Boolean).join(" · "))).join("")));
    const home = homeOf(s), owned = ownedBy(s);
    if (E) {
      const homes = lots().filter(l => RESIDENTIAL.includes(l.lot_type) && !lots().some(u => u.parent_id === l.id));
      const ownSet = new Set(d.owns);
      out.push(sec("home", "Home and property", `<div class="rg-kv"><span>Home address</span><div><select class="rg-input" data-d="home" aria-label="Home address"><option value="">No home on file</option>${homes.map(l => `<option value="${l.id}" ${d.home === l.id ? "selected" : ""}>${esc(lotLabel(l))}${l.household && l.household !== s.household ? " (" + esc(l.household) + ")" : (!l.household ? " (vacant)" : "")}</option>`).join("")}</select><small class="rg-help">Moves ${esc(first(s.name))}'s whole household into that lot. If another household lives there, ${pron(s)} joins it.</small></div></div>
        <div class="rg-kv" id="rg-at-owns"><span>Owns</span><div class="rg-owns">${lots().filter(l => !l.parent_id || ownSet.has(l.id)).map(l => `<label class="rg-check"><input type="checkbox" data-own="${l.id}" ${ownSet.has(l.id) ? "checked" : ""}>${esc(lotLabel(l))}${l.owner && !ownSet.has(l.id) && l.owner_sim !== s.id ? ` <em>owned by ${esc(l.owner)}</em>` : ""}</label>`).join("")}</div></div>`));
    } else {
      const add = (key, label) => `<button type="button" class="rg-li" data-addat="file:${key}"><span class="t acc">${label}</span></button>`;
      out.push(secRows("home", "Home and property", (home ? lrow("#/lotline/" + home.id, lotLabel(home), "Home address") : "") + owned.map(l => lrow("#/lotline/" + l.id, lotLabel(l), "Owns")).join("") + (home ? "" : add("home", "Add home address")) + (owned.length ? "" : add("owns", "Add property"))));
    }
    const money = moneyHTML(s);
    if (money) out.push(secRows("money", "Money", money)); else if (!E) out.push(secRows("money", "Money", `<a class="rg-li" href="#/trust/staff"><span class="t acc">Add bank account</span></a>`));
    const act = activityHTML(s); if (act) out.push(secRows("activity", "Activity", act));
    let html = (E ? "" : timelineHTML(s)) + out.join("");
    const notes = s.notes || [], secrets = s.secrets || [];
    if (notes.length || secrets.length) {
      const firstLine = String(notes[0] || secrets[0] || "").replace(/^#+\s*/, "").replace(/[*_]/g, "");
      html += `<section class="rg-sec rg-old"><div class="rg-oldh"><div><p class="rg-shd">Old case notes</p><p class="rg-foot">From Notion, kept as they were</p></div><button type="button" class="rg-link" data-act="oldtoggle" aria-expanded="${st.oldOpen}">${st.oldOpen ? "Hide" : "Show"}</button></div>
        <div class="rg-group rg-pad">${st.oldOpen ? `<div class="rg-notes">${notes.map(fmtNote).join("")}</div>${secrets.length ? `<p class="rg-shd rg-resth">Restricted</p><ul class="rg-rest">${secrets.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${E ? `<button type="button" class="rg-b sm" data-act="copysummary">Copy case notes into the Summary</button>` : ""}`
          : `<p class="rg-oldprev">${esc(dash(firstLine.length > 150 ? firstLine.slice(0, 148) + "…" : firstLine))}</p>`}</div></section>`;
    }
    return html;
  }
  function moneyHTML(s){
    const BANKS = { harbor:["Harbor Trust","trust"], porchlight:["Porchlight","porchlight"] };
    const nm = id => stripNick((simById(id) || {}).name || id);
    const mine = (data.accounts || []).filter(a => a.status !== "Closed" && (a.holder_sim === s.id || a.co_holder === s.id || (a.custodians || []).includes(s.id)));
    const row = (href, title, small) => `<a class="rg-li wrap" href="${href}"><span class="t"><b>${title}</b><small>${esc(small)}</small></span>${CHEV}</a>`;
    const rows = mine.map(a => {
      const [bank, route] = BANKS[a.bank || "harbor"];
      const who = [a.co_holder ? "Joint with " + nm(a.co_holder === s.id ? a.holder_sim : a.co_holder) : "", a.minor ? ((a.custodians || []).includes(s.id) ? "Custodian of " + nm(a.holder_sim) + "'s minor account" : "Minor account") : ""].filter(Boolean).join(", ");
      const line = a.card ? `Credit card ••${esc(a.number)}: ${money(a.balance) || "$0"} owed of ${money(a.limit) || "$0"}${a.status !== "Active" ? ", " + esc(a.status) : ""}` : `${esc(a.type)} ••${esc(a.number)}: ${money(a.balance) || "$0"}${a.status !== "Active" ? ", " + esc(a.status) : ""}`;
      return row(`#/${route}/staff/a/${a.id}`, line, bank + (who ? ", " + who : ""));
    });
    const loans = (data.loans || []).filter(l => l.status !== "Paid off" && (l.borrower === stripNick(s.name) || (s.household && l.borrower === s.household)))
      .map(l => row(`#/${BANKS[l.bank || "harbor"][1]}/staff`, `${esc(l.type)}: ${money(l.balance) || "$0"} remaining`, `${BANKS[l.bank || "harbor"][0]} loan, ${l.status}`));
    if (!rows.length && !loans.length && !s.credit_score) return "";
    return rows.join("") + loans.join("") + (s.credit_score ? rowv("Credit score", s.credit_score) : "");
  }
  function activityHTML(s){
    const ev = calEvents(s).sort((a,b) => seasonOrder(a.season) - seasonOrder(b.season) || a.day - b.day), lg = calLogs(s), pl = plans(s), ps = postsBy(s);
    const nm = typeof Notes !== "undefined" && Notes.mentionsOf ? Notes.mentionsOf(data, s) : [];
    const row = (href, title, small) => `<a class="rg-li wrap" href="${href}"><span class="t"><b>${esc(title)}</b><small>${esc(small)}</small></span>${CHEV}</a>`;
    const items = [
      ...ev.map(e => row(calLink(e.season, e.day), e.title, `Calendar · ${e.season}, day ${e.day}`)),
      ...lg.map(l => row(calLink(l.season, l.day), l.title || (String(l.text || "").length > 90 ? String(l.text).slice(0, 88) + "…" : l.text || ""), `Logged · Year ${l.year}, ${l.season}, day ${l.day}`)),
      ...pl.map(t => row(`#/plumb/sim:${s.id}`, t.title, `Plumb · ${t.done ? "Completed" : t.when === "now" ? "In progress" : "Planned"}`)),
      ...nm.map(n => row(`#/notes/n/${n.id}`, n.title, `${n.story ? "Storyline · " + n.story : "Note"} · ${n.when}`)),
      ...ps.slice(0, 6).map(p => row(`#/simsta/u/${encodeURIComponent(p.author)}`, p.caption ? String(p.caption).slice(0, 80) : "Post", "Simsta" + (p.date && p.date.season ? " · " + p.date.season + " " + p.date.day : "")))];
    return items.join("");
  }
  /* case-note formatting: ## heading, **bold**, *italic*, "- " bullets. Text is escaped first. */
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>");
  function fmtNote(block){
    const out = []; let list = [], para = [];
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    const flushList = () => { if (list.length) out.push(`<ul>${list.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`); list = []; };
    esc(block).split("\n").forEach(line => {
      const h = line.match(/^\s*#{1,3}\s+(.*)$/), b = line.match(/^\s*[-•*]\s+(.*)$/);
      if (h) { flushPara(); flushList(); out.push(`<h5>${inline(h[1])}</h5>`); }
      else if (b) { flushPara(); list.push(b[1]); }
      else if (line.trim()) { flushList(); para.push(line); }
    });
    flushPara(); flushList(); return out.join("");
  }

  /* ---------- option lists (a sheet) ---------- */
  function listsSheet(){
    return `<div class="rg-sheetwrap" data-sheetbg><form class="rg-sheet wide" data-sec="lists" role="dialog" aria-modal="true" aria-label="Option lists">
      <div class="rg-sh"><b>Option lists</b><button type="button" class="rg-x" data-act="listsclose" aria-label="Close">×</button></div>
      <div class="rg-sb"><p class="rg-help" style="margin:0">One option per line. Paste in a whole list when you add a mod. Options a Sim already has stay on the list until they're removed from that Sim.</p>
      <div class="rg-two">${LIST_KEYS.map(([k,n]) => `<label><span class="rg-flab">${n} <em>${menu(k).length}</em></span><textarea name="${k}" class="rg-input rg-listbox">${esc(menu(k).join("\n"))}</textarea></label>`).join("")}</div></div>
      <div class="rg-sfoot"><button type="button" class="rg-b quiet" data-act="listsclose">Cancel</button><button class="rg-b pri">Save lists</button></div></form></div>`;
  }

  /* ---------- full render ---------- */
  const TABS = [["profile","Profile"],["connections","Connections"],["file","File"]];
  function draw(){
    if (!curId || !simById(curId)) return drawGallery();
    const s = simById(curId), E = st.editing, body = { profile:profileTab, connections:connectionsTab, file:fileTab }[st.tab](s);
    const nConn = linksFor(s.id).filter(l => !(st.hideSecrets && l.secret)).length;
    const keepY = root.scrollTop;
    const head = E ? recCard(s) : st.tab === "profile" ? recCard(s) + trio(s) : compactRow(s);
    root.innerHTML = `<div class="site-registry is-file ${E ? "is-editing" : ""}">${header()}${navbar(s)}
      <div class="rg-page">${moveBanner()}${st.msg ? `<p class="rg-msg ${st.err ? "err" : ""}" role="status">${esc(st.msg)}</p>` : ""}
        <div class="rg-fcols"><div class="rg-fmain">
          <div class="rg-head">${head}</div>
          ${E ? facts(s) : ""}
          <div class="rg-seg rg-tabseg" role="tablist" aria-label="File sections">${TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${st.tab === k}"><span>${n}${k === "connections" ? ` <em>${nConn}</em>` : ""}</span></button>`).join("")}</div>
          <div class="rg-tabbody" role="tabpanel">${body}</div>
        </div>${E ? "" : `<aside class="rg-fside" aria-label="Resident card">${recCard(s)}${sideFacts(s)}</aside>`}</div>
      </div>
      ${st.lists ? listsSheet() : ""}
    </div>`;
    st.msg = ""; st.err = false;
    root.scrollTop = keepY;
    if (st.focus) { const el = root.querySelector("#rg-at-" + st.focus); st.focus = null; if (el) { el.scrollIntoView({ block:"center" }); el.querySelector("input,select,textarea")?.focus({ preventScroll:true }); } }
  }

  /* ---------- Edit file ---------- */
  function startEdit(s, focus){
    const info = R().simInfo(s.id), home = homeOf(s);
    st.draft = { name:s.name, simsta:s.simsta || "", age:s.age ?? "", life_stage:s.life_stage || "", gender:s.gender || "", career:s.career || "", residence:s.residence || "", household:s.household || "", newHousehold:false,
      townie:!!info.townie, summary:info.summary || "", traits:[...(s.traits || [])], aspiration:s.aspiration || "", attachment:s.attachment || "", love_language:s.love_language || "",
      romantic_attraction:s.romantic_attraction || "", sexual_attraction:s.sexual_attraction || "", likes:[...(s.likes || [])], dislikes:[...(s.dislikes || [])], turn_ons:[...(s.turn_ons || [])], turn_offs:[...(s.turn_offs || [])],
      portrait:s.portrait || null, headshot:s.headshot || null, home:home ? home.id : "", owns:ownedBy(s).map(l => l.id) };
    st.editing = true; st.focus = focus || null; st.sheet = null;
  }
  async function saveProperty(s, homeId, owns){
    let household = s.household;
    const oldHome = homeOf(s);
    if (homeId && (!oldHome || oldHome.id !== homeId)) {
      const lot = lots().find(l => l.id === homeId);
      if (lot.household && lot.household !== household) household = lot.household;
      else if (!lot.household) {
        if (!household) household = stripNick(s.name).split(" ").slice(-1)[0] + " Household";
        for (const l of lots().filter(l => l.household === household && RESIDENTIAL.includes(l.lot_type))) await GFB.saveLot({ ...l, household:null });
        await GFB.saveLot({ ...lot, household, market_status: lot.market_status === "For lease" ? "Leased" : lot.market_status === "For sale" ? "Owner-occupied" : lot.market_status });
      }
    } else if (!homeId && oldHome && data.sims.filter(x => x.household === household).length <= 1) {
      await GFB.saveLot({ ...oldHome, household:null, market_status: oldHome.market_status === "Leased" ? "For lease" : oldHome.market_status });
    }
    const me = stripNick(s.name), want = new Set(owns);
    for (const l of lots()) {
      const mine = l.owner_sim === s.id || (!l.owner_sim && l.owner === me);
      if (want.has(l.id) && !mine) await GFB.saveLot({ ...l, owner:me });
      if (!want.has(l.id) && mine) await GFB.saveLot({ ...l, owner:null });
    }
    if (household !== s.household) await GFB.saveSim(s.id, { household });
  }
  async function saveFile(){
    const s = simById(curId), d = st.draft;
    st.busy = true; draw();
    const snap = statusSnap(data.sims.filter(x => x.id === s.id || (s.household && x.household === s.household)).map(x => x.id));
    try {
      const keys = ["name","simsta","life_stage","gender","career","residence","household","traits","aspiration","attachment","love_language","romantic_attraction","sexual_attraction","likes","dislikes","turn_ons","turn_offs","portrait","headshot"];
      const norm = (k, v) => Array.isArray(v) ? v : (v === "" ? null : v);
      const patch = {};
      keys.forEach(k => { const nv = k === "name" ? (String(d.name || "").trim() || s.name) : (["career","residence"].includes(k) ? String(d[k] || "").trim() : norm(k, typeof d[k] === "string" ? d[k].trim() : d[k])); const ov = k === "career" || k === "residence" ? (s[k] || "") : (s[k] ?? (Array.isArray(nv) ? [] : null)); if (JSON.stringify(nv) !== JSON.stringify(ov)) patch[k] = nv; });
      const age = d.age === "" || d.age == null ? null : Number(d.age); if (age !== (s.age ?? null)) patch.age = age;
      for (const [k] of [...PREF_KEYS, ["traits"]]) if (patch[k]) { const list = data.options[k] || [], add = patch[k].filter(x => !list.some(y => y.toLowerCase() === x.toLowerCase())); if (add.length) await GFB.saveOptions(k, [...list, ...add].sort((a, b) => a.localeCompare(b))); }
      if (Object.keys(patch).length) await GFB.saveSim(s.id, patch);
      data = await GFB.getAll();
      const fresh = simById(s.id), home = homeOf(fresh), owned = ownedBy(fresh).map(l => l.id).sort().join();
      if ((home ? home.id : "") !== d.home || owned !== [...d.owns].sort().join()) { await saveProperty(fresh, d.home, d.owns); data = await GFB.getAll(); }
      const info = R().simInfo(s.id), sum = String(d.summary || "").trim() || null;
      if ((info.summary || null) !== sum || !!info.townie !== !!d.townie) {
        try { await R().saveSimInfo(s.id, { summary:sum, townie:!!d.townie }); }
        catch (e) { st.busy = false; st.editing = false; st.draft = null; st.msg = "The file saved, but the Summary and Townie need the cloud: " + e.message; st.err = true; data = await GFB.getAll(); return draw(); }
      }
      data = await GFB.getAll();
      const ids = new Set([...Object.keys(snap), ...data.sims.filter(x => x.id === s.id || (simById(s.id).household && x.household === simById(s.id).household)).map(x => x.id)]);
      await logHomeChanges({ ...Object.fromEntries([...ids].map(id => [id, snap[id] || null])) });
      st.editing = false; st.draft = null; st.msg = "File saved."; st.err = false;
    } catch (e) { st.msg = e.message; st.err = true; }
    st.busy = false; data = await GFB.getAll(); draw();
  }

  /* ---------- new residents ---------- */
  async function createSim(name){
    name = String(name || "").trim(); if (!name) return;
    const existing = findSim(name);
    if (existing) { location.hash = "#/registry/" + existing.id; return; }
    const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let id = slug(first(name)) || "resident";
    if (simById(id)) { id = slug(stripNick(name)); let n = 2; while (simById(id)) id = slug(stripNick(name)) + "-" + n++; }
    const file_no = String(Math.max(0, ...data.sims.map(x => parseInt(x.file_no, 10) || 0)) + 1).padStart(3, "0");
    await GFB.addSim({ id, file_no, name, simsta:null, age:null, life_stage:null, gender:null, career:"", residence:"", household:null, status:null,
      traits:[], aspiration:null, attachment:null, love_language:null, likes:[], dislikes:[], turn_ons:[], turn_offs:[], notes:[], secrets:[] });
    /* "file pending" links to this name now point at the new file, so nothing has to be relinked */
    if (R().canEdit()) for (const l of R().all().filter(l => !l.b_sim && l.b_name && l.b_name.toLowerCase() === name.toLowerCase())) { try { await R().saveLink({ ...l, b_sim:id, b_name:null }); } catch {} }
    st.tab = "profile";
    data = await GFB.getAll();
    st.nextEdit = true;
    location.hash = "#/registry/" + id;
  }

  /* ---------- photos ---------- */
  async function pickPhoto(kind){
    const s = simById(curId), d = st.draft;
    if (typeof PhotoSlot === "undefined" || !PhotoSlot.ready()) {      /* not signed in to the cloud: the plain file picker still works */
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = async () => { if (!inp.files[0]) return; try { d[kind] = (await GFB.uploadImage(inp.files[0], 800)).url; } catch (err) { st.msg = err.message; st.err = true; } draw(); };
      inp.click(); return;
    }
    const head = kind === "headshot";
    const r = await PhotoSlot.open({ shape:head ? "circle" : "portrait", aspect:head ? 1 : 4 / 5, outW:800, title:head ? `Huddl headshot · ${first(s.name)}` : `File photo · ${first(s.name)}`,
      sims:[s.id], current:d[kind] || "", removable:!!d[kind], removeLabel:head ? "Remove headshot" : "Remove file photo",
      previews:head ? [{ label:"Huddl", size:44 }] : [{ label:"File", size:60 }, { label:"Card", size:44 }] });
    if (!r) return;
    d[kind] = r.removed ? null : r.url; draw();
  }

  /* ---------- events (bound once) ---------- */
  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-registry");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target, s = curId ? simById(curId) : null;
      const tla = t.closest("[data-tl]")?.dataset.tl; if (tla && s) { if (tla === "remove" && !UI.confirmTap(t.closest("[data-tl]"), "Tap again to remove")) return; tlAction(tla, s); return; }
      const tlo = t.closest("[data-tlopen]"); if (tlo && s) { tlOpen(tlo.dataset.tlopen, s); return; }
      const ln = t.closest("[data-link]"); if (ln && s) { const l = R().linkById(ln.dataset.link); if (l) openSheet(s, l); return; }
      const fl = t.closest("[data-filter]"); if (fl) { st.filter = fl.dataset.filter; return draw(); }
      const wh = t.closest("[data-where]"); if (wh) { st.where = wh.dataset.where; return draw(); }
      const cs = t.closest("[data-cscope]"); if (cs) { st.cscope = cs.dataset.cscope; return draw(); }
      const vw = t.closest("[data-view]"); if (vw) { st.view = vw.dataset.view; return draw(); }
      const tb = t.closest("[data-tab]"); if (tb) { st.tab = tb.dataset.tab; st.openLink = null; return draw(); }
      const ad = t.closest("[data-addat]"); if (ad && s) { const [tab, key] = ad.dataset.addat.split(":"); st.tab = tab; startEdit(s, key === "owns" ? "owns" : key === "home" ? "home" : key); return draw(); }
      const ut = t.closest("[data-untrait]"); if (ut && st.draft) { st.draft.traits.splice(Number(ut.dataset.untrait), 1); return draw(); }
      const ug = t.closest("[data-untag]"); if (ug && st.draft) { const [k, i] = ug.dataset.untag.split(":"); st.draft[k].splice(Number(i), 1); return draw(); }
      const ta = t.closest("[data-tagadd]"); if (ta && st.draft) { addTag(ta.dataset.tagadd); return; }
      const pf = t.closest("[data-file]"); if (pf) { if (UI.confirmTap(pf.querySelector("[data-confirm]") || pf, "Tap again to open a file")) createSim(pf.dataset.file); return; }
      const act = t.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "new") openNew();
      if (act === "filters") openFilters();
      if (act === "clearbatch") { st.batch = null; draw(); }
      if (act === "moveplan") { st.move = {}; draw(); }
      if (act === "movecancel") { st.move = null; draw(); }
      if (act === "movedone") { st.move = null; draw(); }
      if (act === "movego") { st.busy = true; draw(); try { const r = await R().move(); st.move = r.already ? null : { done:r }; data = await GFB.getAll(); } catch (err) { st.move = { err:err.message }; } st.busy = false; draw(); }
      if (act === "edit" && s) { startEdit(s); draw(); }
      if (act === "canceledit") { st.editing = false; st.draft = null; draw(); }
      if (act === "savefile") saveFile();
      if (act === "fillgaps" && s) { const g = gaps(s); startEdit(s, g[0]); st.tab = "profile"; draw(); }
      if (act === "hidesecrets") { st.hideSecrets = !st.hideSecrets; st.openLink = null; draw(); }
      if (act === "needmove") { st.msg = "Connections are read only until your Registry moves to its new tables. Use the banner at the top to check the counts and move."; st.err = true; draw(); root.scrollTop = 0; }
      if (act === "addlink" && s) openSheet(s, null);
      if (act === "oldtoggle") { st.oldOpen = !st.oldOpen; draw(); }
      if (act === "copysummary" && s && st.draft) { const plain = (s.notes || []).join("\n\n").replace(/^#+\s*/gm, "").replace(/\*\*|__/g, ""); st.draft.summary = [st.draft.summary, plain].filter(x => String(x || "").trim()).join("\n\n"); st.tab = "profile"; st.focus = "summary"; draw(); }
      if (act === "lists") { st.lists = true; draw(); }
      if (act === "listsclose") { st.lists = false; draw(); }
      if (act === "portrait" && st.draft) pickPhoto("portrait");
      if (act === "headshot" && st.draft) pickPhoto("headshot");
    });

    /* phone: swipe left for the next resident, right for the previous one */
    let sx = 0, sy = 0, sOk = false;
    document.addEventListener("touchstart", e => {
      sOk = false; if (!mine(e.target) || !curId || st.editing || st.sheet || st.lists || e.touches.length !== 1 || root.offsetWidth > 700) return;
      if (e.target.closest("input,select,textarea,.ui-chips,.rg-sheetwrap")) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; sOk = sx > 24;
    }, { passive:true });
    document.addEventListener("touchend", e => {
      if (!sOk) return; sOk = false; const c = e.changedTouches[0], dx = c.clientX - sx, dy = c.clientY - sy;
      if (Math.abs(dx) < 80 || Math.abs(dy) > 40 || Math.abs(dx) < Math.abs(dy) * 2) return;
      const nb = neighbors(curId), id = dx < 0 ? nb.next : nb.prev; if (id) location.hash = "#/registry/" + id;
    }, { passive:true });
    document.addEventListener("input", e => {
      if (!mine(e.target)) return;
      if (e.target.id === "rg-q") { st.q = e.target.value; const g = root.querySelector("#rg-results"); if (g) g.innerHTML = resultsHTML(); return; }
      const k = e.target.dataset.d; if (k && st.draft && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") st.draft[k] = e.target.value;
    });
    document.addEventListener("change", e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.id === "rg-sort") { st.sort = t.value; return draw(); }
      if (t.matches("[data-addtrait]") && st.draft) { if (t.value && !st.draft.traits.includes(t.value)) st.draft.traits.push(t.value); return draw(); }
      if (t.dataset.own && st.draft) { const set = new Set(st.draft.owns); t.checked ? set.add(t.dataset.own) : set.delete(t.dataset.own); st.draft.owns = [...set]; return; }
      if (t.dataset.tlf === "what" && st.tl.add) { tlRead(); st.tl.add.what = t.value; return draw(); }
      const k = t.dataset.d;
      if (k && st.draft) {
        if (t.type === "checkbox") st.draft[k] = t.checked;
        else if (k === "household" && t.value === "__new") { st.draft.newHousehold = true; st.draft.household = ""; draw(); root.querySelector('[data-d="household"]')?.focus(); }
        else st.draft[k] = t.value;
      }
      
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && st.lists && root && root.querySelector(".site-registry") && !e.target.closest?.("input,textarea,select")) { e.stopImmediatePropagation(); st.lists = false; draw(); return; }
      if (!mine(e.target)) return;
      if (e.key === "Enter" && e.target.closest?.(".rg-tagadd")) { e.preventDefault(); addTag(e.target.closest(".rg-tagedit").dataset.tagkey); }
      if (e.key === "Escape" && st.lists) { e.stopImmediatePropagation(); st.lists = false; draw(); }
    }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      const f = new FormData(e.target), key = e.target.dataset.sec;
      if (key === "lists") {
        try { for (const [k] of LIST_KEYS) await GFB.saveOptions(k, [...new Set(String(f.get(k) || "").split("\n").map(x => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))); st.msg = "Option lists saved."; }
        catch (err) { st.msg = err.message; st.err = true; }
        st.lists = false; data = await GFB.getAll(); draw();
      }
    });
  }
  function addTag(key){
    const box = root.querySelector(`.rg-tagedit[data-tagkey="${key}"]`), input = box && box.querySelector("input");
    if (!input || !st.draft) return;
    const have = new Set(st.draft[key].map(x => x.toLowerCase()));
    input.value.split(",").map(x => x.trim()).filter(Boolean).forEach(v => { if (!have.has(v.toLowerCase())) { st.draft[key].push(v); have.add(v.toLowerCase()); } });
    draw(); root.querySelector(`.rg-tagedit[data-tagkey="${key}"] input`)?.focus();
  }

  function render(el, d, id, arg){
    root = el; data = d;
    if (id !== curId) { root.scrollTop = 0; st.editing = !!st.nextEdit && !!id; st.draft = null; st.sheet = null; st.openLink = null; st.oldOpen = false; st.lists = false; }
    curId = id;
    if (!id && arg && String(arg).startsWith("batch:")) { const b = String(arg).slice(6), ids = GFB.registry.batchSims ? GFB.registry.batchSims(b) : []; st.batch = { id:b, ids:ids.length ? ids : ((window.SimDeskLastImport && window.SimDeskLastImport.batch === b) ? window.SimDeskLastImport.ids : []) }; }
    if (st.editing && !st.draft && id) { startEdit(simById(id)); }
    st.nextEdit = false;
    bind();
    draw();
  }
  return { render };
})();
