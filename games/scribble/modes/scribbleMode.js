// ========================================
// SCRIBBLE MODE — draw & guess
// ========================================
// Implements the standard Scribble After Dark rules:
//   1. Drawer picks a word from 3 choices (choosing phase)
//   2. Others guess within the turn duration
//   3. Scores awarded based on guess speed
//
// Interface consumed by socket.js:
//   startRound(room)              — kick off the game (first turn)
//   handleEvent(room, socket, { event, data })  — route a socket event
//   endRound(room, allGuessed)    — close current turn, queue next

// ----------------------------------------
// startRound
// ----------------------------------------

function startRound(room) {
  const result = room.startGame();
  _handleTurnResult(room, result);
}

// ----------------------------------------
// handleEvent
// ----------------------------------------

function handleEvent(room, socket, { event, data }) {
  const { nsp, roomId } = room;

  switch (event) {

    case 'wordChosen': {
      if (room.state !== 'choosing' || room.currentDrawer !== socket.id) return;
      const chosen = (typeof data === 'string' ? data : '')
        .trim().replace(/[\r\n\t]/g, ' ').substring(0, 50);
      if (!chosen) return;

      room.clearTimers();
      const result = room.selectWord(chosen);

      nsp.to(roomId).emit('turnStart', {
        drawer: result.drawer,
        drawerName: result.drawerName,
        hint: result.hint,
        wordLength: result.wordLength,
        duration: result.duration
      });
      socket.emit('yourWord', { word: chosen });
      nsp.to(roomId).emit('playerList', room.getPlayerList());

      _startHintTimer(nsp, roomId, room);
      room.turnTimer = setTimeout(() => endRound(room, false), room.turnDuration * 1000);
      break;
    }

    case 'draw': {
      if (room.currentDrawer !== socket.id || room.state !== 'drawing') return;
      room.drawingData.push(data);
      socket.to(roomId).emit('draw', data);
      break;
    }

    case 'clearCanvas': {
      if (room.currentDrawer !== socket.id) return;
      room.drawingData = [];
      nsp.to(roomId).emit('clearCanvas');
      break;
    }

    case 'chatMessage': {
      const player = room.players.get(socket.id);
      if (!player) return;

      if (room.state === 'drawing' && socket.id !== room.currentDrawer) {
        const result = room.checkGuess(socket.id, data);

        if (result && result.correct) {
          nsp.to(roomId).emit('correctGuess', {
            playerName: result.playerName,
            playerId: socket.id,
            score: result.score
          });
          nsp.to(roomId).emit('playerList', room.getPlayerList());
          if (result.allGuessed) endRound(room, true);
          return;
        }

        if (result && result.close) {
          socket.emit('closeGuess', { message: "You're close!" });
        }
      }

      if (room.currentWord && data.toLowerCase().includes(room.currentWord.toLowerCase())) {
        socket.emit('systemMessage', { message: 'Your message contained the answer!' });
        return;
      }

      nsp.to(roomId).emit('chatMessage', {
        playerName: player.name,
        playerId: socket.id,
        message: data,
        color: player.avatar
      });
      break;
    }
  }
}

// ----------------------------------------
// endRound — close current turn, queue next
// ----------------------------------------

function endRound(room, allGuessed) {
  const { nsp, roomId } = room;
  room.clearTimers();

  nsp.to(roomId).emit('turnEnd', {
    word: room.currentWord,
    allGuessed,
    scores: room.getPlayerList()
  });

  setTimeout(() => {
    if (room.players.size >= 2) {
      const result = room.nextTurn();
      _handleTurnResult(room, result);
    }
  }, 4000);
}

// ----------------------------------------
// Internal helpers
// ----------------------------------------

function _handleTurnResult(room, result) {
  const { nsp, roomId } = room;
  if (!result) return;

  if (result.event === 'gameOver') {
    nsp.to(roomId).emit('gameOver', { scores: result.scores });
    room.state = 'waiting';
    nsp.emit('roomList', _getRoomList(room._rooms));
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
    if (drawerSocket) drawerSocket.emit('wordChoices', { choices: result.choices });

    nsp.to(roomId).emit('playerList', room.getPlayerList());

    room.chooseTimer = setTimeout(() => {
      if (room.state === 'choosing') {
        const randomWord = result.choices[Math.floor(Math.random() * result.choices.length)];
        const turnResult = room.selectWord(randomWord);

        nsp.to(roomId).emit('turnStart', {
          drawer: turnResult.drawer,
          drawerName: turnResult.drawerName,
          hint: turnResult.hint,
          wordLength: turnResult.wordLength,
          duration: turnResult.duration
        });

        if (drawerSocket) drawerSocket.emit('yourWord', { word: randomWord });

        nsp.to(roomId).emit('playerList', room.getPlayerList());
        _startHintTimer(nsp, roomId, room);

        room.turnTimer = setTimeout(() => endRound(room, false), room.turnDuration * 1000);
      }
    }, room.chooseDuration * 1000);
  }
}

function _startHintTimer(nsp, roomId, room) {
  const intervals = [
    room.turnDuration * 0.4 * 1000,
    room.turnDuration * 0.65 * 1000
  ];
  intervals.forEach((delay, index) => {
    setTimeout(() => {
      if (room.state === 'drawing' && room.currentWord) {
        nsp.to(roomId).emit('hint', { hint: room.getPartialHint(index + 1) });
      }
    }, delay);
  });
}

// Passed in from socket.js rooms Map for gameOver broadcast
function _getRoomList(rooms) {
  if (!rooms) return [];
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

module.exports = { startRound, handleEvent, endRound };
