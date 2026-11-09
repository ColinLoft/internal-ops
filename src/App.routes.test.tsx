// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ isAuthenticated: false, isAuthLoading: true }));
vi.mock('./context/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWorkspace: () => ({ ...session, activeTab: 'home', currentUser: { id: 'staff' }, callSession: { active: false } }),
}));
vi.mock('./components/navigation/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./components/navigation/MobileTabBar', () => ({ MobileTabBar: () => null }));
vi.mock('./components/home/HomePage', () => ({ HomePage: () => <main>Home dashboard</main> }));
vi.mock('./components/programs/ProgramsPage', () => ({ ProgramsPage: () => <main>Tasks list</main> }));
vi.mock('./components/profile/ProfileModal', () => ({ ProfileModal: () => null }));
vi.mock('./components/profile/EditProfileModal', () => ({ EditProfileModal: () => null }));
vi.mock('./components/common/ShortcutsHelp', () => ({ ShortcutsHelp: () => null }));
vi.mock('./components/modals/CreateChannelModal', () => ({ CreateChannelModal: () => null }));
vi.mock('./components/modals/CreatePollModal', () => ({ CreatePollModal: () => null }));
vi.mock('./components/modals/NewMessageModal', () => ({ NewMessageModal: () => null }));
vi.mock('./components/modals/AddEventModal', () => ({ AddEventModal: () => null }));
vi.mock('./components/modals/AddTeammateModal', () => ({ AddTeammateModal: () => null }));
vi.mock('./components/modals/InviteReadyModal', () => ({ InviteReadyModal: () => null }));
vi.mock('./components/organization/PolicySigning', () => ({ PendingDocumentPrompt: () => null }));
vi.mock('./hooks/useOverlayA11y', () => ({ useOverlayA11y: () => undefined }));
vi.mock('./components/forms/PublicFormPage', () => ({
  PublicFormPage: ({ token }: { token: string }) => <main>Public form: {token}</main>,
}));
vi.mock('./components/customers/PublicContractSigning', () => ({
  PublicContractSigning: ({ token }: { token: string }) => <main>Public signature: {token}</main>,
}));
vi.mock('./components/wildfire/PublicQuoteAcceptance', () => ({
  PublicQuoteAcceptance: ({ token }: { token: string }) => <main>Public quote: {token}</main>,
}));

import { App } from './App';

afterEach(() => {
  window.history.replaceState({}, '', '/');
  session.isAuthenticated = false;
  session.isAuthLoading = true;
});

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
  it.each(['/tasks', '/programs/tasks'])('hard-loading %s renders Tasks even when context initially says Home', async (path) => {
    session.isAuthenticated = true;
    session.isAuthLoading = false;
    const view = await renderAt(path);
    expect(view.container.textContent).toContain('Tasks list');
    expect(view.container.textContent).not.toContain('Home dashboard');
    expect(window.location.pathname).toBe('/programs/tasks');
    await view.cleanup();
  });

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
  it('opens public quote acceptance before loading or authenticating staff', async () => {
    const view = await renderAt('/wildfire-quote?token=public-quote-token');
    expect(view.container.textContent).toBe('Public quote: public-quote-token');
    await view.cleanup();
  });

  it('redirects legacy form IDs to private migrated forms, not public responders', async () => {
    const view = await renderAt('/forms/legacy-id');
    expect(window.location.pathname).toBe('/company/forms');
    expect(window.location.search).toBe('?form=legacy-id');
    expect(view.container.textContent).not.toContain('Public form');
    await view.cleanup();
  });

  it('shows a normal 404 for the retired Automation route with no bug-report action', async () => {
    window.history.replaceState({}, '', '/company/automation');
    const { NotFoundPage } = await import('./components/NotFoundPage');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<NotFoundPage onGoHome={() => undefined} />); });
    expect(container.textContent).toContain('Page not found');
    expect(container.textContent).toContain('Go to Home');
    expect(container.textContent).not.toMatch(/bug|report|shared email rules/i);
    expect(container.querySelectorAll('button')).toHaveLength(2);
    await act(async () => { root.unmount(); });
    container.remove();
  });
});
