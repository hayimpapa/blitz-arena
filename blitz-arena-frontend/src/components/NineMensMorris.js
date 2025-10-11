'use client';

import { useState, useEffect } from 'react';
import { useSocket } from '@/contexts/SocketContext';

export default function NineMensMorris({ userId, username, onBackToLobby }) {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState('matchmaking');
  const [roomId, setRoomId] = useState(null);
  const [playerNumber, setPlayerNumber] = useState(null);
  const [opponentName, setOpponentName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [board, setBoard] = useState(Array(24).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const [winner, setWinner] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [piecesInHand, setPiecesInHand] = useState([9, 9]);
  const [piecesOnBoard, setPiecesOnBoard] = useState([0, 0]);
  const [phase, setPhase] = useState('placement');
  const [millFormed, setMillFormed] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [opponentWantsRematch, setOpponentWantsRematch] = useState(false);
  const [rematchDeclined, setRematchDeclined] = useState(false);

  useEffect(() => {
    if (!socket) return;

    let setupComplete = false;

    const setupGame = () => {
      if (setupComplete) return;
      setupComplete = true;

      socket.emit('authenticate', { userId });
      socket.emit('join_queue', {
        gameType: 'nineMensMorris',
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
      setRematchRequested(false);
      setOpponentWantsRematch(false);
      setRematchDeclined(false);
      setBoard(Array(24).fill(null));
      setRound(1);
      setScores([0, 0]);
      setWinner(null);
      setTimeLeft(10);
      setPiecesInHand([9, 9]);
      setPiecesOnBoard([0, 0]);
      setPhase('placement');
      setMillFormed(false);
      setSelectedPiece(null);
    });

    socket.on('game_state', (state) => {
      console.log('Game state update:', state);
      setBoard(state.board);
      setCurrentPlayer(state.currentPlayer);
      setScores(state.scores);
      setRound(state.round);
      setPiecesInHand(state.piecesInHand);
      setPiecesOnBoard(state.piecesOnBoard);
      setPhase(state.phase);
      setMillFormed(state.millFormed);
      setTimeLeft(10);
      setGameState('playing');
      setSelectedPiece(null);
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
      socket.emit('leave_queue', { gameType: 'nineMensMorris' });
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
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentPlayer, playerNumber]);

  const handlePositionClick = (position) => {
    if (gameState !== 'playing') return;
    if (currentPlayer !== playerNumber) return;

    // Removal phase - click opponent piece to remove
    if (phase === 'removal') {
      const opponentSymbol = symbol === 'W' ? 'B' : 'W';
      if (board[position] === opponentSymbol) {
        socket.emit('game_move', {
          roomId,
          move: { position }
        });
      }
      return;
    }

    // Placement phase - click empty spot to place piece
    if (phase === 'placement') {
      if (board[position] === null) {
        socket.emit('game_move', {
          roomId,
          move: { position }
        });
      }
      return;
    }

    // Movement phase
    if (phase === 'movement') {
      // If clicking own piece, select it
      if (board[position] === symbol) {
        setSelectedPiece(position);
        return;
      }

      // If piece selected and clicking empty spot, try to move
      if (selectedPiece !== null && board[position] === null) {
        socket.emit('game_move', {
          roomId,
          move: { from: selectedPiece, to: position }
        });
        setSelectedPiece(null);
        return;
      }
    }
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
    setTimeout(() => {
      onBackToLobby();
    }, 1000);
  };

  const handleBackToLobby = () => {
    if (gameState === 'match_end' && roomId) {
      socket.emit('leave_match_end', { roomId });
    }
    onBackToLobby();
  };

  const playWinSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [
        { freq: 523.25, time: 0, duration: 0.15 },
        { freq: 659.25, time: 0.15, duration: 0.15 },
        { freq: 783.99, time: 0.3, duration: 0.15 },
        { freq: 1046.50, time: 0.45, duration: 0.4 }
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

  const getPhaseText = () => {
    if (phase === 'placement') {
      return `Placement Phase (${piecesInHand[playerNumber]} pieces left)`;
    } else if (phase === 'removal') {
      return 'Remove opponent piece!';
    } else {
      return piecesOnBoard[playerNumber] === 3 ? 'Movement Phase (Flying!)' : 'Movement Phase';
    }
  };

  if (gameState === 'matchmaking') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4 animate-pulse">🔍</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">
            Finding Opponent...
          </h2>
          <p className="text-gray-600 mb-8">
            Looking for someone to play with
          </p>
          <div className="flex justify-center space-x-2 mb-8">
            <div className="w-3 h-3 bg-amber-600 rounded-full animate-bounce"></div>
            <div className="w-3 h-3 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-3 h-3 bg-amber-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <button
            onClick={onBackToLobby}
            className="text-amber-600 hover:text-amber-800 font-medium"
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
    <div className="min-h-screen bg-gradient-to-br from-amber-600 to-orange-600 p-4 relative">
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

      <div className="max-w-4xl mx-auto pt-8">
        <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-center flex-1">
              <div className="text-sm text-gray-600">You ({symbol})</div>
              <div className="text-2xl font-bold text-amber-600">{myScore}</div>
              <div className="text-xs text-gray-500">{username}</div>
            </div>

            <div className="text-center px-6">
              <div className="text-sm text-gray-600">Round</div>
              <div className="text-3xl font-bold text-gray-800">{round}/5</div>
            </div>

            <div className="text-center flex-1">
              <div className="text-sm text-gray-600">Opponent ({symbol === 'W' ? 'B' : 'W'})</div>
              <div className="text-2xl font-bold text-orange-600">{opponentScore}</div>
              <div className="text-xs text-gray-500">{opponentName}</div>
            </div>
          </div>

          {gameState === 'playing' && (
            <>
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
              <div className="text-center py-2 text-sm text-gray-700">
                {getPhaseText()}
              </div>
            </>
          )}

          {gameState === 'round_end' && (
            <div className="text-center py-3 rounded-xl font-bold bg-yellow-100 text-yellow-800">
              {winner === -1 ? "DRAW!" : winner === playerNumber ? "YOU WON THIS ROUND!" : "OPPONENT WON THIS ROUND!"}
            </div>
          )}

          {gameState === 'match_end' && (
            <div className="bg-white rounded-3xl shadow-2xl p-6">
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

              {!rematchRequested && !opponentWantsRematch && !rematchDeclined && (
                <div className="space-y-4">
                  <button
                    onClick={handleRematchRequest}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl transition-colors text-lg"
                  >
                    🔄 Play Again
                  </button>
                  <button
                    onClick={handleBackToLobby}
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

        {/* Nine Men's Morris Board */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6">
          <div className="relative w-full max-w-xl mx-auto aspect-square">
            <svg viewBox="0 0 400 400" className="w-full h-full">
              {/* Board lines */}
              <rect x="25" y="25" width="350" height="350" fill="none" stroke="#8B4513" strokeWidth="2"/>
              <rect x="85" y="85" width="230" height="230" fill="none" stroke="#8B4513" strokeWidth="2"/>
              <rect x="145" y="145" width="110" height="110" fill="none" stroke="#8B4513" strokeWidth="2"/>

              {/* Connecting lines */}
              <line x1="200" y1="25" x2="200" y2="145" stroke="#8B4513" strokeWidth="2"/>
              <line x1="200" y1="255" x2="200" y2="375" stroke="#8B4513" strokeWidth="2"/>
              <line x1="25" y1="200" x2="145" y2="200" stroke="#8B4513" strokeWidth="2"/>
              <line x1="255" y1="200" x2="375" y2="200" stroke="#8B4513" strokeWidth="2"/>

              {/* Position coordinates */}
              {[
                [25, 25], [200, 25], [375, 25],
                [85, 85], [200, 85], [315, 85],
                [145, 145], [200, 145], [255, 145],
                [25, 200], [85, 200], [145, 200], [255, 200], [315, 200], [375, 200],
                [145, 255], [200, 255], [255, 255],
                [85, 315], [200, 315], [315, 315],
                [25, 375], [200, 375], [375, 375]
              ].map((pos, idx) => {
                const piece = board[idx];
                const isSelected = selectedPiece === idx;
                const canPlace = isMyTurn && phase === 'placement' && piece === null;
                const canRemove = isMyTurn && phase === 'removal' && piece === (symbol === 'W' ? 'B' : 'W');
                const canSelect = isMyTurn && phase === 'movement' && piece === symbol;

                return (
                  <g key={idx}>
                    {/* Position marker */}
                    <circle
                      cx={pos[0]}
                      cy={pos[1]}
                      r="18"
                      fill={isSelected ? '#FFD700' : piece === null ? '#F5DEB3' : 'transparent'}
                      stroke={isSelected ? '#FFA500' : '#8B4513'}
                      strokeWidth="2"
                      className={`cursor-pointer transition-all ${
                        (canPlace || canRemove || canSelect) ? 'hover:stroke-4' : ''
                      }`}
                      onClick={() => handlePositionClick(idx)}
                    />

                    {/* Piece */}
                    {piece && (
                      <circle
                        cx={pos[0]}
                        cy={pos[1]}
                        r="14"
                        fill={piece === 'W' ? '#FFFFFF' : '#000000'}
                        stroke={piece === 'W' ? '#000000' : '#FFFFFF'}
                        strokeWidth="2"
                        className="cursor-pointer"
                        onClick={() => handlePositionClick(idx)}
                      />
                    )}

                    {/* Highlight for valid moves */}
                    {isMyTurn && canPlace && (
                      <circle
                        cx={pos[0]}
                        cy={pos[1]}
                        r="8"
                        fill="#90EE90"
                        opacity="0.6"
                        pointerEvents="none"
                      />
                    )}

                    {canRemove && (
                      <circle
                        cx={pos[0]}
                        cy={pos[1]}
                        r="20"
                        fill="none"
                        stroke="#FF0000"
                        strokeWidth="2"
                        strokeDasharray="4"
                        className="animate-pulse"
                        pointerEvents="none"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {gameState === 'match_end' && (
          <div className="text-center space-y-4">
            <button
              onClick={handleBackToLobby}
              className="bg-white text-amber-600 font-bold py-4 px-8 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Back to Lobby
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
