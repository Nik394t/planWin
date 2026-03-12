import { useEffect, useMemo, useRef, useState } from 'react';
import { BellPlus, CalendarDays, Clock3, Lock, Plus, Trash2 } from 'lucide-react';

import { dayKey, normalizeTime, periodEndDate, periodStartDate, reminderLabel } from '../domain/date';
import type { PlanScope, PlanTask, TaskDraftInput, TaskReminder } from '../domain/types';
import { Modal } from './Modal';

interface TaskEditorModalProps {
  open: boolean;
  scope: PlanScope;
  periodKey: string;
  initialTask?: PlanTask | null;
  onClose: () => void;
  onSubmit: (draft: TaskDraftInput) => Promise<string | null>;
}

function defaultReminderDate(scope: PlanScope, periodKey: string): string {
  return scope === 'day' ? periodKey : dayKey(periodStartDate(scope, periodKey));
}

export function TaskEditorModal({ open, scope, periodKey, initialTask, onClose, onSubmit }: TaskEditorModalProps) {
  const [title, setTitle] = useState(initialTask?.title ?? '');
  const [description, setDescription] = useState(initialTask?.description ?? '');
  const [isLocked, setIsLocked] = useState(initialTask?.isLocked ?? false);
  const [remindersEnabled, setRemindersEnabled] = useState(initialTask?.remindersEnabled ?? false);
  const [reminders, setReminders] = useState<TaskReminder[]>(initialTask?.reminders ?? []);
  const [draftDate, setDraftDate] = useState(defaultReminderDate(scope, periodKey));
  const [draftTime, setDraftTime] = useState(initialTask?.reminders[0]?.time ?? '09:00');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(true);
  const saveLockRef = useRef(false);

  const periodStart = useMemo(() => periodStartDate(scope, periodKey), [scope, periodKey]);
  const periodFinish = useMemo(() => periodEndDate(scope, periodKey), [scope, periodKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(initialTask?.title ?? '');
    setDescription(initialTask?.description ?? '');
    setIsLocked(initialTask?.isLocked ?? false);
    setRemindersEnabled(initialTask?.remindersEnabled ?? false);
    setReminders(initialTask?.reminders ?? []);
    setDraftDate(defaultReminderDate(scope, periodKey));
    setDraftTime(initialTask?.reminders[0]?.time ?? '09:00');
    setError(null);
    setIsSaving(false);
    saveLockRef.current = false;
  }, [initialTask, open, periodKey, scope]);

  const save = async () => {
    if (isSaving || saveLockRef.current) {
      return;
    }
    saveLockRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const result = await onSubmit({
        title,
        description,
        isLocked,
        remindersEnabled,
        reminders,
      });
      if (!mountedRef.current) {
        return;
      }
      if (result) {
        setError(result);
        return;
      }
      onClose();
    } finally {
      saveLockRef.current = false;
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  const addReminder = () => {
    const normalizedTime = normalizeTime(draftTime);
    const now = new Date();
    if (!normalizedTime) {
      setError('Укажи корректное время.');
      return;
    }
    const targetDate = scope === 'day' ? periodKey : draftDate;
    const selectedDate = new Date(`${targetDate}T${normalizedTime}:00`);
    if (scope !== 'day') {
      if (targetDate < dayKey(periodStart) || targetDate > dayKey(periodFinish)) {
        setError('Дата напоминания должна быть внутри выбранного периода.');
        return;
      }
    }
    if (selectedDate.getTime() <= now.getTime()) {
      setError('Нельзя выбрать уже прошедшее время.');
      return;
    }
    if (reminders.some((item) => item.dateKey === targetDate && item.time === normalizedTime)) {
      setError('Такое напоминание уже есть.');
      return;
    }
    setReminders((current) =>
      [...current, { id: crypto.randomUUID(), dateKey: targetDate, time: normalizedTime }].sort((a, b) =>
        `${a.dateKey}|${a.time}`.localeCompare(`${b.dateKey}|${b.time}`),
      ),
    );
    setError(null);
  };

  const titleText = initialTask ? 'Редактировать задачу' : 'Новая задача';

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      title={titleText}
      footer={
        <>
          <button className="secondary-button" type="button" disabled={isSaving} onClick={onClose}>
            Отмена
          </button>
          <button className="primary-button" type="button" disabled={isSaving} onClick={save}>
            {isSaving ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </>
      }
    >
      <div className="editor-grid">
        <label className="field">
          <span>Название</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, утренний обзор дня" />
        </label>

        <label className="field">
          <span>Описание</span>
          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Короткое пояснение или детали"
          />
        </label>

        <div className="switch-row">
          <div>
            <span className="switch-title">Закрепить задачу</span>
            <p>Задача будет переноситься в следующий соответствующий период.</p>
          </div>
          <button className={`switch ${isLocked ? 'switch-on' : ''}`} type="button" onClick={() => setIsLocked((value) => !value)}>
            <Lock size={14} />
          </button>
        </div>

        <div className="switch-row">
          <div>
            <span className="switch-title">Напоминания</span>
            <p>По умолчанию выключены. Можно добавить несколько напоминаний.</p>
          </div>
          <button
            className={`switch ${remindersEnabled ? 'switch-on' : ''}`}
            type="button"
            onClick={() => setRemindersEnabled((value) => !value)}
          >
            <BellPlus size={14} />
          </button>
        </div>

        {remindersEnabled ? (
          <section className="reminders-editor">
            <div className="reminder-compose">
              {scope !== 'day' ? (
                <label className="field compact-field">
                  <span>Дата</span>
                  <div className="inline-input">
                    <CalendarDays size={16} />
                    <input
                      type="date"
                      min={dayKey(periodStart)}
                      max={dayKey(periodFinish)}
                      value={draftDate}
                      onChange={(event) => setDraftDate(event.target.value)}
                    />
                  </div>
                </label>
              ) : null}
              <label className="field compact-field">
                <span>Время</span>
                <div className="inline-input">
                  <Clock3 size={16} />
                  <input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} />
                </div>
              </label>
              <button className="secondary-button add-reminder" type="button" onClick={addReminder}>
                <Plus size={16} /> Добавить
              </button>
            </div>

            <div className="chip-row">
              {reminders.length > 0 ? (
                reminders.map((reminder) => (
                  <span key={reminder.id} className="tag reminder-tag">
                    {reminderLabel(scope, reminder)}
                    <button
                      type="button"
                      aria-label="Удалить напоминание"
                      onClick={() => setReminders((current) => current.filter((item) => item.id !== reminder.id))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))
              ) : (
                <p className="muted-copy">Напоминаний пока нет.</p>
              )}
            </div>
          </section>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </Modal>
  );
}
