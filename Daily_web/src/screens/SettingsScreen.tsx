import { useEffect, useRef, useState } from 'react';
import { Bell, Cloud, Download, Info, LogIn, LogOut, ShieldCheck, Upload, UserRoundPlus } from 'lucide-react';

import { timezoneLabelFor, timezoneOptions } from '../domain/date';
import { buildExchangeEnvelope, importPortableSnapshot } from '../domain/exchange';
import type { DailySnapshot } from '../domain/types';
import { Modal } from '../components/Modal';
import {
  type AuthResult,
  type AuthSession,
  signInWithPassword,
  signUpWithPassword,
} from '../services/auth';
import { setRuntimeApiBase } from '../services/api';
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
  session: AuthSession | null;
  cloudAvailable: boolean;
  apiBase: string | null;
  cloudStatus: {
    label: string;
    detail: string;
    tone: 'neutral' | 'success' | 'warning' | 'danger';
  };
  cloudBusy: boolean;
  onApiBaseChanged: (value: string | null) => void;
  onAuthResolved: (result: AuthResult) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function SettingsScreen({
  snapshot,
  notificationPermission,
  onPermissionChange,
  onMessage,
  session,
  cloudAvailable,
  apiBase,
  cloudStatus,
  cloudBusy,
  onApiBaseChanged,
  onAuthResolved,
  onLogout,
}: SettingsScreenProps) {
  const updateSettings = useDailyStore((state) => state.updateSettings);
  const replaceSnapshot = useDailyStore((state) => state.replaceSnapshot);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [apiBaseInput, setApiBaseInput] = useState(apiBase ?? '');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    setApiBaseInput(apiBase ?? '');
  }, [apiBase]);

  const exportData = () => {
    const payload = buildExchangeEnvelope(snapshot, 'daily-web', 'web-pwa');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `daily-exchange-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onMessage('Совместимая резервная копия выгружена. Ее можно импортировать в мобильную версию и обратно.');
  };

  const importData = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      await replaceSnapshot(importPortableSnapshot(parsed));
      onMessage('Данные импортированы. Формат совместим с Daily Web и мобильной версией.');
    } catch {
      onMessage('Файл не удалось импортировать. Проверь, что это backup Daily.');
    }
  };

  async function submitAuth(): Promise<void> {
    if (!cloudAvailable) {
      setAuthError('Сначала подключи cloud API для логина и облачного хранения.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = authMode === 'signup'
        ? await signUpWithPassword({
            login,
            password,
            displayName,
            snapshot,
          })
        : await signInWithPassword({
            login,
            password,
            snapshot,
          });
      await onAuthResolved(result);
      setPassword('');
      onMessage(authMode === 'signup' ? 'Аккаунт создан и синхронизирован.' : 'Вход выполнен, данные связаны с аккаунтом.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Не удалось выполнить вход.');
    } finally {
      setAuthBusy(false);
    }
  }

  function saveApiBase(): void {
    const normalized = setRuntimeApiBase(apiBaseInput);
    onApiBaseChanged(normalized);
    setApiBaseInput(normalized ?? '');
    onMessage(
      normalized
        ? 'Cloud API подключен. Теперь можно использовать аккаунт и server push.'
        : 'Cloud API очищен. Приложение вернулось в локальный режим.',
    );
  }

  return (
    <>
      <section className="hero-card compact-hero">
        <div>
          <p className="eyebrow">Настройки</p>
          <h1>Контроль, а не шум</h1>
          <p className="hero-copy">
            Здесь управляются timezone, разрешения, push-уведомления, аккаунт, облачная синхронизация и перенос данных между вебом и мобильной версией.
          </p>
        </div>
      </section>

      <section className="settings-grid">
        <article className="glass-card settings-card settings-card-wide account-card">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Аккаунт</p>
              <h3>Логин, пароль и облачная копия</h3>
            </div>
            <Cloud size={18} />
          </div>

          <div className="account-grid">
            <div className="settings-stack">
              <div className={`status-banner status-banner-${cloudStatus.tone}`}>
                <strong>{cloudBusy ? 'Синхронизация...' : cloudStatus.label}</strong>
                <p>{cloudStatus.detail}</p>
              </div>

              <div className="field">
                <span>Cloud API URL</span>
                <input
                  value={apiBaseInput}
                  onChange={(event) => setApiBaseInput(event.target.value)}
                  placeholder="Например https://daily-cloud.example.com"
                  inputMode="url"
                  autoComplete="url"
                />
                <p className="muted-copy">
                  Для GitHub Pages это поле позволяет подключить отдельный backend без новой сборки фронта.
                </p>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={saveApiBase}>
                    Сохранить API
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setApiBaseInput('');
                      const normalized = setRuntimeApiBase(null);
                      onApiBaseChanged(normalized);
                      onMessage('Cloud API очищен.');
                    }}
                  >
                    Очистить
                  </button>
                </div>
              </div>

              {cloudAvailable ? (
                session ? (
                  <div className="settings-stack">
                    <div className="settings-row">
                      <div>
                        <span>Подключенный аккаунт</span>
                        <p>{session.user.displayName} · @{session.user.login}</p>
                      </div>
                      <button className="secondary-button" type="button" disabled={authBusy || cloudBusy} onClick={() => void onLogout()}>
                        <LogOut size={14} /> Выйти
                      </button>
                    </div>
                    <p className="muted-copy">
                      Пока аккаунт активен, состояние планов сохраняется и локально, и в облаке. Это защищает данные при смене устройства и повторном входе.
                    </p>
                  </div>
                ) : (
                  <div className="auth-form">
                    <div className="auth-mode-tabs">
                      <button
                        className={`selectable-tag ${authMode === 'signup' ? 'selectable-tag-active' : ''}`}
                        type="button"
                        onClick={() => setAuthMode('signup')}
                      >
                        <UserRoundPlus size={14} /> Создать аккаунт
                      </button>
                      <button
                        className={`selectable-tag ${authMode === 'signin' ? 'selectable-tag-active' : ''}`}
                        type="button"
                        onClick={() => setAuthMode('signin')}
                      >
                        <LogIn size={14} /> Войти
                      </button>
                    </div>

                    <label className="field">
                      <span>Логин</span>
                      <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="например nik394t" autoComplete="username" />
                    </label>

                    {authMode === 'signup' ? (
                      <label className="field">
                        <span>Имя в приложении</span>
                        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Как показывать аккаунт внутри Daily" autoComplete="nickname" />
                      </label>
                    ) : null}

                    <label className="field">
                      <span>Пароль</span>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Минимум 6 символов"
                        autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                      />
                    </label>

                    {authError ? <p className="error-banner">{authError}</p> : null}

                    <button className="primary-button" type="button" disabled={authBusy} onClick={() => void submitAuth()}>
                      {authBusy ? 'Обрабатываю...' : authMode === 'signup' ? 'Создать и синхронизировать' : 'Войти и подтянуть данные'}
                    </button>
                  </div>
                )
              ) : (
                <p className="muted-copy">
                  Облачный API еще не подключен к этой сборке. Локальное хранение и import/export уже работают, но логин и серверные push-уведомления станут активны после подключения backend-домена.
                </p>
              )}
            </div>

            <div className="settings-stack">
              <div className="stat-badge">
                <ShieldCheck size={16} />
                <span>Локальное хранилище остается резервом даже при работе через аккаунт.</span>
              </div>
              <div className="stat-badge">
                <Download size={16} />
                <span>Один и тот же backup читается в вебе и в мобильной версии Daily.</span>
              </div>
              <div className="stat-badge">
                <Bell size={16} />
                <span>Push-уведомления привязываются к конкретному аккаунту и устройству.</span>
              </div>
            </div>
          </div>
        </article>

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
                <p>
                  {notificationPermission === 'granted'
                    ? 'Разрешение выдано. Браузер может показывать локальные и серверные push-уведомления.'
                    : notificationPermission === 'denied'
                      ? 'Разрешение отклонено. Без него push не заработает.'
                      : 'Разрешение еще не запрашивалось.'}
                </p>
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
                    await unsubscribeFromPushBackend(session);
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
                    await unsubscribeFromPushBackend(session);
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
                  const remoteSent = await sendRemoteTestNotification(session);
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
              <h3>Импорт и экспорт</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="settings-stack">
            <p className="muted-copy">
              Локальные данные лежат в IndexedDB и остаются после закрытия вкладки. Дополнительно можно сделать совместимый backup, чтобы перенести планы между вебом и телефоном.
            </p>
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
            Отдельный молитвенный раздел помогает задать ритм на каждый день недели, а настройки дают контроль над часовым поясом, push-уведомлениями, аккаунтом и переносом резервных копий между вебом и мобильной версией.
          </p>
        </div>
      </Modal>
    </>
  );
}
