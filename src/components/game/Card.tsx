import React from 'react';
import { Card as CardType } from '@/types/poker';

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ card, faceDown = false, className = '' }) => {
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
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-900';
  };

  if (faceDown) {
    return (
      <div
        className={`relative w-16 h-24 rounded-lg bg-blue-800 border-2 border-white shadow-md 
        flex items-center justify-center ${className}`}
      >
        <div className="absolute inset-0 m-1 border-2 border-white rounded-md opacity-50" />
      </div>
    );
  }

  return (
    <div
      className={`relative w-16 h-24 bg-white rounded-lg border border-gray-300 shadow-md 
      flex flex-col items-center justify-between p-1 ${className}`}
    >
      <div className={`text-sm font-bold ${getSuitColor(card.suit)} self-start pl-1`}>
        {card.rank}
      </div>
      <div className={`text-2xl ${getSuitColor(card.suit)}`}>
        {getSuitSymbol(card.suit)}
      </div>
      <div className={`text-sm font-bold ${getSuitColor(card.suit)} self-end rotate-180 pr-1`}>
        {card.rank}
      </div>
    </div>
  );
}; 