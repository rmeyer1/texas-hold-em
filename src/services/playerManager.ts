import type { Player, Table } from '@/types/poker';
import logger from '@/utils/logger';

export class PlayerManager {
  private tableId: string;

  constructor(tableId: string) {
    this.tableId = tableId;
  }

  /**
   * Get active players (not folded and with chips)
   */
  getActivePlayers(table: Table): Player[] {
    return table.players.filter(p => p.isActive && !p.hasFolded && p.chips > 0);
  }

  /**
   * Get the count of active players
   */
  getActiveCount(table: Table): number {
    return this.getActivePlayers(table).length;
  }

  /**
   * Find the next dealer position
   */
  nextDealer(table: Table): number {
    let pos = (table.dealerPosition + 1) % table.players.length;
    while (!table.players[pos].isActive || table.players[pos].chips <= 0) {
      pos = (pos + 1) % table.players.length;
      
      // Safety check to prevent infinite loop if no active players
      if (pos === table.dealerPosition) {
        logger.warn('[PlayerManager] No active players with chips found for next dealer');
        return table.dealerPosition;
      }
    }
    return pos;
  }

  /**
   * Find the next active player after the current one
   */
  getNextActivePlayerIndex(table: Table, currentIndex: number): number {
    const { players } = table;
    if (players.length === 0) return currentIndex;
    
    let nextIdx = (currentIndex + 1) % players.length;
    let loopCount = 0;
    
    while (!players[nextIdx].isActive || players[nextIdx].hasFolded || players[nextIdx].chips <= 0) {
      nextIdx = (nextIdx + 1) % players.length;
      loopCount++;
      if (loopCount >= players.length) {
        logger.warn('[PlayerManager] No active players found for next turn');
        return currentIndex;
      }
    }
    logger.log('[PlayerManager] getNextActivePlayerIndex:', { currentIndex, nextIdx });
    return nextIdx;
  }

  /**
   * Mark a player as folded
   */
  fold(table: Table, playerId: string): void {
    const player = table.players.find(p => p.id === playerId);
    if (player) {
      player.hasFolded = true;
    }
  }

  /**
   * Process a player's bet/raise
   */
  placeBet(table: Table, playerId: string, amount: number): number {
    const player = table.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    if (player.chips < amount) {
      throw new Error(`Player ${playerId} has insufficient chips (${player.chips}) for bet ${amount}`);
    }
    
    // Deduct chips from player
    player.chips -= amount;
    
    return amount;
  }

  /**
   * Check if a player is all-in
   */
  isPlayerAllIn(player: Player, roundBets: { [playerId: string]: number }): boolean {
    // Ensure roundBets is initialized
    if (!roundBets) {
      return false;
    }
    
    return player.chips === 0 && (roundBets[player.id] || 0) > 0;
  }

  /**
   * Reset players for a new hand
   */
  resetPlayers(table: Table): void {
    table.players.forEach(player => {
      if (player.isActive) {
        player.hasFolded = false;
        player.cards = undefined;
      }
    });
  }

  /**
   * Check if all active players have acted in the current round
   */
  haveAllPlayersActed(table: Table): boolean {
    try {
      const { players, currentPlayerIndex, currentBet, phase, lastActionTimestamp } = table;
      if (!table.roundBets) table.roundBets = {};
      
      // Log detailed state for debugging
      logger.log('[PlayerManager] haveAllPlayersActed detailed state:', { 
        phase,
        currentPlayerIndex,
        currentBet,
        lastAction: table.lastAction,
        lastActivePlayer: table.lastActivePlayer,
        lastBettor: table.lastBettor,
        roundBets: { ...table.roundBets },
        players: players.map(p => ({
          id: p.id,
          isActive: p.isActive,
          hasFolded: p.hasFolded,
          chips: p.chips,
          bet: table.roundBets[p.id] || 0
        }))
      });
      
      const activePlayers = this.getActivePlayers(table);
      if (activePlayers.length <= 1) {
        logger.log('[PlayerManager] haveAllPlayersActed: Only one active player');
        return true;
      }
    
      const allBetsMatch = activePlayers.every(p => (table.roundBets[p.id] || 0) === table.currentBet);
      logger.log('[PlayerManager] haveAllPlayersActed: Bets match:', allBetsMatch);
      if (!allBetsMatch) return false;
    
      if (currentBet === 0) {
        const firstToActIndex = this.getNextActivePlayerIndex(table, table.dealerPosition);
        const nextPlayerIndex = this.getNextActivePlayerIndex(table, currentPlayerIndex);
        logger.log('[PlayerManager] haveAllPlayersActed (no bet):', { 
          firstToActIndex, 
          nextPlayerIndex, 
          currentPlayerIndex, 
          activePlayers: activePlayers.length, 
          phase 
        });
        const hasAllActed = this.hasAllActedThisRound(table, currentPlayerIndex, table.lastActionTimestamp || Date.now());
        logger.log('[PlayerManager] haveAllPlayersActed: All acted this round:', hasAllActed);
        return hasAllActed;
      }
    
      if (table.lastBettor) {
        const lastBettorIndex = players.findIndex(p => p.id === table.lastBettor);
        if (lastBettorIndex === -1) {
          logger.warn('[PlayerManager] Last bettor not found');
          return false;
        }
        const nextPlayerIndex = this.getNextActivePlayerIndex(table, currentPlayerIndex);
        logger.log('[PlayerManager] haveAllPlayersActed (with bettor):', { nextPlayerIndex, lastBettorIndex });
        return nextPlayerIndex === lastBettorIndex;
      }
    
      logger.log('[PlayerManager] haveAllPlayersActed: All bets match, no last bettor');
      return true;
    } catch (error) {
      console.error('[PlayerManager] Error in haveAllPlayersActed:', error);
      logger.error('[PlayerManager] Error checking if all players have acted:', {
        error: typeof error === 'object' ? JSON.stringify(error) : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        tableId: table.id,
        phase: table.phase,
        currentPlayerIndex: table.currentPlayerIndex
      });
      // Default to false if there's an error to avoid accidentally advancing the phase
      return false;
    }
  }

