/* eslint-disable no-restricted-globals */
// BOSC Asset Capture — minimal service worker.
// Strategy: cache the app shell on install; on fetch, try network and
// fall back to cache. Photo uploads go through normal fetch — when
// offline they fail and the queue retries.

const CACHE_NAME = 'asset-capture-v1';
const APP_SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache Supabase calls — they need to be live or fail.
  if (url.host.includes('supabase.co')) return;

  // Network-first for navigations and app assets; fall back to cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful same-origin GETs.
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('/')))
  );
});
