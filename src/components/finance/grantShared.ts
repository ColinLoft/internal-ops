import { supabase } from '../../lib/supabase';

export type Grant = {
  id: string; name: string; funder_name: string | null; funder_org_id: string | null; contact_id: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  funder_emails: string[]; website_url: string | null; portal_url: string | null; application_url: string | null; stage: string; source: string | null; source_detail: string | null;
  secured_by_id: string | null; owner_id: string | null; amount_requested: number | null; amount_awarded: number | null; in_kind_requested: string | null; in_kind_awarded: string | null;
  match_required: string | null; restrictions: string | null; obligations: string | null; application_submitted_at: string | null; decision_due_at: string | null; decision_at: string | null;
  award_date: string | null; term_start: string | null; term_end: string | null; next_follow_up_at: string | null; funder_response: string | null; decision_notes: string | null; notes: string | null;
  project_id: string | null; grant_type: string; created_at: string; updated_at: string;
};

export const GRANT_TYPES = [['money', 'Money (cash)'], ['product', 'Product / in-kind'], ['both', 'Money + product']] as const;
export const typeLabel = (type: string) => (type === 'product' ? 'Product' : type === 'both' ? 'Money + product' : 'Money');
export const typeTone = (type: string) => (type === 'product' ? 'bg-violet-50 text-violet-700' : type === 'both' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600');

export const GRANT_STAGES = [
  ['prospect', 'Prospect'], ['applied', 'Applied'], ['awarded', 'Awarded'], ['reporting', 'Reporting'], ['closed', 'Closed / declined'],
] as const;
export const stageLabel = (stage: string) => GRANT_STAGES.find(([value]) => value === stage)?.[1] || (stage === 'declined' ? 'Closed / declined' : stage);
export const stageTone = (stage: string) => (['awarded', 'reporting'].includes(stage) ? 'bg-emerald-50 text-emerald-700' : stage === 'declined' ? 'bg-rose-50 text-rose-700' : stage === 'closed' ? 'bg-slate-100 text-slate-600' : ['applied', 'under_review'].includes(stage) ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700');
export const SOURCES = ['Research / search', 'Referral', 'Board member', 'Staff connection', 'Funder outreach', 'Event / conference', 'Newsletter / listing', 'Previous funder', 'Other'];
export const money = (value: number | null | undefined) => (value == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)));
export const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
export const downloadCsv = (name: string, rows: unknown[][]) => {
  const blob = new Blob([rows.map((row) => row.map(csvEscape).join(',')).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
};
export const goTo = (path: string) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

export const askGrantAi = async <T = { text?: string }>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('grant-ai', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    const detail = context instanceof Response ? await context.clone().json().catch(() => null) as { error?: string } | null : null;
    throw new Error(detail?.error || error.message);
  }
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
  return data as T;
};

export const daysFromNow = (date: string | null | undefined) => (date ? Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86_400_000) : null);
export const dueTone = (date: string | null | undefined) => { const days = daysFromNow(date); return days == null ? 'text-slate-500' : days < 0 ? 'font-semibold text-rose-600' : days <= 7 ? 'font-semibold text-amber-600' : 'text-slate-500'; };
