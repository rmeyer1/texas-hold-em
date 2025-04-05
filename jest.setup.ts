// Mock Firebase Admin first, before any imports
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn().mockReturnValue({}),
  cert: jest.fn().mockReturnValue({}),
  getApps: jest.fn().mockReturnValue([]),
  getApp: jest.fn().mockReturnValue({}),
}));

jest.mock('firebase-admin/database', () => ({
  getDatabase: jest.fn().mockReturnValue({
    ref: jest.fn().mockReturnValue({
      once: jest.fn().mockResolvedValue({
        val: jest.fn().mockReturnValue(null)
      })
    })
  })
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user' })
  })
}));

// Import jest-dom
import '@testing-library/jest-dom';
import { fetch, Headers, Request, Response } from 'cross-fetch';

// Mock environment variables
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC9QFi8Bd/3V8Nx\n5lPXjD4Vj0TvXsphV+Xjt0Qv6RDGjE5Eg5+oWwz9wOmXtxwUAcdrxBE3/2QKZ5YB\nxXS1Vcx+zBBWs1aGPR8S27xd8mXAmGFPqWYVOXQzPV1XQA/KZFzYAaqqFMcXz5Fq\nIPQ5B5xgHmoYWpxBTwF/IhLXgQMGh2hVhvxoGAp5D2nk9KQyQxm7TJ3lh0oPFIvv\n-----END PRIVATE KEY-----\n';
process.env.FIREBASE_DATABASE_URL = 'https://test-project.firebaseio.com';

// Add fetch and related APIs to global scope
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;

// Add TextEncoder/TextDecoder to global scope if not present
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Learn more: https://jestjs.io/docs/configuration#setupfilesafterenv-array

// Add custom matchers for Jest
expect.extend({
  toBeInTheDocument() {
    return {
      pass: true,
      message: () => 'Element is in the document',
    };
  },
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock Firebase Database with flexible mocks
const mockRef = { key: 'test-table-123' };
const mockDatabase = {
  ref: jest.fn().mockReturnValue(mockRef),
};

jest.mock('./src/services/firebase', () => ({
  database: mockDatabase,
}));

jest.mock('firebase/database', () => {
  const actual = jest.requireActual('firebase/database');
  return {
    ...actual,
    ref: jest.fn().mockReturnValue(mockRef),
    set: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
    runTransaction: jest.fn(),
    onValue: jest.fn(),
    off: jest.fn(),
  };
});

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockApp = {
    auth: jest.fn(),
    database: jest.fn().mockReturnValue({
      ref: jest.fn().mockReturnValue({
        once: jest.fn().mockResolvedValue({
          val: jest.fn().mockReturnValue(null)
        })
      })
    }),
  };

  return {
    initializeApp: jest.fn().mockReturnValue(mockApp),
    credential: {
      cert: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue({ access_token: 'mock-token' })
      })
    },
    getApps: jest.fn().mockReturnValue([]),
    getApp: jest.fn().mockReturnValue(mockApp),
  };
});

// // Mock Firebase Admin Auth
// jest.mock('firebase-admin/auth', () => ({
//   getAuth: jest.fn().mockReturnValue({
//     verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user' }),
//   }),
// }));

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Mock middleware
jest.mock('@/app/api/middleware', () => ({
  authMiddleware: jest.fn().mockResolvedValue(null),
  rateLimitMiddleware: jest.fn().mockResolvedValue(null)
}));

// Mock cache utils
jest.mock('@/utils/cache', () => ({
  getCachedData: jest.fn(),
  setCachedData: jest.fn(),
  deleteCachedData: jest.fn()
}));

// Mock GameManager
jest.mock('@/services/gameManager', () => {
  const mockGameManagerInstance = {
    getTableData: jest.fn(),
    getPrivatePlayerData: jest.fn(),
    handlePlayerAction: jest.fn()
  };
  return {
    GameManager: jest.fn().mockImplementation(() => mockGameManagerInstance),
    getTableData: jest.fn()
  };
});

// Mock database service
jest.mock('@/services/databaseService', () => {
  class MockDatabaseService {
    getTable = jest.fn();
    updateTable = jest.fn();
    forceUpdateTable = jest.fn();
    createTable = jest.fn().mockResolvedValue('test-table-123');
    getCurrentUserId = jest.fn();
    getTableRef = jest.fn();
    getPrivatePlayerRef = jest.fn();
    sanitizeData = jest.fn(data => data);
    setPlayerCards = jest.fn();
    getPlayerCards = jest.fn();
    clearPlayerCards = jest.fn();
    subscribeToTable = jest.fn();
    addPlayer = jest.fn();
    updateTableTransaction = jest.fn();
    getPrivatePlayerData = jest.fn();
    static getTableData = jest.fn();
  }
  return { DatabaseService: MockDatabaseService };
});

// Mock logger
jest.mock('@/utils/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock next/server for NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      ok: true,
      status: init?.status || 200,
      json: async () => body,
      text: async () => JSON.stringify(body), // Add text method for consistency
      headers: new Headers(init?.headers),
    })),
  },
  NextRequest: jest.fn(), // Mock NextRequest as well
})); 

