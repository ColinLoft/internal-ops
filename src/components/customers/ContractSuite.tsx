import { CustomSelect } from "../common/CustomSelect";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, CalendarClock, Check, ChevronRight, Clock3, FilePlus2, FileText, Plus, RefreshCw, Search, Send, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppAccess } from '../../lib/useAppAccess';
import { useConfirm } from '../common/useConfirm';

type ContractStatus = 'draft' | 'pending_signature' | 'active' | 'renewal_due' | 'ended' | 'expired';
type ContractType = 'service' | 'partnership' | 'grant' | 'nda' | 'vendor' | 'other';
type FileKind = 'document' | 'signed_copy' | 'amendment' | 'other';
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
type ContractFile = { id: string; contract_id: string; file_name: string; storage_path: string; file_size: number | null; file_kind: FileKind; created_at: string };
type ContractEvent = { id: string; actor_id: string | null; event_type: string; details: string; created_at: string };
type FormValues = Pick<Contract, 'organization_id' | 'contact_id' | 'name' | 'contract_type' | 'description' | 'value' | 'currency' | 'start_date' | 'end_date' | 'renewal_date' | 'auto_renew' | 'counterparty_name' | 'counterparty_email' | 'owner_id'>;

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

const blankForm = (): FormValues => ({
  organization_id: null, contact_id: null, name: '', contract_type: 'other', description: '', value: null,
  currency: 'USD', start_date: null, end_date: null, renewal_date: null, auto_renew: false,
  counterparty_name: '', counterparty_email: '', owner_id: null,
});

