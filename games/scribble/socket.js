// ========================================
// SCRIBBLE AFTER DARK — Socket.IO handler
// ========================================
// Extracted from the original monolithic server.js.
// Receives the shared `io` instance and attaches all scribble-specific
// socket events under the `/scribble` namespace.

const Game = require('../../game');
const { VALID_PACKS, DEFAULT_PACK, getPackList } = require('../../words');

// Room management (scoped to this game)
const rooms = new Map();
const playerRooms = new Map();        // socketId → roomId
const sessionToSocket = new Map();    // sessionId → socketId
const disconnectTimers = new Map();   // sessionId → timeout
const RECONNECT_GRACE_PERIOD = 30000; // 30 seconds

function getOrCreateRoom(roomId, wordPack) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Game(roomId, wordPack));
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
        maxPlayers: 8,
        wordPack: game.wordPack,
        customMode: game.useCustomWords
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
    socket.on('createRoom', ({ playerName, rounds, sessionId, wordPack, customWords }) => {
      const roomId = generateRoomId();
      const pack = VALID_PACKS.includes(wordPack) ? wordPack : DEFAULT_PACK;
      const game = getOrCreateRoom(roomId, pack);
      if (rounds) game.maxRounds = Math.min(Math.max(rounds, 1), 10);

      if (Array.isArray(customWords) && customWords.length > 0) {
        game.setCustomWords(customWords);
      }

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

      const result = game.startGame();
      handleTurnEvent(nsp, roomId, game, result);
      nsp.emit('roomList', getRoomList());
    });

    // ---- Word chosen ----
    socket.on('wordChosen', (word) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || game.state !== 'choosing' || game.currentDrawer !== socket.id) return;

      game.clearTimers();
      const result = game.selectWord(word);

      nsp.to(roomId).emit('turnStart', {
        drawer: result.drawer,
        drawerName: result.drawerName,
        hint: result.hint,
        wordLength: result.wordLength,
        duration: result.duration
      });

      socket.emit('yourWord', { word });
      nsp.to(roomId).emit('playerList', game.getPlayerList());

      startHintTimer(nsp, roomId, game);

      game.turnTimer = setTimeout(() => {
        endTurn(nsp, roomId, game, false);
      }, game.turnDuration * 1000);
    });

    // ---- Drawing data ----
    socket.on('draw', (data) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || game.currentDrawer !== socket.id || game.state !== 'drawing') return;

      game.drawingData.push(data);
      socket.to(roomId).emit('draw', data);
    });

    // ---- Clear canvas ----
    socket.on('clearCanvas', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game || game.currentDrawer !== socket.id) return;

      game.drawingData = [];
      nsp.to(roomId).emit('clearCanvas');
    });

    // ---- Chat / guess ----
    socket.on('chatMessage', (message) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;
      const game = rooms.get(roomId);
      if (!game) return;

      const player = game.players.get(socket.id);
      if (!player) return;

      if (game.state === 'drawing' && socket.id !== game.currentDrawer) {
        const result = game.checkGuess(socket.id, message);

        if (result && result.correct) {
          nsp.to(roomId).emit('correctGuess', {
            playerName: result.playerName,
            playerId: socket.id,
            score: result.score
          });
          nsp.to(roomId).emit('playerList', game.getPlayerList());

          if (result.allGuessed) {
            endTurn(nsp, roomId, game, true);
          }
          return;
        }

        if (result && result.close) {
          socket.emit('closeGuess', { message: "You're close!" });
        }
      }

      if (game.currentWord && message.toLowerCase().includes(game.currentWord.toLowerCase())) {
        socket.emit('systemMessage', { message: "Your message contained the answer!" });
        return;
      }

      nsp.to(roomId).emit('chatMessage', {
        playerName: player.name,
        playerId: socket.id,
        message,
        color: player.avatar
      });
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

      if (sessionId) {
        game.holdPlayerSeat(socket.id);
      }

      game.removePlayer(socket.id);
      playerRooms.delete(socket.id);
      if (sessionId) sessionToSocket.delete(sessionId);

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
        endTurn(nsp, roomId, game, false);
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
// Helper functions (scribble-scoped)
// ========================================

function joinRoom(nsp, socket, roomId, playerName, sessionId) {
  const game = getOrCreateRoom(roomId);
  game.addPlayer(socket.id, playerName, sessionId);
  playerRooms.set(socket.id, roomId);
  if (sessionId) sessionToSocket.set(sessionId, socket.id);

  socket.join(roomId);

  const joinPayload = {
    roomId,
    players: game.getPlayerList(),
    state: game.state,
    isOwner: game.isOwner(socket.id),
    owner: game.owner,
    wordPack: game.wordPack,
    customMode: game.useCustomWords
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

function handleTurnEvent(nsp, roomId, game, result) {
  if (!result) return;

  if (result.event === 'gameOver') {
    nsp.to(roomId).emit('gameOver', { scores: result.scores });
    game.state = 'waiting';
    nsp.emit('roomList', getRoomList());
    return;
  }

  if (result.event === 'choosing') {
    nsp.to(roomId).emit('choosing', {
      drawer: result.drawer,
      drawerName: result.drawerName,
      roundNum: result.roundNum,
      maxRounds: result.maxRounds
    });

    const drawerSocket = nsp.sockets.get(result.drawer);
    if (drawerSocket) {
      drawerSocket.emit('wordChoices', { choices: result.choices });
    }

    nsp.to(roomId).emit('playerList', game.getPlayerList());

    game.chooseTimer = setTimeout(() => {
      if (game.state === 'choosing') {
        const randomWord = result.choices[Math.floor(Math.random() * result.choices.length)];
        const turnResult = game.selectWord(randomWord);

        nsp.to(roomId).emit('turnStart', {
          drawer: turnResult.drawer,
          drawerName: turnResult.drawerName,
          hint: turnResult.hint,
          wordLength: turnResult.wordLength,
          duration: turnResult.duration
        });

        if (drawerSocket) {
          drawerSocket.emit('yourWord', { word: randomWord });
        }

        nsp.to(roomId).emit('playerList', game.getPlayerList());
        startHintTimer(nsp, roomId, game);

        game.turnTimer = setTimeout(() => {
          endTurn(nsp, roomId, game, false);
        }, game.turnDuration * 1000);
      }
    }, game.chooseDuration * 1000);
  }
}

function startHintTimer(nsp, roomId, game) {
  const hintIntervals = [
    game.turnDuration * 0.4 * 1000,
    game.turnDuration * 0.65 * 1000
  ];

  hintIntervals.forEach((delay, index) => {
    setTimeout(() => {
      if (game.state === 'drawing' && game.currentWord) {
        const revealCount = Math.min(index + 1, game.hints.length);
        const hint = game.getPartialHint(revealCount);
        nsp.to(roomId).emit('hint', { hint });
      }
    }, delay);
  });
}

function endTurn(nsp, roomId, game, allGuessed) {
  game.clearTimers();

  nsp.to(roomId).emit('turnEnd', {
    word: game.currentWord,
    allGuessed,
    scores: game.getPlayerList()
  });

  setTimeout(() => {
    if (game.players.size >= 2) {
      const result = game.nextTurn();
      handleTurnEvent(nsp, roomId, game, result);
    }
  }, 4000);
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
