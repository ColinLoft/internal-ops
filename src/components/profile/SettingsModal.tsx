import React, { useEffect, useState } from 'react';
import { Loader2, Monitor, Palette, Play, Save, Settings, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { RINGTONES, WorkspaceSettings } from '../../types';
import { sounds } from '../../lib/sound';

export const SettingsModal: React.FC = () => {
  const {
    isWorkspaceSettingsOpen,
    setIsWorkspaceSettingsOpen,
    workspaceSettings,
    saveWorkspaceSettings,
  } = useWorkspace();

  const [draft, setDraft] = useState<WorkspaceSettings>(workspaceSettings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceError, setDeviceError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isWorkspaceSettingsOpen) return;
    setDraft(workspaceSettings);
    setSaveError('');
    setDeviceError('');
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceError('This browser does not support selecting audio and video devices.');
      return;
    }

    navigator.mediaDevices.enumerateDevices()
      .then(setDevices)
      .catch((error: unknown) => {
        setDeviceError(error instanceof Error ? error.message : 'Unable to list available devices.');
      });
  }, [isWorkspaceSettingsOpen, workspaceSettings]);

  if (!isWorkspaceSettingsOpen) return null;

  const update = <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await saveWorkspaceSettings(draft);
      setIsWorkspaceSettingsOpen(false);
    } catch (error) {
      const saveFailure = error as Error & { code?: string };
      if (
        saveFailure.code === 'PGRST204'
        || saveFailure.code === '42703'
        || saveFailure.message?.toLowerCase().includes('preferences')
      ) {
        setSaveError('Your Supabase profiles table is missing the preferences column. Run the latest supabase_schema.sql in the Supabase SQL Editor, then try saving again.');
      } else {
        setSaveError(saveFailure.message || 'Unable to save settings.');
      }
    } finally {
      setSaving(false);
    }
  };

  const audioInputs = devices.filter((device) => device.kind === 'audioinput');
  const videoInputs = devices.filter((device) => device.kind === 'videoinput');
  const Toggle = ({ label, description, checked, onChange }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2 text-slate-800">
            <Settings className="w-5 h-5 text-brand-600" />
            <div>
              <h3 className="font-bold text-base">Settings</h3>
              <p className="text-xs text-slate-500">Personal appearance, availability, and call preferences</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsWorkspaceSettingsOpen(false)}
            aria-label="Close settings"
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-brand-600" />
              <h4 className="text-sm font-bold text-slate-900">Appearance</h4>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Theme</span>
                <select
                  value={draft.theme}
                  onChange={(event) => update('theme', event.target.value as WorkspaceSettings['theme'])}
                  className="w-full px-3 py-2 text-sm bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-brand-500"
                >
                  <option value="dark">Dark (default)</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Custom accent color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.accentColor}
                    onChange={(event) => update('accentColor', event.target.value)}
                    aria-label="Choose accent color"
                    className="h-10 w-12 p-1 bg-white rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-500">{draft.accentColor.toUpperCase()}</span>
                </div>
              </label>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Accent color applies to buttons and highlights. Dark blue is the default.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4 divide-y divide-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Monitor className="w-4 h-4 text-brand-600" />
              <h4 className="text-sm font-bold text-slate-900">Automatic availability</h4>
            </div>
            <Toggle
              label="Busy while in a call"
              description="Switch to Busy during an active workspace call, then restore your previous status."
              checked={draft.autoBusyInCalls}
              onChange={(value) => update('autoBusyInCalls', value)}
            />
            <Toggle
              label="Busy during calendar events"
              description="Switch to Busy during events scheduled for today, then restore your previous status."
              checked={draft.autoBusyDuringEvents}
              onChange={(value) => update('autoBusyDuringEvents', value)}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <h4 className="text-sm font-bold text-slate-900">Audio & video</h4>
            <p className="text-xs text-slate-500 mt-1 mb-4">Choose devices for in-app calls. Device availability depends on browser permissions.</p>
            <div className="mb-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <h5 className="text-xs font-semibold text-slate-700">Ringtone</h5>
                  <p className="text-[11px] text-slate-500 mt-0.5">Choose and preview your call ringtone.</p>
                </div>
                <button
                  type="button"
                  onClick={() => sounds.previewRingTone(draft.ringtone)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Preview
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {RINGTONES.map((ringtone) => (
                  <button
                    key={ringtone.value}
                    type="button"
                    onClick={() => update('ringtone', ringtone.value)}
                    aria-pressed={draft.ringtone === ringtone.value}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      draft.ringtone === ringtone.value
                        ? 'border-brand-400 bg-brand-50/70 ring-1 ring-brand-300'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-xs font-semibold text-slate-800">{ringtone.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">{ringtone.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Microphone</span>
                <select
                  value={draft.microphoneDeviceId}
                  onChange={(event) => update('microphoneDeviceId', event.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-brand-500"
                >
                  <option value="">System default</option>
                  {audioInputs.map((device, index) => (
                    <option key={device.deviceId || index} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 mb-1.5">Camera</span>
                <select
                  value={draft.cameraDeviceId}
                  onChange={(event) => update('cameraDeviceId', event.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-brand-500"
                >
                  <option value="">System default</option>
                  {videoInputs.map((device, index) => (
                    <option key={device.deviceId || index} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {deviceError && <p role="alert" className="text-xs text-amber-700 mt-3">{deviceError}</p>}
            <div className="mt-2 divide-y divide-slate-100">
              <Toggle
                label="Show my camera preview"
                description="Show or hide your own video tile during video calls."
                checked={draft.showCameraPreview}
                onChange={(value) => update('showCameraPreview', value)}
              />
              <Toggle
                label="Noise suppression"
                description="Request browser noise suppression when capturing microphone audio; support varies by browser."
                checked={draft.noiseSuppression}
                onChange={(value) => update('noiseSuppression', value)}
              />
            </div>
          </section>

          {saveError && <p role="alert" className="text-xs text-rose-600">{saveError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsWorkspaceSettingsOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
