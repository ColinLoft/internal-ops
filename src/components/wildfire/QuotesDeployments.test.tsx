// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, rpc: vi.fn(), invoke: vi.fn(), update: vi.fn(), save: vi.fn(), celebrate: vi.fn() }));
vi.mock('../../lib/milestones', () => ({ celebrateMilestone: mock.celebrate }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'staff' }, users: [] }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh(load: () => Promise<void>) { useEffect(() => { void load(); }, [load]); } }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mock.rpc, functions: { invoke: mock.invoke },
    from: (table: string) => {
      const chain = { select: () => chain, single: mock.save, order: () => chain, limit: () => chain, eq: () => chain, update: (value: unknown) => { mock.update(table, value); return chain; }, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: mock.rows[table] ?? [], error: null }).then(resolve) };
      return chain;
    },
  },
}));
import { Quotes } from './Quotes';
import { Deployments } from './Deployments';
let container: HTMLDivElement;
let root: Root;
const click = async (name: string) => {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === name);
  expect(button).toBeDefined();
  await act(async () => button!.click());
};
describe('quote and deployment controls', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    mock.rows = {
      wildfire_quotes: [{ id: 'quote', opportunity_id: 'prospect', site_plan_id: 'plan', version: 1, status: 'draft', currency: 'USD', discount: 0, tax: 10, expires_at: '2027-01-01', terms: 'Terms', proposal: 'Installation scope', snapshot: null }],
      wildfire_quote_lines: [{ id: 'line', quote_id: 'quote', product_id: null, description: 'Equipment', quantity: 2, unit_price: 100, recurring: false }],
    };
    mock.rpc.mockResolvedValue({ data: 'new-version', error: null });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  it('reports empty quotes instead of rendering a dead disabled signing button', async () => {
    mock.rows.wildfire_quote_lines = [];
    await renderQuotes();
    await click('Create customer signing link');
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('at least one priced line');
  });
  it('prefills catalog product price when adding a line', async () => {
    await act(async () => root.render(<Quotes opportunities={[]} products={[{ id: 'sensor', name: 'Sensor', status: 'active', list_price: 499 } as import('./model').Product]} selectedId="quote" canEdit />));
    await click('Edit draft');
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>('[aria-label="Add catalog product"]')!;
      select.value = 'sensor'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector<HTMLInputElement>('[aria-label="Unit price 2"]')?.value).toBe('499');
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const renderQuotes = async (canEdit = true) => { await act(async () => root.render(<Quotes opportunities={[]} products={[]} selectedId="quote" canEdit={canEdit} />)); };
  it('saves proposal, terms and all line values through the atomic quote RPC', async () => {
    await renderQuotes();
    await click('Edit draft');
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.rpc).toHaveBeenCalledWith('wildfire_save_quote', expect.objectContaining({ p_quote_id: 'quote', p_terms: 'Terms', p_proposal: 'Installation scope', p_lines: [{ product_id: null, description: 'Equipment', quantity: 2, unit_price: 100, recurring: false }] }));
    expect(container.textContent).toContain('Quote draft saved.');
  });
  it('publishes a customer link but has no staff acceptance button', async () => {
    mock.invoke.mockResolvedValue({ data: { url: 'https://flown.test/wildfire-quote?token=secret', expiresAt: '2027-01-01' }, error: null });
    await renderQuotes();
    await click('Create customer signing link');
    expect(mock.invoke).toHaveBeenCalledWith('wildfire-quotes', { body: { action: 'publish', quoteId: 'quote' } });
    expect(container.textContent).toContain('Share it directly with the intended customer.');
    expect(container.querySelector('a[href*="test=1"]')).not.toBeNull();
    expect([...container.querySelectorAll('button')].some(button => /mark accepted/i.test(button.textContent || ''))).toBe(false);
  });
  it('creates revised versions without editing a published contract', async () => {
    mock.rows.wildfire_quotes = [{ ...mock.rows.wildfire_quotes[0] as object, status: 'sent' }];
    await renderQuotes();
    expect(container.querySelector('input[aria-label="Description 1"]')?.hasAttribute('disabled')).toBe(true);
    await click('New version');
    expect(mock.rpc).toHaveBeenCalledWith('wildfire_clone_quote', { p_quote_id: 'quote' });
  });
  it('revokes published signing links with an authenticated function action', async () => {
    mock.rows.wildfire_quotes = [{ ...mock.rows.wildfire_quotes[0] as object, status: 'sent' }];
    mock.invoke.mockResolvedValue({ data: { status: 'revoked' }, error: null });
    await renderQuotes();
    await click('Revoke signing link');
    expect(mock.invoke).toHaveBeenCalledWith('wildfire-quotes', { body: { action: 'revoke', quoteId: 'quote' } });
    expect(container.textContent).toContain('Customer signing links revoked.');
  });
  it('read-only users cannot edit, publish or clone quotes', async () => {
    await renderQuotes(false);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
  it('connects delivery back to the exact accepted quote and has no manual create action', async () => {
    mock.rows.wildfire_deployments = [{ id: 'deployment', quote_id: 'accepted-quote', organization_id: 'company', property_id: 'site', status: 'contract_executed', scheduled_at: null, completed_at: null, notes: '' }];
    const onQuote = vi.fn();
    await act(async () => root.render(<Deployments properties={[]} organizations={[]} canEdit={false} onQuote={onQuote} />));
    await click('View accepted quote and proposal');
    expect(onQuote).toHaveBeenCalledWith('accepted-quote');
    expect([...container.querySelectorAll('button')].some(button => /create deployment/i.test(button.textContent || ''))).toBe(false);
  });
  it('creates a manual deployment through its validated RPC without claiming quote acceptance', async () => {
    await act(async () => root.render(<Deployments properties={[{ id: 'site', label: 'Site', organization_id: 'company' } as import('./model').Property]} organizations={[{ id: 'company', name: 'Customer', category: 'business' }]} canEdit onQuote={vi.fn()} />));
    const form = container.querySelector('details form')!;
    await act(async () => {
      const select = form.querySelector('select')!;
      select.value = 'site'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mock.rpc).toHaveBeenCalledWith('wildfire_create_manual_deployment', { p_property_id: 'site', p_organization_id: 'company', p_notes: '' });
  });
  it.each([true, false])('celebrates deployment completion only with confirmed persistence (success=%s)', async (success) => {
    mock.rows.wildfire_deployments = [{ id: 'deployment', quote_id: 'accepted-quote', organization_id: 'company', property_id: 'site', status: 'handoff', scheduled_at: null, completed_at: null, notes: '' }];
    let finish!: (result: unknown) => void;
    mock.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(<Deployments properties={[]} organizations={[]} canEdit onQuote={vi.fn()} />));
    expect(mock.celebrate).not.toHaveBeenCalled();
    const stage = [...container.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'handoff'))!;
    await act(async () => {
      stage.value = 'completed';
      stage.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(mock.update).toHaveBeenCalledWith('wildfire_deployments', expect.objectContaining({ status: 'completed', completed_at: expect.any(String) }));
    expect(mock.celebrate).not.toHaveBeenCalled();
    await act(async () => { finish(success ? { data: { status: 'completed' }, error: null } : { data: null, error: { message: 'Permission denied' } }); });
    if (success) expect(mock.celebrate).toHaveBeenCalledExactlyOnceWith('deployment', 'deployment', 'handoff', 'completed');
    else {
      expect(mock.celebrate).not.toHaveBeenCalled();
      expect(container.querySelector('[role=alert]')?.textContent).toContain('Permission denied');
    }
  });
});
