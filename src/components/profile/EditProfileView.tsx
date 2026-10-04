import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Camera, Check, ArrowLeft, Info, Loader2, AlertCircle } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { supabaseDb } from '../../lib/supabase';

export const EditProfileView: React.FC = () => {
  const { currentUser, updateUserProfile, setActiveTab } = useApp();

  const [username, setUsername] = useState(currentUser?.username || '');
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [isPrivate, setIsPrivate] = useState<boolean>(currentUser?.isPrivate || false);
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setUploadError('Please select a valid image file (JPEG, PNG, or WebP).');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('Image size exceeds 10MB limit.');
        return;
      }
      setUploadError('');
      setSelectedFile(file);
      setAvatarUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError('');
    setIsUploading(true);

    try {
      let finalAvatarUrl = currentUser?.avatar || '';

      // If user selected a new image file, upload directly to Supabase Storage "profile picture" bucket!
      if (selectedFile) {
        const { url, error } = await supabaseDb.uploadProfilePicture(selectedFile, currentUser?.id);
        if (url) {
          finalAvatarUrl = url;
          setAvatarUrl(url);
        } else {
          setUploadError(
            error || 'Failed to upload image to Supabase Storage. Please check bucket policies.'
          );
          setIsUploading(false);
          return;
        }
      } else if (avatarUrl && !avatarUrl.startsWith('blob:')) {
        finalAvatarUrl = avatarUrl;
      }

      await updateUserProfile({
        username: username.trim(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        isPrivate: isPrivate,
        avatar: finalAvatarUrl,
      });

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        setActiveTab('profile');
      }, 1200);
    } catch (err: any) {
      setUploadError(err?.message || 'Could not save profile changes.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-2xl mx-auto w-full text-left">
      {/* Top back button */}
      <button
        onClick={() => setActiveTab('profile')}
        className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 mb-4 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Profile</span>
      </button>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold font-brand text-white">Edit Profile</h2>
        <p className="text-xs text-neutral-400 mt-1">
          Update your public profile and avatar. Photos are stored in your Supabase storage bucket.
        </p>
      </div>

      {uploadError && (
        <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{uploadError}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Avatar Upload with Overlay */}
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="relative group cursor-pointer w-28 h-28 rounded-full overflow-hidden shadow-xl border-2 border-neutral-700 bg-neutral-900">
            <Avatar
              src={avatarUrl || currentUser?.avatar}
              alt="Profile"
              size="xl"
              className="w-full h-full object-cover"
            />

            {/* Loading spinner overlay during upload */}
            {isUploading && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white text-[11px] font-semibold">
                <Loader2 className="w-6 h-6 animate-spin text-[#ff007a] mb-1" />
                <span>Uploading...</span>
              </div>
            )}

            {/* Upload Hover label */}
            {!isUploading && (
              <label className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-white text-[11px] font-semibold opacity-85 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="w-5 h-5 mb-0.5" />
                <span>{selectedFile ? 'Change' : 'Upload'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  onChange={handleAvatarChange}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            )}
          </div>
          <span className="text-[11px] text-neutral-400">
            {selectedFile ? `Selected: ${selectedFile.name}` : 'Click to select photo (JPEG, PNG, WebP)'}
          </span>
        </div>

        {/* Username */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-white block">Username</label>
          <div className="flex items-center gap-1 text-[11px] text-cyan-400 pb-1">
            <Info className="w-3.5 h-3.5" />
            <span>You can change your username once every 30 days.</span>
          </div>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full bg-[#181824] text-xs sm:text-sm text-white px-4 py-3 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
            required
            disabled={isUploading}
          />
        </div>

        {/* Display Name */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-white block">Display Name</label>
          <div className="flex items-center gap-1 text-[11px] text-cyan-400 pb-1">
            <Info className="w-3.5 h-3.5" />
            <span>You can change your display name once every 7 days.</span>
          </div>
          <input
            type="text"
            placeholder="Display name"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="w-full bg-[#181824] text-xs sm:text-sm text-white px-4 py-3 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
            required
            disabled={isUploading}
          />
        </div>

        {/* Bio */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-white block">Bio</label>
          <div className="flex items-center gap-1 text-[11px] text-cyan-400 pb-1">
            <Info className="w-3.5 h-3.5" />
            <span>Write a short description about who you are or anything.</span>
          </div>
          <textarea
            rows={4}
            placeholder="Write a bio..."
            value={bio}
            onChange={e => setBio(e.target.value)}
            className="w-full bg-[#181824] text-xs sm:text-sm text-white p-4 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none resize-none leading-relaxed"
            disabled={isUploading}
          />
        </div>

        {/* Privacy Setting */}
        <div className="pt-2 border-t border-neutral-800 space-y-3">
          <label className="text-xs font-bold text-white block">Privacy Setting</label>
          <p className="text-xs text-neutral-400">
            With a private account, only users you approve can follow you and watch your videos.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-neutral-300 font-semibold">Select Privacy :</span>

            {/* Toggle buttons: [Private] [Public] */}
            <div className="inline-flex rounded-xl bg-[#181824] p-1 border border-neutral-700">
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                disabled={isUploading}
                className={`py-1.5 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isPrivate
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Private
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                disabled={isUploading}
                className={`py-1.5 px-4 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  !isPrivate
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Public
              </button>
            </div>
          </div>
        </div>

        {/* Save Changes Button */}
        <div className="pt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={isUploading}
            className="py-3 px-8 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-extrabold text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {isUploading
                ? 'Uploading to Supabase...'
                : savedSuccess
                ? 'Saved Successfully!'
                : 'Save Changes'}
            </span>
          </button>

          {savedSuccess && (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <Check className="w-4 h-4" />
              <span>Profile updated</span>
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
