import { ref, set, update, onValue, off, get, runTransaction } from 'firebase/database';
import { database } from './firebase';
import type { Player, Card, PrivatePlayerData, Hand, Table } from '@/types/poker';
import { Deck } from '@/utils/deck';
import { findBestHand } from '@/utils/handEvaluator';
import { getAuth } from 'firebase/auth';

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

  private getCurrentUserId(): string {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No authenticated user');
    }
    return user.uid;
  }

  private getPrivatePlayerRef(playerId: string) {
    console.log('[GameManager] Accessing private ref:', {
      playerId,
      path: `private_player_data/${this.tableRef.key}/${playerId}`,
      timestamp: new Date().toISOString()
    });
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
      phase: 'waiting',
      minRaise: GameManager.DEFAULT_BIG_BLIND,
      roundBets: {},
      activePlayerCount: 0,
      lastAction: null,
      lastActivePlayer: null,
      isHandInProgress: false,
      turnTimeLimit: GameManager.TURN_TIME_LIMIT,
      bettingRound: 'first_round',
      gameStarted: false,
      isPrivate: false,
      password: null,
    };

    // Validate the initial table state
    const validationErrors = this.validateTableState(initialTable);
    if (validationErrors.length > 0) {
      console.error('Failed to initialize table with valid state:', validationErrors);
      throw new Error(`Table initialization failed: ${validationErrors.join(', ')}`);
    }

    await set(this.tableRef, initialTable);
    console.log('[GameManager] Table initialized successfully:', {
      tableId: this.tableRef.key,
      timestamp: new Date().toISOString(),
    });
  }

  private validateTableState(table: Table | null): string[] {
    const errors: string[] = [];

    if (!table) {
      errors.push('Table object is null');
      return errors;
    }

    // Required properties validation
    if (!table.id) errors.push('Missing table ID');
    if (!Array.isArray(table.players)) errors.push('Invalid players array');
    if (!Array.isArray(table.communityCards)) errors.push('Invalid community cards array');
    if (typeof table.pot !== 'number') errors.push('Invalid pot amount');
    if (typeof table.currentBet !== 'number') errors.push('Invalid current bet');
    if (typeof table.dealerPosition !== 'number') errors.push('Invalid dealer position');
    if (typeof table.currentPlayerIndex !== 'number') errors.push('Invalid current player index');
    if (typeof table.smallBlind !== 'number') errors.push('Invalid small blind amount');
    if (typeof table.bigBlind !== 'number') errors.push('Invalid big blind amount');
    if (typeof table.lastActionTimestamp !== 'number') errors.push('Invalid last action timestamp');
    if (typeof table.phase !== 'string') errors.push('Invalid game phase');
    if (typeof table.minRaise !== 'number') errors.push('Invalid minimum raise amount');
    if (typeof table.isHandInProgress !== 'boolean') errors.push('Invalid hand in progress state');
    if (typeof table.turnTimeLimit !== 'number') errors.push('Invalid turn time limit');
    if (typeof table.activePlayerCount !== 'number') errors.push('Invalid active player count');
    if (typeof table.bettingRound !== 'string') errors.push('Invalid betting round');

    // Numeric value validations
    if (table.pot < 0) errors.push('Pot amount cannot be negative');
    if (table.currentBet < 0) errors.push('Current bet cannot be negative');
    if (table.smallBlind <= 0) errors.push('Small blind must be positive');
    if (table.bigBlind <= table.smallBlind) errors.push('Big blind must be greater than small blind');
    if (table.minRaise < table.bigBlind) errors.push('Minimum raise must be at least the big blind');
    if (table.activePlayerCount < 0) errors.push('Active player count cannot be negative');

    // Phase validation
    const validPhases = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'];
    if (!validPhases.includes(table.phase)) {
      errors.push(`Invalid game phase: ${table.phase}. Must be one of: ${validPhases.join(', ')}`);
    }

    // Betting round validation
    const validBettingRounds = ['small_blind', 'big_blind', 'first_round', 'betting'];
    if (!validBettingRounds.includes(table.bettingRound)) {
      errors.push(`Invalid betting round: ${table.bettingRound}. Must be one of: ${validBettingRounds.join(', ')}`);
    }

    return errors;
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

  public async getTableState(): Promise<Table | null> {
    return await this.getTable();
  }

  public async addPlayer(player: Omit<Player, 'isActive' | 'hasFolded'>): Promise<void> {
    console.log('[GameManager] Adding player:', player);
    
    // Initialize table if it doesn't exist
    let table = await this.getTable();
    if (!table) {
      await this.initialize();
      table = await this.getTable();
      if (!table) {
        throw new Error('Failed to initialize table');
      }
    }
    
    console.log('[GameManager] Current table state:', table);
    
    const newPlayer: Player = {
      ...player,
      isActive: true,
      hasFolded: false,
    };
    
    const updatedPlayers = Array.isArray(table.players) ? [...table.players] : [];
    console.log('[GameManager] Current players array:', updatedPlayers);
    
    // Check for existing player with same ID
    if (updatedPlayers.some(p => p.id === newPlayer.id)) {
      console.log('[GameManager] Player already exists, skipping addition');
      return; // Player already exists, skip addition
    }
    
    updatedPlayers.push(newPlayer);
    console.log('[GameManager] Updated players array:', updatedPlayers);
    
    await update(this.tableRef, { players: updatedPlayers });
    console.log('[GameManager] Firebase update completed');
  }

  public async foldPlayer(playerId: string): Promise<void> {
    await this.handlePlayerAction(playerId, 'fold');
  }

  public async placeBet(playerId: string, amount: number): Promise<void> {
    await this.handlePlayerAction(playerId, 'raise', amount);
  }

  public async callBet(playerId: string): Promise<void> {
    await this.handlePlayerAction(playerId, 'call');
  }

  public async raiseBet(playerId: string, amount: number): Promise<void> {
    await this.handlePlayerAction(playerId, 'raise', amount);
  }

  private async getTable(): Promise<Table | null> {
    const snapshot = await get(this.tableRef);
    const table = snapshot.val() as Table | null;
    
    if (!table) {
      return null;
    }
    
    // Ensure players array exists
    if (!table.players) {
      table.players = [];
    }
    return table;
  }

  private isTable(table: Table | null): table is Table {
    return table !== null;
  }

  public async initializeRound(): Promise<void> {
    const table = await this.getTable();
    if (!this.isTable(table)) {
      throw new Error('Table not found');
    }

    const activePlayers = table.players.filter(p => p.isActive && p.chips > 0);
    
    // Create a mapping of active player IDs to their original indices
    const playerIndexMap = new Map<string, number>();
    table.players.forEach((player, index) => {
      if (activePlayers.some(ap => ap.id === player.id)) {
        playerIndexMap.set(player.id, index);
      }
    });

    console.log(`[GameManager] Active players: ${activePlayers.length}`, {
      activePlayerIds: activePlayers.map(p => p.id),
      timestamp: new Date().toISOString(),
    });
    
    if (activePlayers.length < 2) {
      throw new Error('Not enough players to start a round');
    }

    // Calculate positions based on active players
    const newDealerPosition = (table.dealerPosition + 1) % activePlayers.length;
    const smallBlindPos = (newDealerPosition + 1) % activePlayers.length;
    const bigBlindPos = (newDealerPosition + 2) % activePlayers.length;
    const nextActivePlayerIndex = (bigBlindPos + 1) % activePlayers.length;

    // Map the active player positions back to table.players indices
    const smallBlindPlayer = activePlayers[smallBlindPos];
    const bigBlindPlayer = activePlayers[bigBlindPos];
    const nextPlayer = activePlayers[nextActivePlayerIndex];
    
    // Get the actual indices in the full players array using the map
    const currentPlayerIndex = playerIndexMap.get(nextPlayer.id)!;

    // Reset table state for new round
    const updates: Partial<Table> = {
      dealerPosition: playerIndexMap.get(activePlayers[newDealerPosition].id)!,
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

  private async handlePlayerAction(
    playerId: string, 
    action: 'fold' | 'call' | 'check' | 'raise',
    raiseAmount?: number
  ): Promise<void> {
    const table = await this.getTable();
    if (!table) {
      throw new Error('Table not found');
    }
    
    const currentPlayer = table.players.find(p => p.id === playerId);
    if (!currentPlayer) {
      throw new Error('Player not found');
    }

    if (Date.now() - table.lastActionTimestamp > table.turnTimeLimit) {
      // Auto-fold on timeout
      await this.handleFold(playerId);
      return;
    }

    const currentPlayerBet = table.roundBets[playerId] || 0;

    switch (action) {
      case 'fold':
        await this.handleFold(playerId);
        await update(this.tableRef, {
          lastAction: 'fold',
          lastActivePlayer: currentPlayer.name,
          lastActionTimestamp: Date.now(),
        });
        break;
      case 'check':
        if (table.currentBet > currentPlayerBet) {
          throw new Error('Cannot check when there is a bet to call');
        }
        await update(this.tableRef, {
          lastAction: 'check',
          lastActivePlayer: currentPlayer.name,
          lastActionTimestamp: Date.now(),
        });
        await this.moveToNextPlayer(table, table.players);
        break;
      case 'call':
        const callAmount = table.currentBet - currentPlayerBet;
        if (callAmount > currentPlayer.chips) {
          throw new Error('Not enough chips to call');
        }

        const updatedPlayers = table.players.map(p =>
          p.id === playerId ? { ...p, chips: p.chips - callAmount } : p
        );

        const roundBets = {
          ...table.roundBets,
          [playerId]: table.currentBet,
        };

        const newPot = table.pot + callAmount;

        await update(this.tableRef, {
          players: updatedPlayers,
          pot: newPot,
          roundBets,
          lastAction: 'call',
          lastActivePlayer: currentPlayer.name,
          lastActionTimestamp: Date.now(),
        });

        await this.moveToNextPlayer(table, updatedPlayers, roundBets);
        break;
      case 'raise':
        if (!raiseAmount || raiseAmount < table.minRaise) {
          throw new Error('Invalid raise amount');
        }
        await this.handleRaise(playerId, raiseAmount);
        await update(this.tableRef, {
          lastAction: 'raise',
          lastActivePlayer: currentPlayer.name,
          lastActionTimestamp: Date.now(),
        });
        break;
      default:
        throw new Error('Invalid action');
    }
  }

  private async handleFold(playerId: string): Promise<void> {
    const table = await this.getTable();
    if (!table) {
      throw new Error('Table not found');
    }
    
    const updatedPlayers = table.players.map(player =>
      player.id === playerId ? { ...player, hasFolded: true } : player
    );

    await this.moveToNextPlayer(table, updatedPlayers);
  }

  private async handleRaise(playerId: string, raiseAmount: number): Promise<void> {
    const table = await this.getTable();
    if (!table) {
      throw new Error('Table not found');
    }

    const currentPlayer = table.players.find(p => p.id === playerId);
    if (!currentPlayer) {
      throw new Error('Player not found');
    }

    const currentPlayerBet = table.roundBets[playerId] || 0;
    const totalBetRequired = raiseAmount;
    const additionalBetRequired = totalBetRequired - currentPlayerBet;

    if (additionalBetRequired > currentPlayer.chips) {
      throw new Error('Not enough chips to raise');
    }

    if (raiseAmount <= table.currentBet) {
      throw new Error('Raise amount must be greater than current bet');
    }

    const updatedPlayers = table.players.map(p =>
      p.id === playerId ? { ...p, chips: p.chips - additionalBetRequired } : p
    );

    const roundBets = {
      ...table.roundBets,
      [playerId]: totalBetRequired,
    };

    const newPot = table.pot + additionalBetRequired;

    await update(this.tableRef, {
      players: updatedPlayers,
      pot: newPot,
      currentBet: raiseAmount,
      roundBets,
      minRaise: raiseAmount * 2,
      lastAction: 'raise',
      lastActivePlayer: currentPlayer.name,
      lastActionTimestamp: Date.now(),
    });

    await this.moveToNextPlayer(table, updatedPlayers, roundBets, raiseAmount, raiseAmount * 2);
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
      // Reset betting-related values for the next phase
      updates.currentBet = 0;
      updates.roundBets = {};
      updates.minRaise = table.bigBlind;

      // Determine next phase and deal appropriate cards
      switch (table.phase) {
        case 'preflop':
          const flop = this.deck.dealFlop();
          if (!flop) {
            throw new Error('Not enough cards in deck');
          }
          updates.phase = 'flop';
          updates.communityCards = flop;
          break;

        case 'flop':
          const turnCard = this.deck.dealCard();
          if (!turnCard) {
            throw new Error('Not enough cards in deck');
          }
          updates.phase = 'turn';
          updates.communityCards = [...table.communityCards, turnCard];
          break;

        case 'turn':
          const riverCard = this.deck.dealCard();
          if (!riverCard) {
            throw new Error('Not enough cards in deck');
          }
          updates.phase = 'river';
          updates.communityCards = [...table.communityCards, riverCard];
          break;

        case 'river':
          await this.endRound(table, updatedPlayers);
          return;
      }

      // Reset betting to player after dealer for the new phase
      const activePlayers = updatedPlayers.filter(p => p.isActive && !p.hasFolded && p.chips > 0);
      if (activePlayers.length > 1) {
        const firstToActIndex = (table.dealerPosition + 1) % activePlayers.length;
        updates.currentPlayerIndex = firstToActIndex;
      }
    }

    await update(this.tableRef, updates);
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

  public async startGame(): Promise<void> {
    const table = await this.getTable();
    if (!this.isTable(table)) {
      throw new Error('Table not found');
    }

    if (table.gameStarted) {
      throw new Error('Game has already started');
    }

    const activePlayers = table.players.filter(p => p.isActive && p.chips > 0);
    if (activePlayers.length < 2) {
      throw new Error('Not enough players to start the game');
    }

    await update(this.tableRef, { gameStarted: true });
    await this.startNewHand();
  }

  public async startNewHand(): Promise<void> {
    const table = await this.getTable();
    if (!this.isTable(table)) {
      throw new Error('Table not found');
    }

    // Only proceed if game has started or if this is called from startGame
    const calledFromStartGame = !table.gameStarted;
    if (!table.gameStarted && !calledFromStartGame) {
      throw new Error('Game has not been started');
    }

    // Reset the deck
    this.deck = new Deck();
    
    // After this point, table is guaranteed to be non-null
    const tableSnapshot = table;
    
    console.log('[GameManager] Starting new hand:', {
      tableId: this.tableRef.key,
      activePlayers: tableSnapshot.players.filter(p => p.isActive).length,
      timestamp: new Date().toISOString()
    });
    
    // Deal hole cards to active players and store them in private refs
    const updatedPlayers = tableSnapshot.players.map((player) => ({
      ...player,
      hasFolded: false,
    }));

    // Deal and store private cards
    for (const player of tableSnapshot.players) {
      if (player.isActive) {
        console.log('[GameManager] Dealing cards to player:', {
          playerId: player.id,
          isActive: player.isActive,
          timestamp: new Date().toISOString()
        });
        
        const cards = this.deck.dealHoleCards();
        if (!cards) {
          console.error('[GameManager] Failed to deal cards:', {
            playerId: player.id,
            reason: 'Not enough cards in deck',
            timestamp: new Date().toISOString()
          });
          throw new Error('Not enough cards in deck');
        }
        
        console.log('[GameManager] Storing private cards:', {
          playerId: player.id,
          timestamp: new Date().toISOString(),
          hasCards: !!cards,
          cardCount: cards.length,
          path: `private_player_data/${this.tableRef.key}/${player.id}`
        });
        
        // Store hole cards in private reference
        const privateData: PrivatePlayerData = {
          holeCards: cards,
          lastUpdated: Date.now(),
        };
        
        try {
          await set(this.getPrivatePlayerRef(player.id), privateData);
          console.log('[GameManager] Successfully stored private cards:', {
            playerId: player.id,
            timestamp: new Date().toISOString(),
            privateRefPath: `private_player_data/${this.tableRef.key}/${player.id}`
          });
        } catch (error) {
          console.error('[GameManager] Failed to store private cards:', {
            playerId: player.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
          // Reset hand in progress flag on error
          await update(this.tableRef, { isHandInProgress: false });
          throw error;
        }
      }
    }

    try {
      await this.initializeRound();
      await update(this.tableRef, { players: updatedPlayers });
      
      console.log('[GameManager] Completed new hand setup:', {
        tableId: this.tableRef.key,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Reset hand in progress flag on error
      await update(this.tableRef, { isHandInProgress: false });
      throw error;
    }
  }

  public async dealFlop(): Promise<void> {
    const table = await this.getTable();
    if (!table) {
      throw new Error('Table not found');
    }
    
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
    if (!table) {
      throw new Error('Table not found');
    }
    
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
    if (!table) {
      throw new Error('Table not found');
    }
    
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
    
    // If only one player remains, they are the winner
    if (activePlayers.length <= 1) {
      return activePlayers.map(p => p.id);
    }

    // Get all hole cards and evaluate hands for active players
    const playerHandRankings = await Promise.all(
      activePlayers.map(async (player) => {
        const holeCards = await this.getPlayerHoleCards(player.id);
        if (!holeCards) {
          return null;
        }
        const bestHand = findBestHand(holeCards, table.communityCards);
        return {
          playerId: player.id,
          handValue: bestHand.value,
          handRank: bestHand.rank,
        };
      })
    );

    // Filter out null results and find highest hand value
    const validRankings = playerHandRankings.filter((ranking): ranking is NonNullable<typeof ranking> => ranking !== null);
    const highestHandValue = Math.max(...validRankings.map(h => h.handValue));

    // Return all players with the highest hand value (handles split pots)
    return validRankings
      .filter(h => h.handValue === highestHandValue)
      .map(h => h.playerId);
  }

  private async endRound(table: Table, players: Player[]): Promise<void> {
    const winners = await this.getWinners(table);
    
    // Calculate split pot amount, rounded to 2 decimal places
    const splitPotAmount = Math.floor((table.pot / winners.length) * 100) / 100;
    
    const updatedPlayers = players.map(player => {
      if (winners.includes(player.id)) {
        return {
          ...player,
          chips: player.chips + splitPotAmount,
        };
      }
      return player;
    });

    // Clear private data for all players
    await Promise.all(
      players.map(async (player) => {
        console.log('[GameManager] Clearing private data for player:', {
          playerId: player.id,
          path: `private_player_data/${this.tableRef.key}/${player.id}`,
          timestamp: new Date().toISOString()
        });
        return set(this.getPrivatePlayerRef(player.id), null);
      })
    );

    // Update table state with winners and reset round-specific data
    await update(this.tableRef, {
      players: updatedPlayers,
      phase: 'showdown',
      winners,
      winningAmount: splitPotAmount,
      pot: 0,
      currentBet: 0,
      roundBets: {},
      communityCards: [],
      lastActionTimestamp: Date.now(),
      isHandInProgress: false, // Reset hand in progress flag
    });

    // Start a new hand automatically if the game has started
    if (table.gameStarted) {
      // Add a small delay to allow UI to update and show the results
      setTimeout(async () => {
        await this.startNewHand();
      }, 3000);
    }
  }

  public async getPlayerHoleCards(playerId: string): Promise<Card[] | null> {
    const requestingUserId = this.getCurrentUserId();
    console.log('[GameManager] getPlayerHoleCards request:', {
      requestingUserId,
      requestedPlayerId: playerId,
      timestamp: new Date().toISOString(),
      privateRefPath: `private_player_data/${this.tableRef.key}/${playerId}`
    });
    
    if (!requestingUserId) {
      console.warn('[GameManager] No requesting user ID available:', {
        timestamp: new Date().toISOString()
      });
      return null;
    }
    
    const snapshot = await get(this.getPrivatePlayerRef(playerId));
    const privateData = snapshot.val() as PrivatePlayerData | null;
    
    console.log('[GameManager] getPlayerHoleCards response:', {
      requestingUserId,
      requestedPlayerId: playerId,
      hasData: !!privateData,
      dataTimestamp: privateData?.lastUpdated,
      currentTimestamp: Date.now(),
      timestamp: new Date().toISOString(),
      snapshotPath: snapshot.ref.toString(),
      retrievedCards: privateData?.holeCards || null
    });
    
    // Security check - only return cards if requesting user is the player
    if (requestingUserId !== playerId) {
      console.warn('[GameManager] Unauthorized hole cards access attempt:', {
        requestingUserId,
        requestedPlayerId: playerId,
        timestamp: new Date().toISOString()
      });
      return null;
    }
    
    return privateData?.holeCards || null;
  }

  public async createTable(
    tableName: string,
    smallBlind: number,
    bigBlind: number,
    maxPlayers: number,
    isPrivate: boolean,
    password?: string
  ): Promise<string> {
    try {
      const auth = getAuth();
      const userId = this.getCurrentUserId();
      if (!userId) {
        throw new Error('User must be authenticated to create a table');
      }

      // Generate unique table ID
      const tableId = `table-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Create initial table state
      const initialTable: Table = {
        id: tableId,
        players: [{
          id: userId,
          name: auth.currentUser?.displayName || 'Player',
          chips: 1000,
          position: 0,
          isActive: true,
          hasFolded: false,
        }],
        communityCards: [],
        pot: 0,
        currentBet: 0,
        dealerPosition: 0,
        currentPlayerIndex: 0,
        smallBlind,
        bigBlind,
        lastActionTimestamp: Date.now(),
        phase: 'waiting',
        minRaise: bigBlind,
        roundBets: {},
        activePlayerCount: 1,
        lastAction: null,
        lastActivePlayer: null,
        isHandInProgress: false,
        turnTimeLimit: GameManager.TURN_TIME_LIMIT,
        bettingRound: 'first_round',
        gameStarted: false,
        isPrivate,
        password: isPrivate ? password || null : null,
      };

      // Create the table in the database
      const tableRef = ref(database, `tables/${tableId}`);
      await set(tableRef, initialTable);

      // Log the created table state for debugging
      console.log('[GameManager] Created new table:', {
        tableId,
        initialState: initialTable,
        timestamp: new Date().toISOString(),
      });

      return tableId;
    } catch (error) {
      console.error('[GameManager] Error creating table:', error);
      throw error;
    }
  }
}

export async function getTableData(tableId: string): Promise<Table | null> {
  try {
    const tableRef = ref(database, `tables/${tableId}`);
    const snapshot = await get(tableRef);
    
    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.val() as Table;
  } catch (error) {
    console.error('[getTableData] Error fetching table data:', error);
    throw error;
  }
} 