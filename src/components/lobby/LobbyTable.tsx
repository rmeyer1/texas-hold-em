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
    <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-5 shadow-xl border border-gray-700 hover:border-blue-500 transition-all duration-300 transform hover:scale-[1.01]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-white text-xl font-bold tracking-wide bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">{table.name}</h3>
            {table.isPrivate && (
              <span className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-xs px-2 py-1 rounded-md text-white font-semibold shadow-sm">Private</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-gray-300 flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2"></span>
              <span className="font-medium">{table.players}/{table.maxPlayers}</span>
              <span className="text-gray-400 ml-1">Players</span>
            </p>
            <p className="text-gray-300">
              <span className="text-gray-400">Blinds: </span>
              <span className="font-medium">${table.smallBlind}/${table.bigBlind}</span>
            </p>
          </div>
        </div>
        
        <div className="w-full sm:w-auto">
          {table.isPrivate ? (
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm"
              />
              <button
                onClick={handleJoin}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg text-sm font-medium"
              >
                Join Table
              </button>
            </div>
          ) : (
            <button
              onClick={() => onJoin(table.id)}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg font-semibold"
            >
              Join Table
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 