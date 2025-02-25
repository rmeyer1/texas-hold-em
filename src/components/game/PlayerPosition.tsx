import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Player, Table, Card } from '@/types/poker';
import { Card as CardComponent } from './Card';
import { GameManager } from '@/services/gameManager';
import { getAuth } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';

interface PlayerPositionProps {
  player: Player;
  isDealer: boolean;
  isCurrentPlayer: boolean;
  position: number;
  totalPlayers: number;
  table: Table;
  isMobile?: boolean;
}

export const PlayerPosition: React.FC<PlayerPositionProps> = ({
  player,
  isDealer,
  isCurrentPlayer,
  position,
  totalPlayers,
  table,
  isMobile = false,
}) => {
  const [holeCards, setHoleCards] = useState<Card[]>([]);
  const [showCards, setShowCards] = useState(false);
  const [isAuthenticatedPlayer, setIsAuthenticatedPlayer] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [cardLoadError, setCardLoadError] = useState<string | null>(null);
  const { user } = useAuth(); // Use the auth context instead of direct Firebase auth
  const retryCount = useRef(0);
  const mounted = useRef(true);
  const currentRequestRef = useRef('');
  const gameManagerRef = useRef(new GameManager(table.id));

  // Determine card size based on mobile state
  const cardSize = isMobile ? 'sm' : 'md';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    gameManagerRef.current = new GameManager(table.id);
  }, [table.id]);

  const loadHoleCards = useCallback(async () => {
    // Reset error state
    setCardLoadError(null);
    setIsLoadingCards(true);
    
    const requestId = Math.random().toString(36).substring(7);
    currentRequestRef.current = requestId;
    const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase);
    
    console.log('[PlayerPosition] Starting card load:', {
      requestId,
      playerId: player.id,
      userId: user?.uid,
      isHandInProgress: table.isHandInProgress,
      isValidGamePhase,
      phase: table.phase,
      timestamp: new Date().toISOString(),
    });

    if (!user) {
      console.log('[PlayerPosition] Skipping card load - no authenticated user:', {
        requestId,
        playerId: player.id,
        timestamp: new Date().toISOString(),
      });
      setIsLoadingCards(false);
      return;
    }

    // Check if we're in a valid state to load cards
    if (!table.isHandInProgress && !isValidGamePhase) {
      console.log('[PlayerPosition] Skipping card load - no hand in progress and invalid game phase:', {
        requestId,
        playerId: player.id,
        isHandInProgress: table.isHandInProgress,
        isValidGamePhase,
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });
      setIsLoadingCards(false);
      return;
    }

    // Check if this player is the authenticated user
    if (user.uid !== player.id) {
      console.log('[PlayerPosition] Skipping card load - not the authenticated player:', {
        requestId,
        playerId: player.id,
        userId: user.uid,
        timestamp: new Date().toISOString(),
      });
      setIsLoadingCards(false);
      return;
    }

    try {
      // Check if this is still the current request
      if (currentRequestRef.current !== requestId) {
        console.log('[PlayerPosition] Cancelling outdated card load request:', {
          requestId,
          currentRequest: currentRequestRef.current,
          timestamp: new Date().toISOString(),
        });
        setIsLoadingCards(false);
        return;
      }

      console.log('[PlayerPosition] Calling getPlayerHoleCards:', {
        requestId,
        playerId: player.id,
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });

      const cards = await gameManagerRef.current.getPlayerHoleCards(player.id);
      
      // Check again if this is still the current request
      if (currentRequestRef.current !== requestId) {
        console.log('[PlayerPosition] Discarding outdated card load response:', {
          requestId,
          currentRequest: currentRequestRef.current,
          timestamp: new Date().toISOString(),
        });
        setIsLoadingCards(false);
        return;
      }

      console.log('[PlayerPosition] Received response from getPlayerHoleCards:', {
        requestId,
        playerId: player.id,
        hasCards: !!cards,
        cardsLength: cards ? cards.length : 0,
        cards: cards ? JSON.stringify(cards) : null,
        timestamp: new Date().toISOString(),
      });

      if (!cards || !Array.isArray(cards) || cards.length !== 2) {
        console.warn('[PlayerPosition] Invalid cards received:', {
          requestId,
          playerId: player.id,
          cards: cards ? JSON.stringify(cards) : null,
          phase: table.phase,
          timestamp: new Date().toISOString(),
        });
        
        const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase);
        // Only retry if we're in a valid game phase
        if ((table.isHandInProgress || isValidGamePhase) && retryCount.current < 3) {
          // Implement exponential backoff for retries
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 8000);
          console.log('[PlayerPosition] Scheduling retry:', {
            requestId,
            playerId: player.id,
            retryCount: retryCount.current,
            delay: retryDelay,
            phase: table.phase,
            isHandInProgress: table.isHandInProgress,
            isValidGamePhase,
            timestamp: new Date().toISOString(),
          });
          
          retryCount.current += 1;
          setTimeout(() => {
            if (mounted.current) {
              loadHoleCards();
            }
          }, retryDelay);
        } else if (retryCount.current >= 3) {
          console.error('[PlayerPosition] Max retries reached:', {
            requestId,
            playerId: player.id,
            retryCount: retryCount.current,
            phase: table.phase,
            timestamp: new Date().toISOString(),
          });
          
          // Set a user-friendly error message based on the game phase
          if (table.phase === 'waiting') {
            setCardLoadError("No active hand in progress.");
          } else if (table.phase === 'showdown') {
            setCardLoadError("Hand is complete. Waiting for next hand.");
          } else {
            setCardLoadError("Couldn't load your cards. Please try refreshing the page.");
          }
          setIsLoadingCards(false);
        } else {
          // If we're not in a valid game phase, just clear the retry counter
          console.log('[PlayerPosition] Not retrying - invalid game phase:', {
            requestId,
            playerId: player.id,
            phase: table.phase,
            timestamp: new Date().toISOString(),
          });
          retryCount.current = 0;
          setIsLoadingCards(false);
        }
        return;
      }

      console.log('[PlayerPosition] Successfully loaded cards:', {
        requestId,
        playerId: player.id,
        cards: JSON.stringify(cards),
        timestamp: new Date().toISOString(),
      });

      if (mounted.current) {
        setHoleCards(cards);
        setShowCards(true); // Always show cards for the authenticated player
        retryCount.current = 0;
        setIsLoadingCards(false);
      }
    } catch (error) {
      console.error('[PlayerPosition] Error loading cards:', {
        requestId,
        playerId: player.id,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : 'Unknown error',
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });

      // Set a user-friendly error message
      setCardLoadError("Error loading cards. Please try refreshing the page.");

      // Implement exponential backoff for error retries
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 8000);
      if (retryCount.current < 3) {
        console.log('[PlayerPosition] Scheduling error retry:', {
          requestId,
          playerId: player.id,
          retryCount: retryCount.current,
          delay: retryDelay,
          phase: table.phase,
          timestamp: new Date().toISOString(),
        });
        
        retryCount.current += 1;
        setTimeout(() => {
          if (mounted.current) {
            loadHoleCards();
          }
        }, retryDelay);
      } else {
        console.error('[PlayerPosition] Max error retries reached:', {
          requestId,
          playerId: player.id,
          retryCount: retryCount.current,
          phase: table.phase,
          timestamp: new Date().toISOString(),
        });
        retryCount.current = 0;
        setIsLoadingCards(false);
      }
    }
  }, [gameManagerRef, player.id, user, table.isHandInProgress, table.phase]);

  useEffect(() => {
    // Set authentication state based on auth context
    if (user) {
      const isAuthenticated = user.uid === player.id;
      console.log('[PlayerPosition] Authentication state updated:', {
        playerId: player.id,
        isAuthenticated,
        userId: user.uid,
        timestamp: new Date().toISOString(),
      });
      setIsAuthenticatedPlayer(isAuthenticated);
      
      // Only set showCards to true if we have cards to show
      if (isAuthenticated && holeCards.length === 2) {
        setShowCards(true);
      }
      
      setAuthError(null);
    } else {
      console.log('[PlayerPosition] No authenticated user:', {
        playerId: player.id,
        timestamp: new Date().toISOString(),
      });
      setIsAuthenticatedPlayer(false);
      setShowCards(false);
      setAuthError('Not authenticated');
    }
  }, [user, player.id, holeCards.length]);

  // Load hole cards when hand is in progress and player is authenticated
  useEffect(() => {
    const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase);
    if ((table.isHandInProgress || isValidGamePhase) && isAuthenticatedPlayer) {
      console.log('[PlayerPosition] Loading hole cards:', {
        playerId: player.id,
        isHandInProgress: table.isHandInProgress,
        isValidGamePhase,
        isAuthenticatedPlayer,
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });
      // Reset error state and retry count when conditions change
      setCardLoadError(null);
      retryCount.current = 0;
      loadHoleCards();
    } else {
      console.log('[PlayerPosition] Not loading hole cards - conditions not met:', {
        playerId: player.id,
        isHandInProgress: table.isHandInProgress,
        isValidGamePhase: ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase),
        isAuthenticatedPlayer,
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });
      
      // Only clear hole cards when hand is not in progress and not in a valid game phase
      if (!table.isHandInProgress && !['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase)) {
        setHoleCards([]);
        setShowCards(false);
      }
      
      setCardLoadError(null);
      retryCount.current = 0;
    }
  }, [table.isHandInProgress, isAuthenticatedPlayer, player.id, loadHoleCards, table.phase]);

  // Add a new effect to handle phase changes
  useEffect(() => {
    const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase);
    // If phase changes and we have no cards, try loading them again
    if ((table.isHandInProgress || isValidGamePhase) && isAuthenticatedPlayer && 
        (holeCards.length === 0 || table.phase === 'preflop')) {
      console.log('[PlayerPosition] Phase changed or preflop detected, loading cards:', {
        playerId: player.id,
        phase: table.phase,
        isHandInProgress: table.isHandInProgress,
        isValidGamePhase,
        holeCardsLength: holeCards.length,
        timestamp: new Date().toISOString(),
      });
      // Reset error state and retry count
      setCardLoadError(null);
      retryCount.current = 0;
      loadHoleCards();
    }
  }, [table.phase, table.isHandInProgress, isAuthenticatedPlayer, player.id, loadHoleCards, holeCards.length]);

  // Calculate position around an ellipse
  const getPosition = () => {
    // Adjust positions for mobile devices
    if (isMobile) {
      // Mobile-specific positioning logic
      const positions = [
        // Bottom positions (current player)
        { top: '75%', left: '50%' },
        // Left positions
        { top: '60%', left: '15%' },
        // Right positions
        { top: '60%', left: '85%' },
        // Top positions (further away)
        { top: '20%', left: '30%' },
        { top: '20%', left: '70%' },
        // Additional positions if needed
        { top: '40%', left: '20%' },
        { top: '40%', left: '80%' },
        { top: '30%', left: '50%' },
      ];
      
      return positions[position % positions.length];
    }
    
    // Original desktop positioning logic
    const angle = (position * (360 / totalPlayers) - 90) * (Math.PI / 180);
    const x = 50 + 40 * Math.cos(angle);
    const y = 50 + 40 * Math.sin(angle);
    return { x, y };
  };

  // Convert position to CSS style
  const positionStyle = (() => {
    const pos = getPosition();
    
    if ('top' in pos && 'left' in pos) {
      // Mobile positioning
      return {
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -50%)',
      } as React.CSSProperties;
    } else {
      // Desktop positioning
      return {
        top: `${pos.y}%`,
        left: `${pos.x}%`,
        transform: 'translate(-50%, -50%)',
      } as React.CSSProperties;
    }
  })();

  // Render player's hole cards
  const renderHoleCards = () => {
    if (isLoadingCards) {
      return (
        <div className="flex gap-1 items-center justify-center">
          <div className="animate-pulse bg-gray-300/20 rounded-lg w-10 h-16 sm:w-14 sm:h-20"></div>
          <div className="animate-pulse bg-gray-300/20 rounded-lg w-10 h-16 sm:w-14 sm:h-20 animate-delay-200"></div>
        </div>
      );
    }

    if (cardLoadError) {
      return (
        <div className="text-xs text-red-400 max-w-[120px] text-center">
          {cardLoadError}
        </div>
      );
    }

    if (showCards && holeCards.length === 2) {
      return (
        <div className="flex gap-1 items-center justify-center">
          <div className="transform rotate-[-5deg]">
            <CardComponent card={holeCards[0]} size={cardSize} />
          </div>
          <div className="transform rotate-[5deg]">
            <CardComponent card={holeCards[1]} size={cardSize} />
          </div>
        </div>
      );
    }

    // Default: face down cards or no cards
    return (
      <div className="flex gap-1 items-center justify-center">
        {table.isHandInProgress && !player.hasFolded ? (
          <>
            <div className="transform rotate-[-5deg]">
              <CardComponent card={{ suit: 'spades', rank: 'A' }} faceDown size={cardSize} />
            </div>
            <div className="transform rotate-[5deg]">
              <CardComponent card={{ suit: 'spades', rank: 'A' }} faceDown size={cardSize} />
            </div>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={`absolute ${
        isCurrentPlayer ? 'z-20' : 'z-10'
      }`}
      style={positionStyle}
    >
      <div className="flex flex-col items-center gap-1">
        {/* Player avatar and info */}
        <div 
          className={`
            relative rounded-full p-1
            ${isCurrentPlayer ? 'bg-yellow-400' : 'bg-gray-700'}
            ${player.hasFolded ? 'opacity-50' : 'opacity-100'}
            transition-all duration-300 ease-in-out
            ${isCurrentPlayer ? 'animate-pulse-slow' : ''}
          `}
        >
          <div className={`
            flex flex-col items-center justify-center
            rounded-full 
            ${isCurrentPlayer ? 'bg-blue-900' : 'bg-gray-800'}
            ${isMobile ? 'w-10 h-10' : 'w-12 h-12'}
            text-white
            overflow-hidden
            relative
          `}>
            {/* Player identifier */}
            <span className={`font-bold ${isMobile ? 'text-xs' : 'text-sm'}`}>
              {player.name ? player.name.substring(0, 2).toUpperCase() : 'P'}
            </span>
            
            {/* Player chips */}
            <span className={`
              absolute bottom-0 left-0 right-0
              text-center bg-black/50 backdrop-blur-sm
              ${isMobile ? 'text-[8px] py-0.5' : 'text-xs py-1'}
              font-mono font-bold
            `}>
              {player.chips}
            </span>
          </div>
          
          {/* Dealer button */}
          {isDealer && (
            <div className="absolute -top-2 -right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-blue-900 border border-blue-900">
              D
            </div>
          )}
        </div>
        
        {/* Player name - Improved for mobile */}
        <div className={`
          text-center px-2 py-1 rounded-md
          ${isMobile ? 'max-w-[80px]' : 'max-w-[120px]'}
          ${isCurrentPlayer ? 'bg-yellow-400 text-blue-900' : 'bg-gray-800 text-white'}
          ${player.hasFolded ? 'line-through opacity-70' : ''}
          ${isMobile ? 'text-xs' : 'text-sm'}
          font-semibold truncate
        `}>
          {player.name || `Player ${position + 1}`}
        </div>
        
        {/* Cards */}
        {renderHoleCards()}
      </div>
    </div>
  );
}; 