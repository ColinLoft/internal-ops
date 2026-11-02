import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, PenLine } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export type OrganizationDocument = {
  id: string;
  title: string;
  document_type: string;
  description: string | null;
  content: string | null;
  storage_path: string | null;
  version: string;
  status: string;
  requires_signature: boolean;
  requires_acknowledgement: boolean;
  required_onboarding: boolean;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
};

export const PendingDocumentPrompt: React.FC<{ userId: string }> = ({ userId }) => {
  const [document, setDocument] = useState<OrganizationDocument | null>(null);
  useEffect(() => {
    void (async () => {
      const { data: assignment } = await supabase.from('organization_document_assignments')
        .select('document_id').eq('user_id', userId).eq('status', 'pending').limit(1).maybeSingle();
      if (!assignment) return;
      const { data } = await supabase.from('organization_documents').select('*').eq('id', assignment.document_id).eq('status', 'published').maybeSingle();
      if (data) setDocument(data as OrganizationDocument);
    })();
  }, [userId]);
  if (!document) return null;
  return <DocumentSigningDialog document={document} userId={userId} onComplete={() => setDocument(null)} />;
};

export const DocumentSigningDialog: React.FC<{
  document: OrganizationDocument;
  userId: string;
  onComplete: () => void;
  onClose?: () => void;
}> = ({ document, userId, onComplete, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [name, setName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2;
    context.lineCap = 'round';
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext('2d');
    const position = point(event);
    if (!context || !position) return;
    drawing.current = true;
    context.beginPath();
    context.moveTo(position.x, position.y);
    setHasSignature(true);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext('2d');
    const position = point(event);
    if (!context || !position) return;
    context.lineTo(position.x, position.y);
    context.stroke();
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };
  const submit = async () => {
    if (!name.trim()) return setError('Enter your full name before submitting.');
    if (document.requires_signature && !hasSignature) return setError('Draw your signature before submitting.');
    if (document.requires_acknowledgement && !acknowledged) return setError('Confirm that you have read and understood this document.');
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.from('organization_document_responses').upsert({
      document_id: document.id,
      user_id: userId,
      response_type: document.requires_signature ? 'signed' : 'acknowledged',
      signed_name: name.trim(),
      signature_data: hasSignature ? canvasRef.current?.toDataURL('image/png') : null,
      signed_at: document.requires_signature ? new Date().toISOString() : null,
      acknowledged_at: document.requires_acknowledgement ? new Date().toISOString() : null,
    }, { onConflict: 'document_id,user_id' });
    setSaving(false);
    if (saveError) return setError(saveError.message);
    await supabase.from('organization_document_assignments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('document_id', document.id).eq('user_id', userId);
    onComplete();
  };
  const openAttachment = async () => {
    if (!document.storage_path) return;
    const { data, error: signedError } = await supabase.storage.from('organization-documents').createSignedUrl(document.storage_path, 60 * 60);
    if (signedError || !data?.signedUrl) return setError(signedError?.message || 'Could not open the attached document.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-2 md:p-4">
    <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto md:max-h-[90vh] rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="mt-1 text-lg font-bold text-slate-900">{document.title}</h2></div>{onClose && <button type="button" onClick={onClose} className="text-xs text-slate-400">Close</button>}</div>
      {document.description && <p className="mt-3 text-xs text-slate-600">{document.description}</p>}
      {document.storage_path && <button type="button" onClick={() => void openAttachment()} className="mt-3 text-xs font-semibold text-brand-700 underline">Open attached file</button>}
      {document.content && <div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700">{document.content}</div>}
      <label className="mt-5 block text-xs font-semibold text-slate-600">Full legal name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base md:text-xs" /></label>
      {document.requires_signature && <div className="mt-4"><div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600"><span className="inline-flex items-center gap-1"><PenLine className="h-3.5 w-3.5" /> Draw signature</span><button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-slate-400"><Eraser className="h-3 w-3" /> Clear</button></div><canvas ref={canvasRef} width={760} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} className="h-32 w-full touch-none rounded-lg border border-dashed border-slate-300 bg-white" /></div>}
      {document.requires_acknowledgement && <label className="mt-4 flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5" /><span>I have read, understood, and agree to follow this document.</span></label>}
      {error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      <button type="button" disabled={saving} onClick={() => void submit()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 min-h-11 md:min-h-0"><Check className="h-3.5 w-3.5" />{saving ? 'Saving...' : 'Submit and record date'}</button>
    </div>
  </div>;
};
