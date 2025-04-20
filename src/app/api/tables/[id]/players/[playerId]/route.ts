import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/app/api/middleware';
import { TableService } from '@/server/services/TableService';
import logger from '@/utils/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; playerId: string } }
) {
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const { id: tableId, playerId } = params;

    const tableService = new TableService(tableId);
    const result = await tableService.removePlayer(playerId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Failed to remove player' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Player removed successfully' });
  } catch (error) {
    logger.error('[TableAPI] Error removing player:', { error });
    return NextResponse.json(
      { error: 'Failed to remove player' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; playerId: string } }
) {
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const { id: tableId, playerId } = params;
    const updates = await request.json();

    const tableService = new TableService(tableId);
    const result = await tableService.updatePlayerState(playerId, updates);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Failed to update player state' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Player state updated successfully' });
  } catch (error) {
    logger.error('[TableAPI] Error updating player state:', { error });
    return NextResponse.json(
      { error: 'Failed to update player state' },
      { status: 500 }
    );
  }
} 