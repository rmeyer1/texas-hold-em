import { PhaseManager } from '../../services/phaseManager';
import { PlayerManager } from '../../services/playerManager';
import { BettingManager } from '../../services/bettingManager';
import type { Table } from '@/types/poker';

// Mock dependencies
jest.mock('../../services/playerManager');
jest.mock('../../services/bettingManager');
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe('PhaseManager', () => {
  let phaseManager: PhaseManager;
  const mockTableId = 'test-table-123';
  let mockBettingManager: jest.Mocked<BettingManager>;
  let mockPlayerManager: jest.Mocked<PlayerManager>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    mockBettingManager = new BettingManager(mockTableId) as jest.Mocked<BettingManager>;
    mockPlayerManager = new PlayerManager(mockTableId) as jest.Mocked<PlayerManager>;
    
    // For resetBettingRound in prepareNextPhase
    mockBettingManager.resetBettingRound = jest.fn().mockImplementation(
      (table: Table) => ({ currentBet: 0, players: [...table.players] })
    );
    
    // Required for the phase advancement check
    mockBettingManager.isRoundComplete = jest.fn().mockReturnValue(true);
    
    // Mock the getActivePlayers method to return a valid array
    mockPlayerManager.getActivePlayers = jest.fn().mockImplementation(
      (table: Table) => table.players.filter(p => p.isActive && !p.hasFolded)
    );
    
    // Mock getActiveCount
    mockPlayerManager.getActiveCount = jest.fn().mockImplementation(
      (table: Table) => table.players.filter(p => p.isActive && !p.hasFolded).length
    );
    
    // Mock getNextActivePlayerIndex
    mockPlayerManager.getNextActivePlayerIndex = jest.fn().mockImplementation(
      (table: Table, currentIndex: number) => {
        const { players } = table;
        let nextIndex = (currentIndex + 1) % players.length;
        while (!players[nextIndex].isActive || players[nextIndex].hasFolded) {
          nextIndex = (nextIndex + 1) % players.length;
          if (nextIndex === currentIndex) break; // Prevent infinite loop
        }
        return nextIndex;
      }
    );
    
    phaseManager = new PhaseManager(mockTableId);
    
    // Replace the internal instances with our mocks
    (phaseManager as any).playerManager = mockPlayerManager;
    (phaseManager as any).bettingManager = mockBettingManager;
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
        chips: 500,
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
    roundBets: { player1: 10, player2: 5, player3: 0 },
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

  describe('setPhase', () => {
    it('should set the phase of the table', () => {
      const mockTable = createMockTable();
      phaseManager.setPhase(mockTable, 'flop');
      expect(mockTable.phase).toBe('flop');
    });
  });

  describe('getNextPhase', () => {
    it('should return preflop when current phase is waiting', () => {
      expect(phaseManager.getNextPhase('waiting')).toBe('preflop');
    });

    it('should return flop when current phase is preflop', () => {
      expect(phaseManager.getNextPhase('preflop')).toBe('flop');
    });

    it('should return turn when current phase is flop', () => {
      expect(phaseManager.getNextPhase('flop')).toBe('turn');
    });

    it('should return river when current phase is turn', () => {
      expect(phaseManager.getNextPhase('turn')).toBe('river');
    });

    it('should return showdown when current phase is river', () => {
      expect(phaseManager.getNextPhase('river')).toBe('showdown');
    });

    it('should return waiting when current phase is showdown', () => {
      expect(phaseManager.getNextPhase('showdown')).toBe('waiting');
    });

    it('should return waiting as default for unrecognized phases', () => {
      expect(phaseManager.getNextPhase('UNKNOWN_PHASE' as any)).toBe('waiting');
    });
  });

  describe('prepareNextPhase', () => {
    it('should advance the phase and reset betting round', () => {
      const mockTable = createMockTable();
      mockTable.phase = 'preflop';

      const result = phaseManager.prepareNextPhase(mockTable);

      expect(result.phase).toBe('flop');
      expect(result.currentBet).toBe(0);
      expect(result.roundBets).toEqual({});
      expect(result.minRaise).toBe(mockTable.bigBlind * 2);
      expect(result.lastBettor).toBe(null);
    });

    it('should set the first player to act', () => {
      const mockTable = createMockTable();
      mockTable.phase = 'flop';
      
      // Mock implementation for getFirstToActIndex
      (phaseManager as any).getFirstToActIndex = jest.fn().mockReturnValue(1);

      const result = phaseManager.prepareNextPhase(mockTable);

      expect(result.phase).toBe('turn');
      expect(result.currentPlayerIndex).toBe(1);
      expect((phaseManager as any).getFirstToActIndex).toHaveBeenCalledWith(mockTable);
    });
  });

  describe('getFirstToActIndex', () => {
    it('should return the first active player after the dealer in post-flop phases', () => {
      const mockTable = createMockTable();
      mockTable.phase = 'flop';
      mockTable.dealerPosition = 1;  // Player 2 is dealer
      
      // Directly access the private method
      const firstToActIndex = (phaseManager as any).getFirstToActIndex(mockTable);
      
      // Should be the first active player after the dealer (player at position 2)
      expect(firstToActIndex).toBe(2);
    });

    it('should wrap around if the dealer is the last player', () => {
      const mockTable = createMockTable();
      mockTable.phase = 'flop';
      mockTable.dealerPosition = 2;  // Player 3 is dealer (last position)
      
      // Directly access the private method
      const firstToActIndex = (phaseManager as any).getFirstToActIndex(mockTable);
      
      // Should wrap around to the first player
      expect(firstToActIndex).toBe(0);
    });

    it('should skip folded players when finding first to act', () => {
      const mockTable = createMockTable();
      mockTable.phase = 'turn';
      mockTable.dealerPosition = 0;
      
      // Mark player2 (position 1) as folded
      mockTable.players[1].hasFolded = true;
      
      // Directly access the private method
      const firstToActIndex = (phaseManager as any).getFirstToActIndex(mockTable);
      
      // Should skip folded player and return position 2
      expect(firstToActIndex).toBe(2);
    });
  });

  describe('shouldAdvancePhase', () => {
    it('should return true when betting round is complete', () => {
      const mockTable = createMockTable();
      mockBettingManager.isRoundComplete.mockReturnValue(true);
      
      expect(phaseManager.shouldAdvancePhase(mockTable)).toBe(true);
      expect(mockBettingManager.isRoundComplete).toHaveBeenCalledWith(mockTable);
    });

    it('should return false when betting round is not complete', () => {
      const mockTable = createMockTable();
      mockBettingManager.isRoundComplete.mockReturnValue(false);
      
      expect(phaseManager.shouldAdvancePhase(mockTable)).toBe(false);
      expect(mockBettingManager.isRoundComplete).toHaveBeenCalledWith(mockTable);
    });

    it('should return true if only one player is not folded', () => {
      const mockTable = createMockTable();
      
      // Mark two players as folded
      mockTable.players[0].hasFolded = true;
      mockTable.players[1].hasFolded = true;
      
      // Even if betting is not complete
      mockBettingManager.isRoundComplete.mockReturnValue(false);
      
      expect(phaseManager.shouldAdvancePhase(mockTable)).toBe(true);
    });
  });
}); 