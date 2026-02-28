// ============================================================
// BACHELOR MODE — Socket.IO Handler
// /bachelor-mode namespace
// ============================================================
const BachelorGame = require('./bachelorGame');
const { NARRATOR_INTROS } = require('./dares');

const DURATIONS = {
  sus_drawing:      35000,
  sus_captioning:   20000,
  caption_submit:   25000,
  caption_vote:     20000,
  excuse_submit:    30000,
  excuse_vote:      20000,
  rizz_submit:      25000,
  rizz_rate:        20000,
  lie_statement:    20000,
  lie_vote:         15000,
  drunk_submit:     30000,
  drunk_vote:       20000,
};
const REVEAL_PAUSE = 5000;
const INTRO_DURATION = 3500;

function register(io) {
  const nsp = io.of('/bachelor-mode');
  const rooms = new Map();           // roomId → BachelorGame
  const playerRooms = new Map();     // socketId → roomId
  const sessionToSocket = new Map(); // sessionId → socketId
  const disconnectTimers = new Map();
  const RECONNECT_GRACE = 30000;

  function gen4() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function buildPayload(game, roomId, playerId, isReconnect = false) {
    return {
      roomId,
      playerId,
      players: game.getPlayerList(),
      owner: game.owner,
      state: game.state,
      currentMiniGame: game.currentMiniGame,
      chaosScore: game.chaosScore,
      isReconnect,
    };
  }

  function advanceMiniGame(roomId) {
    const game = rooms.get(roomId);
    if (!game) return;
    const next = game.nextMiniGame();
    if (!next) {
      // Game over
      const results = game.getFinalResults();
      nsp.to(roomId).emit('gameOver', results);
      return;
    }
    const meta = NARRATOR_INTROS[next] || { name: next, emoji: '🎮' };
    nsp.to(roomId).emit('miniGameIntro', {
      name: meta.name,
      emoji: meta.emoji,
      roundNum: game.miniGameIndex + 1,
      totalRounds: game.miniGames.length,
    });
    setTimeout(() => startMiniGame(roomId), INTRO_DURATION);
  }

  function startMiniGame(roomId) {
    const game = rooms.get(roomId);
    if (!game) return;
    const mg = game.currentMiniGame;
    if (mg === 'sus')         startSus(roomId, game);
    else if (mg === 'caption')     startCaption(roomId, game);
    else if (mg === 'excuse')      startExcuse(roomId, game);
    else if (mg === 'rizz')        startRizz(roomId, game);
    else if (mg === 'liedetector') startLieDetector(roomId, game);
    else if (mg === 'drunklogic')  startDrunkLogic(roomId, game);
  }

  // ── Sus Drawing ──
  function startSus(roomId, game) {
    const info = game.startSus();
    if (!info) { advanceMiniGame(roomId); return; }
    nsp.to(roomId).emit('susStart', {
      drawerId: info.drawerId,
      drawerName: info.drawerName,
      prompt: info.prompt,
      duration: DURATIONS.sus_drawing / 1000,
    });
    // Tell drawer their private prompt
    const drawerSocket = getSocketByPlayerId(roomId, info.drawerId);
    if (drawerSocket) drawerSocket.emit('susYourPrompt', { prompt: info.prompt });
    setTimeout(() => finishSusDrawing(roomId), DURATIONS.sus_drawing);
  }

  function finishSusDrawing(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'sus') return;
    nsp.to(roomId).emit('susCaptionStart', {
      duration: DURATIONS.sus_captioning / 1000,
    });
    setTimeout(() => finishSusCaptioning(roomId), DURATIONS.sus_captioning);
  }

  function finishSusCaptioning(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'sus') return;
    const result = game.endSus();
    nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
    nsp.to(roomId).emit('susReveal', {
      results: result.results,
      winnerName: result.winnerName,
      actualPrompt: game.drawTarget?.prompt || '',
    });
    setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
  }

  // ── Caption This Disaster ──
  function startCaption(roomId, game) {
    const scenario = game.startCaption();
    nsp.to(roomId).emit('captionStart', {
      scene: scenario.scene,
      label: scenario.label,
      duration: DURATIONS.caption_submit / 1000,
    });
    setTimeout(() => finishCaptionSubmit(roomId), DURATIONS.caption_submit);
  }

  function finishCaptionSubmit(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'caption') return;
    if (game.submissions.length === 0) {
      nsp.to(roomId).emit('captionReveal', { scene: game.currentPrompt, results: [], winnerName: null });
      setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
      return;
    }
    // Anonymous voting (anonymize names)
    const anonymized = game.submissions.map(s => ({ playerId: s.playerId, text: s.text }));
    nsp.to(roomId).emit('captionVoteStart', {
      submissions: anonymized,
      duration: DURATIONS.caption_vote / 1000,
    });
    setTimeout(() => finishCaptionVote(roomId), DURATIONS.caption_vote);
  }

  function finishCaptionVote(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'caption') return;
    const result = game.endCaption();
    nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
    nsp.to(roomId).emit('captionReveal', result);
    setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
  }

  // ── Excuse Generator ──
  function startExcuse(roomId, game) {
    const prompt = game.startExcuse();
    nsp.to(roomId).emit('excuseStart', { prompt, duration: DURATIONS.excuse_submit / 1000 });
    setTimeout(() => finishExcuseSubmit(roomId), DURATIONS.excuse_submit);
  }

  function finishExcuseSubmit(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'excuse') return;
    if (game.submissions.length === 0) {
      nsp.to(roomId).emit('excuseReveal', { prompt: game.currentPrompt, results: [], winnerName: null });
      setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
      return;
    }
    const anonymized = game.submissions.map(s => ({ playerId: s.playerId, text: s.text }));
    nsp.to(roomId).emit('excuseVoteStart', { submissions: anonymized, duration: DURATIONS.excuse_vote / 1000 });
    setTimeout(() => finishExcuseVote(roomId), DURATIONS.excuse_vote);
  }

  function finishExcuseVote(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'excuse') return;
    const result = game.endExcuse();
    nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
    nsp.to(roomId).emit('excuseReveal', result);
    setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
  }

  // ── Rate the Rizz ──
  function startRizz(roomId, game) {
    const prompt = game.startRizz();
    nsp.to(roomId).emit('rizzStart', { prompt, duration: DURATIONS.rizz_submit / 1000 });
    setTimeout(() => finishRizzSubmit(roomId), DURATIONS.rizz_submit);
  }

  function finishRizzSubmit(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'rizz') return;
    if (game.submissions.length === 0) {
      nsp.to(roomId).emit('rizzReveal', { prompt: game.currentPrompt, results: [], winnerName: null });
      setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
      return;
    }
    const anonymized = game.submissions.map(s => ({ playerId: s.playerId, text: s.text }));
    nsp.to(roomId).emit('rizzRateStart', { submissions: anonymized, duration: DURATIONS.rizz_rate / 1000 });
    setTimeout(() => finishRizzRate(roomId), DURATIONS.rizz_rate);
  }

  function finishRizzRate(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'rizz') return;
    const result = game.endRizz();
    nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
    nsp.to(roomId).emit('rizzReveal', result);
    setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
  }

  // ── Lie Detector ──
  function startLieDetector(roomId, game) {
    const turn = game.startLieDetector();
    if (!turn) { advanceMiniGame(roomId); return; }
    nsp.to(roomId).emit('lieStart', {
      speakerId: turn.speakerId,
      speakerName: turn.speakerName,
      prompt: turn.prompt,
      duration: DURATIONS.lie_statement / 1000,
    });
    setTimeout(() => finishLieStatement(roomId), DURATIONS.lie_statement);
  }

  function finishLieStatement(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'liedetector') return;
    if (!game.currentLieStatement) {
      // Didn't submit — random
      game.submitLieStatement(game.currentSpeaker, '(no answer)', Math.random() > 0.5);
    }
    nsp.to(roomId).emit('lieVoteStart', {
      statement: game.currentLieStatement.text,
      speakerName: game.players.get(game.currentSpeaker)?.name || '?',
      duration: DURATIONS.lie_vote / 1000,
    });
    setTimeout(() => finishLieVote(roomId), DURATIONS.lie_vote);
  }

  function finishLieVote(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'liedetector') return;
    const result = game.resolveLieTurn();
    nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
    nsp.to(roomId).emit('lieReveal', result);
    if (game.hasMoreLieSpeakers()) {
      setTimeout(() => {
        const nextTurn = game._nextLieSpeaker();
        if (!nextTurn) { setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE); return; }
        nsp.to(roomId).emit('lieStart', {
          speakerId: nextTurn.speakerId,
          speakerName: nextTurn.speakerName,
          prompt: nextTurn.prompt,
          duration: DURATIONS.lie_statement / 1000,
        });
        setTimeout(() => finishLieStatement(roomId), DURATIONS.lie_statement);
      }, REVEAL_PAUSE);
    } else {
      setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
    }
  }

  // ── Drunk Logic ──
  function startDrunkLogic(roomId, game) {
    const prompt = game.startDrunkLogic();
    nsp.to(roomId).emit('drunkStart', { prompt, duration: DURATIONS.drunk_submit / 1000 });
    setTimeout(() => finishDrunkSubmit(roomId), DURATIONS.drunk_submit);
  }

  function finishDrunkSubmit(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'drunklogic') return;
    if (game.submissions.length === 0) {
      nsp.to(roomId).emit('drunkReveal', { prompt: game.currentPrompt, results: [], winnerName: null });
      setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
      return;
    }
    const anonymized = game.submissions.map(s => ({ playerId: s.playerId, text: s.text }));
    nsp.to(roomId).emit('drunkVoteStart', { submissions: anonymized, duration: DURATIONS.drunk_vote / 1000 });
    setTimeout(() => finishDrunkVote(roomId), DURATIONS.drunk_vote);
  }

  function finishDrunkVote(roomId) {
    const game = rooms.get(roomId);
    if (!game || game.currentMiniGame !== 'drunklogic') return;
    const result = game.endDrunkLogic();
    nsp.to(roomId).emit('chaosUpdate', { score: game.chaosScore });
    nsp.to(roomId).emit('drunkReveal', result);
    setTimeout(() => advanceMiniGame(roomId), REVEAL_PAUSE);
  }

  // Helper: find socket by playerId
  function getSocketByPlayerId(roomId, playerId) {
    let found = null;
    sessionToSocket.forEach((socketId, sessionId) => {
      const socket = nsp.sockets.get(socketId);
      if (socket && socket._bachPlayerId === playerId) found = socket;
    });
    return found;
  }

  // ── Socket connections ──
  nsp.on('connection', socket => {
    socket.emit('roomList', getRoomList());

    socket.on('reconnectSession', ({ sessionId, roomId }) => {
      const existing = sessionToSocket.get(sessionId);
      if (existing && existing !== socket.id) {
        const old = nsp.sockets.get(existing);
        if (old) old.disconnect(true);
      }
      sessionToSocket.set(sessionId, socket.id);
      socket._bachSessionId = sessionId;

      if (roomId && rooms.has(roomId)) {
        const game = rooms.get(roomId);
        const success = game.reconnectPlayer(sessionId, null);
        if (success) {
          const t = disconnectTimers.get(sessionId);
          if (t) { clearTimeout(t); disconnectTimers.delete(sessionId); }
          socket.join(roomId);
          playerRooms.set(socket.id, roomId);
          socket._bachPlayerId = sessionId;
          socket.emit('joinedRoom', buildPayload(game, roomId, sessionId, true));
          nsp.to(roomId).emit('playerReconnected', { playerId: sessionId, playerName: game.players.get(sessionId)?.name });
          nsp.to(roomId).emit('playerList', game.getPlayerList());
          return;
        }
      }
    });

    socket.on('createRoom', ({ playerName, sessionId: sid }) => {
      if (socket._bachSessionId !== sid) {
        const old = sessionToSocket.get(sid);
        if (old) { const s = nsp.sockets.get(old); if (s) s.disconnect(true); }
        sessionToSocket.set(sid, socket.id);
        socket._bachSessionId = sid;
      }
      let roomId;
      do { roomId = gen4(); } while (rooms.has(roomId));

      const game = new BachelorGame(roomId);
      const player = game.addPlayer(sid, playerName || 'Player');
      rooms.set(roomId, game);
      socket.join(roomId);
      playerRooms.set(socket.id, roomId);
      socket._bachPlayerId = sid;

      socket.emit('joinedRoom', buildPayload(game, roomId, sid));
      nsp.emit('roomList', getRoomList());
    });

    socket.on('joinRoom', ({ roomId, playerName, sessionId: sid }) => {
      const rId = (roomId || '').toUpperCase();
      if (!rooms.has(rId)) { socket.emit('error', { message: 'Room not found' }); return; }
      const game = rooms.get(rId);
      if (game.state !== 'waiting' && !game.players.has(sid)) {
        socket.emit('error', { message: 'Game already started' }); return;
      }

      if (socket._bachSessionId !== sid) {
        const old = sessionToSocket.get(sid);
        if (old) { const s = nsp.sockets.get(old); if (s) s.disconnect(true); }
        sessionToSocket.set(sid, socket.id);
        socket._bachSessionId = sid;
      }
      const player = game.addPlayer(sid, playerName || 'Player');
      socket.join(rId);
      playerRooms.set(socket.id, rId);
      socket._bachPlayerId = sid;

      socket.emit('joinedRoom', buildPayload(game, rId, sid));
      socket.to(rId).emit('playerJoined', { players: game.getPlayerList(), playerName: player.name });
      nsp.emit('roomList', getRoomList());
    });

    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.state !== 'waiting') return;
      if (game.owner !== socket._bachPlayerId) return;
      if (game.getActivePlayers().length < 2) { socket.emit('error', { message: 'Need at least 2 players' }); return; }
      game.startGame();
      nsp.to(roomId).emit('gameStarted', { players: game.getPlayerList() });
      advanceMiniGame(roomId);
    });

    // Sus Drawing
    socket.on('drawData', data => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || !game.drawTarget) return;
      if (game.drawTarget.drawerId !== socket._bachPlayerId) return;
      socket.to(roomId).emit('drawData', data);
    });

    socket.on('clearCanvas', () => {
      const roomId = playerRooms.get(socket.id);
      if (roomId) socket.to(roomId).emit('clearCanvas');
    });

    socket.on('susCaption', ({ text }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'sus') return;
      const ok = game.submitSusCaption(socket._bachPlayerId, text);
      if (ok) nsp.to(roomId).emit('submitProgress', { submitted: game.submissions.length, total: game.getActivePlayers().length });
    });

    socket.on('susCaptionVote', ({ targetId }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'sus') return;
      game.votes[socket._bachPlayerId] = targetId;
      nsp.to(roomId).emit('voteProgress', { voted: Object.keys(game.votes).length, total: game.getActivePlayers().length });
    });

    // Caption This Disaster
    socket.on('captionSubmit', ({ text }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'caption') return;
      const ok = game.submitCaption(socket._bachPlayerId, text);
      if (ok) nsp.to(roomId).emit('submitProgress', { submitted: game.submissions.length, total: game.getActivePlayers().length });
    });

    socket.on('captionVote', ({ targetId }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'caption') return;
      game.voteCaption(socket._bachPlayerId, targetId);
      nsp.to(roomId).emit('voteProgress', { voted: Object.keys(game.votes).length, total: game.getActivePlayers().length });
    });

    // Excuse
    socket.on('excuseSubmit', ({ text }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'excuse') return;
      const ok = game.submitExcuse(socket._bachPlayerId, text);
      if (ok) nsp.to(roomId).emit('submitProgress', { submitted: game.submissions.length, total: game.getActivePlayers().length });
    });

    socket.on('excuseVote', ({ targetId }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'excuse') return;
      game.voteExcuse(socket._bachPlayerId, targetId);
      nsp.to(roomId).emit('voteProgress', { voted: Object.keys(game.votes).length, total: game.getActivePlayers().length });
    });

    // Rizz
    socket.on('rizzSubmit', ({ text }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'rizz') return;
      const ok = game.submitRizz(socket._bachPlayerId, text);
      if (ok) nsp.to(roomId).emit('submitProgress', { submitted: game.submissions.length, total: game.getActivePlayers().length });
    });

    socket.on('rizzRate', ({ targetId, rating }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'rizz') return;
      game.rateRizz(socket._bachPlayerId, targetId, Math.max(1, Math.min(5, parseInt(rating) || 3)));
    });

    // Lie Detector
    socket.on('lieStatement', ({ text, isLie }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'liedetector') return;
      if (game.currentSpeaker !== socket._bachPlayerId) return;
      game.submitLieStatement(socket._bachPlayerId, text, !!isLie);
      // Confirm to speaker only
      socket.emit('lieStatementReceived');
    });

    socket.on('lieVote', ({ verdict }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'liedetector') return;
      game.voteLie(socket._bachPlayerId, verdict);
      socket.emit('voteProgress', { voted: Object.keys(game.lieVotes).length, total: game.getActivePlayers().length - 1 });
    });

    // Drunk Logic
    socket.on('drunkSubmit', ({ text }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'drunklogic') return;
      const ok = game.submitDrunkLogic(socket._bachPlayerId, text);
      if (ok) nsp.to(roomId).emit('submitProgress', { submitted: game.submissions.length, total: game.getActivePlayers().length });
    });

    socket.on('drunkVote', ({ targetId }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.currentMiniGame !== 'drunklogic') return;
      game.voteDrunkLogic(socket._bachPlayerId, targetId);
      nsp.to(roomId).emit('voteProgress', { voted: Object.keys(game.votes).length, total: game.getActivePlayers().length });
    });

    // Chat
    socket.on('chatMessage', ({ message }) => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game) return;
      const player = game.players.get(socket._bachPlayerId);
      if (!player || !message) return;
      const text = String(message).slice(0, 200);
      nsp.to(roomId).emit('chatMessage', { name: player.name, message: text, avatar: player.avatar });
    });

    socket.on('playAgain', () => {
      const roomId = playerRooms.get(socket.id);
      const game = rooms.get(roomId);
      if (!game || game.owner !== socket._bachPlayerId) return;
      game.reset();
      nsp.to(roomId).emit('backToLobby', { players: game.getPlayerList() });
    });

    socket.on('disconnect', () => {
      const roomId = playerRooms.get(socket.id);
      const playerId = socket._bachPlayerId;
      playerRooms.delete(socket.id);
      if (!roomId || !playerId) return;
      const game = rooms.get(roomId);
      if (!game) return;
      const player = game.players.get(playerId);
      if (!player) return;
      nsp.to(roomId).emit('playerDisconnected', { playerId, playerName: player.name });
      const timer = setTimeout(() => {
        game.holdPlayerForReconnect(playerId);
        nsp.to(roomId).emit('playerLeft', { players: game.getPlayerList(), playerName: player.name });
        if (game.getActivePlayers().length === 0) { rooms.delete(roomId); nsp.emit('roomList', getRoomList()); }
        disconnectTimers.delete(playerId);
      }, RECONNECT_GRACE);
      disconnectTimers.set(playerId, timer);
    });
  });

  function getRoomList() {
    return [...rooms.entries()].map(([id, g]) => ({
      id,
      players: g.getActivePlayers().length,
      state: g.state,
    }));
  }
}

module.exports = { register };
