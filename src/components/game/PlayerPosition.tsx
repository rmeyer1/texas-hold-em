import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Player, Table, Card } from '@/types/poker';
import { Card as CardComponent } from './Card';
import { GameManager } from '@/services/gameManager';
import { getAuth } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';
import { serializeError } from '@/utils/errorUtils';

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
  const gameManagerRef = useRef<GameManager | null>(null);
  const previousPhaseRef = useRef('');
  const currentTableIdRef = useRef(table.id);
  const currentHandIdRef = useRef(table.handId || '');
  const lastCardLoadTimeRef = useRef(0);
  const cardLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine card size based on mobile state
  const cardSize = isMobile ? 'sm' : 'md';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Clear any pending timeouts when component unmounts
      if (cardLoadTimeoutRef.current) {
        clearTimeout(cardLoadTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!table || !position) return;
    
    logger.log('[PlayerPosition] Creating new GameManager instance:', {
      tableId: table.id,
      position,
      isCurrentPlayer: isCurrentPlayer
    });
    
    // Only create a new GameManager when the table ID changes
    if (currentTableIdRef.current !== table.id || !gameManagerRef.current) {
      logger.log('[PlayerPosition] Creating new GameManager instance:', {
        tableId: table.id,
        position,
        isCurrentPlayer
      });
      
      try {
        gameManagerRef.current = new GameManager(table.id);
        gameManagerRef.current.initialize().catch((error) => {
          logger.error('[PlayerPosition] Error initializing GameManager:', {
            tableId: table.id,
            error: serializeError(error),
            timestamp: new Date().toISOString()
          });
        });
      } catch (error) {
        logger.error('[PlayerPosition] Error initializing GameManager:', {
          tableId: table.id,
          error: serializeError(error),
          timestamp: new Date().toISOString()
        });
      }
      
      currentTableIdRef.current = table.id;
    }
    
    // Update the current hand ID reference
    currentHandIdRef.current = table.handId || '';
    
    // If the phase has changed, we might need to load cards
    if (previousPhaseRef.current !== table.phase) {
      previousPhaseRef.current = table.phase;
      loadHoleCards();
    }
  }, [table, position, isCurrentPlayer]);

  // Debounced card loading function to prevent rapid successive calls
  const debouncedLoadCards = useCallback((force = false) => {
    // Clear any existing timeout
    if (cardLoadTimeoutRef.current) {
      clearTimeout(cardLoadTimeoutRef.current);
    }
    
    const now = Date.now();
    const timeSinceLastLoad = now - lastCardLoadTimeRef.current;
    
    // If forced or it's been more than 1 second since the last load, load immediately
    if (force || timeSinceLastLoad > 1000) {
      lastCardLoadTimeRef.current = now;
      loadHoleCards();
    } else {
      // Otherwise, debounce the load
      cardLoadTimeoutRef.current = setTimeout(() => {
        lastCardLoadTimeRef.current = Date.now();
        loadHoleCards();
      }, 1000 - timeSinceLastLoad);
    }
  }, []);

  const loadHoleCards = useCallback(async () => {
    // Reset error state
    setCardLoadError(null);
    setIsLoadingCards(true);
    
    const requestId = Math.random().toString(36).substring(7);
    currentRequestRef.current = requestId;
    const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase);
    const isPreflopPhase = table.phase === 'preflop';
    
    logger.log('[PlayerPosition] Starting card load:', {
      requestId,
      playerId: player.id,
      userId: user?.uid,
      isHandInProgress: table.isHandInProgress,
      isValidGamePhase,
      isPreflopPhase,
      phase: table.phase,
      handId: table.handId,
      timestamp: new Date().toISOString(),
    });

    if (!user) {
      logger.log('[PlayerPosition] Skipping card load - no authenticated user:', {
        requestId,
        playerId: player.id,
        timestamp: new Date().toISOString(),
      });
      setIsLoadingCards(false);
      return;
    }

    // Check if we're in a valid state to load cards
    if (!table.isHandInProgress && !isValidGamePhase) {
      logger.log('[PlayerPosition] Skipping card load - no hand in progress and invalid game phase:', {
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
    const isDirectlyAuthenticated = user.uid === player.id;
    if (!isDirectlyAuthenticated) {
      logger.log('[PlayerPosition] Skipping card load - not the authenticated player:', {
        requestId,
        playerId: player.id,
        userId: user.uid,
        isDirectlyAuthenticated,
        timestamp: new Date().toISOString(),
      });
      setIsLoadingCards(false);
      return;
    }

    try {
      // Check if this is still the current request
      if (currentRequestRef.current !== requestId) {
        logger.log('[PlayerPosition] Cancelling outdated card load request:', {
          requestId,
          currentRequest: currentRequestRef.current,
          timestamp: new Date().toISOString(),
        });
        setIsLoadingCards(false);
        return;
      }

      // Ensure GameManager is initialized
      if (!gameManagerRef.current) {
        logger.log('[PlayerPosition] Creating GameManager for card load:', {
          requestId,
          playerId: player.id,
          tableId: table.id,
          timestamp: new Date().toISOString(),
        });
        gameManagerRef.current = new GameManager(table.id);
        await gameManagerRef.current.initialize();
      }

      logger.log('[PlayerPosition] Calling getPlayerHoleCards:', {
        requestId,
        playerId: player.id,
        phase: table.phase,
        isPreflopPhase,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });

      const cards = await gameManagerRef.current.getPlayerHoleCards(player.id);
      
      // Check again if this is still the current request
      if (currentRequestRef.current !== requestId) {
        logger.log('[PlayerPosition] Discarding outdated card load response:', {
          requestId,
          currentRequest: currentRequestRef.current,
          timestamp: new Date().toISOString(),
        });
        setIsLoadingCards(false);
        return;
      }

      logger.log('[PlayerPosition] Received response from getPlayerHoleCards:', {
        requestId,
        playerId: player.id,
        hasCards: !!cards,
        cardsLength: cards ? cards.length : 0,
        cards: cards ? JSON.stringify(cards) : null,
        phase: table.phase,
        isPreflopPhase,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });

      if (!cards || !Array.isArray(cards) || cards.length !== 2) {
        logger.warn('[PlayerPosition] Invalid cards received:', {
          requestId,
          playerId: player.id,
          cards: cards ? JSON.stringify(cards) : null,
          phase: table.phase,
          isPreflopPhase,
          handId: table.handId,
          timestamp: new Date().toISOString(),
        });
        
        const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase);
        // Only retry if we're in a valid game phase
        if ((table.isHandInProgress || isValidGamePhase) && retryCount.current < 3) {
          // Implement exponential backoff for retries
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 8000);
          logger.log('[PlayerPosition] Scheduling retry:', {
            requestId,
            playerId: player.id,
            retryCount: retryCount.current,
            delay: retryDelay,
            phase: table.phase,
            isPreflopPhase,
            isHandInProgress: table.isHandInProgress,
            isValidGamePhase,
            handId: table.handId,
            timestamp: new Date().toISOString(),
          });
          
          retryCount.current += 1;
          setTimeout(() => {
            if (mounted.current) {
              loadHoleCards();
            }
          }, retryDelay);
        } else if (retryCount.current >= 3) {
          logger.error('[PlayerPosition] Max retries reached:', {
            requestId,
            playerId: player.id,
            retryCount: retryCount.current,
            phase: table.phase,
            isPreflopPhase,
            handId: table.handId,
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
          logger.log('[PlayerPosition] Not retrying - invalid game phase:', {
            requestId,
            playerId: player.id,
            phase: table.phase,
            isPreflopPhase,
            handId: table.handId,
            timestamp: new Date().toISOString(),
          });
          retryCount.current = 0;
          setIsLoadingCards(false);
        }
        return;
      }

      logger.log('[PlayerPosition] Successfully loaded cards:', {
        requestId,
        playerId: player.id,
        cards: JSON.stringify(cards),
        phase: table.phase,
        isPreflopPhase,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });

      if (mounted.current) {
        setHoleCards(cards);
        setShowCards(true); // Always show cards for the authenticated player
        retryCount.current = 0;
        setIsLoadingCards(false);
      }
    } catch (error) {
      logger.error('[PlayerPosition] Error loading cards:', {
        requestId,
        playerId: player.id,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : 'Unknown error',
        phase: table.phase,
        isPreflopPhase,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });

      // Set a user-friendly error message
      setCardLoadError("Error loading cards. Please try refreshing the page.");

      // Implement exponential backoff for error retries
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 8000);
      if (retryCount.current < 3) {
        logger.log('[PlayerPosition] Scheduling error retry:', {
          requestId,
          playerId: player.id,
          retryCount: retryCount.current,
          delay: retryDelay,
          phase: table.phase,
          isPreflopPhase,
          handId: table.handId,
          timestamp: new Date().toISOString(),
        });
        
        retryCount.current += 1;
        setTimeout(() => {
          if (mounted.current) {
            loadHoleCards();
          }
        }, retryDelay);
      } else {
        logger.error('[PlayerPosition] Max error retries reached:', {
          requestId,
          playerId: player.id,
          retryCount: retryCount.current,
          phase: table.phase,
          isPreflopPhase,
          handId: table.handId,
          timestamp: new Date().toISOString(),
        });
        retryCount.current = 0;
        setIsLoadingCards(false);
      }
    }
  }, [player.id, user, table.isHandInProgress, table.phase, table.id, table.handId]);

  // Set authentication state based on auth context
  useEffect(() => {
    if (user) {
      const isAuthenticated = user.uid === player.id;
      logger.log('[PlayerPosition] Authentication state updated:', {
        playerId: player.id,
        isAuthenticated,
        userId: user.uid,
        phase: table.phase,
        isHandInProgress: table.isHandInProgress,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });
      
      // Update authentication state
      setIsAuthenticatedPlayer(isAuthenticated);
      
      // Only set showCards to true if we have cards to show
      if (isAuthenticated && holeCards.length === 2) {
        setShowCards(true);
      }
      
      // If authenticated and in a valid game phase, trigger card loading
      if (isAuthenticated && 
          (table.isHandInProgress || ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase))) {
        logger.log('[PlayerPosition] Authentication confirmed, triggering card load:', {
          playerId: player.id,
          phase: table.phase,
          isHandInProgress: table.isHandInProgress,
          handId: table.handId,
          timestamp: new Date().toISOString(),
        });
        // Reset error state and retry count
        setCardLoadError(null);
        retryCount.current = 0;
        
        // Force load cards when authentication is confirmed
        debouncedLoadCards(true);
      }
      
      setAuthError(null);
    } else {
      logger.log('[PlayerPosition] No authenticated user:', {
        playerId: player.id,
        phase: table.phase,
        isHandInProgress: table.isHandInProgress,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });
      setIsAuthenticatedPlayer(false);
      setShowCards(false);
      setAuthError('Not authenticated');
    }
  }, [user, player.id, holeCards.length, table.phase, table.isHandInProgress, table.handId, debouncedLoadCards]);

  // Add a dedicated effect to handle hand ID changes
  useEffect(() => {
    if (table.handId && table.handId !== currentHandIdRef.current) {
      logger.log('[PlayerPosition] Hand ID changed, resetting cards:', {
        playerId: player.id,
        oldHandId: currentHandIdRef.current,
        newHandId: table.handId,
        phase: table.phase,
        timestamp: new Date().toISOString(),
      });
      
      // Clear cards when a new hand starts
      setHoleCards([]);
      setShowCards(false);
      setCardLoadError(null);
      retryCount.current = 0;
      
      // Update the current hand ID
      currentHandIdRef.current = table.handId;
      
      // If this is the authenticated player and we're in preflop, load cards
      const isDirectlyAuthenticated = user && user.uid === player.id;
      if ((isDirectlyAuthenticated || isAuthenticatedPlayer) && 
          table.phase === 'preflop' && table.isHandInProgress) {
        logger.log('[PlayerPosition] New hand detected in preflop, loading cards:', {
          playerId: player.id,
          handId: table.handId,
          phase: table.phase,
          timestamp: new Date().toISOString(),
        });
        // Force load cards immediately when a new hand starts
        debouncedLoadCards(true);
      }
    }
  }, [table.handId, player.id, table.phase, table.isHandInProgress, user, isAuthenticatedPlayer, debouncedLoadCards]);

  // Combined effect to handle phase changes and clear cards when needed
  useEffect(() => {
    const isValidGamePhase = ['preflop', 'flop', 'turn', 'river', 'showdown'].includes(table.phase);
    const isDirectlyAuthenticated = user && user.uid === player.id;
    const phaseChanged = previousPhaseRef.current !== table.phase;
    
    // Log phase changes for debugging
    if (phaseChanged) {
      logger.log('[PlayerPosition] Phase changed:', {
        playerId: player.id,
        previousPhase: previousPhaseRef.current,
        currentPhase: table.phase,
        isHandInProgress: table.isHandInProgress,
        isValidGamePhase,
        isAuthenticatedPlayer,
        isDirectlyAuthenticated,
        userId: user?.uid,
        holeCardsLength: holeCards.length,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Clear cards when a hand ends or phase changes to 'waiting'
    if (previousPhaseRef.current !== 'waiting' && table.phase === 'waiting') {
      logger.log('[PlayerPosition] Phase changed to waiting, clearing cards:', {
        playerId: player.id,
        previousPhase: previousPhaseRef.current,
        currentPhase: table.phase,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });
      
      setHoleCards([]);
      setShowCards(false);
      setCardLoadError(null);
      retryCount.current = 0;
    }
    
    // Update previous phase reference
    previousPhaseRef.current = table.phase;
    
    // Determine if we need to load cards based on phase change
    const shouldLoadCards = 
      // Only load if authenticated
      (isDirectlyAuthenticated || isAuthenticatedPlayer) && 
      // Only load if hand is in progress or in a valid game phase
      (table.isHandInProgress || isValidGamePhase) && 
      // Only load in these specific scenarios:
      (
        // 1. Phase changed to preflop (new hand starting)
        (phaseChanged && table.phase === 'preflop') ||
        // 2. We don't have cards yet but should (in a valid game phase)
        (holeCards.length === 0 && isValidGamePhase && table.isHandInProgress)
      );
    
    if (shouldLoadCards) {
      logger.log('[PlayerPosition] Phase change triggered card load:', {
        playerId: player.id,
        phase: table.phase,
        phaseChanged,
        isHandInProgress: table.isHandInProgress,
        holeCardsLength: holeCards.length,
        handId: table.handId,
        timestamp: new Date().toISOString(),
      });
      
      // Reset error state and retry count
      setCardLoadError(null);
      retryCount.current = 0;
      
      // Load cards with normal debounce (not forced) for phase changes
      debouncedLoadCards();
    }
  }, [
    table.phase, 
    table.isHandInProgress, 
    player.id, 
    user, 
    isAuthenticatedPlayer, 
    holeCards.length, 
    table.handId, 
    debouncedLoadCards
  ]);

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