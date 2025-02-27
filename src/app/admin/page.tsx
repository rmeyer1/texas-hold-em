'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function AdminPage(): React.ReactElement {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Check if user is an admin (you may need to adjust this based on your auth system)
  const isAdmin = user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  // Redirect non-admin users
  if (!loading && !isAdmin) {
    router.push('/');
    return <div>Unauthorized</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/admin/connections" className="block">
          <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <h2 className="text-xl font-semibold mb-2">Database Connections</h2>
            <p className="text-gray-600">
              Manage database connections, clear all connections, and view active connections.
            </p>
          </div>
        </Link>
        
        <Link href="/admin/update-usernames" className="block">
          <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <h2 className="text-xl font-semibold mb-2">Update Usernames</h2>
            <p className="text-gray-600">
              Update usernames for specific users.
            </p>
          </div>
        </Link>
        
        <Link href="/admin/update-all-usernames" className="block">
          <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <h2 className="text-xl font-semibold mb-2">Update All Usernames</h2>
            <p className="text-gray-600">
              Update usernames for all users in the system.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
} 