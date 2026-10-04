import React, { useState, useMemo } from 'react';
import { useApp, deduplicateConversations, getConversationClearedTimestamp } from '../../context/AppContext';
import { Conversation, User, MessageReplyInfo, Message, Video } from '../../types';
import { Avatar } from '../common/Avatar';
import { MessageVideoCard } from './MessageVideoCard';
import { toUuid, isSameUser, checkIsUserBanned } from '../../lib/supabase';
import {
  Search,
  Send,
  CheckCheck,
  MoreVertical,
  Flag,
  User as UserIcon,
  ArrowLeft,
  Ban,
  Trash2,
  CornerUpLeft,
  X,
  MessageSquare,
  Plus,
  Lock
} from 'lucide-react';

const resolveSharedVideo = (
  msg: Message,
  allVideos: Video[]
): { isVideo: boolean; video?: Video; note?: string } => {
  if (msg.sharedVideo) {
    return { isVideo: true, video: msg.sharedVideo, note: msg.text };
  }

  // Check marker: [VIDEO_SHARE:<id>] note
  const markerMatch = (msg.text || '').match(/\[VIDEO_SHARE:([^\]]+)\](?:\s*([\s\S]*))?/);
  if (markerMatch) {
    const videoId = markerMatch[1].trim();
    const note = markerMatch[2]?.trim() || '';
    const found = allVideos.find(v => v.id === videoId || toUuid(v.id) === toUuid(videoId));
    if (found) {
      return { isVideo: true, video: found, note };
    }
  }

  // Check for video link /video/<id> (e.g. from user screenshot or shared links)
  const urlMatch = (msg.text || '').match(/(?:https?:\/\/[^\s]+)?\/video\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    const videoId = urlMatch[1];
    let found = allVideos.find(v => v.id === videoId || toUuid(v.id) === toUuid(videoId));

    // Extract any personal note prepended or appended
    let note = msg.text
      .replace(/https?:\/\/[^\s]*\/video\/[a-zA-Z0-9_-]+/gi, '')
      .replace(/🎥\s*(?:Check out this video by|Video by)[^\n]*\n?/gi, '')
      .trim();

    if (!found) {
      // Extract creator username and caption from message text if available (like in user screenshot)
      const creatorMatch = msg.text.match(/by\s+@([a-zA-Z0-9_.-]+):?\s*"([^"]*)"/i);
      const extractedUsername = creatorMatch ? creatorMatch[1] : 'creator';
      const extractedCaption = creatorMatch ? creatorMatch[2] : 'Shared video';

      found = {
        id: videoId,
        creatorId: videoId,
        creator: {
          id: videoId,
          username: extractedUsername,
          displayName: extractedUsername,
          email: '',
          avatar: '',
          bio: '',
          followingCount: 0,
          followersCount: 0,
          likesCount: '0',
          isPrivate: false,
          role: 'creator',
        },
        caption: extractedCaption,
        hashtags: ['#viral', '#fyp'],
        mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        likesCount: 1,
        commentsCount: 0,
        sharesCount: 1,
        createdAt: new Date().toISOString(),
      };
    }

    return { isVideo: true, video: found, note };
  }

  return { isVideo: false };
};

