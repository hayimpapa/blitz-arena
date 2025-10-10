/**
 * ConnectionManager - Handles all multiplayer networking logic
 *
 * Responsibilities:
 * - Player connection state management
 * - Heartbeat/ping monitoring
 * - Move and session timeouts
 * - Graceful quit vs disconnect detection
 * - Reconnection handling
 * - Game session lifecycle
 * - Cleanup of stale sessions
 */

class ConnectionManager {
  constructor(io) {
    this.io = io;

    // Player state tracking
    this.playerSessions = new Map(); // socketId -> userId
    this.playerStates = new Map(); // socketId -> { userId, roomId, lastHeartbeat, isConnected }

    // Timeout management
    this.turnTimers = new Map(); // roomId -> { timerId, playerId, startTime }
    this.sessionTimeouts = new Map(); // roomId -> timerId
    this.rematchTimeouts = new Map(); // roomId -> timerId

    // Heartbeat configuration
    this.HEARTBEAT_INTERVAL = 5000; // 5 seconds
    this.HEARTBEAT_TIMEOUT = 15000; // 15 seconds - disconnect if no heartbeat
    this.heartbeatIntervals = new Map(); // socketId -> intervalId

    // Reconnection tracking
    this.disconnectedPlayers = new Map(); // userId -> { socketId, roomId, timestamp, playerData }
    this.RECONNECTION_WINDOW = 30000; // 30 seconds to reconnect
  }

  /**
   * Initialize a player session when they connect
   * @param {Socket} socket - Socket.io socket instance
   * @param {string} userId - Unique user identifier
   */
  initializePlayer(socket, userId) {
    this.playerSessions.set(socket.id, userId);
    this.playerStates.set(socket.id, {
      userId,
      roomId: null,
      lastHeartbeat: Date.now(),
      isConnected: true,
      reconnecting: false
    });

    console.log(`Player initialized: ${userId} (${socket.id})`);

    // Start heartbeat monitoring
    this.startHeartbeat(socket);
  }

  /**
   * Start heartbeat monitoring for a socket connection
   * Sends ping requests and monitors for timeouts
   * @param {Socket} socket - Socket.io socket instance
   */
  startHeartbeat(socket) {
    // Clear any existing heartbeat
    this.stopHeartbeat(socket.id);

    const intervalId = setInterval(() => {
      const state = this.playerStates.get(socket.id);
      if (!state) {
        this.stopHeartbeat(socket.id);
        return;
      }

      const timeSinceLastHeartbeat = Date.now() - state.lastHeartbeat;

      // Check if player has timed out
      if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        console.log(`Player ${state.userId} heartbeat timeout`);
        this.handleTimeout(socket);
        return;
      }

      // Send ping
      socket.emit('heartbeat_ping', { timestamp: Date.now() });
    }, this.HEARTBEAT_INTERVAL);

    this.heartbeatIntervals.set(socket.id, intervalId);

