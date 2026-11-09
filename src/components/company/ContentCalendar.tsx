import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, MessageSquareWarning, Plus, Send, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppAccess } from '../../lib/useAppAccess';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useConfirm } from '../common/useConfirm';

type Post = {
  id: string; title: string; body: string | null; channel: string; campaign_id: string | null; scheduled_for: string | null;
  status: string; review_note: string | null; reviewed_by: string | null; created_by: string;
  objective?: string | null; audience?: string | null; hashtags?: string[] | null; call_to_action?: string | null;
  media_url?: string | null; published_url?: string | null; reach?: number | null; engagements?: number | null; link_clicks?: number | null;
};
type Campaign = { id: string; name: string; description?: string | null; status?: string; due_date?: string | null; objective?: string | null; audience?: string | null; channels?: string[] | null; budget?: number | null };

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
  const [campaignEditing, setCampaignEditing] = useState<Campaign | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('gtm_content_posts').select('*').order('scheduled_for', { ascending: true, nullsFirst: false }),
      supabase.from('gtm_records').select('*').eq('area', 'marketing').order('name'),
    ]);
    if (p.error || c.error) setError([p.error && `Posts: ${p.error.message}`, c.error && `Campaigns: ${c.error.message}`].filter(Boolean).join(' · '));
    else setError('');
    setPosts((p.data as Post[]) || []);
    setCampaigns((c.data as Campaign[]) || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const userName = (id: string | null) => users.find((u) => u.id === id)?.name || '—';
  const pending = posts.filter((p) => p.status === 'pending_approval');
  const published = posts.filter((p) => p.status === 'published').sort((a, b) => new Date(b.scheduled_for || 0).getTime() - new Date(a.scheduled_for || 0).getTime());
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
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">{userFacingError(error)}</p>}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-sm font-bold text-slate-900">Campaigns</h3><p className="mt-1 text-xs text-slate-500">Connect posts to a goal, audience and channel plan.</p></div>
          {canEdit && <button type="button" onClick={() => setCampaignEditing('new')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-brand-400"><Plus className="h-3.5 w-3.5" />New campaign</button>}
        </div>
        {campaigns.length ? <div className="mt-3 divide-y divide-slate-100">{campaigns.map((campaign) => (
          <button type="button" key={campaign.id} onClick={() => setCampaignEditing(campaign)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left hover:text-brand-700">
            <span className="min-w-[10rem] flex-1 text-xs font-semibold text-slate-800">{campaign.name}<span className="ml-2 font-normal text-slate-400">{campaign.status || 'planned'}</span>{campaign.objective && <span className="mt-1 block font-normal text-slate-500">{campaign.objective}</span>}</span>
            <span className="text-xs text-slate-500">{campaign.channels?.map(label).join(', ') || 'No channels selected'}</span>
            {campaign.due_date && <span className="text-xs tabular-nums text-slate-500">Through {campaign.due_date}</span>}
          </button>
        ))}</div> : <p className="mt-3 text-xs text-slate-400">No campaigns yet. Create one to organize posts around a shared goal.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">Published content</h3><span className="text-xs text-slate-500">{published.length} posts</span></div>
        {published.length ? <div className="mt-2 divide-y divide-slate-100">{published.slice(0, 6).map((post) => (
          <div key={post.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
            <button type="button" onClick={() => setEditing(post)} className="min-w-[9rem] flex-1 text-left text-xs font-semibold text-slate-800 hover:text-brand-700">{post.title}<span className="mt-1 block font-normal text-slate-500">{label(post.channel)} · {post.scheduled_for ? new Date(post.scheduled_for).toLocaleDateString() : 'Date not recorded'}</span></button>
            <dl className="flex gap-4 text-xs tabular-nums text-slate-600"><div><dt className="text-slate-400">Reach</dt><dd>{post.reach ?? '—'}</dd></div><div><dt className="text-slate-400">Engagements</dt><dd>{post.engagements ?? '—'}</dd></div><div><dt className="text-slate-400">Clicks</dt><dd>{post.link_clicks ?? '—'}</dd></div></dl>
            {post.published_url && <a href={post.published_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-700">Open post</a>}
          </div>
        ))}</div> : <p className="mt-3 text-xs text-slate-400">Posts marked published will appear here. Record verified reach, engagement and link clicks on a post.</p>}
      </section>

      {editing && <PostDialog post={editing === 'new' ? null : editing} campaigns={campaigns} canManage={canManage} canEdit={canEdit} currentUserId={currentUser.id} authorName={editing === 'new' ? currentUser.name : userName(editing.created_by)} reviewerName={editing === 'new' ? '' : userName(editing.reviewed_by)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {campaignEditing && <CampaignDialog campaign={campaignEditing === 'new' ? null : campaignEditing} userId={currentUser.id} onClose={() => setCampaignEditing(null)} onSaved={() => { setCampaignEditing(null); void load(); }} />}
    </div>
  );
};

const PostDialog: React.FC<{
  post: Post | null; campaigns: Campaign[]; canManage: boolean; canEdit: boolean; currentUserId: string; authorName: string; reviewerName: string;
  onClose: () => void; onSaved: () => void;
}> = ({ post, campaigns, canManage, canEdit, currentUserId, authorName, reviewerName, onClose, onSaved }) => {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [f, setF] = useState({
    title: post?.title || '', body: post?.body || '', channel: post?.channel || 'instagram', campaign_id: post?.campaign_id || '',
    scheduled_for: toLocalInput(post?.scheduled_for || null), objective: post?.objective || '', audience: post?.audience || '',
    hashtags: post?.hashtags?.join(', ') || '', call_to_action: post?.call_to_action || '', media_url: post?.media_url || '',
    published_url: post?.published_url || '', reach: post?.reach == null ? '' : String(post.reach),
    engagements: post?.engagements == null ? '' : String(post.engagements), link_clicks: post?.link_clicks == null ? '' : String(post.link_clicks),
  });
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
    objective: f.objective.trim() || null, audience: f.audience.trim() || null,
    hashtags: f.hashtags.split(/[\s,]+/).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean),
    call_to_action: f.call_to_action.trim() || null, media_url: f.media_url.trim() || null,
    published_url: f.published_url.trim() || null,
    reach: f.reach === '' ? null : Number(f.reach), engagements: f.engagements === '' ? null : Number(f.engagements),
    link_clicks: f.link_clicks === '' ? null : Number(f.link_clicks),
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
    if (!post || !await confirm({ title: `Delete “${post.title}”?`, message: 'This post will be removed from the content calendar.', confirmLabel: 'Delete' })) return;
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
        <input disabled={!editable} maxLength={200} placeholder="Post title" value={f.title} onChange={set('title')} className={field} />
        <textarea disabled={!editable} rows={5} placeholder="Post copy / caption" value={f.body} onChange={set('body')} className={field} />
        <div className="grid grid-cols-2 gap-3">
          <CustomSelect disabled={!editable} value={f.channel} onChange={set('channel')} className={field}>{channels.map((c) => <option key={c} value={c}>{label(c)}</option>)}</CustomSelect>
          <CustomSelect disabled={!editable} value={f.campaign_id} onChange={set('campaign_id')} className={field}><option value="">No campaign</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</CustomSelect>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input disabled={!editable} placeholder="Campaign objective" value={f.objective} onChange={set('objective')} className={field} />
          <input disabled={!editable} placeholder="Target audience" value={f.audience} onChange={set('audience')} className={field} />
          <input disabled={!editable} placeholder="Hashtags, comma separated" value={f.hashtags} onChange={set('hashtags')} className={field} />
          <input disabled={!editable} placeholder="Call to action" value={f.call_to_action} onChange={set('call_to_action')} className={field} />
          <input disabled={!editable} type="url" placeholder="Media / asset URL" value={f.media_url} onChange={set('media_url')} className={field} />
          <input disabled={!editable} type="url" placeholder="Published post URL" value={f.published_url} onChange={set('published_url')} className={field} />
        </div>
        <label className="block text-xs text-slate-500">Publish date<input disabled={!editable} type="datetime-local" value={f.scheduled_for} onChange={set('scheduled_for')} className={`${field} mt-1`} /></label>
        {post?.status === 'published' && <fieldset className="grid grid-cols-3 gap-2"><legend className="mb-1 text-xs font-semibold text-slate-500">Performance (enter verified platform metrics)</legend>{(['reach', 'engagements', 'link_clicks'] as const).map((key) => <label key={key} className="text-xs capitalize text-slate-500">{key.replace('_', ' ')}<input disabled={!editable} type="number" min="0" value={f[key]} onChange={set(key)} className={`${field} mt-1`} /></label>)}</fieldset>}
        {error && <p role="alert" className="text-xs text-rose-600">{userFacingError(error)}</p>}

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
      {confirmDialog}
    </div>
  );
};

const CampaignDialog: React.FC<{ campaign: Campaign | null; userId: string; onClose: () => void; onSaved: () => void }> = ({ campaign, userId, onClose, onSaved }) => {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [form, setForm] = useState({
    name: campaign?.name || '', description: campaign?.description || '', status: campaign?.status || 'planned',
    due_date: campaign?.due_date || '', objective: campaign?.objective || '', audience: campaign?.audience || '',
    channels: campaign?.channels || [], budget: campaign?.budget == null ? '' : String(campaign.budget),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { setError('A campaign name is required.'); return; }
    setBusy(true);
    const values = {
      name: form.name.trim(), description: form.description.trim() || null, status: form.status,
      due_date: form.due_date || null, objective: form.objective.trim() || null, audience: form.audience.trim() || null,
      channels: form.channels, budget: form.budget === '' ? null : Number(form.budget), updated_at: new Date().toISOString(),
    };
    const { error: saveError } = campaign
      ? await supabase.from('gtm_records').update(values).eq('id', campaign.id)
      : await supabase.from('gtm_records').insert({ ...values, area: 'marketing', created_by: userId, owner_id: userId });
    setBusy(false);
    if (saveError) setError(saveError.message); else onSaved();
  };
  const remove = async () => {
    if (!campaign || !await confirm({ title: `Delete “${campaign.name}”?`, message: 'Posts in this campaign will remain in the calendar.', confirmLabel: 'Delete' })) return;
    const { error: deleteError } = await supabase.from('gtm_records').delete().eq('id', campaign.id);
    if (deleteError) setError(deleteError.message); else onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Marketing campaign">
      <div className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{campaign ? 'Edit campaign' : 'New campaign'}</h2><button type="button" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button></div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{userFacingError(error)}</p>}
        <input autoFocus maxLength={200} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Campaign name" className={field} />
        <textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Campaign overview" className={field} />
        <textarea rows={2} value={form.objective} onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))} placeholder="Objective and success measure" className={field} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))} placeholder="Target audience" className={field} />
          <CustomSelect value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={field}><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option><option value="paused">Paused</option></CustomSelect>
          <label className="text-xs text-slate-500">Campaign through<input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} className={`${field} mt-1`} /></label>
          <label className="text-xs text-slate-500">Budget<input type="number" min="0" step="0.01" value={form.budget} onChange={(event) => setForm((current) => ({ ...current, budget: event.target.value }))} className={`${field} mt-1`} /></label>
        </div>
        <fieldset><legend className="mb-2 text-xs font-semibold text-slate-500">Channels</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{channels.filter((channel) => channel !== 'other').map((channel) => <label key={channel} className="flex items-center gap-1.5 text-xs capitalize text-slate-600"><input type="checkbox" checked={form.channels.includes(channel)} onChange={(event) => setForm((current) => ({ ...current, channels: event.target.checked ? [...current.channels, channel] : current.channels.filter((item) => item !== channel) }))} />{channel}</label>)}</div></fieldset>
        <p className="text-xs text-slate-400">Posts can be planned, approved and marked published here. Connecting social accounts is not configured, so publishing and metrics must be recorded manually.</p>
        <div className="flex items-center justify-between pt-1">{campaign ? <button type="button" onClick={() => void remove()} className="text-xs font-semibold text-rose-600">Delete campaign</button> : <span />}<div className="flex gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancel</button><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save campaign'}</button></div></div>
      </div>
      {confirmDialog}
    </div>
  );
};
