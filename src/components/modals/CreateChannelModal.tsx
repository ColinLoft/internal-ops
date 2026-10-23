import React, { useState } from 'react';
import {
  X,
  Hash,
  Megaphone,
  Lock,
  Globe,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { UserRole } from '../../types';

export const CreateChannelModal: React.FC = () => {
  const {
    isCreateChannelOpen,
    setIsCreateChannelOpen,
    createChannel,
  } = useWorkspace();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'standard' | 'announcement'>('standard');
  const [isPrivate, setIsPrivate] = useState(false);
  const [postingLevel, setPostingLevel] = useState<'leadership' | 'all'>('all');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isCreateChannelOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;

    const postingRoles: UserRole[] =
      type === 'announcement' || postingLevel === 'leadership'
        ? ['admin', 'coordinator']
        : ['admin', 'coordinator', 'member'];

    setIsSaving(true);
    setSaveError('');
    try {
      await createChannel({
        name,
        description: description.trim() || 'General staff collaboration',
        type,
        postingRoles,
        isPrivate,
      });
      setIsCreateChannelOpen(false);
      setName('');
      setDescription('');
      setType('standard');
      setPostingLevel('all');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Create New Channel</h3>
              <p className="text-xs text-slate-500 font-medium">For team or organization broadcasts</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateChannelOpen(false)}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {saveError && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Channel was not saved: {saveError}
            </p>
          )}
          {/* Channel Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Channel Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. food-drive-logistics"
                required
                className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Channel Purpose / Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel for?"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all resize-none"
            />
          </div>

          {/* Channel Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Channel Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('standard');
                  setPostingLevel('all');
                }}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  type === 'standard'
                    ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-400/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Hash className="w-4 h-4 text-brand-600" />
                  <span className="text-xs font-bold text-slate-900">Standard</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Discussion forum with threaded replies for all staff.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('announcement');
                  setPostingLevel('leadership');
                }}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  type === 'announcement'
                    ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-400/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Megaphone className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-900">Announcement</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Only leaders broadcast; staff discuss in threads.
                </p>
              </button>
            </div>
          </div>

          {/* Posting Permissions */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Posting Permissions
            </label>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="perm"
                  checked={postingLevel === 'all' && type !== 'announcement'}
                  disabled={type === 'announcement'}
                  onChange={() => setPostingLevel('all')}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-medium text-slate-700">
                  All staff members can post messages
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="perm"
                  checked={postingLevel === 'leadership' || type === 'announcement'}
                  onChange={() => setPostingLevel('leadership')}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                  Only Admins & Coordinators can broadcast
                </span>
              </label>
            </div>
          </div>

          {/* Privacy Switch */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
            <div>
              <p className="text-xs font-bold text-slate-800">Make Private Channel</p>
              <p className="text-[11px] text-slate-500">Only invited members can view or join</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${
                isPrivate ? 'bg-brand-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  isPrivate ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateChannelOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-md shadow-brand-500/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : 'Create Channel'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
