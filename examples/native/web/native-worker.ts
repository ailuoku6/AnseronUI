import { installNativeServiceWorker } from '@anseronui/render-web';
const scope = globalThis as any;
scope.addEventListener('install', () => scope.skipWaiting());
scope.addEventListener('activate', (event: any) => event.waitUntil(scope.clients.claim()));
installNativeServiceWorker(scope, {
  'org.anseronui.demo.refresh': async () => {
    const cache = await scope.caches.open('anseronui-demo-background');
    await cache.put(new URL('background-last-run', scope.registration.scope).href, new Response(String(Date.now())));
  },
});
