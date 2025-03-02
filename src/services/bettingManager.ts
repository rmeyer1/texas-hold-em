import type { Player, Table, PlayerAction } from '@/types/poker';
import logger from '@/utils/logger';

export class BettingManager {
  private tableId: string;

  constructor(tableId: string) {
    this.tableId = tableId;
  }

  /**
   * Handle a fold action
   */
  handleFold(table: Table, playerId: string): Partial<Table> {
    logger.log('[BettingManager] handleFold:', { playerId });
    
    const updates: Partial<Table> = {};
    const playerIndex = table.players.findIndex(p => p.id === playerId);
    
    if (playerIndex === -1) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    // Mark player as folded
    if (!updates.players) {
      updates.players = [...table.players];
    }
    updates.players[playerIndex] = {
      ...updates.players[playerIndex],
      hasFolded: true
    };
    
    // Update last action info
    updates.lastAction = 'fold';
    updates.lastActivePlayer = playerId;
    updates.lastActionTimestamp = Date.now();
    
    return updates;
  }

  /**
   * Handle a check action
   */
  handleCheck(table: Table, playerId: string): Partial<Table> {
    logger.log('[BettingManager] handleCheck:', { playerId });
    
    // Ensure roundBets is initialized
    const roundBets = { ...(table.roundBets || {}) };
    
    // Validate the check action
    if (table.currentBet > 0 && (roundBets[playerId] || 0) < table.currentBet) {
      throw new Error('Cannot check when there is an active bet');
    }
    
    // Explicitly set the round bet to 0 for check actions
    roundBets[playerId] = roundBets[playerId] || 0;
    
    // Update last action info
    return {
      roundBets,
      lastAction: 'check',
      lastActivePlayer: playerId,
      lastActionTimestamp: Date.now()
    };
  }

  /**
   * Handle a call action
   */
  handleCall(table: Table, playerId: string): Partial<Table> {
    logger.log('[BettingManager] handleCall:', { playerId });
    
    const updates: Partial<Table> = {};
    const player = table.players.find(p => p.id === playerId);
    
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    // Ensure roundBets is initialized
    const roundBets = { ...(table.roundBets || {}) };
    const currentPlayerBet = roundBets[playerId] || 0;
    const amountToCall = Math.min(table.currentBet - currentPlayerBet, player.chips);
    
    if (amountToCall > 0) {
      // Create a new players array to avoid mutating the original
      if (!updates.players) {
        updates.players = [...table.players];
      }
      
      const playerIndex = updates.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) {
        throw new Error(`Player ${playerId} not found in updates`);
      }
      
      // Update player chips
      updates.players[playerIndex] = {
        ...updates.players[playerIndex],
        chips: player.chips - amountToCall
      };
      
      // Update pot and bets
      updates.pot = table.pot + amountToCall;
      roundBets[playerId] = (roundBets[playerId] || 0) + amountToCall;
    }
    
    // Update last action info
    updates.roundBets = roundBets;
    updates.lastAction = 'call';
    updates.lastActivePlayer = playerId;
    updates.lastActionTimestamp = Date.now();
    
