import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { LiveStreamCanvas } from './LiveStreamCanvas';
import { Avatar } from '../common/Avatar';
import { createLiveViewerSession } from '../../services/liveBroadcastService';
import { isSameUser } from '../../lib/supabase';
import {
  Send,
  X,
  Radio,
  UserPlus,
  Check,
  Flag,
  Heart,
  RotateCcw,
  Laptop,
  Smartphone,
  Share2,
  Trash2,
} from 'lucide-react';
import { ShareLiveModal } from '../modals/ShareLiveModal';

interface FloatingHeartItem {
  id: string;
  xOffset: number;
  rotate: number;
  scale: number;
}

export const LiveStreamViewer: React.FC = () => {
  const {
    currentUser,
    currentLiveStream,
    sendLiveComment,
    deleteLiveComment,
    sendLiveLike,
    liveHeartTrigger,
    toggleFollowUser,
    users,
    setActiveTab,
    openReportModal,
  } = useApp();

  const [chatInput, setChatInput] = useState('');
  const [isLiveEnded, setIsLiveEnded] = useState(false);
  const [likeFloatingHearts, setLikeFloatingHearts] = useState<FloatingHeartItem[]>([]);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const [sessionKey, setSessionKey] = useState<number>(0);
  const [shareLiveModalOpen, setShareLiveModalOpen] = useState(false);

  const hostUser = users.find(u => u.id === currentLiveStream.host.id) || currentLiveStream.host;
  const isFollowingHost = !!hostUser.isFollowing;
  const isHost = Boolean(currentUser && (isSameUser(currentLiveStream.host?.id, currentUser.id) || currentLiveStream.host?.id === currentUser.id));

  // Stream Aspect Ratio Auto-Detection:
  // If host is on mobile (or stream explicitly has 9:16), default to 9:16 portrait.
  // If host is on PC/desktop, default to 16:9 widescreen.
  const [streamAspectRatio, setStreamAspectRatio] = useState<'9:16' | '16:9'>(() => {
    return currentLiveStream.isMobileStream || currentLiveStream.aspectRatio === '9:16' ? '9:16' : '16:9';
  });

  // Manual layout override if viewer wants to switch between wide and portrait
  const [manualLayoutOverride, setManualLayoutOverride] = useState<'9:16' | '16:9' | null>(null);

  // Viewer device detection (mobile < 1024px vs desktop >= 1024px)
  const [isViewerMobile, setIsViewerMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsViewerMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveAspectRatio: '9:16' | '16:9' = manualLayoutOverride || streamAspectRatio;
  const isPortraitMode = effectiveAspectRatio === '9:16';

  useEffect(() => {
    if (!currentLiveStream.id) return;
    let hasReceivedSignalOrStream = false;

    if (currentLiveStream.isMobileStream || currentLiveStream.aspectRatio === '9:16') {
      setStreamAspectRatio('9:16');
    } else if (currentLiveStream.aspectRatio === '16:9') {
      setStreamAspectRatio('16:9');
    }

    const cleanup = createLiveViewerSession(currentLiveStream.id, {
      viewerUser: currentUser
        ? {
            id: currentUser.id,
            username: (currentUser.username || 'viewer').replace(/^@/, ''),
            displayName: currentUser.displayName || currentUser.username || 'Viewer',
            avatar: currentUser.avatar || '',
          }
        : undefined,
      onRemoteStream: stream => {
        hasReceivedSignalOrStream = true;
        setRemoteStream(stream);
        setConnectionStatus('connected');

        // Automatic hardware-level aspect ratio detection from incoming video tracks
        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings?.();
          if (settings?.width && settings?.height) {
            if (settings.width > settings.height * 1.15) {
              setStreamAspectRatio('16:9');
            } else if (settings.height > settings.width * 1.15) {
              setStreamAspectRatio('9:16');
            }
          }
        }
      },
      onSnapshot: url => {
        hasReceivedSignalOrStream = true;
        setSnapshotUrl(url);
        setConnectionStatus(prev => (prev === 'connected' ? 'connected' : 'streaming'));
      },
      onAspectRatio: ratio => {
        if (ratio) {
          setStreamAspectRatio(ratio);
        }
      },
      onMobileStream: isMobile => {
        setStreamAspectRatio(isMobile ? '9:16' : '16:9');
      },
      onStreamEnded: () => {
        setIsLiveEnded(true);
      },
      onConnectionStateChange: state => {
        if (state === 'connected') {
          hasReceivedSignalOrStream = true;
        }
        setConnectionStatus(state);
      },
    });

    // Connection watchdog:
    const watchdogTimeout = window.setTimeout(() => {
      if (!hasReceivedSignalOrStream) {
        setConnectionStatus('offline');
      }
    }, 10000);

    return () => {
      clearTimeout(watchdogTimeout);
      cleanup();
    };
  }, [currentLiveStream.id, sessionKey]);

  // Real-time floating hearts on likes from any user (guaranteed to vanish after exactly 2 seconds)
  const triggerVanishHeart = useCallback(() => {
    const id = `heart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newHeart: FloatingHeartItem = {
      id,
      xOffset: (Math.random() - 0.5) * 44,
      rotate: (Math.random() - 0.5) * 26,
      scale: 0.9 + Math.random() * 0.35,
    };
    setLikeFloatingHearts(prev => [...prev.slice(-15), newHeart]);
    setTimeout(() => {
      setLikeFloatingHearts(prev => prev.filter(h => h.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    if (liveHeartTrigger > 0) {
      triggerVanishHeart();
    }
  }, [liveHeartTrigger, triggerVanishHeart]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendLiveComment(chatInput.trim());
    setChatInput('');
  };

  const handleFloatHeart = () => {
    triggerVanishHeart();
    sendLiveLike();
  };

  return (
    <div className="flex-1 p-2 sm:p-4 lg:p-6 max-w-7xl mx-auto w-full h-[calc(100vh-4rem)] flex flex-col select-none">
      {/* Top action row */}
      <div className="flex items-center justify-between pb-2 sm:pb-3 gap-2">
        <button
          onClick={() => setActiveTab('live')}
          className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
          <span>Exit Stream</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Share Live Stream Button */}
          <button
            type="button"
            onClick={() => setShareLiveModalOpen(true)}
            className="text-xs bg-[#ff007a]/20 hover:bg-[#ff007a]/35 text-[#ff007a] border border-[#ff007a]/40 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer font-bold shadow-sm"
            title="Share stream via message"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share Stream</span>
          </button>

          {/* Quick Layout Mode Switcher (Allows viewer to seamlessly toggle Wide 16:9 vs Portrait 9:16) */}
          <div className="flex items-center bg-[#181824] p-0.5 rounded-full border border-neutral-800 text-[11px] shadow-sm">
            <button
              type="button"
              onClick={() => setManualLayoutOverride('16:9')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
                effectiveAspectRatio === '16:9'
                  ? 'bg-[#ff007a] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Wide View (Desktop PC Host / Screen Share)"
            >
              <Laptop className="w-3 h-3" />
              <span>Wide (16:9)</span>
            </button>
            <button
              type="button"
              onClick={() => setManualLayoutOverride('9:16')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer ${
                effectiveAspectRatio === '9:16'
                  ? 'bg-[#ff007a] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Portrait View (Mobile Host)"
            >
              <Smartphone className="w-3 h-3" />
              <span>Portrait (9:16)</span>
            </button>
            {manualLayoutOverride && (
              <button
                type="button"
                onClick={() => setManualLayoutOverride(null)}
                className="px-1.5 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
                title="Reset to Automatic Host Stream Detection"
              >
                Auto
              </button>
            )}
          </div>

          {connectionStatus === 'offline' && !isLiveEnded && (
            <button
              onClick={() => {
                setConnectionStatus('connecting');
                setSessionKey(k => k + 1);
              }}
              className="text-[11px] bg-red-950/80 hover:bg-red-900 border border-red-500/50 text-red-200 px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer animate-pulse"
              title="Click to retry connecting to host stream"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reconnect Stream</span>
            </button>
          )}

          {/* Demo state toggler for "Live Ended" */}
          <button
            onClick={() => setIsLiveEnded(!isLiveEnded)}
            className="text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="hidden sm:inline">Toggle State: </span>
            <span>{isLiveEnded ? 'Live Ended' : 'Active'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN STREAM CONTENT: ADAPTIVE FOR PC/DESKTOP AND MOBILE VIEWERS          */}
      {/* ========================================================================= */}
      {isViewerMobile && !isPortraitMode ? (
        /* ----------------------------------------------------------------------- */
        /* MOBILE VIEWER + WIDE 16:9 DESKTOP STREAM: NOT STRETCHED, MAKES IT FLEX! */
        /* ----------------------------------------------------------------------- */
        <div className="flex-1 flex flex-col min-h-0 gap-3">
          {/* Top Section: Natural 16:9 Widescreen Player (No stretch, object-contain) */}
          <div className="w-full aspect-video max-h-[42vh] rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-xl shrink-0 relative flex items-center justify-center">
            {isLiveEnded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0d12] p-4 text-center">
                <Avatar src={hostUser.avatar} alt={hostUser.displayName || 'Host'} size="lg" className="mb-2 shadow-lg" />
                <h3 className="text-base font-bold text-white font-brand">{hostUser.displayName || 'Host'}</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Live Ended</p>
                <button
                  onClick={() => setActiveTab('live')}
                  className="mt-3 px-4 py-1.5 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Return to Live
                </button>
              </div>
            ) : (
              <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                <LiveStreamCanvas
                  compositeStream={remoteStream}
                  snapshotUrl={snapshotUrl}
                  layoutMode="custom"
                  cameraEnabled={true}
                  cameraSource="webcam"
                  showOverlays={true}
                  showHostTag={false}
                  canvasAspectRatio="16:9"
                  isMobileStream={false}
                  onDetectedAspectRatio={ratio => {
                    if (!manualLayoutOverride) setStreamAspectRatio(ratio);
                  }}
                  showMusicBanner={false}
                  showGoalBar={false}
                  hostName={hostUser.displayName || 'Host'}
                  timerText={
                    connectionStatus === 'connected' || connectionStatus === 'streaming'
                      ? 'LIVE'
                      : connectionStatus === 'connecting'
                      ? 'CONNECTING...'
                      : 'OFFLINE'
                  }
                  isLive={!isLiveEnded}
                />

                {/* Host Overlay Pill */}
                <div className="absolute top-2.5 left-2.5 z-40 flex items-center gap-1.5 pointer-events-auto">
                  <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1 pl-1.5 pr-2 rounded-full border border-white/15 shadow-md">
                    <Avatar src={hostUser.avatar} alt={hostUser.displayName || 'Host'} size="xs" className="w-6 h-6 ring-1 ring-[#ff007a]" />
                    <span className="text-xs font-bold text-white truncate max-w-[90px]">{hostUser.displayName || 'Host'}</span>
                    <button
                      type="button"
                      onClick={() => toggleFollowUser(hostUser.id)}
                      className={`py-0.5 px-2 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                        isFollowingHost
                          ? 'bg-neutral-800 text-neutral-300'
                          : 'bg-[#ff007a] hover:bg-[#ff1a8c] text-white'
                      }`}
                    >
                      {isFollowingHost ? 'Following' : '+Follow'}
                    </button>
                  </div>
                </div>

                {/* Floating Hearts */}
                <div className="absolute right-4 bottom-4 pointer-events-none z-30 overflow-visible">
                  {likeFloatingHearts.map(heart => (
                    <div
                      key={heart.id}
                      className="absolute bottom-0 right-0 animate-float-heart text-[#ff007a]"
                      style={{
                        transform: `translateX(${heart.xOffset}px) rotate(${heart.rotate}deg) scale(${heart.scale})`,
                      }}
                    >
                      <Heart className="w-7 h-7 fill-[#ff007a] drop-shadow-[0_2px_8px_rgba(255,0,122,0.6)]" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Section: Flexing Interactive Chat & Stream Details */}
          <div className="flex-1 min-h-0 flex flex-col bg-[#13131a] rounded-2xl border border-neutral-800 overflow-hidden shadow-xl p-3">
            {/* Header with viewers count, like count and title */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2 min-w-0">
                <Radio className="w-3.5 h-3.5 text-[#ff007a] animate-pulse shrink-0" />
                <span className="text-xs font-bold text-white truncate">{currentLiveStream.title || 'Live Stream'}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-pink-500/15 border border-pink-500/30 px-2 py-0.5 rounded-full text-[11px] font-bold text-white">
                  <Heart className="w-3 h-3 text-[#ff007a] fill-[#ff007a]" />
                  <span>{currentLiveStream.likesCount || 0}</span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-400">
                  {Math.max(currentLiveStream.viewers?.length || 0, currentLiveStream.viewersCount || 0, 1)} watching
                </span>
                <button
                  type="button"
                  onClick={() => setShareLiveModalOpen(true)}
                  className="p-1 rounded-full text-neutral-400 hover:text-pink-400 cursor-pointer"
                  title="Share Stream"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openReportModal({
                      type: 'live_stream',
                      targetId: currentLiveStream.id,
                      targetName: `${hostUser.displayName || hostUser.username}'s Live Stream`,
                      targetSubtitle: currentLiveStream.title,
                    })
                  }
                  className="p-1 rounded-full text-neutral-400 hover:text-red-400 cursor-pointer"
                  title="Report Stream"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Chat Feed */}
            <div className="flex-1 overflow-y-auto py-2 space-y-2 pr-1 text-left text-xs">
              {currentLiveStream.messages
                .filter(m => !m.isJoinEvent && !m.isHostOnlyWarning)
                .map(msg => {
                  if (msg.isSystemEvent) {
                    if (msg.isLikeEvent) {
                      return (
                        <div
                          key={msg.id}
                          className="py-0.5 px-2.5 rounded-full bg-pink-500/10 border border-pink-500/30 text-[#ff007a] text-[11px] font-semibold flex items-center gap-1.5 w-fit"
                        >
                          <Heart className="w-3 h-3 text-[#ff007a] fill-[#ff007a] shrink-0" />
                          <span>@{msg.username || msg.displayName} liked</span>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} className="text-[11px] text-neutral-400 py-0.5 italic">
                        {msg.text}
                      </div>
                    );
                  }

                  const author = users.find(u => isSameUser(u.id, msg.userId));
                  const authorName = (msg.displayName && msg.displayName !== 'Viewer') ? msg.displayName : (author?.displayName || author?.username || 'User');
                  const authorAvatar = msg.avatar || author?.avatar || '';

                  return (
                    <div key={msg.id} className="flex items-start gap-2">
                      <Avatar src={authorAvatar} alt={authorName} size="xs" className="mt-0.5" />
                      <div className="min-w-0 text-left">
                        <span className="text-[11px] font-bold text-[#ff007a] mr-1.5">{authorName}</span>
                        <span className="text-xs text-neutral-200">{msg.text}</span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Bottom Chat Bar with Like Button */}
            <form onSubmit={handleSendChat} className="pt-2 border-t border-neutral-800 flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-[#181824] rounded-full px-3 py-1.5 border border-neutral-700 focus-within:border-[#ff007a]">
                <input
                  type="text"
                  placeholder="Type chat message"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="text-[#ff007a] hover:text-[#ff3399] disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleFloatHeart}
                className="relative p-2 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white shadow-md active:scale-90 transition-all shrink-0 cursor-pointer flex items-center justify-center"
                title="Send Love"
              >
                <Heart className="w-4 h-4 fill-white" />
                <span className="absolute -top-1.5 -left-1.5 bg-neutral-900/90 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full border border-pink-500/40 shadow-sm">
                  {currentLiveStream.likesCount || 0}
                </span>
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* ----------------------------------------------------------------------- */
        /* STANDARD VIEW: DESKTOP VIEWER (WIDE OR PORTRAIT) OR MOBILE PORTRAIT     */
        /* ----------------------------------------------------------------------- */
        <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
          {/* Main Video Stage:
              - When host is in portrait 9:16 (mobile): Focused phone card in center (matches Screenshot 1)
              - When host is in wide 16:9 (PC/desktop): Full widescreen container with whole screen share + facecam
          */}
          <div className="flex-1 bg-black/95 rounded-2xl sm:rounded-3xl overflow-hidden border border-neutral-800 relative flex items-center justify-center p-2 sm:p-3 lg:p-4 shadow-2xl min-h-0">
            {isLiveEnded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0d12] p-8 text-center animate-fadeIn">
                <button
                  onClick={() => toggleFollowUser(hostUser.id)}
                  className="mb-4 flex items-center gap-1.5 py-1.5 px-4 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  {isFollowingHost ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+Follow</span>
                    </>
                  )}
                </button>

                <Avatar
                  src={hostUser.avatar}
                  alt={hostUser.displayName || 'Host'}
                  size="xl"
                  className="mb-4 shadow-xl"
                />

                <h3 className="text-xl font-bold text-white font-brand">{hostUser.displayName || 'Host'}</h3>
                <p className="text-sm text-neutral-400 mt-1 font-semibold">Live Ended</p>

                <button
                  onClick={() => setActiveTab('live')}
                  className="mt-6 px-5 py-2 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold transition-all shadow-lg cursor-pointer"
                >
                  Return to Live Streams
                </button>
              </div>
            ) : (
              /* Active Stream Video Frame */
              <div
                className={`relative flex flex-col justify-between overflow-hidden items-center bg-black transition-all ${
                  isPortraitMode
                    ? 'w-full max-w-[430px] aspect-[9/16] rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.9)] my-auto h-full max-h-full'
                    : 'w-full h-full max-h-[calc(100vh-8.5rem)] aspect-video rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] my-auto'
                }`}
              >
                <LiveStreamCanvas
                  compositeStream={remoteStream}
                  snapshotUrl={snapshotUrl}
                  layoutMode="custom"
                  cameraEnabled={true}
                  cameraSource="webcam"
                  showOverlays={true}
                  showHostTag={false}
                  canvasAspectRatio={effectiveAspectRatio}
                  isMobileStream={isPortraitMode}
                  onDetectedAspectRatio={ratio => {
                    if (!manualLayoutOverride) setStreamAspectRatio(ratio);
                  }}
                  showMusicBanner={false}
                  showGoalBar={false}
                  hostName={hostUser.displayName || 'Host'}
                  timerText={
                    connectionStatus === 'connected' || connectionStatus === 'streaming'
                      ? 'LIVE'
                      : connectionStatus === 'connecting'
                      ? 'CONNECTING...'
                      : 'OFFLINE'
                  }
                  isLive={!isLiveEnded}
                />

                {/* Host Follow & Report Overlay Bar (Unified Streamer Pill) */}
                <div className="absolute top-3 sm:top-4 left-3 sm:left-4 z-40 flex items-center gap-1.5 sm:gap-2 pointer-events-auto max-w-[calc(100vw-110px)] sm:max-w-none">
                  <div className="flex items-center gap-2 bg-black/65 backdrop-blur-md p-1 pl-1.5 pr-2.5 rounded-full border border-white/15 shadow-xl min-w-0">
                    {/* Host Avatar */}
                    <div className="relative shrink-0">
                      <Avatar
                        src={hostUser.avatar}
                        alt={hostUser.displayName || 'Host'}
                        size="sm"
                        className="w-7 h-7 ring-1.5 ring-[#ff007a]"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full ring-1 ring-black animate-pulse" />
                    </div>

                    {/* Host Name & Live Status */}
                    <div className="flex flex-col text-left min-w-0 pr-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-white truncate max-w-[80px] sm:max-w-[140px] leading-tight">
                          {hostUser.displayName || 'Host'}
                        </span>
                        <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold text-white bg-[#ff007a] px-1.5 py-0.5 rounded-full leading-none">
                          <span className="w-1 h-1 rounded-full bg-white animate-ping" />
                          Live
                        </span>
                      </div>
                    </div>

                    {/* +Follow / Following Button */}
                    <button
                      type="button"
                      onClick={() => toggleFollowUser(hostUser.id)}
                      className={`shrink-0 py-1 px-2.5 sm:px-3 rounded-full text-[11px] font-bold transition-all cursor-pointer shadow-md flex items-center gap-1 leading-none ${
                        isFollowingHost
                          ? 'bg-neutral-800 text-neutral-300 border border-neutral-600 hover:bg-neutral-700'
                          : 'bg-[#ff007a] hover:bg-[#ff1a8c] text-white active:scale-95'
                      }`}
                    >
                      {isFollowingHost ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3 h-3" />
                          <span>+Follow</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Share Stream Button */}
                  <button
                    type="button"
                    onClick={() => setShareLiveModalOpen(true)}
                    className="p-1.5 sm:p-2 rounded-full bg-black/60 backdrop-blur-md text-white/80 hover:text-pink-400 border border-white/10 transition-colors cursor-pointer shrink-0 shadow-md"
                    title="Share Stream"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Report Stream Button */}
                  <button
                    type="button"
                    onClick={() =>
                      openReportModal({
                        type: 'live_stream',
                        targetId: currentLiveStream.id,
                        targetName: `${hostUser.displayName || hostUser.username}'s Live Stream`,
                        targetSubtitle: currentLiveStream.title,
                      })
                    }
                    className="p-1.5 sm:p-2 rounded-full bg-black/60 backdrop-blur-md text-white/80 hover:text-red-400 border border-white/10 transition-colors cursor-pointer shrink-0 shadow-md"
                    title="Report Stream"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Mobile Viewers & Likes Badge (Top Right) */}
                <div className="lg:hidden absolute top-3 right-3 z-40 flex items-center gap-1.5">
                  <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-pink-500/30 text-white text-[11px] font-bold shadow-md">
                    <Heart className="w-3 h-3 text-[#ff007a] fill-[#ff007a]" />
                    <span>{currentLiveStream.likesCount || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-white text-[11px] font-bold shadow-md">
                    <Radio className="w-3 h-3 text-[#ff007a] animate-pulse" />
                    <span>{Math.max(currentLiveStream.viewers?.length || 0, currentLiveStream.viewersCount || 0, 1)}</span>
                  </div>
                </div>

                {/* Floating hearts container on like (Vibrantly floats up and vanishes after 2s) */}
                <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 pointer-events-none z-40 overflow-visible">
                  {likeFloatingHearts.map(heart => (
                    <div
                      key={heart.id}
                      className="absolute bottom-0 right-0 animate-float-heart text-[#ff007a]"
                      style={{
                        transform: `translateX(${heart.xOffset}px) rotate(${heart.rotate}deg) scale(${heart.scale})`,
                      }}
                    >
                      <Heart className="w-8 h-8 sm:w-9 sm:h-9 fill-[#ff007a] drop-shadow-[0_2px_8px_rgba(255,0,122,0.6)]" />
                    </div>
                  ))}
                </div>

                {/* Desktop Quick like button with Like Counter */}
                <div className="hidden lg:block absolute right-4 bottom-4 z-40">
                  <button
                    onClick={handleFloatHeart}
                    className="relative p-3 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer group flex items-center justify-center"
                    title="Send Love"
                  >
                    <Heart className="w-5 h-5 fill-white" />
                    <span className="absolute -top-2 -left-2 bg-neutral-900/90 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full border border-pink-500/40 shadow-md">
                      {currentLiveStream.likesCount || 0}
                    </span>
                  </button>
                </div>

                {/* MOBILE VIEW (Only when in mobile portrait mode): Comments Stream Over Live Video */}
                {isPortraitMode && (
                  <>
                    <div className="lg:hidden absolute left-3 right-3 bottom-14 z-30 max-h-48 overflow-y-auto space-y-1.5 pr-1 pointer-events-auto flex flex-col justify-end text-left">
                      {currentLiveStream.messages
                        .filter(m => !m.isJoinEvent && !m.isHostOnlyWarning)
                        .slice(-10)
                        .map(msg => {
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
                                    liked the stream
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={msg.id}
                                className="bg-black/40 backdrop-blur-xs text-[11px] text-amber-300 font-medium px-2.5 py-0.5 rounded-xl w-fit max-w-[90%] shadow-sm"
                              >
                                <span className="font-bold">@{msg.username || msg.displayName} </span>
                                <span className="italic">{msg.text}</span>
                              </div>
                            );
                          }

                          const author = users.find(u => isSameUser(u.id, msg.userId));
                          const authorName = (msg.displayName && msg.displayName !== 'Viewer') ? msg.displayName : (author?.displayName || author?.username || 'User');
                          const authorAvatar = msg.avatar || author?.avatar || '';

                          return (
                            <div
                              key={msg.id}
                              className="group bg-black/60 backdrop-blur-md text-white rounded-2xl px-2.5 py-1.5 border border-white/10 flex items-start gap-2 max-w-[90%] shadow-md"
                            >
                              <Avatar
                                src={authorAvatar}
                                alt={authorName}
                                size="xs"
                                className="mt-0.5 shrink-0"
                              />
                              <div className="min-w-0 flex-1 text-left">
                                <span className="text-[11px] font-bold text-[#ff007a] drop-shadow-sm mr-1">
                                  {authorName}
                                </span>
                                <span className="text-xs text-white drop-shadow-sm break-words">
                                  {msg.text}
                                </span>
                              </div>
                              {isHost && (
                                <button
                                  type="button"
                                  onClick={() => deleteLiveComment(msg.id)}
                                  className="p-1 text-neutral-400 hover:text-red-400 rounded hover:bg-red-500/20 transition-all cursor-pointer shrink-0 ml-1"
                                  title="Remove comment"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    <div className="lg:hidden absolute bottom-2.5 left-2.5 right-2.5 z-40 flex items-center gap-2">
                      <form onSubmit={handleSendChat} className="flex-1 flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-3.5 py-1.5 border border-white/20 focus-within:border-[#ff007a] shadow-lg">
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
                          className="text-[#ff007a] hover:text-[#ff3399] disabled:opacity-30 p-1 transition-colors cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => setShareLiveModalOpen(true)}
                        className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white hover:text-pink-400 border border-white/10 shadow-lg active:scale-90 transition-transform shrink-0 cursor-pointer"
                        title="Share Stream in Message"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={handleFloatHeart}
                        className="relative p-2 rounded-full bg-[#ff007a] hover:bg-[#ff1a8c] text-white shadow-lg active:scale-90 transition-all shrink-0 cursor-pointer flex items-center justify-center"
                        title="Send Love"
                      >
                        <Heart className="w-4 h-4 fill-white" />
                        <span className="absolute -top-1.5 -left-1.5 bg-neutral-900/90 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full border border-pink-500/40 shadow-sm">
                          {currentLiveStream.likesCount || 0}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Chat Panel: Desktop Only (Always clean on desktop) */}
          <div className="hidden lg:flex w-80 lg:w-88 xl:w-96 shrink-0 bg-[#13131a] rounded-3xl border border-neutral-800 p-4 flex-col justify-between shadow-xl">
            {/* Chat Header with Viewers and Likes */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#ff007a] animate-pulse" />
                <span className="text-sm font-bold text-white font-brand">
                  {Math.max(currentLiveStream.viewers?.length || 0, currentLiveStream.viewersCount || 0, 1)} Viewers
                </span>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-500/15 border border-pink-500/30 text-white text-xs font-bold shadow-sm">
                  <Heart className="w-3.5 h-3.5 text-[#ff007a] fill-[#ff007a]" />
                  <span>{currentLiveStream.likesCount || 0}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShareLiveModalOpen(true)}
                  className="text-neutral-400 hover:text-pink-400 p-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Share Stream"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openReportModal({
                      type: 'live_stream',
                      targetId: currentLiveStream.id,
                      targetName: `${hostUser.displayName || hostUser.username}'s Live Stream`,
                      targetSubtitle: currentLiveStream.title,
                    })
                  }
                  className="text-neutral-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Report Stream"
                >
                  <Flag className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveTab('live')}
                  className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Exit Stream"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat Comments & Event Feed */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 text-left text-xs">
              {currentLiveStream.messages
                .filter(m => !m.isJoinEvent && !m.isHostOnlyWarning)
                .map(msg => {
                  if (msg.isSystemEvent) {
                    if (msg.isLikeEvent) {
                      return (
                        <div
                          key={msg.id}
                          className="py-1 px-3 rounded-full bg-pink-500/10 border border-pink-500/30 text-[#ff007a] text-[11px] font-semibold flex items-center gap-1.5 shadow-sm w-fit"
                        >
                          <Heart className="w-3.5 h-3.5 text-[#ff007a] fill-[#ff007a] shrink-0" />
                          <span className="truncate">
                            <span className="font-bold text-white">@{msg.username || msg.displayName} </span>
                            liked the stream
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className="text-[11px] text-neutral-400 py-0.5">
                        <span className="font-bold text-neutral-200">@{msg.username || msg.displayName} </span>
                        <span className="italic">{msg.text}</span>
                      </div>
                    );
                  }

                  const author = users.find(u => isSameUser(u.id, msg.userId));
                  const authorName = (msg.displayName && msg.displayName !== 'Viewer') ? msg.displayName : (author?.displayName || author?.username || 'User');
                  const authorAvatar = msg.avatar || author?.avatar || '';

                  return (
                    <div key={msg.id} className="group flex items-start gap-2.5 relative">
                      <Avatar
                        src={authorAvatar}
                        alt={authorName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-white text-[11px] truncate">{authorName}</div>
                          {isHost && (
                            <button
                              type="button"
                              onClick={() => deleteLiveComment(msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-red-400 rounded hover:bg-red-500/10 transition-all cursor-pointer ml-1"
                              title="Delete comment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="text-neutral-300 text-xs mt-0.5 break-words">{msg.text}</div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleSendChat} className="pt-2 border-t border-neutral-800">
              <div className="flex items-center gap-2 bg-[#181824] rounded-2xl px-3.5 py-2 border border-neutral-700 focus-within:border-[#ff007a] transition-all">
                <input
                  type="text"
                  placeholder="Type chat message"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="text-[#ff007a] hover:text-[#ff3399] disabled:opacity-30 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Share Live Stream Modal */}
      <ShareLiveModal
        stream={currentLiveStream}
        isOpen={shareLiveModalOpen}
        onClose={() => setShareLiveModalOpen(false)}
      />
    </div>
  );
};
