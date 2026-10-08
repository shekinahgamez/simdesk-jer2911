/* Simsta: every Sim's curated self. Accounts (main + alts), feed, posts, comments, mentions.
   Account keys: a Sim's main account uses the Sim id; an alt uses "simId~altId". */
const Simsta = (() => {
  const st = { modal:null, err:null, uploading:false, tab:"posts", draft:null, open:{}, q:"", dq:"", sq:"", lb:null, actor:null };
  let data = null, root = null, route = [];
  try { st.actor = localStorage.getItem("simsta-actor"); } catch {}

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const clean = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const sim = id => data.sims.find(s => s.id === id);
  const cal = () => data.calendar;
  const ord = d => d ? (d.year - 1) * 84 + cal().seasons.findIndex(x => x.name === d.season) * 21 + d.day : 0;
  const nowOrd = () => ord({ ...cal().today, year: cal().year });
  const ago = d => { if (!d) return ""; const n = nowOrd() - ord(d); return n <= 0 ? "Today" : n === 1 ? "Yesterday" : n < 21 ? `${n} days ago` : `${d.season}, day ${d.day}${d.year !== cal().year ? ", Year " + d.year : ""}`; };
  const fullDate = d => d ? `${d.season}, day ${d.day}, Year ${d.year}` : "";
  const lotName = id => (data.lots.find(l => l.id === id) || {}).address;
  const ini = n => clean(n).replace(/^@/, "").split(/[\s._]+/).filter(Boolean).map(w => w[0]).slice(0,2).join("").toUpperCase();
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const fmt = n => { n = Number(n || 0); return n >= 1e6 ? (n/1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : n >= 1e4 ? (n/1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K" : n.toLocaleString("en-US"); };
  const go = h => { location.hash = "#/simsta" + (h ? "/" + h : ""); };

  /* ---------- accounts ---------- */
  function accts(){
    const out = [];
    for (const s of data.sims){
      if (s.simsta) out.push({ key:s.id, sim:s, handle:GFB.normHandle(s.simsta), name:s.simsta_name || clean(s.name), bio:s.simsta_bio, followers:s.simsta_followers, following:s.simsta_following, avatar:s.simsta_avatar || s.portrait || null, alt:false });
      for (const a of s.simsta_alts || []) out.push({ key:s.id + "~" + a.id, sim:s, altId:a.id, handle:GFB.normHandle(a.handle), name:a.name || clean(s.name), bio:a.bio, followers:a.followers, following:a.following, avatar:a.avatar, alt:true });
    }
    return out.sort((a,b) => a.handle.localeCompare(b.handle));
  }
  const acct = key => accts().find(a => a.key === key);
  const byHandle = h => accts().find(a => a.handle === GFB.normHandle(h));
  const posts = () => [...(data.posts || [])].sort((a,b) => ord(b.date) - ord(a.date) || (b.created || "").localeCompare(a.created || ""));
  /* acting as follows the shared "Signed in as" Sim (also used by Huddl and Cliq) when that Sim has an account */
  const actor = () => { const sh = (data.settings || {}).acting_sim, mine = acct(st.actor); if (sh && (!mine || mine.sim.id !== sh)) { const a = acct(sh); if (a) return a; } return mine || accts()[0] || null; };
  const setActor = k => { st.actor = k; try { localStorage.setItem("simsta-actor", k); } catch {} const a = acct(k); if (a) GFB.saveSetting("acting_sim", a.sim.id); };
  /* who to look at when there are no posts yet */
  const suggest = n => { const me = actor(), list = accts().filter(a => !a.alt && (!me || a.key !== me.key)).slice(0, n);
    return list.length ? `<div class="sm-suggest"><h3>Accounts to look at</h3><div class="sm-sgrid">${list.map(a => `<a class="sm-scard" href="#/simsta/u/${encodeURIComponent(a.key)}">${av(a, 56)}<b>${esc(a.handle)}</b><small>${esc(a.name || "")}</small></a>`).join("")}</div></div>` : ""; };
  const postedRecently = key => posts().some(p => p.author === key && nowOrd() - ord(p.date) <= 3);
  const nameOf = key => { const a = acct(key); return a ? a.handle : clean(sim(key)?.name || "unknown"); };
  const matches = q => { q = q.toLowerCase().replace(/^@/, ""); return accts().filter(a => a.handle.includes(q) || a.name.toLowerCase().includes(q)); };
  const simMatches = q => { q = q.toLowerCase(); return data.sims.filter(s => !s.simsta && clean(s.name).toLowerCase().includes(q)); };
  const recent = () => { const seen = []; for (const p of posts()) { if (!seen.includes(p.author) && acct(p.author)) seen.push(p.author); if (seen.length === 6) break; } return seen.length ? seen.map(acct) : accts().slice(0, 6); };

  function av(a, size, ring){
    const key = a?.key || a?.id || "?", h = hue(key);
    const label = a?.name || a?.handle || "?";
    return `<span class="sm-av s${size} ${ring ? "ring" : ""}" style="--h:${h}">${a?.avatar ? `<img loading="lazy" decoding="async" src="${esc(a.avatar)}" alt="">` : esc(ini(label))}</span>`;
  }
  /* @mentions link to profiles, #tags open a tag page */
  function rich(text){
    return esc(text).replace(/(^|[\s(])@([a-z0-9._]+)/gi, (m, pre, h) => { const a = byHandle(h); return a ? `${pre}<button class="sm-mention" data-u="${a.key}">@${esc(h.toLowerCase())}</button>` : m; })
                    .replace(/(^|[\s(])#([\p{L}0-9_]+)/giu, (m, pre, t) => `${pre}<button class="sm-mention" data-tag="${esc(t.toLowerCase())}">#${esc(t)}</button>`);
  }

  const ICON = {
    home:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/></svg>`,
    explore:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z" stroke-linejoin="round"/></svg>`,
    heart:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.2 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.2 4.4 6.7C19.5 15.4 12 20 12 20z"/></svg>`,
    comment:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20l1.2-4.2A8.5 8.5 0 1 1 20.5 11.5z"/></svg>`,
    more:`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
    camera:`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="8" y="16" width="48" height="36" rx="8"/><circle cx="32" cy="34" r="10"/><path d="M22 16l4-6h12l4 6"/></svg>`,
    dice:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>`
  };

  /* ---------- post card ---------- */
  function postHTML(p, full){
    const a = acct(p.author), me = actor(), comments = p.comments || [];
    const showAll = full || st.open[p.id], shown = showAll ? comments : comments.slice(-2);
    const liked = me && (p.liked_by || []).includes(me.key);
    const tags = (p.tags || []).map(k => acct(k) || (sim(k) ? { key:k, handle:clean(sim(k).name) } : null)).filter(Boolean);
    return `<article class="sm-post">
      <div class="sm-phead"><button class="sm-handle" data-u="${p.author}" aria-label="Open profile">${av(a, 32, postedRecently(p.author))}</button>
        <div class="who"><button class="sm-handle" data-u="${p.author}">${esc(a ? a.handle : nameOf(p.author))}</button><span class="sm-sub">${[p.lot_id ? esc(lotName(p.lot_id)) : "", `<span title="${esc(fullDate(p.date))}">${ago(p.date)}</span>`].filter(Boolean).join(", ")}</span></div>
        <span style="flex:1"></span><button class="sm-handle sm-dots" data-edit="${p.id}" aria-label="Edit post">${ICON.more}</button></div>
      <img class="sm-photo" src="${esc(p.photo)}" alt="${esc(p.caption || "Photo")}" data-dbl="${p.id}">
      <div class="sm-actions"><button data-like="${p.id}" class="${liked ? "liked" : ""}" aria-label="${liked ? "Unlike" : "Like"}">${ICON.heart}</button><button data-focus="${p.id}" aria-label="Comment">${ICON.comment}</button></div>
      <div class="sm-likes">${fmt(p.likes)} like${Number(p.likes) === 1 ? "" : "s"}</div>
      ${p.caption ? `<div class="sm-cap"><b data-u="${p.author}">${esc(a ? a.handle : "")}</b>${rich(p.caption)}</div>` : ""}
      ${tags.length ? `<div class="sm-tags">with ${tags.map(t => `<button data-u="${t.key}">${esc(t.handle)}</button>`).join(", ")}</div>` : ""}
      ${!showAll && comments.length > 2 ? `<button class="sm-more" data-all="${p.id}">View all ${comments.length} comments</button>` : ""}
      ${shown.map(c => `<div class="sm-com"><b data-u="${c.author}">${esc(nameOf(c.author))}</b>${rich(c.text)}</div>`).join("")}
      ${me ? `<form class="sm-comform" data-cpost="${p.id}">${av(me, 28)}<input name="text" placeholder="Comment as ${esc(me.handle)}..." autocomplete="off"><button type="submit">Post</button></form>` : ""}
    </article>`;
  }

  /* ---------- views ---------- */
  function feedHTML(){
    const list = posts();
    const feed = list.length ? list.map(p => postHTML(p)).join("") : `<div class="sm-empty">${ICON.camera}<h2>Nothing posted yet</h2><p>Share the first photo as whoever you're acting as.</p><button class="sm-btn hot" data-new>New post</button></div>${suggest(6)}`;
    return `<div class="sm-feedwrap"><div class="sm-feed">${feed}</div>${asideHTML()}</div>`;
  }
  function asideHTML(){
    const week = posts().filter(p => nowOrd() - ord(p.date) <= 7).sort((a,b) => (b.likes || 0) - (a.likes || 0)).slice(0, 4);
    const days = []; for (let k = 0; k <= 3; k++) { const o = nowOrd() + k - 1, season = cal().seasons[Math.floor((((o % 84) + 84) % 84) / 21)].name, day = (((o % 84) + 84) % 84) % 21 + 1; cal().events.filter(e => e.season === season && e.day === day).forEach(e => days.push({ e, k })); }
    return `<aside class="sm-aside">
      ${week.length ? `<section><h3>Trending this week</h3>${week.map(p => `<button class="sm-trend" data-post="${p.id}"><img loading="lazy" decoding="async" src="${esc(p.photo)}" alt=""><span><b>${esc(nameOf(p.author))}</b><small>${fmt(p.likes)} likes</small></span></button>`).join("")}</section>` : ""}
      <section><h3>Coming up in the save</h3>${days.length ? days.slice(0, 5).map(({e, k}) => `<div class="sm-ev"><small>${k === 0 ? "Today" : k === 1 ? "Tomorrow" : "In " + k + " days"}</small>${esc(e.title)}</div>`).join("") : `<p class="sm-none" style="padding:0">Nothing on the calendar.</p>`}</section>
    </aside>`;
  }
  const grid = list => list.length ? `<div class="sm-grid">${list.map(p => `<button data-post="${p.id}" data-ctx="${list.map(x => x.id).join(",")}"><img loading="lazy" decoding="async" src="${esc(p.photo)}" alt=""></button>`).join("")}</div>` : "";
  function exploreHTML(){ const list = posts(); return `<div class="sm-prof">${grid(list) || `<div class="sm-empty">${ICON.camera}<h2>Nothing to explore yet</h2><p>Posts from every account show up here.</p></div>${suggest(12)}`}</div>`; }
  function tagHTML(t){
    const re = new RegExp("#" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}0-9_])", "iu");
    const list = posts().filter(p => re.test(p.caption || "") || (p.comments || []).some(c => re.test(c.text)));
    return `<div class="sm-prof"><div class="sm-dirhead"><h1>#${esc(t)}</h1><span class="sm-sub">${list.length} post${list.length === 1 ? "" : "s"}</span></div>${grid(list) || `<p class="sm-none">No posts with this tag yet.</p>`}</div>`;
  }

  function profileHTML(key){
    const a = acct(key);
    if (!a){
      const s = sim(key); if (!s) return feedHTML();
      return `<div class="sm-prof"><div class="sm-noacct">${av({ key:s.id, name:s.name }, 150)}<h2 style="color:var(--ink)">${esc(clean(s.name))} isn't on Simsta</h2><p>Give them a handle to start posting as them.</p><button class="sm-btn hot" data-editprof="${s.id}">Create account</button></div></div>`;
    }
    const mine = posts().filter(p => p.author === key), tagged = posts().filter(p => (p.tags || []).includes(key));
    const list = st.tab === "tagged" ? tagged : mine;
    const others = accts().filter(x => x.sim.id === a.sim.id && x.key !== key);
    return `<div class="sm-prof">
      <div class="sm-phero">${av(a, 150, postedRecently(key))}
        <div class="sm-pinfo"><div class="sm-prow"><h1>${esc(a.handle)}</h1><button class="sm-btn" data-editprof="${key}">Edit profile</button><button class="sm-btn" data-msg="${key}">Message</button>${actor()?.key === key ? `<span class="sm-pill">Acting as</span>` : `<button class="sm-btn hot" data-actas="${key}">Act as ${esc(a.handle)}</button>`}</div>
          <div class="sm-stats"><span><b>${mine.length}</b> post${mine.length === 1 ? "" : "s"}</span><span><b>${fmt(a.followers)}</b> followers</span><span><b>${fmt(a.following)}</b> following</span></div>
          <div class="sm-name">${esc(a.name)}</div>${a.bio ? `<p class="sm-bio">${rich(a.bio)}</p>` : ""}
          <p class="sm-owner">${a.alt ? "Alt account of" : "Main account of"} <button class="sm-mention" data-reg="${a.sim.id}">${esc(clean(a.sim.name))}</button>${others.length ? `. Also ${others.map(o => `<button class="sm-mention" data-u="${o.key}">${esc(o.handle)}</button>`).join(", ")}` : ""}</p></div></div>
      <div class="sm-tabs"><button data-ptab="posts" aria-current="${st.tab !== "tagged"}">POSTS</button><button data-ptab="tagged" aria-current="${st.tab === "tagged"}">TAGGED</button></div>
      ${grid(list) || `<div class="sm-empty"><p>${st.tab === "tagged" ? "No one's tagged them yet." : "No posts yet."}</p></div>`}
    </div>`;
  }

  const acctRow = a => `<button class="sm-acct" data-u="${a.key}">${av(a, 28, postedRecently(a.key))}<span class="nm">${esc(a.handle)}${a.alt ? `<small>alt</small>` : ""}</span></button>`;
  const simRow = s => `<button class="sm-acct" data-u="${s.id}">${av({ key:s.id, name:s.name }, 28)}<span class="nm">${esc(clean(s.name))}<small>Not on Simsta</small></span></button>`;
  function railList(){
    if (st.q.trim()) { const m = matches(st.q.trim()).slice(0, 8), n = simMatches(st.q.trim()).slice(0, 4); return m.length || n.length ? m.map(acctRow).join("") + n.map(simRow).join("") : `<p class="sm-none">No one matches.</p>`; }
    const r = recent(); return r.length ? `<div class="sm-acctlbl">${posts().length ? "Recently active" : "Accounts"}</div>${r.map(acctRow).join("")}` : "";
  }
  function dirRows(){
    const q = st.dq.trim(), A = q ? matches(q) : accts(), S = q ? simMatches(q) : data.sims.filter(s => !s.simsta).sort((a,b) => clean(a.name).localeCompare(clean(b.name)));
    const row = (a, isSim) => `<button class="sm-dirrow" data-u="${isSim ? a.id : a.key}">${isSim ? av({ key:a.id, name:a.name }, 40) : av(a, 40, postedRecently(a.key))}<span><b>${esc(isSim ? clean(a.name) : a.handle)}</b><small>${isSim ? "Not on Simsta" : esc(a.name) + (a.alt ? ", alt" : "")}</small></span><span class="ct">${isSim ? "" : (posts().filter(p => p.author === a.key).length || "")}</span></button>`;
    return A.length || S.length ? A.map(a => row(a)).join("") + S.map(s => row(s, true)).join("") : `<p class="sm-none">No one matches.</p>`;
  }
  function accountsHTML(){ return `<div class="sm-prof"><div class="sm-dirhead"><h1>All Sims</h1><input id="sm-dq" type="search" placeholder="Search by name or handle" value="${esc(st.dq)}" aria-label="Search all Sims" autocomplete="off"></div><div class="sm-dir" id="sm-dir">${dirRows()}</div></div>`; }

  function railHTML(view){
    const me = actor();
    return `<aside class="sm-rail"><button class="sm-wm" data-go="" aria-label="Simsta home"><svg class="sm-mark" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="smg2" x1="0" y1=".2" x2="1" y2=".8"><stop offset="0" stop-color="#DB1265"/><stop offset="1" stop-color="#F95A54"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#smg2)"/><path d="M32 11C33.6 25.2 38.8 30.4 53 32C38.8 33.6 33.6 38.8 32 53C30.4 38.8 25.2 33.6 11 32C25.2 30.4 30.4 25.2 32 11Z" fill="#fff"/></svg><span>sim<i>sta</i></span></button>
      ${me ? `<button class="sm-actor" data-switch>${av(me, 32)}<span><small>Acting as</small><b>${esc(me.handle)}</b></span><em>Switch</em></button>` : ""}
      <button class="sm-nav" data-go="" aria-current="${view === "feed"}">${ICON.home}<span>Home</span></button>
      <button class="sm-nav" data-go="explore" aria-current="${view === "explore"}">${ICON.explore}<span>Explore</span></button>
      <button class="sm-new" data-new>New post</button>
      <div class="sm-search"><input id="sm-q" type="search" placeholder="Search Sims" value="${esc(st.q)}" aria-label="Search Sims" autocomplete="off"></div>
      <div id="sm-raillist">${railList()}</div>
      <button class="sm-nav sm-all" data-go="accounts" aria-current="${view === "accounts"}"><span>See all ${data.sims.length} Sims</span></button>
    </aside>`;
  }

  /* ---------- lightbox ---------- */
  function lightboxHTML(){
    if (!st.lb) return "";
    const p = data.posts.find(x => x.id === st.lb.id); if (!p) return "";
    const i = st.lb.list.indexOf(p.id), prev = st.lb.list[i - 1], next = st.lb.list[i + 1];
    return `<div class="sm-lb" data-lbclose><div class="sm-lbbox">${postHTML(p, true)}</div>
      ${prev ? `<button class="sm-lbnav l" data-lbgo="${prev}" aria-label="Previous">&#8249;</button>` : ""}${next ? `<button class="sm-lbnav r" data-lbgo="${next}" aria-label="Next">&#8250;</button>` : ""}
      <button class="sm-lbx" data-lbclose aria-label="Close">&times;</button></div>`;
  }

  /* ---------- forms ---------- */
  const acctOpts = () => accts().map(a => ({ id:a.key, name:a.handle, career:a.name + (a.alt ? ", alt" : "") }));
  const suggestLikes = key => { const a = acct(key), f = Number(a?.followers || 0); const rate = 0.02 + Math.random() * 0.06; return Math.max(Math.round(5 + Math.random() * 35), Math.round(f * rate)); };
  function modalHTML(){
    if (!st.modal) return "";
    const err = st.err ? `<p class="sm-err">${esc(st.err)}</p>` : "", up = st.uploading ? `<p class="sm-note">Adding photo...</p>` : "";
    if (st.modal.kind === "switch"){
      const list = (st.sq.trim() ? matches(st.sq.trim()) : accts());
      return `<div class="sm-modal" data-closebg><div class="sm-form"><header><span></span><span>Switch account</span><button type="button" data-close>Done</button></header>
        <div class="sm-fbody"><input id="sm-sq" type="search" placeholder="Search accounts" value="${esc(st.sq)}" autocomplete="off" style="margin:0 0 8px">
        <div id="sm-swlist">${list.map(a => `<button class="sm-dirrow" style="width:100%" data-pick="${a.key}">${av(a, 40)}<span><b>${esc(a.handle)}</b><small>${esc(a.name)}${a.alt ? ", alt" : ""}</small></span>${actor()?.key === a.key ? `<span class="ct" style="color:var(--hot)">Current</span>` : ""}</button>`).join("") || `<p class="sm-none">No accounts match.</p>`}</div></div></div></div>`;
    }
    if (st.modal.kind === "post"){
      const d = st.draft, editing = !!d.id;
      if (!d.photo) return `<div class="sm-modal" data-closebg><div class="sm-form"><header><button type="button" data-close>Cancel</button><span>New post</span><span></span></header>
        <div class="sm-fbody"><label class="sm-drop big">${ICON.camera}<b>Add a screenshot</b><small>Step 1 of 2</small><input type="file" accept="image/*" id="sm-file"></label>${up}${err}</div></div></div>`;
      return `<div class="sm-modal" data-closebg><form class="sm-form wide" id="sm-post"><header><button type="button" data-close>Cancel</button><span>${editing ? "Edit post" : "New post"}</span><button class="go" type="submit">${editing ? "Save" : "Share"}</button></header>
        <div class="sm-compose"><div class="sm-prev"><img loading="lazy" decoding="async" src="${esc(d.photo)}" alt="Preview"><label>Change photo<input type="file" accept="image/*" id="sm-file"></label></div>
        <div class="sm-fbody">${up}
          <label>Posted by</label>${UI.simPicker("author", d.author ? [d.author] : [], acctOpts(), "Search accounts")}
          <label>Caption<textarea name="caption" placeholder="Write it like they would. Use @handles and #tags.">${esc(d.caption)}</textarea></label>
          <label>Tag people</label>${UI.simPicker("tags", d.tags, acctOpts(), "Tag accounts in the photo")}
          <label>Location<select name="lot_id"><option value="">None</option>${data.lots.map(l => `<option value="${l.id}" ${l.id===d.lot_id?"selected":""}>${esc(l.address)}</option>`).join("")}</select></label>
          <label>Date in the save</label>${UI.gameDate("date", d.date, cal())}
          <label>Likes</label><div class="sm-likesrow"><input type="number" name="likes" min="0" value="${esc(d.likes ?? 0)}" aria-label="Likes"><button type="button" class="sm-btn" data-suggest>${ICON.dice}Realistic</button></div>
          ${err}${editing ? `<button type="button" class="sm-del" data-delpost="${d.id}">Delete post</button>` : `<p class="sm-note">Step 2 of 2</p>`}
        </div></div></form></div>`;
    }
    if (st.modal.kind === "profile"){
      const m = st.modal, a = m.key ? acct(m.key) : null, s = sim(m.simId);
      const v = a || { handle:"", name: m.alt ? "" : clean(s.name), bio:"", followers:0, following:0 };
      return `<div class="sm-modal" data-closebg><form class="sm-form" id="sm-prof"><header><button type="button" data-close>Cancel</button><span>${a ? "Edit profile" : m.alt ? "New alt account" : "Create account"}</span><button class="go" type="submit">Done</button></header>
        <div class="sm-fbody">
          <div style="display:flex;align-items:center;gap:14px">${av({ key: m.key || s.id, handle: v.handle || s.name, avatar: st.draft.avatar }, 40)}<label style="margin:0;color:var(--hot);cursor:pointer;font-weight:700">Change profile photo<input type="file" accept="image/*" id="sm-avfile"></label>${st.draft.avatar ? `<button type="button" class="sm-del" style="padding:0" data-rmav>Remove</button>` : ""}</div>${up}
          <label>Handle<input type="text" name="handle" value="${esc(v.handle)}" placeholder="@handle" required autocapitalize="none" autocorrect="off" spellcheck="false"></label><p class="sm-note">Handles always start with @ and save in lowercase.</p>
          <label>Display name<input type="text" name="name" value="${esc(v.name)}"></label>
          <label>Bio<textarea name="bio">${esc(v.bio)}</textarea></label>
          <div class="row"><label>Followers<input type="number" name="followers" min="0" value="${esc(v.followers ?? 0)}"></label><label>Following<input type="number" name="following" min="0" value="${esc(v.following ?? 0)}"></label></div>
          ${err}
          ${a && !a.alt ? `<button type="button" class="sm-btn" style="margin-top:14px" data-newalt="${s.id}">+ Add an alt account for ${esc(clean(s.name).split(" ")[0])}</button>` : ""}
          ${a && a.alt ? `<button type="button" class="sm-del" data-delalt="${m.key}">Delete this alt account</button>` : ""}
        </div></form></div>`;
    }
    return "";
  }

  /* ---------- render ---------- */
  function draw(){
    const [v, a] = route;
    const view = v === "u" ? "profile" : v === "p" ? "post" : v === "explore" ? "explore" : v === "accounts" ? "accounts" : v === "tag" ? "tag" : "feed";
    let main;
    if (view === "profile") main = profileHTML(a);
    else if (view === "post") { const p = (data.posts || []).find(x => x.id === a); main = p ? `<div class="sm-feed">${postHTML(p, true)}</div>` : feedHTML(); }
    else if (view === "explore") main = exploreHTML();
    else if (view === "accounts") main = accountsHTML();
    else if (view === "tag") main = tagHTML(decodeURIComponent(a || ""));
    else main = feedHTML();
    root.innerHTML = `<div class="site-sm">${railHTML(view)}<main class="sm-main">${main}</main>${lightboxHTML()}${modalHTML()}</div>`;
  }

  async function savePost(id, patch){ const p = data.posts.find(x => x.id === id); await GFB.savePost({ ...p, ...patch }); draw(); }
  function readDraft(form){ const f = new FormData(form); return { ...st.draft, author: f.getAll("author")[0] || null, tags: f.getAll("tags"), caption: (f.get("caption") || "").trim(), lot_id: f.get("lot_id") || null, likes: Number(f.get("likes") || 0) }; }
  async function toggleLike(id, onlyLike){
    const me = actor(); if (!me) return;
    const p = data.posts.find(z => z.id === id), by = p.liked_by || [], has = by.includes(me.key);
    if (has && onlyLike) return;
    await savePost(id, { liked_by: has ? by.filter(k => k !== me.key) : [...by, me.key], likes: Math.max(0, Number(p.likes || 0) + (has ? -1 : 1)) });
  }
  async function saveProfile(form){
    const f = new FormData(form), m = st.modal, h = GFB.normHandle(f.get("handle"));
    if (!h) throw new Error("A handle is required.");
    if (accts().some(a => a.handle === h && a.key !== m.key)) throw new Error("That handle is taken.");
    const vals = { name:(f.get("name") || "").trim(), bio:(f.get("bio") || "").trim(), followers:Number(f.get("followers") || 0), following:Number(f.get("following") || 0), avatar: st.draft.avatar || null };
    const s = sim(m.simId);
    if (m.alt){
      const alts = [...(s.simsta_alts || [])], altId = m.key ? m.key.split("~")[1] : "a" + Date.now().toString(36);
      const i = alts.findIndex(x => x.id === altId), row = { id:altId, handle:h, ...vals };
      if (i >= 0) alts[i] = row; else alts.push(row);
      await GFB.saveSim(s.id, { simsta_alts: alts });
      return s.id + "~" + altId;
    }
    await GFB.saveSim(s.id, { simsta:h, simsta_name:vals.name, simsta_bio:vals.bio, simsta_followers:vals.followers, simsta_following:vals.following, simsta_avatar:vals.avatar });
    return s.id;
  }

  /* Message button: opens the thread between the Sim you're acting as and this profile's Sim, or starts one tagged Simsta.
     On your own (acting as) profile it opens every thread that Sim is in. */
  async function messageSim(key, btn){
    const a = acct(key), me = actor(); if (!a) return;
    if (!me || me.sim.id === a.sim.id) { location.hash = "#/messages/sim/" + a.sim.id; return; }
    if (!GFB.messages || !GFB.messages.ready()) { btn.textContent = "Messages needs the cloud"; return; }
    btn.disabled = true; btn.textContent = "Opening...";
    try { const r = await GFB.messages.ensure([me.sim.id, a.sim.id], "simsta", { anyOrigin:true }); location.hash = "#/messages/t/" + r.thread.id + "/" + me.sim.id; }
    catch (e) { btn.disabled = false; btn.textContent = "Couldn't open. Try again"; }
  }

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-sm");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target, x = k => t.closest(`[data-${k}]`)?.dataset[k], has = k => !!t.closest(`[data-${k}]`);
      if (t.matches("[data-closebg]") || has("close")) { st.modal = null; st.err = null; draw(); return; }
      if (t.matches("[data-lbclose]") || (has("lbclose") && t.closest(".sm-lbx"))) { st.lb = null; draw(); return; }
      if (has("lbgo")) { st.lb.id = x("lbgo"); draw(); return; }
      if (has("switch")) { st.sq = ""; st.modal = { kind:"switch" }; draw(); root.querySelector("#sm-sq")?.focus(); return; }
      if (has("pick")) { setActor(x("pick")); st.modal = null; draw(); return; }
      if (has("actas")) { setActor(x("actas")); draw(); return; }
      if (has("msg")) { await messageSim(x("msg"), t.closest("[data-msg]")); return; }
      if (has("reg")) { location.hash = "#/registry/" + x("reg"); return; }
      if (has("delpost")) { if (UI.confirmTap(t.closest("[data-delpost]"))) { await GFB.deletePost(x("delpost")); st.modal = null; st.lb = null; if (route[0] === "p") go(""); else draw(); } return; }
      if (has("delalt")) { if (UI.confirmTap(t.closest("[data-delalt]"))) { const [sid, aid] = x("delalt").split("~"); const s = sim(sid); await GFB.saveSim(sid, { simsta_alts:(s.simsta_alts || []).filter(a => a.id !== aid) }); st.modal = null; go("u/" + sid); } return; }
      if (has("rmav")) { st.draft.avatar = null; draw(); return; }
      if (has("suggest")) { const form = root.querySelector("#sm-post"); const d = readDraft(form); if (!d.author) { st.draft = d; st.err = "Pick who's posting first."; draw(); return; } st.draft = { ...d, likes: suggestLikes(d.author) }; st.err = null; draw(); return; }
      if (has("new")) { st.draft = { author: actor()?.key || null, tags:[], caption:"", likes:0, photo:null }; st.modal = { kind:"post" }; st.err = null; draw(); return; }
      if (has("edit")) { st.draft = JSON.parse(JSON.stringify(data.posts.find(p => p.id === x("edit")))); st.lb = null; st.modal = { kind:"post" }; st.err = null; draw(); return; }
      if (has("editprof")) { const k = x("editprof"), a = acct(k); st.draft = { avatar: a?.avatar || null }; st.modal = { kind:"profile", key: a ? k : null, simId: a ? a.sim.id : k, alt: !!a?.alt }; st.err = null; draw(); return; }
      if (has("newalt")) { st.draft = { avatar:null }; st.modal = { kind:"profile", key:null, simId:x("newalt"), alt:true }; st.err = null; draw(); return; }
      if (has("like")) { await toggleLike(x("like")); return; }
      if (has("focus")) { root.querySelector(`[data-cpost="${x("focus")}"] input`)?.focus(); return; }
      if (has("all")) { st.open[x("all")] = true; draw(); return; }
      if (has("ptab")) { st.tab = x("ptab"); draw(); return; }
      if (has("tag")) { st.lb = null; go("tag/" + encodeURIComponent(x("tag"))); return; }
      if (has("post")) { const ctx = x("ctx"); st.lb = { id:x("post"), list: ctx ? ctx.split(",") : [x("post")] }; draw(); return; }
      if (has("u")) { st.tab = "posts"; st.q = ""; st.lb = null; go("u/" + x("u")); return; }
      if (t.closest("[data-go]")) { go(x("go")); return; }
    });
    document.addEventListener("dblclick", e => { if (!mine(e.target)) return; const id = e.target.closest("[data-dbl]")?.dataset.dbl; if (id) toggleLike(id, true); });
    document.addEventListener("input", e => {
      if (!mine(e.target)) return;
      if (e.target.id === "sm-q") { st.q = e.target.value; root.querySelector("#sm-raillist").innerHTML = railList(); }
      if (e.target.id === "sm-dq") { st.dq = e.target.value; root.querySelector("#sm-dir").innerHTML = dirRows(); }
      if (e.target.id === "sm-sq") { st.sq = e.target.value; const pos = e.target.selectionStart; draw(); const i = root.querySelector("#sm-sq"); i.focus(); i.setSelectionRange(pos, pos); }
    });
    document.addEventListener("change", async e => {
      if (!mine(e.target)) return;
      if (e.target.id === "sm-file" && e.target.files[0]) {
        const form = root.querySelector("#sm-post"); if (form) st.draft = readDraft(form);
        st.uploading = true; st.err = null; draw();
        try { st.draft.photo = (await GFB.uploadImage(e.target.files[0], 2048)).url; if (!st.draft.id && !st.draft.likes && st.draft.author) st.draft.likes = suggestLikes(st.draft.author); } catch (err) { st.err = err.message; }
        st.uploading = false; draw();
      }
      if (e.target.id === "sm-avfile" && e.target.files[0]) { st.uploading = true; draw(); try { st.draft.avatar = (await GFB.uploadImage(e.target.files[0], 640)).url; } catch (err) { st.err = err.message; } st.uploading = false; draw(); }
    });
    document.addEventListener("keydown", e => {
      if (!root?.querySelector(".site-sm")) return;
      if (e.key === "Escape" && (st.modal || st.lb)) { e.stopImmediatePropagation(); if (st.modal) st.modal = null; else st.lb = null; draw(); }
      if (st.lb && !st.modal && !e.target.closest?.("input,textarea") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { const i = st.lb.list.indexOf(st.lb.id), n = st.lb.list[i + (e.key === "ArrowRight" ? 1 : -1)]; if (n) { st.lb.id = n; draw(); } }
    }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        if (e.target.matches("[data-cpost]")) {
          const text = (f.get("text") || "").trim(), me = actor(); if (!text || !me) return;
          const p = data.posts.find(z => z.id === e.target.dataset.cpost); st.open[p.id] = true;
          await savePost(p.id, { comments: [...(p.comments || []), { author: me.key, text }] }); root.querySelector(`[data-cpost="${p.id}"] input`)?.focus(); return;
        }
        if (e.target.id === "sm-post") {
          const d = readDraft(e.target);
          if (!d.author) throw new Error("Pick who's posting.");
          d.date = UI.readGameDate(new FormData(e.target), "date", cal());
          if (!d.id) { d.created = new Date().toISOString(); d.comments = []; d.liked_by = []; }
          await GFB.savePost(d); st.modal = null; st.err = null; draw(); return;
        }
        if (e.target.id === "sm-prof") { const key = await saveProfile(e.target); st.modal = null; st.err = null; if (route[0] === "u" && route[1] !== key) go("u/" + key); else draw(); return; }
      } catch (err) { st.err = err.message; if (e.target.id === "sm-post") st.draft = readDraft(e.target); draw(); }
    });
  }

  function render(el, d, parts){ root = el; data = d; data.posts = data.posts || []; route = parts || []; if (route[0] !== "u") st.tab = "posts"; st.lb = null; bind(); draw(); }
  function address(parts){ const [v, a] = parts || []; if (v === "u") { const ac = data && acct(a); return "/" + (ac ? ac.handle.slice(1) : a); } if (v === "p") return "/p/" + a; if (v === "explore") return "/explore"; if (v === "accounts") return "/directory"; if (v === "tag") return "/explore/tags/" + a; return "/"; }
  return { render, address };
})();
