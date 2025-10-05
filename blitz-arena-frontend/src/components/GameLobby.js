'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/contexts/SocketContext';

export default function GameLobby({ onGameSelect }) {
  const { socket, connected } = useSocket();
  const [playerCounts, setPlayerCounts] = useState({
    speedTicTacToe: 0
  });
  const [playerName, setPlayerName] = useState('');
  const [isNameSet, setIsNameSet] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Request player counts when connected
    socket.emit('request_player_counts');

    // Listen for player count updates
    socket.on('player_counts', (counts) => {
      setPlayerCounts(counts);
    });

    // Request updates every 5 seconds
    const interval = setInterval(() => {
      socket.emit('request_player_counts');
    }, 5000);

    return () => {
      clearInterval(interval);
      socket.off('player_counts');
    };
  }, [socket]);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (playerName.trim()) {
      setIsNameSet(true);
    }
  };

  const handlePlayGame = (gameType) => {
    if (!isNameSet || !playerName.trim()) {
      alert('Please enter your name first!');
      return;
    }
    onGameSelect(gameType, playerName);
  };

  if (!isNameSet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">
            ⚡ Blitz Arena
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Quick PVP Games • Under 2 Minutes
          </p>
          
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Your Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Player Name"
                maxLength={20}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-purple-500 text-lg"
                autoFocus
              />
            </div>
            
            <button
              type="submit"
              className="w-full bg-purple-600 text-white font-bold py-4 rounded-xl hover:bg-purple-700 transition-colors text-lg"
            >
              Continue
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-500">
            {connected ? (
              <span className="text-green-600">● Connected</span>
            ) : (
              <span className="text-red-600">● Connecting...</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto pt-8">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">
            ⚡ Blitz Arena
          </h1>
          <p className="text-xl text-purple-100">
            Welcome, {playerName}!
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Speed Tic-Tac-Toe Card */}
          <div className="bg-white rounded-3xl shadow-2xl p-6 hover:scale-105 transition-transform">
            <div className="text-6xl mb-4 text-center">⚡</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">
              Speed Tic-Tac-Toe
            </h2>
            <p className="text-gray-600 mb-4 text-center text-sm">
              Best of 5 • 10s per move • 90s total
            </p>
            
            <div className="bg-purple-100 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-purple-800">
                  Players Online
                </span>
                <span className="text-2xl font-bold text-purple-600">
                  {playerCounts.speedTicTacToe}
                </span>
              </div>
            </div>

            <button
              onClick={() => handlePlayGame('speedTicTacToe')}
              disabled={!connected}
              className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {connected ? 'Play Now' : 'Connecting...'}
            </button>
          </div>

          {/* Coming Soon Card */}
          <div className="bg-white rounded-3xl shadow-2xl p-6 opacity-60">
            <div className="text-6xl mb-4 text-center">🎯</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">
              Speed Chess
            </h2>
            <p className="text-gray-600 mb-4 text-center text-sm">
              Coming Soon
            </p>
            
            <div className="bg-gray-100 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Players Online
                </span>
                <span className="text-2xl font-bold text-gray-400">
                  -
                </span>
              </div>
            </div>

            <button
              disabled
              className="w-full bg-gray-400 text-white font-bold py-3 rounded-xl cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          {/* Coming Soon Card 2 */}
          <div className="bg-white rounded-3xl shadow-2xl p-6 opacity-60">
            <div className="text-6xl mb-4 text-center">🎮</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">
              Quick Draw
            </h2>
            <p className="text-gray-600 mb-4 text-center text-sm">
              Coming Soon
            </p>
            
            <div className="bg-gray-100 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Players Online
                </span>
                <span className="text-2xl font-bold text-gray-400">
                  -
                </span>
              </div>
            </div>

            <button
              disabled
              className="w-full bg-gray-400 text-white font-bold py-3 rounded-xl cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => setIsNameSet(false)}
            className="text-white hover:text-purple-200 transition-colors underline"
          >
            Change Name
          </button>
        </div>
      </div>
    </div>
  );
}