export const MessagesView: React.FC = () => {
  const {
    currentUser,
    users,
    videos,
    conversations,
    activeConversationId,
    openConversation,
    openConversationWithUser,
    sendMessage,
    deleteConversation,
    deleteMessage,
    messagesMobileView,
    setMessagesMobileView,
    navigateToUserProfile,
    openReportModal,
    canMessageUser,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<MessageReplyInfo | null>(null);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);

  // Filter and deduplicate conversations specifically for currentUser
  const accountConversations = useMemo(() => {
    if (!currentUser) return [];
    const valid = conversations.filter(conv => {
      const isPart = conv.participantIds && conv.participantIds.length > 0
        ? conv.participantIds.some(id => isSameUser(id, currentUser.id))
        : conv.participant && !isSameUser(conv.participant.id, currentUser.id);
      if (!isPart) return false;

      // Check if user previously marked this conversation as deleted
      const isMarkedDeleted = conv.deletedForUserIds && conv.deletedForUserIds.some(id => isSameUser(id, currentUser.id));
      if (isMarkedDeleted) {
        // If there are new visible messages sent after clear timestamp, automatically unhide!
        const convClearTime = Math.max(
          getConversationClearedTimestamp(conv.id, currentUser.id),
          conv.clearedHistoryAt?.[currentUser.id] || 0,
          conv.clearedHistoryAt?.[toUuid(currentUser.id)] || 0
        );

        const hasNewVisibleMsg = (conv.messages || []).some(m => {
          if (m.deletedForUserIds?.some(id => isSameUser(id, currentUser.id))) return false;
          if (convClearTime > 0) {
            const sentTime = m.sentAt ? new Date(m.sentAt).getTime() : 0;
            if (sentTime > 0 && sentTime <= convClearTime) return false;
            if (typeof m.id === 'string' && m.id.startsWith('m_')) {
              const parts = m.id.split('_');
              const t = parseInt(parts[1], 10);
              if (t > 0 && t <= convClearTime) return false;
            }
          }
          return true;
        });

        if (!hasNewVisibleMsg) {
          return false;
        }
      }

      return true;
    });

    return deduplicateConversations(valid, currentUser.id);
  }, [conversations, currentUser]);

  // Determine the other participant in a conversation based on currentUser
  const getParticipant = (conv: Conversation): User => {
    if (conv.participantIds && conv.participantIds.length > 0 && currentUser) {
      const otherId = conv.participantIds.find(id => !isSameUser(id, currentUser.id));
      if (otherId) {
        const found = users.find(u => isSameUser(u.id, otherId));
        if (found) return found;
      }
    }
    if (conv.participant) {
      const found = users.find(u => isSameUser(u.id, conv.participant.id));
      if (found) return found;
      return conv.participant;
    }
    return {
      id: 'unknown',
      username: 'user',
      displayName: 'User',
      email: '',
      avatar: '',
      bio: '',
      followingCount: 0,
      followersCount: 0,
      likesCount: '0',
      isPrivate: false,
      role: 'creator',
    };
  };

  // Determine unread count for current user
  const getUnreadCount = (conv: Conversation): number => {
    if (!currentUser) return conv.unreadCount || 0;
    if (conv.unreadCounts && typeof conv.unreadCounts[currentUser.id] === 'number') {
      return conv.unreadCounts[currentUser.id];
    }
    return conv.unreadCount || 0;
  };

  const activeConv = useMemo(() => {
    if (!accountConversations.length) return null;
    if (activeConversationId) {
      const found = accountConversations.find(
        c => c.id === activeConversationId || toUuid(c.id) === toUuid(activeConversationId)
      );
      if (found) return found;
    }
    return accountConversations[0] || null;
  }, [accountConversations, activeConversationId]);

  const activeParticipant = activeConv ? getParticipant(activeConv) : null;

  const filteredConversations = accountConversations.filter(conv => {
    const p = getParticipant(conv);
    return (
      (p.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (conv.lastMessage || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConv) return;
    sendMessage(activeConv.id, inputText.trim(), replyingTo || undefined);
    setInputText('');
    setReplyingTo(null);
  };

  const handleSelectConversation = (convId: string) => {
    openConversation(convId);
    setMessagesMobileView('chat');
  };

  const handleDeleteConversation = () => {
    setMenuOpen(false);
    if (activeConv) {
      deleteConversation(activeConv.id);
      setToastMessage('Conversation deleted.');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  return (
    <div className="flex-1 p-2 sm:p-6 max-w-7xl mx-auto w-full h-[calc(100vh-4rem)] flex flex-col">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#1e1e2c] border border-neutral-700 text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Ban className="w-4 h-4 text-[#ff007a]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* New Chat Modal */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setNewChatModalOpen(false)} />
          <div className="relative w-full max-w-md bg-[#13131a] border border-neutral-800 rounded-3xl p-5 shadow-2xl z-10 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="font-bold text-white font-brand text-base">New Conversation</h3>
              <button
                onClick={() => setNewChatModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-neutral-400 mt-2 mb-4">
              Select a creator to start chatting with:
            </p>
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {users
                .filter(u => u.id !== currentUser?.id && !u.isBanned && !checkIsUserBanned(u.id, u.email, u).isBanned)
                .map(u => {
                  const allowed = canMessageUser(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        if (!allowed) {
                          setToastMessage(`🔒 @${u.username} is private. Only friends can exchange messages.`);
                          setTimeout(() => setToastMessage(''), 3500);
                          return;
                        }
                        setNewChatModalOpen(false);
                        openConversationWithUser(u.id);
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        allowed
                          ? 'bg-[#181824] hover:bg-[#20202e] border-neutral-800/80 cursor-pointer group'
                          : 'bg-[#181824]/50 border-neutral-800/40 cursor-not-allowed opacity-75'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          src={u.avatar}
                          alt={u.displayName || u.username}
                          size="md"
                          className="w-10 h-10 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-white group-hover:text-[#ff007a] transition-colors truncate flex items-center gap-1.5">
                            <span>{u.displayName}</span>
                            {u.isPrivate && <Lock className="w-3 h-3 text-amber-400" />}
                          </div>
                          <div className="text-[11px] text-neutral-400 truncate">
                            @{u.username} {u.isPrivate && '· Private'}
                          </div>
                        </div>
                      </div>
                      {allowed ? (
                        <span className="text-xs font-bold text-[#ff007a] bg-[#ff007a]/10 px-3 py-1 rounded-xl group-hover:bg-[#ff007a] group-hover:text-white transition-all">
                          Chat
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-neutral-400 bg-neutral-800/80 px-2.5 py-1 rounded-xl flex items-center gap-1">
                          <Lock className="w-3 h-3 text-neutral-500" />
                          <span>Friends Only</span>
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 min-h-0">
        {/* ========================================================================= */}
        {/* Left Column (4 cols on desktop): Conversations List                       */}
        {/* ========================================================================= */}
        <div
          className={`${
            messagesMobileView === 'chat' ? 'hidden md:flex' : 'flex'
          } md:col-span-4 bg-[#13131a] rounded-3xl border border-neutral-800 p-4 sm:p-5 flex-col shadow-xl min-h-0 w-full`}
        >
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold font-brand text-white text-left">
                  Messages
                </h2>
                <span className="text-xs text-neutral-400 font-medium">
                  {accountConversations.length} {accountConversations.length === 1 ? 'chat' : 'chats'}
                </span>
              </div>
              <button
                onClick={() => setNewChatModalOpen(true)}
                className="py-1.5 px-3 rounded-xl bg-[#ff007a]/15 hover:bg-[#ff007a]/25 text-[#ff007a] border border-[#ff007a]/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Start a new chat"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Chat</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mt-3 flex items-center">
              <div className="absolute left-3.5 text-neutral-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#181824] text-xs text-white placeholder-neutral-500 pl-9 pr-4 py-2.5 rounded-2xl border border-neutral-700/80 focus:border-[#ff007a] outline-none transition-all"
              />
            </div>
          </div>

          {/* Conversations Item List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-left">
            {filteredConversations.map(conv => {
              const participant = getParticipant(conv);
              const unread = getUnreadCount(conv);
              const isSelected = activeConv?.id === conv.id;

              const convClearTime = Math.max(
                getConversationClearedTimestamp(conv.id, currentUser?.id),
                conv.clearedHistoryAt?.[currentUser?.id || ''] || 0,
                conv.clearedHistoryAt?.[toUuid(currentUser?.id || '')] || 0
              );

              const convVisibleMsgs = (conv.messages || []).filter(m => {
                if (currentUser && m.deletedForUserIds?.some(id => isSameUser(id, currentUser.id))) return false;
                if (convClearTime > 0) {
                  if (m.sentAt && new Date(m.sentAt).getTime() <= convClearTime) return false;
                  if (typeof m.id === 'string' && m.id.startsWith('m_')) {
                    const parts = m.id.split('_');
                    const t = parseInt(parts[1], 10);
                    if (t > 0 && t <= convClearTime) return false;
                  }
                }
                return true;
              });

              const lastVisible = convVisibleMsgs[convVisibleMsgs.length - 1];
              const displayLastMessage = lastVisible
                ? (lastVisible.sharedVideo ? `🎥 Shared a video` : lastVisible.text)
                : 'Started a new conversation';
              const displayLastTime = lastVisible ? lastVisible.timestamp : conv.lastMessageTime;

              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group/conv flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#1e1e2c] border border-[#ff007a]/40 shadow-sm'
                      : 'hover:bg-[#181822]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <Avatar
                        src={participant.avatar}
                        alt={participant.displayName || participant.username}
                        size="md"
                        className="w-11 h-11 shrink-0"
                      />
                      {conv.isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#13131a]" />
                      )}
                    </div>

                    <div className="min-w-0 text-left flex-1">
                      <div className="text-xs sm:text-sm font-bold text-white truncate">
                        {participant.displayName}
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate mt-0.5">
                        {displayLastMessage}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Timestamp, Unread Badge, and Delete Conversation */}
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    <div className="text-[10px] text-neutral-500 font-medium">
                      {displayLastTime}
                    </div>

                    <div className="mt-1 flex items-center gap-1.5">
                      {unread > 0 ? (
                        <span className="w-5 h-5 rounded-full bg-[#ff0033] text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(255,0,51,0.6)] animate-pulse">
                          {unread}
                        </span>
                      ) : (
                        <CheckCheck className="w-3.5 h-3.5 text-pink-500" />
                      )}

                      {/* Quick delete icon on list item */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="p-1 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition-colors opacity-0 group-hover/conv:opacity-100"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Zero State if no conversations */}
            {accountConversations.length === 0 && (
              <div className="py-8 px-2 text-center">
                <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-6 h-6 text-[#ff007a]" />
                </div>
                <h3 className="text-xs font-bold text-white">No conversations yet</h3>
                <p className="text-[11px] text-neutral-400 mt-1 mb-4">
                  Start a chat with any of these creators:
                </p>
                <div className="space-y-1.5 text-left">
                  {users
                    .filter(u => u.id !== currentUser?.id && !u.isBanned && !checkIsUserBanned(u.id, u.email, u).isBanned)
                    .map(u => {
                      const allowed = canMessageUser(u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => {
                            if (!allowed) {
                              setToastMessage(`🔒 @${u.username} is private. Only friends can exchange messages.`);
                              setTimeout(() => setToastMessage(''), 3500);
                              return;
                            }
                            openConversationWithUser(u.id);
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                            allowed
                              ? 'bg-[#181824] hover:bg-[#20202e] border-neutral-800/80 cursor-pointer'
                              : 'bg-[#181824]/50 border-neutral-800/40 cursor-not-allowed opacity-75'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              src={u.avatar}
                              alt={u.displayName || u.username}
                              size="sm"
                              className="w-8 h-8 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                <span>{u.displayName}</span>
                                {u.isPrivate && <Lock className="w-3 h-3 text-amber-400" />}
                              </div>
                              <div className="text-[10px] text-neutral-400 truncate">@{u.username}</div>
                            </div>
                          </div>
                          {allowed ? (
                            <span className="text-[10px] font-bold text-[#ff007a] bg-[#ff007a]/15 px-2.5 py-1 rounded-lg">
                              Message
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-neutral-400 bg-neutral-800/80 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5 text-neutral-500" />
                              <span>Friends</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {accountConversations.length > 0 && filteredConversations.length === 0 && (
              <div className="text-center py-12 text-neutral-500 text-xs">
                No matching conversations found.
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Right Column (8 cols on desktop): Active Chat Session                     */}
        {/* ========================================================================= */}
        {activeConv && activeParticipant ? (
          <div
            className={`${
              messagesMobileView === 'list' ? 'hidden md:flex' : 'flex'
            } md:col-span-8 bg-[#13131a] rounded-3xl border border-neutral-800 p-4 sm:p-5 flex-col justify-between shadow-xl min-h-0 relative w-full`}
          >
            {/* Header: Back Arrow (on mobile) + Participant Info + 3 Dots Options */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                {/* Mobile Back Arrow */}
                <button
                  type="button"
                  onClick={() => setMessagesMobileView('list')}
                  className="md:hidden p-2 -ml-1 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                  title="Back to conversations"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div
                  onClick={() => navigateToUserProfile(activeParticipant.id)}
                  className="relative cursor-pointer shrink-0"
                >
                  <Avatar
                    src={activeParticipant.avatar}
                    alt={activeParticipant.displayName || activeParticipant.username}
                    size="md"
                    className="w-10 h-10 shrink-0"
                  />
                  {activeConv.isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#13131a]" />
                  )}
                </div>

                <div className="text-left min-w-0">
                  <h3
                    onClick={() => navigateToUserProfile(activeParticipant.id)}
                    className="text-sm font-bold text-white hover:text-[#ff007a] transition-colors cursor-pointer truncate"
                  >
                    {activeParticipant.displayName}
                  </h3>
                  <div className="text-[11px] text-neutral-400 truncate">
                    {activeConv.isOnline ? 'Online' : 'Offline'} · Last seen, {activeConv.lastSeen || 'recently'}
                  </div>
                </div>
              </div>

              {/* Action shortcuts: Note call and video call buttons removed as requested! */}
              <div className="flex items-center gap-1.5 sm:gap-2 relative shrink-0">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="More options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {/* Dropdown Menu */}
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute top-10 right-0 w-48 bg-[#181824] border border-neutral-700 rounded-2xl p-1.5 shadow-xl z-40 text-left backdrop-blur-xl animate-fadeIn">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          navigateToUserProfile(activeParticipant.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-[#ff007a]" />
                        <span>View Profile</span>
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          openReportModal({
                            type: 'user',
                            targetId: activeParticipant.id,
                            targetName: `${activeParticipant.displayName}'s profile`,
                            targetSubtitle: `@${activeParticipant.username}`,
                            targetThumbnail: activeParticipant.avatar,
                          });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:text-[#ff007a] hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5 text-[#ff007a]" />
                        <span>Report User</span>
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          const msg = `${activeParticipant.displayName} has been blocked.`;
                          setToastMessage(msg);
                          setTimeout(() => setToastMessage(''), 3000);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5 text-red-400" />
                        <span>Block User</span>
                      </button>
                      
                      {/* Delete Conversation added directly below "Block User" as requested */}
                      <div className="h-px bg-neutral-700/60 my-0.5" />
                      <button
                        onClick={handleDeleteConversation}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span>Delete Conversation</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Messages Bubbles Stream */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-left min-h-0">
              {(() => {
                const userClearedTimestamp = Math.max(
                  getConversationClearedTimestamp(activeConv.id, currentUser?.id),
                  activeConv.clearedHistoryAt?.[currentUser?.id || ''] || 0,
                  activeConv.clearedHistoryAt?.[toUuid(currentUser?.id || '')] || 0
                );
                const visibleMessages = (activeConv.messages || []).filter(msg => {
                  // Hide if explicitly marked deleted for this user
                  if (currentUser && msg.deletedForUserIds?.some(id => isSameUser(id, currentUser.id))) {
                    return false;
                  }
                  // Hide if created on or before the conversation was cleared for this user
                  if (userClearedTimestamp > 0) {
                    if (msg.sentAt) {
                      const t = new Date(msg.sentAt).getTime();
                      if (t > 0 && t <= userClearedTimestamp) return false;
                    }
                    if (typeof msg.id === 'string' && msg.id.startsWith('m_')) {
                      const parts = msg.id.split('_');
                      const t = parseInt(parts[1], 10);
                      if (t > 0 && t <= userClearedTimestamp) return false;
                    }
                  }
                  return true;
                });

                if (visibleMessages.length === 0) {
                  return (
                    <div className="py-16 text-center text-xs text-neutral-500">
                      No messages yet. Say hello to {activeParticipant.displayName}!
                    </div>
                  );
                }

                return visibleMessages.map(msg => {
                  const isMe = currentUser ? msg.senderId === currentUser.id : msg.isMine;
                  const videoData = resolveSharedVideo(msg, videos);

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col group/msg ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      {/* Bubble */}
                      <div
                        className={`${
                          videoData.isVideo
                            ? 'w-72 sm:w-80 max-w-[90vw] p-2 sm:p-2.5 rounded-2xl shadow-xl'
                            : 'max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-medium leading-relaxed shadow-md'
                        } ${
                          isMe
                            ? 'bg-[#ff007a] text-white rounded-br-xs'
                            : 'bg-[#2a2a38] text-neutral-100 rounded-bl-xs'
                        }`}
                      >
                        {/* Quoted Reply Banner if this message is a reply */}
                        {msg.replyTo && (
                          <div
                            className={`mb-2 px-2.5 py-1.5 rounded-xl text-[11px] leading-tight flex flex-col gap-0.5 ${
                              isMe
                                ? 'bg-black/25 text-white/90 border-l-2 border-white'
                                : 'bg-black/30 text-neutral-200 border-l-2 border-[#ff007a]'
                            }`}
                          >
                            <div className="flex items-center gap-1 font-bold text-[10px] opacity-90">
                              <CornerUpLeft className="w-2.5 h-2.5" />
                              <span>{msg.replyTo.senderName}</span>
                            </div>
                            <p className="truncate opacity-75">{msg.replyTo.text}</p>
                          </div>
                        )}

                        {videoData.isVideo && videoData.video ? (
                          <MessageVideoCard
                            video={videoData.video}
                            note={videoData.note}
                            isMe={isMe}
                          />
                        ) : (
                          <div>{msg.text}</div>
                        )}
                      </div>

                      {/* Timestamp, Status & Action Buttons (Reply / Delete on every message) */}
                      <div
                        className={`flex items-center gap-2 mt-1 px-1 ${
                          isMe ? 'flex-row' : 'flex-row'
                        }`}
                      >
                        <span className="text-[10px] text-neutral-500">
                          {msg.timestamp}
                        </span>
                        {isMe && <CheckCheck className="w-3 h-3 text-pink-400" />}

                        {/* Reply and Delete Buttons on every message */}
                        <div className="flex items-center gap-1 opacity-90 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo({
                                id: msg.id,
                                senderName: isMe ? 'You' : activeParticipant.displayName,
                                text: msg.text,
                              });
                            }}
                            className="text-[10px] font-semibold text-neutral-400 hover:text-[#ff007a] px-1.5 py-0.5 rounded hover:bg-neutral-800/80 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Reply to this message"
                          >
                            <CornerUpLeft className="w-3 h-3" />
                            <span>Reply</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteMessage(activeConv.id, msg.id)}
                            className="text-[10px] font-semibold text-neutral-400 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-neutral-800/80 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Delete / unsend message (deletes for both POVs)"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Bottom Send Input Bar */}
            <form onSubmit={handleSend} className="pt-2 border-t border-neutral-800 shrink-0">
              {/* Private account friend restriction banner */}
              {activeParticipant && !canMessageUser(activeParticipant.id) && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-amber-300 mb-2">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    This account is private. Only friends can exchange messages. Send a follow request and become friends to chat.
                  </span>
                </div>
              )}

              {/* Replying-to Preview Bar */}
              {replyingTo && (
                <div className="flex items-center justify-between px-3 py-1.5 mb-2 bg-[#1c1c28] border-l-4 border-[#ff007a] rounded-xl text-xs text-neutral-300 animate-fadeIn">
                  <div className="flex items-center gap-2 truncate">
                    <CornerUpLeft className="w-3.5 h-3.5 text-[#ff007a] shrink-0" />
                    <span className="font-bold text-white shrink-0">
                      Replying to {replyingTo.senderName}:
                    </span>
                    <span className="truncate text-neutral-400">"{replyingTo.text}"</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 ml-2 shrink-0 cursor-pointer"
                    title="Cancel reply"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 bg-[#181824] rounded-2xl px-4 py-2.5 border border-neutral-700/80 focus-within:border-[#ff007a] transition-all">
                <input
                  type="text"
                  disabled={Boolean(activeParticipant && !canMessageUser(activeParticipant.id))}
                  placeholder={
                    activeParticipant && !canMessageUser(activeParticipant.id)
                      ? 'Messaging restricted to friends only'
                      : replyingTo
                      ? `Replying to ${replyingTo.senderName}...`
                      : `Message ${activeParticipant.displayName}...`
                  }
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 outline-none disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || Boolean(activeParticipant && !canMessageUser(activeParticipant.id))}
                  className={`p-2 rounded-xl transition-all ${
                    inputText.trim() && (!activeParticipant || canMessageUser(activeParticipant.id))
                      ? 'bg-[#ff007a] text-white hover:bg-[#e0006c] cursor-pointer shadow-[0_0_12px_rgba(255,0,122,0.4)]'
                      : 'text-neutral-600 cursor-not-allowed'
                  }`}
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="hidden md:flex md:col-span-8 bg-[#13131a] rounded-3xl border border-neutral-800 p-8 flex-col items-center justify-center text-neutral-400 text-sm">
            <MessageSquare className="w-12 h-12 text-neutral-600 mb-3" />
            <p className="font-bold text-white">No Conversation Selected</p>
            <p className="text-xs text-neutral-500 mt-1">Select a conversation or start a new chat with a creator.</p>
            <button
              onClick={() => setNewChatModalOpen(true)}
              className="mt-4 py-2 px-5 rounded-2xl bg-[#ff007a] hover:bg-[#e0006c] text-white font-bold text-xs transition-colors cursor-pointer shadow-[0_0_15px_rgba(255,0,122,0.4)]"
            >
              Start a Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
