import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  LiveStreamCanvas,
  LayoutMode,
  GamePreset,
  GoalWidgetConfig,
} from './LiveStreamCanvas';
import { Avatar } from '../common/Avatar';
import { CanvasSourceTransform } from '../../types';
import {
  Camera,
  Mic,
  Monitor,
  Radio,
  Send,
  Sliders,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Smartphone,
  Laptop,
  FlipHorizontal,
  Grid,
  ShieldCheck,
  Volume2,
  VolumeX,
  MessageSquare,
  Users,
  Target,
  Info,
  Smile,
  LogOut,
  Maximize2,
  ChevronDown,
  X,
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
  } = useApp();

  const [mode, setMode] = useState<'setup' | 'active'>(initialMode);

  // Stream Info Fields (Editable before live; Locked read-only while live)
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

  // Adjustable Goal Bar Widget State
  const [goalWidgetConfig, setGoalWidgetConfig] = useState<GoalWidgetConfig>({
    enabled: true,
    title: 'Follower Goal',
    current: 4083,
    target: 4100,
    posY: 13,
    widthPercent: 92,
    theme: 'pink',
  });

  const [selectedSourceId, setSelectedSourceId] = useState<'camera' | 'screen' | 'goal_bar' | null>('camera');

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
  const [showGoalBar, setShowGoalBar] = useState(true);

  // Right Studio Tab in Setup Mode: 'details' | 'audio' | 'overlays'
  const [rightStudioTab, setRightStudioTab] = useState<'details' | 'audio' | 'overlays'>('details');

  // Left & Right Tabs in Active Live Mode
  const [liveActiveLeftTab, setLiveActiveLeftTab] = useState<'layout' | 'mixer' | 'info'>('layout');
  const [liveActiveRightTab, setLiveActiveRightTab] = useState<'chat' | 'viewers'>('chat');

  // Live timer for active broadcast
  const [elapsedSeconds, setElapsedSeconds] = useState(currentLiveStream.timerSeconds || 0);
  const [chatInput, setChatInput] = useState('');

  // Audio VU Meter Simulation
  const [micMeterLevel, setMicMeterLevel] = useState(65);
  const [desktopMeterLevel, setDesktopMeterLevel] = useState(50);

  // Chat auto-scroll anchor ref
  const commentsEndRef = useRef<HTMLDivElement>(null);

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

  // Scroll to bottom when new chat messages arrive in live broadcast
  useEffect(() => {
    if (mode === 'active' && liveActiveRightTab === 'chat') {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentLiveStream.messages.length, mode, liveActiveRightTab]);

  // Studio Controls Dropdown in Live Broadcast mode
  const studioDropdownRef = useRef<HTMLDivElement>(null);
  const [studioDropdownOpen, setStudioDropdownOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        studioDropdownRef.current &&
        !studioDropdownRef.current.contains(e.target as Node)
      ) {
        setStudioDropdownOpen(false);
      }
    };
    if (studioDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [studioDropdownOpen]);

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
        zIndex: 20,
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
        x: 64,
        y: 74,
        width: 32,
        height: 22,
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
        x: 60,
        y: 68,
        width: 36,
        height: 28,
        borderRadius: 14,
        borderStyle: 'cyan',
        visible: true,
        zIndex: 20,
      }));
    }
  };

  const activeSourceTransform =
    selectedSourceId === 'camera'
      ? cameraTransform
      : selectedSourceId === 'screen'
      ? screenTransform
      : null;

  const updateActiveTransform = (updated: Partial<CanvasSourceTransform>) => {
    if (selectedSourceId === 'camera') {
      setCameraTransform(prev => ({ ...prev, ...updated }));
    } else if (selectedSourceId === 'screen') {
      setScreenTransform(prev => ({ ...prev, ...updated }));
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${(mins % 60)
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

  const QUICK_REACTION_EMOJIS = ['❤️', '🔥', '👏', '🎮', '💖', '✨', '👋', '💯'];

  // ==========================================================================
  // SHARED COMPONENT: Scene Sources Layer Stack
  // ==========================================================================
  const renderSceneSourcesStack = () => (
    <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#ff007a]" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Scene Sources
          </span>
        </div>
        <span className="text-[10px] text-neutral-400 font-mono">3 Layers</span>
      </div>

      <div className="space-y-2">
        {/* Source Item 1: Camera */}
        <div
          onClick={() => setSelectedSourceId('camera')}
          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
            selectedSourceId === 'camera'
              ? 'border-[#ff007a] bg-[#ff007a]/15 shadow-sm'
              : 'border-neutral-800 bg-[#171722] hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#241724] flex items-center justify-center text-[#ff007a] shrink-0">
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
            {/* Mirror Toggle */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setCameraTransform(prev => ({ ...prev, mirrored: !prev.mirrored }));
              }}
              className={`p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors ${
                cameraTransform.mirrored ? 'text-cyan-400' : ''
              }`}
              title="Mirror Camera"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>

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

        {/* Source Item 3: Follower Goal Widget (Adjustable Widget) */}
        <div
          onClick={() => setSelectedSourceId('goal_bar')}
          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
            selectedSourceId === 'goal_bar'
              ? 'border-purple-400 bg-purple-500/15 shadow-sm'
              : 'border-neutral-800 bg-[#171722] hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#251733] flex items-center justify-center text-purple-400 shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">Follower Goal Widget</div>
              <div className="text-[10px] text-neutral-400 truncate">
                {goalWidgetConfig.widthPercent}% Width · Y: {goalWidgetConfig.posY}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Toggle Widget */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setGoalWidgetConfig(prev => ({ ...prev, enabled: !prev.enabled }));
                setShowGoalBar(!goalWidgetConfig.enabled);
              }}
              className={`p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors ${
                goalWidgetConfig.enabled ? 'text-emerald-400' : 'text-red-400'
              }`}
              title={goalWidgetConfig.enabled ? 'Disable Widget' : 'Enable Widget'}
            >
              {goalWidgetConfig.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>
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
  );

  // ==========================================================================
  // SHARED COMPONENT: Selected Source Inspector (Camera, Screen, or Goal Widget)
  // ==========================================================================
  const renderSourceInspector = () => {
    // 1. Goal Widget Inspector (Adjustable Widget Controls)
    if (selectedSourceId === 'goal_bar') {
      return (
        <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Goal Widget Settings
              </span>
            </div>
            <span className="text-[10px] text-purple-400 font-bold px-2 py-0.5 rounded-full bg-purple-500/15">
              Interactive
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                <span>Vertical Position (Y):</span>
                <span className="font-mono text-purple-300 font-bold">{goalWidgetConfig.posY}%</span>
              </div>
              <input
                type="range"
                min="2"
                max="85"
                value={goalWidgetConfig.posY}
                onChange={e =>
                  setGoalWidgetConfig(prev => ({ ...prev, posY: Number(e.target.value) }))
                }
                className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer accent-purple-400"
              />
              <span className="text-[10px] text-neutral-500 mt-0.5 block">
                Tip: You can also drag the widget directly on the monitor!
              </span>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                <span>Width (Scale):</span>
                <span className="font-mono text-purple-300 font-bold">
                  {goalWidgetConfig.widthPercent}%
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="100"
                value={goalWidgetConfig.widthPercent}
                onChange={e =>
                  setGoalWidgetConfig(prev => ({
                    ...prev,
                    widthPercent: Number(e.target.value),
                  }))
                }
                className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer accent-purple-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-neutral-400 block mb-1">
                Widget Title:
              </label>
              <input
                type="text"
                value={goalWidgetConfig.title || 'Follower Goal'}
                onChange={e =>
                  setGoalWidgetConfig(prev => ({ ...prev, title: e.target.value }))
                }
                className="w-full bg-[#181824] text-xs text-white px-3 py-1.5 rounded-xl border border-neutral-700/80 focus:border-purple-400 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                  Current:
                </label>
                <input
                  type="number"
                  value={goalWidgetConfig.current}
                  onChange={e =>
                    setGoalWidgetConfig(prev => ({ ...prev, current: Number(e.target.value) }))
                  }
                  className="w-full bg-[#181824] text-xs text-white px-2.5 py-1.5 rounded-xl border border-neutral-700/80 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                  Target:
                </label>
                <input
                  type="number"
                  value={goalWidgetConfig.target}
                  onChange={e =>
                    setGoalWidgetConfig(prev => ({ ...prev, target: Number(e.target.value) }))
                  }
                  className="w-full bg-[#181824] text-xs text-white px-2.5 py-1.5 rounded-xl border border-neutral-700/80 outline-none"
                />
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-neutral-400 block mb-1.5">
                Color Theme:
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'pink', name: 'Pink', bg: 'bg-[#ff007a]' },
                  { id: 'cyan', name: 'Cyan', bg: 'bg-cyan-400' },
                  { id: 'purple', name: 'Purple', bg: 'bg-purple-500' },
                  { id: 'gold', name: 'Gold', bg: 'bg-amber-400' },
                ].map(th => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() =>
                      setGoalWidgetConfig(prev => ({
                        ...prev,
                        theme: th.id as GoalWidgetConfig['theme'],
                      }))
                    }
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      goalWidgetConfig.theme === th.id
                        ? 'border-white bg-white/10 text-white font-extrabold'
                        : 'border-neutral-800 bg-[#181824] text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${th.bg}`} />
                    <span>{th.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 2. Camera or Screen Transform Inspector
    if (!activeSourceTransform) return null;

    return (
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

        {/* Border Glow Style */}
        <div>
          <span className="text-[11px] font-semibold text-neutral-400 block mb-1.5">
            Border Glow:
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'none', label: 'None' },
              { id: 'pink', label: 'Pink' },
              { id: 'cyan', label: 'Cyan' },
              { id: 'hairline', label: 'White' },
            ].map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() =>
                  updateActiveTransform({
                    borderStyle: b.id as CanvasSourceTransform['borderStyle'],
                  })
                }
                className={`py-1 rounded-xl text-[10px] font-bold border transition-all cursor-pointer ${
                  activeSourceTransform.borderStyle === b.id
                    ? 'border-[#ff007a] bg-[#ff007a]/20 text-white font-bold'
                    : 'border-neutral-800 bg-[#181824] text-neutral-400 hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // SHARED COMPONENT: Audio Mixer Panel
  // ==========================================================================
  const renderAudioMixer = () => (
    <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-4 text-left">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Audio Mixer
          </span>
        </div>
        <span className="text-[10px] text-cyan-400 font-bold px-2 py-0.5 rounded-full bg-cyan-500/15">
          Pro VU Meter
        </span>
      </div>

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
  );

  // ==========================================================================
  // SHARED COMPONENT: Locked Stream Info Details (Read-only during broadcast)
  // ==========================================================================
  const renderLockedStreamInfo = () => (
    <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-3.5 text-left">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Stream Details
          </span>
        </div>
        <span className="text-[10px] text-amber-400 font-bold px-2 py-0.5 rounded-full bg-amber-500/15 flex items-center gap-1">
          <Lock className="w-2.5 h-2.5" />
          Locked While LIVE
        </span>
      </div>

      <div className="space-y-3">
        {/* Stream Title */}
        <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800/80">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
            Stream Title:
          </div>
          <div className="text-xs font-bold text-white break-words">
            {streamTitle || 'Untitled Stream'}
          </div>
        </div>

        {/* Category / Topic */}
        <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800/80">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
            Category / Topic:
          </div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-xl bg-[#ff007a]/20 border border-[#ff007a]/40 text-[#ff007a] font-extrabold text-xs">
            {streamTopic || 'General'}
          </div>
        </div>

        {/* Stream Bio */}
        <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800/80">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
            Stream Bio / About:
          </div>
          <div className="text-xs text-neutral-300 leading-relaxed break-words whitespace-pre-wrap">
            {streamAbout || 'Welcome to my stream! Enjoy the broadcast.'}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Stream metadata (Title, Category, Bio) cannot be edited while broadcasting to keep search indexing consistent. You can still adjust your layout, camera, screen, and overlays anytime!
          </span>
        </div>
      </div>
    </div>
  );

  // ==========================================================================
  // MODE A: Live Studio Setup Workstation (Before Starting Live)
  // ==========================================================================
  if (mode === 'setup') {
    return (
      <div className="flex-1 w-full bg-[#0c0c12] text-white p-3 sm:p-5 select-none animate-fadeIn">
        {/* Top Command Bar */}
        <div className="w-full max-w-7xl mx-auto mb-4 bg-[#121218] p-3 rounded-2xl border border-neutral-800 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff007a] animate-ping" />
              <span className="font-brand font-bold text-white text-sm sm:text-base tracking-wide">
                VIRALHUB LIVE STUDIO
              </span>
            </div>
            <span className="hidden md:inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-pink-500/20 text-[#ff007a] border border-pink-500/30">
              Studio Setup
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {/* Aspect Ratio Switcher */}
            <div className="flex items-center bg-[#181824] p-1 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setCanvasAspectRatio('9:16')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  canvasAspectRatio === '9:16'
                    ? 'bg-[#ff007a] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Portrait (9:16)</span>
              </button>

              <button
                type="button"
                onClick={() => setCanvasAspectRatio('16:9')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  canvasAspectRatio === '16:9'
                    ? 'bg-[#ff007a] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Landscape (16:9)</span>
              </button>
            </div>

            {/* Grid Alignment Toggle */}
            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showGrid
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                  : 'bg-[#181824] text-neutral-400 border-neutral-800 hover:text-white'
              }`}
              title="Studio Alignment Grid"
            >
              <Grid className="w-4 h-4" />
            </button>

            {/* Safe Area Toggle */}
            <button
              type="button"
              onClick={() => setShowSafeArea(!showSafeArea)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showSafeArea
                  ? 'bg-[#ff007a]/20 text-[#ff007a] border-[#ff007a]'
                  : 'bg-[#181824] text-neutral-400 border-neutral-800 hover:text-white'
              }`}
              title="Mobile Safe Area Guides"
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-COLUMN WORKSTATION */}
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* COLUMN 1: SCENE SOURCES & TRANSFORM INSPECTOR (3 Cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4 text-left">
            {renderSceneSourcesStack()}
            {renderSourceInspector()}
          </div>

          {/* COLUMN 2: CENTRAL LIVE MONITOR / BROADCAST STAGE (6 Cols) */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="w-full flex flex-col items-center bg-[#0a0a0f] p-3 sm:p-4 rounded-[32px] border border-neutral-800/90 shadow-2xl relative">
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
                  showGoalBar={showGoalBar || !!goalWidgetConfig.enabled}
                  goalWidgetConfig={goalWidgetConfig}
                  onUpdateGoalWidgetConfig={cfg =>
                    setGoalWidgetConfig(prev => ({ ...prev, ...cfg }))
                  }
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

          {/* COLUMN 3: STREAM DETAILS & AUDIO MIXER (3 Cols) */}
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

              {/* TAB 2: AUDIO MIXER DOCK */}
              {rightStudioTab === 'audio' && renderAudioMixer()}

              {/* TAB 3: BROADCAST OVERLAYS */}
              {rightStudioTab === 'overlays' && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                    Interactive Overlays
                  </span>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#181824] border border-neutral-800 text-xs text-neutral-300 cursor-pointer hover:border-neutral-700 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        {goalWidgetConfig.title} ({goalWidgetConfig.current}/{goalWidgetConfig.target})
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        Adjustable follower milestone widget
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={goalWidgetConfig.enabled}
                      onChange={e => {
                        setGoalWidgetConfig(prev => ({ ...prev, enabled: e.target.checked }));
                        setShowGoalBar(e.target.checked);
                      }}
                      className="rounded accent-[#ff007a] w-4 h-4 cursor-pointer"
                    />
                  </label>
                </div>
              )}

              {/* Hot Pink "Go LIVE" Button */}
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

  // ==========================================================================
  // MODE B: REDESIGNED ACTIVE BROADCAST WORKSTATION (When Host Started Live)
  //
  // - Host CAN still edit LIVE LAYOUT (camera, screen, presets, aspect ratio, audio)
  // - Details like "Title", "Category", and "Stream Bio" are locked (read-only)
  // - Host CAN see live comments and chat with viewers
  // - Follower Goal Widget is fully adjustable (position, width, title, theme)
  // ==========================================================================
  return (
    <div className="flex-1 w-full bg-[#0c0c12] text-white p-3 sm:p-5 select-none animate-fadeIn flex flex-col">
      {/* Top Live Command Bar */}
      <div className="w-full max-w-7xl mx-auto mb-4 bg-[#121218] p-3 rounded-2xl border border-neutral-800 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        {/* Left: Live Indicator & Locked Stream Details Summary */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-white font-extrabold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="tracking-wider">LIVE</span>
            <span className="text-red-300 font-mono font-bold">
              {formatTimer(elapsedSeconds)}
            </span>
          </div>

          {/* Locked Stream Title & Category Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-white text-xs sm:text-sm truncate max-w-[200px] sm:max-w-xs">
              {streamTitle || 'Live Broadcast'}
            </span>
            <span className="px-2 py-0.5 rounded-lg bg-[#ff007a]/20 border border-[#ff007a]/40 text-[#ff007a] text-[10px] font-bold shrink-0">
              {streamTopic}
            </span>
            <span
              className="hidden md:flex items-center gap-1 text-[10px] text-neutral-400 bg-[#181824] px-2 py-0.5 rounded-lg border border-neutral-800 shrink-0"
              title="Stream title, category, and bio are locked while live"
            >
              <Lock className="w-3 h-3 text-neutral-500" />
              <span>Details Locked</span>
            </span>
          </div>
        </div>

        {/* Center/Right: Dropdown + Layout View Controls + Viewers + End Live */}
        <div className="flex items-center gap-2 text-xs">
          {/* Studio Controls Dropdown Trigger (Sources, Audio Mixer, Stream Details) */}
          <div className="relative" ref={studioDropdownRef}>
            <button
              type="button"
              onClick={() => setStudioDropdownOpen(!studioDropdownOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-md ${
                studioDropdownOpen
                  ? 'bg-[#ff007a] text-white border-[#ff007a] shadow-[0_0_15px_rgba(255,0,122,0.4)]'
                  : 'bg-[#181824] hover:bg-[#202030] text-neutral-200 border-neutral-700 hover:border-neutral-500'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-[#ff007a]" />
              <span>Studio Controls</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  studioDropdownOpen ? 'rotate-180 text-white' : 'text-neutral-400'
                }`}
              />
            </button>

            {/* Dropdown Menu Overlay */}
            {studioDropdownOpen && (
              <div className="absolute right-0 sm:left-0 top-full mt-2 w-[340px] sm:w-[380px] max-h-[80vh] overflow-y-auto bg-[#101018]/98 backdrop-blur-xl border border-neutral-700/90 rounded-3xl p-4 shadow-2xl z-50 animate-fadeIn space-y-4 text-left">
                {/* Dropdown Header */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#ff007a]" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Studio Controls
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStudioDropdownOpen(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tabs: Sources | Audio Mixer | Stream Details */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#181824] rounded-2xl border border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setLiveActiveLeftTab('layout')}
                    className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                      liveActiveLeftTab === 'layout'
                        ? 'bg-[#ff007a] text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Sources
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiveActiveLeftTab('mixer')}
                    className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                      liveActiveLeftTab === 'mixer'
                        ? 'bg-[#ff007a] text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Audio Mixer
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiveActiveLeftTab('info')}
                    className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer ${
                      liveActiveLeftTab === 'info'
                        ? 'bg-[#ff007a] text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Details
                  </button>
                </div>

                {/* Dropdown Content */}
                {liveActiveLeftTab === 'layout' && (
                  <div className="space-y-4">
                    {renderSceneSourcesStack()}
                    {renderSourceInspector()}
                  </div>
                )}
                {liveActiveLeftTab === 'mixer' && renderAudioMixer()}
                {liveActiveLeftTab === 'info' && renderLockedStreamInfo()}
              </div>
            )}
          </div>

          {/* Aspect Ratio Switcher */}
          <div className="flex items-center bg-[#181824] p-1 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => setCanvasAspectRatio('9:16')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                canvasAspectRatio === '9:16'
                  ? 'bg-[#ff007a] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>9:16</span>
            </button>

            <button
              type="button"
              onClick={() => setCanvasAspectRatio('16:9')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                canvasAspectRatio === '16:9'
                  ? 'bg-[#ff007a] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>16:9</span>
            </button>
          </div>

          {/* Grid & Safe Area Toggles */}
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              showGrid
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                : 'bg-[#181824] text-neutral-400 border-neutral-800 hover:text-white'
            }`}
            title="Studio Alignment Grid"
          >
            <Grid className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowSafeArea(!showSafeArea)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              showSafeArea
                ? 'bg-[#ff007a]/20 text-[#ff007a] border-[#ff007a]'
                : 'bg-[#181824] text-neutral-400 border-neutral-800 hover:text-white'
            }`}
            title="Mobile Safe Area Guides"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>

          {/* Viewers Counter Badge */}
          <div className="flex items-center gap-1.5 bg-[#181824] px-3 py-1.5 rounded-xl border border-neutral-800 font-bold text-white text-xs">
            <Radio className="w-3.5 h-3.5 text-[#ff007a] animate-pulse" />
            <span>{currentLiveStream.viewers.length} Viewers</span>
          </div>

          {/* End Live Button */}
          <button
            type="button"
            onClick={handleEndLive}
            className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-red-600 to-[#d00062] hover:from-red-500 hover:to-[#e6006c] text-white font-extrabold text-xs shadow-[0_0_15px_rgba(255,0,80,0.4)] transition-all cursor-pointer flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>End Live</span>
          </button>
        </div>
      </div>

      {/* Main Live Workstation: Wide Broadcast Monitor Stage (8 cols) + Compact Comments Dock (4 cols) */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 items-stretch min-h-0">
        {/* =========================================================================
            BROADCAST STAGE (8 Cols on desktop): Immersive Live Monitor Canvas
            ========================================================================= */}
        <div className="lg:col-span-8 flex flex-col min-h-0">
          <div className="w-full h-full flex flex-col justify-between bg-[#0a0a0f] p-3 sm:p-4 rounded-[32px] border border-neutral-800/90 shadow-2xl relative min-h-0">
            <div className="w-full flex items-center justify-between pb-2 px-2 text-[11px] text-neutral-400 font-mono shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span className="font-bold text-white">LIVE ON AIR</span>
                <span>·</span>
                <span className="text-cyan-400">
                  {canvasAspectRatio === '9:16' ? '1080 × 1920 (9:16)' : '1920 × 1080 (16:9)'}
                </span>
                <span>·</span>
                <span className="text-emerald-400">1080p 60fps</span>
              </div>
              <div className="text-neutral-500 hidden sm:block">
                Drag sources & widgets freely on canvas
              </div>
            </div>

            {/* The Live Interactive Canvas Viewport */}
            <div
              className={`w-full relative transition-all duration-300 my-auto ${
                canvasAspectRatio === '16:9'
                  ? 'aspect-video max-h-[480px]'
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
                showGoalBar={showGoalBar || !!goalWidgetConfig.enabled}
                goalWidgetConfig={goalWidgetConfig}
                onUpdateGoalWidgetConfig={cfg =>
                  setGoalWidgetConfig(prev => ({ ...prev, ...cfg }))
                }
                hostName={currentUser?.displayName || 'Host'}
                timerText={formatTimer(elapsedSeconds)}
                isLive={true}
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
            <div className="w-full mt-2 pt-2.5 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
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
            LIVE COMMENTS & VIEWERS (4 Cols on desktop): Pinned cleanly, NO excess below
            ========================================================================= */}
        <div className="lg:col-span-4 flex flex-col text-left min-h-0">
          <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 w-full h-full flex flex-col justify-between shadow-xl min-h-0">
            {/* Header Tabs: Live Comments vs Viewers */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#181824] rounded-2xl border border-neutral-800 mb-3 shrink-0">
              <button
                type="button"
                onClick={() => setLiveActiveRightTab('chat')}
                className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  liveActiveRightTab === 'chat'
                    ? 'bg-[#ff007a] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Comments ({currentLiveStream.messages.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setLiveActiveRightTab('viewers')}
                className={`py-1.5 text-[11px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  liveActiveRightTab === 'viewers'
                    ? 'bg-[#ff007a] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Viewers ({currentLiveStream.viewers.length})</span>
              </button>
            </div>

            {/* TAB 1: LIVE COMMENTS STREAM */}
            {liveActiveRightTab === 'chat' && (
              <div className="flex-1 min-h-0 flex flex-col justify-between">
                {/* Real-time Comments List - flex-1 min-h-0 overflow-y-auto occupies available height */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                  {currentLiveStream.messages.length === 0 ? (
                    <div className="text-center py-12 text-neutral-500 text-xs flex flex-col items-center gap-2">
                      <MessageSquare className="w-8 h-8 text-neutral-600 stroke-[1.5]" />
                      <span>No comments yet. Viewer chats and replies will appear here in real time!</span>
                    </div>
                  ) : (
                    currentLiveStream.messages.map(msg => {
                      if (msg.isSystemEvent) {
                        return (
                          <div
                            key={msg.id}
                            className="py-1 px-3 rounded-full bg-pink-500/10 border border-pink-500/20 text-[#ff007a] text-[11px] font-semibold flex items-center gap-1.5 shadow-sm"
                          >
                            <Sparkles className="w-3 h-3 text-[#ff007a] shrink-0" />
                            <span className="truncate">
                              <span className="font-bold text-white">{msg.displayName} </span>
                              {msg.text}
                            </span>
                          </div>
                        );
                      }

                      const isHostMsg =
                        msg.userId === currentUser?.id ||
                        msg.displayName === currentUser?.displayName;

                      return (
                        <div
                          key={msg.id}
                          className={`p-2.5 rounded-2xl border transition-all text-xs flex items-start gap-2.5 ${
                            isHostMsg
                              ? 'bg-[#ff007a]/10 border-[#ff007a]/40 shadow-sm'
                              : 'bg-[#181824] border-neutral-800'
                          }`}
                        >
                          <Avatar
                            src={msg.avatar}
                            alt={msg.displayName}
                            size="xs"
                            className="mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-bold text-white text-[11px] truncate">
                                {msg.displayName}
                              </span>
                              {isHostMsg && (
                                <span className="bg-[#ff007a] text-white text-[8px] font-black px-1.5 py-0.2 rounded-full tracking-wider uppercase">
                                  HOST
                                </span>
                              )}
                            </div>
                            <p className="text-neutral-200 text-xs break-words leading-relaxed">
                              {msg.text}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={commentsEndRef} />
                </div>

                {/* Bottom Section: Quick Reaction Emojis & Host Chat Input - NO excess below */}
                <div className="shrink-0 pt-2.5 border-t border-neutral-800 mt-2">
                  {/* Quick Reaction Emojis for Host */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-1.5 scrollbar-none">
                    <span className="text-[10px] text-neutral-500 font-semibold shrink-0">React:</span>
                    {QUICK_REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => sendLiveComment(emoji)}
                        className="p-1 rounded-lg hover:bg-neutral-800 text-sm transition-transform active:scale-125 cursor-pointer shrink-0"
                        title={`Send ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Host Live Chat input */}
                  <form onSubmit={handleHostSendChat} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-[#181824] rounded-2xl px-3 py-2 border border-neutral-700 focus-within:border-[#ff007a]">
                      <input
                        type="text"
                        placeholder="Reply to chat as host..."
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="p-2.5 rounded-2xl bg-[#ff007a] hover:bg-[#ff1a8c] disabled:opacity-30 text-white cursor-pointer transition-all shadow-md shrink-0"
                      title="Send message"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 2: VIEWERS LIST */}
            {liveActiveRightTab === 'viewers' && (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                {currentLiveStream.viewers.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500 text-xs">
                    No viewers connected yet.
                  </div>
                ) : (
                  currentLiveStream.viewers.map(viewer => (
                    <div
                      key={viewer.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-[#181824] border border-neutral-800"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={viewer.avatar} alt={viewer.displayName} size="xs" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {viewer.displayName}
                          </div>
                          <div className="text-[10px] text-neutral-400 truncate">
                            @{viewer.username}
                          </div>
                        </div>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
