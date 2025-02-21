import { ref, set, update, onValue, off, get, runTransaction } from 'firebase/database';
import { database } from './firebase';
import type { Table, Player, Card, PrivatePlayerData, Hand } from '@/types/poker';
import { Deck } from '@/utils/deck';
import { findBestHand } from '@/utils/handEvaluator';

export class GameManager {
  private tableRef;
  private deck: Deck;
  private static readonly TURN_TIME_LIMIT = 45000; // 45 seconds in milliseconds
  private static readonly DEFAULT_SMALL_BLIND = 10;
  private static readonly DEFAULT_BIG_BLIND = 20;
  private tableStateCallback?: (table: Table) => void;

  constructor(tableId: string) {
    this.tableRef = ref(database, `tables/${tableId}`);
    this.deck = new Deck();
  }

  private getPrivatePlayerRef(playerId: string): any {
    return ref(database, `private_player_data/${this.tableRef.key}/${playerId}`);
  }

  public async initialize(): Promise<void> {
    const initialTable: Table = {
      id: this.tableRef.key!,
      players: [],
      communityCards: [],
      pot: 0,
      currentBet: 0,
      dealerPosition: 0,
      currentPlayerIndex: 0,
      smallBlind: GameManager.DEFAULT_SMALL_BLIND,
      bigBlind: GameManager.DEFAULT_BIG_BLIND,
      lastActionTimestamp: Date.now(),
      turnTimeLimit: GameManager.TURN_TIME_LIMIT,
      phase: 'preflop',
      bettingRound: 'first_round',
      roundBets: {},
      minRaise: GameManager.DEFAULT_BIG_BLIND,
    };
    await set(this.tableRef, initialTable);
  }

  public subscribeToTableState(callback: (table: Table) => void): () => void {
    this.tableStateCallback = callback;
    const unsubscribe = onValue(this.tableRef, (snapshot) => {
      const table = snapshot.val() as Table;
      this.tableStateCallback?.(table);
    });
    return () => {
      off(this.tableRef);
      this.tableStateCallback = undefined;
    };
  }

  public async getTableState(): Promise<Table> {
    return await this.getTable();
  }

  public async addPlayer(player: Omit<Player, 'isActive' | 'hasFolded'>): Promise<void> {
    const table = await this.getTable();
    const newPlayer: Player = {
      ...player,
      isActive: true,
      hasFolded: false,
    };
    
    const updatedPlayers = Array.isArray(table.players) ? [...table.players] : [];
    // Check for existing player with same ID
    if (updatedPlayers.some(p => p.id === newPlayer.id)) {
      return; // Player already exists, skip addition
    }
    
    updatedPlayers.push(newPlayer);
    
    await update(this.tableRef, { players: updatedPlayers });
  }

  public async foldPlayer(playerId: string): Promise<void> {
    await this.handlePlayerAction(playerId, 'fold');
  }

  public async placeBet(playerId: string, amount: number): Promise<void> {
    await this.handlePlayerAction(playerId, 'raise', amount);
  }

  private async getTable(): Promise<Table> {
    const snapshot = await get(this.tableRef);
    const table = snapshot.val() as Table;
    // Ensure players array exists
    if (!table.players) {
      table.players = [];
    }
    return table;
  }

  public async initializeRound(): Promise<void> {
    const table = await this.getTable();
    const activePlayers = table.players.filter(p => p.isActive && p.chips > 0);
    
    if (activePlayers.length < 2) {
      throw new Error('Not enough players to start a round');
    }

    // Rotate dealer position
    const newDealerPosition = (table.dealerPosition + 1) % activePlayers.length;
    const smallBlindPos = (newDealerPosition + 1) % activePlayers.length;
    const bigBlindPos = (newDealerPosition + 2) % activePlayers.length;

    // Find the actual indices in the full players array
    const smallBlindPlayer = activePlayers[smallBlindPos];
    const bigBlindPlayer = activePlayers[bigBlindPos];
    const nextActivePlayerIndex = (bigBlindPos + 1) % activePlayers.length;
    const nextPlayer = activePlayers[nextActivePlayerIndex];
    
    // Find the actual index in the full players array
    const currentPlayerIndex = table.players.findIndex(p => p.id === nextPlayer.id);

    // Reset table state for new round
    const updates: Partial<Table> = {
      dealerPosition: newDealerPosition,
      currentPlayerIndex,
      phase: 'preflop',
      pot: 0,
      currentBet: table.bigBlind || GameManager.DEFAULT_BIG_BLIND,
      communityCards: [],
      bettingRound: 'small_blind',
      lastActionTimestamp: Date.now(),
      smallBlind: table.smallBlind || GameManager.DEFAULT_SMALL_BLIND,
      bigBlind: table.bigBlind || GameManager.DEFAULT_BIG_BLIND,
      roundBets: {},
      minRaise: table.bigBlind || GameManager.DEFAULT_BIG_BLIND,
      turnTimeLimit: GameManager.TURN_TIME_LIMIT,
    };

    // Post blinds
    updates.roundBets = {
      [smallBlindPlayer.id]: updates.smallBlind!,
      [bigBlindPlayer.id]: updates.bigBlind!,
    };

    // Update players' chips
    const updatedPlayers = table.players.map(player => {
      if (player.id === smallBlindPlayer.id) {
        return { ...player, chips: player.chips - updates.smallBlind! };
      }
      if (player.id === bigBlindPlayer.id) {
        return { ...player, chips: player.chips - updates.bigBlind! };
      }
      return { ...player, hasFolded: false };
    });

    updates.players = updatedPlayers;
    await update(this.tableRef, updates);
  }

