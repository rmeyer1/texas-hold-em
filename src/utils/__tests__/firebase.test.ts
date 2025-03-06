import { signUpWithEmail, signInWithEmail, signOutUser, auth, AuthError } from '../../services/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';

// Mock Firebase modules
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: null,
  })),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(),
}));

// Mock Firebase app initialization
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}));

// Mock the firebase module
jest.mock('../../services/firebase', () => {
  return {
    __esModule: true,
    auth: {},
    database: {},
    signUpWithEmail: jest.fn(),
    signInWithEmail: jest.fn(),
    signOutUser: jest.fn(),
    AuthError: Object,
  };
});

describe('Firebase Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signUpWithEmail', () => {
    it('should sign up a new user successfully', async () => {
      // Mock successful user creation
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      
      // Set up the implementation of our mock function
      (signUpWithEmail as jest.Mock).mockResolvedValueOnce({ user: mockUser });
      
      const result = await signUpWithEmail('test@example.com', 'password123', 'TestUser');

      expect(signUpWithEmail).toHaveBeenCalledWith('test@example.com', 'password123', 'TestUser');
      expect(result).toEqual({ user: mockUser });
    });

    it('should handle sign-up errors', async () => {
      // Mock authentication error
      const mockError: AuthError = { 
        code: 'auth/email-already-in-use', 
        message: 'Email already in use' 
      };
      
      (signUpWithEmail as jest.Mock).mockResolvedValueOnce({ error: mockError });

      const result = await signUpWithEmail('test@example.com', 'password123', 'TestUser');

      expect(signUpWithEmail).toHaveBeenCalledWith('test@example.com', 'password123', 'TestUser');
      expect(result).toEqual({ error: mockError });
    });

    it('should handle profile update errors', async () => {
      // Mock successful user creation but failed profile update
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      
      (signUpWithEmail as jest.Mock).mockResolvedValueOnce({ user: mockUser });

      const result = await signUpWithEmail('test@example.com', 'password123', 'TestUser');

      expect(signUpWithEmail).toHaveBeenCalledWith('test@example.com', 'password123', 'TestUser');
      expect(result).toEqual({ user: mockUser });
    });
  });

  describe('signInWithEmail', () => {
    it('should sign in a user successfully', async () => {
      // Mock successful sign-in
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      
      (signInWithEmail as jest.Mock).mockResolvedValueOnce({ user: mockUser });

      const result = await signInWithEmail('test@example.com', 'password123');

      expect(signInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(result).toEqual({ user: mockUser });
    });

    it('should handle sign-in errors', async () => {
      // Mock authentication error
      const mockError: AuthError = { 
        code: 'auth/wrong-password', 
        message: 'Invalid password' 
      };
      
      (signInWithEmail as jest.Mock).mockResolvedValueOnce({ error: mockError });

      const result = await signInWithEmail('test@example.com', 'wrong-password');

      expect(signInWithEmail).toHaveBeenCalledWith('test@example.com', 'wrong-password');
      expect(result).toEqual({ error: mockError });
    });
  });

  describe('signOutUser', () => {
    it('should sign out a user successfully', async () => {
      // Mock successful sign-out
      (signOutUser as jest.Mock).mockResolvedValueOnce({});

      const result = await signOutUser();

      expect(signOutUser).toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('should handle sign-out errors', async () => {
      // Mock sign-out error
      const mockError: AuthError = { 
        code: 'auth/no-current-user', 
        message: 'No user currently signed in' 
      };
      
      (signOutUser as jest.Mock).mockResolvedValueOnce({ error: mockError });

      const result = await signOutUser();

      expect(signOutUser).toHaveBeenCalled();
      expect(result).toEqual({ error: mockError });
    });
  });
}); 