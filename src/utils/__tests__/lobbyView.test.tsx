import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { LobbyView } from '@/components/lobby/LobbyView';
import { useAuth } from '@/contexts/AuthContext';
import { GameManager } from '@/services/gameManager';
import { useRouter } from 'next/navigation';
import { connectionManager } from '@/services/connectionManager';
import userEvent from '@testing-library/user-event';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock GameManager constructor and its createTable method
const mockCreateTable = jest.fn().mockResolvedValue('new-table-123');
jest.mock('@/services/gameManager', () => {
  return {
    GameManager: jest.fn().mockImplementation(() => {
      return {
        createTable: mockCreateTable
      };
    })
  };
});

jest.mock('@/services/connectionManager', () => ({
  connectionManager: {
    registerConnection: jest.fn().mockImplementation((path, callback) => {
      // Call the callback with mock data
      callback({
        exists: () => true,
        val: () => ({
          'table-1': {
            name: 'Test Table',
            players: ['player1', 'player2'],
            maxPlayers: 6,
            smallBlind: 10,
            bigBlind: 20,
            isPrivate: false,
          },
        }),
      });
      return jest.fn(); // Return mock unsubscribe function
    }),
  },
}));

jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  onValue: jest.fn(),
  set: jest.fn(),
  database: {},
}));

jest.mock('@/components/lobby/LobbyTable', () => ({
  LobbyTable: ({ table, onJoin }: any) => (
    <div data-testid={`table-${table.id}`}>
      <div>{table.name}</div>
      <div>Players: {table.players}/{table.maxPlayers}</div>
      <div>Blinds: {table.smallBlind}/{table.bigBlind}</div>
      {table.isPrivate && <div>Private</div>}
      <button onClick={() => onJoin(table.id)}>Join Table</button>
    </div>
  ),
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
    mockCreateTable.mockClear();
  });

  it('renders Create Table button', () => {
    render(<LobbyView />);
    expect(screen.getByText('Create Table')).toBeInTheDocument();
  });

  it('opens modal when Create Table button is clicked', async () => {
    render(<LobbyView />);
    
    await act(async () => {
      fireEvent.click(screen.getByText('Create Table'));
    });
    
    expect(screen.getByText('Create New Table')).toBeInTheDocument();
  });

  it('submits public table creation successfully', async () => {
    const user = userEvent.setup();
    render(<LobbyView />);
    
    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByText('Create Table'));
    });
    
    // Fill form
    await act(async () => {
      const nameInput = screen.getByPlaceholderText('Enter table name');
      await user.type(nameInput, 'My Table');
      
      // Get inputs by their name attribute
      const inputs = screen.getAllByRole('spinbutton');
      const smallBlindInput = inputs.find(input => input.getAttribute('name') === 'smallBlind');
      const bigBlindInput = inputs.find(input => input.getAttribute('name') === 'bigBlind');
      const maxPlayersInput = inputs.find(input => input.getAttribute('name') === 'maxPlayers');
      
      if (smallBlindInput) {
        await user.clear(smallBlindInput);
        await user.type(smallBlindInput, '10');
      }
      
      if (bigBlindInput) {
        await user.clear(bigBlindInput);
        await user.type(bigBlindInput, '20');
      }
      
      if (maxPlayersInput) {
        await user.clear(maxPlayersInput);
        await user.type(maxPlayersInput, '6');
      }
    });
    
    // Submit form by clicking the submit button
    await act(async () => {
      // Find the submit button within the modal
      const submitButton = screen.getByText('Create Table', { selector: 'button[type="submit"]' });
      fireEvent.click(submitButton);
    });
    
    // Verify GameManager.createTable was called correctly
    expect(mockCreateTable).toHaveBeenCalledWith(
      'My Table',
      10,
      20,
      6,
      false,
      undefined
    );
    
    // Verify navigation
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalled();
    });
  });

  it('submits private table with password', async () => {
    const user = userEvent.setup();
    render(<LobbyView />);
    
    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByText('Create Table'));
    });
    
    // Fill form
    await act(async () => {
      const nameInput = screen.getByPlaceholderText('Enter table name');
      await user.type(nameInput, 'Private Table');
      
      // Get inputs by their name attribute
      const inputs = screen.getAllByRole('spinbutton');
      const smallBlindInput = inputs.find(input => input.getAttribute('name') === 'smallBlind');
      const bigBlindInput = inputs.find(input => input.getAttribute('name') === 'bigBlind');
      const maxPlayersInput = inputs.find(input => input.getAttribute('name') === 'maxPlayers');
      
      if (smallBlindInput) {
        await user.clear(smallBlindInput);
        await user.type(smallBlindInput, '10');
      }
      
      if (bigBlindInput) {
        await user.clear(bigBlindInput);
        await user.type(bigBlindInput, '20');
      }
      
      if (maxPlayersInput) {
        await user.clear(maxPlayersInput);
        await user.type(maxPlayersInput, '6');
      }
      
      const privateCheckbox = screen.getByLabelText('Private Table');
      await user.click(privateCheckbox);
      
      // Check if password input is now visible before interacting with it
      await waitFor(() => {
        const passwordInput = screen.getByPlaceholderText('Enter table password');
        return passwordInput;
      });
      
      const passwordInput = screen.getByPlaceholderText('Enter table password');
      await user.type(passwordInput, 'secret123');
    });
    
    // Submit form by clicking the submit button
    await act(async () => {
      // Find the submit button within the modal
      const submitButton = screen.getByText('Create Table', { selector: 'button[type="submit"]' });
      fireEvent.click(submitButton);
    });
    
    // Verify GameManager.createTable was called with password
    expect(mockCreateTable).toHaveBeenCalledWith(
      'Private Table',
      10,
      20,
      6,
      true,
      'secret123'
    );
  });

  it('rejects table creation when not authenticated', async () => {
    // Mock window.alert
    const alertMock = jest.spyOn(window, 'alert').mockImplementation(() => {});
    
    // Set user to null
    (useAuth as jest.Mock).mockReturnValue({ user: null });
    
    const user = userEvent.setup();
    render(<LobbyView />);
    
    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByText('Create Table'));
    });
    
    // Fill form with minimal data
    await act(async () => {
      const nameInput = screen.getByPlaceholderText('Enter table name');
      await user.type(nameInput, 'Test Table');
    });
    
    // Submit form by clicking the submit button
    await act(async () => {
      // Find the submit button within the modal
      const submitButton = screen.getByText('Create Table', { selector: 'button[type="submit"]' });
      fireEvent.click(submitButton);
    });
    
    // Check alert was shown
    expect(alertMock).toHaveBeenCalledWith('Must be signed in to create a table');
    
    // Verify GameManager was not called
    expect(mockCreateTable).not.toHaveBeenCalled();
    
    // Clean up mock
    alertMock.mockRestore();
  });

  it('joins a table when clicking Join Table button', async () => {
    render(<LobbyView />);
    
    // Wait for tables to load
    await waitFor(() => {
      expect(screen.getByTestId('table-table-1')).toBeInTheDocument();
    });
    
    await act(async () => {
      fireEvent.click(screen.getByText('Join Table'));
    });
    
    // Verify navigation
    expect(mockRouter.push).toHaveBeenCalledWith('/table/table-1');
  });
}); 