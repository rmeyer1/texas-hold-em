# GameManager Refactoring Plan

This document outlines the architecture and implementation plan to refactor the bloated `GameManager` class (~1,100 lines) in `src/services/gameManager.ts` into a modular, maintainable structure. The goal is to reduce its size to ~300 lines, improve readability, and optimize performance through a step-by-step process.

## Architecture Overview

### Target Structure
The `GameManager` will be split into five focused modules, each with a single responsibility, plus a lean coordinator class:
1. **DeckManager**: Manages deck operations (shuffling, dealing cards).
2. **PlayerManager**: Handles player state and actions (fold, raise, chips).
3. **PhaseManager**: Controls game phases and transitions (preflop → flop → showdown).
4. **HandEvaluator**: Evaluates hands and determines winners.
5. **DatabaseService**: Abstracts Firebase interactions (reads, writes).
6. **GameManager**: Lightweight coordinator tying these modules together.

### File Structure
src/services/
├── gameManager.ts        # Reduced coordinator class (~300 lines)
├── deckManager.ts        # Deck operations
├── playerManager.ts      # Player state and actions
├── phaseManager.ts       # Phase transitions
├── handEvaluator.ts      # Hand evaluation logic
├── databaseService.ts    # Firebase abstraction
└── firebase.ts           # Existing Firebase config


### Dependencies
- Reuse `src/utils/deck.ts` for `DeckManager`.
- Reuse `src/utils/handEvaluator.ts` for `HandEvaluator`.
- Leverage `src/types/poker.ts` for shared types (`Table`, `Player`, `Card`).

### Benefits
- **Size**: Reduces `GameManager` from 1,108 to ~300 lines.
- **Maintainability**: Each module is focused and testable.
- **Performance**: Fewer Firebase calls via caching and batching.
- **Scalability**: Easier to add features (e.g., tournament mode).

## Implementation Plan

### Step 1: Create `DatabaseService`
**Goal**: Abstract all Firebase interactions into a reusable service.  
**Duration**: 1-2 hours.  
**Steps**:  
1. **Create `src/services/databaseService.ts`**:
   ```typescript
   import { ref, set, update, get, onValue, off, DatabaseReference } from 'firebase/database';
   import { database } from './firebase';
   import type { Table, Card } from '@/types/poker';

   export class DatabaseService {
     private db = database;

     async getTable(tableId: string): Promise<Table | null> {
       const snapshot = await get(ref(this.db, `tables/${tableId}`));
       return snapshot.val() || null;
     }

     async updateTable(tableId: string, updates: Partial<Table>): Promise<void> {
       await update(ref(this.db, `tables/${tableId}`), updates);
     }

     async setPlayerCards(tableId: string, playerId: string, cards: Card[]): Promise<void> {
       await set(ref(this.db, `private_player_data/${tableId}/${playerId}`), {
         holeCards: cards,
         lastUpdated: Date.now(),
       });
     }

     async getPlayerCards(tableId: string, playerId: string): Promise<Card[] | null> {
       const snapshot = await get(ref(this.db, `private_player_data/${tableId}/${playerId}`));
       const data = snapshot.val();
       return data?.holeCards || null;
     }

     subscribeToTable(tableId: string, callback: (table: Table) => void): () => void {
       const tableRef = ref(this.db, `tables/${tableId}`);
       onValue(tableRef, (snapshot) => callback(snapshot.val()));
       return () => off(tableRef);
     }
}
```

2. Update GameManager:
Replace Firebase imports with DatabaseService.
Modify getTableState:
```typescript  
private db = new DatabaseService();
async getTableState(): Promise<Table | null> {
  try {
    const table = await this.db.getTable(this.tableId);
    if (!table) console.warn('[GameManager] Table not found');
    return table;
  } catch (error) {
    console.error('[GameManager] Error getting table state:', error);
    throw error;
  }
}
```
Test: Ensure table state loads correctly (e.g., via LobbyView or TablePageClient).

