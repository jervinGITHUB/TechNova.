import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { Radio, Users, Sparkles, RefreshCw, X, Plus } from 'lucide-react';
import { liveBroadcastService } from '../../services/liveBroadcastService';
import { supabaseDb, toUuid, isSameUser } from '../../lib/supabase';

export const LiveBrowse: React.FC = () => {
  const {
    setActiveTab,
    openLiveStreamAsViewer,
    currentLiveStream,
    activeLiveStreams,
    refreshActiveLiveStreams,
    removeActiveLiveStream,
    currentUser,
  } = useApp();

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    refreshActiveLiveStreams();

    // Gentle 12s interval while browsing to ensure cross-device consistency with minimal disk IO
    const interval = setInterval(() => {
      refreshActiveLiveStreams();
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  const streams = (() => {
    const list = [...activeLiveStreams];
    const isActuallyBroadcasting = liveBroadcastService.getState().isBroadcasting;
    // ONLY include currentLiveStream if this device is ACTUALLY broadcasting video
    if (isActuallyBroadcasting && currentLiveStream && currentLiveStream.isLive && currentLiveStream.id) {
      if (!list.some(s => s.id === currentLiveStream.id || toUuid(s.id) === toUuid(currentLiveStream.id))) {
        list.unshift(currentLiveStream);
      }
    }
    return list;
  })();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshActiveLiveStreams();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDismissStream = (e: React.MouseEvent, streamId: string) => {
    e.stopPropagation();
    supabaseDb.endLiveStream(streamId);
    removeActiveLiveStream(streamId);
  };

  return (
    <div className="flex-1 p-4 sm:p-8 max-w-6xl mx-auto w-full text-left">
      {/* Top Banner with "GO LIVE NOW!" button & Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold font-brand text-white flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-[#ff007a] animate-pulse" />
            <span>Live Streams</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Join real-time interactive streams or start your own broadcast studio
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh Streams Button */}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 py-3 px-4 rounded-2xl bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white font-semibold text-xs border border-neutral-700 transition-all cursor-pointer shadow-md"
            title="Refresh Live Streams"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#ff007a]' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Hot Pink "GO LIVE NOW!" Button */}
          <button
            onClick={() => setActiveTab('live_host_setup')}
            className="flex items-center gap-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-extrabold text-sm shadow-[0_0_20px_rgba(255,0,122,0.5)] transition-all cursor-pointer transform hover:scale-105 active:scale-95"
          >
            <Sparkles className="w-4 h-4 fill-white" />
            <span>GO LIVE NOW!</span>
          </button>
        </div>
      </div>

      {/* Featured Stream Cards or Clean Layout Frame */}
      {streams.length > 0 ? (
        <div className="space-y-6">
          {streams.map(stream => {
            const isMyStream = Boolean(
              currentUser && (isSameUser(stream.host.id, currentUser.id) || stream.host.id === currentUser.id)
            );

            return (
              <div
                key={stream.id}
                onClick={() => openLiveStreamAsViewer(stream.id)}
                className="group relative bg-[#13131a] rounded-3xl overflow-hidden border border-neutral-800 hover:border-[#ff007a]/60 shadow-xl transition-all cursor-pointer aspect-[21/9] sm:aspect-[24/9]"
              >
                <div className="w-full h-full bg-[#161624] flex items-center justify-center">
                  <Radio className="w-12 h-12 text-[#ff007a] animate-pulse" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />

                {/* Top-Left Red Live Badge */}
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff007a] text-white text-xs font-bold shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>Live</span>
                </div>

                {/* Top-Right: Viewers Counter & Dismiss/End Stream Action */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-white text-xs font-medium">
                    <Users className="w-3.5 h-3.5 text-[#ff007a]" />
                    <span>{stream.viewersCount || 1} watching</span>
                  </div>

                  {/* End/Dismiss button for stale/abandoned streams */}
                  <button
                    onClick={(e) => handleDismissStream(e, stream.id)}
                    className="p-1 rounded-full bg-black/50 hover:bg-red-500 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title={isMyStream ? "End my live stream" : "Remove inactive stream"}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Bottom Stream Details */}
                <div className="absolute bottom-4 left-4 right-4 text-left flex items-center justify-between">
                  <div>
                    <h3 className="text-base sm:text-xl font-bold text-white group-hover:text-[#ff007a] transition-colors drop-shadow-md">
                      {stream.title || 'Live Stream'}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Avatar
                        src={stream.host.avatar}
                        alt={stream.host.displayName || 'Host'}
                        size="xs"
                      />
                      <span className="text-xs text-neutral-200 font-medium">
                        {stream.host.displayName || 'Host'}
                      </span>
                      {stream.host.username && (
                        <span className="text-xs text-neutral-400 font-normal">
                          @{stream.host.username}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isMyStream && (
                      <button
                        onClick={(e) => handleDismissStream(e, stream.id)}
                        className="text-xs font-bold text-red-300 bg-red-500/20 hover:bg-red-600 hover:text-white border border-red-500/30 px-3 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        End My Stream
                      </button>
                    )}
                    <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-[#ff007a] bg-pink-500/10 border border-[#ff007a]/30 px-4 py-2 rounded-xl group-hover:bg-[#ff007a] group-hover:text-white transition-all">
                      <span>Join Stream</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Wireframe Stream Card Layout Frame (Preserves exact layout design with zero sample data) */
        <div className="space-y-6">
          <div
            onClick={() => setActiveTab('live_host_setup')}
            className="group relative bg-gradient-to-r from-[#14141d] to-[#101016] rounded-3xl overflow-hidden border-2 border-dashed border-neutral-700/80 hover:border-[#ff007a] p-8 shadow-xl transition-all cursor-pointer flex flex-col items-center justify-center text-center aspect-[21/9] sm:aspect-[24/9]"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#1c1c28] border border-neutral-700 flex items-center justify-center text-neutral-400 group-hover:text-[#ff007a] transition-colors mb-3">
              <Radio className="w-7 h-7" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white mb-1 font-brand">
              No Live Streams Active
            </h3>
            <p className="text-xs text-neutral-400 max-w-sm mb-4">
              Be the first creator to launch a live broadcasting session with webcam, audio meters, and live chat.
            </p>
            <span className="inline-flex items-center gap-1.5 py-2 px-5 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white text-xs font-bold shadow-lg transition-all">
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Start Broadcasting</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
