// ============================================================
// TRUTH OR TEASE LIVE — Client
// ============================================================

(() => {
  // ---------- Utility ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');

  // ---------- Constants ----------
  const RANK_MEDALS = ['🥇', '🥈', '🥉'];

  // ---------- Session ----------
  let sessionId = sessionStorage.getItem('tot-session');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('tot-session', sessionId);
  }

  let currentRoom = sessionStorage.getItem('tot-room');
  let myName = sessionStorage.getItem('tot-name') || '';

  // ---------- State ----------
  let mySocketId = null;
  let isOwner = false;
  let timerInterval = null;
  let timerValue = 0;
  let hasVoted = false;

  // ---------- Settings ----------
  let selectedRounds = 3;
  let selectedHeat = 2;

  // ---------- DOM refs ----------
  const ageGate         = $('#ageGate');
  const lobbyScreen     = $('#lobbyScreen');
  const waitingScreen   = $('#waitingScreen');
  const gameScreen      = $('#gameScreen');
  const roundEndOverlay = $('#roundEndOverlay');
  const gameOverOverlay = $('#gameOverOverlay');

  // ============================================================
  // Socket.IO
  // ============================================================
  const socket = io('/truth-or-tease', { autoConnect: false });

  // ============================================================
  // Age Gate
  // ============================================================
  const ageConfirmed = localStorage.getItem('tot-age-confirmed');
  if (ageConfirmed === 'true') {
    hide(ageGate);
    initLobby();
  }

  $('#ageConfirmBtn').addEventListener('click', () => {
    localStorage.setItem('tot-age-confirmed', 'true');
    hide(ageGate);
    initLobby();
  });

  $('#ageDenyBtn').addEventListener('click', () => {
    window.location.href = '/';
  });

  // ============================================================
  // Lobby Init
  // ============================================================
  function initLobby() {
    showScreen('lobby');
    if (myName) $('#playerName').value = myName;
    socket.connect();
  }

  // Round selector
  $$('.sel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.sel-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRounds = parseInt(btn.dataset.rounds, 10);
    });
  });

  // Heat selector
  $$('.heat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.heat-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedHeat = parseInt(btn.dataset.heat, 10);
    });
  });

  // Create room
  $('#createRoomBtn').addEventListener('click', () => {
    const name = getName();
    if (!name) return;
    socket.emit('createRoom', { playerName: name, rounds: selectedRounds, sessionId, heatLevel: selectedHeat });
  });

  // Join room
  $('#joinRoomBtn').addEventListener('click', () => {
    const name = getName();
    if (!name) return;
    const code = $('#roomCodeInput').value.trim().toUpperCase();
    if (!code) return alert('Enter a room code!');
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  // Enter key shortcuts
  $('#playerName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#createRoomBtn').click(); });
  $('#roomCodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinRoomBtn').click(); });

  // Start game
  $('#startGameBtn').addEventListener('click', () => { socket.emit('startGame'); });

  // Submit answer
  $('#submitAnswerBtn').addEventListener('click', () => {
    const ans = $('#answerInput').value.trim();
    if (!ans) return;
    socket.emit('submitAnswer', ans);
    $('#submitAnswerBtn').disabled = true;
    $('#answerInput').disabled = true;
  });

  // Reactions
  $$('.reaction-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (hasVoted) return;
      socket.emit('react', btn.dataset.emoji);
    });
  });

  // Play again
  $('#playAgainBtn').addEventListener('click', () => {
    hide(gameOverOverlay);
    showScreen('waiting');
    socket.emit('startGame');
  });

  // Chat
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#sendBtn').click();
  });
  $('#sendBtn').addEventListener('click', () => {
    const msg = $('#chatInput').value.trim();
    if (!msg) return;
    socket.emit('chatMessage', msg);
    $('#chatInput').value = '';
  });

  // ============================================================
  // Socket Events
  // ============================================================

  socket.on('connect', () => {
    mySocketId = socket.id;
    // Attempt reconnect
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });

  socket.on('roomList', (list) => {
    const container = $('#roomListContainer');
    const wrapper = $('#activeRooms');
    if (!list || list.length === 0) { hide(wrapper); return; }
    show(wrapper);
    container.innerHTML = list.map((r) => `
      <div class="room-item" data-room="${r.id}">
        <span class="room-name">${r.id}</span>
        <span class="room-meta">${r.players}/10 · ${r.state}</span>
      </div>
    `).join('');
    container.querySelectorAll('.room-item').forEach((el) => {
      el.addEventListener('click', () => {
        const name = getName();
        if (!name) return;
        socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
      });
    });
  });

  socket.on('joinedRoom', (data) => {
    currentRoom = data.roomId;
    sessionStorage.setItem('tot-room', currentRoom);
    isOwner = data.isOwner;
    mySocketId = socket.id;

    if (data.state === 'waiting') {
      showScreen('waiting');
      renderWaitingPlayers(data.players);
      $('#roomCodeDisplay').textContent = data.roomId;
      updateStartBtn(data.players.length);
    } else {
      showScreen('game');
      renderPlayerList(data.players);
      if (data.gameState) {
        restoreGameState(data.gameState);
      }
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem('tot-room');
    showScreen('lobby');
  });

  socket.on('playerJoined', (data) => {
    addSystemMessage(`${data.playerName} joined the room`);
    if (waitingScreen.classList.contains('hidden') === false) {
      renderWaitingPlayers(data.players);
      updateStartBtn(data.players.length);
    }
  });

  socket.on('playerLeft', (data) => {
    const suffix = data.mayReconnect ? ' (may reconnect)' : '';
    addSystemMessage(`${data.playerName} left${suffix}`);
    if (!waitingScreen.classList.contains('hidden')) {
      renderWaitingPlayers(data.players);
      updateStartBtn(data.players.length);
    }
    renderPlayerList(data.players);
  });

  socket.on('playerReconnected', (data) => {
    addSystemMessage(`${data.playerName} reconnected!`);
    renderPlayerList(data.players);
  });

  socket.on('ownerUpdate', (data) => {
    isOwner = data.owner === mySocketId;
    updateStartBtn();
  });

  socket.on('playerList', (players) => {
    renderPlayerList(players);
    if (!waitingScreen.classList.contains('hidden')) {
      renderWaitingPlayers(players);
      updateStartBtn(players.length);
    }
  });

  socket.on('systemMessage', (data) => {
    addSystemMessage(data.message);
  });

  // ---- Game flow ----

  socket.on('newQuestion', (data) => {
    showScreen('game');
    hide(roundEndOverlay);
    hide(gameOverOverlay);
    hasVoted = false;

    $('#roundDisplay').textContent = data.roundNum;
    $('#maxRoundDisplay').textContent = data.maxRounds;
    $('#phaseLabel').textContent = '✏️ Answer Phase';

    show($('#questionPhase'));
    hide($('#votingPhase'));

    // Question card
    const badge = $('#questionBadge');
    badge.textContent = data.question.category === 'truth' ? '🫣 Truth' : '😈 Tease';
    badge.className = `q-badge ${data.question.category}`;
    $('#questionText').textContent = data.question.text;

    // Hot seat label
    const isHotSeat = data.hotSeat === mySocketId;
    $('#hotSeatLabel').textContent = isHotSeat
      ? "🔥 It's YOUR turn — spill it!"
      : `🔥 ${data.hotSeatName} is in the hot seat`;

    if (isHotSeat) {
      show($('#answerBox'));
      hide($('#waitingForAnswer'));
      $('#answerInput').value = '';
      $('#answerInput').disabled = false;
      $('#submitAnswerBtn').disabled = false;
      setTimeout(() => $('#answerInput').focus(), 100);
    } else {
      hide($('#answerBox'));
      show($('#waitingForAnswer'));
    }

    startTimer(data.duration || 30);
  });

  socket.on('answerRevealed', (data) => {
    $('#phaseLabel').textContent = '🗳️ Voting Phase';
    hide($('#questionPhase'));
    show($('#votingPhase'));
    hasVoted = false;

    // Vote question card
    const vBadge = $('#voteQuestionBadge');
    vBadge.textContent = data.question.category === 'truth' ? '🫣 Truth' : '😈 Tease';
    vBadge.className = `q-badge ${data.question.category}`;
    $('#voteQuestionText').textContent = data.question.text;

    // Answer reveal
    $('#answerAuthor').textContent = `${data.hotSeatName} answered:`;
    $('#revealedAnswer').textContent = data.answer || '(skipped / timed out)';

    // Reactions
    const isHotSeat = data.hotSeat === mySocketId;
    $$('.reaction-btn').forEach((btn) => {
      btn.classList.remove('selected');
      btn.disabled = isHotSeat;
    });
    if (isHotSeat) {
      $('#voteStatus').textContent = "You're in the hot seat — watch the reactions roll in!";
    } else {
      $('#voteStatus').textContent = 'Pick your reaction!';
    }
    $('#liveReactions').innerHTML = '';

    startTimer(data.voteDuration || 15);
  });

  socket.on('reactionCast', (data) => {
    // Check if this is my own vote
    if (data.voter === mySocketId) {
      hasVoted = true;
      $$('.reaction-btn').forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.emoji === data.emoji) btn.classList.add('selected');
      });
      $('#voteStatus').textContent = 'Vote cast! ✅';
    }
    // Live reaction bubble
    const span = document.createElement('span');
    span.className = 'live-reaction';
    span.textContent = data.emoji;
    $('#liveReactions').appendChild(span);
  });

  socket.on('roundEnd', (data) => {
    clearTimer();
    show(roundEndOverlay);

    $('#roundEndTitle').textContent = `Round Complete!`;
    $('#roundEndQuestion').textContent = data.question ? data.question.text : '';
    $('#roundEndAnswer').textContent = data.answer || '(no answer)';

    // Reactions summary
    const reactionsHtml = data.reactions
      ? Object.entries(data.reactions)
          .filter(([, count]) => count > 0)
          .map(([emoji, count]) => `<div class="re-item"><span class="re-emoji">${emoji}</span><span class="re-count">${count}</span></div>`)
          .join('')
      : '';
    $('#roundEndReactions').innerHTML = reactionsHtml;

    // Scores
    const scores = Array.isArray(data.scores) ? data.scores : Object.values(data.scores || {});
    const sorted = scores.sort((a, b) => b.score - a.score);
    const scoresHtml = sorted.map((p) =>
      `<div class="score-row"><span class="score-name">${p.name}</span><span class="score-pts">${p.score}</span></div>`
    ).join('');
    $('#roundEndScores').innerHTML = scoresHtml;

    // Auto-hide after 4.5s
    setTimeout(() => hide(roundEndOverlay), 4500);
  });

  socket.on('gameOver', (data) => {
    clearTimer();
    hide(roundEndOverlay);
    show(gameOverOverlay);

    const scores = Array.isArray(data.scores) ? data.scores : Object.values(data.scores || {});
    const sorted = scores.sort((a, b) => b.score - a.score);
    const html = sorted.map((p, i) => {
      const medal = RANK_MEDALS[i] || `#${i + 1}`;
      const first = i === 0 ? 'first' : '';
      return `
        <div class="final-row ${first}">
          <span class="final-rank">${medal}</span>
          <span class="final-name">${p.name}</span>
          <span class="final-pts">${p.score}</span>
        </div>`;
    }).join('');
    $('#finalScores').innerHTML = html;

    // Clear room session on game over so lobby is clean next time
    currentRoom = null;
    sessionStorage.removeItem('tot-room');
  });

  socket.on('gameReset', (data) => {
    clearTimer();
    hide(roundEndOverlay);
    hide(gameOverOverlay);
    showScreen('waiting');
    addSystemMessage(data.message);
    renderWaitingPlayers(data.players);
    updateStartBtn(data.players.length);
  });

  socket.on('error', (data) => {
    alert(data.message);
  });

  socket.on('chatBroadcast', (data) => {
    addChatMessage(data.playerName, data.message);
  });

  // ============================================================
  // UI Helpers
  // ============================================================

  function showScreen(name) {
    [lobbyScreen, waitingScreen, gameScreen].forEach(hide);
    if (name === 'lobby')   show(lobbyScreen);
    if (name === 'waiting') show(waitingScreen);
    if (name === 'game')    show(gameScreen);
  }

  function getName() {
    const name = $('#playerName').value.trim();
    if (!name) { alert('Enter your name first!'); return null; }
    myName = name;
    sessionStorage.setItem('tot-name', name);
    return name;
  }

  function renderWaitingPlayers(players) {
    const container = $('#waitingPlayers');
    container.innerHTML = players.map((p) => {
      const ownerClass = p.isOwner ? ' owner' : '';
      const badge = p.isOwner ? ' 👑' : '';
      return `<div class="player-chip${ownerClass}">${p.name}${badge}</div>`;
    }).join('');
    $('#playerCount').textContent = players.length;
  }

  function updateStartBtn(count) {
    const btn = $('#startGameBtn');
    if (count === undefined) {
      // Just updating owner status
      btn.disabled = !isOwner || (parseInt($('#playerCount').textContent, 10) || 0) < 2;
      btn.textContent = isOwner ? 'Start Game 🚀' : 'Waiting for owner to start…';
      return;
    }
    if (isOwner && count >= 2) {
      btn.disabled = false;
      btn.textContent = 'Start Game 🚀';
    } else if (isOwner) {
      btn.disabled = true;
      btn.textContent = 'Need 2+ players to start';
    } else {
      btn.disabled = true;
      btn.textContent = 'Waiting for owner to start…';
    }
  }

  function renderPlayerList(players) {
    const container = $('#playerList');
    if (!container) return;
    container.innerHTML = players.map((p) => {
      const activeClass = p.isHotSeat ? ' active-turn' : '';
      const dcClass = p.disconnected ? ' disconnected' : '';
      let badges = '';
      if (p.isOwner) badges += '<span class="p-badge badge-owner">Owner</span>';
      if (p.isHotSeat) badges += '<span class="p-badge badge-hotseat">Hot Seat</span>';
      return `
        <div class="p-row${activeClass}${dcClass}">
          <span class="p-name">${p.name}</span>
          ${badges}
          <span class="p-score">${p.score}</span>
        </div>`;
    }).join('');
  }

  function restoreGameState(gs) {
    $('#roundDisplay').textContent = gs.roundNum;
    $('#maxRoundDisplay').textContent = gs.maxRounds;

    if (gs.phase === 'answering') {
      socket.emit('_noop'); // newQuestion event was missed, simulate it
      show($('#questionPhase'));
      hide($('#votingPhase'));
      const badge = $('#questionBadge');
      badge.textContent = gs.question.category === 'truth' ? '🫣 Truth' : '😈 Tease';
      badge.className = `q-badge ${gs.question.category}`;
      $('#questionText').textContent = gs.question.text;
      const isHotSeat = gs.hotSeat === mySocketId;
      $('#hotSeatLabel').textContent = isHotSeat
        ? "🔥 It's YOUR turn — spill it!"
        : `🔥 ${gs.hotSeatName} is in the hot seat`;
      if (isHotSeat) { show($('#answerBox')); hide($('#waitingForAnswer')); }
      else { hide($('#answerBox')); show($('#waitingForAnswer')); }
      startTimer(gs.remainingTime || 30);
    } else if (gs.phase === 'voting') {
      hide($('#questionPhase'));
      show($('#votingPhase'));
      const vBadge = $('#voteQuestionBadge');
      vBadge.textContent = gs.question.category === 'truth' ? '🫣 Truth' : '😈 Tease';
      vBadge.className = `q-badge ${gs.question.category}`;
      $('#voteQuestionText').textContent = gs.question.text;
      $('#answerAuthor').textContent = `${gs.hotSeatName} answered:`;
      $('#revealedAnswer').textContent = gs.answer || '(skipped)';
      const isHotSeat = gs.hotSeat === mySocketId;
      $$('.reaction-btn').forEach((btn) => {
        btn.disabled = isHotSeat;
        btn.classList.remove('selected');
      });
      $('#liveReactions').innerHTML = '';
      startTimer(gs.remainingTime || 15);
    }
  }

  // ---------- Timer ----------
  function startTimer(seconds) {
    clearTimer();
    timerValue = Math.ceil(seconds);
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timerValue--;
      if (timerValue <= 0) { timerValue = 0; clearTimer(); }
      updateTimerDisplay();
    }, 1000);
  }

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function updateTimerDisplay() {
    const el = $('#timerDisplay');
    el.textContent = timerValue;
    el.className = 'timer';
    if (timerValue > 15) el.classList.add('safe');
    else if (timerValue > 5) el.classList.add('warn');
    // else danger (default)
  }

  // ---------- Chat ----------
  function addSystemMessage(msg) {
    const div = document.createElement('div');
    div.className = 'sys-msg';
    div.textContent = `• ${msg}`;
    appendChat(div);
  }

  function addChatMessage(name, msg) {
    const div = document.createElement('div');
    div.className = 'player-msg';
    div.innerHTML = `<span class="msg-name">${escapeHtml(name)}:</span> ${escapeHtml(msg)}`;
    appendChat(div);
  }

  function appendChat(el) {
    const container = $('#chatMessages');
    if (!container) return;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    // Keep last 100 messages
    while (container.children.length > 100) container.removeChild(container.firstChild);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
