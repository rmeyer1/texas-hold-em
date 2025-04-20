'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/services/firebase';
import { connectionManager } from '@/services/connectionManager';
import { LobbyTable } from './LobbyTable';
import { useAuth } from '@/contexts/AuthContext';
import { GameManager } from '@/services/gameManager';
import { TableServiceClient } from '@/services/tableService.client';
import logger from '@/utils/logger';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tablesRef = ref(database, 'tables');
    
    // Use the connection manager to register this connection
    const unsubscribe = connectionManager.registerConnection('tables', (snapshot) => {
      if (snapshot.exists()) {
        const tablesData = snapshot.val();
        const tablesArray = Object.entries(tablesData).map(([id, data]) => {
          const tableData = data as any;
          return {
            id,
            name: tableData.name || `Table ${id.substring(0, 8)}...`,
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
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleJoinTable = async (tableId: string): Promise<void> => {
    if (!user) {
      setError('You must be logged in to join a table');
      return;
    }

    try {
      const tableService = new TableServiceClient(tableId);
      const result = await tableService.addPlayer({
        id: user.uid,
        name: user.displayName || 'Anonymous',
        position: 0, // Will be assigned by the server
        chips: 1000, // Default starting chips
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.push(`/table/${tableId}`);
    } catch (err) {
      logger.error('[LobbyView] Error joining table:', err);
      setError('Failed to join table. Please try again.');
    }
  };

  // Check if a table name already exists
  const isTableNameTaken = (name: string): boolean => {
    return tables.some(table => table.name.toLowerCase() === name.toLowerCase());
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.name.trim()) {
      errors.name = 'Table name is required';
    } else if (isTableNameTaken(formData.name.trim())) {
      errors.name = 'This table name is already taken';
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
        // Generate a unique ID for the table using a combination of timestamp and random string
        const uniqueId = `table-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const gameManager = new GameManager(uniqueId);
        await gameManager.createTable(
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
        
        // Use the uniqueId directly for navigation
        router.push(`/table/${uniqueId}`);
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

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingTable(true);
    setError(null);

    try {
      // Create a temporary tableId - the actual one will be assigned by the server
      const tempTableId = 'temp';
      const tableService = new TableServiceClient(tempTableId);
      
      const result = await tableService.createTable({
        name: formData.name,
        smallBlind: formData.smallBlind,
        bigBlind: formData.smallBlind * 2,
        maxPlayers: formData.maxPlayers,
        isPrivate: formData.isPrivate,
        password: formData.isPrivate ? formData.password : undefined
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (!result.data?.tableId) {
        setError('Failed to create table: No table ID returned');
        return;
      }

      // Redirect to the new table
      router.push(`/table/${result.data.tableId}`);
    } catch (err) {
      logger.error('[LobbyView] Error creating table:', err);
      setError('Failed to create table. Please try again.');
    } finally {
      setIsCreatingTable(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-4 sm:mb-0 tracking-wider">Poker Tables</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg transform hover:scale-105 font-semibold"
        >
          Create Table
        </button>
      </div>

      <div className="grid gap-4 bg-gray-900/50 p-6 rounded-xl backdrop-blur-sm border border-gray-800">
        {tables.length > 0 ? (
          tables.map((table) => (
            <LobbyTable key={table.id} table={table} onJoin={handleJoinTable} />
          ))
        ) : (
          <div className="text-center py-16 bg-gray-800/50 rounded-xl backdrop-blur-sm">
            <div className="text-2xl font-semibold text-gray-300 mb-2">No Tables Available</div>
            <p className="text-gray-400">Create a new table to start playing!</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 p-6 rounded-xl w-full max-w-md shadow-2xl border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white tracking-wide">Create New Table</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateTable} className="space-y-5">
              <div>
                <label className="block text-gray-300 mb-2 font-medium">Table Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  placeholder="Enter table name"
                />
                {formErrors.name && (
                  <p className="text-red-400 text-sm mt-1">{formErrors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 mb-2 font-medium">Small Blind</label>
                  <input
                    type="number"
                    name="smallBlind"
                    value={formData.smallBlind}
                    onChange={handleInputChange}
                    min="1"
                    className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                  {formErrors.smallBlind && (
                    <p className="text-red-400 text-sm mt-1">{formErrors.smallBlind}</p>
                  )}
                </div>

                <div>
                  <label className="block text-gray-300 mb-2 font-medium">Big Blind</label>
                  <input
                    type="number"
                    name="bigBlind"
                    value={formData.bigBlind}
                    onChange={handleInputChange}
                    min="2"
                    className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 mb-2 font-medium">Max Players</label>
                <input
                  type="number"
                  name="maxPlayers"
                  value={formData.maxPlayers}
                  onChange={handleInputChange}
                  min="2"
                  max="10"
                  className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                {formErrors.maxPlayers && (
                  <p className="text-red-400 text-sm mt-1">{formErrors.maxPlayers}</p>
                )}
              </div>

              <div className="flex items-center space-x-3 bg-gray-700/50 p-3 rounded-lg">
                <input
                  type="checkbox"
                  name="isPrivate"
                  id="isPrivate"
                  checked={formData.isPrivate}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="isPrivate" className="text-white font-medium">Private Table</label>
              </div>

              {formData.isPrivate && (
                <div>
                  <label className="block text-gray-300 mb-2 font-medium">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    placeholder="Enter table password"
                  />
                  {formErrors.password && (
                    <p className="text-red-400 text-sm mt-1">{formErrors.password}</p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg font-semibold"
                >
                  Create Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}; 