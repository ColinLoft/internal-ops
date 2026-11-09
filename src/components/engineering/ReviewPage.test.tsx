// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ insert: vi.fn(async () => ({ error: null })) }));
vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ currentUser: { id: 'admin', systemRole: 'admin' }, users: [{ id: 'reviewer', name: 'Test reviewer', accountStatus: 'active' }] }),
}));
vi.mock('./ProjectDetail', () => ({ openEngFile: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => {
    const query = { select: () => query, order: () => query, insert: mock.insert, then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) };
    return query;
  } },
}));
import { ReviewPage } from './ReviewPage';

describe('review controls', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it('keeps the picker mounted as focus moves from the trigger to its options', async () => {
    await act(async () => root.render(<ReviewPage reviewId={null} />));
    const addButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Add reviewer')!;
    await act(async () => addButton.click());
    const picker = container.querySelector<HTMLButtonElement>('button[aria-label^="Add "][aria-haspopup]')!;
    await act(async () => picker.click());
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    const option = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((button) => button.textContent?.includes('Test reviewer'))!;
    await act(async () => option.focus());
    expect(container.contains(picker)).toBe(true);
    await act(async () => option.click());
    expect(mock.insert).toHaveBeenCalledWith({ user_id: 'reviewer', discipline: 'software' });
  });

  it('uses a styled pressed button for Waiting for me', async () => {
    await act(async () => root.render(<ReviewPage reviewId={null} />));
    const toggle = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.startsWith('Waiting for me'))!;
    expect(toggle.classList.contains('workspace-control')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
