import { userFacingError } from '../../lib/userFacingError';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Headset, Send } from 'lucide-react';

type ChatMessage = { id: string; from: 'customer' | 'agent'; body: string; at: string; agent: string | null };

const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-public`;
const storageKey = 'flown-support-chat';

const call = async (body: Record<string, unknown>) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
};

export const PublicChatPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(storageKey));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [form, setForm] = useState({ name: '', email: '', message: '', website: '' });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const data = await call({ action: 'poll', token });
      setMessages(data.messages ?? []);
    } catch (pollError) {
      if (pollError instanceof Error && /not found/i.test(pollError.message)) {
        localStorage.removeItem(storageKey);
        setToken(null);
      }
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void poll();
    const timer = window.setInterval(poll, 4000);
    return () => window.clearInterval(timer);
  }, [token, poll]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await call({ action: 'start', ...form });
      if (data.token) {
        localStorage.setItem(storageKey, data.token);
        setToken(data.token);
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Could not start the chat.');
    } finally {
      setBusy(false);
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !token) return;
    setBusy(true);
    setError('');
    try {
      await call({ action: 'send', token, body });
      setDraft('');
      await poll();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-100 via-brand-50/70 to-brand-50/90 p-4">
      <div className="flex h-[min(640px,92dvh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center gap-3 bg-[#10264f] px-4 py-3 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><Headset className="h-5 w-5" /></span>
          <div>
            <h1 className="text-sm font-semibold">Customer support</h1>
            <p className="text-xs text-blue-200">We usually reply within a few hours</p>
          </div>
        </header>

        {!token ? (
          <form onSubmit={start} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <p className="text-sm text-slate-600">Send us a message and a member of our team will get back to you here and by email.</p>
            <label className="text-xs font-medium text-slate-600">Your name<input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs font-medium text-slate-600">Email<input required type="email" maxLength={320} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputClass} mt-1`} /></label>
            <label className="text-xs font-medium text-slate-600">How can we help?<textarea required rows={5} maxLength={4000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={`${inputClass} mt-1 resize-none`} /></label>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" />
            {error && <p role="alert" className="text-xs text-rose-600">{userFacingError(error)}</p>}
            <button type="submit" disabled={busy} className="mt-auto rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Sending…' : 'Start chat'}</button>
          </form>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${message.from === 'customer' ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'}`}>
                    {message.from === 'agent' && <span className="mb-0.5 block text-xs font-semibold text-brand-700">{message.agent || 'Support'}</span>}
                    {message.body}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={send} className="border-t border-slate-200 p-3">
              {error && <p role="alert" className="pb-2 text-xs text-rose-600">{userFacingError(error)}</p>}
              <div className="flex gap-2">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} placeholder="Type a message…" aria-label="Message" className={inputClass} />
                <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="rounded-lg bg-brand-600 px-3 text-white hover:bg-brand-700 disabled:opacity-50"><Send className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => { localStorage.removeItem(storageKey); setToken(null); setMessages([]); }} className="mt-2 text-xs text-slate-400 hover:text-slate-600">Start a new conversation</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
