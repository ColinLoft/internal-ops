import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Save, User as UserIcon, RotateCcw, Upload, Loader2 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { uploadAvatarToSupabase } from '../../lib/supabase';

export const EditProfileModal: React.FC = () => {
  const {
    currentUser,
    updateCurrentUser,
    isProfileSettingsOpen,
    setIsProfileSettingsOpen,
    resetWorkspace,
  } = useWorkspace();

  const [name, setName] = useState(currentUser.name);
  const [role, setRole] = useState(currentUser.role);
  const [department, setDepartment] = useState(currentUser.department);
  const [phone, setPhone] = useState(currentUser.phone);
  const [email, setEmail] = useState(currentUser.email);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [statusMessage, setStatusMessage] = useState(currentUser.statusMessage || '');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isProfileSettingsOpen) return;
    setName(currentUser.name);
    setRole(currentUser.role);
    setDepartment(currentUser.department);
    setPhone(currentUser.phone);
    setEmail(currentUser.email);
    setAvatar(currentUser.avatar);
    setStatusMessage(currentUser.statusMessage || '');
  }, [currentUser, isProfileSettingsOpen]);

  const presetAvatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  ];

  if (!isProfileSettingsOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploading(true);
    try {
      const publicUrl = await uploadAvatarToSupabase(file, currentUser.id);
      setAvatar(publicUrl);
    } catch (err) {
      console.warn('Avatar upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCurrentUser({
      name: name.trim() || currentUser.name,
      role: role.trim() || currentUser.role,
      department: department.trim() || currentUser.department,
      phone: phone.trim() || currentUser.phone,
      email: email.trim() || currentUser.email,
      avatar,
      statusMessage: statusMessage.trim(),
    });
    setIsProfileSettingsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2 text-slate-800">
            <UserIcon className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-base">Edit Staff Profile & Settings</h3>
          </div>
          <button
            onClick={() => setIsProfileSettingsOpen(false)}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-6">
            <div className="space-y-4">
          {/* Avatar selector with Supabase Storage File Upload */}
          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
            <div className="relative group">
              <img
                src={avatar}
                alt={name}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-brand-500 shadow-sm"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 p-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-sm transition-all"
                title="Upload Photo to Supabase"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />

            <div className="flex-1 w-full text-center sm:text-left">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Profile Photo (Supabase Storage)
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs"
                >
                  <Upload className="w-3 h-3" />
                  <span>{uploading ? 'Uploading to Supabase...' : 'Upload File'}</span>
                </button>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-1.5 mb-2">
                {presetAvatars.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAvatar(url)}
                    className={`rounded-xl overflow-hidden border-2 transition-all ${
                      avatar === url
                        ? 'border-brand-600 ring-2 ring-brand-400/30'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt="preset" className="w-7 h-7 object-cover" />
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://..."
                className="w-full px-2.5 py-1 text-xs bg-white rounded-lg border border-slate-200 outline-none focus:border-brand-500 font-mono"
              />
            </div>
          </div>

          {/* Name & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Job Role</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Department & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Status Message</label>
            <input
              type="text"
              value={statusMessage}
              maxLength={80}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="A short note teammates will see on your profile"
              className="w-full px-3 py-2 text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
            />
          </div>
            </div>

            <aside className="lg:sticky lg:top-0 self-start">
              <p className="text-xs font-semibold text-slate-500 mb-2">Profile preview</p>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="h-16 bg-gradient-to-r from-brand-600 via-indigo-600 to-sky-600" />
                <div className="px-4 pb-4">
                  <div className="relative -mt-8 mb-3 w-fit">
                    <img
                      src={avatar}
                      alt={name || 'Profile preview'}
                      className="w-16 h-16 rounded-2xl object-cover border-4 border-white shadow-sm"
                    />
                    <span className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-white ${
                      currentUser.status === 'online'
                        ? 'bg-emerald-500'
                        : currentUser.status === 'busy'
                        ? 'bg-rose-500'
                        : currentUser.status === 'away'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                    }`} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 break-words">{name || 'Your name'}</h4>
                  <p className="text-xs text-slate-600 mt-0.5">{role || 'Your role'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{department || 'Your department'}</p>
                  {statusMessage.trim() && (
                    <p className="mt-3 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 break-words">
                      {statusMessage}
                    </p>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500 break-all">
                    {email && <p>{email}</p>}
                    {phone && <p>{phone}</p>}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Reset all workspace data?')) {
                  resetWorkspace();
                }
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Data
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsProfileSettingsOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-md shadow-brand-500/25 transition-all"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
