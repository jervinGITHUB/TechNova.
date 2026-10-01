import React, { useRef, useEffect } from 'react';
import { Camera, Monitor, Gamepad2, Radio } from 'lucide-react';

export type LayoutMode = 'split' | 'pip' | 'game_only' | 'camera_only';
export type GamePreset = 'genshin' | 'valorant' | 'cyberpunk' | 'custom_screen';

export interface LiveStreamCanvasProps {
  layoutMode: LayoutMode;
  splitRatio: number; // e.g. 50 (50% camera, 50% game)
  cameraEnabled: boolean;
  cameraSource: 'webcam' | 'preset';
  pipPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  gameSource: GamePreset;
  gameCustomStream?: MediaStream | null;
  cameraRealStream?: MediaStream | null;
  showOverlays?: boolean;
  showMusicBanner?: boolean;
  showChatOverlay?: boolean;
  showGoalBar?: boolean;
  streamTitle?: string;
  hostName?: string;
  hostAvatar?: string;
  timerText?: string;
  isLive?: boolean;
}

export const LiveStreamCanvas: React.FC<LiveStreamCanvasProps> = ({
  layoutMode = 'split',
  splitRatio = 50,
  cameraEnabled = true,
  cameraSource = 'preset',
  pipPosition = 'top-right',
  gameSource = 'genshin',
  gameCustomStream = null,
  cameraRealStream = null,
  showOverlays = true,
  showMusicBanner = false,
  showChatOverlay = false,
  showGoalBar = false,
  hostName = 'Host',
  timerText = '00:00',
  isLive = true,
}) => {
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const gameVideoRef = useRef<HTMLVideoElement>(null);

  // Hook up real camera stream if provided
  useEffect(() => {
    if (cameraVideoRef.current && cameraRealStream) {
      cameraVideoRef.current.srcObject = cameraRealStream;
    }
  }, [cameraRealStream]);

  // Hook up real screen capture if provided
  useEffect(() => {
    if (gameVideoRef.current && gameCustomStream) {
      gameVideoRef.current.srcObject = gameCustomStream;
    }
  }, [gameCustomStream]);

  const getPipPositionClass = () => {
    switch (pipPosition) {
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-left':
        return 'bottom-12 left-4';
      case 'bottom-right':
        return 'bottom-12 right-4';
      case 'top-right':
      default:
        return 'top-4 right-4';
    }
  };

  // Clean placeholder for camera
  const renderCameraFeed = () => {
    if (!cameraEnabled) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#13131c] text-neutral-400">
          <Camera className="w-6 h-6 text-neutral-600 mb-1" />
          <span className="text-xs font-semibold">Camera is Off</span>
        </div>
      );
    }

    if (cameraSource === 'webcam' && cameraRealStream) {
      return (
        <video
          ref={cameraVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      );
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1c1c2b] to-[#12121a] text-neutral-400">
        <div className="w-12 h-12 rounded-2xl bg-[#252538] flex items-center justify-center text-[#ff007a] mb-2 shadow-lg">
          <Camera className="w-6 h-6" />
        </div>
        <span className="text-xs font-bold text-white">Live Camera Studio</span>
        <span className="text-[10px] text-neutral-500 mt-0.5">Click 'Connect Webcam' in Studio Controls</span>
      </div>
    );
  };

  // Clean placeholder for game/screen
  const renderGameFeed = () => {
    if (gameCustomStream) {
      return (
        <video
          ref={gameVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      );
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#12121b] to-[#0a0a0f] text-neutral-400">
        <div className="w-12 h-12 rounded-2xl bg-[#1e1e2d] flex items-center justify-center text-cyan-400 mb-2 shadow-lg">
          <Gamepad2 className="w-6 h-6" />
        </div>
        <span className="text-xs font-bold text-white">Screen & Game Capture Feed</span>
        <span className="text-[10px] text-neutral-500 mt-0.5">Share screen or window to broadcast game footage</span>
      </div>
    );
  };

  return (
    <div className="relative w-full h-full bg-black rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col select-none group">
      {/* 1. STACKED SPLIT LAYOUT */}
      {layoutMode === 'split' && (
        <div className="w-full h-full flex flex-col relative overflow-hidden">
          {/* Top Half: Camera Feed */}
          <div
            style={{ height: `${splitRatio}%` }}
            className="w-full relative overflow-hidden bg-neutral-900 border-b-2 border-[#ff007a]/60 transition-all duration-200"
          >
            {renderCameraFeed()}
          </div>

          {/* Divider */}
          <div className="h-0.5 bg-[#ff007a] shadow-[0_0_8px_rgba(255,0,122,0.8)] z-20" />

          {/* Bottom Half: Game / Screen Feed */}
          <div
            style={{ height: `${100 - splitRatio}%` }}
            className="w-full relative overflow-hidden bg-neutral-950 transition-all duration-200"
          >
            {renderGameFeed()}
          </div>
        </div>
      )}

      {/* 2. PICTURE-IN-PICTURE (PiP) LAYOUT */}
      {layoutMode === 'pip' && (
        <div className="w-full h-full relative overflow-hidden">
          {renderGameFeed()}

          {cameraEnabled && (
            <div
              className={`absolute ${getPipPositionClass()} z-20 w-36 sm:w-44 aspect-video rounded-2xl overflow-hidden border-2 border-[#ff007a] shadow-[0_0_15px_rgba(255,0,122,0.5)] bg-neutral-900`}
            >
              {renderCameraFeed()}
            </div>
          )}
        </div>
      )}

      {/* 3. GAME ONLY LAYOUT */}
      {layoutMode === 'game_only' && (
        <div className="w-full h-full relative overflow-hidden">
          {renderGameFeed()}
        </div>
      )}

      {/* 4. CAMERA ONLY LAYOUT */}
      {layoutMode === 'camera_only' && (
        <div className="w-full h-full relative overflow-hidden bg-neutral-900">
          {renderCameraFeed()}
        </div>
      )}

      {/* Global Stream Header Overlay (Host info + Live timer) */}
      {showOverlays && (
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
          {/* Host Tag */}
          <div className="flex items-center gap-2.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/10 pointer-events-auto">
            <div className="w-7 h-7 rounded-full bg-[#ff007a] flex items-center justify-center font-bold text-xs text-white overflow-hidden border border-[#ff007a]">
              {(hostName || 'H').charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white">{hostName || 'Host'}</span>
                {isLive && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-white bg-[#ff007a] px-1.5 py-0.2 rounded-full">
                    <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                    Live
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Timer & Live state */}
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/10 pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-white">
              {timerText || '00:00'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
