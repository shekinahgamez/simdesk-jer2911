/* The desk sticky: one note from Notes that floats over every app. Pick it in Notes (the sticky button beside Pin)
   or with Switch on the sticky itself. The X only hides it on this device; the menu bar button brings it back.
   iPad: a small card you can drag, it remembers where you left it. Phone: a tab in the corner that opens into a card. */
const Sticky = (() => {
  const HID = "simdesk-sticky-hidden", POS = "simdesk-sticky-pos";
  const st = { open:false, edit:false, pick:false, note:null, data:null, busy:false };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const ls = { get:k => { try { return localStorage.getItem(k); } catch { return null; } }, set:(k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
  const phone = () => window.innerWidth <= 720;
  const I = {
    note:'<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>', list:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    open:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>', back:'<path d="M15 5l-7 7 7 7"/>'
  };
  const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
  let el = null, tab = null, timer = null;

  async function load(){ st.data = await GFB.getAll(); st.note = (st.data.notes || []).find(n => n.sticky && !n.trashed) || null; }
  const hidden = () => ls.get(HID) === "1";

  function mount(){
    if (el) return;
    el = document.createElement("section"); el.className = "sk-card"; el.setAttribute("aria-label", "Sticky note"); el.hidden = true; document.body.appendChild(el);
    tab = document.createElement("button"); tab.type = "button"; tab.className = "sk-tab"; tab.hidden = true; tab.setAttribute("aria-label", "Open sticky note"); tab.innerHTML = ico("note"); document.body.appendChild(tab);
    tab.addEventListener("click", () => { st.open = true; paint(); });
    el.addEventListener("click", onClick);
    el.addEventListener("pointerdown", dragStart);
    window.addEventListener("resize", () => { place(); paint(); });
  }

  function recent(){ return (st.data.notes || []).filter(n => !n.trashed).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 12); }
  function bodyView(n){
    if (st.edit) return `<textarea class="sk-ta" aria-label="Sticky note text">${esc(n.body || "")}</textarea>`;
    return `<div class="sk-body" data-sk="edit" role="button" tabindex="0" aria-label="Edit the sticky note">${Notes.bodyHTML(st.data, n.body)}</div>`;
  }
  function pickView(){
    const rows = recent().map(n => `<button type="button" class="sk-row ${st.note && n.id === st.note.id ? "on" : ""}" data-pick="${n.id}"><b>${esc(Notes.titleOf(n))}</b><small>${esc(n.folder || "Inbox")}</small></button>`).join("");
    return `<p class="sk-hint">Pick a note for the desk. Your 12 most recent notes are here; any note can be picked from Notes with the sticky button.</p><div class="sk-list">${rows || `<p class="sk-hint">No notes yet. Start one in Notes.</p>`}</div>
      ${st.note ? `<button type="button" class="sk-off" data-sk="off">Take it off the desk</button>` : ""}`;
  }

  function paint(){
    mount();
    const show = !hidden() && (st.note || st.pick);
    if (!show) { el.hidden = true; tab.hidden = true; return; }
    if (phone() && !st.open) { el.hidden = true; tab.hidden = false; return; }
    tab.hidden = true; el.hidden = false; el.classList.toggle("phone", phone());
    const n = st.note;
    const title = st.pick ? "Choose a sticky" : esc(Notes.titleOf(n));
    el.innerHTML = `<header class="sk-head" data-drag>
        ${st.pick && n ? `<button type="button" class="sk-ib" data-sk="unpick" aria-label="Back to the sticky">${ico("back")}</button>` : ""}
        <b class="sk-title">${title}</b>
        ${!st.pick ? `<button type="button" class="sk-ib" data-sk="pick" aria-label="Switch to another note">${ico("list")}</button><a class="sk-ib" href="#/notes/n/${n.id}" aria-label="Open in Notes">${ico("open")}</a>` : ""}
        <button type="button" class="sk-ib" data-sk="close" aria-label="${phone() ? "Fold the sticky away" : "Hide the sticky"}">${ico("x")}</button></header>
      <div class="sk-main">${st.pick || !n ? pickView() : bodyView(n)}</div>
      ${st.edit ? `<footer class="sk-foot"><button type="button" class="sk-done" data-sk="done">Done</button></footer>` : ""}`;
    place();
    if (st.edit) { const t = el.querySelector(".sk-ta"); t.focus({ preventScroll:true }); }
  }

  /* where the card sits: phone is pinned above the dock, iPad remembers a spot */
  function place(){
    if (!el || el.hidden || el.classList.contains("phone")) { if (el) { el.style.left = ""; el.style.top = ""; } return; }
    let p = null; try { p = JSON.parse(ls.get(POS) || "null"); } catch {}
    const w = el.offsetWidth || 300, h = el.offsetHeight || 200;
    const x = p ? p.x : window.innerWidth - w - 24, y = p ? p.y : window.innerHeight - h - 112;
    el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x)) + "px";
    el.style.top = Math.max(40, Math.min(window.innerHeight - Math.min(h, 120) - 8, y)) + "px";
  }
  function dragStart(e){
    const h = e.target.closest("[data-drag]"); if (!h || e.target.closest("button,a") || el.classList.contains("phone")) return;
    const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    el.setPointerCapture(e.pointerId); el.classList.add("dragging");
    const mv = ev => { el.style.left = (ev.clientX - ox) + "px"; el.style.top = (ev.clientY - oy) + "px"; };
    const up = ev => { el.releasePointerCapture(e.pointerId); el.classList.remove("dragging"); el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up);
      ls.set(POS, JSON.stringify({ x:parseInt(el.style.left, 10), y:parseInt(el.style.top, 10) })); place(); };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
  }

  async function saveText(){
    const t = el.querySelector(".sk-ta"); if (!t || !st.note) return;
    if (t.value !== (st.note.body || "")) { await GFB.saveNote({ id:st.note.id, body:t.value }); await load(); }
  }
  async function onClick(e){
    const ck = e.target.closest("[data-ck]");
    if (ck && st.note) { e.preventDefault(); const lines = String(st.note.body || "").split("\n"), i = +ck.dataset.ck; lines[i] = lines[i].replace(/\[( |x|X)\]/, m => m === "[ ]" ? "[x]" : "[ ]"); await GFB.saveNote({ id:st.note.id, body:lines.join("\n") }); await load(); return paint(); }
    if (e.target.closest("a[href]")) { if (phone()) { st.open = false; setTimeout(paint, 0); } return; }
    const pk = e.target.closest("[data-pick]");
    if (pk) { await Notes.setSticky(pk.dataset.pick); st.pick = false; await load(); return paint(); }
    const a = e.target.closest("[data-sk]")?.dataset.sk; if (!a) return;
    if (a === "edit") { st.edit = true; return paint(); }
    if (a === "done") { await saveText(); st.edit = false; return paint(); }
    if (a === "pick") { if (st.edit) await saveText(); st.edit = false; st.pick = true; return paint(); }
    if (a === "unpick") { st.pick = false; return paint(); }
    if (a === "off") { await Notes.setSticky(null); st.pick = false; await load(); return paint(); }
    if (a === "close") { if (st.edit) await saveText(); st.edit = false; st.pick = false;
      if (phone()) st.open = false; else ls.set(HID, "1"); return paint(); }
  }

  /* menu bar button: show or hide; with no sticky yet it opens the picker */
  async function toggle(){
    await load();
    if (phone()) { ls.set(HID, null); if (!st.note) st.pick = true; st.open = !st.open || !st.note; return paint(); }
    if (!st.note) { ls.set(HID, null); st.pick = !st.pick; return paint(); }
    if (hidden()) ls.set(HID, null); else { st.edit = false; ls.set(HID, "1"); }
    paint();
  }
  async function refresh(){ if (st.edit || st.busy) return; st.busy = true; try { await load(); paint(); } finally { st.busy = false; } }

  function start(){
    mount(); refresh();
    window.addEventListener("gfb:sticky", () => { st.pick = false; refresh(); });
    window.addEventListener("hashchange", refresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden && el && !el.hidden) refresh(); }, 4000);
    el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches(".sk-body")) { st.edit = true; paint(); } if (e.key === "Escape" && st.edit) { el.querySelector("[data-sk=done]")?.click(); } });
  }
  return { start, toggle };
})();
