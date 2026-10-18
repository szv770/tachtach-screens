// Admin PWA service worker. Deliberately does no caching of its own — the
// admin always needs live data, and a stale cached build is worse than no
// offline support — so install/activate just take over immediately. This is
// also where push-notification handling (screen-offline alerts) lives.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
