import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioTrack, User } from '../../types';
import { supabaseDb, getSupabaseConfig } from '../../lib/supabase';
import { getCuratedCoverForTrack, resolveTrackCover } from '../../utils/audio';
import { AudioWaveformTrimmer, parseTrackDuration } from './AudioWaveformTrimmer';
import { MentionAutocomplete } from '../common/MentionAutocomplete';
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
  Globe,
  Users,
  Lock,
  AtSign,
} from 'lucide-react';

export const UploadView: React.FC = () => {
  const {
    uploadVideo,
    openAudioLibrary,
    setActiveTab,
    videos,
    users,
    currentUser,
    getFollowStatus,
    isTargetFollowingMe,
  } = useApp();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoFileSize, setVideoFileSize] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storageStatusMessage, setStorageStatusMessage] = useState<string>('');

  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [audience, setAudience] = useState<'public' | 'friends' | 'only_me'>('public');
  const [selectedAudio, setSelectedAudio] = useState<AudioTrack | null>(null);

  // Audio trim / gap selection state
  const [audioTrimStart, setAudioTrimStart] = useState<number>(0);
  const [audioTrimEnd, setAudioTrimEnd] = useState<number>(30);

  // Audio mix controls
  const [isRawAudioMuted, setIsRawAudioMuted] = useState(false);
  const [rawAudioVolume, setRawAudioVolume] = useState<number>(100);
  const [bgAudioVolume, setBgAudioVolume] = useState<number>(100);

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);

  const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, 250);
    setCaption(val);

    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9._]*)$/);

    if (match) {
      const q = match[1];
      const atIndex = textBeforeCursor.lastIndexOf('@');
      setMentionQuery(q);
      setMentionStartIndex(atIndex);
    } else {
      setMentionQuery(null);
      setMentionStartIndex(-1);
    }
  };

  const handleSelectMentionUser = (user: User) => {
    if (mentionStartIndex < 0) return;
    const beforeAt = caption.slice(0, mentionStartIndex);
    const cursorPos = captionRef.current?.selectionStart || caption.length;
    const afterCursor = caption.slice(cursorPos);
    const inserted = `@${user.username} `;
    const newCaption = `${beforeAt}${inserted}${afterCursor}`.slice(0, 250);
    setCaption(newCaption);
    setMentionQuery(null);
    setMentionStartIndex(-1);
    setTimeout(() => {
      if (captionRef.current) {
        captionRef.current.focus();
        const nextPos = Math.min(newCaption.length, beforeAt.length + inserted.length);
        captionRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 50);
  };

  const handleSelectAudioTrack = (track: AudioTrack) => {
    setSelectedAudio(track);
    const parsedDur = parseTrackDuration(track.duration);
    setAudioTrimStart(0);
    setAudioTrimEnd(Math.min(30, parsedDur));
  };

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

  // Sync background audio with video playback using trimmed audio gap
  const handleVideoPlay = () => {
    if (bgAudioRef.current && selectedAudio?.audioUrl) {
      bgAudioRef.current.currentTime = audioTrimStart;
      bgAudioRef.current.play().catch(() => {});
    }
  };

  const handleVideoPause = () => {
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
    }
  };

  const handleVideoTimeUpdate = () => {
    if (bgAudioRef.current && videoRef.current && selectedAudio?.audioUrl) {
      const trimLen = Math.max(1, audioTrimEnd - audioTrimStart);
      const targetPos = audioTrimStart + (videoRef.current.currentTime % trimLen);
      const diff = Math.abs(bgAudioRef.current.currentTime - targetPos);
      if (diff > 0.5) {
        bgAudioRef.current.currentTime = targetPos;
      }
    }
  };

  const handleVideoSeeking = () => {
    if (bgAudioRef.current && videoRef.current && selectedAudio?.audioUrl) {
      const trimLen = Math.max(1, audioTrimEnd - audioTrimStart);
      bgAudioRef.current.currentTime = audioTrimStart + (videoRef.current.currentTime % trimLen);
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

  // Generate a high-energy branded fallback poster if video frame capture cannot be extracted
  const createFallbackPoster = (title?: string): string => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 360, 640);
        grad.addColorStop(0, '#22112d');
        grad.addColorStop(0.5, '#13131c');
        grad.addColorStop(1, '#09090e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 360, 640);

        // Neon ambient glow
        ctx.beginPath();
        ctx.arc(180, 260, 56, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 122, 0.25)';
        ctx.fill();

        // Play triangle icon
        ctx.beginPath();
        ctx.moveTo(170, 240);
        ctx.lineTo(198, 260);
        ctx.lineTo(170, 280);
        ctx.closePath();
        ctx.fillStyle = '#ff007a';
        ctx.fill();

        // Text branding
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ViralHub', 180, 350);

        if (title) {
          ctx.fillStyle = '#d4d4d8';
          ctx.font = '14px system-ui, -apple-system, sans-serif';
          const cleanTitle = title.length > 28 ? title.slice(0, 28) + '...' : title;
          ctx.fillText(cleanTitle, 180, 385);
        }

        return canvas.toDataURL('image/jpeg', 0.85);
      }
    } catch {}
    return '';
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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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

          let resolved = false;
          const finish = (result: string) => {
            if (resolved) return;
            resolved = true;
            try { URL.revokeObjectURL(tempUrl); } catch {}
            resolve(result || createFallbackPoster(caption));
          };

          tempVideo.onloadeddata = () => {
            tempVideo.currentTime = 0.2;
          };
          tempVideo.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 360;
              canvas.height = 640;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                if (dataUrl && dataUrl.length > 50) {
                  finish(dataUrl);
                  return;
                }
              }
            } catch {}
            finish(createFallbackPoster(caption));
          };
          tempVideo.onerror = () => {
            finish(createFallbackPoster(caption));
          };
          setTimeout(() => {
            finish(createFallbackPoster(caption));
          }, 3500);
          return;
        }
      } catch {
        resolve(createFallbackPoster(caption));
      }
      resolve(createFallbackPoster(caption));
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

    // Extract hashtags from hashtags input and caption (strictly limited to 5 hashtags)
    const rawTagList = hashtags
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(t => (t.startsWith('#') ? t : `#${t}`).trim());

    const captionTags = (caption.match(/#[a-zA-Z0-9_]+/g) || []).map(t => t.trim());
    const extractedTags = Array.from(new Set([...rawTagList, ...captionTags])).slice(0, 5);

    let finalMediaUrl = videoPreviewUrl;

    // Capture visual image thumbnail for Profile and Explore grids
    const generatedThumbnail = await captureThumbnail();
    let finalThumbnailUrl = generatedThumbnail || finalMediaUrl;

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

      // Upload generated image thumbnail to storage so all devices render it instantly
      if (generatedThumbnail && generatedThumbnail.startsWith('data:image/')) {
        try {
          const thumbRes = await supabaseDb.uploadThumbnailImage(generatedThumbnail);
          if (thumbRes.url) {
            finalThumbnailUrl = thumbRes.url;
          }
        } catch (err: any) {
          console.warn('Thumbnail storage upload note:', err);
        }
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
      audience,
      audioTrack: selectedAudio
        ? {
            ...selectedAudio,
            trimStart: audioTrimStart,
            trimEnd: audioTrimEnd,
          }
        : undefined,
      mediaUrl: finalMediaUrl,
      thumbnailUrl: finalThumbnailUrl,
      audioVolume: bgAudioVolume,
      originalAudioMuted: isRawAudioMuted,
      originalAudioVolume: isRawAudioMuted ? 0 : rawAudioVolume,
      audioStartTime: selectedAudio ? audioTrimStart : undefined,
      audioEndTime: selectedAudio ? audioTrimEnd : undefined,
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
    setAudience('public');
    setSelectedAudio(null);
    setAudioTrimStart(0);
    setAudioTrimEnd(30);
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
          preload="auto"
          onTimeUpdate={() => {
            if (bgAudioRef.current && audioTrimEnd > audioTrimStart) {
              if (bgAudioRef.current.currentTime >= audioTrimEnd) {
                bgAudioRef.current.currentTime = audioTrimStart;
              }
            }
          }}
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
                        onClick={() => openAudioLibrary(track => handleSelectAudioTrack(track))}
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

                      {/* Sound Volume Slider */}
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

                      {/* Interactive Soundwave Trimmer & Gap Adjuster */}
                      <AudioWaveformTrimmer
                        track={selectedAudio}
                        startTime={audioTrimStart}
                        endTime={audioTrimEnd}
                        onChangeRange={(newStart, newEnd) => {
                          setAudioTrimStart(newStart);
                          setAudioTrimEnd(newEnd);
                          if (bgAudioRef.current) {
                            bgAudioRef.current.currentTime = newStart;
                          }
                        }}
                        audioVolume={bgAudioVolume}
                      />
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => openAudioLibrary(track => handleSelectAudioTrack(track))}
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

              {/* Caption with @ Mention autocomplete */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-neutral-300">
                      Caption
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const newCaption = caption.endsWith(' ') || caption === '' ? `${caption}@` : `${caption} @`;
                        if (newCaption.length <= 250) {
                          setCaption(newCaption);
                          setMentionQuery('');
                          setMentionStartIndex(newCaption.lastIndexOf('@'));
                          setTimeout(() => {
                            if (captionRef.current) {
                              captionRef.current.focus();
                              captionRef.current.setSelectionRange(newCaption.length, newCaption.length);
                            }
                          }, 50);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#ff007a]/15 hover:bg-[#ff007a]/25 text-[#ff007a] border border-[#ff007a]/30 text-[11px] font-bold transition-all cursor-pointer"
                      title="Mention a friend or creator using @"
                    >
                      <AtSign className="w-3 h-3" />
                      <span>Tag / Mention</span>
                    </button>
                  </div>
                  <span className={`text-[10px] ${caption.length >= 250 ? 'text-pink-400 font-bold' : 'text-neutral-500'}`}>
                    {caption.length}/250
                  </span>
                </div>
                <textarea
                  ref={captionRef}
                  value={caption}
                  onChange={handleCaptionChange}
                  placeholder="Describe your video, tag friends using @, ask questions..."
                  rows={3}
                  maxLength={250}
                  className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 p-3.5 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none resize-none transition-colors"
                />

                {/* Floating Mention Autocomplete Suggestion Dropdown */}
                {mentionQuery !== null && (
                  <MentionAutocomplete
                    query={mentionQuery}
                    users={users}
                    currentUser={currentUser}
                    getFollowStatus={getFollowStatus}
                    isTargetFollowingMe={isTargetFollowingMe}
                    onSelect={handleSelectMentionUser}
                    onClose={() => {
                      setMentionQuery(null);
                      setMentionStartIndex(-1);
                    }}
                    positionClassName="top-full mt-1.5"
                  />
                )}
              </div>

              {/* Hashtags */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-neutral-300">
                    Hashtags <span className="text-[10px] text-neutral-400 font-normal">(Max 5 hashtags, 50 chars)</span>
                  </label>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className={
                      (hashtags.split(/[\s,]+/).filter(Boolean).length >= 5) ? 'text-pink-400 font-bold' : 'text-neutral-400'
                    }>
                      {Math.min(5, hashtags.split(/[\s,]+/).filter(Boolean).length)}/5 tags
                    </span>
                    <span className={hashtags.length >= 50 ? 'text-pink-400 font-bold' : 'text-neutral-500'}>
                      {hashtags.length}/50
                    </span>
                  </div>
                </div>
                <input
                  type="text"
                  maxLength={50}
                  value={hashtags}
                  onChange={e => {
                    const val = e.target.value.slice(0, 50);
                    const tags = val.split(/[\s,]+/).filter(Boolean);
                    if (tags.length > 5) {
                      setHashtags(tags.slice(0, 5).join(' '));
                    } else {
                      setHashtags(val);
                    }
                  }}
                  placeholder="#viral #fyp #trending #dance #music"
                  className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 px-3.5 py-2.5 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none transition-colors"
                />
              </div>

              {/* Audience / Privacy Settings */}
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-2">
                  Who can watch this video?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Public */}
                  <button
                    type="button"
                    onClick={() => setAudience('public')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      audience === 'public'
                        ? 'bg-[#ff007a]/15 border-[#ff007a] text-white shadow-[0_0_15px_rgba(255,0,122,0.25)] ring-1 ring-[#ff007a]'
                        : 'bg-[#181824] border-neutral-700/80 text-neutral-400 hover:text-white hover:bg-[#202030]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Globe className="w-3.5 h-3.5 text-cyan-400" />
                      <span className={audience === 'public' ? 'text-white' : 'text-neutral-300'}>Public</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 leading-tight">
                      Anyone on ViralHub can watch and discover
                    </span>
                  </button>

                  {/* Friends Only */}
                  <button
                    type="button"
                    onClick={() => setAudience('friends')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      audience === 'friends'
                        ? 'bg-[#ff007a]/15 border-[#ff007a] text-white shadow-[0_0_15px_rgba(255,0,122,0.25)] ring-1 ring-[#ff007a]'
                        : 'bg-[#181824] border-neutral-700/80 text-neutral-400 hover:text-white hover:bg-[#202030]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      <span className={audience === 'friends' ? 'text-white' : 'text-neutral-300'}>Friends Only</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 leading-tight">
                      Only mutual followers can view
                    </span>
                  </button>

                  {/* Only me */}
                  <button
                    type="button"
                    onClick={() => setAudience('only_me')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      audience === 'only_me'
                        ? 'bg-[#ff007a]/15 border-[#ff007a] text-white shadow-[0_0_15px_rgba(255,0,122,0.25)] ring-1 ring-[#ff007a]'
                        : 'bg-[#181824] border-neutral-700/80 text-neutral-400 hover:text-white hover:bg-[#202030]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span className={audience === 'only_me' ? 'text-white' : 'text-neutral-300'}>Only me</span>
                    </div>
                    <span className="text-[10px] text-neutral-400 leading-tight">
                      Private to you in your "Only me" profile tab
                    </span>
                  </button>
                </div>
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
