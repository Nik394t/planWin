import { useEffect, useRef, useState } from 'react';

import { BottomNav, RailNav } from './components/BottomNav';
import { Toast } from './components/Toast';
import { assetUrl } from './app/paths';
import { snapshotUpdatedAt } from './domain/exchange';
import { periodTitle } from './domain/planner';
import { HistoryScreen } from './screens/HistoryScreen';
import { PlansScreen } from './screens/PlansScreen';
import { PrayerScreen } from './screens/PrayerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { type AuthResult, type AuthSession, logout, readStoredSession, restoreSession, syncCloudSnapshot } from './services/auth';
import { getApiBase } from './services/api';
import {
  registerServiceWorker,
  runNotificationCycle,
  syncSnapshotWithPushBackend,
  unsubscribeFromPushBackend,
} from './services/notifications';
import { useDailyStore } from './store/dailyStore';

interface CloudStatus {
  label: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}

function initialCloudStatus(cloudAvailable: boolean): CloudStatus {
  if (!cloudAvailable) {
    return {
      label: 'Локально',
      detail: 'Cloud API пока не подключен. Данные надежно хранятся на устройстве.',
      tone: 'warning',
    };
  }
  return {
    label: 'Локально',
    detail: 'Можно работать без аккаунта, но облачная копия пока не подключена.',
    tone: 'neutral',
  };
}

