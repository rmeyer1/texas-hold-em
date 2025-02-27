import { findBestHand } from '@/utils/handEvaluator';
import { DatabaseService } from './databaseService';
import type { Table, Hand, Card } from '@/types/poker';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';

export class HandEvaluator {
  private db: DatabaseService;
  private tableId: string;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.db = new DatabaseService(tableId);
  }

  /**
   * Evaluate the best hand for a player
   */
  async evaluatePlayerHand(playerId: string, communityCards: Card[]): Promise<Hand | null> {
    try {
      // Get player's hole cards
      const holeCards = await this.db.getPlayerCards(playerId);
      if (!holeCards || holeCards.length < 2) {
        logger.warn(`[HandEvaluator] No hole cards found for player ${playerId}`);
        return null;
      }

      // Find best hand using hole cards and community cards
      return findBestHand(holeCards, communityCards);
    } catch (error) {
      logger.error('[HandEvaluator] Error evaluating player hand:', {
        playerId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Evaluate hands for all active players
   */
  async evaluateHands(table: Table): Promise<Array<{ playerId: string; hand: Hand }>> {
    try {
      const activePlayers = table.players.filter(p => p.isActive && !p.hasFolded);
      
      // Evaluate each player's hand
      const handPromises = activePlayers.map(async player => {
        const hand = await this.evaluatePlayerHand(player.id, table.communityCards);
        if (!hand) {
          throw new Error(`Failed to evaluate hand for player ${player.id}`);
        }
        return { playerId: player.id, hand };
      });
      
      return await Promise.all(handPromises);
    } catch (error) {
      logger.error('[HandEvaluator] Error evaluating hands:', {
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Determine the winners of the current hand
   */
  async getWinners(table: Table): Promise<string[]> {
    try {
      // If only one active player, they win by default
      const activePlayers = table.players.filter(p => p.isActive && !p.hasFolded);
      if (activePlayers.length === 1) {
        return [activePlayers[0].id];
      }

      // Evaluate all hands
      const hands = await this.evaluateHands(table);
      
      // Find the highest hand value
      const maxValue = Math.max(...hands.map(h => h.hand.value));
      
      // Return all players with the highest hand value (could be multiple in case of a tie)
      return hands
        .filter(h => h.hand.value === maxValue)
        .map(h => h.playerId);
    } catch (error) {
      logger.error('[HandEvaluator] Error getting winners:', {
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Get the description of a player's hand
   */
  async getHandDescription(playerId: string, table: Table): Promise<string> {
    try {
      const hand = await this.evaluatePlayerHand(playerId, table.communityCards);
      return hand ? hand.description : 'No hand';
    } catch (error) {
      logger.error('[HandEvaluator] Error getting hand description:', {
        playerId,
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
} 