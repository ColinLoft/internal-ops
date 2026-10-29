import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Cloud,
  File,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  Presentation,
  Search,
  Sheet,
  Sparkles,
  Star,
  Trash2,
  RotateCcw,
  Upload,
  X,
  Users,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';

type DriveItem = {
  id: string;
  parent_id: string | null;
  owner_id: string;
  name: string;
  item_type: 'folder' | 'document' | 'presentation' | 'spreadsheet' | 'file';
  mime_type: string | null;
  content: Record<string, unknown>;
  storage_path?: string | null;
  is_starred: boolean;
  deleted_at: string | null;
  updated_at: string;
};

const itemIcon = (type: DriveItem['item_type']) => {
  if (type === 'folder') return Folder;
  if (type === 'document') return FileText;
  if (type === 'presentation') return Presentation;
  if (type === 'spreadsheet') return Sheet;
  return File;
};

const itemColor = (type: DriveItem['item_type']) => ({
  folder: 'text-amber-500 bg-amber-50',
  document: 'text-sky-600 bg-sky-50',
  presentation: 'text-orange-600 bg-orange-50',
  spreadsheet: 'text-emerald-600 bg-emerald-50',
  file: 'text-slate-500 bg-slate-100',
}[type]);

export const DrivePage: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [items, setItems] = useState<DriveItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<DriveItem | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [section, setSection] = useState<'drive' | 'shared' | 'starred' | 'trash'>('drive');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadItems = async () => {
    setIsLoading(true);
    const { data, error: loadError } = await supabase
      .from('drive_items')
      .select('id, parent_id, owner_id, name, item_type, mime_type, storage_path, content, is_starred, deleted_at, updated_at')
      .order('updated_at', { ascending: false });
    if (loadError) setError(`Drive could not be loaded: ${loadError.message}`);
    else setItems((data || []) as DriveItem[]);
    setIsLoading(false);
  };

  useEffect(() => {
    void loadItems();
    const channel = supabase
      .channel('drive-items-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drive_items' }, () => {
        void loadItems();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) =>
      section === 'trash'
        ? Boolean(item.deleted_at)
        : !item.deleted_at
      && (section === 'drive' ? item.parent_id === currentFolderId : section === 'shared' ? item.owner_id !== currentUser.id : section === 'starred' ? item.is_starred : true)
      && (!query || item.name.toLowerCase().includes(query))
    );
  }, [currentFolderId, currentUser.id, items, search, section]);

  const createItem = async (itemType: DriveItem['item_type'], name: string) => {
    const { data, error: createError } = await supabase
      .from('drive_items')
      .insert({
        owner_id: currentUser.id,
        parent_id: currentFolderId,
        name,
        item_type: itemType,
        content: itemType === 'document'
          ? { blocks: [{ type: 'paragraph', text: '' }] }
          : itemType === 'presentation'
            ? { slides: [{ title: 'Untitled slide', body: '' }] }
            : itemType === 'spreadsheet'
              ? { rows: [['', '', ''], ['', '', ''], ['', '', '']] }
              : {},
      })
      .select('id, parent_id, owner_id, name, item_type, mime_type, storage_path, content, is_starred, deleted_at, updated_at')
      .single();
    if (createError) {
      setError(`Could not create ${itemType}: ${createError.message}`);
      return;
    }
    if (data) {
      setItems((current) => [data as DriveItem, ...current]);
      setSelectedItem(data as DriveItem);
    }
    setIsCreateOpen(false);
  };

  const updateDocument = async (content: Record<string, unknown>) => {
    if (!selectedItem) return;
    const { error: versionError } = await supabase.from('drive_versions').insert({
      item_id: selectedItem.id,
      created_by: currentUser.id,
      content: selectedItem.content,
    });
    if (versionError) {
      setError(`Could not save version history: ${versionError.message}`);
      return;
    }
    const { error: updateError } = await supabase
      .from('drive_items')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', selectedItem.id);
    if (updateError) {
      setError(`Changes could not be saved: ${updateError.message}`);
      return;
    }
    const updated = { ...selectedItem, content, updated_at: new Date().toISOString() };
    setSelectedItem(updated);
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  const moveToTrash = async (item: DriveItem) => {
    const deletedAt = new Date().toISOString();
    const { error: deleteError } = await supabase.from('drive_items').update({ deleted_at: deletedAt, updated_at: deletedAt }).eq('id', item.id);
    if (deleteError) setError(`Could not move item to trash: ${deleteError.message}`);
    else {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, deleted_at: deletedAt } : entry));
      setSelectedItem(null);
    }
  };

  const restoreItem = async (item: DriveItem) => {
    const { error: restoreError } = await supabase.from('drive_items').update({ deleted_at: null, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (restoreError) setError(`Could not restore item: ${restoreError.message}`);
    else setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, deleted_at: null } : entry));
  };

  const permanentlyDelete = async (item: DriveItem) => {
    if (!window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    const { error: deleteError } = await supabase.from('drive_items').delete().eq('id', item.id);
    if (deleteError) setError(`Could not permanently delete item: ${deleteError.message}`);
    else setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  const uploadFile = async (file: File) => {
    const path = `${currentUser.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('drive-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      return;
    }
    const { data, error: itemError } = await supabase.from('drive_items').insert({
      owner_id: currentUser.id,
      parent_id: currentFolderId,
      name: file.name,
      item_type: 'file',
      mime_type: file.type || 'application/octet-stream',
      storage_path: path,
      content: { size: file.size },
    }).select('id, parent_id, owner_id, name, item_type, mime_type, storage_path, content, deleted_at, updated_at').single();
    if (itemError) {
      await supabase.storage.from('drive-files').remove([path]);
      setError(`Could not save uploaded file: ${itemError.message}`);
      return;
    }
    if (data) setItems((current) => [data as DriveItem, ...current]);
  };

  const shareItem = async (email: string, permission: 'viewer' | 'commenter' | 'editor') => {
    if (!selectedItem || !email.trim()) return;
    const { error: shareError } = await supabase.from('drive_shares').insert({
      item_id: selectedItem.id,
      shared_by: currentUser.id,
      shared_with_email: email.trim().toLowerCase(),
      permission,
    });
    if (shareError) setError(`Could not share item: ${shareError.message}`);
    else setIsShareOpen(false);
  };

  const downloadFile = async (item: DriveItem) => {
    if (!item.storage_path) return;
    const { data, error: signedError } = await supabase.storage.from('drive-files').createSignedUrl(item.storage_path, 60 * 60);
    if (signedError || !data?.signedUrl) {
      setError(`Could not open file: ${signedError?.message || 'No download link was returned.'}`);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const currentFolder = items.find((item) => item.id === currentFolderId);

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden bg-white/40">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200/80 bg-white/65 p-4 lg:block">
        <button type="button" onClick={() => setIsCreateOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700">
          <Plus className="h-4 w-4" /> New
        </button>
        <nav className="mt-5 space-y-1">
          {[
            { label: 'My Drive', icon: Cloud, active: section === 'drive', action: () => { setSection('drive'); setCurrentFolderId(null); setSelectedItem(null); } },
            { label: 'Shared with me', icon: Users, active: section === 'shared', action: () => { setSection('shared'); setCurrentFolderId(null); setSelectedItem(null); } },
            { label: 'Starred', icon: Star, active: section === 'starred', action: () => { setSection('starred'); setCurrentFolderId(null); setSelectedItem(null); } },
            { label: 'Trash', icon: Trash2, active: section === 'trash', action: () => { setSection('trash'); setCurrentFolderId(null); setSelectedItem(null); } },
          ].map((entry) => {
            const Icon = entry.icon;
            return <button key={entry.label} type="button" onClick={entry.action} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold ${entry.active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{entry.label}</button>;
          })}
        </nav>
        <div className="mt-8 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
          <Sparkles className="h-4 w-4 text-sky-600" />
          <p className="mt-2 text-xs font-bold text-slate-800">Drive AI</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">Summarize, draft, and organize your workspace files.</p>
        </div>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-500 hover:border-brand-200 hover:text-brand-700" title="Upload files"><Upload className="h-4 w-4" /></button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { const files = Array.from(event.target.files || []); void Promise.all(files.map(uploadFile)); event.target.value = ''; }} />
        <button type="button" onClick={() => setIsTemplateOpen(true)} className="hidden rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-brand-200 hover:text-brand-700 md:block">Templates</button>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/55 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {currentFolderId && <button type="button" onClick={() => setCurrentFolderId(currentFolder?.parent_id || null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></button>}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Flown Drive</p>
              <h1 className="truncate text-lg font-bold text-slate-900">{section === 'shared' ? 'Shared with me' : section === 'starred' ? 'Starred' : section === 'trash' ? 'Trash' : currentFolder?.name || 'My Drive'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Drive" className="w-52 rounded-xl border border-slate-200 bg-white/80 py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10" />
            </div>
            <button type="button" onClick={() => setView('grid')} className={`rounded-lg p-2 ${view === 'grid' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`} aria-label="Grid view"><Grid2X2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView('list')} className={`rounded-lg p-2 ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-slate-400'}`} aria-label="List view"><List className="h-4 w-4" /></button>
          </div>
        </div>

        {error && <button type="button" onClick={() => setError('')} className="mx-5 mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-left text-xs text-rose-700">{error} <span className="font-bold">Dismiss</span></button>}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? <p className="py-16 text-center text-sm text-slate-500">Loading Drive...</p> : visibleItems.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
              <FolderPlus className="h-8 w-8 text-brand-500" />
              <h2 className="mt-3 text-sm font-bold text-slate-900">Your Drive is ready</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Create a document, slideshow, spreadsheet, or folder to get started.</p>
              <button type="button" disabled={section === 'trash'} onClick={() => setIsCreateOpen(true)} className="mt-5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-default disabled:bg-slate-300">{section === 'trash' ? 'Trash is empty' : 'Create something'}</button>
            </div>
          ) : (
            <div className={view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4' : 'space-y-2'}>
              {visibleItems.map((item) => {
                const Icon = itemIcon(item.item_type);
                return <button key={item.id} type="button" onDoubleClick={() => item.item_type === 'folder' ? setCurrentFolderId(item.id) : setSelectedItem(item)} onClick={() => setSelectedItem(item)} className={`group flex text-left ${view === 'grid' ? 'flex-col rounded-2xl border border-slate-200/80 bg-white p-4 hover:border-brand-200 hover:shadow-md' : 'items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3 hover:border-brand-200'}`}>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${itemColor(item.item_type)}`}><Icon className="h-5 w-5" /></span>
                  <span className={`${view === 'grid' ? 'mt-4' : 'flex-1'} min-w-0`}><span className="block truncate text-xs font-bold text-slate-800">{item.name}</span><span className="mt-1 block text-[10px] capitalize text-slate-400">{item.item_type} · {new Date(item.updated_at).toLocaleDateString()}</span></span>
                  {section === 'trash' ? <span className="ml-auto flex items-center gap-1"><span onClick={(event) => { event.stopPropagation(); void restoreItem(item); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Restore"><RotateCcw className="h-4 w-4" /></span><span onClick={(event) => { event.stopPropagation(); void permanentlyDelete(item); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete permanently"><Trash2 className="h-4 w-4" /></span></span> : <span className="ml-auto flex items-center gap-1"><span onClick={async (event) => { event.stopPropagation(); const next = !item.is_starred; const { error: starError } = await supabase.from('drive_items').update({ is_starred: next }).eq('id', item.id); if (starError) setError(`Could not update star: ${starError.message}`); else setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_starred: next } : entry)); }} className={`rounded-lg p-1.5 ${item.is_starred ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`} title={item.is_starred ? 'Remove star' : 'Star item'}><Star className="h-4 w-4" fill={item.is_starred ? 'currentColor' : 'none'} /></span>{view === 'list' && <MoreHorizontal className="h-4 w-4 text-slate-400" />}</span>}
                </button>;
              })}
            </div>
          )}
        </div>
      </section>

      {selectedItem && selectedItem.item_type !== 'folder' && <DriveEditor item={selectedItem} onClose={() => setSelectedItem(null)} onSave={updateDocument} onShare={() => setIsShareOpen(true)} onTrash={() => void moveToTrash(selectedItem)} onDownload={() => void downloadFile(selectedItem)} />}
      {isCreateOpen && <CreateDriveItem onClose={() => setIsCreateOpen(false)} onCreate={createItem} />}
      {isShareOpen && selectedItem && <ShareDialog item={selectedItem} onClose={() => setIsShareOpen(false)} onShare={shareItem} />}
      {isTemplateOpen && <TemplateDialog onClose={() => setIsTemplateOpen(false)} onCreate={(type, name) => { setIsTemplateOpen(false); void createItem(type, name); }} />}
    </main>
  );
};

const CreateDriveItem: React.FC<{ onClose: () => void; onCreate: (type: DriveItem['item_type'], name: string) => Promise<void> }> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<DriveItem['item_type']>('document');
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Create in Drive</h2><button type="button" onClick={onClose} className="text-xs text-slate-500">Cancel</button></div><div className="mt-4 grid grid-cols-2 gap-2">{(['document', 'presentation', 'spreadsheet', 'folder'] as const).map((option) => <button key={option} type="button" onClick={() => setType(option)} className={`rounded-xl border p-3 text-left text-xs font-semibold capitalize ${type === option ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>{option}</button>)}</div><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={`${type} name`} className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" /><button type="button" disabled={!name.trim()} onClick={() => onCreate(type, name.trim())} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-40">Create</button></div></div>;
};

const DriveEditor: React.FC<{ item: DriveItem; onClose: () => void; onSave: (content: Record<string, unknown>) => Promise<void>; onShare: () => void; onTrash: () => void; onDownload: () => void }> = ({ item, onClose, onSave, onShare, onTrash, onDownload }) => {
  const [text, setText] = useState(String(item.content.text || ''));
  const [slides, setSlides] = useState(Array.isArray(item.content.slides) ? item.content.slides as Array<{ title: string; body: string }> : [{ title: 'Untitled slide', body: '' }]);
  const [rows, setRows] = useState(Array.isArray(item.content.rows) ? item.content.rows as string[][] : [['', '', ''], ['', '', ''], ['', '', '']]);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const content = item.item_type === 'presentation' ? { ...item.content, slides } : item.item_type === 'spreadsheet' ? { ...item.content, rows } : { ...item.content, text };
    await onSave(content);
    setSaving(false);
  };
  const updateCell = (rowIndex: number, cellIndex: number, value: string) => {
    setRows((current) => current.map((row, index) => index === rowIndex ? row.map((cell, cellPosition) => cellPosition === cellIndex ? value : cell) : row));
  };
  return <div className="fixed inset-0 z-[60] flex flex-col bg-white"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><div className="flex items-center gap-3"><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></button><div><p className="text-xs font-bold text-slate-900">{item.name}</p><p className="text-[10px] text-slate-400">Private · shared access can be added</p></div></div><div className="flex items-center gap-2">{item.item_type === 'file' && <button type="button" onClick={onDownload} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><Download className="mr-1 inline h-3.5 w-3.5" /> Download</button>}<button type="button" onClick={onShare} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><Users className="mr-1 inline h-3.5 w-3.5" /> Share</button><button type="button" onClick={onTrash} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Move to trash"><Trash2 className="h-4 w-4" /></button>{item.item_type !== 'file' && <button type="button" onClick={save} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white">{saving ? 'Saving...' : 'Save'}</button>}</div></header><div className="flex flex-1 overflow-y-auto bg-slate-50 p-5 sm:p-10"><div className="mx-auto w-full max-w-5xl rounded-xl bg-white p-6 shadow-sm sm:p-12">{item.item_type === 'file' ? <div className="flex min-h-[45vh] flex-col items-center justify-center text-center"><File className="h-12 w-12 text-slate-300" /><h2 className="mt-4 text-lg font-bold text-slate-900">{item.name}</h2><p className="mt-1 text-xs text-slate-500">{item.mime_type || 'Uploaded file'} · {Number(item.content.size || 0) > 0 ? `${Math.round(Number(item.content.size) / 1024)} KB` : 'Size unavailable'}</p><button type="button" onClick={onDownload} className="mt-5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white">Open or download</button></div> : <><div className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-brand-600"><Sparkles className="h-3.5 w-3.5" /> AI-ready workspace <span className="ml-auto normal-case tracking-normal text-slate-400">Draft saved manually</span></div>{item.item_type === 'presentation' ? <div className="space-y-4">{slides.map((slide, index) => <div key={index} className="rounded-xl border border-slate-200 p-5"><input value={slide.title} onChange={(event) => setSlides((current) => current.map((entry, position) => position === index ? { ...entry, title: event.target.value } : entry))} className="w-full border-0 text-xl font-bold outline-none" /><textarea value={slide.body} onChange={(event) => setSlides((current) => current.map((entry, position) => position === index ? { ...entry, body: event.target.value } : entry))} placeholder="Add slide content..." className="mt-4 min-h-40 w-full resize-none border-0 text-sm leading-7 outline-none" /></div>)}<button type="button" onClick={() => setSlides((current) => [...current, { title: `Slide ${current.length + 1}`, body: '' }])} className="rounded-lg border border-dashed border-brand-300 px-3 py-2 text-xs font-semibold text-brand-700">+ Add slide</button></div> : item.item_type === 'spreadsheet' ? <div className="overflow-auto"><table className="w-full border-collapse text-sm"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="min-w-36 border border-slate-200 p-0"><input value={cell} onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)} className="w-full px-3 py-2 outline-none focus:bg-brand-50" /></td>)}</tr>)}</tbody></table><button type="button" onClick={() => setRows((current) => [...current, Array(current[0]?.length || 3).fill('')])} className="mt-3 rounded-lg border border-dashed border-brand-300 px-3 py-2 text-xs font-semibold text-brand-700">+ Add row</button></div> : <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Start writing your document..." className="min-h-[55vh] w-full resize-none border-0 text-base leading-8 text-slate-800 outline-none placeholder:text-slate-300" />}</>}</div></div></div>;
};

const ShareDialog: React.FC<{ item: DriveItem; onClose: () => void; onShare: (email: string, permission: 'viewer' | 'commenter' | 'editor') => Promise<void> }> = ({ item, onClose, onShare }) => {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'commenter' | 'editor'>('viewer');
  const [sharing, setSharing] = useState(false);
  const submit = async () => { setSharing(true); await onShare(email, permission); setSharing(false); };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-900">Share {item.name}</p><p className="mt-1 text-[11px] text-slate-500">Invite a workspace member or external collaborator.</p></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400"><X className="h-4 w-4" /></button></div><input autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" type="email" className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" /><div className="mt-3 flex gap-2">{(['viewer', 'commenter', 'editor'] as const).map((value) => <button key={value} type="button" onClick={() => setPermission(value)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold capitalize ${permission === value ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>{value}</button>)}</div><button type="button" disabled={!email.trim() || sharing} onClick={() => void submit()} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-40">{sharing ? 'Sharing...' : 'Share'}</button></div></div>;
};

const TemplateDialog: React.FC<{ onClose: () => void; onCreate: (type: DriveItem['item_type'], name: string) => void }> = ({ onClose, onCreate }) => {
  const templates = [
    { type: 'document' as const, name: 'Project brief', description: 'Goals, owners, milestones, and notes', content: 'Project brief\n\nGoals:\nOwners:\nMilestones:\nNotes:' },
    { type: 'presentation' as const, name: 'Team update', description: 'A clean internal update deck', content: '' },
    { type: 'spreadsheet' as const, name: 'Budget tracker', description: 'Track planned and actual expenses', content: '' },
  ];
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-900">Drive templates</p><p className="mt-1 text-[11px] text-slate-500">Start with a structure your team can reuse.</p></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-2">{templates.map((template) => <button key={template.name} type="button" onClick={() => onCreate(template.type, template.name)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-brand-300 hover:bg-brand-50/50"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${itemColor(template.type)}`}>{React.createElement(itemIcon(template.type), { className: 'h-4 w-4' })}</span><span><span className="block text-xs font-bold text-slate-800">{template.name}</span><span className="block text-[11px] text-slate-500">{template.description}</span></span></button>)}</div></div></div>;
};
