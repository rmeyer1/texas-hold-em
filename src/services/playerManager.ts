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
} 