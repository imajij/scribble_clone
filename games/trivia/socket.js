// ========================================
// TRIVIA SHOWDOWN — Socket.IO Handler
// ========================================
// Pattern: register(io) → /trivia namespace
// Auto-discovered by server.js
//
// Server is authoritative: the correct answer index is only ever sent in the
// 'reveal' payload, never in the question payload or the reconnect snapshot
// while a question is live.

const TriviaGame = require('./triviaGame');
const tracker = require('../../playerTracker');
const { saveScore, loadScore } = require('../../redisCache');
const { CONFIG } = require('./questions');

const GAME_ID = 'trivia';

const rooms = new Map();              // roomId → TriviaGame
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE = 30000;        // 30s grace before releasing a held seat
const RESULT_PAUSE = CONFIG.RESULT_PAUSE * 1000;

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new TriviaGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: CONFIG.MAX_PLAYERS });
  });
  return list;
}

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusables (no I/O/0/1)
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ============================================================

function register(io) {
  const nsp = io.of('/trivia');

  nsp.on('connection', (socket) => {
    console.log(`[trivia] Connected: ${socket.id}`);
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
          // A successful reconnect re-enters the tracker (the seat had been
          // held — the grace timer was cancelled above, so no double-count).
          tracker.playerJoined(GAME_ID);
          nsp.emit('roomList', getRoomList());
          return;
        }
      }
      if (game.players.size < CONFIG.MAX_PLAYERS && game.state === 'waiting') {
        joinRoom(nsp, socket, roomId, playerName, sessionId);
        return;
      }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, rounds, category, sessionId }) => {
      const roomId = genRoomId();
      const game = getOrCreateRoom(roomId);
      if (CONFIG.ROUND_OPTIONS.includes(Number(rounds))) game.maxRounds = Number(rounds);
      if (category) game.category = String(category);
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= CONFIG.MAX_PLAYERS) { socket.emit('error', { message: 'Room is full!' }); return; }
      if (game.state !== 'waiting') { socket.emit('error', { message: 'Game already in progress!' }); return; }
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

    // ── Lock answer ──
    socket.on('answer', ({ index }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const ok = game.lockAnswer(socket.id, index);
      if (ok) {
        // Tell the locking player their lock registered (so client can disable).
        socket.emit('answerLocked', { index });
        nsp.to(roomId).emit('answerProgress', game.getAnswerProgress());

        if (game.allAnswered()) {
          if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
          endQuestion(nsp, roomId, game);
        }
      }
    });

    // ── Play Again ──
    socket.on('playAgain', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.isOwner(socket.id)) return;

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
        // Hold the seat for reconnect (score/streak/in-flight answer preserved).
        if (player.sessionId && player.score > 0) saveScore(GAME_ID, player.sessionId, player.score);
        const wasOwner = game.owner === socket.id;
        game.holdPlayerForReconnect(socket.id);
        playerRooms.delete(socket.id);

        if (wasOwner) nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });

        disconnectTimers.set(player.sessionId, setTimeout(() => {
          disconnectTimers.delete(player.sessionId);
          const liveGame = rooms.get(roomId);
          if (!liveGame || liveGame !== game) return;
          if (!liveGame.disconnectedPlayers.has(player.sessionId)) return; // reconnected

          liveGame.disconnectedPlayers.delete(player.sessionId);
          if (liveGame.players.size === 0 && liveGame.disconnectedPlayers.size === 0) {
            liveGame.cleanup();
            rooms.delete(roomId);
          } else {
            nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: liveGame.getPlayerList() });
            nsp.to(roomId).emit('ownerUpdate', { owner: liveGame.owner });
            maybeEndQuestionEarly(nsp, roomId, liveGame);
          }
          // One decrement for this real departure (grace expired, no reconnect).
          tracker.playerLeft(GAME_ID);
          nsp.emit('roomList', getRoomList());
        }, RECONNECT_GRACE));

        nsp.to(roomId).emit('playerDisconnected', { playerName: player.name });
        // A held player still occupies a seat — if everyone else already
        // answered, the question can resolve now.
        maybeEndQuestionEarly(nsp, roomId, game);
        // NOTE: tracker is NOT decremented here — the seat is held.
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
        tracker.playerLeft(GAME_ID);
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

  // Restore cached score from Redis (if any) for a fresh seat.
  if (sessionId) {
    const cached = await loadScore(GAME_ID, sessionId);
    if (cached !== null && player && player.score === 0) player.score = cached;
  }

  sessionToSocket.set(sessionId, socket.id);
  playerRooms.set(socket.id, roomId);
  socket.join(roomId);

  socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { player: { id: player.id, name: player.name }, players: game.getPlayerList() });
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
  nsp.to(roomId).emit('playerList', game.getPlayerList());

  tracker.playerJoined(GAME_ID);
  nsp.emit('roomList', getRoomList());
}

