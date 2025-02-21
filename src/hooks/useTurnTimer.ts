import { useState, useEffect } from 'react';
import type { Table } from '@/types/poker';

export const useTurnTimer = (
  table: Table | null,
  isCurrentPlayer: boolean
): { timeLeft: number; progress: number } => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [progress, setProgress] = useState<number>(100);
  const [lastPhase, setLastPhase] = useState<string | null>(null);

  useEffect(() => {
    if (!table || !table.turnTimeLimit || !table.lastActionTimestamp) {
      setTimeLeft(0);
      setProgress(100);
      return;
    }

    // Reset timer when phase changes
    if (table.phase !== lastPhase) {
      setLastPhase(table.phase);
      setTimeLeft(table.turnTimeLimit / 1000);
      setProgress(100);
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
  }, [
    table?.lastActionTimestamp,
    table?.turnTimeLimit,
    table?.phase,
    table?.currentPlayerIndex,
    lastPhase
  ]);

  return { timeLeft, progress };
}; 