import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/app/api/middleware';
import { TableService } from '@/server/services/TableService';
import logger from '@/utils/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const { id: tableId } = params;
    const player = await request.json();

    const tableService = new TableService(tableId);
    const result = await tableService.addPlayer(player);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Failed to add player' },
        { status: result.error?.code === 'table/full' ? 400 : 500 }
      );
    }

    return NextResponse.json({ message: 'Player added successfully' });
  } catch (error) {
    logger.error('[TableAPI] Error adding player:', { error });
    return NextResponse.json(
      { error: 'Failed to add player' },
      { status: 500 }
    );
  }
} 