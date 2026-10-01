import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  LiveStreamCanvas,
  LayoutMode,
  GamePreset,
} from './LiveStreamCanvas';
import { Avatar } from '../common/Avatar';
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
  Check
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
  const [streamTopic, setStreamTopic] = useState(currentLiveStream.topic || '');
  const [streamAbout, setStreamAbout] = useState(currentLiveStream.aboutMe || '');

  // Layout & Display Customization State
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split'); // 'split' | 'pip' | 'game_only' | 'camera_only'
  const [splitRatio, setSplitRatio] = useState<number>(50); // 50% camera, 50% game
  const [pipPosition, setPipPosition] = useState<'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'>('top-right');
  
  // Camera state
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(true);
  const [cameraSource, setCameraSource] = useState<'webcam' | 'preset'>('preset');
  const [cameraRealStream, setCameraRealStream] = useState<MediaStream | null>(null);

  // Game display state
  const [gameSource, setGameSource] = useState<GamePreset>('genshin');
  const [gameCustomStream, setGameCustomStream] = useState<MediaStream | null>(null);

  // Audio & Peripherals
  const [micActive, setMicActive] = useState(true);
  const [audioGain, setAudioGain] = useState(85);

  // Overlays
  const [showOverlays, setShowOverlays] = useState(true);
  const [showMusicBanner, setShowMusicBanner] = useState(false);
  const [showGoalBar, setShowGoalBar] = useState(false);

  // Active drawer/tab in customization: 'layout' | 'camera' | 'game' | 'audio'
  const [activeCustomTool, setActiveCustomTool] = useState<'layout' | 'camera' | 'game' | 'audio'>('layout');

  // Live timer for active broadcast
  const [elapsedSeconds, setElapsedSeconds] = useState(currentLiveStream.timerSeconds || 0);
  const [chatInput, setChatInput] = useState('');

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

  // Request user's real webcam
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
      }
    } catch (err) {
      alert('Unable to access physical camera. Keeping high-definition streamer camera preset.');
      setCameraSource('preset');
      setCameraEnabled(true);
    }
  };

  // Request screen capture for real game window/screen share
  const handleShareScreenOrGame = async () => {
    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        setGameCustomStream(stream);
        setGameSource('custom_screen');
      }
    } catch (err) {
      console.warn('Screen share cancelled or unavailable', err);
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

  // --------------------------------------------------------------------------
  // MODE A: LiveStream Setup & Layout Customizer (Screenshot 2 bottom left & Screenshot 3 bottom right)
  // --------------------------------------------------------------------------
  if (mode === 'setup') {
    return (
      <div className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full flex flex-col justify-start select-none">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-6">
          <div className="flex items-center gap-3">
            <Radio className="w-6 h-6 text-[#ff007a] animate-pulse" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold font-brand text-white">
                Live Stream Layout Studio & Customization
              </h2>
              <p className="text-xs text-neutral-400">
                Adjust your game display, facecam placement, and broadcast settings in real time
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('live')}
            className="text-xs text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Studio Grid: Left Form (3 cols) | Center Live Layout Canvas (6 cols) | Right Add Source Tools (3 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Column 1: Stream Information Form (3 cols) */}
          <div className="lg:col-span-3 bg-[#13131a] rounded-3xl border border-neutral-800 p-5 space-y-4 shadow-xl text-left">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Stream Details
            </h3>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Title:
              </label>
              <input
                type="text"
                placeholder="Enter title"
                value={streamTitle}
                onChange={e => setStreamTitle(e.target.value)}
                className="w-full bg-[#181824] text-xs font-semibold text-white px-3.5 py-2.5 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Topic:
              </label>
              <input
                type="text"
                placeholder="Enter topics: example gaming"
                value={streamTopic}
                onChange={e => setStreamTopic(e.target.value)}
                className="w-full bg-[#181824] text-xs font-semibold text-white px-3.5 py-2.5 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                About me:
              </label>
              <textarea
                rows={4}
                placeholder="Description"
                value={streamAbout}
                onChange={e => setStreamAbout(e.target.value)}
                className="w-full bg-[#181824] text-xs text-white p-3.5 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none resize-none leading-relaxed"
              />
            </div>

            {/* Quick Layout Presets Selector */}
            <div className="pt-2 border-t border-neutral-800">
              <label className="text-xs font-semibold text-neutral-300 block mb-2">
                Layout Preset:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLayoutMode('split')}
                  className={`p-2 rounded-xl text-[11px] font-bold border transition-all text-center ${
                    layoutMode === 'split'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-sm'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                >
                  Stacked Split (Cam+Game)
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('pip')}
                  className={`p-2 rounded-xl text-[11px] font-bold border transition-all text-center ${
                    layoutMode === 'pip'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-sm'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                >
                  Picture-in-Picture
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('game_only')}
                  className={`p-2 rounded-xl text-[11px] font-bold border transition-all text-center ${
                    layoutMode === 'game_only'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-sm'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                >
                  Game Only
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('camera_only')}
                  className={`p-2 rounded-xl text-[11px] font-bold border transition-all text-center ${
                    layoutMode === 'camera_only'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-sm'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                >
                  Facecam Only
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Live Layout Preview Canvas (6 cols) matching Screenshot 3 bottom right */}
          <div className="lg:col-span-6 flex flex-col items-center">
            {/* The actual live interactive layout canvas */}
            <div className="w-full aspect-[9/13] sm:aspect-[9/12] max-h-[580px] relative">
              <LiveStreamCanvas
                layoutMode={layoutMode}
                splitRatio={splitRatio}
                cameraEnabled={cameraEnabled}
                cameraSource={cameraSource}
                pipPosition={pipPosition}
                gameSource={gameSource}
                gameCustomStream={gameCustomStream}
                cameraRealStream={cameraRealStream}
                showOverlays={showOverlays}
                showMusicBanner={showMusicBanner}
                showGoalBar={showGoalBar}
                hostName={currentUser?.displayName || 'Host'}
                timerText="PREVIEW"
                isLive={false}
              />

              {/* Big hot pink "Go LIVE" Button positioned right on the canvas matching Screenshot 3 bottom right */}
              <div className="absolute bottom-5 inset-x-0 flex justify-center z-30 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => handleProceedToGoLive()}
                  className="py-3 px-8 rounded-full bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-extrabold text-sm sm:text-base shadow-[0_0_30px_rgba(255,0,122,0.8)] transition-all cursor-pointer transform hover:scale-105 active:scale-95 border-2 border-white/20 animate-bounce"
                >
                  Go LIVE
                </button>
              </div>
            </div>

            {/* Canvas adjust controls under preview */}
            {layoutMode === 'split' && (
              <div className="w-full bg-[#13131a] border border-neutral-800 rounded-2xl p-3.5 mt-3 flex items-center justify-between gap-4 text-xs">
                <span className="text-neutral-400 font-medium shrink-0">
                  Adjust Split Ratio:
                </span>
                <input
                  type="range"
                  min="30"
                  max="70"
                  value={splitRatio}
                  onChange={e => setSplitRatio(Number(e.target.value))}
                  className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer"
                />
                <span className="text-[#ff007a] font-mono font-bold shrink-0">
                  {splitRatio}% Cam / {100 - splitRatio}% Game
                </span>
              </div>
            )}
          </div>

          {/* Column 3: "Add Source" Tool Box (3 cols) matching Screenshots 2 & 3 */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-[#13131a] rounded-3xl border border-neutral-800 p-5 shadow-xl text-center">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-4 bg-neutral-800/80 py-1.5 px-4 rounded-xl inline-block">
                Add Source
              </h3>

              {/* 4 Icon Buttons matching Screenshot: Camera, Mic, Screen/Display, Levels */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {/* Camera Source Button */}
                <button
                  type="button"
                  onClick={() => setActiveCustomTool('camera')}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                    activeCustomTool === 'camera'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-md'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                  title="Camera Source"
                >
                  <Camera className={`w-6 h-6 ${cameraEnabled ? 'text-[#ff007a]' : ''}`} />
                  <span className="text-[11px] font-bold">Camera</span>
                </button>

                {/* Microphone Button */}
                <button
                  type="button"
                  onClick={() => setActiveCustomTool('audio')}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                    activeCustomTool === 'audio'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-md'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                  title="Microphone Source"
                >
                  <Mic className={`w-6 h-6 ${micActive ? 'text-[#ff007a]' : ''}`} />
                  <span className="text-[11px] font-bold">Microphone</span>
                </button>

                {/* Game / Screen Display Button */}
                <button
                  type="button"
                  onClick={() => setActiveCustomTool('game')}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                    activeCustomTool === 'game'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-md'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                  title="Game Display Source"
                >
                  <Monitor className="w-6 h-6 text-[#ff007a]" />
                  <span className="text-[11px] font-bold">Game Display</span>
                </button>

                {/* Overlays / Equalizer Button */}
                <button
                  type="button"
                  onClick={() => setActiveCustomTool('layout')}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                    activeCustomTool === 'layout'
                      ? 'border-[#ff007a] bg-[#ff007a]/20 text-white shadow-md'
                      : 'border-neutral-700 bg-[#181824] text-neutral-400 hover:text-white'
                  }`}
                  title="Overlays & Layout"
                >
                  <BarChart2 className="w-6 h-6 text-[#ff007a]" />
                  <span className="text-[11px] font-bold">Overlays</span>
                </button>
              </div>

              {/* Active Source Customizer Panel */}
              <div className="bg-[#181824] rounded-2xl p-4 border border-neutral-700/80 text-left space-y-3">
                {/* TOOL: CAMERA ADJUSTMENT */}
                {activeCustomTool === 'camera' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Camera Feed</span>
                      <button
                        type="button"
                        onClick={() => setCameraEnabled(!cameraEnabled)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cameraEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {cameraEnabled ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleEnableRealWebcam}
                      className="w-full py-2 px-3 rounded-xl bg-[#252538] hover:bg-[#ff007a]/20 border border-neutral-600 hover:border-[#ff007a] text-xs font-medium text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#ff007a]" />
                      <span>{cameraRealStream ? 'Webcam Connected ✓' : 'Connect My Physical Webcam'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCameraSource('preset');
                        setCameraEnabled(true);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-[#252538] hover:bg-neutral-700 text-xs font-medium text-neutral-300 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <VideoIcon className="w-3.5 h-3.5 text-blue-400" />
                      <span>Use Streamer Camera Preset</span>
                    </button>
                  </div>
                )}

                {/* TOOL: GAME DISPLAY ADJUSTMENT */}
                {activeCustomTool === 'game' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-white block">
                      Game Display Source
                    </span>

                    <button
                      type="button"
                      onClick={handleShareScreenOrGame}
                      className="w-full py-2 px-3 rounded-xl bg-[#ff007a]/15 hover:bg-[#ff007a]/25 border border-[#ff007a] text-xs font-bold text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Monitor className="w-3.5 h-3.5 text-[#ff007a]" />
                      <span>{gameCustomStream ? 'Screen Captured ✓' : 'Share My Real Screen / Window'}</span>
                    </button>

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] text-neutral-400 block font-medium">
                        Or Pick Game Preset:
                      </span>
                      {[
                        { id: 'genshin', name: 'Stream Preset A' },
                        { id: 'valorant', name: 'Stream Preset B' },
                        { id: 'cyberpunk', name: 'Stream Preset C' },
                      ].map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setGameSource(g.id as GamePreset);
                            setGameCustomStream(null);
                          }}
                          className={`w-full py-1.5 px-3 rounded-xl text-xs font-medium border text-left flex items-center justify-between transition-all cursor-pointer ${
                            gameSource === g.id && !gameCustomStream
                              ? 'bg-[#252538] border-[#ff007a] text-white'
                              : 'bg-neutral-800/80 border-neutral-700 text-neutral-400 hover:text-white'
                          }`}
                        >
                          <span>{g.name}</span>
                          {gameSource === g.id && !gameCustomStream && (
                            <Check className="w-3.5 h-3.5 text-[#ff007a]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* TOOL: AUDIO ADJUSTMENT */}
                {activeCustomTool === 'audio' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Microphone</span>
                      <button
                        type="button"
                        onClick={() => setMicActive(!micActive)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          micActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {micActive ? 'MUTED' : 'UNMUTED'}
                      </button>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                        <span>Mic Volume Gain</span>
                        <span className="font-mono text-white">{audioGain}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={audioGain}
                        onChange={e => setAudioGain(Number(e.target.value))}
                        className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* TOOL: OVERLAYS */}
                {activeCustomTool === 'layout' && (
                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-white block">
                      Broadcast Overlays
                    </span>

                    <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
                      <span>Music Ticker Banner</span>
                      <input
                        type="checkbox"
                        checked={showMusicBanner}
                        onChange={e => setShowMusicBanner(e.target.checked)}
                        className="rounded accent-[#ff007a]"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
                      <span>Follower Goal Bar (4083/4100)</span>
                      <input
                        type="checkbox"
                        checked={showGoalBar}
                        onChange={e => setShowGoalBar(e.target.checked)}
                        className="rounded accent-[#ff007a]"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
                      <span>All Screen HUD & Watermark</span>
                      <input
                        type="checkbox"
                        checked={showOverlays}
                        onChange={e => setShowOverlays(e.target.checked)}
                        className="rounded accent-[#ff007a]"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MODE B: Active Broadcast (POV of Host matching Screenshot 2 top left)
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

            {/* Quick Layout Presets during active broadcast */}
            <div className="pt-2">
              <label className="text-xs font-bold text-neutral-400 block mb-1.5">
                Switch Layout Live:
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setLayoutMode('split')}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                    layoutMode === 'split' ? 'bg-[#ff007a] text-white border-[#ff007a]' : 'bg-[#181824] text-neutral-400 border-neutral-700'
                  }`}
                >
                  Split
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('pip')}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                    layoutMode === 'pip' ? 'bg-[#ff007a] text-white border-[#ff007a]' : 'bg-[#181824] text-neutral-400 border-neutral-700'
                  }`}
                >
                  PiP
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode('game_only')}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                    layoutMode === 'game_only' ? 'bg-[#ff007a] text-white border-[#ff007a]' : 'bg-[#181824] text-neutral-400 border-neutral-700'
                  }`}
                >
                  Game
                </button>
              </div>
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

          {/* Hot Pink "End Live" Button matching Screenshot 2 top left */}
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
              layoutMode={layoutMode}
              splitRatio={splitRatio}
              cameraEnabled={cameraEnabled}
              cameraSource={cameraSource}
              pipPosition={pipPosition}
              gameSource={gameSource}
              gameCustomStream={gameCustomStream}
              cameraRealStream={cameraRealStream}
              showOverlays={showOverlays}
              showMusicBanner={showMusicBanner}
              showGoalBar={showGoalBar}
              hostName={currentUser?.displayName || 'Host'}
              timerText={formatTimer(elapsedSeconds)}
              isLive={true}
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

            {/* Viewers List with Comment Snippets */}
            <div className="flex-1 overflow-y-auto py-2 space-y-3 text-left">
              {currentLiveStream.viewers.map(viewer => (
                <div key={viewer.id} className="flex items-center gap-2.5">
                  <Avatar
                    src={viewer.avatar}
                    alt={viewer.displayName}
                    size="sm"
                  />
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
                  className="text-[#ff007a] hover:text-white p-1 disabled:opacity-30"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Tool Panel: "Add Source" with 4 quick hardware toggles */}
          <div className="bg-[#13131a] rounded-3xl border border-neutral-800 p-4 shadow-xl">
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center mb-3">
              Add Source
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setCameraEnabled(!cameraEnabled)}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  cameraEnabled ? 'bg-[#ff007a]/20 border-[#ff007a] text-white' : 'bg-[#181824] border-neutral-700 text-neutral-400'
                }`}
                title="Camera"
              >
                <Camera className="w-5 h-5" />
              </button>

              <button
                onClick={() => setMicActive(!micActive)}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  micActive ? 'bg-[#ff007a]/20 border-[#ff007a] text-white' : 'bg-[#181824] border-neutral-700 text-neutral-400'
                }`}
                title="Microphone"
              >
                <Mic className="w-5 h-5" />
              </button>

              <button
                onClick={handleShareScreenOrGame}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  gameCustomStream ? 'bg-[#ff007a]/20 border-[#ff007a] text-white' : 'bg-[#181824] border-neutral-700 text-neutral-400'
                }`}
                title="Screen Share / Game Window"
              >
                <Monitor className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowOverlays(!showOverlays)}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                  showOverlays ? 'bg-[#ff007a]/20 border-[#ff007a] text-white' : 'bg-[#181824] border-neutral-700 text-neutral-400'
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
