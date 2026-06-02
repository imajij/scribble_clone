// ============================================================
// TRIVIA SHOWDOWN — Client (plain script, not a module)
// ============================================================
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');
  const MEDALS = ['🥇', '🥈', '🥉'];
  const OPT_LETTERS = ['A', 'B', 'C', 'D'];

  // Categories — kept in sync with questions.js CATEGORIES (shared vocabulary).
  const CATEGORIES = [
    { id: 'all',       label: 'All Mixed' },
    { id: 'general',   label: 'General' },
    { id: 'science',   label: 'Science' },
    { id: 'history',   label: 'History' },
    { id: 'pop',       label: 'Pop' },
    { id: 'sports',    label: 'Sports' },
    { id: 'afterdark', label: 'After Dark 🔥' },
  ];
  const CAT_LABELS = {
    all: 'All Mixed', general: 'General Knowledge', science: 'Science & Nature',
    history: 'History & Geo', pop: 'Pop Culture', sports: 'Sports & Games',
    afterdark: 'After Dark 🔥',
  };

  // ── Session persistence ──
  const SKEY = 'adg_trivia_session';
  let sessionId = sessionStorage.getItem(SKEY);
  if (!sessionId) {
    sessionId = (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SKEY, sessionId);
  }
  let currentRoom = sessionStorage.getItem('adg_trivia_room');
  let myName = sessionStorage.getItem('adg_trivia_name') || '';

  // ── Runtime state ──
  let myId = null;
  let isOwner = false;
  let timerInterval = null;
  let myAnswer = null;       // index I locked this round (null until I lock)
  let answeredThisRound = false;

  // ── Lobby settings ──
  let selectedRounds = 10;
  let selectedCategory = 'all';

  // ── Socket ──
  const socket = io('/trivia');

  // ── Init ──
  if (myName && $('#playerName')) $('#playerName').value = myName;
  buildCategorySelector();

  function buildCategorySelector() {
    const wrap = $('#categorySelector');
    if (!wrap) return;
    wrap.innerHTML = CATEGORIES.map(c =>
      `<button class="sel-btn${c.id === selectedCategory ? ' active' : ''}" data-cat="${c.id}">${esc(c.label)}</button>`
    ).join('');
    wrap.querySelectorAll('.sel-btn[data-cat]').forEach(b => b.addEventListener('click', () => {
      wrap.querySelectorAll('.sel-btn[data-cat]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      selectedCategory = b.dataset.cat;
    }));
  }

  // ═══════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════

  $$('.sel-btn[data-rounds]').forEach(b => b.addEventListener('click', () => {
    $$('.sel-btn[data-rounds]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedRounds = +b.dataset.rounds;
  }));

  $('#createRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    if (!name) return alert('Enter your name first!');
    myName = name;
    sessionStorage.setItem('adg_trivia_name', name);
    socket.emit('createRoom', { playerName: name, rounds: selectedRounds, category: selectedCategory, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    const code = $('#roomCodeInput').value.trim().toUpperCase();
    if (!name) return alert('Enter your name first!');
    if (!code) return alert('Enter a room code!');
    myName = name;
    sessionStorage.setItem('adg_trivia_name', name);
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  $('#roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinRoomBtn').click(); });

  // ═══════════════════════════════════════════
  // Waiting Room
  // ═══════════════════════════════════════════

  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));

  // ═══════════════════════════════════════════
  // Play Again
  // ═══════════════════════════════════════════

  $('#playAgainBtn').addEventListener('click', () => socket.emit('playAgain'));

  // ═══════════════════════════════════════════
  // Answer locking
  // ═══════════════════════════════════════════

  function lockAnswer(index) {
    if (answeredThisRound) return;
    answeredThisRound = true;
    myAnswer = index;
    socket.emit('answer', { index });
    // Optimistically reflect the lock; server confirms via 'answerLocked'.
    const grid = $('#optionsGrid');
    grid.querySelectorAll('.opt-btn').forEach((b, i) => {
      b.disabled = true;
      if (i === index) b.classList.add('selected');
    });
  }

  // ═══════════════════════════════════════════
  // Socket Events
  // ═══════════════════════════════════════════

  socket.on('joinedRoom', (data) => {
    myId = data.playerId;
    currentRoom = data.roomId;
    isOwner = (data.owner === myId);
    sessionStorage.setItem('adg_trivia_room', data.roomId);

    if (data.state === 'waiting') {
      showScreen('waiting');
      $('#roomCodeDisplay').textContent = data.roomId;
      renderWaitingPlayers(data.players);
      updateStartBtn(data.players.length, data.owner);
    } else if (data.state === 'question' && data.question) {
      showScreen('game');
      answeredThisRound = data.myAnswer != null;
      myAnswer = (data.myAnswer != null) ? data.myAnswer : null;
      renderQuestion(data.question);
      if (data.myAnswer != null) markLockedAnswer(data.myAnswer);
      if (data.progress) updateAnswerStatus(data.progress.answered, data.progress.total);
      const secs = Math.ceil((data.timeLeftMs || 0) / 1000);
      startTimer(secs > 0 ? secs : 1);
    } else if (data.state === 'reveal' && data.reveal) {
      showScreen('game');
      // Reconstruct a reveal view from the snapshot.
      renderRevealFromSnapshot(data.reveal);
    } else if (data.state === 'gameOver' && data.finalResults) {
      showScreen('game');
      showGameOver(data.finalResults);
    }
  });

  socket.on('playerJoined', ({ players }) => { renderWaitingPlayers(players); });
  socket.on('playerLeft', ({ players }) => { renderWaitingPlayers(players); });
  socket.on('playerReconnected', () => {});
  socket.on('playerDisconnected', () => {});

  socket.on('ownerUpdate', ({ owner }) => {
    isOwner = (owner === myId);
    const chips = $$('.player-chip');
    updateStartBtn(chips.length, owner);

    // Re-gate Play Again if the game-over overlay is visible.
    const overlay = $('#gameOverOverlay');
    const againBtn = $('#playAgainBtn');
    if (overlay && !overlay.classList.contains('hidden') && againBtn) {
      if (isOwner) { show(againBtn); againBtn.disabled = false; }
      else hide(againBtn);
    }
  });

  socket.on('playerList', (players) => { renderWaitingPlayers(players); });

  socket.on('newQuestion', (data) => {
    showScreen('game');
    answeredThisRound = false;
    myAnswer = null;
    hide($('#miniBoard'));
    renderQuestion(data);
    updateAnswerStatus(0, data.total);
    startTimer(data.duration);
  });

  socket.on('answerLocked', ({ index }) => {
    answeredThisRound = true;
    myAnswer = index;
    markLockedAnswer(index);
  });

  socket.on('answerProgress', ({ answered, total }) => {
    updateAnswerStatus(answered, total);
  });

  socket.on('reveal', (data) => {
    clearTimer();
    showReveal(data);
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

  socket.on('error', ({ message }) => { alert(message); });
  socket.on('roomList', (rooms) => { renderRoomList(rooms); });

  // ── Reconnect on connect ──
  socket.on('connect', () => {
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem('adg_trivia_room');
    showScreen('lobby');
  });

  // ═══════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════

  function showScreen(name) {
    hide($('#lobbyScreen'));
    hide($('#waitingScreen'));
    hide($('#gameScreen'));
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
      btn.textContent = '🚀 Start Showdown!';
    } else if (count < 2) {
      btn.disabled = true;
      btn.textContent = 'Need 2+ players to start';
    } else {
      btn.disabled = true;
      btn.textContent = 'Waiting for host to start...';
    }
  }

  function renderQuestion(q) {
    hide($('#miniBoard'));
    $('#phaseLabel').textContent = `Round ${q.roundNum} / ${q.maxRounds}`;
    $('#questionText').textContent = q.question;

    const badge = $('#categoryBadge');
    badge.textContent = CAT_LABELS[q.category] || q.category || 'Trivia';
    badge.className = 'cat-badge' + (q.heat >= 2 ? ' afterdark' : '');

    const grid = $('#optionsGrid');
    grid.innerHTML = q.options.map((opt, i) =>
      `<button class="opt-btn" data-idx="${i}">` +
        `<span class="opt-letter">${OPT_LETTERS[i]}</span>` +
        `<span class="opt-text">${esc(opt)}</span>` +
      `</button>`
    ).join('');
    grid.querySelectorAll('.opt-btn').forEach(b => {
      b.addEventListener('click', () => lockAnswer(+b.dataset.idx));
    });
  }

  function markLockedAnswer(index) {
    const grid = $('#optionsGrid');
    grid.querySelectorAll('.opt-btn').forEach((b, i) => {
      b.disabled = true;
      if (i === index) b.classList.add('selected');
    });
  }

  function updateAnswerStatus(answered, total) {
    const el = $('#answerStatus');
    if (el) el.textContent = `${answered}/${total} locked in`;
  }

  function showReveal(data) {
    clearTimer();
    $('#phaseLabel').textContent = 'Reveal';
    $('#answerStatus').textContent = '';

    const grid = $('#optionsGrid');
    grid.querySelectorAll('.opt-btn').forEach((b, i) => {
      b.disabled = true;
      b.classList.remove('selected');
      if (i === data.correctIndex) b.classList.add('correct');
      else if (myAnswer === i) b.classList.add('wrong');
      // show how many picked each option
      const c = data.counts ? data.counts[i] : 0;
      if (c > 0) {
        const tag = document.createElement('span');
        tag.className = 'opt-count';
        tag.textContent = c;
        b.appendChild(tag);
      }
    });

    renderMiniBoard(data);
  }

  // Reveal reconstructed from a reconnect snapshot (no per-option counts).
  function renderRevealFromSnapshot(rv) {
    answeredThisRound = rv.myAnswer != null;
    myAnswer = (rv.myAnswer != null) ? rv.myAnswer : null;
    $('#phaseLabel').textContent = 'Reveal';
    $('#answerStatus').textContent = '';
    $('#questionText').textContent = rv.question;
    const badge = $('#categoryBadge');
    badge.textContent = 'Trivia';
    badge.className = 'cat-badge';

    const grid = $('#optionsGrid');
    grid.innerHTML = rv.options.map((opt, i) =>
      `<button class="opt-btn" disabled data-idx="${i}">` +
        `<span class="opt-letter">${OPT_LETTERS[i]}</span>` +
        `<span class="opt-text">${esc(opt)}</span>` +
      `</button>`
    ).join('');
    grid.querySelectorAll('.opt-btn').forEach((b, i) => {
      if (i === rv.correctIndex) b.classList.add('correct');
      else if (myAnswer === i) b.classList.add('wrong');
    });

    renderMiniBoard({ leaderboard: rv.leaderboard, playerResults: null });
  }

  function renderMiniBoard(data) {
    const board = $('#miniBoard');
    if (!board) return;
    show(board);

    const lb = data.leaderboard || [];
    const resultsById = {};
    if (data.playerResults) data.playerResults.forEach(r => { resultsById[r.id] = r; });

    board.innerHTML =
      `<h3 class="mini-title">Scoreboard</h3>` +
      lb.slice(0, 8).map((p, i) => {
        const r = resultsById[p.id];
        let gain = '';
        if (r) {
          if (r.points > 0) gain = `<span class="mini-gain">+${r.points}${r.speedBonus > 0 ? ' ⚡' : ''}</span>`;
          else gain = `<span class="mini-gain zero">+0</span>`;
        }
        const tick = r ? (r.correct ? ' ✅' : ' ❌') : '';
        const streak = p.streak >= 3 ? ` 🔥${p.streak}` : '';
        return `<div class="mini-row${p.id === myId ? ' me' : ''}">` +
          `<span class="mini-name">${i + 1}. ${esc(p.name)}${tick}${streak}</span>` +
          `<span class="mini-score">${p.score}${gain}</span>` +
        `</div>`;
      }).join('');
  }

  function showGameOver(results) {
    const overlay = $('#gameOverOverlay');
    show(overlay);

    const againBtn = $('#playAgainBtn');
    if (againBtn) {
      if (isOwner) { show(againBtn); againBtn.disabled = false; }
      else hide(againBtn);
    }

    const scoresEl = $('#finalScores');
    scoresEl.innerHTML = results.map((p, i) => {
      const medal = MEDALS[i] || `#${i + 1}`;
      return `<div class="final-score-row${p.id === myId ? ' me' : ''}">` +
        `<span><span class="final-rank">${medal}</span> ${esc(p.name)}</span>` +
        `<span class="final-pts">${p.score}</span>` +
      `</div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════
  // Timer (display only; server drives transitions)
  // ═══════════════════════════════════════════

  function startTimer(seconds) {
    clearTimer();
    let remaining = Math.max(0, Math.floor(seconds));
    const display = $('#timerDisplay');
    if (display) { display.textContent = remaining; display.classList.remove('urgent'); }
    timerInterval = setInterval(() => {
      remaining--;
      if (display) {
        display.textContent = Math.max(0, remaining);
        if (remaining <= 5) display.classList.add('urgent');
      }
      if (remaining <= 0) clearTimer();
    }, 1000);
  }

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    const display = $('#timerDisplay');
    if (display) display.classList.remove('urgent');
  }

  // ═══════════════════════════════════════════
  // Room list
  // ═══════════════════════════════════════════

  function renderRoomList(rooms) {
    const container = $('#roomListContainer');
    const wrapper = $('#activeRooms');
    if (!container || !wrapper) return;
    const open = rooms.filter(r => r.state === 'waiting');
    if (open.length === 0) { hide(wrapper); return; }
    show(wrapper);
    container.innerHTML = open.map(r =>
      `<div class="room-item" data-room="${r.id}">` +
        `<span class="room-id">${r.id}</span>` +
        `<span class="room-badge">${r.players} player${r.players !== 1 ? 's' : ''}</span>` +
      `</div>`
    ).join('');
    container.querySelectorAll('[data-room]').forEach(el => {
      el.addEventListener('click', () => {
        const name = $('#playerName').value.trim();
        if (!name) return alert('Enter your name first!');
        myName = name;
        sessionStorage.setItem('adg_trivia_name', name);
        socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
      });
    });
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = (s == null ? '' : s); return d.innerHTML; }

  // ── SPA Cleanup ──
  window.__gameCleanup = function () {
    try { socket.disconnect(); } catch (e) {}
    clearTimer();
  };
})();
