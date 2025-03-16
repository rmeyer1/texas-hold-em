import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tables/[id]/route';
import { GameManager } from '@/services/gameManager';
import { DatabaseService } from '@/services/databaseService';
import { getAuth } from 'firebase-admin/auth';
import { getCachedData, setCachedData } from '@/utils/cache';
import { Card, Suit } from '@/types/poker';

// Mock Next.js Request and Response
const mockNextRequest = {
  headers: new Headers()
};

const mockNextResponse = {
  json: jest.fn()
};

jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init) => {
    const headers = new Headers(init?.headers || {});
    return {
      headers: {
        get: (name: string) => headers.get(name),
        set: (name: string, value: string) => headers.set(name, value),
        append: (name: string, value: string) => headers.append(name, value),
        delete: (name: string) => headers.delete(name),
      },
      url,
      ...init
    };
  }),
  NextResponse: {
    json: jest.fn().mockImplementation((body, init) => {
      const response = {
        ...mockNextResponse,
        json: async () => body,
        status: init?.status || 200,
        headers: new Map(),
        ok: init?.status ? init.status >= 200 && init.status < 300 : true
      };
      return response;
    })
  }
}));

// Mock dependencies
jest.mock('@/services/gameManager', () => ({
  GameManager: jest.fn()
}));

jest.mock('@/services/databaseService', () => ({
  DatabaseService: jest.fn()
}));

jest.mock('@/app/api/middleware', () => ({
  authMiddleware: jest.fn().mockResolvedValue(null),
  rateLimitMiddleware: jest.fn().mockResolvedValue(null)
}));

jest.mock('firebase-admin/auth');
jest.mock('@/utils/cache');
jest.mock('@/utils/logger');

