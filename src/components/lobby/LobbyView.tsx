'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/services/firebase';
import { LobbyTable } from './LobbyTable';
import { useAuth } from '@/contexts/AuthContext';
import { GameManager } from '@/services/gameManager';

interface TableData {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  isPrivate: boolean;
  password?: string;
}

interface CreateTableForm {
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  isPrivate: boolean;
  password: string;
}

interface FormErrors {
  name?: string;
  smallBlind?: string;
  bigBlind?: string;
  maxPlayers?: string;
  password?: string;
}

export const LobbyView = (): React.ReactElement => {
  const router = useRouter();
  const { user } = useAuth();
  const [tables, setTables] = useState<TableData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<CreateTableForm>({
    name: '',
    smallBlind: 10,
    bigBlind: 20,
    maxPlayers: 6,
    isPrivate: false,
    password: '',
  });

  useEffect(() => {
    const tablesRef = ref(database, 'tables');
    const unsubscribe = onValue(tablesRef, (snapshot) => {
      if (snapshot.exists()) {
        const tablesData = snapshot.val();
        const tablesArray = Object.entries(tablesData).map(([id, data]) => {
          const tableData = data as any;
          return {
            id,
            name: tableData.name || `Table ${id}`,
            players: Array.isArray(tableData.players) ? tableData.players.length : 0,
            maxPlayers: tableData.maxPlayers || 10,
            smallBlind: tableData.smallBlind || 10,
            bigBlind: tableData.bigBlind || 20,
            isPrivate: tableData.isPrivate || false,
            password: tableData.password,
          };
        });
        setTables(tablesArray);
      } else {
        setTables([]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleJoinTable = (tableId: string): void => {
    router.push(`/table/${tableId}`);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.name.trim()) {
      errors.name = 'Table name is required';
    }

    if (formData.smallBlind >= formData.bigBlind) {
      errors.smallBlind = 'Small blind must be less than big blind';
    }

    if (formData.maxPlayers < 2 || formData.maxPlayers > 10) {
      errors.maxPlayers = 'Max players must be between 2 and 10';
    }

    if (formData.isPrivate && !formData.password.trim()) {
      errors.password = 'Password is required for private tables';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    
    if (!user) {
      alert('Must be signed in to create a table');
      return;
    }

    if (validateForm()) {
      try {
        const gameManager = new GameManager('temp'); // Temporary ID, will be replaced by createTable
        const tableId = await gameManager.createTable(
          formData.name,
          formData.smallBlind,
          formData.bigBlind,
          formData.maxPlayers,
          formData.isPrivate,
          formData.isPrivate ? formData.password : undefined
        );

        setIsModalOpen(false);
        setFormData({
          name: '',
          smallBlind: 10,
          bigBlind: 20,
          maxPlayers: 6,
          isPrivate: false,
          password: '',
        });
        
        router.push(`/table/${tableId}`);
      } catch (error) {
        console.error('Failed to create table:', error);
        alert('Failed to create table');
      }
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value,
    }));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Poker Tables</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Create Table
        </button>
      </div>

      <div className="grid gap-4">
        {tables.length > 0 ? (
          tables.map((table) => (
            <LobbyTable key={table.id} table={table} onJoin={handleJoinTable} />
          ))
        ) : (
          <div className="text-center text-gray-400 py-8">No tables available</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-green-900 p-6 rounded-lg w-full max-w-md">
            <h2 className="text-2xl font-bold text-white mb-4">Create New Table</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-white mb-1">Table Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 rounded bg-green-800 text-white border border-green-700"
                />
                {formErrors.name && (
                  <p className="text-red-400 text-sm mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-white mb-1">Small Blind</label>
                <input
                  type="number"
                  name="smallBlind"
                  value={formData.smallBlind}
                  onChange={handleInputChange}
                  min="1"
                  className="w-full px-3 py-2 rounded bg-green-800 text-white border border-green-700"
                />
                {formErrors.smallBlind && (
                  <p className="text-red-400 text-sm mt-1">{formErrors.smallBlind}</p>
                )}
              </div>

              <div>
                <label className="block text-white mb-1">Big Blind</label>
                <input
                  type="number"
                  name="bigBlind"
                  value={formData.bigBlind}
                  onChange={handleInputChange}
                  min="2"
                  className="w-full px-3 py-2 rounded bg-green-800 text-white border border-green-700"
                />
              </div>

              <div>
                <label className="block text-white mb-1">Max Players</label>
                <input
                  type="number"
                  name="maxPlayers"
                  value={formData.maxPlayers}
                  onChange={handleInputChange}
                  min="2"
                  max="10"
                  className="w-full px-3 py-2 rounded bg-green-800 text-white border border-green-700"
                />
                {formErrors.maxPlayers && (
                  <p className="text-red-400 text-sm mt-1">{formErrors.maxPlayers}</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="isPrivate"
                  checked={formData.isPrivate}
                  onChange={handleInputChange}
                  className="mr-2"
                />
                <label className="text-white">Private Table</label>
              </div>

              {formData.isPrivate && (
                <div>
                  <label className="block text-white mb-1">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 rounded bg-green-800 text-white border border-green-700"
                  />
                  {formErrors.password && (
                    <p className="text-red-400 text-sm mt-1">{formErrors.password}</p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}; 