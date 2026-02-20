// ========================================
// DARE ROULETTE — Socket.IO Handler
// ========================================
// Pattern: register(io) → /dare-roulette namespace
// Auto-discovered by server.js

const DareRouletteGame = require('./dareRoulette');
const { CATEGORIES } = require('./dares');
const tracker = require('../../playerTracker');

const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE = 30000;
const TURN_TIMEOUT = 20000;           // 20 s to spin once it's your turn
const RESOLVE_TIMEOUT = 60000;        // 60 s to complete/chicken-out after reveal

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new DareRouletteGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: 10 });
  });
  return list;
}

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ============================================================

function register(io) {
  const nsp = io.of('/dare-roulette');

  nsp.on('connection', (socket) => {
    console.log(`[dare-roulette] Connected: ${socket.id}`);
    socket.emit('roomList', getRoomList());

    // ── Reconnect ──
    socket.on('reconnectSession', ({ sessionId, roomId, playerName }) => {
      if (!sessionId || !roomId) return;
      const game = rooms.get(roomId);
      if (!game) { socket.emit('reconnectFailed', { message: 'Room gone' }); return; }

      if (disconnectTimers.has(sessionId)) {
        clearTimeout(disconnectTimers.get(sessionId));
        disconnectTimers.delete(sessionId);
      }

      if (game.hasDisconnectedPlayer(sessionId)) {
        const held = game.reconnectPlayer(socket.id, sessionId);
        if (held) {
          sessionToSocket.set(sessionId, socket.id);
          playerRooms.set(socket.id, roomId);
          socket.join(roomId);
          socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, true));
          socket.to(roomId).emit('playerReconnected', { playerName: held.name });
          broadcastState(nsp, roomId, game);
          return;
        }
      }
      // Fallback: join fresh
      if (game.players.size < 10) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, rounds, sessionId, categories, intensity }) => {
      const roomId = genRoomId();
      const game = getOrCreateRoom(roomId);
      if (rounds) game.maxRounds = Math.min(Math.max(rounds, 1), 10);
      if (categories) game.setCategories(categories);
      if (intensity) game.setIntensity(intensity);
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= 10) { socket.emit('error', { message: 'Room is full!' }); return; }
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Start game ──
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.canStart()) return;
      if (!game.isOwner(socket.id)) { socket.emit('error', { message: 'Only the owner can start!' }); return; }

      const result = game.startGame();
      broadcastTurnEvent(nsp, roomId, game, result);
      nsp.emit('roomList', getRoomList());
    });

    // ── Spin (current player presses the button) ──
    socket.on('spin', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const result = game.spin(socket.id);
      if (!result) return;

      game.clearTimers();

      // Broadcast animation trigger
      nsp.to(roomId).emit('spinAnimation', {
        spinner: result.spinner,
        spinnerName: result.spinnerName,
        spinDuration: result.spinDuration
      });

      // After animation, reveal the dare
      game.revealTimeout = setTimeout(() => {
        nsp.to(roomId).emit('dareRevealed', {
          spinner: result.spinner,
          spinnerName: result.spinnerName,
          dare: result.dare
        });
        broadcastState(nsp, roomId, game);

        // Resolve timeout
        game.spinTimer = setTimeout(() => {
          if (game.state === 'dareReveal' && game.currentPlayer === result.spinner) {
            autoResolve(nsp, roomId, game);
          }
        }, RESOLVE_TIMEOUT);
      }, result.spinDuration);
    });

    // ── Resolve dare (complete / chicken out) ──
    socket.on('resolveDare', ({ completed }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const result = game.resolveDare(socket.id, !!completed);
      if (!result) return;
      game.clearTimers();

      nsp.to(roomId).emit('dareResolved', {
        spinnerName: result.spinnerName,
        dare: result.dare,
        completed: result.completed,
        points: result.points,
        scores: result.scores,
        historyEntry: result.historyEntry
      });

      // Next turn after short delay
      setTimeout(() => advanceTurn(nsp, roomId, game), 3000);
    });

    // ── Chat ──
    socket.on('chatMessage', (msg) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const player = game.players.get(socket.id);
      if (!player) return;
      nsp.to(roomId).emit('chatBroadcast', { playerName: player.name, message: String(msg).slice(0, 200) });
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const player = game.players.get(socket.id);
      if (!player) return;

      const sid = player.sessionId;
      const wasSpinner = game.currentPlayer === socket.id;
      const wasOwner = game.isOwner(socket.id);
      const pName = player.name;

      if (sid) game.holdPlayerSeat(socket.id);
      game.removePlayer(socket.id);
      playerRooms.delete(socket.id);
      if (sid) sessionToSocket.delete(sid);
      tracker.playerLeft('dare-roulette');

      nsp.to(roomId).emit('playerLeft', { playerName: pName, mayReconnect: !!sid });

      if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
        game.clearTimers(); rooms.delete(roomId); nsp.emit('roomList', getRoomList()); return;
      }

      if (wasOwner && game.owner) {
        const newOwner = game.players.get(game.owner);
        nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        nsp.to(roomId).emit('systemMessage', { message: `${newOwner ? newOwner.name : 'Someone'} is now the room owner` });
      }

      if (game.players.size < 2 && game.state !== 'waiting') {
        game.clearTimers();
        game.state = 'waiting';
        nsp.to(roomId).emit('gameReset', { message: 'Not enough players — waiting…', players: game.getPlayerList() });
      } else if (wasSpinner && (game.state === 'spinning' || game.state === 'dareReveal')) {
        game.clearTimers();
        const skip = game.skipTurn();
        nsp.to(roomId).emit('dareResolved', {
          spinnerName: skip.spinnerName,
          dare: skip.dare,
          completed: false,
          points: 0,
          scores: skip.scores,
          historyEntry: skip.historyEntry
        });
        setTimeout(() => advanceTurn(nsp, roomId, game), 2000);
      }

      broadcastState(nsp, roomId, game);

      if (sid) {
        const timer = setTimeout(() => {
          disconnectTimers.delete(sid);
          if (game.disconnectedPlayers.has(sid)) {
            game.disconnectedPlayers.delete(sid);
            if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
              game.clearTimers(); rooms.delete(roomId); nsp.emit('roomList', getRoomList());
            }
          }
        }, RECONNECT_GRACE);
        disconnectTimers.set(sid, timer);
      }
      nsp.emit('roomList', getRoomList());
    });
  });
}

