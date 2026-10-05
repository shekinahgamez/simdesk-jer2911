/* TEMPORARY: sample Simsta profiles and placeholder photos so the app looks full while we build.
   To remove: delete this file and its <script> line in index.html. Nothing here is canon. */
(function(){
  const S = window.GFB_SEED;
  const ph = (h1, label) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 55% 62%)"/><stop offset="1" stop-color="hsl(${h1 + 40} 60% 38%)"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><g fill="none" stroke="rgba(255,255,255,.85)" stroke-width="10" transform="translate(320 400)"><rect x="0" y="30" width="160" height="120" rx="22"/><circle cx="80" cy="90" r="34"/><path d="M50 30l14-22h32l14 22"/></g><text x="400" y="620" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="rgba(255,255,255,.9)">${label}</text></svg>`);
  const prof = { chasity:[2840,312], bree:[48200,610], dom:[930,402], montrell:[212000,188], naima:[1360000,12] };
  S.sims.forEach(s => { const p = prof[s.id]; if (p) { if (s.simsta_followers == null) s.simsta_followers = p[0]; if (s.simsta_following == null) s.simsta_following = p[1]; if (!s.simsta_bio) s.simsta_bio = "Sample bio. Write theirs in Edit profile."; } });
  if ((S.posts || []).length) return;
  const d = day => ({ season:"Summer", day, year:1 });
  const P = (id, author, h, label, day, tags, lot, likes, cap, comments) => ({ id, sample:true, author, photo: ph(h, label), caption: cap, tags, lot_id: lot, likes, liked_by:[], date: d(day), created: "2026-01-" + String(day).padStart(2, "0"), comments: comments.map(([a, t]) => ({ author:a, text:t })) });
  S.posts = [
    P("sample-1","bree",330,"Gym selfie",1,[],null,3120,"Sample caption. Leg day did not win. #sweatequity",[["chasity","Sample comment"],["naima","Sample comment"],["dom","Sample comment with @breesofyne"]]),
    P("sample-2","chasity",28,"Golden hour",1,["bree"],"600-main-202",418,"Sample caption with @breesofyne #goldenhour",[["bree","Sample comment"]]),
    P("sample-3","montrell",210,"Game night",1,[],null,48100,"Sample caption. #stallions",[["chasity","Sample comment"]]),
    P("sample-4","naima",280,"Studio session",1,[],null,201000,"Sample caption.",[]),
    P("sample-5","dom",190,"Rooftop",1,["chasity"],null,212,"Sample caption.",[["chasity","Sample comment"]]),
    P("sample-6","bree",350,"Brunch",1,["chasity"],"club-tropics",2650,"Sample caption with @boydphotography #brunch",[]),
    P("sample-7","chasity",40,"Street portrait",1,[],"makers-loft",390,"Sample caption. #goldenhour",[]),
    P("sample-8","montrell",160,"Off day",1,[],null,39800,"Sample caption.",[]),
    P("sample-9","bree",310,"Outfit check",1,[],null,4010,"Sample caption. #ootd",[["dom","Sample comment"]])
  ];
})();