### Step 2: Create `DeckManager`
**Goal**: Manage deck operations (shuffling, dealing cards).  
**Steps**:
1. Create src/services/deckManager.ts
```typescript
import { Deck } from '@/utils/deck';
import { DatabaseService } from './databaseService';
import type { Card } from '@/types/poker';

export class DeckManager {
  private deck = new Deck();
  private db = new DatabaseService();

  reset() {
    this.deck.reset();
    this.deck.shuffle();
  }

  async dealHoleCards(tableId: string, playerId: string): Promise<Card[] | undefined> {
    const cards = this.deck.dealHoleCards();
    if (cards) await this.db.setPlayerCards(tableId, playerId, cards);
    return cards;
  }

  dealFlop(): Card[] | undefined { return this.deck.dealFlop(); }
  dealCard(): Card | undefined { return this.deck.dealCard(); }
}
```

2. Update GameManager:
Move dealCardsToPlayers logic:
```typescript
private deck = new DeckManager();
private async dealCardsToPlayers(activePlayers: Player[]): Promise<void> {
  await Promise.all(activePlayers.map(p => this.deck.dealHoleCards(this.tableId, p.id)));
}
```
Update dealFlop, dealTurn, dealRiver to use deck.dealFlop(), etc.

Test:  Verify card dealing in a new hand (startNewHand).

### Step 3: Create `PlayerManager`
**Goal**: Goal: Manage player state and actions. 
```typescript
import type { Player, Table } from '@/types/poker';

export class PlayerManager {
  private table: Table;

  constructor(table: Table) {
    this.table = table;
  }

  updateTable(table: Table) {
    this.table = table;
  }

  fold(playerId: string) {
    const player = this.table.players.find(p => p.id === playerId);
    if (player) player.hasFolded = true;
  }

  raise(playerId: string, amount: number): number {
    const player = this.table.players.find(p => p.id === playerId);
    if (!player || player.chips < amount) throw new Error('Insufficient chips');
    player.chips -= amount;
    return amount;
  }

  getActiveCount(): number {
    return this.table.players.filter(p => p.isActive && !p.hasFolded && p.chips > 0).length;
  }

  nextDealer(): number {
    let pos = (this.table.dealerPosition + 1) % this.table.players.length;
    while (!this.table.players[pos].isActive || this.table.players[pos].chips <= 0) {
      pos = (pos + 1) % this.table.players.length;
    }
    return pos;
  }
}
```

Update GameManager:

Move handleFold, handleRaise, etc., logic:
```typescript
private players = new PlayerManager(/* initial table */);
private async handleRaise(table: Table, playerId: string, raiseAmount: number) {
  this.players.updateTable(table);
  const additionalBet = this.players.raise(playerId, raiseAmount - (table.roundBets[playerId] || 0));
  table.pot += additionalBet;
  table.currentBet = raiseAmount;
  table.roundBets[playerId] = raiseAmount;
  table.minRaise = raiseAmount * 2;
}
```
Test: Check player actions (fold, raise) in PokerTable.

### Step 4: Create `PhaseManager`
**Goal**: Handle game phases and transitions.
**Steps**:
1. Create src/services/phaseManager.ts
```typescript
import type { Table } from '@/types/poker';

export class PhaseManager {
  private table: Table;

  constructor(table: Table) {
    this.table = table;
  }

  updateTable(table: Table) {
    this.table = table;
  }

  setPhase(phase: Table['phase']) {
    this.table.phase = phase;
  }

  nextPlayer(): number {
    let nextIdx = (this.table.currentPlayerIndex + 1) % this.table.players.length;
    while (!this.table.players[nextIdx].isActive || this.table.players[nextIdx].hasFolded || this.table.players[nextIdx].chips === 0) {
      nextIdx = (nextIdx + 1) % this.table.players.length;
    }
    return nextIdx;
  }
}
```

2. Update GameManager:
Move handlePreflop, handleFlop, etc., logic:
```typescript
private phases = new PhaseManager(/* initial table */);
private async moveToNextPlayer(table: Table, updatedPlayers: Player[]) {
  this.phases.updateTable(table);
  table.players = updatedPlayers;
  if (this.players.getActiveCount(table) === 1) return this.endRound(table, updatedPlayers);
  table.currentPlayerIndex = this.phases.nextPlayer();
  await this.db.updateTable(this.tableId, table);
}
```
Test: Verify phase transitions (e.g., preflop to flop) in a game.

