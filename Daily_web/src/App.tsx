import { useEffect, useRef, useState } from 'react';

import { BottomNav, RailNav } from './components/BottomNav';
import { Toast } from './components/Toast';
import { assetUrl } from './app/paths';
import { periodTitle } from './domain/planner';
import { HistoryScreen } from './screens/HistoryScreen';
import { PlansScreen } from './screens/PlansScreen';
import { PrayerScreen } from './screens/PrayerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { registerServiceWorker, runNotificationCycle, syncSnapshotWithPushBackend } from './services/notifications';
import { useDailyStore } from './store/dailyStore';

export function App() {
  const snapshot = useDailyStore((state) => state.snapshot);
  const hydrated = useDailyStore((state) => state.hydrated);
  const hydrate = useDailyStore((state) => state.hydrate);
  const setTab = useDailyStore((state) => state.setTab);
  const refreshForNow = useDailyStore((state) => state.refreshForNow);
  const notificationPermission = useDailyStore((state) => state.notificationPermission);
  const setNotificationPermission = useDailyStore((state) => state.setNotificationPermission);

  const [toast, setToast] = useState<string | null>(null);
  const snapshotRef = useRef(snapshot);

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
    const interval = window.setInterval(() => {
      void refreshForNow();
      void runNotificationCycle(snapshotRef.current);
    }, 30000);
    return () => window.clearInterval(interval);
  }, [refreshForNow]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void runNotificationCycle(snapshot);
  }, [hydrated, snapshot]);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void syncSnapshotWithPushBackend(snapshot);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [hydrated, snapshot]);

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
            <span className="status-pill">PWA ready</span>
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
