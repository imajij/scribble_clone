const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Room management
const rooms = new Map();
const playerRooms = new Map(); // socketId -> roomId
const sessionToSocket = new Map(); // sessionId -> socketId
const disconnectTimers = new Map(); // sessionId -> timeout
const RECONNECT_GRACE_PERIOD = 30000; // 30 seconds to reconnect

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Game(roomId));
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
        maxPlayers: 8
      });
    }
  });
  return list;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send room list
  socket.emit('roomList', getRoomList());

  // Reconnect attempt
  socket.on('reconnectSession', ({ sessionId, roomId, playerName }) => {
    if (!sessionId || !roomId) return;

    const game = rooms.get(roomId);
    if (!game) {
      socket.emit('reconnectFailed', { message: 'Room no longer exists' });
      return;
    }

    // Cancel the disconnect timer
    if (disconnectTimers.has(sessionId)) {
      clearTimeout(disconnectTimers.get(sessionId));
      disconnectTimers.delete(sessionId);
    }

    // Try to reconnect into existing seat
    if (game.hasDisconnectedPlayer(sessionId)) {
      const held = game.reconnectPlayer(socket.id, sessionId);
      if (held) {
        sessionToSocket.set(sessionId, socket.id);
        playerRooms.set(socket.id, roomId);
        socket.join(roomId);

        // Build full game state for the reconnected player
        const payload = {
          roomId,
          players: game.getPlayerList(),
          state: game.state,
          isOwner: game.isOwner(socket.id),
          owner: game.owner,
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
          // If this player is the drawer, send them the word
          if (game.currentDrawer === socket.id && game.currentWord) {
            payload.gameState.yourWord = game.currentWord;
          }
        }

        socket.emit('joinedRoom', payload);
        socket.to(roomId).emit('playerReconnected', {
          playerName: held.name,
          players: game.getPlayerList()
        });
        io.to(roomId).emit('ownerUpdate', { owner: game.owner });
        io.to(roomId).emit('playerList', game.getPlayerList());
        console.log(`Player reconnected: ${held.name} (${sessionId})`);
        return;
      }
    }

    // Session not held — check if player is still somehow in the game by sessionId
    let found = false;
    for (const [existingId, player] of game.players) {
      if (player.sessionId === sessionId) {
        found = true;
        break;
      }
    }

    if (!found && game.players.size < 8) {
      // Rejoin as new player
      joinRoom(socket, roomId, playerName, sessionId);
      return;
    }

    socket.emit('reconnectFailed', { message: 'Could not reconnect' });
  });

  // Create room
  socket.on('createRoom', ({ playerName, rounds, sessionId }) => {
    const roomId = generateRoomId();
    const game = getOrCreateRoom(roomId);
    if (rounds) game.maxRounds = Math.min(Math.max(rounds, 1), 10);
    joinRoom(socket, roomId, playerName, sessionId);
  });

  // Join room
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
    joinRoom(socket, roomId, playerName, sessionId);
  });

  // Start game
  socket.on('startGame', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const game = rooms.get(roomId);
    if (!game || !game.canStart()) return;

    // Only room owner can start the game
    if (!game.isOwner(socket.id)) {
      socket.emit('error', { message: 'Only the room owner can start the game!' });
      return;
    }

    const result = game.startGame();
    handleTurnEvent(roomId, game, result);
    io.emit('roomList', getRoomList());
  });

  // Word chosen by drawer
  socket.on('wordChosen', (word) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const game = rooms.get(roomId);
    if (!game || game.state !== 'choosing' || game.currentDrawer !== socket.id) return;

    game.clearTimers();
    const result = game.selectWord(word);

    // Broadcast turn start (without revealing the word)
    io.to(roomId).emit('turnStart', {
      drawer: result.drawer,
      drawerName: result.drawerName,
      hint: result.hint,
      wordLength: result.wordLength,
      duration: result.duration
    });

    // Send actual word to drawer only
    socket.emit('yourWord', { word });

    // Update player list
    io.to(roomId).emit('playerList', game.getPlayerList());

    // Hint timer - reveal letters over time
    startHintTimer(roomId, game);

    // Turn timer
    game.turnTimer = setTimeout(() => {
      endTurn(roomId, game, false);
    }, game.turnDuration * 1000);
  });

  // Drawing data
  socket.on('draw', (data) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const game = rooms.get(roomId);
    if (!game || game.currentDrawer !== socket.id || game.state !== 'drawing') return;

    game.drawingData.push(data);
    socket.to(roomId).emit('draw', data);
  });

  // Clear canvas
  socket.on('clearCanvas', () => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const game = rooms.get(roomId);
    if (!game || game.currentDrawer !== socket.id) return;

    game.drawingData = [];
    io.to(roomId).emit('clearCanvas');
  });

  // Chat / guess
  socket.on('chatMessage', (message) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    const game = rooms.get(roomId);
    if (!game) return;

    const player = game.players.get(socket.id);
    if (!player) return;

    // Check if it's a correct guess
    if (game.state === 'drawing' && socket.id !== game.currentDrawer) {
      const result = game.checkGuess(socket.id, message);

      if (result && result.correct) {
        // Notify everyone that player guessed correctly
        io.to(roomId).emit('correctGuess', {
          playerName: result.playerName,
          playerId: socket.id,
          score: result.score
        });
        io.to(roomId).emit('playerList', game.getPlayerList());

        if (result.allGuessed) {
          endTurn(roomId, game, true);
        }
        return;
      }

      if (result && result.close) {
        socket.emit('closeGuess', { message: "You're close!" });
      }
    }

    // Regular chat message (but hide if it contains the word)
    if (game.currentWord && message.toLowerCase().includes(game.currentWord.toLowerCase())) {
      socket.emit('systemMessage', { message: "Your message contained the answer!" });
      return;
    }

    io.to(roomId).emit('chatMessage', {
      playerName: player.name,
      playerId: socket.id,
      message,
      color: player.avatar
    });
  });

  // Disconnect — hold seat for reconnect grace period
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

    // Hold the seat for reconnection
    if (sessionId) {
      game.holdPlayerSeat(socket.id);
    }

    // Remove from active players
    game.removePlayer(socket.id);
    playerRooms.delete(socket.id);
    if (sessionId) sessionToSocket.delete(sessionId);

    io.to(roomId).emit('playerLeft', {
      playerName,
      players: game.getPlayerList(),
      mayReconnect: !!sessionId
    });

    if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
      game.clearTimers();
      rooms.delete(roomId);
      io.emit('roomList', getRoomList());
      return;
    }

    // Notify about new owner if ownership transferred
    if (wasOwner && game.owner) {
      io.to(roomId).emit('ownerUpdate', { owner: game.owner });
      const newOwnerPlayer = game.players.get(game.owner);
      io.to(roomId).emit('systemMessage', {
        message: `${newOwnerPlayer ? newOwnerPlayer.name : 'Someone'} is now the room owner`
      });
    }

    if (game.players.size < 2 && game.state !== 'waiting') {
      game.clearTimers();
      game.state = 'waiting';
      io.to(roomId).emit('gameReset', { message: 'Not enough players. Waiting for more...' });
    } else if (wasDrawer && (game.state === 'drawing' || game.state === 'choosing')) {
      endTurn(roomId, game, false);
    }

    io.to(roomId).emit('playerList', game.getPlayerList());
    console.log(`Player disconnected: ${playerName} (${socket.id})`);

    // Set grace period timer — fully remove held seat after timeout
    if (sessionId) {
      const timer = setTimeout(() => {
        disconnectTimers.delete(sessionId);
        if (game.disconnectedPlayers.has(sessionId)) {
          game.disconnectedPlayers.delete(sessionId);
          console.log(`Session expired: ${sessionId} (${playerName})`);
          // Clean up empty room
          if (game.players.size === 0 && game.disconnectedPlayers.size === 0) {
            game.clearTimers();
            rooms.delete(roomId);
            io.emit('roomList', getRoomList());
          }
        }
      }, RECONNECT_GRACE_PERIOD);
      disconnectTimers.set(sessionId, timer);
    }

    io.emit('roomList', getRoomList());
  });
});

