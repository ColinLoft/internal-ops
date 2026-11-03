import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type RecordHit = { id: string; type: string; title: string; detail: string; path: string };

const sources: { type: string; table: string; column: string; detail: string; path: string; live?: boolean }[] = [
  { type: 'Project', table: 'program_projects', column: 'name', detail: 'status', path: '/programs/projects' },
  { type: 'Task', table: 'program_tasks', column: 'title', detail: 'status', path: '/programs/tasks' },
  { type: 'Grant', table: 'grants', column: 'name', detail: 'stage', path: '/finance/grants' },
  { type: 'Support ticket', table: 'support_tickets', column: 'subject', detail: 'status', path: '/help' },
  { type: 'Organization', table: 'crm_organizations', column: 'name', detail: 'name', path: '/customers/organizations' },
  { type: 'Contact', table: 'crm_contacts', column: 'name', detail: 'email', path: '/customers/contacts' },
  { type: 'Document', table: 'drive_items', column: 'name', detail: 'item_type', path: '/drive', live: true },
  { type: 'Conversation', table: 'support_conversations', column: 'subject', detail: 'status', path: '/customers/support' },
  { type: 'Content post', table: 'gtm_content_posts', column: 'title', detail: 'status', path: '/gtm/calendar' },
];

// Row-level security limits each table to what the signed-in user may read.
export function useRecordSearch(query: string): RecordHit[] {
  const [hits, setHits] = useState<RecordHit[]>([]);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const results = await Promise.all(sources.map(async (s) => {
        let request = supabase.from(s.table).select(`id,${s.column},${s.detail}`).ilike(s.column, pattern);
        if (s.live) request = request.is('deleted_at', null);
        const { data, error } = await request.limit(3);
        if (error || !data) return [];
        return (data as unknown as Record<string, string>[]).map((row) => ({ id: `${s.table}-${row.id}`, type: s.type, title: String(row[s.column] ?? ''), detail: String(row[s.detail] ?? ''), path: s.path }));
      }));
      if (!cancelled) setHits(results.flat());
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  return hits;
}
