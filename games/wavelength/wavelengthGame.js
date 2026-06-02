// ========================================
// WAVELENGTH — Game Engine Module
// ========================================
//
// In-memory room state. No database.
// State machine:
//   waiting → clue → guess → reveal → (loop) → gameOver
//
// Each round:
//   1. One player is the CLUE-GIVER (rotates each round).
//   2. Server picks a hidden target 0-100, revealed ONLY to the clue-giver.
//   3. Clue-giver types a short clue (CLUE phase).
//   4. Every OTHER player drags a 0-100 slider to guess the target (GUESS phase).
//   5. REVEAL: show target + guesses. Each guesser scores max(0, 100 - |guess-target|).
//      The clue-giver scores the AVERAGE of the guessers' points (rewards a good clue).
//   6. Next round — rotate clue-giver.

const { getRandomSpectrum } = require('./spectrums');

// ── Shared thresholds / durations (single source of truth) ──
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const CLUE_DURATION = 30000;   // ms
const GUESS_DURATION = 30000;  // ms
const REVEAL_DURATION = 8000;  // ms
const MAX_CLUE_LEN = 80;

class WavelengthGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Players  socketId → { name, score, avatar, sessionId, connected, joinOrder }
    this.players = new Map();
    this.state = 'waiting'; // waiting | clue | guess | reveal | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Stable join ordering so clue-giver rotation is deterministic across
    // disconnects/reconnects (keyed by sessionId when available).
    this.joinCounter = 0;
    this.rotation = [];       // ordered list of sessionId|socketId tokens
    this.clueGiverIdx = -1;   // index into rotation

    // Round
    this.roundNum = 0;
    this.maxRounds = 0;       // 0 = one full rotation (set on start)
    this.requestedRounds = null; // user-chosen rounds, or null for auto

    // Current round data
    this.spectrum = null;     // { index, left, right }
    this.target = null;       // 0-100, secret (only sent to clue-giver)
    this.clueText = '';
    this.clueGiverId = null;  // current socketId of clue-giver
    this.clueGiverToken = null;

    // Guesses: socketId → 0-100
    this.guesses = new Map();

    // History  [{ roundNum, spectrum, target, clue, clueGiverName, guesses:[{name,guess,points}] }]
    this.history = [];

    // Used spectrum indices to avoid repeats
    this.usedSpectrums = new Set();

    // Durations (ms)
    this.clueDuration   = CLUE_DURATION;
    this.guessDuration  = GUESS_DURATION;
    this.revealDuration = REVEAL_DURATION;

    // Timers (every flow-driving timeout is stored here)
    this.phaseTimer = null;

    // Reconnect — held seats keyed by sessionId
    this.disconnectedPlayers = new Map();
  }

  // ─── Player management ───────────────────────────────

  addPlayer(socketId, name, sessionId) {
    const colors = [
      '#22d3ee', '#818cf8', '#f472b6', '#34d399', '#fbbf24',
      '#a78bfa', '#fb7185', '#38bdf8', '#4ade80', '#f59e0b',
      '#c084fc', '#2dd4bf'
    ];
    const color = colors[this.players.size % colors.length];

    if (!this.owner || !this.players.has(this.owner)) {
      this.owner = socketId;
      this.ownerSessionId = sessionId || null;
    }

    const token = sessionId || socketId;
    this.players.set(socketId, {
      name: String(name || 'Player').slice(0, 20),
      score: 0,
      avatar: color,
      sessionId: sessionId || null,
      token,
      connected: true,
      joinOrder: this.joinCounter++
    });

    if (!this.rotation.includes(token)) this.rotation.push(token);

    return this.players.get(socketId);
  }

  removePlayer(socketId) {
    const p = this.players.get(socketId);
    this.players.delete(socketId);
    this.guesses.delete(socketId);

    if (this.owner === socketId) {
      const remaining = [...this.players.keys()];
      this.owner = remaining.length > 0 ? remaining[0] : null;
      this.ownerSessionId = this.owner ? this.players.get(this.owner).sessionId : null;
    }
    return p;
  }

  holdPlayerSeat(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.sessionId) return;
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      score: player.score,
      avatar: player.avatar,
      sessionId: player.sessionId,
      token: player.token,
      joinOrder: player.joinOrder,
      // Preserve a guess submitted this round, if any
      guess: this.guesses.get(socketId)
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
      token: held.token,
      connected: true,
      joinOrder: held.joinOrder
    });

    // Restore owner if this was the owner's seat
    if (this.ownerSessionId === sessionId) this.owner = newSocketId;

    // Restore the clue-giver socket binding if this seat was the clue-giver
    if (this.clueGiverToken && this.clueGiverToken === held.token) {
      this.clueGiverId = newSocketId;
    }

    // Restore an in-progress guess under the new socket id
    if (held.guess !== undefined && held.guess !== null) {
      this.guesses.set(newSocketId, held.guess);
    }

    return held;
  }

  hasDisconnectedPlayer(sessionId) {
    return this.disconnectedPlayers.has(sessionId);
  }

  isOwner(socketId) {
    return this.owner === socketId;
  }

  isClueGiver(socketId) {
    return this.clueGiverId === socketId;
  }

  canStart() {
    return this.players.size >= MIN_PLAYERS && this.state === 'waiting';
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
        isClueGiver: id === this.clueGiverId,
        hasGuessed: this.guesses.has(id),
        disconnected: false
      });
    });
    this.disconnectedPlayers.forEach((held) => {
      list.push({
        id: held.sessionId,
        name: held.name,
        score: held.score,
        avatar: held.avatar,
        isOwner: false,
        isClueGiver: held.token === this.clueGiverToken,
        hasGuessed: false,
        disconnected: true
      });
    });
    return list.sort((a, b) => b.score - a.score);
  }

  // Players who must guess this round (everyone except the clue-giver, live only)
  getGuesserCount() {
    let n = 0;
    this.players.forEach((p, id) => { if (id !== this.clueGiverId) n++; });
    return n;
  }

  allGuessed() {
    return this.guesses.size >= this.getGuesserCount() && this.getGuesserCount() > 0;
  }

  // ─── Game flow ───────────────────────────────────────

  startGame() {
    this.roundNum = 0;
    this.history = [];
    this.usedSpectrums = new Set();
    this.players.forEach(p => { p.score = 0; });

    // Rebuild rotation from current live players, ordered by join order.
    this.rotation = [...this.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map(p => p.token);
    this.clueGiverIdx = -1;

    // Default maxRounds = one full rotation; honour a requested count if set.
    if (this.requestedRounds && this.requestedRounds > 0) {
      this.maxRounds = this.requestedRounds;
    } else {
      this.maxRounds = this.rotation.length;
    }

    return this.nextRound();
  }

  // Resolve the current clue-giver token → a live socketId (skip held seats).
  _resolveClueGiver() {
    const total = this.rotation.length;
    for (let step = 0; step < total; step++) {
      this.clueGiverIdx = (this.clueGiverIdx + 1) % total;
      const token = this.rotation[this.clueGiverIdx];
      // Find a live player with this token
      let found = null;
      this.players.forEach((p, id) => { if (p.token === token) found = id; });
      if (found) {
        this.clueGiverToken = token;
        this.clueGiverId = found;
        return true;
      }
    }
    return false;
  }

  nextRound() {
    this.roundNum++;

    if (this.roundNum > this.maxRounds) {
      this.state = 'gameOver';
      return { event: 'gameOver', scores: this.getPlayerList(), history: this.history };
    }

    // Rotate to the next live clue-giver
    if (!this._resolveClueGiver()) {
      // No live players to be clue-giver
      this.state = 'waiting';
      return null;
    }

    // Pick a spectrum (avoid repeats; reset pool if exhausted)
    let spec = getRandomSpectrum(this.usedSpectrums);
    if (!spec) { this.usedSpectrums.clear(); spec = getRandomSpectrum(this.usedSpectrums); }
    this.spectrum = spec;
    if (spec) this.usedSpectrums.add(spec.index);

    // Secret target 0-100 (kept away from the rails so a clue is always possible)
    this.target = 5 + Math.floor(Math.random() * 91); // 5..95

    // Reset per-round state
    this.clueText = '';
    this.guesses = new Map();
    this.state = 'clue';

    return {
      event: 'newRound',
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      spectrum: { left: this.spectrum.left, right: this.spectrum.right },
      clueGiverId: this.clueGiverId,
      clueGiverName: this.players.get(this.clueGiverId)?.name || '',
      target: this.target // caller decides who receives this (clue-giver only)
    };
  }

  submitClue(socketId, text) {
    if (this.state !== 'clue') return null;
    if (socketId !== this.clueGiverId) return null;
    const trimmed = String(text || '').trim().slice(0, MAX_CLUE_LEN);
    if (!trimmed) return null;
    this.clueText = trimmed;
    return { clue: this.clueText };
  }

  startGuessing() {
    if (this.state !== 'clue') return null;
    // If the clue-giver never typed a clue, use a placeholder so the round
    // can still proceed.
    if (!this.clueText) this.clueText = '(no clue given)';
    this.state = 'guess';
    return {
      event: 'guessPhase',
      clue: this.clueText,
      spectrum: { left: this.spectrum.left, right: this.spectrum.right },
      clueGiverId: this.clueGiverId,
      clueGiverName: this.players.get(this.clueGiverId)?.name || ''
    };
  }

  submitGuess(socketId, value) {
    if (this.state !== 'guess') return null;
    if (!this.players.has(socketId)) return null;
    if (socketId === this.clueGiverId) return null; // clue-giver doesn't guess
    let v = Number(value);
    if (isNaN(v)) return null;
    v = Math.max(0, Math.min(100, Math.round(v)));
    this.guesses.set(socketId, v);
    return {
      event: 'guessSubmitted',
      totalGuessed: this.guesses.size,
      totalGuessers: this.getGuesserCount()
    };
  }

  scoreRound() {
    this.state = 'reveal';

    const guesserResults = [];
    let sum = 0;
    let count = 0;

    this.players.forEach((p, id) => {
      if (id === this.clueGiverId) return;
      const guess = this.guesses.get(id);
      if (guess === undefined) {
        // Did not guess — 0 points, marked
        guesserResults.push({
          id, name: p.name, avatar: p.avatar,
          guess: null, points: 0, noGuess: true
        });
        count++;
        return;
      }
      const points = Math.max(0, 100 - Math.abs(guess - this.target));
      p.score += points;
      sum += points;
      count++;
      guesserResults.push({
        id, name: p.name, avatar: p.avatar,
        guess, points, noGuess: false
      });
    });

    // Clue-giver scores the average of the guessers' points
    const avg = count > 0 ? Math.round(sum / count) : 0;
    const clueGiver = this.players.get(this.clueGiverId);
    if (clueGiver) clueGiver.score += avg;

    guesserResults.sort((a, b) => b.points - a.points);

    const result = {
      event: 'reveal',
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      spectrum: { left: this.spectrum.left, right: this.spectrum.right },
      target: this.target,
      clue: this.clueText,
      clueGiverId: this.clueGiverId,
      clueGiverName: clueGiver ? clueGiver.name : '',
      clueGiverPoints: avg,
      guesses: guesserResults,
      scores: this.getPlayerList()
    };

    this.history.push({
      roundNum: this.roundNum,
      spectrum: { left: this.spectrum.left, right: this.spectrum.right },
      target: this.target,
      clue: this.clueText,
      clueGiverName: clueGiver ? clueGiver.name : '',
      clueGiverPoints: avg,
      guesses: guesserResults
    });

    return result;
  }

  // ─── Config ──────────────────────────────────────────

  setRounds(rounds) {
    if (rounds === null || rounds === undefined) { this.requestedRounds = null; return; }
    const n = parseInt(rounds, 10);
    if (!isNaN(n) && n >= 1 && n <= 20) this.requestedRounds = n;
  }

  getHistory() { return this.history; }

  // Full per-phase snapshot so a (re)joining client can act immediately.
  // `forSocketId` decides whether the secret target is included.
  getCurrentState(forSocketId) {
    if (this.state === 'waiting' || this.state === 'gameOver') return null;

    const isClueGiver = forSocketId === this.clueGiverId;
    const snapshot = {
      state: this.state,
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      spectrum: this.spectrum ? { left: this.spectrum.left, right: this.spectrum.right } : null,
      clueGiverId: this.clueGiverId,
      clueGiverName: this.players.get(this.clueGiverId)?.name || '',
      isClueGiver,
      totalGuessed: this.guesses.size,
      totalGuessers: this.getGuesserCount()
    };

    // The secret target is ONLY for the clue-giver.
    if (isClueGiver && (this.state === 'clue' || this.state === 'guess')) {
      snapshot.target = this.target;
    }

    // The clue text is public once we've moved past the clue phase, and is
    // visible to the clue-giver even during the clue phase (their own text).
    if (this.state === 'guess' || this.state === 'reveal') {
      snapshot.clue = this.clueText;
    } else if (this.state === 'clue' && isClueGiver) {
      snapshot.clue = this.clueText;
    }

    if (this.state === 'reveal') {
      const last = this.history[this.history.length - 1];
      if (last) {
        snapshot.target = last.target;
        snapshot.guesses = last.guesses;
        snapshot.clueGiverPoints = last.clueGiverPoints;
      }
    } else if (this.state === 'guess') {
      // Tell a reconnecting guesser whether they've already submitted.
      snapshot.myGuess = this.guesses.has(forSocketId) ? this.guesses.get(forSocketId) : null;
    }

    return snapshot;
  }

  // ─── Utilities ───────────────────────────────────────

  clearTimers() {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  }
}

module.exports = WavelengthGame;
module.exports.MIN_PLAYERS = MIN_PLAYERS;
module.exports.MAX_PLAYERS = MAX_PLAYERS;
module.exports.CLUE_DURATION = CLUE_DURATION;
module.exports.GUESS_DURATION = GUESS_DURATION;
module.exports.REVEAL_DURATION = REVEAL_DURATION;
module.exports.MAX_CLUE_LEN = MAX_CLUE_LEN;
