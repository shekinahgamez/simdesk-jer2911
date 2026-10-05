/* Black Tea: public front page + staff desk. Reads and saves through GFB (assets/data.js). */
const BlackTea = (() => {
  const IMG = { wordmark:"sites/blacktea/img/wordmark.png", icon:"sites/blacktea/img/icon.png" };
  const SECTIONS = ["Latest","Exclusives","Culture","Music","Sports","Blind Items"];
  const STATUSES = ["Pitched","Reporting","Drafted","Published","Killed"];
  const KINDS = { standard:"Standard story", photo:"Photo post", blind:"Blind item", tip:"Tip line" };
  const SECTION_OPTS = ["Exclusives","Culture","Music","Sports","Blind Items","Tip Line"];
  const st = { section:"Latest", editing:null, tipSent:false };
  let data = null, root = null, view = "front";

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmt = d => UI.gameLabel(d);
  const gtoday = () => UI.gameToday(data.calendar);
  const dateKey = d => typeof d === "object" && d ? String(UI.gameOrd(d, data.calendar)).padStart(6, "0") : "";
  const paras = t => String(t || "").split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join("");
  const simName = id => (data.sims.find(s => s.id === id) || {}).name || id;
  const today = () => new Date().toISOString().slice(0,10);

  /* ---------- front page ---------- */
  function postHTML(p){
    const sample = p.sample ? `<span class="bt-sample">Sample</span>` : "";
    const by = p.byline ? `By <b>${esc(p.byline)}</b> · ` : "";
    const meta = `<div class="bt-meta"><span>${p.tag ? "#" + esc(p.tag) : ""}</span></div>`;
    if (p.kind === "blind") return `<article class="bt-blind">
        <div class="bt-labels"><span class="bt-flag">BLIND ITEM</span></div><img src="${IMG.icon}" alt="">
        <p class="bt-by">${by}${fmt(p.date)}</p><div class="body">${paras(p.body)}</div>
        <div class="guess">THINK YOU KNOW? GUESSES IN THE REBLOGS.</div></article>`;
    if (p.kind === "tip") return `<article class="bt-post">
        <div class="bt-labels"><span class="bt-flag">THE TIP LINE</span>${sample}</div>
        <div class="bt-tipcard"><img src="${IMG.icon}" alt=""><div><div class="who">ANONYMOUS SENT A TIP</div><p>${esc(p.tip)}</p></div></div>
        <div class="body">${paras(p.body)}</div>${meta}</article>`;
    if (p.kind === "photo") return `<article class="bt-post">
        <div class="bt-labels"><span class="bt-sec">PHOTO</span>${sample}</div>
        ${p.headline ? `<h2>${esc(p.headline)}</h2>` : ""}
        ${photoHTML(p)}
        ${p.photo_by ? `<p class="bt-credit">PHOTO: <b>${esc(p.photo_by.toUpperCase())}</b></p>` : ""}
        <p class="bt-by">${by}${fmt(p.date)}</p><div class="body">${paras(p.body)}</div>${meta}</article>`;
    return `<article class="bt-post">
        <div class="bt-labels">${p.breaking ? `<span class="bt-flag">BREAKING</span>` : ""}<span class="bt-sec">${esc((p.section||"").toUpperCase())}</span>${sample}</div>
        <h2>${esc(p.headline)}</h2><p class="bt-by">${by}${fmt(p.date)}</p>${p.photo ? photoHTML(p) : ""}<div class="body">${paras(p.body)}</div>${meta}</article>`;
  }
  function photoHTML(p){
    const img = p.photo ? `<img class="bt-img" src="${esc(p.photo)}" alt="${esc(p.photo_alt || p.headline || "Photo")}">` : `<div class="bt-photo" role="img" aria-label="Photo placeholder">SCREENSHOT GOES HERE</div>`;
    const credit = p.photo_by ? `<p class="bt-credit">PHOTO: <b>${esc(p.photo_by.toUpperCase())}</b></p>` : "";
    return p.kind === "photo" ? img : img + credit;
  }

  function frontHTML(){
    const pub = data.stories.filter(s => s.status === "Published").sort((a,b) => dateKey(b.date).localeCompare(dateKey(a.date)) || String(b.date || "").localeCompare(String(a.date || "")));
    const shown = st.section === "Latest" ? pub : pub.filter(s => s.section === st.section);
    return `<div class="site-bt">
      <div class="bt-top"><span class="cities">LENNOX PARK · BAYMORE · FENMORE</span><span class="spacer"></span>
        <button class="tip" data-bt="tipfocus">SEND A TIP</button></div>
      <header class="bt-mast"><img src="${IMG.wordmark}" alt="Black Tea"><p>CULTURE AT SPEED</p></header>
      <nav class="bt-nav" aria-label="Sections">${SECTIONS.map(s => `<button data-sec="${s}" aria-pressed="${st.section===s}">${s.toUpperCase()}</button>`).join("")}</nav>
      <div class="bt-wrap">
        <main>${shown.length ? shown.map(postHTML).join("") : `<p class="bt-empty">Nothing published in ${esc(st.section)} yet.</p>`}</main>
        <aside class="bt-rail">
          <section><h3>SEND A TIP</h3>
            <textarea id="bt-tip" placeholder="Saw something? Heard something?" aria-label="Your tip"></textarea>
            <p class="note">Anonymous. Tips go straight to the desk.</p>
            <button class="bt-btn amber" data-bt="sendtip">SEND IT</button>
            ${st.tipSent ? `<p class="bt-thanks">Got it. The desk will take a look.</p>` : ""}
          </section>
          <section id="bt-masthead"><h3>THE DESK</h3><ul class="bt-staff">${data.blacktea_staff.map(m => `<li><b>${esc(m.name)}</b><span>${esc(m.role)}</span></li>`).join("")}</ul></section>
        </aside>
      </div>
      <footer class="bt-foot"><div class="wm">BLACK <span>TEA.</span></div><div class="cities">LENNOX PARK · BAYMORE · FENMORE</div>
        <button data-bt="desk">STAFF LOGIN</button></footer>
    </div>`;
  }

  /* ---------- staff desk ---------- */
  function cardHTML(s){
    const sims = (s.sims||[]).map(id => `<span class="bt-chip">${esc(simName(id).replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g," "))}</span>`).join("");
    const title = s.headline || s.tip || s.body || "Untitled";
    const who = [s.byline, s.photo_by && "Photo: " + s.photo_by].filter(Boolean).join(" · ");
    return `<button class="bt-card ${s.kind==="blind"?"blind":""}" data-story="${s.id}">${s.photo ? `<img class="bt-thumb" src="${esc(s.photo)}" alt="">` : ""}
      <span class="s">${esc((s.section || KINDS[s.kind] || "").toUpperCase())}${s.sample?" · SAMPLE":""}</span>
      <div class="h">${esc(title.length > 90 ? title.slice(0,88) + "…" : title)}</div>
      <div class="b">${esc(who || "Unassigned")}</div>${sims ? `<div class="bt-chips">${sims}</div>` : ""}</button>`;
  }

  function deskHTML(){
    const live = data.stories.filter(s => s.status !== "Killed");
    const counts = {};
    live.forEach(s => (s.sims||[]).forEach(id => counts[id] = (counts[id]||0) + 1));
    const cov = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    return `<div class="site-bt">
      <div class="bt-deskbar"><img src="${IMG.icon}" alt=""><div><h1>The Desk</h1><p>Staff only</p></div><span class="spacer"></span>
        <button class="bt-btn amber" data-bt="new">NEW STORY</button><button class="bt-btn ghost" data-bt="front">VIEW SITE</button></div>
      <div class="bt-desk">
        <div class="bt-board">${STATUSES.map(stt => { const items = data.stories.filter(s => s.status === stt);
          return `<section class="bt-col ${stt==="Killed"?"killed":""}"><h2><b>${stt.toUpperCase()}</b><span>${items.length}</span></h2>${items.map(cardHTML).join("")}</section>`; }).join("")}</div>
        <aside class="bt-coverage"><h3>IN OUR COVERAGE</h3><p>Every Sim tied to a live story, most covered first. Killed stories don't count.</p>
          ${cov.length ? cov.map(([id,n]) => `<div class="bt-cov"><span>${esc(simName(id))}</span><b>${n}</b></div>`).join("") : `<p>No one yet.</p>`}</aside>
      </div>
      ${st.editing ? formHTML(st.editing) : ""}
    </div>`;
  }

  const opt = (list, val) => list.map(o => `<option ${o===val?"selected":""}>${esc(o)}</option>`).join("");
  function formHTML(s){
    const staff = data.blacktea_staff.map(m => m.name);
    return `<div class="bt-modal" data-bt="closebg"><form class="bt-form" id="bt-form" role="dialog" aria-label="Edit story">
      <h2>${s.id ? "Edit story" : "New story"}</h2>
      <div class="row">
        <label>Status<select name="status">${opt(STATUSES, s.status)}</select></label>
        <label>Type<select name="kind">${Object.entries(KINDS).map(([k,v]) => `<option value="${k}" ${k===s.kind?"selected":""}>${v}</option>`).join("")}</select></label>
        <label>Section<select name="section">${opt(SECTION_OPTS, s.section)}</select></label>
        <label style="grid-column:1 / -1">Date in the save${UI.gameDate("date", s.date, data.calendar)}</label>
      </div>
      <label>Headline<input name="headline" value="${esc(s.headline)}"></label>
      <div class="bt-upload"><span class="lbl">Photo</span>
        ${s.photo ? `<img src="${esc(s.photo)}" alt="Story photo preview"><div class="ups"><label class="bt-btn ghost">REPLACE<input type="file" accept="image/*" id="bt-file" hidden></label><button type="button" class="bt-del" data-bt="rmphoto">Remove photo</button></div>`
                  : `<label class="bt-drop">Add a screenshot<input type="file" accept="image/*" id="bt-file" hidden></label>`}
        ${st.uploading ? `<p class="bt-note">Adding photo…</p>` : ""}${st.err ? `<p class="bt-err">${esc(st.err)}</p>` : ""}
      </div>
      <label>Tip text (tip line posts only)<textarea name="tip">${esc(s.tip)}</textarea></label>
      <label>Story<textarea name="body">${esc(s.body)}</textarea></label>
      <div class="row">
        <label>Byline<select name="byline"><option value="">None</option>${opt([...staff,"Black Tea Staff"], s.byline)}</select></label>
        <label>Photo credit<select name="photo_by"><option value="">None</option>${opt(staff, s.photo_by)}</select></label>
        <label>Tag<input name="tag" value="${esc(s.tag)}" placeholder="sixth and main"></label>
      </div>
      <label><span>Breaking<input type="checkbox" name="breaking" ${s.breaking?"checked":""} style="width:auto;display:inline;margin-left:8px"></span></label>
      <div class="bt-pick"><span>Sims involved</span>${UI.simPicker("sims", s.sims, data.sims)}</div>
      <label>Desk notes (never published)<textarea name="desk_notes">${esc(s.desk_notes)}</textarea></label>
      <div class="acts">${s.id ? `<button type="button" class="bt-del" data-bt="delete">Delete story</button>` : ""}<span class="spacer"></span>
        <button type="button" class="bt-btn ghost" data-bt="cancel">CANCEL</button><button type="submit" class="bt-btn">SAVE</button></div>
    </form></div>`;
  }

  function readForm(form){
    const f = new FormData(form), v = k => (f.get(k) || "").trim();
    return { ...st.editing,
      status:v("status"), kind:v("kind"), section:v("section"), date:UI.readGameDate(f, "date", data.calendar), headline:v("headline"), tip:v("tip"), body:v("body"),
      byline:v("byline"), photo_by:v("photo_by"), tag:v("tag"), breaking:f.get("breaking") === "on", sims:f.getAll("sims"), desk_notes:v("desk_notes") };
  }

  /* ---------- render + events ---------- */
  function draw(){ root.innerHTML = view === "desk" ? deskHTML() : frontHTML(); }

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    document.addEventListener("click", async e => {
      if (!root || !root.contains(e.target) || !root.querySelector(".site-bt")) return;
      const t = e.target;
      const sec = t.closest("[data-sec]");
      if (sec){ st.section = sec.dataset.sec; draw(); return; }
      const card = t.closest("[data-story]");
      if (card){ st.editing = JSON.parse(JSON.stringify(data.stories.find(s => s.id === card.dataset.story))); draw(); return; }
      const act = t.closest("[data-bt]")?.dataset.bt;
      if (act === "closebg" && t.classList.contains("bt-modal")){ st.editing = null; draw(); }
      if (act === "cancel"){ st.editing = null; st.err = null; draw(); }
      if (act === "desk"){ location.hash = "#/blacktea/desk"; }
      if (act === "front"){ location.hash = "#/blacktea"; }
      if (act === "new"){ st.editing = { status:"Pitched", kind:"standard", section:"Culture", sims:[], date:gtoday() }; draw(); }
      if (act === "rmphoto"){ st.editing = { ...readForm(root.querySelector("#bt-form")), photo:null }; draw(); }
      if (act === "delete" && UI.confirmTap(t.closest("[data-bt=delete]"))){ await GFB.deleteStory(st.editing.id); st.editing = null; draw(); }
      if (act === "tipfocus"){ const ta = root.querySelector("#bt-tip"); ta?.scrollIntoView({behavior:"smooth",block:"center"}); ta?.focus({preventScroll:true}); }
      if (act === "sendtip"){
        const text = (root.querySelector("#bt-tip")?.value || "").trim();
        if (!text) return;
        await GFB.saveStory({ status:"Pitched", kind:"tip", section:"Tip Line", tip:text, body:"", headline:"", byline:"", photo_by:"", sims:[], tag:"tip line", date:gtoday(), desk_notes:"Came in through Send a tip." });
        st.tipSent = true; draw();
      }
    });
    document.addEventListener("submit", async e => {
      if (e.target.id !== "bt-form") return;
      e.preventDefault();
      const story = readForm(e.target);
      try { await GFB.saveStory(story); st.editing = null; st.err = null; }
      catch (err) { st.editing = story; st.err = err.message; }
      draw();
    });
    document.addEventListener("change", async e => {
      if (e.target.id !== "bt-file" || !e.target.files[0]) return;
      st.editing = readForm(root.querySelector("#bt-form"));
      st.uploading = true; st.err = null; draw();
      try { const up = await GFB.uploadImage(e.target.files[0]); st.editing.photo = up.url; }
      catch (err) { st.err = err.message; }
      st.uploading = false; draw();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && st.editing && root?.querySelector(".bt-modal")){ e.stopImmediatePropagation(); st.editing = null; draw(); } }, true);
  }

  function render(el, d, v){
    root = el; data = d; view = v === "desk" ? "desk" : "front";
    if (view === "front") st.editing = null;
    bind(); draw();
  }
  return { render };
})();
