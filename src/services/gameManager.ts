import { ref, set, update, onValue, off, get } from 'firebase/database';
import { database } from './firebase';
import type { Table, Player } from '@/types/poker';

export class GameManager {
  private tableRef;
  private static readonly TURN_TIME_LIMIT = 45000; // 45 seconds in milliseconds
  private static readonly DEFAULT_SMALL_BLIND = 10;
  private static readonly DEFAULT_BIG_BLIND = 20;

  constructor(tableId: string) {
    this.tableRef = ref(database, `tables/${tableId}`);
  }

  private async getTable(): Promise<Table> {
    const snapshot = await get(this.tableRef);
    return snapshot.val() as Table;
  }

  public async initializeRound(): Promise<void> {
    const table = await this.getTable();
    const activePlayers = table.players.filter(p => p.isActive && p.chips > 0);
    
    if (activePlayers.length < 2) {
      throw new Error('Not enough players to start a round');
    }

    // Rotate dealer position
    const newDealerPosition = (table.dealerPosition + 1) % activePlayers.length;
    const smallBlindPos = (newDealerPosition + 1) % activePlayers.length;
    const bigBlindPos = (newDealerPosition + 2) % activePlayers.length;

    // Reset table state for new round
    const updates: Partial<Table> = {
      dealerPosition: newDealerPosition,
      currentPlayerIndex: (bigBlindPos + 1) % activePlayers.length,
      phase: 'preflop',
      pot: 0,
      currentBet: table.bigBlind || GameManager.DEFAULT_BIG_BLIND,
      communityCards: [],
      bettingRound: 'small_blind',
      lastActionTimestamp: Date.now(),
      smallBlind: table.smallBlind || GameManager.DEFAULT_SMALL_BLIND,
      bigBlind: table.bigBlind || GameManager.DEFAULT_BIG_BLIND,
      roundBets: {},
      minRaise: table.bigBlind || GameManager.DEFAULT_BIG_BLIND,
      turnTimeLimit: GameManager.TURN_TIME_LIMIT,
    };

    // Post blinds
    const smallBlindPlayer = activePlayers[smallBlindPos];
    const bigBlindPlayer = activePlayers[bigBlindPos];
    
    updates.roundBets = {
      [smallBlindPlayer.id]: updates.smallBlind!,
      [bigBlindPlayer.id]: updates.bigBlind!,
    };

    // Update players' chips
    const updatedPlayers = table.players.map(player => {
      if (player.id === smallBlindPlayer.id) {
        return { ...player, chips: player.chips - updates.smallBlind! };
      }
      if (player.id === bigBlindPlayer.id) {
        return { ...player, chips: player.chips - updates.bigBlind! };
      }
      return { ...player, hasFolded: false };
    });

    updates.players = updatedPlayers;
    await update(this.tableRef, updates);
  }

  public async handlePlayerAction(
    playerId: string, 
    action: 'fold' | 'call' | 'raise',
    raiseAmount?: number
  ): Promise<void> {
    const table = await this.getTable();
    const currentPlayer = table.players[table.currentPlayerIndex];
    
    if (currentPlayer.id !== playerId) {
      throw new Error('Not your turn');
    }

    if (Date.now() - table.lastActionTimestamp > table.turnTimeLimit) {
      // Auto-fold on timeout
      await this.handleFold(playerId);
      return;
    }

    switch (action) {
      case 'fold':
        await this.handleFold(playerId);
        break;
      case 'call':
        await this.handleCall(playerId);
        break;
      case 'raise':
        if (!raiseAmount || raiseAmount < table.minRaise) {
          throw new Error('Invalid raise amount');
        }
        await this.handleRaise(playerId, raiseAmount);
        break;
    }
  }

  private async handleFold(playerId: string): Promise<void> {
    const table = await this.getTable();
    const updatedPlayers = table.players.map(player =>
      player.id === playerId ? { ...player, hasFolded: true } : player
    );

    await this.moveToNextPlayer(table, updatedPlayers);
  }

  private async handleCall(playerId: string): Promise<void> {
    const table = await this.getTable();
    const player = table.players.find(p => p.id === playerId)!;
    const callAmount = table.currentBet - (table.roundBets[playerId] || 0);
    
    if (callAmount > player.chips) {
      throw new Error('Not enough chips to call');
    }

    const updatedPlayers = table.players.map(p =>
      p.id === playerId ? { ...p, chips: p.chips - callAmount } : p
    );

    const roundBets = {
      ...table.roundBets,
      [playerId]: (table.roundBets[playerId] || 0) + callAmount,
    };

    await this.moveToNextPlayer(table, updatedPlayers, roundBets);
  }

