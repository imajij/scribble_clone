// ========================================
// TRUTH OR TEASE LIVE — Socket.IO Handler
// ========================================
// Follows the same pattern as games/scribble/socket.js:
//   - Scoped room/player Maps
//   - Reconnect grace period
//   - register(io) attaches the /truth-or-tease namespace

const TruthLiveGame = require('./truthLive');
const { getQuestionStats } = require('./questions');
const tracker = require('../../playerTracker');

const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE_PERIOD = 30000;

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new TruthLiveGame(roomId));
  }
  return rooms.get(roomId);
}

function getRoomList() {
  const list = [];
  rooms.forEach((game, id) => {
    if (game.players.size > 0) {
      list.push({
        id,
        players: game.players.size,
        state: game.state,
        maxPlayers: 10
      });
    }
  });
  return list;
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ============================================================
// Register on Socket.IO
// ============================================================

function register(io) {
  const nsp = io.of('/truth-or-tease');

  nsp.on('connection', (socket) => {
    console.log(`[truth-or-tease] Player connected: ${socket.id}`);
    socket.emit('roomList', getRoomList());

    // ---- Reconnect ----
    socket.on('reconnectSession', ({ sessionId, roomId, playerName }) => {
      if (!sessionId || !roomId) return;
      const game = rooms.get(roomId);
      if (!game) { socket.emit('reconnectFailed', { message: 'Room no longer exists' }); return; }

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

          const payload = buildJoinPayload(game, socket.id, roomId, true);
          socket.emit('joinedRoom', payload);
          socket.to(roomId).emit('playerReconnected', { playerName: held.name, players: game.getPlayerList() });
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
          nsp.to(roomId).emit('playerList', game.getPlayerList());
          console.log(`[truth-or-tease] Reconnected: ${held.name}`);
          return;
        }
      }

      // Try joining fresh
      let found = false;
      for (const [, p] of game.players) { if (p.sessionId === sessionId) { found = true; break; } }
      if (!found && game.players.size < 10) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ---- Create room ----
    socket.on('createRoom', ({ playerName, rounds, sessionId, heatLevel }) => {
      const roomId = generateRoomId();
      const game = getOrCreateRoom(roomId);
      if (rounds) game.maxRounds = Math.min(Math.max(rounds, 1), 10);
      if ([1, 2, 3].includes(heatLevel)) game.heatLevel = heatLevel;
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ---- Join room ----
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= 10) { socket.emit('error', { message: 'Room is full!' }); return; }
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ---- Start game ----
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.canStart()) return;
      if (!game.isOwner(socket.id)) { socket.emit('error', { message: 'Only the room owner can start!' }); return; }

      const result = game.startGame();
      handleTurnEvent(nsp, roomId, game, result);
      nsp.emit('roomList', getRoomList());
    });

    // ---- Submit answer (hot-seat player) ----
    socket.on('submitAnswer', (answer) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const result = game.submitAnswer(socket.id, answer);
      if (!result) return;

      game.clearTimers();

      // Broadcast the revealed answer & start vote phase
      nsp.to(roomId).emit('answerRevealed', {
        hotSeat: result.hotSeat,
        hotSeatName: result.hotSeatName,
        question: result.question,
        answer: result.answer,
        voteDuration: result.voteDuration
      });
      nsp.to(roomId).emit('playerList', game.getPlayerList());

      // Vote timer
      game.voteTimer = setTimeout(() => endVoting(nsp, roomId, game), game.voteDuration * 1000);
    });

    // ---- Cast reaction (voters) ----
    socket.on('react', (emoji) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const result = game.castReaction(socket.id, emoji);
      if (!result || !result.valid) return;

      nsp.to(roomId).emit('reactionCast', {
        voter: result.voter,
        voterName: result.voterName,
        emoji: result.emoji
      });
      nsp.to(roomId).emit('playerList', game.getPlayerList());

      if (result.allVoted) {
        endVoting(nsp, roomId, game);
      }
    });

    // ---- Chat ----
    socket.on('chatMessage', (msg) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const player = game.players.get(socket.id);
      if (!player) return;
      const text = String(msg).slice(0, 200);
      nsp.to(roomId).emit('chatBroadcast', { playerName: player.name, message: text });
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
      const wasHotSeat = game.currentPlayer === socket.id;
      const wasOwner = game.isOwner(socket.id);
      const playerName = player.name;

      if (sessionId) game.holdPlayerSeat(socket.id);

      game.removePlayer(socket.id);
      playerRooms.delete(socket.id);
      if (sessionId) sessionToSocket.delete(sessionId);
      tracker.playerLeft('truth-or-tease');

      nsp.to(roomId).emit('playerLeft', { playerName, players: game.getPlayerList(), mayReconnect: !!sessionId });

      if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
        game.clearTimers();
        rooms.delete(roomId);
        nsp.emit('roomList', getRoomList());
        return;
      }

      if (wasOwner && game.owner) {
        nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        const newOwner = game.players.get(game.owner);
        nsp.to(roomId).emit('systemMessage', { message: `${newOwner ? newOwner.name : 'Someone'} is now the room owner` });
      }

      if (game.players.size < 2 && game.state !== 'waiting') {
        game.clearTimers();
        game.state = 'waiting';
        nsp.to(roomId).emit('gameReset', { message: 'Not enough players. Waiting for more...', players: game.getPlayerList() });
      } else if (wasHotSeat && game.state === 'answering') {
        // Hot-seat player left during their turn — skip
        const skipResult = game.skipAnswer();
        if (skipResult) {
          nsp.to(roomId).emit('answerRevealed', skipResult);
          game.voteTimer = setTimeout(() => endVoting(nsp, roomId, game), game.voteDuration * 1000);
        }
      }

      nsp.to(roomId).emit('playerList', game.getPlayerList());
      console.log(`[truth-or-tease] Disconnected: ${playerName} (${socket.id})`);

      if (sessionId) {
        const timer = setTimeout(() => {
          disconnectTimers.delete(sessionId);
          if (game.disconnectedPlayers.has(sessionId)) {
            game.disconnectedPlayers.delete(sessionId);
            console.log(`[truth-or-tease] Session expired: ${sessionId}`);
            if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
              game.clearTimers(); rooms.delete(roomId); nsp.emit('roomList', getRoomList());
            }
          }
        }, RECONNECT_GRACE_PERIOD);
        disconnectTimers.set(sessionId, timer);
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
  tracker.playerJoined('truth-or-tease');
  socket.join(roomId);

  socket.emit('joinedRoom', buildJoinPayload(game, socket.id, roomId, false));
  socket.to(roomId).emit('playerJoined', { playerName, players: game.getPlayerList() });
  nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.emit('roomList', getRoomList());
}

