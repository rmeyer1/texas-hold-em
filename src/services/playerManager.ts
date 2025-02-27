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
    
    // If no players, return current index
    if (players.length === 0) return currentIndex;
    
    let nextIdx = (currentIndex + 1) % players.length;
    let loopCount = 0;
    
    // Find next active player who hasn't folded and has chips
    while (
      !players[nextIdx].isActive || 
      players[nextIdx].hasFolded || 
      players[nextIdx].chips <= 0
    ) {
      nextIdx = (nextIdx + 1) % players.length;
      loopCount++;
      
      // Safety check to prevent infinite loop if no active players
      if (loopCount >= players.length) {
        logger.warn('[PlayerManager] No active players found for next turn');
        return currentIndex;
      }
    }
    
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
    const { players, currentPlayerIndex, currentBet } = table;
    
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    // If there's no bet, we need to check if we've gone full circle
    if (currentBet === 0) {
      // Get the first player to act in this phase (typically the player after the dealer)
      // This is an approximation - ideally we'd track the first player who acted in this phase
      const firstToActIndex = (table.dealerPosition + 1) % players.length;
      
      // If we've returned to the first player to act, everyone has checked
      // This assumes the currentPlayerIndex has already been updated to the next player
      const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
      return nextPlayerIndex === firstToActIndex;
    }
    
    // If there's been a bet/raise, we need to make sure everyone has responded to it
    if (table.lastBettor) {
      // Find the index of the last bettor
      const lastBettorIndex = players.findIndex(p => p.id === table.lastBettor);
      if (lastBettorIndex === -1) {
        logger.warn('[PlayerManager] Last bettor not found in players array');
        return false; // Safety check
      }
      
      // We need to check if all players have had a chance to act after the last bet/raise
      // The betting round is complete when we've gone full circle and are about to act on the player AFTER the last bettor
      // This means the current player should be the player before the last bettor
      const playerBeforeLastBettor = (lastBettorIndex - 1 + players.length) % players.length;
      return currentPlayerIndex === playerBeforeLastBettor;
    }
    
    // If we get here with a currentBet > 0 but no lastBettor, something is wrong
    // This is a fallback to the original logic
    const roundBets = table.roundBets;
    
    // Start from the player after the current one and go around the table
    let idx = (currentPlayerIndex + 1) % players.length;
    const startIdx = idx;
    
    do {
      const player = players[idx];
      
      // Skip inactive, folded, or all-in players
      if (player.isActive && !player.hasFolded && player.chips > 0) {
        const playerBet = roundBets[player.id] || 0;
        
        // If a player hasn't matched the current bet and has chips, they haven't acted
        if (playerBet < currentBet) {
          return false;
        }
      }
      
      idx = (idx + 1) % players.length;
    } while (idx !== startIdx);
    
    return true;
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
} 