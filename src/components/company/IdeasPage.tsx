import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronUp, Lightbulb, MessageCircle, Plus, Search, Send, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { EmptyState } from '../common/Feedback';
import { useConfirm } from '../common/useConfirm';

type Idea = { id: string; title: string; description: string | null; problem?: string | null; impact?: string | null; effort?: string | null; next_step?: string | null; category: string; status: string; created_by: string; created_at: string };
type IdeaComment = { id: string; idea_id: string; author_id: string; body: string; created_at: string };

const CATEGORIES: Record<string, string> = {
  general: 'General', brand: 'Brand', grants: 'Grants', marketing: 'Marketing', product: 'Product',
  customers: 'Customers', operations: 'Operations', legal: 'Legal', people: 'People',
};
const STATUSES: Record<string, string> = { new: 'New', exploring: 'Exploring', planned: 'Planned', done: 'Done', declined: 'Declined' };
const statusTone: Record<string, string> = {
  new: 'bg-brand-50 text-brand-700', exploring: 'bg-amber-50 text-amber-700', planned: 'bg-violet-50 text-violet-700',
  done: 'bg-emerald-50 text-emerald-700', declined: 'bg-slate-100 text-slate-500',
};
const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-brand-400 md:text-xs';

export const IdeasPage: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const isLead = currentUser.systemRole === 'admin' || currentUser.systemRole === 'coordinator';
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [votes, setVotes] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [discussionId, setDiscussionId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, IdeaComment[]>>({});
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', problem: '', impact: '', effort: '', next_step: '', category: 'general' });

  const load = useCallback(async () => {
    const [ideaResult, voteResult] = await Promise.all([
      supabase.from('company_ideas').select('id,title,description,problem,impact,effort,next_step,category,status,created_by,created_at').order('created_at', { ascending: false }),
      supabase.from('company_idea_votes').select('idea_id,user_id'),
    ]);
    const failure = ideaResult.error || voteResult.error;
    if (failure) setError(/company_idea/.test(failure.message) ? 'The ideas tables are missing. Run the 20261104120000_company_ideas.sql migration in Supabase.' : failure.message);
    else setError('');
    setIdeas((ideaResult.data as Idea[]) || []);
    const map: Record<string, Set<string>> = {};
    ((voteResult.data as { idea_id: string; user_id: string }[]) || []).forEach((vote) => { (map[vote.idea_id] ??= new Set()).add(vote.user_id); });
    setVotes(map);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return ideas
      .filter((idea) => (category === 'all' || idea.category === category) && (status === 'all' || idea.status === status)
        && (!term || `${idea.title} ${idea.description || ''}`.toLowerCase().includes(term)))
      .sort((a, b) => (votes[b.id]?.size || 0) - (votes[a.id]?.size || 0) || b.created_at.localeCompare(a.created_at));
  }, [ideas, votes, category, status, query]);

  const create = async () => {
    if (!form.title.trim()) return;
    const values = {
      title: form.title.trim(), description: form.description.trim() || null,
      problem: form.problem.trim() || null, impact: form.impact.trim() || null,
      effort: form.effort.trim() || null, next_step: form.next_step.trim() || null,
      category: form.category,
    };
    const result = editing
      ? await supabase.from('company_ideas').update({ ...values, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('company_ideas').insert({ ...values, created_by: currentUser.id });
    const insertError = result.error;
    if (insertError) { setError(insertError.message); return; }
    setForm({ title: '', description: '', problem: '', impact: '', effort: '', next_step: '', category: 'general' });
    setCreating(false);
    setEditing(null);
    await load();
  };

  const toggleVote = async (idea: Idea) => {
    const voted = votes[idea.id]?.has(currentUser.id);
    const result = voted
      ? await supabase.from('company_idea_votes').delete().eq('idea_id', idea.id).eq('user_id', currentUser.id)
      : await supabase.from('company_idea_votes').insert({ idea_id: idea.id, user_id: currentUser.id });
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  const update = async (idea: Idea, patch: Partial<Idea>) => {
    const { error: updateError } = await supabase.from('company_ideas').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', idea.id);
    if (updateError) { setError(updateError.message); return; }
    await load();
  };

  const remove = async (idea: Idea) => {
    if (!await confirm({ title: `Delete “${idea.title}”?`, message: 'Its discussion and votes will also be removed.', confirmLabel: 'Delete' })) return;
    const { error: deleteError } = await supabase.from('company_ideas').delete().eq('id', idea.id);
    if (deleteError) { setError(deleteError.message); return; }
    await load();
  };

  const openDiscussion = async (idea: Idea) => {
    if (discussionId === idea.id) { setDiscussionId(null); return; }
    setDiscussionId(idea.id);
    setCommentDraft('');
    if (comments[idea.id]) return;
    const { data, error: commentError } = await supabase.from('company_idea_comments').select('id,idea_id,author_id,body,created_at').eq('idea_id', idea.id).order('created_at');
    if (commentError) { setError(commentError.message); return; }
    setComments((current) => ({ ...current, [idea.id]: (data || []) as IdeaComment[] }));
  };

  const addComment = async (ideaId: string) => {
    const body = commentDraft.trim();
    if (!body) return;
    setCommentBusy(true);
    const { data, error: commentError } = await supabase.from('company_idea_comments').insert({ idea_id: ideaId, author_id: currentUser.id, body }).select('id,idea_id,author_id,body,created_at').single();
    setCommentBusy(false);
    if (commentError || !data) { setError(commentError?.message || 'Could not add the discussion message.'); return; }
    setComments((current) => ({ ...current, [ideaId]: [...(current[ideaId] || []), data as IdeaComment] }));
    setCommentDraft('');
  };

  const editIdea = (idea: Idea) => {
    setEditing(idea);
    setForm({
      title: idea.title, description: idea.description || '', problem: idea.problem || '',
      impact: idea.impact || '', effort: idea.effort || '', next_step: idea.next_step || '',
      category: idea.category,
    });
    setCreating(true);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ideas</h1>
          <p className="mt-1 text-xs text-slate-500">Company-wide ideas for brand, grants, product, marketing and everything else. Upvote what matters.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 md:min-h-0"><Plus className="h-3.5 w-3.5" />New idea</button>
      </header>
      <div className="mx-auto max-w-5xl space-y-4 p-5 sm:p-8">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ideas" aria-label="Search ideas" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-base outline-none focus:border-brand-400 md:text-xs" /></div>
          <CustomSelect value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-base md:text-xs"><option value="all">All categories</option>{Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect>
          <CustomSelect value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-base md:text-xs"><option value="all">All statuses</option>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect>
        </div>

        {loading ? <p className="text-xs text-slate-400">Loading ideas…</p> : visible.length === 0 ? (
          <EmptyState icon={Lightbulb} text={ideas.length ? 'No ideas match those filters.' : 'No ideas yet. Share the first one.'} action="New idea" onClick={() => setCreating(true)} />
        ) : (
          <ul className="space-y-2">
            {visible.map((idea) => {
              const count = votes[idea.id]?.size || 0;
              const voted = votes[idea.id]?.has(currentUser.id);
              const canManage = isLead || idea.created_by === currentUser.id;
              return (
                <li key={idea.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex gap-3">
                  <button type="button" onClick={() => void toggleVote(idea)} aria-pressed={voted} aria-label={voted ? 'Remove upvote' : 'Upvote'} className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-bold transition-colors ${voted ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    <ChevronUp className="h-4 w-4" />{count}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">{idea.title}</h2>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{CATEGORIES[idea.category] || idea.category}</span>
                      {canManage ? (
                        <CustomSelect value={idea.status} onChange={(event) => void update(idea, { status: event.target.value })} aria-label="Idea status" className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-bold ${statusTone[idea.status] || ''}`}>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect>
                      ) : <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone[idea.status] || ''}`}>{STATUSES[idea.status] || idea.status}</span>}
                    </div>
                    {idea.description && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{idea.description}</p>}
                    {(idea.problem || idea.impact || idea.effort || idea.next_step) && <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                      {idea.problem && <div><dt className="text-xs font-semibold text-slate-500">Problem</dt><dd className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{idea.problem}</dd></div>}
                      {idea.impact && <div><dt className="text-xs font-semibold text-slate-500">Expected impact</dt><dd className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{idea.impact}</dd></div>}
                      {idea.effort && <div><dt className="text-xs font-semibold text-slate-500">Effort / dependencies</dt><dd className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{idea.effort}</dd></div>}
                      {idea.next_step && <div><dt className="text-xs font-semibold text-slate-500">Next step</dt><dd className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{idea.next_step}</dd></div>}
                    </dl>}
                    <p className="mt-2 text-[11px] text-slate-400">{users.find((user) => user.id === idea.created_by)?.name || 'Someone'} · {new Date(idea.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button type="button" onClick={() => void openDiscussion(idea)} aria-expanded={discussionId === idea.id} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><MessageCircle className="h-3.5 w-3.5" />Discuss{comments[idea.id]?.length ? ` · ${comments[idea.id].length}` : ''}</button>
                    {canManage && <button type="button" onClick={() => editIdea(idea)} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">Edit</button>}
                    {canManage && <button type="button" onClick={() => void remove(idea)} aria-label="Delete idea" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                  </div>
                  {discussionId === idea.id && <section className="mt-4 border-t border-slate-100 pt-4" aria-label={`Discussion for ${idea.title}`}>
                    <h3 className="text-xs font-bold text-slate-800">Discussion</h3>
                    <p className="mt-1 text-xs text-slate-500">Ask questions, share context, and agree on a useful next step.</p>
                    <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto">
                      {(comments[idea.id] || []).map((comment) => <li key={comment.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-800">{users.find((user) => user.id === comment.author_id)?.name || 'Team member'}</span><time className="text-xs text-slate-400">{new Date(comment.created_at).toLocaleString()}</time></div>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{comment.body}</p>
                      </li>)}
                      {!comments[idea.id]?.length && <li className="text-xs text-slate-400">Start the discussion with a question or comment.</li>}
                    </ol>
                    <form className="mt-3 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void addComment(idea.id); }}>
                      <label className="sr-only" htmlFor={`idea-comment-${idea.id}`}>Write a discussion message</label>
                      <textarea id={`idea-comment-${idea.id}`} rows={2} maxLength={5000} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Ask a question or add a thought…" className={`${field} min-h-11 flex-1`} />
                      <button type="submit" disabled={!commentDraft.trim() || commentBusy} className="inline-flex h-10 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50"><Send className="h-3.5 w-3.5" />Send</button>
                    </form>
                  </section>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3" onClick={() => setCreating(false)}>
          <div role="dialog" aria-label={editing ? 'Edit idea' : 'New idea'} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">{editing ? 'Edit idea' : 'New idea'}</h2><button type="button" onClick={() => { setCreating(false); setEditing(null); }} aria-label="Close" className="-m-2 p-2"><X className="h-4 w-4 text-slate-400" /></button></div>
            <div className="mt-4 space-y-3">
              <input autoFocus maxLength={200} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} placeholder="What's the idea?" className={field} />
              <textarea rows={3} maxLength={5000} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} placeholder="Describe the idea and context" className={field} />
              <div className="grid gap-3 sm:grid-cols-2">
                <textarea rows={3} maxLength={3000} value={form.problem} onChange={(event) => setForm((value) => ({ ...value, problem: event.target.value }))} placeholder="What problem or opportunity does this address?" className={field} />
                <textarea rows={3} maxLength={3000} value={form.impact} onChange={(event) => setForm((value) => ({ ...value, impact: event.target.value }))} placeholder="Who benefits, and what would improve?" className={field} />
                <textarea rows={3} maxLength={3000} value={form.effort} onChange={(event) => setForm((value) => ({ ...value, effort: event.target.value }))} placeholder="Effort, dependencies or risks" className={field} />
                <textarea rows={3} maxLength={3000} value={form.next_step} onChange={(event) => setForm((value) => ({ ...value, next_step: event.target.value }))} placeholder="A small next step to explore it" className={field} />
              </div>
              <CustomSelect value={form.category} onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))} className={field}>{Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect>
            </div>
            <button type="button" disabled={!form.title.trim()} onClick={() => void create()} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-50">{editing ? 'Save changes' : 'Share idea'}</button>
          </div>
        </div>
      )}
      {confirmDialog}
    </main>
  );
};
