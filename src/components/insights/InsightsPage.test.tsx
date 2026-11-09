// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  failures: [] as string[],
  rpc: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mock.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        order: () => query,
        in: async (_field: string, statuses: string[]) => ({ count: (mock.rows[table] ?? []).filter(row => statuses.includes(String(row.status))).length, error: null }),
        range: async (start: number) => ({
          data: mock.failures.includes(table) ? null : start === 0 ? mock.rows[table] ?? [] : [],
          error: mock.failures.includes(table) ? { message: 'unavailable' } : null,
        }),
      };
      return query;
    },
  },
}));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh(load: () => Promise<void>) { useEffect(() => { void load(); }, [load]); } }));

import { InsightsPage } from './InsightsPage';

let container: HTMLDivElement;
let root: Root;

describe('Insights workspace', () => {
  beforeEach(() => {
    mock.rows = {};
    mock.failures = [];
    mock.rpc.mockResolvedValue({ data: { count: 4, online: 1 }, error: null });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('draws weekly chart values and status summaries from stored records', async () => {
    const now = new Date().toISOString();
    mock.rows.program_tasks = [
      { id: 'task-1', status: 'completed', created_at: now },
      { id: 'task-2', status: 'in_progress', created_at: now },
    ];
    mock.rows.eng_projects = [{ id: 'project-1', status: 'active', created_at: now }];
    mock.rows.support_tickets = [{ id: 'ticket-1', status: 'open', created_at: now }];

    await act(async () => root.render(<InsightsPage />));

    expect(container.textContent).toContain('Tasks created');
    expect(container.textContent).toContain('2 total records');
    expect(container.textContent).toContain('50%');
    expect(container.querySelector('[aria-label="Key metrics"]')?.className).toContain('grid-cols-2');
    expect(container.querySelector('[aria-label="Key metrics"]')?.className).not.toContain('items-start');
    expect(container.querySelectorAll('.sr-only td.text-right.tabular-nums')).toHaveLength(48);
    expect([...container.querySelectorAll('svg title')].some((title) => title.textContent?.includes('2 records'))).toBe(true);
    expect(container.textContent).toContain('1 active');
    expect(mock.rpc).toHaveBeenCalledWith('active_staff_metrics');
    expect(container.querySelector('[aria-label="Key metrics"]')?.textContent).toContain('Staff4');
    expect(container.querySelector('[aria-label="Key metrics"]')?.textContent).toContain('Active tickets1');
  });

  it('labels failed sources as unavailable rather than showing false zeroes', async () => {
    mock.failures = ['program_tasks'];

    await act(async () => root.render(<InsightsPage />));

    expect(container.textContent).toContain('Tasks');
    expect(container.querySelector('[role=status]')?.textContent).not.toContain('program_tasks');
    expect(container.textContent).toContain('Could not load this source');
    expect(container.textContent).toContain('Source unavailable');
    const taskBreakdown = [...container.querySelectorAll('article')].find((article) => article.querySelector('h3')?.textContent === 'Tasks');
    expect(taskBreakdown?.textContent).toContain('Unavailable');
    expect(taskBreakdown?.textContent).not.toContain('0 records');
  });

  it('keeps metric values and their area/detail readable in the narrow table layout', async () => {
    mock.rows.grants = [{ id: 'grant-1', stage: 'awarded', amount_awarded: 32000 }];
    await act(async () => root.render(<InsightsPage />));

    const table = [...container.querySelectorAll('table')].find((table) => table.querySelector('thead')?.textContent === 'AreaMetricValueDetail')!;
    expect(table.className).toContain('table-fixed');
    expect(table.className).not.toContain('min-w-');
    expect(table.querySelectorAll('thead th.hidden.lg\\:table-cell')).toHaveLength(2);
    const awarded = [...table.querySelectorAll('tbody tr')].find((row) => row.children[1].querySelector('span')?.textContent === 'Awarded')!;
    expect([...awarded.children[1].querySelectorAll('span.lg\\:hidden')].map((span) => span.textContent)).toEqual(['Grants', '1 grants']);
    expect(awarded.children[2].textContent).toBe('$32,000');
    expect(awarded.children[2].className).toContain('text-right');
  });
});