function joinRoom(socket, roomId, playerName, sessionId) {
  const game = getOrCreateRoom(roomId);
  game.addPlayer(socket.id, playerName, sessionId);
  playerRooms.set(socket.id, roomId);
  if (sessionId) sessionToSocket.set(sessionId, socket.id);

  socket.join(roomId);

  // Build the joined payload
  const joinPayload = {
    roomId,
    players: game.getPlayerList(),
    state: game.state,
    isOwner: game.isOwner(socket.id),
    owner: game.owner
  };

  // If game is in progress, send current game state so late-joiner can spectate
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

  // Notify all about ownership
  io.to(roomId).emit('ownerUpdate', { owner: game.owner });
  io.to(roomId).emit('playerList', game.getPlayerList());

  // Broadcast updated room list to lobby
  io.emit('roomList', getRoomList());
}

function handleTurnEvent(roomId, game, result) {
  if (!result) return;

  if (result.event === 'gameOver') {
    io.to(roomId).emit('gameOver', { scores: result.scores });
    game.state = 'waiting';
    io.emit('roomList', getRoomList());
    return;
  }

  if (result.event === 'choosing') {
    io.to(roomId).emit('choosing', {
      drawer: result.drawer,
      drawerName: result.drawerName,
      roundNum: result.roundNum,
      maxRounds: result.maxRounds
    });

    // Send word choices only to drawer
    const drawerSocket = io.sockets.sockets.get(result.drawer);
    if (drawerSocket) {
      drawerSocket.emit('wordChoices', { choices: result.choices });
    }

    io.to(roomId).emit('playerList', game.getPlayerList());

    // Auto-select word if drawer doesn't choose in time
    game.chooseTimer = setTimeout(() => {
      if (game.state === 'choosing') {
        const randomWord = result.choices[Math.floor(Math.random() * result.choices.length)];
        const turnResult = game.selectWord(randomWord);

        io.to(roomId).emit('turnStart', {
          drawer: turnResult.drawer,
          drawerName: turnResult.drawerName,
          hint: turnResult.hint,
          wordLength: turnResult.wordLength,
          duration: turnResult.duration
        });

        if (drawerSocket) {
          drawerSocket.emit('yourWord', { word: randomWord });
        }

        io.to(roomId).emit('playerList', game.getPlayerList());
        startHintTimer(roomId, game);

        game.turnTimer = setTimeout(() => {
          endTurn(roomId, game, false);
        }, game.turnDuration * 1000);
      }
    }, game.chooseDuration * 1000);
  }
}

function startHintTimer(roomId, game) {
  const hintIntervals = [
    game.turnDuration * 0.4 * 1000,
    game.turnDuration * 0.65 * 1000
  ];

  hintIntervals.forEach((delay, index) => {
    setTimeout(() => {
      if (game.state === 'drawing' && game.currentWord) {
        const revealCount = Math.min(index + 1, game.hints.length);
        const hint = game.getPartialHint(revealCount);
        io.to(roomId).emit('hint', { hint });
      }
    }, delay);
  });
}

function endTurn(roomId, game, allGuessed) {
  game.clearTimers();

  // Reveal the word
  io.to(roomId).emit('turnEnd', {
    word: game.currentWord,
    allGuessed,
    scores: game.getPlayerList()
  });

  // Next turn after a delay
  setTimeout(() => {
    if (game.players.size >= 2) {
      const result = game.nextTurn();
      handleTurnEvent(roomId, game, result);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎨 Scribble Adults server running on http://localhost:${PORT}`);
});
