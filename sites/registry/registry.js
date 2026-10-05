/* The Registry. Reads and saves everything through GFB (assets/data.js).
   Each section edits in place. Connections save to both Sims' files. */
const Registry = (() => {
  const st = { clear:false, open:new Set(), q:"", filter:"All", sort:"name", tab:"profile", edit:null, rel:null, creating:false, nextEdit:null, msg:"", err:false };
  let data = null, curId = null, root = null;

  const FILTERS = ["All","Lennox Park","Baymore","Bellhaven","Incomplete"];
  const TABS = [["profile","Profile"],["connections","Connections"],["property","Property & money"],["notes","Notes & secrets"],["activity","Activity"]];
  const LIFE_STAGES = ["Infant","Toddler","Child","Teen","Young Adult","Adult","Elder"];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const initials = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0,2).join("");
  const first = n => stripNick(n).split(" ")[0];
  const hue = s => { let h = 0; for (const c of s) h = (h*31 + c.charCodeAt(0)) % 360; return h; };
  const avColor = name => `hsl(${215 + hue(name)%30 - 15} 22% ${32 + hue(name)%14}%)`;
  const av = (name, cls="") => `<span class="r-av ${cls}" style="background:${avColor(name)}">${esc(initials(name))}</span>`;
  const face = (s, cls="") => s.portrait ? `<img class="r-av r-photo ${cls}" src="${esc(s.portrait)}" alt="">` : av(s.name, cls);
  const money = n => n == null || n === "" ? null : "$" + Number(n).toLocaleString("en-US");
  const isOpen = k => st.clear || st.open.has(k);
  const simById = id => data.sims.find(s => s.id === id);
  const findSim = txt => { const t = txt.trim().toLowerCase(); return data.sims.find(x => x.name.toLowerCase() === t || stripNick(x.name).toLowerCase() === t); };
  const relsFor = id => data.relationships.filter(r => r.from_sim === id);
  const relById = id => data.relationships.find(r => String(r.id) === String(id));
  const kindName = k => data.options.relationship_kind[k];
  const PREF_KEYS = [["likes","Likes"],["dislikes","Dislikes"],["turn_ons","Turn ons"],["turn_offs","Turn offs"]];
  const LIST_KEYS = [...PREF_KEYS, ["traits","Traits"],["aspiration","Aspirations"]];
  const menu = key => [...new Set([...(data.options[key] || []), ...used(key)])].sort((a,b) => a.localeCompare(b));
  const used = field => [...new Set(data.sims.flatMap(x => Array.isArray(x[field]) ? x[field] : [x[field]]).filter(Boolean))].sort();

  /* Property: home comes through the household (the lot that household lives in). Ownership is by name. */
  const RESIDENTIAL = ["Apartment","Residential","Residential Rental"];
  const lots = () => data.lots || [];
  const checking = s => { const a = (data.accounts || []).filter(x => x.holder_sim === s.id && x.status !== "Closed"); return a.length ? money(a.reduce((n,x) => n + Number(x.balance), 0)) : null; };
  const homeOf = s => s.household ? lots().find(l => l.household === s.household && (RESIDENTIAL.includes(l.lot_type) || !l.lot_type)) : null;
  const ownedBy = s => lots().filter(l => l.owner && l.owner === stripNick(s.name));
  const lotLabel = l => { const p = l.parent_id ? lots().find(x => x.id === l.parent_id) : null; const d = l.district || (p || {}).district; return l.address + (d ? ", " + d : ""); };

  /* Calendar and Plumb (read-only here) */
  const calEvents = s => ((data.calendar || {}).events || []).filter(e => (e.sims || []).includes(s.id));
  const calLogs = s => ((data.calendar || {}).logs || []).filter(l => (l.sims || []).includes(s.id)).sort((a,b) => b.year - a.year);
  const seasonOrder = n => ((data.calendar || {}).seasons || []).findIndex(x => x.name === n);
  const calLink = (season, day) => `#/calendar/${season}/${season}/${day}`;
  const plans = s => (data.todos || []).filter(t => t.app === "plumb" && (t.sims || []).includes(s.id)).sort((a,b) => a.done - b.done);

  /* Each gap knows where it gets fixed: "tab:section" or "basics" (the header) */
  function gaps(s){
    const g = [], open = 5 - (s.traits || []).length;
    if (open > 0) g.push([`${open} trait slot${open > 1 ? "s" : ""} open`, "profile:behavior"]);
    if (!s.aspiration) g.push(["No aspiration", "profile:behavior"]);
    if (!s.love_language) g.push(["No love language", "profile:behavior"]);
    if (!s.attachment) g.push(["No attachment style", "profile:behavior"]);
    if (!s.simsta) g.push(["No Simsta handle", "basics"]);
    if (!s.household) g.push(["No household", "basics"]);
    else if (lots().length && !homeOf(s)) g.push(["No home address", "property:property"]);
    return g;
  }

  function visible(){
    const q = st.q.toLowerCase();
    return data.sims.filter(s => {
      if (st.filter === "Incomplete" && !gaps(s).length) return false;
      if (!["All","Incomplete"].includes(st.filter) && s.residence !== st.filter) return false;
      if (!q) return true;
      return [s.name, s.career, s.residence, ...(s.traits||[]), s.attachment, s.love_language].join(" ").toLowerCase().includes(q);
    });
  }

  function pendingNames(){
    const filedNames = new Set(data.sims.map(s => s.name.toLowerCase()));
    const fromRels = data.relationships.filter(r => r.to_name && !r.hidden).map(r => r.to_name);
    return [...new Set([...fromRels, ...(data.pending || [])])].filter(n => !filedNames.has(n.toLowerCase())).sort();
  }

  /* ---------- small builders ---------- */
  const tagList = arr => arr && arr.length ? `<div class="r-tags">${arr.map(t => `<span class="r-tagi">${esc(t)}</span>`).join("")}</div>` : `<span class="r-none">Not on file</span>`;
  const orNone = v => v ? esc(v) : `<span class="r-none">Not on file</span>`;
  const sel = (name, opts, val, blank="Not on file") => { const o = val && !opts.includes(val) ? [val, ...opts] : opts; return `<select name="${name}"><option value="">${blank}</option>${o.map(x => `<option ${x===val?"selected":""}>${esc(x)}</option>`).join("")}</select>`; };
  const dl = (id, vals) => `<datalist id="${id}">${vals.map(v => `<option value="${esc(v)}">`).join("")}</datalist>`;
  const actions = (extra="") => `<div class="r-actions">${extra}<button type="button" class="r-btn ghost" data-act="cancel">Cancel</button><button type="submit" class="r-btn">Save</button></div>`;
  const form = (key, inner) => `<form class="r-form r-secform" data-sec="${key}">${inner}${actions()}</form>`;
  function sec(key, title, small, body, editable = true){
    const btn = editable && st.edit !== key ? `<button type="button" class="r-sec-edit" data-edit="${key}">Edit</button>` : "";
    return `<section class="r-sec" id="r-sec-${key}"><h3>${title}${small ? ` <small>${small}</small>` : ""}${btn}</h3>${body}</section>`;
  }
  const chip = (name, v) => `<span class="sp-chip">${esc(v)}<button type="button" class="sp-x" aria-label="Remove ${esc(v)}">\u00d7</button><input type="hidden" name="${name}" value="${esc(v)}"></span>`;
  const tagInput = (name, label, vals) => `<div class="r-taginput" data-name="${name}"><span class="r-lbl">${label}</span>
      <div class="sp-chips">${(vals || []).map(v => chip(name, v)).join("")}</div>
      <div class="r-tagadd"><input class="r-input" list="r-dl-${name}" placeholder="Type one, then Add" autocomplete="off"><button type="button" class="r-btn ghost" data-tagadd>Add</button></div>${dl("r-dl-" + name, menu(name))}</div>`;

  /* ---------- index ---------- */
  function listHTML(){
    const v = visible();
    if (!v.length) return `<p class="r-pending">No residents match. Clear the search or pick another filter.</p>`;
    return v.map(s => {
      const g = gaps(s).length;
      return `<button class="r-subj" data-open="${s.id}" ${s.id === curId ? 'aria-current="true"' : ""}>${face(s)}<span><span class="nm">${esc(s.name)}</span><br><span class="sub">${esc(s.career)}</span></span>${g ? `<span class="r-gap">${g} gap${g>1?"s":""}</span>` : ""}</button>`;
    }).join("");
  }
  const newForm = () => st.creating
    ? `<form class="r-newform" data-sec="new"><input class="r-search" name="name" placeholder="Full name" required autocomplete="off"><div class="r-newrow"><button type="button" class="r-chip" data-act="cancel">Cancel</button><button type="submit" class="r-chip on">Create record</button></div></form>`
    : `<button class="r-newbtn" data-act="new">+ New resident</button>`;

  /* ---------- header ---------- */
  function factsHTML(s){
    const facts = [
      ["Age", [s.age, s.life_stage].filter(x => x != null && x !== "").map(esc).join(", ") || "Not on file"], ["Gender", orNone(s.gender)], ["Occupation", orNone(s.career)],
      ["Residence", orNone(s.residence)], ["Household", esc(s.household || "Unassigned")],
      ["Status", s.status ? `<span class="r-status st-${esc(s.status)}">${esc(s.status)}</span>` : orNone()]
    ];
    return `<dl class="r-facts">${facts.map(([k,v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  }
  function basicsForm(s){
    const o = data.options;
    const households = [...new Set([...data.sims.map(x => x.household), ...lots().map(l => l.household)].filter(Boolean))].sort();
    return `<form class="r-form r-secform r-basics" data-sec="basics">
      <div class="row">
        <label><span class="r-lbl">Full name</span><input class="r-input" name="name" value="${esc(s.name)}" required></label>
        <label><span class="r-lbl">Simsta handle</span><input class="r-input" name="simsta" value="${esc(s.simsta)}" placeholder="@handle"></label>
        <label><span class="r-lbl">Age</span><input class="r-input" name="age" type="number" min="0" inputmode="numeric" value="${esc(s.age)}"></label>
        <label><span class="r-lbl">Life stage</span>${sel("life_stage", LIFE_STAGES, s.life_stage)}</label>
        <label><span class="r-lbl">Gender</span><input class="r-input" name="gender" list="r-dl-gender" value="${esc(s.gender)}">${dl("r-dl-gender", used("gender"))}</label>
        <label><span class="r-lbl">Status</span>${sel("status", o.status, s.status)}</label>
        <label><span class="r-lbl">Occupation</span><input class="r-input" name="career" value="${esc(s.career)}"></label>
        <label><span class="r-lbl">Residence</span><input class="r-input" name="residence" list="r-dl-res" value="${esc(s.residence)}">${dl("r-dl-res", used("residence"))}</label>
        <label><span class="r-lbl">Household</span><input class="r-input" name="household" list="r-dl-hh" value="${esc(s.household)}">${dl("r-dl-hh", households)}</label>
      </div>
      <div><span class="r-lbl">Profile photo <small>(Registry, Simsta, Cliq)</small></span><div class="r-portrow">${face(s, "sm")}<input type="file" name="portrait" accept="image/*">${s.portrait ? `<label class="r-check"><input type="checkbox" name="noportrait"> Remove photo</label>` : ""}</div></div>
      <div><span class="r-lbl">Professional headshot <small>(Huddl only, optional)</small></span><div class="r-portrow">${s.headshot ? `<img class="r-av r-photo sm" src="${esc(s.headshot)}" alt="">` : av(s.name, "sm")}<input type="file" name="headshot" accept="image/*">${s.headshot ? `<label class="r-check"><input type="checkbox" name="noheadshot"> Remove headshot</label>` : ""}</div></div>
      ${actions()}</form>`;
  }

  /* ---------- tabs ---------- */
  function profileTab(s){
    const o = data.options;
    const slots = Array.from({length: Math.max(0, 5 - (s.traits||[]).length)}, () => `<span class="r-trait empty">Open slot</span>`).join("");
    const behaviorView = `<div class="r-traits">${(s.traits||[]).map(t => `<span class="r-trait">${esc(t)}</span>`).join("")}${slots}</div>
      <div class="r-grid2" style="margin-top:16px">
        <div><span class="r-lbl">Aspiration</span>${orNone(s.aspiration)}</div>
        <div><span class="r-lbl">Attachment style</span>${orNone(s.attachment)}</div>
        <div><span class="r-lbl">Love language</span>${orNone(s.love_language)}</div>
      </div>`;
    const behaviorEdit = form("behavior", `
      <div><span class="r-lbl">Traits</span><div class="row">${[0,1,2,3,4].map(i => sel("trait"+i, menu("traits"), (s.traits||[])[i], "Open slot")).join("")}</div></div>
      <div class="row">
        <label><span class="r-lbl">Aspiration</span>${sel("aspiration", menu("aspiration"), s.aspiration)}</label>
        <label><span class="r-lbl">Attachment style</span>${sel("attachment", o.attachment, s.attachment)}</label>
        <label><span class="r-lbl">Love language</span>${sel("love_language", o.love_language, s.love_language)}</label>
      </div>`);
    const prefsView = `<div class="r-grid2">
        <div><span class="r-lbl">Likes</span>${tagList(s.likes)}</div><div><span class="r-lbl">Dislikes</span>${tagList(s.dislikes)}</div>
        <div><span class="r-lbl">Turn ons</span>${tagList(s.turn_ons)}</div><div><span class="r-lbl">Turn offs</span>${tagList(s.turn_offs)}</div></div>`;
    const prefsEdit = form("prefs", `<div class="r-grid2">${tagInput("likes","Likes",s.likes)}${tagInput("dislikes","Dislikes",s.dislikes)}${tagInput("turn_ons","Turn ons",s.turn_ons)}${tagInput("turn_offs","Turn offs",s.turn_offs)}</div>
      <p class="r-help">Anything new you type gets added to the option list, so it shows up for every Sim next time.</p>`);
    const listsEdit = form("lists", `<p class="r-help" style="margin-top:0">One option per line. Paste in a whole list when you add a mod. Options a Sim already has stay on the list until they're removed from that Sim.</p>
      <div class="r-grid2">${LIST_KEYS.map(([k,n]) => `<label><span class="r-lbl">${n} <em>${menu(k).length}</em></span><textarea name="${k}" class="r-listbox">${esc(menu(k).join("\n"))}</textarea></label>`).join("")}</div>`);
    const mine = (data.organizations || []).filter(o => (o.members || []).some(m => (m.sim === s.id) || (!m.sim && m.name && stripNick(m.name).toLowerCase() === stripNick(s.name).toLowerCase())));
    const aff = mine.length ? sec("orgs", "Affiliations", "", `<div class="r-callist">${mine.map(o => { const m = o.members.find(x => x.sim === s.id || stripNick(x.name || "").toLowerCase() === stripNick(s.name).toLowerCase()); return `<a href="#/${o.type === "Club" ? "cliq/club/" : "huddl/org/"}${o.id}"><span>${o.type === "Club" ? "Member of" : "Works at"}</span>${esc(o.name)}${m && m.role ? ", " + esc(m.role) : ""}</a>`; }).join("")}</div>`, false) : "";
    return aff + sec("behavior", "Behavioral profile", "", st.edit === "behavior" ? behaviorEdit : behaviorView)
         + sec("prefs", "Preferences", "", st.edit === "prefs" ? prefsEdit : prefsView)
         + (st.edit === "lists" ? sec("lists", "Option lists", "Shared by every Sim", listsEdit) : `<p class="r-optlink"><button type="button" data-edit="lists">Manage option lists</button> for traits, aspirations, likes, dislikes, and turn ons/offs.</p>`);
  }

  function relHTML(s, r){
    const key = "rel:" + r.id;
    if (r.hidden && !isOpen(key)) {
      return `<button class="r-rel unfiled" data-reveal="${key}" aria-label="Classified connection. Select to declassify">${av("?","sm")}<span><span class="who"><span class="r-redline"></span></span><br><span class="what">Classified connection</span></span><span class="kind" style="color:var(--stamp)">Restricted</span></button>`;
    }
    const filed = r.to_sim ? simById(r.to_sim) : null;
    const name = filed ? filed.name : r.to_name;
    const secret = r.secret ? (isOpen(key) ? ` <span style="color:var(--stamp)">${esc(r.secret)}</span>` : ` <span class="r-redline" role="button" tabindex="0" data-reveal="${key}" aria-label="Declassify"></span>`) : "";
    const label = [r.label, filed ? "" : "file pending"].filter(Boolean).join(", ");
    const inner = `${filed ? face(filed,"sm") : av(name,"sm")}<span><span class="who">${esc(name)}</span><br><span class="what">${esc(label)}${secret}</span></span><span class="kind" style="color:var(--${r.kind})">${kindName(r.kind)}</span>`;
    const main = filed ? `<button class="r-rel-main" data-open="${filed.id}">${inner}</button>` : `<div class="r-rel-main">${inner}</div>`;
    return `<div class="r-rel ${filed ? "" : "unfiled"}">${main}<button type="button" class="r-rel-edit" data-rel="${r.id}" aria-label="Edit connection to ${esc(name)}">Edit</button></div>`;
  }

  function relForm(s, r){
    const filed = r && r.to_sim ? simById(r.to_sim) : null;
    const who = r ? (filed ? filed.name : r.to_name || "") : "";
    const k = r ? r.kind : "friend";
    const note = !r ? `<p class="r-help">If they're on file, this connection is added to their record too, worded the same way.</p>`
      : r.pair != null ? `<p class="r-help">Edits here change only ${esc(first(s.name))}'s file. Delete removes it from both files.</p>` : "";
    return `<form class="r-form r-relform" data-sec="rel" data-rel="${r ? r.id : "new"}">
      <label><span class="r-lbl">Who</span><input class="r-input" name="who" list="r-dl-sims" value="${esc(who)}" required autocomplete="off">${dl("r-dl-sims", data.sims.filter(x => x.id !== s.id).map(x => x.name))}
        <div class="r-help">Pick a resident on file, or type a new name to mark them file pending.</div></label>
      <div><span class="r-lbl">Kind</span><div class="r-kinds">${Object.entries(data.options.relationship_kind).map(([v,n]) => `<label class="r-kind" style="--c:var(--${v})"><input type="radio" name="kind" value="${v}" ${v===k?"checked":""}><span>${n}</span></label>`).join("")}</div></div>
      <label><span class="r-lbl">How they're connected</span><input class="r-input" name="label" value="${esc(r && r.label)}" placeholder="Short description"></label>
      <label><span class="r-lbl">Secret line</span><input class="r-input" name="secret" value="${esc(r && r.secret)}"><div class="r-help">Optional. Shows as a redaction bar until declassified.</div></label>
      <label class="r-check"><input type="checkbox" name="hidden" ${r && r.hidden ? "checked" : ""}> Classified: hide the whole connection in Public view</label>
      ${note}
      ${actions(r ? `<button type="button" class="r-btn danger" data-act="rel-del">Delete</button><span class="r-grow"></span>` : "")}
    </form>`;
  }

  function connectionsTab(s){
    const rels = relsFor(s.id);
    const rows = rels.map(r => st.rel === String(r.id) ? relForm(s, r) : relHTML(s, r)).join("");
    const list = `${st.rel === "new" ? relForm(s, null) : ""}${rows || (st.rel === "new" ? "" : '<span class="r-none">No connections on file</span>')}`;
    return `<section class="r-sec"><h3>Connections <small>${rels.length} on file</small>${st.rel ? "" : `<button type="button" class="r-sec-edit" data-act="rel-new">+ Add</button>`}</h3>
      <div class="r-conn"><div class="r-rels">${list}</div>
        <div class="r-webbox"><svg viewBox="0 0 320 320" role="img" aria-label="Connection web">${webSVG(s)}</svg>
          <div class="r-legend">
            <span><i style="background:var(--fam)"></i>Family</span><span><i style="background:var(--rom)"></i>Romance</span>
            <span><i style="background:var(--ex)"></i>Ex</span><span><i style="background:var(--work)"></i>Work</span>
            <span><i style="background:var(--friend)"></i>Friend</span><span><i style="background:var(--stamp);opacity:.5"></i>Classified</span>
          </div></div></div></section>`;
  }

  function propertyTab(s){
    const home = homeOf(s), owned = new Set(ownedBy(s).map(l => l.id));
    const view = `<div class="r-grid2">
        <div><span class="r-lbl">Home address</span>${home ? esc(lotLabel(home)) : '<span class="r-none">Not on file</span>'}</div>
        <div><span class="r-lbl">Owns</span>${ownedBy(s).length ? `<div class="r-tags">${ownedBy(s).map(l => `<span class="r-tagi">${esc(lotLabel(l))}</span>`).join("")}</div>` : '<span class="r-none">No property on record</span>'}</div></div>`;
    const homes = lots().filter(l => RESIDENTIAL.includes(l.lot_type) && !lots().some(u => u.parent_id === l.id));
    const edit = form("property", `
      <label><span class="r-lbl">Home address</span><select name="home"><option value="">No home on file</option>${homes.map(l => `<option value="${l.id}" ${home && home.id===l.id?"selected":""}>${esc(lotLabel(l))}${l.household && l.household !== s.household ? " (" + esc(l.household) + ")" : (!l.household ? " (vacant)" : "")}</option>`).join("")}</select>
        <div class="r-help">Moves this Sim's whole household into that lot. If another household already lives there, this Sim joins it.</div></label>
      <div><span class="r-lbl">Owns</span><div class="r-owns">${lots().filter(l => !l.parent_id || owned.has(l.id)).map(l => `<label><input type="checkbox" name="owns" value="${l.id}" ${owned.has(l.id)?"checked":""}>${esc(lotLabel(l))}${l.owner && !owned.has(l.id) ? ` <em>owned by ${esc(l.owner)}</em>` : ""}</label>`).join("")}</div>
        <div class="r-help">Homes or community lots. Checking a lot someone else owns transfers it to this Sim.</div></div>`);
    return (lots().length ? sec("property", "Property records", "", st.edit === "property" ? edit : view) : "")
      + sec("money", "Money", "From Harbor Trust and Porchlight", moneyHTML(s), false);
  }

  /* every account this Sim holds, shares, or is custodian of, at both banks, plus loans and credit score */
  function moneyHTML(s){
    const BANKS = { harbor:["Harbor Trust","trust"], porchlight:["Porchlight","porchlight"] };
    const nm = id => stripNick((simById(id) || {}).name || id);
    const mine = (data.accounts || []).filter(a => a.status !== "Closed" && (a.holder_sim === s.id || a.co_holder === s.id || (a.custodians || []).includes(s.id)));
    const rows = mine.map(a => {
      const [bank, route] = BANKS[a.bank || "harbor"];
      const who = [a.co_holder ? "Joint with " + nm(a.co_holder === s.id ? a.holder_sim : a.co_holder) : "", a.minor ? ((a.custodians || []).includes(s.id) ? "Custodian of " + nm(a.holder_sim) + "'s minor account" : "Minor account") : ""].filter(Boolean).join(", ");
      const line = a.card ? `Credit card ••${esc(a.number)}: ${money(a.balance) || "$0"} owed of ${money(a.limit) || "$0"}${a.status !== "Active" ? ", " + esc(a.status) : ""}` : `${esc(a.type)} ••${esc(a.number)}: ${money(a.balance) || "$0"}${a.status !== "Active" ? ", " + esc(a.status) : ""}`;
      return `<a href="#/${route}/staff/a/${a.id}"><span>${bank}${who ? ", " + esc(who) : ""}</span>${line}</a>`;
    });
    const loans = (data.loans || []).filter(l => l.status !== "Paid off" && (l.borrower === stripNick(s.name) || (s.household && l.borrower === s.household)))
      .map(l => `<a href="#/${BANKS[l.bank || "harbor"][1]}/staff"><span>${BANKS[l.bank || "harbor"][0]} loan, ${esc(l.status)}</span>${esc(l.type)}: ${money(l.balance) || "$0"} remaining</a>`);
    return `<div class="r-grid2"><div><span class="r-lbl">Accounts and cards</span>${rows.length ? `<div class="r-callist">${rows.join("")}</div>` : '<span class="r-none">No accounts on record</span>'}</div>
      <div><span class="r-lbl">Loans</span>${loans.length ? `<div class="r-callist">${loans.join("")}</div>` : '<span class="r-none">No open loans</span>'}
      <span class="r-lbl" style="margin-top:14px">Credit score (Porchlight)</span>${s.credit_score ? esc(s.credit_score) : '<span class="r-none">Not on file</span>'}</div></div>`;
  }

  function notesTab(s){
    const notesView = `<div class="r-notes">${(s.notes||[]).map(n => `<p>${esc(n)}</p>`).join("") || '<span class="r-none">No notes yet</span>'}</div>`;
    const notesEdit = form("notes", `<label><textarea name="notes" aria-label="Case notes">${esc((s.notes||[]).join("\n\n"))}</textarea><div class="r-help">Leave a blank line between paragraphs.</div></label>`);
    const secretsView = (s.secrets||[]).map((t,i) => { const k = s.id + ":sec:" + i; return `<button class="r-redact ${isOpen(k)?"open":""}" data-reveal="${k}" ${isOpen(k) ? 'aria-disabled="true"' : 'aria-label="Redacted line. Select to declassify"'}><span class="txt">${esc(t)}</span></button>`; }).join("") || '<span class="r-none">Nothing restricted</span>';
    const secretsEdit = form("secrets", `<label><textarea name="secrets" aria-label="Restricted lines">${esc((s.secrets||[]).join("\n"))}</textarea><div class="r-help">One secret per line. Each line gets its own redaction bar.</div></label>`);
    return sec("notes", "Case notes", "", st.edit === "notes" ? notesEdit : notesView)
         + sec("secrets", "Restricted", st.clear ? "Restricted access active" : "Select a bar to declassify it", st.edit === "secrets" ? secretsEdit : secretsView);
  }

  function activityTab(s){
    const ev = calEvents(s).sort((a,b) => seasonOrder(a.season) - seasonOrder(b.season) || a.day - b.day);
    return sec("cal", "Calendar record", "Edit in Calendar", `<div class="r-grid2">
        <div><span class="r-lbl">Recurring appearances</span>${ev.length ? `<div class="r-callist">${ev.map(e => `<a href="${calLink(e.season, e.day)}"><span>${esc(e.season)}, day ${e.day}</span>${esc(e.title)}</a>`).join("")}</div>` : '<span class="r-none">None on record</span>'}</div>
        <div><span class="r-lbl">Logged activity</span>${calLogs(s).length ? `<div class="r-callist">${calLogs(s).map(l => `<a href="${calLink(l.season, l.day)}"><span>Year ${l.year}, ${esc(l.season)}, day ${l.day}</span>${esc(l.title || (l.text.length > 90 ? l.text.slice(0, 88) + "\u2026" : l.text))}</a>`).join("")}</div>` : '<span class="r-none">None on record</span>'}</div></div>`, false)
      + sec("plans", "Known plans", "Edit in Plumb", plans(s).length ? `<div class="r-callist">${plans(s).map(t => `<a href="#/plumb/sim:${s.id}"><span>${t.done ? "Completed" : t.when === "now" ? "In progress" : "Planned"}</span>${esc(t.title)}</a>`).join("")}</div>` : '<span class="r-none">None on record</span>', false);
  }

  function webSVG(s){
    const C = 160, R = 112, rels = relsFor(s.id), n = rels.length || 1;
    const pts = rels.map((r,k) => { const a = -Math.PI/2 + 2*Math.PI*k/n; return { r, x: C + R*Math.cos(a), y: C + R*Math.sin(a) }; });
    let out = "";
    pts.forEach(({r,x,y}) => {
      const key = "rel:" + r.id, shown = !r.hidden || isOpen(key);
      if (!shown) { out += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="var(--stamp)" stroke-width="1.5" stroke-dasharray="3 4" opacity=".5"/>`; return; }
      const dashed = (r.hidden || r.secret) && isOpen(key);
      out += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="var(--${r.kind})" stroke-width="2" ${dashed ? 'stroke-dasharray="6 4"' : ""}/>`;
    });
    pts.forEach(({r,x,y}) => {
      const key = "rel:" + r.id, shown = !r.hidden || isOpen(key);
      const filed = r.to_sim ? simById(r.to_sim) : null;
      const name = shown ? (filed ? filed.name : r.to_name) : "?";
      const label = shown ? first(name) : "Restricted";
      const fill = shown ? avColor(name) : "var(--redact)";
      const attrs = !shown ? `class="node" data-reveal="${key}" tabindex="0" role="button" aria-label="Declassify connection"`
                  : filed ? `class="node" data-open="${filed.id}" tabindex="0" role="button" aria-label="Open ${esc(filed.name)}"` : "";
      out += `<g ${attrs}><circle cx="${x}" cy="${y}" r="19" fill="${fill}" ${filed || !shown ? "" : 'stroke="var(--muted)" stroke-dasharray="3 3"'}/>
        <text x="${x}" y="${y+5}" text-anchor="middle" font-family="Public Sans, Arial, sans-serif" font-weight="700" font-size="14" fill="#fff">${shown ? esc(initials(name)) : "?"}</text>
        <text x="${x}" y="${y+35}" text-anchor="middle" font-family="Public Sans, Arial, sans-serif" font-size="11.5" fill="var(--ink)">${esc(label)}</text></g>`;
    });
    out += `<circle cx="${C}" cy="${C}" r="30" fill="${avColor(s.name)}" stroke="var(--ink)" stroke-width="2"/>
      <text x="${C}" y="${C+7}" text-anchor="middle" font-family="Public Sans, Arial, sans-serif" font-weight="700" font-size="20" fill="#fff">${esc(initials(s.name))}</text>`;
    return out;
  }

  /* ---------- full render ---------- */
  /* banner + agency header, shared by the gallery and the record pages */
  function topHTML(){ return `      <div class="r-banner"><span class="flag" aria-hidden="true"></span>An official website of the Simerican government</div>
      <div class="r-agency">
        <svg class="r-seal" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="24" cy="24" r="11" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/><path d="M24 12 L30 24 L24 36 L18 24 Z" fill="currentColor"/></svg>
        <div><p class="org">Simerican Office of Resident Affairs</p><h1>Resident Registry</h1></div>
        <div class="spacer"></div>
        <div class="r-count">${data.sims.length} residents on file<br>Records current to ${new Date(data.updated + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
        <div class="r-access" role="group" aria-label="Access level"><button data-act="public" aria-pressed="${!st.clear}">Public</button><button class="restricted" data-act="restricted" aria-pressed="${st.clear}">Restricted</button></div>
      </div>
`; }

  /* ---------- gallery (Registry home) ---------- */
  const SORTS = [["name","Name"],["file","File number"],["gaps","Most file gaps"],["status","Status"]];
  function galCards(){
    const v = [...visible()];
    if (st.sort === "file") v.sort((a, b) => (parseInt(a.file_no, 10) || 0) - (parseInt(b.file_no, 10) || 0));
    else if (st.sort === "gaps") v.sort((a, b) => gaps(b).length - gaps(a).length || stripNick(a.name).localeCompare(stripNick(b.name)));
    else if (st.sort === "status") v.sort((a, b) => String(a.status || "~").localeCompare(String(b.status || "~")) || stripNick(a.name).localeCompare(stripNick(b.name)));
    else v.sort((a, b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    if (!v.length) return `<p class="r-galnone">No residents match. Clear the search or pick another filter.</p>`;
    return v.map(s => { const g = gaps(s).length, age = [s.age, s.life_stage].filter(x => x != null && x !== "").join(", ");
      return `<a class="r-card" href="#/registry/${s.id}"><span class="r-card-ph">${s.portrait ? `<img src="${esc(s.portrait)}" alt="">` : `<span class="r-card-ini" style="background:${avColor(s.name)}">${esc(initials(s.name))}</span>`}${s.status ? `<span class="r-card-st">${esc(s.status)}</span>` : ""}</span>
        <span class="r-card-b"><b>${esc(s.name)}</b>${age ? `<small>${esc(age)}</small>` : ""}<span class="r-card-job">${esc(s.career || "No occupation on file")}</span>${s.residence || s.household ? `<small>${esc([s.residence, s.household].filter(Boolean).join(" \u00b7 "))}</small>` : ""}${g ? `<span class="r-gap">${g} gap${g > 1 ? "s" : ""}</span>` : ""}</span></a>`; }).join("");
  }
  function drawGallery(){
    root.innerHTML = `<div class="site-registry">${topHTML()}
      <div class="r-galwrap"><div class="r-galbar">
          <input class="r-search" id="r-q" type="search" placeholder="Search ${data.sims.length} residents" aria-label="Search residents" value="${esc(st.q)}">
          <div class="r-filters">${FILTERS.map(f => `<button class="r-chip" data-filter="${f}" aria-pressed="${st.filter===f}">${f}</button>`).join("")}</div>
          <label class="r-sortl">Sort <select id="r-sort">${SORTS.map(([k, n]) => `<option value="${k}" ${st.sort === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <div class="r-galnew">${newForm()}</div></div>
        <div class="r-gal" id="r-gal">${galCards()}</div>
        ${pendingNames().length ? `<div class="r-galpend"><h3>Awaiting processing</h3>${pendingNames().map(p => `<button class="r-pendchip" data-file="${esc(p)}">${esc(p)} <span>Open file</span></button>`).join("")}</div>` : ""}
      </div></div>`;
  }

  function draw(){
    if (!curId || !simById(curId)) return drawGallery();
    const s = simById(curId), g = gaps(s);
    const body = { profile:profileTab, connections:connectionsTab, property:propertyTab, notes:notesTab, activity:activityTab }[st.tab](s);
    root.innerHTML = `<div class="site-registry">
${topHTML()}      <div class="r-mpick"><label class="r-lbl" for="r-pick">Resident record</label><div class="r-mrow">${UI.picker({ id:"r-pick", cls:"field", value:curId, options:[...data.sims].sort((a, b) => stripNick(a.name).localeCompare(stripNick(b.name))).map(x => ({ v:x.id, t:x.name, s:x.career || "" })), placeholder:"Search residents", label:"Resident record" })}<button class="r-btn ghost" data-act="new">+ New</button></div>${st.creating ? newForm() : ""}</div>
      <div class="r-shell">
        <nav class="r-index" aria-label="Resident index">
          <input class="r-search" id="r-q" type="search" placeholder="Search residents" aria-label="Search residents" value="${esc(st.q)}">
          <div class="r-filters">${FILTERS.map(f => `<button class="r-chip" data-filter="${f}" aria-pressed="${st.filter===f}">${f}</button>`).join("")}</div>
          ${newForm()}
          <div id="r-list">${listHTML()}</div>
          ${pendingNames().length ? `<div class="r-ixh">Awaiting processing</div>${pendingNames().map(p => `<button class="r-pending r-pendbtn" data-file="${esc(p)}">${esc(p)}<span>Open file</span></button>`).join("")}` : ""}
          ${GFB.hasLocalEdits() ? `<button class="r-reset" data-act="reset">Discard my local edits</button>` : ""}
        </nav>
        <section class="r-file">
          <div class="r-recbar"><a class="r-allres" href="#/registry">All residents</a><span>Resident record <b>GFB-${esc(s.file_no)}</b></span>${st.edit === "basics" ? "" : `<button class="r-edit-btn" data-edit="basics">Edit basics</button>`}</div>
          <article class="r-folder ${st.clear ? "cleared" : ""}">
            <div class="r-stamp" aria-hidden="true">Restricted</div>
            <div class="r-head">${face(s,"lg")}
              <div style="min-width:0;flex:1">
                <h2>${esc(s.name)}</h2>
                <p class="r-alias">${s.simsta ? esc(s.simsta) : "No Simsta handle on file"}</p>
                ${st.edit === "basics" ? "" : factsHTML(s)}
              </div>
            </div>
            ${st.edit === "basics" ? basicsForm(s) : ""}
            ${st.msg ? `<p class="r-saved ${st.err ? "err" : ""}" role="status">${esc(st.msg)}</p>` : ""}
            ${g.length ? `<div class="r-gapbar"><b>File gaps</b>${g.map(([t, to]) => `<button class="r-gapchip" data-gap="${to}">${t}</button>`).join("")}</div>` : ""}
            <div class="r-tabs" role="tablist">${TABS.map(([k,n]) => `<button role="tab" data-tab="${k}" aria-selected="${st.tab===k}">${n}${k === "connections" ? ` <span>${relsFor(s.id).length}</span>` : ""}</button>`).join("")}</div>
            ${body}
            <div class="r-foot"><span>File GFB-${esc(s.file_no)}</span></div>
          </article>
        </section>
      </div>
    </div>`;
    st.msg = ""; st.err = false;
    if (st.edit && st.edit !== "basics") root.querySelector(`#r-sec-${st.edit}`)?.scrollIntoView({block:"nearest"});
  }

  /* ---------- saving ---------- */
  async function mirror(r){
    if (!r.to_sim || r.to_sim === r.from_sim) return false;
    if (data.relationships.some(x => x.id !== r.id && x.from_sim === r.to_sim && x.to_sim === r.from_sim)) return false; /* their file already lists this Sim */
    const m = await GFB.saveRel({ from_sim:r.to_sim, to_sim:r.from_sim, to_name:null, kind:r.kind, label:r.label, secret:r.secret, hidden:r.hidden, pair:r.id });
    await GFB.saveRel({ id:r.id, pair:m.id });
    return true;
  }

  async function createSim(name){
    name = name.trim(); if (!name) return;
    const existing = findSim(name);
    if (existing) { st.creating = false; location.hash = "#/registry/" + existing.id; return; }
    const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let id = slug(first(name)) || "resident";
    if (simById(id)) { id = slug(stripNick(name)); let n = 2; while (simById(id)) id = slug(stripNick(name)) + "-" + n++; }
    const file_no = String(Math.max(0, ...data.sims.map(x => parseInt(x.file_no, 10) || 0)) + 1).padStart(3, "0");
    await GFB.addSim({ id, file_no, name, simsta:null, age:null, life_stage:null, gender:null, career:"", residence:"", household:null, status:"Planned",
      traits:[], aspiration:null, attachment:null, love_language:null, likes:[], dislikes:[], turn_ons:[], turn_offs:[], notes:[], secrets:[] });
    /* anyone who listed this name as "file pending" now points at the new record, and gets mirrored */
    for (const r of data.relationships.filter(r => !r.to_sim && r.to_name && r.to_name.toLowerCase() === name.toLowerCase())) {
      const u = { ...r, to_sim:id, to_name:null }; await GFB.saveRel(u); await mirror(u);
    }
    st.creating = false; st.tab = "profile"; st.nextEdit = "basics";
    location.hash = "#/registry/" + id;
  }

  async function saveProperty(f, s){
    let household = s.household;
    const homeId = f.get("home") || "", oldHome = homeOf(s);
    if (homeId) {
      const lot = lots().find(l => l.id === homeId);
      if (lot.household && lot.household !== household) household = lot.household;
      else if (!lot.household) {
        if (!household) household = stripNick(s.name).split(" ").slice(-1)[0] + " Household";
        for (const l of lots().filter(l => l.household === household && RESIDENTIAL.includes(l.lot_type))) await GFB.saveLot({ ...l, household:null });
        await GFB.saveLot({ ...lot, household, market_status: lot.market_status === "For lease" ? "Leased" : lot.market_status === "For sale" ? "Owner-occupied" : lot.market_status });
      }
    } else if (oldHome && data.sims.filter(x => x.household === household).length <= 1) {
      await GFB.saveLot({ ...oldHome, household:null, market_status: oldHome.market_status === "Leased" ? "For lease" : oldHome.market_status });
    }
    const me = stripNick(s.name), want = new Set(f.getAll("owns"));
    for (const l of lots()) {
      if (want.has(l.id) && l.owner !== me) await GFB.saveLot({ ...l, owner:me });
      if (!want.has(l.id) && l.owner === me) await GFB.saveLot({ ...l, owner:null });
    }
    if (household !== s.household) await GFB.saveSim(s.id, { household });
  }

  async function save(form){
    const f = new FormData(form), v = k => String(f.get(k) || "").trim(), key = form.dataset.sec, s = simById(curId);
    try {
      if (key === "new") return await createSim(v("name"));
      if (key === "basics") {
        const patch = { name: v("name") || s.name, simsta: v("simsta") || null, age: v("age") === "" ? null : Number(v("age")), life_stage: v("life_stage") || null,
          gender: v("gender") || null, status: v("status") || null, career: v("career"), residence: v("residence"), household: v("household") || null };
        const file = f.get("portrait");
        if (file && file.size) patch.portrait = (await GFB.uploadImage(file, 480)).url;
        else if (f.get("noportrait")) patch.portrait = null;
        const hs = f.get("headshot");
        if (hs && hs.size) patch.headshot = (await GFB.uploadImage(hs, 480)).url;
        else if (f.get("noheadshot")) patch.headshot = null;
        if (stripNick(patch.name) !== stripNick(s.name)) for (const l of lots().filter(l => l.owner === stripNick(s.name))) await GFB.saveLot({ ...l, owner: stripNick(patch.name) });
        await GFB.saveSim(curId, patch);
      }
      if (key === "behavior") await GFB.saveSim(curId, {
        traits: [0,1,2,3,4].map(i => v("trait"+i)).filter(Boolean).filter((t,i,a) => a.indexOf(t) === i),
        aspiration: v("aspiration") || null, attachment: v("attachment") || null, love_language: v("love_language") || null });
      if (key === "prefs") {
        const patch = Object.fromEntries(PREF_KEYS.map(([k]) => [k, f.getAll(k)]));
        for (const [k, vals] of Object.entries(patch)) { const list = data.options[k] || [], add = vals.filter(x => !list.some(y => y.toLowerCase() === x.toLowerCase())); if (add.length) await GFB.saveOptions(k, [...list, ...add].sort((a,b) => a.localeCompare(b))); }
        await GFB.saveSim(curId, patch);
      }
      if (key === "lists") for (const [k] of LIST_KEYS) {
        const list = [...new Set(String(f.get(k) || "").split("\n").map(x => x.trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
        await GFB.saveOptions(k, list);
      }
      if (key === "notes") await GFB.saveSim(curId, { notes: v("notes").split(/\n\s*\n/).map(x => x.trim()).filter(Boolean) });
      if (key === "secrets") await GFB.saveSim(curId, { secrets: v("secrets").split("\n").map(x => x.trim()).filter(Boolean) });
      if (key === "property") await saveProperty(f, s);
      if (key === "rel") {
        const old = form.dataset.rel === "new" ? null : relById(form.dataset.rel);
        const target = findSim(v("who"));
        if (target && target.id === curId) { st.msg = "A Sim can't be connected to themselves."; st.err = true; return draw(); }
        const row = { ...(old ? { id:old.id } : {}), from_sim:curId, to_sim: target ? target.id : null, to_name: target ? null : v("who"),
          kind: v("kind") || "friend", label: v("label"), secret: v("secret") || null, hidden: !!f.get("hidden") };
        const saved = await GFB.saveRel(row);
        if (saved.to_sim && (!old || (!old.to_sim && old.pair == null))) {
          const who = first(simById(saved.to_sim).name);
          st.msg = (await mirror(saved)) ? `Connection saved to ${first(s.name)}'s and ${who}'s files.` : `Saved. ${who}'s file already lists ${first(s.name)}, so it wasn't added twice.`;
        }
      }
      data = await GFB.getAll();
      st.edit = null; st.rel = null;
      st.msg = st.msg || "Record updated. Saved to this browser.";
    } catch (err) { st.msg = err.message; st.err = true; }
    draw();
  }

  async function deleteRel(id){
    const r = relById(id); if (!r) return;
    await GFB.deleteRel(r.id);
    if (r.pair != null && relById(r.pair)) await GFB.deleteRel(relById(r.pair).id);
    data = await GFB.getAll(); st.rel = null; st.msg = r.pair != null ? "Connection removed from both files." : "Connection removed."; draw();
  }

  function addTag(box){
    const input = box.querySelector(".r-tagadd input"), name = box.dataset.name;
    const have = new Set([...box.querySelectorAll("input[type=hidden]")].map(i => i.value.toLowerCase()));
    input.value.split(",").map(x => x.trim()).filter(Boolean).forEach(t => { if (!have.has(t.toLowerCase())) { box.querySelector(".sp-chips").insertAdjacentHTML("beforeend", chip(name, t)); have.add(t.toLowerCase()); } });
    input.value = ""; input.focus();
  }

  /* ---------- events (bound once) ---------- */
  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    document.addEventListener("click", e => {
      if (!root || !root.contains(e.target) || !root.querySelector(".site-registry")) return;
      const t = e.target;
      const ta = t.closest("[data-tagadd]"); if (ta) { addTag(ta.closest(".r-taginput")); return; }
      const rev = t.closest("[data-reveal]"); if (rev) { st.open.add(rev.dataset.reveal); draw(); return; }
      const re = t.closest("[data-rel]:not(form)"); if (re) { st.rel = re.dataset.rel; st.edit = null; draw(); return; }
      const op = t.closest("[data-open]"); if (op) { location.hash = "#/registry/" + op.dataset.open; if (innerWidth <= 720) scrollTo({top:0,behavior:"smooth"}); return; }
      const fl = t.closest("[data-filter]"); if (fl) { st.filter = fl.dataset.filter; draw(); return; }
      const tb = t.closest("[data-tab]"); if (tb) { st.tab = tb.dataset.tab; st.edit = null; st.rel = null; draw(); return; }
      const ed = t.closest("[data-edit]"); if (ed) { st.edit = ed.dataset.edit; st.rel = null; draw(); return; }
      const gp = t.closest("[data-gap]"); if (gp) { const [tab, part] = gp.dataset.gap.split(":"); if (part) { st.tab = tab; st.edit = part; } else st.edit = tab; st.rel = null; draw(); return; }
      const pf = t.closest("[data-file]"); if (pf) { if (UI.confirmTap(pf, "Tap again to open a file")) createSim(pf.dataset.file); return; }
      const act = t.closest("[data-act]")?.dataset.act;
      if (act === "public") { st.clear = false; draw(); }
      if (act === "restricted") { st.clear = true; draw(); }
      if (act === "new") { st.creating = true; draw(); [...root.querySelectorAll(".r-newform input")].find(i => i.offsetParent)?.focus(); }
      if (act === "cancel") { st.edit = null; st.rel = null; st.creating = false; draw(); }
      if (act === "rel-new") { st.rel = "new"; st.edit = null; draw(); }
      if (act === "rel-del") { const b = t.closest("[data-act=rel-del]"); if (UI.confirmTap(b, "Tap again to delete")) deleteRel(b.closest("form").dataset.rel); }
      if (act === "reset" && UI.confirmTap(t.closest("[data-act=reset]"), "Tap again to discard everything")) { GFB.resetLocal(); GFB.getAll().then(d => { data = d; if (!simById(curId)) curId = data.sims[0].id; draw(); }); }
    });
    document.addEventListener("keydown", e => {
      if (!root || !root.contains(e.target)) return;
      if (e.key === "Enter" && e.target.closest?.(".r-tagadd")) { e.preventDefault(); addTag(e.target.closest(".r-taginput")); return; }
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("g[data-open],g[data-reveal],span[data-reveal]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click",{bubbles:true})); }
    });
    document.addEventListener("input", e => {
      if (e.target.id === "r-q" && root?.querySelector(".site-registry")) { st.q = e.target.value; const l = document.getElementById("r-list"), gl = document.getElementById("r-gal"); if (l) l.innerHTML = listHTML(); if (gl) gl.innerHTML = galCards(); }
    });
    document.addEventListener("change", e => { if (e.target.id === "r-sort" && root?.contains(e.target)) { st.sort = e.target.value; draw(); return; } if (e.target.id === "r-pick") location.hash = "#/registry/" + e.target.value; });
    document.addEventListener("submit", e => { if (root && root.contains(e.target) && e.target.dataset.sec) { e.preventDefault(); save(e.target); } });
  }

  function render(el, d, id){
    root = el; data = d;
    if (id !== curId) { st.edit = st.nextEdit; st.nextEdit = null; st.rel = null; st.creating = false; }
    curId = id;
    bind(); draw();
  }
  return { render };
})();
