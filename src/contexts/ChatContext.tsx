'use client';
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import chatService, { ChatMessage, ChatRoom } from '@/services/chatService';
import { useAuth } from './AuthContext';
import { GameManager } from '@/services/gameManager';

// Define the shape of our chat context
interface ChatContextType {
  messages: Record<string, ChatMessage>;
  activeChatRoom: ChatRoom | null;
  availableRooms: ChatRoom[];
  sendMessage: (text: string) => Promise<void>;
  createOrJoinChatRoom: (participants: string[]) => Promise<void>;
  setActiveChatRoomById: (roomId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

// Create the context with default values
const ChatContext = createContext<ChatContextType>({
  messages: {},
  activeChatRoom: null,
  availableRooms: [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendMessage: async (_text: string): Promise<void> => {
    throw new Error('ChatContext not initialized');
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createOrJoinChatRoom: async (_participants: string[]): Promise<void> => {
    throw new Error('ChatContext not initialized');
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setActiveChatRoomById: async (_roomId: string): Promise<void> => {
    throw new Error('ChatContext not initialized');
  },
  loading: true,
  error: null,
});

// Custom hook to use the chat context
export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

// Props for the ChatProvider component
interface ChatProviderProps {
  children: ReactNode;
}

// ChatProvider component
export const ChatProvider = ({ children }: ChatProviderProps): React.ReactElement => {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<Record<string, ChatMessage>>({});
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [availableRooms, setAvailableRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize table chat room
  useEffect(() => {
    const initializeTableChat = async (): Promise<void> => {
      if (!user || authLoading) return;

      try {
        // Get table ID from URL
        const pathSegments = window.location.pathname.split('/');
        const tableId = pathSegments[pathSegments.length - 1];
        
        if (tableId && tableId.startsWith('table-')) {
          console.log('[ChatContext] Initializing table chat room:', tableId);
          
          // Get table data to get the name
          const tableData = await GameManager.getTableData(tableId);
          if (!tableData) {
            throw new Error('Table not found');
          }
          
          // Create or join the table chat room
          const chatRoomId = await chatService.createOrGetChatRoom(
            [user.uid], // Start with current user, others will be added as they join
            `table_${tableId}`, // Prefix with table_ to identify table chat rooms
            tableData.name || `Table ${tableId}` // Use table name or fallback
          );
          
          console.log('[ChatContext] Table chat room initialized:', chatRoomId);
          
          // Set as active chat room
          await setActiveChatRoomById(chatRoomId);
        }
      } catch (error) {
        console.error('[ChatContext] Failed to initialize table chat:', error);
        setError('Failed to initialize table chat');
      }
    };

    initializeTableChat();
  }, [user, authLoading]);

  // Load available chat rooms when user is authenticated
  useEffect(() => {
    let isMounted = true;

    const loadChatRooms = async (): Promise<void> => {
      console.log('[ChatContext] Loading chat rooms. User state:', { 
        isAuthenticated: !!user, 
        isLoading: authLoading 
      });

      if (!user || authLoading) {
        console.log('[ChatContext] Skipping chat room load - no user or still loading');
        return;
      }

      try {
        const rooms = await chatService.getUserChatRooms();
        console.log('[ChatContext] Successfully loaded chat rooms:', rooms.length);
        if (isMounted) {
          setAvailableRooms(rooms);
          setLoading(false);
        }
      } catch (error) {
        console.error('[ChatContext] Failed to load chat rooms:', error);
        if (isMounted) {
          setError('Failed to load chat rooms');
          setLoading(false);
        }
      }
    };

    loadChatRooms();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  // Subscribe to messages when active chat room changes
  useEffect(() => {
    if (!activeChatRoom) {
      setMessages({});
      return undefined;
    }

    chatService.setActiveChatRoom(activeChatRoom.id);
    
    // Subscribe to messages
    const unsubscribe = chatService.subscribeToMessages((updatedMessages) => {
      setMessages(updatedMessages);
    });

    return () => {
      unsubscribe();
    };
  }, [activeChatRoom]);

  // Clean up when unmounting
  useEffect(() => {
    return () => {
      chatService.cleanup();
    };
  }, []);

  // Function to create or join a chat room
  const createOrJoinChatRoom = async (participants: string[]): Promise<void> => {
    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Ensure current user is included in participants
      if (!participants.includes(user.uid)) {
        participants.push(user.uid);
      }

      const roomId = await chatService.createOrGetChatRoom(participants);
      
      // Find the created/joined room in available rooms or fetch it
      let room = availableRooms.find(r => r.id === roomId);
      
      if (!room) {
        // Refresh available rooms
        const updatedRooms = await chatService.getUserChatRooms();
        setAvailableRooms(updatedRooms);
        room = updatedRooms.find(r => r.id === roomId);
      }
      
      if (room) {
        setActiveChatRoom(room);
      }
    } catch (error) {
      setError('Failed to create or join chat room');
      throw error;
    }
  };

  // Function to send a message
  const sendMessage = async (text: string): Promise<void> => {
    try {
      if (!activeChatRoom) {
        throw new Error('No active chat room');
      }

      await chatService.sendMessage(text);
    } catch (error) {
      setError('Failed to send message');
      throw error;
    }
  };

  // Function to set the active chat room by ID
  const setActiveChatRoomById = async (roomId: string): Promise<void> => {
    try {
      // Find the room in available rooms
      const room = availableRooms.find(r => r.id === roomId);
      
      if (!room) {
        // If not found, try to refresh available rooms
        const updatedRooms = await chatService.getUserChatRooms();
        setAvailableRooms(updatedRooms);
        
        const updatedRoom = updatedRooms.find(r => r.id === roomId);
        if (!updatedRoom) {
          throw new Error(`Chat room with ID ${roomId} not found`);
        }
        
        setActiveChatRoom(updatedRoom);
      } else {
        setActiveChatRoom(room);
      }
    } catch (error) {
      setError('Failed to set active chat room');
      throw error;
    }
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        activeChatRoom,
        availableRooms,
        sendMessage,
        createOrJoinChatRoom,
        setActiveChatRoomById,
        loading: loading || authLoading,
        error,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}; 