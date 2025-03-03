import chatService from './chatService';
import { TableService } from './tableService';
import logger from '@/utils/logger';
import type { Table } from '@/types/poker';

export class GameChatConnector {
  private tableService: TableService;
  private tableId: string;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.tableService = new TableService(tableId);
  }

  /**
   * Creates or gets a chat room for a table
   */
  public async ensureTableChatRoom(table: Table): Promise<string> {
    try {
      const roomId = `table_${this.tableId}`;
      const participants = table.players.map(player => player.id);
      
      // Create or get the chat room with the table's players
      const chatRoomId = await chatService.createOrGetChatRoom(participants, roomId);
      logger.log('[GameChatConnector] Table chat room ensured:', { tableId: this.tableId, chatRoomId });
      
      // Set this as the active chat room
      chatService.setActiveChatRoom(chatRoomId);
      
      return chatRoomId;
    } catch (error) {
      logger.error('[GameChatConnector] Error ensuring table chat room:', {
        tableId: this.tableId,
        error,
      });
      throw error;
    }
  }

  /**
   * Adds a player to the table's chat room
   */
  public async addPlayerToTableChat(playerId: string): Promise<void> {
    try {
      const table = await this.tableService.getTable();
      if (!table) {
        throw new Error('Table not found');
      }

      const roomId = `table_${this.tableId}`;
      const participants = table.players.map(player => player.id);
      
      if (!participants.includes(playerId)) {
        participants.push(playerId);
      }

      const chatRoomId = await chatService.createOrGetChatRoom(participants, roomId);
      
      // Set this as the active chat room
      chatService.setActiveChatRoom(chatRoomId);
      
      logger.log('[GameChatConnector] Player added to table chat:', {
        tableId: this.tableId,
        playerId,
      });
    } catch (error) {
      logger.error('[GameChatConnector] Error adding player to table chat:', {
        tableId: this.tableId,
        playerId,
        error,
      });
      throw error;
    }
  }
}

// Export the class directly instead of a singleton instance
export default GameChatConnector; 