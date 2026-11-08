import { describe, expect, it } from 'vitest';
import { countBy, percentage, weeklyCounts } from './insightsModel';

describe('insight aggregations', () => {
  it('counts stored rows by UTC week across the rolling window', () => {
    const now = new Date('2026-11-07T20:00:00.000Z');
    const counts = weeklyCounts([
      { created_at: '2026-11-02T00:00:00.000Z' },
      { created_at: '2026-11-06T14:00:00.000Z' },
      { created_at: '2026-10-31T23:59:59.000Z' },
      { created_at: '2026-08-16T00:00:00.000Z' },
      { created_at: '2026-11-08T00:00:00.000Z' },
      { created_at: 'not-a-date' },
      {},
    ], now, 12);

    expect(counts).toHaveLength(12);
    expect(counts[counts.length - 1]).toMatchObject({ start: '2026-11-02', value: 2 });
    expect(counts[counts.length - 2]).toMatchObject({ start: '2026-10-26', value: 1 });
    expect(counts[0].start).toBe('2026-08-17');
    expect(counts.reduce((sum, week) => sum + week.value, 0)).toBe(3);
  });

  it('keeps empty periods at zero instead of inventing a series', () => {
    expect(weeklyCounts([], new Date('2026-11-07T20:00:00.000Z'), 2).map(week => week.value)).toEqual([0, 0]);
  });

  it('aggregates status counts and returns zero for an undefined ratio', () => {
    expect(countBy([{ status: 'open' }, { status: 'open' }, { status: 'closed' }], row => row.status))
      .toEqual({ open: 2, closed: 1 });
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(2, 3)).toBe(67);
  });
});
