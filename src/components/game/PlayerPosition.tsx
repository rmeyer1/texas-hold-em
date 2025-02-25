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
}

export const PlayerPosition: React.FC<PlayerPositionProps> = ({
  player,
  isDealer,
  isCurrentPlayer,
  position,
  totalPlayers,
  table,
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
    const angle = (position * (360 / totalPlayers) - 90) * (Math.PI / 180);
    const x = 50 + 40 * Math.cos(angle);
    const y = 50 + 25 * Math.sin(angle);
    return { x, y };
  };

  const { x, y } = getPosition();

  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
        isCurrentPlayer ? 'ring-4 ring-yellow-400 rounded-lg p-1' : ''
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="flex flex-col items-center gap-1">
        {/* Player info */}
        <div
          className={`p-2 rounded-lg ${
            player.hasFolded 
              ? 'bg-gray-700' 
              : isCurrentPlayer 
                ? 'bg-blue-600 animate-pulse' 
                : 'bg-blue-900'
          } text-white shadow-md transition-colors duration-300`}
        >
          <div className="text-sm font-semibold">{player.name}</div>
          <div className="text-xs">Chips: {player.chips}</div>
          {isCurrentPlayer && (
            <div className="text-xs text-yellow-300 font-semibold mt-1">
              Current Turn
            </div>
          )}
          {isAuthenticatedPlayer && (
            <div className="text-xs text-green-300 font-semibold">
              (You)
            </div>
          )}
        </div>

        {/* Dealer button */}
        {isDealer && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white text-black text-xs flex items-center justify-center font-bold border border-gray-300">
            D
          </div>
        )}

        {/* Cards */}
        <div className="flex gap-1">
          {showCards && holeCards.length === 2 ? (
            holeCards.map((card, index) => (
              <CardComponent
                key={`${card.suit}-${card.rank}-${index}`}
                card={card}
                faceDown={false}
                className="transform scale-75"
              />
            ))
          ) : (
            // Show face down cards for other players or when cards aren't loaded
            Array(2).fill(null).map((_, i) => (
              <CardComponent
                key={`facedown-${i}`}
                card={{ suit: 'hearts', rank: '2' }} // Dummy card, will be shown face down
                faceDown={true}
                className="transform scale-75"
              />
            ))
          )}
        </div>

        {/* Show loading state or error for cards */}
        {isAuthenticatedPlayer && isLoadingCards && (
          <div className="text-xs text-yellow-300 mt-1">Loading cards...</div>
        )}
        {isAuthenticatedPlayer && cardLoadError && (
          <div className="text-xs text-red-300 mt-1">{cardLoadError}</div>
        )}
      </div>
    </div>
  );
}; 