  private async handleRaise(playerId: string, raiseAmount: number): Promise<void> {
    const table = await this.getTable();
    const player = table.players.find(p => p.id === playerId)!;
    const totalBet = table.currentBet + raiseAmount;
    
    if (totalBet - (table.roundBets[playerId] || 0) > player.chips) {
      throw new Error('Not enough chips to raise');
    }

    const updatedPlayers = table.players.map(p =>
      p.id === playerId ? { ...p, chips: p.chips - (totalBet - (table.roundBets[playerId] || 0)) } : p
    );

    const roundBets = {
      ...table.roundBets,
      [playerId]: totalBet,
    };

    await this.moveToNextPlayer(
      table,
      updatedPlayers,
      roundBets,
      totalBet,
      raiseAmount
    );
  }

  private async moveToNextPlayer(
    table: Table,
    updatedPlayers: Player[],
    roundBets?: { [playerId: string]: number },
    newCurrentBet?: number,
    newMinRaise?: number
  ): Promise<void> {
    const activePlayers = updatedPlayers.filter(p => p.isActive && !p.hasFolded && p.chips > 0);
    
    if (activePlayers.length === 1) {
      // Round over - one player remains
      await this.endRound(table, updatedPlayers, activePlayers[0]);
      return;
    }

    let nextPlayerIndex = (table.currentPlayerIndex + 1) % table.players.length;
    while (
      !table.players[nextPlayerIndex].isActive ||
      table.players[nextPlayerIndex].hasFolded ||
      table.players[nextPlayerIndex].chips === 0
    ) {
      nextPlayerIndex = (nextPlayerIndex + 1) % table.players.length;
    }

    const updates: Partial<Table> = {
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      lastActionTimestamp: Date.now(),
    };

    if (roundBets) {
      updates.roundBets = roundBets;
    }
    if (newCurrentBet !== undefined) {
      updates.currentBet = newCurrentBet;
    }
    if (newMinRaise !== undefined) {
      updates.minRaise = newMinRaise;
    }

    // Check if betting round is complete
    const allPlayersActed = this.checkAllPlayersActed(table, updates);
    if (allPlayersActed) {
      await this.moveToNextPhase(table, updates);
    } else {
      await update(this.tableRef, updates);
    }
  }

  private checkAllPlayersActed(table: Table, updates: Partial<Table>): boolean {
    const roundBets = updates.roundBets || table.roundBets;
    const currentBet = updates.currentBet || table.currentBet;
    
    return table.players
      .filter(p => p.isActive && !p.hasFolded && p.chips > 0)
      .every(p => roundBets[p.id] === currentBet || p.chips === 0);
  }

  private async moveToNextPhase(table: Table, updates: Partial<Table>): Promise<void> {
    const phases: Array<Table['phase']> = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const currentPhaseIndex = phases.indexOf(table.phase);
    
    if (currentPhaseIndex === -1 || currentPhaseIndex === phases.length - 1) {
      await this.endRound(table, updates.players || table.players);
      return;
    }

    updates.phase = phases[currentPhaseIndex + 1];
    updates.currentBet = 0;
    updates.roundBets = {};
    updates.minRaise = table.bigBlind;
    
    // Reset betting to player after dealer
    const activePlayers = (updates.players || table.players)
      .filter(p => p.isActive && !p.hasFolded && p.chips > 0);
    
    if (activePlayers.length > 1) {
      const firstToActIndex = (table.dealerPosition + 1) % activePlayers.length;
      updates.currentPlayerIndex = firstToActIndex;
    }

    await update(this.tableRef, updates);
  }

  private async endRound(table: Table, players: Player[], winner?: Player): Promise<void> {
    // Calculate total pot
    const totalPot = Object.values(table.roundBets).reduce((sum, bet) => sum + bet, 0);

    const updates: Partial<Table> = {
      players: winner
        ? players.map(p =>
            p.id === winner.id ? { ...p, chips: p.chips + totalPot } : p
          )
        : players,
      phase: 'showdown',
      pot: 0,
      currentBet: 0,
      roundBets: {},
    };

    await update(this.tableRef, updates);
  }
} 