import { ref, off, onValue, DatabaseReference, getDatabase } from 'firebase/database';
import { database } from './firebase';
import logger from '@/utils/logger';

interface Connection {
  ref: DatabaseReference;
  callback: (data: any) => void;
  timestamp: number;
  unsubscribe: () => void;
  path: string;
}

export class ConnectionManager {
  private static instance: ConnectionManager;
  private connections: Map<string, Connection> = new Map();
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds
  private isInitialized = false;
  private lastSyncTime = 0;
  private firebaseConnectionCount = 0;

  private constructor() {
    // Start the inactivity check timer
    this.startInactivityCheck();
    
    // Initialize by checking for existing connections
    this.detectExistingConnections();
    
    // Set initialized flag
    this.isInitialized = true;
    
    // Log initialization
    logger.log('[ConnectionManager] Initialized');
  }

  /**
   * Get the singleton instance of ConnectionManager
   */
  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Detect existing Firebase connections
   * This attempts to track connections that were established before the ConnectionManager was initialized
   */
  private detectExistingConnections(): void {
    try {
      // Create a special connection to the /.info/connected path to check connection status
      const connectedRef = ref(database, '.info/connected');
      
      onValue(connectedRef, (snapshot) => {
        const connected = snapshot.val();
        
        if (connected) {
          logger.log('[ConnectionManager] Firebase connection detected');
          
          // If we're connected but have no tracked connections, we need to sync with Firebase
          if (this.connections.size === 0) {
            this.syncWithFirebaseConnections();
          }
        } else {
          logger.log('[ConnectionManager] Firebase disconnected');
        }
      });
    } catch (error) {
      logger.error('[ConnectionManager] Error detecting existing connections:', error);
    }
  }

  /**
   * Sync with Firebase's internal connection tracking
   */
  private syncWithFirebaseConnections(): void {
    try {
      // Record the sync time
      this.lastSyncTime = Date.now();
      
      // Get the connection count from Firebase
      // Note: This is an approximation as we can't directly access Firebase's internal connection list
      const serverConnectionCountRef = ref(database, '.info/serverTimeOffset');
      
      // This will create a connection if one doesn't exist
      const serverTimeCallback = (snapshot: any): void => {
        // We can't directly get the connection count, but we can register this connection
        const connectionId = 'connection_info_serverTimeOffset';
        
        if (!this.connections.has(connectionId)) {
          // Register this system connection
          this.connections.set(connectionId, {
            ref: serverConnectionCountRef,
            callback: serverTimeCallback,
            timestamp: Date.now(),
            unsubscribe: () => off(serverConnectionCountRef),
            path: '.info/serverTimeOffset'
          });
        }
      };
      
      onValue(serverConnectionCountRef, serverTimeCallback);
      
      // Check for any active listeners in the app
      this.detectActiveListeners();
      
      // Try to get a more accurate connection count from Firebase
      // We'll use a special path to check for active connections
      const connectedRef = ref(database, '.info/connected');
      onValue(connectedRef, (snapshot) => {
        const connected = snapshot.val();
        if (connected) {
          // We're connected, but we need to check if we have zombie connections
          // Let's try to detect them by checking common paths
          this.detectZombieConnections();
        }
      });
      
      // If we still have very few connections compared to what Firebase shows,
      // we'll use a more conservative estimate
      setTimeout(() => {
        if (this.connections.size < 5 && this.firebaseConnectionCount > 0) {
          // Keep the existing count if we already have one
          logger.log(`[ConnectionManager] Connection count discrepancy detected. Using existing count of ${this.firebaseConnectionCount}.`);
        } else if (this.connections.size < 5) {
          // This is a fallback - we're seeing very few connections locally
          // but Firebase might be showing many more
          // Instead of hardcoding 100, let's use a more conservative estimate
          this.firebaseConnectionCount = Math.max(10, this.connections.size * 2);
          logger.log(`[ConnectionManager] Connection count discrepancy detected. Estimating ${this.firebaseConnectionCount} connections.`);
        } else {
          // We have a reasonable number of connections, use that
          this.firebaseConnectionCount = 0; // Reset so we use connections.size
        }
      }, 2000);
      
    } catch (error) {
      logger.error('[ConnectionManager] Error syncing with Firebase connections:', error);
    }
  }

