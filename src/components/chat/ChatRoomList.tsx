'use client';

import React from 'react';
import { useChat } from '@/hooks/useChat';
import { ChatRoom } from '@/services/chatService';
import { formatDistanceToNow } from 'date-fns';

interface ChatRoomListProps {
  onSelectRoom?: (roomId: string) => void;
}

export const ChatRoomList: React.FC<ChatRoomListProps> = ({ onSelectRoom }) => {
  const { availableRooms, activeChatRoom, selectChatRoom } = useChat();
  
  const handleSelectRoom = async (roomId: string): Promise<void> => {
    await selectChatRoom(roomId);
    onSelectRoom?.(roomId);
  };
  
  if (availableRooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
        <p>No conversations yet</p>
        <p className="text-sm mt-2">Your chats will appear here</p>
      </div>
    );
  }
  
  return (
    <div className="overflow-y-auto">
      <h3 className="px-4 py-2 text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Conversations
      </h3>
      <ul className="divide-y divide-gray-200">
        {availableRooms.map((room) => (
          <li key={room.id}>
            <button
              onClick={() => handleSelectRoom(room.id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors duration-150 flex items-center ${
                activeChatRoom?.id === room.id ? 'bg-blue-50' : ''
              }`}
            >
              {/* Avatar placeholder */}
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center mr-3 text-gray-600">
                {room.participants.length > 1 ? (
                  <span>G</span>
                ) : (
                  <span>{room.participants[0].charAt(0).toUpperCase()}</span>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {room.name || (room.participants.length > 1
                    ? `Group (${room.participants.length})`
                    : room.participants[0])}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {room.lastActivity
                    ? formatDistanceToNow(new Date(room.lastActivity), {
                        addSuffix: true,
                      })
                    : 'No recent activity'}
                </p>
              </div>
              
              {activeChatRoom?.id === room.id && (
                <span className="w-2 h-2 bg-blue-600 rounded-full ml-2"></span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChatRoomList; 