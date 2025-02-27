'use client';

import React, { useState, useEffect } from 'react';
import { connectionManager } from '@/services/connectionManager';

interface ConnectionManagerProps {
  className?: string;
}

export const ConnectionManagerUI: React.FC<ConnectionManagerProps> = ({ className }) => {
  const [connections, setConnections] = useState<{ path: string; lastActivity: Date }[]>([]);
  const [showConnections, setShowConnections] = useState(true); // Default to showing connections
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionCount, setConnectionCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [refreshAttempts, setRefreshAttempts] = useState<number>(0);

  const handleClearConnections = (): void => {
    if (window.confirm('Are you sure you want to clear all database connections? This will disconnect all users from the database temporarily.')) {
      setIsRefreshing(true);
      setSyncStatus('Clearing connections...');
      
      try {
        connectionManager.clearAllConnections();
        setConnections([]);
        setSyncStatus('Connections cleared. Refreshing...');
        
        // Wait a moment for Firebase to update
        setTimeout(() => {
          refreshConnections();
        }, 2000);
      } catch (error) {
        console.error('Error clearing connections:', error);
        setSyncStatus('Error clearing connections');
        setIsRefreshing(false);
      }
    }
  };

  const refreshConnections = (): void => {
    setIsRefreshing(true);
    setSyncStatus('Refreshing connection data...');
    
    try {
      // Get the latest connections
      const activeConnections = connectionManager.getActiveConnections();
      setConnections(activeConnections);
      
      // Update the connection count
      const count = connectionManager.getConnectionCount();
      setConnectionCount(count);
      
      setLastRefresh(new Date());
      setSyncStatus(activeConnections.length === 0 ? 'No active connections found' : 'Connections refreshed');
      setShowConnections(true);
    } catch (error) {
      console.error('Error refreshing connections:', error);
      setSyncStatus('Error refreshing connections');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Force a full refresh of connection data
  const forceRefresh = (): void => {
    setIsRefreshing(true);
    setSyncStatus('Forcing connection refresh from Firebase...');
    
    // Clear local connection data first
    setConnections([]);
    setConnectionCount(0);
    
    // Increment refresh attempts counter
    const newAttemptCount = refreshAttempts + 1;
    setRefreshAttempts(newAttemptCount);
    
    try {
      // Use the forceFullRefresh method
      connectionManager.forceFullRefresh();
      
      // Wait a moment to ensure we get fresh data
      // Use a longer timeout for repeated attempts
      const timeout = Math.min(2000 + (newAttemptCount * 1000), 10000);
      setSyncStatus(`Forcing refresh (attempt ${newAttemptCount})... waiting ${timeout/1000}s for data`);
      
      setTimeout(() => {
        refreshConnections();
      }, timeout);
    } catch (error) {
      console.error('Error forcing refresh:', error);
      setSyncStatus(`Error forcing refresh (attempt ${newAttemptCount})`);
      setIsRefreshing(false);
    }
  };

  // Initial load and auto-refresh connections
  useEffect(() => {
    // Initial load
    refreshConnections();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (!isRefreshing) {
        refreshConnections();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Calculate connection stats
  const connectionStats = {
    recent: 0,
    medium: 0,
    old: 0
  };
  
  connections.forEach(conn => {
    const now = new Date();
    const idleTimeMs = now.getTime() - conn.lastActivity.getTime();
    const idleMinutes = Math.floor(idleTimeMs / 60000);
    
    if (idleMinutes < 5) {
      connectionStats.recent++;
    } else if (idleMinutes < 15) {
      connectionStats.medium++;
    } else {
      connectionStats.old++;
    }
  });

  return (
    <div className={`p-4 bg-gray-800 rounded-lg shadow-lg ${className}`}>
      <h2 className="text-xl font-bold mb-4 text-white">Database Connection Manager</h2>
      
      <div className="flex flex-wrap gap-4 mb-4">
        <button
          onClick={handleClearConnections}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          disabled={isRefreshing}
        >
          Clear All Connections
        </button>
        
        <button
          onClick={refreshConnections}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Refreshing...
            </>
          ) : (
            'Refresh Connections'
          )}
        </button>
        
        <button
          onClick={forceRefresh}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          disabled={isRefreshing}
          title="Force a complete refresh of connection tracking"
        >
          Force Full Refresh
        </button>
        
        <div className="px-4 py-2 bg-gray-700 text-white rounded">
          Active Connections: <span className="font-bold">{connectionCount}</span>
        </div>
        
        <button
          onClick={() => setDebugMode(!debugMode)}
          className={`px-4 py-2 ${debugMode ? 'bg-green-600' : 'bg-gray-600'} text-white rounded hover:bg-green-700 transition-colors`}
          title="Toggle debug information"
        >
          {debugMode ? 'Hide Debug Info' : 'Show Debug Info'}
        </button>
      </div>
      
      {syncStatus && (
        <div className="mb-4 px-4 py-2 bg-gray-700 rounded text-white">
          Status: {syncStatus}
        </div>
      )}
      
      {lastRefresh && (
        <div className="text-sm text-gray-400 mb-4">
          Last refreshed: {lastRefresh.toLocaleString()}
        </div>
      )}
      
      {debugMode && (
        <div className="mb-4 p-4 bg-gray-900 rounded border border-gray-700">
          <h3 className="text-lg font-semibold mb-2 text-white">Debug Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-gray-800 p-3 rounded">
              <div className="font-medium text-gray-300 mb-1">Refresh Attempts</div>
              <div className="text-white">{refreshAttempts}</div>
            </div>
            <div className="bg-gray-800 p-3 rounded">
              <div className="font-medium text-gray-300 mb-1">Connection Stats</div>
              <div className="text-green-400">Recent (&lt;5m): {connectionStats.recent}</div>
              <div className="text-yellow-400">Medium (5-15m): {connectionStats.medium}</div>
              <div className="text-red-400">Old (&gt;15m): {connectionStats.old}</div>
            </div>
            <div className="bg-gray-800 p-3 rounded">
              <div className="font-medium text-gray-300 mb-1">Firebase Discrepancy</div>
              <div className="text-white">
                {connectionCount === connections.length ? 
                  'No discrepancy detected' : 
                  `Showing ${connections.length} connections, reporting ${connectionCount}`}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {showConnections && connections.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2 text-white">Active Connections</h3>
          <div className="bg-gray-900 p-4 rounded overflow-auto max-h-60">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs uppercase bg-gray-700">
                <tr>
                  <th className="px-4 py-2">Path</th>
                  <th className="px-4 py-2">Last Activity</th>
                  <th className="px-4 py-2">Idle Time</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((connection, index) => {
                  const now = new Date();
                  const idleTimeMs = now.getTime() - connection.lastActivity.getTime();
                  const idleMinutes = Math.floor(idleTimeMs / 60000);
                  const idleSeconds = Math.floor((idleTimeMs % 60000) / 1000);
                  
                  let idleClass = 'text-green-400';
                  if (idleMinutes > 15) {
                    idleClass = 'text-red-400';
                  } else if (idleMinutes > 5) {
                    idleClass = 'text-yellow-400';
                  }
                  
                  return (
                    <tr key={index} className="border-b border-gray-700">
                      <td className="px-4 py-2">{connection.path}</td>
                      <td className="px-4 py-2">{connection.lastActivity.toLocaleString()}</td>
                      <td className={`px-4 py-2 ${idleClass}`}>
                        {idleMinutes}m {idleSeconds}s
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {showConnections && connections.length === 0 && (
        <div className="mt-4 p-4 bg-gray-700 rounded text-white">
          <p>No active connections found. This may indicate a tracking issue if Firebase console shows active connections.</p>
          <p className="mt-2">Try these steps:</p>
          <ol className="list-decimal ml-5 mt-2">
            <li className="mb-1">Click "Force Full Refresh" to sync with Firebase</li>
            <li className="mb-1">If that doesn't work, try clicking it again (multiple attempts may help)</li>
            <li className="mb-1">If still no connections appear, try "Clear All Connections" to reset everything</li>
          </ol>
        </div>
      )}
      
      <div className="mt-4 text-sm text-gray-400">
        <p>Inactive connections (20+ minutes) are automatically cleared.</p>
        <p className="mt-1">Connections are color-coded by idle time:</p>
        <ul className="mt-1 ml-4 list-disc">
          <li className="text-green-400">Less than 5 minutes</li>
          <li className="text-yellow-400">5-15 minutes</li>
          <li className="text-red-400">More than 15 minutes</li>
        </ul>
        
        <div className="mt-4 p-4 bg-gray-700 rounded">
          <h4 className="font-semibold text-white mb-2">Troubleshooting</h4>
          <p className="text-gray-300 mb-2">
            If the connection count doesn't match what you see in the Firebase console:
          </p>
          <ol className="list-decimal ml-5 text-gray-300">
            <li className="mb-1">Use the "Force Full Refresh" button to sync with Firebase</li>
            <li className="mb-1">Try multiple refresh attempts - each attempt uses a more aggressive detection method</li>
            <li className="mb-1">If the issue persists, try clearing all connections</li>
            <li className="mb-1">Check browser console for any connection errors</li>
            <li className="mb-1">Remember that Firebase's connection count is an approximation and may include connections from other sources</li>
          </ol>
        </div>
      </div>
    </div>
  );
}; 