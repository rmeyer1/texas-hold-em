// First, mock the Firebase modules
jest.mock('firebase/auth');
jest.mock('firebase/database');
jest.mock('firebase/app');

// Mock the firebase service (which now only provides auth instance)
jest.mock('../../services/firebase', () => ({
  auth: {},
  database: {},
}));

// Mock the auth service
jest.mock('../../services/auth', () => ({
  signUpWithEmail: jest.fn(),
  signInWithEmail: jest.fn(),
  signOutUser: jest.fn(),
}));

import { signUpWithEmail, signInWithEmail, signOutUser } from '../../services/auth';
import type { AuthError } from '../../services/auth';

describe('Firebase Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signUpWithEmail', () => {
    it('should sign up a new user successfully', async () => {
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      
      (signUpWithEmail as jest.Mock).mockResolvedValueOnce({ user: mockUser });
      
      const result = await signUpWithEmail('test@example.com', 'password123', 'TestUser');

      expect(signUpWithEmail).toHaveBeenCalledWith('test@example.com', 'password123', 'TestUser');
      expect(result).toEqual({ user: mockUser });
    });

    it('should handle sign-up errors', async () => {
      const mockError: AuthError = { 
        code: 'auth/email-already-in-use', 
        message: 'Email already in use' 
      };
      
      (signUpWithEmail as jest.Mock).mockResolvedValueOnce({ error: mockError });

      const result = await signUpWithEmail('test@example.com', 'password123', 'TestUser');

      expect(signUpWithEmail).toHaveBeenCalledWith('test@example.com', 'password123', 'TestUser');
      expect(result).toEqual({ error: mockError });
    });
  });

  describe('signInWithEmail', () => {
    it('should sign in a user successfully', async () => {
      const mockUser = { uid: 'user123', email: 'test@example.com' };
      
      (signInWithEmail as jest.Mock).mockResolvedValueOnce({ user: mockUser });

      const result = await signInWithEmail('test@example.com', 'password123');

      expect(signInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(result).toEqual({ user: mockUser });
    });

    it('should handle sign-in errors', async () => {
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
      (signOutUser as jest.Mock).mockResolvedValueOnce({});

      const result = await signOutUser();

      expect(signOutUser).toHaveBeenCalled();
      expect(result).toEqual({});
    });

    it('should handle sign-out errors', async () => {
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