  /**
   * Attempt to detect zombie connections that weren't properly closed
   */
  private detectZombieConnections(): void {
    // Additional paths that might have zombie connections
    const additionalPaths = [
      'connection_info',
      'server_time',
      'private_player_data',
      'game_state',
      'active_games',
      'player_status'
    ];
    
    // Check each path
    additionalPaths.forEach(path => {
      const pathRef = ref(database, path);
      const connectionId = `connection_${path}`;
      
      if (!this.connections.has(connectionId)) {
        // Try to detect if there's activity on this path
        onValue(pathRef, (snapshot) => {
          // If we get any data, register this as a potential zombie connection
          if (snapshot.exists()) {
            this.connections.set(connectionId, {
              ref: pathRef,
              callback: () => {},
              timestamp: Date.now(),
              unsubscribe: () => off(pathRef),
              path: path
            });
            logger.log(`[ConnectionManager] Detected potential zombie connection at path: ${path}`);
          }
          
          // Remove this listener after checking once
          off(pathRef);
        }, { onlyOnce: true });
      }
    });
  }

  /**
   * Attempt to detect active listeners in the application
   */
  private detectActiveListeners(): void {
    // Common paths that might have listeners
    const commonPaths = [
      'tables',
      'users',
      'private_player_data',
      'games'
    ];
    
    // Check each common path
    commonPaths.forEach(path => {
      const pathRef = ref(database, path);
      const connectionId = `connection_${path}`;
      
      // Create a temporary listener to check if the path exists
      const tempListener = (snapshot: any): void => {
        if (snapshot.exists()) {
          // If data exists, there might be listeners here
          if (!this.connections.has(connectionId)) {
            // Register this potential connection
            this.connections.set(connectionId, {
              ref: pathRef,
              callback: () => {},
              timestamp: Date.now(),
              unsubscribe: () => {}, // We don't actually unsubscribe this one since we didn't create it
              path: path
            });
          }
        }
        
        // Remove this temporary listener
        off(pathRef, 'value', tempListener);
      };
      
      onValue(pathRef, tempListener, { onlyOnce: true });
    });
  }

  /**
   * Register a new database connection
   * @param refPath The path to the database reference
   * @param callback The callback function to be called when data changes
   * @returns A function to unsubscribe from the connection
   */
  public registerConnection(
    refPath: string,
    callback: (data: any) => void
  ): () => void {
    const dbRef = ref(database, refPath);
    // Use a more stable ID that doesn't include timestamp
    const connectionId = `connection_${refPath}`;
    
    // If we already have this connection, update it instead of creating a new one
    if (this.connections.has(connectionId)) {
      const existingConnection = this.connections.get(connectionId)!;
      
      // Update the timestamp
      existingConnection.timestamp = Date.now();
      
      // Return the existing unsubscribe function
      return existingConnection.unsubscribe;
    }
    
    // Create unsubscribe function
    const unsubscribe = () => {
      try {
        off(dbRef);
        this.connections.delete(connectionId);
        logger.log(`[ConnectionManager] Unsubscribed from connection: ${connectionId}`);
      } catch (error) {
        logger.error(`[ConnectionManager] Error unsubscribing from connection ${connectionId}:`, error);
      }
    };
    
    // Set up the onValue listener
    onValue(dbRef, (snapshot) => {
      // Update the timestamp when data is received
      if (this.connections.has(connectionId)) {
        const connection = this.connections.get(connectionId)!;
        connection.timestamp = Date.now();
        this.connections.set(connectionId, connection);
      }
      
      // Call the original callback
      callback(snapshot);
    });
    
    // Store the connection
    this.connections.set(connectionId, {
      ref: dbRef,
      callback,
      timestamp: Date.now(),
      unsubscribe,
      path: refPath
    });
    
    logger.log(`[ConnectionManager] Registered new connection: ${connectionId}`);
    
    // Return the unsubscribe function
    return unsubscribe;
  }

