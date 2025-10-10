require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const supabase = require('./supabaseClient');
const ConnectionManager = require('./ConnectionManager');

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

// Initialize Connection Manager
const connectionManager = new ConnectionManager(io);

// Game state management
const gameRooms = new Map();
const waitingPlayers = new Map();
const rematchRequests = new Map(); // roomId -> Set of socketIds who want rematch

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Authenticate user session
  socket.on('authenticate', async (data) => {
    const { userId } = data;
    if (userId) {
      // Check for reconnection
      const reconnectData = connectionManager.attemptReconnection(socket, userId);
      if (reconnectData) {
        console.log(`Player ${userId} reconnected to room ${reconnectData.roomId}`);
        const room = gameRooms.get(reconnectData.roomId);
        if (room) {
          // Update player socket reference in room
          const playerIndex = room.players.findIndex(p => p.userId === userId);
          if (playerIndex !== -1) {
            room.players[playerIndex].socket = socket;
            socket.join(reconnectData.roomId);
            socket.emit('reconnected', { roomId: reconnectData.roomId });
            socket.emit('game_state', getGameState(room));
          }
        }
      } else {
        // Normal initialization
        connectionManager.initializePlayer(socket, userId);
      }
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

    // Check if opponent is still connected
    if (opponentSocket && opponentSocket.connected) {
      // Notify opponent
      opponentSocket.emit('opponent_wants_rematch');
    } else {
      // Opponent already disconnected, notify requester immediately
      socket.emit('rematch_opponent_left');
      rematchRequests.delete(roomId);
      gameRooms.delete(roomId);
      return;
    }

    // Set timeout for auto-cancel if this is the first request
    if (rematchRequests.get(roomId).size === 1) {
      connectionManager.startRematchTimer(roomId, 30000, () => {
        const currentRoom = gameRooms.get(roomId);
        if (!currentRoom || !rematchRequests.has(roomId)) return;

        if (rematchRequests.get(roomId).size === 1) {
          console.log('Rematch timeout for room:', roomId);

          const requestingSocketId = Array.from(rematchRequests.get(roomId))[0];
          const requestingSocket = io.sockets.sockets.get(requestingSocketId);

          const player1Socket = currentRoom.players[0].socket;
          const player2Socket = currentRoom.players[1].socket;

          if (requestingSocket && requestingSocket.connected) {
            requestingSocket.emit('rematch_timeout');
          }

          if (player1Socket && player1Socket.connected && player1Socket.id !== requestingSocketId) {
            player1Socket.emit('rematch_opponent_left');
          }
          if (player2Socket && player2Socket.connected && player2Socket.id !== requestingSocketId) {
            player2Socket.emit('rematch_opponent_left');
          }

          rematchRequests.delete(roomId);
          connectionManager.cleanupRoom(roomId);
          gameRooms.delete(roomId);
        }
      });
    }

    // Check if both players want rematch
    if (rematchRequests.get(roomId).size === 2) {
      // Both players ready - create new game
      const player1 = room.players[0];
      const player2 = room.players[1];
      const gameType = room.gameType;

      // Clear timeout since both accepted
      connectionManager.clearRematchTimer(roomId);

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
    connectionManager.clearRematchTimer(roomId);

    // Clean up
    rematchRequests.delete(roomId);
    connectionManager.cleanupRoom(roomId);
    gameRooms.delete(roomId);
  });

  // Handle player leaving match end screen (cancels pending rematch)
  socket.on('leave_match_end', (data) => {
    const { roomId } = data;
    if (!roomId) return;

    const room = gameRooms.get(roomId);
    if (!room) return;

    // Check if this player had a pending rematch request
    const requests = rematchRequests.get(roomId);
    if (requests && requests.has(socket.id)) {
      // Player is leaving with a pending rematch request
      const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
      if (playerIndex !== -1) {
        const opponentIndex = 1 - playerIndex;
        const opponentSocket = room.players[opponentIndex].socket;

        // Notify opponent that player left
        if (opponentSocket && opponentSocket.connected) {
          opponentSocket.emit('rematch_opponent_left');
        }
      }

      // Clear timeout and cleanup
      connectionManager.clearRematchTimer(roomId);
      rematchRequests.delete(roomId);
      connectionManager.cleanupRoom(roomId);
      gameRooms.delete(roomId);
    }
  });


  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    // Use ConnectionManager to handle disconnect
    const disconnectInfo = connectionManager.handleDisconnect(socket, false);

    handlePlayerDisconnect(socket);
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

  // Register room with ConnectionManager
  connectionManager.joinRoom(player1.socket.id, roomId);
  connectionManager.joinRoom(player2.socket.id, roomId);

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

  // Start turn timer for first player
  startTurnTimer(room);
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

  // Clear turn timer since a valid move was made
  connectionManager.clearTurnTimer(room.id);

  const winner = checkWinner(room.board);

  if (winner) {
    handleRoundEnd(room, winner === 'X' ? 0 : 1);
  } else if (room.board.every(cell => cell !== null)) {
    handleRoundEnd(room, -1);
  } else {
    room.currentPlayer = 1 - room.currentPlayer;
    console.log('Next player turn:', room.currentPlayer);
    io.to(room.id).emit('game_state', getGameState(room));

    // Start timer for next player
    startTurnTimer(room);
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
  // Clear turn timer
  connectionManager.clearTurnTimer(room.id);

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
      // Check if room still exists before starting new round
      if (!gameRooms.has(room.id)) return;

      console.log('Sending new game state for round:', room.currentRound + 1);
      io.to(room.id).emit('game_state', getGameState(room));

      // Start timer for first player of new round
      startTurnTimer(room);
    }, 2000);
  }
}

