// ========================================
// CONFESSIONS — Socket.IO Handler
// ========================================
// Pattern: register(io) → /confessions namespace
// Auto-discovered by server.js

const ConfessionGame = require('./confessionGame');
const tracker = require('../../playerTracker');
const { saveScore, loadScore } = require('../../redisCache');

const rooms = new Map();
const playerRooms = new Map();
const sessionToSocket = new Map();
const disconnectTimers = new Map();
const RECONNECT_GRACE = 30000;
const REVEAL_PAUSE = 6000;

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new ConfessionGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: 16 });
  });
  return list;
}

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function register(io) {
  const nsp = io.of('/confessions');

  nsp.on('connection', (socket) => {
    console.log(`[confessions] Connected: ${socket.id}`);
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
      if (game.players.size < 16) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, heat, sessionId }) => {
      const roomId = genRoomId();
      const game = getOrCreateRoom(roomId);
      if (heat) game.heatLevel = Math.min(Math.max(heat, 1), 3);
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= 16) { socket.emit('error', { message: 'Room is full!' }); return; }
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Start game ──
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.canStart()) return;
      if (!game.isOwner(socket.id)) { socket.emit('error', { message: 'Only host can start!' }); return; }

      const assignments = game.startGame();

      // Send each player their personal prompt
      game.players.forEach((player) => {
        const prompt = assignments[player.id];
        const playerSocket = nsp.sockets.get(player.id);
        if (playerSocket && prompt) {
          playerSocket.emit('submitPhase', {
            prompt: prompt.text,
            heat: prompt.heat,
            duration: game.submitDuration,
          });
        }
      });

      nsp.to(roomId).emit('phaseChange', { phase: 'submitting', duration: game.submitDuration });

      // Submit timer
      game.submitTimer = setTimeout(() => {
        game.submitTimer = null;
        endSubmitting(nsp, roomId, game);
      }, game.submitDuration * 1000);
    });

    // ── Submit confession ──
    socket.on('submitConfession', ({ text }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const ok = game.submitConfession(socket.id, text);
      if (ok) {
        socket.emit('confessionReceived');
        nsp.to(roomId).emit('submitProgress', game.getSubmitProgress());
        if (game.allSubmitted()) {
          if (game.submitTimer) { clearTimeout(game.submitTimer); game.submitTimer = null; }
          endSubmitting(nsp, roomId, game);
        }
      }
    });

    // ── Submit guess ──
    socket.on('submitGuess', ({ guessedAuthorId }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const ok = game.submitGuess(socket.id, guessedAuthorId);
      if (ok) {
        socket.emit('guessReceived');
        nsp.to(roomId).emit('guessProgress', game.getGuessProgress());
        if (game.allGuessed()) {
          if (game.guessTimer) { clearTimeout(game.guessTimer); game.guessTimer = null; }
          endGuessing(nsp, roomId, game);
        }
      }
    });

    // ── Chat ──
    socket.on('chatMessage', ({ message }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const player = game.players.get(socket.id);
      if (!player || !message || typeof message !== 'string') return;
      const text = message.trim().substring(0, 200);
      if (!text) return;
      nsp.to(roomId).emit('chatMessage', { name: player.name, message: text });
    });

    // ── Play Again ──
    socket.on('playAgain', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.isOwner(socket.id)) return;

      game.cleanup();
      game.reset();
      broadcastState(nsp, roomId, game);
      nsp.to(roomId).emit('backToLobby', { players: game.getPlayerList() });
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) { playerRooms.delete(socket.id); return; }

      const player = game.players.get(socket.id);
      if (!player) { playerRooms.delete(socket.id); return; }

      if (game.state !== 'waiting') {
        // Save score to Redis before holding player for reconnect
        if (player.sessionId && player.score > 0) saveScore('confessions', player.sessionId, player.score);
        game.holdPlayerForReconnect(socket.id);
        playerRooms.delete(socket.id);

        disconnectTimers.set(player.sessionId, setTimeout(() => {
          disconnectTimers.delete(player.sessionId);
          game.disconnectedPlayers.delete(player.sessionId);
          if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
            game.cleanup();
            rooms.delete(roomId);
          }
          nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: game.getPlayerList() });
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
          tracker.playerLeft('confessions');
          nsp.emit('roomList', getRoomList());
        }, RECONNECT_GRACE));

        nsp.to(roomId).emit('playerDisconnected', { playerName: player.name });
      } else {
        game.removePlayer(socket.id);
        playerRooms.delete(socket.id);

        if (game.players.size === 0) {
          game.cleanup();
          rooms.delete(roomId);
        } else {
          nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: game.getPlayerList() });
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        }
      }

      tracker.playerLeft('confessions');
      nsp.emit('roomList', getRoomList());
    });
  });
}

