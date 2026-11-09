// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerPage } from './CustomerPage';

const mock = vi.hoisted(() => ({ refresh: async () => {} }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'me' }, users: [] }) }));
vi.mock('../../lib/useAppAccess', () => ({ useAppAccess: (app: string) => ({ canView: app === 'customers', canEdit: true, canManage: true }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh: (load: () => Promise<void>) => {
  mock.refresh = load;
  React.useEffect(() => { void load(); }, [load]);
} }));
vi.mock('../support/SupportPage', () => ({ SupportPage: () => null }));
vi.mock('./ContractSuite', () => ({ ContractSuite: () => null }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => {
    let rows = ({
      crm_organizations: [{ id: 'company', name: 'Selected company', category: 'customer', created_at: '2026-01-01' }],
      crm_contacts: [
        { id: 'contact', organization_id: 'company', name: 'Company contact' },
        { id: 'orphan', organization_id: null, name: 'Unlinked contact' },
      ],
    } as Record<string, Record<string, unknown>[]>)[table] ?? [];
    const q = { select: () => q, order: () => q, eq: () => q, range: (start: number, end: number) => { rows = rows.slice(start, end + 1); return q; }, then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }) };
    return q;
  } },
}));

describe('company CRM deep links', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); history.replaceState({}, '', '/'); });
  it('resolves a contact search result and does not undo later navigation during refresh', async () => {
    history.replaceState({}, '', '/customers/organizations?contact=contact');
    await act(async () => root.render(<CustomerPage />));
    expect(container.querySelector('h2')?.textContent).toBe('Selected company');
    const back = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Companies')!;
    await act(async () => back.click());
    expect(location.search).toBe('');
    await act(async () => mock.refresh());
    expect(container.querySelector('h2')).toBeNull();
    expect(container.textContent).toContain('Choose a company');
  });
  it('opens an unlinked contact from search without stranding it behind the list', async () => {
    history.replaceState({}, '', '/customers/organizations?contact=orphan');
    await act(async () => root.render(<CustomerPage />));
    expect(container.querySelector('article.ring-2')?.textContent).toContain('Unlinked contact');
    expect(container.querySelector('h2')?.textContent).toBe('Unlinked contacts');
  });
});
