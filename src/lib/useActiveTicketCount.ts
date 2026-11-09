import { useCallback, useState } from 'react';
import { supabase } from './supabase';
import { ACTIVE_TICKET_STATUSES } from './supportMetrics';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

export async function loadActiveTicketCount(): Promise<number> {
  const { count, error } = await supabase.from('support_tickets')
    .select('id', { count: 'exact', head: true }).in('status', [...ACTIVE_TICKET_STATUSES]);
  if (error) throw error;
  if (typeof count !== 'number') throw new Error('Support count returned an invalid response.');
  return count;
}

export function useActiveTicketCount() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setCount(await loadActiveTicketCount()); setError(''); }
    catch (cause) {
      console.error('Active support count could not be loaded:', cause);
      setCount(null);
      setError('Ticket totals could not be loaded. Refresh to retry.');
    }
  }, []);
  useLiveRefresh(load, ['support_tickets']);
  return { count, error, refresh: load };
}
