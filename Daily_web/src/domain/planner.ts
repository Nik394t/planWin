import {
  addPeriod,
  dayKey,
  dateOnly,
  editDeniedMessage,
  formatPeriodTitle,
  getEditPolicy,
  isCurrentPeriod,
  isPeriodOver,
  monthKey,
  normalizeTaskReminders,
  nowInTimezone,
  parseDayKey,
  parseMonthKey,
  parseWeekKey,
  periodEndDate,
  periodStartDate,
  schemaVersion,
  weekKey,
  yearKey,
} from './date';
import type {
  ActivityLogEntry,
  DailySnapshot,
  EditPolicy,
  PeriodProgress,
  PlanScope,
  PlanTask,
  PrayerDraftInput,
  PrayerPlanEntry,
  RecurringTaskTemplate,
  TaskDraftInput,
  TaskReminder,
  TaskSource,
} from './types';

const defaultDailyTasks = ['Почитать Библию', 'Принять причастие'];

function uid(): string {
  return crypto.randomUUID();
}

function iso(now: Date): string {
  return now.toISOString();
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function periodMarker(scope: PlanScope, periodKey: string): string {
  return `${scope}|${periodKey}`;
}

export function createInitialSnapshot(now: Date = new Date()): DailySnapshot {
  const timezoneId = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const zoned = nowInTimezone(timezoneId, now);
  const initial: DailySnapshot = {
    schemaVersion,
    activeTab: 'plans',
    activeScope: 'day',
    selectedPeriods: {
      day: dayKey(zoned),
      week: weekKey(zoned),
      month: monthKey(zoned),
      year: yearKey(zoned),
    },
    tasks: [],
    recurring: [],
    prayer: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      title: null,
      description: null,
      updatedAt: iso(zoned),
    })),
    history: [],
    settings: {
      notificationsEnabled: false,
      morningEnabled: true,
      morningTime: '06:00',
      eveningEnabled: true,
      eveningTime: '18:00',
      timezoneId,
    },
    initializedPeriods: [],
    finalisedPeriods: [],
    lastObservedDayKey: dayKey(zoned),
  };

  defaultDailyTasks.forEach((title) => {
    initial.recurring.push({
      id: uid(),
      scope: 'day',
      title,
      description: null,
      remindersEnabled: false,
      reminders: [],
      referencePeriodKey: dayKey(zoned),
      createdAt: iso(zoned),
      updatedAt: iso(zoned),
    });
  });

  return prepareSnapshot(initial, zoned);
}

export function cloneSnapshot(snapshot: DailySnapshot): DailySnapshot {
  return structuredClone(snapshot);
}

export function upgradeSnapshot(raw: unknown): DailySnapshot {
  const fallback = createInitialSnapshot();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const snapshot = raw as Partial<DailySnapshot>;
  const merged: DailySnapshot = {
    ...fallback,
    ...snapshot,
    selectedPeriods: {
      ...fallback.selectedPeriods,
      ...(snapshot.selectedPeriods ?? {}),
    },
    settings: {
      ...fallback.settings,
      ...(snapshot.settings ?? {}),
    },
    tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks : fallback.tasks,
    recurring: Array.isArray(snapshot.recurring) ? snapshot.recurring : fallback.recurring,
    prayer: Array.isArray(snapshot.prayer) && snapshot.prayer.length === 7 ? snapshot.prayer : fallback.prayer,
    history: Array.isArray(snapshot.history) ? snapshot.history : fallback.history,
    initializedPeriods: Array.isArray(snapshot.initializedPeriods) ? snapshot.initializedPeriods : [],
    finalisedPeriods: Array.isArray(snapshot.finalisedPeriods) ? snapshot.finalisedPeriods : [],
    lastObservedDayKey: typeof snapshot.lastObservedDayKey === 'string' ? snapshot.lastObservedDayKey : fallback.lastObservedDayKey,
    schemaVersion,
  };

  return prepareSnapshot(merged, nowForSnapshot(merged));
}

