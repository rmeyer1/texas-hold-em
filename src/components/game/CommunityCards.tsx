import React, { useEffect, useState } from 'react';
import { Card as CardType } from '@/types/poker';
import { Card } from './Card';

interface CommunityCardsProps {
  cards: CardType[];
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

export const CommunityCards: React.FC<CommunityCardsProps> = ({ cards, phase }) => {
  const [cardSize, setCardSize] = useState<'sm' | 'md' | 'lg'>('md');
  
  // Adjust card size based on screen width
  useEffect(() => {
    const handleResize = (): void => {
      if (window.innerWidth < 640) {
        setCardSize('sm');
      } else if (window.innerWidth < 1024) {
        setCardSize('md');
      } else {
        setCardSize('lg');
      }
    };
    
    // Initial check
    handleResize();
    
    // Add event listener for window resize
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const renderPlaceholders = () => {
    const totalCards = phase === 'preflop' ? 0 : phase === 'flop' ? 3 : phase === 'turn' ? 4 : 5;
    const placeholders = [];
    
    // Size classes based on the cardSize
    const sizeClasses = {
      sm: 'w-10 h-16',
      md: 'w-14 h-20',
      lg: 'w-16 h-24',
    };

    for (let i = cards.length; i < totalCards; i++) {
      placeholders.push(
        <div
          key={`placeholder-${i}`}
          className={`${sizeClasses[cardSize]} rounded-lg border border-white border-dashed opacity-30 bg-white/5 backdrop-blur-sm`}
        />
      );
    }

    return placeholders;
  };

  // Adjust gap size based on card size
  const gapSize = cardSize === 'sm' ? 'gap-1' : cardSize === 'md' ? 'gap-1.5' : 'gap-2';

  return (
    <div className={`flex items-center justify-center ${gapSize} my-2 sm:my-4 relative`}>
      {/* Glow effect behind cards */}
      <div className="absolute inset-0 -m-4 bg-blue-500/10 blur-xl rounded-full"></div>
      
      {/* Card spread with slight rotation for each card */}
      <div className={`flex items-center justify-center ${gapSize} relative`}>
        {cards.map((card, index) => (
          <div 
            key={`${card.suit}-${card.rank}`} 
            className="transform transition-transform duration-300"
            style={{ 
              transform: `rotate(${(index - Math.floor(cards.length / 2)) * 3}deg)`,
              zIndex: index + 1
            }}
          >
            <Card card={card} size={cardSize} />
          </div>
        ))}
        {renderPlaceholders().map((placeholder, index) => (
          <div 
            key={`placeholder-wrapper-${index}`}
            className="transform transition-transform duration-300"
            style={{ 
              transform: `rotate(${(index + cards.length - Math.floor((cards.length + renderPlaceholders().length) / 2)) * 3}deg)`,
              zIndex: index + cards.length + 1
            }}
          >
            {placeholder}
          </div>
        ))}
      </div>
    </div>
  );
}; 