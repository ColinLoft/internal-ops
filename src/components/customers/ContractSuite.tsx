import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, CalendarClock, Check, ChevronRight, Clock3, FilePlus2, FileText, Plus, RefreshCw, Search, Send, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';
import { useConfirm } from '../common/useConfirm';
import { isPdfHeader, sha256Hex } from '../../lib/pdfFiles';
import { ContractFieldEditor } from './ContractFieldEditor';
import { canCountersign, validateContractFields, type ContractField, type ContractSigningStatus } from './contractSigning';

type ContractStatus = 'draft' | 'pending_signature' | 'active' | 'renewal_due' | 'ended' | 'expired';
type ContractType = 'service' | 'partnership' | 'grant' | 'nda' | 'vendor' | 'other';
type FileKind = 'document' | 'original_pdf' | 'signed_copy' | 'amendment' | 'other';
type Contract = {
  id: string;
  organization_id: string | null;
  contact_id: string | null;
  name: string;
  contract_type: ContractType;
  description: string;
  status: ContractStatus;
  value: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  auto_renew: boolean;
  counterparty_name: string;
  counterparty_email: string;
  counter_signer_id: string | null;
  owner_id: string | null;
  created_by: string;
  signature_requested_at: string | null;
  signed_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};
type Org = { id: string; name: string };
type Contact = { id: string; organization_id: string | null; name: string; email: string | null };
type ContractFile = { id: string; contract_id: string; file_name: string; storage_path: string; file_size: number | null; mime_type: string | null; file_kind: FileKind; version_number: number; sha256: string | null; source_file_id: string | null; created_at: string };
type ContractEvent = { id: string; actor_id: string | null; event_type: string; details: string; created_at: string };
type StaffSigningStatus = {
  requestId: string;
  flowVersion: number;
  status: ContractSigningStatus;
  counterSignerId: string | null;
  sourceFileId?: string;
  fields?: ContractField[];
  recipientSignedName?: string | null;
  recipientSignedAt?: string | null;
  confirmationDeliveryStatus?: 'not_sent' | 'sent' | 'failed';
  confirmationError?: string | null;
  emailError?: string | null;
  signedPdfUrl?: string | null;
};
type FormValues = Pick<Contract, 'organization_id' | 'contact_id' | 'name' | 'contract_type' | 'description' | 'value' | 'currency' | 'start_date' | 'end_date' | 'renewal_date' | 'auto_renew' | 'counterparty_name' | 'counterparty_email' | 'counter_signer_id' | 'owner_id'>;

const statuses: ContractStatus[] = ['draft', 'pending_signature', 'active', 'renewal_due', 'ended', 'expired'];
const statusClass: Record<ContractStatus, string> = {
  draft: 'bg-slate-800 text-slate-300',
  pending_signature: 'bg-amber-950 text-amber-300',
  active: 'bg-emerald-950 text-emerald-300',
  renewal_due: 'bg-orange-950 text-orange-300',
  ended: 'bg-slate-800 text-slate-400',
  expired: 'bg-rose-950 text-rose-300',
};
const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-brand-500 disabled:opacity-50';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50';
const label = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
const fmt = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const bytes = (value: number | null) => !value ? '' : value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isPdfFile = (file: ContractFile) => file.mime_type === 'application/pdf';

const blankForm = (): FormValues => ({
  organization_id: null, contact_id: null, name: '', contract_type: 'other', description: '', value: null,
  currency: 'USD', start_date: null, end_date: null, renewal_date: null, auto_renew: false,
  counterparty_name: '', counterparty_email: '', counter_signer_id: null, owner_id: null,
});

