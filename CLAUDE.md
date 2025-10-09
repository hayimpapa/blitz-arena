# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Blitz Arena is a real-time multiplayer gaming platform featuring Speed Tic-Tac-Toe with matchmaking, live gameplay, and leaderboards. The application consists of a Next.js frontend and Node.js/Socket.IO backend with Supabase for authentication and data persistence.

## Development Commands

### Frontend (Next.js)
```bash
cd blitz-arena-frontend
npm run dev      # Start development server on http://localhost:3000
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Backend (Node.js + Socket.IO)
```bash
cd blitz-arena-backend
npm run dev      # Start with nodemon (auto-reload)
npm start        # Start production server on port 3001
```

### Running the Full Stack
You need to run both frontend and backend simultaneously in separate terminals for the application to function properly.

## Architecture

### Frontend Structure (`blitz-arena-frontend/src/`)

**React Contexts:**
- `AuthContext.js` - Manages Supabase authentication state, user sessions, and profile data
- `SocketContext.js` - Maintains WebSocket connection to backend, handles reconnection logic

**Main Components:**
- `SpeedTicTacToe.js` - Game UI with matchmaking, turn-based gameplay, timer, and rematch functionality
- `GameLobby.js` - Main menu for game selection and navigation
- `AuthPage.js` - Login/signup interface
- `Leaderboard.js` - Displays player rankings and statistics

**App Router:**
- `src/app/page.js` - Root component that orchestrates view switching (lobby/game/leaderboard)
- `src/app/layout.js` - Wraps app with AuthProvider and SocketProvider

### Backend Architecture (`blitz-arena-backend/`)

**Core Server (`server.js`):**
- Express HTTP server with Socket.IO for real-time communication
- In-memory game state management using Maps:
  - `gameRooms` - Active game sessions
  - `waitingPlayers` - Matchmaking queues by game type
  - `playerSessions` - Socket to user ID mapping
  - `rematchRequests` - Tracks rematch requests per room

**Socket.IO Event Flow:**
1. Client connects → `authenticate` event with userId
2. Join matchmaking → `join_queue` event
3. Two players matched → `createGameRoom()` → emit `game_start` to both
4. Gameplay → `game_move` events → server validates → emit `game_state` updates
5. Round/match end → save to Supabase → emit results
6. Rematch → `request_rematch`/`decline_rematch` → create new room or cleanup

**Game Logic:**
- Best of 5 rounds (first to 3 wins or 5 rounds played)
- Turn-based with 10-second timer per move (enforced client-side)
- Disconnect handling awards victory to remaining player
- Rematch requires both players to accept

**REST API Endpoints:**
- `GET /api/health` - Server health check
- `GET /api/leaderboard/:gameType` - Fetch rankings
- `GET /api/user-stats/:userId/:gameType` - Fetch individual player stats

### Database (Supabase)

**Tables:**
- `profiles` - User profiles (username, id)
- `game_stats` - Player statistics (wins, losses, games_played, rounds won/lost)
- `match_history` - Complete match records

**Backend uses service role key** for full database access via `supabaseClient.js`
**Frontend uses anon key** for auth and RLS-protected queries via `lib/supabase.js`

## Environment Variables

### Backend (`.env` in `blitz-arena-backend/`)
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key
FRONTEND_URL=http://localhost:3000
PORT=3001
```

### Frontend (`.env.local` in `blitz-arena-frontend/`)
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Key Implementation Details

### Real-Time State Synchronization
The game uses a server-authoritative model: all game logic runs on the backend. The frontend only renders state and sends move requests. This prevents cheating and ensures consistency.

### Matchmaking Flow
Players are queued in `waitingPlayers` Map keyed by game type. When two players are in queue, `createGameRoom()` is called immediately, joining both socket connections to a unique room ID.

### Round vs Match
- **Round**: Single Tic-Tac-Toe board (can be won, lost, or drawn)
- **Match**: Best of 5 rounds between two players
- Score is tracked across rounds; match ends when one player reaches 3 wins OR 5 rounds complete

### Rematch System
When a match ends, either player can request rematch. The backend tracks requests in `rematchRequests` Map. When both players accept, it creates a new game room with the same players and cleans up the old room after a 1-second delay.

### React Strict Mode Handling
`SocketContext.js` uses `useRef` to prevent duplicate socket connections in development (React Strict Mode mounts components twice).

## Common Patterns

### Adding a New Game Type
1. Update backend `createGameRoom()` to handle new game type
2. Add move handler function (like `handleTicTacToeMove()`)
3. Implement win condition checker
4. Create frontend component (follow `SpeedTicTacToe.js` structure)
5. Add game card to `GameLobby.js`
6. Update database schema if stats differ

### Modifying Game Rules
Game logic lives in `server.js`:
- Win conditions: `checkWinner()` function
- Round end: `handleRoundEnd()` function
- Match end: `handleMatchEnd()` function

### Adding Socket Events
1. Define event handler in `io.on('connection', ...)` block in `server.js`
2. Add corresponding `socket.on(...)` listener in frontend component
3. Clean up listener in component's `useEffect` return function

## Database Schema Notes

The `updatePlayerStats()` function handles both wins and draws correctly. When a draw occurs (`winnerIndex === -1`), it increments `games_played` but not wins/losses. Always check for null winner when querying match_history.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TailwindCSS 4, Socket.IO Client
- **Backend**: Node.js, Express 5, Socket.IO 4, Supabase JS Client
- **Database**: Supabase (PostgreSQL with Auth)
- **Real-time**: Socket.IO with WebSocket transport
