import { describe, expect, it } from 'vitest';

import { dayKey } from '../domain/date';
import {
  addTaskToCurrent,
  createInitialSnapshot,
  refreshForNow,
  tasksFor,
  toggleTaskDone,
} from '../domain/planner';

function fixedDate(year: number, month: number, day: number, hour = 9, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe('planner domain', () => {
  it('adds a task to the active day period', () => {
    const now = fixedDate(2026, 3, 10, 9, 0);
    const snapshot = createInitialSnapshot(now);
    const result = addTaskToCurrent(
      snapshot,
      {
        title: 'Выпить воды',
        description: 'Стакан после пробуждения',
        isLocked: false,
        remindersEnabled: false,
        reminders: [],
      },
      now,
    );

    expect(result.error).toBeNull();
    expect(tasksFor(result.snapshot, 'day', result.snapshot.selectedPeriods.day).some((task) => task.title === 'Выпить воды')).toBe(true);
  });

  it('recreates a locked daily task on the next day with remapped reminder date', () => {
    const now = fixedDate(2026, 3, 10, 9, 0);
    const snapshot = createInitialSnapshot(now);
    const todayKey = snapshot.selectedPeriods.day;

    const created = addTaskToCurrent(
      snapshot,
      {
        title: 'Позвонить маме',
        description: null,
        isLocked: true,
        remindersEnabled: true,
        reminders: [{ id: 'r1', dateKey: todayKey, time: '10:30' }],
      },
      now,
    );

    const tomorrow = fixedDate(2026, 3, 11, 9, 0);
    const rolled = refreshForNow(created.snapshot, tomorrow);
    const tomorrowKey = dayKey(tomorrow);
    const recurringTask = tasksFor(rolled, 'day', tomorrowKey).find((task) => task.title === 'Позвонить маме');

    expect(recurringTask).toBeTruthy();
    expect(recurringTask?.remindersEnabled).toBe(true);
    expect(recurringTask?.reminders[0]?.dateKey).toBe(tomorrowKey);
    expect(recurringTask?.reminders[0]?.time).toBe('10:30');
  });

  it('finalizes the previous day and writes a period summary to history after rollover', () => {
    const now = fixedDate(2026, 3, 10, 9, 0);
    const snapshot = createInitialSnapshot(now);
    const created = addTaskToCurrent(
      snapshot,
      {
        title: 'Подготовить заметки',
        description: null,
        isLocked: false,
        remindersEnabled: false,
        reminders: [],
      },
      now,
    );
    const task = tasksFor(created.snapshot, 'day', created.snapshot.selectedPeriods.day).find((item) => item.title === 'Подготовить заметки');
    const toggled = toggleTaskDone(created.snapshot, task!.id, now);

    const tomorrow = fixedDate(2026, 3, 11, 9, 0);
    const rolled = refreshForNow(toggled.snapshot, tomorrow);

    expect(rolled.finalisedPeriods).toContain(`day|${dayKey(now)}`);
    expect(rolled.history.some((entry) => entry.action === 'period_summary' && entry.message.includes(dayKey(now)))).toBe(true);
  });
});
