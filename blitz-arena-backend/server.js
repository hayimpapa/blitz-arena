require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Game state management
const gameRooms = new Map();
const waitingPlayers = new Map(); // gameType -> array of player sockets
const playerStats = new Map(); // playerId -> {wins, losses, gamesPlayed}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Send current online player counts
  socket.on('request_player_counts', () => {
    const counts = {
      speedTicTacToe: (waitingPlayers.get('speedTicTacToe')?.length || 0) + 
                      (Array.from(gameRooms.values()).filter(room => 
                        room.gameType === 'speedTicTacToe' && room.status === 'playing').length * 2)
    };
    socket.emit('player_counts', counts);
  });

  // Player joins matchmaking queue
  socket.on('join_queue', (data) => {
    const { gameType, playerId, playerName } = data;
    
    if (!waitingPlayers.has(gameType)) {
      waitingPlayers.set(gameType, []);
    }
    
    const queue = waitingPlayers.get(gameType);
    const playerData = { socket, playerId, playerName };
    
    // Check if there's someone waiting
    if (queue.length > 0) {
      const opponent = queue.shift();
      createGameRoom(gameType, playerData, opponent);
    } else {
      queue.push(playerData);
      socket.emit('queue_joined', { position: queue.length });
    }
    
    broadcastPlayerCounts();
  });

  // Leave queue
  socket.on('leave_queue', (data) => {
    const { gameType } = data;
    if (waitingPlayers.has(gameType)) {
      const queue = waitingPlayers.get(gameType);
      const index = queue.findIndex(p => p.socket.id === socket.id);
      if (index > -1) {
        queue.splice(index, 1);
      }
    }
    broadcastPlayerCounts();
  });

  // Handle game moves
  socket.on('game_move', (data) => {
    const { roomId, move } = data;
    const room = gameRooms.get(roomId);
    
    if (!room) return;
    
    // Process move based on game type
    if (room.gameType === 'speedTicTacToe') {
      handleTicTacToeMove(room, socket, move);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    handlePlayerDisconnect(socket);
    broadcastPlayerCounts();
  });
});

// Create a new game room
function createGameRoom(gameType, player1, player2) {
  const roomId = `${gameType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const room = {
    id: roomId,
    gameType,
    players: [player1, player2],
    currentRound: 0,
    scores: [0, 0],
    currentPlayer: 0,
    board: Array(9).fill(null),
    status: 'playing',
    startTime: Date.now()
  };
  
  gameRooms.set(roomId, room);
  
  // Join both players to the room
  player1.socket.join(roomId);
  player2.socket.join(roomId);
  
  // Notify players
  player1.socket.emit('game_start', {
    roomId,
    playerNumber: 0,
    opponent: player2.playerName,
    symbol: 'X'
  });
  
  player2.socket.emit('game_start', {
    roomId,
    playerNumber: 1,
    opponent: player1.playerName,
    symbol: 'O'
  });
  
  // Send initial game state
  io.to(roomId).emit('game_state', getGameState(room));
}

// Handle Tic-Tac-Toe move
function handleTicTacToeMove(room, socket, move) {
  const { position } = move;
  const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
  
  // Validate move
  if (playerIndex !== room.currentPlayer) {
    socket.emit('invalid_move', { reason: 'Not your turn' });
    return;
  }
  
  if (room.board[position] !== null) {
    socket.emit('invalid_move', { reason: 'Position occupied' });
    return;
  }
  
  // Make move
  room.board[position] = playerIndex === 0 ? 'X' : 'O';
  
  // Check win condition
  const winner = checkWinner(room.board);
  
  if (winner) {
    handleRoundEnd(room, winner === 'X' ? 0 : 1);
  } else if (room.board.every(cell => cell !== null)) {
    handleRoundEnd(room, -1); // Draw
  } else {
    // Switch player
    room.currentPlayer = 1 - room.currentPlayer;
    io.to(room.id).emit('game_state', getGameState(room));
  }
}

// Check for winner in Tic-Tac-Toe
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6] // Diagonals
  ];
  
  for (let line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

// Handle round end
function handleRoundEnd(room, winnerIndex) {
  if (winnerIndex >= 0) {
    room.scores[winnerIndex]++;
  }
  
  room.currentRound++;
  
  // Check if match is over (best of 5)
  if (room.currentRound >= 5 || room.scores[0] >= 3 || room.scores[1] >= 3) {
    handleMatchEnd(room);
  } else {
    // Reset board for next round
    room.board = Array(9).fill(null);
    room.currentPlayer = room.currentRound % 2; // Alternate who goes first
    
    io.to(room.id).emit('round_end', {
      winner: winnerIndex,
      scores: room.scores,
      nextRound: room.currentRound + 1
    });
    
    // Start next round after brief delay
    setTimeout(() => {
      io.to(room.id).emit('game_state', getGameState(room));
    }, 2000);
  }
}

// Handle match end
function handleMatchEnd(room) {
  const winnerIndex = room.scores[0] > room.scores[1] ? 0 : 1;
  
  io.to(room.id).emit('match_end', {
    winner: winnerIndex,
    finalScores: room.scores
  });
  
  // Update player stats
  updatePlayerStats(room.players[winnerIndex].playerId, true);
  updatePlayerStats(room.players[1 - winnerIndex].playerId, false);
  
  // Clean up room after delay
  setTimeout(() => {
    gameRooms.delete(room.id);
  }, 5000);
}

// Update player statistics
function updatePlayerStats(playerId, won) {
  if (!playerStats.has(playerId)) {
    playerStats.set(playerId, { wins: 0, losses: 0, gamesPlayed: 0 });
  }
  
  const stats = playerStats.get(playerId);
  stats.gamesPlayed++;
  if (won) {
    stats.wins++;
  } else {
    stats.losses++;
  }
}

// Get current game state
function getGameState(room) {
  return {
    board: room.board,
    currentPlayer: room.currentPlayer,
    scores: room.scores,
    round: room.currentRound + 1
  };
}

// Handle player disconnect
function handlePlayerDisconnect(socket) {
  // Remove from waiting queues
  waitingPlayers.forEach((queue, gameType) => {
    const index = queue.findIndex(p => p.socket.id === socket.id);
    if (index > -1) {
      queue.splice(index, 1);
    }
  });
  
  // Handle active games
  gameRooms.forEach((room, roomId) => {
    const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
    if (playerIndex > -1) {
      // Notify opponent
      const opponentIndex = 1 - playerIndex;
      room.players[opponentIndex].socket.emit('opponent_disconnected');
      
      // Award win to remaining player
      updatePlayerStats(room.players[opponentIndex].playerId, true);
      updatePlayerStats(room.players[playerIndex].playerId, false);
      
      gameRooms.delete(roomId);
    }
  });
}

// Broadcast player counts to all connected clients
function broadcastPlayerCounts() {
  const counts = {
    speedTicTacToe: (waitingPlayers.get('speedTicTacToe')?.length || 0) + 
                    (Array.from(gameRooms.values()).filter(room => 
                      room.gameType === 'speedTicTacToe' && room.status === 'playing').length * 2)
  };
  io.emit('player_counts', counts);
}

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/leaderboard/:gameType', (req, res) => {
  const { gameType } = req.params;
  
  const leaderboard = Array.from(playerStats.entries())
    .map(([playerId, stats]) => ({
      playerId,
      ...stats,
      winRate: stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed * 100).toFixed(1) : 0
    }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 100);
  
  res.json(leaderboard);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Blitz Arena server running on port ${PORT}`);
});