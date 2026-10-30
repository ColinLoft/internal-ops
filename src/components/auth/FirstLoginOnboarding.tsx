import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Hash,
  ImagePlus,
  LoaderCircle,
  MessageSquare,
  UserRound,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { uploadAvatarToSupabase } from '../../lib/supabase';
import { PROFILE_BANNERS, ProfileBanner } from '../../types';

type TourStep = {
  title: string;
  description: string;
  tab?: 'messages' | 'channels' | 'calendar' | 'inbox' | 'admin';
  target: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
};

type SpotlightRect = { top: number; left: number; width: number; height: number };

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Find your channels',
    description: 'This sidebar lists your team channels. Choose a channel to open its conversation, catch up on updates, and share work with the whole team.',
    tab: 'channels',
    target: 'channel-list',
    icon: Hash,
    action: 'Show channel conversation',
  },
  {
    title: 'Join the conversation',
    description: 'Here you can read channel posts, reply, add reactions, and share files. Restricted channels show a note when posting is limited.',
    tab: 'channels',
    target: 'channel-feed',
    icon: MessageSquare,
    action: 'Explore direct messages',
  },
  {
    title: 'Message a teammate',
    description: 'Your message list keeps direct and group conversations together. Select a conversation to continue chatting, or start a new one.',
    tab: 'messages',
    target: 'conversation-list',
    icon: MessageSquare,
    action: 'Show a message',
  },
  {
    title: 'Your chat workspace',
    description: 'This is where your direct conversation appears. Send messages, share attachments, or start an audio or video call with teammates.',
    tab: 'messages',
    target: 'message-feed',
    icon: MessageSquare,
    action: 'Show the calendar',
  },
  {
    title: 'Keep up with the team',
    description: 'The calendar brings team events and your personal schedule together. Use it to see what is coming up or add an event.',
    tab: 'calendar',
    target: 'calendar-controls',
    icon: CalendarDays,
    action: 'See your profile options',
  },
  {
    title: 'Your profile and settings',
    description: 'Your profile button opens status, profile editing, and settings like themes, audio/video devices, and ringtones. Click it after the tour to explore.',
    target: 'profile-button',
    icon: UserRound,
    action: 'Finish tour',
  },
];

