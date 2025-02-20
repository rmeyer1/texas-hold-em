'use client';

import React, { useEffect, useState } from 'react';
import { GameManager } from '@/utils/gameManager';
import { PokerTable } from '@/components/game/PokerTable';
import { Table } from '@/types/poker';

interface TablePageClientProps {
  tableId: string;
}

export const TablePageClient = ({ tableId }: TablePageClientProps): React.ReactElement => {
  const [gameManager] = useState(() => new GameManager(tableId));
  const [tableState, setTableState] = useState<Table>(() => gameManager.getTableState());
  const [currentPlayerId, setCurrentPlayerId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeGame = async (): Promise<void> => {
      try {
        await gameManager.initialize();

        // Add some mock players
        await gameManager.addPlayer({
          id: '1',
          name: 'Player 1',
          chips: 1000,
          position: 0,
        });

        await gameManager.addPlayer({
          id: '2',
          name: 'Player 2',
          chips: 1500,
          position: 1,
        });

        await gameManager.addPlayer({
          id: '3',
          name: 'Player 3',
          chips: 2000,
          position: 2,
        });

        // Set the current player (for demo purposes)
        setCurrentPlayerId('1');

        // Start a new hand
        await gameManager.startNewHand();

        // Get the initial table state after everything is set up
        const initialState = gameManager.getTableState();
        setTableState(initialState);
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing game:', error);
        setIsLoading(false);
      }
    };

    // Subscribe to table state changes
    const unsubscribe = gameManager.subscribeToTableState((table) => {
      setTableState(table);
    });

    // Initialize the game
    initializeGame().catch(console.error);

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [gameManager]);

  const handlePlayerAction = async (
    action: 'fold' | 'check' | 'call' | 'raise',
    amount?: number
  ): Promise<void> => {
    try {
      switch (action) {
        case 'fold':
          await gameManager.foldPlayer(currentPlayerId!);
          break;
        case 'check':
          // No bet needed for check
          break;
        case 'call':
          await gameManager.placeBet(currentPlayerId!, tableState.currentBet);
          break;
        case 'raise':
          if (amount) {
            await gameManager.placeBet(currentPlayerId!, amount);
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
        const winners = gameManager.evaluatePlayerHands();
        console.log('Winners:', winners);
        // Start a new hand after a delay
        setTimeout(async () => {
          await gameManager.startNewHand();
        }, 3000);
      }
    } catch (error) {
      console.error('Error handling player action:', error);
    }
  };

  if (isLoading) {
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