    // Listen for pong responses
    socket.on('heartbeat_pong', () => {
      const state = this.playerStates.get(socket.id);
      if (state) {
        state.lastHeartbeat = Date.now();
      }
    });
  }

  /**
   * Stop heartbeat monitoring for a socket
   * @param {string} socketId - Socket identifier
   */
  stopHeartbeat(socketId) {
    const intervalId = this.heartbeatIntervals.get(socketId);
    if (intervalId) {
      clearInterval(intervalId);
      this.heartbeatIntervals.delete(socketId);
    }
  }

  /**
   * Handle heartbeat timeout - treat as graceful timeout
   * @param {Socket} socket - Socket.io socket instance
   */
  handleTimeout(socket) {
    this.stopHeartbeat(socket.id);
    const state = this.playerStates.get(socket.id);
    if (state) {
      console.log(`Session timeout for user ${state.userId}`);
      // Emit timeout event to be handled by game logic
      socket.emit('session_timeout');
      this.handleDisconnect(socket, true); // Mark as graceful timeout
    }
  }

  /**
   * Associate a player with a game room
   * @param {string} socketId - Socket identifier
   * @param {string} roomId - Room identifier
   */
  joinRoom(socketId, roomId) {
    const state = this.playerStates.get(socketId);
    if (state) {
      state.roomId = roomId;
      console.log(`Player ${state.userId} joined room ${roomId}`);
    }
  }

  /**
   * Start a turn timer for the current player
   * Automatically awards round to opponent if time expires
   * @param {string} roomId - Room identifier
   * @param {string} playerId - Current player's socket ID
   * @param {number} duration - Timer duration in milliseconds
   * @param {Function} onTimeout - Callback when timer expires
   */
  startTurnTimer(roomId, playerId, duration, onTimeout) {
    // Clear any existing timer for this room
    this.clearTurnTimer(roomId);

    const timerId = setTimeout(() => {
      console.log(`Turn timer expired for room ${roomId}, player ${playerId}`);
      this.turnTimers.delete(roomId);
      if (onTimeout) {
        onTimeout(playerId);
      }
    }, duration);

    this.turnTimers.set(roomId, {
      timerId,
      playerId,
      startTime: Date.now()
    });
  }

  /**
   * Clear the turn timer for a room
   * @param {string} roomId - Room identifier
   */
  clearTurnTimer(roomId) {
    const timer = this.turnTimers.get(roomId);
    if (timer) {
      clearTimeout(timer.timerId);
      this.turnTimers.delete(roomId);
    }
  }

  /**
   * Get remaining time on turn timer
   * @param {string} roomId - Room identifier
   * @returns {number} Milliseconds remaining, or 0 if no timer
   */
  getTurnTimeRemaining(roomId) {
    const timer = this.turnTimers.get(roomId);
    if (!timer) return 0;

    const elapsed = Date.now() - timer.startTime;
    return Math.max(0, 10000 - elapsed); // Assuming 10s turn time
  }

  /**
   * Start a rematch timeout timer
   * @param {string} roomId - Room identifier
   * @param {number} duration - Timer duration in milliseconds
   * @param {Function} onTimeout - Callback when timer expires
   */
  startRematchTimer(roomId, duration, onTimeout) {
    this.clearRematchTimer(roomId);

    const timerId = setTimeout(() => {
      console.log(`Rematch timer expired for room ${roomId}`);
      this.rematchTimeouts.delete(roomId);
      if (onTimeout) {
        onTimeout();
      }
    }, duration);

    this.rematchTimeouts.set(roomId, timerId);
  }

  /**
   * Clear rematch timer for a room
   * @param {string} roomId - Room identifier
   */
  clearRematchTimer(roomId) {
    const timerId = this.rematchTimeouts.get(roomId);
    if (timerId) {
      clearTimeout(timerId);
      this.rematchTimeouts.delete(roomId);
    }
  }

  /**
   * Handle player disconnect - distinguish between graceful quit and network issue
   * @param {Socket} socket - Socket.io socket instance
   * @param {boolean} isGraceful - Whether this was a graceful disconnect/timeout
   * @returns {Object} Disconnect info { userId, roomId, wasGraceful }
   */
  handleDisconnect(socket, isGraceful = false) {
    const state = this.playerStates.get(socket.id);
    if (!state) {
      return null;
    }

    const userId = state.userId;
    const roomId = state.roomId;

    console.log(`Player disconnected: ${userId} (graceful: ${isGraceful})`);

    // Stop heartbeat monitoring
    this.stopHeartbeat(socket.id);

    // Mark as disconnected but keep state for potential reconnection
    state.isConnected = false;
    state.disconnectTime = Date.now();
    state.wasGraceful = isGraceful;

    // Store player data for reconnection window
    if (!isGraceful && roomId) {
      this.disconnectedPlayers.set(userId, {
        socketId: socket.id,
        roomId,
        timestamp: Date.now(),
        state: { ...state }
      });

      // Set reconnection timeout
      setTimeout(() => {
        const disconnectData = this.disconnectedPlayers.get(userId);
        if (disconnectData && disconnectData.timestamp === state.disconnectTime) {
          console.log(`Reconnection window expired for ${userId}`);
          this.disconnectedPlayers.delete(userId);
        }
      }, this.RECONNECTION_WINDOW);
    }

    return {
      userId,
      roomId,
      wasGraceful: isGraceful,
      socketId: socket.id
    };
  }

  /**
   * Attempt to reconnect a player to their previous session
   * @param {Socket} socket - New socket instance
   * @param {string} userId - User identifier
   * @returns {Object|null} Reconnection data or null if no session found
   */
  attemptReconnection(socket, userId) {
    const disconnectData = this.disconnectedPlayers.get(userId);

    if (!disconnectData) {
      console.log(`No reconnection data for ${userId}`);
      return null;
    }

    const timeSinceDisconnect = Date.now() - disconnectData.timestamp;

    if (timeSinceDisconnect > this.RECONNECTION_WINDOW) {
      console.log(`Reconnection window expired for ${userId}`);
      this.disconnectedPlayers.delete(userId);
      return null;
    }

    console.log(`Player ${userId} reconnecting to room ${disconnectData.roomId}`);

    // Update to new socket
    const oldState = this.playerStates.get(disconnectData.socketId);
    if (oldState) {
      this.playerStates.delete(disconnectData.socketId);
    }

    this.playerSessions.set(socket.id, userId);
    this.playerStates.set(socket.id, {
      ...disconnectData.state,
      isConnected: true,
      reconnecting: true,
      lastHeartbeat: Date.now()
    });

    this.disconnectedPlayers.delete(userId);
    this.startHeartbeat(socket);

    return {
      roomId: disconnectData.roomId,
      reconnected: true
    };
  }

  /**
   * Check if a user is currently in a disconnected state waiting to reconnect
   * @param {string} userId - User identifier
   * @returns {boolean} True if user can reconnect
   */
  canReconnect(userId) {
    return this.disconnectedPlayers.has(userId);
  }

  /**
   * Gracefully quit a player from their session
   * @param {string} socketId - Socket identifier
   */
  gracefulQuit(socketId) {
    const state = this.playerStates.get(socketId);
    if (!state) return;

    console.log(`Graceful quit for ${state.userId}`);

    // Clean up room association
    const roomId = state.roomId;

    // Stop heartbeat
    this.stopHeartbeat(socketId);

    // Clean up state
    this.playerSessions.delete(socketId);
    this.playerStates.delete(socketId);

    // Don't add to disconnectedPlayers for graceful quits
    return { userId: state.userId, roomId };
  }

  /**
   * Clean up all resources for a room (timers, states, etc.)
   * @param {string} roomId - Room identifier
   */
  cleanupRoom(roomId) {
    console.log(`Cleaning up room: ${roomId}`);

    // Clear all timers for this room
    this.clearTurnTimer(roomId);
    this.clearRematchTimer(roomId);

    const sessionTimeout = this.sessionTimeouts.get(roomId);
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
      this.sessionTimeouts.delete(roomId);
    }

    // Remove room associations from player states
    for (const [socketId, state] of this.playerStates.entries()) {
      if (state.roomId === roomId) {
        state.roomId = null;
      }
    }

    // Clean up any disconnected players associated with this room
    for (const [userId, data] of this.disconnectedPlayers.entries()) {
      if (data.roomId === roomId) {
        this.disconnectedPlayers.delete(userId);
      }
    }
  }

  /**
   * Get current connection state for a socket
   * @param {string} socketId - Socket identifier
   * @returns {Object|null} Player state object or null
   */
  getPlayerState(socketId) {
    return this.playerStates.get(socketId);
  }

  /**
   * Get user ID for a socket
   * @param {string} socketId - Socket identifier
   * @returns {string|null} User ID or null
   */
  getUserId(socketId) {
    return this.playerSessions.get(socketId);
  }

  /**
   * Check if a socket is connected and active
   * @param {string} socketId - Socket identifier
   * @returns {boolean} True if connected
   */
  isConnected(socketId) {
    const state = this.playerStates.get(socketId);
    return state ? state.isConnected : false;
  }

  /**
   * Clean up all resources for a socket (call on disconnect)
   * @param {string} socketId - Socket identifier
   */
  cleanup(socketId) {
    this.stopHeartbeat(socketId);

    const state = this.playerStates.get(socketId);
    if (state && state.roomId) {
      // Note: Don't cleanup room here - let game logic handle it
      // Just clean up player-specific resources
    }

    // Keep player state for potential reconnection
    // Only remove from playerSessions
    this.playerSessions.delete(socketId);
  }

  /**
   * Completely remove a player from all tracking
   * @param {string} socketId - Socket identifier
   */
  removePlayer(socketId) {
    this.stopHeartbeat(socketId);
    this.playerSessions.delete(socketId);

    const state = this.playerStates.get(socketId);
    if (state) {
      this.disconnectedPlayers.delete(state.userId);
    }

    this.playerStates.delete(socketId);
  }

  /**
   * Get statistics about current connections
   * @returns {Object} Connection statistics
   */
  getStats() {
    const connected = Array.from(this.playerStates.values()).filter(s => s.isConnected).length;
    const disconnected = this.disconnectedPlayers.size;
    const activeRooms = new Set(Array.from(this.playerStates.values()).map(s => s.roomId).filter(r => r !== null)).size;

    return {
      connectedPlayers: connected,
      disconnectedAwaitingReconnect: disconnected,
      activeRooms,
      activeTurnTimers: this.turnTimers.size,
      activeRematchTimers: this.rematchTimeouts.size
    };
  }
}

module.exports = ConnectionManager;
