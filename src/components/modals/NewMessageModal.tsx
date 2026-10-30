import React, { useState } from 'react';
import { X, Search, Check, Users, MessageSquarePlus } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const NewMessageModal: React.FC = () => {
  const {
    isNewMessageOpen,
    setIsNewMessageOpen,
    users,
    currentUser,
    createConversation,
  } = useWorkspace();

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');

  if (!isNewMessageOpen) return null;

  const otherUsers = users.filter((u) => u.id !== currentUser.id);
  const filteredUsers = otherUsers.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter((uid) => uid !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const handleStartChat = () => {
    if (selectedUserIds.length === 0) return;

    const isGroup = selectedUserIds.length > 1;
    createConversation(selectedUserIds, groupName.trim() || undefined, isGroup);
    setIsNewMessageOpen(false);
    setSelectedUserIds([]);
    setGroupName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">New Message</h3>
              <p className="text-xs text-slate-500 font-medium">Select teammates to chat with</p>
            </div>
          </div>
          <button
            onClick={() => setIsNewMessageOpen(false)}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Group Name input if more than 1 selected */}
          {selectedUserIds.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Group Chat Name
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Outreach Taskforce"
                className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          )}

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff by name or role..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-100 focus:bg-white rounded-xl border border-transparent focus:border-brand-500/50 outline-none transition-all"
            />
          </div>

          {/* User selector list */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filteredUsers.map((u) => {
              const isSelected = selectedUserIds.includes(u.id);

              return (
                <div
                  key={u.id}
                  onClick={() => toggleSelect(u.id)}
                  className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-50/80 border border-brand-200/80'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-xl object-cover" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          u.status === 'online' ? 'bg-brand-500' : 'bg-slate-400'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-slate-800 truncate">{u.name}</h5>
                      <p className="text-[10px] text-slate-400 truncate">{u.role}</p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">
              {selectedUserIds.length} recipient{selectedUserIds.length === 1 ? '' : 's'} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsNewMessageOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartChat}
                disabled={selectedUserIds.length === 0}
                className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 rounded-xl shadow-md shadow-brand-500/25 transition-all"
              >
                Start Conversation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
