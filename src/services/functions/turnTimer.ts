import { onSchedule } from 'firebase-functions/v2/scheduler';
import { database } from '../firebase';
import type { Table } from '@/types/poker';
import { ref, get, update } from 'firebase/database';

export const checkTurnTimeout = onSchedule('* * * * *', async (event) => {
  const tablesRef = ref(database, 'tables');
  const snapshot = await get(tablesRef);
  const tables = snapshot.val() as { [key: string]: Table };

  if (!tables) return;

  const now = Date.now();
  const updates: { [path: string]: any } = {};

  for (const [tableId, table] of Object.entries(tables)) {
    if (!table.lastActionTimestamp || !table.turnTimeLimit) continue;

    const timeElapsed = now - table.lastActionTimestamp;
    if (timeElapsed <= table.turnTimeLimit) continue;

    const currentPlayer = table.players[table.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.hasFolded) continue;

    // Auto-fold the player
    const updatedPlayers = table.players.map((player, index) =>
      index === table.currentPlayerIndex ? { ...player, hasFolded: true } : player
    );

    // Find next active player
    let nextPlayerIndex = (table.currentPlayerIndex + 1) % table.players.length;
    while (
      nextPlayerIndex !== table.currentPlayerIndex &&
      (!table.players[nextPlayerIndex].isActive ||
        table.players[nextPlayerIndex].hasFolded ||
        table.players[nextPlayerIndex].chips === 0)
    ) {
      nextPlayerIndex = (nextPlayerIndex + 1) % table.players.length;
    }

    updates[`tables/${tableId}`] = {
      ...table,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      lastActionTimestamp: now,
    };
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
}); 