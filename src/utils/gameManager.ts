import { Card, Player, Table } from '../types/poker';
import { Deck } from './deck';
import { findBestHand } from './handEvaluator';

export class GameManager {
  private deck: Deck;
  private table: Table;

  constructor(tableId: string) {
    this.deck = new Deck();
    this.table = {
      id: tableId,
      players: [],
      communityCards: [],
      pot: 0,
      currentBet: 0,
      dealerPosition: 0,
      phase: 'preflop',
    };
  }

  public addPlayer(player: Omit<Player, 'holeCards' | 'isActive' | 'hasFolded'>): void {
    if (this.table.players.length >= 10) {
      throw new Error('Table is full');
    }

    this.table.players.push({
      ...player,
      holeCards: [],
      isActive: true,
      hasFolded: false,
    });
  }

  public removePlayer(playerId: string): void {
    const index = this.table.players.findIndex((p) => p.id === playerId);
    if (index !== -1) {
      this.table.players.splice(index, 1);
    }
  }

  public startNewHand(): void {
    // Reset the deck
    this.deck = new Deck();

    // Reset table state
    this.table.communityCards = [];
    this.table.pot = 0;
    this.table.currentBet = 0;
    this.table.phase = 'preflop';

    // Reset player states
    this.table.players.forEach((player) => {
      player.holeCards = [];
      player.isActive = true;
      player.hasFolded = false;
    });

    // Move dealer button
    this.table.dealerPosition = (this.table.dealerPosition + 1) % this.table.players.length;

    // Deal hole cards
    this.dealHoleCards();
  }

  private dealHoleCards(): void {
    // Deal 2 cards to each active player
    this.table.players.forEach((player) => {
      if (player.isActive) {
        const cards = this.deck.dealHoleCards();
        if (cards) {
          player.holeCards = cards;
        } else {
          throw new Error('Not enough cards in deck');
        }
      }
    });
  }

  public dealFlop(): void {
    if (this.table.phase !== 'preflop') {
      throw new Error('Cannot deal flop at this time');
    }

    const flop = this.deck.dealFlop();
    if (!flop) {
      throw new Error('Not enough cards in deck');
    }

    this.table.communityCards = flop;
    this.table.phase = 'flop';
  }

  public dealTurn(): void {
    if (this.table.phase !== 'flop') {
      throw new Error('Cannot deal turn at this time');
    }

    const turnCard = this.deck.dealCard();
    if (!turnCard) {
      throw new Error('Not enough cards in deck');
    }

    this.table.communityCards.push(turnCard);
    this.table.phase = 'turn';
  }

  public dealRiver(): void {
    if (this.table.phase !== 'turn') {
      throw new Error('Cannot deal river at this time');
    }

    const riverCard = this.deck.dealCard();
    if (!riverCard) {
      throw new Error('Not enough cards in deck');
    }

    this.table.communityCards.push(riverCard);
    this.table.phase = 'river';
  }

  public evaluatePlayerHands(): { playerId: string; hand: ReturnType<typeof findBestHand> }[] {
    if (this.table.phase !== 'river') {
      throw new Error('Cannot evaluate hands before river');
    }

    return this.table.players
      .filter((player) => player.isActive && !player.hasFolded)
      .map((player) => ({
        playerId: player.id,
        hand: findBestHand(player.holeCards, this.table.communityCards),
      }))
      .sort((a, b) => b.hand.value - a.hand.value);
  }

  public getWinners(): string[] {
    const handEvaluations = this.evaluatePlayerHands();
    if (handEvaluations.length === 0) {
      return [];
    }

    const highestValue = handEvaluations[0].hand.value;
    return handEvaluations
      .filter((evaluation) => evaluation.hand.value === highestValue)
      .map((evaluation) => evaluation.playerId);
  }

  public getTableState(): Table {
    return { ...this.table };
  }

  public getPlayerState(playerId: string): Player | undefined {
    return this.table.players.find((p) => p.id === playerId);
  }

  public foldPlayer(playerId: string): void {
    const player = this.table.players.find((p) => p.id === playerId);
    if (player) {
      player.hasFolded = true;
    }
  }

  public placeBet(playerId: string, amount: number): void {
    const player = this.table.players.find((p) => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    if (player.hasFolded) {
      throw new Error('Player has folded');
    }

    if (amount > player.chips) {
      throw new Error('Not enough chips');
    }

    player.chips -= amount;
    this.table.pot += amount;
    this.table.currentBet = Math.max(this.table.currentBet, amount);
  }
} 