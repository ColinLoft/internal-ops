import React, { useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { NotificationItem } from '../../types';

export const LeaveRequestModal: React.FC<{ userId: string; onClose: () => void; onSubmitted?: () => void; addNotification?: (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'isRead'>) => void }> = ({ userId, onClose, onSubmitted, addNotification }) => {
  const [leaveType, setLeaveType] = useState('vacation');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!startsOn || !endsOn || endsOn < startsOn) return setError('Choose a valid start and end date.');
    setSaving(true);
    const { error: saveError } = await supabase.from('organization_leave_requests').insert({ employee_id: userId, leave_type: leaveType, starts_on: startsOn, ends_on: endsOn, reason: reason.trim() || null });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    addNotification?.({
      type: 'organization',
      title: 'Leave request submitted',
      description: `Your ${leaveType} request for ${startsOn} to ${endsOn} is pending admin review.`,
      linkTab: 'organization',
    });
    onSubmitted?.();
    onClose();
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Time away</p><h2 className="mt-1 text-lg font-bold text-slate-900">Request leave</h2></div><button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button></div><div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-slate-600">Leave type<select value={leaveType} onChange={(event) => setLeaveType(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="vacation">Vacation / PTO</option><option value="sick">Sick leave</option><option value="personal">Personal leave</option></select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">From<input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><label className="text-xs font-semibold text-slate-600">To<input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label></div><label className="block text-xs font-semibold text-slate-600">Note (optional)<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label></div>{error && <p className="mt-3 text-xs text-rose-700">{error}</p>}<button type="button" disabled={saving} onClick={() => void submit()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><CalendarDays className="h-3.5 w-3.5" />{saving ? 'Submitting...' : 'Submit request'}</button></div></div>;
};
