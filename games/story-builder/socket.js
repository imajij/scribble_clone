// ========================================
// STORY BUILDER — Socket.IO Handler
// ========================================
// Pattern: register(io) → /story-builder namespace
// Auto-discovered by server.js

const StoryBuilderGame = require('./storyBuilder');

const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE = 30000;

function getOrCreateRoom(id) {
  if (!rooms.has(id)) rooms.set(id, new StoryBuilderGame(id));
  return rooms.get(id);
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: 8 });
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
  const nsp = io.of('/story-builder');

  nsp.on('connection', (socket) => {
    console.log(`[story-builder] Connected: ${socket.id}`);
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
      if (game.players.size < 8) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, rounds, turnDuration, prompt, sessionId }) => {
      const roomId = genRoomId();
      const game = getOrCreateRoom(roomId);
      if (rounds) game.setMaxRounds(rounds);
      if (turnDuration) game.setTurnDuration(turnDuration);
      if (prompt) game.setPrompt(prompt);
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= 8) { socket.emit('error', { message: 'Room is full!' }); return; }
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

    // ── Submit sentence ──
    socket.on('submitSentence', ({ sentence }) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const result = game.submitSentence(socket.id, sentence);
      if (!result) return;

      game.clearTimers();

      nsp.to(roomId).emit('sentenceAdded', {
        entry: result.entry,
        storyLength: result.storyLength,
        writerName: result.writerName
      });

      // Advance to next turn after brief delay
      setTimeout(() => advanceTurn(nsp, roomId, game), 1500);
    });

    // ── Chat ──
    socket.on('chatMessage', (msg) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const player = game.players.get(socket.id);
      if (!player) return;
      nsp.to(roomId).emit('chatBroadcast', {
        playerName: player.name,
        message: String(msg).slice(0, 200)
      });
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
      const wasWriter = game.currentWriter === socket.id;
      const wasOwner = game.isOwner(socket.id);
      const pName = player.name;

      if (sid) game.holdPlayerSeat(socket.id);
      game.removePlayer(socket.id);
      playerRooms.delete(socket.id);
      if (sid) sessionToSocket.delete(sid);

      nsp.to(roomId).emit('playerLeft', { playerName: pName, mayReconnect: !!sid });

      if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
        game.clearTimers();
        rooms.delete(roomId);
        nsp.emit('roomList', getRoomList());
        return;
      }

      if (wasOwner && game.owner) {
        const newOwner = game.players.get(game.owner);
        nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        nsp.to(roomId).emit('systemMessage', {
          message: `${newOwner ? newOwner.name : "Someone"} is now the room owner`
        });
      }

      if (game.players.size < 2 && game.state !== 'waiting') {
        game.clearTimers();
        game.state = 'waiting';
        nsp.to(roomId).emit('gameReset', {
          message: 'Not enough players \u2014 waiting\u2026',
          players: game.getPlayerList(),
          story: game.getStory()
        });
      } else if (wasWriter && game.state === 'writing') {
        game.clearTimers();
        const skip = game.skipTurn();
        nsp.to(roomId).emit('turnSkipped', {
          entry: skip.entry,
          writerName: skip.writerName,
          storyLength: skip.storyLength
        });
        setTimeout(() => advanceTurn(nsp, roomId, game), 1500);
      }

      broadcastState(nsp, roomId, game);

      if (sid) {
        const timer = setTimeout(() => {
          disconnectTimers.delete(sid);
          if (game.disconnectedPlayers.has(sid)) {
            game.disconnectedPlayers.delete(sid);
            if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
              game.clearTimers();
              rooms.delete(roomId);
              nsp.emit('roomList', getRoomList());
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
    turnDuration: game.turnDuration,
    prompt: game.prompt,
    story: game.getStory(),
    reconnected,
    currentTurn: (game.state === 'writing') ? {
      writer: game.currentWriter,
      writerName: (game.players.get(game.currentWriter) || {}).name || 'Unknown',
      roundNum: game.roundNum + 1,
      maxRounds: game.maxRounds,
      turnDuration: game.turnDuration
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
    nsp.to(roomId).emit('gameOver', {
      story: result.story,
      players: result.players,
      fullText: game.getFullText()
    });
    game.state = 'waiting';
    nsp.emit('roomList', getRoomList());
    return;
  }
  if (result.event === 'newTurn') {
    nsp.to(roomId).emit('newTurn', {
      writer: result.writer,
      writerName: result.writerName,
      writerAvatar: result.writerAvatar,
      roundNum: result.roundNum,
      maxRounds: result.maxRounds,
      turnDuration: result.turnDuration,
      storyLength: result.storyLength
    });
    broadcastState(nsp, roomId, game);

    // Auto-skip if writer does not submit in time
    game.turnTimer = setTimeout(() => {
      if (game.state === 'writing' && game.currentWriter === result.writer) {
        const skip = game.skipTurn();
        nsp.to(roomId).emit('turnSkipped', {
          entry: skip.entry,
          writerName: skip.writerName,
          storyLength: skip.storyLength
        });
        setTimeout(() => advanceTurn(nsp, roomId, game), 1500);
      }
    }, result.turnDuration * 1000);
  }
}

function advanceTurn(nsp, roomId, game) {
  if (game.players.size < 2) return;
  const result = game.nextTurn();
  broadcastTurnEvent(nsp, roomId, game, result);
}

module.exports = { register };
