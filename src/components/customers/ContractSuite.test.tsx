// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractSuite } from './ContractSuite';

const mock = vi.hoisted(() => ({ signingError: false }));
vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ currentUser: { id: 'me' }, users: [{ id: 'me', name: 'Flown signer' }] }),
}));
vi.mock('../../lib/useAppAccess', () => ({ useAppAccess: () => ({ canEdit: true }) }));
vi.mock('./ContractFieldEditor', () => ({ ContractFieldEditor: () => null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: async () => ({ data: { request: null }, error: mock.signingError ? new Error('Signing service unavailable') : null }) },
    from: (table: string) => {
      const rows = table === 'customer_contracts' ? [{
        id: 'contract', name: 'Sample agreement', status: 'pending_signature', contract_type: 'service',
        counterparty_name: 'Sample recipient', counterparty_email: 'recipient@example.org', counter_signer_id: 'me',
        owner_id: 'me', value: null, auto_renew: false,
      }] : table === 'customer_contract_files' ? [{
        id: 'pdf', file_name: 'agreement.pdf', mime_type: 'application/pdf', file_kind: 'original_pdf', version_number: 1,
      }] : [];
      const query = {
        select: () => query, order: () => query, eq: () => query, limit: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  },
}));

describe('contract workspace', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mock.signingError = false;
    history.replaceState({}, '', '/customers/contracts?contract=contract');
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); history.replaceState({}, '', '/'); });
  it('keeps recipient and PDF visible while secondary controls are collapsed', async () => {
    await act(async () => root.render(<ContractSuite />));
    expect(container.textContent).toContain('recipient@example.org');
    expect(container.textContent).toContain('agreement.pdf');
    expect(container.textContent).toContain('Mark signed');
    const disclosures = [...container.querySelectorAll('details')];
    expect(disclosures.map(details => details.querySelector('summary')?.textContent)).toEqual([
      'Contract overview', 'Contract details', 'Other document uploads', 'Contract activity',
    ]);
    expect(disclosures.every(details => !details.open)).toBe(true);
    const edit = [...container.querySelectorAll('button')].find(button => button.textContent === 'Edit details')!;
    await act(async () => edit.click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('input[type="email"]')?.closest('details')).toBeNull();
    expect(dialog.querySelector('input[type="date"]')?.closest('details')?.open).toBe(false);
  });
  it('surfaces signing failures without treating an unknown request as legacy', async () => {
    mock.signingError = true;
    await act(async () => root.render(<ContractSuite />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Signing status could not be loaded.');
    expect(container.textContent).not.toContain('Mark signed');
    expect(container.textContent).not.toContain('Legacy signing request.');
    const send = [...container.querySelectorAll('button')].find(button => button.textContent === 'Replace signing request')!;
    expect(send.disabled).toBe(true);
  });
  it('opens the list by default and lets staff return to it after selection', async () => {
    history.replaceState({}, '', '/customers/contracts');
    await act(async () => root.render(<ContractSuite />));
    expect(container.querySelector('h2')?.textContent).toBe('Select a contract');
    const select = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Sample agreement'))!;
    await act(async () => select.click());
    expect(container.querySelector('h2')?.textContent).toBe('Sample agreement');
    const back = container.querySelector<HTMLButtonElement>('[aria-label="Back to contracts"]')!;
    await act(async () => back.click());
    expect(container.querySelector('h2')?.textContent).toBe('Select a contract');
  });
});
