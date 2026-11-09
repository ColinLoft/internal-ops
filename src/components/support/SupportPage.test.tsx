// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ pending: undefined as undefined | Promise<unknown>, count: 1 }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'staff' }, users: [{ id: 'staff', name: 'Staff' }] }) }));
vi.mock('../../lib/useAppAccess', () => ({ useAppAccess: () => ({ canEdit: true }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh(load: () => Promise<void>) { useEffect(() => { void load(); }, [load]); } }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query, order: () => query,
        in: async () => ({ count: mock.count, error: null }),
        range: () => mock.pending ?? Promise.resolve({ data: [{ id: 'ticket', ticket_number: 1, subject: 'Real request', status: 'new', priority: 'normal', category: 'general', requester_id: 'staff', assignee_id: null, created_at: '2026-11-01', updated_at: '2026-11-01' }], error: null }),
      };
      return query;
    },
  },
}));
import { TicketsView } from './SupportPage';
describe('Support counts and loading', () => {
  it('distinguishes Active from Open and removes the duplicate open KPI', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      mock.pending = undefined;
      await act(async () => root.render(<TicketsView onOpenMessages={() => {}} />));
      const buttons = [...container.querySelectorAll('button')].map(button => button.textContent);
      expect(buttons.filter(text => text === 'Open0')).toHaveLength(1);
      expect(buttons).toContain('Active1');
      expect(container.textContent).not.toContain('Open tickets');
      expect(container.textContent).toContain('Real request');
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
  it('shows a real skeleton until ticket data arrives', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let finish!: (value: unknown) => void;
    mock.pending = new Promise(resolve => { finish = resolve; });
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<TicketsView onOpenMessages={() => {}} />));
      expect(container.querySelector('[aria-label=Loading]')).not.toBeNull();
      expect(container.textContent).not.toContain('No tickets');
      await act(async () => finish({ data: [], error: null }));
      expect(container.querySelector('[aria-label=Loading]')).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); mock.pending = undefined; }
  });
});
