// ========================================
// THIS OR THAT — Socket.IO Handler
// ========================================
// Pattern: register(io) → /this-or-that namespace
// Auto-discovered by server.js

const ThisOrThatGame = require('./thisOrThat');
const tracker = require('../../playerTracker');
const { saveScore, loadScore } = require('../../redisCache');

const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE = 30000;
const RESULT_PAUSE = 5000;            // 5s to view results before next round

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new ThisOrThatGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: 20 });
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
  const nsp = io.of('/this-or-that');

  nsp.on('connection', (socket) => {
    console.log(`[this-or-that] Connected: ${socket.id}`);
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
      if (game.players.size < 20) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, rounds, heat, sessionId }) => {
      const roomId = genRoomId();
      const game = getOrCreateRoom(roomId);
      if (rounds) game.maxRounds = Math.min(Math.max(rounds, 1), 15);
      if (heat) game.heatLevel = Math.min(Math.max(heat, 1), 3);
      game.voteDuration = 15;
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= 20) { socket.emit('error', { message: 'Room is full!' }); return; }
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Start game ──
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.canStart()) return;
      if (!game.isOwner(socket.id)) { socket.emit('error', { message: 'Only host can start!' }); return; }

      game.startGame();
      startNextRound(nsp, roomId, game);
    });

    // ── Cast vote ──
    socket.on('vote', ({ choice }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const ok = game.castVote(socket.id, choice);
      if (ok) {
        // Broadcast progress
        nsp.to(roomId).emit('voteProgress', game.getVoteProgress());

        // If all voted, end voting early
        if (game.allVoted()) {
          clearTimeout(game.voteTimer);
          game.voteTimer = null;
          endVoting(nsp, roomId, game);
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
        // Hold for reconnect. holdPlayerForReconnect() transfers ownership
        // to a live player when the departing player was the host, so the
        // game stays controllable even if the owner never comes back.
        if (player.sessionId && player.score > 0) saveScore('this-or-that', player.sessionId, player.score);
        const wasOwner = game.owner === socket.id;
        game.holdPlayerForReconnect(socket.id);
        playerRooms.delete(socket.id);

        if (wasOwner) {
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        }

        disconnectTimers.set(player.sessionId, setTimeout(() => {
          disconnectTimers.delete(player.sessionId);
          // Guard: room may already be gone (everyone left / reset).
          const liveGame = rooms.get(roomId);
          if (!liveGame || liveGame !== game) return;
          // Only act if the seat is still being held (not reconnected).
          if (!liveGame.disconnectedPlayers.has(player.sessionId)) return;

          liveGame.disconnectedPlayers.delete(player.sessionId);
          if (liveGame.players.size === 0 && liveGame.disconnectedPlayers.size === 0) {
            liveGame.cleanup();
            rooms.delete(roomId);
          } else {
            nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: liveGame.getPlayerList() });
            nsp.to(roomId).emit('ownerUpdate', { owner: liveGame.owner });
          }
          // One decrement for this real departure (grace expired without reconnect).
          tracker.playerLeft('this-or-that');
          nsp.emit('roomList', getRoomList());
        }, RECONNECT_GRACE));

        nsp.to(roomId).emit('playerDisconnected', { playerName: player.name });
        // NOTE: do NOT decrement the tracker here — the seat is held. The
        // decrement happens either when the grace timer expires (above) or
        // is skipped entirely if the player reconnects.
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

        // Waiting-state departure is immediate and final → one decrement.
        tracker.playerLeft('this-or-that');
        nsp.emit('roomList', getRoomList());
      }
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
    const cached = await loadScore('this-or-that', sessionId);
    if (cached !== null && player && player.score === 0) player.score = cached;
  }

  sessionToSocket.set(sessionId, socket.id);
  playerRooms.set(socket.id, roomId);
  socket.join(roomId);

  socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { player: { id: player.id, name: player.name }, players: game.getPlayerList() });
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
  nsp.to(roomId).emit('playerList', game.getPlayerList());

  tracker.playerJoined('this-or-that');
  nsp.emit('roomList', getRoomList());
}

function buildPayload(game, socketId, roomId, isReconnect) {
  return {
    roomId,
    playerId: socketId,
    players: game.getPlayerList(),
    owner: game.owner,
    state: game.state,
    roundNum: game.roundNum,
    maxRounds: game.maxRounds,
    heatLevel: game.heatLevel,
    isReconnect,
    currentQuestion: game.state === 'voting' ? {
      text: game.currentQuestion.text,
      optionA: game.currentQuestion.optionA,
      optionB: game.currentQuestion.optionB,
      category: game.currentQuestion.category,
      heat: game.currentQuestion.heat,
    } : null,
  };
}

function broadcastState(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
}

function startNextRound(nsp, roomId, game) {
  const roundData = game.nextRound();
  if (!roundData) {
    // Game over
    game.state = 'gameOver';
    nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    return;
  }

  nsp.to(roomId).emit('newRound', roundData);

  // Vote timer — stored on the game so cleanup() can clear it; the callback
  // re-checks the room still exists and is still in the voting phase before firing.
  game.voteTimer = setTimeout(() => {
    game.voteTimer = null;
    const liveGame = rooms.get(roomId);
    if (!liveGame || liveGame !== game || game.state !== 'voting') return;
    endVoting(nsp, roomId, game);
  }, game.voteDuration * 1000);
}

function endVoting(nsp, roomId, game) {
  const results = game.calculateResults();
  nsp.to(roomId).emit('roundResults', results);

  // After pause, start next round — stored on the game so cleanup() clears it;
  // the callback re-checks the room still exists and is showing results.
  game.resultTimer = setTimeout(() => {
    game.resultTimer = null;
    const liveGame = rooms.get(roomId);
    if (!liveGame || liveGame !== game || game.state !== 'results') return;
    if (game.roundNum >= game.maxRounds) {
      game.state = 'gameOver';
      nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    } else {
      startNextRound(nsp, roomId, game);
    }
  }, RESULT_PAUSE);
}

module.exports = { register };
