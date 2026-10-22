import React, { useState } from 'react';
import {
  User as UserIcon,
  Phone,
  Mail,
  Briefcase,
  Edit3,
  Check,
  RotateCcw,
  UserPlus,
  Users,
  LogOut,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { UserStatus } from '../../types';

export const ProfilePopover: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    currentUser,
    users,
    updateCurrentUser,
    setIsProfileSettingsOpen,
    setIsAddTeammateOpen,
    resetWorkspace,
    logout,
  } = useWorkspace();

  const [isEditingStatusMessage, setIsEditingStatusMessage] = useState(false);
  const [statusMsgText, setStatusMsgText] = useState(currentUser.statusMessage || '');

  const statuses: { label: string; value: UserStatus; color: string; desc: string }[] = [
    { label: 'Online', value: 'online', color: 'bg-emerald-500', desc: 'Active & available' },
    { label: 'Busy', value: 'busy', color: 'bg-rose-500', desc: 'Do not disturb' },
    { label: 'Away', value: 'away', color: 'bg-amber-500', desc: 'Stepped away' },
    { label: 'Offline', value: 'offline', color: 'bg-slate-400', desc: 'Invisible' },
  ];

  const handleStatusChange = (status: UserStatus) => {
    updateCurrentUser({ status });
  };

  const handleSaveStatusMessage = () => {
    updateCurrentUser({ statusMessage: statusMsgText });
    setIsEditingStatusMessage(false);
  };

  return (
    <div className="w-80 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
      {/* Header with cover & avatar */}
      <div className="bg-gradient-to-r from-brand-600 via-brand-700 to-indigo-700 p-4 text-white relative">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-white/90 shadow-md"
            />
            <span
              className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                currentUser.status === 'online'
                  ? 'bg-emerald-400'
                  : currentUser.status === 'busy'
                  ? 'bg-rose-400'
                  : currentUser.status === 'away'
                  ? 'bg-amber-400'
                  : 'bg-slate-400'
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-base truncate">{currentUser.name}</h4>
            <p className="text-brand-100 text-xs truncate">{currentUser.role}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/20 text-white border border-white/20">
                {currentUser.systemRole}
              </span>
              <span className="text-xs text-brand-200 truncate">{currentUser.department}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status selector */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/60">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5 px-1">
          Set Availability
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                currentUser.status === s.value
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200 ring-1 ring-brand-500/20'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span className="truncate">{s.label}</span>
              {currentUser.status === s.value && <Check className="w-3 h-3 text-brand-600 ml-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* Status note message */}
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-1 px-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Status Note
          </span>
          {!isEditingStatusMessage && (
            <button
              onClick={() => setIsEditingStatusMessage(true)}
              className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium"
            >
              <Edit3 className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
        {isEditingStatusMessage ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              value={statusMsgText}
              onChange={(e) => setStatusMsgText(e.target.value)}
              placeholder="What are you working on?"
              className="flex-1 px-2.5 py-1.5 text-xs bg-slate-100 rounded-lg border border-slate-200 outline-none focus:border-brand-500 focus:bg-white"
            />
            <button
              onClick={handleSaveStatusMessage}
              className="px-2 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700"
            >
              Save
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 italic">
            "{currentUser.statusMessage || 'No status set'}"
          </p>
        )}
      </div>

      {/* Contact Quick Info */}
      <div className="p-3 space-y-2 text-xs border-b border-slate-100">
        <div className="flex items-center gap-2 text-slate-600">
          <Mail className="w-3.5 h-3.5 text-slate-400" />
          <span className="truncate">{currentUser.email}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentUser.phone}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Briefcase className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentUser.department}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-2 space-y-1 bg-slate-50/80">
        <button
          onClick={() => {
            setIsProfileSettingsOpen(true);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-xl transition-all"
        >
          <UserIcon className="w-4 h-4 text-slate-500" />
          <span>Edit Profile & Contact Details</span>
        </button>

        <button
          onClick={() => {
            setIsAddTeammateOpen(true);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-xl transition-all"
        >
          <UserPlus className="w-4 h-4 text-brand-600" />
          <span>Add Teammate / Colleague</span>
        </button>

        {/* Teammates switch if more than 1 user */}
        {users.length > 1 && (
          <div className="pt-1 border-t border-slate-200/60">
            <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3" /> Switch Active Staff Account
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 overflow-x-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    updateCurrentUser({
                      id: u.id,
                      name: u.name,
                      role: u.role,
                      email: u.email,
                      avatar: u.avatar,
                      phone: u.phone,
                      department: u.department,
                      systemRole: u.systemRole,
                      status: u.status,
                      statusMessage: u.statusMessage,
                    });
                    onClose();
                  }}
                  className={`p-1 rounded-lg border transition-all ${
                    currentUser.id === u.id
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  title={`Switch to ${u.name} (${u.role})`}
                >
                  <img src={u.avatar} alt={u.name} className="w-7 h-7 rounded-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reset Workspace & Sign Out */}
        <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between">
          <button
            onClick={() => {
              if (window.confirm('Reset workspace data back to fresh empty slate? All custom messages and events will be cleared.')) {
                resetWorkspace();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 rounded-xl transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Data</span>
          </button>

          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
