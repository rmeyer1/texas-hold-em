import { type NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { type DecodedIdToken } from 'firebase-admin/auth';
import '@/services/firebase-admin'; // Initialize Firebase Admin
import { LRUCache } from 'lru-cache';
import logger from '@/utils/logger';

export interface AuthenticatedRequest extends NextRequest {
  user: DecodedIdToken;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number = 401,
    public code: string = 'auth/unauthorized'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// Rate limiting cache
const rateLimitCache = new LRUCache<string, number>({
  max: 10000, // Maximum number of users to track
  ttl: 60000, // Reset counts every minute
});

const MAX_REQUESTS_PER_MINUTE = 300; // 5 requests per second

/**
 * Check authentication using Firebase Admin SDK
 */
export async function authMiddleware(req: NextRequest): Promise<NextResponse | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await getAuth().verifyIdToken(token);
    return null; // Authentication successful
  } catch (error) {
    logger.error('[Auth] Invalid token:', {
      error,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

/**
 * Check rate limiting
 */
export async function rateLimitMiddleware(req: NextRequest): Promise<NextResponse | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  let userId: string;

  try {
    if (token) {
      const decodedToken = await getAuth().verifyIdToken(token);
      userId = decodedToken.uid;
    } else {
      // Use forwarded IP or direct IP for non-authenticated requests
      const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0];
      userId = forwardedFor || req.headers.get('x-real-ip') || 'unknown';
    }

    const currentCount = (rateLimitCache.get(userId) || 0) + 1;
    rateLimitCache.set(userId, currentCount);

    if (currentCount > MAX_REQUESTS_PER_MINUTE) {
      logger.warn('[RateLimit] Limit exceeded:', {
        userId,
        count: currentCount,
        timestamp: new Date().toISOString()
      });
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }

    return null; // Rate limit not exceeded
  } catch (error) {
    logger.error('[RateLimit] Error:', {
      error,
      timestamp: new Date().toISOString()
    });
    return null; // Allow request on error
  }
}

export function withAuth(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authResponse = await authMiddleware(req);
    if (authResponse) {
      return authResponse;
    }
    return handler(req as AuthenticatedRequest);
  };
} 