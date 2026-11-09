// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskDeadline } from './taskEvents';

const mock = vi.hoisted(() => ({
  tasks: [] as TaskDeadline[],
  error: null as null | { message: string },
  refresh: undefined as undefined | (() => Promise<void>),
  navigate: vi.fn(),
  deleteEvent: vi.fn(),
}));
vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    calendarEvents: [], deleteCalendarEvent: mock.deleteEvent,
    setIsAddEventOpen: vi.fn(), startCall: vi.fn(),
    currentUser: { id: 'me', systemRole: 'admin' }, users: [],
  }),
}));
vi.mock('../../lib/navigate', () => ({ navigate: mock.navigate }));
vi.mock('../../hooks/useLiveRefresh', () => ({
  useLiveRefresh(load: () => Promise<void>) {
    mock.refresh = load;
    useEffect(() => { void load(); }, [load]);
  },
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => {
    const query = { select: () => query, not: () => query, order: () => query,
      range: async (start: number, end: number) => ({ data: mock.tasks.slice(start, end + 1), error: mock.error }) };
    return query;
  } },
}));
import { CalendarView } from './CalendarView';

let root: Root;
let container: HTMLDivElement;
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
describe('task deadlines in Calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.tasks = [{ id: 'task-1', title: 'Review release', due_date: today(), notes: null, assigned_ids: ['me'], assignee_id: null }];
    mock.error = null;
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it('shows deadlines in month, week and day, and opens the original task rather than deleting an event', async () => {
    await act(async () => root.render(<CalendarView />));
    expect(container.textContent).toContain('Review release');
    await click('Week');
    expect(container.textContent).toContain('Review release');
    expect(container.textContent).toContain('All day');
    await click('Day');
    expect(container.textContent).toContain('Review release');
    await act(async () => container.querySelector<HTMLElement>('[role="button"]')!.click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('All day');
    expect(dialog.textContent).not.toContain('Delete');
    await click('Open task');
    expect(mock.navigate).toHaveBeenCalledWith('/programs/task/task-1');
    expect(mock.deleteEvent).not.toHaveBeenCalled();
  });

  it('refreshes changed deadlines and removes entries when the due date is cleared or the task is deleted', async () => {
    await act(async () => root.render(<CalendarView />));
    mock.tasks[0] = { ...mock.tasks[0], title: 'Updated release', due_date: '2027-01-02' };
    await act(async () => mock.refresh!());
    expect(container.textContent).not.toContain('Review release');
    expect(container.textContent).toContain('Updated release');
    mock.tasks[0].due_date = null;
    await act(async () => mock.refresh!());
    expect(container.textContent).not.toContain('Updated release');
    mock.tasks = [];
    await act(async () => mock.refresh!());
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('loads beyond the first page and surfaces a query failure rather than pretending there are no deadlines', async () => {
    mock.tasks = Array.from({ length: 501 }, (_, index) => ({ ...mock.tasks[0], id: `task-${index}`, title: `Deadline ${index}` }));
    await act(async () => root.render(<CalendarView />));
    await click('+ 499 more');
    expect(container.textContent).toContain('Deadline 500');
    mock.error = { message: 'Permission denied' };
    await act(async () => mock.refresh!());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Task deadlines could not be loaded');
  });
});
