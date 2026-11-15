import { common, Want } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { notificationManager } from '@kit.NotificationKit';
import { workScheduler, reminderAgentManager } from '@kit.BackgroundTasksKit';

export interface ApplicationArgs {
  id?: string; ids?: string[]; title?: string; body?: string; delaySeconds?: number;
  identifier?: string; requiresNetwork?: boolean;
}
export interface PushRegistration { token: string; provider: string; }
interface InboxEvent {
  id: string; timestamp: number; kind?: string; payload?: Record<string, Object>;
  identifier?: string; success?: boolean;
}
interface Reminder { reminderId: number; notificationId: number; }
function store(context: common.Context): preferences.Preferences {
  return preferences.getPreferencesSync(context, { name: 'anseronui-application-services' });
}
function identifier(value: string | undefined): string {
  if (typeof value !== 'string' || !value || value.length > 256) throw new Error('INVALID_ARGUMENT: identifier');
  return value;
}
function events(context: common.Context, key: string): InboxEvent[] {
  return JSON.parse(store(context).getSync(key, '[]') as string) as InboxEvent[];
}
function save(context: common.Context, key: string, values: InboxEvent[]): void {
  const db = store(context), encoder = new util.TextEncoder();
  let items = values.slice(-100);
  while (items.length && encoder.encodeInto(JSON.stringify(items)).byteLength > 48000) items.shift();
  db.putSync(key, JSON.stringify(items)); db.flushSync();
}
function acknowledge(context: common.Context, key: string, ids?: string[]): void {
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string')) throw new Error('INVALID_ARGUMENT: ids');
  save(context, key, events(context, key).filter(event => !ids.includes(event.id)));
}
function nextId(context: common.Context, key: string): number {
  const db = store(context), id = Number(db.getSync(key, 0)) + 1;
  if (!Number.isSafeInteger(id) || id > 2147483647) throw new Error('IO_ERROR: identifier space exhausted');
  db.putSync(key, id); db.flushSync(); return id;
}

/** Forward push callbacks here even when no UI/Core exists. Registration is opt-in. */
export class HarmonyNotifications {
  static tokenProvider: (() => Promise<PushRegistration>) | null = null;
  static receive(context: common.Context, payload: Record<string, Object>, opened: boolean = false): void {
    const event: InboxEvent = { id: util.generateRandomUUID(true), kind: opened ? 'opened' : 'received', payload, timestamp: Date.now() };
    save(context, 'notifications', events(context, 'notifications').concat([event]));
  }
  static tokenChanged(context: common.Context, token: string, provider: string): void {
    if (!token || !provider) throw new Error('IO_ERROR: empty push registration');
    const payload: Record<string, Object> = {}; payload['token'] = token; payload['provider'] = provider;
    const event: InboxEvent = { id: util.generateRandomUUID(true), kind: 'token', payload, timestamp: Date.now() };
    save(context, 'notifications', events(context, 'notifications').concat([event]));
  }
  static receiveWant(context: common.Context, want: Want | undefined): void {
    if (!want) return;
    const id = want.parameters?.anseronuiNotificationId;
    if (typeof id === 'string' && id.length > 0 && id.length <= 256) { const payload: Record<string, Object> = {}; payload['id'] = id; HarmonyNotifications.receive(context, payload, true); }
    else if (want.uri?.startsWith('anseronui-notification:')) {
      try { const payload: Record<string, Object> = {}; payload['id'] = decodeURIComponent(want.uri.substring('anseronui-notification:'.length)); HarmonyNotifications.receive(context, payload, true); } catch (_error) {}
    }
  }
}

