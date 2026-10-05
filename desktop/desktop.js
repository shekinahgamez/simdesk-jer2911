/* Desktop + window manager. Routes: #/ is the desktop, #/registry/chasity opens that site. */
const APPS = [
  { key:"calendar", name:"Calendar", host:"Calendar", built:true, system:true,
    icon: () => { const c = window.GFB_SEED && (GFB._cal || window.GFB_SEED.calendar), t = c.today; return `<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#FFFFFF"/><rect width="64" height="19" fill="#7A2E4A"/><text x="32" y="14" text-anchor="middle" font-family="Figtree,Inter,Arial,sans-serif" font-weight="700" font-size="10" fill="#fff" letter-spacing="1">${t.season.toUpperCase()}</text><text x="32" y="51" text-anchor="middle" font-family="Figtree,Inter,Arial,sans-serif" font-weight="600" font-size="30" fill="#231A2B">${t.day}</text></svg>`; } },
  { key:"plumb", name:"Plumb", host:"Plumb", built:true, system:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#FFFFFF"/><path d="M32 10l13 22-13 22-13-22z" fill="#2E9E4F"/><path d="M32 10l13 22H19z" fill="#4CC26C"/></svg>` },
  { key:"permits", name:"Planning & Permits", host:"planning.simerica.gov", built:true,
    icon:`<img src="sites/permits/img/icon.png" alt="" width="64" height="64">` },
  { key:"registry", name:"Resident Registry", host:"registry.ora.simerica.gov", built:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#0F2340"/><circle cx="32" cy="32" r="19" fill="none" stroke="#C9D4E5" stroke-width="2"/><circle cx="32" cy="32" r="13.5" fill="none" stroke="#C9D4E5" stroke-width="1"/><path d="M32 21 L37.5 32 L32 43 L26.5 32 Z" fill="#C9D4E5"/></svg>` },
  { key:"trust", name:"Harbor Trust", host:"online.harbortrust.com", built:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#1C1F24"/><rect x="16" y="14" width="32" height="32" fill="none" stroke="#A8834A" stroke-width="2.4"/><path d="M26 20v20M38 20v20M26 30h12" stroke="#A8834A" stroke-width="2.4"/><path d="M14 52c6-4 12-4 18 0s12 4 18 0" fill="none" stroke="#A8834A" stroke-width="2"/></svg>` },
  { key:"porchlight", name:"Porchlight", host:"porchlightcu.com", built:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#0F4D46"/><g transform="translate(11 10) scale(0.66)"><path d="M5 25L32 7L59 25V31L32 14L5 31Z" fill="#F7F5EE"/><rect x="13" y="28" width="9" height="21" fill="#F7F5EE"/><rect x="42" y="28" width="9" height="21" fill="#F7F5EE"/><rect x="24" y="25" width="16" height="3.5" fill="#F7F5EE"/><rect x="26.5" y="31" width="11" height="18" fill="#F4B942"/><rect x="9" y="51" width="46" height="3.5" fill="#F7F5EE"/><rect x="5" y="56.5" width="54" height="3.5" fill="#F7F5EE"/></g></svg>` },
  { key:"huddl", name:"Huddl", host:"huddl.co", built:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#4338CA"/><g fill="#fff"><rect x="16" y="14" width="10" height="36" rx="3"/><rect x="38" y="14" width="10" height="36" rx="3"/><rect x="22" y="27" width="20" height="10" rx="3"/></g></svg>` },
  { key:"cliq", name:"Cliq", host:"cliq.club", built:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#F6B6CC"/><g fill="#fff"><rect x="14" y="14" width="36" height="13" rx="5"/><rect x="14" y="14" width="13" height="36" rx="5"/><rect x="14" y="37" width="36" height="13" rx="5"/></g></svg>` },
  { key:"blacktea", name:"Black Tea", host:"blackteamag.com", built:true,
    icon:`<img src="sites/blacktea/img/icon.png" alt="" width="64" height="64">` },
  { key:"lotline", name:"Lotline", host:"lotline.com", built:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#EE5A24"/><path fill="#fff" fill-rule="evenodd" transform="translate(13.8 9.4) scale(0.0911)" d="M125 35H300L350 95V265L205 452L50 265V95ZM140 125H285V215H215V305L140 215Z"/></svg>` },
  { key:"simsta", name:"Simsta", host:"simsta.com", built:true,
    icon:`<svg viewBox="0 0 64 64"><defs><linearGradient id="smg" x1="0" y1=".2" x2="1" y2=".8"><stop offset="0" stop-color="#DB1265"/><stop offset="1" stop-color="#F95A54"/></linearGradient></defs><rect width="64" height="64" fill="url(#smg)"/><path d="M32 11C33.6 25.2 38.8 30.4 53 32C38.8 33.6 33.6 38.8 32 53C30.4 38.8 25.2 33.6 11 32C25.2 30.4 30.4 25.2 32 11Z" fill="#fff"/></svg>` },
  { key:"settings", name:"Settings", host:"Settings", built:true, system:true,
    icon:`<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="#8E8E93"/><g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><circle cx="32" cy="32" r="8"/><path d="M32 13v6M32 45v6M13 32h6M45 32h6M18.6 18.6l4.2 4.2M41.2 41.2l4.2 4.2M18.6 45.4l4.2-4.2M41.2 22.8l4.2-4.2"/></g><circle cx="32" cy="32" r="15" fill="none" stroke="#fff" stroke-width="3" opacity=".55"/></svg>` },
];

const win = document.getElementById("win");
const site = document.getElementById("site");
let lastIcon = null;

/* the dock holds the save tools; the desktop holds the in-world sites */
const DOCK = ["calendar","plumb","permits","registry","settings"];
const iconHTML = a => typeof a.icon === "function" ? a.icon() : a.icon;
function drawDock(){
  const open = location.hash.replace(/^#\/?/, "").split("/")[0];
  document.getElementById("dock").innerHTML = DOCK.map(k => APPS.find(a => a.key === k)).filter(Boolean).map(a =>
    `<a class="dk" href="#/${a.key}" data-app="${a.key}" aria-label="${a.name}" title="${a.name}" ${a.key === open ? 'aria-current="true"' : ""}><span class="ic">${iconHTML(a)}</span></a>`).join("");
}
function applyWallpaper(){
  GFB.getAll().then(d => {
    const w = (d.settings || {}).wallpaper, desk = document.getElementById("desk");
    desk.style.backgroundImage = w ? `url("${w}")` : ""; desk.classList.toggle("has-wall", !!w);
  });
}
window.addEventListener("gfb:wallpaper", applyWallpaper);
function drawIcons(){
  drawDock();
  document.getElementById("icons").innerHTML = APPS.filter(a => !DOCK.includes(a.key)).map(a =>
    `<a class="app" href="#/${a.key}" data-app="${a.key}"><span class="ic">${typeof a.icon === "function" ? a.icon() : a.icon}</span><span class="nm">${a.name}</span></a>`).join("");
}

function setAddress(host, path, system){ document.getElementById("winUrl").innerHTML = `<b>${host}</b>${path || ""}`; document.querySelector(".padlock").style.display = system ? "none" : ""; }

function placeholder(a){
  const t = a.theme;
  site.innerHTML = `<div class="ph" style="--ph-bg:${t.bg};--ph-ink:${t.ink};--ph-accent:${t.accent};--ph-font:${t.font}">
    <div class="box"><h1>${a.name}</h1><p>${a.tagline}</p><small>This site is still being built.</small></div></div>`;
  setAddress(a.host, "/");
}

async function route(){
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const a = APPS.find(x => x.key === parts[0]);
  if (!a){ GFB.getAll().then(d => { GFB._cal = d.calendar; drawIcons(); tick(); }); win.hidden = true; site.innerHTML = ""; document.title = "SimDesk"; lastIcon?.focus(); return; }
  const wasHidden = win.hidden;
  win.hidden = false;
  if (wasHidden){ win.classList.remove("opening"); void win.offsetWidth; win.classList.add("opening"); }
  if (location.hash !== route.last){ site.scrollTop = 0; route.last = location.hash; }
  document.getElementById("winTitle").textContent = a.name;
  document.querySelector(".padlock").style.display = "";
  document.title = a.name;
  if (a.key === "registry"){
    const data = await GFB.getAll();
    const id = parts[1] && data.sims.some(s => s.id === parts[1]) ? parts[1] : data.sims[0].id;
    const sim = data.sims.find(s => s.id === id);
    setAddress(a.host, `/records/gfb-${sim.file_no}`);
    Registry.render(site, data, id);
  } else if (a.key === "calendar"){
    const data = await GFB.getAll();
    GFB._cal = data.calendar;
    Calendar.render(site, data, parts.slice(1));
    setAddress("Calendar", `, Year ${data.calendar.year}`, true);
    drawIcons(); tick();
  } else if (a.key === "simsta"){
    const data = await GFB.getAll();
    Simsta.render(site, data, parts.slice(1));
    setAddress(a.host, Simsta.address(parts.slice(1)));
  } else if (a.key === "plumb"){
    const data = await GFB.getAll();
    Plumb.render(site, data, parts.slice(1));
    setAddress("Plumb", ", " + Plumb.label(), true);
  } else if (a.key === "permits"){
    const data = await GFB.getAll();
    Permits.render(site, data, parts.slice(1));
    setAddress(a.host, "/" + Permits.label().toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  } else if (a.key === "trust"){
    const data = await GFB.getAll();
    Harbor.render(site, data, parts.slice(1));
    setAddress(a.host, Harbor.address(parts.slice(1)));
  } else if (a.key === "settings"){
    const data = await GFB.getAll();
    Settings.render(site, data);
    setAddress("Settings", ", Desktop", true);
  } else if (a.key === "huddl"){
    const data = await GFB.getAll();
    Huddl.render(site, data, parts.slice(1));
    setAddress(a.host, Huddl.address(parts.slice(1)));
  } else if (a.key === "cliq"){
    const data = await GFB.getAll();
    Cliq.render(site, data, parts.slice(1));
    setAddress(a.host, Cliq.address(parts.slice(1)));
  } else if (a.key === "porchlight"){
    const data = await GFB.getAll();
    Porchlight.render(site, data, parts.slice(1));
    setAddress(a.host, Porchlight.address(parts.slice(1)));
  } else if (a.key === "lotline"){
    const data = await GFB.getAll();
    Lotline.render(site, data, parts[1]);
    setAddress(a.host, Lotline.label(parts[1]));
  } else if (a.key === "blacktea"){
    const data = await GFB.getAll();
    const desk = parts[1] === "desk";
    setAddress(a.host, desk ? "/desk" : "/");
    BlackTea.render(site, data, desk ? "desk" : "front");
  } else {
    placeholder(a);
  }
}

document.addEventListener("click", e => {
  const ic = e.target.closest(".app");
  if (ic){ lastIcon = ic; const r = ic.getBoundingClientRect(); win.style.setProperty("--ox", r.left + r.width/2 + "px"); win.style.setProperty("--oy", r.top + "px"); }
});
document.getElementById("winClose").addEventListener("click", () => { location.hash = "#/"; });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !win.hidden && !e.target.closest("input,textarea,select")) location.hash = "#/"; });

function tick(){
  const c = GFB._cal || window.GFB_SEED.calendar;
  document.getElementById("gamedate").textContent = `${c.today.season}, day ${c.today.day}, Year ${c.year}`;
  const d = new Date();
  document.getElementById("clock").textContent = d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}) + "  " + d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
}
GFB.getAll().then(d => { GFB._cal = d.calendar; drawIcons(); tick(); });
drawIcons(); tick(); setInterval(tick, 30000);
window.addEventListener("hashchange", route);
window.addEventListener("hashchange", drawDock);
applyWallpaper();
route();
