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
import { ProfessionalEditor } from './ProfessionalEditor';

type DriveItem = {
  id: string;
  parent_id: string | null;
  owner_id: string;
  name: string;
  item_type: 'folder' | 'document' | 'presentation' | 'spreadsheet' | 'form' | 'file';
  mime_type: string | null;
  content: Record<string, unknown>;
  storage_path?: string | null;
  is_starred: boolean;
  deleted_at: string | null;
  updated_at: string;
};

type DriveWorkspaceKind = 'documents' | 'presentations' | 'spreadsheets' | 'forms';

const workspaceKindFromPath = (pathname: string): DriveWorkspaceKind | null => {
  const segment = pathname.replace(/^\/+/, '').split('/')[0];
  if (segment === 'docs') return 'documents';
  if (segment === 'slides') return 'presentations';
  if (segment === 'sheets') return 'spreadsheets';
  if (segment === 'forms') return 'forms';
  return null;
};

const itemIcon = (type: DriveItem['item_type']) => {
  if (type === 'folder') return Folder;
  if (type === 'document') return FileText;
  if (type === 'presentation') return Presentation;
  if (type === 'spreadsheet') return Sheet;
  if (type === 'form') return FileText;
  return File;
};

const itemColor = (type: DriveItem['item_type']) => ({
  folder: 'text-amber-500 bg-amber-50',
  document: 'text-sky-600 bg-sky-50',
  presentation: 'text-orange-600 bg-orange-50',
  spreadsheet: 'text-emerald-600 bg-emerald-50',
  form: 'text-fuchsia-600 bg-fuchsia-50',
  file: 'text-slate-500 bg-slate-100',
}[type]);

