import React, { useEffect, useState, useMemo } from 'react';
import { Table, Player } from '@/types/poker';
import { PlayerPosition } from './PlayerPosition';
import { CommunityCards } from './CommunityCards';
import { WinnerDisplay } from './WinnerDisplay';
import { TurnTimer } from '../TurnTimer';
import { useAuth } from '@/contexts/AuthContext';
import { GameManager } from '@/services/gameManager';
import logger from '@/utils/logger';

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
  const [localTable, setLocalTable] = useState<Table | null>(null);
  const [validationError, setValidationError] = useState<string[]>([]);
  const gameManager = useMemo(() => {
    if (!table.id) {
      logger.error('[PokerTable] Cannot initialize GameManager: table.id is undefined');
      return null;
    }
    return new GameManager(table.id);
  }, [table.id]);

  const isValidTable = (tableData: Partial<Table>): { isValid: boolean; errors: string[]; sanitizedTable?: Table } => {
    if (!tableData) {
      return { isValid: false, errors: ['Table data is undefined'] };
    }
    
    const errors: string[] = [];
    
    if (!tableData.id) errors.push('Table ID is missing');
    if (!Array.isArray(tableData.players)) errors.push('Players array is missing or invalid');
    if (typeof tableData.pot !== 'number') errors.push('Pot value is invalid');
    if (typeof tableData.currentBet !== 'number') errors.push('Current bet value is invalid');
    if (typeof tableData.dealerPosition !== 'number') errors.push('Dealer position is invalid');
    if (typeof tableData.phase !== 'string') errors.push('Game phase is invalid');
    
    if (errors.length > 0) {
      return { isValid: false, errors };
    }
    
    // Ensure all required properties have default values
    const sanitizedTable = {
      ...tableData,
      players: tableData.players || [],
      roundBets: tableData.roundBets || {},
      communityCards: tableData.communityCards || [],
      isHandInProgress: tableData.isHandInProgress || false,
      currentPlayerIndex: tableData.currentPlayerIndex || 0,
    } as Table;
    
    return { isValid: true, errors: [], sanitizedTable };
  };

  useEffect(() => {
    const checkIfMobile = (): void => {
      setIsMobile(window.innerWidth < 640);
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  useEffect(() => {
    const validationResult = isValidTable(table);
    if (validationResult.isValid && validationResult.sanitizedTable) {
      setLocalTable(validationResult.sanitizedTable);
      setValidationError([]);
      if (user && currentPlayerId && user.displayName && table.id) {
        gameManager?.refreshPlayerUsername(currentPlayerId, user.displayName);
      }
    } else {
      setValidationError(validationResult.errors);
    }
  }, [user, currentPlayerId, table, gameManager]);

  const handleAction = (action: 'fold' | 'check' | 'call' | 'raise', amount?: number) => {
    const validAmount = action === 'check' ? 0 : amount;
    
    logger.log('[PokerTable] handleAction called:', { action, validAmount });
    if (!onPlayerAction || !localTable || !currentPlayerId) {
      logger.log('[PokerTable] handleAction aborted:', { onPlayerAction: !!onPlayerAction, localTable: !!localTable, currentPlayerId });
      return;
    }
  
    setLocalTable(prev => {
      if (!prev) return prev;
      const newTable = { ...prev };
      const player = newTable.players.find(p => p.id === currentPlayerId)!;
      if (!player) return prev;
  
      switch (action) {
        case 'fold':
          player.hasFolded = true;
          break;
        case 'check':
          newTable.roundBets[currentPlayerId] = newTable.roundBets[currentPlayerId] || 0;
          break;
        case 'call':
          const callAmount = newTable.currentBet - (newTable.roundBets[currentPlayerId] || 0);
          player.chips -= callAmount;
          newTable.pot += callAmount;
          newTable.roundBets[currentPlayerId] = newTable.currentBet;
          break;
        case 'raise':
          const raiseBet = validAmount! - (newTable.roundBets[currentPlayerId] || 0);
          player.chips -= raiseBet;
          newTable.pot += raiseBet;
          newTable.roundBets[currentPlayerId] = validAmount!;
          newTable.currentBet = validAmount!;
          newTable.minRaise = validAmount! * 2;
          newTable.lastBettor = currentPlayerId;
          break;
      }
      newTable.lastAction = action;
      newTable.lastActivePlayer = currentPlayerId;
      if (action === 'check' && newTable.currentBet === 0) {
        newTable.currentPlayerIndex = (newTable.currentPlayerIndex + 1) % newTable.players.length;
      }
      logger.log('[PokerTable] Updated localTable:', { currentPlayerIndex: newTable.currentPlayerIndex });
      return newTable;
    });
  
    onPlayerAction(action, validAmount);
    logger.log('[PokerTable] handleAction completed');
  };

  if (validationError.length > 0) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-md">
        Invalid table data: {validationError.join(', ')}. Please try refreshing the page.
      </div>
    );
  }

  const displayTable = localTable || (table as Table);
  if (!displayTable || !displayTable.players) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-md">
        Invalid table data: Missing players array. Please try refreshing the page.
      </div>
    );
  }
  const players = displayTable.players;
  const currentPlayer = currentPlayerId ? players.find((p) => p?.id === currentPlayerId) : null;
  const pot = displayTable.pot;
  const currentBet = displayTable.currentBet;
  const dealerPosition = displayTable.dealerPosition;
  const phase = displayTable.phase;
  const communityCards = displayTable.communityCards;
  const isHandInProgress = displayTable.isHandInProgress;
  const activePlayerIndex = displayTable.currentPlayerIndex;
  const activePlayer = activePlayerIndex >= 0 && activePlayerIndex < players.length ? players[activePlayerIndex] : undefined;
  const isPlayerTurn = currentPlayerId && activePlayer && activePlayer.id === currentPlayerId;

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

  const playerBet = currentPlayerId && displayTable.roundBets ? (displayTable.roundBets[currentPlayerId] || 0) : 0;

  return (
    <div className="relative w-full max-w-6xl mx-auto">
      <div className="w-full text-center mb-4">
        <h1 className="text-3xl font-bold text-white tracking-wider">TEXAS HOLD'EM</h1>
      </div>
      
      <div className="w-full flex justify-between items-center mb-2 px-1 sm:px-2">
        <div className="text-white font-bold bg-black/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg backdrop-blur-sm flex items-center justify-center">
          <span className="text-xs sm:text-sm md:text-base lg:text-lg whitespace-nowrap">
            {phase.charAt(0).toUpperCase() + phase.slice(1)}
          </span>
        </div>
        <div className="text-white font-bold bg-black/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg backdrop-blur-sm flex items-center justify-center">
          <span className="text-xs sm:text-sm md:text-base lg:text-lg whitespace-nowrap">
            Pot: ${pot}
          </span>
        </div>
      </div>
      
      {!isHandInProgress && onStartGame && (
        <div className="w-full flex justify-center mb-4 sm:mb-8">
          <button
            onClick={onStartGame}
            disabled={isStartingGame || !hasEnoughPlayers}
            className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-lg font-semibold shadow-lg transition-all duration-200 ${isStartingGame || !hasEnoughPlayers ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:transform active:scale-95'} text-white`}
          >
            {isStartingGame ? <span className="animate-pulse">Starting Game...</span> : !hasEnoughPlayers ? 'Waiting for Players...' : 'Start Game'}
          </button>
        </div>
      )}

      <div className="relative w-full aspect-[2/1] h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px]">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900 to-blue-950 rounded-[40%] shadow-2xl border-4 border-blue-800">
          <div className="absolute inset-[4px] bg-gradient-to-b from-teal-800 to-teal-900 rounded-[39%]">
            <div className="absolute inset-0 rounded-[39%] bg-gradient-to-t from-transparent to-teal-700 opacity-20"></div>
            <div className="absolute top-[30%] sm:top-[40%] md:top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 scale-[0.7] sm:scale-[0.8] md:scale-[0.9] lg:scale-100">
              {phase === 'showdown' && displayTable.winners && displayTable.winners.length > 0 && displayTable.winningAmount ? (
                <WinnerDisplay 
                  winnerNames={displayTable.winners.map(winnerId => {
                    const player = players.find(p => p.id === winnerId);
                    return player?.name || 'Unknown Player';
                  })}
                  winningAmount={displayTable.winningAmount}
                  winningHands={displayTable.winningHands}
                />
              ) : (
                ['flop', 'turn', 'river'].includes(phase.toLowerCase()) && (
                  <CommunityCards cards={displayTable.communityCards} phase={phase} />
                )
              )}
            </div>
            <div className="absolute inset-0">
              {validPlayers.map((player, index) => (
                <PlayerPosition
                  key={player.id}
                  player={player}
                  isDealer={index === dealerPosition}
                  isCurrentPlayer={index === activePlayerIndex}
                  position={index}
                  totalPlayers={validPlayers.length}
                  table={displayTable}
                  isMobile={isMobile}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {currentPlayerId && currentPlayer && !currentPlayer.hasFolded && (
        <div className="mt-4 sm:mt-6 md:mt-8 flex flex-col items-center gap-3 p-3 bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl shadow-2xl border border-gray-700">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center justify-center px-3 py-1 rounded-md text-sm font-bold bg-gray-800 text-green-400 border border-gray-700">
              Chips: ${currentPlayer.chips}
            </div>
            
            <div className="text-center">
              {isPlayerTurn ? (
                <div className="text-yellow-400 font-bold text-sm md:text-lg animate-pulse">Your Turn</div>
              ) : (
                <div className="text-gray-400 text-sm md:text-lg">Waiting for your turn...</div>
              )}
            </div>
            
            <div className="w-[120px]"></div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            <button
              onClick={() => handleAction('fold')}
              disabled={!isPlayerTurn}
              className={`px-3 py-2 rounded-md text-sm font-semibold ${isPlayerTurn ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}
            >
              Fold
            </button>
            
            <button
              onClick={() => handleAction('check')}
              disabled={!isPlayerTurn || (currentBet > playerBet)}
              className={`px-3 py-2 rounded-md text-sm font-semibold ${isPlayerTurn && (currentBet <= playerBet) ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}
            >
              Check
            </button>
            
            <button
              onClick={() => handleAction('call')}
              disabled={!isPlayerTurn || (currentBet <= playerBet)}
              className={`px-3 py-2 rounded-md text-sm font-semibold ${isPlayerTurn && (currentBet > playerBet) ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}
            >
              Call ${Math.max(0, currentBet - playerBet)}
            </button>
            
            <input
              type="number"
              min={displayTable.minRaise}
              max={currentPlayer.chips}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(Math.max(displayTable.minRaise, Math.min(currentPlayer.chips, parseInt(e.target.value) || 0)))}
              disabled={!isPlayerTurn}
              className="w-20 px-2 py-2 rounded-md text-sm bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Amount"
            />
            
            <button
              onClick={() => handleAction('raise', raiseAmount)}
              disabled={!isPlayerTurn || raiseAmount < displayTable.minRaise}
              className={`px-3 py-2 rounded-md text-sm font-semibold ${isPlayerTurn && raiseAmount >= displayTable.minRaise ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' : 'bg-gray-600 text-gray-300 cursor-not-allowed'}`}
            >
              Raise
            </button>
          </div>
          
          {isPlayerTurn && (
            <div className="flex justify-center w-full">
              <TurnTimer table={displayTable} isCurrentPlayer={true} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};