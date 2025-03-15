### Implementation Plan
*** Phase 1: Foundation Setup (1-2 days) ***
Initial Dependencies
- Install required packages (axios, firebase-admin, lru-cache, zod)
- Create new src/utils/api.ts for Axios client setup
- Add Firebase Admin SDK initialization
Basic Caching Layer
- Implement src/utils/cache.ts with LRU cache
- Add basic cache types and interfaces
- Create cache utility functions
Auth Middleware
- Implement src/app/api/middleware.ts
- Add Firebase Admin auth verification
- Create basic error handling
*** Phase 2: Table Management API (2-3 days) ***
Table Read API
- Create src/app/api/tables/[id]/route.ts
- Implement GET endpoint with caching
- Add basic error handling
Table Creation API
- Create src/app/api/tables/create/route.ts
- Implement POST endpoint with validation
- Add error handling
Testing
- Add unit tests for table endpoints
- Test caching behavior
- Test error cases
*** Phase 3: Game State API (3-4 days) ***
Game State Endpoint
- Create src/app/api/game/[tableId]/state/route.ts
- Implement GET endpoint with private data handling
- Add caching for public data
Player Actions API
- Create src/app/api/game/[tableId]/action/route.ts
- Implement POST endpoint for player actions
- Add validation and error handling
Testing
- Add unit tests for game endpoints
- Test private data access
- Test action validation
*** Phase 4: Frontend Migration (4-5 days) ***
TablePageClient Component
- Update to use Axios client
- Implement polling with lastUpdated timestamp
- Add error handling and loading states
- Chat Integration
- Update ChatWidget to use polling
- Implement message batching
- Add error handling
Testing
- Add integration tests for polling
- Test error scenarios
- Test data updates
*** Phase 5: Optimization (2-3 days) ***
Cache Tuning
- Adjust cache TTLs
- Implement cache invalidation
- Add cache monitoring
Polling Optimization
- Implement adaptive polling intervals
- Add request batching
- Optimize payload sizes
Testing
- Test performance metrics
- Verify free tier compliance
- Test under load
*** Key Principles for Each Phase:***
- Small Changes: Each commit should focus on a single, testable change
- Testing First: Add tests before implementing features
- Parallel Systems: Keep old system running while new system is being tested
- Feature Flags: Use feature flags to control rollout of new features
- Monitoring: Add logging and monitoring for each new component