import React from 'react';

export function messageLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function inline(text: string, depth = 0): React.ReactNode {
  if (depth >= 4) return text;
  const tokens = /(`[^`\n]+`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\+\+[^+\n]+\+\+|(?<!\w)_[^_\n]+_(?!\w)|(?<!\w)\*[^*\n]+\*(?!\w)|https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|@[\w-]+)/g;
  const result: React.ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    const index = match.index!;
    result.push(text.slice(offset, index));
    const token = match[0];
    let node: React.ReactNode = token;
    if (token.startsWith('`')) node = <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">{token.slice(1, -1)}</code>;
    else if (token.startsWith('[')) {
      const href = messageLink(match[3]);
      if (href) node = <a href={href} target="_blank" rel="noreferrer" className="text-brand-400 underline underline-offset-2">{match[2]}</a>;
    } else if (token.startsWith('**')) node = <strong>{inline(token.slice(2, -2), depth + 1)}</strong>;
    else if (token.startsWith('~~')) node = <s>{inline(token.slice(2, -2), depth + 1)}</s>;
    else if (token.startsWith('++')) node = <u>{inline(token.slice(2, -2), depth + 1)}</u>;
    else if (token.startsWith('_') || token.startsWith('*')) node = <em>{inline(token.slice(1, -1), depth + 1)}</em>;
    else if (token.startsWith('@')) node = <span className="rounded bg-brand-500/10 px-0.5 font-medium text-brand-400">{token}</span>;
    else {
      const trailing = token.match(/[.,!?:;]+$/)?.[0] ?? '';
      const label = trailing ? token.slice(0, -trailing.length) : token;
      const href = messageLink(label.includes('://') ? label : `mailto:${label}`);
      if (href) node = <><a href={href} target="_blank" rel="noreferrer" className="break-all text-brand-400 underline underline-offset-2">{label}</a>{trailing}</>;
    }
    result.push(<React.Fragment key={index}>{node}</React.Fragment>);
    offset = index + token.length;
  }
  result.push(text.slice(offset));
  return result;
}

export function MessageText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('```')) {
      const code: string[] = [];
      while (++index < lines.length && !lines[index].startsWith('```')) code.push(lines[index]);
      blocks.push(<pre key={index} className="my-2 max-w-full overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs"><code>{code.join('\n')}</code></pre>);
    } else if (/^(- |\d+\. )/.test(line)) {
      const numbered = /^\d+\. /.test(line);
      const items: React.ReactNode[] = [];
      do {
        items.push(<li key={index}>{inline(lines[index].replace(/^(- |\d+\. )/, ''))}</li>);
        index++;
      } while (index < lines.length && (numbered ? /^\d+\. / : /^- /).test(lines[index]));
      index--;
      blocks.push(numbered ? <ol key={index} className="list-decimal pl-5">{items}</ol> : <ul key={index} className="list-disc pl-5">{items}</ul>);
    } else if (line.startsWith('> ')) {
      blocks.push(<blockquote key={index} className="border-l-2 border-slate-600 pl-3 text-slate-500">{inline(line.slice(2))}</blockquote>);
    } else blocks.push(<div key={index} className="min-h-[1.25em] whitespace-pre-wrap">{inline(line)}</div>);
  }
  return <div className="min-w-0 break-words text-sm leading-[1.5] text-slate-800 [overflow-wrap:anywhere]">{blocks}</div>;
}
