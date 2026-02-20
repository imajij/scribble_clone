// ========================================
// STORY BUILDER — Client App
// ========================================

(function () {
  "use strict";

  // ── Socket ──
  const socket = io("/story-builder");

  // ── Session persistence ──
  const SESSION_KEY = "storyBuilder_session";
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {}; } catch { return {}; }
  }
  function saveSession(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ── State ──
  let mySocketId = null;
  let roomId = null;
  let isOwner = false;
  let gameState = "lobby";
  let story = [];
  let currentWriter = null;
  let turnDuration = 45;
  let timerInterval = null;
  let prompt = "";

  // ── DOM refs ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const lobbyScreen = $("#lobbyScreen");
  const waitingScreen = $("#waitingScreen");
  const gameScreen = $("#gameScreen");
  const gameOverScreen = $("#gameOverScreen");

  const playerNameInput = $("#playerName");
  const roomCodeInput = $("#roomCodeInput");
  const createRoomBtn = $("#createRoomBtn");
  const joinRoomBtn = $("#joinRoomBtn");
  const startGameBtn = $("#startGameBtn");
  const lobbyError = $("#lobbyError");
  const promptInput = $("#promptInput");

  const waitingRoomCode = $("#waitingRoomCode");
  const waitingPlayers = $("#waitingPlayers");
  const waitingMsg = $("#waitingMsg");
  const waitingPrompt = $("#waitingPrompt");
  const waitingSettings = $("#waitingSettings");
  const copyCodeBtn = $("#copyCodeBtn");

  const gameRoomCode = $("#gameRoomCode");
  const roundInfo = $("#roundInfo");
  const playerListSidebar = $("#playerListSidebar");
  const turnBanner = $("#turnBanner");
  const turnWriter = $("#turnWriter");
  const timerFill = $("#timerFill");
  const timerText = $("#timerText");
  const storyContainer = $("#storyContainer");
  const storyPromptDisplay = $("#storyPromptDisplay");
  const storyContent = $("#storyContent");
  const inputArea = $("#inputArea");
  const sentenceInput = $("#sentenceInput");
  const charCounter = $("#charCounter");
  const submitBtn = $("#submitBtn");
  const waitingForWriter = $("#waitingForWriter");
  const waitingWriterName = $("#waitingWriterName");

  const chatMessages = $("#chatMessages");
  const chatInput = $("#chatInput");
  const chatSendBtn = $("#chatSendBtn");

  const finalStory = $("#finalStory");
  const writerStats = $("#writerStats");
  const copyStoryBtn = $("#copyStoryBtn");
  const playAgainBtn = $("#playAgainBtn");

  const roomListWrap = $("#roomListWrap");
  const roomListEl = $("#roomList");

  // ── Settings pills ──
  let selectedRounds = 3;
  let selectedTimer = 45;

  $$(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedRounds = parseInt(btn.dataset.rounds);
    });
  });

  $$(".timer-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".timer-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedTimer = parseInt(btn.dataset.timer);
    });
  });

  // ── Helpers ──
  function showScreen(screen) {
    [lobbyScreen, waitingScreen, gameScreen, gameOverScreen].forEach((s) => (s.style.display = "none"));
    screen.style.display = "flex";
  }

  function showToast(msg, duration) {
    const toast = $("#toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), duration || 3000);
  }

  function showError(msg) {
    lobbyError.textContent = msg;
    setTimeout(() => { lobbyError.textContent = ""; }, 4000);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function getSessionId() {
    let sid = loadSession().sessionId;
    if (!sid) {
      sid = "sb_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      saveSession({ sessionId: sid });
    }
    return sid;
  }

  // ── Reconnect attempt ──
  (function tryReconnect() {
    const sess = loadSession();
    if (sess.roomId && sess.sessionId && sess.playerName) {
      socket.emit("reconnectSession", {
        sessionId: sess.sessionId,
        roomId: sess.roomId,
        playerName: sess.playerName
      });
    }
  })();

  // ============================================================
  // LOBBY
  // ============================================================

  createRoomBtn.addEventListener("click", () => {
    const name = playerNameInput.value.trim();
    if (!name) { showError("Enter your name!"); return; }
    socket.emit("createRoom", {
      playerName: name,
      rounds: selectedRounds,
      turnDuration: selectedTimer,
      prompt: promptInput.value.trim(),
      sessionId: getSessionId()
    });
    saveSession({ ...loadSession(), playerName: name });
  });

  joinRoomBtn.addEventListener("click", () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!name) { showError("Enter your name!"); return; }
    if (!code) { showError("Enter a room code!"); return; }
    socket.emit("joinRoom", {
      roomId: code,
      playerName: name,
      sessionId: getSessionId()
    });
    saveSession({ ...loadSession(), playerName: name });
  });

  // ============================================================
  // WAITING ROOM
  // ============================================================

  copyCodeBtn.addEventListener("click", () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId).then(() => showToast("Room code copied!"));
    }
  });

  startGameBtn.addEventListener("click", () => {
    socket.emit("startGame");
  });

  function renderWaitingPlayers(players) {
    waitingPlayers.innerHTML = players.map((p) => {
      const style = "background:" + p.avatar + "22; border:2px solid " + p.avatar;
      let badges = "";
      if (p.isOwner) badges += " <span style=\"font-size:.7rem\">&#x1F451;</span>";
      if (p.disconnected) badges += " <span style=\"font-size:.7rem\">&#x1F4E1;</span>";
      return "<span class=\"player-chip\" style=\"" + style + "\"><span class=\"dot\" style=\"background:" + p.avatar + "\"></span>" + escapeHtml(p.name) + badges + "</span>";
    }).join("");
  }

  // ============================================================
  // GAME
  // ============================================================

  function renderPlayerList(players) {
    playerListSidebar.innerHTML = players.map((p) => {
      let cls = "";
      if (p.isWriter) cls += " is-writer";
      if (p.disconnected) cls += " disconnected";
      let badges = "";
      if (p.isOwner) badges += "<span class=\"player-badge badge-owner\">HOST</span>";
      if (p.isWriter) badges += "<span class=\"player-badge badge-writer\">WRITING</span>";
      if (p.disconnected) badges += "<span class=\"player-badge badge-dc\">DC</span>";
      return "<li class=\"" + cls + "\"><span class=\"player-dot\" style=\"background:" + p.avatar + "\"></span><span class=\"player-name\">" + escapeHtml(p.name) + "</span>" + badges + "<span style=\"font-size:.75rem;color:var(--text-muted)\">" + p.sentenceCount + "</span></li>";
    }).join("");
  }

  function renderStory() {
    if (story.length === 0) {
      storyContent.innerHTML = "<p class=\"story-placeholder\">The story will appear here once the first sentence is written...</p>";
      return;
    }
    let html = "";
    story.forEach((entry, i) => {
      if (entry.skipped) {
        html += "<span class=\"story-sentence skipped\" title=\"" + escapeHtml(entry.playerName) + " was skipped\">[...] </span>";
      } else if (entry.sentence) {
        const isNew = i === story.length - 1;
        html += "<span class=\"story-sentence" + (isNew ? " new" : "") + "\">" + escapeHtml(entry.sentence) + " </span>";
        html += "<span class=\"sentence-author\" title=\"Written by " + escapeHtml(entry.playerName) + "\" style=\"color:" + (entry.avatar || "var(--text-muted)") + "\">" + escapeHtml(entry.playerName) + "</span> ";
      }
    });
    storyContent.innerHTML = html;
    // Scroll to bottom
    storyContainer.scrollTop = storyContainer.scrollHeight;
  }

  function startTimer(duration) {
    clearInterval(timerInterval);
    let remaining = duration;
    timerFill.style.width = "100%";
    timerFill.classList.remove("low");
    timerText.textContent = remaining + "s";

    timerInterval = setInterval(() => {
      remaining--;
      if (remaining < 0) remaining = 0;
      const pct = (remaining / duration) * 100;
      timerFill.style.width = pct + "%";
      timerText.textContent = remaining + "s";
      if (remaining <= 10) timerFill.classList.add("low");
      if (remaining <= 0) clearInterval(timerInterval);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
  }

  function setWriterUI(writerName, amWriter) {
    turnWriter.textContent = amWriter ? "Your turn to write!" : writerName + " is writing...";

    if (amWriter) {
      inputArea.style.display = "block";
      waitingForWriter.style.display = "none";
      sentenceInput.value = "";
      sentenceInput.focus();
      charCounter.textContent = "0/280";
      charCounter.className = "char-counter";
    } else {
      inputArea.style.display = "none";
      waitingForWriter.style.display = "block";
      waitingWriterName.textContent = writerName;
    }
  }

  // Sentence input
  sentenceInput.addEventListener("input", () => {
    const len = sentenceInput.value.length;
    charCounter.textContent = len + "/280";
    charCounter.className = "char-counter";
    if (len > 250) charCounter.classList.add("warn");
    if (len > 270) charCounter.classList.add("danger");
  });

  sentenceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  });

  submitBtn.addEventListener("click", doSubmit);

  function doSubmit() {
    const sentence = sentenceInput.value.trim();
    if (!sentence) return;
    if (sentence.length > 280) { showToast("Sentence too long! Max 280 chars."); return; }
    socket.emit("submitSentence", { sentence: sentence });
    sentenceInput.value = "";
    charCounter.textContent = "0/280";
    charCounter.className = "char-counter";
    inputArea.style.display = "none";
    waitingForWriter.style.display = "block";
    waitingWriterName.textContent = "processing...";
  }

  // Chat
  chatSendBtn.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendChat(); }
  });

  function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit("chatMessage", msg);
    chatInput.value = "";
  }

  function addChatMsg(name, msg) {
    const el = document.createElement("div");
    el.className = "msg";
    el.innerHTML = "<span class=\"name\">" + escapeHtml(name) + ":</span> " + escapeHtml(msg);
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addSystemMsg(msg) {
    const el = document.createElement("div");
    el.className = "sys";
    el.textContent = msg;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ============================================================
  // GAME OVER
  // ============================================================

  function renderGameOver(data) {
    showScreen(gameOverScreen);
    stopTimer();
    gameState = "gameover";

    // Render final story
    let storyHtml = "";
    if (prompt) {
      storyHtml += "<div style=\"font-style:italic;color:var(--accent-glow);margin-bottom:1rem;border-left:3px solid var(--accent);padding-left:.8rem\">" + escapeHtml(prompt) + "</div>";
    }
    const fullStory = (data.story || story).filter(function(e) { return e.sentence; });
    fullStory.forEach(function(entry) {
      storyHtml += "<span style=\"color:" + (entry.avatar || "var(--text)") + "\">" + escapeHtml(entry.sentence) + "</span> ";
    });
    finalStory.innerHTML = storyHtml || "<em>No sentences were written.</em>";

    // Writer stats
    const players = data.players || [];
    writerStats.innerHTML = players.map(function(p) {
      return "<div class=\"stat-card\"><div class=\"stat-name\" style=\"color:" + p.avatar + "\">" + escapeHtml(p.name) + "</div><div class=\"stat-value\">" + p.sentenceCount + " sentence" + (p.sentenceCount !== 1 ? "s" : "") + " written</div></div>";
    }).join("");
  }

  copyStoryBtn.addEventListener("click", function() {
    const textParts = [];
    if (prompt) textParts.push("Prompt: " + prompt);
    story.filter(function(e) { return e.sentence; }).forEach(function(e) {
      textParts.push(e.sentence);
    });
    const fullText = textParts.join("\n\n");
    navigator.clipboard.writeText(fullText).then(function() { showToast("Story copied to clipboard!"); });
  });

  playAgainBtn.addEventListener("click", function() {
    if (!roomId) { showScreen(lobbyScreen); return; }
    story = [];
    gameState = "waiting";
    showScreen(waitingScreen);
    socket.emit("startGame");
  });

  // ============================================================
  // SOCKET EVENTS
  // ============================================================

  socket.on("connect", function() {
    mySocketId = socket.id;
  });

  socket.on("joinedRoom", function(data) {
    roomId = data.roomId;
    isOwner = data.isOwner;
    turnDuration = data.turnDuration || 45;
    prompt = data.prompt || "";
    story = data.story || [];

    saveSession({ ...loadSession(), roomId: roomId });

    if (data.state === "waiting") {
      showScreen(waitingScreen);
      gameState = "waiting";
      waitingRoomCode.textContent = roomId;
      waitingSettings.textContent = "Rounds: " + data.maxRounds + " | Timer: " + turnDuration + "s";

      if (prompt) {
        waitingPrompt.style.display = "block";
        waitingPrompt.textContent = "Prompt: " + prompt;
      } else {
        waitingPrompt.style.display = "none";
      }

      renderWaitingPlayers(data.players);
      startGameBtn.style.display = isOwner ? "block" : "none";
      waitingMsg.textContent = isOwner ? "Press start when everyone is ready!" : "Waiting for the host to start...";
    } else if (data.state === "writing") {
      enterGameScreen(data);
    } else if (data.state === "gameOver") {
      renderGameOver({ story: data.story, players: data.players });
    }

    if (data.reconnected) showToast("Reconnected!");
  });

  socket.on("reconnectFailed", function() {
    clearSession();
    showScreen(lobbyScreen);
  });

  socket.on("playerList", function(players) {
    if (gameState === "waiting") renderWaitingPlayers(players);
    if (gameState === "playing") renderPlayerList(players);
  });

  socket.on("playerJoined", function(data) {
    addSystemMsg(data.playerName + " joined!");
    showToast(data.playerName + " joined!");
  });

  socket.on("playerLeft", function(data) {
    const msg = data.playerName + (data.mayReconnect ? " disconnected (may reconnect)" : " left");
    addSystemMsg(msg);
  });

  socket.on("playerReconnected", function(data) {
    addSystemMsg(data.playerName + " reconnected!");
    showToast(data.playerName + " reconnected!");
  });

  socket.on("ownerUpdate", function(data) {
    isOwner = data.owner === mySocketId;
    if (gameState === "waiting") {
      startGameBtn.style.display = isOwner ? "block" : "none";
      waitingMsg.textContent = isOwner ? "Press start when everyone is ready!" : "Waiting for the host to start...";
    }
  });

  socket.on("systemMessage", function(data) {
    addSystemMsg(data.message);
  });

  socket.on("error", function(data) {
    showError(data.message);
    showToast(data.message);
  });

  socket.on("chatBroadcast", function(data) {
    addChatMsg(data.playerName, data.message);
  });

  // ── Game events ──

  socket.on("newTurn", function(data) {
    if (gameState !== "playing") {
      enterGameScreen(null);
    }
    currentWriter = data.writer;
    turnDuration = data.turnDuration || turnDuration;
    roundInfo.textContent = "Round " + data.roundNum + "/" + data.maxRounds;

    const amWriter = data.writer === mySocketId;
    setWriterUI(data.writerName, amWriter);
    startTimer(data.turnDuration);
  });

  socket.on("sentenceAdded", function(data) {
    story.push(data.entry);
    renderStory();
    showToast(data.writerName + " added a sentence!");
  });

  socket.on("turnSkipped", function(data) {
    story.push(data.entry);
    renderStory();
    showToast(data.writerName + " was skipped (timeout)");
  });

  socket.on("gameOver", function(data) {
    story = data.story || story;
    stopTimer();
    renderGameOver(data);
  });

  socket.on("gameReset", function(data) {
    stopTimer();
    story = data.story || [];
    gameState = "waiting";
    showScreen(waitingScreen);
    renderWaitingPlayers(data.players);
    showToast(data.message);
  });

  socket.on("roomList", function(list) {
    if (gameState !== "lobby") return;
    if (list.length === 0) { roomListWrap.style.display = "none"; return; }
    roomListWrap.style.display = "block";
    roomListEl.innerHTML = list.map(function(r) {
      return "<div class=\"room-item\" data-room=\"" + r.id + "\"><span>" + r.id + "</span><span>" + r.players + "/" + r.maxPlayers + " players</span></div>";
    }).join("");
    roomListEl.querySelectorAll(".room-item").forEach(function(el) {
      el.addEventListener("click", function() {
        roomCodeInput.value = el.dataset.room;
      });
    });
  });

  // ── Helpers ──

  function enterGameScreen(data) {
    showScreen(gameScreen);
    gameState = "playing";
    gameRoomCode.textContent = roomId;

    if (prompt) {
      storyPromptDisplay.style.display = "block";
      storyPromptDisplay.textContent = prompt;
    } else {
      storyPromptDisplay.style.display = "none";
    }

    if (data) {
      story = data.story || story;
      if (data.players) renderPlayerList(data.players);
      if (data.currentTurn) {
        currentWriter = data.currentTurn.writer;
        turnDuration = data.currentTurn.turnDuration || turnDuration;
        roundInfo.textContent = "Round " + data.currentTurn.roundNum + "/" + data.currentTurn.maxRounds;
        const amWriter = data.currentTurn.writer === mySocketId;
        setWriterUI(data.currentTurn.writerName, amWriter);
        startTimer(data.currentTurn.turnDuration);
      }
    }
    renderStory();
  }

  // ── SPA Cleanup ──
  window.__gameCleanup = function () {
    socket.disconnect();
    if (timerInterval) clearInterval(timerInterval);
  };

})();
