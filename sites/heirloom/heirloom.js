/* Heirloom: in-world it's a family history and DNA kit app; underneath it's the family tree built from the Registry's parent links.
   Opens on one Sim as "You". It reads GFB.registry (parent links: Biological, Adoptive, Raised them, Secret; sibling and spouse links) and writes only
   settings.heirloom ({ unconfirmed:[link ids], dna:{ link id: { result, date } } }) plus one timeline entry on the link when a DNA kit runs.
   Half and step siblings are worked out from the parents, never picked. No "who knows" tracking. Opens with secrets shown; the eye hides them. */
const Heirloom = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => stripNick(n).split(" ")[0];
  const initials = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const low = s => String(s || "").trim().toLowerCase();
  const slug = n => stripNick(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const CW = 176, CH = 64, GAP = 14, ROW = 168, TOP = 36, EDGE = 12;
  const LAST_KEY = "heirloom-last-v1";
  const LEAF = (s, c, v) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M4 20c0-9 5-15 16-16 0 11-6 16-14 16" fill="${c}"/><path d="M4 20c3-6 7-9 11-11" stroke="${v}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
  const EYE = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7S18.5 19 12 19 1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  const EYEOFF = EYE.replace("</svg>", `<path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`);
  const CHEV = `<span class="hl-chev" aria-hidden="true">&#8250;</span>`;

  /* household colors: a few are pinned so they match the approved screens; the rest follow the household's place in the save so a color never moves */
  const PIN = { "hh-navarro":"#7B5EA7", "hh-priestley":"#1F7A7A", "hh-vaughn":"#AE5A2E", "hh-jamar-priestley":"#5B6770" };
  const PAL = ["#2F6B8A","#8A4F7D","#5E7024","#B04A6A","#4B5D9E","#8C6A1E","#3E7C5A","#9A5B2E","#6A5A8C","#A0485A"];
  const NONE = "#8A8372";

  let data = null, root = null, youId = null, wide = null;
  const st = { hide:false, view:"tree", just:null, kit:null };

  const simOf = id => data.sims.find(s => s.id === id) || null;
  const settings = () => (data.settings || {}).heirloom || {};
  const unconfirmed = () => new Set(settings().unconfirmed || []);
  const dnaOf = id => (settings().dna || {})[id] || null;
  const R = () => GFB.registry;
  const gdate = () => UI.gameToday(data.calendar);
  const hhKey = s => s && (s.household_id || (s.household ? "n:" + low(s.household) : null));
  const hhName = s => { const k = hhKey(s); if (!k) return ""; const h = (data.households || []).find(x => x.id === k); return h ? h.name : (s.household || ""); };
  const hhColor = s => { const k = hhKey(s); if (!k) return NONE; if (PIN[k]) return PIN[k]; const i = (data.households || []).findIndex(h => h.id === k); return PAL[(i >= 0 ? i : hash(k)) % PAL.length]; };
  const pic = s => s && (s.portrait || s.simsta_avatar || s.headshot) || null;
  const age = s => (s && s.age != null && s.age !== "") ? String(s.age) : "";
  const gen = s => /^f/i.test(s && s.gender || "") ? "f" : /^m/i.test(s && s.gender || "") ? "m" : "n";
  const pick = (g, f, m, n) => g === "f" ? f : g === "m" ? m : n;

  /* a link's state: ok (solid), unc (dashed, waiting), dna (confirmed with the kit) */
  function stateOf(l) { const d = dnaOf(l.id); if (d && d.result === true) return "dna"; return unconfirmed().has(l.id) ? "unc" : "ok"; }

  /* ---------- the model: who is on this Sim's tree and how they connect ---------- */
  function build(you, hideSecrets) {
    const ids = new Set(data.sims.map(s => s.id));
    const L = R().all().filter(l => l.a_sim && l.b_sim && l.a_sim !== l.b_sim && ids.has(l.a_sim) && ids.has(l.b_sim));
    const vis = L.filter(l => !(hideSecrets && l.secret));
    const par = vis.filter(l => l.kind === "fam" && l.family === "parent");           /* a_sim is the parent, b_sim the child */
    const sibL = vis.filter(l => l.kind === "fam" && l.family === "sibling");
    const spouseL = vis.filter(l => l.kind === "rom" && /spouse|husband|wife|married/i.test((l.a_label || "") + " " + (l.b_label || "")));
    const parentsOf = id => par.filter(l => l.b_sim === id), childrenOf = id => par.filter(l => l.a_sim === id);
    const nodes = new Map(), edges = [], seenEdge = new Set();
    const add = (id, g, x) => { if (!nodes.has(id)) nodes.set(id, { id, g, ...x }); return nodes.get(id); };
    const edge = (l, from, to, type) => { const k = (l ? l.id : "") + from + to + type; if (seenEdge.has(k)) return; seenEdge.add(k); edges.push({ link:l, from, to, type }); };
    add(you, 0, { role:"you" });
    /* ancestors, up to three generations */
    let layer = [you];
    for (let d = 1; d <= 3 && layer.length; d++) {
      const next = [];
      layer.forEach(cid => parentsOf(cid).forEach(l => { add(l.a_sim, -d, { role:"anc", depth:d, link:l, to:cid }); edge(l, l.a_sim, cid, "parent"); if (!next.includes(l.a_sim)) next.push(l.a_sim); }));
      layer = next;
    }
    /* siblings from shared parents: full if the parents on file match exactly, half if some are shared and some are not */
    const mine = parentsOf(you).map(l => l.a_sim), mineSet = new Set(mine);
    const cand = new Map();
    mine.forEach(p => childrenOf(p).forEach(l => { if (l.b_sim !== you) { if (!cand.has(l.b_sim)) cand.set(l.b_sim, []); cand.get(l.b_sim).push(l); } }));
    cand.forEach((ls, c) => {
      const theirs = new Set(parentsOf(c).map(l => l.a_sim));
      const full = [...theirs].every(p => mineSet.has(p)) && [...mineSet].every(p => theirs.has(p));
      add(c, 0, { role:"sib", sib:full ? "full" : "half", shared:[...theirs].filter(p => mineSet.has(p)) });
      ls.forEach(l => edge(l, l.a_sim, c, "parent"));
    });
    /* siblings the Registry only names (no parents on file for them): joined to You with a tie */
    sibL.filter(l => l.a_sim === you || l.b_sim === you).forEach(l => {
      const o = l.a_sim === you ? l.b_sim : l.a_sim; if (nodes.has(o)) return;
      add(o, 0, { role:"sib", sib:/half/i.test((l.a_label || "") + (l.b_label || "")) ? "half" : "full", shared:[], tie:true, link:l }); edge(l, you, o, "tie");
    });
    /* step siblings: children of a parent's spouse, when that spouse is not also your parent */
    mine.forEach(p => spouseL.filter(l => l.a_sim === p || l.b_sim === p).forEach(sl => {
      const sp = sl.a_sim === p ? sl.b_sim : sl.a_sim; if (mineSet.has(sp)) return;
      childrenOf(sp).forEach(cl => { const c = cl.b_sim; if (c === you || nodes.has(c) || parentsOf(c).some(x => mineSet.has(x.a_sim))) return;
        add(c, 0, { role:"sib", sib:"step", shared:[], via:p }); edge(null, p, c, "step"); });
    }));
    /* children */
    childrenOf(you).forEach(l => { add(l.b_sim, 1, { role:"child", link:l, to:you }); edge(l, you, l.b_sim, "parent"); });
    /* wording, as seen from You */
    nodes.forEach(n => {
      const s = simOf(n.id), g = gen(s);
      if (n.role === "you") n.rel = "You";
      else if (n.role === "anc") {
        const l = n.link;
        if (n.depth === 1) n.rel = l.biological === false ? (l.adoptive ? "Adoptive " + pick(g, "mother", "father", "parent") : "Raised you") : pick(g, "Mother", "Father", "Parent");
        else n.rel = (n.depth === 3 ? "Great-" : "") + pick(g, n.depth === 3 ? "grandmother" : "Grandmother", n.depth === 3 ? "grandfather" : "Grandfather", n.depth === 3 ? "grandparent" : "Grandparent");
      } else if (n.role === "child") n.rel = pick(g, "Daughter", "Son", "Child");
      else { const b = pick(g, "sister", "brother", "sibling"); n.rel = n.sib === "full" ? b[0].toUpperCase() + b.slice(1) : n.sib === "half" ? "Half " + b : "Step " + b; }
    });
    return { you, nodes, edges, secretEdges:edges.filter(e => e.link && e.link.secret).length, parentsOf, childrenOf };
  }

  /* ---------- layout: rows by generation, parents centered over their children ---------- */
  function layout(M) {
    const byG = new Map(); M.nodes.forEach(n => { if (!byG.has(n.g)) byG.set(n.g, []); byG.get(n.g).push(n); });
    const gs = [...byG.keys()].sort((a, b) => a - b), minG = gs[0], maxG = gs[gs.length - 1];
    const nm = n => stripNick((simOf(n.id) || {}).name);
    const you = M.nodes.get(M.you), r0 = [you];
    const rank = n => ({ full:0, half:1, step:2 }[n.sib]);
    byG.get(0).filter(n => n !== you).sort((a, b) => rank(a) - rank(b) || (a.tie ? 1 : 0) - (b.tie ? 1 : 0) || nm(a).localeCompare(nm(b))).forEach(n => r0.push(n));
    r0.forEach((n, i) => { n.x = i * (CW + GAP); });
    const center = n => n.x + CW / 2;
    for (let g = -1; g >= minG; g--) {
      const row = (byG.get(g) || []).map(n => { const kids = M.edges.filter(e => e.type === "parent" && e.from === n.id && M.nodes.get(e.to) && M.nodes.get(e.to).g === g + 1 && M.nodes.get(e.to).x != null).map(e => center(M.nodes.get(e.to)));
        return { n, ideal:kids.length ? kids.reduce((a, b) => a + b, 0) / kids.length : 0 }; }).sort((a, b) => a.ideal - b.ideal || nm(a.n).localeCompare(nm(b.n)));
      let right = -1e9; row.forEach(r => { r.n.x = Math.max(r.ideal - CW / 2, right + GAP); right = r.n.x + CW; });
    }
    const kids = (byG.get(1) || []).sort((a, b) => nm(a).localeCompare(nm(b)));
    if (kids.length) { const span = kids.length * CW + (kids.length - 1) * GAP, x0 = center(you) - span / 2; kids.forEach((n, i) => { n.x = x0 + i * (CW + GAP); }); }
    const minX = Math.min(...[...M.nodes.values()].map(n => n.x));
    M.nodes.forEach(n => { n.x = Math.round(n.x - minX + EDGE); n.y = TOP + (n.g - minG) * ROW; });
    M.W = Math.max(...[...M.nodes.values()].map(n => n.x + CW)) + EDGE;
    M.H = TOP + (maxG - minG) * ROW + CH + 30;
    M.minG = minG; M.maxG = maxG;
    return M;
  }

  /* ---------- hints and households ---------- */
  function hints(M) {
    const out = [], onTree = new Set(M.nodes.keys());
    const names = [...M.nodes.values()].map(n => ({ n, s:simOf(n.id) })).filter(x => x.s);
    const parts = nm => stripNick(nm).split(" ").slice(1).join(" ").toLowerCase().split(/[\s-]+/).filter(Boolean);
    const linked = new Set(); R().all().forEach(l => { if (l.kind === "fam" && l.a_sim && l.b_sim && (onTree.has(l.a_sim) || onTree.has(l.b_sim))) { linked.add(l.a_sim); linked.add(l.b_sim); } });
    const seen = new Set();
    data.sims.forEach(s => {
      if (onTree.has(s.id) || linked.has(s.id)) return;
      const mine = parts(s.name), match = names.filter(x => parts(x.s.name).some(p => mine.includes(p)));
      if (!mine.length || !match.length || seen.has(s.id)) return; seen.add(s.id);
      const who = match.slice(0, 2).map(x => first(x.s.name)); const more = match.length > 2 ? " and others" : "";
      out.push({ kind:"name", id:s.id, title:`${stripNick(s.name)}${age(s) ? ", " + age(s) : ""}`, sub:`Same last name as ${who.join(" and ")}${more}. Not linked yet.` });
    });
    out.sort((a, b) => a.title.localeCompare(b.title));
    M.edges.filter(e => e.link && e.type === "parent" && stateOf(e.link) === "unc").forEach(e => {
      const a = simOf(e.from), b = simOf(e.to); out.push({ kind:"link", id:e.from, link:e.link.id, title:`${first(a.name)} and ${first(b.name)}`, sub:"Link waiting to be confirmed." }); });
    return out.sort((a, b) => (a.kind === "link" ? 0 : 1) - (b.kind === "link" ? 0 : 1)).slice(0, 8);
  }
  function households(M) {
    const g = new Map();
    M.nodes.forEach(n => { const s = simOf(n.id), k = hhKey(s); if (!k) return; if (!g.has(k)) g.set(k, { name:hhName(s), color:hhColor(s), who:[] }); g.get(k).who.push(first(s.name)); });
    return [...g.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ---------- drawing pieces ---------- */
  const avatar = (s, big) => { const c = hhColor(s), p = pic(s);
    return p ? `<span class="hl-av ${big ? "lg" : ""}" style="box-shadow:0 0 0 3px ${c}"><img src="${esc(p)}" alt=""></span>` : `<span class="hl-av ${big ? "lg" : ""}" style="background:${c}" aria-hidden="true">${esc(initials(s.name))}</span>`; };
  function cardHTML(M, n, pos) {
    const s = simOf(n.id), secret = n.link && n.link.secret, you = n.role === "you";
    const sub = n.rel + (age(s) ? ", " + age(s) : "");
    const style = pos ? `style="left:${n.x}px;top:${n.y}px;width:${CW}px"` : "";
    return `<button type="button" class="hl-pc ${you ? "you" : ""} ${secret ? "secret" : ""} ${st.sel === n.id ? "sel" : ""}" ${style} data-sim="${n.id}" aria-label="${esc(stripNick(s.name))}, ${esc(sub)}${secret ? ", secret" : ""}">${avatar(s)}<span class="tx"><b>${esc(stripNick(s.name))}</b><small>${esc(sub)}</small></span>${secret ? `<i class="hl-stamp">SECRET</i>` : ""}</button>`;
  }
  function edgeSVG(M) {
    const paths = [], marks = [], ties = [];
    M.edges.forEach(e => {
      const a = M.nodes.get(e.from), b = M.nodes.get(e.to); if (!a || !b) return;
      if (e.type === "tie") { const x1 = a.x + CW / 2, x2 = b.x + CW / 2, y = a.y + CH; ties.push(`<path class="hl-ln tie" d="M${x1} ${y} v12 H${x2} v-12"/>`); return; }
      const x1 = a.x + CW / 2, y1 = a.y + CH, x2 = b.x + CW / 2, y2 = b.y, ym = (y1 + y2) / 2;
      const secret = e.link && e.link.secret, s = e.link ? stateOf(e.link) : "step";
      const cls = e.type === "step" ? "step" : secret ? "sec" : s === "unc" ? "unc" : "";
      const just = e.link && st.just === e.link.id ? " just" : "";
      paths.push(`<path class="hl-ln ${cls}${just}" d="M${x1} ${y1} C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}"/>`);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 8 + 6 * ym / 8;
      if (secret) marks.push(`<i class="hl-stamp mid" style="left:${mx - 30}px;top:${my - 10}px">SECRET</i>`);
      else if (s === "unc") marks.push(`<button type="button" class="hl-qm" data-sim="${e.from}" style="left:${mx - 22}px;top:${my - 22}px" aria-label="Unconfirmed link, open details"><span>?</span></button>`);
      else if (s === "dna") marks.push(`<span class="hl-badge${just}" style="left:${mx - 12}px;top:${my - 12}px" role="img" aria-label="Confirmed with DNA kit">${LEAF(14, "#F5F0E6", "#2F6B47")}</span>`);
    });
    return `<svg class="hl-lines" width="${M.W}" height="${M.H}" viewBox="0 0 ${M.W} ${M.H}" aria-hidden="true">${paths.join("")}${ties.join("")}</svg>${marks.join("")}`;
  }
  function treeIPad(M) {
    const gl = M.minG < 0 ? `<span class="hl-gen" style="left:${EDGE}px;top:8px">${M.minG === -1 ? "Parents" : "Parents and grandparents"}</span>` : "";
    const note = st.hide && st.hidden > 0 ? `<div class="hl-note">${st.hidden} secret ${st.hidden === 1 ? "branch" : "branches"} hidden</div>` : "";
    return `<div class="hl-treewrap"><div class="hl-canvas" style="width:${M.W}px;height:${M.H}px">${gl}${edgeSVG(M)}${[...M.nodes.values()].map(n => cardHTML(M, n, true)).join("")}</div></div>${note}`;
  }
  const rowHTML = (n, M, extra) => { const s = simOf(n.id); return `<button type="button" class="hl-row" data-sim="${n.id}">${avatar(s)}<span class="rt"><b>${esc(stripNick(s.name))}${n.link && n.link.secret ? ` <i class="hl-stamp">SECRET</i>` : ""}</b><small>${esc(n.rel + (age(s) ? ", " + age(s) : "") + (extra || ""))}</small></span>${CHEV}</button>`; };
  function treePhone(M) {
    const you = M.nodes.get(M.you), ps = [...M.nodes.values()].filter(n => n.role === "anc" && n.depth === 1).slice(0, 2);
    const W = 358, cw = 172;
    const px = i => i === 0 ? 0 : W - cw, cx = i => px(i) + cw / 2;
    const lines = ps.map((p, i) => { const e = M.edges.find(x => x.type === "parent" && x.from === p.id && x.to === M.you); const secret = e.link.secret, s = stateOf(e.link);
      const cls = secret ? "sec" : s === "unc" ? "unc" : "", just = st.just === e.link.id ? " just" : "";
      const mx = (cx(i) + cw / 2) / 2, my = 36;
      return { d:`M${cx(i)} 0 C${cx(i)} 32 ${cw / 2} 32 ${cw / 2} 64`, cls:cls + just, mark:secret ? `<i class="hl-stamp mid" style="left:${mx - 30 + (i ? 20 : 0)}px;top:${my - 10}px">SECRET</i>` : s === "unc" ? `<button type="button" class="hl-qm" data-sim="${p.id}" style="left:${mx + (i ? 20 : 0) - 22}px;top:${my - 22}px" aria-label="Unconfirmed link, open details"><span>?</span></button>` : s === "dna" ? `<span class="hl-badge${just}" style="left:${mx + (i ? 20 : 0) - 12}px;top:${my - 12}px">${LEAF(14, "#F5F0E6", "#2F6B47")}</span>` : "" }; });
    const card = n => cardHTML(M, n, false);
    return `<div class="hl-ptree">
      ${ps.length ? `<div class="hl-gen">Parents</div><div class="hl-prow">${ps.map(card).join("")}</div>
      <div class="hl-pl"><svg width="${W}" height="64" viewBox="0 0 ${W} 64" aria-hidden="true">${lines.map(l => `<path class="hl-ln ${l.cls}" d="${l.d}"/>`).join("")}</svg>${lines.map(l => l.mark).join("")}</div>` : ""}
      <div class="hl-gen">You</div><div class="hl-prow">${card(you)}</div></div>`;
  }
  function listSections(M) {
    const all = [...M.nodes.values()], of = fn => all.filter(fn);
    const sibs = of(n => n.role === "sib"), kids = of(n => n.role === "child");
    const gp = of(n => n.role === "anc" && n.depth > 1).sort((a, b) => a.depth - b.depth);
    const extraP = of(n => n.role === "anc" && n.depth === 1).slice(2);
    const sec = (title, list, fn) => list.length ? `<div class="hl-sh">${title}</div><div class="hl-grp">${list.map(fn).join("")}</div>` : "";
    const via = n => n.sib === "half" && n.shared.length ? " · shares " + n.shared.map(id => first(simOf(id).name)).join(" and ") : n.sib === "step" ? " · through " + first(simOf(n.via).name) : "";
    return sec("More parents", extraP, n => rowHTML(n, M)) + sec("Grandparents", gp, n => rowHTML(n, M)) + sec("Siblings", sibs, n => rowHTML(n, M, via(n))) + sec("Children", kids, n => rowHTML(n, M));
  }
  function hintsHTML(list) {
    if (!list.length) return `<div class="hl-grp"><div class="hl-empty">Nothing to follow up. Everyone with a matching last name is linked.</div></div>`;
    return `<div class="hl-grp">${list.map(h => h.kind === "name"
      ? `<a class="hl-row" href="#/registry/${h.id}"><span class="hl-ic leaf">${LEAF(18, "#2F6B47", "#E1EDE4")}</span><span class="rt"><b>${esc(h.title)}</b><small>${esc(h.sub)}</small></span>${CHEV}</a>`
      : `<button type="button" class="hl-row" data-sim="${h.id}"><span class="hl-ic q">?</span><span class="rt"><b>${esc(h.title)}</b><small>${esc(h.sub)}</small></span>${CHEV}</button>`).join("")}</div>`;
  }
  const householdsHTML = list => list.length ? `<div class="hl-grp">${list.map(h => `<div class="hl-row s"><span class="hl-dot" style="background:${h.color}"></span><span class="rt"><b>${esc(h.name)}</b></span><small class="val">${esc(h.who.slice(0, 3).join(", ") + (h.who.length > 3 ? " +" + (h.who.length - 3) : ""))}</small></div>`).join("")}</div>` : `<div class="hl-grp"><div class="hl-empty">Nobody on this tree has a household yet.</div></div>`;

  /* ---------- the page ---------- */
  function pickDefault() {
    let last = null; try { last = localStorage.getItem(LAST_KEY); } catch {}
    if (last && simOf(last)) return last;
    const cnt = new Map(); R().all().filter(l => l.kind === "fam" && l.family === "parent").forEach(l => { cnt.set(l.a_sim, (cnt.get(l.a_sim) || 0) + 1); cnt.set(l.b_sim, (cnt.get(l.b_sim) || 0) + 1); });
    const best = [...cnt].filter(([id]) => simOf(id)).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : (data.sims[0] && data.sims[0].id);
  }
  function draw() {
    if (!root) return;
    const you = simOf(youId); if (!you) { root.innerHTML = `<div class="site-heirloom"><div class="hl-pad"><h1>Heirloom</h1><p class="hl-subt">Add a Sim in the Registry to start a tree.</p></div></div>`; return; }
    const full = build(youId, false), M = layout(st.hide ? build(youId, true) : full);
    st.hidden = st.hide ? Math.max(0, full.secretEdges - M.secretEdges) : 0; st.M = M;
    const alone = M.nodes.size === 1, hs = hints(M), hh = households(M), phone = !wide.matches;
    const bar = `<div class="hl-bar"><span class="hl-logo">${LEAF(phone ? 24 : 26, "#2F6B47", "#FFFDF8")}<b>Heirloom</b></span><span class="sp"></span>
      <button type="button" class="hl-eye ${st.hide ? "on" : ""}" data-eye aria-pressed="${st.hide}" aria-label="${st.hide ? "Show secrets" : "Hide secrets"}">${st.hide ? EYEOFF : EYE}${phone ? "" : `<span>${st.hide ? "Show secrets" : "Hide secrets"}</span>`}</button></div>`;
    const head = `<div class="hl-head"><div><h1>${esc(stripNick(you.name))}</h1><p class="hl-subt">Family tree · you are viewing as ${esc(first(you.name))}</p></div>${phone ? "" : `<button type="button" class="hl-btn tint" data-switch>Switch Sim</button>`}</div>`;
    const empty = `<div class="hl-grp hl-emptycard"><div class="hl-empty"><b>No family on file for ${esc(first(you.name))} yet.</b><span>Add parents, children or siblings in their Registry file and they show up here.</span></div><a class="hl-btn pri" href="#/registry/${you.id}">Open file in Registry</a></div>`;
    const keyH = `<div class="hl-key"><span><i class="k"></i>Confirmed</span><span><i class="k dash"></i>Unconfirmed</span><span><i class="k sec"></i>Secret</span><span><i class="k conf"></i>DNA confirmed</span></div>`;
    let body;
    if (!phone) {
      body = `<div class="hl-body"><div class="hl-main">${head}${alone ? empty : treeIPad(M) + keyH}${alone ? "" : listSections(M)}</div>
        <aside class="hl-side"><div class="hl-sh first">Hints</div>${hintsHTML(hs)}${hs.length ? `<div class="hl-foot">Hints only appear for people with the same last name and no link, and for dashed links.</div>` : ""}
        <div class="hl-sh">Circle colors: households</div>${householdsHTML(hh)}</aside></div>`;
    } else {
      const chips = UI.chips([{ v:"tree", t:"Tree" }, { v:"hints", t:`Hints${hs.length ? " " + hs.length : ""}` }, { v:"hh", t:"Households" }], st.view, "hl-chips");
      const main = st.view === "hints" ? `<div class="hl-sh first">Hints</div>${hintsHTML(hs)}` : st.view === "hh" ? `<div class="hl-sh first">Circle colors: households</div>${householdsHTML(hh)}`
        : (alone ? empty : treePhone(M) + keyH + listSections(M)) + (hs.length ? `<div class="hl-sh">Hints</div>${hintsHTML(hs.slice(0, 3))}` : "");
      body = `<div class="hl-pbody">${head}<div class="hl-switchrow"><button type="button" class="hl-btn tint" data-switch>Switch Sim</button></div>${chips}${main}${st.hide && st.hidden > 0 ? `<div class="hl-note flow">${st.hidden} secret ${st.hidden === 1 ? "branch" : "branches"} hidden</div>` : ""}</div>`;
    }
    const keep = root.querySelector(".hl-treewrap"), sx = keep ? keep.scrollLeft : 0, top = root.scrollTop;
    root.innerHTML = `<div class="site-heirloom">${bar}${body}</div>`;
    const tw = root.querySelector(".hl-treewrap"); if (tw) tw.scrollLeft = sx; root.scrollTop = top;
    if (st.just) { const j = st.just; setTimeout(() => { if (st.just === j) st.just = null; }, 2600); }
  }

  /* ---------- a Sim's card ---------- */
  function linkGroup(n, M) {
    const l = n.link; if (!l || l.family !== "parent" && !(n.role === "anc" || n.role === "child")) return "";
    const p = simOf(l.a_sim), c = simOf(l.b_sim), s = stateOf(l), d = dnaOf(l.id);
    const tick = on => `<span class="hl-tick ${on ? "on" : ""}" role="img" aria-label="${on ? "Yes" : "No"}">${on ? "&#10003;" : ""}</span>`;
    const other = n.role === "child" ? p : c;
    const pill = s === "dna" ? `<span class="hl-pill ok">Confirmed with DNA kit</span>` : s === "unc" ? `<span class="hl-pill unc">Unconfirmed</span>` : `<span class="hl-pill">Confirmed</span>`;
    const dnaLine = d && d.result === false ? `<div class="hl-row s"><span class="rt"><b>DNA kit</b></span><span class="val">Not a match</span></div>` : "";
    return `<div class="hl-sh">Link between ${esc(first(p.name))} and ${esc(first(c.name))}</div><div class="hl-grp">
      <div class="hl-row s"><span class="rt"><b>Parent of</b></span><span class="val">${esc(stripNick(c.name))}</span></div>
      <div class="hl-row s"><span class="rt"><b>Biological</b></span>${tick(l.biological !== false && l.biological != null || l.biological === true)}</div>
      <div class="hl-row s"><span class="rt"><b>Adoptive</b></span>${tick(l.adoptive === true)}</div>
      <div class="hl-row s"><span class="rt"><b>Raised them</b></span>${tick(l.raised === true)}</div>
      ${l.secret ? `<div class="hl-row s"><span class="rt"><b>Secret</b></span><span class="hl-tick on red" role="img" aria-label="Yes">&#10003;</span></div>` : ""}
      <div class="hl-row s"><span class="rt"><b>Status</b></span>${pill}</div>${dnaLine}
      ${s !== "dna" ? `<div class="hl-row s"><span class="rt"><b>Not sure yet</b></span><button type="button" class="hl-sw ${s === "unc" ? "on" : ""}" role="switch" aria-checked="${s === "unc"}" aria-label="Not sure yet" data-notsure="${l.id}"><i></i></button></div>` : ""}
    </div><div class="hl-foot">${s === "unc" ? "A dashed link means you haven't confirmed it yet. " : ""}The boxes come from the Registry; change them there.</div>`;
  }
  function openCard(id) {
    const M = st.M, n = M && M.nodes.get(id); if (!n) return;
    const s = simOf(id), l = n.link, state = l ? stateOf(l) : null, canKit = !!l && l.family === "parent" && state === "unc";
    const sibInfo = n.role === "sib" ? `<div class="hl-sh">How you're related</div><div class="hl-grp"><div class="hl-row s"><span class="rt"><b>${esc(n.rel)}</b></span></div>${n.shared.length ? n.shared.map(p => `<div class="hl-row s"><span class="rt"><b>Shares</b></span><span class="val">${esc(stripNick(simOf(p).name))}</span></div>`).join("") : ""}${n.sib === "step" ? `<div class="hl-row s"><span class="rt"><b>Through</b></span><span class="val">${esc(stripNick(simOf(n.via).name))}'s spouse</span></div>` : ""}${n.tie ? `<div class="hl-foot pad">The Registry lists them as siblings, with no parents on file.</div>` : ""}</div>` : "";
    const body = `<div class="hl-sheet"><div class="hl-ph">${avatar(s, true)}<div><b>${esc(stripNick(s.name))}</b><small>${esc(n.rel === "You" ? "You" : n.rel + " of " + first(simOf(youId).name))}${age(s) ? " · " + esc(age(s)) : ""}${hhName(s) ? " · " + esc(hhName(s)) + " household" : ""}</small></div></div>
      ${linkGroup(n, M)}${sibInfo}
      ${canKit ? `<button type="button" class="hl-btn pri wide" data-kit="${l.id}">Confirm with DNA kit</button>` : ""}
      ${id !== youId ? `<button type="button" class="hl-btn plain wide" data-tree="${id}">View ${esc(first(s.name))}'s tree</button>` : ""}
      <a class="hl-btn plain wide" href="#/registry/${id}">Open file in Registry</a></div>`;
    const sh = UI.sheet({ title:"", left:"", right:"Done", body, theme:{ "--ui-sheet-bg":"#F5F0E6", "--ui-sheet-fg":"#26231D", "--ui-sheet-accent":"#2F6B47" } });
    st.sel = id; const clear = () => { st.sel = null; };
    sh.el.addEventListener("click", async e => {
      const k = e.target.closest("[data-kit]"), t = e.target.closest("[data-tree]"), ns = e.target.closest("[data-notsure]"), a = e.target.closest("a.hl-btn");
      if (k) { sh.close(); startKit(R().linkById(k.dataset.kit)); }
      else if (t) { sh.close(); location.hash = "#/heirloom/" + t.dataset.tree; }
      else if (a) sh.close();
      else if (ns) { const on = ns.getAttribute("aria-checked") !== "true", cur = settings(), set = new Set(cur.unconfirmed || []); on ? set.add(ns.dataset.notsure) : set.delete(ns.dataset.notsure);
        try { await GFB.saveSetting("heirloom", { ...cur, unconfirmed:[...set] }); } catch (err) { toast(err.message); return; }
        sh.close(); draw(); openCard(id); }
    });
    const prevClose = sh.close; sh.close = (w) => { clear(); prevClose(w); };
  }

  /* ---------- the Switch Sim sheet ---------- */
  function openSwitch() {
    const hasFam = new Set(); R().all().filter(l => l.kind === "fam").forEach(l => { hasFam.add(l.a_sim); hasFam.add(l.b_sim); });
    const sims = data.sims.slice().sort((a, b) => (hasFam.has(b.id) - hasFam.has(a.id)) || stripNick(a.name).localeCompare(stripNick(b.name)));
    const row = s => `<button type="button" class="hl-row" data-go="${s.id}" data-t="${esc(low(stripNick(s.name)))}">${avatar(s)}<span class="rt"><b>${esc(stripNick(s.name))}</b><small>${hasFam.has(s.id) ? "Family on file" : "No family on file yet"}</small></span>${s.id === youId ? `<span class="hl-pill ok">Viewing</span>` : CHEV}</button>`;
    const body = `<div class="hl-sheet"><input class="hl-q" type="search" placeholder="Search a name" aria-label="Search a name" autocomplete="off"><div class="hl-grp hl-list">${sims.map(row).join("")}</div><div class="hl-empty none" hidden>No Sims match that.</div></div>`;
    const sh = UI.sheet({ title:"Switch Sim", left:"", right:"Done", body, theme:{ "--ui-sheet-bg":"#F5F0E6", "--ui-sheet-fg":"#26231D", "--ui-sheet-accent":"#2F6B47" } });
    const q = sh.el.querySelector(".hl-q"), none = sh.el.querySelector(".none");
    q.addEventListener("input", () => { const v = low(q.value); let n = 0; sh.el.querySelectorAll("[data-go]").forEach(b => { const show = !v || b.dataset.t.includes(v); b.hidden = !show; if (show) n++; }); none.hidden = n > 0; });
    sh.el.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) { sh.close(); location.hash = "#/heirloom/" + b.dataset.go; } });
    if (matchMedia("(pointer:fine)").matches) q.focus();
  }

  /* ---------- toast ---------- */
  function toast(msg) { const t = document.createElement("div"); t.className = "hl-toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add("out"), 2600); setTimeout(() => t.remove(), 3000); }

  /* ---------- the DNA kit moment ----------
     Four beats: comparing (about 2.5 seconds, skippable), sealed results that wait for you to open them, the reveal, then back on the tree where the dashed line
     draws itself solid. Nothing is random: a match unless Biological is unchecked on that link. The numbers are made up. With reduced motion everything fades. */
  const CHR = [100, 97, 80, 77, 73, 69, 64, 59, 56, 54, 54, 54, 46, 43, 41, 36, 33, 31, 24, 26, 19, 21, 62];
  const FLAP_OUT = "M20 70 L280 70 L164 161 Q150 172 136 161 Z", FLAP_IN = "M20 70 L280 70 L164 -21 Q150 -32 136 -21 Z";
  function envelope() {
    return `<svg viewBox="0 -40 300 280" width="300" height="280" aria-hidden="true"><defs>
      <clipPath id="hk-clip"><rect x="20" y="70" width="260" height="162" rx="6"/></clipPath>
      <linearGradient id="hk-gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D2B488"/><stop offset="1" stop-color="#C9AA7E"/></linearGradient>
      <linearGradient id="hk-gr" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#D2B488"/><stop offset="1" stop-color="#C9AA7E"/></linearGradient>
      <linearGradient id="hk-gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D6B98C"/><stop offset="1" stop-color="#C7A678"/></linearGradient>
      <linearGradient id="hk-fo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E3C999"/><stop offset="1" stop-color="#D5B788"/></linearGradient>
      <linearGradient id="hk-fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#B99A6E"/><stop offset="1" stop-color="#C6A67A"/></linearGradient></defs>
      <rect x="20" y="70" width="260" height="162" rx="6" fill="#B99A6E"/>
      <g class="flapB"><path d="${FLAP_IN}" fill="url(#hk-fi)"/><path d="M20 70 L280 70" stroke="#A98A60"/></g>
      <g class="paper"><rect x="44" y="86" width="212" height="140" rx="3" fill="#FBF9F3" stroke="#E3DCCB"/>
        <text x="150" y="124" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-weight="700" font-size="24" fill="#2F6B47">Results</text>
        <text x="150" y="146" text-anchor="middle" font-family="Inter,sans-serif" font-size="13" fill="#6B6558">Heirloom DNA</text></g>
      <g clip-path="url(#hk-clip)"><path d="M20 70 L152 152 L20 232 Z" fill="url(#hk-gl)"/><path d="M280 70 L148 152 L280 232 Z" fill="url(#hk-gr)"/><path d="M20 232 L150 148 L280 232 Z" fill="url(#hk-gb)"/><path d="M20 232 L150 148 L280 232" fill="none" stroke="#B8976A" opacity=".7"/></g>
      <g class="flapF"><g clip-path="url(#hk-clip)"><path d="${FLAP_OUT}" fill="url(#hk-fo)"/></g>
        <g class="seal" transform="translate(150 160)"><circle r="23" fill="#2F6B47"/><circle r="23" fill="none" stroke="rgba(47,107,71,.25)" stroke-width="5"/><path d="M-7 8c0-9 5-15 15-16 0 10-5 15-13 16" fill="#F5F0E6"/><path d="M-7 8c3-5 6-8 10-10" stroke="#2F6B47" stroke-width="1.6" fill="none" stroke-linecap="round"/></g></g></svg>`;
  }
  function kitInfo(L) {
    const p = simOf(L.a_sim), c = simOf(L.b_sim), match = L.biological !== false;
    const other = R().all().filter(x => x.kind === "fam" && x.family === "parent" && x.b_sim === c.id && x.a_sim !== p.id).map(x => simOf(x.a_sim)).filter(Boolean)[0] || null;
    const cm = 3300 + (hash(L.id) % 380);
    return { p, c, match, other, pct:match ? "50%" : "0%", cm:match ? `${cm.toLocaleString("en-US")} cM across 22 segments` : "No shared segments",
      rel:match ? "Parent and child" : (L.raised ? `Raised ${gen(c) === "f" ? "her" : gen(c) === "m" ? "him" : "them"} stays on the tree` : "The link stays on the tree"),
      head:match ? "It's a match." : "Not a match.", line:match ? `${first(p.name)} is ${first(c.name)}'s ${pick(gen(p), "mother", "father", "parent")}.` : `${first(p.name)} and ${first(c.name)} don't share DNA as ${pick(gen(p), "mother", "father", "parent")} and ${pick(gen(c), "daughter", "son", "child")}.` };
  }
  function startKit(L) {
    if (!L) return;
    const K = kitInfo(L), phone = !wide.matches, timers = [];
    const el = document.createElement("div"); el.className = "hl-kit"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Heirloom DNA kit");
    const bars = CHR.map((h, i) => `<span class="chr" style="--h:${Math.round(h * .56)}px;--d:${i * 28}ms"><i class="ca ${K.match ? "on" : ""}"></i><i class="cb"></i></span>`).join("");
    el.innerHTML = `<div class="hk" data-step="compare"><button type="button" class="hk-x" data-close>Close</button>
      <section class="hk-s compare"><p class="over">Heirloom DNA kit</p>
        <div class="pairrow">${avatar(K.p, true)}<svg width="150" height="10" viewBox="0 0 150 10" aria-hidden="true"><path class="pl-dash" d="M4 5H146"/><path class="pl-fill" d="M4 5H146"/></svg>${avatar(K.c, true)}</div>
        <h3 class="dh">Comparing ${esc(first(K.p.name))} and ${esc(first(K.c.name))}</h3><p class="step" aria-live="polite">Reading samples</p><div class="dots3"><i class="on"></i><i></i><i></i></div>
        <button type="button" class="hl-btn plain skip" data-skip>Skip</button></section>
      <section class="hk-s sealed"><p class="over">Heirloom DNA kit</p><h3 class="dh">Your results are in</h3><p class="dsub">${esc(stripNick(K.p.name))} and ${esc(stripNick(K.c.name))}</p>
        <div class="env" role="button" tabindex="0" aria-label="Open results">${envelope()}</div><button type="button" class="hl-btn pri wide" data-open>Open results</button></section>
      <section class="hk-s reveal ${K.match ? "" : "nomatch"}"><span class="burst" aria-hidden="true">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<i style="--r:${a}deg">${LEAF(14, "#2F6B47", "#F5F0E6")}</i>`).join("")}</span>
        <div class="rcard"><p class="over">DNA results</p><h3 class="big">${esc(K.head)}</h3><p class="rline">${esc(K.line)}</p>
          <div class="stat"><b>${K.pct}</b><span>shared DNA<small>${esc(K.cm)}</small></span></div><div class="chrs" aria-hidden="true">${bars}</div>
          <div class="legend2"><span><i class="lk la"></i>From ${esc(first(K.p.name))}</span><span><i class="lk lb"></i>${K.other ? "From " + esc(first(K.other.name)) : "From their other parent"}</span></div>
          <div class="relpill">${esc(K.rel)}</div><p class="fine">Results are made up for the game.</p></div>
        <p class="hk-msg" aria-live="polite"></p>
        <button type="button" class="hl-btn pri wide" data-see>See it on the tree</button><button type="button" class="hl-btn plain wide" data-savecard>Save results card</button></section></div>`;
    document.body.appendChild(el);
    const hk = el.querySelector(".hk"), step = el.querySelector(".step"), dots = el.querySelectorAll(".dots3 i");
    const go = s => { hk.dataset.step = s; };
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const close = () => { timers.forEach(clearTimeout); document.removeEventListener("keydown", key, true); el.remove(); };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", key, true);
    ["Reading samples", "Comparing markers", "Checking the family line"].forEach((t, i) => later(() => { step.textContent = t; dots.forEach((d, j) => d.classList.toggle("on", j <= i)); }, i * 800));
    later(() => go("sealed"), 2500);
    let opened = false;
    const open = () => { if (opened) return; opened = true; hk.querySelector(".sealed").classList.add("opening");
      later(async () => { go("reveal"); let msg = "";
        try { const r = await commit(L, K.match); if (r === "skipped") msg = "Saved on this device. Sign in to SimDesk's cloud to add it to the timelines."; else if (r !== "saved") msg = "Saved, but the timeline entry didn't go through: " + r.replace(/^error:/, ""); } catch (err) { msg = "Couldn't save that: " + err.message; }
        const m = el.querySelector(".hk-msg"); if (m) m.textContent = msg; }, 1850); };
    el.addEventListener("click", e => {
      if (e.target.closest("[data-close]")) close();
      else if (e.target.closest("[data-skip]")) { timers.forEach(clearTimeout); go("sealed"); }
      else if (e.target.closest(".env") || e.target.closest("[data-open]")) open();
      else if (e.target.closest("[data-see]")) { close(); st.just = L.id; draw(); toast(K.match ? "Confirmed. Added to both timelines." : "Not a match. Added to both timelines. The link stays."); }
      else if (e.target.closest("[data-savecard]")) saveCard(K);
    });
    el.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.closest(".env")) { e.preventDefault(); open(); } });
    const f = el.querySelector("[data-skip]"); if (f && matchMedia("(pointer:fine)").matches) f.focus();
    if (phone) el.classList.add("phone");
  }
  async function commit(L, match) {
    const cur = settings(), unc = (cur.unconfirmed || []).filter(x => x !== L.id);
    const dna = { ...(cur.dna || {}), [L.id]: { result:match, date:gdate() } };
    await GFB.saveSetting("heirloom", { ...cur, unconfirmed:unc, dna });
    if (!R().canEdit()) return "skipped";
    const hist = (L.history || []).map(h => ({ ...h })); hist.push({ label:match ? "Confirmed with DNA kit" : "DNA kit: not a match", game_date:gdate(), note:null, sort:hist.length });
    try { await R().saveLink(L, hist); return "saved"; } catch (e) { return "error:" + e.message; }
  }
  /* the results card as a picture, for screenshots and videos */
  function saveCard(K) {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    x.fillStyle = "#F5F0E6"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#FFFDF8"; x.strokeStyle = "#D9D0BD"; x.lineWidth = 2; const r = 40; x.beginPath(); x.roundRect(90, 190, W - 180, 900, r); x.fill(); x.stroke();
    x.textAlign = "center"; x.fillStyle = "#2F6B47"; x.font = "700 30px Inter, system-ui, sans-serif"; x.fillText("HEIRLOOM DNA RESULTS", W / 2, 290);
    x.font = "700 110px Fraunces, Georgia, serif"; x.fillStyle = K.match ? "#2F6B47" : "#26231D"; x.fillText(K.head, W / 2, 430);
    x.fillStyle = "#26231D"; x.font = "600 44px Inter, system-ui, sans-serif"; x.fillText(K.line, W / 2, 520, W - 260);
    x.font = "700 150px Inter, system-ui, sans-serif"; x.fillText(K.pct, W / 2, 700); x.font = "400 36px Inter, system-ui, sans-serif"; x.fillStyle = "#6B6558"; x.fillText("shared DNA · " + K.cm, W / 2, 760, W - 260);
    const bw = 18, gap = 14, total = CHR.length * (bw * 2 + 3 + gap) - gap; let bx = (W - total) / 2;
    CHR.forEach(h => { const hh = h * 1.6; x.fillStyle = K.match ? "#2F6B47" : "#E4DCCB"; x.fillRect(bx, 940 - hh, bw, hh); x.fillStyle = "#CDBFD9"; x.fillRect(bx + bw + 3, 940 - hh, bw, hh); bx += bw * 2 + 3 + gap; });
    x.fillStyle = "#6B6558"; x.font = "400 30px Inter, system-ui, sans-serif"; x.fillText(K.rel, W / 2, 1030);
    x.fillStyle = "#8F8878"; x.font = "400 26px Inter, system-ui, sans-serif"; x.fillText("Made up for the game", W / 2, 1180);
    c.toBlob(b => { if (!b) return toast("Couldn't make the picture."); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `heirloom-${slug(K.p.name)}-${slug(K.c.name)}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }, "image/png");
  }

  /* ---------- wiring ---------- */
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    document.addEventListener("click", e => {
      if (!root || !e.target.closest || !e.target.closest(".site-heirloom")) return;
      const t = e.target;
      if (t.closest("[data-eye]")) { st.hide = !st.hide; draw(); return; }
      if (t.closest("[data-switch]")) { openSwitch(); return; }
      const chip = t.closest(".hl-chips .ui-chip"); if (chip) { st.view = chip.dataset.v; draw(); return; }
      const c = t.closest("[data-sim]"); if (c) { openCard(c.dataset.sim); return; }
    });
    wide = matchMedia("(min-width:721px)"); wide.addEventListener && wide.addEventListener("change", () => { if (root && root.querySelector(".site-heirloom")) draw(); });
  }
  function render(el, d, parts) {
    root = el; data = d; wide = wide || matchMedia("(min-width:721px)"); wire();
    const want = parts && parts[0], id = want && simOf(want) ? want : null;
    if (!el.querySelector(".site-heirloom")) { st.hide = false; st.view = "tree"; st.sel = null; }
    const next = id || pickDefault(); if (next !== youId) { st.view = "tree"; st.just = null; }
    youId = next;
    if (!id && youId) { const h = "#/heirloom/" + youId; if (location.hash !== h) { history.replaceState(null, "", h); } }
    try { localStorage.setItem(LAST_KEY, youId); } catch {}
    draw();
  }
  function address(parts) { const s = simOf(parts && parts[0]) || simOf(youId); return s ? "/tree/" + slug(s.name) : "/tree"; }
  return { render, address, label: () => "Heirloom" };
})();
