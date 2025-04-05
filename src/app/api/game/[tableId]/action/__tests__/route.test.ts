import { POST } from '../route'; // Adjust path as needed
import { NextRequest } from 'next/server';
import { deleteCachedData } from '@/utils/cache';
import { authMiddleware } from '@/app/api/middleware';
import { getAuth } from 'firebase-admin/auth';
import type { PlayerAction } from '@/types/poker';
import { GameManager } from '@/services/gameManager';

// Mock necessary modules
jest.mock('firebase-admin/auth');
jest.mock('@/app/api/middleware');
jest.mock('@/utils/cache');

const mockAuthMiddleware = authMiddleware as jest.Mock;
const mockDeleteCachedData = deleteCachedData as jest.Mock;

// Mock GameManager implementation
const mockHandlePlayerAction = jest.fn();

// Instance method mocks (via the constructor mock in jest.setup.ts)
((GameManager as unknown)as jest.Mock).mockImplementation(() => ({
    handlePlayerAction: mockHandlePlayerAction
}));

describe('POST /api/game/[tableId]/action', () => {
    const tableId = 'test-table-456';
    const userId = 'test-user-id';
    const cacheKey = `game:${tableId}`;

    // Helper to create mock requests
    const mockRequest = (body: any, token: string | null = 'valid-token') => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (token) {
            headers.append('Authorization', `Bearer ${token}`);
        }
        return new NextRequest(`http://localhost/api/game/${tableId}/action`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
    };

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        
        // Setup auth mocking similar to tableApi.test.ts
        mockAuthMiddleware.mockResolvedValue(null); // Authenticated
        (getAuth as jest.Mock).mockReturnValue({
            verifyIdToken: jest.fn().mockResolvedValue({ uid: userId })
        });
        mockHandlePlayerAction.mockResolvedValue(undefined); // Success by default
        mockDeleteCachedData.mockResolvedValue(undefined);
    });

    it('should return 401 if authentication fails', async () => {
        const unauthorizedResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        mockAuthMiddleware.mockResolvedValueOnce(unauthorizedResponse);

        const req = mockRequest({ action: 'fold' });
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(mockAuthMiddleware).toHaveBeenCalledWith(req);
        expect(response.status).toBe(401);
        expect(body.error).toBe('Unauthorized');
        expect(mockHandlePlayerAction).not.toHaveBeenCalled();
        expect(mockDeleteCachedData).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid request body (zod validation)', async () => {
        const invalidBody = { action: 'invalid-action' }; // Action not in enum
        const req = mockRequest(invalidBody);
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Invalid request body');
        expect(body.details).toBeDefined();
        expect(mockHandlePlayerAction).not.toHaveBeenCalled();
        expect(mockDeleteCachedData).not.toHaveBeenCalled();
    });

    it('should return 400 if amount is missing for bet action', async () => {
        const invalidBody = { action: 'bet' }; // Missing amount
        const req = mockRequest(invalidBody);
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Invalid request body');
        expect(body.details.formErrors[0]).toContain('Amount is required'); // Check refinement message
        expect(mockHandlePlayerAction).not.toHaveBeenCalled();
    });

    it('should return 400 if amount is missing for raise action', async () => {
        const invalidBody = { action: 'raise' }; // Missing amount
        const req = mockRequest(invalidBody);
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Invalid request body');
        expect(body.details.formErrors[0]).toContain('Amount is required'); // Check refinement message
        expect(mockHandlePlayerAction).not.toHaveBeenCalled();
    });
    
     it('should return 400 if request body is not valid JSON', async () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('Authorization', `Bearer valid-token`);
        const req = new NextRequest(`http://localhost/api/game/${tableId}/action`, {
            method: 'POST',
            headers,
            body: '{\"action\": \"fold\",,}', // Invalid JSON
        });

        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toBe('Failed to parse request body');
        expect(mockHandlePlayerAction).not.toHaveBeenCalled();
        expect(mockDeleteCachedData).not.toHaveBeenCalled();
    });

    test.each([
        [{ action: 'fold' as PlayerAction }],
        [{ action: 'call' as PlayerAction }],
        [{ action: 'bet' as PlayerAction, amount: 100 }],
        [{ action: 'raise' as PlayerAction, amount: 200 }]
    ])('should successfully handle %o action and invalidate cache', async (actionBody) => {
        const req = mockRequest(actionBody);
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(mockAuthMiddleware).toHaveBeenCalledTimes(1);
        expect(mockHandlePlayerAction).toHaveBeenCalledWith(userId, actionBody.action, (actionBody as { amount?: number }).amount);        expect(mockDeleteCachedData).toHaveBeenCalledWith(cacheKey);
        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it('should return 409 if GameManager throws "Not player\'s turn" error', async () => {
        mockHandlePlayerAction.mockRejectedValueOnce(new Error("Not player's turn to act"));
        const req = mockRequest({ action: 'call' });
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(409);
        expect(body.error).toContain("Not player's turn");
        expect(mockDeleteCachedData).not.toHaveBeenCalled();
    });

    it('should return 404 if GameManager throws "Table not found" error', async () => {
        mockHandlePlayerAction.mockRejectedValueOnce(new Error('Table not found'));
        const req = mockRequest({ action: 'fold' });
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body.error).toContain('Table not found');
        expect(mockDeleteCachedData).not.toHaveBeenCalled();
    });
    
     it('should return 400 if GameManager throws an amount-related error', async () => {
        mockHandlePlayerAction.mockRejectedValueOnce(new Error('Raise amount too small'));
        const req = mockRequest({ action: 'raise', amount: 5 });
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain('Raise amount too small');
        expect(mockDeleteCachedData).not.toHaveBeenCalled();
    });

    it('should return 500 for unexpected errors from GameManager', async () => {
        mockHandlePlayerAction.mockRejectedValueOnce(new Error('Unexpected database error'));
        const req = mockRequest({ action: 'call' });
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toContain('Unexpected database error');
        expect(mockDeleteCachedData).not.toHaveBeenCalled();
    });

    it('should return 500 if verifying token fails unexpectedly', async () => {
        mockHandlePlayerAction.mockRejectedValueOnce(new Error('Token verification failed'));
        
        const req = mockRequest({ action: 'fold' });
        const response = await POST(req, { params: { tableId } });
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.error).toContain('Internal server error during auth');
        expect(mockHandlePlayerAction).not.toHaveBeenCalled();
    });
}); 