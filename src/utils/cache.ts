import { LRUCache } from 'lru-cache';
import logger from '@/utils/logger';

// Cache options
const options = {
  max: 1000, // Maximum number of items to store
  ttl: 1000 * 60 * 5, // 5 minutes TTL
  updateAgeOnGet: true, // Reset TTL when item is accessed
  allowStale: false // Don't serve stale items
};

// Create the cache instance
const cache = new LRUCache<string, { data: any; timestamp: number }>(options);

/**
 * Get data from cache
 */
export function getCachedData(key: string) {
  try {
    const cached = cache.get(key);
    if (cached) {
      logger.log('[Cache] Hit:', { key, timestamp: new Date().toISOString() });
      return cached;
    }
    logger.log('[Cache] Miss:', { key, timestamp: new Date().toISOString() });
    return null;
  } catch (error) {
    logger.error('[Cache] Error getting data:', {
      key,
      error,
      timestamp: new Date().toISOString()
    });
    return null;
  }
}

/**
 * Set data in cache
 */
export function setCachedData(key: string, data: any) {
  try {
    cache.set(key, { data, timestamp: Date.now() });
    logger.log('[Cache] Set:', { key, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('[Cache] Error setting data:', {
      key,
      error,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Invalidate cache entry
 */
export function invalidateCache(key: string) {
  try {
    cache.delete(key);
    logger.log('[Cache] Invalidated:', { key, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('[Cache] Error invalidating data:', {
      key,
      error,
      timestamp: new Date().toISOString()
    });
  }
}

// Add function to delete cache entry
export function deleteCachedData(key: string) {
  cache.delete(key);
}

// Export the cache instance for direct access if needed
export { cache }; 