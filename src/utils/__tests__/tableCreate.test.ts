// Mock NextResponse before any imports
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init) => ({
    url,
    headers: new Headers(init?.headers),
    json: () => Promise.resolve(init?.body ? JSON.parse(init.body) : {})
  })),
  NextResponse: {
    json: jest.fn().mockImplementation((body, options) => ({
      status: options?.status || 200,
      json: async () => body,
      ...body
    }))
  }
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/tables/create/route';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { authMiddleware } from '@/app/api/middleware';

jest.mock('@/app/api/middleware', () => ({
  authMiddleware: jest.fn().mockResolvedValue(null)
}));

describe('Table Creation API', () => {
  const mockSet = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn();
  const mockOrderByChild = jest.fn();
  const mockEqualTo = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database methods
    (getDatabase as jest.Mock).mockReturnValue({
      ref: jest.fn().mockReturnValue({
        set: mockSet,
        orderByChild: mockOrderByChild.mockReturnValue({
          equalTo: mockEqualTo.mockReturnValue({
            get: mockGet
          })
        })
      })
    });

    // Mock successful auth
    (getAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user' })
    });

    // Mock no existing tables
    mockGet.mockResolvedValue({
      exists: () => false,
      val: () => null
    });
  });

  const createRequest = (body: any) => {
    const mockToken = 'valid-token';

    const headers = new Headers({
      'Authorization': `Bearer ${mockToken}`,
      'Content-Type': 'application/json'
    });

    return new NextRequest('http://localhost/api/tables/create', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
  };

  it('should create a table with valid data', async () => {
    const validTable = {
      name: 'Test Table',
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      isPrivate: false
    };

    const response = await POST(createRequest(validTable));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.tableId).toBeDefined();
    expect(data.message).toBe('Table created successfully');
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('should require password for private tables', async () => {
    const invalidPrivateTable = {
      name: 'Private Table',
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      isPrivate: true
    };

    const response = await POST(createRequest(invalidPrivateTable));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation error');
    expect(data.details[0].path).toContain('password');
  });

  it('should validate big blind is double small blind', async () => {
    const invalidBlindsTable = {
      name: 'Invalid Blinds',
      smallBlind: 10,
      bigBlind: 25,
      maxPlayers: 6,
      isPrivate: false
    };

    const response = await POST(createRequest(invalidBlindsTable));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation error');
    expect(data.details[0].path).toContain('bigBlind');
  });

  it('should enforce table name length', async () => {
    const shortNameTable = {
      name: 'ab',
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      isPrivate: false
    };

    const response = await POST(createRequest(shortNameTable));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation error');
    expect(data.details[0].path).toContain('name');
  });

  it('should validate max players range', async () => {
    const invalidPlayersTable = {
      name: 'Too Many Players',
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 11,
      isPrivate: false
    };

    const response = await POST(createRequest(invalidPlayersTable));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation error');
    expect(data.details[0].path).toContain('maxPlayers');
  });

  it('should enforce password format for private tables', async () => {
    const invalidPasswordTable = {
      name: 'Private Table',
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      isPrivate: true,
      password: '12345' // Too short
    };

    const response = await POST(createRequest(invalidPasswordTable));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation error');
    expect(data.details[0].path).toContain('password');
  });

  it('should limit users to 10 active tables', async () => {
    // Mock user having 10 tables already
    mockGet.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        table1: {}, table2: {}, table3: {}, table4: {}, table5: {},
        table6: {}, table7: {}, table8: {}, table9: {}, table10: {}
      })
    });

    const validTable = {
      name: 'Test Table',
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      isPrivate: false
    };

    const response = await POST(createRequest(validTable));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('User has reached maximum limit of 10 active tables');
  });

  it('should handle authentication errors', async () => {
    (authMiddleware as jest.Mock).mockResolvedValueOnce({
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' })
    });

    const validTable = {
      name: 'Test Table',
      smallBlind: 10,
      bigBlind: 20,
      maxPlayers: 6,
      isPrivate: false
    };

    const response = await POST(createRequest(validTable));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
}); 