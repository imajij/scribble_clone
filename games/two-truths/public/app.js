// ============================================================
// TWO TRUTHS & A LIE — Client (plain script, not a module)
// ============================================================
(() => {
  const GAME_ID = 'two-truths';
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');
  const MEDALS = ['🥇', '🥈', '🥉'];

  // ── Shared config (kept in lockstep with games/two-truths/config.js) ──
  const CONFIG = { MIN_PLAYERS: 3, MAX_PLAYERS: 12, MAX_STATEMENT_LEN: 120 };

  // ── Session / persistence ──
  const SESSION_KEY = `adg_${GAME_ID}_session`;
  const ROOM_KEY = `adg_${GAME_ID}_room`;
  const NAME_KEY = `adg_${GAME_ID}_name`;

  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  let currentRoom = sessionStorage.getItem(ROOM_KEY);
  let myName = sessionStorage.getItem(NAME_KEY) || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let timerInterval = null;
  let lastPlayerCount = 0;
  let myGuess = null;
  let guessLocked = false;
  let currentAuthorId = null;
  let submitLocked = false;

  // ── Socket ──
  const socket = io('/' + GAME_ID);

  // Pre-fill name (SPA router seeds #playerName from shared identity).
  const nameInput = $('#playerName');
  if (nameInput && !nameInput.value && myName) nameInput.value = myName;

  // ═══════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════
  $('#createRoomBtn').addEventListener('click', () => {
    const name = ($('#playerName').value || '').trim();
    if (!name) return alert('Enter your name first!');
    myName = name;
    sessionStorage.setItem(NAME_KEY, name);
    socket.emit('createRoom', { playerName: name, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => {
    const name = ($('#playerName').value || '').trim();
    const code = ($('#roomCodeInput').value || '').trim().toUpperCase();
    if (!name) return alert('Enter your name first!');
    if (!code) return alert('Enter a room code!');
    myName = name;
    sessionStorage.setItem(NAME_KEY, name);
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  $('#startGameBtn').addEventListener('click', () => {
    if (!isOwner) return;
    socket.emit('startGame');
  });
  $('#playAgainBtn').addEventListener('click', () => {
    if (!isOwner) return;
    socket.emit('playAgain');
  });

  // Submit statements
  $('#submitStatementsBtn').addEventListener('click', () => doSubmit(false));

  function doSubmit(auto) {
    if (submitLocked) return;
    const rows = $$('#statementRows .statement-row');
    const statements = [];
    let lieIndex = -1;
    rows.forEach((row, i) => {
      const inp = row.querySelector('.statement-input');
      statements.push(inp ? inp.value.trim() : '');
      const radio = row.querySelector('.lie-radio');
      if (radio && radio.checked) lieIndex = i;
    });
    if (!auto) {
      if (statements.some(s => !s)) return alert('Fill in all three statements!');
      if (lieIndex < 0) return alert('Mark which one is the lie!');
    } else {
      // Auto-submit: fill blanks + default lie selection so we never stall.
      for (let i = 0; i < statements.length; i++) if (!statements[i]) statements[i] = '...';
      if (lieIndex < 0) lieIndex = 0;
    }
    socket.emit('submitStatements', { statements, lieIndex });
    lockSubmit('⏳ Submitting...');
  }

  function lockSubmit(label) {
    submitLocked = true;
    const btn = $('#submitStatementsBtn');
    if (btn) { btn.disabled = true; btn.textContent = label; }
    $$('#statementRows .statement-input').forEach(i => i.disabled = true);
    $$('#statementRows .lie-radio').forEach(r => r.disabled = true);
  }

  // ═══════════════════════════════════════════
  // Socket Events
  // ═══════════════════════════════════════════
  socket.on('joinedRoom', (data) => {
    myId = data.playerId;
    currentRoom = data.roomId;
    isOwner = (data.owner === myId) || data.isOwner === true;
    sessionStorage.setItem(ROOM_KEY, data.roomId);
    lastPlayerCount = data.players ? data.players.length : 0;

    $('#roomCodeDisplay').textContent = data.roomId;
    renderWaitingPlayers(data.players);

    if (data.state === 'waiting') {
      showScreen('waiting');
      return;
    }

    // Mid-game (reconnect): restore the current phase from the snapshot.
    renderGamePlayers(data.players);
    const phase = data.phase;
    if (!phase) { showScreen('game'); return; }

    if (phase.name === 'submitting') {
      enterSubmit(phase.duration, phase.maxLen, phase.alreadySubmitted);
      if (phase.progress) updateSubmitProgress(phase.progress);
    } else if (phase.name === 'guessing') {
      enterGuess(phase.trio, phase.duration, phase.myGuess, phase.isAuthor);
      if (phase.progress) updateGuessProgress(phase.progress);
    } else if (phase.name === 'reveal') {
      renderReveal({
        authorName: phase.authorName,
        cards: phase.cards,
        lieCardIndex: phase.lieCardIndex,
        index: phase.index,
        total: phase.total,
        fooledCount: null,
        foolPoints: null,
        results: [],
      });
      showScreen('game');
    } else if (phase.name === 'gameOver') {
      showScreen('game');
      showGameOver(phase.results);
    }
  });

  socket.on('playerJoined', ({ players }) => renderWaitingPlayers(players));
  socket.on('playerLeft', ({ players }) => { renderWaitingPlayers(players); renderGamePlayers(players); });
  socket.on('playerReconnected', () => {});
  socket.on('playerDisconnected', () => {});

  socket.on('ownerUpdate', ({ owner }) => {
    isOwner = (owner === myId);
    updateStartBtn(lastPlayerCount);
    refreshPlayAgainBtn();
  });

  socket.on('playerList', (players) => {
    renderWaitingPlayers(players);
    renderGamePlayers(players);
  });

  // ── Submit Phase ──
  socket.on('submitPhase', ({ duration, maxLen }) => {
    enterSubmit(duration, maxLen, false);
  });
  socket.on('submissionReceived', () => lockSubmit('✅ Locked in!'));
  socket.on('submissionRejected', ({ message }) => {
    submitLocked = false;
    const btn = $('#submitStatementsBtn');
    if (btn) { btn.disabled = false; btn.textContent = '🤥 Lock In'; }
    $$('#statementRows .statement-input').forEach(i => i.disabled = false);
    $$('#statementRows .lie-radio').forEach(r => r.disabled = false);
    if (message) alert(message);
  });
  socket.on('submitProgress', (p) => updateSubmitProgress(p));

  // ── Guess Phase ──
  socket.on('guessPhase', (data) => {
    enterGuess(
      { authorId: data.authorId, authorName: data.authorName, cards: data.cards, index: data.index, total: data.total },
      data.duration, null, data.authorId === myId
    );
    if (data.progress) updateGuessProgress(data.progress);
  });
  socket.on('guessReceived', ({ cardIndex }) => {
    myGuess = cardIndex;
    guessLocked = true;
    markGuessSelection(cardIndex);
    $('#guessStatus').textContent = '✅ Your guess is locked in!';
  });
  socket.on('guessProgress', (p) => updateGuessProgress(p));

  // ── Reveal Phase ──
  socket.on('revealPhase', (data) => {
    clearTimer();
    renderReveal(data);
    showScreen('game');
  });

  // ── Phase change (drives reveal countdown only) ──
  socket.on('phaseChange', ({ phase, duration }) => {
    if (phase === 'reveal' && duration) startTimer(duration, null);
  });

  // ── Game Over ──
  socket.on('gameOver', ({ results }) => {
    clearTimer();
    showGameOver(results);
  });

  socket.on('backToLobby', ({ players }) => {
    hide($('#gameOverOverlay'));
    clearTimer();
    showScreen('waiting');
    renderWaitingPlayers(players);
  });

  socket.on('error', ({ message }) => alert(message));
  socket.on('roomList', (rooms) => renderRoomList(rooms));

  socket.on('connect', () => {
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });
  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem(ROOM_KEY);
    showScreen('lobby');
  });

  // ═══════════════════════════════════════════
  // Phase rendering
  // ═══════════════════════════════════════════
  function enterSubmit(duration, maxLen, alreadySubmitted) {
    showScreen('game');
    show($('#submitPhase'));
    hide($('#guessPhase'));
    hide($('#revealPhase'));
    $('#phaseLabel').textContent = '✍️ Two truths & a lie';

    const cap = maxLen || CONFIG.MAX_STATEMENT_LEN;
    submitLocked = false;
    const container = $('#statementRows');
    container.innerHTML = [0, 1, 2].map(i => (
      `<div class="statement-row" data-idx="${i}">` +
        `<input type="text" class="statement-input" maxlength="${cap}" placeholder="Statement ${i + 1}..." autocomplete="off">` +
        `<label class="lie-toggle"><input type="radio" name="lieMark" class="lie-radio" value="${i}"><span>Lie</span></label>` +
      `</div>`
    )).join('');

    const btn = $('#submitStatementsBtn');
    if (btn) { btn.disabled = false; btn.textContent = '🤥 Lock In'; }
    $('#submitStatus').textContent = '';

    if (alreadySubmitted) lockSubmit('✅ Locked in!');

    startTimer(duration, () => { if (!submitLocked) doSubmit(true); });
  }

  function updateSubmitProgress({ submitted, total }) {
    const el = $('#submitStatus');
    if (el && !submitLocked) el.textContent = `${submitted}/${total} locked in`;
    else if (el) el.textContent = `✅ Locked in · ${submitted}/${total} done`;
  }

  function enterGuess(trio, duration, myExistingGuess, isAuthor) {
    showScreen('game');
    hide($('#submitPhase'));
    show($('#guessPhase'));
    hide($('#revealPhase'));

    myGuess = (myExistingGuess === 0 || myExistingGuess) ? myExistingGuess : null;
    guessLocked = (myExistingGuess === 0 || !!myExistingGuess);
    currentAuthorId = trio ? trio.authorId : null;

    if (!trio) return;
    $('#phaseLabel').textContent = `🔍 Spot the lie (${trio.index + 1}/${trio.total})`;
    $('#trioAuthorName').textContent = trio.authorName;

    const author = trio.authorId === myId || isAuthor;
    const lead = $('#guessLead');
    if (author) lead.textContent = "It's your turn — sit back while others guess. 😏";
    else lead.textContent = 'Which one is the LIE? 🤔';

    const grid = $('#guessGrid');
    grid.innerHTML = trio.cards.map((c, i) => (
      `<button class="guess-btn lie-card" data-idx="${i}"${author ? ' disabled' : ''}>` +
        `<span class="card-num">${i + 1}</span><span class="card-text">${esc(c.text)}</span>` +
      `</button>`
    )).join('');

    if (!author) {
      grid.querySelectorAll('.guess-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (guessLocked) return;
          const idx = +btn.dataset.idx;
          myGuess = idx;
          markGuessSelection(idx);
          socket.emit('submitGuess', { cardIndex: idx });
        });
      });
    }

    $('#guessStatus').textContent = author ? 'Waiting for the room to guess...' : '';

    if (guessLocked && myGuess !== null) {
      markGuessSelection(myGuess);
      $('#guessStatus').textContent = '✅ Your guess is locked in!';
    }

    startTimer(duration, () => {
      if (!author && !guessLocked) {
        const first = $('#guessGrid .guess-btn:not([disabled])');
        if (first) first.click();
      }
    });
  }

  function markGuessSelection(idx) {
    const grid = $('#guessGrid');
    if (!grid) return;
    grid.querySelectorAll('.guess-btn').forEach(b => {
      b.classList.toggle('selected', +b.dataset.idx === idx);
    });
  }

  function updateGuessProgress({ guessed, total }) {
    const el = $('#guessProgressText');
    if (el) el.textContent = `${guessed}/${total} guessed`;
  }

  function renderReveal(data) {
    showScreen('game');
    hide($('#submitPhase'));
    hide($('#guessPhase'));
    show($('#revealPhase'));
    clearTimer();

    $('#phaseLabel').textContent = `🔓 Reveal (${data.index + 1}/${data.total})`;
    $('#revealAuthor').innerHTML =
      'These were <span class="author-name">' + esc(data.authorName) + "</span>'s statements";

    const cardsEl = $('#revealCards');
    cardsEl.innerHTML = data.cards.map((c, i) => {
      const cls = c.isLie ? 'reveal-card-item lie' : 'reveal-card-item truth';
      const tag = c.isLie ? '🤥 The Lie' : '✅ Truth';
      return `<div class="${cls}"><span class="card-num">${i + 1}</span>` +
        `<span class="card-text">${esc(c.text)}</span>` +
        `<span class="card-tag">${tag}</span></div>`;
    }).join('');

    const statsEl = $('#revealStats');
    if (data.fooledCount === null || data.fooledCount === undefined) {
      statsEl.innerHTML = '';
    } else {
      statsEl.innerHTML =
        '<div class="reveal-stat"><div class="stat-value">' + data.fooledCount + '</div><div class="stat-label">Fooled</div></div>' +
        '<div class="reveal-stat"><div class="stat-value">+' + data.foolPoints + '</div><div class="stat-label">Author bonus</div></div>';
    }

    const guessesEl = $('#revealGuesses');
    if (!data.results || !data.results.length) {
      guessesEl.innerHTML = '';
    } else {
      guessesEl.innerHTML = data.results.map(r => {
        const icon = r.correct ? '✅' : '❌';
        const cls = r.correct ? 'correct' : 'wrong';
        const what = r.guess === null || r.guess === undefined
          ? 'no guess'
          : `picked #${r.guess + 1}`;
        return `<div class="reveal-guess-row ${cls}">` +
          `<span>${esc(r.name)} — ${what}</span>` +
          `<span class="guess-result-icon">${icon}</span></div>`;
      }).join('');
    }
  }

  // ═══════════════════════════════════════════
  // Generic rendering
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
    if (!players) return;
    lastPlayerCount = players.length;
    const grid = $('#waitingPlayers');
    if (grid) {
      grid.innerHTML = players.map(p =>
        `<div class="player-chip${p.isOwner ? ' owner' : ''}">${p.isOwner ? '👑 ' : ''}${esc(p.name)}</div>`
      ).join('');
    }
    const countEl = $('#playerCount');
    if (countEl) countEl.textContent = players.length;
    updateStartBtn(players.length);
  }

  function updateStartBtn(count) {
    const btn = $('#startGameBtn');
    if (!btn) return;
    if (count < CONFIG.MIN_PLAYERS) {
      btn.disabled = true;
      btn.textContent = `Need ${CONFIG.MIN_PLAYERS}+ players to start`;
    } else if (isOwner) {
      btn.disabled = false;
      btn.textContent = '🚀 Start Game!';
    } else {
      btn.disabled = true;
      btn.textContent = 'Waiting for host to start...';
    }
  }

  function renderGamePlayers(players) {
    const list = $('#playerList');
    if (!list || !players) return;
    list.innerHTML = players.map(p =>
      `<div class="player-item"><span>${p.isOwner ? '👑 ' : ''}${esc(p.name)}</span>` +
      `<span class="player-score">${p.score}</span></div>`
    ).join('');
  }

  function showGameOver(results) {
    const overlay = $('#gameOverOverlay');
    show(overlay);
    const scoresEl = $('#finalScores');
    scoresEl.innerHTML = results.map((p, i) => {
      const medal = MEDALS[i] || `#${i + 1}`;
      return `<div class="final-score-row"><span><span class="final-rank">${medal}</span> ${esc(p.name)}</span>` +
        `<span class="final-pts">${p.score}</span></div>`;
    }).join('');
    refreshPlayAgainBtn();
  }

  function refreshPlayAgainBtn() {
    const againBtn = $('#playAgainBtn');
    if (!againBtn) return;
    if (isOwner) {
      show(againBtn);
      againBtn.disabled = false;
      againBtn.textContent = 'Play Again';
    } else {
      hide(againBtn);
    }
  }

  function renderRoomList(rooms) {
    const container = $('#roomListContainer');
    const wrapper = $('#activeRooms');
    if (!container || !wrapper) return;
    const open = rooms.filter(r => r.state === 'waiting');
    if (open.length === 0) { hide(wrapper); return; }
    show(wrapper);
    container.innerHTML = open.map(r =>
      `<div class="room-list-item" data-room="${r.id}">` +
      `<span>${r.id} · ${r.players} player${r.players !== 1 ? 's' : ''}</span>` +
      `<button class="btn btn-secondary room-join-btn">Join</button></div>`
    ).join('');
    container.querySelectorAll('[data-room]').forEach(el => {
      el.addEventListener('click', () => {
        const name = ($('#playerName').value || '').trim();
        if (!name) return alert('Enter your name first!');
        myName = name;
        sessionStorage.setItem(NAME_KEY, name);
        socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
      });
    });
  }

  // ═══════════════════════════════════════════
  // Timer (display only; phase transitions are server-driven)
  // ═══════════════════════════════════════════
  function startTimer(seconds, onExpire) {
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
      if (remaining <= 0) {
        clearTimer();
        if (typeof onExpire === 'function') onExpire();
      }
    }, 1000);
  }

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    const display = $('#timerDisplay');
    if (display) display.classList.remove('urgent');
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  // ── SPA Cleanup ──
  window.__gameCleanup = function () {
    try { socket.disconnect(); } catch (e) {}
    clearTimer();
  };
})();
