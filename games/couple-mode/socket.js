// ========================================
// COUPLE MODE — Socket.IO Handler
// ========================================

const CoupleGame = require('./coupleGame');
const tracker = require('../../playerTracker');

const rooms = new Map();
const playerRooms = new Map();
const sessionToSocket = new Map();
const disconnectTimers = new Map();

const RECONNECT_GRACE = 30000;
const REVEAL_PAUSE    = 5000;   // ms between reveal & next mini-game intro
const INTRO_DURATION  = 3000;   // ms for mini-game intro card
const GAME_ID         = 'couple-mode';

// Per-mini-game phase durations (ms)
const DURATIONS = {
  wml_voting:         15000,
  rfgf_voting:        12000,
  fts_submitting:     22000,
  tos_answering:      25000,   // per-player
  telepathy_answering:15000,
  draw_drawing:       40000,
  draw_guessing:      15000,
};

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getRoomList() {
  const list = [];
  rooms.forEach((g, id) => {
    if (g.players.size > 0) list.push({ id, players: g.players.size, state: g.state, maxPlayers: 10 });
  });
  return list;
}

// ============================================================
function register(io) {
  const nsp = io.of('/couple-mode');

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
          socket.emit('joinedRoom', buildPayload(game, socket.id, roomId, true));
          socket.to(roomId).emit('playerReconnected', { playerName: held.name });
          nsp.to(roomId).emit('playerList', game.getPlayerList());
          return;
        }
      }
      if (game.players.size < 10) { joinRoom(nsp, socket, roomId, playerName, sessionId); return; }
      socket.emit('reconnectFailed', { message: 'Could not reconnect' });
    });

    // ── Create room ──
    socket.on('createRoom', ({ playerName, sessionId }) => {
      const roomId = genRoomId();
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Join room ──
    socket.on('joinRoom', ({ roomId, playerName, sessionId }) => {
      const game = rooms.get(roomId);
      if (!game) { socket.emit('error', { message: 'Room not found!' }); return; }
      if (game.players.size >= 10) { socket.emit('error', { message: 'Room is full!' }); return; }
      joinRoom(nsp, socket, roomId, playerName, sessionId);
    });

    // ── Start game ──
    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.canStart() || !game.isOwner(socket.id)) return;
      game.startGame();
      advanceMiniGame(nsp, roomId, game);
    });

    // ── WML vote ──
    socket.on('wmlVote', ({ targetId }) => {
      const game = getGame(socket); if (!game) return;
      const roomId = playerRooms.get(socket.id);
      const ok = game.castWmlVote(socket.id, targetId);
      if (ok) {
        nsp.to(roomId).emit('voteProgress', game.getVoteProgress());
        if (game.allVoted()) {
          clearTimeout(game.phaseTimer);
          finishWml(nsp, roomId, game);
        }
      }
    });

    // ── RFGF vote ──
    socket.on('rfgfVote', ({ flag }) => {
      const game = getGame(socket); if (!game) return;
      const roomId = playerRooms.get(socket.id);
      const ok = game.castRfgfVote(socket.id, flag);
      if (ok) {
        nsp.to(roomId).emit('voteProgress', game.getVoteProgress());
        if (game.allVoted()) {
          clearTimeout(game.phaseTimer);
          finishRfgf(nsp, roomId, game);
        }
      }
    });

    // ── FTS submit ──
    socket.on('ftsSubmit', ({ text }) => {
      const game = getGame(socket); if (!game) return;
      const roomId = playerRooms.get(socket.id);
      const ok = game.submitFts(socket.id, text);
      if (ok) {
        nsp.to(roomId).emit('submitProgress', game.getSubmitProgress());
        if (game.allSubmitted()) {
          clearTimeout(game.phaseTimer);
          finishFts(nsp, roomId, game);
        }
      }
    });

    // ── TOS answer ──
    socket.on('tosAnswer', ({ text }) => {
      const game = getGame(socket); if (!game) return;
      const roomId = playerRooms.get(socket.id);
      if (game.state !== 'tos_answering') return;
      if (game.turnQueue[game.turnIndex] !== socket.id) return;
      const result = game.submitTosAnswer(socket.id, text);
      if (result) {
        clearTimeout(game.phaseTimer);
        nsp.to(roomId).emit('tosAnswered', { name: game.players.get(socket.id)?.name, text });
        nsp.to(roomId).emit('playerList', game.getPlayerList());
        nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
        tosNextTurn(nsp, roomId, game);
      }
    });

    // ── TOS skip ──
    socket.on('tosSkip', () => {
      const game = getGame(socket); if (!game) return;
      const roomId = playerRooms.get(socket.id);
      if (game.state !== 'tos_answering') return;
      if (game.turnQueue[game.turnIndex] !== socket.id) return;
      clearTimeout(game.phaseTimer);
      game.skipTos(socket.id);
      const name = game.players.get(socket.id)?.name;
      nsp.to(roomId).emit('tosSkipped', { name });
      nsp.to(roomId).emit('playerList', game.getPlayerList());
      nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
      tosNextTurn(nsp, roomId, game);
    });

    // ── Telepathy answer ──
    socket.on('telepathyAnswer', ({ text }) => {
      const game = getGame(socket); if (!game) return;
      const roomId = playerRooms.get(socket.id);
      const ok = game.submitTelepathyAnswer(socket.id, text);
      if (ok) {
        nsp.to(roomId).emit('submitProgress', game.getSubmitProgress());
        if (game.allSubmitted()) {
          clearTimeout(game.phaseTimer);
          finishTelepathy(nsp, roomId, game);
        }
      }
    });

    // ── Draw data relay ──
    socket.on('drawData', (data) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || game.state !== 'draw_drawing') return;
      if (socket.id !== game.drawTarget?.drawerId) return; // only the drawer can send
      socket.to(roomId).emit('drawData', data);
    });

    // ── Clear canvas relay ──
    socket.on('clearCanvas', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || game.state !== 'draw_drawing') return;
      if (socket.id !== game.drawTarget?.drawerId) return;
      socket.to(roomId).emit('clearCanvas');
    });

    // ── Draw caption submit ──
    socket.on('drawCaption', ({ caption }) => {
      const game = getGame(socket); if (!game) return;
      const roomId = playerRooms.get(socket.id);
      const ok = game.submitDrawCaption(socket.id, caption);
      if (ok) {
        nsp.to(roomId).emit('voteProgress', game.getVoteProgress());
        // Everyone except drawer votes
        const eligible = game.players.size - 1;
        if (game.votes.size >= eligible) {
          clearTimeout(game.phaseTimer);
          finishDrawGuessing(nsp, roomId, game);
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
      if (!player || !message) return;
      const text = message.trim().substring(0, 200);
      if (!text) return;
      nsp.to(roomId).emit('chatMessage', { name: player.name, message: text, avatar: player.avatar });
    });

    // ── Play Again ──
    socket.on('playAgain', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || !game.isOwner(socket.id)) return;
      game.cleanup();
      game.reset();
      nsp.to(roomId).emit('backToLobby', { players: game.getPlayerList() });
      nsp.emit('roomList', getRoomList());
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
        game.holdPlayerForReconnect(socket.id);
        playerRooms.delete(socket.id);
        disconnectTimers.set(player.sessionId, setTimeout(() => {
          disconnectTimers.delete(player.sessionId);
          game.disconnectedPlayers.delete(player.sessionId);
          if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
            game.cleanup(); rooms.delete(roomId);
          }
          nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: game.getPlayerList() });
          tracker.playerLeft(GAME_ID);
          nsp.emit('roomList', getRoomList());
        }, RECONNECT_GRACE));
        nsp.to(roomId).emit('playerDisconnected', { playerName: player.name });
      } else {
        game.removePlayer(socket.id);
        playerRooms.delete(socket.id);
        if (game.players.size === 0) { game.cleanup(); rooms.delete(roomId); }
        else {
          nsp.to(roomId).emit('playerLeft', { playerName: player.name, players: game.getPlayerList() });
          nsp.to(roomId).emit('ownerUpdate', { owner: game.owner });
        }
      }

      tracker.playerLeft(GAME_ID);
      nsp.emit('roomList', getRoomList());
    });
  });
}

