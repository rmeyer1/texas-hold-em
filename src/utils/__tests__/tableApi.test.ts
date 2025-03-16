import { NextRequest, NextResponse } from 'next/server';
import { GET } from '@/app/api/tables/[id]/route';
import { GameManager } from '@/services/gameManager';
import { DatabaseService } from '@/services/databaseService';
import { getAuth } from 'firebase-admin/auth';
import { getCachedData, setCachedData } from '@/utils/cache';
import { Card, Suit } from '@/types/poker';
import { rateLimitMiddleware } from '@/app/api/middleware';

// Mock Next.js Request and Response
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init) => {
    const headers = new Headers(init?.headers || {});
    return {
      headers,
      url,
      ...init
    };
  }),
  NextResponse: {
    json: jest.fn().mockImplementation((body, init) => ({
      json: async () => body,
      status: init?.status || 200,
      headers: new Map(),
      ok: init?.status ? init.status >= 200 && init.status < 300 : true
    }))
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
    authMiddleware: jest.fn().mockImplementation(async (req) => {
      const token = req.headers.get('Authorization');
      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      try {
        await getAuth().verifyIdToken(token.replace('Bearer ', ''));
        return null;
      } catch (error) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }),
    rateLimitMiddleware: jest.fn().mockResolvedValue(null)
  }));

jest.mock('firebase-admin/auth');
jest.mock('@/utils/cache', () => ({
  getCachedData: jest.fn(),
  setCachedData: jest.fn()
}));
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
    jest.clearAllMocks();
    (getCachedData as jest.Mock).mockReturnValue(null);

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
  });

  it('should return table data for valid ID', async () => {
    const headers = new Headers({
      'Authorization': `Bearer ${mockToken}`
    });

    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers
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

    const headers = new Headers({
        'Authorization': `Bearer ${mockToken}`
      });

    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers
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

    const headers = new Headers({
        'Authorization': `Bearer ${mockToken}`
      });
    const req = new NextRequest('http://localhost/api/tables/non-existent', {
     headers
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
    const headers = new Headers({
        'Authorization': `Bearer ${mockToken}`
      });

    const req = new NextRequest('http://localhost/api/tables/test-table', {
        headers
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

    const headers = new Headers({
        'Authorization': `Bearer ${mockToken}`
      });

    const req = new NextRequest('http://localhost/api/tables/test-table', {
        headers
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
        const headers = new Headers({
        'Authorization': `Bearer ${mockToken}`
      });
    const req = new NextRequest('http://localhost/api/tables/test-table', {
     headers
    });

    await GET(req, { params: { id: 'test-table' } });

    expect(setCachedData).toHaveBeenCalledTimes(1);
    expect(setCachedData).toHaveBeenCalledWith('table:test-table', mockTable);
  });

  it('should handle rate limiting', async () => {
    // Make multiple requests in quick succession
    const headers = new Headers({
      'Authorization': `Bearer ${mockToken}`
    });
    
    const req = new NextRequest('http://localhost/api/tables/test-table', {
      headers
    });

    // First request should succeed
    jest.mocked(rateLimitMiddleware).mockResolvedValueOnce(null);
    const response1 = await GET(req, { params: { id: 'test-table' } });
    expect(response1.status).toBe(200);

    // Second request should be rate limited
    jest.mocked(rateLimitMiddleware).mockResolvedValueOnce(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    );
    const response2 = await GET(req, { params: { id: 'test-table' } });
    const data2 = await response2.json();

    expect(response2.status).toBe(429);
    expect(data2).toEqual({ error: 'Too many requests' });
  });
}); 