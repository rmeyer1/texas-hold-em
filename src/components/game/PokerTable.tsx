import React from 'react';
import { Table, Player } from '@/types/poker';
import { PlayerPosition } from './PlayerPosition';
import { CommunityCards } from './CommunityCards';
import { TurnTimer } from '../TurnTimer';

interface PokerTableProps {
  table: Partial<Table>;
  currentPlayerId?: string;
  onPlayerAction?: (action: 'fold' | 'check' | 'call' | 'raise', amount?: number) => void;
  onStartGame?: () => void;
  isStartingGame?: boolean;
  hasEnoughPlayers?: boolean;
}

export const PokerTable: React.FC<PokerTableProps> = ({
  table,
  currentPlayerId,
  onPlayerAction,
  onStartGame,
  isStartingGame = false,
  hasEnoughPlayers = false,
}) => {
  const isValidTable = (table: Partial<Table>): { 
    isValid: boolean; 
    errors: string[]; 
    sanitizedTable?: Table 
  } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Critical validation - these must be present
    if (!table) {
      errors.push('Table object is undefined');
      return { isValid: false, errors };
    }

    if (!table.id) {
      errors.push('Table ID is required');
    }

    if (!Array.isArray(table.players)) {
      errors.push('Players array is required');
    }

    // If critical validations fail, return early
    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Create sanitized table with defaults
    const sanitizedTable: Table = {
      id: table.id!,
      players: table.players!,
      phase: table.phase || 'waiting',
      currentBet: table.currentBet || 0,
      pot: table.pot || 0,
      communityCards: Array.isArray(table.communityCards) ? table.communityCards : [],
      dealerPosition: table.dealerPosition || 0,
      currentPlayerIndex: table.currentPlayerIndex || 0,
      smallBlind: table.smallBlind || 10,
      bigBlind: table.bigBlind || 20,
      lastActionTimestamp: table.lastActionTimestamp || Date.now(),
      bettingRound: table.bettingRound || 'first_round',
      roundBets: table.roundBets || {},
      minRaise: table.minRaise || table.bigBlind || 20,
      turnTimeLimit: table.turnTimeLimit || 30,
      isHandInProgress: table.isHandInProgress || false,
      activePlayerCount: table.activePlayerCount || table.players!.filter(p => p.isActive).length,
      lastAction: table.lastAction || null,
      lastActivePlayer: table.lastActivePlayer || null,
      isPrivate: table.isPrivate || false,
      password: table.password || null,
    };

    // Non-critical validation - these will generate warnings
    if (typeof table.phase !== 'string') {
      warnings.push('Game phase is missing, defaulting to "waiting"');
    }

    if (typeof table.currentBet !== 'number') {
      warnings.push('Current bet amount is missing, defaulting to 0');
    }

    if (typeof table.pot !== 'number') {
      warnings.push('Pot amount is missing, defaulting to 0');
    }

    if (!Array.isArray(table.communityCards)) {
      warnings.push('Community cards array is missing, defaulting to empty array');
    }

    if (typeof table.dealerPosition !== 'number') {
      warnings.push('Dealer position is missing, defaulting to 0');
    }

    // Log warnings for debugging but don't prevent rendering
    if (warnings.length > 0) {
      const warningData = {
        warnings,
        tableState: {
          id: table.id,
          phase: table.phase,
          playerCount: table.players?.length ?? 0,
          activePlayers: table.players?.filter(p => p.isActive).length ?? 0,
          currentPlayerIndex: table.currentPlayerIndex,
          pot: table.pot,
          currentBet: table.currentBet,
          isHandInProgress: table.isHandInProgress,
          lastAction: table.lastAction,
          lastActivePlayer: table.lastActivePlayer
        },
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n')
      };

      console.warn('Table state warnings:', JSON.stringify(warningData, null, 2));
    }

    return { 
      isValid: true, 
      errors: [], 
      sanitizedTable 
    };
  };

  const validationResult = isValidTable(table);
  if (!validationResult.isValid) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center bg-red-100 rounded-lg p-4">
        <div className="text-red-600 text-lg font-semibold mb-2">
          Invalid table state
        </div>
        <div className="text-red-500 text-sm">
          {validationResult.errors.map((error, index) => (
            <div key={index} className="mb-1">• {error}</div>
          ))}
        </div>
        <button 
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          onClick={() => window.location.reload()}
        >
          Refresh Page
        </button>
      </div>
    );
  }

  // Use sanitized table with defaults
  const sanitizedTable = validationResult.sanitizedTable!;
  
  // Safe property access using sanitized table
  const players = sanitizedTable.players;
  const currentPlayer = currentPlayerId 
    ? players.find((p) => p?.id === currentPlayerId)
    : undefined;
  const pot = sanitizedTable.pot;
  const currentBet = sanitizedTable.currentBet;
  const dealerPosition = sanitizedTable.dealerPosition;
  const phase = sanitizedTable.phase;
  const communityCards = sanitizedTable.communityCards;
  const isHandInProgress = sanitizedTable.isHandInProgress;

  // Validate that all players have the required properties
  const validPlayers = players.filter((player): player is Player => {
    return Boolean(
      player &&
      player.id &&
      player.name &&
      typeof player.chips === 'number' &&
      typeof player.position === 'number' &&
      typeof player.isActive === 'boolean' &&
      typeof player.hasFolded === 'boolean'
    );
  });

  return (
    <div className="relative w-full max-w-6xl mx-auto">
      {/* Start Game Button - Moved outside table container for cleaner layout */}
      {!isHandInProgress && onStartGame && (
        <div className="w-full flex justify-center mb-8">
          <button
            onClick={onStartGame}
            disabled={isStartingGame || !hasEnoughPlayers}
            className={`
              px-6 py-3 rounded-lg text-lg font-semibold shadow-lg
              transition-all duration-200
              ${isStartingGame || !hasEnoughPlayers
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 active:transform active:scale-95'
              }
              text-white
            `}
          >
            {isStartingGame ? (
              <>
                <span className="animate-pulse">Starting Game...</span>
              </>
            ) : !hasEnoughPlayers ? (
              'Waiting for Players...'
            ) : (
              'Start Game'
            )}
          </button>
        </div>
      )}

      {/* Table Container - Restored aspect ratio and added explicit height */}
      <div className="relative w-full aspect-[2/1] h-[600px]">
        {/* Table background */}
        <div className="absolute inset-0 bg-green-800 rounded-[40%] shadow-xl border-8 border-brown-800">
          {/* Pot display - Adjusted positioning */}
          <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="text-white text-xl font-bold mb-2">Pot: ${pot}</div>
          </div>

          {/* Community cards - Adjusted positioning */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
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
              table={sanitizedTable}
            />
          ))}
        </div>

        {/* Action buttons for current player */}
        {currentPlayerId && currentPlayer && !currentPlayer.hasFolded && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-4">
            <div className="flex gap-2">
              <button
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onPlayerAction?.('fold')}
                disabled={!onPlayerAction || currentPlayer.hasFolded}
              >
                Fold
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onPlayerAction?.('check')}
                disabled={!onPlayerAction || currentBet > 0}
              >
                Check
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onPlayerAction?.('call')}
                disabled={!onPlayerAction || currentBet === 0}
              >
                Call ${currentBet}
              </button>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="w-20 px-2 py-1 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Amount"
                  min={currentBet * 2}
                  max={currentPlayer.chips}
                  disabled={!onPlayerAction || currentPlayer.chips < currentBet * 2}
                />
                <button
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
                    const amount = parseInt(input.value);
                    if (amount && amount >= currentBet * 2) {
                      onPlayerAction?.('raise', amount);
                    }
                  }}
                  disabled={!onPlayerAction || currentPlayer.chips < currentBet * 2}
                >
                  Raise
                </button>
              </div>
            </div>
            
            {/* Turn Timer */}
            <div className="flex justify-center">
              <TurnTimer table={sanitizedTable} isCurrentPlayer={true} />
            </div>
          </div>
        )}

        {/* Game phase indicator */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white text-lg font-semibold">
          {phase.charAt(0).toUpperCase() + phase.slice(1)}
        </div>

        {/* Last action display */}
        {sanitizedTable.lastAction && sanitizedTable.lastActivePlayer && (
          <div className="absolute top-4 right-4 text-white text-sm">
            {typeof sanitizedTable.lastActivePlayer === 'string' 
              ? sanitizedTable.lastActivePlayer 
              : players.find(p => p.id === sanitizedTable.lastActivePlayer)?.name}: {sanitizedTable.lastAction}
          </div>
        )}
      </div>
    </div>
  );
}; 