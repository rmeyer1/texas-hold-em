import { Card, Suit, Rank } from '../types/poker';
import logger from '@/utils/logger';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = this.createDeck();
    this.shuffle();
  }

  private createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  public shuffle(): void {
    // Fisher-Yates shuffle algorithm
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  public dealCard(): Card | undefined {
    // If deck is empty, reset it
    if (this.cards.length === 0) {
      logger.warn('[Deck] Deck is empty, resetting');
      this.reset();
    }
    return this.cards.pop();
  }

  public dealHoleCards(): [Card, Card] | undefined {
    // If deck doesn't have enough cards, reset it
    if (this.cards.length < 2) {
      logger.warn('[Deck] Not enough cards for hole cards, resetting deck');
      this.reset();
    }
    
    const card1 = this.dealCard();
    const card2 = this.dealCard();
    
    if (!card1 || !card2) {
      logger.error('[Deck] Failed to deal hole cards even after reset');
      return undefined;
    }

    return [card1, card2];
  }

  public dealFlop(): [Card, Card, Card] | undefined {
    // If deck doesn't have enough cards, reset it
    if (this.cards.length < 3) {
      logger.warn('[Deck] Not enough cards for flop, resetting deck');
      this.reset();
    }
    
    const card1 = this.dealCard();
    const card2 = this.dealCard();
    const card3 = this.dealCard();

    if (!card1 || !card2 || !card3) {
      logger.error('[Deck] Failed to deal flop even after reset');
      return undefined;
    }

    return [card1, card2, card3];
  }

  public getRemainingCards(): number {
    return this.cards.length;
  }

  public reset(): void {
    this.cards = this.createDeck();
    this.shuffle();
  }
} 