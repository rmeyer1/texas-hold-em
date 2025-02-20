import { useState, useEffect } from 'react';
import type { Table } from '@/types/poker';

export const useTurnTimer = (
  table: Table | null,
  isCurrentPlayer: boolean
): { timeLeft: number; progress: number } => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [progress, setProgress] = useState<number>(100);

  useEffect(() => {
    if (!table || !table.turnTimeLimit || !table.lastActionTimestamp) {
      setTimeLeft(0);
      setProgress(100);
      return;
    }

    const calculateTimeLeft = (): void => {
      const now = Date.now();
      const elapsed = now - table.lastActionTimestamp;
      const remaining = Math.max(0, table.turnTimeLimit - elapsed);
      const progressValue = (remaining / table.turnTimeLimit) * 100;

      setTimeLeft(Math.ceil(remaining / 1000)); // Convert to seconds
      setProgress(progressValue);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 100);

    return () => clearInterval(interval);
  }, [table?.lastActionTimestamp, table?.turnTimeLimit]);

  return { timeLeft, progress };
}; 