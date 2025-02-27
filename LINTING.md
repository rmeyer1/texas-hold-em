# Linting Guidelines

This document provides guidelines for maintaining code quality through linting in this project.

## ESLint Configuration

The project uses ESLint with custom configurations defined in two files:

1. `eslint.config.mjs` - The primary configuration using ESLint's new flat config format
2. `.eslintrc.json` - A fallback configuration using the traditional format

### Ignored Files

Files and directories that should be excluded from linting are specified in the `ignores` property in `eslint.config.mjs`. This replaces the traditional `.eslintignore` file, which is no longer supported in ESLint's flat config format.

## Running Linting

- To check for linting errors: `npm run lint`
- To automatically fix linting errors where possible: `npm run lint:fix`

## Common Linting Issues and How to Fix Them

### Unescaped Entities in JSX

While we've disabled the rule to prevent build failures, it's best practice to properly escape entities:

```jsx
// Instead of:
<p>Don't use straight quotes like " or '</p>

// Use:
<p>Don&apos;t use straight quotes like &quot; or &apos;</p>
```

### Unused Variables

Variables that are declared but not used will trigger linting errors. To fix:

1. Remove the unused variable if it's not needed
2. Prefix the variable with an underscore to indicate it's intentionally unused: `_unusedVar`
3. Use the utility type `Unused` from `src/types/utility-types.ts` for function parameters

### Missing Dependencies in React Hooks

When using `useEffect` or `useCallback`, make sure to include all dependencies in the dependency array:

```jsx
// Incorrect
useEffect(() => {
  doSomethingWith(value);
}, []); // Missing dependency: value

// Correct
useEffect(() => {
  doSomethingWith(value);
}, [value]);
```

### Using `any` Type

Avoid using `any` as it defeats TypeScript's type checking. Instead:

1. Define a proper type
2. Use `unknown` if the type is truly unknown
3. Use `SafeAny` from `src/types/utility-types.ts` if you must use a loose type

### Using `@ts-ignore`

Instead of using `@ts-ignore`, use `@ts-expect-error` with a description:

```typescript
// Incorrect
// @ts-ignore
someCode();

// Correct
// @ts-expect-error - This is needed because of XYZ reason
someCode();
```

### Empty Interfaces

While the rule for empty interfaces (`@typescript-eslint/no-empty-object-type`) has been disabled to prevent build failures, it's still a good practice to use more specific types:

```typescript
// Instead of:
interface Props {}

// Consider using:
import { EmptyObject } from '../types/utility-types';
type Props = EmptyObject;

// Or if you need a more specific type:
interface Props {
  // Add specific properties here
}
```

## Ignoring Linting Rules

In rare cases where a linting rule needs to be ignored for a specific line or file, use the following:

```typescript
// eslint-disable-next-line rule-name
const someCode = 'example';

// Or for a whole file:
/* eslint-disable rule-name */
// code...
/* eslint-enable rule-name */
```

Always add a comment explaining why the rule is being disabled. 