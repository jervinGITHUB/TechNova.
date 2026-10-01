import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioTrack } from '../../types';
import { Film, Music, X, Video as VideoIcon, CheckCircle2, RotateCcw, AlertCircle, Play } from 'lucide-react';

export const UploadView: React.FC = () => {
  const { uploadVideo, openAudioLibrary, setActiveTab } = useApp();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoFileSize, setVideoFileSize] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

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
    // Strictly validate: ONLY videos will be uploaded, not images or other files
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
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoFileName('');
    setVideoFileSize('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Sample video helper for quick testing in environments without local video files
  const handleLoadSampleVideo = () => {
    const sampleUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    setVideoPreviewUrl(sampleUrl);
    setVideoFileName('sample_blazes_highlight.mp4');
    setVideoFileSize('4.8 MB');
    setErrorMessage('');
  };

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoPreviewUrl) {
      setErrorMessage('Please upload a video file first.');
      return;
    }

    setIsPublishing(true);

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

    // If user entered tags without '#' prefix in hashtags field, auto-prefix them
    if (hashtags.trim()) {
      hashtags
        .split(/[\s,]+/)
        .filter(w => w.length > 0 && !w.startsWith('#'))
        .forEach(tag => extractedTags.push(`#${tag.trim()}`));
    }

    const finalHashtags = extractedTags;

    setTimeout(() => {
      uploadVideo({
        caption: caption.trim(),
        hashtags: finalHashtags,
        audioTrack: selectedAudio || undefined,
        mediaUrl: videoPreviewUrl,
        thumbnailUrl: videoPreviewUrl,
      });
      setIsPublishing(false);
      setIsSuccess(true);
    }, 600);
  };

  const handleResetForm = () => {
    handleRemoveVideo();
    setCaption('');
    setHashtags('');
    setSelectedAudio(null);
    setIsSuccess(false);
    setIsPublishing(false);
  };

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-2xl mx-auto w-full flex flex-col justify-center">
      <div className="text-left mb-6">
        <h2 className="text-2xl font-bold font-brand text-white">Upload Video</h2>
        <p className="text-xs text-neutral-400 mt-1">
          Share your high-definition videos with viral sounds and trending hashtags
        </p>
      </div>

      {isSuccess ? (
        <div className="bg-[#13131a] border border-neutral-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white font-brand">Video Published Successfully!</h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto mt-2 leading-relaxed">
              Your video is now live on the ViralHub explore and home feeds for viewers to discover, like, and share.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setActiveTab('home')}
              className="py-2.5 px-6 rounded-2xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white font-bold text-xs shadow-[0_0_15px_rgba(255,0,122,0.4)] transition-all cursor-pointer"
            >
              Watch on Home Feed
            </button>
            <button
              onClick={handleResetForm}
              className="py-2.5 px-5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs transition-colors cursor-pointer"
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

          {/* ================================================================= */}
          {/* STEP 1: Video Upload Zone (when no video uploaded yet)            */}
          {/* ================================================================= */}
          {!videoPreviewUrl ? (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-700 hover:border-[#ff007a] rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all bg-[#181824]/40 hover:bg-[#181824]/80 group"
            >
              {/* Only accept video files */}
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
                Drag and drop your video here
              </h4>
              <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                Only MP4, WebM, or MOV video files supported (Max 500MB)
              </p>

              <button
                type="button"
                className="mt-4 py-2 px-6 rounded-full bg-neutral-800 group-hover:bg-[#ff007a] text-white text-xs font-bold border border-neutral-600 group-hover:border-[#ff007a] transition-all pointer-events-none shadow-md"
              >
                Browse Video Files
              </button>

              {/* Sample video helper */}
              <div className="mt-4 pt-3 border-t border-neutral-800/80">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleLoadSampleVideo();
                  }}
                  className="text-[11px] text-[#ff007a] hover:underline font-semibold cursor-pointer"
                >
                  Need a video to test? Click here to load sample video
                </button>
              </div>
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
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Video File Information Bar */}
              <div className="p-3 rounded-2xl bg-[#181824] border border-neutral-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="w-8 h-8 rounded-xl bg-[#ff007a]/15 text-[#ff007a] flex items-center justify-center shrink-0">
                    <VideoIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="font-bold text-white truncate max-w-xs">
                      {videoFileName || 'Uploaded Video'}
                    </div>
                    {videoFileSize && (
                      <div className="text-[11px] text-neutral-400">
                        {videoFileSize}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Remove video"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: Proceed on Adding Caption and Hashtags                     */}
          {/* ================================================================= */}
          {videoPreviewUrl && (
            <div className="space-y-4 pt-2 border-t border-neutral-800/80 animate-fadeIn">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Caption
                </label>
                <input
                  type="text"
                  placeholder="Add caption (e.g. A phoenix doesn't fear the flames)..."
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  className="w-full bg-[#181824] text-xs sm:text-sm text-white placeholder-neutral-500 px-4 py-3 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Hashtags
                </label>
                <input
                  type="text"
                  placeholder="Add hashtags (e.g. #Phoenix #Top1Agent #Gaming #Viral)..."
                  value={hashtags}
                  onChange={e => setHashtags(e.target.value)}
                  className="w-full bg-[#181824] text-xs sm:text-sm text-white placeholder-neutral-500 px-4 py-3 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] focus:ring-1 focus:ring-[#ff007a] outline-none transition-all"
                />
              </div>

              {/* Selected Audio or Add Audio button */}
              {selectedAudio ? (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-[#1b1b26] border border-[#ff007a]/50">
                  <div className="flex items-center gap-3">
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
