import React, { useEffect, useRef, useState } from 'react';
import { CheckCheck, Download, FileText, MapPin, MessageSquare, MoreHorizontal, Phone, SmilePlus } from 'lucide-react';
import type { Message } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MessageText, messageLink } from './MessageText';

interface MessageBubbleProps {
  message: Message;
  isCurrentUser: boolean;
  onOpenThread?: (messageId: string) => void;
  isThreadReply?: boolean;
  grouped?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isCurrentUser, onOpenThread, isThreadReply = false, grouped = false }) => {
  const { users, currentUser, activeTab, openUserProfile, toggleReaction, votePoll, retryMessage } = useWorkspace();
  const [showReactions, setShowReactions] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const reactionRef = useRef<HTMLDivElement>(null);
  const sender = users.find(user => user.id === message.senderId) || {
    id: message.senderId, name: message.senderName, avatar: message.senderAvatar, role: message.senderRole || 'Staff Member',
    department: 'Outreach', phone: '', email: '', status: 'offline' as const, systemRole: 'member' as const,
  };
  useEffect(() => {
    if (!showReactions && !showActions) return;
    const outside = (event: MouseEvent) => { if (!reactionRef.current?.contains(event.target as Node)) { setShowReactions(false); setShowActions(false); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowReactions(false); setShowActions(false); } };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [showReactions, showActions]);
  const seenNames = users.filter(user => message.seenBy.includes(user.id) && user.id !== currentUser.id).map(user => user.name).slice(0, 2).join(', ');
  const seen = isCurrentUser && activeTab !== 'channels' && message.seenBy.some(id => id !== currentUser.id) && message.sendStatus !== 'sending' && message.sendStatus !== 'failed';
  const receipt = seen ? <span title={seenNames ? `Seen by ${seenNames}` : 'Seen'} aria-label={seenNames ? `Seen by ${seenNames}` : 'Seen'} className="message-receipt inline-flex shrink-0 align-middle"><CheckCheck className="h-3 w-3" /></span> : null;
  return <article data-message-id={message.id} data-grouped={grouped} aria-label={`${sender.name}, ${message.timestamp}`} className={`group relative flex min-w-0 gap-2.5 px-4 hover:bg-slate-100/40 sm:px-5 ${grouped ? 'py-0.5' : 'pb-1 pt-3'}`}>
    <div className="w-8 shrink-0">
      {!grouped ? <button type="button" onClick={() => openUserProfile(sender)} aria-label={`View ${sender.name}'s profile`} className="block h-8 w-8 overflow-hidden rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
        {sender.avatar ? <img src={sender.avatar} alt="" className="h-full w-full object-cover" /> : sender.name.slice(0, 2).toUpperCase()}
      </button> : <span className="block pt-1 text-center text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" title={message.timestamp}>{message.timestamp.replace(/\s?[AP]M/i, '')}</span>}
    </div>
    <div className={`min-w-0 flex-1 ${grouped ? 'pr-8 md:pr-16' : ''}`}>
      {!grouped && <div className="mb-0.5 flex min-w-0 items-baseline gap-2 pr-8 md:pr-16">
        <button type="button" onClick={() => openUserProfile(sender)} className="truncate text-sm font-semibold text-slate-900 hover:underline">{sender.name}</button>
        <span className="shrink-0 text-[11px] text-slate-400">{message.timestamp}</span>
        {receipt}
      </div>}
      {message.isCallRecord ? <div className="flex items-center gap-2 py-1 text-sm text-slate-600"><Phone className="h-4 w-4" /><span>Call ended{message.callDuration ? ` · ${message.callDuration}` : ''}</span></div>
        : message.poll ? <section aria-label="Staff poll" className="my-1 w-full max-w-md rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">{message.poll.question}</h3>
          <div className="space-y-2">{message.poll.options.map(option => {
            const percentage = message.poll!.totalVotes ? Math.round(option.votes.length / message.poll!.totalVotes * 100) : 0;
            const voted = option.votes.includes(currentUser.id);
            return <button type="button" key={option.id} disabled={message.poll!.isClosed} aria-pressed={voted} onClick={() => votePoll(message.id, option.id, message.parentId)} className={`relative flex min-h-10 w-full items-center justify-between overflow-hidden rounded-md border px-3 py-2 text-left text-sm ${voted ? 'border-brand-500 text-brand-400' : 'border-slate-200 text-slate-800'}`}>
              <span className="absolute inset-y-0 left-0 bg-brand-500/10" style={{ width: `${percentage}%` }} />
              <span className="relative">{option.text}</span><span className="relative ml-2 text-xs tabular-nums">{percentage}%</span>
            </button>;
          })}</div><p className="mt-2 text-xs text-slate-500">{message.poll.totalVotes} votes{message.poll.isClosed ? ' · Poll closed' : ''}</p>
        </section> : message.text && <div className="flex items-end gap-2"><div className="min-w-0"><MessageText text={message.text} /></div>{grouped && receipt}</div>}
      {message.attachments?.map(attachment => {
        const url = /^(blob:|data:image\/)/.test(attachment.url) ? attachment.url : messageLink(attachment.url);
        if (!url) return <p key={attachment.id} role="status" className="mt-2 text-xs text-slate-500">{attachment.name} · Attachment unavailable</p>;
        if (attachment.type === 'image') return <a key={attachment.id} href={url} target="_blank" rel="noreferrer" className="mt-2 block w-fit max-w-full overflow-hidden rounded-lg border border-slate-200"><img src={url} alt={attachment.name} className="max-h-64 max-w-full object-contain sm:max-w-md" loading="lazy" /></a>;
        if (attachment.type === 'audio') return <audio key={attachment.id} controls preload="none" src={url} aria-label={attachment.name} className="mt-2 w-full max-w-sm" />;
        return <a key={attachment.id} href={url} target="_blank" rel="noreferrer" download={attachment.type === 'file' ? attachment.name : undefined} className="mt-2 flex w-full max-w-md items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-slate-700 hover:bg-slate-100">
          {attachment.type === 'location' ? <MapPin className="h-5 w-5 shrink-0 text-brand-400" /> : <FileText className="h-5 w-5 shrink-0 text-brand-400" />}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{attachment.name}</span><span className="block truncate text-xs text-slate-500">{attachment.locationData?.label || attachment.size}</span></span>
          {attachment.type === 'file' && <Download className="h-4 w-4 shrink-0" />}
        </a>;
      })}
      {grouped && !message.text && receipt}
      {message.reactions?.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{message.reactions.map(reaction => <button type="button" key={reaction.emoji} aria-label={`${reaction.emoji}, ${reaction.users.length} reactions`} aria-pressed={reaction.users.includes(currentUser.id)} onClick={() => toggleReaction(message.id, reaction.emoji, message.parentId)} className={`flex min-h-7 items-center gap-1 rounded-md border px-2 text-xs ${reaction.users.includes(currentUser.id) ? 'border-brand-500/50 bg-brand-500/10 text-brand-400' : 'border-slate-200 bg-white text-slate-600'}`}><span>{reaction.emoji}</span><span>{reaction.users.length}</span></button>)}</div>}
      {!isThreadReply && (message.threadCount || 0) > 0 && onOpenThread && <button type="button" onClick={() => onOpenThread(message.id)} className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:underline"><MessageSquare className="h-3.5 w-3.5" />{message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}{message.lastThreadReplyAt ? ` · ${message.lastThreadReplyAt}` : ''}</button>}
      {isCurrentUser && (message.sendStatus === 'failed' || message.sendStatus === 'sending') && <div className="flex items-center gap-1 text-[11px] text-slate-400">
        {message.sendStatus === 'failed' ? <button type="button" onClick={() => void retryMessage(message.id)} className="py-1 font-medium text-rose-600 hover:underline">Not sent · Retry</button>
          : message.sendStatus === 'sending' ? <span role="status">Sending…</span>
          : null}
      </div>}
    </div>
    <div ref={reactionRef} className="absolute right-4 top-0 z-10">
      <button type="button" aria-label={`More actions for ${sender.name}'s message`} aria-expanded={showActions} onClick={() => setShowActions(value => !value)} className="ml-auto flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 md:hidden"><MoreHorizontal className="h-4 w-4" /></button>
      <div className={`${showActions ? 'flex' : 'hidden md:flex'} items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${showReactions || showActions ? 'opacity-100' : 'md:opacity-0'}`}>
        <button type="button" aria-label={`React to ${sender.name}'s message`} aria-expanded={showReactions} onClick={() => setShowReactions(value => !value)} className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100"><SmilePlus className="h-4 w-4" /></button>
        {!isThreadReply && onOpenThread && <button type="button" aria-label="Reply in thread" onClick={() => onOpenThread(message.id)} className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100"><MessageSquare className="h-4 w-4" /></button>}
      </div>
      {showReactions && <div role="group" aria-label="Choose reaction" className="absolute right-0 top-full mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-elevated">{['👍', '❤️', '🎉', '🔥', '🙌', '💡'].map(emoji => <button key={emoji} type="button" aria-label={`React ${emoji}`} onClick={() => { toggleReaction(message.id, emoji, message.parentId); setShowReactions(false); setShowActions(false); }} className="h-8 w-8 rounded hover:bg-slate-100">{emoji}</button>)}</div>}
    </div>
  </article>;
};
