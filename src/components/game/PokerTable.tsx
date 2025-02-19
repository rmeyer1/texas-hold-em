import React from 'react';
import { Table, Player } from '@/types/poker';
import { PlayerPosition } from './PlayerPosition';
import { CommunityCards } from './CommunityCards';

interface PokerTableProps {
  table: Table;
  currentPlayerId?: string;
  onPlayerAction?: (action: 'fold' | 'check' | 'call' | 'raise', amount?: number) => void;
}

export const PokerTable: React.FC<PokerTableProps> = ({
  table,
  currentPlayerId,
  onPlayerAction,
}) => {
  const currentPlayer = table.players.find((p) => p.id === currentPlayerId);

  return (
    <div className="relative w-full max-w-6xl aspect-[2/1] mx-auto">
      {/* Table background */}
      <div className="absolute inset-0 bg-green-800 rounded-[40%] shadow-xl border-8 border-brown-800">
        {/* Pot display */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="text-white text-xl font-bold mb-2">Pot: ${table.pot}</div>
        </div>

        {/* Community cards */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <CommunityCards cards={table.communityCards} phase={table.phase} />
        </div>

        {/* Players */}
        {table.players.map((player, index) => (
          <PlayerPosition
            key={player.id}
            player={player}
            isDealer={index === table.dealerPosition}
            isCurrentPlayer={player.id === currentPlayerId}
            position={index}
            totalPlayers={table.players.length}
          />
        ))}
      </div>

      {/* Action buttons for current player */}
      {currentPlayer && onPlayerAction && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
          <button
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            onClick={() => onPlayerAction('fold')}
            disabled={currentPlayer.hasFolded}
          >
            Fold
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            onClick={() => onPlayerAction('check')}
            disabled={table.currentBet > 0}
          >
            Check
          </button>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            onClick={() => onPlayerAction('call')}
            disabled={table.currentBet === 0}
          >
            Call ${table.currentBet}
          </button>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="w-20 px-2 py-1 rounded-lg"
              placeholder="Amount"
              min={table.currentBet * 2}
              max={currentPlayer.chips}
            />
            <button
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              onClick={() => {
                const input = document.querySelector('input[type="number"]') as HTMLInputElement;
                const amount = parseInt(input.value);
                if (amount && amount >= table.currentBet * 2) {
                  onPlayerAction('raise', amount);
                }
              }}
              disabled={currentPlayer.chips < table.currentBet * 2}
            >
              Raise
            </button>
          </div>
        </div>
      )}

      {/* Game phase indicator */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded-full">
        {table.phase.charAt(0).toUpperCase() + table.phase.slice(1)}
      </div>
    </div>
  );
}; 