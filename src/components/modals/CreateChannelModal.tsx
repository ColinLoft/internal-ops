import { userFacingError } from '../../lib/userFacingError';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Hash, Lock, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { ChannelMemberPicker } from './EditChannelModal';

const field = 'mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500';

export const CreateChannelModal: React.FC<{ onCreated?: () => void }> = ({ onCreated }) => {
  const { isCreateChannelOpen, setIsCreateChannelOpen, createChannel, currentUser } = useWorkspace();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [leadersOnly, setLeadersOnly] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isCreateChannelOpen) {
      setStep(0); setName(''); setDescription(''); setIsPrivate(false); setMemberIds([]); setLeadersOnly(false); setError('');
      return;
    }
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) setIsCreateChannelOpen(false); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [isCreateChannelOpen, saving, setIsCreateChannelOpen]);
  useEffect(() => { panelRef.current?.querySelector<HTMLElement>('input, button[aria-pressed], select')?.focus(); }, [step]);
  if (!isCreateChannelOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')) { setError('Enter a channel name using letters or numbers.'); setStep(0); return; }
    if (step < 2) { setError(''); setStep(step + 1); return; }
    setSaving(true); setError('');
    try {
      await createChannel({
        name: name.trim(), description: description.trim(),
        type: leadersOnly ? 'announcement' : 'standard',
        postingRoles: leadersOnly ? ['admin', 'coordinator'] : ['admin', 'coordinator', 'member'],
        isPrivate, memberIds: isPrivate ? memberIds : [],
      });
      setIsCreateChannelOpen(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the channel. Please try again.');
    } finally { setSaving(false); }
  };
  return <div role="dialog" aria-modal="true" aria-labelledby="create-channel-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <div ref={panelRef} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><h2 id="create-channel-title" className="text-lg font-semibold text-slate-900">Create a channel</h2><p className="mt-1 text-xs text-slate-500">{['Name and description', 'Visibility and members', 'Posting permissions'][step]}</p></div>
        <button type="button" aria-label="Close channel creation" disabled={saving} onClick={() => setIsCreateChannelOpen(false)} className="rounded p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-5 flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map(index => <span key={index} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-brand-600' : 'bg-slate-200'}`} />)}</div>
      <form onSubmit={submit}>
        {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{userFacingError(error)}</p>}
        <fieldset disabled={saving} className="space-y-4">
          {step === 0 && <>
            <label className="block text-sm font-medium text-slate-700">Channel name<input className={field} value={name} onChange={event => setName(event.target.value)} required maxLength={80} placeholder="e.g. flight-operations" /></label>
            <label className="block text-sm font-medium text-slate-700">Description<textarea className={`${field} resize-none`} value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="What will your team discuss here?" /></label>
          </>}
          {step === 1 && <>
            {([false, true] as const).map(privateChannel => <button key={String(privateChannel)} type="button" aria-pressed={isPrivate === privateChannel} onClick={() => setIsPrivate(privateChannel)} className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${isPrivate === privateChannel ? 'border-brand-500 bg-slate-100' : 'border-slate-200'}`}>
              {privateChannel ? <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <Hash className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
              <span><span className="block text-sm font-medium text-slate-900">{privateChannel ? 'Private channel' : 'Public channel'}</span><span className="mt-1 block text-xs text-slate-500">{privateChannel ? 'Only selected members and workspace managers can access it.' : 'Everyone in Flown can find and join the conversation.'}</span></span>
            </button>)}
            {isPrivate && <div><p className="mb-2 text-sm text-slate-700">Add people</p><ChannelMemberPicker selected={memberIds} lockedId={currentUser.id} onChange={setMemberIds} /><p className="mt-2 text-xs text-slate-500">You are included automatically.</p></div>}
          </>}
          {step === 2 && <>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-medium text-slate-900">{name}</p><p className="mt-1 text-xs text-slate-500">{isPrivate ? `Private · ${new Set([currentUser.id, ...memberIds]).size} members` : 'Public · All staff'}{description ? ` · ${description}` : ''}</p></div>
            <label className="block text-sm font-medium text-slate-700">Who can post?<select className={field} value={leadersOnly ? 'leaders' : 'all'} onChange={event => setLeadersOnly(event.target.value === 'leaders')}><option value="all">All channel members</option><option value="leaders">Admins and coordinators only</option></select></label>
            <p className="text-xs leading-relaxed text-slate-500">{leadersOnly ? 'An announcement channel. Other members can read, react and reply in threads.' : 'Members can post messages, share files, create polls and reply in threads.'} You can change these settings from the channel name later.</p>
          </>}
        </fieldset>
        <div className="mt-6 flex items-center justify-between gap-2">
          {step > 0 ? <button type="button" disabled={saving} onClick={() => { setStep(step - 1); setError(''); }} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-3.5 w-3.5" />Back</button> : <span />}
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Creating…' : step === 2 ? 'Create channel' : 'Next'}</button>
        </div>
      </form>
    </div>
  </div>;
};