// ============================================================
// Helpers
// ============================================================

function getGame(socket) {
  const roomId = playerRooms.get(socket.id);
  if (!roomId) return null;
  return rooms.get(roomId) || null;
}

async function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const name = (playerName || 'Anon').substring(0, 20).trim() || 'Anon';
  if (!rooms.has(roomId)) rooms.set(roomId, new CoupleGame(roomId));
  const game = rooms.get(roomId);
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

function buildPayload(game, socketId, roomId, isReconnect) {
  return {
    roomId, playerId: socketId,
    players: game.getPlayerList(),
    owner: game.owner,
    state: game.state,
    currentMiniGame: game.currentMiniGame,
    chaosScore: game.chaosScore,
    isReconnect,
  };
}

// ── Mini-game sequencer ──

function advanceMiniGame(nsp, roomId, game) {
  const next = game.nextMiniGame();
  if (!next) {
    // All mini-games done
    const results = game.getFinalResults();
    nsp.to(roomId).emit('gameOver', results);
    nsp.emit('roomList', getRoomList());
    return;
  }

  const LABELS = {
    wml:       { name: "Who's More Likely To", emoji: '🗳️' },
    draw:      { name: 'Draw Your Partner',    emoji: '🎨' },
    rfgf:      { name: 'Red Flag or Green Flag', emoji: '🚩' },
    fts:       { name: 'Finish The Sentence',  emoji: '✍️' },
    tos:       { name: 'Truth or Skip',        emoji: '😬' },
    telepathy: { name: 'Couple Telepathy',     emoji: '🔮' },
  };

  const label = LABELS[next] || { name: next, emoji: '🎮' };
  nsp.to(roomId).emit('miniGameIntro', {
    id: next,
    name: label.name,
    emoji: label.emoji,
  });

  // After intro, start the mini-game
  game.phaseTimer = setTimeout(() => startMiniGame(nsp, roomId, game, next), INTRO_DURATION);
}

