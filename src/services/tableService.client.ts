import type { Table, Player, PrivatePlayerData } from '@/types/poker';
import logger from '@/utils/logger';
import { ITableService } from './interfaces/ITableService';

interface ApiResponse<T = void> {
  data?: T;
  error?: string;
  details?: any;
}

export class TableServiceClient implements ITableService {
  private tableId: string;
  private baseUrl: string;
  private tableCache: Table | null = null;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.baseUrl = '/api/tables';
  }

  public getTableId(): string {
    return this.tableId;
  }

  private async fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('token');
    return fetch(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get the current table state
   */
  public async getTable(): Promise<Table | null> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}`);
      
      if (!response.ok) {
        const error = await response.json();
        logger.error('[TableServiceClient] Failed to get table:', {
          tableId: this.tableId,
          status: response.status,
          error
        });
        return null;
      }

      const data = await response.json();
      this.tableCache = data as Table;
      return this.tableCache;
    } catch (error) {
      logger.error('[TableServiceClient] Error getting table:', {
        tableId: this.tableId,
        error
      });
      return null;
    }
  }

  public async updateTable(tableData: Partial<Table>): Promise<void> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}`, {
        method: 'PATCH',
        body: JSON.stringify(tableData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update table');
      }

      // Update cache
      if (this.tableCache) {
        this.tableCache = { ...this.tableCache, ...tableData };
      }
    } catch (error) {
      logger.error('[TableServiceClient] Error updating table:', {
        tableId: this.tableId,
        error
      });
      throw error;
    }
  }

  public async forceUpdateTable(tableData: Partial<Table>): Promise<void> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}`, {
        method: 'PUT',
        body: JSON.stringify(tableData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to force update table');
      }

      // Update cache
      this.tableCache = tableData as Table;
    } catch (error) {
      logger.error('[TableServiceClient] Error force updating table:', {
        tableId: this.tableId,
        error
      });
      throw error;
    }
  }

  public async updateTableTransaction(updateFn: (currentTable: Table) => Partial<Table>): Promise<void> {
    try {
      const currentTable = await this.getTable();
      if (!currentTable) {
        throw new Error('Table not found');
      }

      const updates = updateFn(currentTable);
      await this.updateTable(updates);
    } catch (error) {
      logger.error('[TableServiceClient] Error in table transaction:', {
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
      const response = await this.fetchWithAuth(`${this.baseUrl}/create`, {
        method: 'POST',
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create table');
      }

      const data = await response.json();
      return { tableId: data.tableId };
    } catch (error) {
      logger.error('[TableServiceClient] Error creating table:', {
        error
      });
      throw error;
    }
  }

  public async addPlayer(player: Omit<Player, 'cards' | 'isActive' | 'hasFolded'>): Promise<void> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}/players`, {
        method: 'POST',
        body: JSON.stringify(player),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add player');
      }
    } catch (error) {
      logger.error('[TableServiceClient] Error adding player:', {
        tableId: this.tableId,
        playerId: player.id,
        error
      });
      throw error;
    }
  }

  public async removePlayer(playerId: string): Promise<void> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}/players/${playerId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove player');
      }
    } catch (error) {
      logger.error('[TableServiceClient] Error removing player:', {
        tableId: this.tableId,
        playerId,
        error
      });
      throw error;
    }
  }

  public async updatePlayerState(playerId: string, updates: Partial<Player>): Promise<void> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}/players/${playerId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update player state');
      }
    } catch (error) {
      logger.error('[TableServiceClient] Error updating player state:', {
        tableId: this.tableId,
        playerId,
        error
      });
      throw error;
    }
  }

  public async getPlayerCards(playerId: string, handId?: string): Promise<string[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.baseUrl}/${this.tableId}/players/${playerId}/cards${handId ? `?handId=${handId}` : ''}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get player cards');
      }

      const data = await response.json();
      return data.cards;
    } catch (error) {
      logger.error('[TableServiceClient] Error getting player cards:', {
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
      const response = await this.fetchWithAuth(
        `${this.baseUrl}/${this.tableId}/players/${playerId}/private`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get private player data');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('[TableServiceClient] Error getting private player data:', {
        tableId: this.tableId,
        playerId,
        error
      });
      return null;
    }
  }

  public subscribeToTable(callback: (table: Table) => void): () => void {
    const eventSource = new EventSource(`${this.baseUrl}/${this.tableId}/subscribe`);
    
    eventSource.onmessage = (event) => {
      const table = JSON.parse(event.data) as Table;
      this.tableCache = table;
      callback(table);
    };

    return () => {
      eventSource.close();
    };
  }
} 