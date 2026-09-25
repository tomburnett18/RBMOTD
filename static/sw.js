// Bump CACHE when you deploy changes so phones pick up the new files.
const CACHE = "rbmotd-v1.2.0";
const ASSETS = [
  "/",
  "/static/css/app.css",
  "/static/js/app.js",
  "/static/js/games/rbmotd.js",
  "/static/js/games/gts11.js",
  "/static/js/games/quiz.js",
  "/static/js/games/fwordle.js",
  "/static/js/games/imposter.js",
  "/static/data/rbmotd.json",
  "/static/data/gts11.json",
  "/static/data/quiz.json",
  "/static/data/fwordle.json",
  "/static/data/imposter.json",
  "/static/icons/icon-192.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // Network first (so updates arrive), falling back to cache when offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("/")))
  );
});
