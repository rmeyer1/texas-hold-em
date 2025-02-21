import { AuthProvider } from '@/contexts/AuthContext';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Nav } from '@/components/Nav';
import type { ReactNode } from 'react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Texas Hold\'em',
  description: 'Online Texas Hold\'em Poker Game',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <Nav />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
