import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  LiveStreamCanvas,
  LayoutMode,
  GamePreset,
} from './LiveStreamCanvas';
import { Avatar } from '../common/Avatar';
import { CanvasSourceTransform } from '../../types';
import {
  Camera,
  Mic,
  MicOff,
  Monitor,
  BarChart2,
  Radio,
  X,
  Send,
  Video as VideoIcon,
  VideoOff,
  Sliders,
  Sparkles,
  Layers,
  Gamepad2,
  Tv,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Check,
  Smartphone,
  Laptop,
  Maximize2,
  Minimize2,
  FlipHorizontal,
  Grid,
  ShieldCheck,
  Plus,
  Trash2,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface LiveStreamHostStudioProps {
  initialMode?: 'setup' | 'active';
}

export const LiveStreamHostStudio: React.FC<LiveStreamHostStudioProps> = ({
  initialMode = 'setup',
}) => {
  const {
    currentUser,
    currentLiveStream,
    startHostLiveStream,
    endHostLiveStream,
    sendLiveComment,
    setActiveTab,
  } = useApp();

  const [mode, setMode] = useState<'setup' | 'active'>(initialMode);

  // Stream Info Fields
  const [streamTitle, setStreamTitle] = useState(currentLiveStream.title || '');
  const [streamTopic, setStreamTopic] = useState(currentLiveStream.topic || 'Gaming');
  const [streamAbout, setStreamAbout] = useState(currentLiveStream.aboutMe || '');

  // Studio Display Mode: Portrait 9:16 (TikTok Mobile standard) vs Landscape 16:9 (Gaming/Desktop)
  const [canvasAspectRatio, setCanvasAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);

  // Freeform Transform States for Canvas Sources (TikTok Live Studio Engine)
  const [cameraTransform, setCameraTransform] = useState<CanvasSourceTransform>({
    id: 'camera',
    name: 'Camera (Facecam)',
    type: 'camera',
    x: 56,
    y: 68,
    width: 38,
    height: 26,
    zIndex: 20,
    visible: true,
    locked: false,
    mirrored: false,
    borderRadius: 16,
    borderStyle: 'pink',
    opacity: 1,
  });

  const [screenTransform, setScreenTransform] = useState<CanvasSourceTransform>({
    id: 'screen',
    name: 'Screen & Game Display',
    type: 'screen',
    x: 0,
    y: 0,
    width: 100,
    height: 68,
    zIndex: 10,
    visible: true,
    locked: false,
    borderRadius: 0,
    borderStyle: 'none',
    opacity: 1,
  });

  const [selectedSourceId, setSelectedSourceId] = useState<'camera' | 'screen' | null>('camera');

  // Hardware Devices
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(true);
  const [cameraSource, setCameraSource] = useState<'webcam' | 'preset'>('preset');
  const [cameraRealStream, setCameraRealStream] = useState<MediaStream | null>(null);

  const [gameSource, setGameSource] = useState<GamePreset>('genshin');
  const [gameCustomStream, setGameCustomStream] = useState<MediaStream | null>(null);

  // Audio Mixer State
  const [micActive, setMicActive] = useState(true);
  const [micGain, setMicGain] = useState(85);
  const [desktopAudioGain, setDesktopAudioGain] = useState(75);
  const [desktopAudioMuted, setDesktopAudioMuted] = useState(false);

  // Broadcast Overlays
  const [showOverlays, setShowOverlays] = useState(true);
  const [showMusicBanner, setShowMusicBanner] = useState(false);
  const [showGoalBar, setShowGoalBar] = useState(false);

  // Right Studio Tab: 'details' | 'audio' | 'overlays'
  const [rightStudioTab, setRightStudioTab] = useState<'details' | 'audio' | 'overlays'>('details');

  // Live timer for active broadcast
  const [elapsedSeconds, setElapsedSeconds] = useState(currentLiveStream.timerSeconds || 0);
  const [chatInput, setChatInput] = useState('');

  // Audio VU Meter Simulation
  const [micMeterLevel, setMicMeterLevel] = useState(65);
  const [desktopMeterLevel, setDesktopMeterLevel] = useState(50);

  useEffect(() => {
    const audioInterval = setInterval(() => {
      if (micActive) {
        setMicMeterLevel(Math.floor(40 + Math.random() * 45));
      } else {
        setMicMeterLevel(0);
      }
      if (!desktopAudioMuted) {
        setDesktopMeterLevel(Math.floor(30 + Math.random() * 50));
      } else {
        setDesktopMeterLevel(0);
      }
    }, 150);
    return () => clearInterval(audioInterval);
  }, [micActive, desktopAudioMuted]);

  // Timer loop for active broadcast
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (mode === 'active') {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [mode]);

  // Request physical webcam
  const handleEnableRealWebcam = async () => {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: micActive,
        });
        setCameraRealStream(stream);
        setCameraSource('webcam');
        setCameraEnabled(true);
        setCameraTransform(prev => ({ ...prev, visible: true }));
      }
    } catch (err) {
      alert('Unable to access webcam. Keeping high-definition streamer camera preset.');
      setCameraSource('preset');
      setCameraEnabled(true);
    }
  };

  // Request real screen capture
  const handleShareScreenOrGame = async () => {
    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        setGameCustomStream(stream);
        setGameSource('custom_screen');
        setScreenTransform(prev => ({ ...prev, visible: true }));
      }
    } catch (err) {
      console.warn('Screen share cancelled or unavailable', err);
    }
  };

  // Quick Preset Layout Applicators
  const applyPresetLayout = (
    preset: 'split' | 'pip' | 'game_focus' | 'cam_focus' | 'screen_only' | 'cam_only'
  ) => {
    if (preset === 'split') {
      setCameraTransform(prev => ({
        ...prev,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 20,
      }));
      setScreenTransform(prev => ({
        ...prev,
        x: 0,
        y: 50,
        width: 100,
        height: 50,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      }));
    } else if (preset === 'pip') {
      setScreenTransform(prev => ({
        ...prev,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      }));
      setCameraTransform(prev => ({
        ...prev,
        x: 58,
        y: 68,
        width: 38,
        height: 28,
        borderRadius: 16,
        borderStyle: 'pink',
        visible: true,
        zIndex: 30,
      }));
    } else if (preset === 'game_focus') {
      setScreenTransform(prev => ({
        ...prev,
        x: 0,
        y: 0,
        width: 100,
        height: 72,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      }));
      setCameraTransform(prev => ({
        ...prev,
        x: 6,
        y: 74,
        width: 44,
        height: 24,
        borderRadius: 14,
        borderStyle: 'cyan',
        visible: true,
        zIndex: 20,
      }));
    } else if (preset === 'cam_focus') {
      setCameraTransform(prev => ({
        ...prev,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      }));
      setScreenTransform(prev => ({
        ...prev,
        x: 54,
        y: 68,
        width: 42,
        height: 28,
        borderRadius: 16,
        borderStyle: 'cyan',
        visible: true,
        zIndex: 30,
      }));
    } else if (preset === 'screen_only') {
      setScreenTransform(prev => ({
        ...prev,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
      }));
      setCameraTransform(prev => ({ ...prev, visible: false }));
    } else if (preset === 'cam_only') {
      setCameraTransform(prev => ({
        ...prev,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
      }));
      setScreenTransform(prev => ({ ...prev, visible: false }));
    }
  };

  const handleProceedToGoLive = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    startHostLiveStream(streamTitle, streamTopic, streamAbout);
    setMode('active');
  };

  const handleEndLive = () => {
    if (cameraRealStream) {
      cameraRealStream.getTracks().forEach(t => t.stop());
    }
    if (gameCustomStream) {
      gameCustomStream.getTracks().forEach(t => t.stop());
    }
    endHostLiveStream();
  };

  const handleHostSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendLiveComment(chatInput.trim());
    setChatInput('');
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Currently active source in transform inspector
  const activeSourceTransform =
    selectedSourceId === 'camera' ? cameraTransform : selectedSourceId === 'screen' ? screenTransform : null;

  const updateActiveTransform = (updated: Partial<CanvasSourceTransform>) => {
    if (selectedSourceId === 'camera') {
      setCameraTransform(prev => ({ ...prev, ...updated }));
    } else if (selectedSourceId === 'screen') {
      setScreenTransform(prev => ({ ...prev, ...updated }));
    }
  };

  // --------------------------------------------------------------------------
  // MODE A: TikTok Live Studio Inspired Workstation (Pre-Live Setup)
  // --------------------------------------------------------------------------
  if (mode === 'setup') {
    return (
      <div className="flex-1 p-3 sm:p-5 max-w-[1560px] mx-auto w-full flex flex-col justify-start select-none h-full overflow-y-auto">
        {/* Pro Studio Top Command Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800/80 mb-4 shrink-0">
          {/* Brand & Studio Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#ff007a] to-rose-600 flex items-center justify-center shadow-[0_0_15px_rgba(255,0,122,0.4)]">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold font-brand text-white tracking-tight">
                  LIVE Studio Setup
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Ready to Broadcast
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Freely drag, resize, and position your camera and screen layers
              </p>
            </div>
          </div>

          {/* Center: Canvas Aspect Ratio & Grid Guides */}
          <div className="flex items-center gap-2 bg-[#121218] p-1 rounded-2xl border border-neutral-800">
            {/* Portrait 9:16 (TikTok Mobile standard) */}
            <button
              type="button"
              onClick={() => setCanvasAspectRatio('9:16')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                canvasAspectRatio === '9:16'
                  ? 'bg-[#ff007a] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="TikTok Mobile Portrait (9:16)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Portrait 9:16</span>
            </button>

            {/* Landscape 16:9 (Desktop / PC Gaming standard) */}
            <button
              type="button"
              onClick={() => setCanvasAspectRatio('16:9')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                canvasAspectRatio === '16:9'
                  ? 'bg-[#ff007a] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Landscape Desktop (16:9)"
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Landscape 16:9</span>
            </button>
          </div>

          {/* Right Action: Studio Specs & Close */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-neutral-400 bg-[#121218] px-3 py-1.5 rounded-xl border border-neutral-800">
              <span className="text-emerald-400 font-bold">1080p 60fps</span>
              <span>·</span>
              <span>6000 Kbps</span>
              <span>·</span>
              <span className="text-cyan-400">Studio Engine</span>
            </div>

            <button
              onClick={() => setActiveTab('live')}
              className="text-neutral-400 hover:text-white p-2 rounded-xl hover:bg-neutral-800 transition-colors"
              title="Exit Studio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Studio 3-Column Workstation: Left Layers (3 cols) | Center Monitor (6 cols) | Right Settings (3 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
          {/* =========================================================================
              COLUMN 1: SCENE SOURCES & TRANSFORM INSPECTOR (3 Cols)
              ========================================================================= */}
          <div className="lg:col-span-3 flex flex-col gap-4 text-left">
            {/* Card 1: Active Scene Sources List */}
            <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#ff007a]" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Scene Sources
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">
                  {[cameraTransform.visible, screenTransform.visible].filter(Boolean).length} Active
                </span>
              </div>

              {/* Source Item 1: Camera Feed */}
              <div
                onClick={() => setSelectedSourceId('camera')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  selectedSourceId === 'camera'
                    ? 'border-[#ff007a] bg-[#ff007a]/15 shadow-sm'
                    : 'border-neutral-800 bg-[#171722] hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#232336] flex items-center justify-center text-[#ff007a] shrink-0">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Camera (Facecam)</div>
                    <div className="text-[10px] text-neutral-400 truncate">
                      {cameraTransform.width}% × {cameraTransform.height}% · Pos ({cameraTransform.x}%, {cameraTransform.y}%)
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Lock Toggle */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setCameraTransform(prev => ({ ...prev, locked: !prev.locked }));
                    }}
                    className={`p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors ${
                      cameraTransform.locked ? 'text-amber-400' : ''
                    }`}
                    title={cameraTransform.locked ? 'Unlock Position' : 'Lock Position'}
                  >
                    {cameraTransform.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setCameraTransform(prev => ({ ...prev, visible: !prev.visible }));
                    }}
                    className={`p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors ${
                      !cameraTransform.visible ? 'text-red-400' : 'text-emerald-400'
                    }`}
                    title={cameraTransform.visible ? 'Hide Camera' : 'Show Camera'}
                  >
                    {cameraTransform.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Source Item 2: Screen & Game Display */}
              <div
                onClick={() => setSelectedSourceId('screen')}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  selectedSourceId === 'screen'
                    ? 'border-cyan-400 bg-cyan-500/15 shadow-sm'
                    : 'border-neutral-800 bg-[#171722] hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#172233] flex items-center justify-center text-cyan-400 shrink-0">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">Screen & Game Display</div>
                    <div className="text-[10px] text-neutral-400 truncate">
                      {screenTransform.width}% × {screenTransform.height}% · Pos ({screenTransform.x}%, {screenTransform.y}%)
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Lock Toggle */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setScreenTransform(prev => ({ ...prev, locked: !prev.locked }));
                    }}
                    className={`p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors ${
                      screenTransform.locked ? 'text-amber-400' : ''
                    }`}
                    title={screenTransform.locked ? 'Unlock Position' : 'Lock Position'}
                  >
                    {screenTransform.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setScreenTransform(prev => ({ ...prev, visible: !prev.visible }));
                    }}
                    className={`p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors ${
                      !screenTransform.visible ? 'text-red-400' : 'text-emerald-400'
                    }`}
                    title={screenTransform.visible ? 'Hide Screen' : 'Show Screen'}
                  >
                    {screenTransform.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Quick Hardware Connect Buttons */}
              <div className="pt-2 border-t border-neutral-800/80 space-y-2">
                <button
                  type="button"
                  onClick={handleEnableRealWebcam}
                  className="w-full py-2 px-3 rounded-xl bg-[#1e1e2d] hover:bg-[#ff007a]/20 border border-neutral-700 hover:border-[#ff007a] text-xs font-medium text-white flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5 text-[#ff007a]" />
                    <span>{cameraRealStream ? 'Webcam Active ✓' : 'Connect Real Webcam'}</span>
                  </span>
                  <span className="text-[10px] text-neutral-400">USB / Integrated</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareScreenOrGame}
                  className="w-full py-2 px-3 rounded-xl bg-[#15202e] hover:bg-cyan-500/20 border border-neutral-700 hover:border-cyan-400 text-xs font-medium text-white flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{gameCustomStream ? 'Screen Captured ✓' : 'Share Window / Screen'}</span>
                  </span>
                  <span className="text-[10px] text-neutral-400">DisplayMedia</span>
                </button>
              </div>
            </div>

            {/* Card 2: Selected Source Transform & Size Inspector */}
            {activeSourceTransform && (
              <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Transform & Size
                    </span>
                  </div>
                  <span className="text-[10px] text-cyan-400 font-bold px-2 py-0.5 rounded-full bg-cyan-500/15">
                    {activeSourceTransform.name}
                  </span>
                </div>

                {/* Quick Alignment Actions */}
                <div>
                  <span className="text-[11px] font-semibold text-neutral-400 block mb-1.5">
                    Quick Alignments:
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveTransform({
                          x: 0,
                          y: 0,
                          width: 100,
                          height: 100,
                          borderRadius: 0,
                        })
                      }
                      className="py-1.5 px-2 rounded-xl bg-[#1c1c28] hover:bg-neutral-700 text-[10px] font-semibold text-white border border-neutral-700 text-center cursor-pointer"
                    >
                      Fill Canvas
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveTransform({
                          x: Math.round((100 - activeSourceTransform.width) / 2),
                          y: Math.round((100 - activeSourceTransform.height) / 2),
                        })
                      }
                      className="py-1.5 px-2 rounded-xl bg-[#1c1c28] hover:bg-neutral-700 text-[10px] font-semibold text-white border border-neutral-700 text-center cursor-pointer"
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveTransform({
                          x: 58,
                          y: 68,
                          width: 38,
                          height: 28,
                          borderRadius: 16,
                          borderStyle: 'pink',
                        })
                      }
                      className="py-1.5 px-2 rounded-xl bg-[#1c1c28] hover:bg-neutral-700 text-[10px] font-semibold text-white border border-neutral-700 text-center cursor-pointer"
                    >
                      Corner PiP
                    </button>
                  </div>
                </div>

                {/* Width & Height Sliders */}
                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                      <span>Width (Scale)</span>
                      <span className="font-mono text-cyan-300 font-bold">
                        {activeSourceTransform.width}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="100"
                      value={activeSourceTransform.width}
                      onChange={e =>
                        updateActiveTransform({
                          width: Number(e.target.value),
                          x: Math.min(activeSourceTransform.x, 100 - Number(e.target.value)),
                        })
                      }
                      className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer accent-cyan-400"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                      <span>Height (Scale)</span>
                      <span className="font-mono text-cyan-300 font-bold">
                        {activeSourceTransform.height}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={activeSourceTransform.height}
                      onChange={e =>
                        updateActiveTransform({
                          height: Number(e.target.value),
                          y: Math.min(activeSourceTransform.y, 100 - Number(e.target.value)),
                        })
                      }
                      className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer accent-cyan-400"
                    />
                  </div>
                </div>

                {/* X & Y Coordinates */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-800">
                  <div>
                    <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                      <span>Pos X:</span>
                      <span className="font-mono text-white">{activeSourceTransform.x}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={100 - activeSourceTransform.width}
                      value={activeSourceTransform.x}
                      onChange={e => updateActiveTransform({ x: Number(e.target.value) })}
                      className="w-full h-1 bg-neutral-700 rounded-lg cursor-pointer accent-[#ff007a]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                      <span>Pos Y:</span>
                      <span className="font-mono text-white">{activeSourceTransform.y}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={100 - activeSourceTransform.height}
                      value={activeSourceTransform.y}
                      onChange={e => updateActiveTransform({ y: Number(e.target.value) })}
                      className="w-full h-1 bg-neutral-700 rounded-lg cursor-pointer accent-[#ff007a]"
                    />
                  </div>
                </div>

                {/* Styling Options: Border Glow & Mirror */}
                <div className="pt-2 border-t border-neutral-800 space-y-2">
                  {selectedSourceId === 'camera' && (
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveTransform({ mirrored: !activeSourceTransform.mirrored })
                      }
                      className={`w-full py-1.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                        activeSourceTransform.mirrored
                          ? 'bg-[#ff007a]/20 border-[#ff007a] text-white'
                          : 'bg-[#181824] border-neutral-700 text-neutral-300'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <FlipHorizontal className="w-3.5 h-3.5 text-[#ff007a]" />
                        <span>Mirror Camera (Flip Horizontal)</span>
                      </span>
                      <span className="text-[10px] font-mono">
                        {activeSourceTransform.mirrored ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  )}

                  {/* Border Style */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400 text-[11px]">Border Style:</span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { id: 'none', label: 'None' },
                        { id: 'pink', label: 'Neon Pink' },
                        { id: 'cyan', label: 'Cyan' },
                        { id: 'hairline', label: 'Subtle' },
                      ].map(b => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => updateActiveTransform({ borderStyle: b.id as any })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                            activeSourceTransform.borderStyle === b.id
                              ? 'border-[#ff007a] bg-[#ff007a]/20 text-white'
                              : 'border-neutral-800 bg-[#181824] text-neutral-400 hover:text-white'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* =========================================================================
              COLUMN 2: CENTRAL LIVE MONITOR / BROADCAST STAGE (6 Cols)
              ========================================================================= */}
          <div className="lg:col-span-6 flex flex-col items-center">
            {/* Monitor Bezel Frame */}
            <div className="w-full flex flex-col items-center bg-[#0a0a0f] p-3 sm:p-4 rounded-[32px] border border-neutral-800/90 shadow-2xl relative">
              {/* Top Monitor Status Line */}
              <div className="w-full flex items-center justify-between pb-2.5 px-2 text-[11px] text-neutral-400 font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-bold text-white">STUDIO MONITOR</span>
                  <span>·</span>
                  <span className="text-cyan-400">
                    {canvasAspectRatio === '9:16' ? '1080 × 1920 (9:16)' : '1920 × 1080 (16:9)'}
                  </span>
                </div>
                <div className="text-neutral-500 hidden sm:block">
                  Click on canvas source to drag or resize
                </div>
              </div>

              {/* The Live Interactive Canvas Viewport */}
              <div
                className={`w-full relative transition-all duration-300 ${
                  canvasAspectRatio === '16:9'
                    ? 'aspect-video max-h-[460px]'
                    : 'aspect-[9/15] sm:aspect-[9/14] max-h-[580px]'
                }`}
              >
                <LiveStreamCanvas
                  layoutMode="custom"
                  canvasAspectRatio={canvasAspectRatio}
                  cameraEnabled={cameraEnabled}
                  cameraSource={cameraSource}
                  gameSource={gameSource}
                  gameCustomStream={gameCustomStream}
                  cameraRealStream={cameraRealStream}
                  showOverlays={showOverlays}
                  showMusicBanner={showMusicBanner}
                  showGoalBar={showGoalBar}
                  hostName={currentUser?.displayName || 'Host'}
                  timerText="PREVIEW"
                  isLive={false}
                  isInteractive={true}
                  cameraTransform={cameraTransform}
                  screenTransform={screenTransform}
                  selectedSourceId={selectedSourceId}
                  onSelectSource={setSelectedSourceId}
                  onUpdateCameraTransform={t => setCameraTransform(prev => ({ ...prev, ...t }))}
                  onUpdateScreenTransform={t => setScreenTransform(prev => ({ ...prev, ...t }))}
                  showGrid={showGrid}
                  showSafeArea={showSafeArea}
                />
              </div>

              {/* Canvas Bottom Action Bar with 1-Click Studio Layout Presets */}
              <div className="w-full mt-3 pt-3 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-neutral-400 font-medium">Layout Presets:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPresetLayout('pip')}
                    className="px-2.5 py-1 rounded-xl bg-[#171722] hover:bg-[#ff007a]/20 border border-neutral-700 hover:border-[#ff007a] text-[11px] font-semibold text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Picture-in-Picture
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetLayout('split')}
                    className="px-2.5 py-1 rounded-xl bg-[#171722] hover:bg-[#ff007a]/20 border border-neutral-700 hover:border-[#ff007a] text-[11px] font-semibold text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Stacked Split
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetLayout('game_focus')}
                    className="px-2.5 py-1 rounded-xl bg-[#171722] hover:bg-[#ff007a]/20 border border-neutral-700 hover:border-[#ff007a] text-[11px] font-semibold text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Gaming Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetLayout('cam_focus')}
                    className="px-2.5 py-1 rounded-xl bg-[#171722] hover:bg-[#ff007a]/20 border border-neutral-700 hover:border-[#ff007a] text-[11px] font-semibold text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Facecam First
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              COLUMN 3: STREAM DETAILS & AUDIO MIXER (3 Cols)
              ========================================================================= */}
          <div className="lg:col-span-3 flex flex-col gap-4 text-left">
            <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-4">
              {/* Studio Segmented Tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#181824] rounded-2xl border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setRightStudioTab('details')}
                  className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                    rightStudioTab === 'details'
                      ? 'bg-[#ff007a] text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setRightStudioTab('audio')}
                  className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                    rightStudioTab === 'audio'
                      ? 'bg-[#ff007a] text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Mixer
                </button>
                <button
                  type="button"
                  onClick={() => setRightStudioTab('overlays')}
                  className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                    rightStudioTab === 'overlays'
                      ? 'bg-[#ff007a] text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Overlays
                </button>
              </div>

              {/* TAB 1: STREAM DETAILS */}
              {rightStudioTab === 'details' && (
                <div className="space-y-3.5">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-neutral-300">
                        Stream Title:
                      </label>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {streamTitle.length}/60
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={60}
                      placeholder="e.g. Grinding Ranked Games & Chill Chat!"
                      value={streamTitle}
                      onChange={e => setStreamTitle(e.target.value)}
                      className="w-full bg-[#181824] text-xs font-semibold text-white px-3.5 py-2.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                      Category / Topic:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      {['Gaming', 'Just Chatting', 'Music', 'Creative', 'Tech', 'Anime'].map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setStreamTopic(t)}
                          className={`py-1.5 px-2.5 rounded-xl text-[11px] font-semibold border text-center transition-all cursor-pointer ${
                            streamTopic === t
                              ? 'bg-[#ff007a]/20 border-[#ff007a] text-white font-bold'
                              : 'bg-[#181824] border-neutral-800 text-neutral-400 hover:text-white'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Or enter custom topic"
                      value={streamTopic}
                      onChange={e => setStreamTopic(e.target.value)}
                      className="w-full bg-[#181824] text-xs text-white px-3 py-1.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-neutral-300 block mb-1">
                      Stream Bio / About Me:
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Tell viewers what today's broadcast is about..."
                      value={streamAbout}
                      onChange={e => setStreamAbout(e.target.value)}
                      className="w-full bg-[#181824] text-xs text-white p-3 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none resize-none leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: AUDIO MIXER DOCK (TikTok Live Studio style) */}
              {rightStudioTab === 'audio' && (
                <div className="space-y-4">
                  {/* Channel 1: Microphone */}
                  <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mic className={`w-4 h-4 ${micActive ? 'text-[#ff007a]' : 'text-neutral-500'}`} />
                        <span className="text-xs font-bold text-white">Microphone</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMicActive(!micActive)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${
                          micActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {micActive ? 'LIVE' : 'MUTED'}
                      </button>
                    </div>

                    {/* Animated Peak Level Meter */}
                    <div className="space-y-1">
                      <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${micMeterLevel}%` }}
                          className={`h-full transition-all duration-100 ${
                            micMeterLevel > 80
                              ? 'bg-red-500'
                              : micMeterLevel > 60
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                          }`}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                        <span>-40dB</span>
                        <span>-12dB</span>
                        <span>0dB</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-neutral-400">
                      <span>Gain:</span>
                      <span className="font-mono text-white">{micGain}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={micGain}
                      onChange={e => setMicGain(Number(e.target.value))}
                      className="w-full h-1 bg-neutral-700 rounded-lg cursor-pointer accent-[#ff007a]"
                    />
                  </div>

                  {/* Channel 2: System / Desktop Game Audio */}
                  <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {desktopAudioMuted ? (
                          <VolumeX className="w-4 h-4 text-neutral-500" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-cyan-400" />
                        )}
                        <span className="text-xs font-bold text-white">System & Game Audio</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDesktopAudioMuted(!desktopAudioMuted)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${
                          !desktopAudioMuted
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {!desktopAudioMuted ? 'ACTIVE' : 'MUTED'}
                      </button>
                    </div>

                    {/* Peak Meter */}
                    <div className="space-y-1">
                      <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${desktopMeterLevel}%` }}
                          className="h-full bg-cyan-400 transition-all duration-100"
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
                        <span>-40dB</span>
                        <span>-12dB</span>
                        <span>0dB</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-neutral-400">
                      <span>Volume:</span>
                      <span className="font-mono text-white">{desktopAudioGain}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={desktopAudioGain}
                      onChange={e => setDesktopAudioGain(Number(e.target.value))}
                      className="w-full h-1 bg-neutral-700 rounded-lg cursor-pointer accent-cyan-400"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: BROADCAST OVERLAYS */}
              {rightStudioTab === 'overlays' && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                    Interactive Overlays
                  </span>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#181824] border border-neutral-800 text-xs text-neutral-300 cursor-pointer hover:border-neutral-700 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">Follower Goal Bar (4083/4100)</span>
                      <span className="text-[10px] text-neutral-400">Display stream follower milestone overlay</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showGoalBar}
                      onChange={e => setShowGoalBar(e.target.checked)}
                      className="rounded accent-[#ff007a] w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>
              )}

              {/* Hot Pink "Go LIVE" Button positioned right on this spot */}
              <div className="pt-3 border-t border-neutral-800/80">
                <button
                  type="button"
                  onClick={() => handleProceedToGoLive()}
                  className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#ff007a] via-[#ff1493] to-[#d00062] hover:from-[#ff2e93] hover:to-[#e6006c] text-white font-extrabold text-sm sm:text-base shadow-[0_0_30px_rgba(255,0,122,0.6)] transition-all cursor-pointer transform hover:scale-[1.02] active:scale-98 border border-white/20 flex items-center justify-center gap-2.5"
                >
                  <Radio className="w-5 h-5 text-white animate-pulse" />
                  <span>Go LIVE</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MODE B: Active Broadcast (Host View during live stream)
  // --------------------------------------------------------------------------
  return (
    <div className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full h-[calc(100vh-4rem)] flex flex-col select-none">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
        {/* Left Column (3 cols): Host Controls (Title, Topic, About me, "End Live" button) */}
        <div className="lg:col-span-3 bg-[#13131a] rounded-3xl border border-neutral-800 p-5 flex flex-col justify-between shadow-xl">
          <div className="space-y-4 text-left">
            <div>
              <label className="text-xs font-bold text-neutral-400 block mb-1">Title:</label>
              <input
                type="text"
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
                className="w-full bg-[#181824] text-xs font-semibold text-white px-3.5 py-2.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-400 block mb-1">Topic:</label>
              <input
                type="text"
                value={streamTopic}
                onChange={e => setStreamTopic(e.target.value)}
                className="w-full bg-[#181824] text-xs font-semibold text-white px-3.5 py-2.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-400 block mb-1">About me:</label>
              <textarea
                rows={4}
                value={streamAbout}
                onChange={e => setStreamAbout(e.target.value)}
                className="w-full bg-[#181824] text-xs text-white p-3.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none resize-none leading-relaxed"
              />
            </div>

            {/* Live Audio Visualizer */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                <span>Mic Gain</span>
                <span className="text-emerald-400 font-mono">-12 dB</span>
              </div>
              <div className="flex gap-1 h-3 items-end">
                {[40, 65, 80, 50, 90, 75, 60, 85, 95, 70, 50, 60, 40].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className={`flex-1 rounded-sm ${
                      h > 85 ? 'bg-red-500' : h > 70 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* End Live Button */}
          <button
            onClick={handleEndLive}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-extrabold text-sm shadow-[0_0_20px_rgba(255,0,122,0.4)] transition-all cursor-pointer transform active:scale-95"
          >
            End Live
          </button>
        </div>

        {/* Center Column (6 cols): Composed Live Broadcast Screen with camera & game display */}
        <div className="lg:col-span-6 flex flex-col justify-between h-full min-h-0">
          <div className="w-full h-full relative">
            <LiveStreamCanvas
              layoutMode="custom"
              canvasAspectRatio={canvasAspectRatio}
              cameraEnabled={cameraEnabled}
              cameraSource={cameraSource}
              gameSource={gameSource}
              gameCustomStream={gameCustomStream}
              cameraRealStream={cameraRealStream}
              showOverlays={showOverlays}
              showMusicBanner={showMusicBanner}
              showGoalBar={showGoalBar}
              hostName={currentUser?.displayName || 'Host'}
              timerText={formatTimer(elapsedSeconds)}
              isLive={true}
              cameraTransform={cameraTransform}
              screenTransform={screenTransform}
              isInteractive={false}
            />
          </div>
        </div>

        {/* Right Column (3 cols): Viewers & Source Tools */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Viewers Box */}
          <div className="bg-[#13131a] rounded-3xl border border-neutral-800 p-4 flex-1 flex flex-col shadow-xl min-h-0">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <span className="text-xs font-bold text-white font-brand">
                Viewers {currentLiveStream.viewers.length}
              </span>
              <span className="text-[10px] text-[#ff007a] bg-pink-500/10 px-2 py-0.5 rounded-full font-bold">
                Online
              </span>
            </div>

            {/* Viewers List */}
            <div className="flex-1 overflow-y-auto py-2 space-y-3 text-left">
              {currentLiveStream.viewers.map(viewer => (
                <div key={viewer.id} className="flex items-center gap-2.5">
                  <Avatar src={viewer.avatar} alt={viewer.displayName} size="sm" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {viewer.displayName}
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      @{viewer.username}
                    </div>
                  </div>
                </div>
              ))}
              {currentLiveStream.viewers.length === 0 && (
                <div className="text-center py-8 text-neutral-500 text-xs">
                  No viewers joined yet.
                </div>
              )}
            </div>

            {/* Host Live Chat input */}
            <form onSubmit={handleHostSendChat} className="pt-2 border-t border-neutral-800">
              <div className="flex items-center gap-2 bg-[#181824] rounded-2xl px-3 py-1.5 border border-neutral-700">
                <input
                  type="text"
                  placeholder="Chat with viewers..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="text-[#ff007a] hover:text-white p-1 disabled:opacity-30 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Tool Panel: Quick toggles */}
          <div className="bg-[#13131a] rounded-3xl border border-neutral-800 p-4 shadow-xl">
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center mb-3">
              Stream Peripherals
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => {
                  setCameraEnabled(!cameraEnabled);
                  setCameraTransform(prev => ({ ...prev, visible: !prev.visible }));
                }}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  cameraEnabled && cameraTransform.visible
                    ? 'bg-[#ff007a]/20 border-[#ff007a] text-white'
                    : 'bg-[#181824] border-neutral-700 text-neutral-400'
                }`}
                title="Camera"
              >
                <Camera className="w-5 h-5" />
              </button>

              <button
                onClick={() => setMicActive(!micActive)}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  micActive
                    ? 'bg-[#ff007a]/20 border-[#ff007a] text-white'
                    : 'bg-[#181824] border-neutral-700 text-neutral-400'
                }`}
                title="Microphone"
              >
                <Mic className="w-5 h-5" />
              </button>

              <button
                onClick={handleShareScreenOrGame}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  gameCustomStream
                    ? 'bg-cyan-500/20 border-cyan-400 text-white'
                    : 'bg-[#181824] border-neutral-700 text-neutral-400'
                }`}
                title="Screen Share / Game Window"
              >
                <Monitor className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowOverlays(!showOverlays)}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  showOverlays
                    ? 'bg-[#ff007a]/20 border-[#ff007a] text-white'
                    : 'bg-[#181824] border-neutral-700 text-neutral-400'
                }`}
                title="HUD & Overlays"
              >
                <BarChart2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
