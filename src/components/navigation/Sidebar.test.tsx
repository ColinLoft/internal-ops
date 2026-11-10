// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  setActiveTab: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  setActiveConversationId: vi.fn(),
}));
vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    ...mock,
    activeTab: 'home',
    conversations: [],
    currentUser: { id: 'test-staff', name: 'Test staff', role: 'Staff', avatar: '/brand-icon.png', status: 'online' },
    logout: vi.fn(),
    unreadNotificationCount: 2,
    notifications: [{ id: 'notice-1', title: 'Team update', description: 'New message', timestamp: 'Now', type: 'message', isRead: false, linkTab: 'messages', targetId: 'chat-1' }],
  }),
}));
vi.mock('../../lib/useAppAccess', () => ({ useAllAppAccess: () => null }));
vi.mock('./GlobalSearch', () => ({
  GlobalSearch: ({ onRequestOpen }: { onRequestOpen: () => void }) => {
    React.useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
        if (event.ctrlKey && event.key === 'k') onRequestOpen();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onRequestOpen]);
    return <button>Search workspace</button>;
  },
}));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain, gt: () => chain, eq: () => chain,
        limit: async () => ({ data: [], error: null }),
        neq: async () => ({ count: 0, error: null }),
      };
      return chain;
    },
  },
}));
import { Sidebar } from './Sidebar';

let container: HTMLDivElement;
let root: Root;
const rail = () => container.querySelector<HTMLElement>('aside')!;
const notifications = () => container.querySelector<HTMLButtonElement>('[data-onboarding-target="notifications-button"]')!;

describe('permanent desktop navigation rail', () => {
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/home');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Sidebar />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('reserves a smaller, always-visible desktop rail without open or close controls', () => {
    expect(rail().classList.contains('md:static')).toBe(true);
    expect(rail().classList.contains('md:w-56')).toBe(true);
    expect(rail().classList.contains('md:visible')).toBe(true);
    expect(rail().classList.contains('md:translate-x-0')).toBe(true);
    expect(container.querySelector('[aria-label="Open navigation"]')).toBeNull();
    expect(container.querySelector('[aria-label="Close navigation"]')).toBeNull();
    expect(container.textContent).not.toContain('Quick Add');
    expect(container.textContent).not.toContain('Workspace assistant');
    expect(container.querySelector('[data-onboarding-target="bug-report-button"]')).toBeNull();
    expect(container.textContent).not.toContain('Bug report');
    const logo = container.querySelector('img[alt="Flown"]')!;
    expect(logo.classList.contains('h-11')).toBe(true);
    expect(logo.getAttribute('src')).toBe('/flown-logo.png');
    expect(logo.classList.contains('brightness-0')).toBe(true);
    expect(logo.classList.contains('invert')).toBe(true);
    expect(container.textContent).not.toContain('Flown Systems');
    expect(logo.parentElement?.textContent).not.toContain('Ops');
  });

  it('stays visible after Escape, leaving, navigation, and finishing onboarding', async () => {
    const classes = rail().className;
    await act(async () => rail().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await act(async () => rail().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    await act(async () => {
      window.history.pushState({}, '', '/messages');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.dispatchEvent(new Event('flown-onboarding-tour-finished'));
    });
    expect(rail().className).toBe(classes);
  });

  it('opens the mobile menu for the global search shortcut only on phones', async () => {
    const onOpenMobile = vi.fn();
    await act(async () => root.render(<Sidebar onOpenMobile={onOpenMobile} />));
    vi.stubGlobal('innerWidth', 1440);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })));
    expect(onOpenMobile).not.toHaveBeenCalled();
    vi.stubGlobal('innerWidth', 390);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })));
    expect(onOpenMobile).toHaveBeenCalledOnce();
  });

  it('keeps notification actions and dismisses the popover after navigation', async () => {
    expect(notifications().getAttribute('aria-label')).toBe('Notifications, 2 unread');
    await act(async () => notifications().click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const markAll = dialog.querySelector<HTMLButtonElement>('[aria-label="Mark all as read"]')!;
    await act(async () => markAll.click());
    expect(mock.markAllNotificationsRead).toHaveBeenCalledOnce();
    const message = [...dialog.querySelectorAll('button')].find(button => button.textContent?.includes('Team update'))!;
    await act(async () => message.click());
    expect(mock.markNotificationRead).toHaveBeenCalledWith('notice-1');
    expect(mock.setActiveTab).toHaveBeenCalledWith('messages');
    expect(mock.setActiveConversationId).toHaveBeenCalledWith('chat-1');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      window.history.pushState({}, '', '/messages');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(rail().classList.contains('md:visible')).toBe(true);
  });

  it('dismisses notifications outside and on Escape without closing the rail', async () => {
    await act(async () => notifications().click());
    await act(async () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => notifications().click());
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(rail().classList.contains('md:visible')).toBe(true);
  });

  it('retains the mobile drawer and hides its notifications when closed', async () => {
    vi.stubGlobal('innerWidth', 390);
    await act(async () => root.render(<Sidebar isMobileOpen />));
    expect(rail().classList.contains('visible')).toBe(true);
    expect(rail().classList.contains('translate-x-0')).toBe(true);
    await act(async () => notifications().click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => root.render(<Sidebar />));
    expect(rail().classList.contains('invisible')).toBe(true);
    expect(rail().classList.contains('md:visible')).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
