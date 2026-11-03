import React from 'react';
import { Search } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useRecordSearch } from '../../lib/useRecordSearch';

export const GlobalSearch: React.FC<{ className?: string }> = ({ className = '' }) => {
  const {
    channels, conversations, messages, users, calendarEvents, searchQuery, setSearchQuery,
    setActiveTab, setActiveConversationId, setActiveChannelId, openUserProfile,
  } = useWorkspace();
  const query = searchQuery.trim().toLowerCase();
  const recordHits = useRecordSearch(searchQuery);
  const searchResults = query
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
            detail: `${user.role} · ${user.department}`,
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
        ...recordHits.map((hit) => ({
          id: hit.id,
          type: hit.type,
          title: hit.title,
          detail: hit.detail,
          onSelect: () => {
            window.history.pushState({}, '', hit.path);
            window.dispatchEvent(new PopStateEvent('popstate'));
          },
        })),
      ].slice(0, 12)
    : [];

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
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
        className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-xs font-medium text-white outline-none transition-colors placeholder:text-slate-500 focus:border-white/25 focus:bg-black/30"
      />
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
