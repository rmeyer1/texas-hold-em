'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface TableInfo {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  isPrivate: boolean;
  password?: string;
}

interface LobbyTableProps {
  table: TableInfo;
  onJoin: (tableId: string) => void;
}

export const LobbyTable = ({ table, onJoin }: LobbyTableProps): React.ReactElement => {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleJoin = (): void => {
    if (table.isPrivate) {
      if (password === table.password) {
        router.push(`/table/${table.id}`);
      } else {
        alert('Incorrect password');
        setPassword('');
      }
    } else {
      onJoin(table.id);
    }
  };

  return (
    <div className="bg-green-900 rounded-lg p-4 shadow-lg hover:bg-green-850 transition-colors">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-white text-lg font-semibold">{table.name}</h3>
            {table.isPrivate && (
              <span className="bg-yellow-600 text-xs px-2 py-1 rounded text-white">Private</span>
            )}
          </div>
          <p className="text-gray-300">
            Players: {table.players}/{table.maxPlayers}
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-300">
            Blinds: ${table.smallBlind}/${table.bigBlind}
          </p>
          {table.isPrivate ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="px-2 py-1 rounded bg-green-800 text-white border border-green-700 text-sm"
              />
              <button
                onClick={handleJoin}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              >
                Join
              </button>
            </div>
          ) : (
            <button
              onClick={() => onJoin(table.id)}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Join Table
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 