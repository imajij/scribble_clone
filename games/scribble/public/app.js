// ========================================
// SCRIBBLE AFTER DARK - CLIENT APP
// ========================================

const socket = io('/scribble');
let drawingCanvas;
let myId = null;
let currentRoom = null;
let selectedRounds = 3;
let timerInterval = null;
let isDrawer = false;
let isOwner = false;
let roomOwner = null;

// Session persistence
function getSessionId() {
  let sid = sessionStorage.getItem('scribble_sessionId');
  if (!sid) {
    sid = (crypto.randomUUID && crypto.randomUUID()) ||
      ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));
    sessionStorage.setItem('scribble_sessionId', sid);
  }
  return sid;
}
const sessionId = getSessionId();

function saveSession(roomId, playerName) {
  sessionStorage.setItem('scribble_roomId', roomId);
  sessionStorage.setItem('scribble_playerName', playerName);
}

function clearSession() {
  sessionStorage.removeItem('scribble_roomId');
  sessionStorage.removeItem('scribble_playerName');
}

function getSavedSession() {
  const roomId = sessionStorage.getItem('scribble_roomId');
  const playerName = sessionStorage.getItem('scribble_playerName');
  if (roomId && playerName) return { roomId, playerName };
  return null;
}

// ========================================
// DOM ELEMENTS
// ========================================

const ageGate = document.getElementById('ageGate');
const ageConfirmBtn = document.getElementById('ageConfirmBtn');
const ageDenyBtn = document.getElementById('ageDenyBtn');

const lobbyScreen = document.getElementById('lobbyScreen');
const playerNameInput = document.getElementById('playerName');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const roundBtns = document.querySelectorAll('.round-btn');
const activeRoomsDiv = document.getElementById('activeRooms');
const roomListContainer = document.getElementById('roomListContainer');

const waitingScreen = document.getElementById('waitingScreen');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const waitingPlayers = document.getElementById('waitingPlayers');
const startGameBtn = document.getElementById('startGameBtn');
const playerCount = document.getElementById('playerCount');

const gameScreen = document.getElementById('gameScreen');
const playerList = document.getElementById('playerList');
const roundDisplay = document.getElementById('roundDisplay');
const maxRoundDisplay = document.getElementById('maxRoundDisplay');
const wordHint = document.getElementById('wordHint');
const timerDisplay = document.getElementById('timerDisplay');
const drawTools = document.getElementById('drawTools');
const wordChoiceOverlay = document.getElementById('wordChoiceOverlay');
const wordChoices = document.getElementById('wordChoices');
const drawingInfoOverlay = document.getElementById('drawingInfoOverlay');
const drawingInfoText = document.getElementById('drawingInfoText');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

const turnEndOverlay = document.getElementById('turnEndOverlay');
const turnEndTitle = document.getElementById('turnEndTitle');
const turnEndWord = document.getElementById('turnEndWord');
const turnEndScores = document.getElementById('turnEndScores');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScores = document.getElementById('finalScores');
const playAgainBtn = document.getElementById('playAgainBtn');

// ========================================
// AGE GATE
// ========================================

ageConfirmBtn.addEventListener('click', () => {
  sessionStorage.setItem('scribble_ageVerified', '1');
  ageGate.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  playerNameInput.focus();
});

// Skip age gate if already verified
if (sessionStorage.getItem('scribble_ageVerified') === '1') {
  ageGate.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
}

