'use client';

import React, { useEffect, useState } from 'react';
import { GameManager } from '@/services/gameManager';
import { PokerTable } from '@/components/game/PokerTable';
import { Table } from '@/types/poker';
import { useAuth } from '@/contexts/AuthContext';

interface TablePageClientProps {
  tableId: string;
}

export const TablePageClient = ({ tableId }: TablePageClientProps): React.ReactElement => {
  const { user } = useAuth();
  const [gameManager] = useState(() => new GameManager(tableId));
  const [tableState, setTableState] = useState<Table | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      // Redirect to sign in if not authenticated
      window.location.href = '/auth/signin';
      return;
    }

    const initializeGame = async (): Promise<void> => {
      try {
        // Reset table state first
        await gameManager.initialize(); // Already resets to empty players array
        
        // Add mock players with user-based IDs
        const userId = user.uid;
        const playersToAdd = [
          { id: userId, name: 'Player 1', chips: 1000, position: 0 },
          { id: `${userId}-2`, name: 'Player 2', chips: 1500, position: 1 },
          { id: `${userId}-3`, name: 'Player 3', chips: 2000, position: 2 },
        ];
  
        for (const player of playersToAdd) {
          await gameManager.addPlayer(player);
        }
  
        await gameManager.startNewHand();
        const initialState = await gameManager.getTableState();
        setTableState(initialState);
        if (initialState?.players && initialState.currentPlayerIndex >= 0) {
          setCurrentPlayerId(initialState.players[initialState.currentPlayerIndex].id);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing game:', error);
        setIsLoading(false);
      }
    };
  
    const unsubscribe = gameManager.subscribeToTableState((table) => {
      setTableState(table);
      if (table?.players && table.currentPlayerIndex >= 0) {
        setCurrentPlayerId(table.players[table.currentPlayerIndex].id);
      }
    });
  
    initializeGame().catch(console.error);
    return () => unsubscribe();
  }, [gameManager, user]);

  const handlePlayerAction = async (
    action: 'fold' | 'check' | 'call' | 'raise',
    amount?: number
  ): Promise<void> => {
    if (!tableState || !currentPlayerId) return;

    try {
      switch (action) {
        case 'fold':
          await gameManager.foldPlayer(currentPlayerId);
          break;
        case 'check':
          // No bet needed for check
          break;
        case 'call':
          await gameManager.placeBet(currentPlayerId, tableState.currentBet);
          break;
        case 'raise':
          if (amount) {
            await gameManager.placeBet(currentPlayerId, amount);
          }
          break;
      }

      // For demo purposes, advance the game state after each action
      if (tableState.phase === 'preflop') {
        await gameManager.dealFlop();
      } else if (tableState.phase === 'flop') {
        await gameManager.dealTurn();
      } else if (tableState.phase === 'turn') {
        await gameManager.dealRiver();
      } else if (tableState.phase === 'river') {
        // Start a new hand after a delay
        setTimeout(async () => {
          await gameManager.startNewHand();
        }, 3000);
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
      <PokerTable
        table={tableState}
        currentPlayerId={currentPlayerId}
        onPlayerAction={handlePlayerAction}
      />
    </div>
  );
}; 