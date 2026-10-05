import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Camera,
  Monitor,
  Gamepad2,
  Lock,
  Unlock,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  Sparkles,
  Layers,
  Move,
} from 'lucide-react';
import { CanvasSourceTransform } from '../../types';

export type LayoutMode = 'split' | 'pip' | 'game_only' | 'camera_only' | 'custom';
export type GamePreset = 'genshin' | 'valorant' | 'cyberpunk' | 'custom_screen';

export interface GoalWidgetConfig {
  enabled?: boolean;
  title?: string;
  current?: number;
  target?: number;
  posY?: number; // 5% to 85%
  widthPercent?: number; // 50% to 100%
  theme?: 'pink' | 'cyan' | 'purple' | 'gold';
}

export interface LiveStreamCanvasProps {
  layoutMode?: LayoutMode;
  splitRatio?: number; // e.g. 50 (50% camera, 50% game)
  cameraEnabled?: boolean;
  cameraSource?: 'webcam' | 'preset';
  pipPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  gameSource?: GamePreset;
  gameCustomStream?: MediaStream | null;
  cameraRealStream?: MediaStream | null;
  showOverlays?: boolean;
  showMusicBanner?: boolean;
  showChatOverlay?: boolean;
  showGoalBar?: boolean;
  goalWidgetConfig?: GoalWidgetConfig;
  streamTitle?: string;
  hostName?: string;
  hostAvatar?: string;
  timerText?: string;
  isLive?: boolean;
  // Interactive Studio Setup Props
  isInteractive?: boolean;
  canvasAspectRatio?: '9:16' | '16:9';
  cameraTransform?: CanvasSourceTransform;
  screenTransform?: CanvasSourceTransform;
  selectedSourceId?: 'camera' | 'screen' | 'goal_bar' | null;
  onSelectSource?: (sourceId: 'camera' | 'screen' | 'goal_bar' | null) => void;
  onUpdateCameraTransform?: (transform: Partial<CanvasSourceTransform>) => void;
  onUpdateScreenTransform?: (transform: Partial<CanvasSourceTransform>) => void;
  onUpdateGoalWidgetConfig?: (config: Partial<GoalWidgetConfig>) => void;
  showGrid?: boolean;
  showSafeArea?: boolean;
}

type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

