// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlookSettings } from './OutlookSettings';
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: mock.invoke } } }));
describe('Outlook settings', () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    history.replaceState({}, '', '/settings?section=email');
    mock.invoke.mockReset().mockResolvedValue({ data: { mailboxes: [] }, error: null });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); history.replaceState({}, '', '/'); });
  it('offers the team mailbox only and makes deferred grants explicit', async () => {
    await act(async () => root.render(<OutlookSettings />));
    expect(host.textContent).toContain('Connect Outlook');
    expect(host.textContent).toContain('grants@flown.org is deferred');
    expect(host.textContent).toContain('Existing inbox history is not imported');
  });
  it('exchanges the OAuth callback once and removes the code from the address bar', async () => {
    history.replaceState({}, '', '/?mail_oauth=callback&code=test-code&state=test-state');
    mock.invoke.mockImplementation(async (name: string) => ({ data: name === 'mail-connect' ? { success: true } : { mailboxes: [] }, error: null }));
    await act(async () => root.render(<React.StrictMode><OutlookSettings /></React.StrictMode>));
    expect(mock.invoke.mock.calls.filter(([name]) => name === 'mail-connect')).toEqual([
      ['mail-connect', { body: { action: 'exchange', code: 'test-code', state: 'test-state' } }],
    ]);
    expect(location.pathname + location.search).toBe('/settings?section=email');
  });
  it('does not exchange a declined authorization or claim success', async () => {
    history.replaceState({}, '', '/?mail_oauth=callback&error=access_denied');
    await act(async () => root.render(<OutlookSettings />));
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[role="status"]')).toBeNull();
  });
  it('does not label a legacy Google mailbox as connected to Microsoft', async () => {
    mock.invoke.mockResolvedValue({ data: { mailboxes: [{ email: 'team@flown.org', provider: 'google' }] }, error: null });
    await act(async () => root.render(<OutlookSettings />));
    expect(host.textContent).toContain('Not connected');
    expect(host.textContent).not.toContain('Connected to Microsoft 365');
  });
  it('reports catch-up instead of claiming an incomplete sync finished', async () => {
    mock.invoke.mockImplementation(async (_name, options) => ({
      data: options.body.action === 'sync-support' ? { pending: true } : { mailboxes: [{ email: 'team@flown.org', provider: 'microsoft', support_started_at: '2026-11-09T12:00:00Z' }] },
      error: null,
    }));
    await act(async () => root.render(<OutlookSettings />));
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Sync now')!.click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain('still in progress');
  });
});
