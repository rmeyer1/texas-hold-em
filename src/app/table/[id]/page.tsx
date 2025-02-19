'use client';

import React, { useEffect, useState } from 'react';
import { GameManager } from '@/utils/gameManager';
import { PokerTable } from '@/components/game/PokerTable';
import { Table } from '@/types/poker';

interface PageProps {
  params: {
    id: string;
  };
}

export default function TablePage({ params }: PageProps): React.ReactElement {
  const [gameManager] = useState(() => new GameManager(params.id));
  const [tableState, setTableState] = useState<Table>(gameManager.getTableState());
  const [currentPlayerId, setCurrentPlayerId] = useState<string>();

  // Initialize the game with some mock players
  useEffect(() => {
    // Add some mock players
    gameManager.addPlayer({
      id: '1',
      name: 'Player 1',
      chips: 1000,
      position: 0,
    });

    gameManager.addPlayer({
      id: '2',
      name: 'Player 2',
      chips: 1500,
      position: 1,
    });

    gameManager.addPlayer({
      id: '3',
      name: 'Player 3',
      chips: 2000,
      position: 2,
    });

    // Set the current player (for demo purposes)
    setCurrentPlayerId('1');

    // Start a new hand
    gameManager.startNewHand();

    // Update the table state
    setTableState(gameManager.getTableState());
  }, [gameManager]);

  const handlePlayerAction = (action: 'fold' | 'check' | 'call' | 'raise', amount?: number): void => {
    switch (action) {
      case 'fold':
        gameManager.foldPlayer(currentPlayerId!);
        break;
      case 'check':
        // No bet needed for check
        break;
      case 'call':
        gameManager.placeBet(currentPlayerId!, tableState.currentBet);
        break;
      case 'raise':
        if (amount) {
          gameManager.placeBet(currentPlayerId!, amount);
        }
        break;
    }

    // For demo purposes, advance the game state after each action
    if (tableState.phase === 'preflop') {
      gameManager.dealFlop();
    } else if (tableState.phase === 'flop') {
      gameManager.dealTurn();
    } else if (tableState.phase === 'turn') {
      gameManager.dealRiver();
    } else if (tableState.phase === 'river') {
      const winners = gameManager.getWinners();
      console.log('Winners:', winners);
      // Start a new hand after a delay
      setTimeout(() => {
        gameManager.startNewHand();
      }, 3000);
    }

    // Update the table state
    setTableState(gameManager.getTableState());
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <PokerTable
        table={tableState}
        currentPlayerId={currentPlayerId}
        onPlayerAction={handlePlayerAction}
      />
    </div>
  );
} 