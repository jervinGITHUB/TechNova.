import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioTrack } from '../../types';
import { Search, Plus, Play, Pause, X, Music, Film, Sparkles, Volume2 } from 'lucide-react';

interface AudioLibraryModalProps {
  onSelectTrack?: (track: AudioTrack) => void;
}

export const AudioLibraryModal: React.FC<AudioLibraryModalProps> = ({ onSelectTrack }) => {
  const {
    audioTracks,
    audioLibraryOpen,
    setAudioLibraryOpen,
    onSelectAudioCallback,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'videos' | 'music'>('all');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio preview when modal is closed
  useEffect(() => {
    if (!audioLibraryOpen && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingTrackId(null);
    }
  }, [audioLibraryOpen]);

  if (!audioLibraryOpen) return null;

  // Filter tracks by search query and category
  const filteredTracks = audioTracks.filter(track => {
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

  const videoSoundsCount = audioTracks.filter(
    t => t.sourceVideoId || t.title.toLowerCase().startsWith('original sound')
  ).length;
  const musicTracksCount = audioTracks.length - videoSoundsCount;

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
            placeholder="Search audio, creator, video sound..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
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
            const isVideoSource = Boolean(track.sourceVideoId || track.title.toLowerCase().startsWith('original sound'));

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
                  {/* Track Cover + Play/Pause preview */}
                  <button
                    type="button"
                    onClick={() => togglePlayTrack(track)}
                    className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 cursor-pointer shadow-md group/cover"
                    title={isPlaying ? 'Pause audio preview' : 'Play audio preview'}
                  >
                    <div className="w-full h-full bg-[#232336] flex items-center justify-center">
                      {track.coverUrl ? (
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover"
                          onError={e => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : isVideoSource ? (
                        <Film className="w-5 h-5 text-neutral-400" />
                      ) : (
                        <Music className="w-5 h-5 text-neutral-400" />
                      )}
                    </div>

                    {/* Play/Pause Overlay */}
                    <div
                      className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                        isPlaying ? 'opacity-100 bg-[#ff007a]/40' : 'opacity-80 group-hover/cover:opacity-100'
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 text-white fill-white" />
                      ) : (
                        <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                      )}
                    </div>
                  </button>

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
