import React, { useState } from 'react';
import {
  X,
  Bell,
  Copy,
  Check,
  Image as ImageIcon,
  FileText,
  Download,
  Users,
  Phone,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const RightDrawer: React.FC = () => {
  const {
    isRightDrawerOpen,
    toggleRightDrawer,
    activeTab,
    activeConversationId,
    activeChannelId,
    conversations,
    channels,
    messages,
    users,
    currentUser,
    createConversation,
    startCall,
    openUserProfile,
    setIsAddTeammateOpen,
  } = useWorkspace();

  const [activeTabSub, setActiveTabSub] = useState<'media' | 'files'>('media');
  const [copiedLink, setCopiedLink] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);

  if (!isRightDrawerOpen) return null;

  const isChannel = activeTab === 'channels';
  const currentConv = conversations.find((c) => c.id === activeConversationId);
  const currentChan = channels.find((c) => c.id === activeChannelId);

  const targetId = isChannel ? activeChannelId : activeConversationId;
  const currentMessages = messages[targetId] || [];

  const title = isChannel ? `#${currentChan?.name}` : currentConv?.name;
  const description = isChannel ? currentChan?.description : currentConv?.description;

  // Dynamically extract attachments from actual messages in this chat/channel
  const allAttachments = currentMessages.flatMap((m) => m.attachments || []);
  const sharedMedia = allAttachments.filter((a) => a.type === 'image');
  const sharedFiles = allAttachments.filter((a) => a.type === 'file' || a.type === 'location');

  const channelMembers = users.filter((u) =>
    isChannel
      ? currentChan?.members.includes(u.id) || !currentChan?.isPrivate
      : currentConv?.participants.includes(u.id)
  );

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${isChannel ? currentChan?.name : currentConv?.id}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="w-80 h-full bg-white/95 backdrop-blur-2xl border-l border-slate-200/80 flex flex-col z-20 shadow-xl flex-shrink-0 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <h3 className="text-xs font-bold text-slate-900">
          {isChannel ? 'Channel Details' : 'Conversation Info'}
        </h3>
        <button
          onClick={toggleRightDrawer}
          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Info Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Profile Card Header */}
        <div className="text-center pb-2">
          <div className="w-20 h-20 mx-auto rounded-3xl overflow-hidden shadow-md border-2 border-white mb-3">
            <img
              src={
                isChannel
                  ? 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=200&auto=format&fit=crop&q=80'
                  : currentConv?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200'
              }
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-500 mt-1 px-2 leading-relaxed">{description}</p>
        </div>

        {/* Action toggles: Invitation link & notifications */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Invite Link</span>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs"
            >
              {copiedLink ? <Check className="w-3 h-3 text-brand-500" /> : <Copy className="w-3 h-3" />}
              <span>{copiedLink ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">Notifications</span>
            </div>
            <button
              onClick={() => setNotificationsMuted(!notificationsMuted)}
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                notificationsMuted ? 'bg-slate-300' : 'bg-brand-600'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  notificationsMuted ? 'translate-x-0' : 'translate-x-4'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Dynamic Media & Files Tabs */}
        <div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl mb-3">
            <button
              onClick={() => setActiveTabSub('media')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTabSub === 'media'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Media ({sharedMedia.length})
            </button>
            <button
              onClick={() => setActiveTabSub('files')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTabSub === 'files'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Files ({sharedFiles.length})
            </button>
          </div>

          {activeTabSub === 'media' ? (
            sharedMedia.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {sharedMedia.map((att, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden shadow-2xs hover:scale-105 transition-transform">
                    <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                <ImageIcon className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                <span>No media shared yet</span>
              </div>
            )
          ) : (
            sharedFiles.length > 0 ? (
              <div className="space-y-1.5">
                {sharedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-brand-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{file.name}</p>
                        <p className="text-[10px] text-slate-400">{file.size}</p>
                      </div>
                    </div>
                    <a
                      href={file.url}
                      download={file.name}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                <FileText className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                <span>No files uploaded yet</span>
              </div>
            )
          )}
        </div>

        {/* Member Roster */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              Members ({channelMembers.length})
            </span>
            <button
              onClick={() => setIsAddTeammateOpen(true)}
              className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <UserPlus className="w-3 h-3" /> Add Staff
            </button>
          </div>

          <div className="space-y-1.5">
            {channelMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => openUserProfile(member)}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative flex-shrink-0">
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        member.status === 'online'
                          ? 'bg-brand-500'
                          : member.status === 'busy'
                          ? 'bg-rose-500'
                          : member.status === 'away'
                          ? 'bg-brand-500'
                          : 'bg-slate-400'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{member.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{member.role}</p>
                  </div>
                </div>

                {member.id !== currentUser.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createConversation([member.id]);
                      }}
                      className="p-1 rounded-lg hover:bg-brand-50 text-slate-400 hover:text-brand-600 transition-colors"
                      title="Direct Message"
                    >
                      <MessageSquare className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startCall('audio', member);
                      }}
                      className="p-1 rounded-lg hover:bg-brand-50 text-slate-400 hover:text-brand-600 transition-colors"
                      title="Voice Call"
                    >
                      <Phone className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
