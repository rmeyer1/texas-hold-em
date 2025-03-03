'use client';

import React from 'react';
import { ChatMessage } from '@/services/chatService';
import { formatDistanceToNow } from 'date-fns';

interface MessageItemProps {
  message: ChatMessage;
  isCurrentUser: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, isCurrentUser }) => {
  // Format timestamp to relative time (e.g., "5 minutes ago")
  const formattedTime = formatDistanceToNow(new Date(message.timestamp), { 
    addSuffix: true,
    includeSeconds: true
  });
  
  return (
    <div
      className={`flex flex-col mb-4 ${
        isCurrentUser ? 'items-end' : 'items-start'
      }`}
    >
      {/* Sender name (only for received messages) */}
      {!isCurrentUser && (
        <span className="text-xs text-gray-500 mb-1">{message.senderName}</span>
      )}
      
      {/* Message bubble */}
      <div
        className={`px-4 py-2 rounded-lg max-w-[80%] break-words ${
          isCurrentUser
            ? 'bg-blue-600 text-white rounded-br-none'
            : 'bg-gray-200 text-gray-800 rounded-bl-none'
        }`}
      >
        <p className="text-sm">{message.text}</p>
      </div>
      
      {/* Timestamp */}
      <span className="text-xs text-gray-500 mt-1">{formattedTime}</span>
    </div>
  );
};

export default MessageItem; 