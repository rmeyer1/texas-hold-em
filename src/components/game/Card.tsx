import React from 'react';
import { Card as CardType } from '@/types/poker';

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ 
  card, 
  faceDown = false, 
  className = '',
  size = 'md'
}) => {
  const getSuitSymbol = (suit: string): string => {
    const symbols: { [key: string]: string } = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠',
    };
    return symbols[suit];
  };

  const getSuitColor = (suit: string): string => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-600' : 'text-gray-900';
  };

  // Size classes based on the size prop
  const sizeClasses = {
    sm: 'w-10 h-16 text-xs',
    md: 'w-14 h-20 text-sm',
    lg: 'w-16 h-24 text-base',
  };

  const cardSizeClass = sizeClasses[size];
  const rankSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base';
  const suitSize = size === 'sm' ? 'text-lg' : size === 'md' ? 'text-2xl' : 'text-3xl';

  if (faceDown) {
    return (
      <div
        className={`relative ${cardSizeClass} rounded-lg bg-gradient-to-br from-blue-800 to-blue-900 border border-blue-700 shadow-lg 
        flex items-center justify-center overflow-hidden ${className}`}
      >
        {/* Card back pattern */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-6 gap-0.5 p-1 opacity-30">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="bg-blue-300 rounded-sm"></div>
          ))}
        </div>
        
        {/* Card back shine effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-blue-400 to-transparent opacity-10"></div>
        
        {/* Card edge highlight */}
        <div className="absolute inset-0 rounded-lg border border-white opacity-20"></div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${cardSizeClass} bg-white rounded-lg border border-gray-300 shadow-lg 
      flex flex-col items-center justify-between p-1 overflow-hidden ${className}`}
    >
      {/* Card shine effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white to-transparent opacity-40 pointer-events-none"></div>
      
      {/* Card content */}
      <div className={`${rankSize} font-bold ${getSuitColor(card.suit)} self-start pl-1 z-10`}>
        {card.rank}
        <span className="text-xs ml-0.5">{getSuitSymbol(card.suit)}</span>
      </div>
      
      <div className={`${suitSize} ${getSuitColor(card.suit)} z-10`}>
        {getSuitSymbol(card.suit)}
      </div>
      
      <div className={`${rankSize} font-bold ${getSuitColor(card.suit)} self-end rotate-180 pr-1 z-10`}>
        {card.rank}
        <span className="text-xs ml-0.5">{getSuitSymbol(card.suit)}</span>
      </div>
      
      {/* Card edge highlight */}
      <div className="absolute inset-0 rounded-lg border border-white opacity-10 pointer-events-none"></div>
    </div>
  );
}; 