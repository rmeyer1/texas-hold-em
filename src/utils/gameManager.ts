import { Card, Player, Table } from '../types/poker';
import { Deck } from './deck';
import { findBestHand } from './handEvaluator';
import { TableService } from '../services/tableService';

export class GameManager {
  private deck: Deck;
  private table: Table;
  private tableService: TableService;
  private tableStateCallback?: (table: Table) => void;

  constructor(tableId: string) {
    this.deck = new Deck();
    this.table = {
      id: tableId,
      players: [],
      communityCards: [],
      pot: 0,
      currentBet: 0,
      dealerPosition: 0,
      currentPlayerIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      lastActionTimestamp: Date.now(),
      turnTimeLimit: 45000, // 30 seconds
      phase: 'preflop',
      bettingRound: 'first_round',
      roundBets: {},
      minRaise: 2
    };
    this.tableService = new TableService(tableId);
  }

  public async initialize(): Promise<void> {
    await this.tableService.createTable(this.table.id);
  }

  public subscribeToTableState(callback: (table: Table) => void): () => void {
    this.tableStateCallback = callback;
    return this.tableService.subscribeToTable((table) => {
      this.table = table;
      this.tableStateCallback?.(table);
    });
  }

  public async addPlayer(player: Omit<Player, 'holeCards' | 'isActive' | 'hasFolded'>): Promise<void> {
    await this.tableService.addPlayer(player);
  }

  public async removePlayer(playerId: string): Promise<void> {
    await this.tableService.removePlayer(playerId);
  }

  public async startNewHand(): Promise<void> {
    // Reset the deck
    this.deck = new Deck();

    // Reset table state
    const tableUpdate: Partial<Table> = {
      communityCards: [],
      pot: 0,
      currentBet: 0,
      phase: 'preflop',
      dealerPosition: (this.table.dealerPosition + 1) % this.table.players.length,
    };

    // Reset player states
    const players = this.table.players.map((player) => ({
      ...player,
      holeCards: [],
      isActive: true,
      hasFolded: false,
    }));

    await this.tableService.updateTable({ ...tableUpdate, players });

    // Deal hole cards
    await this.dealHoleCards();
  }

  private async dealHoleCards(): Promise<void> {
    const players = this.table.players.map((player) => {
      if (player.isActive) {
        const cards = this.deck.dealHoleCards();
        if (cards) {
          return { ...player, holeCards: cards };
        }
        throw new Error('Not enough cards in deck');
      }
      return player;
    });

    await this.tableService.updateTable({ players });
  }

  public async dealFlop(): Promise<void> {
    if (this.table.phase !== 'preflop') {
      throw new Error('Cannot deal flop at this time');
    }

    const flop = this.deck.dealFlop();
    if (!flop) {
      throw new Error('Not enough cards in deck');
    }

    await this.tableService.updateTable({
      communityCards: flop,
      phase: 'flop',
    });
  }

  public async dealTurn(): Promise<void> {
    if (this.table.phase !== 'flop') {
      throw new Error('Cannot deal turn at this time');
    }

    const turnCard = this.deck.dealCard();
    if (!turnCard) {
      throw new Error('Not enough cards in deck');
    }

    await this.tableService.updateTable({
      communityCards: [...this.table.communityCards, turnCard],
      phase: 'turn',
    });
  }

  public async dealRiver(): Promise<void> {
    if (this.table.phase !== 'turn') {
      throw new Error('Cannot deal river at this time');
    }

    const riverCard = this.deck.dealCard();
    if (!riverCard) {
      throw new Error('Not enough cards in deck');
    }

    await this.tableService.updateTable({
      communityCards: [...this.table.communityCards, riverCard],
      phase: 'river',
    });
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

  public async foldPlayer(playerId: string): Promise<void> {
    await this.tableService.updatePlayerState(playerId, { hasFolded: true });
  }

  public async placeBet(playerId: string, amount: number): Promise<void> {
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

    await this.tableService.updatePlayerState(playerId, {
      chips: player.chips - amount,
    });

    await this.tableService.updateTable({
      pot: this.table.pot + amount,
      currentBet: Math.max(this.table.currentBet, amount),
    });
  }
} 