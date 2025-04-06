import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/services/gameManager';
import { authMiddleware } from '@/app/api/middleware';
import { deleteCachedData } from '@/utils/cache';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';
import type { PlayerAction } from '@/types/poker';

// Zod schema for validating the request body
const actionSchema = z.object({
  action: z.enum(['bet', 'fold', 'call', 'raise']),
  amount: z.number().positive().optional(),
}).refine(data => {
  // Require amount for bet/raise actions
  if ((data.action === 'bet' || data.action === 'raise') && (data.amount === undefined || data.amount === null)) {
    return false;
  }
  return true;
}, { message: 'Amount is required and must be positive for bet/raise actions' });

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ tableId: string }> }
) {
  const { tableId } = await context.params;
  
  const authResult = await authMiddleware(req);
  if (authResult) {
    logger.warn('[API /game/action] Authentication failed', { tableId, status: authResult.status });
    return authResult; // Return the unauthorized response
  }

  // Verify token and get userId
  let userId: string;
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const decodedToken = await getAuth().verifyIdToken(token!); 
    userId = decodedToken.uid;
  } catch (error) {
    logger.error('[API /game/action] Error verifying token after middleware success:', { tableId, error: serializeError(error) });
    return NextResponse.json({ error: 'Internal server error during auth.' }, { status: 500 });
  }

  // Validate request body
  let validatedData: { action: PlayerAction; amount?: number };
  try {
    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn('[API /game/action] Invalid request body', { tableId, userId, errors: parsed.error.errors });
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
    }
    validatedData = parsed.data;
  } catch (error) {
    logger.error('[API /game/action] Error parsing request body:', { tableId, userId, error: serializeError(error) });
    return NextResponse.json({ error: 'Failed to parse request body' }, { status: 400 });
  }

  const { action, amount } = validatedData;
  const cacheKey = `game:${tableId}`;

  logger.log('[API /game/action] Processing action:', { tableId, userId, action, amount });

  try {
    const gameManager = new GameManager(tableId);
    
    // Perform the player action using GameManager
    await gameManager.handlePlayerAction(userId, action, amount); // Pass validated data

    // Invalidate cache on successful action
    deleteCachedData(cacheKey);
    logger.log('[API /game/action] Action successful, cache invalidated', { tableId, userId, cacheKey });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    const serialized = serializeError(error);
    logger.error('[API /game/action] Error handling player action:', { 
      tableId, 
      userId, 
      action, 
      amount, 
      errorMessage: serialized.message,
      errorStack: serialized.stack 
    });

    // Determine appropriate status code based on error message (optional, but good practice)
    let status = 500;
    if (serialized.message?.includes('Not player\'s turn') || serialized.message?.includes('Invalid action')) {
      status = 409; // Conflict - state doesn't allow action
    } else if (serialized.message?.includes('Table not found')) {
      status = 404;
    } else if (serialized.message?.includes('amount')) { // Errors related to bet/raise amounts
       status = 400; // Bad Request
    }

    return NextResponse.json({ error: serialized.message || 'Internal server error' }, { status });
  }
} 