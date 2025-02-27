/**
 * Utility types for the application
 */

/**
 * Use this type instead of 'any' when you need a type that can be anything
 * This makes it clear that you're intentionally using a loose type
 */
export type SafeAny = unknown;

/**
 * Use this type when you need an empty object type
 * This is better than using an empty interface
 */
export type EmptyObject = Record<string, never>;

/**
 * Use this type for function parameters that are not used
 * This makes it clear that the parameter is intentionally unused
 */
export type Unused = unknown;

/**
 * Use this type for values that can be null or undefined
 */
export type Nullable<T> = T | null | undefined; 