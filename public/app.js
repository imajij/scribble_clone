// ========================================
// SCRIBBLE AFTER DARK - CLIENT APP
// ========================================

const socket = io();
let drawingCanvas;
let myId = null;
let currentRoom = null;
let selectedRounds = 3;
let timerInterval = null;
let isDrawer = false;

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
  ageGate.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  playerNameInput.focus();
});

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
  socket.emit('createRoom', { playerName: name, rounds: selectedRounds });
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
  socket.emit('joinRoom', { roomId: code, playerName: name });
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
  waitingPlayers.innerHTML = '';
  players.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.innerHTML = `
      <div class="player-avatar" style="background:${p.avatar}">${p.name[0].toUpperCase()}</div>
      <span>${escapeHtml(p.name)}</span>
    `;
    waitingPlayers.appendChild(card);
  });

  playerCount.textContent = players.length;
  startGameBtn.disabled = players.length < 2;
  startGameBtn.textContent = players.length < 2
    ? 'Need 2+ players to start'
    : '🎨 Start Game!';
}

// ========================================
// SOCKET EVENTS
// ========================================

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('joinedRoom', ({ roomId, players, state }) => {
  currentRoom = roomId;
  lobbyScreen.classList.add('hidden');
  waitingScreen.classList.remove('hidden');
  roomCodeDisplay.textContent = roomId;
  updateWaitingPlayers(players);
});

socket.on('playerJoined', ({ playerName, players }) => {
  updateWaitingPlayers(players);
  addSystemMessage(`${playerName} joined the room! 🎉`);
});

socket.on('playerLeft', ({ playerName, players }) => {
  updateWaitingPlayers(players);
  updatePlayerList(players);
  addSystemMessage(`${playerName} left the room 👋`);
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

socket.on('gameReset', ({ message }) => {
  addSystemMessage(message);
  hideOverlays();
  clearTimer();
  drawingCanvas.disable();
  drawingCanvas.clear();
  wordHint.textContent = 'Waiting for players...';
  drawTools.classList.add('hidden');
});

playAgainBtn.addEventListener('click', () => {
  gameOverOverlay.classList.add('hidden');
  // Go back to waiting screen
  gameScreen.classList.add('hidden');
  waitingScreen.classList.remove('hidden');
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
