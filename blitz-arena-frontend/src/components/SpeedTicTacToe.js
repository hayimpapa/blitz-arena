'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/contexts/SocketContext';

export default function SpeedTicTacToe({ userId, username, onBackToLobby }) {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState('matchmaking');
  const [roomId, setRoomId] = useState(null);
  const [playerNumber, setPlayerNumber] = useState(null);
  const [opponentName, setOpponentName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [board, setBoard] = useState(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const [winner, setWinner] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    if (!socket) return;

    // Track if we've already set up listeners
    let setupComplete = false;

    const setupGame = () => {
      if (setupComplete) return;
      setupComplete = true;

      // Authenticate with backend
      socket.emit('authenticate', { userId });

      // Join matchmaking queue
      socket.emit('join_queue', {
        gameType: 'speedTicTacToe',
        userId,
        playerName: username
      });
    };

    setupGame();

    socket.on('queue_joined', (data) => {
      console.log('Joined queue, position:', data.position);
    });

    socket.on('game_start', (data) => {
      console.log('Game started:', data);
      setRoomId(data.roomId);
      setPlayerNumber(data.playerNumber);
      setOpponentName(data.opponent);
      setSymbol(data.symbol);
      setGameState('playing');
    });

    socket.on('game_state', (state) => {
      console.log('Game state update:', state);
      setBoard(state.board);
      setCurrentPlayer(state.currentPlayer);
      setScores(state.scores);
      setRound(state.round);
      setTimeLeft(10);
      setGameState('playing');
    });

    socket.on('round_end', (data) => {
      console.log('Round ended:', data);
      setWinner(data.winner);
      setScores(data.scores);
      setGameState('round_end');
      
      setTimeout(() => {
        setWinner(null);
        setGameState('playing');
      }, 2000);
    });

    socket.on('match_end', (data) => {
      console.log('Match ended:', data);
      setWinner(data.winner);
      setScores(data.finalScores);
      setGameState('match_end');
    });

    socket.on('opponent_disconnected', () => {
      alert('Opponent disconnected. You win!');
      onBackToLobby();
    });

    return () => {
      socket.emit('leave_queue', { gameType: 'speedTicTacToe' });
      socket.off('queue_joined');
      socket.off('game_start');
      socket.off('game_state');
      socket.off('round_end');
      socket.off('match_end');
      socket.off('opponent_disconnected');
    };
  }, [socket, userId, username, onBackToLobby]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    if (currentPlayer !== playerNumber) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          alert('Time\'s up! You lost this round.');
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentPlayer, playerNumber]);

  const handleCellClick = (position) => {
    if (gameState !== 'playing') return;
    if (currentPlayer !== playerNumber) return;
    if (board[position] !== null) return;

    socket.emit('game_move', {
      roomId,
      move: { position }
    });
  };

  if (gameState === 'matchmaking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4 animate-pulse">🔍</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">
            Finding Opponent...
          </h2>
          <p className="text-gray-600 mb-8">
            Looking for someone to play with
          </p>
          <div className="flex justify-center space-x-2 mb-8">
            <div className="w-3 h-3 bg-purple-600 rounded-full animate-bounce"></div>
            <div className="w-3 h-3 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-3 h-3 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <button
            onClick={onBackToLobby}
            className="text-purple-600 hover:text-purple-800 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const isMyTurn = currentPlayer === playerNumber;
  const myScore = scores[playerNumber];
  const opponentScore = scores[1 - playerNumber];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-center flex-1">
              <div className="text-sm text-gray-600">You ({symbol})</div>
              <div className="text-2xl font-bold text-purple-600">{myScore}</div>
              <div className="text-xs text-gray-500">{username}</div>
            </div>
            
            <div className="text-center px-6">
              <div className="text-sm text-gray-600">Round</div>
              <div className="text-3xl font-bold text-gray-800">{round}/5</div>
            </div>
            
            <div className="text-center flex-1">
              <div className="text-sm text-gray-600">Opponent ({symbol === 'X' ? 'O' : 'X'})</div>
              <div className="text-2xl font-bold text-blue-600">{opponentScore}</div>
              <div className="text-xs text-gray-500">{opponentName}</div>
            </div>
          </div>

          {gameState === 'playing' && (
            <div className={`text-center py-3 rounded-xl font-bold ${
              isMyTurn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {isMyTurn ? (
                <>
                  YOUR TURN - {timeLeft}s
                  <div className="w-full bg-gray-200 h-2 rounded-full mt-2 overflow-hidden">
                    <div 
                      className="bg-green-500 h-full transition-all duration-1000"
                      style={{ width: `${(timeLeft / 10) * 100}%` }}
                    ></div>
                  </div>
                </>
              ) : (
                "OPPONENT'S TURN"
              )}
            </div>
          )}

          {gameState === 'round_end' && (
            <div className="text-center py-3 rounded-xl font-bold bg-yellow-100 text-yellow-800">
              {winner === -1 ? "DRAW!" : winner === playerNumber ? "YOU WON THIS ROUND!" : "OPPONENT WON THIS ROUND!"}
            </div>
          )}

          {gameState === 'match_end' && (
            <div className={`text-center py-4 rounded-xl font-bold text-2xl ${
              winner === -1 ? 'bg-yellow-100 text-yellow-800' : winner === playerNumber ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {winner === -1 ? '🤝 DRAW! 🤝' : winner === playerNumber ? '🎉 YOU WIN! 🎉' : '😢 YOU LOSE'}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            {board.map((cell, index) => (
              <button
                key={index}
                onClick={() => handleCellClick(index)}
                disabled={!isMyTurn || cell !== null || gameState !== 'playing'}
                className={`aspect-square rounded-2xl text-5xl font-bold transition-all ${
                  cell === null
                    ? 'bg-gray-100 hover:bg-gray-200 active:scale-95'
                    : cell === 'X'
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-blue-100 text-blue-600'
                } ${!isMyTurn || cell !== null ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {cell}
              </button>
            ))}
          </div>
        </div>

        {gameState === 'match_end' && (
          <div className="text-center space-y-4">
            <button
              onClick={onBackToLobby}
              className="bg-white text-purple-600 font-bold py-4 px-8 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Back to Lobby
            </button>
          </div>
        )}
      </div>
    </div>
  );
}