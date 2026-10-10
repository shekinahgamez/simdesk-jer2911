/* Share sheet: a system feature (not an app). A share icon in the top bar opens it over any app. Pick Sims, check what to include,
   then Copy or Save .md to paste into Claude. Remembers your boxes, your three "since" dates, and the "All their links" switch
   (settings.share, so it follows you between devices). Builds the text from live data; nothing here writes story data. */
const Share = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const BOXES = [
    { key:"basics", name:"Registry basics", sub:"Age, job, household, traits, summary" },
    { key:"links", name:"Connections", sub:"Links between these Sims" },
    { key:"messages", name:"Messages", sub:"Texts between them since", since:"game" },
    { key:"simsta", name:"Simsta", sub:"Posts and comments since", since:"game" },
    { key:"money", name:"Money and home", sub:"Banks, Lotline address" },
    { key:"notes", name:"Notes", sub:"Notes about them since", since:"real" }];
  const st = { open:false, picked:[], boxes:{ basics:true, links:true, messages:true, simsta:true, money:true, notes:true }, since:{}, allLinks:false, picking:false, q:"", busy:false, msg:"" };
  let data = null, layer = null, mounted = false;

  const clean = n => String(n || "").replace(/\s*["“][^"”]*["”]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => clean(n).split(" ")[0];
  const dash = s => String(s || "").replace(/\s*[—–]\s*/g, ", ");
  const words = t => (String(t).trim().match(/\S+/g) || []).length;
  const sim = id => data.sims.find(s => s.id === id);
  const nameOf = id => { const s = sim(String(id).split("~")[0]); return s ? clean(s.name) : String(id); };
  const stage = s => ({ "Young Adult":"YA", Adult:"Adult", Elder:"Elder", Teen:"Teen", Child:"Child", Toddler:"Toddler", Infant:"Infant", Baby:"Baby" }[s] || s || "");
  const sex = g => ({ Male:"M", Female:"F" }[g] || (g ? g[0].toUpperCase() : ""));
  const label = UI.gameLabel, ord = d => UI.gameOrd(d, data.calendar);
  const todayGame = () => UI.gameToday(data.calendar);
  const realDay = ms => new Date(ms).toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
  const isoOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const sinceOf = key => st.since[key] ?? (key === "notes" ? Date.now() - 7 * 864e5 : { season:data.calendar.seasons[0].name, day:1, year:1 });

  /* ---------- the text, one section per box (each returns "" when there's nothing) ---------- */
  function basics() {
    const reg = window.GFB && GFB.registry;
    return st.picked.map(id => {
      const s = sim(id); if (!s) return "";
      const head = `## ${clean(s.name)}${s.simsta ? ` (${s.simsta})` : ""}${[s.age, stage(s.life_stage), sex(s.gender)].some(Boolean) ? ", " + [s.age, stage(s.life_stage), sex(s.gender)].filter(Boolean).join(", ") : ""}`;
      const job = [dash(s.career), s.household ? `Household: ${s.household}` : ""].filter(Boolean).join(". ");
      const traits = (s.traits || []).length ? `Traits: ${s.traits.join(", ")}` : "";
      const ra = s.romantic_attraction ? `Romantic: ${String(s.romantic_attraction).toLowerCase()}` : "", sa = s.sexual_attraction ? `Sexual: ${String(s.sexual_attraction).toLowerCase()}` : "";
      const bits = [s.aspiration, s.attachment, s.love_language, ra, sa].filter(Boolean).join(" · ");
      let summary = ""; try { summary = reg && reg.simInfo(s.id).summary || ""; } catch {}
      return [head, job, traits, bits, summary ? `Summary: ${dash(summary)}` : ""].filter(Boolean).join("\n");
    }).filter(Boolean).join("\n");
  }
  function linkText(l) {
    const A = l.a_sim ? first(nameOf(l.a_sim)) : "", B = l.b_sim ? first(nameOf(l.b_sim)) : l.b_name || "";
    const lab = l.a_label || l.b_label || "", h = (l.history || []).find(x => x.game_date), date = h ? label(h.game_date) : "";
    let desc;
    if (/matched on slide/i.test(lab)) desc = "matched on Slide";
    else if (lab && !(l.kind === "fam" && l.family === "parent")) desc = lab.charAt(0).toLowerCase() + lab.slice(1);
    else if (l.kind === "fam" && l.family === "parent") desc = `${A} is ${B}'s parent`;
    else desc = { rom:"dating", ex:"exes", friend:"friends", work:"coworkers", fam:l.family === "sibling" ? "siblings" : "family" }[l.kind] || l.kind;
    const body = l.kind === "fam" && l.family === "parent" ? desc : `${A} and ${B}: ${desc}`;
    return `${body}${date && !/is .*'s parent/.test(body) ? ` (${date})` : ""}${l.secret ? " (secret)" : ""}`;
  }
  function links() {
    const set = new Set(st.picked), all = GFB.registry.all();
    const hit = all.filter(l => st.allLinks ? (set.has(l.a_sim) || set.has(l.b_sim)) : (set.has(l.a_sim) && set.has(l.b_sim)));
    return hit.map(linkText).join("\n");
  }
  function messages() {
    const set = new Set(st.picked), since = ord(sinceOf("messages")), M = GFB.messages; if (!M.isLoaded()) return "";
    const out = [];
    for (const t of M.threads()) {
      if (t.sim_ids.length < 2 || !t.sim_ids.every(id => set.has(id))) continue;
      const list = M.list(t.id).filter(m => !m.game_date || ord(m.game_date) >= since).filter(m => !(m.kind === "system" && /^Connected via text/i.test(m.body)));
      if (!list.length) continue;
      const dated = list.find(m => m.game_date), names = t.sim_ids.map(id => first(nameOf(id))).join(" and ");
      const from = { slide:", from Slide", simsta:", from Simsta", group:"" }[t.origin] || "";
      out.push(`${names}${from}${dated ? ` (${label(dated.game_date)})` : ""}`);
      list.forEach(m => out.push(m.kind === "system" ? `(${m.body})` : `${first(nameOf(m.sender_sim_id))}: ${m.body}`));
    }
    return out.join("\n");
  }
  function simsta() {
    const set = new Set(st.picked), since = ord(sinceOf("simsta")), S = GFB.simsta, out = [];
    const who = a => { const [id, alt] = String(a).split("~"); return first(nameOf(id)) + (alt ? " (alt)" : ""); };
    for (const p of (data.posts || [])) {
      if (!(set.has(p.author) || (p.tags || []).some(t => set.has(t)))) continue;
      if (p.date && ord(p.date) < since) continue;
      const tags = (p.tags || []).filter(t => sim(t)).map(t => first(nameOf(t)));
      out.push(`${first(nameOf(p.author))} posted${p.date ? ` (${label(p.date)})` : ""}${tags.length ? `, tagged ${tags.join(", ")}` : ""}${p.caption ? `: "${p.caption}"` : ""}`);
      const likers = [...new Set([...(p.liked_by || []), ...S.likersOf(p.id)])], inc = likers.filter(a => set.has(a)).map(who), incTxt = inc.length > 1 ? inc.slice(0, -1).join(", ") + " and " + inc[inc.length - 1] : inc.join(""), total = (p.likes || 0) + S.addedOf(p.id);
      if (total || likers.length) out.push(`${total || likers.length} likes${inc.length ? `, including ${incTxt}` : ""}`);
      [...(p.comments || []), ...S.commentsOf(p.id)].forEach(c => out.push(`${who(c.author)}: ${c.body ?? c.text ?? ""}`));
    }
    return out.join("\n");
  }
  function money() {
    const set = new Set(st.picked), out = [], seen = new Set();
    for (const id of st.picked) {
      const s = sim(id); if (!s || !s.household || seen.has(s.household)) continue; seen.add(s.household);
      const mem = st.picked.filter(x => sim(x) && sim(x).household === s.household).map(x => first(nameOf(x))), home = GFB.homeOf(s, data);
      const where = home ? [home.address, home.world].filter(Boolean).join(", ") : "", kind = home ? [home.lot_type, home.bed_bath].filter(Boolean).join(", ") : "";
      out.push(`${s.household} (${mem.join(", ")}): ${home ? where + (kind ? ". " + kind : "") : "no home yet"}`);
    }
    const bank = b => ({ harbor:"Harbor Trust", porchlight:"Porchlight" }[b] || (b ? b[0].toUpperCase() + b.slice(1) : "Bank")), money$ = n => "§" + Number(n || 0).toLocaleString("en-US");
    for (const id of st.picked) {
      const accts = (data.accounts || []).filter(a => a.holder_sim === id && a.status !== "Closed"); if (!accts.length) continue;
      const parts = accts.map(a => `${/main checking/i.test(a.type) ? "checking" : String(a.type).toLowerCase()} ${money$(a.balance)}`), notes = accts.map(a => String(a.staff_notes || "").trim()).filter(Boolean);
      out.push(`${first(nameOf(id))}: ${bank(accts[0].bank)} ${parts.join(", ")}${notes.length ? `. Bank note: ${notes.join(" ").toLowerCase().replace(/\.\s+/g, ", ").replace(/\.$/, "").replace(/flag as (a )?/, "flagged as a ")}` : ""}`);
    }
    return out.join("\n");
  }
  function notes() {
    const set = new Set(st.picked), since = sinceOf("notes"), names = st.picked.map(id => nameOf(id)), out = [];
    const re = names.map(n => new RegExp("@" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9])", "i"));
    const list = (data.notes || []).filter(n => !n.trashed && (n.body || n.title) && (n.updated || n.created || 0) >= since
      && ((n.story && (n.story.sims || []).some(id => set.has(id))) || re.some(r => r.test((n.title || "") + "\n" + (n.body || "")))));
    list.sort((a, b) => (a.created || 0) - (b.created || 0)).forEach(n => {
      const sims = n.story ? (n.story.sims || []).map(id => first(nameOf(id))).join(", ") : "";
      out.push(`${n.title || "Untitled"}${n.story ? ` (story: ${sims} · ${n.story.status || "Simmering"})` : ""}`);
      const body = String(n.body || "").replace(/\n{2,}/g, "\n").trim(); if (body) out.push(body);
    });
    return out.join("\n");
  }
  const SECTIONS = { links:["Connections", links], messages:["Messages", messages], simsta:["Simsta", simsta], money:["Money and home", money], notes:["Notes", notes] };
  function build() {
    const parts = {}, texts = [];
    const head = `# SimDesk share: ${st.picked.map(nameOf).join(", ")}\nGame date: ${label(todayGame())}`;
    if (st.boxes.basics) parts.basics = basics();
    for (const k of Object.keys(SECTIONS)) if (st.boxes[k]) { try { parts[k] = SECTIONS[k][1](); } catch { parts[k] = ""; } }
    texts.push(head);
    if (parts.basics) texts.push(parts.basics);
    for (const k of Object.keys(SECTIONS)) if (parts[k]) {
      const since = SECTIONS[k][0] === "Messages" || SECTIONS[k][0] === "Simsta" ? ` (since ${label(sinceOf(k))})` : k === "notes" ? ` (since ${realDay(sinceOf("notes"))})` : "";
      texts.push(`## ${SECTIONS[k][0]}${since}\n${parts[k]}`);
    }
    const text = texts.join("\n"), counts = {}; for (const k of Object.keys(parts)) counts[k] = words(parts[k]);
    return { text, counts, total:words(text), parts };
  }

  /* ---------- the sheet ---------- */
  const IC = { share:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 4.5 8 1.5l3 3"/><path d="M4 7H3v7.5h10V7h-1"/></svg>',
    dl:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9M4.5 7.5 8 11l3.5-3.5"/><path d="M2.5 13.5h11"/></svg>',
    cp:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="8.5" height="9" rx="1.5"/><path d="M3 11V3.5C3 2.7 3.7 2 4.5 2H10"/></svg>' };
  const av = id => { const s = sim(id); const p = s && (s.portrait || s.photo || s.image); return p ? `<img src="${esc(p)}" alt="">` : `<span class="sh-ini">${esc(clean(s ? s.name : id).split(" ").map(w => w[0]).slice(0, 2).join(""))}</span>`; };
  function sinceChip(key, kind) {
    const v = sinceOf(key);
    if (kind === "real") return `<label class="sh-since">${esc(realDay(v))} ▾<input type="date" data-sh-date="${key}" value="${isoOf(v)}" aria-label="Notes since"></label>`;
    const cal = data.calendar;
    return `<span class="sh-since gm">${UI.gameDate("shs_" + key, v, cal)}</span>`;
  }
  function meter(total, counts) {
    const lvl = total < 500 ? ["light", "Light"] : total <= 1000 ? ["med", "Medium"] : ["heavy", "Heavy"];
    let hint = ""; if (total > 1000) { const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]; if (top) { const nm = top[0] === "basics" ? "Registry basics" : SECTIONS[top[0]][0]; hint = `<div class="sh-hint"><b>${nm} is adding ${top[1].toLocaleString()} words.</b> ${["messages", "simsta", "notes"].includes(top[0]) ? "Try a later date, or uncheck it." : "Try unchecking it."}</div>`; } }
    return `<div class="sh-meter"><div class="top"><span class="num">${total.toLocaleString()}<small>words</small></span><span class="sh-badge ${lvl[0]}"><i></i>${lvl[1]}</span></div>
      <div class="bar"><span class="${lvl[0]}" style="width:${Math.min(100, Math.round(total / 1300 * 100))}%"></span></div><div class="ticks"><span>0</span><span>500</span><span>1,000</span><span>1,300+</span></div>${hint}</div>`;
  }
  function pickList() {
    const q = st.q.trim().toLowerCase(), have = new Set(st.picked), res = data.sims.filter(s => !have.has(s.id) && (!q || clean(s.name).toLowerCase().includes(q) || String(s.simsta || "").toLowerCase().includes(q)));
    let tied = [];
    if (!q) {
      const hh = new Set(st.picked.map(id => sim(id) && sim(id).household).filter(Boolean)), lk = GFB.registry.all();
      tied = res.map(s => { const link = lk.find(l => (l.a_sim === s.id && have.has(l.b_sim)) || (l.b_sim === s.id && have.has(l.a_sim)));
        const why = s.household && hh.has(s.household) ? `Same household as ${first(nameOf(st.picked.find(id => sim(id) && sim(id).household === s.household)))}` : link ? `Linked in the Registry with ${first(nameOf(link.a_sim === s.id ? link.b_sim : link.a_sim))}` : "";
        return why ? { s, why } : null; }).filter(Boolean).slice(0, 8);
    }
    const row = (s, why) => `<button type="button" class="sh-pr" data-sh-add="${s.id}"><span class="sh-av">${av(s.id)}</span><span><b>${esc(clean(s.name))}</b><small>${esc(why || `GFB-${s.file_no || ""}`)}</small></span><span class="sh-addbtn">Add</span></button>`;
    return `<div class="sh-pick"><input class="sh-q" placeholder="Search all ${data.sims.length} Sims" value="${esc(st.q)}" aria-label="Search Sims" autocomplete="off">
      ${tied.length ? `<h5>Tied to ${st.picked.map(id => first(nameOf(id))).slice(0, 3).join(", ")}</h5>${tied.map(t => row(t.s, t.why)).join("")}` : ""}
      ${(q ? res : []).slice(0, 12).map(s => row(s)).join("") || (q ? '<p class="sh-none">No match.</p>' : "")}</div>`;
  }
  function html(b) {
    const chips = st.picked.map(id => `<span class="sh-chip"><span class="sh-av">${av(id)}</span>${esc(clean(nameOf(id)))}<button type="button" data-sh-rm="${id}" aria-label="Remove ${esc(nameOf(id))}">×</button></span>`).join("");
    const rows = BOXES.map(x => { const n = b.counts[x.key]; return `<div class="sh-row"><button type="button" class="sh-cb ${st.boxes[x.key] ? "on" : ""}" role="checkbox" aria-checked="${!!st.boxes[x.key]}" data-sh-box="${x.key}" aria-label="${esc(x.name)}"></button>
      <div><b>${x.name}</b><small>${x.sub}${x.since ? " " + sinceChip(x.key, x.since) : ""}</small>${x.key === "links" ? `<button type="button" class="sh-sw ${st.allLinks ? "on" : ""}" role="switch" aria-checked="${st.allLinks}" data-sh-all><i></i>All their links</button>` : ""}</div>
      <span class="sh-wc ${n > 400 ? "big" : ""}">${st.boxes[x.key] ? (n ? n.toLocaleString() + " words" : "Nothing yet") : ""}</span></div>`; }).join("");
    return `<div class="sh-scrim" data-sh-close></div><div class="sh-sheet" role="dialog" aria-modal="true" aria-label="Share">
      <div class="sh-top"><h2>Share</h2><small>For pasting into Claude</small><button type="button" class="sh-x" data-sh-close>Done</button></div>
      <div class="sh-body"><div class="sh-left">
        <div class="sh-sec"><h4>Sims in this scene</h4><div class="sh-chips">${chips}<button type="button" class="sh-chip add" data-sh-pick>+ Add Sim</button></div>${st.picking ? pickList() : ""}</div>
        <div class="sh-sec"><h4>Include</h4><div class="sh-box">${st.picked.length ? rows : '<p class="sh-none">Add a Sim to start.</p>'}</div></div>
        ${meter(b.total, b.counts)}
        <div class="sh-acts"><button type="button" class="sh-btn" data-sh-save ${st.picked.length ? "" : "disabled"}>${IC.dl}Save .md</button><button type="button" class="sh-btn go" data-sh-copy ${st.picked.length ? "" : "disabled"}>${IC.cp}Copy</button></div>
        <div class="sh-memo" role="status">${esc(st.msg) || "↺ Your boxes and dates are kept for next time."}</div></div>
      <div class="sh-right"><div class="sh-pvh"><h4>Preview</h4><small>Exactly what gets copied</small></div><pre class="sh-out" id="sh-out">${st.picked.length ? esc(b.text).replace(/^(#{1,2} .*)$/gm, '<span class="h">$1</span>') : "Pick a Sim to see the preview."}</pre></div></div></div>`;
  }
  function draw() {
    if (!layer) return;
    const keep = layer.querySelector(".sh-q"), focus = keep && document.activeElement === keep, pos = keep ? keep.selectionStart : 0, sc = layer.querySelector(".sh-sheet");
    const top = sc ? sc.scrollTop : 0, lt = layer.querySelector(".sh-left") ? layer.querySelector(".sh-left").scrollTop : 0;
    layer.innerHTML = html(st.picked.length ? build() : { text:"", counts:{}, total:0 });
    const l = layer.querySelector(".sh-left"); if (l) l.scrollTop = lt; const sh = layer.querySelector(".sh-sheet"); if (sh) sh.scrollTop = top;
    if (focus) { const q = layer.querySelector(".sh-q"); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  }
  const persist = () => { try { GFB.saveSetting("share", { boxes:st.boxes, since:st.since, allLinks:st.allLinks }); } catch {} };

  async function prepick() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean), out = [];
    if (parts[0] === "registry" && parts[1] && sim(parts[1])) out.push(parts[1]);
    if (parts[0] === "messages") { try { if (parts[1] === "t") { const t = GFB.messages.threads().find(x => x.id === parts[2]); if (t) out.push(...t.sim_ids.filter(sim)); } else if (parts[1] === "sim" && sim(parts[2])) out.push(parts[2]); } catch {} }
    return out;
  }
  async function open() {
    if (st.open) return close();
    data = await GFB.getAll();
    try { if (GFB.messages.ready() && !GFB.messages.isLoaded()) await GFB.messages.refresh(); } catch {}
    try { if (GFB.simsta.ready() && !GFB.simsta.isLoaded()) await GFB.simsta.refresh(); } catch {}
    const saved = (data.settings || {}).share || {};
    st.boxes = { basics:true, links:true, messages:true, simsta:true, money:true, notes:true, ...(saved.boxes || {}) };
    st.since = { ...(saved.since || {}) }; st.allLinks = !!saved.allLinks;
    const pre = await prepick(); if (pre.length || !st.picked.length) st.picked = pre;
    st.picking = false; st.q = ""; st.msg = ""; st.open = true;
    layer = document.createElement("div"); layer.className = "sh-layer"; document.body.appendChild(layer);
    document.documentElement.classList.add("sh-lock"); document.getElementById("mbShare")?.classList.add("on"); document.getElementById("mbShare")?.setAttribute("aria-pressed", "true");
    draw(); layer.querySelector(".sh-x")?.focus();
  }
  function close() {
    st.open = false; layer?.remove(); layer = null; document.documentElement.classList.remove("sh-lock");
    const b = document.getElementById("mbShare"); b?.classList.remove("on"); b?.setAttribute("aria-pressed", "false"); b?.focus();
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {}
    const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); return ok;
  }
  const slug = () => `share-${st.picked.map(id => first(nameOf(id)).toLowerCase().replace(/[^a-z0-9]+/g, "")).join("-")}-${label(todayGame()).toLowerCase().replace(/, day /, "-").replace(/, year /, "-y").replace(/[^a-z0-9-]+/g, "")}.md`;

  function bind() {
    if (mounted) return; mounted = true;
    document.addEventListener("click", async e => {
      const t = e.target; if (t.closest("#mbShare")) { e.preventDefault(); return open(); }
      if (!layer || !layer.contains(t)) return;
      if (t.closest("[data-sh-close]")) return close();
      const rm = t.closest("[data-sh-rm]"); if (rm) { st.picked = st.picked.filter(x => x !== rm.dataset.shRm); return draw(); }
      if (t.closest("[data-sh-pick]")) { st.picking = !st.picking; st.q = ""; draw(); layer.querySelector(".sh-q")?.focus(); return; }
      const ad = t.closest("[data-sh-add]"); if (ad) { st.picked.push(ad.dataset.shAdd); st.q = ""; st.picking = false; return draw(); }
      const bx = t.closest("[data-sh-box]"); if (bx) { st.boxes[bx.dataset.shBox] = !st.boxes[bx.dataset.shBox]; persist(); return draw(); }
      if (t.closest("[data-sh-all]")) { st.allLinks = !st.allLinks; persist(); return draw(); }
      if (t.closest("[data-sh-copy]")) { const ok = await copyText(build().text); st.msg = ok ? "Copied. Paste it into Claude." : "Couldn't copy here. Use Save .md instead."; return draw(); }
      if (t.closest("[data-sh-save]")) {
        const blob = new Blob([build().text + "\n"], { type:"text/markdown" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = slug(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        st.msg = "Saved " + slug(); return draw();
      }
    });
    document.addEventListener("input", e => {
      if (!layer || !layer.contains(e.target)) return;
      if (e.target.classList.contains("sh-q")) { st.q = e.target.value; draw(); }
    });
    document.addEventListener("change", e => {
      if (!layer || !layer.contains(e.target)) return;
      const n = e.target.name || "";
      if (e.target.dataset.shDate) { const v = e.target.value; if (v) { st.since.notes = new Date(v + "T00:00:00").getTime(); persist(); draw(); } return; }
      const m = n.match(/^shs_(messages|simsta)_(season|day|year)$/);
      if (m) { const f = new FormData(); const cur = { ...sinceOf(m[1]) }; cur[m[2]] = m[2] === "season" ? e.target.value : Math.max(1, Math.min(m[2] === "day" ? 21 : 9999, parseInt(e.target.value, 10) || 1)); st.since[m[1]] = cur; persist(); draw(); }
    });
    document.addEventListener("keydown", e => { if (st.open && e.key === "Escape") { e.stopImmediatePropagation(); close(); } }, true);
  }
  bind();
  return { open, close, build, state:st, isOpen:() => st.open };
})();
