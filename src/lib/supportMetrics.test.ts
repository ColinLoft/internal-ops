import { describe, expect, it } from 'vitest';
import { ACTIVE_TICKET_STATUSES, isActiveTicket } from './supportMetrics';

describe('support metrics', () => {
  it('uses the same active statuses for query filters and row counts', () => {
    expect(ACTIVE_TICKET_STATUSES).toEqual(['new', 'open', 'in_progress', 'waiting']);
    expect(['new', 'open', 'in_progress', 'waiting', 'resolved', 'closed'].filter(isActiveTicket)).toEqual([...ACTIVE_TICKET_STATUSES]);
  });
});
