// ========================================
// MAFIA — Socket.IO Handler
// ========================================
// Pattern: register(io) → /mafia namespace. Auto-discovered by server.js.
//
// Flow:
//   waiting → startGame → night → day → night ... → gameOver → playAgain
//
// Private data: each player gets their role via a socket-only 'yourRole'
// event, and an actionable per-phase 'privateView' on every phase change AND
// on reconnect (so a reconnecting player can act immediately).

const MafiaGame = require('./mafiaGame');
const CONFIG = require('./config');
const tracker = require('../../playerTracker');

const GAME_ID = 'mafia';
const NS = '/mafia';

const rooms = new Map();          // roomId → MafiaGame
const playerRooms = new Map();    // socketId → roomId
const sessionToSocket = new Map();// sessionId → socketId
const disconnectTimers = new Map();// sessionId → timeout

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new MafiaGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0 && g.state === 'waiting') {
      list.push({ id, players: g.players.size, state: g.state, maxPlayers: CONFIG.MAX_PLAYERS });
    }
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
  const nsp = io.of(NS);

  nsp.on('connection', (socket) => {
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
          held.connected = true;
          socket.emit('joinedRoom', buildJoinPayload(game, socket.id, roomId, true));
          // Re-send private role + actionable view so they can act immediately.
          sendPrivate(socket, game);
          socket.to(roomId).emit('playerReconnected', { playerName: held.name });
          broadcastLobby(nsp, roomId, game);
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
          tracker.playerJoined(GAME_ID);
          return;
        }
      }
      // No held seat — only allow fresh join if still in lobby and not full.
      if (game.state === 'waiting' && game.players.size < CONFIG.MAX_PLAYERS) {
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
      if (game.state !== 'waiting') { socket.emit('error', { message: 'Game already in progress!' }); return; }
      if (game.players.size >= CONFIG.MAX_PLAYERS) { socket.emit('error', { message: 'Room is full!' }); return; }
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Start game ──
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      if (!game.isOwner(socket.id)) { socket.emit('error', { message: 'Only the host can start!' }); return; }
      if (!game.canStart()) { socket.emit('error', { message: `Need ${CONFIG.MIN_PLAYERS}+ players!` }); return; }

      game.startGame();
      // Send each player their role privately.
      game.players.forEach((p) => {
        nsp.to(p.id).emit('yourRole', {
          role: p.role,
          mafiaPartners: game.isMafia(p) ? game.mafiaRoster() : null,
        });
      });
      nsp.to(roomId).emit('gameStarted', {
        players: game.getPlayerList(),
        roleCounts: roleCounts(game),
      });
      beginNight(nsp, roomId, game);
    });

    // ── Night: mafia target ──
    socket.on('mafiaTarget', ({ targetId }) => {
      const { game, roomId } = ctx(socket);
      if (!game) return;
      if (game.setMafiaTarget(socket.id, targetId)) {
        // Let all mafia see the current pick.
        const target = game.players.get(targetId);
        game.aliveByRole(CONFIG.ROLES.MAFIA).forEach((m) => {
          nsp.to(m.id).emit('mafiaPick', { targetId, targetName: target ? target.name : '?', by: game.players.get(socket.id).name });
        });
        maybeEndNight(nsp, roomId, game);
      }
    });

    // ── Night: detective check ──
    socket.on('detectiveCheck', ({ targetId }) => {
      const { game, roomId } = ctx(socket);
      if (!game) return;
      const res = game.setDetectiveCheck(socket.id, targetId);
      if (res) {
        socket.emit('investigationResult', res);
        maybeEndNight(nsp, roomId, game);
      }
    });

    // ── Night: doctor save ──
    socket.on('doctorSave', ({ targetId }) => {
      const { game, roomId } = ctx(socket);
      if (!game) return;
      if (game.setDoctorSave(socket.id, targetId)) {
        const t = game.players.get(targetId);
        socket.emit('saveConfirmed', { targetId, targetName: t ? t.name : '?' });
        maybeEndNight(nsp, roomId, game);
      }
    });

    // ── Day: vote ──
    socket.on('dayVote', ({ targetId }) => {
      const { game, roomId } = ctx(socket);
      if (!game) return;
      if (game.castDayVote(socket.id, targetId)) {
        nsp.to(roomId).emit('voteUpdate', game.getVoteTally());
        if (game.allDayVotesIn()) {
          if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
          resolveDayPhase(nsp, roomId, game);
        }
      }
    });

    // ── Chat (alive talk during day; dead = ghost chat among the dead) ──
    socket.on('chatMessage', ({ message }) => {
      const { game, roomId } = ctx(socket);
      if (!game) return;
      const player = game.players.get(socket.id);
      if (!player || !message || typeof message !== 'string') return;
      const text = message.trim().substring(0, 200);
      if (!text) return;

      const isGhost = !player.alive;
      const payload = { name: player.name, message: text, ghost: isGhost };

      if (isGhost) {
        // Ghost chat only reaches the dead (and never leaks to the living).
        game.players.forEach((p) => {
          if (!p.alive) nsp.to(p.id).emit('chatMessage', payload);
        });
      } else {
        // Living chat reaches everyone (the dead spectate the discussion).
        nsp.to(roomId).emit('chatMessage', payload);
      }
    });

    // ── Play Again (owner only) ──
    socket.on('playAgain', () => {
      const { game, roomId } = ctx(socket);
      if (!game || !game.isOwner(socket.id)) return;
      game.reset();
      broadcastLobby(nsp, roomId, game);
      nsp.to(roomId).emit('backToLobby', { players: game.getPlayerList(), owner: game.owner });
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
        // Hold the seat (role + alive state) for the grace period.
        const wasOwner = game.owner === socket.id;
        const sessionId = player.sessionId;
        game.holdPlayerForReconnect(socket.id);
        playerRooms.delete(socket.id);
        if (sessionToSocket.get(sessionId) === socket.id) sessionToSocket.delete(sessionId);

        if (wasOwner) nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        nsp.to(roomId).emit('playerDisconnected', { playerName: player.name });
        broadcastLobby(nsp, roomId, game);

        disconnectTimers.set(sessionId, setTimeout(() => {
          disconnectTimers.delete(sessionId);
          const liveGame = rooms.get(roomId);
          if (!liveGame || liveGame !== game) return;
          if (!liveGame.disconnectedPlayers.has(sessionId)) return; // already reconnected
          liveGame.disconnectedPlayers.delete(sessionId);

          if (liveGame.players.size === 0 && liveGame.disconnectedPlayers.size === 0) {
            liveGame.cleanup();
            rooms.delete(roomId);
          } else {
            nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: liveGame.getPlayerList() });
            nsp.to(roomId).emit('ownerUpdate', { owner: liveGame.owner });
            // A departure mid-game can change the win condition.
            maybeResolveAfterDeparture(nsp, roomId, liveGame);
          }
          tracker.playerLeft(GAME_ID);
          nsp.emit('roomList', getRoomList());
        }, CONFIG.RECONNECT_GRACE));
        // No tracker decrement here — seat is held.
      } else {
        // Waiting-state departure is immediate and final.
        const sessionId = player.sessionId;
        game.removePlayer(socket.id);
        playerRooms.delete(socket.id);
        if (sessionToSocket.get(sessionId) === socket.id) sessionToSocket.delete(sessionId);

        if (game.players.size === 0) {
          game.cleanup();
          rooms.delete(roomId);
        } else {
          nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: game.getPlayerList() });
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        }
        tracker.playerLeft(GAME_ID);
        nsp.emit('roomList', getRoomList());
      }
    });

    // small helper bound to this socket
    function ctx(sock) {
      const roomId = playerRooms.get(sock.id);
      if (!roomId) return {};
      const game = rooms.get(roomId);
      if (!game) return {};
      return { game, roomId };
    }
  });
}

