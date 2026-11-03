import React, { useState } from 'react';
import { CalendarEvent } from '../../types';
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
  Video,
  X,
  Users,
  Repeat,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TEAM_PALETTE = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#EC4899', '#14B8A6', '#84CC16'];
const EVERYONE_COLOR = '#2563EB';
const PERSONAL_COLOR = '#8B5CF6';
const teamColor = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TEAM_PALETTE[hash % TEAM_PALETTE.length];
};
const eventGroup = (evt: CalendarEvent, myTeam: string) => {
  if (evt.scope === 'personal') return { key: 'personal', label: 'Personal', color: PERSONAL_COLOR };
  const teams = evt.teamIds || [];
  if (!teams.length) return { key: 'everyone', label: 'Everyone', color: EVERYONE_COLOR };
  const team = teams.includes(myTeam) ? myTeam : teams[0];
  return { key: `team:${team}`, label: teams.join(', '), color: teamColor(team) };
};

export const CalendarView: React.FC = () => {
  const {
    calendarEvents,
    deleteCalendarEvent,
    setIsAddEventOpen,
    startCall,
    currentUser,
    users,
  } = useWorkspace();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const myTeam = currentUser.department || '';
  const [search, setSearch] = useState('');

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Format today's date string YYYY-MM-DD
  const todayStr = toLocalDateStr(new Date());

  // Filter events
  const filteredEvents = calendarEvents.filter((evt) => {
    const matchesSearch =
      evt.title.toLowerCase().includes(search.toLowerCase()) ||
      (evt.description && evt.description.toLowerCase().includes(search.toLowerCase()));

    if (scopeFilter === 'all') return matchesSearch;
    const group = eventGroup(evt, myTeam);
    if (scopeFilter.startsWith('team:')) return matchesSearch && (evt.teamIds || []).includes(scopeFilter.slice(5));
    return matchesSearch && group.key === scopeFilter;
  });
  const nowDate = new Date();
  const nowTimeStr = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`;
  const upcomingEvents = filteredEvents
    .filter((evt) => evt.date > todayStr || (evt.date === todayStr && (evt.endTime || evt.startTime) >= nowTimeStr))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const filterOptions = [
    { key: 'all', label: 'All Events', color: '#64748B', icon: CalendarIcon },
    { key: 'everyone', label: 'Everyone', color: EVERYONE_COLOR, icon: Globe },
    ...(myTeam ? [{ key: `team:${myTeam}`, label: myTeam, color: teamColor(myTeam), icon: Users }] : []),
    { key: 'personal', label: 'Personal', color: PERSONAL_COLOR, icon: Lock },
  ];
  const countFor = (key: string) => key === 'all'
    ? calendarEvents.length
    : calendarEvents.filter((evt) => key.startsWith('team:') ? (evt.teamIds || []).includes(key.slice(5)) : eventGroup(evt, myTeam).key === key).length;

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
      <div className="flex-1 grid grid-cols-7 grid-rows-5 min-h-[480px] md:min-h-0 border-t border-l border-slate-200/80 bg-white rounded-2xl overflow-hidden shadow-xs">
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
                  <span className="text-xs text-slate-400 font-medium">
                    {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
                  </span>
                )}
              </div>

              {/* Event chips */}
              <div className="space-y-1 overflow-hidden">
                {dayEvents.slice(0, 2).map((evt) => {
                  const group = eventGroup(evt, myTeam);
                  return (
                    <button
                      type="button"
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      style={{ backgroundColor: `${group.color}1F`, borderColor: `${group.color}66` }}
                      className="w-full px-2 py-1 rounded-lg text-xs font-semibold flex items-center justify-between gap-1 border text-left text-slate-800 hover:brightness-95"
                    >
                      <span className="flex items-center gap-1 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                        <span className="truncate">{evt.title}</span>
                      </span>
                      <span className="text-xs font-medium opacity-70 whitespace-nowrap">{formatTime(evt.startTime)}</span>
                    </button>
                  );
                })}
                {dayEvents.length > 2 && (
                  <div className="text-xs text-slate-500 font-semibold px-1">
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
    const hours = Array.from({ length: 16 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);
    const curr = new Date(currentDate);
    const dayOfWeek = curr.getDay() || 7; // 1 = Monday
    curr.setDate(curr.getDate() - dayOfWeek + 1);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(curr);
      d.setDate(curr.getDate() + i);
      return {
        name: daysOfWeek[i],
        date: toLocalDateStr(d),
      };
    });

    return (
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50/80 text-xs font-bold text-slate-700 py-2">
          <div className="text-center text-slate-400">Time</div>
          {weekDays.map((d, i) => (
            <div key={i} className="text-center">
              <span>{d.name}</span>
              <span className="ml-1 text-xs text-slate-400 font-normal">{d.date.slice(8)}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {hours.map((hr, idx) => (
            <div key={idx} className="grid grid-cols-8 min-h-[58px] border-b border-slate-100">
              <div className="text-center text-xs text-slate-400 font-semibold py-2 border-r border-slate-100">
                {formatTime(hr)}
              </div>
              {weekDays.map((day, dIdx) => {
                const hourEvents = filteredEvents.filter(
                  (e) => e.date === day.date && e.startTime.startsWith(hr.slice(0, 2))
                );

                return (
                  <div key={dIdx} className="p-1 border-r border-slate-100 relative hover:bg-slate-50/50">
                    {hourEvents.map((evt) => {
                      const group = eventGroup(evt, myTeam);
                      return (
                        <button
                          type="button"
                          key={evt.id}
                          onClick={() => setSelectedEvent(evt)}
                          style={{ backgroundColor: `${group.color}1F`, borderColor: `${group.color}66` }}
                          className="w-full p-1.5 rounded-xl border text-left text-xs font-semibold leading-tight text-slate-800 hover:brightness-95"
                        >
                          <p className="truncate font-bold">{evt.title}</p>
                          <p className="text-xs opacity-75">{formatTime(evt.startTime)} - {formatTime(evt.endTime)}</p>
                        </button>
                      );
                    })}
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
    const selectedDateStr = toLocalDateStr(currentDate);
    const todayEvents = filteredEvents.filter((e) => e.date === selectedDateStr);

    return (
      <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 p-4 md:p-6 overflow-y-auto shadow-xs">
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
            {todayEvents.map((evt) => {
              const group = eventGroup(evt, myTeam);
              return (
                <div
                  key={evt.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEvent(evt)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedEvent(evt); }}
                  style={{ backgroundColor: `${group.color}14`, borderColor: `${group.color}55` }}
                  className="p-4 rounded-2xl border shadow-xs flex items-center justify-between cursor-pointer hover:brightness-95"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold  px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: group.color }}>{group.label}</span>
                      <span className="text-xs font-bold text-slate-500">{formatTime(evt.startTime)} - {formatTime(evt.endTime)}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">{evt.title}</h4>
                    {evt.description && <p className="text-xs text-slate-600 line-clamp-2">{evt.description}</p>}
                    {evt.location && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 pt-1"><MapPin className="w-3.5 h-3.5 text-brand-600" /> {evt.location}</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-brand-600">Details</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-slate-50/50">
      {/* Left Mini Sidebar */}
      <div className="order-2 md:order-1 w-full md:w-72 border-t md:border-t-0 md:border-r border-slate-200/80 bg-white p-4 flex flex-col gap-5 flex-shrink-0 md:overflow-y-auto">
        {/* Scope Filters */}
        <div>
          <label className="text-xs font-bold  text-slate-400 block mb-2 px-1">
            Event View Filter
          </label>
          <div className="flex flex-col gap-1">
            {filterOptions.map(({ key, label, color, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setScopeFilter(key)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  scopeFilter === key ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{label}</span>
                </span>
                <span className="text-xs bg-white px-1.5 py-0.5 rounded-full border border-slate-200 font-bold">{countFor(key)}</span>
              </button>
            ))}
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
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-1">
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
                  className={`relative py-1 rounded-lg cursor-pointer transition-colors text-xs font-medium ${
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
          {upcomingEvents.length === 0 ? (
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
              {upcomingEvents.slice(0, 5).map((evt) => {
                const group = eventGroup(evt, myTeam);
                return (
                  <button
                    type="button"
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className="w-full text-left p-2.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 shadow-2xs transition-all space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold  flex items-center gap-1.5" style={{ color: group.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />{group.label}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">{formatTime(evt.startTime)}</span>
                    </div>
                    <h5 className="text-xs font-bold text-slate-800 truncate">{evt.title}</h5>
                    <p className="text-xs text-slate-400 truncate">{new Date(`${evt.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Calendar Area */}
      <div className="order-1 md:order-2 flex-1 flex flex-col p-3 md:p-6 md:overflow-hidden min-w-0">
        <div data-onboarding-target="calendar-controls" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Org Wide Calendar & Personal Calendar
              </p>
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5 rounded-xl shadow-2xs ml-2 md:ml-4">
              <button
                onClick={prevPeriod}
                className="p-3 md:p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                title="Previous"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToday}
                className="px-2.5 py-3 md:py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={nextPeriod}
                className="p-3 md:p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                title="Next"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-0.5 bg-slate-200/70 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-3 md:py-1.5 rounded-lg transition-all ${
                  viewMode === 'month' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-3 md:py-1.5 rounded-lg transition-all ${
                  viewMode === 'week' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-3 md:py-1.5 rounded-lg transition-all ${
                  viewMode === 'day' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Day
              </button>
            </div>

            <button
              onClick={() => setIsAddEventOpen(true)}
              className="flex items-center gap-1.5 px-4 py-3 md:py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-500/25 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add Event</span>
            </button>
          </div>
        </div>

        <div className={viewMode === 'day' ? 'contents' : 'flex-1 flex flex-col overflow-x-auto md:overflow-visible'}>
        <div className={viewMode === 'day' ? 'contents' : 'flex-1 flex flex-col min-w-[640px] md:min-w-0'}>
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
      </div>

      {selectedEvent && (() => {
        const evt = selectedEvent;
        const group = eventGroup(evt, myTeam);
        const creator = users.find((user) => user.id === evt.createdBy);
        const attendees = (evt.attendees || []).map((id) => users.find((user) => user.id === id)).filter(Boolean);
        const canDelete = evt.createdBy === currentUser.id || currentUser.systemRole === 'admin' || currentUser.systemRole === 'coordinator';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 md:p-4" onClick={() => setSelectedEvent(null)}>
            <div role="dialog" aria-label="Event details" onClick={(e) => e.stopPropagation()} className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
              <div className="h-2 rounded-t-3xl" style={{ backgroundColor: group.color }} />
              <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold " style={{ color: group.color }}>{group.label}</span>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{evt.title}</h3>
                  </div>
                  <button type="button" onClick={() => setSelectedEvent(null)} aria-label="Close" className="-m-1.5 rounded-full p-2.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
                </div>
                <dl className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-600" />{new Date(`${evt.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {formatTime(evt.startTime)} – {formatTime(evt.endTime)}</div>
                  {evt.location && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-600" />{evt.location}</div>}
                  {evt.isCall && <div className="flex items-center gap-2"><Video className="h-4 w-4 text-brand-600" />Scheduled as a call</div>}
                  {evt.recurrenceId && <div className="flex items-center gap-2"><Repeat className="h-4 w-4 text-brand-600" />Part of a recurring series</div>}
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-brand-600" />{evt.scope === 'personal' ? 'Only you' : evt.teamIds?.length ? `Shared with ${evt.teamIds.join(', ')}` : 'Shared with everyone'}</div>
                  {creator && <div className="text-slate-500">Created by {creator.name}</div>}
                </dl>
                {evt.description && <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">{evt.description}</p>}
                {attendees.length > 0 && evt.scope !== 'personal' && (
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-slate-700">Invited ({attendees.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {attendees.map((user) => user && <span key={user.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs text-slate-700"><img src={user.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />{user.name}</span>)}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {canDelete ? (
                    <button type="button" onClick={() => { void deleteCalendarEvent(evt.id); setSelectedEvent(null); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 md:min-h-0 md:py-2"><Trash2 className="h-4 w-4" />Delete</button>
                  ) : <span />}
                  {evt.isCall && (
                    <button type="button" onClick={() => { void startCall('video', undefined, undefined, evt.attendees); setSelectedEvent(null); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><Video className="h-4 w-4" />Start call</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
