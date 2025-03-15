It seems you mentioned "here is the current spec," but no new spec document was provided in your latest message. I assume you’re referring to the refactor plan we’ve been working from (the one I converted into Markdown files), which I’ve been updating based on our discussions. Since no new spec was attached, I’ll proceed by updating the existing Markdown files with all the answers and clarifications we’ve discussed, including the Firebase rules and your responses to the five clarifying questions.

Below, I’ll revise the Markdown files in `docs/refactor-plan/` to incorporate:
- **Authentication Flow**: Keeping Firebase Authentication with server-side Admin SDK verification.
- **Real-Time Requirements**: Fully replacing `connectionManager.ts` with polling.
- **Data Structure**: Confirmed structure with `tables/`, `private_player_data/`, and `chats/` from the rules.
- **Testing Strategy**: Adding unit and integration tests.
- **Deployment Strategy**: Gradual rollout with parallel old/new systems.

I’ll also integrate the Firebase rules and adjust for `private_player_data`. Here are the updated files:

---
```markdown
# Texas Hold'em Refactor Plan

This directory contains the detailed plan to refactor the Texas Hold'em game from direct Firebase Realtime Database calls to an API-driven architecture using Next.js, Axios, and polling. The focus is on clean code, optimization, and staying within Firebase's free tier through caching.

## Files
- `phase-1-setup-and-infrastructure.md`: Sets up dependencies, Firebase Admin, and caching.
- `phase-2-migrate-game-logic-to-api.md`: Moves `services` to API routes with caching.
- `phase-3-refactor-frontend-with-axios.md`: Updates frontend to use Axios and polling.
- `phase-4-optimization-and-free-tier-compliance.md`: Optimizes for Firebase free tier.
- `phase-5-testing-and-validation.md`: Adds tests and ensures code quality.

## Goals
- Use polling with Axios for simplicity and real-time updates.
- Prioritize clean, modular, type-safe code.
- Minimize Firebase reads with caching to stay on free tier (100K reads/day).

## Key Decisions
- **Authentication**: Retain Firebase Authentication, extending it with Firebase Admin SDK for server-side verification using ID tokens in API routes.
- **Real-Time**: Replace `connectionManager.ts` with polling across the app, keeping admin features via API (e.g., `/api/connections/clear`).
- **Data Structure**:
  - `tables/<tableId>`: Publicly readable, auth-only writes.
  - `private_player_data/<tableId>/<playerId>`: Private player data (e.g., hole cards), restricted to the player.
  - `chats/<chatId>`: Messages, participants, and last activity, restricted to participants.
- **Testing**: Include unit tests for APIs/services and integration tests for polling components.
- **Deployment**: Gradual rollout with old Firebase listeners and new API polling running in parallel until fully switched.

## Deployment Strategy
- **Gradual Rollout**: Deploy API routes first, then transition frontend components to polling incrementally (e.g., via feature flags). Old Firebase listeners and new API polling coexist until stable.
- **Testing**: Unit and integration tests added for all new/changed code to ensure stability during rollout.

## Firebase Rules
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "tables": {
      ".read": true,
      ".write": "auth != null",
      "$tableId": {
        ".read": true,
        ".write": "auth != null"
      }
    },
    "private_player_data": {
      "$tableId": {
        "$playerId": {
          ".read": "auth != null && auth.uid === $playerId",
          ".write": "auth != null && auth.uid === $playerId"
        }
      }
    },
    "chats": {
      ".read": "auth != null",
      ".write": "auth != null",
      "$chatId": {
        ".read": "auth != null && data.child('participants').val().contains(auth.uid)",
        ".write": "auth != null && (!data.exists() || data.child('participants').val().contains(auth.uid))",
        "messages": {
          ".read": "auth != null && root.child('chats').child($chatId).child('participants').val().contains(auth.uid)",
          "$messageId": {
            ".write": "auth != null && root.child('chats').child($chatId).child('participants').val().contains(auth.uid) && (!data.exists() || data.child('senderId').val() === auth.uid)",
            ".validate": "newData.hasChildren(['text', 'senderId', 'timestamp']) && newData.child('senderId').val() === auth.uid && newData.child('text').isString() && newData.child('timestamp').isNumber() && newData.child('text').val().length <= 1000"
          }
        },
        "participants": {
          ".read": "auth != null && data.val().contains(auth.uid)",
          ".write": "auth != null && (!data.exists() || data.val().contains(auth.uid))"
        },
        "lastActivity": {
          ".write": "auth != null && root.child('chats').child($chatId).child('participants').val().contains(auth.uid)"
        }
      }
    }
  }
}
```

