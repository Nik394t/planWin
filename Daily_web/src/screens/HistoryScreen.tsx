import { useEffect, useMemo, useState } from 'react';
import { History, Sparkles } from 'lucide-react';

import { compareDatesByKey, formatDateTime, weekdayShort } from '../domain/date';
import type { DailySnapshot } from '../domain/types';

export function HistoryScreen({ snapshot }: { snapshot: DailySnapshot }) {
  const days = useMemo(() => [...new Set(snapshot.history.map((item) => item.dayKey))].sort(compareDatesByKey), [snapshot.history]);
  const [selectedDay, setSelectedDay] = useState<string | null>(days[0] ?? null);

  useEffect(() => {
    if (days.length === 0) {
      setSelectedDay(null);
      return;
    }
    if (!selectedDay || !days.includes(selectedDay)) {
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  const visibleEntries = useMemo(
    () => snapshot.history.filter((item) => item.dayKey === selectedDay),
    [snapshot.history, selectedDay],
  );

  return (
    <>
      <section className="hero-card compact-hero">
        <div>
          <p className="eyebrow">История</p>
          <h1>Действия разделены по дням</h1>
          <p className="hero-copy">Можно быстро открыть конкретную дату и увидеть только те изменения, которые были в этот день.</p>
        </div>
        <div className="stat-badge">
          <History size={16} /> {snapshot.history.length} записей
        </div>
      </section>

      {days.length > 0 ? (
        <>
          <section className="glass-card chip-panel">
            <div className="chip-row">
              {days.map((day) => {
                const date = new Date(`${day}T00:00:00`);
                const weekday = (date.getDay() + 6) % 7;
                return (
                  <button key={day} className={`tag selectable-tag ${selectedDay === day ? 'selectable-tag-active' : ''}`} type="button" onClick={() => setSelectedDay(day)}>
                    {day} • {weekdayShort(weekday)}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="history-list">
            {visibleEntries.map((entry) => (
              <article key={entry.id} className="glass-card history-card">
                <div className="history-icon"><Sparkles size={16} /></div>
                <div>
                  <p className="history-message">{entry.message}</p>
                  <p className="muted-copy">{formatDateTime(new Date(entry.timestamp))}</p>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : (
        <div className="empty-card">
          <p className="eyebrow">История пуста</p>
          <h3>Сначала поработай с планами</h3>
          <p>После создания задач, отметок и изменений настроек события начнут собираться по датам автоматически.</p>
        </div>
      )}
    </>
  );
}
