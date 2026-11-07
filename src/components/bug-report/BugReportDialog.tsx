import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bug, CheckCircle2, ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type BugReportDialogProps = {
  initialSubject?: string;
  initialDetails?: string;
  onClose: () => void;
};

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

export const BugReportDialog: React.FC<BugReportDialogProps> = ({ initialSubject = '', initialDetails = '', onClose }) => {
  const [subject, setSubject] = useState(initialSubject);
  const [details, setDetails] = useState(initialDetails);
  const [steps, setSteps] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, sending]);

  const selectScreenshot = (file: File | undefined) => {
    setError('');
    if (!file) {
      setScreenshot(null);
      return;
    }
    if (!allowedImageTypes.includes(file.type)) {
      setScreenshot(null);
      setError('Choose a PNG, JPEG, or WebP screenshot.');
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshot(null);
      setError('Screenshots must be 5 MB or smaller.');
      return;
    }
    setScreenshot(file);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError('');
    let screenshotPath: string | null = null;
    try {
      if (screenshot) {
        const safeName = screenshot.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'screenshot';
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw new Error(userError?.message || 'Your sign-in session could not be verified. Sign in again and retry.');
        screenshotPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('bug-report-screenshots').upload(screenshotPath, screenshot, {
          contentType: screenshot.type,
          upsert: false,
        });
        if (uploadError) throw new Error(`Screenshot upload failed: ${uploadError.message}`);
      }

      const location = new URL(window.location.href);
      const browserDiagnostics = includeDiagnostics ? {
        page: location.pathname,
        browser: navigator.userAgent,
        languages: navigator.languages,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen: { width: window.screen.width, height: window.screen.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      } : {};
      const description = [
        details.trim(),
        steps.trim() ? `Steps to reproduce:\n${steps.trim()}` : '',
        errorCode.trim() ? `Error code or message:\n${errorCode.trim()}` : '',
      ].filter(Boolean).join('\n\n');

      const { data, error: submitError } = await supabase.functions.invoke('submit-bug-report', {
        body: {
          subject: subject.trim(),
          description,
          includeDiagnostics,
          diagnostics: browserDiagnostics,
          screenshotPath,
        },
      });
      if (submitError) {
        if (screenshotPath) {
          const { error: removeError } = await supabase.storage.from('bug-report-screenshots').remove([screenshotPath]);
          if (removeError) console.error('Unable to remove the screenshot after the report failed:', removeError);
        }
        throw new Error(submitError.message || 'The bug report could not be submitted.');
      }
      if (typeof data?.ticketNumber !== 'number') throw new Error('The report was received, but a ticket number was not returned.');
      setTicketNumber(data.ticketNumber);
      window.dispatchEvent(new Event('flown-support-changed'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The bug report could not be submitted.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-3 sm:p-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !sending) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="bug-report-title" className="max-h-[min(90dvh,780px)] w-full max-w-xl overflow-y-auto rounded-2xl bg-white text-slate-900 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <Bug className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
            <div>
              <h2 id="bug-report-title" className="text-lg font-semibold">Report a bug</h2>
              <p className="mt-1 text-sm text-slate-600">Send a private developer ticket. It won’t be handled as a customer request.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close bug report" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </header>

        {ticketNumber !== null ? (
          <div className="p-6 sm:p-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <h3 className="mt-3 text-base font-semibold">Report sent · FL-{ticketNumber}</h3>
            <p className="mt-1 text-sm text-slate-600">A developer can find it in the internal bug queue.</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Done</button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4 p-5 sm:p-6">
            <label className="block text-sm font-medium text-slate-800">
              What went wrong?
              <input autoFocus required maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} placeholder="A short summary" />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Details
              <textarea required maxLength={6000} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} className={`${inputClass} resize-y`} placeholder="What did you expect to happen, and what happened instead?" />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Steps to reproduce <span className="font-normal text-slate-500">· optional</span>
              <textarea maxLength={2500} rows={2} value={steps} onChange={(event) => setSteps(event.target.value)} className={`${inputClass} resize-y`} placeholder="1. Open…  2. Select…  3. See…" />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Error message or code <span className="font-normal text-slate-500">· optional</span>
              <textarea maxLength={1000} rows={2} value={errorCode} onChange={(event) => setErrorCode(event.target.value)} className={`${inputClass} resize-y font-mono text-xs`} placeholder="Paste the exact error, if one appeared" />
            </label>

            <div className="rounded-lg border border-slate-200 p-3">
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => selectScreenshot(event.target.files?.[0])} />
              {screenshot ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700"><ImagePlus className="h-4 w-4 shrink-0 text-slate-500" /><span className="truncate">{screenshot.name}</span></span>
                  <button type="button" onClick={() => { setScreenshot(null); if (fileInput.current) fileInput.current.value = ''; }} className="shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900">Remove</button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-10 items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-900">
                  <Upload className="h-4 w-4" /> Attach screenshot
                </button>
              )}
              <p className="mt-1 text-xs text-slate-500">PNG, JPEG or WebP, up to 5 MB. Only you and support agents can access the uploaded file.</p>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span><strong className="font-semibold">Include diagnostics (optional).</strong> I consent to sending this page, browser/device details, and my IP address if available to Flown’s server. Diagnostics are attached to this internal developer ticket.</span>
            </label>
            <p className="text-xs text-slate-500">Without consent, only the details you enter and any screenshot you attach are sent.</p>

            {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={onClose} disabled={sending} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={sending || !subject.trim() || !details.trim()} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
                {sending ? 'Sending…' : 'Send bug report'}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
};