function startMiniGame(nsp, roomId, game, id) {
  switch (id) {
    case 'wml': {
      const q = game.startWml();
      nsp.to(roomId).emit('wmlStart', { question: q, duration: DURATIONS.wml_voting / 1000 });
      nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
      game.phaseTimer = setTimeout(() => finishWml(nsp, roomId, game), DURATIONS.wml_voting);
      break;
    }
    case 'rfgf': {
      const scenario = game.startRfgf();
      nsp.to(roomId).emit('rfgfStart', { scenario, duration: DURATIONS.rfgf_voting / 1000 });
      game.phaseTimer = setTimeout(() => finishRfgf(nsp, roomId, game), DURATIONS.rfgf_voting);
      break;
    }
    case 'fts': {
      const template = game.startFts();
      nsp.to(roomId).emit('ftsStart', { template, duration: DURATIONS.fts_submitting / 1000 });
      game.phaseTimer = setTimeout(() => finishFts(nsp, roomId, game), DURATIONS.fts_submitting);
      break;
    }
    case 'tos': {
      const data = game.startTos();
      nsp.to(roomId).emit('tosStart', { ...data, duration: DURATIONS.tos_answering / 1000 });
      game.phaseTimer = setTimeout(() => {
        game.skipTos(data.currentPlayerId);
        nsp.to(roomId).emit('tosSkipped', { name: data.currentPlayerName });
        nsp.to(roomId).emit('playerList', game.getPlayerList());
        nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
        tosNextTurn(nsp, roomId, game);
      }, DURATIONS.tos_answering);
      break;
    }
    case 'telepathy': {
      const q = game.startTelepathy();
      nsp.to(roomId).emit('telepathyStart', { question: q, duration: DURATIONS.telepathy_answering / 1000 });
      game.phaseTimer = setTimeout(() => finishTelepathy(nsp, roomId, game), DURATIONS.telepathy_answering);
      break;
    }
    case 'draw': {
      const info = game.startDraw();
      // Private: tell only the drawer their target
      const drawerSocket = nsp.sockets.get(info.drawerId);
      if (drawerSocket) drawerSocket.emit('drawYourTurn', { targetName: info.targetName });
      nsp.to(roomId).emit('drawStart', { drawerId: info.drawerId, drawerName: game.players.get(info.drawerId)?.name, duration: DURATIONS.draw_drawing / 1000 });
      game.phaseTimer = setTimeout(() => startDrawGuessing(nsp, roomId, game), DURATIONS.draw_drawing);
      break;
    }
  }
}

