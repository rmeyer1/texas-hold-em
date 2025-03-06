import { BettingManager } from '../../services/bettingManager';
import type { Table } from '@/types/poker';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('BettingManager', () => {
  let bettingManager: BettingManager;
  const mockTableId = 'test-table-123';
  
  beforeEach(() => {
    jest.clearAllMocks();
    bettingManager = new BettingManager(mockTableId);
  });

  // Helper function to create a mock table
  const createMockTable = (): Table => ({
    id: mockTableId,
    name: 'Test Table',
    smallBlind: 5,
    bigBlind: 10,
    players: [
      {
        id: 'player1',
        name: 'Player 1',
        chips: 500,
        position: 0,
        isActive: true,
        hasFolded: false,
      },
      {
        id: 'player2',
        name: 'Player 2',
        chips: 490,
        position: 1,
        isActive: true,
        hasFolded: false,
      },
      {
        id: 'player3',
        name: 'Player 3',
        chips: 500,
        position: 2,
        isActive: true,
        hasFolded: false,
      },
    ],
    communityCards: [],
    pot: 0,
    currentBet: 10,
    dealerPosition: 2,
    currentPlayerIndex: 2,
    phase: 'preflop',
    lastActionTimestamp: Date.now() - 5000,
    bettingRound: 'big_blind',
    roundBets: {
      player1: 10,
      player2: 5,
      player3: 0
    },
    minRaise: 10,
    turnTimeLimit: 30000,
    isHandInProgress: true,
    activePlayerCount: 3,
    lastAction: null,
    lastActivePlayer: null,
    lastBettor: null,
    isPrivate: false,
    password: null
  });

  describe('handleFold', () => {
    it('should mark a player as folded', () => {
      const mockTable = createMockTable();
      const result = bettingManager.handleFold(mockTable, 'player3');
      
      expect(result.players).toBeDefined();
      expect(result.players?.[2].hasFolded).toBe(true);
      expect(result.lastAction).toBe('fold');
      expect(result.lastActivePlayer).toBe('player3');
    });

    it('should throw an error if player is not found', () => {
      const mockTable = createMockTable();
      expect(() => bettingManager.handleFold(mockTable, 'nonexistent')).toThrow(
        'Player nonexistent not found'
      );
    });
  });

  describe('handleCheck', () => {
    it('should allow a player to check when they can', () => {
      const mockTable = createMockTable();
      // Modify to allow check (current bet = player's bet)
      mockTable.roundBets.player3 = mockTable.currentBet;
      
      const result = bettingManager.handleCheck(mockTable, 'player3');
      
      expect(result.roundBets).toBeDefined();
      expect(result.lastAction).toBe('check');
      expect(result.lastActivePlayer).toBe('player3');
    });

    it('should throw an error if player cannot check', () => {
      const mockTable = createMockTable();
      // Current bet (10) is higher than player3's bet (0), so can't check
      expect(() => bettingManager.handleCheck(mockTable, 'player3')).toThrow(
        /Cannot check when there is an active bet/
      );
    });
  });

  describe('handleCall', () => {
    it('should allow a player to call the current bet', () => {
      const mockTable = createMockTable();
      const initialChips = mockTable.players[2].chips;
      const callAmount = mockTable.currentBet;
      
      const result = bettingManager.handleCall(mockTable, 'player3');
      
      expect(result.players).toBeDefined();
      expect(result.players?.[2].chips).toBe(initialChips - callAmount);
      expect(result.roundBets?.player3).toBe(callAmount);
      expect(result.lastAction).toBe('call');
      expect(result.lastActivePlayer).toBe('player3');
    });

    it('should handle call that results in all-in', () => {
      const mockTable = createMockTable();
      // Set player3 chips lower than the call amount
      mockTable.players[2].chips = 5;
      
      const result = bettingManager.handleCall(mockTable, 'player3');
      
      expect(result.players).toBeDefined();
      expect(result.players?.[2].chips).toBe(0);
      expect(result.roundBets?.player3).toBe(5); // All they have
      expect(result.lastAction).toBe('call');
      expect(result.lastActivePlayer).toBe('player3');
    });
  });

  describe('handleBet', () => {
    it('should allow a player to place a bet when no current bet exists', () => {
      const mockTable = createMockTable();
      mockTable.currentBet = 0; // No current bet
      const betAmount = 20;
      
      const result = bettingManager.handleBet(mockTable, 'player3', betAmount);
      
      expect(result.players).toBeDefined();
      expect(result.currentBet).toBe(betAmount);
      expect(result.players?.[2].chips).toBe(mockTable.players[2].chips - betAmount);
      expect(result.roundBets?.player3).toBe(betAmount);
      expect(result.lastAction).toBe('bet');
      expect(result.lastActivePlayer).toBe('player3');
      expect(result.lastBettor).toBe('player3');
    });

    it('should throw an error if there is already a bet', () => {
      const mockTable = createMockTable();
      // currentBet is already 10
      expect(() => bettingManager.handleBet(mockTable, 'player3', 20)).toThrow(
        /Cannot bet when there is already a bet/
      );
    });
  });

  describe('handleRaise', () => {
    it('should allow a player to raise the current bet', () => {
      const mockTable = createMockTable();
      const initialChips = mockTable.players[2].chips;
      const raiseAmount = 30; // Raising to 30 (current bet is 10)
      
      const result = bettingManager.handleRaise(mockTable, 'player3', raiseAmount);
      
      expect(result.players).toBeDefined();
      expect(result.currentBet).toBe(raiseAmount);
      expect(result.players?.[2].chips).toBe(initialChips - raiseAmount);
      expect(result.roundBets?.player3).toBe(raiseAmount);
      expect(result.lastAction).toBe('raise');
      expect(result.lastActivePlayer).toBe('player3');
      expect(result.lastBettor).toBe('player3');
    });

    it('should throw an error if raise amount is less than min raise', () => {
      const mockTable = createMockTable();
      // Try to raise by less than the minimum
      const invalidRaiseAmount = mockTable.currentBet + mockTable.minRaise - 1;
      
      expect(() => bettingManager.handleRaise(mockTable, 'player3', invalidRaiseAmount)).toThrow(
        /Raise must be at least .* more than current bet/
      );
    });
  });

  describe('isRoundComplete', () => {
    it('should return true when all active players have acted and bets are equal', () => {
      const mockTable = createMockTable();
      // Make all players have matching bets
      mockTable.roundBets = {
        player1: 10,
        player2: 10,
        player3: 10
      };
      
      expect(bettingManager.isRoundComplete(mockTable)).toBe(true);
    });

    it('should return false when not all players have acted', () => {
      const mockTable = createMockTable();
      // player3 has not acted (no record in roundBets)
      mockTable.roundBets = {
        player1: 10,
        player2: 10
      };
      
      expect(bettingManager.isRoundComplete(mockTable)).toBe(false);
    });

    it('should return false when bets are not equal', () => {
      const mockTable = createMockTable();
      // Different bet amounts
      mockTable.roundBets = {
        player1: 10,
        player2: 5, 
        player3: 0
      };
      
      expect(bettingManager.isRoundComplete(mockTable)).toBe(false);
    });
  });

  describe('updatePot', () => {
    it('should move all bets to the pot', () => {
      const mockTable = createMockTable();
      // Set some bets
      mockTable.roundBets = {
        player1: 20,
        player2: 20,
        player3: 20
      };
      const totalBets = 60;
      
      const result = bettingManager.updatePot(mockTable);
      
      expect(result.pot).toBe(totalBets);
      expect(result.roundBets).toEqual({});
    });
  });
}); 