import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, MessageSquareWarning, Plus, Send, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppAccess } from '../../lib/useAppAccess';
import { useWorkspace } from '../../context/WorkspaceContext';

type Post = {
  id: string; title: string; body: string | null; channel: string; campaign_id: string | null; scheduled_for: string | null;
  status: string; review_note: string | null; reviewed_by: string | null; created_by: string;
};
type Campaign = { id: string; name: string };

const channels = ['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'newsletter', 'website', 'other'];
const statusStyle: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-800',
  changes_requested: 'bg-rose-100 text-rose-700',
  approved: 'bg-emerald-100 text-emerald-700',
  scheduled: 'bg-brand-100 text-brand-700',
  published: 'bg-slate-800 text-white',
  archived: 'bg-slate-100 text-slate-400',
};
const label = (v: string) => v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-400';
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const ContentCalendar: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const { canEdit, canManage } = useAppAccess('gtm');
  const [posts, setPosts] = useState<Post[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [editing, setEditing] = useState<Post | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('gtm_content_posts').select('*').order('scheduled_for', { ascending: true, nullsFirst: false }),
      supabase.from('gtm_records').select('id,name').eq('area', 'marketing').order('name'),
    ]);
    if (p.error) setError(p.error.message); else setError('');
    setPosts((p.data as Post[]) || []);
    setCampaigns((c.data as Campaign[]) || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const userName = (id: string | null) => users.find((u) => u.id === id)?.name || '—';
  const pending = posts.filter((p) => p.status === 'pending_approval');
  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    posts.forEach((p) => { if (p.scheduled_for) { const k = dayKey(new Date(p.scheduled_for)); map.set(k, [...(map.get(k) || []), p]); } });
    return map;
  }, [posts]);
  const unscheduled = posts.filter((p) => !p.scheduled_for && p.status !== 'archived');

  const cells = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  const chip = (p: Post) => (
    <button key={p.id} type="button" onClick={() => setEditing(p)} className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-semibold ${statusStyle[p.status]}`} title={`${p.title} · ${label(p.status)}`}>{p.title}</button>
  );

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 bg-white p-1.5"><ChevronLeft className="h-4 w-4" /></button>
        <h2 className="min-w-[9rem] text-center text-sm font-bold text-slate-900">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 bg-white p-1.5"><ChevronRight className="h-4 w-4" /></button>
        <div className="flex-1" />
        {canEdit && <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"><Plus className="h-3.5 w-3.5" /> New post</button>}
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-slate-200 bg-white text-xs">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="border-b border-slate-100 bg-slate-50 px-2 py-1.5 font-bold uppercase tracking-wider text-slate-400">{d}</div>)}
        {cells.map((d) => (
          <div key={d.toISOString()} className={`min-h-[84px] space-y-1 border-b border-r border-slate-100 p-1.5 ${d.getMonth() === month.getMonth() ? '' : 'bg-slate-50/60 text-slate-300'}`}>
            <span className="font-semibold">{d.getDate()}</span>
            {(byDay.get(dayKey(d)) || []).map(chip)}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Awaiting approval ({pending.length})</h3>
          <div className="mt-3 space-y-2">
            {pending.map((p) => <button key={p.id} type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-2 rounded-xl border border-slate-100 p-3 text-left text-xs hover:bg-slate-50"><span className="flex-1 font-semibold text-slate-800">{p.title}<span className="block text-xs font-normal text-slate-400">{label(p.channel)} · {userName(p.created_by)}</span></span></button>)}
            {!pending.length && <p className="text-xs text-slate-400">Nothing waiting for review.</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-bold text-slate-900">Unscheduled ({unscheduled.length})</h3>
          <div className="mt-3 space-y-1">{unscheduled.map(chip)}{!unscheduled.length && <p className="text-xs text-slate-400">All posts have a date.</p>}</div>
        </section>
      </div>

      {editing && <PostDialog post={editing === 'new' ? null : editing} campaigns={campaigns} canManage={canManage} canEdit={canEdit} currentUserId={currentUser.id} authorName={editing === 'new' ? currentUser.name : userName(editing.created_by)} reviewerName={editing === 'new' ? '' : userName(editing.reviewed_by)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
};

const PostDialog: React.FC<{
  post: Post | null; campaigns: Campaign[]; canManage: boolean; canEdit: boolean; currentUserId: string; authorName: string; reviewerName: string;
  onClose: () => void; onSaved: () => void;
}> = ({ post, campaigns, canManage, canEdit, currentUserId, authorName, reviewerName, onClose, onSaved }) => {
  const [f, setF] = useState({ title: post?.title || '', body: post?.body || '', channel: post?.channel || 'instagram', campaign_id: post?.campaign_id || '', scheduled_for: toLocalInput(post?.scheduled_for || null) });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const own = !post || post.created_by === currentUserId;
  const editable = !post ? canEdit : canManage || (own && canEdit && ['draft', 'changes_requested'].includes(post.status));
  const isReviewable = !!post && canManage && post.status === 'pending_approval' && (post.created_by !== currentUserId);

  const values = () => ({
    title: f.title.trim(), body: f.body.trim() || null, channel: f.channel, campaign_id: f.campaign_id || null,
    scheduled_for: f.scheduled_for ? new Date(f.scheduled_for).toISOString() : null,
  });
  const save = async (status?: string, extra: Record<string, unknown> = {}) => {
    if (!f.title.trim()) { setError('A title is required.'); return; }
    setBusy(true);
    const payload = { ...values(), ...(status ? { status } : {}), ...extra };
    const { error: e } = post
      ? await supabase.from('gtm_content_posts').update(payload).eq('id', post.id)
      : await supabase.from('gtm_content_posts').insert({ ...payload, created_by: currentUserId });
    setBusy(false);
    if (e) setError(e.message); else onSaved();
  };
  const remove = async () => {
    if (!post || !window.confirm('Delete this post?')) return;
    const { error: e } = await supabase.from('gtm_content_posts').delete().eq('id', post.id);
    if (e) setError(e.message); else onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">{post ? 'Post' : 'New post'} {post && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${statusStyle[post.status]}`}>{label(post.status)}</span>}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        {post && <p className="text-xs text-slate-400">By {authorName}{post.reviewed_by ? ` · reviewed by ${reviewerName}` : ''}</p>}
        {post?.review_note && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><MessageSquareWarning className="mr-1 inline h-3.5 w-3.5" />{post.review_note}</p>}
        <input disabled={!editable} maxLength={200} placeholder="Title" value={f.title} onChange={set('title')} className={field} />
        <textarea disabled={!editable} rows={5} placeholder="Copy / caption" value={f.body} onChange={set('body')} className={field} />
        <div className="grid grid-cols-2 gap-3">
          <select disabled={!editable} value={f.channel} onChange={set('channel')} className={field}>{channels.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
          <select disabled={!editable} value={f.campaign_id} onChange={set('campaign_id')} className={field}><option value="">No campaign</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        <label className="block text-xs text-slate-500">Publish date<input disabled={!editable} type="datetime-local" value={f.scheduled_for} onChange={set('scheduled_for')} className={`${field} mt-1`} /></label>
        {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}

        {isReviewable && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <textarea rows={2} placeholder="Feedback (required when requesting changes)" value={note} onChange={(e) => setNote(e.target.value)} className={field} />
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => save('approved', { review_note: null })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>
              <button type="button" disabled={busy || !note.trim()} onClick={() => save('changes_requested', { review_note: note.trim() })} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 disabled:opacity-50">Request changes</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {editable && <button type="button" disabled={busy} onClick={() => save()} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save</button>}
          {editable && (!post || ['draft', 'changes_requested'].includes(post.status)) && <button type="button" disabled={busy} onClick={() => save('pending_approval')} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Submit for approval</button>}
          {canManage && post?.status === 'approved' && <button type="button" disabled={busy || !f.scheduled_for} onClick={() => save('scheduled')} className="rounded-lg border border-brand-300 px-3 py-2 text-xs font-bold text-brand-700 disabled:opacity-50">Mark scheduled</button>}
          {canManage && post && ['approved', 'scheduled'].includes(post.status) && <button type="button" disabled={busy || !f.scheduled_for} onClick={() => save('published')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Mark published</button>}
          {post && (canManage || (own && post.status === 'draft')) && <button type="button" onClick={remove} className="ml-auto inline-flex items-center gap-1 text-xs text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
        </div>
      </div>
    </div>
  );
};