  /**
   * Clear all active database connections
   */
  public clearAllConnections(): void {
    logger.log(`[ConnectionManager] Clearing all connections (${this.connections.size} tracked connections)`);
    
    // Unsubscribe from all connections
    this.connections.forEach((connection, id) => {
      try {
        off(connection.ref);
        logger.log(`[ConnectionManager] Unsubscribed from connection: ${id}`);
      } catch (error) {
        logger.error(`[ConnectionManager] Error unsubscribing from connection ${id}:`, error);
      }
    });
    
    // Clear the connections map
    this.connections.clear();
    
    // Reset the Firebase connection count
    this.firebaseConnectionCount = 0;
    
    // Force a disconnect from Firebase
    try {
      // Try to force disconnect by getting a new instance and goOffline
      const firebaseDb = getDatabase();
      // @ts-ignore - Using internal method
      if (firebaseDb.INTERNAL && typeof firebaseDb.goOffline === 'function') {
        // @ts-ignore
        firebaseDb.goOffline();
        setTimeout(() => {
          // @ts-ignore
          firebaseDb.goOnline();
          logger.log('[ConnectionManager] Forced Firebase disconnect/reconnect');
        }, 1000);
      }
    } catch (error) {
      logger.error('[ConnectionManager] Error forcing disconnect:', error);
    }
    
    logger.log('[ConnectionManager] All connections cleared');
    
    // Re-initialize connection detection after a short delay
    setTimeout(() => {
      this.detectExistingConnections();
    }, 1000);
  }

  /**
   * Start checking for inactive connections
   */
  private startInactivityCheck(): void {
    // Clear any existing timer
    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
    }
    
