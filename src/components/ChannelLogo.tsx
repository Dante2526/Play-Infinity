import React, { useState, useEffect } from 'react';
import { Tv, Trophy, Film, Newspaper, Sparkles, Radio } from 'lucide-react';
import { resolveChannelLogo, getChannelBadgeInfo } from '../utils/channelLogos';

interface ChannelLogoProps {
  channel: {
    id?: string;
    name: string;
    logo?: string;
    category?: string;
  };
  className?: string;
  imageClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

export const ChannelLogo: React.FC<ChannelLogoProps> = ({
  channel,
  className = '',
  imageClassName = '',
  size = 'md'
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => resolveChannelLogo(channel));
  const [hasError, setHasError] = useState<boolean>(false);

  // Se o canal mudar, revalida
  useEffect(() => {
    const nextSrc = resolveChannelLogo(channel);
    setResolvedSrc(nextSrc);
    setHasError(false);
  }, [channel.id, channel.name, channel.logo, channel.category]);

  const badgeInfo = getChannelBadgeInfo(channel.name, channel.category);

  const renderIcon = () => {
    switch (badgeInfo.iconType) {
      case 'sports':
        return <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400 shrink-0" />;
      case 'news':
        return <Newspaper className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400 shrink-0" />;
      case 'movie':
        return <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 shrink-0" />;
      case 'kids':
        return <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-400 shrink-0" />;
      default:
        return <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400 shrink-0" />;
    }
  };

  // Se tem src resolvido e não deu erro de carregamento
  if (resolvedSrc && !hasError) {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
        <img
          src={resolvedSrc}
          alt={channel.name}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          className={`max-h-full max-w-full object-contain filter drop-shadow-md transition-all duration-300 ${imageClassName}`}
          onError={() => {
            // Se falhou o src atual e não era o fallback resolvido, tenta resolver novamente
            setHasError(true);
          }}
        />
      </div>
    );
  }

  // Fallback: Capa gráfica estilizada e profissional do canal (sem nunca deixar caixa preta vazia)
  const isSmall = size === 'sm';
  const isHero = size === 'hero';

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br ${badgeInfo.bgGradient} border ${badgeInfo.borderColor} rounded-lg select-none shadow-inner p-1 ${className}`}
    >
      {/* Luz ambiente sutil */}
      <div className="absolute inset-0 bg-white/[0.04] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center justify-center text-center w-full px-1">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          {renderIcon()}
          {!isSmall && (
            <span className={`font-black tracking-wider uppercase text-[10px] ${badgeInfo.textColor}`}>
              {badgeInfo.short}
            </span>
          )}
        </div>

        {isSmall ? (
          <span className="font-extrabold text-[9px] text-white leading-tight truncate max-w-full px-0.5">
            {badgeInfo.short}
          </span>
        ) : isHero ? (
          <span className="font-black text-sm text-white leading-tight uppercase tracking-wide truncate max-w-full">
            {badgeInfo.text}
          </span>
        ) : (
          <span className="font-bold text-[10px] sm:text-[11px] text-neutral-200 leading-tight truncate max-w-full">
            {badgeInfo.text.length > 12 ? badgeInfo.text.slice(0, 12) + '...' : badgeInfo.text}
          </span>
        )}
      </div>
    </div>
  );
};
