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
  const [rematchRequested, setRematchRequested] = useState(false);
  const [opponentWantsRematch, setOpponentWantsRematch] = useState(false);
  const [rematchDeclined, setRematchDeclined] = useState(false);

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
      // Reset rematch states for new game
      setRematchRequested(false);
      setOpponentWantsRematch(false);
      setRematchDeclined(false);
      // Reset game states
      setBoard(Array(9).fill(null));
      setRound(1);
      setScores([0, 0]);
      setWinner(null);
      setTimeLeft(10);
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

      // Play sound and show animation if player won
      if (data.winner === playerNumber) {
        playWinSound();
      }
    });

    socket.on('opponent_disconnected', () => {
      alert('Opponent disconnected. You win!');
      onBackToLobby();
    });

    socket.on('opponent_wants_rematch', () => {
      console.log('Opponent wants rematch');
      setOpponentWantsRematch(true);
    });

    socket.on('rematch_declined', () => {
      console.log('Opponent declined rematch');
      setRematchDeclined(true);
      setRematchRequested(false);
      setOpponentWantsRematch(false);
      // Show declined message for 2 seconds then go back to lobby
      setTimeout(() => {
        onBackToLobby();
      }, 2000);
    });

    socket.on('rematch_timeout', () => {
      alert('Opponent left');
      setRematchRequested(false);
      setOpponentWantsRematch(false);
      onBackToLobby();
    });

    socket.on('rematch_opponent_left', () => {
      alert('Opponent left');
      setRematchRequested(false);
      setOpponentWantsRematch(false);
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
      socket.off('opponent_wants_rematch');
      socket.off('rematch_declined');
      socket.off('rematch_timeout');
      socket.off('rematch_opponent_left');
    };
  }, [socket, userId, username, onBackToLobby]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    if (currentPlayer !== playerNumber) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Timer will be handled by server, just keep counting
          return 0;
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

  const handleRematchRequest = () => {
    setRematchRequested(true);
    socket.emit('request_rematch', { roomId });
  };

  const handleRematchDecline = () => {
    socket.emit('decline_rematch', { roomId });
    setRematchDeclined(true);
    setRematchRequested(false);
    setOpponentWantsRematch(false);
    // Show declined message for 1 second then go back to lobby
    setTimeout(() => {
      onBackToLobby();
    }, 1000);
  };

  // Play win sound effect using Web Audio API
  const playWinSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Create a victory fanfare with multiple notes
      const notes = [
        { freq: 523.25, time: 0, duration: 0.15 },    // C5
        { freq: 659.25, time: 0.15, duration: 0.15 }, // E5
        { freq: 783.99, time: 0.3, duration: 0.15 },  // G5
        { freq: 1046.50, time: 0.45, duration: 0.4 }  // C6 (longer)
      ];

      notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = note.freq;
        oscillator.type = 'triangle';

        gainNode.gain.setValueAtTime(0, audioContext.currentTime + note.time);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + note.time + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + note.time + note.duration);

        oscillator.start(audioContext.currentTime + note.time);
        oscillator.stop(audioContext.currentTime + note.time + note.duration);
      });
    } catch (error) {
      console.log('Audio playback not supported:', error);
    }
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
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4 relative">
      {/* Win Confetti Animation */}
      {gameState === 'match_end' && winner === playerNumber && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10%',
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'][Math.floor(Math.random() * 5)],
                  transform: `rotate(${Math.random() * 360}deg)`
                }}
              />
            </div>
          ))}
        </div>
      )}

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
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            {/* Victory/Defeat Message */}
            <div className="text-center mb-6">
              {winner === playerNumber ? (
                <>
                  <div className="text-6xl mb-4 animate-bounce">🏆</div>
                  <h2 className="text-4xl font-bold text-yellow-600 mb-2 animate-pulse">
                    VICTORY!
                  </h2>
                  <p className="text-gray-600 text-lg">
                    Final Score: {myScore} - {opponentScore}
                  </p>
                </>
              ) : winner === -1 ? (
                <>
                  <div className="text-6xl mb-4">🤝</div>
                  <h2 className="text-4xl font-bold text-gray-600 mb-2">
                    DRAW!
                  </h2>
                  <p className="text-gray-600 text-lg">
                    Final Score: {myScore} - {opponentScore}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">😔</div>
                  <h2 className="text-4xl font-bold text-red-600 mb-2">
                    DEFEAT
                  </h2>
                  <p className="text-gray-600 text-lg">
                    Final Score: {myScore} - {opponentScore}
                  </p>
                </>
              )}
            </div>

            {/* Rematch Options */}
            {!rematchRequested && !opponentWantsRematch && !rematchDeclined && (
              <div className="space-y-4">
                <button
                  onClick={handleRematchRequest}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl transition-colors text-lg"
                >
                  🔄 Play Again
                </button>
                <button
                  onClick={onBackToLobby}
                  className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-4 px-8 rounded-xl transition-colors"
                >
                  Back to Lobby
                </button>
              </div>
            )}

            {rematchDeclined && (
              <div className="text-center space-y-4">
                <div className="text-6xl mb-4">❌</div>
                <div className="text-2xl font-bold text-red-600">
                  Rematch Declined
                </div>
                <p className="text-gray-600">
                  {opponentName} declined the rematch
                </p>
              </div>
            )}

            {rematchRequested && !opponentWantsRematch && !rematchDeclined && (
              <div className="text-center space-y-4">
                <div className="text-xl font-bold text-yellow-600">
                  ⏳ Waiting for opponent...
                </div>
                <p className="text-gray-600">
                  Waiting for {opponentName} to accept
                </p>
                <button
                  onClick={handleRematchDecline}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {opponentWantsRematch && !rematchRequested && !rematchDeclined && (
              <div className="space-y-4">
                <div className="text-center text-xl font-bold text-green-600 mb-4">
                  🎮 {opponentName} wants a rematch!
                </div>
                <button
                  onClick={handleRematchRequest}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl transition-colors text-lg"
                >
                  ✓ Accept Rematch
                </button>
                <button
                  onClick={handleRematchDecline}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  ✗ Decline
                </button>
              </div>
            )}

            {rematchRequested && opponentWantsRematch && (
              <div className="text-center space-y-4">
                <div className="text-2xl font-bold text-green-600 animate-pulse">
                  🎮 Starting rematch...
                </div>
                <div className="flex justify-center space-x-2">
                  <div className="w-3 h-3 bg-green-600 rounded-full animate-bounce"></div>
                  <div className="w-3 h-3 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-3 h-3 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            )}
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