import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Dropdown } from '../common/Dropdown';
import {
  type Discipline, type EngFile, type EngProject, type EngReview, type EngVote, DISCIPLINES, MIN_VOTES, REVIEW_TYPES, VERDICTS,
  ago, disciplineOf, fileSize, inputClass, navigate, outcomeTone,
} from './shared';
import { openEngFile } from './ProjectDetail';

type Reviewer = { user_id: string; discipline: Discipline };
type Filter = 'open' | 'decided' | 'all';

const statusText = (review: EngReview) => (review.status === 'decided' ? review.outcome || 'Decided' : review.status === 'in_review' ? 'In review' : 'Needs reviewers');

export const ReviewPage: React.FC<{ reviewId: string | null }> = ({ reviewId }) => (reviewId ? <ReviewDetail key={reviewId} reviewId={reviewId} /> : <ReviewQueue />);

const ReviewQueue: React.FC = () => {
  const { users, currentUser } = useWorkspace();
  const isAdmin = ['admin', 'coordinator'].includes(currentUser.systemRole);
  const [reviews, setReviews] = useState<EngReview[]>([]);
  const [projects, setProjects] = useState<EngProject[]>([]);
  const [votes, setVotes] = useState<EngVote[]>([]);
  const [team, setTeam] = useState<Reviewer[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [r, p, v, t] = await Promise.all([
      supabase.from('eng_reviews').select('*').order('created_at', { ascending: false }),
      supabase.from('eng_projects').select('*'),
      supabase.from('eng_review_votes').select('*'),
      supabase.from('eng_reviewers').select('user_id,discipline'),
    ]);
    const failed = r.error || p.error;
    if (failed) setError(`Reviews could not be loaded: ${failed.message}. Run the latest migration (20261105120000).`); else setError('');
    setReviews((r.data || []) as EngReview[]);
    setProjects((p.data || []) as EngProject[]);
    setVotes((v.data || []) as EngVote[]);
    setTeam((t.data || []) as Reviewer[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const project = (id: string) => projects.find((item) => item.id === id);
  const myDisciplines = team.filter((member) => member.user_id === currentUser.id).map((member) => member.discipline);
  const needsMe = (review: EngReview) => review.status !== 'decided' && (isAdmin || myDisciplines.includes(project(review.project_id)?.discipline as Discipline)) && !votes.some((vote) => vote.review_id === review.id && vote.reviewer_id === currentUser.id);
  const shown = reviews.filter((review) => (filter === 'all' || (filter === 'open' ? review.status !== 'decided' : review.status === 'decided')) && (!mineOnly || needsMe(review)));
  const awaiting = reviews.filter(needsMe).length;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="workspace-page-header border-b border-slate-200 bg-white">
        <h1 className="text-xl font-bold text-slate-900">Review</h1>
      </header>
      <div className="workspace-page-body mx-auto w-full max-w-7xl space-y-4">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{userFacingError(error)}</div>}
        <ReviewTeam team={team} isAdmin={isAdmin} users={users} onChanged={load} onError={setError} />
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown<Filter> value={filter} onChange={setFilter} ariaLabel="Filter reviews" className="min-w-36" options={[{ id: 'open', label: 'Open reviews' }, { id: 'decided', label: 'Decided' }, { id: 'all', label: 'All reviews' }]} />
          <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly((value) => !value)} className={`workspace-control inline-flex items-center gap-2 border px-3 text-sm font-medium ${mineOnly ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><UserPlus className="h-4 w-4" />Waiting for me{awaiting > 0 && <span className="tabular-nums">{awaiting}</span>}</button>
        </div>
        {loading ? <p className="py-10 text-center text-xs text-slate-400">Loading…</p> : (
          <div className="space-y-2">
            {shown.map((review) => {
              const parent = project(review.project_id);
              const count = votes.filter((vote) => vote.review_id === review.id).length;
              return (
                <button key={review.id} type="button" onClick={() => navigate(`/engineering/review/${review.id}`)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-brand-400">
                  <span className="min-w-0"><b className="block truncate text-sm text-slate-900">{review.title}</b>
                    <span className="text-xs text-slate-500">{parent ? `${disciplineOf(parent.discipline).label} · ${parent.name}` : 'Project'} · {REVIEW_TYPES[review.review_type].label}{review.requested_action ? ` · for ${review.requested_action}` : ''} · {users.find((user) => user.id === review.submitted_by)?.name || 'Unknown'} · {ago(review.created_at)}</span></span>
                  <span className="flex items-center gap-2 text-xs">
                    {needsMe(review) && <span className="rounded-md bg-brand-600 px-2 py-1 font-bold text-white">Your review</span>}
                    <span className="text-slate-400">{count} vote{count === 1 ? '' : 's'}</span>
                    <span className={`rounded-md px-2 py-1 font-bold ${review.status === 'decided' ? outcomeTone(review.outcome) : 'bg-amber-50 text-amber-700'}`}>{statusText(review)}</span>
                  </span>
                </button>
              );
            })}
            {!shown.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-xs text-slate-500">{reviews.length ? 'No reviews match.' : 'No reviews yet. Open a project and choose Request review.'}</p>}
          </div>
        )}
      </div>
    </main>
  );
};

const ReviewTeam: React.FC<{ team: Reviewer[]; isAdmin: boolean; users: ReturnType<typeof useWorkspace>['users']; onChanged: () => void; onError: (message: string) => void }> = ({ team, isAdmin, users, onChanged, onError }) => {
  const [adding, setAdding] = useState<Discipline | null>(null);
  const [saving, setSaving] = useState(false);
  const add = async (userId: string, discipline: Discipline) => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('eng_reviewers').insert({ user_id: userId, discipline });
      if (error) onError(error.message); else { setAdding(null); onChanged(); }
    } catch (cause) { onError(userFacingError(cause)); }
    finally { setSaving(false); }
  };
  const remove = async (member: Reviewer) => {
    const { error } = await supabase.from('eng_reviewers').delete().eq('user_id', member.user_id).eq('discipline', member.discipline);
    if (error) onError(error.message); else onChanged();
  };
  return (
    <section className="workspace-panel rounded-2xl border border-slate-200 bg-white">
      <h2 className="text-sm font-bold text-slate-900">Review team</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DISCIPLINES.map((item) => {
          const members = team.filter((member) => member.discipline === item.id);
          const candidates = users.filter((user) => user.accountStatus !== 'removed' && !members.some((member) => member.user_id === user.id));
          return (
            <div key={item.id} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-700">{item.label}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {members.map((member) => <span key={member.user_id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200">{users.find((user) => user.id === member.user_id)?.name || 'Unknown'}{isAdmin && <button type="button" aria-label="Remove reviewer" onClick={() => void remove(member)}><X className="h-3 w-3 text-slate-400" /></button>}</span>)}
                {!members.length && <span className="text-xs text-slate-400">No reviewers yet. Admins can vote.</span>}
              </div>
              {isAdmin && (adding === item.id ? (
                <div className="mt-2 space-y-2"><CustomSelect autoFocus disabled={saving} aria-label={`Add ${item.label} reviewer`} defaultValue="" onChange={(event) => event.target.value && void add(event.target.value, item.id)} className={inputClass}><option value="">Choose a person</option>{candidates.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect><button type="button" disabled={saving} onClick={() => setAdding(null)} className="text-xs text-slate-500 hover:underline">Cancel</button></div>
              ) : <button type="button" onClick={() => setAdding(item.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600"><UserPlus className="h-3.5 w-3.5" />Add reviewer</button>)}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const ReviewDetail: React.FC<{ reviewId: string }> = ({ reviewId }) => {
  const { users, currentUser } = useWorkspace();
  const isAdmin = ['admin', 'coordinator'].includes(currentUser.systemRole);
  const [review, setReview] = useState<EngReview | null>(null);
  const [project, setProject] = useState<EngProject | null>(null);
  const [file, setFile] = useState<EngFile | null>(null);
  const [votes, setVotes] = useState<EngVote[]>([]);
  const [team, setTeam] = useState<Reviewer[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [verdict, setVerdict] = useState<EngVote['verdict']>('approve');
  const [comment, setComment] = useState('');
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const r = await supabase.from('eng_reviews').select('*').eq('id', reviewId).maybeSingle();
    if (r.error) { setError(r.error.message); return; }
    if (!r.data) { setMissing(true); return; }
    const row = r.data as EngReview;
    const [p, f, v, t] = await Promise.all([
      supabase.from('eng_projects').select('*').eq('id', row.project_id).maybeSingle(),
      row.file_id ? supabase.from('eng_project_files').select('*').eq('id', row.file_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('eng_review_votes').select('*').eq('review_id', reviewId).order('created_at'),
      supabase.from('eng_reviewers').select('user_id,discipline'),
    ]);
    setReview(row);
    setProject((p.data || null) as EngProject | null);
    setFile((f.data || null) as EngFile | null);
    const list = (v.data || []) as EngVote[];
    setVotes(list);
    setTeam((t.data || []) as Reviewer[]);
    const mine = list.find((vote) => vote.reviewer_id === currentUser.id);
    if (mine) { setVerdict(mine.verdict); setComment(mine.comment || ''); }
    setOutcome((current) => current || REVIEW_TYPES[row.review_type].outcomes[0]);
  }, [reviewId, currentUser.id]);
  useEffect(() => { void load(); }, [load]);

  if (missing) return <main className="flex-1 p-8 text-sm text-slate-500">This review could not be found. <button type="button" onClick={() => navigate('/engineering/review')} className="font-bold text-brand-600">Back</button></main>;
  if (!review || !project) return <main className="flex-1 p-8 text-xs text-slate-400">{error || 'Loading…'}</main>;

  const person = (id: string | null) => (id === currentUser.id ? 'You' : users.find((user) => user.id === id)?.name || 'Unknown');
  const isReviewer = isAdmin || team.some((member) => member.user_id === currentUser.id && member.discipline === project.discipline);
  const canDecide = review.submitted_by === currentUser.id || project.owner_id === currentUser.id || project.created_by === currentUser.id || isAdmin;
  const teamSize = team.filter((member) => member.discipline === project.discipline).length;
  const required = Math.max(1, Math.min(MIN_VOTES, teamSize || 1));
  const closed = review.status === 'decided';
  const spec = REVIEW_TYPES[review.review_type];
  const tally = { approve: votes.filter((vote) => vote.verdict === 'approve').length, changes: votes.filter((vote) => vote.verdict === 'changes').length, reject: votes.filter((vote) => vote.verdict === 'reject').length };

  const submitVote = async () => {
    const existing = votes.find((vote) => vote.reviewer_id === currentUser.id);
    const payload = { verdict, comment: comment.trim() || null };
    const { error: voteError } = existing
      ? await supabase.from('eng_review_votes').update(payload).eq('id', existing.id)
      : await supabase.from('eng_review_votes').insert({ review_id: review.id, reviewer_id: currentUser.id, ...payload });
    if (voteError) setError(voteError.message); else { setError(''); await load(); }
  };
  const decide = async () => {
    const { error: decideError } = await supabase.from('eng_reviews').update({ status: 'decided', outcome, decision_note: note.trim() || null, decided_by: currentUser.id, decided_at: new Date().toISOString() }).eq('id', review.id);
    if (decideError) { setError(decideError.message); return; }
    await supabase.from('eng_project_entries').insert({ project_id: project.id, author_id: currentUser.id, kind: 'decision', body: `${review.title}: ${outcome}${note.trim() ? `. ${note.trim()}` : ''}` });
    await load();
  };
  const reopen = async () => {
    const { error: reopenError } = await supabase.from('eng_reviews').update({ status: 'in_review', outcome: null, decision_note: null, decided_by: null, decided_at: null }).eq('id', review.id);
    if (reopenError) setError(reopenError.message); else await load();
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-8">
        <button type="button" onClick={() => navigate('/engineering/review')} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-brand-600"><ArrowLeft className="h-3.5 w-3.5" />Review</button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><h1 className="text-xl font-bold text-slate-900">{review.title}</h1><p className="mt-1 text-xs text-slate-500">{spec.label}{review.requested_action ? ` · for ${review.requested_action}` : ''} · submitted by {person(review.submitted_by)} {ago(review.created_at)}</p></div>
          <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${closed ? outcomeTone(review.outcome) : 'bg-amber-50 text-amber-700'}`}>{statusText(review)}</span>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{userFacingError(error)}</div>}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Submission</h2>
            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-400">Project</dt><dd><button type="button" onClick={() => navigate(`/engineering/${project.discipline}/${project.id}`)} className="font-semibold text-brand-600">{disciplineOf(project.discipline).label} · {project.name}</button></dd></div>
              <div><dt className="text-slate-400">Project owner</dt><dd className="font-semibold text-slate-700">{person(project.owner_id)}</dd></div>
              <div><dt className="text-slate-400">Needed for</dt><dd className="font-semibold text-slate-700">{review.requested_action || 'Not specified'}</dd></div>
              <div><dt className="text-slate-400">Project target</dt><dd className="font-semibold text-slate-700">{project.target_date || 'Not set'}</dd></div>
            </dl>
            {review.summary && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{review.summary}</p>}
            {file ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                <span className="min-w-0 flex-1"><b className="block truncate text-sm text-slate-800">{file.name}</b><span className="text-xs text-slate-400">{fileSize(file.size_bytes)} · uploaded by {person(file.uploaded_by)}</span></span>
                <button type="button" onClick={() => void openEngFile(file.storage_path).then((message) => message && setError(message))} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white md:min-h-0 md:py-1.5"><Download className="h-3.5 w-3.5" />Open file</button>
              </div>
            ) : <p className="mt-3 text-xs text-slate-400">No file attached.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Reviewer feedback</h2>
            <div className="mt-2 flex gap-2 text-xs">{(['approve', 'changes', 'reject'] as const).map((key) => <span key={key} className={`rounded-md px-2 py-1 font-bold ${VERDICTS[key].tone}`}>{VERDICTS[key].label} {tally[key]}</span>)}</div>
            <div className="mt-3 space-y-2">
              {votes.map((vote) => (
                <div key={vote.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between text-xs"><b className="text-slate-700">{person(vote.reviewer_id)}</b><span className={`rounded-md px-2 py-0.5 font-bold ${VERDICTS[vote.verdict].tone}`}>{VERDICTS[vote.verdict].label}</span></div>{vote.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{vote.comment}</p>}</div>
              ))}
              {!votes.length && <p className="text-xs text-slate-400">No feedback yet.</p>}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {!closed && isReviewer && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-slate-900">Your review</h2>
              <div className="mt-2 grid gap-1.5">{(['approve', 'changes', 'reject'] as const).map((key) => <button key={key} type="button" aria-pressed={verdict === key} onClick={() => setVerdict(key)} className={`min-h-11 rounded-lg border px-3 text-left text-xs font-bold md:min-h-0 md:py-2 ${verdict === key ? `${VERDICTS[key].tone} border-current` : 'border-slate-200 text-slate-600'}`}>{VERDICTS[key].label}</button>)}</div>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Feedback for the submitter" className={`${inputClass} mt-2 min-h-24`} />
              <button type="button" onClick={() => void submitVote()} className="mt-2 w-full rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">{votes.some((vote) => vote.reviewer_id === currentUser.id) ? 'Update my review' : 'Submit my review'}</button>
            </section>
          )}
          {!closed && !isReviewer && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">Only the {disciplineOf(project.discipline).label.toLowerCase()} review team can vote. Ask an admin to add you on the Review page.</p>}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Decision</h2>
            {closed ? (
              <div className="mt-2 space-y-2 text-sm"><p className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold ${outcomeTone(review.outcome)}`}>{review.outcome}</p>{review.decision_note && <p className="text-slate-700">{review.decision_note}</p>}<p className="text-xs text-slate-400">By {person(review.decided_by)}{review.decided_at ? ` ${ago(review.decided_at)}` : ''}</p>{canDecide && <button type="button" onClick={() => void reopen()} className="text-xs font-bold text-brand-600">Reopen review</button>}</div>
            ) : canDecide ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-500">{votes.length >= required ? 'Enough reviewers have responded. Record the outcome.' : `Waiting for ${required - votes.length} more reviewer vote${required - votes.length === 1 ? '' : 's'} before you can decide.`}</p>
                <CustomSelect value={outcome} onChange={(event) => setOutcome(event.target.value)} disabled={votes.length < required} className={inputClass} aria-label="Outcome">{spec.outcomes.map((item) => <option key={item} value={item}>{item}</option>)}</CustomSelect>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={votes.length < required} placeholder="Decision note (optional)" className={`${inputClass} min-h-16`} />
                <button type="button" onClick={() => void decide()} disabled={votes.length < required} className="w-full rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Record decision</button>
              </div>
            ) : <p className="mt-2 text-xs text-slate-500">The submitter, project owner or an admin records the final outcome once {required} reviewer{required === 1 ? ' has' : 's have'} voted ({votes.length} so far).</p>}
          </section>
        </aside>
      </div>
    </main>
  );
};
