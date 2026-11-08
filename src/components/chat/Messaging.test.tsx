// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types';
const mock = vi.hoisted(() => ({
  workspace: {} as Record<string, unknown>,
  send: vi.fn(), seen: vi.fn(), call: vi.fn(), profile: vi.fn(), reaction: vi.fn(), thread: vi.fn(), retry: vi.fn(), poll: vi.fn(),
}));
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => mock.workspace }));
vi.mock('../modals/EditChannelModal', () => ({ EditChannelModal: () => null }));
import { ChatFeed } from './ChatFeed';
import { MessageComposer } from './MessageComposer';
import { MessageBubble } from './MessageBubble';
import { MessageText } from './MessageText';

let root: Root;
let container: HTMLDivElement;
const message: Message = { id: 'message', conversationId: 'direct', senderId: 'staff', senderName: 'Morgan', senderAvatar: '', text: 'Welcome to Flown', timestamp: '9:00 AM', createdAt: new Date(2026, 10, 7, 9).toISOString(), seenBy: ['staff'], reactions: [], sendStatus: 'sent' };
const setText = async (value: string) => {
  const area = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mock.send.mockReset();
  mock.workspace = {
    activeTab: 'messages', activeConversationId: 'direct', activeChannelId: 'channel',
    conversations: [{ id: 'direct', type: 'direct', name: 'Team', participants: ['staff', 'other'] }],
    channels: [{ id: 'channel', name: 'announcements', type: 'announcement', members: ['staff'], postingRoles: ['admin'], createdBy: 'other' }],
    currentUser: { id: 'staff', name: 'Morgan', systemRole: 'member' },
    users: [{ id: 'staff', name: 'Morgan', avatar: '', status: 'online' }, { id: 'other', name: 'Riley', avatar: '', status: 'online' }],
    messages: { direct: [message, { ...message, id: 'continuation', text: 'Second line', createdAt: new Date(2026, 10, 7, 9, 1).toISOString() }, { ...message, id: 'reply', senderId: 'other', senderName: 'Riley', text: 'Thanks!' }], channel: [message] },
    sendMessage: mock.send, markMessagesSeen: mock.seen, startCall: mock.call, openUserProfile: mock.profile, toggleReaction: mock.reaction,
    openThread: mock.thread, retryMessage: mock.retry, votePoll: mock.poll, toggleRightDrawer: vi.fn(), setIsNewMessageOpen: vi.fn(), setIsCreatePollOpen: vi.fn(),
  };
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0; });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('compact messaging feed', () => {
  it('aligns everyone left and groups consecutive messages, preserving calls and threads', async () => {
    await act(async () => root.render(<ChatFeed />));
    const rows = container.querySelectorAll('[data-message-id]');
    expect(rows).toHaveLength(3);
    expect(rows[1].getAttribute('data-grouped')).toBe('true');
    expect(container.querySelectorAll('time')).toHaveLength(1);
    expect(container.querySelector('.flex-row-reverse')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Riley');
    await click('Start audio call');
    expect(mock.call).toHaveBeenCalledWith('audio', expect.objectContaining({ id: 'other' }), undefined);
    await click('Reply in thread');
    expect(mock.thread).toHaveBeenCalledWith('message');
  });
  it('keeps announcement permission messaging subtle without rendering a composer', async () => {
    mock.workspace.activeTab = 'channels';
    await act(async () => root.render(<ChatFeed />));
    expect(container.textContent).toContain("You don't have permission to post here.");
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelectorAll('time')).toHaveLength(1);
  });
  it('preserves retry and seen state without a chat bubble', async () => {
    await act(async () => root.render(<MessageBubble message={{ ...message, sendStatus: 'failed' }} isCurrentUser />));
    await click('Not sent · Retry');
    expect(mock.retry).toHaveBeenCalledWith('message');
    await act(async () => root.render(<MessageBubble message={{ ...message, seenBy: ['staff', 'other'] }} isCurrentUser />));
    expect(container.textContent).toContain('Seen by Riley');
  });
  it('keeps reaction selection interactive', async () => {
    await act(async () => root.render(<MessageBubble message={message} isCurrentUser />));
    await click("React to Morgan's message");
    await click('React 🎉');
    expect(mock.reaction).toHaveBeenCalledWith('message', '🎉', undefined);
    expect(container.querySelector('[aria-label="Choose reaction"]')).toBeNull();
  });
  it('exposes message actions through a compact mobile menu and dismisses with Escape', async () => {
    await act(async () => root.render(<MessageBubble message={message} isCurrentUser onOpenThread={mock.thread} />));
    await click("More actions for Morgan's message");
    expect(container.querySelector('[aria-label="More actions for Morgan\'s message"]')?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('[aria-label="More actions for Morgan\'s message"]')?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('always-visible formatting composer', () => {
  it('formats selected text, previews it and sends the persisted markdown', async () => {
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    expect(container.querySelector('[role=toolbar]')).not.toBeNull();
    await setText('Hello');
    container.querySelector('textarea')!.setSelectionRange(0, 5);
    await click('Bold');
    expect(container.querySelector('textarea')!.value).toBe('**Hello**');
    await click('Preview');
    expect(container.querySelector('strong')?.textContent).toBe('Hello');
    await click('Send message');
    expect(mock.send).toHaveBeenCalledWith('**Hello**', []);
    expect(container.querySelector('textarea')?.value).toBe('');
  });
  it('allows subsequent sends immediately while a prior request is pending', async () => {
    mock.send.mockImplementation(() => new Promise(() => {}));
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await setText('First'); await click('Send message');
    await setText('Second'); await click('Send message');
    expect(mock.send).toHaveBeenCalledTimes(2);
    expect(container.querySelector('textarea')!.value).toBe('');
  });
  it('shows failed sends and preserves synchronous failure drafts', async () => {
    mock.send.mockImplementation(() => { throw new Error('Connection lost'); });
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await setText('Keep my draft'); await click('Send message');
    expect(container.querySelector('textarea')!.value).toBe('Keep my draft');
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Connection lost');
  });
  it('does not send during IME composition or Shift+Enter', async () => {
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await setText('Message');
    const area = container.querySelector('textarea')!;
    await act(async () => {
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('inserts mentions at the caret without flattening formatted multiline text', async () => {
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await setText('**Heading**\nBefore \nAfter');
    const area = container.querySelector('textarea')!;
    area.setSelectionRange(19, 19);
    await click('Mention someone');
    const mention = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Riley'));
    expect(mention).toBeDefined();
    await act(async () => mention!.click());
    expect(container.querySelector('textarea')!.value).toBe('**Heading**\nBefore @Riley \nAfter');
  });
});

describe('safe formatted message rendering', () => {
  it('renders supported formats and useful links without interpreting HTML', async () => {
    await act(async () => root.render(<MessageText text={'**Bold** _italic_ ++underline++ ~~strike~~ `code`\n- one\n- two\n[Flown](https://flown.test)\n<script>alert(1)</script>\n[unsafe](javascript:alert)\n```\n<b>raw code</b>\n```'} />));
    expect(container.querySelector('strong')?.textContent).toBe('Bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('u')?.textContent).toBe('underline');
    expect(container.querySelector('s')?.textContent).toBe('strike');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')?.href).toBe('https://flown.test/');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toBe('<b>raw code</b>');
  });
});
