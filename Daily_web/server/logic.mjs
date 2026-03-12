function clone(value) {
  return structuredClone(value);
}

function dayKey(date) {
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date) {
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function yearKey(date) {
  return String(date.getFullYear());
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfIsoWeek(date) {
  const current = dateOnly(date);
  const weekday = current.getDay() === 0 ? 7 : current.getDay();
  return new Date(current.getFullYear(), current.getMonth(), current.getDate() - weekday + 1);
}

function weekKey(date) {
  const current = dateOnly(date);
  const thursday = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() + (4 - (current.getDay() || 7)),
  );
  const weekYear = thursday.getFullYear();
  const weekOne = startOfIsoWeek(new Date(weekYear, 0, 4));
  const currentWeek = startOfIsoWeek(current);
  const weekNumber = Math.floor((currentWeek.getTime() - weekOne.getTime()) / 604800000) + 1;
  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
}

function parseDayKey(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseMonthKey(value) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function parseWeekKey(value) {
  const [yearRaw, weekRaw] = value.split('-W');
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  const weekOneMonday = startOfIsoWeek(new Date(year, 0, 4));
  return new Date(weekOneMonday.getFullYear(), weekOneMonday.getMonth(), weekOneMonday.getDate() + (week - 1) * 7);
}

function parseYearKey(value) {
  return new Date(Number(value), 0, 1);
}

function periodEndDate(scope, periodKey) {
  switch (scope) {
    case 'day':
      return parseDayKey(periodKey);
    case 'week': {
      const start = parseWeekKey(periodKey);
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    }
    case 'month': {
      const start = parseMonthKey(periodKey);
      return new Date(start.getFullYear(), start.getMonth() + 1, 0);
    }
    case 'year': {
      const start = parseYearKey(periodKey);
      return new Date(start.getFullYear(), 11, 31);
    }
    default:
      return parseDayKey(periodKey);
  }
}

function isPeriodOver(scope, periodKey, today) {
  return dateOnly(today).getTime() > dateOnly(periodEndDate(scope, periodKey)).getTime();
}

function nowInTimezone(timezoneId, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const map = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function normalizeTitle(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTime(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) {
    return null;
  }
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function normalizeTaskReminders(reminders = []) {
  const map = new Map();
  for (const reminder of reminders) {
    const time = normalizeTime(reminder.time);
    if (!time || typeof reminder.dateKey !== 'string') {
      continue;
    }
    map.set(`${reminder.dateKey}|${time}`, {
      id: reminder.id || crypto.randomUUID(),
      dateKey: reminder.dateKey,
      time,
    });
  }
  return [...map.values()].sort((a, b) => `${a.dateKey}|${a.time}`.localeCompare(`${b.dateKey}|${b.time}`));
}

function periodMarker(scope, periodKey) {
  return `${scope}|${periodKey}`;
}

function tasksFor(snapshot, scope, periodKey) {
  return snapshot.tasks.filter((task) => task.scope === scope && task.periodKey === periodKey);
}

function seedDefaultRecurring(snapshot, now) {
  const defaults = ['Почитать Библию', 'Принять причастие'];
  if (snapshot.recurring.some((item) => item.scope === 'day')) {
    return;
  }
  for (const title of defaults) {
    snapshot.recurring.push({
      id: crypto.randomUUID(),
      scope: 'day',
      title,
      description: null,
      remindersEnabled: false,
      reminders: [],
      referencePeriodKey: dayKey(now),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
}

function ensurePrayerRows(snapshot, now) {
  if (snapshot.prayer.length === 7) {
    return;
  }
  snapshot.prayer = Array.from({ length: 7 }, (_, weekday) => {
    const current = snapshot.prayer.find((item) => item.weekday === weekday);
    return {
      weekday,
      title: current?.title ?? null,
      description: current?.description ?? null,
      updatedAt: now.toISOString(),
    };
  });
}

function remapReminderToPeriod(scope, sourcePeriodKey, targetPeriodKey, reminder) {
  const reminderDate = parseDayKey(reminder.dateKey);
  if (scope === 'day') {
    return { ...reminder, id: crypto.randomUUID(), dateKey: targetPeriodKey };
  }
  if (scope === 'week') {
    const sourceStart = parseWeekKey(sourcePeriodKey);
    const targetStart = parseWeekKey(targetPeriodKey);
    const offsetDays = Math.max(0, Math.min(6, Math.round((reminderDate.getTime() - sourceStart.getTime()) / 86400000)));
    const target = new Date(targetStart.getFullYear(), targetStart.getMonth(), targetStart.getDate() + offsetDays);
    return { ...reminder, id: crypto.randomUUID(), dateKey: dayKey(target) };
  }
  if (scope === 'month') {
    const targetStart = parseMonthKey(targetPeriodKey);
    const target = new Date(
      targetStart.getFullYear(),
      targetStart.getMonth(),
      Math.min(reminderDate.getDate(), periodEndDate('month', targetPeriodKey).getDate()),
    );
    return { ...reminder, id: crypto.randomUUID(), dateKey: dayKey(target) };
  }
  const year = Number(targetPeriodKey);
  const month = reminderDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const target = new Date(year, month, Math.min(reminderDate.getDate(), lastDay));
  return { ...reminder, id: crypto.randomUUID(), dateKey: dayKey(target) };
}

function remapTemplateReminders(template, targetPeriodKey) {
  if (!template.remindersEnabled) {
    return [];
  }
  return normalizeTaskReminders(
    (template.reminders || []).map((reminder) => remapReminderToPeriod(template.scope, template.referencePeriodKey, targetPeriodKey, reminder)),
  );
}

function ensureDayPrayerTask(snapshot, dayPeriodKey, now) {
  const dayTasks = tasksFor(snapshot, 'day', dayPeriodKey);
  const prayerTasks = dayTasks.filter((task) => task.source === 'prayer' || task.source === 'prayerDefault');
  const weekday = (parseDayKey(dayPeriodKey).getDay() + 6) % 7;
  const entry = snapshot.prayer.find((item) => item.weekday === weekday);
  const desiredTitle = entry?.title ?? 'Помолиться';
  const desiredDescription = entry?.title ? entry.description : null;
  const desiredSource = entry?.title ? 'prayer' : 'prayerDefault';

  if (prayerTasks.length > 0) {
    const [first, ...rest] = prayerTasks;
    snapshot.tasks = snapshot.tasks.filter((task) => !rest.some((candidate) => candidate.id === task.id));
    snapshot.tasks = snapshot.tasks.map((task) =>
      task.id === first.id
        ? {
            ...task,
            title: desiredTitle,
            description: desiredDescription,
            source: desiredSource,
            isLocked: true,
            recurringId: null,
            remindersEnabled: false,
            reminders: [],
            updatedAt: now.toISOString(),
          }
        : task,
    );
    return;
  }

  snapshot.tasks.push({
    id: crypto.randomUUID(),
    scope: 'day',
    periodKey: dayPeriodKey,
    title: desiredTitle,
    description: desiredDescription,
    source: desiredSource,
    isLocked: true,
    recurringId: null,
    isDone: false,
    doneAt: null,
    remindersEnabled: false,
    reminders: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

function initializePeriodIfNeeded(snapshot, scope, periodKey, now) {
  const marker = periodMarker(scope, periodKey);
  snapshot.initializedPeriods ||= [];
  if (snapshot.initializedPeriods.includes(marker)) {
    return;
  }

  const existing = tasksFor(snapshot, scope, periodKey);
  const templates = snapshot.recurring.filter((item) => item.scope === scope);
  const existingRecurringIds = new Set(existing.map((task) => task.recurringId).filter(Boolean));
  const byTitle = new Map(existing.map((task) => [normalizeTitle(task.title), task]));

  for (const template of templates) {
    if (existingRecurringIds.has(template.id)) {
      continue;
    }
    const mappedReminders = remapTemplateReminders(template, periodKey);
    const candidate = byTitle.get(normalizeTitle(template.title));
    if (candidate) {
      snapshot.tasks = snapshot.tasks.map((task) =>
        task.id === candidate.id
          ? {
              ...task,
              title: template.title,
              description: template.description,
              source: 'recurring',
              isLocked: true,
              recurringId: template.id,
              remindersEnabled: template.remindersEnabled,
              reminders: mappedReminders,
              updatedAt: now.toISOString(),
            }
          : task,
      );
      continue;
    }
    snapshot.tasks.push({
      id: crypto.randomUUID(),
      scope,
      periodKey,
      title: template.title,
      description: template.description,
      source: 'recurring',
      isLocked: true,
      recurringId: template.id,
      isDone: false,
      doneAt: null,
      remindersEnabled: template.remindersEnabled,
      reminders: mappedReminders,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  snapshot.initializedPeriods.push(marker);
}

function addHistory(snapshot, action, message, now) {
  snapshot.history ||= [];
  snapshot.history.unshift({
    id: crypto.randomUUID(),
    action,
    message,
    timestamp: now.toISOString(),
    dayKey: dayKey(now),
  });
}

function finalizeOverduePeriods(snapshot, today) {
  snapshot.finalisedPeriods ||= [];
  const grouped = new Map();
  for (const task of snapshot.tasks) {
    const marker = periodMarker(task.scope, task.periodKey);
    grouped.set(marker, [...(grouped.get(marker) || []), task]);
  }
  grouped.forEach((items, marker) => {
    if (snapshot.finalisedPeriods.includes(marker)) {
      return;
    }
    const first = items[0];
    if (!first || !isPeriodOver(first.scope, first.periodKey, today)) {
      return;
    }
    snapshot.finalisedPeriods.push(marker);
    addHistory(snapshot, 'period_summary', `Итог ${first.scope} ${first.periodKey}: ${items.filter((item) => item.isDone).length}/${items.length}`, today);
  });
}

export function prepareSnapshotForNow(rawSnapshot, now = new Date()) {
  const snapshot = clone(rawSnapshot);
  snapshot.tasks ||= [];
  snapshot.recurring ||= [];
  snapshot.prayer ||= [];
  snapshot.history ||= [];
  snapshot.initializedPeriods ||= [];
  snapshot.finalisedPeriods ||= [];
  snapshot.settings ||= {};
  snapshot.settings.timezoneId ||= 'UTC';
  snapshot.selectedPeriods ||= {};

  const zoned = nowInTimezone(snapshot.settings.timezoneId, now);
  snapshot.selectedPeriods = {
    day: dayKey(zoned),
    week: weekKey(zoned),
    month: monthKey(zoned),
    year: yearKey(zoned),
  };
  snapshot.lastObservedDayKey = dayKey(zoned);

  seedDefaultRecurring(snapshot, zoned);
  ensurePrayerRows(snapshot, zoned);
  finalizeOverduePeriods(snapshot, zoned);

  for (const scope of ['day', 'week', 'month', 'year']) {
    const key = snapshot.selectedPeriods[scope];
    if (!isPeriodOver(scope, key, zoned)) {
      initializePeriodIfNeeded(snapshot, scope, key, zoned);
    }
  }
  ensureDayPrayerTask(snapshot, snapshot.selectedPeriods.day, zoned);

  return snapshot;
}

function tagDelivered(store, deviceId, tag, timestamp) {
  store.delivered[deviceId] ||= {};
  store.delivered[deviceId][tag] = timestamp;
}

function wasDelivered(store, deviceId, tag) {
  return Boolean(store.delivered?.[deviceId]?.[tag]);
}

function pruneDelivered(store) {
  const threshold = Date.now() - 30 * 86400000;
  for (const [deviceId, tags] of Object.entries(store.delivered || {})) {
    const compacted = Object.fromEntries(
      Object.entries(tags).filter(([, timestamp]) => new Date(timestamp).getTime() >= threshold),
    );
    store.delivered[deviceId] = compacted;
  }
}

export function computeDueNotifications(store, deviceId, rawSnapshot, now = new Date()) {
  const snapshot = prepareSnapshotForNow(rawSnapshot, now);
  const timezoneId = snapshot.settings?.timezoneId || 'UTC';
  const zoned = nowInTimezone(timezoneId, now);
  const todayKey = dayKey(zoned);
  const currentMinute = formatTime(zoned);
  const notifications = [];

  if (!snapshot.settings?.notificationsEnabled) {
    return { notifications, snapshot };
  }

  if (snapshot.settings.morningEnabled && snapshot.settings.morningTime === currentMinute) {
    const tag = `morning:${todayKey}:${currentMinute}`;
    if (!wasDelivered(store, deviceId, tag)) {
      notifications.push({
        tag,
        title: 'Daily',
        body: 'Доброе утро. Открой Daily и спокойно собери план на сегодня.',
        data: { url: '/?tab=plans' },
      });
    }
  }

  if (snapshot.settings.eveningEnabled && snapshot.settings.eveningTime === currentMinute) {
    const unfinished = tasksFor(snapshot, 'day', todayKey).filter((task) => !task.isDone).length;
    const tag = `evening:${todayKey}:${currentMinute}`;
    if (unfinished > 0 && !wasDelivered(store, deviceId, tag)) {
      notifications.push({
        tag,
        title: 'Daily',
        body: `Уже вечер, а план на сегодня еще не закрыт. Осталось ${unfinished} пунктов. Зайди в Daily и давай завершим его сегодня.`,
        data: { url: '/?tab=plans' },
      });
    }
  }

  for (const task of snapshot.tasks) {
    if (!task.remindersEnabled || task.isDone) {
      continue;
    }
    if (snapshot.finalisedPeriods.includes(periodMarker(task.scope, task.periodKey))) {
      continue;
    }
    for (const reminder of task.reminders || []) {
      if (reminder.dateKey !== todayKey || reminder.time !== currentMinute) {
        continue;
      }
      const tag = `task:${task.id}:${reminder.dateKey}:${reminder.time}`;
      if (wasDelivered(store, deviceId, tag)) {
        continue;
      }
      notifications.push({
        tag,
        title: 'Daily',
        body: `Напоминаю о задаче: ${task.title}`,
        data: { url: '/?tab=plans' },
      });
    }
  }

  return { notifications, snapshot };
}

export function markDelivered(store, deviceId, tag, timestamp = new Date().toISOString()) {
  tagDelivered(store, deviceId, tag, timestamp);
  pruneDelivered(store);
}
