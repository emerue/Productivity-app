/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// ---------------------------------------------------------------------------
// App shell: precache the built app, fonts and icons; serve index.html for
// navigations. /api/* has no route, so it always goes to the network:
// IndexedDB is the offline data layer, API responses are never cached.

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

// ---------------------------------------------------------------------------
// Updates: the page shows "Update available" and posts SKIP_WAITING on Reload.

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Notifications. V2 adds a `push` handler here (evening prompt, reminders)
// that calls self.registration.showNotification(); clicks already land below.

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        if (url !== '/') await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
