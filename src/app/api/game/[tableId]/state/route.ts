import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/services/gameManager';
import { authMiddleware } from '@/app/api/middleware'; // Assuming middleware is in /api folder
import { getCachedData, setCachedData } from '@/utils/cache';
import { getAuth } from 'firebase-admin/auth';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';

// Define the structure of the response data
interface GameStateResponse {
  // Inherit all properties from Table
  [key: string]: any; // Allow properties from Table
  privateData?: any; // Add privateData property
  fromCache?: boolean;
  timestamp?: number;
}

export async function GET(req: NextRequest, { params }: { params: { tableId: string } }) {
  const authResult = await authMiddleware(req);
  if (authResult) {
    logger.warn('[API /game/state] Authentication failed', { tableId: params.tableId, status: authResult.status });
    return authResult; // Return the unauthorized response
  }

  const { tableId } = params;

  // Verify token and get userId
  let userId: string;
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    // We know the token exists and is likely valid because authMiddleware passed
    const decodedToken = await getAuth().verifyIdToken(token!); 
    userId = decodedToken.uid;
  } catch (error) {
    // Should technically not happen if authMiddleware is correct, but handle defensively
    logger.error('[API /game/state] Error verifying token after middleware success:', { tableId, error: serializeError(error) });
    return NextResponse.json({ error: 'Internal server error during auth.' }, { status: 500 });
  }

  const cacheKey = `game:${tableId}`;
  const cached = getCachedData(cacheKey);

  if (cached) {
    logger.log('[API /game/state] Cache hit', { tableId, userId });
    // Fetch fresh private data even on cache hit
    let privateData = null;
    try {
      const gameManager = new GameManager(tableId);
      privateData = await gameManager.getPrivatePlayerData(tableId, userId);
    } catch (error) {
      // Log error but proceed returning cached public data + null private data
      logger.error('[API /game/state] Error fetching private data on cache hit:', { tableId, userId, error: serializeError(error) });
    }
    return NextResponse.json({ 
      ...cached.data, // Public data from cache
      privateData, 
      fromCache: true 
    } as GameStateResponse);
  }

  logger.log('[API /game/state] Cache miss', { tableId, userId });

  try {
    const gameManager = new GameManager(tableId);

    // Fetch public table data
    // Use the static method for fetching, as GameManager constructor might do setup we don't need here
    const tableData = await GameManager.getTableData(tableId); 
    if (!tableData) {
      logger.warn('[API /game/state] Table not found', { tableId });
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Fetch private player data
    const privateData = await gameManager.getPrivatePlayerData(tableId, userId);

    // Cache the public data only
    setCachedData(cacheKey, tableData);
    logger.log('[API /game/state] Fetched data and updated cache', { tableId, userId });

    const responseData: GameStateResponse = {
      ...tableData,
      privateData,
      timestamp: Date.now() // Add a timestamp for the fresh data
    };

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error('[API /game/state] Error fetching game state:', { tableId, userId, error: serializeError(error) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 