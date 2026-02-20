// ========================================
// DARE ROULETTE — Game Engine Module
// ========================================
//
// In-memory room state. No database.
// State machine: waiting → spinning → dareReveal → (loop) → gameOver
//
// Each turn:
//   1. Current player spins the wheel.
//   2. Server picks a random dare → broadcasts spin animation trigger.
//   3. After animation completes, dare is revealed.
//   4. Player "completes" or "chickens out".
//   5. Next player's turn.

const { getRandomDare, CATEGORIES } = require('./dares');

class DareRouletteGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Players  socketId → { name, score, avatar, sessionId, connected }
    this.players = new Map();
    this.state = 'waiting'; // waiting | spinning | dareReveal | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Turn
    this.turnOrder = [];
    this.turnIndex = -1;
    this.roundNum = 0;
    this.maxRounds = 3;          // full rotations through all players
    this.turnsThisRound = 0;
    this.currentPlayer = null;   // socketId of the spinner

    // Current dare
    this.currentDare = null;     // { id, text, category, intensity }

    // History of all dares performed in this session
    this.history = [];           // [{ dare, playerName, completed, timestamp }]

    // Category filter (null = all)
    this.categoryFilter = null;  // string[] | null
    this.maxIntensity = 3;

    // Used dare ids to avoid repeats
    this.usedDares = new Set();

    // Animation timing
    this.spinDuration = 4000;    // ms — client animation length

    // Timers
    this.spinTimer = null;
    this.revealTimeout = null;

    // Reconnect
    this.disconnectedPlayers = new Map(); // sessionId → held data
  }

  // ─── Player management ───────────────────────────────

  addPlayer(socketId, name, sessionId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F0B27A', '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2'
    ];
    const color = colors[this.players.size % colors.length];

    if (!this.owner || !this.players.has(this.owner)) {
      this.owner = socketId;
      this.ownerSessionId = sessionId || null;
    }

    this.players.set(socketId, {
      name,
      score: 0,
      avatar: color,
      sessionId: sessionId || null,
      connected: true
    });

    return this.players.get(socketId);
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.turnOrder = this.turnOrder.filter(id => id !== socketId);

    if (this.owner === socketId) {
      const remaining = [...this.players.keys()];
      this.owner = remaining.length > 0 ? remaining[0] : null;
      if (this.owner) {
        this.ownerSessionId = this.players.get(this.owner).sessionId;
      } else {
        this.ownerSessionId = null;
      }
    }
  }

  holdPlayerSeat(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.sessionId) return;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      score: player.score,
      avatar: player.avatar,
      sessionId: player.sessionId
    });
  }

  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;
    this.disconnectedPlayers.delete(sessionId);

    this.players.set(newSocketId, {
      name: held.name,
      score: held.score,
      avatar: held.avatar,
      sessionId: held.sessionId,
      connected: true
    });

    // Fix turn order
    const idx = this.turnOrder.indexOf(sessionId);
    if (idx !== -1) this.turnOrder[idx] = newSocketId;
    else this.turnOrder.push(newSocketId);

    if (this.currentPlayer === sessionId) this.currentPlayer = newSocketId;

    // Restore owner
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;

    return held;
  }

  hasDisconnectedPlayer(sessionId) {
    return this.disconnectedPlayers.has(sessionId);
  }

  isOwner(socketId) {
    return this.owner === socketId;
  }

  canStart() {
    return this.players.size >= 2 && this.state === 'waiting';
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((p, id) => {
      list.push({
        id,
        name: p.name,
        score: p.score,
        avatar: p.avatar,
        isOwner: id === this.owner,
        isSpinner: id === this.currentPlayer,
        disconnected: false
      });
    });
    this.disconnectedPlayers.forEach((held, sid) => {
      list.push({
        id: sid,
        name: held.name,
        score: held.score,
        avatar: held.avatar,
        isOwner: false,
        isSpinner: false,
        disconnected: true
      });
    });
    return list.sort((a, b) => b.score - a.score);
  }

  // ─── Game flow ───────────────────────────────────────

  startGame() {
    this.state = 'spinning';
    this.roundNum = 0;
    this.turnsThisRound = 0;
    this.turnIndex = -1;
    this.history = [];
    this.usedDares = new Set();
    this.players.forEach(p => { p.score = 0; });
    this.turnOrder = [...this.players.keys()];
    // Shuffle
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
    return this.nextTurn();
  }

  nextTurn() {
    this.currentDare = null;
    this.turnIndex++;

    // Check if we've completed a full rotation
    if (this.turnIndex >= this.turnOrder.length) {
      this.turnIndex = 0;
      this.roundNum++;
      if (this.roundNum >= this.maxRounds) {
        this.state = 'gameOver';
        return { event: 'gameOver', scores: this.getPlayerList(), history: this.history };
      }
    }

    this.currentPlayer = this.turnOrder[this.turnIndex];

    // Skip disconnected players
    if (!this.players.has(this.currentPlayer)) {
      if (this.turnOrder.every(id => !this.players.has(id))) return null;
      return this.nextTurn();
    }

    this.state = 'spinning';
    const spinner = this.players.get(this.currentPlayer);

    return {
      event: 'yourTurn',
      spinner: this.currentPlayer,
      spinnerName: spinner.name,
      roundNum: this.roundNum + 1,
      maxRounds: this.maxRounds
    };
  }

  /**
   * Called when the current player "spins".
   * Server picks the dare NOW but packages it so the client plays
   * a roulette animation first.
   */
  spin(socketId) {
    if (this.state !== 'spinning') return null;
    if (socketId !== this.currentPlayer) return null;

    const dare = getRandomDare({
      categories: this.categoryFilter,
      maxIntensity: this.maxIntensity,
      exclude: this.usedDares
    });

    if (!dare) {
      // Ran out of fresh dares — reset exclusion set
      this.usedDares.clear();
      const retry = getRandomDare({ categories: this.categoryFilter, maxIntensity: this.maxIntensity });
      if (!retry) return null;
      this.currentDare = retry;
    } else {
      this.currentDare = dare;
    }

    this.usedDares.add(this.currentDare.id);
    this.state = 'dareReveal';

    const spinner = this.players.get(this.currentPlayer);
    return {
      event: 'spinResult',
      spinner: this.currentPlayer,
      spinnerName: spinner ? spinner.name : 'Unknown',
      dare: this.currentDare,
      spinDuration: this.spinDuration
    };
  }

  /**
   * Player completes or chickens out.
   * completed = true → 100 pts; false → 0 pts
   */
  resolveDare(socketId, completed) {
    if (this.state !== 'dareReveal') return null;
    if (socketId !== this.currentPlayer) return null;

    const player = this.players.get(this.currentPlayer);
    if (!player) return null;

    const points = completed ? 100 : 0;
    player.score += points;

    // Record history
    this.history.push({
      dare: this.currentDare,
      playerName: player.name,
      playerId: this.currentPlayer,
      completed,
      points,
      timestamp: Date.now()
    });

    return {
      event: 'dareResolved',
      spinner: this.currentPlayer,
      spinnerName: player.name,
      dare: this.currentDare,
      completed,
      points,
      scores: this.getPlayerList(),
      historyEntry: this.history[this.history.length - 1]
    };
  }

  /**
   * Auto-skip (disconnect / timeout).
   */
  skipTurn() {
    const player = this.players.get(this.currentPlayer);
    const entry = {
      dare: this.currentDare || { text: '(skipped)', category: 'wildcard', intensity: 0 },
      playerName: player ? player.name : 'Unknown',
      playerId: this.currentPlayer,
      completed: false,
      points: 0,
      timestamp: Date.now()
    };
    this.history.push(entry);

    return {
      event: 'dareResolved',
      spinner: this.currentPlayer,
      spinnerName: player ? player.name : 'Unknown',
      dare: entry.dare,
      completed: false,
      points: 0,
      scores: this.getPlayerList(),
      historyEntry: entry
    };
  }

  // ─── Config ──────────────────────────────────────────

  setCategories(categories) {
    if (!categories || categories.length === 0) {
      this.categoryFilter = null;
      return;
    }
    this.categoryFilter = categories.filter(c => CATEGORIES.includes(c));
    if (this.categoryFilter.length === 0) this.categoryFilter = null;
  }

  setIntensity(level) {
    if ([1, 2, 3].includes(level)) this.maxIntensity = level;
  }

  getHistory() {
    return this.history;
  }

  // ─── Utilities ───────────────────────────────────────

  clearTimers() {
    if (this.spinTimer) { clearTimeout(this.spinTimer); this.spinTimer = null; }
    if (this.revealTimeout) { clearTimeout(this.revealTimeout); this.revealTimeout = null; }
  }
}

module.exports = DareRouletteGame;
