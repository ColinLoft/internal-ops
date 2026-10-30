import React, { useState } from 'react';
import {
  Message,
  User,
} from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  Phone,
  PhoneOff,
  Play,
  Pause,
  MessageSquare,
  Smile,
  FileText,
  MapPin,
  Download,
  Vote,
  Sparkles,
} from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isCurrentUser: boolean;
  onOpenThread?: (messageId: string) => void;
  isThreadReply?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isCurrentUser,
  onOpenThread,
  isThreadReply = false,
}) => {
  const {
    users,
    currentUser,
    activeTab,
    openUserProfile,
    toggleReaction,
    votePoll,
  } = useWorkspace();

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Find sender in users roster
  const sender = users.find((u) => u.id === message.senderId) || {
    id: message.senderId,
    name: message.senderName,
    avatar: message.senderAvatar,
    role: message.senderRole || 'Staff Member',
    department: 'Outreach',
    phone: '',
    email: '',
    status: 'offline' as const,
    systemRole: 'member' as const,
  };

  const quickEmojis = ['👍', '❤️', '🎉', '🔥', '🙌', '💡'];

  return (
    <div
      className={`group relative flex gap-3 my-3 px-2 transition-all ${
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Sender Avatar with Online Dot (Clickable) */}
      <div className="relative flex-shrink-0 self-end">
        <button
          onClick={() => openUserProfile(sender)}
          className="relative block rounded-2xl overflow-hidden hover:ring-2 hover:ring-brand-500/50 transition-all focus:outline-none"
          title={`Click to view profile of ${sender.name}`}
        >
          <img
            src={sender.avatar}
            alt={sender.name}
            className="w-10 h-10 rounded-2xl object-cover shadow-2xs"
          />
        </button>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
            sender.status === 'online'
              ? 'bg-brand-500'
              : sender.status === 'busy'
              ? 'bg-rose-500'
              : sender.status === 'away'
              ? 'bg-brand-500'
              : 'bg-slate-400'
          }`}
          title={`Status: ${sender.status}`}
        />
      </div>

      {/* Bubble & Metadata */}
      <div
        className={`flex flex-col max-w-[75%] sm:max-w-[70%] ${
          isCurrentUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Sender Name & Timestamp */}
        <div className="flex items-center gap-2 mb-1 px-1">
          <button
            onClick={() => openUserProfile(sender)}
            className="text-xs font-bold text-slate-800 hover:text-brand-600 transition-colors"
          >
            {isCurrentUser ? 'You' : sender.name}
          </button>
          {sender.role && !isCurrentUser && (
            <span className="text-[10px] text-slate-400 font-medium">
              • {sender.role}
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-medium">{message.timestamp}</span>
        </div>

        {/* Message Content Body */}
        {message.isCallRecord ? (
          /* Inline Audio Call Record (matching Screenshot 1 Sage) */
          <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 shadow-xs w-72">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-slate-700">
                <div className="p-2 rounded-xl bg-slate-200/60 text-slate-700">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-800">Call Ended</h5>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Answered duration: {message.callDuration || '2:15'}
                  </p>
                </div>
              </div>
            </div>

            {/* Playable audio preview bar */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                className="p-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-2xs transition-colors"
              >
                {isPlayingAudio ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-brand-600 rounded-full transition-all duration-300 ${
                    isPlayingAudio ? 'w-2/3' : 'w-1/4'
                  }`}
                />
              </div>
              <span className="text-[10px] text-slate-500 font-medium">00:02</span>
            </div>
          </div>
        ) : message.poll ? (
          /* Interactive Custom Poll Card (matching Screenshot 2 Astrea) */
          <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-md w-80 sm:w-96">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
              <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                <Vote className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">
                Staff Poll
              </span>
            </div>

            <h4 className="text-xs font-bold text-slate-900 mb-3 leading-snug">
              {message.poll.question}
            </h4>

            {/* Options list */}
            <div className="space-y-2">
              {message.poll.options.map((opt) => {
                const total = message.poll!.totalVotes || 1;
                const percentage = Math.round((opt.votes.length / (total || 1)) * 100);
                const hasVoted = opt.votes.includes(currentUser.id);

                return (
                  <button
                    key={opt.id}
                    onClick={() => votePoll(message.id, opt.id, message.parentId)}
                    className={`w-full relative text-left p-2.5 rounded-xl border transition-all overflow-hidden ${
                      hasVoted
                        ? 'border-brand-500 bg-brand-50/70 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/60'
                    }`}
                  >
                    {/* Background Progress Fill */}
                    <div
                      className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                        hasVoted ? 'bg-brand-500/20' : 'bg-slate-200/50'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />

                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                            hasVoted
                              ? 'border-brand-600 bg-brand-600 text-white'
                              : 'border-slate-400 bg-white'
                          }`}
                        >
                          {hasVoted && '✓'}
                        </span>
                        <span
                          className={`text-xs ${
                            hasVoted ? 'font-bold text-brand-900' : 'font-medium text-slate-800'
                          }`}
                        >
                          {opt.text}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-700">{percentage}%</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mt-3 pt-2 border-t border-slate-100">
              <span>{message.poll.totalVotes} votes cast</span>
              <span className="text-brand-600 font-semibold">Click option to vote</span>
            </div>
          </div>
        ) : (
          /* Standard Bubble */
          <div
            className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs ${
              isCurrentUser
                ? 'bg-brand-600 text-white rounded-br-xs'
                : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
            }`}
          >
            {/* Formatted Text Content */}
            <div className="whitespace-pre-wrap break-words">
              {message.text.split(' ').map((word, i) => {
                if (word.startsWith('@')) {
                  return (
                    <span
                      key={i}
                      className={`font-bold px-1 py-0.5 rounded ${
                        isCurrentUser
                          ? 'bg-brand-700 text-white'
                          : 'bg-brand-50 text-brand-700'
                      }`}
                    >
                      {word}{' '}
                    </span>
                  );
                }
                return word + ' ';
              })}
            </div>

            {/* Attachments if any */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {message.attachments.map((att) => {
                  if (att.type === 'location' && att.locationData) {
                    return (
                      <div
                        key={att.id}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                          isCurrentUser
                            ? 'bg-brand-700/80 border-brand-500 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="p-2 bg-rose-500 text-white rounded-lg">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{att.name}</p>
                          <p className="text-[11px] opacity-80 truncate">
                            {att.locationData.label}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (att.type === 'file') {
                    return (
                      <div
                        key={att.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                          isCurrentUser
                            ? 'bg-brand-700/80 border-brand-500 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 bg-brand-500 text-white rounded-lg">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{att.name}</p>
                            <p className="text-[10px] opacity-75">{att.size}</p>
                          </div>
                        </div>
                        <a
                          href={att.url}
                          download={att.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                          title={`Download ${att.name}`}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    );
                  }

                  if (att.type === 'image') {
                    return (
                      <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="block max-w-sm overflow-hidden rounded-xl border border-slate-200">
                        <img src={att.url} alt={att.name} className="max-h-72 w-full object-contain" loading="lazy" />
                        <span className="block truncate px-2 py-1 text-[10px] text-slate-500">{att.name}</span>
                      </a>
                    );
                  }

                  return null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Seen status or Read Receipt (matching Screenshot 1 Sage) */}
        {isCurrentUser && activeTab !== 'channels' && (
          <div className="flex items-center gap-1 mt-1 text-[10px] font-semibold text-brand-600">
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Seen</span>
            {message.seenBy.includes('user-courtney') && (
              <img
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"
                alt="Seen by Courtney"
                className="w-3.5 h-3.5 rounded-full object-cover ml-0.5 border border-white"
                title="Seen by Courtney Henry"
              />
            )}
          </div>
        )}

        {/* Reactions Pill Display */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {message.reactions.map((react, i) => {
              const hasReacted = react.users.includes(currentUser.id);
              return (
                <button
                  key={i}
                  onClick={() => toggleReaction(message.id, react.emoji, message.parentId)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    hasReacted
                      ? 'bg-brand-50 border-brand-300 text-brand-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                  title={`${react.users.length} reaction${react.users.length > 1 ? 's' : ''}`}
                >
                  <span>{react.emoji}</span>
                  <span className="text-[11px] font-semibold">{react.users.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thread replies pill if message has replies and is in main feed */}
        {!isThreadReply && (message.threadCount || 0) > 0 && onOpenThread && (
          <button
            onClick={() => onOpenThread(message.id)}
            className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-xl bg-brand-50/80 hover:bg-brand-100 border border-brand-200/60 text-brand-700 text-xs font-bold transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              {message.threadCount} repl{message.threadCount === 1 ? 'y' : 'ies'}
            </span>
            {message.lastThreadReplyAt && (
              <span className="text-[10px] text-brand-600 font-normal">
                • {message.lastThreadReplyAt}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Hover Action Bar: Emoji React & Reply in Thread */}
      <div
        className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur-md rounded-2xl shadow-md border border-slate-200 px-1 py-0.5 flex items-center gap-0.5 z-10 ${
          isCurrentUser ? 'left-4' : 'right-4'
        }`}
      >
        {quickEmojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(message.id, emoji, message.parentId)}
            className="p-1 hover:scale-125 transition-transform text-xs"
          >
            {emoji}
          </button>
        ))}

        {!isThreadReply && onOpenThread && (
          <button
            onClick={() => onOpenThread(message.id)}
            className="p-1 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Reply in thread"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
