import { type NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { type DecodedIdToken } from 'firebase-admin/auth';
import '../../../services/firebase-admin'; // Initialize Firebase Admin

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

export async function authMiddleware(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new AuthError('No authentication token provided');
    }

    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      (req as AuthenticatedRequest).user = decodedToken;
      return null; // Proceed to the next middleware/handler
    } catch (error) {
      throw new AuthError('Invalid authentication token');
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { message: error.message, code: error.code } },
        { status: error.status }
      );
    }

    // Handle unexpected errors
    console.error('Authentication error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'auth/internal-error' } },
      { status: 500 }
    );
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