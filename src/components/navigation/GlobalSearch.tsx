import React, { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useRecordSearch } from '../../lib/useRecordSearch';

export const GlobalSearch: React.FC<{ className?: string; onRequestOpen?: () => void }> = ({ className = '', onRequestOpen }) => {
  const {
    channels, conversations, messages, users, calendarEvents, searchQuery, setSearchQuery,
    setActiveTab, setActiveConversationId, setActiveChannelId, openUserProfile,
  } = useWorkspace();
  const query = searchQuery.trim().toLowerCase();
  const recordHits = useRecordSearch(searchQuery);
  const allResults = query
    ? [
        ...channels
          .filter((channel) => `${channel.name} ${channel.description}`.toLowerCase().includes(query))
          .map((channel) => ({
            id: `channel-${channel.id}`,
            type: 'Channel' as const,
            title: `#${channel.name}`,
            detail: channel.description,
            onSelect: () => {
              setActiveTab('channels');
              setActiveChannelId(channel.id);
            },
          })),
        ...conversations
          .filter((conversation) =>
            `${conversation.name} ${conversation.lastMessage?.text || ''}`.toLowerCase().includes(query)
          )
          .map((conversation) => ({
            id: `conversation-${conversation.id}`,
            type: 'Direct message' as const,
            title: conversation.name,
            detail: conversation.lastMessage?.text || 'Open conversation',
            onSelect: () => {
              setActiveTab('messages');
              setActiveConversationId(conversation.id);
            },
          })),
        ...Object.entries(messages).flatMap(([targetId, targetMessages]) => {
          const isChannel = channels.some((channel) => channel.id === targetId);
          const conversation = conversations.find((item) => item.id === targetId);
          if (!isChannel && !conversation) return [];

          return targetMessages
            .filter((message) => message.text.toLowerCase().includes(query))
            .map((message) => ({
              id: `message-${message.id}`,
              type: 'Message' as const,
              title: message.senderName,
              detail: message.text,
              onSelect: () => {
                if (isChannel) {
                  setActiveTab('channels');
                  setActiveChannelId(targetId);
                } else {
                  setActiveTab('messages');
                  setActiveConversationId(targetId);
                }
              },
            }));
        }),
        ...users
          .filter((user) => `${user.name} ${user.role} ${user.email}`.toLowerCase().includes(query))
          .map((user) => ({
            id: `user-${user.id}`,
            type: 'Person' as const,
            title: user.name,
            detail: `${user.role} · ${user.email}`,
            onSelect: () => openUserProfile(user),
          })),
        ...calendarEvents
          .filter((event) => `${event.title} ${event.description || ''} ${event.location || ''}`.toLowerCase().includes(query))
          .map((event) => ({
            id: `event-${event.id}`,
            type: 'Calendar event' as const,
            title: event.title,
            detail: `${event.date}${event.location ? ` · ${event.location}` : ''}`,
            onSelect: () => setActiveTab('calendar'),
          })),
        ...recordHits
          .filter((hit) => !(hit.type === 'Message' && Object.values(messages).some((list) => list.some((message) => message.id === hit.recordId))))
          .map((hit) => ({
            id: hit.id,
            type: hit.type,
            title: hit.title,
            detail: hit.detail,
            onSelect: () => {
              if (hit.conversationId) {
                if (channels.some((channel) => channel.id === hit.conversationId)) {
                  setActiveTab('channels');
                  setActiveChannelId(hit.conversationId);
                } else {
                  setActiveTab('messages');
                  setActiveConversationId(hit.conversationId);
                }
                return;
              }
              window.history.pushState({}, '', hit.path);
              window.dispatchEvent(new PopStateEvent('popstate'));
            },
          })),
      ]
    : [];
  // Cap each result type so one busy source (usually messages) cannot hide tasks, events or records.
  const perType = new Map<string, number>();
  const searchResults = allResults.filter((result) => {
    const count = perType.get(result.type) ?? 0;
    perType.set(result.type, count + 1);
    return count < 4;
  }).slice(0, 16);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onRequestOpen?.();
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRequestOpen]);

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setSearchQuery('');
          if (event.key === 'Enter' && searchResults[0]) {
            searchResults[0].onSelect();
            setSearchQuery('');
          }
        }}
        placeholder="Search everything..."
        aria-label="Search everything"
        className="w-full rounded-xl border border-white/20 bg-white/10 py-2 pl-9 pr-3 text-xs font-medium text-white outline-none transition-colors placeholder:text-white/60 focus:border-white/40 focus:bg-white/20"
      />
      {!searchQuery && <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">⌘K</kbd>}
      {query && (
        <div className="absolute left-0 top-full z-[80] mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl">
          {searchResults.length > 0 ? searchResults.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => {
                result.onSelect();
                setSearchQuery('');
              }}
              className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-brand-50"
            >
              <span className="block text-xs font-semibold text-brand-600">{result.type}</span>
              <span className="block truncate text-xs font-semibold text-slate-800">{result.title}</span>
              <span className="block truncate text-xs text-slate-500">{result.detail}</span>
            </button>
          )) : (
            <p className="px-3 py-4 text-center text-xs text-slate-500">No matching results</p>
          )}
        </div>
      )}
    </div>
  );
};
