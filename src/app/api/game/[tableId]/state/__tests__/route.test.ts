import { GET } from '../route'; // Adjust the path based on your file structure
import { NextRequest } from 'next/server';
import { getCachedData, setCachedData } from '@/utils/cache';
import { authMiddleware } from '@/app/api/middleware';
import { GameManager } from '@/services/gameManager';
import { getAuth } from 'firebase-admin/auth';
import type { Table, PrivatePlayerData } from '@/types/poker';

// Mock the necessary modules (jest.setup.ts should handle most of these)
// Re-importing here to ensure TS knows about the mocked types
const mockAuthMiddleware = authMiddleware as jest.Mock;
const mockGetAuth = getAuth as jest.Mock;
const mockVerifyIdToken = jest.fn();

const mockGetCachedData = getCachedData as jest.Mock;
const mockSetCachedData = setCachedData as jest.Mock;

// Mock GameManager implementation
const mockGetTableData = jest.fn();
const mockGetPrivatePlayerData = jest.fn();

// Static method mock
// Instance method mocks (via the constructor mock in jest.setup.ts)
((GameManager as unknown)as jest.Mock).mockImplementation(() => ({
    getPrivatePlayerData: mockGetPrivatePlayerData
}));

// Mock dependencies
jest.mock('@/services/gameManager');
jest.mock('@/services/databaseService');