export function nowForSnapshot(snapshot: DailySnapshot, now: Date = new Date()): Date {
  return nowInTimezone(snapshot.settings.timezoneId, now);
}

export function selectedPeriodKey(snapshot: DailySnapshot): string {
  return snapshot.selectedPeriods[snapshot.activeScope];
}

export function tasksFor(snapshot: DailySnapshot, scope: PlanScope, periodKey: string): PlanTask[] {
  return snapshot.tasks.filter((task) => task.scope === scope && task.periodKey === periodKey);
}

export function currentTasks(snapshot: DailySnapshot): PlanTask[] {
  const list = tasksFor(snapshot, snapshot.activeScope, selectedPeriodKey(snapshot));
  return [...list].sort((a, b) => {
    if (a.isDone !== b.isDone) {
      return a.isDone ? 1 : -1;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function progressFor(snapshot: DailySnapshot, scope: PlanScope, periodKey: string): PeriodProgress {
  const tasks = tasksFor(snapshot, scope, periodKey);
  return {
    done: tasks.filter((item) => item.isDone).length,
    total: tasks.length,
  };
}

export function activeProgress(snapshot: DailySnapshot): PeriodProgress {
  return progressFor(snapshot, snapshot.activeScope, selectedPeriodKey(snapshot));
}

function addHistory(snapshot: DailySnapshot, action: string, message: string, now: Date): void {
  const entry: ActivityLogEntry = {
    id: uid(),
    action,
    message,
    timestamp: iso(now),
    dayKey: dayKey(now),
  };
  snapshot.history.unshift(entry);
}

function ensurePrayerRows(snapshot: DailySnapshot, now: Date): void {
  if (snapshot.prayer.length === 7) {
    return;
  }
  snapshot.prayer = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    title: snapshot.prayer.find((item) => item.weekday === weekday)?.title ?? null,
    description: snapshot.prayer.find((item) => item.weekday === weekday)?.description ?? null,
    updatedAt: iso(now),
  }));
}

function seedDefaultRecurring(snapshot: DailySnapshot, now: Date): void {
  const hasDayRecurring = snapshot.recurring.some((item) => item.scope === 'day');
  if (hasDayRecurring) {
    return;
  }
  defaultDailyTasks.forEach((title) => {
    snapshot.recurring.push({
      id: uid(),
      scope: 'day',
      title,
      description: null,
      remindersEnabled: false,
      reminders: [],
      referencePeriodKey: dayKey(now),
      createdAt: iso(now),
      updatedAt: iso(now),
    });
  });
}

function remapReminderToPeriod(
  scope: PlanScope,
  sourcePeriodKey: string,
  targetPeriodKey: string,
  reminder: TaskReminder,
): TaskReminder {
  const reminderDate = parseDayKey(reminder.dateKey);

  if (scope === 'day') {
    return { ...reminder, id: uid(), dateKey: targetPeriodKey };
  }

  if (scope === 'week') {
    const sourceStart = parseWeekKey(sourcePeriodKey);
    const targetStart = parseWeekKey(targetPeriodKey);
    const offsetDays = Math.max(0, Math.min(6, Math.round((reminderDate.getTime() - sourceStart.getTime()) / 86400000)));
    const target = new Date(targetStart.getFullYear(), targetStart.getMonth(), targetStart.getDate() + offsetDays);
    return { ...reminder, id: uid(), dateKey: dayKey(target) };
  }

  if (scope === 'month') {
    const targetStart = parseMonthKey(targetPeriodKey);
    const target = new Date(
      targetStart.getFullYear(),
      targetStart.getMonth(),
      Math.min(reminderDate.getDate(), periodEndDate('month', targetPeriodKey).getDate()),
    );
    return { ...reminder, id: uid(), dateKey: dayKey(target) };
  }

  const year = Number(targetPeriodKey);
  const month = reminderDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const target = new Date(year, month, Math.min(reminderDate.getDate(), lastDay));
  return { ...reminder, id: uid(), dateKey: dayKey(target) };
}

function remapTemplateReminders(template: RecurringTaskTemplate, targetPeriodKey: string): TaskReminder[] {
  if (!template.remindersEnabled) {
    return [];
  }
  return normalizeTaskReminders(
    template.reminders.map((reminder) =>
      remapReminderToPeriod(template.scope, template.referencePeriodKey, targetPeriodKey, reminder),
    ),
  );
}

function ensureDayPrayerTask(snapshot: DailySnapshot, dayPeriodKey: string, now: Date): void {
  const dayTasks = tasksFor(snapshot, 'day', dayPeriodKey);
  const prayerTasks = dayTasks.filter((task) => task.source === 'prayer' || task.source === 'prayerDefault');
  const date = parseDayKey(dayPeriodKey);
  const weekday = (date.getDay() + 6) % 7;
  const entry = snapshot.prayer.find((item) => item.weekday === weekday);
  const desiredTitle = entry?.title ?? 'Помолиться';
  const desiredDescription = entry?.title ? entry.description : null;
  const desiredSource: TaskSource = entry?.title ? 'prayer' : 'prayerDefault';

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
            updatedAt: iso(now),
          }
        : task,
    );
    return;
  }

  snapshot.tasks.push({
    id: uid(),
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
    createdAt: iso(now),
    updatedAt: iso(now),
  });
}

