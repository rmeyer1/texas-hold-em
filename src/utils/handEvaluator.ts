import { Card, Hand, HandRank } from '../types/poker';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';

// Helper function to convert rank to numeric value for comparison
const getRankValue = (rank: string): number => {
  const values: { [key: string]: number } = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14,
  };
  return values[rank];
};

// Sort cards by rank in descending order
const sortByRank = (cards: Card[]): Card[] => {
  return [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
};

// Check for flush
const isFlush = (cards: Card[]): boolean => {
  const suit = cards[0].suit;
  return cards.every((card) => card.suit === suit);
};

// Check for straight
const isStraight = (cards: Card[]): boolean => {
  const sortedCards = sortByRank(cards);
  const ranks = sortedCards.map((card) => getRankValue(card.rank));

  // Check for Ace-low straight (A,2,3,4,5)
  if (ranks[0] === 14 && ranks[1] === 5) {
    ranks.shift();
    ranks.push(1);
  }

  for (let i = 0; i < ranks.length - 1; i++) {
    if (ranks[i] - ranks[i + 1] !== 1) {
      return false;
    }
  }
  return true;
};

// Get frequency map of card ranks
const getFrequencyMap = (cards: Card[]): Map<string, number> => {
  const frequencyMap = new Map<string, number>();
  cards.forEach((card) => {
    frequencyMap.set(card.rank, (frequencyMap.get(card.rank) || 0) + 1);
  });
  return frequencyMap;
};

// Helper function to calculate kicker value
const calculateKickerValue = (cards: Card[], excludeRanks: string[] = []): number => {
  const kickers = cards
    .filter((card) => !excludeRanks.includes(card.rank))
    .map((card) => getRankValue(card.rank));
  
  // Calculate value with diminishing significance for each kicker
  return kickers.reduce((acc, val, index) => acc + val * Math.pow(0.01, index), 0);
};

export const evaluateHand = (cards: Card[]): Hand => {
  if (cards.length !== 5) {
    throw new Error('Hand must contain exactly 5 cards');
  }

  const sortedCards = sortByRank(cards);
  const isHandFlush = isFlush(cards);
  const isHandStraight = isStraight(cards);
  const frequencyMap = getFrequencyMap(cards);
  const frequencies = Array.from(frequencyMap.values()).sort((a, b) => b - a);

  // Royal Flush
  if (isHandFlush && isHandStraight && sortedCards[0].rank === 'A') {
    return {
      cards: sortedCards,
      rank: 'Royal Flush',
      value: 1000,
      description: `Royal Flush of ${sortedCards[0].suit}`,
    };
  }

  // Straight Flush
  if (isHandFlush && isHandStraight) {
    return {
      cards: sortedCards,
      rank: 'Straight Flush',
      value: 900 + getRankValue(sortedCards[0].rank),
      description: `Straight Flush, ${sortedCards[0].rank} high`,
    };
  }

  // Four of a Kind
  if (frequencies[0] === 4) {
    const fourOfAKindRank = Array.from(frequencyMap.entries()).find(
      ([_, freq]) => freq === 4
    )![0];
    const kickerValue = calculateKickerValue(sortedCards, [fourOfAKindRank]);
    return {
      cards: sortedCards,
      rank: 'Four of a Kind',
      value: 800 + getRankValue(fourOfAKindRank) + kickerValue,
      description: `Four of a Kind, ${fourOfAKindRank}s`,
    };
  }

  // Full House
  if (frequencies[0] === 3 && frequencies[1] === 2) {
    const threeOfAKindRank = Array.from(frequencyMap.entries()).find(
      ([_, freq]) => freq === 3
    )![0];
    const pairRank = Array.from(frequencyMap.entries()).find(([_, freq]) => freq === 2)![0];
    return {
      cards: sortedCards,
      rank: 'Full House',
      value: 700 + getRankValue(threeOfAKindRank) + getRankValue(pairRank) * 0.1,
      description: `Full House, ${threeOfAKindRank}s over ${pairRank}s`,
    };
  }

  // Flush
  if (isHandFlush) {
    const kickerValue = calculateKickerValue(sortedCards);
    return {
      cards: sortedCards,
      rank: 'Flush',
      value: 600 + kickerValue,
      description: `Flush, ${sortedCards[0].rank} high`,
    };
  }

  // Straight
  if (isHandStraight) {
    return {
      cards: sortedCards,
      rank: 'Straight',
      value: 500 + getRankValue(sortedCards[0].rank),
      description: `Straight, ${sortedCards[0].rank} high`,
    };
  }

  // Three of a Kind
  if (frequencies[0] === 3) {
    const threeOfAKindRank = Array.from(frequencyMap.entries()).find(
      ([_, freq]) => freq === 3
    )![0];
    const kickerValue = calculateKickerValue(sortedCards, [threeOfAKindRank]);
    return {
      cards: sortedCards,
      rank: 'Three of a Kind',
      value: 400 + getRankValue(threeOfAKindRank) + kickerValue,
      description: `Three of a Kind, ${threeOfAKindRank}s`,
    };
  }

  // Two Pair
  if (frequencies[0] === 2 && frequencies[1] === 2) {
    const pairs = Array.from(frequencyMap.entries())
      .filter(([_, freq]) => freq === 2)
      .map(([rank, _]) => rank)
      .sort((a, b) => getRankValue(b) - getRankValue(a));
    const kickerValue = calculateKickerValue(sortedCards, pairs);
    return {
      cards: sortedCards,
      rank: 'Two Pair',
      value: 300 + getRankValue(pairs[0]) + getRankValue(pairs[1]) * 0.1 + kickerValue,
      description: `Two Pair, ${pairs[0]}s and ${pairs[1]}s`,
    };
  }

  // One Pair
  if (frequencies[0] === 2) {
    const pairRank = Array.from(frequencyMap.entries()).find(([_, freq]) => freq === 2)![0];
    const kickerValue = calculateKickerValue(sortedCards, [pairRank]);
    return {
      cards: sortedCards,
      rank: 'One Pair',
      value: 200 + getRankValue(pairRank) + kickerValue,
      description: `Pair of ${pairRank}s`,
    };
  }

  // High Card
  const kickerValue = calculateKickerValue(sortedCards);
  return {
    cards: sortedCards,
    rank: 'High Card',
    value: 100 + kickerValue,
    description: `High Card, ${sortedCards[0].rank}`,
  };
};

export const findBestHand = (holeCards: Card[], communityCards: Card[]): Hand => {
  // Ensure communityCards is initialized
  if (!communityCards || !Array.isArray(communityCards)) {
    logger.error('[HandEvaluator] Community cards not properly initialized:', {
      timestamp: new Date().toISOString(),
      communityCards: serializeError(communityCards),
    });
    communityCards = [];
  }

  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    throw new Error('Not enough cards to form a hand');
  }

  let bestHand: Hand | null = null;

  // Generate all possible 5-card combinations
  const combinations: Card[][] = [];
  const generateCombinations = (start: number, current: Card[]): void => {
    if (current.length === 5) {
      combinations.push([...current]);
      return;
    }
    for (let i = start; i < allCards.length; i++) {
      current.push(allCards[i]);
      generateCombinations(i + 1, current);
      current.pop();
    }
  };

  generateCombinations(0, []);

  // Evaluate each combination and find the best hand
  combinations.forEach((cards) => {
    const hand = evaluateHand(cards);
    if (!bestHand || hand.value > bestHand.value) {
      bestHand = hand;
    }
  });

  if (!bestHand) {
    throw new Error('Could not evaluate any valid hands');
  }

  return bestHand;
}; 