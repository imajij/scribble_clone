// ============================================================
// NEVER HAVE I EVER — Client (plain script, not a module)
// ============================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');

  const GAME_ID = 'never-have-i-ever';
  const SS = {
    session: 'adg_' + GAME_ID + '_session',
    room: 'adg_' + GAME_ID + '_room',
    name: 'adg_' + GAME_ID + '_name',
  };

  // ── Session / persistence ──
  let sessionId = sessionStorage.getItem(SS.session);
  if (!sessionId) {
    sessionId = (crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SS.session, sessionId);
  }
  let currentRoom = sessionStorage.getItem(SS.room);
  let myName = sessionStorage.getItem(SS.name) || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let timerInterval = null;
  let myPick = null;

  // ── Settings ──
  let selectedRounds = 7;
  let selectedHeat = 2;

  // ── Socket ──
  const socket = io('/' + GAME_ID);

  // ── Init: prefill name from shared identity / persisted ──
  if (myName && $('#playerName')) $('#playerName').value = myName;

  // ═══════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════
  $$('.sel-btn[data-rounds]').forEach((b) => b.addEventListener('click', () => {
    $$('.sel-btn[data-rounds]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    selectedRounds = +b.dataset.rounds;
  }));

  $$('.heat-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.heat-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    selectedHeat = +b.dataset.heat;
  }));

  $('#createRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    if (!name) return alert('Enter your name first!');
    myName = name;
    sessionStorage.setItem(SS.name, name);
    socket.emit('createRoom', { playerName: name, rounds: selectedRounds, heat: selectedHeat, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    const code = $('#roomCodeInput').value.trim().toUpperCase();
    if (!name) return alert('Enter your name first!');
    if (!code) return alert('Enter a room code!');
    myName = name;
    sessionStorage.setItem(SS.name, name);
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  // ═══════════════════════════════════════════
  // Waiting Room
  // ═══════════════════════════════════════════
  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));

  // ═══════════════════════════════════════════
  // Pick buttons
  // ═══════════════════════════════════════════
  $('#pickHaveBtn').addEventListener('click', () => castPick('have'));
  $('#pickNeverBtn').addEventListener('click', () => castPick('never'));

  function castPick(choice) {
    if (myPick) return;
    myPick = choice;
    socket.emit('pick', { choice });
    const have = $('#pickHaveBtn');
    const never = $('#pickNeverBtn');
    if (choice === 'have') { have.classList.add('selected'); never.disabled = true; }
    else { never.classList.add('selected'); have.disabled = true; }
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
  $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

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
    isOwner = (data.owner === myId);
    sessionStorage.setItem(SS.room, data.roomId);

    if (typeof data.maxRounds === 'number') $('#maxRoundDisplay').textContent = data.maxRounds;

    if (data.state === 'waiting') {
      showScreen('waiting');
      $('#roomCodeDisplay').textContent = data.roomId;
      renderWaitingPlayers(data.players);
      updateStartBtn(data.players.length);
    } else if (data.state === 'picking' && data.prompt) {
      showScreen('game');
      renderGamePlayers(data.players);
      showPicking(data.prompt, data.roundNum, data.maxRounds, (data.pickProgress && data.pickProgress.total) || data.players.length);
      // Restore our own pick if we already chose before reconnecting.
      if (data.myPick) restoreMyPick(data.myPick);
      if (data.pickProgress) updatePickStatus(data.pickProgress.picked, data.pickProgress.total);
    } else if (data.state === 'reveal' && data.reveal) {
      showScreen('game');
      renderGamePlayers(data.players);
      showReveal(data.reveal);
    } else if (data.state === 'gameOver' && data.finalResults) {
      showScreen('game');
      renderGamePlayers(data.players);
      showGameOver(data.finalResults);
    }
  });

  socket.on('playerJoined', ({ players }) => {
    renderWaitingPlayers(players);
    updateStartBtn(players.length);
    addSystemMsg('A new sinner joined!');
  });

  socket.on('playerLeft', ({ playerName, players }) => {
    renderWaitingPlayers(players);
    renderGamePlayers(players);
    updateStartBtn(players.length);
    addSystemMsg(`${playerName} left`);
  });

  socket.on('playerReconnected', ({ playerName }) => addSystemMsg(`${playerName} reconnected`));
  socket.on('playerDisconnected', ({ playerName }) => addSystemMsg(`${playerName} disconnected...`));

  socket.on('ownerUpdate', ({ owner }) => {
    isOwner = (owner === myId);
    updateStartBtn(currentWaitingCount());

    // Re-gate Play Again if the game-over overlay is open.
    const overlay = $('#gameOverOverlay');
    const againBtn = $('#playAgainBtn');
    if (overlay && !overlay.classList.contains('hidden') && againBtn) {
      if (isOwner) { show(againBtn); againBtn.disabled = false; againBtn.textContent = 'Play Again'; }
      else hide(againBtn);
    }
  });

  socket.on('playerList', (players) => {
    renderWaitingPlayers(players);
    renderGamePlayers(players);
  });

  socket.on('newRound', (data) => {
    showScreen('game');
    showPicking(data.prompt, data.roundNum, data.maxRounds, data.total);
    startTimer(data.pickDuration);
  });

  socket.on('pickProgress', ({ picked, total }) => updatePickStatus(picked, total));

  socket.on('roundReveal', (data) => {
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
    updateStartBtn(players.length);
  });

  socket.on('chatMessage', ({ name, message }) => addChatMsg(name, message));
  socket.on('error', ({ message }) => alert(message));
  socket.on('roomList', (rooms) => renderRoomList(rooms));

  // ── Reconnect on connect ──
  socket.on('connect', () => {
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem(SS.room);
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

  function currentWaitingCount() {
    return $$('#waitingPlayers .player-chip').length;
  }

  function renderWaitingPlayers(players) {
    const grid = $('#waitingPlayers');
    if (!grid || !players) return;
    grid.innerHTML = players.map((p) =>
      `<div class="player-chip${p.isOwner ? ' owner' : ''}">${p.isOwner ? '👑 ' : ''}${esc(p.name)}</div>`
    ).join('');
    const countEl = $('#playerCount');
    if (countEl) countEl.textContent = players.length;
  }

  function updateStartBtn(count) {
    const btn = $('#startGameBtn');
    if (!btn) return;
    if (count >= 2 && isOwner) {
      btn.disabled = false;
      btn.textContent = '🙈 Start Confessing!';
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
    if (!list || !players) return;
    list.innerHTML = players.map((p) =>
      `<div class="player-item" data-id="${p.id}">` +
        `<span class="player-name">${p.isOwner ? '👑 ' : ''}${esc(p.name)}</span>` +
        `<span class="player-score">😈 ${p.guilt || 0}</span>` +
      `</div>`
    ).join('');
  }

  const HEAT_LABELS = { 1: 'Mild', 2: 'Spicy 🌶️', 3: 'Extreme 🔥' };
  const HEAT_CLASSES = { 1: 'mild', 2: 'spicy', 3: 'extreme' };

  function showPicking(prompt, roundNum, maxRounds, total) {
    myPick = null;

    $('#roundDisplay').textContent = roundNum;
    $('#maxRoundDisplay').textContent = maxRounds;
    $('#phaseLabel').textContent = 'Confess!';

    show($('#pickingPhase'));
    hide($('#revealPhase'));

    $('#promptText').textContent = prompt.text;
    const badge = $('#promptBadge');
    badge.textContent = HEAT_LABELS[prompt.heat] || 'Spicy';
    badge.className = 'q-badge ' + (HEAT_CLASSES[prompt.heat] || 'spicy');

    const have = $('#pickHaveBtn');
    const never = $('#pickNeverBtn');
    have.classList.remove('selected');
    never.classList.remove('selected');
    have.disabled = false;
    never.disabled = false;

    const denom = (typeof total === 'number' && total > 0) ? total : 0;
    updatePickStatus(0, denom);
  }

  function restoreMyPick(choice) {
    myPick = choice;
    const have = $('#pickHaveBtn');
    const never = $('#pickNeverBtn');
    if (choice === 'have') { have.classList.add('selected'); never.disabled = true; }
    else { never.classList.add('selected'); have.disabled = true; }
  }

  function updatePickStatus(picked, total) {
    const el = $('#pickStatus');
    if (el) el.textContent = `${picked}/${total} confessed`;
  }

  function showReveal(data) {
    hide($('#pickingPhase'));
    show($('#revealPhase'));
    $('#phaseLabel').textContent = 'Reveal';
    clearTimer();

    $('#revealPrompt').textContent = 'Never have I ever ' + data.prompt.text;

    $('#revealCountHave').textContent = data.countHave;
    $('#revealCountNever').textContent = data.countNever;
    $('#revealNamesHave').innerHTML = data.haveNames.length
      ? data.haveNames.map((n) => `<span class="reveal-name">${esc(n)}</span>`).join('')
      : '<span class="reveal-empty">nobody 😇</span>';
    $('#revealNamesNever').innerHTML = data.neverNames.length
      ? data.neverNames.map((n) => `<span class="reveal-name">${esc(n)}</span>`).join('')
      : '<span class="reveal-empty">nobody 😈</span>';

    const haveSide = $('#revealHave');
    const neverSide = $('#revealNever');
    haveSide.classList.toggle('minority', data.minoritySide === 'have');
    neverSide.classList.toggle('minority', data.minoritySide === 'never');

    const verdict = $('#revealVerdict');
    if (data.isTie) {
      verdict.textContent = "🤝 Split down the middle!";
    } else if (data.minoritySide === 'have') {
      verdict.textContent = '😈 Only a guilty few...';
    } else if (data.minoritySide === 'never') {
      verdict.textContent = '🙈 Almost everyone has!';
    } else if (data.countHave > 0 && data.countNever === 0) {
      verdict.textContent = '🔥 EVERYONE has!';
    } else if (data.countNever > 0 && data.countHave === 0) {
      verdict.textContent = '😇 A room full of angels.';
    } else {
      verdict.textContent = '';
    }

    if (data.playerResults) {
      renderGamePlayers(data.playerResults.map((p) => ({
        id: p.id, name: p.name, guilt: p.guilt, isOwner: false,
      })));
    }
  }

  function showGameOver(results) {
    const overlay = $('#gameOverOverlay');
    show(overlay);

    const againBtn = $('#playAgainBtn');
    if (againBtn) {
      if (isOwner) { show(againBtn); againBtn.disabled = false; againBtn.textContent = 'Play Again'; }
      else hide(againBtn);
    }

    const scoresEl = $('#finalScores');
    scoresEl.innerHTML = results.map((p, i) => {
      const t = p.title || { emoji: '🙈', label: '' };
      const rank = i === 0 ? '👑' : `#${i + 1}`;
      return `<div class="final-score-row">` +
        `<span class="final-left">` +
          `<span class="final-rank">${rank}</span> ${esc(p.name)} ` +
          `<span class="final-title">${t.emoji} ${esc(t.label)}</span>` +
        `</span>` +
        `<span class="final-pts">😈 ${p.guilt}/${p.maxRounds}</span>` +
      `</div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════
  // Timer (display only — server drives phase transitions)
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
    if (!rooms || rooms.length === 0) { hide(wrapper); return; }
    show(wrapper);
    container.innerHTML = rooms.map((r) =>
      `<div class="room-list-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:rgba(0,0,0,.2);border-radius:10px;cursor:pointer" data-room="${r.id}">` +
        `<span>${r.id} · ${r.players} player${r.players !== 1 ? 's' : ''}</span>` +
        `<button class="btn btn-secondary" style="padding:6px 16px;font-size:.85rem">Join</button>` +
      `</div>`
    ).join('');

    container.querySelectorAll('[data-room]').forEach((el) => {
      el.addEventListener('click', () => {
        const name = $('#playerName').value.trim();
        if (!name) return alert('Enter your name first!');
        myName = name;
        sessionStorage.setItem(SS.name, name);
        socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
      });
    });
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  // ── SPA Cleanup ──
  window.__gameCleanup = function () {
    try { socket.disconnect(); } catch (e) {}
    clearTimer();
  };
})();
