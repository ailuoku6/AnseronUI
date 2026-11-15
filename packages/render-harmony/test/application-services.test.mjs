import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadETS } from './load-ets.mjs';

export function applicationFixture() {
  const data = new Map(), reminders = new Map(), works = new Map(); let reminderId = 0;
  const db = { getSync: (key, fallback) => data.get(key) ?? fallback, putSync: (key, value) => data.set(key, value), hasSync: key => data.has(key), deleteSync: key => data.delete(key), flushSync() {} };
  const context = { abilityInfo: { bundleName: 'org.example', name: 'EntryAbility' } };
  const notification = { isNotificationEnabled: async () => true, cancel: async () => {}, SlotType: { SOCIAL_COMMUNICATION: 1 } };
  const workScheduler = {
    obtainAllWorks: async () => [...works.values()], startWork: work => works.set(work.workId, work), stopWork: work => works.delete(work.workId),
    NetworkType: { NETWORK_TYPE_ANY: 0 },
  };
  const classes = loadETS('HarmonyApplicationServices', {
    '@kit.ArkData': { preferences: { getPreferencesSync: () => db } },
    '@kit.ArkTS': { util: { generateRandomUUID: () => randomUUID(), TextEncoder: class { encodeInto(text) { return new TextEncoder().encode(text); } } } },
    '@kit.NotificationKit': { notificationManager: notification },
    '@kit.BackgroundTasksKit': { workScheduler, reminderAgentManager: {
      ReminderType: { REMINDER_TYPE_TIMER: 0 },
      getAllValidReminders: async () => [...reminders].map(([reminderId, reminderReq]) => ({ reminderId, reminderReq })),
      publishReminder: async request => { const id = ++reminderId; reminders.set(id, request); return id; },
      cancelReminder: async id => reminders.delete(id),
    } },
  });
  return { ...classes, service: new classes.HarmonyApplicationServices(context), context, data, reminders, works, notification, workScheduler };
}
test('notification IDs replace atomically across hosts and cancellation survives recreation', async () => {
  const f = applicationFixture(), second = new f.HarmonyApplicationServices(f.context);
  await Promise.all([
    f.service.invoke('notifications', 'schedule', { id: 'same', title: 'first', body: 'a', delaySeconds: 2 }),
    second.invoke('notifications', 'schedule', { id: 'same', title: 'second', body: 'b', delaySeconds: 3 }),
  ]);
  assert.equal(f.reminders.size, 1); assert.equal([...f.reminders.values()][0].title, 'second');
  await second.invoke('notifications', 'cancel', { id: 'same' }); assert.equal(f.reminders.size, 0);
  await second.invoke('notifications', 'cancel', { id: 'same' });
});
test('notification permission and invalid delays fail before replacing existing reminders', async () => {
  const f = applicationFixture();
  const args = { id: 'keep', title: 'title', body: 'body' };
  await f.service.invoke('notifications', 'schedule', args);
  await assert.rejects(f.service.invoke('notifications', 'schedule', { ...args, delaySeconds: 0 }), /INVALID_ARGUMENT/);
  f.notification.isNotificationEnabled = async () => false;
  await assert.rejects(f.service.invoke('notifications', 'schedule', args), /PERMISSION_DENIED/);
  assert.equal(f.reminders.size, 1);
});
test('push capability requires a provider; inbox bounds and acknowledgement are durable', async () => {
  const f = applicationFixture(); assert.equal(f.service.supports('notifications', 'register'), false);
  f.HarmonyNotifications.receiveWant(f.context, undefined);
  assert.deepEqual(await f.service.invoke('notifications', 'getEvents', {}), []);
  f.HarmonyNotifications.tokenProvider = async () => ({ token: 'token', provider: 'huawei' });
  assert.equal(f.service.supports('notifications', 'register'), true);
  assert.deepEqual(await f.service.invoke('notifications', 'register', {}), { token: 'token', provider: 'huawei' });
  for (let i = 0; i < 110; i++) f.HarmonyNotifications.receive(f.context, { n: i, text: '鸿'.repeat(500) });
  f.HarmonyNotifications.receiveWant(f.context, { uri: 'anseronui-notification:' + encodeURIComponent('通知') });
  const items = await f.service.invoke('notifications', 'getEvents', {});
  assert.ok(items.length <= 100 && Buffer.byteLength(JSON.stringify(items)) <= 48000);
  assert.equal(items.at(-1).kind, 'opened'); assert.deepEqual(items.at(-1).payload, { id: '通知' });
  await f.service.invoke('notifications', 'acknowledge', { ids: items.map(item => item.id) });
  assert.deepEqual(await new f.HarmonyApplicationServices(f.context).invoke('notifications', 'getEvents', {}), []);
});
test('background schedule uses registered native handlers, durable job IDs and one completion', async () => {
  const f = applicationFixture(); assert.equal(f.service.supports('background'), false);
  f.HarmonyBackground.register('refresh', (_context, complete) => { complete(true); complete(false); });
  assert.equal(f.service.supports('background'), true);
  await assert.rejects(f.service.invoke('background', 'schedule', { identifier: 'unknown' }), /register background/);
  await f.service.invoke('background', 'schedule', { identifier: 'refresh', delaySeconds: 0, requiresNetwork: true });
  assert.deepEqual(await f.service.invoke('background', 'pending', {}), ['refresh']);
  const work = [...f.works.values()][0]; assert.equal(work.isPersisted, true); assert.equal(work.networkType, 0);
  f.HarmonyBackground.start(f.context, work);
  const events = await f.service.invoke('background', 'getEvents', {});
  assert.equal(events.length, 1); assert.equal(events[0].success, true); assert.equal(f.works.size, 0);
  await f.service.invoke('background', 'acknowledge', { ids: [events[0].id] });
  assert.deepEqual(await f.service.invoke('background', 'getEvents', {}), []);
});
test('background expiration records failure once and cancels native work', async () => {
  const f = applicationFixture(); let completed, cancelled = 0;
  f.HarmonyBackground.register('refresh', (_context, done) => { completed = done; return () => cancelled++; });
  await f.service.invoke('background', 'schedule', { identifier: 'refresh', delaySeconds: 0 });
  const work = [...f.works.values()][0]; f.HarmonyBackground.start(f.context, work);
  f.HarmonyBackground.stop(work); f.HarmonyBackground.stop(work); completed(true);
  assert.equal(cancelled, 1); assert.equal((await f.service.invoke('background', 'getEvents', {}))[0].success, false);
  assert.equal((await f.service.invoke('background', 'getEvents', {})).length, 1);
});
test('early background delivery reschedules without running business work', async () => {
  const f = applicationFixture(); let started = false;
  f.HarmonyBackground.register('refresh', () => { started = true; });
  await f.service.invoke('background', 'schedule', { identifier: 'refresh', delaySeconds: 60 });
  f.HarmonyBackground.start(f.context, [...f.works.values()][0]);
  assert.equal(started, false); assert.equal(f.works.size, 1);
  await f.service.invoke('background', 'cancel', { identifier: 'refresh' }); assert.equal(f.works.size, 0);
});
