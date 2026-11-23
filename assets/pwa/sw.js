// Service worker (a Hugo template, see layouts/_partials/voltra/pwa.html): keeps the site working offline.
// Pages: network first, so updates show up right away, with the cached copy when offline.
// Everything else (fingerprinted CSS/JS, icons, images): cache first, since their URLs change when they change.
const CACHE = 'voltra-{{ .version }}';
const BASE = {{ .base | jsonify | safeJS }};
const PAGES = {{ .pages | jsonify | safeJS }};
const ICONS = {{ .icons | jsonify | safeJS }};

// Same-site URLs a page uses: src/href attributes (quoted or not, as minified HTML has them) and url(...) in styles.
function assetsIn(html) {
  const out = new Set();
  const re = /(?:src|href)=["']?([^"'\s>]+)|url\(["']?([^"')]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const u = (m[1] || m[2]).split('#')[0];
    if (u.startsWith(BASE) && !u.endsWith('/') && !u.endsWith('.webmanifest')) out.add(u);
  }
  return out;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const assets = new Set(ICONS);
    await Promise.allSettled(PAGES.map(async (url) => {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return;
      const html = await res.clone().text();
      await cache.put(url, res);
      for (const a of assetsIn(html)) assets.add(a);
    }));
    await Promise.allSettled([...assets].map((a) => cache.add(a)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('voltra-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(url.pathname, res.clone());
        return res;
      } catch {
        return (await cache.match(url.pathname, { ignoreSearch: true }))
          || (await cache.match(BASE))
          || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
