import { userFacingError } from '../../lib/userFacingError';
import React, { useEffect, useState } from 'react';
import { X, Calendar as CalendarIcon, Plus, Video, Repeat } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const input = 'w-full px-2.5 py-1.5 text-base md:text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none';

const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const AddEventModal: React.FC = () => {
  const { isAddEventOpen, setIsAddEventOpen, createCalendarEvent } = useWorkspace();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayString);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [location, setLocation] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [isCall, setIsCall] = useState(false);
  const [repeats, setRepeats] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [count, setCount] = useState(4);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAddEventOpen) return;
    setDate(todayString());
  }, [isAddEventOpen]);

  if (!isAddEventOpen) return null;

  const toggleDay = (day: number) => setDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]));

  const close = () => {
    setIsAddEventOpen(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    if (endTime <= startTime) { setError('The end time must be after the start time.'); return; }
    if (repeats && !days.length) { setError('Choose at least one day for the recurring event.'); return; }
    setSaving(true);
    setError('');
    try {
      const shared = everyone;
      await createCalendarEvent({
        title: title.trim(),
        description: description.trim(),
        date,
        startTime,
        endTime,
        scope: shared ? 'team' : 'personal',
        teamIds: [],
        isCall,
        category: shared ? 'community' : 'personal',
        location: location.trim() || undefined,
        color: shared ? '#2569F5' : '#8B5CF6',
      }, repeats ? { days, count } : undefined);
      setTitle('');
      setDescription('');
      setLocation('');
      setEveryone(true);
      setIsCall(false);
      setRepeats(false);
      setDays([]);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The event could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-y-auto max-h-[calc(100dvh-1rem)] animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600"><CalendarIcon className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Add Calendar Event</h3>
              <p className="text-xs text-slate-500 font-medium">Just for you, or shared with teams</p>
            </div>
          </div>
          <button onClick={close} aria-label="Close" className="p-2.5 -m-1.5 md:p-1 md:m-0 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{userFacingError(error)}</p>}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Event Title <span className="text-rose-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Volunteer Gala Planning Sync" required className="w-full px-3 py-2 text-base md:text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={input} /></div>
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Start</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={input} /></div>
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">End</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className={input} /></div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Visibility</label>
            <div className="grid grid-cols-2 gap-2">
              {([[true, 'Everyone'], [false, 'Only me']] as const).map(([value, name]) => (
                <button key={name} type="button" onClick={() => setEveryone(value)} aria-pressed={everyone === value} className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors md:min-h-0 ${everyone === value ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{name}</button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{everyone ? 'Visible to everyone in the organization.' : 'Only you will see this event.'}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Room</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Conference Blue" className={input} />
          </div>

          <label className="flex min-h-11 md:min-h-0 items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-2"><Video className="w-4 h-4 text-brand-600" />Schedule as a call<span className="block font-normal text-slate-500">Adds a Start call button to the event</span></span>
            <input type="checkbox" checked={isCall} onChange={(e) => setIsCall(e.target.checked)} />
          </label>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
            <label className="flex min-h-11 md:min-h-0 items-center justify-between gap-3 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-2"><Repeat className="w-4 h-4 text-brand-600" />Repeat</span>
              <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
            </label>
            {repeats && (
              <div className="mt-3 space-y-3">
                <div className="flex gap-1.5" role="group" aria-label="Repeat on">
                  {WEEKDAYS.map((label, day) => (
                    <button key={day} type="button" onClick={() => toggleDay(day)} aria-pressed={days.includes(day)} className={`h-9 w-9 rounded-full border text-xs font-bold ${days.includes(day) ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">Total occurrences
                  <input type="number" min={2} max={60} value={count} onChange={(e) => setCount(Math.max(2, Math.min(60, Number(e.target.value) || 2)))} className="w-20 px-2 py-1 text-base md:text-xs bg-white rounded-xl border border-slate-200 outline-none" />
                </label>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add agenda or details..." rows={2} className={`${input} resize-none`} />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <button type="button" onClick={close} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 rounded-xl shadow-md shadow-brand-500/25 transition-all">
              <Plus className="w-4 h-4" />
              <span>{saving ? 'Saving…' : 'Add to Calendar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
