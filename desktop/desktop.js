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
    icon:`<svg viewBox="0 0 100 100"><defs><linearGradient id="hdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D35C4"/><stop offset="1" stop-color="#1E2A86"/></linearGradient></defs><rect width="100" height="100" fill="url(#hdg)"/><g transform="translate(15 15) scale(.7)"><path d="M12.4 33.8 L12.3 33.9 L12.3 34.0 L12.2 34.2 L12.2 34.3 L12.2 34.5 L12.3 34.6 L12.3 34.7 L12.3 34.9 L12.4 35.0 L12.5 35.1 L12.6 35.2 L12.7 35.3 L12.8 35.4 L12.9 35.5 L13.0 35.6 L13.1 35.6 L13.3 35.7 L13.4 35.7 L13.8 35.8 L13.8 35.8 L14.5 35.9 L14.5 35.9 L15.2 36.1 L15.2 36.1 L15.9 36.3 L15.9 36.4 L16.5 36.6 L16.6 36.6 L17.2 36.9 L17.2 36.9 L17.8 37.2 L17.9 37.2 L18.4 37.6 L18.5 37.6 L19.0 37.9 L19.1 38.0 L19.6 38.3 L19.7 38.4 L20.2 38.8 L20.2 38.8 L20.7 39.2 L20.8 39.3 L21.2 39.7 L21.3 39.8 L21.7 40.2 L21.8 40.3 L22.2 40.8 L22.2 40.8 L22.6 41.3 L22.7 41.4 L23.0 41.9 L23.1 42.0 L23.4 42.5 L23.4 42.6 L23.8 43.1 L23.8 43.2 L24.1 43.8 L24.1 43.8 L24.4 44.4 L24.4 44.5 L24.6 45.1 L24.7 45.1 L24.8 45.5 L24.8 45.7 L24.9 45.8 L25.0 45.9 L25.1 46.0 L25.1 46.1 L25.2 46.2 L25.4 46.3 L25.5 46.3 L25.6 46.4 L25.7 46.4 L25.9 46.5 L26.0 46.5 L26.1 46.5 L35.4 46.5 L35.5 46.5 L35.7 46.5 L35.8 46.4 L35.9 46.4 L36.1 46.3 L36.2 46.3 L36.3 46.2 L36.4 46.1 L36.5 46.0 L36.6 45.9 L36.6 45.8 L36.7 45.7 L36.7 45.5 L36.8 45.3 L36.8 45.3 L37.1 44.7 L37.1 44.6 L37.3 44.0 L37.4 44.0 L37.6 43.4 L37.7 43.4 L38.0 42.8 L38.0 42.8 L38.4 42.2 L38.4 42.2 L38.7 41.7 L38.8 41.6 L39.2 41.1 L39.2 41.1 L39.6 40.6 L39.6 40.6 L40.1 40.1 L40.1 40.1 L40.6 39.6 L40.6 39.6 L41.1 39.2 L41.1 39.2 L41.6 38.8 L41.7 38.7 L42.2 38.4 L42.2 38.4 L42.8 38.0 L42.8 38.0 L43.4 37.7 L43.4 37.6 L44.0 37.4 L44.0 37.3 L44.6 37.1 L44.7 37.1 L45.3 36.8 L45.3 36.8 L45.5 36.7 L45.7 36.7 L45.8 36.6 L45.9 36.6 L46.0 36.5 L46.1 36.4 L46.2 36.3 L46.3 36.2 L46.3 36.1 L46.4 35.9 L46.4 35.8 L46.5 35.7 L46.5 35.5 L46.5 35.4 L46.5 26.1 L46.5 26.0 L46.5 25.9 L46.4 25.7 L46.4 25.6 L46.3 25.5 L46.3 25.4 L46.2 25.2 L46.1 25.1 L46.0 25.1 L45.9 25.0 L45.8 24.9 L45.7 24.8 L45.5 24.8 L45.1 24.7 L45.1 24.6 L44.5 24.4 L44.4 24.4 L43.8 24.1 L43.8 24.1 L43.2 23.8 L43.1 23.8 L42.6 23.4 L42.5 23.4 L42.0 23.1 L41.9 23.0 L41.4 22.7 L41.3 22.6 L40.8 22.2 L40.8 22.2 L40.3 21.8 L40.2 21.7 L39.8 21.3 L39.7 21.2 L39.3 20.8 L39.2 20.7 L38.8 20.2 L38.8 20.2 L38.4 19.7 L38.3 19.6 L38.0 19.1 L37.9 19.0 L37.6 18.5 L37.6 18.4 L37.2 17.9 L37.2 17.8 L36.9 17.2 L36.9 17.2 L36.6 16.6 L36.6 16.5 L36.4 15.9 L36.3 15.9 L36.1 15.2 L36.1 15.2 L35.9 14.5 L35.9 14.5 L35.8 13.8 L35.8 13.8 L35.7 13.4 L35.7 13.3 L35.6 13.1 L35.6 13.0 L35.5 12.9 L35.4 12.8 L35.3 12.7 L35.2 12.6 L35.1 12.5 L35.0 12.4 L34.9 12.3 L34.7 12.3 L34.6 12.3 L34.5 12.2 L34.3 12.2 L34.2 12.2 L34.0 12.3 L33.9 12.3 L33.8 12.4 L33.1 12.6 L33.1 12.7 L31.9 13.2 L31.8 13.2 L30.7 13.8 L30.7 13.9 L29.5 14.5 L29.5 14.5 L28.4 15.2 L28.3 15.2 L27.2 15.9 L27.2 15.9 L26.1 16.7 L26.1 16.7 L25.1 17.5 L25.0 17.5 L24.0 18.3 L24.0 18.3 L23.0 19.2 L22.9 19.2 L22.0 20.1 L22.0 20.1 L21.0 21.0 L21.0 21.0 L20.1 22.0 L20.1 22.0 L19.2 22.9 L19.2 23.0 L18.3 24.0 L18.3 24.0 L17.5 25.0 L17.5 25.1 L16.7 26.1 L16.7 26.1 L15.9 27.2 L15.9 27.2 L15.2 28.3 L15.2 28.4 L14.5 29.5 L14.5 29.5 L13.9 30.7 L13.8 30.7 L13.2 31.8 L13.2 31.9 L12.7 33.1 L12.6 33.1 L12.4 33.8Z" fill="#fff"/><path d="M54.5 24.8 L54.3 24.8 L54.2 24.9 L54.1 25.0 L54.0 25.1 L53.9 25.1 L53.8 25.2 L53.7 25.4 L53.7 25.5 L53.6 25.6 L53.6 25.7 L53.5 25.9 L53.5 26.0 L53.5 26.1 L53.5 35.4 L53.5 35.5 L53.5 35.7 L53.6 35.8 L53.6 35.9 L53.7 36.1 L53.7 36.2 L53.8 36.3 L53.9 36.4 L54.0 36.5 L54.1 36.6 L54.2 36.6 L54.3 36.7 L54.5 36.7 L54.7 36.8 L54.7 36.8 L55.3 37.1 L55.4 37.1 L56.0 37.3 L56.0 37.4 L56.6 37.6 L56.6 37.7 L57.2 38.0 L57.2 38.0 L57.8 38.4 L57.8 38.4 L58.3 38.7 L58.4 38.8 L58.9 39.2 L58.9 39.2 L59.4 39.6 L59.4 39.6 L59.9 40.1 L59.9 40.1 L60.4 40.6 L60.4 40.6 L60.8 41.1 L60.8 41.1 L61.2 41.6 L61.3 41.7 L61.6 42.2 L61.6 42.2 L62.0 42.8 L62.0 42.8 L62.3 43.4 L62.4 43.4 L62.6 44.0 L62.7 44.0 L62.9 44.6 L62.9 44.7 L63.2 45.3 L63.2 45.3 L63.3 45.5 L63.3 45.7 L63.4 45.8 L63.4 45.9 L63.5 46.0 L63.6 46.1 L63.7 46.2 L63.8 46.3 L63.9 46.3 L64.1 46.4 L64.2 46.4 L64.3 46.5 L64.5 46.5 L64.6 46.5 L73.9 46.5 L74.0 46.5 L74.1 46.5 L74.3 46.4 L74.4 46.4 L74.5 46.3 L74.6 46.3 L74.8 46.2 L74.9 46.1 L74.9 46.0 L75.0 45.9 L75.1 45.8 L75.2 45.7 L75.2 45.5 L75.3 45.1 L75.4 45.1 L75.6 44.5 L75.6 44.4 L75.9 43.8 L75.9 43.8 L76.2 43.2 L76.2 43.1 L76.6 42.6 L76.6 42.5 L76.9 42.0 L77.0 41.9 L77.3 41.4 L77.4 41.3 L77.8 40.8 L77.8 40.8 L78.2 40.3 L78.3 40.2 L78.7 39.8 L78.8 39.7 L79.2 39.3 L79.3 39.2 L79.8 38.8 L79.8 38.8 L80.3 38.4 L80.4 38.3 L80.9 38.0 L81.0 37.9 L81.5 37.6 L81.6 37.6 L82.1 37.2 L82.2 37.2 L82.8 36.9 L82.8 36.9 L83.4 36.6 L83.5 36.6 L84.1 36.4 L84.1 36.3 L84.8 36.1 L84.8 36.1 L85.5 35.9 L85.5 35.9 L86.2 35.8 L86.2 35.8 L86.6 35.7 L86.7 35.7 L86.9 35.6 L87.0 35.6 L87.1 35.5 L87.2 35.4 L87.3 35.3 L87.4 35.2 L87.5 35.1 L87.6 35.0 L87.7 34.9 L87.7 34.7 L87.7 34.6 L87.8 34.5 L87.8 34.3 L87.8 34.2 L87.7 34.0 L87.7 33.9 L87.6 33.8 L87.4 33.1 L87.3 33.1 L86.8 31.9 L86.8 31.8 L86.2 30.7 L86.1 30.7 L85.5 29.5 L85.5 29.5 L84.8 28.4 L84.8 28.3 L84.1 27.2 L84.1 27.2 L83.3 26.1 L83.3 26.1 L82.5 25.1 L82.5 25.0 L81.7 24.0 L81.7 24.0 L80.8 23.0 L80.8 22.9 L79.9 22.0 L79.9 22.0 L79.0 21.0 L79.0 21.0 L78.0 20.1 L78.0 20.1 L77.1 19.2 L77.0 19.2 L76.0 18.3 L76.0 18.3 L75.0 17.5 L74.9 17.5 L73.9 16.7 L73.9 16.7 L72.8 15.9 L72.8 15.9 L71.7 15.2 L71.6 15.2 L70.5 14.5 L70.5 14.5 L69.3 13.9 L69.3 13.8 L68.2 13.2 L68.1 13.2 L66.9 12.7 L66.9 12.6 L66.2 12.4 L66.1 12.3 L66.0 12.3 L65.8 12.2 L65.7 12.2 L65.5 12.2 L65.4 12.3 L65.3 12.3 L65.1 12.3 L65.0 12.4 L64.9 12.5 L64.8 12.6 L64.7 12.7 L64.6 12.8 L64.5 12.9 L64.4 13.0 L64.4 13.1 L64.3 13.3 L64.3 13.4 L64.2 13.8 L64.2 13.8 L64.1 14.5 L64.1 14.5 L63.9 15.2 L63.9 15.2 L63.7 15.9 L63.6 15.9 L63.4 16.5 L63.4 16.6 L63.1 17.2 L63.1 17.2 L62.8 17.8 L62.8 17.9 L62.4 18.4 L62.4 18.5 L62.1 19.0 L62.0 19.1 L61.7 19.6 L61.6 19.7 L61.2 20.2 L61.2 20.2 L60.8 20.7 L60.7 20.8 L60.3 21.2 L60.2 21.3 L59.8 21.7 L59.7 21.8 L59.2 22.2 L59.2 22.2 L58.7 22.6 L58.6 22.7 L58.1 23.0 L58.0 23.1 L57.5 23.4 L57.4 23.4 L56.9 23.8 L56.8 23.8 L56.2 24.1 L56.2 24.1 L55.6 24.4 L55.5 24.4 L54.9 24.6 L54.9 24.7 L54.5 24.8Z" fill="#fff"/><path d="M13.4 64.3 L13.3 64.3 L13.1 64.4 L13.0 64.4 L12.9 64.5 L12.8 64.6 L12.7 64.7 L12.6 64.8 L12.5 64.9 L12.4 65.0 L12.3 65.1 L12.3 65.3 L12.3 65.4 L12.2 65.5 L12.2 65.7 L12.2 65.8 L12.3 66.0 L12.3 66.1 L12.4 66.2 L12.6 66.9 L12.7 66.9 L13.2 68.1 L13.2 68.2 L13.8 69.3 L13.9 69.3 L14.5 70.5 L14.5 70.5 L15.2 71.6 L15.2 71.7 L15.9 72.8 L15.9 72.8 L16.7 73.9 L16.7 73.9 L17.5 74.9 L17.5 75.0 L18.3 76.0 L18.3 76.0 L19.2 77.0 L19.2 77.1 L20.1 78.0 L20.1 78.0 L21.0 79.0 L21.0 79.0 L22.0 79.9 L22.0 79.9 L22.9 80.8 L23.0 80.8 L24.0 81.7 L24.0 81.7 L25.0 82.5 L25.1 82.5 L26.1 83.3 L26.1 83.3 L27.2 84.1 L27.2 84.1 L28.3 84.8 L28.4 84.8 L29.5 85.5 L29.5 85.5 L30.7 86.1 L30.7 86.2 L31.8 86.8 L31.9 86.8 L33.1 87.3 L33.1 87.4 L33.8 87.6 L33.9 87.7 L34.0 87.7 L34.2 87.8 L34.3 87.8 L34.5 87.8 L34.6 87.7 L34.7 87.7 L34.9 87.7 L35.0 87.6 L35.1 87.5 L35.2 87.4 L35.3 87.3 L35.4 87.2 L35.5 87.1 L35.6 87.0 L35.6 86.9 L35.7 86.7 L35.7 86.6 L35.8 86.2 L35.8 86.2 L35.9 85.5 L35.9 85.5 L36.1 84.8 L36.1 84.8 L36.3 84.1 L36.4 84.1 L36.6 83.5 L36.6 83.4 L36.9 82.8 L36.9 82.8 L37.2 82.2 L37.2 82.1 L37.6 81.6 L37.6 81.5 L37.9 81.0 L38.0 80.9 L38.3 80.4 L38.4 80.3 L38.8 79.8 L38.8 79.8 L39.2 79.3 L39.3 79.2 L39.7 78.8 L39.8 78.7 L40.2 78.3 L40.3 78.2 L40.8 77.8 L40.8 77.8 L41.3 77.4 L41.4 77.3 L41.9 77.0 L42.0 76.9 L42.5 76.6 L42.6 76.6 L43.1 76.2 L43.2 76.2 L43.8 75.9 L43.8 75.9 L44.4 75.6 L44.5 75.6 L45.1 75.4 L45.1 75.3 L45.5 75.2 L45.7 75.2 L45.8 75.1 L45.9 75.0 L46.0 74.9 L46.1 74.9 L46.2 74.8 L46.3 74.6 L46.3 74.5 L46.4 74.4 L46.4 74.3 L46.5 74.1 L46.5 74.0 L46.5 73.9 L46.5 64.6 L46.5 64.5 L46.5 64.3 L46.4 64.2 L46.4 64.1 L46.3 63.9 L46.3 63.8 L46.2 63.7 L46.1 63.6 L46.0 63.5 L45.9 63.4 L45.8 63.4 L45.7 63.3 L45.5 63.3 L45.3 63.2 L45.3 63.2 L44.7 62.9 L44.6 62.9 L44.0 62.7 L44.0 62.6 L43.4 62.4 L43.4 62.3 L42.8 62.0 L42.8 62.0 L42.2 61.6 L42.2 61.6 L41.7 61.3 L41.6 61.2 L41.1 60.8 L41.1 60.8 L40.6 60.4 L40.6 60.4 L40.1 59.9 L40.1 59.9 L39.6 59.4 L39.6 59.4 L39.2 58.9 L39.2 58.9 L38.8 58.4 L38.7 58.3 L38.4 57.8 L38.4 57.8 L38.0 57.2 L38.0 57.2 L37.7 56.6 L37.6 56.6 L37.4 56.0 L37.3 56.0 L37.1 55.4 L37.1 55.3 L36.8 54.7 L36.8 54.7 L36.7 54.5 L36.7 54.3 L36.6 54.2 L36.6 54.1 L36.5 54.0 L36.4 53.9 L36.3 53.8 L36.2 53.7 L36.1 53.7 L35.9 53.6 L35.8 53.6 L35.7 53.5 L35.5 53.5 L35.4 53.5 L26.1 53.5 L26.0 53.5 L25.9 53.5 L25.7 53.6 L25.6 53.6 L25.5 53.7 L25.4 53.7 L25.2 53.8 L25.1 53.9 L25.1 54.0 L25.0 54.1 L24.9 54.2 L24.8 54.3 L24.8 54.5 L24.7 54.9 L24.6 54.9 L24.4 55.5 L24.4 55.6 L24.1 56.2 L24.1 56.2 L23.8 56.8 L23.8 56.9 L23.4 57.4 L23.4 57.5 L23.1 58.0 L23.0 58.1 L22.7 58.6 L22.6 58.7 L22.2 59.2 L22.2 59.2 L21.8 59.7 L21.7 59.8 L21.3 60.2 L21.2 60.3 L20.8 60.7 L20.7 60.8 L20.2 61.2 L20.2 61.2 L19.7 61.6 L19.6 61.7 L19.1 62.0 L19.0 62.1 L18.5 62.4 L18.4 62.4 L17.9 62.8 L17.8 62.8 L17.2 63.1 L17.2 63.1 L16.6 63.4 L16.5 63.4 L15.9 63.6 L15.9 63.7 L15.2 63.9 L15.2 63.9 L14.5 64.1 L14.5 64.1 L13.8 64.2 L13.8 64.2 L13.4 64.3Z" fill="#fff"/><path d="M54.5 63.3 L54.3 63.3 L54.2 63.4 L54.1 63.4 L54.0 63.5 L53.9 63.6 L53.8 63.7 L53.7 63.8 L53.7 63.9 L53.6 64.1 L53.6 64.2 L53.5 64.3 L53.5 64.5 L53.5 64.6 L53.5 73.9 L53.5 74.0 L53.5 74.1 L53.6 74.3 L53.6 74.4 L53.7 74.5 L53.7 74.6 L53.8 74.8 L53.9 74.9 L54.0 74.9 L54.1 75.0 L54.2 75.1 L54.3 75.2 L54.5 75.2 L54.9 75.3 L54.9 75.4 L55.5 75.6 L55.6 75.6 L56.2 75.9 L56.2 75.9 L56.8 76.2 L56.9 76.2 L57.4 76.6 L57.5 76.6 L58.0 76.9 L58.1 77.0 L58.6 77.3 L58.7 77.4 L59.2 77.8 L59.2 77.8 L59.7 78.2 L59.8 78.3 L60.2 78.7 L60.3 78.8 L60.7 79.2 L60.8 79.3 L61.2 79.8 L61.2 79.8 L61.6 80.3 L61.7 80.4 L62.0 80.9 L62.1 81.0 L62.4 81.5 L62.4 81.6 L62.8 82.1 L62.8 82.2 L63.1 82.8 L63.1 82.8 L63.4 83.4 L63.4 83.5 L63.6 84.1 L63.7 84.1 L63.9 84.8 L63.9 84.8 L64.1 85.5 L64.1 85.5 L64.2 86.2 L64.2 86.2 L64.3 86.6 L64.3 86.7 L64.4 86.9 L64.4 87.0 L64.5 87.1 L64.6 87.2 L64.7 87.3 L64.8 87.4 L64.9 87.5 L65.0 87.6 L65.1 87.7 L65.3 87.7 L65.4 87.7 L65.5 87.8 L65.7 87.8 L65.8 87.8 L66.0 87.7 L66.1 87.7 L66.2 87.6 L66.9 87.4 L66.9 87.3 L68.1 86.8 L68.2 86.8 L69.3 86.2 L69.3 86.1 L70.5 85.5 L70.5 85.5 L71.6 84.8 L71.7 84.8 L72.8 84.1 L72.8 84.1 L73.9 83.3 L73.9 83.3 L74.9 82.5 L75.0 82.5 L76.0 81.7 L76.0 81.7 L77.0 80.8 L77.1 80.8 L78.0 79.9 L78.0 79.9 L79.0 79.0 L79.0 79.0 L79.9 78.0 L79.9 78.0 L80.8 77.1 L80.8 77.0 L81.7 76.0 L81.7 76.0 L82.5 75.0 L82.5 74.9 L83.3 73.9 L83.3 73.9 L84.1 72.8 L84.1 72.8 L84.8 71.7 L84.8 71.6 L85.5 70.5 L85.5 70.5 L86.1 69.3 L86.2 69.3 L86.8 68.2 L86.8 68.1 L87.3 66.9 L87.4 66.9 L87.6 66.2 L87.7 66.1 L87.7 66.0 L87.8 65.8 L87.8 65.7 L87.8 65.5 L87.7 65.4 L87.7 65.3 L87.7 65.1 L87.6 65.0 L87.5 64.9 L87.4 64.8 L87.3 64.7 L87.2 64.6 L87.1 64.5 L87.0 64.4 L86.9 64.4 L86.7 64.3 L86.6 64.3 L86.2 64.2 L86.2 64.2 L85.5 64.1 L85.5 64.1 L84.8 63.9 L84.8 63.9 L84.1 63.7 L84.1 63.6 L83.5 63.4 L83.4 63.4 L82.8 63.1 L82.8 63.1 L82.2 62.8 L82.1 62.8 L81.6 62.4 L81.5 62.4 L81.0 62.1 L80.9 62.0 L80.4 61.7 L80.3 61.6 L79.8 61.2 L79.8 61.2 L79.3 60.8 L79.2 60.7 L78.8 60.3 L78.7 60.2 L78.3 59.8 L78.2 59.7 L77.8 59.2 L77.8 59.2 L77.4 58.7 L77.3 58.6 L77.0 58.1 L76.9 58.0 L76.6 57.5 L76.6 57.4 L76.2 56.9 L76.2 56.8 L75.9 56.2 L75.9 56.2 L75.6 55.6 L75.6 55.5 L75.4 54.9 L75.3 54.9 L75.2 54.5 L75.2 54.3 L75.1 54.2 L75.0 54.1 L74.9 54.0 L74.9 53.9 L74.8 53.8 L74.6 53.7 L74.5 53.7 L74.4 53.6 L74.3 53.6 L74.1 53.5 L74.0 53.5 L73.9 53.5 L64.6 53.5 L64.5 53.5 L64.3 53.5 L64.2 53.6 L64.1 53.6 L63.9 53.7 L63.8 53.7 L63.7 53.8 L63.6 53.9 L63.5 54.0 L63.4 54.1 L63.4 54.2 L63.3 54.3 L63.3 54.5 L63.2 54.7 L63.2 54.7 L62.9 55.3 L62.9 55.4 L62.7 56.0 L62.6 56.0 L62.4 56.6 L62.3 56.6 L62.0 57.2 L62.0 57.2 L61.6 57.8 L61.6 57.8 L61.3 58.3 L61.2 58.4 L60.8 58.9 L60.8 58.9 L60.4 59.4 L60.4 59.4 L59.9 59.9 L59.9 59.9 L59.4 60.4 L59.4 60.4 L58.9 60.8 L58.9 60.8 L58.4 61.2 L58.3 61.3 L57.8 61.6 L57.8 61.6 L57.2 62.0 L57.2 62.0 L56.6 62.3 L56.6 62.4 L56.0 62.6 L56.0 62.7 L55.4 62.9 L55.3 62.9 L54.7 63.2 L54.7 63.2 L54.5 63.3Z" fill="#fff"/><circle cx="50" cy="11" r="9.6" fill="#fff"/><circle cx="50" cy="89" r="9.6" fill="#fff"/><circle cx="11" cy="50" r="9.6" fill="#fff"/><circle cx="89" cy="50" r="9.6" fill="#fff"/></g></svg>` },
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
/* the order you pick in Settings (settings.app_layout); new apps land at the end of the desktop; Settings can never disappear */
let SAVED_LAYOUT = null;
function layout(){
  const keys = APPS.map(a => a.key), saved = SAVED_LAYOUT || {};
  const dock = (saved.dock || DOCK).filter(k => keys.includes(k));
  const desktop = (saved.desktop || keys.filter(k => !DOCK.includes(k))).filter(k => keys.includes(k) && !dock.includes(k));
  keys.forEach(k => { if (!dock.includes(k) && !desktop.includes(k)) desktop.push(k); });
  return { dock, desktop };
}
window.SimDeskLayout = { layout, apps: () => APPS.map(a => ({ key:a.key, name:a.name, icon:typeof a.icon === "function" ? a.icon() : a.icon })) };
window.addEventListener("gfb:layout", () => GFB.getAll().then(d => { SAVED_LAYOUT = (d.settings || {}).app_layout || null; drawIcons(); }));
const iconHTML = a => typeof a.icon === "function" ? a.icon() : a.icon;
function drawDock(){
  const open = location.hash.replace(/^#\/?/, "").split("/")[0];
  document.getElementById("dock").innerHTML = layout().dock.map(k => APPS.find(a => a.key === k)).filter(Boolean).map(a =>
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
  document.getElementById("icons").innerHTML = layout().desktop.map(k => APPS.find(a => a.key === k)).map(a =>
    `<a class="app" href="#/${a.key}" data-app="${a.key}"><span class="ic">${typeof a.icon === "function" ? a.icon() : a.icon}</span><span class="nm">${a.name}</span></a>`).join("");
}

function setAddress(host, path, system){ document.getElementById("winUrl").innerHTML = `<b>${host}</b>${path || ""}`; document.querySelector(".padlock").style.display = system ? "none" : ""; }

function placeholder(a){
  const t = a.theme;
  site.innerHTML = `<div class="ph" style="--ph-bg:${t.bg};--ph-ink:${t.ink};--ph-accent:${t.accent};--ph-font:${t.font}">
    <div class="box"><h1>${a.name}</h1><p>${a.tagline}</p><small>This site is still being built.</small></div></div>`;
  setAddress(a.host, "/");
}

/* back trail: a link that jumps to another app (a name in Cliq opening the Registry) leaves a breadcrumb.
   The back button returns to that exact page and scroll spot. Dock, desktop icons, and closing the window start fresh. */
const trail = [];
let navKind = null, pendingScroll = null, curHash = location.hash;
const appOf = h => APPS.find(a => a.key === String(h || "").replace(/^#\/?/, "").split("/")[0]);
const SHORT = { registry:"Registry", permits:"Permits", trust:"Harbor Trust" };
const backBtn = document.getElementById("winBack");
function noteNav(){
  const prev = curHash, next = location.hash, kind = navKind;
  curHash = next; navKind = null;
  const pa = appOf(prev), na = appOf(next);
  if (!na || kind === "fresh"){ trail.length = 0; return; }
  if (kind === "back" || !pa || pa.key === na.key) return;
  trail.push({ hash:prev, app:pa.key, scroll:site.scrollTop });
  if (trail.length > 30) trail.shift();
}
function drawBack(){
  const t = trail[trail.length - 1], a = t && APPS.find(x => x.key === t.app);
  backBtn.hidden = !a;
  if (a){ const n = SHORT[a.key] || a.name; backBtn.querySelector("span").textContent = n; backBtn.setAttribute("aria-label", "Back to " + n); }
  /* keeps the address bar centered when the button takes room on the left */
  document.querySelector(".titlebar").style.paddingRight = a && innerWidth > 720 ? (41 + backBtn.offsetWidth + 14) + "px" : "";
}
backBtn.addEventListener("click", () => {
  const t = trail.pop(); if (!t) return;
  navKind = "back"; pendingScroll = t.scroll; location.hash = t.hash;
});
function restoreScroll(){
  if (pendingScroll == null) return;
  const y = pendingScroll; pendingScroll = null;
  const put = () => { site.scrollTop = y; };
  requestAnimationFrame(() => { put(); requestAnimationFrame(put); });
  setTimeout(put, 180);   /* again once photos have settled the page height */
}

async function route(){
  noteNav();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const a = APPS.find(x => x.key === parts[0]);
  if (!a){ GFB.getAll().then(d => { GFB._cal = d.calendar; SAVED_LAYOUT = (d.settings || {}).app_layout || null; drawIcons(); tick(); }); win.hidden = true; site.innerHTML = ""; document.title = "SimDesk"; drawBack(); lastIcon?.focus(); return; }
  const wasHidden = win.hidden;
  win.hidden = false;
  if (wasHidden){ win.classList.remove("opening"); void win.offsetWidth; win.classList.add("opening"); }
  if (location.hash !== route.last){ site.scrollTop = 0; route.last = location.hash; }
  document.getElementById("winTitle").textContent = a.name;
  document.querySelector(".padlock").style.display = "";
  document.title = a.name;
  if (a.key === "registry"){
    const data = await GFB.getAll();
    const id = parts[1] && data.sims.some(s => s.id === parts[1]) ? parts[1] : null;   /* no id: the resident gallery */
    const sim = id && data.sims.find(s => s.id === id);
    setAddress(a.host, sim ? `/records/gfb-${sim.file_no}` : "/residents");
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
    const desk = parts[1] === "desk", story = parts[1] === "story" && parts[2];
    const st = story && data.stories.find(x => x.id === parts[2]);
    setAddress(a.host, desk ? "/desk" : story ? "/story/" + String((st && st.headline) || parts[2]).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) : "/");
    BlackTea.render(site, data, desk ? "desk" : story ? "story:" + parts[2] : "front");
  } else {
    placeholder(a);
  }
  drawBack();
  restoreScroll();
}

document.addEventListener("click", e => {
  const launch = e.target.closest(".app, .dk");
  if (launch && launch.getAttribute("href") !== location.hash) navKind = "fresh";
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
GFB.getAll().then(d => { GFB._cal = d.calendar; SAVED_LAYOUT = (d.settings || {}).app_layout || null; drawIcons(); tick(); });
drawIcons(); tick(); setInterval(tick, 30000);
window.addEventListener("hashchange", route);
window.addEventListener("hashchange", drawDock);
applyWallpaper();
route();
