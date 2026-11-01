/*
 * Offline app shell (TODO P1; see docs/ARCHITECTURE.md, "Offline shell").
 *
 * The local server may be stopped while the browser is still open, or after a
 * restart. This worker keeps the app's own files so the editor still opens.
 *
 * - Network first: when the server is running, it always wins, and each file it
 *   returns is stored as the newest copy.
 * - When the server is down, the last copy seen by this browser is served. A
 *   page that was never cached gets a plain 503 message.
 * - API calls are never cached. Plant data and designs always come from the
 *   server, so a stale design can never be shown as current.
 */
const CACHE = 'ppp-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
      } catch {
        const cached =
          (await cache.match(request)) ?? (request.mode === 'navigate' ? await cache.match('/') : undefined);
        if (cached) return cached;
        return new Response('Plant Planner Platform is offline, and this page was never saved for offline use.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});
