/* Cloud sync for SimDesk (Supabase). Optional: leave the two settings below empty and the site works exactly as before,
   saving only to this browser. Fill them in and it asks you to sign in, then keeps your edits in your Supabase project.
   It copies the same "edits" blob data.js already keeps in localStorage, so no app needs to change. */
const Cloud = (() => {
 const SUPABASE_URL = "https://pczvxbuipkeksnpeqehp.supabase.co";   /* Project URL, like https://abcdxyz.supabase.co */
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjenZ4YnVpcGtla3NucGVxZWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNjY3NDksImV4cCI6MjEwNjc0Mjc0OX0.MEV0CwE25fBVjQLq3kd3urHTwNE16ZU11Z9xnNY4dQg";   /* the anon public key (safe to publish; the database rules protect your data) */

  const EDITS = "gfb-local-edits-v1", STAMP = "gfb-local-edits-stamp", TABLE = "simdesk_state";
  const enabled = !!(SUPABASE_URL && SUPABASE_KEY && window.supabase);
  let sb = null, uid = null, timer = null, badgeEl = null;

  const note = (text, bad) => {
    if (!badgeEl) { badgeEl = document.createElement("div"); badgeEl.setAttribute("role", "status"); badgeEl.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:9998;font:600 12px Inter,system-ui,sans-serif;padding:6px 11px;border-radius:99px;background:rgba(53,8,34,.85);color:#F3ECE0;pointer-events:none;transition:opacity .4s"; document.body.appendChild(badgeEl); }
    badgeEl.textContent = text; badgeEl.style.background = bad ? "rgba(150,40,40,.92)" : "rgba(53,8,34,.85)"; badgeEl.style.opacity = 1;
    clearTimeout(note.t); if (!bad) note.t = setTimeout(() => badgeEl.style.opacity = 0, 1800);
  };

  function loginScreen(){
    return new Promise(resolve => {
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:linear-gradient(160deg,#4A1521,#2E0A1E);font-family:Inter,system-ui,sans-serif;padding:20px";
      box.innerHTML = `<form style="background:#F6F4F8;color:#231A2B;border-radius:16px;padding:26px;width:min(360px,100%);box-shadow:0 20px 60px rgba(0,0,0,.4)">
        <h1 style="font:400 28px Prata,Georgia,serif;margin:0 0 4px">SimDesk</h1><p style="margin:0 0 16px;color:#6B6275;font-size:14px">Sign in to open your worlds.</p>
        <input name="email" type="email" placeholder="Email" autocomplete="username" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #E2DDE7;border-radius:10px;font-size:16px;margin-bottom:10px">
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #E2DDE7;border-radius:10px;font-size:16px;margin-bottom:12px">
        <button style="width:100%;padding:13px;border:none;border-radius:10px;background:#7A2E4A;color:#fff;font:600 16px Inter,sans-serif;cursor:pointer">Sign in</button>
        <p class="err" style="color:#B3261E;font-size:13.5px;margin:10px 0 0;min-height:1em"></p></form>`;
      document.body.appendChild(box);
      box.querySelector("form").addEventListener("submit", async e => {
        e.preventDefault();
        const f = new FormData(e.target), err = box.querySelector(".err"); err.textContent = "";
        const { error } = await sb.auth.signInWithPassword({ email: String(f.get("email")).trim(), password: String(f.get("password")) });
        if (error) { err.textContent = error.message; return; }
        box.remove(); resolve();
      });
    });
  }

  /* On open: whichever copy is newer wins (cloud or this device). Then data.js loads as usual. */
  async function pull(){
    const { data: row, error } = await sb.from(TABLE).select("data, updated_at").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    const local = localStorage.getItem(EDITS), stamp = localStorage.getItem(STAMP) || "";
    if (row && (!local || !stamp || row.updated_at > stamp)) {
      localStorage.setItem(EDITS, JSON.stringify(row.data || {})); localStorage.setItem(STAMP, row.updated_at);
    } else if (local && (!row || stamp > row.updated_at)) {
      await push(true);
    }
  }

  async function push(quiet){
    if (!enabled || !uid) return;
    const raw = localStorage.getItem(EDITS) || "{}", at = localStorage.getItem(STAMP) || new Date().toISOString();
    if (!quiet) note("Saving...");
    const { error } = await sb.from(TABLE).upsert({ user_id: uid, data: JSON.parse(raw), updated_at: at });
    if (error) { console.error("Cloud save failed", error); note("Not saved to the cloud. Still saved on this device.", true); }
    else if (!quiet) note("Saved");
  }

  /* data.js calls this after every local save */
  function queuePush(){
    if (!enabled) return;
    try { localStorage.setItem(STAMP, new Date().toISOString()); } catch {}
    clearTimeout(timer); timer = setTimeout(() => push(), 1200);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && timer) { clearTimeout(timer); timer = null; push(true); } });

  async function start(){
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      let { data: { session } } = await sb.auth.getSession();
      if (!session) { await loginScreen(); ({ data: { session } } = await sb.auth.getSession()); }
      uid = session.user.id;
      await pull();
    } catch (err) { console.error("Cloud sync unavailable, working from this device only.", err); uid = null; note("Cloud unavailable. Working on this device only.", true); }
  }

  const ready = enabled ? start() : Promise.resolve();
  return { ready, queuePush, enabled };
})();
