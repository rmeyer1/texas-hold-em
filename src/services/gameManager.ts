import { ref, set, update, onValue, off, get, runTransaction, DatabaseReference } from 'firebase/database';
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

  private getCurrentUserId(): string | null {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      console.warn('[GameManager] No authenticated user:', {
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
      });
      return null;
    }
    return user.uid;
  }

  private getPrivatePlayerRef(playerId: string): DatabaseReference {
    if (!this.tableRef.key) {
      console.error('[GameManager] Invalid table reference:', {
        tableId: this.tableRef.key,
        playerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error('Invalid table reference');
    }

    if (!playerId) {
      console.error('[GameManager] Invalid player ID:', {
        tableId: this.tableRef.key,
        playerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error('Invalid player ID');
    }

    const path = `private_player_data/${this.tableRef.key}/${playerId}`;
    console.log('[GameManager] Getting private player ref:', {
      tableId: this.tableRef.key,
      playerId,
      path,
      timestamp: new Date().toISOString(),
    });
    
    return ref(database, path);
  }

  public async initialize(): Promise<void> {
    console.log('[GameManager] Initializing table:', {
      tableId: this.tableRef.key,
      timestamp: new Date().toISOString(),
    });

    const initialTable: Table = {
      id: this.tableRef.key!,
      players: [],
      communityCards: [], // Explicitly initialize as empty array
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
      console.error('[GameManager] Failed to initialize table with valid state:', {
        tableId: this.tableRef.key,
        errors: validationErrors,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Table initialization failed: ${validationErrors.join(', ')}`);
    }

    await set(this.tableRef, initialTable);
    console.log('[GameManager] Table initialized successfully:', {
      tableId: this.tableRef.key,
      timestamp: new Date().toISOString(),
      initialState: initialTable,
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
    if (!Array.isArray(table.communityCards)) {
      console.error('[GameManager] Invalid community cards:', {
        tableId: table.id,
        phase: table.phase,
        communityCards: table.communityCards,
        timestamp: new Date().toISOString(),
      });
      errors.push('Invalid community cards array');
    }
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

    // Community cards validation based on phase
    if (Array.isArray(table.communityCards)) {
      const expectedCardCounts = {
        waiting: 0,
        preflop: 0,
        flop: 3,
        turn: 4,
        river: 5,
        showdown: 5,
      };

      const expectedCount = expectedCardCounts[table.phase];
      if (table.communityCards.length !== expectedCount) {
        console.error('[GameManager] Unexpected number of community cards for phase:', {
          tableId: table.id,
          phase: table.phase,
          expectedCards: expectedCount,
          actualCards: table.communityCards.length,
          communityCards: table.communityCards,
          timestamp: new Date().toISOString(),
        });
        errors.push(`Invalid number of community cards for phase ${table.phase}: expected ${expectedCount}, got ${table.communityCards.length}`);
      }
    }

    return errors;
  }

  public subscribeToTableState(callback: (table: Table) => void): () => void {
    this.tableStateCallback = callback;
    const auth = getAuth();
    
    // Create a unique identifier for this subscription
    const subscriptionId = Math.random().toString(36).slice(2);
    
    console.log('[GameManager] Subscribing to table state:', {
      subscriptionId,
      tableId: this.tableRef.key,
      auth: {
        currentUser: !!auth.currentUser,
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
      },
      timestamp: new Date().toISOString(),
      stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
    });
    
    const unsubscribe = onValue(this.tableRef, (snapshot) => {
      const table = snapshot.val() as Table;
      const currentAuth = getAuth();
      
      console.log('[GameManager] Table state updated:', {
        subscriptionId,
        tableId: this.tableRef.key,
        phase: table?.phase,
        playerCount: table?.players?.length,
        activePlayers: table?.players?.filter(p => p.isActive).length,
        players: table?.players?.map(p => ({
          id: p.id,
          name: p.name,
          isActive: p.isActive,
          hasFolded: p.hasFolded,
        })),
        auth: {
          currentUser: !!currentAuth.currentUser,
          userId: currentAuth.currentUser?.uid,
          email: currentAuth.currentUser?.email,
        },
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
      });
      
      this.tableStateCallback?.(table);
    });
    
    return () => {
      console.log('[GameManager] Unsubscribing from table state:', {
        subscriptionId,
        tableId: this.tableRef.key,
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
      });
      off(this.tableRef);
      this.tableStateCallback = undefined;
    };
  }

  public async getTableState(): Promise<Table | null> {
    try {
      console.log('[GameManager] Getting table state:', {
        tableId: this.tableRef.key,
        timestamp: new Date().toISOString()
      });

      const snapshot = await get(this.tableRef);
      const table = snapshot.val() as Table | null;

      if (!table) {
        console.warn('[GameManager] Table not found:', {
          tableId: this.tableRef.key,
          timestamp: new Date().toISOString()
        });
        return null;
      }

      console.log('[GameManager] Retrieved table state:', {
        tableId: this.tableRef.key,
        phase: table.phase,
        playerCount: table.players.length,
        activePlayers: table.players.filter(p => p.isActive).length,
        isHandInProgress: table.isHandInProgress,
        timestamp: new Date().toISOString()
      });

      return table;
    } catch (error) {
      console.error('[GameManager] Error getting table state:', {
        tableId: this.tableRef.key,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
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

  public async handlePlayerAction(
    playerId: string,
    action: 'fold' | 'check' | 'call' | 'raise',
    amount?: number
  ): Promise<void> {
    // Add request ID for tracing
    const requestId = Math.random().toString(36).substring(7);
    console.log('[GameManager] Starting player action:', {
      requestId,
      playerId,
      action,
      amount,
      timestamp: new Date().toISOString(),
    });

    try {
      // First verify authentication with enhanced error handling
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        console.error('[GameManager] Authentication error:', {
          requestId,
          playerId,
          error: 'No authenticated user',
          timestamp: new Date().toISOString(),
        });
        throw new Error('No authenticated user');
      }

      if (user.uid !== playerId) {
        console.error('[GameManager] Authorization error:', {
          requestId,
          playerId,
          userId: user.uid,
          error: 'Not authorized to perform this action',
          timestamp: new Date().toISOString(),
        });
        throw new Error('Not authorized to perform this action');
      }

      // Get table state with validation
      const tableSnapshot = await get(this.tableRef);
      if (!tableSnapshot.exists()) {
        console.error('[GameManager] Table not found:', {
          requestId,
          playerId,
          tableId: this.tableRef.key,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Table not found');
      }

      const table = tableSnapshot.val() as Table;
      
      // Validate table state
      if (!table.players || !Array.isArray(table.players)) {
        console.error('[GameManager] Invalid table state - players array missing:', {
          requestId,
          playerId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Invalid table state - players array missing');
      }

      // Ensure communityCards is always an array
      if (!Array.isArray(table.communityCards)) {
        console.warn('[GameManager] Community cards not initialized:', {
          requestId,
          playerId,
          timestamp: new Date().toISOString(),
        });
        table.communityCards = [];
      }

      // Ensure roundBets is always initialized
      if (!table.roundBets) {
        console.warn('[GameManager] Round bets not initialized:', {
          requestId,
          playerId,
          timestamp: new Date().toISOString(),
        });
        table.roundBets = {};
      }

      // Find current player with validation
      const playerIndex = table.players.findIndex((p) => p.id === playerId);
      if (playerIndex === -1) {
        console.error('[GameManager] Player not found in table:', {
          requestId,
          playerId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Player not found in table');
      }

      const currentPlayer = table.players[playerIndex];
      
      // Validate player state
      if (!currentPlayer.isActive) {
        console.error('[GameManager] Player is not active:', {
          requestId,
          playerId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Player is not active');
      }

      if (currentPlayer.hasFolded) {
        console.error('[GameManager] Player has already folded:', {
          requestId,
          playerId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Player has already folded');
      }

      // Validate current player's turn
      if (table.currentPlayerIndex !== playerIndex) {
        console.error('[GameManager] Not player\'s turn:', {
          requestId,
          playerId,
          currentPlayerIndex: table.currentPlayerIndex,
          playerIndex,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Not your turn');
      }

      // Handle the action with enhanced logging
      console.log('[GameManager] Processing player action:', {
        requestId,
        playerId,
        action,
        amount,
        currentBet: table.currentBet,
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });

      switch (action) {
        case 'fold':
          await this.handleFold(table, playerId);
          break;
        case 'check':
          await this.handleCheck(table, playerId);
          break;
        case 'call':
          await this.handleCall(table, playerId);
          break;
        case 'raise':
          if (typeof amount !== 'number' || amount <= 0) {
            console.error('[GameManager] Invalid raise amount:', {
              requestId,
              playerId,
              amount,
              timestamp: new Date().toISOString(),
            });
            throw new Error('Invalid raise amount');
          }
          await this.handleRaise(table, playerId, amount);
          break;
        default:
          console.error('[GameManager] Invalid action:', {
            requestId,
            playerId,
            action,
            timestamp: new Date().toISOString(),
          });
          throw new Error('Invalid action');
      }

      console.log('[GameManager] Successfully processed player action:', {
        requestId,
        playerId,
        action,
        amount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[GameManager] Error handling player action:', {
        requestId,
        playerId,
        action,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  private async handleFold(table: Table, playerId: string): Promise<void> {
    const updatedPlayers = table.players.map(p =>
      p.id === playerId ? { ...p, hasFolded: true } : p
    );

    const activePlayers = updatedPlayers.filter(p => !p.hasFolded && p.isActive);

    // If only one player remains, they win the pot
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const updatedPlayersWithWinner = updatedPlayers.map(p =>
        p.id === winner.id ? { ...p, chips: p.chips + table.pot } : p
      );

      await update(this.tableRef, {
        players: updatedPlayersWithWinner,
        pot: 0,
        phase: 'waiting',
        lastAction: 'fold',
        lastActivePlayer: table.players.find(p => p.id === playerId)?.name,
        lastActionTimestamp: Date.now(),
      });

      // Start a new hand after a delay
      setTimeout(async () => {
        await this.startNewHand();
      }, 3000);
      return;
    }

    await update(this.tableRef, {
      players: updatedPlayers,
      lastAction: 'fold',
      lastActivePlayer: table.players.find(p => p.id === playerId)?.name,
      lastActionTimestamp: Date.now(),
    });

    await this.moveToNextPlayer(table, updatedPlayers);
  }

  private async handleCheck(table: Table, playerId: string): Promise<void> {
    if (table.currentBet > 0) {
      throw new Error('Cannot check when there is a bet');
    }

    // Add the check action to roundBets
    const roundBets = {
      ...table.roundBets,
      [playerId]: 0,  // Record that this player has checked
    };

    await update(this.tableRef, {
      roundBets,
      lastAction: 'check',
      lastActivePlayer: table.players.find(p => p.id === playerId)?.name,
      lastActionTimestamp: Date.now(),
    });

    await this.moveToNextPlayer(table, table.players, roundBets);
  }

  private async handleCall(table: Table, playerId: string): Promise<void> {
    const currentPlayer = table.players.find(p => p.id === playerId);
    if (!currentPlayer) {
      throw new Error('Player not found');
    }

    const currentPlayerBet = table.roundBets[playerId] || 0;
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
  }

  private async handleRaise(table: Table, playerId: string, raiseAmount: number): Promise<void> {
    if (raiseAmount <= table.currentBet) {
      throw new Error('Raise amount must be greater than current bet');
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

  private checkAllPlayersActed(table: Table, updates: Partial<Table>): boolean {
    const activePlayers = table.players.filter(p => p.isActive && !p.hasFolded && p.chips > 0);
    const currentBet = updates.currentBet ?? table.currentBet;
    const roundBets = updates.roundBets ?? table.roundBets ?? {};
    
    // If it's a checking round (currentBet === 0), check if all active players have acted
    if (currentBet === 0) {
      // In a checking round, a player has acted if they have an entry in roundBets
      const allPlayersHaveChecked = activePlayers.every(p => typeof roundBets[p.id] === 'number');
      
      console.log('[GameManager] Checking round status:', {
        activePlayers: activePlayers.map(p => ({ id: p.id, hasChecked: typeof roundBets[p.id] === 'number' })),
        allPlayersHaveChecked,
        roundBets,
        timestamp: new Date().toISOString(),
      });
      
      return allPlayersHaveChecked;
    }
    
    // For betting rounds, check if all players have matched the current bet or are all-in
    return activePlayers.every(p => {
      const playerBet = roundBets[p.id];
      return (typeof playerBet === 'number' && playerBet === currentBet) || // Player has matched the current bet
             (p.chips === 0 && typeof playerBet === 'number'); // Player is all-in and has acted
    });
  }

  private async moveToNextPlayer(
    table: Table,
    updatedPlayers: Player[],
    roundBets?: { [playerId: string]: number },
    newCurrentBet?: number,
    newMinRaise?: number
  ): Promise<void> {
    const activePlayers = updatedPlayers.filter(p => p.isActive && !p.hasFolded);
    
    // Ensure roundBets is always initialized
    const currentRoundBets = roundBets || table.roundBets || {};
    
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
      // First update the current state
      await update(this.tableRef, updates);

      // Then handle phase transition in a separate update
      const phaseUpdates: Partial<Table> = {
        currentBet: 0,
        roundBets: {},
        minRaise: table.bigBlind,
      };

      // Determine next phase and deal appropriate cards
      switch (table.phase) {
        case 'preflop':
          const flop = this.deck.dealFlop();
          if (!flop) {
            throw new Error('Not enough cards in deck');
          }
          phaseUpdates.phase = 'flop';
          phaseUpdates.communityCards = flop;
          break;

        case 'flop':
          const turnCard = this.deck.dealCard();
          if (!turnCard) {
            throw new Error('Not enough cards in deck');
          }
          phaseUpdates.phase = 'turn';
          phaseUpdates.communityCards = table.communityCards ? [...table.communityCards, turnCard] : [turnCard];
          break;

        case 'turn':
          const riverCard = this.deck.dealCard();
          if (!riverCard) {
            throw new Error('Not enough cards in deck');
          }
          phaseUpdates.phase = 'river';
          phaseUpdates.communityCards = table.communityCards ? [...table.communityCards, riverCard] : [riverCard];
          break;

        case 'river':
          await this.endRound(table, updatedPlayers);
          return;
      }

      // Reset betting to player after dealer for the new phase
      const activePlayers = updatedPlayers.filter(p => p.isActive && !p.hasFolded && p.chips > 0);
      if (activePlayers.length > 1) {
        const dealerIndex = table.dealerPosition;
        let firstToActIndex = (dealerIndex + 1) % table.players.length;
        
        // Find the next active player after the dealer
        while (
          !table.players[firstToActIndex].isActive ||
          table.players[firstToActIndex].hasFolded ||
          table.players[firstToActIndex].chips === 0
        ) {
          firstToActIndex = (firstToActIndex + 1) % table.players.length;
        }
        
        phaseUpdates.currentPlayerIndex = firstToActIndex;
      }

      // Update the phase and community cards in a separate operation
      await update(this.tableRef, phaseUpdates);
    } else {
      // If betting round is not complete, just update the current state
      await update(this.tableRef, updates);
    }
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

    // First set gameStarted and phase to waiting
    await update(this.tableRef, { 
      gameStarted: true,
      phase: 'waiting',
      isHandInProgress: false 
    });

    // Then start the first hand
    await this.startNewHand();
  }

  public async startNewHand(): Promise<void> {
    console.log('[GameManager] Starting new hand');
    
    const tableSnapshot = await get(this.tableRef);
    const table = tableSnapshot.val() as Table;

    if (!table) {
      console.error('[GameManager] Table not found when starting new hand');
      throw new Error('Table not found');
    }

    // Reset the deck
    this.deck.reset();
    console.log('[GameManager] Deck reset and shuffled');

    // Get active players and update their states
    const updatedPlayers = table.players.map(player => ({
      ...player,
      hasFolded: false,
    }));

    // Clear all private card data before dealing new cards
    console.log('[GameManager] Clearing private data for all players');
    await Promise.all(
      updatedPlayers.map(async (player) => {
        try {
          const privateRef = this.getPrivatePlayerRef(player.id);
          await set(privateRef, null);
          console.log('[GameManager] Cleared private data for player:', {
            playerId: player.id,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error('[GameManager] Error clearing private data:', {
            playerId: player.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          });
        }
      })
    );

    // Update table state before dealing cards
    const updates: Partial<Table> = {
      isHandInProgress: true,
      phase: 'preflop',
      players: updatedPlayers,
      communityCards: [],
      pot: 0,
      currentBet: 0,
      minRaise: table.bigBlind || 20,
      roundBets: {},
      lastAction: 'New hand started',
      lastActionTimestamp: Date.now()
    };

    // Set hand in progress and phase to preflop before dealing cards
    console.log('[GameManager] Updating table state for new hand');
    await update(this.tableRef, updates);

    // Deal and store private cards
    for (const player of updatedPlayers) {
      if (player.isActive) {
        try {
          const cards = this.deck.dealHoleCards();
          if (!cards) {
            console.error('[GameManager] Not enough cards in deck for player:', {
              playerId: player.id,
              timestamp: new Date().toISOString(),
            });
            throw new Error('Not enough cards in deck');
          }
          
          const privateRef = this.getPrivatePlayerRef(player.id);
          const privateData: PrivatePlayerData = {
            holeCards: cards,
            lastUpdated: Date.now()
          };
          
          console.log('[GameManager] Storing private cards for player:', {
            playerId: player.id,
            timestamp: new Date().toISOString(),
          });

          // Retry up to 3 times with exponential backoff
          let stored = false;
          for (let i = 0; i < 3 && !stored; i++) {
            try {
              await set(privateRef, privateData);
              stored = true;
              console.log('[GameManager] Successfully stored private cards for player:', {
                playerId: player.id,
                attempt: i + 1,
                timestamp: new Date().toISOString(),
              });
            } catch (error) {
              console.error('[GameManager] Error storing private cards (attempt ' + (i + 1) + '):', {
                playerId: player.id,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
              });
              if (i < 2) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
              }
            }
          }

          if (!stored) {
            throw new Error('Failed to store private cards after 3 attempts');
          }
        } catch (error) {
          console.error('[GameManager] Fatal error dealing cards to player:', {
            playerId: player.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          });
          throw error;
        }
      }
    }

    console.log('[GameManager] New hand setup completed');
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
    console.log('[GameManager] Starting hand evaluation:', {
      tableId: this.tableRef.key,
      phase: table.phase,
      timestamp: new Date().toISOString(),
      communityCards: table.communityCards,
    });

    // Skip hand evaluation during pre-flop
    if (table.phase === 'preflop') {
      console.log('[GameManager] Skipping hand evaluation in preflop phase');
      return [];
    }

    const activePlayers = table.players.filter((p) => p.isActive && !p.hasFolded);
    console.log('[GameManager] Active players for hand evaluation:', {
      count: activePlayers.length,
      playerIds: activePlayers.map(p => p.id),
      timestamp: new Date().toISOString(),
    });
    
    // Ensure communityCards is initialized as an array
    if (!Array.isArray(table.communityCards)) {
      console.error('[GameManager] Community cards not properly initialized:', {
        tableId: this.tableRef.key,
        phase: table.phase,
        timestamp: new Date().toISOString(),
        communityCards: table.communityCards,
      });
      table.communityCards = [];
    }
    
    // Get all hole cards and evaluate hands
    const evaluations = await Promise.all(
      activePlayers.map(async (player) => {
        console.log('[GameManager] Evaluating hand for player:', {
          playerId: player.id,
          playerName: player.name,
          timestamp: new Date().toISOString(),
        });

        const holeCards = await this.getPlayerHoleCards(player.id);
        if (!holeCards || !Array.isArray(holeCards) || holeCards.length !== 2) {
          console.error('[GameManager] Invalid hole cards:', {
            playerId: player.id,
            holeCards,
            timestamp: new Date().toISOString(),
          });
          return null;
        }

        console.log('[GameManager] Player hole cards:', {
          playerId: player.id,
          playerName: player.name,
          holeCards,
          timestamp: new Date().toISOString(),
        });

        try {
          const hand = findBestHand(holeCards, table.communityCards);
          console.log('[GameManager] Player hand evaluation result:', {
            playerId: player.id,
            playerName: player.name,
            handRank: hand.rank,
            handValue: hand.value,
            handDescription: hand.description,
            timestamp: new Date().toISOString(),
          });
          return {
            playerId: player.id,
            hand,
          };
        } catch (error) {
          console.error('[GameManager] Error evaluating hand:', {
            playerId: player.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          });
          return null;
        }
      })
    );

    // Filter out null results and sort by hand value
    const validEvaluations = evaluations
      .filter((evaluation): evaluation is { playerId: string; hand: Hand } => evaluation !== null)
      .sort((a, b) => b.hand.value - a.hand.value);

    console.log('[GameManager] Final hand evaluation results:', {
      evaluations: validEvaluations.map(e => ({
        playerId: e.playerId,
        playerName: table.players.find(p => p.id === e.playerId)?.name,
        handRank: e.hand.rank,
        handValue: e.hand.value,
        handDescription: e.hand.description,
      })),
      timestamp: new Date().toISOString(),
    });

    return validEvaluations;
  }

  private async getWinners(table: Table): Promise<string[]> {
    console.log('[GameManager] Starting winner determination:', {
      tableId: this.tableRef.key,
      phase: table.phase,
      timestamp: new Date().toISOString(),
    });

    const activePlayers = table.players.filter(p => p.isActive && !p.hasFolded);
    console.log('[GameManager] Active players for winner determination:', {
      count: activePlayers.length,
      players: activePlayers.map(p => ({ id: p.id, name: p.name })),
      timestamp: new Date().toISOString(),
    });
    
    // If only one player remains, they are the winner
    if (activePlayers.length <= 1) {
      console.log('[GameManager] Single player winner:', {
        winner: activePlayers[0]?.id,
        winnerName: activePlayers[0]?.name,
        reason: 'Last player remaining',
        timestamp: new Date().toISOString(),
      });
      return activePlayers.map(p => p.id);
    }

    // Skip winner evaluation during pre-flop
    if (table.phase === 'preflop') {
      console.log('[GameManager] Skipping winner evaluation in preflop phase');
      return [];
    }

    // Ensure communityCards is initialized as an array
    if (!Array.isArray(table.communityCards)) {
      console.error('[GameManager] Community cards not properly initialized:', {
        tableId: this.tableRef.key,
        phase: table.phase,
        timestamp: new Date().toISOString(),
        communityCards: table.communityCards,
      });
      table.communityCards = [];
    }

    console.log('[GameManager] Community cards for winner determination:', {
      cards: table.communityCards,
      timestamp: new Date().toISOString(),
    });

    // Get all hole cards and evaluate hands for active players
    const playerHandRankings = await Promise.all(
      activePlayers.map(async (player) => {
        console.log('[GameManager] Evaluating hand for winner determination:', {
          playerId: player.id,
          playerName: player.name,
          timestamp: new Date().toISOString(),
        });

        const holeCards = await this.getPlayerHoleCards(player.id);
        if (!holeCards || !Array.isArray(holeCards) || holeCards.length !== 2) {
          console.error('[GameManager] Invalid hole cards for winner evaluation:', {
            playerId: player.id,
            holeCards,
            timestamp: new Date().toISOString(),
          });
          return null;
        }

        console.log('[GameManager] Player hole cards for winner determination:', {
          playerId: player.id,
          playerName: player.name,
          holeCards,
          timestamp: new Date().toISOString(),
        });

        try {
          const bestHand = findBestHand(holeCards, table.communityCards);
          console.log('[GameManager] Player best hand for winner determination:', {
            playerId: player.id,
            playerName: player.name,
            handRank: bestHand.rank,
            handValue: bestHand.value,
            handDescription: bestHand.description,
            timestamp: new Date().toISOString(),
          });
          return {
            playerId: player.id,
            handValue: bestHand.value,
            handRank: bestHand.rank,
            handDescription: bestHand.description,
          };
        } catch (error) {
          console.error('[GameManager] Error evaluating hand for winner:', {
            playerId: player.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          });
          return null;
        }
      })
    );

    // Filter out null results and find highest hand value
    const validRankings = playerHandRankings.filter((ranking): ranking is NonNullable<typeof ranking> => ranking !== null);
    
    if (validRankings.length === 0) {
      console.error('[GameManager] No valid hand rankings found:', {
        tableId: this.tableRef.key,
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });
      return [];
    }

    const highestValue = Math.max(...validRankings.map(r => r.handValue));
    const winners = validRankings
      .filter(r => r.handValue === highestValue)
      .map(r => r.playerId);

    console.log('[GameManager] Winner determination results:', {
      winners: winners.map(winnerId => ({
        id: winnerId,
        name: table.players.find(p => p.id === winnerId)?.name,
        hand: validRankings.find(r => r.playerId === winnerId),
      })),
      allHands: validRankings.map(r => ({
        playerId: r.playerId,
        playerName: table.players.find(p => p.id === r.playerId)?.name,
        handRank: r.handRank,
        handValue: r.handValue,
        handDescription: r.handDescription,
      })),
      timestamp: new Date().toISOString(),
    });

    return winners;
  }

  private async endRound(table: Table, players: Player[]): Promise<void> {
    console.log('[GameManager] Starting end of round:', {
      tableId: this.tableRef.key,
      phase: table.phase,
      pot: table.pot,
      timestamp: new Date().toISOString(),
    });

    const winners = await this.getWinners(table);
    console.log('[GameManager] Round winners determined:', {
      winners: winners.map(winnerId => ({
        id: winnerId,
        name: table.players.find(p => p.id === winnerId)?.name,
      })),
      timestamp: new Date().toISOString(),
    });
    
    // Calculate split pot amount, rounded to 2 decimal places
    const splitPotAmount = Math.floor((table.pot / winners.length) * 100) / 100;
    console.log('[GameManager] Split pot calculation:', {
      totalPot: table.pot,
      numberOfWinners: winners.length,
      splitPotAmount,
      timestamp: new Date().toISOString(),
    });
    
    const updatedPlayers = players.map(player => {
      if (winners.includes(player.id)) {
        const newChips = player.chips + splitPotAmount;
        console.log('[GameManager] Updating winner chips:', {
          playerId: player.id,
          playerName: player.name,
          oldChips: player.chips,
          wonAmount: splitPotAmount,
          newChips,
          timestamp: new Date().toISOString(),
        });
        return {
          ...player,
          chips: newChips,
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
    
    if (!requestingUserId) {
      console.warn('[GameManager] Cannot get hole cards - no authenticated user:', {
        playerId,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
    
    // Security check - only return cards if requesting user is the player
    if (requestingUserId !== playerId) {
      console.warn('[GameManager] Cannot get hole cards - user not authorized:', {
        playerId,
        requestingUserId,
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    try {
      const privateRef = this.getPrivatePlayerRef(playerId);
      const snapshot = await get(privateRef);
      const privateData = snapshot.val() as PrivatePlayerData | null;
      
      if (!privateData || !Array.isArray(privateData.holeCards) || privateData.holeCards.length !== 2) {
        console.warn('[GameManager] Invalid or missing hole cards:', {
          playerId,
          privateData,
          timestamp: new Date().toISOString(),
        });
        return null;
      }
      
      return privateData.holeCards;
    } catch (error) {
      console.error('[GameManager] Error getting player hole cards:', {
        playerId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      return null;
    }
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