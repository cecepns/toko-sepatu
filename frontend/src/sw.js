/* Service worker — dibundle vite-plugin-pwa (injectManifest + Workbox v7) */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

const handler = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(handler, {
    denylist: [/^\/api\//],
  })
);
