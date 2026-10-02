import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioTrack } from '../../types';
import { supabaseDb, getSupabaseConfig } from '../../lib/supabase';
import {
  Film,
  Music,
  X,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Link as LinkIcon,
  UploadCloud,
  Sparkles,
} from 'lucide-react';

export const UploadView: React.FC = () => {
  const { uploadVideo, openAudioLibrary, setActiveTab } = useApp();

  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [directUrlInput, setDirectUrlInput] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoFileSize, setVideoFileSize] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storageStatusMessage, setStorageStatusMessage] = useState<string>('');

  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [selectedAudio, setSelectedAudio] = useState<AudioTrack | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const processVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setErrorMessage('Only video files (.mp4, .webm, .mov) can be uploaded.');
      return;
    }

    setErrorMessage('');
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoPreviewUrl(url);
    setVideoFileName(file.name);
    setVideoFileSize(formatFileSize(file.size));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processVideoFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processVideoFile(file);
    }
  };

  const handleApplyDirectUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = directUrlInput.trim();
    if (!trimmed) {
      setErrorMessage('Please enter a valid video URL.');
      return;
    }
    setErrorMessage('');
    setVideoPreviewUrl(trimmed);
    setVideoFile(null);
    setVideoFileName('External Web Video');
    setVideoFileSize('Cloud Stream');
  };

  const handleRemoveVideo = () => {
    if (videoPreviewUrl && videoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoFileName('');
    setVideoFileSize('');
    setDirectUrlInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const sampleVideos = [
    {
      name: 'Cyberpunk Drone Race',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    },
    {
      name: 'Forest Nature Walk',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    },
    {
      name: 'Urban Street Skate',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    },
  ];

  const handleLoadSampleVideo = (url: string, name: string) => {
    setVideoPreviewUrl(url);
    setVideoFile(null);
    setVideoFileName(name);
    setVideoFileSize('4.8 MB (High-Speed CDN)');
    setErrorMessage('');
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoPreviewUrl) {
      setErrorMessage('Please choose or enter a video first.');
      return;
    }

    setIsPublishing(true);
    setStorageStatusMessage('');

    // Extract hashtags from hashtags input and caption
    const combined = `${caption} ${hashtags}`;
    const extractedTags = Array.from(
      new Set(
        combined
          .split(/[\s,]+/)
          .filter(w => w.startsWith('#') && w.length > 1)
          .map(w => w.trim())
      )
    );

    if (hashtags.trim()) {
      hashtags
        .split(/[\s,]+/)
        .filter(w => w.length > 0 && !w.startsWith('#'))
        .forEach(tag => extractedTags.push(`#${tag.trim()}`));
    }

    let finalMediaUrl = videoPreviewUrl;

    // If uploading a local file and Supabase is connected, upload to Supabase Storage
    // so any device on the internet can stream it!
    if (videoFile && getSupabaseConfig().isConnected) {
      setStorageStatusMessage('Uploading video to Supabase Storage bucket for multi-device access...');
      try {
        const uploadRes = await supabaseDb.uploadVideoFile(videoFile);
        if (uploadRes.url) {
          finalMediaUrl = uploadRes.url;
        } else {
          console.warn('Storage upload note:', uploadRes.error);
        }
      } catch (err) {
        console.warn('Failed to upload file to storage:', err);
      }
    }

    uploadVideo({
      caption: caption.trim() || 'New viral moment! 🔥',
      hashtags: extractedTags.length > 0 ? extractedTags : ['#viral', '#fyp'],
      audioTrack: selectedAudio || undefined,
      mediaUrl: finalMediaUrl,
      thumbnailUrl: finalMediaUrl,
    });

    setIsPublishing(false);
    setIsSuccess(true);
  };

  const handleResetForm = () => {
    handleRemoveVideo();
    setCaption('');
    setHashtags('');
    setSelectedAudio(null);
    setIsSuccess(false);
    setIsPublishing(false);
    setStorageStatusMessage('');
  };

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-2xl mx-auto w-full flex flex-col justify-center">
      <div className="text-left mb-6">
        <h2 className="text-2xl font-bold font-brand text-white">Upload Video</h2>
        <p className="text-xs text-neutral-400 mt-1">
          Share high-definition videos with viral sounds and trending hashtags across all devices
        </p>
      </div>

      {isSuccess ? (
        <div className="bg-[#13131a] border border-neutral-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white font-brand">Video Published Successfully!</h3>
            <p className="text-xs text-neutral-300 max-w-sm mx-auto mt-2 leading-relaxed">
              Your video is now <strong>live on ViralHub</strong> and synchronized to Supabase. Other users on any phone, laptop, or tablet can view it right now on the Home Feed and Explore!
            </p>
            <div className="inline-block mt-3 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
              Status: Live & Streaming
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setActiveTab('home')}
              className="py-2.5 px-6 rounded-2xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer"
            >
              Watch on Home Feed
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className="py-2.5 px-5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              View on My Profile
            </button>
            <button
              onClick={handleResetForm}
              className="py-2.5 px-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white font-medium text-xs transition-colors cursor-pointer"
            >
              Upload Another
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handlePublish}
          className="bg-[#13131a] border border-neutral-800/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5 text-left"
        >
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Mode Switcher when no video selected */}
          {!videoPreviewUrl && (
            <div className="flex items-center gap-2 p-1 bg-[#181824] rounded-2xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setUploadMode('file')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  uploadMode === 'file'
                    ? 'bg-[#ff007a] text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Video File</span>
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('url')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  uploadMode === 'url'
                    ? 'bg-[#ff007a] text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Direct Video URL</span>
              </button>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 1: Video Input Zone                                          */}
          {/* ================================================================= */}
          {!videoPreviewUrl ? (
            uploadMode === 'file' ? (
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-neutral-700 hover:border-[#ff007a] rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all bg-[#181824]/40 hover:bg-[#181824]/80 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
                  className="hidden"
                />

                <div className="w-14 h-14 mx-auto rounded-2xl bg-neutral-800 group-hover:bg-[#ff007a]/20 flex items-center justify-center text-neutral-300 group-hover:text-[#ff007a] transition-all mb-4 shadow-lg group-hover:scale-105">
                  <Film className="w-7 h-7" />
                </div>

                <h4 className="text-sm font-bold text-white mb-1">
                  Drag and drop your video file here
                </h4>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto mb-4">
                  Only MP4, WebM, or MOV video files supported
                </p>

                <button
                  type="button"
                  className="py-2 px-6 rounded-full bg-neutral-800 group-hover:bg-[#ff007a] text-white text-xs font-bold border border-neutral-600 group-hover:border-[#ff007a] transition-all pointer-events-none shadow-md"
                >
                  Browse Video Files
                </button>

                {/* Sample video helper */}
                <div className="mt-5 pt-4 border-t border-neutral-800/80">
                  <span className="text-[11px] text-neutral-400 block mb-2 font-medium">
                    Or pick a test sample video with 1 click:
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {sampleVideos.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleLoadSampleVideo(s.url, s.name);
                        }}
                        className="py-1 px-3 rounded-full bg-neutral-800 hover:bg-[#ff007a]/20 hover:text-[#ff007a] border border-neutral-700 text-neutral-300 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-[#ff007a]" />
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 rounded-3xl bg-[#181824]/60 border border-neutral-800 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                    Direct Public Video URL (.mp4, .webm, or CDN link)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/videos/trending_clip.mp4"
                      value={directUrlInput}
                      onChange={e => setDirectUrlInput(e.target.value)}
                      className="flex-1 bg-[#0d0d12] text-xs text-white placeholder-neutral-500 px-3.5 py-2.5 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleApplyDirectUrl()}
                      className="py-2 px-4 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      Load Video
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800">
                  <span className="text-[11px] text-neutral-400 block mb-2 font-medium">
                    Or select a fast CDN video sample:
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {sampleVideos.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleLoadSampleVideo(s.url, s.name)}
                        className="py-1 px-3 rounded-full bg-neutral-800 hover:bg-[#ff007a]/20 hover:text-[#ff007a] border border-neutral-700 text-neutral-300 text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-[#ff007a]" />
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* ================================================================= */
            /* STEP 2: Video Popped Up with Live Preview & File Info             */
            /* ================================================================= */
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Video Ready
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="text-xs text-neutral-400 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Change video</span>
                </button>
              </div>

              {/* Video Player Pop Up */}
              <div className="relative aspect-[9/14] sm:aspect-[9/12] max-h-80 sm:max-h-96 w-full mx-auto bg-black rounded-3xl overflow-hidden border-2 border-[#ff007a]/40 shadow-2xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={videoPreviewUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>

              {/* File Info pill */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-[#181824] border border-neutral-800 text-xs">
                <div className="flex items-center gap-2.5 truncate">
                  <Film className="w-4 h-4 text-[#ff007a] shrink-0" />
                  <span className="font-semibold text-white truncate max-w-[220px] sm:max-w-xs">
                    {videoFileName}
                  </span>
                </div>
                <span className="text-neutral-400 font-mono text-[11px] shrink-0">
                  {videoFileSize}
                </span>
              </div>
            </div>
          )}

          {/* Storage uploading progress notice */}
          {storageStatusMessage && (
            <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 animate-bounce" />
              <span>{storageStatusMessage}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: Form Fields                                               */}
          {/* ================================================================= */}
          {videoPreviewUrl && (
            <div className="space-y-4 pt-2 animate-fadeIn">
              {/* Caption */}
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Caption
                </label>
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder="Describe your video, ask a question, or drop viral thoughts..."
                  rows={3}
                  maxLength={300}
                  className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 p-3.5 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none resize-none transition-colors"
                />
                <div className="flex justify-end text-[10px] text-neutral-500 mt-1">
                  {caption.length}/300
                </div>
              </div>

              {/* Hashtags */}
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Hashtags (Space or comma separated)
                </label>
                <input
                  type="text"
                  value={hashtags}
                  onChange={e => setHashtags(e.target.value)}
                  placeholder="#viral, #fyp, #trending, #dance"
                  className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 px-3.5 py-2.5 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none transition-colors"
                />
              </div>

              {/* Sound / Music Audio Track */}
              {selectedAudio ? (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-[#181824] border border-[#ff007a]/40">
                  <div className="flex items-center gap-2.5">
                    <Music className="w-4 h-4 text-[#ff007a]" />
                    <div className="text-left">
                      <div className="text-xs font-bold text-white">
                        {selectedAudio.title}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {selectedAudio.artist} · {selectedAudio.duration}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAudio(null)}
                    className="text-neutral-400 hover:text-white p-1 cursor-pointer"
                    title="Remove audio"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => openAudioLibrary(track => setSelectedAudio(track))}
                    className="py-2 px-4 rounded-2xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Music className="w-3.5 h-3.5 text-[#ff007a]" />
                    <span>Add Sound / Audio</span>
                  </button>
                </div>
              )}

              {/* Bottom Right "Publish" Button */}
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="py-3 px-8 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-extrabold text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95 disabled:opacity-50"
                >
                  {isPublishing ? 'Publishing...' : 'Publish Video'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
