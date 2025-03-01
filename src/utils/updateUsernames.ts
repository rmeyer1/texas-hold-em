import { getAuth, updateProfile, User } from 'firebase/auth';
import { ref, get, query, orderByKey, update } from 'firebase/database';
import { database } from '@/services/firebase';
import logger from './logger';
/**
 * Updates a single user's display name (username)
 * @param user The Firebase user to update
 * @param username The new username to set
 * @returns A promise that resolves when the update is complete
 */
export const updateUserDisplayName = async (
  user: User,
  username: string
): Promise<void> => {
  try {
    await updateProfile(user, {
      displayName: username
    });
    logger.log(`Successfully updated username for user ${user.uid} to "${username}"`);
    
    // Also update the username in all tables where this user is a player
    await updatePlayerNamesInTables();
  } catch (error) {
    logger.error(`Failed to update username for user ${user.uid}:`, error);
    throw error;
  }
};

/**
 * Utility function to find all users who need a username
 * This function requires admin access to Firebase Auth
 * and should be run in a secure environment (like a Firebase Function)
 * 
 * Note: This is a placeholder implementation. In a real application,
 * you would need to use Firebase Admin SDK in a secure backend environment
 * to list and update all users.
 */
export const findUsersWithoutUsernames = async (): Promise<void> => {
  logger.log('This function requires Firebase Admin SDK and should be run in a secure backend environment');
  logger.log('Please implement this in a Firebase Cloud Function with proper admin credentials');
};

/**
 * Updates usernames for the current user in existing tables
 * This is useful for updating player names in existing game tables
 * after adding usernames to user accounts
 */
export const updatePlayerNamesInTables = async (): Promise<void> => {
  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      logger.error('No authenticated user found');
      return;
    }

    const userId = currentUser.uid;
    const newUsername = currentUser.displayName || 'Player';
    
    const tablesRef = ref(database, 'tables');
    const tablesSnapshot = await get(query(tablesRef, orderByKey()));
    
    if (!tablesSnapshot.exists()) {
      logger.log('No tables found to update');
      return;
    }
    
    let updatedTables = 0;
    const updatePromises: Promise<void>[] = [];
    
    // Iterate through all tables
    tablesSnapshot.forEach((tableSnapshot) => {
      const tableId = tableSnapshot.key;
      const tableData = tableSnapshot.val();
      
      if (!tableData || !tableData.players || !Array.isArray(tableData.players)) {
        return;
      }
      
      // Check if the current user is a player in this table
      const playerIndex = tableData.players.findIndex((player: any) => player && player.id === userId);
      
      if (playerIndex !== -1) {
        // User found in this table, update their name
        logger.log(`Updating player name in table ${tableId} from "${tableData.players[playerIndex].name}" to "${newUsername}"`);
        
        // Create a specific update path for this player's name
        const updatePath = `tables/${tableId}/players/${playerIndex}/name`;
        const updatePromise = update(ref(database), { [updatePath]: newUsername });
        updatePromises.push(updatePromise);
        updatedTables++;
      }
    });
    
    // Wait for all updates to complete
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      logger.log(`Successfully updated player name in ${updatedTables} tables`);
    } else {
      logger.log('No tables found where the current user is a player');
    }
    
    return;
  } catch (error) {
    logger.error('Error updating player names in tables:', error);
  }
};

/**
 * Example usage in a component or page:
 * 
 * import { getAuth } from 'firebase/auth';
 * import { updateUserDisplayName } from '@/utils/updateUsernames';
 * 
 * // In a component or page:
 * const handleUpdateUsername = async (newUsername: string) => {
 *   const auth = getAuth();
 *   const user = auth.currentUser;
 *   
 *   if (user) {
 *     try {
 *       await updateUserDisplayName(user, newUsername);
 *       // Show success message
 *     } catch (error) {
 *       // Handle error
 *     }
 *   }
 * };
 */ 