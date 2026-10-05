/* Porchlight Credit Union (SimFinancial in game): online-only member banking + Member Services.
   Started as a copy of Harbor Trust; adds credit cards, credit scores, and SimFinancial loan statuses. */
const Porchlight = (() => {
  const st = { modal:null, msg:null, err:null, staffTab:"accounts" };
  let data = null, root = null, route = [];

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const money = n => (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n || 0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmt = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";
  const today = () => new Date().toISOString().slice(0,10);
  const stripNick = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").trim();
  const sim = id => data.sims.find(s => s.id === id);
  const acct = id => data.accounts.find(a => a.id === id);
  /* Both banks share the accounts and loans tables. Each row has bank: "harbor" or "porchlight". */
  const BANK = "porchlight", BANK_NAME = "Porchlight", BANKS = { harbor:"Harbor Trust", porchlight:"Porchlight" };
  const DEFAULTS = { account_type:["Personal checking","Joint checking","Savings","Minor checking","Minor savings","Business","Retirement","Trust fund","Brokerage"], loan_type:["Personal loan","Mortgage","Business loan"] };
  const LOAN_STATUS = ["Current","Delinquent","Defaulted","Paid off"], CARD_STATUS = ["Active","Maxed out","Charged off","Closed"];
  const cards = () => data.accounts.filter(a => here(a) && a.card);
  const cardsOf = simId => cards().filter(c => c.holder_sim === simId);
  const usage = c => Math.min(100, Math.round(Number(c.balance) / Math.max(1, Number(c.limit)) * 100));
  const cardRow = (c, go) => `<${go ? `button class="pc-acct" data-go="${go}"` : `div class="pc-acct"`}><span><span class="nm">Porchlight card</span><br><span class="no">••${esc(c.number)}${c.status !== "Active" ? ` <span class="pc-tag ${slug(c.status)}">${esc(c.status)}</span>` : ""}</span>
      <span class="pc-use"><i style="width:${usage(c)}%"></i></span><span class="no">${money(Number(c.limit) - Number(c.balance))} available of ${money(c.limit)}</span></span><span class="pc-amt">${money(c.balance)}<small>Owed</small></span></${go ? "button" : "div"}>`;
  const scoreOf = id => (sim(id) || {}).credit_score;
  const types = k => data.options[BANK + "_" + k] || DEFAULTS[k];
  const here = a => (a.bank || "harbor") === BANK;
  const accts = () => data.accounts.filter(a => here(a) && !a.card);
  const bankLoans = () => data.loans.filter(l => (l.bank || "harbor") === BANK);
  const simName = id => stripNick((sim(id) || {}).name || id);
  const holder = a => { if (!a) return ""; const base = a.holder_sim ? simName(a.holder_sim) : a.holder_name; return a.co_holder ? base + " & " + simName(a.co_holder) : base; };
  const fullLabel = a => `${holder(a)}, ${a.type} ••${a.number}${here(a) ? "" : " (" + BANKS[a.bank || "harbor"] + ")"}`;
  const tags = a => (a.co_holder ? ` <span class="pc-tag joint">Joint</span>` : "") + (a.minor ? ` <span class="pc-tag minor">Minor</span>` : "");
  const simOpts = (sel, blank) => `<option value="">${blank}</option>` + [...data.sims].sort((a,b) => stripNick(a.name).localeCompare(stripNick(b.name))).map(x => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(stripNick(x.name))}</option>`).join("");
  const acctLabel = a => `${a.type} ••${a.number}`;
  const acctsOf = simId => accts().filter(a => a.holder_sim === simId || a.co_holder === simId || (a.custodians || []).includes(simId));
  const txFor = ids => data.transactions.filter(t => ids.includes(t.from_account) || ids.includes(t.to_account));
  const loansFor = s => bankLoans().filter(l => l.borrower === stripNick(s.name) || (s.household && l.borrower === s.household));
  const lotName = id => (data.lots.find(l => l.id === id) || {}).address;
  const slug = v => String(v || "").replace(/[^a-z]+/gi, "-");
  const go = h => { location.hash = "#/porchlight" + (h ? "/" + h : ""); };
  const opt = (list, val, blank) => { list = val && !list.includes(val) ? [val, ...list] : list; return `${blank ? `<option value="">${blank}</option>` : ""}${list.map(o => `<option ${o===val?"selected":""}>${esc(o)}</option>`).join("")}`; };
  const newNumber = () => { let n; do { n = String(1000 + Math.floor(Math.random()*9000)); } while (data.accounts.some(a => a.number === n)); return n; };

  /* doorway mark: roof, two pillars, a lit door, front steps */
  const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M5 25L32 7L59 25V31L32 14L5 31Z" fill="currentColor"/><rect x="13" y="28" width="9" height="21" fill="currentColor"/><rect x="42" y="28" width="9" height="21" fill="currentColor"/><rect x="24" y="25" width="16" height="3.5" fill="currentColor"/><rect x="26.5" y="31" width="11" height="18" fill="#F4B942"/><rect x="9" y="51" width="46" height="3.5" fill="currentColor"/><rect x="5" y="56.5" width="54" height="3.5" fill="currentColor"/></svg>`;

  function bar(right, sub){
    return `<div class="pc-bar"><button class="pc-mark" data-go="">${MARK}<span><b>Porchlight</b><small>CREDIT UNION</small></span></button><span class="spacer"></span>${right || ""}</div>${sub || ""}`;
  }

  /* one row per transaction, signed from the point of view of the given accounts */
  function txRows(list, mine, clickable){
    if (!list.length) return `<p class="pc-empty">No activity yet.</p>`;
    return `<div class="pc-scroll"><table class="pc-tx"><thead><tr><th>Date</th><th>Description</th><th>Account</th><th class="num">Amount</th></tr></thead><tbody>${list.map(t => {
      const out = mine ? mine.includes(t.from_account) && !mine.includes(t.to_account) : false;
      const inn = mine ? mine.includes(t.to_account) && !mine.includes(t.from_account) : false;
      const from = t.from_account ? holder(acct(t.from_account)) : (t.kind === "deposit" ? "Deposit" : t.counterparty);
      const to = t.to_account ? holder(acct(t.to_account)) : (t.kind === "withdrawal" ? "Withdrawal" : t.counterparty);
      const desc = t.kind === "charge" ? esc(t.counterparty || "Card spending") : t.to_account && acct(t.to_account)?.card ? `Card payment${t.from_account ? ", from " + esc(holder(acct(t.from_account))) : ""}` : t.loan_id ? `Loan payment, ${esc(lotName((data.loans.find(l => l.id === t.loan_id) || {}).lot_id) || "loan")}` : `${esc(from || "")} to ${esc(to || "")}`;
      const which = mine ? (out ? acct(t.from_account) : acct(t.to_account)) : acct(t.from_account || t.to_account);
      const sign = mine ? (out ? "neg" : inn ? "pos" : "") : "";
      return `<tr ${clickable && which ? `class="click" data-go="staff/a/${which.id}"` : ""}><td>${fmt(t.date)}</td><td>${desc}${t.memo ? `<div class="memo">${esc(t.memo)}</div>` : ""}</td><td>${which ? esc(acctLabel(which)) : ""}</td><td class="num ${sign}">${sign === "neg" ? "-" : sign === "pos" ? "+" : ""}${money(t.amount).replace("-","")}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  /* ---------- sign in ---------- */
  function loginHTML(){
    const nav = `<nav class="pc-nav"><button data-jump="pc-ways">Ways to bank</button><button data-jump="pc-about">About us</button><button class="pc-cta" data-jump="pc-login">Member sign in</button></nav>`;
    return `${bar(nav)}<div class="pc-home">
      <section class="pc-hero"><div class="pc-herotext"><h1>Stronger together.</h1><p>Online banking for Simerican families. No branches, no lines, and the light is always on.</p>
        <form class="pc-signin" id="pc-login"><h2>Member sign in</h2>
          <div class="pc-field">Member${UI.picker({ name:"who", cls:"field", options:[...data.sims].sort((a, b) => stripNick(a.name).localeCompare(stripNick(b.name))).map(s => ({ v:s.id, t:stripNick(s.name) })), placeholder:"Search members", label:"Member" })}</div>
          <button class="pc-btn amber" type="submit">Sign in</button>
          <div class="pc-staff">Porchlight staff? <button type="button" data-go="staff">Open Member Services</button></div>
        </form></div></section>
      <section class="pc-band" id="pc-ways"><h2>Ways to bank</h2><div class="pc-ways">
        <div><b>Online banking</b><p>Check balances, move money, and pay your card from any device.</p></div>
        <div><b>The Porchlight app</b><p>Everything online banking does, in your pocket.</p></div>
        <div><b>Mobile deposit</b><p>Snap a photo of a check and it lands in your account.</p></div>
        <div><b>No branches, ever</b><p>We're online only, so more of what we save goes back to members.</p></div></div></section>
      <section class="pc-band alt" id="pc-about"><h2>About us</h2><p class="pc-about">Porchlight is member-owned. There are no outside shareholders, so every member gets a say and every dollar stays close to home. Checking, savings, credit cards, and loans for the everyday families who keep the neighborhood going.</p></section>
      <footer class="pc-foot">Federally insured by SNCUA. Equal housing opportunity.</footer></div>`;
  }

  /* ---------- customer ---------- */
  function customerHTML(simId, acctId){
    const s = sim(simId); if (!s) { go(""); return ""; }
    const mine = acctsOf(simId), ids = mine.map(a => a.id), loans = loansFor(s);
    const right = `<span class="who">Signed in as <b>${esc(stripNick(s.name))}</b></span><button class="pc-link" data-go="">Sign out</button>`;
    const myCards = cardsOf(simId);
    if (acctId && myCards.some(c => c.id === acctId)){
      const c = acct(acctId);
      return `${bar(right)}<div class="pc-page"><button class="pc-back" data-go="c/${simId}">Back to accounts</button>
        <div class="pc-head"><h2>Porchlight card ••${esc(c.number)}</h2><div class="pc-amt">${money(c.balance)}<small>Owed of ${money(c.limit)}</small></div></div>
        <div class="pc-card">${cardRow(c)}</div><div class="pc-card" style="margin-top:20px"><h3>Activity</h3>${txRows(txFor([c.id]), [c.id])}</div></div>`;
    }
    if (acctId && ids.includes(acctId)){
      const a = acct(acctId);
      return `${bar(right)}<div class="pc-page"><button class="pc-back" data-go="c/${simId}">Back to accounts</button>
        <div class="pc-head"><h2>${esc(acctLabel(a))}</h2><div class="pc-amt">${money(a.balance)}<small>Available balance</small></div></div>
        <div class="pc-card"><h3>Activity</h3>${txRows(txFor([a.id]), [a.id])}</div></div>`;
    }
    const others = data.accounts.filter(a => !ids.includes(a.id) && a.status === "Active" && !a.card);
    return `${bar(right)}<div class="pc-page">
      <h1 class="pc-greet">Good to see you, ${esc(stripNick(s.name).split(" ")[0])}.</h1><p class="pc-date">${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p>
      <div class="pc-grid"><div>
        <div class="pc-card"><h3>Accounts</h3>${mine.length ? mine.map(a => `<button class="pc-acct" data-go="c/${simId}/${a.id}"><span><span class="nm">${esc(a.type)}</span><br><span class="no">••${esc(a.number)}${tags(a)}${a.status !== "Active" ? ` <span class="pc-tag ${slug(a.status)}">${esc(a.status)}</span>` : ""}</span></span><span class="pc-amt">${money(a.balance)}<small>Available</small></span></button>`).join("") : `<p class="pc-empty">No accounts at Porchlight yet. Staff can open one in Member Services.</p>`}</div>
        ${myCards.length ? `<div class="pc-card" style="margin-top:20px"><h3>Credit cards</h3>${myCards.map(c => cardRow(c, `c/${simId}/${c.id}`)).join("")}</div>` : ""}
        ${loans.length ? `<div class="pc-card" style="margin-top:20px"><h3>Loans</h3>${loans.map(l => `<div class="pc-acct" style="cursor:default"><span><span class="nm">${esc(l.type)}${l.lot_id ? ", " + esc(lotName(l.lot_id)) : ""}</span><br><span class="no">${money(l.monthly || 0)} a month <span class="pc-tag ${slug(l.status)}">${esc(l.status)}</span></span></span><span class="pc-amt">${money(l.balance)}<small>Remaining</small></span></div>`).join("")}</div>` : ""}
        <div class="pc-card" style="margin-top:20px"><h3>Recent activity</h3>${txRows(txFor(ids).slice(0,12), ids)}</div>
      </div>
      <aside class="pc-side">${scoreOf(simId) ? `<div class="pc-card pc-score"><h3>Credit score</h3><b>${esc(scoreOf(simId))}</b></div>` : ""}<div class="pc-card"><h3>Send money</h3>${mine.length ? `<form id="pc-send">
        <label class="pc-field">From<select name="from">${mine.filter(a => a.status === "Active").map(a => `<option value="${a.id}">${esc(acctLabel(a))} (${money(a.balance)})</option>`).join("")}</select></label>
        <label class="pc-field">To<select name="to">${others.map(a => `<option value="${a.id}">${esc(fullLabel(a))}</option>`).join("")}${myCards.filter(c => c.status !== "Closed").map(c => `<option value="${c.id}">Pay my Porchlight card ••${esc(c.number)} (${money(c.balance)} owed)</option>`).join("")}<option value="ext">Someone outside Porchlight</option></select></label>
        <label class="pc-field">Payee name (outside Porchlight only)<input name="payee"></label>
        ${loans.filter(l => l.status !== "Paid off").length ? `<label class="pc-field">Or pay a loan<select name="loan"><option value="">No</option>${loans.filter(l => l.status !== "Paid off").map(l => `<option value="${l.id}">${esc(l.type)}${l.lot_id ? ", " + esc(lotName(l.lot_id)) : ""}</option>`).join("")}</select></label>` : ""}
        <label class="pc-field">Amount<input name="amount" inputmode="decimal" placeholder="0.00" required></label>
        <label class="pc-field">Memo<input name="memo" placeholder="Shows on both statements"></label>
        <button class="pc-btn brass" type="submit">Send</button>
        ${st.err ? `<p class="pc-err">${esc(st.err)}</p>` : ""}${st.msg ? `<p class="pc-ok">${esc(st.msg)}</p>` : ""}
      </form>` : `<p class="pc-empty">Open an account first.</p>`}</div></aside></div></div>`;
  }

  /* ---------- staff ---------- */
  function staffHTML(acctId){
    const right = `<span class="who">Member Services</span><button class="pc-link" data-go="">Exit</button>`;
    const tabs = [["accounts","Accounts"],["cards","Cards"],["loans","Loans"],["credit","Credit scores"],["activity","All activity"],["types","Types"]];
    const sub = `<div class="pc-sub">${tabs.map(([k,v]) => `<button data-tab="${k}" aria-current="${!acctId && st.staffTab===k}">${v}</button>`).join("")}</div>`;
    if (acctId && acct(acctId)?.card){
      const c = acct(acctId);
      return `${bar(right, sub)}<div class="pc-page"><button class="pc-back" data-tab="cards">Back to cards</button>
        <div class="pc-head"><div><h2>${esc(holder(c))}</h2><p class="pc-date" style="margin:2px 0 0">Porchlight card ••${esc(c.number)}, opened ${fmt(c.opened)} <span class="pc-tag ${slug(c.status)}">${esc(c.status)}</span></p></div>
          <div class="pc-amt">${money(c.balance)}<small>Owed of ${money(c.limit)}</small></div></div>
        <div class="pc-actions" style="margin-bottom:18px"><button class="pc-btn amber" data-modal="spend:${c.id}">Add spending</button><button class="pc-btn" data-modal="pay:${c.id}">Record a payment</button><button class="pc-btn ghost" data-modal="card:${c.id}">Edit card</button></div>
        <div class="pc-card" style="margin-bottom:18px">${cardRow(c)}</div>
        ${c.staff_notes ? `<div class="pc-card" style="margin-bottom:18px"><h3>Staff notes <small>Never shown to the member</small></h3><p style="padding:14px 20px;margin:0;white-space:pre-wrap">${esc(c.staff_notes)}</p></div>` : ""}
        <div class="pc-card"><h3>Activity</h3>${txRows(txFor([c.id]), [c.id])}</div></div>`;
    }
    if (acctId && acct(acctId)){
      const a = acct(acctId);
      return `${bar(right, sub)}<div class="pc-page"><button class="pc-back" data-tab="accounts">Back to accounts</button>
        <div class="pc-head"><div><h2>${esc(holder(a))}</h2><p class="pc-date" style="margin:2px 0 0">${esc(acctLabel(a))}${tags(a)}${a.minor && (a.custodians || []).length ? ` <span class="memo">Custodian: ${esc(a.custodians.map(simName).join(" and "))}</span>` : ""}, opened ${fmt(a.opened)} <span class="pc-tag ${slug(a.status)}">${esc(a.status)}</span></p></div>
          <div class="pc-amt">${money(a.balance)}<small>Balance</small></div></div>
        <div class="pc-actions" style="margin-bottom:18px"><button class="pc-btn brass" data-modal="post:${a.id}">Post a transaction</button><button class="pc-btn ghost" data-modal="acct:${a.id}">Edit account</button></div>
        ${a.staff_notes ? `<div class="pc-card" style="margin-bottom:18px"><h3>Staff notes <small>Never shown to the member</small></h3><p style="padding:14px 20px;margin:0;white-space:pre-wrap">${esc(a.staff_notes)}</p></div>` : ""}
        <div class="pc-card"><h3>Activity</h3>${txRows(txFor([a.id]), [a.id])}</div></div>`;
    }
    const deposits = accts().filter(a => a.status !== "Closed").reduce((n,a) => n + Number(a.balance), 0);
    const owed = bankLoans().filter(l => l.status !== "Paid off").reduce((n,l) => n + Number(l.balance), 0);
    const stats = `<div class="pc-stats"><div class="pc-stat"><span>Total deposits</span><b>${money(deposits)}</b></div><div class="pc-stat"><span>Open accounts</span><b>${accts().filter(a => a.status !== "Closed").length}</b></div><div class="pc-stat"><span>Loans outstanding</span><b>${money(owed)}</b></div><div class="pc-stat"><span>Owed on cards</span><b>${money(cards().filter(c => c.status !== "Closed").reduce((n,c) => n + Number(c.balance), 0))}</b></div></div>`;
    let body = "";
    if (st.staffTab === "accounts") body = `<div class="pc-head"><h2>Accounts</h2><div class="pc-actions"><button class="pc-btn brass" data-modal="acct:new">Open an account</button></div></div>
      <div class="pc-card">${accts().length ? `<div class="pc-scroll"><table class="pc-tx"><thead><tr><th>Holder</th><th>Account</th><th>Status</th><th class="num">Balance</th></tr></thead><tbody>${accts().sort((a,b) => b.balance - a.balance).map(a => `<tr class="click" data-go="staff/a/${a.id}"><td><b>${esc(holder(a))}</b></td><td>${esc(acctLabel(a))}${tags(a)}</td><td><span class="pc-tag ${slug(a.status)}">${esc(a.status)}</span></td><td class="num">${money(a.balance)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="pc-empty">No accounts yet.</p>`}</div>`;
    if (st.staffTab === "cards") body = `<div class="pc-head"><h2>Credit cards</h2><div class="pc-actions"><button class="pc-btn amber" data-modal="card:new">Issue a card</button></div></div>
      <div class="pc-card">${cards().length ? `<div class="pc-scroll"><table class="pc-tx"><thead><tr><th>Holder</th><th>Card</th><th>Status</th><th class="num">Owed</th><th class="num">Limit</th></tr></thead><tbody>${cards().map(c => `<tr class="click" data-go="staff/a/${c.id}"><td><b>${esc(holder(c))}</b></td><td>••${esc(c.number)}</td><td><span class="pc-tag ${slug(c.status)}">${esc(c.status)}</span></td><td class="num">${money(c.balance)}</td><td class="num">${money(c.limit)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="pc-empty">No cards issued yet.</p>`}</div>`;
    if (st.staffTab === "credit") {
      const members = [...new Set([...data.accounts.filter(here).flatMap(a => [a.holder_sim, a.co_holder]), ...data.sims.filter(x => x.credit_score).map(x => x.id)].filter(Boolean))].map(sim).filter(Boolean).sort((a,b) => stripNick(a.name).localeCompare(stripNick(b.name)));
      body = `<div class="pc-head"><h2>Credit scores</h2></div><form class="pc-card pc-types" id="pc-credit"><p class="pc-note">Members with a Porchlight account or card. Copy the score from the game whenever it changes.</p>
        ${members.length ? `<div class="pc-scores">${members.map(m => `<label class="pc-field">${esc(stripNick(m.name))}<input name="cs_${m.id}" inputmode="numeric" value="${esc(m.credit_score)}" placeholder="Not on file"></label>`).join("")}</div>` : `<p class="pc-empty">Open an account for someone first.</p>`}
        ${st.msg ? `<p class="pc-ok">${esc(st.msg)}</p>` : ""}${st.err ? `<p class="pc-err">${esc(st.err)}</p>` : ""}<div class="acts"><button class="pc-btn" type="submit">Save scores</button></div></form>`;
    }
    if (st.staffTab === "loans") body = `<div class="pc-head"><h2>Loans</h2><div class="pc-actions"><button class="pc-btn brass" data-modal="loan:new">Issue a loan</button></div></div>
      <div class="pc-card">${bankLoans().length ? `<div class="pc-scroll"><table class="pc-tx"><thead><tr><th>Borrower</th><th>Loan</th><th>Status</th><th class="num">Remaining</th></tr></thead><tbody>${bankLoans().map(l => `<tr class="click" data-modal="loan:${l.id}"><td><b>${esc(l.borrower)}</b></td><td>${esc(l.type)}${l.lot_id ? `<div class="memo">${esc(lotName(l.lot_id))}</div>` : ""}</td><td><span class="pc-tag ${slug(l.status)}">${esc(l.status)}</span></td><td class="num">${money(l.balance)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="pc-empty">No loans on the books. Issue one to track a personal loan, mortgage, or business loan.</p>`}</div>`;
    if (st.staffTab === "activity") body = `<div class="pc-head"><h2>All activity</h2></div><div class="pc-card">${txRows(data.transactions.filter(t => [t.from_account, t.to_account].some(id => id && acct(id) && here(acct(id))) || (t.loan_id && bankLoans().some(l => l.id === t.loan_id))), null, true)}</div>`;
    if (st.staffTab === "types") body = `<div class="pc-head"><h2>Account and loan types</h2></div>
      <form class="pc-card pc-types" id="pc-types"><p class="pc-note">One per line. Add new ones whenever a mod update adds them. Accounts that already use a type keep it.</p>
        <div class="row"><label class="pc-field">Account types<textarea name="account_type">${esc(types("account_type").join("\n"))}</textarea></label>
        <label class="pc-field">Loan types<textarea name="loan_type">${esc(types("loan_type").join("\n"))}</textarea></label></div>
        ${st.msg ? `<p class="pc-ok">${esc(st.msg)}</p>` : ""}<div class="acts"><button class="pc-btn" type="submit">Save types</button></div></form>`;
    return `${bar(right, sub)}<div class="pc-page">${stats}${body}</div>`;
  }

  /* ---------- staff forms ---------- */
  function modalHTML(){
    if (!st.modal) return "";
    const [kind, id] = st.modal.split(":"), o = data.bank_options;
    const sims = [...data.sims].sort((a,b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    const err = st.err ? `<p class="pc-err">${esc(st.err)}</p>` : "";
    if (kind === "acct"){
      const a = id === "new" ? { type:types("account_type")[0], status:"Active", balance:0, opened:today() } : acct(id);
      return `<div class="pc-modal" data-close><form class="pc-form" id="pc-acct"><h2>${id === "new" ? "Open an account" : "Edit account"}</h2>
        ${id === "new" ? `<label class="pc-field">Holder<select name="holder_sim"><option value="">A business or household</option>${sims.map(s => `<option value="${s.id}">${esc(stripNick(s.name))}</option>`).join("")}</select></label>
        <label class="pc-field">Business or household name (if not a Sim)<input name="holder_name"></label>` : ""}
        <label class="pc-field">Joint holder (optional)<select name="co_holder">${simOpts(a.co_holder, "None")}</select></label>
        <label class="pc-check"><input type="checkbox" name="minor" ${a.minor ? "checked" : ""}> Minor account</label>
        <div class="row"><label class="pc-field">Custodian (minor accounts)<select name="cust1">${simOpts((a.custodians || [])[0], "None")}</select></label><label class="pc-field">Second custodian<select name="cust2">${simOpts((a.custodians || [])[1], "None")}</select></label></div>
        <div class="row"><label class="pc-field">Type<select name="type">${opt(types("account_type"), a.type)}</select></label><label class="pc-field">Status<select name="status">${opt(o.account_status, a.status)}</select></label></div>
        ${id === "new" ? `<label class="pc-field">Opening deposit<input name="opening" inputmode="decimal" placeholder="0.00"></label>` : ""}
        <label class="pc-field">Staff notes<textarea name="staff_notes" placeholder="Only ${BANK_NAME} sees this">${esc(a.staff_notes)}</textarea></label>
        ${err}<div class="acts"><button type="button" class="pc-btn ghost" data-close>Cancel</button><button class="pc-btn" type="submit">Save</button></div></form></div>`;
    }
    if (kind === "post"){
      const a = acct(id);
      return `<div class="pc-modal" data-close><form class="pc-form" id="pc-post"><h2>Post a transaction</h2><p class="pc-note">${esc(holder(a))}, ${esc(acctLabel(a))}</p>
        <div class="row"><label class="pc-field">Type<select name="kind"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="transfer">Transfer out</option></select></label><label class="pc-field">Date<input type="date" name="date" value="${today()}"></label></div>
        <label class="pc-field">Transfer to (transfers only)<select name="to">${data.accounts.filter(x => x.id !== id && !x.card).map(x => `<option value="${x.id}">${esc(fullLabel(x))}</option>`).join("")}</select></label>
        <label class="pc-field">Amount<input name="amount" inputmode="decimal" required></label>
        <label class="pc-field">Memo<input name="memo" placeholder="Paycheck, rent, cash"></label>
        ${err}<div class="acts"><button type="button" class="pc-btn ghost" data-close>Cancel</button><button class="pc-btn brass" type="submit">Post</button></div></form></div>`;
    }
    if (kind === "card"){
      const c = id === "new" ? { status:"Active", limit:"", opened:today() } : acct(id);
      return `<div class="pc-modal" data-close><form class="pc-form" id="pc-cardf"><h2>${id === "new" ? "Issue a card" : "Edit card"}</h2>
        ${id === "new" ? `<label class="pc-field">Cardholder<select name="holder_sim" required>${simOpts("", "Choose a member")}</select></label>` : `<p class="pc-note">${esc(holder(c))}, card ••${esc(c.number)}</p>`}
        <div class="row"><label class="pc-field">Credit limit<input name="limit" inputmode="decimal" value="${esc(c.limit)}" required></label>${id === "new" ? "" : `<label class="pc-field">Status<select name="status">${opt(CARD_STATUS, c.status)}</select></label>`}</div>
        ${id === "new" ? "" : `<label class="pc-field">Amount owed (fix it here if it's off)<input name="balance" inputmode="decimal" value="${esc(c.balance)}"></label>`}
        <label class="pc-field">Staff notes<textarea name="staff_notes" placeholder="Only Porchlight sees this">${esc(c.staff_notes)}</textarea></label>
        ${err}<div class="acts"><button type="button" class="pc-btn ghost" data-close>Cancel</button><button class="pc-btn" type="submit">Save</button></div></form></div>`;
    }
    if (kind === "spend"){
      const c = acct(id);
      return `<div class="pc-modal" data-close><form class="pc-form" id="pc-spend"><h2>Add spending</h2><p class="pc-note">${esc(holder(c))}, card ••${esc(c.number)}. ${money(Number(c.limit) - Number(c.balance))} available.</p>
        <div class="row"><label class="pc-field">Amount spent<input name="amount" inputmode="decimal" required></label><label class="pc-field">Date<input type="date" name="date" value="${today()}"></label></div>
        <label class="pc-field">What it was for (optional)<input name="note" placeholder="Leave blank for a quick update"></label>
        ${err}<div class="acts"><button type="button" class="pc-btn ghost" data-close>Cancel</button><button class="pc-btn amber" type="submit">Add</button></div></form></div>`;
    }
    if (kind === "pay"){
      const c = acct(id);
      return `<div class="pc-modal" data-close><form class="pc-form" id="pc-pay"><h2>Record a payment</h2><p class="pc-note">${esc(holder(c))}, card ••${esc(c.number)}. ${money(c.balance)} owed.</p>
        <label class="pc-field">Paid from<select name="from"><option value="">Cash or an outside account</option>${data.accounts.filter(x => !x.card && x.status === "Active").map(x => `<option value="${x.id}" ${x.holder_sim === c.holder_sim && here(x) ? "selected" : ""}>${esc(fullLabel(x))}</option>`).join("")}</select></label>
        <div class="row"><label class="pc-field">Amount<input name="amount" inputmode="decimal" required value="${Number(c.balance) > 0 ? Number(c.balance).toFixed(2) : ""}"></label><label class="pc-field">Date<input type="date" name="date" value="${today()}"></label></div>
        ${err}<div class="acts"><button type="button" class="pc-btn ghost" data-close>Cancel</button><button class="pc-btn" type="submit">Record payment</button></div></form></div>`;
    }
    if (kind === "loan"){
      const l = id === "new" ? { type:types("loan_type")[0], status:"Current", opened:today() } : data.loans.find(x => x.id === id);
      const names = [...new Set([...sims.map(s => stripNick(s.name)), ...data.sims.map(s => s.household), ...data.lots.map(x => x.owner)].filter(Boolean))].sort();
      return `<div class="pc-modal" data-close><form class="pc-form" id="pc-loan"><h2>${id === "new" ? "Issue a loan" : "Loan"}</h2>
        <label class="pc-field">Borrower<input name="borrower" list="pc-names" required value="${esc(l.borrower)}" placeholder="A Sim, household, or business"><datalist id="pc-names">${names.map(n => `<option value="${esc(n)}">`).join("")}</datalist></label>
        <div class="row"><label class="pc-field">Type<select name="type">${opt(types("loan_type"), l.type)}</select></label><label class="pc-field">Status<select name="status">${opt(LOAN_STATUS, l.status)}</select></label></div>
        <label class="pc-field">Secured by (lot)<select name="lot_id"><option value="">Nothing</option>${data.lots.map(x => `<option value="${x.id}" ${x.id===l.lot_id?"selected":""}>${esc(x.address)}</option>`).join("")}</select></label>
        <div class="row"><label class="pc-field">Amount borrowed<input name="principal" inputmode="decimal" value="${esc(l.principal)}" required></label><label class="pc-field">Monthly payment<input name="monthly" inputmode="decimal" value="${esc(l.monthly)}"></label></div>
        ${id !== "new" ? `<label class="pc-field">Remaining balance<input name="balance" inputmode="decimal" value="${esc(l.balance)}"></label>` : ""}
        <label class="pc-field">Staff notes<textarea name="notes">${esc(l.notes)}</textarea></label>
        ${err}<div class="acts">${id !== "new" ? `<button type="button" class="pc-del" data-delloan="${id}">Delete loan</button>` : ""}<span class="spacer"></span><button type="button" class="pc-btn ghost" data-close>Cancel</button><button class="pc-btn" type="submit">Save</button></div></form></div>`;
    }
    return "";
  }

  /* ---------- render + events ---------- */
  function draw(){
    const [view, a, b, c] = route;
    let html;
    if (view === "c") html = customerHTML(a, b);
    else if (view === "staff") html = staffHTML(a === "a" ? b : null);
    else html = loginHTML();
    root.innerHTML = `<div class="site-pc">${html}${modalHTML()}</div>`;
  }
  const num = v => Number(String(v || "").replace(/[^0-9.]/g, ""));
  const done = () => { st.modal = null; st.err = null; draw(); };

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-pc");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.closest("[data-close]") && (t.matches("[data-close]") && (t.classList.contains("pc-modal") || t.tagName === "BUTTON"))) { done(); return; }
      const j = t.closest("[data-jump]"); if (j) { root.querySelector("#" + j.dataset.jump)?.scrollIntoView({ behavior:"smooth", block:"start" }); return; }
      const dl = t.closest("[data-delloan]");
      if (dl && UI.confirmTap(dl)) { await GFB.deleteLoan(dl.dataset.delloan); done(); return; }
      const m = t.closest("[data-modal]");
      if (m) { st.modal = m.dataset.modal; st.err = null; draw(); return; }
      const tab = t.closest("[data-tab]");
      if (tab) { st.staffTab = tab.dataset.tab; go("staff"); draw(); return; }
      const g = t.closest("[data-go]");
      if (g) { st.msg = null; st.err = null; go(g.dataset.go); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && st.modal && root?.querySelector(".pc-modal")) { e.stopImmediatePropagation(); done(); } }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      const f = new FormData(e.target), v = k => (f.get(k) || "").trim();
      const people = () => ({ co_holder: v("co_holder") || null, minor: !!f.get("minor"), custodians: [v("cust1"), v("cust2")].filter(Boolean).filter((x,i,a) => a.indexOf(x) === i) });
      const lines = k => [...new Set(v(k).split("\n").map(x => x.trim()).filter(Boolean))];
      try {
        if (e.target.id === "pc-login") { go("c/" + v("who")); return; }
        if (e.target.id === "pc-cardf") {
          const [, id] = st.modal.split(":");
          const limit = num(v("limit")); if (!(limit > 0)) throw new Error("Enter a credit limit above zero.");
          if (id === "new") {
            if (!v("holder_sim")) throw new Error("Choose who the card is for.");
            const c = await GFB.saveAccount({ bank:BANK, card:true, type:"Credit card", holder_sim:v("holder_sim"), number:newNumber(), balance:0, limit, status:"Active", opened:today(), staff_notes:v("staff_notes") });
            st.modal = null; go("staff/a/" + c.id); return;
          }
          const old = acct(id), balance = v("balance") === "" ? Number(old.balance) : num(v("balance"));
          let status = v("status");
          if (status === "Active" && balance >= limit) status = "Maxed out";
          if (status === "Maxed out" && balance < limit) status = "Active";
          await GFB.saveAccount({ ...old, limit, balance, status, staff_notes:v("staff_notes") });
          done(); return;
        }
        if (e.target.id === "pc-spend") {
          const [, id] = st.modal.split(":");
          await GFB.postTransaction({ from_account:id, amount:num(v("amount")), counterparty: v("note") || "Card spending", kind:"charge", date:v("date") });
          done(); return;
        }
        if (e.target.id === "pc-pay") {
          const [, id] = st.modal.split(":");
          await GFB.postTransaction({ from_account: v("from") || null, to_account:id, amount:num(v("amount")), counterparty: v("from") ? null : "Card payment", kind:"payment", date:v("date") });
          done(); return;
        }
        if (e.target.id === "pc-credit") {
          for (const [k, val] of f.entries()) if (k.startsWith("cs_")) { const score = String(val).trim(); await GFB.saveSim(k.slice(3), { credit_score: score === "" ? null : Number(score.replace(/[^0-9]/g, "")) || null }); }
          st.err = null; st.msg = "Scores saved."; draw(); st.msg = null; return;
        }
        if (e.target.id === "pc-types") {
          if (!lines("account_type").length || !lines("loan_type").length) throw new Error("Keep at least one account type and one loan type.");
          await GFB.saveOptions(BANK + "_account_type", lines("account_type")); await GFB.saveOptions(BANK + "_loan_type", lines("loan_type"));
          st.err = null; st.msg = "Types saved."; draw(); st.msg = null; return;
        }
        if (e.target.id === "pc-send") {
          const loan = v("loan"), to = v("to");
          if (!loan && to === "ext" && !v("payee")) throw new Error("Add a payee name for someone outside " + BANK_NAME + ".");
          await GFB.postTransaction({ from_account:v("from"), to_account: loan || to === "ext" ? null : to, counterparty: loan ? BANK_NAME : to === "ext" ? v("payee") : null, amount:num(v("amount")), memo:v("memo"), kind: loan ? "payment" : "transfer", loan_id: loan || null });
          st.err = null; st.msg = "Sent."; draw(); return;
        }
        if (e.target.id === "pc-post") {
          const [, id] = st.modal.split(":"), k = v("kind");
          await GFB.postTransaction({ from_account: k === "deposit" ? null : id, to_account: k === "deposit" ? id : k === "transfer" ? v("to") : null, amount:num(v("amount")), memo:v("memo"), kind:k, date:v("date") });
          done(); return;
        }
        if (e.target.id === "pc-acct") {
          const [, id] = st.modal.split(":");
          if (id === "new") {
            if (!v("holder_sim") && !v("holder_name")) throw new Error("Pick a Sim or enter a business or household name.");
            const a = await GFB.saveAccount({ bank:BANK, holder_sim:v("holder_sim") || null, holder_name: v("holder_sim") ? null : v("holder_name"), ...people(), type:v("type"), status:v("status"), number:newNumber(), balance:0, opened:today(), staff_notes:v("staff_notes") });
            if (num(v("opening")) > 0) await GFB.postTransaction({ to_account:a.id, amount:num(v("opening")), memo:"Opening deposit", kind:"deposit" });
            st.modal = null; go("staff/a/" + a.id); return;
          }
          await GFB.saveAccount({ ...acct(id), ...people(), type:v("type"), status:v("status"), staff_notes:v("staff_notes") });
          done(); return;
        }
        if (e.target.id === "pc-loan") {
          const [, id] = st.modal.split(":"), old = id === "new" ? null : data.loans.find(x => x.id === id);
          const principal = num(v("principal"));
          await GFB.saveLoan({ ...(old || { opened:today(), bank:BANK }), borrower:v("borrower"), type:v("type"), status:v("status"), lot_id:v("lot_id") || null, principal, monthly: v("monthly") ? num(v("monthly")) : null, balance: old ? (v("balance") === "" ? old.balance : num(v("balance"))) : principal, notes:v("notes") });
          st.staffTab = "loans"; done(); return;
        }
      } catch (err) { st.err = err.message; st.msg = null; draw(); }
    });
  }

  function render(el, d, parts){
    root = el; data = d; route = parts || [];
    if (route[0] !== "staff") st.modal = null;
    bind(); draw();
  }
  function address(parts){
    const [v, a, b] = parts || [];
    if (v === "c") return "/online-banking/accounts" + (b ? "/" + (acct(b)?.number || "") : "");
    if (v === "staff") return "/member-services/" + (a === "a" ? "accounts/" + (acct(b)?.number || "") : st.staffTab);
    return "/";
  }
  return { render, address };
})();
