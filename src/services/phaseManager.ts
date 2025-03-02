import type { Table } from '@/types/poker';
import { PlayerManager } from './playerManager';
import { BettingManager } from './bettingManager';
import logger from '@/utils/logger';

export class PhaseManager {
  private tableId: string;
  private playerManager: PlayerManager;
  private bettingManager: BettingManager;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.playerManager = new PlayerManager(tableId);
    this.bettingManager = new BettingManager(tableId);
  }

  /**
   * Set the current phase of the game
   */
  setPhase(table: Table, phase: Table['phase']): void {
    table.phase = phase;
  }

  /**
   * Get the next phase based on the current phase
   */
  getNextPhase(currentPhase: Table['phase']): Table['phase'] {
    switch (currentPhase) {
      case 'waiting':
        return 'preflop';
      case 'preflop':
        return 'flop';
      case 'flop':
        return 'turn';
      case 'turn':
        return 'river';
      case 'river':
        return 'showdown';
      case 'showdown':
        return 'waiting';
      default:
        logger.warn(`[PhaseManager] Unknown phase: ${currentPhase}`);
        return 'waiting';
    }
  }

  /**
   * Prepare table for the next phase
   */
  prepareNextPhase(table: Table): Partial<Table> {
    const nextPhase = this.getNextPhase(table.phase);
    
    // Reset betting for the new phase
    const updates: Partial<Table> = {
      phase: nextPhase,
      roundBets: {},
      currentBet: 0,
      minRaise: table.bigBlind * 2,
      lastBettor: null, // Reset the last bettor for the new phase
    };

    // If moving to showdown, no need to set current player
    if (nextPhase !== 'showdown') {
      // Find the first active player after the dealer
      const firstToAct = this.getFirstToActIndex(table);
      updates.currentPlayerIndex = firstToAct;
    }

    return updates;
  }

  /**
   * Get the index of the first player to act in the current phase
   */
  getFirstToActIndex(table: Table): number {
    const { players, dealerPosition } = table;
    
    // Get active players
    const activePlayers = this.playerManager.getActivePlayers(table);
    
    // If no active players, return dealer position
    if (activePlayers.length === 0) {
      logger.warn('[PhaseManager] No active players found for first to act');
      return dealerPosition;
    }
    
    // In heads-up (2 players), dealer acts first preflop, non-dealer acts first postflop
    if (this.playerManager.getActiveCount(table) === 2) {
      if (table.phase === 'preflop') {
        // Dealer acts first preflop in heads-up
        return dealerPosition;
      } else {
        // Non-dealer acts first postflop in heads-up
        return this.playerManager.getNextActivePlayerIndex(table, dealerPosition);
      }
    }
    
    // With more than 2 players, first active player after dealer acts first
    let firstToAct = (dealerPosition + 1) % players.length;
    
    // Find first active player with chips
    while (!players[firstToAct].isActive || players[firstToAct].hasFolded || players[firstToAct].chips === 0) {
      firstToAct = (firstToAct + 1) % players.length;
      
      // Safety check to prevent infinite loop
      if (firstToAct === dealerPosition) {
        logger.warn('[PhaseManager] No active players found for first to act');
        return dealerPosition;
      }
    }
    
    return firstToAct;
  }

  /**
   * Check if the current phase is complete and should move to the next phase
   */
  shouldAdvancePhase(table: Table): boolean {
    try {
      // Log detailed table state
      logger.log('[PhaseManager] shouldAdvancePhase detailed state:', { 
        phase: table.phase,
        currentPlayerIndex: table.currentPlayerIndex,
        dealerPosition: table.dealerPosition,
        lastAction: table.lastAction,
        lastActivePlayer: table.lastActivePlayer,
        lastBettor: table.lastBettor,
        currentBet: table.currentBet,
        pot: table.pot,
        activePlayerCount: this.playerManager.getActiveCount(table),
        players: table.players.map(p => ({
          id: p.id,
          position: p.position,
          isActive: p.isActive,
          hasFolded: p.hasFolded,
          chips: p.chips,
          bet: table.roundBets?.[p.id] || 0
        })),
        roundBets: table.roundBets || {}
      });

      // If only one active player remains, move to showdown
      const activeCount = this.playerManager.getActiveCount(table);
      const isRoundComplete = this.bettingManager.isRoundComplete(table);
      
      logger.log('[PhaseManager] shouldAdvancePhase checking:', { 
        activeCount, 
        isRoundComplete,
        currentPlayerIndex: table.currentPlayerIndex,
        lastAction: table.lastAction
      });
      
      if (activeCount <= 1) {
        logger.log('[PhaseManager] shouldAdvancePhase: Only one active player left, advancing phase');
        return true;
      }
      
      // Check if all players have acted and bets are equal
      const result = isRoundComplete;
      logger.log('[PhaseManager] shouldAdvancePhase result:', { result });
      return result;
    } catch (error) {
      // If an error occurs, log it but don't advance the phase
      logger.error('[PhaseManager] Error in shouldAdvancePhase:', { 
        error: typeof error === 'object' ? JSON.stringify(error) : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      console.error('[PhaseManager] Error in shouldAdvancePhase:', error);
      return false;
    }
  }
} 