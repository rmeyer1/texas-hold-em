import { ref, set, update, get, DatabaseReference, runTransaction, off, onValue } from 'firebase/database'; // Add runTransaction to imports
import { database } from './firebase';
import { getAuth } from 'firebase/auth';
import type { Table, Card, Player, PrivatePlayerData } from '@/types/poker';
import { serializeError } from '@/utils/errorUtils';
import { connectionManager } from './connectionManager';
import logger from '@/utils/logger';

// Extended PrivatePlayerData interface with handId
interface ExtendedPrivatePlayerData extends PrivatePlayerData {
  handId?: string;
}

export class DatabaseService {
  private db = database;
  private tableId: string;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingUpdates: Partial<Table> = {};

  constructor(tableId: string) {
    this.tableId = tableId;
  }

  /**
   * Get the current authenticated user ID
   */
  getCurrentUserId(): string | null {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      console.warn('[DatabaseService] No authenticated user:', {
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
      });
      return null;
    }
    return user.uid;
  }

  /**
   * Get a reference to the table
   */
  getTableRef(): DatabaseReference {
    return ref(this.db, `tables/${this.tableId}`);
  }

  /**
   * Get a reference to a player's private data
   */
  getPrivatePlayerRef(playerId: string): DatabaseReference {
    if (!playerId) {
      console.error('[DatabaseService] Invalid player ID:', {
        tableId: this.tableId,
        playerId,
        timestamp: new Date().toISOString(),
      });
      throw new Error('Invalid player ID');
    }

    return ref(this.db, `private_player_data/${this.tableId}/${playerId}`);
  }

  /**
   * Get the current table state
   */
  async getTable(): Promise<Table | null> {
    try {
      const snapshot = await get(this.getTableRef());
      const table = snapshot.val();
      if (!table) {
        console.warn('[DatabaseService] Table not found:', {
          tableId: this.tableId,
          timestamp: new Date().toISOString(),
        });
      }
      return table;
    } catch (error) {
      console.error('[DatabaseService] Error getting table:', {
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Update the table with partial data
   */
  async updateTable(updates: Partial<Table>): Promise<void> {
    Object.assign(this.pendingUpdates, this.sanitizeData(updates));
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    return new Promise((resolve, reject) => {
      this.debounceTimer = setTimeout(async () => {
        try {
          await update(this.getTableRef(), this.pendingUpdates);
          this.pendingUpdates = {};
          this.debounceTimer = null;
          resolve();
        } catch (error) {
          logger.error('[DatabaseService] Debounced update failed:', { error: serializeError(error) });
          reject(error);
        }
      }, 100); // 100ms debounce
    });
  }
  async forceUpdateTable(updates: Partial<Table>): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    Object.assign(this.pendingUpdates, this.sanitizeData(updates));
    await update(this.getTableRef(), this.pendingUpdates);
    this.pendingUpdates = {};
    this.debounceTimer = null;
  }

  /**
   * Sanitize data to remove undefined values that Firebase doesn't accept
   */
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return null; // Firebase accepts null but not undefined
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          sanitized[key] = this.sanitizeData(value);
        }
      }
      
      return sanitized;
    }
    
    return data;
  }

  /**
   * Set a player's cards
   */
  async setPlayerCards(playerId: string, cards: Card[], handId: string): Promise<void> {
    try {
      const privatePlayerRef = this.getPrivatePlayerRef(playerId);
      const data: ExtendedPrivatePlayerData = {
        holeCards: cards,
        lastUpdated: Date.now(),
        handId
      };
      
      logger.log('[DatabaseService] Setting player cards:', {
        tableId: this.tableId,
        playerId,
        handId,
        cardCount: cards.length
      });
      
      await set(privatePlayerRef, data);
    } catch (error) {
      throw new Error(`Failed to set player cards: ${serializeError(error)}`);
    }
  }

  /**
   * Get a player's cards
   */
  async getPlayerCards(playerId: string, currentHandId?: string): Promise<Card[] | null> {
    try {
      const privatePlayerRef = this.getPrivatePlayerRef(playerId);
      const snapshot = await get(privatePlayerRef);
      
      if (!snapshot.exists()) {
        return null;
      }
      
      const data = snapshot.val() as ExtendedPrivatePlayerData;
      
      // If a handId is provided, verify it matches the stored handId
      if (currentHandId && data.handId !== currentHandId) {
        return null;
      }
      
      logger.log('[DatabaseService] Retrieved player cards:', {
        tableId: this.tableId,
        playerId,
        handId: data.handId,
        cardCount: data.holeCards?.length || 0
      });
      
      return data.holeCards || null;
    } catch (error) {
      throw new Error(`Failed to get player cards: ${serializeError(error)}`);
    }
  }

  /**
   * Clear a player's cards
   */
  async clearPlayerCards(playerId: string): Promise<void> {
    try {
      const privatePlayerRef = this.getPrivatePlayerRef(playerId);
      
      logger.log('[DatabaseService] Clearing player cards:', {
        tableId: this.tableId,
        playerId
      });
      
      await set(privatePlayerRef, null);
    } catch (error) {
      throw new Error(`Failed to clear player cards: ${serializeError(error)}`);
    }
  }

  /**
   * Subscribe to table changes
   */
  subscribeToTable(callback: (table: Table) => void): () => void {
    const tableRef = this.getTableRef();
    console.log('[DatabaseService] Subscribing to:', tableRef.toString());
    const handler = onValue(tableRef, (snapshot) => {
      const table = snapshot.val();
      if (table) {
        console.log('[DatabaseService] Subscription fired:', { 
          currentPlayerIndex: table.currentPlayerIndex,
          lastAction: table.lastAction
        });
        callback(table);
      }
    });
    return () => {
      console.log('[DatabaseService] Unsubscribing from:', tableRef.toString());
      off(tableRef, 'value', handler);
    };
  }

  /**
   * Create a new table
   */
  async createTable(
    tableName: string,
    smallBlind: number,
    bigBlind: number,
    maxPlayers: number,
    isPrivate: boolean,
    password?: string
  ): Promise<string> {
    try {
      // Generate a unique ID for the table
      const tableId = this.tableId;
      
      // Create the table object
      const table: Table = {
        id: tableId,
        name: tableName,
        smallBlind,
        bigBlind,
        maxPlayers,
        isPrivate,
        password: isPrivate && password ? password : null,
        players: [],
        communityCards: [],
        pot: 0,
        currentBet: 0,
        dealerPosition: -1,
        currentPlayerIndex: -1,
        phase: 'waiting',
        lastActionTimestamp: Date.now(),
        bettingRound: 'small_blind',
        roundBets: {},
        minRaise: bigBlind * 2,
        turnTimeLimit: 45000, // 45 seconds
        isHandInProgress: false,
        activePlayerCount: 0,
        lastAction: null,
        lastActivePlayer: null,
        lastBettor: null,
        handId: '',
      };
      
      // Save the table to the database
      const tableRef = this.getTableRef();
      await set(tableRef, table);
      
      logger.log(`[DatabaseService] Table created successfully:`, {
        tableId,
        tableName,
        smallBlind,
        bigBlind,
        maxPlayers,
        isPrivate
      });
      
      return tableId;
    } catch (error) {
      throw new Error(`Failed to create table: ${serializeError(error)}`);
    }
  }

  /**
   * Add a player to the table
   */
  async addPlayer(player: Omit<Player, 'isActive' | 'hasFolded'>): Promise<void> {
    try {
      const tableRef = this.getTableRef();
      const snapshot = await get(tableRef);
      
      if (!snapshot.exists()) {
        throw new Error(`Table ${this.tableId} does not exist`);
      }
      
      const table = snapshot.val() as Table;
      
      // Initialize players array if it doesn't exist
      if (!table.players) {
        logger.log('[DatabaseService] Initializing players array for table:', this.tableId);
        table.players = [];
      }

      // Check if player already exists
      const existingPlayerIndex = table.players.findIndex(p => p.id === player.id);
      if (existingPlayerIndex !== -1) {
        // Update existing player
        table.players[existingPlayerIndex] = {
          ...table.players[existingPlayerIndex],
          ...player,
          isActive: true,
          hasFolded: false,
        };
      } else {
        // Add new player
        table.players.push({
          ...player,
          isActive: true,
          hasFolded: false,
        });
        table.activePlayerCount = (table.activePlayerCount || 0) + 1;
      }

      await this.updateTable(table);
    } catch (error) {
      throw new Error(`Failed to add player: ${serializeError(error)}`);
    }
  }

  /**
   * Get a table by ID (static method)
   */
  static async getTableData(tableId: string): Promise<Table | null> {
    try {
      if (!tableId) {
        console.error('[DatabaseService] Invalid tableId provided:', {
          tableId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Invalid tableId provided');
      }
      
      const snapshot = await get(ref(database, `tables/${tableId}`));
      const tableData = snapshot.val();
      
      if (!tableData) {
        console.warn('[DatabaseService] Table not found:', {
          tableId,
          timestamp: new Date().toISOString(),
        });
        return null;
      }
      
      return tableData;
    } catch (error) {
      console.error('[DatabaseService] Error getting table data:', {
        tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
  async updateTableTransaction(updateFn: (current: Table) => Table): Promise<void> {
    const tableRef = this.getTableRef();
    try {
      logger.log('[DatabaseService] updateTableTransaction starting:', { tableId: this.tableId });
      await runTransaction(tableRef, (current) => {
        if (!current) return null; // Abort if no data exists
        logger.log('[DatabaseService] updateTableTransaction transaction:', { current });
        return updateFn(current as Table); // Cast current to Table and apply update
      });
      logger.log('[DatabaseService] updateTableTransaction completed:', { tableId: this.tableId });
    } catch (error) {
      logger.error('[DatabaseService] Transaction failed:', { 
        tableId: this.tableId,
        error: serializeError(error),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
} 