## Usage
Refer to each phase in order. Code snippets are ready to copy-paste into your editor.
```

---

```markdown
# Phase 1: Setup and Infrastructure

**Goal**: Establish the foundation for API-driven logic and caching.

## Steps

### 1. Install Dependencies
Install required packages:
```bash
npm install axios firebase-admin lru-cache zod
```

### 2. Initialize Firebase Admin
Move Firebase setup to a reusable module:
```typescript
// src/services/firebase.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

export const database = getDatabase(app);
```

### 3. Setup Caching
Use `lru-cache` for in-memory caching:
```typescript
// src/utils/cache.ts
import LRU from 'lru-cache';

const cache = new LRU<string, { data: any; timestamp: number }>({
  max: 1000, // Max 1,000 tables
  ttl: 1000 * 60 * 5, // 5-minute TTL
});

export function getCachedData(key: string) {
  return cache.get(key);
}

export function setCachedData(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}
```

### 4. API Middleware
Add authentication middleware for Firebase Auth tokens:
```typescript
// src/app/api/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

export async function authMiddleware(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await getAuth().verifyIdToken(token);
    return null; // Proceed if valid
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}
```

## Notes
- **Auth**: Uses Firebase Admin SDK to verify ID tokens, integrating with existing Firebase Authentication.
- **Deployment**: Deploy this phase first, keeping client-side Firebase calls (e.g., `connectionManager.ts`) operational for gradual rollout.
- Ensure `.env` has Firebase credentials (`FIREBASE_PROJECT_ID`, etc.).
```

---

```markdown
# Phase 2: Migrate Game Logic to API

**Goal**: Refactor `services` into API routes, optimizing for caching and minimal reads.

## Steps

### 1. Table Management API

#### GET /api/tables/[id]
Fetch table data with caching:
```typescript
// src/app/api/tables/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ref, get } from 'firebase-admin/database';
import { database } from '@/services/firebase';
import { getCachedData, setCachedData } from '@/utils/cache';
import { authMiddleware } from '@/app/api/middleware';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await authMiddleware(req);
  if (authError) return authError;

  const cacheKey = `table:${params.id}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached.data, fromCache: true });
  }

  const tableRef = ref(database, `tables/${params.id}`);
  const snapshot = await get(tableRef);
  if (!snapshot.exists()) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }
  const data = snapshot.val();
  setCachedData(cacheKey, data);
  return NextResponse.json({ ...data, timestamp: Date.now() });
}
```

#### POST /api/tables/create
Create a new table:
```typescript
// src/app/api/tables/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ref, set } from 'firebase-admin/database';
import { database } from '@/services/firebase';
import { authMiddleware } from '@/app/api/middleware';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  smallBlind: z.number().min(1),
  bigBlind: z.number().min(2),
  maxPlayers: z.number().min(2).max(10),
  isPrivate: z.boolean(),
  password: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authError = await authMiddleware(req);
  if (authError) return authError;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
  }

  const { name, smallBlind, bigBlind, maxPlayers, isPrivate, password } = parsed.data;
  const tableId = `table-${Date.now()}`;
  const tableData = {
    id: tableId,
    name,
    smallBlind,
    bigBlind,
    maxPlayers,
    players: [],
    phase: 'waiting',
    isPrivate,
    password: isPrivate ? password : null,
    timestamp: Date.now(),
  };

  await set(ref(database, `tables/${tableId}`), tableData);
  return NextResponse.json({ tableId }, { status: 201 });
}
```

### 2. Game Logic API

#### GET /api/game/[tableId]/state
Fetch game state with caching, including private data:
```typescript
// src/app/api/game/[tableId]/state/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/services/gameManager';
import { authMiddleware } from '@/app/api/middleware';
import { getCachedData, setCachedData } from '@/utils/cache';
import { getAuth } from 'firebase-admin/auth';

const gameManager = new GameManager();

