'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const Nav = (): React.ReactElement => {
  const pathname = usePathname();
  
  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          Texas Hold'em
        </Link>
        <div className="space-x-4">
          <Link
            href="/auth/signin"
            className={`hover:text-gray-300 transition-colors ${
              pathname === '/auth/signin' ? 'text-blue-400' : ''
            }`}
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}; 