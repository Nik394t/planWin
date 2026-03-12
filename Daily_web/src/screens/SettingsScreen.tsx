import { useRef, useState } from 'react';
import { Bell, Download, Info, ShieldCheck, Upload } from 'lucide-react';

import { timezoneLabelFor, timezoneOptions } from '../domain/date';
import type { DailySnapshot } from '../domain/types';
import { Modal } from '../components/Modal';
import {
  requestNotificationPermission,
  sendRemoteTestNotification,
  sendTestNotification,
  unsubscribeFromPushBackend,
} from '../services/notifications';
import { useDailyStore } from '../store/dailyStore';

interface SettingsScreenProps {
  snapshot: DailySnapshot;
  notificationPermission: NotificationPermission;
  onPermissionChange: (value: NotificationPermission) => void;
  onMessage: (message: string) => void;
}

export function SettingsScreen({ snapshot, notificationPermission, onPermissionChange, onMessage }: SettingsScreenProps) {
  const updateSettings = useDailyStore((state) => state.updateSettings);
  const replaceSnapshot = useDailyStore((state) => state.replaceSnapshot);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `daily-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onMessage('Резервная копия выгружена.');
  };

  const importData = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      await replaceSnapshot(parsed as DailySnapshot);
      onMessage('Данные импортированы.');
    } catch {
      onMessage('Файл не удалось импортировать.');
    }
  };

  return (
    <>
      <section className="hero-card compact-hero">
        <div>
          <p className="eyebrow">Настройки</p>
          <h1>Контроль, а не шум</h1>
          <p className="hero-copy">Здесь управляются timezone, разрешения, утренние и вечерние уведомления, а также резервные копии данных.</p>
        </div>
      </section>

      <section className="settings-grid">
        <article className="glass-card settings-card">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Уведомления</p>
              <h3>Общие параметры Daily</h3>
            </div>
            <Bell size={18} />
          </div>

          <div className="settings-stack">
            <div className="settings-row">
              <div>
                <span>Разрешение браузера</span>
                <p>{notificationPermission === 'granted' ? 'Разрешение выдано.' : notificationPermission === 'denied' ? 'Разрешение отклонено.' : 'Разрешение еще не запрашивалось.'}</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={async () => {
                  const permission = await requestNotificationPermission();
                  onPermissionChange(permission);
                  if (permission === 'granted') {
                    await updateSettings({ notificationsEnabled: true }, 'Включены уведомления веб-версии');
                    onMessage('Разрешение на уведомления получено.');
                  } else {
                    await unsubscribeFromPushBackend();
                    onMessage('Браузер не выдал разрешение на уведомления.');
                  }
                }}
              >
                Запросить
              </button>
            </div>

            <div className="settings-row">
              <div>
                <span>Уведомления Daily</span>
                <p>Общий переключатель для утренних, вечерних и task reminders.</p>
              </div>
              <button
                className={`switch ${snapshot.settings.notificationsEnabled ? 'switch-on' : ''}`}
                type="button"
                onClick={async () => {
                  const nextValue = !snapshot.settings.notificationsEnabled;
                  await updateSettings(
                    { notificationsEnabled: nextValue },
                    nextValue ? 'Уведомления включены' : 'Уведомления выключены',
                  );
                  if (!nextValue) {
                    await unsubscribeFromPushBackend();
                  }
                }}
              >
                <ShieldCheck size={14} />
              </button>
            </div>

            <div className="settings-row inputs-row">
              <label className="field compact-field">
                <span>Утро</span>
                <input
                  type="time"
                  value={snapshot.settings.morningTime}
                  onChange={(event) => void updateSettings({ morningTime: event.target.value }, `Изменено утреннее уведомление: ${event.target.value}`)}
                />
              </label>
              <button
                className={`switch ${snapshot.settings.morningEnabled ? 'switch-on' : ''}`}
                type="button"
                onClick={() => void updateSettings({ morningEnabled: !snapshot.settings.morningEnabled }, snapshot.settings.morningEnabled ? 'Утреннее уведомление отключено' : 'Утреннее уведомление включено')}
              >
                <Bell size={14} />
              </button>
            </div>

            <div className="settings-row inputs-row">
              <label className="field compact-field">
                <span>Вечер</span>
                <input
                  type="time"
                  value={snapshot.settings.eveningTime}
                  onChange={(event) => void updateSettings({ eveningTime: event.target.value }, `Изменено вечернее уведомление: ${event.target.value}`)}
                />
              </label>
              <button
                className={`switch ${snapshot.settings.eveningEnabled ? 'switch-on' : ''}`}
                type="button"
                onClick={() => void updateSettings({ eveningEnabled: !snapshot.settings.eveningEnabled }, snapshot.settings.eveningEnabled ? 'Вечернее уведомление отключено' : 'Вечернее уведомление включено')}
              >
                <Bell size={14} />
              </button>
            </div>

            <label className="field">
              <span>Часовой пояс</span>
              <select
                value={snapshot.settings.timezoneId}
                onChange={(event) => void updateSettings({ timezoneId: event.target.value }, `Изменен часовой пояс: ${event.target.value}`)}
              >
                {timezoneOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="settings-row">
              <div>
                <span>Текущее значение</span>
                <p>{timezoneLabelFor(snapshot.settings.timezoneId)}</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={async () => {
                  const remoteSent = await sendRemoteTestNotification();
                  if (remoteSent) {
                    onMessage('Тестовое push-уведомление отправлено через сервер.');
                    return;
                  }
                  const localSent = await sendTestNotification();
                  onMessage(localSent ? 'Тестовое локальное уведомление отправлено.' : 'Сначала выдай браузеру разрешение на уведомления.');
                }}
              >
                Тест
              </button>
            </div>
          </div>
        </article>

        <article className="glass-card settings-card">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Данные</p>
              <h3>Сохранение между версиями</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="settings-stack">
            <p className="muted-copy">Основные данные лежат в IndexedDB, поэтому остаются на устройстве после закрытия вкладки и после обновления веб-версии.</p>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={exportData}>
                <Download size={14} /> Экспорт
              </button>
              <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Импорт
              </button>
            </div>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void importData(file);
                }
                event.currentTarget.value = '';
              }}
            />
          </div>
        </article>

        <article className="glass-card settings-card">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Инфо</p>
              <h3>О приложении</h3>
            </div>
            <Info size={18} />
          </div>
          <p className="muted-copy">Daily помогает собирать планы по дням, неделям, месяцам и году, видеть реальный прогресс, хранить историю действий и поддерживать личный молитвенный ритм.</p>
          <button className="primary-button" type="button" onClick={() => setAboutOpen(true)}>Открыть описание</button>
        </article>
      </section>

      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="О приложении"
        footer={<button className="primary-button" type="button" onClick={() => setAboutOpen(false)}>Понятно</button>}
      >
        <div className="about-copy">
          <p>
            <strong>Daily</strong> — это персональный планировщик, который помогает вести день, неделю, месяц и год как один связанный маршрут, а не как набор разрозненных списков.
          </p>
          <p>
            В приложении можно создавать задачи для разных периодов, ставить напоминания, закреплять повторяющиеся пункты, видеть прогресс именно в активном периоде и возвращаться к истории конкретных дней.
          </p>
          <p>
            Отдельный молитвенный раздел помогает задать ритм на каждый день недели, а настройки дают контроль над часовым поясом, утренними и вечерними уведомлениями и резервным копированием данных.
          </p>
        </div>
      </Modal>
    </>
  );
}
