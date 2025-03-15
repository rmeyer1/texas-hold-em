import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export type AuthError = {
  code: string;
  message: string;
};

export const signUpWithEmail = async (
  email: string,
  password: string,
  username: string
): Promise<{ user: User } | { error: AuthError }> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Update the user's display name with the provided username
    await updateProfile(userCredential.user, {
      displayName: username,
    });
    
    return { user: userCredential.user };
  } catch (error) {
    return { error: error as AuthError };
  }
};

export const signInWithEmail = async (
  email: string,
  password: string
): Promise<{ user: User } | { error: AuthError }> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user };
  } catch (error) {
    return { error: error as AuthError };
  }
};

export const signOutUser = async (): Promise<{ error?: AuthError }> => {
  try {
    await signOut(auth);
    return {};
  } catch (error) {
    return { error: error as AuthError };
  }
}; 