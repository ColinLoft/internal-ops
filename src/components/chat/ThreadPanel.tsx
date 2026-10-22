import React, { useRef, useEffect } from 'react';
import { X, MessageSquare, CornerDownRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

export const ThreadPanel: React.FC = () => {
  const {
    activeThreadMessageId,
    closeThread,
    messages,
    threadReplies,
    activeTab,
    activeChannelId,
    activeConversationId,
    sendThreadReply,
    currentUser,
  } = useWorkspace();

  const repliesEndRef = useRef<HTMLDivElement>(null);

  if (!activeThreadMessageId) return null;

  const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
  const targetMessages = messages[targetId] || [];
  const parentMessage = targetMessages.find((m) => m.id === activeThreadMessageId);
  const replies = threadReplies[activeThreadMessageId] || [];

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies.length]);

  if (!parentMessage) return null;

  return (
    <div className="w-96 h-full bg-white/95 backdrop-blur-2xl border-l border-slate-200/80 flex flex-col z-20 shadow-xl flex-shrink-0 animate-in slide-in-from-right duration-200">
      {/* Thread Header */}
      <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-brand-50 text-brand-600 rounded-xl">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900">Thread Discussion</h3>
            <p className="text-[10px] text-slate-500 font-medium">
              {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
        </div>

        <button
          onClick={closeThread}
          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thread Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Original Parent Message */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <CornerDownRight className="w-3 h-3 text-brand-500" /> Original Post
          </div>
          <MessageBubble
            message={parentMessage}
            isCurrentUser={parentMessage.senderId === currentUser.id}
            isThreadReply={true}
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 py-1">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {replies.length > 0 ? 'Replies' : 'No replies yet'}
          </span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        {/* Replies List */}
        {replies.map((reply) => (
          <MessageBubble
            key={reply.id}
            message={reply}
            isCurrentUser={reply.senderId === currentUser.id}
            isThreadReply={true}
          />
        ))}

        <div ref={repliesEndRef} />
      </div>

      {/* Reply Composer */}
      <div className="p-3 border-t border-slate-100 bg-white">
        <MessageComposer
          onSendMessage={(text, atts) => sendThreadReply(activeThreadMessageId, text, atts)}
          placeholder="Reply in thread..."
        />
      </div>
    </div>
  );
};
