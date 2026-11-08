import type { Message } from '../../types';

export function messageDate(message: Message): Date | null {
  if (!message.createdAt) return null;
  const date = new Date(message.createdAt);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function messageDay(message: Message): string | null {
  return messageDate(message)?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) ?? null;
}

export function groupWithPrevious(message: Message, previous?: Message): boolean {
  if (!previous || previous.senderId !== message.senderId || previous.isCallRecord || message.isCallRecord || previous.poll || message.poll) return false;
  const date = messageDate(message);
  const previousDate = messageDate(previous);
  if (!date || !previousDate || date.toDateString() !== previousDate.toDateString()) return false;
  const elapsed = date.getTime() - previousDate.getTime();
  return elapsed >= 0 && elapsed < 5 * 60 * 1000;
}

export type MessageFormat = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'codeBlock' | 'link' | 'bullets' | 'numbered' | 'quote';
export function formatSelection(text: string, start: number, end: number, format: MessageFormat) {
  const selection = text.slice(start, end);
  if (format === 'bullets' || format === 'numbered' || format === 'quote') {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = text.indexOf('\n', end);
    const lineEnd = nextBreak < 0 ? text.length : nextBreak;
    const replacement = text.slice(lineStart, lineEnd).split('\n').map((line, index) =>
      `${format === 'bullets' ? '- ' : format === 'quote' ? '> ' : `${index + 1}. `}${line}`).join('\n');
    return { text: text.slice(0, lineStart) + replacement + text.slice(lineEnd), start: lineStart, end: lineStart + replacement.length };
  }
  const markers: Record<Exclude<MessageFormat, 'bullets' | 'numbered' | 'quote'>, [string, string, string]> = {
    bold: ['**', '**', 'bold text'], italic: ['_', '_', 'italic text'], underline: ['++', '++', 'underlined text'],
    strike: ['~~', '~~', 'struck text'], code: ['`', '`', 'code'], codeBlock: ['```\n', '\n```', 'code'],
    link: ['[', '](https://)', 'link text'],
  };
  const [prefix, suffix, placeholder] = markers[format];
  const content = selection || placeholder;
  return { text: text.slice(0, start) + prefix + content + suffix + text.slice(end), start: start + prefix.length, end: start + prefix.length + content.length };
}
