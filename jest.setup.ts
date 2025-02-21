// Learn more: https://jestjs.io/docs/configuration#setupfilesafterenv-array

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

// Mock Firebase Database
const mockRef = { key: 'test-table-123' };
const mockDatabase = {
  ref: jest.fn().mockReturnValue(mockRef),
};

jest.mock('./src/services/firebase', () => ({
  database: mockDatabase,
}));

jest.mock('firebase/database', () => ({
  ref: jest.fn().mockReturnValue(mockRef),
  set: jest.fn(),
  update: jest.fn(),
  get: jest.fn(),
  runTransaction: jest.fn(),
  onValue: jest.fn(),
  off: jest.fn(),
}));

// Reset all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
}); 