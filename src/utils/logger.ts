/**
 * Logger utility that respects environment variables to enable/disable console logs
 * Set NEXT_PUBLIC_ENABLE_CONSOLE_LOGS=true in your .env file to enable logs
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/**
 * Determines if logging is enabled based on environment variable
 */
const isLoggingEnabled = (): boolean => {
  // In server-side code, process.env is available
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NEXT_PUBLIC_ENABLE_CONSOLE_LOGS === 'true';
  }
  
  // In client-side code, window is available
  if (typeof window !== 'undefined') {
    return (
      typeof window.process?.env?.NEXT_PUBLIC_ENABLE_CONSOLE_LOGS === 'string' &&
      window.process.env.NEXT_PUBLIC_ENABLE_CONSOLE_LOGS === 'true'
    );
  }
  
  return false;
};

/**
 * Generic logging function that checks if logging is enabled before outputting
 */
const log = (level: LogLevel, ...args: unknown[]): void => {
  if (isLoggingEnabled() && console && typeof console[level] === 'function') {
    console[level](...args);
  }
};

/**
 * Logger object with methods that mirror the console object
 */
export const logger = {
  log: (...args: unknown[]): void => log('log', ...args),
  info: (...args: unknown[]): void => log('info', ...args),
  warn: (...args: unknown[]): void => log('warn', ...args),
  error: (...args: unknown[]): void => log('error', ...args),
  debug: (...args: unknown[]): void => log('debug', ...args),
  
  // Always log errors regardless of environment setting
  // This ensures critical errors are always visible
  criticalError: (...args: unknown[]): void => {
    console.error('[CRITICAL]', ...args);
  },
};

// For backwards compatibility and easier migration
export default logger; 