function finishWml(nsp, roomId, game) {
  const result = game.endWml();
  nsp.to(roomId).emit('wmlResult', result);
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
  game.revealTimer = setTimeout(() => advanceMiniGame(nsp, roomId, game), REVEAL_PAUSE);
}

function finishRfgf(nsp, roomId, game) {
  const result = game.endRfgf();
  nsp.to(roomId).emit('rfgfResult', result);
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
  game.revealTimer = setTimeout(() => advanceMiniGame(nsp, roomId, game), REVEAL_PAUSE);
}

function finishFts(nsp, roomId, game) {
  const data = game.getFtsReveal();
  nsp.to(roomId).emit('ftsReveal', data);
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
  game.revealTimer = setTimeout(() => advanceMiniGame(nsp, roomId, game), REVEAL_PAUSE + 3000);
}

function tosNextTurn(nsp, roomId, game) {
  const next = game.advanceTos();
  if (!next) {
    // All turns done → reveal
    const entries = game.getTosReveal();
    nsp.to(roomId).emit('tosReveal', { entries });
    nsp.to(roomId).emit('playerList', game.getPlayerList());
    game.revealTimer = setTimeout(() => advanceMiniGame(nsp, roomId, game), REVEAL_PAUSE);
    return;
  }
  nsp.to(roomId).emit('tosTurn', { ...next, duration: DURATIONS.tos_answering / 1000 });
  game.phaseTimer = setTimeout(() => {
    game.skipTos(next.currentPlayerId);
    nsp.to(roomId).emit('tosSkipped', { name: next.currentPlayerName });
    nsp.to(roomId).emit('playerList', game.getPlayerList());
    nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
    tosNextTurn(nsp, roomId, game);
  }, DURATIONS.tos_answering);
}

function finishTelepathy(nsp, roomId, game) {
  const result = game.endTelepathy();
  nsp.to(roomId).emit('telepathyReveal', result);
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
  game.revealTimer = setTimeout(() => advanceMiniGame(nsp, roomId, game), REVEAL_PAUSE);
}

function startDrawGuessing(nsp, roomId, game) {
  game.state = 'draw_guessing';
  nsp.to(roomId).emit('drawGuessStart', { captions: require('./prompts').CAPTION_LABELS, duration: DURATIONS.draw_guessing / 1000 });
  game.phaseTimer = setTimeout(() => finishDrawGuessing(nsp, roomId, game), DURATIONS.draw_guessing);
}

function finishDrawGuessing(nsp, roomId, game) {
  const result = game.endDrawGuessing();
  nsp.to(roomId).emit('drawReveal', result);
  nsp.to(roomId).emit('playerList', game.getPlayerList());
  nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
  game.revealTimer = setTimeout(() => advanceMiniGame(nsp, roomId, game), REVEAL_PAUSE);
}

module.exports = { register };
