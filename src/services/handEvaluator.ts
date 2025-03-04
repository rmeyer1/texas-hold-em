import { findBestHand } from '@/utils/handEvaluator';
import { DatabaseService } from './databaseService';
import type { Table, Hand, Card, WinningHand } from '@/types/poker';
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
      
      // Add a check for community cards
      if (!table.communityCards || table.communityCards.length === 0) {
        throw new Error('Cannot evaluate hands without community cards');
      }
      
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
  async getWinners(table: Table): Promise<{ winnerIds: string[]; winningHands: WinningHand[] }> {
    try {
      // If only one active player, they win by default
      const activePlayers = table.players.filter(p => p.isActive && !p.hasFolded);
      if (activePlayers.length === 1) {
        // For default winner, still evaluate their hand if there are community cards
        // Add a null/undefined check before accessing .length
        if (table.communityCards && table.communityCards.length > 0) {
          const winnerHand = await this.evaluatePlayerHand(activePlayers[0].id, table.communityCards);
          if (winnerHand) {
            return {
              winnerIds: [activePlayers[0].id],
              winningHands: [{
                playerId: activePlayers[0].id,
                rank: winnerHand.rank,
                description: winnerHand.description,
                value: winnerHand.value
              }]
            };
          }
        }
        
        // No community cards or couldn't evaluate hand
        return {
          winnerIds: [activePlayers[0].id],
          winningHands: []
        };
      }

      // Make sure community cards exist before proceeding with hand evaluation
      if (!table.communityCards || table.communityCards.length === 0) {
        // In pre-flop with no community cards, should not get here unless error
        logger.warn('[HandEvaluator] Attempted to evaluate hands with no community cards');
        return {
          winnerIds: activePlayers.map(p => p.id),
          winningHands: []
        };
      }

      // Evaluate all hands
      const evaluatedHands = await this.evaluateHands(table);
      
      // Find the highest hand value
      const maxValue = Math.max(...evaluatedHands.map(h => h.hand.value));
      
      // Get winners with the highest hand value
      const winners = evaluatedHands.filter(h => h.hand.value === maxValue);
      
      return {
        winnerIds: winners.map(w => w.playerId),
        winningHands: winners.map(w => ({
          playerId: w.playerId,
          rank: w.hand.rank,
          description: w.hand.description,
          value: w.hand.value
        }))
      };
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