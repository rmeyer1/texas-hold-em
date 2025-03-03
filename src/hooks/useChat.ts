import { useState, useCallback } from 'react';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import type { ChatMessage, ChatRoom } from '@/services/chatService';

interface ChatHookReturn {
  // Chat state
  messages: Record<string, ChatMessage>;
  activeChatRoom: ChatRoom | null;
  availableRooms: ChatRoom[];
  loading: boolean;
  error: string | null;
  
  // Chat actions
  sendMessage: (text: string) => Promise<void>;
  startChatWith: (userId: string) => Promise<void>;
  selectChatRoom: (roomId: string) => Promise<void>;
  
  // Message input state
  inputValue: string;
  setInputValue: (value: string) => void;
  
  // Utility functions
  getSortedMessages: () => ChatMessage[];
  clearInput: () => void;
}

export const useChat = (): ChatHookReturn => {
  // Get base chat functionality from context
  const { 
    messages, 
    activeChatRoom, 
    availableRooms, 
    sendMessage: contextSendMessage,
    createOrJoinChatRoom,
    setActiveChatRoomById,
    loading,
    error 
  } = useChatContext();
  
  // Local state for message input
  const [inputValue, setInputValue] = useState<string>('');
  
  // Send message wrapper that includes clearing input
  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return;
    
    try {
      await contextSendMessage(text);
      setInputValue('');
    } catch (error) {
      console.error('Failed to send message:', error);
      // Error is already handled in context
    }
  }, [contextSendMessage]);
  
  // Convenience function to start a chat with another user
  const startChatWith = useCallback(async (userId: string): Promise<void> => {
    try {
      await createOrJoinChatRoom([userId]);
    } catch (error) {
      console.error('Failed to start chat:', error);
      // Error is already handled in context
    }
  }, [createOrJoinChatRoom]);
  
  // Convenience function to select a chat room
  const selectChatRoom = useCallback(async (roomId: string): Promise<void> => {
    try {
      await setActiveChatRoomById(roomId);
    } catch (error) {
      console.error('Failed to select chat room:', error);
      // Error is already handled in context
    }
  }, [setActiveChatRoomById]);
  
  // Utility function to get messages sorted by timestamp
  const getSortedMessages = useCallback((): ChatMessage[] => {
    return Object.entries(messages)
      .map(([, message]) => message)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);
  
  // Utility function to clear input
  const clearInput = useCallback((): void => {
    setInputValue('');
  }, []);
  
  return {
    // State
    messages,
    activeChatRoom,
    availableRooms,
    loading,
    error,
    
    // Actions
    sendMessage,
    startChatWith,
    selectChatRoom,
    
    // Message input
    inputValue,
    setInputValue,
    
    // Utilities
    getSortedMessages,
    clearInput,
  };
}; 