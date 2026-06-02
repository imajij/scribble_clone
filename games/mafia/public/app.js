// ============================================================
// MAFIA 🕵️ — Client (plain script, not a module)
// ============================================================
(() => {
  const $ = (s) => document.querySelector(s);
  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');

  // ── Role metadata (display only; authority lives on the server) ──
  const ROLE_META = {
    mafia:     { name: 'Mafia',     icon: '🔪', desc: 'Eliminate the town. Pick a victim each night.', cls: 'role-mafia' },
    detective: { name: 'Detective', icon: '🔍', desc: 'Investigate one player each night.',            cls: 'role-detective' },
    doctor:    { name: 'Doctor',    icon: '💉', desc: 'Save one player from death each night.',         cls: 'role-doctor' },
    villager:  { name: 'Villager',  icon: '🧑‍🌾', desc: 'Find the mafia and vote them out by day.',     cls: 'role-villager' },
  };

  // ── Session / persistence ──
  const SKEY = 'adg_mafia_session';
  const RKEY = 'adg_mafia_room';
  const NKEY = 'adg_mafia_name';
  let sessionId = sessionStorage.getItem(SKEY);
  if (!sessionId) {
    sessionId = (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SKEY, sessionId);
  }
  let currentRoom = sessionStorage.getItem(RKEY);
  let myName = sessionStorage.getItem(NKEY) || '';

  // ── State ──
  let myId = null;
  let isOwner = false;
  let myRole = null;
  let amAlive = true;
  let timerInterval = null;
  let players = [];          // last known player list
  let phase = 'waiting';     // waiting | night | day | gameOver
  let didAct = false;        // already submitted action/vote this phase

  const socket = io('/mafia');

  if (myName) { const el = $('#playerName'); if (el) el.value = myName; }

  // ═══════════════════════════════════════════
  // Lobby controls
  // ═══════════════════════════════════════════
  $('#createRoomBtn').addEventListener('click', () => {
    const name = $('#playerName').value.trim();
    if (!name) return alert('Enter your name first!');
    myName = name; sessionStorage.setItem(NKEY, name);
    socket.emit('createRoom', { playerName: name, sessionId });
  });

  $('#joinRoomBtn').addEventListener('click', () => doJoin($('#roomCodeInput').value));

  $('#roomCodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(e.target.value); });

  function doJoin(code) {
    const name = $('#playerName').value.trim();
    code = (code || '').trim().toUpperCase();
    if (!name) return alert('Enter your name first!');
    if (!code) return alert('Enter a room code!');
    myName = name; sessionStorage.setItem(NKEY, name);
    socket.emit('joinRoom', { roomId: code, playerName: name, sessionId });
  }

  $('#startGameBtn').addEventListener('click', () => socket.emit('startGame'));
  $('#playAgainBtn').addEventListener('click', () => socket.emit('playAgain'));

  // ── Chat ──
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
  // Socket events
  // ═══════════════════════════════════════════
  socket.on('connect', () => {
    if (currentRoom && myName) {
      socket.emit('reconnectSession', { sessionId, roomId: currentRoom, playerName: myName });
    }
  });

  socket.on('reconnectFailed', () => {
    currentRoom = null;
    sessionStorage.removeItem(RKEY);
    showScreen('lobby');
  });

  socket.on('error', ({ message }) => alert(message));

  socket.on('roomList', renderRoomList);

  socket.on('joinedRoom', (data) => {
    myId = data.playerId;
    currentRoom = data.roomId;
    sessionStorage.setItem(RKEY, data.roomId);
    players = data.players || [];
    phase = data.state;
    isOwner = (data.owner === myId);

    if (data.maxPlayers) { const pc = $('#playerCount'); if (pc) pc.parentElement.innerHTML = `Players: <span id="playerCount">${players.length}</span>/${data.maxPlayers}`; }

    if (data.state === 'waiting') {
      showScreen('waiting');
      $('#roomCodeDisplay').textContent = data.roomId;
      renderWaitingPlayers(players);
      updateStartBtn();
    } else {
      // Mid-game reconnect — server will also push yourRole + privateView.
      showScreen('game');
      $('#dayCounter').textContent = data.dayNum || 1;
      renderGamePlayers(players);
      if (data.phase) {
        setPhaseChrome(data.phase.state, data.phase.dayNum);
        if (data.phase.lastResolution) showResolutionBanner(data.phase.lastResolution);
      }
      if (data.gameOver) showGameOver(data.gameOver);
    }
  });

  socket.on('playerJoined', ({ players: pl }) => { players = pl; renderWaitingPlayers(pl); addSystemMsg('A player joined.'); });
  socket.on('playerLeft', ({ playerName, players: pl }) => { players = pl; renderWaitingPlayers(pl); renderGamePlayers(pl); addSystemMsg(`${playerName} left.`); });
  socket.on('playerReconnected', ({ playerName }) => addSystemMsg(`${playerName} reconnected.`));
  socket.on('playerDisconnected', ({ playerName }) => addSystemMsg(`${playerName} disconnected…`));

  socket.on('playerList', (pl) => { players = pl; renderWaitingPlayers(pl); renderGamePlayers(pl); updateStartBtn(); });

  socket.on('ownerUpdate', ({ owner }) => {
    isOwner = (owner === myId);
    updateStartBtn();
    const overlay = $('#gameOverOverlay');
    const btn = $('#playAgainBtn');
    if (overlay && !overlay.classList.contains('hidden') && btn) {
      if (isOwner) { show(btn); btn.disabled = false; }
      else hide(btn);
    }
  });

  // ── Role assignment (private) ──
  socket.on('yourRole', ({ role, mafiaPartners }) => {
    myRole = role;
    renderRoleCard(role);
    if (role === 'mafia' && mafiaPartners) {
      const others = mafiaPartners.filter((m) => m.id !== myId).map((m) => m.name);
      if (others.length) addSystemMsg(`🔪 Your fellow mafia: ${others.join(', ')}`);
      else addSystemMsg('🔪 You are the lone mafia.');
    }
  });

  socket.on('gameStarted', ({ players: pl }) => {
    players = pl;
    didAct = false;
    showScreen('game');
    renderGamePlayers(pl);
  });

  // ── Per-phase private actionable view (also sent on reconnect) ──
  socket.on('privateView', (view) => {
    amAlive = view.alive;
    if (view.role) { myRole = view.role; renderRoleCard(view.role); }
    didAct = false;
    renderAction(view);
  });

  // ── Night ──
  socket.on('nightStart', ({ dayNum, duration, players: pl }) => {
    phase = 'night'; didAct = false;
    players = pl;
    setPhaseChrome('night', dayNum);
    renderGamePlayers(pl);
    startTimer(duration);
    // privateView arrives right after with the actionable UI.
  });

  socket.on('mafiaPick', ({ targetName, by }) => {
    setActionStatus(`${by} targets ${targetName}`);
    markChosen(null, targetName);
  });

  socket.on('investigationResult', ({ targetName, isMafia }) => {
    didAct = true;
    showInfoBanner(
      isMafia
        ? `🔍 <b>${esc(targetName)}</b> is <span class="verdict bad">MAFIA</span>`
        : `🔍 <b>${esc(targetName)}</b> is <span class="verdict good">NOT mafia</span>`
    );
    setActionStatus('Investigation complete.');
    disableTargets();
  });

  socket.on('saveConfirmed', ({ targetName }) => {
    setActionStatus(`💉 You are protecting ${targetName}.`);
  });

  socket.on('nightResult', ({ resolution, players: pl }) => {
    clearTimer();
    players = pl;
    renderGamePlayers(pl);
    showResolutionBanner(resolution);
  });

  // ── Day ──
  socket.on('dayStart', ({ dayNum, duration, players: pl, tally }) => {
    phase = 'day'; didAct = false;
    players = pl;
    setPhaseChrome('day', dayNum);
    renderGamePlayers(pl);
    startTimer(duration);
    if (tally) renderTally(tally);
  });

  socket.on('voteUpdate', (tally) => renderTally(tally));

  socket.on('dayResult', ({ resolution, players: pl }) => {
    clearTimer();
    players = pl;
    renderGamePlayers(pl);
    showResolutionBanner(resolution);
  });

  // ── Game over ──
  socket.on('gameOver', (payload) => {
    clearTimer();
    phase = 'gameOver';
    showGameOver(payload);
  });

  socket.on('backToLobby', ({ players: pl, owner }) => {
    players = pl;
    phase = 'waiting';
    myRole = null; amAlive = true; didAct = false;
    isOwner = (owner === myId);
    hide($('#gameOverOverlay'));
    showScreen('waiting');
    $('#roomCodeDisplay').textContent = currentRoom || '';
    renderWaitingPlayers(pl);
    updateStartBtn();
  });

  // ── Chat ──
  socket.on('chatMessage', ({ name, message, ghost }) => addChatMsg(name, message, ghost));

  // ═══════════════════════════════════════════
  // Screens
  // ═══════════════════════════════════════════
  function showScreen(name) {
    hide($('#lobbyScreen')); hide($('#waitingScreen')); hide($('#gameScreen'));
    hide($('#gameOverOverlay'));
    if (name === 'lobby') show($('#lobbyScreen'));
    else if (name === 'waiting') show($('#waitingScreen'));
    else if (name === 'game') show($('#gameScreen'));
  }

  // ═══════════════════════════════════════════
  // Lobby / waiting rendering
  // ═══════════════════════════════════════════
  function renderWaitingPlayers(pl) {
    const grid = $('#waitingPlayers');
    if (!grid) return;
    grid.innerHTML = pl.map((p) =>
      `<div class="player-chip${p.isOwner ? ' owner' : ''}">${p.isOwner ? '👑 ' : ''}${esc(p.name)}</div>`
    ).join('');
    const c = $('#playerCount'); if (c) c.textContent = pl.length;
  }

  function updateStartBtn() {
    const btn = $('#startGameBtn');
    if (!btn) return;
    const count = players.length;
    if (count < 4) { btn.disabled = true; btn.textContent = 'Need 4+ players to start'; }
    else if (!isOwner) { btn.disabled = true; btn.textContent = 'Waiting for host to start…'; }
    else { btn.disabled = false; btn.textContent = '🎭 Start Game!'; }
  }

  function renderRoomList(rooms) {
    const wrap = $('#activeRooms');
    const container = $('#roomListContainer');
    if (!wrap || !container) return;
    if (!rooms || !rooms.length) { hide(wrap); return; }
    show(wrap);
    container.innerHTML = rooms.map((r) =>
      `<div class="room-item" data-room="${r.id}">` +
      `<span class="room-id">${r.id}</span>` +
      `<span>${r.players} player${r.players !== 1 ? 's' : ''}</span>` +
      `<button class="btn btn-secondary" style="padding:6px 16px;font-size:.85rem">Join</button>` +
      `</div>`
    ).join('');
    container.querySelectorAll('[data-room]').forEach((el) => {
      el.addEventListener('click', () => doJoin(el.dataset.room));
    });
  }

  // ═══════════════════════════════════════════
  // Game rendering
  // ═══════════════════════════════════════════
  function renderRoleCard(role) {
    const meta = ROLE_META[role] || { name: '—', icon: '❔', desc: '', cls: '' };
    const card = $('#roleCard');
    if (card) card.className = 'role-card ' + (meta.cls || '');
    const nameEl = $('#roleCardName');
    if (nameEl) nameEl.textContent = `${meta.icon} ${meta.name}`;
    const descEl = $('#roleCardDesc');
    if (descEl) descEl.textContent = meta.desc;
  }

  function renderGamePlayers(pl) {
    const list = $('#playerList');
    if (!list) return;
    list.innerHTML = pl.map((p) => {
      const dead = !p.alive;
      const me = p.id === myId ? ' me' : '';
      const off = p.connected === false ? ' offline' : '';
      const tag = p.isOwner ? '👑 ' : '';
      const status = dead ? '💀' : (p.connected === false ? '🔌' : '');
      return `<div class="player-row${dead ? ' dead' : ''}${me}${off}" data-id="${p.id}">` +
        `<span class="p-name">${tag}${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span>` +
        `<span class="p-badge">${status}</span>` +
        `</div>`;
    }).join('');
  }

  function setPhaseChrome(state, dayNum) {
    phase = state;
    if (dayNum) $('#dayCounter').textContent = dayNum;
    const chip = $('#phaseChip');
    const label = $('#phaseLabel');
    const chatLabel = $('#chatLabel');
    const chatInput = $('#chatInput');
    if (state === 'night') {
      if (chip) { chip.textContent = '🌙 Night'; chip.className = 'phase-chip night'; }
      if (label) label.textContent = 'Night Falls';
      if (chatLabel) chatLabel.textContent = amAlive ? '💬 Quiet… (night)' : '👻 Ghost Chat';
      if (chatInput) chatInput.placeholder = amAlive ? 'Town sleeps…' : 'Whisper to the dead…';
    } else if (state === 'day') {
      if (chip) { chip.textContent = '☀️ Day'; chip.className = 'phase-chip day'; }
      if (label) label.textContent = 'Town Discussion';
      if (chatLabel) chatLabel.textContent = amAlive ? '💬 Town Square' : '👻 Ghost Chat';
      if (chatInput) chatInput.placeholder = amAlive ? 'Discuss & accuse…' : 'Whisper to the dead…';
    }
  }

  // ── Render the actionable card for THIS player's current view ──
  function renderAction(view) {
    const action = view.action;
    const announce = $('#announceCard');
    const actionCard = $('#actionCard');
    hide($('#infoBanner'));
    $('#infoBanner').innerHTML = '';

    // Spectator / dead
    if (action === 'spectate') {
      hide(actionCard);
      showAnnounce('💀', 'You are dead.', 'You spectate everything and can ghost-chat with the dead.');
      return;
    }
    // Villager at night, or alive non-actor
    if (action === 'sleep') {
      hide(actionCard);
      showAnnounce('🌙', 'Night falls over the town…', 'You sleep soundly. Wait for dawn.');
      return;
    }
    if (action === 'none') { hide(actionCard); hide(announce); return; }

    // Build a target-picker action card
    hide(announce);
    show(actionCard);
    const badge = $('#actionBadge');
    const prompt = $('#actionPrompt');

    let badgeText = 'Action', badgeCls = 'q-badge', promptText = 'Choose a target', event = null;
    let preSelected = null;

    if (action === 'mafia') {
      badgeText = '🔪 Mafia'; badgeCls = 'q-badge extreme';
      const partners = (view.mafiaPartners || []).filter((m) => m.id !== myId).map((m) => m.name);
      promptText = partners.length ? `Pick a victim. Allies: ${partners.join(', ')}` : 'Pick tonight\'s victim.';
      event = 'mafiaTarget';
      preSelected = view.currentTarget;
    } else if (action === 'detective') {
      badgeText = '🔍 Detective'; badgeCls = 'q-badge';
      promptText = 'Investigate one player.';
      event = 'detectiveCheck';
      preSelected = view.currentTarget;
      if (view.investigation) {
        didAct = true;
        showInfoBanner(view.investigation.isMafia
          ? `🔍 <b>${esc(view.investigation.targetName)}</b> is <span class="verdict bad">MAFIA</span>`
          : `🔍 <b>${esc(view.investigation.targetName)}</b> is <span class="verdict good">NOT mafia</span>`);
      }
    } else if (action === 'doctor') {
      badgeText = '💉 Doctor'; badgeCls = 'q-badge mild';
      promptText = 'Protect one player tonight.';
      event = 'doctorSave';
      preSelected = view.currentTarget;
    } else if (action === 'vote') {
      badgeText = '🗳️ Day Vote'; badgeCls = 'q-badge';
      promptText = 'Vote to eliminate — or abstain.';
      event = 'dayVote';
      preSelected = view.currentVote;
    }

    badge.textContent = badgeText;
    badge.className = badgeCls;
    prompt.textContent = promptText;

    const targets = (view.targets || []).slice();
    const allowAbstain = (action === 'vote');
    renderTargets(targets, event, preSelected, allowAbstain);

    // Detective already investigated this night (reconnect) — lock the picker.
    if (action === 'detective' && view.investigation) {
      disableTargets();
      setActionStatus('Investigation complete.');
    }

    if (preSelected) {
      didAct = (action === 'vote') ? false : true; // votes are changeable; night actions lock visually
      setActionStatus(action === 'vote' ? 'You can change your vote.' : 'Choice submitted.');
    } else {
      setActionStatus('');
    }
    if (action === 'vote' && view.tally) renderTally(view.tally);
  }

  function renderTargets(targets, event, preSelected, allowAbstain) {
    const list = $('#targetList');
    if (!list) return;
    let html = targets.map((t) =>
      `<button class="target-btn${t.id === preSelected ? ' selected' : ''}" data-id="${t.id}">${esc(t.name)}</button>`
    ).join('');
    if (allowAbstain) {
      html += `<button class="target-btn abstain${preSelected === 'abstain' ? ' selected' : ''}" data-id="abstain">🤐 Abstain</button>`;
    }
    list.innerHTML = html;

    list.querySelectorAll('.target-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.id;
        // Night actions lock after submit; day votes are changeable.
        if (event !== 'dayVote' && didAct) return;
        socket.emit(event, { targetId });
        list.querySelectorAll('.target-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (event === 'dayVote') {
          setActionStatus('Vote cast — you can change it.');
        } else {
          didAct = true;
          setActionStatus('Choice submitted.');
        }
      });
    });
  }

  function markChosen(targetId, targetName) {
    // Visually mark the mafia's shared pick.
    const list = $('#targetList');
    if (!list) return;
    list.querySelectorAll('.target-btn').forEach((b) => {
      b.classList.toggle('group-pick', b.textContent === targetName);
    });
  }

  function disableTargets() {
    const list = $('#targetList');
    if (!list) return;
    list.querySelectorAll('.target-btn').forEach((b) => { b.disabled = true; });
  }

  function setActionStatus(text) {
    const el = $('#actionStatus');
    if (el) el.textContent = text || '';
  }

  function showAnnounce(icon, text, sub) {
    const card = $('#announceCard');
    show(card);
    $('#announceIcon').textContent = icon;
    $('#announceText').textContent = text;
    $('#announceSub').textContent = sub || '';
  }

  function showInfoBanner(html) {
    const b = $('#infoBanner');
    if (!b) return;
    b.innerHTML = html;
    show(b);
  }

  function showResolutionBanner(res) {
    if (!res) return;
    hide($('#actionCard'));
    if (res.type === 'night') {
      $('#phaseLabel').textContent = 'Dawn Breaks';
      if (res.killedName) {
        showAnnounce('💀', `${res.killedName} was killed in the night.`,
          `They were the ${roleLabel(res.killedRole)}.`);
      } else if (res.saved) {
        showAnnounce('💉', 'The doctor saved a life!', 'Nobody died last night.');
      } else {
        showAnnounce('🌅', 'Nobody died last night.', 'The town wakes uneasy.');
      }
    } else if (res.type === 'day') {
      $('#phaseLabel').textContent = 'Verdict';
      if (res.eliminatedName) {
        showAnnounce('⚖️', `${res.eliminatedName} was voted out.`,
          `They were the ${roleLabel(res.eliminatedRole)}.`);
      } else if (res.tie) {
        showAnnounce('🤝', 'The vote was tied.', 'Nobody is eliminated.');
      } else {
        showAnnounce('🤐', 'No one was eliminated.', 'The town could not decide.');
      }
    }
  }

  function roleLabel(role) {
    const m = ROLE_META[role];
    return m ? `${m.icon} ${m.name}` : 'Unknown';
  }

  // ── Day vote tally (public) ──
  function renderTally(tally) {
    if (!tally) return;
    const status = $('#actionStatus');
    if (status && phase === 'day') {
      status.textContent = `${tally.voted}/${tally.total} voted` + (tally.abstain ? ` · ${tally.abstain} abstain` : '');
    }
    // Annotate each target button with its vote count.
    const list = $('#targetList');
    if (!list) return;
    list.querySelectorAll('.target-btn').forEach((b) => {
      const id = b.dataset.id;
      const n = (tally.counts && tally.counts[id]) || 0;
      let badge = b.querySelector('.vote-count');
      if (n > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'vote-count'; b.appendChild(badge); }
        badge.textContent = ' ×' + n;
      } else if (badge) { badge.remove(); }
    });
  }

  // ═══════════════════════════════════════════
  // Game over
  // ═══════════════════════════════════════════
  function showGameOver(payload) {
    clearTimer();
    const overlay = $('#gameOverOverlay');
    show(overlay);
    const winner = payload.winner;
    const title = $('#gameOverTitle');
    const sub = $('#gameOverSub');
    if (winner === 'mafia') { title.textContent = '🔪 Mafia Win!'; sub.textContent = 'The town has fallen.'; }
    else if (winner === 'villagers') { title.textContent = '🎉 Villagers Win!'; sub.textContent = 'All mafia eliminated.'; }
    else { title.textContent = 'Game Over'; sub.textContent = ''; }

    const list = $('#finalScores');
    const roles = (payload.roles || []).slice().sort((a, b) => roleRank(a.role) - roleRank(b.role));
    list.innerHTML = roles.map((p) => {
      const meta = ROLE_META[p.role] || { name: p.role || '?', icon: '❔' };
      return `<div class="score-row">` +
        `<span class="rank">${meta.icon}</span>` +
        `<span class="s-name">${esc(p.name)}${p.alive ? '' : ' 💀'}</span>` +
        `<span class="s-score">${meta.name}</span>` +
        `</div>`;
    }).join('');

    const btn = $('#playAgainBtn');
    if (btn) { if (isOwner) { show(btn); btn.disabled = false; } else hide(btn); }
  }

  function roleRank(role) {
    return ({ mafia: 0, detective: 1, doctor: 2, villager: 3 })[role] ?? 9;
  }

  // ═══════════════════════════════════════════
  // Timer (display only — server is authoritative)
  // ═══════════════════════════════════════════
  function startTimer(seconds) {
    clearTimer();
    let remaining = Math.max(0, Math.floor(seconds || 0));
    const d = $('#timerDisplay');
    if (d) { d.textContent = remaining; d.classList.remove('urgent'); }
    timerInterval = setInterval(() => {
      remaining--;
      if (d) {
        d.textContent = Math.max(0, remaining);
        if (remaining <= 5) d.classList.add('urgent');
      }
      if (remaining <= 0) clearTimer();
    }, 1000);
  }

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    const d = $('#timerDisplay');
    if (d) d.classList.remove('urgent');
  }

  // ═══════════════════════════════════════════
  // Chat helpers
  // ═══════════════════════════════════════════
  function addSystemMsg(text) {
    const d = document.createElement('div');
    d.className = 'chat-msg system';
    d.textContent = text;
    appendChat(d);
  }
  function addChatMsg(name, msg, ghost) {
    const d = document.createElement('div');
    d.className = 'chat-msg' + (ghost ? ' ghost' : '');
    d.innerHTML = `<span class="author">${ghost ? '👻 ' : ''}${esc(name)}:</span> ${esc(msg)}`;
    appendChat(d);
  }
  function appendChat(el) {
    const c = $('#chatMessages');
    if (!c) return;
    c.appendChild(el);
    c.scrollTop = c.scrollHeight;
    while (c.children.length > 120) c.removeChild(c.firstChild);
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = (s == null ? '' : s); return d.innerHTML; }

  // ── SPA cleanup ──
  window.__gameCleanup = function () {
    try { socket.disconnect(); } catch (e) {}
    clearTimer();
  };
})();