// ============================================================
// Join / lobby helpers
// ============================================================

function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const name = (playerName || 'Anon').substring(0, 20).trim() || 'Anon';
  const game = getOrCreateRoom(roomId);
  const player = game.addPlayer(socket.id, name, sessionId);

  sessionToSocket.set(sessionId, socket.id);
  playerRooms.set(socket.id, roomId);
  socket.join(roomId);

  socket.emit('joinedRoom', buildJoinPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { player: { id: player.id, name: player.name }, players: game.getPlayerList() });
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
  nsp.to(roomId).emit('playerList', game.getPlayerList());

  tracker.playerJoined(GAME_ID);
  nsp.emit('roomList', getRoomList());
}

// Snapshot sent to a joining/reconnecting socket. Carries FULL current-phase
// data so a reconnecting player can render immediately. Private role/action
// data is sent separately via sendPrivate() (socket-only).
function buildJoinPayload(game, socketId, roomId, isReconnect) {
  const payload = {
    roomId,
    playerId: socketId,
    players: game.getPlayerList(),
    owner: game.owner,
    state: game.state,
    dayNum: game.dayNum,
    minPlayers: CONFIG.MIN_PLAYERS,
    maxPlayers: CONFIG.MAX_PLAYERS,
    nightSeconds: CONFIG.NIGHT_SECONDS,
    daySeconds: CONFIG.DAY_SECONDS,
    isReconnect,
  };

  if (game.state === 'night' || game.state === 'day') {
    payload.phase = {
      state: game.state,
      dayNum: game.dayNum,
      roleCounts: roleCounts(game),
      lastResolution: game.lastResolution,
    };
  } else if (game.state === 'gameOver') {
    payload.gameOver = game.getGameOverPayload();
  }
  return payload;
}

