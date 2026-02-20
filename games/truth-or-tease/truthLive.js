// ========================================
// TRUTH OR TEASE LIVE — Game Logic Module
// ========================================
//
// Mirrors the Scribble Game class structure:
//   - Room-based player management
//   - Owner / reconnection / turn rotation
//   - State machine: waiting → answering → voting → roundEnd → gameOver
//
// Each round:
//   1. A random question is presented to the current "hot-seat" player.
//   2. They type an answer within 30 s.
//   3. All other players react with emoji votes (🔥😂😱🥶👑) within 15 s.
//   4. Scores awarded for participation, bonus from reactions.

const { getRandomQuestion } = require('./questions');

// Emoji options for voting
const VALID_REACTIONS = ['🔥', '😂', '😱', '🥶', '👑'];

class TruthLiveGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Player management  (socketId → player object)
    this.players = new Map();
    this.state = 'waiting'; // waiting | answering | voting | roundEnd | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Turn state
    this.turnOrder = [];
    this.turnIndex = -1;
    this.roundNum = 0;
    this.maxRounds = 3;
    this.currentPlayer = null;      // socketId of the player in the hot seat
    this.currentQuestion = null;     // { text, category, heat }
    this.currentAnswer = null;       // string — hot-seat player's answer
    this.heatLevel = 2;             // 1 = mild, 2 = spicy, 3 = extreme

    // Reactions for current turn  (voterId → emoji)
    this.reactions = new Map();

    // Used-question tracker to avoid repeats within a session
    this.usedQuestions = new Set();

    // Timers
    this.answerDuration = 30;  // seconds
    this.voteDuration = 15;    // seconds
    this.answerTimer = null;
    this.voteTimer = null;
    this.turnStartTime = null;

    // Reconnect
    this.disconnectedPlayers = new Map(); // sessionId → held data
  }

  // --------------------------------------------------
  // Player management (mirrors scribble Game)
  // --------------------------------------------------

  addPlayer(socketId, name, sessionId) {
    const avatarColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F0B27A', '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2'
    ];
    const color = avatarColors[this.players.size % avatarColors.length];

    if (!this.owner || !this.players.has(this.owner)) {
      this.owner = socketId;
      this.ownerSessionId = sessionId || null;
    }

    this.players.set(socketId, {
      name,
      score: 0,
      avatar: color,
      isHotSeat: false,
      hasVoted: false,
      sessionId: sessionId || null
    });

    return this.players.get(socketId);
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.reactions.delete(socketId);
    this.turnOrder = this.turnOrder.filter(id => id !== socketId);

    if (this.owner === socketId) {
      const remaining = [...this.players.keys()];
      this.owner = remaining.length > 0 ? remaining[0] : null;
      if (this.owner) {
        const ownerPlayer = this.players.get(this.owner);
        this.ownerSessionId = ownerPlayer ? ownerPlayer.sessionId : null;
      } else {
        this.ownerSessionId = null;
      }
    }
  }

  holdPlayerSeat(socketId) {
    const player = this.players.get(socketId);
    if (!player || !player.sessionId) return null;

    const held = {
      name: player.name,
      score: player.score,
      avatar: player.avatar,
      sessionId: player.sessionId,
      wasOwner: this.owner === socketId,
      wasHotSeat: this.currentPlayer === socketId,
      hadVoted: this.reactions.has(socketId)
    };

    this.disconnectedPlayers.set(player.sessionId, held);
    return held;
  }

  reconnectPlayer(newSocketId, sessionId) {
    const held = this.disconnectedPlayers.get(sessionId);
    if (!held) return null;
    this.disconnectedPlayers.delete(sessionId);

    // Clean up stale references
    for (const [oldId, p] of this.players) {
      if (p.sessionId === sessionId) {
        this.turnOrder = this.turnOrder.map(id => id === oldId ? newSocketId : id);
        if (this.currentPlayer === oldId) this.currentPlayer = newSocketId;
        if (this.owner === oldId) this.owner = newSocketId;
        // Migrate reaction
        if (this.reactions.has(oldId)) {
          this.reactions.set(newSocketId, this.reactions.get(oldId));
          this.reactions.delete(oldId);
        }
        this.players.delete(oldId);
        break;
      }
    }

    this.players.set(newSocketId, {
      name: held.name,
      score: held.score,
      avatar: held.avatar,
      isHotSeat: this.currentPlayer === newSocketId,
      hasVoted: this.reactions.has(newSocketId),
      sessionId
    });

    if (held.wasOwner || this.ownerSessionId === sessionId) {
      this.owner = newSocketId;
      this.ownerSessionId = sessionId;
    }

    if (!this.turnOrder.includes(newSocketId) && this.state !== 'waiting') {
      this.turnOrder.push(newSocketId);
    }

    return held;
  }

  hasDisconnectedPlayer(sessionId) {
    return this.disconnectedPlayers.has(sessionId);
  }

  isOwner(socketId) {
    return this.owner === socketId;
  }

  getPlayerList() {
    const list = [];
    this.players.forEach((player, id) => {
      list.push({
        id,
        name: player.name,
        score: player.score,
        avatar: player.avatar,
        isHotSeat: player.isHotSeat,
        hasVoted: player.hasVoted,
        isOwner: id === this.owner,
        disconnected: false
      });
    });
    // Include disconnected players so the UI can show them as ghosted
    this.disconnectedPlayers.forEach((held, sessionId) => {
      list.push({
        id: sessionId,
        name: held.name,
        score: held.score,
        avatar: held.avatar || '#888',
        isHotSeat: false,
        hasVoted: false,
        isOwner: false,
        disconnected: true
      });
    });
    return list.sort((a, b) => b.score - a.score);
  }

  canStart() {
    return this.players.size >= 2 && this.state === 'waiting';
  }

  getRemainingTime() {
    if (!this.turnStartTime) return 0;
    const dur = this.state === 'answering' ? this.answerDuration : this.voteDuration;
    const elapsed = (Date.now() - this.turnStartTime) / 1000;
    return Math.max(0, Math.round(dur - elapsed));
  }

  // --------------------------------------------------
  // Game flow
  // --------------------------------------------------

  startGame() {
    this.roundNum = 0;
    this.turnOrder = [...this.players.keys()];
    this.shuffleTurnOrder();
    this.turnIndex = -1;
    this.usedQuestions.clear();
    this.players.forEach(p => { p.score = 0; p.isHotSeat = false; p.hasVoted = false; });
    return this.nextTurn();
  }

  shuffleTurnOrder() {
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
  }

  /**
   * Advance to the next turn. Returns a turn-event object or a gameOver event.
   */
  nextTurn() {
    this.clearTimers();
    this.currentAnswer = null;
    this.reactions.clear();
    this.players.forEach(p => { p.isHotSeat = false; p.hasVoted = false; });

    this.turnIndex++;

    if (this.turnIndex >= this.turnOrder.length) {
      this.turnIndex = 0;
      this.roundNum++;

      if (this.roundNum >= this.maxRounds) {
        this.state = 'gameOver';
        return { event: 'gameOver', scores: this.getPlayerList() };
      }
    }

    this.currentPlayer = this.turnOrder[this.turnIndex];
    if (!this.players.has(this.currentPlayer)) {
      return this.nextTurn(); // skip disconnected player
    }

    // Pick a non-repeated question
    this.currentQuestion = this.pickQuestion();
    this.players.get(this.currentPlayer).isHotSeat = true;
    this.state = 'answering';
    this.turnStartTime = Date.now();

    return {
      event: 'question',
      hotSeat: this.currentPlayer,
      hotSeatName: this.players.get(this.currentPlayer).name,
      question: this.currentQuestion,
      duration: this.answerDuration,
      roundNum: this.roundNum + 1,
      maxRounds: this.maxRounds
    };
  }

  pickQuestion() {
    // Try up to 50 times to find a non-repeat
    for (let i = 0; i < 50; i++) {
      const q = getRandomQuestion(this.heatLevel);
      if (!this.usedQuestions.has(q.text)) {
        this.usedQuestions.add(q.text);
        return q;
      }
    }
    // Fallback: reset and pick any
    this.usedQuestions.clear();
    return getRandomQuestion(this.heatLevel);
  }

  /**
   * Hot-seat player submits an answer.
   * Returns the answer payload or null if invalid.
   */
  submitAnswer(socketId, answer) {
    if (this.state !== 'answering') return null;
    if (socketId !== this.currentPlayer) return null;
    if (this.currentAnswer) return null; // already answered

    this.currentAnswer = (typeof answer === 'string' ? answer : '').trim().substring(0, 500);
    if (!this.currentAnswer) this.currentAnswer = '(no answer)';

    // Award participation points to answerer
    const player = this.players.get(socketId);
    if (player) player.score += 50;

    // Transition to voting phase
    this.state = 'voting';
    this.turnStartTime = Date.now();

    return {
      event: 'answerRevealed',
      hotSeat: this.currentPlayer,
      hotSeatName: player ? player.name : 'Unknown',
      question: this.currentQuestion,
      answer: this.currentAnswer,
      voteDuration: this.voteDuration
    };
  }

  /**
   * Skip answer (timer expired without an answer).
   */
  skipAnswer() {
    if (this.state !== 'answering') return null;
    this.currentAnswer = '(skipped — too slow! 🐢)';
    this.state = 'voting';
    this.turnStartTime = Date.now();

    const player = this.players.get(this.currentPlayer);
    return {
      event: 'answerRevealed',
      hotSeat: this.currentPlayer,
      hotSeatName: player ? player.name : 'Unknown',
      question: this.currentQuestion,
      answer: this.currentAnswer,
      voteDuration: this.voteDuration
    };
  }

  /**
   * A voter casts an emoji reaction.
   * Returns { valid, allVoted } or null.
   */
  castReaction(socketId, emoji) {
    if (this.state !== 'voting') return null;
    if (socketId === this.currentPlayer) return null;   // hot-seat can't vote
    if (!VALID_REACTIONS.includes(emoji)) return null;
    if (this.reactions.has(socketId)) return null;       // already voted

    this.reactions.set(socketId, emoji);

    const player = this.players.get(socketId);
    if (player) {
      player.hasVoted = true;
      player.score += 10; // participation points for voting
    }

    // Check if all eligible voters voted
    const eligible = [...this.players.keys()].filter(id => id !== this.currentPlayer);
    const allVoted = eligible.every(id => this.reactions.has(id));

    return { valid: true, allVoted, voter: socketId, voterName: player ? player.name : '?', emoji };
  }

  /**
   * Tally reaction results and award bonus to the hot-seat player.
   * Returns summary for the round-end screen.
   */
  tallyReactions() {
    const counts = {};
    VALID_REACTIONS.forEach(e => { counts[e] = 0; });
    this.reactions.forEach(emoji => { counts[emoji] = (counts[emoji] || 0) + 1; });

    const totalVotes = this.reactions.size;

    // Award bonus to hot-seat player based on reactions
    const hotPlayer = this.players.get(this.currentPlayer);
    if (hotPlayer && totalVotes > 0) {
      // 🔥 and 👑 are "positive" — 20 pts each; others are 10 pts
      let bonus = 0;
      this.reactions.forEach(emoji => {
        if (emoji === '🔥' || emoji === '👑') bonus += 20;
        else bonus += 10;
      });
      hotPlayer.score += bonus;
    }

    this.state = 'roundEnd';

    return {
      event: 'roundEnd',
      hotSeat: this.currentPlayer,
      hotSeatName: hotPlayer ? hotPlayer.name : 'Unknown',
      question: this.currentQuestion,
      answer: this.currentAnswer,
      reactions: counts,
      totalVotes,
      scores: this.getPlayerList()
    };
  }

  // --------------------------------------------------
  // Utilities
  // --------------------------------------------------

  clearTimers() {
    if (this.answerTimer) { clearTimeout(this.answerTimer); this.answerTimer = null; }
    if (this.voteTimer) { clearTimeout(this.voteTimer); this.voteTimer = null; }
  }
}

TruthLiveGame.VALID_REACTIONS = VALID_REACTIONS;

module.exports = TruthLiveGame;