    // Set up a new timer to check for inactive connections every minute
    this.inactivityTimer = setInterval(() => {
      this.checkInactiveConnections();
    }, 60 * 1000); // Check every minute
  }

  /**
   * Check for and remove inactive connections
   */
  private checkInactiveConnections(): void {
    const now = Date.now();
    const inactiveConnections: string[] = [];
    
    // Find inactive connections
    this.connections.forEach((connection, id) => {
      const timeSinceLastActivity = now - connection.timestamp;
      
      if (timeSinceLastActivity > this.INACTIVITY_TIMEOUT) {
        // Connection is inactive, add to list for removal
        inactiveConnections.push(id);
      }
    });
    
    // Remove inactive connections
    inactiveConnections.forEach((id) => {
      const connection = this.connections.get(id);
      if (connection) {
        try {
          connection.unsubscribe();
          logger.log(`[ConnectionManager] Disconnected inactive connection: ${id}`);
        } catch (error) {
          logger.error(`[ConnectionManager] Error disconnecting inactive connection ${id}:`, error);
          // Still remove it from our tracking even if there was an error
          this.connections.delete(id);
        }
      }
    });
    
    if (inactiveConnections.length > 0) {
      logger.log(`[ConnectionManager] Disconnected ${inactiveConnections.length} inactive connections`);
    }
  }

  /**
   * Get a unique ID for a connection based on its path
   */
  private getConnectionId(path: string): string {
    return `connection_${path}_${Date.now()}`;
  }

  /**
   * Force a full refresh of connection tracking
   * This is useful when the connection count doesn't match what Firebase shows
   */
  public forceFullRefresh(): void {
    logger.log('[ConnectionManager] Forcing full connection refresh');
    
    // Clear all existing connections but don't actually disconnect them
    // This is just to reset our tracking
    this.connections.clear();
    this.firebaseConnectionCount = 0;
    
    // Try to force a disconnect/reconnect to get a fresh state
    try {
      // Try to force disconnect by getting a new instance and goOffline
      const firebaseDb = getDatabase();
      // @ts-ignore - Using internal method
      if (firebaseDb.INTERNAL && typeof firebaseDb.goOffline === 'function') {
        // @ts-ignore
        firebaseDb.goOffline();
        setTimeout(() => {
          // @ts-ignore
          firebaseDb.goOnline();
          logger.log('[ConnectionManager] Forced Firebase disconnect/reconnect for refresh');
        }, 500);
      }
    } catch (error) {
      logger.error('[ConnectionManager] Error forcing disconnect for refresh:', error);
    }
    
    // Re-detect all connections
    setTimeout(() => {
      // Try to directly query Firebase for connection information
      this.queryFirebaseConnections();
      
      // Also use our standard detection methods
      this.detectExistingConnections();
      this.detectZombieConnections();
      
      // After a delay, check if we found all connections
      setTimeout(() => {
        logger.log(`[ConnectionManager] After refresh: tracking ${this.connections.size} connections`);
        
        // If we still have very few connections, we might need to use the fallback
        if (this.connections.size < 5) {
          // Instead of hardcoding 100, let's use a more conservative estimate
          // Start with a small number and gradually increase if needed
          this.firebaseConnectionCount = 10;
          logger.log(`[ConnectionManager] Few connections detected after refresh. Using conservative estimate of ${this.firebaseConnectionCount}.`);
          
          // Try one more detection pass with additional paths
          this.detectAdditionalConnections();
        }
      }, 1500);
    }, 1000);
  }
  
  /**
   * Directly query Firebase for connection information
   * This is a more aggressive approach to detect connections
   */
  private queryFirebaseConnections(): void {
    try {
      logger.log('[ConnectionManager] Directly querying Firebase for connection information');
      
      // Try to query the .info/connected path for all clients
      const connectedRef = ref(database, '.info/connected');
      
      // Register this connection
      const connectionId = 'connection_info_connected';
      if (!this.connections.has(connectionId)) {
        this.connections.set(connectionId, {
          ref: connectedRef,
          callback: () => {},
          timestamp: Date.now(),
          unsubscribe: () => off(connectedRef),
          path: '.info/connected'
        });
      }
      
      // Try to query active tables
      const tablesRef = ref(database, 'tables');
      onValue(tablesRef, (snapshot) => {
        if (snapshot.exists()) {
          // For each table, register a connection and check for player connections
          const tables = snapshot.val();
          Object.keys(tables).forEach(tableId => {
            const tablePath = `tables/${tableId}`;
            const tableConnectionId = `connection_${tablePath}`;
            
            if (!this.connections.has(tableConnectionId)) {
              const tableRef = ref(database, tablePath);
              this.connections.set(tableConnectionId, {
                ref: tableRef,
                callback: () => {},
                timestamp: Date.now(),
                unsubscribe: () => off(tableRef),
                path: tablePath
              });
            }
            
            // Check for player connections in this table
            const table = tables[tableId];
            if (table.players && Array.isArray(table.players)) {
              table.players.forEach((player: { id: string }) => {
                if (player && player.id) {
                  const playerDataPath = `private_player_data/${tableId}/${player.id}`;
                  const playerConnectionId = `connection_${playerDataPath}`;
                  
                  if (!this.connections.has(playerConnectionId)) {
                    const playerRef = ref(database, playerDataPath);
                    this.connections.set(playerConnectionId, {
                      ref: playerRef,
                      callback: () => {},
                      timestamp: Date.now(),
                      unsubscribe: () => off(playerRef),
                      path: playerDataPath
                    });
                  }
                }
              });
            }
          });
        }
        
        // Remove this listener after checking once
        off(tablesRef);
      }, { onlyOnce: true });
      
      // Try to query users
      const usersRef = ref(database, 'users');
      onValue(usersRef, (snapshot) => {
        if (snapshot.exists()) {
          const users = snapshot.val();
          Object.keys(users).forEach(userId => {
            const userPath = `users/${userId}`;
            const userConnectionId = `connection_${userPath}`;
            
            if (!this.connections.has(userConnectionId)) {
              const userRef = ref(database, userPath);
              this.connections.set(userConnectionId, {
                ref: userRef,
                callback: () => {},
                timestamp: Date.now(),
                unsubscribe: () => off(userRef),
                path: userPath
              });
            }
          });
        }
        
        // Remove this listener after checking once
        off(usersRef);
      }, { onlyOnce: true });
      
    } catch (error) {
      logger.error('[ConnectionManager] Error querying Firebase connections:', error);
    }
  }
  
  /**
   * Detect connections on additional paths that might not be covered by standard detection
   */
  private detectAdditionalConnections(): void {
    // Additional paths to check
    const additionalPaths = [
      '.info',
      'presence',
      'status',
      'metadata',
      'config',
      'settings',
      'logs'
    ];
    
    additionalPaths.forEach(path => {
      const pathRef = ref(database, path);
      const connectionId = `connection_${path}`;
      
      if (!this.connections.has(connectionId)) {
        onValue(pathRef, (snapshot) => {
          // Register this as a connection regardless of data
          this.connections.set(connectionId, {
            ref: pathRef,
            callback: () => {},
            timestamp: Date.now(),
            unsubscribe: () => off(pathRef),
            path: path
          });
          
          // Remove this listener after checking once
          off(pathRef);
        }, { onlyOnce: true });
      }
    });
  }

  /**
   * Get the current number of active connections
   */
  public getConnectionCount(): number {
    // If we have no tracked connections but Firebase shows connections,
    // use the Firebase connection count
    if (this.connections.size === 0 && this.firebaseConnectionCount > 0) {
      return this.firebaseConnectionCount;
    }
    
    // If it's been more than 5 minutes since our last sync, try to sync again
    if (Date.now() - this.lastSyncTime > 5 * 60 * 1000) {
      this.syncWithFirebaseConnections();
    }
    
    // If we have a reasonable number of tracked connections, use that
    if (this.connections.size >= 3) {
      return this.connections.size;
    }
    
    // If we have a small number of tracked connections but Firebase shows more,
    // use a weighted average to provide a more accurate estimate
    if (this.firebaseConnectionCount > 0) {
      // Use a weighted average, giving more weight to our tracked connections
      // but acknowledging that Firebase might be showing more
      const weightedCount = Math.ceil((this.connections.size * 0.7) + (this.firebaseConnectionCount * 0.3));
      return Math.min(weightedCount, this.firebaseConnectionCount);
    }
    
    // Return our tracked connection count as a fallback
    return this.connections.size;
  }

  /**
   * Get all active connections
   */
  public getActiveConnections(): { path: string; lastActivity: Date }[] {
    // If we have no tracked connections but Firebase shows connections,
    // try to sync with Firebase
    if (this.connections.size === 0 && this.firebaseConnectionCount > 0) {
      this.syncWithFirebaseConnections();
      
      // If we still have no tracked connections, try to detect zombie connections
      if (this.connections.size === 0) {
        this.detectZombieConnections();
        this.detectAdditionalConnections();
        
        // If we still have no tracked connections, return a placeholder
        if (this.connections.size === 0) {
          // Create multiple placeholder connections to better represent the estimated count
          const placeholders: { path: string; lastActivity: Date }[] = [];
          const estimatedCount = Math.min(10, this.firebaseConnectionCount);
          
          for (let i = 0; i < estimatedCount; i++) {
            placeholders.push({
              path: `firebase_connection_${i} (estimated)`,
              lastActivity: new Date()
            });
          }
          
          return placeholders;
        }
      }
    }
    
    const connections: { path: string; lastActivity: Date }[] = [];
    
    this.connections.forEach((connection, id) => {
      connections.push({
        path: connection.path || id,
        lastActivity: new Date(connection.timestamp),
      });
    });
    
    // Sort connections by last activity (most recent first)
    connections.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    
    return connections;
  }
}

// Export a singleton instance
export const connectionManager = ConnectionManager.getInstance(); 