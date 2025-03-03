'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import ChatButton from './ChatButton';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatRoomList from './ChatRoomList';

export const ChatWidget: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showRoomList, setShowRoomList] = useState<boolean>(false);
  const { user } = useAuth();
  const { 
    messages, 
    activeChatRoom,
    sendMessage,
    inputValue,
    setInputValue,
    getSortedMessages
  } = useChat();
  
  // Log component initialization
  useEffect(() => {
    console.log('[ChatWidget] Initializing with auth state:', {
      isAuthenticated: !!user,
      userId: user?.uid,
    });
  }, [user]);

  // Log chat state changes
  useEffect(() => {
    console.log('[ChatWidget] Chat state updated:', {
      hasMessages: !!messages && Object.keys(messages).length > 0,
      hasActiveChatRoom: !!activeChatRoom,
      isExpanded,
      showRoomList,
    });
  }, [messages, activeChatRoom, isExpanded, showRoomList]);
  
  // Track unread messages
  useEffect(() => {
    if (!isExpanded && messages) {
      // If widget is not expanded, increment unread count for new messages
      // that aren't from the current user
      const newMessages = Object.values(messages).filter(
        msg => msg.senderId !== user?.uid && msg.timestamp > Date.now() - 10000
      );
      
      if (newMessages.length > 0) {
        setUnreadCount(prevCount => prevCount + newMessages.length);
      }
    }
  }, [messages, isExpanded, user]);
  
  // Reset unread count when expanding
  useEffect(() => {
    if (isExpanded) {
      setUnreadCount(0);
    }
  }, [isExpanded]);
  
  // Show room list if no active room
  useEffect(() => {
    if (!activeChatRoom) {
      setShowRoomList(true);
    }
  }, [activeChatRoom]);
  
  const toggleChat = (): void => {
    setIsExpanded(prev => !prev);
  };
  
  const toggleRoomList = (): void => {
    setShowRoomList(prev => !prev);
  };
  
  const handleSelectRoom = (): void => {
    setShowRoomList(false);
  };
  
  // Get sorted messages
  const sortedMessages = getSortedMessages();
  
  // Determine appropriate widget size based on screen width
  const widgetClasses = isExpanded
    ? `fixed bottom-0 right-0 z-50 flex flex-col bg-white shadow-lg rounded-t-lg transition-all duration-300 ease-in-out
       sm:bottom-6 sm:right-6 sm:rounded-lg
       sm:w-96 sm:h-[500px]
       md:w-96 md:h-[500px]
       lg:w-96 lg:h-[600px]`
    : 'hidden';
  
  return (
    <>
      {/* Chat Button */}
      {!isExpanded && (
        <ChatButton onClick={toggleChat} unreadCount={unreadCount} />
      )}
      
      {/* Chat Widget */}
      <div className={widgetClasses}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white rounded-t-lg">
          <div className="flex items-center">
            {activeChatRoom && !showRoomList && (
              <button
                onClick={toggleRoomList}
                className="mr-2 p-1 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label="View conversations"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <h3 className="font-semibold">
              {showRoomList ? 'Conversations' : activeChatRoom ? 'Chat' : 'Select a Conversation'}
            </h3>
          </div>
          <button
            onClick={toggleChat}
            className="p-1 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Close chat"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        
        {/* Message List or Room List */}
        <div className="flex-grow overflow-hidden">
          {showRoomList ? (
            <ChatRoomList onSelectRoom={handleSelectRoom} />
          ) : activeChatRoom ? (
            <MessageList 
              messages={sortedMessages} 
              currentUserId={user?.uid || ''} 
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>No active conversation</p>
            </div>
          )}
        </div>
        
        {/* Input */}
        {!showRoomList && (
          <ChatInput
            onSendMessage={sendMessage}
            value={inputValue}
            onChange={setInputValue}
            disabled={!activeChatRoom}
            placeholder={activeChatRoom ? "Type a message..." : "Select a conversation to chat"}
          />
        )}
      </div>
    </>
  );
};

export default ChatWidget; 