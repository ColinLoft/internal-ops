// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  messages: undefined as undefined | Promise<{ data: unknown[]; error: null }>,
  authChange: undefined as undefined | ((event: string, session: unknown) => void),
  queried: [] as string[],
  channels: [{ id: 'chan-announcements', name: 'Announcements', type: 'announcement' }] as unknown[],
  preferences: {} as unknown,
  session: { user: { id: 'staff', email: 'staff@example.test', app_metadata: {}, user_metadata: { name: 'Staff', onboarding_completed: true } } },
}));
vi.mock('../lib/sound', () => ({ sounds: { setRingtone: vi.fn(), setSoundEnabled: vi.fn(), stopAll: vi.fn(), playNotification: vi.fn() } }));
vi.mock('../lib/useAppAccess', () => ({ preloadAppAccess: vi.fn(async () => ({})), resetAppAccessCache: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  testSupabaseConnection: vi.fn(async () => ({ success: true })),
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mock.session }, error: null }),
      onAuthStateChange: (callback: typeof mock.authChange) => { mock.authChange = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
    },
    rpc: async () => ({ data: [], error: null }),
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(async () => {}),
    from: (table: string) => {
      mock.queried.push(table);
      const profile = { id: 'staff', name: 'Staff', email: 'staff@example.test', account_status: 'active', preferences: mock.preferences, last_seen_at: new Date().toISOString() };
      let single = false;
      const result = () => table === 'messages' ? mock.messages! : Promise.resolve({
        data: table === 'profiles' ? single ? profile : [profile] : table === 'channels' ? mock.channels : [],
        error: null,
      });
      const query = {
        select: () => query, eq: () => query, in: () => query, contains: () => query,
        gte: () => query, order: () => query, limit: () => query, update: () => query,
        maybeSingle: () => { single = true; return query; },
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
      };
      return query;
    },
  },
}));
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';

describe('workspace session loading', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mock.queried = [];
    mock.channels = [{ id: 'chan-announcements', name: 'Announcements', type: 'announcement' }];
    mock.preferences = {};
    localStorage.clear();
    window.history.replaceState({}, '', '/programs/tasks');
  });
  it('opens the requested screen before history resolves, and token refresh does not restart hydration', async () => {
    let finish!: (value: { data: unknown[]; error: null }) => void;
    mock.messages = new Promise(resolve => { finish = resolve; });
    let snapshot!: ReturnType<typeof useWorkspace>;
    function Probe() { snapshot = useWorkspace(); return <div>{snapshot.isAuthLoading ? 'Restoring session' : snapshot.activeTab}</div>; }
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<WorkspaceProvider><Probe /></WorkspaceProvider>));
      expect(snapshot.isAuthenticated).toBe(true);
      expect(snapshot.isAuthLoading).toBe(false);
      expect(snapshot.isWorkspaceLoading).toBe(true);
      expect(container.textContent).toBe('programs');
      expect(mock.queried).toContain('messages');
      const requests = mock.queried.filter(table => table === 'channels').length;
      await act(async () => {
        mock.authChange?.('TOKEN_REFRESHED', mock.session);
        await new Promise(resolve => window.setTimeout(resolve, 5));
      });
      await act(async () => finish({ data: [], error: null }));
      expect(snapshot.isWorkspaceLoading).toBe(false);
      expect(mock.queried.filter(table => table === 'channels')).toHaveLength(requests);
      expect(snapshot.workspaceLoadError).toBe('');
    } finally { await act(async () => root.unmount()); container.remove(); window.history.replaceState({}, '', '/'); }
  });
  it.each([null, [], 'invalid', { ringtone: 'chime', fontSize: 'large' }])('loads an empty workspace without seeding channels, with preferences %j', async (preferences) => {
    mock.channels = [];
    mock.preferences = preferences;
    mock.messages = Promise.resolve({ data: [], error: null });
    let snapshot!: ReturnType<typeof useWorkspace>;
    function Probe() { snapshot = useWorkspace(); return null; }
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => root.render(<WorkspaceProvider><Probe /></WorkspaceProvider>));
      expect(snapshot.isWorkspaceLoading).toBe(false);
      expect(snapshot.workspaceLoadError).toBe('');
      expect(snapshot.channels).toEqual([]);
      expect(mock.queried.filter(table => table === 'channels')).toHaveLength(1);
      expect(snapshot.workspaceSettings.ringtone).toBe(preferences && !Array.isArray(preferences) && typeof preferences === 'object' ? 'chime' : 'classic');
      expect(snapshot.workspaceSettings.fontSize).toBe(preferences && !Array.isArray(preferences) && typeof preferences === 'object' ? 'large' : 'default');
    } finally { await act(async () => root.unmount()); }
  });
});
