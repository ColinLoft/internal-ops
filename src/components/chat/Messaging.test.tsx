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
import { ConversationList } from './ConversationList';
import { RightDrawer } from './RightDrawer';

let root: Root;
let container: HTMLDivElement;
class TestRecorder {
  static isTypeSupported = () => true;
  static current: TestRecorder;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { TestRecorder.current = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) }); this.onstop?.(); }
}
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
    conversations: [{ id: 'direct', type: 'direct', name: 'Team', participants: ['staff', 'other'], lastMessage: message }],
    channels: [{ id: 'channel', name: 'announcements', description: 'Team news', type: 'announcement', members: ['staff'], postingRoles: ['admin'], createdBy: 'other' }],
    currentUser: { id: 'staff', name: 'Morgan', systemRole: 'member' },
    users: [{ id: 'staff', name: 'Morgan', avatar: '', status: 'online' }, { id: 'other', name: 'Riley', avatar: '', status: 'online' }],
    messages: { direct: [message, { ...message, id: 'continuation', text: 'Second line', createdAt: new Date(2026, 10, 7, 9, 1).toISOString() }, { ...message, id: 'reply', senderId: 'other', senderName: 'Riley', text: 'Thanks!' }], channel: [message] },
    sendMessage: mock.send, markMessagesSeen: mock.seen, startCall: mock.call, openUserProfile: mock.profile, toggleReaction: mock.reaction,
    openThread: mock.thread, retryMessage: mock.retry, votePoll: mock.poll, toggleRightDrawer: vi.fn(), setIsNewMessageOpen: vi.fn(), setIsCreatePollOpen: vi.fn(), setIsCreateChannelOpen: vi.fn(), togglePinConversation: vi.fn(),
  };
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0; });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
    expect(container.querySelector('[aria-label="Seen by Riley"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Seen by');
    expect(container.querySelector('.message-receipt')?.parentElement?.textContent).toContain('9:00 AM');
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
  it('opens settings from the title with no redundant header icons or channel hash', async () => {
    await act(async () => root.render(<ChatFeed />));
    await click('Open Riley settings');
    expect(mock.workspace.toggleRightDrawer).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="Search conversation"]')).toBeNull();
    expect(container.querySelector('[aria-label="Conversation details and files"]')).toBeNull();
    mock.workspace.activeTab = 'channels';
    await act(async () => root.render(<ChatFeed />));
    expect(container.querySelector('h1')?.textContent).toBe('announcements');
    expect(container.querySelector('[aria-label="Edit channel"]')).toBeNull();
  });
  it('puts pins below the timestamp and opens the channel wizard from the top plus', async () => {
    await act(async () => root.render(<ConversationList />));
    const pin = container.querySelector('[aria-label="Pin Riley"]')!;
    expect(pin.classList.contains('absolute')).toBe(false);
    expect(pin.parentElement?.parentElement?.textContent).not.toContain('9:00 AM');
    await click('Pin Riley');
    expect(mock.workspace.togglePinConversation).toHaveBeenCalledWith('direct');
    await click('Create a channel');
    expect(mock.workspace.setIsCreateChannelOpen).toHaveBeenCalledWith(true);
  });
  it('offers a real persisted pin in conversation settings without fake invite or notification controls', async () => {
    mock.workspace.isRightDrawerOpen = true;
    await act(async () => root.render(<RightDrawer />));
    await click('Pin conversation');
    expect(mock.workspace.togglePinConversation).toHaveBeenCalledWith('direct');
    expect(container.textContent).not.toContain('Invite Link');
    expect(container.querySelector('img[src*="unsplash"]')).toBeNull();
    await click('Close conversation settings');
    expect(mock.workspace.toggleRightDrawer).toHaveBeenCalledOnce();
  });
});