// Send a socket its private role + current actionable view.
function sendPrivate(socket, game) {
  const player = game.players.get(socket.id);
  if (!player) return;
  socket.emit('yourRole', {
    role: player.role,
    mafiaPartners: game.isMafia(player) ? game.mafiaRoster() : null,
  });
  const view = game.buildPrivateView(socket.id);
  if (view) socket.emit('privateView', view);
}

function broadcastLobby(nsp, roomId, game) {
  nsp.to(roomId).emit('playerList', game.getPlayerList());
}

function roleCounts(game) {
  const c = { mafia: 0, detective: 0, doctor: 0, villager: 0 };
  game.players.forEach((p) => { if (p.role && c[p.role] !== undefined) c[p.role]++; });
  return c;
}

// Broadcast each living/dead player their fresh per-phase private view.
function pushPrivateViews(nsp, game) {
  game.players.forEach((p) => {
    const view = game.buildPrivateView(p.id);
    if (view) nsp.to(p.id).emit('privateView', view);
  });
}

// ============================================================
// Phase orchestration
// ============================================================

function beginNight(nsp, roomId, game) {
  game.startNight();
  nsp.to(roomId).emit('nightStart', {
    dayNum: game.dayNum,
    duration: CONFIG.NIGHT_SECONDS,
    players: game.getPlayerList(),
    roleCounts: roleCounts(game),
  });
  pushPrivateViews(nsp, game);

  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(() => {
    game.phaseTimer = null;
    const live = rooms.get(roomId);
    if (!live || live !== game || game.state !== 'night') return;
    resolveNightPhase(nsp, roomId, game);
  }, CONFIG.NIGHT_SECONDS * 1000);
}

function maybeEndNight(nsp, roomId, game) {
  if (game.state === 'night' && game.allNightActionsIn()) {
    if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
    resolveNightPhase(nsp, roomId, game);
  }
}

function resolveNightPhase(nsp, roomId, game) {
  if (game.state !== 'night') return;
  const resolution = game.resolveNight();
  nsp.to(roomId).emit('nightResult', {
    resolution,
    players: game.getPlayerList(),
  });

  const winner = game.checkWin();
  if (winner) { finishGame(nsp, roomId, game); return; }

  // Pause to read the dawn announcement, then start the day.
  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(() => {
    game.phaseTimer = null;
    const live = rooms.get(roomId);
    if (!live || live !== game || game.state !== 'night') return;
    beginDay(nsp, roomId, game);
  }, CONFIG.REVEAL_SECONDS * 1000);
}

function beginDay(nsp, roomId, game) {
  game.startDay();
  nsp.to(roomId).emit('dayStart', {
    dayNum: game.dayNum,
    duration: CONFIG.DAY_SECONDS,
    players: game.getPlayerList(),
    tally: game.getVoteTally(),
  });
  pushPrivateViews(nsp, game);

  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(() => {
    game.phaseTimer = null;
    const live = rooms.get(roomId);
    if (!live || live !== game || game.state !== 'day') return;
    resolveDayPhase(nsp, roomId, game);
  }, CONFIG.DAY_SECONDS * 1000);
}

function resolveDayPhase(nsp, roomId, game) {
  if (game.state !== 'day') return;
  const resolution = game.resolveDay();
  nsp.to(roomId).emit('dayResult', {
    resolution,
    players: game.getPlayerList(),
  });

  const winner = game.checkWin();
  if (winner) { finishGame(nsp, roomId, game); return; }

  // Pause to read, then back to night.
  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(() => {
    game.phaseTimer = null;
    const live = rooms.get(roomId);
    if (!live || live !== game || game.state !== 'day') return;
    beginNight(nsp, roomId, game);
  }, CONFIG.REVEAL_SECONDS * 1000);
}

// If a player departs mid-phase (grace expired), the win condition may now be
// met (e.g. the last mafia left). Re-check and end if so.
function maybeResolveAfterDeparture(nsp, roomId, game) {
  if (game.state !== 'night' && game.state !== 'day') return;
  const winner = game.checkWin();
  if (winner) { finishGame(nsp, roomId, game); }
}

function finishGame(nsp, roomId, game) {
  if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
  game.endGame();
  nsp.to(roomId).emit('gameOver', game.getGameOverPayload());
  nsp.emit('roomList', getRoomList());
}

module.exports = { register };
