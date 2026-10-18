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

// Phone alerts (src/server/push.js): show the notification, and bring the
// admin forward (or open it) when it is tapped. `tag` makes a newer alert of
// the same kind (e.g. "screen is back online") replace the older one.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'ת"ח ת"ח', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/admin' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => new URL(w.url).pathname.startsWith('/admin'));
    if (open) return open.focus();
    return self.clients.openWindow(url);
  })());
});
