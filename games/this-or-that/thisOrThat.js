// ========================================
// THIS OR THAT — Game Logic Module
// ========================================
//
// State machine: waiting → voting → results → (next round or gameOver)
//
// Each round:
//   1. Server picks a question with two options.
//   2. All players vote (A or B) within the timer.
//   3. Results revealed — majority wins, points awarded.
//   4. Brief pause → next round.
//
// Scoring:
//   - Vote with majority: +100
//   - Vote with minority: +50
//   - Speed bonus (first half of timer): +25
//   - No vote: 0

const { getRandomQuestion } = require('./questions');

class ThisOrThatGame {
  constructor(roomId) {
    this.roomId = roomId;

    // Player management (socketId → player object)
    this.players = new Map();
    this.state = 'waiting'; // waiting | voting | results | gameOver
    this.owner = null;
    this.ownerSessionId = null;

    // Round state
    this.roundNum = 0;
    this.maxRounds = 5;
    this.heatLevel = 2; // 1=mild, 2=spicy, 3=extreme

    // Current question
    this.currentQuestion = null;
    this.votes = new Map(); // socketId → { choice: 'A'|'B', time: ms }
    this.voteStartTime = null;

    // Timers
    this.voteDuration = 15; // seconds
    this.voteTimer = null;
    this.resultTimer = null;

    // Track used questions
    this.usedQuestions = new Set();

    // Reconnect
    this.disconnectedPlayers = new Map(); // sessionId → held data
  }

  // ── Player management ──

  addPlayer(socketId, name, sessionId) {
    const player = {
      id: socketId,
      name: name.substring(0, 20),
      sessionId,
      score: 0,
      streak: 0, // consecutive majority votes
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
    this.votes.delete(socketId);

    // Transfer ownership
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
    return this.state === 'waiting' && this.players.size >= 2;
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
    this.disconnectedPlayers.set(player.sessionId, {
      name: player.name,
      score: player.score,
      streak: player.streak,
    });
    this.players.delete(socketId);
    this.votes.delete(socketId);
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

    // Restore ownership if needed
    if (this.ownerSessionId === sessionId) {
      this.owner = newSocketId;
    }
    return player;
  }

  // ── Game flow ──

  startGame() {
    this.state = 'voting';
    this.roundNum = 0;
    this.usedQuestions.clear();
    this.players.forEach(p => { p.score = 0; p.streak = 0; });
  }

  nextRound() {
    this.roundNum++;
    if (this.roundNum > this.maxRounds) {
      this.state = 'gameOver';
      return null;
    }
    this.state = 'voting';
    this.votes.clear();

    const q = getRandomQuestion(this.heatLevel, this.usedQuestions);
    this.usedQuestions.add(q.optionA + '|' + q.optionB);
    this.currentQuestion = q;
    this.voteStartTime = Date.now();

    return {
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
      question: {
        text: q.text,
        optionA: q.optionA,
        optionB: q.optionB,
        category: q.category,
        heat: q.heat,
      },
      voteDuration: this.voteDuration,
    };
  }

  castVote(socketId, choice) {
    if (this.state !== 'voting') return false;
    if (choice !== 'A' && choice !== 'B') return false;
    if (!this.players.has(socketId)) return false;
    if (this.votes.has(socketId)) return false; // already voted

    this.votes.set(socketId, {
      choice,
      time: Date.now() - this.voteStartTime,
    });
    return true;
  }

  allVoted() {
    return this.votes.size >= this.players.size;
  }

  getVoteProgress() {
    return { voted: this.votes.size, total: this.players.size };
  }

  calculateResults() {
    this.state = 'results';
    const countA = [...this.votes.values()].filter(v => v.choice === 'A').length;
    const countB = [...this.votes.values()].filter(v => v.choice === 'B').length;
    const total = countA + countB;
    const majority = countA >= countB ? 'A' : 'B';
    const isTie = countA === countB;
    const halfTime = (this.voteDuration * 1000) / 2;

    const playerResults = [];
    const voterNames = { A: [], B: [] };

    this.players.forEach((player) => {
      const vote = this.votes.get(player.id);
      let points = 0;
      let speedBonus = false;

      if (vote) {
        voterNames[vote.choice].push(player.name);
        if (isTie) {
          points = 75; // tie = everyone gets middle ground
        } else if (vote.choice === majority) {
          points = 100;
          player.streak++;
        } else {
          points = 50;
          player.streak = 0;
        }
        // Speed bonus
        if (vote.time < halfTime) {
          points += 25;
          speedBonus = true;
        }
        // Streak bonus (3+ consecutive majority votes)
        if (player.streak >= 3) {
          points += 25;
        }
      } else {
        player.streak = 0;
      }

      player.score += points;
      playerResults.push({
        id: player.id,
        name: player.name,
        choice: vote ? vote.choice : null,
        points,
        speedBonus,
        streak: player.streak,
        totalScore: player.score,
      });
    });

    playerResults.sort((a, b) => b.totalScore - a.totalScore);

    return {
      question: this.currentQuestion,
      countA,
      countB,
      percentA: total > 0 ? Math.round((countA / total) * 100) : 0,
      percentB: total > 0 ? Math.round((countB / total) * 100) : 0,
      majority: isTie ? 'tie' : majority,
      voterNames,
      playerResults,
      roundNum: this.roundNum,
      maxRounds: this.maxRounds,
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

  reset() {
    this.state = 'waiting';
    this.roundNum = 0;
    this.currentQuestion = null;
    this.votes.clear();
    this.usedQuestions.clear();
    this.voteTimer = null;
    this.resultTimer = null;
    this.players.forEach(p => { p.score = 0; p.streak = 0; });
  }

  cleanup() {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.voteTimer = null;
    this.resultTimer = null;
  }
}

module.exports = ThisOrThatGame;
