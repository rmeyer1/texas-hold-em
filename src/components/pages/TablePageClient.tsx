'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { GameManager } from '@/services/gameManager';
import { PokerTable } from '@/components/game/PokerTable';
import { Table } from '@/types/poker';
import { useAuth } from '@/contexts/AuthContext';
import { getDatabase, ref, update, get } from 'firebase/database';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';
import chatService from '@/services/chatService';

interface TablePageClientProps {
  tableId: string;
  initialData?: Table | null;
}

export const TablePageClient: React.FC<TablePageClientProps> = ({ tableId, initialData }) => {
  const [table, setTable] = useState<Table | null>(initialData || null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const { user } = useAuth();
  const gameManagerRef = useRef<GameManager | null>(null);
  const previousDisplayName = useRef<string | null>(null);

  // Use GameManager's refreshPlayerUsername
  const refreshPlayerName = useCallback(async () => {
    if (!user || !tableId || !user.displayName || !gameManagerRef.current) return;
    
    try {
      await gameManagerRef.current.refreshPlayerUsername(user.uid, user.displayName);
    } catch (error) {
      logger.error(`[TablePageClient] Error refreshing player name in table ${tableId}:`, {
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
    }
  }, [user, tableId]);

  useEffect(() => {
    if (!tableId) {
      setError('Table ID is required');
      setIsLoading(false);
      return;
    }
  
    try {
      gameManagerRef.current = new GameManager(tableId);
      
      const unsubscribe = gameManagerRef.current.subscribeToTableState((tableState) => {
        logger.log('[TablePageClient] Table state updated:', { 
          currentPlayerIndex: tableState.currentPlayerIndex,
          lastAction: tableState.lastAction,
          phase: tableState.phase
        });
        setTable(prev => {
          const newTable = { ...prev, ...tableState };
          logger.log('[TablePageClient] Setting new table state:', { currentPlayerIndex: newTable.currentPlayerIndex });
          return newTable;
        });
        setIsLoading(false);
      });
  
      if (user && user.displayName) {
        refreshPlayerName();
      }
  
      return () => unsubscribe();
    } catch (error) {
      setError(`Error loading table: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  }, [tableId, refreshPlayerName, user]);

  useEffect(() => {
    if (!user || !table) return;

    if (user.displayName !== previousDisplayName.current) {
      previousDisplayName.current = user.displayName;
      
      const userId = user.uid;
      const isUserInTable = table.players?.some(player => player.id === userId) ?? false;
      
      if (isUserInTable) {
        logger.log(`[TablePageClient] Detected display name change to "${user.displayName}", updating player name`);
        refreshPlayerName();
      }
    }
  }, [user, table, refreshPlayerName]);


  useEffect(() => {
    if (!user || !tableId || !gameManagerRef.current || !table) return;

    const userId = user.uid;
    const isUserInTable = table.players?.some(player => player.id === userId) ?? false;
    
    if (!isUserInTable) {
      try {
        const joinTable = async () => {
          await gameManagerRef.current!.addPlayer({
            id: userId,
            name: user.displayName || 'Player',
            chips: 1000,
            position: table.players?.length ?? 0,
          });

          // Ensure chat room is activated for the player
          const chatRoomId = `table_${tableId}`;
          chatService.setActiveChatRoom(chatRoomId);
        };
        
        joinTable();
      } catch (error) {
        logger.error('Failed to join table:', {
          error: serializeError(error),
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // If user is already in table, ensure chat room is activated
      const activateChat = async (): Promise<void> => {
        try {
          const chatRoomId = `table_${tableId}`;
          chatService.setActiveChatRoom(chatRoomId);
        } catch (error: unknown) {
          logger.error('Failed to activate chat room:', {
            error: serializeError(error),
            timestamp: new Date().toISOString()
          });
        }
      };
      
      activateChat();
    }
  }, [user, tableId, table]);

  if (isLoading) {
    return <div className="p-8 text-center">Loading table...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  if (!table) {
    return <div className="p-8 text-center">Table not found</div>;
  }

  const handlePlayerAction = async (
    action: 'fold' | 'check' | 'call' | 'raise',
    amount?: number
  ) => {
    if (!user || !gameManagerRef.current) return;

    // Ensure amount is not undefined for check actions
    const validAmount = action === 'check' ? 0 : amount;

    try {
      await gameManagerRef.current.handlePlayerAction(user.uid, action, validAmount);
      // Optional: Add success feedback
      // toast.success(`Successfully ${action}ed`);
    } catch (error) {
      logger.error('Error handling player action:', {
        error: serializeError(error),
        action,
        amount: validAmount,
        userId: user.uid,
        timestamp: new Date().toISOString()
      });
      
      // Extract error message for user feedback
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unknown error occurred';
      
      // Display user-friendly error message
      // This assumes you have some toast/notification system
      // If you don't, you can implement one or use an alternative feedback mechanism
      // toast.error(`Action failed: ${errorMessage}`);
      
      // You could also set an error state to display in the UI
      // setActionError(errorMessage);
    }
  };

  const handleStartGame = async () => {
    if (!gameManagerRef.current) return;

    try {
      // Check if we're in showdown phase
      if (table?.phase === 'showdown') {
        // If we're in showdown, use the manual method to start a new hand
        logger.log('Manually starting new hand from showdown phase');
      } else {
        // Otherwise, start the game normally
        logger.log('Starting new game');
        await gameManagerRef.current.startGame();
      }
    } catch (error) {
      logger.error('Error starting game:', {
        error: serializeError(error),
        tableId,
        timestamp: new Date().toISOString()
      });
      
      // Extract error message for user feedback
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred while starting the game';
      
      // Display error to user (you can use your preferred notification method)
      // For example, if you have a toast notification system:
      // toast.error(errorMessage);
      
      // Or set an error state to display in the UI
      setError(errorMessage);
      
      // Reset error after a few seconds
      setTimeout(() => setError(null), 5000);
    }
  };

  return (
    <div className="p-4">
      <PokerTable
        table={table}
        currentPlayerId={user?.uid}
        onPlayerAction={handlePlayerAction}
        onStartGame={handleStartGame}
        isStartingGame={false}
        hasEnoughPlayers={(table?.players?.length ?? 0) >= 2}
      />
    </div>
  );
}; 