describe('voice message recording', () => {
  const getUserMedia = vi.fn();
  const installRecorder = () => {
    const stopTrack = vi.fn();
    getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    vi.stubGlobal('MediaRecorder', TestRecorder);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-audio') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    return stopTrack;
  };
  it('attaches recorded audio, stops microphone tracks and sends through existing attachment persistence', async () => {
    const stopTrack = installRecorder();
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await click('Record a voice message');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')?.disabled).toBe(true);
    await click('Stop recording');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Voice message.webm');
    await click('Send message');
    expect(mock.send).toHaveBeenCalledWith('', [expect.objectContaining({ type: 'audio', name: 'Voice message.webm', url: 'blob:test-audio' })]);
  });
  it('releases the microphone on unmount without creating a phantom audio draft', async () => {
    const stopTrack = installRecorder();
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await click('Record a voice message');
    await act(async () => root.render(null));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(TestRecorder.current.state).toBe('inactive');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('releases a microphone permission request that resolves after leaving the composer', async () => {
    const stopTrack = installRecorder();
    let allow!: (value: { getTracks: () => { stop: typeof stopTrack }[] }) => void;
    getUserMedia.mockReturnValue(new Promise(resolve => { allow = resolve; }));
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await click('Record a voice message');
    await act(async () => root.render(null));
    await act(async () => allow({ getTracks: () => [{ stop: stopTrack }] }));
    expect(stopTrack).toHaveBeenCalledOnce();
  });
  it('reports denied microphone permission explicitly and retains the text draft', async () => {
    installRecorder();
    getUserMedia.mockRejectedValue(new Error('Permission denied'));
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await setText('Keep this');
    await click('Record a voice message');
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Permission denied');
    expect(container.querySelector('textarea')?.value).toBe('Keep this');
  });
  it('does not turn a failed recording into a successful audio attachment', async () => {
    installRecorder();
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await click('Record a voice message');
    await act(async () => TestRecorder.current.onerror?.());
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Recording failed');
    expect(container.textContent).not.toContain('Voice message.webm');
  });
  it('automatically stops at two minutes and releases an unsent recording when removed', async () => {
    const stopTrack = installRecorder();
    vi.useFakeTimers();
    try {
      await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
      await click('Record a voice message');
      await act(async () => vi.advanceTimersByTime(120_000));
      expect(TestRecorder.current.state).toBe('inactive');
      expect(stopTrack).toHaveBeenCalledOnce();
      await click('Remove Voice message.webm');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-audio');
      expect(container.textContent).not.toContain('Voice message.webm');
    } finally { vi.useRealTimers(); }
  });
});

describe('compact formatting composer', () => {
  it('formats selected text and sends without a preview option', async () => {
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    expect(container.querySelector('[role=toolbar]')).not.toBeNull();
    await setText('Hello');
    container.querySelector('textarea')!.setSelectionRange(0, 5);
    await click('Bold');
    expect(container.querySelector('textarea')!.value).toBe('**Hello**');
    expect(container.textContent).not.toContain('Preview');
    await click('Send message');
    expect(mock.send).toHaveBeenCalledWith('**Hello**', []);
    expect(container.querySelector('textarea')?.value).toBe('');
  });
  it('toggles formatting, exposes more emojis, labels polls and removes location', async () => {
    await act(async () => root.render(<MessageComposer onSendMessage={mock.send} />));
    await click('Hide formatting');
    expect(container.querySelector('[aria-label="Show formatting"]')?.getAttribute('aria-expanded')).toBe('false');
    await click('Show formatting');
    await click('Insert emoji');
    expect(container.querySelectorAll('[aria-label^="Insert "]').length).toBeGreaterThan(50);
    await click('Insert 🚀');
    expect(container.querySelector('textarea')?.value).toBe('🚀');
    await click('Create poll');
    expect(mock.workspace.setIsCreatePollOpen).toHaveBeenCalledWith(true);
    expect(container.querySelector('[aria-label="Share location"]')).toBeNull();
    expect(container.querySelector('[aria-label="Send message"]')?.classList.contains('bg-brand-600')).toBe(true);
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
