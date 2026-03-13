import { dayKey, normalizeTime } from './date';
import { createInitialSnapshot, importSnapshot } from './planner';
import type { DailySnapshot, PlanScope, TaskReminder } from './types';

export const DAILY_EXCHANGE_FORMAT = 'daily-exchange-v1';

type ExchangeSource = 'daily-web' | 'daily-mobile';
type JsonRecord = Record<string, unknown>;

export interface DailyExchangeEnvelope {
  format: typeof DAILY_EXCHANGE_FORMAT;
  exportedAt: string;
  source: ExchangeSource;
  meta: {
    schemaVersion: number;
    updatedAt: string;
    appVersion?: string;
  };
  snapshot: DailySnapshot;
}

const scopes: PlanScope[] = ['day', 'week', 'month', 'year'];
const taskSources = new Set(['manual', 'recurring', 'prayer', 'prayerDefault']);

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const clean = value.trim();
  return clean ? clean : null;
}

function asIdString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return asString(value);
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function toIso(value: unknown, fallback: Date): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return fallback.toISOString();
}

function reminderId(dateKeyValue: string, timeValue: string, index: number): string {
  return `${dateKeyValue}|${timeValue}|${index}`;
}

function normalizeReminderList(raw: unknown, fallbackDateKey: string): TaskReminder[] {
  const reminders: TaskReminder[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => {
      const record = asRecord(entry);
      if (!record) {
        return;
      }
      const dateKeyValue = asString(record.dateKey) ?? fallbackDateKey;
      const timeValue = normalizeTime(asString(record.time) ?? '') ?? normalizeTime(asString(record.value) ?? '');
      if (!dateKeyValue || !timeValue) {
        return;
      }
      reminders.push({
        id: asString(record.id) ?? reminderId(dateKeyValue, timeValue, index),
        dateKey: dateKeyValue,
        time: timeValue,
      });
    });
  }

  if (reminders.length > 0) {
    return reminders.sort((a, b) => `${a.dateKey}|${a.time}`.localeCompare(`${b.dateKey}|${b.time}`));
  }

  if (Array.isArray(raw)) {
    return raw
      .map((entry, index) => {
        const timeValue = normalizeTime(entry);
        if (!timeValue) {
          return null;
        }
        return {
          id: reminderId(fallbackDateKey, timeValue, index),
          dateKey: fallbackDateKey,
          time: timeValue,
        } satisfies TaskReminder;
      })
      .filter((entry): entry is TaskReminder => Boolean(entry));
  }

  return [];
}

function snapshotFallbackUpdatedAt(snapshot: DailySnapshot): string {
  return snapshot.lastObservedDayKey ? `${snapshot.lastObservedDayKey}T00:00:00.000Z` : new Date().toISOString();
}

