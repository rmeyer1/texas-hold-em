'use client';

import React, { useEffect, useState, useRef } from 'react';
import { GameManager } from '@/services/gameManager';
import { PokerTable } from '@/components/game/PokerTable';
import { Table } from '@/types/poker';
import { useAuth } from '@/contexts/AuthContext';

interface TablePageClientProps {
  tableId: string;
  initialData?: Table | null;
}

export const TablePageClient = ({ tableId, initialData }: TablePageClientProps): React.ReactElement => {
  const { user } = useAuth();
  const [gameManager] = useState(() => new GameManager(tableId));
  const [tableState, setTableState] = useState<Table | null>(initialData || null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [hasEnoughPlayers, setHasEnoughPlayers] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  
  // Refs for managing hand state and debouncing
  const isStartingHandRef = useRef<boolean>(false);
  const startHandTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Function to safely start a new hand with debounce
  const startNewHandSafely = async (): Promise<void> => {
    if (isStartingHandRef.current) {
      console.log('[TablePageClient] Hand start already in progress, skipping...');
      return;
    }

    try {
      isStartingHandRef.current = true;
      console.log('[TablePageClient] Starting new hand...');
      await gameManager.startNewHand();
    } catch (error) {
      console.error('[TablePageClient] Failed to start new hand:', error);
    } finally {
      // Reset the starting state after 2 seconds
      setTimeout(() => {
        isStartingHandRef.current = false;
      }, 2000);
    }
  };

  const handleStartGame = async (): Promise<void> => {
    if (isStartingGame || !hasEnoughPlayers || tableState?.phase !== 'waiting') return;
    
    try {
      setIsStartingGame(true);
      console.log('[TablePageClient] Starting game:', {
        tableId,
        playerCount: tableState?.players.length ?? 0,
        timestamp: new Date().toISOString(),
      });
      await gameManager.startGame();
    } catch (error) {
      console.error('[TablePageClient] Failed to start game:', error);
    } finally {
      setIsStartingGame(false);
    }
  };

  useEffect(() => {
    if (!user) {
      window.location.href = '/auth/signin';
      return;
    }

    const initializeGame = async (): Promise<void> => {
      try {
        // Get current table state
        let tableState = await gameManager.getTableState();
        if (!tableState) {
          try {
            await gameManager.initialize();
            tableState = await gameManager.getTableState();
          } catch (error) {
            console.error('Failed to initialize table:', error);
            return;
          }
        }

        // Add user if not in table
        const userId = user.uid;
        if (!tableState) {
          console.error('Table state is null after initialization');
          return;
        }
        const isUserInTable = tableState.players.some(player => player.id === userId);
        
        if (!isUserInTable) {
          try {
            await gameManager.addPlayer({
              id: userId,
              name: user.displayName || 'Player',
              chips: 1000,
              position: tableState.players.length,
            });
            tableState = await gameManager.getTableState();
            if (!tableState) {
              console.error('Table state is null after adding player');
              return;
            }
          } catch (error) {
            console.error('Failed to add player to table:', error);
            return;
          }
        }

        // Set initial state
        setTableState(tableState);
        if (tableState?.players && tableState.currentPlayerIndex >= 0) {
          setCurrentPlayerId(tableState.players[tableState.currentPlayerIndex].id);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to get table state:', error);
        setIsLoading(false);
      }
    };

    const unsubscribe = gameManager.subscribeToTableState((table) => {
      setTableState(table);
      if (table?.players && table.currentPlayerIndex >= 0) {
        setCurrentPlayerId(table.players[table.currentPlayerIndex].id);
      }

      // Check for active players (filtering out inactive ones)
      const activePlayers = table?.players?.filter(player => player.isActive) ?? [];
      const activePlayerCount = activePlayers.length;
      const hasEnough = activePlayerCount >= 2;
      setHasEnoughPlayers(hasEnough);
    });

    initializeGame();
    return () => unsubscribe();
  }, [gameManager, user]);

  const handlePlayerAction = async (
    action: 'fold' | 'check' | 'call' | 'raise',
    amount?: number
  ): Promise<void> => {
    if (!tableState || !currentPlayerId || !gameManager) return;

    try {
      let actionTaken = false;
      switch (action) {
        case 'fold':
          await gameManager.foldPlayer(currentPlayerId);
          actionTaken = true;
          break;
        case 'check':
          // No bet needed for check
          break;
        case 'call':
          await gameManager.placeBet(currentPlayerId, tableState.currentBet);
          actionTaken = true;
          break;
        case 'raise':
          if (amount) {
            await gameManager.placeBet(currentPlayerId, amount);
            actionTaken = true;
          }
          break;
      }

      if (actionTaken) {
        // Get updated table state after action
        const updatedState = await gameManager.getTableState();
        if (!updatedState) return;

        try {
          switch (updatedState.phase) {
            case 'preflop':
              await gameManager.dealFlop();
              break;
            case 'flop':
              await gameManager.dealTurn();
              break;
            case 'turn':
              await gameManager.dealRiver();
              break;
            case 'river':
              // Start a new hand after a delay
              setTimeout(async () => {
                try {
                  await gameManager.startNewHand();
                } catch (error) {
                  console.error('[TablePageClient] Error starting new hand after river:', error);
                }
              }, 3000);
              break;
          }
        } catch (error) {
          console.error('[TablePageClient] Error advancing game phase:', error);
        }
      }
    } catch (error) {
      console.error('Error handling player action:', error);
    }
  };

  if (isLoading || !tableState) {
    return (
      <div className="min-h-screen bg-gray-900 p-8 flex items-center justify-center">
        <div className="text-white text-2xl">Loading game...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-900 p-4">
      <h1 className="text-2xl text-white mb-4">Table {tableId}</h1>
      {!hasEnoughPlayers ? (
        <div className="bg-gray-800 rounded-lg p-6 mb-4">
          <p className="text-white text-xl text-center">
            Waiting for more players to join... (Need at least 2 players)
          </p>
          <p className="text-gray-400 text-center mt-2">
            Current players: {tableState.players.length}
          </p>
        </div>
      ) : !tableState.phase ? (
        <div className="bg-gray-800 rounded-lg p-6 mb-4">
          <button
            onClick={handleStartGame}
            disabled={isStartingGame || !hasEnoughPlayers}
            className={`w-full py-2 px-4 rounded ${
              isStartingGame || !hasEnoughPlayers
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white font-semibold transition-colors`}
          >
            {isStartingGame ? 'Starting Game...' : 'Start Game'}
          </button>
        </div>
      ) : null}
      {tableState && (
        <PokerTable
          table={tableState}
          currentPlayerId={currentPlayerId}
          onPlayerAction={handlePlayerAction}
          onStartGame={tableState.phase === 'waiting' ? handleStartGame : undefined}
          isStartingGame={isStartingGame}
        />
      )}
    </div>
  );
}; 