import React, { useEffect, useState } from 'react';
import { Player, Table, Card } from '@/types/poker';
import { Card as CardComponent } from './Card';
import { GameManager } from '@/services/gameManager';

interface PlayerPositionProps {
  player: Player;
  isDealer: boolean;
  isCurrentPlayer: boolean;
  position: number;
  totalPlayers: number;
  table: Table;
}

export const PlayerPosition: React.FC<PlayerPositionProps> = ({
  player,
  isDealer,
  isCurrentPlayer,
  position,
  totalPlayers,
  table,
}) => {
  const [holeCards, setHoleCards] = useState<Card[]>([]);
  const [showCards, setShowCards] = useState(false);

  useEffect(() => {
    const loadHoleCards = async () => {
      if (isCurrentPlayer) {
        const gameManager = new GameManager(table.id);
        const cards = await gameManager.getPlayerHoleCards(player.id);
        if (cards) {
          setHoleCards(cards);
          setShowCards(true);
        } else {
          setHoleCards([]);
          setShowCards(false);
        }
      } else {
        setHoleCards([]);
        setShowCards(false);
      }
    };

    loadHoleCards();
  }, [isCurrentPlayer, player.id, table.id]);

  // Calculate position around an ellipse
  const getPosition = () => {
    const angle = (position * (360 / totalPlayers) - 90) * (Math.PI / 180);
    const x = 50 + 40 * Math.cos(angle);
    const y = 50 + 25 * Math.sin(angle);
    return { x, y };
  };

  const { x, y } = getPosition();

  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
        isCurrentPlayer ? 'ring-4 ring-yellow-400 rounded-lg p-1' : ''
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="flex flex-col items-center gap-1">
        {/* Player info */}
        <div
          className={`p-2 rounded-lg ${
            player.hasFolded 
              ? 'bg-gray-700' 
              : isCurrentPlayer 
                ? 'bg-blue-600 animate-pulse' 
                : 'bg-blue-900'
          } text-white shadow-md transition-colors duration-300`}
        >
          <div className="text-sm font-semibold">{player.name}</div>
          <div className="text-xs">Chips: {player.chips}</div>
          {isCurrentPlayer && (
            <div className="text-xs text-yellow-300 font-semibold mt-1">
              Your Turn
            </div>
          )}
        </div>

        {/* Dealer button */}
        {isDealer && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white text-black text-xs flex items-center justify-center font-bold border border-gray-300">
            D
          </div>
        )}

        {/* Cards */}
        <div className="flex gap-1 -mt-1">
          {showCards ? (
            holeCards.map((card) => (
              <CardComponent
                key={`${card.suit}-${card.rank}`}
                card={card}
                faceDown={false}
                className="transform scale-75"
              />
            ))
          ) : (
            // Show face down cards for other players
            Array(2).fill(null).map((_, i) => (
              <CardComponent
                key={i}
                card={{ suit: 'hearts', rank: '2' }} // Dummy card, will be shown face down
                faceDown={true}
                className="transform scale-75"
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}; 