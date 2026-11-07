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
const edge = () => container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')!;
const rail = () => container.querySelector<HTMLElement>('aside')!;
const notifications = () => container.querySelector<HTMLButtonElement>('[data-onboarding-target="notifications-button"]')!;
const hoverEdge = async () => {
  await act(async () => edge().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
};
const leaveRail = async () => {
  await act(async () => rail().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
};

describe('hover navigation rail', () => {
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/home');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Sidebar onOpenBugReport={vi.fn()} />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('opens at the left edge without reserving page space and closes on leaving', async () => {
    expect(edge().getAttribute('aria-expanded')).toBe('false');
    expect(rail().classList.contains('fixed')).toBe(true);
    expect(rail().classList.contains('md:static')).toBe(false);
    await hoverEdge();
    expect(edge().getAttribute('aria-expanded')).toBe('true');
    await leaveRail();
    expect(edge().getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Quick Add');
    expect(container.textContent).not.toContain('Workspace assistant');
  });

  it('does not leave navigation open when the pointer skips past the edge', async () => {
    await hoverEdge();
    await act(async () => edge().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    expect(edge().getAttribute('aria-expanded')).toBe('false');
  });

  it('supports keyboard entry, Escape, and focus leaving the rail', async () => {
    await act(async () => edge().focus());
    expect(edge().getAttribute('aria-expanded')).toBe('true');
    await act(async () => rail().querySelector<HTMLButtonElement>('button')!.focus());
    await leaveRail();
    expect(edge().getAttribute('aria-expanded')).toBe('true');
    await act(async () => rail().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(edge().getAttribute('aria-expanded')).toBe('false');
    await act(async () => { edge().blur(); edge().focus(); });
    const outside = document.createElement('button');
    container.append(outside);
    await act(async () => outside.focus());
    expect(edge().getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals the rail when global search requests keyboard access', async () => {
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })));
    expect(edge().getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps notification actions and closes both popover and hover rail after navigation', async () => {
    await hoverEdge();
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
    expect(edge().getAttribute('aria-expanded')).toBe('false');
  });

  it('dismisses notifications outside and on Escape and hides them when the rail closes', async () => {
    await hoverEdge();
    await act(async () => notifications().click());
    await act(async () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => notifications().click());
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => notifications().click());
    await leaveRail();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('retains mobile navigation and reveals notification and bug report tour targets', async () => {
    await act(async () => root.render(<Sidebar isMobileOpen onOpenBugReport={vi.fn()} />));
    expect(rail().classList.contains('visible')).toBe(true);
    expect(rail().classList.contains('translate-x-0')).toBe(true);
    await act(async () => window.dispatchEvent(new Event('flown-onboarding-target-notifications')));
    expect(edge().getAttribute('aria-expanded')).toBe('true');
    await act(async () => window.dispatchEvent(new Event('flown-onboarding-tour-finished')));
    expect(edge().getAttribute('aria-expanded')).toBe('false');
    await act(async () => window.dispatchEvent(new Event('flown-onboarding-target-bug-report')));
    expect(edge().getAttribute('aria-expanded')).toBe('true');
  });
});