/**
 * Build the joinedRoom / reconnect snapshot. Carries the CURRENT phase's full
 * data so a (re)connecting player can act immediately — but during a live
 * question it never includes the correct answer index.
 */
function buildPayload(game, socketId, roomId, isReconnect) {
  const base = {
    roomId,
    playerId: socketId,
    players: game.getPlayerList(),
    owner: game.owner,
    state: game.state,
    roundNum: game.roundNum,
    maxRounds: game.maxRounds,
    category: game.category,
    isReconnect,
  };

  if (game.state === 'question' && game.currentQuestion) {
    const q = game.currentQuestion;
    const myAnswer = game.answers.get(socketId);
    base.question = {
      roundNum: game.roundNum,
      maxRounds: game.maxRounds,
      category: q.category,
      heat: q.heat || 1,
      question: q.q,
      options: q.options.slice(),
      duration: game.questionDuration,
      total: game.players.size,
    };
    base.timeLeftMs = game.timeLeftMs();
    base.myAnswer = myAnswer ? myAnswer.index : null; // which option I locked (NOT the correct one)
    base.progress = game.getAnswerProgress();
  } else if (game.state === 'reveal' && game.currentQuestion) {
    // Re-send the full reveal (already public) so a reconnecting player sees it.
    const q = game.currentQuestion;
    base.reveal = {
      roundNum: game.roundNum,
      maxRounds: game.maxRounds,
      question: q.q,
      options: q.options.slice(),
      correctIndex: q.answer,
      leaderboard: game.getPlayerList(),
      myAnswer: (game.answers.get(socketId) || {}).index ?? null,
    };
  } else if (game.state === 'gameOver') {
    base.finalResults = game.getFinalResults();
  }
  return base;
}

function broadcastState(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
}

function startNextRound(nsp, roomId, game) {
  const roundData = game.nextRound();
  if (!roundData) {
    game.state = 'gameOver';
    nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    return;
  }

  nsp.to(roomId).emit('newQuestion', roundData);

  // Question timer — stored on the game so clearTimers() can clear it; the
  // callback re-checks the room still exists and is still in 'question'.
  game.questionTimer = setTimeout(() => {
    game.questionTimer = null;
    const liveGame = rooms.get(roomId);
    if (!liveGame || liveGame !== game || game.state !== 'question') return;
    endQuestion(nsp, roomId, game);
  }, game.questionDuration * 1000);
}

/** If everyone still present has already answered, resolve the question now. */
function maybeEndQuestionEarly(nsp, roomId, game) {
  if (game.state !== 'question') return;
  if (game.players.size === 0) return;
  if (game.allAnswered()) {
    if (game.questionTimer) { clearTimeout(game.questionTimer); game.questionTimer = null; }
    endQuestion(nsp, roomId, game);
  }
}

function endQuestion(nsp, roomId, game) {
  if (game.state !== 'question') return;
  const results = game.reveal();
  nsp.to(roomId).emit('reveal', results);

  // After the pause, move on. Stored on the game so clearTimers() clears it;
  // the callback re-checks the room still exists and is showing the reveal.
  game.revealTimer = setTimeout(() => {
    game.revealTimer = null;
    const liveGame = rooms.get(roomId);
    if (!liveGame || liveGame !== game || game.state !== 'reveal') return;
    if (game.roundNum >= game.maxRounds) {
      game.state = 'gameOver';
      nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    } else {
      startNextRound(nsp, roomId, game);
    }
  }, RESULT_PAUSE);
}

module.exports = { register };
