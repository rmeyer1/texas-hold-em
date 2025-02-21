import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  // Replace these with your Firebase config values
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

export type AuthError = {
  code: string;
  message: string;
};

export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<{ user: User } | { error: AuthError }> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
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