  public async handlePlayerAction(
    playerId: string, 
    action: 'fold' | 'call' | 'raise',
    raiseAmount?: number
  ): Promise<void> {
    const table = await this.getTable();
    const currentPlayer = table.players[table.currentPlayerIndex];
    
    if (currentPlayer.id !== playerId) {
      throw new Error('Not your turn');
    }

    if (Date.now() - table.lastActionTimestamp > table.turnTimeLimit) {
      // Auto-fold on timeout
      await this.handleFold(playerId);
      return;
    }

    switch (action) {
      case 'fold':
        await this.handleFold(playerId);
        break;
      case 'call':
        await this.handleCall(playerId);
        break;
      case 'raise':
        if (!raiseAmount || raiseAmount < table.minRaise) {
          throw new Error('Invalid raise amount');
        }
        await this.handleRaise(playerId, raiseAmount);
        break;
    }
  }

  private async handleFold(playerId: string): Promise<void> {
    const table = await this.getTable();
    const updatedPlayers = table.players.map(player =>
      player.id === playerId ? { ...player, hasFolded: true } : player
    );

    await this.moveToNextPlayer(table, updatedPlayers);
  }

  private async handleCall(playerId: string): Promise<void> {
    const table = await this.getTable();
    const player = table.players.find(p => p.id === playerId)!;
    const callAmount = table.currentBet - (table.roundBets[playerId] || 0);
    
    if (callAmount > player.chips) {
      throw new Error('Not enough chips to call');
    }

    const updatedPlayers = table.players.map(p =>
      p.id === playerId ? { ...p, chips: p.chips - callAmount } : p
    );

    const roundBets = {
      ...table.roundBets,
      [playerId]: (table.roundBets[playerId] || 0) + callAmount,
    };

    await this.moveToNextPlayer(table, updatedPlayers, roundBets);
  }

  private async handleRaise(playerId: string, raiseAmount: number): Promise<void> {
    const tableRef = this.tableRef;
    
    await runTransaction(tableRef, (currentTable: Table) => {
      if (!currentTable) return currentTable;

      const player = currentTable.players.find(p => p.id === playerId)!;
      const currentBet = currentTable.currentBet || 0;
      const playerCurrentBet = currentTable.roundBets[playerId] || 0;
      const totalBetAmount = raiseAmount - playerCurrentBet;

      // Validate the raise
      if (totalBetAmount > player.chips) {
        throw new Error('Not enough chips to raise');
      }
      if (raiseAmount <= currentBet) {
        throw new Error('Raise amount must be greater than current bet');
      }

      // Update player chips and round bets atomically
      const updatedPlayers = currentTable.players.map(p =>
        p.id === playerId ? { ...p, chips: p.chips - totalBetAmount } : p
      );

      const roundBets = {
        ...currentTable.roundBets,
        [playerId]: raiseAmount,
      };

      // Calculate new pot
      const newPot = currentTable.pot + totalBetAmount;

      // Update table state atomically
      return {
        ...currentTable,
        players: updatedPlayers,
        currentBet: raiseAmount,
        minRaise: raiseAmount + (currentTable.minRaise || GameManager.DEFAULT_BIG_BLIND),
        pot: newPot,
        roundBets,
        lastActionTimestamp: Date.now(),
      };
    });

    // After successful transaction, get updated table state and move to next player
    const updatedTable = await this.getTable();
    await this.moveToNextPlayer(
      updatedTable,
      updatedTable.players,
      updatedTable.roundBets,
      updatedTable.currentBet,
      updatedTable.minRaise
    );
  }

