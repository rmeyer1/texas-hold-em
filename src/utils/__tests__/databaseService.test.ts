import { DatabaseService } from '../../services/databaseService';
import { ref, get, set, update, onValue, off } from 'firebase/database';
import { database } from '../../services/firebase';
import { getAuth } from 'firebase/auth';
import { Card, Suit, Rank } from '@/types/poker';
import { serializeError } from '@/utils/errorUtils';

// Mock Firebase
jest.mock('../../services/firebase', () => ({
  database: {
    // Mock implementation
  },
}));

jest.mock('firebase/database', () => {
  const actualRef = jest.fn((db, path) => ({
    key: path.split('/').pop(),
    toString: () => path,
  }));
  
  return {
    ref: actualRef,
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    onValue: jest.fn(),
    off: jest.fn(),
  };
});

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
}));

// Mock serializeError function
jest.mock('@/utils/errorUtils', () => ({
  serializeError: jest.fn((error) => 
    error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name } 
      : { message: String(error) }
  ),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock connectionManager to avoid dependency issues
jest.mock('../../services/connectionManager', () => ({
  connectionManager: {
    isOnline: jest.fn().mockReturnValue(true),
  },
}));

describe('DatabaseService', () => {
  let dbService: DatabaseService;
  const mockTableId = 'test-table-id';
  const mockTable = {
    id: mockTableId,
    players: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    dealerPosition: 0,
    phase: 'waiting',
    currentPlayerIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
    lastActionTimestamp: Date.now(),
    bettingRound: 'small_blind',
    roundBets: {},
    minRaise: 40,
    turnTimeLimit: 45000,
    isHandInProgress: false,
    activePlayerCount: 0,
    lastAction: null,
    lastActivePlayer: null,
    isPrivate: false,
    password: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dbService = new DatabaseService(mockTableId);
  });

  describe('getCurrentUserId', () => {
    it('should return user ID when authenticated', () => {
      const mockUser = { uid: 'test-user-id' };
      (getAuth as jest.Mock).mockReturnValue({
        currentUser: mockUser,
      });

      const result = dbService.getCurrentUserId();
      expect(result).toBe(mockUser.uid);
      expect(getAuth).toHaveBeenCalled();
    });

    it('should return null when not authenticated', () => {
      (getAuth as jest.Mock).mockReturnValue({
        currentUser: null,
      });

      const result = dbService.getCurrentUserId();
      expect(result).toBeNull();
      expect(getAuth).toHaveBeenCalled();
    });
  });

  describe('getTable', () => {
    it('should return table data when it exists', async () => {
      const mockSnapshot = {
        val: jest.fn().mockReturnValue(mockTable),
        exists: jest.fn().mockReturnValue(true),
      };
      (get as jest.Mock).mockResolvedValue(mockSnapshot);

      const result = await dbService.getTable();
      expect(result).toEqual(mockTable);
      expect(ref).toHaveBeenCalledWith(database, `tables/${mockTableId}`);
      expect(get).toHaveBeenCalled();
    });

    it('should return null when table does not exist', async () => {
      const mockSnapshot = {
        val: jest.fn().mockReturnValue(null),
        exists: jest.fn().mockReturnValue(false),
      };
      (get as jest.Mock).mockResolvedValue(mockSnapshot);

      const result = await dbService.getTable();
      expect(result).toBeNull();
      expect(ref).toHaveBeenCalledWith(database, `tables/${mockTableId}`);
      expect(get).toHaveBeenCalled();
    });

    it('should throw error when get fails', async () => {
      const mockError = new Error('Database error');
      (get as jest.Mock).mockRejectedValue(mockError);

      await expect(dbService.getTable()).rejects.toThrow();
      expect(ref).toHaveBeenCalledWith(database, `tables/${mockTableId}`);
      expect(get).toHaveBeenCalled();
    });
  });

  describe('updateTable', () => {
    it('should update table with provided data', async () => {
      const updates = { pot: 100, currentBet: 20 };
      (update as jest.Mock).mockResolvedValue(undefined);

      await dbService.updateTable(updates);
      expect(ref).toHaveBeenCalledWith(database, `tables/${mockTableId}`);
      expect(update).toHaveBeenCalledWith(expect.anything(), updates);
    });

    it('should throw error when update fails', async () => {
      const updates = { pot: 100, currentBet: 20 };
      const mockError = new Error('Update error');
      
      (update as jest.Mock).mockRejectedValue(mockError);

      await expect(dbService.updateTable(updates)).rejects.toThrow();
      expect(ref).toHaveBeenCalledWith(database, `tables/${mockTableId}`);
    });
  });

  describe('subscribeToTable', () => {
    it('should subscribe to table changes and return unsubscribe function', () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();
      
      (onValue as jest.Mock).mockImplementation((ref, callback) => {
        callback({ 
          val: () => mockTable,
          exists: () => true,
        });
        return mockUnsubscribe;
      });

      const unsubscribe = dbService.subscribeToTable(mockCallback);
      expect(mockCallback).toHaveBeenCalledWith(mockTable);
      
      // Call the returned unsubscribe function
      unsubscribe();
      expect(off).toHaveBeenCalled();
    });
  });

  describe('setPlayerCards', () => {
    it('should set player cards', async () => {
      const playerId = 'player-1';
      const cards: Card[] = [
        { suit: 'hearts' as Suit, rank: 'A' as Rank },
        { suit: 'spades' as Suit, rank: 'K' as Rank },
      ];
      const handId = 'test-hand-id';
      (set as jest.Mock).mockResolvedValue(undefined);

      await dbService.setPlayerCards(playerId, cards, handId);
      
      expect(ref).toHaveBeenCalledWith(database, `private_player_data/${mockTableId}/${playerId}`);
      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        {
          holeCards: cards,
          lastUpdated: expect.any(Number),
          handId: handId,
        }
      );
    });
  });

  describe('getPlayerCards', () => {
    it('should return player cards when they exist', async () => {
      const playerId = 'player-1';
      const handId = 'test-hand-id';
      const cards: Card[] = [
        { suit: 'hearts' as Suit, rank: 'A' as Rank },
        { suit: 'spades' as Suit, rank: 'K' as Rank },
      ];
      const mockSnapshot = {
        val: jest.fn().mockReturnValue({
          holeCards: cards,
          lastUpdated: Date.now(),
          handId: handId,
        }),
        exists: jest.fn().mockReturnValue(true),
      };
      (get as jest.Mock).mockResolvedValue(mockSnapshot);

      const result = await dbService.getPlayerCards(playerId, handId);
      expect(result).toEqual(cards);
      expect(ref).toHaveBeenCalledWith(database, `private_player_data/${mockTableId}/${playerId}`);
      expect(get).toHaveBeenCalled();
    });

    it('should return null when player cards do not exist', async () => {
      const playerId = 'player-1';
      const mockSnapshot = {
        val: jest.fn().mockReturnValue(null),
        exists: jest.fn().mockReturnValue(false),
      };
      (get as jest.Mock).mockResolvedValue(mockSnapshot);

      const result = await dbService.getPlayerCards(playerId);
      expect(result).toBeNull();
      expect(ref).toHaveBeenCalledWith(database, `private_player_data/${mockTableId}/${playerId}`);
      expect(get).toHaveBeenCalled();
    });
  });

  describe('static getTableData', () => {
    it('should return table data when it exists', async () => {
      const mockSnapshot = {
        val: jest.fn().mockReturnValue(mockTable),
        exists: jest.fn().mockReturnValue(true),
      };
      (get as jest.Mock).mockResolvedValue(mockSnapshot);

      const result = await DatabaseService.getTableData(mockTableId);
      expect(result).toEqual(mockTable);
      expect(ref).toHaveBeenCalledWith(database, `tables/${mockTableId}`);
      expect(get).toHaveBeenCalled();
    });
  });
}); 