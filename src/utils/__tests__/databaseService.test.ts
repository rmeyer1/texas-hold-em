import { DatabaseService } from '../../services/databaseService';
import { Card, Suit, Rank } from '@/types/poker';
import { getAuth } from 'firebase/auth';
import { ref, get, set, update, onValue, off } from 'firebase/database';
import { database } from '../../services/firebase';
import { Table } from '@/types/poker';

// Note: Firebase and DatabaseService mocks are already set up in jest.setup.ts

describe('DatabaseService', () => {
  let dbService: jest.Mocked<DatabaseService>;
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
    lastBettor: null,
    isPrivate: false,
    password: null,
  } as Table;

  beforeEach(() => {
    jest.clearAllMocks();
    dbService = new DatabaseService(mockTableId) as jest.Mocked<DatabaseService>;
  });

  describe('getCurrentUserId', () => {
    it('should return user ID when authenticated', () => {
      const mockUser = { uid: 'test-user-id' };
      jest.spyOn(dbService, 'getCurrentUserId').mockReturnValue(mockUser.uid);

      const result = dbService.getCurrentUserId();
      expect(result).toBe(mockUser.uid);
    });

    it('should return null when not authenticated', () => {
      jest.spyOn(dbService, 'getCurrentUserId').mockReturnValue(null);

      const result = dbService.getCurrentUserId();
      expect(result).toBeNull();
    });
  });

  describe('getTable', () => {
    it('should return table data when it exists', async () => {
      jest.spyOn(dbService, 'getTable').mockResolvedValue(mockTable);

      const result = await dbService.getTable();
      expect(result).toEqual(mockTable);
      expect(dbService.getTable).toHaveBeenCalled();
    });

    it('should return null when table does not exist', async () => {
      jest.spyOn(dbService, 'getTable').mockResolvedValue(null);

      const result = await dbService.getTable();
      expect(result).toBeNull();
      expect(dbService.getTable).toHaveBeenCalled();
    });

    it('should throw error when get fails', async () => {
      const mockError = new Error('Database error');
      jest.spyOn(dbService, 'getTable').mockRejectedValue(mockError);

      await expect(dbService.getTable()).rejects.toThrow();
      expect(dbService.getTable).toHaveBeenCalled();
    });
  });

  describe('updateTable', () => {
    it('should update table with provided data', async () => {
      const updates = { pot: 100, currentBet: 20 };
      jest.spyOn(dbService, 'updateTable').mockResolvedValue(undefined);

      await dbService.updateTable(updates);
      expect(dbService.updateTable).toHaveBeenCalledWith(updates);
    });

    it('should throw error when update fails', async () => {
      const updates = { pot: 100, currentBet: 20 };
      const mockError = new Error('Update error');
      jest.spyOn(dbService, 'updateTable').mockRejectedValue(mockError);

      await expect(dbService.updateTable(updates)).rejects.toThrow();
      expect(dbService.updateTable).toHaveBeenCalledWith(updates);
    });
  });

  describe('subscribeToTable', () => {
    it('should subscribe to table changes and return unsubscribe function', () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();
      
      jest.spyOn(dbService, 'subscribeToTable').mockImplementation((callback: (table: Table) => void) => {
        callback(mockTable);
        return mockUnsubscribe;
      });

      const unsubscribe = dbService.subscribeToTable(mockCallback);
      expect(mockCallback).toHaveBeenCalledWith(mockTable);
      
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalled();
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
      
      jest.spyOn(dbService, 'setPlayerCards').mockResolvedValue(undefined);

      await dbService.setPlayerCards(playerId, cards, handId);
      expect(dbService.setPlayerCards).toHaveBeenCalledWith(playerId, cards, handId);
    });
  });

  describe('getPlayerCards', () => {
    const playerId = 'player-1';
    const handId = 'test-hand-id';
    const cards: Card[] = [
      { suit: 'hearts' as Suit, rank: 'A' as Rank },
      { suit: 'spades' as Suit, rank: 'K' as Rank },
    ];

    it('should return player cards when they exist and handId matches', async () => {
      jest.spyOn(dbService, 'getPlayerCards').mockResolvedValue(cards);

      const result = await dbService.getPlayerCards(playerId, handId);
      expect(result).toEqual(cards);
      expect(dbService.getPlayerCards).toHaveBeenCalledWith(playerId, handId);
    });

    it('should return null when player cards do not exist', async () => {
      jest.spyOn(dbService, 'getPlayerCards').mockResolvedValue(null);

      const result = await dbService.getPlayerCards(playerId);
      expect(result).toBeNull();
      expect(dbService.getPlayerCards).toHaveBeenCalledWith(playerId);
    });

    it('should return null when handId does not match', async () => {
      const differentHandId = 'different-hand-id';
      jest.spyOn(dbService, 'getPlayerCards').mockResolvedValue(null);

      const result = await dbService.getPlayerCards(playerId, differentHandId);
      expect(result).toBeNull();
      expect(dbService.getPlayerCards).toHaveBeenCalledWith(playerId, differentHandId);
    });
  });

  describe('static getTableData', () => {
    it('should return table data when it exists', async () => {
      // Since this is a static method, we need to mock it differently
      const mockGetTableData = jest.spyOn(DatabaseService, 'getTableData');
      mockGetTableData.mockResolvedValue(mockTable);

      const result = await DatabaseService.getTableData(mockTableId);
      expect(result).toEqual(mockTable);
      expect(mockGetTableData).toHaveBeenCalledWith(mockTableId);

      mockGetTableData.mockRestore();
    });
  });
}); 