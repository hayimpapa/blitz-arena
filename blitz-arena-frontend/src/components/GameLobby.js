'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/contexts/SocketContext';

export default function GameLobby({ onGameSelect, onViewLeaderboard, username }) {
  const { socket, connected } = useSocket();
  const [playerCounts, setPlayerCounts] = useState({
    speedTicTacToe: 0,
    nineMensMorris: 0
  });

  useEffect(() => {
    if (!socket) return;

    socket.emit('request_player_counts');

    socket.on('player_counts', (counts) => {
      setPlayerCounts(counts);
    });

    const interval = setInterval(() => {
      socket.emit('request_player_counts');
    }, 5000);

    return () => {
      clearInterval(interval);
      socket.off('player_counts');
    };
  }, [socket]);

  const handlePlayGame = (gameType) => {
    onGameSelect(gameType);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto pt-8">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">
            ⚡ Blitz Arena
          </h1>
          <p className="text-xl text-purple-100">
            Welcome, {username}!
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={onViewLeaderboard}
            className="bg-white text-purple-600 font-bold py-3 px-6 rounded-xl hover:bg-purple-50 transition-colors"
          >
            🏆 Leaderboard
          </button>
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

          {/* Nine Men's Morris Card */}
          <div className="bg-white rounded-3xl shadow-2xl p-6 hover:scale-105 transition-transform">
            <div className="text-6xl mb-4 text-center">⭕</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">
              Nine Men's Morris
            </h2>
            <p className="text-gray-600 mb-4 text-center text-sm">
              Best of 5 • 10s per move • Strategic
            </p>

            <div className="bg-amber-100 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-800">
                  Players Online
                </span>
                <span className="text-2xl font-bold text-amber-600">
                  {playerCounts.nineMensMorris}
                </span>
              </div>
            </div>

            <button
              onClick={() => handlePlayGame('nineMensMorris')}
              disabled={!connected}
              className="w-full bg-amber-600 text-white font-bold py-3 rounded-xl hover:bg-amber-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {connected ? 'Play Now' : 'Connecting...'}
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
      </div>
    </div>
  );
}