function initializePeriodIfNeeded(snapshot: DailySnapshot, scope: PlanScope, periodKey: string, now: Date): void {
  const marker = periodMarker(scope, periodKey);
  if (snapshot.initializedPeriods.includes(marker)) {
    return;
  }

  const existing = tasksFor(snapshot, scope, periodKey);
  const templates = snapshot.recurring.filter((item) => item.scope === scope);
  const existingRecurringIds = new Set(existing.map((task) => task.recurringId).filter(Boolean));
  const byTitle = new Map(existing.map((task) => [normalizeTitle(task.title), task]));

  templates.forEach((template) => {
    if (existingRecurringIds.has(template.id)) {
      return;
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
              updatedAt: iso(now),
            }
          : task,
      );
      return;
    }

    snapshot.tasks.push({
      id: uid(),
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
      createdAt: iso(now),
      updatedAt: iso(now),
    });
  });

  snapshot.initializedPeriods.push(marker);
}

function finalizeOverduePeriods(snapshot: DailySnapshot, today: Date): void {
  const grouped = new Map<string, PlanTask[]>();
  snapshot.tasks.forEach((task) => {
    const marker = periodMarker(task.scope, task.periodKey);
    grouped.set(marker, [...(grouped.get(marker) ?? []), task]);
  });

  grouped.forEach((items, marker) => {
    if (snapshot.finalisedPeriods.includes(marker)) {
      return;
    }
    const [first] = items;
    if (!first || !isPeriodOver(first.scope, first.periodKey, today)) {
      return;
    }
    snapshot.finalisedPeriods.push(marker);
    addHistory(
      snapshot,
      'period_summary',
      `Итог ${scopeLabel(first.scope)} ${first.periodKey}: ${items.filter((item) => item.isDone).length}/${items.length}`,
      today,
    );
  });
}

function prepareVisiblePeriods(snapshot: DailySnapshot, today: Date): void {
  finalizeOverduePeriods(snapshot, today);
  (['day', 'week', 'month', 'year'] as PlanScope[]).forEach((scope) => {
    const key = snapshot.selectedPeriods[scope];
    if (!isPeriodOver(scope, key, today)) {
      initializePeriodIfNeeded(snapshot, scope, key, today);
    }
  });
  if (!isPeriodOver('day', snapshot.selectedPeriods.day, today)) {
    ensureDayPrayerTask(snapshot, snapshot.selectedPeriods.day, today);
  }
}

