/* Notes: GFB planning notebook. Folders, pins, tags, checklists, @mentions of Sims / clubs / companies / lots,
   storyline notes with status + next beat, trash, quick capture from the menu bar. Reads and saves through GFB. */
const Notes = (() => {
  const st = { q:"", editing:null, ctx:[], mention:null, quickOpen:false };
  let data = null, root = null, route = [], lastKey = null, saveT = null;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const clean = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const FOLDERS = () => ((data.settings || {}).note_folders) || ["Inbox", "Households", "Lots", "Ideas"];
  const STATUSES = ["Simmering", "Active", "Boiling over", "Resolved"];
  const live = () => (data.notes || []).filter(n => !n.trashed);
  const byId = id => (data.notes || []).find(n => n.id === id);
  const go = h => { location.hash = "#/notes" + (h ? "/" + h : ""); };
  const day = t => { if (!t) return ""; const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" }) : d.toLocaleDateString("en-US", { month:"short", day:"numeric" }); };
  const titleOf = n => n.title || (String(n.body || "").split("\n").find(l => l.trim()) || "New note").replace(/^#+\s*|^[-*]\s+(\[[ x]\]\s*)?/g, "").slice(0, 80);
  const plain = t => String(t || "").replace(/^#+\s*/gm, "").replace(/\*\*|\*|_/g, "").replace(/^[-*]\s+(\[[ x]\]\s*)?/gm, "").replace(/\s+/g, " ").trim();

  const ICON = {
    mark:'<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#F2B705"/><rect x="12" y="10" width="40" height="46" rx="5" fill="#FFFDF6"/><path d="M19 23h26M19 31h26M19 39h18" stroke="#C9C1AE" stroke-width="3" stroke-linecap="round"/></svg>',
    all:'<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 12h8M8 15h5"/>', folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    story:'<path d="M4 18c3-8 6-8 8-3s5 5 8-3"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="9" r="1.5"/>', tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', pin:'<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>', sticky:'<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>', plus:'<path d="M12 5v14M5 12h14"/>', back:'<path d="M15 5l-7 7 7 7"/>'
  };
  const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  /* ---------- mentions: @ + a Sim, club, company, or lot name ---------- */
  function entities() {
    const e = [];
    data.sims.forEach(s => e.push({ name:clean(s.name), kind:"Sim", href:`#/registry/${s.id}`, id:s.id, sub:s.career || "" }));
    (data.organizations || []).forEach(o => e.push({ name:o.name, kind:o.type === "Club" ? "Club" : "Company", href:o.type === "Club" ? `#/cliq/club/${o.id}` : `#/huddl/org/${o.id}`, id:o.id, sub:o.category || o.vibe || "" }));
    data.lots.filter(l => !l.parent_id).forEach(l => { e.push({ name:l.address, kind:"Lot", href:`#/lotline/${l.id}`, id:l.id, sub:l.district || "" }); if (l.gallery_name && l.gallery_name !== l.address) e.push({ name:l.gallery_name, kind:"Lot", href:`#/lotline/${l.id}`, id:l.id, sub:l.address }); });
    return e.filter(x => x.name).sort((a, b) => b.name.length - a.name.length);
  }
  function linkMentions(html, ents) {
    let out = "", i = 0;
    while (i < html.length) {
      const at = html.indexOf("@", i); if (at < 0) { out += html.slice(i); break; }
      out += html.slice(i, at);
      const rest = html.slice(at + 1), hit = ents.find(e => { const n = esc(e.name); return rest.slice(0, n.length).toLowerCase() === n.toLowerCase() && !/[A-Za-z0-9]/.test(rest.charAt(n.length)); });
      if (hit) { const n = esc(hit.name); out += `<a class="nt-men ${hit.kind.toLowerCase()}" href="${hit.href}">@${rest.slice(0, n.length)}</a>`; i = at + 1 + n.length; }
      else { out += "@"; i = at + 1; }
    }
    return out;
  }
  const simsMentioned = (n, ents) => { const t = (n.title || "") + "\n" + (n.body || ""); return ents.filter(e => e.kind === "Sim" && new RegExp("@" + e.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9])", "i").test(t)).map(e => e.id); };

  /* ---------- formatting (same as case notes) + checklists ---------- */
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  function render(body, ents) {
    const out = []; let list = [], para = [], ln = 0;
    const fp = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    const fl = () => { if (list.length) out.push(`<ul class="${list.some(x => x.check) ? "nt-checks" : ""}">${list.map(x => x.check ? `<li class="nt-ck ${x.done ? "done" : ""}"><button type="button" class="nt-box" data-ck="${x.ln}" aria-label="${x.done ? "Mark not done" : "Mark done"}" aria-pressed="${x.done}"></button><span>${inline(x.t)}</span></li>` : `<li>${inline(x.t)}</li>`).join("")}</ul>`); list = []; };
    esc(body).split("\n").forEach((line, idx) => {
      const h = line.match(/^\s*#{1,3}\s+(.*)$/), c = line.match(/^\s*[-*]\s+\[( |x|X)\]\s*(.*)$/), b = line.match(/^\s*[-\u2022*]\s+(.*)$/);
      if (h) { fp(); fl(); out.push(`<h3>${inline(h[1])}</h3>`); }
      else if (c) { fp(); list.push({ check:true, done:c[1].toLowerCase() === "x", t:c[2], ln:idx }); }
      else if (b) { fp(); list.push({ t:b[1] }); }
      else if (line.trim()) { fl(); para.push(line); }
      else { fp(); fl(); }
    });
    fp(); fl();
    return linkMentions(out.join(""), ents) || `<p class="nt-ph">Tap to start writing.</p>`;
  }
  function applyFmt(kind, ta) {
    const v = ta.value, a = ta.selectionStart, z = ta.selectionEnd, sel = v.slice(a, z);
    if (kind === "b" || kind === "i") { const m = kind === "b" ? "**" : "*", inner = sel || (kind === "b" ? "bold text" : "italic text"); ta.value = v.slice(0, a) + m + inner + m + v.slice(z); ta.setSelectionRange(a + m.length, a + m.length + inner.length); }
    else if (kind === "at") { ta.value = v.slice(0, a) + "@" + v.slice(z); ta.setSelectionRange(a + 1, a + 1); }
    else {
      const ls = v.lastIndexOf("\n", a - 1) + 1, nl = v.indexOf("\n", z), le = nl === -1 ? v.length : nl;
      const pre = kind === "h" ? "## " : kind === "ck" ? "- [ ] " : "- ", lines = v.slice(ls, le).split("\n");
      const strip = l => l.replace(/^#{1,3}\s*/, "").replace(/^[-\u2022*]\s+(\[[ xX]\]\s*)?/, "");
      const on = lines.every(l => l.startsWith(pre)), next = lines.map(l => on ? l.slice(pre.length) : pre + strip(l)).join("\n");
      ta.value = v.slice(0, ls) + next + v.slice(le); ta.setSelectionRange(ls, ls + next.length);
    }
    ta.focus(); ta.dispatchEvent(new Event("input", { bubbles:true }));
  }

  /* ---------- which notes a view shows ---------- */
  function viewOf(r) {
    const [v, a] = r;
    if (v === "f") return { key:"f/" + a, title:a, list:live().filter(n => (n.folder || "Inbox") === a), folder:a };
    if (v === "tag") return { key:"tag/" + a, title:"#" + a, list:live().filter(n => (n.tags || []).includes(a)) };
    if (v === "stories") return { key:"stories", title:"Storylines", list:live().filter(n => n.story), stories:true };
    if (v === "trash") return { key:"trash", title:"Recently deleted", list:(data.notes || []).filter(n => n.trashed), trash:true };
    return { key:"", title:"All notes", list:live() };
  }
  const sortNotes = l => [...l].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));

  /* ---------- panes ---------- */
  function side(cur) {
    const tags = {}; live().forEach(n => (n.tags || []).forEach(t => tags[t] = (tags[t] || 0) + 1));
    const item = (key, label, icon, count) => `<a class="nt-si" href="#/notes${key ? "/" + key : ""}" ${cur === key ? 'aria-current="page"' : ""}>${ico(icon)}<span>${esc(label)}</span>${count ? `<small>${count}</small>` : ""}</a>`;
    return `<aside class="nt-side"><div class="nt-brand">${ICON.mark}<b>Notes</b></div>
      ${item("", "All notes", "all", live().length)}${item("stories", "Storylines", "story", live().filter(n => n.story).length)}
      <h4>Folders</h4>${FOLDERS().map(f => item("f/" + f, f, "folder", live().filter(n => (n.folder || "Inbox") === f).length)).join("")}
      <button class="nt-addf" data-nt="addfolder">${ico("plus")} New folder</button>
      ${Object.keys(tags).length ? `<h4>Tags</h4><div class="nt-tagcloud">${Object.keys(tags).sort().map(t => `<a class="nt-tag ${cur === "tag/" + t ? "on" : ""}" href="#/notes/tag/${encodeURIComponent(t)}">#${esc(t)} <small>${tags[t]}</small></a>`).join("")}</div>` : ""}
      <div class="nt-sidefoot">${item("trash", "Recently deleted", "trash", (data.notes || []).filter(n => n.trashed).length)}</div></aside>`;
  }
  function listPane(v, openId) {
    const q = st.q.trim().toLowerCase();
    let l = sortNotes(v.list); if (q) l = l.filter(n => [n.title, n.body, ...(n.tags || [])].join(" ").toLowerCase().includes(q));
    const row = n => `<a class="nt-row ${n.id === openId ? "on" : ""}" href="#/notes/n/${n.id}"><b>${n.pinned ? `<span class="nt-pinmark">${ico("pin")}</span>` : ""}${esc(titleOf(n))}</b>
      <span class="nt-snip"><em>${day(n.updated || n.created)}</em> ${esc(plain(n.body).slice(0, 110)) || "No additional text"}</span>${(n.tags || []).length || n.story ? `<span class="nt-rowtags">${n.story ? `<i class="nt-st s-${slug(n.story.status)}">${esc(n.story.status)}</i>` : ""}${(n.tags || []).map(t => `<i>#${esc(t)}</i>`).join("")}</span>` : ""}</a>`;
    let body;
    if (v.stories && !q) body = STATUSES.map(s => { const g = l.filter(n => (n.story.status || "Simmering") === s); return g.length ? `<h5 class="nt-group">${esc(s)} <small>${g.length}</small></h5>${g.map(row).join("")}` : ""; }).join("") || empty(v);
    else body = l.length ? l.map(row).join("") : (q ? `<p class="nt-empty">No notes match "${esc(st.q)}".</p>` : empty(v));
    return `<section class="nt-list"><div class="nt-lhead"><a class="nt-mback" href="#/notes/menu" aria-label="Folders">${ico("back")}</a><h2>${esc(v.title)}</h2>${v.trash ? (v.list.length ? `<button class="nt-text" data-nt="emptytrash">Empty</button>` : "") : `<button class="nt-new" data-nt="new" aria-label="New note">${ico("plus")}</button>`}</div>
      <input class="nt-search" id="nt-q" type="search" placeholder="Search" aria-label="Search notes" value="${esc(st.q)}"><div class="nt-rows" id="nt-rows">${body}</div></section>`;
  }
  const slug = t => String(t || "").toLowerCase().replace(/[^a-z]+/g, "-");
  const empty = v => `<div class="nt-empty">${v.trash ? "Nothing in Recently deleted." : v.stories ? "No storylines yet. Open any note and turn on Storyline." : "No notes here yet."}${!v.trash ? `<button class="nt-btn" data-nt="new">New note</button>` : ""}</div>`;

  function notePane(n, ents) {
    if (!n) return `<section class="nt-note nt-none"><div>${ICON.mark}<p>Pick a note, or start a new one.</p><button class="nt-btn" data-nt="new">New note</button></div></section>`;
    const editing = st.editing === n.id, alltags = [...new Set(live().flatMap(x => x.tags || []))];
    const story = n.story, sims = story ? (story.sims || []).map(id => data.sims.find(s => s.id === id)).filter(Boolean) : [];
    const mentioned = story ? simsMentioned(n, ents).filter(id => !(story.sims || []).includes(id)) : [];
    const tb = `<div class="nt-tb" role="toolbar" aria-label="Formatting"><button type="button" data-fmt="h">Heading</button><button type="button" data-fmt="b"><b>B</b></button><button type="button" data-fmt="i"><i>I</i></button><button type="button" data-fmt="ul">\u2022 List</button><button type="button" data-fmt="ck">\u2610 Checklist</button><button type="button" data-fmt="at">@ Mention</button><button type="button" class="nt-done" data-nt="done">Done</button></div>`;
    return `<section class="nt-note"><div class="nt-nhead"><a class="nt-mback" href="#/notes${st.ctx.length ? "/" + st.ctx.join("/") : ""}" aria-label="Back to list">${ico("back")}</a><span class="nt-when">${n.trashed ? "In Recently deleted" : "Edited " + day(n.updated || n.created)}</span>
        ${n.trashed ? `<button class="nt-text" data-nt="restore">Restore</button><button class="nt-text danger" data-nt="purge">Delete forever</button>`
          : `<button class="nt-ib ${n.pinned ? "on" : ""}" data-nt="pin" aria-label="${n.pinned ? "Unpin" : "Pin"}" aria-pressed="${!!n.pinned}">${ico("pin")}</button><button class="nt-ib ${n.sticky ? "on" : ""}" data-nt="sticky" aria-label="${n.sticky ? "Take off the desk" : "Make this the sticky note"}" aria-pressed="${!!n.sticky}" title="${n.sticky ? "Sticky note (tap to take it off)" : "Make sticky"}">${ico("sticky")}</button><button class="nt-ib" data-nt="trash" aria-label="Move to Recently deleted">${ico("trash")}</button>`}</div>
      <div class="nt-paper">
        <input class="nt-title" id="nt-title" value="${esc(n.title)}" placeholder="Title" aria-label="Title" ${n.trashed ? "disabled" : ""}>
        <div class="nt-meta">
          <label class="nt-fold">${ico("folder")}<select id="nt-folder" aria-label="Folder" ${n.trashed ? "disabled" : ""}>${FOLDERS().map(f => `<option ${(n.folder || "Inbox") === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label>
          ${(n.tags || []).map(t => `<span class="nt-chip">#${esc(t)}<button data-untag="${esc(t)}" aria-label="Remove tag ${esc(t)}">\u00d7</button></span>`).join("")}
          ${n.trashed ? "" : `<input class="nt-addtag" id="nt-addtag" list="nt-tags" placeholder="+ tag" aria-label="Add a tag"><datalist id="nt-tags">${alltags.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
          <button class="nt-storybtn ${story ? "on" : ""}" data-nt="story" aria-pressed="${!!story}">${ico("story")} Storyline</button>`}
        </div>
        ${story ? `<div class="nt-story"><div class="nt-srow"><label>Status <select id="nt-sstatus">${STATUSES.map(s => `<option ${story.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
            <label class="nt-next">Next beat <input id="nt-snext" value="${esc(story.next)}" placeholder="What happens next?"></label></div>
          <div class="nt-ssims"><span>Involved</span>${sims.map(s => `<span class="nt-chip sim"><a href="#/registry/${s.id}">${esc(clean(s.name))}</a><button data-unsim="${s.id}" aria-label="Remove ${esc(clean(s.name))}">\u00d7</button></span>`).join("")}
            ${UI.picker({ id:"nt-addsim", value:"", options:[{ v:"", t:"+ Add a Sim" }, ...[...data.sims].sort((a, b) => clean(a.name).localeCompare(clean(b.name))).filter(s => !(story.sims || []).includes(s.id)).map(s => ({ v:s.id, t:clean(s.name), s:s.career || "" }))], placeholder:"Search Sims", label:"Add a Sim" })}
            ${mentioned.length ? `<span class="nt-sugg">Mentioned: ${mentioned.map(id => `<button data-addsim="${id}">+ ${esc(clean(data.sims.find(s => s.id === id).name))}</button>`).join("")}</span>` : ""}</div></div>` : ""}
        ${editing ? `${tb}<div class="nt-edwrap"><textarea id="nt-body" class="nt-body" aria-label="Note">${esc(n.body)}</textarea><div class="nt-mention" id="nt-mention" hidden></div></div><p class="nt-hint">Type <b>@</b> to mention a Sim, club, company, or lot. <b>- [ ]</b> makes a checkbox.</p>`
          : `<div class="nt-view" ${n.trashed ? "" : 'data-nt="edit" tabindex="0" role="button" aria-label="Edit note"'}>${render(n.body, ents)}</div>`}
      </div></section>`;
  }

  /* ---------- draw ---------- */
  function draw() {
    const ents = entities();
    const isNote = route[0] === "n", note = isNote ? byId(route[1]) : null;
    if (!isNote && route[0] !== "menu") st.ctx = route.slice();
    const v = viewOf(st.ctx), mode = route[0] === "menu" ? "m-side" : isNote ? "m-note" : "m-list";
    root.innerHTML = `<div class="site-nt ${mode}">${side(v.key)}${listPane(v, note && note.id)}${notePane(note, ents)}</div>`;
    if (st.editing && note && st.editing === note.id) { const ta = root.querySelector("#nt-body"); if (ta && st.focusEnd) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); st.focusEnd = false; } }
  }
  async function refresh() { data = await GFB.getAll(); draw(); }
  function queueSave(id, patch) {
    const n = byId(id); if (!n) return; Object.assign(n, patch, { updated:Date.now() });
    clearTimeout(saveT); saveT = setTimeout(() => GFB.saveNote({ id, ...patch }), 500);
    const row = root.querySelector(`.nt-row[href="#/notes/n/${id}"]`);
    if (row) { row.querySelector("b").lastChild.textContent = titleOf(n); const sn = row.querySelector(".nt-snip"); if (sn) sn.innerHTML = `<em>${day(n.updated)}</em> ${esc(plain(n.body).slice(0, 110)) || "No additional text"}`; }
  }
  async function save(id, patch) { clearTimeout(saveT); const n = byId(id); await GFB.saveNote({ id, ...(n ? { title:n.title, body:n.body } : {}), ...patch }); await refresh(); }
  async function newNote(folder, extra) {
    const n = await GFB.saveNote({ title:"", body:"", folder:folder || "Inbox", pinned:false, tags:[], story:null, created:Date.now(), trashed:null, ...(extra || {}) });
    st.editing = n.id; st.focusEnd = true; data = await GFB.getAll(); go("n/" + n.id);
  }

  /* ---------- mention autocomplete ---------- */
  function mentionCheck(ta) {
    const box = root.querySelector("#nt-mention"); if (!box) return;
    const before = ta.value.slice(0, ta.selectionStart), m = before.match(/(^|[\s(])@([^\s@][^@\n]{0,28})?$/);
    if (!m) { box.hidden = true; st.mention = null; return; }
    const q = (m[2] || "").toLowerCase(), ents = entities();
    const hits = (q ? ents.filter(e => e.name.toLowerCase().includes(q)).sort((a, b) => (b.name.toLowerCase().startsWith(q) ? 1 : 0) - (a.name.toLowerCase().startsWith(q) ? 1 : 0) || a.name.localeCompare(b.name)) : ents.filter(e => e.kind === "Sim").sort((a, b) => a.name.localeCompare(b.name))).slice(0, 8);
    if (!hits.length) { box.hidden = true; st.mention = null; return; }
    st.mention = { start:ta.selectionStart - (m[2] || "").length - 1, end:ta.selectionStart, hits };
    box.innerHTML = hits.map((h, i) => `<button type="button" data-men="${i}"><b>${esc(h.name)}</b><small>${h.kind}${h.sub ? " \u00b7 " + esc(h.sub) : ""}</small></button>`).join(""); box.hidden = false;
  }
  function mentionPick(i) {
    const ta = root.querySelector("#nt-body"), m = st.mention; if (!ta || !m) return;
    const ins = "@" + m.hits[i].name + " "; ta.value = ta.value.slice(0, m.start) + ins + ta.value.slice(m.end);
    ta.setSelectionRange(m.start + ins.length, m.start + ins.length); ta.focus();
    root.querySelector("#nt-mention").hidden = true; st.mention = null; ta.dispatchEvent(new Event("input", { bubbles:true }));
  }

  /* ---------- events ---------- */
  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-nt");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target, id = route[0] === "n" ? route[1] : null, n = id && byId(id);
      const men = t.closest("[data-men]"); if (men) { mentionPick(+men.dataset.men); return; }
      const fb = t.closest("[data-fmt]"); if (fb) { const ta = root.querySelector("#nt-body"); if (ta) applyFmt(fb.dataset.fmt, ta); if (fb.dataset.fmt === "at") mentionCheck(ta); return; }
      const ck = t.closest("[data-ck]"); if (ck && n) { const lines = n.body.split("\n"), i = +ck.dataset.ck; lines[i] = lines[i].replace(/\[( |x|X)\]/, m => m === "[ ]" ? "[x]" : "[ ]"); await save(n.id, { body:lines.join("\n") }); return; }
      const ut = t.closest("[data-untag]"); if (ut && n) { await save(n.id, { tags:(n.tags || []).filter(x => x !== ut.dataset.untag) }); return; }
      const us = t.closest("[data-unsim]"); if (us && n) { await save(n.id, { story:{ ...n.story, sims:(n.story.sims || []).filter(x => x !== us.dataset.unsim) } }); return; }
      const as = t.closest("[data-addsim]"); if (as && n) { await save(n.id, { story:{ ...n.story, sims:[...(n.story.sims || []), as.dataset.addsim] } }); return; }
      if (t.closest("a")) return;
      const b = t.closest("[data-nt]"); if (!b) return;
      const act = b.dataset.nt;
      if (act === "new") { const v = viewOf(st.ctx); await newNote(v.folder, v.stories ? { story:{ status:"Simmering", sims:[], next:"" } } : (st.ctx[0] === "tag" ? { tags:[st.ctx[1]] } : null)); return; }
      if (act === "edit" && n) { st.editing = n.id; st.focusEnd = true; draw(); return; }
      if (act === "done") { st.editing = null; clearTimeout(saveT); if (n) await GFB.saveNote({ id:n.id, title:n.title, body:n.body }); await refresh(); return; }
      if (act === "pin" && n) { await save(n.id, { pinned:!n.pinned }); return; }
      if (act === "sticky" && n) { await setSticky(n.sticky ? null : n.id); await refresh(); return; }
      if (act === "trash" && n) { await save(n.id, { trashed:Date.now(), pinned:false, sticky:false }); window.dispatchEvent(new Event("gfb:sticky")); st.editing = null; go(st.ctx.join("/")); return; }
      if (act === "restore" && n) { await save(n.id, { trashed:null }); return; }
      if (act === "purge" && n) { if (!UI.confirmTap(b, "Tap again")) return; await GFB.deleteNote(n.id); await refresh(); go("trash"); return; }
      if (act === "emptytrash") { if (!UI.confirmTap(b, "Tap again")) return; for (const x of (data.notes || []).filter(x => x.trashed)) await GFB.deleteNote(x.id); await refresh(); return; }
      if (act === "story" && n) { await save(n.id, { story:n.story ? null : { status:"Simmering", sims:simsMentioned(n, entities()), next:"" } }); return; }
      if (act === "addfolder") { const name = (prompt("Folder name") || "").trim(); if (!name || FOLDERS().includes(name)) return; await GFB.saveSetting("note_folders", [...FOLDERS(), name]); await refresh(); go("f/" + name); return; }
    });
    document.addEventListener("input", e => {
      if (!mine(e.target)) return;
      const id = route[0] === "n" ? route[1] : null, t = e.target;
      if (t.id === "nt-q") { st.q = t.value; const r = root.querySelector("#nt-rows"); if (r) { const tmp = document.createElement("div"); tmp.innerHTML = listPane(viewOf(st.ctx), id); r.innerHTML = tmp.querySelector("#nt-rows").innerHTML; } return; }
      if (!id) return;
      if (t.id === "nt-body") { queueSave(id, { body:t.value }); mentionCheck(t); }
      if (t.id === "nt-title") queueSave(id, { title:t.value });
      if (t.id === "nt-snext") { const n = byId(id); queueSave(id, { story:{ ...n.story, next:t.value } }); }
    });
    document.addEventListener("keydown", e => {
      if (!mine(e.target)) return;
      if (e.target.id === "nt-body" && st.mention && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); mentionPick(0); return; }
      if (e.target.id === "nt-body" && e.key === "Escape") { root.querySelector("#nt-mention").hidden = true; st.mention = null; }
      if (e.target.id === "nt-addtag" && e.key === "Enter") { e.preventDefault(); const v = e.target.value.trim().replace(/^#/, ""), n = byId(route[1]); if (v && n && !(n.tags || []).includes(v)) save(n.id, { tags:[...(n.tags || []), v] }); }
      if (e.target.matches(".nt-view") && e.key === "Enter") { st.editing = route[1]; st.focusEnd = true; draw(); }
    });
    document.addEventListener("change", async e => {
      if (!mine(e.target)) return;
      const id = route[0] === "n" ? route[1] : null, n = id && byId(id), t = e.target; if (!n) return;
      if (t.id === "nt-folder") await save(n.id, { folder:t.value });
      if (t.id === "nt-sstatus") await save(n.id, { story:{ ...n.story, status:t.value } });
      if (t.id === "nt-addsim" && t.value) await save(n.id, { story:{ ...n.story, sims:[...(n.story.sims || []), t.value] } });
      if (t.id === "nt-addtag") { const v = t.value.trim().replace(/^#/, ""); if (v && !(n.tags || []).includes(v)) await save(n.id, { tags:[...(n.tags || []), v] }); }
    });
  }

  function renderApp(el, d, parts) { root = el; data = d; route = (parts || []).map(x => { try { return decodeURIComponent(x); } catch { return x; } }); const key = route.join("/"); if (key !== lastKey) { if (route[0] !== "n" || route[1] !== st.editing) st.editing = null; lastKey = key; } bind(); draw(); }
  function label() { if (route[0] === "n") { const n = byId(route[1]); return n ? titleOf(n) : "Note"; } return viewOf(route[0] === "menu" ? st.ctx : route).title; }

  /* ---------- quick capture (menu bar pencil): a note without leaving the app you're in ---------- */
  function openQuick() {
    if (document.getElementById("nt-quick")) { document.getElementById("nt-quick").remove(); return; }
    const box = document.createElement("div"); box.id = "nt-quick"; box.className = "nt-quick";
    box.innerHTML = `<div class="nt-qcard" role="dialog" aria-label="Quick note"><div class="nt-qhead">${ICON.mark}<b>Quick note</b><span>Saves to Inbox</span></div>
      <textarea id="nt-qtext" placeholder="Get it down before it's gone. Type @ to mention a Sim later in Notes." aria-label="Quick note"></textarea>
      <div class="nt-qacts"><button class="nt-text" data-q="cancel">Cancel</button><button class="nt-btn" data-q="save">Save</button></div></div>`;
    document.body.appendChild(box); setTimeout(() => box.querySelector("textarea").focus(), 30);
    box.addEventListener("click", async e => {
      const b = e.target.closest("[data-q]"); if (e.target === box || (b && b.dataset.q === "cancel")) { box.remove(); return; }
      if (b && b.dataset.q === "save") { const v = box.querySelector("textarea").value.trim(); if (!v) { box.remove(); return; }
        const lines = v.split("\n"); await GFB.saveNote({ title:lines[0].slice(0, 80), body:lines.slice(1).join("\n").trim(), folder:"Inbox", pinned:false, tags:[], story:null, created:Date.now(), trashed:null });
        box.querySelector(".nt-qcard").innerHTML = `<p class="nt-qdone">Saved to Inbox. <a href="#/notes/f/Inbox">Open Notes</a></p>`; setTimeout(() => box.remove(), 1400);
        if (location.hash.startsWith("#/notes")) window.dispatchEvent(new HashChangeEvent("hashchange")); }
    });
    box.addEventListener("keydown", e => { if (e.key === "Escape") box.remove(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) box.querySelector("[data-q=save]").click(); });
  }

  /* the desk sticky: one note at a time, marked on the note so every device shows the same one */
  async function setSticky(id) {
    const d = await GFB.getAll();
    for (const x of (d.notes || []).filter(x => x.sticky && x.id !== id)) await GFB.saveNote({ id:x.id, sticky:false });
    if (id) { await GFB.saveNote({ id, sticky:true }); try { localStorage.removeItem("simdesk-sticky-hidden"); } catch {} }
    window.dispatchEvent(new Event("gfb:sticky"));
  }
  /* note body as HTML for the sticky, with the same checklists and @mention links as Notes */
  function bodyHTML(d, body) { const prev = data; data = d; try { return render(body || "", entities()); } finally { data = prev || d; } }
  /* a new note that already mentions a Sim, opened in Notes */
  async function newAbout(sim) {
    const n = await GFB.saveNote({ title:"", body:"@" + clean(sim.name) + " ", folder:"Inbox", pinned:false, tags:[], story:null, created:Date.now(), trashed:null });
    st.editing = n.id; location.hash = "#/notes/n/" + n.id;
  }

  /* used by the Registry: notes that mention a Sim or list them in a storyline */
  function mentionsOf(d, sim) {
    const name = clean(sim.name), re = new RegExp("@" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9])", "i");
    return (d.notes || []).filter(n => !n.trashed && (re.test((n.title || "") + "\n" + (n.body || "")) || (n.story && (n.story.sims || []).includes(sim.id))))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(n => ({ id:n.id, title:titleOf(n), story:n.story ? n.story.status : null, folder:n.folder || "Inbox", sticky:!!n.sticky, when:day(n.updated || n.created) }));
  }
  return { render:renderApp, label, openQuick, mentionsOf, setSticky, bodyHTML, titleOf, newAbout };
})();