export const FirstLoginOnboarding: React.FC = () => {
  const {
    currentUser,
    saveCurrentProfile,
    completeOnboarding,
    setActiveTab,
  } = useWorkspace();
  const [stage, setStage] = useState<'profile' | 'tour'>('profile');
  const [tourIndex, setTourIndex] = useState(0);
  const [name, setName] = useState(currentUser.name);
  const [role, setRole] = useState(currentUser.role === 'Staff Specialist' ? '' : currentUser.role);
  const [department, setDepartment] = useState(currentUser.department === 'Operations' ? '' : currentUser.department);
  const [phone, setPhone] = useState(currentUser.phone);
  const [location, setLocation] = useState(currentUser.location || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [banner, setBanner] = useState<ProfileBanner>(currentUser.banner || 'ocean');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tourSteps = TOUR_STEPS;

  useEffect(() => {
    if (stage !== 'tour') {
      setSpotlightRect(null);
      return;
    }

    const updateSpotlight = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-onboarding-target="${tourSteps[tourIndex]?.target}"]`,
      );
      if (!target) {
        setSpotlightRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left - 6, window.innerWidth - 48));
      const top = Math.max(8, Math.min(rect.top - 6, window.innerHeight - 48));
      setSpotlightRect({
        top,
        left,
        width: Math.max(0, Math.min(rect.width + 12, window.innerWidth - left - 8)),
        height: Math.max(0, Math.min(rect.height + 12, window.innerHeight - top - 8)),
      });
    };

    const frame = window.requestAnimationFrame(updateSpotlight);
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
  }, [stage, tourIndex, tourSteps]);

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setAvatar(await uploadAvatarToSupabase(file, currentUser.id));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload your profile photo.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const saveProfileAndStartTour = async () => {
    if (!name.trim() || !role.trim() || !department.trim() || !phone.trim() || !location.trim() || !avatar) {
      setError('Please complete every profile field except the bio, including uploading a profile photo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveCurrentProfile({
        name: name.trim(),
        role: role.trim(),
        department: department.trim(),
        phone: phone.trim(),
        location: location.trim(),
        bio: bio.trim(),
        avatar,
        banner,
      });
      setStage('tour');
      setActiveTab(tourSteps[0].tab || 'channels');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const finishTour = async () => {
    setSaving(true);
    setError('');
    try {
      await completeOnboarding();
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : 'Could not finish onboarding.');
    } finally {
      setSaving(false);
    }
  };

  const moveTour = (direction: -1 | 1) => {
    const nextIndex = Math.max(0, Math.min(tourSteps.length - 1, tourIndex + direction));
    setTourIndex(nextIndex);
    const tab = tourSteps[nextIndex]?.tab;
    if (tab) setActiveTab(tab);
  };

  const activeStep = tourSteps[tourIndex];
  const TourIcon = activeStep?.icon;

  return (
    <div className={`fixed inset-0 z-[70] ${stage === 'tour' ? 'pointer-events-none' : 'flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm'}`}>
      {stage === 'tour' && (
        <>
          {!spotlightRect && <div className="absolute inset-0 bg-slate-950/55" />}
          {spotlightRect && (
            <div
              aria-hidden="true"
              className="absolute rounded-2xl border-2 border-brand-300 shadow-[0_0_0_9999px_rgba(15,23,42,0.56)] transition-all duration-300"
              style={{
                top: spotlightRect.top,
                left: spotlightRect.left,
                width: spotlightRect.width,
                height: spotlightRect.height,
              }}
            />
          )}
        </>
      )}
      <section
        aria-labelledby="onboarding-title"
        aria-modal={stage === 'profile'}
        role="dialog"
        className={`w-full overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl ${
          stage === 'profile'
            ? 'max-w-xl'
            : 'pointer-events-auto fixed bottom-4 right-4 max-h-[calc(100vh-2rem)] max-w-sm overflow-y-auto sm:bottom-6 sm:right-6'
        }`}
      >
        <div className="h-1.5 bg-gradient-to-r from-brand-500 via-brand-500 to-brand-400" />
        {stage === 'profile' ? (
          <>
            <div className="p-6 pb-4 sm:p-8 sm:pb-5">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <UserRound className="h-6 w-6" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Welcome to your workspace</p>
              <h1 id="onboarding-title" className="mt-2 text-2xl font-bold text-slate-900">Set up your profile</h1>
              <p className="mt-1 text-sm text-slate-500">Help your teammates recognize you and know what you do.</p>
            </div>

            <div className="space-y-4 px-6 pb-6 sm:px-8">
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {avatar ? (
                  <img src={avatar} alt="" className="h-16 w-16 rounded-2xl border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">Add a profile photo <span className="text-rose-500">*</span></p>
                  <p className="mt-0.5 text-xs text-slate-500">A clear photo helps teammates recognize you.</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handlePhotoChange(event)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:text-brand-800 disabled:opacity-50"
                  >
                    {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    {uploading ? 'Uploading photo…' : 'Upload photo'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <OnboardingField label="Full name" value={name} onChange={setName} required />
                <OnboardingField label="Job title" value={role} onChange={setRole} required />
                <OnboardingField label="Department" value={department} onChange={setDepartment} required />
                <OnboardingField label="Phone number" value={phone} onChange={setPhone} required />
                <OnboardingField label="Location / office" value={location} onChange={setLocation} required />
                <label className="text-xs font-semibold text-slate-600">
                  Profile banner <span className="text-rose-500">*</span>
                  <select
                    value={banner}
                    onChange={(event) => setBanner(event.target.value as ProfileBanner)}
                    required
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-brand-500"
                  >
                    {PROFILE_BANNERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                A little about you <span className="font-normal text-slate-400">(optional)</span>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="What do you work on, or what can teammates come to you for?"
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-brand-500"
                />
              </label>

              {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-8">
              <span className="text-xs text-slate-400">Profile setup · then a {tourSteps.length}-step tour</span>
              <button
                type="button"
                onClick={() => void saveProfileAndStartTour()}
                disabled={saving || uploading}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? 'Saving profile…' : 'Continue to tour'}
                {!saving && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 pb-4">
              <div className="mb-5 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Workspace tour</p>
                <span className="text-xs font-semibold text-slate-400">Step {tourIndex + 1} of {tourSteps.length}</span>
              </div>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                {TourIcon && <TourIcon className="h-7 w-7" />}
              </div>
              <h1 id="onboarding-title" className="text-2xl font-bold text-slate-900">{activeStep?.title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{activeStep?.description}</p>
            </div>

            <div className="mx-5 mb-5 grid grid-cols-6 gap-1.5">
              {tourSteps.map((step, index) => (
                <div
                  key={step.title}
                  aria-label={`Tour step ${index + 1}`}
                  className={`h-1.5 rounded-full ${index === tourIndex ? 'bg-brand-600' : index < tourIndex ? 'bg-brand-200' : 'bg-slate-100'}`}
                />
              ))}
            </div>

            {error && <p role="alert" className="mx-6 mb-4 text-xs font-semibold text-rose-700 sm:mx-8">{error}</p>}

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => tourIndex === 0 ? setStage('profile') : moveTour(-1)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              {tourIndex < tourSteps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => moveTour(1)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
                >
                  {activeStep?.action || 'Next'} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void finishTour()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving ? 'Finishing…' : 'Finish onboarding'}
                  {!saving && <Check className="h-4 w-4" />}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

const OnboardingField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}> = ({ label, value, onChange, required }) => (
  <label className="text-xs font-semibold text-slate-600">
    {label}
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      maxLength={100}
      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-brand-500"
    />
  </label>
);