export function prepareSnapshot(snapshot: DailySnapshot, now: Date = nowForSnapshot(snapshot)): DailySnapshot {
  const next = cloneSnapshot(snapshot);
  ensurePrayerRows(next, now);
  seedDefaultRecurring(next, now);
  prepareVisiblePeriods(next, now);
  next.lastObservedDayKey = dayKey(now);
  return next;
}

export function setActiveTab(snapshot: DailySnapshot, tab: DailySnapshot['activeTab']): DailySnapshot {
  return { ...snapshot, activeTab: tab };
}

export function setActiveScope(snapshot: DailySnapshot, scope: PlanScope, now: Date = nowForSnapshot(snapshot)): DailySnapshot {
  return prepareSnapshot({ ...snapshot, activeScope: scope }, now);
}

export function shiftSelectedPeriod(snapshot: DailySnapshot, delta: number, now: Date = nowForSnapshot(snapshot)): DailySnapshot {
  const next = cloneSnapshot(snapshot);
  next.selectedPeriods[next.activeScope] = addPeriod(next.activeScope, next.selectedPeriods[next.activeScope], delta);
  return prepareSnapshot(next, now);
}

export function jumpToCurrent(snapshot: DailySnapshot, now: Date = nowForSnapshot(snapshot)): DailySnapshot {
  const next = cloneSnapshot(snapshot);
  next.selectedPeriods = {
    day: dayKey(now),
    week: weekKey(now),
    month: monthKey(now),
    year: yearKey(now),
  };
  return prepareSnapshot(next, now);
}

export function refreshForNow(snapshot: DailySnapshot, now: Date = nowForSnapshot(snapshot)): DailySnapshot {
  if (snapshot.lastObservedDayKey === dayKey(now)) {
    return prepareSnapshot(snapshot, now);
  }
  return jumpToCurrent(snapshot, now);
}

export function addDeniedReason(snapshot: DailySnapshot, scope: PlanScope, periodKey: string, today: Date): string | null {
  if (snapshot.finalisedPeriods.includes(periodMarker(scope, periodKey))) {
    return 'Период уже закрыт. Правки недоступны.';
  }
  if (isPeriodOver(scope, periodKey, today)) {
    return 'Нельзя добавлять задачи в прошедший период.';
  }
  return null;
}

export function editDeniedReason(snapshot: DailySnapshot, scope: PlanScope, periodKey: string, today: Date): string | null {
  if (snapshot.finalisedPeriods.includes(periodMarker(scope, periodKey))) {
    return 'Период уже закрыт. Правки недоступны.';
  }
  const policy = getEditPolicy(scope, periodKey, today);
  if (policy === 'deny') {
    return editDeniedMessage(scope);
  }
  return null;
}

export function editPolicyFor(snapshot: DailySnapshot, scope: PlanScope, periodKey: string, today: Date): EditPolicy {
  if (snapshot.finalisedPeriods.includes(periodMarker(scope, periodKey))) {
    return 'deny';
  }
  return getEditPolicy(scope, periodKey, today);
}

function validateReminders(
  scope: PlanScope,
  periodKey: string,
  reminders: TaskReminder[],
  now: Date,
): string | null {
  const start = periodStartDate(scope, periodKey);
  const end = periodEndDate(scope, periodKey);
  const today = dateOnly(now);

  for (const reminder of reminders) {
    const date = parseDayKey(reminder.dateKey);
    if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) {
      return 'Дата напоминания вне выбранного периода.';
    }
    if (date.getTime() < today.getTime()) {
      return 'Дата задачи уже прошла, напоминание добавить нельзя.';
    }
    if (dayKey(date) === dayKey(today)) {
      const [hour, minute] = reminder.time.split(':').map(Number);
      const scheduled = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, 0);
      if (scheduled.getTime() <= now.getTime()) {
        return 'Нельзя выбрать уже прошедшее время.';
      }
    }
  }

  return null;
}

