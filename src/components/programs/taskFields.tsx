import React, { useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const assignedIds = (task: { assigned_ids?: string[]; assignee_id: string | null }) =>
  task.assigned_ids ?? (task.assignee_id ? [task.assignee_id] : []);

// Accepts date-only values ("2026-11-12") and full timestamps; returns null for anything unparseable.
export const parseTaskDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatTaskDate = (value: string | null | undefined) => {
  const date = parseTaskDate(value);
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date';
};

export const plainTaskNotes = (value: string | null | undefined) => {
  if (!value || !/<\/?[a-z][^>]*>/i.test(value)) return value || '';
  const document = new DOMParser().parseFromString(value, 'text/html');
  document.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  document.querySelectorAll('p, div, li').forEach((element) => element.append('\n'));
  return (document.body.textContent || '').trimEnd();
};

export const AssignedField: React.FC<{ value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const { users } = useWorkspace();
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-xs font-semibold text-slate-500">Assigned</legend>
      <details className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700">
        <summary className="cursor-pointer">{value.length ? users.filter((user) => value.includes(user.id)).map((user) => user.name).join(', ') || `${value.length} people` : 'Unassigned'}</summary>
        <div className="mt-2 max-h-48 space-y-2 overflow-auto">
          {users.map((user) => <label key={user.id} className="flex items-center gap-2">
            <input type="checkbox" checked={value.includes(user.id)} onChange={(event) => onChange(event.target.checked ? [...value, user.id] : value.filter((id) => id !== user.id))} />
            {user.name}
          </label>)}
        </div>
      </details>
    </fieldset>
  );
};

export const TaskDateField: React.FC<{ value: string | null; onChange: (value: string | null) => void; label?: string }> = ({ value, onChange, label = 'Due date' }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const commit = () => {
    if (draft === null) return;
    if (!draft.trim()) { setError(''); setDraft(null); onChange(null); return; }
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(draft.trim());
    if (match) {
      const [, month, day, year] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
      if (date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)) {
        setError(''); setDraft(null);
        onChange(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        return;
      }
    }
    setError('Enter a valid date as MM/DD/YYYY.');
  };
  const formatted = value ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}` : '';
  return <label className="block text-xs font-semibold text-slate-500">{label}
    <input aria-label={label} placeholder="MM/DD/YYYY" value={draft ?? formatted} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" />
    {error && <span role="alert" className="mt-1 block text-rose-600">{error}</span>}
  </label>;
};
