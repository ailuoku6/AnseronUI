import { inbox } from './service-inbox.js';
/** Install in the app's own service worker. Handlers must finish their native/background work before resolving. */
export function installNativeServiceWorker(scope: any, handlers: Record<string, () => Promise<void>> = {}): void {
  scope.addEventListener('push', (event: any) => event.waitUntil((async () => {
    let payload: Record<string, unknown>;
    try { payload = event.data?.json() ?? {}; } catch { payload = { body: event.data?.text() ?? '' }; }
    await inbox(scope.indexedDB, 'notifications', undefined, { kind: 'received', payload });
    await scope.registration.showNotification(String(payload.title ?? 'Notification'), { body: String(payload.body ?? ''), data: payload });
  })()));
  scope.addEventListener('notificationclick', (event: any) => event.waitUntil((async () => {
    event.notification.close(); await inbox(scope.indexedDB, 'notifications', undefined, { kind: 'opened', payload: event.notification.data ?? {} });
    const clients = await scope.clients.matchAll({ type: 'window' }); if (clients[0]) await clients[0].focus(); else await scope.clients.openWindow(scope.registration.scope);
  })()));
  scope.addEventListener('sync', (event: any) => {
    if (!String(event.tag).startsWith('anseronui:')) return;
    const identifier = String(event.tag).slice(10); const handler = handlers[identifier];
    event.waitUntil((async () => {
      let success = false; try { if (!handler) throw new Error('Unknown background handler'); await handler(); success = true; }
      finally { await inbox(scope.indexedDB, 'background', undefined, { identifier, success }); }
    })());
  });
}
