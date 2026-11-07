// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicFormPage } from './PublicFormPage';

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ isAuthenticated: false }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: state.rpc },
}));

const publicForm = {
  publication_id: 'publication',
  access_scope: 'public',
  accepting_responses: true,
  schema: {
    title: 'Interest form',
    description: 'Tell us how to contact you.',
    questions: [
      { id: 'email', type: 'email', label: 'Email address', required: true, options: [] },
      { id: 'topic', type: 'dropdown', label: 'Topic', required: true, options: ['A', 'B'] },
    ],
  },
};

const setNativeValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
};

describe('public form responder', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    state.rpc.mockImplementation((name: string) => name === 'get_company_form'
      ? Promise.resolve({ data: publicForm, error: null })
      : Promise.resolve({ data: 'response-id', error: null }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(<PublicFormPage token="share-token" />);
      await Promise.resolve();
    });
  };

  it('loads the immutable published schema and blocks missing required answers', async () => {
    await render();
    expect(container.textContent).toContain('Interest form');
    expect(container.querySelector('#email')).not.toBeNull();

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('This question is required.');
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith('get_company_form', { p_share_token: 'share-token' });
  });

  it('submits the validated published answers and shows the confirmation', async () => {
    await render();
    const email = container.querySelector<HTMLInputElement>('#email')!;
    const topic = container.querySelector<HTMLSelectElement>('#topic')!;
    await act(async () => {
      setNativeValue(email, 'staff@example.org');
      email.dispatchEvent(new Event('input', { bubbles: true }));
      setNativeValue(topic, 'B');
      topic.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(state.rpc).toHaveBeenCalledWith('submit_company_form', expect.objectContaining({
      p_share_token: 'share-token',
      p_answers: { email: 'staff@example.org', topic: 'B' },
    }));
    expect(container.textContent).toContain('Response received');
  });

  it('shows server validation failures without losing answers', async () => {
    state.rpc.mockImplementation((name: string) => name === 'get_company_form'
      ? Promise.resolve({ data: publicForm, error: null })
      : Promise.resolve({ data: null, error: { message: 'This form is closed.' } }));
    await render();
    const email = container.querySelector<HTMLInputElement>('#email')!;
    const topic = container.querySelector<HTMLSelectElement>('#topic')!;
    await act(async () => {
      setNativeValue(email, 'staff@example.org');
      email.dispatchEvent(new Event('input', { bubbles: true }));
      setNativeValue(topic, 'A');
      topic.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('This form is no longer accepting responses.');
    expect(email.value).toBe('staff@example.org');
  });
});
