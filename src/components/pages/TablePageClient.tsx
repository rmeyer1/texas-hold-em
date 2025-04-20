'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { GameManager } from '@/services/gameManager';
import { PokerTable } from '@/components/game/PokerTable';
import { Table } from '@/types/poker';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';
import { TableServiceFactory } from '@/services/factories/tableServiceFactory';

interface TablePageClientProps {
  tableId: string;
  initialData?: Table | null;
  useFirebase?: boolean;
}

export default function TablePageClient({ tableId, initialData, useFirebase = true }: TablePageClientProps) {
  const [table, setTable] = useState<Table | null>(initialData || null);
  const [error, setError] = useState<string | null>(null);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const { user } = useAuth();
  const gameManagerRef = useRef<GameManager | null>(null);

  useEffect(() => {
    if (!tableId || !user) return;

    try {
      // Create the table service using the factory
      const tableService = TableServiceFactory.create(tableId, useFirebase);

      // Initialize game manager with the selected table service
      const gameManager = new GameManager(tableService);
      gameManagerRef.current = gameManager;

      // Initialize the game manager
      gameManager.initialize().catch((error) => {
        logger.error('[TablePageClient] Error initializing game manager:', {
          error: serializeError(error),
          tableId,
          userId: user.uid,
        });
        setError('Failed to initialize game');
      });

      // Subscribe to table updates
      const unsubscribe = gameManager.subscribeToTableState((updatedTable) => {
        setTable(updatedTable);
      });

      return () => {
        unsubscribe();
      };
    } catch (error) {
      logger.error('[TablePageClient] Error setting up table:', {
        error: serializeError(error),
        tableId,
        userId: user.uid,
      });
      setError('Failed to set up table');
    }
  }, [tableId, user, useFirebase]);

  const handlePlayerAction = useCallback(async (action: 'fold' | 'check' | 'call' | 'raise', amount?: number) => {
    if (!gameManagerRef.current || !user) return;

    try {
      await gameManagerRef.current.handlePlayerAction(user.uid, action, amount);
    } catch (error) {
      logger.error('[TablePageClient] Error handling player action:', {
        error: serializeError(error),
        action,
        amount,
        tableId,
        userId: user.uid,
      });
      setError('Failed to perform action');
    }
  }, [user, tableId]);

  const handleStartGame = useCallback(async () => {
    if (!gameManagerRef.current) return;

    try {
      setIsStartingGame(true);
      await gameManagerRef.current.startGame();
    } catch (error) {
      logger.error('[TablePageClient] Error starting game:', {
        error: serializeError(error),
        tableId,
      });
      setError('Failed to start game');
    } finally {
      setIsStartingGame(false);
    }
  }, [tableId]);

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!table) {
    return <div>Loading...</div>;
  }

  const hasEnoughPlayers = (table.players?.length ?? 0) >= 2;

  return (
    <PokerTable
      tableId={tableId}
      currentPlayerId={user?.uid}
      onPlayerAction={handlePlayerAction}
      onStartGame={handleStartGame}
      isStartingGame={isStartingGame}
      hasEnoughPlayers={hasEnoughPlayers}
    />
  );
} 