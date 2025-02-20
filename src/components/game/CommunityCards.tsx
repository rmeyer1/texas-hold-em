import React from 'react';
import { Card as CardType } from '@/types/poker';
import { Card } from './Card';

interface CommunityCardsProps {
  cards: CardType[];
  phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

export const CommunityCards: React.FC<CommunityCardsProps> = ({ cards, phase }) => {
  const renderPlaceholders = () => {
    const totalCards = phase === 'preflop' ? 0 : phase === 'flop' ? 3 : phase === 'turn' ? 4 : 5;
    const placeholders = [];

    for (let i = cards.length; i < totalCards; i++) {
      placeholders.push(
        <div
          key={`placeholder-${i}`}
          className="w-16 h-24 rounded-lg border-2 border-white border-dashed opacity-30"
        />
      );
    }

    return placeholders;
  };

  return (
    <div className="flex items-center justify-center gap-2 my-4">
      {cards.map((card) => (
        <Card key={`${card.suit}-${card.rank}`} card={card} />
      ))}
      {renderPlaceholders()}
    </div>
  );
}; 