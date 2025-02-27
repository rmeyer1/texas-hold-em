import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Admin Dashboard',
  description: 'Admin dashboard for Texas Hold\'em',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="py-4 bg-white shadow-sm">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Admin Dashboard</h1>
          <nav>
            <ul className="flex space-x-6">
              <li>
                <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/admin/connections" className="text-gray-600 hover:text-gray-900">
                  Connections
                </Link>
              </li>
              <li>
                <Link href="/" className="text-gray-600 hover:text-gray-900">
                  Back to Site
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
} 