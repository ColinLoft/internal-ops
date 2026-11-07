// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlownSystem } from './types';

const mock = vi.hoisted(() => ({
  systems: [] as FlownSystem[],
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
      const response = { data: [], error: null };
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
    mock.systems = []; mock.active = true; mock.save.mockClear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it('renders the honest empty state and persists newly registered inventory', async () => {
    await act(async () => root.render(<SystemsPage />));
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
});
