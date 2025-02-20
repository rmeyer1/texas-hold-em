import { notFound } from 'next/navigation';
import { TablePageClient } from '@/components/pages/TablePageClient';

interface PageProps {
  params: {
    id: string;
  };
}

export default function TablePage({ params }: PageProps): React.ReactElement {
  // Validate table ID
  if (!params.id || !/^[a-zA-Z0-9-]+$/.test(params.id)) {
    notFound();
  }

  return <TablePageClient tableId={params.id} />;
} 