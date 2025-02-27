/**
 * Serializes an error object for logging
 * @param error The error to serialize
 * @returns A serialized error object with message, stack, and name
 */
export function serializeError(error: unknown): Record<string, string | undefined> {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }
  
  return { message: String(error) };
} 