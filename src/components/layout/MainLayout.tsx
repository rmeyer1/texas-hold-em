import { ReactNode } from 'react';
interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d1117] to-[#171b21]">
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}; 