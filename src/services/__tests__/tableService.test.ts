import { FirebaseTableService } from '../tableService.firebase';
import { TableServiceClient } from '../tableService.client';
import { TableServiceFactory } from '../factories/tableServiceFactory';
import { Table, Player } from '@/types/poker';

// Mock Firebase modules
jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(),
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  onValue: jest.fn(),
  off: jest.fn(),
  runTransaction: jest.fn(),
}));

// Mock fetch for HTTP client
global.fetch = jest.fn();
global.EventSource = jest.fn().mockImplementation(() => ({
  onmessage: jest.fn(),
  close: jest.fn(),
}));

describe('TableService Implementations', () => {
  const mockTableId = 'test-table-123';
  const mockTable: Table = {
    id: mockTableId,
    players: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    dealerPosition: -1,
    currentPlayerIndex: -1,
    phase: 'waiting',
    bettingRound: 'small_blind',
    roundBets: {},
    smallBlind: 10,
    bigBlind: 20,
    minRaise: 40,
    turnTimeLimit: 45000,
    isHandInProgress: false,
    activePlayerCount: 0,
    lastAction: null,
    lastActivePlayer: null,
    lastBettor: null,
    isPrivate: false,
    password: null,
    lastActionTimestamp: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('FirebaseTableService', () => {
    let service: FirebaseTableService;

    beforeEach(() => {
      service = new FirebaseTableService(mockTableId);
    });

    it('should get table data', async () => {
      const mockSnapshot = {
        exists: () => true,
        val: () => mockTable,
      };
      require('firebase/database').get.mockResolvedValue(mockSnapshot);

      const result = await service.getTable();
      expect(result).toEqual(mockTable);
    });

    it('should update table data', async () => {
      const updates = { pot: 100 };
      await service.updateTable(updates);
      expect(require('firebase/database').update).toHaveBeenCalled();
    });

    it('should handle subscription', () => {
      const callback = jest.fn();
      const unsubscribe = service.subscribeToTable(callback);
      expect(require('firebase/database').onValue).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('TableServiceClient', () => {
    let service: TableServiceClient;

    beforeEach(() => {
      service = new TableServiceClient(mockTableId);
    });

    it('should get table data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTable),
      });

      const result = await service.getTable();
      expect(result).toEqual(mockTable);
    });

    it('should update table data', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const updates = { pot: 100 };
      await service.updateTable(updates);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle subscription', () => {
      const callback = jest.fn();
      const unsubscribe = service.subscribeToTable(callback);
      expect(EventSource).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('TableServiceFactory', () => {
    it('should create FirebaseTableService when useFirebase is true', () => {
      const service = TableServiceFactory.create(mockTableId, true);
      expect(service).toBeInstanceOf(FirebaseTableService);
    });

    it('should create TableServiceClient when useFirebase is false', () => {
      const service = TableServiceFactory.create(mockTableId, false);
      expect(service).toBeInstanceOf(TableServiceClient);
    });

    it('should create FirebaseTableService by default', () => {
      const service = TableServiceFactory.create(mockTableId);
      expect(service).toBeInstanceOf(FirebaseTableService);
    });
  });
}); 