// ========================================
// SCRIBBLE AFTER DARK — Socket.IO handler
// ========================================
// Thin router: all game-logic events are delegated to the active mode handler.
// Infrastructure (join, reconnect, disconnect) stays here.

const Game = require('../../game');
const { VALID_PACKS, DEFAULT_PACK, getPackList } = require('../../words');
const tracker = require('../../playerTracker');
const { saveScore, loadScore } = require('../../redisCache');

const scribbleMode = require('./modes/scribbleMode');
const bachelorMode = require('./modes/bachelorMode');

const MODES = { scribble: scribbleMode, bachelor: bachelorMode };
const VALID_MODES = Object.keys(MODES);
const DEFAULT_MODE = 'scribble';

// Room management (scoped to this game)
const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE_PERIOD = 30000; // 30 seconds

// ----------------------------------------
// Room helpers
// ----------------------------------------

function getOrCreateRoom(roomId, wordPack) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Game(roomId, wordPack));
  }
  return rooms.get(roomId);
}

function attachRoomContext(game, nsp) {
  game.nsp = nsp;
  game.roomId = game.roomId || null;
  game._rooms = rooms;
}

function setGameMode(game, mode) {
  const handler = MODES[mode] || scribbleMode;
  game.mode = VALID_MODES.includes(mode) ? mode : DEFAULT_MODE;
  game.modeHandler = handler;

  // Bachelor mode uses faster turns
  if (game.mode === 'bachelor') {
    game.turnDuration = 60;
  }
}

function getRoomList() {
  const list = [];
  rooms.forEach((game, id) => {
    if (game.players.size > 0) {
      list.push({
        id,
        players: game.players.size,
        state: game.state,
        maxPlayers: 8,
        wordPack: game.wordPack,
        customMode: game.useCustomWords,
        mode: game.mode
      });
    }
  });
  return list;
}

// ----------------------------------------
// Attach to a Socket.IO namespace
// ----------------------------------------

function register(io) {
  const nsp = io.of('/scribble');

  nsp.on('connection', (socket) => {
    console.log(`[scribble] Player connected: ${socket.id}`);

    // Send room list
    socket.emit('roomList', getRoomList());

    // ---- Reconnect attempt ----
    socket.on('reconnectSession', ({ sessionId, roomId, playerName }) => {
      if (!sessionId || !roomId) return;

      const game = rooms.get(roomId);
      if (!game) {
        socket.emit('reconnectFailed', { message: 'Room no longer exists' });
        return;
      }

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

          const payload = {
            roomId,
            players: game.getPlayerList(),
            state: game.state,
            isOwner: game.isOwner(socket.id),
            owner: game.owner,
            wordPack: game.wordPack,
            customMode: game.useCustomWords,
            mode: game.mode,
            reconnected: true
          };

          if (game.state === 'drawing' || game.state === 'choosing') {
            const drawerPlayer = game.players.get(game.currentDrawer);
            payload.gameState = {
              drawer: game.currentDrawer,
              drawerName: drawerPlayer ? drawerPlayer.name : 'Unknown',
              hint: game.getCurrentHint(),
              wordLength: game.currentWord ? game.currentWord.length : 0,
              remainingTime: game.getRemainingTime(),
              roundNum: game.roundNum + 1,
              maxRounds: game.maxRounds,
              drawingData: game.drawingData,
              isChoosing: game.state === 'choosing'
            };
            if (game.currentDrawer === socket.id && game.currentWord) {
              payload.gameState.yourWord = game.currentWord;
            }
          }

          socket.emit('joinedRoom', payload);
          socket.to(roomId).emit('playerReconnected', {
            playerName: held.name,
            players: game.getPlayerList()
          });
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
          nsp.to(roomId).emit('playerList', game.getPlayerList());
          console.log(`[scribble] Player reconnected: ${held.name} (${sessionId})`);
          return;
        }
      }

      let found = false;
      for (const [, player] of game.players) {
        if (player.sessionId === sessionId) { found = true; break; }
      }

      if (!found && game.players.size < 8) {
        joinRoom(nsp, socket, roomId, playerName, sessionId);
        return;
      }

      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ---- Create room ----
    socket.on('createRoom', ({ playerName, rounds, sessionId, wordPack, customWords, mode }) => {
      const roomId = generateRoomId();
      const pack = VALID_PACKS.includes(wordPack) ? wordPack : DEFAULT_PACK;
      const game = getOrCreateRoom(roomId, pack);

      if (rounds) game.maxRounds = Math.min(Math.max(rounds, 1), 10);
      if (Array.isArray(customWords) && customWords.length > 0) {
        game.setCustomWords(customWords);
      }

      // Wire mode and context
      game.roomId = roomId;
      attachRoomContext(game, nsp);
      setGameMode(game, mode);

      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ---- Join room ----
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) {
        socket.emit('error', { message: 'Room not found!' });
        return;
      }
      if (game.players.size >= 8) {
        socket.emit('error', { message: 'Room is full!' });
        return;
      }
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ---- Start game ----
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.canStart()) return;

      if (!game.isOwner(socket.id)) {
        socket.emit('error', { message: 'Only the room owner can start the game!' });
        return;
      }

      game.modeHandler.startRound(game);
      nsp.emit('roomList', getRoomList());
    });

    // ---- Game events — routed to mode handler ----

    socket.on('wordChosen', (word) => {
      const game = _getGame(socket);
      if (!game) return;
      game.modeHandler.handleEvent(game, socket, { event: 'wordChosen', data: word });
    });

    socket.on('draw', (data) => {
      const game = _getGame(socket);
      if (!game) return;
      game.modeHandler.handleEvent(game, socket, { event: 'draw', data });
    });

    socket.on('clearCanvas', () => {
      const game = _getGame(socket);
      if (!game) return;
      game.modeHandler.handleEvent(game, socket, { event: 'clearCanvas', data: null });
    });

    socket.on('chatMessage', (message) => {
      const game = _getGame(socket);
      if (!game) return;
      game.modeHandler.handleEvent(game, socket, { event: 'chatMessage', data: message });
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const game = rooms.get(roomId);
      if (!game) return;

      const player = game.players.get(socket.id);
      if (!player) return;

      const sessionId = player.sessionId;
      const wasDrawer = game.currentDrawer === socket.id;
      const wasOwner = game.isOwner(socket.id);
      const playerName = player.name;

      // Persist score to Redis so it survives beyond the grace period
      if (sessionId && player.score > 0) {
        saveScore('scribble', sessionId, player.score);
      }

      if (sessionId) {
        game.holdPlayerSeat(socket.id);
      }

      game.removePlayer(socket.id);
      playerRooms.delete(socket.id);
      if (sessionId) sessionToSocket.delete(sessionId);
      tracker.playerLeft('scribble');

      nsp.to(roomId).emit('playerLeft', {
        playerName,
        players: game.getPlayerList(),
        mayReconnect: !!sessionId
      });

      if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
        game.clearTimers();
        rooms.delete(roomId);
        nsp.emit('roomList', getRoomList());
        return;
      }

      if (wasOwner && game.owner) {
        nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        const newOwnerPlayer = game.players.get(game.owner);
        nsp.to(roomId).emit('systemMessage', {
          message: `${newOwnerPlayer ? newOwnerPlayer.name : 'Someone'} is now the room owner`
        });
      }

      if (game.players.size < 2 && game.state !== 'waiting') {
        game.clearTimers();
        game.state = 'waiting';
        nsp.to(roomId).emit('gameReset', {
          message: 'Not enough players. Waiting for more...',
          players: game.getPlayerList()
        });
      } else if (wasDrawer && (game.state === 'drawing' || game.state === 'choosing')) {
        game.modeHandler.endRound(game, false);
      }

      nsp.to(roomId).emit('playerList', game.getPlayerList());
      console.log(`[scribble] Player disconnected: ${playerName} (${socket.id})`);

      if (sessionId) {
        const timer = setTimeout(() => {
          disconnectTimers.delete(sessionId);
          if (game.disconnectedPlayers.has(sessionId)) {
            game.disconnectedPlayers.delete(sessionId);
            console.log(`[scribble] Session expired: ${sessionId} (${playerName})`);
            if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
              game.clearTimers();
              rooms.delete(roomId);
              nsp.emit('roomList', getRoomList());
            }
          }
        }, RECONNECT_GRACE_PERIOD);
        disconnectTimers.set(sessionId, timer);
      }

      nsp.emit('roomList', getRoomList());
    });
  });
}

