Revised Migration Plan
Existing API Structure
You have API routes set up in src/app/api with:
/game/[tableId] - Game-related endpoints
/tables/[id] and /tables/create - Table management
/connections/clear - Connection management
Middleware handling authentication and rate limiting is already implemented
Firebase Admin SDK initialization is already referenced
Service Migration Priority (adjusted based on existing API endpoints)
First batch (already have API endpoints):
tableService.ts → Integrate with /tables/* endpoints
gameManager.ts → Integrate with /game/* endpoints
connectionManager.ts → Integrate with /connections/* endpoints
Second batch (need new API endpoints):
auth.ts - Already partially handled in middleware
databaseService.ts
playerManager.ts
deckManager.ts
handEvaluator.ts
phaseManager.ts
bettingManager.ts
chatService.ts and gameChatConnector.ts
Migration Process for each service:
Create server-side service in src/server/services if needed
Update service to use Firebase Admin SDK
Connect existing API endpoints to new server-side service
Update client-side code to use API endpoints
Remove client-side Firebase SDK usage
Specific Next Steps:
Create the server-side services directory structure
Start with tableService.ts migration since the API endpoints exist
Ensure proper error handling and type safety between client and server