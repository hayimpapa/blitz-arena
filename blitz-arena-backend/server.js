require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const supabase = require('./supabaseClient');

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
const waitingPlayers = new Map();
const playerSessions = new Map(); // socketId -> userId mapping
const rematchRequests = new Map(); // roomId -> Set of socketIds who want rematch
const rematchTimeouts = new Map(); // roomId -> timeout ID for auto-cancel

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Authenticate user session
  socket.on('authenticate', async (data) => {
    const { userId } = data;
    if (userId) {
      playerSessions.set(socket.id, userId);
      console.log('User authenticated:', userId);
    }
  });

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
  socket.on('join_queue', async (data) => {
    const { gameType, userId, playerName } = data;
    
    if (!waitingPlayers.has(gameType)) {
      waitingPlayers.set(gameType, []);
    }
    
    const queue = waitingPlayers.get(gameType);
    const playerData = { socket, userId, playerName };
    
    // Check if there's someone waiting
    if (queue.length > 0) {
      const opponent = queue.shift();
      await createGameRoom(gameType, playerData, opponent);
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
    
    if (room.gameType === 'speedTicTacToe') {
      handleTicTacToeMove(room, socket, move);
    }
  });
// Handle rematch request
  socket.on('request_rematch', (data) => {
    const { roomId } = data;
    const room = gameRooms.get(roomId);

    if (!room) {
      socket.emit('rematch_error', { message: 'Game room not found' });
      return;
    }

    // Initialize rematch requests for this room if needed
    if (!rematchRequests.has(roomId)) {
      rematchRequests.set(roomId, new Set());
    }

    // Add this player's request
    rematchRequests.get(roomId).add(socket.id);

    // Find opponent
    const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
    if (playerIndex === -1) return;

    const opponentIndex = 1 - playerIndex;
    const opponentSocket = room.players[opponentIndex].socket;

    // Notify opponent
    opponentSocket.emit('opponent_wants_rematch');

    // Set timeout for auto-cancel if this is the first request
    if (rematchRequests.get(roomId).size === 1) {
      const timeoutId = setTimeout(() => {
        // Check if room and request still exist
        if (rematchRequests.has(roomId) && rematchRequests.get(roomId).size === 1) {
          // Only one player requested - timeout
          console.log('Rematch timeout for room:', roomId);

          // Notify the player who requested
          socket.emit('rematch_timeout');

          // Notify opponent that requester left
          opponentSocket.emit('rematch_opponent_left');

          // Clean up
          rematchRequests.delete(roomId);
          rematchTimeouts.delete(roomId);
          gameRooms.delete(roomId);
        }
      }, 30000); // 30 seconds

      rematchTimeouts.set(roomId, timeoutId);
    }

    // Check if both players want rematch
    if (rematchRequests.get(roomId).size === 2) {
      // Both players ready - create new game
      const player1 = room.players[0];
      const player2 = room.players[1];
      const gameType = room.gameType;

      // Clear timeout since both accepted
      if (rematchTimeouts.has(roomId)) {
        clearTimeout(rematchTimeouts.get(roomId));
        rematchTimeouts.delete(roomId);
      }

      // Clean up rematch requests
      rematchRequests.delete(roomId);

      // Create new game BEFORE deleting old room
      createGameRoom(gameType, player1, player2);

      // Now delete old room
      setTimeout(() => {
        gameRooms.delete(roomId);
      }, 1000);
    }
  });

  // Handle rematch decline
  socket.on('decline_rematch', (data) => {
    const { roomId } = data;
    const room = gameRooms.get(roomId);

    if (!room) return;

    // Find opponent
    const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
    if (playerIndex === -1) return;

    const opponentIndex = 1 - playerIndex;
    const opponentSocket = room.players[opponentIndex].socket;

    // Notify opponent
    opponentSocket.emit('rematch_declined');

    // Clear timeout if exists
    if (rematchTimeouts.has(roomId)) {
      clearTimeout(rematchTimeouts.get(roomId));
      rematchTimeouts.delete(roomId);
    }

    // Clean up
    rematchRequests.delete(roomId);
    gameRooms.delete(roomId);
  });


  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    handlePlayerDisconnect(socket);
    playerSessions.delete(socket.id);
    broadcastPlayerCounts();
  });
});

// Create a new game room
async function createGameRoom(gameType, player1, player2) {
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
  
  console.log('Move attempt:', { position, playerIndex, currentPlayer: room.currentPlayer, board: room.board });
  
  if (playerIndex !== room.currentPlayer) {
    console.log('Invalid move: Not your turn');
    socket.emit('invalid_move', { reason: 'Not your turn' });
    return;
  }
  
  if (room.board[position] !== null) {
    console.log('Invalid move: Position occupied');
    socket.emit('invalid_move', { reason: 'Position occupied' });
    return;
  }
  
  room.board[position] = playerIndex === 0 ? 'X' : 'O';
  console.log('Move made:', { position, symbol: room.board[position], newBoard: room.board });
  
  const winner = checkWinner(room.board);
  
  if (winner) {
    handleRoundEnd(room, winner === 'X' ? 0 : 1);
  } else if (room.board.every(cell => cell !== null)) {
    handleRoundEnd(room, -1);
  } else {
    room.currentPlayer = 1 - room.currentPlayer;
    console.log('Next player turn:', room.currentPlayer);
    io.to(room.id).emit('game_state', getGameState(room));
  }
}