  private isPlayerAllIn(player: Player, roundBets: { [playerId: string]: number }): boolean {
    return player.isActive && !player.hasFolded && player.chips === 0;
  }

  private async moveToNextPlayer(
    table: Table,
    updatedPlayers: Player[],
    roundBets?: { [playerId: string]: number },
    newCurrentBet?: number,
    newMinRaise?: number
  ): Promise<void> {
    const activePlayers = updatedPlayers.filter(p => p.isActive && !p.hasFolded);
    const currentRoundBets = roundBets || table.roundBets;
    
    if (activePlayers.length === 1) {
      // Round over - one player remains
      await this.endRound(table, updatedPlayers);
      return;
    }

    // Check if all remaining players are all-in
    const allInPlayers = activePlayers.filter(p => this.isPlayerAllIn(p, currentRoundBets));
    const nonAllInPlayer = activePlayers.find(p => !this.isPlayerAllIn(p, currentRoundBets));
    
    if (allInPlayers.length === activePlayers.length || 
        (allInPlayers.length === activePlayers.length - 1 && 
         nonAllInPlayer && nonAllInPlayer.chips <= table.currentBet)) {
      // All players are all-in or only one player has chips but can't call
      const updates: Partial<Table> = {
        players: updatedPlayers,
        phase: 'showdown',
        lastActionTimestamp: Date.now(),
      };
      await update(this.tableRef, updates);
      return;
    }

    let nextPlayerIndex = (table.currentPlayerIndex + 1) % table.players.length;
    while (
      !table.players[nextPlayerIndex].isActive ||
      table.players[nextPlayerIndex].hasFolded ||
      table.players[nextPlayerIndex].chips === 0
    ) {
      nextPlayerIndex = (nextPlayerIndex + 1) % table.players.length;
    }

    const updates: Partial<Table> = {
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      lastActionTimestamp: Date.now(),
    };

    if (roundBets) {
      updates.roundBets = roundBets;
    }
    if (newCurrentBet !== undefined) {
      updates.currentBet = newCurrentBet;
    }
    if (newMinRaise !== undefined) {
      updates.minRaise = newMinRaise;
    }

    // Check if betting round is complete
    const allPlayersActed = this.checkAllPlayersActed(table, updates);
    if (allPlayersActed) {
      await this.moveToNextPhase(table, updates);
    } else {
      await update(this.tableRef, updates);
    }
  }

  private checkAllPlayersActed(table: Table, updates: Partial<Table>): boolean {
    const roundBets = updates.roundBets || table.roundBets;
    const currentBet = updates.currentBet || table.currentBet;
    
    return table.players
      .filter(p => p.isActive && !p.hasFolded && p.chips > 0)
      .every(p => roundBets[p.id] === currentBet || p.chips === 0);
  }

  private async moveToNextPhase(table: Table, updates: Partial<Table>): Promise<void> {
    const phases: Array<Table['phase']> = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentPhaseIndex = phases.indexOf(table.phase);
    
    if (currentPhaseIndex === -1 || currentPhaseIndex === phases.length - 1) {
      await this.endRound(table, updates.players || table.players);
      return;
    }

    updates.phase = phases[currentPhaseIndex + 1];
    updates.currentBet = 0;
    updates.roundBets = {};
    updates.minRaise = table.bigBlind;
    
    // Reset betting to player after dealer
    const activePlayers = (updates.players || table.players)
      .filter(p => p.isActive && !p.hasFolded && p.chips > 0);
    
    if (activePlayers.length > 1) {
      const firstToActIndex = (table.dealerPosition + 1) % activePlayers.length;
      updates.currentPlayerIndex = firstToActIndex;
    }

    await update(this.tableRef, updates);
  }

  public async startNewHand(): Promise<void> {
    // Reset the deck
    this.deck = new Deck();
    const table = await this.getTable();
    
    // Deal hole cards to active players and store them in private refs
    const updatedPlayers = table.players.map((player) => ({
      ...player,
      hasFolded: false,
    }));

    // Deal and store private cards
    for (const player of table.players) {
      if (player.isActive) {
        const cards = this.deck.dealHoleCards();
        if (!cards) {
          throw new Error('Not enough cards in deck');
        }
        
        // Store hole cards in private reference
        const privateData: PrivatePlayerData = {
          holeCards: cards,
          lastUpdated: Date.now(),
        };
        await set(this.getPrivatePlayerRef(player.id), privateData);
      }
    }

    await this.initializeRound();
    await update(this.tableRef, { players: updatedPlayers });
  }

