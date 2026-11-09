// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mock.rpc } }));
import { preloadAppAccess, resetAppAccessCache, useAppAccess } from './useAppAccess';

function Access() {
  const access = useAppAccess('wildfire');
  return <><p>{access.error || (access.loaded ? `Level ${access.level}` : 'Loading')}</p><button onClick={access.retry}>Retry</button></>;
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.rpc.mockReset();
  resetAppAccessCache();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('workspace access caching', () => {
  it('reuses preloaded permissions without another request on revisits', async () => {
    mock.rpc.mockResolvedValue({ data: { wildfire: 2 }, error: null });
    await preloadAppAccess();
    await act(async () => root.render(<Access />));
    expect(container.textContent).toContain('Level 2');
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Access key="revisit" />));
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it('reports invalid permissions and permits a successful retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mock.rpc.mockResolvedValueOnce({ data: { wildfire: 'manage' }, error: null });
    await act(async () => root.render(<Access />));
    expect(container.textContent).toContain('Workspace permissions could not be loaded');
    mock.rpc.mockResolvedValue({ data: { wildfire: 1 }, error: null });
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('Level 1');
  });
  it('does not reuse permissions that resolve after signing out', async () => {
    let finish!: (value: unknown) => void;
    mock.rpc.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const first = preloadAppAccess();
    resetAppAccessCache();
    mock.rpc.mockResolvedValue({ data: { wildfire: 0 }, error: null });
    const second = preloadAppAccess();
    finish({ data: { wildfire: 3 }, error: null });
    expect(await second).toEqual({ wildfire: 0 });
    expect(await first).toEqual({ wildfire: 0 });
    await act(async () => root.render(<Access />));
    expect(container.textContent).toContain('Level 0');
  });
});