// Check for winner in Tic-Tac-Toe
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
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
  
  console.log('Round ended:', { winnerIndex, scores: room.scores, currentRound: room.currentRound });
  
  if (room.currentRound >= 5 || room.scores[0] >= 3 || room.scores[1] >= 3) {
    handleMatchEnd(room);
  } else {
    // Reset board for next round
    room.board = Array(9).fill(null);
    room.currentPlayer = room.currentRound % 2;
    
    console.log('Starting next round:', { round: room.currentRound + 1, firstPlayer: room.currentPlayer });
    
    io.to(room.id).emit('round_end', {
      winner: winnerIndex,
      scores: room.scores,
      nextRound: room.currentRound + 1
    });
    
    // Start next round after brief delay
    setTimeout(() => {
      console.log('Sending new game state for round:', room.currentRound + 1);
      io.to(room.id).emit('game_state', getGameState(room));
    }, 2000);
  }
}

// Handle match end
async function handleMatchEnd(room) {
  const winnerIndex = room.scores[0] > room.scores[1] ? 0 : room.scores[1] > room.scores[0] ? 1 : -1;
  const duration = Math.floor((Date.now() - room.startTime) / 1000);
  
  io.to(room.id).emit('match_end', {
    winner: winnerIndex,
    finalScores: room.scores
  });
  
  // Save match to database
  try {
    const player1Id = room.players[0].userId;
    const player2Id = room.players[1].userId;
    const winnerId = winnerIndex >= 0 ? room.players[winnerIndex].userId : null;
    
    // Save match history
    await supabase.from('match_history').insert({
      game_type: room.gameType,
      player1_id: player1Id,
      player2_id: player2Id,
      winner_id: winnerId,
      player1_score: room.scores[0],
      player2_score: room.scores[1],
      duration_seconds: duration
    });
    
    // Update player stats - only if not a draw
    if (winnerIndex >= 0) {
      await updatePlayerStats(player1Id, room.gameType, winnerIndex === 0, room.scores[0], room.scores[1]);
      await updatePlayerStats(player2Id, room.gameType, winnerIndex === 1, room.scores[1], room.scores[0]);
    } else {
      // Draw - update stats but no win/loss
      await updatePlayerStats(player1Id, room.gameType, null, room.scores[0], room.scores[1]);
      await updatePlayerStats(player2Id, room.gameType, null, room.scores[1], room.scores[0]);
    }
    
    console.log('Match saved to database');
  } catch (error) {
    console.error('Error saving match:', error);
  }
  
  setTimeout(() => {
    gameRooms.delete(room.id);
  }, 5000);
}

// Update player statistics in database
async function updatePlayerStats(userId, gameType, won, roundsWon, roundsLost) {
  try {
    // Get existing stats
    const { data: existingStats } = await supabase
      .from('game_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('game_type', gameType)
      .single();
    
    if (existingStats) {
      // Update existing stats
      await supabase
        .from('game_stats')
        .update({
          wins: existingStats.wins + (won ? 1 : 0),
          losses: existingStats.losses + (won ? 0 : 1),
          games_played: existingStats.games_played + 1,
          total_rounds_won: existingStats.total_rounds_won + roundsWon,
          total_rounds_lost: existingStats.total_rounds_lost + roundsLost
        })
        .eq('user_id', userId)
        .eq('game_type', gameType);
    } else {
      // Create new stats
      await supabase
        .from('game_stats')
        .insert({
          user_id: userId,
          game_type: gameType,
          wins: won ? 1 : 0,
          losses: won ? 0 : 1,
          games_played: 1,
          total_rounds_won: roundsWon,
          total_rounds_lost: roundsLost
        });
    }
  } catch (error) {
    console.error('Error updating player stats:', error);
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
  waitingPlayers.forEach((queue, gameType) => {
    const index = queue.findIndex(p => p.socket.id === socket.id);
    if (index > -1) {
      queue.splice(index, 1);
    }
  });
  
  gameRooms.forEach(async (room, roomId) => {
    const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
    if (playerIndex > -1) {
      const opponentIndex = 1 - playerIndex;
      room.players[opponentIndex].socket.emit('opponent_disconnected');
      
      // Award win to remaining player
      const duration = Math.floor((Date.now() - room.startTime) / 1000);
      
      try {
        const winnerId = room.players[opponentIndex].userId;
        const loserId = room.players[playerIndex].userId;
        
        await supabase.from('match_history').insert({
          game_type: room.gameType,
          player1_id: room.players[0].userId,
          player2_id: room.players[1].userId,
          winner_id: winnerId,
          player1_score: playerIndex === 0 ? 0 : 5,
          player2_score: playerIndex === 1 ? 0 : 5,
          duration_seconds: duration
        });
        
        await updatePlayerStats(winnerId, room.gameType, true, 5, 0);
        await updatePlayerStats(loserId, room.gameType, false, 0, 5);
      } catch (error) {
        console.error('Error saving disconnect match:', error);
      }
      
      gameRooms.delete(roomId);
    }
  });
}

// Broadcast player counts
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

app.get('/api/leaderboard/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    const { data, error } = await supabase
      .from('game_stats')
      .select(`
        *,
        profiles:user_id (username)
      `)
      .eq('game_type', gameType)
      .order('wins', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    const leaderboard = data.map(stat => ({
      username: stat.profiles?.username || 'Unknown',
      wins: stat.wins,
      losses: stat.losses,
      gamesPlayed: stat.games_played,
      winRate: stat.games_played > 0 ? ((stat.wins / stat.games_played) * 100).toFixed(1) : '0.0'
    }));
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.get('/api/user-stats/:userId/:gameType', async (req, res) => {
  try {
    const { userId, gameType } = req.params;
    
    const { data, error } = await supabase
      .from('game_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('game_type', gameType)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    
    res.json(data || {
      wins: 0,
      losses: 0,
      games_played: 0,
      total_rounds_won: 0,
      total_rounds_lost: 0
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Blitz Arena server running on port ${PORT}`);
  console.log(`✅ Connected to Supabase`);
});