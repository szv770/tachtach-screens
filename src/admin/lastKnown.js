// A tiny snapshot of "how things were" kept in the Cache API so the service worker's can't-reach-the-box
// page (public/sw.js) can show it when the Pi or the Cloudflare tunnel is down. Best effort, never throws.
export async function saveLastKnown(snapshot) {
  try {
    if (typeof caches === 'undefined') return;
    const c = await caches.open('tt-lastknown');
    await c.put('/__lastknown', new Response(JSON.stringify({ ...snapshot, at: Date.now() }), { headers: { 'content-type': 'application/json' } }));
  } catch { /* private mode / old browser: the page just shows no snapshot */ }
}