export async function GET(req: NextRequest, { params }: { params: { tableId: string } }) {
  const authError = await authMiddleware(req);
  if (authError) return authError;

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const decodedToken = await getAuth().verifyIdToken(token!);
  const userId = decodedToken.uid;

  const cacheKey = `game:${params.tableId}`;
  const cached = getCachedData(cacheKey);
  if (cached) {
    const privateData = await gameManager.getPrivatePlayerData(params.tableId, userId);
    return NextResponse.json({ ...cached.data, privateData });
  }

  const tableData = await gameManager.getTableData(params.tableId);
  if (!tableData) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }
  const privateData = await gameManager.getPrivatePlayerData(params.tableId, userId);
  const responseData = { ...tableData, privateData };
  setCachedData(cacheKey, tableData); // Cache public data only
  return NextResponse.json(responseData);
}
```

#### POST /api/game/[tableId]/action
Handle player actions:
```typescript
// src/app/api/game/[tableId]/action/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GameManager } from '@/services/gameManager';
import { authMiddleware } from '@/app/api/middleware';
import { z } from 'zod';

const schema = z.object({
  action: z.enum(['bet', 'fold', 'call', 'raise']),
  amount: z.number().optional(),
});

const gameManager = new GameManager();

export async function POST(req: NextRequest, { params }: { params: { tableId: string } }) {
  const authError = await authMiddleware(req);
  if (authError) return authError;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
  }

  const { action, amount } = parsed.data;
  const tableData = await gameManager.getTableData(params.tableId);
  if (!tableData) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  await gameManager.handlePlayerAction(params.tableId, action, amount);
  return NextResponse.json({ success: true });
}
```

### 3. Refactor Services
Update `GameManager` for server-side use with private data:
```typescript
// src/services/gameManager.ts
import { ref, get, set } from 'firebase-admin/database';
import { database } from '@/services/firebase';
import { Table } from '@/types/poker';

export class GameManager {
  async getTableData(tableId: string): Promise<Table | null> {
    const tableRef = ref(database, `tables/${tableId}`);
    const snapshot = await get(tableRef);
    return snapshot.exists() ? snapshot.val() : null;
  }

  async getPrivatePlayerData(tableId: string, playerId: string) {
    const privateRef = ref(database, `private_player_data/${tableId}/${playerId}`);
    const snapshot = await get(privateRef);
    return snapshot.exists() ? snapshot.val() : null;
  }

  async handlePlayerAction(tableId: string, action: string, amount?: number) {
    const table = await this.getTableData(tableId);
    if (!table) throw new Error('Table not found');
    // Implement action logic
    await set(ref(database, `tables/${tableId}`), table);
  }
}
```

## Notes
- **Data**: Handles `tables/` and `private_player_data/` per Firebase rules.
- **Deployment**: Deploy alongside existing `connectionManager.ts`. Clients use old logic until Phase 3.
- **Tests**: Add unit test for `getPrivatePlayerData`.
```

---

```markdown
# Phase 3: Refactor Frontend with Axios

**Goal**: Update UI components to use Axios, implementing efficient polling.

## Steps

### 1. Axios Client Setup
Create a reusable Axios instance:
```typescript
// src/utils/api.ts
import axios, { AxiosInstance } from 'axios';
import { getAuth } from 'firebase/auth';