### Step 5: Create `HandEvaluator`
**Goal**: Evaluate hands and determine winners.
**Steps**:
1. Create src/services/handEvaluator.ts
```typescript
import { findBestHand } from '@/utils/handEvaluator';
import { DatabaseService } from './databaseService';
import type { Table, Hand } from '@/types/poker';

export class HandEvaluator {
  private db = new DatabaseService();

  async evaluateHands(table: Table): Promise<Array<{ playerId: string; hand: Hand }>> {
    const activePlayers = table.players.filter(p => p.isActive && !p.hasFolded);
    return Promise.all(activePlayers.map(async p => ({
      playerId: p.id,
      hand: findBestHand(await this.db.getPlayerCards(table.id, p.id) || [], table.communityCards),
    })));
  }

  async getWinners(table: Table): Promise<string[]> {
    const hands = await this.evaluateHands(table);
    const maxValue = Math.max(...hands.map(h => h.hand.value));
    return hands.filter(h => h.hand.value === maxValue).map(h => h.playerId);
  }
}
```

2. Update GameManager:
Move determineWinners logic:
```typescript
private handEvaluator = new HandEvaluator();
private async endRound(table: Table, players: Player[]) {
  const winners = await this.handEvaluator.getWinners(table);
  // ... rest of endRound logic
}
```
Test: Verify winner determination in PokerTable.

### Step 6: Create `GameManager`
**Goal**: Reduce to a coordinator.
**Steps**:
1. Update src/services/gameManager.ts
```typescript
import { getAuth } from 'firebase/auth';
import { DatabaseService } from './databaseService';
import { DeckManager } from './deckManager';
import { PlayerManager } from './playerManager';
import { PhaseManager } from './phaseManager';
import { HandEvaluator } from './handEvaluator';
import type { Table, Player } from '@/types/poker';

export class GameManager {
  private db = new DatabaseService();
  private deck = new DeckManager();
  private players: PlayerManager;
  private phases: PhaseManager;
  private handEvaluator = new HandEvaluator();
  private tableId: string;

  constructor(tableId: string) {
    this.tableId = tableId;
  }

  async startNewHand() {
    const table = await this.db.getTable(this.tableId);
    if (!table || this.players.getActiveCount(table) < 2) return;
    this.deck.reset();
    this.players = new PlayerManager(table);
    this.phases = new PhaseManager(table);
    this.players.resetPlayers(table);
    this.phases.setPhase('preflop');
    await this.initializeRound(table);
    await this.db.updateTable(this.tableId, {
      dealerPosition: this.players.nextDealer(),
      isHandInProgress: true,
    });
  }

  async handlePlayerAction(playerId: string, action: string, amount?: number) {
    const table = await this.db.getTable(this.tableId);
    this.players.updateTable(table);
    this.phases.updateTable(table);
    switch (action) {
      case 'fold': await this.handleFold(table, playerId); break;
      case 'raise': await this.handleRaise(table, playerId, amount!); break;
      // ... other actions
    }
    await this.db.updateTable(this.tableId, table);
  }

  // ... other methods like initialize, createTable
}
```

2. Update LobbyView, TablePageClient, etc. to use new GameManager.

Test: Run a full game cycle (start, play, end).

**Order:**
- DatabaseService (foundation)
- DeckManager
- PlayerManager
- PhaseManager
- HandEvaluator
- GameManager (final coordination)

**Testing:** After each step, test via PokerTable or unit tests (src/utils/__tests__/gameManager.test.ts).

**Notes for Implementation**
- Incremental Commits: Commit after each module to track progress (e.g., git commit -m "Add DatabaseService").
- Error Handling: Preserve existing logging but consider moving to a Logger class later.
- Dependencies: Ensure src/utils/deck.ts and src/utils/handEvaluator.ts are imported correctly.





