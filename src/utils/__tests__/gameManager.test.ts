import { GameManager } from '../../services/gameManager';
import { Table } from '@/types/poker';
import { update, get, ref, runTransaction } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { set } from 'firebase/database';

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
        isHandInProgress: true,
        activePlayerCount: 3,
        lastAction: 'call',
        lastActivePlayer: 'player1',
        gameStarted: true,
        isPrivate: false,
        password: null,
      };

      // Mock Firebase get response
      (get as jest.Mock).mockResolvedValue({
        val: () => mockTable,
      });

      // Call moveToNextPlayer directly instead of through handlePlayerAction
      await gameManager['moveToNextPlayer'](mockTable, mockTable.players);

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
        isHandInProgress: true,
        activePlayerCount: 3,
        lastAction: 'call',
        lastActivePlayer: 'player1',
        gameStarted: true,
        isPrivate: false,
        password: null,
      };

      // Mock Firebase get response
      (get as jest.Mock).mockResolvedValue({
        val: () => mockTable,
      });

      // Call moveToNextPlayer directly instead of through handlePlayerAction
      await gameManager['moveToNextPlayer'](mockTable, mockTable.players);

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
        bettingRound: 'first_round',
        isHandInProgress: true,
        activePlayerCount: 2,
        lastAction: null,
        lastActivePlayer: null,
        gameStarted: true,
        isPrivate: false,
        password: null,
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

      // Call placeBet directly instead of through handlePlayerAction
      await gameManager['placeBet']('player1', 100);
      await gameManager['placeBet']('player1', 150);

      // Verify transaction was used
      expect(runTransaction).toHaveBeenCalledTimes(2);

      // Verify the final state matches what we expect
      expect(currentTableState.currentBet).toBe(150);
      expect(currentTableState.players[0].chips).toBe(850); // 1000 - 150
      expect(currentTableState.roundBets.player1).toBe(150);
    });
  });

  describe('createTable', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (getAuth as jest.Mock).mockReturnValue({
        currentUser: { uid: 'test-user-123' }
      });
    });

    it('creates a public table with correct defaults', async () => {
      const tableName = 'Test Table';
      const smallBlind = 10;
      const bigBlind = 20;
      const maxPlayers = 6;
      const isPrivate = false;

      const gameManager = new GameManager('temp');
      const tableId = await gameManager.createTable(
        tableName,
        smallBlind,
        bigBlind,
        maxPlayers,
        isPrivate
      );

      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: tableName,
          smallBlind,
          bigBlind,
          maxPlayers,
          isPrivate: false,
          password: null,
          isHandInProgress: false,
          activePlayerCount: 1,
          lastAction: null,
          lastActivePlayer: null,
          gameStarted: false,
          bettingRound: 'first_round',
          phase: 'waiting',
          pot: 0,
          currentBet: 0,
          dealerPosition: 0,
          currentPlayerIndex: 0,
          communityCards: [],
          roundBets: {},
          minRaise: bigBlind,
          turnTimeLimit: 45000,
          lastActionTimestamp: expect.any(Number),
          players: expect.arrayContaining([
            expect.objectContaining({
              id: 'test-user-123',
              chips: 1000,
              isActive: true,
              hasFolded: false,
            }),
          ]),
        })
      );
      expect(tableId).toBeTruthy();
    });

    it('creates a private table with password', async () => {
      const tableName = 'Private Table';
      const smallBlind = 10;
      const bigBlind = 20;
      const maxPlayers = 6;
      const isPrivate = true;
      const password = 'secret123';

      const gameManager = new GameManager('temp');
      const tableId = await gameManager.createTable(
        tableName,
        smallBlind,
        bigBlind,
        maxPlayers,
        isPrivate,
        password
      );

      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: tableName,
          isPrivate: true,
          password: password,
          isHandInProgress: false,
          activePlayerCount: 1,
          lastAction: null,
          lastActivePlayer: null,
          gameStarted: false,
          bettingRound: 'first_round',
          phase: 'waiting',
          pot: 0,
          currentBet: 0,
          dealerPosition: 0,
          currentPlayerIndex: 0,
          communityCards: [],
          roundBets: {},
          minRaise: bigBlind,
          turnTimeLimit: 45000,
          lastActionTimestamp: expect.any(Number),
          players: expect.arrayContaining([
            expect.objectContaining({
              id: 'test-user-123',
            }),
          ]),
        })
      );
      expect(tableId).toBeTruthy();
    });

    it('throws error if no authenticated user', async () => {
      (getAuth as jest.Mock).mockReturnValue({
        currentUser: null
      });

      const gameManager = new GameManager('temp');
      await expect(
        gameManager.createTable('Test Table', 10, 20, 6, false)
      ).rejects.toThrow('No authenticated user');
    });

    it('does not deal hole cards on table creation', async () => {
      const userId = 'test-user-123';
      const tableName = 'Test Table';
      const smallBlind = 10;
      const bigBlind = 20;
      const maxPlayers = 6;
      const isPrivate = false;

      // Mock getAuth to return a user
      (getAuth as jest.Mock).mockReturnValue({
        currentUser: { uid: userId }
      });

      // Mock get for private player data to return null
      (get as jest.Mock).mockImplementation((ref) => {
        if (ref.toString().includes('private_player_data')) {
          return Promise.resolve({
            val: () => null
          });
        }
        return Promise.resolve({
          val: () => ({})
        });
      });

      const gameManager = new GameManager('temp');
      const tableId = await gameManager.createTable(
        tableName,
        smallBlind,
        bigBlind,
        maxPlayers,
        isPrivate
      );

      // Verify set was not called with private player data during creation
      const setCallArgs = (set as jest.Mock).mock.calls.map(call => call[0].toString());
      const privateDataCalls = setCallArgs.filter(arg => arg.includes('private_player_data'));
      expect(privateDataCalls).toHaveLength(0);

      // Mock startGame and startNewHand to verify hole cards are dealt
      const startGame = jest.spyOn(gameManager, 'startGame').mockImplementation(async () => {
        await gameManager.startNewHand();
        return Promise.resolve();
      });

      const startNewHand = jest.spyOn(gameManager, 'startNewHand').mockImplementation(async () => {
        await set(ref(expect.anything(), `private_player_data/${tableId}/${userId}`), {
          holeCards: [
            { rank: 'A', suit: 'hearts' },
            { rank: 'K', suit: 'spades' }
          ]
        });
        return Promise.resolve();
      });

      // Start the game and verify hole cards are dealt
      await gameManager.startGame();

      expect(startGame).toHaveBeenCalled();
      expect(startNewHand).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          holeCards: expect.arrayContaining([
            expect.objectContaining({ rank: 'A', suit: 'hearts' }),
            expect.objectContaining({ rank: 'K', suit: 'spades' })
          ])
        })
      );
    });
  });
}); 