  /**
   * Find the last player who placed a bet
   */
  findLastBettor(table: Table): Player | undefined {
    const { players, lastBettor } = table;
    
    if (!lastBettor) return undefined;
    
    const player = players.find(p => p.id === lastBettor);
    
    if (!player) {
      logger.warn('[PlayerManager] Last bettor not found in players array');
      return undefined;
    }
    
    return player;
  }

  // New helper method to track if all players acted this round
  private hasAllActedThisRound(table: Table, currentPlayerIndex: number, roundStartTimestamp: number): boolean {
    try {
      const activePlayers = this.getActivePlayers(table);
      if (activePlayers.length <= 1) return true;
    
      let idx = this.getNextActivePlayerIndex(table, table.dealerPosition);
      let actedCount = 0;
      const maxLoops = activePlayers.length;
      const currentRoundActions = new Set<string>(); // Track unique player IDs acted this round
    
      // More detailed logging of the initial state
      logger.log('[PlayerManager] hasAllActedThisRound initial state:', {
        dealerPosition: table.dealerPosition,
        currentPlayerIndex,
        roundStartTimestamp,
        activePlayerCount: activePlayers.length,
        startingIndex: idx
      });
    
      let loopCount = 0; // Safety counter to prevent infinite loops
      
      do {
        loopCount++;
        if (loopCount > table.players.length * 2) {
          // Safety check to prevent infinite loops
          logger.warn('[PlayerManager] Possible infinite loop in hasAllActedThisRound');
          return false;
        }
        
        const player = table.players[idx];
        if (player.isActive && !player.hasFolded && player.chips > 0) {
          // Check if this player acted in the current round
          const hasRoundBet = table.roundBets[player.id] !== undefined;
          const isLastActive = table.lastActivePlayer === player.id && table.lastActionTimestamp >= roundStartTimestamp;
          const playerActed = hasRoundBet || isLastActive;
          
          logger.log('[PlayerManager] Player action check:', { 
            playerId: player.id, 
            hasRoundBet, 
            isLastActive, 
            playerActed,
            roundBet: table.roundBets[player.id]
          });
          
          if (playerActed && !currentRoundActions.has(player.id)) {
            currentRoundActions.add(player.id);
            actedCount++;
          }
        }
        
        const prevIdx = idx;
        idx = this.getNextActivePlayerIndex(table, idx);
        
        // Log each step for debugging
        logger.log('[PlayerManager] Moving to next player:', { 
          from: prevIdx, 
          to: idx, 
          actedCount, 
          targetCount: activePlayers.length 
        });
        
      } while (idx !== this.getNextActivePlayerIndex(table, currentPlayerIndex) && actedCount < maxLoops);
    
      logger.log('[PlayerManager] hasAllActedThisRound result:', { 
        actedCount, 
        activePlayers: activePlayers.length, 
        roundStartTimestamp, 
        currentRoundActions: Array.from(currentRoundActions),
        result: actedCount >= activePlayers.length
      });
      
      return actedCount >= activePlayers.length;
    } catch (error) {
      console.error('[PlayerManager] Error in hasAllActedThisRound:', error);
      logger.error('[PlayerManager] Error tracking player actions:', {
        error: typeof error === 'object' ? JSON.stringify(error) : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        tableId: table.id,
        currentPlayerIndex: currentPlayerIndex,
        roundStartTimestamp: roundStartTimestamp
      });
      // Default to false if there's an error
      return false;
    }
  }
} 