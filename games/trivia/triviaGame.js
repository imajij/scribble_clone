// ========================================
// TRIVIA SHOWDOWN — Game Logic Module
// ========================================
//
// State machine: waiting → question → reveal → (next round or gameOver)
//
// Each round:
//   1. Server picks the next question and sends q + 4 options (NO answer index).
//   2. Every live player locks ONE answer within QUESTION_DURATION seconds.
//   3. On all-locked OR timeout: reveal the correct option + award points.
//        correct → BASE_POINTS + speed bonus (up to SPEED_BONUS_MAX, by time left)
//        wrong / no answer → 0
//   4. Brief pause showing the mini-scoreboard → next round.
//   5. After maxRounds → game-over leaderboard.
//
// The server is authoritative: this class never includes `answer` in any
// payload sent before the reveal phase.

const { CONFIG, buildPool } = require('./questions');

class TriviaGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Player management (socketId → player object)
    this.players = new Map();
    this.state = 'waiting'; // waiting | question | reveal | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Lobby settings
    this.maxRounds = CONFIG.DEFAULT_ROUNDS;
    this.category = 'all';
    this.questionDuration = CONFIG.QUESTION_DURATION;

    // Round state
    this.roundNum = 0;
    this.pool = [];                 // pre-built ordered question pool for the match
    this.currentQuestion = null;    // the full question object (with answer) — server only
    this.answers = new Map();       // socketId → { index, time(ms) }
    this.questionStartTime = null;

    // Flow timers (all stored so clearTimers() can clear them)
    this.questionTimer = null;
    this.revealTimer = null;

    // Reconnect
    this.disconnectedPlayers = new Map(); // sessionId → held data
  }

  // ── Player management ──

  addPlayer(socketId, name, sessionId) {
    const player = {
      id: socketId,
      name: (name || 'Anon').substring(0, 20),
      sessionId,
      score: 0,
      streak: 0,        // consecutive correct answers
    };
    this.players.set(socketId, player);

    if (this.players.size === 1) {
      this.owner = socketId;
      this.ownerSessionId = sessionId;
    }
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.players.delete(socketId);
    this.answers.delete(socketId);
    if (this.owner === socketId && this.players.size > 0) {
      const next = this.players.keys().next().value;
      this.owner = next;
      this.ownerSessionId = this.players.get(next).sessionId;
    }
    return player;
  }

  isOwner(socketId) {
    return this.owner === socketId;
  }

  canStart() {
    return this.state === 'waiting' && this.players.size >= CONFIG.MIN_PLAYERS;
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((p) => {
      list.push({ id: p.id, name: p.name, score: p.score, streak: p.streak, isOwner: p.id === this.owner });
    });
    list.sort((a, b) => b.score - a.score);
    return list;
  }

  // ── Reconnect support ──

  holdPlayerForReconnect(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    const answer = this.answers.get(socketId) || null;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      score: player.score,
      streak: player.streak,
      answer, // preserve a lock made before disconnect
    });
    const wasOwner = this.owner === socketId;
    this.players.delete(socketId);
    this.answers.delete(socketId);

    // Transfer ownership to a live player if the host was held.
    if (wasOwner && this.players.size > 0) {
      const next = this.players.keys().next().value;
      this.owner = next;
      this.ownerSessionId = this.players.get(next).sessionId;
    }
    return player;
  }

  hasDisconnectedPlayer(sessionId) {
    return this.disconnectedPlayers.has(sessionId);
  }

  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;
    this.disconnectedPlayers.delete(sessionId);
    const player = {
      id: newSocketId,
      name: held.name,
      sessionId,
      score: held.score,
      streak: held.streak,
    };
    this.players.set(newSocketId, player);

    // Restore an in-flight answer lock so the seat keeps its choice.
    if (held.answer) this.answers.set(newSocketId, held.answer);

    if (this.ownerSessionId === sessionId) this.owner = newSocketId;
    return player;
  }

  // ── Game flow ──

  startGame() {
    this.state = 'question';
    this.roundNum = 0;
    this.pool = buildPool(this.category, this.maxRounds);
    this.players.forEach(p => { p.score = 0; p.streak = 0; });
  }

  /**
   * Advance to the next question. Returns the public payload (NO answer index)
   * or null when the match is over.
   */
  nextRound() {
    if (this.roundNum >= this.maxRounds) {
      this.state = 'gameOver';
      return null;
    }
    this.state = 'question';
    this.answers.clear();
    this.currentQuestion = this.pool[this.roundNum] || this.pool[this.roundNum % this.pool.length];
    this.roundNum++;
    this.questionStartTime = Date.now();
    return this.getQuestionPayload();
  }

  /** Public per-question payload — deliberately excludes `answer`. */
  getQuestionPayload() {
    const q = this.currentQuestion;
    return {
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      category: q.category,
      heat: q.heat || 1,
      question: q.q,
      options: q.options.slice(),
      duration: this.questionDuration,
      total: this.players.size,
    };
  }

  /** Lock a single answer for a player (cannot change once set). */
  lockAnswer(socketId, index) {
    if (this.state !== 'question') return false;
    if (!this.players.has(socketId)) return false;
    if (this.answers.has(socketId)) return false; // already locked
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return false;
    this.answers.set(socketId, { index: idx, time: Date.now() - this.questionStartTime });
    return true;
  }

  allAnswered() {
    return this.answers.size >= this.players.size;
  }

  getAnswerProgress() {
    return { answered: this.answers.size, total: this.players.size };
  }

  /**
   * Score the round and produce the reveal payload (this DOES include the
   * correct index — reveal phase only).
   */
  reveal() {
    this.state = 'reveal';
    const q = this.currentQuestion;
    const correctIndex = q.answer;
    const durationMs = this.questionDuration * 1000;
    const base = CONFIG.BASE_POINTS;
    const speedMax = CONFIG.SPEED_BONUS_MAX;

    const playerResults = [];
    const counts = [0, 0, 0, 0];

    this.players.forEach((player) => {
      const a = this.answers.get(player.id);
      let points = 0;
      let correct = false;
      let speedBonus = 0;

      if (a) {
        counts[a.index]++;
        if (a.index === correctIndex) {
          correct = true;
          const remaining = Math.max(0, durationMs - a.time);
          speedBonus = Math.round(speedMax * (remaining / durationMs));
          points = base + speedBonus;
          player.streak++;
        } else {
          player.streak = 0;
        }
      } else {
        player.streak = 0;
      }

      player.score += points;
      playerResults.push({
        id: player.id,
        name: player.name,
        choice: a ? a.index : null,
        correct,
        points,
        speedBonus,
        streak: player.streak,
        totalScore: player.score,
      });
    });

    playerResults.sort((a, b) => b.totalScore - a.totalScore);

    return {
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      question: q.q,
      options: q.options.slice(),
      correctIndex,
      counts,
      category: q.category,
      heat: q.heat || 1,
      playerResults,
      leaderboard: this.getPlayerList(),
    };
  }

  getFinalResults() {
    const results = [];
    this.players.forEach(p => {
      results.push({ id: p.id, name: p.name, score: p.score, streak: p.streak });
    });
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /** How many ms remain in the current question (for reconnect snapshot). */
  timeLeftMs() {
    if (this.state !== 'question' || !this.questionStartTime) return 0;
    const elapsed = Date.now() - this.questionStartTime;
    return Math.max(0, this.questionDuration * 1000 - elapsed);
  }

  reset() {
    this.clearTimers();
    this.state = 'waiting';
    this.roundNum = 0;
    this.pool = [];
    this.currentQuestion = null;
    this.answers.clear();
    this.questionStartTime = null;
    this.players.forEach(p => { p.score = 0; p.streak = 0; });
  }

  clearTimers() {
    if (this.questionTimer) { clearTimeout(this.questionTimer); this.questionTimer = null; }
    if (this.revealTimer) { clearTimeout(this.revealTimer); this.revealTimer = null; }
  }

  cleanup() {
    this.clearTimers();
  }
}

module.exports = TriviaGame;
