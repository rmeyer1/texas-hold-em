import { Card } from '../../types/poker';
import { evaluateHand, findBestHand } from '../handEvaluator';

describe('Hand Evaluator', () => {
  describe('evaluateHand', () => {
    it('should handle kickers correctly for One Pair', () => {
      const hand1: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: 'J', suit: 'spades' },
      ];

      const hand2: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: '10', suit: 'spades' },
      ];

      const result1 = evaluateHand(hand1);
      const result2 = evaluateHand(hand2);

      expect(result1.rank).toBe('One Pair');
      expect(result2.rank).toBe('One Pair');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should handle kickers correctly for Two Pair', () => {
      const hand1: Card[] = [
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: 'A', suit: 'spades' },
      ];

      const hand2: Card[] = [
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'Q', suit: 'spades' },
        { rank: '10', suit: 'clubs' },
      ];

      const result1 = evaluateHand(hand1);
      const result2 = evaluateHand(hand2);

      expect(result1.rank).toBe('Two Pair');
      expect(result2.rank).toBe('Two Pair');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should handle kickers correctly for Three of a Kind', () => {
      const hand1: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: 'Q', suit: 'spades' },
      ];

      const hand2: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'J', suit: 'spades' },
        { rank: '10', suit: 'clubs' },
      ];

      const result1 = evaluateHand(hand1);
      const result2 = evaluateHand(hand2);

      expect(result1.rank).toBe('Three of a Kind');
      expect(result2.rank).toBe('Three of a Kind');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should handle kickers correctly for Four of a Kind', () => {
      const hand1: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'K', suit: 'spades' },
      ];

      const hand2: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'spades' },
        { rank: 'Q', suit: 'clubs' },
      ];

      const result1 = evaluateHand(hand1);
      const result2 = evaluateHand(hand2);

      expect(result1.rank).toBe('Four of a Kind');
      expect(result2.rank).toBe('Four of a Kind');
      expect(result1.value).toBeGreaterThan(result2.value);
    });
  });

  describe('findBestHand', () => {
    it('should handle kickers correctly when comparing hole cards with same pair', () => {
      const holeCards1: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'spades' },
      ];

      const holeCards2: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'Q', suit: 'diamonds' },
      ];

      const communityCards: Card[] = [
        { rank: '10', suit: 'clubs' },
        { rank: '7', suit: 'diamonds' },
        { rank: '4', suit: 'spades' },
        { rank: 'A', suit: 'diamonds' },
        { rank: '2', suit: 'hearts' },
      ];

      const result1 = findBestHand(holeCards1, communityCards);
      const result2 = findBestHand(holeCards2, communityCards);

      expect(result1.rank).toBe('Three of a Kind');
      expect(result2.rank).toBe('Three of a Kind');
      expect(result1.value).toBeGreaterThan(result2.value);
    });
  });
}); 