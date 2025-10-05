'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthPage from '@/components/AuthPage';
import GameLobby from '@/components/GameLobby';
import SpeedTicTacToe from '@/components/SpeedTicTacToe';
import Leaderboard from '@/components/Leaderboard';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState('lobby'); // lobby, game, leaderboard
  const [currentGame, setCurrentGame] = useState(null);

  const handleGameSelect = (gameType) => {
    setCurrentGame(gameType);
    setCurrentView('game');
  };

  const handleBackToLobby = () => {
    setCurrentView('lobby');
    setCurrentGame(null);
  };

  const handleViewLeaderboard = () => {
    setCurrentView('leaderboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-2xl font-bold">Loading...</div>
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthPage />;
  }

  if (currentView === 'leaderboard') {
    return <Leaderboard onBack={handleBackToLobby} />;
  }

  if (currentView === 'game' && currentGame === 'speedTicTacToe') {
    return (
      <SpeedTicTacToe 
        userId={user.id}
        username={profile.username}
        onBackToLobby={handleBackToLobby}
      />
    );
  }

  return (
    <GameLobby 
      username={profile.username}
      onGameSelect={handleGameSelect}
      onViewLeaderboard={handleViewLeaderboard}
    />
  );
}