export type BackgroundHandler = (context: common.Context, complete: (success: boolean) => void) => (() => void) | void;
class BackgroundRun {
  completed: boolean = false;
  cancel: (() => void) | null = null;
  finish: (success: boolean) => void = () => {};
}
/** Register handlers in both EntryAbility and WorkSchedulerExtensionAbility startup. */
export class HarmonyBackground {
  private static handlers: Map<string, BackgroundHandler> = new Map();
  private static running: Map<number, BackgroundRun> = new Map();
  static abilityName: string = 'AnseronUIWorkAbility';
  static register(name: string, handler: BackgroundHandler): boolean {
    identifier(name);
    if (HarmonyBackground.handlers.has(name)) return false;
    HarmonyBackground.handlers.set(name, handler); return true;
  }
  static contains(name: string): boolean { return HarmonyBackground.handlers.has(name); }
  static configured(): boolean { return HarmonyBackground.handlers.size > 0; }
  static start(context: common.Context, work: workScheduler.WorkInfo): void {
    if (HarmonyBackground.running.has(work.workId)) return;
    const name = String(work.parameters?.anseronuiIdentifier ?? '');
    const handler = HarmonyBackground.handlers.get(name);
    const notBefore = Number(work.parameters?.anseronuiNotBefore ?? 0);
    if (handler && Date.now() < notBefore) {
      workScheduler.stopWork(work, true);
      work.repeatCycleTime = Math.max(7200000, notBefore - Date.now());
      work.repeatCount = 1;
      workScheduler.startWork(work); return;
    }
    const run = new BackgroundRun(); HarmonyBackground.running.set(work.workId, run);
    run.finish = success => {
      if (run.completed) return;
      run.completed = true; HarmonyBackground.running.delete(work.workId);
      const event: InboxEvent = { id: util.generateRandomUUID(true), identifier: name, success, timestamp: Date.now() };
      try { save(context, 'background', events(context, 'background').concat([event])); }
      finally { try { workScheduler.stopWork(work, true); } catch (_error) {} }
    };
    if (!handler) { run.finish(false); return; }
    try { const cancel = handler(context, run.finish); if (!run.completed && cancel) run.cancel = cancel; }
    catch (_error) { run.finish(false); }
  }
  static stop(work: workScheduler.WorkInfo): void {
    const run = HarmonyBackground.running.get(work.workId); if (!run) return;
    const cancel = run.cancel;
    try { run.finish(false); } finally { cancel?.(); }
  }
}

