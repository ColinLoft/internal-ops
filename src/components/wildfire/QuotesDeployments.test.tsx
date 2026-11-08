// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, rpc: vi.fn(), invoke: vi.fn(), update: vi.fn() }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'staff' }, users: [] }) }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh(load: () => Promise<void>) { useEffect(() => { void load(); }, [load]); } }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mock.rpc, functions: { invoke: mock.invoke },
    from: (table: string) => {
      const chain = { select: () => chain, order: () => chain, limit: () => chain, eq: () => chain, update: (value: unknown) => { mock.update(table, value); return chain; }, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: mock.rows[table] ?? [], error: null }).then(resolve) };
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
});
