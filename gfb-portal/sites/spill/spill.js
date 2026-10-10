/* Spill: in-world it's an anonymous gossip app; underneath it's the private map of who's with who.
   It reads the Registry (GFB.registry), Slide matches (Registry links that start "Matched on Slide"), Messages chats, and the member lists of
   companies (Huddl institutions). Nothing here is saved except which Sims' reports you've "unlocked" (settings.spill). No report or file numbers anywhere.
   Always opens on Public so a screenshot never shows a secret by accident; Real is a tap. */
const Spill = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => stripNick(n).split(" ")[0];
  const initials = n => stripNick(n).split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const low = s => String(s || "").trim().toLowerCase();
  const slug = n => stripNick(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const PHONE = "(555) 014-2290", PRICE = "§39.99", WAS = "§79.99", CARD = "0417";
  const MARK = `<svg viewBox="0 0 22 26" aria-hidden="true"><path d="M11 1C7 8 3 12 3 17a8 8 0 0 0 16 0c0-5-4-9-8-16z" fill="var(--spill)"/><circle cx="18.5" cy="23" r="2.2" fill="var(--spill)"/></svg>`;
  const EYE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>`;
  const TYPES = { rom:["Romance","var(--s-rom)",""], ex:["Exes","var(--s-ex)",""], fam:["Family","var(--s-fam)",""], work:["Work","var(--s-work)","1 6"], text:["Texting","var(--s-text)",""], friend:["Friends","var(--s-friend)",""], sec:["Secrets","var(--s-sec)","9 7"] };
  const KIND_LABEL = { rom:"Romance", ex:"Ex", fam:"Family", friend:"Friend", work:"Work" };

  let data = null, root = null, M = null, serial = 0;
  /* mode and filters live only while Spill is open; every fresh open starts on Public */
  const st = { mode:"public", off:new Set(), deg:2, focus:null, card:null, q:"", sug:false, pay:null, menu:false, keep:true, session:false, remember:true, err:"", msg:"" };

  const simById = id => data.sims.find(s => s.id === id);
  const settings = () => (data.settings || {}).spill || {};
  const signed = () => st.session || !!settings().signed;
  const reports = () => Array.isArray(settings().reports) ? settings().reports : [];
  const unlockedOf = id => reports().find(r => r.sim === id) || null;
  const pic = s => s && (s.portrait || s.simsta_avatar || s.headshot) || null;
  const areaOf = s => { const c = String(s.residence || "").replace(/,\s*[A-Z]{2}$/, "").trim(); if (c) return c; const h = GFB.homeOf(s, data); return (h && (h.district || h.city)) || "Simerica"; };
  const jobOf = s => { const orgs = (data.organizations || []).filter(o => o.type === "Institution"); for (const o of orgs) { const m = (o.members || []).find(x => x.current !== false && (x.sim === s.id || (!x.sim && low(stripNick(x.name)) === low(stripNick(s.name))))); if (m) return [m.role, o.name].filter(Boolean).join(", "); } return stripNick(s.career || "").replace(/—/g, ","); };
  const sayDate = d => d && typeof d === "object" ? UI.gameLabel(d) : "";

  /* ---------- the model: every line, public or secret ---------- */
  function build() {
    const sims = new Map(data.sims.map(s => [s.id, s])), lines = [], pairKey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
    const R = GFB.registry;
    R.all().forEach(l => {
      if (!l.a_sim || !l.b_sim || !sims.has(l.a_sim) || !sims.has(l.b_sim) || l.a_sim === l.b_sim) return;
      const slide = (l.history || []).some(h => /^matched on slide/i.test(h.label || "")) || /^matched on slide/i.test(l.a_label || "");
      lines.push({ id:"l:" + l.id, a:l.a_sim, b:l.b_sim, type:l.secret ? "sec" : l.kind, kind:l.kind, secret:!!l.secret, slide, link:l });
    });
    const have = new Set(lines.map(l => pairKey(l.a, l.b)));
    const publicPair = new Set(lines.filter(l => !l.secret).map(l => pairKey(l.a, l.b)));
    const anyPair = new Set(have);
    /* the map's Sims so far: anyone with a Registry link (work lines only join Sims already on the map) */
    const onMap = new Set(lines.flatMap(l => [l.a, l.b]));
    /* texting: any Messages chat between two Sims with no other link */
    const msg = GFB.messages, threads = msg && msg.isLoaded() ? msg.threads() : [];
    const texts = new Map();
    threads.forEach(t => { const ids = [...new Set(t.sim_ids || [])].filter(i => sims.has(i)); if (ids.length === 2) texts.set(pairKey(ids[0], ids[1]), { ids, t }); });
    texts.forEach(({ ids, t }, k) => { ids.forEach(i => onMap.add(i)); if (!anyPair.has(k)) { lines.push({ id:"t:" + k, a:ids[0], b:ids[1], type:"text", kind:"text", secret:false, thread:t }); anyPair.add(k); publicPair.add(k); } });
    /* work: company member lists, only between Sims already on the map, and only where nothing public joins them yet */
    (data.organizations || []).filter(o => o.type === "Institution").forEach(o => {
      const mem = (o.members || []).filter(m => m.current !== false).map(m => ({ m, s:(m.sim && sims.get(m.sim)) || data.sims.find(x => low(stripNick(x.name)) === low(stripNick(m.name))) })).filter(x => x.s && onMap.has(x.s.id));
      for (let i = 0; i < mem.length; i++) for (let j = i + 1; j < mem.length; j++) {
        const a = mem[i], b = mem[j], k = pairKey(a.s.id, b.s.id);
        if (publicPair.has(k) || lines.some(l => l.id === "w:" + k)) continue;
        lines.push({ id:"w:" + k, a:a.s.id, b:b.s.id, type:"work", kind:"work", secret:false, org:o, roles:{ [a.s.id]:a.m.role || "", [b.s.id]:b.m.role || "" } });
        publicPair.add(k);
      }
    });
    const ids = [...new Set(lines.flatMap(l => [l.a, l.b]))];
    return { lines, ids, pairKey };
  }
  /* a stable layout from every line (secret ones too), so flipping Public and Real never moves a Sim */
  const layoutCache = new Map();
  function place(ids, lines, W, H) {
    const key = ids.slice().sort().join(",") + "#" + lines.map(l => l.a + l.b).sort().join(",") + "#" + W + "x" + H;
    if (layoutCache.has(key)) return layoutCache.get(key);
    const n = ids.length, P = ids.map((id, i) => { const h = hash(id), ang = (i / Math.max(1, n)) * Math.PI * 2 + (h % 100) / 400, r = 0.34 * Math.min(W, H) * (0.55 + (h % 9) / 18); return { id, x:W / 2 + Math.cos(ang) * r * (W / H), y:H / 2 + Math.sin(ang) * r, vx:0, vy:0 }; });
    const ix = new Map(P.map((p, i) => [p.id, i])), E = [...new Set(lines.map(l => l.a < l.b ? l.a + "|" + l.b : l.b + "|" + l.a))].map(k => k.split("|").map(i => ix.get(i)));
    const ITER = 380, L = Math.min(170, Math.sqrt(W * H / Math.max(4, n)) * 0.9);
    for (let it = 0; it < ITER; it++) {
      const t = 1 - it / ITER;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d2 = Math.max(dx * dx + dy * dy, 30); const d = Math.sqrt(d2), f = (L * L * 1.1) / d2; dx /= d; dy /= d; P[i].vx += dx * f; P[i].vy += dy * f; P[j].vx -= dx * f; P[j].vy -= dy * f; }
      E.forEach(([a, b]) => { const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, d = Math.max(Math.sqrt(dx * dx + dy * dy), 1), f = (d - L) * 0.06; P[a].vx += dx / d * f; P[a].vy += dy / d * f; P[b].vx -= dx / d * f; P[b].vy -= dy / d * f; });
      P.forEach(p => { p.vx += (W / 2 - p.x) * 0.012; p.vy += (H / 2 - p.y) * 0.012 * (W / H); const m = Math.hypot(p.vx, p.vy) || 1, cap = 24 * t + 1.5; p.x += p.vx / m * Math.min(m, cap); p.y += p.vy / m * Math.min(m, cap); p.vx = p.vy = 0; });
    }
    const pad = 64, xs = P.map(p => p.x), ys = P.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = (W - pad * 2) / Math.max(1, x1 - x0), sy = (H - pad * 2 - 20) / Math.max(1, y1 - y0), s = Math.min(sx, sy, 2.2);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, out = new Map(P.map(p => [p.id, { x:Math.round(W / 2 + (p.x - cx) * s), y:Math.round(H / 2 + (p.y - cy) * s) }]));
    layoutCache.set(key, out); if (layoutCache.size > 12) layoutCache.delete(layoutCache.keys().next().value);
    return out;
  }
  const real = () => st.mode === "real";
  const shown = () => M.lines.filter(l => (real() || !l.secret) && !st.off.has(l.type));
  const pairLines = (a, b, all) => M.lines.filter(l => ((l.a === a && l.b === b) || (l.a === b && l.b === a)) && (all || real() || !l.secret));
  const nbrs = id => new Set(shown().filter(l => l.a === id || l.b === id).flatMap(l => [l.a, l.b]));

  /* ---------- describing a line ---------- */
  function histText(l) {
    const h = (l.history || []).slice().reverse().find(x => x.game_date) || null;
    return h ? sayDate(h.game_date) : "date not set";
  }
  function describe(line, pov) {
    const A = simById(line.a), B = simById(line.b);
    if (line.type === "text") return { title:"Texting", sub:"A chat in Messages, nothing else on file between them" };
    if (line.type === "work" && !line.link) { const o = line.org, ra = line.roles[line.a], rb = line.roles[line.b];
      const pronoun = s => /^f/i.test(s.gender || "") ? "she" : /^m/i.test(s.gender || "") ? "he" : "they";
      const bit = (s, r) => r ? `${first(s.name)} is ${r}` : "";
      return { title:`Coworkers at ${o.name}`, sub:[bit(A, ra), bit(B, rb)].filter(Boolean).join("; ") || "On the same member list" }; }
    const l = line.link, la = l.a_label || "", lb = l.b_label || "";
    const slide = line.slide;
    const title = slide ? "Matched on Slide" : (la && lb && low(la) !== low(lb) ? `${la} / ${lb}` : (la || lb || KIND_LABEL[l.kind] || "Connected"));
    const same = la && lb && low(la) === low(lb) ? "Both files say the same" : (la || lb ? `${first(A.name)}: ${la || "no label"} · ${first(B.name)}: ${lb || "no label"}` : "");
    return { title, sub:[slide ? "" : same, histText(l)].filter(Boolean).join(" · ") };
  }


  /* ---------- degrees of separation ----------
     From one Sim, walk outward over the lines that are showing (Public or Real, and only the types switched on). Ring 1 is who they're linked to,
     ring 2 is those people's links, up to 6. Turned-off types and secrets hidden in Public don't count as steps. */
  function scopeOf(center) {
    const adj = new Map(); shown().forEach(l => { [[l.a, l.b], [l.b, l.a]].forEach(([x, y]) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push(y); }); });
    const deg = new Map([[center, 0]]), q = [center];
    while (q.length) { const x = q.shift(); (adj.get(x) || []).forEach(y => { if (!deg.has(y)) { deg.set(y, deg.get(x) + 1); q.push(y); } }); }
    return { deg, adj, reach:Math.min(6, Math.max(0, ...deg.values())) };
  }
  const withinOf = (sc, D) => [...sc.deg].filter(([, d]) => d <= D).map(([i]) => i);
  const ordinal = n => ["", "1st", "2nd", "3rd", "4th", "5th", "6th"][n];
  /* rings: the Sim in the middle, each degree on its own ellipse, people placed near their parents so lines stay short */
  function radial(center, sc, D, W, H) {
    const ids = withinOf(sc, D), maxD = Math.max(1, ...ids.map(i => sc.deg.get(i))), cx = W / 2, cy = H / 2 - 6;
    const rx = Math.min(W < 700 ? 140 : 190, (W / 2 - 70) / maxD), ry = Math.min(W < 700 ? 150 : 135, (H / 2 - 60) / maxD), pos = new Map([[center, { x:cx, y:cy, ang:0 }]]);
    for (let d = 1; d <= maxD; d++) {
      const nodes = ids.filter(i => sc.deg.get(i) === d);
      nodes.forEach(i => { let a = 0; if (d > 1) { let sx = 0, sy = 0; (sc.adj.get(i) || []).filter(q => sc.deg.get(q) === d - 1 && pos.has(q)).forEach(q => { sx += Math.cos(pos.get(q).ang); sy += Math.sin(pos.get(q).ang); }); a = Math.atan2(sy, sx); } pos.set(i, { ang:a }); });
      if (d === 1) { nodes.sort((a, b) => stripNick(simById(a).name).localeCompare(stripNick(simById(b).name))); nodes.forEach((i, k) => { pos.get(i).ang = -Math.PI / 2 + k * 2 * Math.PI / nodes.length; }); }
      else { nodes.sort((a, b) => pos.get(a).ang - pos.get(b).ang); const n = nodes.length, want = 0.9 * 2 * Math.PI / Math.max(n, 1);
        for (let it = 0; it < 40; it++) for (let k = 0; k < n; k++) { const a = nodes[k], b = nodes[(k + 1) % n]; let gap = pos.get(b).ang - pos.get(a).ang; if (k === n - 1) gap += 2 * Math.PI; if (gap < want) { const push = (want - gap) / 2; pos.get(a).ang -= push; pos.get(b).ang += push; } } }
      nodes.forEach(i => { const p = pos.get(i); p.x = Math.round(cx + Math.cos(p.ang) * rx * d); p.y = Math.round(cy + Math.sin(p.ang) * ry * d); });
    }
    return { pos, rx, ry, cx, cy, maxD, ids };
  }
  function sliderHTML(center, sc) {
    const D = st.deg, per = []; for (let d = 1; d <= Math.min(D, sc.reach); d++) per.push([...sc.deg.values()].filter(x => x === d).length);
    const n = withinOf(sc, D).length - 1, name = first(simById(center).name);
    const ticks = [1, 2, 3, 4, 5, 6].map(k => `<button type="button" data-deg="${k}" class="${k === D ? "on" : k < D ? "in" : ""} ${k > sc.reach ? "far" : ""}" aria-label="${k} degree${k === 1 ? "" : "s"}">${k}</button>`).join("");
    return `<div class="sp-sep"><div class="sephd"><b>Degrees of separation</b><small>from ${esc(name)}</small></div>
      <div class="septrack"><input type="range" id="sp-deg" min="1" max="6" step="1" value="${D}" style="--p:${(D - 1) / 5 * 100}%" aria-label="Degrees of separation from ${esc(name)}"><div class="septicks">${ticks}</div></div>
      <div class="sepnote"><b>${n}</b> ${n === 1 ? "Sim" : "Sims"} within ${D} ${D === 1 ? "degree" : "degrees"}${per.length > 1 ? ` <small>(${per.map((c, k) => `${c} at ${ordinal(k + 1)}`).join(", ")})</small>` : ""}${sc.reach < D ? `<small>Nobody is connected further out than ${sc.reach}.</small>` : ""}</div></div>`;
  }

  /* ---------- the map ---------- */
  function mapSVG(W, H, focus) {
    const sc = focus ? scopeOf(focus) : null, within = sc ? new Set(withinOf(sc, st.deg)) : null;
    const vis = shown().filter(l => !within || (within.has(l.a) && within.has(l.b))), ids = new Set(within ? [...within] : vis.flatMap(l => [l.a, l.b]));
    const rad = sc ? radial(focus, sc, st.deg, W, H) : null;
    const pos = rad ? rad.pos : place(M.ids, M.lines, W, H), id = "sp" + (++serial), nb = null;
    const rings = rad ? Array.from({ length:Math.min(rad.maxD, st.deg) }, (_, k) => `<ellipse cx="${rad.cx}" cy="${rad.cy}" rx="${rad.rx * (k + 1)}" ry="${rad.ry * (k + 1)}" fill="none" stroke="#5a4e61" stroke-dasharray="3 7" opacity=".9"/><text x="${Math.min(W - 24, rad.cx + rad.rx * (k + 1) + 6)}" y="${rad.cy - 4}" class="ringlbl">${ordinal(k + 1)}</text>`).join("") : "";
    const per = new Map();
    const defs = [...ids].map(i => { const p = pos.get(i), s = simById(i); return pic(s) ? `<clipPath id="${id}-${esc(i)}"><circle cx="${p.x}" cy="${p.y}" r="24"/></clipPath>` : ""; }).join("");
    const paths = vis.map(l => {
      const k = M.pairKey(l.a, l.b), n = (per.get(k) || 0); per.set(k, n + 1);
      const total = pairLines(l.a, l.b).length, A = pos.get(l.a), B = pos.get(l.b);
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      let off = total > 1 ? (n - (total - 1) / 2) * 30 : 0; if (l.secret) off = Math.max(off, 0) + d * 0.2;
      const cx = (A.x + B.x) / 2 + nx * off, cy = (A.y + B.y) / 2 + ny * off, mx = (A.x + B.x) / 4 + cx / 2, my = (A.y + B.y) / 4 + cy / 2;
      const [, col, dash] = TYPES[l.type], w = l.type === "rom" ? 3 : l.type === "text" ? 2 : 2.4;
      const near = focus && (l.a === focus || l.b === focus), op = focus ? (near ? 0.9 : 0.5) : 0.55;
      const dd = `M${A.x} ${A.y} Q${cx} ${cy} ${B.x} ${B.y}`;
      const dashA = l.type === "work" ? `stroke-dasharray="1 6" stroke-linecap="round"` : l.secret ? `stroke-dasharray="9 7"` : "";
      return `${l.secret ? `<path d="${dd}" fill="none" stroke="var(--s-sec)" stroke-width="14" opacity=".18" stroke-linecap="round"/>` : ""}<path d="${dd}" fill="none" stroke="${col}" stroke-width="${w}" ${dashA} opacity="${l.secret ? 1 : op}"/>
        <path class="sp-hit" d="${dd}" fill="none" stroke="transparent" stroke-width="22" data-line="${esc(l.id)}" tabindex="0" role="button" aria-label="${esc(first(simById(l.a).name))} and ${esc(first(simById(l.b).name))}: ${esc(TYPES[l.type][0])}"/>
        ${l.secret ? `<g transform="translate(${Math.round(mx - 34)},${Math.round(my - 10)})" pointer-events="none"><rect width="68" height="20" rx="3" fill="var(--bg)" stroke="var(--s-sec)"/><text x="34" y="14" text-anchor="middle" class="stamp">SECRET</text></g>` : ""}`;
    }).join("");
    const nodes = [...ids].map(i => {
      const s = simById(i), p = pos.get(i), touchSec = real() && shown().some(l => l.secret && (l.a === i || l.b === i));
      const dim = false;
      return `<g class="sp-node" data-node="${esc(i)}" opacity="${dim ? 0.45 : 1}" tabindex="0" role="button" aria-label="${esc(stripNick(s.name))}">
        <circle cx="${p.x}" cy="${p.y}" r="26" fill="var(--node)" stroke="${touchSec ? "var(--s-sec)" : i === focus ? "var(--spill)" : "var(--ring)"}" stroke-width="${i === focus ? 3.5 : 2.5}"/>
        <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" class="ini">${esc(initials(s.name))}</text>
        ${pic(s) ? `<image href="${esc(pic(s))}" x="${p.x - 24}" y="${p.y - 24}" width="48" height="48" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id}-${esc(i)})"/>` : ""}
        <text x="${p.x}" y="${p.y + 44}" text-anchor="middle" class="nm">${esc(first(s.name))}</text></g>`;
    }).join("");
    return `<svg class="sp-web" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Relationship map"><defs>${defs}</defs>${rings}${paths}${nodes}</svg>`;
  }
  const dims = () => { const w = (root && root.clientWidth) || 1000; return w < 700 ? [640, 760] : [1200, 620]; };

  function chips() {
    const present = new Set(M.lines.filter(l => real() || !l.secret).map(l => l.type));
    const order = ["rom","ex","fam","work","text","friend"].concat(real() ? ["sec"] : []);
    return order.filter(t => t !== "friend" || present.has("friend")).map(t => { const [n, col, dash] = TYPES[t]; return `<button type="button" class="sp-chip ${st.off.has(t) ? "off" : ""}" data-chip="${t}" aria-pressed="${!st.off.has(t)}"><i style="border-color:${col};${t === "work" ? "border-top-style:dotted" : t === "sec" ? "border-top-style:dashed" : ""}"></i>${n}</button>`; }).join("");
  }
  function counts() {
    const within = st.focus ? new Set(withinOf(scopeOf(st.focus), st.deg)) : null;
    const vis = shown().filter(l => !within || (within.has(l.a) && within.has(l.b))), ids = new Set(within ? [...within] : vis.flatMap(l => [l.a, l.b])), sec = vis.filter(l => l.secret).length;
    return `<span class="sp-count"><b>${ids.size}</b> Sims · <b>${vis.length}</b> links${real() ? ` · <span class="red">${sec} secret${sec === 1 ? "" : "s"}</span>` : ""}</span>`;
  }
  function toggle() {
    return `<div class="sp-seg" role="group" aria-label="Public or real"><button type="button" class="${real() ? "" : "on"}" data-mode="public" aria-pressed="${!real()}">Public</button><button type="button" class="${real() ? "on redon" : ""}" data-mode="real" aria-pressed="${real()}">${EYE}Real</button></div>`;
  }

  /* ---------- the line card ---------- */
  function cardHTML() {
    const line = M.lines.find(l => l.id === st.card); if (!line) return "";
    const A = simById(line.a), B = simById(line.b), all = pairLines(line.a, line.b), sec = all.filter(l => l.secret), pub = all.filter(l => !l.secret);
    const av = s => `<span>${pic(s) ? `<img src="${esc(pic(s))}" alt="">` : esc(initials(s.name))}</span>`;
    const layer = (l, colorless) => { const d = describe(l), [, col] = TYPES[l.type]; return `<div class="lyr"><i style="border-color:${col};${l.type === "work" ? "border-top-style:dotted" : l.secret ? "border-top-style:dashed" : ""}"></i><p>${esc(d.title)}<br><small>${esc(d.sub)}</small></p></div>`; };
    const thread = GFB.messages && GFB.messages.isLoaded() ? GFB.messages.find([A.id, B.id]) : null;
    const msgBtn = thread ? `<a href="#/messages/t/${thread.id}/${A.id}">Messages<small>Open the chat ›</small></a>` : `<a href="#/messages/sim/${A.id}">Messages<small>No chat yet · start one ›</small></a>`;
    return `<div class="sp-card" role="dialog" aria-label="${esc(first(A.name))} and ${esc(first(B.name))}">
      <div class="hd"><div class="pair">${av(A)}${av(B)}<b>${esc(stripNick(A.name))}<br>and ${esc(stripNick(B.name))}</b></div>${line.secret ? `<span class="tag">SECRET</span>` : ""}<button type="button" class="sp-x" data-card="close" aria-label="Close">×</button></div>
      <div class="bd">
        ${real() && sec.length ? `<div><h6>What's real</h6>${sec.map(l => layer(l)).join("")}</div>` : ""}
        <div><h6>What people see</h6>${pub.length ? pub.map(l => layer(l)).join("") : `<div class="lyr"><i style="border-color:var(--ring)"></i><p>Nothing<br><small>As far as anyone knows, they're strangers</small></p></div>`}</div>
      </div>
      <div class="acts">${msgBtn}<a href="#/registry/${A.id}">${esc(first(A.name))}'s Registry file<small>›</small></a><a href="#/registry/${B.id}">${esc(first(B.name))}'s Registry file<small>›</small></a></div></div>`;
  }

  /* ---------- pages ---------- */
  const acct = () => `<span class="sp-acct"><button type="button" class="sp-acctb" data-menu="1" aria-haspopup="true" aria-expanded="${st.menu}"><i>S</i><span class="sp-acctn">Member · ${PHONE}</span></button>${st.menu ? `<span class="sp-menu"><button type="button" data-signout="1">Sign out</button></span>` : ""}</span>`;
  function matches(q) {
    const t = low(q); if (!t) return [];
    return data.sims.filter(s => low(stripNick(s.name)).includes(t) || low(s.simsta || "").includes(t) || low(areaOf(s)) === t).sort((a, b) => (low(stripNick(a.name)).startsWith(t) ? 0 : 1) - (low(stripNick(b.name)).startsWith(t) ? 0 : 1) || stripNick(a.name).localeCompare(stripNick(b.name)));
  }
  function searchBar(big) {
    const sug = st.sug && st.q.trim() ? matches(st.q).slice(0, 6) : [];
    const every = st.sug && /^e(v(e(r(y(o(n(e)?)?)?)?)?)?)?$/i.test(st.q.trim());
    return `<form class="sp-sbar ${big ? "big" : ""}" data-search="1" role="search"><div class="sp-sin"><input type="search" id="sp-q" value="${esc(st.q)}" placeholder="Search a name" autocomplete="off" aria-label="Search a name" ${big ? "" : ""}>
      ${(sug.length || every) ? `<ul class="sp-sug" role="listbox">${every ? `<li role="option"><a href="#/spill/map"><b>everyone</b><small>The whole map</small></a></li>` : ""}${sug.map(s => `<li role="option"><a href="#/spill/search/${encodeURIComponent(stripNick(s.name))}"><b>${esc(stripNick(s.name))}</b><small>${esc([s.age, areaOf(s)].filter(Boolean).join(" · "))}</small></a></li>`).join("")}</ul>` : ""}</div>${big ? `<button class="sp-btn" type="submit">Search</button>` : ""}</form>`;
  }
  /* bare: the page already shows the big search bar, so the top bar leaves its own out (one search bar, one #sp-q). */
  const topbar = (extra, bare, land) => `<div class="sp-top${land ? " land" : ""}"><a class="sp-logo" href="#/spill">${MARK}spill</a>${bare ? "" : searchBar(false)}${extra || ""}${acct()}</div>`;

  function homePage() {
    return `<div class="sp-home"><div class="sp-nav"><span class="sp-logo">${MARK}spill</span><a>How it works</a><a>Safety</a><a>Press</a><div class="r"><button type="button" class="sp-pill" data-focus="signin">Sign in</button><span class="sp-pill solid">Get the app</span></div></div>
      <div class="sp-hero"><div><h1>Everybody's got tea.<br><em>Nobody's</em> got a name.</h1>
        <p>Spill is where Lennox Park and Fenmore say what they can't say out loud. No names, no profiles, no screenshots.</p>
        <div class="sp-stores"><span>Download on the<b>Sim Store</b></span><span>Get it on<b>PlumbPlay</b></span></div>
        <div class="sp-tease">
          <div class="drip"><i>?</i><span>someone at <span class="bl" style="width:110px"></span> is NOT who they say they are</span></div>
          <div class="drip"><i>?</i><span><span class="bl" style="width:70px"></span> and <span class="bl" style="width:84px"></span> left the same party 4 min apart 👀</span></div>
          <div class="drip"><i>?</i><span>sign in to see what Fenmore is saying</span></div></div></div>
        <form class="sp-signin" data-signin="1" id="sp-signin"><h3>Sign in</h3><small>Members only. Your searches stay private.</small>
          <label class="fld"><span class="sr">Phone</span><input value="${PHONE}" readonly aria-label="Phone"><small>made up</small></label>
          <label class="fld pw"><span class="sr">Password</span><input type="password" value="spillspill" readonly aria-label="Password"></label>
          <label class="sp-remember"><input type="checkbox" id="sp-keep" ${st.keep ? "checked" : ""}><i></i>Keep me signed in</label>
          <button class="sp-go" type="submit">Sign in</button><div class="fine">Forgot password? · New here? Start a membership</div></form></div>
      <div class="sp-foot">© Spill, Inc. · Terms · Privacy</div></div>`;
  }

  /* what the free preview can say about a Sim, from the public layer only */
  function profile(s) {
    const mine = M.lines.filter(l => (l.a === s.id || l.b === s.id) && !l.secret);
    const other = l => simById(l.a === s.id ? l.b : l.a);
    const spouse = mine.find(l => l.link && l.type === "rom" && ((l.link.history || []).some(h => /^married$/i.test(h.label || "")) || /spouse|husband|wife/i.test(((l.a === s.id ? l.link.a_label : l.link.b_label) || "") + (l.link.a_label || ""))));
    const dating = mine.filter(l => l.slide), work = mine.filter(l => l.type === "work"), other_ = mine.filter(l => !l.slide && l !== spouse && l.type !== "work");
    return { s, mine, spouse:spouse ? other(spouse) : null, dating, work, rest:other_, other };
  }
  const redact = n => `<span class="blur" aria-hidden="true">${"Xxxxxx Xxxxxxx, ".repeat(Math.max(1, Math.min(n, 2))).replace(/, $/, "")}</span>`;
  function preview(s, more) {
    const p = profile(s), un = unlockedOf(s.id);
    const lastInit = n => { const parts = stripNick(n).split(" "); return parts.length > 1 ? parts[0] + " " + parts[parts.length - 1][0] + "." : parts[0]; };
    const row = (k, val, lk) => `<div class="rrow"><span class="k">${k}</span><span>${val}</span><span class="lk">${lk || ""}</span></div>`;
    const lock = n => n ? `🔒 ${n} found` : "";
    const card = `<div class="rcard"><div class="rhead"><span class="ph">${pic(s) ? `<img src="${esc(pic(s))}" alt="">` : `<b>${esc(initials(s.name))}</b>`}</span><div><h2>${esc(stripNick(s.name))}</h2><p>${esc([s.age, areaOf(s), jobOf(s)].filter(x => x != null && x !== "").join(" · "))}</p></div>${more ? "" : `<span class="match">Best match</span>`}</div>
      ${p.spouse ? row("Married to", esc(lastInit(p.spouse.name))) : ""}
      ${row("Dating apps", p.dating.length ? redact(p.dating.length) : `<span class="sp-dim">None found</span>`, un ? "" : lock(p.dating.length))}
      ${row("Coworkers", p.work.length ? redact(p.work.length) : `<span class="sp-dim">None found</span>`, un ? "" : lock(p.work.length))}
      ${row("Hidden connections", `<span class="sp-dim">Full reports can include links people keep quiet</span>`, "🔒 Locked")}
      ${more || ""}</div>`;
    return { card, p, un };
  }
  function searchPage(q) {
    const list = matches(q), s0 = list[0];
    const mine = reports().map(r => ({ r, s:simById(r.sim) })).filter(x => x.s);
    const myBox = `<div class="mine"><h4>Your reports</h4>${mine.length ? mine.map(({ r, s }) => `<a href="#/spill/report/${slug(s.name)}"><span>${esc(stripNick(s.name))}</span><small>Unlocked ${esc(sayDate(r.date))}</small></a>`).join("") : `<div><span>None yet</span><small>Unlocked reports show here</small></div>`}</div>`;
    if (!q.trim()) return landing();
    if (!list.length) return `${topbar()}<div class="sp-body one"><div><p class="sp-none">No one matching "${esc(q)}". Try a first name, or type everyone for the whole map.</p></div><div>${myBox}</div></div>`;
    if (list.length === 1) {
      const { card, un } = preview(s0, `<div class="other">Also matching "${esc(q)}": <b>none</b> · Try "everyone" for the whole map</div>`);
      const pay = un ? `<div class="pay"><h3>${esc(first(s0.name))}'s report is unlocked</h3><small class="sp-dim">Unlocked ${esc(sayDate(un.date))}.</small><a class="sp-unlock" href="#/spill/report/${slug(s0.name)}">Open the full report</a></div>`
        : `<div class="pay"><h3>Full report on ${esc(first(s0.name))}</h3><small class="sp-dim">Everything we found, plus the map.</small><ul><li>Every relationship, with dates</li><li>Dating app matches</li><li>Coworkers and family</li><li>Hidden connections</li></ul>
          <div class="price"><b>${PRICE}</b><s>${WAS}</s><span class="made">made up</span></div><button type="button" class="sp-unlock" data-unlock="${s0.id}">Unlock full report</button><div class="fine">Billed as SPILL*RPT. One-time charge.</div></div>`;
      return `${topbar()}<div class="sp-body"><div>${card}</div><div>${pay}${myBox}</div></div>`;
    }
    const cards = list.slice(0, 12).map(s => { const p = profile(s); return `<a class="rcard res" href="#/spill/search/${encodeURIComponent(stripNick(s.name))}"><div class="rhead"><span class="ph">${pic(s) ? `<img src="${esc(pic(s))}" alt="">` : `<b>${esc(initials(s.name))}</b>`}</span><div><h2>${esc(stripNick(s.name))}</h2><p>${esc([s.age, areaOf(s), jobOf(s)].filter(x => x != null && x !== "").join(" · "))}</p></div><span class="match">View</span></div></a>`; }).join("");
    return `${topbar()}<div class="sp-body"><div><p class="sp-sub">${list.length} people match "${esc(q)}"</p>${cards}</div><div>${myBox}</div></div>`;
  }
  /* The signed-in search page with nothing typed: one search bar, area chips, your reports, the most looked-up adults, fresh tea.
     Public lines only, so nothing on this page hints at a secret. "Simerica" (the area fallback) never shows here. */
  function landing() {
    const pub = M.lines.filter(l => !l.secret), cnt = new Map();
    pub.forEach(l => [l.a, l.b].forEach(i => cnt.set(i, (cnt.get(i) || 0) + 1)));
    const place = s => { const a = areaOf(s); return a === "Simerica" ? "" : a; };
    const areas = new Map(); data.sims.forEach(s => { const a = place(s); if (a) areas.set(a, (areas.get(a) || 0) + 1); });
    const chip = (href, label, n) => `<a class="ui-chip" href="${href}"><span>${esc(label)}<small>${esc(n)}</small></span></a>`;
    const chips = [...areas].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([a, n]) => chip("#/spill/search/" + encodeURIComponent(a), a, n)).join("") + chip("#/spill/map", "Everyone", "map");
    const adult = s => { const n = parseInt(s.age, 10); if (Number.isFinite(n)) return n >= 18; return !/baby|infant|toddler|child|kid|teen/i.test(String(s.age || s.life_stage || "")); };
    const top = [...cnt].map(([id, n]) => ({ s:simById(id), n })).filter(x => x.s && adult(x.s)).sort((a, b) => b.n - a.n || stripNick(a.s.name).localeCompare(stripNick(b.s.name))).slice(0, 3);
    const people = top.map(({ s, n }) => `<a class="sp-lrow" href="#/spill/search/${encodeURIComponent(stripNick(s.name))}"><span class="av">${pic(s) ? `<img src="${esc(pic(s))}" alt="">` : esc(initials(s.name))}</span><span class="tx"><b>${esc(stripNick(s.name))}</b><small>${esc([s.age, place(s), `${n} connection${n === 1 ? "" : "s"}`].filter(x => x != null && x !== "").join(" · "))}</small></span><span class="go" aria-hidden="true">›</span></a>`).join("");
    /* fresh tea: newest dated public history first (Slide matches on one game day collapse into one row), then texting; names stay blurred */
    const tea = [];
    pub.forEach(l => (l.link && l.link.history || []).forEach(h => { if (h.game_date && !h.game_date.before && h.label) tea.push({ l, h }); }));
    const gd = d => (d.year || 0) * 1000 + (["Spring", "Summer", "Fall", "Winter"].indexOf(d.season) + 1) * 100 + (d.day || 0);
    tea.sort((a, b) => gd(b.h.game_date) - gd(a.h.game_date));
    const bar = w => `<span class="bl" style="width:${w}px"></span>`, per = new Map(), items = [];
    const push = (k, html) => { if ((per.get(k) || 0) >= 2 || items.length >= 4) return; per.set(k, (per.get(k) || 0) + 1); items.push(html); };
    const who = l => `${bar(50 + hash(l.a) % 40)} and ${bar(50 + hash(l.b) % 40)}`, near = l => { const A = simById(l.a), p = A ? place(A) : ""; return p ? ` · ${esc(p)}` : ""; };
    const row = (main, sub) => `<div class="sp-lrow"><span class="av">?</span><span class="tx"><span class="m">${main}</span><small>${sub}</small></span></div>`;
    const isSlide = h => /^matched on slide/i.test(h.label), slideDay = new Map();
    tea.forEach(({ l, h }) => { if (isSlide(h)) { const k = sayDate(h.game_date), g = slideDay.get(k) || { n:0, l }; g.n++; slideDay.set(k, g); } });
    const doneSlide = new Set();
    tea.forEach(({ l, h }) => { if (!isSlide(h)) return; const k = sayDate(h.game_date); if (doneSlide.has(k)) return; doneSlide.add(k); const g = slideDay.get(k);
      push("slide", row(`${g.n > 1 ? `${g.n} new matches on Slide` : `${who(l)} matched on Slide`}${near(l)}`, esc(k))); });
    tea.filter(({ h }) => !isSlide(h)).forEach(({ l, h }) => push(h.label, row(`${who(l)} · ${esc(h.label.charAt(0).toLowerCase() + h.label.slice(1))}${near(l)}`, esc(sayDate(h.game_date)))));
    pub.filter(l => l.type === "text").forEach(l => push("text", row(`${who(l)} have been texting${near(l)}`, "Messages")));
    const mine = reports().map(r => ({ r, s:simById(r.sim) })).filter(x => x.s);
    const rep = cls => `<div class="mine ${cls}"><h4>Your reports</h4>${mine.length ? mine.map(({ r, s }) => `<a href="#/spill/report/${slug(s.name)}"><span>${esc(stripNick(s.name))}</span><small>Unlocked ${esc(sayDate(r.date))}</small></a>`).join("") : `<div><span>None yet</span><small>Unlocked reports show here</small></div>`}</div>`;
    return `${topbar("", true, true)}<div class="sp-land">
        <div class="sp-lhead"><h2 class="sp-h">Search Lennox Park and Fenmore</h2>${searchBar(true)}<div class="ui-chips">${chips}</div></div>
        ${mine.length ? rep("narrow") : ""}
        <div class="sp-lmain">${people ? `<h4 class="sp-sec">Most looked up</h4><div class="sp-lgrp">${people}</div>` : ""}${items.length ? `<h4 class="sp-sec">Fresh tea</h4><div class="sp-lgrp">${items.join("")}</div><p class="sp-fine">Names show in full reports.</p>` : ""}</div>
        <div class="sp-lside">${rep("")}</div>
      </div>`;
  }
  function payOverlay() {
    const s = simById(st.pay.sim), steps = ["payment approved", `pulling records on ${stripNick(s.name)}`, "checking for hidden connections..."], n = st.pay.step;
    return `<div class="sp-payov" data-skip="1" role="dialog" aria-label="Unlocking"><div class="paybox"><h3>Unlocking ${esc(first(s.name))}'s report</h3><small class="sp-dim">Card on file · tap to skip</small>
      <div class="card16"><i></i>Card ending ${CARD} <span class="made" style="margin-left:auto">made up</span></div>
      <div class="ln"><span>Full report</span><span>${PRICE}</span></div>
      <div class="prog">${steps.map((t, i) => i < n ? `<div>&gt; ${esc(t)} <span class="ok">ok</span></div>` : i === n ? `<div>&gt; ${esc(t)}</div>` : "").join("")}<div class="bar2"><span style="width:${Math.min(100, (n + 1) * 33)}%"></span></div></div></div></div>`;
  }
  function reportPage(s) {
    const p = profile(s), un = unlockedOf(s.id), vis = shown().filter(l => l.a === s.id || l.b === s.id);
    const who = l => simById(l.a === s.id ? l.b : l.a);
    const item = l => { const d = describe(l), o = who(l), [, col] = TYPES[l.type];
      return `<button type="button" class="ri ${l.secret ? "sec" : ""}" data-line="${esc(l.id)}"><i style="border-color:${col};${l.type === "work" ? "border-top-style:dotted" : l.secret ? "border-top-style:dashed" : ""}"></i><div>${esc(stripNick(o.name))}${l.secret ? `<span class="st">SECRET</span>` : ""}<small>${esc(l.type === "work" && !l.link ? d.title.replace(/^Coworkers at /, "") : [d.title, d.sub].filter(Boolean).join(" · "))}</small></div></button>`; };
    const grp = (title, arr) => arr.length ? `<div class="rg"><h6>${title}</h6>${arr.map(item).join("")}</div>` : "";
    const sec = vis.filter(l => l.secret), pub = vis.filter(l => !l.secret);
    const side = `<div class="side"><div class="who"><span class="ph">${pic(s) ? `<img src="${esc(pic(s))}" alt="">` : `<b>${esc(initials(s.name))}</b>`}</span><div><b>${esc(stripNick(s.name))}</b><small>${esc([s.age, areaOf(s), jobOf(s)].filter(x => x != null && x !== "").join(" · "))}</small></div></div>
      <div class="stampr">FULL REPORT · UNLOCKED ${esc(sayDate(un ? un.date : UI.gameToday(data.calendar)).toUpperCase())}</div>
      ${sliderHTML(s.id, scopeOf(s.id))}
      <div class="sp-sep"><div class="sephd"><b>Show</b><small>tap to turn a type on or off</small></div><div class="sp-chips">${chips()}</div></div>
      ${grp("Relationships", pub.filter(l => !l.slide && ["rom","ex","fam","friend"].includes(l.type)))}${grp("Dating apps", pub.filter(l => l.slide))}${grp("Coworkers", pub.filter(l => l.type === "work"))}${grp("Texting", pub.filter(l => l.type === "text"))}${real() ? grp("Hidden connections", sec) : ""}
      ${vis.length ? "" : `<p class="sp-dim">Nothing on file for ${esc(first(s.name))}.</p>`}</div>`;
    const [W, H] = dims();
    return `${topbar(toggle())}<div class="sp-rep">${side}<div class="sp-stage" id="sp-stage">${mapSVG(W, H, s.id)}${st.card ? cardHTML() : ""}</div></div>`;
  }
  function mapPage() {
    const [W, H] = dims(), sims = [...new Set(M.lines.filter(l => !l.secret).flatMap(l => [l.a, l.b]))];
    const tally = {}; sims.forEach(i => { const c = String(simById(i).residence || "").replace(/,\s*[A-Z]{2}$/, "").trim(); if (c) tally[c] = (tally[c] || 0) + 1; });
    const regions = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
    return `${topbar(toggle())}<div class="sp-sub2"><small>who's with who${regions.length ? " in " + regions.map(esc).join(" and ") : ""}</small></div>
      <div class="sp-filters">${chips()}${counts()}</div>
      ${st.focus ? `<div class="sp-sepbar">${sliderHTML(st.focus, scopeOf(st.focus))}<button type="button" class="sp-pill" data-clearfocus="1">Show everyone</button></div>` : `<p class="sp-hint">Tap a Sim to see just their circle, with a slider for how many steps out.</p>`}
      ${real() ? `<div class="sp-banner"><b>Real</b> · secret links are showing. Flip back to Public before you share a screen.</div>` : ""}
      <div class="sp-stage" id="sp-stage">${mapSVG(W, H, st.focus)}${st.card ? cardHTML() : ""}</div>`;
  }

  /* ---------- drawing ---------- */
  let page = { kind:"home", arg:"" }, payTimer = null;
  function draw() {
    if (!root) return;
    if (!M) M = build();
    let inner = "";
    if (!signed()) inner = homePage();
    else if (page.kind === "map") inner = mapPage();
    else if (page.kind === "report") { const s = data.sims.find(x => slug(x.name) === page.arg); inner = s ? (unlockedOf(s.id) ? reportPage(s) : searchPage(stripNick(s.name))) : searchPage(""); }
    else inner = searchPage(page.arg || "");
    const keep = root.querySelector(".site-spill") ? root.querySelector(".site-spill").scrollTop : 0;
    root.innerHTML = `<div class="site-spill ${real() && signed() && ["map","report"].includes(page.kind) ? "real" : ""}">${inner}${st.pay ? payOverlay() : ""}</div>`;
    const el = root.querySelector(".site-spill"); if (el) el.scrollTop = keep;
    const q = root.querySelector("#sp-q"); if (q && st.refocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } st.refocus = false;
    if (st.keepDeg) { st.keepDeg = false; const r = root.querySelector("#sp-deg"); r && r.focus({ preventScroll:true }); }
  }
  async function unlockNow(simId) {
    const cur = settings(), date = UI.gameToday(data.calendar), list = reports().filter(r => r.sim !== simId).concat([{ sim:simId, date }]);
    await GFB.saveSetting("spill", { ...cur, reports:list });
    data = await GFB.getAll();
  }
  function startPay(simId) {
    st.pay = { sim:simId, step:0 }; draw(); clearInterval(payTimer);
    const finish = async () => { clearInterval(payTimer); payTimer = null; const id = st.pay && st.pay.sim; if (!id) return; st.pay = null; try { await unlockNow(id); } catch (e) { st.err = e.message; }
      st.mode = "public"; location.hash = "#/spill/report/" + slug(simById(id).name); draw(); };
    payTimer = setInterval(() => { if (!st.pay) return clearInterval(payTimer); st.pay.step++; if (st.pay.step >= 3) return finish(); draw(); }, 330);
    st.pay.finish = finish;
  }
  function wire() {
    if (wire.done) return; wire.done = true;
    const mine = e => root && root.contains(e.target) && root.querySelector(".site-spill");
    document.addEventListener("click", e => {
      if (!mine(e)) return; const t = e.target;
      const sk = t.closest("[data-skip]"); if (sk && st.pay) { st.pay.finish && st.pay.finish(); return; }
      const f = t.closest("[data-focus]"); if (f) { const el = root.querySelector("#sp-signin"); el && el.scrollIntoView({ block:"center" }); el && el.querySelector(".sp-go").focus(); return; }
      const mo = t.closest("[data-mode]"); if (mo) { st.mode = mo.dataset.mode; if (st.mode === "public") { st.off.delete("sec"); if (st.card && (M.lines.find(l => l.id === st.card) || {}).secret) st.card = null; } return draw(); }
      const dg = t.closest("[data-deg]"); if (dg) { st.deg = Number(dg.dataset.deg); return draw(); }
      if (t.closest("[data-clearfocus]")) { st.focus = null; st.card = null; return draw(); }
      const ch = t.closest("[data-chip]"); if (ch) { const k = ch.dataset.chip; st.off.has(k) ? st.off.delete(k) : st.off.add(k); return draw(); }
      const ln = t.closest("[data-line]"); if (ln) { st.card = ln.dataset.line; return draw(); }
      const nd = t.closest("[data-node]"); if (nd) { st.focus = st.focus === nd.dataset.node ? null : nd.dataset.node; st.card = null; return draw(); }
      if (t.closest("[data-card]")) { st.card = null; return draw(); }
      const un = t.closest("[data-unlock]"); if (un) { startPay(un.dataset.unlock); return; }
      if (t.closest("[data-menu]")) { st.menu = !st.menu; return draw(); }
      if (t.closest("[data-signout]")) { st.menu = false; st.session = false; GFB.saveSetting("spill", { ...settings(), signed:false }).then(() => GFB.getAll()).then(d => { data = d; location.hash = "#/spill"; draw(); }); return; }
      if (st.menu && !t.closest(".sp-acct")) { st.menu = false; draw(); }
      if (st.sug && !t.closest(".sp-sin")) { st.sug = false; draw(); }
      if (st.card && !t.closest(".sp-card") && !t.closest("[data-line]") && t.closest(".sp-stage")) { st.card = null; draw(); }
    });
    document.addEventListener("input", e => { if (mine(e) && e.target.id === "sp-deg") { st.deg = Math.min(6, Math.max(1, Number(e.target.value) || 1)); st.keepDeg = true; return draw(); } if (!mine(e) || e.target.id !== "sp-q") return; st.q = e.target.value; st.sug = true; st.refocus = true; draw(); });
    document.addEventListener("change", e => { if (mine(e) && e.target.id === "sp-keep") st.keep = e.target.checked; });
    document.addEventListener("submit", async e => {
      if (!mine(e)) return; const f = e.target;
      if (f.dataset.signin) { e.preventDefault(); st.keep = !!root.querySelector("#sp-keep").checked; st.session = true;
        try { if (st.keep) { await GFB.saveSetting("spill", { ...settings(), signed:true }); data = await GFB.getAll(); } } catch {}
        location.hash = "#/spill"; return draw(); }
      if (f.dataset.search) { e.preventDefault(); const q = st.q.trim(); st.sug = false; if (!q) return; location.hash = /^every(one|body)$/i.test(q) ? "#/spill/map" : "#/spill/search/" + encodeURIComponent(q); }
    });
    document.addEventListener("keydown", e => {
      if (!mine(e)) return;
      if (e.key === "Escape") { if (st.pay) { st.pay.finish && st.pay.finish(); } else if (st.card) { st.card = null; draw(); } else if (st.menu) { st.menu = false; draw(); } }
      if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-line],[data-node]")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles:true })); }
    });
  }

  function render(el, d, parts) {
    const fresh = !el.querySelector(".site-spill");
    root = el; data = d; wire(); M = null;
    if (fresh) { st.mode = "public"; st.off = new Set(); st.deg = 2; st.focus = null; st.card = null; st.menu = false; st.sug = false; st.pay = null; st.session = false; st.q = ""; }
    const [a, b] = parts || [];
    page = a === "report" ? { kind:"report", arg:decodeURIComponent(b || "") } : a === "map" ? { kind:"map" } : a === "search" ? { kind:"search", arg:decodeURIComponent(b || "") } : { kind:"search", arg:"" };
    st.q = page.kind === "search" ? page.arg : "";
    const pk = page.kind + ":" + (page.arg || ""); if (render.last !== pk) { st.card = null; st.focus = null; if (page.kind === "report") st.deg = 2; } render.last = pk;
    draw();
    const msg = GFB.messages;
    if (msg && msg.ready() && !msg.isLoaded()) msg.refresh().then(() => { if (root && root.querySelector(".site-spill") && location.hash.startsWith("#/spill")) { M = null; draw(); } }).catch(() => {});
  }
  function address(parts) {
    const [a, b] = parts || [];
    if (!signed()) return "";
    if (a === "map") return "/map";
    if (a === "report") return "/report/" + decodeURIComponent(b || "");
    if (a === "search" && b) return "/search?q=" + decodeURIComponent(b).toLowerCase();
    return "/search";
  }
  return { render, address, label: () => "Spill" };
})();
