import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { LiveStreamCanvas } from './LiveStreamCanvas';
import { Avatar } from '../common/Avatar';
import { createLiveViewerSession } from '../../services/liveBroadcastService';
import { supabaseDb, isSameUser } from '../../lib/supabase';
import {
  Send,
  X,
  Radio,
  UserPlus,
  Check,
  Flag,
  Heart,
  RotateCcw
} from 'lucide-react';

export const LiveStreamViewer: React.FC = () => {
  const {
    currentLiveStream,
    sendLiveComment,
    sendLiveLike,
    liveHeartTrigger,
    removeActiveLiveStream,
    toggleFollowUser,
    users,
    setActiveTab,
    openReportModal,
  } = useApp();

  const [chatInput, setChatInput] = useState('');
  const [isLiveEnded, setIsLiveEnded] = useState(false);
  const [likeFloatingHearts, setLikeFloatingHearts] = useState<number[]>([]);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const [sessionKey, setSessionKey] = useState<number>(0);

  const hostUser = users.find(u => u.id === currentLiveStream.host.id) || currentLiveStream.host;
  const isFollowingHost = !!hostUser.isFollowing;
  const [streamAspectRatio, setStreamAspectRatio] = useState<'9:16' | '16:9'>('9:16');

  useEffect(() => {
    if (!currentLiveStream.id) return;
    let hasReceivedSignalOrStream = false;

    const cleanup = createLiveViewerSession(currentLiveStream.id, {
      onRemoteStream: stream => {
        hasReceivedSignalOrStream = true;
        setRemoteStream(stream);
        setConnectionStatus('connected');
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
    // If after 10 seconds, no stream or snapshot has arrived from host, indicate waiting status to viewer
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

  // Real-time floating hearts on likes from any user
  useEffect(() => {
    if (liveHeartTrigger > 0) {
      setLikeFloatingHearts(prev => [...prev, liveHeartTrigger]);
      const timer = setTimeout(() => {
        setLikeFloatingHearts(prev => prev.slice(1));
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [liveHeartTrigger]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendLiveComment(chatInput.trim());
    setChatInput('');
  };

  const handleFloatHeart = () => {
    sendLiveLike();
  };

  return (
    <div className="flex-1 p-2 sm:p-4 lg:p-6 max-w-7xl mx-auto w-full h-[calc(100vh-4rem)] flex flex-col select-none">
      {/* Top action row */}
      <div className="flex items-center justify-between pb-2 sm:pb-3">
        <button
          onClick={() => setActiveTab('live')}
          className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>Exit Stream</span>
        </button>

        <div className="flex items-center gap-2">
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

          {/* Demo state toggler for "Live Ended" matching Screenshot 2 bottom right */}
          <button
            onClick={() => setIsLiveEnded(!isLiveEnded)}
            className="text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Toggle State: {isLiveEnded ? 'View Live Ended (Active)' : 'View Active Stream'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
        {/* Left Video Container: Fills full height on mobile with transparent overlay comments */}
        <div className="flex-1 bg-black rounded-2xl sm:rounded-3xl overflow-hidden border border-neutral-800 relative flex flex-col justify-between shadow-2xl min-h-0">
          {isLiveEnded ? (
            /* Screenshot 2 bottom right: "Live Ended" POV of Viewer */
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
            /* Active Live Stream Video Display: Split Camera & Game Canvas */
            <div className="relative w-full h-full flex flex-col justify-between overflow-hidden items-center bg-black">
              <LiveStreamCanvas
                compositeStream={remoteStream}
                snapshotUrl={snapshotUrl}
                layoutMode="custom"
                cameraEnabled={true}
                cameraSource="webcam"
                showOverlays={true}
                showHostTag={false}
                canvasAspectRatio={streamAspectRatio}
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

              {/* Host Follow & Report Overlay Bar (Unified TikTok-style Streamer Pill) */}
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

                  {/* +Follow / Following Button cleanly inside the pill */}
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

                {/* Report Stream Button */}
                <button
                  type="button"
                  onClick={() =>
                    openReportModal({
                      type: 'video',
                      targetId: currentLiveStream.id,
                      targetName: `${hostUser.displayName}'s Live Stream`,
                      targetSubtitle: currentLiveStream.title,
                    })
                  }
                  className="p-1.5 sm:p-2 rounded-full bg-black/60 backdrop-blur-md text-white/80 hover:text-red-400 border border-white/10 transition-colors cursor-pointer shrink-0 shadow-md"
                  title="Report Stream"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mobile Viewers Badge (Top Right) */}
              <div className="lg:hidden absolute top-3 right-3 z-40 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-white text-[11px] font-bold shadow-md">
                <Radio className="w-3 h-3 text-[#ff007a] animate-pulse" />
                <span>{currentLiveStream.viewersCount}</span>
              </div>

              {/* Floating hearts container on like */}
              <div className="absolute right-4 sm:right-6 bottom-16 sm:bottom-20 pointer-events-none z-30">
                {likeFloatingHearts.map(id => (
                  <div
                    key={id}
                    className="absolute bottom-0 right-0 animate-bounce text-[#ff007a]"
                  >
                    <Heart className="w-7 h-7 sm:w-8 sm:h-8 fill-[#ff007a]" />
                  </div>
                ))}
              </div>

              {/* Desktop Quick like button (hidden on mobile since mobile has it in bottom bar) */}
              <div className="hidden lg:block absolute right-4 bottom-4 z-40">
                <button
                  onClick={handleFloatHeart}
                  className="p-3 rounded-full bg-[#ff007a] text-white shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer"
                  title="Send Love"
                >
                  <Heart className="w-5 h-5 fill-white" />
                </button>
              </div>

              {/* ========================================================================= */}
              {/* MOBILE VIEW: Transparent Background Comments Stream Over Live Video       */}
              {/* "if the user joined in live , the user can see the comments on the live   */}
              {/*  and has transparent background so the user can view/watch the live       */}
              {/*  while viewing the comments and can send a comment."                      */}
              {/* ========================================================================= */}
              <div className="lg:hidden absolute left-3 right-3 bottom-14 z-30 max-h-48 overflow-y-auto space-y-1.5 pr-1 pointer-events-auto flex flex-col justify-end text-left">
                {currentLiveStream.messages.slice(-8).map(msg => {
                  if (msg.isSystemEvent) {
                    return (
                      <div
                        key={msg.id}
                        className="bg-black/40 backdrop-blur-xs text-[11px] text-amber-300 font-medium px-2.5 py-0.5 rounded-xl w-fit max-w-[90%] shadow-sm"
                      >
                        <span className="font-bold">{msg.displayName} </span>
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
                      className="bg-black/45 backdrop-blur-md text-white rounded-2xl px-3 py-1 border border-white/10 flex items-start gap-2 max-w-[85%] shadow-md"
                    >
                      <Avatar
                        src={authorAvatar}
                        alt={authorName}
                        size="xs"
                        className="mt-0.5"
                      />
                      <div className="min-w-0 text-left">
                        <span className="text-[11px] font-bold text-[#ff007a] drop-shadow-sm mr-1">
                          {authorName}
                        </span>
                        <span className="text-xs text-white drop-shadow-sm">
                          {msg.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* MOBILE VIEW: Bottom Semi-Transparent Floating Comment Input & Like Bar */}
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

                {/* Floating Love Heart Button on Mobile */}
                <button
                  type="button"
                  onClick={handleFloatHeart}
                  className="p-2 rounded-full bg-[#ff007a] text-white shadow-lg active:scale-90 transition-transform shrink-0 cursor-pointer"
                  title="Send Love"
                >
                  <Heart className="w-4 h-4 fill-white" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Chat Panel: Desktop Only (Screenshot 2 top right) */}
        <div className="hidden lg:flex w-80 shrink-0 bg-[#13131a] rounded-3xl border border-neutral-800 p-4 flex-col justify-between shadow-xl">
          {/* Chat Header: Viewers 67 + Close */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#ff007a] animate-pulse" />
              <span className="text-sm font-bold text-white font-brand">
                Viewers {currentLiveStream.viewersCount}
              </span>
            </div>
            <button
              onClick={() => setActiveTab('live')}
              className="text-neutral-400 hover:text-white p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chat Comments & Event Feed matching Screenshot */}
          <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1 text-left text-xs">
            {currentLiveStream.messages.map(msg => {
              if (msg.isSystemEvent) {
                return (
                  <div key={msg.id} className="text-[11px] text-neutral-400 py-0.5">
                    <span className="font-bold text-neutral-200">{msg.displayName} </span>
                    <span className="italic">{msg.text}</span>
                  </div>
                );
              }

              const author = users.find(u => isSameUser(u.id, msg.userId));
              const authorName = (msg.displayName && msg.displayName !== 'Viewer') ? msg.displayName : (author?.displayName || author?.username || 'User');
              const authorAvatar = msg.avatar || author?.avatar || '';

              return (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <Avatar
                    src={authorAvatar}
                    alt={authorName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px]">{authorName}</div>
                    <div className="text-neutral-300 text-xs mt-0.5">{msg.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chat Input Form matching Screenshot: "Type chat message" + pink send button */}
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
    </div>
  );
};
