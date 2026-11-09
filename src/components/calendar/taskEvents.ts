import type { CalendarEvent } from '../../types';
import type { TaskRow } from '../programs/TasksViews';
import { assignedIds, plainTaskNotes } from '../programs/taskFields';

export type CalendarEntry = CalendarEvent & { taskId?: string };
export type TaskDeadline = Pick<TaskRow, 'id' | 'title' | 'due_date' | 'notes' | 'assigned_ids' | 'assignee_id'>;

export function taskCalendarEntries(tasks: TaskDeadline[]): CalendarEntry[] {
  return tasks.filter((task) => task.due_date).map((task) => ({
    id: `task:${task.id}`,
    taskId: task.id,
    title: task.title,
    description: plainTaskNotes(task.notes),
    date: task.due_date!,
    startTime: '00:00',
    endTime: '23:59',
    isAllDay: true,
    scope: 'team',
    category: 'community',
    attendees: assignedIds(task),
    createdBy: '',
  }));
}