export function App() {
  const snapshot = useDailyStore((state) => state.snapshot);
  const hydrated = useDailyStore((state) => state.hydrated);
  const hydrate = useDailyStore((state) => state.hydrate);
  const setTab = useDailyStore((state) => state.setTab);
  const refreshForNow = useDailyStore((state) => state.refreshForNow);
  const replaceSnapshot = useDailyStore((state) => state.replaceSnapshot);
  const notificationPermission = useDailyStore((state) => state.notificationPermission);
  const setNotificationPermission = useDailyStore((state) => state.setNotificationPermission);

  const [apiBase, setApiBase] = useState<string | null>(() => getApiBase());
  const cloudAvailable = Boolean(apiBase);
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(() => initialCloudStatus(cloudAvailable));
  const [cloudBusy, setCloudBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);
  const restoreDoneRef = useRef(false);

  const preferCloudPush = Boolean(session && cloudAvailable && notificationPermission === 'granted');

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    void hydrate();
    void registerServiceWorker();
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'plans' || tab === 'prayer' || tab === 'history' || tab === 'settings') {
      void setTab(tab);
    }
  }, [hydrate, setTab]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleApiBaseChanged = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      setApiBase(customEvent.detail ?? getApiBase());
    };
    window.addEventListener('daily-api-base-changed', handleApiBaseChanged as EventListener);
    return () => {
      window.removeEventListener('daily-api-base-changed', handleApiBaseChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshForNow();
      if (!preferCloudPush) {
        void runNotificationCycle(snapshotRef.current);
      }
    }, 30000);
    return () => window.clearInterval(interval);
  }, [preferCloudPush, refreshForNow]);

  useEffect(() => {
    if (!hydrated || preferCloudPush) {
      return;
    }
    void runNotificationCycle(snapshot);
  }, [hydrated, preferCloudPush, snapshot]);

  useEffect(() => {
    if (!hydrated || restoreDoneRef.current) {
      return;
    }
    restoreDoneRef.current = true;

    const stored = readStoredSession();
    if (!stored || !cloudAvailable) {
      return;
    }

    let active = true;
    setCloudBusy(true);
    setCloudStatus({
      label: 'Проверяю вход',
      detail: 'Восстанавливаю подключение к аккаунту и сверяю локальную копию.',
      tone: 'neutral',
    });

    void restoreSession(stored)
      .then(async (result) => {
        if (!active) {
          return;
        }
        setSession(result.session);

        const localSnapshot = snapshotRef.current;
        const localUpdatedAt = Date.parse(snapshotUpdatedAt(localSnapshot));
        const remoteSnapshot = result.snapshot;
        const remoteUpdatedAt = remoteSnapshot ? Date.parse(snapshotUpdatedAt(remoteSnapshot)) : 0;

        if (remoteSnapshot && remoteUpdatedAt > localUpdatedAt) {
          await replaceSnapshot(remoteSnapshot);
          if (!active) {
            return;
          }
          setCloudStatus({
            label: 'Облако подключено',
            detail: 'Загружена более свежая версия данных из аккаунта.',
            tone: 'success',
          });
          return;
        }

        const synced = await syncCloudSnapshot(result.session, localSnapshot);
        if (!active) {
          return;
        }
        setCloudStatus(
          synced
            ? {
                label: 'Синхронизировано',
                detail: `Аккаунт ${result.session.user.displayName} активен, локальная копия стала основной.`,
                tone: 'success',
              }
            : {
                label: 'Облако недоступно',
                detail: 'Вход восстановлен, но отправить локальную копию на сервер не удалось.',
                tone: 'danger',
              },
        );
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setSession(null);
        setCloudStatus({
          label: 'Нужен повторный вход',
          detail: 'Старая сессия недействительна. Данные остались локально на устройстве.',
          tone: 'warning',
        });
      })
      .finally(() => {
        if (active) {
          setCloudBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [cloudAvailable, hydrated, replaceSnapshot]);

  useEffect(() => {
    if (!hydrated || !session || !cloudAvailable) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCloudBusy(true);
      setCloudStatus({
        label: 'Синхронизирую',
        detail: 'Обновляю snapshot аккаунта и push-настройки устройства.',
        tone: 'neutral',
      });

      void (async () => {
        const cloudOk = await syncCloudSnapshot(session, snapshot);
        let pushOk = true;
        if (snapshot.settings.notificationsEnabled) {
          pushOk = await syncSnapshotWithPushBackend(session, snapshot);
        } else {
          void unsubscribeFromPushBackend(session);
        }

        setCloudBusy(false);
        if (cloudOk && (pushOk || !snapshot.settings.notificationsEnabled)) {
          setCloudStatus({
            label: 'Синхронизировано',
            detail: `Аккаунт ${session.user.displayName} обновлен. Данные и настройки устройства сохранены.`,
            tone: 'success',
          });
          return;
        }

        if (cloudOk) {
          setCloudStatus({
            label: 'Данные сохранены',
            detail: 'Snapshot аккаунта обновлен, но push-подписка устройства не подтвердилась.',
            tone: 'warning',
          });
          return;
        }

        setCloudStatus({
          label: 'Ошибка синхронизации',
          detail: 'Не удалось сохранить актуальное состояние аккаунта на сервер.',
          tone: 'danger',
        });
      })();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [cloudAvailable, hydrated, session, snapshot]);

  async function handleAuthResolved(result: AuthResult): Promise<void> {
    setSession(result.session);
    if (result.snapshot) {
      await replaceSnapshot(result.snapshot);
    }
    setCloudStatus({
      label: 'Аккаунт подключен',
      detail: `Синхронизация и резервное хранение активны для ${result.session.user.displayName}.`,
      tone: 'success',
    });
  }

  async function handleLogout(): Promise<void> {
    const current = session;
    setSession(null);
    setCloudBusy(false);
    await logout(current);
    setCloudStatus(
      cloudAvailable
        ? {
            label: 'Локальный режим',
            detail: 'Аккаунт отключен. Данные продолжают храниться на этом устройстве.',
            tone: 'warning',
          }
        : initialCloudStatus(false),
    );
  }

  if (!hydrated) {
    return (
      <div className="boot-screen">
        <img src={assetUrl('daily-logo.png')} alt="Daily" width={84} height={84} />
        <p className="eyebrow">Daily</p>
        <h1>Поднимаю твой планировщик</h1>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />
      <RailNav value={snapshot.activeTab} onChange={(tab) => void setTab(tab)} />
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-brand">
            <img src={assetUrl('daily-logo.png')} alt="Daily" width={48} height={48} />
            <div>
              <p className="eyebrow">Daily</p>
              <h2>{snapshot.activeTab === 'plans' ? periodTitle(snapshot) : sectionTitle(snapshot.activeTab)}</h2>
            </div>
          </div>
          <div className="topbar-meta">
            <span className={`status-pill status-pill-${cloudStatus.tone}`}>{cloudBusy ? 'sync...' : cloudStatus.label}</span>
            <span className="status-pill">{session ? session.user.displayName : 'guest'}</span>
            <span className="status-pill">{notificationPermission}</span>
          </div>
        </header>

        <section className="screen-content">
          {snapshot.activeTab === 'plans' ? <PlansScreen snapshot={snapshot} onMessage={setToast} /> : null}
          {snapshot.activeTab === 'prayer' ? <PrayerScreen snapshot={snapshot} onMessage={setToast} /> : null}
          {snapshot.activeTab === 'history' ? <HistoryScreen snapshot={snapshot} /> : null}
          {snapshot.activeTab === 'settings' ? (
            <SettingsScreen
              snapshot={snapshot}
              notificationPermission={notificationPermission}
              onPermissionChange={setNotificationPermission}
              onMessage={setToast}
              session={session}
              cloudAvailable={cloudAvailable}
              apiBase={apiBase}
              cloudStatus={cloudStatus}
              cloudBusy={cloudBusy}
              onApiBaseChanged={setApiBase}
              onAuthResolved={handleAuthResolved}
              onLogout={handleLogout}
            />
          ) : null}
        </section>

        <BottomNav value={snapshot.activeTab} onChange={(tab) => void setTab(tab)} />
      </main>
      <Toast message={toast} />
    </div>
  );
}

function sectionTitle(tab: string): string {
  return {
    prayer: 'Молитвенный ритм',
    history: 'История по дням',
    settings: 'Настройки Daily',
  }[tab] ?? 'Daily';
}
