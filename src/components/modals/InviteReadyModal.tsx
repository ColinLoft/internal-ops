import React, { useState } from 'react';
import { Check, Copy, KeyRound, Link as LinkIcon, Mail, UserCheck, X } from 'lucide-react';

interface InviteReadyModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteData: {
    name: string;
    email: string;
    role: string;
    systemRole: string;
    temporaryPassword: string;
    loginUrl: string;
  } | null;
}

export const InviteReadyModal: React.FC<InviteReadyModalProps> = ({
  isOpen,
  onClose,
  inviteData,
}) => {
  const [copyError, setCopyError] = useState('');
  const [copiedField, setCopiedField] = useState<'password' | 'url' | null>(null);

  if (!isOpen || !inviteData) return null;

  const copyValue = async (field: 'password' | 'url', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setCopyError('');
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopyError('Clipboard access failed. Select and copy the value manually.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Banner */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Staff Account Created</h3>
              <p className="text-brand-100 text-xs">Temporary sign-in details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-brand-100 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Credentials Card */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            No email is sent. Share these details with <span className="font-bold text-slate-900">{inviteData.name}</span> through a secure channel. The temporary password is shown only once; they will be required to replace it after signing in.
          </p>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Employee</span>
              <span className="font-bold text-slate-800">{inviteData.name} ({inviteData.role})</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Login Email</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-brand-600" />
                {inviteData.email}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Permissions</span>
              <span className="capitalize font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                {inviteData.systemRole}
              </span>
            </div>
            <div className="space-y-1.5 border-t border-slate-200 pt-3">
              <label htmlFor="staff-login-url" className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <LinkIcon className="h-3.5 w-3.5" /> Sign-in page
              </label>
              <div className="flex gap-2">
                <input id="staff-login-url" readOnly value={inviteData.loginUrl} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700" />
                <button type="button" onClick={() => void copyValue('url', inviteData.loginUrl)} className="flex items-center gap-1 rounded-lg bg-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-300">
                  {copiedField === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedField === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-slate-200 pt-3">
              <label htmlFor="staff-temp-password" className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <KeyRound className="h-3.5 w-3.5" /> One-time password
              </label>
              <div className="flex gap-2">
                <input id="staff-temp-password" readOnly value={inviteData.temporaryPassword} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 font-mono text-xs text-slate-700" />
                <button type="button" onClick={() => void copyValue('password', inviteData.temporaryPassword)} className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 text-xs font-semibold text-white hover:bg-brand-700">
                  {copiedField === 'password' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedField === 'password' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

          </div>
          {copyError && <p role="alert" className="text-xs font-semibold text-rose-700">{copyError}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onClose}
              className="ml-auto py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
