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

  // Enhanced color gradient based on time left
  const getTimerColor = () => {
    if (progress > 66) return 'from-green-400 to-green-600';
    if (progress > 33) return 'from-yellow-400 to-yellow-600';
    return 'from-red-400 to-red-600';
  };

  // Pulse animation when time is running low
  const getPulseClass = () => {
    return progress < 20 ? 'animate-pulse' : '';
  };

  return (
    <div className={`relative w-20 h-20 ${getPulseClass()}`}>
      {/* Circular progress background with shadow */}
      <div className="absolute inset-0 drop-shadow-lg">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          {/* Background circle with gradient */}
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" className={`${getTimerColor().split(' ')[0]}`} />
              <stop offset="100%" className={`${getTimerColor().split(' ')[1]}`} />
            </linearGradient>
          </defs>
          
          {/* Background track */}
          <circle
            className="text-gray-700 stroke-current"
            strokeWidth="10"
            fill="transparent"
            r="42"
            cx="50"
            cy="50"
          />
          
          {/* Progress arc with gradient */}
          <circle
            stroke="url(#timerGradient)"
            strokeWidth="10"
            strokeLinecap="round"
            fill="transparent"
            r="42"
            cx="50"
            cy="50"
            style={{
              strokeDasharray: `${2 * Math.PI * 42}`,
              strokeDashoffset: `${2 * Math.PI * 42 * (1 - progress / 100)}`,
              transform: 'rotate(-90deg)',
              transformOrigin: 'center',
              filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.3))'
            }}
          />
        </svg>
      </div>
      
      {/* Timer text with glass effect */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-black/30 backdrop-blur-sm rounded-full w-14 h-14 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{timeLeft}s</span>
        </div>
      </div>
    </div>
  );
}; 