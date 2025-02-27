export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

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
  value: number; // Numerical value for comparing hands of the same rank
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
  name?: string; // Table name provided by the creator
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
  lastBettor: string | null; // ID of the last player who bet or raised in the current phase
  gameStarted?: boolean; // Tracks whether the game has been manually started
  isPrivate: boolean; // Whether the table requires a password to join
  password: string | null; // Password required to join if isPrivate is true
  maxPlayers?: number; // Maximum number of players allowed at the table
  winners?: string[] | null; // New: for endRound
  winningAmount?: number | null; // New: for endRound
  nextHandScheduled?: boolean; // Flag to track if a new hand is scheduled to start
  handId?: string; // Unique identifier for each hand to track hand changes
} 