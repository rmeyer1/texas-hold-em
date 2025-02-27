import { ref, set, update, onValue, off, get, type DataSnapshot } from 'firebase/database';
import { database } from './firebase';
import type { Table, Player } from '@/types/poker';
import { connectionManager } from './connectionManager';

export class TableService {
  private tableRef;

  constructor(tableId: string) {
    this.tableRef = ref(database, `tables/${tableId}`);
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

  public async addPlayer(player: Omit<Player, 'holeCards' | 'isActive' | 'hasFolded'>): Promise<void> {
    const table = await this.ensureTableExists();
    
    // Ensure players array exists
    const currentPlayers = table.players || [];
    
    if (currentPlayers.length >= 10) {
      throw new Error('Table is full');
    }

    const newPlayer: Player = {
      ...player,
      holeCards: [],
      isActive: true,
      hasFolded: false,
    };

    const players = [...currentPlayers, newPlayer];
    await update(this.tableRef, { players });
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