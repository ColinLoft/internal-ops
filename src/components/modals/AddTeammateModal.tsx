import React, { useState, useRef } from 'react';
import { X, UserPlus, Camera, Upload } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { UserRole, User } from '../../types';
import { uploadAvatarToSupabase } from '../../lib/supabase';

export const AddTeammateModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { addTeammate } = useWorkspace();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('Outreach & Community');
  const [phone, setPhone] = useState('');
  const [systemRole, setSystemRole] = useState<UserRole>('member');
  const [avatar, setAvatar] = useState(
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const presetAvatars = [
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  ];

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploadingImage(true);
    try {
      const publicUrl = await uploadAvatarToSupabase(file, `temp-${Date.now()}`);
      setAvatar(publicUrl);
    } catch (err) {
      console.warn('Avatar upload error:', err);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || submitting) return;
    setError('');
    setSubmitting(true);

    const newStaff: User = {
      id: '',
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role.trim() || 'Staff Specialist',
      department: department.trim() || 'Operations',
      phone: phone.trim() || '+1 (415) 555-0199',
      status: 'offline',
      systemRole,
      avatar,
      statusMessage: 'New staff member',
    };

    try {
      await addTeammate(newStaff);
      onClose();
      setName('');
      setEmail('');
      setRole('');
      setPhone('');
      setSystemRole('member');
    } catch (inviteError) {
      setError((inviteError as Error).message || 'Unable to send the invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Register Staff Member</h3>
              <p className="text-xs text-slate-500 font-medium">Send a secure Supabase Auth invitation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Profile Picture Upload & Picker */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Profile Picture</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-slate-200"
              >
                <Upload className="w-3 h-3" />
                <span>{uploadingImage ? 'Uploading...' : 'Upload Image'}</span>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />

            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={avatar}
                  alt="avatar"
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-brand-500 shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 p-1 bg-brand-600 text-white rounded-full shadow-xs"
                  title="Upload from computer"
                >
                  <Camera className="w-2.5 h-2.5" />
                </button>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  {presetAvatars.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAvatar(url)}
                      className={`rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                        avatar === url
                          ? 'border-brand-600 ring-2 ring-brand-400/30'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="preset" className="w-6 h-6 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Name & Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan Lee"
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@beaconwork.org"
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Role & Department */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Role / Title
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Outreach Specialist"
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Field Services"
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Phone Number
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (415) 555-0199"
              className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 outline-none transition-all"
            />
          </div>

          <p className="text-xs text-slate-500">The employee will receive an email invitation and set their password through Supabase.</p>

          {/* System Role */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Permissions Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSystemRole('member')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  systemRole === 'member'
                    ? 'border-brand-500 bg-brand-50/70 font-bold text-brand-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="text-xs">Staff Member</div>
                <div className="text-[10px] text-slate-400 font-normal">Standard access</div>
              </button>
              <button
                type="button"
                onClick={() => setSystemRole('coordinator')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  systemRole === 'coordinator'
                    ? 'border-brand-500 bg-brand-50/70 font-bold text-brand-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="text-xs">Coordinator</div>
                <div className="text-[10px] text-slate-400 font-normal">Can broadcast</div>
              </button>
              <button
                type="button"
                onClick={() => setSystemRole('admin')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  systemRole === 'admin'
                    ? 'border-brand-500 bg-brand-50/70 font-bold text-brand-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="text-xs">Admin</div>
                <div className="text-[10px] text-slate-400 font-normal">Full control</div>
              </button>
            </div>
          </div>

          {/* Submit */}
          {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-md shadow-brand-500/25 transition-all disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>{submitting ? 'Sending...' : 'Send Invitation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
