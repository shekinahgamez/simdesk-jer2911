/* Huddl: LinkedIn-style network for Simerica's institutions (organizations with type "Institution").
   Home feed + company pages with tabs. "Signed in as" is shared with Cliq (settings.acting_sim). Reads and saves through GFB. */
const Huddl = (() => {
  const st = { q:"", modal:null, err:null, tab:"about", cat:"" };
  let data = null, root = null, route = [], lastKey = null;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const stripNick = n => String(n || "").replace(/\s*[\u201c\u201d"].*?[\u201c\u201d"]\s*/g, " ").replace(/\s+/g, " ").trim();
  const norm = n => stripNick(n).toLowerCase();
  const initials = n => stripNick(n).split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const tint = s => `hsl(${222 + hue(s) % 24} 52% ${34 + hue(s) % 16}%)`;
  const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const MARK = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M12.4 33.8 L12.3 33.9 L12.3 34.0 L12.2 34.2 L12.2 34.3 L12.2 34.5 L12.3 34.6 L12.3 34.7 L12.3 34.9 L12.4 35.0 L12.5 35.1 L12.6 35.2 L12.7 35.3 L12.8 35.4 L12.9 35.5 L13.0 35.6 L13.1 35.6 L13.3 35.7 L13.4 35.7 L13.8 35.8 L13.8 35.8 L14.5 35.9 L14.5 35.9 L15.2 36.1 L15.2 36.1 L15.9 36.3 L15.9 36.4 L16.5 36.6 L16.6 36.6 L17.2 36.9 L17.2 36.9 L17.8 37.2 L17.9 37.2 L18.4 37.6 L18.5 37.6 L19.0 37.9 L19.1 38.0 L19.6 38.3 L19.7 38.4 L20.2 38.8 L20.2 38.8 L20.7 39.2 L20.8 39.3 L21.2 39.7 L21.3 39.8 L21.7 40.2 L21.8 40.3 L22.2 40.8 L22.2 40.8 L22.6 41.3 L22.7 41.4 L23.0 41.9 L23.1 42.0 L23.4 42.5 L23.4 42.6 L23.8 43.1 L23.8 43.2 L24.1 43.8 L24.1 43.8 L24.4 44.4 L24.4 44.5 L24.6 45.1 L24.7 45.1 L24.8 45.5 L24.8 45.7 L24.9 45.8 L25.0 45.9 L25.1 46.0 L25.1 46.1 L25.2 46.2 L25.4 46.3 L25.5 46.3 L25.6 46.4 L25.7 46.4 L25.9 46.5 L26.0 46.5 L26.1 46.5 L35.4 46.5 L35.5 46.5 L35.7 46.5 L35.8 46.4 L35.9 46.4 L36.1 46.3 L36.2 46.3 L36.3 46.2 L36.4 46.1 L36.5 46.0 L36.6 45.9 L36.6 45.8 L36.7 45.7 L36.7 45.5 L36.8 45.3 L36.8 45.3 L37.1 44.7 L37.1 44.6 L37.3 44.0 L37.4 44.0 L37.6 43.4 L37.7 43.4 L38.0 42.8 L38.0 42.8 L38.4 42.2 L38.4 42.2 L38.7 41.7 L38.8 41.6 L39.2 41.1 L39.2 41.1 L39.6 40.6 L39.6 40.6 L40.1 40.1 L40.1 40.1 L40.6 39.6 L40.6 39.6 L41.1 39.2 L41.1 39.2 L41.6 38.8 L41.7 38.7 L42.2 38.4 L42.2 38.4 L42.8 38.0 L42.8 38.0 L43.4 37.7 L43.4 37.6 L44.0 37.4 L44.0 37.3 L44.6 37.1 L44.7 37.1 L45.3 36.8 L45.3 36.8 L45.5 36.7 L45.7 36.7 L45.8 36.6 L45.9 36.6 L46.0 36.5 L46.1 36.4 L46.2 36.3 L46.3 36.2 L46.3 36.1 L46.4 35.9 L46.4 35.8 L46.5 35.7 L46.5 35.5 L46.5 35.4 L46.5 26.1 L46.5 26.0 L46.5 25.9 L46.4 25.7 L46.4 25.6 L46.3 25.5 L46.3 25.4 L46.2 25.2 L46.1 25.1 L46.0 25.1 L45.9 25.0 L45.8 24.9 L45.7 24.8 L45.5 24.8 L45.1 24.7 L45.1 24.6 L44.5 24.4 L44.4 24.4 L43.8 24.1 L43.8 24.1 L43.2 23.8 L43.1 23.8 L42.6 23.4 L42.5 23.4 L42.0 23.1 L41.9 23.0 L41.4 22.7 L41.3 22.6 L40.8 22.2 L40.8 22.2 L40.3 21.8 L40.2 21.7 L39.8 21.3 L39.7 21.2 L39.3 20.8 L39.2 20.7 L38.8 20.2 L38.8 20.2 L38.4 19.7 L38.3 19.6 L38.0 19.1 L37.9 19.0 L37.6 18.5 L37.6 18.4 L37.2 17.9 L37.2 17.8 L36.9 17.2 L36.9 17.2 L36.6 16.6 L36.6 16.5 L36.4 15.9 L36.3 15.9 L36.1 15.2 L36.1 15.2 L35.9 14.5 L35.9 14.5 L35.8 13.8 L35.8 13.8 L35.7 13.4 L35.7 13.3 L35.6 13.1 L35.6 13.0 L35.5 12.9 L35.4 12.8 L35.3 12.7 L35.2 12.6 L35.1 12.5 L35.0 12.4 L34.9 12.3 L34.7 12.3 L34.6 12.3 L34.5 12.2 L34.3 12.2 L34.2 12.2 L34.0 12.3 L33.9 12.3 L33.8 12.4 L33.1 12.6 L33.1 12.7 L31.9 13.2 L31.8 13.2 L30.7 13.8 L30.7 13.9 L29.5 14.5 L29.5 14.5 L28.4 15.2 L28.3 15.2 L27.2 15.9 L27.2 15.9 L26.1 16.7 L26.1 16.7 L25.1 17.5 L25.0 17.5 L24.0 18.3 L24.0 18.3 L23.0 19.2 L22.9 19.2 L22.0 20.1 L22.0 20.1 L21.0 21.0 L21.0 21.0 L20.1 22.0 L20.1 22.0 L19.2 22.9 L19.2 23.0 L18.3 24.0 L18.3 24.0 L17.5 25.0 L17.5 25.1 L16.7 26.1 L16.7 26.1 L15.9 27.2 L15.9 27.2 L15.2 28.3 L15.2 28.4 L14.5 29.5 L14.5 29.5 L13.9 30.7 L13.8 30.7 L13.2 31.8 L13.2 31.9 L12.7 33.1 L12.6 33.1 L12.4 33.8Z" fill="#2E3A8C"/><path d="M54.5 24.8 L54.3 24.8 L54.2 24.9 L54.1 25.0 L54.0 25.1 L53.9 25.1 L53.8 25.2 L53.7 25.4 L53.7 25.5 L53.6 25.6 L53.6 25.7 L53.5 25.9 L53.5 26.0 L53.5 26.1 L53.5 35.4 L53.5 35.5 L53.5 35.7 L53.6 35.8 L53.6 35.9 L53.7 36.1 L53.7 36.2 L53.8 36.3 L53.9 36.4 L54.0 36.5 L54.1 36.6 L54.2 36.6 L54.3 36.7 L54.5 36.7 L54.7 36.8 L54.7 36.8 L55.3 37.1 L55.4 37.1 L56.0 37.3 L56.0 37.4 L56.6 37.6 L56.6 37.7 L57.2 38.0 L57.2 38.0 L57.8 38.4 L57.8 38.4 L58.3 38.7 L58.4 38.8 L58.9 39.2 L58.9 39.2 L59.4 39.6 L59.4 39.6 L59.9 40.1 L59.9 40.1 L60.4 40.6 L60.4 40.6 L60.8 41.1 L60.8 41.1 L61.2 41.6 L61.3 41.7 L61.6 42.2 L61.6 42.2 L62.0 42.8 L62.0 42.8 L62.3 43.4 L62.4 43.4 L62.6 44.0 L62.7 44.0 L62.9 44.6 L62.9 44.7 L63.2 45.3 L63.2 45.3 L63.3 45.5 L63.3 45.7 L63.4 45.8 L63.4 45.9 L63.5 46.0 L63.6 46.1 L63.7 46.2 L63.8 46.3 L63.9 46.3 L64.1 46.4 L64.2 46.4 L64.3 46.5 L64.5 46.5 L64.6 46.5 L73.9 46.5 L74.0 46.5 L74.1 46.5 L74.3 46.4 L74.4 46.4 L74.5 46.3 L74.6 46.3 L74.8 46.2 L74.9 46.1 L74.9 46.0 L75.0 45.9 L75.1 45.8 L75.2 45.7 L75.2 45.5 L75.3 45.1 L75.4 45.1 L75.6 44.5 L75.6 44.4 L75.9 43.8 L75.9 43.8 L76.2 43.2 L76.2 43.1 L76.6 42.6 L76.6 42.5 L76.9 42.0 L77.0 41.9 L77.3 41.4 L77.4 41.3 L77.8 40.8 L77.8 40.8 L78.2 40.3 L78.3 40.2 L78.7 39.8 L78.8 39.7 L79.2 39.3 L79.3 39.2 L79.8 38.8 L79.8 38.8 L80.3 38.4 L80.4 38.3 L80.9 38.0 L81.0 37.9 L81.5 37.6 L81.6 37.6 L82.1 37.2 L82.2 37.2 L82.8 36.9 L82.8 36.9 L83.4 36.6 L83.5 36.6 L84.1 36.4 L84.1 36.3 L84.8 36.1 L84.8 36.1 L85.5 35.9 L85.5 35.9 L86.2 35.8 L86.2 35.8 L86.6 35.7 L86.7 35.7 L86.9 35.6 L87.0 35.6 L87.1 35.5 L87.2 35.4 L87.3 35.3 L87.4 35.2 L87.5 35.1 L87.6 35.0 L87.7 34.9 L87.7 34.7 L87.7 34.6 L87.8 34.5 L87.8 34.3 L87.8 34.2 L87.7 34.0 L87.7 33.9 L87.6 33.8 L87.4 33.1 L87.3 33.1 L86.8 31.9 L86.8 31.8 L86.2 30.7 L86.1 30.7 L85.5 29.5 L85.5 29.5 L84.8 28.4 L84.8 28.3 L84.1 27.2 L84.1 27.2 L83.3 26.1 L83.3 26.1 L82.5 25.1 L82.5 25.0 L81.7 24.0 L81.7 24.0 L80.8 23.0 L80.8 22.9 L79.9 22.0 L79.9 22.0 L79.0 21.0 L79.0 21.0 L78.0 20.1 L78.0 20.1 L77.1 19.2 L77.0 19.2 L76.0 18.3 L76.0 18.3 L75.0 17.5 L74.9 17.5 L73.9 16.7 L73.9 16.7 L72.8 15.9 L72.8 15.9 L71.7 15.2 L71.6 15.2 L70.5 14.5 L70.5 14.5 L69.3 13.9 L69.3 13.8 L68.2 13.2 L68.1 13.2 L66.9 12.7 L66.9 12.6 L66.2 12.4 L66.1 12.3 L66.0 12.3 L65.8 12.2 L65.7 12.2 L65.5 12.2 L65.4 12.3 L65.3 12.3 L65.1 12.3 L65.0 12.4 L64.9 12.5 L64.8 12.6 L64.7 12.7 L64.6 12.8 L64.5 12.9 L64.4 13.0 L64.4 13.1 L64.3 13.3 L64.3 13.4 L64.2 13.8 L64.2 13.8 L64.1 14.5 L64.1 14.5 L63.9 15.2 L63.9 15.2 L63.7 15.9 L63.6 15.9 L63.4 16.5 L63.4 16.6 L63.1 17.2 L63.1 17.2 L62.8 17.8 L62.8 17.9 L62.4 18.4 L62.4 18.5 L62.1 19.0 L62.0 19.1 L61.7 19.6 L61.6 19.7 L61.2 20.2 L61.2 20.2 L60.8 20.7 L60.7 20.8 L60.3 21.2 L60.2 21.3 L59.8 21.7 L59.7 21.8 L59.2 22.2 L59.2 22.2 L58.7 22.6 L58.6 22.7 L58.1 23.0 L58.0 23.1 L57.5 23.4 L57.4 23.4 L56.9 23.8 L56.8 23.8 L56.2 24.1 L56.2 24.1 L55.6 24.4 L55.5 24.4 L54.9 24.6 L54.9 24.7 L54.5 24.8Z" fill="#7C8CFF"/><path d="M13.4 64.3 L13.3 64.3 L13.1 64.4 L13.0 64.4 L12.9 64.5 L12.8 64.6 L12.7 64.7 L12.6 64.8 L12.5 64.9 L12.4 65.0 L12.3 65.1 L12.3 65.3 L12.3 65.4 L12.2 65.5 L12.2 65.7 L12.2 65.8 L12.3 66.0 L12.3 66.1 L12.4 66.2 L12.6 66.9 L12.7 66.9 L13.2 68.1 L13.2 68.2 L13.8 69.3 L13.9 69.3 L14.5 70.5 L14.5 70.5 L15.2 71.6 L15.2 71.7 L15.9 72.8 L15.9 72.8 L16.7 73.9 L16.7 73.9 L17.5 74.9 L17.5 75.0 L18.3 76.0 L18.3 76.0 L19.2 77.0 L19.2 77.1 L20.1 78.0 L20.1 78.0 L21.0 79.0 L21.0 79.0 L22.0 79.9 L22.0 79.9 L22.9 80.8 L23.0 80.8 L24.0 81.7 L24.0 81.7 L25.0 82.5 L25.1 82.5 L26.1 83.3 L26.1 83.3 L27.2 84.1 L27.2 84.1 L28.3 84.8 L28.4 84.8 L29.5 85.5 L29.5 85.5 L30.7 86.1 L30.7 86.2 L31.8 86.8 L31.9 86.8 L33.1 87.3 L33.1 87.4 L33.8 87.6 L33.9 87.7 L34.0 87.7 L34.2 87.8 L34.3 87.8 L34.5 87.8 L34.6 87.7 L34.7 87.7 L34.9 87.7 L35.0 87.6 L35.1 87.5 L35.2 87.4 L35.3 87.3 L35.4 87.2 L35.5 87.1 L35.6 87.0 L35.6 86.9 L35.7 86.7 L35.7 86.6 L35.8 86.2 L35.8 86.2 L35.9 85.5 L35.9 85.5 L36.1 84.8 L36.1 84.8 L36.3 84.1 L36.4 84.1 L36.6 83.5 L36.6 83.4 L36.9 82.8 L36.9 82.8 L37.2 82.2 L37.2 82.1 L37.6 81.6 L37.6 81.5 L37.9 81.0 L38.0 80.9 L38.3 80.4 L38.4 80.3 L38.8 79.8 L38.8 79.8 L39.2 79.3 L39.3 79.2 L39.7 78.8 L39.8 78.7 L40.2 78.3 L40.3 78.2 L40.8 77.8 L40.8 77.8 L41.3 77.4 L41.4 77.3 L41.9 77.0 L42.0 76.9 L42.5 76.6 L42.6 76.6 L43.1 76.2 L43.2 76.2 L43.8 75.9 L43.8 75.9 L44.4 75.6 L44.5 75.6 L45.1 75.4 L45.1 75.3 L45.5 75.2 L45.7 75.2 L45.8 75.1 L45.9 75.0 L46.0 74.9 L46.1 74.9 L46.2 74.8 L46.3 74.6 L46.3 74.5 L46.4 74.4 L46.4 74.3 L46.5 74.1 L46.5 74.0 L46.5 73.9 L46.5 64.6 L46.5 64.5 L46.5 64.3 L46.4 64.2 L46.4 64.1 L46.3 63.9 L46.3 63.8 L46.2 63.7 L46.1 63.6 L46.0 63.5 L45.9 63.4 L45.8 63.4 L45.7 63.3 L45.5 63.3 L45.3 63.2 L45.3 63.2 L44.7 62.9 L44.6 62.9 L44.0 62.7 L44.0 62.6 L43.4 62.4 L43.4 62.3 L42.8 62.0 L42.8 62.0 L42.2 61.6 L42.2 61.6 L41.7 61.3 L41.6 61.2 L41.1 60.8 L41.1 60.8 L40.6 60.4 L40.6 60.4 L40.1 59.9 L40.1 59.9 L39.6 59.4 L39.6 59.4 L39.2 58.9 L39.2 58.9 L38.8 58.4 L38.7 58.3 L38.4 57.8 L38.4 57.8 L38.0 57.2 L38.0 57.2 L37.7 56.6 L37.6 56.6 L37.4 56.0 L37.3 56.0 L37.1 55.4 L37.1 55.3 L36.8 54.7 L36.8 54.7 L36.7 54.5 L36.7 54.3 L36.6 54.2 L36.6 54.1 L36.5 54.0 L36.4 53.9 L36.3 53.8 L36.2 53.7 L36.1 53.7 L35.9 53.6 L35.8 53.6 L35.7 53.5 L35.5 53.5 L35.4 53.5 L26.1 53.5 L26.0 53.5 L25.9 53.5 L25.7 53.6 L25.6 53.6 L25.5 53.7 L25.4 53.7 L25.2 53.8 L25.1 53.9 L25.1 54.0 L25.0 54.1 L24.9 54.2 L24.8 54.3 L24.8 54.5 L24.7 54.9 L24.6 54.9 L24.4 55.5 L24.4 55.6 L24.1 56.2 L24.1 56.2 L23.8 56.8 L23.8 56.9 L23.4 57.4 L23.4 57.5 L23.1 58.0 L23.0 58.1 L22.7 58.6 L22.6 58.7 L22.2 59.2 L22.2 59.2 L21.8 59.7 L21.7 59.8 L21.3 60.2 L21.2 60.3 L20.8 60.7 L20.7 60.8 L20.2 61.2 L20.2 61.2 L19.7 61.6 L19.6 61.7 L19.1 62.0 L19.0 62.1 L18.5 62.4 L18.4 62.4 L17.9 62.8 L17.8 62.8 L17.2 63.1 L17.2 63.1 L16.6 63.4 L16.5 63.4 L15.9 63.6 L15.9 63.7 L15.2 63.9 L15.2 63.9 L14.5 64.1 L14.5 64.1 L13.8 64.2 L13.8 64.2 L13.4 64.3Z" fill="#4A5BD0"/><path d="M54.5 63.3 L54.3 63.3 L54.2 63.4 L54.1 63.4 L54.0 63.5 L53.9 63.6 L53.8 63.7 L53.7 63.8 L53.7 63.9 L53.6 64.1 L53.6 64.2 L53.5 64.3 L53.5 64.5 L53.5 64.6 L53.5 73.9 L53.5 74.0 L53.5 74.1 L53.6 74.3 L53.6 74.4 L53.7 74.5 L53.7 74.6 L53.8 74.8 L53.9 74.9 L54.0 74.9 L54.1 75.0 L54.2 75.1 L54.3 75.2 L54.5 75.2 L54.9 75.3 L54.9 75.4 L55.5 75.6 L55.6 75.6 L56.2 75.9 L56.2 75.9 L56.8 76.2 L56.9 76.2 L57.4 76.6 L57.5 76.6 L58.0 76.9 L58.1 77.0 L58.6 77.3 L58.7 77.4 L59.2 77.8 L59.2 77.8 L59.7 78.2 L59.8 78.3 L60.2 78.7 L60.3 78.8 L60.7 79.2 L60.8 79.3 L61.2 79.8 L61.2 79.8 L61.6 80.3 L61.7 80.4 L62.0 80.9 L62.1 81.0 L62.4 81.5 L62.4 81.6 L62.8 82.1 L62.8 82.2 L63.1 82.8 L63.1 82.8 L63.4 83.4 L63.4 83.5 L63.6 84.1 L63.7 84.1 L63.9 84.8 L63.9 84.8 L64.1 85.5 L64.1 85.5 L64.2 86.2 L64.2 86.2 L64.3 86.6 L64.3 86.7 L64.4 86.9 L64.4 87.0 L64.5 87.1 L64.6 87.2 L64.7 87.3 L64.8 87.4 L64.9 87.5 L65.0 87.6 L65.1 87.7 L65.3 87.7 L65.4 87.7 L65.5 87.8 L65.7 87.8 L65.8 87.8 L66.0 87.7 L66.1 87.7 L66.2 87.6 L66.9 87.4 L66.9 87.3 L68.1 86.8 L68.2 86.8 L69.3 86.2 L69.3 86.1 L70.5 85.5 L70.5 85.5 L71.6 84.8 L71.7 84.8 L72.8 84.1 L72.8 84.1 L73.9 83.3 L73.9 83.3 L74.9 82.5 L75.0 82.5 L76.0 81.7 L76.0 81.7 L77.0 80.8 L77.1 80.8 L78.0 79.9 L78.0 79.9 L79.0 79.0 L79.0 79.0 L79.9 78.0 L79.9 78.0 L80.8 77.1 L80.8 77.0 L81.7 76.0 L81.7 76.0 L82.5 75.0 L82.5 74.9 L83.3 73.9 L83.3 73.9 L84.1 72.8 L84.1 72.8 L84.8 71.7 L84.8 71.6 L85.5 70.5 L85.5 70.5 L86.1 69.3 L86.2 69.3 L86.8 68.2 L86.8 68.1 L87.3 66.9 L87.4 66.9 L87.6 66.2 L87.7 66.1 L87.7 66.0 L87.8 65.8 L87.8 65.7 L87.8 65.5 L87.7 65.4 L87.7 65.3 L87.7 65.1 L87.6 65.0 L87.5 64.9 L87.4 64.8 L87.3 64.7 L87.2 64.6 L87.1 64.5 L87.0 64.4 L86.9 64.4 L86.7 64.3 L86.6 64.3 L86.2 64.2 L86.2 64.2 L85.5 64.1 L85.5 64.1 L84.8 63.9 L84.8 63.9 L84.1 63.7 L84.1 63.6 L83.5 63.4 L83.4 63.4 L82.8 63.1 L82.8 63.1 L82.2 62.8 L82.1 62.8 L81.6 62.4 L81.5 62.4 L81.0 62.1 L80.9 62.0 L80.4 61.7 L80.3 61.6 L79.8 61.2 L79.8 61.2 L79.3 60.8 L79.2 60.7 L78.8 60.3 L78.7 60.2 L78.3 59.8 L78.2 59.7 L77.8 59.2 L77.8 59.2 L77.4 58.7 L77.3 58.6 L77.0 58.1 L76.9 58.0 L76.6 57.5 L76.6 57.4 L76.2 56.9 L76.2 56.8 L75.9 56.2 L75.9 56.2 L75.6 55.6 L75.6 55.5 L75.4 54.9 L75.3 54.9 L75.2 54.5 L75.2 54.3 L75.1 54.2 L75.0 54.1 L74.9 54.0 L74.9 53.9 L74.8 53.8 L74.6 53.7 L74.5 53.7 L74.4 53.6 L74.3 53.6 L74.1 53.5 L74.0 53.5 L73.9 53.5 L64.6 53.5 L64.5 53.5 L64.3 53.5 L64.2 53.6 L64.1 53.6 L63.9 53.7 L63.8 53.7 L63.7 53.8 L63.6 53.9 L63.5 54.0 L63.4 54.1 L63.4 54.2 L63.3 54.3 L63.3 54.5 L63.2 54.7 L63.2 54.7 L62.9 55.3 L62.9 55.4 L62.7 56.0 L62.6 56.0 L62.4 56.6 L62.3 56.6 L62.0 57.2 L62.0 57.2 L61.6 57.8 L61.6 57.8 L61.3 58.3 L61.2 58.4 L60.8 58.9 L60.8 58.9 L60.4 59.4 L60.4 59.4 L59.9 59.9 L59.9 59.9 L59.4 60.4 L59.4 60.4 L58.9 60.8 L58.9 60.8 L58.4 61.2 L58.3 61.3 L57.8 61.6 L57.8 61.6 L57.2 62.0 L57.2 62.0 L56.6 62.3 L56.6 62.4 L56.0 62.6 L56.0 62.7 L55.4 62.9 L55.3 62.9 L54.7 63.2 L54.7 63.2 L54.5 63.3Z" fill="#2E3A8C"/><circle cx="50" cy="11" r="9.6" fill="#2E3A8C"/><circle cx="50" cy="89" r="9.6" fill="#2E3A8C"/><circle cx="11" cy="50" r="9.6" fill="#2E3A8C"/><circle cx="89" cy="50" r="9.6" fill="#4A5BD0"/></svg>`;
  const ICON = { home:'<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>', companies:'<rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 9h5v12h-5M8 7h3M8 11h3M8 15h3"/>', jobs:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>', people:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.8 0 5 2.2 5 5"/>' };
  const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  const insts = () => data.organizations.filter(o => o.type === "Institution");
  const byId = id => data.organizations.find(o => o.id === id);
  const simById = id => data.sims.find(s => s.id === id);
  const simFor = m => m && ((m.sim && simById(m.sim)) || data.sims.find(s => norm(s.name) === norm(m.name)));
  const lotById = id => data.lots.find(l => l.id === id);
  const go = h => { location.hash = "#/huddl" + (h ? "/" + h : ""); };
  const cats = () => [...new Set(insts().map(o => o.category).filter(Boolean))].sort();
  const today = () => UI.gameToday(data.calendar);
  const jobsOf = id => insts().flatMap(o => (o.members || []).filter(m => m.current !== false && simFor(m)?.id === id).map(m => ({ o, m })));
  const me = () => simById((data.settings || {}).acting_sim) || data.sims.find(s => jobsOf(s.id).length) || data.sims[0];
  const headline = s => { const j = jobsOf(s.id)[0]; return j ? [j.m.role, j.o.name].filter(Boolean).join(" at ") : (s.career || ""); };

  const tile = (o, cls = "") => o.logo ? `<span class="hd-tile img ${cls}" style="background-image:url('${esc(o.logo)}')" role="img" aria-label="${esc(o.name)} logo"></span>` : `<span class="hd-tile ${cls}" style="background:${tint(o.name)}">${esc(initials(o.name))}</span>`;
  /* Huddl uses the professional headshot (sim.headshot), never the casual profile photo */
  const av = (name, cls = "", sim) => { sim = sim || data.sims.find(x => norm(x.name) === norm(name)); const h = sim && sim.headshot; return `<span class="hd-av ${cls}${h ? " ph" : ""}" style="background:${tint(name)}">${h ? `<img src="${esc(h)}" alt="">` : esc(initials(name))}</span>`; };
  const simLink = (name, s) => s ? `<a class="hd-link" href="#/registry/${s.id}">${esc(name)}</a>` : esc(name);

  /* ---------- side columns ---------- */
  function leftCol() {
    const s = me(), here = route[0] || "home";
    const nav = [["home", "Home", ""], ["companies", "Companies", "companies"], ["jobs", "Jobs", "jobs"], ["people", "People", "people"]];
    return `<nav class="hd-card hd-nav" aria-label="Huddl">${nav.map(([k, n, h]) => `<a href="#/huddl${h ? "/" + h : ""}" ${(here === k || (k === "companies" && here === "org")) ? 'aria-current="page"' : ""}>${ico(k)}<span>${n}</span></a>`).join("")}</nav>
      ${s ? `<div class="hd-card hd-me"><div class="hd-me-ban"></div>${av(s.name, "xl")}<b>${simLink(s.name, s)}</b><span>${esc(headline(s)) || "&nbsp;"}</span>
        ${!s.headshot ? `<a class="hd-addhs" href="#/registry/${s.id}">Add a professional headshot</a>` : ""}<dl><div><dt>Companies</dt><dd>${jobsOf(s.id).length}</dd></div><div><dt>Connections</dt><dd>${data.relationships.filter(r => r.from_sim === s.id).length}</dd></div></dl></div>` : ""}`;
  }
  function rightCol() {
    const s = me(), mine = new Set(s ? jobsOf(s.id).map(j => j.o.id) : []);
    const follow = insts().filter(o => !mine.has(o.id)).slice(0, 5), jobs = insts().flatMap(o => (o.positions || []).map(p => ({ o, p }))).slice(0, 5);
    return `<div class="hd-card"><h3>Companies to follow</h3>${follow.map(o => `<a class="hd-sug" href="#/huddl/org/${o.id}">${tile(o, "sm")}<span><b>${esc(o.name)}</b><small>${esc([o.category, (o.members || []).length ? (o.members || []).length + " people" : ""].filter(Boolean).join(" \u00b7 "))}</small></span></a>`).join("") || `<p class="hd-none">You're at every company.</p>`}</div>
      <div class="hd-card"><h3>Open positions</h3>${jobs.length ? jobs.map(({ o, p }) => `<a class="hd-sug" href="#/huddl/org/${o.id}/jobs">${tile(o, "sm")}<span><b>${esc(p.title)}</b><small>${esc(o.name)}</small></span></a>`).join("") : `<p class="hd-none">Nothing open right now.</p>`}</div>`;
  }

  /* ---------- feed ---------- */
  const posts = () => [...(data.huddl_posts || [])].sort((a, b) => (UI.gameOrd(b.date, data.calendar) - UI.gameOrd(a.date, data.calendar)) || ((b.created || 0) - (a.created || 0)));
  function postCard(p) {
    const o = p.author_type === "org" ? byId(p.author_id) : null, s = p.author_type === "sim" ? simById(p.author_id) : null;
    if (!o && !s) return "";
    const who = o ? `<a class="hd-pname" href="#/huddl/org/${o.id}">${esc(o.name)}</a>` : `<span class="hd-pname">${simLink(s.name, s)}</span>`;
    const sub = o ? (o.category || "Company") : headline(s);
    return `<article class="hd-card hd-post"><header>${o ? tile(o) : av(s.name, "lg")}<span>${who}<small>${esc(sub)}${sub ? " \u00b7 " : ""}${esc(UI.gameLabel(p.date))}</small></span><button class="hd-del" data-hd="delpost:${p.id}" aria-label="Delete post">Delete</button></header><p>${esc(p.text)}</p></article>`;
  }
  function composer(fixedOrg) {
    const s = me();
    const opts = fixedOrg ? `<option value="org:${fixedOrg.id}">${esc(fixedOrg.name)}</option>` : `${s ? `<option value="sim:${s.id}">${esc(stripNick(s.name))}</option>` : ""}${insts().map(o => `<option value="org:${o.id}">${esc(o.name)}</option>`).join("")}`;
    return `<form class="hd-card hd-compose" data-f="post">${s && !fixedOrg ? av(s.name, "lg") : fixedOrg ? tile(fixedOrg) : ""}<div><textarea name="text" placeholder="Start a post" required></textarea>
      <div class="hd-crow"><label>Post as <select name="as">${opts}</select></label><button class="hd-btn" type="submit">Post</button></div></div></form>`;
  }
  const feed = list => list.length ? list.map(postCard).join("") : `<div class="hd-card hd-empty"><b>No posts yet.</b><p>Write the first one above. Adding a hire or an open position on a company page also posts here.</p></div>`;

  /* ---------- pages ---------- */
  function searchPage(q) {
    const cs = insts().filter(o => [o.name, o.category, o.about].join(" ").toLowerCase().includes(q));
    const ps = data.sims.filter(s => s.name.toLowerCase().includes(q)).slice(0, 30);
    return `<div class="hd-card"><h2>Results for "${esc(st.q)}"</h2><h4>Companies</h4>${cs.map(o => `<a class="hd-row-link" href="#/huddl/org/${o.id}">${tile(o, "sm")}<span><b>${esc(o.name)}</b><small>${esc(o.category || "")}</small></span></a>`).join("") || `<p class="hd-none">None</p>`}
      <h4>People</h4>${ps.map(s => `<a class="hd-row-link" href="#/registry/${s.id}">${av(s.name)}<span><b>${esc(s.name)}</b><small>${esc(headline(s))}</small></span></a>`).join("") || `<p class="hd-none">None</p>`}</div>`;
  }
  function companiesPage() {
    const list = insts().filter(o => !st.cat || o.category === st.cat);
    return `<div class="hd-card"><div class="hd-head"><h2>Companies <small>${list.length}</small></h2><button class="hd-btn" data-hd="new">Add a company</button></div>
      <div class="hd-chips">${["", ...cats()].map(c => `<button class="hd-chip" data-cat="${esc(c)}" aria-pressed="${(st.cat || "") === c}">${esc(c || "All")}</button>`).join("")}</div>
      <div class="hd-grid">${list.map(o => `<a class="hd-co" href="#/huddl/org/${o.id}"><span class="hd-co-ban" style="${o.banner ? `background:center/cover url('${esc(o.banner)}')` : `background:linear-gradient(120deg,${tint(o.name)},var(--sky))`}"></span>${tile(o, "co")}<b>${esc(o.name)}</b><small>${esc(o.category || "")}</small><span class="hd-co-a">${esc(o.about)}</span><small>${(o.members || []).filter(m => m.current !== false).length} people</small></a>`).join("")}</div></div>`;
  }
  function jobsPage() {
    const list = insts().flatMap(o => (o.positions || []).map(p => ({ o, p })));
    return `<div class="hd-card"><h2>Jobs <small>${list.length} open</small></h2>${list.length ? list.map(({ o, p }) => `<a class="hd-row-link" href="#/huddl/org/${o.id}/jobs">${tile(o)}<span><b>${esc(p.title)}</b><small>${esc(o.name)}${p.dept ? " \u00b7 " + esc(p.dept) : ""}</small>${p.notes ? `<small>${esc(p.notes)}</small>` : ""}</span></a>`).join("") : `<p class="hd-none">No open positions. Add one from a company's Jobs tab.</p>`}</div>`;
  }
  function peoplePage() {
    const rows = insts().flatMap(o => (o.members || []).filter(m => m.current !== false).map(m => ({ o, m, s:simFor(m) }))).sort((a, b) => stripNick(a.m.name).localeCompare(stripNick(b.m.name)));
    return `<div class="hd-card"><h2>People <small>${rows.length}</small></h2>${rows.map(({ o, m, s }) => `<div class="hd-row-link">${av(m.name)}<span><b>${simLink(m.name, s)}</b><small>${esc(m.role || "Team member")} at <a class="hd-link" href="#/huddl/org/${o.id}">${esc(o.name)}</a></small></span></div>`).join("") || `<p class="hd-none">No one listed yet.</p>`}</div>`;
  }
  function orgPage(o, tab) {
    const cur = (o.members || []).map((m, i) => ({ m, i })).filter(x => x.m.current !== false), former = (o.members || []).map((m, i) => ({ m, i })).filter(x => x.m.current === false);
    const lot = o.lot && lotById(o.lot), related = (o.related || []).map(r => ({ o2:byId(r.org), kind:r.kind })).filter(r => r.o2), ls = o.leader && simFor({ name:o.leader });
    const row = ({ m, i }) => `<div class="hd-person">${av(m.name, "lg")}<span class="hd-pt"><b>${simLink(m.name, simFor(m))}</b><small>${esc([m.role, m.dept].filter(Boolean).join(", ") || "Team member")}${m.since ? ` \u00b7 since ${esc(m.since)}` : ""}</small></span><button class="hd-mini" data-hd="person:${o.id}:${i}" aria-label="Edit ${esc(m.name)}">Edit</button></div>`;
    const tabs = [["about", "About"], ["people", `People (${cur.length})`], ["jobs", `Jobs (${(o.positions || []).length})`], ["posts", "Posts"]];
    let body = "";
    if (tab === "about") body = `<div class="hd-card"><h3>About</h3><p class="hd-about">${esc(o.about) || '<span class="hd-none">No description yet.</span>'}</p>
      <dl class="hd-dl">${o.founded_text ? `<div><dt>Founded</dt><dd>${esc(o.founded_text)}</dd></div>` : ""}<div><dt>Led by</dt><dd>${o.leader ? simLink(o.leader, ls) : '<span class="hd-none">Not set</span>'}</dd></div>
      <div><dt>Based at</dt><dd>${lot ? `<a class="hd-link" href="#/lotline/${lot.id}">${esc(lot.address)}</a>` : '<span class="hd-none">No lot yet</span>'}</dd></div>${o.district ? `<div><dt>District</dt><dd>${esc(o.district)}</dd></div>` : ""}
      ${related.length ? `<div><dt>Related</dt><dd>${related.map(r => `<a class="hd-link" href="#/huddl/org/${r.o2.id}">${esc(r.o2.name)}</a> <small>${esc(r.kind)}</small>`).join("<br>")}</dd></div>` : ""}</dl></div>
      ${o.notes ? `<div class="hd-card"><h3>Staff notes <small>Private</small></h3><p class="hd-about">${esc(o.notes)}</p></div>` : ""}`;
    if (tab === "people") body = `<div class="hd-card"><h3>People <button class="hd-mini" data-hd="person:${o.id}:new">Add person</button></h3>${cur.length ? cur.map(row).join("") : `<p class="hd-none">No one listed yet.</p>`}${former.length ? `<h4>Former</h4>${former.map(row).join("")}` : ""}</div>`;
    if (tab === "jobs") body = `<div class="hd-card"><h3>Open positions <button class="hd-mini" data-hd="pos:${o.id}:new">Add position</button></h3>${(o.positions || []).length ? o.positions.map(p => `<div class="hd-person">${tile(o, "sm")}<span class="hd-pt"><b>${esc(p.title)}</b><small>${esc([p.dept, p.notes].filter(Boolean).join(" \u00b7 "))}</small></span><button class="hd-mini" data-hd="pos:${o.id}:${p.id}">Edit</button></div>`).join("") : `<p class="hd-none">None open.</p>`}</div>`;
    if (tab === "posts") body = composer(o) + feed(posts().filter(p => p.author_type === "org" && p.author_id === o.id));
    return `<div class="hd-card hd-orghead"><div class="hd-banner${o.banner ? " has-img" : ""}"${o.banner ? ` style="background-image:url('${esc(o.banner)}')"` : ""}>${o.banner ? "" : `<span class="hd-pattern"></span>`}</div><div class="hd-ohead">${tile(o, "xl")}
        <div class="hd-orow"><div><h1>${esc(o.name)}</h1><p class="hd-sub">${esc([o.category, o.district, o.status && o.status !== "Active" ? o.status : ""].filter(Boolean).join(" \u00b7 "))}${cur.length ? ` \u00b7 ${cur.length} people` : ""}</p>${o.tagline ? `<p class="hd-tagline">${esc(o.tagline)}</p>` : ""}</div>
        <div class="hd-acts">${o.app ? `<a class="hd-btn ghost" href="#/${o.app}">Visit site</a>` : ""}<button class="hd-btn" data-hd="org:${o.id}">Edit page</button></div></div></div>
      <div class="hd-tabs" role="tablist">${tabs.map(([k, n]) => `<a role="tab" href="#/huddl/org/${o.id}${k === "about" ? "" : "/" + k}" aria-selected="${tab === k}">${n}</a>`).join("")}</div></div>${body}`;
  }
  function center() {
    const q = st.q.trim().toLowerCase();
    if (q) return searchPage(q);
    const v = route[0];
    if (v === "companies") return companiesPage();
    if (v === "jobs") return jobsPage();
    if (v === "people") return peoplePage();
    if (v === "org") { const o = byId(route[1]); return o ? orgPage(o, route[2] || "about") : `<div class="hd-card"><p class="hd-none">That company isn't on Huddl.</p></div>`; }
    return composer() + feed(posts());
  }

  /* ---------- forms ---------- */
  const simList = () => `<datalist id="hd-sims">${data.sims.map(s => `<option value="${esc(stripNick(s.name))}">`).join("")}</datalist>`;
  const field = (label, inner) => `<label class="hd-f"><span>${label}</span>${inner}</label>`;
  const acts = extra => `<div class="hd-fa">${extra || ""}<button type="button" class="hd-btn ghost" data-hd="close">Cancel</button><button class="hd-btn" type="submit">Save</button></div>`;
  function modal() {
    const [kind, a, b] = (st.modal || "").split(":"), err = st.err ? `<p class="hd-err">${esc(st.err)}</p>` : "";
    if (kind === "org") {
      const o = a === "new" ? { status:"Active", members:[], positions:[] } : byId(a);
      return `<form class="hd-form" data-f="org"><h2>${a === "new" ? "Add a company" : "Edit page"}</h2>
        ${field("Name", `<input name="name" value="${esc(o.name)}" required>`)}
        <div class="hd-f2">${field("Category", `<input name="category" list="hd-cats" value="${esc(o.category)}"><datalist id="hd-cats">${cats().map(c => `<option value="${esc(c)}">`).join("")}</datalist>`)}${field("Status", `<select name="status">${["Active","Forming","Closed"].map(x => `<option ${o.status === x ? "selected" : ""}>${x}</option>`).join("")}</select>`)}</div>
        ${field("Tagline", `<input name="tagline" value="${esc(o.tagline)}">`)}${field("About", `<textarea name="about">${esc(o.about)}</textarea>`)}
        <div class="hd-f2">${field("Founded", `<input name="founded_text" value="${esc(o.founded_text)}" placeholder="Year or in-game date">`)}${field("District", `<input name="district" value="${esc(o.district)}">`)}</div>
        <div class="hd-f2">${field("Led by", `<input name="leader" list="hd-sims" value="${esc(o.leader)}" autocomplete="off">`)}${field("Based at", `<select name="lot"><option value="">No lot yet</option>${data.lots.filter(l => !l.parent_id || l.id === o.lot).map(l => `<option value="${l.id}" ${o.lot === l.id ? "selected" : ""}>${esc(l.address)}</option>`).join("")}</select>`)}</div>
        <div class="hd-imgs">
          <div class="hd-imgf"><span>Header image</span>${o.banner ? `<span class="hd-thumb wide" style="background-image:url('${esc(o.banner)}')"></span><label class="hd-ck"><input type="checkbox" name="rm_banner"> Remove it (go back to the pattern)</label>` : ""}<input type="file" name="banner" accept="image/*"><small>Wide works best, like 1800 x 500.</small></div>
          <div class="hd-imgf"><span>Company logo</span>${o.logo ? `<span class="hd-thumb sq" style="background-image:url('${esc(o.logo)}')"></span><label class="hd-ck"><input type="checkbox" name="rm_logo"> Remove it (go back to the initials)</label>` : ""}<input type="file" name="logo" accept="image/*"><small>Square works best. It shows on the page, the feed, and the company list.</small></div></div>
        ${field("Staff notes (private)", `<textarea name="notes">${esc(o.notes)}</textarea>`)}${simList()}${err}
        ${acts(a === "new" ? "" : `<button type="button" class="hd-btn danger" data-hd="del:${o.id}">Delete</button><span class="hd-grow"></span>`)}</form>`;
    }
    if (kind === "person") {
      const o = byId(a), m = b === "new" ? { current:true } : o.members[+b];
      return `<form class="hd-form" data-f="person"><h2>${b === "new" ? "Add a person" : "Edit person"}</h2>
        ${field("Name", `<input name="name" list="hd-sims" value="${esc(m.name)}" required autocomplete="off">`)}
        <div class="hd-f2">${field("Title", `<input name="role" value="${esc(m.role)}">`)}${field("Department", `<input name="dept" value="${esc(m.dept)}">`)}</div>
        ${field("Since", `<input name="since" value="${esc(m.since)}" placeholder="Optional">`)}
        <label class="hd-ck"><input type="checkbox" name="current" ${m.current !== false ? "checked" : ""}> Currently works here</label>
        ${b === "new" ? `<label class="hd-ck"><input type="checkbox" name="announce" checked> Post a welcome to the feed</label>` : ""}${simList()}${err}
        ${acts(b === "new" ? "" : `<button type="button" class="hd-btn danger" data-hd="delp:${o.id}:${b}">Remove</button><span class="hd-grow"></span>`)}</form>`;
    }
    if (kind === "pos") {
      const o = byId(a), p = b === "new" ? {} : o.positions.find(x => x.id === b);
      return `<form class="hd-form" data-f="pos"><h2>${b === "new" ? "Add a position" : "Edit position"}</h2>
        ${field("Title", `<input name="title" value="${esc(p.title)}" required>`)}${field("Department", `<input name="dept" value="${esc(p.dept)}">`)}${field("Notes", `<textarea name="notes">${esc(p.notes)}</textarea>`)}
        ${b === "new" ? `<label class="hd-ck"><input type="checkbox" name="announce" checked> Post it to the feed</label>` : ""}${err}
        ${acts(b === "new" ? "" : `<button type="button" class="hd-btn danger" data-hd="delpos:${o.id}:${b}">Remove</button><span class="hd-grow"></span>`)}</form>`;
    }
    return "";
  }

  /* ---------- draw ---------- */
  function draw() {
    const s = me(), sims = [...data.sims].sort((a, b) => stripNick(a.name).localeCompare(stripNick(b.name)));
    root.innerHTML = `<div class="site-hd"><header class="hd-bar"><a class="hd-logo" href="#/huddl">${MARK}<span>Huddl</span></a>
        <input class="hd-search" id="hd-q" type="search" placeholder="Search companies and people" aria-label="Search Huddl" value="${esc(st.q)}">
        <label class="hd-as">${s ? av(s.name) : ""}<span class="hd-as-t"><small>Signed in as</small>${UI.picker({ id:"hd-as", value:s ? s.id : "", options:sims.map(x => ({ v:x.id, t:stripNick(x.name), s:headline(x) })), placeholder:"Search Sims", align:"right", label:"Signed in as" })}</span></label></header>
      <div class="hd-shell"><aside class="hd-left">${leftCol()}</aside><main class="hd-center">${center()}</main><aside class="hd-right">${rightCol()}</aside></div>
      ${st.modal ? `<div class="hd-modal">${modal()}</div>` : ""}</div>`;
  }
  async function refresh() { data = await GFB.getAll(); draw(); }
  const announce = (o, text) => GFB.saveHuddlPost({ author_type:"org", author_id:o.id, text, date:today(), created:Date.now(), auto:true });

  async function submit(form) {
    const f = new FormData(form), v = k => String(f.get(k) || "").trim(), [, a, b] = (st.modal || "").split(":");
    try {
      if (form.dataset.f === "post") {
        const [type, id] = v("as").split(":");
        await GFB.saveHuddlPost({ author_type:type, author_id:id, text:v("text"), date:today(), created:Date.now() }); await refresh(); return;
      }
      if (form.dataset.f === "org") {
        const old = a === "new" ? null : byId(a);
        const row = { ...(old || { type:"Institution", members:[], positions:[], related:[], tagline:"", app:"" }), name:v("name"), category:v("category"), status:v("status"), tagline:v("tagline"), about:v("about"), founded_text:v("founded_text"), district:v("district"), leader:v("leader"), lot:v("lot") || null, notes:v("notes") };
        if (!old) row.id = "org-" + slug(row.name) + "-" + Math.random().toString(36).slice(2, 5);
        if (row.leader && !(row.members || []).some(m => norm(m.name) === norm(row.leader))) row.members = [...(row.members || []), { name:row.leader, sim:null, role:"Leader", dept:"", since:"", current:true }];
        const bf = f.get("banner"), lf = f.get("logo");
        if (bf && bf.size) row.banner = (await GFB.uploadImage(bf, 1800)).url; else if (f.get("rm_banner")) row.banner = null;
        if (lf && lf.size) row.logo = (await GFB.uploadImage(lf, 400)).url; else if (f.get("rm_logo")) row.logo = null;
        const saved = await GFB.saveOrg(row); st.modal = null; await refresh(); if (!old) go("org/" + saved.id); return;
      }
      const o = byId(a);
      if (form.dataset.f === "person") {
        const s = data.sims.find(x => norm(x.name) === norm(v("name")));
        const m = { name:s ? s.name : v("name"), sim:s ? s.id : null, role:v("role"), dept:v("dept"), since:v("since"), current:!!f.get("current") };
        const members = [...(o.members || [])]; if (b === "new") members.push(m); else members[+b] = m;
        await GFB.saveOrg({ id:o.id, members });
        if (b === "new" && f.get("announce") && m.current) await announce(o, `Welcome ${stripNick(m.name)} to the team${m.role ? " as " + m.role : ""}.`);
      }
      if (form.dataset.f === "pos") {
        const p = { id:b === "new" ? rid("pos-") : b, title:v("title"), dept:v("dept"), notes:v("notes") };
        const positions = [...(o.positions || [])]; const i = positions.findIndex(x => x.id === p.id); if (i >= 0) positions[i] = p; else positions.push(p);
        await GFB.saveOrg({ id:o.id, positions });
        if (b === "new" && f.get("announce")) await announce(o, `We're hiring: ${p.title}${p.dept ? " (" + p.dept + ")" : ""}.`);
      }
      st.modal = null; st.err = null; await refresh();
    } catch (err) { st.err = err.message; draw(); }
  }

  let bound = false;
  function bind() {
    if (bound) return; bound = true;
    const mine = t => root && root.contains(t) && root.querySelector(".site-hd");
    document.addEventListener("click", async e => {
      if (!mine(e.target)) return;
      const t = e.target;
      if (t.classList.contains("hd-modal")) { st.modal = null; st.err = null; draw(); return; }
      const cb = t.closest("[data-cat]"); if (cb) { st.cat = cb.dataset.cat; draw(); return; }
      const b = t.closest("[data-hd]"); if (!b) return;
      const [act, a, c] = b.dataset.hd.split(":");
      if (act === "new") st.modal = "org:new";
      else if (act === "close") { st.modal = null; st.err = null; }
      else if (["org", "person", "pos"].includes(act)) st.modal = b.dataset.hd;
      else if (act === "delpost") { if (!UI.confirmTap(b, "Tap again")) return; await GFB.deleteHuddlPost(a); await refresh(); return; }
      else if (act === "del") { if (!UI.confirmTap(b, "Tap again to delete")) return; await GFB.deleteOrg(a); st.modal = null; await refresh(); go("companies"); return; }
      else if (act === "delp") { if (!UI.confirmTap(b, "Tap again to remove")) return; const o = byId(a); await GFB.saveOrg({ id:o.id, members:o.members.filter((_, i) => i !== +c) }); st.modal = null; await refresh(); return; }
      else if (act === "delpos") { if (!UI.confirmTap(b, "Tap again to remove")) return; const o = byId(a); await GFB.saveOrg({ id:o.id, positions:o.positions.filter(p => p.id !== c) }); st.modal = null; await refresh(); return; }
      st.err = null; draw();
    });
    document.addEventListener("input", e => { if (mine(e.target) && e.target.id === "hd-q") { st.q = e.target.value; const c = root.querySelector(".hd-center"); if (c) c.innerHTML = center(); } });
    document.addEventListener("change", async e => { if (mine(e.target) && e.target.id === "hd-as") { await GFB.saveSetting("acting_sim", e.target.value); await refresh(); } });
    document.addEventListener("submit", e => { if (mine(e.target) && e.target.dataset.f) { e.preventDefault(); submit(e.target); } });
  }
  function render(el, d, parts) { root = el; data = d; route = parts || []; const key = route.join("/"); if (key !== lastKey) { st.modal = null; st.err = null; st.q = ""; lastKey = key; } bind(); draw(); }
  function address(parts) { const [v, id, tab] = parts || []; if (v === "org") return "/company/" + (byId(id) ? slug(byId(id).name) : id) + (tab ? "/" + tab : ""); return "/" + (v || "feed"); }
  return { render, address };
})();
