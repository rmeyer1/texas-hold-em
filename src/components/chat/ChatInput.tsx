'use client';

import React, { useState, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  placeholder = 'Type a message...',
  disabled = false,
  value,
  onChange,
}) => {
  // If value/onChange are provided, use them (controlled component)
  // Otherwise, use local state (uncontrolled component)
  const [inputValue, setInputValue] = useState<string>('');
  
  const currentValue = value !== undefined ? value : inputValue;
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = e.target.value;
    if (onChange) {
      onChange(newValue);
    } else {
      setInputValue(newValue);
    }
  };
  
  const handleSendMessage = (): void => {
    if (currentValue.trim() === '') return;
    
    onSendMessage(currentValue.trim());
    
    // Only clear if using internal state
    if (onChange === undefined) {
      setInputValue('');
    }
  };
  
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  return (
    <div className="flex items-center p-3 border-t border-gray-200 bg-white">
      <input
        type="text"
        value={currentValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-grow px-4 py-2 rounded-l-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        aria-label="Type a message"
      />
      <button
        onClick={handleSendMessage}
        disabled={disabled || currentValue.trim() === ''}
        className={`px-4 py-2 rounded-r-full ${
          disabled || currentValue.trim() === ''
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        } text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-label="Send message"
      >
        <span className="sr-only">Send</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5"
        >
          <path
            fillRule="evenodd"
            d="M3.22 1.22a.75.75 0 011.06 0l6.5 6.5a.75.75 0 010 1.06l-6.5 6.5a.75.75 0 01-1.06-1.06L8.94 8 3.22 2.28a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
};

export default ChatInput; 