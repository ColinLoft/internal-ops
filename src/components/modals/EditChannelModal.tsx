import React, { useRef, useState } from 'react';
import { Camera, Hash, Lock, Megaphone, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Channel, UserRole } from '../../types';
import { uploadAvatarToSupabase } from '../../lib/supabase';
import { useConfirm } from '../common/useConfirm';

type Props = { channel: Channel; onClose: () => void };

const field = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-base outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 md:text-sm';

export const ChannelMemberPicker: React.FC<{ selected: string[]; lockedId?: string; onChange: (ids: string[]) => void }> = ({ selected, lockedId, onChange }) => {
  const { users } = useWorkspace();
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]);
  return (
    <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5" role="group" aria-label="Channel members">
      {users.map((user) => (
        <label key={user.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 hover:bg-white md:min-h-0 md:py-1.5">
          <input type="checkbox" checked={selected.includes(user.id) || user.id === lockedId} disabled={user.id === lockedId} onChange={() => toggle(user.id)} />
          <img src={user.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{user.name}</span>
        </label>
      ))}
    </div>
  );
};

export const EditChannelModal: React.FC<Props> = ({ channel, onClose }) => {
  const { updateChannel, deleteChannel, users, currentUser } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description);
  const [type, setType] = useState(channel.type);
  const [leadersOnly, setLeadersOnly] = useState(!channel.postingRoles.includes('member'));
  const [isPrivate, setIsPrivate] = useState(channel.isPrivate);
  const [imageUrl, setImageUrl] = useState(channel.imageUrl);
  const [members, setMembers] = useState(channel.isPrivate ? channel.members : users.map((user) => user.id));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ownerId = channel.createdBy || currentUser.id;

  const pickImage = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) { setError('Use a PNG, JPG, GIF or WebP image.'); return; }
    if (file.size > 2_000_000) { setError('Channel images must be under 2 MB.'); return; }
    setUploading(true);
    setError('');
    try { setImageUrl(await uploadAvatarToSupabase(file, `channel-${channel.id}`)); } finally { setUploading(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || uploading) return;
    const postingRoles: UserRole[] = type === 'announcement' || leadersOnly ? ['admin', 'coordinator'] : ['admin', 'coordinator', 'member'];
    setSaving(true);
    setError('');
    try {
      await updateChannel(channel.id, { name, description: description.trim() || 'General staff collaboration', type, postingRoles, isPrivate, imageUrl, memberIds: members });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!await confirm({ title: `Delete #${channel.name}?`, message: 'All messages in this channel will also be deleted. This cannot be undone.', confirmLabel: 'Delete channel' })) return;
    setSaving(true);
    try { await deleteChannel(channel.id); onClose(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete the channel.'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 backdrop-blur-sm md:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200/80 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">Edit channel</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="-m-1.5 rounded-full p-2.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 md:m-0 md:p-1"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change channel image" className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 text-brand-700">
              {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : isPrivate ? <Lock className="h-6 w-6" /> : <Hash className="h-6 w-6" />}
              <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white opacity-0 hover:opacity-100"><Camera className="h-5 w-5" /></span>
            </button>
            <div className="text-xs text-slate-500">
              <p className="font-semibold text-slate-700">{uploading ? 'Uploading…' : 'Channel image'}</p>
              {imageUrl && <button type="button" onClick={() => setImageUrl(undefined)} className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-rose-600 md:min-h-0"><Trash2 className="h-3.5 w-3.5" />Remove</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => { void pickImage(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
          <label className="block text-xs font-semibold text-slate-700">Name
            <div className="relative mt-1"><span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">#</span><input value={name} onChange={(event) => setName(event.target.value)} required className={`${field} pl-8`} /></div>
          </label>
          <label className="block text-xs font-semibold text-slate-700">Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className={`${field} mt-1 resize-none`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([['standard', 'Standard', Hash], ['announcement', 'Announcement', Megaphone]] as const).map(([key, label, Icon]) => (
              <button key={key} type="button" onClick={() => setType(key)} aria-pressed={type === key} className={`flex min-h-11 items-center gap-2 rounded-2xl border p-3 text-xs font-bold ${type === key ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-400/20' : 'border-slate-200'}`}><Icon className="h-4 w-4 text-brand-600" />{label}</button>
            ))}
          </div>
          <label className="flex min-h-11 items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-xs font-semibold text-slate-700 md:min-h-0">
            Only admins and coordinators can post
            <input type="checkbox" checked={leadersOnly || type === 'announcement'} disabled={type === 'announcement'} onChange={(event) => setLeadersOnly(event.target.checked)} />
          </label>
          <label className="flex min-h-11 items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-xs font-semibold text-slate-700 md:min-h-0">
            <span>Private channel<span className="block font-normal text-slate-500">Only chosen members can view or post</span></span>
            <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
          </label>
          {isPrivate && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700">Members ({new Set([ownerId, ...members]).size})</p>
              <ChannelMemberPicker selected={members} lockedId={ownerId} onChange={setMembers} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => void remove()} disabled={saving} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 md:min-h-0 md:py-2">Delete channel</button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-xs font-semibold text-slate-600 hover:bg-slate-100 md:min-h-0 md:py-2">Cancel</button>
              <button type="submit" disabled={saving || uploading} className="min-h-11 rounded-xl bg-brand-600 px-4 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60 md:min-h-0 md:py-2">{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
            {confirmDialog}
          </div>
        </form>
      </div>
    </div>
  );
};
