// ============================================================
// DARE ROULETTE — Client
// ============================================================
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => el.classList.remove('hidden');
  const hide = el => el.classList.add('hidden');
  const MEDALS = ['🥇','🥈','🥉'];

  // ── Session ──
  let sessionId = sessionStorage.getItem('dr-session');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('dr-session', sessionId);
  }
  let currentRoom = sessionStorage.getItem('dr-room');
  let myName = sessionStorage.getItem('dr-name') || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let history = [];  // local copy

  // ── Settings ──
  let selectedRounds = 3;
  let selectedIntensity = 2;
  let selectedCategories = ['physical','social','creative','embarrassing','wildcard'];

  // ── Socket ──
  const socket = io('/dare-roulette');

  // ── Init ──
  if (myName) $('#playerName').value = myName;

  // ═══════════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════════

  // Rounds pills
  $$('.pill[data-rounds]').forEach(b => b.addEventListener('click', () => {
    $$('.pill[data-rounds]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedRounds = +b.dataset.rounds;
  }));

  // Intensity pills
  $$('.int-pill').forEach(b => b.addEventListener('click', () => {
    $$('.int-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedIntensity = +b.dataset.int;
  }));

  // Category pills (toggle)
  $$('.cat-pill').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('active');
    selectedCategories = [...$$('.cat-pill.active')].map(x => x.dataset.cat);
  }));

  // Create room
  $('#createRoomBtn').addEventListener('click', () => {
    const name = getName(); if (!name) return;
    socket.emit('createRoom', {
      playerName: name, rounds: selectedRounds, sessionId,
      categories: selectedCategories.length ? selectedCategories : null,
      intensity: selectedIntensity
    });
  });

  // Join room
  $('#joinRoomBtn').addEventListener('click', () => {
    const name = getName(); if (!name) return;
    const code = $('#roomCodeInput').value.trim().toUpperCase();
    if (!code) return alert('Enter a room code!');
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  $('#playerName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#createRoomBtn').click(); });
  $('#roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinRoomBtn').click(); });

  // Start game
  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));

  // Spin
  $('#spinBtn').addEventListener('click', () => {
    socket.emit('spin');
    $('#spinBtn').disabled = true;
  });

  // Resolve
  $('#completedBtn').addEventListener('click', () => socket.emit('resolveDare', { completed: true }));
  $('#chickenBtn').addEventListener('click', () => socket.emit('resolveDare', { completed: false }));

  // Play again
  $('#playAgainBtn').addEventListener('click', () => {
    hide($('#gameOverOverlay'));
    showScreen('waiting');
  });

  // History
  $('#historyBtn').addEventListener('click', () => {
    renderHistory();
    show($('#historyOverlay'));
  });
  $('#closeHistory').addEventListener('click', () => hide($('#historyOverlay')));

  // Chat
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#chatSend').click(); });
  $('#chatSend').addEventListener('click', () => {
    const msg = $('#chatInput').value.trim();
    if (!msg) return;
    socket.emit('chatMessage', msg);
    $('#chatInput').value = '';
  });

  // ═══════════════════════════════════════════════
  // Socket Events
  // ═══════════════════════════════════════════════

  socket.on('connect', () => {
    myId = socket.id;
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });

  socket.on('roomList', list => {
    const box = $('#roomListBox');
    const wrap = $('#activeRooms');
    if (!list || !list.length) { hide(wrap); return; }
    show(wrap);
    box.innerHTML = list.map(r =>
      `<div class="room-item" data-room="${r.id}"><span>${r.id}</span><span style="color:var(--muted);font-size:.82rem">${r.players}/10 · ${r.state}</span></div>`
    ).join('');
    box.querySelectorAll('.room-item').forEach(el => el.addEventListener('click', () => {
      const name = getName(); if (!name) return;
      socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
    }));
  });

  socket.on('joinedRoom', data => {
    currentRoom = data.roomId;
    sessionStorage.setItem('dr-room', currentRoom);
    isOwner = data.isOwner;
    myId = socket.id;
    history = data.history || [];

    if (data.state === 'waiting') {
      showScreen('waiting');
      renderWaiting(data.players);
      $('#roomCodeShow').textContent = data.roomId;
      updateStartBtn(data.players.length);
    } else {
      showScreen('game');
      renderPlayers(data.players);
      if (data.currentTurn) restoreGameState(data);
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem('dr-room');
    showScreen('lobby');
  });

  socket.on('playerJoined', d => {
    sysMsg(`${d.playerName} joined`);
  });

  socket.on('playerLeft', d => {
    sysMsg(`${d.playerName} left${d.mayReconnect ? ' (may reconnect)' : ''}`);
  });

  socket.on('playerReconnected', d => sysMsg(`${d.playerName} reconnected!`));

  socket.on('ownerUpdate', d => {
    isOwner = d.owner === myId;
    updateStartBtn();
  });

  socket.on('playerList', players => {
    renderPlayers(players);
    if (!$('#waitingScreen').classList.contains('hidden')) {
      renderWaiting(players);
      updateStartBtn(players.length);
    }
  });

  socket.on('systemMessage', d => sysMsg(d.message));

  // ── Game flow ──

  socket.on('newTurn', data => {
    showScreen('game');
    hide($('#gameOverOverlay'));
    hide($('#dareArea'));
    hide($('#resolvedSplash'));
    show($('#spinnerArea'));

    $('#roundNum').textContent = data.roundNum;
    $('#maxRounds').textContent = data.maxRounds;

    const isMine = data.spinner === myId;
    $('#turnLabel').textContent = isMine
      ? "🎰 It's YOUR turn — spin the wheel!"
      : `🎰 ${data.spinnerName} is spinning…`;

    // Reset wheel
    const wheel = $('#wheel');
    wheel.classList.remove('spinning');
    void wheel.offsetWidth; // force reflow

    if (isMine) { show($('#spinBtn')); hide($('#spinWait')); $('#spinBtn').disabled = false; }
    else        { hide($('#spinBtn')); show($('#spinWait')); }
  });

  socket.on('spinAnimation', data => {
    hide($('#spinBtn'));
    hide($('#spinWait'));
    $('#turnLabel').textContent = `${data.spinnerName} spins the wheel!`;
    const wheel = $('#wheel');
    wheel.classList.remove('spinning');
    void wheel.offsetWidth;
    wheel.classList.add('spinning');
  });

  socket.on('dareRevealed', data => {
    hide($('#spinnerArea'));
    show($('#dareArea'));
    hide($('#resolvedSplash'));

    const badge = $('#dareCatBadge');
    badge.textContent = catLabel(data.dare.category);
    badge.className = `cat-badge ${data.dare.category}`;
    $('#dareText').textContent = data.dare.text;

    // Intensity dots
    let dots = '';
    for (let i = 1; i <= 3; i++) dots += `<span class="i-dot${i <= data.dare.intensity ? ' on' : ''}"></span>`;
    $('#intensityDots').innerHTML = dots;

    const isMine = data.spinner === myId;
    if (isMine) { show($('#resolveBox')); hide($('#resolveWait')); }
    else        { hide($('#resolveBox')); show($('#resolveWait')); }
  });

  socket.on('dareResolved', data => {
    hide($('#dareArea'));
    hide($('#spinnerArea'));
    show($('#resolvedSplash'));

    const emoji = data.completed ? '🎉' : '🐔';
    const word  = data.completed ? 'DID IT!' : 'Chickened out…';
    const pts   = data.completed ? `+${data.points} pts` : '0 pts';
    $('#resolvedSplash').innerHTML = `
      <div class="splash-inner">
        <div class="splash-emoji">${emoji}</div>
        <div class="splash-text">${esc(data.spinnerName)} ${word}</div>
        <div class="splash-pts">${pts}</div>
      </div>`;

    if (data.historyEntry) history.push(data.historyEntry);
    if (data.scores) renderPlayers(data.scores);
  });

  socket.on('gameOver', data => {
    hide($('#dareArea'));
    hide($('#spinnerArea'));
    hide($('#resolvedSplash'));
    show($('#gameOverOverlay'));
    if (data.history) history = data.history;

    const scores = Array.isArray(data.scores) ? data.scores : Object.values(data.scores || {});
    scores.sort((a, b) => b.score - a.score);
    $('#finalScores').innerHTML = scores.map((p, i) => {
      const m = MEDALS[i] || `#${i+1}`;
      return `<div class="f-row${i===0?' first':''}"><span class="f-rank">${m}</span><span class="f-name">${esc(p.name)}</span><span class="f-pts">${p.score}</span></div>`;
    }).join('');

    currentRoom = null;
    sessionStorage.removeItem('dr-room');
  });

  socket.on('gameReset', data => {
    hide($('#gameOverOverlay'));
    showScreen('waiting');
    sysMsg(data.message);
    renderWaiting(data.players);
    updateStartBtn(data.players.length);
  });

  socket.on('error', d => alert(d.message));

  socket.on('chatBroadcast', d => chatMsg(d.playerName, d.message));

  // ═══════════════════════════════════════════════
  // UI Helpers
  // ═══════════════════════════════════════════════

  function showScreen(name) {
    [$('#lobbyScreen'), $('#waitingScreen'), $('#gameScreen')].forEach(hide);
    if (name === 'lobby')   show($('#lobbyScreen'));
    if (name === 'waiting') show($('#waitingScreen'));
    if (name === 'game')    show($('#gameScreen'));
  }

  function getName() {
    const n = $('#playerName').value.trim();
    if (!n) { alert('Enter your name!'); return null; }
    myName = n;
    sessionStorage.setItem('dr-name', n);
    return n;
  }

  function renderWaiting(players) {
    $('#waitingPlayers').innerHTML = players.map(p => {
      const oc = p.isOwner ? ' owner' : '';
      return `<div class="chip${oc}">${esc(p.name)}${p.isOwner?' 👑':''}</div>`;
    }).join('');
    $('#pCount').textContent = players.length;
  }

  function updateStartBtn(count) {
    const btn = $('#startGameBtn');
    if (count === undefined) count = parseInt($('#pCount').textContent, 10) || 0;
    if (isOwner && count >= 2) { btn.disabled = false; btn.textContent = 'Start Game 🚀'; }
    else if (isOwner) { btn.disabled = true; btn.textContent = 'Need 2+ players'; }
    else { btn.disabled = true; btn.textContent = 'Waiting for owner…'; }
  }

  function renderPlayers(players) {
    const c = $('#playerList');
    if (!c) return;
    c.innerHTML = players.map(p => {
      const s = p.isSpinner ? ' spinner' : '';
      const d = p.disconnected ? ' dc' : '';
      let badges = '';
      if (p.isOwner)   badges += '<span class="p-badge badge-owner">Owner</span>';
      if (p.isSpinner) badges += '<span class="p-badge badge-spinner">Spinner</span>';
      return `<div class="p-row${s}${d}"><span class="p-name">${esc(p.name)}</span>${badges}<span class="p-score">${p.score}</span></div>`;
    }).join('');
  }

  function restoreGameState(data) {
    const ct = data.currentTurn;
    if (!ct) return;
    $('#roundNum').textContent = ct.roundNum;
    $('#maxRounds').textContent = ct.maxRounds;

    if (data.state === 'spinning') {
      show($('#spinnerArea')); hide($('#dareArea')); hide($('#resolvedSplash'));
      const isMine = ct.spinner === myId;
      $('#turnLabel').textContent = isMine ? "🎰 Your turn — spin!" : `🎰 ${ct.spinnerName} is spinning…`;
      if (isMine) { show($('#spinBtn')); hide($('#spinWait')); }
      else        { hide($('#spinBtn')); show($('#spinWait')); }
    } else if (data.state === 'dareReveal' && ct.dare) {
      hide($('#spinnerArea')); show($('#dareArea')); hide($('#resolvedSplash'));
      const badge = $('#dareCatBadge');
      badge.textContent = catLabel(ct.dare.category);
      badge.className = `cat-badge ${ct.dare.category}`;
      $('#dareText').textContent = ct.dare.text;
      let dots = '';
      for (let i = 1; i <= 3; i++) dots += `<span class="i-dot${i <= ct.dare.intensity ? ' on' : ''}"></span>`;
      $('#intensityDots').innerHTML = dots;
      const isMine = ct.spinner === myId;
      if (isMine) { show($('#resolveBox')); hide($('#resolveWait')); }
      else        { hide($('#resolveBox')); show($('#resolveWait')); }
    }
  }

  function renderHistory() {
    const c = $('#historyList');
    if (!history.length) { c.innerHTML = '<p style="color:var(--muted)">No dares yet.</p>'; return; }
    c.innerHTML = history.slice().reverse().map(h => {
      const res = h.completed
        ? '<span class="h-result done">✅ Completed (+' + h.points + ')</span>'
        : '<span class="h-result skip">🐔 Skipped</span>';
      return `<div class="h-entry"><span class="h-player">${esc(h.playerName)}</span><p class="h-dare">${esc(h.dare.text)}</p>${res}</div>`;
    }).join('');
  }

  function catLabel(cat) {
    const m = { physical:'💪 Physical', social:'📱 Social', creative:'🎨 Creative', embarrassing:'😳 Embarrassing', wildcard:'🃏 Wildcard' };
    return m[cat] || cat;
  }

  // ── Chat ──
  function sysMsg(msg) {
    const d = document.createElement('div');
    d.className = 'sys-msg'; d.textContent = `• ${msg}`;
    appendChat(d);
  }
  function chatMsg(name, msg) {
    const d = document.createElement('div');
    d.className = 'player-msg';
    d.innerHTML = `<span class="msg-name">${esc(name)}:</span> ${esc(msg)}`;
    appendChat(d);
  }
  function appendChat(el) {
    const c = $('#chatLog');
    if (!c) return;
    c.appendChild(el);
    c.scrollTop = c.scrollHeight;
    while (c.children.length > 100) c.removeChild(c.firstChild);
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ── SPA Cleanup ──
  window.__gameCleanup = function () {
    socket.disconnect();
  };
})();
