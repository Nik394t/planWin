import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bell, Check, ChevronLeft, ChevronRight, Clock3, Lock, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { formatPeriodTitle, reminderLabel, scopeOrder } from '../domain/date';
import { activeProgress, addDeniedReason, currentTasks, editPolicyFor, nowForSnapshot, selectedPeriodKey } from '../domain/planner';
import type { DailySnapshot, PlanScope, PlanTask, TaskDraftInput } from '../domain/types';
import { TaskEditorModal } from '../components/TaskEditorModal';
import { useDailyStore } from '../store/dailyStore';

interface PlansScreenProps {
  snapshot: DailySnapshot;
  onMessage: (message: string) => void;
}

export function PlansScreen({ snapshot, onMessage }: PlansScreenProps) {
  const setScope = useDailyStore((state) => state.setScope);
  const shiftPeriod = useDailyStore((state) => state.shiftPeriod);
  const jumpToCurrent = useDailyStore((state) => state.jumpToCurrent);
  const addTask = useDailyStore((state) => state.addTask);
  const updateTask = useDailyStore((state) => state.updateTask);
  const deleteTask = useDailyStore((state) => state.deleteTask);
  const toggleTaskDone = useDailyStore((state) => state.toggleTaskDone);
  const toggleTaskLock = useDailyStore((state) => state.toggleTaskLock);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlanTask | null>(null);

  const tasks = useMemo(() => currentTasks(snapshot), [snapshot]);
  const progress = useMemo(() => activeProgress(snapshot), [snapshot]);
  const periodKey = selectedPeriodKey(snapshot);
  const now = nowForSnapshot(snapshot);

  const openCreate = () => {
    const denied = addDeniedReason(snapshot, snapshot.activeScope, periodKey, now);
    if (denied) {
      onMessage(denied);
      return;
    }
    setEditingTask(null);
    setEditorOpen(true);
  };

  const submit = async (draft: TaskDraftInput) => {
    const error = editingTask ? await updateTask(editingTask.id, draft) : await addTask(draft);
    if (!error) {
      onMessage(editingTask ? 'Задача обновлена.' : 'Задача добавлена.');
    }
    return error;
  };

  const ensurePolicy = (task: PlanTask): boolean => {
    const policy = editPolicyFor(snapshot, task.scope, task.periodKey, now);
    if (policy === 'confirm') {
      return window.confirm('Подтверди корректировку годового плана в январе.');
    }
    return true;
  };

  return (
    <>
      <section className="hero-card">
        <div>
          <p className="eyebrow">Планы</p>
          <h1>Собирай фокус без перегруза</h1>
          <p className="hero-copy">
            Один экран на один период. Прогресс показывается только там, где он реально нужен, без лишнего шума.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          <Plus size={16} /> Добавить задачу
        </button>
      </section>

      <section className="glass-card scope-switcher">
        <div className="scope-tabs">
          {scopeOrder.map((scope) => (
            <button
              key={scope}
              className={clsx('scope-tab', snapshot.activeScope === scope && 'scope-tab-active')}
              type="button"
              onClick={() => void setScope(scope)}
            >
              {scopeTitle(scope)}
            </button>
          ))}
        </div>
        <div className="period-bar">
          <button className="icon-button" type="button" onClick={() => void shiftPeriod(-1)}>
            <ChevronLeft size={18} />
          </button>
          <div>
            <p className="muted-label">Текущий период</p>
            <h2>{formatPeriodTitle(snapshot.activeScope, periodKey)}</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => void shiftPeriod(1)}>
            <ChevronRight size={18} />
          </button>
          <button className="secondary-button" type="button" onClick={() => void jumpToCurrent()}>
            <RotateCcw size={14} /> Сегодня
          </button>
        </div>
      </section>

      <section className="glass-card progress-card">
        <div>
          <p className="muted-label">Прогресс {scopeTitle(snapshot.activeScope).toLowerCase()}</p>
          <h2>{progress.done} / {progress.total}</h2>
          <p className="hero-copy">Завершено {progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}% задач в активном периоде.</p>
        </div>
        <div className="progress-ring" style={{ ['--progress' as string]: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%` }}>
          <span>{progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%</span>
        </div>
      </section>

      <section className="task-list">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <article key={task.id} className={clsx('task-card', task.isDone && 'task-card-done')}>
              <div className="task-main">
                <div className="task-row">
                  <button className={clsx('task-check', task.isDone && 'task-check-done')} type="button" onClick={async () => {
                    const error = await toggleTaskDone(task.id);
                    onMessage(error ?? (task.isDone ? 'Отметка снята.' : 'Задача выполнена.'));
                  }}>
                    <Check size={16} />
                  </button>
                  <div>
                    <h3>{task.title}</h3>
                    {task.description ? <p>{task.description}</p> : <p className="muted-copy">Без описания.</p>}
                  </div>
                </div>

                <div className="chip-row">
                  <span className="tag">{scopeTitle(task.scope)}</span>
                  {task.isLocked ? <span className="tag"><Lock size={12} /> Закреплена</span> : null}
                  {task.remindersEnabled && task.reminders.length > 0 ? (
                    <span className="tag"><Bell size={12} /> {task.reminders.map((item) => reminderLabel(task.scope, item)).join(', ')}</span>
                  ) : null}
                  {task.isDone && task.doneAt ? <span className="tag success-tag"><Clock3 size={12} /> Выполнено</span> : null}
                </div>
              </div>

              <div className="task-actions">
                <button className="icon-button" type="button" onClick={() => {
                  if (!ensurePolicy(task)) return;
                  setEditingTask(task);
                  setEditorOpen(true);
                }}>
                  <Pencil size={16} />
                </button>
                <button className="icon-button" type="button" onClick={async () => {
                  if (!ensurePolicy(task)) return;
                  const error = await toggleTaskLock(task.id);
                  onMessage(error ?? (task.isLocked ? 'Задача откреплена.' : 'Задача закреплена.'));
                }}>
                  <Lock size={16} />
                </button>
                <button className="icon-button danger-icon" type="button" onClick={async () => {
                  if (!ensurePolicy(task)) return;
                  const confirmed = window.confirm(`Удалить задачу \"${task.title}\"?`);
                  if (!confirmed) return;
                  const error = await deleteTask(task.id);
                  onMessage(error ?? 'Задача удалена.');
                }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-card">
            <p className="eyebrow">Пусто</p>
            <h3>В этом периоде пока нет задач</h3>
            <p>Создай первую задачу, чтобы веб-версия Daily сразу выглядела и вела себя как настоящее приложение.</p>
            <button className="primary-button" type="button" onClick={openCreate}>
              <Plus size={16} /> Добавить задачу
            </button>
          </div>
        )}
      </section>

      <TaskEditorModal
        open={editorOpen}
        scope={snapshot.activeScope}
        periodKey={periodKey}
        initialTask={editingTask}
        onClose={() => setEditorOpen(false)}
        onSubmit={submit}
      />
    </>
  );
}

function scopeTitle(scope: PlanScope): string {
  return {
    day: 'День',
    week: 'Неделя',
    month: 'Месяц',
    year: 'Год',
  }[scope];
}
