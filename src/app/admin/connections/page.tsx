'use client';

import React, { useState } from 'react';
import { ConnectionManagerUI } from '@/components/utils/ConnectionManager';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function ConnectionsPage(): React.ReactElement {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showApiDocs, setShowApiDocs] = useState(false);

  // Check if user is an admin (you may need to adjust this based on your auth system)
  const isAdmin = user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  // Redirect non-admin users
  if (!loading && !isAdmin) {
    router.push('/');
    return <div>Unauthorized</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Database Connection Management</h1>
      
      <div className="mb-6">
        <p className="text-gray-600 mb-2">
          This page allows you to manage database connections. You can clear all connections at once
          or view active connections.
        </p>
        <p className="text-gray-600">
          Connections are automatically disconnected after 20 minutes of inactivity to reduce costs.
        </p>
      </div>
      
      <ConnectionManagerUI className="mt-6" />
      
      <div className="mt-8">
        <button
          onClick={() => setShowApiDocs(!showApiDocs)}
          className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
        >
          <svg 
            className={`w-5 h-5 mr-2 transition-transform ${showApiDocs ? 'rotate-90' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
          </svg>
          API Documentation
        </button>
        
        {showApiDocs && (
          <div className="mt-4 p-6 bg-gray-100 rounded-lg border border-gray-200">
            <h2 className="text-xl font-semibold mb-4">Programmatic Connection Management</h2>
            
            <p className="mb-4">
              You can clear all database connections programmatically using the API endpoint below.
              This is useful for scheduled tasks or automated maintenance.
            </p>
            
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Clear All Connections</h3>
              <div className="bg-gray-800 text-white p-4 rounded-md overflow-x-auto">
                <code>POST /api/connections/clear</code>
              </div>
            </div>
            
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Authentication</h3>
              <p className="mb-2">
                Include an authorization header with a bearer token:
              </p>
              <div className="bg-gray-800 text-white p-4 rounded-md overflow-x-auto">
                <code>Authorization: Bearer {'{API_SECRET}'}</code>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                The API_SECRET should match the NEXT_PUBLIC_API_SECRET environment variable.
              </p>
            </div>
            
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Example (cURL)</h3>
              <div className="bg-gray-800 text-white p-4 rounded-md overflow-x-auto">
                <code>
                  curl -X POST https://your-domain.com/api/connections/clear \<br />
                  &nbsp;&nbsp;-H "Authorization: Bearer your-api-secret"
                </code>
              </div>
            </div>
            
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">Example (JavaScript)</h3>
              <div className="bg-gray-800 text-white p-4 rounded-md overflow-x-auto">
                <pre>{`async function clearConnections() {
  const response = await fetch('/api/connections/clear', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-secret'
    }
  });
  
  const data = await response.json();
  console.log(data);
}`}</pre>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800">
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
                </svg>
                <div>
                  <p className="font-medium">Security Note</p>
                  <p className="mt-1">
                    Keep your API secret secure. Do not expose it in client-side code.
                    For production use, consider implementing more robust authentication.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 