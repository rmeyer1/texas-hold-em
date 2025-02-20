import React from 'react';
import { Player, Table } from '@/types/poker';
import { Card } from './Card';

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
        isCurrentPlayer ? 'ring-2 ring-yellow-400 rounded-lg' : ''
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="flex flex-col items-center gap-1">
        {/* Player info */}
        <div
          className={`p-2 rounded-lg ${
            player.hasFolded ? 'bg-gray-700' : 'bg-blue-900'
          } text-white shadow-md`}
        >
          <div className="text-sm font-semibold">{player.name}</div>
          <div className="text-xs">Chips: {player.chips}</div>
        </div>

        {/* Dealer button */}
        {isDealer && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white text-black text-xs flex items-center justify-center font-bold border border-gray-300">
            D
          </div>
        )}

        {/* Cards */}
        <div className="flex gap-1 -mt-1">
          {player.holeCards.map((card) => (
            <Card
              key={`${card.suit}-${card.rank}`}
              card={card}
              faceDown={!isCurrentPlayer}
              className="transform scale-75"
            />
          ))}
        </div>
      </div>
    </div>
  );
}; 