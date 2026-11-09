// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerWorkspace, type CrmOrg } from './CustomerWorkspace';

const mock = vi.hoisted(() => ({ onAdd: vi.fn(), onSelect: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), mutate: vi.fn(async () => true) }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'me' }, users: [{ id: 'me', name: 'Test owner' }] }) }));
vi.mock('../../lib/useAppAccess', () => ({ useAppAccess: () => ({ canView: false }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) };
    return query;
  } },
}));
const orgs: CrmOrg[] = [
  { id: 'customer', name: 'Test customer', category: 'customer', website: null, notes: null, owner_id: 'me', created_at: '2026-01-01' },
  { id: 'funder', name: 'Test funder', category: 'funder', website: null, notes: null, owner_id: 'me', created_at: '2026-01-01' },
];
describe('company CRM', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const render = async (selectedId: string | null = null, focusedContactId?: string) => act(async () => root.render(<CustomerWorkspace
    orgs={orgs} contacts={[{ id: 'contact', organization_id: 'customer', name: 'Test contact', email: 'contact@example.org', phone: '123', role_title: 'Manager' }, { id: 'orphan', organization_id: null, name: 'Unlinked person', email: null, phone: null, role_title: null }]}
    items={[]} deals={[{ id: 'deal', organization_id: 'customer', name: 'Test opportunity', amount: 0, currency: 'USD', stage: 'open', expected_close: null, notes: null, owner_id: 'me', created_at: '2026-01-01' }]}
    selectedId={selectedId} focusedContactId={focusedContactId} onSelect={mock.onSelect} canEdit canManage onAdd={mock.onAdd} onEdit={mock.onEdit} onRemove={mock.onRemove} onMutate={mock.mutate}
  />));
  const click = async (text: string) => {
    const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === text);
    expect(target).toBeDefined(); await act(async () => target!.click());
  };
  it('has only customer/funder relationship tabs and keeps unlinked contacts reachable', async () => {
    await render();
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['Customers', 'Funders']);
    expect(container.textContent).not.toContain('Qualified');
    expect(container.textContent).toContain('Test customer');
    await click('Funders');
    expect(container.textContent).toContain('Test funder');
    expect(container.textContent).not.toContain('Test customer');
    await click('Unlinked contacts (1)');
    expect(container.textContent).toContain('Unlinked person');
  });
  it('nests editable contacts and opportunities under their company, including zero amounts', async () => {
    await render('customer');
    expect(container.textContent).toContain('Company contacts');
    expect(container.textContent).toContain('Test contact');
    expect(container.querySelector('a[href="mailto:contact@example.org"]')).not.toBeNull();
    await click('Add contact');
    expect(mock.onAdd).toHaveBeenCalledWith('contact', 'customer');
    await click('Deals');
    expect(container.textContent).toContain('Test opportunity');
    expect(container.textContent).toContain('USD 0.00');
    await click('Add opportunity');
    expect(mock.onAdd).toHaveBeenCalledWith('deal', 'customer');
  });
  it('selects the matching relationship tab when opening a funder deep link', async () => {
    await render('funder');
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Funders');
    expect(container.textContent).toContain('Funding opportunities');
  });
  it('opens unlinked contacts from search without requiring a company', async () => {
    await render(null, 'orphan');
    expect(container.textContent).toContain('Unlinked person');
    expect(container.querySelector('article.ring-2')?.textContent).toContain('Unlinked person');
  });
});