export const ContractSuite: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { canEdit } = useAppAccess('customers');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [files, setFiles] = useState<ContractFile[]>([]);
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [placement, setPlacement] = useState<{ contract: Contract; file: ContractFile; url: string; fields: ContractField[] } | null>(null);
  const [counterSigning, setCounterSigning] = useState(false);
  const [counterAcknowledged, setCounterAcknowledged] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<StaffSigningStatus | null>(null);
  const [signingStatusLoaded, setSigningStatusLoaded] = useState(false);
  const [signingStatusError, setSigningStatusError] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signatureImages, setSignatureImages] = useState<Record<string, string>>({});
  const sendAttempt = useRef<{ requestId: string; contractId: string; fileId: string; fields: ContractField[] } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('contract'));
  const selectedIdRef = useRef(selectedId);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ContractStatus | 'all'>('all');
  const [editing, setEditing] = useState<Contract | null | false>(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [contractResult, orgResult, contactResult] = await Promise.all([
      supabase.from('customer_contracts').select('*').order('updated_at', { ascending: false }),
      supabase.from('crm_organizations').select('id,name').order('name'),
      supabase.from('crm_contacts').select('id,organization_id,name,email').order('name'),
    ]);
    const failure = contractResult.error || orgResult.error || contactResult.error;
    if (failure) setError(failure.message);
    else setError('');
    const rows = (contractResult.data || []) as Contract[];
    setContracts(rows);
    setOrgs((orgResult.data || []) as Org[]);
    setContacts((contactResult.data || []) as Contact[]);
    if (selectedId && !rows.some((row) => row.id === selectedId)) setSelectedId(null);
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { void load(); }, [load]);
  const selected = contracts.find((contract) => contract.id === selectedId) || null;

  const loadDetails = useCallback(async (contractId: string) => {
    const [fileResult, eventResult] = await Promise.all([
      supabase.from('customer_contract_files').select('*').eq('contract_id', contractId).order('created_at', { ascending: false }),
      supabase.from('customer_contract_events').select('*').eq('contract_id', contractId).order('created_at', { ascending: false }).limit(50),
    ]);
    const failure = fileResult.error || eventResult.error;
    if (failure) setError(failure.message);
    else setError('');
    setFiles((fileResult.data || []) as ContractFile[]);
    setEvents((eventResult.data || []) as ContractEvent[]);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetails(selectedId);
    else { setFiles([]); setEvents([]); }
  }, [loadDetails, selectedId]);
  useEffect(() => { selectedIdRef.current = selectedId; setSignatureStatus(null); setSigningStatusLoaded(false); setSigningStatusError(''); }, [selectedId]);

  const loadSigningStatus = useCallback(async (contractId: string) => {
    const { data, error: statusError } = await supabase.functions.invoke('sign-contract-public', {
      body: { action: 'staff-details', contractId },
    });
    if (selectedIdRef.current !== contractId) return;
    if (statusError) {
      setSignatureStatus(null);
      setSigningStatusLoaded(false);
      setSigningStatusError(userFacingError(statusError, 'Signing status could not be loaded. Check the contract function deployment and retry.'));
      return;
    }
    setSigningStatusError('');
    setSigningStatusLoaded(true);
    setSignatureStatus((data?.request || null) as StaffSigningStatus | null);
  }, []);

  const handleSignaturesChange = useCallback((images: Record<string, string>) => setSignatureImages(images), []);

  useEffect(() => {
    if (!selectedId) { setSignatureStatus(null); return; }
    void loadSigningStatus(selectedId);
    const timer = window.setInterval(() => void loadSigningStatus(selectedId), 20_000);
    return () => window.clearInterval(timer);
  }, [loadSigningStatus, selectedId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return contracts.filter((contract) => (filter === 'all' || contract.status === filter) &&
      (!term || `${contract.name} ${contract.counterparty_name} ${orgs.find((org) => org.id === contract.organization_id)?.name || ''}`.toLowerCase().includes(term)));
  }, [contracts, filter, orgs, query]);
  const renewalsSoon = contracts.filter((contract) => contract.status === 'active' && contract.end_date && daysUntil(contract.end_date) >= 0 && daysUntil(contract.end_date) <= 45).length;
  const pending = contracts.filter((contract) => contract.status === 'pending_signature').length;
  const active = contracts.filter((contract) => ['active', 'renewal_due'].includes(contract.status)).length;

  const appendEvent = async (contractId: string, eventType: string, details: string) => {
    const { error: eventError } = await supabase.from('customer_contract_events').insert({ contract_id: contractId, actor_id: currentUser.id, event_type: eventType, details });
    if (eventError) setError(eventError.message);
  };

  const save = async (values: FormValues, contractId?: string): Promise<string> => {
    if (!values.name.trim()) return 'Contract name is required.';
    setBusy(true);
    setError('');
    const payload = {
      ...values, name: values.name.trim(), description: values.description.trim(),
      counterparty_name: values.counterparty_name.trim(), counterparty_email: values.counterparty_email.trim(),
      updated_at: new Date().toISOString(),
    };
    const result = contractId
      ? await supabase.from('customer_contracts').update(payload).eq('id', contractId).select('id').single()
      : await supabase.from('customer_contracts').insert({ ...payload, created_by: currentUser.id, owner_id: values.owner_id || currentUser.id }).select('id').single();
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return result.error.message;
    }
    sendAttempt.current = null;
    setEditing(false);
    setSelectedId(result.data.id);
    await load();
    await appendEvent(result.data.id, contractId ? 'terms_updated' : 'created', contractId ? 'Contract terms updated.' : 'Contract record created.');
    setBusy(false);
    return '';
  };

  const transition = async (contract: Contract, status: ContractStatus, details: string, patch: Record<string, unknown> = {}) => {
    setBusy(true);
    setError('');
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('customer_contracts')
      .update({ ...patch, status, updated_at: now }).eq('id', contract.id);
    if (updateError) setError(updateError.message);
    else {
      await load();
      await loadDetails(contract.id);
      await appendEvent(contract.id, status === 'pending_signature' ? 'signature_requested' : `status_${status}`, details);
    }
    setBusy(false);
  };

  const openPlacement = async (contract: Contract) => {
    const original = files.filter((file) => (file.file_kind === 'original_pdf' || file.file_kind === 'document') && isPdfFile(file))
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0];
    if (!original) { setError('Upload the original agreement PDF before sending for signature.'); return; }
    if (!contract.counterparty_name.trim() || !isValidEmail(contract.counterparty_email)) {
      setError('Add a recipient name and valid email address before sending.');
      setEditing(contract);
      return;
    }
    if (!contract.counter_signer_id) {
      setError('Select the Flown staff member who will countersign before sending.');
      setEditing(contract);
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: urlError } = await supabase.storage.from('contracts-files').createSignedUrl(original.storage_path, 3600);
    if (urlError || !data?.signedUrl) setError(urlError?.message || 'The original agreement could not be opened.');
    else {
      setSignatureImages({});
      setSignerName(currentUser.name || '');
      const previousAttempt = sendAttempt.current;
      const reuseAttempt = previousAttempt?.contractId === contract.id && previousAttempt.fileId === original.id;
      const savedDraft = signatureStatus?.flowVersion === 2 && signatureStatus.status === 'draft'
        && signatureStatus.sourceFileId === original.id && signatureStatus.fields?.length;
      if (!reuseAttempt && savedDraft) {
        sendAttempt.current = {
          requestId: signatureStatus!.requestId,
          contractId: contract.id,
          fileId: original.id,
          fields: signatureStatus!.fields!,
        };
      }
      setPlacement({
        contract, file: original, url: data.signedUrl,
        fields: reuseAttempt ? previousAttempt.fields : savedDraft ? signatureStatus!.fields! : [],
      });
    }
    setBusy(false);
  };

  const sendSigningRequest = async () => {
    if (!placement || counterSigning) return;
    const validation = validateContractFields(placement.fields, Number.MAX_SAFE_INTEGER);
    if (validation) { setError(validation); return; }
    setBusy(true);
    setError('');
    if (!sendAttempt.current) {
      sendAttempt.current = {
        requestId: crypto.randomUUID(),
        contractId: placement.contract.id,
        fileId: placement.file.id,
        fields: placement.fields,
      };
    }
    sendAttempt.current.fields = placement.fields;
    if (sendAttempt.current.contractId !== placement.contract.id || sendAttempt.current.fileId !== placement.file.id) sendAttempt.current = null;
    if (!sendAttempt.current) {
      setBusy(false);
      setError('The agreement changed. Close this dialog and reopen the current PDF before sending.');
      return;
    }
    const { data, error: sendError } = await supabase.functions.invoke('create-contract-signature-link', {
      body: {
        action: 'send',
        requestId: sendAttempt.current.requestId,
        contractId: placement.contract.id,
        sourceFileId: placement.file.id,
        fields: placement.fields,
      },
    });
    if (sendError || data?.sent !== true) {
      const context = (sendError as { context?: unknown } | null)?.context;
      const responseBody = context instanceof Response ? await context.json().catch(() => null) as { error?: string } | null : null;
      setError(responseBody?.error || data?.error || sendError?.message || 'The invitation email could not be delivered. No sent status was recorded.');
    } else {
      sendAttempt.current = null;
      setPlacement(null);
      await load();
      await loadDetails(placement.contract.id);
      await loadSigningStatus(placement.contract.id);
    }
    setBusy(false);
  };

  const openCounterSigning = async (contract: Contract) => {
    if (!signatureStatus?.signedPdfUrl || !signatureStatus.fields?.length) {
      setError('The recipient-signed PDF is not available. Refresh the contract and try again.');
      return;
    }
    const original = files.find((file) => file.id === signatureStatus.sourceFileId)
      || files.filter((file) => (file.file_kind === 'original_pdf' || file.file_kind === 'document') && isPdfFile(file))
        .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
    if (!original) { setError('The original PDF record is unavailable.'); return; }
    setSignerName(currentUser.name || '');
    setSignatureImages({});
    setCounterAcknowledged(false);
    setCounterSigning(true);
    setPlacement({ contract, file: original, url: signatureStatus.signedPdfUrl, fields: signatureStatus.fields });
  };

  const completeCounterSigning = async () => {
    if (!placement || !signatureStatus || !counterAcknowledged || !signerName.trim()) {
      setError('Enter your name, sign the placed fields, and confirm the countersignature.');
      return;
    }
    const signatureFields = signatureStatus.fields?.filter((field) => field.signer === 'countersigner' && field.kind === 'signature') || [];
    if (!signatureFields.length || signatureFields.some((field) => !signatureImages[field.id])) {
      setError('Sign every Flown signature field on the PDF before completing.');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: signingError } = await supabase.functions.invoke('sign-contract-public', {
      body: {
        action: 'countersign',
        requestId: signatureStatus.requestId,
        signedName: signerName.trim(),
        signatures: signatureImages,
        acknowledged: counterAcknowledged,
      },
    });
    if (signingError || data?.status !== 'completed') {
      const context = (signingError as { context?: unknown } | null)?.context;
      const responseBody = context instanceof Response ? await context.json().catch(() => null) as { error?: string } | null : null;
      setError(responseBody?.error || data?.error || signingError?.message || 'The countersignature could not be completed.');
    } else {
      setPlacement(null);
      setCounterSigning(false);
      await load();
      await loadDetails(placement.contract.id);
      await loadSigningStatus(placement.contract.id);
      if (data.emailSent !== true) setError(data.emailError || 'The signed agreement is complete, but the confirmation email is pending. Retry delivery below.');
    }
    setBusy(false);
  };

  const retryConfirmation = async () => {
    if (!signatureStatus) return;
    setBusy(true);
    setError('');
    const { data, error: retryError } = await supabase.functions.invoke('sign-contract-public', {
      body: { action: 'retry-confirmation', requestId: signatureStatus.requestId },
    });
    if (retryError || data?.sent !== true) {
      const context = (retryError as { context?: unknown } | null)?.context;
      const responseBody = context instanceof Response ? await context.json().catch(() => null) as { error?: string } | null : null;
      setError(responseBody?.error || data?.error || retryError?.message || 'The confirmation email could not be delivered.');
    } else if (selectedId) await loadSigningStatus(selectedId);
    setBusy(false);
  };

  const uploadFile = async (contract: Contract, file: File, kind: FileKind) => {
    if (file.size > 50 * 1024 * 1024) { setError('Files must be 50 MB or smaller.'); return; }
    if (!isPdfHeader(new Uint8Array(await file.slice(0, 5).arrayBuffer()))) { setError('Contracts, signed copies, and amendments must be PDF files.'); return; }
    if (kind === 'signed_copy' && !files.some((item) => item.contract_id === contract.id && (item.file_kind === 'original_pdf' || item.file_kind === 'document') && isPdfFile(item))) {
      setError('Upload the original agreement PDF before adding a signed copy.');
      return;
    }
    const sourceFile = kind === 'signed_copy'
      ? files.filter((item) => (item.file_kind === 'original_pdf' || item.file_kind === 'document') && isPdfFile(item))
        .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0]
      : null;
    const sha256 = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
    setBusy(true);
    setError('');
    const path = `${currentUser.id}/${contract.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('contracts-files').upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (uploadError) { setError(uploadError.message); setBusy(false); return; }
    const { error: rowError } = await supabase.from('customer_contract_files').insert({
      contract_id: contract.id, uploaded_by: currentUser.id, file_name: file.name,
      storage_path: path, file_size: file.size, mime_type: 'application/pdf', file_kind: kind, sha256,
      source_file_id: sourceFile?.id || null,
    });
    if (rowError) {
      const { error: cleanupError } = await supabase.storage.from('contracts-files').remove([path]);
      setError(cleanupError ? `${rowError.message} (Also failed to remove the uploaded file: ${cleanupError.message})` : rowError.message);
      setBusy(false);
      return;
    }
    await loadDetails(contract.id);
    await appendEvent(contract.id, 'file_uploaded', `${label(kind)} uploaded: ${file.name}`);
    if (kind === 'original_pdf' || kind === 'document') sendAttempt.current = null;
    setBusy(false);
  };

  const openFile = async (file: ContractFile) => {
    const { data, error: signedError } = await supabase.storage.from('contracts-files').createSignedUrl(file.storage_path, 300);
    if (signedError || !data) { setError(signedError?.message || 'Could not open this contract file.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const markSigned = async (contract: Contract) => {
    const original = files.filter((file) => (file.file_kind === 'original_pdf' || file.file_kind === 'document') && isPdfFile(file))
      .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0];
    if (!original || !files.some((file) => file.file_kind === 'signed_copy' && isPdfFile(file) && file.source_file_id === original.id)) {
      setError('Keep both the original agreement PDF and signed PDF on the contract before marking it active.');
      return;
    }
    await transition(contract, 'active', 'Signed copy received and contract marked active.', { signed_at: new Date().toISOString() });
  };

  const terminate = async (contract: Contract) => {
    if (!await confirm({ title: `End “${contract.name}”?`, message: 'This will record the agreement as ended.', confirmLabel: 'End contract' })) return;
    await transition(contract, 'ended', 'Contract marked as ended.', { ended_at: new Date().toISOString() });
  };

  const openCreate = () => setEditing(null);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[#090b0f] text-slate-100">
      <header className="workspace-page-header flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#0d1016]">
        <div>
          <h1 className="text-xl font-semibold text-white">Contracts</h1>
        </div>
        {canEdit && <button type="button" onClick={openCreate} className={button}><Plus className="h-4 w-4" />New contract</button>}
      </header>

      <div className="workspace-page-body mx-auto w-full max-w-[1600px] flex-1">
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-900 bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{userFacingError(error)}</p>}
        {signingStatusError && <p role="alert" className="mb-4 rounded-lg bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{signingStatusError}</p>}

        <details className="mb-4"><summary className="cursor-pointer text-sm font-medium text-slate-400">Contract overview</summary><section aria-label="Contract summary" className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['All contracts', contracts.length], ['Active', active], ['Awaiting signature', pending], ['Renewal in 45 days', renewalsSoon]].map(([title, count]) => (
            <div key={title} className="py-2">
              <p className="text-xs font-medium text-slate-400">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{count}</p>
            </div>
          ))}
        </section></details>

        <section className="grid items-start gap-4 xl:grid-cols-[minmax(280px,0.65fr)_minmax(0,1.4fr)]">
          <div className={`${selected ? 'hidden xl:block' : ''} overflow-hidden rounded-xl border border-slate-800 bg-[#0d1016]`}>
            <div className="space-y-3 border-b border-slate-800 p-4">
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contracts" aria-label="Search contracts" className={`${input} pl-9`} /></div>
              <CustomSelect aria-label="Contract status" value={filter} onChange={(event) => setFilter(event.target.value as ContractStatus | 'all')} className={input}>{(['all', ...statuses] as const).map((value) => <option key={value} value={value}>{value === 'all' ? 'All contracts' : label(value)}</option>)}</CustomSelect>
            </div>
            <div className="divide-y divide-slate-800">
              {loading ? <p className="p-5 text-sm text-slate-400">Loading contracts…</p> : filtered.length ? filtered.map((contract) => (
                <button key={contract.id} type="button" onClick={() => setSelectedId(contract.id)} className={`flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-900 ${contract.id === selectedId ? 'bg-slate-900' : ''}`}>
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-100">{contract.name}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-600" /></span>
                    <span className="mt-1 block truncate text-xs text-slate-400">{orgs.find((org) => org.id === contract.organization_id)?.name || contract.counterparty_name || 'No counterparty'}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-0.5 text-[11px] ${statusClass[contract.status]}`}>{label(contract.status)}</span><span className="text-xs text-slate-500">{contract.end_date ? `Ends ${fmt(contract.end_date)}` : label(contract.contract_type)}</span></span>
                  </span>
                </button>
              )) : <div className="p-6 text-center"><FileText className="mx-auto h-6 w-6 text-slate-600" /><p className="mt-2 text-sm font-medium text-slate-300">{contracts.length ? 'No matching contracts' : 'No contracts yet'}</p><p className="mt-1 text-xs text-slate-500">{contracts.length ? 'Try another search or status.' : 'Create the first agreement to track it here.'}</p>{!contracts.length && canEdit && <button type="button" className={`${button} mt-4`} onClick={openCreate}><Plus className="h-4 w-4" />New contract</button>}</div>}
            </div>
          </div>

          <div className={`${selected ? '' : 'hidden xl:block'} min-w-0 rounded-xl border border-slate-800 bg-[#0d1016]`}>
            {selected ? (
              <>
                <div className="border-b border-slate-800 p-5 sm:p-6">
                  <button type="button" aria-label="Back to contracts" onClick={() => setSelectedId(null)} className="workspace-control mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 xl:hidden"><ArrowLeft className="h-4 w-4" />All contracts</button>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-white">{selected.name}</h2><span className={`rounded px-2 py-0.5 text-xs ${statusClass[selected.status]}`}>{label(selected.status)}</span></div>
                      <p className="mt-1 text-sm text-slate-400">{orgs.find((org) => org.id === selected.organization_id)?.name || selected.counterparty_name || 'No counterparty'} · {label(selected.contract_type)}</p>
                    </div>
                    {canEdit && <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setEditing(selected)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800">Edit details</button>
                      {['draft', 'pending_signature'].includes(selected.status) && files.some(file => isPdfFile(file) && ['original_pdf', 'document'].includes(file.file_kind)) && <button type="button" disabled={busy || !signingStatusLoaded} onClick={() => void openPlacement(selected)} className={button}><Send className="h-4 w-4" />{signatureStatus?.flowVersion === 2 && signatureStatus.status === 'draft' ? 'Retry invitation' : selected.status === 'draft' ? 'Place fields and send' : 'Replace signing request'}</button>}
                      {selected.status === 'pending_signature' && signingStatusLoaded && signatureStatus?.flowVersion !== 2 && <button type="button" disabled={busy} onClick={() => void markSigned(selected)} className={button}><Check className="h-4 w-4" />Mark signed</button>}
                      {signatureStatus?.status === 'recipient_signed' && signatureStatus.flowVersion === 2 && canCountersign(signatureStatus.status, signatureStatus.counterSignerId, currentUser.id) && <button type="button" disabled={busy} onClick={() => void openCounterSigning(selected)} className={button}><Check className="h-4 w-4" />Review and countersign</button>}
                      {signatureStatus?.status === 'completed' && signatureStatus.flowVersion === 2 && signatureStatus.confirmationDeliveryStatus !== 'sent' && <button type="button" disabled={busy} onClick={() => void retryConfirmation()} className={button}><RefreshCw className="h-4 w-4" />Retry confirmation email</button>}
                      {['active', 'renewal_due'].includes(selected.status) && <button type="button" disabled={busy} onClick={() => void terminate(selected)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:border-rose-800 hover:text-rose-300">End contract</button>}
                      {['active', 'renewal_due'].includes(selected.status) && (selected.renewal_date || selected.end_date) && daysUntil((selected.renewal_date || selected.end_date)!) <= 45 && <button type="button" onClick={() => setEditing(selected)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"><RefreshCw className="h-4 w-4" />Renewal terms</button>}
                    </div>}
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Detail label="Recipient" value={selected.counterparty_name || 'Add a recipient'} />
                    <Detail label="Email" value={selected.counterparty_email || 'Add an email address'} />
                    <Detail label="Flown countersigner" value={users.find((user) => user.id === selected.counter_signer_id)?.name || 'Choose a staff member'} />
                  </div>
                  <details className="mt-5"><summary className="cursor-pointer text-sm font-medium text-slate-400">Contract details</summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {selected.owner_id && <Detail label="Contract owner" value={users.find((user) => user.id === selected.owner_id)?.name || 'Unknown staff member'} />}
                      {selected.value !== null && <Detail label="Contract value" value={new Intl.NumberFormat(undefined, { style: 'currency', currency: selected.currency || 'USD' }).format(selected.value)} />}
                      {selected.start_date && <Detail label="Start date" value={fmt(selected.start_date)} />}
                      {selected.end_date && <Detail label="End date" value={fmt(selected.end_date)} />}
                      {selected.renewal_date && <Detail label="Renewal date" value={fmt(selected.renewal_date)} />}
                      <Detail label="Auto-renew" value={selected.auto_renew ? 'Yes' : 'No'} />
                    </div>
                    {selected.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.description}</p>}
                  </details>
                  {signatureStatus?.status === 'pending' && signatureStatus.flowVersion === 2 && <p className="mt-4 rounded-lg bg-amber-950/60 px-3 py-2.5 text-xs leading-5 text-amber-200">Signing email sent to {selected.counterparty_email}. Awaiting the recipient’s signature.</p>}
                  {signatureStatus?.status === 'draft' && signatureStatus.flowVersion === 2 && signatureStatus.emailError && <p className="mt-4 rounded-lg bg-rose-950/60 px-3 py-2.5 text-xs leading-5 text-rose-200">{signatureStatus.emailError}</p>}
                  {signatureStatus?.status === 'recipient_signed' && signatureStatus.flowVersion === 2 && <p className="mt-4 rounded-lg bg-amber-950/60 px-3 py-2.5 text-xs leading-5 text-amber-200">{signatureStatus.recipientSignedName || selected.counterparty_name} signed. {canCountersign(signatureStatus.status, signatureStatus.counterSignerId, currentUser.id) ? 'Your countersignature is next.' : `Awaiting ${users.find((user) => user.id === signatureStatus.counterSignerId)?.name || 'the selected Flown countersigner'}.`}</p>}
                  {signatureStatus?.status === 'completed' && signatureStatus.flowVersion === 2 && <p className={`mt-4 rounded-lg px-3 py-2.5 text-xs leading-5 ${signatureStatus.confirmationDeliveryStatus === 'sent' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>{signatureStatus.confirmationDeliveryStatus === 'sent' ? 'Countersigned agreement completed and emailed to the recipient.' : signatureStatus.confirmationError || 'The signed agreement is complete, but the confirmation email needs retrying.'}</p>}
                  {selected.status === 'pending_signature' && signingStatusLoaded && (!signatureStatus || signatureStatus.flowVersion === 1) && <p className="mt-4 rounded-lg bg-amber-950/60 px-3 py-2.5 text-xs leading-5 text-amber-200">Legacy signing request. Existing signature links remain valid; signed PDFs can still be uploaded and recorded.</p>}
                </div>

                <div className="divide-y divide-slate-800">
                  <section className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white">Agreement PDF</h3>
                      {canEdit && <div className="flex flex-wrap gap-2">
                        <label className={`${button} cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-4 w-4" />Upload PDF<input type="file" accept="application/pdf,.pdf" aria-describedby="contract-pdf-limits" className="sr-only" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadFile(selected, file, 'original_pdf'); event.currentTarget.value = ''; }} /></label>
                      </div>}
                    </div>
                    <div className="mt-4 space-y-2">
                      {files.length ? files.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-lg bg-[#11151c] px-3 py-3">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <button type="button" onClick={() => void openFile(file)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium text-slate-200 hover:text-sky-300">{file.file_name}</span><span className="mt-0.5 block text-xs text-slate-500">{label(file.file_kind)} · v{file.version_number}{file.source_file_id ? ` · Based on original v${files.find((item) => item.id === file.source_file_id)?.version_number ?? '?'}` : ''}{file.file_size ? ` · ${bytes(file.file_size)}` : ''}</span></button>
                        <button type="button" title="Download file" onClick={() => void openFile(file)} className="rounded p-1.5 text-slate-400 hover:text-white"><ArrowDownToLine className="h-4 w-4" /></button>
                      </div>) : <div className="rounded-lg bg-[#11151c] px-4 py-6 text-center"><FilePlus2 className="mx-auto h-5 w-5 text-slate-500" /><p className="mt-2 text-sm text-slate-300">Upload the agreement to prepare it for signing.</p></div>}
                    </div>
                    <p id="contract-pdf-limits" className="mt-3 text-xs text-slate-500">PDF only · Up to 50 MB</p>
                    {canEdit && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-slate-400">Other document uploads</summary><div className="mt-3 flex flex-wrap gap-2">
                      {([['signed_copy', 'Upload signed PDF'], ['amendment', 'Upload amendment PDF']] as const).map(([kind, title]) => <label key={kind} className={`workspace-control inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-4 w-4" />{title}<input type="file" accept="application/pdf,.pdf" aria-describedby="contract-pdf-limits" className="sr-only" disabled={busy} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadFile(selected, file, kind); event.currentTarget.value = ''; }} /></label>)}
                    </div></details>}
                  </section>

                  <details className="p-5 sm:p-6">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-300">Contract activity</summary>
                    <div className="mt-4 space-y-4">
                      {events.length ? events.map((event) => <div key={event.id} className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800"><Clock3 className="h-3.5 w-3.5 text-slate-400" /></span><div className="min-w-0"><p className="text-sm font-medium text-slate-200">{label(event.event_type)}</p><p className="mt-0.5 text-xs leading-5 text-slate-400">{event.details}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(event.created_at).toLocaleString()}</p></div></div>) : <p className="text-sm text-slate-500">No activity recorded yet.</p>}
                    </div>
                  </details>
                </div>
              </>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                <CalendarClock className="h-7 w-7 text-slate-500" /><h2 className="mt-3 text-base font-semibold text-white">Select a contract</h2>
              </div>
            )}
          </div>
        </section>
      </div>

      {editing !== false && <ContractForm initial={editing || undefined} organizations={orgs} contacts={contacts} users={users.filter((user) => user.accountStatus !== 'removed')} currentUserId={currentUser.id} busy={busy} onClose={() => setEditing(false)} onSave={(values) => save(values, editing?.id)} />}
      {placement && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-3" onClick={() => { setPlacement(null); setCounterSigning(false); }}>
        <section role="dialog" aria-modal="true" aria-label={counterSigning ? 'Countersign agreement' : 'Place signature fields'} onClick={(event) => event.stopPropagation()} className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0d1016]">
          <header className="flex items-start justify-between gap-4 border-b border-slate-800 p-4 sm:p-5">
            <div><h2 className="text-lg font-semibold text-white">{counterSigning ? 'Countersign agreement' : 'Place fields and send'}</h2><p className="mt-1 text-sm text-slate-400">{placement.contract.name} · {counterSigning ? 'Your turn to countersign' : `To ${placement.contract.counterparty_name} · ${placement.contract.counterparty_email}`}</p></div>
            <button type="button" aria-label="Close dialog" onClick={() => { setPlacement(null); setCounterSigning(false); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {counterSigning && <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-300">Your authenticated Flown profile<input readOnly value={signerName} maxLength={200} className={`${input} mt-1`} /></label>
              <label className="flex items-start gap-2 self-end rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-300"><input type="checkbox" checked={counterAcknowledged} onChange={(event) => setCounterAcknowledged(event.target.checked)} className="mt-1" /><span>I reviewed the recipient-signed agreement and approve this countersignature.</span></label>
            </div>}
            <ContractFieldEditor
              fileUrl={placement.url}
              fields={placement.fields}
              onChange={(fields) => {
                if (sendAttempt.current && JSON.stringify(sendAttempt.current.fields) !== JSON.stringify(fields)) sendAttempt.current = null;
                setPlacement((current) => current ? { ...current, fields } : current);
              }}
              mode={counterSigning ? 'sign' : 'place'}
              signer="countersigner"
              nameValue={signerName}
              onSignaturesChange={handleSignaturesChange}
            />
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-800 p-4">
            <button type="button" onClick={() => { setPlacement(null); setCounterSigning(false); }} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
            <button type="button" disabled={busy || (counterSigning && !counterAcknowledged)} onClick={() => void (counterSigning ? completeCounterSigning() : sendSigningRequest())} className={button}>
              {counterSigning ? <><Check className="h-4 w-4" />{busy ? 'Completing…' : 'Countersign and send copy'}</> : <><Send className="h-4 w-4" />{busy ? 'Sending…' : `Email ${placement.contract.counterparty_email}`}</>}
            </button>
          </footer>
        </section>
      </div>}
      {confirmDialog}
    </main>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label: title, value }) => <div className="min-w-0"><p className="text-xs text-slate-500">{title}</p><p className="mt-1 break-words text-sm font-medium text-slate-200">{value}</p></div>;

const ContractForm: React.FC<{
  initial?: Contract;
  organizations: Org[];
  contacts: Contact[];
  users: { id: string; name: string }[];
  currentUserId: string;
  busy: boolean;
  onClose: () => void;
  onSave: (values: FormValues) => Promise<string>;
}> = ({ initial, organizations, contacts, users, currentUserId, busy, onClose, onSave }) => {
  const [form, setForm] = useState<FormValues>(() => initial ? {
    organization_id: initial.organization_id, contact_id: initial.contact_id, name: initial.name,
    contract_type: initial.contract_type, description: initial.description, value: initial.value,
    currency: initial.currency, start_date: initial.start_date, end_date: initial.end_date,
    renewal_date: initial.renewal_date, auto_renew: initial.auto_renew,
    counterparty_name: initial.counterparty_name, counterparty_email: initial.counterparty_email,
    counter_signer_id: initial.counter_signer_id || null,
    owner_id: initial.owner_id,
  } : { ...blankForm(), owner_id: currentUserId });
  const [formError, setFormError] = useState('');
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setForm((current) => ({ ...current, [key]: value }));
  const availableContacts = contacts.filter((contact) => !form.organization_id || contact.organization_id === form.organization_id);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.counterparty_email && !isValidEmail(form.counterparty_email)) { setFormError('Enter a valid counterparty email address.'); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setFormError('The end date must be after the start date.'); return; }
    setFormError('');
    setFormError(await onSave(form));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={`${initial ? 'Edit' : 'Create'} contract`} onSubmit={(event) => void submit(event)} onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0d1016] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><h2 className="text-lg font-semibold text-white">{initial ? 'Edit contract' : 'Create contract'}</h2><button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Contract name"><input required maxLength={200} value={form.name} onChange={(event) => set('name', event.target.value)} className={input} /></Field>
          <Field label="Recipient name"><input maxLength={200} value={form.counterparty_name} onChange={(event) => set('counterparty_name', event.target.value)} className={input} /></Field>
          <Field label="Recipient email"><input type="email" value={form.counterparty_email} onChange={(event) => set('counterparty_email', event.target.value)} className={input} /></Field>
          <Field label="Flown countersigner"><CustomSelect value={form.counter_signer_id || ''} onChange={(event) => set('counter_signer_id', event.target.value || null)} className={input}><option value="">Select a staff member</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></Field>
        </div>
        <details className="mt-5"><summary className="cursor-pointer text-sm font-medium text-slate-400">Company, dates & other details</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Type"><CustomSelect value={form.contract_type} onChange={(event) => set('contract_type', event.target.value as ContractType)} className={input}>{(['service', 'partnership', 'grant', 'nda', 'vendor', 'other'] as const).map((type) => <option key={type} value={type}>{label(type)}</option>)}</CustomSelect></Field>
          <Field label="Company"><CustomSelect value={form.organization_id || ''} onChange={(event) => { const id = event.target.value || null; set('organization_id', id); if (form.contact_id && !contacts.some((contact) => contact.id === form.contact_id && (!id || contact.organization_id === id))) set('contact_id', null); }} className={input}><option value="">No company linked</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</CustomSelect></Field>
          <Field label="Contact"><CustomSelect value={form.contact_id || ''} onChange={(event) => set('contact_id', event.target.value || null)} className={input}><option value="">No contact linked</option>{availableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.email ? ` · ${contact.email}` : ''}</option>)}</CustomSelect></Field>
          <Field label="Contract owner"><CustomSelect value={form.owner_id || ''} onChange={(event) => set('owner_id', event.target.value || null)} className={input}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></Field>
          <Field label="Contract value"><div className="flex gap-2"><CustomSelect value={form.currency} onChange={(event) => set('currency', event.target.value)} className={`${input} w-24 shrink-0`}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></CustomSelect><input type="number" min="0" step="0.01" value={form.value ?? ''} onChange={(event) => set('value', event.target.value === '' ? null : Number(event.target.value))} className={input} placeholder="Optional" /></div></Field>
          <Field label="Start date"><input type="date" value={form.start_date || ''} onChange={(event) => set('start_date', event.target.value || null)} className={input} /></Field>
          <Field label="End date"><input type="date" value={form.end_date || ''} onChange={(event) => set('end_date', event.target.value || null)} className={input} /></Field>
          <Field label="Renewal date"><input type="date" value={form.renewal_date || ''} onChange={(event) => set('renewal_date', event.target.value || null)} className={input} /></Field>
          <label className="flex items-center gap-2 self-end rounded-lg bg-slate-900 px-3 py-3 text-sm text-slate-300"><input type="checkbox" checked={form.auto_renew} onChange={(event) => set('auto_renew', event.target.checked)} className="h-4 w-4 accent-sky-500" />Automatically renews</label>
          <Field label="Internal notes (not contract text)" wide><textarea rows={4} value={form.description} onChange={(event) => set('description', event.target.value)} className={input} /></Field>
        </div></details>
        {formError && <p role="alert" className="mt-4 text-sm text-rose-300">{userFacingError(formError)}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button><button type="submit" disabled={busy || !form.name.trim()} className={button}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create contract'}</button></div>
      </form>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; wide?: boolean }> = ({ label: title, children, wide }) => <label className={`block space-y-1.5 text-sm font-medium text-slate-300 ${wide ? 'sm:col-span-2' : ''}`}>{title}{children}</label>;

function daysUntil(value: string) {
  return Math.ceil((new Date(`${value}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
}

function safeFileName(value: string) {
  return value.replace(/[^\w.-]+/g, '_').slice(-150) || 'contract-file';
}