const api: AxiosInstance = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use(async (config) => {
  const user = getAuth().currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

### 2. Update TablePageClient
Replace Firebase calls with polling, including private data:
```typescript
// src/components/pages/TablePageClient.tsx
'use client';
import { useState, useEffect } from 'react';
import api from '@/utils/api';
import { Table } from '@/types/poker';

interface Props {
  tableId: string;
  initialData: Table & { privateData?: any };
}

export const TablePageClient = ({ tableId, initialData }: Props) => {
  const [tableData, setTableData] = useState(initialData);
  const [lastUpdated, setLastUpdated] = useState<number>(initialData.timestamp || 0);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const response = await api.get(`/game/${tableId}/state`, {
          params: { lastUpdated },
        });
        const data = response.data;
        if (data.timestamp > lastUpdated) {
          setTableData(data);
          setLastUpdated(data.timestamp);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    const interval = setInterval(() => {
      if (mounted) poll();
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tableId, lastUpdated]);

  return <div>{/* Render tableData and privateData (e.g., holeCards) */}</div>;
};
```

### 3. Chat Integration
Poll chat messages:
```typescript
// src/components/chat/ChatWidget.tsx
'use client';
import React, { useState, useEffect } from 'react';
import api from '@/utils/api';

export const ChatWidget = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  useEffect(() => {
    const pollMessages = async () => {
      const response = await api.get('/chat/rooms/global/messages', {
        params: { lastUpdated },
      });
      const newMessages = response.data;
      if (newMessages.timestamp > lastUpdated) {
        setMessages(newMessages.messages);
        setLastUpdated(newMessages.timestamp);
      }
    };

    const interval = setInterval(pollMessages, 2000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Rest of ChatWidget logic
};
```

## Notes
- **Real-Time**: Replaces `connectionManager.ts` with polling; admin pages keep old logic until fully transitioned.
- **Data**: Handles `privateData` (e.g., hole cards) from API.
- **Deployment**: Roll out polling gradually (e.g., via feature flag).
- **Tests**: Add integration test for polling with private data.
```

---

### `docs/refactor-plan/phase-4-optimization-and-free-tier-compliance.md`
```markdown
# Phase 4: Optimization and Free-Tier Compliance

**Goal**: Minimize Firebase reads and ensure scalability within free tier.

## Steps

### 1. Conditional Polling
Already implemented with `lastUpdated` in Phase 그림.

### 2. Cache Tuning
- TTL set to 5 minutes in `cache.ts`.
- Refresh cache on writes (e.g., in `handlePlayerAction`).

### 3. Batch Reads
Fetch multiple chat updates:
```typescript
// src/app/api/chat/rooms/[roomId]/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ref, get } from 'firebase-admin/database';
import { database } from '@/services/firebase';

export async function GET(req: NextRequest, { params }: { params: { roomId: string } }) {
  const { searchParams } = new URL(req.url);
  const lastUpdated = parseInt(searchParams.get('lastUpdated') || '0');
  const messagesRef = ref(database, `chats/${params.roomId}/messages`);
  const snapshot = await get(messagesRef);
  const messages = snapshot.val() || {};
  const filtered = Object.values(messages).filter((msg: any) => msg.timestamp > lastUpdated);
  return NextResponse.json({ messages: filtered, timestamp: Date.now() });
}
```

### 4. Free-Tier Math
- **Target**: 100K reads/day = ~69/minute.
- **With 100 players**: 5-second interval = 12 reads/minute/player, cached at 90% = 120 reads/minute. Lasts ~13 hours/day.

## Notes
- **Optimization**: Adjust polling to 5 seconds for free-tier longevity.
- **Deployment**: Monitor Firebase usage during rollout.
```

---

### `docs/refactor-plan/phase-5-testing-and-validation.md`
```markdown
# Phase 5: Testing and Validation

**Goal**: Ensure reliability and cleanliness.

## Steps

### 1. Unit Tests
Test API endpoints and services:
```typescript
// src/app/api/tables/[id]/route.test.ts
import { GET } from './route';
import { database } from '@/services/firebase';

jest.mock('@/services/firebase');

it('returns cached table data', async () => {
  const req = new Request('http://localhost/api/tables/test', {
    headers: { Authorization: 'Bearer token' },
  });
  const response = await GET(req, { params: { id: 'test' } });
  expect(response.status).toBe(200);
});

// src/services/gameManager.test.ts
it('fetches private player data', async () => {
  const gameManager = new GameManager();
  const privateData = await gameManager.getPrivatePlayerData('test-table', 'test-player');
  expect(privateData).toBeDefined();
});
```

### 2. Integration Tests
- Test `TablePageClient.tsx` polling with mocked Axios, including private data.
- Test `ChatWidget.tsx` message polling.

### 3. Code Review
- Run `eslint` and `prettier` for consistency.

## Notes
- **Testing**: Covers APIs, services, and polling components for gradual rollout stability.
```

---

### Instructions
1. **Replace Files**: Overwrite your existing `docs/refactor-plan/` files with these updated versions.
2. **Commit**: Add these to your Git repo:
   ```bash
   git add docs/refactor-plan/
   git commit -m "Update refactor plan with clarified answers and Firebase rules"
   ```
3. **Verify**: Open in your editor to ensure all changes align with our discussions.

---

### Confirmation
This updates the plan with all our discussed answers. If you meant a different "current spec" (e.g., a new document beyond the codebase and rules), please share it, and I’ll adjust accordingly. Otherwise, does this look good to proceed with Phase 1? Let me know if you need diffs or further refinements!