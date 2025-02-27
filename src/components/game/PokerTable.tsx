import React, { useEffect, useState } from 'react';
import { Table, Player } from '@/types/poker';
import { PlayerPosition } from './PlayerPosition';
import { CommunityCards } from './CommunityCards';
import { TurnTimer } from '../TurnTimer';
import { getDatabase, ref, update, get } from 'firebase/database';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';

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
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState<number>(0);
  
  // Check if we're on mobile when component mounts
  useEffect(() => {
    const checkIfMobile = (): void => {
      setIsMobile(window.innerWidth < 640);
    };
    
    // Initial check
    checkIfMobile();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

  // Effect to ensure username is up to date in the table
  useEffect(() => {
    if (!user || !currentPlayerId || !user.displayName || !table?.id) return;

    const refreshUsername = async (): Promise<void> => {
      try {
        const database = getDatabase();
        const tablePath = `tables/${table.id}`;
        const tableRef = ref(database, tablePath);
        
        // Get the current table data
        const snapshot = await get(tableRef);
        if (!snapshot.exists()) return;
        
        const tableData = snapshot.val();
        
        // Find the player in the table
        const playerIndex = tableData.players.findIndex((player: { id: string }) => player.id === currentPlayerId);
        
        if (playerIndex !== -1) {
          // Check if the name needs to be updated
          if (tableData.players[playerIndex].name !== user.displayName) {
            logger.log(`Auto-refreshing player name to "${user.displayName}" in table ${table.id}`);
            
            // Create an update object with the path as key and new name as value
            const updates: Record<string, string> = {};
            // Ensure displayName is not null (we already check this in the useEffect guard)
            updates[`${tablePath}/players/${playerIndex}/name`] = user.displayName || 'Player';
            
            await update(ref(database), updates);
            logger.log(`Successfully refreshed player name in table ${table.id}`);
          }
        }
      } catch (error) {
        logger.error(`Error refreshing player name in table ${table.id}:`, {
          error: serializeError(error),
          timestamp: new Date().toISOString()
        });
      }
    };

    refreshUsername();
  }, [user, currentPlayerId, table?.id]);

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

    // Ensure community cards is always an array
    const communityCards = Array.isArray(table.communityCards) ? table.communityCards : [];

    // Create sanitized table with defaults
    const sanitizedTable: Table = {
      id: table.id!,
      players: table.players!,
      phase: table.phase || 'waiting',
      currentBet: table.currentBet || 0,
      pot: table.pot || 0,
      communityCards,
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
      lastBettor: table.lastBettor || null,
      isPrivate: table.isPrivate || false,
      password: table.password || null,
      handId: table.handId || '',
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

      logger.warn('Table state warnings:', warningData);
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
  
  // Get the active player (whose turn it is)
  const activePlayerIndex = sanitizedTable.currentPlayerIndex;
  const activePlayer = activePlayerIndex >= 0 && activePlayerIndex < players.length 
    ? players[activePlayerIndex] 
    : undefined;
  
  // Check if it's the authenticated user's turn
  const isPlayerTurn = currentPlayerId && 
    activePlayer && 
    activePlayer.id === currentPlayerId;
    
  // Debug log for player turn
  if (currentPlayerId) {
    logger.log('[PokerTable] Player turn check:', {
      isPlayerTurn,
      currentPlayerId,
      activePlayerIndex,
      activePlayerId: activePlayer?.id,
      match: activePlayer?.id === currentPlayerId,
      timestamp: new Date().toISOString(),
    });
  }

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

  // Calculate current player's bet
  const playerBet = currentPlayerId && sanitizedTable.roundBets 
    ? (sanitizedTable.roundBets[currentPlayerId] || 0) 
    : 0;

  return (
    <div className="relative w-full max-w-6xl mx-auto">
      {/* TEXAS HOLD'EM Title - Centered above the table */}
      <div className="w-full text-center mb-4">
        <h1 className="text-3xl font-bold text-white tracking-wider">TEXAS HOLD'EM</h1>
      </div>
      
      {/* Game status bar - Contains phase and pot information */}
      <div className="w-full flex justify-between items-center mb-2 px-1 sm:px-2">
        {/* Game phase indicator */}
        <div className="text-white font-bold bg-black/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg backdrop-blur-sm flex items-center justify-center">
          <span className="text-xs sm:text-sm md:text-base lg:text-lg whitespace-nowrap">
            {phase.charAt(0).toUpperCase() + phase.slice(1)}
          </span>
        </div>
        
        {/* Pot display */}
        <div className="text-white font-bold bg-black/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg backdrop-blur-sm flex items-center justify-center">
          <span className="text-xs sm:text-sm md:text-base lg:text-lg whitespace-nowrap">
            Pot: ${pot}
          </span>
        </div>
      </div>
      
      {/* Start Game Button - Moved outside table container for cleaner layout */}
      {!isHandInProgress && onStartGame && (
        <div className="w-full flex justify-center mb-4 sm:mb-8">
          <button
            onClick={onStartGame}
            disabled={isStartingGame || !hasEnoughPlayers}
            className={`
              px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-lg font-semibold shadow-lg
              transition-all duration-200
              ${isStartingGame || !hasEnoughPlayers
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:transform active:scale-95'
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

      {/* Table Container */}
      <div className="relative w-full aspect-[2/1] h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px]">
        {/* Table background - Updated with modern gradient and shadow */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900 to-blue-950 rounded-[40%] shadow-2xl border-4 border-blue-800">
          {/* Inner felt texture */}
          <div className="absolute inset-[4px] bg-gradient-to-b from-teal-800 to-teal-900 rounded-[39%]">
            {/* Table rim highlight */}
            <div className="absolute inset-0 rounded-[39%] bg-gradient-to-t from-transparent to-teal-700 opacity-20"></div>
            
            {/* Community cards - Adjusted positioning for better mobile display */}
            <div className="absolute top-[30%] sm:top-[40%] md:top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 scale-[0.7] sm:scale-[0.8] md:scale-[0.9] lg:scale-100">
              <CommunityCards cards={communityCards} phase={phase} />
            </div>

            {/* Players - With improved mobile positioning */}
            <div className="absolute inset-0">
              {validPlayers.map((player, index) => (
                <PlayerPosition
                  key={player.id}
                  player={player}
                  isDealer={index === dealerPosition}
                  isCurrentPlayer={index === activePlayerIndex}
                  position={index}
                  totalPlayers={validPlayers.length}
                  table={sanitizedTable}
                  isMobile={isMobile}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons and timer for current player - Enhanced styling */}
      {currentPlayerId && currentPlayer && !currentPlayer.hasFolded && (
        <div className="mt-4 sm:mt-6 md:mt-8 flex flex-col items-center gap-1 sm:gap-2 p-2 sm:p-3 bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl shadow-2xl border border-gray-700">
          {/* Turn indicator */}
          <div className="text-center mb-0 sm:mb-1">
            {isPlayerTurn ? (
              <div className="text-yellow-400 font-bold text-sm sm:text-lg animate-pulse">
                Your Turn
              </div>
            ) : (
              <div className="text-gray-400 text-sm sm:text-lg">
                Waiting for your turn...
              </div>
            )}
          </div>
          
          {/* Reorganized layout - Action buttons and timer in a single row */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {/* Action buttons */}
            <div className="flex flex-wrap justify-center gap-1 sm:gap-2">
              <button
                onClick={() => onPlayerAction && onPlayerAction('fold')}
                disabled={!isPlayerTurn}
                className={`px-3 sm:px-4 py-1 sm:py-2 rounded-md text-xs sm:text-base font-semibold ${
                  isPlayerTurn
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                }`}
              >
                Fold
              </button>
              <button
                onClick={() => onPlayerAction && onPlayerAction('check')}
                disabled={!isPlayerTurn || (currentBet > playerBet)}
                className={`px-3 sm:px-4 py-1 sm:py-2 rounded-md text-xs sm:text-base font-semibold ${
                  isPlayerTurn && (currentBet <= playerBet)
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                }`}
              >
                Check
              </button>
              <button
                onClick={() => onPlayerAction && onPlayerAction('call')}
                disabled={!isPlayerTurn || (currentBet <= playerBet)}
                className={`px-3 sm:px-4 py-1 sm:py-2 rounded-md text-xs sm:text-base font-semibold ${
                  isPlayerTurn && (currentBet > playerBet)
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                }`}
              >
                Call ${currentBet - playerBet}
              </button>
            </div>
            
            {/* Raise controls */}
            <div className="flex items-center gap-1 sm:gap-2">
              <input
                type="number"
                min={sanitizedTable.minRaise}
                max={currentPlayer.chips}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Math.max(sanitizedTable.minRaise, Math.min(currentPlayer.chips, parseInt(e.target.value) || 0)))}
                disabled={!isPlayerTurn}
                className="w-16 sm:w-24 px-2 py-1 sm:py-2 rounded-md text-xs sm:text-base bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Amount"
              />
              <button
                onClick={() => onPlayerAction && onPlayerAction('raise', raiseAmount)}
                disabled={!isPlayerTurn || raiseAmount < sanitizedTable.minRaise}
                className={`px-3 sm:px-4 py-1 sm:py-2 rounded-md text-xs sm:text-base font-semibold ${
                  isPlayerTurn && raiseAmount >= sanitizedTable.minRaise
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
                    : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                }`}
              >
                Raise
              </button>
            </div>
            
            {/* Turn timer */}
            {isPlayerTurn && (
              <div className="ml-1 sm:ml-2">
                <TurnTimer
                  table={sanitizedTable}
                  isCurrentPlayer={true}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}; 