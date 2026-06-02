// ========================================
// WAVELENGTH — Socket.IO Handler
// ========================================
// Pattern: register(io) → /wavelength namespace
// Auto-discovered by server.js

const WavelengthGame = require('./wavelengthGame');
const tracker = require('../../playerTracker');
const { saveScore, loadScore } = require('../../redisCache');

const MAX_PLAYERS = WavelengthGame.MAX_PLAYERS;

const rooms = new Map();              // roomId → WavelengthGame
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE = 30000;

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new WavelengthGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: MAX_PLAYERS });
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
  const nsp = io.of('/wavelength');

  nsp.on('connection', (socket) => {
    console.log(`[wavelength] Connected: ${socket.id}`);
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
          tracker.playerJoined('wavelength');
          socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, true));
          socket.to(roomId).emit('playerReconnected', { playerName: held.name });
          broadcastState(nsp, roomId, game);
          nsp.emit('roomList', getRoomList());
          return;
        }
      }
      // Fallback: join fresh if room has space
      if (game.players.size < MAX_PLAYERS) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, rounds, sessionId }) => {
      const roomId = genRoomId();
      const game = getOrCreateRoom(roomId);
      if (rounds !== undefined) game.setRounds(rounds);
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      if (!roomId) return;
      const game = rooms.get(String(roomId).toUpperCase());
      if (!game) { socket.emit('errorMsg', { message: 'Room not found!' }); return; }
      if (game.players.size >= MAX_PLAYERS) { socket.emit('errorMsg', { message: 'Room is full!' }); return; }
      joinRoom(nsp, socket, String(roomId).toUpperCase(), playerName, sessionId);
    });

    // ── Start game (owner + canStart only) ──
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.canStart()) return;
      if (!game.isOwner(socket.id)) { socket.emit('errorMsg', { message: 'Only the owner can start!' }); return; }

      const result = game.startGame();
      if (result) {
        emitNewRound(nsp, roomId, game, result);
        nsp.emit('roomList', getRoomList());
      }
    });

    // ── Play again (owner only) ──
    socket.on('playAgain', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      if (!game.isOwner(socket.id)) { socket.emit('errorMsg', { message: 'Only the owner can restart!' }); return; }
      if (game.state !== 'gameOver' && game.state !== 'waiting') return;
      game.clearTimers();
      game.state = 'waiting';
      game.roundNum = 0;
      nsp.to(roomId).emit('gameReset', { message: 'Back to the lobby!', players: game.getPlayerList() });
      broadcastState(nsp, roomId, game);
    });

    // ── Submit clue (clue-giver only) ──
    socket.on('submitClue', ({ clue }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const result = game.submitClue(socket.id, clue);
      if (!result) return;
      socket.emit('clueAccepted', { clue: result.clue });
      // Move straight to guessing once a clue is locked in.
      game.clearTimers();
      advanceToGuessing(nsp, roomId, game);
    });

    // ── Submit guess (guessers only) ──
    socket.on('submitGuess', ({ value }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const result = game.submitGuess(socket.id, value);
      if (!result) return;
      socket.emit('guessAccepted', { value: Math.max(0, Math.min(100, Math.round(Number(value)))) });
      nsp.to(roomId).emit('guessUpdate', {
        totalGuessed: result.totalGuessed,
        totalGuessers: result.totalGuessers
      });
      broadcastState(nsp, roomId, game);
      if (game.allGuessed()) {
        game.clearTimers();
        advanceToReveal(nsp, roomId, game);
      }
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
      const wasOwner = game.isOwner(socket.id);
      const wasClueGiver = game.isClueGiver(socket.id);
      const pName = player.name;

      if (sid && player.score > 0) saveScore('wavelength', sid, player.score);

      if (sid) game.holdPlayerSeat(socket.id);
      game.removePlayer(socket.id);
      playerRooms.delete(socket.id);
      if (sid) sessionToSocket.delete(sid);
      tracker.playerLeft('wavelength');

      nsp.to(roomId).emit('playerLeft', { playerName: pName, mayReconnect: !!sid });

      // Room fully empty → tear down
      if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
        game.clearTimers(); rooms.delete(roomId); nsp.emit('roomList', getRoomList()); return;
      }

      // Owner transfer
      if (wasOwner && game.owner) {
        const newOwner = game.players.get(game.owner);
        nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        nsp.to(roomId).emit('systemMessage', { message: `${newOwner ? newOwner.name : 'Someone'} is now the room owner` });
      }

      // If the clue-giver dropped mid-round, skip to next round so play continues.
      if (wasClueGiver && (game.state === 'clue' || game.state === 'guess')) {
        game.clearTimers();
        if (game.players.size < WavelengthGame.MIN_PLAYERS) {
          resetToWaiting(nsp, roomId, game);
        } else {
          advanceToNextRound(nsp, roomId, game);
        }
      } else if (game.players.size < WavelengthGame.MIN_PLAYERS && game.state !== 'waiting' && game.state !== 'gameOver') {
        resetToWaiting(nsp, roomId, game);
      } else if (game.state === 'guess' && game.allGuessed()) {
        // A departing guesser may have been the last one outstanding.
        game.clearTimers();
        advanceToReveal(nsp, roomId, game);
      }

      broadcastState(nsp, roomId, game);

      if (sid) {
        const timer = setTimeout(() => {
          disconnectTimers.delete(sid);
          if (game.disconnectedPlayers.has(sid)) {
            game.disconnectedPlayers.delete(sid);
            if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
              game.clearTimers(); rooms.delete(roomId); nsp.emit('roomList', getRoomList());
            } else {
              broadcastState(nsp, roomId, game);
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
// Phase advancement helpers
// ============================================================

// Guard: the room must still exist and be the same instance before a stored
// phase timer's callback is allowed to drive game flow.
function roomAlive(roomId, game) {
  return rooms.get(roomId) === game;
}

function emitNewRound(nsp, roomId, game, result) {
  // Broadcast the public round info to everyone…
  nsp.to(roomId).emit('newRound', {
    roundNum: result.roundNum,
    maxRounds: result.maxRounds,
    spectrum: result.spectrum,
    clueGiverId: result.clueGiverId,
    clueGiverName: result.clueGiverName,
    clueDuration: game.clueDuration
  });
  // …then privately hand the secret target to the clue-giver only.
  const cg = nsp.sockets.get(result.clueGiverId);
  if (cg) cg.emit('yourTarget', { target: result.target });

  broadcastState(nsp, roomId, game);

  game.phaseTimer = setTimeout(() => {
    advanceToGuessing(nsp, roomId, game);
  }, game.clueDuration);
}

function advanceToGuessing(nsp, roomId, game) {
  if (!roomAlive(roomId, game)) return;
  if (game.state !== 'clue') return;
  const result = game.startGuessing();
  if (!result) return;
  nsp.to(roomId).emit('guessPhase', {
    clue: result.clue,
    spectrum: result.spectrum,
    clueGiverId: result.clueGiverId,
    clueGiverName: result.clueGiverName,
    guessDuration: game.guessDuration
  });
  broadcastState(nsp, roomId, game);

  game.phaseTimer = setTimeout(() => {
    advanceToReveal(nsp, roomId, game);
  }, game.guessDuration);
}

function advanceToReveal(nsp, roomId, game) {
  if (!roomAlive(roomId, game)) return;
  if (game.state !== 'guess') return;
  const result = game.scoreRound();
  nsp.to(roomId).emit('reveal', {
    roundNum: result.roundNum,
    maxRounds: result.maxRounds,
    spectrum: result.spectrum,
    target: result.target,
    clue: result.clue,
    clueGiverId: result.clueGiverId,
    clueGiverName: result.clueGiverName,
    clueGiverPoints: result.clueGiverPoints,
    guesses: result.guesses,
    scores: result.scores,
    revealDuration: game.revealDuration
  });
  broadcastState(nsp, roomId, game);

  game.phaseTimer = setTimeout(() => {
    advanceToNextRound(nsp, roomId, game);
  }, game.revealDuration);
}

function advanceToNextRound(nsp, roomId, game) {
  if (!roomAlive(roomId, game)) return;
  if (game.players.size < WavelengthGame.MIN_PLAYERS) {
    resetToWaiting(nsp, roomId, game);
    return;
  }

  const result = game.nextRound();
  if (!result) { resetToWaiting(nsp, roomId, game); return; }

  if (result.event === 'gameOver') {
    nsp.to(roomId).emit('gameOver', { scores: result.scores, history: result.history });
    game.state = 'gameOver';
    nsp.emit('roomList', getRoomList());
    return;
  }

  emitNewRound(nsp, roomId, game, result);
}

function resetToWaiting(nsp, roomId, game) {
  if (!roomAlive(roomId, game)) return;
  game.clearTimers();
  game.state = 'waiting';
  game.roundNum = 0;
  nsp.to(roomId).emit('gameReset', { message: 'Not enough players — waiting…', players: game.getPlayerList() });
  broadcastState(nsp, roomId, game);
  nsp.emit('roomList', getRoomList());
}

// ============================================================
// Join + payload helpers
// ============================================================

async function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const game = getOrCreateRoom(roomId);
  game.addPlayer(socket.id, playerName, sessionId);
  playerRooms.set(socket.id, roomId);
  tracker.playerJoined('wavelength');
  if (sessionId) sessionToSocket.set(sessionId, socket.id);

  // Restore cached score from Redis (best effort)
  if (sessionId) {
    const cached = await loadScore('wavelength', sessionId);
    if (cached !== null) {
      const p = game.players.get(socket.id);
      if (p && p.score === 0) p.score = cached;
    }
  }
  socket.join(roomId);

  socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { playerName: game.players.get(socket.id)?.name || playerName });
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
    history: game.getHistory(),
    reconnected,
    // Full current-phase payload (secret target included ONLY if this socket
    // is the clue-giver) so the (re)joining client can act immediately.
    gameState: game.getCurrentState(socketId)
  };
}

function broadcastState(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
}

module.exports = { register };
