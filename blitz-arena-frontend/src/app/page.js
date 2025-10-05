'use client';

import { useState } from 'react';
import GameLobby from '@/components/GameLobby';
import SpeedTicTacToe from '@/components/SpeedTicTacToe';

export default function Home() {
  const [currentGame, setCurrentGame] = useState(null);
  const [playerName, setPlayerName] = useState('');

  const handleGameSelect = (gameType, name) => {
    setPlayerName(name);
    setCurrentGame(gameType);
  };

  const handleBackToLobby = () => {
    setCurrentGame(null);
  };

  if (currentGame === 'speedTicTacToe') {
    return (
      <SpeedTicTacToe 
        playerName={playerName} 
        onBackToLobby={handleBackToLobby}
      />
    );
  }

  return <GameLobby onGameSelect={handleGameSelect} />;
}