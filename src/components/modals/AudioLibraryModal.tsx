import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioTrack } from '../../types';
import { getCuratedCoverForTrack, resolveTrackCover, isDeprecatedDefaultTrack } from '../../utils/audio';
import { Search, Plus, Play, Pause, X, Music, Film, Sparkles, Volume2 } from 'lucide-react';

interface AudioLibraryModalProps {
  onSelectTrack?: (track: AudioTrack) => void;
}

export const AudioLibraryModal: React.FC<AudioLibraryModalProps> = ({ onSelectTrack }) => {
  const {
    audioTracks,
    videos,
    users,
    audioLibraryOpen,
    setAudioLibraryOpen,
    onSelectAudioCallback,
    refreshAudioTracks,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'videos' | 'music'>('all');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Refresh latest audio tracks from Supabase when modal opens
  useEffect(() => {
    if (audioLibraryOpen && refreshAudioTracks) {
      refreshAudioTracks(false);
    }
  }, [audioLibraryOpen]);

  // Stop audio preview when modal is closed
  useEffect(() => {
    if (!audioLibraryOpen && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingTrackId(null);
    }
  }, [audioLibraryOpen]);

  if (!audioLibraryOpen) return null;

  // Filter tracks by search query and category
  const activeTracksList = audioTracks.filter(track => !isDeprecatedDefaultTrack(track));

  const filteredTracks = activeTracksList.filter(track => {
    const isVideoSound = Boolean(track.sourceVideoId || track.title.toLowerCase().startsWith('original sound'));

    if (activeFilter === 'videos' && !isVideoSound) return false;
    if (activeFilter === 'music' && isVideoSound) return false;

    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase().trim();
    return (
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      (track.sourceUsername && track.sourceUsername.toLowerCase().includes(q))
    );
  });

  const handleSelect = (track: AudioTrack) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingTrackId(null);
    }

    if (onSelectTrack) {
      onSelectTrack(track);
    } else if (onSelectAudioCallback) {
      onSelectAudioCallback(track);
    }
    setAudioLibraryOpen(false);
  };

  const togglePlayTrack = (track: AudioTrack) => {
    if (!audioPlayerRef.current) return;

    if (playingTrackId === track.id) {
      audioPlayerRef.current.pause();
      setPlayingTrackId(null);
    } else {
      if (track.audioUrl) {
        audioPlayerRef.current.src = track.audioUrl;
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current
          .play()
          .then(() => {
            setPlayingTrackId(track.id);
          })
          .catch(err => {
            console.warn('Audio preview play note:', err);
            setPlayingTrackId(track.id);
          });
      } else {
        setPlayingTrackId(track.id);
      }
    }
  };

  const handleClose = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingTrackId(null);
    }
    setAudioLibraryOpen(false);
  };

  const videoSoundsCount = activeTracksList.filter(
    t => t.sourceVideoId || t.title.toLowerCase().startsWith('original sound')
  ).length;
  const musicTracksCount = activeTracksList.length - videoSoundsCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      {/* Hidden HTML5 Audio Element for Real Playback Preview */}
      <audio
        ref={audioPlayerRef}
        onEnded={() => setPlayingTrackId(null)}
        onError={() => setPlayingTrackId(null)}
      />

      <div className="absolute inset-0" onClick={handleClose} />

      {/* Sounds Modal Dialog */}
      <div className="relative w-full max-w-md bg-[#13131c] border border-[#ff007a]/40 rounded-3xl p-6 shadow-2xl z-10 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ff007a]/15 text-[#ff007a]">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-brand">Add Sound / Audio</h2>
              <p className="text-[11px] text-neutral-400">
                Choose trending music or use audio from other uploaded videos
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-full hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="relative mt-4 mb-3 flex items-center">
          <div className="absolute left-3.5 text-neutral-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            maxLength={50}
            placeholder="Search audio, creator, video sound..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value.slice(0, 50))}
            className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-9 pr-3 py-2.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-neutral-400 hover:text-white text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Tabs: All / From Videos / Trending Music */}
        <div className="flex items-center gap-1.5 pb-3">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-[#ff007a] text-white shadow-sm'
                : 'bg-[#181824] text-neutral-400 hover:text-white'
            }`}
          >
            All ({audioTracks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('videos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'videos'
                ? 'bg-[#ff007a] text-white shadow-sm'
                : 'bg-[#181824] text-neutral-400 hover:text-white'
            }`}
          >
            <Film className="w-3 h-3" />
            <span>From Other Videos ({videoSoundsCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('music')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'music'
                ? 'bg-[#ff007a] text-white shadow-sm'
                : 'bg-[#181824] text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Music Tracks ({musicTracksCount})</span>
          </button>
        </div>

        {/* Tracks List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-left">
          {filteredTracks.map(track => {
            const isPlaying = playingTrackId === track.id;
            const isVideoSource = Boolean(
              track.sourceVideoId || track.title.toLowerCase().startsWith('original sound')
            );

            // Lookup source video and creator to guarantee the profile picture of the video owner
            const sourceVid = track.sourceVideoId
              ? videos.find(v => v.id === track.sourceVideoId)
              : null;
            const ownerUser = sourceVid?.creator || users.find(u =>
              (track.sourceUsername && u.username.toLowerCase() === track.sourceUsername.toLowerCase()) ||
              (sourceVid?.creatorId && u.id === sourceVid.creatorId)
            );
            const ownerAvatar = (ownerUser?.avatar && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(ownerUser.avatar))
              ? ownerUser.avatar
              : (sourceVid?.creator?.avatar && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(sourceVid.creator.avatar))
                ? sourceVid.creator.avatar
                : (track.coverUrl && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(track.coverUrl))
                  ? track.coverUrl
                  : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(track.sourceUsername || ownerUser?.username || 'creator')}`;

            const resolvedCover = isVideoSource
              ? ownerAvatar
              : (track.coverUrl && !/\.(mp4|webm|mov|mkv|ogg|m4v|avi)($|\?)/i.test(track.coverUrl)
                  ? track.coverUrl
                  : resolveTrackCover(track));

            // Deterministic vibrant gradient for tracks without a custom cover image
            const gradients = [
              'from-[#ff007a] to-[#7928ca]',
              'from-[#0070f3] to-[#00dfd8]',
              'from-[#7928ca] to-[#ff0080]',
              'from-[#f5a623] to-[#ff007a]',
              'from-[#00dfd8] to-[#7928ca]',
              'from-[#e11d48] to-[#4f46e5]',
              'from-[#ec4899] to-[#8b5cf6]',
            ];
            const charSum = (track.title + track.artist).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
            const gradientClass = gradients[charSum % gradients.length];

            return (
              <div
                key={track.id}
                className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all group ${
                  isPlaying
                    ? 'bg-[#1e1a2c] border-[#ff007a] shadow-[0_0_15px_rgba(255,0,122,0.25)]'
                    : 'bg-[#181824] border-neutral-700/60 hover:border-[#ff007a]/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Track Cover Thumbnail + Play/Pause preview */}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md group/cover border border-neutral-700/60 bg-[#1e1b2e]">
                    <img
                      src={resolvedCover}
                      alt={track.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover/cover:scale-105"
                      onError={e => {
                        if (isVideoSource) {
                          (e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(track.sourceUsername || 'creator')}`;
                        } else {
                          const fallback = getCuratedCoverForTrack(track.title, track.artist, track.category);
                          if ((e.currentTarget as HTMLImageElement).src !== fallback) {
                            (e.currentTarget as HTMLImageElement).src = fallback;
                          }
                        }
                      }}
                    />

                    {/* Aesthetic Album Artwork Fallback (Vinyl disc + music note + category) */}
                    <div
                      className={`track-fallback-disc w-full h-full items-center justify-center bg-gradient-to-tr ${gradientClass} ${
                        resolvedCover ? 'hidden' : 'flex'
                      } relative flex-col`}
                    >
                      <div className="absolute inset-1 rounded-full border border-white/20 opacity-40 pointer-events-none" />
                      <div className="absolute inset-2.5 rounded-full border border-white/10 opacity-30 pointer-events-none" />
                      {isVideoSource ? (
                        <Film className="w-5 h-5 text-white drop-shadow-sm z-0" />
                      ) : (
                        <Music className="w-5 h-5 text-white drop-shadow-sm z-0" />
                      )}
                      <span className="text-[7.5px] font-black text-white/90 uppercase tracking-wider drop-shadow-xs z-0 mt-0.5">
                        {track.category ? track.category.slice(0, 5) : 'AUDIO'}
                      </span>
                    </div>

                    {/* Play/Pause Button Overlay (Clean hover reveal or active playing state) */}
                    <button
                      type="button"
                      onClick={() => togglePlayTrack(track)}
                      className={`absolute inset-0 flex items-center justify-center transition-all cursor-pointer z-10 ${
                        isPlaying
                          ? 'bg-[#ff007a]/70 opacity-100 ring-2 ring-[#ff007a]'
                          : 'bg-black/35 opacity-0 group-hover/cover:opacity-100 hover:bg-black/55'
                      }`}
                      title={isPlaying ? 'Pause preview' : 'Play audio preview'}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 text-white fill-white drop-shadow" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#ff007a] flex items-center justify-center shadow-md transform transition-transform group-hover/cover:scale-110">
                          <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Title & Artist & Duration */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate max-w-[190px] sm:max-w-[210px] block">
                        {track.title}
                      </span>
                      {isVideoSource && (
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-extrabold shrink-0">
                          Video Sound
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-neutral-400 truncate max-w-[200px]">
                      {track.artist}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {track.duration}
                      </span>
                      {isPlaying && (
                        <div className="flex items-center gap-1 text-[10px] text-[#ff007a] font-bold animate-pulse">
                          <Volume2 className="w-3 h-3" />
                          <span>Playing preview...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hot Pink '+' button to add track */}
                <button
                  type="button"
                  onClick={() => handleSelect(track)}
                  className="w-8 h-8 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer transform hover:scale-110 active:scale-95 ml-2"
                  title="Use this sound for video"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            );
          })}

          {filteredTracks.length === 0 && (
            <div className="text-center py-10 text-neutral-500 text-xs space-y-2">
              <Music className="w-8 h-8 mx-auto text-neutral-600 mb-1" />
              <div>
                {searchQuery
                  ? `No sounds found matching "${searchQuery}"`
                  : activeFilter === 'videos'
                  ? 'No video sounds found yet. Community videos will appear here!'
                  : 'No audio tracks available in library'}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Hint */}
        <div className="pt-3 mt-2 border-t border-neutral-800 text-[11px] text-neutral-400 text-center flex items-center justify-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-[#ff007a]" />
          <span>Tap play icon to listen, tap (+) to add sound to your upload</span>
        </div>
      </div>
    </div>
  );
};
