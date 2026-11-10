/* VehicleVault service worker — offline support.
 * Network-first with cache fallback for same-origin files, so new deploys to
 * GitHub Pages show up on the next load while the app still works offline.
 * Cross-origin requests (the GitHub API holding your private DB) pass straight
 * through and are never cached. */
const CACHE_NAME = "vehiclevault-cache-v4";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/storage.js",
  "./js/github-sync.js",
  "./js/vehicles.js",
  "./js/maintenance.js",
  "./js/reminders.js",
  "./js/expenses.js",
  "./js/documents.js",
  "./js/scanner.js",
  "./js/dashboard.js",
  "./js/export.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) { // never cache error pages over good copies
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then(cached => cached || (event.request.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});
