import React, { useEffect, useState } from 'react';
import { HandRank, WinningHand } from '@/types/poker';

interface WinnerDisplayProps {
  winnerNames: string[];
  winningAmount: number;
  winningHands?: WinningHand[] | null;
}

export const WinnerDisplay: React.FC<WinnerDisplayProps> = ({
  winnerNames,
  winningAmount,
  winningHands,
}) => {
  const [visible, setVisible] = useState(false);

  // Animation effect when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Handle multiple winners
  const isMultipleWinners = winnerNames.length > 1;
  const winnersText = isMultipleWinners
    ? `${winnerNames.slice(0, -1).join(', ')} and ${winnerNames[winnerNames.length - 1]}`
    : winnerNames[0];

  // Get the first winning hand to display (in case of multiple winners)
  const firstWinningHand = winningHands && winningHands.length > 0 ? winningHands[0] : null;

  return (
    <div
      className={`flex flex-col items-center justify-center p-4 bg-black/50 backdrop-blur-md rounded-xl border-2 border-yellow-500 shadow-lg transform transition-all duration-500 ${
        visible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
      }`}
      style={{ minWidth: '280px', maxWidth: '400px' }}
    >
      {/* Trophy icon */}
      <div className="text-yellow-400 text-4xl mb-2">🏆</div>
      
      {/* Winner text */}
      <div className="text-center mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-1">
          {isMultipleWinners ? 'Winners!' : 'Winner!'}
        </h2>
        <p className="text-yellow-300 font-bold text-lg sm:text-xl mb-1">{winnersText}</p>
        <p className="text-green-400 font-bold text-lg sm:text-xl">
          Won ${winningAmount}
        </p>
      </div>
      
      {/* Hand information */}
      {firstWinningHand && (
        <div className="text-center mt-2 p-2 bg-blue-900/50 rounded-lg border border-blue-700">
          <p className="text-white font-semibold">{firstWinningHand.rank}</p>
          <p className="text-gray-300 text-sm">{firstWinningHand.description}</p>
        </div>
      )}
      
      {/* Start next hand indicator */}
      <div className="mt-6 text-gray-400 text-sm animate-pulse">
        Starting next hand soon...
      </div>
    </div>
  );
}; 