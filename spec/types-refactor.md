# Types Refactoring

## Card Types

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
    }

## Hand Evaluation Types

export type HandRank =
  | 'Royal Flush'
  | 'Straight Flush'
  | 'Four of a Kind'
  | 'Full House'
  | 'Flush'
  | 'Straight'
  | 'Three of a Kind'
  | 'Two Pair'
  | 'One Pair'
  | 'High Card';

export interface Hand {
  cards: Card[];
  rank: HandRank;
  value: number;
  description: string;
}

export interface PrivatePlayerData {
  holeCards: Card[];
  lastUpdated: number;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  position: number;
  isActive: boolean;
  hasFolded: boolean;
  cards?: Card[]; // Optional: for in-memory use, aligns with startNewHand
}

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise'; // New: for handlePlayerAction

export interface Table {
  id: string;
  name?: string;
  players: Player[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  dealerPosition: number;
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  currentPlayerIndex: number;
  smallBlind: number;
  bigBlind: number;
  lastActionTimestamp: number;
  bettingRound: 'small_blind' | 'big_blind' | 'first_round' | 'betting';
  roundBets: { [playerId: string]: number };
  minRaise: number;
  turnTimeLimit: number;
  isHandInProgress: boolean;
  activePlayerCount: number;
  lastAction: string | null;
  lastActivePlayer: string | null;
  gameStarted?: boolean;
  isPrivate: boolean;
  password: string | null;
  maxPlayers?: number;
  winners?: string[]; // New: for endRound
  winningAmount?: number; // New: for endRound
}

## Rationale for Updates

cards?: Card[] in Player:
Why: startNewHand resets cards on Player objects, implying it’s part of the in-memory state. However, PrivatePlayerData stores this in Firebase. Adding cards as optional aligns the type with current usage while keeping persistence separate.
Impact: PlayerManager and GameManager can manipulate cards locally, syncing to DatabaseService as needed.
PlayerAction Type:
Why: Explicitly typing actions improves code safety and autocompletion in handlePlayerAction.
Impact: Update GameManager’s handlePlayerAction signature
```typescript
async handlePlayerAction(playerId: string, action: PlayerAction, amount?: number) {

}
```

winners and winningAmount in Table:
Why: endRound sets these in Firebase but they’re not typed, risking runtime errors.
Impact: HandEvaluator and GameManager can rely on these fields being part of the table state.

## Modules Affected

DeckManager: No changes needed—uses Card and interacts with DatabaseService.
PlayerManager: cards in Player supports local state updates (e.g., resetPlayers).
PhaseManager: No changes—relies on Table.phase and Player fields.
HandEvaluator: No changes—uses Card, Hand, and Table.communityCards.
DatabaseService: No changes—handles Table and PrivatePlayerData as-is.
GameManager: Updates to use PlayerAction, winners, and winningAmount.

## Implementation Notes

Backward Compatibility: These changes are additive (optional fields), so existing code won’t break.
Step Integration: Apply these updates in Step 1 (before DatabaseService) to ensure type consistency throughout.
Testing: After updating, test startNewHand (for cards), handlePlayerAction (for PlayerAction), and endRound (for winners/winningAmount).

## Final Thoughts
The existing types are mostly sufficient, but adding cards to Player, PlayerAction, and winners/winningAmount to Table aligns src/types/poker.ts with the refactoring’s needs. These tweaks enhance type safety and clarity without major disruption. 