describe('GET /api/game/[tableId]/state', () => {
    const tableId = 'test-table-123';
    const userId = 'test-user-id';
    const mockRequest = (token: string | null = 'valid-token') => {
        const headers = new Headers();
        if (token) {
            headers.append('Authorization', `Bearer ${token}`);
        }
        return new NextRequest(`http://localhost/api/game/${tableId}/state`, {
            method: 'GET',
            headers,
        });
    };

    const mockTableData: Partial<Table> = {
        id: tableId,
        name: 'Test Table',
        players: [{ id: userId, name: 'Test User', chips: 1000, isActive: true, hasFolded: false, position: 0 }],
        pot: 100,
        phase: 'preflop',
    };

    const mockPrivateData: PrivatePlayerData = {
        holeCards: [{ suit: 'hearts', rank: 'A' }, { suit: 'diamonds', rank: 'A' }],
        lastUpdated: Date.now()
    };

    beforeEach(() => {
        // Reset mocks before each test defined in this file
        jest.clearAllMocks();

        // Configure mocks inside beforeEach
        mockAuthMiddleware.mockResolvedValue(null); // Authenticated by default
        mockGetAuth.mockReturnValue({ verifyIdToken: mockVerifyIdToken });
        mockVerifyIdToken.mockResolvedValue({ uid: userId });

        mockGetCachedData.mockReturnValue(null); // Cache miss by default
        mockGetTableData.mockResolvedValue(mockTableData); // Table exists by default
        mockGetPrivatePlayerData.mockResolvedValue(mockPrivateData); // Private data exists by default
    });

    it('should return 401 if authentication fails', async () => {
        const unauthorizedResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        mockAuthMiddleware.mockResolvedValueOnce(unauthorizedResponse);

        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(mockAuthMiddleware).toHaveBeenCalledWith(req);
        expect(response.status).toBe(401);
        expect(body.error).toBe('Unauthorized');
        expect(mockGetTableData).not.toHaveBeenCalled();
        expect(mockGetPrivatePlayerData).not.toHaveBeenCalled();
        expect(mockGetCachedData).not.toHaveBeenCalled();
    });

    it('should fetch data, set cache, and return combined data on cache miss', async () => {
        mockGetCachedData.mockReturnValueOnce(null); // Explicit cache miss

        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(mockAuthMiddleware).toHaveBeenCalledTimes(1);
        expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
        expect(mockGetCachedData).toHaveBeenCalledWith(`game:${tableId}`);
        expect(mockGetTableData).toHaveBeenCalledWith(tableId);
        expect(mockGetPrivatePlayerData).toHaveBeenCalledWith(tableId, userId);
        expect(mockSetCachedData).toHaveBeenCalledWith(`game:${tableId}`, mockTableData);
        expect(response.status).toBe(200);
        expect(body).toEqual(expect.objectContaining({
            ...mockTableData,
            privateData: mockPrivateData,
            timestamp: expect.any(Number),
        }));
        expect(body.fromCache).toBeUndefined();
    });

    it('should use cached public data but fetch fresh private data on cache hit', async () => {
        const cachedPublicData = { ...mockTableData, name: 'Cached Name' };
        const cacheEntry = { data: cachedPublicData, timestamp: Date.now() - 1000 };
        mockGetCachedData.mockReturnValueOnce(cacheEntry); // Cache hit

        const freshPrivateData = { ...mockPrivateData, lastUpdated: Date.now() };
        mockGetPrivatePlayerData.mockResolvedValueOnce(freshPrivateData); // Simulate fresh data

        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(mockGetCachedData).toHaveBeenCalledWith(`game:${tableId}`);
        expect(mockGetTableData).not.toHaveBeenCalled(); // Should not fetch public data
        expect(mockSetCachedData).not.toHaveBeenCalled(); // Should not set cache again
        expect(mockGetPrivatePlayerData).toHaveBeenCalledWith(tableId, userId); // Still fetch private data
        expect(response.status).toBe(200);
        expect(body).toEqual(expect.objectContaining({
            ...cachedPublicData,
            privateData: freshPrivateData,
            fromCache: true,
        }));
        expect(body.timestamp).toBeUndefined(); // No new timestamp from cache
    });

    it('should return 404 if table is not found on cache miss', async () => {
        mockGetCachedData.mockReturnValueOnce(null); // Cache miss
        mockGetTableData.mockResolvedValueOnce(null); // Table not found

        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(mockGetTableData).toHaveBeenCalledWith(tableId);
        expect(response.status).toBe(404);
        expect(body.error).toBe('Table not found');
        expect(mockGetPrivatePlayerData).not.toHaveBeenCalled();
        expect(mockSetCachedData).not.toHaveBeenCalled();
    });

    it('should return 500 if verifying token fails unexpectedly', async () => {
        mockVerifyIdToken.mockRejectedValueOnce(new Error('Token verification failed'));
        
        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toContain('Internal server error during auth');
    });

    it('should return 500 if fetching public table data fails', async () => {
        mockGetCachedData.mockReturnValueOnce(null); // Cache miss
        mockGetTableData.mockRejectedValueOnce(new Error('DB error fetching table'));

        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe('Internal server error');
        expect(mockGetPrivatePlayerData).not.toHaveBeenCalled();
        expect(mockSetCachedData).not.toHaveBeenCalled();
    });

    it('should return 500 if fetching private data fails on cache miss', async () => {
        mockGetCachedData.mockReturnValueOnce(null); // Cache miss
        mockGetPrivatePlayerData.mockRejectedValueOnce(new Error('DB error fetching private data'));

        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toBe('Internal server error');
        expect(mockSetCachedData).not.toHaveBeenCalled(); // Should not cache if private fetch fails
    });

     it('should return cached public data with null private data if fetching private data fails on cache hit', async () => {
        const cachedPublicData = { ...mockTableData, name: 'Cached Hit Error Name' };
        const cacheEntry = { data: cachedPublicData, timestamp: Date.now() - 1000 };
        mockGetCachedData.mockReturnValueOnce(cacheEntry); // Cache hit
        mockGetPrivatePlayerData.mockRejectedValueOnce(new Error('DB error fetching private data on hit')); // Error on private fetch

        const req = mockRequest();
        const response = await GET(req, { params: { tableId } });
        const body = await response.json();

        expect(mockGetCachedData).toHaveBeenCalledWith(`game:${tableId}`);
        expect(mockGetTableData).not.toHaveBeenCalled();
        expect(mockSetCachedData).not.toHaveBeenCalled();
        expect(mockGetPrivatePlayerData).toHaveBeenCalledWith(tableId, userId);
        expect(response.status).toBe(200);
        expect(body).toEqual({
            ...cachedPublicData,
            privateData: null, // Should be null due to error
            fromCache: true,
        });
    });
}); 