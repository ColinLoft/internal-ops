import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Check, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';

type AssistantMessage = { role: 'user' | 'assistant'; content: string };
type AssistantAction = {
  type: 'post_channel' | 'send_message';
  targetId: string;
  targetName: string;
  content: string;
};

const getAssistantErrorMessage = async (error: Error) => {
  if ('context' in error && error.context instanceof Response) {
    const body: unknown = await error.context.clone().json().catch(() => null);
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
    return `The assistant request failed with status ${error.context.status}. Check the workspace-ai Edge Function logs.`;
  }
  if (error.name === 'FunctionsFetchError') {
    return 'The assistant could not reach its Edge Function. Confirm workspace-ai is deployed and try again.';
  }
  return error.message || 'The assistant could not respond.';
};

export const WorkspaceAssistant: React.FC = () => {
  const {
    activeTab,
    activeChannelId,
    activeConversationId,
    focusedEmailId,
    channels,
    conversations,
    postChannelMessage,
    sendMessage,
  } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [proposal, setProposal] = useState<AssistantAction | null>(null);

  useEffect(() => {
    const handleAssistantRequest = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt || '';
      setOpen(true);
      if (prompt) setInput(prompt);
    };
    window.addEventListener('workspace-assistant-request', handleAssistantRequest);
    return () => window.removeEventListener('workspace-assistant-request', handleAssistantRequest);
  }, []);

  const target = useMemo(() => activeTab === 'channels'
    ? channels.find((channel) => channel.id === activeChannelId)?.name
    : conversations.find((conversation) => conversation.id === activeConversationId)?.name, [
    activeChannelId, activeConversationId, activeTab, channels, conversations,
  ]);

  const askAssistant = async (prompt: string) => {
    if (!prompt || busy) return;
    setInput('');
    setError('');
    setProposal(null);
    const nextMessages = [...messages, { role: 'user' as const, content: prompt }];
    setMessages(nextMessages);
    setBusy(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('workspace-ai', {
        body: {
          prompt,
          history: messages,
          activeTab,
          activeChannelId,
          activeConversationId,
          focusedEmailId,
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setMessages((items) => [...items, { role: 'assistant', content: String(data?.message || 'I could not answer that.') }]);
      setProposal(data?.action || null);
    } catch (assistantError) {
      setError(assistantError instanceof Error
        ? await getAssistantErrorMessage(assistantError)
        : 'The assistant could not respond.');
    } finally {
      setBusy(false);
    }
  };

  const submitPrompt = (event: React.FormEvent) => {
    event.preventDefault();
    void askAssistant(input.trim());
  };

  const confirmAction = async () => {
    if (!proposal) return;
    setBusy(true);
    setError('');
    try {
      if (proposal.type === 'post_channel') {
        if (activeTab !== 'channels' || activeChannelId !== proposal.targetId) throw new Error('The channel changed. Ask the assistant again before posting.');
        await postChannelMessage(proposal.targetId, proposal.content);
      } else {
        if (activeTab !== 'messages' || activeConversationId !== proposal.targetId) throw new Error('The conversation changed. Ask the assistant again before sending.');
        await sendMessage(proposal.content);
      }
      setMessages((items) => [...items, { role: 'assistant', content: `Done — I ${proposal.type === 'post_channel' ? 'posted in' : 'sent a message to'} ${proposal.targetName}.` }]);
      setProposal(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open workspace AI assistant"
        title="Workspace AI assistant"
        className="fixed bottom-5 right-5 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl ring-4 ring-white/80 transition hover:bg-brand-700"
      >
        <Sparkles className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed bottom-5 right-5 z-[80] flex h-[min(680px,calc(100vh-2rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-600 to-sky-600 px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Bot className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">Workspace assistant</h2>
              <p className="truncate text-[11px] text-white/75">{target ? `Looking at ${target}` : 'Ask about your workspace'}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-lg p-1.5 hover:bg-white/15"><X className="h-4 w-4" /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.length === 0 && (
              <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-xs leading-5 text-brand-900">
                I can explain what you are viewing, summarize workspace conversations, and prepare messages. I will always ask before posting or sending.
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-xs leading-5 ${message.role === 'user' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {proposal && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Confirmation required</p>
                <p className="mt-1 text-xs text-amber-900">{proposal.type === 'post_channel' ? 'Post this in' : 'Send this to'} <strong>{proposal.targetName}</strong>?</p>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-2 text-xs text-slate-700">{proposal.content}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void confirmAction()} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Confirm</button>
                  <button type="button" disabled={busy} onClick={() => setProposal(null)} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">Cancel</button>
                </div>
              </div>
            )}
            {busy && <div className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Working…</div>}
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          </div>
          <form onSubmit={submitPrompt} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void askAssistant(input.trim()); } }} rows={2} placeholder="Ask about this workspace…" className="min-h-10 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500" />
            <button type="submit" disabled={!input.trim() || busy} aria-label="Ask assistant" className="rounded-xl bg-brand-600 p-2.5 text-white hover:bg-brand-700 disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </>
  );
};
