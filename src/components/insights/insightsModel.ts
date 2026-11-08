export type TimedRecord = { created_at?: string | null };
export type WeeklyCount = {
  start: string;
  label: string;
  value: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const mondayStart = (value: Date) => {
  const day = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day;
};

export function weeklyCounts<T extends TimedRecord>(
  rows: T[],
  now = new Date(),
  weekCount = 12,
): WeeklyCount[] {
  const currentWeek = mondayStart(now);
  const firstWeek = new Date(currentWeek.getTime() - (weekCount - 1) * 7 * DAY_MS);
  const counts = Array.from({ length: weekCount }, (_, index) => {
    const start = new Date(firstWeek.getTime() + index * 7 * DAY_MS);
    return {
      start: start.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(start),
      value: 0,
    };
  });
  const indexByStart = new Map(counts.map((week, index) => [week.start, index]));

  rows.forEach((row) => {
    if (!row.created_at) return;
    const created = new Date(row.created_at);
    if (!Number.isFinite(created.getTime()) || created > now) return;
    const week = mondayStart(created).toISOString().slice(0, 10);
    const index = indexByStart.get(week);
    if (index !== undefined) counts[index].value += 1;
  });

  return counts;
}

export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = key(row) || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export function percentage(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
