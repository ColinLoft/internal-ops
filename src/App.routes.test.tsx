// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./context/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWorkspace: () => ({ isAuthenticated: false, isAuthLoading: true, activeTab: 'home' }),
}));
vi.mock('./hooks/useOverlayA11y', () => ({ useOverlayA11y: () => undefined }));
vi.mock('./components/forms/PublicFormPage', () => ({
  PublicFormPage: ({ token }: { token: string }) => <main>Public form: {token}</main>,
}));
vi.mock('./components/customers/PublicContractSigning', () => ({
  PublicContractSigning: ({ token }: { token: string }) => <main>Public signature: {token}</main>,
}));

import { App } from './App';

afterEach(() => window.history.replaceState({}, '', '/'));

describe('public workspace routes', () => {
  async function renderAt(path: string) {
    window.history.replaceState({}, '', path);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<App />); });
    return {
      container,
      cleanup: async () => {
        await act(async () => { root.unmount(); });
        container.remove();
      },
    };
  }

  it('opens public forms before session loading and authentication', async () => {
    const view = await renderAt('/company/forms/respond/random-public-token');
    expect(view.container.textContent).toBe('Public form: random-public-token');
    await view.cleanup();
  });

  it('opens customer signing links without requiring a staff login', async () => {
    const view = await renderAt('/contract-signature?token=random-signing-token');
    expect(view.container.textContent).toBe('Public signature: random-signing-token');
    await view.cleanup();
  });

  it('redirects legacy form IDs to private migrated forms, not public responders', async () => {
    const view = await renderAt('/forms/legacy-id');
    expect(window.location.pathname).toBe('/company/forms');
    expect(window.location.search).toBe('?form=legacy-id');
    expect(view.container.textContent).not.toContain('Public form');
    await view.cleanup();
  });
});
