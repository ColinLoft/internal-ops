// @vitest-environment jsdom
import React, { useState } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveRefresh } from './useLiveRefresh';

const realtime = vi.hoisted(() => ({
  listeners: [] as (() => void)[],
  removeChannel: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: () => void) => {
          realtime.listeners.push(callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: realtime.removeChannel,
  },
}));

const roots: { root: Root; node: HTMLDivElement }[] = [];
async function mount(load: () => Promise<void>) {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  roots.push({ root, node });
  const View = () => { useLiveRefresh(load, ['company_ideas']); return null; };
  await act(async () => { root.render(<View />); });
  return node;
}
beforeEach(() => { vi.useFakeTimers(); realtime.listeners = []; vi.clearAllMocks(); });
afterEach(async () => {
  for (const { root, node } of roots.splice(0)) {
    await act(async () => root.unmount());
    node.remove();
  }
  vi.useRealTimers();
});

describe('live cross-user refresh', () => {
  it('updates two viewers on a database event without a page reload', async () => {
    let persistedTitle = 'First idea';
    const Viewer = () => {
      const [title, setTitle] = useState('');
      const load = React.useCallback(async () => { setTitle(persistedTitle); }, []);
      useLiveRefresh(load, ['company_ideas']);
      return <p>{title}</p>;
    };
    for (let i = 0; i < 2; i++) {
      const node = document.createElement('div');
      document.body.append(node);
      const root = createRoot(node);
      roots.push({ root, node });
      await act(async () => root.render(<Viewer />));
    }
    persistedTitle = 'Newly submitted idea';
    await act(async () => realtime.listeners.forEach((refresh) => refresh()));
    for (const { node } of roots) expect(node.textContent).toBe('Newly submitted idea');
  });

  it('polls and refreshes on focus when realtime delivery is unavailable', async () => {
    const load = vi.fn(async () => {});
    await mount(load);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('coalesces concurrent events and stops refreshing after unmount', async () => {
    let release: (() => void) | undefined;
    const load = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    await mount(load);
    await act(async () => { realtime.listeners[0](); realtime.listeners[0](); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => release?.());
    expect(load).toHaveBeenCalledTimes(2);
    const { root } = roots[0];
    await act(async () => root.unmount());
    await act(async () => { release?.(); realtime.listeners[0](); await vi.advanceTimersByTimeAsync(10000); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
  });
});
