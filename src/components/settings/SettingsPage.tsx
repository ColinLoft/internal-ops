import { userFacingError } from '../../lib/userFacingError';
import { CustomSelect } from "../common/CustomSelect";
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Download, KeyRound, Loader2, LogOut, Palette, Phone, Play, Save, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, Users } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { supabase } from '../../lib/supabase';
import { RINGTONES, WorkspaceSettings } from '../../types';
import { sounds } from '../../lib/sound';
import { AdminPage } from '../admin/AdminPage';
import { OutlookSettings } from './OutlookSettings';

type Section = 'profile' | 'general' | 'appearance' | 'notifications' | 'calls' | 'ai' | 'security' | 'privacy' | 'admin' | 'email';

const card = 'rounded-xl border border-slate-200 bg-white p-5';
const input = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500';

const Toggle: React.FC<{ label: string; description: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, description, checked, onChange }) => (
  <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
    <span>
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
    </span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
  </label>
);

export const SettingsPage: React.FC = () => {
  const { currentUser, workspaceSettings, saveWorkspaceSettings, soundEnabled, toggleSound, setIsProfileSettingsOpen, logout } = useWorkspace();
  const isAdmin = currentUser.systemRole === 'admin';
  const [section, setSection] = useState<Section>(() => isAdmin && (new URLSearchParams(window.location.search).get('section') === 'email' || new URLSearchParams(window.location.search).get('mail_oauth') === 'callback') ? 'email' : 'profile');
  const [draft, setDraft] = useState<WorkspaceSettings>(workspaceSettings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceError, setDeviceError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [secMsg, setSecMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [secBusy, setSecBusy] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => { setDraft(workspaceSettings); }, [workspaceSettings]);
  useEffect(() => {
    const nav = navRef.current;
    if (nav && nav.scrollWidth > nav.clientWidth) nav.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [section]);

  useEffect(() => {
    if (section !== 'calls') return;
    if (!navigator.mediaDevices?.enumerateDevices) { setDeviceError('This browser does not support selecting audio and video devices.'); return; }
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch((error: unknown) => setDeviceError(error instanceof Error ? error.message : 'Unable to list devices.'));
  }, [section]);

  const update = <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => { setSaved(false); setDraft((previous) => ({ ...previous, [key]: value })); };
  const dirty = JSON.stringify(draft) !== JSON.stringify(workspaceSettings);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported');
  const setDesktopAlerts = async (value: boolean) => {
    if (value && desktopPermission !== 'unsupported' && window.Notification.permission === 'default') {
      const permission = await window.Notification.requestPermission();
      setDesktopPermission(permission);
      if (permission !== 'granted') return;
    }
    update('desktopNotifications', value);
  };

  const save = async () => {
    setSaving(true); setSaveError('');
    try { await saveWorkspaceSettings(draft); setSaved(true); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Unable to save settings.'); }
    finally { setSaving(false); }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 10) { setSecMsg({ ok: false, text: 'Use at least 10 characters.' }); return; }
    if (password !== confirm) { setSecMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    setSecBusy(true); setSecMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSecBusy(false);
    if (error) setSecMsg({ ok: false, text: error.message });
    else { setPassword(''); setConfirm(''); setSecMsg({ ok: true, text: 'Password updated.' }); }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: { id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role, department: currentUser.department, phone: currentUser.phone, location: currentUser.location, systemRole: currentUser.systemRole }, settings: workspaceSettings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'flown-profile-data.json'; link.click();
    URL.revokeObjectURL(url);
  };

  const signOutOthers = async () => {
    setSecBusy(true); setSecMsg(null);
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setSecBusy(false);
    setSecMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Signed out of all other devices.' });
  };

  const nav: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    { id: 'general', label: 'General', icon: SlidersHorizontal },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'calls', label: 'Calls & devices', icon: Phone },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'privacy', label: 'Privacy & data', icon: Download },
    ...(isAdmin ? [{ id: 'admin' as Section, label: 'Administration', icon: Users }] : []),
    ...(isAdmin ? [{ id: 'email' as Section, label: 'Email', icon: SlidersHorizontal }] : []),
  ];

  const audioInputs = devices.filter((device) => device.kind === 'audioinput');
  const videoInputs = devices.filter((device) => device.kind === 'videoinput');
  const prefsSection = section !== 'profile' && section !== 'security' && section !== 'privacy' && section !== 'admin' && section !== 'email';

  return (
    <main data-onboarding-target="settings-workspace" className="flex-1 overflow-y-auto">
      <div className={`workspace-page-body mx-auto ${section === 'admin' ? 'max-w-6xl' : 'max-w-5xl'}`}>
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Settings</h1>
        <div className="flex flex-col gap-6 md:flex-row">
          <nav ref={navRef} aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col">
            {nav.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)} className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors ${section === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
            <button type="button" onClick={() => void logout()} className="mt-2 flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 md:mt-4">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </nav>

          <div className="min-w-0 flex-1 space-y-4">
            {section === 'email' && isAdmin && <OutlookSettings />}
            {section === 'profile' && (
              <section className={card}>
                <h2 className="text-lg font-bold text-slate-900">Your profile</h2>
                <p className="mt-1 text-sm text-slate-500">Signed in as {currentUser.email}</p>
                <div className="mt-5 flex items-center gap-4">
                  {currentUser.avatar ? <img src={currentUser.avatar} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">{currentUser.name.slice(0, 1)}</span>}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{currentUser.name}</p>
                    <p className="truncate text-sm text-slate-500">{[currentUser.role, currentUser.department].filter(Boolean).join(' · ') || 'No title set'}</p>
                  </div>
                  <button type="button" onClick={() => setIsProfileSettingsOpen(true)} className="ml-auto rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Edit profile</button>
                </div>
                <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  {[['Phone', currentUser.phone], ['Location', currentUser.location], ['Workspace role', currentUser.systemRole]].map(([label, value]) => (
                    <div key={label}><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value || '—'}</dd></div>
                  ))}
                </dl>
              </section>
            )}

            {section === 'general' && (
              <section className={`${card} divide-y divide-slate-100`}>
                <h2 className="pb-1 text-lg font-bold text-slate-900">General</h2>
                <p className="pb-3 text-sm text-slate-500">How Flown behaves day to day.</p>
                <Toggle label="Keyboard shortcuts" description="Enable “g” then a letter to jump between apps, “n” then “t” for a new task, and “?” for the full list." checked={draft.keyboardShortcuts} onChange={(value) => update('keyboardShortcuts', value)} />
                <Toggle label="Notification sounds" description="Play a subtle sound when notifications arrive." checked={soundEnabled} onChange={() => toggleSound()} />
                <div className="flex items-center justify-between gap-4 py-3">
                  <span><span className="block text-sm font-semibold text-slate-800">Reset home dashboard</span><span className="mt-0.5 block text-xs text-slate-500">Restore the default widgets and their order.</span></span>
                  <button type="button" onClick={() => { localStorage.removeItem('flown-home-widgets-v2'); setSecMsg({ ok: true, text: 'Home dashboard reset.' }); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Reset</button>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <span><span className="block text-sm font-semibold text-slate-800">Clear saved view preferences</span><span className="mt-0.5 block text-xs text-slate-500">Forget panel sizes, task views, filters and open tabs on this device.</span></span>
                  <button type="button" onClick={() => { Object.keys(localStorage).filter((key) => key.startsWith('flown-')).forEach((key) => localStorage.removeItem(key)); setSecMsg({ ok: true, text: 'Saved view preferences cleared. Reload to see defaults.' }); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Clear</button>
                </div>
                {secMsg && <p role="status" className={`pt-3 text-xs ${secMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{secMsg.text}</p>}
              </section>
            )}

            {section === 'appearance' && (
              <section className={card}>
                <h2 className="text-lg font-bold text-slate-900">Appearance</h2>
                <p className="mt-3 text-sm text-slate-500">Flown Ops uses black backgrounds, charcoal panels, and white text. Flown blue highlights buttons, links, selections, and keyboard focus. Light mode and custom accent colors are no longer available.</p>
                <div className="mt-4 rounded-lg bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Flown Operations</p>
                  <p className="mt-1 text-sm text-brand-600">People, products, and systems in one place.</p>
                </div>
                <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-slate-400">Text size</h3>
                <div className="mt-2 inline-flex rounded-xl border border-slate-200 p-0.5">
                  {(['small', 'default', 'large'] as const).map((size) => (
                    <button key={size} type="button" aria-pressed={draft.fontSize === size} onClick={() => update('fontSize', size)} className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize ${draft.fontSize === size ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{size}</button>
                  ))}
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  <Toggle label="Reduce motion" description="Turn off motion and milestone celebrations. Your device's reduced-motion preference is always respected." checked={draft.reduceMotion} onChange={(value) => update('reduceMotion', value)} />
                </div>
              </section>
            )}

            {section === 'notifications' && (
              <section className={`${card} divide-y divide-slate-100`}>
                <h2 className="pb-3 text-lg font-bold text-slate-900">Notifications</h2>
                <Toggle label="Notification sounds" description="Play a subtle sound when notifications arrive." checked={soundEnabled} onChange={() => toggleSound()} />
                <Toggle label="Desktop alerts" description={desktopPermission === 'denied' ? 'Your browser is blocking notifications for this site. Allow them in the browser site settings.' : 'Show a system notification for new messages and mentions while Flown Ops is in the background.'} checked={draft.desktopNotifications && desktopPermission !== 'denied'} onChange={(value) => void setDesktopAlerts(value)} />
                <Toggle label="Messages" description="Show notifications for new direct and group messages." checked={draft.notifyMessages} onChange={(value) => update('notifyMessages', value)} />
                <Toggle label="Mentions" description="Show notifications when someone mentions you." checked={draft.notifyMentions} onChange={(value) => update('notifyMentions', value)} />
                <Toggle label="Calendar" description="Show reminders and invitations from the calendar." checked={draft.notifyCalendar} onChange={(value) => update('notifyCalendar', value)} />
                <Toggle label="Announcements" description="Show workspace-wide announcements." checked={draft.notifyAnnouncements} onChange={(value) => update('notifyAnnouncements', value)} />
              </section>
            )}

            {section === 'calls' && (
              <section className={card}>
                <h2 className="text-lg font-bold text-slate-900">Calls &amp; devices</h2>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div><h3 className="text-sm font-semibold text-slate-800">Ringtone</h3><p className="text-xs text-slate-500">Choose and preview your call ringtone.</p></div>
                  <button type="button" onClick={() => sounds.previewRingTone(draft.ringtone)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"><Play className="h-3 w-3" />Preview</button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {RINGTONES.map((ringtone) => (
                    <button key={ringtone.value} type="button" aria-pressed={draft.ringtone === ringtone.value} onClick={() => update('ringtone', ringtone.value)} className={`rounded-xl border p-3 text-left ${draft.ringtone === ringtone.value ? 'border-brand-400 bg-brand-50/70 ring-1 ring-brand-300' : 'border-slate-200 hover:border-slate-300'}`}>
                      <span className="block text-xs font-semibold text-slate-800">{ringtone.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{ringtone.description}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Microphone</span>
                    <CustomSelect value={draft.microphoneDeviceId} onChange={(event) => update('microphoneDeviceId', event.target.value)} className={input}>
                      <option value="">System default</option>
                      {audioInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
                    </CustomSelect>
                  </label>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Camera</span>
                    <CustomSelect value={draft.cameraDeviceId} onChange={(event) => update('cameraDeviceId', event.target.value)} className={input}>
                      <option value="">System default</option>
                      {videoInputs.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
                    </CustomSelect>
                  </label>
                </div>
                {deviceError && <p role="alert" className="mt-3 text-xs text-brand-700">{userFacingError(deviceError)}</p>}
                <div className="mt-2 divide-y divide-slate-100">
                  <Toggle label="Show my camera preview" description="Show your own video tile during video calls." checked={draft.showCameraPreview} onChange={(value) => update('showCameraPreview', value)} />
                  <Toggle label="Noise suppression" description="Request browser noise suppression for your microphone; support varies." checked={draft.noiseSuppression} onChange={(value) => update('noiseSuppression', value)} />
                </div>
              </section>
            )}

            {section === 'ai' && (
              <section className={`${card} divide-y divide-slate-100`}>
                <h2 className="pb-1 text-lg font-bold text-slate-900">AI features</h2>
                <p className="pb-3 text-sm text-slate-500">AI runs on the organization's Azure OpenAI deployment. Content is only sent when you use an AI feature.</p>
                <Toggle label="Suggested replies" description="Show “Suggest reply” when answering customer messages." checked={draft.aiSuggestedReplies} onChange={(value) => update('aiSuggestedReplies', value)} />
              </section>
            )}

            {section === 'security' && (
              <>
                <form onSubmit={changePassword} className={card}>
                  <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-600" /><h2 className="text-lg font-bold text-slate-900">Change password</h2></div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">New password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={input} /></label>
                    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Confirm password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className={input} /></label>
                  </div>
                  <button type="submit" disabled={secBusy || !password} className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Update password</button>
                </form>
                <section className={card}>
                  <h2 className="text-lg font-bold text-slate-900">Sessions</h2>
                  <p className="mt-1 text-sm text-slate-500">Signed in as {currentUser.email}. If you used a shared or lost device, sign out everywhere else.</p>
                  <button type="button" disabled={secBusy} onClick={() => void signOutOthers()} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Sign out other devices</button>
                </section>
                {secMsg && <p role="status" className={`text-sm ${secMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{secMsg.text}</p>}
              </>
            )}

            {section === 'privacy' && (
              <section className={card}>
                <h2 className="text-lg font-bold text-slate-900">Privacy &amp; data</h2>
                <p className="mt-1 text-sm text-slate-500">Your profile and preferences are stored in your organization's Supabase project. Message and file content is governed by your organization's policies.</p>
                <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <span><span className="block text-sm font-semibold text-slate-800">Download my profile data</span><span className="mt-0.5 block text-xs text-slate-500">A JSON file with your profile details and personal settings.</span></span>
                  <button type="button" onClick={exportData} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"><Download className="h-3.5 w-3.5" />Download</button>
                </div>
              </section>
            )}

            {section === 'admin' && isAdmin && <div className="-mx-5 -mt-5 sm:-mx-8 lg:-mx-10"><AdminPage /></div>}

            {prefsSection && (
              <div className="flex items-center justify-end gap-3">
                {saveError && <p role="alert" className="mr-auto text-xs text-rose-600">{userFacingError(saveError)}</p>}
                {saved && !dirty && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" />Saved</span>}
                <button type="button" disabled={!dirty} onClick={() => setDraft(workspaceSettings)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white/60 disabled:opacity-40">Reset</button>
                <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
