import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskEditorModal } from '../components/TaskEditorModal';
import type { PlanTask } from '../domain/types';

const noop = () => {};

function baseTask(title: string): PlanTask {
  return {
    id: crypto.randomUUID(),
    scope: 'day',
    periodKey: '2026-03-10',
    title,
    description: null,
    source: 'manual',
    isLocked: false,
    recurringId: null,
    isDone: false,
    doneAt: null,
    remindersEnabled: false,
    reminders: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('TaskEditorModal', () => {
  it('blocks double submit while save is in flight', async () => {
    const user = userEvent.setup();
    let resolveSubmit: ((value: string | null) => void) | null = null;
    const onSubmit = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <TaskEditorModal
        open
        scope="day"
        periodKey="2026-03-10"
        onClose={noop}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText('Например, утренний обзор дня'), 'Прочитать главу');

    const button = screen.getByRole('button', { name: 'Сохранить' });
    await Promise.all([user.click(button), user.click(button)]);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveSubmit?.(null);
    });
  });

  it('resets local form state between edit and create openings', () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    const { rerender } = render(
      <TaskEditorModal
        open
        scope="day"
        periodKey="2026-03-10"
        initialTask={baseTask('Первая задача')}
        onClose={noop}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByDisplayValue('Первая задача')).toBeInTheDocument();

    rerender(
      <TaskEditorModal
        open={false}
        scope="day"
        periodKey="2026-03-10"
        initialTask={baseTask('Первая задача')}
        onClose={noop}
        onSubmit={onSubmit}
      />,
    );

    rerender(
      <TaskEditorModal
        open
        scope="day"
        periodKey="2026-03-10"
        initialTask={null}
        onClose={noop}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByPlaceholderText('Например, утренний обзор дня')).toHaveValue('');
  });
});