// ========================================
// Helper functions
// ========================================

function _getGame(socket) {
  const roomId = playerRooms.get(socket.id);
  if (!roomId) return null;
  return rooms.get(roomId) || null;
}

async function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const game = getOrCreateRoom(roomId);

  // Ensure every room has context attached (handles rooms created before nsp was available)
  if (!game.nsp) attachRoomContext(game, nsp);
  if (!game.modeHandler) setGameMode(game, game.mode || DEFAULT_MODE);
  game.roomId = roomId;

  game.addPlayer(socket.id, playerName, sessionId);
  playerRooms.set(socket.id, roomId);
  if (sessionId) sessionToSocket.set(sessionId, socket.id);
  tracker.playerJoined('scribble');

  // Restore cached score from Redis if available
  if (sessionId) {
    const cachedScore = await loadScore('scribble', sessionId);
    if (cachedScore !== null) {
      const player = game.players.get(socket.id);
      if (player && player.score === 0) {
        player.score = cachedScore;
        console.log(`[scribble] Restored score ${cachedScore} for ${playerName} (${sessionId})`);
      }
    }
  }

  socket.join(roomId);

  const joinPayload = {
    roomId,
    players: game.getPlayerList(),
    state: game.state,
    isOwner: game.isOwner(socket.id),
    owner: game.owner,
    wordPack: game.wordPack,
    customMode: game.useCustomWords,
    mode: game.mode
  };

  if (game.state === 'drawing' || game.state === 'choosing') {
    const drawerPlayer = game.players.get(game.currentDrawer);
    joinPayload.gameState = {
      drawer: game.currentDrawer,
      drawerName: drawerPlayer ? drawerPlayer.name : 'Unknown',
      hint: game.getCurrentHint(),
      wordLength: game.currentWord ? game.currentWord.length : 0,
      remainingTime: game.getRemainingTime(),
      roundNum: game.roundNum + 1,
      maxRounds: game.maxRounds,
      drawingData: game.drawingData,
      isChoosing: game.state === 'choosing'
    };
  }

  socket.emit('joinedRoom', joinPayload);

  socket.to(roomId).emit('playerJoined', {
    playerName,
    players: game.getPlayerList()
  });

  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.emit('roomList', getRoomList());
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

module.exports = { register };
