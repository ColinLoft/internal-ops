// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormsPage } from './FormsPage';

vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentUser: { id: 'me', email: 'staff@example.org' }, isAuthenticated: true }) }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => {
    const data = table === 'company_forms' ? [
      { id: 'one', owner_id: 'me', name: 'Partner enquiry', content: { title: 'Partner enquiry', questions: [{ id: 'name', type: 'short_text', label: 'Your name', required: true, options: [] }] } },
      { id: 'two', owner_id: 'me', name: 'Event enquiry', content: { title: 'Event enquiry', questions: [{ id: 'email', type: 'email', label: 'Your email', options: [] }] } },
    ] : [];
    const q = { select: () => q, is: () => q, order: () => q, then: (resolve: (value: unknown) => void) => resolve({ data, error: null }) };
    return q;
  } },
}));

describe('simplified form builder', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it('keeps Required accessible while collapsing advanced question settings', async () => {
    await act(async () => root.render(<FormsPage />));
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    const advanced = [...container.querySelectorAll('summary')].find(item => item.textContent === 'Help text, validation & conditions');
    expect(advanced).toBeDefined();
    expect(advanced?.parentElement?.hasAttribute('open')).toBe(false);
    expect(container.querySelector('[aria-label="Choose form"]')).not.toBeNull();
  });
  it('shows the same Flown branding and website in the public-form preview', async () => {
    await act(async () => root.render(<FormsPage />));
    const preview = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(item => item.textContent === 'Preview')!;
    await act(async () => preview.click());
    expect(container.querySelector('img[alt="Flown"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://flown.org"]')).not.toBeNull();
    expect(container.textContent).toContain('Your name');
  });
});
