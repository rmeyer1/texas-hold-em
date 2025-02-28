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
    
    if (!table.roundBets) table.roundBets = {};
    
    const activePlayers = this.getActivePlayers(table);
    if (activePlayers.length <= 1) return true;
  
    // Check if all active players have matched the current bet
    const allBetsMatch = activePlayers.every(p => (table.roundBets[p.id] || 0) === table.currentBet);
    if (!allBetsMatch) return false;
  
    // If no bet this round (e.g., all checks), cycle back to first player
    if (currentBet === 0) {
      const firstToActIndex = (table.dealerPosition + 1) % players.length;
      const nextPlayerIndex = this.getNextActivePlayerIndex(table, currentPlayerIndex);
      return nextPlayerIndex === firstToActIndex;
    }
  
    // If there's a lastBettor (e.g., from a raise), ensure we've cycled back to them
    if (table.lastBettor) {
      const lastBettorIndex = players.findIndex(p => p.id === table.lastBettor);
      if (lastBettorIndex === -1) {
        logger.warn('[PlayerManager] Last bettor not found in players array');
        return false;
      }
      // Check if the next player would be the last bettor, indicating full cycle
      const nextPlayerIndex = this.getNextActivePlayerIndex(table, currentPlayerIndex);
      return nextPlayerIndex === lastBettorIndex;
    }
  
    // Fallback: all bets match, and no further action needed
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