function createTemplateFromTask(task: PlanTask, now: Date): RecurringTaskTemplate {
  return {
    id: task.recurringId ?? uid(),
    scope: task.scope,
    title: task.title,
    description: task.description,
    remindersEnabled: task.remindersEnabled,
    reminders: normalizeTaskReminders(task.reminders),
    referencePeriodKey: task.periodKey,
    createdAt: iso(now),
    updatedAt: iso(now),
  };
}

export function addTaskToCurrent(
  snapshot: DailySnapshot,
  draft: TaskDraftInput,
  now: Date = nowForSnapshot(snapshot),
): { snapshot: DailySnapshot; error: string | null } {
  const cleanTitle = draft.title.trim();
  const cleanDescription = draft.description?.trim() || null;
  const reminders = normalizeTaskReminders(draft.reminders);
  const scope = snapshot.activeScope;
  const periodKey = selectedPeriodKey(snapshot);

  if (!cleanTitle) {
    return { snapshot, error: 'Название не может быть пустым.' };
  }
  const denied = addDeniedReason(snapshot, scope, periodKey, now);
  if (denied) {
    return { snapshot, error: denied };
  }
  if (draft.remindersEnabled && reminders.length === 0) {
    return { snapshot, error: 'Добавьте хотя бы одно напоминание или выключите тумблер.' };
  }
  const remindersError = draft.remindersEnabled ? validateReminders(scope, periodKey, reminders, now) : null;
  if (remindersError) {
    return { snapshot, error: remindersError };
  }

  const next = cloneSnapshot(snapshot);
  const task: PlanTask = {
    id: uid(),
    scope,
    periodKey,
    title: cleanTitle,
    description: cleanDescription,
    source: 'manual',
    isLocked: draft.isLocked,
    recurringId: null,
    isDone: false,
    doneAt: null,
    remindersEnabled: draft.remindersEnabled,
    reminders: draft.remindersEnabled ? reminders : [],
    createdAt: iso(now),
    updatedAt: iso(now),
  };

  if (task.isLocked) {
    const template = createTemplateFromTask(task, now);
    task.recurringId = template.id;
    next.recurring.push(template);
  }

  next.tasks.push(task);
  addHistory(next, 'task_add', `Добавлена задача: "${task.title}"`, now);
  return { snapshot: prepareSnapshot(next, now), error: null };
}

export function updateTask(
  snapshot: DailySnapshot,
  taskId: string,
  draft: TaskDraftInput,
  now: Date = nowForSnapshot(snapshot),
): { snapshot: DailySnapshot; error: string | null } {
  const cleanTitle = draft.title.trim();
  const cleanDescription = draft.description?.trim() || null;
  const reminders = normalizeTaskReminders(draft.reminders);
  const task = snapshot.tasks.find((item) => item.id === taskId);

  if (!task) {
    return { snapshot, error: 'Задача не найдена.' };
  }
  if (!cleanTitle) {
    return { snapshot, error: 'Название не может быть пустым.' };
  }
  const denied = editDeniedReason(snapshot, task.scope, task.periodKey, now);
  if (denied) {
    return { snapshot, error: denied };
  }
  if (draft.remindersEnabled && reminders.length === 0) {
    return { snapshot, error: 'Добавьте хотя бы одно напоминание или выключите тумблер.' };
  }
  const remindersError = draft.remindersEnabled ? validateReminders(task.scope, task.periodKey, reminders, now) : null;
  if (remindersError) {
    return { snapshot, error: remindersError };
  }

  const next = cloneSnapshot(snapshot);
  const index = next.tasks.findIndex((item) => item.id === taskId);
  if (index < 0) {
    return { snapshot, error: 'Задача не найдена.' };
  }

  let recurringId = next.tasks[index].recurringId;
  if (draft.isLocked && !recurringId) {
    recurringId = uid();
  }
  if (!draft.isLocked && recurringId) {
    next.recurring = next.recurring.filter((item) => item.id !== recurringId);
    recurringId = null;
  }

  const updatedTask: PlanTask = {
    ...next.tasks[index],
    title: cleanTitle,
    description: cleanDescription,
    isLocked: draft.isLocked,
    recurringId,
    remindersEnabled: draft.remindersEnabled,
    reminders: draft.remindersEnabled ? reminders : [],
    updatedAt: iso(now),
  };
  next.tasks[index] = updatedTask;

  if (updatedTask.isLocked && updatedTask.recurringId) {
    const template = {
      ...createTemplateFromTask(updatedTask, now),
      id: updatedTask.recurringId,
    };
    const existingIndex = next.recurring.findIndex((item) => item.id === updatedTask.recurringId);
    if (existingIndex >= 0) {
      next.recurring[existingIndex] = { ...next.recurring[existingIndex], ...template, updatedAt: iso(now) };
    } else {
      next.recurring.push(template);
    }
  }

  addHistory(next, 'task_edit', `Изменена задача: "${updatedTask.title}"`, now);
  return { snapshot: prepareSnapshot(next, now), error: null };
}