    return updates;
  }

  /**
   * Handle a bet action
   */
  handleBet(table: Table, playerId: string, amount: number): Partial<Table> {
    logger.log('[BettingManager] handleBet:', { playerId, amount });
    
    if (table.currentBet > 0) {
      throw new Error('Cannot bet when there is already a bet; use raise instead');
    }
    
    if (amount < table.bigBlind) {
      throw new Error(`Bet amount must be at least the big blind (${table.bigBlind})`);
    }
    
    const updates: Partial<Table> = {};
    const player = table.players.find(p => p.id === playerId);
    
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    if (player.chips < amount) {
      throw new Error(`Player does not have enough chips for bet`);
    }
    
    // Create a new players array to avoid mutating the original
    if (!updates.players) {
      updates.players = [...table.players];
    }
    
    const playerIndex = updates.players.findIndex(p => p.id === playerId);
    
    // Update player chips
    updates.players[playerIndex] = {
      ...updates.players[playerIndex],
      chips: player.chips - amount
    };
    
    // Update table state
    const roundBets = { ...(table.roundBets || {}) };
    roundBets[playerId] = (roundBets[playerId] || 0) + amount;
    
    updates.roundBets = roundBets;
    updates.currentBet = amount;
    updates.pot = table.pot + amount;
    // Minimum raise is just $1 more than the current bet
    updates.minRaise = 1;
    updates.lastBettor = playerId;
    updates.lastAction = 'bet';
    updates.lastActivePlayer = playerId;
    updates.lastActionTimestamp = Date.now();
    
    return updates;
  }

  /**
   * Handle a raise action
   */
  handleRaise(table: Table, playerId: string, amount: number): Partial<Table> {
    logger.log('[BettingManager] handleRaise:', { playerId, amount });
    
    if (table.currentBet === 0) {
      throw new Error('Cannot raise when there is no bet; use bet instead');
    }
    
    const updates: Partial<Table> = {};
    const player = table.players.find(p => p.id === playerId);
    
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    // Calculate the actual raise amount
    const roundBets = { ...(table.roundBets || {}) };
    const currentPlayerBet = roundBets[playerId] || 0;
    const totalBetAfterRaise = amount;
    const amountToAdd = totalBetAfterRaise - currentPlayerBet;
    
    // Check minimum raise - must be at least $1 more than the current bet, or the table's minRaise value if higher
    const raiseAmount = totalBetAfterRaise - table.currentBet;
    if (raiseAmount < table.minRaise && totalBetAfterRaise < player.chips) {
      throw new Error(`Raise must be at least ${table.minRaise} more than current bet (${table.currentBet})`);
    }
    
    if (player.chips < amountToAdd) {
      throw new Error(`Player does not have enough chips for raise`);
    }
    
    // Create a new players array to avoid mutating the original
    if (!updates.players) {
      updates.players = [...table.players];
    }
    
    const playerIndex = updates.players.findIndex(p => p.id === playerId);
    
    // Update player chips
    updates.players[playerIndex] = {
      ...updates.players[playerIndex],
      chips: player.chips - amountToAdd
    };
    
    // Update table state
    roundBets[playerId] = totalBetAfterRaise;
    
    updates.roundBets = roundBets;
    updates.currentBet = totalBetAfterRaise;
    updates.pot = table.pot + amountToAdd;
    // For a re-raise, the minimum amount to raise must be at least the amount of the previous raise
    updates.minRaise = raiseAmount;
    updates.lastBettor = playerId;
    updates.lastAction = 'raise';
    updates.lastActivePlayer = playerId;
    updates.lastActionTimestamp = Date.now();
    
    return updates;
  }

  /**
   * Check if the current betting round is complete
   */
  isRoundComplete(table: Table): boolean {
    try {
      logger.log('[BettingManager] isRoundComplete checking:', { 
        phase: table.phase,
        currentPlayerIndex: table.currentPlayerIndex,
        lastBettor: table.lastBettor
      });
      
      // If only one active player remains, round is complete
      const activePlayers = this.getActivePlayers(table);
      if (activePlayers.length <= 1) {
        logger.log('[BettingManager] Round complete: Only one active player left');
        return true;
      }
      
      // Check if all active players have acted and bets are equal
      return this.haveAllPlayersActed(table);
    } catch (error) {
      logger.error('[BettingManager] Error in isRoundComplete:', { 
        error: typeof error === 'object' ? JSON.stringify(error) : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      return false;
    }
  }

  /**
   * Get active players (not folded and with chips)
   */
  private getActivePlayers(table: Table): Player[] {
    return table.players.filter(p => p.isActive && !p.hasFolded);
  }

  /**
   * Check if all active players have acted in the current round
   */
  private haveAllPlayersActed(table: Table): boolean {
    try {
      const { players, currentPlayerIndex, currentBet, lastActionTimestamp } = table;
      const roundBets = table.roundBets || {};
      
      logger.log('[BettingManager] haveAllPlayersActed state:', { 
        currentBet,
        lastBettor: table.lastBettor,
        roundBets
      });
      
      const activePlayers = this.getActivePlayers(table);
      
      // Check if all bets match the current bet
      const allBetsMatch = activePlayers.every(p => {
        // If player is all-in with less than current bet, that's fine
        if (p.chips === 0 && roundBets[p.id] > 0) return true;
        // Otherwise, bet must match current bet
        return roundBets[p.id] === currentBet;
      });
      
      logger.log('[BettingManager] haveAllPlayersActed: Bets match check:', allBetsMatch);
      if (!allBetsMatch) return false;
      
      // If there's no bet (everyone checked)
      if (currentBet === 0) {
        // We need to verify everyone has acted at least once this round
        return this.hasAllActedThisRound(table, lastActionTimestamp || Date.now());
      }
      
      // If there was betting action, we need to check if everyone has acted after the last bettor
      if (table.lastBettor) {
        return this.hasEveryoneActedAfterLastBettor(table);
      }
      
      logger.log('[BettingManager] haveAllPlayersActed: All bets match, no last bettor');
      return true;
    } catch (error) {
      logger.error('[BettingManager] Error in haveAllPlayersActed:', {
        error: typeof error === 'object' ? JSON.stringify(error) : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      return false;
    }
  }

  /**
   * Check if all players have acted at least once in the current round
   */
  private hasAllActedThisRound(table: Table, roundStartTimestamp: number): boolean {
    const { players } = table;
    const roundBets = table.roundBets || {};
    const activePlayers = this.getActivePlayers(table);
    
    // In a no-bet scenario, we check if every active player has a recorded bet (even if 0)
    // or was the last active player in this round
    const allActed = activePlayers.every(player => {
      const hasBet = roundBets[player.id] !== undefined;
      const wasLastActive = table.lastActivePlayer === player.id && 
                          (table.lastActionTimestamp || 0) >= roundStartTimestamp;
      
      logger.log('[BettingManager] Player action check:', {
        playerId: player.id,
        hasBet,
        wasLastActive
      });
      
      return hasBet || wasLastActive;
    });
    
    logger.log('[BettingManager] hasAllActedThisRound result:', allActed);
    return allActed;
  }

  /**
   * Check if everyone has acted after the last bet or raise
   */
  private hasEveryoneActedAfterLastBettor(table: Table): boolean {
    if (!table.lastBettor || !table.lastActionTimestamp) {
      logger.warn('[BettingManager] Cannot check actions after last bettor: missing lastBettor or timestamp');
      return false;
    }
    
    const lastBettorIndex = table.players.findIndex(p => p.id === table.lastBettor);
    if (lastBettorIndex === -1) {
      logger.warn('[BettingManager] Last bettor not found in players');
      return false;
    }
    
    const nextPlayerIndex = this.getNextActivePlayerIndex(table, table.currentPlayerIndex);
    const result = nextPlayerIndex === lastBettorIndex || 
                  nextPlayerIndex === this.getNextActivePlayerIndex(table, lastBettorIndex);
    
    logger.log('[BettingManager] hasEveryoneActedAfterLastBettor:', {
      lastBettorIndex,
      currentIndex: table.currentPlayerIndex,
      nextIndex: nextPlayerIndex,
      result
    });
    
    return result;
  }

  /**
   * Get the next active player index
   */
  getNextActivePlayerIndex(table: Table, currentIndex: number): number {
    const { players } = table;
    if (players.length === 0) return currentIndex;
    
    let nextIdx = (currentIndex + 1) % players.length;
    let loopCount = 0;
    
    while (!players[nextIdx].isActive || players[nextIdx].hasFolded || players[nextIdx].chips === 0) {
      nextIdx = (nextIdx + 1) % players.length;
      loopCount++;
      if (loopCount >= players.length) {
        logger.warn('[BettingManager] No active players found for next turn');
        return currentIndex;
      }
    }
    
    return nextIdx;
  }

  /**
   * Get the amount a player needs to call
   */
  getCallAmount(table: Table, playerId: string): number {
    const player = table.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    const currentPlayerBet = (table.roundBets || {})[playerId] || 0;
    return Math.min(table.currentBet - currentPlayerBet, player.chips);
  }

  /**
   * Check if a player can check
   */
  canPlayerCheck(table: Table, playerId: string): boolean {
    const currentPlayerBet = (table.roundBets || {})[playerId] || 0;
    return currentPlayerBet >= table.currentBet;
  }

  /**
   * Get the minimum raise amount
   */
  getMinRaiseAmount(table: Table): number {
    return table.minRaise || table.bigBlind * 2;
  }

  /**
   * Reset the betting for a new round
   */
  resetBettingRound(table: Table): Partial<Table> {
    return {
      roundBets: {},
      currentBet: 0,
      minRaise: table.bigBlind * 2,
      lastBettor: null
    };
  }

  /**
   * Update the pot after a round of betting
   */
  updatePot(table: Table): Partial<Table> {
    // This is a simple implementation; a more complex one would handle side pots
    const roundBets = table.roundBets || {};
    const totalBets = Object.values(roundBets).reduce((sum, bet) => sum + bet, 0);
    
    return {
      pot: (table.pot || 0) + totalBets,
      roundBets: {}
    };
  }

  /**
   * Create side pots for all-in scenarios
   * This is a placeholder for future implementation
   */
  createSidePots(table: Table): Partial<Table> {
    // Implementation for side pots would go here
    // For now, we'll just return the table unchanged
    return {};
  }
} 