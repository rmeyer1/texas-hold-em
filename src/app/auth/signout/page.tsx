'use client';

import React, { useEffect, useState } from 'react';
import { signOutUser } from '@/services/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignOutPage(): React.ReactElement {
  const [message, setMessage] = useState('Signing out...');
  const router = useRouter();

  useEffect(() => {
    const performSignOut = async (): Promise<void> => {
      try {
        await signOutUser();
        setMessage('You have been signed out successfully.');
        
        // Redirect to home page after a short delay
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } catch (error) {
        setMessage(`Error signing out: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    performSignOut();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign Out</h1>
        
        <div className="mb-6 p-3 bg-blue-100 text-blue-700 rounded text-center">
          {message}
        </div>
        
        <div className="text-center">
          <Link href="/" className="text-blue-500 hover:text-blue-600">
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
} 