export function deleteTask(
  snapshot: DailySnapshot,
  taskId: string,
  now: Date = nowForSnapshot(snapshot),
): { snapshot: DailySnapshot; error: string | null } {
  const task = snapshot.tasks.find((item) => item.id === taskId);
  if (!task) {
    return { snapshot, error: 'Задача не найдена.' };
  }
  const denied = editDeniedReason(snapshot, task.scope, task.periodKey, now);
  if (denied) {
    return { snapshot, error: denied };
  }
  const next = cloneSnapshot(snapshot);
  next.tasks = next.tasks.filter((item) => item.id !== taskId);
  if (task.isLocked && task.recurringId) {
    next.recurring = next.recurring.filter((item) => item.id !== task.recurringId);
  }
  addHistory(next, 'task_delete', `Удалена задача: "${task.title}"`, now);
  return { snapshot: prepareSnapshot(next, now), error: null };
}

export function toggleTaskDone(
  snapshot: DailySnapshot,
  taskId: string,
  now: Date = nowForSnapshot(snapshot),
): { snapshot: DailySnapshot; error: string | null } {
  const task = snapshot.tasks.find((item) => item.id === taskId);
  if (!task) {
    return { snapshot, error: 'Задача не найдена.' };
  }
  if (snapshot.finalisedPeriods.includes(periodMarker(task.scope, task.periodKey))) {
    return { snapshot, error: 'Период уже закрыт. Правки недоступны.' };
  }
  if (!isCurrentPeriod(task.scope, task.periodKey, now)) {
    return { snapshot, error: 'Отметка доступна только в текущем периоде.' };
  }
  const next = cloneSnapshot(snapshot);
  next.tasks = next.tasks.map((item) =>
    item.id === taskId
      ? {
          ...item,
          isDone: !item.isDone,
          doneAt: !item.isDone ? iso(now) : null,
          updatedAt: iso(now),
        }
      : item,
  );
  const updated = next.tasks.find((item) => item.id === taskId)!;
  addHistory(
    next,
    'task_toggle',
    updated.isDone ? `Отмечено выполненным: "${updated.title}"` : `Снята отметка выполнения: "${updated.title}"`,
    now,
  );
  return { snapshot: prepareSnapshot(next, now), error: null };
}

