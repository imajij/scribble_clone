// ========================================
// TWO TRUTHS & A LIE — Game Logic Module
// ========================================
//
// State machine: waiting → submitting → guessing → reveal → (loop or gameOver)
//
// Flow:
//   1. SUBMIT: each player writes THREE short statements and marks which ONE
//      is the lie.
//   2. GUESS: cycle through each submitting player's trio one at a time. The
//      three statements are shown (shuffled) to EVERYONE EXCEPT the author;
//      each other player taps which statement they think is the lie.
//   3. REVEAL: highlight the real lie, show who guessed right.
//   4. Repeat per trio, then game over leaderboard.
//
// Scoring:
//   - Correct guess (found the lie): +100 for the guesser
//   - Author: +50 per person fooled
//
// Shared config lives in ./config.js (single source of truth, also used by
// the client) so client+server agree on limits/durations.

const CONFIG = require('./config');

class TwoTruthsGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Player management (socketId → player)
    this.players = new Map();
    this.state = 'waiting'; // waiting | submitting | guessing | reveal | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Round state
    // submissions: socketId → { statements: [s0,s1,s2], lieIndex }
    this.submissions = new Map();
    // trios: ordered array of { authorId, authorName, cards:[{text,isLie}], lieCardIndex }
    this.trios = [];
    this.currentIndex = -1;       // index into trios[]
    this.guesses = new Map();     // socketId → guessedCardIndex (for current trio)

    // Durations (seconds) — single source of truth
    this.submitDuration = CONFIG.SUBMIT_DURATION;
    this.guessDuration = CONFIG.GUESS_DURATION;

    // Flow-driving timers (all stored so clearTimers() can clear them)
    this.submitTimer = null;
    this.guessTimer = null;
    this.revealTimer = null;

    // Reconnect: sessionId → held seat snapshot
    this.disconnectedPlayers = new Map();
  }

  // ── Player management ──

  addPlayer(socketId, name, sessionId) {
    const player = {
      id: socketId,
      name: (name || 'Anon').substring(0, 20),
      sessionId,
      score: 0,
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
    this.submissions.delete(socketId);
    this.guesses.delete(socketId);
    if (this.owner === socketId && this.players.size > 0) {
      const next = this.players.keys().next().value;
      this.owner = next;
      this.ownerSessionId = this.players.get(next).sessionId;
    }
    return player;
  }

  isOwner(socketId) { return this.owner === socketId; }
  canStart() { return this.state === 'waiting' && this.players.size >= CONFIG.MIN_PLAYERS; }

  getPlayerList() {
    const list = [];
    this.players.forEach(p => {
      list.push({ id: p.id, name: p.name, score: p.score, isOwner: p.id === this.owner });
    });
    list.sort((a, b) => b.score - a.score);
    return list;
  }

  // ── Reconnect ──

  holdPlayerForReconnect(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      score: player.score,
      submission: this.submissions.get(socketId) || null,
      // remember whether they've guessed the CURRENT trio
      guess: this.guesses.has(socketId) ? this.guesses.get(socketId) : null,
    });
    this.players.delete(socketId);
    return player;
  }

  hasDisconnectedPlayer(sessionId) { return this.disconnectedPlayers.has(sessionId); }

  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;
    this.disconnectedPlayers.delete(sessionId);
    const player = {
      id: newSocketId,
      name: held.name,
      sessionId,
      score: held.score,
    };
    this.players.set(newSocketId, player);
    if (held.submission) this.submissions.set(newSocketId, held.submission);
    if (held.guess !== null && held.guess !== undefined) this.guesses.set(newSocketId, held.guess);
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;
    return player;
  }

  // ── Submit phase ──

  startGame() {
    this.state = 'submitting';
    this.trios = [];
    this.currentIndex = -1;
    this.submissions.clear();
    this.guesses.clear();
    this.players.forEach(p => { p.score = 0; });
  }

  /**
   * Validate + store a submission.
   * @returns true on success, false if invalid / not allowed.
   * Requires: exactly 3 non-empty statements (capped length), lieIndex 0..2.
   */
  submitStatements(socketId, statements, lieIndex) {
    if (this.state !== 'submitting') return false;
    if (!this.players.has(socketId)) return false;
    if (this.submissions.has(socketId)) return false;
    if (!Array.isArray(statements) || statements.length !== 3) return false;

    const cleaned = statements.map(s =>
      (typeof s === 'string' ? s : '').trim().substring(0, CONFIG.MAX_STATEMENT_LEN)
    );
    if (cleaned.some(s => s.length === 0)) return false;

    const idx = Number(lieIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 2) return false;

    this.submissions.set(socketId, { statements: cleaned, lieIndex: idx });
    return true;
  }

  allSubmitted() {
    return this.submissions.size >= this.players.size;
  }

  getSubmitProgress() {
    return { submitted: this.submissions.size, total: this.players.size };
  }

  /**
   * Build the shuffled trios array from submissions. Each trio stores the
   * statements as cards (shuffled order) with an isLie flag, and remembers
   * which shuffled card index is the lie. Called once when submit phase ends.
   */
  buildTrios() {
    this.trios = [];
    this.submissions.forEach((sub, socketId) => {
      const player = this.players.get(socketId);
      if (!player) return;
      const cards = sub.statements.map((text, i) => ({ text, isLie: i === sub.lieIndex }));
      // Shuffle the cards so the lie isn't always in the same slot
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      const lieCardIndex = cards.findIndex(c => c.isLie);
      this.trios.push({
        authorId: socketId,
        authorName: player.name,
        cards,
        lieCardIndex,
      });
    });
    // Shuffle order of trios
    for (let i = this.trios.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.trios[i], this.trios[j]] = [this.trios[j], this.trios[i]];
    }
    this.currentIndex = -1;
  }

  // ── Guess phase ──

  /**
   * Advance to the next trio. Returns the public guess-phase payload
   * (NO lie info, NO authorId) or null when there are no more trios.
   */
  nextTrio() {
    this.currentIndex++;
    if (this.currentIndex >= this.trios.length) {
      this.state = 'gameOver';
      return null;
    }
    this.state = 'guessing';
    this.guesses.clear();
    return this.getCurrentTrioPublic();
  }

  /**
   * Public (no-spoiler) snapshot of the current trio, for the guess phase.
   * Used both when advancing and on reconnect re-send.
   */
  getCurrentTrioPublic() {
    const t = this.trios[this.currentIndex];
    if (!t) return null;
    return {
      index: this.currentIndex,
      total: this.trios.length,
      authorId: t.authorId,      // clients use this to disable the author's UI
      authorName: t.authorName,
      cards: t.cards.map(c => ({ text: c.text })), // NO isLie
    };
  }

  submitGuess(socketId, cardIndex) {
    if (this.state !== 'guessing') return false;
    if (!this.players.has(socketId)) return false;
    if (this.guesses.has(socketId)) return false;
    const t = this.trios[this.currentIndex];
    if (!t) return false;
    if (socketId === t.authorId) return false; // author can't guess their own
    const idx = Number(cardIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= t.cards.length) return false;
    this.guesses.set(socketId, idx);
    return true;
  }

  /** How many players (other than the author) are eligible to guess. */
  eligibleGuesserCount() {
    const t = this.trios[this.currentIndex];
    if (!t) return 0;
    return this.players.size - (this.players.has(t.authorId) ? 1 : 0);
  }

  allGuessed() {
    return this.guesses.size >= this.eligibleGuesserCount();
  }

  getGuessProgress() {
    return { guessed: this.guesses.size, total: this.eligibleGuesserCount() };
  }

  // ── Reveal phase ──

  calculateReveal() {
    this.state = 'reveal';
    const t = this.trios[this.currentIndex];
    if (!t) return null;

    const results = [];
    let fooledCount = 0;

    this.players.forEach((player) => {
      if (player.id === t.authorId) return; // skip author
      const guess = this.guesses.get(player.id);
      const hasGuess = guess !== undefined;
      const correct = hasGuess && guess === t.lieCardIndex;
      if (correct) {
        player.score += CONFIG.CORRECT_POINTS;
      } else {
        fooledCount++; // wrong guess OR no guess = fooled
      }
      results.push({
        id: player.id,
        name: player.name,
        guess: hasGuess ? guess : null,
        correct,
        score: player.score,
      });
    });

    // Author earns points for everyone fooled
    const author = this.players.get(t.authorId);
    const foolPoints = fooledCount * CONFIG.FOOL_POINTS;
    if (author) author.score += foolPoints;

    return {
      authorId: t.authorId,
      authorName: t.authorName,
      cards: t.cards.map(c => ({ text: c.text, isLie: c.isLie })),
      lieCardIndex: t.lieCardIndex,
      fooledCount,
      foolPoints,
      authorScore: author ? author.score : 0,
      results,
      index: this.currentIndex,
      total: this.trios.length,
    };
  }

  isLastTrio() {
    return this.currentIndex >= this.trios.length - 1;
  }

  getFinalResults() {
    const results = [];
    this.players.forEach(p => results.push({ id: p.id, name: p.name, score: p.score }));
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // ── Lifecycle ──

  reset() {
    this.state = 'waiting';
    this.trios = [];
    this.currentIndex = -1;
    this.submissions.clear();
    this.guesses.clear();
  }

  clearTimers() {
    if (this.submitTimer) { clearTimeout(this.submitTimer); this.submitTimer = null; }
    if (this.guessTimer) { clearTimeout(this.guessTimer); this.guessTimer = null; }
    if (this.revealTimer) { clearTimeout(this.revealTimer); this.revealTimer = null; }
  }

  // Alias kept for parity with reference (socket cleanup calls clearTimers)
  cleanup() { this.clearTimers(); }
}

module.exports = TwoTruthsGame;
