'use client';

interface TableInfo {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  isPrivate: boolean;
}

interface LobbyTableProps {
  table: TableInfo;
  onJoin: (tableId: string) => void;
}

export const LobbyTable = ({ table, onJoin }: LobbyTableProps) => {
  return (
    <div className="bg-green-900 rounded-lg p-4 shadow-lg hover:bg-green-850 transition-colors">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-white text-lg font-semibold">{table.name}</h3>
          <p className="text-gray-300">
            Players: {table.players}/{table.maxPlayers}
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-300">
            Blinds: ${table.smallBlind}/${table.bigBlind}
          </p>
          <button
            onClick={() => onJoin(table.id)}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Join Table
          </button>
        </div>
      </div>
    </div>
  );
}; 