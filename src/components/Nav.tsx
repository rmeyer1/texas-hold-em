'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';

export const Nav = (): React.ReactElement => {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Check if user is an admin
  const isAdmin = user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  
  const toggleMenu = (): void => {
    setIsMenuOpen(!isMenuOpen);
  };
  
  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          Texas Hold'em
        </Link>
        
        {/* Desktop Navigation */}
        <div className="hidden sm:flex space-x-4">
          {user ? (
            <>
              <span className="text-gray-300">
                {user.displayName || 'Player'}
              </span>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`hover:text-gray-300 transition-colors ${
                    pathname.startsWith('/admin') ? 'text-blue-400' : ''
                  }`}
                >
                  Admin
                </Link>
              )}
              <Link
                href="/auth/signout"
                className={`hover:text-gray-300 transition-colors ${
                  pathname === '/auth/signout' ? 'text-blue-400' : ''
                }`}
              >
                Sign Out
              </Link>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className={`hover:text-gray-300 transition-colors ${
                pathname === '/auth/signin' ? 'text-blue-400' : ''
              }`}
            >
              Sign In
            </Link>
          )}
        </div>
        
        {/* Mobile Hamburger Button */}
        <button 
          className="sm:hidden flex flex-col justify-center items-center w-8 h-8 space-y-1.5"
          onClick={toggleMenu}
          aria-label="Toggle menu"
        >
          <span className={`block w-6 h-0.5 bg-white transition-transform duration-300 ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
          <span className={`block w-6 h-0.5 bg-white transition-opacity duration-300 ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`}></span>
          <span className={`block w-6 h-0.5 bg-white transition-transform duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
        </button>
      </div>
      
      {/* Mobile Menu Dropdown */}
      <div className={`sm:hidden ${isMenuOpen ? 'block' : 'hidden'} pt-2 pb-4 transition-all duration-300`}>
        <div className="flex flex-col space-y-3 px-4">
          {user ? (
            <>
              <span className="text-gray-300 py-2 border-b border-gray-700">
                {user.displayName || 'Player'}
              </span>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`py-2 ${
                    pathname.startsWith('/admin') ? 'text-blue-400' : 'text-white'
                  }`}
                  onClick={toggleMenu}
                >
                  Admin Dashboard
                </Link>
              )}
              <Link
                href="/admin/update-usernames"
                className={`py-2 ${
                  pathname === '/admin/update-usernames' ? 'text-blue-400' : 'text-white'
                }`}
                onClick={toggleMenu}
              >
                Update Username
              </Link>
              <Link
                href="/auth/signout"
                className={`py-2 ${
                  pathname === '/auth/signout' ? 'text-blue-400' : 'text-white'
                }`}
                onClick={toggleMenu}
              >
                Sign Out
              </Link>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className={`py-2 ${
                pathname === '/auth/signin' ? 'text-blue-400' : 'text-white'
              }`}
              onClick={toggleMenu}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}; 