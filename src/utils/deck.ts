import { Card, Suit, Rank } from '../types/poker';

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
    return this.cards.pop();
  }

  public dealHoleCards(): [Card, Card] | undefined {
    const card1 = this.dealCard();
    const card2 = this.dealCard();
    
    if (!card1 || !card2) {
      return undefined;
    }

    return [card1, card2];
  }

  public dealFlop(): [Card, Card, Card] | undefined {
    const card1 = this.dealCard();
    const card2 = this.dealCard();
    const card3 = this.dealCard();

    if (!card1 || !card2 || !card3) {
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