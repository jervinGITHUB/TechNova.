import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

interface VideoCaptionWithTagsProps {
  caption: string;
  hashtags?: string[];
  maxChars?: number;
  className?: string;
}

export const VideoCaptionWithTags: React.FC<VideoCaptionWithTagsProps> = ({
  caption = '',
  hashtags = [],
  maxChars = 60,
  className = '',
}) => {
  const { setSearchQuery, setActiveTab, navigateToUserProfileByUsername } = useApp();
  const [isExpanded, setIsExpanded] = useState(false);

  // Normalize all hashtags to have leading '#'
  const normalizedTags = (hashtags || [])
    .map(t => (t.startsWith('#') ? t : `#${t}`).trim())
    .filter(t => t.length > 1);

  // Remove hashtags that the user already manually typed inside the caption
  const captionLower = (caption || '').toLowerCase();
  const extraTags = normalizedTags.filter(
    t => !captionLower.includes(t.toLowerCase())
  );

  // Unified stream of text: caption + extra hashtags
  const fullText = [caption.trim(), ...extraTags].filter(Boolean).join(' ');

  if (!fullText) return null;

  const needsTruncation = fullText.length > maxChars;

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    setSearchQuery(tag);
    setActiveTab('explore');
  };

  const handleMentionClick = (e: React.MouseEvent, username: string) => {
    e.stopPropagation();
    navigateToUserProfileByUsername(username);
  };

  // Helper to render tokens with clickable hashtags and @mentions
  const renderTokens = (text: string) => {
    const tokens = text.split(/(\s+)/);
    return tokens.map((token, idx) => {
      if (token.startsWith('#') && token.length > 1) {
        return (
          <button
            key={idx}
            type="button"
            onClick={e => handleTagClick(e, token)}
            className="font-bold text-white hover:text-[#ff007a] transition-colors cursor-pointer mr-0.5 inline-block drop-shadow"
          >
            {token}
          </button>
        );
      }
      if (token.startsWith('@') && token.length > 1) {
        const cleanUsername = token.slice(1).replace(/[^a-zA-Z0-9._]/g, '');
        return (
          <button
            key={idx}
            type="button"
            onClick={e => handleMentionClick(e, cleanUsername)}
            className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer mr-0.5 inline-block drop-shadow hover:underline"
          >
            @{cleanUsername}
          </button>
        );
      }
      return <span key={idx}>{token}</span>;
    });
  };

  // If text is short enough, display as a single unified line without more/less
  if (!needsTruncation) {
    return (
      <div
        className={`mt-1 text-xs sm:text-sm text-neutral-100 leading-snug drop-shadow-md break-words break-all [overflow-wrap:anywhere] ${className}`}
      >
        <p>{renderTokens(fullText)}</p>
      </div>
    );
  }

  // Expanded State (matching Screenshot 3: full caption & hashtags with "less")
  if (isExpanded) {
    return (
      <div
        className={`mt-1 text-xs sm:text-sm text-neutral-100 leading-snug drop-shadow-md break-words break-all [overflow-wrap:anywhere] max-h-48 overflow-y-auto pr-1 select-text ${className}`}
      >
        <p>
          {renderTokens(fullText)}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setIsExpanded(false);
            }}
            className="font-bold text-neutral-300 hover:text-white ml-2 text-xs cursor-pointer select-none drop-shadow"
          >
            less
          </button>
        </p>
      </div>
    );
  }

  // Collapsed State (matching Screenshot 2: truncated text with "... more")
  let sliceLength = maxChars;
  const spaceIdx = fullText.lastIndexOf(' ', maxChars);
  if (spaceIdx > 35) {
    sliceLength = spaceIdx;
  }
  const truncatedText = fullText.slice(0, sliceLength).trim();

  return (
    <div
      className={`mt-1 text-xs sm:text-sm text-neutral-100 leading-snug drop-shadow-md break-words break-all [overflow-wrap:anywhere] ${className}`}
    >
      <p>
        {renderTokens(truncatedText)}
        <span className="text-white/70"> ... </span>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            setIsExpanded(true);
          }}
          className="font-bold text-white hover:text-neutral-200 cursor-pointer text-xs select-none drop-shadow ml-0.5"
        >
          more
        </button>
      </p>
    </div>
  );
};
