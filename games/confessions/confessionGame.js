// ========================================
// CONFESSIONS — Game Logic Module
// ========================================
//
// State machine: waiting → submitting → guessing → reveal → (loop or gameOver)
//
// Flow:
//   1. Each player receives a prompt and writes an anonymous confession.
//   2. Confessions are shuffled and presented one at a time.
//   3. All players (except the author) guess who wrote it.
//   4. Reveal: show author + who guessed correctly + points.
//   5. Repeat for each confession, then game over.
//
// Scoring:
//   - Correct guess: +100 for the guesser
//   - Each player fooled: +25 for the writer
//   - Streak bonus (3+ correct in a row): +50

const { getRandomPrompts } = require('./prompts');

class ConfessionGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Player management (socketId → player)
    this.players = new Map();
    this.state = 'waiting'; // waiting | submitting | guessing | reveal | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Settings
    this.heatLevel = 2;

    // Round state
    this.prompts = [];           // assigned prompts (one per player)
    this.confessions = [];       // shuffled array of { authorId, authorName, prompt, text }
    this.currentIndex = -1;      // index into confessions[]
    this.submissions = new Map(); // socketId → { prompt, text }
    this.guesses = new Map();     // socketId → guessedAuthorId (for current confession)

    // Track used prompts
    this.usedPrompts = new Set();

    // Timers
    this.submitDuration = 60;    // seconds to write confession
    this.guessDuration = 20;     // seconds to guess
    this.submitTimer = null;
    this.guessTimer = null;
    this.revealTimer = null;

    // Reconnect
    this.disconnectedPlayers = new Map();
  }

  // ── Player management ──

  addPlayer(socketId, name, sessionId) {
    const player = {
      id: socketId,
      name: name.substring(0, 20),
      sessionId,
      score: 0,
      streak: 0,
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
  canStart() { return this.state === 'waiting' && this.players.size >= 3; }

  getPlayerList() {
    const list = [];
    this.players.forEach(p => {
      list.push({ id: p.id, name: p.name, score: p.score, streak: p.streak, isOwner: p.id === this.owner });
    });
    list.sort((a, b) => b.score - a.score);
    return list;
  }

  // ── Reconnect ──

  holdPlayerForReconnect(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name, score: player.score, streak: player.streak,
      submission: this.submissions.get(socketId) || null,
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
      id: newSocketId, name: held.name, sessionId,
      score: held.score, streak: held.streak,
    };
    this.players.set(newSocketId, player);
    if (held.submission) this.submissions.set(newSocketId, held.submission);
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;
    return player;
  }

  // ── Game flow ──

  startGame() {
    this.state = 'submitting';
    this.confessions = [];
    this.currentIndex = -1;
    this.submissions.clear();
    this.players.forEach(p => { p.score = 0; p.streak = 0; });

    // Assign one prompt per player
    const count = this.players.size;
    this.prompts = getRandomPrompts(this.heatLevel, count, this.usedPrompts);
    this.prompts.forEach(p => this.usedPrompts.add(p.text));

    // If we don't have enough unique prompts, reuse
    while (this.prompts.length < count) {
      this.prompts.push(this.prompts[this.prompts.length % Math.max(1, this.prompts.length)]);
    }

    // Map prompts to players
    const playerIds = [...this.players.keys()];
    const assignments = {};
    playerIds.forEach((id, i) => {
      assignments[id] = this.prompts[i];
    });
    return assignments; // socketId → prompt
  }

  submitConfession(socketId, text) {
    if (this.state !== 'submitting') return false;
    if (!this.players.has(socketId)) return false;
    if (this.submissions.has(socketId)) return false;
    const cleanText = (text || '').trim().substring(0, 500);
    if (!cleanText) return false;

    const player = this.players.get(socketId);
    const playerIds = [...this.players.keys()];
    const idx = playerIds.indexOf(socketId);
    const prompt = this.prompts[idx] || { text: 'Confess something…' };

    this.submissions.set(socketId, { prompt: prompt.text, text: cleanText });
    return true;
  }

  allSubmitted() {
    return this.submissions.size >= this.players.size;
  }

  getSubmitProgress() {
    return { submitted: this.submissions.size, total: this.players.size };
  }

  // Transition from submitting to guessing phase
  buildConfessions() {
    this.confessions = [];
    this.submissions.forEach((sub, socketId) => {
      const player = this.players.get(socketId);
      if (player) {
        this.confessions.push({
          authorId: socketId,
          authorName: player.name,
          prompt: sub.prompt,
          text: sub.text,
        });
      }
    });
    // Shuffle
    for (let i = this.confessions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.confessions[i], this.confessions[j]] = [this.confessions[j], this.confessions[i]];
    }
    this.currentIndex = -1;
  }

  nextConfession() {
    this.currentIndex++;
    if (this.currentIndex >= this.confessions.length) {
      this.state = 'gameOver';
      return null;
    }
    this.state = 'guessing';
    this.guesses.clear();
    const c = this.confessions[this.currentIndex];
    return {
      index: this.currentIndex,
      total: this.confessions.length,
      prompt: c.prompt,
      text: c.text,
      // Don't send authorId to clients!
    };
  }

  submitGuess(socketId, guessedAuthorId) {
    if (this.state !== 'guessing') return false;
    if (!this.players.has(socketId)) return false;
    if (this.guesses.has(socketId)) return false;
    const c = this.confessions[this.currentIndex];
    if (!c) return false;
    // Author can't guess their own
    if (socketId === c.authorId) return false;
    this.guesses.set(socketId, guessedAuthorId);
    return true;
  }

  allGuessed() {
    const c = this.confessions[this.currentIndex];
    if (!c) return false;
    // Everyone except the author should guess
    const eligibleCount = this.players.size - (this.players.has(c.authorId) ? 1 : 0);
    return this.guesses.size >= eligibleCount;
  }

  getGuessProgress() {
    const c = this.confessions[this.currentIndex];
    const eligible = this.players.size - (c && this.players.has(c.authorId) ? 1 : 0);
    return { guessed: this.guesses.size, total: eligible };
  }

  calculateReveal() {
    this.state = 'reveal';
    const c = this.confessions[this.currentIndex];
    if (!c) return null;

    const results = [];
    let fooledCount = 0;

    this.players.forEach((player) => {
      if (player.id === c.authorId) return; // skip author for guessing results

      const guess = this.guesses.get(player.id);
      const correct = guess === c.authorId;

      if (correct) {
        player.score += 100;
        player.streak++;
        if (player.streak >= 3) player.score += 50; // streak bonus
      } else {
        player.streak = 0;
        fooledCount++;
      }

      results.push({
        id: player.id,
        name: player.name,
        guess,
        guessName: guess ? (this.players.get(guess) || {}).name || '?' : 'No guess',
        correct,
        score: player.score,
        streak: player.streak,
      });
    });

    // Writer gets points for fooling people
    const author = this.players.get(c.authorId);
    if (author) {
      const foolPoints = fooledCount * 25;
      author.score += foolPoints;
    }

    return {
      authorId: c.authorId,
      authorName: c.authorName,
      prompt: c.prompt,
      text: c.text,
      fooledCount,
      foolPoints: fooledCount * 25,
      results,
      index: this.currentIndex,
      total: this.confessions.length,
    };
  }

  getFinalResults() {
    const results = [];
    this.players.forEach(p => {
      results.push({ id: p.id, name: p.name, score: p.score });
    });
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  reset() {
    this.state = 'waiting';
    this.confessions = [];
    this.currentIndex = -1;
    this.submissions.clear();
    this.guesses.clear();
  }

  cleanup() {
    if (this.submitTimer) { clearTimeout(this.submitTimer); this.submitTimer = null; }
    if (this.guessTimer) { clearTimeout(this.guessTimer); this.guessTimer = null; }
    if (this.revealTimer) { clearTimeout(this.revealTimer); this.revealTimer = null; }
  }
}

module.exports = ConfessionGame;
