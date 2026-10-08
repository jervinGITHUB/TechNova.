import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  LiveStreamCanvas,
  GamePreset,
  GoalWidgetConfig,
} from './LiveStreamCanvas';
import { Avatar } from '../common/Avatar';
import { CanvasSourceTransform } from '../../types';
import { liveBroadcastService } from '../../services/liveBroadcastService';
import { supabaseDb, toUuid, generateUuid, isSameUser } from '../../lib/supabase';
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
  ChevronDown,
  X,
  Type,
  RotateCcw,
  Wand2,
  Settings as SettingsIcon,
  Heart,
  Share2,
  Shield,
  Home,
  Coins,
  Edit3,
  Award,
  Gamepad2,
  Check,
  Move,
  UserPlus,
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
    users,
    startHostLiveStream,
    endHostLiveStream,
    sendLiveComment,
    setActiveTab,
  } = useApp();

  const initialBroadcast = liveBroadcastService.getState();
  const [mode, setMode] = useState<'setup' | 'active'>(initialMode);

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  const [broadcastViewersCount, setBroadcastViewersCount] = useState<number>(0);

  useEffect(() => {
    const unsub = liveBroadcastService.subscribe(bState => {
      if (bState.cameraStream !== cameraRealStream) {
        setCameraRealStream(bState.cameraStream);
      }
      if (bState.screenStream !== gameCustomStream) {
        setGameCustomStream(bState.screenStream);
      }
      if (bState.cameraSource !== cameraSource) {
        setCameraSource(bState.cameraSource);
      }
      if (bState.gameSource !== gameSource) {
        setGameSource(bState.gameSource);
      }
      if (bState.viewersCount !== undefined) {
        setBroadcastViewersCount(bState.viewersCount);
      }
    });
    return unsub;
  }, []);

  // Automatic Mobile Viewport Detection (< 768px)
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Stream Info Fields (Editable before live; Locked read-only while live)
  const [streamTitle, setStreamTitle] = useState(initialBroadcast.streamTitle || currentLiveStream.title || 'TikTok Live');
  const [streamTopic, setStreamTopic] = useState(initialBroadcast.streamTopic || currentLiveStream.topic || 'Just Chatting');
  const [streamAbout, setStreamAbout] = useState(initialBroadcast.streamAbout || currentLiveStream.aboutMe || '');

  // Studio Display Mode: Portrait 9:16 (TikTok Mobile standard) vs Landscape 16:9 (Gaming/Desktop)
  const [canvasAspectRatio, setCanvasAspectRatio] = useState<'9:16' | '16:9'>(() => {
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      return isMobile ? '9:16' : '16:9';
    }
    return initialBroadcast.canvasAspectRatio || '16:9';
  });
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);

  // Freeform Transform States for Canvas Sources
  const [cameraTransform, setCameraTransform] = useState<CanvasSourceTransform>(initialBroadcast.cameraTransform);
  const [screenTransform, setScreenTransform] = useState<CanvasSourceTransform>(initialBroadcast.screenTransform);

  // Adjustable Goal Bar Widget State
  const [goalWidgetConfig, setGoalWidgetConfig] = useState<GoalWidgetConfig>(() => {
    const init = initialBroadcast.goalWidgetConfig || {};
    const autoFollowers = currentUser?.followersCount || 0;
    return {
      enabled: init.enabled ?? true,
      title: init.title || 'Follower Goal',
      current: autoFollowers,
      target: Math.min(999999, Math.max(1, init.target ?? 100)),
      posX: init.posX ?? 22,
      posY: init.posY ?? 13,
      widthPercent: init.widthPercent && init.widthPercent <= 85 ? init.widthPercent : 56,
      theme: init.theme || 'pink',
    };
  });

  // Automatically keep current follower count updated from host's profile
  useEffect(() => {
    const autoFollowers = currentUser?.followersCount || 0;
    setGoalWidgetConfig(prev => {
      if (prev.current === autoFollowers) return prev;
      const next = { ...prev, current: autoFollowers };
      liveBroadcastService.updateStudioConfig({ goalConfig: next });
      return next;
    });
  }, [currentUser?.followersCount]);

  const [selectedSourceId, setSelectedSourceId] = useState<'camera' | 'screen' | 'goal_bar' | null>('camera');

  // Hardware Devices
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(initialBroadcast.cameraEnabled);
  const [cameraSource, setCameraSource] = useState<'webcam' | 'preset'>(initialBroadcast.cameraSource);
  const [cameraRealStream, setCameraRealStream] = useState<MediaStream | null>(initialBroadcast.cameraStream);

  const [gameSource, setGameSource] = useState<GamePreset>(initialBroadcast.gameSource);
  const [gameCustomStream, setGameCustomStream] = useState<MediaStream | null>(initialBroadcast.screenStream);

  // Audio Mixer State
  const [micActive, setMicActive] = useState(true);
  const [micGain, setMicGain] = useState(85);
  const [desktopAudioGain, setDesktopAudioGain] = useState(75);
  const [desktopAudioMuted, setDesktopAudioMuted] = useState(false);

  // Web Audio API refs for Real Microphone Input & VU Meter
  const micMediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null);
  const [isMicAccessGranted, setIsMicAccessGranted] = useState(false);

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

  // Studio Controls Dropdown in Live Broadcast mode
  const studioDropdownRef = useRef<HTMLDivElement>(null);
  const [studioDropdownOpen, setStudioDropdownOpen] = useState(false);

  // Mobile Device Camera Dedicated State
  const mobileVideoRef = useRef<HTMLVideoElement>(null);
  const [mobileFacingMode, setMobileFacingMode] = useState<'user' | 'environment'>('user');
  const [mobileBeautyEnhance, setMobileBeautyEnhance] = useState(false);
  const [mobileFilter, setMobileFilter] = useState<'none' | 'glow' | 'warm' | 'cool' | 'cyber'>('none');
  const [mobileBannerDismissed, setMobileBannerDismissed] = useState(false);
  const [mobileShowTitleModal, setMobileShowTitleModal] = useState(false);
  const [mobileShowSettingsModal, setMobileShowSettingsModal] = useState(false);
  const [mobileShowRewardsModal, setMobileShowRewardsModal] = useState(false);
  const [mobileShowEffectsSheet, setMobileShowEffectsSheet] = useState(false);
  const [mobileFloatingHearts, setMobileFloatingHearts] = useState<number[]>([]);
  const [mobileEndConfirmOpen, setMobileEndConfirmOpen] = useState(false);

  // Mobile Stream Overlay Text State (Freely Adjustable & Moveable)
  const [mobileOverlayText, setMobileOverlayText] = useState<string>('');
  const [mobileOverlayStyle, setMobileOverlayStyle] = useState<'pink' | 'black' | 'cyan' | 'white' | 'gold'>('pink');
  const [mobileOverlayCoords, setMobileOverlayCoords] = useState<{ x: number; y: number }>({ x: 12, y: 16 });
  const [mobileOverlayScale, setMobileOverlayScale] = useState<number>(1); // 0.8 (S), 1.0 (M), 1.25 (L), 1.5 (XL)
  const [mobileShowTextModal, setMobileShowTextModal] = useState<boolean>(false);
  const [tempOverlayInput, setTempOverlayInput] = useState<string>('');
  const [isDraggingOverlay, setIsDraggingOverlay] = useState<boolean>(false);

  const overlayDragRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    hasMoved: boolean;
  }>({ startX: 0, startY: 0, initX: 12, initY: 16, hasMoved: false });

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    overlayDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: mobileOverlayCoords.x,
      initY: mobileOverlayCoords.y,
      hasMoved: false,
    };
    setIsDraggingOverlay(true);
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingOverlay) return;
    const deltaX = e.clientX - overlayDragRef.current.startX;
    const deltaY = e.clientY - overlayDragRef.current.startY;

    if (Math.hypot(deltaX, deltaY) > 3) {
      overlayDragRef.current.hasMoved = true;
    }

    const deltaXPercent = (deltaX / window.innerWidth) * 100;
    const deltaYPercent = (deltaY / window.innerHeight) * 100;

    const newX = Math.max(2, Math.min(78, overlayDragRef.current.initX + deltaXPercent));
    const newY = Math.max(5, Math.min(85, overlayDragRef.current.initY + deltaYPercent));

    setMobileOverlayCoords({ x: newX, y: newY });
  };

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDraggingOverlay(false);
    if (!overlayDragRef.current.hasMoved) {
      setTempOverlayInput(mobileOverlayText);
      setMobileShowTextModal(true);
    }
  };

  const getOverlayStyleClass = () => {
    switch (mobileOverlayStyle) {
      case 'pink':
        return 'bg-[#ff007a] text-white shadow-[0_0_20px_rgba(255,0,122,0.6)] border border-pink-300/40';
      case 'black':
        return 'bg-black/80 backdrop-blur-md text-white border border-white/25 shadow-2xl';
      case 'cyan':
        return 'bg-black/85 backdrop-blur-md text-cyan-400 border border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.5)]';
      case 'white':
        return 'bg-white text-black font-extrabold shadow-2xl border border-neutral-200';
      case 'gold':
        return 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold shadow-[0_0_20px_rgba(245,158,11,0.6)] border border-yellow-200';
      default:
        return 'bg-[#ff007a] text-white';
    }
  };

  // Hook real camera to mobile video preview
  useEffect(() => {
    if (mobileVideoRef.current && cameraRealStream) {
      mobileVideoRef.current.srcObject = cameraRealStream;
    }
  }, [cameraRealStream, isMobileViewport, mode]);

  // Click outside handler for desktop studio dropdown
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

  // Real Web Audio API Microphone Analyzer for Live Studio VU Meter
  const initMicAudio = useCallback(async () => {
    if (typeof window === 'undefined') return;

    let stream = micMediaStreamRef.current;
    if (!stream || !stream.active || stream.getAudioTracks().length === 0) {
      if (cameraRealStream && cameraRealStream.getAudioTracks().length > 0) {
        stream = cameraRealStream;
        micMediaStreamRef.current = stream;
        setIsMicAccessGranted(true);
      } else if (navigator.mediaDevices?.getUserMedia) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          micMediaStreamRef.current = stream;
          setIsMicAccessGranted(true);
        } catch (err) {
          console.warn('Microphone permission or hardware unavailable:', err);
          setIsMicAccessGranted(false);
          return;
        }
      }
    }

    if (!stream || stream.getAudioTracks().length === 0) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtxClass();
      }
      const audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const gainNode = audioCtx.createGain();
      gainNodeRef.current = gainNode;
      gainNode.gain.value = (micGain / 100) * 1.5;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.35;
      analyserRef.current = analyser;

      source.connect(gainNode);
      gainNode.connect(analyser);

      if (audioAnimFrameRef.current) {
        cancelAnimationFrame(audioAnimFrameRef.current);
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!micActive || !micMediaStreamRef.current) {
          setMicMeterLevel(0);
          audioAnimFrameRef.current = requestAnimationFrame(updateMeter);
          return;
        }

        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i];
          sum += v;
          if (v > peak) peak = v;
        }
        const avg = sum / bufferLength;

        // Human speaking voice creates dynamic energy across frequencies
        const gainMult = Math.max(0.1, micGain / 80);
        const speechLevel = ((avg * 0.7 + peak * 0.3) / 90) * gainMult * 100;
        const clamped = Math.min(100, Math.max(0, Math.round(speechLevel)));

        setMicMeterLevel(prev => {
          if (clamped > prev) {
            return clamped; // Fast attack
          }
          return Math.max(0, Math.round(prev * 0.8 + clamped * 0.2)); // Smooth natural decay
        });

        audioAnimFrameRef.current = requestAnimationFrame(updateMeter);
      };

      audioAnimFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (err) {
      console.warn('Error setting up Web Audio mic analyser:', err);
    }
  }, [cameraRealStream, micActive, micGain]);

  // Trigger mic setup on audio tab or when mic is active
  useEffect(() => {
    if (micActive) {
      initMicAudio();
    }
  }, [micActive, rightStudioTab, mode, initMicAudio]);

  // Synchronize gain node when micGain slider is dragged
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (micGain / 100) * 1.5;
    }
  }, [micGain]);

  // Handle mic muting / unmuting tracks
  useEffect(() => {
    if (micMediaStreamRef.current) {
      micMediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = micActive;
      });
    }
    if (!micActive) {
      setMicMeterLevel(0);
    }
  }, [micActive]);

  // System & desktop audio meter activity
  useEffect(() => {
    if (desktopAudioMuted) {
      setDesktopMeterLevel(0);
      return;
    }
    const interval = setInterval(() => {
      const flutter = Math.sin(Date.now() / 240) * 10 + Math.cos(Date.now() / 160) * 8;
      const lvl = Math.min(100, Math.max(0, Math.round((desktopAudioGain / 100) * (42 + flutter))));
      setDesktopMeterLevel(lvl);
    }, 120);
    return () => clearInterval(interval);
  }, [desktopAudioMuted, desktopAudioGain]);

  // Cleanup Web Audio on unmount
  useEffect(() => {
    return () => {
      if (audioAnimFrameRef.current) {
        cancelAnimationFrame(audioAnimFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

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
    if (mode === 'active') {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentLiveStream.messages.length, mode, liveActiveRightTab]);

  // Toggle mobile camera flip (Front selfie / Back camera)
  const handleToggleMobileCameraFacing = async () => {
    const nextFacing = mobileFacingMode === 'user' ? 'environment' : 'user';
    setMobileFacingMode(nextFacing);
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        if (cameraRealStream) {
          cameraRealStream.getTracks().forEach(t => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextFacing },
          audio: micActive,
        });
        setCameraRealStream(stream);
        setCameraSource('webcam');
        setCameraEnabled(true);
      } catch {
        setCameraTransform(prev => ({ ...prev, mirrored: !prev.mirrored }));
      }
    } else {
      setCameraTransform(prev => ({ ...prev, mirrored: !prev.mirrored }));
    }
  };

  // Trigger floating heart on mobile
  const handleTriggerMobileHeart = () => {
    setMobileFloatingHearts(prev => [...prev, Date.now()]);
    setTimeout(() => {
      setMobileFloatingHearts(prev => prev.slice(1));
    }, 2000);
  };

  // Request physical webcam
  const handleEnableRealWebcam = async () => {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mobileFacingMode },
          audio: micActive,
        });
        setCameraRealStream(stream);
        setCameraSource('webcam');
        setCameraEnabled(true);
        setCameraTransform(prev => ({ ...prev, visible: true }));
        liveBroadcastService.setCameraStream(stream, 'webcam');
      }
    } catch {
      setCameraSource('preset');
      setCameraEnabled(true);
      liveBroadcastService.setCameraStream(null, 'preset');
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
        const vTrack = stream.getVideoTracks()[0];
        if (vTrack) {
          vTrack.onended = () => {
            setGameCustomStream(null);
            setGameSource('genshin');
            liveBroadcastService.setScreenStream(null, 'genshin');
          };
          const settings = vTrack.getSettings();
          const vw = settings.width || 1920;
          const vh = settings.height || 1080;
          if (canvasAspectRatio === '9:16') {
            const flexH = Math.min(100, Math.max(25, Math.round(((720 * (vh / vw)) / 1280) * 100)));
            setScreenTransform(prev => ({
              ...prev,
              x: 0,
              y: 0,
              width: 100,
              height: flexH,
              visible: true,
            }));
          } else {
            setScreenTransform(prev => ({
              ...prev,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              visible: true,
            }));
          }
        }
        setGameCustomStream(stream);
        setGameSource('custom_screen');
        liveBroadcastService.setScreenStream(stream, 'custom_screen');
      }
    } catch (err) {
      console.warn('Screen share cancelled or unavailable', err);
    }
  };

  // Quick Preset Layout Applicators for desktop
  const applyPresetLayout = (
    preset: 'split' | 'pip' | 'game_focus' | 'cam_focus'
  ) => {
    let newCam: CanvasSourceTransform;
    let newScr: CanvasSourceTransform;

    if (preset === 'split') {
      newCam = {
        ...cameraTransform,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 20,
      };
      newScr = {
        ...screenTransform,
        x: 0,
        y: 50,
        width: 100,
        height: 50,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      };
    } else if (preset === 'pip') {
      newScr = {
        ...screenTransform,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      };
      newCam = {
        ...cameraTransform,
        x: 58,
        y: 68,
        width: 38,
        height: 28,
        borderRadius: 16,
        borderStyle: 'pink',
        visible: true,
        zIndex: 20,
      };
    } else if (preset === 'game_focus') {
      const scrH = canvasAspectRatio === '9:16' ? 56 : 72;
      newScr = {
        ...screenTransform,
        x: 0,
        y: 0,
        width: 100,
        height: scrH,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      };
      newCam = {
        ...cameraTransform,
        x: 60,
        y: Math.min(74, scrH + 2),
        width: 36,
        height: 24,
        borderRadius: 14,
        borderStyle: 'cyan',
        visible: true,
        zIndex: 20,
      };
    } else {
      newCam = {
        ...cameraTransform,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        borderRadius: 0,
        borderStyle: 'none',
        visible: true,
        zIndex: 10,
      };
      newScr = {
        ...screenTransform,
        x: 58,
        y: 68,
        width: 38,
        height: 28,
        borderRadius: 14,
        borderStyle: 'cyan',
        visible: true,
        zIndex: 20,
      };
    }

    setCameraTransform(newCam);
    setScreenTransform(newScr);
    liveBroadcastService.updateStudioConfig({
      cameraTransform: newCam,
      screenTransform: newScr,
    });
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
    const isMobile = isMobileViewport;
    const finalAspectRatio = isMobile ? '9:16' : canvasAspectRatio;

    liveBroadcastService.updateStudioConfig({
      title: streamTitle,
      topic: streamTopic,
      aboutMe: streamAbout,
      aspectRatio: finalAspectRatio,
      isMobileStream: isMobile,
      cameraTransform: isMobile
        ? {
            id: 'camera',
            name: 'Device Camera',
            type: 'camera',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            zIndex: 10,
            visible: true,
            locked: true,
            mirrored: mobileFacingMode === 'user',
            borderRadius: 0,
            borderStyle: 'none',
            opacity: 1,
          }
        : (finalAspectRatio === '16:9' && (cameraTransform.width >= 80 || cameraTransform.height >= 80)
            ? {
                ...cameraTransform,
                x: 72,
                y: 64,
                width: 26,
                height: 32,
                visible: cameraEnabled,
                zIndex: 20,
              }
            : cameraTransform),
      screenTransform: isMobile
        ? {
            ...screenTransform,
            visible: false,
          }
        : (finalAspectRatio === '16:9' && screenTransform.height < 60
            ? {
                ...screenTransform,
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                visible: true,
              }
            : screenTransform),
      goalConfig: isMobile
        ? {
            ...goalWidgetConfig,
            enabled: false,
          }
        : goalWidgetConfig,
      cameraEnabled: true,
      micEnabled: micActive,
      screenShareEnabled: !isMobile,
    });
    if (cameraRealStream) {
      liveBroadcastService.setCameraStream(cameraRealStream, cameraSource);
    } else if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: isMobile ? mobileFacingMode : 'user' },
        audio: micActive,
      }).then(stream => {
        setCameraRealStream(stream);
        setCameraSource('webcam');
        liveBroadcastService.setCameraStream(stream, 'webcam');
      }).catch(() => {});
    }
    if (gameCustomStream && !isMobile) {
      liveBroadcastService.setScreenStream(gameCustomStream, gameSource);
    }
    const streamId = generateUuid();
    if (currentUser) {
      liveBroadcastService.startBroadcasting(streamId, currentUser);
    }
    startHostLiveStream(streamTitle, streamTopic, streamAbout, streamId, {
      aspectRatio: finalAspectRatio,
      isMobileStream: isMobile,
    });
    setMode('active');
  };

  const activeStreamIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeStreamIdRef.current = mode === 'active' ? currentLiveStream.id : null;
  }, [mode, currentLiveStream.id]);

  // Host Cleanup Watchdog: guarantees abandoned/closed streams are marked ended in Supabase
  // Runs ONLY on real page unload/tab close or component unmount, NOT on re-render!
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeStreamIdRef.current) {
        liveBroadcastService.endBroadcasting();
        supabaseDb.endLiveStream(activeStreamIdRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      if (activeStreamIdRef.current) {
        liveBroadcastService.endBroadcasting();
        supabaseDb.endLiveStream(activeStreamIdRef.current);
      }
    };
  }, []);

  const handleEndLive = () => {
    liveBroadcastService.endBroadcasting();
    if (cameraRealStream) {
      cameraRealStream.getTracks().forEach(t => t.stop());
    }
    if (gameCustomStream) {
      gameCustomStream.getTracks().forEach(t => t.stop());
    }
    setCameraRealStream(null);
    setGameCustomStream(null);
    liveBroadcastService.setCameraStream(null, 'preset');
    liveBroadcastService.setScreenStream(null, 'genshin');
    setMobileEndConfirmOpen(false);
    activeStreamIdRef.current = null;
    endHostLiveStream();
  };

  const handleHostSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendLiveComment(chatInput.trim());
    setChatInput('');
  };

  const QUICK_REACTION_EMOJIS = ['❤️', '🔥', '👏', '🎮', '💖', '✨', '👋', '💯'];

  // Calculate CSS filters for mobile camera preview
  const getCameraFilterStyle = () => {
    let filter = '';
    if (mobileBeautyEnhance) {
      filter += 'brightness(1.08) contrast(1.04) saturate(1.1) ';
    }
    switch (mobileFilter) {
      case 'glow':
        filter += 'brightness(1.15) contrast(1.05) drop-shadow(0 0 8px rgba(255,0,122,0.25)) ';
        break;
      case 'warm':
        filter += 'sepia(0.2) saturate(1.25) ';
        break;
      case 'cool':
        filter += 'hue-rotate(180deg) saturate(0.9) ';
        break;
      case 'cyber':
        filter += 'contrast(1.2) hue-rotate(290deg) saturate(1.4) ';
        break;
      default:
        break;
    }
    return filter || undefined;
  };

  // ==========================================================================
  // SHARED COMPONENT: Scene Sources Layer Stack (Desktop)
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

        {/* Source Item 3: Follower Goal Widget */}
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
  // SHARED COMPONENT: Selected Source Inspector (Desktop)
  // ==========================================================================
  const renderSourceInspector = () => {
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

          <div className="space-y-3.5">
            {/* Horizontal & Vertical Positioning */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Horizontal (X):</span>
                  <span className="font-mono text-cyan-300 font-bold">{goalWidgetConfig.posX ?? 22}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, 100 - (goalWidgetConfig.widthPercent || 56))}
                  value={goalWidgetConfig.posX ?? 22}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setGoalWidgetConfig(prev => {
                      const updated = { ...prev, posX: val };
                      liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                      return updated;
                    });
                  }}
                  className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                  <span>Vertical (Y):</span>
                  <span className="font-mono text-purple-300 font-bold">{goalWidgetConfig.posY}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="90"
                  value={goalWidgetConfig.posY}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setGoalWidgetConfig(prev => {
                      const updated = { ...prev, posY: val };
                      liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                      return updated;
                    });
                  }}
                  className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer accent-purple-400"
                />
              </div>
            </div>

            {/* Quick Placement Presets */}
            <div>
              <div className="flex justify-between text-[11px] text-neutral-400 mb-1.5">
                <span>Quick Position Snapping:</span>
                <span className="text-[10px] text-neutral-500">Or drag directly on canvas</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Top Left', x: 3, y: 10 },
                  { label: 'Top Center', x: Math.round((100 - (goalWidgetConfig.widthPercent || 56)) / 2), y: 10 },
                  { label: 'Top Right', x: Math.max(0, 100 - (goalWidgetConfig.widthPercent || 56) - 3), y: 10 },
                  { label: 'Center', x: Math.round((100 - (goalWidgetConfig.widthPercent || 56)) / 2), y: 44 },
                  { label: 'Bottom Left', x: 3, y: 76 },
                  { label: 'Bottom Right', x: Math.max(0, 100 - (goalWidgetConfig.widthPercent || 56) - 3), y: 76 },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setGoalWidgetConfig(prev => {
                        const updated = { ...prev, posX: p.x, posY: p.y };
                        liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                        return updated;
                      });
                    }}
                    className="px-2 py-1 rounded-xl bg-[#181824] hover:bg-cyan-500/20 hover:border-cyan-400/80 border border-neutral-700/80 text-[10px] font-semibold text-neutral-300 hover:text-white transition-colors cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Width Presets & Slider */}
            <div>
              <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
                <span>Width (Scale):</span>
                <span className="font-mono text-purple-300 font-bold">
                  {goalWidgetConfig.widthPercent}%
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                {[
                  { label: 'Compact', width: 42 },
                  { label: 'Standard', width: 56 },
                  { label: 'Wide', width: 75 },
                  { label: 'Full', width: 92 },
                ].map(w => (
                  <button
                    key={w.label}
                    type="button"
                    onClick={() => {
                      setGoalWidgetConfig(prev => {
                        const maxLeft = Math.max(0, 100 - w.width);
                        const newX = Math.min(prev.posX ?? 22, maxLeft);
                        const updated = { ...prev, widthPercent: w.width, posX: newX };
                        liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                        return updated;
                      });
                    }}
                    className={`flex-1 py-1 rounded-xl border text-[10px] font-semibold transition-all cursor-pointer ${
                      (goalWidgetConfig.widthPercent || 56) === w.width
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm'
                        : 'bg-[#181824] border-neutral-700/80 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {w.label} ({w.width}%)
                  </button>
                ))}
              </div>
              <input
                type="range"
                min="25"
                max="100"
                value={goalWidgetConfig.widthPercent || 56}
                onChange={e => {
                  const val = Number(e.target.value);
                  setGoalWidgetConfig(prev => {
                    const maxLeft = Math.max(0, 100 - val);
                    const newX = Math.min(prev.posX ?? 22, maxLeft);
                    const updated = { ...prev, widthPercent: val, posX: newX };
                    liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                    return updated;
                  });
                }}
                className="w-full h-1.5 bg-neutral-700 rounded-lg cursor-pointer accent-purple-400"
              />
            </div>

            {/* Color Theme Selector */}
            <div>
              <label className="text-[11px] font-semibold text-neutral-400 block mb-1">
                Color Theme:
              </label>
              <div className="flex items-center gap-2">
                {(['pink', 'cyan', 'purple', 'gold'] as const).map(themeKey => (
                  <button
                    key={themeKey}
                    type="button"
                    onClick={() => {
                      setGoalWidgetConfig(prev => {
                        const updated = { ...prev, theme: themeKey };
                        liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                        return updated;
                      });
                    }}
                    className={`flex-1 py-1 px-1.5 rounded-xl border text-[10px] font-bold capitalize transition-all cursor-pointer ${
                      (goalWidgetConfig.theme || 'pink') === themeKey
                        ? 'border-white bg-white/10 text-white shadow-md'
                        : 'border-neutral-800 bg-[#161622] text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                        themeKey === 'pink'
                          ? 'bg-[#ff007a]'
                          : themeKey === 'cyan'
                          ? 'bg-cyan-400'
                          : themeKey === 'purple'
                          ? 'bg-purple-400'
                          : 'bg-amber-400'
                      }`}
                    />
                    {themeKey}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-neutral-400 block mb-1">
                Widget Title:
              </label>
              <input
                type="text"
                value={goalWidgetConfig.title || 'Follower Goal'}
                onChange={e => {
                  const val = e.target.value;
                  setGoalWidgetConfig(prev => {
                    const updated = { ...prev, title: val };
                    liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                    return updated;
                  });
                }}
                className="w-full bg-[#181824] text-xs text-white px-3 py-1.5 rounded-xl border border-neutral-700/80 focus:border-purple-400 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                  Current Followers:
                </label>
                <div className="w-full bg-[#14141e] text-xs text-neutral-300 px-2.5 py-1.5 rounded-xl border border-neutral-800 flex items-center justify-between select-none">
                  <span className="font-mono font-bold text-white">{(currentUser?.followersCount || 0).toLocaleString()}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Auto</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-neutral-400 block mb-1">
                  Goal Target (Max 6 Digits):
                </label>
                <input
                  type="number"
                  min={1}
                  max={999999}
                  value={goalWidgetConfig.target ?? 100}
                  onChange={e => {
                    let cleaned = e.target.value.replace(/[^0-9]/g, '');
                    if (cleaned.length > 6) cleaned = cleaned.slice(0, 6);
                    let val = Number(cleaned);
                    if (val > 999999) val = 999999;
                    if (val < 1 && cleaned !== '') val = 1;
                    const finalTarget = cleaned === '' ? 1 : val;
                    setGoalWidgetConfig(prev => {
                      const updated = { ...prev, target: finalTarget };
                      liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                      return updated;
                    });
                  }}
                  placeholder="e.g. 5000"
                  className="w-full bg-[#181824] text-xs text-white px-2.5 py-1.5 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none font-mono"
                />
              </div>
            </div>
            <div className="text-[9px] text-neutral-500 italic mt-0.5">
              * Current followers count is automatically updated from your account. Goal is limited to max 6 digits (999,999).
            </div>
          </div>
        </div>
      );
    }

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

        <div>
          <span className="text-[11px] font-semibold text-neutral-400 block mb-1.5">
            Quick Alignments:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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
              onClick={() => {
                if (selectedSourceId === 'screen') {
                  const flexH = canvasAspectRatio === '9:16' ? 32 : 100;
                  updateActiveTransform({
                    x: 0,
                    y: 0,
                    width: 100,
                    height: flexH,
                    borderRadius: 0,
                  });
                } else {
                  updateActiveTransform({
                    x: 58,
                    y: 68,
                    width: 38,
                    height: 26,
                    borderRadius: 16,
                  });
                }
              }}
              className="py-1.5 px-2 rounded-xl bg-[#1c1c28] hover:bg-cyan-500/20 text-[10px] font-semibold text-cyan-300 hover:text-white border border-cyan-500/40 text-center cursor-pointer"
              title="Flex to standard 16:9 ratio"
            >
              Flex to Size
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
      </div>
    );
  };

  // ==========================================================================
  // SHARED COMPONENT: Audio Mixer Panel (Desktop)
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

      <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className={`w-4 h-4 ${micActive ? 'text-[#ff007a]' : 'text-neutral-500'}`} />
            <span className="text-xs font-bold text-white">Microphone</span>
            {isMicAccessGranted && micActive && (
              <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !micActive;
              setMicActive(next);
              if (next && !micMediaStreamRef.current) {
                initMicAudio();
              }
            }}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
              micActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
            }`}
          >
            {micActive ? 'LIVE' : 'MUTED'}
          </button>
        </div>

        <div className="space-y-1">
          <div className="h-2.5 w-full bg-neutral-900 rounded-full overflow-hidden flex p-0.5 border border-white/5">
            <div
              style={{ width: `${micMeterLevel}%` }}
              className={`h-full rounded-full transition-all duration-75 ${
                micMeterLevel > 80
                  ? 'bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.95)]'
                  : micMeterLevel > 60
                  ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]'
                  : micMeterLevel > 5
                  ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                  : 'bg-neutral-700'
              }`}
            />
          </div>
          <div className="flex justify-between text-[9px] text-neutral-500 font-mono">
            <span>-40dB</span>
            <span className="text-neutral-400 font-bold">
              {micActive
                ? micMeterLevel > 5
                  ? `${Math.round(-40 + (micMeterLevel / 100) * 40)}dB`
                  : '-∞dB'
                : 'MUTED'}
            </span>
            <span>0dB</span>
          </div>
        </div>

        {!isMicAccessGranted && (
          <button
            type="button"
            onClick={() => initMicAudio()}
            className="w-full py-1.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Enable & Test Hardware Microphone</span>
          </button>
        )}

        <div className="flex justify-between items-center text-[11px] text-neutral-400 pt-1">
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

        <div className="space-y-1">
          <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${desktopMeterLevel}%` }}
              className="h-full bg-cyan-400 transition-all duration-100"
            />
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
  // SHARED COMPONENT: Locked Stream Info (Desktop)
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
        <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800/80">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
            Stream Title:
          </div>
          <div className="text-xs font-bold text-white break-words">
            {streamTitle || 'Untitled Stream'}
          </div>
        </div>

        <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800/80">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
            Category / Topic:
          </div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-xl bg-[#ff007a]/20 border border-[#ff007a]/40 text-[#ff007a] font-extrabold text-xs">
            {streamTopic || 'General'}
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================================================
  // 📱 MOBILE VIEW: MODE 1 DEVICE CAMERA SETUP (Matching Screenshot 1)
  // ==========================================================================
  if (isMobileViewport && mode === 'setup') {
    return (
      <div className="fixed inset-0 z-40 bg-black text-white flex flex-col justify-between overflow-hidden select-none">
        {/* Fullscreen Camera Preview Background */}
        <div className="absolute inset-0 z-0 bg-neutral-900 overflow-hidden">
          {cameraSource === 'webcam' && cameraRealStream ? (
            <video
              ref={el => {
                mobileVideoRef.current = el;
                if (el && cameraRealStream && el.srcObject !== cameraRealStream) {
                  el.srcObject = cameraRealStream;
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              style={{ filter: getCameraFilterStyle() }}
              className={`w-full h-full object-cover ${
                mobileFacingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />
          ) : (
            <div
              style={{ filter: getCameraFilterStyle() }}
              className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1c1c28] via-[#101018] to-[#07070d] text-center p-6"
            >
              <div className="w-24 h-24 rounded-full bg-pink-500/10 border border-[#ff007a]/30 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(255,0,122,0.3)]">
                <Camera className="w-10 h-10 text-[#ff007a]" />
              </div>
              <p className="text-sm font-bold text-white mb-1">Mobile Camera Preview</p>
              <p className="text-xs text-neutral-400 max-w-xs mb-4">
                Tap Flip or Enable Camera to activate your device selfie/rear lens
              </p>
              <button
                type="button"
                onClick={handleEnableRealWebcam}
                className="px-4 py-2 rounded-full bg-[#ff007a] text-white text-xs font-bold shadow-lg active:scale-95"
              >
                Enable Device Camera
              </button>
            </div>
          )}
          {/* Subtle gradient vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/85 pointer-events-none" />
        </div>

        {/* Top-Left: Clean Close [X] Button (No shield, No home, No rewards banner) */}
        <div className="relative z-20 p-4 flex items-center justify-between pointer-events-none">
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className="p-2.5 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-black/60 active:scale-90 transition-transform cursor-pointer pointer-events-auto border border-white/10 shadow-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Center-Right Vertical Controls Toolbar: Only Flip & Text (All others removed) */}
        <div className="absolute top-1/3 right-3.5 z-20 flex flex-col items-center gap-4 pointer-events-auto">
          {/* Flip Camera */}
          <button
            type="button"
            onClick={handleToggleMobileCameraFacing}
            className="flex flex-col items-center gap-1 group active:scale-90 transition-transform cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg group-hover:bg-black/70">
              <RotateCcw className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              Flip
            </span>
          </button>

          {/* Text Overlay Tool */}
          <button
            type="button"
            onClick={() => {
              setTempOverlayInput(mobileOverlayText);
              setMobileShowTextModal(true);
            }}
            className="flex flex-col items-center gap-1 group active:scale-90 transition-transform cursor-pointer"
          >
            <div
              className={`w-11 h-11 rounded-full backdrop-blur-md border flex items-center justify-center shadow-lg transition-colors ${
                mobileOverlayText
                  ? 'bg-[#ff007a] border-[#ff007a] text-white shadow-[0_0_20px_rgba(255,0,122,0.6)]'
                  : 'bg-black/50 border-white/20 text-white group-hover:bg-black/70'
              }`}
            >
              <Type className="w-5 h-5" />
            </div>
            <span
              className={`text-[11px] font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${
                mobileOverlayText ? 'text-[#ff007a]' : 'text-white'
              }`}
            >
              Text
            </span>
          </button>
        </div>

        {/* Freely Movable & Adjustable Custom Text Overlay on Screen (if set) */}
        {mobileOverlayText && (
          <div
            style={{
              left: `${mobileOverlayCoords.x}%`,
              top: `${mobileOverlayCoords.y}%`,
              transform: `scale(${mobileOverlayScale})`,
              transformOrigin: 'top left',
              touchAction: 'none',
            }}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            onPointerCancel={handleOverlayPointerUp}
            className={`absolute z-30 select-none cursor-grab active:cursor-grabbing transition-shadow ${
              isDraggingOverlay ? 'ring-2 ring-white/80 shadow-2xl scale-[1.04]' : ''
            }`}
          >
            <div
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold shadow-xl flex items-center gap-1.5 ${getOverlayStyleClass()}`}
            >
              <Move className="w-3.5 h-3.5 opacity-70 shrink-0" />
              <span className="whitespace-nowrap">{mobileOverlayText}</span>
              <Edit3 className="w-3.5 h-3.5 opacity-75 shrink-0" />
            </div>
            {/* Subtle drag hint indicator */}
            <div className="text-[9px] text-white/75 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-full mt-1 w-fit mx-auto border border-white/10 pointer-events-none">
              Hold & drag anywhere · Tap to edit
            </div>
          </div>
        )}

        {/* Center Space: Empty & Clean to showcase camera feed */}
        <div className="flex-1" />

        {/* Bottom Section: Stream Title Card + Big Red "Go LIVE" Button */}
        <div className="relative z-10 px-4 pb-6 pt-2 flex flex-col gap-3">
          {/* Stream Title Card (Avatar + Title with edit pencil) */}
          <div
            onClick={() => setMobileShowTitleModal(true)}
            className="flex items-center gap-2.5 p-2.5 bg-black/50 backdrop-blur-md rounded-2xl border border-white/15 cursor-pointer active:scale-98 transition-transform"
          >
            <Avatar src={currentUser?.avatar} alt={currentUser?.displayName} size="sm" />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">
                  {streamTitle || 'TikTok Live'}
                </span>
                <Edit3 className="w-3.5 h-3.5 text-[#ff007a]" />
              </div>
              <span className="text-[10px] text-neutral-300 font-medium">
                {streamTopic} · Tap to edit title & topic
              </span>
            </div>
          </div>

          {/* Big Hot Pink / Red "Go LIVE" Button */}
          <button
            type="button"
            onClick={() => handleProceedToGoLive()}
            className="w-full py-3.5 px-6 rounded-full bg-gradient-to-r from-[#ff007a] via-[#ff1493] to-[#e6006c] hover:opacity-95 text-white font-extrabold text-base shadow-[0_0_30px_rgba(255,0,122,0.6)] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Go LIVE</span>
          </button>
        </div>

        {/* Modal: Edit Stream Title on Mobile */}
        {mobileShowTitleModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-fadeIn">
            <div className="bg-[#121218] border border-neutral-800 rounded-3xl p-5 w-full max-w-sm text-left space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
                <h3 className="text-sm font-bold text-white">Edit Live Stream Title</h3>
                <button onClick={() => setMobileShowTitleModal(false)} className="text-neutral-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">Title:</label>
                <input
                  type="text"
                  maxLength={60}
                  value={streamTitle}
                  onChange={e => setStreamTitle(e.target.value)}
                  placeholder="e.g. Chatting with viewers & Q&A!"
                  className="w-full bg-[#181824] text-xs text-white p-3 rounded-xl border border-neutral-700 outline-none focus:border-[#ff007a]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Topic:</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Just Chatting', 'Gaming', 'Music', 'Vlog', 'Beauty', 'Dance'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setStreamTopic(t)}
                      className={`py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                        streamTopic === t
                          ? 'bg-[#ff007a]/20 border-[#ff007a] text-white'
                          : 'bg-[#181824] border-neutral-800 text-neutral-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileShowTitleModal(false)}
                className="w-full py-2.5 rounded-xl bg-[#ff007a] text-white font-bold text-xs"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Modal: Text Overlay Editor on Mobile */}
        {mobileShowTextModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-fadeIn">
            <div className="bg-[#121218] border border-neutral-800 rounded-3xl p-5 w-full max-w-sm text-left space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-[#ff007a]" />
                  <h3 className="text-sm font-bold text-white">Stream Overlay Text</h3>
                </div>
                <button onClick={() => setMobileShowTextModal(false)} className="text-neutral-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">
                  Overlay Message:
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={tempOverlayInput}
                  onChange={e => setTempOverlayInput(e.target.value)}
                  placeholder="e.g. Welcome to my LIVE! 💖"
                  className="w-full bg-[#181824] text-xs text-white p-3 rounded-xl border border-neutral-700 outline-none focus:border-[#ff007a]"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  This text floats directly over your camera video during your broadcast.
                </span>
              </div>

              {/* Text Size / Scale Adjuster */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-neutral-300">
                    Text Size & Scale:
                  </label>
                  <span className="text-[11px] font-mono font-bold text-[#ff007a]">
                    {mobileOverlayScale === 0.85
                      ? 'Small (85%)'
                      : mobileOverlayScale === 1.0
                      ? 'Normal (100%)'
                      : mobileOverlayScale === 1.25
                      ? 'Large (125%)'
                      : 'X-Large (150%)'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { scale: 0.85, label: 'S (85%)' },
                    { scale: 1.0, label: 'M (100%)' },
                    { scale: 1.25, label: 'L (125%)' },
                    { scale: 1.5, label: 'XL (150%)' },
                  ].map(item => (
                    <button
                      key={item.scale}
                      type="button"
                      onClick={() => setMobileOverlayScale(item.scale)}
                      className={`py-1.5 rounded-xl text-[11px] font-bold text-center border transition-all ${
                        mobileOverlayScale === item.scale
                          ? 'bg-[#ff007a]/20 border-[#ff007a] text-white shadow-sm'
                          : 'bg-[#181824] border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style & Color Theme */}
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Style & Color:
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { id: 'pink', name: 'Pink', bg: 'bg-[#ff007a] text-white' },
                    { id: 'black', name: 'Dark Glass', bg: 'bg-black/75 text-white border border-white/20' },
                    { id: 'cyan', name: 'Neon', bg: 'bg-black/85 text-cyan-400 border border-cyan-400' },
                    { id: 'white', name: 'White', bg: 'bg-white text-black font-extrabold' },
                    { id: 'gold', name: 'Gold', bg: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold' },
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setMobileOverlayStyle(s.id as typeof mobileOverlayStyle)}
                      className={`p-2 rounded-xl text-[10px] font-bold text-center border transition-all ${
                        mobileOverlayStyle === s.id
                          ? 'border-white ring-2 ring-white/30 scale-105'
                          : 'border-transparent opacity-80 hover:opacity-100'
                      } ${s.bg}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 1-Tap Quick Position Presets */}
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Quick Position Snap:
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: 'Top Left', x: 8, y: 14 },
                    { label: 'Top Center', x: 28, y: 14 },
                    { label: 'Center', x: 25, y: 45 },
                    { label: 'Lower Left', x: 8, y: 72 },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setMobileOverlayCoords({ x: preset.x, y: preset.y })}
                      className="py-1.5 px-1 rounded-xl text-[10px] font-bold text-center bg-[#181824] border border-neutral-800 text-neutral-300 hover:border-[#ff007a] hover:text-white transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mt-2 p-2 rounded-xl bg-neutral-900/80 border border-neutral-800 text-[11px] text-neutral-400">
                  <Move className="w-3.5 h-3.5 text-[#ff007a] shrink-0" />
                  <span>
                    Touch, hold & <strong>freely drag</strong> this text anywhere across your screen at any time!
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {mobileOverlayText && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOverlayText('');
                      setTempOverlayInput('');
                      setMobileShowTextModal(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white font-bold text-xs"
                  >
                    Clear Text
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOverlayText(tempOverlayInput.trim());
                    setMobileShowTextModal(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#ff007a] text-white font-bold text-xs shadow-md"
                >
                  Save Text
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // 📱 MOBILE VIEW: MODE 1 DEVICE CAMERA ACTIVE BROADCAST (While Started Live)
  // ==========================================================================
  if (isMobileViewport && mode === 'active') {
    return (
      <div className="fixed inset-0 z-40 bg-black text-white flex flex-col justify-between overflow-hidden select-none">
        {/* Fullscreen Live Camera Background */}
        <div className="absolute inset-0 z-0 bg-neutral-950 overflow-hidden">
          {cameraSource === 'webcam' && cameraRealStream ? (
            <video
              ref={el => {
                mobileVideoRef.current = el;
                if (el && cameraRealStream && el.srcObject !== cameraRealStream) {
                  el.srcObject = cameraRealStream;
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              style={{ filter: getCameraFilterStyle() }}
              className={`w-full h-full object-cover ${
                mobileFacingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />
          ) : (
            <div
              style={{ filter: getCameraFilterStyle() }}
              className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1a26] via-[#101018] to-[#07070e]"
            >
              <div className="w-20 h-20 rounded-full bg-pink-500/20 border border-[#ff007a]/40 flex items-center justify-center mb-3">
                <Camera className="w-8 h-8 text-[#ff007a]" />
              </div>
              <span className="text-sm font-bold text-white">Live Broadcast On Air</span>
              <span className="text-xs text-neutral-400 mt-0.5">Device Camera Live Feed</span>
            </div>
          )}
          {/* Subtle gradient vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80 pointer-events-none" />
        </div>

        {/* Freely Movable & Adjustable Custom Text Overlay on Screen while Live */}
        {mobileOverlayText && (
          <div
            style={{
              left: `${mobileOverlayCoords.x}%`,
              top: `${mobileOverlayCoords.y}%`,
              transform: `scale(${mobileOverlayScale})`,
              transformOrigin: 'top left',
              touchAction: 'none',
            }}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            onPointerCancel={handleOverlayPointerUp}
            className={`absolute z-30 select-none cursor-grab active:cursor-grabbing transition-shadow ${
              isDraggingOverlay ? 'ring-2 ring-white/80 shadow-2xl scale-[1.04]' : ''
            }`}
          >
            <div
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold shadow-xl flex items-center gap-1.5 ${getOverlayStyleClass()}`}
            >
              <Move className="w-3.5 h-3.5 opacity-70 shrink-0" />
              <span className="whitespace-nowrap">{mobileOverlayText}</span>
              <Edit3 className="w-3.5 h-3.5 opacity-75 shrink-0" />
            </div>
            {/* Subtle drag hint indicator */}
            <div className="text-[9px] text-white/75 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-full mt-1 w-fit mx-auto border border-white/10 pointer-events-none">
              Hold & drag anywhere · Tap to edit
            </div>
          </div>
        )}

        {/* Top Header Overlay: Host avatar + Timer + Viewers + End Button */}
        <div className="relative z-20 p-3 pt-4 flex items-center justify-between">
          {/* Host info badge */}
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-md">
            <Avatar src={currentUser?.avatar} alt={currentUser?.displayName} size="xs" />
            <div className="text-left">
              <div className="text-xs font-bold text-white truncate max-w-[110px]">
                {currentUser?.displayName || 'Host'}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-[10px] text-red-300 font-mono font-bold">
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>
            </div>
          </div>

          {/* Viewers & End button */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white text-xs font-bold">
              <Radio className="w-3.5 h-3.5 text-[#ff007a] animate-pulse" />
              <span>{Math.max(currentLiveStream.viewers?.length || 0, currentLiveStream.viewersCount || 0, broadcastViewersCount)}</span>
            </div>

            {/* End Button */}
            <button
              type="button"
              onClick={() => setMobileEndConfirmOpen(true)}
              className="py-1.5 px-3.5 rounded-full bg-red-600/90 hover:bg-red-600 text-white font-extrabold text-xs shadow-md active:scale-95 cursor-pointer"
            >
              End
            </button>
          </div>
        </div>

        {/* Floating Heart Animations */}
        <div className="absolute right-4 bottom-20 z-30 pointer-events-none flex flex-col items-center">
          {mobileFloatingHearts.map(timestamp => (
            <div
              key={timestamp}
              className="animate-floatHeart text-2xl text-[#ff007a] mb-2 drop-shadow-lg"
            >
              ❤️
            </div>
          ))}
        </div>

        {/* Floating Semi-Transparent Live Comments Stream */}
        <div className="relative z-20 px-3 pb-2 flex flex-col justify-end min-h-0 flex-1">
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-2 max-w-[85%] text-left pointer-events-auto scrollbar-none">
            {currentLiveStream.messages.slice(-16).map(msg => {
              if (msg.isSystemEvent) {
                if (msg.isLikeEvent) {
                  return (
                    <div
                      key={msg.id}
                      className="bg-black/55 backdrop-blur-md text-[11px] text-[#ff007a] font-semibold px-2.5 py-1 rounded-xl w-fit shadow-md flex items-center gap-1.5 border border-pink-500/20"
                    >
                      <Heart className="w-3 h-3 text-[#ff007a] fill-[#ff007a] shrink-0" />
                      <span>
                        <span className="font-bold text-white">@{msg.username || msg.displayName} </span>
                        liked your stream
                      </span>
                    </div>
                  );
                }

                if (msg.isJoinEvent) {
                  return (
                    <div
                      key={msg.id}
                      className="bg-black/55 backdrop-blur-md text-[11px] text-cyan-300 font-semibold px-2.5 py-1 rounded-xl w-fit shadow-md flex items-center gap-1.5 border border-cyan-500/20"
                    >
                      <UserPlus className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span>
                        <span className="font-bold text-white">@{msg.username || msg.displayName} </span>
                        joined
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className="bg-black/45 backdrop-blur-md text-[11px] text-amber-300 font-medium px-2.5 py-1 rounded-xl w-fit shadow-md flex items-center gap-1.5 border border-white/5"
                  >
                    <Sparkles className="w-3 h-3 text-[#ff007a] shrink-0" />
                    <span>
                      <span className="font-bold text-white">@{msg.username || msg.displayName} </span>
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
                  className="bg-black/55 backdrop-blur-md text-white rounded-2xl px-3 py-1.5 border border-white/10 flex items-start gap-2 shadow-md"
                >
                  <Avatar src={msg.avatar} alt={msg.displayName} size="xs" className="mt-0.5 shrink-0" />
                  <div className="min-w-0 text-left">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-[#ff007a] truncate">
                        {msg.displayName}
                      </span>
                      {isHostMsg && (
                        <span className="bg-[#ff007a] text-white text-[8px] font-black px-1 py-0.2 rounded-full uppercase">
                          HOST
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-white/95 break-words leading-tight">
                      {msg.text}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={commentsEndRef} />
          </div>

          {/* Floating Bottom Host Action Bar */}
          <div className="pt-2 flex items-center gap-2 pointer-events-auto">
            {/* Live Chat input */}
            <form
              onSubmit={handleHostSendChat}
              className="flex-1 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-3.5 py-2 border border-white/20 focus-within:border-[#ff007a] shadow-lg"
            >
              <input
                type="text"
                placeholder="Add a comment..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                className="flex-1 bg-transparent text-xs text-white placeholder-white/60 outline-none"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="text-[#ff007a] hover:text-[#ff3399] disabled:opacity-30 p-1 cursor-pointer transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Quick Action Icons: Flip, Mic, Text, Heart */}
            <button
              type="button"
              onClick={handleToggleMobileCameraFacing}
              className="p-2.5 rounded-full bg-black/60 backdrop-blur-md text-white border border-white/15 active:scale-90 cursor-pointer shadow-md"
              title="Flip Camera"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setTempOverlayInput(mobileOverlayText);
                setMobileShowTextModal(true);
              }}
              className={`p-2.5 rounded-full backdrop-blur-md border active:scale-90 cursor-pointer shadow-md ${
                mobileOverlayText
                  ? 'bg-[#ff007a] border-[#ff007a] text-white'
                  : 'bg-black/60 border-white/15 text-white'
              }`}
              title="Overlay Text"
            >
              <Type className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setMicActive(!micActive)}
              className={`p-2.5 rounded-full backdrop-blur-md border active:scale-90 cursor-pointer shadow-md ${
                micActive
                  ? 'bg-black/60 border-white/15 text-white'
                  : 'bg-red-500/80 border-red-500 text-white'
              }`}
              title="Mute/Unmute Mic"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleTriggerMobileHeart}
              className="p-2.5 rounded-full bg-[#ff007a] text-white shadow-[0_0_15px_rgba(255,0,122,0.5)] active:scale-90 cursor-pointer"
              title="Send Love"
            >
              <Heart className="w-4 h-4 fill-white" />
            </button>
          </div>
        </div>

        {/* Modal: Text Overlay Editor on Mobile during Live */}
        {mobileShowTextModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-fadeIn">
            <div className="bg-[#121218] border border-neutral-800 rounded-3xl p-5 w-full max-w-sm text-left space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-[#ff007a]" />
                  <h3 className="text-sm font-bold text-white">Stream Overlay Text</h3>
                </div>
                <button onClick={() => setMobileShowTextModal(false)} className="text-neutral-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">
                  Overlay Message:
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={tempOverlayInput}
                  onChange={e => setTempOverlayInput(e.target.value)}
                  placeholder="e.g. Welcome to my LIVE! 💖"
                  className="w-full bg-[#181824] text-xs text-white p-3 rounded-xl border border-neutral-700 outline-none focus:border-[#ff007a]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                  Style & Color:
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'pink', name: 'Pink', bg: 'bg-[#ff007a] text-white' },
                    { id: 'black', name: 'Dark Glass', bg: 'bg-black/75 text-white border border-white/20' },
                    { id: 'cyan', name: 'Neon Cyan', bg: 'bg-black/85 text-cyan-400 border border-cyan-400' },
                    { id: 'white', name: 'Pure White', bg: 'bg-white text-black font-extrabold' },
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setMobileOverlayStyle(s.id as typeof mobileOverlayStyle)}
                      className={`p-2 rounded-xl text-[10px] font-bold text-center border transition-all ${
                        mobileOverlayStyle === s.id
                          ? 'border-white ring-2 ring-white/30'
                          : 'border-transparent'
                      } ${s.bg}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {mobileOverlayText && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOverlayText('');
                      setTempOverlayInput('');
                      setMobileShowTextModal(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white font-bold text-xs"
                  >
                    Clear Text
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOverlayText(tempOverlayInput.trim());
                    setMobileShowTextModal(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#ff007a] text-white font-bold text-xs shadow-md"
                >
                  Save Text
                </button>
              </div>
            </div>
          </div>
        )}

        {/* End Live Confirmation Modal */}
        {mobileEndConfirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-[#121218] border border-neutral-800 rounded-3xl p-5 w-full max-w-xs text-center space-y-4">
              <h3 className="text-base font-bold text-white">End live broadcast?</h3>
              <p className="text-xs text-neutral-400">
                Are you sure you want to end your live stream? Viewers will be notified that the stream has ended.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMobileEndConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEndLive}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-[#d00062] text-white font-bold text-xs"
                >
                  End Live
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // 💻 DESKTOP VIEW: MODE A - Setup Workstation (Screen width >= 768px)
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
            {/* Switch to Mobile View Preview button */}
            <button
              type="button"
              onClick={() => setIsMobileViewport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#181824] hover:bg-[#222234] border border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer text-xs"
              title="Preview TikTok Mobile Layout"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#ff007a]" />
              <span>Mobile View</span>
            </button>

            {/* Aspect Ratio Switcher */}
            <div className="flex items-center bg-[#181824] p-1 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setCanvasAspectRatio('9:16');
                  liveBroadcastService.updateStudioConfig({ aspectRatio: '9:16' });
                }}
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
                onClick={() => {
                  setCanvasAspectRatio('16:9');
                  liveBroadcastService.updateStudioConfig({ aspectRatio: '16:9' });
                }}
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
          <div className="lg:col-span-3 flex flex-col gap-4 text-left">
            {renderSceneSourcesStack()}
            {renderSourceInspector()}
          </div>

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

              <div
                className={`w-full relative transition-all duration-300 ${
                  canvasAspectRatio === '16:9'
                    ? 'aspect-video max-h-[460px]'
                    : 'aspect-[9/16] max-h-[620px]'
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
                  showHostTag={false}
                  showMusicBanner={showMusicBanner}
                  showGoalBar={showGoalBar || !!goalWidgetConfig.enabled}
                  goalWidgetConfig={goalWidgetConfig}
                  onUpdateGoalWidgetConfig={cfg =>
                    setGoalWidgetConfig(prev => {
                      const updated = { ...prev, ...cfg };
                      liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                      return updated;
                    })
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

          <div className="lg:col-span-3 flex flex-col gap-4 text-left">
            <div className="bg-[#121218] rounded-3xl border border-neutral-800 p-4 shadow-xl space-y-4">
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

              {rightStudioTab === 'audio' && renderAudioMixer()}

              {rightStudioTab === 'overlays' && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                    Interactive Overlays
                  </span>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#181824] border border-neutral-800 text-xs text-neutral-300 cursor-pointer hover:border-neutral-700 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        {goalWidgetConfig.title} ({(currentUser?.followersCount || 0).toLocaleString()} / {(goalWidgetConfig.target ?? 100).toLocaleString()})
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        Follower milestone bar · Current count is automatic
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

                  {goalWidgetConfig.enabled && (
                    <div className="p-3 bg-[#181824] rounded-2xl border border-neutral-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-neutral-300">
                          Custom Goal Target:
                        </label>
                        <span className="text-[10px] text-neutral-500 font-mono">Max 6 digits (999,999)</span>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={999999}
                        value={goalWidgetConfig.target ?? 100}
                        onChange={e => {
                          let cleaned = e.target.value.replace(/[^0-9]/g, '');
                          if (cleaned.length > 6) cleaned = cleaned.slice(0, 6);
                          let val = Number(cleaned);
                          if (val > 999999) val = 999999;
                          if (val < 1 && cleaned !== '') val = 1;
                          const finalTarget = cleaned === '' ? 1 : val;
                          setGoalWidgetConfig(prev => {
                            const updated = { ...prev, target: finalTarget };
                            liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                            return updated;
                          });
                        }}
                        placeholder="e.g. 5000"
                        className="w-full bg-[#121218] text-xs text-white px-3 py-2 rounded-xl border border-neutral-700/80 focus:border-[#ff007a] outline-none font-mono"
                      />
                      <div className="text-[9px] text-neutral-500">
                        Current: <span className="text-white font-bold font-mono">{(currentUser?.followersCount || 0).toLocaleString()}</span> (auto-synced)
                      </div>
                    </div>
                  )}
                </div>
              )}

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
  // 💻 DESKTOP VIEW: MODE B - Active Live Broadcast Workstation (Screen width >= 768px)
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
          {/* Switch to Mobile View Preview button */}
          <button
            type="button"
            onClick={() => setIsMobileViewport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#181824] hover:bg-[#222234] border border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer text-xs"
            title="Preview TikTok Mobile Layout"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#ff007a]" />
            <span>Mobile View</span>
          </button>

          {/* Studio Controls Dropdown Trigger */}
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
              onClick={() => {
                setCanvasAspectRatio('9:16');
                liveBroadcastService.updateStudioConfig({ aspectRatio: '9:16' });
              }}
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
              onClick={() => {
                setCanvasAspectRatio('16:9');
                liveBroadcastService.updateStudioConfig({ aspectRatio: '16:9' });
              }}
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
            <span>{Math.max(currentLiveStream.viewers?.length || 0, currentLiveStream.viewersCount || 0, broadcastViewersCount)} Viewers</span>
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
        {/* Broadcast Stage (8 Cols) */}
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

            <div
              className={`w-full relative transition-all duration-300 my-auto ${
                canvasAspectRatio === '16:9'
                  ? 'aspect-video max-h-[480px]'
                  : 'aspect-[9/16] max-h-[620px]'
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
                showHostTag={false}
                showMusicBanner={showMusicBanner}
                showGoalBar={showGoalBar || !!goalWidgetConfig.enabled}
                goalWidgetConfig={goalWidgetConfig}
                onUpdateGoalWidgetConfig={cfg =>
                  setGoalWidgetConfig(prev => {
                    const updated = { ...prev, ...cfg };
                    liveBroadcastService.updateStudioConfig({ goalConfig: updated });
                    return updated;
                  })
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

        {/* Live Comments & Viewers (4 Cols) */}
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
                <span>Viewers ({Math.max(currentLiveStream.viewers?.length || 0, currentLiveStream.viewersCount || 0, broadcastViewersCount)})</span>
              </button>
            </div>

            {/* TAB 1: LIVE COMMENTS STREAM */}
            {liveActiveRightTab === 'chat' && (
              <div className="flex-1 min-h-0 flex flex-col justify-between">
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                  {currentLiveStream.messages.length === 0 ? (
                    <div className="text-center py-12 text-neutral-500 text-xs flex flex-col items-center gap-2">
                      <MessageSquare className="w-8 h-8 text-neutral-600 stroke-[1.5]" />
                      <span>No comments yet. Viewer chats and replies will appear here in real time!</span>
                    </div>
                  ) : (
                    currentLiveStream.messages.map(msg => {
                      if (msg.isSystemEvent) {
                        if (msg.isLikeEvent) {
                          return (
                            <div
                              key={msg.id}
                              className="py-1 px-3 rounded-full bg-pink-500/10 border border-pink-500/30 text-[#ff007a] text-[11px] font-semibold flex items-center gap-1.5 shadow-sm"
                            >
                              <Heart className="w-3.5 h-3.5 text-[#ff007a] fill-[#ff007a] shrink-0" />
                              <span className="truncate">
                                <span className="font-bold text-white">@{msg.username || msg.displayName} </span>
                                liked your stream
                              </span>
                            </div>
                          );
                        }

                        if (msg.isJoinEvent) {
                          return (
                            <div
                              key={msg.id}
                              className="py-1 px-3 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold flex items-center gap-1.5 shadow-sm"
                            >
                              <UserPlus className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="truncate">
                                <span className="font-bold text-white">@{msg.username || msg.displayName} </span>
                                joined
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={msg.id}
                            className="py-1 px-3 rounded-full bg-pink-500/10 border border-pink-500/20 text-[#ff007a] text-[11px] font-semibold flex items-center gap-1.5 shadow-sm"
                          >
                            <Sparkles className="w-3 h-3 text-[#ff007a] shrink-0" />
                            <span className="truncate">
                              <span className="font-bold text-white">@{msg.username || msg.displayName} </span>
                              {msg.text}
                            </span>
                          </div>
                        );
                      }

                      const author = users.find(u => isSameUser(u.id, msg.userId));
                      const authorName = (msg.displayName && msg.displayName !== 'Viewer') ? msg.displayName : (author?.displayName || author?.username || 'User');
                      const authorAvatar = msg.avatar || author?.avatar || '';

                      const isHostMsg =
                        (currentUser && (isSameUser(msg.userId, currentUser.id) || msg.userId === currentUser.id)) ||
                        authorName === currentUser?.displayName;

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
                            src={authorAvatar}
                            alt={authorName}
                            size="xs"
                            className="mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-bold text-white text-[11px] truncate">
                                {authorName}
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

                {/* Bottom Section: Quick Reaction Emojis & Host Chat Input */}
                <div className="shrink-0 pt-2.5 border-t border-neutral-800 mt-2">
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
