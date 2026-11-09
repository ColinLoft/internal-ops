import { userFacingError } from '../../lib/userFacingError';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCopy,
  Eye,
  FilePlus2,
  FileText,
  Globe2,
  Loader2,
  LockKeyhole,
  Plus,
  Send,
  Table2,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { EmptyState } from '../common/Feedback';
import { CustomSelect } from '../common/CustomSelect';
import { FormQuestionField, visibleFormQuestions } from './FormQuestionField';
import { createCompanyForm } from './formsPersistence';
import {
  createFormQuestion,
  csvCell,
  FORM_QUESTION_TYPES,
  hasFormOptions,
  readFormSchema,
  validateFormAnswers,
} from './formsModel';
import type { FormAnswers, FormQuestionType, FormSchema } from './formsModel';

type FormRecord = {
  id: string;
  owner_id: string;
  name: string;
  content: Record<string, unknown>;
  updated_at: string;
};

type Publication = {
  id: string;
  form_id: string;
  share_token: string;
  access_scope: 'staff' | 'public';
  published_schema: FormSchema;
  version: number;
  published_at: string;
  accepting_responses: boolean;
  revoked_at: string | null;
};

type FormResponse = {
  id: string;
  submitted_at: string;
  answers: FormAnswers;
  publication_id: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
};

type FormTab = 'build' | 'preview' | 'responses' | 'share';

const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButtonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const panelClass = 'rounded-lg border border-slate-200 bg-white p-4';

const responseText = (value: unknown) => Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value);

