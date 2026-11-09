export const ACTIVE_TICKET_STATUSES = ['new', 'open', 'in_progress', 'waiting'] as const;

export const isActiveTicket = (status: string) =>
  ACTIVE_TICKET_STATUSES.some((active) => active === status);
