# Logging System Documentation

## Overview

The Texas Hold'em application uses a centralized logging system that can be enabled or disabled through environment variables. This allows for detailed logging during development and testing while keeping the production environment clean.

## Configuration

Logging is controlled by the `NEXT_PUBLIC_ENABLE_CONSOLE_LOGS` environment variable:

- Set to `true` to enable console logs
- Set to `false` to disable console logs

### Environment Files

- `.env`: Default environment settings (logs disabled for production)
- `.env.local`: Local development settings (create this file based on `.env.local.example` with logs enabled)
- `.env.development`: Development environment settings (not included by default)
- `.env.production`: Production environment settings (not included by default)

## Usage

### Basic Usage

Import the logger utility and use it instead of direct console methods:

```typescript
import logger from '@/utils/logger';

// Instead of console.log
logger.log('Message', { data: 'value' });

// Instead of console.error
logger.error('Error message', error);

// Instead of console.warn
logger.warn('Warning message');

// Instead of console.info
logger.info('Info message');

// Instead of console.debug
logger.debug('Debug message');
```

### Critical Errors

For errors that should always be logged regardless of environment settings:

```typescript
logger.criticalError('Critical error message', error);
```

## Implementation Details

The logger utility is implemented in `src/utils/logger.ts` and provides:

1. Environment-aware logging that respects the `NEXT_PUBLIC_ENABLE_CONSOLE_LOGS` setting
2. Support for both client-side and server-side logging
3. Methods that mirror the standard console API
4. A special `criticalError` method for errors that should always be logged

## Best Practices

1. Use descriptive prefixes in log messages to identify the source:
   ```typescript
   logger.log('[ComponentName] Action description:', data);
   ```

2. Include relevant context data with log messages:
   ```typescript
   logger.log('[ServiceName] Operation result:', {
     id: item.id,
     status: operation.status,
     duration: operation.duration
   });
   ```

3. Use appropriate log levels:
   - `log`: General information
   - `info`: Important information
   - `warn`: Potential issues that don't break functionality
   - `error`: Errors that affect functionality but don't crash the application
   - `criticalError`: Severe errors that should always be logged

4. Avoid logging sensitive information such as passwords, tokens, or personal data

## Local Development

For local development, create a `.env.local` file with:

```
NEXT_PUBLIC_ENABLE_CONSOLE_LOGS=true
```

This will enable logging in your local environment while keeping it disabled in production. 