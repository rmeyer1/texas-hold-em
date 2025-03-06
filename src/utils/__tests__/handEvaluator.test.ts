import { Card } from '../../types/poker';
import { evaluateHand, findBestHand } from '../handEvaluator';

describe('Hand Evaluator', () => {
  describe('evaluateHand', () => {
    it('should correctly identify High Card hands', () => {
      const highCardHand: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'J', suit: 'hearts' },
        { rank: '9', suit: 'diamonds' },
        { rank: '7', suit: 'clubs' },
        { rank: '5', suit: 'spades' },
      ];

      const lowerHighCardHand: Card[] = [
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'diamonds' },
        { rank: '9', suit: 'clubs' },
        { rank: '7', suit: 'spades' },
        { rank: '5', suit: 'hearts' },
      ];

      const result1 = evaluateHand(highCardHand);
      const result2 = evaluateHand(lowerHighCardHand);

      expect(result1.rank).toBe('High Card');
      expect(result2.rank).toBe('High Card');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

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

    it('should rank higher pairs over lower pairs', () => {
      const kingPair: Card[] = [
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
        { rank: '5', suit: 'diamonds' },
        { rank: '4', suit: 'clubs' },
        { rank: '3', suit: 'spades' },
      ];

      const queenPair: Card[] = [
        { rank: 'Q', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: '5', suit: 'spades' },
        { rank: '4', suit: 'diamonds' },
        { rank: '3', suit: 'hearts' },
      ];

      const kingResult = evaluateHand(kingPair);
      const queenResult = evaluateHand(queenPair);

      expect(kingResult.rank).toBe('One Pair');
      expect(queenResult.rank).toBe('One Pair');
      expect(kingResult.value).toBeGreaterThan(queenResult.value);
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

    it('should rank higher two pairs over lower two pairs', () => {
      const acesAndKings: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: '2', suit: 'spades' },
      ];

      const queensAndJacks: Card[] = [
        { rank: 'Q', suit: 'spades' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'diamonds' },
        { rank: 'J', suit: 'clubs' },
        { rank: '3', suit: 'spades' },
      ];

      const result1 = evaluateHand(acesAndKings);
      const result2 = evaluateHand(queensAndJacks);

      expect(result1.rank).toBe('Two Pair');
      expect(result2.rank).toBe('Two Pair');
      expect(result1.value).not.toBe(result2.value);
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

    it('should rank higher three of a kind over lower three of a kind', () => {
      const threeAces: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: '5', suit: 'clubs' },
        { rank: '3', suit: 'spades' },
      ];

      const threeQueens: Card[] = [
        { rank: 'Q', suit: 'spades' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'Q', suit: 'diamonds' },
        { rank: '5', suit: 'clubs' },
        { rank: '3', suit: 'spades' },
      ];

      const result1 = evaluateHand(threeAces);
      const result2 = evaluateHand(threeQueens);

      expect(result1.rank).toBe('Three of a Kind');
      expect(result2.rank).toBe('Three of a Kind');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should identify a Straight correctly', () => {
      const straight: Card[] = [
        { rank: '10', suit: 'spades' },
        { rank: '9', suit: 'hearts' },
        { rank: '8', suit: 'diamonds' },
        { rank: '7', suit: 'clubs' },
        { rank: '6', suit: 'spades' },
      ];

      const notAStraight: Card[] = [
        { rank: '10', suit: 'spades' },
        { rank: '9', suit: 'hearts' },
        { rank: '8', suit: 'diamonds' },
        { rank: '7', suit: 'clubs' },
        { rank: '5', suit: 'spades' },
      ];

      const result1 = evaluateHand(straight);
      const result2 = evaluateHand(notAStraight);

      expect(result1.rank).toBe('Straight');
      expect(result2.rank).not.toBe('Straight');
    });

    it('should rank higher straights over lower straights', () => {
      const aceStraight: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'diamonds' },
        { rank: 'J', suit: 'clubs' },
        { rank: '10', suit: 'spades' },
      ];

      const kingHighStraight: Card[] = [
        { rank: 'K', suit: 'spades' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'diamonds' },
        { rank: '10', suit: 'clubs' },
        { rank: '9', suit: 'spades' },
      ];

      const result1 = evaluateHand(aceStraight);
      const result2 = evaluateHand(kingHighStraight);

      expect(result1.rank).toBe('Straight');
      expect(result2.rank).toBe('Straight');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should handle Ace-low straight (A-2-3-4-5)', () => {
      const aceLowStraight: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: '2', suit: 'hearts' },
        { rank: '3', suit: 'diamonds' },
        { rank: '4', suit: 'clubs' },
        { rank: '5', suit: 'spades' },
      ];

      const sixHighStraight: Card[] = [
        { rank: '6', suit: 'hearts' },
        { rank: '5', suit: 'diamonds' },
        { rank: '4', suit: 'clubs' },
        { rank: '3', suit: 'spades' },
        { rank: '2', suit: 'hearts' },
      ];

      const result1 = evaluateHand(aceLowStraight);
      const result2 = evaluateHand(sixHighStraight);

      expect(result1.rank).toBe('Straight');
      expect(result2.rank).toBe('Straight');
      
      expect(result1.value).not.toBe(result2.value);
    });

    it('should identify a Flush correctly', () => {
      const flush: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '9', suit: 'hearts' },
        { rank: '7', suit: 'hearts' },
        { rank: '3', suit: 'hearts' },
      ];

      const notAFlush: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '9', suit: 'hearts' },
        { rank: '7', suit: 'hearts' },
        { rank: '3', suit: 'spades' },
      ];

      const result1 = evaluateHand(flush);
      const result2 = evaluateHand(notAFlush);

      expect(result1.rank).toBe('Flush');
      expect(result2.rank).not.toBe('Flush');
    });

    it('should rank higher flushes over lower flushes', () => {
      const aceHighFlush: Card[] = [
        { rank: 'A', suit: 'clubs' },
        { rank: 'J', suit: 'clubs' },
        { rank: '9', suit: 'clubs' },
        { rank: '7', suit: 'clubs' },
        { rank: '3', suit: 'clubs' },
      ];

      const kingHighFlush: Card[] = [
        { rank: 'K', suit: 'clubs' },
        { rank: 'Q', suit: 'clubs' },
        { rank: '9', suit: 'clubs' },
        { rank: '7', suit: 'clubs' },
        { rank: '3', suit: 'clubs' },
      ];

      const result1 = evaluateHand(aceHighFlush);
      const result2 = evaluateHand(kingHighFlush);

      expect(result1.rank).toBe('Flush');
      expect(result2.rank).toBe('Flush');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should identify a Full House correctly', () => {
      const fullHouse: Card[] = [
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: '10', suit: 'clubs' },
        { rank: '10', suit: 'spades' },
      ];

      const threeOfAKind: Card[] = [
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: '10', suit: 'clubs' },
        { rank: '9', suit: 'spades' },
      ];

      const result1 = evaluateHand(fullHouse);
      const result2 = evaluateHand(threeOfAKind);

      expect(result1.rank).toBe('Full House');
      expect(result2.rank).toBe('Three of a Kind');
    });

    it('should rank full houses by three of a kind rank first', () => {
      const acesFullOfKings: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'K', suit: 'clubs' },
        { rank: 'K', suit: 'spades' },
      ];

      const kingsFullOfAces: Card[] = [
        { rank: 'K', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'A', suit: 'spades' },
      ];

      const result1 = evaluateHand(acesFullOfKings);
      const result2 = evaluateHand(kingsFullOfAces);

      expect(result1.rank).toBe('Full House');
      expect(result2.rank).toBe('Full House');
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
        { rank: 'A', suit: 'clubs' },
        { rank: 'Q', suit: 'spades' },
      ];

      const result1 = evaluateHand(hand1);
      const result2 = evaluateHand(hand2);

      expect(result1.rank).toBe('Four of a Kind');
      expect(result2.rank).toBe('Four of a Kind');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should rank higher four of a kind over lower four of a kind', () => {
      const fourAces: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: '2', suit: 'spades' },
      ];

      const fourQueens: Card[] = [
        { rank: 'Q', suit: 'spades' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'Q', suit: 'diamonds' },
        { rank: 'Q', suit: 'clubs' },
        { rank: '2', suit: 'spades' },
      ];

      const result1 = evaluateHand(fourAces);
      const result2 = evaluateHand(fourQueens);

      expect(result1.rank).toBe('Four of a Kind');
      expect(result2.rank).toBe('Four of a Kind');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should identify a Straight Flush correctly', () => {
      const straightFlush: Card[] = [
        { rank: '10', suit: 'diamonds' },
        { rank: '9', suit: 'diamonds' },
        { rank: '8', suit: 'diamonds' },
        { rank: '7', suit: 'diamonds' },
        { rank: '6', suit: 'diamonds' },
      ];

      const regularStraight: Card[] = [
        { rank: '10', suit: 'diamonds' },
        { rank: '9', suit: 'hearts' },
        { rank: '8', suit: 'spades' },
        { rank: '7', suit: 'clubs' },
        { rank: '6', suit: 'diamonds' },
      ];

      const regularFlush: Card[] = [
        { rank: 'A', suit: 'diamonds' },
        { rank: 'J', suit: 'diamonds' },
        { rank: '8', suit: 'diamonds' },
        { rank: '7', suit: 'diamonds' },
        { rank: '3', suit: 'diamonds' },
      ];

      const result1 = evaluateHand(straightFlush);
      const result2 = evaluateHand(regularStraight);
      const result3 = evaluateHand(regularFlush);

      expect(result1.rank).toBe('Straight Flush');
      expect(result2.rank).toBe('Straight');
      expect(result3.rank).toBe('Flush');
    });

    it('should rank higher straight flushes over lower straight flushes', () => {
      const queenHighStraightFlush: Card[] = [
        { rank: 'Q', suit: 'clubs' },
        { rank: 'J', suit: 'clubs' },
        { rank: '10', suit: 'clubs' },
        { rank: '9', suit: 'clubs' },
        { rank: '8', suit: 'clubs' },
      ];

      const tenHighStraightFlush: Card[] = [
        { rank: '10', suit: 'spades' },
        { rank: '9', suit: 'spades' },
        { rank: '8', suit: 'spades' },
        { rank: '7', suit: 'spades' },
        { rank: '6', suit: 'spades' },
      ];

      const result1 = evaluateHand(queenHighStraightFlush);
      const result2 = evaluateHand(tenHighStraightFlush);

      expect(result1.rank).toBe('Straight Flush');
      expect(result2.rank).toBe('Straight Flush');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should identify a Royal Flush correctly', () => {
      const royalFlush: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
      ];

      const straightFlush: Card[] = [
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
        { rank: '9', suit: 'hearts' },
      ];

      const result1 = evaluateHand(royalFlush);
      const result2 = evaluateHand(straightFlush);

      expect(result1.rank).toBe('Royal Flush');
      expect(result2.rank).toBe('Straight Flush');
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

      expect(result1.rank).toBe('One Pair');
      expect(result2.rank).toBe('One Pair');
      expect(result1.value).toBeGreaterThan(result2.value);
    });

    it('should find three of a kind when appropriate', () => {
      const holeCards: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
      ];

      const communityCards: Card[] = [
        { rank: 'A', suit: 'diamonds' },
        { rank: '5', suit: 'clubs' },
        { rank: '7', suit: 'hearts' },
        { rank: '9', suit: 'spades' },
        { rank: '2', suit: 'diamonds' },
      ];

      const result = findBestHand(holeCards, communityCards);

      expect(result.rank).toBe('Three of a Kind');
    });

    it('should find a flush using hole cards and community cards', () => {
      const holeCards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
      ];

      const communityCards: Card[] = [
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '9', suit: 'hearts' },
        { rank: '7', suit: 'diamonds' },
        { rank: '2', suit: 'clubs' },
      ];

      const result = findBestHand(holeCards, communityCards);

      expect(result.rank).toBe('Flush');
    });

    it('should find a straight using hole cards and community cards', () => {
      const holeCards: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ];

      const communityCards: Card[] = [
        { rank: 'Q', suit: 'clubs' },
        { rank: 'J', suit: 'diamonds' },
        { rank: '10', suit: 'hearts' },
        { rank: '4', suit: 'spades' },
        { rank: '2', suit: 'clubs' },
      ];

      const result = findBestHand(holeCards, communityCards);

      expect(result.rank).toBe('Straight');
    });

    it('should find a full house using hole cards and community cards', () => {
      const holeCards: Card[] = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
      ];

      const communityCards: Card[] = [
        { rank: 'K', suit: 'clubs' },
        { rank: 'K', suit: 'diamonds' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'Q', suit: 'spades' },
        { rank: 'J', suit: 'clubs' },
      ];

      const result = findBestHand(holeCards, communityCards);

      expect(result.rank).toBe('Full House');
    });

    it('should find the best hand from 7 cards correctly', () => {
      const holeCards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
      ];

      const communityCards: Card[] = [
        { rank: 'Q', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: '10', suit: 'hearts' },
        { rank: '9', suit: 'spades' },
        { rank: '8', suit: 'clubs' },
      ];

      const result = findBestHand(holeCards, communityCards);

      expect(result.rank).toBe('Royal Flush');
    });

    it('should handle community cards only making a better hand', () => {
      const holeCards: Card[] = [
        { rank: '2', suit: 'spades' },
        { rank: '3', suit: 'hearts' },
      ];

      const communityCards: Card[] = [
        { rank: 'A', suit: 'hearts' },
        { rank: 'A', suit: 'diamonds' },
        { rank: 'A', suit: 'clubs' },
        { rank: 'K', suit: 'hearts' },
        { rank: 'K', suit: 'diamonds' },
      ];

      const result = findBestHand(holeCards, communityCards);

      expect(result.rank).toBe('Full House');
    });
  });
}); 