import { 
  ref, 
  set, 
  push, 
  update, 
  onValue, 
  off,
  query, 
  orderByChild, 
  limitToFirst, 
  get,
  DataSnapshot,
  
} from 'firebase/database';
import { database } from './firebase';
import { getAuth } from 'firebase/auth';
import { serializeError } from '@/utils/errorUtils';
import logger from '@/utils/logger';
import { validateMessage } from '@/utils/profanityFilter';

export interface ChatMessage {
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
}

export interface ChatRoom {
  id: string ;
  participants: string[];
  lastActivity: number;
  createdAt: number;
  type: 'direct' | 'table';
  name?: string;
} ;

export class ChatService {
  private db = database;
  private chatRoomId: string | null = null;
  private messageListeners: Record<string, () => void> = {};
  
  /**
   * Get the current authenticated user ID
   */
  getCurrentUser(): { id: string; name: string } | null {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      logger.warn('[ChatService] No authenticated user:', {
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(0, 3).join('\n'),
      });
      return null;
    }
    return { 
      id: user.uid, 
      name: user.displayName || 'Anonymous'
    };
  }
  
  /**
   * Creates a new chat room or gets an existing one
   * @param participants Array of participant IDs
   * @param roomId Optional predefined room ID (e.g., for table chat rooms)
   * @param roomName Optional room name
   * @returns The ID of the created or existing chat room
   */
  public async createOrGetChatRoom(participants: string[], roomId?: string, roomName?: string): Promise<string> {
    try {
      // If roomId is provided, try to get existing room first
      if (roomId) {
        console.log('[ChatService] Checking for existing chat room:', roomId);
        const existingRoom = await this.getChatRoom(roomId);
        if (existingRoom) {
          console.log('[ChatService] Found existing chat room, updating participants');
          // Update participants if needed
          const updatedParticipants = Array.from(new Set([...existingRoom.participants, ...participants]));
          const updates: Partial<ChatRoom> = {};
          
          if (updatedParticipants.length !== existingRoom.participants.length) {
            console.log('[ChatService] Adding new participants to room');
            updates.participants = updatedParticipants;
          }
          
          // Update room name if provided and different
          if (roomName && roomName !== existingRoom.name) {
            console.log('[ChatService] Updating room name');
            updates.name = roomName;
          }
          
          if (Object.keys(updates).length > 0) {
            await this.updateChatRoom(roomId, updates);
          }
          return roomId;
        }
      }

      // Sort participants to ensure consistent room creation
      const sortedParticipants = [...participants].sort();
      
      // Generate room ID if not provided
      const finalRoomId = roomId || this.generateRoomId(sortedParticipants);
      console.log('[ChatService] Creating new chat room:', finalRoomId);

      // Create the chat room
      const chatRoom: ChatRoom = {
        id: finalRoomId,
        participants: sortedParticipants,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        type: roomId?.startsWith('table_') ? 'table' : 'direct',
        name: roomName
      };

      await this.createChatRoom(chatRoom);
      console.log('[ChatService] Successfully created chat room:', finalRoomId);
      return finalRoomId;
    } catch (error) {
      console.error('[ChatService] Error in createOrGetChatRoom:', error);
      throw error;
    }
  }
  
  /**
   * Send a message to the current chat room
   * @param text The message text to send
   */
  async sendMessage(text: string): Promise<void> {
    try {
      if (!this.chatRoomId) {
        console.error('[ChatService] Attempted to send message without active chat room');
        throw new Error('No active chat room');
      }
      
      const currentUser = this.getCurrentUser();
      if (!currentUser) {
        console.error('[ChatService] Attempted to send message without authenticated user');
        throw new Error('User not authenticated');
      }
      
      console.log('[ChatService] Sending message to room:', this.chatRoomId);
      
      // Filter profanity before sending the message
      const { filteredText, isValid } = validateMessage(text);
      
      if (!isValid) {
        console.warn('[ChatService] Message rejected due to content policy');
        throw new Error('Message contains unacceptable content');
      }
      
      // Create message object with filtered text
      const message: ChatMessage = {
        text: filteredText,
        senderId: currentUser.id,
        senderName: currentUser.name,
        timestamp: Date.now()
      };
      
      console.log('[ChatService] Pushing message to Firebase');
      
      // Push new message
      const newMessageRef = push(ref(this.db, `chats/${this.chatRoomId}/messages`));
      await set(newMessageRef, message);
      
      console.log('[ChatService] Message sent successfully');
      
      // Update last activity timestamp
      await update(ref(this.db, `chats/${this.chatRoomId}`), {
        lastActivity: message.timestamp
      });
      
      // Enforce message limit (100 messages)
      await this.enforceMessageLimit();
    } catch (error) {
      console.error('[ChatService] Error sending message:', serializeError(error));
      throw error;
    }
  }
  
  /**
   * Subscribe to messages in the current chat room
   * @param callback Function to call when messages update
   * @returns Function to unsubscribe
   */
  subscribeToMessages(callback: (messages: Record<string, ChatMessage>) => void): () => void {
    if (!this.chatRoomId) {
      logger.warn('[ChatService] Attempted to subscribe to messages without active chat room');
      return () => {}; // Return empty function
    }
    
    const messagesRef = ref(this.db, `chats/${this.chatRoomId}/messages`);
    const handleMessages = (snapshot: DataSnapshot) => {
      const messages = snapshot.val() || {};
      callback(messages);
    };
    
    onValue(messagesRef, handleMessages);
    
    // Store listener reference for cleanup
    const listenerId = messagesRef.toString();
    this.messageListeners[listenerId] = () => off(messagesRef, 'value', handleMessages);
    
    // Return unsubscribe function
    return () => {
      if (this.messageListeners[listenerId]) {
        this.messageListeners[listenerId]();
        delete this.messageListeners[listenerId];
      }
    };
  }
  
  /**
   * Enforce the 100 message limit by removing oldest messages
   */
  private async enforceMessageLimit(): Promise<void> {
    try {
      if (!this.chatRoomId) {
        return;
      }
      
      const messagesRef = ref(this.db, `chats/${this.chatRoomId}/messages`);
      const snapshot = await get(messagesRef);
      
      // If we have more than 100 messages, delete the oldest ones
      const messageCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
      
      if (messageCount > 100) {
        // Get the oldest messages that exceed our limit
        const oldestMessagesQuery = query(
          messagesRef,
          orderByChild('timestamp'),
          limitToFirst(messageCount - 100)
        );
        
        const oldestMessagesSnapshot = await get(oldestMessagesQuery);
        
        if (oldestMessagesSnapshot.exists()) {
          // Create an update object that sets each old message to null
          const updates: Record<string, null> = {};
          
          oldestMessagesSnapshot.forEach((childSnapshot) => {
            updates[childSnapshot.key as string] = null;
          });
          
          // Apply the updates to remove the messages
          await update(messagesRef, updates);
        }
      }
    } catch (error) {
      logger.error('[ChatService] Error enforcing message limit:', serializeError(error));
      // Don't throw here to avoid interrupting the message send flow
    }
  }
  
  /**
   * Get available chat rooms for the current user
   */
  async getUserChatRooms(): Promise<ChatRoom[]> {
    try {
      const currentUser = this.getCurrentUser();
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      
      const chatsRef = ref(this.db, 'chats');
      const snapshot = await get(chatsRef);
      
      if (!snapshot.exists()) {
        return [];
      }
      
      const chatRooms: ChatRoom[] = [];
      
      snapshot.forEach((childSnapshot) => {
        const roomData = childSnapshot.val();
        if (roomData.participants && roomData.participants.includes(currentUser.id)) {
          chatRooms.push({
            id: childSnapshot.key as string,
            participants: roomData.participants,
            lastActivity: roomData.lastActivity || 0,
            createdAt: roomData.createdAt || 0,
            type: roomData.type || 'direct',
            name: roomData.name
          });
        }
      });
      
      // Sort rooms by lastActivity (most recent first)
      return chatRooms.sort((a, b) => b.lastActivity - a.lastActivity);
    } catch (error) {
      logger.error('[ChatService] Error getting user chat rooms:', serializeError(error));
      throw error;
    }
  }
  
  /**
   * Set the active chat room 
   */
  setActiveChatRoom(chatRoomId: string): void {
    this.chatRoomId = chatRoomId;
  }
  
  /**
   * Get the active chat room ID
   */
  getActiveChatRoomId(): string | null {
    return this.chatRoomId;
  }
  
  /**
   * Clean up any listeners when component unmounts
   */
  cleanup(): void {
    // Remove all listeners
    Object.values(this.messageListeners).forEach(unsubscribe => unsubscribe());
    this.messageListeners = {};
  }

  /**
   * Get a chat room by ID
   */
  private async getChatRoom(roomId: string): Promise<ChatRoom | null> {
    try {
      const roomRef = ref(this.db, `chats/${roomId}`);
      const snapshot = await get(roomRef);
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      logger.error('[ChatService] Error getting chat room:', error);
      throw error;
    }
  }

  /**
   * Update a chat room
   */
  private async updateChatRoom(roomId: string, updates: Partial<ChatRoom>): Promise<void> {
    try {
      const roomRef = ref(this.db, `chats/${roomId}`);
      await update(roomRef, updates);
    } catch (error) {
      logger.error('[ChatService] Error updating chat room:', error);
      throw error;
    }
  }

  /**
   * Create a new chat room
   */
  private async createChatRoom(chatRoom: ChatRoom): Promise<void> {
    try {
      const roomRef = ref(this.db, `chats/${chatRoom.id}`);
      await set(roomRef, chatRoom);
    } catch (error) {
      logger.error('[ChatService] Error creating chat room:', error);
      throw error;
    }
  }

  /**
   * Generate a room ID based on participants
   */
  private generateRoomId(participants: string[]): string {
    const participantKey = participants.join('_');
    return `chat_${participantKey}`;
  }
}

// Create singleton instance
const chatService = new ChatService();
export default chatService; 