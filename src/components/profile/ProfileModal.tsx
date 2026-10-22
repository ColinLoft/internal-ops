import React from 'react';
import {
  X,
  Phone,
  Mail,
  Briefcase,
  MapPin,
  MessageSquare,
  Video,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const ProfileModal: React.FC = () => {
  const {
    activeProfileModalUser,
    closeUserProfile,
    createConversation,
    startCall,
    currentUser,
  } = useWorkspace();

  if (!activeProfileModalUser) return null;

  const isSelf = activeProfileModalUser.id === currentUser.id;

  const handleStartMessage = () => {
    createConversation([activeProfileModalUser.id]);
    closeUserProfile();
  };

  const handleVoiceCall = () => {
    startCall('audio', activeProfileModalUser);
    closeUserProfile();
  };

  const handleVideoCall = () => {
    startCall('video', activeProfileModalUser);
    closeUserProfile();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Banner */}
        <div className="h-28 bg-gradient-to-r from-brand-600 via-indigo-600 to-sky-600 relative p-4 flex justify-end">
          <button
            onClick={closeUserProfile}
            className="p-1.5 rounded-full bg-black/20 hover:bg-black/30 text-white backdrop-blur-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Avatar & Header */}
        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex justify-between items-end -mt-14 mb-4">
            <div className="relative">
              <img
                src={activeProfileModalUser.avatar}
                alt={activeProfileModalUser.name}
                className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-xl"
              />
              <span
                className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${
                  activeProfileModalUser.status === 'online'
                    ? 'bg-emerald-500'
                    : activeProfileModalUser.status === 'busy'
                    ? 'bg-rose-500'
                    : activeProfileModalUser.status === 'away'
                    ? 'bg-amber-500'
                    : 'bg-slate-400'
                }`}
                title={`Status: ${activeProfileModalUser.status}`}
              />
            </div>

            {/* Quick action buttons if not self */}
            {!isSelf && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartMessage}
                  className="p-2.5 rounded-2xl bg-brand-50 hover:bg-brand-100 text-brand-600 transition-colors shadow-xs"
                  title="Direct Message"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={handleVoiceCall}
                  className="p-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors shadow-xs"
                  title="Voice Call"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  onClick={handleVideoCall}
                  className="p-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors shadow-xs"
                  title="Video Call"
                >
                  <Video className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* User info */}
          <div className="space-y-1 mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900">{activeProfileModalUser.name}</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                <ShieldCheck className="w-3 h-3 text-brand-500" />
                {activeProfileModalUser.systemRole}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-600">{activeProfileModalUser.role}</p>
            <p className="text-xs text-slate-400">{activeProfileModalUser.department}</p>
          </div>

          {/* Status Message or Last Seen */}
          <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 mb-5">
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeProfileModalUser.status === 'online'
                    ? 'bg-emerald-500'
                    : 'bg-slate-400'
                }`}
              />
              <span className="capitalize">{activeProfileModalUser.status}</span>
              {activeProfileModalUser.status === 'offline' && activeProfileModalUser.lastSeen && (
                <span className="text-slate-400 text-xs flex items-center gap-1 ml-auto">
                  <Clock className="w-3 h-3" /> Last seen {activeProfileModalUser.lastSeen}
                </span>
              )}
            </div>
            {activeProfileModalUser.statusMessage && (
              <p className="mt-1.5 text-xs text-slate-700 italic">
                "{activeProfileModalUser.statusMessage}"
              </p>
            )}
          </div>

          {/* Contact Details List */}
          <div className="space-y-2.5 text-xs border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="font-medium">{activeProfileModalUser.email}</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Email</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="font-medium">{activeProfileModalUser.phone}</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Phone</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-slate-600">
                <Briefcase className="w-4 h-4 text-slate-400" />
                <span className="font-medium">{activeProfileModalUser.department}</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Org Team</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="font-medium">San Francisco Regional Center</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Office</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