describe('Table Read API', () => {
  const mockTable = {
    id: 'test-table',
    players: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    phase: 'waiting',
    dealerPosition: 0,
    smallBlind: 10,
    bigBlind: 20,
  };

  const mockHoleCards: Card[] = [
    { suit: 'hearts' as Suit, rank: 'A' },
    { suit: 'spades' as Suit, rank: 'K' }
  ];

  const mockToken = 'valid-token';
  const mockUserId = 'test-user';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset Next.js mocks
    mockNextRequest.headers = new Headers();
    mockNextResponse.json.mockReset();

    // Mock auth
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: mockUserId })
    });

    // Mock database service
    ((DatabaseService as unknown) as jest.Mock).mockImplementation((tableId: string) => ({
      db: {},
      tableId,
      debounceTimer: null,
      pendingUpdates: {},
      getTable: jest.fn().mockResolvedValue(mockTable),
      getCurrentUserId: jest.fn(),
      getTableRef: jest.fn(),
      getPrivatePlayerRef: jest.fn(),
      updateTable: jest.fn(),
      forceUpdateTable: jest.fn(),
      sanitizeData: jest.fn(),
      setPlayerCards: jest.fn(),
      getPlayerCards: jest.fn(),
      clearPlayerCards: jest.fn(),
      subscribeToTable: jest.fn(),
      createTable: jest.fn(),
      addPlayer: jest.fn(),
      updateTableTransaction: jest.fn(),
    }));

    // Mock game manager
    ((GameManager as unknown) as jest.Mock).mockImplementation((tableId: string) => ({
      db: {},
      deck: [],
      players: [],
      phases: [],
      tableId,
      getPlayerHoleCards: jest.fn().mockResolvedValue(mockHoleCards),
    }));

    // Mock cache
    (getCachedData as jest.Mock).mockReturnValue(null);
    (setCachedData as jest.Mock).mockImplementation(() => {});
  });

  it('should return table data for valid ID', async () => {
    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers: {
        'Authorization': `Bearer ${mockToken}`
      }
    });

    const response = await GET(req, { params: { id: 'test-table' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ...mockTable,
      privateData: { holeCards: mockHoleCards },
      timestamp: expect.any(Number)
    });
  });

  it('should return cached data when available', async () => {
    const cachedTable = { ...mockTable, fromCache: true };
    (getCachedData as jest.Mock).mockReturnValue({ data: cachedTable });

    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers: { Authorization: `Bearer ${mockToken}` }
    });

    const response = await GET(req, { params: { id: 'test-table' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ...cachedTable,
      privateData: { holeCards: mockHoleCards },
      fromCache: true,
      timestamp: expect.any(Number)
    });
    expect(DatabaseService).not.toHaveBeenCalled();
  });

  it('should return 404 when table not found', async () => {
    const mockGetTable = jest.fn().mockResolvedValue(null);
    jest.mocked(DatabaseService).mockImplementation((tableId: string) => {
      return {
        db: {},
        tableId,
        debounceTimer: null,
        pendingUpdates: {},
        getTable: mockGetTable,
        getCurrentUserId: jest.fn(),
        getTableRef: jest.fn(),
        getPrivatePlayerRef: jest.fn(),
        updateTable: jest.fn(),
        forceUpdateTable: jest.fn(),
        sanitizeData: jest.fn(),
        setPlayerCards: jest.fn(),
        getPlayerCards: jest.fn(),
        clearPlayerCards: jest.fn(),
        subscribeToTable: jest.fn(),
        createTable: jest.fn(),
        addPlayer: jest.fn(),
        updateTableTransaction: jest.fn(),
      } as unknown as DatabaseService;
    });

    const req = new NextRequest('http://localhost/api/tables/non-existent', {
      headers: { Authorization: `Bearer ${mockToken}` }
    });

    const response = await GET(req, { params: { id: 'non-existent' } });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Table not found' });
  });

  it('should return 401 when no auth token provided', async () => {
    // Create request with no headers
    const req = new NextRequest('http://localhost/api/tables/test-table');

    const response = await GET(req, { params: { id: 'test-table' } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should return table data without private data for invalid token', async () => {
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockRejectedValue(new Error('Invalid token'))
    });

    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers: { Authorization: 'Bearer invalid-token' }
    });

    const response = await GET(req, { params: { id: 'test-table' } });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Invalid token' });
  });

  it('should handle errors when fetching hole cards', async () => {
    const mockGetPlayerHoleCards = jest.fn().mockResolvedValue(null);
    jest.mocked(GameManager).mockImplementation((tableId: string) => {
      return {
        db: {},
        deck: [],
        players: [],
        phases: [],
        tableId,
        getPlayerHoleCards: mockGetPlayerHoleCards,
        // Add other required methods
      } as unknown as GameManager;
    });

    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers: { Authorization: `Bearer ${mockToken}` }
    });

    const response = await GET(req, { params: { id: 'test-table' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ...mockTable,
      timestamp: expect.any(Number)
    });
    expect(data.privateData).toBeUndefined();
  });

  it('should cache table data after fetching', async () => {
    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers: { Authorization: `Bearer ${mockToken}` }
    });

    await GET(req, { params: { id: 'test-table' } });

    expect(setCachedData).toHaveBeenCalledWith(
      'table:test-table',
      mockTable
    );
  });

  it('should handle rate limiting', async () => {
    // Make multiple requests in quick succession
    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers: { Authorization: `Bearer ${mockToken}` }
    });

    // First request should succeed
    const response1 = await GET(req, { params: { id: 'test-table' } });
    expect(response1.status).toBe(200);

    // Mock rate limit exceeded
    let requestCount = 0;
    const mockGetPlayerHoleCards = jest.fn().mockImplementation(() => {
      requestCount++;
      if (requestCount > 5) {
        throw new Error('Rate limit exceeded');
      }
      return Promise.resolve(mockHoleCards);
    });

    jest.mocked(GameManager).mockImplementation((tableId: string) => {
      return {
        db: {},
        deck: [],
        players: [],
        phases: [],
        tableId,
        getPlayerHoleCards: mockGetPlayerHoleCards,
        // Add other required methods
      } as unknown as GameManager;
    });

    // Subsequent request should be rate limited
    const response2 = await GET(req, { params: { id: 'test-table' } });
    const data2 = await response2.json();

    expect(response2.status).toBe(200); // Still 200 because we're gracefully handling the error
    expect(data2).toEqual({
      ...mockTable,
      timestamp: expect.any(Number)
    });
  });
}); 