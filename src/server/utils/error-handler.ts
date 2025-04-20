import { ServiceResponse } from '../types';
import logger from '@/utils/logger';

export class ServerError extends Error {
  constructor(
    message: string,
    public code: string = 'server/unknown-error',
    public status: number = 500
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

export function handleServiceError(error: unknown, context: string): ServiceResponse {
  logger.error(`[${context}] Error:`, {
    error,
    timestamp: new Date().toISOString()
  });

  if (error instanceof ServerError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    };
  }

  return {
    success: false,
    error: {
      code: 'server/unknown-error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    }
  };
} 