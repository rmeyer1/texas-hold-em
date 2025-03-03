import chatService, { ChatService } from '../chatService';
import { ref, get, set, push, update, onValue, off, query, orderByChild, limitToFirst } from 'firebase/database';
import { database } from '../firebase';
import { getAuth } from 'firebase/auth';

// Mock Firebase
jest.mock('../firebase', () => ({
  database: {},
}));

jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  push: jest.fn(),
  update: jest.fn(),
  onValue: jest.fn(),
  off: jest.fn(),
  query: jest.fn(),
  orderByChild: jest.fn(),
  limitToFirst: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

describe('ChatService', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock authentication
    (getAuth as jest.Mock).mockReturnValue({
      currentUser: {
        uid: 'test-user-id',
        displayName: 'Test User',
      },
    });
  });

  describe('getCurrentUser', () => {
    it('should return the current user when authenticated', () => {
      const user = chatService.getCurrentUser();
      expect(user).toEqual({
        id: 'test-user-id',
        name: 'Test User',
      });
      expect(getAuth).toHaveBeenCalled();
    });

    it('should return null when not authenticated', () => {
      (getAuth as jest.Mock).mockReturnValue({
        currentUser: null,
      });
      const user = chatService.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('createOrGetChatRoom', () => {
    it('should create a new chat room if one does not exist', async () => {
      // Mock Firebase responses
      const mockPushRef = { key: 'new-chat-room-id' };
      (push as jest.Mock).mockReturnValue(mockPushRef);
      (get as jest.Mock).mockResolvedValue({ exists: () => false });
      (set as jest.Mock).mockResolvedValue(undefined);

      const participants = ['user1', 'test-user-id'];
      const result = await chatService.createOrGetChatRoom(participants);

      expect(result).toBe('new-chat-room-id');
      expect(ref).toHaveBeenCalledWith(database, 'chats');
      expect(push).toHaveBeenCalledWith(expect.any(Object));
      expect(set).toHaveBeenCalledWith(
        mockPushRef,
        expect.objectContaining({
          participants: ['test-user-id', 'user1'], // Should be sorted
          lastActivity: expect.any(Number),
        })
      );
    });

    it('should return existing chat room ID if one exists with same participants', async () => {
      // Mock Firebase snapshot with existing room
      const mockRoomSnapshot = {
        exists: () => true,
        forEach: jest.fn((callback) => {
          callback({
            key: 'existing-room-id',
            val: () => ({
              participants: ['test-user-id', 'user1'],
            }),
          });
          return false; // To stop iteration after first match
        }),
      };
      
      (get as jest.Mock).mockResolvedValue(mockRoomSnapshot);

      const participants = ['user1', 'test-user-id'];
      const result = await chatService.createOrGetChatRoom(participants);

      expect(result).toBe('existing-room-id');
      expect(ref).toHaveBeenCalledWith(database, 'chats');
      expect(get).toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled(); // Shouldn't create a new room
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      // Setup active chat room for tests
      chatService.setActiveChatRoom('test-chat-room');
      
      // Mock push return value
      (push as jest.Mock).mockReturnValue({ key: 'message-id' });
      (set as jest.Mock).mockResolvedValue(undefined);
      (update as jest.Mock).mockResolvedValue(undefined);
    });

    it('should send a message to the active chat room', async () => {
      // Mock get for message limit check
      (get as jest.Mock).mockResolvedValue({
        exists: () => true,
        val: () => ({}), // Empty list of messages
      });

      await chatService.sendMessage('Hello, world!');

      expect(push).toHaveBeenCalledWith(
        expect.any(Object) // Message ref
      );
      expect(set).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          text: 'Hello, world!',
          senderId: 'test-user-id',
          senderName: 'Test User',
          timestamp: expect.any(Number),
        })
      );
      expect(update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          lastActivity: expect.any(Number),
        })
      );
    });

    it('should throw an error if no active chat room', async () => {
      // Reset active chat room
      chatService.setActiveChatRoom(null as unknown as string);

      await expect(chatService.sendMessage('This should fail')).rejects.toThrow(
        'No active chat room'
      );
    });

    it('should enforce message limit when over 100 messages', async () => {
      // Create 101 mock messages
      const mockMessages: Record<string, any> = {};
      for (let i = 0; i < 101; i++) {
        mockMessages[`msg-${i}`] = { timestamp: Date.now() + i };
      }

      // Mock responses for message limit check
      (get as jest.Mock).mockImplementation((ref) => {
        // Different responses for different calls
        if (ref.toString().includes('messages')) {
          return Promise.resolve({
            exists: () => true,
            val: () => mockMessages,
          });
        }
        return Promise.resolve({ exists: () => false });
      });

      // Mock query for oldest messages
      (query as jest.Mock).mockReturnValue({});
      (orderByChild as jest.Mock).mockReturnValue({});
      (limitToFirst as jest.Mock).mockReturnValue({});

      // Mock response for oldest messages query
      const oldestMessagesSnapshot = {
        exists: () => true,
        forEach: jest.fn((callback) => {
          // Simulate finding oldest message to delete
          callback({ key: 'msg-0' });
        }),
      };
      
      // Different implementation for second get call
      (get as jest.Mock).mockImplementationOnce(() => Promise.resolve({
        exists: () => true,
        val: () => mockMessages,
      })).mockImplementationOnce(() => Promise.resolve(oldestMessagesSnapshot));

      await chatService.sendMessage('This should trigger message limit enforcement');

      // Check that update was called to delete oldest messages
      expect(update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          'msg-0': null,
        })
      );
    });
  });

  describe('subscribeToMessages', () => {
    beforeEach(() => {
      // Setup active chat room
      chatService.setActiveChatRoom('test-chat-room');
      
      // Mock onValue
      (onValue as jest.Mock).mockImplementation((ref, callback) => {
        // Simulate initial callback
        callback({
          val: () => ({
            'msg-1': { text: 'Hello', senderId: 'user1', timestamp: 1 },
          }),
        });
        
        // Return unsubscribe function
        return jest.fn();
      });
    });
    
    it('should subscribe to messages and return unsubscribe function', () => {
      const mockCallback = jest.fn();
      const unsubscribe = chatService.subscribeToMessages(mockCallback);
      
      expect(ref).toHaveBeenCalledWith(database, 'chats/test-chat-room/messages');
      expect(onValue).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalledWith({
        'msg-1': { text: 'Hello', senderId: 'user1', timestamp: 1 },
      });
      
      // Should return a function
      expect(typeof unsubscribe).toBe('function');
    });
    
    it('should do nothing if no active chat room is set', () => {
      // Reset active chat room
      chatService.setActiveChatRoom(null as unknown as string);
      
      const mockCallback = jest.fn();
      const unsubscribe = chatService.subscribeToMessages(mockCallback);
      
      expect(onValue).not.toHaveBeenCalled();
      expect(mockCallback).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('getUserChatRooms', () => {
    it('should retrieve and sort chat rooms for the current user', async () => {
      // Mock chat rooms in Firebase
      const mockRoomsSnapshot = {
        exists: () => true,
        forEach: jest.fn((callback) => {
          // Room with current user
          callback({
            key: 'room1',
            val: () => ({
              participants: ['test-user-id', 'user2'],
              lastActivity: 1000,
            }),
          });
          
          // Room without current user (should be filtered out)
          callback({
            key: 'room2',
            val: () => ({
              participants: ['user3', 'user4'],
              lastActivity: 2000,
            }),
          });
          
          // Another room with current user but older
          callback({
            key: 'room3',
            val: () => ({
              participants: ['test-user-id', 'user5'],
              lastActivity: 500,
            }),
          });
        }),
      };
      
      (get as jest.Mock).mockResolvedValue(mockRoomsSnapshot);
      
      const rooms = await chatService.getUserChatRooms();
      
      expect(rooms).toHaveLength(2);
      expect(rooms[0].id).toBe('room1'); // Most recent first
      expect(rooms[1].id).toBe('room3');
      expect(rooms[0].lastActivity).toBe(1000);
      expect(rooms[1].lastActivity).toBe(500);
    });
    
    it('should return empty array if no chat rooms exist', async () => {
      (get as jest.Mock).mockResolvedValue({
        exists: () => false,
      });
      
      const rooms = await chatService.getUserChatRooms();
      
      expect(rooms).toEqual([]);
    });
  });
}); 