// ============================================================
// Helpers
// ============================================================

async function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const name = (playerName || 'Anon').substring(0, 20).trim() || 'Anon';
  const game = getOrCreateRoom(roomId);
  const player = game.addPlayer(socket.id, name, sessionId);

  // Restore cached score from Redis
  if (sessionId) {
    const cached = await loadScore('confessions', sessionId);
    if (cached !== null && player && player.score === 0) player.score = cached;
  }

  sessionToSocket.set(sessionId, socket.id);
  playerRooms.set(socket.id, roomId);
  socket.join(roomId);

  socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { player: { id: player.id, name: player.name }, players: game.getPlayerList() });
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
  nsp.to(roomId).emit('playerList', game.getPlayerList());

  tracker.playerJoined('confessions');
  nsp.emit('roomList', getRoomList());
}

function buildPayload(game, socketId, roomId, isReconnect) {
  return {
    roomId,
    playerId: socketId,
    players: game.getPlayerList(),
    owner: game.owner,
    state: game.state,
    heatLevel: game.heatLevel,
    isReconnect,
    confessionIndex: game.currentIndex,
    confessionTotal: game.confessions.length,
  };
}

function broadcastState(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
}

function endSubmitting(nsp, roomId, game) {
  // Auto-submit empty for anyone who didn't submit
  game.players.forEach((player) => {
    if (!game.submissions.has(player.id)) {
      game.submitConfession(player.id, '(No confession submitted)');
    }
  });

  game.buildConfessions();

  if (game.confessions.length === 0) {
    game.state = 'gameOver';
    nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    return;
  }

  startNextConfession(nsp, roomId, game);
}

function startNextConfession(nsp, roomId, game) {
  const data = game.nextConfession();
  if (!data) {
    nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    return;
  }

  // Send confession + player list for guessing
  const playerChoices = game.getPlayerList().map(p => ({ id: p.id, name: p.name }));
  nsp.to(roomId).emit('guessPhase', {
    ...data,
    players: playerChoices,
    duration: game.guessDuration,
  });
  nsp.to(roomId).emit('phaseChange', { phase: 'guessing', duration: game.guessDuration });

  // Guess timer
  game.guessTimer = setTimeout(() => {
    game.guessTimer = null;
    endGuessing(nsp, roomId, game);
  }, game.guessDuration * 1000);
}

function endGuessing(nsp, roomId, game) {
  const reveal = game.calculateReveal();
  if (!reveal) return;

  nsp.to(roomId).emit('revealPhase', reveal);
  nsp.to(roomId).emit('phaseChange', { phase: 'reveal' });
  nsp.to(roomId).emit('playerList', game.getPlayerList());

  // After pause, next confession or game over
  game.revealTimer = setTimeout(() => {
    game.revealTimer = null;
    if (game.currentIndex >= game.confessions.length - 1) {
      game.state = 'gameOver';
      nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    } else {
      startNextConfession(nsp, roomId, game);
    }
  }, REVEAL_PAUSE);
}

module.exports = { register };
