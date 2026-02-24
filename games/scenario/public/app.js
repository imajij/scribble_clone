// ============================================================
// SCENARIO — Client
// ============================================================
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => el.classList.remove('hidden');
  const hide = el => el.classList.add('hidden');
  const MEDALS = ['🥇','🥈','🥉'];

  // Phase durations (ms) — must match server
  const READING_DURATION  = 8000;
  const ANSWERING_DURATION = 45000;
  const VOTING_DURATION   = 20000;

  // ── Session ──
  let sessionId = sessionStorage.getItem('sc-session');
  if (!sessionId) {
    sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('sc-session', sessionId);
  }
  let currentRoom = sessionStorage.getItem('sc-room');
  let myName = sessionStorage.getItem('sc-name') || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let history = [];
  let currentAnswers = [];  // for voting phase
  let hasAnswered = false;
  let hasVoted = false;
  let timerInterval = null;
  let autoSubmitTimeout = null; // for answer-phase auto-submit

  // ── Settings ──
  let selectedRounds = 3;
  let selectedIntensity = 2;
  let selectedCategories = ['awkward','spicy','absurd','moral','wildcard'];

  // ── Socket ──
  const socket = io('/scenario');

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

  // Submit answer
  $('#submitAnswerBtn').addEventListener('click', () => {
    const answer = $('#answerInput').value.trim();
    if (!answer) return;
    socket.emit('submitAnswer', { answer });
    $('#submitAnswerBtn').disabled = true;
  });
  $('#answerInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#submitAnswerBtn').click(); }
  });

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
      `<div class="room-item" data-room="${r.id}"><span>${r.id}</span><span style="color:var(--muted);font-size:.82rem">${r.players}/12 · ${r.state}</span></div>`
    ).join('');
    box.querySelectorAll('.room-item').forEach(el => el.addEventListener('click', () => {
      const name = getName(); if (!name) return;
      socket.emit('joinRoom', { roomId: el.dataset.room, playerName: name, sessionId });
    }));
  });

  socket.on('joinedRoom', data => {
    currentRoom = data.roomId;
    sessionStorage.setItem('sc-room', currentRoom);
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
      if (data.gameState) restoreGameState(data);
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem('sc-room');
    showScreen('lobby');
  });

  socket.on('playerJoined', d => sysMsg(`${d.playerName} joined`));
  socket.on('playerLeft', d => sysMsg(`${d.playerName} left${d.mayReconnect ? ' (may reconnect)' : ''}`));
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

  socket.on('newRound', data => {
    showScreen('game');
    hide($('#gameOverOverlay'));
    hasAnswered = false;
    hasVoted = false;
    currentAnswers = [];

    $('#roundNum').textContent = data.roundNum;
    $('#maxRounds').textContent = data.maxRounds;

    // Show scenario
    showScenario(data.scenario);
    setPhaseLabel('Reading');

    // Show reading area
    hideAllPhases();
    show($('#readingArea'));
    startTimerBar($('#readingTimer'), READING_DURATION);
  });

  socket.on('answerPhase', data => {
    setPhaseLabel('Answering');
    hideAllPhases();
    show($('#answeringArea'));

    // Reset answer form
    $('#answerInput').value = '';
    $('#answerInput').disabled = false;
    $('#submitAnswerBtn').disabled = false;
    hide($('#answerSubmitted'));
    show($('#answerInput'));
    show($('.answer-footer'));
    $('#answerCount').textContent = `0/0 answered`;
    startTimerBar($('#answeringTimer'), data.duration || ANSWERING_DURATION);

    // Auto-submit when answering timer expires
    if (autoSubmitTimeout) clearTimeout(autoSubmitTimeout);
    autoSubmitTimeout = setTimeout(() => {
      autoSubmitTimeout = null;
      if (!hasAnswered) {
        const ans = ($('#answerInput').value || '').trim() || '(skipped)';
        socket.emit('submitAnswer', { answer: ans });
        hasAnswered = true;
        $('#submitAnswerBtn').disabled = true;
      }
    }, data.duration || ANSWERING_DURATION);
  });

  socket.on('answerUpdate', data => {
    $('#answerCount').textContent = `${data.totalAnswered}/${data.totalPlayers} answered`;
  });

  socket.on('answerAccepted', () => {
    hasAnswered = true;
    if (autoSubmitTimeout) { clearTimeout(autoSubmitTimeout); autoSubmitTimeout = null; }
    $('#answerInput').disabled = true;
    $('#submitAnswerBtn').disabled = true;
    hide($('#answerInput'));
    hide($('.answer-footer'));
    show($('#answerSubmitted'));
  });

  socket.on('votePhase', data => {
    setPhaseLabel('Voting');
    hideAllPhases();
    show($('#votingArea'));
    hasVoted = false;
    hide($('#voteSubmitted'));

    currentAnswers = data.answers || [];
    const cardsWrap = $('#voteCards');
    cardsWrap.innerHTML = '';

    currentAnswers.forEach((a, i) => {
      const card = document.createElement('div');
      const isOwn = a.id === myId;
      card.className = `vote-card${isOwn ? ' own' : ''}`;
      card.dataset.answerId = a.id;
      card.innerHTML = `
        <div class="vote-card-label">Answer ${i + 1}${isOwn ? ' (yours)' : ''}</div>
        <div class="vote-card-text">${esc(a.text)}</div>
      `;
      if (!isOwn) {
        card.addEventListener('click', () => {
          if (hasVoted) return;
          // Deselect all
          cardsWrap.querySelectorAll('.vote-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          socket.emit('submitVote', { answerId: a.id });
        });
      }
      cardsWrap.appendChild(card);
    });

    $('#voteCount').textContent = `0/0 voted`;
    startTimerBar($('#votingTimer'), data.duration || VOTING_DURATION);
  });

  socket.on('voteUpdate', data => {
    $('#voteCount').textContent = `${data.totalVoted}/${data.totalEligible} voted`;
  });

  socket.on('voteAccepted', () => {
    hasVoted = true;
    show($('#voteSubmitted'));
  });

  socket.on('roundResults', data => {
    setPhaseLabel('Results');
    hideAllPhases();
    show($('#resultsArea'));
    clearTimerBar();

    const wrap = $('#resultCards');
    wrap.innerHTML = '';

    (data.results || []).forEach((r, i) => {
      const card = document.createElement('div');
      card.className = `result-card${r.isBest ? ' best' : ''}`;
      card.style.animationDelay = `${i * 0.1}s`;
      card.innerHTML = `
        <div class="result-header">
          <span class="result-author">${esc(r.playerName)}${r.isBest ? '<span class="result-best-badge">👑 Best</span>' : ''}</span>
          <span class="result-votes">${r.votes} vote${r.votes !== 1 ? 's' : ''}</span>
        </div>
        <div class="result-text">${esc(r.text)}</div>
        <div class="result-points">+${r.points} pts</div>
      `;
      wrap.appendChild(card);
    });

    if (data.scores) renderPlayers(data.scores);
    // Record to history
    history.push({
      roundNum: data.roundNum,
      scenario: data.scenario,
      results: data.results
    });
  });

  socket.on('gameOver', data => {
    hideAllPhases();
    hide($('#scenarioArea'));
    show($('#gameOverOverlay'));
    if (data.history) history = data.history;

    const scores = Array.isArray(data.scores) ? data.scores : Object.values(data.scores || {});
    scores.sort((a, b) => b.score - a.score);
    $('#finalScores').innerHTML = scores.map((p, i) => {
      const m = MEDALS[i] || `#${i+1}`;
      return `<div class="f-row${i===0?' first':''}"><span class="f-rank">${m}</span><span class="f-name">${esc(p.name)}</span><span class="f-pts">${p.score}</span></div>`;
    }).join('');

    currentRoom = null;
    sessionStorage.removeItem('sc-room');
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
    sessionStorage.setItem('sc-name', n);
    return n;
  }

  function hideAllPhases() {
    [$('#readingArea'), $('#answeringArea'), $('#votingArea'), $('#resultsArea')].forEach(hide);
  }

  function showScenario(scenario) {
    if (!scenario) return;
    show($('#scenarioArea'));
    const badge = $('#scenarioCatBadge');
    badge.textContent = catLabel(scenario.category);
    badge.className = `cat-badge ${scenario.category}`;
    $('#scenarioText').textContent = scenario.text;
  }

  function setPhaseLabel(phase) {
    $('#phaseLabel').textContent = phase;
  }

  function startTimerBar(el, duration) {
    clearTimerBar();
    el.style.transition = 'none';
    el.style.width = '100%';
    // Force reflow
    void el.offsetWidth;
    el.style.transition = `width ${duration}ms linear`;
    el.style.width = '0%';
  }

  function clearTimerBar() {
    ['#readingTimer', '#answeringTimer', '#votingTimer'].forEach(sel => {
      const el = $(sel);
      if (el) { el.style.transition = 'none'; el.style.width = '100%'; }
    });
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
    if (isOwner && count >= 3) { btn.disabled = false; btn.textContent = 'Start Game 🚀'; }
    else if (isOwner) { btn.disabled = true; btn.textContent = 'Need 2+ players'; }
    else { btn.disabled = true; btn.textContent = 'Waiting for owner…'; }
  }

  function renderPlayers(players) {
    const c = $('#playerList');
    if (!c) return;
    c.innerHTML = players.map(p => {
      let cls = '';
      if (p.hasAnswered) cls += ' answered';
      if (p.hasVoted) cls += ' voted';
      if (p.disconnected) cls += ' dc';
      let badges = '';
      if (p.isOwner)     badges += '<span class="p-badge badge-owner">Owner</span>';
      if (p.hasAnswered) badges += '<span class="p-badge badge-answered">✓</span>';
      if (p.hasVoted)    badges += '<span class="p-badge badge-voted">🗳️</span>';
      return `<div class="p-row${cls}"><span class="p-name">${esc(p.name)}</span>${badges}<span class="p-score">${p.score}</span></div>`;
    }).join('');
  }

  function restoreGameState(data) {
    const gs = data.gameState;
    if (!gs) return;
    $('#roundNum').textContent = gs.roundNum;
    $('#maxRounds').textContent = gs.maxRounds;

    if (gs.scenario) showScenario(gs.scenario);

    if (gs.state === 'reading') {
      setPhaseLabel('Reading');
      hideAllPhases();
      show($('#readingArea'));
    } else if (gs.state === 'answering') {
      setPhaseLabel('Answering');
      hideAllPhases();
      show($('#answeringArea'));
      $('#answerCount').textContent = `${gs.answeredCount}/${gs.totalPlayers} answered`;
    } else if (gs.state === 'voting') {
      setPhaseLabel('Voting');
      hideAllPhases();
      show($('#votingArea'));
      $('#voteCount').textContent = `${gs.votedCount}/${gs.totalPlayers} voted`;
    } else if (gs.state === 'results') {
      setPhaseLabel('Results');
      hideAllPhases();
      show($('#resultsArea'));
    }
  }

  function renderHistory() {
    const c = $('#historyList');
    if (!history.length) { c.innerHTML = '<p style="color:var(--muted)">No rounds yet.</p>'; return; }
    c.innerHTML = history.slice().reverse().map(h => {
      const answers = (h.results || []).map(r => {
        return `<div class="h-answer"><span class="h-answer-name">${esc(r.playerName)}</span><span class="h-answer-votes">${r.votes} vote${r.votes!==1?'s':''} · +${r.points}</span><br>${esc(r.text)}</div>`;
      }).join('');
      return `<div class="h-round"><div class="h-scenario">R${h.roundNum}: ${esc(h.scenario?.text || '')}</div>${answers}</div>`;
    }).join('');
  }

  function catLabel(cat) {
    const m = { awkward:'😬 Awkward', spicy:'🌶️ Spicy', absurd:'🤪 Absurd', moral:'⚖️ Moral', wildcard:'🃏 Wildcard' };
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
})();
