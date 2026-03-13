import { describe, expect, it } from 'vitest';

import { buildExchangeEnvelope, importPortableSnapshot } from '../domain/exchange';
import { createInitialSnapshot } from '../domain/planner';

describe('portable exchange format', () => {
  it('imports a legacy mobile snapshot into the web schema', () => {
    const imported = importPortableSnapshot({
      version: 1,
      activeScope: 'day',
      selectedPeriods: {
        day: '2026-03-13',
        week: '2026-W11',
        month: '2026-03',
        year: '2026',
      },
      tasks: [
        {
          id: 7,
          scope: 'day',
          periodKey: '2026-03-13',
          title: 'Позвонить семье',
          description: 'После обеда',
          source: 'manual',
          isLocked: false,
          recurringId: null,
          isDone: false,
          remindersEnabled: true,
          reminders: [{ dateKey: '2026-03-13', time: '14:30' }],
          createdAt: '2026-03-13T09:00:00.000Z',
          updatedAt: '2026-03-13T09:05:00.000Z',
        },
      ],
      recurring: [],
      prayer: [],
      history: [],
      initializedPeriods: ['day|2026-03-13'],
      finalizedPeriods: [],
      notificationsEnabled: true,
      morningNotificationTime: '06:10',
      eveningNotificationTime: '18:20',
      timezoneId: 'Europe/Moscow',
      lastObservedDayKey: '2026-03-13',
    });

    const importedTask = imported.tasks.find((task) => task.title === 'Позвонить семье');
    expect(importedTask).toBeTruthy();
    expect(importedTask?.id).toBe('7');
    expect(importedTask?.reminders[0]?.time).toBe('14:30');
    expect(imported.settings.notificationsEnabled).toBe(true);
    expect(imported.settings.timezoneId).toBe('Europe/Moscow');
    expect(imported.initializedPeriods).toContain('day|2026-03-13');
  });

  it('imports a daily-exchange envelope transparently', () => {
    const base = createInitialSnapshot(new Date('2026-03-13T09:00:00.000Z'));
    const envelope = buildExchangeEnvelope({
      ...base,
      settings: {
        ...base.settings,
        timezoneId: 'Europe/Moscow',
      },
    });

    const imported = importPortableSnapshot(envelope);
    expect(imported.selectedPeriods.day).toBe(base.selectedPeriods.day);
    expect(imported.settings.timezoneId).toBe('Europe/Moscow');
  });
});
