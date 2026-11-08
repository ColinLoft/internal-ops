import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import { formatSelection, groupWithPrevious, messageDay } from './messageLayout';
const message: Message = { id: '1', conversationId: 'conversation', senderId: 'staff', senderName: 'Staff', senderAvatar: '', text: 'Hello', timestamp: '9:00 AM', createdAt: new Date(2026, 10, 7, 9).toISOString(), seenBy: [], reactions: [] };
describe('compact message grouping', () => {
  it('groups only consecutive messages from the same person within five minutes', () => {
    expect(groupWithPrevious({ ...message, createdAt: new Date(2026, 10, 7, 9, 4).toISOString() }, message)).toBe(true);
    expect(groupWithPrevious({ ...message, createdAt: new Date(2026, 10, 7, 9, 5).toISOString() }, message)).toBe(false);
    expect(groupWithPrevious({ ...message, senderId: 'other' }, message)).toBe(false);
    expect(groupWithPrevious(message)).toBe(false);
  });
  it('does not group across dates or invent dates for legacy messages', () => {
    expect(groupWithPrevious({ ...message, createdAt: new Date(2026, 10, 8, 0, 1).toISOString() }, { ...message, createdAt: new Date(2026, 10, 7, 23, 59).toISOString() })).toBe(false);
    expect(messageDay({ ...message, createdAt: undefined })).toBeNull();
    expect(messageDay({ ...message, createdAt: 'invalid' })).toBeNull();
    expect(groupWithPrevious({ ...message, createdAt: undefined }, message)).toBe(false);
    expect(groupWithPrevious({ ...message, isCallRecord: true }, message)).toBe(false);
  });
});
describe('message formatting selection', () => {
  it.each(['bold', 'italic', 'underline', 'strike', 'code'] as const)('keeps selected text when applying %s', format => {
    const result = formatSelection('Before selected after', 7, 15, format);
    expect(result.text.slice(0, 7)).toBe('Before ');
    expect(result.text.slice(result.start, result.end)).toBe('selected');
    expect(result.text.endsWith(' after')).toBe(true);
  });
  it('formats complete selected lines as ordered and unordered lists', () => {
    expect(formatSelection('one\ntwo\nthree', 1, 6, 'numbered').text).toBe('1. one\n2. two\nthree');
    expect(formatSelection('one\ntwo', 0, 7, 'bullets').text).toBe('- one\n- two');
    expect(formatSelection('one', 0, 3, 'quote').text).toBe('> one');
  });
  it('provides editable code and link placeholders', () => {
    expect(formatSelection('', 0, 0, 'codeBlock').text).toBe('```\ncode\n```');
    expect(formatSelection('Flown', 0, 5, 'link').text).toBe('[Flown](https://)');
  });
});