const normalizeEditorContent = (item: DriveItem): Record<string, unknown> => {
  const content = item.content && typeof item.content === 'object' && !Array.isArray(item.content)
    ? item.content
    : {};
  if (item.item_type === 'document') {
    return { ...content, title: typeof content.title === 'string' ? content.title : item.name, text: typeof content.text === 'string' ? content.text : '' };
  }
  if (item.item_type === 'presentation') {
    const slides = Array.isArray(content.slides)
      ? content.slides.filter((slide): slide is Record<string, unknown> => Boolean(slide) && typeof slide === 'object')
        .map((slide) => ({ title: typeof slide.title === 'string' ? slide.title : 'Untitled slide', body: typeof slide.body === 'string' ? slide.body : '' }))
      : [];
    return { ...content, slides: slides.length ? slides : [{ title: 'Untitled slide', body: '' }] };
  }
  if (item.item_type === 'spreadsheet') {
    const rows = Array.isArray(content.rows)
      ? content.rows.map((row) => Array.isArray(row) ? row.map((cell) => typeof cell === 'string' ? cell : '') : ['', '', ''])
      : [];
    return { ...content, rows: rows.length ? rows : [['', '', ''], ['', '', '']] };
  }
  if (item.item_type === 'form') {
    const questions = Array.isArray(content.questions)
      ? content.questions.filter((question): question is Record<string, unknown> => Boolean(question) && typeof question === 'object')
        .map((question, index) => ({
          id: typeof question.id === 'string' ? question.id : crypto.randomUUID(),
          type: typeof question.type === 'string' ? question.type : 'short_text',
          label: typeof question.label === 'string' ? question.label : `Question ${index + 1}`,
          required: question.required === true,
          options: Array.isArray(question.options) ? question.options.filter((option): option is string => typeof option === 'string') : [],
        }))
      : [];
    return { ...content, title: typeof content.title === 'string' ? content.title : item.name, description: typeof content.description === 'string' ? content.description : '', questions };
  }
  return content;
};

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
  const [driveView, setDriveView] = useState<'all' | DriveWorkspaceKind>(() => workspaceKindFromPath(window.location.pathname) || 'all');
  const [editorItem, setEditorItem] = useState<DriveItem | null>(null);
  const [editorItemId, setEditorItemId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/(docs|slides|sheets|forms)\/([^/]+)/);
    return match?.[2] || null;
  });
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
    const handleDriveView = (event: Event) => {
      const view = (event as CustomEvent<string>).detail;
      if (view === 'documents' || view === 'presentations' || view === 'spreadsheets' || view === 'forms' || view === 'all') {
        setDriveView(view);
        setSection('drive');
        setCurrentFolderId(null);
        setSelectedItem(null);
      }

    };
    const handleRoute = () => {
      const match = window.location.pathname.match(/^\/(docs|slides|sheets|forms)\/([^/]+)/);
      setEditorItemId(match?.[2] || null);
      const workspace = workspaceKindFromPath(window.location.pathname);
      if (workspace) setDriveView(workspace);
      else if (window.location.pathname === '/drive') setDriveView('all');
      if (!match) setEditorItem(null);
    };
    window.addEventListener('flown-drive-view', handleDriveView);
    window.addEventListener('popstate', handleRoute);
    const channel = supabase
      .channel('drive-items-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drive_items' }, () => {
        void loadItems();
      })
      .subscribe();
    return () => {
      window.removeEventListener('flown-drive-view', handleDriveView);
      window.removeEventListener('popstate', handleRoute);
      void supabase.removeChannel(channel);
    };
  }, []);

  const openEditor = (item: DriveItem) => {
    const segment = item.item_type === 'document' ? 'docs' : item.item_type === 'presentation' ? 'slides' : item.item_type === 'spreadsheet' ? 'sheets' : 'forms';
    window.history.pushState({}, '', `/${segment}/${item.id}`);
    setEditorItem({ ...item, content: normalizeEditorContent(item) });
    setEditorItemId(item.id);
  };

  const closeEditor = () => {
    window.history.pushState({}, '', '/drive');
    setEditorItem(null);
    setEditorItemId(null);
  };

  const routedEditorItem = items.find((item) => item.id === editorItemId);
  const activeEditorItem = editorItem?.id === editorItemId
    ? editorItem
    : routedEditorItem
      ? { ...routedEditorItem, content: normalizeEditorContent(routedEditorItem) }
      : null;
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) =>
      section === 'trash'
        ? Boolean(item.deleted_at)
        : !item.deleted_at
      && (section === 'drive' ? item.parent_id === currentFolderId : section === 'shared' ? item.owner_id !== currentUser.id : section === 'starred' ? item.is_starred : true)
      && (driveView === 'all' || (driveView === 'documents' && item.item_type === 'document') || (driveView === 'presentations' && item.item_type === 'presentation') || (driveView === 'spreadsheets' && item.item_type === 'spreadsheet') || (driveView === 'forms' && item.item_type === 'form'))
      && (!query || item.name.toLowerCase().includes(query))
    );
  }, [currentFolderId, currentUser.id, items, search, section, driveView]);

  if (activeEditorItem && ['document', 'presentation', 'spreadsheet', 'form'].includes(activeEditorItem.item_type)) {
    return <ProfessionalEditor item={activeEditorItem} onClose={closeEditor} onSave={async (content) => {
      const { error: saveError } = await supabase.from('drive_items').update({ content, updated_at: new Date().toISOString() }).eq('id', activeEditorItem.id);
      if (saveError) throw new Error(`Changes could not be saved: ${saveError.message}`);
      const updatedAt = new Date().toISOString();
      const updated = { ...activeEditorItem, content, updated_at: updatedAt };
      setEditorItem(updated);
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    }} />;
  }

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
              : itemType === 'form'
                ? { title: name, description: '', questions: [{ id: crypto.randomUUID(), type: 'short_text', label: 'Question 1', required: false, options: [] }], settings: { acceptingResponses: true } }
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
      if (itemType === 'document' || itemType === 'presentation' || itemType === 'spreadsheet' || itemType === 'form') {
        openEditor(data as DriveItem);
      } else {
        setSelectedItem(data as DriveItem);
      }
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

  if (driveView !== 'all' && section === 'drive') {
    return (
      <DriveCreationWorkspace
        kind={driveView}
        items={items}
        onCreate={(type, name) => void createItem(type, name)}
        onOpen={(item) => item.item_type === 'file' ? void downloadFile(item) : openEditor(item)}
        onBack={() => {
          window.history.pushState({}, '', '/drive');
          setDriveView('all');
          window.dispatchEvent(new CustomEvent('flown-drive-view', { detail: 'all' }));
        }}
      />
    );
  }

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
              <h1 className="truncate text-lg font-bold text-slate-900">{section === 'shared' ? 'Shared with me' : section === 'starred' ? 'Starred' : section === 'trash' ? 'Trash' : driveView === 'documents' ? 'Docs' : driveView === 'presentations' ? 'Slides' : driveView === 'spreadsheets' ? 'Sheets' : driveView === 'forms' ? 'Forms' : currentFolder?.name || 'My Drive'}</h1>
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
                return <button key={item.id} type="button" onDoubleClick={() => item.item_type === 'folder' ? setCurrentFolderId(item.id) : item.item_type === 'file' ? setSelectedItem(item) : openEditor(item)} onClick={() => item.item_type === 'folder' ? setSelectedItem(item) : item.item_type === 'file' ? setSelectedItem(item) : openEditor(item)} className={`group flex text-left ${view === 'grid' ? 'flex-col rounded-2xl border border-slate-200/80 bg-white p-4 hover:border-brand-200 hover:shadow-md' : 'items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3 hover:border-brand-200'}`}>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${itemColor(item.item_type)}`}><Icon className="h-5 w-5" /></span>
                  <span className={`${view === 'grid' ? 'mt-4' : 'flex-1'} min-w-0`}><span className="block truncate text-xs font-bold text-slate-800">{item.name}</span><span className="mt-1 block text-[10px] capitalize text-slate-400">{item.item_type} · {new Date(item.updated_at).toLocaleDateString()}</span></span>
                  {section === 'trash' ? <span className="ml-auto flex items-center gap-1"><span onClick={(event) => { event.stopPropagation(); void restoreItem(item); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Restore"><RotateCcw className="h-4 w-4" /></span><span onClick={(event) => { event.stopPropagation(); void permanentlyDelete(item); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete permanently"><Trash2 className="h-4 w-4" /></span></span> : <span className="ml-auto flex items-center gap-1"><span onClick={async (event) => { event.stopPropagation(); const next = !item.is_starred; const { error: starError } = await supabase.from('drive_items').update({ is_starred: next }).eq('id', item.id); if (starError) setError(`Could not update star: ${starError.message}`); else setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_starred: next } : entry)); }} className={`rounded-lg p-1.5 ${item.is_starred ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`} title={item.is_starred ? 'Remove star' : 'Star item'}><Star className="h-4 w-4" fill={item.is_starred ? 'currentColor' : 'none'} /></span>{view === 'list' && <MoreHorizontal className="h-4 w-4 text-slate-400" />}</span>}
                </button>;
              })}
            </div>
          )}
        </div>
      </section>

      {selectedItem && selectedItem.item_type === 'file' && <DriveEditor item={selectedItem} onClose={() => setSelectedItem(null)} onSave={updateDocument} onShare={() => setIsShareOpen(true)} onTrash={() => void moveToTrash(selectedItem)} onDownload={() => void downloadFile(selectedItem)} />}
      {isCreateOpen && <CreateDriveItem allowedTypes={['folder']} onClose={() => setIsCreateOpen(false)} onCreate={createItem} />}
      {isShareOpen && selectedItem && <ShareDialog item={selectedItem} onClose={() => setIsShareOpen(false)} onShare={shareItem} />}
      {isTemplateOpen && <TemplateDialog onClose={() => setIsTemplateOpen(false)} onCreate={(type, name) => { setIsTemplateOpen(false); void createItem(type, name); }} />}
    </main>
  );
};

const DriveCreationWorkspace: React.FC<{
  kind: 'documents' | 'presentations' | 'spreadsheets' | 'forms';
  items: DriveItem[];
  onCreate: (type: DriveItem['item_type'], name: string) => void;
  onOpen: (item: DriveItem) => void;
  onBack: () => void;
}> = ({ kind, items, onCreate, onOpen, onBack }) => {
  const config = {
    documents: {
      label: 'Docs',
      description: 'Create polished documents, plans, and internal knowledge.',
      type: 'document' as const,
      templates: ['Blank document', 'Project brief', 'Meeting notes', 'Policy document'],
      icon: FileText,
      color: 'from-sky-600 to-blue-700',
    },
    presentations: {
      label: 'Slides',
      description: 'Build clear presentations for teams, partners, and events.',
      type: 'presentation' as const,
      templates: ['Blank presentation', 'Team update', 'Board presentation', 'Event deck'],
      icon: Presentation,
      color: 'from-orange-500 to-rose-600',
    },
    spreadsheets: {
      label: 'Sheets',
      description: 'Organize budgets, plans, tracking, and operational data.',
      type: 'spreadsheet' as const,
      templates: ['Blank spreadsheet', 'Budget tracker', 'Project tracker', 'Grant pipeline'],
      icon: Sheet,
      color: 'from-emerald-500 to-teal-700',
    },
    forms: {
      label: 'Forms',
      description: 'Collect information with branded, intelligent forms.',
      type: 'form' as const,
      templates: ['Blank form', 'Staff intake', 'Event registration', 'Feedback form'],
      icon: FileText,
      color: 'from-fuchsia-500 to-purple-700',
    },
  }[kind];
  const Icon = config.icon;
  const recent = items
    .filter((item) => !item.deleted_at && item.item_type === config.type)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 8);

  return <main className="flex min-w-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-sky-50/60">
    <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10">
      <button type="button" onClick={onBack} className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-brand-700"><ArrowLeft className="h-4 w-4" /> Back to Drive</button>
      <div className="flex items-start gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${config.color} text-white shadow-lg`}><Icon className="h-7 w-7" /></div>
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">Flown workspace</p><h1 className="mt-1 text-3xl font-bold text-slate-900">{config.label}</h1><p className="mt-2 max-w-xl text-sm text-slate-500">{config.description}</p></div>
      </div>
      <section className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">{`Recent ${config.label.toLowerCase()}`}</h2><span className="text-[11px] text-slate-400">{recent.length} item{recent.length === 1 ? '' : 's'}</span></div>{recent.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center"><Icon className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">Nothing here yet</p><p className="mt-1 text-xs text-slate-500">{`Create your first ${config.label.toLowerCase().replace(/s$/, '')} to get started.`}</p></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{recent.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${itemColor(item.item_type)}`}><Icon className="h-4 w-4" /></span><span className="mt-4 block truncate text-xs font-bold text-slate-800">{item.name}</span><span className="mt-1 block text-[10px] text-slate-400">Updated {new Date(item.updated_at).toLocaleDateString()}</span></button>)}</div>}</section>
    </div>
  </main>;
};

