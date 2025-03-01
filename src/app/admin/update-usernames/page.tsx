'use client';

import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { updateUserDisplayName } from '@/utils/updateUsernames';
import { useRouter } from 'next/navigation';

export default function UpdateUsernamesPage(): React.ReactElement {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
        // Pre-fill with current display name if it exists
        if (user.displayName) {
          setUsername(user.displayName);
        }
      } else {
        // Redirect to login if not authenticated
        router.push('/auth/signin');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        setMessage('You must be logged in to update your username');
        setIsLoading(false);
        return;
      }

      if (!username.trim()) {
        setMessage('Username cannot be empty');
        setIsLoading(false);
        return;
      }

      // Store the original console.log function
      const originalConsoleLog = console.log; 
      let tableUpdateInfo = '';
      
      // Override console.log to capture table update information
      console.log = (...args) => {
        originalConsoleLog(...args);
        const message = args.join(' ');
        if (message.includes('Successfully updated player name')) {
          tableUpdateInfo = message;
        }
      };
      
      await updateUserDisplayName(user, username);
      
      // Restore the original console.log function
      console.log = originalConsoleLog;
      
      let successMessage = `Username successfully updated to "${username}"`;
      if (tableUpdateInfo) {
        successMessage += `\n\n${tableUpdateInfo}`;
      } else {
        successMessage += '\n\nNo existing tables needed to be updated.';
      }
      
      setMessage(successMessage);
      
      // Force a refresh of the page after a short delay to ensure the UI updates
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      setMessage(`Error updating username: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Update Username</h1>
        
        {message && (
          <div className={`mb-4 p-3 rounded whitespace-pre-line ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-gray-700 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            {isLoading ? 'Updating...' : 'Update Username'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            This page allows you to update your username which will be displayed at the poker table.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            After updating, your username will be automatically updated in all tables where you are a player.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            <strong>Note:</strong> The page will refresh automatically after updating your username.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            <strong>Troubleshooting:</strong> If you don't see your updated username at the poker table, try refreshing the page or signing out and back in.
          </p>
        </div>
      </div>
    </div>
  );
} 