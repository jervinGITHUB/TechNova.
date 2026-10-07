import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Scissors, Sparkles, Clock, MoveHorizontal, GripVertical } from 'lucide-react';
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
  const [dragMode, setDragMode] = useState<'none' | 'gap' | 'start' | 'end'>('none');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Drag interaction references
  const dragModeRef = useRef<'none' | 'gap' | 'start' | 'end'>('none');
  const dragStartXRef = useRef<number>(0);
  const initialStartRef = useRef<number>(startTime);
  const initialEndRef = useRef<number>(endTime);

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
    const barCount = 56;
    const bars: number[] = [];
    let seed = 0;
    for (let i = 0; i < (track.title || '').length; i++) {
      seed = (seed * 31 + track.title.charCodeAt(i)) % 100000;
    }
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < barCount; i++) {
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

  // Preset gap sizing helper (15s, 30s, 60s, Full Track)
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

  // =========================================================================
  // Pointer Drag Handlers: Freely drag Gap, 1st line (start), and 2nd line (end)
  // =========================================================================
  const startDrag = (mode: 'gap' | 'start' | 'end', clientX: number) => {
    dragModeRef.current = mode;
    setDragMode(mode);
    dragStartXRef.current = clientX;
    initialStartRef.current = startTime;
    initialEndRef.current = endTime;

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (dragModeRef.current === 'none' || !containerRef.current) return;
      const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = currentX - dragStartXRef.current;
      const deltaSec = (deltaX / rect.width) * totalDuration;

      const currentMode = dragModeRef.current;
      if (currentMode === 'gap') {
        const gapLen = Math.max(2, initialEndRef.current - initialStartRef.current);
        const rawStart = initialStartRef.current + deltaSec;
        const boundedStart = Math.max(0, Math.min(rawStart, totalDuration - gapLen));
        const boundedEnd = boundedStart + gapLen;
        const s = Math.round(boundedStart * 10) / 10;
        const end = Math.round(boundedEnd * 10) / 10;
        onChangeRange(s, end);
        if (previewAudioRef.current && isPlayingPreview) {
          previewAudioRef.current.currentTime = s;
        }
      } else if (currentMode === 'start') {
        const rawStart = initialStartRef.current + deltaSec;
        const boundedStart = Math.max(0, Math.min(rawStart, endTime - 2));
        const s = Math.round(boundedStart * 10) / 10;
        onChangeRange(s, endTime);
        if (previewAudioRef.current && isPlayingPreview) {
          previewAudioRef.current.currentTime = s;
        }
      } else if (currentMode === 'end') {
        const rawEnd = initialEndRef.current + deltaSec;
        const boundedEnd = Math.max(startTime + 2, Math.min(rawEnd, totalDuration));
        const end = Math.round(boundedEnd * 10) / 10;
        onChangeRange(startTime, end);
      }
    };

    const onPointerUp = () => {
      dragModeRef.current = 'none';
      setDragMode('none');
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove);
    window.addEventListener('touchend', onPointerUp);
  };

  // Clicking on unselected background soundwave jumps the gap to that spot
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragModeRef.current !== 'none' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickedSec = ((e.clientX - rect.left) / rect.width) * totalDuration;
    const gapLen = Math.max(2, endTime - startTime);
    const halfGap = gapLen / 2;
    const nextStart = Math.max(0, Math.min(clickedSec - halfGap, totalDuration - gapLen));
    const nextEnd = nextStart + gapLen;
    const s = Math.round(nextStart * 10) / 10;
    const end = Math.round(nextEnd * 10) / 10;
    onChangeRange(s, end);
    if (previewAudioRef.current && isPlayingPreview) {
      previewAudioRef.current.currentTime = s;
    }
  };

  const gapDuration = Math.max(1, Math.round(endTime - startTime));
  const startPercent = Math.min(100, Math.max(0, (startTime / totalDuration) * 100));
  const endPercent = Math.min(100, Math.max(0, (endTime / totalDuration) * 100));
  const gapWidthPercent = Math.max(1, endPercent - startPercent);
  const playheadPercent = Math.min(100, Math.max(0, (currentPlayTime / totalDuration) * 100));

  return (
    <div className="mt-3 p-4 rounded-2xl bg-gradient-to-b from-[#161622] to-[#0f0f17] border border-[#ff007a]/40 shadow-xl space-y-3 animate-fadeIn select-none">
      {/* Header bar with icon, title and segment badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#ff007a]/20 flex items-center justify-center text-[#ff007a]">
            <Scissors className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Interactive Soundwave Gap Trimmer</span>
              <Sparkles className="w-3 h-3 text-pink-400" />
            </h4>
            <p className="text-[10px] text-neutral-400">
              Drag the gap or adjust the start/end lines directly on the soundwave
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

      {/* ===================================================================== */}
      {/* DIRECTLY INTERACTIVE SOUNDWAVE CANVAS & DRAGGABLE GAP REGION          */}
      {/* ===================================================================== */}
      <div
        ref={containerRef}
        onClick={handleBackgroundClick}
        className="relative w-full h-28 bg-[#0a0a0f] rounded-xl border border-neutral-800 p-2 overflow-hidden flex items-center cursor-pointer select-none group"
        title="Click anywhere to jump gap, or drag the gap and lines directly"
      >
        {/* Waveform bars representation */}
        <div className="absolute inset-x-2 inset-y-2 flex items-center justify-between gap-[2px] pointer-events-none">
          {waveformBars.map((barHeight, idx) => {
            const barPosPercent = (idx / (waveformBars.length - 1)) * 100;
            const isInsideGap = barPosPercent >= startPercent && barPosPercent <= endPercent;

            return (
              <div
                key={idx}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${barHeight}%`,
                  backgroundColor: isInsideGap ? '#ff007a' : 'rgba(255, 255, 255, 0.12)',
                  boxShadow: isInsideGap ? '0 0 8px rgba(255, 0, 122, 0.55)' : 'none',
                }}
              />
            );
          })}
        </div>

        {/* ===================================================================== */}
        {/* DRAGGABLE GAP REGION (User can drag whole gap anywhere across audio)  */}
        {/* ===================================================================== */}
        <div
          onMouseDown={e => {
            e.stopPropagation();
            startDrag('gap', e.clientX);
          }}
          onTouchStart={e => {
            e.stopPropagation();
            startDrag('gap', e.touches[0].clientX);
          }}
          className={`absolute inset-y-0 bg-[#ff007a]/20 border-y-2 border-[#ff007a]/60 shadow-[0_0_20px_rgba(255,0,122,0.35)] transition-opacity flex items-center justify-center cursor-grab active:cursor-grabbing z-10 ${
            dragMode === 'gap' ? 'opacity-95 ring-2 ring-[#ff007a]/40 cursor-grabbing' : 'hover:bg-[#ff007a]/25'
          }`}
          style={{
            left: `${startPercent}%`,
            width: `${gapWidthPercent}%`,
          }}
          title="Drag this gap left or right to choose any section of the audio"
        >
          {/* Center Floating Time Badge & Drag Hint */}
          <div className="flex items-center gap-1 bg-black/80 px-2 py-0.5 rounded-full border border-pink-500/40 text-[10px] font-mono font-bold text-white shadow-lg pointer-events-none">
            <MoveHorizontal className="w-3 h-3 text-[#ff007a]" />
            <span>{formatTimeDisplay(startTime)} - {formatTimeDisplay(endTime)}</span>
          </div>

          {/* ===================================================================== */}
          {/* 1st LINE (Start Handle): User can freely drag to adjust Start time     */}
          {/* ===================================================================== */}
          <div
            onMouseDown={e => {
              e.stopPropagation();
              startDrag('start', e.clientX);
            }}
            onTouchStart={e => {
              e.stopPropagation();
              startDrag('start', e.touches[0].clientX);
            }}
            className="absolute left-0 inset-y-0 w-6 -translate-x-1/2 flex items-center justify-center cursor-ew-resize group/handle z-20"
            title="Drag 1st line to adjust Start"
          >
            {/* Vertical White Line */}
            <div className="w-[3px] h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            {/* Visible Pill Grip Button */}
            <div className="absolute w-3.5 h-12 bg-white rounded-full shadow-2xl border-2 border-[#ff007a] flex items-center justify-center transform active:scale-110 group-hover/handle:scale-110 transition-transform">
              <GripVertical className="w-2.5 h-2.5 text-[#ff007a]" />
            </div>
          </div>

          {/* ===================================================================== */}
          {/* 2nd LINE (End Handle): User can freely drag to adjust End time         */}
          {/* ===================================================================== */}
          <div
            onMouseDown={e => {
              e.stopPropagation();
              startDrag('end', e.clientX);
            }}
            onTouchStart={e => {
              e.stopPropagation();
              startDrag('end', e.touches[0].clientX);
            }}
            className="absolute right-0 inset-y-0 w-6 translate-x-1/2 flex items-center justify-center cursor-ew-resize group/handle z-20"
            title="Drag 2nd line to adjust End"
          >
            {/* Vertical White Line */}
            <div className="w-[3px] h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            {/* Visible Pill Grip Button */}
            <div className="absolute w-3.5 h-12 bg-white rounded-full shadow-2xl border-2 border-[#ff007a] flex items-center justify-center transform active:scale-110 group-hover/handle:scale-110 transition-transform">
              <GripVertical className="w-2.5 h-2.5 text-[#ff007a]" />
            </div>
          </div>
        </div>

        {/* Live Playhead Indicator when preview is playing */}
        {isPlayingPreview && (
          <div
            className="absolute inset-y-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)] z-30 pointer-events-none"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-300 -translate-x-[4px] -translate-y-1 shadow-sm" />
          </div>
        )}
      </div>

      {/* Clean Readouts (Start & End Time Status - Sliders removed as requested) */}
      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300 px-1 pt-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400 text-xs font-sans">Start:</span>
          <span className="font-bold text-[#ff007a] bg-[#1a1a26] px-2.5 py-0.5 rounded-lg border border-pink-500/30">
            {formatTimeDisplay(startTime)}
          </span>
        </div>

        <div className="text-[10px] text-neutral-400 italic hidden sm:inline">
          {dragMode !== 'none' ? `Dragging ${dragMode}...` : 'Drag center box to move gap · Drag lines to resize'}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400 text-xs font-sans">End:</span>
          <span className="font-bold text-white bg-[#1a1a26] px-2.5 py-0.5 rounded-lg border border-neutral-700">
            {formatTimeDisplay(endTime)}
          </span>
          <span className="text-neutral-500 text-[10px]">
            / {formatTimeDisplay(totalDuration)}
          </span>
        </div>
      </div>

      {/* Bottom controls: Preset Buttons & Play Preview Snippet */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
        {/* Quick Gap Length Presets */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-400 mr-1 font-semibold">Gap Size:</span>
          {[15, 30, 60].map(seconds => {
            const isMatch = gapDuration === seconds;
            return (
              <button
                key={seconds}
                type="button"
                onClick={() => applyPresetGap(seconds)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  isMatch
                    ? 'bg-[#ff007a] text-white shadow-[0_0_8px_rgba(255,0,122,0.4)] scale-105'
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
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              gapDuration === totalDuration
                ? 'bg-[#ff007a] text-white shadow-[0_0_8px_rgba(255,0,122,0.4)] scale-105'
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
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md ${
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
