import { notFound } from 'next/navigation';
import { TablePageClient } from '@/components/pages/TablePageClient';

interface PageProps {
  params: {
    id: string;
  };
}

/**
 * Server Component for the table page.
 * Note: While Next.js sometimes warns about awaiting params, in this case it's not needed
 * because params in dynamic route segments are synchronously available at the page level.
 * The params object is injected by Next.js routing system at build/request time.
 */
export default function TablePage({ params }: PageProps): React.ReactElement {
  // Validate table ID - this is synchronous validation
  if (!params.id || !/^[a-zA-Z0-9-]+$/.test(params.id)) {
    notFound();
  }

  return <TablePageClient tableId={params.id} />;
} 