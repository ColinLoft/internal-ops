import { useEffect, useId } from 'react';
import { supabase } from '../lib/supabase';

// Realtime is the fast path; polling also covers tables not yet published to Realtime.
export function useLiveRefresh(load: () => Promise<void>, tables: readonly string[]) {
  const id = useId();
  const tableKey = tables.join(',');
  useEffect(() => {
    let disposed = false;
    let running = false;
    let queued = false;
    const refresh = async () => {
      if (disposed) return;
      if (running) { queued = true; return; }
      running = true;
      try {
        do {
          queued = false;
          await load();
        } while (queued && !disposed);
      } catch (error) {
        console.error('Live workspace refresh failed:', error);
      } finally {
        running = false;
      }
    };
    let channel = supabase.channel(`flown-live-${id}`);
    for (const table of tableKey.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh());
    }
    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('Live subscription failed; polling remains active:', error);
    });
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(onVisible, 5000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, tableKey, id]);
}
