import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { X, Send, Heart, ChevronUp, ChevronDown, MessageSquare, Trash2, RefreshCw, AtSign } from 'lucide-react';
import { formatRealtimeAgo } from '../../utils/time';
import { isSameUser } from '../../lib/supabase';
import { MentionAutocomplete } from '../common/MentionAutocomplete';
import { User } from '../../types';

export const CommentsDrawer: React.FC = () => {
  const {
    commentsVideoId,
    setCommentsVideoId,
    currentUser,
    addCommentToVideo,
    deleteCommentFromVideo,
    toggleLikeComment,
    videos,
    commentsMap,
    fetchCommentsForVideo,
    users,
    getFollowStatus,
    isTargetFollowingMe,
    navigateToUserProfileByUsername,
  } = useApp();

  // Bottom-sheet height state for mobile (starts at 50% = half of video)
  const [heightPercent, setHeightPercent] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [inputVal, setInputVal] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const commentInputRef = useRef<HTMLInputElement>(null);

  // Desktop viewport check (>= 768px docks on the right side)
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Drag tracking refs
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(50);
  const currentHeightRef = useRef<number>(50);

  // Fetch comments from Supabase when drawer opens or video changes
  useEffect(() => {
    if (commentsVideoId) {
      setHeightPercent(50);
      currentHeightRef.current = 50;
      setReplyingTo(null);
      setInputVal('');
      setIsLoading(true);
      fetchCommentsForVideo(commentsVideoId, true).finally(() => {
        setIsLoading(false);
      });
    }
  }, [commentsVideoId]);

  if (!commentsVideoId) return null;

  const currentComments = commentsMap[commentsVideoId] || [];
  const currentVideo = videos.find(v => v.id === commentsVideoId);

  // Total comments count including replies
  const totalCommentsCount = currentComments.reduce(
    (acc, c) => acc + 1 + (c.replies ? c.replies.length : 0),
    0
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputVal(val);

    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9._]*)$/);

    if (match) {
      const q = match[1];
      const atIndex = textBeforeCursor.lastIndexOf('@');
      setMentionQuery(q);
      setMentionStartIndex(atIndex);
    } else {
      setMentionQuery(null);
      setMentionStartIndex(-1);
    }
  };

  const handleSelectMentionUser = (user: User) => {
    if (mentionStartIndex < 0) return;
    const beforeAt = inputVal.slice(0, mentionStartIndex);
    const cursorPos = commentInputRef.current?.selectionStart || inputVal.length;
    const afterCursor = inputVal.slice(cursorPos);
    const inserted = `@${user.username} `;
    const newVal = `${beforeAt}${inserted}${afterCursor}`;
    setInputVal(newVal);
    setMentionQuery(null);
    setMentionStartIndex(-1);
    setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
        const nextPos = beforeAt.length + inserted.length;
        commentInputRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 50);
  };

  const renderCommentText = (text: string) => {
    const tokens = text.split(/(\s+)/);
    return tokens.map((token, idx) => {
      if (token.startsWith('@') && token.length > 1) {
        const cleanUsername = token.slice(1).replace(/[^a-zA-Z0-9._]/g, '');
        return (
          <button
            key={idx}
            type="button"
            onClick={e => {
              e.stopPropagation();
              setCommentsVideoId(null);
              navigateToUserProfileByUsername(cleanUsername);
            }}
            className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer mr-0.5 inline-block drop-shadow hover:underline"
          >
            @{cleanUsername}
          </button>
        );
      }
      return <span key={idx}>{token}</span>;
    });
  };

  const handleRefresh = async () => {
    if (!commentsVideoId || isLoading) return;
    setIsLoading(true);
    try {
      await fetchCommentsForVideo(commentsVideoId, true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || !currentUser || !commentsVideoId || isSubmitting) return;

    const text = inputVal.trim();
    const replyTarget = replyingTo;
    setInputVal('');
    setReplyingTo(null);
    setMentionQuery(null);
    setMentionStartIndex(-1);
    setIsSubmitting(true);
    try {
      await addCommentToVideo(commentsVideoId, text, replyTarget || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!commentsVideoId) return;
    await deleteCommentFromVideo(commentsVideoId, commentId);
  };

  // --- Touch Drag Gesture Handlers ---
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartHeight.current = heightPercent;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const deltaY = dragStartY.current - currentY; // dragging up -> positive delta
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.max(25, Math.min(92, dragStartHeight.current + deltaPercent));
    currentHeightRef.current = newHeight;
    setHeightPercent(newHeight);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const finalH = currentHeightRef.current;
    if (finalH < 32) {
      setCommentsVideoId(null);
    } else if (finalH > 65) {
      setHeightPercent(85);
      currentHeightRef.current = 85;
    } else {
      setHeightPercent(50);
      currentHeightRef.current = 50;
    }
  };

  // --- Mouse Drag Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartHeight.current = heightPercent;
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = dragStartY.current - moveEvent.clientY;
      const deltaPercent = (deltaY / window.innerHeight) * 100;
      const newHeight = Math.max(25, Math.min(92, dragStartHeight.current + deltaPercent));
      currentHeightRef.current = newHeight;
      setHeightPercent(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const finalH = currentHeightRef.current;
      if (finalH < 32) {
        setCommentsVideoId(null);
      } else if (finalH > 65) {
        setHeightPercent(85);
        currentHeightRef.current = 85;
      } else {
        setHeightPercent(50);
        currentHeightRef.current = 50;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden pointer-events-none flex ${
        isDesktop
          ? 'justify-end items-stretch'
          : 'flex-col justify-end items-center'
      }`}
    >
      {/* Upper Scrim / Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] md:bg-black/30 md:backdrop-blur-none transition-opacity cursor-pointer pointer-events-auto"
        onClick={() => setCommentsVideoId(null)}
        title="Tap outside to close comments"
      />

      {/* Main Comments Drawer:
          - Desktop (isDesktop): docked full-height on the RIGHT SIDE (w-[420px] lg:w-[460px], border-l, shadow-[-20px_0_50px_rgba(0,0,0,0.85)])
          - Mobile (!isDesktop): bottom sheet at middle/bottom (w-full max-w-[430px] sm:max-w-lg rounded-t-3xl)
      */}
      <div
        style={isDesktop ? undefined : { height: `${heightPercent}vh` }}
        className={`relative z-50 bg-[#111117] backdrop-blur-2xl flex flex-col pointer-events-auto select-none ${
          isDesktop
            ? 'w-[420px] lg:w-[460px] h-full border-l border-neutral-800 shadow-[-20px_0_50px_rgba(0,0,0,0.85)] animate-in slide-in-from-right duration-200'
            : `w-full max-w-[430px] sm:max-w-lg border-t border-x border-neutral-700/80 rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.85)] ${
                isDragging ? 'transition-none' : 'transition-[height] duration-300 ease-out'
              }`
        }`}
      >
        {/* Top Pill Drag Handle (Mobile only) */}
        {!isDesktop && (
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="pt-2 pb-1.5 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shrink-0 group"
            title="Drag up to expand or down to shrink/close"
          >
            <div className="w-12 h-1.5 rounded-full bg-neutral-600 group-hover:bg-[#ff007a] transition-colors" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#ff007a]/15 text-[#ff007a] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white font-brand truncate">
                  Comments
                </h2>
                <span className="text-xs text-neutral-400 font-semibold shrink-0">
                  ({totalCommentsCount})
                </span>
              </div>
              {currentVideo?.creator && (
                <p className="text-[11px] text-neutral-400 truncate">
                  Video by @{currentVideo.creator.username || 'creator'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Refresh button */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh comments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#ff007a]' : ''}`} />
            </button>

            {/* Quick toggle height button (mobile only) */}
            {!isDesktop && (
              <button
                type="button"
                onClick={() => {
                  const target = heightPercent > 65 ? 50 : 85;
                  setHeightPercent(target);
                  currentHeightRef.current = target;
                }}
                className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
                title={heightPercent > 65 ? 'Shrink' : 'Expand full'}
              >
                {heightPercent > 65 ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setCommentsVideoId(null)}
              className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Close comments"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

          {/* Scrollable Comments List */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-4 pr-2 min-h-0 text-left">
            {isLoading && currentComments.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400">
                <RefreshCw className="w-5 h-5 animate-spin text-[#ff007a]" />
                <span className="text-xs">Loading comments from Supabase...</span>
              </div>
            ) : currentComments.length === 0 ? (
              <div className="py-10 text-center text-xs text-neutral-400">
                No comments yet. Be the first to comment on this video!
              </div>
            ) : (
              currentComments.map(comment => {
                const isOwnComment = Boolean(
                  currentUser &&
                  comment.userId &&
                  (isSameUser(comment.userId, currentUser.id) ||
                   (currentUser.username && comment.name.toLowerCase() === currentUser.username.toLowerCase()) ||
                   (currentUser.displayName && comment.name.toLowerCase() === currentUser.displayName.toLowerCase()))
                );

                return (
                  <div key={comment.id} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={comment.avatar}
                        alt={comment.name}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate">
                              {comment.name}
                            </span>
                            {comment.timestamp && (
                              <span className="text-[10px] text-neutral-400 font-normal">
                                {formatRealtimeAgo(comment.timestamp)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isOwnComment && (
                              <button
                                type="button"
                                onClick={() => handleDelete(comment.id)}
                                className="text-neutral-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
                                title="Delete comment"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => toggleLikeComment(commentsVideoId, comment.id)}
                              className={`flex items-center gap-1 text-[11px] p-1 transition-colors cursor-pointer ${
                                comment.isLiked
                                  ? 'text-[#ff007a]'
                                  : 'text-neutral-500 hover:text-[#ff007a]'
                              }`}
                            >
                              <Heart
                                className={`w-3.5 h-3.5 ${comment.isLiked ? 'fill-[#ff007a]' : ''}`}
                              />
                              {(comment.likesCount || 0) > 0 && (
                                <span>{comment.likesCount}</span>
                              )}
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-neutral-200 mt-0.5 leading-relaxed break-words">
                          {renderCommentText(comment.text)}
                        </p>

                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo(comment.id);
                            setInputVal(`@${comment.name} `);
                          }}
                          className="text-[11px] text-neutral-400 hover:text-[#ff007a] font-semibold mt-1 cursor-pointer"
                        >
                          reply
                        </button>
                      </div>
                    </div>

                    {/* Nested Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="pl-9 space-y-2 border-l border-neutral-800 ml-4">
                        {comment.replies
                          .filter((reply, idx, arr) => arr.findIndex(r => r.id === reply.id || (r.text === reply.text && r.userId === reply.userId && r.timestamp === reply.timestamp)) === idx)
                          .map(reply => {
                          const isOwnReply = Boolean(
                            currentUser &&
                            reply.userId &&
                            (isSameUser(reply.userId, currentUser.id) ||
                             (currentUser.username && reply.name.toLowerCase() === currentUser.username.toLowerCase()) ||
                             (currentUser.displayName && reply.name.toLowerCase() === currentUser.displayName.toLowerCase()))
                          );

                          return (
                            <div key={reply.id} className="flex items-start gap-2.5">
                              <Avatar
                                src={reply.avatar}
                                alt={reply.name}
                                size="xs"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-white">
                                      {reply.name}
                                    </span>
                                    {reply.timestamp && (
                                      <span className="text-[9px] text-neutral-400">
                                        {formatRealtimeAgo(reply.timestamp)}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {isOwnReply && (
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(reply.id)}
                                        className="text-neutral-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
                                        title="Delete reply"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => toggleLikeComment(commentsVideoId, reply.id)}
                                      className={`flex items-center gap-1 text-[10px] p-1 transition-colors cursor-pointer ${
                                        reply.isLiked
                                          ? 'text-[#ff007a]'
                                          : 'text-neutral-500 hover:text-[#ff007a]'
                                      }`}
                                      title={reply.isLiked ? 'Unlike reply' : 'Like reply'}
                                    >
                                      <Heart
                                        className={`w-3 h-3 ${reply.isLiked ? 'fill-[#ff007a]' : ''}`}
                                      />
                                      {(reply.likesCount || 0) > 0 && (
                                        <span>{reply.likesCount}</span>
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs text-neutral-300 mt-0.5 break-words">
                                  {renderCommentText(reply.text)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Replying banner */}
          {replyingTo && (
            <div className="px-4 py-1.5 bg-[#1a1a24] text-[11px] text-[#ff007a] flex items-center justify-between border-t border-neutral-800 shrink-0">
              <span className="font-semibold">Replying to comment...</span>
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(null);
                  setInputVal('');
                }}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Input Form at bottom of drawer */}
          <div className="relative border-t border-neutral-800 bg-[#14141c] shrink-0 p-3 sm:px-4">
            {/* Mention Autocomplete Popup */}
            {mentionQuery !== null && (
              <MentionAutocomplete
                query={mentionQuery}
                users={users}
                currentUser={currentUser}
                getFollowStatus={getFollowStatus}
                isTargetFollowingMe={isTargetFollowingMe}
                onSelect={handleSelectMentionUser}
                onClose={() => {
                  setMentionQuery(null);
                  setMentionStartIndex(-1);
                }}
                positionClassName="bottom-full mb-2 left-3 right-3"
              />
            )}

            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 bg-[#1b1b26] rounded-2xl px-3.5 py-2 border border-neutral-700/80 focus-within:border-[#ff007a] transition-all"
            >
              {currentUser && (
                <Avatar
                  src={currentUser.avatar}
                  alt={currentUser.displayName || 'User'}
                  size="xs"
                />
              )}
              <input
                ref={commentInputRef}
                type="text"
                placeholder={
                  currentVideo ? `Comment for @${currentVideo.creator.username}... (type @ to tag)` : 'Add comment... (type @ to tag)'
                }
                value={inputVal}
                onChange={handleInputChange}
                className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const newVal = inputVal.endsWith(' ') || inputVal === '' ? `${inputVal}@` : `${inputVal} @`;
                  setInputVal(newVal);
                  setMentionQuery('');
                  setMentionStartIndex(newVal.lastIndexOf('@'));
                  setTimeout(() => {
                    if (commentInputRef.current) {
                      commentInputRef.current.focus();
                      commentInputRef.current.setSelectionRange(newVal.length, newVal.length);
                    }
                  }, 50);
                }}
                className="p-1 rounded-lg text-neutral-400 hover:text-[#ff007a] hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Tag a user using @"
              >
                <AtSign className="w-4 h-4" />
              </button>
              <button
                type="submit"
                disabled={!inputVal.trim() || isSubmitting}
                className="p-1.5 rounded-xl text-white bg-[#ff007a] hover:bg-[#e0006c] disabled:opacity-30 disabled:hover:bg-[#ff007a] transition-all cursor-pointer shadow-[0_0_10px_rgba(255,0,122,0.4)]"
                title="Send comment"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
    </div>
  );
};
