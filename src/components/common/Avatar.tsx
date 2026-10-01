import React, { useState } from 'react';
import { User as UserIcon } from 'lucide-react';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = 'User',
  size = 'md',
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-14 h-14 text-xl',
    xl: 'w-24 h-24 sm:w-28 sm:h-28 text-3xl',
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
    xl: 'w-12 h-12',
  };

  const showImage = Boolean(src && !hasError && !src.includes('unsplash.com') && !src.includes('/src/assets/images'));

  return (
    <div
      className={`rounded-full bg-[#1c1c28] border border-neutral-700/80 flex items-center justify-center overflow-hidden shrink-0 select-none ${sizeClasses[size]} ${className}`}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#232336] to-[#161622] text-neutral-400">
          <UserIcon className={iconSizes[size]} />
        </div>
      )}
    </div>
  );
};
