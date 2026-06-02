// ========================================
// TWO TRUTHS & A LIE — Socket.IO Handler
// ========================================
// Pattern: register(io) → /two-truths namespace
// Auto-discovered by server.js

const TwoTruthsGame = require('./twoTruthsGame');
const CONFIG = require('./config');
const tracker = require('../../playerTracker');

const GAME_ID = 'two-truths';

const rooms = new Map();          // roomId → TwoTruthsGame
const playerRooms = new Map();    // socketId → roomId
const sessionToSocket = new Map();
const disconnectTimers = new Map(); // sessionId → timeout
const RECONNECT_GRACE = 30000;
const REVEAL_PAUSE_MS = CONFIG.REVEAL_PAUSE * 1000;

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new TwoTruthsGame(id));
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusables
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function register(io) {
  const nsp = io.of('/' + GAME_ID);

  nsp.on('connection', (socket) => {
    console.log(`[${GAME_ID}] Connected: ${socket.id}`);
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
          // Re-count this player as joined (they were released from tracker on hold? no —
          // we keep tracker count steady during a hold, so do NOT increment here).
          return;
        }
      }
      // Seat already released or never held → try a fresh join if room has space
      if (game.players.size < CONFIG.MAX_PLAYERS && game.state === 'waiting') {
        joinRoom(nsp, socket, roomId, playerName, sessionId);
        return;
      }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, sessionId }) => {
      const roomId = genRoomId();
      getOrCreateRoom(roomId);
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

    // ── Start game (owner + canStart only) ──
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      if (!game.isOwner(socket.id)) { socket.emit('error', { message: 'Only host can start!' }); return; }
      if (!game.canStart()) { socket.emit('error', { message: `Need ${CONFIG.MIN_PLAYERS}+ players!` }); return; }

      game.clearTimers();
      game.startGame();

      nsp.to(roomId).emit('submitPhase', {
        duration: game.submitDuration,
        maxLen: CONFIG.MAX_STATEMENT_LEN,
      });
      nsp.to(roomId).emit('phaseChange', { phase: 'submitting', duration: game.submitDuration });
      nsp.to(roomId).emit('submitProgress', game.getSubmitProgress());

      game.submitTimer = setTimeout(() => {
        game.submitTimer = null;
        if (!rooms.has(roomId) || game.state !== 'submitting') return;
        endSubmitting(nsp, roomId, game);
      }, game.submitDuration * 1000);
    });

    // ── Submit statements ──
    socket.on('submitStatements', ({ statements, lieIndex }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const ok = game.submitStatements(socket.id, statements, lieIndex);
      if (ok) {
        socket.emit('submissionReceived');
        nsp.to(roomId).emit('submitProgress', game.getSubmitProgress());
        if (game.allSubmitted()) {
          if (game.submitTimer) { clearTimeout(game.submitTimer); game.submitTimer = null; }
          endSubmitting(nsp, roomId, game);
        }
      } else {
        socket.emit('submissionRejected', { message: 'Need 3 statements and one marked as the lie.' });
      }
    });

    // ── Submit guess ──
    socket.on('submitGuess', ({ cardIndex }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const ok = game.submitGuess(socket.id, cardIndex);
      if (ok) {
        socket.emit('guessReceived', { cardIndex: Number(cardIndex) });
        nsp.to(roomId).emit('guessProgress', game.getGuessProgress());
        if (game.allGuessed()) {
          if (game.guessTimer) { clearTimeout(game.guessTimer); game.guessTimer = null; }
          endGuessing(nsp, roomId, game);
        }
      }
    });

    // ── Play Again (owner only) ──
    socket.on('playAgain', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.isOwner(socket.id)) return;

      game.clearTimers();
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

      const wasOwner = game.isOwner(socket.id);

      if (game.state !== 'waiting') {
        // Mid-game: hold the seat for reconnect (keep score/submission/guess).
        game.holdPlayerForReconnect(socket.id);
        playerRooms.delete(socket.id);

        // Transfer ownership to a live player if the owner is being held.
        if (wasOwner) transferOwnership(game, player.sessionId);

        disconnectTimers.set(player.sessionId, setTimeout(() => {
          disconnectTimers.delete(player.sessionId);
          game.disconnectedPlayers.delete(player.sessionId);
          tracker.playerLeft(GAME_ID); // REAL departure now
          if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
            game.clearTimers();
            rooms.delete(roomId);
          } else {
            nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: game.getPlayerList() });
            nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
            // If the held player was eligible to guess and now the whole room
            // has guessed, advance the phase so we don't stall.
            maybeAdvanceAfterLeave(nsp, roomId, game);
          }
          nsp.emit('roomList', getRoomList());
        }, RECONNECT_GRACE));

        nsp.to(roomId).emit('playerDisconnected', { playerName: player.name });
        nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        nsp.to(roomId).emit('playerList', game.getPlayerList());
        // A held player may have been the last eligible guesser.
        maybeAdvanceAfterLeave(nsp, roomId, game);
        nsp.emit('roomList', getRoomList());
      } else {
        // In lobby: real departure.
        game.removePlayer(socket.id);
        playerRooms.delete(socket.id);
        tracker.playerLeft(GAME_ID);

        if (game.players.size === 0) {
          game.clearTimers();
          rooms.delete(roomId);
        } else {
          nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: game.getPlayerList() });
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        }
        nsp.emit('roomList', getRoomList());
      }
    });
  });
}

