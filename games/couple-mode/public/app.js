// ============================================================
// COUPLE MODE — Client App
// ============================================================
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => { if (el) el.classList.remove('hidden'); };
  const hide = el => { if (el) el.classList.add('hidden'); };
  const esc  = s => { const d = document.createElement('div'); d.appendChild(document.createTextNode(String(s))); return d.innerHTML; };
  const MEDALS = ['🥇','🥈','🥉'];
  const PALETTE = ['#000000','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#ffffff'];

  // ── Session ──
  const STORAGE_KEY = 'cm-session';
  let sessionId = sessionStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = 'cm_' + Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  }
  let myId = null, myName = '', isOwner = false;
  let timerInterval = null, timerSeconds = 0;
  let currentMiniGame = null;
  let hasVoted = false, hasSubmitted = false;
  let isMySosTurn = false;
  let myDrawingCanvas = null;

  // Chaos meter state (lightweight — server is source of truth)
  let chaosScore = 0;

  // ── Socket ──
  const socket = io('/couple-mode');

  // ── Screens ──
  function showScreen(id) {
    $$('.screen').forEach(s => hide(s));
    show($(id));
  }

  function showMiniGame(id) {
    $$('.minigame-screen').forEach(s => hide(s));
    if (id) show($('#' + id));
  }

  // ── Timer ──
  function startTimer(seconds, selector) {
    stopTimer();
    const el = $(selector || '#hudTimer');
    timerSeconds = seconds;
    if (el) el.textContent = seconds;
    timerInterval = setInterval(() => {
      timerSeconds = Math.max(0, timerSeconds - 1);
      if (el) {
        el.textContent = timerSeconds;
        el.classList.toggle('urgent', timerSeconds <= 5);
      }
      if (timerSeconds === 0) stopTimer();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ── Chaos HUD ──
  function updateChaos(score) {
    chaosScore = score;
    const fill = $('#chaosFill');
    const label = $('#chaosTierLabel');
    if (fill) {
      fill.style.width = score + '%';
      if (score > 66) { fill.style.background = 'linear-gradient(90deg,#f97316,#f43f5e,#a855f7)'; }
      else if (score > 33) { fill.style.background = 'linear-gradient(90deg,#f59e0b,#ef4444)'; }
      else { fill.style.background = '#22c55e'; }
    }
    if (label) {
      if (score > 66) label.textContent = '💀 CHAOS';
      else if (score > 33) label.textContent = '🌶️ Heated';
      else label.textContent = 'Calm';
    }
    const gc = $('#game-container') || document.body;
    if (score > 66) gc.classList.add('neon-chaos');
    else gc.classList.remove('neon-chaos');
    if (score > 33) { gc.classList.add('chaos-shake'); setTimeout(() => gc.classList.remove('chaos-shake'), 600); }
  }

  // ── Player list renderer ──
  function renderScoreList(players) {
    const el = $('#scoreList');
    if (!el) return;
    el.innerHTML = players.map(p =>
      '<div class="score-item">' +
      '<div class="score-avatar" style="background:' + (p.avatar||'#ff6b9d') + '"></div>' +
      '<span class="score-name">' + esc(p.name) + (p.id === myId ? ' (you)' : '') + '</span>' +
      '<span class="score-pts">' + p.score + '</span>' +
      '</div>'
    ).join('');
  }

  function renderWaitingPlayers(players) {
    const el = $('#waitingPlayers');
    if (!el) return;
    el.innerHTML = players.map(p =>
      '<div class="player-chip">' +
      '<div class="avatar" style="width:24px;height:24px;border-radius:50%;background:' + (p.avatar||'#ff6b9d') + '"></div>' +
      esc(p.name) +
      (p.isOwner ? '<span class="crown">👑</span>' : '') +
      '</div>'
    ).join('');
    const countEl = $('#playerCount');
    if (countEl) countEl.textContent = players.length;
    const startBtn = $('#startGameBtn');
    if (startBtn) {
      const canStart = players.length >= 2 && isOwner;
      startBtn.disabled = !canStart;
      startBtn.textContent = canStart ? '🎮 Start Game!' : players.length < 2 ? 'Need 2+ players' : 'Waiting for owner...';
    }
  }

  function renderRoomList(rooms) {
    const wrap = $('#activeRooms');
    const container = $('#roomListContainer');
    if (!container) return;
    if (!rooms || rooms.length === 0) { hide(wrap); return; }
    show(wrap);
    container.innerHTML = rooms.map(r =>
      '<div class="room-item" data-room="' + r.id + '">' +
      '<span class="room-id">' + r.id + '</span>' +
      '<span class="room-info">' + r.players + ' players · ' + r.state + '</span>' +
      '</div>'
    ).join('');
    container.querySelectorAll('.room-item').forEach(el => {
      el.addEventListener('click', () => {
        const code = el.dataset.room;
        const nameEl = $('#playerName');
        const name = nameEl ? nameEl.value.trim() : '';
        if (!name) { alert('Enter your name first!'); return; }
        socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
      });
    });
  }

  // ── Canvas helpers ──
  function initCanvas() {
    if (!myDrawingCanvas) {
      myDrawingCanvas = new DrawingCanvas('coupleCanvas', socket);
    }
    myDrawingCanvas.disable();
    myDrawingCanvas.clear();
    // Setup color palette
    const palette = $('#colorPalette');
    if (palette && !palette.dataset.init) {
      palette.dataset.init = '1';
      PALETTE.forEach(col => {
        const sw = document.createElement('div');
        sw.className = 'color-swatch'; sw.style.background = col;
        sw.addEventListener('click', () => {
          $$('.color-swatch').forEach(s => s.classList.remove('active'));
          sw.classList.add('active');
          myDrawingCanvas.setColor(col);
        });
        palette.appendChild(sw);
      });
      $$('.size-btn').forEach(b => b.addEventListener('click', () => {
        $$('.size-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        myDrawingCanvas.setBrushSize(+b.dataset.size);
      }));
      const clearBtn = $('#clearCanvasBtn');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        myDrawingCanvas.clear();
        socket.emit('clearCanvas');
      });
    }
  }

  // ── Chat ──
  function appendChat(name, message, avatar) {
    const el = $('#chatMessages');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = '<span class="chat-name" style="color:' + (avatar||'#ff6b9d') + '">' + esc(name) + ':</span>' + esc(message);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function setupChat() {
    const input = $('#chatInput');
    const btn   = $('#sendBtn');
    if (!input || !btn) return;
    const send = () => {
      const t = input.value.trim();
      if (!t) return;
      socket.emit('chatMessage', { message: t });
      input.value = '';
    };
    btn.addEventListener('click', send);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
  }

  // ── Lobby ──
  $('#createRoomBtn').addEventListener('click', () => {
    const name = (($('#playerName') && $('#playerName').value) || '').trim();
    if (!name) { alert('Enter your name first!'); return; }
    myName = name;
    socket.emit('createRoom', { playerName: name, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => {
    const name = (($('#playerName') && $('#playerName').value) || '').trim();
    const code = (($('#roomCodeInput') && $('#roomCodeInput').value) || '').trim().toUpperCase();
    if (!name) { alert('Enter your name first!'); return; }
    if (!code) { alert('Enter a room code!'); return; }
    myName = name;
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  });

  // ── Waiting Room ──
  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));

  // ── Play Again ──
  $('#playAgainBtn').addEventListener('click', () => socket.emit('playAgain'));

  // ── WML vote ──
  // (buttons injected dynamically, event delegation)
  document.addEventListener('click', e => {
    if (e.target.closest('.wml-player-btn') && !hasVoted) {
      const btn = e.target.closest('.wml-player-btn');
      const targetId = btn.dataset.playerId;
      hasVoted = true;
      $$('.wml-player-btn').forEach(b => b.disabled = true);
      btn.classList.add('voted');
      socket.emit('wmlVote', { targetId });
    }
    if (e.target.closest('.caption-btn') && !hasVoted) {
      const btn = e.target.closest('.caption-btn');
      const caption = btn.dataset.caption;
      hasVoted = true;
      $$('.caption-btn').forEach(b => b.disabled = true);
      btn.classList.add('voted');
      socket.emit('drawCaption', { caption });
    }
  });

  // ── RFGF ──
  $('#rfgfRedBtn').addEventListener('click', () => {
    if (hasVoted) return; hasVoted = true;
    $('#rfgfRedBtn').classList.add('voted'); hide($('#rfgfGreenBtn'));
    const hint = $('#rfgfVoteHint'); if (hint) hint.textContent = '🚩 You voted Red Flag';
    socket.emit('rfgfVote', { flag: 'red' });
  });
  $('#rfgfGreenBtn').addEventListener('click', () => {
    if (hasVoted) return; hasVoted = true;
    $('#rfgfGreenBtn').classList.add('voted'); hide($('#rfgfRedBtn'));
    const hint = $('#rfgfVoteHint'); if (hint) hint.textContent = '🟩 You voted Green Flag';
    socket.emit('rfgfVote', { flag: 'green' });
  });

  // ── FTS submit ──
  $('#ftsSubmitBtn').addEventListener('click', () => {
    if (hasSubmitted) return;
    const text = ($('#ftsInput') && $('#ftsInput').value) || '';
    if (!text.trim()) return;
    hasSubmitted = true;
    $('#ftsSubmitBtn').disabled = true;
    socket.emit('ftsSubmit', { text: text.trim() });
  });
  const ftsInput = $('#ftsInput');
  if (ftsInput) ftsInput.addEventListener('keypress', e => { if (e.key === 'Enter') $('#ftsSubmitBtn').click(); });

  // ── TOS ──
  $('#tosAnswerBtn').addEventListener('click', () => {
    if (!isMySosTurn) return;
    const text = ($('#tosInput') && $('#tosInput').value) || '';
    if (!text.trim()) return;
    socket.emit('tosAnswer', { text: text.trim() });
    hide($('#tosAnswerArea'));
    show($('#tosWaitMsg')); if ($('#tosWaitMsg')) $('#tosWaitMsg').textContent = 'Answered! ✅';
    isMySosTurn = false;
  });
  $('#tosSkipBtn').addEventListener('click', () => {
    if (!isMySosTurn) return;
    socket.emit('tosSkip');
    hide($('#tosAnswerArea'));
    show($('#tosWaitMsg')); if ($('#tosWaitMsg')) $('#tosWaitMsg').textContent = 'Skipped 😬 -20 pts';
    isMySosTurn = false;
  });
  const tosInputEl = $('#tosInput');
  if (tosInputEl) tosInputEl.addEventListener('keypress', e => { if (e.key === 'Enter') $('#tosAnswerBtn').click(); });

  // ── Telepathy ──
  $('#telepathySubmitBtn').addEventListener('click', () => {
    if (hasSubmitted) return;
    const text = ($('#telepathyInput') && $('#telepathyInput').value) || '';
    if (!text.trim()) return;
    hasSubmitted = true;
    $('#telepathySubmitBtn').disabled = true;
    $('#telepathySubmitBtn').textContent = 'Submitted! 🤫';
    socket.emit('telepathyAnswer', { text: text.trim() });
  });
  const telepathyInput = $('#telepathyInput');
  if (telepathyInput) telepathyInput.addEventListener('keypress', e => { if (e.key === 'Enter') $('#telepathySubmitBtn').click(); });

  // ============================================================
  // SOCKET EVENTS
  // ============================================================

  socket.on('roomList', rooms => renderRoomList(rooms));

  socket.on('joinedRoom', data => {
    myId = data.playerId;
    isOwner = data.owner === myId;
    renderWaitingPlayers(data.players);
    const codeEl = $('#roomCodeDisplay');
    if (codeEl) codeEl.textContent = data.roomId;
    if (data.chaosScore) updateChaos(data.chaosScore);
    showScreen('#waitingScreen');
    setupChat();
  });

  socket.on('playerJoined', data => renderWaitingPlayers(data.players));
  socket.on('playerLeft', data => {
    renderWaitingPlayers(data.players);
    renderScoreList(data.players);
    appendChat('System', data.playerName + ' left 👋', '#888');
  });
  socket.on('playerList', players => {
    renderWaitingPlayers(players);
    renderScoreList(players);
  });
  socket.on('ownerUpdate', data => {
    isOwner = data.owner === myId;
    const startBtn = $('#startGameBtn');
    if (startBtn) {
      startBtn.disabled = !isOwner;
      startBtn.textContent = isOwner ? '🎮 Start Game!' : 'Waiting for owner...';
    }
  });
  socket.on('playerDisconnected', data => appendChat('System', data.playerName + ' disconnected ⚠️', '#888'));
  socket.on('playerReconnected', data => appendChat('System', data.playerName + ' reconnected! 🔌', '#888'));

  socket.on('chatMessage', data => appendChat(data.name, data.message, data.avatar));

  socket.on('chaosUpdate', data => updateChaos(data.score));

  socket.on('backToLobby', data => {
    stopTimer();
    currentMiniGame = null;
    hide($('#gameArea'));
    hide($('#gameHud'));
    renderWaitingPlayers(data.players);
    show($('#waitingScreen'));
    hide($('#gameOverOverlay'));
  });

  socket.on('error', data => alert(data.message));

  // ── Intro card ──
  socket.on('miniGameIntro', data => {
    stopTimer();
    showScreen('#introScreen');
    show($('#introScreen'));
    const emojiEl = $('#introEmoji'); if (emojiEl) emojiEl.textContent = data.emoji;
    const nameEl  = $('#introName');  if (nameEl)  nameEl.textContent  = data.name;
    const roundEl = $('#introRound'); if (roundEl) roundEl.textContent = 'Round ' + data.roundNum + ' / ' + data.totalRounds;
    // Restart progress animation
    const bar = $('#introProgress');
    if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = ''; }
    // Update HUD label
    const hudMG = $('#hudMiniGame'); if (hudMG) hudMG.textContent = data.emoji + ' ' + data.name;
    const hudR  = $('#hudRound');    if (hudR)  hudR.textContent  = data.roundNum + '/' + data.totalRounds;
    // Ensure HUD visible during game
    show($('#gameHud'));
  });

  // ── WML ──
  socket.on('wmlStart', data => {
    hasVoted = false; currentMiniGame = 'wml';
    showScreen('#gameArea'); show($('#gameArea')); show($('#gameHud'));
    showMiniGame('wmlScreen');
    const q = $('#wmlQuestion'); if (q) q.textContent = data.question;
    const hint = $('#wmlVoteHint'); if (hint) hint.textContent = 'Tap who is more likely to!';
    const prog = $('#wmlProgress'); if (prog) prog.textContent = '0/? voted';
    // Build player vote buttons
    const container = $('#wmlPlayers');
    if (container) {
      // We don't have the full player list here — server sends it separately
      // Re-use last known players from score list
      const scores = $$('#scoreList .score-item');
      container.innerHTML = '';
      scores.forEach(item => {
        const idEl = item.dataset.id;
        // Extract from score-item data attribute if set, else use title
        const btn = document.createElement('button');
        btn.className = 'wml-player-btn';
        btn.textContent = item.querySelector('.score-name')?.textContent?.replace(' (you)','').trim() || '?';
        // We need player IDs — attach from score-list rebuild
        const nameText = btn.textContent;
        // Find id from socket-known player map
        btn.dataset.playerId = item.dataset.pid || '';
        container.appendChild(btn);
      });
    }
    startTimer(data.duration);
  });

  // Better approach: rebuild WML player buttons when playerList arrives
  // Store players array for WML button generation
  let lastPlayerList = [];
  socket.on('playerList', players => {
    lastPlayerList = players;
    renderWaitingPlayers(players);
    renderScoreList(players);
    // Rebuild WML buttons if currently in WML voting
    if (currentMiniGame === 'wml' && !hasVoted) {
      rebuildWmlButtons(players);
    }
  });

  function rebuildWmlButtons(players) {
    const container = $('#wmlPlayers');
    if (!container) return;
    container.innerHTML = players.map(p =>
      '<button class="wml-player-btn" data-player-id="' + p.id + '">' + esc(p.name) + '</button>'
    ).join('');
  }

  // Override wmlStart to use lastPlayerList
  socket.on('wmlStart', data => {
    hasVoted = false; currentMiniGame = 'wml';
    showScreen('#gameArea'); show($('#gameArea')); show($('#gameHud'));
    showMiniGame('wmlScreen');
    const qEl = $('#wmlQuestion'); if (qEl) qEl.textContent = data.question;
    const hint = $('#wmlVoteHint'); if (hint) hint.textContent = 'Tap who is more likely to!';
    rebuildWmlButtons(lastPlayerList);
    startTimer(data.duration);
  });

  socket.on('voteProgress', data => {
    const progEls = $$('.vote-progress span');
    progEls.forEach(el => { el.textContent = data.voted + '/' + data.total + ' voted'; });
  });

  socket.on('wmlResult', data => {
    stopTimer();
    showMiniGame('wmlResultScreen');
    const qEl = $('#wmlResultQ'); if (qEl) qEl.textContent = data.question;
    const barsEl = $('#wmlResultBars');
    if (barsEl) {
      const total = Object.values(data.counts).reduce((s,c) => s+c, 0) || 1;
      barsEl.innerHTML = Object.entries(data.counts).map(([id, count]) => {
        const pct = Math.round(count / total * 100);
        const name = data.playerNames && data.playerNames[id] ? data.playerNames[id] : id;
        return '<div class="result-bar-row">' +
          '<div class="result-bar-name">' + esc(name) + '</div>' +
          '<div class="result-bar-track"><div class="result-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="result-bar-count">' + count + '</div>' +
          '</div>';
      }).join('');
    }
    const winner = $('#wmlWinner');
    if (winner) {
      winner.textContent = data.winnerName
        ? (data.isTie ? '🔥 It\'s a TIE — chaos meter fills!' : '👑 Most likely: ' + data.winnerName)
        : '🤷 No votes cast!';
    }
  });

  // ── RFGF ──
  socket.on('rfgfStart', data => {
    hasVoted = false; currentMiniGame = 'rfgf';
    showMiniGame('rfgfScreen');
    const sc = $('#rfgfScenario'); if (sc) sc.textContent = data.scenario;
    const hint = $('#rfgfVoteHint'); if (hint) hint.textContent = 'Vote!';
    const redBtn = $('#rfgfRedBtn'); const greenBtn = $('#rfgfGreenBtn');
    if (redBtn) { redBtn.classList.remove('voted'); redBtn.disabled = false; }
    if (greenBtn) { greenBtn.classList.remove('voted'); greenBtn.disabled = false; }
    show(redBtn); show(greenBtn);
    startTimer(data.duration);
  });

  socket.on('rfgfResult', data => {
    stopTimer();
    showMiniGame('rfgfResultScreen');
    const sc = $('#rfgfResultScenario'); if (sc) sc.textContent = data.scenario;
    const bars = $('#rfgfResultBars');
    if (bars) {
      const total = data.total || 1;
      bars.innerHTML =
        '<div class="rfgf-bar">' +
        '<div class="rfgf-bar-label">🟥 Red Flag</div>' +
        '<div class="rfgf-bar-track"><div class="rfgf-bar-fill red-fill" style="width:' + Math.round(data.red/total*100) + '%"></div></div>' +
        '<div class="rfgf-bar-pct">' + data.red + '</div>' +
        '</div>' +
        '<div class="rfgf-bar">' +
        '<div class="rfgf-bar-label">🟩 Green Flag</div>' +
        '<div class="rfgf-bar-track"><div class="rfgf-bar-fill green-fill" style="width:' + Math.round(data.green/total*100) + '%"></div></div>' +
        '<div class="rfgf-bar-pct">' + data.green + '</div>' +
        '</div>';
    }
    const verdict = $('#rfgfVerdict');
    if (verdict) verdict.textContent = data.majority === 'red' ? '🚩 Community verdict: RED FLAG' : data.majority === 'green' ? '🟩 Community verdict: GREEN FLAG' : '⚖️ Community is split!';
  });

  // ── FTS ──
  socket.on('ftsStart', data => {
    hasSubmitted = false; currentMiniGame = 'fts';
    showMiniGame('ftsScreen');
    const tpl = $('#ftsTemplate'); if (tpl) tpl.textContent = data.template;
    const input = $('#ftsInput'); if (input) { input.value = ''; input.disabled = false; }
    const btn = $('#ftsSubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit 🚀'; }
    const prog = $('#ftsProgress'); if (prog) prog.textContent = '0/' + lastPlayerList.length + ' submitted';
    startTimer(data.duration);
  });

  socket.on('submitProgress', data => {
    const progEls = $$('.vote-progress span');
    progEls.forEach(el => el.textContent = data.submitted + '/' + data.total + ' submitted');
  });

  socket.on('ftsReveal', data => {
    stopTimer();
    showMiniGame('ftsRevealScreen');
    const tpl = $('#ftsRevealTemplate'); if (tpl) tpl.textContent = data.template;
    const list = $('#ftsRevealList');
    if (list) {
      list.innerHTML = '';
      data.entries.forEach((entry, i) => {
        const div = document.createElement('div');
        div.className = 'reveal-item';
        div.style.animationDelay = (i * 0.15) + 's';
        div.innerHTML = esc(data.template.replace('______', '<strong>' + esc(entry.text) + '</strong>'));
        list.appendChild(div);
      });
    }
  });

  // ── TOS ──
  socket.on('tosStart', data => {
    currentMiniGame = 'tos'; isMySosTurn = false;
    showMiniGame('tosScreen');
    const nameEl = $('#tosTurnName'); if (nameEl) nameEl.textContent = data.currentPlayerName;
    const q = $('#tosQuestion'); if (q) q.textContent = data.question;
    const input = $('#tosInput'); if (input) input.value = '';
    isMySosTurn = (data.currentPlayerId === myId);
    const answerArea = $('#tosAnswerArea'); const waitMsg = $('#tosWaitMsg');
    if (isMySosTurn) { show(answerArea); hide(waitMsg); }
    else { hide(answerArea); show(waitMsg); if (waitMsg) waitMsg.textContent = 'Waiting for ' + esc(data.currentPlayerName) + '...'; }
    startTimer(data.duration);
  });

  socket.on('tosTurn', data => {
    isMySosTurn = (data.currentPlayerId === myId);
    const nameEl = $('#tosTurnName'); if (nameEl) nameEl.textContent = data.currentPlayerName;
    const q = $('#tosQuestion'); if (q) q.textContent = data.question;
    const input = $('#tosInput'); if (input) input.value = '';
    const answerArea = $('#tosAnswerArea'); const waitMsg = $('#tosWaitMsg');
    if (isMySosTurn) { show(answerArea); hide(waitMsg); }
    else { hide(answerArea); show(waitMsg); if (waitMsg) waitMsg.textContent = 'Waiting for ' + esc(data.currentPlayerName) + '...'; }
    startTimer(data.duration);
  });

  socket.on('tosAnswered', data => {
    appendChat('✅', data.name + ' answered: ' + data.text, '#22c55e');
  });

  socket.on('tosSkipped', data => {
    appendChat('😬', data.name + ' SKIPPED!', '#ef4444');
  });

  socket.on('tosReveal', data => {
    stopTimer();
    showMiniGame('tosRevealScreen');
    const list = $('#tosRevealList');
    if (list) {
      list.innerHTML = data.entries.map((e, i) =>
        '<div class="reveal-item" style="animation-delay:' + (i*0.15) + 's">' +
        '<strong>' + esc(e.name) + '</strong>: ' + (e.skipped ? '<span style="color:#ef4444">SKIPPED 😬</span>' : esc(e.text)) +
        '</div>'
      ).join('');
    }
  });

  // ── Telepathy ──
  socket.on('telepathyStart', data => {
    hasSubmitted = false; currentMiniGame = 'telepathy';
    showMiniGame('telepathyScreen');
    const q = $('#telepathyQuestion'); if (q) q.textContent = data.question;
    const input = $('#telepathyInput'); if (input) { input.value = ''; input.disabled = false; }
    const btn = $('#telepathySubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit 🔮'; }
    const prog = $('#telepathyProgress'); if (prog) prog.textContent = '0/' + lastPlayerList.length + ' answered';
    startTimer(data.duration);
  });

  socket.on('telepathyReveal', data => {
    stopTimer();
    showMiniGame('telepathyRevealScreen');
    const q = $('#telepathyRevealQ'); if (q) q.textContent = data.question;
    const list = $('#telepathyRevealList');
    if (list) {
      list.innerHTML = data.entries.map(e =>
        '<div class="reveal-item" style="border-left-color:' + (e.matched ? '#22c55e' : '#ef4444') + '">' +
        '<strong>' + esc(e.name) + '</strong>: ' + esc(e.answer) +
        (e.matched ? ' <span style="color:#22c55e">✅ Match!</span>' : ' <span style="color:#ef4444">❌ No match</span>') +
        '</div>'
      ).join('');
    }
    const matchEl = $('#telepathyMatchResult');
    if (matchEl) matchEl.textContent = data.matchCount === 0
      ? '💀 Nobody matched — absolute disaster'
      : data.matchCount === lastPlayerList.length
        ? '🤯 Full telepathy! Everyone matched!'
        : data.matchCount + ' player(s) matched → +100 pts each!';
  });

  // ── Draw ──
  socket.on('drawStart', data => {
    currentMiniGame = 'draw';
    showMiniGame('drawScreen');
    initCanvas();
    myDrawingCanvas.clear();
    const drI = $('#drawInstructions'); const watchP = $('#drawWatcher');
    const tools = $('#drawTools');
    if (data.drawerId === myId) {
      // I am the drawer — told my target via drawYourTurn
      hide(drI); hide(watchP); show(tools);
      myDrawingCanvas.enable();
    } else {
      show(watchP); hide(drI); hide(tools);
      myDrawingCanvas.disable();
      if (watchP) watchP.textContent = '👀 ' + esc(data.drawerName) + ' is drawing...';
    }
    startTimer(data.duration);
  });

  socket.on('drawYourTurn', data => {
    const drI = $('#drawInstructions');
    if (drI) { show(drI); drI.textContent = '🎨 Draw: ' + esc(data.targetName) + ' — from memory!'; }
  });

  socket.on('drawData', data => {
    if (myDrawingCanvas) myDrawingCanvas.remoteDrawData(data);
  });

  socket.on('clearCanvas', () => {
    if (myDrawingCanvas) myDrawingCanvas.clear();
  });

  socket.on('drawGuessStart', data => {
    stopTimer();
    hasVoted = false;
    showMiniGame('drawGuessScreen');
    const grid = $('#captionGrid');
    if (grid) {
      grid.innerHTML = data.captions.map(cap =>
        '<button class="caption-btn" data-caption="' + esc(cap) + '">' + esc(cap) + '</button>'
      ).join('');
      // Disable for drawer
    }
    const hint = $('#drawGuessHint'); if (hint) hint.textContent = 'What do you see?';
    const prog = $('#drawGuessProgress'); if (prog) prog.textContent = '0/? voted';
    startTimer(data.duration);
  });

  socket.on('drawReveal', data => {
    stopTimer();
    showMiniGame('drawRevealScreen');
    const roast = $('#roastCard');
    if (roast) roast.innerHTML = '"' + esc(data.roast) + '"<br><span style="font-size:12px;color:#888;font-style:normal">— the community</span>';
    const winner = $('#drawRevealWinner');
    if (winner) winner.textContent = data.winningCaption ? '🏆 Top caption: ' + data.winningCaption : 'No captions submitted!';
  });

  // ── Game Over ──
  socket.on('gameOver', data => {
    stopTimer();
    const players = data.players || [];
    const chaosFinal = $('#chaosFinalScore');
    if (chaosFinal) chaosFinal.textContent = '🔥 Final chaos level: ' + (data.chaosScore || 0) + '/100';

    const final = $('#finalScores');
    if (final) {
      final.innerHTML = players.map((p, i) =>
        '<div class="final-score-row">' +
        '<span class="fs-medal">' + (MEDALS[i] || '') + '</span>' +
        '<span class="fs-name">' + esc(p.name) + '</span>' +
        '<span class="fs-score">' + p.score + ' pts</span>' +
        '</div>'
      ).join('');
    }

    // Titles
    const statsObj = data.stats || {};
    const statsMap = new Map(Object.entries(statsObj));
    const TITLE_RULES = {
      menace:       { title:'Certified Menace',      emoji:'😈' },
      dramaStarter: { title:'Drama Starter',          emoji:'🎭' },
      greenFlag:    { title:'Green Flag',             emoji:'🟩' },
      redFlag:      { title:'Walking Red Flag',       emoji:'🚩' },
      survivor:     { title:'Situationship Survivor', emoji:'💀' },
    };
    let maxChaos = 0, maxLies = 0, maxRed = 0;
    players.forEach(p => {
      const s = statsMap.get(p.id) || {};
      if ((s.chaosActions||0) > maxChaos) maxChaos = s.chaosActions||0;
      if ((s.liesDetected||0) > maxLies)  maxLies  = s.liesDetected||0;
      if ((s.redFlagsReceived||0) > maxRed) maxRed = s.redFlagsReceived||0;
    });
    const titleCards = $('#titleCards');
    if (titleCards) {
      titleCards.innerHTML = '<div style="font-size:13px;color:#888;margin-bottom:8px">🏆 TITLES AWARDED</div>' +
        players.map(p => {
          const s = statsMap.get(p.id) || {};
          let key = 'survivor';
          if (maxChaos > 0 && (s.chaosActions||0) === maxChaos) key = 'menace';
          else if ((s.redFlagsReceived||0) > maxRed/2 && maxRed > 0) key = 'redFlag';
          else if ((s.liesDetected||0) === maxLies && maxLies >= 2) key = 'dramaStarter';
          else if ((s.redFlagsReceived||0) === 0 && (s.liesDetected||0) === 0) key = 'greenFlag';
          const t = TITLE_RULES[key];
          return '<div class="title-card">' +
            '<span class="title-emoji">' + t.emoji + '</span>' +
            '<span class="title-name">' + esc(p.name) + '</span>' +
            '<span class="title-label">' + t.title + '</span>' +
            '</div>';
        }).join('');
    }

    show($('#gameOverOverlay'));
  });

  // ── Cleanup ──
  window.__gameCleanup = function () {
    stopTimer();
    if (myDrawingCanvas) { myDrawingCanvas.disable(); myDrawingCanvas = null; }
    socket.disconnect();
  };

  // ── Pre-fill name from shared identity ──
  try {
    const identity = JSON.parse(localStorage.getItem('afterdark_identity') || '{}');
    if (identity.name) {
      const nameInput = $('#playerName');
      if (nameInput) nameInput.value = identity.name;
      myName = identity.name;
    }
  } catch (e) {}

})();
