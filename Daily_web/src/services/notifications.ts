import { appTabUrl, assetUrl } from '../app/paths';
import { dayKey, formatTime } from '../domain/date';
import { currentTasks, nowForSnapshot } from '../domain/planner';
import type { DailySnapshot } from '../domain/types';
import type { AuthSession } from './auth';
import { authHeaders, postJson, requestJson } from './api';

const deliveredKey = 'daily-web-notification-log';
const deviceIdKey = 'daily-web-device-id';

interface NotificationPayload {
  title: string;
  body: string;
  tag: string;
  data?: Record<string, unknown>;
}

interface PushConfigResponse {
  enabled: boolean;
  publicKey: string;
  subject?: string;
}

let pushConfigCache: PushConfigResponse | null = null;

function getDeviceId(): string {
  const current = localStorage.getItem(deviceIdKey)?.trim();
  if (current) {
    return current;
  }
  const next = crypto.randomUUID();
  localStorage.setItem(deviceIdKey, next);
  return next;
}

function readDelivered(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(deliveredKey) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeDelivered(map: Record<string, string>): void {
  localStorage.setItem(deliveredKey, JSON.stringify(map));
}

function wasDelivered(tag: string): boolean {
  return Boolean(readDelivered()[tag]);
}

function markDelivered(tag: string): void {
  const current = readDelivered();
  current[tag] = new Date().toISOString();
  const threshold = Date.now() - 21 * 86400000;
  const compacted = Object.fromEntries(
    Object.entries(current).filter(([, timestamp]) => new Date(timestamp).getTime() >= threshold),
  );
  writeDelivered(compacted);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function fetchPushConfig(): Promise<PushConfigResponse | null> {
  if (pushConfigCache) {
    return pushConfigCache;
  }
  try {
    const { response, data } = await requestJson<PushConfigResponse>('/api/push/config');
    if (!response.ok || !data?.enabled || !data.publicKey) {
      return null;
    }
    pushConfigCache = data;
    return data;
  } catch {
    return null;
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  return navigator.serviceWorker.register(assetUrl('sw.js'));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') {
    return 'denied';
  }
  return Notification.requestPermission();
}

async function ensurePushSubscription(): Promise<{ deviceId: string; subscription: PushSubscriptionJSON } | null> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return null;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  const config = await fetchPushConfig();
  if (!config) {
    return null;
  }
  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!registration) {
    return null;
  }
  const applicationServerKey = urlBase64ToUint8Array(config.publicKey);
  const current = await registration.pushManager.getSubscription();
  const subscription =
    current ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    }));

  return {
    deviceId: getDeviceId(),
    subscription: subscription.toJSON(),
  };
}

export async function showNotification(payload: NotificationPayload): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return false;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.active) {
    registration.active.postMessage({ type: 'SHOW_NOTIFICATION', payload });
    return true;
  }
  new Notification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: assetUrl('icon-192.png'),
  });
  return true;
}

export async function syncSnapshotWithPushBackend(session: AuthSession | null, snapshot: DailySnapshot): Promise<boolean> {
  if (!session) {
    return false;
  }
  const registration = await ensurePushSubscription();
  if (!registration) {
    return false;
  }
  try {
    const { response } = await postJson<{ ok: boolean }>('/api/push/sync', {
      deviceId: registration.deviceId,
      subscription: registration.subscription,
      snapshot,
    }, {
      headers: authHeaders(session.token),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPushBackend(session: AuthSession | null): Promise<boolean> {
  const deviceId = localStorage.getItem(deviceIdKey)?.trim();
  if (!session || !deviceId) {
    return false;
  }
  try {
    const { response } = await postJson<{ ok: boolean }>('/api/push/unsubscribe', {
      deviceId,
    }, {
      headers: authHeaders(session.token),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendRemoteTestNotification(session: AuthSession | null): Promise<boolean> {
  if (!session) {
    return false;
  }
  const registration = await ensurePushSubscription();
  if (!registration) {
    return false;
  }
  try {
    const { response } = await postJson<{ ok: boolean }>('/api/push/test', {
      deviceId: registration.deviceId,
    }, {
      headers: authHeaders(session.token),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendTestNotification(): Promise<boolean> {
  return showNotification({
    title: 'Daily',
    body: 'Тестовое уведомление отправлено. Напоминания в веб-версии активны.',
    tag: `test-${Date.now()}`,
  });
}

export async function runNotificationCycle(snapshot: DailySnapshot): Promise<void> {
  if (!snapshot.settings.notificationsEnabled || typeof Notification === 'undefined') {
    return;
  }
  if (Notification.permission !== 'granted') {
    return;
  }

  const now = nowForSnapshot(snapshot);
  const todayKey = dayKey(now);
  const currentMinute = formatTime(now);

  if (snapshot.settings.morningEnabled && snapshot.settings.morningTime === currentMinute) {
    const tag = `morning:${todayKey}:${currentMinute}`;
    if (!wasDelivered(tag)) {
      const sent = await showNotification({
        title: 'Daily',
        body: 'Доброе утро. Открой Daily и спокойно собери план на сегодня.',
        tag,
        data: { url: appTabUrl('plans') },
      });
      if (sent) markDelivered(tag);
    }
  }

  if (snapshot.settings.eveningEnabled && snapshot.settings.eveningTime === currentMinute) {
    const unfinished = currentTasks({
      ...snapshot,
      activeScope: 'day',
      selectedPeriods: { ...snapshot.selectedPeriods, day: todayKey },
    }).filter((item) => !item.isDone).length;
    const tag = `evening:${todayKey}:${currentMinute}`;
    if (unfinished > 0 && !wasDelivered(tag)) {
      const sent = await showNotification({
        title: 'Daily',
        body: `Уже вечер, а план на сегодня еще не закрыт. Осталось ${unfinished} пунктов. Зайди в Daily и давай завершим его сегодня.`,
        tag,
        data: { url: appTabUrl('plans') },
      });
      if (sent) markDelivered(tag);
    }
  }

  for (const task of snapshot.tasks) {
    if (!task.remindersEnabled || task.isDone) {
      continue;
    }
    const periodMarker = `${task.scope}|${task.periodKey}`;
    if (snapshot.finalisedPeriods.includes(periodMarker)) {
      continue;
    }
    for (const reminder of task.reminders) {
      if (reminder.dateKey !== todayKey || reminder.time !== currentMinute) {
        continue;
      }
      const tag = `task:${task.id}:${reminder.dateKey}:${reminder.time}`;
      if (wasDelivered(tag)) {
        continue;
      }
      const sent = await showNotification({
        title: 'Daily',
        body: `Напоминаю о задаче: ${task.title}`,
        tag,
        data: { url: appTabUrl('plans') },
      });
      if (sent) markDelivered(tag);
    }
  }
}