// Handle match end
async function handleMatchEnd(room) {
  // Clear turn timer
  connectionManager.clearTurnTimer(room.id);

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

    // Skip database saving for guest users
    const hasGuestPlayer = player1Id.startsWith('guest_') || player2Id.startsWith('guest_');

    if (!hasGuestPlayer) {
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
    } else {
      console.log('Skipping match history for game with guest player(s)');
    }
    
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
    // Skip stats saving for guest users
    if (userId.startsWith('guest_')) {
      console.log(`Skipping stats for guest user: ${userId}`);
      return;
    }

    // Calculate points: win = 2, draw = 1, loss = 0
    let pointsEarned = 0;
    let draws = 0;
    if (won === true) {
      pointsEarned = 2;
    } else if (won === null) {
      pointsEarned = 1;
      draws = 1;
    }

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
          wins: existingStats.wins + (won === true ? 1 : 0),
          losses: existingStats.losses + (won === false ? 1 : 0),
          draws: (existingStats.draws || 0) + draws,
          games_played: existingStats.games_played + 1,
          total_rounds_won: existingStats.total_rounds_won + roundsWon,
          total_rounds_lost: existingStats.total_rounds_lost + roundsLost,
          points: (existingStats.points || 0) + pointsEarned
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
          wins: won === true ? 1 : 0,
          losses: won === false ? 1 : 0,
          draws: draws,
          games_played: 1,
          total_rounds_won: roundsWon,
          total_rounds_lost: roundsLost,
          points: pointsEarned
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

// Start turn timer for current player
function startTurnTimer(room) {
  const currentPlayerId = room.players[room.currentPlayer].socket.id;

  connectionManager.startTurnTimer(room.id, currentPlayerId, 10000, (playerId) => {
    // Check if room still exists
    if (!gameRooms.has(room.id)) return;

    console.log('Turn timeout - awarding round to opponent');

    // Current player loses the round for timeout
    const opponentIndex = 1 - room.currentPlayer;

    // Award round to opponent
    handleRoundEnd(room, opponentIndex);
  });
}

// Handle player disconnect
function handlePlayerDisconnect(socket) {
  waitingPlayers.forEach((queue, gameType) => {
    const index = queue.findIndex(p => p.socket.id === socket.id);
    if (index > -1) {
      queue.splice(index, 1);
    }
  });

  // Handle rematch disconnections
  rematchRequests.forEach((requests, roomId) => {
    if (requests.has(socket.id)) {
      // Player disconnected during rematch waiting
      const room = gameRooms.get(roomId);
      if (room) {
        // Notify opponent that player left
        room.players.forEach(player => {
          if (player.socket.id !== socket.id && player.socket.connected) {
            player.socket.emit('rematch_opponent_left');
          }
        });
      }

      // Clear timeout and cleanup
      connectionManager.clearRematchTimer(roomId);
      rematchRequests.delete(roomId);
      if (room) {
        connectionManager.cleanupRoom(roomId);
        gameRooms.delete(roomId);
      }
    }
  });

  gameRooms.forEach(async (room, roomId) => {
    const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
    if (playerIndex > -1) {
      // Clear turn timer
      connectionManager.clearTurnTimer(roomId);

      const opponentIndex = 1 - playerIndex;
      room.players[opponentIndex].socket.emit('opponent_disconnected');

      // Award win to remaining player
      const duration = Math.floor((Date.now() - room.startTime) / 1000);
      
      try {
        const winnerId = room.players[opponentIndex].userId;
        const loserId = room.players[playerIndex].userId;

        // Skip database saving for guest users
        const hasGuestPlayer = winnerId.startsWith('guest_') || loserId.startsWith('guest_');

        if (!hasGuestPlayer) {
          await supabase.from('match_history').insert({
            game_type: room.gameType,
            player1_id: room.players[0].userId,
            player2_id: room.players[1].userId,
            winner_id: winnerId,
            player1_score: playerIndex === 0 ? 0 : 5,
            player2_score: playerIndex === 1 ? 0 : 5,
            duration_seconds: duration
          });
        } else {
          console.log('Skipping disconnect match history for game with guest player(s)');
        }

        await updatePlayerStats(winnerId, room.gameType, true, 5, 0);
        await updatePlayerStats(loserId, room.gameType, false, 0, 5);
      } catch (error) {
        console.error('Error saving disconnect match:', error);
      }

      connectionManager.cleanupRoom(roomId);
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
      draws: 0,
      games_played: 0,
      total_rounds_won: 0,
      total_rounds_lost: 0,
      points: 0
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Points-based leaderboard for specific game type
app.get('/api/leaderboard-points/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;

    const { data, error } = await supabase
      .from('game_stats')
      .select(`
        *,
        profiles:user_id (username)
      `)
      .eq('game_type', gameType)
      .order('points', { ascending: false })
      .order('wins', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Filter out guest users and limit to top 10
    const leaderboard = data
      .filter(stat => !stat.user_id.startsWith('guest_'))
      .slice(0, 10)
      .map(stat => ({
        username: stat.profiles?.username || 'Unknown',
        points: stat.points || 0,
        wins: stat.wins,
        draws: stat.draws || 0,
        losses: stat.losses,
        gamesPlayed: stat.games_played
      }));

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching points leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// All-time all-games leaderboard (aggregated across all game types)
app.get('/api/leaderboard-all-games', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('game_stats')
      .select(`
        *,
        profiles:user_id (username)
      `);

    if (error) throw error;

    // Aggregate stats by user (excluding guests)
    const userMap = new Map();

    data.forEach(stat => {
      const userId = stat.user_id;

      // Skip guest users
      if (userId.startsWith('guest_')) {
        return;
      }

      const username = stat.profiles?.username || 'Unknown';

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          username,
          points: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          gamesPlayed: 0
        });
      }

      const userStats = userMap.get(userId);
      userStats.points += (stat.points || 0);
      userStats.wins += stat.wins;
      userStats.draws += (stat.draws || 0);
      userStats.losses += stat.losses;
      userStats.gamesPlayed += stat.games_played;
    });

    // Convert map to array and sort by points, limit to top 10
    const leaderboard = Array.from(userMap.values())
      .sort((a, b) => {
        // Sort by points first, then by wins as tiebreaker
        if (b.points !== a.points) {
          return b.points - a.points;
        }
        return b.wins - a.wins;
      })
      .slice(0, 10);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching all-games leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get aggregated user stats across all games
app.get('/api/user-stats-all/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('game_stats')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    // Aggregate all stats
    const aggregated = data.reduce((acc, stat) => ({
      points: acc.points + (stat.points || 0),
      wins: acc.wins + stat.wins,
      draws: acc.draws + (stat.draws || 0),
      losses: acc.losses + stat.losses,
      games_played: acc.games_played + stat.games_played,
      total_rounds_won: acc.total_rounds_won + stat.total_rounds_won,
      total_rounds_lost: acc.total_rounds_lost + stat.total_rounds_lost
    }), {
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      games_played: 0,
      total_rounds_won: 0,
      total_rounds_lost: 0
    });

    res.json(aggregated);
  } catch (error) {
    console.error('Error fetching aggregated user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Blitz Arena server running on port ${PORT}`);
  console.log(`✅ Connected to Supabase`);
});