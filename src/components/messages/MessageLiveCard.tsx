import React from 'react';
import { LiveStream } from '../../types';
import { Avatar } from '../common/Avatar';
import { useApp } from '../../context/AppContext';
import { Radio, Users, Play, Trash2, ArrowRight } from 'lucide-react';

interface MessageLiveCardProps {
  stream: LiveStream;
  note?: string;
  isMe: boolean;
  messageId?: string;
  conversationId?: string;
  onDeleteMessage?: () => void;
}

export const MessageLiveCard: React.FC<MessageLiveCardProps> = ({
  stream,
  note,
  isMe,
  onDeleteMessage,
}) => {
  const { openLiveStreamAsViewer, users } = useApp();

  const hostUser =
    users.find(u => u.id === stream.host?.id || u.username === stream.host?.username) ||
    stream.host;

  const handleJoinLive = (e: React.MouseEvent) => {
    e.stopPropagation();
    openLiveStreamAsViewer(stream.id, stream);
  };

  return (
    <div
      onClick={handleJoinLive}
      className={`group/live relative overflow-hidden rounded-2xl border transition-all cursor-pointer text-left select-none ${
        isMe
          ? 'bg-gradient-to-br from-[#1a1426] via-[#161220] to-[#25102a] border-pink-500/30 hover:border-pink-500/60 shadow-lg shadow-pink-950/20'
          : 'bg-gradient-to-br from-[#14141e] via-[#12121c] to-[#1c1524] border-neutral-700/80 hover:border-[#ff007a]/50 shadow-xl'
      }`}
    >
      {/* Optional Note Display */}
      {note && (
        <div className="px-3.5 pt-2.5 pb-1 text-xs text-neutral-200 font-medium">
          {note}
        </div>
      )}

      {/* Main Live Card Content */}
      <div className="p-3.5 space-y-3">
        {/* Top Rail: Live Badge + Viewers Count */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold tracking-wider animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>LIVE NOW</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-semibold text-pink-300/90">
            <Users className="w-3 h-3 text-[#ff007a]" />
            <span>{Math.max(stream.viewers?.length || 0, stream.viewersCount || 0, 1)} watching</span>
          </div>
        </div>

        {/* Host Identity Row */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar
              src={hostUser?.avatar}
              alt={hostUser?.displayName || 'Host'}
              size="md"
              className="border-2 border-[#ff007a] shadow-md"
            />
            <span className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-red-600 border border-black flex items-center justify-center">
              <Radio className="w-2.5 h-2.5 text-white" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
              <span>{hostUser?.displayName || hostUser?.username || 'Host'}</span>
            </div>
            <div className="text-[11px] text-neutral-400 truncate">
              @{hostUser?.username || 'host'}
            </div>
          </div>
        </div>

        {/* Stream Title & Topic */}
        <div className="space-y-1 bg-black/30 p-2.5 rounded-xl border border-white/5">
          <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug font-brand group-hover/live:text-pink-300 transition-colors">
            {stream.title || 'Live Stream Broadcast'}
          </h4>
          {stream.topic && (
            <div className="text-[10px] text-pink-400 font-semibold tracking-wide">
              #{stream.topic}
            </div>
          )}
        </div>

        {/* Action Button: Join Live Stream */}
        <button
          type="button"
          onClick={handleJoinLive}
          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#ff3399] hover:from-[#ff1a8c] hover:to-[#ff4da6] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-[#ff007a]/25 transition-all group-hover/live:scale-[1.02] cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>Watch Live Stream</span>
          <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-80" />
        </button>
      </div>
    </div>
  );
};
