import React, { useRef, useEffect } from 'react';
import { X, MessageSquare, CornerDownRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { groupWithPrevious } from './messageLayout';

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

  const targetId = activeTab === 'channels' ? activeChannelId : activeConversationId;
  const targetMessages = messages[targetId] || [];
  const parentMessage = targetMessages.find((m) => m.id === activeThreadMessageId);
  const replies = (activeThreadMessageId && threadReplies[activeThreadMessageId]) || [];

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [replies.length]);

  if (!activeThreadMessageId || !parentMessage) return null;

  return (
    <div className="fixed inset-0 z-50 w-full lg:static lg:z-20 lg:w-96 h-full bg-white border-l border-slate-200/70 flex flex-col flex-shrink-0">
      {/* Thread Header */}
      <div className="h-14 px-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-50 text-brand-600 rounded-lg">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Thread</h3>
            <p className="text-[11px] text-slate-500 font-normal">
              {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
        </div>

        <button
          aria-label="Close thread"
          onClick={closeThread}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Thread Scroll Area */}
      <div className="flex-1 overflow-y-auto py-3">
        {/* Original Parent Message */}
        <div>
          <div className="px-3 text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
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
          <span className="text-xs font-medium text-slate-500">
            {replies.length > 0 ? 'Replies' : 'No replies yet'}
          </span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        {/* Replies List */}
        {replies.map((reply, index) => (
          <MessageBubble
            key={reply.id}
            message={reply}
            isCurrentUser={reply.senderId === currentUser.id}
            isThreadReply={true}
            grouped={groupWithPrevious(reply, replies[index - 1])}
          />
        ))}

        <div ref={repliesEndRef} />
      </div>

      {/* Reply Composer */}
      <div className="p-3 border-t border-slate-100 bg-white">
        <MessageComposer
          key={activeThreadMessageId}
          onSendMessage={(text, atts) => sendThreadReply(activeThreadMessageId, text, atts)}
          placeholder="Reply in thread..."
        />
      </div>
    </div>
  );
};
