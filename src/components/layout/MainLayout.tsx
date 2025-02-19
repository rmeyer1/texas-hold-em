import { ReactNode } from 'react';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="min-h-screen bg-green-800">
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}; 