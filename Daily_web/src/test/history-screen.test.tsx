import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HistoryScreen } from '../screens/HistoryScreen';
import type { DailySnapshot } from '../domain/types';
import { createInitialSnapshot } from '../domain/planner';

function buildSnapshot(): DailySnapshot {
  const snapshot = createInitialSnapshot(new Date(2026, 2, 10, 10, 0, 0, 0));
  return {
    ...snapshot,
    history: [
      {
        id: '2',
        action: 'task_edit',
        message: 'Изменена задача: "Вечерняя прогулка"',
        timestamp: '2026-03-11T18:00:00.000Z',
        dayKey: '2026-03-11',
      },
      {
        id: '1',
        action: 'task_add',
        message: 'Добавлена задача: "Утренний план"',
        timestamp: '2026-03-10T08:00:00.000Z',
        dayKey: '2026-03-10',
      },
    ],
  };
}

describe('HistoryScreen', () => {
  it('shows entries for the selected day only', () => {
    render(<HistoryScreen snapshot={buildSnapshot()} />);

    expect(screen.getByText('Изменена задача: "Вечерняя прогулка"')).toBeInTheDocument();
    expect(screen.queryByText('Добавлена задача: "Утренний план"')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /2026-03-10/ }));

    expect(screen.getByText('Добавлена задача: "Утренний план"')).toBeInTheDocument();
    expect(screen.queryByText('Изменена задача: "Вечерняя прогулка"')).not.toBeInTheDocument();
  });
});
