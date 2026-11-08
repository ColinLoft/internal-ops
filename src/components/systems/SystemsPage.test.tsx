// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlownSystem, MonitorSummary } from './types';

const mock = vi.hoisted(() => ({
  systems: [] as FlownSystem[],
  summaries: [] as MonitorSummary[],
  active: true,
  save: vi.fn(),
  load: undefined as undefined | (() => Promise<void>),
}));
vi.mock('../../hooks/useLiveRefresh', () => ({
  useLiveRefresh: (load: () => Promise<void>) => {
    mock.load = load;
    React.useEffect(() => { void load(); }, [load]);
  },
}));
vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'staff-test' } }, error: null }) },
    rpc: () => {
      const response = { data: mock.summaries, error: null };
      return { order: () => ({ range: async () => response }) };
    },
    from: (table: string) => {
      let inserting: Record<string, unknown> | undefined;
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain,
        insert: (values: Record<string, unknown>) => { inserting = values; return chain; },
        range: async () => ({ data: table === 'flown_systems' ? mock.systems : [], error: null }),
        limit: async () => ({ data: table === 'profiles' ? [{ id: 'staff-test', name: 'Test staff', account_status: 'active' }] : [], error: null }),
        maybeSingle: async () => ({ data: { account_status: mock.active ? 'active' : 'suspended' }, error: null }),
        single: async () => {
          if (inserting) {
            mock.save(inserting);
            mock.systems.push({ id: 'system-test', ...inserting } as unknown as FlownSystem);
          }
          return { data: { id: 'system-test' }, error: null };
        },
      };
      return chain;
    },
  },
}));
import { SystemsPage } from './SystemsPage';

let container: HTMLDivElement;
let root: Root;
const click = async (text: string) => {
  const target = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === text);
  expect(target).toBeDefined();
  await act(async () => { target!.click(); });
};
describe('systems staff workspace', () => {
  beforeEach(() => {
    mock.systems = []; mock.summaries = []; mock.active = true; mock.save.mockClear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it('renders the honest empty state and persists newly registered inventory', async () => {
    await act(async () => root.render(<SystemsPage />));
    expect(container.textContent).toContain('Health overview');
    expect(container.textContent).toContain('System inventory');
    expect(container.querySelector('[data-systems-page]')?.className).toContain('flex-1');
    expect(container.querySelector('[data-systems-page] > div')?.className).toContain('w-full');
    expect(container.querySelector('.grid.items-start.gap-6') !== null).toBe(true);
    expect(container.textContent).toContain('No systems registered');
    expect(container.textContent).not.toContain('100.00%');
    await click('Add system');
    const name = container.querySelector('input[type=text]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Monitoring test system');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Monitoring test system', monitoring_enabled: false, owner_id: null }));
    expect(container.textContent).toContain('Not monitored');
    expect(container.textContent).toContain('No observations yet');
    expect(container.textContent).not.toContain('100.00%');
  });
  it('refuses suspended profiles without exposing inventory', async () => {
    mock.active = false;
    mock.systems = [{ id: 'private-test', name: 'Hidden test inventory' } as FlownSystem];
    await act(async () => root.render(<SystemsPage />));
    expect(container.textContent).toContain('active staff only');
    expect(container.textContent).not.toContain('Hidden test inventory');
  });
  it('summarizes measured health states without counting unobserved systems as healthy', async () => {
    mock.systems = [
      { id: 'up', name: 'Healthy', description: '', owner_id: null, category: 'application', environment: 'production', url: '', monitoring_enabled: true, monitor_url: 'https://status.flown.org/up' },
      { id: 'down', name: 'Down', description: '', owner_id: null, category: 'website', environment: 'production', url: '', monitoring_enabled: true, monitor_url: 'https://status.flown.org/down' },
      { id: 'waiting', name: 'Waiting', description: '', owner_id: null, category: 'integration', environment: 'staging', url: '', monitoring_enabled: true, monitor_url: 'https://status.flown.org/waiting' },
      { id: 'off', name: 'Not monitored', description: '', owner_id: null, category: 'other', environment: 'development', url: '', monitoring_enabled: false, monitor_url: '' },
    ] as FlownSystem[];
    const checkedAt = new Date().toISOString();
    mock.summaries = [
      { system_id: 'up', latest_check: { endpoint_url: 'https://status.flown.org/up', checked_at: checkedAt, outcome: 'up' } },
      { system_id: 'down', latest_check: { endpoint_url: 'https://status.flown.org/down', checked_at: checkedAt, outcome: 'down' } },
    ] as MonitorSummary[];

    await act(async () => root.render(<SystemsPage />));

    expect(container.textContent).toContain('Operational1');
    expect(container.textContent).toContain('Needs attention1');
    expect(container.textContent).toContain('Awaiting checks1');
    expect(container.textContent).toContain('Not monitored1');
  });
});
