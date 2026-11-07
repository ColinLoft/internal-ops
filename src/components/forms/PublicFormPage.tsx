import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { FormQuestionField, visibleFormQuestions } from './FormQuestionField';
import { readFormSchema, validateFormAnswers } from './formsModel';
import type { FormAnswers, FormSchema } from './formsModel';

type PublicFormPageProps = { token: string };
type SharedForm = { publicationId: string; scope: 'staff' | 'public'; accepting: boolean; schema: FormSchema };

const panelClass = 'rounded-lg border border-slate-200 bg-white p-4 sm:p-5';
const inputClass = 'min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';

const explainError = (message: string) => {
  if (/not found|invalid.*link|invalid input syntax for type uuid|expired/i.test(message)) return 'This form link is invalid or has expired.';
  if (/closed|not accepting/i.test(message)) return 'This form is no longer accepting responses.';
  if (/sign in|authentication|staff/i.test(message)) return 'This form is limited to signed-in staff. Sign in with your workspace account, then open the link again.';
  if (/schema|migration|function.*not found|does not exist/i.test(message)) return 'The form service is not available yet. Ask a workspace administrator to apply the Forms migration.';
  return `Your response could not be submitted. ${message}`;
};

export const PublicFormPage: React.FC<PublicFormPageProps> = ({ token }) => {
  const { isAuthenticated } = useWorkspace();
  const [sharedForm, setSharedForm] = useState<SharedForm | null>(null);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [respondentName, setRespondentName] = useState('');
  const [respondentEmail, setRespondentEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    setSharedForm(null);
    setAnswers({});
    setSubmitted(false);
    Promise.resolve(supabase.rpc('get_company_form', { p_share_token: token }))
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError || !data || typeof data !== 'object') {
          setError(explainError(loadError?.message ?? 'The form was not found.'));
          setIsLoading(false);
          return;
        }
        const result = data as Record<string, unknown>;
        const scope = result.access_scope === 'public' ? 'public' : 'staff';
        setSharedForm({
          publicationId: String(result.publication_id ?? ''),
          scope,
          accepting: result.accepting_responses === true,
          schema: readFormSchema(String((result.schema as Record<string, unknown> | undefined)?.title ?? 'Form'), result.schema),
        });
        setIsLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(explainError(cause instanceof Error ? cause.message : 'The form could not be loaded.'));
        setIsLoading(false);
      });
    return () => { active = false; };
  }, [token, isAuthenticated]);

  const visibleQuestions = useMemo(
    () => sharedForm ? visibleFormQuestions(sharedForm.schema.questions, answers) : [],
    [sharedForm, answers],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sharedForm || submitted || !sharedForm.accepting) return;
    const nextErrors = validateFormAnswers(sharedForm.schema, answers);
    setErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: submitError } = await supabase.rpc('submit_company_form', {
        p_share_token: token,
        p_answers: answers,
        p_respondent_name: respondentName.trim() || null,
        p_respondent_email: respondentEmail.trim() || null,
      });
      if (submitError) {
        setError(explainError(submitError.message));
        return;
      }
      setSubmitted(true);
      setAnswers({});
    } catch (cause) {
      setError(explainError(cause instanceof Error ? cause.message : 'The response could not be submitted.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-full flex-1 overflow-y-auto bg-[#f7f9fc] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-4">
        {isLoading ? <div className={`${panelClass} py-12 text-center text-sm text-slate-600`}><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading form…</div>
          : error && !sharedForm ? <div role="alert" className={`${panelClass} text-sm text-rose-800`}>{error}</div>
            : submitted ? <section role="status" className={`${panelClass} py-10 text-center`}>
              <h1 className="text-xl font-semibold text-slate-900">Response received</h1>
              <p className="mt-2 text-sm text-slate-600">Thank you. Your answers have been submitted.</p>
            </section>
              : sharedForm && <>
                <header className={panelClass}>
                  <h1 className="text-xl font-semibold text-slate-900">{sharedForm.schema.title}</h1>
                  {sharedForm.schema.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{sharedForm.schema.description}</p>}
                  {sharedForm.scope === 'staff' && <p className="mt-3 text-sm text-slate-600">Staff-only form. Responses require a signed-in workspace account.</p>}
                </header>
                {!sharedForm.accepting && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">This form is no longer accepting responses.</p>}
                <form onSubmit={(event) => void submit(event)} className="space-y-4">
                  {visibleQuestions.map((question) => question.type === 'section'
                    ? <section key={question.id} className={panelClass}><h2 className="font-semibold text-slate-900">{question.label}</h2>{question.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{question.description}</p>}</section>
                    : <section key={question.id} className={panelClass}>
                      <FormQuestionField
                        formId={sharedForm.publicationId}
                        question={question}
                        value={answers[question.id]}
                        error={errors[question.id]}
                        onChange={(value) => {
                          setAnswers((current) => ({ ...current, [question.id]: value }));
                          setErrors((current) => ({ ...current, [question.id]: '' }));
                        }}
                      />
                    </section>)}

                  {sharedForm.scope === 'public' && (
                    <section className={`${panelClass} grid gap-3 sm:grid-cols-2`}>
                      <label className="block text-sm font-medium text-slate-800">Name (optional)<input maxLength={120} value={respondentName} onChange={(event) => setRespondentName(event.target.value)} className={`${inputClass} mt-2`} /></label>
                      <label className="block text-sm font-medium text-slate-800">Email (optional)<input type="email" maxLength={254} value={respondentEmail} onChange={(event) => setRespondentEmail(event.target.value)} className={`${inputClass} mt-2`} /></label>
                    </section>
                  )}
                  {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
                  {sharedForm.accepting && <button type="submit" disabled={isSubmitting} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isSubmitting ? 'Submitting…' : 'Submit response'}
                  </button>}
                </form>
              </>}
      </div>
    </main>
  );
};
