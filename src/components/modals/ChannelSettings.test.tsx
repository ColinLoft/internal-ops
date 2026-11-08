// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel } from '../../types';

const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), close: vi.fn(), role: 'member', open: true }));
vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    isCreateChannelOpen: mock.open, setIsCreateChannelOpen: mock.close, createChannel: mock.create, updateChannel: mock.update,
    currentUser: { id: 'me', systemRole: mock.role },
    users: [{ id: 'me', name: 'Morgan', avatar: '' }, { id: 'other', name: 'Riley', avatar: '' }],
  }),
}));
vi.mock('../../lib/supabase', () => ({ uploadAvatarToSupabase: vi.fn() }));
import { CreateChannelModal } from './CreateChannelModal';
import { EditChannelModal } from './EditChannelModal';

let root: Root;
let container: HTMLDivElement;
const channel: Channel = { id: 'channel', name: 'operations', description: 'Flight operations', type: 'standard', isPrivate: false, members: ['me'], postingRoles: ['admin', 'coordinator', 'member'], createdBy: 'creator', unreadCount: 0, category: 'General' };
const input = async (selector: string, value: string) => {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const click = async (text: string) => {
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === text || item.getAttribute('aria-label') === text)!;
  expect(button).toBeDefined();
  await act(async () => button.click());
};
const submit = async () => { await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks(); mock.create.mockReset(); mock.role = 'member'; mock.open = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('channel creation walkthrough', () => {
  it('collects name, privacy/members and posting permissions before saving', async () => {
    const onCreated = vi.fn();
    await act(async () => root.render(<CreateChannelModal onCreated={onCreated} />));
    await input('input', 'flight-operations');
    await input('textarea', 'Coordinate flight deployments');
    await submit();
    expect(mock.create).not.toHaveBeenCalled();
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[1].click());
    expect(container.querySelector('[aria-label="Channel members"] img')).toBeNull();
    expect(container.querySelector('[aria-label="Channel members"] [aria-hidden="true"]')?.textContent).toBe('M');
    await act(async () => container.querySelector<HTMLInputElement>('input[type=checkbox]:not(:disabled)')!.click());
    await submit();
    await input('select', 'leaders');
    await submit();
    expect(mock.create).toHaveBeenCalledWith({
      name: 'flight-operations', description: 'Coordinate flight deployments', type: 'announcement',
      isPrivate: true, memberIds: ['other'], postingRoles: ['admin', 'coordinator'],
    });
    expect(mock.close).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalledOnce();
  });
  it('retains drafts going back and removes selected members from public-channel payloads', async () => {
    await act(async () => root.render(<CreateChannelModal />));
    await input('input', 'team'); await submit();
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[1].click());
    await act(async () => container.querySelector<HTMLInputElement>('input[type=checkbox]:not(:disabled)')!.click());
    await click('Back');
    expect(container.querySelector('input')?.value).toBe('team');
    await submit();
    await act(async () => container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[0].click());
    await submit(); await submit();
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false, memberIds: [], type: 'standard', postingRoles: ['admin', 'coordinator', 'member'] }));
  });
  it('shows failures without closing or losing the channel draft', async () => {
    mock.create.mockRejectedValue(new Error('Permission denied'));
    await act(async () => root.render(<CreateChannelModal />));
    await input('input', 'team'); await submit(); await submit(); await submit();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Permission denied');
    expect(mock.close).not.toHaveBeenCalled();
    expect(container.textContent).toContain('team');
  });
  it('rejects a name that sanitizes to nothing and resets dismissed drafts', async () => {
    await act(async () => root.render(<CreateChannelModal />));
    await input('input', '###'); await submit();
    expect(container.querySelector('[role=alert]')?.textContent).toContain('letters or numbers');
    mock.open = false; await act(async () => root.render(<CreateChannelModal />));
    mock.open = true; await act(async () => root.render(<CreateChannelModal />));
    expect(container.querySelector('input')?.value).toBe('');
    expect(container.textContent).toContain('Name and description');
  });
});

describe('channel title settings permissions', () => {
  it('lets non-managers inspect settings without mutation controls', async () => {
    await act(async () => root.render(<EditChannelModal channel={channel} onClose={mock.close} />));
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    expect(container.textContent).not.toContain('Save changes');
    expect(container.textContent).not.toContain('Delete channel');
    await submit(); expect(mock.update).not.toHaveBeenCalled();
  });
  it('keeps manager changes functional', async () => {
    mock.role = 'admin';
    await act(async () => root.render(<EditChannelModal channel={channel} onClose={mock.close} />));
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
    await submit();
    expect(mock.update).toHaveBeenCalledWith('channel', expect.objectContaining({ name: 'operations', postingRoles: ['admin', 'coordinator', 'member'] }));
    expect(mock.close).toHaveBeenCalledOnce();
  });
});
