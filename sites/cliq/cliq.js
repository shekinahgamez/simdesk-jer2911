/* Cliq: "Discover Clubs" social app for clubs (organizations with type "Club"). Reads and saves through GFB.
   "Signed in as" is shared with Huddl (settings.acting_sim). Join and Leave add or remove the signed-in Sim. */
const Cliq = (() => {
  const st = { q:"", cat:"", modal:null, err:null };
  let data = null, root = null, route = [], lastKey = null;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const norm = n => stripNick(n).toLowerCase();
  const initials = n => stripNick(n).split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const tint = s => `hsl(${325 + hue(s) % 28} 48% ${52 + hue(s) % 14}%)`;
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const lines = t => String(t || "").split(/\n/).map(x => x.trim()).filter(Boolean);
  const csv = t => String(t || "").split(/\s*,\s*/).map(x => x.trim()).filter(Boolean);

  const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#F6B6CC"/><g fill="#fff"><rect x="14" y="14" width="36" height="13" rx="5"/><rect x="14" y="14" width="13" height="36" rx="5"/><rect x="14" y="37" width="36" height="13" rx="5"/></g></svg>`;
  const ICONS = {
    cocktail:'<path d="M5 5h14l-7 8z"/><path d="M12 13v6M8.5 19h7"/>', cards:'<rect x="5" y="6" width="9" height="13" rx="2" transform="rotate(-10 9 12)"/><rect x="10" y="5" width="9" height="13" rx="2" transform="rotate(8 14 11)"/>',
    dumbbell:'<path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10"/>', flower:'<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="6.5" r="2.4"/><circle cx="12" cy="17.5" r="2.4"/><circle cx="6.5" cy="12" r="2.4"/><circle cx="17.5" cy="12" r="2.4"/>',
    moon:'<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>', house:'<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    star:'<path d="M12 3c.7 5 4 8.3 9 9-5 .7-8.3 4-9 9-.7-5-4-8.3-9-9 5-.7 8.3-4 9-9z"/>', camera:'<rect x="4" y="7" width="16" height="12" rx="3"/><circle cx="12" cy="13" r="3.2"/><path d="M9 7l1-2h4l1 2"/>',
    music:'<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.2"/><circle cx="17" cy="16" r="2.2"/>', heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>', coffee:'<path d="M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"/><path d="M16 10h2a2.500 2.500 0 0 1 0 5h-2M8 3v3M12 3v3"/>'
  };
  const DEFAULT_EMBLEM = { "house money":"cards", "the nightcap":"moon", "the plus ones":"heart", "sweat equity":"dumbbell", "golden hour":"sun", "homegrown":"house", "real housewives of fenmore":"star", "real housewives of bellhaven":"star" };
  const emblemOf = o => ICONS[o.emblem] ? o.emblem : (DEFAULT_EMBLEM[o.name.toLowerCase()] || "star");
  const emblem = (o, cls = "") => o.emblem_img ? `<span class="cq-emb img ${cls}" style="background-image:url('${o.emblem_img}')" role="img" aria-label="${esc(o.name)} emblem"></span>` : `<span class="cq-emb ${cls}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[emblemOf(o)]}</svg></span>`;
  const pat = o => o.banner ? `<span class="cq-pattern img" style="background-image:url('${o.banner}')"></span>` : `<span class="cq-pattern"></span>`;

  const icon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
  const clubs = () => data.organizations.filter(o => o.type === "Club");
  const byId = id => data.organizations.find(o => o.id === id);
  const simById = id => data.sims.find(s => s.id === id);
  const simFor = m => m && ((m.sim && simById(m.sim)) || data.sims.find(s => norm(s.name) === norm(m.name)));
  const lotById = id => data.lots.find(l => l.id === id);
  const go = h => { location.hash = "#/cliq" + (h ? "/" + h : ""); };
  const av = m => { const p = (simFor(m) || {}).portrait; return `<span class="cq-av${p ? " ph" : ""}" style="background:${tint(m.name)}" title="${esc(m.name)}">${p ? `<img src="${esc(p)}" alt="">` : esc(initials(m.name))}</span>`; };
  const nameLink = m => { const s = simFor(m); return s ? `<a class="cq-link" href="#/registry/${s.id}">${esc(m.name)}</a>` : esc(m.name); };
  const allOf = key => [...new Set(clubs().flatMap(o => o[key] || []))].sort();
  const inClub = (o, id) => (o.members || []).some(m => simFor(m)?.id === id);
  const clubsOf = id => clubs().filter(o => inClub(o, id));
  const me = () => simById((data.settings || {}).acting_sim) || data.sims.find(s => clubsOf(s.id).length) || data.sims[0];
  const where = o => { const l = o.lot && lotById(o.lot); return l ? l.address : (o.meets || o.district || ""); };
  const avRow = (ms, n) => `<span class="cq-avs">${ms.slice(0, n).map(av).join("")}${ms.length > n ? `<span class="cq-more">+${ms.length - n}</span>` : ""}</span>`;

  /* categories come from each club's activities */
  const CATS = [["Nightlife", "moon", ["Dance", "Drink Bar Drinks", "Flirt"]], ["Fitness", "dumbbell", ["Work Out", "Jog"]], ["Creative", "camera", ["Paint", "Photography", "Listen to Music", "Take Photos"]], ["Food", "coffee", ["Cook", "Eat"]], ["Talk", "heart", ["Chat", "Gossip", "Deep Conversation", "Brag"]], ["Games", "cards", ["Play Cards"]]];
  const catOf = o => CATS.filter(([, , acts]) => (o.activities || []).some(a => acts.includes(a))).map(c => c[0]);

  /* ---------- pieces ---------- */
  function joinBtn(o, cls = "") {
    const s = me(); if (!s) return "";
    return inClub(o, s.id) ? `<button class="cq-btn ghost ${cls}" data-cq="leave:${o.id}">Joined</button>` : `<button class="cq-btn ${cls}" data-cq="join:${o.id}">Join club</button>`;
  }
  const sugCard = o => `<div class="cq-sug"><a class="cq-sugtop" href="#/cliq/club/${o.id}">${pat(o)}${emblem(o, "md")}</a>
      <div class="cq-sugbody"><a href="#/cliq/club/${o.id}"><b>${esc(o.name)}</b></a><small>${esc(where(o)) || "&nbsp;"}</small><small>${(o.members || []).length} member${(o.members || []).length === 1 ? "" : "s"}</small>${joinBtn(o, "wide")}</div></div>`;
  const rowCard = o => `<div class="cq-rowc"><a class="cq-thumb" href="#/cliq/club/${o.id}">${pat(o)}</a><span class="cq-rowt"><a href="#/cliq/club/${o.id}"><b>${esc(o.name)}</b></a><small>${esc(o.vibe || where(o) || "")}</small><span class="cq-rowm">${avRow(o.members || [], 3)}<small>${(o.members || []).length} members</small></span></span><a class="cq-btn ghost sm" href="#/cliq/club/${o.id}">Open</a></div>`;

  function sidebar() {
    const s = me(); if (!s) return "";
    const rels = data.relationships.filter(r => r.from_sim === s.id && r.to_sim).map(r => ({ r, p:simById(r.to_sim) })).filter(x => x.p);
    const mineIds = new Set(clubsOf(s.id).map(o => o.id));
    const theirs = clubs().filter(o => !mineIds.has(o.id) && rels.some(x => inClub(o, x.p.id)));
    return `<div class="cq-side-card"><h3>Your clubs</h3>${clubsOf(s.id).map(o => `<a class="cq-srow" href="#/cliq/club/${o.id}">${emblem(o, "sm")}<span><b>${esc(o.name)}</b><small>${(o.members || []).length} members</small></span></a>`).join("") || `<p class="cq-none">Not in any clubs yet.</p>`}</div>
      <div class="cq-side-card"><h3>Connections</h3>${rels.slice(0, 14).map(({ r, p }) => { const n = clubsOf(p.id).length; return `<a class="cq-srow" href="#/registry/${p.id}">${av({ name:p.name })}<span><b>${esc(stripNick(p.name))}</b><small>${esc(r.label || "")}${r.label && n ? " \u00b7 " : ""}${n ? n + " club" + (n === 1 ? "" : "s") : ""}</small></span></a>`; }).join("") || `<p class="cq-none">No connections in the Registry yet.</p>`}</div>
      ${theirs.length ? `<div class="cq-side-card"><h3>Your connections are in</h3>${theirs.map(o => `<a class="cq-srow" href="#/cliq/club/${o.id}">${emblem(o, "sm")}<span><b>${esc(o.name)}</b><small>${rels.filter(x => inClub(o, x.p.id)).map(x => esc(stripNick(x.p.name).split(" ")[0])).join(", ")}</small></span></a>`).join("")}</div>` : ""}`;
  }

  /* ---------- pages ---------- */
  function discover() {
    const s = me(), q = st.q.trim().toLowerCase();
    const match = o => (!q || [o.name, o.vibe, ...(o.activities || [])].join(" ").toLowerCase().includes(q)) && (!st.cat || catOf(o).includes(st.cat));
    const mine = s ? clubsOf(s.id) : [], sug = clubs().filter(o => !(s && inClub(o, s.id)) && match(o));
    const cats = CATS.filter(([n]) => clubs().some(o => catOf(o).includes(n)));
    return `<div class="cq-head"><div><h1>Discover Clubs</h1><p class="cq-sub">${clubs().length} clubs in Simerica</p></div><button class="cq-btn" data-cq="new">+ Create club</button></div>
      <section><div class="cq-sec"><div><h2>Suggested clubs</h2><small>${s ? `Clubs ${esc(stripNick(s.name).split(" ")[0])} might be interested in${st.cat ? " \u00b7 " + esc(st.cat) : ""}` : ""}</small></div>${st.cat ? `<button class="cq-textbtn" data-cat="">Show all</button>` : ""}</div>
        ${sug.length ? `<div class="cq-sugs">${sug.map(sugCard).join("")}</div>` : `<p class="cq-none">${q || st.cat ? "No clubs match." : "They're in every club already."}</p>`}</section>
      ${cats.length ? `<section><div class="cq-sec"><h2>Browse by vibe</h2></div><div class="cq-cats">${cats.map(([n, ic]) => `<button class="cq-cat" data-cat="${n}" aria-pressed="${st.cat === n}"><span class="cq-cattop"><span class="cq-pattern"></span><span class="cq-catic">${icon(ic)}</span></span><b>${n}</b></button>`).join("")}</div></section>` : ""}
      <section><div class="cq-sec"><div><h2>${s ? esc(stripNick(s.name).split(" ")[0]) + "'s clubs" : "Your clubs"}</h2><small>Clubs they're already in</small></div></div>
        ${mine.length ? `<div class="cq-rows">${mine.map(rowCard).join("")}</div>` : `<p class="cq-none">Not in any clubs yet. Tap Join club on one above.</p>`}</section>`;
  }

  function clubPage(o, tab) {
    const ms = o.members || [], lot = o.lot && lotById(o.lot);
    const tabs = [["about", "About"], ["members", `Members (${ms.length})`], ["meets", "Meets"]];
    let body = "";
    if (tab === "about") body = `<div class="cq-two">
        <div class="cq-box"><h3>How to join</h3>${o.join ? `<p class="cq-big">${esc(o.join)}</p>` : ""}<p>${esc(o.join_notes) || (o.join ? "" : `<span class="cq-none">Not set yet.</span> <button class="cq-textbtn inline" data-cq="club:${o.id}">Add it</button>`)}</p>${(o.requirements || []).length ? `<div class="cq-chips">${o.requirements.map(r => `<span class="cq-chip">${esc(r)}</span>`).join("")}</div>` : ""}</div>
        <div class="cq-box"><h3>House rules</h3>${(o.rules || []).length ? `<ol class="cq-rules">${o.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol>` : `<p class="cq-none">None yet. <button class="cq-textbtn inline" data-cq="club:${o.id}">Add rules</button></p>`}</div></div>
      ${(o.activities || []).length ? `<div class="cq-box"><h3>What they do</h3><div class="cq-chips">${o.activities.map(r => `<span class="cq-chip alt">${esc(r)}</span>`).join("")}</div></div>` : ""}
      ${o.notes ? `<div class="cq-box"><h3>Notes <small>Private</small></h3><p style="white-space:pre-wrap;margin:0">${esc(o.notes)}</p></div>` : ""}`;
    if (tab === "members") body = `<div class="cq-box"><h3>Members <small>${ms.length}</small><button class="cq-mini" data-cq="member:${o.id}:new">Add member</button></h3>
        ${ms.length ? `<div class="cq-members">${ms.map((m, i) => `<div class="cq-mem">${av(m)}<span><b>${nameLink(m)}</b><br><small>${esc(m.role || "Member")}</small></span><button class="cq-mini" data-cq="member:${o.id}:${i}" aria-label="Edit ${esc(m.name)}">Edit</button></div>`).join("")}</div>` : '<p class="cq-none">No members yet.</p>'}</div>`;
    if (tab === "meets") body = `<div class="cq-box cq-meets"><h3>Meets</h3><p class="cq-serif">${esc(o.meets) || '<span class="cq-none">Not set yet. Add it with Edit club.</span>'}</p>
        <p>${lot ? `<a class="cq-link" href="#/lotline/${lot.id}">${esc(lot.address)}</a>` : '<span class="cq-none">No lot set</span>'}</p></div>`;
    return `<a class="cq-back" href="#/cliq">All clubs</a>
      <div class="cq-hero"><div class="cq-banner${o.banner ? " has-img" : ""}">${pat(o)}<h1>${esc(o.name)}</h1>${emblem(o, "xl")}</div>
        <div class="cq-top"><p class="cq-vibe big">${esc(o.vibe) || '<span class="cq-none">No vibe line yet.</span>'}</p>
          <div class="cq-meta">${avRow(ms, 6)}<b>${ms.length}</b><small>Members</small>${joinBtn(o)}<button class="cq-btn ghost" data-cq="club:${o.id}">Edit</button></div></div>
        <div class="cq-tabs" role="tablist">${tabs.map(([k, n]) => `<a role="tab" href="#/cliq/club/${o.id}${k === "about" ? "" : "/" + k}" aria-selected="${tab === k}">${n}</a>`).join("")}</div></div>${body}`;
  }

  const field = (label, inner) => `<label class="cq-f"><span>${label}</span>${inner}</label>`;
  const acts = extra => `<div class="cq-fa">${extra || ""}<button type="button" class="cq-btn ghost" data-cq="close">Cancel</button><button class="cq-btn" type="submit">Save</button></div>`;
  function modal() {
    const [kind, a, b] = (st.modal || "").split(":"), err = st.err ? `<p class="cq-err">${esc(st.err)}</p>` : "";
    if (kind === "new" || kind === "club") {
      const o = kind === "new" ? { join:"", rules:[], activities:[], requirements:[], members:[] } : byId(a);
      const opt = (v, list, blank) => `<option value="">${blank}</option>${list.map(x => `<option ${v === x ? "selected" : ""}>${x}</option>`).join("")}`;
      return `<form class="cq-form" data-f="club"><h2>${kind === "new" ? "New club" : "Edit club"}</h2>
        ${field("Name", `<input name="name" value="${esc(o.name)}" required>`)}${field("Vibe line", `<input name="vibe" value="${esc(o.vibe)}">`)}
        <div class="cq-f2">${field("How to join", `<select name="join">${opt(o.join, ["Open", "Invite only", "By application"], "Not set")}</select>`)}${field("Meets", `<input name="meets" value="${esc(o.meets)}" placeholder="Saturdays, 11 PM">`)}</div>
        ${field("Joining details", `<input name="join_notes" value="${esc(o.join_notes)}">`)}
        ${field("House rules (one per line)", `<textarea name="rules">${esc((o.rules || []).join("\n"))}</textarea>`)}
        ${field("Activities (comma separated)", `<input name="activities" list="cq-acts" value="${esc((o.activities || []).join(", "))}"><datalist id="cq-acts">${allOf("activities").map(x => `<option value="${esc(x)}">`).join("")}</datalist>`)}
        ${field("Requirements (comma separated)", `<input name="requirements" list="cq-reqs" value="${esc((o.requirements || []).join(", "))}"><datalist id="cq-reqs">${allOf("requirements").map(x => `<option value="${esc(x)}">`).join("")}</datalist>`)}
        <div class="cq-f2">${field("Emblem", `<select name="emblem">${Object.keys(ICONS).map(k => `<option ${(o.emblem || (o.name ? emblemOf(o) : "star")) === k ? "selected" : ""}>${k}</option>`).join("")}</select>`)}${field("Meets at", `<select name="lot"><option value="">No lot yet</option>${data.lots.filter(l => !l.parent_id || l.id === o.lot).map(l => `<option value="${l.id}" ${o.lot === l.id ? "selected" : ""}>${esc(l.address)}</option>`).join("")}</select>`)}</div>
        <div class="cq-imgs">
          <div class="cq-f"><span>Header image</span>${o.banner ? `<span class="cq-thumb wide" style="background-image:url('${o.banner}')"></span><label class="cq-ck"><input type="checkbox" name="rm_banner"> Remove it (go back to the pattern)</label>` : ""}<input type="file" name="banner" accept="image/*"></div>
          <div class="cq-f"><span>Circle picture (optional)</span>${o.emblem_img ? `<span class="cq-thumb round" style="background-image:url('${o.emblem_img}')"></span><label class="cq-ck"><input type="checkbox" name="rm_emblem"> Remove it (go back to the icon)</label>` : ""}<input type="file" name="emblem_img" accept="image/*"><small>A picture replaces the icon above.</small></div></div>
        ${field("Notes (private)", `<textarea name="notes">${esc(o.notes)}</textarea>`)}${err}
        ${acts(kind === "new" ? "" : `<button type="button" class="cq-btn danger" data-cq="del:${o.id}">Delete</button><span class="cq-grow"></span>`)}</form>`;
    }
    if (kind === "member") {
      const o = byId(a), m = b === "new" ? { role:"Member" } : o.members[+b];
      return `<form class="cq-form" data-f="member"><h2>${b === "new" ? "Add a member" : "Edit member"}</h2>
        ${field("Name", `<input name="name" list="cq-sims" value="${esc(m.name)}" required autocomplete="off"><datalist id="cq-sims">${data.sims.map(s => `<option value="${esc(stripNick(s.name))}">`).join("")}</datalist>`)}
        ${field("Role", `<input name="role" list="cq-roles" value="${esc(m.role)}"><datalist id="cq-roles">${["Founder", "Host", "Regular", "New", "Member"].map(x => `<option value="${x}">`).join("")}</datalist>`)}${err}
        ${acts(b === "new" ? "" : `<button type="button" class="cq-btn danger" data-cq="delm:${o.id}:${b}">Remove</button><span class="cq-grow"></span>`)}</form>`;
    }
    return "";
  }


  function draw() {
    const s = me(), sims = [...data.sims].sort((a, b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    const o = route[0] === "club" ? byId(route[1]) : null;
    const main = route[0] === "club" ? (o ? clubPage(o, route[2] || "about") : `<p class="cq-none">That club isn't on Cliq.</p>`) : discover();
    root.innerHTML = `<div class="site-cq"><header class="cq-bar"><a class="cq-logo" href="#/cliq">${MARK}<span>cliq</span></a>
        <input class="cq-search" id="cq-q" type="search" placeholder="Search clubs" aria-label="Search clubs" value="${esc(st.q)}">
        <label class="cq-as">${s ? av({ name:s.name }) : ""}<span><small>Signed in as</small>${UI.picker({ id:"cq-as", value:s ? s.id : "", options:sims.map(x => ({ v:x.id, t:stripNick(x.name), s:x.career || "" })), placeholder:"Search Sims", align:"right", label:"Signed in as" })}</span></label></header>
      <div class="cq-shell"><main class="cq-main">${main}</main><aside class="cq-side">${sidebar()}</aside></div>
      ${st.modal ? `<div class="cq-modal">${modal()}</div>` : ""}</div>`;
  }
  async function refresh() { data = await GFB.getAll(); draw(); }

  async function submit(form) {
    const f = new FormData(form), v = k => String(f.get(k) || "").trim(), [kind, a, b] = (st.modal || "").split(":");
    try {
      if (form.dataset.f === "club") {
        const old = kind === "new" ? null : byId(a);
        const row = { ...(old || { type:"Club", members:[], related:[], category:"", tagline:"", about:"", founded_text:"", district:"", leader:"", status:"Active" }), name:v("name"), vibe:v("vibe"), join:v("join"), join_notes:v("join_notes"), meets:v("meets"),
          rules:lines(f.get("rules")), activities:csv(f.get("activities")), requirements:csv(f.get("requirements")), emblem:v("emblem"), lot:v("lot") || null, notes:v("notes") };
        if (!old) row.id = "club-" + slug(row.name) + "-" + Math.random().toString(36).slice(2, 5);
        const bf = f.get("banner"), ef = f.get("emblem_img");
        if (bf && bf.size) row.banner = (await GFB.uploadImage(bf, 1800)).url; else if (f.get("rm_banner")) row.banner = null;
        if (ef && ef.size) row.emblem_img = (await GFB.uploadImage(ef, 400)).url; else if (f.get("rm_emblem")) row.emblem_img = null;
        const saved = await GFB.saveOrg(row); st.modal = null; await refresh(); if (!old) go("club/" + saved.id); return;
      }
      const o = byId(a), s = data.sims.find(x => norm(x.name) === norm(v("name")));
      const m = { name:s ? s.name : v("name"), sim:s ? s.id : null, role:v("role") || "Member", dept:"", since:"", current:true };
      const members = [...(o.members || [])]; if (b === "new") members.push(m); else members[+b] = m;
      await GFB.saveOrg({ id:o.id, members }); st.modal = null; st.err = null; await refresh();
    } catch (err) { st.err = err.message; draw(); }
  }


  async function joinLeave(id, join) {
    const o = byId(id), s = me(); if (!o || !s) return;
    const members = join ? [...(o.members || []), { name:s.name, sim:s.id, role:"Member", dept:"", since:"", current:true }] : (o.members || []).filter(m => simFor(m)?.id !== s.id);
    await GFB.saveOrg({ id:o.id, members }); await refresh();
  }

  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-cq");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.classList.contains("cq-modal")) { st.modal = null; st.err = null; draw(); return; }
      const cat = t.closest("[data-cat]"); if (cat) { st.cat = st.cat === cat.dataset.cat ? "" : cat.dataset.cat; if (route[0] === "club") go(""); else draw(); return; }
      const b = t.closest("[data-cq]"); if (!b) return;
      const [act, a, c] = b.dataset.cq.split(":");
      if (act === "join") { await joinLeave(a, true); return; }
      if (act === "leave") { if (!UI.confirmTap(b, "Tap to leave")) return; await joinLeave(a, false); return; }
      if (act === "close") { st.modal = null; st.err = null; }
      else if (["new", "club", "member"].includes(act)) st.modal = b.dataset.cq;
      else if (act === "del") { if (!UI.confirmTap(b, "Tap again to delete")) return; await GFB.deleteOrg(a); st.modal = null; await refresh(); go(""); return; }
      else if (act === "delm") { if (!UI.confirmTap(b, "Tap again to remove")) return; const o = byId(a); await GFB.saveOrg({ id:o.id, members:o.members.filter((_, i) => i !== +c) }); st.modal = null; await refresh(); return; }
      st.err = null; draw();
    });
    document.addEventListener("input", e => { if (mine(e.target) && e.target.id === "cq-q") { st.q = e.target.value; if (route[0] === "club") { go(""); return; } const m = root.querySelector(".cq-main"); if (m) m.innerHTML = discover(); } });
    document.addEventListener("change", async e => { if (mine(e.target) && e.target.id === "cq-as") { await GFB.saveSetting("acting_sim", e.target.value); await refresh(); } });
    document.addEventListener("submit", e => { if (mine(e.target) && e.target.dataset.f) { e.preventDefault(); submit(e.target); } });
  }
  function render(el, d, parts) { root = el; data = d; route = parts || []; const key = route.join("/"); if (key !== lastKey) { st.modal = null; st.err = null; lastKey = key; } bind(); draw(); }
  function address(parts) { const [v, id, tab] = parts || []; if (v === "club") return "/c/" + (byId(id) ? slug(byId(id).name) : id) + (tab ? "/" + tab : ""); return "/discover"; }
  return { render, address };
})();
