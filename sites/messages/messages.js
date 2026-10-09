/* Messages: every Sim conversation in the save, told through their phones (Slide connections, Simsta DMs, in-game texts, group chats).
   Nobody types here. Claude writes threads into Supabase from what happened in the game; this app shows them and keeps them organized.
   Data: GFB.messages (Supabase tables message_threads and messages, never the edits bundle). See MESSAGES-SCHEMA.md.
   Bubbles follow iMessage: the phone you're reading on is on the right with no name or picture; in a group chat other Sims get their
   name above the first bubble of a run and their picture beside the last one. Names and pictures open the Sim's Simsta profile. */
const Messages = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => stripNick(n).split(" ")[0];
  const initials = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0, 2).join("");
  const low = s => String(s || "").trim().toLowerCase();
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

  const ORIGIN = { slide:"Met on Slide", simsta:"Simsta", in_game:"In game", group:"Group chat" };
  const FILTERS = ["all", "slide", "simsta", "in_game", "group"];

  let data = null, root = null;
  const st = { mode:"all", sim:null, picking:false, q:"", origin:"all", open:null, phone:{}, err:null, cloudErr:false, loading:false, stick:true, synced:false };

  /* ---------- Sims ---------- */
  const simById = id => (data.sims || []).find(s => s.id === id);
  const nameOf = id => { const s = simById(id); return s ? stripNick(s.name) : id; };
  const firstOf = id => { const s = simById(id); return s ? first(s.name) : id; };
  const pic = s => s && (s.simsta_avatar || s.portrait) || null;
  function av(id, cls = "", link = false) {
    const s = simById(id), p = pic(s), label = s ? s.name : id;
    const inner = p ? `<img src="${esc(p)}" alt="" loading="lazy" decoding="async">` : esc(initials(label) || "?");
    const open = `data-ms="sim:${esc(id)}" aria-label="${esc(stripNick(label))} on Simsta"`;
    if (link === "hit") return `<button type="button" class="ms-hit" ${open}><span class="ms-av ${cls}" style="--h:${hue(id)}">${inner}</span></button>`;
    return link ? `<button type="button" class="ms-av ${cls}" style="--h:${hue(id)}" ${open}>${inner}</button>`
                : `<span class="ms-av ${cls}" style="--h:${hue(id)}" aria-hidden="true">${inner}</span>`;
  }
  /* up to three Sims in the cluster so nobody is hidden in a group */
  const stack = ids => ids.length === 1 ? av(ids[0]) : `<span class="ms-stack n${Math.min(ids.length, 3)}" aria-hidden="true">${ids.slice(0, 3).map(i => av(i)).join("")}</span>`;
  const joinNames = list => list.length <= 1 ? (list[0] || "") : list.length === 2 ? `${list[0]} & ${list[1]}` : `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;

  /* ---------- dates (in-game) ---------- */
  const cal = () => data.calendar;
  const ord = d => d && typeof d === "object" ? UI.gameOrd(d, cal()) : 0;
  const longDate = d => UI.gameLabel(d);
  function shortDate(d, created) {
    if (d && typeof d === "object") {
      const n = ord(UI.gameToday(cal())) - ord(d);
      if (n === 0) return "Today"; if (n === 1) return "Yesterday";
      return `${d.season}, day ${d.day}` + (d.year !== cal().year ? `, Year ${d.year}` : "");
    }
    return created ? new Date(created).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "";
  }

  /* ---------- threads ---------- */
  const M = () => GFB.messages;
  const threads = () => M().threads();
  const msgsOf = t => M().list(t.id);
  const lastOf = t => { const l = msgsOf(t); return l[l.length - 1] || null; };
  const isGroup = t => t.sim_ids.length > 2;
  const others = (t, me) => t.sim_ids.filter(id => id !== me);
  const readMap = () => ((data.settings || {}).messages_read) || {};
  const isNew = t => { const r = readMap()[t.id]; return !r || String(t.last_message_at) > r; };
  function titleOf(t, me) {
    if (t.title) return t.title;
    const ids = me && t.sim_ids.includes(me) ? others(t, me) : t.sim_ids;
    return joinNames(ids.map(firstOf));
  }
  function phoneOf(t) {
    if (st.phone[t.id] && t.sim_ids.includes(st.phone[t.id])) return st.phone[t.id];
    if (st.mode === "sim" && st.sim && t.sim_ids.includes(st.sim)) return st.sim;
    return t.sim_ids[0];
  }
  /* search: Sim names (full names), the group title, and message text */
  function hit(t, q) {
    if (!q) return { ok:true };
    if (t.sim_ids.some(id => low(nameOf(id)).includes(q)) || low(t.title).includes(q)) return { ok:true };
    const m = msgsOf(t).slice().reverse().find(x => low(x.body).includes(q));
    return m ? { ok:true, msg:m } : { ok:false };
  }
  function visible() {
    const q = low(st.q);
    return threads().filter(t => (st.origin === "all" || t.origin === st.origin) && (st.mode !== "sim" || !st.sim || t.sim_ids.includes(st.sim)))
      .map(t => ({ t, h:hit(t, q) })).filter(x => x.h.ok);
  }

  /* ---------- Slide backfill: matches marked texted while the cloud was out get their thread now ---------- */
  async function syncSlide() {
    const S = data.slide; if (!S || !Array.isArray(S.matches)) return;
    let changed = false;
    for (const m of S.matches) {
      if (!m.texted || m.thread || !simById(m.a) || !simById(m.b)) continue;
      const d = m.texted_on || m.date;
      const r = await M().ensure([m.a, m.b], "slide", { system:"Connected via text · " + longDate(d), game_date:d });
      m.thread = r.thread.id; changed = true;
    }
    if (changed) { await GFB.saveSlide(S); data = await GFB.getAll(); }
  }

  async function load() {
    if (!M().ready()) { st.err = "Messages needs the cloud connection. Sign in to SimDesk's cloud, then open Messages again."; st.cloudErr = true; draw(); return; }
    st.loading = !M().isLoaded(); if (st.loading) draw();
    try { await M().refresh(); if (!st.synced) { st.synced = true; await syncSlide(); } st.err = null; st.cloudErr = false; }
    catch (e) { st.err = e.message; st.cloudErr = false; }
    st.loading = false;
    if (st.open && !threads().some(t => t.id === st.open)) st.open = null;
    draw();
  }

  /* ---------- pieces ---------- */
  const ICON = {
    search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    back:'<path d="M15 5l-7 7 7 7"/>',
    down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
    link:'<path d="M9 7h8v8M17 7L7 17"/>',
    spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'
  };
  const ic = (k, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  let markN = 0;
  const MARK = () => { const g = "msMk" + (++markN); return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00796D"/><stop offset="1" stop-color="#1A63C2"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#${g})"/><path d="M14 18h24a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5H26l-7 6v-6h-5a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5z" fill="#fff" fill-opacity=".55"/><path d="M27 27h23a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-4v6l-7-6H27a5 5 0 0 1-5-5V32a5 5 0 0 1 5-5z" fill="#fff"/></svg>`; };
  const tag = o => `<span class="ms-tag ${o}">${esc(ORIGIN[o] || o)}</span>`;

  function preview(t, me, h) {
    const m = (h && h.msg) || lastOf(t);
    if (!m) return "No messages yet";
    if (m.kind === "system") return m.body;
    const who = me && m.sender_sim_id === me ? "You" : firstOf(m.sender_sim_id);
    return (isGroup(t) || !me || who === "You" ? who + ": " : "") + m.body;
  }
  function row({ t, h }) {
    const me = st.mode === "sim" ? st.sim : null, m = lastOf(t), fresh = isNew(t), dated = msgsOf(t).slice().reverse().find(x => x.game_date);
    const pics = me && t.sim_ids.includes(me) ? others(t, me) : t.sim_ids;
    return `<button type="button" class="ms-row ${t.id === st.open ? "on" : ""} ${fresh ? "new" : ""}" data-ms="open:${t.id}" aria-current="${t.id === st.open}">
      <span class="ms-dot" aria-hidden="true"></span>${stack(pics)}
      <span class="tx"><span class="top"><b class="nm">${esc(titleOf(t, me))}</b>${tag(t.origin)}<span class="dt">${esc(m ? shortDate(dated && dated.game_date, m.created_at) : "")}</span></span>
      <span class="pv">${fresh ? '<span class="ms-sr">New. </span>' : ""}${esc(preview(t, me, h))}</span></span></button>`;
  }
  /* By Sim: Sims who have threads, busiest first */
  function simList() {
    const count = new Map();
    threads().forEach(t => t.sim_ids.forEach(id => count.set(id, (count.get(id) || 0) + 1)));
    const q = low(st.q);
    const list = [...count.entries()].filter(([id]) => simById(id) && (!q || low(nameOf(id)).includes(q)))
      .sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0])));
    if (!list.length) return `<p class="ms-none">${threads().length ? "No Sims match." : "No threads yet."}</p>`;
    return list.map(([id, n]) => { const fresh = threads().filter(t => t.sim_ids.includes(id) && isNew(t)).length;
      return `<button type="button" class="ms-row simrow" data-ms="pick:${esc(id)}">${av(id)}<span class="tx"><span class="top"><b class="nm">${esc(nameOf(id))}</b></span><span class="pv">${n} thread${n === 1 ? "" : "s"}${fresh ? ` · ${fresh} new` : ""}</span></span></button>`; }).join("");
  }
  function listHTML() {
    const picking = st.mode === "sim" && (st.picking || !st.sim);
    const rows = picking ? simList() : (() => { const v = visible(); return v.length ? v.map(row).join("") : `<p class="ms-none">${threads().length ? "Nothing matches." : st.loading ? "Loading..." : "No threads yet. Claude adds them from what happens in your game."}</p>`; })();
    const newN = threads().filter(isNew).length;
    const chipItems = FILTERS.map(f => ({ v:f, t:f === "all" ? "All" : ORIGIN[f] }));
    const banner = st.err ? `<div class="ms-banner" role="alert">${esc(st.err)}${st.cloudErr ? '<br><button type="button" data-ms="settings">Open settings</button>' : ""}</div>` : "";
    return `<aside class="ms-list">
      <div class="ms-head"><div class="ms-logo">${MARK()}Messages</div>${newN ? `<span class="ms-newn">${newN} new</span>` : ""}</div>
      <label class="ms-search">${ic("search")}<input type="search" data-ms-q value="${esc(st.q)}" placeholder="${picking ? "Find a Sim" : "Search Sims or messages"}" aria-label="${picking ? "Find a Sim" : "Search Sims or messages"}" autocomplete="off"></label>
      <div class="ms-listseg ui-seg" role="tablist"><button type="button" role="tab" class="${st.mode === "all" ? "on" : ""}" aria-selected="${st.mode === "all"}" data-ms="mode:all">All threads</button><button type="button" role="tab" class="${st.mode === "sim" ? "on" : ""}" aria-selected="${st.mode === "sim"}" data-ms="mode:sim">By Sim</button></div>
      ${picking ? "" : `<div class="ms-chips">${UI.chips(chipItems, st.origin)}</div>`}
      ${banner}
      ${st.mode === "sim" && st.sim && !st.picking ? `<div class="ms-simhead">${av(st.sim, "lg", true)}<span><b>${esc(nameOf(st.sim))}</b><small>${(n => `${n} thread${n === 1 ? "" : "s"}`)(threads().filter(t => t.sim_ids.includes(st.sim)).length)} · reading on their phone</small></span><button type="button" class="ms-link" data-ms="change">Change</button></div>` : ""}
      <div class="ms-rows">${rows}</div></aside>`;
  }

  function bodyHTML(t, me) {
    const list = msgsOf(t);
    if (!list.length) return `<div class="ms-empty"><b>No messages yet</b><p>Claude adds these from what happens in your game.</p></div>`;
    const group = isGroup(t);
    let out = "", lastDay = null;
    list.forEach((m, i) => {
      const dl = m.game_date ? longDate(m.game_date) : null;
      if (dl && dl !== lastDay) { out += `<div class="ms-day">${esc(dl)}</div>`; lastDay = dl; }
      if (m.kind === "system") { out += `<div class="ms-sys">${ic("spark", 2)}<span>${esc(m.body)}</span></div>`; return; }
      const prev = list[i - 1], next = list[i + 1];
      const nextDay = next && next.game_date ? longDate(next.game_date) : null;
      const startRun = !prev || prev.kind === "system" || prev.sender_sim_id !== m.sender_sim_id || (dl && dl !== (prev.game_date ? longDate(prev.game_date) : null));
      const endRun = !next || next.kind === "system" || next.sender_sim_id !== m.sender_sim_id || (nextDay && nextDay !== dl);
      const mine = m.sender_sim_id === me;
      const cls = ["ms-msg", mine ? "me" : "them", startRun ? "start" : "", endRun ? "end" : ""].join(" ");
      const name = group && !mine && startRun ? `<button type="button" class="ms-from" data-ms="sim:${esc(m.sender_sim_id)}">${esc(firstOf(m.sender_sim_id))}</button>` : "";
      const face = group && !mine ? (endRun ? av(m.sender_sim_id, "sm", "hit") : `<span class="ms-av sm ghost" aria-hidden="true"></span>`) : "";
      out += `<div class="${cls}">${face}<div class="col">${name}<div class="ms-b"><span class="ms-sr">${esc(firstOf(m.sender_sim_id))}: </span>${esc(m.body)}</div></div></div>`;
    });
    return out;
  }
  function convHTML() {
    const t = st.open && threads().find(x => x.id === st.open);
    if (!t) return `<section class="ms-conv"><div class="ms-blank">${MARK()}<b>Pick a conversation</b><p>${threads().length ? "Newest activity is at the top of the list." : "Claude adds threads from what happens in your game."}</p></div></section>`;
    const me = phoneOf(t), them = others(t, me), group = isGroup(t);
    /* names in the header are plain text (too small to tap); the picture and the names beside bubbles open profiles */
    const title = esc(group ? titleOf(t, null) : nameOf(them[0]));
    const sub = group ? esc(t.sim_ids.map(firstOf).join(", ")) : "";
    const hint = !(data.settings || {}).messages_hint ? `<div class="ms-hint"><span>Bubbles on the right are ${esc(firstOf(me))}'s. Tap <b>Reading as</b> to switch phones.</span><button type="button" data-ms="hint">Got it</button></div>` : "";
    return `<section class="ms-conv">
      <div class="ms-chead"><button type="button" class="ms-back" data-ms="back" aria-label="Back to threads">${ic("back", 2.6)}</button>
        ${group ? stack(t.sim_ids) : av(them[0], "", true)}
        <div class="who"><div class="ttl">${title}</div><div class="sub">${tag(t.origin)}${sub ? `<span class="ms-names">${sub}</span>` : ""}</div></div>
        <button type="button" class="ms-pill" data-ms="phone" aria-haspopup="dialog">${av(me, "xs")}<span class="lbl">Reading as </span><b>${esc(firstOf(me))}</b><span aria-hidden="true">▾</span></button></div>
      ${hint}
      <div class="ms-body" id="ms-body" role="log" aria-label="Conversation">${bodyHTML(t, me)}</div>
      <button type="button" class="ms-jump" data-ms="jump" hidden>${ic("down", 2.4)}Latest</button>
    </section>`;
  }

  function draw() {
    if (!root) return;
    const prevBody = root.querySelector("#ms-body"), atBottom = !prevBody || prevBody.scrollHeight - prevBody.scrollTop - prevBody.clientHeight < 60;
    const keepTop = prevBody && !atBottom ? prevBody.scrollTop : null;
    const prevList = root.querySelector(".ms-rows"), listTop = prevList ? prevList.scrollTop : 0;
    const prevChips = root.querySelector(".ms-chips .ui-chips"), chipsX = prevChips ? prevChips.scrollLeft : 0;
    const q = root.querySelector("[data-ms-q]"), hadFocus = q && document.activeElement === q, pos = hadFocus ? q.selectionStart : 0;
    root.innerHTML = `<div class="site-ms ${st.open ? "has-open" : ""}">${listHTML()}${convHTML()}</div>`;
    const list = root.querySelector(".ms-rows"); if (list) list.scrollTop = listTop;
    const chipRow = root.querySelector(".ms-chips .ui-chips"); if (chipRow) chipRow.scrollLeft = chipsX;
    const body = root.querySelector("#ms-body");
    if (body) { if (st.stick || keepTop === null) body.scrollTop = body.scrollHeight; else body.scrollTop = keepTop; st.stick = false; jumpState(); }
    if (hadFocus) { const n = root.querySelector("[data-ms-q]"); n.focus(); n.setSelectionRange(pos, pos); }
  }
  function jumpState() {
    const body = root && root.querySelector("#ms-body"), j = root && root.querySelector(".ms-jump"); if (!body || !j) return;
    j.hidden = body.scrollHeight - body.scrollTop - body.clientHeight < 300;
  }
  function markRead(t) {
    const r = { ...readMap() };
    if (r[t.id] && r[t.id] >= String(t.last_message_at)) return;
    r[t.id] = String(t.last_message_at);
    GFB.saveSetting("messages_read", r).catch(() => {});
  }

  const syncAddress = () => { if (typeof setAddress === "function" && location.hash.split("/")[1] === "messages") setAddress("messages.app", address()); };
  async function act(cmd) {
    const i = cmd.indexOf(":"), k = i < 0 ? cmd : cmd.slice(0, i), v = i < 0 ? "" : cmd.slice(i + 1);
    if (k === "open") { const t = threads().find(x => x.id === v); if (!t) return; st.open = v; st.stick = true; markRead(t); draw(); return syncAddress(); }
    if (k === "back") { st.open = null; draw(); return syncAddress(); }
    if (k === "mode") { st.mode = v; st.q = ""; st.picking = v === "sim" && !st.sim; return draw(); }
    if (k === "pick") { st.sim = v; st.picking = false; st.q = ""; return draw(); }
    if (k === "change") { st.picking = true; st.q = ""; return draw(); }
    if (k === "origin") { st.origin = v; return draw(); }
    if (k === "phone") return pickPhone();
    if (k === "settings") { location.hash = "#/settings"; return; }
    if (k === "hint") { await GFB.saveSetting("messages_hint", true); data = await GFB.getAll(); return draw(); }
    if (k === "jump") { const b = root.querySelector("#ms-body"); if (b) b.scrollTo({ top:b.scrollHeight, behavior:"smooth" }); return; }
    if (k === "sim") { location.hash = "#/simsta/u/" + encodeURIComponent(v); return; }
  }

  /* Whose phone: the shared bottom sheet (centered card on iPad). Tapping a Sim switches the phone you read on. */
  function pickPhone() {
    const t = st.open && threads().find(x => x.id === st.open); if (!t) return;
    const me = phoneOf(t);
    const sh = UI.sheet({ title:"Read on whose phone", left:"Cancel", theme:{ "--ui-sheet-bg":"#fff", "--ui-sheet-fg":"#12161C", "--ui-sheet-accent":"#1A63C2" },
      body:`<div class="ms-picks">${t.sim_ids.map(id => `<button type="button" class="ms-pick ${id === me ? "on" : ""}" data-as="${esc(id)}" aria-pressed="${id === me}">${av(id)}<b>${esc(nameOf(id))}</b></button>`).join("")}</div>` });
    sh.body.addEventListener("click", e => {
      const b = e.target.closest("[data-as]"); if (!b) return;
      st.phone[t.id] = b.dataset.as; st.stick = true; sh.close("pick"); draw();
    });
  }

  /* ---------- events (bound once) ---------- */
  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-ms");
    document.addEventListener("click", e => {
      if (!mine(e.target)) return;
      const chip = e.target.closest(".ms-chips .ui-chip[data-v]"); if (chip) { st.origin = chip.dataset.v; draw(); return; }
      const b = e.target.closest("[data-ms]"); if (b) act(b.dataset.ms);
    });
    document.addEventListener("input", e => { if (mine(e.target) && e.target.matches("[data-ms-q]")) { st.q = e.target.value; draw(); } });
    document.addEventListener("scroll", e => { if (e.target && e.target.id === "ms-body") jumpState(); }, true);
    /* coming back to the app (switching tabs or apps on the iPad) picks up anything Claude added */
    const back = () => { if (document.visibilityState === "visible" && root && root.querySelector(".site-ms")) load(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
  }

  /* parts: [] | ["t", threadId, phoneSimId?] | ["sim", simId] */
  async function render(el, d, parts = []) {
    root = el; data = d; bind();
    if (parts[0] === "t" && parts[1]) { st.open = parts[1]; st.stick = true; if (parts[2]) st.phone[parts[1]] = parts[2]; }
    if (parts[0] === "sim" && parts[1]) { st.mode = "sim"; st.sim = parts[1]; st.picking = false; st.open = null; st.q = ""; }
    draw();
    await load();
    const t = st.open && threads().find(x => x.id === st.open); if (t) markRead(t);
  }
  const address = () => { const t = st.open && data && threads().find(x => x.id === st.open); return t ? "/" + low(titleOf(t, null)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "/"; };
  return { render, address };
})();
