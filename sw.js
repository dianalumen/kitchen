// kitchen service worker: network first for the app's own files, cache only as an offline
// fallback, so a new deploy shows up on the next load. Supabase, the CDN and fonts (other
// origins) are never cached. Bump CACHE whenever SHELL changes (TECH-GUIDELINES §8).
const CACHE = "kitchen-v1";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
  "./i18n/pl.js",
  "./js/i18n.js", "./js/ui.js", "./js/store.js", "./js/backend.js", "./js/demo.js",
  "./js/shell.js", "./js/gates.js", "./js/settings.js",
  "./js/views/list.js", "./js/views/pantry.js", "./js/views/recipes.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/maskable-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // config.js holds the project URL and key; always fresh, cached only as a fallback like the rest.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((r) => r || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined))
        .then((r) => r || Response.error()))
  );
});