export const LiveStreamCanvas: React.FC<LiveStreamCanvasProps> = ({
  layoutMode = 'custom',
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
  goalWidgetConfig,
  onUpdateGoalWidgetConfig,
  streamTitle = '',
  hostName = 'Host',
  hostAvatar = '',
  timerText = '00:00',
  isLive = true,
  isInteractive = false,
  canvasAspectRatio = '9:16',
  cameraTransform,
  screenTransform,
  selectedSourceId = null,
  onSelectSource,
  onUpdateCameraTransform,
  onUpdateScreenTransform,
  showGrid = false,
  showSafeArea = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const gameVideoRef = useRef<HTMLVideoElement>(null);

  // Drag & Resize tracking state
  const [activeDrag, setActiveDrag] = useState<{
    sourceId: 'camera' | 'screen' | 'goal_bar';
    startX: number;
    startY: number;
    initialTransform: CanvasSourceTransform;
  } | null>(null);

  const [activeResize, setActiveResize] = useState<{
    sourceId: 'camera' | 'screen' | 'goal_bar';
    handle: ResizeHandle;
    startX: number;
    startY: number;
    initialTransform: CanvasSourceTransform;
  } | null>(null);

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

  // -------------------------------------------------------------------------
  // Pointer Drag & Resize Engine (clamps within 0-100% canvas bounds)
  // -------------------------------------------------------------------------
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      // Handle Dragging
      if (activeDrag) {
        const deltaXPercent = ((e.clientX - activeDrag.startX) / rect.width) * 100;
        const deltaYPercent = ((e.clientY - activeDrag.startY) / rect.height) * 100;

        const maxLeft = Math.max(0, 100 - activeDrag.initialTransform.width);
        const maxTop = Math.max(0, 100 - activeDrag.initialTransform.height);

        const newX = Math.round(Math.max(0, Math.min(maxLeft, activeDrag.initialTransform.x + deltaXPercent)));
        const newY = Math.round(Math.max(0, Math.min(maxTop, activeDrag.initialTransform.y + deltaYPercent)));

        if (activeDrag.sourceId === 'camera' && onUpdateCameraTransform) {
          onUpdateCameraTransform({ x: newX, y: newY });
        } else if (activeDrag.sourceId === 'screen' && onUpdateScreenTransform) {
          onUpdateScreenTransform({ x: newX, y: newY });
        } else if (activeDrag.sourceId === 'goal_bar' && onUpdateGoalWidgetConfig) {
          const newGoalY = Math.round(Math.max(2, Math.min(85, activeDrag.initialTransform.y + deltaYPercent)));
          onUpdateGoalWidgetConfig({ posY: newGoalY });
        }
      }

      // Handle Resizing
      if (activeResize) {
        const deltaXPercent = ((e.clientX - activeResize.startX) / rect.width) * 100;
        const deltaYPercent = ((e.clientY - activeResize.startY) / rect.height) * 100;

        if (activeResize.sourceId === 'goal_bar' && onUpdateGoalWidgetConfig) {
          const initW = activeResize.initialTransform.width;
          const factor = activeResize.handle === 'w' ? -1 : 1;
          const newW = Math.round(Math.max(35, Math.min(100, initW + deltaXPercent * 2 * factor)));
          onUpdateGoalWidgetConfig({ widthPercent: newW });
          return;
        }

        const init = activeResize.initialTransform;
        let newX = init.x;
        let newY = init.y;
        let newW = init.width;
        let newH = init.height;

        const minW = 12; // Min 12% width
        const minH = 10; // Min 10% height

        switch (activeResize.handle) {
          case 'se': {
            newW = Math.max(minW, Math.min(100 - init.x, init.width + deltaXPercent));
            newH = Math.max(minH, Math.min(100 - init.y, init.height + deltaYPercent));
            break;
          }
          case 'sw': {
            const proposedW = init.width - deltaXPercent;
            if (proposedW >= minW && init.x + deltaXPercent >= 0) {
              newW = proposedW;
              newX = init.x + deltaXPercent;
            }
            newH = Math.max(minH, Math.min(100 - init.y, init.height + deltaYPercent));
            break;
          }
          case 'ne': {
            newW = Math.max(minW, Math.min(100 - init.x, init.width + deltaXPercent));
            const proposedH = init.height - deltaYPercent;
            if (proposedH >= minH && init.y + deltaYPercent >= 0) {
              newH = proposedH;
              newY = init.y + deltaYPercent;
            }
            break;
          }
          case 'nw': {
            const proposedW = init.width - deltaXPercent;
            if (proposedW >= minW && init.x + deltaXPercent >= 0) {
              newW = proposedW;
              newX = init.x + deltaXPercent;
            }
            const proposedH = init.height - deltaYPercent;
            if (proposedH >= minH && init.y + deltaYPercent >= 0) {
              newH = proposedH;
              newY = init.y + deltaYPercent;
            }
            break;
          }
          case 'e': {
            newW = Math.max(minW, Math.min(100 - init.x, init.width + deltaXPercent));
            break;
          }
          case 's': {
            newH = Math.max(minH, Math.min(100 - init.y, init.height + deltaYPercent));
            break;
          }
          case 'w': {
            const proposedW = init.width - deltaXPercent;
            if (proposedW >= minW && init.x + deltaXPercent >= 0) {
              newW = proposedW;
              newX = init.x + deltaXPercent;
            }
            break;
          }
          case 'n': {
            const proposedH = init.height - deltaYPercent;
            if (proposedH >= minH && init.y + deltaYPercent >= 0) {
              newH = proposedH;
              newY = init.y + deltaYPercent;
            }
            break;
          }
        }

        const updated = {
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newW),
          height: Math.round(newH),
        };

        if (activeResize.sourceId === 'camera' && onUpdateCameraTransform) {
          onUpdateCameraTransform(updated);
        } else if (activeResize.sourceId === 'screen' && onUpdateScreenTransform) {
          onUpdateScreenTransform(updated);
        }
      }
    },
    [activeDrag, activeResize, onUpdateCameraTransform, onUpdateScreenTransform]
  );

  const handlePointerUp = useCallback(() => {
    setActiveDrag(null);
    setActiveResize(null);
  }, []);

  useEffect(() => {
    if (activeDrag || activeResize) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [activeDrag, activeResize, handlePointerMove, handlePointerUp]);

  // -------------------------------------------------------------------------
  // Render Camera Feed Content
  // -------------------------------------------------------------------------
  const renderCameraFeed = (isMirrored = false) => {
    if (!cameraEnabled) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#101018] text-neutral-400 p-2 text-center select-none">
          <Camera className="w-6 h-6 text-neutral-600 mb-1" />
          <span className="text-xs font-semibold text-neutral-400">Camera Off</span>
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
          className={`w-full h-full object-cover select-none ${isMirrored ? 'scale-x-[-1]' : ''}`}
        />
      );
    }

    // Default Pro Streamer Camera Preset
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#181827] via-[#10101b] to-[#09090f] text-neutral-300 relative select-none ${
          isMirrored ? 'scale-x-[-1]' : ''
        }`}
      >
        <div className="w-11 h-11 rounded-2xl bg-[#232338] border border-white/10 flex items-center justify-center text-[#ff007a] mb-2 shadow-lg">
          <Camera className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold text-white tracking-wide">Camera Feed</span>
        <span className="text-[10px] text-neutral-400 mt-0.5">Physical Webcam / Preset</span>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render Screen & Game Feed Content
  // -------------------------------------------------------------------------
  const renderGameFeed = () => {
    if (gameCustomStream) {
      return (
        <video
          ref={gameVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover select-none"
        />
      );
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#0f1422] via-[#090c14] to-[#05070a] text-neutral-300 relative select-none">
        <div className="w-11 h-11 rounded-2xl bg-[#131d2e] border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-2 shadow-lg">
          <Monitor className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold text-white tracking-wide">Screen & Game Display</span>
        <span className="text-[10px] text-neutral-400 mt-0.5">Real Window / Display Capture</span>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render Bounding Box with Resize Handles when Selected in Studio
  // -------------------------------------------------------------------------
  const renderInteractiveHandles = (
    sourceId: 'camera' | 'screen',
    transform: CanvasSourceTransform
  ) => {
    if (!isInteractive || selectedSourceId !== sourceId || transform.locked) {
      return null;
    }

    const handles: { type: ResizeHandle; cursor: string; posClass: string }[] = [
      { type: 'nw', cursor: 'nwse-resize', posClass: '-top-1.5 -left-1.5' },
      { type: 'ne', cursor: 'nesw-resize', posClass: '-top-1.5 -right-1.5' },
      { type: 'se', cursor: 'nwse-resize', posClass: '-bottom-1.5 -right-1.5' },
      { type: 'sw', cursor: 'nesw-resize', posClass: '-bottom-1.5 -left-1.5' },
      { type: 'n', cursor: 'ns-resize', posClass: '-top-1.5 left-1/2 -translate-x-1/2' },
      { type: 's', cursor: 'ns-resize', posClass: '-bottom-1.5 left-1/2 -translate-x-1/2' },
      { type: 'w', cursor: 'ew-resize', posClass: 'top-1/2 -left-1.5 -translate-y-1/2' },
      { type: 'e', cursor: 'ew-resize', posClass: 'top-1/2 -right-1.5 -translate-y-1/2' },
    ];

    return (
      <>
        {/* Source Action Label Badge at top-left of selected box */}
        <div className="absolute -top-7 left-0 z-40 flex items-center gap-1.5 bg-[#0d0d14]/95 backdrop-blur-md px-2 py-0.5 rounded-lg border border-cyan-400/50 shadow-md text-[10px] text-white font-semibold whitespace-nowrap pointer-events-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{transform.name}</span>
          <span className="text-neutral-400 font-mono text-[9px]">
            {transform.width}% × {transform.height}%
          </span>
          {sourceId === 'camera' && onUpdateCameraTransform && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onUpdateCameraTransform({ mirrored: !transform.mirrored });
              }}
              title="Flip Horizontal"
              className="p-0.5 rounded hover:bg-white/10 text-neutral-300 hover:text-white"
            >
              <FlipHorizontal className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 8 Bounding Box Resize Handles */}
        {handles.map(h => (
          <div
            key={h.type}
            onPointerDown={e => {
              e.stopPropagation();
              e.preventDefault();
              setActiveResize({
                sourceId,
                handle: h.type,
                startX: e.clientX,
                startY: e.clientY,
                initialTransform: { ...transform },
              });
            }}
            style={{ cursor: h.cursor }}
            className={`absolute ${h.posClass} w-3 h-3 bg-white border-2 border-cyan-400 rounded-sm shadow-md z-40 hover:scale-125 transition-transform`}
          />
        ))}
      </>
    );
  };

  // Border style helper for custom layers
  const getBorderStyle = (
    style?: 'none' | 'pink' | 'cyan' | 'hairline',
    isSelected?: boolean
  ) => {
    if (isSelected) {
      return 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]';
    }
    switch (style) {
      case 'pink':
        return 'ring-2 ring-[#ff007a] shadow-[0_0_15px_rgba(255,0,122,0.4)]';
      case 'cyan':
        return 'ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]';
      case 'hairline':
        return 'ring-1 ring-white/20';
      default:
        return '';
    }
  };

  // -------------------------------------------------------------------------
  // Render Freeform Custom Studio Layout
  // -------------------------------------------------------------------------
  const renderCustomStudioLayout = () => {
    const cam = cameraTransform || {
      id: 'camera',
      name: 'Webcam / Facecam',
      type: 'camera',
      x: 60,
      y: 65,
      width: 36,
      height: 30,
      zIndex: 20,
      visible: true,
      locked: false,
      mirrored: false,
      borderRadius: 16,
      borderStyle: 'pink',
    };

    const scr = screenTransform || {
      id: 'screen',
      name: 'Screen & Game',
      type: 'screen',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      zIndex: 10,
      visible: true,
      locked: false,
      borderRadius: 0,
      borderStyle: 'none',
    };

    return (
      <div
        ref={containerRef}
        onClick={() => {
          if (isInteractive && onSelectSource) {
            onSelectSource(null);
          }
        }}
        className="w-full h-full relative overflow-hidden bg-black select-none"
      >
        {/* Layer 1: Screen / Game Capture Source */}
        {scr.visible && (
          <div
            onClick={e => {
              if (isInteractive && onSelectSource) {
                e.stopPropagation();
                onSelectSource('screen');
              }
            }}
            onPointerDown={e => {
              if (isInteractive && !scr.locked) {
                e.stopPropagation();
                onSelectSource?.('screen');
                setActiveDrag({
                  sourceId: 'screen',
                  startX: e.clientX,
                  startY: e.clientY,
                  initialTransform: { ...scr },
                });
              }
            }}
            style={{
              left: `${scr.x}%`,
              top: `${scr.y}%`,
              width: `${scr.width}%`,
              height: `${scr.height}%`,
              zIndex: scr.zIndex,
              borderRadius: scr.borderRadius ? `${scr.borderRadius}px` : undefined,
              opacity: scr.opacity ?? 1,
            }}
            className={`absolute overflow-hidden transition-shadow ${
              isInteractive && !scr.locked ? 'cursor-move' : ''
            } ${getBorderStyle(scr.borderStyle, isInteractive && selectedSourceId === 'screen')}`}
          >
            {renderGameFeed()}
            {renderInteractiveHandles('screen', scr)}
          </div>
        )}

        {/* Layer 2: Camera Source */}
        {cam.visible && (
          <div
            onClick={e => {
              if (isInteractive && onSelectSource) {
                e.stopPropagation();
                onSelectSource('camera');
              }
            }}
            onPointerDown={e => {
              if (isInteractive && !cam.locked) {
                e.stopPropagation();
                onSelectSource?.('camera');
                setActiveDrag({
                  sourceId: 'camera',
                  startX: e.clientX,
                  startY: e.clientY,
                  initialTransform: { ...cam },
                });
              }
            }}
            style={{
              left: `${cam.x}%`,
              top: `${cam.y}%`,
              width: `${cam.width}%`,
              height: `${cam.height}%`,
              zIndex: cam.zIndex,
              borderRadius: cam.borderRadius ? `${cam.borderRadius}px` : undefined,
              opacity: cam.opacity ?? 1,
            }}
            className={`absolute overflow-hidden transition-shadow ${
              isInteractive && !cam.locked ? 'cursor-move' : ''
            } ${getBorderStyle(cam.borderStyle, isInteractive && selectedSourceId === 'camera')}`}
          >
            {renderCameraFeed(cam.mirrored)}
            {renderInteractiveHandles('camera', cam)}
          </div>
        )}

        {/* Optional Studio Grid Overlay for Precision Alignment */}
        {isInteractive && showGrid && (
          <div className="absolute inset-0 pointer-events-none z-30 grid grid-cols-3 grid-rows-3 border border-white/10">
            <div className="border-r border-b border-white/10" />
            <div className="border-r border-b border-white/10" />
            <div className="border-b border-white/10" />
            <div className="border-r border-b border-white/10" />
            <div className="border-r border-b border-white/10" />
            <div className="border-b border-white/10" />
            <div className="border-r border-white/10" />
            <div className="border-r border-white/10" />
            <div />
          </div>
        )}

        {/* Optional Safe Area Overlay (TikTok Live Mobile Safe Guides) */}
        {isInteractive && showSafeArea && (
          <div className="absolute inset-0 pointer-events-none z-30 p-4 flex flex-col justify-between">
            {/* Top safe zone label */}
            <div className="border border-dashed border-amber-400/40 rounded-lg p-1.5 text-center bg-amber-500/10 text-[9px] text-amber-300 font-mono">
              Top Host & Badge Safe Zone
            </div>
            {/* Center action area */}
            <div className="flex-1 my-3 border border-dashed border-cyan-400/30 rounded-lg flex items-center justify-center text-[10px] text-cyan-300/60 font-mono">
              Main Interactive Broadcast Zone
            </div>
            {/* Bottom comment safe zone */}
            <div className="border border-dashed border-pink-400/40 rounded-lg p-1.5 text-center bg-pink-500/10 text-[9px] text-pink-300 font-mono">
              Bottom Live Comments & Gifts Safe Zone
            </div>
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render Legacy Preset Layouts (Split, PiP, Game Only, Camera Only)
  // -------------------------------------------------------------------------
  const renderLegacyPresets = () => {
    if (layoutMode === 'split') {
      return (
        <div className="w-full h-full flex flex-col relative overflow-hidden">
          <div
            style={{ height: `${splitRatio}%` }}
            className="w-full relative overflow-hidden bg-neutral-900 border-b-2 border-[#ff007a]/60 transition-all duration-200"
          >
            {renderCameraFeed()}
          </div>
          <div className="h-0.5 bg-[#ff007a] shadow-[0_0_8px_rgba(255,0,122,0.8)] z-20" />
          <div
            style={{ height: `${100 - splitRatio}%` }}
            className="w-full relative overflow-hidden bg-neutral-950 transition-all duration-200"
          >
            {renderGameFeed()}
          </div>
        </div>
      );
    }

    if (layoutMode === 'pip') {
      const getPipClass = () => {
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

      return (
        <div className="w-full h-full relative overflow-hidden">
          {renderGameFeed()}
          {cameraEnabled && (
            <div
              className={`absolute ${getPipClass()} z-20 w-36 sm:w-44 aspect-video rounded-2xl overflow-hidden border-2 border-[#ff007a] shadow-[0_0_15px_rgba(255,0,122,0.5)] bg-neutral-900`}
            >
              {renderCameraFeed()}
            </div>
          )}
        </div>
      );
    }

    if (layoutMode === 'game_only') {
      return <div className="w-full h-full relative overflow-hidden">{renderGameFeed()}</div>;
    }

    if (layoutMode === 'camera_only') {
      return (
        <div className="w-full h-full relative overflow-hidden bg-neutral-900">
          {renderCameraFeed()}
        </div>
      );
    }

    return null;
  };

  // Determine whether to use custom freeform or legacy preset
  const isCustomMode =
    layoutMode === 'custom' || Boolean(cameraTransform || screenTransform);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col select-none ${
        canvasAspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'
      }`}
    >
      {/* Viewport Content */}
      {isCustomMode ? renderCustomStudioLayout() : renderLegacyPresets()}

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
                <span className="text-xs font-bold text-white truncate max-w-[120px]">
                  {hostName || 'Host'}
                </span>
                {isLive && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-white bg-[#ff007a] px-1.5 py-0.5 rounded-full">
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

      {/* Optional Music Ticker Banner */}
      {showMusicBanner && (
        <div className="absolute bottom-16 left-3 right-3 z-30 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs text-white shadow-lg pointer-events-auto">
            <Sparkles className="w-3.5 h-3.5 text-[#ff007a] shrink-0" />
            <span className="truncate text-[11px] font-medium">
              Now Playing: Synthwave Cyber Vibes 🎵
            </span>
          </div>
        </div>
      )}

      {/* Adjustable Follower Goal Bar Widget */}
      {(showGoalBar || goalWidgetConfig?.enabled) && (
        <div
          onClick={e => {
            if (isInteractive && onSelectSource) {
              e.stopPropagation();
              onSelectSource('goal_bar');
            }
          }}
          onPointerDown={e => {
            if (isInteractive) {
              e.stopPropagation();
              onSelectSource?.('goal_bar');
              setActiveDrag({
                sourceId: 'goal_bar',
                startX: e.clientX,
                startY: e.clientY,
                initialTransform: {
                  id: 'goal_bar',
                  name: 'Goal Widget',
                  type: 'overlay',
                  x: 0,
                  y: goalWidgetConfig?.posY ?? 13,
                  width: goalWidgetConfig?.widthPercent ?? 92,
                  height: 10,
                  zIndex: 30,
                  visible: true,
                  opacity: 1,
                },
              });
            }
          }}
          style={{
            top: `${goalWidgetConfig?.posY ?? 13}%`,
            width: `${goalWidgetConfig?.widthPercent ?? 92}%`,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
          className={`absolute z-30 transition-all duration-75 select-none ${
            isInteractive ? 'cursor-move' : 'pointer-events-none'
          }`}
        >
          <div
            className={`bg-black/85 backdrop-blur-md rounded-2xl p-2.5 shadow-xl text-[10px] text-white relative transition-all ${
              isInteractive && selectedSourceId === 'goal_bar'
                ? 'ring-2 ring-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.5)] border border-cyan-400'
                : 'border border-white/10'
            }`}
          >
            {/* Interactive selection badge & resize handles */}
            {isInteractive && selectedSourceId === 'goal_bar' && (
              <>
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-cyan-500 text-black font-extrabold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md whitespace-nowrap pointer-events-none">
                  <Move className="w-2.5 h-2.5" />
                  <span>Goal Widget · Drag to move · Drag ends to resize</span>
                </div>

                {/* Left resize handle */}
                <div
                  onPointerDown={e => {
                    e.stopPropagation();
                    setActiveResize({
                      sourceId: 'goal_bar',
                      handle: 'w',
                      startX: e.clientX,
                      startY: e.clientY,
                      initialTransform: {
                        id: 'goal_bar',
                        name: 'Goal Widget',
                        type: 'overlay',
                        x: 0,
                        y: goalWidgetConfig?.posY ?? 13,
                        width: goalWidgetConfig?.widthPercent ?? 92,
                        height: 10,
                        zIndex: 30,
                        visible: true,
                        opacity: 1,
                      },
                    });
                  }}
                  className="absolute -left-2 top-1/2 -translate-y-1/2 w-3.5 h-6 bg-cyan-400 hover:bg-white rounded-md cursor-ew-resize flex items-center justify-center shadow-lg pointer-events-auto border border-black/40"
                  title="Resize width"
                />

                {/* Right resize handle */}
                <div
                  onPointerDown={e => {
                    e.stopPropagation();
                    setActiveResize({
                      sourceId: 'goal_bar',
                      handle: 'e',
                      startX: e.clientX,
                      startY: e.clientY,
                      initialTransform: {
                        id: 'goal_bar',
                        name: 'Goal Widget',
                        type: 'overlay',
                        x: 0,
                        y: goalWidgetConfig?.posY ?? 13,
                        width: goalWidgetConfig?.widthPercent ?? 92,
                        height: 10,
                        zIndex: 30,
                        visible: true,
                        opacity: 1,
                      },
                    });
                  }}
                  className="absolute -right-2 top-1/2 -translate-y-1/2 w-3.5 h-6 bg-cyan-400 hover:bg-white rounded-md cursor-ew-resize flex items-center justify-center shadow-lg pointer-events-auto border border-black/40"
                  title="Resize width"
                />
              </>
            )}

            <div className="flex justify-between items-center font-bold mb-1.5 pointer-events-auto">
              <span className="text-white tracking-wide flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    goalWidgetConfig?.theme === 'cyan'
                      ? 'bg-cyan-400'
                      : goalWidgetConfig?.theme === 'gold'
                      ? 'bg-amber-400'
                      : goalWidgetConfig?.theme === 'purple'
                      ? 'bg-purple-400'
                      : 'bg-[#ff007a]'
                  } animate-pulse`}
                />
                <span>{goalWidgetConfig?.title || 'Follower Goal'}</span>
              </span>
              <span
                className={`font-mono font-bold ${
                  goalWidgetConfig?.theme === 'cyan'
                    ? 'text-cyan-400'
                    : goalWidgetConfig?.theme === 'gold'
                    ? 'text-amber-400'
                    : goalWidgetConfig?.theme === 'purple'
                    ? 'text-purple-400'
                    : 'text-[#ff007a]'
                }`}
              >
                {(goalWidgetConfig?.current ?? 4083).toLocaleString()} /{' '}
                {(goalWidgetConfig?.target ?? 4100).toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-neutral-800/80 rounded-full overflow-hidden p-0.5 border border-white/5 pointer-events-auto">
              <div
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      ((goalWidgetConfig?.current ?? 4083) / (goalWidgetConfig?.target ?? 4100)) *
                        100
                    )
                  )}%`,
                }}
                className={`h-full rounded-full transition-all duration-300 ${
                  goalWidgetConfig?.theme === 'cyan'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                    : goalWidgetConfig?.theme === 'gold'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                    : goalWidgetConfig?.theme === 'purple'
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                    : 'bg-gradient-to-r from-[#ff007a] to-rose-500 shadow-[0_0_10px_rgba(255,0,122,0.5)]'
                }`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
