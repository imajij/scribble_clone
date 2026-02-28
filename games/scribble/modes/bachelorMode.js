// ========================================
// BACHELOR MODE — fast draw, no word choice
// ========================================
// Same draw & guess mechanics as Scribble but:
//   • Word is auto-assigned from the bachelor word list (no choosing phase)
//   • Turns are faster (60 s default)
//   • Rounds broadcast a "challenge" label so the client can style differently
//
// Interface (matches scribbleMode.js):
//   startRound(room)
//   handleEvent(room, socket, { event, data })
//   endRound(room, allGuessed)

// ----------------------------------------
// Bachelor word list — couples / party theme
// ----------------------------------------

const BACHELOR_WORDS = [
  // Party staples
  'veil', 'sash', 'tiara', 'bachelorette', 'groom', 'best man', 'maid of honour',
  'bouquet', 'ring', 'proposal', 'altar', 'aisle', 'vows', 'first dance',
  // Naughty party fun
  'stripper', 'party bus', 'limousine', 'Vegas', 'dare card', 'truth bomb',
  'body shot', 'lap dance', 'jello shot', 'cheers', 'confetti cannon',
  'photo booth', 'drunk dial', 'blindfold', 'penalty shot', 'spin the bottle',
  // Intimate couple moments
  'first kiss', 'honeymoon suite', 'skinny dip', 'morning after', 'love note',
  'bubble bath', 'hot tub', 'candlelight dinner', 'rose petals', 'silk sheets',
  // Challenges / actions
  'karaoke', 'twerk', 'pole dance', 'flasher', 'make out', 'slow grind',
  'belly roll', 'wink', 'flirt', 'cat walk', 'sexy pose', 'lip bite',
  // Wild card
  'handcuffs', 'feather boa', 'cowboy hat', 'garter toss', 'cake smash',
  'group hug', 'midnight swim', 'last night of freedom', 'matching outfits', 'couple selfie'
];

// ----------------------------------------
// startRound — assigns word directly, no choosing phase
// ----------------------------------------

function startRound(room) {
  // Initialise game state (reuses Game internals)
  room.roundNum = 0;
  room.turnOrder = [...room.players.keys()];
  _shuffle(room.turnOrder);
  room.turnIndex = -1;
  room.players.forEach(p => { p.score = 0; p.isDrawing = false; });

  _nextTurn(room);
}

// ----------------------------------------
// handleEvent
// ----------------------------------------

function handleEvent(room, socket, { event, data }) {
  const { nsp, roomId } = room;

  switch (event) {

    // Bachelor mode has no wordChosen event (word is auto-assigned)
    // but we accept it as a no-op so a generic client doesn't error.
    case 'wordChosen': break;

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
// endRound
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
    if (room.players.size >= 2) _nextTurn(room);
  }, 4000);
}

// ----------------------------------------
// Internal helpers
// ----------------------------------------

function _nextTurn(room) {
  const { nsp, roomId } = room;

  // Reset turn state
  room.clearTimers();
  room.drawingData = [];
  room.guessedPlayers.clear();
  room.currentWord = null;
  room.hints = [];
  room.players.forEach(p => { p.isDrawing = false; });

  room.turnIndex++;

  // Advance round when all players have drawn
  if (room.turnIndex >= room.turnOrder.length) {
    room.turnIndex = 0;
    room.roundNum++;

    if (room.roundNum >= room.maxRounds) {
      room.state = 'gameOver';
      nsp.to(roomId).emit('gameOver', { scores: room.getPlayerList() });
      room.state = 'waiting';
      nsp.emit('roomList', _getRoomList(room._rooms));
      return;
    }
  }

  // Skip drawer if they left
  room.currentDrawer = room.turnOrder[room.turnIndex];
  if (!room.players.has(room.currentDrawer)) {
    _nextTurn(room);
    return;
  }

  room.players.get(room.currentDrawer).isDrawing = true;

  // Auto-assign word (no choosing phase)
  const word = _pickWord(room);
  room.currentWord = word;
  room.state = 'drawing';
  room.turnStartTime = Date.now();
  room.hints = room.generateHints(word);

  const drawerPlayer = room.players.get(room.currentDrawer);

  // Tell all players the turn has started
  nsp.to(roomId).emit('turnStart', {
    drawer: room.currentDrawer,
    drawerName: drawerPlayer ? drawerPlayer.name : 'Unknown',
    hint: room.getBlankHint(word),
    wordLength: word.length,
    duration: room.turnDuration,
    roundNum: room.roundNum + 1,
    maxRounds: room.maxRounds,
    mode: 'bachelor'
  });

  // Tell the drawer their word privately
  const drawerSocket = nsp.sockets.get(room.currentDrawer);
  if (drawerSocket) drawerSocket.emit('yourWord', { word });

  nsp.to(roomId).emit('playerList', room.getPlayerList());

  _startHintTimer(nsp, roomId, room);
  room.turnTimer = setTimeout(() => endRound(room, false), room.turnDuration * 1000);
}

function _pickWord(room) {
  // Use custom words first; fall back to bachelor list
  if (room.useCustomWords && room.customWords.length > 0) {
    return room.customWords[Math.floor(Math.random() * room.customWords.length)];
  }
  return BACHELOR_WORDS[Math.floor(Math.random() * BACHELOR_WORDS.length)];
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

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

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
