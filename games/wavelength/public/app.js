// ============================================================
// WAVELENGTH — Client (plain script, NOT a module)
// ============================================================
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => el && el.classList.remove('hidden');
  const hide = el => el && el.classList.add('hidden');
  const MEDALS = ['🥇', '🥈', '🥉'];

  // Phase durations (ms) — must match server.
  const CLUE_DURATION = 30000;
  const GUESS_DURATION = 30000;
  const REVEAL_DURATION = 8000;

  // ── Session / persistence ──
  let sessionId = sessionStorage.getItem('adg_wavelength_session');
  if (!sessionId) {
    sessionId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('adg_wavelength_session', sessionId);
  }
  let currentRoom = sessionStorage.getItem('adg_wavelength_room');
  let myName = sessionStorage.getItem('adg_wavelength_name') || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let isClueGiver = false;
  let secretTarget = null;     // only set for clue-giver
  let hasGuessed = false;
  let timerInterval = null;
  let selectedRounds = 0;      // 0 = auto

  // ── Socket ──
  const socket = io('/wavelength');

  // Pre-fill name (router also pre-fills; keep in sync)
  if (myName && $('#playerName')) $('#playerName').value = myName;

  // ═══════════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════════
  $$('#roundsSelector .sel-btn').forEach(b => b.addEventListener('click', () => {
    $$('#roundsSelector .sel-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedRounds = +b.dataset.rounds;
  }));

  $('#createRoomBtn').addEventListener('click', () => {
    const name = getName(); if (!name) return;
    socket.emit('createRoom', { playerName: name, rounds: selectedRounds, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => {
    const name = getName(); if (!name) return;
    const code = $('#roomCodeInput').value.trim().toUpperCase();
    if (!code) { alert('Enter a room code!'); return; }
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  $('#playerName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#createRoomBtn').click(); });
  $('#roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinRoomBtn').click(); });

  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));
  $('#playAgainBtn').addEventListener('click', () => {
    if (!isOwner) return;
    socket.emit('playAgain');
  });

  // Clue submit
  $('#submitClueBtn').addEventListener('click', sendClue);
  $('#clueInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendClue(); });
  function sendClue() {
    const clue = $('#clueInput').value.trim();
    if (!clue) return;
    socket.emit('submitClue', { clue });
    $('#submitClueBtn').disabled = true;
    $('#clueInput').disabled = true;
  }

  // Guess slider
  $('#guessSlider').addEventListener('input', () => {
    if (hasGuessed) return;
    updateSliderHandle(+$('#guessSlider').value);
  });
  $('#submitGuessBtn').addEventListener('click', () => {
    if (hasGuessed) return;
    socket.emit('submitGuess', { value: +$('#guessSlider').value });
    $('#submitGuessBtn').disabled = true;
  });

  // Chat
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#chatSend').click(); });
  $('#chatSend').addEventListener('click', () => {
    const msg = $('#chatInput').value.trim();
    if (!msg) return;
    socket.emit('chatMessage', msg);
    $('#chatInput').value = '';
  });

  // ═══════════════════════════════════════════════
  // Socket events
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
    if (!box || !wrap) return;
    if (!list || !list.length) { hide(wrap); return; }
    show(wrap);
    box.innerHTML = list.map(r =>
      `<div class="room-item" data-room="${r.id}"><span class="room-id">${r.id}</span>` +
      `<span class="room-badge">${r.players}/12 · ${r.state}</span></div>`
    ).join('');
    box.querySelectorAll('.room-item').forEach(el => el.addEventListener('click', () => {
      const name = getName(); if (!name) return;
      socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
    }));
  });

  socket.on('joinedRoom', data => {
    currentRoom = data.roomId;
    sessionStorage.setItem('adg_wavelength_room', currentRoom);
    isOwner = data.isOwner;
    myId = socket.id;
    if (data.maxRounds) $('#maxRounds').textContent = data.maxRounds;

    if (data.state === 'waiting') {
      showScreen('waiting');
      renderWaiting(data.players);
      $('#roomCodeDisplay').textContent = data.roomId;
      updateStartBtn(data.players.length);
    } else if (data.state === 'gameOver') {
      showScreen('waiting');
      renderWaiting(data.players);
      $('#roomCodeDisplay').textContent = data.roomId;
      updateStartBtn(data.players.length);
    } else {
      showScreen('game');
      hide($('#gameOverOverlay'));
      renderPlayers(data.players);
      if (data.gameState) restoreGameState(data.gameState);
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem('adg_wavelength_room');
    showScreen('lobby');
  });

  socket.on('playerJoined', d => sysMsg(`${d.playerName} joined`));
  socket.on('playerLeft', d => sysMsg(`${d.playerName} left${d.mayReconnect ? ' (may reconnect)' : ''}`));
  socket.on('playerReconnected', d => sysMsg(`${d.playerName} reconnected!`));
  socket.on('systemMessage', d => sysMsg(d.message));
  socket.on('errorMsg', d => alert(d.message));
  socket.on('chatBroadcast', d => chatMsg(d.playerName, d.message));

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

  // ── Game flow ──
  socket.on('newRound', data => {
    showScreen('game');
    hide($('#gameOverOverlay'));
    resetRoundUi();

    $('#roundNum').textContent = data.roundNum;
    $('#maxRounds').textContent = data.maxRounds;
    setSpectrum(data.spectrum);

    isClueGiver = data.clueGiverId === myId;
    secretTarget = null; // arrives via 'yourTarget' for the clue-giver

    enterCluePhase(data.clueGiverName, isClueGiver);
    startTimer(data.clueDuration || CLUE_DURATION);
  });

  socket.on('yourTarget', d => {
    secretTarget = d.target;
    // We are the clue-giver — paint the secret target on the bar.
    showTarget(secretTarget);
  });

  socket.on('clueAccepted', () => {
    // handled by phase change; nothing else needed
  });

  socket.on('guessPhase', data => {
    enterGuessPhase(data);
    startTimer(data.guessDuration || GUESS_DURATION);
  });

  socket.on('guessUpdate', d => {
    $('#guessCount').textContent = `${d.totalGuessed}/${d.totalGuessers} locked in`;
  });

  socket.on('guessAccepted', d => {
    hasGuessed = true;
    $('#submitGuessBtn').disabled = true;
    $('#guessSlider').disabled = true;
    show($('#guessSubmitted'));
  });

  socket.on('reveal', data => enterRevealPhase(data));

  socket.on('gameOver', data => {
    stopTimer();
    show($('#gameOverOverlay'));
    const scores = Array.isArray(data.scores) ? data.scores : Object.values(data.scores || {});
    scores.sort((a, b) => b.score - a.score);
    $('#finalScores').innerHTML = scores.map((p, i) => {
      const m = MEDALS[i] || `#${i + 1}`;
      return `<div class="score-row${i === 0 ? ' first' : ''}"><span class="rank">${m}</span>` +
        `<span class="s-name">${esc(p.name)}</span><span class="s-score">${p.score}</span></div>`;
    }).join('');
    $('#playAgainBtn').disabled = !isOwner;
    $('#playAgainBtn').textContent = isOwner ? 'Play Again' : 'Waiting for owner…';
    currentRoom && sessionStorage.setItem('adg_wavelength_room', currentRoom);
  });

  socket.on('gameReset', data => {
    stopTimer();
    hide($('#gameOverOverlay'));
    showScreen('waiting');
    sysMsg(data.message);
    renderWaiting(data.players);
    if (currentRoom) $('#roomCodeDisplay').textContent = currentRoom;
    updateStartBtn(data.players.length);
  });

  // ═══════════════════════════════════════════════
  // Phase UI
  // ═══════════════════════════════════════════════
  function hideAllPhases() {
    [$('#cluePhaseArea'), $('#guessPhaseArea'), $('#revealPhaseArea')].forEach(hide);
  }

  function resetRoundUi() {
    hasGuessed = false;
    hide($('#targetMarker'));
    hide($('#targetZone'));
    hide($('#sliderHandle'));
    hide($('#sliderValue'));
    $('#guessLayer').innerHTML = '';
    $('#clueInput').value = '';
    $('#clueInput').disabled = false;
    $('#submitClueBtn').disabled = false;
    $('#guessSlider').disabled = false;
    $('#guessSlider').value = 50;
    $('#submitGuessBtn').disabled = false;
    hide($('#guessSubmitted'));
  }

  function enterCluePhase(clueGiverName, mine) {
    setPhaseLabel('Clue');
    hideAllPhases();
    show($('#cluePhaseArea'));
    const banner = $('#clueGiverBanner');
    if (mine) {
      banner.textContent = "📡 You are the clue-giver";
      banner.classList.add('mine');
      show($('#clueGiverPrompt'));
      hide($('#clueWaiting'));
      $('#clueInput').focus();
    } else {
      banner.textContent = `📡 ${clueGiverName} is the clue-giver`;
      banner.classList.remove('mine');
      hide($('#clueGiverPrompt'));
      show($('#clueWaiting'));
      $('#clueGiverWaitName').textContent = clueGiverName;
    }
    show($('#clueGiverBanner'));
  }

  function enterGuessPhase(data) {
    setPhaseLabel('Guess');
    hideAllPhases();
    show($('#guessPhaseArea'));
    if (data.spectrum) setSpectrum(data.spectrum);
    $('#clueDisplay').textContent = data.clue || '';
    isClueGiver = data.clueGiverId === myId;

    // Clue-giver watches; everyone else guesses.
    if (isClueGiver) {
      hide($('#guesserControls'));
      show($('#clueGiverWatch'));
      hide($('#sliderHandle'));
      hide($('#sliderValue'));
      // Keep showing the secret target marker to the clue-giver.
      if (secretTarget !== null) showTarget(secretTarget);
    } else {
      show($('#guesserControls'));
      hide($('#clueGiverWatch'));
      hide($('#targetMarker'));
      hide($('#targetZone'));
      if (!hasGuessed) {
        $('#guessSlider').disabled = false;
        $('#submitGuessBtn').disabled = false;
        $('#guessSlider').value = 50;
        updateSliderHandle(50);
      }
    }
    $('#guessCount').textContent = '0/0 locked in';
  }

  function enterRevealPhase(data) {
    stopTimer();
    setPhaseLabel('Reveal');
    hideAllPhases();
    show($('#revealPhaseArea'));
    if (data.spectrum) setSpectrum(data.spectrum);

    // Show target marker + zone for everyone.
    showTarget(data.target);
    $('#revealTargetVal').textContent = data.target;

    // Plot each guess on the bar + list the points.
    const layer = $('#guessLayer');
    layer.innerHTML = '';
    show($('#guessLayer'));
    hide($('#sliderHandle'));
    hide($('#sliderValue'));

    (data.guesses || []).forEach(g => {
      if (g.guess === null || g.guess === undefined) return;
      const dot = document.createElement('div');
      dot.className = 'wl-guess-dot';
      dot.style.left = `${g.guess}%`;
      dot.style.background = g.avatar || 'var(--accent)';
      dot.title = `${g.name}: ${g.guess}`;
      layer.appendChild(dot);
    });

    const list = $('#revealList');
    let rows = (data.guesses || []).map(g => {
      const gv = (g.guess === null || g.guess === undefined) ? '—' : g.guess;
      return `<div class="wl-reveal-row"><span class="wl-rv-dot" style="background:${g.avatar || 'var(--accent)'}"></span>` +
        `<span class="wl-rv-name">${esc(g.name)}</span>` +
        `<span class="wl-rv-guess">${gv}</span>` +
        `<span class="wl-rv-pts">+${g.points}</span></div>`;
    });
    rows.unshift(
      `<div class="wl-reveal-row wl-rv-clue"><span class="wl-rv-dot" style="background:var(--accent-2)"></span>` +
      `<span class="wl-rv-name">${esc(data.clueGiverName)} <em>(clue-giver)</em></span>` +
      `<span class="wl-rv-guess">"${esc(data.clue)}"</span>` +
      `<span class="wl-rv-pts">+${data.clueGiverPoints}</span></div>`
    );
    list.innerHTML = rows.join('');

    if (data.scores) renderPlayers(data.scores);
  }

  // ═══════════════════════════════════════════════
  // Spectrum bar helpers
  // ═══════════════════════════════════════════════
  function setSpectrum(spec) {
    if (!spec) return;
    $('#labelLeft').textContent = spec.left;
    $('#labelRight').textContent = spec.right;
  }

  function showTarget(target) {
    if (target === null || target === undefined) return;
    const marker = $('#targetMarker');
    const zone = $('#targetZone');
    marker.style.left = `${target}%`;
    show(marker);
    // A small "bullseye" zone around the target (±5) for visual feedback.
    const lo = Math.max(0, target - 5);
    const hi = Math.min(100, target + 5);
    zone.style.left = `${lo}%`;
    zone.style.width = `${hi - lo}%`;
    show(zone);
  }

  function updateSliderHandle(val) {
    const handle = $('#sliderHandle');
    const valEl = $('#sliderValue');
    handle.style.left = `${val}%`;
    show(handle);
    valEl.textContent = val;
    valEl.style.left = `${val}%`;
    show(valEl);
  }

  // ═══════════════════════════════════════════════
  // Reconnect restore
  // ═══════════════════════════════════════════════
  function restoreGameState(gs) {
    showScreen('game');
    resetRoundUi();
    $('#roundNum').textContent = gs.roundNum;
    $('#maxRounds').textContent = gs.maxRounds;
    setSpectrum(gs.spectrum);
    isClueGiver = gs.isClueGiver;
    if (gs.target !== undefined && gs.target !== null) secretTarget = gs.target;

    if (gs.state === 'clue') {
      enterCluePhase(gs.clueGiverName, gs.isClueGiver);
      if (gs.isClueGiver && secretTarget !== null) showTarget(secretTarget);
      if (gs.isClueGiver && gs.clue && gs.clue !== '(no clue given)') {
        // We already submitted a clue this round.
        $('#clueInput').value = gs.clue;
      }
    } else if (gs.state === 'guess') {
      enterGuessPhase({
        clue: gs.clue,
        spectrum: gs.spectrum,
        clueGiverId: gs.clueGiverId,
        clueGiverName: gs.clueGiverName
      });
      if (!gs.isClueGiver && gs.myGuess !== null && gs.myGuess !== undefined) {
        hasGuessed = true;
        $('#guessSlider').value = gs.myGuess;
        $('#guessSlider').disabled = true;
        $('#submitGuessBtn').disabled = true;
        updateSliderHandle(gs.myGuess);
        show($('#guessSubmitted'));
      }
      $('#guessCount').textContent = `${gs.totalGuessed}/${gs.totalGuessers} locked in`;
    } else if (gs.state === 'reveal') {
      enterRevealPhase({
        spectrum: gs.spectrum,
        target: gs.target,
        clue: gs.clue,
        clueGiverName: gs.clueGiverName,
        clueGiverPoints: gs.clueGiverPoints,
        guesses: gs.guesses
      });
    }
  }

  // ═══════════════════════════════════════════════
  // Timer (display only — server drives transitions)
  // ═══════════════════════════════════════════════
  function startTimer(durationMs) {
    stopTimer();
    let remaining = Math.ceil((durationMs || 30000) / 1000);
    const el = $('#timerDisplay');
    el.textContent = remaining;
    el.classList.toggle('urgent', remaining <= 5);
    timerInterval = setInterval(() => {
      remaining--;
      if (remaining < 0) { stopTimer(); return; }
      el.textContent = remaining;
      el.classList.toggle('urgent', remaining <= 5);
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  // ═══════════════════════════════════════════════
  // Generic UI helpers
  // ═══════════════════════════════════════════════
  function showScreen(name) {
    [$('#lobbyScreen'), $('#waitingScreen'), $('#gameScreen')].forEach(hide);
    if (name === 'lobby') show($('#lobbyScreen'));
    if (name === 'waiting') show($('#waitingScreen'));
    if (name === 'game') show($('#gameScreen'));
  }

  function getName() {
    const n = $('#playerName').value.trim();
    if (!n) { alert('Enter your name!'); return null; }
    myName = n;
    sessionStorage.setItem('adg_wavelength_name', n);
    return n;
  }

  function setPhaseLabel(p) { $('#phaseLabel').textContent = p; }

  function renderWaiting(players) {
    $('#waitingPlayers').innerHTML = players.map(p =>
      `<div class="player-chip"><span class="player-avatar" style="background:${p.avatar}">${esc((p.name[0] || '?').toUpperCase())}</span>` +
      `<span>${esc(p.name)}${p.isOwner ? ' 👑' : ''}</span></div>`
    ).join('');
    $('#pCount').textContent = players.length;
  }

  function updateStartBtn(count) {
    const btn = $('#startGameBtn');
    if (!btn) return;
    if (count === undefined) count = parseInt($('#pCount').textContent, 10) || 0;
    if (isOwner && count >= 2) { btn.disabled = false; btn.textContent = 'Start Game 🚀'; }
    else if (isOwner) { btn.disabled = true; btn.textContent = 'Need 2+ players'; }
    else { btn.disabled = true; btn.textContent = 'Waiting for owner…'; }
  }

  function renderPlayers(players) {
    const c = $('#playerList');
    if (!c) return;
    c.innerHTML = players.map(p => {
      let cls = 'player-row';
      if (p.isClueGiver) cls += ' is-drawer';
      if (p.hasGuessed) cls += ' guessed';
      if (p.disconnected) cls += ' dc';
      let badge = '';
      if (p.isClueGiver) badge = '<span class="player-badge" title="Clue-giver">📡</span>';
      else if (p.hasGuessed) badge = '<span class="player-badge" title="Locked in">✅</span>';
      if (p.isOwner) badge += '<span class="player-badge" title="Owner">👑</span>';
      return `<div class="${cls}"><span class="player-avatar" style="background:${p.avatar}">${esc((p.name[0] || '?').toUpperCase())}</span>` +
        `<span class="p-name">${esc(p.name)}</span>${badge}<span class="p-score">${p.score}</span></div>`;
    }).join('');
  }

  // ── Chat ──
  function sysMsg(msg) {
    const d = document.createElement('div');
    d.className = 'chat-msg system';
    d.textContent = msg;
    appendChat(d);
  }
  function chatMsg(name, msg) {
    const d = document.createElement('div');
    d.className = 'chat-msg';
    d.innerHTML = `<span class="author">${esc(name)}:</span> ${esc(msg)}`;
    appendChat(d);
  }
  function appendChat(el) {
    const c = $('#chatLog');
    if (!c) return;
    c.appendChild(el);
    c.scrollTop = c.scrollHeight;
    while (c.children.length > 100) c.removeChild(c.firstChild);
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  // ═══════════════════════════════════════════════
  // SPA teardown hook
  // ═══════════════════════════════════════════════
  window.__gameCleanup = function () {
    stopTimer();
    try { socket.disconnect(); } catch (e) { /* noop */ }
  };
})();
