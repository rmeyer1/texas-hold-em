import React, { useEffect, useState } from 'react';
import { Player, Table, Card } from '@/types/poker';
import { Card as CardComponent } from './Card';
import { GameManager } from '@/services/gameManager';
import { getAuth } from 'firebase/auth';

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

  useEffect(() => {
    // Check if this player position belongs to the authenticated user
    const auth = getAuth();
    const currentUser = auth.currentUser;
    const isAuthenticated = currentUser?.uid === player.id;
    setIsAuthenticatedPlayer(isAuthenticated);

    console.log('[PlayerPosition] Authentication check:', {
      playerId: player.id,
      currentUserId: currentUser?.uid,
      isAuthenticated,
      tablePhase: table.phase,
      timestamp: new Date().toISOString()
    });

    // Reset cards if in waiting phase
    if (table.phase === 'waiting') {
      setHoleCards([]);
      setShowCards(false);
      return;
    }

    const loadHoleCards = async () => {
      // Only attempt to load cards if this is the authenticated user's position
      if (!isAuthenticated) {
        setHoleCards([]);
        setShowCards(false);
        return;
      }

      try {
        const gameManager = new GameManager(table.id);
        const cards = await gameManager.getPlayerHoleCards(player.id);
        
        if (!cards || cards.length !== 2) {
          console.debug('[PlayerPosition] Invalid or missing cards:', {
            playerId: player.id,
            hasCards: !!cards,
            cardCount: cards?.length ?? 0,
            timestamp: new Date().toISOString()
          });
          setHoleCards([]);
          setShowCards(false);
          return;
        }

        setHoleCards(cards);
        setShowCards(true);
      } catch (error) {
        console.error('[PlayerPosition] Error loading hole cards:', {
          playerId: player.id,
          error,
          timestamp: new Date().toISOString()
        });
        setHoleCards([]);
        setShowCards(false);
      }
    };

    loadHoleCards();
  }, [player.id, table.id, table.phase]);

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
        <div className="flex flex-col items-center gap-1">
          {isAuthenticatedPlayer && !showCards && (
            <div className="text-sm text-gray-300 animate-pulse mb-1">
              {table.phase === 'waiting' ? 'Waiting for game to start' : 'Cards Loading...'}
            </div>
          )}
          <div className="flex gap-1 -mt-1">
            {showCards ? (
              holeCards.map((card) => (
                <CardComponent
                  key={`${card.suit}-${card.rank}`}
                  card={card}
                  faceDown={false}
                  className="transform scale-75"
                />
              ))
            ) : (
              // Show face down cards for other players
              Array(2).fill(null).map((_, i) => (
                <CardComponent
                  key={i}
                  card={{ suit: 'hearts', rank: '2' }} // Dummy card, will be shown face down
                  faceDown={true}
                  className="transform scale-75"
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 