export type PlanScope = 'day' | 'week' | 'month' | 'year';
export type TaskSource = 'manual' | 'recurring' | 'prayer' | 'prayerDefault';
export type AppTab = 'plans' | 'prayer' | 'history' | 'settings';
export type EditPolicy = 'allow' | 'confirm' | 'deny';

export interface TaskReminder {
  id: string;
  dateKey: string;
  time: string;
}

export interface PlanTask {
  id: string;
  scope: PlanScope;
  periodKey: string;
  title: string;
  description: string | null;
  source: TaskSource;
  isLocked: boolean;
  recurringId: string | null;
  isDone: boolean;
  doneAt: string | null;
  remindersEnabled: boolean;
  reminders: TaskReminder[];
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTaskTemplate {
  id: string;
  scope: PlanScope;
  title: string;
  description: string | null;
  remindersEnabled: boolean;
  reminders: TaskReminder[];
  referencePeriodKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrayerPlanEntry {
  weekday: number;
  title: string | null;
  description: string | null;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  message: string;
  timestamp: string;
  dayKey: string;
}

export interface PeriodProgress {
  done: number;
  total: number;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  timezoneId: string;
}

export interface DailySnapshot {
  schemaVersion: number;
  activeTab: AppTab;
  activeScope: PlanScope;
  selectedPeriods: Record<PlanScope, string>;
  tasks: PlanTask[];
  recurring: RecurringTaskTemplate[];
  prayer: PrayerPlanEntry[];
  history: ActivityLogEntry[];
  settings: AppSettings;
  initializedPeriods: string[];
  finalisedPeriods: string[];
  lastObservedDayKey: string;
}

export interface TaskDraftInput {
  title: string;
  description: string | null;
  isLocked: boolean;
  remindersEnabled: boolean;
  reminders: TaskReminder[];
}

export interface PrayerDraftInput {
  weekday: number;
  title: string | null;
  description: string | null;
}

export interface TimezoneOption {
  id: string;
  label: string;
}
