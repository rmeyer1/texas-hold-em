import { DeckManager } from '../../services/deckManager';
import { DatabaseService } from '../../services/databaseService';
import { Deck } from '@/utils/deck';
import type { Card } from '@/types/poker';

// Create manual mocks
jest.mock('@/utils/deck');
jest.mock('../../services/databaseService', () => {
  return {
    DatabaseService: jest.fn().mockImplementation(() => {
      return {
        setPlayerCards: jest.fn().mockResolvedValue(undefined),
        clearPlayerCards: jest.fn().mockResolvedValue(undefined),
        db: {},
        tableId: 'mock-table-id',
        debounceTimer: null,
        pendingUpdates: {},
        getCurrentUserId: jest.fn(),
        getTableRef: jest.fn(),
        getPrivatePlayerRef: jest.fn(),
        getTable: jest.fn(),
        updateTable: jest.fn(),
        forceUpdateTable: jest.fn(),
        sanitizeData: jest.fn(),
        getPlayerCards: jest.fn(),
        subscribeToTable: jest.fn(),
        createTable: jest.fn(),
        updateTableTransaction: jest.fn(),
      };
    }),
  };
});

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Cast to the correct mock type
const MockDatabaseService = DatabaseService as unknown as jest.Mock;
const MockDeck = Deck as unknown as jest.Mock;

describe('DeckManager', () => {
  let deckManager: DeckManager;
  let mockDeck: jest.Mocked<Deck>;
  const mockTableId = 'test-table-123';
  
  // Get access to the mock methods
  const mockSetPlayerCards = jest.fn().mockResolvedValue(undefined);
  const mockClearPlayerCards = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Deck implementation
    mockDeck = {
      reset: jest.fn(),
      shuffle: jest.fn(),
      dealCard: jest.fn(),
      dealHoleCards: jest.fn(),
      dealFlop: jest.fn(),
      getRemainingCards: jest.fn(),
    } as unknown as jest.Mocked<Deck>;
    
    // Replace the Deck constructor implementation
    MockDeck.mockImplementation(() => mockDeck);
    
    // We don't need to get the instance, as the DeckManager will create a new one
    // Just update the mock implementation before creating the DeckManager
    MockDatabaseService.mockImplementation(() => ({
      setPlayerCards: mockSetPlayerCards,
      clearPlayerCards: mockClearPlayerCards,
      db: {},
      tableId: mockTableId,
      debounceTimer: null,
      pendingUpdates: {},
    }));
    
    deckManager = new DeckManager(mockTableId);
  });

  describe('reset', () => {
    it('should reset the deck', () => {
      deckManager.reset();
      expect(mockDeck.reset).toHaveBeenCalledTimes(1);
    });
  });

  describe('dealHoleCards', () => {
    it('should deal two cards to a player and save them to the database', async () => {
      const mockPlayerId = 'player123';
      const mockHandId = 'hand456';
      const mockCards: [Card, Card] = [
        { suit: 'hearts', rank: 'A' },
        { suit: 'spades', rank: 'K' }
      ];
      
      mockDeck.dealHoleCards.mockReturnValue(mockCards);
      
      const result = await deckManager.dealHoleCards(mockPlayerId, mockHandId);
      
      expect(mockDeck.dealHoleCards).toHaveBeenCalledTimes(1);
      expect(mockSetPlayerCards).toHaveBeenCalledWith(
        mockPlayerId, 
        mockCards,
        mockHandId
      );
      expect(result).toEqual(mockCards);
    });

    it('should return undefined if no cards can be dealt', async () => {
      const mockPlayerId = 'player123';
      const mockHandId = 'hand456';
      
      mockDeck.dealHoleCards.mockReturnValue(undefined);
      
      const result = await deckManager.dealHoleCards(mockPlayerId, mockHandId);
      
      expect(mockDeck.dealHoleCards).toHaveBeenCalledTimes(1);
      expect(mockSetPlayerCards).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('clearPlayerCards', () => {
    it('should clear a player\'s cards from the database', async () => {
      const mockPlayerId = 'player123';
      
      await deckManager.clearPlayerCards(mockPlayerId);
      
      expect(mockClearPlayerCards).toHaveBeenCalledWith(mockPlayerId);
    });
  });

  describe('dealFlop', () => {
    it('should deal three cards for the flop', () => {
      const mockFlop: [Card, Card, Card] = [
        { suit: 'hearts', rank: '10' },
        { suit: 'clubs', rank: '5' },
        { suit: 'diamonds', rank: 'Q' }
      ];
      
      mockDeck.dealFlop.mockReturnValue(mockFlop);
      
      const result = deckManager.dealFlop();
      
      expect(mockDeck.dealFlop).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockFlop);
    });

    it('should return undefined if the flop cannot be dealt', () => {
      mockDeck.dealFlop.mockReturnValue(undefined);
      
      const result = deckManager.dealFlop();
      
      expect(mockDeck.dealFlop).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });
  });

  describe('dealCard', () => {
    it('should deal a single card for the turn or river', () => {
      const mockCard: Card = { suit: 'hearts', rank: 'A' };
      
      mockDeck.dealCard.mockReturnValue(mockCard);
      
      const result = deckManager.dealCard();
      
      expect(mockDeck.dealCard).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockCard);
    });

    it('should return undefined if a card cannot be dealt', () => {
      mockDeck.dealCard.mockReturnValue(undefined);
      
      const result = deckManager.dealCard();
      
      expect(mockDeck.dealCard).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });
  });

  describe('getRemainingCards', () => {
    it('should return the number of remaining cards in the deck', () => {
      const remainingCards = 42;
      
      mockDeck.getRemainingCards.mockReturnValue(remainingCards);
      
      const result = deckManager.getRemainingCards();
      
      expect(mockDeck.getRemainingCards).toHaveBeenCalledTimes(1);
      expect(result).toBe(remainingCards);
    });
  });
}); 