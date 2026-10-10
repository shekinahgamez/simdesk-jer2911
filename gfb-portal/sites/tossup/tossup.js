/* Toss Up: the game night app everybody pulls out at a kickback. Looks like a group chat (GamePigeon style):
   pick a deck, it drops into the thread as a game bubble, tap the bubble, and the result comes back as a reply.
   List decks deal every card once before they reshuffle; weighted decks roll by percentage.
   Everything (decks, where each deck is, and the chat) saves through GFB.saveTossUp, so it syncs like the other apps.
   Only the two attraction decks can write anywhere else: a Sim's Registry file, one field each. */
const TossUp = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[“”"].*?[“”"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const first = n => stripNick(n).split(" ")[0];
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* fair picks: crypto when the browser has it */
  const pick01 = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch { return Math.random(); } };
  const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(pick01() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- the starting decks ---------- */
  const RELATIONSHIP = `Good:
They make it official: One of them asks, the other says yes.
First I love you: One says it first. Watch how the other reacts.
Surprise date: One plans a whole date without telling the other.
Meet the friends: They get brought around the friend group.
Meet the family: Somebody's going home to meet the parents.
Lost weekend: They spend the whole weekend together and nobody else sees them.
Home cooked: One cooks dinner for the other at their place.
Just because: A gift for no reason at all.
Showed up: One has a bad day and the other shows up without being asked.
Got a key: Somebody gets a key to the other's place.
Simsta official: They post each other for the first time.
Had their back: One defends the other in front of friends.
Make up: They have a fight and actually work it out.
Future talk: They talk about where this is going and it goes well.
Trip together: They take a vacation together.
Moving in: They move in together. Too soon? Up to you.

Bad:
Fizzle: They just stop calling. Nobody ends it; it ends.
Ghosted: One disappears with no explanation.
Caught flirting: One gets caught flirting with somebody else.
The ex: An ex comes back around and won't go away.
Jealous at the party: Somebody gets jealous in public and makes a scene.
Friend doesn't like them: A best friend can't stand the new person and says so.
Family says no: The family doesn't approve.
Money fight: They fight about money: who pays, who spends, who has it.
Uneven: One wants more and the other doesn't.
Caught in a lie: Somebody gets caught in a lie, big or small.
Forgot: One forgets something important, like a birthday.
Public argument: They have a full argument where everybody can see.
The kiss: One of them kisses somebody else.
Went through the phone: Somebody snoops and finds something.
Breakup: It's over. Somebody ends it.
Breakup, then hookup: They break up and end up together that same week anyway.
Too busy: Work takes over and they barely see each other.
Lifestyle clash: One wants to go out, the other wants to stay in. Every time.
Pregnancy scare: A scare. Play out how each of them handles it.
Secret's out: Something one of them was hiding comes out.

Twist:
Better as friends: They realize it's friendship and nothing more.
Situationship: They keep seeing each other but never put a label on it.
On a break: They take a break. Rules unclear.
Feelings for a friend: One starts catching feelings for somebody in the friend group.
Ran into the ex: They run into one of their exes together.
Long distance: One has to travel for a while.
Slow it down: They agree to take it slower.
Clear the air: They have an honest talk that changes things.
Nothing to say: They hang out and realize they don't have much to talk about.
New eyes: Somebody new catches one of their eyes.
Opportunity: One gets an opportunity that would take them away.
Picking sides: Mutual friends start picking sides.
Old flame: An old flame of one of them is back on the table.
Wrong timing: They like each other, but one of them isn't ready.`;
  const DRUNK = "Dances on the table, Calls the ex, Cries in the bathroom, Starts a fight, Kisses a stranger, Passes out on the couch, Falls asleep in somebody else's bed, Confesses a crush, Spills somebody's secret, Orders way too much food, Goes skinny dipping, Takes over the karaoke, Throws up, Picks a fight with their partner, Flirts with somebody who's taken, Tells everybody they love them, Tries to cook and burns it, Leaves without telling anybody, Brings somebody home, Makes a scene at the bar, Gets kicked out, Starts a dance-off, Invites everybody to an afterparty, Talks about their ex all night, Gets into it with their best friend, Hooks up with somebody they shouldn't, Late-night swim, Falls asleep outside, Gets emotional about family, Tries to get back with the ex, Overshares with a stranger, Starts a group hug, Insults the host, Sings terribly on purpose, Raids the fridge, Hits on the bartender, Breaks something, Shows up at somebody's door, Takes a dare, Says what they really think of a friend, Pulls a prank, Buys rounds for everybody, Hot tub gets out of hand, Becomes everybody's therapist, Goes home early and sulks, Kisses a friend, Sees something that kills the buzz, Gives their number to a stranger, Falls asleep in the bathtub, Best night of their life";

  /* style "cards": tag, title, one line. style "titles": title only. kind "weighted": outcomes with weights. */
  const DEFAULTS = () => [
    { id:"relationship", name:"Relationship", kind:"list", style:"cards", color:"#E0627A", glyph:"hearts", builtin:true, cards:parseList(RELATIONSHIP, "cards") },
    { id:"drunk", name:"Drunk", kind:"list", style:"titles", color:"#C7A2E0", glyph:"glass", builtin:true, cards:parseList(DRUNK, "titles") },
    { id:"sexual", name:"Sexual attraction", kind:"weighted", color:"#F4B58A", glyph:"flame", builtin:true, registry:"sexual_attraction",
      outcomes:[{ label:"Opposite sex", weight:80 }, { label:"Both", weight:13 }, { label:"Same sex", weight:7 }] },
    { id:"romantic", name:"Romantic attraction", kind:"weighted", color:"#E99ABF", glyph:"heart", builtin:true, registry:"romantic_attraction",
      outcomes:[{ label:"Opposite sex", weight:84 }, { label:"Both", weight:7 }, { label:"Same sex", weight:9 }] },
    { id:"yesno", name:"Yes or no", kind:"weighted", color:"#E8C27A", glyph:"coin", builtin:true,
      outcomes:[{ label:"Yes", weight:40 }, { label:"No", weight:40 }, { label:"Not yet", weight:12 }, { label:"Yes but it's awkward", weight:8 }] }
  ];
  const REG_LABEL = { sexual_attraction:"Sexual attraction", romantic_attraction:"Romantic attraction" };
  const TAG_COLOR = { good:"#9BD3AE", bad:"#F2A3B3", twist:"#F3D18E" };
  const GLYPHS = {
    hearts:'<path d="M9.5 18S3 14 3 9.2A3.4 3.4 0 0 1 9.5 7.6 3.4 3.4 0 0 1 16 9.2"/><path d="M15.5 20s-5-3-5-6.8a2.6 2.6 0 0 1 5-1.2 2.6 2.6 0 0 1 5 1.2c0 3.8-5 6.8-5 6.8z"/>',
    glass:'<path d="M6 4h12l-1.2 7.2a4.8 4.8 0 0 1-9.6 0z"/><path d="M12 16v4M8.5 20h7M7 8h10"/>',
    flame:'<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6z"/><path d="M12 21a2.5 2.5 0 0 1-2.5-2.5c0-1.6 1.4-2.6 2.5-4.5 1.1 1.9 2.5 2.9 2.5 4.5A2.5 2.5 0 0 1 12 21z"/>',
    heart:'<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    coin:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><path d="M10 12l1.4 1.4L14.3 10.6"/>',
    cards:'<rect x="4" y="6" width="10" height="14" rx="2" transform="rotate(-10 9 13)"/><rect x="10" y="4" width="10" height="14" rx="2" transform="rotate(8 15 11)"/>',
    star:'<path d="M12 3c.7 5 4 8.3 9 9-5 .7-8.3 4-9 9-.7-5-4-8.3-9-9 5-.7 8.3-4 9-9z"/>',
    bolt:'<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'
  };
  const glyph = (k, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[k] || GLYPHS.cards}</svg>`;
  let markN = 0;
  const MARK = () => { const g = "tuMk" + (++markN); return `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E0627A"/><stop offset="1" stop-color="#5A1A4E"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#${g})"/><rect x="14" y="17" width="23" height="30" rx="9" fill="#F7CBA6" fill-opacity=".75" transform="rotate(-14 25.5 32)"/><rect x="26" y="15" width="23" height="30" rx="9" fill="#FBEFE8" transform="rotate(9 37.5 30)"/><path d="M37.5 36.5s-6-3.6-6-8a3.3 3.3 0 0 1 6-1.9 3.3 3.3 0 0 1 6 1.9c0 4.4-6 8-6 8z" fill="#B0436B" transform="rotate(9 37.5 30)"/></svg>`; };

  /* ---------- list text in and out ---------- */
  /* cards: a line like "Good:" starts a tag; "Title: one line" is a card. titles: one per line, or one comma separated line. */
  function parseList(text, style) {
    const rows = String(text || "").replace(/\r/g, "").split("\n").map(x => x.trim()).filter(Boolean);
    if (style === "titles") {
      const items = rows.length === 1 ? rows[0].split(/\s*,\s*/) : rows;
      return dedupe(items.map(t => t.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).map(title => ({ tag:"", title, line:"" })));
    }
    let tag = ""; const out = [];
    for (const r of rows) {
      const head = r.match(/^([^:]{1,30}):$/);
      if (head) { tag = head[1].trim(); continue; }
      const clean = r.replace(/^[-*•]\s*/, ""), i = clean.indexOf(":");
      out.push(i > 0 ? { tag, title:clean.slice(0, i).trim(), line:clean.slice(i + 1).trim() } : { tag, title:clean, line:"" });
    }
    return dedupe(out);
  }
  const keyOf = c => (c.tag + "|" + c.title).toLowerCase();
  const dedupe = list => { const seen = new Set(); return list.filter(c => !seen.has(keyOf(c)) && seen.add(keyOf(c))); };
  function listText(deck) {
    if (deck.style === "titles") return deck.cards.map(c => c.title).join("\n");
    const groups = []; deck.cards.forEach(c => { let g = groups.find(x => x.tag === c.tag); if (!g) groups.push(g = { tag:c.tag, cards:[] }); g.cards.push(c); });
    return groups.map(g => (g.tag ? g.tag + ":\n" : "") + g.cards.map(c => c.line ? `${c.title}: ${c.line}` : c.title).join("\n")).join("\n\n");
  }

  /* ---------- saved state ---------- */
  let data = null, root = null, route = [], T = null;
  const st = { sheet:null, rolling:null, saving:null, err:null, scroll:true, fresh:null };
  function state() {
    const saved = data.tossup;
    T = saved && Array.isArray(saved.decks) ? saved : { decks:DEFAULTS(), drawn:{}, bags:{}, thread:[], for:"" };
    T.drawn = T.drawn || {}; T.bags = T.bags || {}; T.thread = T.thread || []; T.for = T.for || "";
    return T;
  }
  async function persist() { if (T.thread.length > 80) T.thread = T.thread.slice(-80); await GFB.saveTossUp(T); data = await GFB.getAll(); }
  const deckById = id => T.decks.find(d => d.id === id);
  const simById = id => data.sims.find(s => s.id === id);
  const left = d => d.kind === "list" ? d.cards.filter(c => !(T.drawn[d.id] || []).includes(keyOf(c))).length : 0;
  const deckSub = d => d.kind === "list" ? `${left(d)} of ${d.cards.length} left` : (d.registry ? "Rolls, saves to Registry" : "Rolls by percentage");

  /* ---------- playing ---------- */
  function deal(d) {
    const keys = d.cards.map(keyOf);
    let drawn = (T.drawn[d.id] || []).filter(k => keys.includes(k)), reshuffled = false;
    let todo = keys.filter(k => !drawn.includes(k));
    if (!todo.length) { reshuffled = !!drawn.length; drawn = []; todo = keys; }
    /* the bag keeps the shuffled order; new cards slide in somewhere in what's left */
    let bag = (T.bags[d.id] || []).filter(k => todo.includes(k));
    todo.filter(k => !bag.includes(k)).forEach(k => bag.splice(Math.floor(pick01() * (bag.length + 1)), 0, k));
    if (reshuffled || !T.bags[d.id]) bag = shuffle(bag);
    if (reshuffled && bag.length > 1 && bag[bag.length - 1] === T.last?.[d.id]) { const j = Math.floor(pick01() * (bag.length - 1)); [bag[j], bag[bag.length - 1]] = [bag[bag.length - 1], bag[j]]; }
    const k = bag.pop(); drawn.push(k);
    T.bags[d.id] = bag; T.drawn[d.id] = drawn; T.last = { ...(T.last || {}), [d.id]:k };
    const c = d.cards.find(x => keyOf(x) === k);
    return { tag:c.tag, title:c.title, line:c.line, left:keys.length - drawn.length, total:keys.length, reshuffled };
  }
  function roll(d) {
    const outs = d.outcomes.filter(o => Number(o.weight) > 0), sum = outs.reduce((a, o) => a + Number(o.weight), 0);
    let r = pick01() * sum;
    for (const o of outs) { r -= Number(o.weight); if (r < 0) return { label:o.label, pct:Math.round(Number(o.weight) / sum * 1000) / 10 }; }
    const o = outs[outs.length - 1]; return { label:o.label, pct:Math.round(Number(o.weight) / sum * 1000) / 10 };
  }
  async function send(id) {
    const d = deckById(id); if (!d) return;
    if (d.kind === "list" && !d.cards.length) { st.sheet = "edit:" + d.id; st.err = "This deck is empty. Add a few cards first."; draw(); return; }
    if (d.kind === "weighted" && !d.outcomes.some(o => Number(o.weight) > 0)) { st.sheet = "edit:" + d.id; st.err = "Give at least one result a percentage first."; draw(); return; }
    T.thread.push({ id:uid("m-"), deck:d.id, name:d.name, color:d.color, glyph:d.glyph, for:T.for || "", at:UI.gameToday(data.calendar), result:null });
    st.sheet = null; st.scroll = true; await persist(); draw();
  }
  async function play(mid) {
    const m = T.thread.find(x => x.id === mid), d = m && deckById(m.deck);
    if (!m || m.result || st.rolling) return;
    if (!d) { m.gone = true; draw(); return; }
    st.rolling = mid; draw();
    const wait = matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 750;
    await new Promise(r => setTimeout(r, wait));
    m.result = d.kind === "list" ? { type:"card", style:d.style, ...deal(d) } : { type:"roll", registry:d.registry || null, ...roll(d) };
    st.rolling = null; st.fresh = mid; st.scroll = true; await persist(); draw(); st.fresh = null;
  }

  /* ---------- the thread ---------- */
  const dateKey = a => a ? `${a.season}|${a.day}|${a.year}` : "";
  function bubbleOut(m) {
    const who = m.for && simById(m.for), rolling = st.rolling === m.id, d = deckById(m.deck);
    const cap = m.result ? "Played" : rolling ? (d && d.kind === "weighted" ? "Rolling…" : "Dealing…") : m.gone ? "Deck deleted" : "Tap to play";
    return `<div class="tu-row out"><div class="tu-stack">
      <button class="tu-game${m.result ? " done" : ""}${rolling ? " rolling" : ""}" style="--dc:${esc(m.color)}" data-play="${m.id}" ${m.result ? 'aria-disabled="true"' : ""} aria-label="${esc(m.name)}, ${cap}">
        <span class="tu-game-art"><span class="tu-game-dot">${glyph(m.glyph, "tu-game-gl")}</span></span>
        <span class="tu-game-foot"><b>${esc(m.name)}</b><small>${cap}</small></span></button>
      ${who ? `<small class="tu-for-cap">for ${esc(stripNick(who.name))}</small>` : ""}</div></div>`;
  }
  function bubbleIn(m) {
    const r = m.result; if (!r) return "";
    const tagC = r.tag ? (TAG_COLOR[r.tag.toLowerCase()] || m.color) : m.color;
    let body;
    if (r.type === "card") body = `<div class="tu-card${st.fresh === m.id ? " fresh" : ""}" style="--dc:${esc(m.color)}">
        <div class="tu-card-top">${r.tag ? `<span class="tu-tag" style="--tc:${tagC}">${esc(r.tag)}</span>` : `<span class="tu-deckname">${esc(m.name)}</span>`}<small>${r.left} of ${r.total} left</small></div>
        <p class="tu-title">${esc(r.title)}</p>${r.line ? `<p class="tu-line">${esc(r.line)}</p>` : ""}</div>`;
    else body = `<div class="tu-card roll${st.fresh === m.id ? " fresh" : ""}" style="--dc:${esc(m.color)}"><div class="tu-card-top"><span class="tu-deckname">${esc(m.name)}</span><small>${r.pct}% chance</small></div>
        <p class="tu-title big">${esc(r.label)}</p>${saveRow(m)}</div>`;
    return `${r.reshuffled ? `<p class="tu-sys">${esc(m.name)} deck reshuffled. Every card is back in.</p>` : ""}
      <div class="tu-row in"><span class="tu-av">${MARK()}</span><div class="tu-stack"><small class="tu-from">Toss Up</small>${body}</div></div>`;
  }
  function saveRow(m) {
    const r = m.result; if (!r.registry) return "";
    if (m.saved) { const s = simById(m.saved.sim); return `<p class="tu-saved">${glyph("coin")}<span>Saved to <a href="#/registry/${esc(m.saved.sim)}">${esc(s ? stripNick(s.name) : "their")}'s file</a> as ${esc(REG_LABEL[r.registry].toLowerCase())}${m.saved.prev && m.saved.prev !== r.label ? ` (was ${esc(m.saved.prev)})` : ""}</span></p>`; }
    if (st.saving !== m.id) return `<button class="tu-btn sm" data-tu="save:${m.id}">Save to Registry</button>`;
    const sims = [...data.sims].sort((a, b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    const cur = m.for || (data.settings || {}).acting_sim || "";
    return `<div class="tu-saveform"><span class="tu-lbl">Whose file? It goes in ${esc(REG_LABEL[r.registry].toLowerCase())}.</span>
      ${UI.picker({ id:"tu-savesim", value:cur, options:[{ v:"", t:"Pick a Sim" }, ...sims.map(s => ({ v:s.id, t:stripNick(s.name), s:s[r.registry] ? REG_LABEL[r.registry] + ": " + s[r.registry] : (s.household || "") }))], placeholder:"Search Sims", cls:"field up", label:"Sim" })}
      ${st.err && st.saving === m.id ? `<p class="tu-err">${esc(st.err)}</p>` : ""}
      <div class="tu-acts"><button class="tu-btn ghost sm" data-tu="unsave">Cancel</button><button class="tu-btn sm" data-tu="dosave:${m.id}">Save</button></div></div>`;
  }
  function thread() {
    if (!T.thread.length) return `<div class="tu-empty">${MARK()}<b>Game night</b><p>Pick a deck down below and it drops in here. Tap it to play.</p></div>`;
    let last = "", out = "";
    for (const m of T.thread) {
      const k = dateKey(m.at);
      if (k !== last) { out += `<p class="tu-stamp">${esc(UI.gameLabel(m.at))}</p>`; last = k; }
      out += bubbleOut(m) + bubbleIn(m);
    }
    return out;
  }

  /* ---------- decks list, tray, sheets ---------- */
  const tile = d => `<span class="tu-tile" style="--dc:${esc(d.color)}"><span class="tu-dot">${glyph(d.glyph)}</span></span>`;
  const deckRows = () => T.decks.map(d => `<div class="tu-deckrow"><button class="tu-deckmain" data-send="${d.id}">${tile(d)}<span><b>${esc(d.name)}</b><small>${esc(deckSub(d))}</small></span></button>
      <button class="tu-icobtn" data-tu="edit:${d.id}" aria-label="Edit ${esc(d.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button></div>`).join("")
    + `<button class="tu-newdeck" data-tu="new">+ New deck</button>`;
  const tray = () => `<div class="tu-tray" role="toolbar" aria-label="Decks">${T.decks.map(d => `<button class="tu-trayb" data-send="${d.id}" title="Send ${esc(d.name)}">${tile(d)}<span>${esc(d.name)}</span></button>`).join("")}</div>`;

  const field = (label, inner, cls = "") => `<label class="tu-f ${cls}"><span>${label}</span>${inner}</label>`;
  const colorField = c => field("Color", `<span class="tu-colorrow"><input type="color" name="color" value="${esc(c)}">${["#E0627A","#F4B58A","#F7CBA6","#E8C27A","#E99ABF","#C7A2E0","#B86B9A","#9FC3A8"].map(x => `<button type="button" class="tu-sw" style="background:${x}" data-swatch="${x}" aria-label="Use ${x}"></button>`).join("")}</span>`);
  const glyphField = g => field("Picture", `<span class="tu-glyphs">${Object.keys(GLYPHS).map(k => `<label class="tu-gl"><input type="radio" name="glyph" value="${k}" ${k === g ? "checked" : ""}>${glyph(k)}</label>`).join("")}</span>`);
  const wRow = (o = { label:"", weight:"" }) => `<div class="tu-wrow"><input name="label" value="${esc(o.label)}" placeholder="Result" aria-label="Result"><span class="tu-pct"><input name="weight" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(o.weight)}" aria-label="Percent"><i>%</i></span><button type="button" class="tu-icobtn" data-tu="rmrow" aria-label="Remove">×</button></div>`;
  const total = d => d.outcomes.reduce((a, o) => a + (Number(o.weight) || 0), 0);
  const totalNote = t => Math.abs(t - 100) < 0.05 ? `Adds up to 100%.` : `Adds up to ${Math.round(t * 10) / 10}%. That still works: each one counts in proportion.`;

  function sheet() {
    const [kind, id] = (st.sheet || "").split(":"), err = st.err ? `<p class="tu-err">${esc(st.err)}</p>` : "";
    if (kind === "decks") return `<div class="tu-sheet"><div class="tu-sheethead"><h2>Decks</h2><button class="tu-btn ghost sm" data-tu="close">Done</button></div><div class="tu-decklist">${deckRows()}</div></div>`;
    if (kind === "new") return `<form class="tu-sheet" data-f="new"><h2>New deck</h2>
        ${field("Name", `<input name="name" required placeholder="Like Who pays">`)}
        ${field("How it plays", `<select name="type"><option value="titles">Cards with a title</option><option value="cards">Cards with a tag, title, and one line</option><option value="weighted">Roll by percentage</option></select>`)}
        ${colorField("#C7A2E0")}${err}
        <div class="tu-acts"><button type="button" class="tu-btn ghost" data-tu="close">Cancel</button><button class="tu-btn" type="submit">Make deck</button></div></form>`;
    if (kind !== "edit") return "";
    const d = deckById(id); if (!d) return "";
    const list = d.kind === "list" ? field(`Cards <em>${d.cards.length}</em>`, `<textarea name="list" class="tu-list" spellcheck="false">${esc(listText(d))}</textarea>`) +
        `<p class="tu-help">${d.style === "cards" ? "One card per line, written as <b>Title: one line</b>. A line like <b>Good:</b> on its own starts a tag, and the cards under it get that tag. Edit, add, or paste a whole new list right in the box." : "One card per line, or paste them all on one line with commas between. Edit, add, or paste a whole new list right in the box."} Cards you keep stay where they are in the deck; new ones get shuffled into what's left.</p>`
      : `<div class="tu-f"><span>Results and percentages</span><div class="tu-wrows">${d.outcomes.map(wRow).join("")}</div>
          <button type="button" class="tu-textbtn" data-tu="addrow">+ Add a result</button><p class="tu-help" id="tu-total">${totalNote(total(d))}</p>
          ${d.registry ? `<p class="tu-help">Results here can be saved to a Sim's Registry file as <b>${REG_LABEL[d.registry].toLowerCase()}</b>.</p>` : ""}</div>`;
    return `<form class="tu-sheet wide" data-f="edit" data-id="${d.id}"><div class="tu-sheethead"><h2>${tile(d)} Edit deck</h2></div>
      <div class="tu-f2">${field("Name", `<input name="name" value="${esc(d.name)}" required>`)}${colorField(d.color)}</div>
      ${glyphField(d.glyph)}${list}${err}
      ${d.kind === "list" ? `<p class="tu-help tu-where">${esc(deckSub(d))}. ${left(d) === d.cards.length ? "Fresh deck." : "The deck reshuffles on its own once every card has come up."}</p>` : ""}
      <div class="tu-acts">${d.kind === "list" ? `<button type="button" class="tu-btn ghost sm" data-tu="reshuffle:${d.id}">Reshuffle now</button>` : ""}
        ${d.builtin ? `<button type="button" class="tu-btn ghost sm" data-tu="reset:${d.id}">Reset to original</button>` : `<button type="button" class="tu-btn danger sm" data-tu="del:${d.id}">Delete deck</button>`}
        <span class="tu-grow"></span><button type="button" class="tu-btn ghost" data-tu="close">Cancel</button><button class="tu-btn" type="submit">Save</button></div></form>`;
  }

  function draw() {
    if (!root) return;
    const prev = root.querySelector(".tu-thread"), keep = prev && !st.scroll ? prev.scrollTop : null;
    const sims = [...data.sims].sort((a, b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    const who = T.for && simById(T.for);
    root.innerHTML = `<div class="site-tu">
      <aside class="tu-side"><div class="tu-brand">${MARK()}<span>Toss Up</span></div><h3>Decks</h3><div class="tu-decklist">${deckRows()}</div>
        <p class="tu-side-note">Tap a deck to drop it in the chat.</p></aside>
      <section class="tu-chat">
        <header class="tu-top"><span class="tu-faces">${T.decks.slice(0, 3).map(tile).join("")}</span>
          <span class="tu-topt"><b>Game night</b><small>${T.decks.length} decks${who ? " · playing for " + esc(first(who.name)) : ""}</small></span>
          <button class="tu-btn ghost sm tu-only-narrow" data-tu="decks">Decks</button>
          ${T.thread.length ? `<button class="tu-btn ghost sm" data-tu="clear">Clear chat</button>` : ""}</header>
        <div class="tu-thread" id="tu-thread" aria-live="polite">${thread()}</div>
        <footer class="tu-compose"><div class="tu-forrow"><span class="tu-lbl">Playing for</span>${UI.picker({ id:"tu-for", value:T.for || "", options:[{ v:"", t:"Nobody in particular" }, ...sims.map(s => ({ v:s.id, t:stripNick(s.name), s:s.household || "" }))], placeholder:"Search Sims", cls:"up", label:"Playing for" })}</div>
          ${tray()}</footer>
      </section>
      ${st.sheet ? `<div class="tu-modal">${sheet()}</div>` : ""}</div>`;
    const th = root.querySelector(".tu-thread");
    if (th) { if (st.scroll) th.scrollTop = th.scrollHeight; else if (keep != null) th.scrollTop = keep; }
    st.scroll = false;
  }

  /* ---------- saving forms ---------- */
  async function submit(form) {
    const f = new FormData(form), v = k => String(f.get(k) || "").trim();
    try {
      if (form.dataset.f === "new") {
        const type = v("type"), d = { id:uid("deck-"), name:v("name") || "New deck", color:v("color") || "#C7A2E0", glyph:type === "weighted" ? "coin" : "cards" };
        Object.assign(d, type === "weighted" ? { kind:"weighted", outcomes:[{ label:"Yes", weight:50 }, { label:"No", weight:50 }] } : { kind:"list", style:type, cards:[] });
        T.decks.push(d); await persist(); st.err = null; st.sheet = "edit:" + d.id; draw(); return;
      }
      const d = deckById(form.dataset.id); if (!d) return;
      const next = { ...d, name:v("name") || d.name, color:v("color") || d.color, glyph:v("glyph") || d.glyph };
      if (d.kind === "list") {
        next.cards = parseList(f.get("list"), d.style);
        if (!next.cards.length) throw new Error("Add at least one card.");
      } else {
        const labels = f.getAll("label").map(x => String(x).trim()), weights = f.getAll("weight").map(x => parseFloat(x));
        next.outcomes = labels.map((label, i) => ({ label, weight:weights[i] > 0 ? Math.round(weights[i] * 10) / 10 : 0 })).filter(o => o.label);
        if (!next.outcomes.some(o => o.weight > 0)) throw new Error("Give at least one result a percentage.");
      }
      T.decks = T.decks.map(x => x.id === d.id ? next : x);
      await persist(); st.sheet = null; st.err = null; draw();
    } catch (e) { st.err = e.message; draw(); }
  }
  async function saveToRegistry(mid) {
    const m = T.thread.find(x => x.id === mid), simId = root.querySelector("#tu-savesim")?.value;
    if (!m || !m.result) return;
    if (!simId) { st.err = "Pick whose file this goes in."; draw(); return; }
    const s = simById(simId), field = m.result.registry;
    try {
      const prev = s[field] || null;
      await GFB.saveSim(simId, { [field]:m.result.label });
      m.saved = { sim:simId, prev }; st.saving = null; st.err = null; await persist(); draw();
    } catch (e) { st.err = e.message; draw(); }
  }

  /* ---------- events ---------- */
  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-tu");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.classList.contains("tu-modal")) { st.sheet = null; st.err = null; draw(); return; }
      const sw = t.closest("[data-swatch]"); if (sw) { const c = sw.closest("form").querySelector('input[name="color"]'); if (c) c.value = sw.dataset.swatch; return; }
      const sd = t.closest("[data-send]"); if (sd) { await send(sd.dataset.send); return; }
      const pl = t.closest("[data-play]"); if (pl) { await play(pl.dataset.play); return; }
      const b = t.closest("[data-tu]"); if (!b) return;
      const [act, a] = b.dataset.tu.split(":");
      if (act === "addrow") { b.previousElementSibling.insertAdjacentHTML("beforeend", wRow()); b.previousElementSibling.lastElementChild.querySelector("input").focus(); return; }
      if (act === "rmrow") { const rows = b.closest(".tu-wrows"); if (rows.children.length > 1) b.closest(".tu-wrow").remove(); retotal(b.closest("form")); return; }
      if (act === "save") { st.saving = a; st.err = null; draw(); return; }
      if (act === "unsave") { st.saving = null; st.err = null; draw(); return; }
      if (act === "dosave") { await saveToRegistry(a); return; }
      if (act === "clear") { if (!UI.confirmTap(b, "Tap again to clear")) return; T.thread = []; st.saving = null; await persist(); draw(); return; }
      if (act === "reshuffle") { if (!UI.confirmTap(b, "Tap again to reshuffle")) return; T.drawn[a] = []; delete T.bags[a]; await persist(); draw(); return; }
      if (act === "reset") { if (!UI.confirmTap(b, "Tap again to reset")) return; const fresh = DEFAULTS().find(x => x.id === a); if (fresh) { T.decks = T.decks.map(x => x.id === a ? fresh : x); T.drawn[a] = []; delete T.bags[a]; } st.err = null; await persist(); draw(); return; }
      if (act === "del") { if (!UI.confirmTap(b, "Tap again to delete")) return; T.decks = T.decks.filter(x => x.id !== a); delete T.drawn[a]; delete T.bags[a]; st.sheet = null; await persist(); draw(); return; }
      if (act === "close") { st.sheet = null; st.err = null; draw(); return; }
      if (act === "decks" || act === "new") { st.sheet = act; st.err = null; draw(); return; }
      if (act === "edit") { st.sheet = "edit:" + a; st.err = null; draw(); return; }
    });
    const retotal = form => { const out = form && form.querySelector("#tu-total"); if (!out) return; const t = [...form.querySelectorAll('input[name="weight"]')].reduce((s, i) => s + (parseFloat(i.value) || 0), 0); out.textContent = totalNote(t); };
    document.addEventListener("input", e => { if (mine(e.target) && e.target.name === "weight") retotal(e.target.closest("form")); });
    document.addEventListener("change", async e => { if (mine(e.target) && e.target.id === "tu-for") { T.for = e.target.value; await persist(); draw(); } });
    document.addEventListener("submit", e => { if (mine(e.target) && e.target.dataset.f) { e.preventDefault(); submit(e.target); } });
  }

  function render(el, d, parts) { root = el; data = d; route = parts || []; state(); st.sheet = null; st.saving = null; st.err = null; st.scroll = true; bind(); draw(); }
  return { render };
})();