export function toggleTaskLock(
  snapshot: DailySnapshot,
  taskId: string,
  now: Date = nowForSnapshot(snapshot),
): { snapshot: DailySnapshot; error: string | null } {
  const task = snapshot.tasks.find((item) => item.id === taskId);
  if (!task) {
    return { snapshot, error: 'Задача не найдена.' };
  }
  if (task.source === 'prayer' || task.source === 'prayerDefault') {
    return { snapshot, error: 'Молитвенный план уже цикличен.' };
  }
  const denied = editDeniedReason(snapshot, task.scope, task.periodKey, now);
  if (denied) {
    return { snapshot, error: denied };
  }

  const next = cloneSnapshot(snapshot);
  const index = next.tasks.findIndex((item) => item.id === taskId);
  if (index < 0) {
    return { snapshot, error: 'Задача не найдена.' };
  }

  const current = next.tasks[index];
  if (current.isLocked) {
    if (current.recurringId) {
      next.recurring = next.recurring.filter((item) => item.id !== current.recurringId);
    }
    next.tasks[index] = {
      ...current,
      isLocked: false,
      recurringId: null,
      updatedAt: iso(now),
    };
    addHistory(next, 'task_lock', `Откреплена задача: "${current.title}"`, now);
  } else {
    const recurringId = current.recurringId ?? uid();
    const updatedTask = {
      ...current,
      isLocked: true,
      recurringId,
      updatedAt: iso(now),
    };
    next.tasks[index] = updatedTask;
    const template = { ...createTemplateFromTask(updatedTask, now), id: recurringId };
    const recurringIndex = next.recurring.findIndex((item) => item.id === recurringId);
    if (recurringIndex >= 0) {
      next.recurring[recurringIndex] = template;
    } else {
      next.recurring.push(template);
    }
    addHistory(next, 'task_lock', `Закреплена задача: "${current.title}"`, now);
  }

  return { snapshot: prepareSnapshot(next, now), error: null };
}

export function updatePrayerEntry(
  snapshot: DailySnapshot,
  input: PrayerDraftInput,
  now: Date = nowForSnapshot(snapshot),
): DailySnapshot {
  const next = cloneSnapshot(snapshot);
  next.prayer = next.prayer.map((entry) =>
    entry.weekday === input.weekday
      ? {
          ...entry,
          title: input.title?.trim() || null,
          description: input.description?.trim() || null,
          updatedAt: iso(now),
        }
      : entry,
  );

  next.tasks = next.tasks.map((task) => {
    if (task.scope !== 'day' || (task.source !== 'prayer' && task.source !== 'prayerDefault')) {
      return task;
    }
    const weekday = (parseDayKey(task.periodKey).getDay() + 6) % 7;
    if (weekday !== input.weekday || isPeriodOver(task.scope, task.periodKey, now)) {
      return task;
    }
    return {
      ...task,
      title: input.title?.trim() || 'Помолиться',
      description: input.title?.trim() ? input.description?.trim() || null : null,
      source: input.title?.trim() ? 'prayer' : 'prayerDefault',
      updatedAt: iso(now),
    };
  });

  addHistory(next, 'prayer_update', `Обновлен молитвенный план на ${weekdayTitle(input.weekday)}`, now);
  return prepareSnapshot(next, now);
}

export function updateSettings(
  snapshot: DailySnapshot,
  patch: Partial<DailySnapshot['settings']>,
  message: string,
  now: Date = nowForSnapshot(snapshot),
): DailySnapshot {
  const next = cloneSnapshot(snapshot);
  next.settings = { ...next.settings, ...patch };
  addHistory(next, 'settings_update', message, nowForSnapshot({ ...next, settings: next.settings }, now));
  return prepareSnapshot(next, nowForSnapshot(next, now));
}

export function importSnapshot(raw: unknown): DailySnapshot {
  return upgradeSnapshot(raw);
}

export function scopeLabel(scope: PlanScope): string {
  switch (scope) {
    case 'day':
      return 'дня';
    case 'week':
      return 'недели';
    case 'month':
      return 'месяца';
    case 'year':
      return 'года';
  }
}

export function weekdayTitle(weekday: number): string {
  return ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'][
    Math.min(Math.max(weekday, 0), 6)
  ];
}

export function periodTitle(snapshot: DailySnapshot): string {
  return formatPeriodTitle(snapshot.activeScope, selectedPeriodKey(snapshot));
}
