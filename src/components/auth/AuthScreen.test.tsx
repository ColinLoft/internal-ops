// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  backendIssue: '',
}));

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => auth,
}));

import { AuthScreen } from './AuthScreen';

describe('AuthScreen', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    auth.login.mockReset();
    auth.backendIssue = '';
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<AuthScreen />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function enterValue(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  async function submit() {
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('continues from email to password and signs in with the same credentials', async () => {
    auth.login.mockResolvedValue({ success: true });
    expect(container.querySelector('#flown-password')).toBeNull();
    await enterValue('#flown-email', 'staff@flown.org');
    await submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(container.textContent).toContain('staff@flown.org');
    expect(document.activeElement?.id).toBe('flown-password');
    await enterValue('#flown-password', 'invite-code');
    await submit();
    expect(auth.login).toHaveBeenCalledWith('staff@flown.org', 'invite-code');
  });

  it('shows sign-in errors and lets staff change the email without retaining the password', async () => {
    auth.login.mockResolvedValue({ success: false, message: 'Invalid login credentials' });
    await enterValue('#flown-email', 'staff@flown.org');
    await submit();
    await enterValue('#flown-password', 'wrong-password');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Change')!.click();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('#flown-email')?.value).toBe('staff@flown.org');
    await submit();
    expect(container.querySelector<HTMLInputElement>('#flown-password')?.value).toBe('');
  });

  it('displays backend errors and provides the support email', async () => {
    auth.backendIssue = 'Unable to connect';
    await act(async () => root.render(<AuthScreen />));
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('mailto:team@flown.org');
  });
});
