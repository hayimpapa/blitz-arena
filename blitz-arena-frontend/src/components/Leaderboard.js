'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function Leaderboard({ onBack }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all' or 'tictactoe'
  const { user, profile } = useAuth();

  useEffect(() => {
    fetchLeaderboard();
    if (user && !profile?.isGuest) {
      fetchUserStats();
    }
  }, [user, activeTab]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      let url;
      if (activeTab === 'all') {
        url = `${process.env.NEXT_PUBLIC_API_URL}/api/leaderboard-all-games`;
      } else {
        url = `${process.env.NEXT_PUBLIC_API_URL}/api/leaderboard-points/speedTicTacToe`;
      }
      const response = await fetch(url);
      const data = await response.json();
      setLeaderboard(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStats = async () => {
    try {
      let url;
      if (activeTab === 'all') {
        url = `${process.env.NEXT_PUBLIC_API_URL}/api/user-stats-all/${user.id}`;
      } else {
        url = `${process.env.NEXT_PUBLIC_API_URL}/api/user-stats/${user.id}/speedTicTacToe`;
      }
      const response = await fetch(url);
      const data = await response.json();
      setUserStats(data);
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  };

  const getMedalEmoji = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto pt-8">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="text-white hover:text-purple-200 transition-colors font-medium"
          >
            ← Back to Lobby
          </button>
          <h1 className="text-4xl font-bold text-white">🏆 Leaderboard</h1>
          <div className="w-20"></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-white text-purple-600 shadow-xl'
                : 'bg-purple-500 bg-opacity-50 text-white hover:bg-opacity-70'
            }`}
          >
            All Games
          </button>
          <button
            onClick={() => setActiveTab('tictactoe')}
            className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all ${
              activeTab === 'tictactoe'
                ? 'bg-white text-purple-600 shadow-xl'
                : 'bg-purple-500 bg-opacity-50 text-white hover:bg-opacity-70'
            }`}
          >
            Tic-Tac-Toe
          </button>
        </div>

        {/* User Stats Card */}
        {userStats && !profile?.isGuest && (
          <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Your Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{userStats.points || 0}</div>
                <div className="text-sm text-gray-600">Points</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{userStats.wins}</div>
                <div className="text-sm text-gray-600">Wins</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-600">{userStats.draws || 0}</div>
                <div className="text-sm text-gray-600">Draws</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{userStats.losses}</div>
                <div className="text-sm text-gray-600">Losses</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{userStats.games_played}</div>
                <div className="text-sm text-gray-600">Total Games</div>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            Top Players {activeTab === 'all' ? '- All Games' : '- Tic-Tac-Toe'}
          </h2>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No players yet. Be the first to play!
            </div>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((player, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                    profile?.username === player.username
                      ? 'bg-purple-100 border-2 border-purple-400'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="text-2xl font-bold w-12 text-center">
                      {getMedalEmoji(index)}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">
                        {player.username}
                        {profile?.username === player.username && (
                          <span className="ml-2 text-purple-600 text-sm">(You)</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {player.gamesPlayed} games • W:{player.wins} D:{player.draws} L:{player.losses}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-yellow-600">{player.points}</div>
                    <div className="text-xs text-gray-500">points</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}