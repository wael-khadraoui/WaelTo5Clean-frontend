// Legacy service worker: immediately unregister and clear caches.
// This prevents old cached HTML/JS from breaking new deployments.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));

      // Unregister this service worker so future loads are not controlled by it.
      if (self.registration && self.registration.unregister) {
        await self.registration.unregister();
      }

      const clientsList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientsList) {
        client.navigate(client.url);
      }
    })()
  );
});