  public async dealFlop(): Promise<void> {
    const table = await this.getTable();
    if (table.phase !== 'preflop') {
      throw new Error('Cannot deal flop at this time');
    }

    const flop = this.deck.dealFlop();
    if (!flop) {
      throw new Error('Not enough cards in deck');
    }

    await update(this.tableRef, {
      communityCards: flop,
      phase: 'flop',
      currentBet: 0,
      roundBets: {},
      minRaise: table.bigBlind,
    });
  }

  public async dealTurn(): Promise<void> {
    const table = await this.getTable();
    if (table.phase !== 'flop') {
      throw new Error('Cannot deal turn at this time');
    }

    const turnCard = this.deck.dealCard();
    if (!turnCard) {
      throw new Error('Not enough cards in deck');
    }

    await update(this.tableRef, {
      communityCards: [...table.communityCards, turnCard],
      phase: 'turn',
      currentBet: 0,
      roundBets: {},
      minRaise: table.bigBlind,
    });
  }

  public async dealRiver(): Promise<void> {
    const table = await this.getTable();
    if (table.phase !== 'turn') {
      throw new Error('Cannot deal river at this time');
    }

    const riverCard = this.deck.dealCard();
    if (!riverCard) {
      throw new Error('Not enough cards in deck');
    }

    await update(this.tableRef, {
      communityCards: [...table.communityCards, riverCard],
      phase: 'river',
      currentBet: 0,
      roundBets: {},
      minRaise: table.bigBlind,
    });
  }

  private async evaluatePlayerHands(table: Table): Promise<Array<{ playerId: string; hand: Hand }>> {
    const activePlayers = table.players.filter((p) => p.isActive && !p.hasFolded);
    
    // Get all hole cards and evaluate hands
    const evaluations = await Promise.all(
      activePlayers.map(async (player) => {
        const holeCards = await this.getPlayerHoleCards(player.id);
        if (!holeCards) {
          return null;
        }
        
        const hand = findBestHand(holeCards, table.communityCards);
        return {
          playerId: player.id,
          hand,
        };
      })
    );

    // Filter out null results and sort by hand value
    return evaluations
      .filter((evaluation): evaluation is { playerId: string; hand: Hand } => evaluation !== null)
      .sort((a, b) => b.hand.value - a.hand.value);
  }

  private async getWinners(table: Table): Promise<string[]> {
    const activePlayers = table.players.filter(p => p.isActive && !p.hasFolded);
    if (activePlayers.length <= 1) {
      return activePlayers.map(p => p.id);
    }

    // Get all hole cards for active players
    const playerHands = await Promise.all(
      activePlayers.map(async (player) => {
        const holeCards = await this.getPlayerHoleCards(player.id);
        return {
          playerId: player.id,
          cards: holeCards || [],
        };
      })
    );

    // Find best hand for each player
    const playerHandRankings = playerHands.map((hand) => {
      const bestHand = findBestHand(hand.cards, table.communityCards);
      return {
        playerId: hand.playerId,
        handValue: bestHand.value,
      };
    });

    // Find highest hand value
    const highestHandValue = Math.max(...playerHandRankings.map(h => h.handValue));

    // Return all players with the highest hand value (handles split pots)
    return playerHandRankings
      .filter(h => h.handValue === highestHandValue)
      .map(h => h.playerId);
  }

  private async endRound(table: Table, players: Player[]): Promise<void> {
    const winners = await this.getWinners(table);
    const winningAmount = table.pot / winners.length;

    const updatedPlayers = players.map(player => {
      if (winners.includes(player.id)) {
        return { ...player, chips: player.chips + winningAmount };
      }
      return player;
    });

    // Clear private data for all players
    for (const player of players) {
      await set(this.getPrivatePlayerRef(player.id), null);
    }

    await update(this.tableRef, {
      players: updatedPlayers,
      phase: 'showdown',
      winners,
      pot: 0,
      currentBet: 0,
      roundBets: {},
      communityCards: [],
      lastActionTimestamp: Date.now(),
    });
  }

  public async getPlayerHoleCards(playerId: string): Promise<Card[] | null> {
    const snapshot = await get(this.getPrivatePlayerRef(playerId));
    const privateData = snapshot.val() as PrivatePlayerData | null;
    return privateData?.holeCards || null;
  }
} 