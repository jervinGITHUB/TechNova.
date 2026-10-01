import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AudioTrack } from '../../types';
import { Search, Plus, Check, Play, Pause, X, Music } from 'lucide-react';

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
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  if (!audioLibraryOpen) return null;

  const filteredTracks = audioTracks.filter(
    t =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (track: AudioTrack) => {
    if (onSelectTrack) {
      onSelectTrack(track);
    } else if (onSelectAudioCallback) {
      onSelectAudioCallback(track);
    }
    setAudioLibraryOpen(false);
  };

  const togglePlayTrack = (trackId: string) => {
    if (playingTrackId === trackId) {
      setPlayingTrackId(null);
    } else {
      setPlayingTrackId(trackId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn select-none">
      <div
        className="absolute inset-0"
        onClick={() => setAudioLibraryOpen(false)}
      />

      {/* Sounds Modal matching Screenshot 3 top left */}
      <div className="relative w-full max-w-sm bg-[#13131a] border border-[#ff007a]/40 rounded-3xl p-6 shadow-2xl z-10 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-[#ff007a]" />
            <h2 className="text-base font-bold text-white font-brand">Sounds</h2>
          </div>
          <button
            onClick={() => setAudioLibraryOpen(false)}
            className="text-neutral-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar matching Screenshot: "Search audio" */}
        <div className="relative mt-4 mb-4 flex items-center">
          <div className="absolute left-3 text-neutral-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            placeholder="Search audio"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-8 pr-3 py-2 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
          />
        </div>

        {/* Tracks List matching Screenshot 3 top left */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left">
          {filteredTracks.map(track => {
            const isPlaying = playingTrackId === track.id;

            return (
              <div
                key={track.id}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-[#181824] border border-neutral-700/60 hover:border-[#ff007a]/60 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Track Cover + Play preview */}
                  <div
                    onClick={() => togglePlayTrack(track.id)}
                    className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 cursor-pointer"
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
                      ) : (
                        <Music className="w-5 h-5 text-neutral-400" />
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                      {isPlaying ? (
                        <Pause className="w-4 h-4 text-white fill-white" />
                      ) : (
                        <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                      )}
                    </div>
                  </div>

                  {/* Title & Artist & Duration */}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {track.title}
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      {track.artist}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                      {track.duration}
                    </div>
                  </div>
                </div>

                {/* Hot Pink '+' button to add track (Screenshot match) */}
                <button
                  type="button"
                  onClick={() => handleSelect(track)}
                  className="w-7 h-7 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white flex items-center justify-center shadow-md transition-all shrink-0 cursor-pointer transform hover:scale-110 active:scale-95 ml-2"
                  title="Select track"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            );
          })}

          {filteredTracks.length === 0 && (
            <div className="text-center py-8 text-neutral-500 text-xs">
              {searchQuery ? `No sounds found matching "${searchQuery}"` : 'No audio tracks available in library'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
