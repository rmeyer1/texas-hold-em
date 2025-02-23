import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LobbyView } from '@/components/lobby/LobbyView';
import { useAuth } from '@/contexts/AuthContext';
import { GameManager } from '@/services/gameManager';
import { useRouter } from 'next/navigation';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/gameManager');
jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  onValue: jest.fn((ref, callback) => {
    callback({
      exists: () => true,
      val: () => ({
        'table-1': {
          name: 'Test Table',
          players: 2,
          maxPlayers: 6,
          bigBlind: 20,
          isPrivate: false,
        },
      }),
    });
    return jest.fn(); // Unsubscribe function
  }),
  set: jest.fn(),
  database: {},
}));

describe('LobbyView', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockUser = {
    uid: 'test-user-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser });
    (GameManager as jest.Mock).mockImplementation(() => ({
      createTable: jest.fn().mockResolvedValue('new-table-123'),
    }));
  });

  it('renders Create Table button', () => {
    render(<LobbyView />);
    expect(screen.getByText('Create Table')).toBeInTheDocument();
  });

  it('opens modal when Create Table button is clicked', async () => {
    render(<LobbyView />);
    const createButton = screen.getByText('Create Table');
    await userEvent.click(createButton);
    expect(screen.getByText('Create New Table')).toBeInTheDocument();
  });

  it('submits public table creation successfully', async () => {
    render(<LobbyView />);
    
    // Open modal
    await userEvent.click(screen.getByText('Create Table'));
    
    // Fill form
    await userEvent.type(screen.getByLabelText('Table Name'), 'My Table');
    await userEvent.type(screen.getByLabelText('Small Blind'), '10');
    await userEvent.type(screen.getByLabelText('Big Blind'), '20');
    await userEvent.type(screen.getByLabelText('Max Players'), '6');
    
    // Submit form
    await userEvent.click(screen.getByText('Create'));
    
    // Verify GameManager was called correctly
    expect(GameManager).toHaveBeenCalledWith('temp');
    const mockGameManager = (GameManager as jest.Mock).mock.instances[0];
    expect(mockGameManager.createTable).toHaveBeenCalledWith(
      'My Table',
      10,
      20,
      6,
      false,
      undefined
    );
    
    // Verify navigation
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/table/new-table-123');
    });
  });

  it('submits private table with password', async () => {
    render(<LobbyView />);
    
    // Open modal
    await userEvent.click(screen.getByText('Create Table'));
    
    // Fill form
    await userEvent.type(screen.getByLabelText('Table Name'), 'Private Table');
    await userEvent.type(screen.getByLabelText('Small Blind'), '10');
    await userEvent.type(screen.getByLabelText('Big Blind'), '20');
    await userEvent.type(screen.getByLabelText('Max Players'), '6');
    await userEvent.click(screen.getByLabelText('Private Table'));
    await userEvent.type(screen.getByLabelText('Password'), 'secret123');
    
    // Submit form
    await userEvent.click(screen.getByText('Create'));
    
    // Verify GameManager was called with password
    const mockGameManager = (GameManager as jest.Mock).mock.instances[0];
    expect(mockGameManager.createTable).toHaveBeenCalledWith(
      'Private Table',
      10,
      20,
      6,
      true,
      'secret123'
    );
  });

  it('rejects table creation when not authenticated', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    
    render(<LobbyView />);
    await userEvent.click(screen.getByText('Create Table'));
    await userEvent.click(screen.getByText('Create'));
    
    expect(screen.getByText('Must be signed in to create a table')).toBeInTheDocument();
    expect(GameManager).not.toHaveBeenCalled();
  });

  it('joins private table with correct password', async () => {
    const mockPrivateTable = {
      'private-table': {
        id: 'private-table',
        name: 'Private Table',
        players: 2,
        maxPlayers: 6,
        bigBlind: 20,
        isPrivate: true,
        password: 'correct123',
      },
    };

    jest.spyOn(window, 'prompt').mockReturnValue('correct123');
    
    render(<LobbyView />);
    
    // Find and click join button
    const joinButton = screen.getByText('Join');
    await userEvent.click(joinButton);
    
    // Verify navigation
    expect(mockRouter.push).toHaveBeenCalledWith('/table/private-table');
  });
}); 