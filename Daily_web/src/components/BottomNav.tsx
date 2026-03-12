import clsx from 'clsx';
import { History, LayoutDashboard, Settings, Sparkles } from 'lucide-react';

import { assetUrl } from '../app/paths';
import type { AppTab } from '../domain/types';

const items: { id: AppTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'plans', label: 'Планы', icon: LayoutDashboard },
  { id: 'prayer', label: 'Молитвы', icon: Sparkles },
  { id: 'history', label: 'История', icon: History },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

interface BottomNavProps {
  value: AppTab;
  onChange: (tab: AppTab) => void;
}

export function BottomNav({ value, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Разделы приложения">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={clsx('nav-item', value === item.id && 'nav-item-active')}
            type="button"
            onClick={() => onChange(item.id)}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function RailNav({ value, onChange }: BottomNavProps) {
  return (
    <aside className="rail-nav">
      <div className="rail-brand">
        <img src={assetUrl('daily-logo.png')} alt="Daily" width={54} height={54} />
        <div>
          <p className="eyebrow">Daily</p>
          <h2>Planner</h2>
        </div>
      </div>
      <div className="rail-items">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={clsx('rail-item', value === item.id && 'rail-item-active')}
              type="button"
              onClick={() => onChange(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
