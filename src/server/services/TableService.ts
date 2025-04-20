import { getDatabase, Reference, DataSnapshot } from 'firebase-admin/database';
import { adminDb } from '../config/firebase-admin';
import { ServerError } from '../utils/error-handler';
import { ServiceResponse } from '../types';
import type { Table, Player } from '@/types/poker';
import logger from '@/utils/logger';
import { setData, updateData, getSnapshot } from '../utils/database';

export class TableService {
  private tableRef: Reference;

  constructor(tableId: string) {
    this.tableRef = adminDb.ref(`tables/${tableId}`);
  }

  /**
   * Get the current table state
   */
  public async getTable(): Promise<ServiceResponse<Table | null>> {
    try {
      const snapshot = await getSnapshot(this.tableRef);
      return {
        success: true,
        data: snapshot.exists() ? snapshot.val() as Table : null
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'table/get-failed',
          message: 'Failed to get table data'
        }
      };
    }
  }

  private async ensureTableExists(): Promise<Table> {
    const snapshot = await getSnapshot(this.tableRef);
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
      await setData(this.tableRef, initialTable);
      return initialTable;
    }
    
    // Ensure players array exists in existing table
    if (!table.players) {
      table.players = [];
      await updateData(this.tableRef, { players: [] });
    }
    
    return table;
  }

  public async createTable(tableId: string): Promise<ServiceResponse<void>> {
    try {
      const initialTable: Table = {
        id: tableId,
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

      await setData(this.tableRef, initialTable);
      
      logger.log('[TableService] Table created:', { tableId });
      
      return { success: true };
    } catch (error) {
      logger.error('[TableService] Error creating table:', { tableId, error });
      return {
        success: false,
        error: {
          code: 'table/create-failed',
          message: 'Failed to create table'
        }
      };
    }
  }

  public async updateTable(tableData: Partial<Table>): Promise<ServiceResponse<void>> {
    try {
      await this.ensureTableExists();
      await updateData(this.tableRef, tableData);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'table/update-failed',
          message: 'Failed to update table'
        }
      };
    }
  }

  public async addPlayer(player: Omit<Player, 'cards' | 'isActive' | 'hasFolded'>): Promise<ServiceResponse<void>> {
    try {
      const table = await this.ensureTableExists();
      
      // Ensure players array exists
      const currentPlayers = table.players || [];
      
      if (currentPlayers.length >= 10) {
        return {
          success: false,
          error: {
            code: 'table/full',
            message: 'Table is full'
          }
        };
      }

      const newPlayer: Player = {
        ...player,
        cards: [],
        isActive: true,
        hasFolded: false,
      };

      const players = [...currentPlayers, newPlayer];
      await updateData(this.tableRef, { players });

      logger.log('[TableService] Player added to table:', { 
        tableId: this.tableRef.key,
        playerId: player.id 
      });

      return { success: true };
    } catch (error) {
      logger.error('[TableService] Error adding player:', {
        tableId: this.tableRef.key,
        playerId: player.id,
        error
      });
      return {
        success: false,
        error: {
          code: 'table/add-player-failed',
          message: 'Failed to add player to table'
        }
      };
    }
  }

  public async removePlayer(playerId: string): Promise<ServiceResponse<void>> {
    try {
      const table = await this.ensureTableExists();
      const players = (table.players || []).filter((p) => p.id !== playerId);
      await updateData(this.tableRef, { players });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'table/remove-player-failed',
          message: 'Failed to remove player from table'
        }
      };
    }
  }

  public async updatePlayerState(playerId: string, updates: Partial<Player>): Promise<ServiceResponse<void>> {
    try {
      const table = await this.ensureTableExists();
      const players = (table.players || []).map((p) => 
        p.id === playerId ? { ...p, ...updates } : p
      );
      await updateData(this.tableRef, { players });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'table/update-player-failed',
          message: 'Failed to update player state'
        }
      };
    }
  }
} 