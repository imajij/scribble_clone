// ========================================
// SCENARIO — Socket.IO Handler
// ========================================
// Pattern: register(io) → /scenario namespace
// Auto-discovered by server.js

const ScenarioGame = require('./scenarioGame');
const { CATEGORIES } = require('./scenarios');
const tracker = require('../../playerTracker');
const { saveScore, loadScore } = require('../../redisCache');

const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE = 30000;

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new ScenarioGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: 12 });
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
  const nsp = io.of('/scenario');

  nsp.on('connection', (socket) => {
    console.log(`[scenario] Connected: ${socket.id}`);
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
      if (game.players.size < 12) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
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
      if (game.players.size >= 12) { socket.emit('error', { message: 'Room is full!' }); return; }
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
      if (result) {
        nsp.to(roomId).emit('newRound', {
          roundNum: result.roundNum,
          maxRounds: result.maxRounds,
          scenario: result.scenario
        });
        broadcastState(nsp, roomId, game);
        nsp.emit('roomList', getRoomList());

        // Auto-advance from reading → answering after delay
        game.phaseTimer = setTimeout(() => {
          advanceToAnswering(nsp, roomId, game);
        }, game.readingDuration);
      }
    });

    // ── Submit answer ──
    socket.on('submitAnswer', ({ answer }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const result = game.submitAnswer(socket.id, answer);
      if (!result) return;

      // Notify the room about submission count (not the content)
      nsp.to(roomId).emit('answerUpdate', {
        totalAnswered: result.totalAnswered,
        totalPlayers: result.totalPlayers
      });
      socket.emit('answerAccepted');

      broadcastState(nsp, roomId, game);

      // If everyone answered, advance immediately
      if (game.allAnswered()) {
        game.clearTimers();
        advanceToVoting(nsp, roomId, game);
      }
    });

    // ── Submit vote ──
    socket.on('submitVote', ({ answerId }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const result = game.submitVote(socket.id, answerId);
      if (!result) return;

      nsp.to(roomId).emit('voteUpdate', {
        totalVoted: result.totalVoted,
        totalEligible: result.totalEligible
      });
      socket.emit('voteAccepted');

      broadcastState(nsp, roomId, game);

      // If everyone voted, advance immediately
      if (game.allVoted()) {
        game.clearTimers();
        advanceToResults(nsp, roomId, game);
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
      const pName = player.name;

      // Save score to Redis before removing player
      if (sid && player.score > 0) saveScore('scenario', sid, player.score);

      if (sid) game.holdPlayerSeat(socket.id);
      game.removePlayer(socket.id);
      playerRooms.delete(socket.id);
      if (sid) sessionToSocket.delete(sid);
      tracker.playerLeft('scenario');

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
        game.roundNum = 0;
        nsp.to(roomId).emit('gameReset', { message: 'Not enough players — waiting…', players: game.getPlayerList() });
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
// Phase advancement helpers
// ============================================================

function advanceToAnswering(nsp, roomId, game) {
  if (game.state !== 'reading') return;
  game.startAnswering();
  nsp.to(roomId).emit('answerPhase', {
    scenario: game.currentScenario,
    duration: game.answeringDuration
  });
  broadcastState(nsp, roomId, game);

  game.phaseTimer = setTimeout(() => {
    advanceToVoting(nsp, roomId, game);
  }, game.answeringDuration);
}

function advanceToVoting(nsp, roomId, game) {
  if (game.state !== 'answering') return;
  const result = game.startVoting();
  if (!result) {
    // No answers — skip to next round
    advanceToNextRound(nsp, roomId, game);
    return;
  }
  nsp.to(roomId).emit('votePhase', {
    answers: result.answers,
    duration: game.votingDuration
  });
  broadcastState(nsp, roomId, game);

  game.phaseTimer = setTimeout(() => {
    advanceToResults(nsp, roomId, game);
  }, game.votingDuration);
}

function advanceToResults(nsp, roomId, game) {
  if (game.state !== 'voting') return;
  const result = game.tallyVotes();
  nsp.to(roomId).emit('roundResults', {
    scenario: result.scenario,
    results: result.results,
    scores: result.scores,
    roundNum: result.roundNum,
    maxRounds: result.maxRounds
  });
  broadcastState(nsp, roomId, game);

  game.phaseTimer = setTimeout(() => {
    advanceToNextRound(nsp, roomId, game);
  }, game.resultsDuration);
}

function advanceToNextRound(nsp, roomId, game) {
  if (game.players.size < 2) {
    game.state = 'waiting';
    game.clearTimers();
    nsp.to(roomId).emit('gameReset', { message: 'Not enough players — waiting…', players: game.getPlayerList() });
    return;
  }

  const result = game.nextRound();
  if (!result) return;

  if (result.event === 'gameOver') {
    nsp.to(roomId).emit('gameOver', { scores: result.scores, history: result.history });
    game.state = 'waiting';
    game.roundNum = 0;
    nsp.emit('roomList', getRoomList());
    return;
  }

  nsp.to(roomId).emit('newRound', {
    roundNum: result.roundNum,
    maxRounds: result.maxRounds,
    scenario: result.scenario
  });
  broadcastState(nsp, roomId, game);

  game.phaseTimer = setTimeout(() => {
    advanceToAnswering(nsp, roomId, game);
  }, game.readingDuration);
}

// ============================================================
// Helpers
// ============================================================

async function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const game = getOrCreateRoom(roomId);
  game.addPlayer(socket.id, playerName, sessionId);
  playerRooms.set(socket.id, roomId);
  tracker.playerJoined('scenario');
  if (sessionId) sessionToSocket.set(sessionId, socket.id);

  // Restore cached score from Redis
  if (sessionId) {
    const cached = await loadScore('scenario', sessionId);
    if (cached !== null) {
      const p = game.players.get(socket.id);
      if (p && p.score === 0) p.score = cached;
    }
  }
  socket.join(roomId);

  socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { playerName });
  broadcastState(nsp, roomId, game);
  nsp.emit('roomList', getRoomList());
}

function buildPayload(game, socketId, roomId, reconnected) {
  const state = game.getCurrentState();
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
    gameState: (game.state !== 'waiting' && game.state !== 'gameOver') ? state : null
  };
}

function broadcastState(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
}

module.exports = { register };
