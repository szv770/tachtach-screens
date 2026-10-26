// Admin PWA service worker. Deliberately caches no app code — the admin always
// needs live data, and a stale cached build is worse than none. Its one
// fetch job: when the page itself cannot be reached (Pi off, Wi-Fi down, or
// Cloudflare's tunnel error 1033/530) show a clear "can't reach the box" page
// with the last-known snapshot instead of a browser/Cloudflare error. This is
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

// ---- Can't-reach-the-box page ------------------------------------------------
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function offlinePage(reason) {
  let snap = null;
  try {
    const c = await caches.open('tt-lastknown');
    const r = await c.match('/__lastknown');
    if (r) snap = await r.json();
  } catch { /* no snapshot */ }
  const when = snap && snap.at ? new Date(snap.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const facts = snap ? [
    snap.nowPlaying && `Last showing: ${snap.nowPlaying}`,
    snap.next && `Next on the schedule: ${snap.next}`,
    snap.live && `Messages that were live: ${snap.live}`,
  ].filter(Boolean) : [];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Can't reach the screen box</title>
<style>
:root{color-scheme:light dark;--bg:#faf7f1;--card:#fff;--ink:#1d1a14;--dim:#6b6558;--line:#e6e0d2;--accent:#8a5a12}
@media(prefers-color-scheme:dark){:root{--bg:#12100c;--card:#1c1914;--ink:#f3eee2;--dim:#a39b8a;--line:#2e2a21;--accent:#e0b055}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif;padding:max(20px,env(safe-area-inset-top)) 16px 32px}
main{max-width:520px;margin:0 auto}h1{font-size:24px;margin:8px 0 6px}p{margin:0 0 12px;color:var(--dim)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:14px 0}
.card h2{font-size:15px;margin:0 0 8px}ol{margin:0;padding-left:20px;color:var(--dim)}li{margin:6px 0}
button{width:100%;min-height:52px;border-radius:14px;border:0;background:var(--accent);color:#fff;font:700 17px system-ui;cursor:pointer}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#c0392b;margin-right:8px}small{color:var(--dim)}
</style></head><body><main>
<h1><span class="dot"></span>Can't reach the screen box</h1>
<p>${reason === 'device' ? 'This phone has no internet right now.' : 'The TachTach server isn\'t answering. The TV may be showing its last screen, or be off.'}</p>
<button id="retry">Try again</button>
<p style="margin-top:8px"><small id="st">Checking again every few seconds.</small></p>
<div class="card"><h2>What to check</h2><ol>
${reason === 'device' ? '<li>Turn on Wi-Fi or mobile data on this phone.</li>' : '<li>Is the screen box plugged in and the TV on? Try unplugging the box for 10 seconds.</li><li>Is the Wi-Fi / internet up? (The server needs it for this link.)</li><li>Give it 2–3 minutes after a power cut. It starts by itself.</li>'}
<li>Still nothing after 10 minutes? Ask whoever set up the server.</li></ol></div>
${snap ? `<div class="card"><h2>Last known${when ? ` (${esc(when)})` : ''}</h2>${facts.length ? '<ol style="list-style:none;padding:0">' + facts.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ol>' : '<p>Nothing saved.</p>'}</div>` : ''}
</main><script>
async function ping(){try{const r=await fetch('/admin/?ping='+Date.now(),{cache:'no-store'});if(r.ok&&!/Cloudflare Tunnel error/.test(await r.clone().text()))location.reload();else throw 0}catch(e){document.getElementById('st').textContent='Still cannot reach it. Checked '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}}
document.getElementById('retry').onclick=ping;setInterval(ping,15000);addEventListener('online',ping);
</script></body></html>`;
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;
  if (!new URL(req.url).pathname.startsWith('/admin')) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      // Cloudflare answers 530 (error 1033) when the tunnel to the Pi is down; 502-504 = box up but app down.
      if (res.status === 530 || (res.status >= 502 && res.status <= 504)) return offlinePage('box');
      return res;
    } catch {
      return offlinePage(self.navigator && self.navigator.onLine === false ? 'device' : 'box');
    }
  })());
});
