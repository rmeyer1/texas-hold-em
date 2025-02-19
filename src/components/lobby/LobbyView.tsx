'use client';

import { useRouter } from 'next/navigation';
import { LobbyTable } from './LobbyTable';

const MOCK_TABLES = [
  {
    id: '1',
    name: 'Beginner Table',
    players: 3,
    maxPlayers: 6,
    smallBlind: 1,
    bigBlind: 2,
    isPrivate: false,
  },
  {
    id: '2',
    name: 'High Stakes',
    players: 5,
    maxPlayers: 9,
    smallBlind: 5,
    bigBlind: 10,
    isPrivate: false,
  },
];

export const LobbyView = () => {
  const router = useRouter();

  const handleJoinTable = (tableId: string): void => {
    router.push(`/table/${tableId}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">Poker Tables</h1>
      <div className="grid gap-4">
        {MOCK_TABLES.map((table) => (
          <LobbyTable key={table.id} table={table} onJoin={handleJoinTable} />
        ))}
      </div>
    </div>
  );
}; 