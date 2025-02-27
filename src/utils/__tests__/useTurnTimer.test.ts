import { renderHook, act } from '@testing-library/react';
import { useTurnTimer } from '@/hooks/useTurnTimer';
import type { Table, Player, Card } from '@/types/poker';

interface Props {
    table: Table | null;
  }

type Phase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
type BettingRound = 'small_blind' | 'big_blind' | 'first_round' | 'betting';

describe('useTurnTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const phase = 'preflop' as const;
  const bettingRound = 'first_round' as const;
  
  const mockTable = {
    id: 'test-table',
    players: [] as Player[],
    communityCards: [] as Card[],
    pot: 0,
    currentBet: 0,
    dealerPosition: 0,
    currentPlayerIndex: 1,
    smallBlind: 10,
    bigBlind: 20,
    turnTimeLimit: 30000, // 30 seconds
    lastActionTimestamp: Date.now(),
    phase: 'preflop' as const,
    bettingRound: 'first_round' as const,
    roundBets: {},
    minRaise: 20
  } as Table;

  it('should initialize with correct values', () => {
    const { result } = renderHook(() => useTurnTimer(mockTable, true));
    
    expect(result.current.timeLeft).toBe(30);
    expect(result.current.progress).toBe(100);
  });

  it('should update timer correctly', () => {
    const { result } = renderHook(() => useTurnTimer(mockTable, true));

    // Advance timer by 10 seconds
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.timeLeft).toBe(20);
    expect(result.current.progress).toBe(66.66666666666667);
  });

  it('should reset when phase changes', () => {
    const { result, rerender } = renderHook(
      (props) => useTurnTimer(props.table, true),
      {
        initialProps: { table: mockTable },
      }
    );

    // Advance timer by 10 seconds
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Change phase
    const updatedTable = {
      ...mockTable,
      phase: 'FLOP',
      lastActionTimestamp: Date.now(),
    };

    rerender({ table: updatedTable });

    expect(result.current.timeLeft).toBe(30);
    expect(result.current.progress).toBe(100);
  });

  it('should reset when lastActionTimestamp updates', () => {
    const { result, rerender } = renderHook(
      (props) => useTurnTimer(props.table, true),
      {
        initialProps: { table: mockTable },
      }
    );

    // Advance timer by 10 seconds
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Update lastActionTimestamp
    const updatedTable = {
      ...mockTable,
      lastActionTimestamp: Date.now(),
    };

    rerender({ table: updatedTable });

    expect(result.current.timeLeft).toBe(30);
    expect(result.current.progress).toBe(100);
  });

  it('should handle null table', () => {
    const { result } = renderHook(() => useTurnTimer(null, true));

    expect(result.current.timeLeft).toBe(0);
    expect(result.current.progress).toBe(100);
  });
}); 