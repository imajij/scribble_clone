// ============================================================
// THIS OR THAT — Client
// ============================================================
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => el.classList.remove('hidden');
  const hide = el => el.classList.add('hidden');
  const MEDALS = ['🥇', '🥈', '🥉'];

  // ── Session ──
  let sessionId = sessionStorage.getItem('tot2-session');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('tot2-session', sessionId);
  }
  let currentRoom = sessionStorage.getItem('tot2-room');
  let myName = sessionStorage.getItem('tot2-name') || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let timerInterval = null;
  let myVote = null;

  // ── Settings ──
  let selectedRounds = 5;
  let selectedHeat = 2;

  // ── Socket ──
  const socket = io('/this-or-that');

  // ── Init ──
  if (myName) $('#playerName').value = myName;

  // ═══════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════

  $$('.sel-btn[data-rounds]').forEach(b => b.addEventListener('click', () => {
    $$('.sel-btn[data-rounds]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedRounds = +b.dataset.rounds;
  }));

  $$('.heat-btn').forEach(b => b.addEventListener('click', () => {
    $$('.heat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedHeat = +b.dataset.heat;
  }));

  $('#createRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    if (!name) return alert('Enter your name first!');
    myName = name;
    sessionStorage.setItem('tot2-name', name);
    socket.emit('createRoom', { playerName: name, rounds: selectedRounds, heat: selectedHeat, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    const code = $('#roomCodeInput').value.trim().toUpperCase();
    if (!name) return alert('Enter your name first!');
    if (!code) return alert('Enter a room code!');
    myName = name;
    sessionStorage.setItem('tot2-name', name);
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  // ═══════════════════════════════════════════
  // Waiting Room
  // ═══════════════════════════════════════════

  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));

  // ═══════════════════════════════════════════
  // Vote Buttons
  // ═══════════════════════════════════════════

  $('#voteBtnA').addEventListener('click', () => castVote('A'));
  $('#voteBtnB').addEventListener('click', () => castVote('B'));

  function castVote(choice) {
    if (myVote) return;
    myVote = choice;
    socket.emit('vote', { choice });
    if (choice === 'A') {
      $('#voteBtnA').classList.add('selected');
      $('#voteBtnB').disabled = true;
    } else {
      $('#voteBtnB').classList.add('selected');
      $('#voteBtnA').disabled = true;
    }
  }

  // ═══════════════════════════════════════════
  // Chat
  // ═══════════════════════════════════════════

  function sendChat() {
    const input = $('#chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('chatMessage', { message: msg });
    input.value = '';
  }
  $('#sendBtn').addEventListener('click', sendChat);
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  // ═══════════════════════════════════════════
  // Play Again
  // ═══════════════════════════════════════════

  $('#playAgainBtn').addEventListener('click', () => socket.emit('playAgain'));

  // ═══════════════════════════════════════════
  // Socket Events
  // ═══════════════════════════════════════════

  socket.on('joinedRoom', (data) => {
    myId = data.playerId;
    currentRoom = data.roomId;
    sessionStorage.setItem('tot2-room', data.roomId);

    if (data.state === 'waiting') {
      showScreen('waiting');
      $('#roomCodeDisplay').textContent = data.roomId;
      renderWaitingPlayers(data.players);
      updateStartBtn(data.players.length, data.owner);
    } else if (data.state === 'voting' && data.currentQuestion) {
      showScreen('game');
      showVoting(data.currentQuestion, data.roundNum, data.maxRounds);
    }
  });

  socket.on('playerJoined', ({ players }) => {
    renderWaitingPlayers(players);
    addSystemMsg('A new player joined!');
  });

  socket.on('playerLeft', ({ playerName, players }) => {
    renderWaitingPlayers(players);
    addSystemMsg(`${playerName} left`);
  });

  socket.on('playerReconnected', ({ playerName }) => {
    addSystemMsg(`${playerName} reconnected`);
  });

  socket.on('playerDisconnected', ({ playerName }) => {
    addSystemMsg(`${playerName} disconnected...`);
  });

  socket.on('ownerUpdate', ({ owner }) => {
    isOwner = (owner === myId);
    // Update start button visibility
    const players = document.querySelectorAll('.player-chip');
    updateStartBtn(players.length, owner);
  });

  socket.on('playerList', (players) => {
    renderWaitingPlayers(players);
    renderGamePlayers(players);
  });

  socket.on('newRound', (data) => {
    showScreen('game');
    showVoting(data.question, data.roundNum, data.maxRounds);
    startTimer(data.voteDuration);
  });

  socket.on('voteProgress', ({ voted, total }) => {
    $('#voteStatus').textContent = `${voted}/${total} voted`;
    // Update player list — mark voted
    $$('.player-item').forEach(el => {
      // We can't know who voted, just update generic status
    });
  });

  socket.on('roundResults', (data) => {
    clearTimer();
    showResults(data);
  });

  socket.on('gameOver', ({ results }) => {
    clearTimer();
    showGameOver(results);
  });

  socket.on('backToLobby', ({ players }) => {
    hide($('#gameOverOverlay'));
    showScreen('waiting');
    renderWaitingPlayers(players);
  });

  socket.on('chatMessage', ({ name, message }) => {
    addChatMsg(name, message);
  });

  socket.on('error', ({ message }) => {
    alert(message);
  });

  socket.on('roomList', (rooms) => {
    renderRoomList(rooms);
  });

  // ── Reconnect on connect ──
  socket.on('connect', () => {
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem('tot2-room');
    showScreen('lobby');
  });

  // ═══════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════

  function showScreen(name) {
    hide($('#lobbyScreen'));
    hide($('#waitingScreen'));
    hide($('#gameScreen'));
    hide($('#gameOverOverlay'));
    if (name === 'lobby') show($('#lobbyScreen'));
    else if (name === 'waiting') show($('#waitingScreen'));
    else if (name === 'game') show($('#gameScreen'));
  }

  function renderWaitingPlayers(players) {
    const grid = $('#waitingPlayers');
    if (!grid) return;
    grid.innerHTML = players.map(p =>
      `<div class="player-chip${p.isOwner ? ' owner' : ''}">${p.isOwner ? '👑 ' : ''}${esc(p.name)}</div>`
    ).join('');
    const countEl = $('#playerCount');
    if (countEl) countEl.textContent = players.length;
    updateStartBtn(players.length, null);
  }

  function updateStartBtn(count, owner) {
    const btn = $('#startGameBtn');
    if (!btn) return;
    if (count >= 2 && isOwner) {
      btn.disabled = false;
      btn.textContent = '🚀 Start Game!';
    } else if (count < 2) {
      btn.disabled = true;
      btn.textContent = 'Need 2+ players to start';
    } else {
      btn.disabled = true;
      btn.textContent = 'Waiting for host to start...';
    }
  }

  function renderGamePlayers(players) {
    const list = $('#playerList');
    if (!list) return;
    list.innerHTML = players.map(p => {
      const streakTxt = p.streak >= 3 ? `<span class="streak-badge">🔥${p.streak}</span>` : '';
      return `<div class="player-item" data-id="${p.id}">` +
        `<span class="player-name">${p.isOwner ? '👑 ' : ''}${esc(p.name)}</span>` +
        `<span class="player-score">${p.score}${streakTxt}</span>` +
        `</div>`;
    }).join('');
  }

  function showVoting(question, roundNum, maxRounds) {
    myVote = null;

    // Update round info
    $('#roundDisplay').textContent = roundNum;
    $('#maxRoundDisplay').textContent = maxRounds;
    $('#phaseLabel').textContent = 'Vote!';

    // Question
    show($('#votingPhase'));
    hide($('#resultsPhase'));
    $('#questionText').textContent = question.text;

    const heatLabels = { 1: 'Mild', 2: 'Spicy 🌶️', 3: 'Extreme 🔥' };
    const heatClasses = { 1: 'mild', 2: 'spicy', 3: 'extreme' };
    const badge = $('#questionBadge');
    badge.textContent = heatLabels[question.heat] || 'Spicy';
    badge.className = 'q-badge ' + (heatClasses[question.heat] || 'spicy');

    // Vote buttons
    const btnA = $('#voteBtnA');
    const btnB = $('#voteBtnB');
    btnA.querySelector('.vote-option-text').textContent = question.optionA;
    btnB.querySelector('.vote-option-text').textContent = question.optionB;
    btnA.classList.remove('selected');
    btnB.classList.remove('selected');
    btnA.disabled = false;
    btnB.disabled = false;

    $('#voteStatus').textContent = '0/' + 0 + ' voted';
  }

  function showResults(data) {
    hide($('#votingPhase'));
    show($('#resultsPhase'));
    $('#phaseLabel').textContent = 'Results';

    // Bars
    const barA = $('#resultBarA');
    const barB = $('#resultBarB');
    $('#resultPercentA').textContent = data.percentA + '%';
    $('#resultPercentB').textContent = data.percentB + '%';
    $('#resultTextA').textContent = data.question.optionA;
    $('#resultTextB').textContent = data.question.optionB;
    $('#resultVotersA').textContent = data.voterNames.A.join(', ') || 'No votes';
    $('#resultVotersB').textContent = data.voterNames.B.join(', ') || 'No votes';

    barA.classList.toggle('winner', data.majority === 'A');
    barB.classList.toggle('winner', data.majority === 'B');

    // Majority label
    const majorLabel = $('#majorityLabel');
    if (data.majority === 'tie') {
      majorLabel.textContent = "🤝 It's a TIE!";
      majorLabel.className = 'majority-label tie';
    } else if (data.majority === 'A') {
      majorLabel.textContent = '⬅️ ' + data.question.optionA + ' wins!';
      majorLabel.className = 'majority-label a';
    } else {
      majorLabel.textContent = data.question.optionB + ' wins! ➡️';
      majorLabel.className = 'majority-label b';
    }

    // Score breakdown
    const scoresEl = $('#resultScores');
    scoresEl.innerHTML = data.playerResults.map(p => {
      const choiceIcon = p.choice === 'A' ? '🔵' : p.choice === 'B' ? '🩷' : '⬜';
      const bonusTxt = p.speedBonus ? ' ⚡' : '';
      return `<div class="result-score-row">` +
        `<span>${choiceIcon} ${esc(p.name)}</span>` +
        `<span class="result-pts${p.points === 0 ? ' zero' : ''}">+${p.points}${bonusTxt}</span>` +
        `</div>`;
    }).join('');

    // Update player list sidebar
    renderGamePlayers(data.playerResults.map(p => ({
      id: p.id, name: p.name, score: p.totalScore, streak: p.streak, isOwner: false
    })));
  }

  function showGameOver(results) {
    const overlay = $('#gameOverOverlay');
    show(overlay);
    const scoresEl = $('#finalScores');
    scoresEl.innerHTML = results.map((p, i) => {
      const medal = MEDALS[i] || `#${i + 1}`;
      return `<div class="final-score-row">` +
        `<span><span class="final-rank">${medal}</span> ${esc(p.name)}</span>` +
        `<span class="final-pts">${p.score}</span>` +
        `</div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════
  // Timer
  // ═══════════════════════════════════════════

  function startTimer(seconds) {
    clearTimer();
    let remaining = seconds;
    const display = $('#timerDisplay');
    display.textContent = remaining;
    display.classList.remove('urgent');
    timerInterval = setInterval(() => {
      remaining--;
      display.textContent = Math.max(0, remaining);
      if (remaining <= 5) display.classList.add('urgent');
      if (remaining <= 0) clearTimer();
    }, 1000);
  }

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    const display = $('#timerDisplay');
    if (display) display.classList.remove('urgent');
  }

  // ═══════════════════════════════════════════
  // Chat helpers
  // ═══════════════════════════════════════════

  function addSystemMsg(text) {
    const d = document.createElement('div');
    d.className = 'chat-msg system-msg';
    d.textContent = text;
    appendChat(d);
  }

  function addChatMsg(name, msg) {
    const d = document.createElement('div');
    d.className = 'chat-msg';
    d.innerHTML = `<span class="msg-name">${esc(name)}:</span> ${esc(msg)}`;
    appendChat(d);
  }

  function appendChat(el) {
    const c = $('#chatMessages');
    if (!c) return;
    c.appendChild(el);
    c.scrollTop = c.scrollHeight;
    while (c.children.length > 100) c.removeChild(c.firstChild);
  }

  function renderRoomList(rooms) {
    const container = $('#roomListContainer');
    const wrapper = $('#activeRooms');
    if (!container || !wrapper) return;
    if (rooms.length === 0) { hide(wrapper); return; }
    show(wrapper);
    container.innerHTML = rooms.map(r =>
      `<div class="room-list-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:rgba(0,0,0,.2);border-radius:10px;cursor:pointer" data-room="${r.id}">` +
      `<span>${r.id} · ${r.players} player${r.players !== 1 ? 's' : ''}</span>` +
      `<button class="btn btn-secondary" style="padding:6px 16px;font-size:.85rem">Join</button>` +
      `</div>`
    ).join('');

    container.querySelectorAll('[data-room]').forEach(el => {
      el.addEventListener('click', () => {
        const name = $('#playerName').value.trim();
        if (!name) return alert('Enter your name first!');
        myName = name;
        sessionStorage.setItem('tot2-name', name);
        socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
      });
    });
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ── SPA Cleanup ──
  window.__gameCleanup = function () {
    socket.disconnect();
    clearTimer();
  };
})();
