import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type RecordHit = { id: string; recordId: string; type: string; title: string; detail: string; path: string; conversationId?: string };

type Source = { type: string; table: string; column: string; detail: string; path: string; live?: boolean; extra?: string; pathFor?: (row: Record<string, string>) => string };

const sources: Source[] = [
  { type: 'Project', table: 'eng_projects', column: 'name', detail: 'status', path: '/engineering', extra: 'discipline', pathFor: (row) => `/engineering/${row.discipline || 'software'}/${row.id}` },
  { type: 'Task', table: 'program_tasks', column: 'title', detail: 'status', path: '/programs/tasks', pathFor: (row) => `/programs/task/${row.id}` },
  { type: 'Grant', table: 'grants', column: 'name', detail: 'stage', path: '/company/grants', pathFor: (row) => `/company/grants/${row.id}` },
  { type: 'Message', table: 'messages', column: 'text', detail: 'sender_name', path: '/messages', extra: 'conversation_id' },
  { type: 'Support ticket', table: 'support_tickets', column: 'subject', detail: 'status', path: '/help', pathFor: (row) => `/help?ticket=${row.id}` },
  { type: 'Catalog product', table: 'wildfire_products', column: 'name', detail: 'category', path: '/wildfire/catalog' },
  { type: 'Wildfire prospect', table: 'wildfire_opportunities', column: 'name', detail: 'stage', path: '/wildfire/opportunities' },
  { type: 'Company', table: 'crm_organizations', column: 'name', detail: 'category', path: '/customers/organizations', pathFor: (row) => `/customers/organizations?company=${row.id}` },
  { type: 'Contact', table: 'crm_contacts', column: 'name', detail: 'email', path: '/customers/organizations', pathFor: (row) => `/customers/organizations?contact=${row.id}` },
  { type: 'Conversation', table: 'support_conversations', column: 'subject', detail: 'status', path: '/customers/support' },
  { type: 'Marketing post', table: 'gtm_content_posts', column: 'title', detail: 'status', path: '/company/marketing' },
  { type: 'System', table: 'flown_systems', column: 'name', detail: 'environment', path: '/systems' },
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
        let request = supabase.from(s.table).select(`id,${s.column},${s.detail}${s.extra ? `,${s.extra}` : ''}`).ilike(s.column, pattern);
        if (s.live) request = request.is('deleted_at', null);
        const { data, error } = await request.limit(s.table === 'messages' ? 5 : 3);
        if (error || !data) return [];
        return (data as unknown as Record<string, string>[]).map((row) => ({
          id: `${s.table}-${row.id}`,
          recordId: String(row.id),
          type: s.type,
          title: s.table === 'messages' ? String(row.sender_name ?? 'Message') : String(row[s.column] ?? ''),
          detail: s.table === 'messages' ? String(row.text ?? '') : String(row[s.detail] ?? ''),
          path: s.pathFor ? s.pathFor(row) : s.path,
          conversationId: s.table === 'messages' ? String(row.conversation_id ?? '') : undefined,
        }));
      }));
      if (!cancelled) setHits(results.flat());
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  return hits;
}
