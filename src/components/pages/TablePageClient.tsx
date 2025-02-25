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
      setIsStartingGame(false); // Reset starting state on error
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
      console.log('[TablePageClient] Table state update:', {
        tableId,
        phase: table?.phase,
        currentPlayerIndex: table?.currentPlayerIndex,
        playerCount: table?.players?.length,
        activePlayerCount: table?.players?.filter(player => player.isActive).length,
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
      });

      setTableState(table);
      if (table?.players && table.currentPlayerIndex >= 0) {
        const newCurrentPlayerId = table.players[table.currentPlayerIndex].id;
        console.log('[TablePageClient] Updating current player:', {
          previousId: currentPlayerId,
          newId: newCurrentPlayerId,
          playerIndex: table.currentPlayerIndex,
          timestamp: new Date().toISOString(),
        });
        setCurrentPlayerId(newCurrentPlayerId);
      }

      // Check for active players (filtering out inactive ones)
      const activePlayers = table?.players?.filter(player => player.isActive) ?? [];
      const activePlayerCount = activePlayers.length;
      const hasEnough = activePlayerCount >= 2;
      
      console.log('[TablePageClient] Active player check:', {
        totalPlayers: table?.players?.length,
        activeCount: activePlayerCount,
        hasEnough,
        phase: table?.phase,
        timestamp: new Date().toISOString(),
      });

      setHasEnoughPlayers(hasEnough);

      // Reset starting game state if we're not in waiting phase
      if (table?.phase !== 'waiting') {
        setIsStartingGame(false);
      }
    });

    initializeGame();
    return () => unsubscribe();
  }, [gameManager, user]);

  const handlePlayerAction = async (
    action: 'fold' | 'check' | 'call' | 'raise',
    amount?: number
  ): Promise<void> => {
    const actionId = `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log('[TablePageClient] Player action initiated:', {
      actionId,
      action,
      amount,
      playerId: currentPlayerId,
      timestamp: new Date().toISOString(),
    });
    
    if (!tableState || !currentPlayerId || !gameManager) {
      console.error('[TablePageClient] Cannot handle player action - missing required data:', {
        actionId,
        hasTableState: !!tableState,
        hasCurrentPlayerId: !!currentPlayerId,
        hasGameManager: !!gameManager,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Log the table state before the action
    await gameManager.logTableState(`before-${action}`);

    try {
      let actionTaken = false;
      switch (action) {
        case 'fold':
          console.log('[TablePageClient] Player folding:', {
            actionId,
            playerId: currentPlayerId,
            timestamp: new Date().toISOString(),
          });
          await gameManager.foldPlayer(currentPlayerId);
          actionTaken = true;
          break;
        case 'check':
          console.log('[TablePageClient] Player checking:', {
            actionId,
            playerId: currentPlayerId,
            timestamp: new Date().toISOString(),
          });
          await gameManager.handlePlayerAction(currentPlayerId, 'check');
          actionTaken = true;
          break;
        case 'call':
          console.log('[TablePageClient] Player calling:', {
            actionId,
            playerId: currentPlayerId,
            currentBet: tableState.currentBet,
            timestamp: new Date().toISOString(),
          });
          await gameManager.callBet(currentPlayerId);
          actionTaken = true;
          break;
        case 'raise':
          if (amount) {
            console.log('[TablePageClient] Player raising:', {
              actionId,
              playerId: currentPlayerId,
              amount,
              currentBet: tableState.currentBet,
              timestamp: new Date().toISOString(),
            });
            await gameManager.raiseBet(currentPlayerId, amount);
            actionTaken = true;
          } else {
            console.warn('[TablePageClient] Raise action missing amount:', {
              actionId,
              playerId: currentPlayerId,
              timestamp: new Date().toISOString(),
            });
          }
          break;
      }

      if (actionTaken) {
        console.log('[TablePageClient] Action taken successfully, waiting for processing:', {
          actionId,
          action,
          timestamp: new Date().toISOString(),
        });
        
        // Wait a short moment for the action to be processed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Log the table state after the action
        await gameManager.logTableState(`after-${action}`);

        // Get updated table state after action
        const updatedState = await gameManager.getTableState();
        if (!updatedState) {
          console.error('[TablePageClient] Failed to get updated table state after action:', {
            actionId,
            action,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        console.log('[TablePageClient] Updated table state after action:', {
          actionId,
          phase: updatedState.phase,
          pot: updatedState.pot,
          currentBet: updatedState.currentBet,
          roundBets: updatedState.roundBets,
          timestamp: new Date().toISOString(),
        });

        // Only proceed with phase transitions if all players have acted
        const activePlayers = updatedState.players.filter(p => p.isActive && !p.hasFolded && p.chips > 0);
        const allPlayersActed = activePlayers.every(p => 
          (updatedState.roundBets[p.id] === updatedState.currentBet) || 
          p.chips === 0
        );

        console.log('[TablePageClient] Checking if all players have acted:', {
          actionId,
          allPlayersActed,
          activePlayers: activePlayers.map(p => ({
            id: p.id,
            name: p.name,
            bet: updatedState.roundBets[p.id],
            chips: p.chips,
            hasActed: (updatedState.roundBets[p.id] === updatedState.currentBet) || p.chips === 0
          })),
          currentBet: updatedState.currentBet,
          timestamp: new Date().toISOString(),
        });

        if (allPlayersActed) {
          console.log('[TablePageClient] All players have acted, advancing game phase:', {
            actionId,
            currentPhase: updatedState.phase,
            timestamp: new Date().toISOString(),
          });
          
          try {
            switch (updatedState.phase) {
              case 'preflop':
                console.log('[TablePageClient] Dealing flop:', {
                  actionId,
                  timestamp: new Date().toISOString(),
                });
                await gameManager.dealFlop();
                await gameManager.logTableState('after-deal-flop');
                break;
              case 'flop':
                console.log('[TablePageClient] Dealing turn:', {
                  actionId,
                  timestamp: new Date().toISOString(),
                });
                await gameManager.dealTurn();
                await gameManager.logTableState('after-deal-turn');
                break;
              case 'turn':
                console.log('[TablePageClient] Dealing river:', {
                  actionId,
                  timestamp: new Date().toISOString(),
                });
                await gameManager.dealRiver();
                await gameManager.logTableState('after-deal-river');
                break;
              case 'river':
                console.log('[TablePageClient] River phase complete, scheduling new hand:', {
                  actionId,
                  timestamp: new Date().toISOString(),
                });
                await gameManager.logTableState('before-new-hand-scheduled');
                // Start a new hand after a delay
                setTimeout(async () => {
                  const newHandId = `newhand-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                  try {
                    console.log('[TablePageClient] Starting new hand after river phase:', {
                      actionId,
                      newHandId,
                      timestamp: new Date().toISOString(),
                    });
                    
                    // Get current table state before starting new hand
                    const beforeState = await gameManager.getTableState();
                    console.log('[TablePageClient] Table state before starting new hand:', {
                      actionId,
                      newHandId,
                      phase: beforeState?.phase,
                      pot: beforeState?.pot,
                      smallBlind: beforeState?.smallBlind,
                      bigBlind: beforeState?.bigBlind,
                      timestamp: new Date().toISOString(),
                    });
                    
                    await gameManager.logTableState('before-start-new-hand');
                    await gameManager.startNewHand();
                    await gameManager.logTableState('after-start-new-hand');
                    
                    // Get updated table state after starting new hand
                    const afterState = await gameManager.getTableState();
                    console.log('[TablePageClient] New hand started successfully:', {
                      actionId,
                      newHandId,
                      phase: afterState?.phase,
                      pot: afterState?.pot,
                      smallBlind: afterState?.smallBlind,
                      bigBlind: afterState?.bigBlind,
                      roundBets: afterState?.roundBets,
                      timestamp: new Date().toISOString(),
                    });
                  } catch (error) {
                    console.error('[TablePageClient] Error starting new hand after river:', {
                      actionId,
                      newHandId,
                      error: error instanceof Error ? error.message : 'Unknown error',
                      stack: error instanceof Error ? error.stack : undefined,
                      timestamp: new Date().toISOString(),
                    });
                  }
                }, 3000);
                break;
            }
          } catch (error) {
            console.error('[TablePageClient] Error advancing game phase:', {
              actionId,
              phase: updatedState.phase,
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } else {
        console.log('[TablePageClient] No action taken:', {
          actionId,
          action,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[TablePageClient] Error handling player action:', {
        actionId,
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
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
      ) : tableState.phase === 'waiting' ? (
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
          currentPlayerId={user?.uid}
          onPlayerAction={handlePlayerAction}
          onStartGame={tableState.phase === 'waiting' ? handleStartGame : undefined}
          isStartingGame={isStartingGame}
          hasEnoughPlayers={hasEnoughPlayers}
        />
      )}
    </div>
  );
}; 