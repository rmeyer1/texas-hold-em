import { getDatabase, ref, get, update, set, onValue, off, runTransaction } from 'firebase/database';
import type { Table, Player, PrivatePlayerData } from '@/types/poker';
import { ITableService } from './interfaces/ITableService';
import logger from '@/utils/logger';

export class FirebaseTableService implements ITableService {
  private tableRef;
  private tableId: string;

  constructor(tableId: string) {
    this.tableId = tableId;
    const database = getDatabase();
    this.tableRef = ref(database, `tables/${tableId}`);
  }

  public getTableId(): string {
    return this.tableId;
  }

  public async getTable(): Promise<Table | null> {
    try {
      const snapshot = await get(this.tableRef);
      return snapshot.exists() ? snapshot.val() as Table : null;
    } catch (error) {
      logger.error('[FirebaseTableService] Error getting table:', {
        tableId: this.tableId,
        error
      });
      return null;
    }
  }

  public async updateTable(tableData: Partial<Table>): Promise<void> {
    try {
      await update(this.tableRef, tableData);
    } catch (error) {
      logger.error('[FirebaseTableService] Error updating table:', {
        tableId: this.tableId,
        error
      });
      throw error;
    }
  }

  public async forceUpdateTable(tableData: Partial<Table>): Promise<void> {
    try {
      await set(this.tableRef, tableData);
    } catch (error) {
      logger.error('[FirebaseTableService] Error force updating table:', {
        tableId: this.tableId,
        error
      });
      throw error;
    }
  }

  public async updateTableTransaction(updateFn: (currentTable: Table) => Partial<Table>): Promise<void> {
    try {
      await runTransaction(this.tableRef, (currentData: Table | null) => {
        if (currentData === null) {
          throw new Error('Table not found');
        }
        return updateFn(currentData);
      });
    } catch (error) {
      logger.error('[FirebaseTableService] Error in table transaction:', {
        tableId: this.tableId,
        error
      });
      throw error;
    }
  }

  public async createTable(params: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    isPrivate: boolean;
    password?: string;
  }): Promise<{ tableId: string }> {
    try {
      const database = getDatabase();
      const newTableRef = ref(database, `tables/${this.tableId}`);
      
      const tableData: Partial<Table> = {
        ...params,
        id: this.tableId,
        players: [],
        communityCards: [],
        pot: 0,
        currentBet: 0,
        dealerPosition: -1,
        currentPlayerIndex: -1,
        phase: 'waiting',
        bettingRound: 'small_blind',
        isHandInProgress: false,
        gameStarted: false,
        activePlayerCount: 0,
        minRaise: params.bigBlind * 2,
        roundBets: {},
        turnTimeLimit: 45000
      };

      await set(newTableRef, tableData);
      return { tableId: this.tableId };
    } catch (error) {
      logger.error('[FirebaseTableService] Error creating table:', {
        tableId: this.tableId,
        error
      });
      throw error;
    }
  }

  public async addPlayer(player: Omit<Player, 'cards' | 'isActive' | 'hasFolded'>): Promise<void> {
    try {
      const table = await this.getTable();
      if (!table) throw new Error('Table not found');

      const players = [...(table.players || [])];
      players.push({
        ...player,
        cards: [],
        isActive: true,
        hasFolded: false
      });

      await this.updateTable({ players });
    } catch (error) {
      logger.error('[FirebaseTableService] Error adding player:', {
        tableId: this.tableId,
        playerId: player.id,
        error
      });
      throw error;
    }
  }

  public async removePlayer(playerId: string): Promise<void> {
    try {
      const table = await this.getTable();
      if (!table) throw new Error('Table not found');

      const players = table.players.filter(p => p.id !== playerId);
      await this.updateTable({ players });
    } catch (error) {
      logger.error('[FirebaseTableService] Error removing player:', {
        tableId: this.tableId,
        playerId,
        error
      });
      throw error;
    }
  }

  public async updatePlayerState(playerId: string, updates: Partial<Player>): Promise<void> {
    try {
      const table = await this.getTable();
      if (!table) throw new Error('Table not found');

      const playerIndex = table.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) throw new Error('Player not found');

      const players = [...table.players];
      players[playerIndex] = { ...players[playerIndex], ...updates };
      await this.updateTable({ players });
    } catch (error) {
      logger.error('[FirebaseTableService] Error updating player state:', {
        tableId: this.tableId,
        playerId,
        error
      });
      throw error;
    }
  }

  public async getPlayerCards(playerId: string, handId?: string): Promise<string[]> {
    try {
      const database = getDatabase();
      const cardsRef = ref(database, `private_player_data/${this.tableId}/${playerId}/cards`);
      const snapshot = await get(cardsRef);
      return snapshot.exists() ? snapshot.val() : [];
    } catch (error) {
      logger.error('[FirebaseTableService] Error getting player cards:', {
        tableId: this.tableId,
        playerId,
        handId,
        error
      });
      return [];
    }
  }

  public async getPrivatePlayerData(playerId: string): Promise<PrivatePlayerData | null> {
    try {
      const database = getDatabase();
      const dataRef = ref(database, `private_player_data/${this.tableId}/${playerId}`);
      const snapshot = await get(dataRef);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      logger.error('[FirebaseTableService] Error getting private player data:', {
        tableId: this.tableId,
        playerId,
        error
      });
      return null;
    }
  }

  public subscribeToTable(callback: (table: Table) => void): () => void {
    const unsubscribe = onValue(this.tableRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as Table);
      }
    });

    return () => {
      off(this.tableRef);
      unsubscribe();
    };
  }
} 