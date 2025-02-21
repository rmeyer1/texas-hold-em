import { GameManager } from '../../services/gameManager';
import { Table } from '@/types/poker';
import { update, get, ref, runTransaction } from 'firebase/database';

describe('GameManager', () => {
  let gameManager: GameManager;
  const mockTableId = 'test-table-123';
  
  beforeEach(() => {
    jest.clearAllMocks();
    gameManager = new GameManager(mockTableId);
  });

  describe('moveToNextPlayer', () => {
    it('should move to showdown when all active players are all-in', async () => {
      // Mock table state
      const mockTable: Table = {
        id: mockTableId,
        players: [
          {
            id: 'player1',
            name: 'Player 1',
            chips: 0, // All-in
            position: 0,
            isActive: true,
            hasFolded: false,
          },
          {
            id: 'player2',
            name: 'Player 2',
            chips: 0, // All-in
            position: 1,
            isActive: true,
            hasFolded: false,
          },
          {
            id: 'player3',
            name: 'Player 3',
            chips: 0, // All-in
            position: 2,
            isActive: true,
            hasFolded: false,
          },
        ],
        communityCards: [],
        pot: 300,
        currentBet: 100,
        dealerPosition: 0,
        currentPlayerIndex: 1,
        phase: 'flop',
        bettingRound: 'betting',
        roundBets: {
          player1: 100,
          player2: 100,
          player3: 100,
        },
        smallBlind: 10,
        bigBlind: 20,
        lastActionTimestamp: Date.now(),
        turnTimeLimit: 45000,
        minRaise: 20,
      };

      // Mock Firebase get response
      (get as jest.Mock).mockResolvedValue({
        val: () => mockTable,
      });

      // Call handlePlayerAction which will trigger moveToNextPlayer
      await gameManager.handlePlayerAction('player2', 'call');

      // Verify that update was called with the correct phase transition
      expect(update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          phase: 'showdown',
          lastActionTimestamp: expect.any(Number),
        })
      );
    });

    it('should move to showdown when all but one player are all-in and remaining player cannot call', async () => {
      // Mock table state
      const mockTable: Table = {
        id: mockTableId,
        players: [
          {
            id: 'player1',
            name: 'Player 1',
            chips: 0, // All-in
            position: 0,
            isActive: true,
            hasFolded: false,
          },
          {
            id: 'player2',
            name: 'Player 2',
            chips: 50, // Not enough to call
            position: 1,
            isActive: true,
            hasFolded: false,
          },
          {
            id: 'player3',
            name: 'Player 3',
            chips: 0, // All-in
            position: 2,
            isActive: true,
            hasFolded: false,
          },
        ],
        communityCards: [],
        pot: 300,
        currentBet: 100,
        dealerPosition: 0,
        currentPlayerIndex: 1,
        phase: 'flop',
        bettingRound: 'betting',
        roundBets: {
          player1: 100,
          player2: 50,
          player3: 100,
        },
        smallBlind: 10,
        bigBlind: 20,
        lastActionTimestamp: Date.now(),
        turnTimeLimit: 45000,
        minRaise: 20,
      };

      // Mock Firebase get response
      (get as jest.Mock).mockResolvedValue({
        val: () => mockTable,
      });

      // Call handlePlayerAction which will trigger moveToNextPlayer
      await gameManager.handlePlayerAction('player2', 'call');

      // Verify that update was called with the correct phase transition
      expect(update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          phase: 'showdown',
          lastActionTimestamp: expect.any(Number),
        })
      );
    });
  });

  describe('concurrent betting', () => {
    it('should handle concurrent bets correctly using transactions', async () => {
      // Mock initial table state
      const initialTable: Table = {
        id: mockTableId,
        players: [
          { 
            id: 'player1', 
            chips: 1000, 
            isActive: true, 
            hasFolded: false, 
            name: 'Player 1',
            position: 0,
          },
          { 
            id: 'player2', 
            chips: 1000, 
            isActive: true, 
            hasFolded: false, 
            name: 'Player 2',
            position: 1,
          },
        ],
        currentPlayerIndex: 0,
        currentBet: 20,
        minRaise: 20,
        pot: 40,
        roundBets: { player1: 20, player2: 20 },
        phase: 'preflop',
        lastActionTimestamp: Date.now(),
        dealerPosition: 0,
        turnTimeLimit: 45000,
        communityCards: [],
        smallBlind: 10,
        bigBlind: 20,
        bettingRound: 'first_round'
      };

      // Mock get to return our table state
      let currentTableState = { ...initialTable };
      
      (get as jest.Mock).mockImplementation(() => ({
        val: () => currentTableState
      }));

      // Mock runTransaction to simulate the transaction
      (runTransaction as jest.Mock).mockImplementation(async (ref, updateFn) => {
        const result = await updateFn(currentTableState);
        currentTableState = { ...result };
        return result;
      });

      // Simulate concurrent bets
      await gameManager.handlePlayerAction('player1', 'raise', 100);
      await gameManager.handlePlayerAction('player1', 'raise', 150);

      // Verify transaction was used
      expect(runTransaction).toHaveBeenCalledTimes(2);

      // Verify the final state matches what we expect
      expect(currentTableState.currentBet).toBe(150);
      expect(currentTableState.players[0].chips).toBe(850); // 1000 - 150
      expect(currentTableState.roundBets.player1).toBe(150);
    });
  });
}); 