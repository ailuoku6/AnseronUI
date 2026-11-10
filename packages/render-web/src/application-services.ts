import { inbox } from './service-inbox.js';
export interface BrowserServiceOptions {
  /** Active app service worker, with installNativeServiceWorker installed. */
  registration?: ServiceWorkerRegistration;
  /** URL-safe base64 VAPID public key. Required only for remote push registration. */
  applicationServerKey?: string;
  /** Native service worker sync handler names. Browser sync runs when connectivity permits; no timer guarantee. */
  backgroundIdentifiers?: string[];
}
export class BrowserApplicationServices {
  constructor(private win: Window, private options: BrowserServiceOptions = {}) {}
  methods(module: string): string[] {
    const registration = this.options.registration;
    if (module === 'notifications' && registration?.active && 'Notification' in this.win) return ['cancel', 'getEvents', 'acknowledge', 'schedule', ...(this.options.applicationServerKey && 'pushManager' in registration ? ['register'] : [])];
    if (module === 'background' && registration?.active && (registration as any).sync) return ['schedule', 'pending', 'getEvents', 'acknowledge']; // SyncManager provides no unregister API.
    return [];
  }
  async call(module: string, method: string, args: any): Promise<unknown> {
    const registration = this.options.registration!;
    if (method === 'getEvents') return inbox(this.win.indexedDB, module);
    if (method === 'acknowledge') { if (!Array.isArray(args.ids) || !args.ids.every((v: unknown) => typeof v === 'string')) throw new Error('INVALID_ARGUMENT: ids'); await inbox(this.win.indexedDB, module, args.ids); return null; }
    if (module === 'notifications') {
      if (method === 'register') {
        const text = this.options.applicationServerKey!.replace(/-/g, '+').replace(/_/g, '/'); const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
        const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        return { token: JSON.stringify(subscription.toJSON()), provider: 'webpush' };
      }
      if (method === 'cancel') { for (const notification of await registration.getNotifications({ tag: String(args.id) })) notification.close(); return null; }
      // Web notification triggers are not widely available. Reject delayed delivery instead of a page timer.
      if (Number(args.delaySeconds ?? 0) !== 0) throw new Error('UNSUPPORTED: browser delayed notifications');
      if ((this.win as any).Notification.permission !== 'granted') throw new Error('PERMISSION_DENIED: notifications');
      if (typeof args.id !== 'string' || !args.id || typeof args.title !== 'string' || typeof args.body !== 'string') throw new Error('INVALID_ARGUMENT: notification');
      await registration.showNotification(args.title, { body: args.body, tag: args.id, data: { id: args.id } }); return null;
    }
    const sync = (registration as any).sync;
    if (method === 'pending') return (await sync.getTags()).filter((tag: string) => tag.startsWith('anseronui:')).map((tag: string) => tag.slice(10));
    if (!(this.options.backgroundIdentifiers ?? []).includes(args.identifier)) throw new Error('INVALID_ARGUMENT: unregistered background handler');
    if (Number(args.delaySeconds ?? 0) !== 0) throw new Error('UNSUPPORTED: browser sync has no delay scheduling');
    await sync.register('anseronui:' + args.identifier); return null;
  }
}
