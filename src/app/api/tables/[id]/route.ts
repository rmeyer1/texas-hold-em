import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/services/gameManager';
import { DatabaseService } from '@/services/databaseService';
import { authMiddleware, rateLimitMiddleware } from '@/app/api/middleware';
import { getCachedData, setCachedData } from '@/utils/cache';
import { getAuth } from 'firebase-admin/auth';
import logger from '@/utils/logger';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    // Check authentication
    const authError = await authMiddleware(request);
    if (authError) return authError;

    // Check rate limiting
    const rateLimitError = await rateLimitMiddleware(request);
    if (rateLimitError) return rateLimitError;

    // Try to get cached data first
    const cacheKey = `table:${context.params.id}`;
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      logger.log('[TableAPI] Cache hit for table:', context.params.id);
      
      // If we have a token, append hole cards
      const token = request.headers.get('Authorization')?.replace('Bearer ', '');
      if (token) {
        const decodedToken = await getAuth().verifyIdToken(token);
        const gameManager = new GameManager(context.params.id);
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
    const db = new DatabaseService(context.params.id);
    const table = await db.getTable();
    
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Cache the public table data
    setCachedData(cacheKey, table);

    // If we have a token, append hole cards
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decodedToken = await getAuth().verifyIdToken(token);
      const gameManager = new GameManager(context.params.id);
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
        tableId: context.params.id,
        error: error.toString(),
        timestamp: new Date().toISOString()
      });
    
    return NextResponse.json(
      { error: 'Internal server error' }, 
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