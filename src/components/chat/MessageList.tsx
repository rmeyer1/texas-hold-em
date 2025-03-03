'use client';

import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '@/services/chatService';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, currentUserId }) => {
  const messageEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // If no messages, show a placeholder
  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500">
        <p>No messages yet</p>
        <p className="text-sm">Start the conversation!</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col p-4 overflow-y-auto">
      {messages.map((message) => (
        <MessageItem
          key={message.timestamp.toString() + message.senderId}
          message={message}
          isCurrentUser={message.senderId === currentUserId}
        />
      ))}
      {/* This empty div is used for auto-scrolling */}
      <div ref={messageEndRef} />
    </div>
  );
};

export default MessageList; 