import { LRUCache } from 'lru-cache';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface CacheOptions {
  max?: number;
  ttl?: number;
}

class Cache {
  private cache: LRUCache<string, CacheEntry<unknown>>;

  constructor(options: CacheOptions = {}) {
    this.cache = new LRUCache<string, CacheEntry<unknown>>({
      max: options.max || 1000, // Default to 1000 items
      ttl: options.ttl || 1000 * 60 * 5, // Default to 5 minutes
    });
  }

  get<T>(key: string): CacheEntry<T> | undefined {
    return this.cache.get(key) as CacheEntry<T> | undefined;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}

// Create a default cache instance with default options
const defaultCache = new Cache();

export { Cache, defaultCache as cache }; 