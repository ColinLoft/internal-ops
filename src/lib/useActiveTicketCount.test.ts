import { describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ in: vi.fn(), select: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: mock.from } }));
import { loadActiveTicketCount } from './useActiveTicketCount';
describe('shared active ticket count', () => {
  it('counts exact authorized tickets across all four active statuses, with no row limit', async () => {
    mock.from.mockReturnValue({ select: mock.select });
    mock.select.mockReturnValue({ in: mock.in });
    mock.in.mockResolvedValue({ count: 1001, error: null });
    expect(await loadActiveTicketCount()).toBe(1001);
    expect(mock.from).toHaveBeenCalledWith('support_tickets');
    expect(mock.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(mock.in).toHaveBeenCalledWith('status', ['new', 'open', 'in_progress', 'waiting']);
  });
  it('does not silently turn a failed or missing count into zero', async () => {
    mock.from.mockReturnValue({ select: mock.select });
    mock.select.mockReturnValue({ in: mock.in });
    mock.in.mockResolvedValue({ count: null, error: { message: 'permission denied' } });
    await expect(loadActiveTicketCount()).rejects.toEqual({ message: 'permission denied' });
    mock.in.mockResolvedValue({ count: null, error: null });
    await expect(loadActiveTicketCount()).rejects.toThrow('invalid response');
  });
});
