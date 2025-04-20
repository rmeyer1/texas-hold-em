import type { Table, Player } from '@/types/poker';
import logger from '@/utils/logger';

interface ApiResponse<T = void> {
  data?: T;
  error?: string;
  details?: any;
}

export class TableServiceClient {
  private tableId: string;
  private baseUrl: string;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.baseUrl = '/api/tables';
  }

  private async fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('token'); // Assuming token is stored in localStorage
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
      return data as Table;
    } catch (error) {
      logger.error('[TableServiceClient] Error getting table:', {
        tableId: this.tableId,
        error
      });
      return null;
    }
  }

  public async createTable(params: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    isPrivate: boolean;
    password?: string;
  }): Promise<ApiResponse<{ tableId: string }>> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/create`, {
        method: 'POST',
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          error: data.error,
          details: data.details
        };
      }

      return { data };
    } catch (error) {
      logger.error('[TableServiceClient] Error creating table:', { error });
      return {
        error: 'Failed to create table'
      };
    }
  }

  public async updateTable(tableData: Partial<Table>): Promise<ApiResponse> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}`, {
        method: 'PATCH',
        body: JSON.stringify(tableData),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.message || 'Failed to update table'
        };
      }

      return {};
    } catch (error) {
      logger.error('[TableServiceClient] Error updating table:', {
        tableId: this.tableId,
        error
      });
      return {
        error: 'Failed to update table'
      };
    }
  }

  public async addPlayer(player: Omit<Player, 'cards' | 'isActive' | 'hasFolded'>): Promise<ApiResponse> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}/players`, {
        method: 'POST',
        body: JSON.stringify(player),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.message || 'Failed to add player'
        };
      }

      return {};
    } catch (error) {
      logger.error('[TableServiceClient] Error adding player:', {
        tableId: this.tableId,
        playerId: player.id,
        error
      });
      return {
        error: 'Failed to add player'
      };
    }
  }

  public async removePlayer(playerId: string): Promise<ApiResponse> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}/players/${playerId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.message || 'Failed to remove player'
        };
      }

      return {};
    } catch (error) {
      logger.error('[TableServiceClient] Error removing player:', {
        tableId: this.tableId,
        playerId,
        error
      });
      return {
        error: 'Failed to remove player'
      };
    }
  }

  public async updatePlayerState(playerId: string, updates: Partial<Player>): Promise<ApiResponse> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/${this.tableId}/players/${playerId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.message || 'Failed to update player state'
        };
      }

      return {};
    } catch (error) {
      logger.error('[TableServiceClient] Error updating player state:', {
        tableId: this.tableId,
        playerId,
        error
      });
      return {
        error: 'Failed to update player state'
      };
    }
  }
} 