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
    const requestId = Math.random().toString(36).substring(7);
    currentRequestRef.current = requestId;
    console.log('[PlayerPosition] Starting card load:', {
      requestId,
      playerId: player.id,
      userId: user?.uid,
      isHandInProgress: table.isHandInProgress,
      timestamp: new Date().toISOString(),
    });

    if (!user || !table.isHandInProgress) {
      console.log('[PlayerPosition] Skipping card load - conditions not met:', {
        requestId,
        playerId: player.id,
        isAuthenticated: !!user,
        isHandInProgress: table.isHandInProgress,
        timestamp: new Date().toISOString(),
      });
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
        return;
      }

      const cards = await gameManagerRef.current.getPlayerHoleCards(player.id);
      
      // Check again if this is still the current request
      if (currentRequestRef.current !== requestId) {
        console.log('[PlayerPosition] Discarding outdated card load response:', {
          requestId,
          currentRequest: currentRequestRef.current,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!cards || !Array.isArray(cards) || cards.length !== 2) {
        console.warn('[PlayerPosition] Invalid cards received:', {
          requestId,
          playerId: player.id,
          cards,
          timestamp: new Date().toISOString(),
        });
        
        // Implement exponential backoff for retries
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 8000);
        if (retryCount.current < 3) {
          console.log('[PlayerPosition] Scheduling retry:', {
            requestId,
            playerId: player.id,
            retryCount: retryCount.current,
            delay: retryDelay,
            timestamp: new Date().toISOString(),
          });
          
          retryCount.current += 1;
          setTimeout(() => {
            if (mounted.current) {
              loadHoleCards();
            }
          }, retryDelay);
        } else {
          console.error('[PlayerPosition] Max retries reached:', {
            requestId,
            playerId: player.id,
            retryCount: retryCount.current,
            timestamp: new Date().toISOString(),
          });
          retryCount.current = 0;
        }
        return;
      }

      console.log('[PlayerPosition] Successfully loaded cards:', {
        requestId,
        playerId: player.id,
        timestamp: new Date().toISOString(),
      });

      if (mounted.current) {
        setHoleCards(cards);
        setShowCards(isAuthenticatedPlayer);
        retryCount.current = 0;
      }
    } catch (error) {
      console.error('[PlayerPosition] Error loading cards:', {
        requestId,
        playerId: player.id,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : 'Unknown error',
        timestamp: new Date().toISOString(),
      });

      // Implement exponential backoff for error retries
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount.current), 8000);
      if (retryCount.current < 3) {
        console.log('[PlayerPosition] Scheduling error retry:', {
          requestId,
          playerId: player.id,
          retryCount: retryCount.current,
          delay: retryDelay,
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
          timestamp: new Date().toISOString(),
        });
        retryCount.current = 0;
      }
    }
  }, [gameManagerRef, player.id, user, table.isHandInProgress, isAuthenticatedPlayer]);

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
      setShowCards(isAuthenticated);
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
  }, [user, player.id]);

  // Load hole cards when hand is in progress and player is authenticated
  useEffect(() => {
    if (table.isHandInProgress && isAuthenticatedPlayer) {
      console.log('[PlayerPosition] Loading hole cards:', {
        playerId: player.id,
        isHandInProgress: table.isHandInProgress,
        isAuthenticatedPlayer,
        timestamp: new Date().toISOString(),
      });
      loadHoleCards();
    } else {
      // Clear hole cards when hand is not in progress
      setHoleCards([]);
      setShowCards(false);
    }
  }, [table.isHandInProgress, isAuthenticatedPlayer, player.id, loadHoleCards]);

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
              Your Turn
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
      </div>
    </div>
  );
}; 