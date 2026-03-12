import type { EditPolicy, PlanScope, TaskReminder, TimezoneOption } from './types';

export const schemaVersion = 1;

export const scopeOrder: PlanScope[] = ['day', 'week', 'month', 'year'];

export const timezoneOptions: TimezoneOption[] = [
  { id: 'UTC', label: 'UTC' },
  { id: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { id: 'Europe/Minsk', label: 'Минск (UTC+3)' },
  { id: 'Europe/Kyiv', label: 'Киев (UTC+2/+3)' },
  { id: 'Europe/Berlin', label: 'Берлин (UTC+1/+2)' },
  { id: 'Europe/London', label: 'Лондон (UTC+0/+1)' },
  { id: 'Asia/Tbilisi', label: 'Тбилиси (UTC+4)' },
  { id: 'Asia/Yerevan', label: 'Ереван (UTC+4)' },
  { id: 'Asia/Baku', label: 'Баку (UTC+4)' },
  { id: 'Asia/Almaty', label: 'Алматы (UTC+5)' },
  { id: 'Asia/Bishkek', label: 'Бишкек (UTC+6)' },
  { id: 'Asia/Tashkent', label: 'Ташкент (UTC+5)' },
  { id: 'Asia/Dubai', label: 'Дубай (UTC+4)' },
  { id: 'Asia/Bangkok', label: 'Бангкок (UTC+7)' },
  { id: 'Asia/Tokyo', label: 'Токио (UTC+9)' },
  { id: 'America/New_York', label: 'Нью-Йорк (UTC-5/-4)' },
  { id: 'America/Chicago', label: 'Чикаго (UTC-6/-5)' },
  { id: 'America/Denver', label: 'Денвер (UTC-7/-6)' },
  { id: 'America/Los_Angeles', label: 'Лос-Анджелес (UTC-8/-7)' },
];

export function timezoneLabelFor(timezoneId: string): string {
  return timezoneOptions.find((item) => item.id === timezoneId)?.label ?? timezoneId;
}

export function dateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function nowInTimezone(timezoneId: string, now: Date = new Date()): Date {
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

export function dayKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

export function yearKey(date: Date): string {
  return String(date.getFullYear());
}

function startOfIsoWeek(date: Date): Date {
  const current = dateOnly(date);
  const weekday = current.getDay() === 0 ? 7 : current.getDay();
  return new Date(current.getFullYear(), current.getMonth(), current.getDate() - weekday + 1);
}

export function weekKey(date: Date): string {
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

export function parseDayKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function parseMonthKey(value: string): Date {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function parseYearKey(value: string): Date {
  return new Date(Number(value), 0, 1);
}

export function parseWeekKey(value: string): Date {
  const [yearRaw, weekRaw] = value.split('-W');
  const year = Number(yearRaw);
  const week = Number(weekRaw);
  const weekOneMonday = startOfIsoWeek(new Date(year, 0, 4));
  return new Date(weekOneMonday.getFullYear(), weekOneMonday.getMonth(), weekOneMonday.getDate() + (week - 1) * 7);
}

export function periodStartDate(scope: PlanScope, periodKey: string): Date {
  switch (scope) {
    case 'day':
      return parseDayKey(periodKey);
    case 'week':
      return parseWeekKey(periodKey);
    case 'month':
      return parseMonthKey(periodKey);
    case 'year':
      return parseYearKey(periodKey);
  }
}

export function periodEndDate(scope: PlanScope, periodKey: string): Date {
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
  }
}

export function addPeriod(scope: PlanScope, periodKey: string, delta: number): string {
  switch (scope) {
    case 'day':
      return dayKey(new Date(parseDayKey(periodKey).getTime() + delta * 86400000));
    case 'week':
      return weekKey(new Date(parseWeekKey(periodKey).getTime() + delta * 7 * 86400000));
    case 'month': {
      const start = parseMonthKey(periodKey);
      return monthKey(new Date(start.getFullYear(), start.getMonth() + delta, 1));
    }
    case 'year':
      return String(Number(periodKey) + delta);
  }
}

export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function normalizeTime(value: string): string | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function normalizeTaskReminders(reminders: TaskReminder[]): TaskReminder[] {
  const map = new Map<string, TaskReminder>();
  reminders.forEach((item) => {
    const normalizedTime = normalizeTime(item.time);
    if (!normalizedTime || !isDayKey(item.dateKey)) {
      return;
    }
    const normalized = {
      ...item,
      dateKey: item.dateKey.trim(),
      time: normalizedTime,
    } satisfies TaskReminder;
    map.set(`${normalized.dateKey}|${normalized.time}`, normalized);
  });
  return [...map.values()].sort((a, b) => `${a.dateKey}|${a.time}`.localeCompare(`${b.dateKey}|${b.time}`));
}

export function isCurrentPeriod(scope: PlanScope, periodKey: string, today: Date): boolean {
  switch (scope) {
    case 'day':
      return dayKey(today) === periodKey;
    case 'week':
      return weekKey(today) === periodKey;
    case 'month':
      return monthKey(today) === periodKey;
    case 'year':
      return yearKey(today) === periodKey;
  }
}

export function isPeriodOver(scope: PlanScope, periodKey: string, today: Date): boolean {
  return dateOnly(today).getTime() > dateOnly(periodEndDate(scope, periodKey)).getTime();
}

export function getEditPolicy(scope: PlanScope, periodKey: string, today: Date): EditPolicy {
  if (!isCurrentPeriod(scope, periodKey, today)) {
    return 'deny';
  }
  if (scope === 'day') {
    return 'allow';
  }
  if (scope === 'week') {
    return (today.getDay() || 7) === 1 ? 'allow' : 'deny';
  }
  if (scope === 'month') {
    return today.getDate() === 1 || today.getDate() === 2 ? 'allow' : 'deny';
  }
  if (today.getMonth() !== 0) {
    return 'deny';
  }
  return today.getDate() === 1 || today.getDate() === 2 ? 'allow' : 'confirm';
}

export function editDeniedMessage(scope: PlanScope): string {
  switch (scope) {
    case 'day':
      return 'Редактировать дневной план можно только сегодня.';
    case 'week':
      return 'Редактировать недельный план можно только в понедельник текущей недели.';
    case 'month':
      return 'Редактировать месячный план можно только 1-2 числа текущего месяца.';
    case 'year':
      return 'Редактировать годовой план можно только в январе.';
  }
}

export function monthName(month: number): string {
  return [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ][Math.min(Math.max(month - 1, 0), 11)];
}

export function weekdayLabel(weekday: number): string {
  return ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'][
    Math.min(Math.max(weekday, 0), 6)
  ];
}

export function weekdayShort(weekday: number): string {
  return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][Math.min(Math.max(weekday, 0), 6)];
}

export function shortDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatPeriodTitle(scope: PlanScope, periodKey: string): string {
  switch (scope) {
    case 'day': {
      const date = parseDayKey(periodKey);
      const weekday = (date.getDay() + 6) % 7;
      return `${dayKey(date)} • ${weekdayLabel(weekday)}`;
    }
    case 'week': {
      const start = parseWeekKey(periodKey);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return `${periodKey} • ${shortDate(start)} - ${shortDate(end)}`;
    }
    case 'month': {
      const date = parseMonthKey(periodKey);
      return `${monthName(date.getMonth() + 1)} ${date.getFullYear()}`;
    }
    case 'year':
      return periodKey;
  }
}

export function formatDateTime(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function reminderLabel(scope: PlanScope, reminder: TaskReminder): string {
  return scope === 'day' ? reminder.time : `${reminder.dateKey} ${reminder.time}`;
}

export function compareDatesByKey(a: string, b: string): number {
  return b.localeCompare(a);
}
