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
}

export interface Table {
  id: string;
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
  gameStarted?: boolean; // Tracks whether the game has been manually started
  isPrivate: boolean; // Whether the table requires a password to join
  password: string | null; // Password required to join if isPrivate is true
} 