function buildJoinPayload(game, socketId, roomId, reconnected) {
  const payload = {
    roomId,
    players: game.getPlayerList(),
    state: game.state,
    isOwner: game.isOwner(socketId),
    owner: game.owner,
    heatLevel: game.heatLevel,
    reconnected
  };

  if (game.state === 'answering' || game.state === 'voting') {
    const hotPlayer = game.players.get(game.currentPlayer);
    payload.gameState = {
      hotSeat: game.currentPlayer,
      hotSeatName: hotPlayer ? hotPlayer.name : 'Unknown',
      question: game.currentQuestion,
      answer: game.state === 'voting' ? game.currentAnswer : null,
      remainingTime: game.getRemainingTime(),
      phase: game.state,
      roundNum: game.roundNum + 1,
      maxRounds: game.maxRounds
    };
  }

  return payload;
}

function handleTurnEvent(nsp, roomId, game, result) {
  if (!result) return;

  if (result.event === 'gameOver') {
    nsp.to(roomId).emit('gameOver', { scores: result.scores });
    game.state = 'waiting';
    nsp.emit('roomList', getRoomList());
    return;
  }

  if (result.event === 'question') {
    nsp.to(roomId).emit('newQuestion', {
      hotSeat: result.hotSeat,
      hotSeatName: result.hotSeatName,
      question: result.question,
      duration: result.duration,
      roundNum: result.roundNum,
      maxRounds: result.maxRounds
    });
    nsp.to(roomId).emit('playerList', game.getPlayerList());

    // Answer timer — auto-skip if hot-seat doesn't answer in time
    game.answerTimer = setTimeout(() => {
      if (game.state === 'answering') {
        const skipResult = game.skipAnswer();
        if (skipResult) {
          nsp.to(roomId).emit('answerRevealed', skipResult);
          nsp.to(roomId).emit('playerList', game.getPlayerList());
          game.voteTimer = setTimeout(() => endVoting(nsp, roomId, game), game.voteDuration * 1000);
        }
      }
    }, game.answerDuration * 1000);
  }
}

function endVoting(nsp, roomId, game) {
  game.clearTimers();
  const summary = game.tallyReactions();

  nsp.to(roomId).emit('roundEnd', {
    hotSeat: summary.hotSeat,
    hotSeatName: summary.hotSeatName,
    question: summary.question,
    answer: summary.answer,
    reactions: summary.reactions,
    totalVotes: summary.totalVotes,
    scores: summary.scores
  });

  // Next turn after delay
  setTimeout(() => {
    if (game.players.size >= 2) {
      const result = game.nextTurn();
      handleTurnEvent(nsp, roomId, game, result);
    }
  }, 5000);
}

module.exports = { register };
