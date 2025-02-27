import { getAuth } from 'firebase/auth';
import { DatabaseService } from './databaseService';
import { DeckManager } from './deckManager';
import { PlayerManager } from './playerManager';
import { PhaseManager } from './phaseManager';
import { HandEvaluator } from './handEvaluator';
import type { Table, Player, Card, PlayerAction } from '@/types/poker';
import { serializeError } from '@/utils/errorUtils';
import logger from '@/utils/logger';

export class GameManager {
  private db: DatabaseService;
  private deck: DeckManager;
  private players: PlayerManager;
  private phases: PhaseManager;
  private handEvaluator: HandEvaluator;
  private tableId: string;
  private tableStateCallback?: (table: Table) => void;
  private static readonly TURN_TIME_LIMIT = 45000; // 45 seconds in milliseconds
  private static readonly DEFAULT_SMALL_BLIND = 10;
  private static readonly DEFAULT_BIG_BLIND = 20;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.db = new DatabaseService(tableId);
    this.deck = new DeckManager(tableId);
    this.players = new PlayerManager(tableId);
    this.phases = new PhaseManager(tableId);
    this.handEvaluator = new HandEvaluator(tableId);
  }

  /**
   * Initialize the game manager
   */
  public async initialize(): Promise<void> {
    try {
      const table = await this.db.getTable();
      if (!table) {
        logger.warn('[GameManager] Table not found during initialization');
      }
    } catch (error) {
      logger.error('[GameManager] Error initializing game manager:', {
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Subscribe to table state changes
   */
  public subscribeToTableState(callback: (table: Table) => void): () => void {
    this.tableStateCallback = callback;
    return this.db.subscribeToTable(callback);
  }

  /**
   * Get the current table state
   */
  public async getTableState(): Promise<Table | null> {
    return await this.db.getTable();
  }

  /**
   * Add a player to the table
   */
  public async addPlayer(player: Omit<Player, 'isActive' | 'hasFolded'>): Promise<void> {
    await this.db.addPlayer(player);
  }

  /**
   * Handle a player action (fold, check, call, raise)
   */
  public async handlePlayerAction(
    playerId: string,
    action: PlayerAction,
    amount?: number
  ): Promise<void> {
    try {
      const table = await this.db.getTable();
      if (!table) {
        throw new Error('Table not found');
      }

      // Validate that it's the player's turn
      const currentPlayer = table.players[table.currentPlayerIndex];
      if (currentPlayer.id !== playerId) {
        throw new Error(`Not ${playerId}'s turn to act`);
      }

      // Ensure roundBets is initialized
      if (!table.roundBets) {
        table.roundBets = {};
      }

      // Handle the action
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
          if (amount === undefined) {
            throw new Error('Raise amount is required');
          }
          await this.handleRaise(table, playerId, amount);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      logger.error('[GameManager] Error handling player action:', {
        tableId: this.tableId,
        playerId,
        action,
        amount,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Handle a fold action
   */
  private async handleFold(table: Table, playerId: string): Promise<void> {
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    // Mark player as folded
    this.players.fold(table, playerId);
    
    // Update last action
    table.lastAction = 'fold';
    table.lastActivePlayer = playerId;
    
    // Move to the next player or phase
    await this.moveToNextPlayer(table);
  }

  /**
   * Handle a check action
   */
  private async handleCheck(table: Table, playerId: string): Promise<void> {
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    // Validate that player can check
    if (table.currentBet > 0 && (table.roundBets[playerId] || 0) < table.currentBet) {
      throw new Error('Cannot check when there is an active bet');
    }
    
    // Note: We don't change lastBettor here since a check doesn't change who the last bettor was
    
    // Update last action
    table.lastAction = 'check';
    table.lastActivePlayer = playerId;
    
    // Move to the next player or phase
    await this.moveToNextPlayer(table);
  }

  /**
   * Handle a call action
   */
  private async handleCall(table: Table, playerId: string): Promise<void> {
    const player = table.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    const currentPlayerBet = table.roundBets[playerId] || 0;
    const amountToCall = Math.min(table.currentBet - currentPlayerBet, player.chips);
    
    // Place the bet
    if (amountToCall > 0) {
      const actualBet = this.players.placeBet(table, playerId, amountToCall);
      table.pot += actualBet;
      table.roundBets[playerId] = (table.roundBets[playerId] || 0) + actualBet;
    }
    
    // Note: We don't change lastBettor here since a call doesn't change who the last bettor was
    
    // Update last action
    table.lastAction = 'call';
    table.lastActivePlayer = playerId;
    
    // Move to the next player or phase
    await this.moveToNextPlayer(table);
  }

  /**
   * Handle a raise action
   */
  private async handleRaise(table: Table, playerId: string, raiseAmount: number): Promise<void> {
    const player = table.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    // Validate raise amount
    if (raiseAmount < table.minRaise) {
      throw new Error(`Raise must be at least ${table.minRaise}`);
    }
    
    if (raiseAmount > player.chips) {
      throw new Error(`Cannot raise more than available chips (${player.chips})`);
    }
    
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    const currentPlayerBet = table.roundBets[playerId] || 0;
    const additionalBet = raiseAmount - currentPlayerBet;
    
    // Place the bet
    const actualBet = this.players.placeBet(table, playerId, additionalBet);
    table.pot += actualBet;
    table.roundBets[playerId] = raiseAmount;
    
    // Update table state
    table.currentBet = raiseAmount;
    table.minRaise = raiseAmount * 2;
    
    // Set this player as the last bettor
    table.lastBettor = playerId;
    
    // Update last action
    table.lastAction = 'raise';
    table.lastActivePlayer = playerId;
    
    // Move to the next player or phase
    await this.moveToNextPlayer(table);
  }

  /**
   * Move to the next player or phase
   */
  private async moveToNextPlayer(table: Table): Promise<void> {
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    // Check if only one player remains active
    if (this.players.getActiveCount(table) <= 1) {
      await this.endRound(table);
      return;
    }
    
    // Check if all players have acted and bets are equal
    if (this.phases.shouldAdvancePhase(table)) {
      await this.moveToNextPhase(table);
      return;
    }
    
    // Move to the next active player
    table.currentPlayerIndex = this.players.getNextActivePlayerIndex(table, table.currentPlayerIndex);
    table.lastActionTimestamp = Date.now();
    
    // Update the table
    await this.db.updateTable(table);
  }

  /**
   * Move to the next phase
   */
  private async moveToNextPhase(table: Table): Promise<void> {
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    const updates = this.phases.prepareNextPhase(table);
    
    // Apply updates to table
    Object.assign(table, updates);
    
    // If moving to showdown, end the round
    if (table.phase === 'showdown') {
      await this.endRound(table);
      return;
    }
    
    // Deal community cards based on the new phase
    switch (table.phase) {
      case 'flop':
        await this.dealFlop(table);
        break;
      case 'turn':
        await this.dealTurn(table);
        break;
      case 'river':
        await this.dealRiver(table);
        break;
    }
    
    // Update the table
    await this.db.updateTable(table);
  }

  /**
   * Deal the flop
   */
  private async dealFlop(table: Table): Promise<void> {
    const flop = this.deck.dealFlop();
    if (flop) {
      table.communityCards = [...flop];
    }
  }

  /**
   * Deal the turn
   */
  private async dealTurn(table: Table): Promise<void> {
    const turnCard = this.deck.dealCard();
    if (turnCard) {
      table.communityCards.push(turnCard);
    }
  }

  /**
   * Deal the river
   */
  private async dealRiver(table: Table): Promise<void> {
    const riverCard = this.deck.dealCard();
    if (riverCard) {
      table.communityCards.push(riverCard);
    }
  }

  /**
   * End the current round and determine winners
   */
  private async endRound(table: Table): Promise<void> {
    try {
      // Ensure roundBets is initialized
      if (!table.roundBets) {
        table.roundBets = {};
      }
      
      // Determine winners
      const winners = await this.handEvaluator.getWinners(table);
      
      // Calculate winnings
      const winningAmount = Math.floor(table.pot / winners.length);
      
      // Distribute pot to winners
      winners.forEach(winnerId => {
        const winner = table.players.find(p => p.id === winnerId);
        if (winner) {
          winner.chips += winningAmount;
        }
      });
      
      // Update table state
      table.phase = 'showdown';
      table.isHandInProgress = false;
      table.winners = winners;
      table.winningAmount = winningAmount;
      
      // Update the table
      await this.db.updateTable(table);
      
      // Start a new hand after a delay
      setTimeout(() => this.startNewHand(), 5000);
    } catch (error) {
      logger.error('[GameManager] Error ending round:', {
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Generate a unique hand ID
   */
  private generateHandId(): string {
    return `${this.tableId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start a new hand
   */
  public async startNewHand(): Promise<void> {
    try {
      const table = await this.db.getTable();
      if (!table) {
        throw new Error('Table not found');
      }
      
      // Check if we have enough active players
      const activePlayers = table.players.filter(p => p.isActive && p.chips > 0);
      if (activePlayers.length < 2) {
        logger.warn('[GameManager] Not enough active players to start a new hand');
        return;
      }
      
      // Generate a new hand ID
      const handId = this.generateHandId();
      
      logger.log('[GameManager] Starting new hand:', {
        tableId: this.tableId,
        handId,
        activePlayers: activePlayers.length,
        timestamp: new Date().toISOString(),
      });
      
      // Reset the deck
      this.deck.reset();
      
      // Clear cards for all players from previous hands
      await this.clearAllPlayerCards(table);
      
      // Reset players - make sure to remove any card references from the table data
      await this.resetPlayers(table);
      
      // Move dealer button
      table.dealerPosition = this.players.nextDealer(table);
      
      // Initialize table for new hand
      table.communityCards = [];
      table.pot = 0;
      table.currentBet = 0;
      table.phase = 'preflop';
      table.roundBets = {};
      table.minRaise = table.bigBlind * 2;
      table.isHandInProgress = true;
      table.lastAction = null;
      table.lastActivePlayer = null;
      table.lastBettor = null;
      table.winners = null;
      table.winningAmount = null;
      table.handId = handId; // Set the handId on the table
      
      // First update the table without dealing cards
      await this.db.updateTable(table);
      
      // Post blinds
      await this.postBlinds(table);
      
      // Update the table after posting blinds
      await this.db.updateTable(table);
      
      // Deal hole cards to players - this stores cards in private player data, not in the table
      await this.dealHoleCards(table);
      
      // Set first player to act
      table.currentPlayerIndex = this.players.getNextActivePlayerIndex(table, table.dealerPosition);
      table.lastActionTimestamp = Date.now();
      
      // Final update of the table
      await this.db.updateTable(table);
    } catch (error) {
      logger.error('[GameManager] Error starting new hand:', {
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Clear cards for all players
   */
  private async clearAllPlayerCards(table: Table): Promise<void> {
    logger.log('[GameManager] Clearing all player cards:', {
      tableId: this.tableId,
      playerCount: table.players.length,
      timestamp: new Date().toISOString(),
    });
    
    // Clear cards for each active player
    for (const player of table.players) {
      await this.deck.clearPlayerCards(player.id);
    }
  }

  /**
   * Post blinds for the new hand
   */
  private async postBlinds(table: Table): Promise<void> {
    const activePlayers = this.players.getActivePlayers(table);
    if (activePlayers.length < 2) {
      return;
    }
    
    // Ensure roundBets is initialized
    if (!table.roundBets) {
      table.roundBets = {};
    }
    
    // Determine small and big blind positions
    const sbPos = (table.dealerPosition + 1) % table.players.length;
    const bbPos = (table.dealerPosition + 2) % table.players.length;
    
    // Post small blind
    const sbPlayer = table.players[sbPos];
    if (sbPlayer && sbPlayer.isActive && sbPlayer.chips > 0) {
      const sbAmount = Math.min(table.smallBlind, sbPlayer.chips);
      const actualSbBet = this.players.placeBet(table, sbPlayer.id, sbAmount);
      table.pot += actualSbBet;
      table.roundBets[sbPlayer.id] = actualSbBet;
    }
    
    // Post big blind
    const bbPlayer = table.players[bbPos];
    if (bbPlayer && bbPlayer.isActive && bbPlayer.chips > 0) {
      const bbAmount = Math.min(table.bigBlind, bbPlayer.chips);
      const actualBbBet = this.players.placeBet(table, bbPlayer.id, bbAmount);
      table.pot += actualBbBet;
      table.roundBets[bbPlayer.id] = actualBbBet;
      table.currentBet = actualBbBet;
    }
  }

  /**
   * Deal hole cards to all active players
   */
  private async dealHoleCards(table: Table): Promise<void> {
    if (!table.handId) {
      logger.error('[GameManager] Cannot deal cards without a handId:', {
        tableId: this.tableId,
        timestamp: new Date().toISOString(),
      });
      throw new Error('Cannot deal cards without a handId');
    }
    
    logger.log('[GameManager] Dealing hole cards to all players:', {
      tableId: this.tableId,
      handId: table.handId,
      playerCount: table.players.length,
      timestamp: new Date().toISOString(),
    });
    
    // Deal cards to each active player
    for (const player of table.players) {
      await this.deck.dealHoleCards(player.id, table.handId);
    }
  }

  /**
   * Reset players for a new hand
   */
  private async resetPlayers(table: Table): Promise<void> {
    // Make a copy of the players array to avoid direct mutation
    const updatedPlayers = table.players.map(player => {
      if (player.isActive) {
        // Set hasFolded to false and remove cards property completely
        const updatedPlayer = {
          ...player,
          hasFolded: false
        };
        
        // Remove the cards property completely instead of setting it to null or undefined
        if ('cards' in updatedPlayer) {
          delete updatedPlayer.cards;
        }
        
        return updatedPlayer;
      }
      return player;
    });
    
    // Update the table with the modified players array
    table.players = updatedPlayers;
  }

  /**
   * Start the game
   */
  public async startGame(): Promise<void> {
    try {
      const table = await this.db.getTable();
      if (!table) {
        logger.error('[GameManager] Cannot start game on non-existent table:', {
          tableId: this.tableId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Table not found');
      }
      
      // Check if we have enough players
      if (table.players.length < 2) {
        logger.error('[GameManager] Cannot start game with insufficient players:', {
          tableId: this.tableId,
          playerCount: table.players.length,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Not enough players to start the game');
      }
      
      // Mark game as started
      await this.db.updateTable({ gameStarted: true });
      
      // Start the first hand
      await this.startNewHand();
    } catch (error) {
      logger.error('[GameManager] Error starting game:', {
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Create a new table
   */
  public async createTable(
    tableName: string,
    smallBlind: number = GameManager.DEFAULT_SMALL_BLIND,
    bigBlind: number = GameManager.DEFAULT_BIG_BLIND,
    maxPlayers: number = 9,
    isPrivate: boolean = false,
    password?: string
  ): Promise<string> {
    try {
      return await this.db.createTable(
        tableName,
        smallBlind,
        bigBlind,
        maxPlayers,
        isPrivate,
        password
      );
    } catch (error) {
      logger.error('[GameManager] Error creating table:', {
        tableName,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Get a player's hole cards
   */
  public async getPlayerHoleCards(playerId: string): Promise<Card[] | null> {
    logger.log('[GameManager] Getting player hole cards:', {
      tableId: this.tableId,
      playerId,
      timestamp: new Date().toISOString(),
    });
    
    const table = await this.db.getTable();
    const handId = table?.handId;
    
    return await this.db.getPlayerCards(playerId, handId);
  }

  /**
   * Static method to get table data
   */
  static async getTableData(tableId: string): Promise<Table | null> {
    try {
      if (!tableId) {
        logger.error('[GameManager] Invalid tableId provided:', {
          tableId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Invalid tableId provided');
      }
      
      return await DatabaseService.getTableData(tableId);
    } catch (error) {
      logger.error('[GameManager] Error getting table data:', {
        tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
} 