ageDenyBtn.addEventListener('click', () => {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;font-family:Nunito,sans-serif;color:#9b8ab8;">
      <div>
        <h2 style="font-size:2rem;margin-bottom:12px;">🚫 Sorry!</h2>
        <p>This game is for adults (18+) only.<br>Come back when you're older! 👋</p>
      </div>
    </div>
  `;
});

// ========================================
// LOBBY
// ========================================

roundBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    roundBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRounds = parseInt(btn.dataset.rounds);
  });
});

createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    playerNameInput.style.borderColor = '#ef4444';
    playerNameInput.focus();
    return;
  }
  socket.emit('createRoom', { playerName: name, rounds: selectedRounds, sessionId });
});

joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) {
    playerNameInput.style.borderColor = '#ef4444';
    playerNameInput.focus();
    return;
  }
  if (!code) {
    roomCodeInput.style.borderColor = '#ef4444';
    roomCodeInput.focus();
    return;
  }
  socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
});

playerNameInput.addEventListener('input', () => {
  playerNameInput.style.borderColor = '';
});

roomCodeInput.addEventListener('input', () => {
  roomCodeInput.style.borderColor = '';
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
});

// Enter key handlers
playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createRoomBtn.click();
});

roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoomBtn.click();
});

// ========================================
// WAITING ROOM
// ========================================

startGameBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

function updateWaitingPlayers(players) {
  // Allow calling without args to just refresh from DOM
  if (players) {
    updateWaitingPlayers._lastPlayers = players;
  } else {
    players = updateWaitingPlayers._lastPlayers || [];
  }

  waitingPlayers.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card';
    const ownerBadge = (p.id === roomOwner) ? '<span class="owner-badge">👑</span>' : '';
    card.innerHTML = `
      <div class="player-avatar" style="background:${p.avatar}">${p.name[0].toUpperCase()}</div>
      <span>${escapeHtml(p.name)} ${ownerBadge}</span>
    `;
    waitingPlayers.appendChild(card);
  });

  playerCount.textContent = players.length;
  updateStartButton(players.length);
}

function updateStartButton(count) {
  if (count === undefined) {
    const players = updateWaitingPlayers._lastPlayers || [];
    count = players.length;
  }

  if (isOwner) {
    startGameBtn.disabled = count < 2;
    startGameBtn.textContent = count < 2 ? 'Need 2+ players to start' : '🎨 Start Game!';
    startGameBtn.style.display = '';
  } else {
    startGameBtn.textContent = 'Waiting for host to start...';
    startGameBtn.disabled = true;
    startGameBtn.style.display = '';
  }
}

// ========================================
// SOCKET EVENTS
// ========================================

socket.on('connect', () => {
  myId = socket.id;

  // Attempt reconnection if we have saved session data
  const saved = getSavedSession();
  if (saved) {
    socket.emit('reconnectSession', {
      sessionId,
      roomId: saved.roomId,
      playerName: saved.playerName
    });
  }
});

socket.on('reconnectFailed', () => {
  // Session couldn't reconnect — clear stale data and show lobby
  clearSession();
});

socket.on('playerReconnected', ({ playerName, players }) => {
  addSystemMessage(`${playerName} reconnected! 🔄`);
  updateWaitingPlayers(players);
  updatePlayerList(players);
});

socket.on('roomList', (rooms) => {
  renderRoomList(rooms);
});

function renderRoomList(rooms) {
  if (!rooms || rooms.length === 0) {
    activeRoomsDiv.classList.add('hidden');
    return;
  }
  activeRoomsDiv.classList.remove('hidden');
  roomListContainer.innerHTML = '';
  rooms.forEach(room => {
    const stateLabel = room.state === 'waiting' ? 'Waiting' : 'Playing';
    const stateClass = room.state === 'waiting' ? 'waiting' : 'playing';
    const item = document.createElement('div');
    item.className = 'room-list-item';
    item.innerHTML = `
      <div class="room-info">
        <div class="room-id">${room.id}</div>
        <div class="room-meta">${room.players}/8 players &middot; <span class="room-state-badge ${stateClass}">${stateLabel}</span></div>
      </div>
      <button class="btn btn-secondary room-join-btn" data-room="${room.id}">Join</button>
    `;
    roomListContainer.appendChild(item);
  });

  // Attach join handlers
  roomListContainer.querySelectorAll('.room-join-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = playerNameInput.value.trim();
      if (!name) {
        playerNameInput.style.borderColor = '#ef4444';
        playerNameInput.focus();
        return;
      }
      socket.emit('joinRoom', { roomId: btn.dataset.room, playerName: name, sessionId });
    });
  });
}

socket.on('joinedRoom', ({ roomId, players, state, isOwner: owner, owner: ownerId, gameState, reconnected }) => {
  currentRoom = roomId;
  isOwner = owner;
  roomOwner = ownerId;

  // Save session for reconnect persistence
  const savedName = getSavedSession()?.playerName || playerNameInput.value.trim();
  saveSession(roomId, savedName);

  // Skip age gate on reconnect
  ageGate.classList.add('hidden');
  lobbyScreen.classList.add('hidden');

  if (gameState && state !== 'waiting') {
    // Joining an ongoing game — go straight to game screen
    showGameScreen();
    roundDisplay.textContent = gameState.roundNum;
    maxRoundDisplay.textContent = gameState.maxRounds;
    isDrawer = false;
    drawingCanvas.disable();
    drawingCanvas.clear();
    hideOverlays();
    drawTools.classList.add('hidden');

    if (gameState.isChoosing) {
      wordHint.textContent = `${gameState.drawerName} is choosing a word...`;
      showDrawingInfo(`${gameState.drawerName} is choosing a word...`);
    } else {
      wordHint.textContent = gameState.hint;
      chatInput.disabled = false;
      chatInput.placeholder = 'Type your guess...';
      chatInput.focus();
      if (gameState.remainingTime > 0) {
        startTimer(gameState.remainingTime);
      }
      // Replay drawing data
      if (gameState.drawingData && gameState.drawingData.length > 0) {
        gameState.drawingData.forEach(data => {
          drawingCanvas.remoteDrawing(data);
        });
      }
    }

    updatePlayerList(players);
    addSystemMessage('You joined an ongoing game — spectate this round!');
  } else {
    // Waiting room (game not started, or game ended/reset)
    waitingScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    roomCodeDisplay.textContent = roomId;
    updateWaitingPlayers(players);
    updateStartButton(players.length);
  }
});

socket.on('playerJoined', ({ playerName, players }) => {
  updateWaitingPlayers(players);
  updateStartButton(players.length);
  addSystemMessage(`${playerName} joined the room! 🎉`);
});

socket.on('playerLeft', ({ playerName, players, mayReconnect }) => {
  updateWaitingPlayers(players);
  updatePlayerList(players);
  updateStartButton(players.length);
  if (mayReconnect) {
    addSystemMessage(`${playerName} disconnected — waiting for reconnect... ⏳`);
  } else {
    addSystemMessage(`${playerName} left the room 👋`);
  }
});

socket.on('ownerUpdate', ({ owner: ownerId }) => {
  roomOwner = ownerId;
  isOwner = (ownerId === myId);
  updateStartButton();
  updateWaitingPlayers(); // re-render badges
});

socket.on('playerList', (players) => {
  updatePlayerList(players);
});

socket.on('error', ({ message }) => {
  alert(message);
});

// ========================================
// GAME EVENTS
// ========================================

socket.on('choosing', ({ drawer, drawerName, roundNum, maxRounds }) => {
  showGameScreen();
  roundDisplay.textContent = roundNum;
  maxRoundDisplay.textContent = maxRounds;

  isDrawer = drawer === myId;
  drawingCanvas.disable();
  drawingCanvas.clear();
  hideOverlays();

  if (isDrawer) {
    wordHint.textContent = 'Choose a word!';
    drawTools.classList.add('hidden');
  } else {
    wordHint.textContent = `${drawerName} is choosing a word...`;
    drawTools.classList.add('hidden');
    showDrawingInfo(`${drawerName} is choosing a word...`);
  }

  clearTimer();
});

socket.on('wordChoices', ({ choices }) => {
  wordChoiceOverlay.classList.remove('hidden');
  wordChoices.innerHTML = '';
  choices.forEach(word => {
    const btn = document.createElement('button');
    btn.className = 'word-choice-btn';
    btn.textContent = word;
    btn.addEventListener('click', () => {
      socket.emit('wordChosen', word);
      wordChoiceOverlay.classList.add('hidden');
    });
    wordChoices.appendChild(btn);
  });
});

socket.on('yourWord', ({ word }) => {
  wordHint.textContent = word;
  drawTools.classList.remove('hidden');
  drawingCanvas.enable();
  drawingCanvas.clear();
  drawingCanvas.resizeCanvas();
  hideOverlays();
});

socket.on('turnStart', ({ drawer, drawerName, hint, duration }) => {
  showGameScreen();
  isDrawer = drawer === myId;
  hideOverlays();

  if (!isDrawer) {
    wordHint.textContent = hint;
    drawingCanvas.disable();
    drawingCanvas.clear();
    drawTools.classList.add('hidden');
    chatInput.disabled = false;
    chatInput.placeholder = 'Type your guess...';
    chatInput.focus();
  } else {
    chatInput.disabled = true;
    chatInput.placeholder = "You're drawing!";
  }

  startTimer(duration);
  addSystemMessage(`🎨 ${drawerName} is drawing!`);
});

socket.on('hint', ({ hint }) => {
  if (!isDrawer) {
    wordHint.textContent = hint;
  }
});

socket.on('draw', (data) => {
  drawingCanvas.remoteDrawing(data);
});

socket.on('clearCanvas', () => {
  drawingCanvas.clear();
});

socket.on('correctGuess', ({ playerName, playerId, score }) => {
  addCorrectMessage(`🎉 ${playerName} guessed correctly! (+${score})`);
  if (playerId === myId) {
    chatInput.disabled = true;
    chatInput.placeholder = 'You guessed it! 🎉';
  }
});

socket.on('closeGuess', ({ message }) => {
  addCloseMessage(message);
});

socket.on('systemMessage', ({ message }) => {
  addSystemMessage(message);
});

socket.on('chatMessage', ({ playerName, message, color }) => {
  addChatMessage(playerName, message, color);
});

socket.on('turnEnd', ({ word, allGuessed, scores }) => {
  clearTimer();
  drawingCanvas.disable();

  turnEndTitle.textContent = allGuessed ? '🎉 Everyone guessed it!' : '⏰ Time\'s up!';
  turnEndWord.textContent = word;
  turnEndScores.innerHTML = '';

  const medals = ['🥇', '🥈', '🥉'];
  scores.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `
      <span class="rank">${medals[i] || (i + 1)}</span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="points">${p.score} pts</span>
    `;
    turnEndScores.appendChild(row);
  });

  turnEndOverlay.classList.remove('hidden');
  addSystemMessage(`The word was: ${word}`);

  setTimeout(() => {
    turnEndOverlay.classList.add('hidden');
  }, 3500);
});

socket.on('gameOver', ({ scores }) => {
  clearTimer();
  turnEndOverlay.classList.add('hidden');

  finalScores.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  scores.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `
      <span class="rank">${medals[i] || (i + 1)}</span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="points">${p.score} pts</span>
    `;
    finalScores.appendChild(row);
  });

  gameOverOverlay.classList.remove('hidden');
});

socket.on('gameReset', ({ message, players }) => {
  addSystemMessage(message);
  hideOverlays();
  clearTimer();
  if (drawingCanvas) {
    drawingCanvas.disable();
    drawingCanvas.clear();
  }
  drawTools.classList.add('hidden');

  // Transition back to waiting screen so host can start a new game
  gameScreen.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  waitingScreen.classList.remove('hidden');
  roomCodeDisplay.textContent = currentRoom;
  if (players) {
    updateWaitingPlayers(players);
  } else {
    updateWaitingPlayers(); // re-render from cached list
  }
  updateStartButton();
});

playAgainBtn.addEventListener('click', () => {
  gameOverOverlay.classList.add('hidden');
  // Go back to waiting screen
  gameScreen.classList.add('hidden');
  waitingScreen.classList.remove('hidden');
  updateStartButton();
});

// Leave room button — clear session so we don't auto-reconnect
window.addEventListener('beforeunload', () => {
  // Don't clear — we WANT to reconnect on reload
});

// ========================================
// CHAT
// ========================================

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim()) {
    socket.emit('chatMessage', chatInput.value.trim());
    chatInput.value = '';
  }
});

sendBtn.addEventListener('click', () => {
  if (chatInput.value.trim()) {
    socket.emit('chatMessage', chatInput.value.trim());
    chatInput.value = '';
  }
});

function addChatMessage(name, message, color) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="sender" style="color:${color}">${escapeHtml(name)}:</span> ${escapeHtml(message)}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
  const div = document.createElement('div');
  div.className = 'chat-msg system';
  div.textContent = message;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addCorrectMessage(message) {
  const div = document.createElement('div');
  div.className = 'chat-msg correct';
  div.textContent = message;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addCloseMessage(message) {
  const div = document.createElement('div');
  div.className = 'chat-msg close-guess';
  div.textContent = message;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ========================================
// DRAWING TOOLS
// ========================================

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawingCanvas.setColor(btn.dataset.color);
    document.getElementById('eraserBtn').classList.remove('active');
    drawingCanvas.setTool('brush');
    document.getElementById('fillBtn').classList.remove('active');
  });
});

document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawingCanvas.setBrushSize(parseInt(btn.dataset.size));
  });
});

document.getElementById('eraserBtn').addEventListener('click', () => {
  const btn = document.getElementById('eraserBtn');
  const fillBtn = document.getElementById('fillBtn');
  const isActive = btn.classList.contains('active');
  btn.classList.toggle('active');
  fillBtn.classList.remove('active');
  drawingCanvas.setTool(isActive ? 'brush' : 'eraser');
});

document.getElementById('fillBtn').addEventListener('click', () => {
  const btn = document.getElementById('fillBtn');
  const eraserBtn = document.getElementById('eraserBtn');
  const isActive = btn.classList.contains('active');
  btn.classList.toggle('active');
  eraserBtn.classList.remove('active');
  drawingCanvas.setTool(isActive ? 'brush' : 'fill');
});

document.getElementById('undoBtn').addEventListener('click', () => {
  drawingCanvas.undo();
});

document.getElementById('clearBtn').addEventListener('click', () => {
  drawingCanvas.clear();
  socket.emit('clearCanvas');
});

// ========================================
// HELPERS
// ========================================

function showGameScreen() {
  lobbyScreen.classList.add('hidden');
  waitingScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  if (!drawingCanvas) {
    drawingCanvas = new DrawingCanvas('drawCanvas', socket);
  }
  drawingCanvas.resizeCanvas();
}

function updatePlayerList(players) {
  if (!playerList) return;
  playerList.innerHTML = '';
  players.forEach((p, i) => {
    const item = document.createElement('div');
    let classes = 'player-item';
    if (p.isDrawing) classes += ' drawing';
    item.className = classes;
    item.innerHTML = `
      <div class="avatar" style="background:${p.avatar}">${p.name[0].toUpperCase()}</div>
      <div class="info">
        <div class="name">${escapeHtml(p.name)}${p.id === myId ? ' (You)' : ''}</div>
        <div class="score">${p.score} pts</div>
      </div>
      ${p.isDrawing ? '<span class="drawing-icon">🖊️</span>' : ''}
    `;
    playerList.appendChild(item);
  });
}

function startTimer(duration) {
  clearTimer();
  let timeLeft = duration;
  timerDisplay.textContent = timeLeft;
  timerDisplay.className = 'timer';

  timerInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft;

    if (timeLeft <= 10) {
      timerDisplay.className = 'timer danger';
    } else if (timeLeft <= 30) {
      timerDisplay.className = 'timer warning';
    }

    if (timeLeft <= 0) {
      clearTimer();
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function hideOverlays() {
  wordChoiceOverlay.classList.add('hidden');
  drawingInfoOverlay.classList.add('hidden');
}

function showDrawingInfo(text) {
  drawingInfoText.textContent = text;
  drawingInfoOverlay.classList.remove('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
