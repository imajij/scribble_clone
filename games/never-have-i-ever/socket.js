// ========================================
// NEVER HAVE I EVER — Socket.IO Handler
// ========================================
// Pattern: register(io) → /never-have-i-ever namespace
// Auto-discovered by server.js

const NeverHaveIEverGame = require('./neverHaveIEver');
const { MIN_PLAYERS, MAX_PLAYERS, PICK_DURATION } = NeverHaveIEverGame;
const tracker = require('../../playerTracker');
const { saveScore, loadScore } = require('../../redisCache');

const GAME_ID = 'never-have-i-ever';

const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE = 30000;
const REVEAL_PAUSE = 6000;            // 6s to view the reveal before next round

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new NeverHaveIEverGame(id));
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
          // RE-SEND full current-phase data so the player can act immediately.
          socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, true));
          socket.to(roomId).emit('playerReconnected', { playerName: held.name });
          broadcastState(nsp, roomId, game);
          // A held seat coming back is a real re-join for the tracker.
          tracker.playerJoined(GAME_ID);
          return;
        }
      }
      if (game.players.size < MAX_PLAYERS) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, rounds, heat, sessionId }) => {
      const roomId = genRoomId();
      const game = getOrCreateRoom(roomId);
      if (rounds) game.maxRounds = Math.min(Math.max(rounds, 1), 20);
      if (heat) game.heatLevel = Math.min(Math.max(heat, 1), 3);
      game.pickDuration = PICK_DURATION;
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= MAX_PLAYERS) { socket.emit('error', { message: 'Room is full!' }); return; }
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

    // ── Cast pick ──
    socket.on('pick', ({ choice }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const ok = game.castPick(socket.id, choice);
      if (ok) {
        nsp.to(roomId).emit('pickProgress', game.getPickProgress());

        // If everyone has picked, end the picking phase early.
        if (game.allPicked()) {
          if (game.pickTimer) { clearTimeout(game.pickTimer); game.pickTimer = null; }
          endPicking(nsp, roomId, game);
        }
      }
    });

    // ── Chat (optional) ──
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

    // ── Play Again (owner only) ──
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
        // Hold the seat for reconnect. holdPlayerForReconnect() transfers
        // ownership to a live player when the host departs, so the game stays
        // controllable even if they never come back.
        if (player.sessionId && player.score > 0) saveScore(GAME_ID, player.sessionId, player.score);
        const wasOwner = game.owner === socket.id;
        game.holdPlayerForReconnect(socket.id);
        playerRooms.delete(socket.id);

        if (wasOwner) {
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        }

        disconnectTimers.set(player.sessionId, setTimeout(() => {
          disconnectTimers.delete(player.sessionId);
          const liveGame = rooms.get(roomId);
          if (!liveGame || liveGame !== game) return;
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
          tracker.playerLeft(GAME_ID);
          nsp.emit('roomList', getRoomList());
        }, RECONNECT_GRACE));

        nsp.to(roomId).emit('playerDisconnected', { playerName: player.name });
        // Do NOT decrement the tracker here — the seat is held.
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

  // Restore cached score from Redis (best-effort).
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

// The reconnect/joinedRoom snapshot carries the CURRENT phase's full data so a
// reconnecting player can act immediately (prompt while picking, or the full
// reveal while results are up).
function buildPayload(game, socketId, roomId, isReconnect) {
  const payload = {
    roomId,
    playerId: socketId,
    players: game.getPlayerList(),
    owner: game.owner,
    state: game.state,
    roundNum: game.roundNum,
    maxRounds: game.maxRounds,
    heatLevel: game.heatLevel,
    pickDuration: game.pickDuration,
    isReconnect,
    myPick: game.picks.get(socketId) || null,
    prompt: null,
    reveal: null,
    finalResults: null,
  };

  if (game.state === 'picking' && game.currentPrompt) {
    payload.prompt = { text: game.currentPrompt.text, heat: game.currentPrompt.heat };
    payload.pickProgress = game.getPickProgress();
  } else if (game.state === 'reveal' && game.currentPrompt) {
    payload.reveal = game.calculateResults
      ? buildRevealSnapshot(game)
      : null;
  } else if (game.state === 'gameOver') {
    payload.finalResults = game.getFinalResults();
  }
  return payload;
}

// Build a reveal snapshot WITHOUT mutating state/score (calculateResults() has
// side effects, so we recompute the display data from the already-scored round).
function buildRevealSnapshot(game) {
  const haveNames = [];
  const neverNames = [];
  game.players.forEach((player) => {
    const pick = game.picks.get(player.id);
    if (pick === 'have') haveNames.push(player.name);
    else if (pick === 'never') neverNames.push(player.name);
  });
  const countHave = haveNames.length;
  const countNever = neverNames.length;
  const total = countHave + countNever;
  const isTie = countHave === countNever;
  let minoritySide = null;
  if (!isTie && total > 0) minoritySide = countHave < countNever ? 'have' : 'never';

  const playerResults = game.getPlayerList().map((p) => ({
    id: p.id,
    name: p.name,
    pick: game.picks.get(p.id) || null,
    points: null, // points already applied; reconnect view just shows totals
    guilt: p.guilt,
    totalScore: p.score,
  }));

  return {
    prompt: { text: game.currentPrompt.text, heat: game.currentPrompt.heat },
    countHave,
    countNever,
    percentHave: total > 0 ? Math.round((countHave / total) * 100) : 0,
    percentNever: total > 0 ? Math.round((countNever / total) * 100) : 0,
    haveNames,
    neverNames,
    minoritySide,
    isTie,
    playerResults,
    roundNum: game.roundNum,
    maxRounds: game.maxRounds,
  };
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

  nsp.to(roomId).emit('newRound', roundData);

  // Pick timer — stored on the game so cleanup() clears it; the callback
  // re-checks the room still exists and is still in the picking phase.
  game.pickTimer = setTimeout(() => {
    game.pickTimer = null;
    const liveGame = rooms.get(roomId);
    if (!liveGame || liveGame !== game || game.state !== 'picking') return;
    endPicking(nsp, roomId, game);
  }, game.pickDuration * 1000);
}

function endPicking(nsp, roomId, game) {
  const results = game.calculateResults();
  nsp.to(roomId).emit('roundReveal', results);
  nsp.to(roomId).emit('playerList', game.getPlayerList());

  // After the reveal pause, advance — stored on the game so cleanup() clears it.
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
  }, REVEAL_PAUSE);
}

module.exports = { register };
