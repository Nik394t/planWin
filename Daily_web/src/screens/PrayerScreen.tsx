import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { weekdayLabel, weekdayShort } from '../domain/date';
import type { DailySnapshot, PrayerPlanEntry } from '../domain/types';
import { useDailyStore } from '../store/dailyStore';

interface PrayerScreenProps {
  snapshot: DailySnapshot;
  onMessage: (message: string) => void;
}

function PrayerCard({ entry, onMessage }: { entry: PrayerPlanEntry; onMessage: (message: string) => void }) {
  const updatePrayer = useDailyStore((state) => state.updatePrayer);
  const [title, setTitle] = useState(entry.title ?? '');
  const [description, setDescription] = useState(entry.description ?? '');

  useEffect(() => {
    setTitle(entry.title ?? '');
    setDescription(entry.description ?? '');
  }, [entry.title, entry.description]);

  const save = async () => {
    await updatePrayer({
      weekday: entry.weekday,
      title: title.trim() || null,
      description: description.trim() || null,
    });
    onMessage(`Молитвенный план на ${weekdayLabel(entry.weekday).toLowerCase()} обновлен.`);
  };

  return (
    <article className="glass-card prayer-card">
      <div className="prayer-head">
        <div>
          <p className="eyebrow">{weekdayShort(entry.weekday)}</p>
          <h3>{weekdayLabel(entry.weekday)}</h3>
        </div>
        <Sparkles size={18} />
      </div>
      <label className="field">
        <span>Название</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, утренняя молитва" />
      </label>
      <label className="field">
        <span>Пояснение</span>
        <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Если оставить пустым, в дневном плане останется стандартное 'Помолиться'." />
      </label>
      <button className="primary-button" type="button" onClick={save}>Сохранить</button>
    </article>
  );
}

export function PrayerScreen({ snapshot, onMessage }: PrayerScreenProps) {
  return (
    <>
      <section className="hero-card compact-hero">
        <div>
          <p className="eyebrow">Молитвы</p>
          <h1>Отдельный недельный ритм</h1>
          <p className="hero-copy">Каждый день недели живет своей записью, а актуальная молитва автоматически попадает в дневной план.</p>
        </div>
      </section>
      <section className="prayer-grid">
        {snapshot.prayer.map((entry) => (
          <PrayerCard key={entry.weekday} entry={entry} onMessage={onMessage} />
        ))}
      </section>
    </>
  );
}