/** Durable OS jobs and notifications outlive a page; no TSX closure is scheduled. */
export class HarmonyApplicationServices {
  private context: common.UIAbilityContext;
  private static notificationOperations: Promise<void> = Promise.resolve();
  private static backgroundOperations: Promise<void> = Promise.resolve();
  constructor(context: common.UIAbilityContext) { this.context = context; }
  supports(module: string, method?: string): boolean {
    let methods: string[] = [];
    if (module === 'notifications') {
      methods = ['schedule','cancel','getEvents','acknowledge'];
      if (HarmonyNotifications.tokenProvider) methods.push('register');
    }
    if (module === 'background' && HarmonyBackground.configured()) methods = ['schedule','pending','cancel','getEvents','acknowledge'];
    return method === undefined ? methods.length > 0 : methods.includes(method);
  }
  async invoke(module: string, method: string, args: ApplicationArgs): Promise<Object | null> {
    if (!this.supports(module, method)) throw new Error('UNSUPPORTED: ' + module + '.' + method);
    if (method === 'getEvents') return events(this.context, module);
    if (method === 'acknowledge') { acknowledge(this.context, module, args.ids); return null; }
    if (module === 'notifications') {
      if (method === 'register') {
        let timer = -1;
        const deadline = new Promise<PushRegistration>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('TIMEOUT: push registration')), 20000); });
        let registration: PushRegistration;
        try { registration = await Promise.race([HarmonyNotifications.tokenProvider!(), deadline]); }
        finally { clearTimeout(timer); }
        if (typeof registration.token !== 'string' || typeof registration.provider !== 'string' || !registration.token || !registration.provider) throw new Error('IO_ERROR: invalid push registration');
        HarmonyNotifications.tokenChanged(this.context, registration.token, registration.provider); return registration;
      }
      // Serialize across page hosts so repeated IDs cannot leave orphan reminders.
      const operation = HarmonyApplicationServices.notificationOperations.then(() => this.notification(method, args));
      HarmonyApplicationServices.notificationOperations = operation.then(() => {}, () => {});
      return await operation;
    }
    const operation = HarmonyApplicationServices.backgroundOperations.then(() => this.background(method, args));
    HarmonyApplicationServices.backgroundOperations = operation.then(() => {}, () => {});
    return await operation;
  }
  private async background(method: string, args: ApplicationArgs): Promise<Object | null> {
    const works = (await workScheduler.obtainAllWorks()).filter(work => work.abilityName === HarmonyBackground.abilityName && typeof work.parameters?.anseronuiIdentifier === 'string');
    if (method === 'pending') return works.map(work => String(work.parameters!.anseronuiIdentifier));
    const name = identifier(args.identifier);
    if (method === 'schedule' && !HarmonyBackground.contains(name)) throw new Error('INVALID_ARGUMENT: register background identifier at app startup');
    const delay = args.delaySeconds ?? 900;
    if (method === 'schedule' && (!Number.isFinite(delay) || delay < 0 || delay > 2592000 || (args.requiresNetwork !== undefined && typeof args.requiresNetwork !== 'boolean'))) throw new Error('INVALID_ARGUMENT: background request');
    for (const work of works) if (work.parameters!.anseronuiIdentifier === name) { workScheduler.stopWork(work, true); HarmonyBackground.stop(work); }
    if (method === 'cancel') return null;
    const work: workScheduler.WorkInfo = {
      workId: nextId(this.context, 'nextWorkId'), bundleName: this.context.abilityInfo.bundleName,
      abilityName: HarmonyBackground.abilityName, isPersisted: true, isRepeat: false,
      // API 21 requires a timing condition, including its finite repeat count.
      // WorkScheduler is opportunistic and uses a minimum two-hour interval.
      repeatCycleTime: Math.max(7200000, delay * 1000), repeatCount: 1,
      parameters: { anseronuiIdentifier: name, anseronuiNotBefore: Date.now() + delay * 1000 },
    };
    if (args.requiresNetwork) work.networkType = workScheduler.NetworkType.NETWORK_TYPE_ANY;
    workScheduler.startWork(work); return null;
  }
  private async notification(method: string, args: ApplicationArgs): Promise<null> {
    const id = identifier(args.id), db = store(this.context), key = 'reminder:' + encodeURIComponent(id);
    if (method === 'schedule') {
      if (typeof args.title !== 'string' || typeof args.body !== 'string' || args.title.length > 1024 || args.body.length > 4096) throw new Error('INVALID_ARGUMENT: notification');
      const delay = args.delaySeconds ?? 1;
      if (!Number.isFinite(delay) || delay < 1 || delay > 2592000) throw new Error('INVALID_ARGUMENT: delaySeconds (1..2592000)');
      if (!await notificationManager.isNotificationEnabled()) throw new Error('PERMISSION_DENIED: notifications');
    }
    if (db.hasSync(key)) {
      const previous = JSON.parse(db.getSync(key, '{}') as string) as Reminder;
      // Expired reminders may already be removed by the system.
      const valid = await reminderAgentManager.getAllValidReminders();
      if (valid.some(item => item.reminderId === previous.reminderId)) await reminderAgentManager.cancelReminder(previous.reminderId);
      await notificationManager.cancel(previous.notificationId).catch(() => {});
      db.deleteSync(key); db.flushSync();
    }
    if (method === 'cancel') return null;
    const notificationId = nextId(this.context, 'nextNotificationId');
    const parameters: Record<string, Object> = {}; parameters['anseronuiNotificationId'] = id;
    const request: reminderAgentManager.ReminderRequestTimer = {
      reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_TIMER,
      triggerTimeInSeconds: Math.ceil(args.delaySeconds ?? 1), title: args.title, content: args.body,
      notificationId, ringDuration: 0, tapDismissed: true, slotType: notificationManager.SlotType.SOCIAL_COMMUNICATION,
      wantAgent: { pkgName: this.context.abilityInfo.bundleName, abilityName: this.context.abilityInfo.name,
        uri: 'anseronui-notification:' + encodeURIComponent(id), parameters },
    };
    const reminderId = await reminderAgentManager.publishReminder(request);
    const value: Reminder = { reminderId, notificationId };
    try { db.putSync(key, JSON.stringify(value)); db.flushSync(); }
    catch (error) { await reminderAgentManager.cancelReminder(reminderId); throw new Error(String(error)); }
    return null;
  }
}
