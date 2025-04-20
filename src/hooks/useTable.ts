import { useState, useEffect, useCallback } from 'react';
import { TableServiceClient } from '@/services/tableService.client';
import type { Table, Player } from '@/types/poker';
import logger from '@/utils/logger';

interface UseTableOptions {
  tableId: string;
  onError?: (error: string) => void;
}

export function useTable({ tableId, onError }: UseTableOptions) {
  const [table, setTable] = useState<Table | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tableService = new TableServiceClient(tableId);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    if (onError) {
      onError(errorMessage);
    }
  }, [onError]);

  const fetchTable = useCallback(async () => {
    try {
      const tableData = await tableService.getTable();
      if (tableData) {
        setTable(tableData);
        setError(null);
      } else {
        handleError('Failed to fetch table data');
      }
    } catch (err) {
      handleError('Error fetching table data');
    } finally {
      setIsLoading(false);
    }
  }, [tableService, handleError]);

  const updateTable = useCallback(async (updates: Partial<Table>) => {
    try {
      const result = await tableService.updateTable(updates);
      if (result.error) {
        handleError(result.error);
        return false;
      }
      await fetchTable(); // Refresh table data
      return true;
    } catch (err) {
      handleError('Failed to update table');
      return false;
    }
  }, [tableService, fetchTable, handleError]);

  const addPlayer = useCallback(async (player: Omit<Player, 'cards' | 'isActive' | 'hasFolded'>) => {
    try {
      const result = await tableService.addPlayer(player);
      if (result.error) {
        handleError(result.error);
        return false;
      }
      await fetchTable(); // Refresh table data
      return true;
    } catch (err) {
      handleError('Failed to add player');
      return false;
    }
  }, [tableService, fetchTable, handleError]);

  const removePlayer = useCallback(async (playerId: string) => {
    try {
      const result = await tableService.removePlayer(playerId);
      if (result.error) {
        handleError(result.error);
        return false;
      }
      await fetchTable(); // Refresh table data
      return true;
    } catch (err) {
      handleError('Failed to remove player');
      return false;
    }
  }, [tableService, fetchTable, handleError]);

  const updatePlayerState = useCallback(async (playerId: string, updates: Partial<Player>) => {
    try {
      const result = await tableService.updatePlayerState(playerId, updates);
      if (result.error) {
        handleError(result.error);
        return false;
      }
      await fetchTable(); // Refresh table data
      return true;
    } catch (err) {
      handleError('Failed to update player state');
      return false;
    }
  }, [tableService, fetchTable, handleError]);

  useEffect(() => {
    fetchTable();
  }, [fetchTable]);

  return {
    table,
    isLoading,
    error,
    updateTable,
    addPlayer,
    removePlayer,
    updatePlayerState,
    refreshTable: fetchTable
  };
} 