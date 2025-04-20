import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/services/gameManager';
import { authMiddleware, rateLimitMiddleware } from '@/app/api/middleware';
import { getCachedData, setCachedData } from '@/utils/cache';
import { getAuth } from 'firebase-admin/auth';
import logger from '@/utils/logger';
import { TableService } from '@/server/services/TableService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = '';
  try {
    ({ id } = await params);

    // Check authentication
    const authError = await authMiddleware(request);
    if (authError) return authError;

    // Check rate limiting
    const rateLimitError = await rateLimitMiddleware(request);
    if (rateLimitError) return rateLimitError;

    // Try to get cached data first
    const cacheKey = `table:${id}`;
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      logger.log('[TableAPI] Cache hit for table:', id);
      
      // If we have a token, append hole cards
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (token) {
        const decodedToken = await getAuth().verifyIdToken(token);
        const gameManager = new GameManager(id);
        const holeCards = await gameManager.getPlayerHoleCards(decodedToken.uid);
        if (holeCards) {
          return NextResponse.json({ 
            ...cached.data, 
            privateData: { holeCards },
            fromCache: true,
            timestamp: Date.now()
          });
        }
      }
      
      return NextResponse.json({ 
        ...cached.data, 
        fromCache: true,
        timestamp: Date.now()
      });
    }

    // No cache hit, get fresh data
    const tableService = new TableService(id);
    const result = await tableService.getTable();
    
    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error?.message || 'Table not found' }, 
        { status: result.error?.code === 'table/not-found' ? 404 : 500 }
      );
    }

    const table = result.data;

    // Cache the public table data
    setCachedData(cacheKey, table);

    // If we have a token, append hole cards
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decodedToken = await getAuth().verifyIdToken(token);
      const gameManager = new GameManager(id);
      const holeCards = await gameManager.getPlayerHoleCards(decodedToken.uid);
      if (holeCards) {
        return NextResponse.json({ 
          ...table, 
          privateData: { holeCards },
          timestamp: Date.now()
        });
      }
    }

    return NextResponse.json({ 
      ...table,
      timestamp: Date.now()
    });

  } catch (error: any) {
    logger.error('[TableAPI] Error fetching table:', {
        tableId: id,
        error: error.toString(),
        timestamp: new Date().toISOString()
      });
    
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await authMiddleware(request);
  if (authError) return authError;

  try {
    const { id: tableId } = params;
    const updates = await request.json();

    const tableService = new TableService(tableId);
    const result = await tableService.updateTable(updates);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Failed to update table' },
        { status: 500 }
      );
    }

    // Clear the cache for this table
    const cacheKey = `table:${tableId}`;
    setCachedData(cacheKey, null);

    return NextResponse.json({ message: 'Table updated successfully' });
  } catch (error) {
    logger.error('[TableAPI] Error updating table:', { error });
    return NextResponse.json(
      { error: 'Failed to update table' },
      { status: 500 }
    );
  }
}

// Rate limiting helper (to be moved to middleware)
async function checkRateLimit(req: NextRequest): Promise<NextResponse | null> {
  // TODO: Implement rate limiting
  // For now, return null (no rate limit error)
  return null;
} 