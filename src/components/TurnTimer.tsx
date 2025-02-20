import React from 'react';
import type { Table } from '@/types/poker';
import { useTurnTimer } from '@/hooks/useTurnTimer';

interface TurnTimerProps {
  table: Table | null;
  isCurrentPlayer: boolean;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({ table, isCurrentPlayer }) => {
  const { timeLeft, progress } = useTurnTimer(table, isCurrentPlayer);

  if (!table || !table.turnTimeLimit) {
    return null;
  }

  const timerColor = progress > 66 
    ? 'bg-green-500' 
    : progress > 33 
    ? 'bg-yellow-500' 
    : 'bg-red-500';

  return (
    <div className="relative w-20 h-20">
      {/* Circular progress background */}
      <div className="absolute inset-0">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle
            className="text-gray-200 stroke-current"
            strokeWidth="10"
            fill="transparent"
            r="45"
            cx="50"
            cy="50"
          />
          <circle
            className={`${timerColor} stroke-current`}
            strokeWidth="10"
            strokeLinecap="round"
            fill="transparent"
            r="45"
            cx="50"
            cy="50"
            style={{
              strokeDasharray: `${2 * Math.PI * 45}`,
              strokeDashoffset: `${2 * Math.PI * 45 * (1 - progress / 100)}`,
              transform: 'rotate(-90deg)',
              transformOrigin: 'center',
            }}
          />
        </svg>
      </div>
      {/* Timer text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{timeLeft}s</span>
      </div>
    </div>
  );
}; 