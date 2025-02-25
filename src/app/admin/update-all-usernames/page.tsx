'use client';

import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function UpdateAllUsernamesPage(): JSX.Element {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        // Redirect to login if not authenticated
        router.push('/auth/signin');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleUpdateAllUsernames = async (): Promise<void> => {
    setIsLoading(true);
    setMessage('');

    try {
      setMessage('This is a placeholder. To implement this functionality, you need to:');
      setMessage((prev) => prev + '\n1. Create a Firebase Cloud Function using the template in src/utils/adminFunctions.ts');
      setMessage((prev) => prev + '\n2. Deploy the function to Firebase');
      setMessage((prev) => prev + '\n3. Update this page to call the function using the Firebase Functions SDK');
      
      // Uncomment and adapt this code once you've implemented the Cloud Function
      /*
      import { getFunctions, httpsCallable } from 'firebase/functions';
      
      const functions = getFunctions();
      const updateAllUsernamesFunction = httpsCallable(functions, 'updateAllUsernames');
      
      const result = await updateAllUsernamesFunction();
      setMessage(`Successfully updated ${result.data.updatedCount} users with default usernames`);
      */
    } catch (error) {
      setMessage(`Error updating usernames: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        <h1 className="text-2xl font-bold mb-6 text-center">Update All Usernames</h1>
        
        {message && (
          <div className={`mb-4 p-3 rounded whitespace-pre-line ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
            {message}
          </div>
        )}
        
        <div className="mb-6">
          <p className="text-gray-700 mb-4">
            This tool will update all existing users who don't have a username with a default username
            generated from their email address.
          </p>
          <p className="text-gray-700 mb-4">
            <strong>Note:</strong> This requires a Firebase Cloud Function to be implemented and deployed.
            See the template in <code>src/utils/adminFunctions.ts</code>.
          </p>
        </div>
        
        <button
          onClick={handleUpdateAllUsernames}
          disabled={isLoading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:bg-blue-300 mb-4"
        >
          {isLoading ? 'Processing...' : 'Update All Usernames'}
        </button>
        
        <div className="mt-6 text-center">
          <Link href="/admin/update-usernames" className="text-blue-500 hover:text-blue-600">
            Update your own username
          </Link>
        </div>
      </div>
    </div>
  );
} 