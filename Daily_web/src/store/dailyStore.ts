import { create } from 'zustand';

import {
  addTaskToCurrent,
  createInitialSnapshot,
  deleteTask,
  importSnapshot,
  jumpToCurrent,
  nowForSnapshot,
  prepareSnapshot,
  refreshForNow,
  setActiveScope,
  setActiveTab,
  shiftSelectedPeriod,
  toggleTaskDone,
  toggleTaskLock,
  updatePrayerEntry,
  updateSettings,
  updateTask,
} from '../domain/planner';
import type { AppTab, DailySnapshot, PlanScope, PrayerDraftInput, TaskDraftInput } from '../domain/types';
import { loadSnapshot, saveSnapshot } from './db';

interface DailyStoreState {
  snapshot: DailySnapshot;
  hydrated: boolean;
  notificationPermission: NotificationPermission;
  hydrate: () => Promise<void>;
  refreshForNow: () => Promise<void>;
  setNotificationPermission: (value: NotificationPermission) => void;
  setTab: (tab: AppTab) => Promise<void>;
  setScope: (scope: PlanScope) => Promise<void>;
  shiftPeriod: (delta: number) => Promise<void>;
  jumpToCurrent: () => Promise<void>;
  addTask: (draft: TaskDraftInput) => Promise<string | null>;
  updateTask: (taskId: string, draft: TaskDraftInput) => Promise<string | null>;
  deleteTask: (taskId: string) => Promise<string | null>;
  toggleTaskDone: (taskId: string) => Promise<string | null>;
  toggleTaskLock: (taskId: string) => Promise<string | null>;
  updatePrayer: (draft: PrayerDraftInput) => Promise<void>;
  updateSettings: (patch: Partial<DailySnapshot['settings']>, message: string) => Promise<void>;
  replaceSnapshot: (snapshot: DailySnapshot) => Promise<void>;
}

let persistTimer: number | undefined;

function schedulePersist(snapshot: DailySnapshot): void {
  if (persistTimer) {
    window.clearTimeout(persistTimer);
  }
  persistTimer = window.setTimeout(() => {
    void saveSnapshot(snapshot);
  }, 180);
}

export const useDailyStore = create<DailyStoreState>((set, get) => ({
  snapshot: createInitialSnapshot(),
  hydrated: false,
  notificationPermission: typeof Notification === 'undefined' ? 'default' : Notification.permission,

  hydrate: async () => {
    const loaded = await loadSnapshot();
    const snapshot = loaded ? importSnapshot(loaded) : createInitialSnapshot();
    set({ snapshot, hydrated: true });
    schedulePersist(snapshot);
  },

  refreshForNow: async () => {
    const next = refreshForNow(get().snapshot, nowForSnapshot(get().snapshot));
    set({ snapshot: next });
    schedulePersist(next);
  },

  setNotificationPermission: (value) => {
    set({ notificationPermission: value });
  },

  setTab: async (tab) => {
    const next = setActiveTab(get().snapshot, tab);
    set({ snapshot: next });
    schedulePersist(next);
  },

  setScope: async (scope) => {
    const next = setActiveScope(get().snapshot, scope, nowForSnapshot(get().snapshot));
    set({ snapshot: next });
    schedulePersist(next);
  },

  shiftPeriod: async (delta) => {
    const next = shiftSelectedPeriod(get().snapshot, delta, nowForSnapshot(get().snapshot));
    set({ snapshot: next });
    schedulePersist(next);
  },

  jumpToCurrent: async () => {
    const next = jumpToCurrent(get().snapshot, nowForSnapshot(get().snapshot));
    set({ snapshot: next });
    schedulePersist(next);
  },

  addTask: async (draft) => {
    const result = addTaskToCurrent(get().snapshot, draft, nowForSnapshot(get().snapshot));
    if (!result.error) {
      set({ snapshot: result.snapshot });
      schedulePersist(result.snapshot);
    }
    return result.error;
  },

  updateTask: async (taskId, draft) => {
    const result = updateTask(get().snapshot, taskId, draft, nowForSnapshot(get().snapshot));
    if (!result.error) {
      set({ snapshot: result.snapshot });
      schedulePersist(result.snapshot);
    }
    return result.error;
  },

  deleteTask: async (taskId) => {
    const result = deleteTask(get().snapshot, taskId, nowForSnapshot(get().snapshot));
    if (!result.error) {
      set({ snapshot: result.snapshot });
      schedulePersist(result.snapshot);
    }
    return result.error;
  },

  toggleTaskDone: async (taskId) => {
    const result = toggleTaskDone(get().snapshot, taskId, nowForSnapshot(get().snapshot));
    if (!result.error) {
      set({ snapshot: result.snapshot });
      schedulePersist(result.snapshot);
    }
    return result.error;
  },

  toggleTaskLock: async (taskId) => {
    const result = toggleTaskLock(get().snapshot, taskId, nowForSnapshot(get().snapshot));
    if (!result.error) {
      set({ snapshot: result.snapshot });
      schedulePersist(result.snapshot);
    }
    return result.error;
  },

  updatePrayer: async (draft) => {
    const next = updatePrayerEntry(get().snapshot, draft, nowForSnapshot(get().snapshot));
    set({ snapshot: next });
    schedulePersist(next);
  },

  updateSettings: async (patch, message) => {
    const preview = prepareSnapshot({ ...get().snapshot, settings: { ...get().snapshot.settings, ...patch } }, nowForSnapshot({ ...get().snapshot, settings: { ...get().snapshot.settings, ...patch } }));
    const next = updateSettings(preview, patch, message, nowForSnapshot(preview));
    set({ snapshot: next });
    schedulePersist(next);
  },

  replaceSnapshot: async (snapshot) => {
    const next = prepareSnapshot(snapshot, nowForSnapshot(snapshot));
    set({ snapshot: next, hydrated: true });
    await saveSnapshot(next);
  },
}));
