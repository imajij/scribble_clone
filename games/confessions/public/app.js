// ============================================================
// CONFESSIONS — Client
// ============================================================
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');
  const MEDALS = ['🥇', '🥈', '🥉'];

  // ── Session ──
  let sessionId = sessionStorage.getItem('conf-session');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('conf-session', sessionId);
  }
  let currentRoom = sessionStorage.getItem('conf-room');
  let myName = sessionStorage.getItem('conf-name') || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let timerInterval = null;
  let selectedHeat = 2;
  let myGuess = null;
  let currentConfessionAuthor = null;

  // ── Socket ──
  const socket = io('/confessions');

  // ── Init ──
  if (myName) $('#playerName').value = myName;

  // ═══════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════

  $$('.heat-btn').forEach(b => b.addEventListener('click', () => {
    $$('.heat-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedHeat = +b.dataset.heat;
  }));

  $('#createRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    if (!name) return alert('Enter your name first!');
    myName = name;
    sessionStorage.setItem('conf-name', name);
    socket.emit('createRoom', { playerName: name, heat: selectedHeat, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    const code = $('#roomCodeInput').value.trim().toUpperCase();
    if (!name) return alert('Enter your name first!');
    if (!code) return alert('Enter a room code!');
    myName = name;
    sessionStorage.setItem('conf-name', name);
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));
  $('#playAgainBtn').addEventListener('click', () => socket.emit('playAgain'));

  // Chat
  function sendChat() {
    const input = $('#chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('chatMessage', { message: msg });
    input.value = '';
  }
  $('#sendBtn').addEventListener('click', sendChat);
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  // Submit confession
  $('#submitConfessionBtn').addEventListener('click', () => {
    const text = $('#confessionInput').value.trim();
    if (!text) return alert('Write something!');
    socket.emit('submitConfession', { text });
  });

  // Textarea char count
  const confInput = $('#confessionInput');
  const charCount = $('#charCount');
  if (confInput && charCount) {
    confInput.addEventListener('input', () => {
      charCount.textContent = confInput.value.length + '/500';
    });
  }

  // ═══════════════════════════════════════════
  // Socket Events
  // ═══════════════════════════════════════════

  socket.on('joinedRoom', (data) => {
    myId = data.playerId;
    currentRoom = data.roomId;
    sessionStorage.setItem('conf-room', data.roomId);

    if (data.state === 'waiting') {
      showScreen('waiting');
      $('#roomCodeDisplay').textContent = data.roomId;
      renderWaitingPlayers(data.players);
      updateStartBtn(data.players.length);
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

  socket.on('playerReconnected', ({ playerName }) => addSystemMsg(`${playerName} reconnected`));
  socket.on('playerDisconnected', ({ playerName }) => addSystemMsg(`${playerName} disconnected...`));

  socket.on('ownerUpdate', ({ owner }) => {
    isOwner = (owner === myId);
    const chips = $$('.player-chip');
    updateStartBtn(chips.length);
  });

  socket.on('playerList', (players) => {
    renderWaitingPlayers(players);
    renderGamePlayers(players);
  });

  // ── Submit Phase ──
  socket.on('submitPhase', ({ prompt, heat, duration }) => {
    showScreen('game');
    show($('#submitPhase'));
    hide($('#guessPhase'));
    hide($('#revealPhase'));
    $('#promptText').textContent = prompt;
    const heatLabels = { 1: 'Mild', 2: 'Spicy 🌶️', 3: 'Extreme 🔥' };
    const heatClasses = { 1: 'mild', 2: 'spicy', 3: 'extreme' };
    const badge = $('#promptBadge');
    if (badge) {
      badge.textContent = heatLabels[heat] || 'Spicy';
      badge.className = 'heat-badge ' + (heatClasses[heat] || 'spicy');
    }
    $('#phaseLabel').textContent = '✍️ Write your confession';
    $('#confessionInput').value = '';
    $('#confessionInput').disabled = false;
    $('#submitConfessionBtn').disabled = false;
    if (charCount) charCount.textContent = '0/500';
    startTimer(duration);
  });

  socket.on('confessionReceived', () => {
    $('#confessionInput').disabled = true;
    $('#submitConfessionBtn').disabled = true;
    $('#submitConfessionBtn').textContent = '✅ Submitted!';
  });

  socket.on('submitProgress', ({ submitted, total }) => {
    const el = $('#submitStatus');
    if (el) el.textContent = `${submitted}/${total} confessions submitted`;
  });

  // ── Guess Phase ──
  socket.on('guessPhase', ({ index, total, prompt, text, players, duration }) => {
    showScreen('game');
    hide($('#submitPhase'));
    show($('#guessPhase'));
    hide($('#revealPhase'));
    myGuess = null;
    currentConfessionAuthor = null;

    $('#phaseLabel').textContent = `🔍 Guess who wrote it (${index + 1}/${total})`;
    $('#confessionPromptDisplay').textContent = prompt;
    $('#confessionTextDisplay').textContent = '"' + text + '"';

    // Render guess buttons
    const grid = $('#guessGrid');
    grid.innerHTML = players.map(p => {
      const isMe = p.id === myId;
      return `<button class="guess-btn${isMe ? ' is-me' : ''}" data-player-id="${p.id}" ${isMe ? 'disabled' : ''}>${esc(p.name)}${isMe ? ' (you)' : ''}</button>`;
    }).join('');

    grid.querySelectorAll('.guess-btn:not(.is-me)').forEach(btn => {
      btn.addEventListener('click', () => {
        if (myGuess) return;
        myGuess = btn.dataset.playerId;
        grid.querySelectorAll('.guess-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        socket.emit('submitGuess', { guessedAuthorId: myGuess });
      });
    });

    $('#guessStatus').textContent = '';
    startTimer(duration);
  });

  socket.on('guessReceived', () => {
    $('#guessStatus').textContent = '✅ Your guess is locked in!';
  });

  socket.on('guessProgress', ({ guessed, total }) => {
    const el = $('#guessProgressText');
    if (el) el.textContent = `${guessed}/${total} guessed`;
  });

  // ── Reveal Phase ──
  socket.on('revealPhase', (data) => {
    clearTimer();
    showScreen('game');
    hide($('#submitPhase'));
    hide($('#guessPhase'));
    show($('#revealPhase'));

    $('#phaseLabel').textContent = `🔓 Reveal (${data.index + 1}/${data.total})`;
    $('#revealConfession').textContent = '"' + data.text + '"';
    $('#revealAuthor').innerHTML = 'Written by <span class="author-name">' + esc(data.authorName) + '</span>';

    const statsEl = $('#revealStats');
    statsEl.innerHTML =
      '<div class="reveal-stat"><div class="stat-value">' + data.fooledCount + '</div><div class="stat-label">Fooled</div></div>' +
      '<div class="reveal-stat"><div class="stat-value">+' + data.foolPoints + '</div><div class="stat-label">Writer bonus</div></div>';

    const guessesEl = $('#revealGuesses');
    guessesEl.innerHTML = data.results.map(r => {
      const icon = r.correct ? '✅' : '❌';
      const cls = r.correct ? 'correct' : 'wrong';
      return `<div class="reveal-guess-row ${cls}">` +
        `<span>${esc(r.name)} guessed ${esc(r.guessName)}</span>` +
        `<span class="guess-result-icon">${icon}</span>` +
        `</div>`;
    }).join('');

    renderGamePlayers(null);
  });

  // ── Phase Change ──
  socket.on('phaseChange', ({ phase, duration }) => {
    if (phase === 'guessing' && duration) {
      // Timer already started in guessPhase handler
    }
  });

  // ── Game Over ──
  socket.on('gameOver', ({ results }) => {
    clearTimer();
    showGameOver(results);
  });

  socket.on('backToLobby', ({ players }) => {
    hide($('#gameOverOverlay'));
    showScreen('waiting');
    renderWaitingPlayers(players);
  });

  socket.on('chatMessage', ({ name, message }) => addChatMsg(name, message));
  socket.on('error', ({ message }) => alert(message));
  socket.on('roomList', (rooms) => renderRoomList(rooms));

  socket.on('connect', () => {
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem('conf-room');
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
    updateStartBtn(players.length);
  }

  function updateStartBtn(count) {
    const btn = $('#startGameBtn');
    if (!btn) return;
    if (count >= 3 && isOwner) {
      btn.disabled = false;
      btn.textContent = '🚀 Start Game!';
    } else if (count < 3) {
      btn.disabled = true;
      btn.textContent = 'Need 3+ players to start';
    } else {
      btn.disabled = true;
      btn.textContent = 'Waiting for host to start...';
    }
  }

  function renderGamePlayers(players) {
    const list = $('#playerList');
    if (!list) return;
    if (!players) {
      // Try to read from existing items - skip update
      return;
    }
    list.innerHTML = players.map(p =>
      `<div class="player-item"><span>${p.isOwner ? '👑 ' : ''}${esc(p.name)}</span><span class="player-score">${p.score}</span></div>`
    ).join('');
  }

  function showGameOver(results) {
    const overlay = $('#gameOverOverlay');
    show(overlay);
    const scoresEl = $('#finalScores');
    scoresEl.innerHTML = results.map((p, i) => {
      const medal = MEDALS[i] || `#${i + 1}`;
      return `<div class="final-score-row"><span><span class="final-rank">${medal}</span> ${esc(p.name)}</span><span class="final-pts">${p.score}</span></div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════
  // Timer
  // ═══════════════════════════════════════════

  function startTimer(seconds) {
    clearTimer();
    let remaining = seconds;
    const display = $('#timerDisplay');
    if (!display) return;
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
      `<button class="btn btn-secondary" style="padding:6px 16px;font-size:.85rem">Join</button></div>`
    ).join('');
    container.querySelectorAll('[data-room]').forEach(el => {
      el.addEventListener('click', () => {
        const name = $('#playerName').value.trim();
        if (!name) return alert('Enter your name first!');
        myName = name;
        sessionStorage.setItem('conf-name', name);
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
