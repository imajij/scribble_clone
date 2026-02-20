// ========================================
// SCENARIO — Game Engine Module
// ========================================
//
// In-memory room state. No database.
// State machine: waiting → reading → answering → voting → results → (loop) → gameOver
//
// Each round:
//   1. A random scenario is shown to all players (reading phase).
//   2. Each player submits an anonymous answer (answering phase).
//   3. All answers are displayed anonymously for voting (voting phase).
//   4. Votes are tallied, points awarded, authors revealed (results phase).
//   5. Next round begins.

const { getRandomScenario, CATEGORIES } = require('./scenarios');

class ScenarioGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Players  socketId → { name, score, avatar, sessionId, connected }
    this.players = new Map();
    this.state = 'waiting'; // waiting | reading | answering | voting | results | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Round
    this.roundNum = 0;
    this.maxRounds = 3;

    // Current scenario
    this.currentScenario = null;   // { id, text, category, intensity }

    // Answers: socketId → { text, votes: 0 }
    this.answers = new Map();

    // Votes: socketId → votedForSocketId
    this.votes = new Map();

    // History of all rounds
    this.history = [];  // [{ scenario, answers: [{ playerName, text, votes, points }], roundNum }]

    // Category / intensity filters
    this.categoryFilter = null;   // string[] | null
    this.maxIntensity = 3;

    // Used scenario ids to avoid repeats
    this.usedScenarios = new Set();

    // Phase durations (ms)
    this.readingDuration  = 8000;
    this.answeringDuration = 45000;
    this.votingDuration   = 20000;
    this.resultsDuration  = 6000;

    // Timers
    this.phaseTimer = null;

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
    this.answers.delete(socketId);
    this.votes.delete(socketId);

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

    // Restore owner
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;

    // Migrate answers/votes if they existed under old socket
    // (answers are keyed by socketId, so we can't easily migrate mid-round)

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
        hasAnswered: this.answers.has(id),
        hasVoted: this.votes.has(id),
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
        hasAnswered: false,
        hasVoted: false,
        disconnected: true
      });
    });
    return list.sort((a, b) => b.score - a.score);
  }

  // ─── Game flow ───────────────────────────────────────

  startGame() {
    this.roundNum = 0;
    this.history = [];
    this.usedScenarios = new Set();
    this.players.forEach(p => { p.score = 0; });
    return this.nextRound();
  }

  nextRound() {
    this.roundNum++;

    if (this.roundNum > this.maxRounds) {
      this.state = 'gameOver';
      return { event: 'gameOver', scores: this.getPlayerList(), history: this.history };
    }

    // Pick a scenario
    const scenario = getRandomScenario({
      categories: this.categoryFilter,
      maxIntensity: this.maxIntensity,
      exclude: this.usedScenarios
    });

    if (!scenario) {
      // Ran out — reset exclusions
      this.usedScenarios.clear();
      this.currentScenario = getRandomScenario({
        categories: this.categoryFilter,
        maxIntensity: this.maxIntensity
      });
    } else {
      this.currentScenario = scenario;
    }

    if (this.currentScenario) this.usedScenarios.add(this.currentScenario.id);

    // Reset per-round state
    this.answers = new Map();
    this.votes = new Map();
    this.state = 'reading';

    return {
      event: 'newRound',
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      scenario: this.currentScenario
    };
  }

  startAnswering() {
    this.state = 'answering';
    return { event: 'answerPhase', scenario: this.currentScenario };
  }

  submitAnswer(socketId, text) {
    if (this.state !== 'answering') return null;
    if (!this.players.has(socketId)) return null;
    if (this.answers.has(socketId)) return null; // already answered

    const trimmed = String(text).trim().slice(0, 500);
    if (!trimmed) return null;

    this.answers.set(socketId, { text: trimmed, votes: 0 });

    return {
      event: 'answerSubmitted',
      playerId: socketId,
      totalAnswered: this.answers.size,
      totalPlayers: this.players.size
    };
  }

  allAnswered() {
    return this.answers.size >= this.players.size;
  }

  startVoting() {
    if (this.answers.size === 0) {
      // No one answered — skip to next round
      return null;
    }
    this.state = 'voting';

    // Prepare anonymous answer list (shuffled)
    const answerList = [];
    this.answers.forEach((a, id) => {
      answerList.push({ id, text: a.text });
    });
    // Shuffle
    for (let i = answerList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answerList[i], answerList[j]] = [answerList[j], answerList[i]];
    }

    return {
      event: 'votePhase',
      answers: answerList // each: { id, text } — id is the socketId (opaque to client)
    };
  }

  submitVote(socketId, votedForId) {
    if (this.state !== 'voting') return null;
    if (!this.players.has(socketId)) return null;
    if (this.votes.has(socketId)) return null; // already voted
    if (votedForId === socketId) return null;   // can't vote for self
    if (!this.answers.has(votedForId)) return null;

    this.votes.set(socketId, votedForId);

    return {
      event: 'voteSubmitted',
      playerId: socketId,
      totalVoted: this.votes.size,
      totalEligible: this.getVoteEligibleCount()
    };
  }

  getVoteEligibleCount() {
    // Players who can vote = all players (they can vote for any answer except their own)
    return this.players.size;
  }

  allVoted() {
    return this.votes.size >= this.players.size;
  }

  tallyVotes() {
    this.state = 'results';

    // Count votes per answer
    this.votes.forEach((votedFor) => {
      const answer = this.answers.get(votedFor);
      if (answer) answer.votes++;
    });

    // Find max votes for bonus
    let maxVotes = 0;
    this.answers.forEach(a => { if (a.votes > maxVotes) maxVotes = a.votes; });

    // Build results
    const results = [];
    this.answers.forEach((a, socketId) => {
      const player = this.players.get(socketId);
      if (!player) return;

      const votePoints = a.votes * 100;
      const bonus = (a.votes > 0 && a.votes === maxVotes) ? 50 : 0;
      const total = votePoints + bonus;
      player.score += total;

      results.push({
        playerId: socketId,
        playerName: player.name,
        avatar: player.avatar,
        text: a.text,
        votes: a.votes,
        points: total,
        isBest: a.votes > 0 && a.votes === maxVotes
      });
    });

    results.sort((a, b) => b.votes - a.votes);

    // Record history
    this.history.push({
      roundNum: this.roundNum,
      scenario: this.currentScenario,
      results
    });

    return {
      event: 'roundResults',
      scenario: this.currentScenario,
      results,
      scores: this.getPlayerList(),
      roundNum: this.roundNum,
      maxRounds: this.maxRounds
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

  getCurrentState() {
    return {
      state: this.state,
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      scenario: this.currentScenario,
      answeredCount: this.answers.size,
      votedCount: this.votes.size,
      totalPlayers: this.players.size
    };
  }

  // ─── Utilities ───────────────────────────────────────

  clearTimers() {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  }
}

module.exports = ScenarioGame;
