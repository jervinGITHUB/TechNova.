import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const ViralHubLogo: React.FC<LogoProps> = ({ size = 'md', showText = true }) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-14 h-14',
    xl: 'w-24 h-24',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-5xl',
  };

  return (
    <div className="flex items-center gap-3 select-none">
      {/* 3D neon stylized V emblem with orbital ring and sparkle star */}
      <div className={`relative ${iconSizes[size]} flex items-center justify-center`}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-[0_0_12px_rgba(255,0,122,0.8)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Orbital ring */}
          <ellipse
            cx="50"
            cy="52"
            rx="46"
            ry="20"
            transform="rotate(-28 50 52)"
            stroke="url(#ringGrad)"
            strokeWidth="3.5"
            strokeDasharray="4 2"
            className="opacity-90"
          />

          {/* Bold stylized 3D 'V' */}
          <path
            d="M20 20 L48 85 C49 87 51 87 52 85 L80 20 L66 20 L50 63 L34 20 Z"
            fill="url(#vGradFront)"
          />
          {/* 3D depth bevel */}
          <path
            d="M34 20 L50 63 L50 69 L30 24 Z"
            fill="#d00062"
            opacity="0.8"
          />
          <path
            d="M50 63 L66 20 L72 20 L52 85 Z"
            fill="#ff3399"
            opacity="0.9"
          />

          {/* Sparkle star top-right */}
          <path
            d="M84 14 Q88 18 92 18 Q88 18 88 22 Q88 18 84 18 Q88 18 88 14 Z"
            fill="#ffffff"
            className="animate-pulse"
          />

          <defs>
            <linearGradient id="vGradFront" x1="20" y1="20" x2="80" y2="85" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ff007a" />
              <stop offset="0.6" stopColor="#fa2584" />
              <stop offset="1" stopColor="#b30054" />
            </linearGradient>
            <linearGradient id="ringGrad" x1="10" y1="30" x2="90" y2="70" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ff007a" />
              <stop offset="0.5" stopColor="#00e5ff" />
              <stop offset="1" stopColor="#ff007a" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showText && (
        <span className={`font-brand font-extrabold tracking-wider ${textSizes[size]}`}>
          <span className="text-white">VIRAL</span>
          <span className="text-[#ff007a] drop-shadow-[0_0_10px_rgba(255,0,122,0.6)]">HUB</span>
        </span>
      )}
    </div>
  );
};
