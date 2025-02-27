import { notFound } from 'next/navigation';
import { TablePageClient } from '@/components/pages/TablePageClient';
import { Suspense } from 'react';
import { GameManager } from '@/services/gameManager';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

async function TableLoader({ tableId }: { tableId: string }) {
  console.log('[TableLoader] Starting to load table:', {
    tableId,
    timestamp: new Date().toISOString(),
  });

  try {
    if (!tableId || typeof tableId !== 'string' || !/^[a-zA-Z0-9-]+$/.test(tableId)) {
      console.error('[TableLoader] Invalid table ID format:', {
        tableId,
        timestamp: new Date().toISOString(),
      });
      notFound();
    }
    
    // Pre-fetch table data on the server
    const tableData = await GameManager.getTableData(tableId);
    
    console.log('[TableLoader] Table data fetched:', {
      tableId,
      hasData: !!tableData,
      playerCount: tableData?.players?.length ?? 0,
      timestamp: new Date().toISOString()
    });

    if (!tableData) {
      console.error('[TableLoader] No table data found:', {
        tableId,
        timestamp: new Date().toISOString()
      });
      notFound();
    }
    return <TablePageClient tableId={tableId} initialData={tableData} />;
  } catch (error) {
    console.error('[TableLoader] Error loading table:', {
      tableId,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error,
      timestamp: new Date().toISOString()
    });
    notFound();
  }
}

/**
 * Server Component for the table page.
 * Using async function to properly handle dynamic route parameters in Next.js 13+
 */
export default async function TablePage({ params }: PageProps): Promise<React.ReactElement> {
  // Await the params object to properly handle dynamic route parameters
  const resolvedParams = await params;
  
  console.log('[TablePage] Rendering with params:', {
    params: resolvedParams,
    timestamp: new Date().toISOString()
  });

  // Validate table ID format first
  if (!resolvedParams?.id || !/^[a-zA-Z0-9-]+$/.test(resolvedParams.id)) {
    console.error('[TablePage] Invalid table ID format:', {
      params: resolvedParams,
      timestamp: new Date().toISOString()
    });
    notFound();
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 p-8 flex items-center justify-center">
        <div className="text-white text-2xl">Loading table...</div>
      </div>
    }>
      <TableLoader tableId={resolvedParams.id} />
    </Suspense>
  );
} 