const CreateDriveItem: React.FC<{ allowedTypes: Array<DriveItem['item_type']>; onClose: () => void; onCreate: (type: DriveItem['item_type'], name: string) => Promise<void> }> = ({ allowedTypes, onClose, onCreate }) => {
  const [name, setName] = useState('');
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Add to Drive</h2><button type="button" onClick={onClose} className="text-xs text-slate-500">Cancel</button></div><p className="mt-3 text-xs text-slate-500">Drive is for folders and uploaded files. Create Docs, Slides, Sheets, and Forms from their dedicated workspaces.</p><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Folder name" className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400" /><button type="button" disabled={!name.trim()} onClick={() => onCreate(allowedTypes[0], name.trim())} className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 text-xs font-bold text-white disabled:opacity-40">Create folder</button></div></div>;
};

const DriveEditorWorkspace: React.FC<{
  item: DriveItem;
  onClose: () => void;
  onSave: (content: Record<string, unknown>) => Promise<void>;
}> = ({ item, onClose, onSave }) => {
  const [content, setContent] = useState(item.content);
  const [activePanel, setActivePanel] = useState<'edit' | 'preview' | 'responses'>('edit');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const questions = Array.isArray(content.questions) ? content.questions as Array<{ id: string; type: string; label: string; required: boolean; options: string[] }> : [];
  const slides = Array.isArray(content.slides) ? content.slides as Array<{ title: string; body: string }> : [{ title: 'Title slide', body: '' }];
  const rows = Array.isArray(content.rows) ? content.rows as string[][] : [['', '', ''], ['', '', '']];

  const save = async () => {
    setSaving(true);
    try {
      await onSave(content);
      setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = () => setContent((current) => ({
    ...current,
    questions: [...questions, { id: crypto.randomUUID(), type: 'short_text', label: `Question ${questions.length + 1}`, required: false, options: [] }],
  }));
  const updateQuestion = (id: string, patch: Partial<typeof questions[number]>) => setContent((current) => ({
    ...current,
    questions: questions.map((question) => question.id === id ? { ...question, ...patch } : question),
  }));

  return <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
      <div className="flex items-center gap-3"><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></button><div><p className="text-sm font-bold text-slate-900">{item.name}</p><p className="text-[10px] capitalize text-slate-400">{item.item_type} · saved in Flown Drive</p></div></div>
      <div className="flex items-center gap-2"><span className="hidden text-xs text-emerald-600 sm:block">{message}</span><button type="button" onClick={() => void save()} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">{saving ? 'Saving...' : 'Save'}</button></div>
    </header>
    {item.item_type === 'form' && <nav className="flex items-center gap-1 border-b border-slate-200 bg-white px-5 py-2"><button type="button" onClick={() => setActivePanel('edit')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activePanel === 'edit' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}>Build form</button><button type="button" onClick={() => setActivePanel('preview')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activePanel === 'preview' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}>Preview</button><button type="button" onClick={() => setActivePanel('responses')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activePanel === 'responses' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`}>Responses</button></nav>}
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <main className="flex-1 overflow-y-auto p-5 sm:p-10">
        {item.item_type === 'document' && <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 shadow-sm sm:p-14"><div className="mb-5 flex flex-wrap gap-1 border-b border-slate-100 pb-3"><button type="button" className="rounded px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100">B</button><button type="button" className="rounded px-2 py-1 text-xs italic text-slate-600 hover:bg-slate-100">I</button><button type="button" className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">H1</button><button type="button" className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">H2</button><button type="button" className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Table</button><span className="ml-auto text-[10px] text-slate-400">Document editor</span></div><input value={String(content.title || item.name)} onChange={(event) => setContent({ ...content, title: event.target.value })} className="mb-5 w-full border-0 text-3xl font-bold text-slate-900 outline-none" /><textarea value={String(content.text || '')} onChange={(event) => setContent({ ...content, text: event.target.value })} placeholder="Start writing your document..." className="min-h-[65vh] w-full resize-none border-0 text-base leading-8 text-slate-800 outline-none placeholder:text-slate-300" /></div>}
        {item.item_type === 'presentation' && <div className="mx-auto max-w-5xl"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Theme: Flown Light</span><button type="button" onClick={() => setContent({ ...content, slides: [...slides, { title: `Slide ${slides.length + 1}`, body: '' }] })} className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-bold text-brand-700">+ New slide</button></div><div className="space-y-5">{slides.map((slide, index) => <section key={index} className="aspect-video rounded-2xl bg-gradient-to-br from-white to-sky-50 p-8 shadow-md ring-1 ring-slate-200"><span className="text-[10px] font-bold uppercase tracking-widest text-brand-600">Slide {index + 1}</span><input value={slide.title} onChange={(event) => setContent({ ...content, slides: slides.map((entry, position) => position === index ? { ...entry, title: event.target.value } : entry) })} className="mt-8 block w-full border-0 bg-transparent text-3xl font-bold outline-none" /><textarea value={slide.body} onChange={(event) => setContent({ ...content, slides: slides.map((entry, position) => position === index ? { ...entry, body: event.target.value } : entry) })} placeholder="Add text, images, or speaker notes..." className="mt-5 h-32 w-full resize-none border-0 bg-transparent text-lg leading-7 outline-none" /></section>)}</div></div>}
        {item.item_type === 'spreadsheet' && <div className="mx-auto max-w-5xl rounded-xl bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Sheet1</span><button type="button" onClick={() => setContent({ ...content, rows: [...rows, Array(rows[0]?.length || 3).fill('')] })} className="rounded-lg border border-slate-200 px-2 py-1">+ Row</button><button type="button" onClick={() => setContent({ ...content, rows: rows.map((row) => [...row, '']) })} className="rounded-lg border border-slate-200 px-2 py-1">+ Column</button></div><table className="w-full border-collapse text-sm"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="min-w-36 border border-slate-200 p-0"><input value={cell} onChange={(event) => setContent({ ...content, rows: rows.map((currentRow, index) => index === rowIndex ? currentRow.map((value, position) => position === cellIndex ? event.target.value : value) : currentRow) })} className="w-full px-3 py-2 outline-none focus:bg-brand-50" /></td>)}</tr>)}</tbody></table></div>}
        {item.item_type === 'form' && activePanel === 'edit' && <div className="mx-auto max-w-3xl space-y-4"><div className="rounded-2xl bg-gradient-to-br from-brand-600 to-sky-500 p-7 text-white"><input value={String(content.title || item.name)} onChange={(event) => setContent({ ...content, title: event.target.value })} className="w-full border-0 bg-transparent text-3xl font-bold outline-none placeholder:text-white/70" /><textarea value={String(content.description || '')} onChange={(event) => setContent({ ...content, description: event.target.value })} placeholder="Tell people what this form is for..." className="mt-3 w-full resize-none border-0 bg-transparent text-sm outline-none placeholder:text-white/70" /></div>{questions.map((question, index) => <div key={question.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><div className="flex gap-3"><span className="mt-2 text-xs font-bold text-slate-400">{index + 1}</span><div className="min-w-0 flex-1"><input value={question.label} onChange={(event) => updateQuestion(question.id, { label: event.target.value })} className="w-full border-0 text-sm font-bold outline-none" /><div className="mt-3 flex flex-wrap gap-2"><select value={question.type} onChange={(event) => updateQuestion(question.id, { type: event.target.value })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"><option value="short_text">Short answer</option><option value="long_text">Paragraph</option><option value="multiple_choice">Multiple choice</option><option value="checkboxes">Checkboxes</option><option value="date">Date</option><option value="rating">Rating</option></select><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.id, { required: event.target.checked })} /> Required</label></div></div></div></div>)}<button type="button" onClick={addQuestion} className="w-full rounded-xl border border-dashed border-brand-300 bg-brand-50/40 py-3 text-xs font-bold text-brand-700">+ Add question</button></div>}
        {item.item_type === 'form' && activePanel === 'preview' && <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm"><h2 className="text-2xl font-bold text-slate-900">{String(content.title || item.name)}</h2><p className="mt-2 text-sm text-slate-500">{String(content.description || '')}</p><div className="mt-8 space-y-5">{questions.map((question) => <label key={question.id} className="block text-sm font-semibold text-slate-800">{question.label}{question.required && <span className="text-rose-500"> *</span>}<input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-400" placeholder="Your answer" /></label>)}</div><button type="button" className="mt-7 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white">Submit response</button></div>}
        {item.item_type === 'form' && activePanel === 'responses' && <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-brand-50 p-4"><p className="text-2xl font-bold text-brand-700">0</p><p className="text-xs text-slate-500">Responses</p></div><div className="rounded-xl bg-sky-50 p-4"><p className="text-2xl font-bold text-sky-700">—</p><p className="text-xs text-slate-500">Average time</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-2xl font-bold text-emerald-700">—</p><p className="text-xs text-slate-500">Latest response</p></div></div><div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">Responses, completion time, dates, and answer analytics will appear here.</div></div>}
      </main>
      <aside className="hidden w-56 border-l border-slate-200 bg-white p-4 lg:block"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p><div className="mt-3 space-y-1 text-xs text-slate-600"><p>Saved in My Drive</p><p>Private by default</p><p>Version history enabled</p>{item.item_type === 'form' && <p>Responses connected</p>}</div></aside>
    </div>
  </div>;
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
