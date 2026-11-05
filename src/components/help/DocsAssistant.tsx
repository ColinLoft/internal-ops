import React, { useState } from 'react';
import { ArrowRight, Bot, LifeBuoy, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { guideSections } from './guides';

type Answer = { question: string; text: string; sources: string[]; answered: boolean; offline?: boolean };

const allGuides = guideSections.flatMap((section) => section.guides.map((guide) => ({ ...guide, section: section.title })));
const guideText = (guide: (typeof allGuides)[number]) => `${guide.summary}\n${guide.steps.join('\n')}\n${(guide.tips || []).join('\n')}\n${(guide.faqs || []).map((faq) => `${faq.q} ${faq.a}`).join('\n')}`;
const stop = new Set(['the', 'a', 'an', 'to', 'how', 'do', 'i', 'can', 'my', 'in', 'on', 'of', 'and', 'is', 'it', 'for', 'where', 'what', 'did', 'does', 'get', 'with', 'you']);

const rank = (question: string) => {
  const words = question.toLowerCase().split(/\W+/).filter((word) => word.length > 2 && !stop.has(word));
  return allGuides
    .map((guide) => {
      const title = `${guide.title} ${guide.section}`.toLowerCase();
      const body = guideText(guide).toLowerCase();
      const score = words.reduce((sum, word) => sum + (title.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0), 0);
      return { guide, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
};

const suggestions = ['How do I collapse the sidebar?', 'How do I track a CAD review for a machined part?', 'How do I share a calendar event?', 'How do I start a direct message?'];

export const DocsAssistant: React.FC<{ onOpenGuide: (id: string) => void; onOpenTicket: (subject: string) => void }> = ({ onOpenGuide, onOpenTicket }) => {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion(q);
    const ranked = rank(q);
    const top = ranked.slice(0, 5);
    if (!top.length) {
      setAnswer({ question: q, text: '', sources: [], answered: false });
      setBusy(false);
      return;
    }
    const { data, error } = await supabase.functions.invoke('docs-ai', { body: { question: q, excerpts: top.map(({ guide }) => ({ id: guide.id, title: guide.title, text: guideText(guide) })) } });
    if (error || !data || data.error) {
      const best = top[0].guide;
      setAnswer({ question: q, text: `${best.summary} ${best.steps[0]}`, sources: top.slice(0, 3).map((item) => item.guide.id), answered: true, offline: true });
    } else {
      setAnswer({ question: q, text: data.answer || '', sources: (data.sources as string[] | undefined)?.filter((id) => allGuides.some((guide) => guide.id === id)) || [], answered: !!data.answered });
    }
    setBusy(false);
  };

  return (
    <section aria-label="Ask the docs" className="rounded-2xl border border-brand-500/30 bg-brand-50/60 p-4 md:p-5">
      <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Bot className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-slate-900">Ask the docs</h2><p className="text-xs text-slate-500">Describe what you want to do. I will answer from the guides and link the details.</p></div></div>
      <form onSubmit={(event) => { event.preventDefault(); void ask(question); }} className="mt-3 flex gap-2">
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. How do I send a part to machining?" aria-label="Ask a question about Flown" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 md:text-sm" />
        <button type="submit" disabled={busy || !question.trim()} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 md:min-h-0"><Send className="h-4 w-4" />{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      {!answer && <div className="mt-3 flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} type="button" onClick={() => void ask(item)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-brand-400">{item}</button>)}</div>}
      {answer && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
          {answer.answered ? (
            <>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{answer.text}</p>
              {answer.offline && <p className="text-xs text-slate-400">The AI service is unavailable, so this is the closest guide match.</p>}
              {answer.sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">Read more:</span>{answer.sources.map((id) => { const guide = allGuides.find((item) => item.id === id); return guide ? <button key={id} type="button" onClick={() => onOpenGuide(id)} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">{guide.title}<ArrowRight className="h-3 w-3" /></button> : null; })}</div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">I could not find an answer in the docs for “{answer.question}”. Want to open a ticket so the team can help?</p><button type="button" onClick={() => onOpenTicket(answer.question)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 md:min-h-0 md:py-2"><LifeBuoy className="h-4 w-4" />Open a ticket</button></div>
          )}
        </div>
      )}
    </section>
  );
};
