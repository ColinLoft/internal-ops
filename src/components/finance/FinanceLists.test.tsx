// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProspectsPage } from './ProspectsPage';
import { ResourcesPage } from './ResourcesPage';
import { GrantsPage } from './GrantsPage';
import { money } from './grantShared';

const mock = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, error: null as { message: string } | null }));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'me', systemRole: 'admin' }, users: [] }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => {
    const result = () => ({ data: mock.rows[table] ?? [], error: mock.error });
    const q = { select: () => q, order: () => q, range: () => q, limit: () => q, in: () => q, not: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (resolve: (value: unknown) => void) => resolve(result()) };
    return q;
  } },
}));

describe('quieter funding lists', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    mock.rows = {}; mock.error = null;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  const search = async (label: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  it('distinguishes zero, one-sided ranges, and missing opportunity amounts', async () => {
    mock.rows.grant_prospects = [
      { id: 'zero', name: 'Zero program', status: 'new', amount_min: 0, amount_max: 0 },
      { id: 'max', name: 'Maximum program', status: 'new', amount_min: null, amount_max: 5000 },
      { id: 'min', name: 'Minimum program', status: 'new', amount_min: 500, amount_max: null },
      { id: 'none', name: 'Unknown program', status: 'new', amount_min: null, amount_max: null },
    ];
    await act(async () => root.render(<ProspectsPage />));
    expect(container.textContent).toContain(`${money(0)} – ${money(0)}`);
    expect(container.textContent).toContain(`Up to ${money(5000)}`);
    expect(container.textContent).toContain(`From ${money(500)}`);
    expect(container.textContent).toContain('Amount not listed');
    expect(container.textContent).not.toContain('% fit');
    await search('Search opportunities', 'Maximum');
    expect(container.textContent).toContain('1 opportunity');
    expect(container.textContent).not.toContain('Zero program');
  });
  it('keeps resources readable and distinguishes filtered-empty from an empty library', async () => {
    mock.rows.grant_resources = [{ id: 'resource', title: 'Eligibility checklist', category: 'guide', tags: [], body: 'Confirm eligibility.' }];
    await act(async () => root.render(<ResourcesPage />));
    expect(container.textContent).toContain('Eligibility checklist');
    const summary = [...container.querySelectorAll('summary')].find(item => item.textContent === 'Organization summary')!;
    expect(summary.parentElement?.hasAttribute('open')).toBe(false);
    await search('Search resources', 'missing');
    expect(container.textContent).toContain('No resources match.');
  });
  it('does not present a failed resource load as an empty library', async () => {
    mock.error = { message: 'Database unavailable' };
    await act(async () => root.render(<ResourcesPage />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('workspace update');
    expect(container.textContent).not.toContain('No resources yet.');
  });
  it('retains grant import, export, and checklist actions under a closed Tools menu', async () => {
    await act(async () => root.render(<GrantsPage />));
    const tools = [...container.querySelectorAll('summary')].find(item => item.textContent === 'Tools')!;
    expect(tools.parentElement?.hasAttribute('open')).toBe(false);
    expect(tools.parentElement?.textContent).toContain('Import grants');
    expect(tools.parentElement?.textContent).toContain('Export CSV');
    expect(tools.parentElement?.textContent).toContain('Award checklist');
    expect(container.textContent).not.toContain('Upcoming deadlines');
    expect(container.textContent).toContain('0 grants');
  });
});
