import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioTrack } from '../../types';
import { supabaseDb, getSupabaseConfig } from '../../lib/supabase';
import { getCuratedCoverForTrack, resolveTrackCover } from '../../utils/audio';
import {
  Film,
  Music,
  X,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Loader2,
  Volume2,
  VolumeX,
  Sliders,
  Sparkles,
} from 'lucide-react';

export const UploadView: React.FC = () => {
  const { uploadVideo, openAudioLibrary, setActiveTab, videos, users } = useApp();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoFileSize, setVideoFileSize] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storageStatusMessage, setStorageStatusMessage] = useState<string>('');

  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [selectedAudio, setSelectedAudio] = useState<AudioTrack | null>(null);

  // Audio mix controls
  const [isRawAudioMuted, setIsRawAudioMuted] = useState(false);
  const [rawAudioVolume, setRawAudioVolume] = useState<number>(100);
  const [bgAudioVolume, setBgAudioVolume] = useState<number>(100);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);

  // Update raw audio volume on video element whenever slider/mute changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isRawAudioMuted;
      videoRef.current.volume = isRawAudioMuted ? 0 : Math.max(0, Math.min(1, rawAudioVolume / 100));
    }
  }, [isRawAudioMuted, rawAudioVolume]);

  // Update background audio volume on audio element
  useEffect(() => {
    if (bgAudioRef.current) {
      bgAudioRef.current.volume = Math.max(0, Math.min(1, bgAudioVolume / 100));
    }
  }, [bgAudioVolume]);

  // Sync background audio with video playback
  const handleVideoPlay = () => {
    if (bgAudioRef.current && selectedAudio?.audioUrl) {
      bgAudioRef.current.play().catch(() => {});
    }
  };

  const handleVideoPause = () => {
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
    }
  };

  const handleVideoTimeUpdate = () => {
    if (bgAudioRef.current && videoRef.current && bgAudioRef.current.duration) {
      const diff = Math.abs(
        bgAudioRef.current.currentTime - (videoRef.current.currentTime % bgAudioRef.current.duration)
      );
      if (diff > 0.5) {
        bgAudioRef.current.currentTime = videoRef.current.currentTime % bgAudioRef.current.duration;
      }
    }
  };

  const handleVideoSeeking = () => {
    if (bgAudioRef.current && videoRef.current && bgAudioRef.current.duration) {
      bgAudioRef.current.currentTime = videoRef.current.currentTime % bgAudioRef.current.duration;
    }
  };

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

  const handleRemoveVideo = () => {
    if (videoPreviewUrl && videoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
    }
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoFileName('');
    setVideoFileSize('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Extract a real snapshot thumbnail from the video first frame via canvas
  const captureThumbnail = (): Promise<string> => {
    return new Promise(resolve => {
      try {
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(videoRef.current.videoWidth, 480);
          canvas.height = Math.round(canvas.width * (videoRef.current.videoHeight / videoRef.current.videoWidth)) || 720;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            if (dataUrl && dataUrl.length > 50) {
              resolve(dataUrl);
              return;
            }
          }
        }

        if (videoFile) {
          const tempVideo = document.createElement('video');
          tempVideo.preload = 'metadata';
          tempVideo.muted = true;
          tempVideo.playsInline = true;
          const tempUrl = URL.createObjectURL(videoFile);
          tempVideo.src = tempUrl;
          tempVideo.onloadeddata = () => {
            tempVideo.currentTime = 0.5;
          };
          tempVideo.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 360;
              canvas.height = 640;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                URL.revokeObjectURL(tempUrl);
                resolve(dataUrl);
                return;
              }
            } catch {}
            URL.revokeObjectURL(tempUrl);
            resolve('');
          };
          tempVideo.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            resolve('');
          };
          setTimeout(() => {
            URL.revokeObjectURL(tempUrl);
            resolve('');
          }, 3000);
          return;
        }
      } catch {
        resolve('');
      }
      resolve('');
    });
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPublishing) return;
    if (!videoPreviewUrl || !videoFile) {
      setErrorMessage('Please choose a video file first.');
      return;
    }

    setIsPublishing(true);
    setStorageStatusMessage('Uploading video, please wait...');

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

    // Capture visual image thumbnail for Profile and Explore grids
    const generatedThumbnail = await captureThumbnail();

    // Upload video file directly to the cloud storage bucket
    if (getSupabaseConfig().isConnected) {
      try {
        const uploadRes = await supabaseDb.uploadVideoFile(videoFile);
        if (uploadRes.url) {
          finalMediaUrl = uploadRes.url;
        } else {
          console.warn('Storage upload note:', uploadRes.error);
        }
      } catch (err: any) {
        console.warn('Storage upload exception:', err);
      }
    }

    // If storage URL is still a local blob URL, encode file so it streams everywhere
    if (finalMediaUrl.startsWith('blob:') && videoFile.size <= 15 * 1024 * 1024) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(videoFile);
        });
        if (dataUrl) {
          finalMediaUrl = dataUrl;
        }
      } catch {
        // fallback
      }
    }

    await uploadVideo({
      caption: caption.trim() || 'New viral moment! 🔥',
      hashtags: extractedTags.length > 0 ? extractedTags : ['#viral', '#fyp'],
      audioTrack: selectedAudio || undefined,
      mediaUrl: finalMediaUrl,
      thumbnailUrl: generatedThumbnail || finalMediaUrl,
      audioVolume: bgAudioVolume,
      originalAudioMuted: isRawAudioMuted,
      originalAudioVolume: isRawAudioMuted ? 0 : rawAudioVolume,
    });

    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
    }

    setIsPublishing(false);
    setIsSuccess(true);
  };

  const handleResetForm = () => {
    handleRemoveVideo();
    setCaption('');
    setHashtags('');
    setSelectedAudio(null);
    setIsRawAudioMuted(false);
    setRawAudioVolume(100);
    setBgAudioVolume(100);
    setIsSuccess(false);
    setIsPublishing(false);
    setStorageStatusMessage('');
  };

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-2xl mx-auto w-full flex flex-col justify-center">
      {/* Hidden audio element for synchronized background sound playback during preview */}
      {selectedAudio?.audioUrl && (
        <audio
          ref={bgAudioRef}
          src={selectedAudio.audioUrl}
          loop
          preload="auto"
        />
      )}

      <div className="text-left mb-6">
        <h2 className="text-2xl font-bold font-brand text-white">Upload Video</h2>
        <p className="text-xs text-neutral-400 mt-1">
          Share high-definition videos with viral sounds, custom audio mix, and trending hashtags
        </p>
      </div>

      {isSuccess ? (
        <div className="bg-[#13131a] border border-neutral-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white font-brand">Video Uploaded Successfully!</h3>
            <p className="text-xs text-neutral-300 max-w-sm mx-auto mt-2 leading-relaxed">
              Your video has been published and is now live on the platform.
            </p>
            <div className="inline-block mt-3 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
              Status: Live & Streaming
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setActiveTab('profile')}
              className="py-2.5 px-6 rounded-2xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer"
            >
              View on My Profile
            </button>
            <button
              onClick={handleResetForm}
              className="py-2.5 px-5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Upload Another Video
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

          {/* ================================================================= */}
          {/* STEP 1: Video File Input Drop Zone                                */}
          {/* ================================================================= */}
          {!videoPreviewUrl ? (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-700 hover:border-[#ff007a] rounded-3xl p-10 sm:p-14 text-center cursor-pointer transition-all bg-[#181824]/40 hover:bg-[#181824]/80 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
                className="hidden"
              />

              <div className="w-16 h-16 mx-auto rounded-2xl bg-neutral-800 group-hover:bg-[#ff007a]/20 flex items-center justify-center text-neutral-300 group-hover:text-[#ff007a] transition-all mb-4 shadow-lg group-hover:scale-105">
                <Film className="w-8 h-8" />
              </div>

              <h4 className="text-sm font-bold text-white mb-1">
                Drag and drop your video file here
              </h4>
              <p className="text-xs text-neutral-400 max-w-xs mx-auto mb-4">
                MP4, WebM, or MOV video files supported
              </p>

              <button
                type="button"
                className="py-2.5 px-6 rounded-full bg-neutral-800 group-hover:bg-[#ff007a] text-white text-xs font-bold border border-neutral-600 group-hover:border-[#ff007a] transition-all pointer-events-none shadow-md"
              >
                Browse Video Files
              </button>
            </div>
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
                  onPlay={handleVideoPlay}
                  onPause={handleVideoPause}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onSeeking={handleVideoSeeking}
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

          {/* Upload progress banner */}
          {storageStatusMessage && (
            <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{storageStatusMessage}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: Form Fields & Audio Mix Controls                          */
          /* ================================================================= */}
          {videoPreviewUrl && (
            <div className="space-y-4 pt-2 animate-fadeIn">
              {/* Audio Controls Panel */}
              <div className="p-4 rounded-2xl bg-[#181824] border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#ff007a]" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Audio & Sound Controls
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400">
                    Mix raw video audio and added sound
                  </span>
                </div>

                {/* 1. Raw Video Audio: Mute / Volume */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsRawAudioMuted(m => !m)}
                        className={`p-1.5 rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                          isRawAudioMuted
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : 'bg-neutral-800 text-white border-neutral-700 hover:border-neutral-600'
                        }`}
                        title={isRawAudioMuted ? 'Unmute raw video audio' : 'Mute raw video audio'}
                      >
                        {isRawAudioMuted ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5" />
                            <span>Raw Audio Muted</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Mute Raw Audio</span>
                          </>
                        )}
                      </button>
                    </div>

                    <span className="text-xs font-mono text-neutral-400">
                      {isRawAudioMuted ? '0%' : `${rawAudioVolume}%`}
                    </span>
                  </div>

                  {/* Raw Audio Volume Slider */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-neutral-400 shrink-0 w-20">Video Volume:</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={isRawAudioMuted ? 0 : rawAudioVolume}
                      disabled={isRawAudioMuted}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setRawAudioVolume(val);
                        if (isRawAudioMuted && val > 0) {
                          setIsRawAudioMuted(false);
                        }
                      }}
                      className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#ff007a] disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* 2. Added Background Audio Track */}
                <div className="pt-2 border-t border-neutral-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-[#ff007a]" />
                      <span>Background Audio Track</span>
                    </span>

                    {selectedAudio && (
                      <button
                        type="button"
                        onClick={() => openAudioLibrary(track => setSelectedAudio(track))}
                        className="text-[11px] text-[#ff007a] hover:underline font-semibold cursor-pointer"
                      >
                        Change Sound
                      </button>
                    )}
                  </div>

                  {selectedAudio ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-[#12121a] border border-[#ff007a]/40 shadow-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {(() => {
                            const isVideoSound = Boolean(
                              selectedAudio.sourceVideoId || selectedAudio.title.toLowerCase().startsWith('original sound')
                            );

                            const sourceVid = selectedAudio.sourceVideoId
                              ? videos.find(v => v.id === selectedAudio.sourceVideoId)
                              : null;
                            const ownerUser = sourceVid?.creator || users.find(u =>
                              (selectedAudio.sourceUsername && u.username.toLowerCase() === selectedAudio.sourceUsername.toLowerCase()) ||
                              (sourceVid?.creatorId && u.id === sourceVid.creatorId)
                            );
                            const ownerAvatar = (ownerUser?.avatar && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(ownerUser.avatar))
                              ? ownerUser.avatar
                              : (sourceVid?.creator?.avatar && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(sourceVid.creator.avatar))
                                ? sourceVid.creator.avatar
                                : (selectedAudio.coverUrl && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(selectedAudio.coverUrl))
                                  ? selectedAudio.coverUrl
                                  : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(selectedAudio.sourceUsername || ownerUser?.username || 'creator')}`;

                            const resolvedCover = isVideoSound
                              ? ownerAvatar
                              : (selectedAudio.coverUrl && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(selectedAudio.coverUrl)
                                  ? selectedAudio.coverUrl
                                  : resolveTrackCover(selectedAudio));

                            return (
                              <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-br from-[#ff007a]/30 to-[#7928ca]/30 flex items-center justify-center shrink-0 border border-neutral-700/60 shadow-sm">
                                <img
                                  src={resolvedCover}
                                  alt={selectedAudio.title}
                                  className="w-full h-full object-cover"
                                  onError={e => {
                                    if (isVideoSound) {
                                      (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(selectedAudio.sourceUsername || 'creator')}`;
                                    } else {
                                      const fb = getCuratedCoverForTrack(selectedAudio.title, selectedAudio.artist, selectedAudio.category);
                                      if ((e.currentTarget as HTMLImageElement).src !== fb) {
                                        (e.currentTarget as HTMLImageElement).src = fb;
                                      }
                                    }
                                  }}
                                />
                              </div>
                            );
                          })()}
                          <div className="text-left min-w-0">
                            <div className="text-xs font-bold text-white truncate max-w-[190px] sm:max-w-xs">
                              {selectedAudio.title}
                            </div>
                            <div className="text-[11px] text-neutral-400 truncate max-w-[190px] sm:max-w-xs">
                              {selectedAudio.artist} · {selectedAudio.duration}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (bgAudioRef.current) bgAudioRef.current.pause();
                            setSelectedAudio(null);
                          }}
                          className="text-neutral-400 hover:text-white p-1.5 rounded-full hover:bg-neutral-800 cursor-pointer"
                          title="Remove sound"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Added Sound Volume Slider */}
                      <div className="flex items-center gap-3 px-1 pt-1">
                        <span className="text-[11px] text-neutral-400 shrink-0 w-20">Sound Volume:</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={bgAudioVolume}
                          onChange={e => setBgAudioVolume(parseInt(e.target.value, 10) || 0)}
                          className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
                        />
                        <span className="text-xs font-mono text-neutral-400 shrink-0 w-9 text-right">
                          {bgAudioVolume}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => openAudioLibrary(track => setSelectedAudio(track))}
                        className="py-2.5 px-4 rounded-2xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-sm"
                      >
                        <Music className="w-4 h-4 text-[#ff007a]" />
                        <span>Add Sound / Audio</span>
                        <span className="text-[10px] text-neutral-400 font-normal">
                          (Browse songs & other videos' audio)
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

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

              {/* Publish Button */}
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="py-3 px-8 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-extrabold text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {isPublishing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isPublishing ? 'Uploading...' : 'Publish Video'}</span>
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