const buildCsv = (responses: FormResponse[], formPublications: Publication[], draft: FormSchema, name: string) => {
  const columns = [
    ...draft.questions
      .filter((question) => question.type !== 'section')
      .map((question) => ({ publicationId: null as string | null, questionId: question.id, label: `Draft · ${question.label}` })),
    ...formPublications.flatMap((publication) => publication.published_schema.questions
      .filter((question) => question.type !== 'section')
      .map((question) => ({ publicationId: publication.id, questionId: question.id, label: `Version ${publication.version} · ${question.label}` }))),
  ];
  const rows = [
    ['Submitted', 'Respondent name', 'Respondent email', ...columns.map((column) => column.label)],
    ...responses.map((response) => {
      return [
        new Date(response.submitted_at).toLocaleString(),
        response.respondent_name ?? '',
        response.respondent_email ?? '',
        ...columns.map((column) =>
          column.publicationId === response.publication_id
            ? responseText(response.answers[column.questionId])
            : ''),
      ];
    }),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.replace(/[^\w.-]+/g, '_') || 'form'}-responses.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const schemaProblems = (schema: FormSchema) => {
  const problems: string[] = [];
  if (!schema.title.trim()) problems.push('Add a form title.');
  if (schema.title.length > 300) problems.push('Keep the form title to 300 characters or fewer.');
  if (schema.description.length > 5000) problems.push('Keep the form description to 5,000 characters or fewer.');
  if (schema.questions.length > 100) problems.push('A form can have no more than 100 questions.');
  const ids = new Set<string>();
  schema.questions.forEach((question, index) => {
    if (ids.has(question.id)) problems.push(`Question ${index + 1} has a duplicate identifier. Remove and add it again.`);
    ids.add(question.id);
    if (!question.label.trim()) problems.push(`Add a label to question ${index + 1}.`);
    if (question.label.length > 300) problems.push(`Keep question ${index + 1} to 300 characters or fewer.`);
    if (hasFormOptions(question.type) && !question.options.filter((option) => option.trim()).length) problems.push(`Add at least one option to “${question.label || `Question ${index + 1}`}”.`);
    if (hasFormOptions(question.type) && (question.options.length > 100 || question.options.some((option) => option.length > 300))) problems.push(`Keep “${question.label}” to 100 options of 300 characters or fewer.`);
    if (question.options.some((option) => !option.trim())) problems.push(`Fill in or remove the empty option on “${question.label || `Question ${index + 1}`}”.`);
    if (new Set(question.options).size !== question.options.length) problems.push(`Remove duplicate options from “${question.label || `Question ${index + 1}`}”.`);
    if (question.condition && !schema.questions.slice(0, index).some((parent) => parent.id === question.condition?.questionId && hasFormOptions(parent.type))) {
      problems.push(`The condition on “${question.label || `Question ${index + 1}`}” needs an earlier choice question.`);
    }
    if (question.validation?.minLength !== undefined && question.validation?.maxLength !== undefined && question.validation.minLength > question.validation.maxLength) {
      problems.push(`The minimum length is larger than the maximum on “${question.label}”.`);
    }
    if (question.validation?.min !== undefined && question.validation?.max !== undefined && question.validation.min > question.validation.max) {
      problems.push(`The minimum value is larger than the maximum on “${question.label}”.`);
    }
    if (question.validation?.minLength !== undefined && (question.validation.minLength < 0 || question.validation.minLength > 10000)) problems.push(`Set “${question.label}” minimum length between 0 and 10,000.`);
    if (question.validation?.maxLength !== undefined && (question.validation.maxLength < 1 || question.validation.maxLength > 10000)) problems.push(`Set “${question.label}” maximum length between 1 and 10,000.`);
    if (question.type === 'scale' && (!Number.isInteger(question.scaleMax) || (question.scaleMax ?? 0) < 2 || (question.scaleMax ?? 11) > 10)) problems.push(`Set “${question.label}” scale maximum from 2 to 10.`);
  });
  if (!schema.questions.some((question) => question.type !== 'section')) problems.push('Add at least one question before publishing.');
  return problems;
};

export const FormsPage: React.FC = () => {
  const { currentUser, isAuthenticated } = useWorkspace();
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [editorPermissions, setEditorPermissions] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(() => {
    const oldEditorPath = window.location.pathname.match(/^\/forms\/([^/]+)/)?.[1];
    return new URLSearchParams(window.location.search).get('form') || oldEditorPath || null;
  });
  const [draft, setDraft] = useState<FormSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [tab, setTab] = useState<FormTab>('build');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shareScope, setShareScope] = useState<'staff' | 'public'>('staff');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [previewAnswers, setPreviewAnswers] = useState<FormAnswers>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);

  const loadForms = useCallback(async (selectId?: string | null) => {
    setIsLoading(true);
    setError('');
    const [formsResult, publicationsResult] = await Promise.all([
      supabase.from('company_forms')
        .select('id,owner_id,name,content,updated_at')
        .is('archived_at', null)
        .order('updated_at', { ascending: false }),
      supabase.from('company_form_publications')
        .select('id,form_id,share_token,access_scope,published_schema,version,published_at,accepting_responses,revoked_at')
        .order('version', { ascending: false }),
    ]);

    if (formsResult.error) {
      setError(`Could not load forms: ${formsResult.error.message}`);
      setIsLoading(false);
      return;
    }
    if (publicationsResult.error) {
      setError(/company_form_publications|company_forms|schema cache|relation|does not exist/i.test(publicationsResult.error.message)
        ? 'The Forms feature database migration has not been applied. Ask a workspace administrator to run 20261107150000_company_forms.sql.'
        : `Could not load publication settings: ${publicationsResult.error.message}`);
      setIsLoading(false);
      return;
    }

    const nextForms = (formsResult.data ?? []) as FormRecord[];
    const nextPublications = (publicationsResult.data ?? []) as Publication[];
    const shared = nextForms.filter((form) => form.owner_id !== currentUser.id);
    const sharesResult = shared.length
      ? await supabase.from('company_form_collaborators').select('form_id,shared_with_user_id,shared_with_email,permission').in('form_id', shared.map((form) => form.id))
      : { data: [], error: null };
    if (sharesResult.error) {
      setError(`Could not check form editing access: ${sharesResult.error.message}`);
      setIsLoading(false);
      return;
    }
    const permissions: Record<string, boolean> = {};
    nextForms.forEach((form) => { permissions[form.id] = form.owner_id === currentUser.id; });
    (sharesResult.data ?? []).forEach((share) => {
      if (share.permission === 'editor' && (share.shared_with_user_id === currentUser.id || share.shared_with_email?.toLowerCase() === currentUser.email.toLowerCase())) {
        permissions[share.form_id] = true;
      }
    });
    setForms(nextForms);
    setPublications(nextPublications);
    setEditorPermissions(permissions);
    setActiveId((previous) => {
      const preferred = selectId && nextForms.some((form) => form.id === selectId) ? selectId : previous;
      return preferred && nextForms.some((form) => form.id === preferred) ? preferred : nextForms[0]?.id ?? null;
    });
    setIsLoading(false);
  }, [currentUser.id]);

  useEffect(() => { if (isAuthenticated) void loadForms(); }, [isAuthenticated, loadForms]);

  const activeForm = forms.find((form) => form.id === activeId) ?? null;
  const currentPublication = publications.find((publication) => publication.form_id === activeId && !publication.revoked_at) ?? null;
  const canEdit = Boolean(activeForm && editorPermissions[activeForm.id]);

  useEffect(() => {
    if (!activeForm) {
      setDraft(null);
      setIsDirty(false);
      return;
    }
    setDraft(readFormSchema(activeForm.name, activeForm.content));
    setIsDirty(false);
    setShareScope(currentPublication?.access_scope ?? 'staff');
    setPreviewAnswers({});
    setPreviewErrors({});
    setResponses([]);
  }, [activeForm?.id, currentPublication?.id]);

  const publishedSchemas = useMemo(() => {
    const map = new Map<string, FormSchema>();
    publications.forEach((publication) => map.set(publication.id, readFormSchema(publication.published_schema.title, publication.published_schema)));
    return map;
  }, [publications]);

  const loadResponses = useCallback(async (formId: string) => {
    setIsLoadingResponses(true);
    setError('');
    const { data, error: responseError } = await supabase.from('company_form_responses')
      .select('id,submitted_at,answers,publication_id,respondent_name,respondent_email')
      .eq('form_id', formId)
      .order('submitted_at', { ascending: false })
      .limit(1000);
    if (responseError) {
      setError(`Could not load responses: ${responseError.message}`);
      setIsLoadingResponses(false);
      return;
    }
    setResponses((data ?? []) as FormResponse[]);
    setIsLoadingResponses(false);
  }, []);

  useEffect(() => {
    if (tab === 'responses' && activeId) void loadResponses(activeId);
  }, [tab, activeId, loadResponses]);

  const changeDraft = (change: (current: FormSchema) => FormSchema) => {
    setDraft((current) => current ? change(current) : current);
    setIsDirty(true);
    setNotice('');
  };

  const saveDraft = async () => {
    if (!activeForm || !draft) return false;
    if (!canEdit) {
      setError('You have view-only access to this form. Ask its owner for editor access.');
      return false;
    }
    setIsSaving(true);
    setError('');
    const content = {
      ...activeForm.content,
      title: draft.title,
      description: draft.description,
      questions: draft.questions,
    };
    const { data, error: saveError } = await (async () => {
      try {
        const result = await supabase.from('company_forms')
          .update({ name: draft.title.trim() || activeForm.name, content, updated_at: new Date().toISOString() })
          .eq('id', activeForm.id)
          .select('id,owner_id,name,content,updated_at')
          .single();
        return { data: result.data as FormRecord | null, error: result.error };
      } catch (cause) {
        return { data: null, error: { message: cause instanceof Error ? cause.message : 'The server request failed.' } };
      }
    })();
    setIsSaving(false);
    if (saveError || !data) {
      setError(`Could not save this form: ${saveError?.message ?? 'The server did not confirm the save.'}`);
      return false;
    }
    setForms((current) => current.map((form) => form.id === data.id ? data as FormRecord : form));
    setIsDirty(false);
    setNotice('Draft saved. Published forms do not change until you publish a new version.');
    return true;
  };

  const createForm = async () => {
    setError('');
    const { data, error: createError } = await (async () => {
      try {
        const result = await createCompanyForm(currentUser.id);
        return { data: result as FormRecord, error: null };
      } catch (cause) {
        return { data: null, error: { message: cause instanceof Error ? cause.message : 'The server request failed.' } };
      }
    })();
    if (createError || !data) {
      setError(`Could not create a form: ${createError?.message ?? 'The server did not confirm creation.'}`);
      return;
    }
    await loadForms(data.id);
    setTab('build');
  };

  const publish = async () => {
    if (!activeForm || !draft) return;
    const problems = schemaProblems(draft);
    if (problems.length) {
      setError(problems.join(' '));
      setTab('build');
      return;
    }
    if (isDirty && !await saveDraft()) return;
    if (!canEdit) {
      setError('You have view-only access to this form. Ask its owner for editor access.');
      return;
    }
    setIsPublishing(true);
    setError('');
    const setting = (activeForm.content.settings as { acceptingResponses?: boolean } | undefined)?.acceptingResponses !== false;
    const { error: publishError } = await (async () => {
      try {
        return await supabase.rpc('publish_company_form', {
          p_form_id: activeForm.id,
          p_schema: draft,
          p_access_scope: shareScope,
          p_accepting_responses: currentPublication?.accepting_responses ?? setting,
        });
      } catch (cause) {
        return { error: { message: cause instanceof Error ? cause.message : 'The server request failed.' } };
      }
    })();
    setIsPublishing(false);
    if (publishError) {
      setError(`Could not publish this form: ${publishError.message}`);
      return;
    }
    setTab('share');
    setNotice('A new, immutable version is published. Existing responses and earlier versions are preserved.');
    await loadForms(activeForm.id);
  };

  const toggleAccepting = async (accepting: boolean) => {
    if (!currentPublication) {
      if (!draft || !activeForm) return;
      setError('');
      const settings = { ...((activeForm.content.settings as Record<string, unknown> | undefined) ?? {}), acceptingResponses: accepting };
      setForms((current) => current.map((form) => form.id === activeForm.id ? { ...form, content: { ...form.content, settings } } : form));
      setIsDirty(true);
      setNotice('Save the draft, then publish to enable this response setting.');
      return;
    }
    const { error: updateError } = await (async () => {
      try {
        return await supabase.rpc('set_company_form_accepting', {
          p_publication_id: currentPublication.id,
          p_accepting_responses: accepting,
        });
      } catch (cause) {
        return { error: { message: cause instanceof Error ? cause.message : 'The server request failed.' } };
      }
    })();
    if (updateError) {
      setError(`Could not update response availability: ${updateError.message}`);
      return;
    }
    setPublications((current) => current.map((publication) => publication.id === currentPublication.id
      ? { ...publication, accepting_responses: accepting }
      : publication));
    setNotice(accepting ? 'This version is accepting responses.' : 'Responses are closed for this published version.');
  };

  const copyShareLink = async () => {
    if (!currentPublication) return;
    const url = `${window.location.origin}/company/forms/respond/${currentPublication.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
    }
  };

  const submitPreview = () => {
    const nextErrors = validateFormAnswers(draft!, previewAnswers);
    setPreviewErrors(nextErrors);
    setNotice(Object.keys(nextErrors).length ? '' : 'Preview complete. Preview answers are not saved.');
  };

  const tabs: Array<{ key: FormTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { key: 'build', label: 'Build', icon: FileText },
    { key: 'preview', label: 'Preview', icon: Eye },
    { key: 'responses', label: 'Responses', icon: Table2 },
    { key: 'share', label: 'Share', icon: Send },
  ];

  if (!isAuthenticated) {
    return <main className="flex min-w-0 flex-1 items-center justify-center p-8"><p className="text-sm text-slate-600">Sign in with a staff account to manage forms.</p></main>;
  }

  return (
    <main data-onboarding-target="company-forms" className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[#f7f9fc]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Forms</h1>
          <p className="mt-1 text-sm text-slate-600">Create staff forms and public questionnaires. Published versions stay fixed.</p>
        </div>
        <button type="button" onClick={() => void createForm()} className={primaryButtonClass}>
          <FilePlus2 className="h-4 w-4" />New form
        </button>
      </header>

      {error && <div role="alert" className="mx-5 mt-4 flex items-start justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:mx-8"><span>{userFacingError(error)}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error" className="font-semibold">Dismiss</button></div>}
      {notice && <p role="status" className="mx-5 mt-3 text-sm text-emerald-800 sm:mx-8">{notice}</p>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className={`${panelClass} flex min-h-48 flex-col p-0 lg:max-h-[calc(100vh-190px)]`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Your forms</h2>
            <span className="text-xs tabular-nums text-slate-500">{forms.length}</span>
          </div>
          {isLoading
            ? <p className="p-4 text-sm text-slate-500">Loading forms…</p>
            : forms.length === 0
              ? <div className="p-4"><p className="text-sm text-slate-600">No forms yet.</p><button type="button" onClick={() => void createForm()} className="mt-3 text-sm font-medium text-brand-700 hover:underline">Create the first form</button></div>
              : <ul className="min-h-0 divide-y divide-slate-100 overflow-y-auto">
                {forms.map((form) => {
                  const publication = publications.find((item) => item.form_id === form.id && !item.revoked_at);
                  const schema = readFormSchema(form.name, form.content);
                  return (
                    <li key={form.id}>
                      <button type="button" onClick={() => { setActiveId(form.id); setTab('build'); setError(''); setNotice(''); }} aria-current={activeId === form.id ? 'page' : undefined} className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${activeId === form.id ? 'bg-slate-100' : ''}`}>
                        <span className="block truncate text-sm font-medium text-slate-900">{schema.title || 'Untitled form'}</span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{publication ? `Published · v${publication.version}` : 'Draft'}</span>
                          {publication?.access_scope === 'public' ? <Globe2 className="h-3.5 w-3.5 shrink-0" aria-label="Public" /> : publication ? <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-label="Staff only" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>}
        </aside>

        <section className={`${panelClass} flex min-h-[520px] min-w-0 flex-col p-0`}>
          {!activeForm || !draft
            ? <div className="flex flex-1 items-center justify-center p-8">{isLoading ? <p className="text-sm text-slate-500">Loading your workspace…</p> : <EmptyState title="Choose a form" text="Select a form or create a new one to start building." />}</div>
            : <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">{draft.title || 'Untitled form'}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{canEdit ? isDirty ? 'Unsaved changes' : 'Draft saved' : 'View only'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canEdit && <button type="button" disabled={!isDirty || isSaving} onClick={() => void saveDraft()} className={buttonClass}>{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}{isSaving ? 'Saving…' : 'Save draft'}</button>}
                  {canEdit && <button type="button" disabled={isPublishing || isSaving} onClick={() => void publish()} className={primaryButtonClass}>{isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Publish</button>}
                </div>
              </div>
              <nav role="tablist" aria-label="Form workspace" className="flex overflow-x-auto border-b border-slate-200 px-3">
                {tabs.map(({ key, label, icon: Icon }) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setError(''); setNotice(''); }} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                    <Icon className="h-4 w-4" />{label}{key === 'responses' && responses.length > 0 ? ` (${responses.length})` : ''}
                  </button>
                ))}
              </nav>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {tab === 'build' && (
                  <div className="mx-auto max-w-3xl space-y-4">
                    {!canEdit && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">You have view-only access. Ask the owner for editor access to make changes.</p>}
                    <section className={`${panelClass} space-y-3`}>
                      <label className="block text-sm font-medium text-slate-800">Form title<input aria-label="Form title" disabled={!canEdit} value={draft.title} onChange={(event) => changeDraft((current) => ({ ...current, title: event.target.value }))} className={`${fieldClass} mt-2`} /></label>
                      <label className="block text-sm font-medium text-slate-800">Description<textarea aria-label="Form description" disabled={!canEdit} rows={2} value={draft.description} onChange={(event) => changeDraft((current) => ({ ...current, description: event.target.value }))} className={`${fieldClass} mt-2 resize-y`} /></label>
                    </section>

                    {draft.questions.map((question, index) => {
                      const choiceParents = draft.questions.slice(0, index).filter((candidate) => hasFormOptions(candidate.type));
                      const selectedParent = choiceParents.find((candidate) => candidate.id === question.condition?.questionId);
                      return (
                        <article key={question.id} className={`${panelClass} space-y-3`}>
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                            <label className="block text-sm font-medium text-slate-800">{question.type === 'section' ? 'Section heading' : 'Question'}<input aria-label={question.type === 'section' ? 'Section heading' : 'Question label'} disabled={!canEdit} value={question.label} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, label: event.target.value } : item) }))} className={`${fieldClass} mt-2`} /></label>
                            <label className="block text-sm font-medium text-slate-800">Field type<CustomSelect aria-label="Field type" disabled={!canEdit} value={question.type} onChange={(event) => {
                              const type = event.target.value as FormQuestionType;
                              changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? {
                                ...item,
                                type,
                                options: hasFormOptions(type) ? item.options.length ? item.options : ['Option 1'] : [],
                                ...(type === 'scale' ? { scaleMax: item.scaleMax ?? 5 } : {}),
                                ...(type === 'section' ? { required: false, condition: undefined } : {}),
                              } : item) }));
                            }} className={`${fieldClass} mt-2`}>
                              {FORM_QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </CustomSelect></label>
                          </div>
                          {question.type !== 'section' && (
                            <>
                              <label className="block text-sm font-medium text-slate-800">Help text<textarea aria-label="Question help text" disabled={!canEdit} rows={2} value={question.description ?? ''} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, description: event.target.value } : item) }))} className={`${fieldClass} mt-2 resize-y`} /></label>
                              {hasFormOptions(question.type) && (
                                <fieldset>
                                  <legend className="mb-2 text-sm font-medium text-slate-800">Options</legend>
                                  <div className="space-y-2">
                                    {question.options.map((option, optionIndex) => (
                                      <div key={`${question.id}-option-${optionIndex}`} className="flex items-center gap-2">
                                        <input aria-label={`Option ${optionIndex + 1}`} disabled={!canEdit} value={option} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, options: item.options.map((value, i) => i === optionIndex ? event.target.value : value) } : item) }))} className={fieldClass} />
                                        <button type="button" disabled={!canEdit || question.options.length === 1} aria-label={`Remove option ${optionIndex + 1}`} onClick={() => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, options: item.options.filter((_, i) => i !== optionIndex) } : item) }))} className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                                      </div>
                                    ))}
                                  </div>
                                  <button type="button" disabled={!canEdit} onClick={() => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, options: [...item.options, `Option ${item.options.length + 1}`] } : item) }))} className="mt-2 text-sm font-medium text-brand-700 hover:underline">Add option</button>
                                </fieldset>
                              )}
                              {question.type === 'scale' && <label className="block text-sm font-medium text-slate-800">Scale maximum<CustomSelect aria-label="Scale maximum" disabled={!canEdit} value={question.scaleMax ?? 5} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, scaleMax: Number(event.target.value) } : item) }))} className={`${fieldClass} mt-2`}>{[3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}</CustomSelect></label>}
                              {(question.type === 'short_text' || question.type === 'paragraph') && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="block text-sm font-medium text-slate-800">Minimum characters<input aria-label="Minimum characters" disabled={!canEdit} type="number" min={0} max={10000} value={question.validation?.minLength ?? ''} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, validation: { ...item.validation, minLength: event.target.value ? Number(event.target.value) : undefined } } : item) }))} className={`${fieldClass} mt-2`} /></label>
                                  <label className="block text-sm font-medium text-slate-800">Maximum characters<input aria-label="Maximum characters" disabled={!canEdit} type="number" min={1} max={10000} value={question.validation?.maxLength ?? 2000} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, validation: { ...item.validation, maxLength: event.target.value ? Number(event.target.value) : undefined } } : item) }))} className={`${fieldClass} mt-2`} /></label>
                                </div>
                              )}
                              {question.type === 'number' && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="block text-sm font-medium text-slate-800">Minimum value<input aria-label="Minimum value" disabled={!canEdit} type="number" value={question.validation?.min ?? ''} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, validation: { ...item.validation, min: event.target.value ? Number(event.target.value) : undefined } } : item) }))} className={`${fieldClass} mt-2`} /></label>
                                  <label className="block text-sm font-medium text-slate-800">Maximum value<input aria-label="Maximum value" disabled={!canEdit} type="number" value={question.validation?.max ?? ''} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, validation: { ...item.validation, max: event.target.value ? Number(event.target.value) : undefined } } : item) }))} className={`${fieldClass} mt-2`} /></label>
                                </div>
                              )}
                              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" disabled={!canEdit} checked={question.required} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, required: event.target.checked } : item) }))} className="h-4 w-4 accent-brand-600" />Required</label>
                              {choiceParents.length > 0 && (
                                <fieldset className="grid gap-2 sm:grid-cols-3">
                                  <legend className="mb-2 text-sm font-medium text-slate-800">Conditional visibility</legend>
                                  <select aria-label="Show conditionally based on" disabled={!canEdit} value={question.condition?.questionId ?? ''} onChange={(event) => {
                                    const parent = choiceParents.find((item) => item.id === event.target.value);
                                    changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? {
                                      ...item,
                                      condition: parent ? { questionId: parent.id, operator: parent.type === 'checkbox' ? 'contains' : 'equals', value: parent.options[0] ?? '' } : undefined,
                                    } : item) }));
                                  }} className={fieldClass}>
                                    <option value="">Always show</option>
                                    {choiceParents.map((parent) => <option key={parent.id} value={parent.id}>{parent.label}</option>)}
                                  </select>
                                  {selectedParent && <>
                                    <select aria-label="Condition operator" disabled={!canEdit || selectedParent.type === 'checkbox'} value={question.condition?.operator ?? 'equals'} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id && item.condition ? { ...item, condition: { ...item.condition, operator: event.target.value as 'equals' | 'not_equals' | 'contains' } } : item) }))} className={fieldClass}>
                                      <option value="equals">is</option><option value="not_equals">is not</option>
                                    </select>
                                    <select aria-label="Condition answer" disabled={!canEdit} value={question.condition?.value ?? ''} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id && item.condition ? { ...item, condition: { ...item.condition, value: event.target.value } } : item) }))} className={fieldClass}>
                                      {selectedParent.options.map((option, i) => <option key={`${option}-${i}`} value={option}>{option}</option>)}
                                    </select>
                                  </>}
                                </fieldset>
                              )}
                            </>
                          )}
                          {question.type === 'section' && <label className="block text-sm font-medium text-slate-800">Section description<textarea aria-label="Section description" disabled={!canEdit} rows={2} value={question.description ?? ''} onChange={(event) => changeDraft((current) => ({ ...current, questions: current.questions.map((item) => item.id === question.id ? { ...item, description: event.target.value } : item) }))} className={`${fieldClass} mt-2 resize-y`} /></label>}
                          <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                            <button type="button" disabled={!canEdit || index === 0} onClick={() => changeDraft((current) => { const next = [...current.questions]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return { ...current, questions: next }; })} aria-label="Move question up" className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
                            <button type="button" disabled={!canEdit || index === draft.questions.length - 1} onClick={() => changeDraft((current) => { const next = [...current.questions]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return { ...current, questions: next }; })} aria-label="Move question down" className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ArrowDown className="h-4 w-4" /></button>
                            <button type="button" disabled={!canEdit} onClick={() => changeDraft((current) => ({ ...current, questions: [...current.questions.slice(0, index + 1), { ...question, id: crypto.randomUUID() }, ...current.questions.slice(index + 1)] }))} className="rounded px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100">Duplicate</button>
                            <button type="button" disabled={!canEdit} onClick={() => changeDraft((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id).map((item) => item.condition?.questionId === question.id ? { ...item, condition: undefined } : item) }))} aria-label="Remove question" className="rounded p-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </article>
                      );
                    })}

                    {canEdit && <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => changeDraft((current) => ({ ...current, questions: [...current.questions, createFormQuestion()] }))} className={buttonClass}><Plus className="h-4 w-4" />Add question</button>
                      <button type="button" onClick={() => changeDraft((current) => ({ ...current, questions: [...current.questions, createFormQuestion('section')] }))} className={buttonClass}><Plus className="h-4 w-4" />Add section</button>
                    </div>}
                  </div>
                )}

                {tab === 'preview' && (
                  <form className="mx-auto max-w-2xl space-y-4" onSubmit={(event) => { event.preventDefault(); submitPreview(); }}>
                    <header className={`${panelClass}`}>
                      <h3 className="text-lg font-semibold text-slate-900">{draft.title || 'Untitled form'}</h3>
                      {draft.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{draft.description}</p>}
                    </header>
                    {visibleFormQuestions(draft.questions, previewAnswers).map((question) => question.type === 'section'
                      ? <section key={question.id} className={`${panelClass}`}><h4 className="font-semibold text-slate-900">{question.label}</h4>{question.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{question.description}</p>}</section>
                      : <section key={question.id} className={panelClass}><FormQuestionField formId={activeForm.id} question={question} value={previewAnswers[question.id]} error={previewErrors[question.id]} onChange={(value) => { setPreviewAnswers((current) => ({ ...current, [question.id]: value })); setPreviewErrors((current) => ({ ...current, [question.id]: '' })); }} /></section>)}
                    <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-600">Preview only. Answers are not saved.</p><button type="submit" className={buttonClass}>Test validation</button></div>
                  </form>
                )}

                {tab === 'responses' && (
                  <section className="mx-auto max-w-4xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><h3 className="text-base font-semibold text-slate-900">Responses</h3><p className="mt-1 text-sm text-slate-600">{responses.length} recorded{responses.length === 1000 ? ' (showing the latest 1,000)' : ''}</p></div>
                      <button type="button" disabled={!responses.length} onClick={() => buildCsv(responses, publications.filter((publication) => publication.form_id === activeForm.id), draft, draft.title)} className={buttonClass}><Table2 className="h-4 w-4" />Export CSV</button>
                    </div>
                    {isLoadingResponses ? <p className="py-10 text-center text-sm text-slate-500">Loading responses…</p>
                      : responses.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">There are no responses for this form yet.</p>
                        : responses.map((response) => {
                          const sourceSchema = response.publication_id ? publishedSchemas.get(response.publication_id) : draft;
                          const questions = sourceSchema?.questions.filter((question) => question.type !== 'section') ?? [];
                          return <article key={response.id} className={panelClass}>
                            <header className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3 text-sm">
                              <span className="font-medium text-slate-900">{response.respondent_name || response.respondent_email || 'Anonymous respondent'}</span>
                              <time className="text-slate-600">{new Date(response.submitted_at).toLocaleString()}</time>
                            </header>
                            {response.respondent_email && response.respondent_name && <p className="mt-2 text-sm text-slate-600">{response.respondent_email}</p>}
                            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                              {questions.map((question) => <div key={question.id} className="min-w-0">
                                <dt className="text-xs font-medium text-slate-600">{question.label}</dt>
                                <dd className="mt-1 break-words whitespace-pre-wrap text-sm text-slate-900">{responseText(response.answers[question.id]) || '—'}</dd>
                              </div>)}
                            </dl>
                          </article>;
                        })}
                  </section>
                )}

                {tab === 'share' && (
                  <section className="mx-auto max-w-2xl space-y-4">
                    <div className={panelClass}>
                      <h3 className="text-base font-semibold text-slate-900">Publish and share</h3>
                      <p className="mt-1 text-sm text-slate-600">Publishing freezes the current schema into a new version. Saving later edits will not change this link or its responses.</p>
                      <label className="mt-4 block text-sm font-medium text-slate-800">Who can respond?
                        <select disabled={!canEdit} value={shareScope} onChange={(event) => setShareScope(event.target.value as 'staff' | 'public')} className={`${fieldClass} mt-2`}>
                          <option value="staff">Staff accounts only</option>
                          <option value="public">Anyone with the link</option>
                        </select>
                      </label>
                      {currentPublication && (
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">Version {currentPublication.version} · {currentPublication.access_scope === 'public' ? 'Public link' : 'Staff only'}</p>
                              <p className="mt-1 text-xs text-slate-600">Published {new Date(currentPublication.published_at).toLocaleString()}</p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-800"><input type="checkbox" checked={currentPublication.accepting_responses} disabled={!canEdit} onChange={(event) => void toggleAccepting(event.target.checked)} className="h-4 w-4 accent-brand-600" />Accepting responses</label>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <input readOnly aria-label="Form share link" value={`${window.location.origin}/company/forms/respond/${currentPublication.share_token}`} onFocus={(event) => event.currentTarget.select()} className={`${fieldClass} min-w-0 flex-1`} />
                            <button type="button" onClick={() => void copyShareLink()} className={buttonClass}>{copyState === 'copied' ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}{copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy link'}</button>
                          </div>
                          {currentPublication.access_scope === 'staff' && <p className="mt-2 text-sm text-slate-600">Respondents must be signed in to a staff account. Public access is not enabled for this link.</p>}
                          {!currentPublication.accepting_responses && <p className="mt-2 text-sm text-amber-900">Responses are closed. Existing responses remain available.</p>}
                        </div>
                      )}
                      {!currentPublication && <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-700">This form is a private draft. Publish it to create a share link.</p>}
                      {canEdit && <button type="button" disabled={isPublishing || isSaving} onClick={() => void publish()} className={`${primaryButtonClass} mt-4`}>{isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{currentPublication ? `Publish version ${(currentPublication.version ?? 0) + 1}` : 'Publish form'}</button>}
                    </div>
                  </section>
                )}
              </div>
            </>}
        </section>
      </div>
    </main>
  );
};
