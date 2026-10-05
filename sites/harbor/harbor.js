/* Harbor Trust: customer online banking + the staff back office. Reads and saves through GFB. */
const Harbor = (() => {
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
  const BANK = "harbor", BANK_NAME = "Harbor Trust", BANKS = { harbor:"Harbor Trust", porchlight:"Porchlight" };
  const DEFAULTS = { account_type:["Main checking","Savings","Education fund"], loan_type:["Unsecured loan","Mortgage"] };
  const types = k => data.options[BANK + "_" + k] || DEFAULTS[k];
  const here = a => (a.bank || "harbor") === BANK;
  const accts = () => data.accounts.filter(a => here(a) && !a.card);
  const bankLoans = () => data.loans.filter(l => (l.bank || "harbor") === BANK);
  const simName = id => stripNick((sim(id) || {}).name || id);
  const holder = a => { if (!a) return ""; const base = a.holder_sim ? simName(a.holder_sim) : a.holder_name; return a.co_holder ? base + " & " + simName(a.co_holder) : base; };
  const fullLabel = a => `${holder(a)}, ${a.type} ••${a.number}${here(a) ? "" : " (" + BANKS[a.bank || "harbor"] + ")"}`;
  const tags = a => (a.co_holder ? ` <span class="ht-tag joint">Joint</span>` : "") + (a.minor ? ` <span class="ht-tag minor">Minor</span>` : "");
  const simOpts = (sel, blank) => `<option value="">${blank}</option>` + [...data.sims].sort((a,b) => stripNick(a.name).localeCompare(stripNick(b.name))).map(x => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(stripNick(x.name))}</option>`).join("");
  const acctLabel = a => `${a.type} ••${a.number}`;
  const acctsOf = simId => accts().filter(a => a.holder_sim === simId || a.co_holder === simId || (a.custodians || []).includes(simId));
  const txFor = ids => data.transactions.filter(t => ids.includes(t.from_account) || ids.includes(t.to_account));
  const loansFor = s => bankLoans().filter(l => l.borrower === stripNick(s.name) || (s.household && l.borrower === s.household));
  const lotName = id => (data.lots.find(l => l.id === id) || {}).address;
  const slug = v => String(v || "").replace(/[^a-z]+/gi, "-");
  const go = h => { location.hash = "#/trust" + (h ? "/" + h : ""); };
  const opt = (list, val, blank) => { list = val && !list.includes(val) ? [val, ...list] : list; return `${blank ? `<option value="">${blank}</option>` : ""}${list.map(o => `<option ${o===val?"selected":""}>${esc(o)}</option>`).join("")}`; };
  const newNumber = () => { let n; do { n = String(1000 + Math.floor(Math.random()*9000)); } while (data.accounts.some(a => a.number === n)); return n; };

  const MARK = `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="24" height="24"/><path d="M10 8v14M20 8v14M10 15h10"/><path d="M6 25c3-2 6-2 9 0s6 2 9 0" stroke-width="1.4"/></svg>`;

  function bar(right, sub){
    return `<div class="ht-bar"><button class="ht-mark" data-go="">${MARK}<span>Harbor Trust</span></button><span class="spacer"></span>${right || ""}</div>${sub || ""}`;
  }

  /* one row per transaction, signed from the point of view of the given accounts */
  function txRows(list, mine, clickable){
    if (!list.length) return `<p class="ht-empty">No activity yet.</p>`;
    return `<div class="ht-scroll"><table class="ht-tx"><thead><tr><th>Date</th><th>Description</th><th>Account</th><th class="num">Amount</th></tr></thead><tbody>${list.map(t => {
      const out = mine ? mine.includes(t.from_account) && !mine.includes(t.to_account) : false;
      const inn = mine ? mine.includes(t.to_account) && !mine.includes(t.from_account) : false;
      const from = t.from_account ? holder(acct(t.from_account)) : (t.kind === "deposit" ? "Deposit" : t.counterparty);
      const to = t.to_account ? holder(acct(t.to_account)) : (t.kind === "withdrawal" ? "Withdrawal" : t.counterparty);
      const desc = t.loan_id ? `Loan payment, ${esc(lotName((data.loans.find(l => l.id === t.loan_id) || {}).lot_id) || "loan")}` : `${esc(from || "")} to ${esc(to || "")}`;
      const which = mine ? (out ? acct(t.from_account) : acct(t.to_account)) : acct(t.from_account || t.to_account);
      const sign = mine ? (out ? "neg" : inn ? "pos" : "") : "";
      return `<tr ${clickable && which ? `class="click" data-go="staff/a/${which.id}"` : ""}><td>${fmt(t.date)}</td><td>${desc}${t.memo ? `<div class="memo">${esc(t.memo)}</div>` : ""}</td><td>${which ? esc(acctLabel(which)) : ""}</td><td class="num ${sign}">${sign === "neg" ? "-" : sign === "pos" ? "+" : ""}${money(t.amount).replace("-","")}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  /* ---------- sign in ---------- */
  function loginHTML(){
    const sims = [...data.sims].sort((a,b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    return `${bar()}<div class="ht-login">
      <div class="ht-hero"><h1>Banking for the long view.</h1><p>Personal, business, and property lending for Simerican families.</p><small>Member SDIC. Equal housing lender.</small></div>
      <form class="ht-signin" id="ht-login"><h2>Sign in</h2><p>Online banking</p>
        <label class="ht-field">Customer<select name="who">${sims.map(s => `<option value="${s.id}">${esc(stripNick(s.name))}</option>`).join("")}</select></label>
        <button class="ht-btn" type="submit">Sign in</button>
        <div class="ht-staff">Harbor Trust staff? <button type="button" data-go="staff">Open the back office</button></div>
      </form></div>`;
  }

  /* ---------- customer ---------- */
  function customerHTML(simId, acctId){
    const s = sim(simId); if (!s) { go(""); return ""; }
    const mine = acctsOf(simId), ids = mine.map(a => a.id), loans = loansFor(s);
    const right = `<span class="who">Signed in as <b>${esc(stripNick(s.name))}</b></span><button class="ht-link" data-go="">Sign out</button>`;
    if (acctId && ids.includes(acctId)){
      const a = acct(acctId);
      return `${bar(right)}<div class="ht-page"><button class="ht-back" data-go="c/${simId}">Back to accounts</button>
        <div class="ht-head"><h2>${esc(acctLabel(a))}</h2><div class="ht-amt">${money(a.balance)}<small>Available balance</small></div></div>
        <div class="ht-card"><h3>Activity</h3>${txRows(txFor([a.id]), [a.id])}</div></div>`;
    }
    const others = data.accounts.filter(a => !ids.includes(a.id) && a.status === "Active" && !a.card);
    return `${bar(right)}<div class="ht-page">
      <h1 class="ht-greet">Good to see you, ${esc(stripNick(s.name).split(" ")[0])}.</h1><p class="ht-date">${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</p>
      <div class="ht-grid"><div>
        <div class="ht-card"><h3>Accounts</h3>${mine.length ? mine.map(a => `<button class="ht-acct" data-go="c/${simId}/${a.id}"><span><span class="nm">${esc(a.type)}</span><br><span class="no">••${esc(a.number)}${tags(a)}${a.status !== "Active" ? ` <span class="ht-tag ${slug(a.status)}">${esc(a.status)}</span>` : ""}</span></span><span class="ht-amt">${money(a.balance)}<small>Available</small></span></button>`).join("") : `<p class="ht-empty">No accounts at Harbor Trust yet. Staff can open one from the back office.</p>`}</div>
        ${loans.length ? `<div class="ht-card" style="margin-top:20px"><h3>Loans</h3>${loans.map(l => `<div class="ht-acct" style="cursor:default"><span><span class="nm">${esc(l.type)}${l.lot_id ? ", " + esc(lotName(l.lot_id)) : ""}</span><br><span class="no">${money(l.monthly || 0)} a month <span class="ht-tag ${slug(l.status)}">${esc(l.status)}</span></span></span><span class="ht-amt">${money(l.balance)}<small>Remaining</small></span></div>`).join("")}</div>` : ""}
        <div class="ht-card" style="margin-top:20px"><h3>Recent activity</h3>${txRows(txFor(ids).slice(0,12), ids)}</div>
      </div>
      <aside class="ht-card ht-side"><h3>Send money</h3>${mine.length ? `<form id="ht-send">
        <label class="ht-field">From<select name="from">${mine.filter(a => a.status === "Active").map(a => `<option value="${a.id}">${esc(acctLabel(a))} (${money(a.balance)})</option>`).join("")}</select></label>
        <label class="ht-field">To<select name="to">${others.map(a => `<option value="${a.id}">${esc(fullLabel(a))}</option>`).join("")}<option value="ext">Someone outside Harbor Trust</option></select></label>
        <label class="ht-field">Payee name (outside Harbor Trust only)<input name="payee"></label>
        ${loans.filter(l => l.status !== "Paid off").length ? `<label class="ht-field">Or pay a loan<select name="loan"><option value="">No</option>${loans.filter(l => l.status !== "Paid off").map(l => `<option value="${l.id}">${esc(l.type)}${l.lot_id ? ", " + esc(lotName(l.lot_id)) : ""}</option>`).join("")}</select></label>` : ""}
        <label class="ht-field">Amount<input name="amount" inputmode="decimal" placeholder="0.00" required></label>
        <label class="ht-field">Memo<input name="memo" placeholder="Shows on both statements"></label>
        <button class="ht-btn brass" type="submit">Send</button>
        ${st.err ? `<p class="ht-err">${esc(st.err)}</p>` : ""}${st.msg ? `<p class="ht-ok">${esc(st.msg)}</p>` : ""}
      </form>` : `<p class="ht-empty">Open an account first.</p>`}</aside></div></div>`;
  }

  /* ---------- staff ---------- */
  function staffHTML(acctId){
    const right = `<span class="who">Back office</span><button class="ht-link" data-go="">Exit</button>`;
    const tabs = [["accounts","Accounts"],["loans","Loans"],["activity","All activity"],["types","Types"]];
    const sub = `<div class="ht-sub">${tabs.map(([k,v]) => `<button data-tab="${k}" aria-current="${!acctId && st.staffTab===k}">${v}</button>`).join("")}</div>`;
    if (acctId && acct(acctId)){
      const a = acct(acctId);
      return `${bar(right, sub)}<div class="ht-page"><button class="ht-back" data-tab="accounts">Back to accounts</button>
        <div class="ht-head"><div><h2>${esc(holder(a))}</h2><p class="ht-date" style="margin:2px 0 0">${esc(acctLabel(a))}${tags(a)}${a.minor && (a.custodians || []).length ? ` <span class="memo">Custodian: ${esc(a.custodians.map(simName).join(" and "))}</span>` : ""}, opened ${fmt(a.opened)} <span class="ht-tag ${slug(a.status)}">${esc(a.status)}</span></p></div>
          <div class="ht-amt">${money(a.balance)}<small>Balance</small></div></div>
        <div class="ht-actions" style="margin-bottom:18px"><button class="ht-btn brass" data-modal="post:${a.id}">Post a transaction</button><button class="ht-btn ghost" data-modal="acct:${a.id}">Edit account</button></div>
        ${a.staff_notes ? `<div class="ht-card" style="margin-bottom:18px"><h3>Staff notes <small>Never shown to the customer</small></h3><p style="padding:14px 20px;margin:0;white-space:pre-wrap">${esc(a.staff_notes)}</p></div>` : ""}
        <div class="ht-card"><h3>Activity</h3>${txRows(txFor([a.id]), [a.id])}</div></div>`;
    }
    const deposits = accts().filter(a => a.status !== "Closed").reduce((n,a) => n + Number(a.balance), 0);
    const owed = bankLoans().filter(l => l.status !== "Paid off").reduce((n,l) => n + Number(l.balance), 0);
    const stats = `<div class="ht-stats"><div class="ht-stat"><span>Total deposits</span><b>${money(deposits)}</b></div><div class="ht-stat"><span>Open accounts</span><b>${accts().filter(a => a.status !== "Closed").length}</b></div><div class="ht-stat"><span>Loans outstanding</span><b>${money(owed)}</b></div></div>`;
    let body = "";
    if (st.staffTab === "accounts") body = `<div class="ht-head"><h2>Accounts</h2><div class="ht-actions"><button class="ht-btn brass" data-modal="acct:new">Open an account</button></div></div>
      <div class="ht-card">${accts().length ? `<div class="ht-scroll"><table class="ht-tx"><thead><tr><th>Holder</th><th>Account</th><th>Status</th><th class="num">Balance</th></tr></thead><tbody>${accts().sort((a,b) => b.balance - a.balance).map(a => `<tr class="click" data-go="staff/a/${a.id}"><td><b>${esc(holder(a))}</b></td><td>${esc(acctLabel(a))}${tags(a)}</td><td><span class="ht-tag ${slug(a.status)}">${esc(a.status)}</span></td><td class="num">${money(a.balance)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="ht-empty">No accounts yet.</p>`}</div>`;
    if (st.staffTab === "loans") body = `<div class="ht-head"><h2>Loans</h2><div class="ht-actions"><button class="ht-btn brass" data-modal="loan:new">Issue a loan</button></div></div>
      <div class="ht-card">${bankLoans().length ? `<div class="ht-scroll"><table class="ht-tx"><thead><tr><th>Borrower</th><th>Loan</th><th>Status</th><th class="num">Remaining</th></tr></thead><tbody>${bankLoans().map(l => `<tr class="click" data-modal="loan:${l.id}"><td><b>${esc(l.borrower)}</b></td><td>${esc(l.type)}${l.lot_id ? `<div class="memo">${esc(lotName(l.lot_id))}</div>` : ""}</td><td><span class="ht-tag ${slug(l.status)}">${esc(l.status)}</span></td><td class="num">${money(l.balance)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="ht-empty">No loans on the books. Issue one to track a mortgage, business loan, or personal loan.</p>`}</div>`;
    if (st.staffTab === "activity") body = `<div class="ht-head"><h2>All activity</h2></div><div class="ht-card">${txRows(data.transactions.filter(t => [t.from_account, t.to_account].some(id => id && acct(id) && here(acct(id))) || (t.loan_id && bankLoans().some(l => l.id === t.loan_id))), null, true)}</div>`;
    if (st.staffTab === "types") body = `<div class="ht-head"><h2>Account and loan types</h2></div>
      <form class="ht-card ht-types" id="ht-types"><p class="ht-note">One per line. Add new ones whenever a mod update adds them. Accounts that already use a type keep it.</p>
        <div class="row"><label class="ht-field">Account types<textarea name="account_type">${esc(types("account_type").join("\n"))}</textarea></label>
        <label class="ht-field">Loan types<textarea name="loan_type">${esc(types("loan_type").join("\n"))}</textarea></label></div>
        ${st.msg ? `<p class="ht-ok">${esc(st.msg)}</p>` : ""}<div class="acts"><button class="ht-btn" type="submit">Save types</button></div></form>`;
    return `${bar(right, sub)}<div class="ht-page">${stats}${body}</div>`;
  }

  /* ---------- staff forms ---------- */
  function modalHTML(){
    if (!st.modal) return "";
    const [kind, id] = st.modal.split(":"), o = data.bank_options;
    const sims = [...data.sims].sort((a,b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    const err = st.err ? `<p class="ht-err">${esc(st.err)}</p>` : "";
    if (kind === "acct"){
      const a = id === "new" ? { type:types("account_type")[0], status:"Active", balance:0, opened:today() } : acct(id);
      return `<div class="ht-modal" data-close><form class="ht-form" id="ht-acct"><h2>${id === "new" ? "Open an account" : "Edit account"}</h2>
        ${id === "new" ? `<label class="ht-field">Holder<select name="holder_sim"><option value="">A business or household</option>${sims.map(s => `<option value="${s.id}">${esc(stripNick(s.name))}</option>`).join("")}</select></label>
        <label class="ht-field">Business or household name (if not a Sim)<input name="holder_name"></label>` : ""}
        <label class="ht-field">Joint holder (optional)<select name="co_holder">${simOpts(a.co_holder, "None")}</select></label>
        <label class="ht-check"><input type="checkbox" name="minor" ${a.minor ? "checked" : ""}> Minor account</label>
        <div class="row"><label class="ht-field">Custodian (minor accounts)<select name="cust1">${simOpts((a.custodians || [])[0], "None")}</select></label><label class="ht-field">Second custodian<select name="cust2">${simOpts((a.custodians || [])[1], "None")}</select></label></div>
        <div class="row"><label class="ht-field">Type<select name="type">${opt(types("account_type"), a.type)}</select></label><label class="ht-field">Status<select name="status">${opt(o.account_status, a.status)}</select></label></div>
        ${id === "new" ? `<label class="ht-field">Opening deposit<input name="opening" inputmode="decimal" placeholder="0.00"></label>` : ""}
        <label class="ht-field">Staff notes<textarea name="staff_notes" placeholder="Only ${BANK_NAME} sees this">${esc(a.staff_notes)}</textarea></label>
        ${err}<div class="acts"><button type="button" class="ht-btn ghost" data-close>Cancel</button><button class="ht-btn" type="submit">Save</button></div></form></div>`;
    }
    if (kind === "post"){
      const a = acct(id);
      return `<div class="ht-modal" data-close><form class="ht-form" id="ht-post"><h2>Post a transaction</h2><p class="ht-note">${esc(holder(a))}, ${esc(acctLabel(a))}</p>
        <div class="row"><label class="ht-field">Type<select name="kind"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="transfer">Transfer out</option></select></label><label class="ht-field">Date<input type="date" name="date" value="${today()}"></label></div>
        <label class="ht-field">Transfer to (transfers only)<select name="to">${data.accounts.filter(x => x.id !== id && !x.card).map(x => `<option value="${x.id}">${esc(fullLabel(x))}</option>`).join("")}</select></label>
        <label class="ht-field">Amount<input name="amount" inputmode="decimal" required></label>
        <label class="ht-field">Memo<input name="memo" placeholder="Paycheck, rent, cash"></label>
        ${err}<div class="acts"><button type="button" class="ht-btn ghost" data-close>Cancel</button><button class="ht-btn brass" type="submit">Post</button></div></form></div>`;
    }
    if (kind === "loan"){
      const l = id === "new" ? { type:types("loan_type")[0], status:"Current", opened:today() } : data.loans.find(x => x.id === id);
      const names = [...new Set([...sims.map(s => stripNick(s.name)), ...data.sims.map(s => s.household), ...data.lots.map(x => x.owner)].filter(Boolean))].sort();
      return `<div class="ht-modal" data-close><form class="ht-form" id="ht-loan"><h2>${id === "new" ? "Issue a loan" : "Loan"}</h2>
        <label class="ht-field">Borrower<input name="borrower" list="ht-names" required value="${esc(l.borrower)}" placeholder="A Sim, household, or business"><datalist id="ht-names">${names.map(n => `<option value="${esc(n)}">`).join("")}</datalist></label>
        <div class="row"><label class="ht-field">Type<select name="type">${opt(types("loan_type"), l.type)}</select></label><label class="ht-field">Status<select name="status">${opt(o.loan_status, l.status)}</select></label></div>
        <label class="ht-field">Secured by (lot)<select name="lot_id"><option value="">Nothing</option>${data.lots.map(x => `<option value="${x.id}" ${x.id===l.lot_id?"selected":""}>${esc(x.address)}</option>`).join("")}</select></label>
        <div class="row"><label class="ht-field">Amount borrowed<input name="principal" inputmode="decimal" value="${esc(l.principal)}" required></label><label class="ht-field">Monthly payment<input name="monthly" inputmode="decimal" value="${esc(l.monthly)}"></label></div>
        ${id !== "new" ? `<label class="ht-field">Remaining balance<input name="balance" inputmode="decimal" value="${esc(l.balance)}"></label>` : ""}
        <label class="ht-field">Staff notes<textarea name="notes">${esc(l.notes)}</textarea></label>
        ${err}<div class="acts">${id !== "new" ? `<button type="button" class="ht-del" data-delloan="${id}">Delete loan</button>` : ""}<span class="spacer"></span><button type="button" class="ht-btn ghost" data-close>Cancel</button><button class="ht-btn" type="submit">Save</button></div></form></div>`;
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
    root.innerHTML = `<div class="site-ht">${html}${modalHTML()}</div>`;
  }
  const num = v => Number(String(v || "").replace(/[^0-9.]/g, ""));
  const done = () => { st.modal = null; st.err = null; draw(); };

  let bound = false;
  function bind(){
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-ht");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.closest("[data-close]") && (t.matches("[data-close]") && (t.classList.contains("ht-modal") || t.tagName === "BUTTON"))) { done(); return; }
      const dl = t.closest("[data-delloan]");
      if (dl && UI.confirmTap(dl)) { await GFB.deleteLoan(dl.dataset.delloan); done(); return; }
      const m = t.closest("[data-modal]");
      if (m) { st.modal = m.dataset.modal; st.err = null; draw(); return; }
      const tab = t.closest("[data-tab]");
      if (tab) { st.staffTab = tab.dataset.tab; go("staff"); draw(); return; }
      const g = t.closest("[data-go]");
      if (g) { st.msg = null; st.err = null; go(g.dataset.go); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && st.modal && root?.querySelector(".ht-modal")) { e.stopImmediatePropagation(); done(); } }, true);
    document.addEventListener("submit", async e => {
      if (!mine(e.target)) return;
      e.preventDefault();
      const f = new FormData(e.target), v = k => (f.get(k) || "").trim();
      const people = () => ({ co_holder: v("co_holder") || null, minor: !!f.get("minor"), custodians: [v("cust1"), v("cust2")].filter(Boolean).filter((x,i,a) => a.indexOf(x) === i) });
      const lines = k => [...new Set(v(k).split("\n").map(x => x.trim()).filter(Boolean))];
      try {
        if (e.target.id === "ht-login") { go("c/" + v("who")); return; }
        if (e.target.id === "ht-types") {
          if (!lines("account_type").length || !lines("loan_type").length) throw new Error("Keep at least one account type and one loan type.");
          await GFB.saveOptions(BANK + "_account_type", lines("account_type")); await GFB.saveOptions(BANK + "_loan_type", lines("loan_type"));
          st.err = null; st.msg = "Types saved."; draw(); st.msg = null; return;
        }
        if (e.target.id === "ht-send") {
          const loan = v("loan"), to = v("to");
          if (!loan && to === "ext" && !v("payee")) throw new Error("Add a payee name for someone outside " + BANK_NAME + ".");
          await GFB.postTransaction({ from_account:v("from"), to_account: loan || to === "ext" ? null : to, counterparty: loan ? BANK_NAME : to === "ext" ? v("payee") : null, amount:num(v("amount")), memo:v("memo"), kind: loan ? "payment" : "transfer", loan_id: loan || null });
          st.err = null; st.msg = "Sent."; draw(); return;
        }
        if (e.target.id === "ht-post") {
          const [, id] = st.modal.split(":"), k = v("kind");
          await GFB.postTransaction({ from_account: k === "deposit" ? null : id, to_account: k === "deposit" ? id : k === "transfer" ? v("to") : null, amount:num(v("amount")), memo:v("memo"), kind:k, date:v("date") });
          done(); return;
        }
        if (e.target.id === "ht-acct") {
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
        if (e.target.id === "ht-loan") {
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
    if (v === "staff") return "/internal/" + (a === "a" ? "accounts/" + (acct(b)?.number || "") : st.staffTab);
    return "/";
  }
  return { render, address };
})();
