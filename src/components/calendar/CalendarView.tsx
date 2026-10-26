import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Trash2,
  Globe,
  Lock,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const CalendarView: React.FC = () => {
  const {
    calendarEvents,
    deleteCalendarEvent,
    setIsAddEventOpen,
  } = useWorkspace();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'team' | 'personal'>('all');
  const [search, setSearch] = useState('');

  // Format today's date string YYYY-MM-DD
  const todayStr = new Date().toISOString().split('T')[0];

  // Filter events
  const filteredEvents = calendarEvents.filter((evt) => {
    const matchesSearch =
      evt.title.toLowerCase().includes(search.toLowerCase()) ||
      (evt.description && evt.description.toLowerCase().includes(search.toLowerCase()));

    if (scopeFilter === 'team') return matchesSearch && evt.scope === 'team';
    if (scopeFilter === 'personal') return matchesSearch && evt.scope === 'personal';
    return matchesSearch;
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const prevPeriod = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() - 1);
    else if (viewMode === 'week') next.setDate(next.getDate() - 7);
    else next.setDate(next.getDate() - 1);
    setCurrentDate(next);
  };

  const nextPeriod = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() + 1);
    else if (viewMode === 'week') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    setCurrentDate(next);
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  // Month Grid
  const renderMonthGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    let startingDay = firstDay.getDay() - 1;
    if (startingDay === -1) startingDay = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: { day: number; isCurrentMonth: boolean; dateStr: string }[] = [];

    // Prev month days
    for (let i = startingDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 12 : month;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${prevMonth.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      cells.push({ day: d, isCurrentMonth: false, dateStr });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      cells.push({ day: i, isCurrentMonth: true, dateStr });
    }

    // Next month days
    const totalRemaining = 35 - cells.length;
    for (let i = 1; i <= totalRemaining; i++) {
      const nextMonth = month + 2 > 12 ? 1 : month + 2;
      const nextYear = month + 2 > 12 ? year + 1 : year;
      const dateStr = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      cells.push({ day: i, isCurrentMonth: false, dateStr });
    }

    return (
      <div className="flex-1 grid grid-cols-7 grid-rows-5 border-t border-l border-slate-200/80 bg-white/70 backdrop-blur-md rounded-2xl overflow-hidden shadow-xs">
        {cells.map((cell, idx) => {
          const dayEvents = filteredEvents.filter((e) => e.date === cell.dateStr);
          const isToday = cell.dateStr === todayStr;

          return (
            <div
              key={idx}
              className={`min-h-[96px] p-2 border-r border-b border-slate-200/80 flex flex-col justify-between transition-colors ${
                cell.isCurrentMonth ? 'bg-white/60 hover:bg-white' : 'bg-slate-50/50 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                    isToday ? 'bg-brand-600 text-white shadow-xs' : cell.isCurrentMonth ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {cell.day}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
                  </span>
                )}
              </div>

              {/* Event chips */}
              <div className="space-y-1 overflow-hidden">
                {dayEvents.slice(0, 2).map((evt) => (
                  <div
                    key={evt.id}
                    className={`group/chip relative px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center justify-between gap-1 shadow-2xs border ${
                      evt.scope === 'team'
                        ? 'bg-brand-50 border-brand-200 text-brand-800'
                        : 'bg-purple-50 border-purple-200 text-purple-800'
                    }`}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: evt.color || '#2563EB' }}
                      />
                      <span className="truncate">{evt.title}</span>
                    </div>
                    <span className="text-[9px] font-medium opacity-70 whitespace-nowrap">
                      {evt.startTime}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCalendarEvent(evt.id);
                      }}
                      className="opacity-0 group-hover/chip:opacity-100 p-0.5 hover:text-rose-600 transition-opacity"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[10px] text-slate-500 font-semibold px-1">
                    + {dayEvents.length - 2} more...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Week View
  const renderWeekView = () => {
    const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const curr = new Date(currentDate);
    const dayOfWeek = curr.getDay() || 7; // 1 = Monday
    curr.setDate(curr.getDate() - dayOfWeek + 1);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(curr);
      d.setDate(curr.getDate() + i);
      return {
        name: daysOfWeek[i],
        date: d.toISOString().split('T')[0],
      };
    });

    return (
      <div className="flex-1 flex flex-col bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-700 py-2">
          <div className="text-center text-slate-400">Time</div>
          {weekDays.map((d, i) => (
            <div key={i} className="text-center">
              <span>{d.name}</span>
              <span className="ml-1 text-[11px] text-slate-400 font-normal">{d.date.slice(8)}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {hours.map((hr, idx) => (
            <div key={idx} className="grid grid-cols-8 min-h-[58px] border-b border-slate-100">
              <div className="text-center text-[11px] text-slate-400 font-semibold py-2 border-r border-slate-100">
                {hr}
              </div>
              {weekDays.map((day, dIdx) => {
                const hourEvents = filteredEvents.filter(
                  (e) => e.date === day.date && e.startTime.startsWith(hr.slice(0, 2))
                );

                return (
                  <div key={dIdx} className="p-1 border-r border-slate-100 relative hover:bg-slate-50/50">
                    {hourEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className={`p-1.5 rounded-xl border text-[11px] font-semibold shadow-2xs leading-tight ${
                          evt.scope === 'team'
                            ? 'bg-brand-50 border-brand-200 text-brand-900'
                            : 'bg-purple-50 border-purple-200 text-purple-900'
                        }`}
                      >
                        <p className="truncate font-bold">{evt.title}</p>
                        <p className="text-[10px] opacity-75">{evt.startTime} - {evt.endTime}</p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Day View
  const renderDayView = () => {
    const selectedDateStr = currentDate.toISOString().split('T')[0];
    const todayEvents = filteredEvents.filter((e) => e.date === selectedDateStr);

    return (
      <div className="flex-1 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200/80 p-6 overflow-y-auto shadow-xs">
        <div className="mb-4 pb-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h3>
            <p className="text-xs text-slate-500">{todayEvents.length} sessions scheduled</p>
          </div>
          <button
            onClick={() => setIsAddEventOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" /> Add Slot
          </button>
        </div>

        {todayEvents.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No events for this date</h4>
            <p className="text-xs text-slate-400 mt-1 mb-4">Click below to schedule a team or personal session.</p>
            <button
              onClick={() => setIsAddEventOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Schedule Event
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {todayEvents.map((evt) => (
              <div
                key={evt.id}
                className={`p-4 rounded-2xl border shadow-xs flex items-center justify-between ${
                  evt.scope === 'team'
                    ? 'bg-brand-50/70 border-brand-200'
                    : 'bg-purple-50/70 border-purple-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        evt.scope === 'team'
                          ? 'bg-brand-600 text-white'
                          : 'bg-purple-600 text-white'
                      }`}
                    >
                      {evt.scope === 'team' ? 'Whole Team Event' : 'Personal Event'}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {evt.startTime} - {evt.endTime}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{evt.title}</h4>
                  {evt.description && <p className="text-xs text-slate-600">{evt.description}</p>}
                  {evt.location && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 pt-1">
                      <MapPin className="w-3.5 h-3.5 text-brand-600" /> {evt.location}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => deleteCalendarEvent(evt.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-white transition-colors"
                  title="Remove Event"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50/50">
      {/* Left Mini Sidebar */}
      <div className="w-72 border-r border-slate-200/80 bg-white/80 backdrop-blur-xl p-4 flex flex-col gap-5 flex-shrink-0 overflow-y-auto">
        {/* Scope Filters */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
            Event View Filter
          </label>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setScopeFilter('all')}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                scopeFilter === 'all'
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>All Events</span>
              <span className="text-[10px] bg-white px-1.5 py-0.5 rounded-full border border-slate-200 font-bold">
                {calendarEvents.length}
              </span>
            </button>
            <button
              onClick={() => setScopeFilter('team')}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                scopeFilter === 'team'
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-brand-600" />
                <span>Shared / Whole Team</span>
              </div>
              <span className="text-[10px] bg-white px-1.5 py-0.5 rounded-full border border-slate-200 font-bold">
                {calendarEvents.filter((e) => e.scope === 'team').length}
              </span>
            </button>
            <button
              onClick={() => setScopeFilter('personal')}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                scopeFilter === 'personal'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-600" />
                <span>Personal Events</span>
              </div>
              <span className="text-[10px] bg-white px-1.5 py-0.5 rounded-full border border-slate-200 font-bold">
                {calendarEvents.filter((e) => e.scope === 'personal').length}
              </span>
            </button>
          </div>
        </div>

        {/* Mini Calendar Widget */}
        <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/70 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={prevPeriod} className="p-1 hover:bg-white rounded-md text-slate-500">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={nextPeriod} className="p-1 hover:bg-white rounded-md text-slate-500">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 mb-1">
            <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
              const thisDateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              const hasEvents = calendarEvents.some((e) => e.date === thisDateStr);
              const isSelected = currentDate.getDate() === day;

              return (
                <div
                  key={day}
                  onClick={() => {
                    const next = new Date(currentDate);
                    next.setDate(day);
                    setCurrentDate(next);
                  }}
                  className={`relative py-1 rounded-lg cursor-pointer transition-colors text-[11px] font-medium ${
                    isSelected
                      ? 'bg-brand-600 text-white font-bold'
                      : 'hover:bg-slate-200/70 text-slate-700'
                  }`}
                >
                  <span>{day}</span>
                  {hasEvents && !isSelected && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming List */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-600" /> Upcoming
            </span>
          </div>
          {filteredEvents.length === 0 ? (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
              <p className="text-xs text-slate-400 mb-2">No upcoming events</p>
              <button
                onClick={() => setIsAddEventOpen(true)}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center justify-center gap-1 mx-auto"
              >
                <Plus className="w-3 h-3" /> Schedule One
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.slice(0, 4).map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 shadow-2xs transition-all space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                        evt.scope === 'team'
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {evt.scope === 'team' ? 'Whole Team' : 'Personal'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">{evt.startTime}</span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-800 truncate">{evt.title}</h5>
                  <p className="text-[11px] text-slate-400 truncate">{evt.date}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div data-onboarding-target="calendar-controls" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Org Wide Calendar & Personal Calendar
              </p>
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-xl shadow-2xs ml-4">
              <button
                onClick={prevPeriod}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToday}
                className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={nextPeriod}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-slate-200/70 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'month' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'week' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'day' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Day
              </button>
            </div>

            <button
              onClick={() => setIsAddEventOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/25 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Event</span>
            </button>
          </div>
        </div>

        {viewMode === 'month' && (
          <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500 py-2 border-b border-slate-200 bg-white/40 rounded-t-xl">
            {daysOfWeek.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
        )}

        {viewMode === 'month' && renderMonthGrid()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'day' && renderDayView()}
      </div>
    </div>
  );
};
