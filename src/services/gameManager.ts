import { getAuth } from 'firebase/auth';
import { DatabaseService } from './databaseService';
import { DeckManager } from './deckManager';
import { PlayerManager } from './playerManager';
import { PhaseManager } from './phaseManager';
import { HandEvaluator } from './handEvaluator';
import type { Table, Player, Card, PlayerAction } from '@/types/poker';
import { serializeError } from '@/utils/errorUtils';
import logger from '@/utils/logger';
import { log } from 'console';

export class GameManager {
  private db: DatabaseService;
  private deck: DeckManager;
  private players: PlayerManager;
  private phases: PhaseManager;
  private handEvaluator: HandEvaluator;
  private tableId: string;
  private pendingUpdates: Partial<Table> = {};
  private isBatching: boolean = false;
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
  private startBatch(): void {
    this.isBatching = true;
    this.pendingUpdates = {};
  }
  private queueUpdate(updates: Partial<Table>): void {
    Object.assign(this.pendingUpdates, updates);
  }
  private async commitBatch(table: Table): Promise<void> {
    if (this.isBatching && Object.keys(this.pendingUpdates).length > 0) {
      Object.assign(table, this.pendingUpdates);
      await this.db.forceUpdateTable(table);      this.pendingUpdates = {};
      this.isBatching = false;
    }
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
  public async handlePlayerAction(playerId: string, action: PlayerAction, amount?: number): Promise<void> {
    logger.log('[GameManager] handlePlayerAction called:', { playerId, action, amount });
    try {
      const table = await this.db.getTable();
      if (!table) throw new Error('Table not found');
  
      if (!table.roundBets) table.roundBets = {};
  
      // Ensure amount is not undefined for any action
      const validAmount = action === 'check' ? 0 : amount;
  
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
          if (validAmount === undefined) throw new Error('Raise amount is required');
          await this.handleRaise(table, playerId, validAmount);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      const serializedError = serializeError(error);
      logger.error('[GameManager] Error in handlePlayerAction:', { 
        playerId, 
        action, 
        amount, 
        errorMessage: serializedError.message,
        errorStack: serializedError.stack 
      });
    }
  }

  /**
   * Handle a fold action
   */
/**
 * Handle a fold action
 */
private async handleFold(table: Table, playerId: string): Promise<void> {
  await this.db.updateTableTransaction((currentTable) => {
    // Ensure roundBets is initialized
    if (!currentTable.roundBets) {
      currentTable.roundBets = {};
    }
    
    // Mark player as folded
    const player = currentTable.players.find(p => p.id === playerId);
    if (player) {
      player.hasFolded = true;
    } else {
      throw new Error('Player not found');
    }
    
    // Update last action
    currentTable.lastAction = 'fold';
    currentTable.lastActivePlayer = playerId;
    
    return currentTable;
  });

  // Move to the next player or phase with the updated table
  const updatedTable = await this.db.getTable();
  if (!updatedTable) throw new Error('Table not found after transaction');
  await this.moveToNextPlayer(updatedTable);
}
  /**
   * Handle a check action
   */
  /**
 * Handle a check action
 */
  private async handleCheck(table: Table, playerId: string): Promise<void> {
    logger.log('[GameManager] handleCheck starting:', { playerId });
    const currentPlayer = table.players[table.currentPlayerIndex];
    if (currentPlayer.id !== playerId) throw new Error(`Not ${playerId}'s turn to act`);
  
    await this.db.updateTableTransaction((currentTable) => {
      logger.log('[GameManager] Inside handleCheck transaction:', { playerId, currentBet: currentTable.currentBet });
      if (!currentTable.roundBets) currentTable.roundBets = {};
      if (currentTable.currentBet > 0 && (currentTable.roundBets[playerId] || 0) < currentTable.currentBet) {
        throw new Error('Cannot check when there is an active bet');
      }
      
      // Explicitly set the round bet to 0 for check actions
      currentTable.roundBets[playerId] = currentTable.roundBets[playerId] || 0;
      
      currentTable.lastAction = 'check';
      currentTable.lastActivePlayer = playerId;
      return currentTable;
    });
  
    logger.log('[GameManager] handleCheck transaction completed');
    const updatedTable = await this.db.getTable();
    if (!updatedTable) throw new Error('Table not found after transaction');
    logger.log('[GameManager] handleCheck fetched updatedTable:', { currentPlayerIndex: updatedTable.currentPlayerIndex });
    await this.moveToNextPlayer(updatedTable);
  }

  /**
   * Handle a call action
   */
  /**
 * Handle a call action
 */
private async handleCall(table: Table, playerId: string): Promise<void> {
  logger.log('[GameManager] handleCall starting:', { playerId });
    const currentPlayer = table.players[table.currentPlayerIndex];
    if (currentPlayer.id !== playerId) throw new Error(`Not ${playerId}'s turn to act`);
  
  await this.db.updateTableTransaction((currentTable) => {
    const player = currentTable.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    // Ensure roundBets is initialized
    if (!currentTable.roundBets) {
      currentTable.roundBets = {};
    }
    
    const currentPlayerBet = currentTable.roundBets[playerId] || 0;
    const amountToCall = Math.min(currentTable.currentBet - currentPlayerBet, player.chips);
    
    // Place the bet
    if (amountToCall > 0) {
      player.chips -= amountToCall; // Directly modify player chips
      currentTable.pot += amountToCall;
      currentTable.roundBets[playerId] = (currentTable.roundBets[playerId] || 0) + amountToCall;
    }
    
    // Update last action (no change to lastBettor since call doesn't affect it)
    currentTable.lastAction = 'call';
    currentTable.lastActivePlayer = playerId;
    
    return currentTable;
  });

  // Move to the next player or phase with the updated table
  const updatedTable = await this.db.getTable();
  if (!updatedTable) throw new Error('Table not found after transaction');
  await this.moveToNextPlayer(updatedTable);
}

  /**
   * Handle a raise action
   */
  private async handleRaise(table: Table, playerId: string, raiseAmount: number): Promise<void> {
    logger.log('[GameManager] handleRaise starting:', { playerId });
    const currentPlayer = table.players[table.currentPlayerIndex];
    if (currentPlayer.id !== playerId) throw new Error(`Not ${playerId}'s turn to act`);

    const player = table.players.find(p => p.id === playerId);
    if (!player || raiseAmount < table.minRaise || raiseAmount > player.chips) throw new Error('Invalid raise');
  
    await this.db.updateTableTransaction((currentTable) => {
      logger.log('[GameManager] Inside handleRaise transaction:', { playerId, raiseAmount });
      const txPlayer = currentTable.players.find(p => p.id === playerId);
      if (!txPlayer) throw new Error('Player not found in transaction');
  
      // Ensure roundBets is always an object, even if undefined in the snapshot
      if (!currentTable.roundBets || typeof currentTable.roundBets !== 'object') {
        currentTable.roundBets = {};
      }
  
      const currentPlayerBet = currentTable.roundBets[playerId] || 0;
      const additionalBet = raiseAmount - currentPlayerBet;
  
      txPlayer.chips -= additionalBet;
      currentTable.pot += additionalBet;
      currentTable.roundBets[playerId] = raiseAmount;
      currentTable.currentBet = raiseAmount;
      currentTable.minRaise = raiseAmount * 2;
      currentTable.lastBettor = playerId;
      currentTable.lastAction = 'raise';
      currentTable.lastActivePlayer = playerId;
  
      return currentTable;
    });
    
    // Fetch the updated table state after the transaction
    const updatedTable = await this.db.getTable();
    if (!updatedTable) throw new Error('Table not found after transaction');

    // Pass the updated table to moveToNextPlayer
    await this.moveToNextPlayer(updatedTable);
  }

  /**
   * Move to the next player or phase
   */
  private async moveToNextPlayer(table: Table): Promise<void> {
    try {
      logger.log('[GameManager] moveToNextPlayer starting:', { currentPlayerIndex: table.currentPlayerIndex, phase: table.phase });
      if (!table.roundBets) table.roundBets = {};
    
      if (this.players.getActiveCount(table) <= 1) {
        logger.log('[GameManager] moveToNextPlayer: Ending round, one player left');
        await this.endRound(table);
        return;
      }
    
      // Reset lastActionTimestamp when starting a new betting round (after dealing cards or blinds)
      const isNewBettingRound = ['preflop', 'flop', 'turn', 'river'].includes(table.phase) && 
                               (table.lastAction === null);
      if (isNewBettingRound) {
        table.lastActionTimestamp = Date.now();
        logger.log('[GameManager] Reset lastActionTimestamp for new betting round:', table.phase);
      }
    
      // Debug: Log the table state before checking if we should advance the phase
      logger.log('[GameManager] Table state before shouldAdvancePhase check:', { 
        phase: table.phase, 
        currentPlayerIndex: table.currentPlayerIndex,
        lastAction: table.lastAction,
        lastActivePlayer: table.lastActivePlayer,
        roundBets: table.roundBets,
        currentBet: table.currentBet
      });
      
      // Debug: Log the active players
      const activePlayers = this.players.getActivePlayers(table);
      logger.log('[GameManager] Active players:', activePlayers.map(p => ({ id: p.id, hasFolded: p.hasFolded, chips: p.chips })));
      
      if (this.phases.shouldAdvancePhase(table)) {
        logger.log('[GameManager] moveToNextPlayer: Advancing phase from:', table.phase);
        await this.moveToNextPhase(table);
        return;
      }
    
      const newIndex = this.players.getNextActivePlayerIndex(table, table.currentPlayerIndex);
      logger.log('[GameManager] moveToNextPlayer: New index calculated:', { oldIndex: table.currentPlayerIndex, newIndex });
      table.currentPlayerIndex = newIndex;
      table.lastActionTimestamp = Date.now(); // Update on each move
      logger.log('[GameManager] moveToNextPlayer updating table:', { currentPlayerIndex: table.currentPlayerIndex });
      await this.db.updateTable(table);
    } catch (error) {
      const serializedError = serializeError(error);
      console.error('[GameManager] Error in moveToNextPlayer:', { 
        tableId: this.tableId,
        phase: table?.phase,
        currentPlayerIndex: table?.currentPlayerIndex,
        errorMessage: serializedError.message,
        errorStack: serializedError.stack 
      });
      logger.error('[GameManager] Error in moveToNextPlayer:', {
        tableId: this.tableId,
        phase: table?.phase,
        currentPlayerIndex: table?.currentPlayerIndex,
        errorMessage: serializedError.message,
        errorStack: serializedError.stack,
        timestamp: new Date().toISOString(),
      });
      console.error('Raw error in moveToNextPlayer:', error);
      throw error; // Re-throw the error to be caught by the calling function
    }
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
      
      // Start batching to consolidate updates
      this.startBatch();
      
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
      table.minRaise = table.bigBlind;
      table.isHandInProgress = true;
      table.lastAction = null;
      table.lastActivePlayer = null;
      table.lastBettor = null;
      table.winners = null;
      table.winningAmount = null;
      table.handId = handId; // Set the handId on the table
      
      // Queue the initial table state (replaces first db.updateTable)
      this.queueUpdate(table);
      
      // Post blinds
      await this.postBlinds(table);
      logger.log('[GameManager] postBlinds completed:', { pot: table.pot, currentBet: table.currentBet, roundBets: table.roundBets });
            
      // Deal hole cards to players - this stores cards in private player data, not in the table
      await this.dealHoleCards(table);
      
      // Set first player to act
      table.currentPlayerIndex = this.players.getNextActivePlayerIndex(table, table.dealerPosition);
      table.lastActionTimestamp = Date.now();
      
      this.queueUpdate(table);
      
      // Commit all batched updates in one call (replaces second and third db.updateTable)
      await this.commitBatch(table);
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
    if (activePlayers.length < 2) return;
  
    if (!table.roundBets) table.roundBets = {};
    const sbPos = (table.dealerPosition + 1) % table.players.length;
    const bbPos = (table.dealerPosition + 2) % table.players.length;
  
    const sbPlayer = table.players[sbPos];
    if (sbPlayer && sbPlayer.isActive && sbPlayer.chips > 0) {
      const sbAmount = Math.min(table.smallBlind, sbPlayer.chips);
      sbPlayer.chips -= sbAmount;
      table.pot += sbAmount;
      table.roundBets[sbPlayer.id] = (table.roundBets[sbPlayer.id] || 0) + sbAmount;
    }
  
    const bbPlayer = table.players[bbPos];
    if (bbPlayer && bbPlayer.isActive && bbPlayer.chips > 0) {
      const bbAmount = Math.min(table.bigBlind, bbPlayer.chips);
      bbPlayer.chips -= bbAmount;
      table.pot += bbAmount;
      table.roundBets[bbPlayer.id] = (table.roundBets[bbPlayer.id] || 0) + bbAmount;
      table.currentBet = bbAmount; // Set currentBet to big blind
    }
    logger.log('[GameManager] postBlinds:', { pot: table.pot, currentBet: table.currentBet, roundBets: table.roundBets });
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
  /**
 * Refreshes a player's username in the table if it differs from the provided username.
 * @param playerId The ID of the player to update
 * @param username The new username to set
 */
public async refreshPlayerUsername(playerId: string, username: string): Promise<void> {
  try {
    // Fetch the current table state
    const table = await this.db.getTable();
    if (!table) {
      logger.log(`[GameManager] Table ${this.tableId} not found, skipping username refresh`);
      return;
    }

    // Check if players array exists
    if (!table.players || !Array.isArray(table.players)) {
      logger.log(`[GameManager] Players array not found for table ${this.tableId}, skipping username refresh`);
      return;
    }

    // Find the player in the table
    const playerIndex = table.players.findIndex((player) => player.id === playerId);
    if (playerIndex === -1) {
      logger.log(`[GameManager] Player ${playerId} not found in table ${this.tableId}, skipping username refresh`);
      return;
    }

    // Check if the name needs updating
    const currentName = table.players[playerIndex].name;
    if (currentName === username) {
      // No update needed
      return;
    }

    // Log the intended update
    logger.log(`[GameManager] Refreshing player name to "${username}" for player ${playerId} in table ${this.tableId}`);

    // Start batching to consolidate the update
    this.startBatch();

    // Update the player's name in the table object
    table.players[playerIndex].name = username;

    // Queue the update
    this.queueUpdate(table);

    // Commit the batched update
    await this.commitBatch(table);

    logger.log(`[GameManager] Successfully refreshed player name for player ${playerId} in table ${this.tableId}`);
  } catch (error) {
    logger.error(`[GameManager] Error refreshing player name in table ${this.tableId}:`, {
      playerId,
      username,
      tableId: this.tableId,
      error: serializeError(error),
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
} 