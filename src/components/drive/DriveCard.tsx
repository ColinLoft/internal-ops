import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Download, ExternalLink, FolderInput, MoreHorizontal, Pencil, RotateCcw, Share2, Star, Trash2 } from 'lucide-react';

export type CardItem = {
  id: string;
  name: string;
  item_type: string;
  is_starred?: boolean;
  updated_at: string;
};

export type MoveTarget = { id: string | null; name: string };

type Props = {
  item: CardItem;
  view: 'grid' | 'list';
  inTrash: boolean;
  isOwner: boolean;
  icon: React.ElementType;
  iconClass: string;
  moveTargets: MoveTarget[];
  onOpen: () => void;
  onEnter: () => void;
  onToggleStar: () => void;
  onRename: (name: string) => void;
  onMove: (parentId: string | null) => void;
  onShare: () => void;
  onDownload: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

const itemClass = 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 md:min-h-0';

export const DriveCard: React.FC<Props> = (props) => {
  const { item, view, inTrash, isOwner, icon: Icon, iconClass, moveTargets } = props;
  const [menu, setMenu] = useState<'closed' | 'main' | 'move'>('closed');
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu === 'closed') return;
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setMenu('closed'); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu('closed'); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [menu]);

  const commitRename = () => {
    const name = draft.trim();
    setRenaming(false);
    if (name && name !== item.name) props.onRename(name);
    else setDraft(item.name);
  };
  const run = (action: () => void) => () => { setMenu('closed'); action(); };

  return (
    <div ref={ref} className={`group relative flex ${view === 'grid' ? 'flex-col rounded-2xl border border-slate-200/80 bg-white p-4 hover:border-brand-200 hover:shadow-md' : 'items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3 hover:border-brand-200'}`}>
      <button
        type="button"
        onClick={props.onOpen}
        onDoubleClick={props.onEnter}
        className={`flex min-w-0 text-left ${view === 'grid' ? 'flex-col' : 'flex-1 items-center gap-3'}`}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" /></span>
        {!renaming && (
          <span className={`${view === 'grid' ? 'mt-4' : 'flex-1'} min-w-0`}>
            <span className="block truncate text-xs font-bold text-slate-800">{item.name}</span>
            <span className="mt-1 block text-xs capitalize text-slate-400">{item.item_type} · {new Date(item.updated_at).toLocaleDateString()}</span>
          </span>
        )}
      </button>
      {renaming && (
        <input
          autoFocus
          value={draft}
          aria-label="Rename item"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename();
            if (event.key === 'Escape') { setRenaming(false); setDraft(item.name); }
          }}
          className="mt-3 min-h-11 w-full rounded-lg border border-brand-300 px-2 text-base outline-none focus:ring-4 focus:ring-brand-500/10 md:min-h-0 md:py-1 md:text-xs"
        />
      )}
      <div className={`flex items-center gap-1 ${view === 'grid' ? 'absolute right-2 top-2' : 'ml-auto'}`}>
        {!inTrash && (
          <button type="button" onClick={props.onToggleStar} aria-label={item.is_starred ? 'Remove star' : 'Star item'} title={item.is_starred ? 'Remove star' : 'Star item'} className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg md:min-h-0 md:min-w-0 md:p-1.5 ${item.is_starred ? 'text-brand-500' : 'text-slate-300 hover:text-brand-500'}`}>
            <Star className="h-4 w-4" fill={item.is_starred ? 'currentColor' : 'none'} />
          </button>
        )}
        <button type="button" onClick={() => setMenu(menu === 'closed' ? 'main' : 'closed')} aria-haspopup="menu" aria-expanded={menu !== 'closed'} aria-label={`Actions for ${item.name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:min-h-0 md:min-w-0 md:p-1.5">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {menu !== 'closed' && (
        <div role="menu" className="absolute right-2 top-12 z-40 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {menu === 'main' && inTrash && (
            <>
              <button type="button" role="menuitem" className={itemClass} onClick={run(props.onRestore)}><RotateCcw className="h-4 w-4" />Restore</button>
              <button type="button" role="menuitem" className={`${itemClass} text-rose-600`} onClick={run(props.onDelete)}><Trash2 className="h-4 w-4" />Delete permanently</button>
            </>
          )}
          {menu === 'main' && !inTrash && (
            <>
              <button type="button" role="menuitem" className={itemClass} onClick={run(props.onEnter)}><ExternalLink className="h-4 w-4" />Open</button>
              {isOwner && <button type="button" role="menuitem" className={itemClass} onClick={() => { setMenu('closed'); setDraft(item.name); setRenaming(true); }}><Pencil className="h-4 w-4" />Rename</button>}
              {isOwner && <button type="button" role="menuitem" className={itemClass} onClick={() => setMenu('move')}><FolderInput className="h-4 w-4" />Move to folder</button>}
              <button type="button" role="menuitem" className={itemClass} onClick={run(props.onToggleStar)}><Star className="h-4 w-4" />{item.is_starred ? 'Remove star' : 'Add star'}</button>
              {item.item_type !== 'folder' && isOwner && <button type="button" role="menuitem" className={itemClass} onClick={run(props.onShare)}><Share2 className="h-4 w-4" />Share</button>}
              {item.item_type === 'file' && <button type="button" role="menuitem" className={itemClass} onClick={run(props.onDownload)}><Download className="h-4 w-4" />Download</button>}
              {isOwner && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button type="button" role="menuitem" className={`${itemClass} text-rose-600`} onClick={run(props.onTrash)}><Trash2 className="h-4 w-4" />Move to trash</button>
                </>
              )}
            </>
          )}
          {menu === 'move' && (
            <>
              <button type="button" className={`${itemClass} text-slate-500`} onClick={() => setMenu('main')}><ChevronLeft className="h-4 w-4" />Move to…</button>
              <div className="max-h-56 overflow-y-auto">
                {moveTargets.map((target) => (
                  <button key={target.id ?? 'root'} type="button" role="menuitem" className={itemClass} onClick={run(() => props.onMove(target.id))}>
                    <FolderInput className="h-4 w-4" /><span className="truncate">{target.name}</span>
                  </button>
                ))}
                {moveTargets.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No other folders.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
