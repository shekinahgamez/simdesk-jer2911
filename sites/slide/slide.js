/* Slide: the dating app Sims use to find each other. Pick whose phone you're on, then swipe through everyone who fits.
   It only suggests. Nothing happens in the save unless there's a match (or you shoot your shot):
   then both Sims' Registry files get a Romance connection dated on the save's calendar.
   Profiles build themselves from data already on file (Simsta picture, age, city, district, traits, likes, Huddl job).
   Swipes, each Sim's distance and burner settings, and the match list save through GFB.saveSlide, so they sync like the other apps. */
const Slide = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => stripNick(n).split(" ")[0];
  const initials = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0, 2).join("");
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const low = s => String(s || "").trim().toLowerCase();

  /* ---------- the map: which city is in which region (from the SimNation Travel region setup) ---------- */
  const REGIONS = {
    "Simaryland": ["Fenmore","Maplewood Drive","Lennox Park","Baymore","Linden Sound","Bellhaven"],
    "Simifornia": ["Palm Mesa","Aurora Hills","Redwood Bay","Palomino"],
    "Simorado": ["Port Hollis","Corbin","Wrenfield","Silverpine Falls"],
    "Eurosimia": ["Alvaria","Britechester","Thistledown","Lindengaard","Tartosa"],
    "Simasia": ["Seoran","Marataya","Malai'i","Marawai Cove"],
    "Latin Simerica": ["Costa Palma","Cozumar"]
  };
  const REGION_OF = new Map(Object.entries(REGIONS).flatMap(([r, cities]) => cities.map(c => [low(c), r])));
  const STOPS = ["Same district", "Same city", "Same coast", "Anywhere"];
  const DEFAULT_RANGE = 2;

  /* ---------- wealth (for Wealthy and Broke turn ons and offs) ---------- */
  const WEALTHY = 250000, BROKE = 1000;
  const LIFE_OK = ["young adult", "adult", "elder"];

  /* ---------- saved state ---------- */
  let data = null, root = null, S = null;
  const st = { editId:null, more:false, sheet:null, q:"", filter:"all", match:null, err:null, drag:null, flash:null };
  function state() {
    const saved = data.slide;
    S = saved && typeof saved === "object" ? saved : {};
    S.v = 1; S.profiles = S.profiles || {}; S.prefs = S.prefs || {}; S.swipes = S.swipes || {}; S.matches = S.matches || []; S.phone = S.phone || "";
    return S;
  }
  async function persist() { await GFB.saveSlide(S); data = await GFB.getAll(); }
  const simById = id => data.sims.find(s => s.id === id);
  const pref = id => ({ range:DEFAULT_RANGE, burner:false, ...(S.prefs[id] || {}) });
  const swipesOf = id => S.swipes[id] || (S.swipes[id] = {});

  /* ---------- who's who ---------- */
  const genderOf = s => { const g = low(s.gender); return g.startsWith("m") ? "M" : g.startsWith("f") ? "F" : null; };
  const lifeOk = s => LIFE_OK.includes(low(s.life_stage));
  /* attraction not rolled yet is treated as straight, for both sexual and romantic */
  function into(s, key) {
    const g = genderOf(s); if (!g) return new Set();
    const other = g === "M" ? "F" : "M", v = low(s[key]) || "opposite sex";
    if (v.startsWith("both")) return new Set(["M", "F"]);
    if (v.startsWith("same")) return new Set([g]);
    if (v.startsWith("opp")) return new Set([other]);
    return new Set();
  }
  const twoWay = (a, b, key) => into(a, key).has(genderOf(b)) && into(b, key).has(genderOf(a));
  const intoLabel = s => {
    const g = genderOf(s); if (!g) return "";
    const word = set => set.size === 2 ? "everyone" : set.has("F") ? "women" : "men";
    const sx = into(s, "sexual_attraction"), ro = into(s, "romantic_attraction");
    return word(sx) === word(ro) ? "into " + word(sx) : `into ${word(ro)}, attracted to ${word(sx)}`;
  };
  const notRolled = s => !s.sexual_attraction || !s.romantic_attraction;

  /* ---------- where they live ---------- */
  const RESIDENTIAL = ["Apartment","Residential","Residential Rental"];
  const lots = () => data.lots || [];
  const city = s => String(s.residence || "").replace(/,\s*[A-Z]{2}$/, "").trim();
  const region = s => REGION_OF.get(low(city(s))) || null;
  function district(s) {
    if (!s.household) return null;
    const home = lots().find(l => l.household === s.household && (RESIDENTIAL.includes(l.lot_type) || !l.lot_type)) || lots().find(l => l.household === s.household);
    if (!home) return null;
    const parent = home.parent_id ? lots().find(x => x.id === home.parent_id) : null;
    return home.district || (parent && parent.district) || null;
  }
  /* 0 same district, 1 same city, 2 same coast/region, 3 anywhere. No city on file only fits Anywhere; no lot skips Same district. */
  function distance(a, b) {
    const ca = low(city(a)), cb = low(city(b));
    if (!ca || !cb) return 3;
    if (ca === cb) { const da = district(a), db = district(b); return da && db && low(da) === low(db) ? 0 : 1; }
    const ra = region(a), rb = region(b);
    return ra && rb && ra === rb ? 2 : 3;
  }
  const place = s => [city(s), district(s)].filter(Boolean).join(" · ");

  /* ---------- connections already on file ---------- */
  const rels = () => data.relationships || [];
  const between = (a, b) => rels().filter(r => (r.from_sim === a.id && r.to_sim === b.id) || (r.from_sim === b.id && r.to_sim === a.id));
  const fromSlide = r => /^matched on slide/i.test(r.label || "");
  const isTaken = s => rels().some(r => r.from_sim === s.id && r.kind === "rom" && !fromSlide(r) && /^(dating|spouse)/i.test(r.label || ""));
  const isFamily = (a, b) => between(a, b).some(r => r.kind === "fam");

  /* ---------- jobs and clubs (Huddl and Cliq share organizations) ---------- */
  const orgs = () => data.organizations || [];
  const isClub = o => low(o.type) === "club";
  const memberOf = (o, s) => (o.members || []).some(m => m.sim === s.id && m.current !== false);
  function job(s) {
    const o = orgs().find(o => !isClub(o) && memberOf(o, s));
    if (o) { const m = o.members.find(m => m.sim === s.id); return m.role ? `${m.role}, ${o.name}` : o.name; }
    return s.career || "";
  }

  /* ---------- the profile a Sim shows on Slide ----------
     It starts as a copy of the Registry. An edit is saved only here (S.profiles), never in the Registry, so a Sim can lie on their
     profile. Fields nobody edited keep following the Registry. Everything people react to (the read, matches) uses this version. */
  const FIELDS = ["job", "traits", "likes", "dislikes"];
  const realProfile = s => ({ job:job(s), traits:s.traits || [], likes:s.likes || [], dislikes:s.dislikes || [] });
  const shown = s => ({ ...realProfile(s), ...(S.profiles[s.id] || {}) });
  const editedFields = s => FIELDS.filter(k => k in (S.profiles[s.id] || {}));

  /* ---------- money ---------- */
  function wealth(s) {
    const acts = (data.accounts || []).filter(a => !a.card && a.status !== "Closed" && (a.holder_sim === s.id || a.co_holder === s.id));
    if (!acts.length) return null;
    const total = acts.reduce((n, a) => n + (Number(a.balance) || 0), 0);
    return total >= WEALTHY ? "wealthy" : total < BROKE ? "broke" : "middle";
  }

  /* ---------- the compatibility read: only what SimDesk can actually check ---------- */
  const words = s => { const p = shown(s); return [...p.traits, ...p.likes, p.job].filter(Boolean).map(low); };
  /* does Sim b have this turn on/off? Matches traits, likes, and job by name; Wealthy/Broke from bank balances; Taken from the Registry. Anything else is left out. */
  function check(item, b) {
    const t = low(item);
    if (/wealth|rich|money/.test(t)) { const w = wealth(b); return w == null ? null : w === "wealthy"; }
    if (/broke|poor/.test(t)) { const w = wealth(b); return w == null ? null : w === "broke"; }
    if (/^(taken|attached|in a relationship|married)$/.test(t)) return isTaken(b);
    const has = words(b).some(w => w === t || w.split(/[^a-z0-9']+/).includes(t) || (t.length > 3 && w.includes(t)));
    return has ? true : null;
  }
  function read(a, b) {
    const hits = (a.turn_ons || []).filter(x => check(x, b) === true);
    const trips = (a.turn_offs || []).filter(x => check(x, b) === true);
    const bl = new Set(shown(b).likes.map(low));   /* what they claim to like, not what they really like */
    const shared = (a.likes || []).filter(x => bl.has(low(x)));
    return { hits, trips, shared, score: hits.length * 2 + shared.length - trips.length * 3 };
  }

  /* ---------- small world ---------- */
  function smallWorld(a, b) {
    const out = [];
    const clubs = orgs().filter(o => isClub(o) && memberOf(o, a) && memberOf(o, b)).map(o => o.name);
    if (clubs.length) out.push(`both in ${clubs.join(" and ")} on Cliq`);
    const work = orgs().filter(o => !isClub(o) && memberOf(o, a) && memberOf(o, b)).map(o => o.name);
    if (work.length) out.push(`both work at ${work.join(" and ")}`);
    if (a.household && a.household === b.household) out.push(`they live in the same household (${a.household})`);
    const dated = s => new Set(rels().filter(r => r.from_sim === s.id && (r.kind === "rom" || r.kind === "ex") && !fromSlide(r) && r.to_sim).map(r => r.to_sim));
    const da = dated(a), both = [...dated(b)].filter(id => da.has(id) && id !== a.id && id !== b.id).map(simById).filter(Boolean);
    if (both.length) out.push(`they've both dated ${both.map(x => stripNick(x.name)).join(" and ")}`);
    const already = between(a, b).filter(r => r.from_sim === a.id && !fromSlide(r));
    if (already.length) out.push(`already in each other's files (${already.map(r => (data.options.relationship_kind || {})[r.kind] || r.kind).join(", ")})`);
    return out;
  }

  /* ---------- who can show up on whose phone ---------- */
  const canSwipe = s => lifeOk(s) && !!genderOf(s);
  function fit(a, b) {
    if (a.id === b.id || !canSwipe(b) || isFamily(a, b) || between(a, b).some(r => r.kind === "rom")) return null;   /* family and anyone they already date never show; exes can */
    const ro = twoWay(a, b, "romantic_attraction"), sx = twoWay(a, b, "sexual_attraction");
    if (!ro && !sx) return null;
    const d = distance(a, b), range = pref(a.id).range;
    if (d > range) return null;
    return { b, d, justFun: sx && !ro, far: d >= 2 && d === range, read: read(a, b) };
  }
  function deck(a) {
    const seen = swipesOf(a.id), matched = new Set(S.matches.filter(m => m.a === a.id || m.b === a.id).map(m => m.a === a.id ? m.b : m.a));
    return data.sims.map(b => !seen[b.id] && !matched.has(b.id) ? fit(a, b) : null).filter(Boolean)
      .filter(c => st.filter !== "fun" || c.justFun)
      .sort((x, y) => y.read.score - x.read.score || x.d - y.d || stripNick(x.b.name).localeCompare(stripNick(y.b.name)));
  }
  /* would b slide back? Same attraction both ways (already true), a has to be in b's range, b can't have passed on a,
     and a can't trip more of b's turn offs than they hit turn ons. */
  function wouldMatch(a, b) {
    const theirs = (S.swipes[b.id] || {})[a.id];
    if (theirs === "p") return { yes:false, why:`${first(b.name)} already passed.` };
    if (theirs === "l" || theirs === "s") return { yes:true };
    if (distance(b, a) > pref(b.id).range) return { yes:false, why:`${first(a.name)} is outside ${first(b.name)}'s range.` };
    const r = read(b, a);
    if (r.trips.length && r.trips.length >= r.hits.length) return { yes:false, why:`${first(a.name)} trips ${first(b.name)}'s turn offs.` };
    return { yes:true };
  }

  /* ---------- swiping ---------- */
  const today = () => UI.gameToday(data.calendar);
  async function swipe(kind) {
    st.more = false;
    const a = simById(S.phone), c = a && deck(a)[0]; if (!c) return;
    const b = c.b;
    swipesOf(a.id)[b.id] = kind === "pass" ? "p" : kind === "shot" ? "s" : "l";
    if (kind === "pass") { await persist(); draw(); return; }
    const w = kind === "shot" ? { yes:true } : wouldMatch(a, b);
    if (!w.yes) { st.flash = `Slid on ${first(b.name)}. No match yet.`; await persist(); draw(); return; }
    await makeMatch(a, b, c, kind === "shot" ? "shot" : "mutual");
  }
  async function makeMatch(a, b, c, how) {
    const date = today(), label = "Matched on Slide, " + UI.gameLabel(date);
    const m = { id:uid("sm-"), a:a.id, b:b.id, date, how, fun:!!c.justFun, far:!!c.far, texted:false };
    S.matches.unshift(m);
    try {
      /* the Registry log: one Romance row in each file, pointing at each other. Skipped if they already have a Romance row. */
      if (!between(a, b).some(r => r.kind === "rom")) {
        const r1 = await GFB.saveRel({ from_sim:a.id, to_sim:b.id, to_name:null, kind:"rom", label, secret:null, hidden:false });
        const r2 = await GFB.saveRel({ from_sim:b.id, to_sim:a.id, to_name:null, kind:"rom", label, secret:null, hidden:false, pair:r1.id });
        await GFB.saveRel({ id:r1.id, pair:r2.id });
        m.rel = [r1.id, r2.id];
      }
      await persist(); st.err = null;
    } catch (e) { st.err = e.message; }
    st.match = m.id; draw();
  }

  /* Texting a match starts their Messages thread (tagged Met on Slide) with the line "Connected via text · [date]".
     The Registry log above stays as is. If the cloud is out, Messages adds the thread the next time it opens. */
  async function textThread(m) {
    if (m.thread || !GFB.messages || !GFB.messages.ready()) { if (!m.thread) { st.flash = "Texted. The thread shows up in Messages once the cloud is connected."; draw(); } return; }
    try {
      const d = m.texted_on || today();
      const r = await GFB.messages.ensure([m.a, m.b], "slide", { system:"Connected via text · " + UI.gameLabel(d), game_date:d });
      m.thread = r.thread.id; await persist();
      st.flash = `Texted. ${first(simById(m.a).name)} and ${first(simById(m.b).name)} are in Messages now.`;
    } catch (e) { st.flash = "Texted. The thread will be added the next time Messages opens."; }
    draw();
  }

  /* ---------- pieces ---------- */
  let markN = 0;
  const MARK = () => { const g = "slMk" + (++markN); return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF5A36"/><stop offset="1" stop-color="#FF2E63"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#${g})"/><path d="M17 20h30a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5H31l-9 7v-7h-5a5 5 0 0 1-5-5V25a5 5 0 0 1 5-5z" fill="#fff"/><path d="M24 35l9-9m0 0h-7m7 0v7" stroke="#FF2E63" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`; };
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const av = (s, cls = "") => s.portrait ? `<img class="sl-av ${cls}" src="${esc(s.portrait)}" alt="">` : `<span class="sl-av ${cls}" style="--h:${hue(s.name) % 40}">${esc(initials(s.name))}</span>`;
  const ICON = {
    pass:'<path d="M6 6l12 12M18 6L6 18"/>',
    slide:'<path d="M5 19L19 5m0 0h-9m9 0v9"/>',
    shot:'<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none"/>',
    alert:'<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    hush:'<circle cx="12" cy="12" r="9"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/><rect x="10.8" y="11.5" width="2.4" height="8.5" rx="1.2" fill="#121014"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    heart:'<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>'
  };
  const ic = (k, w = 2.4) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  function meBox(a) {
    return `<button type="button" class="sl-me" data-sl="phone">${a ? av(a, "sm") : `<span class="sl-av sm">?</span>`}<span><b>${a ? esc(stripNick(a.name)) : "Pick a Sim"}</b><small>${a ? esc([city(a) || "No city", intoLabel(a)].filter(Boolean).join(" · ")) : "Whose phone are you on?"}</small></span><span class="sl-chev" aria-hidden="true">▾</span></button>`;
  }
  function settingsHTML(a) {
    if (!a) return "";
    const p = pref(a.id), sw = swipesOf(a.id), passed = Object.values(sw).filter(v => v === "p").length;
    const pct = p.range / 3 * 100, stops = STOPS.map((s, i) => `<b class="${i < p.range ? "on" : i === p.range ? "cur" : ""}" style="left:${i / 3 * 100}%"></b>`).join("");
    return `<div class="sl-box"><h4>How far ${esc(first(a.name))} will go</h4>
        <div class="sl-track"><i style="width:${pct}%"></i>${stops}<input type="range" min="0" max="3" step="1" value="${p.range}" data-sl-range aria-label="Distance range" aria-valuetext="${STOPS[p.range]}"></div>
        <div class="sl-stops">${STOPS.map((s, i) => `<span class="${i === p.range ? "cur" : ""}">${s}</span>`).join("")}</div>
        ${!city(a) ? `<p class="sl-hint">No city on file, so only Anywhere finds anyone.</p>` : !district(a) && p.range === 0 ? `<p class="sl-hint">No lot on file, so there's no district to match.</p>` : ""}</div>
      <div class="sl-box"><button type="button" class="sl-tog" data-sl="burner" role="switch" aria-checked="${p.burner}"><span>Burner profile<small>${isTaken(a) ? "Swiping while taken, quietly" : "Swiping on the low"}</small></span><span class="sl-sw ${p.burner ? "on" : ""}"></span></button></div>
      <div class="sl-box"><button type="button" class="sl-btn" data-sl="edit:${a.id}">Edit ${esc(first(a.name))}'s profile</button><p class="sl-hint">Changes stay in Slide. The Registry doesn't change.</p></div>
      <div class="sl-box"><div class="sl-stat"><span>Left to see</span><b>${deck(a).length}</b></div><div class="sl-stat"><span>Passed</span><b>${passed}</b></div><div class="sl-stat"><span>Matches</span><b>${S.matches.filter(m => m.a === a.id || m.b === a.id).length}</b></div></div>`;
  }
  function matchesHTML(a) {
    if (!a) return `<div class="sl-box"><h4>Matches</h4><p class="sl-hint">Pick whose phone you're on.</p></div>`;
    const mine = S.matches.filter(m => m.a === a.id || m.b === a.id);
    const rows = mine.map(m => { const o = simById(m.a === a.id ? m.b : m.a); if (!o) return ""; const tags = [UI.gameLabel(m.date).replace(/, Year \d+$/, ""), m.how === "shot" ? "Shot their shot" : "", m.fun ? "Just fun" : "", m.far ? "Long distance" : ""].filter(Boolean).join(" · ");
      return `<button type="button" class="sl-mrow" data-sl="open:${m.id}">${av(o, "sm")}<span>${esc(stripNick(o.name))}<small>${esc(tags)}</small></span><span class="sl-tx ${m.texted ? "done" : ""}">${m.texted ? "Texted" : "Text"}</span></button>`; }).join("");
    const waiting = Object.entries(swipesOf(a.id)).filter(([id, v]) => v === "l" && !mine.some(m => m.a === id || m.b === id)).map(([id]) => simById(id)).filter(Boolean);
    return `<div class="sl-box"><h4>Matches</h4>${rows || `<p class="sl-hint">No matches yet.</p>`}</div>
      ${waiting.length ? `<div class="sl-box"><h4>Waiting on them</h4>${waiting.map(o => `<div class="sl-mrow">${av(o, "sm")}<span>${esc(stripNick(o.name))}<small>Slid · no match yet</small></span></div>`).join("")}</div>` : ""}`;
  }
  function card(a, c, ghost) {
    const b = c.b, r = c.read, sw = smallWorld(a, b), p = pref(b.id), sh = shown(b);
    const badges = [c.justFun ? `<span class="sl-tag fun">Just fun</span>` : "", c.far ? `<span class="sl-tag far">Long distance</span>` : "",
      p.burner ? `<span class="sl-tag far">Burner</span>` : "", editedFields(b).length ? `<span class="sl-tag far icon" role="img" aria-label="Edited profile" title="Edited profile">${ic("hush", 1.8)}</span>` : "", isTaken(b) ? `<span class="sl-tag taken">Taken · only you see this</span>` : ""].join("");
    const ok = [b.age, b.life_stage && !b.age ? b.life_stage : ""].filter(Boolean).join("");
    const likes = sh.likes, dislikes = sh.dislikes;
    const shared = new Set(r.shared.map(low));
    const line = (k, cls, list) => list.length ? `<div><b>${k}</b><span class="${cls}">${list.map(esc).join(", ")}</span></div>` : "";
    return `<article class="sl-card ${ghost ? "ghost" : ""}" ${ghost ? 'aria-hidden="true"' : `id="sl-card" aria-label="${esc(stripNick(b.name))}"`}>
      <div class="sl-photo">${b.portrait ? `<img src="${esc(b.portrait)}" alt="" draggable="false">` : `<span class="sl-ph">${esc(initials(b.name))}</span>`}
        <span class="sl-stamp like">Slide</span><span class="sl-stamp nope">Pass</span>
        <div class="sl-badges">${badges}</div>
        <button type="button" class="sl-edit" data-sl="edit:${b.id}" aria-label="Edit ${esc(first(b.name))}'s profile">${ic("edit", 2)}</button>
        <div class="sl-namebar"><h3>${esc(stripNick(b.name))}${ok ? ` <span>${esc(ok)}</span>` : ""}</h3><p>${sh.job ? `<span>${esc(sh.job)}</span>` : ""}<span>${esc(place(b) || "No city on file")}</span></p></div></div>
      <div class="sl-body">
        ${sh.traits.length ? `<div class="sl-chips">${sh.traits.map(t => `<span class="sl-chip">${esc(t)}</span>`).join("")}</div>` : ""}
        ${r.hits.length || r.trips.length || r.shared.length ? `<div class="sl-compat">${line("Hits", "good", r.hits)}${line("Trips", "bad", r.trips)}${line("Shared", "like", r.shared)}</div>` : `<p class="sl-hint">Nothing on file to compare yet.</p>`}
        ${sw.length ? `<div class="sl-alert">${ic("alert", 2)}<span><b>Small world.</b> ${esc(sw.join("; ").replace(/^./, x => x.toUpperCase()))}.</span></div>` : ""}
        ${likes.length || dislikes.length ? `<div class="sl-more ${st.more ? "open" : ""}">
          ${likes.length ? `<div class="sl-likes"><b>Likes</b> ${likes.map(l => `<span class="${shared.has(low(l)) ? "sh" : ""}">${esc(l)}</span>`).join("")}</div>` : ""}
          ${dislikes.length ? `<div class="sl-likes dis"><b>Dislikes</b> ${dislikes.map(l => `<span>${esc(l)}</span>`).join("")}</div>` : ""}
          <button type="button" class="sl-showmore" data-sl="more" hidden>${st.more ? "Show less" : "Show more"}</button></div>` : ""}
      </div></article>`;
  }
  function centerHTML(a) {
    if (!a) return `<div class="sl-empty">${MARK()}<h2>Whose phone?</h2><p>Pick any young adult or older. Slide shows everyone who fits them, and they fit back.</p><button type="button" class="sl-btn main" data-sl="phone">Pick a Sim</button></div>`;
    if (!canSwipe(a)) return `<div class="sl-empty"><h2>${esc(first(a.name))} can't swipe yet</h2><p>${!lifeOk(a) ? "Slide is for young adults and older." : "There's no gender on file. Add it in the Registry and Slide can work out who fits."}</p>${lifeOk(a) ? `<a class="sl-btn" href="#/registry/${esc(a.id)}">Open the Registry file</a>` : ""}</div>`;
    const list = deck(a);
    const top = `<div class="sl-topbar"><button type="button" class="sl-pill ${st.filter === "all" ? "hot" : ""}" data-sl="filter:all">For you</button><button type="button" class="sl-pill ${st.filter === "fun" ? "hot" : ""}" data-sl="filter:fun">Just fun</button><span class="sl-pill quiet">Swiping as ${esc(first(a.name))}</span></div>`;
    if (!list.length) return `${top}<div class="sl-empty"><h2>That's everybody</h2><p>${esc(first(a.name))} has seen everyone in range${st.filter === "fun" ? " for just fun" : ""}. Widen how far they'll go to see more.</p></div>`;
    return `${top}<div class="sl-deck">${list[1] ? card(a, list[1], true) : ""}${card(a, list[0])}</div>
      ${st.flash ? `<p class="sl-flash" role="status">${esc(st.flash)}</p>` : ""}
      <div class="sl-btns">
        <button type="button" class="sl-bt" data-sl="swipe:pass"><span class="sl-circ pass">${ic("pass", 2.6)}</span>Pass</button>
        <button type="button" class="sl-bt" data-sl="swipe:like"><span class="sl-circ slide">${ic("slide")}</span>Slide</button>
        <button type="button" class="sl-bt" data-sl="swipe:shot"><span class="sl-circ shot">${ic("shot")}</span>Shoot your shot</button>
      </div>`;
  }
  function pickerSheet() {
    const q = low(st.q);
    const list = data.sims.filter(lifeOk).sort((x, y) => stripNick(x.name).localeCompare(stripNick(y.name)))
      .filter(s => !q || low(stripNick(s.name) + " " + city(s) + " " + job(s)).includes(q));
    return `<div class="sl-sheet" role="dialog" aria-label="Whose phone"><div class="sl-sheethead"><h3>Whose phone?</h3><button type="button" class="sl-x" data-sl="close" aria-label="Close">×</button></div>
      <input class="sl-search" type="search" placeholder="Search Sims" value="${esc(st.q)}" data-sl-q aria-label="Search Sims" autocomplete="off">
      <div class="sl-wholist">${list.map(s => {
        const miss = !genderOf(s) ? "No gender on file<br>Add it in the Registry" : notRolled(s) ? "Attraction not rolled<br>Treated as straight" : "";
        return `<button type="button" class="sl-who ${s.id === S.phone ? "sel" : ""}" data-sl="pick:${s.id}">${av(s, "sm")}<span>${esc(stripNick(s.name))}<small>${esc([city(s), job(s)].filter(Boolean).join(" · "))}</small></span>${miss ? `<span class="sl-miss">${miss}</span>` : ""}</button>`; }).join("") || `<p class="sl-hint">No Sims match.</p>`}</div>
      <p class="sl-hint">Only young adults and older show up, on either side of the swipe.</p></div>`;
  }
  function editSheet() {
    const sim = simById(st.editId); if (!sim) return "";
    const p = shown(sim), lines = a => esc((a || []).join("\n")), ed = editedFields(sim);
    return `<div class="sl-sheet" role="dialog" aria-label="Edit profile"><div class="sl-sheethead"><h3>${esc(first(sim.name))}'s profile</h3><button type="button" class="sl-x" data-sl="close" aria-label="Close">×</button></div>
      <p class="sl-hint">This only changes how ${esc(first(sim.name))} looks on Slide. Their Registry file stays as it is, so anything changed here is a lie on their profile.</p>
      <form class="sl-form" data-sl-form="${esc(sim.id)}">
        <label><span>Job line</span><input class="sl-search" name="job" value="${esc(p.job)}" autocomplete="off"></label>
        <label><span>Traits <small>one per line</small></span><textarea class="sl-search" name="traits" rows="4">${lines(p.traits)}</textarea></label>
        <label><span>Likes <small>one per line</small></span><textarea class="sl-search" name="likes" rows="5">${lines(p.likes)}</textarea></label>
        <label><span>Dislikes <small>one per line</small></span><textarea class="sl-search" name="dislikes" rows="4">${lines(p.dislikes)}</textarea></label>
        <div class="sl-formbtns"><button type="submit" class="sl-btn main">Save</button>${ed.length ? `<button type="button" class="sl-btn" data-sl="reset:${esc(sim.id)}">Back to Registry</button>` : ""}</div>
      </form></div>`;
  }
  function matchScreen() {
    const m = S.matches.find(x => x.id === st.match); if (!m) return "";
    const a = simById(m.a), b = simById(m.b); if (!a || !b) return "";
    return `<div class="sl-match" role="dialog" aria-label="It's a match">
      <div class="sl-pair">${av(a, "big")}${av(b, "big")}</div>
      <h2>It's a <em>match</em></h2>
      <p>${m.how === "shot" ? `${esc(first(a.name))} shot their shot with ${esc(first(b.name))}.` : `${esc(first(a.name))} and ${esc(first(b.name))} both slid.`}</p>
      <div class="sl-big">${m.thread ? `<a class="sl-btn main" href="#/messages/t/${esc(m.thread)}/${esc(m.a)}">Open in Messages</a>` : `<button type="button" class="sl-btn main" data-sl="text:${m.id}">${m.texted ? "Add to Messages" : "Text them in game"}</button>`}<button type="button" class="sl-btn ghost" data-sl="keep">Keep swiping</button></div>
      <p class="sl-logged">${m.rel ? `Logged in both Registry files under Connections: "Matched on Slide, ${esc(UI.gameLabel(m.date))}."` : `They already have a Romance connection on file, so nothing new was added to the Registry.`}</p>
      ${st.err ? `<p class="sl-err">${esc(st.err)}</p>` : ""}</div>`;
  }
  function menuSheet(a) {
    return `<div class="sl-sheet" role="dialog" aria-label="Phone settings"><div class="sl-sheethead"><h3>${a ? esc(first(a.name)) + "'s phone" : "Slide"}</h3><button type="button" class="sl-x" data-sl="close" aria-label="Close">×</button></div>
      ${meBox(a)}${settingsHTML(a)}${matchesHTML(a)}</div>`;
  }

  function draw() {
    if (!root) return;
    const a = S.phone && simById(S.phone);
    root.innerHTML = `<div class="site-sl">
      <aside class="sl-side"><div class="sl-logo">${MARK()}slide</div><div class="sl-box"><h4>On whose phone</h4>${meBox(a)}</div>${settingsHTML(a)}</aside>
      <main class="sl-center">
        <div class="sl-pbar"><div class="sl-logo">${MARK()}slide</div><button type="button" class="sl-mebtn" data-sl="menu" aria-label="Phone settings and matches">${a ? av(a, "sm") : `<span class="sl-av sm">?</span>`}<span aria-hidden="true">▾</span></button></div>
        ${centerHTML(a)}</main>
      <aside class="sl-right">${matchesHTML(a)}</aside>
      ${st.match ? `<div class="sl-modal">${matchScreen()}</div>` : st.sheet ? `<div class="sl-modal" data-sl-scrim>${st.sheet === "phone" ? pickerSheet() : st.sheet === "edit" ? editSheet() : menuSheet(a)}</div>` : ""}</div>`;
    if (st.sheet === "phone" && st.focusQ) { const q = root.querySelector("[data-sl-q]"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
    st.focusQ = false;
    root.querySelectorAll(".sl-more:not(.open)").forEach(m => { if (m.parentElement.closest("#sl-card")) { const over = [...m.querySelectorAll(".sl-likes")].some(x => x.scrollHeight > x.clientHeight + 1); m.querySelector(".sl-showmore").hidden = !over; } });
    root.querySelectorAll(".sl-more.open .sl-showmore").forEach(b => b.hidden = false);
  }

  /* ---------- drag to swipe ---------- */
  function startDrag(e) {
    const el = e.target.closest("#sl-card"); if (!el || e.button > 0 || e.target.closest("button,a")) return;
    st.drag = { el, x:e.clientX, y:e.clientY, dx:0, id:e.pointerId };
    el.setPointerCapture?.(e.pointerId); el.classList.add("dragging");
  }
  function moveDrag(e) {
    const d = st.drag; if (!d || e.pointerId !== d.id) return;
    d.dx = e.clientX - d.x; const dy = (e.clientY - d.y) * .3;
    d.el.style.transform = `translate(${d.dx}px,${dy}px) rotate(${d.dx / 18}deg)`;
    d.el.style.setProperty("--like", Math.max(0, Math.min(1, d.dx / 110))); d.el.style.setProperty("--nope", Math.max(0, Math.min(1, -d.dx / 110)));
  }
  async function endDrag(e) {
    const d = st.drag; if (!d || e.pointerId !== d.id) return; st.drag = null;
    d.el.classList.remove("dragging");
    if (Math.abs(d.dx) > 110) { d.el.style.transform = `translate(${Math.sign(d.dx) * 700}px,0) rotate(${d.dx / 8}deg)`; d.el.style.opacity = "0"; setTimeout(() => act(d.dx > 0 ? "swipe:like" : "swipe:pass"), 160); }
    else { d.el.style.transform = ""; d.el.style.removeProperty("--like"); d.el.style.removeProperty("--nope"); }
  }

  async function act(cmd) {
    const [k, v] = cmd.split(":");
    try {
      if (k === "phone") { st.sheet = "phone"; st.q = ""; st.focusQ = true; return draw(); }
      if (k === "more") { st.more = !st.more; return draw(); }
      if (k === "edit") { st.sheet = "edit"; st.editId = v; return draw(); }
      if (k === "reset") { delete S.profiles[v]; st.sheet = null; await persist(); return draw(); }
      if (k === "menu") { st.sheet = "menu"; return draw(); }
      if (k === "close") { st.sheet = null; return draw(); }
      if (k === "pick") { st.more = false; S.phone = v; st.sheet = null; st.flash = null; st.filter = "all"; await persist(); return draw(); }
      if (k === "filter") { st.filter = v; st.flash = null; return draw(); }
      if (k === "burner") { const p = pref(S.phone); S.prefs[S.phone] = { ...p, burner:!p.burner }; await persist(); return draw(); }
      if (k === "swipe") { st.flash = null; return swipe(v); }
      if (k === "text") { const m = S.matches.find(x => x.id === v); if (m) { m.texted = true; m.texted_on = m.texted_on || today(); } st.match = null; await persist(); draw(); if (m) textThread(m); return; }
      if (k === "keep") { st.match = null; st.err = null; return draw(); }
      if (k === "open") { st.match = v; st.sheet = null; return draw(); }
    } catch (e) { st.err = e.message; draw(); }
  }

  /* ---------- events (bound once) ---------- */
  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-sl");
    document.addEventListener("click", e => {
      if (!mine(e.target)) return;
      if (e.target.matches("[data-sl-scrim]")) { st.sheet = null; draw(); return; }
      const b = e.target.closest("[data-sl]"); if (b) act(b.dataset.sl);
    });
    document.addEventListener("submit", async e => {
      const f = e.target.closest && e.target.closest("[data-sl-form]"); if (!f || !mine(f)) return;
      e.preventDefault();
      const sim = simById(f.dataset.slForm); if (!sim) return;
      const fd = new FormData(f), real = realProfile(sim), out = {};
      const list = v => [...new Set(String(v || "").split("\n").map(x => x.trim()).filter(Boolean))];
      const job = String(fd.get("job") || "").trim();
      if (job !== real.job) out.job = job;
      for (const k of ["traits", "likes", "dislikes"]) { const v = list(fd.get(k)); if (v.join("|") !== real[k].join("|")) out[k] = v; }
      if (Object.keys(out).length) S.profiles[sim.id] = out; else delete S.profiles[sim.id];
      st.sheet = null; await persist(); draw();
    });
    document.addEventListener("input", e => {
      if (!mine(e.target)) return;
      if (e.target.matches("[data-sl-q]")) { st.q = e.target.value; st.focusQ = true; draw(); }
    });
    document.addEventListener("change", async e => {
      if (!mine(e.target) || !e.target.matches("[data-sl-range]")) return;
      S.prefs[S.phone] = { ...pref(S.phone), range:Number(e.target.value) }; st.flash = null; await persist(); draw();
    });
    document.addEventListener("keydown", e => {
      if (!root || !root.querySelector(".site-sl") || e.target.closest("input,textarea,select")) return;
      if (st.match || st.sheet) { if (e.key === "Escape") { e.stopImmediatePropagation(); st.sheet = null; st.match = null; draw(); } return; }
      if (!root.querySelector("#sl-card")) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); act("swipe:pass"); }
      if (e.key === "ArrowRight") { e.preventDefault(); act("swipe:like"); }
    }, true);
    document.addEventListener("pointerdown", e => { if (mine(e.target)) startDrag(e); });
    document.addEventListener("pointermove", moveDrag);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
  }

  function render(el, d) { root = el; data = d; state(); st.sheet = null; st.match = null; st.err = null; st.flash = null; bind(); draw(); }
  const address = () => { const a = S && S.phone && data && simById(S.phone); return a ? "/" + low(first(a.name)).replace(/[^a-z0-9]+/g, "") : "/"; };
  return { render, address };
})();
