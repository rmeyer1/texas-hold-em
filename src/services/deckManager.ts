import { Deck } from '@/utils/deck';
import { DatabaseService } from './databaseService';
import type { Card } from '@/types/poker';
import logger from '@/utils/logger';

export class DeckManager {
  private deck: Deck;
  private db: DatabaseService;
  private tableId: string;

  constructor(tableId: string) {
    this.deck = new Deck();
    this.db = new DatabaseService(tableId);
    this.tableId = tableId;
  }

  /**
   * Reset and shuffle the deck
   */
  reset(): void {
    this.deck.reset();
  }

  /**
   * Deal hole cards to a player
   */
  async dealHoleCards(playerId: string, handId: string): Promise<Card[] | undefined> {
    const cards = this.deck.dealHoleCards();
    if (cards) {
      logger.log('[DeckManager] Dealing hole cards:', {
        tableId: this.tableId,
        playerId,
        handId,
        cards: JSON.stringify(cards),
        timestamp: new Date().toISOString(),
      });
      await this.db.setPlayerCards(playerId, cards, handId);
      return cards;
    }
    return undefined;
  }

  /**
   * Clear a player's cards
   */
  async clearPlayerCards(playerId: string): Promise<void> {
    await this.db.clearPlayerCards(playerId);
  }

  /**
   * Deal the flop (3 cards)
   */
  dealFlop(): Card[] | undefined {
    const flop = this.deck.dealFlop();
    return flop;
  }

  /**
   * Deal a single card (for turn or river)
   */
  dealCard(): Card | undefined {
    return this.deck.dealCard();
  }

  /**
   * Get the number of remaining cards in the deck
   */
  getRemainingCards(): number {
    return this.deck.getRemainingCards();
  }
} 