// ============================================================
// Helpers
// ============================================================

function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const game = getOrCreateRoom(roomId);
  game.addPlayer(socket.id, playerName, sessionId);
  playerRooms.set(socket.id, roomId);
  tracker.playerJoined('dare-roulette');
  if (sessionId) sessionToSocket.set(sessionId, socket.id);
  socket.join(roomId);

  socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { playerName });
  broadcastState(nsp, roomId, game);
  nsp.emit('roomList', getRoomList());
}

function buildPayload(game, socketId, roomId, reconnected) {
  return {
    roomId,
    players: game.getPlayerList(),
    state: game.state,
    isOwner: game.isOwner(socketId),
    owner: game.owner,
    maxRounds: game.maxRounds,
    categoryFilter: game.categoryFilter,
    maxIntensity: game.maxIntensity,
    history: game.getHistory(),
    reconnected,
    // If mid-game, send current turn info
    currentTurn: (game.state !== 'waiting' && game.state !== 'gameOver') ? {
      spinner: game.currentPlayer,
      spinnerName: (game.players.get(game.currentPlayer) || {}).name || 'Unknown',
      dare: game.state === 'dareReveal' ? game.currentDare : null,
      roundNum: game.roundNum + 1,
      maxRounds: game.maxRounds
    } : null
  };
}

function broadcastState(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
}

function broadcastTurnEvent(nsp, roomId, game, result) {
  if (!result) return;
  if (result.event === 'gameOver') {
    nsp.to(roomId).emit('gameOver', { scores: result.scores, history: result.history });
    game.state = 'waiting';
    nsp.emit('roomList', getRoomList());
    return;
  }
  if (result.event === 'yourTurn') {
    nsp.to(roomId).emit('newTurn', {
      spinner: result.spinner,
      spinnerName: result.spinnerName,
      roundNum: result.roundNum,
      maxRounds: result.maxRounds
    });
    broadcastState(nsp, roomId, game);

    // Auto-skip if they don't spin in time
    game.spinTimer = setTimeout(() => {
      if (game.state === 'spinning' && game.currentPlayer === result.spinner) {
        const skip = game.skipTurn();
        nsp.to(roomId).emit('dareResolved', {
          spinnerName: skip.spinnerName,
          dare: skip.dare,
          completed: false,
          points: 0,
          scores: skip.scores,
          historyEntry: skip.historyEntry
        });
        setTimeout(() => advanceTurn(nsp, roomId, game), 2000);
      }
    }, TURN_TIMEOUT);
  }
}

function advanceTurn(nsp, roomId, game) {
  if (game.players.size < 2) return;
  const result = game.nextTurn();
  broadcastTurnEvent(nsp, roomId, game, result);
}

function autoResolve(nsp, roomId, game) {
  const skip = game.skipTurn();
  nsp.to(roomId).emit('dareResolved', {
    spinnerName: skip.spinnerName,
    dare: skip.dare,
    completed: false,
    points: 0,
    scores: skip.scores,
    historyEntry: skip.historyEntry
  });
  setTimeout(() => advanceTurn(nsp, roomId, game), 2000);
}

module.exports = { register };
