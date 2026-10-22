import React, { useState } from 'react';
import { X, Calendar as CalendarIcon, Globe, Lock, Plus, MapPin } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { CalendarScope, EventCategory } from '../../types';

export const AddEventModal: React.FC = () => {
  const {
    isAddEventOpen,
    setIsAddEventOpen,
    createCalendarEvent,
  } = useWorkspace();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('2026-10-26');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [scope, setScope] = useState<CalendarScope>('team');
  const [category, setCategory] = useState<EventCategory>('community');
  const [location, setLocation] = useState('');

  if (!isAddEventOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createCalendarEvent({
      title: title.trim(),
      description: description.trim(),
      date,
      startTime,
      endTime,
      scope,
      category,
      location: location.trim() || undefined,
      color: scope === 'team' ? '#2563EB' : '#8B5CF6',
    });

    setIsAddEventOpen(false);
    setTitle('');
    setDescription('');
    setLocation('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Add Calendar Event</h3>
              <p className="text-xs text-slate-500 font-medium">Add personal commitments or team sessions</p>
            </div>
          </div>
          <button
            onClick={() => setIsAddEventOpen(false)}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Scope Selector: Whole Team vs Personal (critical requirement) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Event Visibility & Scope <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('team')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'team'
                    ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-400/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-brand-600" />
                  <span className="text-xs font-bold text-slate-900">Whole Team</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Shares with everyone in the organization and alerts staff.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('personal')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  scope === 'personal'
                    ? 'border-purple-500 bg-purple-50/70 ring-2 ring-purple-400/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-slate-900">Personal Event</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Private to you (one-on-one prep, personal appointments).
                </p>
              </button>
            </div>
          </div>

          {/* Event Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Event Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Volunteer Gala Planning Sync"
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          {/* Category & Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              >
                <option value="standup">Standup Sync</option>
                <option value="community">Community Outreach</option>
                <option value="fundraiser">Fundraiser / Gala</option>
                <option value="board">Executive Board</option>
                <option value="personal">Personal / Deep Work</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Room</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Conference Blue"
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add agenda or details..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddEventOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-md shadow-brand-500/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Calendar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
