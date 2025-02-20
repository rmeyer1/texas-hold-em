import React from 'react';
import { Table, Player } from '@/types/poker';
import { PlayerPosition } from './PlayerPosition';
import { CommunityCards } from './CommunityCards';
import { TurnTimer } from '../TurnTimer';

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
  // Ensure table and its properties exist
  const players = table?.players || [];
  const currentPlayer = currentPlayerId ? players.find((p) => p?.id === currentPlayerId) : undefined;
  const pot = table?.pot || 0;
  const currentBet = table?.currentBet || 0;
  const dealerPosition = table?.dealerPosition || 0;
  const phase = table?.phase || 'preflop';
  const communityCards = table?.communityCards || [];

  // Validate that all players have the required properties
  const validPlayers = players.filter((player): player is Player => {
    return Boolean(
      player &&
      player.id &&
      player.name &&
      typeof player.chips === 'number' &&
      Array.isArray(player.holeCards) &&
      typeof player.position === 'number' &&
      typeof player.isActive === 'boolean' &&
      typeof player.hasFolded === 'boolean'
    );
  });

  return (
    <div className="relative w-full max-w-6xl aspect-[2/1] mx-auto">
      {/* Table background */}
      <div className="absolute inset-0 bg-green-800 rounded-[40%] shadow-xl border-8 border-brown-800">
        {/* Pot display */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="text-white text-xl font-bold mb-2">Pot: ${pot}</div>
        </div>

        {/* Community cards */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <CommunityCards cards={communityCards} phase={phase} />
        </div>

        {/* Players */}
        {validPlayers.map((player, index) => (
          <PlayerPosition
            key={player.id}
            player={player}
            isDealer={index === dealerPosition}
            isCurrentPlayer={player.id === currentPlayerId}
            position={index}
            totalPlayers={validPlayers.length}
            table={table}
          />
        ))}
      </div>

      {/* Action buttons for current player */}
      {currentPlayer && onPlayerAction && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-4">
          <div className="flex gap-2">
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
              disabled={currentBet > 0}
            >
              Check
            </button>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              onClick={() => onPlayerAction('call')}
              disabled={currentBet === 0}
            >
              Call ${currentBet}
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-20 px-2 py-1 rounded-lg"
                placeholder="Amount"
                min={currentBet * 2}
                max={currentPlayer.chips}
              />
              <button
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                onClick={() => {
                  const input = document.querySelector('input[type="number"]') as HTMLInputElement;
                  const amount = parseInt(input.value);
                  if (amount && amount >= currentBet * 2) {
                    onPlayerAction('raise', amount);
                  }
                }}
                disabled={currentPlayer.chips < currentBet * 2}
              >
                Raise
              </button>
            </div>
          </div>
          
          {/* Turn Timer */}
          <div className="flex justify-center">
            <TurnTimer table={table} isCurrentPlayer={true} />
          </div>
        </div>
      )}

      {/* Game phase indicator */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white text-lg font-semibold">
        {phase.charAt(0).toUpperCase() + phase.slice(1)}
      </div>
    </div>
  );
}; 