export function snapshotUpdatedAt(snapshot: DailySnapshot): string {
  const timestamps = [
    ...snapshot.tasks.map((item) => item.updatedAt),
    ...snapshot.recurring.map((item) => item.updatedAt),
    ...snapshot.prayer.map((item) => item.updatedAt),
    ...snapshot.history.map((item) => item.timestamp),
  ]
    .filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .map((value) => new Date(value).getTime());

  if (timestamps.length === 0) {
    return snapshotFallbackUpdatedAt(snapshot);
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

export function buildExchangeEnvelope(
  snapshot: DailySnapshot,
  source: ExchangeSource = 'daily-web',
  appVersion?: string,
): DailyExchangeEnvelope {
  return {
    format: DAILY_EXCHANGE_FORMAT,
    exportedAt: new Date().toISOString(),
    source,
    meta: {
      schemaVersion: snapshot.schemaVersion,
      updatedAt: snapshotUpdatedAt(snapshot),
      ...(appVersion ? { appVersion } : {}),
    },
    snapshot,
  };
}

function isExchangeEnvelope(raw: unknown): raw is DailyExchangeEnvelope {
  const record = asRecord(raw);
  if (!record) {
    return false;
  }
  return record.format === DAILY_EXCHANGE_FORMAT && Boolean(record.snapshot);
}

function scopeOrFallback(value: unknown, fallback: PlanScope): PlanScope {
  const clean = asString(value);
  if (clean && scopes.includes(clean as PlanScope)) {
    return clean as PlanScope;
  }
  return fallback;
}

function periodFallback(scope: PlanScope, fallback: DailySnapshot): string {
  return fallback.selectedPeriods[scope];
}

function convertLegacyMobileSnapshot(raw: JsonRecord): DailySnapshot {
  const timezoneId = asString(raw.timezoneId) ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const base = createInitialSnapshot(new Date());
  base.settings.timezoneId = timezoneId;

  const selectedPeriodsRaw = asRecord(raw.selectedPeriods) ?? {};
  const selectedPeriods = {
    day: asString(selectedPeriodsRaw.day) ?? base.selectedPeriods.day,
    week: asString(selectedPeriodsRaw.week) ?? base.selectedPeriods.week,
    month: asString(selectedPeriodsRaw.month) ?? base.selectedPeriods.month,
    year: asString(selectedPeriodsRaw.year) ?? base.selectedPeriods.year,
  } satisfies DailySnapshot['selectedPeriods'];

  const recurringRaw = Array.isArray(raw.recurring) ? raw.recurring : [];
  const recurringIdMap = new Map<string, string>();
  const recurring = recurringRaw.map((entry, index) => {
    const record = asRecord(entry) ?? {};
    const scope = scopeOrFallback(record.scope, 'day');
    const id = asIdString(record.id) ?? `legacy-recurring-${index + 1}`;
    recurringIdMap.set(String(record.id ?? id), id);
    const fallbackDateKey = selectedPeriods[scope] ?? periodFallback(scope, base);
    return {
      id,
      scope,
      title: asString(record.title) ?? 'Без названия',
      description: asString(record.description),
      remindersEnabled: asBoolean(record.remindersEnabled),
      reminders: normalizeReminderList(record.reminders ?? record.reminderTimes, fallbackDateKey),
      referencePeriodKey: fallbackDateKey,
      createdAt: toIso(record.createdAt, new Date()),
      updatedAt: toIso(record.updatedAt, new Date()),
    };
  });

  const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks = tasksRaw.map((entry, index) => {
    const record = asRecord(entry) ?? {};
    const scope = scopeOrFallback(record.scope, 'day');
    const periodKey = asString(record.periodKey) ?? periodFallback(scope, base);
    const recurringIdRaw = record.recurringId;
    const recurringId = recurringIdRaw == null
      ? null
      : recurringIdMap.get(String(recurringIdRaw)) ?? asIdString(recurringIdRaw);

    return {
      id: asIdString(record.id) ?? `legacy-task-${index + 1}`,
      scope,
      periodKey,
      title: asString(record.title) ?? 'Без названия',
      description: asString(record.description),
      source: taskSources.has(asString(record.source) ?? '') ? (asString(record.source) as DailySnapshot['tasks'][number]['source']) : 'manual',
      isLocked: asBoolean(record.isLocked),
      recurringId,
      isDone: asBoolean(record.isDone),
      doneAt: record.doneAt ? toIso(record.doneAt, new Date()) : null,
      remindersEnabled: asBoolean(record.remindersEnabled),
      reminders: normalizeReminderList(record.reminders ?? record.reminderTimes, periodKey),
      createdAt: toIso(record.createdAt, new Date()),
      updatedAt: toIso(record.updatedAt, new Date()),
    };
  });

  const prayerRaw = Array.isArray(raw.prayer) ? raw.prayer : [];
  const prayer = Array.from({ length: 7 }, (_, weekday) => {
    const record = prayerRaw.map(asRecord).find((item) => Number(item?.weekday ?? -1) === weekday) ?? {};
    return {
      weekday,
      title: asString(record.title),
      description: asString(record.description),
      updatedAt: toIso(record.updatedAt, new Date()),
    };
  });

  const historyRaw = Array.isArray(raw.history) ? raw.history : [];
  const history = historyRaw.map((entry, index) => {
    const record = asRecord(entry) ?? {};
    const timestamp = toIso(record.timestamp, new Date());
    return {
      id: asIdString(record.id) ?? `legacy-history-${index + 1}`,
      action: asString(record.action) ?? 'unknown',
      message: asString(record.message) ?? '',
      timestamp,
      dayKey: dayKey(new Date(timestamp)),
    };
  });

  const notificationsEnabled = asBoolean(raw.notificationsEnabled);
  const morningTime = normalizeTime(asString(raw.morningNotificationTime) ?? asString(raw.notificationTime) ?? '') ?? base.settings.morningTime;
  const eveningTime = normalizeTime(asString(raw.eveningNotificationTime) ?? '') ?? base.settings.eveningTime;
  const initializedPeriods = Array.isArray(raw.initializedPeriods) ? raw.initializedPeriods.map(asString).filter((item): item is string => Boolean(item)) : [];
  const finalizedRaw = raw.finalizedPeriods ?? raw.finalisedPeriods;
  const finalisedPeriods = Array.isArray(finalizedRaw)
    ? finalizedRaw
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : [];

  return {
    ...base,
    activeScope: scopeOrFallback(raw.activeScope, 'day'),
    selectedPeriods,
    tasks,
    recurring,
    prayer,
    history,
    settings: {
      notificationsEnabled,
      morningEnabled: notificationsEnabled,
      morningTime,
      eveningEnabled: notificationsEnabled,
      eveningTime,
      timezoneId,
    },
    initializedPeriods,
    finalisedPeriods,
    lastObservedDayKey: asString(raw.lastObservedDayKey) ?? selectedPeriods.day,
  };
}

export function importPortableSnapshot(raw: unknown): DailySnapshot {
  if (isExchangeEnvelope(raw)) {
    return importSnapshot(raw.snapshot);
  }

  const record = asRecord(raw);
  if (record && 'version' in record && !('settings' in record)) {
    return importSnapshot(convertLegacyMobileSnapshot(record));
  }

  return importSnapshot(raw);
}