export const ContractSuite: React.FC = () => {
  const { currentUser, users } = useWorkspace();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { canEdit, canManage } = useAppAccess('customers');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [files, setFiles] = useState<ContractFile[]>([]);
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
    if (selectedId && !rows.some((row) => row.id === selectedId)) setSelectedId(rows[0]?.id || null);
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

  const prepareSignatureEmail = async (contract: Contract) => {
    if (!contract.counterparty_email || !isValidEmail(contract.counterparty_email)) {
      setError('Add a valid counterparty email before preparing the signature request.');
      setEditing(contract);
      return;
    }
    const { error: updateError } = await supabase.from('customer_contracts')
      .update({ signature_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', contract.id);
    if (updateError) { setError(updateError.message); return; }
    await load();
    await loadDetails(contract.id);
    await appendEvent(contract.id, 'signature_email_prepared', `Email draft prepared for ${contract.counterparty_email}; it has not been sent yet.`);
    const subject = encodeURIComponent(`Signature requested: ${contract.name}`);
    const body = encodeURIComponent(
      `Hello ${contract.counterparty_name || 'there'},\n\nPlease review and sign the attached agreement, "${contract.name}".\n\nPlease reply with the signed copy or contact us with any questions.\n\nRegards`,
    );
    window.location.href = `mailto:${encodeURIComponent(contract.counterparty_email)}?subject=${subject}&body=${body}`;
  };

  const uploadFile = async (contract: Contract, file: File, kind: FileKind) => {
    if (file.size > 50 * 1024 * 1024) { setError('Files must be 50 MB or smaller.'); return; }
    setBusy(true);
    setError('');
    const path = `${currentUser.id}/${contract.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('contracts-files').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (uploadError) { setError(uploadError.message); setBusy(false); return; }
    const { error: rowError } = await supabase.from('customer_contract_files').insert({
      contract_id: contract.id, uploaded_by: currentUser.id, file_name: file.name,
      storage_path: path, file_size: file.size, mime_type: file.type || null, file_kind: kind,
    });
    if (rowError) {
      const { error: cleanupError } = await supabase.storage.from('contracts-files').remove([path]);
      setError(cleanupError ? `${rowError.message} (Also failed to remove the uploaded file: ${cleanupError.message})` : rowError.message);
      setBusy(false);
      return;
    }
    await loadDetails(contract.id);
    await appendEvent(contract.id, 'file_uploaded', `${label(kind)} uploaded: ${file.name}`);
    setBusy(false);
  };

  const openFile = async (file: ContractFile) => {
    const { data, error: signedError } = await supabase.storage.from('contracts-files').createSignedUrl(file.storage_path, 300);
    if (signedError || !data) { setError(signedError?.message || 'Could not open this contract file.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const deleteFile = async (file: ContractFile) => {
    if (!await confirm({ title: `Delete “${file.file_name}”?`, message: 'This file will be removed from the contract.', confirmLabel: 'Delete' })) return;
    const { error: storageError } = await supabase.storage.from('contracts-files').remove([file.storage_path]);
    if (storageError) { setError(storageError.message); return; }
    const { error: rowError } = await supabase.from('customer_contract_files').delete().eq('id', file.id);
    if (rowError) setError(rowError.message);
    else { await loadDetails(file.contract_id); await appendEvent(file.contract_id, 'file_deleted', `${file.file_name} deleted.`); }
  };

  const markSigned = async (contract: Contract) => {
    if (!files.some((file) => file.file_kind === 'signed_copy')) { setError('Upload the signed copy before marking this contract active.'); return; }
    await transition(contract, 'active', 'Signed copy received and contract marked active.', { signed_at: new Date().toISOString() });
  };

  const markRequestSent = async (contract: Contract) => {
    if (!await confirm({ title: 'Mark signature request as sent?', message: `Confirm that you sent the request to ${contract.counterparty_email}.`, confirmLabel: 'Confirm sent', variant: 'primary' })) return;
    await transition(contract, 'pending_signature', `Signature request sent to ${contract.counterparty_email}.`, { signature_requested_at: new Date().toISOString() });
  };

  const terminate = async (contract: Contract) => {
    if (!await confirm({ title: `End “${contract.name}”?`, message: 'This will record the agreement as ended.', confirmLabel: 'End contract' })) return;
    await transition(contract, 'ended', 'Contract marked as ended.', { ended_at: new Date().toISOString() });
  };

  const remove = async (contract: Contract) => {
    if (!canManage || !await confirm({ title: `Delete “${contract.name}”?`, message: 'The contract and its stored files will be deleted. This cannot be undone.', confirmLabel: 'Delete' })) return;
    setBusy(true);
    const contractFiles = files.filter((file) => file.contract_id === contract.id);
    if (contractFiles.length) {
      const { error: storageError } = await supabase.storage.from('contracts-files').remove(contractFiles.map((file) => file.storage_path));
      if (storageError) { setError(storageError.message); setBusy(false); return; }
    }
    const { error: deleteError } = await supabase.from('customer_contracts').delete().eq('id', contract.id);
    if (deleteError) setError(deleteError.message);
    else { setSelectedId(null); await load(); }
    setBusy(false);
  };

  const openCreate = () => setEditing(null);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[#090b0f] text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#0d1016] px-5 py-5 sm:px-8">
        <div>
          <button type="button" onClick={() => navigate('/customers/organizations')} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />Customers</button>
          <h1 className="text-xl font-semibold text-white">Contracts</h1>
          <p className="mt-1 text-sm text-slate-400">Create agreements, coordinate signatures and stay ahead of renewals.</p>
        </div>
        {canEdit && <button type="button" onClick={openCreate} className={button}><Plus className="h-4 w-4" />New contract</button>}
      </header>

      <div className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8">
        {error && <p role="alert" className="mb-4 rounded-lg border border-rose-900 bg-rose-950/60 px-4 py-3 text-sm text-rose-200">{error}</p>}

        <section aria-label="Contract summary" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['All contracts', contracts.length], ['Active', active], ['Awaiting signature', pending], ['Renewal in 45 days', renewalsSoon]].map(([title, count]) => (
            <div key={title} className="rounded-xl border border-slate-800 bg-[#0d1016] px-4 py-3">
              <p className="text-xs font-medium text-slate-400">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{count}</p>
            </div>
          ))}
        </section>

        <section className="grid min-h-[520px] gap-4 xl:grid-cols-[minmax(330px,0.8fr)_minmax(0,1.4fr)]">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0d1016]">
            <div className="space-y-3 border-b border-slate-800 p-4">
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contracts" aria-label="Search contracts" className={`${input} pl-9`} /></div>
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {(['all', ...statuses] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium ${filter === value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>{value === 'all' ? 'All' : label(value)}</button>)}
              </div>
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

          <div className="min-w-0 rounded-xl border border-slate-800 bg-[#0d1016]">
            {selected ? (
              <>
                <div className="border-b border-slate-800 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-white">{selected.name}</h2><span className={`rounded px-2 py-0.5 text-xs ${statusClass[selected.status]}`}>{label(selected.status)}</span></div>
                      <p className="mt-1 text-sm text-slate-400">{orgs.find((org) => org.id === selected.organization_id)?.name || selected.counterparty_name || 'No counterparty'} · {label(selected.contract_type)}</p>
                    </div>
                    {canEdit && <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setEditing(selected)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800">Edit details</button>
                      {selected.status === 'draft' && !selected.signature_requested_at && <button type="button" disabled={busy} onClick={() => void prepareSignatureEmail(selected)} className={button}><Send className="h-4 w-4" />Prepare signature email</button>}
                      {selected.status === 'draft' && !!selected.signature_requested_at && <button type="button" disabled={busy} onClick={() => void markRequestSent(selected)} className={button}><Send className="h-4 w-4" />Mark request sent</button>}
                      {selected.status === 'pending_signature' && <button type="button" disabled={busy} onClick={() => void markSigned(selected)} className={button}><Check className="h-4 w-4" />Mark signed</button>}
                      {['active', 'renewal_due'].includes(selected.status) && <button type="button" disabled={busy} onClick={() => void terminate(selected)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:border-rose-800 hover:text-rose-300">End contract</button>}
                      {['active', 'renewal_due'].includes(selected.status) && (selected.renewal_date || selected.end_date) && daysUntil((selected.renewal_date || selected.end_date)!) <= 45 && <button type="button" onClick={() => setEditing(selected)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"><RefreshCw className="h-4 w-4" />Renewal terms</button>}
                      {canManage && <button type="button" disabled={busy} aria-label="Delete contract" onClick={() => void remove(selected)} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>}
                    </div>}
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Detail label="Counterparty" value={selected.counterparty_name || '—'} />
                    <Detail label="Contact" value={selected.counterparty_email || '—'} />
                    <Detail label="Contract owner" value={users.find((user) => user.id === selected.owner_id)?.name || 'Unassigned'} />
                    <Detail label="Contract value" value={selected.value === null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: selected.currency || 'USD' }).format(selected.value)} />
                    <Detail label="Start date" value={fmt(selected.start_date)} />
                    <Detail label="End date" value={fmt(selected.end_date)} />
                    <Detail label="Renewal date" value={fmt(selected.renewal_date)} />
                    <Detail label="Auto-renew" value={selected.auto_renew ? 'Yes' : 'No'} />
                  </div>
                  {selected.description && <p className="mt-5 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.description}</p>}
                  {selected.signature_requested_at && selected.status === 'draft' && <p className="mt-4 rounded-lg bg-amber-950/60 px-3 py-2.5 text-xs leading-5 text-amber-200">An email draft was prepared. After you send it from your mail client, mark the request sent here. Flown does not send email or provide a legally certified e-signature service.</p>}
                  {selected.status === 'pending_signature' && <p className="mt-4 rounded-lg bg-amber-950/60 px-3 py-2.5 text-xs leading-5 text-amber-200">The signature request is marked as sent. Upload the returned signed copy here. Flown does not provide a legally certified e-signature service.</p>}
                </div>

                <div className="grid divide-y divide-slate-800 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.7fr)] lg:divide-x lg:divide-y-0">
                  <section className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><h3 className="text-sm font-semibold text-white">Documents</h3><p className="mt-1 text-xs text-slate-400">{files.length} stored files · private to the workspace</p></div>
                      {canEdit && <label className={`${button} cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-4 w-4" />Upload file<input type="file" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(selected, file, file.name.toLowerCase().includes('signed') ? 'signed_copy' : 'document'); event.currentTarget.value = ''; }} /></label>}
                    </div>
                    <div className="mt-4 space-y-2">
                      {files.length ? files.map((file) => <div key={file.id} className="flex items-center gap-3 rounded-lg bg-[#11151c] px-3 py-3">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <button type="button" onClick={() => void openFile(file)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium text-slate-200 hover:text-sky-300">{file.file_name}</span><span className="mt-0.5 block text-xs text-slate-500">{label(file.file_kind)}{file.file_size ? ` · ${bytes(file.file_size)}` : ''}</span></button>
                        <button type="button" title="Download file" onClick={() => void openFile(file)} className="rounded p-1.5 text-slate-400 hover:text-white"><ArrowDownToLine className="h-4 w-4" /></button>
                        {canEdit && <button type="button" title="Delete file" onClick={() => void deleteFile(file)} className="rounded p-1.5 text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>}
                      </div>) : <div className="rounded-lg bg-[#11151c] px-4 py-6 text-center"><FilePlus2 className="mx-auto h-5 w-5 text-slate-500" /><p className="mt-2 text-sm text-slate-300">No files attached</p><p className="mt-1 text-xs text-slate-500">Upload the agreement, amendments and signed copy.</p></div>}
                    </div>
                    {canEdit && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>Signed copy:</span>{files.some((file) => file.file_kind === 'signed_copy') ? <span className="text-emerald-300">uploaded</span> : <label className="cursor-pointer font-semibold text-sky-400 hover:text-sky-300">Upload signed copy<input type="file" className="sr-only" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(selected, file, 'signed_copy'); event.currentTarget.value = ''; }} /></label>}<span>· Maximum file size 50 MB</span></div>}
                    <p className="mt-4 text-xs leading-5 text-slate-500">Signature requests are prepared in your email client; upload the signed agreement when it is returned. For electronic signing and audit certificates, connect a dedicated e-sign provider.</p>
                  </section>

                  <section className="p-5 sm:p-6">
                    <h3 className="text-sm font-semibold text-white">Contract activity</h3>
                    <div className="mt-4 space-y-4">
                      {events.length ? events.map((event) => <div key={event.id} className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800"><Clock3 className="h-3.5 w-3.5 text-slate-400" /></span><div className="min-w-0"><p className="text-sm font-medium text-slate-200">{label(event.event_type)}</p><p className="mt-0.5 text-xs leading-5 text-slate-400">{event.details}</p><p className="mt-1 text-[11px] text-slate-500">{new Date(event.created_at).toLocaleString()}</p></div></div>) : <p className="text-sm text-slate-500">No activity recorded yet.</p>}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center px-6 text-center">
                <CalendarClock className="h-7 w-7 text-slate-500" /><h2 className="mt-3 text-base font-semibold text-white">Select a contract</h2><p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">Manage its terms, documents, counterparties and lifecycle in one place.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {editing !== false && <ContractForm initial={editing || undefined} organizations={orgs} contacts={contacts} users={users.filter((user) => user.accountStatus !== 'removed')} currentUserId={currentUser.id} busy={busy} onClose={() => setEditing(false)} onSave={(values) => save(values, editing?.id)} />}
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
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">{initial ? 'Edit contract' : 'Create contract'}</h2><p className="mt-1 text-sm text-slate-400">Capture the agreement, counterparty and key dates.</p></div><button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Contract name"><input required maxLength={200} value={form.name} onChange={(event) => set('name', event.target.value)} className={input} /></Field>
          <Field label="Type"><CustomSelect value={form.contract_type} onChange={(event) => set('contract_type', event.target.value as ContractType)} className={input}>{(['service', 'partnership', 'grant', 'nda', 'vendor', 'other'] as const).map((type) => <option key={type} value={type}>{label(type)}</option>)}</CustomSelect></Field>
          <Field label="Company"><CustomSelect value={form.organization_id || ''} onChange={(event) => { const id = event.target.value || null; set('organization_id', id); if (form.contact_id && !contacts.some((contact) => contact.id === form.contact_id && (!id || contact.organization_id === id))) set('contact_id', null); }} className={input}><option value="">No company linked</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</CustomSelect></Field>
          <Field label="Contact"><CustomSelect value={form.contact_id || ''} onChange={(event) => set('contact_id', event.target.value || null)} className={input}><option value="">No contact linked</option>{availableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.email ? ` · ${contact.email}` : ''}</option>)}</CustomSelect></Field>
          <Field label="Counterparty name"><input maxLength={200} value={form.counterparty_name} onChange={(event) => set('counterparty_name', event.target.value)} className={input} /></Field>
          <Field label="Counterparty email"><input type="email" value={form.counterparty_email} onChange={(event) => set('counterparty_email', event.target.value)} className={input} /></Field>
          <Field label="Contract owner"><CustomSelect value={form.owner_id || ''} onChange={(event) => set('owner_id', event.target.value || null)} className={input}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</CustomSelect></Field>
          <Field label="Contract value"><div className="flex gap-2"><CustomSelect value={form.currency} onChange={(event) => set('currency', event.target.value)} className={`${input} w-24 shrink-0`}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></CustomSelect><input type="number" min="0" step="0.01" value={form.value ?? ''} onChange={(event) => set('value', event.target.value === '' ? null : Number(event.target.value))} className={input} placeholder="Optional" /></div></Field>
          <Field label="Start date"><input type="date" value={form.start_date || ''} onChange={(event) => set('start_date', event.target.value || null)} className={input} /></Field>
          <Field label="End date"><input type="date" value={form.end_date || ''} onChange={(event) => set('end_date', event.target.value || null)} className={input} /></Field>
          <Field label="Renewal date"><input type="date" value={form.renewal_date || ''} onChange={(event) => set('renewal_date', event.target.value || null)} className={input} /></Field>
          <label className="flex items-center gap-2 self-end rounded-lg bg-slate-900 px-3 py-3 text-sm text-slate-300"><input type="checkbox" checked={form.auto_renew} onChange={(event) => set('auto_renew', event.target.checked)} className="h-4 w-4 accent-sky-500" />Automatically renews</label>
          <Field label="Key terms / notes" wide><textarea rows={4} value={form.description} onChange={(event) => set('description', event.target.value)} className={input} /></Field>
        </div>
        {formError && <p role="alert" className="mt-4 text-sm text-rose-300">{formError}</p>}
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

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
