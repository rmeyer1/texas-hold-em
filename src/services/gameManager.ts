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

  private async initializeRound(): Promise<void> {
    const roundId = `round-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log('[GameManager] Initializing round:', {
      roundId,
      tableId: this.tableRef.key,
      timestamp: new Date().toISOString(),
    });

    try {
      // Log the current table state before initializing the round
      await this.logTableState('initialize-round-begin');

      // Get the current table state
      const table = await this.getTableState();
      if (!table) {
        console.error('[GameManager] Failed to get table state when initializing round:', {
          roundId,
          tableId: this.tableRef.key,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log('[GameManager] Current table state before initializing round:', {
        roundId,
        phase: table.phase,
        pot: table.pot,
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        dealerPosition: table.dealerPosition,
        timestamp: new Date().toISOString(),
      });

      // Filter active players with chips
      const activePlayers = table.players.filter(p => p.isActive && p.chips > 0);
      console.log('[GameManager] Active players for round:', {
        roundId,
        activePlayerCount: activePlayers.length,
        activePlayerIds: activePlayers.map(p => p.id),
        activePlayerNames: activePlayers.map(p => p.name),
        timestamp: new Date().toISOString(),
      });

      if (activePlayers.length < 2) {
        console.error('[GameManager] Not enough active players to initialize round:', {
          roundId,
          activePlayerCount: activePlayers.length,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Calculate player positions
      const dealerIndex = table.dealerPosition;
      const smallBlindIndex = this.getNextActivePlayerIndex(table, dealerIndex);
      const bigBlindIndex = this.getNextActivePlayerIndex(table, smallBlindIndex);
      const nextPlayerIndex = this.getNextActivePlayerIndex(table, bigBlindIndex);

      console.log('[GameManager] Player positions calculated:', {
        roundId,
        dealerIndex,
        dealerPlayerId: table.players[dealerIndex]?.id,
        smallBlindIndex,
        smallBlindPlayerId: table.players[smallBlindIndex]?.id,
        bigBlindIndex,
        bigBlindPlayerId: table.players[bigBlindIndex]?.id,
        nextPlayerIndex,
        nextPlayerId: table.players[nextPlayerIndex]?.id,
        timestamp: new Date().toISOString(),
      });

      // Set blinds
      const smallBlindValue = table.smallBlind || 10;
      const bigBlindValue = table.bigBlind || 20;

      console.log('[GameManager] Setting blinds:', {
        roundId,
        smallBlindValue,
        bigBlindValue,
        timestamp: new Date().toISOString(),
      });

      // Get players for small and big blinds
      const smallBlindPlayer = table.players[smallBlindIndex];
      const bigBlindPlayer = table.players[bigBlindIndex];

      // Check if players have enough chips for blinds
      if (smallBlindPlayer.chips < smallBlindValue) {
        console.warn('[GameManager] Small blind player has insufficient chips:', {
          roundId,
          playerId: smallBlindPlayer.id,
          playerChips: smallBlindPlayer.chips,
          smallBlindValue,
          timestamp: new Date().toISOString(),
        });
      }

      if (bigBlindPlayer.chips < bigBlindValue) {
        console.warn('[GameManager] Big blind player has insufficient chips:', {
          roundId,
          playerId: bigBlindPlayer.id,
          playerChips: bigBlindPlayer.chips,
          bigBlindValue,
          timestamp: new Date().toISOString(),
        });
      }

      // Prepare updates for table state
      const smallBlindAmount = Math.min(smallBlindPlayer.chips, smallBlindValue);
      const bigBlindAmount = Math.min(bigBlindPlayer.chips, bigBlindValue);
      const potAmount = smallBlindAmount + bigBlindAmount;

      // Update player chips
      const updatedPlayers = [...table.players];
      updatedPlayers[smallBlindIndex] = {
        ...smallBlindPlayer,
        chips: smallBlindPlayer.chips - smallBlindAmount,
      };
      updatedPlayers[bigBlindIndex] = {
        ...bigBlindPlayer,
        chips: bigBlindPlayer.chips - bigBlindAmount,
      };

      // Prepare round bets
      const roundBets: Record<string, number> = {};
      roundBets[smallBlindPlayer.id] = smallBlindAmount;
      roundBets[bigBlindPlayer.id] = bigBlindAmount;

      // Prepare table updates
      const tableUpdates: Partial<Table> = {
        players: updatedPlayers,
        currentPlayerIndex: nextPlayerIndex,
        pot: potAmount,
        currentBet: bigBlindAmount,
        roundBets,
      };

      console.log('[GameManager] Preparing table updates for blinds:', {
        roundId,
        smallBlindPlayerId: smallBlindPlayer.id,
        smallBlindOldChips: smallBlindPlayer.chips,
        smallBlindNewChips: updatedPlayers[smallBlindIndex].chips,
        smallBlindAmount,
        bigBlindPlayerId: bigBlindPlayer.id,
        bigBlindOldChips: bigBlindPlayer.chips,
        bigBlindNewChips: updatedPlayers[bigBlindIndex].chips,
        bigBlindAmount,
        potAmount,
        currentBet: bigBlindAmount,
        roundBets,
        timestamp: new Date().toISOString(),
      });

      // Log the table state before updating
      await this.logTableState('before-blinds-update');

      // Update the table with blinds
      await this.updateTable(tableUpdates);
      console.log('[GameManager] Blinds set successfully:', {
        roundId,
        smallBlindPlayerId: smallBlindPlayer.id,
        smallBlindAmount,
        bigBlindPlayerId: bigBlindPlayer.id,
        bigBlindAmount,
        potAmount,
        timestamp: new Date().toISOString(),
      });

      // Log the table state after updating blinds
      await this.logTableState('after-blinds-update');

      // Deal cards to players
      await this.dealCardsToPlayers(activePlayers);

      // Log the final state after initializing the round
      await this.logTableState('initialize-round-complete');

      // Verify the round was initialized correctly
      const updatedTable = await this.getTableState();
      if (!updatedTable) {
        console.error('[GameManager] Failed to get updated table state after initializing round:', {
          roundId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log('[GameManager] Round initialized successfully:', {
        roundId,
        phase: updatedTable.phase,
        pot: updatedTable.pot,
        currentBet: updatedTable.currentBet,
        roundBets: updatedTable.roundBets,
        currentPlayerIndex: updatedTable.currentPlayerIndex,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[GameManager] Error initializing round:', {
        roundId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Helper method to deal cards to players
  private async dealCardsToPlayers(activePlayers: Player[]): Promise<void> {
    const dealId = `deal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log('[GameManager] Dealing cards to players:', {
      dealId,
      playerCount: activePlayers.length,
      playerIds: activePlayers.map(p => p.id),
      timestamp: new Date().toISOString(),
    });

    try {
      // Reset and shuffle the deck to ensure fresh cards
      this.deck.reset();
      this.deck.shuffle();
      console.log('[GameManager] Deck reset and shuffled:', {
        dealId,
        deckSize: this.deck.getRemainingCards(),
        timestamp: new Date().toISOString(),
      });

      const dealingPromises = activePlayers.map(async (player) => {
        try {
          const cards = this.deck.dealHoleCards();
          if (!cards) {
            console.error('[GameManager] Not enough cards in deck for player:', {
              dealId,
              playerId: player.id,
              remainingCards: this.deck.getRemainingCards(),
              timestamp: new Date().toISOString(),
            });
            return false;
          }

          await this.setPlayerCards(player.id, cards);
          console.log('[GameManager] Cards dealt to player:', {
            dealId,
            playerId: player.id,
            cards: JSON.stringify(cards),
            timestamp: new Date().toISOString(),
          });
          return true;
        } catch (error) {
          console.error('[GameManager] Error dealing cards to player:', {
            dealId,
            playerId: player.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
          });
          return false;
        }
      });

      const results = await Promise.all(dealingPromises);
      const successCount = results.filter(Boolean).length;
      const failedPlayers = activePlayers.filter((_, index) => !results[index]);

      console.log('[GameManager] Cards dealt to players:', {
        dealId,
        successCount,
        failedCount: failedPlayers.length,
        totalPlayers: activePlayers.length,
        timestamp: new Date().toISOString(),
      });

      // If any players failed to receive cards, try to recover
      if (failedPlayers.length > 0) {
        console.log('[GameManager] Attempting to recover failed card deals:', {
          dealId,
          failedPlayerIds: failedPlayers.map(p => p.id),
          timestamp: new Date().toISOString(),
        });

        // Reset the deck again for recovery
        this.deck.reset();
        this.deck.shuffle();

        const recoveryPromises = failedPlayers.map(async (player) => {
          try {
            const cards = this.deck.dealHoleCards();
            if (!cards) {
              console.error('[GameManager] Recovery failed - not enough cards in deck:', {
                dealId,
                playerId: player.id,
                remainingCards: this.deck.getRemainingCards(),
                timestamp: new Date().toISOString(),
              });
              return false;
            }

            await this.setPlayerCards(player.id, cards);
            console.log('[GameManager] Recovery successful - cards dealt to player:', {
              dealId,
              playerId: player.id,
              cards: JSON.stringify(cards),
              timestamp: new Date().toISOString(),
            });
            return true;
          } catch (error) {
            console.error('[GameManager] Recovery failed - error dealing cards:', {
              dealId,
              playerId: player.id,
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString(),
            });
            return false;
          }
        });

        const recoveryResults = await Promise.all(recoveryPromises);
        const recoverySuccessCount = recoveryResults.filter(Boolean).length;

        console.log('[GameManager] Recovery attempt completed:', {
          dealId,
          recoverySuccessCount,
          recoveryFailedCount: failedPlayers.length - recoverySuccessCount,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[GameManager] Error dealing cards to players:', {
        dealId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Helper method to set player cards
  private async setPlayerCards(playerId: string, cards: [Card, Card]): Promise<void> {
    console.log('[GameManager] Setting player cards:', {
      playerId,
      cards: JSON.stringify(cards),
      timestamp: new Date().toISOString(),
    });

    try {
      const privateRef = this.getPrivatePlayerRef(playerId);
      
      // Create a privateData object with cards and timestamp
      const privateData: PrivatePlayerData = {
        holeCards: cards,
        lastUpdated: Date.now()
      };
      
      await set(privateRef, privateData);
      
      console.log('[GameManager] Player cards set successfully:', {
        playerId,
        path: privateRef.toString(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[GameManager] Error setting player cards:', {
        playerId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
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
          stack: error.stack
        } : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      throw error; // Re-throw the error to be handled by the caller
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

    console.log('[GameManager] Starting game with first hand');
    
    // Then start the first hand
    await this.startNewHand();
    
    // Note: startNewHand now calls initializeRound internally
  }

  public async startNewHand(): Promise<void> {
    const handId = `hand-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log('[GameManager] Starting new hand:', {
      handId,
      tableId: this.tableRef.key,
      timestamp: new Date().toISOString(),
    });

    try {
      // Log the current table state before starting a new hand
      await this.logTableState('start-new-hand-begin');

      // Get the current table state
      const table = await this.getTableState();
      if (!table) {
        console.error('[GameManager] Failed to get table state when starting new hand:', {
          handId,
          tableId: this.tableRef.key,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log('[GameManager] Current table state before starting new hand:', {
        handId,
        phase: table.phase,
        pot: table.pot,
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        dealerPosition: table.dealerPosition,
        activePlayerCount: table.players.filter(p => p.isActive && p.chips > 0).length,
        timestamp: new Date().toISOString(),
      });

      // Reset the deck
      this.deck = new Deck();
      this.deck.shuffle();
      console.log('[GameManager] Deck reset and shuffled for new hand:', {
        handId,
        deckSize: this.deck.getRemainingCards(),
        timestamp: new Date().toISOString(),
      });

      // Clear private data for all players
      const updatedPlayers = table.players.map(player => ({
        ...player,
        cards: [],
        hasFolded: false,
      }));

      console.log('[GameManager] Cleared private data for all players:', {
        handId,
        playerCount: updatedPlayers.length,
        timestamp: new Date().toISOString(),
      });

      // Move the dealer button to the next active player
      const activePlayers = updatedPlayers.filter(p => p.isActive && p.chips > 0);
      if (activePlayers.length < 2) {
        console.error('[GameManager] Not enough active players to start a new hand:', {
          handId,
          activePlayerCount: activePlayers.length,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      let newDealerPosition = (table.dealerPosition + 1) % table.players.length;
      while (!table.players[newDealerPosition].isActive || table.players[newDealerPosition].chips <= 0) {
        newDealerPosition = (newDealerPosition + 1) % table.players.length;
      }

      console.log('[GameManager] Moving dealer position:', {
        handId,
        oldDealerPosition: table.dealerPosition,
        newDealerPosition,
        dealerPlayerId: table.players[newDealerPosition].id,
        timestamp: new Date().toISOString(),
      });

      // Update the table state
      const tableUpdate: Partial<Table> = {
        phase: 'preflop',
        pot: 0,
        communityCards: [],
        currentPlayerIndex: -1, // Will be set in initializeRound
        dealerPosition: newDealerPosition,
        players: updatedPlayers,
        roundBets: {},
        currentBet: 0,
        isHandInProgress: true, // Set hand in progress to true
      };

      console.log('[GameManager] Updating table state for new hand:', {
        handId,
        tableUpdate: {
          phase: tableUpdate.phase,
          pot: tableUpdate.pot,
          dealerPosition: tableUpdate.dealerPosition,
          currentPlayerIndex: tableUpdate.currentPlayerIndex,
        },
        timestamp: new Date().toISOString(),
      });

      await this.updateTable(tableUpdate);
      await this.logTableState('after-table-update-before-init-round');

      // Initialize the round to set blinds and deal cards
      console.log('[GameManager] Initializing round to set blinds and deal cards:', {
        handId,
        timestamp: new Date().toISOString(),
      });
      
      await this.initializeRound();
      await this.logTableState('after-initialize-round');

      // Verify blinds were set correctly
      const updatedTable = await this.getTableState();
      if (!updatedTable) {
        console.error('[GameManager] Failed to get updated table state after initializing round:', {
          handId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      console.log('[GameManager] Blinds verification after initializing round:', {
        handId,
        pot: updatedTable.pot,
        smallBlind: updatedTable.smallBlind,
        bigBlind: updatedTable.bigBlind,
        roundBets: updatedTable.roundBets,
        timestamp: new Date().toISOString(),
      });

      // Log the final state of the table after starting a new hand
      console.log('[GameManager] New hand started successfully:', {
        handId,
        phase: updatedTable.phase,
        pot: updatedTable.pot,
        smallBlind: updatedTable.smallBlind,
        bigBlind: updatedTable.bigBlind,
        currentBet: updatedTable.currentBet,
        roundBets: updatedTable.roundBets,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[GameManager] Error starting new hand:', {
        handId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
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
    const tableId = this.tableRef.key;
    
    if (!requestingUserId) {
      console.warn('[GameManager] Cannot get hole cards - no authenticated user:', {
        playerId,
        tableId,
        timestamp: new Date().toISOString(),
      });
      return null;
    }
    
    // Security check - only return cards if requesting user is the player
    if (requestingUserId !== playerId) {
      console.warn('[GameManager] Cannot get hole cards - user not authorized:', {
        playerId,
        requestingUserId,
        tableId,
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    try {
      // First check if a hand is in progress or we're in a valid game phase
      const tableSnapshot = await get(this.tableRef);
      const tableData = tableSnapshot.val() as Table | null;
      
      const isValidGamePhase = tableData && ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(tableData.phase);
      
      if (!tableData || (!tableData.isHandInProgress && !isValidGamePhase)) {
        console.warn('[GameManager] Cannot get hole cards - no hand in progress and invalid game phase:', {
          playerId,
          tableId,
          tableData: tableData ? {
            isHandInProgress: tableData.isHandInProgress,
            phase: tableData.phase,
            isValidGamePhase
          } : 'null',
          timestamp: new Date().toISOString(),
        });
        return null;
      }

      const privateRef = this.getPrivatePlayerRef(playerId);
      const snapshot = await get(privateRef);
      
      if (!snapshot.exists()) {
        console.warn('[GameManager] Private player data does not exist:', {
          playerId,
          tableId,
          path: privateRef.toString(),
          timestamp: new Date().toISOString(),
        });
        
        // If we're in a valid game phase but private data doesn't exist, 
        // we should initialize it with new cards
        const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(tableData.phase);
        if (tableData.isHandInProgress || isValidGamePhase) {
          console.log('[GameManager] Creating missing private player data:', {
            playerId,
            tableId,
            isHandInProgress: tableData.isHandInProgress,
            phase: tableData.phase,
            isValidGamePhase,
            timestamp: new Date().toISOString(),
          });
          
          // Deal new cards for this player
          let cards = this.deck.dealHoleCards();
          
          // If dealing failed, try resetting the deck and dealing again
          if (!cards) {
            console.warn('[GameManager] Failed to deal hole cards, resetting deck and trying again:', {
              playerId,
              remainingCards: this.deck.getRemainingCards(),
              timestamp: new Date().toISOString(),
            });
            
            this.deck.reset();
            cards = this.deck.dealHoleCards();
            
            if (!cards) {
              console.error('[GameManager] Still failed to deal hole cards after deck reset:', {
                playerId,
                remainingCards: this.deck.getRemainingCards(),
                timestamp: new Date().toISOString(),
              });
              return null;
            }
          }
          
          // Create the private player data
          try {
            await this.initializePrivatePlayerData(playerId, cards);
            console.log('[GameManager] Successfully created private player data with new cards:', {
              playerId,
              tableId,
              timestamp: new Date().toISOString(),
            });
            return cards;
          } catch (error) {
            console.error('[GameManager] Error creating private player data:', {
              playerId,
              tableId,
              error: error instanceof Error ? {
                message: error.message,
                stack: error.stack
              } : 'Unknown error',
              timestamp: new Date().toISOString(),
            });
            return null;
          }
        }
        
        return null;
      }
      
      const privateData = snapshot.val() as PrivatePlayerData | null;
      
      if (!privateData) {
        console.warn('[GameManager] Private player data is null:', {
          playerId,
          tableId,
          timestamp: new Date().toISOString(),
        });
        return null;
      }
      
      if (!privateData.holeCards) {
        console.warn('[GameManager] Hole cards property missing in private data:', {
          playerId,
          tableId,
          privateData,
          timestamp: new Date().toISOString(),
        });
        return null;
      }
      
      if (!Array.isArray(privateData.holeCards)) {
        console.warn('[GameManager] Hole cards is not an array:', {
          playerId,
          tableId,
          holeCardsType: typeof privateData.holeCards,
          timestamp: new Date().toISOString(),
        });
        return null;
      }
      
      if (privateData.holeCards.length !== 2) {
        console.warn('[GameManager] Incorrect number of hole cards:', {
          playerId,
          tableId,
          cardCount: privateData.holeCards.length,
          timestamp: new Date().toISOString(),
        });
        return null;
      }
      
      // Validate each card has suit and rank
      const validCards = privateData.holeCards.every(card => 
        card && typeof card === 'object' && 'suit' in card && 'rank' in card);
      
      if (!validCards) {
        console.warn('[GameManager] Invalid card format in hole cards:', {
          playerId,
          tableId,
          cards: privateData.holeCards,
          timestamp: new Date().toISOString(),
        });
        return null;
      }
      
      console.log('[GameManager] Successfully retrieved hole cards:', {
        playerId,
        tableId,
        timestamp: new Date().toISOString(),
      });
      
      return privateData.holeCards;
    } catch (error) {
      console.error('[GameManager] Error getting player hole cards:', {
        playerId,
        tableId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : 'Unknown error',
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
        name: tableName, // Add the table name to the initial state
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
        maxPlayers, // Add maxPlayers to the initial state
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

  private async initializePrivatePlayerData(playerId: string, holeCards: Card[]): Promise<void> {
    try {
      const privateRef = this.getPrivatePlayerRef(playerId);
      
      // Check if private data already exists
      const snapshot = await get(privateRef);
      if (snapshot.exists()) {
        console.log('[GameManager] Private player data already exists, updating:', {
          playerId,
          tableId: this.tableRef.key,
          timestamp: new Date().toISOString(),
        });
        
        // Update existing data
        await update(privateRef, {
          holeCards,
          lastUpdated: Date.now()
        });
        
        console.log('[GameManager] Private player data updated successfully:', {
          playerId,
          tableId: this.tableRef.key,
          cards: JSON.stringify(holeCards),
          timestamp: new Date().toISOString(),
        });
      } else {
        // Create new data
        const privateData: PrivatePlayerData = {
          holeCards,
          lastUpdated: Date.now()
        };
        
        console.log('[GameManager] Initializing private player data:', {
          playerId,
          tableId: this.tableRef.key,
          cards: JSON.stringify(holeCards),
          timestamp: new Date().toISOString(),
        });
        
        await set(privateRef, privateData);
        
        console.log('[GameManager] Private player data initialized successfully:', {
          playerId,
          tableId: this.tableRef.key,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('[GameManager] Error initializing private player data:', {
        playerId,
        tableId: this.tableRef.key,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Logs the current state of the table for debugging purposes
   */
  public async logTableState(context: string = 'debug'): Promise<void> {
    const debugId = `debug-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const table = await this.getTable();
      if (!table) {
        console.error('[GameManager] Cannot log table state - table not found:', {
          debugId,
          context,
          tableId: this.tableRef.key,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const activePlayers = table.players.filter(p => p.isActive);
      const nonFoldedPlayers = activePlayers.filter(p => !p.hasFolded);
      
      console.log('[GameManager] Current table state:', {
        debugId,
        context,
        tableId: this.tableRef.key,
        phase: table.phase,
        pot: table.pot,
        currentBet: table.currentBet,
        smallBlind: table.smallBlind,
        bigBlind: table.bigBlind,
        dealerPosition: table.dealerPosition,
        currentPlayerIndex: table.currentPlayerIndex,
        currentPlayer: table.players[table.currentPlayerIndex]?.name,
        roundBets: table.roundBets,
        bettingRound: table.bettingRound,
        isHandInProgress: table.isHandInProgress,
        communityCards: table.communityCards,
        playerCount: table.players.length,
        activePlayers: activePlayers.length,
        nonFoldedPlayers: nonFoldedPlayers.length,
        players: table.players.map(p => ({
          id: p.id,
          name: p.name,
          chips: p.chips,
          isActive: p.isActive,
          hasFolded: p.hasFolded,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[GameManager] Error logging table state:', {
        debugId,
        context,
        tableId: this.tableRef.key,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async updateTable(updates: Partial<Table>): Promise<void> {
    try {
      console.log('[GameManager] Updating table with:', {
        tableId: this.tableRef.key,
        updates: {
          phase: updates.phase,
          pot: updates.pot,
          dealerPosition: updates.dealerPosition,
          currentPlayerIndex: updates.currentPlayerIndex,
        },
        timestamp: new Date().toISOString(),
      });
      
      await update(this.tableRef, updates);
      
      console.log('[GameManager] Table updated successfully:', {
        tableId: this.tableRef.key,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[GameManager] Error updating table:', {
        tableId: this.tableRef.key,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  // Helper method to get the next active player index
  private getNextActivePlayerIndex(table: Table, currentIndex: number): number {
    let nextIndex = (currentIndex + 1) % table.players.length;
    let loopCount = 0;
    
    // Find the next active player with chips
    while (
      loopCount < table.players.length && 
      (!table.players[nextIndex].isActive || table.players[nextIndex].chips <= 0 || table.players[nextIndex].hasFolded)
    ) {
      nextIndex = (nextIndex + 1) % table.players.length;
      loopCount++;
    }
    
    // If we've gone through all players and found none active, return the original index
    if (loopCount >= table.players.length) {
      console.warn('[GameManager] No active players found when getting next player index:', {
        currentIndex,
        playerCount: table.players.length,
        timestamp: new Date().toISOString(),
      });
      return currentIndex;
    }
    
    return nextIndex;
  }

  // Static method to get table data
  static async getTableData(tableId: string): Promise<Table | null> {
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
} 