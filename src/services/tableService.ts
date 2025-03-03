import { ref, set, update, onValue, off, get, type DataSnapshot } from 'firebase/database';
import { database } from './firebase';
import type { Table, Player } from '@/types/poker';
import { connectionManager } from './connectionManager';
import { GameChatConnector } from './gameChatConnector';
import logger from '@/utils/logger';

export class TableService {
  private tableRef;
  private gameChatConnector: GameChatConnector;

  constructor(tableId: string) {
    this.tableRef = ref(database, `tables/${tableId}`);
    this.gameChatConnector = new GameChatConnector(tableId);
  }

  /**
   * Get the current table state
   */
  public async getTable(): Promise<Table | null> {
    const snapshot = await get(this.tableRef);
    return snapshot.exists() ? snapshot.val() as Table : null;
  }

  private async ensureTableExists(): Promise<Table> {
    const snapshot = await get(this.tableRef);
    const table = snapshot.val() as Table | null;
    
    if (!table) {
      const initialTable: Table = {
        id: this.tableRef.key!,
        players: [],
        communityCards: [],
        pot: 0,
        currentBet: 0,
        dealerPosition: 0,
        phase: 'preflop',
        currentPlayerIndex: 0,
        smallBlind: 10,
        bigBlind: 20,
        lastActionTimestamp: Date.now(),
        bettingRound: 'small_blind',
        roundBets: {},
        minRaise: 20,
        turnTimeLimit: 45000,
        isHandInProgress: false,
        activePlayerCount: 0,
        lastAction: null,
        lastActivePlayer: null,
        lastBettor: null,
        isPrivate: false,
        password: null,
        gameStarted: false
      };
      await set(this.tableRef, initialTable);
      return initialTable;
    }
    
    // Ensure players array exists in existing table
    if (!table.players) {
      table.players = [];
      await update(this.tableRef, { players: [] });
    }
    
    return table;
  }

  public async createTable(tableId: string): Promise<void> {
    const initialTable: Table = {
      id: tableId,
      players: [],
      communityCards: [],
      pot: 0,
      currentBet: 0,
      dealerPosition: -1,
      phase: 'waiting',
      currentPlayerIndex: -1,
      smallBlind: 10,
      bigBlind: 20,
      lastActionTimestamp: Date.now(),
      bettingRound: 'small_blind',
      roundBets: {},
      minRaise: 20,
      turnTimeLimit: 45000,
      isHandInProgress: false,
      activePlayerCount: 0,
      lastAction: null,
      lastActivePlayer: null,
      lastBettor: null,
      isPrivate: false,
      password: null,
      gameStarted: false,
      handId: ''
    };

    await set(this.tableRef, initialTable);
    
    try {
      await this.gameChatConnector.ensureTableChatRoom(initialTable);
      logger.log('[TableService] Table and chat room created:', { tableId });
    } catch (error) {
      logger.error('[TableService] Error creating table chat room:', { tableId, error });
    }
  }

  public async updateTable(tableData: Partial<Table>): Promise<void> {
    await this.ensureTableExists();
    await update(this.tableRef, tableData);
  }

  public subscribeToTable(callback: (table: Table) => void): () => void {
    const handleSnapshot = (snapshot: DataSnapshot): void => {
      const table = snapshot.val() as Table;
      if (table) {
        callback(table);
      }
    };

    // Use the connection manager to register this connection
    const tableId = this.tableRef.key;
    const refPath = `tables/${tableId}`;
    return connectionManager.registerConnection(refPath, handleSnapshot);
  }

  public async addPlayer(player: Omit<Player, 'cards' | 'isActive' | 'hasFolded'>): Promise<void> {
    const table = await this.ensureTableExists();
    
    // Ensure players array exists
    const currentPlayers = table.players || [];
    
    if (currentPlayers.length >= 10) {
      throw new Error('Table is full');
    }

    const newPlayer: Player = {
      ...player,
      cards: [],
      isActive: true,
      hasFolded: false,
    };

    const players = [...currentPlayers, newPlayer];
    await update(this.tableRef, { players });

    try {
      // Add player to the table chat room
      await this.gameChatConnector.addPlayerToTableChat(player.id);
      logger.log('[TableService] Player added to table and chat:', { 
        tableId: this.tableRef.key,
        playerId: player.id 
      });
    } catch (error) {
      logger.error('[TableService] Error adding player to chat room:', {
        tableId: this.tableRef.key,
        playerId: player.id,
        error
      });
      // Don't throw here - we want the player to be added to the table even if chat room addition fails
    }
  }

  public async removePlayer(playerId: string): Promise<void> {
    const table = await this.ensureTableExists();
    const players = (table.players || []).filter((p) => p.id !== playerId);
    await update(this.tableRef, { players });
  }

  public async updatePlayerState(playerId: string, updates: Partial<Player>): Promise<void> {
    const table = await this.ensureTableExists();
    const players = (table.players || []).map((p) => 
      p.id === playerId ? { ...p, ...updates } : p
    );
    await update(this.tableRef, { players });
  }
} 