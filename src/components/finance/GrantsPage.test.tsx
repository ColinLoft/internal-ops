// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GrantsPage } from './GrantsPage';
import { nextGrantDate } from './grantShared';
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'me', systemRole: 'admin' }, users: [] }) }));
vi.mock('./GrantImport', () => ({ GrantImport: () => null }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => {
    const data = [
      { id: 'later', name: 'Later grant', funder_name: 'Foundation', grant_type: 'money', stage: 'prospect', next_follow_up_at: '2026-12-01', next_action: 'Prepare budget', amount_requested: 0 },
      { id: 'sooner', name: 'Sooner grant', funder_name: 'City fund', grant_type: 'money', stage: 'applied', decision_due_at: '2026-11-15', next_action: 'Check decision', amount_requested: 5000 },
      { id: 'closed', name: 'Old closed grant', stage: 'closed' },
    ];
    const query = { select: () => query, order: () => query, range: () => query, then: (resolve: (value: unknown) => void) => resolve({ data, error: null }) };
    return query;
  } },
}));
describe('simple grant tracker', () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
  it('shows active grants in date order with the next action and an honest zero amount', async () => {
    await act(async () => root.render(<GrantsPage />));
    expect([...host.querySelectorAll('li a')].map((link) => link.textContent)).toEqual(['Sooner grantCity fund', 'Later grantFoundation']);
    expect(host.textContent).toContain('Prepare budget');
    expect(host.textContent).toContain('$0');
    expect(host.textContent).not.toContain('Old closed grant');
    expect(host.textContent).not.toContain('Upcoming deadlines & follow-ups');
  });
  it('keeps new-grant essentials visible and less-used metadata collapsed', async () => {
    await act(async () => root.render(<GrantsPage />));
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'New grant')!.click());
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Next action');
    expect(dialog.textContent).toContain('Next date');
    expect(dialog.querySelector('input[type="date"]')?.closest('details')).toBeNull();
    expect(dialog.querySelector('input[type="email"]')?.closest('details')?.open).toBe(false);
  });
  it('uses the earliest relevant date and does not show obsolete decision dates', () => {
    expect(nextGrantDate({ stage: 'applied', next_follow_up_at: '2026-12-01', decision_due_at: '2026-11-15', term_end: null })).toBe('2026-11-15');
    expect(nextGrantDate({ stage: 'awarded', next_follow_up_at: null, decision_due_at: '2026-11-15', term_end: null })).toBeNull();
    expect(nextGrantDate({ stage: 'closed', next_follow_up_at: '2026-11-15', decision_due_at: null, term_end: '2026-12-01' })).toBeNull();
  });
});
