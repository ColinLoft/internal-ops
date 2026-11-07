// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksViews, TaskRow } from './TasksViews';
import { assignedIds, formatTaskDate, plainTaskNotes, TaskDateField } from './taskFields';

const state = vi.hoisted(() => ({
  update: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ currentUser: { id: 'me' }, users: [{ id: 'me', name: 'Me' }, { id: 'other', name: 'Teammate' }] }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({
    update: (body: unknown) => {
      state.update(body);
      const query = { eq: () => query, select: () => ({ single: state.save }) };
      return query;
    },
  }) },
}));
vi.mock('../common/PanelLayout', () => ({
  PanelLayout: ({ children, right }: { children: React.ReactNode; right: React.ReactNode }) => <div>{children}{right}</div>,
}));

const task: TaskRow = {
  id: 'task', title: 'Review deployment', project_id: null, assignee_id: null,
  assigned_ids: [], status: 'not_started', priority: 'medium', due_date: '2026-11-20', progress: 0, notes: 'Initial notes',
};

describe('shared tasks', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    container = document.createElement('div'); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove(); vi.unstubAllGlobals();
  });
  const render = async (onChanged = vi.fn(), onError = vi.fn()) => {
    await act(async () => { root.render(<TasksViews tasks={[task]} allTasks={[task]} projects={[]} loading={false} onChanged={onChanged} onError={onError} />); });
  };
  const drop = async (label: string) => {
    const target = container.querySelector(`[aria-label="${label}"]`)!;
    const event = new Event('drop', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: { getData: () => task.id } });
    await act(async () => { target.dispatchEvent(event); });
  };
  const column = (label: string) => container.querySelector(`[aria-label="${label}"]`)!;

  it('defaults old list preferences to Board and shows only Board and Calendar', async () => {
    localStorage.setItem('flown-tasks-mode', 'list');
    await render();
    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(['Board', 'Calendar']);
    expect(container.querySelector('[aria-selected="true"]')?.textContent).toBe('Board');
    expect(container.textContent).toContain('Nov 20, 2026');
    expect(container.textContent).toContain('Claim task');
  });

  it('moves a card immediately while saving and never writes assignment on a status edit', async () => {
    let finish!: (value: unknown) => void;
    state.save.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render();
    await drop('In progress');
    expect(column('In progress').textContent).toContain(task.title);
    expect(column('Not started').textContent).not.toContain(task.title);
    expect(state.update).toHaveBeenCalledWith({ status: 'in_progress' });
    await act(async () => { finish({ data: { ...task, status: 'in_progress' }, error: null }); });
  });

  it('rolls back denied board updates and reports the failure', async () => {
    const onError = vi.fn();
    state.save.mockResolvedValue({ data: null, error: { message: 'Permission denied' } });
    await render(vi.fn(), onError);
    await drop('In progress');
    expect(column('Not started').textContent).toContain(task.title);
    expect(onError).toHaveBeenCalledWith('Permission denied');
  });

  it('claims an unassigned task only when explicitly requested', async () => {
    state.save.mockResolvedValue({ data: { ...task, assigned_ids: ['me'] }, error: null });
    await render();
    const claim = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Claim task')!;
    await act(async () => { claim.click(); });
    expect(state.update).toHaveBeenCalledWith({ assigned_ids: ['me'] });
  });

  it('supports selecting multiple people without rendering activity or comments', async () => {
    let finish!: (value: unknown) => void;
    state.save.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await render();
    await act(async () => { container.querySelector('article button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('textarea')?.value).toBe('Initial notes');
    expect(container.textContent).not.toContain('Activity');
    expect(container.textContent).not.toContain('Comments');
    const checks = container.querySelectorAll<HTMLInputElement>('details input');
    await act(async () => { checks[0].click(); });
    expect(state.update).toHaveBeenLastCalledWith({ assigned_ids: ['me'] });
    await act(async () => { finish({ data: { ...task, assigned_ids: ['me'] }, error: null }); });
    // The parent reload supplies the saved assignment before selecting another person.
    await act(async () => { root.render(<TasksViews tasks={[{ ...task, assigned_ids: ['me'] }]} allTasks={[task]} projects={[]} loading={false} onChanged={vi.fn()} onError={vi.fn()} />); });
    state.save.mockResolvedValue({ data: { ...task, assigned_ids: ['me', 'other'] }, error: null });
    await act(async () => { container.querySelectorAll<HTMLInputElement>('details input')[1].click(); });
    expect(state.update).toHaveBeenLastCalledWith({ assigned_ids: ['me', 'other'] });
  });

  it('reads legacy assignment but respects explicitly empty assignments', () => {
    expect(assignedIds({ assignee_id: 'other' })).toEqual(['other']);
    expect(assignedIds({ assignee_id: 'other', assigned_ids: [] })).toEqual([]);
    expect(formatTaskDate('2026-01-02')).toBe('Jan 2, 2026');
    expect(plainTaskNotes('<p>First note</p><p>Second note</p>')).toBe('First note\nSecond note');
  });

  it('uses month/day/year date fields and rejects impossible dates', async () => {
    const onChange = vi.fn();
    await act(async () => { root.render(<TaskDateField value="2026-11-20" onChange={onChange} />); });
    const input = container.querySelector('input')!;
    expect(input.value).toBe('11/20/2026');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '02/30/2026');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Enter a valid date');
  });
});
