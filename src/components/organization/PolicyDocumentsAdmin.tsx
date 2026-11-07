import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, RefreshCw, Upload } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { isPdfHeader, sha256Hex } from '../../lib/pdfFiles';

type PolicyDocument = {
  id: string;
  title: string;
  document_type: string;
  description: string | null;
  storage_path: string | null;
  status: string;
  version: string;
  requires_signature: boolean;
  requires_acknowledgement: boolean;
  required_onboarding: boolean;
  updated_at: string;
};
type DocumentVersion = {
  id: string;
  document_id: string;
  version_number: number;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  sha256: string | null;
  created_at: string;
};
type LegacyFile = { id: string; document_id: string; storage_path: string; file_name: string; preserved_at: string };

const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50';
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-500';

export const PolicyDocumentsAdmin: React.FC = () => {
  const { currentUser } = useWorkspace();
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [legacyFiles, setLegacyFiles] = useState<LegacyFile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('policy');
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(true);
  const [requiredOnboarding, setRequiredOnboarding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: documentRows, error: documentError }, { data: versionRows, error: versionError }, { data: legacyRows, error: legacyError }] = await Promise.all([
      supabase.from('organization_documents').select('id,title,document_type,description,storage_path,status,version,requires_signature,requires_acknowledgement,required_onboarding,updated_at').order('updated_at', { ascending: false }),
      supabase.from('organization_document_versions').select('id,document_id,version_number,storage_path,file_name,file_size,sha256,created_at').order('version_number', { ascending: false }),
      supabase.from('organization_document_legacy_files').select('id,document_id,storage_path,file_name,preserved_at').order('preserved_at', { ascending: false }),
    ]);
    setError(documentError?.message || versionError?.message || legacyError?.message || '');
    setDocuments((documentRows || []) as PolicyDocument[]);
    setVersions((versionRows || []) as DocumentVersion[]);
    setLegacyFiles((legacyRows || []) as LegacyFile[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filePath = (documentId: string, fileName: string) =>
    `policies/${currentUser.id}/${documentId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;

  const uploadVersion = async (document: PolicyDocument | null, file: File) => {
    if (file.size > 50 * 1024 * 1024) { setError('PDFs must be 50 MB or smaller.'); return; }
    if (!isPdfHeader(new Uint8Array(await file.slice(0, 5).arrayBuffer()))) {
      setError('Upload a valid PDF file.');
      return;
    }

    setBusy(true);
    setError('');
    let documentId = document?.id;
    let createdDocument = false;
    if (!documentId) {
      const { data, error: createError } = await supabase.from('organization_documents').insert({
        title: title.trim(),
        document_type: documentType,
        description: description.trim() || null,
        content: null,
        version: '1.0',
        status: 'draft',
        requires_signature: requiresSignature,
        requires_acknowledgement: requiresAcknowledgement,
        required_onboarding: requiredOnboarding,
        created_by: currentUser.id,
      }).select('id').single();
      if (createError || !data) {
        setError(createError?.message || 'Could not create the policy record.');
        setBusy(false);
        return;
      }
      documentId = data.id;
      createdDocument = true;
    }

    const path = filePath(documentId, file.name);
    const { error: uploadError } = await supabase.storage.from('organization-documents').upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadError) {
      setError(uploadError.message);
      setBusy(false);
      await load();
      return;
    }
    const digest = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
    const { data: version, error: versionError } = await supabase.from('organization_document_versions').insert({
      document_id: documentId,
      storage_path: path,
      file_name: file.name,
      mime_type: 'application/pdf',
      file_size: file.size,
      sha256: digest,
      uploaded_by: currentUser.id,
    }).select('id,version_number').single();
    if (versionError || !version) {
      setError(versionError?.message || 'The PDF uploaded, but its version record could not be saved.');
      setBusy(false);
      await load();
      return;
    }
    const { error: publishError } = await supabase.from('organization_documents').update({
      storage_path: path,
      version: String(version.version_number),
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', documentId);
    if (publishError) {
      setError(publishError.message);
      setBusy(false);
      await load();
      return;
    }
    if (createdDocument) {
      setTitle('');
      setDescription('');
      setDocumentType('policy');
      setRequiresSignature(true);
      setRequiresAcknowledgement(true);
      setRequiredOnboarding(false);
    }
    setShowForm(false);
    setBusy(false);
    await load();
  };

  const openPdf = async (path: string) => {
    const { data, error: linkError } = await supabase.storage.from('organization-documents').createSignedUrl(path, 300);
    if (linkError || !data?.signedUrl) { setError(linkError?.message || 'Could not open this PDF.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const makeCurrent = async (document: PolicyDocument, version: DocumentVersion) => {
    setBusy(true);
    const { error: updateError } = await supabase.from('organization_documents').update({
      storage_path: version.storage_path,
      version: String(version.version_number),
      status: 'published',
      published_at: document.status === 'published' ? undefined : new Date().toISOString(),
    }).eq('id', document.id);
    if (updateError) setError(updateError.message);
    else await load();
    setBusy(false);
  };

  const isAdmin = currentUser.systemRole === 'admin';
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-sm font-bold text-slate-900">Policies & resources</h2><p className="mt-1 text-xs text-slate-500">Publish uploaded PDFs; every replacement is retained as an immutable version.</p></div>
      {isAdmin && <button type="button" onClick={() => setShowForm((value) => !value)} className={button}><Plus className="h-4 w-4" />Add policy PDF</button>}
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {showForm && <form className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      const file = (event.currentTarget.elements.namedItem('policy-pdf') as HTMLInputElement).files?.[0];
      if (!title.trim() || !file) { setError('Enter a policy title and choose a PDF.'); return; }
      void uploadVersion(null, file);
    }}>
      <label className="space-y-1 text-xs font-semibold text-slate-600">Title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className={input} /></label>
      <label className="space-y-1 text-xs font-semibold text-slate-600">Type<select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className={input}>{['policy', 'handbook', 'form', 'contract'].map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
      <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">Description<textarea maxLength={1000} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} className={input} /></label>
      <label className="space-y-1 text-xs font-semibold text-slate-600 sm:col-span-2">PDF file<input required name="policy-pdf" type="file" accept="application/pdf,.pdf" className={`${input} file:mr-3 file:border-0 file:bg-transparent`} /></label>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={requiresSignature} onChange={(event) => setRequiresSignature(event.target.checked)} /> Require electronic signature</label>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={requiresAcknowledgement} onChange={(event) => setRequiresAcknowledgement(event.target.checked)} /> Require acknowledgment</label>
      <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2"><input type="checkbox" checked={requiredOnboarding} onChange={(event) => setRequiredOnboarding(event.target.checked)} /> Require new staff to sign during onboarding</label>
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-xs text-slate-500">Cancel</button><button type="submit" disabled={busy || !isAdmin} className={button}><Upload className="h-4 w-4" />{busy ? 'Uploading…' : 'Upload and publish PDF'}</button></div>
    </form>}
    <div className="mt-5 space-y-3">
      {loading ? <p className="text-xs text-slate-500">Loading policy PDFs…</p> : documents.length ? documents.map((document) => {
        const documentVersions = versions.filter((version) => version.document_id === document.id);
        const currentVersion = documentVersions.find((version) => version.storage_path === document.storage_path);
        return <article key={document.id} className="rounded-xl border border-slate-100 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-800">{document.title}</h3><p className="mt-1 text-xs text-slate-500">{label(document.document_type)} · {label(document.status)} · {document.requires_signature ? 'Signature' : 'Acknowledgment'}{document.required_onboarding ? ' · Required on onboarding' : ''}</p><p className="mt-1 text-xs text-slate-400">{document.description || 'No description'} · {documentVersions.length || 0} PDF versions</p></div></div>
            <div className="flex flex-wrap gap-2">
              {document.storage_path && <button type="button" onClick={() => void openPdf(document.storage_path!)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Open current PDF</button>}
              {isAdmin && <label className={`${button} cursor-pointer`}><Upload className="h-3.5 w-3.5" />Upload new version<input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadVersion(document, file); event.currentTarget.value = ''; }} /></label>}
            </div>
          </div>
          {!!documentVersions.length && <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{documentVersions.map((version) => <div key={version.id} className="flex flex-wrap items-center gap-2 text-xs"><button type="button" onClick={() => void openPdf(version.storage_path)} className="min-w-0 flex-1 truncate text-left font-medium text-brand-700 hover:underline">v{version.version_number} · {version.file_name}</button><span className="text-slate-400">{version.sha256 ? `${version.sha256.slice(0, 12)}…` : 'Legacy version'}</span>{currentVersion?.id !== version.id && isAdmin && <button type="button" disabled={busy} onClick={() => void makeCurrent(document, version)} className="rounded border border-slate-200 px-2 py-1 text-slate-500"><RefreshCw className="mr-1 inline h-3 w-3" />Make current</button>}</div>)}</div>}
          {!!legacyFiles.filter((file) => file.document_id === document.id).length && <div className="mt-3 border-t border-slate-100 pt-3"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preserved legacy attachments</p><div className="space-y-1">{legacyFiles.filter((file) => file.document_id === document.id).map((file) => <button key={file.id} type="button" onClick={() => void openPdf(file.storage_path)} className="block max-w-full truncate text-left text-xs text-slate-500 hover:text-brand-700">{file.file_name}</button>)}</div></div>}
        </article>;
      }) : <p className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-500">No policy PDFs are published yet.</p>}
    </div>
  </section>;
};

const label = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
const safeFileName = (value: string) => value.replace(/[^\w.-]+/g, '_').slice(-150) || 'document.pdf';
