import type { Table, Player, PrivatePlayerData } from '@/types/poker';

export interface ITableServiceStatic {
  getTableData(tableId: string): Promise<Table | null>;
}

export interface ITableService {
  // Table operations
  getTable(): Promise<Table | null>;
  updateTable(tableData: Partial<Table>): Promise<void>;
  forceUpdateTable(tableData: Partial<Table>): Promise<void>;
  createTable(params: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    isPrivate: boolean;
    password?: string;
  }): Promise<{ tableId: string }>;

  // Player operations
  addPlayer(player: Omit<Player, 'cards' | 'isActive' | 'hasFolded'>): Promise<void>;
  removePlayer(playerId: string): Promise<void>;
  updatePlayerState(playerId: string, updates: Partial<Player>): Promise<void>;
  getPlayerCards(playerId: string, handId?: string): Promise<string[]>;
  getPrivatePlayerData(playerId: string): Promise<PrivatePlayerData | null>;

  // Table state management
  updateTableTransaction(updateFn: (currentTable: Table) => Partial<Table>): Promise<void>;

  // Subscription
  subscribeToTable(callback: (table: Table) => void): () => void;

  // Utility methods
  getTableId(): string;
} 