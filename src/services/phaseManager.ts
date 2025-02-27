import type { Table } from '@/types/poker';
import { PlayerManager } from './playerManager';
import logger from '@/utils/logger';

export class PhaseManager {
  private tableId: string;
  private playerManager: PlayerManager;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.playerManager = new PlayerManager(tableId);
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
    // If only one active player remains, move to showdown
    if (this.playerManager.getActiveCount(table) <= 1) {
      return true;
    }
    
    // Check if all players have acted and bets are equal
    return this.playerManager.haveAllPlayersActed(table);
  }

  /**
   * Initialize the betting round for the current phase
   */
  initializeBettingRound(table: Table): void {
    // Reset betting for the new round
    table.roundBets = {}; // Initialize as empty object
    table.currentBet = 0;
    table.minRaise = table.bigBlind * 2;
    
    // Set the first player to act
    table.currentPlayerIndex = this.getFirstToActIndex(table);
  }
} 