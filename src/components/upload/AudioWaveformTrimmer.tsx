import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Scissors, RotateCcw, Volume2, Sparkles, Clock, Music } from 'lucide-react';
import { AudioTrack } from '../../types';

interface AudioWaveformTrimmerProps {
  track: AudioTrack;
  startTime: number;
  endTime: number;
  onChangeRange: (start: number, end: number) => void;
  audioVolume?: number;
}

// Formats seconds into MM:SS
export const formatTimeDisplay = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Parses "02:00" or "00:30" or "120" to total seconds
export const parseTrackDuration = (durStr?: string): number => {
  if (!durStr) return 60;
  const clean = durStr.trim();
  if (clean.includes(':')) {
    const parts = clean.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return Math.max(5, parts[0] * 60 + parts[1]);
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return Math.max(5, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
  }
  const num = parseFloat(clean);
  return !isNaN(num) && num > 0 ? Math.max(5, Math.round(num)) : 60;
};

export const AudioWaveformTrimmer: React.FC<AudioWaveformTrimmerProps> = ({
  track,
  startTime,
  endTime,
  onChangeRange,
  audioVolume = 100,
}) => {
  // Derive total audio length
  const defaultTotal = useMemo(() => parseTrackDuration(track.duration), [track.duration]);
  const [totalDuration, setTotalDuration] = useState<number>(defaultTotal);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(startTime);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Load actual metadata duration from the track audio URL if available
  useEffect(() => {
    if (!track.audioUrl) {
      setTotalDuration(defaultTotal);
      return;
    }
    const tempAudio = new Audio(track.audioUrl);
    tempAudio.preload = 'metadata';
    const onLoaded = () => {
      if (tempAudio.duration && isFinite(tempAudio.duration) && tempAudio.duration > 2) {
        const rounded = Math.round(tempAudio.duration);
        setTotalDuration(rounded);
        // Ensure initial end time is bounded
        if (endTime > rounded || endTime <= startTime) {
          onChangeRange(startTime, Math.min(startTime + 30, rounded));
        }
      }
    };
    tempAudio.addEventListener('loadedmetadata', onLoaded);
    return () => {
      tempAudio.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [track.audioUrl, defaultTotal]);

  // Generate deterministic realistic audio waveform bars for visual amplitude representation
  const waveformBars = useMemo(() => {
    const barCount = 54;
    const bars: number[] = [];
    // Seeded pseudo-random generator from track title
    let seed = 0;
    for (let i = 0; i < (track.title || '').length; i++) {
      seed = (seed * 31 + track.title.charCodeAt(i)) % 100000;
    }
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < barCount; i++) {
      // Create natural rhythm curves with dips and drops
      const wave = Math.sin((i / barCount) * Math.PI * 4) * 0.25;
      const beat = (i % 4 === 0 || i % 6 === 0) ? 0.35 : 0.1;
      const noise = pseudoRandom() * 0.4;
      const heightPercent = Math.max(15, Math.min(100, Math.round((0.35 + wave + beat + noise) * 100)));
      bars.push(heightPercent);
    }
    return bars;
  }, [track.title]);

  // Audio preview playback control
  useEffect(() => {
    if (!track.audioUrl) return;

    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(track.audioUrl);
    } else {
      previewAudioRef.current.src = track.audioUrl;
    }
    const audio = previewAudioRef.current;
    audio.volume = Math.max(0, Math.min(1, audioVolume / 100));

    return () => {
      audio.pause();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [track.audioUrl, audioVolume]);

  const togglePreview = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (isPlayingPreview) {
      audio.pause();
      setIsPlayingPreview(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    } else {
      audio.currentTime = startTime;
      audio.volume = Math.max(0, Math.min(1, audioVolume / 100));
      audio.play().then(() => {
        setIsPlayingPreview(true);
        const checkLoop = () => {
          if (audio.currentTime >= endTime || audio.ended) {
            audio.currentTime = startTime;
          }
          setCurrentPlayTime(audio.currentTime);
          animFrameRef.current = requestAnimationFrame(checkLoop);
        };
        animFrameRef.current = requestAnimationFrame(checkLoop);
      }).catch(() => {
        setIsPlayingPreview(false);
      });
    }
  };

  const handleStartChange = (newStart: number) => {
    const safeStart = Math.max(0, Math.min(newStart, totalDuration - 2));
    const safeEnd = Math.max(safeStart + 2, Math.min(endTime, totalDuration));
    onChangeRange(safeStart, safeEnd);
    if (previewAudioRef.current && isPlayingPreview) {
      previewAudioRef.current.currentTime = safeStart;
    }
  };

  const handleEndChange = (newEnd: number) => {
    const safeEnd = Math.max(startTime + 2, Math.min(newEnd, totalDuration));
    onChangeRange(startTime, safeEnd);
  };

  // Quick preset gap buttons
  const applyPresetGap = (gapSeconds: number) => {
    let nextStart = startTime;
    let nextEnd = nextStart + gapSeconds;
    if (nextEnd > totalDuration) {
      nextEnd = totalDuration;
      nextStart = Math.max(0, totalDuration - gapSeconds);
    }
    onChangeRange(nextStart, nextEnd);
    if (previewAudioRef.current && isPlayingPreview) {
      previewAudioRef.current.currentTime = nextStart;
    }
  };

  const gapDuration = Math.max(1, Math.round(endTime - startTime));
  const startPercent = Math.min(100, (startTime / totalDuration) * 100);
  const endPercent = Math.min(100, (endTime / totalDuration) * 100);
  const gapWidthPercent = Math.max(2, endPercent - startPercent);
  const playheadPercent = Math.min(100, Math.max(0, (currentPlayTime / totalDuration) * 100));

  return (
    <div className="mt-3 p-4 rounded-2xl bg-gradient-to-b from-[#161622] to-[#0f0f17] border border-[#ff007a]/40 shadow-xl space-y-3.5 animate-fadeIn select-none">
      {/* Header bar with icon and title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#ff007a]/20 flex items-center justify-center text-[#ff007a]">
            <Scissors className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Soundwave Trimmer & Gap Adjuster</span>
              <Sparkles className="w-3 h-3 text-pink-400" />
            </h4>
            <p className="text-[10px] text-neutral-400">
              Select the exact audio segment to synchronize with your video
            </p>
          </div>
        </div>

        {/* Selected Gap Duration Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#ff007a]/15 border border-[#ff007a]/30">
          <Clock className="w-3 h-3 text-[#ff007a]" />
          <span className="text-[11px] font-bold text-[#ff007a]">
            {gapDuration}s segment
          </span>
        </div>
      </div>

      {/* Interactive Soundwave Visualizer Canvas Area */}
      <div className="relative w-full h-24 bg-[#0a0a0f] rounded-xl border border-neutral-800 p-2 overflow-hidden flex items-center">
        {/* Unselected dim background waveform bars */}
        <div className="absolute inset-x-2 inset-y-2 flex items-center justify-between gap-[2px]">
          {waveformBars.map((barHeight, idx) => {
            const barPosPercent = (idx / (waveformBars.length - 1)) * 100;
            const isInsideGap = barPosPercent >= startPercent && barPosPercent <= endPercent;

            return (
              <div
                key={idx}
                className="flex-1 rounded-full transition-all duration-150"
                style={{
                  height: `${barHeight}%`,
                  backgroundColor: isInsideGap ? '#ff007a' : 'rgba(255, 255, 255, 0.12)',
                  boxShadow: isInsideGap ? '0 0 6px rgba(255, 0, 122, 0.5)' : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Highlighted Selected Region Window (The Gap) */}
        <div
          className="absolute inset-y-0 bg-[#ff007a]/15 border-x-2 border-[#ff007a] pointer-events-none transition-all shadow-[0_0_15px_rgba(255,0,122,0.25)] flex items-center justify-between"
          style={{
            left: `${startPercent}%`,
            width: `${gapWidthPercent}%`,
          }}
        >
          {/* Start handle bar */}
          <div className="w-1 h-8 bg-white rounded-full shadow-md -translate-x-1/2 opacity-90" />
          {/* Center segment label */}
          <span className="text-[10px] font-mono font-bold text-white/90 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm">
            {formatTimeDisplay(startTime)} - {formatTimeDisplay(endTime)}
          </span>
          {/* End handle bar */}
          <div className="w-1 h-8 bg-white rounded-full shadow-md translate-x-1/2 opacity-90" />
        </div>

        {/* Live Playhead Indicator when preview is playing */}
        {isPlayingPreview && (
          <div
            className="absolute inset-y-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)] z-20 pointer-events-none"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="w-2 h-2 rounded-full bg-cyan-300 -translate-x-[3px] -translate-y-1 shadow-sm" />
          </div>
        )}
      </div>

      {/* Dual Range Sliders for start time and end time */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">Start:</span>
            <span className="font-bold text-[#ff007a] bg-[#1a1a26] px-2 py-0.5 rounded border border-neutral-700">
              {formatTimeDisplay(startTime)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">End:</span>
            <span className="font-bold text-white bg-[#1a1a26] px-2 py-0.5 rounded border border-neutral-700">
              {formatTimeDisplay(endTime)}
            </span>
            <span className="text-neutral-500 text-[10px]">
              / {formatTimeDisplay(totalDuration)}
            </span>
          </div>
        </div>

        {/* Start Slider */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-neutral-400 w-12 shrink-0">Trim Start</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, totalDuration - 2)}
            step={0.5}
            value={startTime}
            onChange={e => handleStartChange(parseFloat(e.target.value) || 0)}
            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
          />
        </div>

        {/* End Slider */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-neutral-400 w-12 shrink-0">Trim End</span>
          <input
            type="range"
            min={Math.min(totalDuration, startTime + 2)}
            max={totalDuration}
            step={0.5}
            value={endTime}
            onChange={e => handleEndChange(parseFloat(e.target.value) || 0)}
            className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-[#ff007a]"
          />
        </div>
      </div>

      {/* Bottom controls: Preset Buttons & Play Preview Snippet */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
        {/* Quick Gap Length Presets */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-400 mr-1">Gap:</span>
          {[15, 30, 60].map(seconds => {
            const isMatch = gapDuration === seconds;
            return (
              <button
                key={seconds}
                type="button"
                onClick={() => applyPresetGap(seconds)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  isMatch
                    ? 'bg-[#ff007a] text-white shadow-[0_0_8px_rgba(255,0,122,0.4)]'
                    : 'bg-[#1b1b26] text-neutral-300 hover:bg-[#252538] hover:text-white border border-neutral-700/60'
                }`}
              >
                {seconds}s
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onChangeRange(0, totalDuration)}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              gapDuration === totalDuration
                ? 'bg-[#ff007a] text-white shadow-[0_0_8px_rgba(255,0,122,0.4)]'
                : 'bg-[#1b1b26] text-neutral-300 hover:bg-[#252538] hover:text-white border border-neutral-700/60'
            }`}
          >
            Full Track
          </button>
        </div>

        {/* Play / Pause Preview Snippet Button */}
        {track.audioUrl && (
          <button
            type="button"
            onClick={togglePreview}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md ${
              isPlayingPreview
                ? 'bg-[#ff007a] text-white shadow-[0_0_12px_rgba(255,0,122,0.5)]'
                : 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
            }`}
          >
            {isPlayingPreview ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-white" />
                <span>Pause Snippet</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Play Snippet</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