// ============================================================
// Helpers
// ============================================================

function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const name = (playerName || 'Anon').substring(0, 20).trim() || 'Anon';
  const game = getOrCreateRoom(roomId);
  const player = game.addPlayer(socket.id, name, sessionId);

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

// Transfer ownership away from a held/departing owner to the next live player.
function transferOwnership(game, leavingSessionId) {
  if (game.ownerSessionId !== leavingSessionId) return;
  const next = game.players.keys().next().value;
  if (next) {
    game.owner = next;
    game.ownerSessionId = game.players.get(next).sessionId;
  } else {
    game.owner = null;
    game.ownerSessionId = null;
  }
}

function buildPayload(game, socketId, roomId, isReconnect) {
  const payload = {
    roomId,
    playerId: socketId,
    players: game.getPlayerList(),
    owner: game.owner,
    isOwner: game.owner === socketId,
    state: game.state,
    isReconnect,
    config: {
      minPlayers: CONFIG.MIN_PLAYERS,
      maxPlayers: CONFIG.MAX_PLAYERS,
      maxLen: CONFIG.MAX_STATEMENT_LEN,
    },
  };

  // Carry the CURRENT phase's full data so a reconnecting player can act now.
  if (game.state === 'submitting') {
    payload.phase = {
      name: 'submitting',
      duration: game.submitDuration,
      maxLen: CONFIG.MAX_STATEMENT_LEN,
      progress: game.getSubmitProgress(),
      alreadySubmitted: game.submissions.has(socketId),
    };
  } else if (game.state === 'guessing') {
    const trio = game.getCurrentTrioPublic();
    payload.phase = {
      name: 'guessing',
      duration: game.guessDuration,
      trio,
      progress: game.getGuessProgress(),
      myGuess: game.guesses.has(socketId) ? game.guesses.get(socketId) : null,
      isAuthor: trio ? trio.authorId === socketId : false,
    };
  } else if (game.state === 'reveal') {
    // Recompute is destructive (it scores). Re-send a non-scoring snapshot.
    const t = game.trios[game.currentIndex];
    if (t) {
      payload.phase = {
        name: 'reveal',
        index: game.currentIndex,
        total: game.trios.length,
        authorName: t.authorName,
        cards: t.cards.map(c => ({ text: c.text, isLie: c.isLie })),
        lieCardIndex: t.lieCardIndex,
      };
    }
  } else if (game.state === 'gameOver') {
    payload.phase = { name: 'gameOver', results: game.getFinalResults() };
  }

  return payload;
}

function broadcastState(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
}

function endSubmitting(nsp, roomId, game) {
  // Auto-skip players who didn't submit (they simply have no trio).
  game.buildTrios();

  if (game.trios.length === 0) {
    game.state = 'gameOver';
    nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    return;
  }
  startNextTrio(nsp, roomId, game);
}

function startNextTrio(nsp, roomId, game) {
  const trio = game.nextTrio();
  if (!trio) {
    game.state = 'gameOver';
    nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    return;
  }

  nsp.to(roomId).emit('guessPhase', {
    ...trio,
    duration: game.guessDuration,
    progress: game.getGuessProgress(),
  });
  nsp.to(roomId).emit('phaseChange', { phase: 'guessing', duration: game.guessDuration });

  game.guessTimer = setTimeout(() => {
    game.guessTimer = null;
    if (!rooms.has(roomId) || game.state !== 'guessing') return;
    endGuessing(nsp, roomId, game);
  }, game.guessDuration * 1000);
}

function endGuessing(nsp, roomId, game) {
  if (game.state !== 'guessing') return;
  const reveal = game.calculateReveal();
  if (!reveal) return;

  nsp.to(roomId).emit('revealPhase', reveal);
  nsp.to(roomId).emit('phaseChange', { phase: 'reveal', duration: CONFIG.REVEAL_PAUSE });
  nsp.to(roomId).emit('playerList', game.getPlayerList());

  game.revealTimer = setTimeout(() => {
    game.revealTimer = null;
    if (!rooms.has(roomId) || game.state !== 'reveal') return;
    if (game.isLastTrio()) {
      game.state = 'gameOver';
      nsp.to(roomId).emit('gameOver', { results: game.getFinalResults() });
    } else {
      startNextTrio(nsp, roomId, game);
    }
  }, REVEAL_PAUSE_MS);
}

// If a player leaves mid-guessing, the remaining eligible guessers may now all
// have guessed — advance instead of stalling on the timer.
function maybeAdvanceAfterLeave(nsp, roomId, game) {
  if (!rooms.has(roomId)) return;
  if (game.state === 'guessing' && game.allGuessed()) {
    if (game.guessTimer) { clearTimeout(game.guessTimer); game.guessTimer = null; }
    endGuessing(nsp, roomId, game);
  }
}

module.exports = { register };
