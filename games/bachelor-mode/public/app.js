// ============================================================
// BACHELOR MODE — Client App
// ============================================================
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const show = el => { if (el) el.classList.remove('hidden'); };
  const hide = el => { if (el) el.classList.add('hidden'); };
  const esc = s => { const d = document.createElement('div'); d.appendChild(document.createTextNode(String(s))); return d.innerHTML; };
  const MEDALS = ['🥇','🥈','🥉'];
  const PALETTE = ['#000000','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#06b6d4','#ffffff'];

  // ── Session ──
  const STORAGE_KEY = 'bm-session';
  let sessionId = sessionStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = 'bm_' + Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  }
  let myId = null, myName = '', isOwner = false;
  let timerInterval = null;
  let currentMiniGame = null;
  let hasVoted = false, hasSubmitted = false;
  let isSpeaker = false;
  let myDrawingCanvas = null;
  let isDrawer = false;
  let lastPlayerList = [];
  let pendingLieIsLie = null;  // true/false — stored until submit btn tapped

  // ── Socket ──
  const socket = io('/bachelor-mode');

  // ── Screen helpers ──
  function showScreen(id) {
    $$('.screen').forEach(s => hide(s));
    show($(id));
  }

  function showMini(id) {
    $$('.minigame-screen').forEach(s => hide(s));
    if (id) show($('#' + id));
  }

  // ── Timer ──
  function startTimer(seconds) {
    stopTimer();
    const el = $('#hudTimer');
    let t = seconds;
    if (el) el.textContent = t;
    timerInterval = setInterval(() => {
      t = Math.max(0, t - 1);
      if (el) { el.textContent = t; el.classList.toggle('urgent', t <= 5); }
      if (t === 0) stopTimer();
    }, 1000);
  }

  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  // ── Chaos ──
  function updateChaos(score) {
    const fill = $('#chaosFill'), tier = $('#chaosTierLabel');
    if (fill) {
      fill.style.width = score + '%';
      fill.style.background = score > 66 ? 'linear-gradient(90deg,#a855f7,#4ade80)' :
                               score > 33 ? 'linear-gradient(90deg,#eab308,#f97316)' : '#4ade80';
    }
    if (tier) tier.textContent = score > 66 ? '💀 CHAOS' : score > 33 ? '🌶️ Heated' : 'Calm';
    const root = $('#bach-root');
    if (score > 66) root?.classList.add('neon-chaos'); else root?.classList.remove('neon-chaos');
    if (score > 33) { root?.classList.add('chaos-shake'); setTimeout(() => root?.classList.remove('chaos-shake'), 600); }
  }

  // ── Player lists ──
  function renderScoreList(players) {
    const el = $('#scoreList');
    if (!el) return;
    el.innerHTML = players.map(p =>
      '<div class="score-item" data-pid="' + p.id + '">' +
      '<div class="score-avatar" style="background:' + (p.avatar||'#a855f7') + '"></div>' +
      '<span class="score-name">' + esc(p.name) + (p.id === myId ? ' (you)' : '') + '</span>' +
      '<span class="score-pts">' + p.score + '</span>' +
      '</div>'
    ).join('');
  }

  function renderWaiting(players) {
    const el = $('#waitingPlayers');
    if (el) el.innerHTML = players.map(p =>
      '<div class="player-chip">' +
      '<div style="width:24px;height:24px;border-radius:50%;background:' + (p.avatar||'#a855f7') + '"></div>' +
      esc(p.name) + (p.isOwner ? '<span class="crown">👑</span>' : '') +
      '</div>'
    ).join('');
    const cnt = $('#playerCount'); if (cnt) cnt.textContent = players.length;
    const startBtn = $('#startGameBtn');
    if (startBtn) {
      const can = players.length >= 2 && isOwner;
      startBtn.disabled = !can;
      startBtn.textContent = can ? '🍻 Start Game!' : players.length < 2 ? 'Need 2+ players' : 'Waiting for owner...';
    }
  }

  function renderRooms(rooms) {
    const wrap = $('#activeRooms'), cnt = $('#roomListContainer');
    if (!cnt) return;
    if (!rooms?.length) { hide(wrap); return; }
    show(wrap);
    cnt.innerHTML = rooms.map(r =>
      '<div class="room-item" data-room="' + r.id + '">' +
      '<span class="room-id">' + r.id + '</span>' +
      '<span class="room-info">' + r.players + ' players · ' + r.state + '</span>' +
      '</div>'
    ).join('');
    cnt.querySelectorAll('.room-item').forEach(el => {
      el.addEventListener('click', () => {
        const code = el.dataset.room;
        const name = (($('#playerName') && $('#playerName').value) || '').trim();
        if (!name) { alert('Enter your name first!'); return; }
        socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
      });
    });
  }

  // ── Canvas ──
  function initCanvas() {
    if (!myDrawingCanvas) myDrawingCanvas = new DrawingCanvas('bachCanvas', socket);
    myDrawingCanvas.disable();
    myDrawingCanvas.clear();
    const palette = $('#bachColorPalette');
    if (palette && !palette.dataset.init) {
      palette.dataset.init = '1';
      PALETTE.forEach(col => {
        const sw = document.createElement('div');
        sw.className = 'color-swatch'; sw.style.background = col;
        sw.addEventListener('click', () => {
          $$('.color-swatch').forEach(s => s.classList.remove('active'));
          sw.classList.add('active');
          myDrawingCanvas?.setColor(col);
        });
        palette.appendChild(sw);
      });
      $$('.size-btn').forEach(b => b.addEventListener('click', () => {
        $$('.size-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        myDrawingCanvas?.setBrushSize(+b.dataset.size);
      }));
      const clearBtn = $('#bachClearBtn');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        myDrawingCanvas?.clear();
        socket.emit('clearCanvas');
      });
    }
  }

  // ── Chat ──
  function appendChat(name, msg, color) {
    const el = $('#chatMessages');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = '<span class="chat-name" style="color:' + (color||'#a855f7') + '">' + esc(name) + ':</span> ' + esc(msg);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function setupChat() {
    const input = $('#chatInput'), btn = $('#sendBtn');
    if (!input || !btn) return;
    const send = () => {
      const t = input.value.trim(); if (!t) return;
      socket.emit('chatMessage', { message: t });
      input.value = '';
    };
    btn.addEventListener('click', send);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });
  }

  // ── Build anonymous submission vote list ──
  function buildVoteList(containerId, progressId, submissions, emitEvent) {
    const container = $(containerId);
    if (!container) return;
    hasVoted = false;
    container.innerHTML = submissions.map(s =>
      '<div class="submission-item" data-pid="' + s.playerId + '">' +
      '<div class="submission-text">' + esc(s.text) + '</div>' +
      '<button class="submission-vote-btn">Vote 👆</button>' +
      '</div>'
    ).join('');
    container.querySelectorAll('.submission-item').forEach(item => {
      item.querySelector('.submission-vote-btn').addEventListener('click', () => {
        if (hasVoted) return;
        hasVoted = true;
        container.querySelectorAll('.submission-item').forEach(i => { i.classList.remove('voted'); i.querySelector('.submission-vote-btn').disabled = true; });
        item.classList.add('voted');
        socket.emit(emitEvent, { targetId: item.dataset.pid });
      });
    });
  }

  // ── Build reveal list ──
  function buildRevealList(containerId, results = []) {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = results.map((r, i) =>
      '<div class="reveal-item" style="animation-delay:' + (i * 0.15) + 's">' +
      '<strong>' + esc(r.name) + '</strong>: ' + esc(r.text || r.caption || '') +
      (r.votes ? '<span class="rizz-avg">👍 ' + r.votes + '</span>' : '') +
      (r.avg != null ? '<span class="rizz-avg">⭐ ' + r.avg.toFixed(1) + '</span>' : '') +
      '</div>'
    ).join('');
  }

  // ── Lobby wiring ──
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

  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));
  $('#playAgainBtn').addEventListener('click', () => socket.emit('playAgain'));

  // ── Lie detector buttons ──
  const lieRealBtn = $('#lieRealBtn'), lieLieBtn = $('#lieLieBtn');
  if (lieRealBtn) lieRealBtn.addEventListener('click', () => {
    pendingLieIsLie = false;
    lieRealBtn.classList.add('active'); lieLieBtn?.classList.remove('active');
  });
  if (lieLieBtn) lieLieBtn.addEventListener('click', () => {
    pendingLieIsLie = true;
    lieLieBtn.classList.add('active'); lieRealBtn?.classList.remove('active');
  });

  // Submit lie statement via a "Lock In" button (or auto-on text)
  document.addEventListener('click', e => {
    if (e.target.id === 'lieSubmitConfirm') {
      const text = ($('#lieInput') && $('#lieInput').value) || '';
      if (!text.trim()) { alert('Write your statement first!'); return; }
      if (pendingLieIsLie === null) { alert('Choose Truth or Lie!'); return; }
      socket.emit('lieStatement', { text: text.trim(), isLie: pendingLieIsLie });
      show($('#lieSubmitStatus')); hide($('#lieSpeakerArea'));
    }
    if (e.target.closest('.star-btn')) {
      const btn = e.target.closest('.star-btn');
      const item = btn.closest('.rizz-rate-item');
      if (!item) return;
      const rating = parseInt(btn.dataset.rating);
      const targetId = item.dataset.pid;
      item.querySelectorAll('.star-btn').forEach((s, i) => s.classList.toggle('active', i < rating));
      socket.emit('rizzRate', { targetId, rating });
    }
    if (e.target.closest('[data-lie-verdict]')) {
      const btn = e.target.closest('[data-lie-verdict]');
      const verdict = btn.dataset.lieVerdict;
      if (hasVoted) return;
      hasVoted = true;
      $$('[data-lie-verdict]').forEach(b => b.disabled = true);
      btn.classList.add('voted');
      socket.emit('lieVote', { verdict });
    }
  });

  // ── sus caption submit ──
  const susCaptionSubmitBtn = $('#susCaptionSubmitBtn');
  if (susCaptionSubmitBtn) susCaptionSubmitBtn.addEventListener('click', () => {
    if (hasSubmitted) return;
    const text = ($('#susCaptionInput') && $('#susCaptionInput').value) || '';
    if (!text.trim()) return;
    hasSubmitted = true;
    susCaptionSubmitBtn.disabled = true;
    socket.emit('susCaption', { text: text.trim() });
  });

  // ── Caption submit ──
  const capSubmitBtn = $('#captionSubmitBtn');
  if (capSubmitBtn) capSubmitBtn.addEventListener('click', () => {
    if (hasSubmitted) return;
    const text = ($('#captionInput') && $('#captionInput').value) || '';
    if (!text.trim()) return;
    hasSubmitted = true;
    capSubmitBtn.disabled = true; capSubmitBtn.textContent = 'Submitted! ✅';
    socket.emit('captionSubmit', { text: text.trim() });
  });

  // ── Excuse submit ──
  const excuseSubmitBtn = $('#excuseSubmitBtn');
  if (excuseSubmitBtn) excuseSubmitBtn.addEventListener('click', () => {
    if (hasSubmitted) return;
    const text = ($('#excuseInput') && $('#excuseInput').value) || '';
    if (!text.trim()) return;
    hasSubmitted = true;
    excuseSubmitBtn.disabled = true; excuseSubmitBtn.textContent = 'Submitted! ✅';
    socket.emit('excuseSubmit', { text: text.trim() });
  });

  // ── Rizz submit ──
  const rizzSubmitBtn = $('#rizzSubmitBtn');
  if (rizzSubmitBtn) rizzSubmitBtn.addEventListener('click', () => {
    if (hasSubmitted) return;
    const text = ($('#rizzInput') && $('#rizzInput').value) || '';
    if (!text.trim()) return;
    hasSubmitted = true;
    rizzSubmitBtn.disabled = true; rizzSubmitBtn.textContent = 'Submitted! 🔥';
    socket.emit('rizzSubmit', { text: text.trim() });
  });

  // ── Drunk submit ──
  const drunkSubmitBtn = $('#drunkSubmitBtn');
  if (drunkSubmitBtn) drunkSubmitBtn.addEventListener('click', () => {
    if (hasSubmitted) return;
    const text = ($('#drunkInput') && $('#drunkInput').value) || '';
    if (!text.trim()) return;
    hasSubmitted = true;
    drunkSubmitBtn.disabled = true; drunkSubmitBtn.textContent = 'Submitted! 🍺';
    socket.emit('drunkSubmit', { text: text.trim() });
  });

  // ── Enter key shortcuts ──
  ['#susCaptionInput','#captionInput','#excuseInput','#rizzInput','#drunkInput'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('keypress', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.closest('.minigame-screen')?.querySelector('button[id$="SubmitBtn"]')?.click(); } });
  });

  // ============================================================
  // SOCKET EVENTS
  // ============================================================

  socket.on('roomList', renderRooms);

  socket.on('joinedRoom', data => {
    myId = data.playerId; isOwner = data.owner === myId;
    const codeEl = $('#roomCodeDisplay'); if (codeEl) codeEl.textContent = data.roomId;
    if (data.chaosScore) updateChaos(data.chaosScore);
    renderWaiting(data.players);
    showScreen('#waitingScreen');
    setupChat();
  });

  socket.on('playerJoined', data => { lastPlayerList = data.players; renderWaiting(data.players); });
  socket.on('playerLeft', data => { lastPlayerList = data.players; renderWaiting(data.players); renderScoreList(data.players); appendChat('System', data.playerName + ' left 👋', '#888'); });
  socket.on('playerList', players => { lastPlayerList = players; renderWaiting(players); renderScoreList(players); });
  socket.on('ownerUpdate', data => {
    isOwner = data.owner === myId;
    const btn = $('#startGameBtn');
    if (btn) { btn.disabled = !isOwner; btn.textContent = isOwner ? '🍻 Start Game!' : 'Waiting for owner...'; }
  });
  socket.on('playerDisconnected', data => appendChat('System', data.playerName + ' disconnected ⚠️', '#888'));
  socket.on('playerReconnected', data => appendChat('System', data.playerName + ' reconnected! 🔌', '#888'));
  socket.on('chatMessage', data => appendChat(data.name, data.message, data.avatar));
  socket.on('chaosUpdate', data => updateChaos(data.score));
  socket.on('error', data => alert(data.message));

  socket.on('backToLobby', data => {
    stopTimer(); currentMiniGame = null;
    hide($('#gameArea')); hide($('#gameHud'));
    renderWaiting(data.players); show($('#waitingScreen'));
    hide($('#gameOverOverlay'));
  });

  socket.on('miniGameIntro', data => {
    stopTimer();
    showScreen('#introScreen');
    const emojiEl = $('#introEmoji'), nameEl = $('#introName'), roundEl = $('#introRound');
    if (emojiEl) emojiEl.textContent = data.emoji;
    if (nameEl) nameEl.textContent = data.name;
    if (roundEl) roundEl.textContent = 'Round ' + data.roundNum + ' / ' + data.totalRounds;
    const bar = $('#introProgress');
    if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = ''; }
    const hudMG = $('#hudMiniGame'), hudR = $('#hudRound');
    if (hudMG) hudMG.textContent = data.emoji + ' ' + data.name;
    if (hudR) hudR.textContent = data.roundNum + '/' + data.totalRounds;
    show($('#gameHud'));
  });

  socket.on('gameStarted', data => {
    lastPlayerList = data.players;
    renderScoreList(data.players);
    show($('#gameArea')); show($('#gameHud'));
  });

  // ── Sus Drawing ──
  socket.on('susStart', data => {
    isDrawer = data.drawerId === myId;
    currentMiniGame = 'sus'; hasSubmitted = false;
    showScreen('#gameArea'); show($('#gameArea')); show($('#gameHud'));
    showMini('susDrawScreen');
    initCanvas(); myDrawingCanvas?.clear();
    const statusEl = $('#susDrawStatus');
    if (statusEl) statusEl.textContent = isDrawer ? '🎨 You\'re drawing...' : '👀 ' + esc(data.drawerName) + ' is drawing...';
    const tools = $('#susDrawTools'), watcher = $('#susWatcherMsg'), capArea = $('#susCaptionArea');
    hide(capArea);
    if (isDrawer) { show(tools); hide(watcher); myDrawingCanvas?.enable(); }
    else { hide(tools); show(watcher); if (watcher) watcher.textContent = '👀 Watch and prepare your caption!'; myDrawingCanvas?.disable(); }
    startTimer(data.duration);
  });

  socket.on('susYourPrompt', data => {
    const drInstr = $('#susDrawStatus');
    if (drInstr) drInstr.innerHTML = '🎨 Draw: <strong>' + esc(data.prompt) + '</strong>';
  });

  socket.on('susCaptionStart', data => {
    stopTimer();
    isDrawer = false; hasSubmitted = false;  // Even the drawer can caption now
    const tools = $('#susDrawTools'), watcher = $('#susWatcherMsg'), capArea = $('#susCaptionArea');
    hide(tools); hide(watcher); show(capArea);
    const inp = $('#susCaptionInput'), btn = $('#susCaptionSubmitBtn');
    if (inp) { inp.value = ''; inp.disabled = false; }
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Caption 💬'; }
    startTimer(data.duration);
  });

  socket.on('drawData', data => myDrawingCanvas?.remoteDrawData(data));
  socket.on('clearCanvas', () => myDrawingCanvas?.clear());

  socket.on('submitProgress', data => {
    $$('.submit-progress span, .vote-progress span').forEach(el => {
      if (el.id) {
        el.textContent = data.submitted + '/' + data.total + (el.id.includes('vote') ? ' voted' : ' submitted');
      }
    });
  });

  socket.on('voteProgress', data => {
    $$('.vote-progress span').forEach(el => { el.textContent = data.voted + '/' + data.total + ' voted'; });
  });

  socket.on('susReveal', data => {
    stopTimer();
    showMini('susRevealScreen');
    const promptEl = $('#susActualPrompt');
    if (promptEl) promptEl.textContent = '"' + (data.actualPrompt || '?') + '"';
    const revealList = $('#susRevealList');
    if (revealList) {
      revealList.innerHTML = data.results.map((r, i) =>
        '<div class="reveal-item" style="animation-delay:' + (i*0.15) + 's">' +
        '<strong>' + esc(r.name) + '</strong>: ' + esc(r.caption) + ' <span class="rizz-avg">👍 ' + r.votes + '</span>' +
        '</div>'
      ).join('');
    }
    const winner = $('#susWinner');
    if (winner) winner.textContent = data.winnerName ? '🏆 Best caption: ' + data.winnerName : 'No captions!';
  });

  // ── Caption This Disaster ──
  socket.on('captionStart', data => {
    hasSubmitted = false; currentMiniGame = 'caption';
    showMini('captionScreen');
    const scene = $('#captionScene'), label = $('#captionLabel');
    if (scene) scene.textContent = data.scene;
    if (label) label.textContent = data.label;
    const inp = $('#captionInput'); if (inp) inp.value = '';
    const btn = $('#captionSubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit 🔥'; }
    const prog = $('#captionProgress'); if (prog) prog.textContent = '0/' + lastPlayerList.length + ' submitted';
    startTimer(data.duration);
  });

  socket.on('captionVoteStart', data => {
    stopTimer();
    showMini('captionVoteScreen');
    buildVoteList('#captionVoteList', '#captionVoteProgress', data.submissions, 'captionVote');
    startTimer(data.duration);
  });

  socket.on('captionReveal', data => {
    stopTimer();
    showMini('captionRevealScreen');
    const sceneEl = $('#captionRevealScene');
    if (sceneEl) sceneEl.textContent = data.scene?.scene || '';
    buildRevealList('#captionRevealList', data.results);
    const winner = $('#captionWinner');
    if (winner) winner.textContent = data.winnerName ? '🏆 Winner: ' + data.winnerName : '💀 No submissions!';
  });

  // ── Excuse ──
  socket.on('excuseStart', data => {
    hasSubmitted = false; currentMiniGame = 'excuse';
    showMini('excuseScreen');
    const promEl = $('#excusePrompt'); if (promEl) promEl.textContent = data.prompt;
    const inp = $('#excuseInput'); if (inp) inp.value = '';
    const btn = $('#excuseSubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit 🤞'; }
    const prog = $('#excuseProgress'); if (prog) prog.textContent = '0/' + lastPlayerList.length + ' submitted';
    startTimer(data.duration);
  });

  socket.on('excuseVoteStart', data => {
    stopTimer();
    showMini('excuseVoteScreen');
    buildVoteList('#excuseVoteList', '#excuseVoteProgress', data.submissions, 'excuseVote');
    startTimer(data.duration);
  });

  socket.on('excuseReveal', data => {
    stopTimer();
    showMini('excuseRevealScreen');
    const promEl = $('#excuseRevealPrompt'); if (promEl) promEl.textContent = data.prompt;
    buildRevealList('#excuseRevealList', data.results);
    const winner = $('#excuseWinner');
    if (winner) winner.textContent = data.winnerName ? '🏆 Most believable: ' + data.winnerName : '💀 No excuses submitted!';
  });

  // ── Rizz ──
  socket.on('rizzStart', data => {
    hasSubmitted = false; currentMiniGame = 'rizz';
    showMini('rizzScreen');
    const promEl = $('#rizzPrompt'); if (promEl) promEl.textContent = data.prompt;
    const inp = $('#rizzInput'); if (inp) inp.value = '';
    const btn = $('#rizzSubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit 🔥'; }
    const prog = $('#rizzProgress'); if (prog) prog.textContent = '0/' + lastPlayerList.length + ' submitted';
    startTimer(data.duration);
  });

  socket.on('rizzRateStart', data => {
    stopTimer();
    showMini('rizzRateScreen');
    const list = $('#rizzRateList');
    if (list) {
      list.innerHTML = data.submissions.map(s =>
        '<div class="rizz-rate-item" data-pid="' + s.playerId + '">' +
        '<div class="rizz-rate-text">' + esc(s.text) + '</div>' +
        '<div class="rizz-stars">' +
        [1,2,3,4,5].map(i => '<button class="star-btn" data-rating="' + i + '">⭐</button>').join('') +
        '</div>' +
        '</div>'
      ).join('');
    }
    startTimer(data.duration);
  });

  socket.on('rizzReveal', data => {
    stopTimer();
    showMini('rizzRevealScreen');
    const list = $('#rizzRevealList');
    if (list) {
      list.innerHTML = (data.results || []).map((r, i) =>
        '<div class="reveal-item" style="animation-delay:' + (i*0.15) + 's">' +
        '<strong>' + esc(r.name) + '</strong>: ' + esc(r.text) +
        '<span class="rizz-avg">⭐ ' + (r.avg ? r.avg.toFixed(1) : '—') + '</span>' +
        '</div>'
      ).join('');
    }
    const winner = $('#rizzWinner');
    if (winner) winner.textContent = data.winnerName ? '🏆 Top rizz: ' + data.winnerName : '💀 No submissions!';
  });

  // ── Lie Detector ──
  socket.on('lieStart', data => {
    isSpeaker = data.speakerId === myId;
    currentMiniGame = 'liedetector'; pendingLieIsLie = null;
    showMini('lieScreen');
    const label = $('#lieSpeakerLabel');
    if (label) label.textContent = isSpeaker ? '🎤 Your turn!' : esc(data.speakerName) + ' is preparing a statement...';
    const promEl = $('#liePrompt'); if (promEl) promEl.textContent = data.prompt;
    const speakerArea = $('#lieSpeakerArea'), watchArea = $('#lieWatchArea'), submitStatus = $('#lieSubmitStatus');
    if (isSpeaker) {
      show(speakerArea); hide(watchArea); hide(submitStatus);
      const inp = $('#lieInput'); if (inp) { inp.value = ''; inp.disabled = false; }
      // Inject submit button if not present
      if (!$('#lieSubmitConfirm')) {
        const btn = document.createElement('button');
        btn.id = 'lieSubmitConfirm'; btn.className = 'btn btn-bach';
        btn.textContent = '🔒 Lock In Statement';
        speakerArea?.appendChild(btn);
      }
      if ($('#lieRealBtn')) { $('#lieRealBtn').classList.remove('active'); }
      if ($('#lieLieBtn'))  { $('#lieLieBtn').classList.remove('active'); }
    } else {
      hide(speakerArea); show(watchArea); hide(submitStatus);
    }
    startTimer(data.duration);
  });

  socket.on('lieStatementReceived', () => {
    const speakerArea = $('#lieSpeakerArea'), submitStatus = $('#lieSubmitStatus');
    hide(speakerArea); show(submitStatus);
    if (submitStatus) submitStatus.textContent = 'Statement locked in! 🔒';
  });

  socket.on('lieVoteStart', data => {
    stopTimer(); hasVoted = false;
    showMini('lieVoteScreen');
    const spkEl = $('#lieVoteSpeaker');
    if (spkEl) spkEl.textContent = esc(data.speakerName) + ' says...';
    const stEl = $('#lieStatement');
    if (stEl) stEl.textContent = '"' + data.statement + '"';
    const btns = $('#lieVoteBtns');
    if (btns) {
      btns.innerHTML =
        '<button class="btn btn-lie-real" data-lie-verdict="real">✅ REAL</button>' +
        '<button class="btn btn-lie-cap" data-lie-verdict="lie">🤥 CAP</button>';
    }
    const progEl = $('#lieVoteProgress'); if (progEl) progEl.textContent = '0/? voted';
    startTimer(data.duration);
  });

  socket.on('lieReveal', data => {
    stopTimer();
    showMini('lieRevealScreen');
    const verdictEl = $('#lieRevealVerdict'); if (verdictEl) verdictEl.textContent = data.verdict;
    const textEl = $('#lieRevealText'); if (textEl) textEl.textContent = '"' + (data.text || '') + '"';
    const statsEl = $('#lieRevealStats');
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="reveal-stat-row"><span>Speaker</span><span>' + esc(data.speakerName) + '</span></div>' +
        '<div class="reveal-stat-row"><span>Fooled</span><span>' + data.fooledCount + ' player(s) 💀</span></div>' +
        '<div class="reveal-stat-row"><span>Caught</span><span>' + data.correctCount + ' player(s) 🕵️</span></div>';
    }
  });

  // ── Drunk Logic ──
  socket.on('drunkStart', data => {
    hasSubmitted = false; currentMiniGame = 'drunklogic';
    showMini('drunkScreen');
    const promEl = $('#drunkPrompt'); if (promEl) promEl.textContent = data.prompt;
    const inp = $('#drunkInput'); if (inp) inp.value = '';
    const btn = $('#drunkSubmitBtn'); if (btn) { btn.disabled = false; btn.textContent = 'Submit 🍺'; }
    const prog = $('#drunkProgress'); if (prog) prog.textContent = '0/' + lastPlayerList.length + ' submitted';
    startTimer(data.duration);
  });

  socket.on('drunkVoteStart', data => {
    stopTimer();
    showMini('drunkVoteScreen');
    buildVoteList('#drunkVoteList', '#drunkVoteProgress', data.submissions, 'drunkVote');
    startTimer(data.duration);
  });

  socket.on('drunkReveal', data => {
    stopTimer();
    showMini('drunkRevealScreen');
    const promEl = $('#drunkRevealPrompt'); if (promEl) promEl.textContent = data.prompt;
    buildRevealList('#drunkRevealList', data.results);
    const winner = $('#drunkWinner');
    if (winner) winner.textContent = data.winnerName ? '🏆 Most unhinged: ' + data.winnerName : '💀 No submissions!';
  });

  // ── Game Over ──
  socket.on('gameOver', data => {
    stopTimer();
    const players = data.players || [];
    const chaosFinal = $('#chaosFinalScore');
    if (chaosFinal) chaosFinal.textContent = '🔥 Final chaos: ' + (data.chaosScore || 0) + '/100';
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
    const stats = data.stats || {};
    const TITLES = {
      topRizz:       { title: 'Main Character 🔥', emoji: '🔥' },
      topExcuse:     { title: 'Professional Liar', emoji: '🤥' },
      liesCaught:    { title: 'Human Lie Detector', emoji: '🕵️' },
      drunkLogicWins:{ title: 'Certified Unhinged', emoji: '🍺' },
      default:       { title: 'Survivor',           emoji: '😐' },
    };
    const titleCards = $('#titleCards');
    if (titleCards) {
      titleCards.innerHTML = '<div style="font-size:12px;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Titles Awarded</div>' +
        players.map(p => {
          const s = stats[p.id] || {};
          const maxKey = ['topRizz','topExcuse','liesCaught','drunkLogicWins'].reduce((best, k) => {
            return (s[k] || 0) > (s[best] || 0) ? k : best;
          }, 'topRizz');
          const t = (s[maxKey] || 0) > 0 ? (TITLES[maxKey] || TITLES.default) : TITLES.default;
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

  // ── Pre-fill name ──
  try {
    const identity = JSON.parse(localStorage.getItem('afterdark_identity') || '{}');
    if (identity.name) { const el = $('#playerName'); if (el) el.value = identity.name; myName = identity.name; }
  } catch (e) {}

})();
